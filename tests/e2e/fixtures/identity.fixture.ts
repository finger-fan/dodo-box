// Deterministic identity generation for Alice and Bob
// Uses the same deriveMasterKey as the app for consistent pubkeys

import { sha256 } from '@noble/hashes/sha256'
import { schnorr } from '@noble/curves/secp256k1'
import { bytesToHex } from '@noble/hashes/utils'
import { npubEncode } from 'nostr-tools/nip19'
import { encodeIdentityInfo } from '@/lib/utils'

const VAULT_SALT = process.env.NEXT_PUBLIC_VAULT_SALT || 'dodobox-vault-v1'

export interface TestIdentity {
  username: string
  password: string
  displayName: string
  publicKey: string
  npub: string
  /** dodobox://identity/ protocol string with nickname embedded */
  identityUrl: string
}

function deriveKeys(username: string, password: string): { publicKey: string; npub: string } {
  const input = `${username}:${password}:${VAULT_SALT}`
  const privateKeyBytes = sha256(new TextEncoder().encode(input))
  const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes)
  const publicKey = bytesToHex(publicKeyBytes)
  return { publicKey, npub: npubEncode(publicKey) }
}

// Use timestamp-based usernames to avoid collisions between test runs
const runId = Date.now().toString(36)

function buildIdentity(loginName: string, password: string, displayName: string): TestIdentity {
  const keys = deriveKeys(loginName, password)
  return {
    username: loginName,
    password,
    displayName,
    publicKey: keys.publicKey,
    npub: keys.npub,
    identityUrl: encodeIdentityInfo(keys.publicKey, displayName),
  }
}

export const ALICE = buildIdentity(`alice_${runId}`, 'alice_pass_123', 'Alice')
export const BOB = buildIdentity(`bob_${runId}`, 'bob_pass_123', 'Bob')
