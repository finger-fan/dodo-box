import '@testing-library/jest-dom'
import { webcrypto } from 'node:crypto'

// Polyfill Web Crypto API for jsdom environment (Node provides it natively in Node 19+)
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: false,
    configurable: true,
  })
}

// Polyfill localStorage for pure node environment (unit tests without jsdom)
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {}
  const localStorageMock = {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => { store[key] = String(value) },
    removeItem: (key: string): void => { delete store[key] },
    clear: (): void => { Object.keys(store).forEach(k => delete store[k]) },
    get length(): number { return Object.keys(store).length },
    key: (n: number): string | null => Object.keys(store)[n] ?? null,
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: false,
    configurable: true,
  })
}

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})
