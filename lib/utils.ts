import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Encode a contact pubkey (hex) to a dodobox:// protocol string
 * Uses npub bech32 encoding via nostr-tools
 */
export function encodeContactInfo(pubkeyHex: string): string {
  try {
    const { npubEncode } = require('nostr-tools/nip19');
    return `dodobox://contact/${npubEncode(pubkeyHex)}`;
  } catch {
    return `dodobox://contact/${btoa(pubkeyHex).replace(/=/g, '')}`;
  }
}

/**
 * Decode a dodobox://contact/ protocol string to pubkey hex
 * Supports npub bech32 and legacy base64
 */
export function decodeContactInfo(protocolStr: string): string | null {
  if (!protocolStr.startsWith('dodobox://contact/')) return null;
  const encoded = protocolStr.replace('dodobox://contact/', '');

  // Try npub bech32
  if (encoded.startsWith('npub1')) {
    try {
      const { decode } = require('nostr-tools/nip19');
      const decoded = decode(encoded);
      if (decoded.type === 'npub') return decoded.data as string;
    } catch {
      // fall through
    }
  }

  // Legacy base64 fallback
  try {
    return atob(encoded);
  } catch {
    return null;
  }
}

/**
 * Encode a pubkey (hex) to a dodobox://identity/ protocol string
 */
export function encodeIdentityInfo(pubkeyHex: string): string {
  try {
    const { npubEncode } = require('nostr-tools/nip19');
    return `dodobox://identity/${npubEncode(pubkeyHex)}`;
  } catch {
    return `dodobox://identity/${btoa(pubkeyHex).replace(/=/g, '')}`;
  }
}

export function decodeIdentityInfo(protocolStr: string): string | null {
  if (!protocolStr.startsWith('dodobox://identity/')) return null;
  const encoded = protocolStr.replace('dodobox://identity/', '');

  if (encoded.startsWith('npub1')) {
    try {
      const { decode } = require('nostr-tools/nip19');
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

/**
 * Format a pubkey hex as short display string
 */
export function shortPubkey(pubkeyHex: string): string {
  try {
    const { npubEncode } = require('nostr-tools/nip19');
    const npub = npubEncode(pubkeyHex);
    return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
  } catch {
    return `${pubkeyHex.slice(0, 8)}...`;
  }
}
