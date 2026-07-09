// relay-manager.ts - Welshman Pool/Socket based relay management
// Replaces lib/nostr/relay-client.ts

import { publish, request, Tracker } from '@welshman/net'
import type { Filter, TrustedEvent, SignedEvent } from '@welshman/util'
import type { PublishResultsByRelay } from '@welshman/net'
import { getPool, getTracker, getRepository } from './engine'
import { SocketStatus } from '@welshman/net'
import { SocketEvent } from '@welshman/net'

const DEFAULT_REQUEST_TIMEOUT = 8000

/**
 * Ensure sockets are opened for the given relay URLs.
 * welshman Pool creates sockets lazily via pool.get(url) and auto-reconnects.
 */
export function connectToRelays(relayUrls: readonly string[]): void {
  const pool = getPool()
  for (const url of relayUrls) {
    const socket = pool.get(url)
    if (socket.status === SocketStatus.Closed || socket.status === SocketStatus.Error) {
      socket.open()
    }
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
  pool.clear()
}

/**
 * Get failed relay URLs (those in Error status).
 */
export function getFailedRelays(): string[] {
  const pool = getPool()
  const failed: string[] = []
  for (const [url, socket] of pool._data.entries()) {
    if (socket.status === SocketStatus.Error) {
      failed.push(url)
    }
  }
  return failed
}

/**
 * Get a map of all known relay URLs to their current connection status.
 */
export function getRelayStatusMap(): Map<string, SocketStatus> {
  const pool = getPool()
  const map = new Map<string, SocketStatus>()
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
