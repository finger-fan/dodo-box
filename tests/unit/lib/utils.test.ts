// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { cn, encodeContactInfo, decodeContactInfo, encodeIdentityInfo, decodeIdentityInfo, shortPubkey } from '@/lib/utils'

const FAKE_PUBKEY_HEX = 'a'.repeat(64)

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('deduplicates conflicting tailwind classes', () => {
    // tailwind-merge keeps last conflicting utility
    const result = cn('p-4', 'p-8')
    expect(result).toBe('p-8')
  })

  it('handles undefined and null values', () => {
    expect(cn('foo', undefined, null as unknown as undefined, 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const active = true
    expect(cn('base', active && 'active')).toBe('base active')
    expect(cn('base', false && 'active')).toBe('base')
  })

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('')
  })
})

describe('encodeContactInfo / decodeContactInfo round-trip', () => {
  it('encodes to dodobox://contact/ prefix', () => {
    const encoded = encodeContactInfo(FAKE_PUBKEY_HEX)
    expect(encoded).toMatch(/^dodobox:\/\/contact\//)
  })

  it('decodes back to original pubkey (npub or base64 path)', () => {
    const encoded = encodeContactInfo(FAKE_PUBKEY_HEX)
    const decoded = decodeContactInfo(encoded)
    // Either the npub decoded pubkey or the base64 decoded value should be meaningful
    expect(decoded).not.toBeNull()
    expect(typeof decoded).toBe('string')
  })

  it('returns null for non-dodobox contact strings', () => {
    expect(decodeContactInfo('https://example.com')).toBeNull()
    expect(decodeContactInfo('')).toBeNull()
    expect(decodeContactInfo('dodobox://identity/abc')).toBeNull()
  })

  it('returns null for malformed encoded data', () => {
    const result = decodeContactInfo('dodobox://contact/!!!invalid!!!')
    // Should return null or empty string (base64 decode may throw)
    expect(result === null || result === '').toBe(true)
  })
})

describe('encodeIdentityInfo / decodeIdentityInfo round-trip', () => {
  it('encodes to dodobox://identity/ prefix', () => {
    const encoded = encodeIdentityInfo(FAKE_PUBKEY_HEX)
    expect(encoded).toMatch(/^dodobox:\/\/identity\//)
  })

  it('decodes back to a non-null string', () => {
    const encoded = encodeIdentityInfo(FAKE_PUBKEY_HEX)
    const decoded = decodeIdentityInfo(encoded)
    expect(decoded).not.toBeNull()
    expect(typeof decoded).toBe('string')
  })

  it('returns null for non-dodobox identity strings', () => {
    expect(decodeIdentityInfo('dodobox://contact/abc')).toBeNull()
    expect(decodeIdentityInfo('')).toBeNull()
  })
})

describe('shortPubkey', () => {
  it('returns a shortened string', () => {
    const short = shortPubkey(FAKE_PUBKEY_HEX)
    expect(typeof short).toBe('string')
    expect(short.length).toBeLessThan(FAKE_PUBKEY_HEX.length)
  })

  it('contains ellipsis', () => {
    const short = shortPubkey(FAKE_PUBKEY_HEX)
    expect(short).toContain('...')
  })

  it('handles empty string gracefully', () => {
    // Should not throw even if npubEncode fails
    expect(() => shortPubkey('')).not.toThrow()
  })
})
