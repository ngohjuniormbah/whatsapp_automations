import { describe, it, expect } from 'vitest'
import { normalizeWaPhone, buildOrderSummary, buildWaMeLink } from './handoff'

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
