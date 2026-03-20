// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  signEvent,
  buildProfileEvent,
  buildFollowListEvent,
  buildDirectMessageEvent,
  createGiftWrap,
  decryptGiftWrap,
  buildVaultEvent,
  verifyEvent,
  KIND_PROFILE,
  KIND_FOLLOWS,
  KIND_DIRECT_MESSAGE,
  KIND_DM_WRAP,
  KIND_VAULT,
} from '@/lib/nostr/events'
import { VAULT_EVENT_D_TAG } from '@/lib/nostr/types'
import { deriveMasterKey, generateNewIdentityKey } from '@/lib/nostr/key-derivation'

const SENDER = deriveMasterKey('sender', 'pass')
const RECIPIENT = deriveMasterKey('recipient', 'pass')

describe('signEvent', () => {
  it('returns event with correct kind and content', () => {
    const event = signEvent(1, 'hello world', [], SENDER.privateKey)
    expect(event.kind).toBe(1)
    expect(event.content).toBe('hello world')
  })

  it('returns event with valid signature', () => {
    const event = signEvent(1, 'test', [], SENDER.privateKey)
    expect(verifyEvent(event as Parameters<typeof verifyEvent>[0])).toBe(true)
  })

  it('includes id, pubkey, sig fields', () => {
    const event = signEvent(1, '', [], SENDER.privateKey)
    expect(event.id).toMatch(/^[0-9a-f]{64}$/)
    expect(event.pubkey).toMatch(/^[0-9a-f]{64}$/)
    expect(event.sig).toMatch(/^[0-9a-f]{128}$/)
  })

  it('includes provided tags', () => {
    const tags = [['p', RECIPIENT.publicKey], ['e', 'abc123']]
    const event = signEvent(1, '', tags, SENDER.privateKey)
    expect(event.tags).toEqual(tags)
  })
})

describe('buildProfileEvent', () => {
  it('builds kind 0 event', () => {
    const event = buildProfileEvent({ name: 'Alice', about: 'Test' }, SENDER.privateKey)
    expect(event.kind).toBe(KIND_PROFILE)
  })

  it('content is valid JSON with profile data', () => {
    const profile = { name: 'Alice', about: 'Test' }
    const event = buildProfileEvent(profile, SENDER.privateKey)
    const parsed = JSON.parse(event.content)
    expect(parsed.name).toBe('Alice')
    expect(parsed.about).toBe('Test')
  })

  it('has valid signature', () => {
    const event = buildProfileEvent({ name: 'test' }, SENDER.privateKey)
    expect(verifyEvent(event as Parameters<typeof verifyEvent>[0])).toBe(true)
  })
})

describe('buildFollowListEvent', () => {
  it('builds kind 3 event', () => {
    const event = buildFollowListEvent([{ pubkey: RECIPIENT.publicKey }], SENDER.privateKey)
    expect(event.kind).toBe(KIND_FOLLOWS)
  })

  it('tags each pubkey as p with petname', () => {
    const pk2 = generateNewIdentityKey().publicKey
    const contacts = [
      { pubkey: RECIPIENT.publicKey, petname: 'Alice' },
      { pubkey: pk2 },
    ]
    const event = buildFollowListEvent(contacts, SENDER.privateKey)
    expect(event.tags).toHaveLength(2)
    expect(event.tags[0]).toEqual(['p', RECIPIENT.publicKey, '', 'Alice'])
    expect(event.tags[1]).toEqual(['p', pk2, '', ''])
  })

  it('handles empty contact list', () => {
    const event = buildFollowListEvent([], SENDER.privateKey)
    expect(event.tags).toEqual([])
  })
})

describe('buildDirectMessageEvent', () => {
  it('builds kind 14 event', () => {
    const event = buildDirectMessageEvent('hello', RECIPIENT.publicKey, SENDER.privateKey)
    expect(event.kind).toBe(KIND_DIRECT_MESSAGE)
  })

  it('content contains the message', () => {
    const event = buildDirectMessageEvent('secret msg', RECIPIENT.publicKey, SENDER.privateKey)
    expect(event.content).toBe('secret msg')
  })

  it('tags recipient pubkey as p', () => {
    const event = buildDirectMessageEvent('hi', RECIPIENT.publicKey, SENDER.privateKey)
    expect(event.tags[0]).toEqual(['p', RECIPIENT.publicKey])
  })
})

describe('createGiftWrap / decryptGiftWrap', () => {
  it('creates kind 1059 wrap event', () => {
    const inner = buildDirectMessageEvent('secret', RECIPIENT.publicKey, SENDER.privateKey)
    const wrap = createGiftWrap(inner, RECIPIENT.publicKey)
    expect(wrap.kind).toBe(KIND_DM_WRAP)
  })

  it('wrap event tags recipient pubkey', () => {
    const inner = buildDirectMessageEvent('secret', RECIPIENT.publicKey, SENDER.privateKey)
    const wrap = createGiftWrap(inner, RECIPIENT.publicKey)
    expect(wrap.tags.some(t => t[0] === 'p' && t[1] === RECIPIENT.publicKey)).toBe(true)
  })

  it('decrypts gift wrap to recover inner event', () => {
    const inner = buildDirectMessageEvent('my secret message', RECIPIENT.publicKey, SENDER.privateKey)
    const wrap = createGiftWrap(inner, RECIPIENT.publicKey)
    const decrypted = decryptGiftWrap(wrap, RECIPIENT.privateKey)
    expect(decrypted).not.toBeNull()
    expect(decrypted!.content).toBe('my secret message')
    expect(decrypted!.kind).toBe(KIND_DIRECT_MESSAGE)
  })

  it('returns null when decrypting with wrong key', () => {
    const inner = buildDirectMessageEvent('secret', RECIPIENT.publicKey, SENDER.privateKey)
    const wrap = createGiftWrap(inner, RECIPIENT.publicKey)
    const wrongKey = generateNewIdentityKey().privateKey
    const result = decryptGiftWrap(wrap, wrongKey)
    expect(result).toBeNull()
  })
})

describe('buildVaultEvent', () => {
  it('builds kind 31990 event', () => {
    const event = buildVaultEvent('encrypted_content', SENDER.privateKey)
    expect(event.kind).toBe(KIND_VAULT)
  })

  it('includes d tag with vault tag value', () => {
    const event = buildVaultEvent('content', SENDER.privateKey)
    expect(event.tags.some(t => t[0] === 'd' && t[1] === VAULT_EVENT_D_TAG)).toBe(true)
  })

  it('has valid signature', () => {
    const event = buildVaultEvent('encrypted', SENDER.privateKey)
    expect(verifyEvent(event as Parameters<typeof verifyEvent>[0])).toBe(true)
  })
})
