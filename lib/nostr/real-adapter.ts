// real-adapter.ts - 真实 Nostr 适配器

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
import { buildDirectMessageEvent, createGiftWrap, decryptGiftWrap } from './events'
import { relayPool } from './relay-client'
import { defaultAvatar, shortPubkey } from '@/lib/utils'
import { incrementSeqCounter, parseSeqTag, recoverSeqCounter } from './seq-counter'
import { loadCachedContacts, saveCachedContacts, saveCachedChats } from './contact-cache'

const MESSAGE_FETCH_LIMIT = 100
const SUBSCRIPTION_TIMEOUT_MS = 5000

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
    // privkey is stored in an external ref, passed via session
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

    await relayPool.connect(this.relayUrls)

    return new Promise((resolve) => {
      const subId = `msgs-${contactPubkey.slice(0, 8)}-${Date.now()}`
      const timeout = setTimeout(() => {
        relayPool.unsubscribe(subId)
        messages.sort((a, b) => {
          const timeDiff = a.timestamp.getTime() - b.timestamp.getTime()
          if (timeDiff !== 0) return timeDiff
          if (a.senderPubkey && a.senderPubkey === b.senderPubkey) {
            return (a.seq ?? 0) - (b.seq ?? 0)
          }
          return 0
        })
        recoverSeqCounter(this.session.currentPubkey!, contactPubkey, messages)
        resolve(messages)
      }, SUBSCRIPTION_TIMEOUT_MS)

      relayPool.subscribe(subId, filters, (event) => {
        const innerEvent = decryptGiftWrap(event, this.privkey)
        if (!innerEvent) return

        const isFromContact = innerEvent.pubkey === contactPubkey
        const isFromMe =
          innerEvent.pubkey === this.session.currentPubkey &&
          innerEvent.tags.some(t => t[0] === 'p' && t[1] === contactPubkey)

        if (!isFromContact && !isFromMe) return

        messages.push({
          id: innerEvent.id,
          text: innerEvent.content,
          sender: isFromMe ? 'me' : 'them',
          timestamp: new Date(innerEvent.created_at * 1000),
          senderPubkey: innerEvent.pubkey,
          seq: parseSeqTag(innerEvent.tags),
        })
      })
    })
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
      const wrapForRecipient = createGiftWrap(innerEvent, contactPubkey)
      const wrapForSelf = createGiftWrap(innerEvent, this.session.currentPubkey)

      // relayPool.connect is idempotent but skipped here since connections
      // are established during getContacts/getMessages which run before send
      const recipientOk = await relayPool.publish(wrapForRecipient)
      await relayPool.publish(wrapForSelf)

      const msg: NostrMessage = {
        id: innerEvent.id,
        text,
        sender: 'me',
        timestamp: new Date(innerEvent.created_at * 1000),
        seq,
        sendStatus: recipientOk ? 'sent' : 'failed',
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

    const subId = `sub-${contactPubkey.slice(0, 8)}-${Date.now()}`
    const filters: NostrFilter[] = [
      {
        kinds: [KIND_DM_WRAP],
        '#p': [this.session.currentPubkey],
        since: Math.floor(Date.now() / 1000),
      },
    ]

    relayPool.connect(this.relayUrls).then(() => {
      relayPool.subscribe(subId, filters, (event) => {
        const innerEvent = decryptGiftWrap(event, this.privkey)
        if (!innerEvent || innerEvent.pubkey !== contactPubkey) return

        callback({
          id: innerEvent.id,
          text: innerEvent.content,
          sender: 'them',
          timestamp: new Date(innerEvent.created_at * 1000),
          senderPubkey: innerEvent.pubkey,
          seq: parseSeqTag(innerEvent.tags),
        })
      })
    })

    return () => relayPool.unsubscribe(subId)
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

    await relayPool.connect(this.relayUrls)

    this.contactsFetchPromise = new Promise((resolve) => {
      const subId = `contacts-${Date.now()}`
      const timeout = setTimeout(() => {
        relayPool.unsubscribe(subId)
        resolve(this.contacts)
      }, SUBSCRIPTION_TIMEOUT_MS)

      relayPool.subscribe(subId, filters, (event) => {
        const contactTags = event.tags
          .filter(t => t[0] === 'p' && t[1])
          .map(t => ({ pubkey: t[1], petname: t[3] || '' }))

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

        clearTimeout(timeout)
        relayPool.unsubscribe(subId)
        resolve(this.contacts)
      })
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

    // Publish new kind 3 follows list with petnames
    if (this.privkey) {
      const { buildFollowListEvent } = await import('./events')
      const event = buildFollowListEvent(
        this.contacts.map(c => ({ pubkey: c.pubkey, petname: c.name })),
        this.privkey
      )
      await relayPool.publish(event)
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
      const { buildFollowListEvent } = await import('./events')
      const event = buildFollowListEvent(
        this.contacts.map(c => ({ pubkey: c.pubkey, petname: c.name })),
        this.privkey
      )
      await relayPool.publish(event)
    }

    return { success: true, data: undefined }
  }

  async getProfile(pubkey: string): Promise<NostrProfile | null> {
    await relayPool.connect(this.relayUrls)

    return new Promise((resolve) => {
      const subId = `profile-${pubkey.slice(0, 8)}-${Date.now()}`
      const filters: NostrFilter[] = [
        { kinds: [KIND_PROFILE], authors: [pubkey], limit: 1 },
      ]

      const timeout = setTimeout(() => {
        relayPool.unsubscribe(subId)
        resolve(null)
      }, SUBSCRIPTION_TIMEOUT_MS)

      relayPool.subscribe(subId, filters, (event) => {
        clearTimeout(timeout)
        relayPool.unsubscribe(subId)
        try {
          const meta = JSON.parse(event.content)
          resolve({
            pubkey,
            name: meta.name,
            displayName: meta.display_name || meta.name,
            picture: meta.picture,
            about: meta.about,
            nip05: meta.nip05,
          })
        } catch {
          resolve(null)
        }
      })
    })
  }

  async updateProfile(profile: Partial<NostrProfile>): Promise<NostrResult> {
    if (!this.privkey) return { success: false, error: 'Not authenticated' }

    try {
      const { buildProfileEvent } = await import('./events')
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
      await relayPool.connect(this.relayUrls)
      await relayPool.publish(event)
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

    const RECOVERY_TIMEOUT_MS = 8000
    const messages: NostrMessage[] = []
    const filters: NostrFilter[] = [
      {
        kinds: [KIND_DM_WRAP],
        '#p': [this.session.currentPubkey],
        since,
        until,
      },
    ]

    await relayPool.connect(this.relayUrls)

    return new Promise((resolve) => {
      const subId = `recover-${contactPubkey.slice(0, 8)}-${Date.now()}`
      const timeout = setTimeout(() => {
        relayPool.unsubscribe(subId)
        resolve(messages)
      }, RECOVERY_TIMEOUT_MS)

      relayPool.subscribe(subId, filters, (event) => {
        const innerEvent = decryptGiftWrap(event, this.privkey)
        if (!innerEvent) return

        const isFromContact = innerEvent.pubkey === contactPubkey
        const isFromMe =
          innerEvent.pubkey === this.session.currentPubkey &&
          innerEvent.tags.some(t => t[0] === 'p' && t[1] === contactPubkey)

        if (!isFromContact && !isFromMe) return

        messages.push({
          id: innerEvent.id,
          text: innerEvent.content,
          sender: isFromMe ? 'me' : 'them',
          timestamp: new Date(innerEvent.created_at * 1000),
          senderPubkey: innerEvent.pubkey,
          seq: parseSeqTag(innerEvent.tags),
        })
      })
    })
  }

  async setRelays(relays: string[]): Promise<NostrResult> {
    this.relayUrls = [...relays]
    relayPool.closeAll()
    await relayPool.connect(relays)
    return { success: true, data: undefined }
  }
}
