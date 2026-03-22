// vault-crypto.ts - 保险库加解密模块
// 移植自 Doracle src/engine/vault/vaultCrypto.ts
// AES-GCM 256-bit + PBKDF2(100000次)

import { hexToBytes, bytesToHex } from '@noble/hashes/utils'
import { VAULT_ERROR_CODES, VaultError } from './types'
import type { VaultData, VaultIdentity } from './types'

const IV_LENGTH = 12
const PBKDF2_ITERATIONS = 100000
const AES_KEY_LENGTH = 256
const PBKDF2_SALT = 'vault-aes-key-derivation'

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function deriveAesKey(masterPrivateKey: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(masterPrivateKey)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const salt = new TextEncoder().encode(PBKDF2_SALT)
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH))
}

export async function encryptVault(
  masterPrivateKey: string,
  vaultData: VaultData
): Promise<string> {
  try {
    const aesKey = await deriveAesKey(masterPrivateKey)
    const iv = generateIV()
    const plaintext = JSON.stringify(vaultData)
    const dataBuffer = new TextEncoder().encode(plaintext)

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      aesKey,
      toArrayBuffer(dataBuffer)
    )

    return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`
  } catch (error) {
    console.error('[VaultCrypto] encryptVault failed:', error)
    throw new VaultError('Failed to encrypt vault', VAULT_ERROR_CODES.ENCRYPTION_FAILED)
  }
}

export async function decryptVault(
  masterPrivateKey: string,
  encryptedContent: string
): Promise<VaultData> {
  try {
    const colonIndex = encryptedContent.indexOf(':')
    if (colonIndex === -1) throw new Error('Invalid encrypted content format')

    const ivHex = encryptedContent.slice(0, colonIndex)
    const ciphertextHex = encryptedContent.slice(colonIndex + 1)

    const aesKey = await deriveAesKey(masterPrivateKey)
    const iv = hexToBytes(ivHex)
    const ciphertext = hexToBytes(ciphertextHex)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      aesKey,
      toArrayBuffer(ciphertext)
    )

    const plaintext = new TextDecoder().decode(decrypted)
    const data = JSON.parse(plaintext)

    if (data.version !== 1 || !Array.isArray(data.identities)) {
      throw new Error('Invalid vault data structure')
    }

    return data as VaultData
  } catch (error) {
    console.error('[VaultCrypto] decryptVault failed:', error)
    throw new VaultError('Failed to decrypt vault', VAULT_ERROR_CODES.DECRYPTION_FAILED)
  }
}

export async function encryptSecret(
  masterPrivateKey: string,
  secret: string
): Promise<string> {
  try {
    const aesKey = await deriveAesKey(masterPrivateKey)
    const iv = generateIV()
    const dataBuffer = new TextEncoder().encode(secret)

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      aesKey,
      toArrayBuffer(dataBuffer)
    )

    return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`
  } catch (error) {
    console.error('[VaultCrypto] encryptSecret failed:', error)
    throw new VaultError('Failed to encrypt secret', VAULT_ERROR_CODES.ENCRYPTION_FAILED)
  }
}

export async function decryptSecret(
  masterPrivateKey: string,
  encryptedSecret: string
): Promise<string> {
  try {
    const colonIndex = encryptedSecret.indexOf(':')
    if (colonIndex === -1) throw new Error('Invalid encrypted secret format')

    const ivHex = encryptedSecret.slice(0, colonIndex)
    const ciphertextHex = encryptedSecret.slice(colonIndex + 1)

    const aesKey = await deriveAesKey(masterPrivateKey)
    const iv = hexToBytes(ivHex)
    const ciphertext = hexToBytes(ciphertextHex)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      aesKey,
      toArrayBuffer(ciphertext)
    )

    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.error('[VaultCrypto] decryptSecret failed:', error)
    throw new VaultError('Failed to decrypt secret', VAULT_ERROR_CODES.DECRYPTION_FAILED)
  }
}

export function createEmptyVaultData(): VaultData {
  return {
    version: 1,
    identities: [],
    updatedAt: Date.now(),
  }
}

export function addIdentityToVault(vaultData: VaultData, identity: VaultIdentity): VaultData {
  if (vaultData.identities.some(i => i.pubkey === identity.pubkey)) {
    throw new VaultError('Identity already exists in vault', VAULT_ERROR_CODES.ACCOUNT_EXISTS)
  }
  return {
    ...vaultData,
    identities: [...vaultData.identities, identity],
    updatedAt: Date.now(),
  }
}

export function removeIdentityFromVault(vaultData: VaultData, pubkey: string): VaultData {
  const identities = vaultData.identities.filter(i => i.pubkey !== pubkey)
  if (identities.length === vaultData.identities.length) {
    throw new VaultError('Identity not found in vault', VAULT_ERROR_CODES.ACCOUNT_NOT_FOUND)
  }
  return {
    ...vaultData,
    identities,
    updatedAt: Date.now(),
  }
}
