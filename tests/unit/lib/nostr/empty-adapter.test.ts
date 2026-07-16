import { describe, it, expect } from 'vitest'
import { EmptyNostrAdapter } from '@/lib/nostr/empty-adapter'
import type { INostrAdapter } from '@/lib/nostr/types'

describe('EmptyNostrAdapter', () => {
  const adapter: INostrAdapter = new EmptyNostrAdapter()

  it('returns empty array for getChats', async () => {
    expect(await adapter.getChats()).toEqual([])
  })

  it('returns empty array for getMessages', async () => {
    expect(await adapter.getMessages('pubkey')).toEqual([])
  })

  it('returns failure for sendMessage', async () => {
    const result = await adapter.sendMessage('pubkey', 'text')
    expect(result.success).toBe(false)
  })

  it('returns noop unsubscribe for subscribeToMessages', () => {
    const unsub = adapter.subscribeToMessages('pubkey', () => {})
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('returns empty array for getContacts', async () => {
    expect(await adapter.getContacts()).toEqual([])
  })

  it('returns failure for addContact', async () => {
    const result = await adapter.addContact('pubkey')
    expect(result.success).toBe(false)
  })

  it('returns failure for removeContact', async () => {
    const result = await adapter.removeContact('pubkey')
    expect(result.success).toBe(false)
  })

  it('returns null for getProfile', async () => {
    expect(await adapter.getProfile('pubkey')).toBeNull()
  })

  it('returns failure for updateProfile', async () => {
    const result = await adapter.updateProfile({ name: 'test' })
    expect(result.success).toBe(false)
  })

  it('returns empty array for getRelays', () => {
    expect(adapter.getRelays()).toEqual([])
  })

  it('returns failure for setRelays', async () => {
    const result = await adapter.setRelays(['wss://relay.test'])
    expect(result.success).toBe(false)
  })

  it('returns empty array for recoverMessages', async () => {
    expect(await adapter.recoverMessages('pubkey', 0, 100)).toEqual([])
  })
})
