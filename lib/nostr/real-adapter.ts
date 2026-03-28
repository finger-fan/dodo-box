// real-adapter.ts - Real Nostr adapter using welshman relay management

import type {
  INostrAdapter,
  NostrChat,
  NostrMessage,
  NostrContact,
  NostrProfile,
  NostrResult,
  NostrSession,
  NostrFilter,
} from './types'
import { KIND_DM_WRAP, KIND_FOLLOWS, KIND_PROFILE } from './types'
import { defaultAvatar, shortPubkey } from '@/lib/utils'
import { incrementSeqCounter, parseSeqTag, recoverSeqCounter } from './seq-counter'
import { loadCachedContacts, saveCachedContacts, saveCachedChats } from './contact-cache'

// Welshman imports
import {
  connectToRelays,
  publishEvent,
  fetchEvents,
  subscribe as welshmanSubscribe,
  getConnectedRelays,
} from '@/lib/welshman/relay-manager'
import {
  buildDirectMessageEvent,
  createGiftWrap,
  decryptGiftWrap,
  buildFollowListEvent,
  buildProfileEvent,
  buildVaultEvent,
  signEvent,
} from '@/lib/welshman/crypto'
import type { TrustedEvent, SignedEvent } from '@welshman/util'

const MESSAGE_FETCH_LIMIT = 100
const MAX_PETNAME_LENGTH = 50

// Regex: control chars (U+0000-U+001F, U+007F-U+009F), zero-width chars
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\uFEFF]/g
// Matches shortPubkey output: "npub1..." or hex prefix with ellipsis
const SHORT_PUBKEY_RE = /^npub1[a-z0-9]{0,10}\.{2,3}[a-z0-9]{0,6}$/
const HEX_SHORT_RE = /^[0-9a-f]{4,10}\.{2,3}$/

/**
 * Sanitize a petname read from a relay tag or cache.
 * Returns empty string for invalid/garbled/display-only values.
 */
function sanitizePetname(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.replace(CONTROL_CHARS_RE, '').trim()
  if (trimmed.length === 0) return ''
  if (SHORT_PUBKEY_RE.test(trimmed) || HEX_SHORT_RE.test(trimmed)) return ''
  return trimmed.slice(0, MAX_PETNAME_LENGTH)
}

/**
 * Check if a contact name is a real user-set nickname (not a shortPubkey fallback).
 */
function isRealNickname(name: string, pubkey: string): boolean {
  return name !== '' && name !== shortPubkey(pubkey)
}

export class RealNostrAdapter implements INostrAdapter {
  private session: NostrSession
  private relayUrls: string[]
  private contacts: NostrContact[] = []
  private chats: NostrChat[] = []
  private contactsFetchPromise: Promise<NostrContact[]> | null = null

  constructor(session: NostrSession) {
    this.session = session
    this.relayUrls = (
      process.env.NEXT_PUBLIC_DEFAULT_RELAYS || 'wss://relay.damus.io'
    ).split(',')

    // Restore cached contacts so names display immediately before relay responds
    if (session.currentPubkey) {
      this.contacts = loadCachedContacts(session.currentPubkey)
      if (this.contacts.length > 0) {
        this.rebuildChats()
      }
    }
  }

  private get privkey(): string {
    return (this.session as NostrSession & { currentPrivkey?: string }).currentPrivkey || ''
  }

  async getChats(): Promise<NostrChat[]> {
    if (!this.contactsFetchPromise) {
      await this.getContacts()
    } else {
      await this.contactsFetchPromise
    }
    return [...this.chats]
  }

