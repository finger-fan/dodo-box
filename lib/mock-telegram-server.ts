// mock-telegram-server.ts - Server-side mock Telegram store and logic
// This module runs ONLY on the Next.js server.

export interface TelegramUser {
  id: number
  username: string
  first_name: string
  is_bot: boolean
}

export interface TelegramMessage {
  message_id: number
  chat_id: number
  text: string
  from: { id: number; username?: string }
  date: number
}

interface TelegramUpdate {
  update_id: number
  message: TelegramMessage
}

interface MockTelegramConfig {
  botToken: string
  botUserId: number
  botUsername: string
  botFirstName: string
  contacts: Array<{
    id: number
    username: string
    first_name: string
    responses: string[]
  }>
  initialMessages: Record<number, Array<{
    from: 'me' | 'them'
    text: string
    delayMin: number
  }>>
}

// ---- Singleton store (server-side only) ----

class MockTelegramStore {
  config: MockTelegramConfig | null = null
  users = new Map<number, TelegramUser>()
  chatMessages = new Map<number, TelegramMessage[]>()
  pendingUpdates: TelegramUpdate[] = []
  processedUpdateIds = new Set<number>()
  nextMessageId = 1
  replyCounters = new Map<number, number>()

  init(config: MockTelegramConfig) {
    if (this.config) return // already initialized
    this.config = config

    // Register bot user
    this.users.set(config.botUserId, {
      id: config.botUserId,
      username: config.botUsername,
      first_name: config.botFirstName,
      is_bot: true,
    })

    // Register contacts
    for (const c of config.contacts) {
      this.users.set(c.id, {
        id: c.id,
        username: c.username,
        first_name: c.first_name,
        is_bot: false,
      })
      this.replyCounters.set(c.id, 0)
    }

    // Seed initial messages
    const now = Math.floor(Date.now() / 1000)
    for (const [chatIdStr, msgs] of Object.entries(config.initialMessages)) {
      const chatId = parseInt(chatIdStr, 10)
      this.chatMessages.set(chatId, [])

      for (const m of msgs) {
        const userId = m.from === 'me' ? config.botUserId : chatId
        const msg: TelegramMessage = {
          message_id: this.nextMessageId++,
          chat_id: chatId,
          text: m.text,
          from: { id: userId, username: this.users.get(userId)?.username },
          date: now - m.delayMin * 60,
        }
        this.chatMessages.get(chatId)!.push(msg)
        if (m.from === 'them') {
          this._addUpdate(msg)
        }
      }
    }
  }

  getAllContacts(): Array<{ id: number; username: string; first_name: string; message_count: number }> {
    return Array.from(this.users.values())
      .filter(u => !u.is_bot)
      .map(u => ({
        id: u.id,
        username: u.username,
        first_name: u.first_name,
        message_count: this.chatMessages.get(u.id)?.length || 0,
      }))
  }

  getUser(id: number): TelegramUser | undefined {
    return this.users.get(id)
  }

  getMessages(chatId: number): TelegramMessage[] {
    return this.chatMessages.get(chatId) || []
  }

  addMessage(chatId: number, text: string, fromUserId: number): TelegramMessage {
    const msg: TelegramMessage = {
      message_id: this.nextMessageId++,
      chat_id: chatId,
      text,
      from: { id: fromUserId, username: this.users.get(fromUserId)?.username },
      date: Math.floor(Date.now() / 1000),
    }
    if (!this.chatMessages.has(chatId)) {
      this.chatMessages.set(chatId, [])
    }
    this.chatMessages.get(chatId)!.push(msg)
    this._addUpdate(msg)
    return msg
  }

  getPendingUpdates(offset = 0, limit = 100): TelegramUpdate[] {
    let updates = this.pendingUpdates.filter(u => u.update_id >= offset)
    if (limit) updates = updates.slice(0, limit)
    return updates
  }

  markUpdatesConsumed(offset: number) {
    this.pendingUpdates = this.pendingUpdates.filter(u => u.update_id < offset)
  }

  /**
   * Schedule an auto-reply for a chat. Resolves after a random delay.
   */
  scheduleAutoReply(chatId: number, _userText: string): Promise<void> {
    return new Promise((resolve) => {
      const configContact = this.config?.contacts.find(c => c.id === chatId)
      if (!configContact || configContact.responses.length === 0) {
        resolve()
        return
      }

      const counter = this.replyCounters.get(chatId) || 0
      const replyText = configContact.responses[counter % configContact.responses.length]
      this.replyCounters.set(chatId, counter + 1)

      const delay = 1000 + Math.random() * 4000 // 1-5 seconds
      setTimeout(() => {
        this.addMessage(chatId, replyText, this.config!.botUserId)
        resolve()
      }, delay)
    })
  }

  private _addUpdate(msg: TelegramMessage) {
    const updateId = msg.message_id + 100000
    if (this.processedUpdateIds.has(updateId)) return
    this.pendingUpdates.push({ update_id: updateId, message: msg })
    this.processedUpdateIds.add(updateId)
  }
}

export const store = new MockTelegramStore()
