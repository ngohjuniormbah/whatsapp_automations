// ============================================================
// GET   /api/storefront/leads          — list captured storefront leads
// PATCH /api/storefront/leads  (agent) — update a lead's status
//
// Leads are visitors who chatted with the public sales agent. RLS scopes
// both to the caller's account.
// ============================================================

import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'

const STATUSES = ['new', 'contacted', 'closed'] as const

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('storefront_leads')
      .select(
        'id, session_id, visitor_name, visitor_phone, last_message, message_count, status, handed_off, created_at, updated_at',
      )
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[storefront/leads GET] error:', error)
      return NextResponse.json(
        { error: 'Failed to load leads' },
        { status: 500 },
      )
    }
    return NextResponse.json({ leads: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const id = typeof body.id === 'string' ? body.id : ''
    const status = typeof body.status === 'string' ? body.status : ''
    if (!id || !(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: 'id and a valid status are required' },
        { status: 400 },
      )
    }

    const { error } = await supabase
      .from('storefront_leads')
      .update({ status })
      .eq('id', id)
      .eq('account_id', accountId)

    if (error) {
      console.error('[storefront/leads PATCH] error:', error)
      return NextResponse.json(
        { error: 'Failed to update lead' },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
