import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RelayClient, RelayPool } from '@/lib/nostr/relay-client'
import type { NostrEvent } from '@/lib/nostr/types'

// --- MockWebSocket ---

type WsCallback = ((...args: unknown[]) => void) | null

const wsInstances: MockWebSocket[] = []

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  url: string
  readyState = MockWebSocket.CONNECTING
  onopen: WsCallback = null
  onclose: WsCallback = null
  onerror: WsCallback = null
  onmessage: WsCallback = null
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose()
  })

  constructor(url: string) {
    this.url = url
    wsInstances.push(this)
    // Auto-open on next tick
    setTimeout(() => this.simulateOpen(), 0)
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) this.onopen()
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) })
  }

  simulateError(err?: unknown) {
    if (this.onerror) this.onerror(err ?? new Error('ws error'))
  }
}

function fakeEvent(id: string): NostrEvent {
  return {
    id,
    pubkey: 'a'.repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'hello',
    sig: 'b'.repeat(128),
  }
}

describe('RelayClient', () => {
  beforeEach(() => {
    wsInstances.length = 0
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('connect', () => {
    it('resolves when WebSocket opens', async () => {
      const client = new RelayClient('wss://relay.test')
      const p = client.connect()
      await vi.advanceTimersByTimeAsync(1)
      await expect(p).resolves.toBeUndefined()
      expect(client.isConnected()).toBe(true)
    })

    it('rejects when WebSocket errors before open', async () => {
      // Override: don't auto-open, instead error
      class ErrorWebSocket extends MockWebSocket {
        constructor(url: string) {
          super(url)
          // Cancel the auto-open from parent
          // We'll manually trigger error instead
        }
      }
      vi.stubGlobal('WebSocket', ErrorWebSocket)

      const client = new RelayClient('wss://relay.test')
      const p = client.connect()

      // Get the instance and trigger error instead of open
      const ws = wsInstances[wsInstances.length - 1]
      // Prevent the auto-open scheduled by parent constructor
      vi.advanceTimersByTime(0) // flush, but open already scheduled
      // Actually the auto-open will fire. Let me use a different approach.

      // Reset and use manual control
      wsInstances.length = 0

      class ManualWebSocket {
        static readonly CONNECTING = 0
        static readonly OPEN = 1
        static readonly CLOSING = 2
        static readonly CLOSED = 3
        readonly CONNECTING = 0
        readonly OPEN = 1
        readonly CLOSING = 2
        readonly CLOSED = 3
        url: string
        readyState = 0
        onopen: WsCallback = null
        onclose: WsCallback = null
        onerror: WsCallback = null
        onmessage: WsCallback = null
        send = vi.fn()
        close = vi.fn()
        constructor(url: string) {
          this.url = url
          wsInstances.push(this as unknown as MockWebSocket)
        }
      }
      vi.stubGlobal('WebSocket', ManualWebSocket)

      const client2 = new RelayClient('wss://relay.test')
      const p2 = client2.connect()

      const ws2 = wsInstances[wsInstances.length - 1] as unknown as ManualWebSocket
      ws2.onerror?.(new Error('connection refused'))

      await expect(p2).rejects.toBeDefined()
    })
  })

  describe('publish', () => {
    it('sends EVENT message to WebSocket', async () => {
      const client = new RelayClient('wss://relay.test')
      const p = client.connect()
      await vi.advanceTimersByTimeAsync(1)
      await p

      const ws = wsInstances[wsInstances.length - 1]
      const event = fakeEvent('evt-1')
      client.publish(event)

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(['EVENT', event]))
    })

    it('resolves true when relay sends OK with true', async () => {
      const client = new RelayClient('wss://relay.test')
      const connectP = client.connect()
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      const ws = wsInstances[wsInstances.length - 1]
      const event = fakeEvent('evt-ok-true')
      const publishP = client.publish(event)

      ws.simulateMessage(['OK', 'evt-ok-true', true])

      await expect(publishP).resolves.toBe(true)
    })

    it('resolves false when relay sends OK with false', async () => {
      const client = new RelayClient('wss://relay.test')
      const connectP = client.connect()
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      const ws = wsInstances[wsInstances.length - 1]
      const event = fakeEvent('evt-ok-false')
      const publishP = client.publish(event)

      ws.simulateMessage(['OK', 'evt-ok-false', false])

      await expect(publishP).resolves.toBe(false)
    })

    it('resolves false after 3s timeout', async () => {
      const client = new RelayClient('wss://relay.test')
      const connectP = client.connect()
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      const event = fakeEvent('evt-timeout')
      const publishP = client.publish(event)

      await vi.advanceTimersByTimeAsync(3001)

      await expect(publishP).resolves.toBe(false)
    })

    it('returns false immediately when not connected', async () => {
      const client = new RelayClient('wss://relay.test')
      const event = fakeEvent('evt-noconn')
      const result = await client.publish(event)
      expect(result).toBe(false)
    })
  })

  describe('subscribe', () => {
    it('sends REQ message and calls callback on EVENT', async () => {
      const client = new RelayClient('wss://relay.test')
      const connectP = client.connect()
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      const ws = wsInstances[wsInstances.length - 1]
      const callback = vi.fn()
      const filters = [{ kinds: [1], limit: 10 }]
      client.subscribe('sub-1', filters, callback)

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify(['REQ', 'sub-1', ...filters])
      )

      const event = fakeEvent('incoming-1')
      ws.simulateMessage(['EVENT', 'sub-1', event])

      expect(callback).toHaveBeenCalledWith(event)
    })

    it('does not call callback for other subscription IDs', async () => {
      const client = new RelayClient('wss://relay.test')
      const connectP = client.connect()
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      const ws = wsInstances[wsInstances.length - 1]
      const callback = vi.fn()
      client.subscribe('sub-a', [{ kinds: [1] }], callback)

      ws.simulateMessage(['EVENT', 'sub-b', fakeEvent('other')])

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('unsubscribe', () => {
    it('removes subscription and sends CLOSE', async () => {
      const client = new RelayClient('wss://relay.test')
      const connectP = client.connect()
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      const ws = wsInstances[wsInstances.length - 1]
      const callback = vi.fn()
      client.subscribe('sub-close', [{ kinds: [1] }], callback)

      client.unsubscribe('sub-close')

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(['CLOSE', 'sub-close']))

      ws.simulateMessage(['EVENT', 'sub-close', fakeEvent('after-close')])
      expect(callback).not.toHaveBeenCalled()
    })
  })
})

describe('RelayPool', () => {
  beforeEach(() => {
    wsInstances.length = 0
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('publish', () => {
    it('returns true when a relay accepts', async () => {
      const pool = new RelayPool()
      const connectP = pool.connect(['wss://r1.test'])
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      const event = fakeEvent('pool-evt-1')
      const publishP = pool.publish(event)

      // Find the ws instance and send OK
      const ws = wsInstances[wsInstances.length - 1]
      ws.simulateMessage(['OK', 'pool-evt-1', true])

      await expect(publishP).resolves.toBe(true)
    })

    it('returns false when all relays timeout', async () => {
      const pool = new RelayPool()
      const connectP = pool.connect(['wss://r1.test'])
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      const event = fakeEvent('pool-timeout')
      const publishP = pool.publish(event)

      await vi.advanceTimersByTimeAsync(3001)

      await expect(publishP).resolves.toBe(false)
    })

    it('returns false when no relays are connected', async () => {
      const pool = new RelayPool()
      const event = fakeEvent('pool-no-relay')
      const result = await pool.publish(event)
      expect(result).toBe(false)
    })
  })

  describe('subscribe', () => {
    it('subscribes on all connected relays', async () => {
      const pool = new RelayPool()
      const connectP = pool.connect(['wss://r1.test'])
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      const ws = wsInstances[wsInstances.length - 1]
      const callback = vi.fn()
      pool.subscribe('pool-sub', [{ kinds: [1] }], callback)

      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('REQ')
      )
    })
  })

  describe('unsubscribe', () => {
    it('unsubscribes on all relays', async () => {
      const pool = new RelayPool()
      const connectP = pool.connect(['wss://r1.test'])
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      const ws = wsInstances[wsInstances.length - 1]
      pool.subscribe('pool-unsub', [{ kinds: [1] }], vi.fn())
      pool.unsubscribe('pool-unsub')

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify(['CLOSE', 'pool-unsub'])
      )
    })
  })

  describe('getConnectedRelays', () => {
    it('returns URLs of connected relays', async () => {
      const pool = new RelayPool()
      const connectP = pool.connect(['wss://r1.test'])
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      expect(pool.getConnectedRelays()).toEqual(['wss://r1.test'])
    })
  })

  describe('closeAll', () => {
    it('closes all relays and clears pool', async () => {
      const pool = new RelayPool()
      const connectP = pool.connect(['wss://r1.test'])
      await vi.advanceTimersByTimeAsync(1)
      await connectP

      pool.closeAll()
      expect(pool.getConnectedRelays()).toEqual([])
    })
  })
})
