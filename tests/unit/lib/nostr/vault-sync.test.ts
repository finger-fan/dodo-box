// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VaultData, NostrEvent } from '@/lib/nostr/types'
import { KIND_VAULT, VAULT_EVENT_D_TAG } from '@/lib/nostr/types'

// --- Mocks (hoisted so vi.mock factories can reference them) ---

const {
  mockConnectToRelays,
  mockFetchEvents,
  mockPublishEvent,
  mockGetConnectedRelays,
  mockBuildVaultEvent,
  mockEncryptVault,
  mockDecryptVault,
  mockCreateEmptyVaultData,
} = vi.hoisted(() => ({
  mockConnectToRelays: vi.fn(),
  mockFetchEvents: vi.fn().mockResolvedValue([]),
  mockPublishEvent: vi.fn().mockResolvedValue({
    'wss://relay.test': { status: 'success', detail: '', relay: 'wss://relay.test' },
  }),
  mockGetConnectedRelays: vi.fn().mockReturnValue(['wss://relay.test']),
  mockBuildVaultEvent: vi.fn(),
  mockEncryptVault: vi.fn().mockResolvedValue('encrypted-vault-content'),
  mockDecryptVault: vi.fn(),
  mockCreateEmptyVaultData: vi.fn(),
}))

vi.mock('@/lib/welshman/relay-manager', () => ({
  connectToRelays: mockConnectToRelays,
  fetchEvents: mockFetchEvents,
  publishEvent: mockPublishEvent,
  getConnectedRelays: mockGetConnectedRelays,
  closeAllRelays: vi.fn(),
}))

vi.mock('@/lib/welshman/crypto', () => ({
  buildVaultEvent: (...args: unknown[]) => mockBuildVaultEvent(...args),
}))

