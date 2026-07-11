// contacts.ts — Contact management for CLI
// Handles adding/removing contacts, npub decoding, profile lookup

import { fetchEvents } from '../lib/messaging/relay-node'
import { decryptGiftWrap } from '@/lib/welshman/crypto'
import type { Filter, SignedEvent } from '@welshman/util'

export interface CliContact {
  pubkey: string
  name?: string
  addedAt: number
}

/**
 * Decode a base32 npub to hex pubkey.
 * Implements NIP-19 encoding.
 */
export function decodeNpub(npub: string): string | null {
  // NIP-19 base32 alphabet (without padding)
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'

  if (!npub.startsWith('npub1')) return null

  const data = npub.slice(5) // Remove 'npub' prefix

  // Decode base32 to bits
  let bits = ''
  for (const ch of data.toLowerCase()) {
    const idx = alphabet.indexOf(ch)
    if (idx === -1) return null
    bits += idx.toString(2).padStart(5, '0')
  }

  // Convert bits to hex (take first 64 chars = 32 bytes)
  const hexBytes = bits.slice(0, 256) // 32 bytes * 8 bits
  if (hexBytes.length < 256) return null

  let hex = ''
  for (let i = 0; i < 256; i += 8) {
    const byte = hexBytes.slice(i, i + 8)
    hex += parseInt(byte, 2).toString(16).padStart(2, '0')
  }

  return hex
}

/**
 * Load contacts from local config file.
 */
export function loadContacts(configDir: string): CliContact[] {
  const fs = require('node:fs')
  const path = require('node:path')
  const contactsFile = path.join(configDir, 'contacts.json')

  if (!fs.existsSync(contactsFile)) return []

  try {
    return JSON.parse(fs.readFileSync(contactsFile, 'utf8')) as CliContact[]
  } catch {
    return []
  }
}

/**
 * Save contacts to local config file.
 */
export function saveContacts(configDir: string, contacts: CliContact[]): void {
  const fs = require('node:fs')
  const path = require('node:path')
  const contactsFile = path.join(configDir, 'contacts.json')

  fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2), 'utf8')
}

/**
 * Add a contact by pubkey or npub.
 */
export function addContact(
  configDir: string,
  pubkeyOrNpub: string,
  name?: string
): CliContact | null {
  let pubkey = pubkeyOrNpub

  // Try to decode npub
  if (pubkeyOrNpub.startsWith('npub')) {
    const decoded = decodeNpub(pubkeyOrNpub)
    if (!decoded) {
      console.log('  ❌ Invalid npub format')
      return null
    }
    pubkey = decoded
  }

  // Validate pubkey format
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
    console.log('  ❌ Invalid pubkey format (must be 64 hex characters)')
    return null
  }

  const contacts = loadContacts(configDir)

  // Check for duplicate
  if (contacts.some((c) => c.pubkey === pubkey)) {
    console.log(`  ⚠️  Contact already exists: ${name || pubkey.slice(0, 16)}...`)
    return contacts.find((c) => c.pubkey === pubkey) || null
  }

  const contact: CliContact = {
    pubkey,
    name: name || pubkey.slice(0, 16),
    addedAt: Date.now(),
  }

  contacts.push(contact)
  saveContacts(configDir, contacts)
  console.log(`  ✅ Added contact: ${contact.name} (${contact.pubkey.slice(0, 16)}...)`)
  return contact
}

/**
 * Remove a contact by pubkey.
 */
export function removeContact(configDir: string, pubkey: string): boolean {
  const contacts = loadContacts(configDir)
  const index = contacts.findIndex((c) => c.pubkey === pubkey)

  if (index === -1) {
    console.log('  ❌ Contact not found')
    return false
  }

  const removed = contacts.splice(index, 1)[0]
  saveContacts(configDir, contacts)
  console.log(`  🗑️  Removed contact: ${removed.name}`)
  return true
}

/**
 * List all contacts.
 */
export function listContacts(configDir: string): CliContact[] {
  const contacts = loadContacts(configDir)

  if (contacts.length === 0) {
    console.log('  No contacts yet. Use /add <pubkey> [name] to add one.')
    return []
  }

  console.log(`\n  Contacts (${contacts.length}):`)
  console.log('  ──────────────────────────────────────')
  for (const c of contacts) {
    const name = c.name || c.pubkey.slice(0, 16)
    console.log(`  ${name.padEnd(20)} ${c.pubkey.slice(0, 16)}...`)
  }
  console.log('  ──────────────────────────────────────\n')

  return contacts
}

/**
 * Fetch and decrypt recent messages from a contact.
 * Returns last N messages sorted by time.
 */
export async function fetchRecentMessages(
  myPubkey: string,
  myPrivkey: string,
  contactPubkey: string,
  relayUrls: string[],
  limit: number = 20
): Promise<Array<{ text: string; senderPubkey: string; timestamp: Date }>> {
  const now = Math.floor(Date.now() / 1000)
  const since = now - 86400 * 7 // Last 7 days

  // Fetch gift wraps addressed to us from this contact
  const filters: Filter[] = [{
    kinds: [1059],
    '#p': [myPubkey],
    authors: [contactPubkey],
    since,
    until: now,
    limit,
  }]

  const events = await fetchEvents(filters, relayUrls, { timeout: 15000 })

  const messages: Array<{ text: string; senderPubkey: string; timestamp: Date }> = []

  for (const event of events) {
    const signedEvent = event as unknown as SignedEvent

    // Decrypt the gift wrap
    const inner = await decryptGiftWrap(signedEvent, myPrivkey)
    if (!inner) continue

    try {
      const text = typeof inner.content === 'string'
        ? inner.content
        : JSON.parse(inner.content)?.text || ''

      if (text) {
        messages.push({
          text,
          senderPubkey: inner.pubkey,
          timestamp: new Date(inner.created_at * 1000),
        })
      }
    } catch {
      // Skip malformed messages
    }
  }

  // Sort by timestamp descending
  messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  return messages
}
