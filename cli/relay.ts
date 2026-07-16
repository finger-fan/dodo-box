// relay.ts — CLI 专用的 relay 连接管理
// 封装 lib/messaging/relay-node 为 CLI 友好的 API

import { connectToRelays, getRelayStatusMap } from '../lib/messaging/relay-node'
import type { RelayConnectionStatus } from '../lib/messaging/types'
import { SocketStatus } from '@welshman/net'

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
]

export async function connectRelays(relayUrls: string[]): Promise<RelayConnectionStatus[]> {
  connectToRelays(relayUrls)
  const results: RelayConnectionStatus[] = []
  for (const url of relayUrls) {
    results.push({ url, connected: true })
  }
  return results
}

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
  for (const url of DEFAULT_RELAYS) {
    if (!results.some((r) => r.url === url)) {
      results.push({ url, connected: false })
    }
  }
  return results
}

export function getDefaultRelays(): string[] {
  return [...DEFAULT_RELAYS]
}
