// contacts.ts — Relay-based contact management for CLI
// Stores contacts list as NIP-02 kind:3 events on relay (shared with UI)

import { fetchEvents, publishEvent } from './relay-node'
import { decryptGiftWrap } from '@/lib/welshman/crypto'
import { buildFollowListEvent } from '@/lib/welshman/crypto'
import type { Filter, SignedEvent } from '@welshman/util'
import { decode } from 'nostr-tools/nip19'

export interface CliContact {
  pubkey: string
  name?: string
}

/**
 * Decode a NIP-19 npub to hex pubkey.
 * Uses nostr-tools/nip19 for proper Bech32 decoding.
 */
export function decodeNpub(npub: string): string | null {
  try {
    if (!npub.startsWith('npub1')) return null
    const decoded = decode(npub)
    if (decoded.type === 'npub') return decoded.data as string
    return null
  } catch {
    return null
  }
}

/**
 * Fetch contacts from relay (kind:3 NIP-02 follows list).
 */
export async function fetchContacts(
  myPubkey: string,
  relayUrls: string[]
): Promise<CliContact[]> {
  const filters: Filter[] = [{
    kinds: [3],
    authors: [myPubkey],
    limit: 1,
  }]

  const events = await fetchEvents(filters, relayUrls, { timeout: 10000 })

  if (events.length === 0) return []

  // Use the most recent event
  const event = events.sort((a, b) => b.created_at - a.created_at)[0]

  const contacts: CliContact[] = []
  for (const tag of event.tags) {
    if (tag[0] === 'p' && tag[1] && /^[0-9a-f]{64}$/i.test(tag[1])) {
      contacts.push({
        pubkey: tag[1],
        name: tag[3] || undefined,
      })
    }
  }

  return contacts
}

/**
 * Publish contacts to relay as kind:3 event.
 */
export async function publishContacts(
  contacts: CliContact[],
  myPrivkey: string,
  relayUrls: string[]
): Promise<void> {
  const event = buildFollowListEvent(
    contacts.map(c => ({ pubkey: c.pubkey, petname: c.name })),
    myPrivkey
  )
  await publishEvent(event, relayUrls, { timeout: 10000 })
}

/**
 * Add a contact to the list (pure in-memory).
 * Returns updated list, or null if invalid input.
 */
export function addContact(
  contacts: CliContact[],
  pubkeyOrNpub: string,
  name?: string
): CliContact[] | null {
  let pubkey = pubkeyOrNpub

  if (pubkeyOrNpub.startsWith('npub')) {
    const decoded = decodeNpub(pubkeyOrNpub)
    if (!decoded) {
      console.log('  ❌ Invalid npub format')
      return null
    }
    pubkey = decoded
  }

  if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
    console.log('  ❌ Invalid pubkey format (must be 64 hex characters)')
    return null
  }

  if (contacts.some(c => c.pubkey === pubkey)) {
    console.log(`  ⚠️  Contact already exists: ${name || pubkey.slice(0, 16)}...`)
    return contacts
  }

  const newContact: CliContact = {
    pubkey,
    name: name || pubkey.slice(0, 16),
  }

  console.log(`  ✅ Added contact: ${newContact.name} (${newContact.pubkey.slice(0, 16)}...)`)
  return [...contacts, newContact]
}

/**
 * Remove a contact from the list (pure in-memory).
 * Returns updated list.
 */
export function removeContact(
  contacts: CliContact[],
  pubkey: string
): CliContact[] {
  const before = contacts.length
  const filtered = contacts.filter(c => c.pubkey !== pubkey)

  if (filtered.length === before) {
    console.log('  ❌ Contact not found')
  } else {
    console.log(`  🗑️  Removed contact: ${pubkey.slice(0, 16)}...`)
  }

  return filtered
}

/**
 * List all contacts (print to console).
 */
export function listContacts(contacts: CliContact[]): void {
  if (contacts.length === 0) {
    console.log('  No contacts yet. Use /add <pubkey> [name] to add one.')
    return
  }

  console.log(`\n  Contacts (${contacts.length}):`)
  console.log('  ──────────────────────────────────────')
  for (const c of contacts) {
    const name = c.name || c.pubkey.slice(0, 16)
    console.log(`  ${name.padEnd(20)} ${c.pubkey}`)
  }
  console.log('  ──────────────────────────────────────\n')
}

/**
 * Find a contact by pubkey or name (for /select).
 */
export function findContact(
  contacts: CliContact[],
  query: string
): CliContact | null {
  // Exact pubkey match
  const byPubkey = contacts.find(c => c.pubkey === query)
  if (byPubkey) return byPubkey

  // Name match (case-insensitive)
  const byName = contacts.find(c =>
    c.name?.toLowerCase() === query.toLowerCase()
  )
  if (byName) return byName

  return null
}

/**
 * Fetch recent messages from a specific contact from relay.
 * Decrypts gift wrap messages and returns the last N messages.
 * Note: NIP-59 gift wraps are authored by ephemeral keys, so we cannot
 * filter by author. We fetch by kind/`#p` and filter after decryption.
 */
export async function fetchRecentMessages(
  myPubkey: string,
  contactPubkey: string,
  relayUrls: string[],
  myPrivkey: string,
  limit = 50
): Promise<Array<{ id: string; text: string; timestamp: Date; senderPubkey: string }>> {
  const filter: Filter = {
    kinds: [1059],
    '#p': [myPubkey],
    limit: limit * 2, // fetch more to account for undecryptable messages
  }

  const events = await fetchEvents([filter], relayUrls, { timeout: 15000 })

  const messages: Array<{ id: string; text: string; timestamp: Date; senderPubkey: string }> = []

  for (const event of events) {
    try {
      const signedEvent = event as unknown as SignedEvent
      const decrypted = await decryptGiftWrap(signedEvent, myPrivkey)
      if (!decrypted) continue

      // Filter: only include messages from the specified contact
      if (decrypted.pubkey !== contactPubkey) continue

      // Parse JSON format { text: "..." } from CLI
      let messageText = decrypted.content
      try {
        const parsed = JSON.parse(decrypted.content)
        if (parsed && typeof parsed.text === 'string') {
          messageText = parsed.text
        }
      } catch {
        // Not JSON, use raw content
      }

      messages.push({
        id: decrypted.id,
        text: messageText,
        timestamp: new Date(decrypted.created_at * 1000),
        senderPubkey: decrypted.pubkey,
      })

      if (messages.length >= limit) break
    } catch (err) {
      // Skip undecryptable messages
    }
  }

  // Sort by timestamp descending (newest first)
  return messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}
