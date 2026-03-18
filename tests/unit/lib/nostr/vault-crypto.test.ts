// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  encryptVault,
  decryptVault,
  encryptSecret,
  decryptSecret,
  createEmptyVaultData,
  addIdentityToVault,
  removeIdentityFromVault,
} from '@/lib/nostr/vault-crypto'
import { VaultError, VAULT_ERROR_CODES } from '@/lib/nostr/types'
import type { VaultData, VaultIdentity } from '@/lib/nostr/types'
import { deriveMasterKey } from '@/lib/nostr/key-derivation'

// Use a deterministic key for crypto tests
const TEST_KEY = deriveMasterKey('vaulttest', 'password').privateKey

const makeIdentity = (suffix: string): VaultIdentity => ({
  name: `Identity ${suffix}`,
  pubkey: 'a'.repeat(60) + suffix.padEnd(4, '0').slice(0, 4),
  encryptedSecret: 'mock_encrypted_secret',
  createdAt: 1000000,
})

describe('encryptVault / decryptVault', () => {
  it('round-trips vault data', async () => {
    const data: VaultData = {
      version: 1,
      identities: [makeIdentity('01')],
      updatedAt: 12345,
    }
    const encrypted = await encryptVault(TEST_KEY, data)
    expect(typeof encrypted).toBe('string')
    expect(encrypted).toContain(':')

    const decrypted = await decryptVault(TEST_KEY, encrypted)
    expect(decrypted.version).toBe(1)
    expect(decrypted.identities).toHaveLength(1)
    expect(decrypted.identities[0].name).toBe('Identity 01')
  })

  it('produces different ciphertexts on separate encryptions (random IV)', async () => {
    const data = createEmptyVaultData()
    const enc1 = await encryptVault(TEST_KEY, data)
    const enc2 = await encryptVault(TEST_KEY, data)
    expect(enc1).not.toBe(enc2)
  })

  it('throws VaultError with wrong key', async () => {
    const data = createEmptyVaultData()
    const encrypted = await encryptVault(TEST_KEY, data)
    const wrongKey = deriveMasterKey('wrong', 'key').privateKey
    await expect(decryptVault(wrongKey, encrypted)).rejects.toThrow(VaultError)
  })

  it('throws VaultError for malformed encrypted content', async () => {
    await expect(decryptVault(TEST_KEY, 'notvalidformat')).rejects.toThrow(VaultError)
  })
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret string', async () => {
    const secret = 'mysecretprivatekey1234567890abcdef'
    const encrypted = await encryptSecret(TEST_KEY, secret)
    expect(encrypted).toContain(':')
    const decrypted = await decryptSecret(TEST_KEY, encrypted)
    expect(decrypted).toBe(secret)
  })

  it('round-trips an empty string', async () => {
    const encrypted = await encryptSecret(TEST_KEY, '')
    const decrypted = await decryptSecret(TEST_KEY, encrypted)
    expect(decrypted).toBe('')
  })

  it('throws VaultError when decrypting with wrong key', async () => {
    const encrypted = await encryptSecret(TEST_KEY, 'hello')
    const wrongKey = deriveMasterKey('wrong', 'key').privateKey
    await expect(decryptSecret(wrongKey, encrypted)).rejects.toThrow(VaultError)
  })
})

describe('createEmptyVaultData', () => {
  it('returns vault with version 1, empty identities', () => {
    const vault = createEmptyVaultData()
    expect(vault.version).toBe(1)
    expect(vault.identities).toEqual([])
    expect(vault.updatedAt).toBeGreaterThan(0)
  })
})

describe('addIdentityToVault', () => {
  it('adds an identity and returns a new object', () => {
    const vault = createEmptyVaultData()
    const identity = makeIdentity('01')
    const updated = addIdentityToVault(vault, identity)

    expect(updated.identities).toHaveLength(1)
    expect(updated.identities[0]).toEqual(identity)
    // original unchanged
    expect(vault.identities).toHaveLength(0)
  })

  it('throws VaultError for duplicate pubkey', () => {
    const vault = createEmptyVaultData()
    const identity = makeIdentity('01')
    const updated = addIdentityToVault(vault, identity)
    expect(() => addIdentityToVault(updated, identity)).toThrow(VaultError)
  })

  it('throws with ACCOUNT_EXISTS code on duplicate', () => {
    const vault = addIdentityToVault(createEmptyVaultData(), makeIdentity('01'))
    try {
      addIdentityToVault(vault, makeIdentity('01'))
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as VaultError).code).toBe(VAULT_ERROR_CODES.ACCOUNT_EXISTS)
    }
  })

  it('updates updatedAt timestamp', () => {
    const vault = createEmptyVaultData()
    const before = vault.updatedAt
    const updated = addIdentityToVault(vault, makeIdentity('02'))
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before)
  })
})

describe('removeIdentityFromVault', () => {
  it('removes an identity and returns a new object', () => {
    const vault = addIdentityToVault(createEmptyVaultData(), makeIdentity('01'))
    const identity2 = makeIdentity('02')
    const vault2 = addIdentityToVault(vault, identity2)

    const updated = removeIdentityFromVault(vault2, makeIdentity('01').pubkey)
    expect(updated.identities).toHaveLength(1)
    expect(updated.identities[0].pubkey).toBe(identity2.pubkey)
    // original unchanged
    expect(vault2.identities).toHaveLength(2)
  })

  it('throws VaultError when identity not found', () => {
    const vault = createEmptyVaultData()
    expect(() => removeIdentityFromVault(vault, 'nonexistent_pubkey')).toThrow(VaultError)
  })

  it('throws with ACCOUNT_NOT_FOUND code', () => {
    try {
      removeIdentityFromVault(createEmptyVaultData(), 'nonexistent')
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as VaultError).code).toBe(VAULT_ERROR_CODES.ACCOUNT_NOT_FOUND)
    }
  })
})
