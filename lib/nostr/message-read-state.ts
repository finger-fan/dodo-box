// message-read-state.ts - 追踪每个聊天的“最新消息 ID”和“已读消息 ID”。
// 键按 contactPubkey 组织，localStorage 中实际 key 为 `${prefix}_${pubkey}`。

import { store, StorageKey } from '@/lib/storage'
import type { NostrChat } from './types'

function readKey(base: string, pubkey: string): string {
  return `${base}_${pubkey}`
}

export function getLastReadMessageId(pubkey: string): string | null {
  if (typeof window === 'undefined') return null
  return store.get<string>(readKey(StorageKey.LAST_READ_MESSAGE_ID, pubkey), '') || null
}

export function setLastReadMessageId(pubkey: string, messageId: string): void {
  if (typeof window === 'undefined' || !messageId) return
  store.set(readKey(StorageKey.LAST_READ_MESSAGE_ID, pubkey), messageId)
}

export function getLastMessageId(pubkey: string): string | null {
  if (typeof window === 'undefined') return null
  return store.get<string>(readKey(StorageKey.LAST_MESSAGE_ID, pubkey), '') || null
}

export function setLastMessageId(pubkey: string, messageId: string): void {
  if (typeof window === 'undefined' || !messageId) return
  store.set(readKey(StorageKey.LAST_MESSAGE_ID, pubkey), messageId)
}

export function hasUnreadMessages(pubkey: string): boolean {
  const lastRead = getLastReadMessageId(pubkey)
  const lastMessage = getLastMessageId(pubkey)
  if (!lastMessage) return false
  if (!lastRead) return true
  return lastMessage !== lastRead
}

export function chatHasUnreadMessages(chat: NostrChat): boolean {
  if (chat.lastMessageId) {
    const lastRead = getLastReadMessageId(chat.pubkey)
    return !lastRead || chat.lastMessageId !== lastRead
  }
  return hasUnreadMessages(chat.pubkey)
}

export function markMessagesRead(pubkey: string, messageId?: string): void {
  if (!messageId) return
  setLastReadMessageId(pubkey, messageId)
}
