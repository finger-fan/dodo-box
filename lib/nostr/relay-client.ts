// relay-client.ts - WebSocket Relay 客户端

import type { NostrFilter, NostrEvent } from './types'

type SubCallback = (event: NostrEvent) => void

export class RelayClient {
  private ws: WebSocket | null = null
  private subscriptions = new Map<string, SubCallback>()
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private shouldReconnect = true
  private connected = false

  constructor(public readonly url: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.connected = true
          this.reconnectDelay = 1000
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
            }
          } catch {
            // ignore parse errors
          }
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  publish(event: NostrEvent): void {
    if (!this.ws || !this.connected) return
    this.ws.send(JSON.stringify(['EVENT', event]))
  }

  subscribe(subId: string, filters: NostrFilter[], callback: SubCallback): void {
    if (!this.ws || !this.connected) return
    this.subscriptions.set(subId, callback)
    this.ws.send(JSON.stringify(['REQ', subId, ...filters]))
  }

  unsubscribe(subId: string): void {
    this.subscriptions.delete(subId)
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

  async connect(relayUrls: string[]): Promise<void> {
    const connectPromises = relayUrls.map(async (url) => {
      if (!this.clients.has(url)) {
        const client = new RelayClient(url)
        this.clients.set(url, client)
        try {
          await client.connect()
        } catch (err) {
          console.warn(`[RelayPool] Failed to connect to ${url}:`, err)
        }
      }
    })
    await Promise.allSettled(connectPromises)
  }

  publish(event: NostrEvent): void {
    for (const client of this.clients.values()) {
      if (client.isConnected()) client.publish(event)
    }
  }

  subscribe(subId: string, filters: NostrFilter[], callback: SubCallback): void {
    for (const client of this.clients.values()) {
      if (client.isConnected()) client.subscribe(subId, filters, callback)
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
