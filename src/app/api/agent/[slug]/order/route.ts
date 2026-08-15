// ============================================================
// POST /api/agent/{slug}/order — capture an order or booking (public)
//
// Persists a durable record (customer name/phone + items or service +
// time) so the business never loses a sale, then returns the WhatsApp
// deep link the shopper is sent to. Prices are recomputed server-side
// from the catalogue — the client is never trusted on price.
//
// Body:
//   order:   { session_id, kind:'order',   customer_name, customer_phone,
//              items:[{id, quantity}], note? }
//   booking: { session_id, kind:'booking', customer_name, customer_phone,
//              service_id, preferred_time, note? }
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadPublishedStorefront } from '@/lib/storefront/config'
import {
  buildCartOrderSummary,
  buildBookingSummary,
  buildWaMeLink,
  type OrderItem,
} from '@/lib/storefront/handoff'

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

const str = (v: unknown, max = 300) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params

    const ipLimit = checkRateLimit(
      `storefront-order-ip:${clientIp(request)}`,
      RATE_LIMITS.storefrontChatIp,
    )
    if (!ipLimit.success) return rateLimitResponse(ipLimit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const db = supabaseAdmin()
    const storefront = await loadPublishedStorefront(db, slug)
    if (!storefront) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    }

    const acctLimit = checkRateLimit(
      `storefront-order-account:${storefront.accountId}`,
      RATE_LIMITS.storefrontChatAccount,
    )
    if (!acctLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests right now — please try again in a moment.' },
        { status: 429 },
      )
    }

    const kind = body.kind === 'booking' ? 'booking' : 'order'
    const customerName = str(body.customer_name, 120)
    const customerPhone = str(body.customer_phone, 40)
    const note = str(body.note, 500)

    let whatsappText: string
    const record: Record<string, unknown> = {
      account_id: storefront.accountId,
      storefront_id: storefront.id,
      kind,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      note: note || null,
    }

    if (kind === 'order') {
      const rawItems = Array.isArray(body.items) ? body.items : []
      const wanted = new Map<string, number>()
      for (const it of rawItems) {
        const id = str((it as { id?: unknown })?.id, 64)
        const qty = Math.max(1, Math.floor(Number((it as { quantity?: unknown })?.quantity) || 0))
        if (id && qty > 0) wanted.set(id, (wanted.get(id) ?? 0) + qty)
      }
      if (wanted.size === 0) {
        return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 })
      }

      // Recompute from the catalogue — never trust client prices.
      const { data: rows } = await db
        .from('storefront_products')
        .select('id, name, price_fcfa')
        .eq('storefront_id', storefront.id)
        .eq('is_available', true)
        .eq('kind', 'product')
        .in('id', Array.from(wanted.keys()))

      const items: OrderItem[] = (rows ?? []).map((r) => ({
        name: r.name as string,
        priceFcfa: (r.price_fcfa as number) ?? 0,
        quantity: wanted.get(r.id as string) ?? 1,
      }))
      if (items.length === 0) {
        return NextResponse.json(
          { error: 'These items are no longer available.' },
          { status: 400 },
        )
      }
      const total = items.reduce((s, it) => s + it.priceFcfa * it.quantity, 0)
      record.items = items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        price_fcfa: it.priceFcfa,
      }))
      record.total_fcfa = total
      whatsappText = buildCartOrderSummary({
        businessName: storefront.displayName,
        items,
        customerName,
        customerPhone,
        note,
      })
    } else {
      // Booking.
      const serviceId = str(body.service_id, 64)
      const when = str(body.preferred_time, 120)
      if (!serviceId) {
        return NextResponse.json({ error: 'Please choose a service.' }, { status: 400 })
      }
      const { data: svc } = await db
        .from('storefront_products')
        .select('id, name, price_fcfa')
        .eq('storefront_id', storefront.id)
        .eq('id', serviceId)
        .eq('kind', 'service')
        .maybeSingle()
      if (!svc) {
        return NextResponse.json(
          { error: 'That service is no longer available.' },
          { status: 400 },
        )
      }
      record.service_name = svc.name
      record.preferred_time = when || null
      record.total_fcfa = (svc.price_fcfa as number) ?? 0
      whatsappText = buildBookingSummary({
        businessName: storefront.displayName,
        serviceName: svc.name as string,
        when,
        customerName,
        customerPhone,
        priceFcfa: (svc.price_fcfa as number) ?? 0,
        note,
      })
    }

    const { data: inserted, error } = await db
      .from('storefront_orders')
      .insert(record)
      .select('id')
      .single()
    if (error) {
      console.error('[storefront order] insert failed:', error)
      return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 })
    }

    const whatsappUrl = buildWaMeLink({
      ownerWhatsapp: storefront.ownerWhatsapp,
      text: whatsappText,
    })

    return NextResponse.json({
      ok: true,
      order_id: inserted.id,
      whatsapp_url: whatsappUrl,
      whatsapp_text: whatsappText,
    })
  } catch (err) {
    console.error('[storefront order] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
