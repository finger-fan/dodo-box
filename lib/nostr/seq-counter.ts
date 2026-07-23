// seq-counter.ts - Per-sender per-conversation sequence counter for message ordering

import type { NostrMessage } from './types'
import { store, StorageKey } from '@/lib/storage'

/**
 * Read the current sequence counter value (defaults to 0).
 */
export function getSeqCounter(myPubkey: string, contactPubkey: string): number {
  const key = `${StorageKey.SEQ_COUNTER}_${myPubkey}_${contactPubkey}`
  const val = store.get<number>(key, 0) ?? 0
  return Number.isFinite(val) ? val : 0
}

/**
 * Increment the counter by 1 and persist. Returns the new value.
 */
export function incrementSeqCounter(myPubkey: string, contactPubkey: string): number {
  const key = `${StorageKey.SEQ_COUNTER}_${myPubkey}_${contactPubkey}`
  const current = getSeqCounter(myPubkey, contactPubkey)
  const next = current + 1
  store.set(key, next)
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

  const key = `${StorageKey.SEQ_COUNTER}_${myPubkey}_${contactPubkey}`
  store.set(key, maxSeen)
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