vi.mock('@/lib/nostr/vault-crypto', () => ({
  encryptVault: (...args: unknown[]) => mockEncryptVault(...args),
  decryptVault: (...args: unknown[]) => mockDecryptVault(...args),
  createEmptyVaultData: () => mockCreateEmptyVaultData(),
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
    mockGetConnectedRelays.mockReturnValue(['wss://relay.test'])
    mockConnectToRelays.mockReturnValue(undefined)
    mockPublishEvent.mockResolvedValue({
      'wss://relay.test': { status: 'success', detail: '', relay: 'wss://relay.test' },
    })
    vaultSync = new VaultSync(['wss://relay.test'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checkVaultExists', () => {
    it('returns true when vault event found', async () => {
      mockFetchEvents.mockResolvedValue([makeVaultEvent()])

      const result = await vaultSync.checkVaultExists(TEST_PUBKEY)

      expect(result).toBe(true)
      expect(mockConnectToRelays).toHaveBeenCalledWith(['wss://relay.test'])
      expect(mockFetchEvents).toHaveBeenCalledWith(
        [
          {
            kinds: [KIND_VAULT],
            authors: [TEST_PUBKEY],
            '#d': [VAULT_EVENT_D_TAG],
            limit: 1,
          },
        ],
        ['wss://relay.test'],
      )
    })

    it('returns false when no vault event found', async () => {
      mockFetchEvents.mockResolvedValue([])

      const result = await vaultSync.checkVaultExists(TEST_PUBKEY)

      expect(result).toBe(false)
    })

    it('returns false when no relays are connected', async () => {
      vi.useFakeTimers()
      mockGetConnectedRelays.mockReturnValue([])

      const resultP = vaultSync.checkVaultExists(TEST_PUBKEY)

      // Advance past the 2-second wait for reconnection check
      await vi.advanceTimersByTimeAsync(2000)

      const result = await resultP

      expect(result).toBe(false)
      expect(mockFetchEvents).not.toHaveBeenCalled()

      vi.useRealTimers()
    })
  })

  describe('fetchVault', () => {
    it('returns decrypted vault data when event found', async () => {
      const vaultData = makeVaultData({ identities: [] })
      const event = makeVaultEvent({ content: 'encrypted-content', created_at: 2000 })

      mockFetchEvents.mockResolvedValue([event])
      mockDecryptVault.mockResolvedValue(vaultData)

      const result = await vaultSync.fetchVault(TEST_PUBKEY, TEST_PRIVKEY)

      expect(result).toEqual(vaultData)
      expect(mockDecryptVault).toHaveBeenCalledWith(TEST_PRIVKEY, 'encrypted-content')
    })

    it('returns the latest event when multiple events received', async () => {
      const oldEvent = makeVaultEvent({ content: 'old-content', created_at: 1000 })
      const newEvent = makeVaultEvent({ content: 'new-content', created_at: 2000 })
      const vaultData = makeVaultData()

      mockFetchEvents.mockResolvedValue([oldEvent, newEvent])
      mockDecryptVault.mockResolvedValue(vaultData)

      await vaultSync.fetchVault(TEST_PUBKEY, TEST_PRIVKEY)

      expect(mockDecryptVault).toHaveBeenCalledWith(TEST_PRIVKEY, 'new-content')
    })

    it('returns null when no events found', async () => {
      mockFetchEvents.mockResolvedValue([])

      const result = await vaultSync.fetchVault(TEST_PUBKEY, TEST_PRIVKEY)

      expect(result).toBeNull()
      expect(mockDecryptVault).not.toHaveBeenCalled()
    })

    it('returns null when no relays are connected', async () => {
      vi.useFakeTimers()
      mockGetConnectedRelays.mockReturnValue([])

      const resultP = vaultSync.fetchVault(TEST_PUBKEY, TEST_PRIVKEY)

      await vi.advanceTimersByTimeAsync(2000)

      const result = await resultP

      expect(result).toBeNull()
      expect(mockFetchEvents).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('returns null when decryption fails', async () => {
      const event = makeVaultEvent({ content: 'bad-encrypted', created_at: 2000 })

      mockFetchEvents.mockResolvedValue([event])
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
      mockPublishEvent.mockResolvedValue({
        'wss://relay.test': { status: 'success', detail: '', relay: 'wss://relay.test' },
      })

      await expect(vaultSync.publishVault(TEST_PRIVKEY, vaultData)).resolves.toBeUndefined()

      expect(mockEncryptVault).toHaveBeenCalledWith(TEST_PRIVKEY, vaultData)
      expect(mockBuildVaultEvent).toHaveBeenCalledWith('encrypted-data', TEST_PRIVKEY)
      expect(mockConnectToRelays).toHaveBeenCalledWith(['wss://relay.test'])
      expect(mockPublishEvent).toHaveBeenCalledWith(fakeEvent, ['wss://relay.test'])
    })

    it('throws error when relay rejects the event', async () => {
      const vaultData = makeVaultData()
      const fakeEvent = makeVaultEvent()

      mockEncryptVault.mockResolvedValue('encrypted-data')
      mockBuildVaultEvent.mockReturnValue(fakeEvent)
      mockPublishEvent.mockResolvedValue({
        'wss://relay.test': { status: 'failure', detail: 'rejected', relay: 'wss://relay.test' },
      })

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
      mockPublishEvent.mockResolvedValue({
        'wss://relay.test': { status: 'success', detail: '', relay: 'wss://relay.test' },
      })

      const result = await vaultSync.createVault(TEST_PRIVKEY)

      expect(result).toEqual(emptyVault)
      expect(mockCreateEmptyVaultData).toHaveBeenCalled()
      expect(mockEncryptVault).toHaveBeenCalledWith(TEST_PRIVKEY, emptyVault)
      expect(mockPublishEvent).toHaveBeenCalledWith(fakeEvent, ['wss://relay.test'])
    })
  })

  describe('updateVault', () => {
    it('updates and publishes existing vault with new timestamp', async () => {
      const vaultData = makeVaultData({ updatedAt: 1000 })
      const fakeEvent = makeVaultEvent()

      mockEncryptVault.mockResolvedValue('encrypted-updated')
      mockBuildVaultEvent.mockReturnValue(fakeEvent)
      mockPublishEvent.mockResolvedValue({
        'wss://relay.test': { status: 'success', detail: '', relay: 'wss://relay.test' },
      })

      await expect(vaultSync.updateVault(TEST_PRIVKEY, vaultData)).resolves.toBeUndefined()

      // Verify encryptVault was called with updated timestamp
      const encryptCall = mockEncryptVault.mock.calls[0]
      expect(encryptCall[0]).toBe(TEST_PRIVKEY)
      expect(encryptCall[1].updatedAt).toBeGreaterThan(1000)
      expect(encryptCall[1].version).toBe(1)
      expect(encryptCall[1].identities).toEqual([])

      expect(mockPublishEvent).toHaveBeenCalledWith(fakeEvent, ['wss://relay.test'])
    })

    it('does not mutate the original vault data', async () => {
      const vaultData = makeVaultData({ updatedAt: 1000 })
      const fakeEvent = makeVaultEvent()

      mockEncryptVault.mockResolvedValue('encrypted-updated')
      mockBuildVaultEvent.mockReturnValue(fakeEvent)
      mockPublishEvent.mockResolvedValue({
        'wss://relay.test': { status: 'success', detail: '', relay: 'wss://relay.test' },
      })

      await vaultSync.updateVault(TEST_PRIVKEY, vaultData)

      expect(vaultData.updatedAt).toBe(1000)
    })
  })

  describe('constructor', () => {
    it('uses provided relay URLs', async () => {
      const customSync = new VaultSync(['wss://custom.relay'])

      mockFetchEvents.mockResolvedValue([])

      await customSync.checkVaultExists(TEST_PUBKEY)

      expect(mockConnectToRelays).toHaveBeenCalledWith(['wss://custom.relay'])
    })
  })
})