  async getMessages(contactPubkey: string): Promise<NostrMessage[]> {
    if (!this.session.currentPubkey || !this.privkey) return []

    const messages: NostrMessage[] = []
    const filters: NostrFilter[] = [
      {
        kinds: [KIND_DM_WRAP],
        '#p': [this.session.currentPubkey],
        limit: MESSAGE_FETCH_LIMIT,
      },
    ]

    connectToRelays(this.relayUrls)

    const events = await fetchEvents(filters, this.relayUrls)

    for (const event of events) {
      const innerEvent = await decryptGiftWrap(event as SignedEvent, this.privkey)
      if (!innerEvent) continue

      const isFromContact = innerEvent.pubkey === contactPubkey
      const isFromMe =
        innerEvent.pubkey === this.session.currentPubkey &&
        innerEvent.tags.some(t => t[0] === 'p' && t[1] === contactPubkey)

      if (!isFromContact && !isFromMe) continue

      messages.push({
        id: innerEvent.id,
        text: innerEvent.content,
        sender: isFromMe ? 'me' : 'them',
        timestamp: new Date(innerEvent.created_at * 1000),
        senderPubkey: innerEvent.pubkey,
        seq: parseSeqTag(innerEvent.tags),
      })
    }

    messages.sort((a, b) => {
      const timeDiff = a.timestamp.getTime() - b.timestamp.getTime()
      if (timeDiff !== 0) return timeDiff
      if (a.senderPubkey && a.senderPubkey === b.senderPubkey) {
        return (a.seq ?? 0) - (b.seq ?? 0)
      }
      return 0
    })

    recoverSeqCounter(this.session.currentPubkey!, contactPubkey, messages)
    return messages
  }

  async sendMessage(
    contactPubkey: string,
    text: string
  ): Promise<NostrResult<NostrMessage>> {
    if (!this.session.currentPubkey || !this.privkey) {
      return { success: false, error: 'Not authenticated' }
    }

    try {
      const seq = incrementSeqCounter(this.session.currentPubkey, contactPubkey)
      const innerEvent = buildDirectMessageEvent(text, contactPubkey, this.privkey, seq)

      // Two gift wraps: one for recipient, one for sender
      const wrapForRecipient = await createGiftWrap(innerEvent, contactPubkey, this.privkey)
      const wrapForSelf = await createGiftWrap(innerEvent, this.session.currentPubkey, this.privkey)

      const recipientResults = await publishEvent(wrapForRecipient, this.relayUrls)
      await publishEvent(wrapForSelf, this.relayUrls)

      const anySuccess = Object.values(recipientResults).some(r => r.status === 'success')

      const msg: NostrMessage = {
        id: innerEvent.id,
        text,
        sender: 'me',
        timestamp: new Date(innerEvent.created_at * 1000),
        seq,
        sendStatus: anySuccess ? 'sent' : 'failed',
      }

      // Update last message
      this.chats = this.chats.map(c =>
        c.pubkey === contactPubkey
          ? { ...c, lastMsg: text, time: new Date().toISOString(), unread: 0 }
          : c
      )
      if (this.session.currentPubkey) {
        saveCachedChats(this.session.currentPubkey, this.chats)
      }

      return { success: true, data: msg }
    } catch (error) {
      console.error('[RealAdapter] sendMessage failed:', error)
      return { success: false, error: String(error) }
    }
  }

  subscribeToMessages(
    contactPubkey: string,
    callback: (msg: NostrMessage) => void
  ): () => void {
    if (!this.session.currentPubkey || !this.privkey) return () => {}

    // No `since` filter: NIP-59 gift wraps randomize created_at up to ~28h
    // into the past (welshman now(5)), so a since=now filter would miss them.
    // Dedup is handled by welshman's Tracker singleton.
    const filters: NostrFilter[] = [
      {
        kinds: [KIND_DM_WRAP],
        '#p': [this.session.currentPubkey],
      },
    ]

    const controller = welshmanSubscribe(
      filters,
      this.relayUrls,
      async (event: TrustedEvent) => {
        const innerEvent = await decryptGiftWrap(event as SignedEvent, this.privkey)
        if (!innerEvent || innerEvent.pubkey !== contactPubkey) return

        callback({
          id: innerEvent.id,
          text: innerEvent.content,
          sender: 'them',
          timestamp: new Date(innerEvent.created_at * 1000),
          senderPubkey: innerEvent.pubkey,
          seq: parseSeqTag(innerEvent.tags),
        })
      }
    )

    return () => controller.abort()
  }

