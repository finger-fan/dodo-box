// gap-detection.ts - Detect sequence gaps and insert gap indicators into message lists

import type { NostrMessage } from './types'

export interface SeqGap {
  senderPubkey: string
  afterSeq: number
  beforeSeq: number
  missingCount: number
  afterTimestamp: Date
  beforeTimestamp: Date
}

export type GapIndicator = {
  type: 'gap'
  id: string
  gap: SeqGap
  status: 'detected' | 'recovering' | 'unrecoverable'
}

export type ChatItem = NostrMessage | GapIndicator

export function isGapIndicator(item: ChatItem): item is GapIndicator {
  return 'type' in item && (item as GapIndicator).type === 'gap'
}

/**
 * Scan sorted messages and find seq gaps per sender.
 * Messages without seq are ignored. Requires >= 2 seq messages per sender.
 */
export function detectGaps(messages: ReadonlyArray<NostrMessage>): SeqGap[] {
  // Group messages with seq by senderPubkey
  const bySender = new Map<string, NostrMessage[]>()

  for (const msg of messages) {
    if (msg.seq === undefined || !msg.senderPubkey) continue
    const existing = bySender.get(msg.senderPubkey)
    if (existing) {
      existing.push(msg)
    } else {
      bySender.set(msg.senderPubkey, [msg])
    }
  }

  const gaps: SeqGap[] = []

  for (const [senderPubkey, msgs] of bySender) {
    if (msgs.length < 2) continue

    // Sort by seq ascending
    const sorted = [...msgs].sort((a, b) => a.seq! - b.seq!)

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]
      const next = sorted[i + 1]
      const currentSeq = current.seq!
      const nextSeq = next.seq!

      if (nextSeq - currentSeq > 1) {
        gaps.push({
          senderPubkey,
          afterSeq: currentSeq,
          beforeSeq: nextSeq,
          missingCount: nextSeq - currentSeq - 1,
          afterTimestamp: current.timestamp,
          beforeTimestamp: next.timestamp,
        })
      }
    }
  }

  return gaps
}

/**
 * Insert gap indicators into the message list at the correct positions.
 * Each gap is placed after the message with afterSeq from the same sender.
 */
export function insertGapIndicators(
  messages: ReadonlyArray<NostrMessage>,
  gaps: ReadonlyArray<SeqGap>
): ChatItem[] {
  if (gaps.length === 0) return messages as unknown as ChatItem[]

  // Build a lookup: senderPubkey+afterSeq -> gap
  const gapAfterMap = new Map<string, SeqGap>()
  for (const gap of gaps) {
    gapAfterMap.set(`${gap.senderPubkey}:${gap.afterSeq}`, gap)
  }

  const result: ChatItem[] = []

  for (const msg of messages) {
    result.push(msg)

    if (msg.seq !== undefined && msg.senderPubkey) {
      const key = `${msg.senderPubkey}:${msg.seq}`
      const gap = gapAfterMap.get(key)
      if (gap) {
        result.push({
          type: 'gap',
          id: `gap-${gap.senderPubkey}-${gap.afterSeq}-${gap.beforeSeq}`,
          gap,
          status: 'detected',
        })
      }
    }
  }

  return result
}
