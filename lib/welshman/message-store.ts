// message-store.ts - Query messages from welshman Repository
// Provides functions to derive message lists from the central event store

import type { TrustedEvent, SignedEvent, HashedEvent } from '@welshman/util'
import { DIRECT_MESSAGE, WRAP } from '@welshman/util'
import { getRepository, getWrapManager } from './engine'
import type { NostrMessage } from '@/lib/nostr/types'

/**
 * Parse seq tag from event tags.
 */
function parseSeqTag(tags: string[][]): number | undefined {
  const seqTag = tags.find(t => t[0] === 'seq')
  if (!seqTag || !seqTag[1]) return undefined
  const val = parseInt(seqTag[1], 10)
  return Number.isFinite(val) ? val : undefined
}

/**
 * Query decrypted DM events (kind 14) from the Repository for a specific conversation.
 *
 * @param myPubkey - Current user's pubkey
 * @param contactPubkey - The conversation partner's pubkey
 * @returns Sorted array of NostrMessages
 */
export function getMessagesFromRepository(
  myPubkey: string,
  contactPubkey: string
): NostrMessage[] {
  const repository = getRepository()

  // Query kind-14 events that are either from contact or from me to contact
  const events = repository.query([
    { kinds: [DIRECT_MESSAGE], authors: [contactPubkey] },
    { kinds: [DIRECT_MESSAGE], authors: [myPubkey] },
  ])

  const messages: NostrMessage[] = []

  for (const event of events) {
    const isFromContact = event.pubkey === contactPubkey
    const isFromMe =
      event.pubkey === myPubkey &&
      event.tags.some(t => t[0] === 'p' && t[1] === contactPubkey)

    if (!isFromContact && !isFromMe) continue

    messages.push({
      id: event.id,
      text: event.content,
      sender: isFromMe ? 'me' : 'them',
      timestamp: new Date(event.created_at * 1000),
      senderPubkey: event.pubkey,
      seq: parseSeqTag(event.tags),
    })
  }

  // Sort by timestamp, then by seq for same-sender ties
  messages.sort((a, b) => {
    const timeDiff = a.timestamp.getTime() - b.timestamp.getTime()
    if (timeDiff !== 0) return timeDiff
    if (a.senderPubkey && a.senderPubkey === b.senderPubkey) {
      return (a.seq ?? 0) - (b.seq ?? 0)
    }
    return 0
  })

  return messages
}

/**
 * Get all conversation partners (unique pubkeys) from stored DM events.
 *
 * @param myPubkey - Current user's pubkey
 * @returns Set of pubkeys that have DM history with the user
 */
export function getConversationPartners(myPubkey: string): Set<string> {
  const repository = getRepository()
  const partners = new Set<string>()

  // Messages sent to me
  const received = repository.query([
    { kinds: [DIRECT_MESSAGE] },
  ])

  for (const event of received) {
    if (event.pubkey !== myPubkey) {
      // Messages from others — they are the partner
      const recipientTag = event.tags.find(t => t[0] === 'p' && t[1] === myPubkey)
      if (recipientTag) {
        partners.add(event.pubkey)
      }
    } else {
      // Messages from me — the p-tagged pubkey is the partner
      const pTag = event.tags.find(t => t[0] === 'p' && t[1] !== myPubkey)
      if (pTag) {
        partners.add(pTag[1])
      }
    }
  }

  return partners
}

/**
 * Get the latest message in a conversation.
 */
export function getLatestMessage(
  myPubkey: string,
  contactPubkey: string
): NostrMessage | null {
  const messages = getMessagesFromRepository(myPubkey, contactPubkey)
  return messages.length > 0 ? messages[messages.length - 1] : null
}

/**
 * Store a decrypted rumor (kind-14 inner event) into the Repository.
 * This is called after decrypting a gift wrap to persist the plaintext event.
 */
export function storeDecryptedRumor(rumor: HashedEvent): void {
  const repository = getRepository()
  repository.publish(rumor as TrustedEvent)
}
