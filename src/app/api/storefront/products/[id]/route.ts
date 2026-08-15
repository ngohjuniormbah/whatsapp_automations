// ============================================================
// PATCH  /api/storefront/products/{id}  (admin) — edit a product
// DELETE /api/storefront/products/{id}  (admin) — remove a product
//
// Account-scoped by RLS + an explicit account_id filter. The product
// image in Storage is cleaned up client-side (best-effort) after a
// successful delete.
// ============================================================

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

const SELECT =
  'id, name, description, price_fcfa, image_url, image_path, is_available, position, created_at'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Only touch fields the client actually sent (partial update).
    const patch: Record<string, unknown> = {}
    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
      patch.name = name
    }
    if ('description' in body)
      patch.description =
        typeof body.description === 'string' ? body.description.trim() || null : null
    if ('price_fcfa' in body) {
      const n = Math.floor(Number(body.price_fcfa))
      patch.price_fcfa = Number.isFinite(n) && n >= 0 ? n : 0
    }
    if ('image_url' in body)
      patch.image_url =
        typeof body.image_url === 'string' ? body.image_url.trim() || null : null
    if ('image_path' in body)
      patch.image_path =
        typeof body.image_path === 'string' ? body.image_path.trim() || null : null
    if ('is_available' in body) patch.is_available = body.is_available === true
    if ('position' in body) {
      const n = Math.floor(Number(body.position))
      if (Number.isFinite(n) && n >= 0) patch.position = n
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('storefront_products')
      .update(patch)
      .eq('id', id)
      .eq('account_id', accountId)
      .select(SELECT)
      .maybeSingle()

    if (error) {
      console.error('[storefront/products PATCH] error:', error)
      return NextResponse.json(
        { error: 'Failed to update product' },
        { status: 500 },
      )
    }
    if (!data) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    return NextResponse.json({ product: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { id } = await params
    const { error } = await supabase
      .from('storefront_products')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId)

    if (error) {
      console.error('[storefront/products DELETE] error:', error)
      return NextResponse.json(
        { error: 'Failed to delete product' },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
