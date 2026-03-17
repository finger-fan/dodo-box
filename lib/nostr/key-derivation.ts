// key-derivation.ts - 确定性密钥派生模块
// 移植自 Doracle src/engine/vault/keyDerivation.ts

import { sha256 } from '@noble/hashes/sha256'
import { schnorr } from '@noble/curves/secp256k1'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { npubEncode, nsecEncode } from 'nostr-tools/nip19'
import { VAULT_SALT } from './types'
import type { DerivedKey } from './types'

/**
 * 从用户名和密码派生确定性主密钥
 * SHA256(username:password:SALT) → 私钥
 */
export function deriveMasterKey(username: string, password: string): DerivedKey {
  const input = `${username}:${password}:${VAULT_SALT}`
  const encoder = new TextEncoder()
  const inputBytes = encoder.encode(input)

  const privateKeyBytes = sha256(inputBytes)
  const privateKey = bytesToHex(privateKeyBytes)

  const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes)
  const publicKey = bytesToHex(publicKeyBytes)

  return {
    privateKey,
    publicKey,
    npub: npubEncode(publicKey),
    nsec: nsecEncode(privateKeyBytes),
  }
}

/**
 * 生成新的随机 Nostr 身份密钥对
 */
export function generateNewIdentityKey(): DerivedKey {
  const privateKeyBytes = schnorr.utils.randomPrivateKey()
  const privateKey = bytesToHex(privateKeyBytes)
  const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes)
  const publicKey = bytesToHex(publicKeyBytes)

  return {
    privateKey,
    publicKey,
    npub: npubEncode(publicKey),
    nsec: nsecEncode(privateKeyBytes),
  }
}

/**
 * 验证密钥对是否匹配
 */
export function verifyKeyPair(privateKey: string, publicKey: string): boolean {
  try {
    const derivedPubkey = schnorr.getPublicKey(hexToBytes(privateKey))
    return bytesToHex(derivedPubkey) === publicKey
  } catch {
    return false
  }
}
