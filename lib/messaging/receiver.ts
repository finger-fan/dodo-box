// receiver.ts - Message receiving logic for CLI
// Extracted from use-messages.ts and real-adapter.ts

import { subscribe, connectToRelays } from '@/lib/welshman/relay-manager'
import { decryptGiftWrap } from '@/lib/welshman/crypto'
import type { TrustedEvent, SignedEvent } from '@welshman/util'

export interface ReceivedMessage {
  id: string
  text: string
  senderPubkey: string
  timestamp: Date
  seq?: number
}

export type MessageCallback = (msg: ReceivedMessage) => void

/**
 * Parse a decrypted inner event into a ReceivedMessage.
 */
function parseInnerEvent(event: SignedEvent): ReceivedMessage | null {
  try {
    // Try to parse as JSON first (newer format)
    let text: string
    try {
      const data = JSON.parse(event.content)
      text = typeof data === 'string' ? data : data.text || data.content || ''
    } catch {
      // Fallback: treat as plain text (older format or direct string)
      text = event.content
    }

    if (!text) return null

    const tags = event.tags
    const senderPubkey = event.pubkey
    const seqTag = tags.find((t) => t[0] === 'seq')
    const seq = seqTag ? parseInt(seqTag[1], 10) : undefined

    return {
      id: event.id,
      text,
      senderPubkey,
      timestamp: new Date(event.created_at * 1000),
      seq,
    }
  } catch (err) {
    console.error('[receiver] Failed to parse inner event:', err, event)
    return null
  }
}

/**
 * Start subscribing to DM wraps addressed to our pubkey.
 * Returns an AbortController to cancel the subscription.
 */
export function startReceiving(
  myPubkey: string,
  myPrivkey: string,
  relayUrls: string[],
  onMessage: MessageCallback
): AbortController {
  connectToRelays(relayUrls)

  // Filter: kind-1059 (gift wrap) addressed to us
  const filters = [{
    kinds: [1059],
    '#p': [myPubkey],
    limit: 20,
  }]

  // Deduplicate events by ID to prevent processing the same message multiple times
  const seenEventIds = new Set<string>()

  const controller = subscribe(filters, relayUrls, async (event: TrustedEvent) => {
    // Deduplicate by event ID
    if (seenEventIds.has(event.id)) return
    seenEventIds.add(event.id)

    const signedEvent = event as unknown as SignedEvent

    // Decrypt the gift wrap
    const inner = await decryptGiftWrap(signedEvent, myPrivkey)
    if (!inner) return

    // Parse into our message format
    const msg = parseInnerEvent(inner as SignedEvent)
    if (!msg) return

    onMessage(msg)
  })

  return controller
}
