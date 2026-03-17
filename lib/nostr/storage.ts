// storage.ts - IndexedDB 事件缓存

import type { NostrEvent } from './types'

const DB_NAME = 'dodobox'
const DB_VERSION = 1
const MAX_EVENTS = 10000

export class NostrStorage {
  private db: IDBDatabase | null = null

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains('events')) {
          const store = db.createObjectStore('events', { keyPath: 'id' })
          store.createIndex('kind', 'kind')
          store.createIndex('pubkey', 'pubkey')
          store.createIndex('created_at', 'created_at')
        }

        if (!db.objectStoreNames.contains('plaintext')) {
          db.createObjectStore('plaintext', { keyPath: 'eventId' })
        }
      }

      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result
        resolve()
      }

      req.onerror = () => reject(req.error)
    })
  }

  async saveEvent(event: NostrEvent): Promise<void> {
    if (!this.db) return
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('events', 'readwrite')
      const store = tx.objectStore('events')
      const req = store.put(event)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async getEventsByKind(kind: number): Promise<NostrEvent[]> {
    if (!this.db) return []
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('events', 'readonly')
      const store = tx.objectStore('events')
      const index = store.index('kind')
      const req = index.getAll(kind)
      req.onsuccess = () => resolve(req.result as NostrEvent[])
      req.onerror = () => reject(req.error)
    })
  }

  async savePlaintext(eventId: string, plaintext: string): Promise<void> {
    if (!this.db) return
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('plaintext', 'readwrite')
      const store = tx.objectStore('plaintext')
      const req = store.put({ eventId, plaintext })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async getPlaintext(eventId: string): Promise<string | null> {
    if (!this.db) return null
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('plaintext', 'readonly')
      const store = tx.objectStore('plaintext')
      const req = store.get(eventId)
      req.onsuccess = () => resolve(req.result?.plaintext || null)
      req.onerror = () => reject(req.error)
    })
  }

  async pruneOldEvents(): Promise<void> {
    if (!this.db) return

    const allEvents = await new Promise<NostrEvent[]>((resolve, reject) => {
      const tx = this.db!.transaction('events', 'readonly')
      const req = tx.objectStore('events').getAll()
      req.onsuccess = () => resolve(req.result as NostrEvent[])
      req.onerror = () => reject(req.error)
    })

    if (allEvents.length <= MAX_EVENTS) return

    const sorted = allEvents.sort((a, b) => a.created_at - b.created_at)
    const toDelete = sorted.slice(0, allEvents.length - MAX_EVENTS)

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction('events', 'readwrite')
      const store = tx.objectStore('events')
      for (const ev of toDelete) {
        store.delete(ev.id)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

export const nostrStorage = new NostrStorage()
