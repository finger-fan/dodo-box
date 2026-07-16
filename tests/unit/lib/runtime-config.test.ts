import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDefaultRelays, getUserRelays, setUserRelays, clearUserRelays } from '@/lib/runtime-config'

describe('runtime-config', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
      get length() { return Object.keys(store).length },
      key: (i: number) => Object.keys(store)[i] ?? null,
    } as Storage)
  })

  it('getDefaultRelays parses env or falls back to damus', () => {
    expect(getDefaultRelays()).toContain('wss://relay.damus.io')
  })

  it('getUserRelays returns empty array when not set', () => {
    expect(getUserRelays()).toEqual([])
  })

  it('setUserRelays persists and getUserRelays retrieves', () => {
    setUserRelays(['wss://relay1.com', 'wss://relay2.com'])
    expect(getUserRelays()).toEqual(['wss://relay1.com', 'wss://relay2.com'])
  })

  it('clearUserRelays removes stored relays', () => {
    setUserRelays(['wss://relay1.com'])
    clearUserRelays()
    expect(getUserRelays()).toEqual([])
  })

  it('getUserRelays handles corrupted JSON gracefully', () => {
    localStorage.setItem('dodobox_user_relays', 'not-json')
    expect(getUserRelays()).toEqual([])
  })

  it('getUserRelays filters non-string entries', () => {
    localStorage.setItem('dodobox_user_relays', JSON.stringify(['valid', '', 123, null]))
    expect(getUserRelays()).toEqual(['valid'])
  })
})
