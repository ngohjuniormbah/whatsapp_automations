import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import {
  loadPublishedStorefront,
  loadStorefrontProducts,
} from '@/lib/storefront/config'
import { StorefrontApp } from '@/components/storefront/storefront-app'

// The storefront reads a per-request slug against the service role, so it
// can never be statically generated.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shop: string }>
}): Promise<Metadata> {
  const { shop } = await params
  const storefront = await loadPublishedStorefront(supabaseAdmin(), shop)
  if (!storefront) return { title: 'Shop not found' }
  return {
    title: storefront.displayName,
    description:
      storefront.tagline ?? `Chat with ${storefront.displayName} and order online.`,
    // A storefront is meant to be shared/advertised, so allow indexing
    // (the app-wide default is noindex).
    robots: { index: true, follow: true },
  }
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ shop: string }>
}) {
  const { shop } = await params
  const db = supabaseAdmin()
  const storefront = await loadPublishedStorefront(db, shop)
  if (!storefront) notFound()

  const products = await loadStorefrontProducts(db, storefront.id)

  return (
    <StorefrontApp
      slug={storefront.slug}
      displayName={storefront.displayName}
      tagline={storefront.tagline}
      greeting={storefront.greeting}
      ownerWhatsapp={storefront.ownerWhatsapp}
      closeMode={storefront.closeMode}
      products={products}
    />
  )
}
