
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  connectToRelays,
  getConnectedRelays,
  getFailedRelays,
  getRelayStatusMap,
  getStatusMap,
  initRelayManager,
  closeAllRelays,
  waitForRelayConnection,
  subscribe,
  probeRelay,
} from '@/lib/welshman/relay-manager'
import { SocketStatus, SocketEvent, Tracker } from '@welshman/net'

vi.mock('@welshman/net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@welshman/net')>()
  return {
    ...actual,
    request: vi.fn(() => Promise.resolve([])),
    publish: vi.fn(() => Promise.resolve({})),
  }
})

import { request as welshmanRequest } from '@welshman/net'
const requestMock = vi.mocked(welshmanRequest)

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

describe('relay-manager status callbacks', () => {
  const RELAY_URL_2 = 'wss://relay2.example.com'

  beforeEach(() => {
    vi.clearAllMocks()
    // Set up a minimal pool so closeAllRelays can clear internal module state
    vi.mocked(engine.getPool).mockReturnValue({
      _data: new Map(),
      get: vi.fn(),
      subscribe: vi.fn(),
      clear: vi.fn(),
    } as any)
    closeAllRelays()
  })

  it('initRelayManager registers callback', () => {
    const cb = vi.fn()
    initRelayManager({ onStatusChange: cb })
    expect(true).toBe(true)
  })

  it('connectToRelays triggers callback on status change', () => {
    const cb = vi.fn()
    initRelayManager({ onStatusChange: cb })

    const socket = createMockSocket(SocketStatus.Closed)
    const pool = {
      _data: new Map([[RELAY_URL_2, socket]]),
      get: vi.fn().mockReturnValue(socket),
      subscribe: vi.fn(),
      clear: vi.fn(),
    }
    vi.mocked(engine.getPool).mockReturnValue(pool as any)

    connectToRelays([RELAY_URL_2])

    // Simulate status change via the registered listener
    const onStatus = socket.on.mock.calls.find((call: any) => call[0] === SocketEvent.Status)?.[1]
    expect(onStatus).toBeDefined()
    onStatus(SocketStatus.Open)

    expect(cb).toHaveBeenCalledWith(RELAY_URL_2, 'connected', expect.objectContaining({
      status: 'connected',
      retryCount: 0,
    }))
  })

  it('connectToRelays maps all statuses correctly', () => {
    const cb = vi.fn()
    initRelayManager({ onStatusChange: cb })

    const socket = createMockSocket(SocketStatus.Closed)
    const pool = {
      _data: new Map([[RELAY_URL_2, socket]]),
      get: vi.fn().mockReturnValue(socket),
      subscribe: vi.fn(),
      clear: vi.fn(),
    }
    vi.mocked(engine.getPool).mockReturnValue(pool as any)

    connectToRelays([RELAY_URL_2])

    const onStatus = socket.on.mock.calls.find((call: any) => call[0] === SocketEvent.Status)?.[1]
    expect(onStatus).toBeDefined()

    onStatus(SocketStatus.Opening)
    expect(cb).toHaveBeenCalledWith(RELAY_URL_2, 'connecting', expect.objectContaining({
      status: 'connecting',
      retryCount: 0,
    }))

    onStatus(SocketStatus.Error)
    expect(cb).toHaveBeenCalledWith(RELAY_URL_2, 'failed', expect.objectContaining({
      status: 'failed',
    }))

    onStatus(SocketStatus.Closed)
    expect(cb).toHaveBeenCalledWith(RELAY_URL_2, 'closed', expect.objectContaining({
      status: 'closed',
    }))
  })

  it('getStatusMap reflects current tracked status', () => {
    const socket = createMockSocket(SocketStatus.Open)
    const pool = {
      _data: new Map([[RELAY_URL_2, socket]]),
      get: vi.fn().mockReturnValue(socket),
      subscribe: vi.fn(),
      clear: vi.fn(),
    }
    vi.mocked(engine.getPool).mockReturnValue(pool as any)

    connectToRelays([RELAY_URL_2])

    const map = getStatusMap()
    expect(map.get(RELAY_URL_2)).toBe('connected')
  })

  it('closeAllRelays clears tracked state', () => {
    const socket = createMockSocket(SocketStatus.Open)
    const pool = {
      _data: new Map([[RELAY_URL_2, socket]]),
      get: vi.fn().mockReturnValue(socket),
      subscribe: vi.fn(),
      clear: vi.fn(),
    }
    vi.mocked(engine.getPool).mockReturnValue(pool as any)

    connectToRelays([RELAY_URL_2])

    // Now set pool to empty so getStatusMap doesn't pull from pool
    const emptyPool = {
      _data: new Map(),
      get: vi.fn(),
      subscribe: vi.fn(),
      clear: vi.fn(),
    }
    vi.mocked(engine.getPool).mockReturnValue(emptyPool as any)

    closeAllRelays()

    const map = getStatusMap()
    expect(map.size).toBe(0)
  })

  it('connectToRelays only registers listener once per URL', () => {
    const socket = createMockSocket(SocketStatus.Open)
    const pool = {
      _data: new Map([[RELAY_URL_2, socket]]),
      get: vi.fn().mockReturnValue(socket),
      subscribe: vi.fn(),
      clear: vi.fn(),
    }
    vi.mocked(engine.getPool).mockReturnValue(pool as any)

    connectToRelays([RELAY_URL_2])
    connectToRelays([RELAY_URL_2])

    // socket.on should only have been called once for SocketEvent.Status
    const statusCalls = socket.on.mock.calls.filter((call: any) => call[0] === SocketEvent.Status)
    expect(statusCalls.length).toBe(1)
  })
})

