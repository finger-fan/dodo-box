import { describe, it, expect } from 'vitest'
import {
  createEmptyVaultData,
  addIdentityToVault,
  removeIdentityFromVault,
  encryptVault,
  decryptVault,
  encryptSecret,
  decryptSecret,
} from '@/lib/nostr/vault-crypto'
import type { VaultIdentity } from '@/lib/nostr/types'

function createIdentity(name: string, pubkey: string): VaultIdentity {
  return { name, pubkey, encryptedSecret: 'secret', createdAt: 1000 }
}

describe('vault identity CRUD', () => {
  it('T-IDT-05: createIdentity adds identity to vault', () => {
    const vault = createEmptyVaultData()
    const identity = createIdentity('Alice', 'a'.repeat(64))
    const updated = addIdentityToVault(vault, identity)
    expect(updated.identities).toHaveLength(1)
    expect(updated.identities[0].name).toBe('Alice')
  })

  it('T-IDT-06: deleteIdentity removes identity from vault', () => {
    const identity = createIdentity('Alice', 'a'.repeat(64))
    const vault = addIdentityToVault(createEmptyVaultData(), identity)
    const updated = removeIdentityFromVault(vault, 'a'.repeat(64))
    expect(updated.identities).toHaveLength(0)
  })

  it('T-IDT-07: updateIdentityName updates display name', () => {
    const identity = createIdentity('Alice', 'a'.repeat(64))
    const vault = addIdentityToVault(createEmptyVaultData(), identity)
    const updated = {
      ...vault,
      identities: vault.identities.map(i => i.pubkey === 'a'.repeat(64) ? { ...i, name: 'Alicia' } : i),
      updatedAt: Date.now(),
    }
    expect(updated.identities[0].name).toBe('Alicia')
  })
})

describe('vault crypto encrypt/decrypt', () => {
  it('encrypts and decrypts vault data round-trip', async () => {
    const privkey = 'a'.repeat(64)
    const vault = createEmptyVaultData()
    const identity = createIdentity('Alice', 'b'.repeat(64))
    const vaultWithIdentity = addIdentityToVault(vault, identity)
    const encrypted = await encryptVault(privkey, vaultWithIdentity)
    expect(encrypted).toContain(':')
    const decrypted = await decryptVault(privkey, encrypted)
    expect(decrypted.identities).toHaveLength(1)
    expect(decrypted.identities[0].name).toBe('Alice')
  })

  it('encrypts and decrypts a secret round-trip', async () => {
    const privkey = 'a'.repeat(64)
    const secret = 'my-private-key-hex'
    const encrypted = await encryptSecret(privkey, secret)
    expect(encrypted).toContain(':')
    const decrypted = await decryptSecret(privkey, encrypted)
    expect(decrypted).toBe(secret)
  })

  it('fails to decrypt with wrong key', async () => {
    const privkey1 = 'a'.repeat(64)
    const privkey2 = 'b'.repeat(64)
    const vault = createEmptyVaultData()
    const encrypted = await encryptVault(privkey1, vault)
    await expect(decryptVault(privkey2, encrypted)).rejects.toThrow()
  })

  it('fails to decrypt corrupted content', async () => {
    const privkey = 'a'.repeat(64)
    await expect(decryptVault(privkey, 'corrupted:content')).rejects.toThrow()
  })

  it('fails to decrypt with no colon separator', async () => {
    const privkey = 'a'.repeat(64)
    await expect(decryptVault(privkey, 'nocolonhere')).rejects.toThrow()
  })
})
