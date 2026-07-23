// contact-cache.ts - localStorage cache for contacts and chats
// Controlled by a UI toggle (disabled by default for privacy).

import type { NostrContact, NostrChat } from './types'
import { shortPubkey } from '@/lib/utils'
import { store, StorageKey, type StorageKeyType } from '@/lib/storage'

// Same control-char / shortPubkey patterns as real-adapter.ts
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\uFEFF]/g
const SHORT_PUBKEY_RE = /^npub1[a-z0-9]{0,10}\.{2,3}[a-z0-9]{0,6}$/

function sanitizeCachedName(name: unknown, pubkey: string): string {
  if (typeof name !== 'string' || name.trim().length === 0) return shortPubkey(pubkey)
  const cleaned = (name as string).replace(CONTROL_CHARS_RE, '').trim()
  if (cleaned.length === 0 || SHORT_PUBKEY_RE.test(cleaned)) return shortPubkey(pubkey)
  return cleaned.slice(0, 50)
}

export function isContactCacheEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return store.get<boolean>(StorageKey.CONTACT_CACHE, false) ?? false
}

export function setContactCacheEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  store.set(StorageKey.CONTACT_CACHE, enabled)
  if (!enabled) {
    clearContactCache()
  }
}

function clearContactCache(): void {
  // Clear all dynamic cache entries from the store's memory cache
  // The store handles localStorage cleanup internally
  try {
    const keys = Object.keys(localStorage)
    for (const key of keys) {
      if (key.startsWith(StorageKey.CONTACTS_CACHE) || key.startsWith(StorageKey.CHATS_CACHE)) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // non-critical
  }
}

function loadCache<T>(prefix: StorageKeyType, pubkey: string): T[] {
  if (typeof window === 'undefined' || !isContactCacheEnabled()) return []
  const key = `${prefix}_${pubkey}`
  const parsed = store.get<unknown>(key, []) ?? []
  if (!Array.isArray(parsed)) return []
  return parsed as T[]
}

function saveCache<T>(prefix: StorageKeyType, pubkey: string, data: readonly T[]): void {
  if (typeof window === 'undefined' || !isContactCacheEnabled()) return
  const key = `${prefix}_${pubkey}`
  store.set(key, data)
}

export function loadCachedContacts(pubkey: string): NostrContact[] {
  const contacts = loadCache<NostrContact>(StorageKey.CONTACTS_CACHE, pubkey)
  return contacts.map(c => ({
    ...c,
    name: sanitizeCachedName(c.name, c.pubkey),
  }))
}

export function saveCachedContacts(pubkey: string, contacts: readonly NostrContact[]): void {
  saveCache(StorageKey.CONTACTS_CACHE, pubkey, contacts)
}

export function loadCachedChats(pubkey: string): NostrChat[] {
  return loadCache<NostrChat>(StorageKey.CHATS_CACHE, pubkey)
}

export function saveCachedChats(pubkey: string, chats: readonly NostrChat[]): void {
  saveCache(StorageKey.CHATS_CACHE, pubkey, chats)
}
