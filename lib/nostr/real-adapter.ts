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
import { nostrStorage } from './storage'

export class RealNostrAdapter implements INostrAdapter {
  private session: NostrSession
  private relayUrls: string[]
  private contacts: NostrContact[] = []
  private chats: NostrChat[] = []

  constructor(session: NostrSession) {
    this.session = session
    this.relayUrls = (
      process.env.NEXT_PUBLIC_DEFAULT_RELAYS || 'wss://relay.damus.io'
    ).split(',')
  }

  private get privkey(): string {
    // privkey is stored in an external ref, passed via session
    return (this.session as NostrSession & { currentPrivkey?: string }).currentPrivkey || ''
  }

  async getChats(): Promise<NostrChat[]> {
    await this.getContacts()
    return [...this.chats]
  }

  async getMessages(contactPubkey: string): Promise<NostrMessage[]> {
    if (!this.session.currentPubkey || !this.privkey) return []

    const messages: NostrMessage[] = []
    const filters: NostrFilter[] = [
      {
        kinds: [KIND_DM_WRAP],
        '#p': [this.session.currentPubkey],
        limit: 100,
      },
    ]

    await relayPool.connect(this.relayUrls)

    return new Promise((resolve) => {
      const subId = `msgs-${contactPubkey.slice(0, 8)}-${Date.now()}`
      const timeout = setTimeout(() => {
        relayPool.unsubscribe(subId)
        resolve(messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()))
      }, 5000)

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
      const innerEvent = buildDirectMessageEvent(text, contactPubkey, this.privkey)

      // Two gift wraps: one for recipient, one for sender
      const wrapForRecipient = createGiftWrap(innerEvent, contactPubkey)
      const wrapForSelf = createGiftWrap(innerEvent, this.session.currentPubkey)

      await relayPool.connect(this.relayUrls)
      await relayPool.publish(wrapForRecipient)
      await relayPool.publish(wrapForSelf)

      const msg: NostrMessage = {
        id: innerEvent.id,
        text,
        sender: 'me',
        timestamp: new Date(innerEvent.created_at * 1000),
      }

      // Update last message
      this.chats = this.chats.map(c =>
        c.pubkey === contactPubkey
          ? { ...c, lastMsg: text, time: 'Just now', unread: 0 }
          : c
      )

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
        })
      })
    })

    return () => relayPool.unsubscribe(subId)
  }

  async getContacts(): Promise<NostrContact[]> {
    if (!this.session.currentPubkey) return []

    // Load cached contacts for name fallback
    const cached = await nostrStorage.getContacts()
    const cachedNameMap = new Map(cached.map(c => [c.pubkey, c.name]))

    const filters: NostrFilter[] = [
      {
        kinds: [KIND_FOLLOWS],
        authors: [this.session.currentPubkey],
        limit: 1,
      },
    ]

    await relayPool.connect(this.relayUrls)

    return new Promise((resolve) => {
      const subId = `contacts-${Date.now()}`
      const timeout = setTimeout(() => {
        relayPool.unsubscribe(subId)
        // On timeout, return cached contacts if we have them
        if (this.contacts.length === 0 && cached.length > 0) {
          this.contacts = cached
          this.rebuildChats()
        }
        resolve(this.contacts)
      }, 5000)

      relayPool.subscribe(subId, filters, (event) => {
        const contactTags = event.tags
          .filter(t => t[0] === 'p' && t[1])
          .map(t => ({ pubkey: t[1], petname: t[3] || '' }))

        this.contacts = contactTags.map((ct, i) => ({
          id: `contact-${i}`,
          name: ct.petname || cachedNameMap.get(ct.pubkey) || ct.pubkey.slice(0, 8) + '...',
          pubkey: ct.pubkey,
          avatar: `https://picsum.photos/seed/${ct.pubkey.slice(0, 8)}/100/100`,
        }))

        this.rebuildChats()

        // Persist to cache
        nostrStorage.saveContacts(this.contacts).catch(() => {})

        clearTimeout(timeout)
        relayPool.unsubscribe(subId)
        resolve(this.contacts)
      })
    })
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
      name: contactName || pubkey.slice(0, 8) + '...',
      pubkey,
      avatar: `https://picsum.photos/seed/${pubkey.slice(0, 8)}/100/100`,
    }

    this.contacts = [...this.contacts, newContact]
    nostrStorage.saveContacts(this.contacts).catch(() => {})

    // Publish new kind 3 follows list with petnames
    if (this.privkey) {
      const { buildFollowListEvent } = await import('./events')
      const event = buildFollowListEvent(
        this.contacts.map(c => ({ pubkey: c.pubkey, petname: c.name })),
        this.privkey
      )
      relayPool.publish(event)
    }

    return { success: true, data: newContact }
  }

  async removeContact(pubkey: string): Promise<NostrResult> {
    const before = this.contacts.length
    this.contacts = this.contacts.filter(c => c.pubkey !== pubkey)
    this.chats = this.chats.filter(c => c.pubkey !== pubkey)
    nostrStorage.saveContacts(this.contacts).catch(() => {})

    if (this.contacts.length === before) {
      return { success: false, error: 'Contact not found' }
    }

    if (this.privkey) {
      const { buildFollowListEvent } = await import('./events')
      const event = buildFollowListEvent(
        this.contacts.map(c => ({ pubkey: c.pubkey, petname: c.name })),
        this.privkey
      )
      relayPool.publish(event)
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
      }, 5000)

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
      relayPool.publish(event)
      return { success: true, data: undefined }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  getRelays(): string[] {
    return [...this.relayUrls]
  }

  async setRelays(relays: string[]): Promise<NostrResult> {
    this.relayUrls = [...relays]
    relayPool.closeAll()
    await relayPool.connect(relays)
    return { success: true, data: undefined }
  }
}
