import { clsx, type ClassValue } from 'clsx';
import { decode, npubEncode } from 'nostr-tools/nip19';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * @deprecated Use decodeIdentityInfo instead. Kept for backward compatibility
 * with old dodobox://contact/ strings that may still be in circulation.
 */
export function decodeContactInfo(protocolStr: string): string | null {
  if (!protocolStr.startsWith('dodobox://contact/')) return null;
  const encoded = protocolStr.replace('dodobox://contact/', '');

  if (encoded.startsWith('npub1')) {
    try {
      const decoded = decode(encoded);
      if (decoded.type === 'npub') return decoded.data as string;
    } catch {
      // fall through
    }
  }

  try {
    return atob(encoded);
  } catch {
    return null;
  }
}

// -- hex helpers --

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function computeChecksum(xored: Uint8Array, key: Uint8Array): number {
  const sumXored = xored.reduce((a, b) => a + b, 0)
  const xorKey = key.reduce((a, b) => a ^ b, 0)
  return (sumXored ^ xorKey) & 0xff
}

/**
 * Encode identity info (nickname + pubkey) into a dodobox:// protocol string.
 *
 * Format: dodobox://identity/npub1<SEG1>-<SEG2>-<SEG3>
 *   SEG1 = hex(XOR(payload, randomKey))   payload = "nickname|pubkeyHex"
 *   SEG2 = hex(randomKey)                 4 bytes = 8 hex chars
 *   SEG3 = hex(checksum)                  1 byte  = 2 hex chars
 */
export function encodeIdentityInfo(pubkeyHex: string, nickname: string): string {
  const payload = new TextEncoder().encode(`${nickname}|${pubkeyHex}`)
  const randomKey = crypto.getRandomValues(new Uint8Array(4))
  const xored = new Uint8Array(payload.length)
  for (let i = 0; i < payload.length; i++) {
    xored[i] = payload[i] ^ randomKey[i % 4]
  }
  const cksum = computeChecksum(xored, randomKey)
  return `dodobox://identity/npub1${toHex(xored)}-${toHex(randomKey)}-${toHex(new Uint8Array([cksum]))}`
}

/**
 * Decode a dodobox://identity/ protocol string back to { pubkey, nickname }.
 * Returns null if the string is invalid or checksum fails.
 */
export function decodeIdentityInfo(protocolStr: string): { pubkey: string; nickname: string } | null {
  const prefix = 'dodobox://identity/npub1'
  if (!protocolStr.startsWith(prefix)) return null

  const body = protocolStr.slice(prefix.length)
  const parts = body.split('-')
  if (parts.length !== 3) return null

  try {
    const xored = fromHex(parts[0])
    const randomKey = fromHex(parts[1])
    const expectedCksum = fromHex(parts[2])

    if (randomKey.length !== 4 || expectedCksum.length !== 1) return null

    const actualCksum = computeChecksum(xored, randomKey)
    if (actualCksum !== expectedCksum[0]) return null

    const payload = new Uint8Array(xored.length)
    for (let i = 0; i < xored.length; i++) {
      payload[i] = xored[i] ^ randomKey[i % 4]
    }

    const text = new TextDecoder().decode(payload)
    const pipeIdx = text.lastIndexOf('|')
    if (pipeIdx === -1) return null

    const nickname = text.slice(0, pipeIdx)
    const pubkey = text.slice(pipeIdx + 1)

    if (!/^[0-9a-f]{64}$/i.test(pubkey)) return null

    return { pubkey, nickname }
  } catch {
    return null
  }
}

/**
 * Format a pubkey hex as short display string
 */
export function shortPubkey(pubkeyHex: string): string {
  try {
    const npub = npubEncode(pubkeyHex);
    return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
  } catch {
    return `${pubkeyHex.slice(0, 8)}...`;
  }
}
