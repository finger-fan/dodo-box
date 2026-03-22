// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSeqCounter,
  incrementSeqCounter,
  recoverSeqCounter,
  parseSeqTag,
} from '@/lib/nostr/seq-counter'

const MY_PUB = 'a'.repeat(64)
const CONTACT_PUB = 'b'.repeat(64)

describe('getSeqCounter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns 0 when no counter exists', () => {
    expect(getSeqCounter(MY_PUB, CONTACT_PUB)).toBe(0)
  })

  it('returns stored value', () => {
    localStorage.setItem(`dodobox_seq_${MY_PUB}_${CONTACT_PUB}`, '5')
    expect(getSeqCounter(MY_PUB, CONTACT_PUB)).toBe(5)
  })

  it('returns 0 for non-numeric values', () => {
    localStorage.setItem(`dodobox_seq_${MY_PUB}_${CONTACT_PUB}`, 'abc')
    expect(getSeqCounter(MY_PUB, CONTACT_PUB)).toBe(0)
  })
})

describe('incrementSeqCounter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('increments from 0 to 1 on first call', () => {
    const val = incrementSeqCounter(MY_PUB, CONTACT_PUB)
    expect(val).toBe(1)
    expect(getSeqCounter(MY_PUB, CONTACT_PUB)).toBe(1)
  })

  it('increments sequentially', () => {
    expect(incrementSeqCounter(MY_PUB, CONTACT_PUB)).toBe(1)
    expect(incrementSeqCounter(MY_PUB, CONTACT_PUB)).toBe(2)
    expect(incrementSeqCounter(MY_PUB, CONTACT_PUB)).toBe(3)
  })

  it('maintains separate counters per contact', () => {
    const otherContact = 'c'.repeat(64)
    incrementSeqCounter(MY_PUB, CONTACT_PUB)
    incrementSeqCounter(MY_PUB, CONTACT_PUB)
    incrementSeqCounter(MY_PUB, otherContact)

    expect(getSeqCounter(MY_PUB, CONTACT_PUB)).toBe(2)
    expect(getSeqCounter(MY_PUB, otherContact)).toBe(1)
  })
})

describe('recoverSeqCounter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('recovers counter from messages', () => {
    const messages = [
      { senderPubkey: MY_PUB, seq: 3 },
      { senderPubkey: MY_PUB, seq: 7 },
      { senderPubkey: MY_PUB, seq: 5 },
    ]
    recoverSeqCounter(MY_PUB, CONTACT_PUB, messages)
    expect(getSeqCounter(MY_PUB, CONTACT_PUB)).toBe(7)
  })

  it('only adjusts upward, never downward', () => {
    localStorage.setItem(`dodobox_seq_${MY_PUB}_${CONTACT_PUB}`, '10')
    const messages = [
      { senderPubkey: MY_PUB, seq: 3 },
      { senderPubkey: MY_PUB, seq: 5 },
    ]
    recoverSeqCounter(MY_PUB, CONTACT_PUB, messages)
    expect(getSeqCounter(MY_PUB, CONTACT_PUB)).toBe(10)
  })

  it('ignores messages from other senders', () => {
    const otherPub = 'd'.repeat(64)
    const messages = [
      { senderPubkey: otherPub, seq: 100 },
      { senderPubkey: MY_PUB, seq: 2 },
    ]
    recoverSeqCounter(MY_PUB, CONTACT_PUB, messages)
    expect(getSeqCounter(MY_PUB, CONTACT_PUB)).toBe(2)
  })

  it('ignores messages without seq', () => {
    const messages = [
      { senderPubkey: MY_PUB, seq: undefined },
      { senderPubkey: MY_PUB, seq: undefined },
    ]
    recoverSeqCounter(MY_PUB, CONTACT_PUB, messages)
    expect(getSeqCounter(MY_PUB, CONTACT_PUB)).toBe(0)
  })
})

describe('parseSeqTag', () => {
  it('extracts seq value from tags', () => {
    const tags = [['p', 'somepubkey'], ['seq', '42']]
    expect(parseSeqTag(tags)).toBe(42)
  })

  it('returns undefined when no seq tag', () => {
    const tags = [['p', 'somepubkey'], ['e', 'someid']]
    expect(parseSeqTag(tags)).toBeUndefined()
  })

  it('returns undefined for empty tags', () => {
    expect(parseSeqTag([])).toBeUndefined()
  })

  it('returns undefined for non-numeric seq value', () => {
    const tags = [['seq', 'notanumber']]
    expect(parseSeqTag(tags)).toBeUndefined()
  })

  it('returns undefined for seq tag without value', () => {
    const tags = [['seq']]
    expect(parseSeqTag(tags)).toBeUndefined()
  })
})
