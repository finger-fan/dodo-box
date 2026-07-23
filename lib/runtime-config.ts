// runtime-config.ts - Client-side runtime configuration loader
// Fetches server-side environment variables (like relay URLs) at runtime
// so that NEXT_PUBLIC_* build-time inlining is not required for deployment.

import { createLogger } from '@/lib/logger'
import { store, StorageKey } from '@/lib/storage'

const log = createLogger('RuntimeConfig')

export interface RuntimeConfig {
  relays: string[]
}

const DEFAULT_RELAYS = 'wss://relay.damus.io'

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
 * Get user-defined relays. Falls back to empty array.
 */
export function getUserRelays(): string[] {
  if (typeof window === 'undefined') return []
  const parsed = store.get<unknown>(StorageKey.USER_RELAYS, []) ?? []
  if (!Array.isArray(parsed)) return []
  return parsed.filter((s): s is string => typeof s === 'string' && s.length > 0)
}

/**
 * Persist user-defined relays.
 */
export function setUserRelays(relays: readonly string[]): void {
  if (typeof window === 'undefined') return
  store.set(StorageKey.USER_RELAYS, [...relays])
}

/**
 * Clear user-defined relays.
 */
export function clearUserRelays(): void {
  if (typeof window === 'undefined') return
  store.remove(StorageKey.USER_RELAYS)
}