  async getContacts(): Promise<NostrContact[]> {
    if (this.contactsFetchPromise) return this.contactsFetchPromise

    if (!this.session.currentPubkey) return []

    const filters: NostrFilter[] = [
      {
        kinds: [KIND_FOLLOWS],
        authors: [this.session.currentPubkey],
        limit: 1,
      },
    ]

    connectToRelays(this.relayUrls)

    this.contactsFetchPromise = fetchEvents(filters, this.relayUrls).then((events) => {
      if (events.length > 0) {
        // Use the most recent event
        const event = events.sort((a, b) => b.created_at - a.created_at)[0]

        const contactTags = event.tags
          .filter(t => t[0] === 'p' && t[1])
          .map(t => ({ pubkey: t[1], petname: sanitizePetname(t[3]) }))

        this.contacts = contactTags.map((ct, i) => ({
          id: `contact-${i}`,
          name: ct.petname || shortPubkey(ct.pubkey),
          pubkey: ct.pubkey,
          avatar: defaultAvatar(ct.pubkey),
        }))

        this.rebuildChats()
        if (this.session.currentPubkey) {
          saveCachedContacts(this.session.currentPubkey, this.contacts)
        }
      }
      return this.contacts
    })

    return this.contactsFetchPromise
  }

  private rebuildChats(): void {
    this.chats = this.contacts.map((c) => ({
      id: c.id,
      pubkey: c.pubkey,
      name: c.name,
      lastMsg: '',
      time: '',
      unread: 0,
      avatar: c.avatar || '',
    }))
    if (this.session.currentPubkey) {
      saveCachedChats(this.session.currentPubkey, this.chats)
    }
  }

  async addContact(pubkeyOrNpub: string): Promise<NostrResult<NostrContact>> {
    let pubkey = pubkeyOrNpub
    let contactName = ''

    // Handle dodobox://identity/ protocol (nickname + pubkey encoded)
    if (pubkeyOrNpub.startsWith('dodobox://identity/')) {
      const { decodeIdentityInfo } = await import('@/lib/utils')
      const decoded = decodeIdentityInfo(pubkeyOrNpub)
      if (!decoded) return { success: false, error: 'Invalid identity string' }
      pubkey = decoded.pubkey
      contactName = decoded.nickname
    // Legacy dodobox://contact/ backward compat
    } else if (pubkeyOrNpub.startsWith('dodobox://contact/')) {
      const encoded = pubkeyOrNpub.replace('dodobox://contact/', '')
      try {
        const { decode } = await import('nostr-tools/nip19')
        const decoded = decode(encoded)
        if (decoded.type === 'npub') pubkey = decoded.data as string
      } catch {
        pubkey = encoded
      }
    } else if (pubkeyOrNpub.startsWith('npub1')) {
      try {
        const { decode } = await import('nostr-tools/nip19')
        const decoded = decode(pubkeyOrNpub)
        if (decoded.type === 'npub') pubkey = decoded.data as string
      } catch {
        // keep as is
      }
    }

    if (this.contacts.some(c => c.pubkey === pubkey)) {
      return { success: false, error: 'Contact already exists' }
    }

    const newContact: NostrContact = {
      id: Date.now().toString(),
      name: contactName || shortPubkey(pubkey),
      pubkey,
      avatar: defaultAvatar(pubkey),
    }

    this.contacts = [...this.contacts, newContact]
    if (this.session.currentPubkey) {
      saveCachedContacts(this.session.currentPubkey, this.contacts)
    }

    // Publish new kind 3 follows list with petnames (only real nicknames, not shortPubkey)
    if (this.privkey) {
      const event = buildFollowListEvent(
        this.contacts.map(c => ({ pubkey: c.pubkey, petname: isRealNickname(c.name, c.pubkey) ? c.name : '' })),
        this.privkey
      )
      await publishEvent(event, this.relayUrls)
    }

    return { success: true, data: newContact }
  }

