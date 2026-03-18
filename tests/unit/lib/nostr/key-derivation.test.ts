// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  deriveMasterKey,
  generateNewIdentityKey,
  verifyKeyPair,
} from '@/lib/nostr/key-derivation'

describe('deriveMasterKey', () => {
  it('returns deterministic keys for the same username/password', () => {
    const a = deriveMasterKey('alice', 'password123')
    const b = deriveMasterKey('alice', 'password123')
    expect(a.privateKey).toBe(b.privateKey)
    expect(a.publicKey).toBe(b.publicKey)
    expect(a.npub).toBe(b.npub)
    expect(a.nsec).toBe(b.nsec)
  })

  it('returns different keys for different credentials', () => {
    const a = deriveMasterKey('alice', 'pass')
    const b = deriveMasterKey('bob', 'pass')
    expect(a.privateKey).not.toBe(b.privateKey)
    expect(a.publicKey).not.toBe(b.publicKey)
  })

  it('privateKey is 64-char hex', () => {
    const { privateKey } = deriveMasterKey('user', 'pw')
    expect(privateKey).toMatch(/^[0-9a-f]{64}$/)
  })

  it('publicKey is 64-char hex', () => {
    const { publicKey } = deriveMasterKey('user', 'pw')
    expect(publicKey).toMatch(/^[0-9a-f]{64}$/)
  })

  it('npub starts with npub1', () => {
    const { npub } = deriveMasterKey('user', 'pw')
    expect(npub).toMatch(/^npub1/)
  })

  it('nsec starts with nsec1', () => {
    const { nsec } = deriveMasterKey('user', 'pw')
    expect(nsec).toMatch(/^nsec1/)
  })

  it('derived key pair is self-consistent', () => {
    const { privateKey, publicKey } = deriveMasterKey('user', 'pw')
    expect(verifyKeyPair(privateKey, publicKey)).toBe(true)
  })
})

describe('generateNewIdentityKey', () => {
  it('generates a valid random key pair', () => {
    const key = generateNewIdentityKey()
    expect(key.privateKey).toMatch(/^[0-9a-f]{64}$/)
    expect(key.publicKey).toMatch(/^[0-9a-f]{64}$/)
    expect(key.npub).toMatch(/^npub1/)
    expect(key.nsec).toMatch(/^nsec1/)
  })

  it('generates different keys on each call', () => {
    const a = generateNewIdentityKey()
    const b = generateNewIdentityKey()
    expect(a.privateKey).not.toBe(b.privateKey)
  })

  it('generated key pair is self-consistent', () => {
    const { privateKey, publicKey } = generateNewIdentityKey()
    expect(verifyKeyPair(privateKey, publicKey)).toBe(true)
  })
})

describe('verifyKeyPair', () => {
  it('returns true for valid matching pair', () => {
    const { privateKey, publicKey } = deriveMasterKey('test', 'test')
    expect(verifyKeyPair(privateKey, publicKey)).toBe(true)
  })

  it('returns false for mismatched pair', () => {
    const a = deriveMasterKey('alice', 'pw')
    const b = deriveMasterKey('bob', 'pw')
    expect(verifyKeyPair(a.privateKey, b.publicKey)).toBe(false)
  })

  it('returns false for invalid hex string', () => {
    expect(verifyKeyPair('notahexstring', 'anypubkey')).toBe(false)
  })

  it('returns false for empty strings', () => {
    expect(verifyKeyPair('', '')).toBe(false)
  })
})
