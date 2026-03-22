// relay-client.ts - WebSocket Relay 客户端

import type { NostrFilter, NostrEvent } from './types'

const INITIAL_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 30000
const PUBLISH_TIMEOUT_MS = 3000

type SubCallback = (event: NostrEvent) => void
type EoseCallback = () => void

export class RelayClient {
  private ws: WebSocket | null = null
  private subscriptions = new Map<string, SubCallback>()
  private eoseCallbacks = new Map<string, EoseCallback>()
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS
  private maxReconnectDelay = MAX_RECONNECT_DELAY_MS
  private shouldReconnect = true
  private connected = false
  private pendingPublishes = new Map<string, (accepted: boolean) => void>()

  constructor(public readonly url: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.connected = true
          this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS
          resolve()
        }

        this.ws.onerror = (err) => {
          if (!this.connected) reject(err)
        }

        this.ws.onclose = () => {
          this.connected = false
          if (this.shouldReconnect) {
            setTimeout(() => {
              this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
              this.connect().catch(console.error)
            }, this.reconnectDelay)
          }
        }

        this.ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data)
            if (msg[0] === 'EVENT' && msg[2]) {
              const subId = msg[1] as string
              const event = msg[2] as NostrEvent
              const cb = this.subscriptions.get(subId)
              if (cb) cb(event)
            } else if (msg[0] === 'EOSE' && msg[1]) {
              const subId = msg[1] as string
              const cb = this.eoseCallbacks.get(subId)
              if (cb) cb()
            } else if (msg[0] === 'OK' && msg[1]) {
              const eventId = msg[1] as string
              const accepted = msg[2] as boolean
              const cb = this.pendingPublishes.get(eventId)
              if (cb) {
                cb(accepted)
                this.pendingPublishes.delete(eventId)
              }
            }
          } catch (err) {
            console.warn('[RelayClient] Failed to parse message:', err)
          }
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  publish(event: NostrEvent): Promise<boolean> {
    if (!this.ws || !this.connected) return Promise.resolve(false)
    this.ws.send(JSON.stringify(['EVENT', event]))

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingPublishes.delete(event.id)
        resolve(false)
      }, PUBLISH_TIMEOUT_MS)

      this.pendingPublishes.set(event.id, (accepted) => {
        clearTimeout(timeout)
        resolve(accepted)
      })
    })
  }

  subscribe(subId: string, filters: NostrFilter[], callback: SubCallback, onEose?: EoseCallback): void {
    if (!this.ws || !this.connected) return
    this.subscriptions.set(subId, callback)
    if (onEose) this.eoseCallbacks.set(subId, onEose)
    this.ws.send(JSON.stringify(['REQ', subId, ...filters]))
  }

  unsubscribe(subId: string): void {
    this.subscriptions.delete(subId)
    this.eoseCallbacks.delete(subId)
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(['CLOSE', subId]))
    }
  }

  close(): void {
    this.shouldReconnect = false
    this.ws?.close()
  }

  isConnected(): boolean {
    return this.connected
  }
}

export class RelayPool {
  private clients = new Map<string, RelayClient>()
  private failedRelays = new Set<string>()

  async connect(relayUrls: string[]): Promise<void> {
    const connectPromises = relayUrls.map(async (url) => {
      if (!this.clients.has(url)) {
        const client = new RelayClient(url)
        this.clients.set(url, client)
        try {
          await client.connect()
          this.failedRelays.delete(url)
        } catch (err) {
          this.failedRelays.add(url)
          console.warn(`[RelayPool] Failed to connect to ${url}:`, err)
        }
      }
    })
    await Promise.allSettled(connectPromises)
  }

  getFailedRelays(): string[] {
    return Array.from(this.failedRelays)
  }

  async publish(event: NostrEvent): Promise<boolean> {
    const results = await Promise.all(
      Array.from(this.clients.values())
        .filter(c => c.isConnected())
        .map(c => c.publish(event))
    )
    return results.some(ok => ok)
  }

  subscribe(subId: string, filters: NostrFilter[], callback: SubCallback, onEose?: EoseCallback): void {
    let eoseFired = false
    const wrappedEose = onEose ? () => {
      if (!eoseFired) {
        eoseFired = true
        onEose()
      }
    } : undefined
    for (const client of this.clients.values()) {
      if (client.isConnected()) client.subscribe(subId, filters, callback, wrappedEose)
    }
  }

  unsubscribe(subId: string): void {
    for (const client of this.clients.values()) {
      client.unsubscribe(subId)
    }
  }

  closeAll(): void {
    for (const client of this.clients.values()) {
      client.close()
    }
    this.clients.clear()
  }

  getConnectedRelays(): string[] {
    return Array.from(this.clients.entries())
      .filter(([, c]) => c.isConnected())
      .map(([url]) => url)
  }
}

export const relayPool = new RelayPool()
