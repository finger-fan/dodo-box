// vault-sync.ts - Vault sync with Nostr relays (via welshman)

import { KIND_VAULT, VAULT_EVENT_D_TAG } from './types'
import type { VaultData, NostrFilter } from './types'
import { encryptVault, decryptVault, createEmptyVaultData } from './vault-crypto'
import {
  connectToRelays,
  fetchEvents,
  publishEvent,
  getConnectedRelays,
} from '@/lib/welshman/relay-manager'
import { buildVaultEvent } from '@/lib/welshman/crypto'

export class VaultSync {
  private relayUrls: string[]

  constructor(relayUrls?: string[]) {
    this.relayUrls =
      relayUrls ||
      (process.env.NEXT_PUBLIC_DEFAULT_RELAYS || 'wss://relay.damus.io').split(',')
  }

  setRelayUrls(relayUrls: string[]): void {
    this.relayUrls = [...relayUrls]
  }

  async checkVaultExists(masterPublicKey: string): Promise<boolean> {
    connectToRelays(this.relayUrls)

    if (getConnectedRelays().length === 0) {
      // Wait briefly for connections to establish
      await new Promise(resolve => setTimeout(resolve, 2000))
      if (getConnectedRelays().length === 0) return false
    }

    const filters: NostrFilter[] = [
      {
        kinds: [KIND_VAULT],
        authors: [masterPublicKey],
        '#d': [VAULT_EVENT_D_TAG],
        limit: 1,
      },
    ]

    const events = await fetchEvents(filters, this.relayUrls)
    return events.length > 0
  }

  async fetchVault(
    masterPublicKey: string,
    masterPrivateKey: string
  ): Promise<VaultData | null> {
    connectToRelays(this.relayUrls)

    if (getConnectedRelays().length === 0) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      if (getConnectedRelays().length === 0) return null
    }

    const filters: NostrFilter[] = [
      {
        kinds: [KIND_VAULT],
        authors: [masterPublicKey],
        '#d': [VAULT_EVENT_D_TAG],
        limit: 1,
      },
    ]

    const events = await fetchEvents(filters, this.relayUrls)
    if (events.length === 0) return null

    // Use the most recent event
    const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0]

    try {
      return await decryptVault(masterPrivateKey, latestEvent.content)
    } catch {
      return null
    }
  }

  async publishVault(masterPrivateKey: string, vaultData: VaultData): Promise<void> {
    const encryptedContent = await encryptVault(masterPrivateKey, vaultData)
    const event = buildVaultEvent(encryptedContent, masterPrivateKey)
    connectToRelays(this.relayUrls)
    const results = await publishEvent(event, this.relayUrls)
    const anyAccepted = Object.values(results).some(r => r.status === 'success')
    if (!anyAccepted) {
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
