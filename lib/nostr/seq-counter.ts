// seq-counter.ts - Per-sender per-conversation sequence counter for message ordering

import type { NostrMessage } from './types'

const KEY_PREFIX = 'dodobox_seq'

function storageKey(myPubkey: string, contactPubkey: string): string {
  return `${KEY_PREFIX}_${myPubkey}_${contactPubkey}`
}

/**
 * Read the current sequence counter value (defaults to 0).
 */
export function getSeqCounter(myPubkey: string, contactPubkey: string): number {
  try {
    const raw = localStorage.getItem(storageKey(myPubkey, contactPubkey))
    if (raw === null) return 0
    const val = parseInt(raw, 10)
    return Number.isFinite(val) ? val : 0
  } catch {
    return 0
  }
}

/**
 * Increment the counter by 1 and persist. Returns the new value.
 */
export function incrementSeqCounter(myPubkey: string, contactPubkey: string): number {
  const current = getSeqCounter(myPubkey, contactPubkey)
  const next = current + 1
  try {
    localStorage.setItem(storageKey(myPubkey, contactPubkey), String(next))
  } catch {
    // localStorage unavailable — degrade gracefully
  }
  return next
}

/**
 * Scan fetched messages and recover the counter to the highest seen seq
 * for messages sent by myPubkey. Only adjusts upward, never downward.
 */
export function recoverSeqCounter(
  myPubkey: string,
  contactPubkey: string,
  messages: ReadonlyArray<Pick<NostrMessage, 'senderPubkey' | 'seq'>>
): void {
  let maxSeen = getSeqCounter(myPubkey, contactPubkey)

  for (const msg of messages) {
    if (msg.senderPubkey === myPubkey && msg.seq !== undefined && msg.seq > maxSeen) {
      maxSeen = msg.seq
    }
  }

  try {
    localStorage.setItem(storageKey(myPubkey, contactPubkey), String(maxSeen))
  } catch {
    // localStorage unavailable
  }
}

/**
 * Extract seq value from a Nostr event tags array.
 * Returns undefined if no seq tag is present.
 */
export function parseSeqTag(tags: ReadonlyArray<ReadonlyArray<string>>): number | undefined {
  const seqTag = tags.find(t => t[0] === 'seq')
  if (!seqTag || !seqTag[1]) return undefined
  const val = parseInt(seqTag[1], 10)
  return Number.isFinite(val) ? val : undefined
}
