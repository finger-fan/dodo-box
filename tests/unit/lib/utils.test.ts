// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { cn, decodeContactInfo, encodeIdentityInfo, decodeIdentityInfo, shortPubkey } from '@/lib/utils'

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

describe('decodeContactInfo (legacy backward compat)', () => {
  it('returns null for non-contact strings', () => {
    expect(decodeContactInfo('https://example.com')).toBeNull()
    expect(decodeContactInfo('')).toBeNull()
    expect(decodeContactInfo('dodobox://identity/abc')).toBeNull()
  })

  it('returns null for malformed encoded data', () => {
    const result = decodeContactInfo('dodobox://contact/!!!invalid!!!')
    expect(result === null || result === '').toBe(true)
  })
})

describe('encodeIdentityInfo / decodeIdentityInfo round-trip', () => {
  it('encodes to dodobox://identity/npub1 prefix with 3 dash-separated segments', () => {
    const encoded = encodeIdentityInfo(FAKE_PUBKEY_HEX, 'Alice')
    expect(encoded).toMatch(/^dodobox:\/\/identity\/npub1/)
    const body = encoded.replace('dodobox://identity/npub1', '')
    expect(body.split('-')).toHaveLength(3)
  })

  it('decodes back to { pubkey, nickname }', () => {
    const encoded = encodeIdentityInfo(FAKE_PUBKEY_HEX, 'Alice')
    const decoded = decodeIdentityInfo(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded!.pubkey).toBe(FAKE_PUBKEY_HEX)
    expect(decoded!.nickname).toBe('Alice')
  })

  it('handles unicode nicknames', () => {
    const encoded = encodeIdentityInfo(FAKE_PUBKEY_HEX, 'Dodo')
    const decoded = decodeIdentityInfo(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded!.nickname).toBe('Dodo')
  })

  it('returns null for tampered string (checksum fail)', () => {
    const encoded = encodeIdentityInfo(FAKE_PUBKEY_HEX, 'Alice')
    // flip a char in the payload segment
    const tampered = encoded.slice(0, 30) + 'ff' + encoded.slice(32)
    expect(decodeIdentityInfo(tampered)).toBeNull()
  })

  it('returns null for non-dodobox identity strings', () => {
    expect(decodeIdentityInfo('dodobox://contact/abc')).toBeNull()
    expect(decodeIdentityInfo('')).toBeNull()
    expect(decodeIdentityInfo('dodobox://identity/badformat')).toBeNull()
  })

  it('produces different encodings each time (random key)', () => {
    const a = encodeIdentityInfo(FAKE_PUBKEY_HEX, 'Alice')
    const b = encodeIdentityInfo(FAKE_PUBKEY_HEX, 'Alice')
    expect(a).not.toBe(b)
    // but both decode to the same result
    expect(decodeIdentityInfo(a)).toEqual(decodeIdentityInfo(b))
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
