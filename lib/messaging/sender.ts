// sender.ts - Message sending logic for CLI
// Extracted from use-messages.ts and real-adapter.ts

import { buildDirectMessageEvent, createGiftWrap } from '@/lib/welshman/crypto'
import { publishEvent, connectToRelays } from '@/lib/welshman/relay-manager'
import type { SignedEvent } from '@welshman/util'

let seqCounter = 0

/**
 * Increment and return the next sequence number for a conversation.
 */
function nextSeq(): number {
  return ++seqCounter
}

/**
 * Get default message TTL from environment variable.
 * Returns TTL in seconds, or 0 for permanent storage.
 */
function getDefaultTtl(): number {
  const ttl = parseInt(process.env.DEFAULT_MESSAGE_TTL || '0', 10)
  return ttl > 0 ? ttl : 0
}

export interface SendResult {
  eventId: string
  success: boolean
  relayCount: number
  error?: string
}

/**
 * Build and publish a DM event to relays.
 * Uses NIP-59 gift wrap for privacy.
 * Uses NIP-40 expiration tag for message TTL.
 */
export async function sendDirectMessage(
  content: string,
  recipientPubkey: string,
  senderPrivkeyHex: string,
  relayUrls: string[],
  ttl?: number
): Promise<SendResult> {
  try {
    // Connect to relays first
    connectToRelays(relayUrls)

    // Calculate expiration timestamp if TTL is set
    const messageTtl = ttl ?? getDefaultTtl()
    const expiration = messageTtl > 0 ? Math.floor(Date.now() / 1000) + messageTtl : undefined

    // Build inner kind-14 DM event — content is always wrapped as { text }
    const seq = nextSeq()
    const innerEvent = buildDirectMessageEvent(JSON.stringify({ text: content }), recipientPubkey, senderPrivkeyHex, seq, expiration) as SignedEvent

    // Gift wrap for recipient
    const wrapForRecipient = await createGiftWrap(innerEvent, recipientPubkey, senderPrivkeyHex)

    // Publish wrapped event
    const results = await publishEvent(wrapForRecipient, relayUrls, { timeout: 10000 })

    // Count successful relays (welshman publish returns status 'success')
    const successCount = Object.values(results).filter(
      (r) => (r as any).status === 'success' || (r as any).status === 'published'
    ).length

    return {
      eventId: wrapForRecipient.id,
      success: successCount > 0,
      relayCount: successCount,
      error: successCount === 0 ? 'Failed to publish to any relay' : undefined,
    }
  } catch (error) {
    console.error('[sender] Failed to send message:', error)
    return {
      eventId: '',
      success: false,
      relayCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