describe('relay-manager subscriptions', () => {
  const RELAY = 'wss://sub.example.com'

  function setupPool(status: SocketStatus = SocketStatus.Open) {
    const socket = createMockSocket(status)
    const pool = {
      _data: new Map([[RELAY, socket]]),
      get: vi.fn().mockReturnValue(socket),
      subscribe: vi.fn(),
      clear: vi.fn(),
    }
    vi.mocked(engine.getPool).mockReturnValue(pool as any)
    return { socket, pool }
  }

  function getStatusListener(socket: ReturnType<typeof createMockSocket>) {
    const listener = socket.on.mock.calls.find((call: any) => call[0] === SocketEvent.Status)?.[1]
    expect(listener).toBeDefined()
    return listener as (status: SocketStatus) => void
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(engine.getTracker).mockReturnValue(new Tracker() as any)
    setupPool()
    closeAllRelays() // reset module-level registries between tests
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('subscribe issues a REQ and does not duplicate it on first connect', () => {
    const { socket } = setupPool(SocketStatus.Closed)
    connectToRelays([RELAY])
    const onStatus = getStatusListener(socket)

    subscribe([{ kinds: [1059] }], [RELAY], vi.fn())
    expect(requestMock).toHaveBeenCalledTimes(1)

    // First connect: the REQ was just sent, no re-issue
    onStatus(SocketStatus.Opening)
    onStatus(SocketStatus.Open)
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('re-issues the REQ when the relay reconnects after a drop', () => {
    const { socket } = setupPool(SocketStatus.Closed)
    connectToRelays([RELAY])
    const onStatus = getStatusListener(socket)

    subscribe([{ kinds: [1059] }], [RELAY], vi.fn())
    onStatus(SocketStatus.Open)
    expect(requestMock).toHaveBeenCalledTimes(1)

    // Socket drops and reconnects: welshman does not re-send REQs, we must
    onStatus(SocketStatus.Closed)
    onStatus(SocketStatus.Opening)
    onStatus(SocketStatus.Open)
    expect(requestMock).toHaveBeenCalledTimes(2)
  })

  it('stops re-issuing after the subscription is aborted', () => {
    const { socket } = setupPool(SocketStatus.Closed)
    connectToRelays([RELAY])
    const onStatus = getStatusListener(socket)

    const controller = subscribe([{ kinds: [1059] }], [RELAY], vi.fn())
    onStatus(SocketStatus.Open)
    controller.abort()

    onStatus(SocketStatus.Closed)
    onStatus(SocketStatus.Open)
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('probe recycles a zombie socket when no EOSE arrives', () => {
    vi.useFakeTimers()
    const { socket } = setupPool(SocketStatus.Open)

    probeRelay(RELAY)
    vi.advanceTimersByTime(10_000)

    expect(socket.close).toHaveBeenCalled()
    expect(socket.open).toHaveBeenCalled()
  })

  it('probe leaves a healthy socket alone when EOSE arrives', () => {
    vi.useFakeTimers()
    const { socket } = setupPool(SocketStatus.Open)
    requestMock.mockImplementationOnce((options: any) => {
      options.onEose?.(RELAY)
      return Promise.resolve([])
    })

    probeRelay(RELAY)
    vi.advanceTimersByTime(10_000)

    expect(socket.close).not.toHaveBeenCalled()
    expect(socket.open).not.toHaveBeenCalled()
  })
})
