import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NostrEvent } from '@/lib/nostr/types'
import { shortPubkey } from '@/lib/utils'

const { mockFetchEvents, mockPublishEvent, mockConnectToRelays } = vi.hoisted(() => ({
  mockFetchEvents: vi.fn().mockResolvedValue([]),
  mockPublishEvent: vi.fn().mockResolvedValue({
    'wss://relay.test': { status: 'success', detail: '', relay: 'wss://relay.test' },
  }),
  mockConnectToRelays: vi.fn(),
}))

vi.mock('@/lib/welshman/relay-manager', () => ({
  connectToRelays: mockConnectToRelays,
  publishEvent: mockPublishEvent,
  fetchEvents: mockFetchEvents,
  subscribe: vi.fn().mockReturnValue({ abort: vi.fn(), signal: { aborted: false } }),
  getConnectedRelays: vi.fn().mockReturnValue([]),
  closeAllRelays: vi.fn(),
}))

vi.mock('@/lib/welshman/crypto', () => ({
  buildDirectMessageEvent: vi.fn(),
  createGiftWrap: vi.fn().mockResolvedValue({ kind: 1059 }),
  decryptGiftWrap: vi.fn().mockResolvedValue(null),
  buildFollowListEvent: vi.fn(() => ({
    id: 'follow-evt-1',
    pubkey: 'a'.repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    kind: 3,
    tags: [],
    content: '',
    sig: 'sig'.padEnd(128, '0'),
  })),
  buildProfileEvent: vi.fn(),
  buildVaultEvent: vi.fn(),
  signEvent: vi.fn(),
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

    mockFetchEvents.mockResolvedValueOnce([followsEvent])

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

  it('returns empty contacts when no events returned', async () => {
    mockFetchEvents.mockResolvedValueOnce([])

    const adapter = createAdapter()
    const contacts = await adapter.getContacts()
    expect(contacts).toEqual([])
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

    mockFetchEvents.mockResolvedValueOnce([followsEvent])

    const adapter = createAdapter()
    const contacts = await adapter.getContacts()

    expect(contacts).toHaveLength(1)
    expect(contacts[0].name).toBe(shortPubkey(CONTACT_PUBKEY))
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
      expect(result.data.name).toBe(shortPubkey(CONTACT_PUBKEY))
    }
    expect(mockPublishEvent).toHaveBeenCalledTimes(1)
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

    expect(mockPublishEvent).toHaveBeenCalledTimes(1)
    expect(mockPublishEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 3 }),
      expect.any(Array)
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
    expect(mockPublishEvent).toHaveBeenCalledTimes(1)
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
    // fetchEvents returns empty so getContacts falls back to internal state
    mockFetchEvents.mockResolvedValue([])

    const adapter = createAdapter()

    // Add two contacts
    await adapter.addContact(CONTACT_PUBKEY)
    await adapter.addContact(CONTACT_PUBKEY_2)

    // Remove one
    const result = await adapter.removeContact(CONTACT_PUBKEY)
    expect(result.success).toBe(true)

    // getContacts fetches from relay (returns empty), so falls back to cached state
    const contacts = await adapter.getContacts()

    // Only CONTACT_PUBKEY_2 should remain (from the internal state)
    expect(contacts.some(c => c.pubkey === CONTACT_PUBKEY)).toBe(false)
    expect(contacts.some(c => c.pubkey === CONTACT_PUBKEY_2)).toBe(true)
  })
})
