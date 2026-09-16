import { describe, expect, it } from 'vitest'
import { normalizeBusinessWebsiteUrl } from '@/lib/business-listing-website'

describe('normalizeBusinessWebsiteUrl', () => {
  it('prepends https:// to www.TheVenusBodyShop.com without changing the host', () => {
    expect(normalizeBusinessWebsiteUrl('www.TheVenusBodyShop.com')).toBe(
      'https://www.TheVenusBodyShop.com'
    )
  })

  it('preserves existing https:// URLs', () => {
    expect(
      normalizeBusinessWebsiteUrl('https://www.TheVenusBodyShop.com/menu')
    ).toBe('https://www.TheVenusBodyShop.com/menu')
  })

  it('preserves existing http:// URLs', () => {
    expect(normalizeBusinessWebsiteUrl('http://example.com')).toBe(
      'http://example.com'
    )
  })

  it('prepends https:// to a bare valid domain', () => {
    expect(normalizeBusinessWebsiteUrl('example.com')).toBe(
      'https://example.com'
    )
  })

  it('rejects javascript: and other unsafe schemes', () => {
    expect(normalizeBusinessWebsiteUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeBusinessWebsiteUrl('JAVASCRIPT:alert(1)')).toBeNull()
    expect(normalizeBusinessWebsiteUrl('data:text/html,oops')).toBeNull()
    expect(normalizeBusinessWebsiteUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeBusinessWebsiteUrl('vbscript:msgbox(1)')).toBeNull()
    expect(normalizeBusinessWebsiteUrl('mailto:hello@example.com')).toBeNull()
  })

  it('rejects malformed or relative values that would become in-app routes', () => {
    expect(normalizeBusinessWebsiteUrl('')).toBeNull()
    expect(normalizeBusinessWebsiteUrl('   ')).toBeNull()
    expect(normalizeBusinessWebsiteUrl(null)).toBeNull()
    expect(normalizeBusinessWebsiteUrl('/business')).toBeNull()
    expect(normalizeBusinessWebsiteUrl('not a domain')).toBeNull()
    expect(normalizeBusinessWebsiteUrl('localhost')).toBeNull()
    expect(normalizeBusinessWebsiteUrl('http://127.0.0.1')).toBeNull()
    expect(normalizeBusinessWebsiteUrl('https://user:pass@example.com')).toBeNull()
  })
})
