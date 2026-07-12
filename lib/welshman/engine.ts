// engine.ts - Singleton initialization for welshman Repository, Pool, Tracker, WrapManager

import { Repository, Pool, Tracker, WrapManager, netContext } from '@welshman/net'
import type { TrustedEvent } from '@welshman/util'

let initialized = false

// Singletons — lazily initialized on first access
let repository: Repository | null = null
let pool: Pool | null = null
let tracker: Tracker | null = null
let wrapManager: WrapManager | null = null

/**
 * Initialize welshman engine singletons. Safe to call multiple times (idempotent).
 * @param options.nodeMode - If true, skip Repository (IndexedDB) and WrapManager for Node.js environments.
 */
export function initEngine(options?: { nodeMode?: boolean }): void {
  if (initialized) return

  const nodeMode = options?.nodeMode ?? false

  pool = Pool.get()
  tracker = new Tracker()

  if (!nodeMode) {
    repository = Repository.get()
    wrapManager = new WrapManager({ repository, tracker })
    netContext.repository = repository
    netContext.isEventDeleted = (event: TrustedEvent, _url: string) => repository!.isDeleted(event)
  } else {
    // Node.js: no IndexedDB, no WrapManager
    netContext.isEventDeleted = () => false
  }

  // Configure the shared net context used by welshman's request/publish functions
  netContext.pool = pool
  netContext.isEventValid = (_event: TrustedEvent, _url: string) => true

  initialized = true
}

export function getRepository(): Repository | null {
  if (!initialized) initEngine()
  return repository
}

export function getPool(): Pool | null {
  if (!initialized) initEngine()
  return pool
}

export function getTracker(): Tracker | null {
  if (!initialized) initEngine()
  return tracker
}

export function getWrapManager(): WrapManager | null {
  if (!initialized) initEngine()
  return wrapManager
}

export function isEngineInitialized(): boolean {
  return initialized
}

/**
 * Tear down all singletons. Used for testing or logout cleanup.
 */
export function destroyEngine(): void {
  if (!initialized) return

  pool?.clear()
  tracker?.clear()
  initialized = false
}
