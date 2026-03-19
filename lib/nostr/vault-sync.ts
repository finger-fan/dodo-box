// vault-sync.ts - Vault 与 Nostr relay 同步模块

import { VAULT_EVENT_KIND, VAULT_EVENT_D_TAG } from './types'
import type { VaultData, NostrFilter } from './types'
import { encryptVault, decryptVault, createEmptyVaultData } from './vault-crypto'
import { buildVaultEvent } from './events'
import { relayPool } from './relay-client'

const MOCK_STORAGE_KEY = 'dodobox_vault_mock'

function isMockMode(): boolean {
  if (typeof window === 'undefined') return true
  const envMock = process.env.NEXT_PUBLIC_NOSTR_MOCK
  if (envMock === 'true') return true
  if (envMock === 'false') return false
  const localMock = localStorage.getItem('dodobox_nostr_mock')
  return localMock === 'true'
}

export class VaultSync {
  private relayUrls: string[]

  constructor(relayUrls?: string[]) {
    this.relayUrls =
      relayUrls ||
      (process.env.NEXT_PUBLIC_DEFAULT_RELAYS || 'wss://relay.damus.io').split(',')
  }

  async checkVaultExists(masterPublicKey: string): Promise<boolean> {
    if (isMockMode()) {
      try {
        const stored = localStorage.getItem(MOCK_STORAGE_KEY)
        if (!stored) return false
        const vaults = JSON.parse(stored) as Record<string, string>
        return masterPublicKey in vaults
      } catch {
        return false
      }
    }

    return new Promise((resolve) => {
      const subId = `vault-check-${Date.now()}`
      const filters: NostrFilter[] = [
        {
          kinds: [VAULT_EVENT_KIND],
          authors: [masterPublicKey],
          '#d': [VAULT_EVENT_D_TAG],
          limit: 1,
        },
      ]

      let found = false
      const timeout = setTimeout(() => {
        relayPool.unsubscribe(subId)
        resolve(found)
      }, 5000)

      relayPool.subscribe(subId, filters, () => {
        found = true
        clearTimeout(timeout)
        relayPool.unsubscribe(subId)
        resolve(true)
      })

      relayPool.connect(this.relayUrls).catch(() => {
        clearTimeout(timeout)
        resolve(false)
      })
    })
  }

  async fetchVault(
    masterPublicKey: string,
    masterPrivateKey: string
  ): Promise<VaultData | null> {
    if (isMockMode()) {
      try {
        const stored = localStorage.getItem(MOCK_STORAGE_KEY)
        if (!stored) return null
        const vaults = JSON.parse(stored) as Record<string, string>
        const encryptedContent = vaults[masterPublicKey]
        if (!encryptedContent) return null
        return await decryptVault(masterPrivateKey, encryptedContent)
      } catch (err) {
        console.error('[VaultSync] mock fetchVault failed:', err)
        return null
      }
    }

    return new Promise((resolve) => {
      const subId = `vault-fetch-${Date.now()}`
      const filters: NostrFilter[] = [
        {
          kinds: [VAULT_EVENT_KIND],
          authors: [masterPublicKey],
          '#d': [VAULT_EVENT_D_TAG],
          limit: 1,
        },
      ]

      let latestEvent: { created_at: number; content: string } | null = null
      const timeout = setTimeout(async () => {
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
      }, 5000)

      relayPool.subscribe(subId, filters, (event) => {
        if (!latestEvent || event.created_at > latestEvent.created_at) {
          latestEvent = event
        }
      })

      relayPool.connect(this.relayUrls).catch(() => {
        clearTimeout(timeout)
        resolve(null)
      })
    })
  }

  async publishVault(masterPrivateKey: string, vaultData: VaultData): Promise<void> {
    const encryptedContent = await encryptVault(masterPrivateKey, vaultData)

    if (isMockMode()) {
      const { schnorr } = await import('@noble/curves/secp256k1')
      const { hexToBytes, bytesToHex } = await import('@noble/hashes/utils')
      const pubkeyBytes = schnorr.getPublicKey(hexToBytes(masterPrivateKey))
      const masterPublicKey = bytesToHex(pubkeyBytes)

      const stored = localStorage.getItem(MOCK_STORAGE_KEY)
      const vaults = stored ? (JSON.parse(stored) as Record<string, string>) : {}
      vaults[masterPublicKey] = encryptedContent
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(vaults))
      return
    }

    const event = buildVaultEvent(encryptedContent, masterPrivateKey)
    await relayPool.connect(this.relayUrls)
    relayPool.publish(event)
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
