// mock-adapter.ts - Mock Nostr 适配器（使用 mock 数据）

import type {
  INostrAdapter,
  NostrChat,
  NostrMessage,
  NostrContact,
  NostrProfile,
  NostrResult,
} from './types'

const MOCK_CONTACTS: NostrContact[] = [
  {
    id: 'alice',
    name: 'Alice',
    pubkey: 'a'.repeat(64),
    avatar: 'https://picsum.photos/seed/alice/100/100',
  },
  {
    id: 'bob',
    name: 'Bob',
    pubkey: 'b'.repeat(64),
    avatar: 'https://picsum.photos/seed/bob/100/100',
  },
  {
    id: 'charlie',
    name: 'Charlie',
    pubkey: 'c'.repeat(64),
    avatar: 'https://picsum.photos/seed/charlie/100/100',
  },
]

const MOCK_CHATS: NostrChat[] = [
  {
    id: 'alice',
    pubkey: 'a'.repeat(64),
    name: 'Alice',
    lastMsg: 'See you tomorrow!',
    time: '10:30 AM',
    unread: 2,
    avatar: 'https://picsum.photos/seed/alice/100/100',
  },
  {
    id: 'bob',
    pubkey: 'b'.repeat(64),
    name: 'Bob',
    lastMsg: 'Did you check the relay?',
    time: 'Yesterday',
    unread: 0,
    avatar: 'https://picsum.photos/seed/bob/100/100',
  },
  {
    id: 'charlie',
    pubkey: 'c'.repeat(64),
    name: 'Charlie',
    lastMsg: 'The protocol is working.',
    time: 'Monday',
    unread: 0,
    avatar: 'https://picsum.photos/seed/charlie/100/100',
  },
]

const MOCK_MESSAGES: Record<string, NostrMessage[]> = {
  [MOCK_CONTACTS[0].pubkey]: [
    {
      id: '1',
      text: 'Hey there!',
      sender: 'them',
      timestamp: new Date(Date.now() - 3600000),
      senderPubkey: MOCK_CONTACTS[0].pubkey,
    },
    {
      id: '2',
      text: 'Hello! How are you?',
      sender: 'me',
      timestamp: new Date(Date.now() - 3000000),
    },
  ],
  [MOCK_CONTACTS[1].pubkey]: [
    {
      id: '1',
      text: 'Did you check the relay?',
      sender: 'them',
      timestamp: new Date(Date.now() - 86400000),
      senderPubkey: MOCK_CONTACTS[1].pubkey,
    },
  ],
  [MOCK_CONTACTS[2].pubkey]: [
    {
      id: '1',
      text: 'The protocol is working.',
      sender: 'them',
      timestamp: new Date(Date.now() - 172800000),
      senderPubkey: MOCK_CONTACTS[2].pubkey,
    },
  ],
}

export class MockNostrAdapter implements INostrAdapter {
  private contacts: NostrContact[] = [...MOCK_CONTACTS]
  private chats: NostrChat[] = [...MOCK_CHATS]
  private messages: Map<string, NostrMessage[]> = new Map(
    Object.entries(MOCK_MESSAGES)
  )
  private relays: string[] = ['wss://relay.damus.io']

  async getChats(): Promise<NostrChat[]> {
    return [...this.chats]
  }

  async getMessages(contactPubkey: string): Promise<NostrMessage[]> {
    return [...(this.messages.get(contactPubkey) || [])]
  }

  async sendMessage(
    contactPubkey: string,
    text: string
  ): Promise<NostrResult<NostrMessage>> {
    const msg: NostrMessage = {
      id: Date.now().toString(),
      text,
      sender: 'me',
      timestamp: new Date(),
    }
    const existing = this.messages.get(contactPubkey) || []
    this.messages.set(contactPubkey, [...existing, msg])

    // Update last message in chats
    this.chats = this.chats.map(c =>
      c.pubkey === contactPubkey
        ? { ...c, lastMsg: text, time: 'Just now', unread: 0 }
        : c
    )

    return { success: true, data: msg }
  }

  subscribeToMessages(
    contactPubkey: string,
    callback: (msg: NostrMessage) => void
  ): () => void {
    // Simulate receiving a message after 2 seconds
    const timer = setTimeout(() => {
      const contact = this.contacts.find(c => c.pubkey === contactPubkey)
      const autoMsg: NostrMessage = {
        id: `auto-${Date.now()}`,
        text: `Auto reply from ${contact?.name || 'contact'}`,
        sender: 'them',
        timestamp: new Date(),
        senderPubkey: contactPubkey,
      }
      const existing = this.messages.get(contactPubkey) || []
      this.messages.set(contactPubkey, [...existing, autoMsg])
      callback(autoMsg)
    }, 2000)

    return () => clearTimeout(timer)
  }

  async getContacts(): Promise<NostrContact[]> {
    return [...this.contacts]
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
        if (decoded.type === 'npub') {
          pubkey = decoded.data as string
        }
      } catch {
        pubkey = encoded
      }
    } else if (pubkeyOrNpub.startsWith('npub1')) {
      try {
        const { decode } = await import('nostr-tools/nip19')
        const decoded = decode(pubkeyOrNpub)
        if (decoded.type === 'npub') {
          pubkey = decoded.data as string
        }
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

    this.contacts = [newContact, ...this.contacts]

    const newChat: NostrChat = {
      id: newContact.id,
      pubkey,
      name: newContact.name,
      lastMsg: 'Started a new conversation',
      time: 'Just now',
      unread: 0,
      avatar: newContact.avatar || '',
    }
    this.chats = [newChat, ...this.chats]

    return { success: true, data: newContact }
  }

  async removeContact(pubkey: string): Promise<NostrResult> {
    const before = this.contacts.length
    this.contacts = this.contacts.filter(c => c.pubkey !== pubkey)
    this.chats = this.chats.filter(c => c.pubkey !== pubkey)

    if (this.contacts.length === before) {
      return { success: false, error: 'Contact not found' }
    }
    return { success: true, data: undefined }
  }

  async getProfile(pubkey: string): Promise<NostrProfile | null> {
    const contact = this.contacts.find(c => c.pubkey === pubkey)
    if (!contact) return null
    return {
      pubkey,
      name: contact.name,
      displayName: contact.name,
      picture: contact.avatar || `https://picsum.photos/seed/${pubkey.slice(0, 8)}/100/100`,
    }
  }

  async updateProfile(profile: Partial<NostrProfile>): Promise<NostrResult> {
    console.log('[MockAdapter] updateProfile:', profile)
    return { success: true, data: undefined }
  }

  getRelays(): string[] {
    return [...this.relays]
  }

  async setRelays(relays: string[]): Promise<NostrResult> {
    this.relays = [...relays]
    return { success: true, data: undefined }
  }
}
