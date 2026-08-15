// ============================================================
// GET  /api/storefront/products          — list this account's products
// POST /api/storefront/products  (admin) — add a product
//
// Products belong to the account's storefront (create the storefront
// first via PUT /api/storefront). Image upload happens client-side to
// the `storefront-products` bucket; this route stores the resulting URL.
// ============================================================

import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadStorefrontForAccount } from '@/lib/storefront/config'

const SELECT =
  'id, name, description, price_fcfa, image_url, image_path, is_available, position, created_at'

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function parsePrice(v: unknown): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('storefront_products')
      .select(SELECT)
      .eq('account_id', accountId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[storefront/products GET] error:', error)
      return NextResponse.json(
        { error: 'Failed to load products' },
        { status: 500 },
      )
    }
    return NextResponse.json({ products: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(
      `storefront-product:${userId}`,
      RATE_LIMITS.adminAction,
    )
    if (!limit.success) return rateLimitResponse(limit)

    const storefront = await loadStorefrontForAccount(supabase, accountId)
    if (!storefront) {
      return bad('Create your storefront first, then add products.')
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return bad('Invalid request body')

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return bad('Product name is required')

    // New products go to the end of the grid.
    const { data: last } = await supabase
      .from('storefront_products')
      .select('position')
      .eq('account_id', accountId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    const position = (last?.position ?? -1) + 1

    const { data, error } = await supabase
      .from('storefront_products')
      .insert({
        account_id: accountId,
        storefront_id: storefront.id,
        name,
        description:
          typeof body.description === 'string'
            ? body.description.trim() || null
            : null,
        price_fcfa: parsePrice(body.price_fcfa),
        image_url:
          typeof body.image_url === 'string' ? body.image_url.trim() || null : null,
        image_path:
          typeof body.image_path === 'string'
            ? body.image_path.trim() || null
            : null,
        is_available: body.is_available !== false,
        position,
      })
      .select(SELECT)
      .single()

    if (error) {
      console.error('[storefront/products POST] error:', error)
      return NextResponse.json(
        { error: 'Failed to add product' },
        { status: 500 },
      )
    }
    return NextResponse.json({ product: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}
