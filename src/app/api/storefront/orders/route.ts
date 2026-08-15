// ============================================================
// GET   /api/storefront/orders          — list orders & bookings
// PATCH /api/storefront/orders  (agent) — update a record's status
// ============================================================

import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'

const STATUSES = ['new', 'confirmed', 'completed', 'cancelled'] as const

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('storefront_orders')
      .select(
        'id, kind, customer_name, customer_phone, items, service_name, preferred_time, note, total_fcfa, status, created_at',
      )
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[storefront/orders GET] error:', error)
      return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
    }
    return NextResponse.json({ orders: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const body = await request.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    const status = typeof body?.status === 'string' ? body.status : ''
    if (!id || !(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: 'id and a valid status are required' },
        { status: 400 },
      )
    }
    const { error } = await supabase
      .from('storefront_orders')
      .update({ status })
      .eq('id', id)
      .eq('account_id', accountId)
    if (error) {
      console.error('[storefront/orders PATCH] error:', error)
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
