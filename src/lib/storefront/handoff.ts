// ============================================================
// wa.me handoff — turn a storefront chat into a pre-filled message on
// the owner's ordinary WhatsApp. No WhatsApp Cloud API involved; this
// is just a deep link the buyer taps, which is why the storefront needs
// no Meta approval to run.
// ============================================================

import type { ChatMessage } from '@/lib/ai/types'

/** Format a whole-FCFA amount with thin spacing, e.g. 18000 → "18 000 FCFA". */
export function formatFcfa(amount: number): string {
  const n = Math.max(0, Math.round(amount || 0))
  return `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} FCFA`
}

/** One line item in a cart order. */
export interface OrderItem {
  name: string
  priceFcfa: number
  quantity: number
}

/**
 * Build the WhatsApp order text from a cart. Lists each item with
 * quantity and line price, then the total. Falls back gracefully when a
 * price is 0 ("ask"). This is what the owner receives when the shopper
 * taps "Order on WhatsApp".
 */
export function buildCartOrderSummary(args: {
  businessName: string
  items: OrderItem[]
  customerName?: string
  customerPhone?: string
  note?: string
}): string {
  const { businessName, items, customerName, customerPhone, note } = args
  const lines = items.map((it) => {
    const qty = Math.max(1, Math.round(it.quantity || 1))
    const price =
      it.priceFcfa > 0
        ? ` — ${formatFcfa(it.priceFcfa * qty)}`
        : ' — (price to confirm)'
    return `• ${qty} × ${it.name}${price}`
  })
  const total = items.reduce(
    (sum, it) => sum + Math.max(0, it.priceFcfa) * Math.max(1, Math.round(it.quantity || 1)),
    0,
  )
  const parts = [
    `Hello ${businessName}! I'd like to order from your online shop:`,
    lines.join('\n'),
  ]
  if (total > 0) parts.push(`Total: ${formatFcfa(total)}`)
  const who = contactLine(customerName, customerPhone)
  if (who) parts.push(who)
  if (note && note.trim()) parts.push(`Note: ${note.trim()}`)
  return parts.join('\n\n')
}

/** "From: Name (phone)" — omitted entirely when neither is provided. */
function contactLine(name?: string, phone?: string): string {
  const n = name?.trim()
  const p = phone?.trim()
  if (n && p) return `From: ${n} (${p})`
  if (n) return `From: ${n}`
  if (p) return `From: ${p}`
  return ''
}

/**
 * Build the WhatsApp text for a service booking / reservation request.
 * The owner confirms the slot back on WhatsApp.
 */
export function buildBookingSummary(args: {
  businessName: string
  serviceName: string
  when: string
  customerName?: string
  customerPhone?: string
  priceFcfa?: number
  note?: string
}): string {
  const { businessName, serviceName, when, customerName, customerPhone, priceFcfa, note } =
    args
  const parts = [
    `Hello ${businessName}! I'd like to book:`,
    `• Service: ${serviceName}` +
      (priceFcfa && priceFcfa > 0 ? ` — ${formatFcfa(priceFcfa)}` : ''),
    `• Preferred time: ${when || '(please suggest a time)'}`,
  ]
  const who = contactLine(customerName, customerPhone)
  if (who) parts.push(who)
  if (note && note.trim()) parts.push(`Note: ${note.trim()}`)
  return parts.join('\n')
}

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
