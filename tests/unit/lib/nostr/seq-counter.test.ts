
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getSeqCounter,
  incrementSeqCounter,
  recoverSeqCounter,
  parseSeqTag,
} from '@/lib/nostr/seq-counter'

const MY_PUBKEY = 'a'.repeat(64)
const CONTACT_PUBKEY = 'b'.repeat(64)

describe('seq-counter', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
      get length() { return Object.keys(store).length },
      key: (i: number) => Object.keys(store)[i] ?? null,
    } as Storage)
  })

  it('T-MSG-01: orders out-of-order messages by seq when timestamps equal', () => {
    const messages = [
      { id: '1', text: 'second', sender: 'them' as const, timestamp: new Date('2024-01-01T00:00:00Z'), senderPubkey: CONTACT_PUBKEY, seq: 2 },
      { id: '2', text: 'first', sender: 'them' as const, timestamp: new Date('2024-01-01T00:00:00Z'), senderPubkey: CONTACT_PUBKEY, seq: 1 },
      { id: '3', text: 'third', sender: 'them' as const, timestamp: new Date('2024-01-01T00:00:00Z'), senderPubkey: CONTACT_PUBKEY, seq: 3 },
    ]
    messages.sort((a, b) => {
      const timeDiff = a.timestamp.getTime() - b.timestamp.getTime()
      if (timeDiff !== 0) return timeDiff
      if (a.senderPubkey && a.senderPubkey === b.senderPubkey) {
        return (a.seq ?? 0) - (b.seq ?? 0)
      }
      return 0
    })
    expect(messages.map(m => m.seq)).toEqual([1, 2, 3])
    expect(messages.map(m => m.text)).toEqual(['first', 'second', 'third'])
  })

  it('increments and persists seq counter', () => {
    expect(getSeqCounter(MY_PUBKEY, CONTACT_PUBKEY)).toBe(0)
    expect(incrementSeqCounter(MY_PUBKEY, CONTACT_PUBKEY)).toBe(1)
    expect(incrementSeqCounter(MY_PUBKEY, CONTACT_PUBKEY)).toBe(2)
    expect(getSeqCounter(MY_PUBKEY, CONTACT_PUBKEY)).toBe(2)
  })

  it('recovers seq counter from messages sent by me', () => {
    incrementSeqCounter(MY_PUBKEY, CONTACT_PUBKEY)
    const messages = [
      { senderPubkey: MY_PUBKEY, seq: 5 },
      { senderPubkey: CONTACT_PUBKEY, seq: 2 },
      { senderPubkey: MY_PUBKEY, seq: 3 },
    ]
    recoverSeqCounter(MY_PUBKEY, CONTACT_PUBKEY, messages)
    expect(getSeqCounter(MY_PUBKEY, CONTACT_PUBKEY)).toBe(5)
  })

  it('parseSeqTag extracts seq from tags', () => {
    expect(parseSeqTag([['seq', '7']])).toBe(7)
    expect(parseSeqTag([['other', '7']])).toBeUndefined()
    expect(parseSeqTag([])).toBeUndefined()
  })
})
