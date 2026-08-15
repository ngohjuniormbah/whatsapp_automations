import { describe, it, expect } from 'vitest'
import {
  normalizeWaPhone,
  buildOrderSummary,
  buildWaMeLink,
  formatFcfa,
  buildCartOrderSummary,
  buildBookingSummary,
} from './handoff'

describe('normalizeWaPhone', () => {
  it('strips +, spaces, dashes and parens', () => {
    expect(normalizeWaPhone('+237 677-00 (11) 99')).toBe('237677001199')
    expect(normalizeWaPhone('237 677 000 111')).toBe('237677000111')
  })
  it('returns empty for nullish/garbage', () => {
    expect(normalizeWaPhone(null)).toBe('')
    expect(normalizeWaPhone('')).toBe('')
    expect(normalizeWaPhone('abc')).toBe('')
  })
})

describe('buildWaMeLink', () => {
  it('builds an encoded wa.me link', () => {
    const link = buildWaMeLink({
      ownerWhatsapp: '+237677000111',
      text: 'Hello & welcome',
    })
    expect(link).toBe('https://wa.me/237677000111?text=Hello%20%26%20welcome')
  })
  it('returns null without a usable number', () => {
    expect(buildWaMeLink({ ownerWhatsapp: '', text: 'hi' })).toBeNull()
    expect(buildWaMeLink({ ownerWhatsapp: null, text: 'hi' })).toBeNull()
  })
})

describe('buildOrderSummary', () => {
  it('includes the business name and recent buyer turns', () => {
    const summary = buildOrderSummary({
      businessName: 'Mvog Shop',
      messages: [
        { role: 'assistant', content: 'Bonjour!' },
        { role: 'user', content: 'I want 2 red dresses' },
        { role: 'assistant', content: 'Great, size?' },
        { role: 'user', content: 'Size M' },
      ],
    })
    expect(summary).toContain('Mvog Shop')
    expect(summary).toContain('I want 2 red dresses')
    expect(summary).toContain('Size M')
  })

  it('falls back when there are no buyer turns', () => {
    const summary = buildOrderSummary({
      businessName: 'Shop',
      messages: [{ role: 'assistant', content: 'Hi' }],
    })
    expect(summary).toContain('Shop')
    expect(summary.toLowerCase()).toContain('question')
  })

  it('keeps only the most recent turns', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      content: `msg-${i}`,
    }))
    const summary = buildOrderSummary({ businessName: 'S', messages, maxTurns: 3 })
    expect(summary).toContain('msg-9')
    expect(summary).toContain('msg-7')
    expect(summary).not.toContain('msg-6')
  })
})

describe('formatFcfa', () => {
  it('formats whole amounts with grouping and the FCFA suffix', () => {
    expect(formatFcfa(18000)).toBe('18 000 FCFA')
    expect(formatFcfa(1000)).toBe('1 000 FCFA')
    expect(formatFcfa(500)).toBe('500 FCFA')
  })
  it('never goes negative and rounds', () => {
    expect(formatFcfa(-5)).toBe('0 FCFA')
    expect(formatFcfa(999.6)).toBe('1 000 FCFA')
  })
})

describe('buildCartOrderSummary', () => {
  it('lists items with quantities, line prices and a total', () => {
    const out = buildCartOrderSummary({
      businessName: 'Mvog Shop',
      items: [
        { name: 'Robe rouge', priceFcfa: 18000, quantity: 2 },
        { name: 'Sac', priceFcfa: 12000, quantity: 1 },
      ],
    })
    expect(out).toContain('Mvog Shop')
    expect(out).toContain('2 × Robe rouge — 36 000 FCFA')
    expect(out).toContain('1 × Sac — 12 000 FCFA')
    expect(out).toContain('Total: 48 000 FCFA')
  })

  it('handles a zero (ask) price without a bogus total line', () => {
    const out = buildCartOrderSummary({
      businessName: 'Shop',
      items: [{ name: 'Custom order', priceFcfa: 0, quantity: 1 }],
    })
    expect(out).toContain('Custom order — (price to confirm)')
    expect(out).not.toContain('Total:')
  })

  it('includes the customer contact line when provided', () => {
    const out = buildCartOrderSummary({
      businessName: 'Shop',
      items: [{ name: 'Sac', priceFcfa: 12000, quantity: 1 }],
      customerName: 'Marie',
      customerPhone: '677000111',
    })
    expect(out).toContain('From: Marie (677000111)')
  })
})

describe('buildBookingSummary', () => {
  it('formats a booking with service, time and contact', () => {
    const out = buildBookingSummary({
      businessName: 'Salon Belle',
      serviceName: 'Coupe femme',
      when: '2026-08-20 14:30',
      customerName: 'Aïcha',
      customerPhone: '699000222',
      priceFcfa: 5000,
    })
    expect(out).toContain('Salon Belle')
    expect(out).toContain('Coupe femme — 5 000 FCFA')
    expect(out).toContain('2026-08-20 14:30')
    expect(out).toContain('From: Aïcha (699000222)')
  })

  it('handles a missing time gracefully', () => {
    const out = buildBookingSummary({
      businessName: 'Salon',
      serviceName: 'Manucure',
      when: '',
    })
    expect(out).toContain('please suggest a time')
  })
})
