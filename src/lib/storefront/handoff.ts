// ============================================================
// wa.me handoff — turn a storefront chat into a pre-filled message on
// the owner's ordinary WhatsApp. No WhatsApp Cloud API involved; this
// is just a deep link the buyer taps, which is why the storefront needs
// no Meta approval to run.
// ============================================================

import type { ChatMessage } from '@/lib/ai/types'

/**
 * Normalize a phone number to the digits wa.me expects: strip the
 * leading '+', spaces, dashes, and parens. Returns '' when nothing
 * usable remains (so callers can hide the button).
 */
export function normalizeWaPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/[^\d]/g, '')
}

/**
 * Build an order summary from the transcript for the wa.me prefilled
 * text. Keeps the most recent buyer turns so the owner opens WhatsApp
 * already knowing what the customer wants. Bounded so the deep link URL
 * stays well under practical length limits.
 */
export function buildOrderSummary(args: {
  businessName: string
  messages: ChatMessage[]
  maxTurns?: number
}): string {
  const { businessName, messages, maxTurns = 6 } = args
  const buyerTurns = messages
    .filter((m) => m.role === 'user' && m.content.trim())
    .slice(-maxTurns)
    .map((m) => `• ${m.content.trim()}`)

  const header = `Hello ${businessName}! I'm coming from your online shop and I'd like to order:`
  const body =
    buyerTurns.length > 0
      ? buyerTurns.join('\n')
      : '• (I have a question about your products)'
  return `${header}\n\n${body}`
}

/**
 * Build the full wa.me link. Returns null when there's no usable owner
 * number, so the UI can fall back to MoMo-only. The text is URL-encoded.
 */
export function buildWaMeLink(args: {
  ownerWhatsapp: string | null | undefined
  text: string
}): string | null {
  const phone = normalizeWaPhone(args.ownerWhatsapp)
  if (!phone) return null
  return `https://wa.me/${phone}?text=${encodeURIComponent(args.text)}`
}
