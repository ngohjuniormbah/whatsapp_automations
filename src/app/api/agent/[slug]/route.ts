// ============================================================
// POST /api/agent/{slug} — public storefront AI chat.
//
// Unauthenticated. Drives the "AI Digital Salesperson" on the public
// storefront page. Two request shapes:
//
//   { sessionId, messages: [{role,content}, ...] }  → generate a reply
//   { sessionId, handoff: true }                    → mark lead handed off
//
// The transcript is held by the client and sent each turn (stateless,
// Vercel-friendly). We validate + cap it, ground the reply in the
// account's knowledge base, generate with the account's key or the
// deployment-wide Gemini key, log a lead, and return the reply text.
//
// No WhatsApp Cloud API is involved anywhere in this path.
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { generateReply } from '@/lib/ai/generate'
import { retrieveKnowledge } from '@/lib/ai/knowledge'
import { logAiUsage } from '@/lib/ai/usage'
import { aiContextMessageLimit } from '@/lib/ai/defaults'
import type { ChatMessage } from '@/lib/ai/types'
import { AiError } from '@/lib/ai/types'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import {
  loadPublishedStorefront,
  loadStorefrontProducts,
  resolvePublicAiConfig,
} from '@/lib/storefront/config'
import { buildStorefrontSystemPrompt } from '@/lib/storefront/prompt'

// Bound a single message so one request can't smuggle a huge payload
// into the model on the shared key.
const MAX_CONTENT_CHARS = 4000

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Validate + normalize the client transcript into ChatMessage[]. */
function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  const out: ChatMessage[] = []
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue
    const role = (m as { role?: unknown }).role
    const content = (m as { content?: unknown }).content
    if (role !== 'user' && role !== 'assistant') continue
    if (typeof content !== 'string') continue
    const trimmed = content.trim()
    if (!trimmed) continue
    out.push({ role, content: trimmed.slice(0, MAX_CONTENT_CHARS) })
  }
  // Keep only the most recent turns — the model's context window and the
  // owner's token budget don't need the whole history.
  return out.slice(-aiContextMessageLimit())
}

function latestUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return ''
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params

    // Per-IP throttle first — cheapest gate, and it protects the shared
    // key before we touch the DB or the model.
    const ipLimit = checkRateLimit(
      `storefront-chat-ip:${clientIp(request)}`,
      RATE_LIMITS.storefrontChatIp,
    )
    if (!ipLimit.success) return rateLimitResponse(ipLimit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const sessionId =
      typeof body.session_id === 'string' ? body.session_id.slice(0, 100) : ''
    if (!sessionId) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }

    const db = supabaseAdmin()
    const storefront = await loadPublishedStorefront(db, slug)
    if (!storefront) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    }

    // Handoff ping: the visitor tapped "Order on WhatsApp". Just mark the
    // lead — no generation.
    if (body.handoff === true) {
      await db.from('storefront_leads').upsert(
        {
          account_id: storefront.accountId,
          storefront_id: storefront.id,
          session_id: sessionId,
          handed_off: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'storefront_id,session_id' },
      )
      return NextResponse.json({ ok: true })
    }

    const messages = parseMessages(body.messages)
    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'messages is required' },
        { status: 400 },
      )
    }

    // Per-storefront throttle — bounds one business's total draw on the
    // shared key across all its visitors.
    const acctLimit = checkRateLimit(
      `storefront-chat-account:${storefront.accountId}`,
      RATE_LIMITS.storefrontChatAccount,
    )
    if (!acctLimit.success) {
      return NextResponse.json(
        {
          error:
            "We're getting a lot of messages right now — please try again in a moment.",
        },
        { status: 429 },
      )
    }

    const config = await resolvePublicAiConfig(db, storefront.accountId)
    if (!config) {
      return NextResponse.json(
        {
          error:
            'This shop is not available for chat right now. Please try again later.',
          code: 'agent_unavailable',
        },
        { status: 503 },
      )
    }

    const [knowledge, products] = await Promise.all([
      retrieveKnowledge(db, storefront.accountId, config, latestUserText(messages)),
      loadStorefrontProducts(db, storefront.id),
    ])

    const systemPrompt = buildStorefrontSystemPrompt({
      storefront,
      businessContext: config.systemPrompt,
      products,
      knowledge,
    })

    let reply: string
    let usage
    try {
      const result = await generateReply({ config, systemPrompt, messages })
      reply = result.text
      usage = result.usage
    } catch (err) {
      const status = err instanceof AiError ? 502 : 500
      console.error('[storefront chat] generation failed:', err)
      return NextResponse.json(
        {
          error:
            "Sorry, I couldn't respond just now. Please try again, or use the WhatsApp button to reach us.",
        },
        { status },
      )
    }

    // Record spend (best-effort; never throws). conversation_id is null —
    // storefront chats aren't inbox conversations.
    void logAiUsage(db, {
      accountId: storefront.accountId,
      conversationId: null,
      mode: 'draft',
      provider: config.provider,
      model: config.model,
      usage,
    })

    // Upsert the lead so the owner sees the engagement.
    const userTurns = messages.filter((m) => m.role === 'user').length
    void db
      .from('storefront_leads')
      .upsert(
        {
          account_id: storefront.accountId,
          storefront_id: storefront.id,
          session_id: sessionId,
          last_message: latestUserText(messages).slice(0, 500),
          message_count: userTurns,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'storefront_id,session_id' },
      )
      .then(({ error }) => {
        if (error) console.error('[storefront chat] lead upsert failed:', error)
      })

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[storefront chat] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
