// runtime-config.ts - Client-side runtime configuration loader
// Fetches server-side environment variables (like relay URLs) at runtime
// so that NEXT_PUBLIC_* build-time inlining is not required for deployment.

import { createLogger } from '@/lib/logger'

const log = createLogger('RuntimeConfig')

export interface RuntimeConfig {
  relays: string[]
}

const DEFAULT_RELAYS = 'wss://relay.damus.io'
const USER_RELAYS_KEY = 'dodobox_user_relays'

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const url = '/api/config'
  log.debug(`Fetching runtime config from: ${url}, base URL: ${typeof window !== 'undefined' ? window.location.origin : 'unknown'}`)
  
  try {
    const res = await fetch(url)
    log.debug(`Response status: ${res.status}, content-type: ${res.headers.get('content-type')}`)
    
    if (!res.ok) {
      const text = await res.text().catch(() => 'unable to read response')
      log.error(`API returned ${res.status}: ${text.slice(0, 100)}`)
      throw new Error(`Failed to load runtime config: ${res.status}`)
    }
    
    const data = await res.json()
    log.debug(`Got config with ${data.relays?.length || 0} relays`)
    return data
  } catch (err) {
    log.error('Failed to fetch runtime config', err)
    throw err
  }
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
