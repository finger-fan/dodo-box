// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VaultData, NostrEvent, NostrFilter } from '@/lib/nostr/types'
import { KIND_VAULT, VAULT_EVENT_D_TAG } from '@/lib/nostr/types'

// --- Mocks (hoisted so vi.mock factories can reference them) ---

const {
  mockRelayPool,
  mockEncryptVault,
  mockDecryptVault,
  mockCreateEmptyVaultData,
  mockBuildVaultEvent,
} = vi.hoisted(() => ({
  mockRelayPool: {
    connect: vi.fn().mockResolvedValue(undefined),
    getConnectedRelays: vi.fn().mockReturnValue(['wss://relay.test']),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    publish: vi.fn().mockResolvedValue(true),
  },
  mockEncryptVault: vi.fn().mockResolvedValue('encrypted-vault-content'),
  mockDecryptVault: vi.fn(),
  mockCreateEmptyVaultData: vi.fn(),
  mockBuildVaultEvent: vi.fn(),
}))

vi.mock('@/lib/nostr/relay-client', () => ({
  relayPool: mockRelayPool,
}))

vi.mock('@/lib/nostr/vault-crypto', () => ({
  encryptVault: (...args: unknown[]) => mockEncryptVault(...args),
  decryptVault: (...args: unknown[]) => mockDecryptVault(...args),
  createEmptyVaultData: () => mockCreateEmptyVaultData(),
}))

vi.mock('@/lib/nostr/events', () => ({
  buildVaultEvent: (...args: unknown[]) => mockBuildVaultEvent(...args),
}))

import { VaultSync } from '@/lib/nostr/vault-sync'

// --- Test Data ---

const TEST_PUBKEY = 'a'.repeat(64)
const TEST_PRIVKEY = 'b'.repeat(64)

const makeVaultData = (overrides?: Partial<VaultData>): VaultData => ({
  version: 1,
  identities: [],
  updatedAt: 1000000,
  ...overrides,
})

const makeVaultEvent = (overrides?: Partial<NostrEvent>): NostrEvent => ({
  id: 'evt-1',
  pubkey: TEST_PUBKEY,
  created_at: 1000,
  kind: KIND_VAULT,
  tags: [['d', VAULT_EVENT_D_TAG]],
  content: 'encrypted-content',
  sig: 'c'.repeat(128),
  ...overrides,
})

