import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NostrEvent } from '@/lib/nostr/types'

// vi.mock is hoisted — factories cannot reference outer variables.
// Use vi.hoisted to create shared references.
const { mockPublishResult, mockInnerEvent, mockFetchEvents, mockPublishEvent, mockDecryptGiftWrap, mockSubscribe } = vi.hoisted(() => {
  const mockInnerEvent = {
    id: 'inner-evt-1',
    pubkey: 'sender'.padEnd(64, '0'),
    created_at: Math.floor(Date.now() / 1000),
    kind: 14,
    tags: [['p', 'recipient'.padEnd(64, '0')]],
    content: 'hello encrypted',
    sig: 'sig'.padEnd(128, '0'),
  }

  const mockPublishResult = {
    'wss://relay.test': { status: 'success', detail: '', relay: 'wss://relay.test' },
  }

  const mockFetchEvents = vi.fn().mockResolvedValue([])
  const mockPublishEvent = vi.fn().mockResolvedValue(mockPublishResult)
  const mockDecryptGiftWrap = vi.fn().mockResolvedValue(mockInnerEvent)
  const mockSubscribe = vi.fn().mockReturnValue({ abort: vi.fn(), signal: { aborted: false } })

  return { mockPublishResult, mockInnerEvent, mockFetchEvents, mockPublishEvent, mockDecryptGiftWrap, mockSubscribe }
})

vi.mock('@/lib/welshman/relay-manager', () => ({
  connectToRelays: vi.fn(),
  publishEvent: mockPublishEvent,
  fetchEvents: mockFetchEvents,
  subscribe: mockSubscribe,
  getConnectedRelays: vi.fn().mockReturnValue([]),
  closeAllRelays: vi.fn(),
}))

vi.mock('@/lib/welshman/crypto', () => ({
  buildDirectMessageEvent: vi.fn(() => mockInnerEvent),
  createGiftWrap: vi.fn().mockResolvedValue({ ...mockInnerEvent, kind: 1059, id: 'wrap-id' }),
  decryptGiftWrap: mockDecryptGiftWrap,
  buildFollowListEvent: vi.fn(),
  buildProfileEvent: vi.fn(),
  buildVaultEvent: vi.fn(),
  signEvent: vi.fn(),
}))

// Import after mocks
import { RealNostrAdapter } from '@/lib/nostr/real-adapter'
import type { NostrSession } from '@/lib/nostr/types'

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
    mockPublishEvent.mockResolvedValue(mockPublishResult)
  })

  it('awaits publish (not fire-and-forget)', async () => {
    let publishResolved = false
    mockPublishEvent.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      publishResolved = true
      return mockPublishResult
    })

    const adapter = createAdapter()
    const result = await adapter.sendMessage(CONTACT_PUBKEY, 'test msg')

    expect(publishResolved).toBe(true)
    expect(result.success).toBe(true)
  })

  it('publishes two gift wraps (recipient + self)', async () => {
    const adapter = createAdapter()
    await adapter.sendMessage(CONTACT_PUBKEY, 'hello')

    expect(mockPublishEvent).toHaveBeenCalledTimes(2)
  })

  it('returns error when publish fails with exception', async () => {
    mockPublishEvent.mockRejectedValue(new Error('relay offline'))

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
  })

  it('returns empty array when no events are fetched', async () => {
    mockFetchEvents.mockResolvedValue([])

    const adapter = createAdapter()
    const messages = await adapter.getMessages(CONTACT_PUBKEY)

    expect(messages).toEqual([])
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

    mockFetchEvents.mockResolvedValue([
      { ...mockInnerEvent, id: 'wrap-1' },
      { ...mockInnerEvent, id: 'wrap-2' },
    ])

    let callCount = 0
    mockDecryptGiftWrap.mockImplementation(async () => {
      callCount++
      return callCount === 1 ? contactEvent : myEvent
    })

    const adapter = createAdapter()
    const messages = await adapter.getMessages(CONTACT_PUBKEY)

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

    mockFetchEvents.mockResolvedValue([
      { ...mockInnerEvent, id: 'unrelated' },
    ])
    mockDecryptGiftWrap.mockResolvedValue(unrelatedEvent)

    const adapter = createAdapter()
    const messages = await adapter.getMessages(CONTACT_PUBKEY)

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
