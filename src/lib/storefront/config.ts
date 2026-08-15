import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAiConfig } from '@/lib/ai/config'
import { AI_PROVIDER_DEFAULT_MODEL } from '@/lib/ai/defaults'
import type { AiConfig } from '@/lib/ai/types'

// ============================================================
// Storefront data access + AI-config resolution for the public agent.
// ============================================================

export type CloseMode = 'whatsapp' | 'momo' | 'both'

export interface Storefront {
  id: string
  accountId: string
  slug: string
  displayName: string
  tagline: string | null
  ownerWhatsapp: string | null
  greeting: string | null
  momoInstructions: string | null
  closeMode: CloseMode
  isPublished: boolean
}

const COLUMNS =
  'id, account_id, slug, display_name, tagline, owner_whatsapp, greeting, momo_instructions, close_mode, is_published'

interface StorefrontRow {
  id: string
  account_id: string
  slug: string
  display_name: string
  tagline: string | null
  owner_whatsapp: string | null
  greeting: string | null
  momo_instructions: string | null
  close_mode: CloseMode
  is_published: boolean
}

function mapRow(row: StorefrontRow): Storefront {
  return {
    id: row.id,
    accountId: row.account_id,
    slug: row.slug,
    displayName: row.display_name,
    tagline: row.tagline,
    ownerWhatsapp: row.owner_whatsapp,
    greeting: row.greeting,
    momoInstructions: row.momo_instructions,
    closeMode: row.close_mode,
    isPublished: row.is_published,
  }
}

/**
 * Look up a published storefront by slug (case-insensitive). Intended
 * for the public route with a service-role client — RLS is bypassed, so
 * we hard-filter `is_published` here. Returns null for unknown or
 * unpublished slugs (the public page then 404s).
 */
export async function loadPublishedStorefront(
  db: SupabaseClient,
  slug: string,
): Promise<Storefront | null> {
  const { data, error } = await db
    .from('storefronts')
    .select(COLUMNS)
    .ilike('slug', slug)
    .eq('is_published', true)
    .maybeSingle()
  if (error || !data) return null
  return mapRow(data as StorefrontRow)
}

export interface Product {
  id: string
  name: string
  description: string | null
  priceFcfa: number
  imageUrl: string | null
  isAvailable: boolean
}

interface ProductRow {
  id: string
  name: string
  description: string | null
  price_fcfa: number
  image_url: string | null
  is_available: boolean
}

/**
 * Load a storefront's available products for the public catalog + AI
 * grounding, ordered by the owner's manual sort. Best-effort: returns []
 * on error so a catalog hiccup never takes down the page or the chat.
 */
export async function loadStorefrontProducts(
  db: SupabaseClient,
  storefrontId: string,
  opts: { availableOnly?: boolean } = {},
): Promise<Product[]> {
  const { availableOnly = true } = opts
  let q = db
    .from('storefront_products')
    .select('id, name, description, price_fcfa, image_url, is_available')
    .eq('storefront_id', storefrontId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (availableOnly) q = q.eq('is_available', true)

  const { data, error } = await q
  if (error || !data) return []
  return (data as ProductRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    priceFcfa: r.price_fcfa,
    imageUrl: r.image_url,
    isAvailable: r.is_available,
  }))
}

/** Load the (single) storefront for an account, any publish state. */
export async function loadStorefrontForAccount(
  db: SupabaseClient,
  accountId: string,
): Promise<Storefront | null> {
  const { data, error } = await db
    .from('storefronts')
    .select(COLUMNS)
    .eq('account_id', accountId)
    .maybeSingle()
  if (error || !data) return null
  return mapRow(data as StorefrontRow)
}

/** True when a global Gemini key is configured for the whole deployment. */
export function hasGlobalGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}

/**
 * Resolve the AI config the public agent should generate with.
 *
 * Priority:
 *   1. The account's own configured provider key (any provider), if set
 *      — respects a business that brought its own key. `is_active` is
 *      NOT required: the storefront is its own on/off switch
 *      (`is_published`), independent of the inbox assistant's master
 *      toggle.
 *   2. The deployment-wide `GEMINI_API_KEY` (the operator's key) — this
 *      is what makes the agent "just work" for every business with no
 *      per-customer AI setup.
 *
 * Returns null when neither is available (the route then tells the
 * visitor the shop is offline).
 */
export async function resolvePublicAiConfig(
  db: SupabaseClient,
  accountId: string,
): Promise<AiConfig | null> {
  const accountConfig = await loadAiConfig(db, accountId, { requireActive: false })
  if (accountConfig) return accountConfig

  const globalKey = process.env.GEMINI_API_KEY?.trim()
  if (!globalKey) return null

  return {
    provider: 'google',
    model: process.env.GEMINI_MODEL?.trim() || AI_PROVIDER_DEFAULT_MODEL.google,
    apiKey: globalKey,
    // Business context comes from the storefront prompt + knowledge base,
    // not this field, so a global-key config carries none of its own.
    systemPrompt: null,
    isActive: true,
    autoReplyEnabled: false,
    autoReplyMaxPerConversation: 0,
    handoffAgentId: null,
    // Global config has no embeddings key → knowledge base uses lexical
    // (keyword) retrieval, which needs no extra credential.
    embeddingsApiKey: null,
  }
}
