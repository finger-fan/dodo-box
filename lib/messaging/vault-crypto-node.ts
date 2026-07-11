// vault-crypto-node.ts - Node.js compatible vault crypto
// Replaces crypto.subtle with node:crypto for CLI usage

import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto'

const IV_LENGTH = 12
const PBKDF2_ITERATIONS = 100000

/**
 * Derive an AES-GCM key from a hex private key using PBKDF2 + scrypt.
 */
function deriveAesKeySync(masterPrivateKeyHex: string): Buffer {
  const keyBytes = Buffer.from(masterPrivateKeyHex, 'hex')
  // Use scrypt as a simpler, synchronous key derivation for CLI
  // This is fine for CLI where performance isn't critical
  return scryptSync(keyBytes, 'vault-aes-key-derivation', 32, {
    N: 16384,
    r: 8,
    p: 1,
  })
}

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
  const authTag = cipher.getAuthTag().toString('hex')

  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decryptVault(
  masterPrivateKey: string,
  encryptedContent: string
): Record<string, unknown> {
  const parts = encryptedContent.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted content format')

  const [ivHex, authTagHex, ciphertextHex] = parts
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

export function encryptSecret(
  masterPrivateKey: string,
  secret: string
): string {
  const aesKey = deriveAesKeySync(masterPrivateKey)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv)

  let encrypted = cipher.update(secret, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decryptSecret(
  masterPrivateKey: string,
  encryptedSecret: string
): string {
  const parts = encryptedSecret.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format')

  const [ivHex, authTagHex, ciphertextHex] = parts
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
