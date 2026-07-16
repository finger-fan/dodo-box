// session.ts - Session management for CLI
// Extracted from NostrContext.tsx — identity derivation, vault loading, session creation

import { deriveMasterKey, generateNewIdentityKey, verifyKeyPair } from '@/lib/nostr/key-derivation'
import type { DerivedKey, VaultData, VaultIdentity } from '@/lib/nostr/types'
import { encryptSecret, decryptSecret, encryptVault, decryptVault } from './vault-crypto-node'

export interface CliSession {
  username: string | null
  derivedKey: DerivedKey
  identities: VaultIdentity[]
  currentIdentity: VaultIdentity
  masterPrivkey: string
  masterPubkey: string
}

/**
 * Create or load a session from credentials.
 * If no identities exist in vault, creates a new identity from the master key.
 */
export async function createSession(
  username: string,
  password: string,
  vaultContent?: string
): Promise<CliSession> {
  // 1. Derive master key from username/password
  const derivedKey = deriveMasterKey(username, password)

  // 2. Load or create vault
  let vaultData: VaultData
  if (vaultContent) {
    vaultData = decryptVault(derivedKey.privateKey, vaultContent) as unknown as VaultData
  } else {
    vaultData = {
      version: 1,
      identities: [],
      updatedAt: Date.now(),
    }
  }

  // 3. If no identities, create one from master key
  let identities = vaultData.identities
  if (identities.length === 0) {
    const newIdentity: VaultIdentity = {
      name: username,
      pubkey: derivedKey.publicKey,
      encryptedSecret: encryptSecret(derivedKey.privateKey, derivedKey.privateKey),
      createdAt: Date.now(),
    }
    identities = [newIdentity]
    vaultData.identities = identities
    vaultData.updatedAt = Date.now()
  }

  // 4. Select current identity (first one for now)
  const currentIdentity = identities[0]

  // 5. Decrypt the identity's private key
  let identityPrivkey: string
  try {
    identityPrivkey = decryptSecret(derivedKey.privateKey, currentIdentity.encryptedSecret)
  } catch {
    identityPrivkey = derivedKey.privateKey // fallback: use master key directly
  }

  // 6. Verify key pair matches
  if (!verifyKeyPair(identityPrivkey, currentIdentity.pubkey)) {
    throw new Error(`Key mismatch: identity ${currentIdentity.name} has wrong key`)
  }

  return {
    username,
    derivedKey,
    identities,
    currentIdentity,
    masterPrivkey: identityPrivkey,
    masterPubkey: currentIdentity.pubkey,
  }
}

/**
 * Save session vault to disk-compatible format.
 */
export function serializeSession(session: CliSession): string {
  const vaultData: Record<string, unknown> = {
    version: 1,
    identities: session.identities,
    updatedAt: Date.now(),
  }
  return encryptVault(session.derivedKey.privateKey, vaultData)
}

/**
 * Generate a new random identity and add it to the session.
 */
export function addIdentityToSession(
  session: CliSession,
  name: string
): CliSession {
  const newKey = generateNewIdentityKey()
  const encryptedSecret = encryptSecret(session.derivedKey.privateKey, newKey.privateKey)

  const newIdentity: VaultIdentity = {
    name,
    pubkey: newKey.publicKey,
    encryptedSecret,
    createdAt: Date.now(),
  }

  return {
    ...session,
    identities: [...session.identities, newIdentity],
    currentIdentity: newIdentity,
    masterPrivkey: newKey.privateKey,
    masterPubkey: newKey.publicKey,
  }
}
