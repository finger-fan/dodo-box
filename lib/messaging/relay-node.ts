// relay-node.ts - Node.js compatible relay management
// Uses direct welshman/net imports without Repository dependency

import { publish, request, Tracker } from '@welshman/net'
import type { Filter, TrustedEvent, SignedEvent } from '@welshman/util'
import type { PublishResultsByRelay } from '@welshman/net'
import { SocketStatus, SocketEvent } from '@welshman/net'
import { getNodePool, getNodeTracker, initNodeEngine } from '../welshman/engine-node'

const DEFAULT_REQUEST_TIMEOUT = 8000

/**
 * Connect sockets for the given relay URLs.
 */
export function connectToRelays(relayUrls: readonly string[]): void {
  const pool = getNodePool()
  if (!pool) return

  for (const url of relayUrls) {
    const socket = pool.get(url)
    if (socket.status === SocketStatus.Closed || socket.status === SocketStatus.Error) {
      socket.open()
    }
  }
}

/**
 * Publish a signed event to multiple relays.
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
 * Fetch events matching filters.
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
 * Subscribe to events matching filters.
 * Returns an AbortController to cancel.
 */
export function subscribe(
  filters: Filter[],
  relayUrls: readonly string[],
  onEvent: (event: TrustedEvent, url: string) => void,
  onEose?: (url: string) => void
): AbortController {
  connectToRelays(relayUrls)

  const controller = new AbortController()
  const tracker = getNodeTracker() ?? new Tracker()

  request({
    filters,
    relays: [...relayUrls],
    tracker,
    autoClose: false,
    signal: controller.signal,
    onEvent,
    onEose,
  }).catch(() => {
    // AbortError expected on unsubscribe
  })

  return controller
}

/**
 * Get list of connected relay URLs.
 */
export function getConnectedRelays(): string[] {
  const pool = getNodePool()
  if (!pool) return []
  const connected: string[] = []
  for (const [url, socket] of (pool as any)._data.entries()) {
    if (socket.status === SocketStatus.Open) {
      connected.push(url)
    }
  }
  return connected
}

/**
 * Get a map of all known relay URLs to their current connection status.
 */
export function getRelayStatusMap(): Map<string, SocketStatus> {
  const pool = getNodePool()
  if (!pool) return new Map()
  const map = new Map<string, SocketStatus>()
  for (const [url, socket] of (pool as any)._data.entries()) {
    map.set(url, socket.status)
  }
  return map
}

/**
 * Wait for a relay to reach Open status.
 */
export function waitForRelayConnection(
  url: string,
  timeout = 10000
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      connectToRelays([url])
      const pool = getNodePool()
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
