// engine.ts - Singleton initialization for welshman Repository, Pool, Tracker, WrapManager

import { Repository, Pool, Tracker, WrapManager, netContext } from '@welshman/net'
import type { TrustedEvent } from '@welshman/util'

let initialized = false

// Singletons — lazily initialized on first access
let repository: Repository
let pool: Pool
let tracker: Tracker
let wrapManager: WrapManager

function ensureClient(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Initialize welshman engine singletons. Safe to call multiple times (idempotent).
 * Must only be called on the client side.
 */
export function initEngine(): void {
  if (initialized || !ensureClient()) return

  repository = Repository.get()
  pool = Pool.get()
  tracker = new Tracker()
  wrapManager = new WrapManager({ repository, tracker })

  // Configure the shared net context used by welshman's request/publish functions
  netContext.pool = pool
  netContext.repository = repository
  netContext.isEventValid = (_event: TrustedEvent, _url: string) => true
  netContext.isEventDeleted = (event: TrustedEvent, _url: string) => repository.isDeleted(event)

  initialized = true
}

export function getRepository(): Repository {
  if (!initialized) initEngine()
  return repository
}

export function getPool(): Pool {
  if (!initialized) initEngine()
  return pool
}

export function getTracker(): Tracker {
  if (!initialized) initEngine()
  return tracker
}

export function getWrapManager(): WrapManager {
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

  pool.clear()
  tracker.clear()
  initialized = false
}
