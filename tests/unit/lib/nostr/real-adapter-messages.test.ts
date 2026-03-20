import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NostrEvent, NostrFilter } from '@/lib/nostr/types'

// vi.mock is hoisted — factories cannot reference outer variables.
// Use vi.hoisted to create shared references.
const { mockRelayPool, mockInnerEvent } = vi.hoisted(() => {
  const mockRelayPool = {
    connect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(true),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    closeAll: vi.fn(),
    getConnectedRelays: vi.fn().mockReturnValue([]),
  }

  const mockInnerEvent = {
    id: 'inner-evt-1',
    pubkey: 'sender'.padEnd(64, '0'),
    created_at: Math.floor(Date.now() / 1000),
    kind: 14,
    tags: [['p', 'recipient'.padEnd(64, '0')]],
    content: 'hello encrypted',
    sig: 'sig'.padEnd(128, '0'),
  }

  return { mockRelayPool, mockInnerEvent }
})

vi.mock('@/lib/nostr/relay-client', () => ({
  relayPool: mockRelayPool,
  RelayClient: vi.fn(),
  RelayPool: vi.fn(),
}))

vi.mock('@/lib/nostr/events', () => ({
  buildDirectMessageEvent: vi.fn(() => mockInnerEvent),
  createGiftWrap: vi.fn((innerEvent: NostrEvent, _recipientPubkey: string) => ({
    ...innerEvent,
    id: `wrap-${innerEvent.id}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 1059,
  })),
  decryptGiftWrap: vi.fn((_event: NostrEvent, _privkey: string) => mockInnerEvent),
}))

// Import after mocks
import { RealNostrAdapter } from '@/lib/nostr/real-adapter'
import type { NostrSession } from '@/lib/nostr/types'
import { decryptGiftWrap } from '@/lib/nostr/events'

const TEST_PUBKEY = 'a'.repeat(64)
const TEST_PRIVKEY = 'b'.repeat(64)
const CONTACT_PUBKEY = 'c'.repeat(64)

function createAdapter(): RealNostrAdapter {
  const session: NostrSession & { currentPrivkey?: string } = {
    isAuthenticated: true,
    username: 'test',
    currentPubkey: TEST_PUBKEY,
    vaultData: null,
    currentPrivkey: TEST_PRIVKEY,
  }
  return new RealNostrAdapter(session)
}

describe('RealNostrAdapter.sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRelayPool.publish.mockResolvedValue(true)
  })

  it('awaits publish (not fire-and-forget)', async () => {
    let publishResolved = false
    mockRelayPool.publish.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      publishResolved = true
      return true
    })

    const adapter = createAdapter()
    const result = await adapter.sendMessage(CONTACT_PUBKEY, 'test msg')

    expect(publishResolved).toBe(true)
    expect(result.success).toBe(true)
  })

  it('publishes two gift wraps (recipient + self)', async () => {
    const adapter = createAdapter()
    await adapter.sendMessage(CONTACT_PUBKEY, 'hello')

    expect(mockRelayPool.publish).toHaveBeenCalledTimes(2)
  })

  it('returns error when publish fails with exception', async () => {
    mockRelayPool.publish.mockRejectedValue(new Error('relay offline'))

    const adapter = createAdapter()
    const result = await adapter.sendMessage(CONTACT_PUBKEY, 'will fail')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('relay offline')
    }
  })

  it('returns error when not authenticated', async () => {
    const session: NostrSession = {
      isAuthenticated: true,
      username: 'test',
      currentPubkey: null,
      vaultData: null,
    }
    const adapter = new RealNostrAdapter(session)
    const result = await adapter.sendMessage(CONTACT_PUBKEY, 'no auth')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Not authenticated')
    }
  })

  it('returns correct message structure on success', async () => {
    const adapter = createAdapter()
    const result = await adapter.sendMessage(CONTACT_PUBKEY, 'structured')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.text).toBe('structured')
      expect(result.data.sender).toBe('me')
      expect(result.data.id).toBe(mockInnerEvent.id)
      expect(result.data.timestamp).toBeInstanceOf(Date)
    }
  })
})

describe('RealNostrAdapter.getMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with single timeout (no double resolve)', async () => {
    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], _callback: (e: NostrEvent) => void) => {
        // No events — just let it timeout
      }
    )

    const adapter = createAdapter()
    const promise = adapter.getMessages(CONTACT_PUBKEY)

    await vi.advanceTimersByTimeAsync(5001)

    const messages = await promise
    expect(messages).toEqual([])
    expect(mockRelayPool.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('collects and returns decrypted messages sorted by timestamp', async () => {
    const contactEvent: NostrEvent = {
      ...mockInnerEvent,
      pubkey: CONTACT_PUBKEY,
      created_at: 1000,
    }
    const myEvent: NostrEvent = {
      ...mockInnerEvent,
      pubkey: TEST_PUBKEY,
      created_at: 2000,
      tags: [['p', CONTACT_PUBKEY]],
    }

    let callCount = 0
    vi.mocked(decryptGiftWrap).mockImplementation(() => {
      callCount++
      return callCount === 1 ? contactEvent : myEvent
    })

    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], callback: (e: NostrEvent) => void) => {
        callback({ ...mockInnerEvent, id: 'wrap-1' } as NostrEvent)
        callback({ ...mockInnerEvent, id: 'wrap-2' } as NostrEvent)
      }
    )

    const adapter = createAdapter()
    const promise = adapter.getMessages(CONTACT_PUBKEY)

    await vi.advanceTimersByTimeAsync(5001)

    const messages = await promise
    expect(messages.length).toBe(2)
    expect(messages[0].sender).toBe('them')
    expect(messages[1].sender).toBe('me')
    expect(messages[0].timestamp.getTime()).toBeLessThan(messages[1].timestamp.getTime())
  })

  it('filters out messages not from contact', async () => {
    const unrelatedEvent: NostrEvent = {
      ...mockInnerEvent,
      pubkey: 'd'.repeat(64),
      tags: [['p', 'e'.repeat(64)]],
    }

    vi.mocked(decryptGiftWrap).mockReturnValue(unrelatedEvent)

    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], callback: (e: NostrEvent) => void) => {
        callback({ ...mockInnerEvent, id: 'unrelated' } as NostrEvent)
      }
    )

    const adapter = createAdapter()
    const promise = adapter.getMessages(CONTACT_PUBKEY)
    await vi.advanceTimersByTimeAsync(5001)

    const messages = await promise
    expect(messages.length).toBe(0)
  })

  it('returns empty when not authenticated', async () => {
    const session: NostrSession = {
      isAuthenticated: true,
      username: 'test',
      currentPubkey: null,
      vaultData: null,
    }
    const adapter = new RealNostrAdapter(session)

    const messages = await adapter.getMessages(CONTACT_PUBKEY)
    expect(messages).toEqual([])
  })
})