  async removeContact(pubkey: string): Promise<NostrResult> {
    const before = this.contacts.length
    this.contacts = this.contacts.filter(c => c.pubkey !== pubkey)
    this.chats = this.chats.filter(c => c.pubkey !== pubkey)
    if (this.session.currentPubkey) {
      saveCachedContacts(this.session.currentPubkey, this.contacts)
    }

    if (this.contacts.length === before) {
      return { success: false, error: 'Contact not found' }
    }

    if (this.privkey) {
      const event = buildFollowListEvent(
        this.contacts.map(c => ({ pubkey: c.pubkey, petname: isRealNickname(c.name, c.pubkey) ? c.name : '' })),
        this.privkey
      )
      await publishEvent(event, this.relayUrls)
    }

    return { success: true, data: undefined }
  }

  async getProfile(pubkey: string): Promise<NostrProfile | null> {
    connectToRelays(this.relayUrls)

    const filters: NostrFilter[] = [
      { kinds: [KIND_PROFILE], authors: [pubkey], limit: 1 },
    ]

    const events = await fetchEvents(filters, this.relayUrls)
    if (events.length === 0) return null

    try {
      const meta = JSON.parse(events[0].content)
      return {
        pubkey,
        name: meta.name,
        displayName: meta.display_name || meta.name,
        picture: meta.picture,
        about: meta.about,
        nip05: meta.nip05,
      }
    } catch {
      return null
    }
  }

  async updateProfile(profile: Partial<NostrProfile>): Promise<NostrResult> {
    if (!this.privkey) return { success: false, error: 'Not authenticated' }

    try {
      const event = buildProfileEvent(
        {
          name: profile.name || '',
          display_name: profile.displayName || '',
          picture: profile.picture || '',
          about: profile.about || '',
          nip05: profile.nip05 || '',
        },
        this.privkey
      )
      connectToRelays(this.relayUrls)
      await publishEvent(event, this.relayUrls)
      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  getRelays(): string[] {
    return [...this.relayUrls]
  }

  async recoverMessages(
    contactPubkey: string,
    since: number,
    until: number
  ): Promise<NostrMessage[]> {
    if (!this.session.currentPubkey || !this.privkey) return []

    const messages: NostrMessage[] = []
    const filters: NostrFilter[] = [
      {
        kinds: [KIND_DM_WRAP],
        '#p': [this.session.currentPubkey],
        since,
        until,
      },
    ]

    connectToRelays(this.relayUrls)

    const events = await fetchEvents(filters, this.relayUrls)

    for (const event of events) {
      const innerEvent = await decryptGiftWrap(event as SignedEvent, this.privkey)
      if (!innerEvent) continue

      const isFromContact = innerEvent.pubkey === contactPubkey
      const isFromMe =
        innerEvent.pubkey === this.session.currentPubkey &&
        innerEvent.tags.some(t => t[0] === 'p' && t[1] === contactPubkey)

      if (!isFromContact && !isFromMe) continue

      messages.push({
        id: innerEvent.id,
        text: innerEvent.content,
        sender: isFromMe ? 'me' : 'them',
        timestamp: new Date(innerEvent.created_at * 1000),
        senderPubkey: innerEvent.pubkey,
        seq: parseSeqTag(innerEvent.tags),
      })
    }

    return messages
  }

  async setRelays(relays: string[]): Promise<NostrResult> {
    this.relayUrls = [...relays]
    closeAllRelays()
    connectToRelays(relays)
    return { success: true, data: undefined }
  }
}

// Import for setRelays
import { closeAllRelays } from '@/lib/welshman/relay-manager'
