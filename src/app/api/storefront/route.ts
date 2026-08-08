// ============================================================
// GET /api/storefront          — read this account's storefront + status
// PUT /api/storefront  (admin) — create/update the storefront
//
// The public sales page (yourapp.com/<slug>) is configured here.
// ============================================================

import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { isValidSlug } from '@/lib/storefront/slug'
import { normalizeWaPhone } from '@/lib/storefront/handoff'
import {
  loadStorefrontForAccount,
  hasGlobalGeminiKey,
} from '@/lib/storefront/config'
import { loadAiConfig } from '@/lib/ai/config'

const CLOSE_MODES = ['whatsapp', 'momo', 'both'] as const

function bad(message: string, code?: string) {
  return NextResponse.json({ error: message, code }, { status: 400 })
}

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const storefront = await loadStorefrontForAccount(supabase, accountId)

    // The agent works when either the account has its own AI key OR the
    // deployment has a global Gemini key. Surface both so the UI can warn
    // the owner if neither is set.
    const accountAiConfig = await loadAiConfig(supabase, accountId, {
      requireActive: false,
    })

    return NextResponse.json({
      storefront,
      ai: {
        has_account_key: Boolean(accountAiConfig),
        has_global_key: hasGlobalGeminiKey(),
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(
      `storefront-config:${userId}`,
      RATE_LIMITS.adminAction,
    )
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return bad('Invalid request body')

    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    if (!isValidSlug(slug)) {
      return bad(
        'Link must be 3–40 characters: lowercase letters, numbers and hyphens only.',
        'invalid_slug',
      )
    }

    const displayName =
      typeof body.display_name === 'string' ? body.display_name.trim() : ''
    if (!displayName) return bad('Business name is required')

    const closeMode =
      typeof body.close_mode === 'string' &&
      (CLOSE_MODES as readonly string[]).includes(body.close_mode)
        ? body.close_mode
        : 'both'

    const ownerWhatsapp = normalizeWaPhone(
      typeof body.owner_whatsapp === 'string' ? body.owner_whatsapp : '',
    )
    // A WhatsApp/both close needs a number to hand off to.
    if (closeMode !== 'momo' && !ownerWhatsapp) {
      return bad(
        'A WhatsApp number is required for the WhatsApp handoff. Use international digits, e.g. 2376XXXXXXXX.',
        'missing_whatsapp',
      )
    }
    const momoInstructions =
      typeof body.momo_instructions === 'string'
        ? body.momo_instructions.trim() || null
        : null
    if (closeMode !== 'whatsapp' && !momoInstructions) {
      return bad(
        'Mobile Money instructions are required for the Mobile Money option.',
        'missing_momo',
      )
    }

    const row = {
      account_id: accountId,
      created_by: userId,
      slug,
      display_name: displayName,
      tagline:
        typeof body.tagline === 'string' ? body.tagline.trim() || null : null,
      owner_whatsapp: ownerWhatsapp || null,
      greeting:
        typeof body.greeting === 'string' ? body.greeting.trim() || null : null,
      momo_instructions: momoInstructions,
      close_mode: closeMode,
      is_published: body.is_published === true,
    }

    const { error } = await supabase
      .from('storefronts')
      .upsert(row, { onConflict: 'account_id' })

    if (error) {
      // 23505 = unique violation. The only user-caused one is a taken slug
      // (account_id conflict is handled by the upsert).
      if (error.code === '23505') {
        return bad('That link is already taken — try another.', 'slug_taken')
      }
      console.error('[storefront PUT] upsert error:', error)
      return NextResponse.json(
        { error: 'Failed to save storefront' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
