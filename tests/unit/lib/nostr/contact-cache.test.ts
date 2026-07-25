// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadCachedContacts,
  saveCachedContacts,
  loadCachedChats,
  saveCachedChats,
  isContactCacheEnabled,
  setContactCacheEnabled,
} from '@/lib/nostr/contact-cache'
import type { NostrContact, NostrChat } from '@/lib/nostr/types'
import { store, StorageKey } from '@/lib/storage'

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

  describe('toggle', () => {
    it('is disabled by default', () => {
      expect(isContactCacheEnabled()).toBe(false)
    })

    it('can be enabled and disabled', () => {
      setContactCacheEnabled(true)
      expect(isContactCacheEnabled()).toBe(true)
      setContactCacheEnabled(false)
      expect(isContactCacheEnabled()).toBe(false)
    })

    it('clears cached data when disabled', () => {
      setContactCacheEnabled(true)
      saveCachedContacts(PUBKEY, sampleContacts)
      expect(localStorage.getItem(`dodobox_contacts_cache_${PUBKEY}`)).not.toBeNull()
      setContactCacheEnabled(false)
      expect(localStorage.getItem(`dodobox_contacts_cache_${PUBKEY}`)).toBeNull()
    })
  })

  describe('when cache disabled', () => {
    it('save is a no-op', () => {
      saveCachedContacts(PUBKEY, sampleContacts)
      expect(localStorage.getItem(`dodobox_contacts_cache_${PUBKEY}`)).toBeNull()
    })

    it('load returns empty', () => {
      // Manually write data bypassing the guard
      store.set(`${StorageKey.CONTACTS_CACHE}_${PUBKEY}`, sampleContacts)
      expect(loadCachedContacts(PUBKEY)).toEqual([])
    })
  })

  describe('when cache enabled', () => {
    beforeEach(() => {
      setContactCacheEnabled(true)
    })

    describe('loadCachedContacts', () => {
      it('returns empty array when no cache exists', () => {
        expect(loadCachedContacts(PUBKEY)).toEqual([])
      })

      it('returns cached contacts', () => {
        saveCachedContacts(PUBKEY, sampleContacts)
        expect(loadCachedContacts(PUBKEY)).toEqual(sampleContacts)
      })

      it('returns empty array for non-array string values', () => {
        store.set(`${StorageKey.CONTACTS_CACHE}_${PUBKEY}`, 'not-json')
        expect(loadCachedContacts(PUBKEY)).toEqual([])
      })

      it('returns empty array for non-array object values', () => {
        store.set(`${StorageKey.CONTACTS_CACHE}_${PUBKEY}`, { key: 'value' })
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
        const stored = store.get<NostrContact[]>(`${StorageKey.CONTACTS_CACHE}_${PUBKEY}`)
        expect(stored).toEqual(sampleContacts)
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

      it('returns empty array for non-array values', () => {
        store.set(`${StorageKey.CHATS_CACHE}_${PUBKEY}`, '{broken')
        expect(loadCachedChats(PUBKEY)).toEqual([])
      })
    })

    describe('saveCachedChats', () => {
      it('persists chats to localStorage', () => {
        saveCachedChats(PUBKEY, sampleChats)
        const stored = store.get<NostrChat[]>(`${StorageKey.CHATS_CACHE}_${PUBKEY}`)
        expect(stored).toEqual(sampleChats)
      })
    })
  })
})
