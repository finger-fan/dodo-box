
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RealNostrAdapter } from '@/lib/nostr/real-adapter'
import * as relayManager from '@/lib/welshman/relay-manager'

const PUBKEY = 'a'.repeat(64)
const CONTACT_PUBKEY = 'b'.repeat(64)

function createSession(pubkey: string, privkey?: string) {
  return {
    isAuthenticated: true as const,
    username: 'test',
    currentPubkey: pubkey,
    currentPrivkey: privkey || pubkey,
    vaultData: null,
  }
}

vi.mock('@/lib/welshman/relay-manager', () => ({
  connectToRelays: vi.fn(),
  publishEvent: vi.fn().mockResolvedValue({}),
  fetchEvents: vi.fn(),
  subscribe: vi.fn().mockReturnValue({ abort: vi.fn() }),
  getConnectedRelays: vi.fn().mockReturnValue([]),
  closeAllRelays: vi.fn(),
  getRelayStatusMap: vi.fn().mockReturnValue(new Map()),
  waitForRelayConnection: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/welshman/crypto', () => ({
  buildDirectMessageEvent: vi.fn().mockReturnValue({ id: 'msg1', content: 'hello', created_at: 1000, tags: [['p', 'b'.repeat(64)]] }),
  createGiftWrap: vi.fn().mockResolvedValue({}),
  decryptGiftWrap: vi.fn().mockResolvedValue(null),
  buildFollowListEvent: vi.fn().mockReturnValue({ id: 'follow1', content: '', tags: [] }),
  buildProfileEvent: vi.fn().mockReturnValue({}),
  buildVaultEvent: vi.fn().mockReturnValue({}),
  signEvent: vi.fn(),
}))

describe('RealNostrAdapter', () => {
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
    vi.mocked(relayManager.fetchEvents).mockReset()
    vi.mocked(relayManager.publishEvent).mockReset().mockResolvedValue({} as never)
  })

  it('T-CON-13: rejects duplicate contacts', async () => {
    const adapter = new RealNostrAdapter(createSession(PUBKEY))
    const first = await adapter.addContact(CONTACT_PUBKEY)
    expect(first.success).toBe(true)
    const second = await adapter.addContact(CONTACT_PUBKEY)
    expect(second.success).toBe(false)
    if (!second.success) {
      expect(second.error).toBe('Contact already exists')
    }
  })

  it('T-CON-14: parses dodobox://contact/<npub> protocol', async () => {
    const adapter = new RealNostrAdapter(createSession(PUBKEY))
    const { npubEncode } = await import('nostr-tools/nip19')
    const npub = npubEncode(CONTACT_PUBKEY)
    const result = await adapter.addContact(`dodobox://contact/${npub}`)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pubkey).toBe(CONTACT_PUBKEY)
    }
  })

  it('parses dodobox://identity/<encoded> protocol', async () => {
    const adapter = new RealNostrAdapter(createSession(PUBKEY))
    const { encodeIdentityInfo } = await import('@/lib/utils')
    const encoded = encodeIdentityInfo(CONTACT_PUBKEY, 'Alice')
    const result = await adapter.addContact(encoded)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pubkey).toBe(CONTACT_PUBKEY)
      expect(result.data.name).toBe('Alice')
    }
  })

  it('T-CON-01: resolves contact name priority: petname > display_name > name > npub', async () => {
    vi.mocked(relayManager.fetchEvents).mockImplementation(async (filters) => {
      const [filter] = filters as Array<{ kinds?: number[] }>
      if (filter.kinds?.includes(3)) {
        return [{
          id: 'follow1',
          pubkey: PUBKEY,
          created_at: 1000,
          kind: 3,
          tags: [['p', CONTACT_PUBKEY, '', 'MyPetname']],
          content: '',
          sig: '',
        }]
      }
      if (filter.kinds?.includes(0)) {
        return [{
          id: 'profile1',
          pubkey: CONTACT_PUBKEY,
          created_at: 1000,
          kind: 0,
          tags: [],
          content: JSON.stringify({ name: 'RealName', display_name: 'DisplayName' }),
          sig: '',
        }]
      }
      return []
    })

    const adapter = new RealNostrAdapter(createSession(PUBKEY))
    const contacts = await adapter.getContacts()
    expect(contacts).toHaveLength(1)
    expect(contacts[0].name).toBe('MyPetname')

    // display_name fallback
    vi.mocked(relayManager.fetchEvents).mockImplementation(async (filters) => {
      const [filter] = filters as Array<{ kinds?: number[] }>
      if (filter.kinds?.includes(3)) {
        return [{
          id: 'follow1',
          pubkey: PUBKEY,
          created_at: 1000,
          kind: 3,
          tags: [['p', CONTACT_PUBKEY]],
          content: '',
          sig: '',
        }]
      }
      if (filter.kinds?.includes(0)) {
        return [{
          id: 'profile1',
          pubkey: CONTACT_PUBKEY,
          created_at: 1000,
          kind: 0,
          tags: [],
          content: JSON.stringify({ name: 'RealName', display_name: 'DisplayName' }),
          sig: '',
        }]
      }
      return []
    })
    const adapter2 = new RealNostrAdapter(createSession(PUBKEY))
    const contacts2 = await adapter2.getContacts()
    expect(contacts2[0].name).toBe('DisplayName')

    // name fallback
    vi.mocked(relayManager.fetchEvents).mockImplementation(async (filters) => {
      const [filter] = filters as Array<{ kinds?: number[] }>
      if (filter.kinds?.includes(3)) {
        return [{
          id: 'follow1',
          pubkey: PUBKEY,
          created_at: 1000,
          kind: 3,
          tags: [['p', CONTACT_PUBKEY]],
          content: '',
          sig: '',
        }]
      }
      if (filter.kinds?.includes(0)) {
        return [{
          id: 'profile1',
          pubkey: CONTACT_PUBKEY,
          created_at: 1000,
          kind: 0,
          tags: [],
          content: JSON.stringify({ name: 'RealName' }),
          sig: '',
        }]
      }
      return []
    })
    const adapter3 = new RealNostrAdapter(createSession(PUBKEY))
    const contacts3 = await adapter3.getContacts()
    expect(contacts3[0].name).toBe('RealName')
  })

  it('T-CHT-01: rebuilds chats from contacts', async () => {
    vi.mocked(relayManager.fetchEvents).mockImplementation(async (filters) => {
      const [filter] = filters as Array<{ kinds?: number[] }>
      if (filter.kinds?.includes(3)) {
        return [{
          id: 'follow1',
          pubkey: PUBKEY,
          created_at: 1000,
          kind: 3,
          tags: [['p', CONTACT_PUBKEY, '', 'Alice']],
          content: '',
          sig: '',
        }]
      }
      return []
    })
    const adapter = new RealNostrAdapter(createSession(PUBKEY))
    const chats = await adapter.getChats()
    expect(chats).toHaveLength(1)
    expect(chats[0].pubkey).toBe(CONTACT_PUBKEY)
    expect(chats[0].name).toBe('Alice')
  })
})
