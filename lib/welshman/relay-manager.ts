// relay-manager.ts - Welshman Pool/Socket based relay management
// Shared by web and CLI. Both use the same engine singletons.

import { publish, request, Tracker } from '@welshman/net'
import type { Filter, TrustedEvent, SignedEvent } from '@welshman/util'
import type { PublishResultsByRelay } from '@welshman/net'
import { getPool, getTracker } from './engine'
import { SocketStatus } from '@welshman/net'
import { SocketEvent } from '@welshman/net'
import { createLogger } from '@/lib/logger'

const log = createLogger('RelayManager')

const DEFAULT_REQUEST_TIMEOUT = 8000
const MAX_RETRY_COUNT = 3
const WATCHDOG_INTERVAL_MS = 30_000
const PROBE_TIMEOUT_MS = 6_000

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
// URLs that have reached `connected` at least once. Resubscribe only on
// RE-connects, not on the very first connect (the sub's REQ was just sent).
const everConnectedUrls = new Set<string>()

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

      // Frame-level logging: proves whether REQs actually leave the
      // device and whether the relay answers (EOSE/CLOSED/NOTICE).
      // EVENT frames are logged at debug to keep history replays readable.
      socket.on(SocketEvent.Send, (message: unknown[]) => {
        if (message[0] === 'REQ') {
          log.info(`frame OUT: REQ id=${message[1]}, url=${url}, filters=${JSON.stringify(message.slice(2))}`)
        } else if (message[0] === 'CLOSE') {
          log.info(`frame OUT: CLOSE id=${message[1]}, url=${url}`)
        }
      })
      socket.on(SocketEvent.Receive, (message: unknown[]) => {
        if (message[0] === 'EOSE') {
          log.info(`frame IN: EOSE id=${message[1]}, url=${url}`)
        } else if (message[0] === 'CLOSED') {
          log.warn(`frame IN: CLOSED id=${message[1]}, reason=${message[2]}, url=${url}`)
        } else if (message[0] === 'NOTICE') {
          log.warn(`frame IN: NOTICE ${message[1]}, url=${url}`)
        } else if (message[0] === 'EVENT') {
          const ev = message[2] as { id?: string; kind?: number } | undefined
          log.debug(`frame IN: EVENT sub=${message[1]}, id=${ev?.id?.slice(0, 8)}..., kind=${ev?.kind}, url=${url}`)
        }
      })

      socket.on(SocketEvent.Status, (status: SocketStatus) => {
        const prev = relayStateMap.get(url)
        const newStatus = mapSocketStatusToRelayStatus(status)
        log.debug(`socket ${url}: ${prev?.status ?? 'unknown'} -> ${newStatus}`)

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

        // The default socketPolicyCloseInactive also re-sends pending REQs
        // on reconnect, but it adds `since` to the filters — which can miss
        // NIP-59 gift wraps whose created_at is randomized into the past.
        // Re-issuing here with the original filters avoids that.
        if (newStatus === 'connected') {
          if (everConnectedUrls.has(url)) {
            resubscribeRelay(url)
          } else {
            everConnectedUrls.add(url)
          }
        }
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

// ── Active subscription registry ──────────────────────────────
//
// welshman's Socket does not re-send REQs after a reconnect, and a
// half-dead ("zombie") TCP connection never fires close/error. To keep
// live subscriptions alive we register every subscription here and
// re-issue it (a) when its relay reconnects, (b) on a failed liveness
// probe, (c) when the app returns to the foreground / network recovers.

interface ActiveSub {
  id: string
  filters: Filter[]
  relayUrls: string[]
  onEvent: (event: TrustedEvent, url: string) => void
  onEose?: (url: string) => void
  inner: AbortController
}

const activeSubscriptions = new Map<string, ActiveSub>()
let subSeq = 0

function runRequest(sub: ActiveSub): void {
  sub.inner.abort()
  sub.inner = new AbortController()

  const tracker = getTracker()
  if (!tracker) throw new Error('Tracker not initialized')

  log.info(`REQ issued: id=${sub.id}, relays=[${sub.relayUrls.join(', ')}], filters=${JSON.stringify(sub.filters)}`)

  // The shared Tracker dedups replayed history across re-requests, so
  // re-subscribing does not duplicate events already delivered.
  request({
    filters: sub.filters,
    relays: [...sub.relayUrls],
    tracker,
    autoClose: false,
    signal: sub.inner.signal,
    onEvent: (event, url) => {
      log.info(`event from relay: id=${event.id?.slice(0, 8)}..., kind=${event.kind}, url=${url}, sub=${sub.id}`)
      sub.onEvent(event, url)
    },
    onEose: (url) => {
      log.info(`EOSE: url=${url}, sub=${sub.id}`)
      sub.onEose?.(url)
    },
    onClosed: (reason, url) => {
      log.warn(`subscription CLOSED by relay: url=${url}, reason=${reason}, sub=${sub.id}`)
    },
    onDisconnect: (url) => {
      log.warn(`socket disconnected mid-subscription: url=${url}, sub=${sub.id}`)
    },
    onDuplicate: (event, url) => {
      log.debug(`event deduped by tracker: id=${event.id?.slice(0, 8)}..., url=${url}, sub=${sub.id}`)
    },
    onFiltered: (event, url) => {
      log.warn(`event did not match filters: id=${event.id?.slice(0, 8)}..., kind=${event.kind}, url=${url}, sub=${sub.id}`)
    },
    onInvalid: (event, url) => {
      const ev = event as TrustedEvent
      log.warn(`event invalid: id=${ev?.id?.slice(0, 8)}..., url=${url}, sub=${sub.id}`)
    },
  }).catch((err) => {
    // AbortError is expected when unsubscribing; anything else is a real
    // failure (e.g. missing AbortSignal.any on old WebViews) and must
    // never be silent — a swallowed error here means the REQ never
    // reached the relay.
    if (!sub.inner.signal.aborted) {
      log.error(`request failed: sub=${sub.id}`, err)
    }
  })
}

function resubscribeRelay(url: string): void {
  let count = 0
  for (const sub of activeSubscriptions.values()) {
    if (sub.relayUrls.includes(url)) {
      runRequest(sub)
      count++
    }
  }
  if (count > 0) {
    log.info(`reconnected ${url}, re-issued ${count} subscription(s)`)
  }
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
  startRelayWatchdog()

  const controller = new AbortController()
  const sub: ActiveSub = {
    id: `sub-${++subSeq}`,
    filters,
    relayUrls: [...relayUrls],
    onEvent,
    onEose,
    inner: new AbortController(),
  }
  activeSubscriptions.set(sub.id, sub)
  controller.signal.addEventListener('abort', () => {
    activeSubscriptions.delete(sub.id)
    sub.inner.abort()
  }, { once: true })

  runRequest(sub)

  return controller
}

// ── Relay watchdog (liveness probe + foreground/network recovery) ──

let watchdogStarted = false

/**
 * Read-only liveness probe: a tiny REQ (limit 1) that we only need an
 * EOSE back from. Nostr relays are not queues — reading consumes
 * nothing. If no EOSE arrives within PROBE_TIMEOUT_MS the socket is
 * presumed zombie (half-dead TCP never fires close/error), so we
 * force close+open; the reconnect listener then re-issues REQs.
 * Exported for tests.
 */
export function probeRelay(url: string): void {
  const pool = getPool()
  if (!pool) return
  const socket = pool.get(url)
  if (socket.status !== SocketStatus.Open) return

  let alive = false
  const timer = setTimeout(() => {
    if (alive) return
    log.warn(`probe timeout, treating relay as zombie: ${url}`)
    try {
      socket.close()
      socket.open()
    } catch (err) {
      log.error(`failed to recycle zombie socket ${url}`, err)
    }
  }, PROBE_TIMEOUT_MS)

  fetchEvents([{ kinds: [0], limit: 1 }], [url], {
    timeout: PROBE_TIMEOUT_MS,
    onEose: () => {
      alive = true
      clearTimeout(timer)
    },
  }).catch(() => {
    // request() rejects on abort/timeout paths; the timer handles verdicts
  })
}

function getActiveRelayUrls(): string[] {
  const urls = new Set<string>()
  for (const sub of activeSubscriptions.values()) {
    for (const url of sub.relayUrls) urls.add(url)
  }
  return [...urls]
}

/** Force re-issue of every active subscription (foreground / network recovery). */
function refreshActiveSubscriptions(reason: string): void {
  if (activeSubscriptions.size === 0) return
  log.info(`refreshing ${activeSubscriptions.size} subscription(s), reason: ${reason}`)
  connectToRelays(getActiveRelayUrls())
  for (const sub of activeSubscriptions.values()) {
    runRequest(sub)
  }
}

/**
 * Start the relay watchdog. Idempotent; no-op outside the browser.
 * Called automatically by subscribe().
 */
export function startRelayWatchdog(): void {
  if (watchdogStarted || typeof window === 'undefined') return
  watchdogStarted = true

  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return
    for (const url of getActiveRelayUrls()) {
      probeRelay(url)
    }
  }, WATCHDOG_INTERVAL_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshActiveSubscriptions('foreground')
    }
  })
  window.addEventListener('online', () => {
    refreshActiveSubscriptions('online')
  })
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
  // Abort live subscriptions: their sockets are gone, and the registry
  // would otherwise re-issue REQs against stale relay URLs.
  for (const sub of activeSubscriptions.values()) {
    sub.inner.abort()
  }
  activeSubscriptions.clear()
  pool.clear()
  trackedSocketUrls.clear()
  relayStateMap.clear()
  everConnectedUrls.clear()
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
