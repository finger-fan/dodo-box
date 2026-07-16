// runtime-config.ts - Client-side runtime configuration loader
// Fetches server-side environment variables (like relay URLs) at runtime
// so that NEXT_PUBLIC_* build-time inlining is not required for deployment.

export interface RuntimeConfig {
  relays: string[]
}

const DEFAULT_RELAYS = 'wss://relay.damus.io'
const USER_RELAYS_KEY = 'dodobox_user_relays'

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const res = await fetch('/api/config')
  if (!res.ok) {
    throw new Error(`Failed to load runtime config: ${res.status}`)
  }
  return res.json()
}

export function getDefaultRelays(): string[] {
  return (process.env.NEXT_PUBLIC_DEFAULT_RELAYS || DEFAULT_RELAYS)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * Get user-defined relays from localStorage. Falls back to empty array.
 */
export function getUserRelays(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(USER_RELAYS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string' && s.length > 0)
  } catch {
    return []
  }
}

/**
 * Persist user-defined relays to localStorage.
 */
export function setUserRelays(relays: readonly string[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(USER_RELAYS_KEY, JSON.stringify(relays))
  } catch {
    // localStorage unavailable — non-critical
  }
}

/**
 * Clear user-defined relays from localStorage.
 */
export function clearUserRelays(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(USER_RELAYS_KEY)
  } catch {
    // non-critical
  }
}
