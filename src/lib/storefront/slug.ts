// ============================================================
// Storefront slug rules — the public URL segment (yourapp.com/<slug>).
//
// Lowercase letters, digits, and single interior hyphens; 3–40 chars;
// no leading/trailing hyphen. Mirrors the CHECK constraint in migration
// 038 so app-level validation and the DB agree.
// ============================================================

export const SLUG_MIN = 3
export const SLUG_MAX = 40

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

// Reserved single-segment paths that must never be claimed as a slug,
// or a storefront would shadow (or be shadowed by) a real app route.
export const RESERVED_SLUGS = new Set([
  'api',
  'dashboard',
  'inbox',
  'contacts',
  'pipelines',
  'broadcasts',
  'automations',
  'flows',
  'agents',
  'notifications',
  'settings',
  'storefront',
  'login',
  'signup',
  'logout',
  'forgot-password',
  'join',
  'admin',
  'account',
  'icon',
  'favicon',
  'robots',
  'sitemap',
  'public',
  'static',
  '_next',
])

/** True when `slug` is a syntactically valid, non-reserved storefront slug. */
export function isValidSlug(slug: string): boolean {
  return (
    typeof slug === 'string' &&
    slug.length >= SLUG_MIN &&
    slug.length <= SLUG_MAX &&
    SLUG_RE.test(slug) &&
    !RESERVED_SLUGS.has(slug)
  )
}

/**
 * Best-effort suggestion from a business name: lowercase, spaces and
 * illegal characters → hyphens, collapse repeats, trim to length. May
 * still be empty or reserved — callers should verify with `isValidSlug`
 * and let the user edit.
 */
export function suggestSlug(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents (Cameroon FR names)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-$/, '')
}
