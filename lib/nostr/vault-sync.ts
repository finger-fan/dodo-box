// vault-sync.ts - Vault sync with Nostr relays

import { KIND_VAULT, VAULT_EVENT_D_TAG } from './types'
import type { VaultData, NostrFilter } from './types'
import { encryptVault, decryptVault, createEmptyVaultData } from './vault-crypto'
import { buildVaultEvent } from './events'
import { relayPool } from './relay-client'

const VAULT_SUBSCRIPTION_TIMEOUT_MS = 10000

export class VaultSync {
  private relayUrls: string[]

  constructor(relayUrls?: string[]) {
    this.relayUrls =
      relayUrls ||
      (process.env.NEXT_PUBLIC_DEFAULT_RELAYS || 'wss://relay.damus.io').split(',')
  }

  async checkVaultExists(masterPublicKey: string): Promise<boolean> {
    await relayPool.connect(this.relayUrls)

    if (relayPool.getConnectedRelays().length === 0) {
      return false
    }

    return new Promise((resolve) => {
      const subId = `vault-check-${Date.now()}`
      const filters: NostrFilter[] = [
        {
          kinds: [KIND_VAULT],
          authors: [masterPublicKey],
          '#d': [VAULT_EVENT_D_TAG],
          limit: 1,
        },
      ]

      let found = false
      const timeout = setTimeout(() => {
        relayPool.unsubscribe(subId)
        resolve(found)
      }, VAULT_SUBSCRIPTION_TIMEOUT_MS)

      relayPool.subscribe(subId, filters, () => {
        found = true
        clearTimeout(timeout)
        relayPool.unsubscribe(subId)
        resolve(true)
      }, () => {
        // onEose: relay finished sending stored events
        if (!found) {
          clearTimeout(timeout)
          relayPool.unsubscribe(subId)
          resolve(false)
        }
      })
    })
  }

  async fetchVault(
    masterPublicKey: string,
    masterPrivateKey: string
  ): Promise<VaultData | null> {
    await relayPool.connect(this.relayUrls)

    if (relayPool.getConnectedRelays().length === 0) {
      return null
    }

    return new Promise((resolve) => {
      const subId = `vault-fetch-${Date.now()}`
      const filters: NostrFilter[] = [
        {
          kinds: [KIND_VAULT],
          authors: [masterPublicKey],
          '#d': [VAULT_EVENT_D_TAG],
          limit: 1,
        },
      ]

      let latestEvent: { created_at: number; content: string } | null = null
      let resolved = false

      const resolveWithLatest = async () => {
        if (resolved) return
        resolved = true
        relayPool.unsubscribe(subId)
        if (!latestEvent) {
          resolve(null)
          return
        }
        try {
          const data = await decryptVault(masterPrivateKey, latestEvent.content)
          resolve(data)
        } catch {
          resolve(null)
        }
      }

      const timeout = setTimeout(resolveWithLatest, VAULT_SUBSCRIPTION_TIMEOUT_MS)

      relayPool.subscribe(subId, filters, (event) => {
        if (!latestEvent || event.created_at > latestEvent.created_at) {
          latestEvent = event
        }
      }, () => {
        // onEose: relay finished, process immediately
        clearTimeout(timeout)
        resolveWithLatest()
      })
    })
  }

  async publishVault(masterPrivateKey: string, vaultData: VaultData): Promise<void> {
    const encryptedContent = await encryptVault(masterPrivateKey, vaultData)
    const event = buildVaultEvent(encryptedContent, masterPrivateKey)
    await relayPool.connect(this.relayUrls)
    const accepted = await relayPool.publish(event)
    if (!accepted) {
      throw new Error('Vault publish failed: no relay accepted the event')
    }
  }

  async createVault(masterPrivateKey: string): Promise<VaultData> {
    const vaultData = createEmptyVaultData()
    await this.publishVault(masterPrivateKey, vaultData)
    return vaultData
  }

  async updateVault(masterPrivateKey: string, vaultData: VaultData): Promise<void> {
    const updated = { ...vaultData, updatedAt: Date.now() }
    await this.publishVault(masterPrivateKey, updated)
  }
}

export const vaultSync = new VaultSync()
