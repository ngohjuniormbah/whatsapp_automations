import { describe, it, expect } from 'vitest'
import { buildStorefrontSystemPrompt } from './prompt'
import type { Storefront } from './config'

function storefront(overrides: Partial<Storefront> = {}): Storefront {
  return {
    id: 'sf1',
    accountId: 'acc1',
    slug: 'shop',
    displayName: 'Mvog Shop',
    tagline: null,
    ownerWhatsapp: '237677000111',
    greeting: null,
    momoInstructions: 'MTN MoMo: 677 000 111',
    closeMode: 'both',
    isPublished: true,
    ...overrides,
  }
}

describe('buildStorefrontSystemPrompt', () => {
  it('sets a Cameroon FR/EN persona and FCFA pricing rule', () => {
    const p = buildStorefrontSystemPrompt({
      storefront: storefront(),
      businessContext: null,
    })
    expect(p).toContain('Mvog Shop')
    expect(p).toContain('Cameroon')
    expect(p).toMatch(/French/)
    expect(p).toContain('FCFA')
  })

  it('whatsapp close mentions the button and not MoMo details', () => {
    const p = buildStorefrontSystemPrompt({
      storefront: storefront({ closeMode: 'whatsapp' }),
      businessContext: null,
    })
    expect(p).toContain('Order on WhatsApp')
  })

  it('momo close includes the payment instructions', () => {
    const p = buildStorefrontSystemPrompt({
      storefront: storefront({ closeMode: 'momo' }),
      businessContext: null,
    })
    expect(p).toContain('MTN MoMo: 677 000 111')
  })

  it('both mode offers both close paths', () => {
    const p = buildStorefrontSystemPrompt({
      storefront: storefront({ closeMode: 'both' }),
      businessContext: null,
    })
    expect(p).toContain('Order on WhatsApp')
    expect(p).toContain('Mobile Money')
  })

  it('embeds the product catalogue with FCFA prices', () => {
    const p = buildStorefrontSystemPrompt({
      storefront: storefront(),
      businessContext: null,
      products: [
        { id: '1', name: 'Robe rouge', description: 'Coton', priceFcfa: 18000, imageUrl: null, isAvailable: true },
        { id: '2', name: 'Sac', description: null, priceFcfa: 0, imageUrl: null, isAvailable: true },
      ],
    })
    expect(p).toContain('Product catalogue')
    expect(p).toContain('Robe rouge: 18 000 FCFA — Coton')
    expect(p).toContain('Sac: price on request')
  })

  it('embeds business context and knowledge excerpts', () => {
    const p = buildStorefrontSystemPrompt({
      storefront: storefront(),
      businessContext: 'We sell shoes in Yaoundé',
      knowledge: ['Nike Air: 45000 FCFA', 'Delivery in Yaoundé: 1000 FCFA'],
    })
    expect(p).toContain('We sell shoes in Yaoundé')
    expect(p).toContain('Nike Air: 45000 FCFA')
    expect(p).toContain('[2] Delivery in Yaoundé: 1000 FCFA')
  })
})
