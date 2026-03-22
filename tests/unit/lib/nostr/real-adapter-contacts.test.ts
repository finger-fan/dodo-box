import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NostrEvent, NostrFilter } from '@/lib/nostr/types'

const { mockRelayPool } = vi.hoisted(() => {
  const mockRelayPool = {
    connect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(true),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    closeAll: vi.fn(),
    getConnectedRelays: vi.fn().mockReturnValue([]),
  }
  return { mockRelayPool }
})

vi.mock('@/lib/nostr/relay-client', () => ({
  relayPool: mockRelayPool,
  RelayClient: vi.fn(),
  RelayPool: vi.fn(),
}))

vi.mock('@/lib/nostr/events', () => ({
  buildFollowListEvent: vi.fn(() => ({
    id: 'follow-evt-1',
    pubkey: 'a'.repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    kind: 3,
    tags: [],
    content: '',
    sig: 'sig'.padEnd(128, '0'),
  })),
  buildDirectMessageEvent: vi.fn(),
  createGiftWrap: vi.fn(),
  decryptGiftWrap: vi.fn(),
}))

import { RealNostrAdapter } from '@/lib/nostr/real-adapter'
import type { NostrSession } from '@/lib/nostr/types'

const TEST_PUBKEY = 'a'.repeat(64)
const TEST_PRIVKEY = 'b'.repeat(64)
const CONTACT_PUBKEY = 'c'.repeat(64)
const CONTACT_PUBKEY_2 = 'd'.repeat(64)

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

describe('RealNostrAdapter.getContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns contacts from relay subscription', async () => {
    const followsEvent: NostrEvent = {
      id: 'follows-1',
      pubkey: TEST_PUBKEY,
      created_at: Math.floor(Date.now() / 1000),
      kind: 3,
      tags: [
        ['p', CONTACT_PUBKEY, '', 'Alice'],
        ['p', CONTACT_PUBKEY_2, '', 'Bob'],
      ],
      content: '',
      sig: 'sig'.padEnd(128, '0'),
    }

    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], callback: (e: NostrEvent) => void) => {
        callback(followsEvent)
      }
    )

    const adapter = createAdapter()
    const contacts = await adapter.getContacts()

    expect(contacts).toHaveLength(2)
    expect(contacts[0].pubkey).toBe(CONTACT_PUBKEY)
    expect(contacts[0].name).toBe('Alice')
    expect(contacts[1].pubkey).toBe(CONTACT_PUBKEY_2)
    expect(contacts[1].name).toBe('Bob')
  })

  it('returns empty array when not authenticated', async () => {
    const session: NostrSession = {
      isAuthenticated: false,
      username: null,
      currentPubkey: null,
      vaultData: null,
    }
    const adapter = new RealNostrAdapter(session)
    const contacts = await adapter.getContacts()
    expect(contacts).toEqual([])
  })

  it('resolves with empty contacts on timeout when no events received', async () => {
    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], _callback: (e: NostrEvent) => void) => {
        // no events delivered
      }
    )

    const adapter = createAdapter()
    const promise = adapter.getContacts()

    await vi.advanceTimersByTimeAsync(5001)

    const contacts = await promise
    expect(contacts).toEqual([])
    expect(mockRelayPool.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('uses petname fallback to truncated pubkey when petname is empty', async () => {
    const followsEvent: NostrEvent = {
      id: 'follows-2',
      pubkey: TEST_PUBKEY,
      created_at: Math.floor(Date.now() / 1000),
      kind: 3,
      tags: [['p', CONTACT_PUBKEY, '', '']],
      content: '',
      sig: 'sig'.padEnd(128, '0'),
    }

    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], callback: (e: NostrEvent) => void) => {
        callback(followsEvent)
      }
    )

    const adapter = createAdapter()
    const contacts = await adapter.getContacts()

    expect(contacts).toHaveLength(1)
    expect(contacts[0].name).toBe(CONTACT_PUBKEY.slice(0, 8) + '...')
  })
})

describe('RealNostrAdapter.addContact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds contact with hex pubkey', async () => {
    const adapter = createAdapter()
    const result = await adapter.addContact(CONTACT_PUBKEY)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pubkey).toBe(CONTACT_PUBKEY)
      expect(result.data.name).toBe(CONTACT_PUBKEY.slice(0, 8) + '...')
    }
    expect(mockRelayPool.publish).toHaveBeenCalledTimes(1)
  })

  it('adds contact with npub1 format', async () => {
    // Use nostr-tools to encode a known hex pubkey as npub
    const { npubEncode } = await import('nostr-tools/nip19')
    const npub = npubEncode(CONTACT_PUBKEY)

    const adapter = createAdapter()
    const result = await adapter.addContact(npub)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pubkey).toBe(CONTACT_PUBKEY)
    }
  })

  it('adds contact with dodobox://contact/ protocol string', async () => {
    const { npubEncode } = await import('nostr-tools/nip19')
    const npub = npubEncode(CONTACT_PUBKEY)
    const protocolStr = `dodobox://contact/${npub}`

    const adapter = createAdapter()
    const result = await adapter.addContact(protocolStr)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pubkey).toBe(CONTACT_PUBKEY)
    }
  })

  it('rejects duplicate contact', async () => {
    const adapter = createAdapter()

    const first = await adapter.addContact(CONTACT_PUBKEY)
    expect(first.success).toBe(true)

    const second = await adapter.addContact(CONTACT_PUBKEY)
    expect(second.success).toBe(false)
    if (!second.success) {
      expect(second.error).toBe('Contact already exists')
    }
  })

  it('publishes follow list event after adding contact', async () => {
    const adapter = createAdapter()
    await adapter.addContact(CONTACT_PUBKEY)

    expect(mockRelayPool.publish).toHaveBeenCalledTimes(1)
    expect(mockRelayPool.publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 3 })
    )
  })
})

describe('RealNostrAdapter.removeContact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes an existing contact', async () => {
    const adapter = createAdapter()

    // Add a contact first
    const addResult = await adapter.addContact(CONTACT_PUBKEY)
    expect(addResult.success).toBe(true)
    vi.clearAllMocks()

    const result = await adapter.removeContact(CONTACT_PUBKEY)
    expect(result.success).toBe(true)

    // Publishes updated follow list
    expect(mockRelayPool.publish).toHaveBeenCalledTimes(1)
  })

  it('returns error when removing non-existent contact', async () => {
    const adapter = createAdapter()

    const result = await adapter.removeContact('nonexistent'.padEnd(64, '0'))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Contact not found')
    }
  })

  it('contact is no longer returned after removal', async () => {
    vi.useFakeTimers()

    // Set up subscription to return empty for getContacts
    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], _callback: (e: NostrEvent) => void) => {
        // no events
      }
    )

    const adapter = createAdapter()

    // Add two contacts
    await adapter.addContact(CONTACT_PUBKEY)
    await adapter.addContact(CONTACT_PUBKEY_2)

    // Remove one
    const result = await adapter.removeContact(CONTACT_PUBKEY)
    expect(result.success).toBe(true)

    // getContacts triggers relay subscription but falls back to cached state on timeout
    const contactsPromise = adapter.getContacts()
    await vi.advanceTimersByTimeAsync(5001)
    const contacts = await contactsPromise

    // Only CONTACT_PUBKEY_2 should remain (from the internal state)
    expect(contacts.some(c => c.pubkey === CONTACT_PUBKEY)).toBe(false)
    expect(contacts.some(c => c.pubkey === CONTACT_PUBKEY_2)).toBe(true)

    vi.useRealTimers()
  })
})
