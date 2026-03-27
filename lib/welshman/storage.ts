// storage.ts - IndexedDB persistence for welshman Repository events
// Uses idb library for type-safe IndexedDB access

import type { DBSchema, IDBPDatabase } from 'idb'
import type { TrustedEvent } from '@welshman/util'
import type { WrapItem } from '@welshman/net'
import { getRepository, getTracker, getWrapManager } from './engine'

const DB_NAME = 'dodobox-nostr'
const DB_VERSION = 1
const MAX_EVENTS = 10_000

interface DodoboxNostrDB extends DBSchema {
  events: {
    key: string // event id
    value: TrustedEvent
    indexes: {
      'by-kind': number
      'by-pubkey': string
      'by-kind-pubkey': [number, string]
      'by-created-at': number
    }
  }
  tracker: {
    key: string // eventId
    value: { eventId: string; relays: string[] }
  }
  wraps: {
    key: string // wrapId (= wrap event id)
    value: WrapItem
  }
}

let db: IDBPDatabase<DodoboxNostrDB> | null = null

/**
 * Open (or create) the IndexedDB database.
 */
async function openDB(): Promise<IDBPDatabase<DodoboxNostrDB>> {
  if (db) return db

  const { openDB: idbOpen } = await import('idb')

  db = await idbOpen<DodoboxNostrDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Events store
      if (!database.objectStoreNames.contains('events')) {
        const eventStore = database.createObjectStore('events', { keyPath: 'id' })
        eventStore.createIndex('by-kind', 'kind')
        eventStore.createIndex('by-pubkey', 'pubkey')
        eventStore.createIndex('by-kind-pubkey', ['kind', 'pubkey'])
        eventStore.createIndex('by-created-at', 'created_at')
      }

      // Tracker store
      if (!database.objectStoreNames.contains('tracker')) {
        database.createObjectStore('tracker', { keyPath: 'eventId' })
      }

      // Wraps store (gift wrap metadata)
      if (!database.objectStoreNames.contains('wraps')) {
        database.createObjectStore('wraps', { keyPath: 'id' })
      }
    },
  })

  return db
}

/**
 * Load persisted events into the welshman Repository.
 * Called once at startup.
 */
export async function loadFromStorage(): Promise<void> {
  if (typeof window === 'undefined') return

  const database = await openDB()
  const repository = getRepository()

  // Load events
  const events = await database.getAll('events')
  if (events.length > 0) {
    repository.load(events)
  }

  // Load tracker data
  const tracker = getTracker()
  const trackerEntries = await database.getAll('tracker')
  for (const entry of trackerEntries) {
    for (const relay of entry.relays) {
      tracker.track(entry.eventId, relay)
    }
  }

  // Load wrap manager data
  const wrapManager = getWrapManager()
  const wrapItems = await database.getAll('wraps')
  if (wrapItems.length > 0) {
    wrapManager.load(wrapItems)
  }
}

/**
 * Persist a single event to IndexedDB.
 */
export async function persistEvent(event: TrustedEvent): Promise<void> {
  if (typeof window === 'undefined') return

  const database = await openDB()
  await database.put('events', event)
}

/**
 * Persist multiple events to IndexedDB in a single transaction.
 */
export async function persistEvents(events: readonly TrustedEvent[]): Promise<void> {
  if (typeof window === 'undefined' || events.length === 0) return

  const database = await openDB()
  const tx = database.transaction('events', 'readwrite')
  for (const event of events) {
    tx.store.put(event)
  }
  await tx.done
}

/**
 * Persist tracker data for an event.
 */
export async function persistTrackerEntry(eventId: string, relays: string[]): Promise<void> {
  if (typeof window === 'undefined') return

  const database = await openDB()
  await database.put('tracker', { eventId, relays })
}

/**
 * Persist a wrap item (gift wrap metadata).
 */
export async function persistWrapItem(item: WrapItem): Promise<void> {
  if (typeof window === 'undefined') return

  const database = await openDB()
  await database.put('wraps', item)
}

/**
 * Trim events to keep within MAX_EVENTS limit.
 * Removes oldest events first.
 */
export async function trimEvents(): Promise<void> {
  if (typeof window === 'undefined') return

  const database = await openDB()
  const count = await database.count('events')
  if (count <= MAX_EVENTS) return

  const excess = count - MAX_EVENTS
  const tx = database.transaction('events', 'readwrite')
  const index = tx.store.index('by-created-at')
  let cursor = await index.openCursor()
  let deleted = 0

  while (cursor && deleted < excess) {
    await cursor.delete()
    deleted++
    cursor = await cursor.continue()
  }

  await tx.done
}

/**
 * Clear all stored data. Used for logout/cleanup.
 */
export async function clearStorage(): Promise<void> {
  if (typeof window === 'undefined') return

  const database = await openDB()
  await database.clear('events')
  await database.clear('tracker')
  await database.clear('wraps')
}

/**
 * Close the database connection.
 */
export function closeStorage(): void {
  if (db) {
    db.close()
    db = null
  }
}
