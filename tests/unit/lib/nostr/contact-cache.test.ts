// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadCachedContacts,
  saveCachedContacts,
  loadCachedChats,
  saveCachedChats,
} from '@/lib/nostr/contact-cache'
import type { NostrContact, NostrChat } from '@/lib/nostr/types'

const PUBKEY = 'a'.repeat(64)

const sampleContacts: NostrContact[] = [
  { id: 'contact-0', name: 'Alice', pubkey: 'b'.repeat(64), avatar: 'https://example.com/a.png' },
  { id: 'contact-1', name: 'Bob', pubkey: 'c'.repeat(64) },
]

const sampleChats: NostrChat[] = [
  { id: 'chat-0', pubkey: 'b'.repeat(64), name: 'Alice', lastMsg: 'hello', time: '2026-03-23T00:00:00Z', unread: 0, avatar: '' },
]

describe('contact-cache', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('loadCachedContacts', () => {
    it('returns empty array when no cache exists', () => {
      expect(loadCachedContacts(PUBKEY)).toEqual([])
    })

    it('returns cached contacts', () => {
      saveCachedContacts(PUBKEY, sampleContacts)
      expect(loadCachedContacts(PUBKEY)).toEqual(sampleContacts)
    })

    it('returns empty array for invalid JSON', () => {
      localStorage.setItem(`dodobox_contacts_cache_${PUBKEY}`, 'not-json')
      expect(loadCachedContacts(PUBKEY)).toEqual([])
    })

    it('returns empty array for non-array JSON', () => {
      localStorage.setItem(`dodobox_contacts_cache_${PUBKEY}`, '{"key":"value"}')
      expect(loadCachedContacts(PUBKEY)).toEqual([])
    })

    it('isolates cache by pubkey', () => {
      const otherPubkey = 'd'.repeat(64)
      saveCachedContacts(PUBKEY, sampleContacts)
      expect(loadCachedContacts(otherPubkey)).toEqual([])
    })
  })

  describe('saveCachedContacts', () => {
    it('persists contacts to localStorage', () => {
      saveCachedContacts(PUBKEY, sampleContacts)
      const raw = localStorage.getItem(`dodobox_contacts_cache_${PUBKEY}`)
      expect(raw).not.toBeNull()
      expect(JSON.parse(raw!)).toEqual(sampleContacts)
    })

    it('overwrites previous cache', () => {
      saveCachedContacts(PUBKEY, sampleContacts)
      const updated = [sampleContacts[0]]
      saveCachedContacts(PUBKEY, updated)
      expect(loadCachedContacts(PUBKEY)).toEqual(updated)
    })
  })

  describe('loadCachedChats', () => {
    it('returns empty array when no cache exists', () => {
      expect(loadCachedChats(PUBKEY)).toEqual([])
    })

    it('returns cached chats', () => {
      saveCachedChats(PUBKEY, sampleChats)
      expect(loadCachedChats(PUBKEY)).toEqual(sampleChats)
    })

    it('returns empty array for invalid JSON', () => {
      localStorage.setItem(`dodobox_chats_cache_${PUBKEY}`, '{broken')
      expect(loadCachedChats(PUBKEY)).toEqual([])
    })
  })

  describe('saveCachedChats', () => {
    it('persists chats to localStorage', () => {
      saveCachedChats(PUBKEY, sampleChats)
      const raw = localStorage.getItem(`dodobox_chats_cache_${PUBKEY}`)
      expect(raw).not.toBeNull()
      expect(JSON.parse(raw!)).toEqual(sampleChats)
    })
  })
})
