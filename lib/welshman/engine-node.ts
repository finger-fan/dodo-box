// engine-node.ts - Node.js compatible welshman initialization
// Browser version uses Repository (IndexedDB), Node version works without it

import { Pool, Tracker, netContext } from '@welshman/net'
import type { TrustedEvent } from '@welshman/util'

let initialized = false
let pool: Pool | null = null
let tracker: Tracker | null = null

/**
 * Initialize welshman for Node.js environments.
 * Skips Repository (IndexedDB) and WrapManager since they're browser-only.
 */
export function initNodeEngine(): void {
  if (initialized) return

  // Create pool (uses WebSocket, works in Node via ws polyfill)
  pool = new Pool({})
  tracker = new Tracker()

  // Configure net context for request/publish
  netContext.pool = pool
  netContext.isEventValid = (_event: TrustedEvent, _url: string) => true
  netContext.isEventDeleted = () => false

  initialized = true
}

export function getNodePool(): Pool | null {
  if (!initialized) initNodeEngine()
  return pool
}

export function getNodeTracker(): Tracker | null {
  if (!initialized) initNodeEngine()
  return tracker
}

export function destroyNodeEngine(): void {
  if (!initialized) return
  pool?.clear()
  tracker?.clear()
  initialized = false
}
