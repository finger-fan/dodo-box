import { describe, it, expect } from 'vitest'
import {
  detectGaps,
  insertGapIndicators,
  isGapIndicator,
  type ChatItem,
  type GapIndicator,
} from '@/lib/nostr/gap-detection'
import type { NostrMessage } from '@/lib/nostr/types'

function makeMsg(overrides: Partial<NostrMessage> & { id: string }): NostrMessage {
  return {
    text: 'hello',
    sender: 'them',
    timestamp: new Date('2026-03-22T10:00:00Z'),
    ...overrides,
  }
}

describe('detectGaps', () => {
  it('returns empty array when messages have no seq', () => {
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', senderPubkey: 'alice' }),
      makeMsg({ id: '2', senderPubkey: 'alice' }),
    ]
    expect(detectGaps(msgs)).toEqual([])
  })

  it('returns empty array when only one message has seq', () => {
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', senderPubkey: 'alice', seq: 1 }),
    ]
    expect(detectGaps(msgs)).toEqual([])
  })

  it('returns empty array for consecutive seq values', () => {
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', senderPubkey: 'alice', seq: 1, timestamp: new Date('2026-03-22T10:00:00Z') }),
      makeMsg({ id: '2', senderPubkey: 'alice', seq: 2, timestamp: new Date('2026-03-22T10:01:00Z') }),
      makeMsg({ id: '3', senderPubkey: 'alice', seq: 3, timestamp: new Date('2026-03-22T10:02:00Z') }),
    ]
    expect(detectGaps(msgs)).toEqual([])
  })

  it('detects a single gap', () => {
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', senderPubkey: 'alice', seq: 1, timestamp: new Date('2026-03-22T10:00:00Z') }),
      makeMsg({ id: '2', senderPubkey: 'alice', seq: 4, timestamp: new Date('2026-03-22T10:03:00Z') }),
    ]
    const gaps = detectGaps(msgs)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toEqual({
      senderPubkey: 'alice',
      afterSeq: 1,
      beforeSeq: 4,
      missingCount: 2,
      afterTimestamp: new Date('2026-03-22T10:00:00Z'),
      beforeTimestamp: new Date('2026-03-22T10:03:00Z'),
    })
  })

  it('detects multiple gaps for the same sender', () => {
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', senderPubkey: 'alice', seq: 1, timestamp: new Date('2026-03-22T10:00:00Z') }),
      makeMsg({ id: '2', senderPubkey: 'alice', seq: 3, timestamp: new Date('2026-03-22T10:02:00Z') }),
      makeMsg({ id: '3', senderPubkey: 'alice', seq: 6, timestamp: new Date('2026-03-22T10:05:00Z') }),
    ]
    const gaps = detectGaps(msgs)
    expect(gaps).toHaveLength(2)
    expect(gaps[0].missingCount).toBe(1)
    expect(gaps[0].afterSeq).toBe(1)
    expect(gaps[0].beforeSeq).toBe(3)
    expect(gaps[1].missingCount).toBe(2)
    expect(gaps[1].afterSeq).toBe(3)
    expect(gaps[1].beforeSeq).toBe(6)
  })

  it('detects gaps per sender independently', () => {
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', senderPubkey: 'alice', seq: 1, timestamp: new Date('2026-03-22T10:00:00Z') }),
      makeMsg({ id: '2', senderPubkey: 'alice', seq: 3, timestamp: new Date('2026-03-22T10:02:00Z') }),
      makeMsg({ id: '3', senderPubkey: 'bob', seq: 1, timestamp: new Date('2026-03-22T10:00:00Z') }),
      makeMsg({ id: '4', senderPubkey: 'bob', seq: 2, timestamp: new Date('2026-03-22T10:01:00Z') }),
    ]
    const gaps = detectGaps(msgs)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].senderPubkey).toBe('alice')
  })

  it('ignores messages without seq', () => {
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', senderPubkey: 'alice', seq: 1, timestamp: new Date('2026-03-22T10:00:00Z') }),
      makeMsg({ id: 'no-seq', senderPubkey: 'alice' }),
      makeMsg({ id: '2', senderPubkey: 'alice', seq: 2, timestamp: new Date('2026-03-22T10:02:00Z') }),
    ]
    expect(detectGaps(msgs)).toEqual([])
  })

  it('ignores messages without senderPubkey', () => {
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', seq: 1 }),
      makeMsg({ id: '2', seq: 5 }),
    ]
    expect(detectGaps(msgs)).toEqual([])
  })
})

