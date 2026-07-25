// mock-telegram-adapter.ts - INostrAdapter implementation for mock Telegram service

import type {
  INostrAdapter,
  NostrChat,
  NostrMessage,
  NostrContact,
  NostrProfile,
  NostrResult,
  GetMessagesOptions,
} from './types'
import { defaultAvatar } from '@/lib/utils'

/**
 * Convert a Nostr-style pubkey to a Telegram chat_id.
 */
function pubkeyToChatId(pubkey: string): number {
  if (pubkey.startsWith('tg:')) return parseInt(pubkey.slice(3), 10)
  return parseInt(pubkey.slice(0, 8), 16) || 0
}

/**
 * Convert a Telegram chat_id to a Nostr-style pubkey.
 */
function chatIdToPubkey(chatId: number): string {
  return `tg:${chatId}`
}

interface TelegramUpdate {
  update_id: number
  message: {
    message_id: number
    chat_id: number
    text: string
    from: { id: number; username?: string }
    date: number
  }
}

interface TelegramContact {
  id: number
  chat_id: number
  username: string
  first_name: string
  message_count: number
}

export class MockTelegramAdapter implements INostrAdapter {
  private botToken: string
  private polling = false
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private lastUpdateId = 0
  private subscriptions = new Map<string, Set<(msg: NostrMessage) => void>>()
  private messageCache = new Map<string, NostrMessage[]>()
  private contactsCache: NostrContact[] = []
  private chatsCache: NostrChat[] = []
  private seqCounters = new Map<string, number>()

  constructor() {
    this.botToken = process.env.NEXT_PUBLIC_MOCK_TELEGRAM_TOKEN || 'mock-bot-token-12345'
  }

  private get apiBase(): string {
    // In browser: use relative path (same origin)
    if (typeof window !== 'undefined') return ''
    return 'http://localhost:18300'
  }

  private get botPath(): string {
    return `/api/telegram/bot${this.botToken}`
  }

  private async api<T>(path: string, options?: RequestInit): Promise<T | null> {
    try {
      const url = `${this.apiBase}${path}`
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.ok ? (data.result as T) : null
    } catch {
      return null
    }
  }

