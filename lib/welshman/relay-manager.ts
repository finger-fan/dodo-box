// relay-manager.ts - Welshman Pool/Socket based relay management
// Shared by web and CLI. Both use the same engine singletons.

import { publish, request, Tracker } from '@welshman/net'
import type { Filter, TrustedEvent, SignedEvent } from '@welshman/util'
import type { PublishResultsByRelay } from '@welshman/net'
import { getPool, getTracker } from './engine'
import { SocketStatus } from '@welshman/net'
import { SocketEvent } from '@welshman/net'

const DEFAULT_REQUEST_TIMEOUT = 8000
const MAX_RETRY_COUNT = 3

// ── Status Types ──────────────────────────────────────────────

export type RelayStatus = 'connecting' | 'connected' | 'failed' | 'unavailable' | 'closed'

export interface RelayState {
  status: RelayStatus
  retryCount: number
  firstFailedAt?: number
}

export type OnRelayStatusChange = (url: string, status: RelayStatus, state: RelayState) => void

export interface RelayManagerOptions {
  onStatusChange?: OnRelayStatusChange
}

let onStatusChange: OnRelayStatusChange | undefined
const relayStateMap = new Map<string, RelayState>()
const trackedSocketUrls = new Set<string>()

function createRelayState(status: RelayStatus, retryCount = 0): RelayState {
  return {
    status,
    retryCount,
    firstFailedAt: status === 'failed' ? Date.now() : undefined,
  }
}

function computeStatus(state: RelayState): RelayStatus {
  if (state.retryCount >= MAX_RETRY_COUNT && state.status === 'failed') {
    return 'unavailable'
  }
  return state.status
}

/**
 * Initialize relay manager with optional status-change callback.
 * Call once before connecting to relays. Safe to call multiple times.
 */
export function initRelayManager(options?: RelayManagerOptions): void {
  if (options?.onStatusChange) {
    onStatusChange = options.onStatusChange
  }
}

/**
 * Get a snapshot of current relay states.
 */
export function getRelayStateMap(): Map<string, RelayState> {
  return new Map(relayStateMap)
}

/**
 * Get a snapshot of current relay statuses (computed from state).
 */
export function getStatusMap(): Map<string, RelayStatus> {
  const result = new Map<string, RelayStatus>()
  for (const [url, state] of relayStateMap.entries()) {
    result.set(url, computeStatus(state))
  }
  return result
}

/**
 * Get relay state for a specific URL.
 */
export function getRelayState(url: string): RelayState | undefined {
  return relayStateMap.get(url)
}

// ── Core Operations ──────────────────────────────────────────────

/**
 * Ensure sockets are opened for the given relay URLs.
 * welshman Pool creates sockets lazily via pool.get(url) and auto-reconnects.
 */
export function connectToRelays(relayUrls: readonly string[]): void {
  const pool = getPool()
  if (!pool) throw new Error('Pool not initialized')
  for (const url of relayUrls) {
    const socket = pool.get(url)

    // Register status listener once per URL
    if (!trackedSocketUrls.has(url)) {
      trackedSocketUrls.add(url)
      
      // Initialize state based on current socket status
      const initialStatus = mapSocketStatusToRelayStatus(socket.status)
      relayStateMap.set(url, createRelayState(initialStatus))

      socket.on(SocketEvent.Status, (status: SocketStatus) => {
        const prev = relayStateMap.get(url)
        const newStatus = mapSocketStatusToRelayStatus(status)
        
        // Track retry count: Error → Opening means retry attempt
        let newRetryCount = prev?.retryCount ?? 0
        if (prev?.status === 'failed' && newStatus === 'connecting') {
          newRetryCount++
        }
        
        // Reset retry count on successful connection
        if (newStatus === 'connected') {
          newRetryCount = 0
        }
        
        const newState: RelayState = {
          status: newStatus,
          retryCount: newRetryCount,
          firstFailedAt: newStatus === 'failed' ? Date.now() : undefined,
        }
        
        relayStateMap.set(url, newState)
        onStatusChange?.(url, computeStatus(newState), newState)
      })
    }

    if (socket.status === SocketStatus.Closed || socket.status === SocketStatus.Error) {
      socket.open()
    }
  }
}

function mapSocketStatusToRelayStatus(s: SocketStatus): RelayStatus {
  switch (s) {
    case SocketStatus.Opening: return 'connecting'
    case SocketStatus.Open:    return 'connected'
    case SocketStatus.Error:   return 'failed'
    default:                   return 'closed'
  }
}

/**
 * Publish a signed event to multiple relays with per-relay status tracking.
 */
export async function publishEvent(
  event: SignedEvent,
  relayUrls: readonly string[],
  options?: { timeout?: number; signal?: AbortSignal }
): Promise<PublishResultsByRelay> {
  connectToRelays(relayUrls)

  return publish({
    event,
    relays: [...relayUrls],
    timeout: options?.timeout ?? DEFAULT_REQUEST_TIMEOUT,
    signal: options?.signal,
  })
}