describe('insertGapIndicators', () => {
  it('returns messages as-is when no gaps', () => {
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', senderPubkey: 'alice', seq: 1 }),
      makeMsg({ id: '2', senderPubkey: 'alice', seq: 2 }),
    ]
    const result = insertGapIndicators(msgs, [])
    expect(result).toHaveLength(2)
    expect(result.every(item => !isGapIndicator(item))).toBe(true)
  })

  it('inserts gap indicator after the correct message', () => {
    const t1 = new Date('2026-03-22T10:00:00Z')
    const t2 = new Date('2026-03-22T10:03:00Z')
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', senderPubkey: 'alice', seq: 1, timestamp: t1 }),
      makeMsg({ id: '2', senderPubkey: 'alice', seq: 4, timestamp: t2 }),
    ]
    const gaps = detectGaps(msgs)
    const result = insertGapIndicators(msgs, gaps)

    expect(result).toHaveLength(3)
    expect(isGapIndicator(result[0])).toBe(false)
    expect(isGapIndicator(result[1])).toBe(true)
    expect(isGapIndicator(result[2])).toBe(false)

    const indicator = result[1] as GapIndicator
    expect(indicator.id).toBe('gap-alice-1-4')
    expect(indicator.gap.missingCount).toBe(2)
    expect(indicator.status).toBe('detected')
  })

  it('inserts multiple gap indicators in correct positions', () => {
    const msgs: NostrMessage[] = [
      makeMsg({ id: '1', senderPubkey: 'alice', seq: 1, timestamp: new Date('2026-03-22T10:00:00Z') }),
      makeMsg({ id: '2', senderPubkey: 'alice', seq: 3, timestamp: new Date('2026-03-22T10:02:00Z') }),
      makeMsg({ id: '3', senderPubkey: 'alice', seq: 6, timestamp: new Date('2026-03-22T10:05:00Z') }),
    ]
    const gaps = detectGaps(msgs)
    const result = insertGapIndicators(msgs, gaps)

    // msg1, gap1, msg2, gap2, msg3
    expect(result).toHaveLength(5)
    expect(isGapIndicator(result[0])).toBe(false)
    expect(isGapIndicator(result[1])).toBe(true)
    expect(isGapIndicator(result[2])).toBe(false)
    expect(isGapIndicator(result[3])).toBe(true)
    expect(isGapIndicator(result[4])).toBe(false)
  })
})

describe('isGapIndicator', () => {
  it('returns true for gap indicators', () => {
    const gap: GapIndicator = {
      type: 'gap',
      id: 'gap-alice-1-3',
      gap: {
        senderPubkey: 'alice',
        afterSeq: 1,
        beforeSeq: 3,
        missingCount: 1,
        afterTimestamp: new Date(),
        beforeTimestamp: new Date(),
      },
      status: 'detected',
    }
    expect(isGapIndicator(gap)).toBe(true)
  })

  it('returns false for regular messages', () => {
    const msg = makeMsg({ id: '1' })
    expect(isGapIndicator(msg)).toBe(false)
  })

  it('returns false for messages with a type-like field but wrong value', () => {
    const msg = makeMsg({ id: '1' }) as ChatItem
    expect(isGapIndicator(msg)).toBe(false)
  })
})
