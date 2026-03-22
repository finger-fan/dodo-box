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
  buildProfileEvent: vi.fn(() => ({
    id: 'profile-evt-1',
    pubkey: 'a'.repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    kind: 0,
    tags: [],
    content: '{}',
    sig: 'sig'.padEnd(128, '0'),
  })),
  buildFollowListEvent: vi.fn(),
  buildDirectMessageEvent: vi.fn(),
  createGiftWrap: vi.fn(),
  decryptGiftWrap: vi.fn(),
}))

import { RealNostrAdapter } from '@/lib/nostr/real-adapter'
import type { NostrSession } from '@/lib/nostr/types'

const TEST_PUBKEY = 'a'.repeat(64)
const TEST_PRIVKEY = 'b'.repeat(64)
const OTHER_PUBKEY = 'c'.repeat(64)

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

function createUnauthenticatedAdapter(): RealNostrAdapter {
  const session: NostrSession = {
    isAuthenticated: false,
    username: null,
    currentPubkey: null,
    vaultData: null,
  }
  return new RealNostrAdapter(session)
}

describe('RealNostrAdapter.getProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns profile from relay', async () => {
    const profileMeta = {
      name: 'Alice',
      display_name: 'Alice W.',
      picture: 'https://example.com/avatar.jpg',
      about: 'Hello world',
      nip05: 'alice@example.com',
    }

    const profileEvent: NostrEvent = {
      id: 'profile-1',
      pubkey: OTHER_PUBKEY,
      created_at: Math.floor(Date.now() / 1000),
      kind: 0,
      tags: [],
      content: JSON.stringify(profileMeta),
      sig: 'sig'.padEnd(128, '0'),
    }

    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], callback: (e: NostrEvent) => void) => {
        callback(profileEvent)
      }
    )

    const adapter = createAdapter()
    const profile = await adapter.getProfile(OTHER_PUBKEY)

    expect(profile).not.toBeNull()
    expect(profile!.pubkey).toBe(OTHER_PUBKEY)
    expect(profile!.name).toBe('Alice')
    expect(profile!.displayName).toBe('Alice W.')
    expect(profile!.picture).toBe('https://example.com/avatar.jpg')
    expect(profile!.about).toBe('Hello world')
    expect(profile!.nip05).toBe('alice@example.com')
  })

  it('uses name as displayName fallback when display_name is missing', async () => {
    const profileEvent: NostrEvent = {
      id: 'profile-2',
      pubkey: OTHER_PUBKEY,
      created_at: Math.floor(Date.now() / 1000),
      kind: 0,
      tags: [],
      content: JSON.stringify({ name: 'Bob' }),
      sig: 'sig'.padEnd(128, '0'),
    }

    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], callback: (e: NostrEvent) => void) => {
        callback(profileEvent)
      }
    )

    const adapter = createAdapter()
    const profile = await adapter.getProfile(OTHER_PUBKEY)

    expect(profile).not.toBeNull()
    expect(profile!.displayName).toBe('Bob')
  })

  it('returns null on timeout when no events received', async () => {
    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], _callback: (e: NostrEvent) => void) => {
        // no events delivered
      }
    )

    const adapter = createAdapter()
    const promise = adapter.getProfile(OTHER_PUBKEY)

    await vi.advanceTimersByTimeAsync(5001)

    const profile = await promise
    expect(profile).toBeNull()
    expect(mockRelayPool.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('returns null when event content is invalid JSON', async () => {
    const profileEvent: NostrEvent = {
      id: 'profile-bad',
      pubkey: OTHER_PUBKEY,
      created_at: Math.floor(Date.now() / 1000),
      kind: 0,
      tags: [],
      content: 'not json',
      sig: 'sig'.padEnd(128, '0'),
    }

    mockRelayPool.subscribe.mockImplementation(
      (_subId: string, _filters: NostrFilter[], callback: (e: NostrEvent) => void) => {
        callback(profileEvent)
      }
    )

    const adapter = createAdapter()
    const profile = await adapter.getProfile(OTHER_PUBKEY)

    expect(profile).toBeNull()
  })
})

describe('RealNostrAdapter.updateProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('publishes profile event', async () => {
    const adapter = createAdapter()
    const result = await adapter.updateProfile({
      name: 'New Name',
      displayName: 'New Display',
      about: 'New about',
    })

    expect(result.success).toBe(true)
    expect(mockRelayPool.connect).toHaveBeenCalledTimes(1)
    expect(mockRelayPool.publish).toHaveBeenCalledTimes(1)
    expect(mockRelayPool.publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 0 })
    )
  })

  it('fails when not authenticated (no privkey)', async () => {
    const adapter = createUnauthenticatedAdapter()
    const result = await adapter.updateProfile({
      name: 'Should Fail',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Not authenticated')
    }
    expect(mockRelayPool.publish).not.toHaveBeenCalled()
  })

  it('returns error when buildProfileEvent throws', async () => {
    const { buildProfileEvent } = await import('@/lib/nostr/events')
    vi.mocked(buildProfileEvent).mockImplementationOnce(() => {
      throw new Error('signing failed')
    })

    const adapter = createAdapter()
    const result = await adapter.updateProfile({ name: 'Fail' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('signing failed')
    }
  })
})