  private async apiPost<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
    return this.api<T>(path, { method: 'POST', body: JSON.stringify(body) })
  }

  async getChats(): Promise<NostrChat[]> {
    if (this.chatsCache.length > 0) return [...this.chatsCache]

    const contacts = await this.getContacts()
    const chats: NostrChat[] = []

    for (const contact of contacts) {
      const chatId = pubkeyToChatId(contact.pubkey)
      const messages = await this.getMessages(contact.pubkey)
      const lastMsg = messages[messages.length - 1]

      chats.push({
        id: `chat-${chatId}`,
        pubkey: contact.pubkey,
        name: contact.name,
        lastMsg: '',
        time: lastMsg ? this.formatTime(lastMsg.timestamp) : '',
        unread: messages.filter(m => m.sender === 'them').length,
        avatar: defaultAvatar(contact.name),
        lastMessageId: lastMsg?.id,
      })
    }

    this.chatsCache = chats
    return [...this.chatsCache]
  }

  async getMessages(contactPubkey: string, opts?: GetMessagesOptions): Promise<NostrMessage[]> {
    const cacheKey = contactPubkey
    if (!this.messageCache.has(cacheKey)) {
      const chatId = pubkeyToChatId(contactPubkey)
      const messages = await this.fetchChatMessages(chatId)
      this.messageCache.set(cacheKey, messages)
    }

    let messages = [...this.messageCache.get(cacheKey)!]
    if (opts?.until !== undefined) {
      messages = messages.filter(m => m.timestamp.getTime() / 1000 <= opts.until!)
    }
    if (opts?.limit !== undefined && messages.length > opts.limit) {
      // Relays return the newest `limit` events; emulate that on the ascending list
      messages = messages.slice(-opts.limit)
    }
    return messages
  }

  private async fetchChatMessages(chatId: number): Promise<NostrMessage[]> {
    const allUpdates = await this.apiPost<TelegramUpdate[]>(`${this.botPath}/getUpdates`, {
      offset: 0, limit: 200, timeout: 1,
    })
    if (!allUpdates) return []

    const messages: NostrMessage[] = []
    const botUserId = 999999

    for (const update of allUpdates) {
      const msg = update.message
      if (msg.chat_id !== chatId) continue

      const isFromMe = msg.from?.id === botUserId
      const seq = this.getSeqForChat(chatId)

      messages.push({
        id: `msg-${msg.message_id}`,
        text: msg.text,
        sender: isFromMe ? 'me' : 'them',
        timestamp: new Date(msg.date * 1000),
        senderPubkey: isFromMe ? undefined : chatIdToPubkey(chatId),
        seq,
        sendStatus: isFromMe ? 'sent' : undefined,
      })
    }

    messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || (a.seq || 0) - (b.seq || 0))
    return messages
  }

  async sendMessage(contactPubkey: string, text: string): Promise<NostrResult<NostrMessage>> {
    const chatId = pubkeyToChatId(contactPubkey)
    const seq = this.incrementSeqForChat(chatId)

    const result = await this.apiPost<{ message_id: number; date: number; text: string }>(
      `${this.botPath}/sendMessage`, { chat_id: chatId, text }
    )

    if (!result) return { success: false, error: 'Failed to send message' }

    const msg: NostrMessage = {
      id: `msg-${result.message_id}`,
      text: result.text,
      sender: 'me',
      timestamp: new Date(result.date * 1000),
      seq,
      sendStatus: 'sent',
    }

    const cacheKey = contactPubkey
    const cached = this.messageCache.get(cacheKey) || []
    cached.push(msg)
    this.messageCache.set(cacheKey, cached)

    return { success: true, data: msg }
  }

  subscribeToMessages(
    contactPubkey: string,
    callback: (msg: NostrMessage) => void
  ): () => void {
    if (!this.subscriptions.has(contactPubkey)) {
      this.subscriptions.set(contactPubkey, new Set())
    }
    this.subscriptions.get(contactPubkey)!.add(callback)

    if (!this.polling) this.startPolling()

    return () => {
      const subs = this.subscriptions.get(contactPubkey)
      if (subs) {
        subs.delete(callback)
        if (subs.size === 0) this.subscriptions.delete(contactPubkey)
      }
      if (this.subscriptions.size === 0) this.stopPolling()
    }
  }

  private startPolling() {
    this.polling = true
    this.pollTimer = setInterval(() => this.pollForUpdates(), 2000)
  }

  private stopPolling() {
    this.polling = false
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
  }

  private async pollForUpdates() {
    const updates = await this.apiPost<TelegramUpdate[]>(`${this.botPath}/getUpdates`, {
      offset: this.lastUpdateId, limit: 50, timeout: 1,
    })
    if (!updates || updates.length === 0) return

    const botUserId = 999999

    for (const update of updates) {
      this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id + 1)
      const msg = update.message
      const contactPubkey = chatIdToPubkey(msg.chat_id)
      const callbacks = this.subscriptions.get(contactPubkey)
      if (!callbacks?.size) continue

      const isFromMe = msg.from?.id === botUserId
      const seq = isFromMe ? this.getSeqForChat(msg.chat_id) : this.incrementSeqForChat(msg.chat_id)

      const nostrMsg: NostrMessage = {
        id: `msg-${msg.message_id}`,
        text: msg.text,
        sender: isFromMe ? 'me' : 'them',
        timestamp: new Date(msg.date * 1000),
        senderPubkey: isFromMe ? undefined : contactPubkey,
        seq,
        sendStatus: isFromMe ? 'sent' : undefined,
      }

      const cacheKey = contactPubkey
      const cached = this.messageCache.get(cacheKey) || []
      cached.push(nostrMsg)
      this.messageCache.set(cacheKey, cached)

      for (const cb of callbacks) cb(nostrMsg)
    }
  }

  async getContacts(): Promise<NostrContact[]> {
    if (this.contactsCache.length > 0) return [...this.contactsCache]

    const contacts = await this.api<TelegramContact[]>('/api/telegram/contacts')
    if (!contacts) return []

    this.contactsCache = contacts.map(c => ({
      id: `contact-${c.id}`,
      name: c.first_name,
      pubkey: chatIdToPubkey(c.id),
      avatar: defaultAvatar(c.first_name),
    }))

    return [...this.contactsCache]
  }

  async addContact(pubkeyOrNpub: string): Promise<NostrResult<NostrContact>> {
    // In mock mode, contacts are pre-seeded. Adding dynamically is no-op for now.
    const existing = this.contactsCache.find(c => c.pubkey === pubkeyOrNpub)
    if (existing) return { success: true, data: existing }
    return { success: false, error: 'Contact not found in mock data' }
  }

  async removeContact(pubkey: string): Promise<NostrResult> {
    this.contactsCache = this.contactsCache.filter(c => c.pubkey !== pubkey)
    this.messageCache.delete(pubkey)
    this.chatsCache = this.chatsCache.filter(c => c.pubkey !== pubkey)
    return { success: true, data: undefined }
  }

  async getProfile(pubkey: string): Promise<NostrProfile | null> {
    const chatId = pubkeyToChatId(pubkey)
    const chatInfo = await this.api<{ id: number; first_name: string; username: string }>(
      `${this.botPath}/getChat?chat_id=${chatId}`
    )
    if (!chatInfo) return null
    return { pubkey, name: chatInfo.username, displayName: chatInfo.first_name }
  }

  async updateProfile(_profile: Partial<NostrProfile>): Promise<NostrResult> {
    return { success: true, data: undefined }
  }

  getRelays(): string[] {
    return ['mock://localhost']
  }

  async setRelays(_relays: string[]): Promise<NostrResult> {
    return { success: true, data: undefined }
  }

  async recoverMessages(contactPubkey: string, since: number, until: number): Promise<NostrMessage[]> {
    const messages = await this.getMessages(contactPubkey)
    return messages.filter(m => {
      const ts = m.timestamp.getTime() / 1000
      return ts >= since && ts <= until
    })
  }

  private getSeqForChat(chatId: number): number {
    return this.seqCounters.get(`chat-${chatId}`) || 0
  }

  private incrementSeqForChat(chatId: number): number {
    const key = `chat-${chatId}`
    const next = (this.seqCounters.get(key) || 0) + 1
    this.seqCounters.set(key, next)
    return next
  }

  private formatTime(date: Date): string {
    const diff = Date.now() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(diff / 3600000)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(diff / 86400000)
    if (days < 7) return `${days}d`
    return date.toLocaleDateString()
  }
}
