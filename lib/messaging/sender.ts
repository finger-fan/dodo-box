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

export interface SendResult {
  eventId: string
  success: boolean
  relayCount: number
  error?: string
}

/**
 * Build and publish a DM event to relays.
 * Uses NIP-59 gift wrap for privacy.
 */
export async function sendDirectMessage(
  content: string,
  recipientPubkey: string,
  senderPrivkeyHex: string,
  relayUrls: string[]
): Promise<SendResult> {
  try {
    // Connect to relays first
    connectToRelays(relayUrls)

    // Build inner kind-14 DM event
    const seq = nextSeq()
    const innerEvent = buildDirectMessageEvent(content, recipientPubkey, senderPrivkeyHex, seq) as SignedEvent

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
