// vault-crypto-node.ts - Node.js compatible vault crypto
// Uses same PBKDF2 + AES-GCM as browser version (lib/nostr/vault-crypto.ts)
// Ensures CLI and web UI can decrypt each other's vaults

import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto'

const IV_LENGTH = 12
const PBKDF2_ITERATIONS = 100000
const AES_KEY_LENGTH = 32 // 256 bits
const PBKDF2_SALT = 'vault-aes-key-derivation'

/**
 * Derive an AES-256-GCM key from a hex private key using PBKDF2.
 * Matches browser version: crypto.subtle.deriveKey with PBKDF2(100000, SHA-256)
 */
function deriveAesKeySync(masterPrivateKeyHex: string): Buffer {
  const keyBytes = Buffer.from(masterPrivateKeyHex, 'hex')
  const salt = Buffer.from(PBKDF2_SALT, 'utf8')

  return pbkdf2Sync(keyBytes, salt, PBKDF2_ITERATIONS, AES_KEY_LENGTH, 'sha256')
}

/**
 * Encrypt vault data with AES-256-GCM.
 * Output format: iv:ciphertext (matches browser version)
 */
export function encryptVault(
  masterPrivateKey: string,
  vaultData: Record<string, unknown>
): string {
  const aesKey = deriveAesKeySync(masterPrivateKey)
  const iv = randomBytes(IV_LENGTH)
  const plaintext = JSON.stringify(vaultData)

  const cipher = createCipheriv('aes-256-gcm', aesKey, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  // Format: iv:ciphertext (authTag appended to ciphertext, same as browser)
  // In browser, crypto.subtle.encrypt returns ciphertext with authTag appended
  return `${iv.toString('hex')}:${encrypted}${authTag.toString('hex')}`
}

/**
 * Decrypt vault data with AES-256-GCM.
 * Input format: iv:ciphertext (matches browser version)
 */
export function decryptVault(
  masterPrivateKey: string,
  encryptedContent: string
): Record<string, unknown> {
  const colonIndex = encryptedContent.indexOf(':')
  if (colonIndex === -1) throw new Error('Invalid encrypted content format')

  const ivHex = encryptedContent.slice(0, colonIndex)
  const ciphertextWithAuthTag = encryptedContent.slice(colonIndex + 1)

  // AES-GCM authTag is 16 bytes (32 hex chars), appended to ciphertext
  const authTagHex = ciphertextWithAuthTag.slice(-32)
  const ciphertextHex = ciphertextWithAuthTag.slice(0, -32)

  const aesKey = deriveAesKeySync(masterPrivateKey)
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')

  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])

  const plaintext = decrypted.toString('utf8')
  const data = JSON.parse(plaintext)

  if (data.version !== 1 || !Array.isArray(data.identities)) {
    throw new Error('Invalid vault data structure')
  }

  return data
}

/**
 * Encrypt a secret string with AES-256-GCM.
 * Output format: iv:ciphertext (matches browser version)
 */
export function encryptSecret(
  masterPrivateKey: string,
  secret: string
): string {
  const aesKey = deriveAesKeySync(masterPrivateKey)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv('aes-256-gcm', aesKey, iv)

  let encrypted = cipher.update(secret, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${encrypted}${authTag.toString('hex')}`
}

/**
 * Decrypt a secret string with AES-256-GCM.
 * Input format: iv:ciphertext (matches browser version)
 */
export function decryptSecret(
  masterPrivateKey: string,
  encryptedSecret: string
): string {
  const colonIndex = encryptedSecret.indexOf(':')
  if (colonIndex === -1) throw new Error('Invalid encrypted secret format')

  const ivHex = encryptedSecret.slice(0, colonIndex)
  const ciphertextWithAuthTag = encryptedSecret.slice(colonIndex + 1)

  // AES-GCM authTag is 16 bytes (32 hex chars), appended to ciphertext
  const authTagHex = ciphertextWithAuthTag.slice(-32)
  const ciphertextHex = ciphertextWithAuthTag.slice(0, -32)

  const aesKey = deriveAesKeySync(masterPrivateKey)
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')

  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString('utf8')
}