describe('VaultSync', () => {
  let vaultSync: VaultSync

  beforeEach(() => {
    vi.clearAllMocks()
    mockRelayPool.getConnectedRelays.mockReturnValue(['wss://relay.test'])
    mockRelayPool.connect.mockResolvedValue(undefined)
    mockRelayPool.publish.mockResolvedValue(true)
    vaultSync = new VaultSync(['wss://relay.test'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checkVaultExists', () => {
    it('returns true when vault event found', async () => {
      mockRelayPool.subscribe.mockImplementation(
        (_subId: string, _filters: NostrFilter[], onEvent: (event: NostrEvent) => void) => {
          // Simulate relay sending a vault event
          onEvent(makeVaultEvent())
        }
      )

      const result = await vaultSync.checkVaultExists(TEST_PUBKEY)

      expect(result).toBe(true)
      expect(mockRelayPool.connect).toHaveBeenCalledWith(['wss://relay.test'])
      expect(mockRelayPool.subscribe).toHaveBeenCalledWith(
        expect.stringContaining('vault-check-'),
        [
          {
            kinds: [KIND_VAULT],
            authors: [TEST_PUBKEY],
            '#d': [VAULT_EVENT_D_TAG],
            limit: 1,
          },
        ],
        expect.any(Function),
        expect.any(Function),
      )
      expect(mockRelayPool.unsubscribe).toHaveBeenCalled()
    })

    it('returns false when no vault event found (EOSE)', async () => {
      mockRelayPool.subscribe.mockImplementation(
        (_subId: string, _filters: NostrFilter[], _onEvent: (event: NostrEvent) => void, onEose: () => void) => {
          // Simulate relay finishing without sending events
          onEose()
        }
      )

      const result = await vaultSync.checkVaultExists(TEST_PUBKEY)

      expect(result).toBe(false)
      expect(mockRelayPool.unsubscribe).toHaveBeenCalled()
    })

    it('returns false when no relays are connected', async () => {
      mockRelayPool.getConnectedRelays.mockReturnValue([])

      const result = await vaultSync.checkVaultExists(TEST_PUBKEY)

      expect(result).toBe(false)
      expect(mockRelayPool.subscribe).not.toHaveBeenCalled()
    })

    it('returns false on timeout when no events received', async () => {
      vi.useFakeTimers()

      // subscribe but never call onEvent or onEose
      mockRelayPool.subscribe.mockImplementation(() => {})

      const resultP = vaultSync.checkVaultExists(TEST_PUBKEY)

      await vi.advanceTimersByTimeAsync(10001)

      const result = await resultP

      expect(result).toBe(false)
      expect(mockRelayPool.unsubscribe).toHaveBeenCalled()

      vi.useRealTimers()
    })
  })

  describe('fetchVault', () => {
    it('returns decrypted vault data when event found', async () => {
      const vaultData = makeVaultData({ identities: [] })
      const event = makeVaultEvent({ content: 'encrypted-content', created_at: 2000 })

      mockRelayPool.subscribe.mockImplementation(
        (_subId: string, _filters: NostrFilter[], onEvent: (event: NostrEvent) => void, onEose: () => void) => {
          onEvent(event)
          onEose()
        }
      )
      mockDecryptVault.mockResolvedValue(vaultData)

      const result = await vaultSync.fetchVault(TEST_PUBKEY, TEST_PRIVKEY)

      expect(result).toEqual(vaultData)
      expect(mockDecryptVault).toHaveBeenCalledWith(TEST_PRIVKEY, 'encrypted-content')
      expect(mockRelayPool.unsubscribe).toHaveBeenCalled()
    })

    it('returns the latest event when multiple events received', async () => {
      const oldEvent = makeVaultEvent({ content: 'old-content', created_at: 1000 })
      const newEvent = makeVaultEvent({ content: 'new-content', created_at: 2000 })
      const vaultData = makeVaultData()

      mockRelayPool.subscribe.mockImplementation(
        (_subId: string, _filters: NostrFilter[], onEvent: (event: NostrEvent) => void, onEose: () => void) => {
          onEvent(oldEvent)
          onEvent(newEvent)
          onEose()
        }
      )
      mockDecryptVault.mockResolvedValue(vaultData)

      await vaultSync.fetchVault(TEST_PUBKEY, TEST_PRIVKEY)

      expect(mockDecryptVault).toHaveBeenCalledWith(TEST_PRIVKEY, 'new-content')
    })

    it('returns null when no events found (EOSE)', async () => {
      mockRelayPool.subscribe.mockImplementation(
        (_subId: string, _filters: NostrFilter[], _onEvent: (event: NostrEvent) => void, onEose: () => void) => {
          onEose()
        }
      )

      const result = await vaultSync.fetchVault(TEST_PUBKEY, TEST_PRIVKEY)

      expect(result).toBeNull()
      expect(mockDecryptVault).not.toHaveBeenCalled()
    })

    it('returns null on timeout when no events received', async () => {
      vi.useFakeTimers()

      mockRelayPool.subscribe.mockImplementation(() => {})

      const resultP = vaultSync.fetchVault(TEST_PUBKEY, TEST_PRIVKEY)

      await vi.advanceTimersByTimeAsync(10001)

      const result = await resultP

      expect(result).toBeNull()
      expect(mockRelayPool.unsubscribe).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('returns null when no relays are connected', async () => {
      mockRelayPool.getConnectedRelays.mockReturnValue([])

      const result = await vaultSync.fetchVault(TEST_PUBKEY, TEST_PRIVKEY)

      expect(result).toBeNull()
    })

    it('returns null when decryption fails', async () => {
      const event = makeVaultEvent({ content: 'bad-encrypted', created_at: 2000 })

      mockRelayPool.subscribe.mockImplementation(
        (_subId: string, _filters: NostrFilter[], onEvent: (event: NostrEvent) => void, onEose: () => void) => {
          onEvent(event)
          onEose()
        }
      )
      mockDecryptVault.mockRejectedValue(new Error('decryption failed'))

      const result = await vaultSync.fetchVault(TEST_PUBKEY, TEST_PRIVKEY)

      expect(result).toBeNull()
    })
  })

  describe('publishVault', () => {
    it('publishes event successfully', async () => {
      const vaultData = makeVaultData()
      const fakeEvent = makeVaultEvent()

      mockEncryptVault.mockResolvedValue('encrypted-data')
      mockBuildVaultEvent.mockReturnValue(fakeEvent)
      mockRelayPool.publish.mockResolvedValue(true)

      await expect(vaultSync.publishVault(TEST_PRIVKEY, vaultData)).resolves.toBeUndefined()

      expect(mockEncryptVault).toHaveBeenCalledWith(TEST_PRIVKEY, vaultData)
      expect(mockBuildVaultEvent).toHaveBeenCalledWith('encrypted-data', TEST_PRIVKEY)
      expect(mockRelayPool.connect).toHaveBeenCalledWith(['wss://relay.test'])
      expect(mockRelayPool.publish).toHaveBeenCalledWith(fakeEvent)
    })

    it('throws error when relay rejects the event', async () => {
      const vaultData = makeVaultData()
      const fakeEvent = makeVaultEvent()

      mockEncryptVault.mockResolvedValue('encrypted-data')
      mockBuildVaultEvent.mockReturnValue(fakeEvent)
      mockRelayPool.publish.mockResolvedValue(false)

      await expect(vaultSync.publishVault(TEST_PRIVKEY, vaultData)).rejects.toThrow(
        'Vault publish failed: no relay accepted the event'
      )
    })
  })

  describe('createVault', () => {
    it('creates and publishes a new vault', async () => {
      const emptyVault = makeVaultData()
      const fakeEvent = makeVaultEvent()

      mockCreateEmptyVaultData.mockReturnValue(emptyVault)
      mockEncryptVault.mockResolvedValue('encrypted-empty')
      mockBuildVaultEvent.mockReturnValue(fakeEvent)
      mockRelayPool.publish.mockResolvedValue(true)

      const result = await vaultSync.createVault(TEST_PRIVKEY)

      expect(result).toEqual(emptyVault)
      expect(mockCreateEmptyVaultData).toHaveBeenCalled()
      expect(mockEncryptVault).toHaveBeenCalledWith(TEST_PRIVKEY, emptyVault)
      expect(mockRelayPool.publish).toHaveBeenCalledWith(fakeEvent)
    })
  })

  describe('updateVault', () => {
    it('updates and publishes existing vault with new timestamp', async () => {
      const vaultData = makeVaultData({ updatedAt: 1000 })
      const fakeEvent = makeVaultEvent()

      mockEncryptVault.mockResolvedValue('encrypted-updated')
      mockBuildVaultEvent.mockReturnValue(fakeEvent)
      mockRelayPool.publish.mockResolvedValue(true)

      await expect(vaultSync.updateVault(TEST_PRIVKEY, vaultData)).resolves.toBeUndefined()

      // Verify encryptVault was called with updated timestamp
      const encryptCall = mockEncryptVault.mock.calls[0]
      expect(encryptCall[0]).toBe(TEST_PRIVKEY)
      expect(encryptCall[1].updatedAt).toBeGreaterThan(1000)
      expect(encryptCall[1].version).toBe(1)
      expect(encryptCall[1].identities).toEqual([])

      expect(mockRelayPool.publish).toHaveBeenCalledWith(fakeEvent)
    })

    it('does not mutate the original vault data', async () => {
      const vaultData = makeVaultData({ updatedAt: 1000 })
      const fakeEvent = makeVaultEvent()

      mockEncryptVault.mockResolvedValue('encrypted-updated')
      mockBuildVaultEvent.mockReturnValue(fakeEvent)
      mockRelayPool.publish.mockResolvedValue(true)

      await vaultSync.updateVault(TEST_PRIVKEY, vaultData)

      expect(vaultData.updatedAt).toBe(1000)
    })
  })

  describe('constructor', () => {
    it('uses provided relay URLs', async () => {
      const customSync = new VaultSync(['wss://custom.relay'])

      mockRelayPool.subscribe.mockImplementation(
        (_subId: string, _filters: NostrFilter[], _onEvent: (event: NostrEvent) => void, onEose: () => void) => {
          onEose()
        }
      )

      await customSync.checkVaultExists(TEST_PUBKEY)

      expect(mockRelayPool.connect).toHaveBeenCalledWith(['wss://custom.relay'])
    })
  })
})
