import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function deriveAccountFromCredentials(username: string, password: string): string {
  // Mock derivation: username + password + salt (fixed salt for demo)
  const salt = "doracle_salt_2026";
  // In a real app, we'd use a proper KDF like PBKDF2 or Argon2
  return btoa(`${username}:${password}:${salt}`).replace(/=/g, '');
}

export function encodeContactInfo(pubkey: string): string {
  // Mock protocol obfuscation
  return `doracle://contact/${btoa(pubkey).replace(/=/g, '')}`;
}

export function decodeContactInfo(protocolStr: string): string | null {
  if (!protocolStr.startsWith('doracle://contact/')) return null;
  try {
    const encoded = protocolStr.replace('doracle://contact/', '');
    // Add back padding if needed or handle as is
    return atob(encoded);
  } catch {
    return null;
  }
}

export function encodeIdentityInfo(privkey: string): string {
  return `doracle://identity/${btoa(privkey).replace(/=/g, '')}`;
}

export function decodeIdentityInfo(protocolStr: string): string | null {
  if (!protocolStr.startsWith('doracle://identity/')) return null;
  try {
    const encoded = protocolStr.replace('doracle://identity/', '');
    return atob(encoded);
  } catch {
    return null;
  }
}
