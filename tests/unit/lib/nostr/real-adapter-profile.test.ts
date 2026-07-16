import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NostrEvent } from '@/lib/nostr/types'

vi.mock('@/lib/welshman/relay-manager', () => ({
  connectToRelays: vi.fn(),
  publishEvent: vi.fn().mockResolvedValue({ 'wss://relay.test': { status: 'success', detail: '', relay: 'wss://relay.test' } }),
  fetchEvents: vi.fn().mockResolvedValue([]),
  subscribe: vi.fn().mockReturnValue({ abort: vi.fn(), signal: { aborted: false } }),
  getConnectedRelays: vi.fn().mockReturnValue([]),
  closeAllRelays: vi.fn(),
}))

vi.mock('@/lib/welshman/crypto', () => ({
  buildDirectMessageEvent: vi.fn(),
  createGiftWrap: vi.fn().mockResolvedValue({ kind: 1059 }),
  decryptGiftWrap: vi.fn().mockResolvedValue(null),
  buildFollowListEvent: vi.fn(),
  buildProfileEvent: vi.fn(() => ({
    id: 'profile-evt-1',
    pubkey: 'a'.repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    kind: 0,
    tags: [],
    content: '{}',
    sig: 'sig'.padEnd(128, '0'),
  })),
  buildVaultEvent: vi.fn(),
  signEvent: vi.fn(),
}))

import { RealNostrAdapter } from '@/lib/nostr/real-adapter'
import type { NostrSession } from '@/lib/nostr/types'
import { connectToRelays, publishEvent, fetchEvents } from '@/lib/welshman/relay-manager'
import { buildProfileEvent } from '@/lib/welshman/crypto'

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

    vi.mocked(fetchEvents).mockResolvedValueOnce([profileEvent as never])

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

    vi.mocked(fetchEvents).mockResolvedValueOnce([profileEvent as never])

    const adapter = createAdapter()
    const profile = await adapter.getProfile(OTHER_PUBKEY)

    expect(profile).not.toBeNull()
    expect(profile!.displayName).toBe('Bob')
  })

  it('returns null when no events received', async () => {
    vi.mocked(fetchEvents).mockResolvedValueOnce([])

    const adapter = createAdapter()
    const profile = await adapter.getProfile(OTHER_PUBKEY)

    expect(profile).toBeNull()
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

    vi.mocked(fetchEvents).mockResolvedValueOnce([profileEvent as never])

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
    expect(connectToRelays).toHaveBeenCalledTimes(1)
    expect(publishEvent).toHaveBeenCalledTimes(1)
    expect(publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 0 }),
      expect.any(Array)
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
    expect(publishEvent).not.toHaveBeenCalled()
  })

  it('returns error when buildProfileEvent throws', async () => {
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
