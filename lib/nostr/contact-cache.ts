// contact-cache.ts - localStorage cache for contacts and chats

import type { NostrContact, NostrChat } from './types'

const CONTACTS_CACHE_KEY = 'dodobox_contacts_cache'
const CHATS_CACHE_KEY = 'dodobox_chats_cache'

function loadCache<T>(key: string, pubkey: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`${key}_${pubkey}`)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as T[]
  } catch {
    return []
  }
}

function saveCache<T>(key: string, pubkey: string, data: readonly T[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`${key}_${pubkey}`, JSON.stringify(data))
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

export function loadCachedContacts(pubkey: string): NostrContact[] {
  return loadCache<NostrContact>(CONTACTS_CACHE_KEY, pubkey)
}

export function saveCachedContacts(pubkey: string, contacts: readonly NostrContact[]): void {
  saveCache(CONTACTS_CACHE_KEY, pubkey, contacts)
}

export function loadCachedChats(pubkey: string): NostrChat[] {
  return loadCache<NostrChat>(CHATS_CACHE_KEY, pubkey)
}

export function saveCachedChats(pubkey: string, chats: readonly NostrChat[]): void {
  saveCache(CHATS_CACHE_KEY, pubkey, chats)
}
