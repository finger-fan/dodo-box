// Integration test: RealNostrAdapter via local strfry relay
// Requires: docker compose -f docker-compose.test.yml up -d

import { describe, it, expect, beforeAll } from 'vitest'
const WS = require('ws')
import { RealNostrAdapter } from '@/lib/nostr/real-adapter'
import { deriveMasterKey } from '@/lib/nostr/key-derivation'
import type { NostrMessage } from '@/lib/nostr/types'

// Polyfill WebSocket for Node.js
globalThis.WebSocket = WS as unknown as typeof WebSocket

// Polyfill localStorage for Node.js
const localStore: Record<string, string> = {}
globalThis.localStorage = {
  getItem: (key: string) => localStore[key] ?? null,
  setItem: (key: string, value: string) => { localStore[key] = value },
  removeItem: (key: string) => { delete localStore[key] },
  clear: () => { Object.keys(localStore).forEach((k) => delete localStore[k]) },
  get length() { return Object.keys(localStore).length },
  key: (i: number) => Object.keys(localStore)[i] ?? null,
} as Storage

const RELAY_URL = 'ws://localhost:7778'

// Override env so adapter connects to test relay
process.env.NEXT_PUBLIC_DEFAULT_RELAYS = RELAY_URL

interface TestSession {
  isAuthenticated: true
  username: string
  currentPubkey: string
  currentPrivkey: string
  vaultData: null
}

function createTestSession(username: string, password: string): TestSession {
  const keys = deriveMasterKey(username, password)
  return {
    isAuthenticated: true,
    username,
    currentPubkey: keys.publicKey,
    currentPrivkey: keys.privateKey,
    vaultData: null,
  }
}

describe('RealNostrAdapter integration (requires test relay)', () => {
  const aliceSession = createTestSession('integ_alice', 'pass_alice')
  const bobSession = createTestSession('integ_bob', 'pass_bob')

  let aliceAdapter: RealNostrAdapter
  let bobAdapter: RealNostrAdapter

  beforeAll(() => {
    aliceAdapter = new RealNostrAdapter(aliceSession)
    bobAdapter = new RealNostrAdapter(bobSession)
  })

  it('Alice can add Bob as contact', async () => {
    const result = await aliceAdapter.addContact(bobSession.currentPubkey)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pubkey).toBe(bobSession.currentPubkey)
    }
  })

  it('Bob can add Alice as contact', async () => {
    const result = await bobAdapter.addContact(aliceSession.currentPubkey)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pubkey).toBe(aliceSession.currentPubkey)
    }
  })

  it('Alice sends message to Bob and Bob receives it', async () => {
    const messageText = `Hello Bob from integration test ${Date.now()}`

    // Alice sends
    const sendResult = await aliceAdapter.sendMessage(bobSession.currentPubkey, messageText)
    expect(sendResult.success).toBe(true)

    // Wait for relay to process
    await new Promise((r) => setTimeout(r, 2000))

    // Bob fetches messages from Alice
    const messages = await bobAdapter.getMessages(aliceSession.currentPubkey)
    const found = messages.find((m: NostrMessage) => m.text === messageText)
    expect(found).toBeDefined()
    expect(found?.sender).toBe('them')
  })

  it('Bob replies to Alice', async () => {
    const replyText = `Reply from Bob ${Date.now()}`

    const sendResult = await bobAdapter.sendMessage(aliceSession.currentPubkey, replyText)
    expect(sendResult.success).toBe(true)

    await new Promise((r) => setTimeout(r, 2000))

    const messages = await aliceAdapter.getMessages(bobSession.currentPubkey)
    const found = messages.find((m: NostrMessage) => m.text === replyText)
    expect(found).toBeDefined()
    expect(found?.sender).toBe('them')
  })

  it('message subscription receives real-time messages', async () => {
    const receivedMessages: NostrMessage[] = []
    const messageText = `Realtime test ${Date.now()}`

    // Bob subscribes to messages from Alice
    const unsub = bobAdapter.subscribeToMessages(
      aliceSession.currentPubkey,
      (msg: NostrMessage) => receivedMessages.push(msg)
    )

    // Give subscription time to establish
    await new Promise((r) => setTimeout(r, 1000))

    // Alice sends
    await aliceAdapter.sendMessage(bobSession.currentPubkey, messageText)

    // Wait for propagation
    await new Promise((r) => setTimeout(r, 3000))

    unsub()

    const found = receivedMessages.find((m: NostrMessage) => m.text === messageText)
    expect(found).toBeDefined()
  }, 15_000)
})
