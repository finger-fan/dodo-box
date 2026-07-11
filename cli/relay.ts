// relay.ts - Relay connection management for CLI
// Uses Node.js compatible welshman layer

import {
  connectToRelays,
  getConnectedRelays,
  waitForRelayConnection,
  getRelayStatusMap,
} from '../lib/messaging/relay-node'
import { destroyNodeEngine, initNodeEngine } from '../lib/welshman/engine-node'
import type { RelayConnectionStatus } from '../lib/messaging/types'
import { SocketStatus } from '@welshman/net'

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
]

/**
 * Connect to relays and wait for them to be ready.
 */
export async function connectRelays(relayUrls: string[]): Promise<RelayConnectionStatus[]> {
  initNodeEngine()
  connectToRelays(relayUrls)

  const results: RelayConnectionStatus[] = []
  const promises = relayUrls.map(async (url) => {
    const connected = await waitForRelayConnection(url, 10000)
    results.push({
      url,
      connected,
      error: connected ? undefined : 'Connection timed out',
    })
  })

  await Promise.all(promises)
  return results
}

/**
 * Get current relay connection status.
 */
export function getStatus(): RelayConnectionStatus[] {
  const map = getRelayStatusMap()

  const results: RelayConnectionStatus[] = []
  for (const [url, status] of map.entries()) {
    results.push({
      url,
      connected: status === SocketStatus.Open,
      error: status === SocketStatus.Error ? 'Connection error' : undefined,
    })
  }

  // Also include URLs not yet in the pool
  for (const url of DEFAULT_RELAYS) {
    if (!results.some((r) => r.url === url)) {
      results.push({ url, connected: false })
    }
  }

  return results
}

/**
 * Disconnect all relays and clean up.
 */
export function disconnect(): void {
  destroyNodeEngine()
}

/**
 * Get default relay list.
 */
export function getDefaultRelays(): string[] {
  return [...DEFAULT_RELAYS]
}
