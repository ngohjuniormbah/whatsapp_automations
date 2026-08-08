import { describe, it, expect } from 'vitest'
import { isValidSlug, suggestSlug } from './slug'

describe('isValidSlug', () => {
  it('accepts valid slugs', () => {
    expect(isValidSlug('mvog-ada')).toBe(true)
    expect(isValidSlug('shop123')).toBe(true)
    expect(isValidSlug('a1b')).toBe(true)
  })

  it('rejects too short / too long', () => {
    expect(isValidSlug('ab')).toBe(false)
    expect(isValidSlug('a'.repeat(41))).toBe(false)
  })

  it('rejects leading/trailing hyphens and uppercase', () => {
    expect(isValidSlug('-shop')).toBe(false)
    expect(isValidSlug('shop-')).toBe(false)
    expect(isValidSlug('Shop')).toBe(false)
    expect(isValidSlug('shop name')).toBe(false)
  })

  it('rejects reserved words that would shadow app routes', () => {
    expect(isValidSlug('api')).toBe(false)
    expect(isValidSlug('dashboard')).toBe(false)
    expect(isValidSlug('settings')).toBe(false)
    expect(isValidSlug('login')).toBe(false)
  })
})

describe('suggestSlug', () => {
  it('slugifies a business name', () => {
    expect(suggestSlug('Mvog-Ada Boutique')).toBe('mvog-ada-boutique')
    expect(suggestSlug('Chez Amélie')).toBe('chez-amelie')
    expect(suggestSlug('  Fresh   Fashion!!  ')).toBe('fresh-fashion')
  })

  it('caps at the max length without a trailing hyphen', () => {
    const out = suggestSlug('a '.repeat(60))
    expect(out.length).toBeLessThanOrEqual(40)
    expect(out.endsWith('-')).toBe(false)
  })
})