/**
 * Fetch events matching filters from multiple relays.
 * Returns when all relays send EOSE or timeout is reached.
 */
export async function fetchEvents(
  filters: Filter[],
  relayUrls: readonly string[],
  options?: {
    timeout?: number
    signal?: AbortSignal
    onEvent?: (event: TrustedEvent, url: string) => void
    onEose?: (url: string) => void
  }
): Promise<TrustedEvent[]> {
  connectToRelays(relayUrls)

  // Use a fresh Tracker per fetch to avoid cross-request dedup.
  // React StrictMode re-runs effects, and a shared Tracker would mark events
  // from the first (unmounted) run as "seen", causing the second run to miss them.
  return request({
    filters,
    relays: [...relayUrls],
    tracker: new Tracker(),
    autoClose: true,
    onEvent: options?.onEvent,
    onEose: options?.onEose,
    signal: options?.signal,
  })
}

/**
 * Subscribe to events matching filters (real-time, no auto-close).
 * Returns an AbortController to cancel the subscription.
 */
export function subscribe(
  filters: Filter[],
  relayUrls: readonly string[],
  onEvent: (event: TrustedEvent, url: string) => void,
  onEose?: (url: string) => void
): AbortController {
  connectToRelays(relayUrls)

  const controller = new AbortController()
  const tracker = getTracker()
  if (!tracker) throw new Error('Tracker not initialized')

  request({
    filters,
    relays: [...relayUrls],
    tracker,
    autoClose: false,
    signal: controller.signal,
    onEvent,
    onEose,
  }).catch(() => {
    // AbortError is expected when unsubscribing
  })

  return controller
}

/**
 * Get list of connected relay URLs.
 */
export function getConnectedRelays(): string[] {
  const pool = getPool()
  if (!pool) return []
  const connected: string[] = []
  for (const [url, socket] of pool._data.entries()) {
    if (socket.status === SocketStatus.Open) {
      connected.push(url)
    }
  }
  return connected
}

/**
 * Close all relay connections and clear the pool.
 */
export function closeAllRelays(): void {
  const pool = getPool()
  if (!pool) return
  pool.clear()
  trackedSocketUrls.clear()
  relayStateMap.clear()
}

/**
 * Manually reconnect a single relay (resets retry count).
 */
export function reconnectRelay(url: string): void {
  const pool = getPool()
  if (!pool) return
  const socket = pool.get(url)
  
  // Reset state and retry
  relayStateMap.set(url, createRelayState('connecting', 0))
  onStatusChange?.(url, 'connecting', relayStateMap.get(url)!)
  socket.open()
}

/**
 * Reconnect all failed or unavailable relays.
 */
export function reconnectFailedRelays(): void {
  for (const [url, state] of relayStateMap.entries()) {
    const computed = computeStatus(state)
    if (computed === 'failed' || computed === 'unavailable') {
      reconnectRelay(url)
    }
  }
}

/**
 * Check if any relays are in failed or unavailable state.
 */
export function hasFailedRelays(): boolean {
  for (const state of relayStateMap.values()) {
    const computed = computeStatus(state)
    if (computed === 'failed' || computed === 'unavailable') {
      return true
    }
  }
  return false
}

/**
 * Get failed relay URLs (those in Error status).
 */
export function getFailedRelays(): string[] {
  const pool = getPool()
  if (!pool) return []
  const failed: string[] = []
  for (const [url, socket] of pool._data.entries()) {
    if (socket.status === SocketStatus.Error) {
      failed.push(url)
    }
  }
  return failed
}

/**
 * Get a map of all known relay URLs to their current SocketStatus.
 */
export function getRelayStatusMap(): Map<string, SocketStatus> {
  const pool = getPool()
  const map = new Map<string, SocketStatus>()
  if (!pool) return map
  for (const [url, socket] of pool._data.entries()) {
    map.set(url, socket.status)
  }
  return map
}

/**
 * Wait for a relay to reach the Open status.
 * Returns true if connected, false on timeout or terminal error.
 */
export function waitForRelayConnection(
  url: string,
  timeout = 10000
): Promise<boolean> {
  return new Promise(resolve => {
    try {
      connectToRelays([url])
      const pool = getPool()
      if (!pool) return resolve(false)
      const socket = pool.get(url)

      if (socket.status === SocketStatus.Open) {
        return resolve(true)
      }
      if (socket.status === SocketStatus.Error || socket.status === SocketStatus.Closed) {
        return resolve(false)
      }

      const timer = setTimeout(() => {
        cleanup()
        resolve(false)
      }, timeout)

      const onStatus = (status: SocketStatus) => {
        if (status === SocketStatus.Open) {
          cleanup()
          resolve(true)
        }
      }

      const cleanup = () => {
        clearTimeout(timer)
        socket.off(SocketEvent.Status, onStatus)
      }

      socket.on(SocketEvent.Status, onStatus)
    } catch {
      resolve(false)
    }
  })
}
