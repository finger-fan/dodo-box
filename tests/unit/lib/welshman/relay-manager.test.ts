
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  connectToRelays,
  getConnectedRelays,
  getFailedRelays,
  getRelayStatusMap,
  waitForRelayConnection,
} from '@/lib/welshman/relay-manager'
import { SocketStatus, SocketEvent } from '@welshman/net'

const RELAY_URL = 'wss://relay.example.com'

function createMockSocket(status: SocketStatus) {
  return {
    url: RELAY_URL,
    status,
    open: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  }
}

function createMockPool(status: SocketStatus) {
  const socket = createMockSocket(status)
  const data = new Map([[RELAY_URL, socket]])
  return {
    _data: data,
    get: vi.fn((url: string) => {
      if (!data.has(url)) data.set(url, createMockSocket(SocketStatus.Closed))
      return data.get(url)
    }),
    subscribe: vi.fn(),
    clear: vi.fn(),
  }
}

vi.mock('@/lib/welshman/engine', () => ({
  getPool: vi.fn(),
  getTracker: vi.fn(),
  getRepository: vi.fn(),
  initEngine: vi.fn(),
}))

import * as engine from '@/lib/welshman/engine'

describe('relay-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('connectToRelays opens closed sockets', () => {
    const pool = createMockPool(SocketStatus.Closed)
    vi.mocked(engine.getPool).mockReturnValue(pool as any)
    connectToRelays([RELAY_URL])
    expect(pool.get).toHaveBeenCalledWith(RELAY_URL)
    expect(pool._data.get(RELAY_URL)!.open).toHaveBeenCalled()
  })

  it('connectToRelays does not reopen open sockets', () => {
    const pool = createMockPool(SocketStatus.Open)
    vi.mocked(engine.getPool).mockReturnValue(pool as any)
    connectToRelays([RELAY_URL])
    expect(pool._data.get(RELAY_URL)!.open).not.toHaveBeenCalled()
  })

  it('getConnectedRelays returns only open relays', () => {
    const openPool = createMockPool(SocketStatus.Open)
    openPool._data.set('wss://closed.relay', createMockSocket(SocketStatus.Closed))
    vi.mocked(engine.getPool).mockReturnValue(openPool as any)
    expect(getConnectedRelays()).toEqual([RELAY_URL])
  })

  it('getFailedRelays returns only error relays', () => {
    const errorPool = createMockPool(SocketStatus.Error)
    errorPool._data.set('wss://ok.relay', createMockSocket(SocketStatus.Open))
    vi.mocked(engine.getPool).mockReturnValue(errorPool as any)
    expect(getFailedRelays()).toEqual([RELAY_URL])
  })

  it('getRelayStatusMap returns status map', () => {
    const pool = createMockPool(SocketStatus.Open)
    pool._data.set('wss://closed.relay', createMockSocket(SocketStatus.Closed))
    vi.mocked(engine.getPool).mockReturnValue(pool as any)
    const map = getRelayStatusMap()
    expect(map.get(RELAY_URL)).toBe(SocketStatus.Open)
    expect(map.get('wss://closed.relay')).toBe(SocketStatus.Closed)
  })

  it('waitForRelayConnection returns true immediately if open', async () => {
    const pool = createMockPool(SocketStatus.Open)
    vi.mocked(engine.getPool).mockReturnValue(pool as any)
    const result = await waitForRelayConnection(RELAY_URL, 1000)
    expect(result).toBe(true)
  })

  it('waitForRelayConnection returns false for closed socket', async () => {
    const pool = createMockPool(SocketStatus.Closed)
    vi.mocked(engine.getPool).mockReturnValue(pool as any)
    const result = await waitForRelayConnection(RELAY_URL, 100)
    expect(result).toBe(false)
  })

  it('waitForRelayConnection returns true on status change to open', async () => {
    const socket = createMockSocket(SocketStatus.Opening)
    const pool = {
      _data: new Map([[RELAY_URL, socket]]),
      get: vi.fn().mockReturnValue(socket),
      subscribe: vi.fn(),
      clear: vi.fn(),
    }
    vi.mocked(engine.getPool).mockReturnValue(pool as any)
    const promise = waitForRelayConnection(RELAY_URL, 1000)
    const onStatus = socket.on.mock.calls.find((call: any) => call[0] === SocketEvent.Status)?.[1]
    if (onStatus) onStatus(SocketStatus.Open)
    const result = await promise
    expect(result).toBe(true)
  })
})
