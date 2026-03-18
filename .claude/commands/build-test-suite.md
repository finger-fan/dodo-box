---
description: Build a complete test infrastructure for Next.js 15 + React 19 + TypeScript projects from scratch. Sets up Vitest (unit/integration) + Playwright (E2E) with correct environment routing, crypto polyfills, and ARIA-based selectors.
---

# Build Test Suite Command

Bootstrap a complete, production-ready test infrastructure for Next.js 15 + React 19 + TypeScript projects.

## What This Command Does

1. **Installs dependencies** - Vitest, Playwright, Testing Library
2. **Creates config files** - vitest.config.ts, vitest.setup.ts, playwright.config.ts
3. **Scaffolds test directories** - unit/, integration/, e2e/
4. **Writes seed tests** - covering crypto, hooks, context, and user flows
5. **Adds package.json scripts** - test, test:unit, test:coverage, test:e2e, test:all

## Tech Stack Decision

| Dimension | Vitest + Playwright |
|-----------|---------------------|
| Unit/Integration | Vitest 4.x (node + jsdom environments) |
| E2E | Playwright (headless Chromium, no display needed) |
| Coverage | @vitest/coverage-v8 (fast, no instrumentation) |
| Crypto | Node 22 native crypto.subtle (no polyfill needed for node env) |

## Step 1: Install Dependencies

```bash
pnpm add -D vitest @vitejs/plugin-react @vitest/coverage-v8 \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  jsdom @types/jsdom \
  @playwright/test

# Install browser for E2E (headless, works without display)
pnpm exec playwright install chromium
```

## Step 2: vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',              // default environment
    environmentMatchGlobs: [
      ['tests/unit/lib/**', 'node'],   // pure functions -> node (native crypto.subtle)
      ['tests/integration/**', 'jsdom'], // React hooks -> jsdom
    ],
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['lib/**/*.ts', 'hooks/**/*.ts', 'contexts/**/*.tsx'],
      thresholds: { global: { lines: 80, functions: 80, branches: 75 } },
    },
    deps: { inline: ['nostr-tools'] },  // fix CJS/ESM mixed packages
  },
  resolve: { alias: { '@': resolve(__dirname, '.') } },
})
```

**Key design decisions:**
- `environmentMatchGlobs`: routes `tests/unit/lib/**` to `node` so `crypto.subtle` works natively (no polyfill)
- `deps.inline`: transpiles CJS packages that ship dual-format bundles (avoids `exports is not defined` errors)
- `globals: true`: enables `describe`, `it`, `expect` etc. without imports in tests

## Step 3: vitest.setup.ts

```typescript
import '@testing-library/jest-dom'
import { webcrypto } from 'node:crypto'

// Polyfill crypto.subtle for jsdom environment (node env has it natively)
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: false,
    configurable: true,
  })
}

// Polyfill localStorage for node environment
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

// Clean up after each test
afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})
```

## Step 4: playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,                          // single worker avoids port conflicts
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,                    // works without display (CI/server)
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'NEXT_PUBLIC_NOSTR_MOCK=true pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
```

## Step 5: Test Directory Structure

```
tests/
├── unit/lib/
│   ├── nostr/
│   │   ├── key-derivation.test.ts   # Pure crypto, determinism tests
│   │   ├── vault-crypto.test.ts     # AES-GCM round-trip, immutability
│   │   └── events.test.ts           # NIP-17 GiftWrap, sign/verify
│   └── utils.test.ts                # cn(), protocol encode/decode
├── integration/
│   ├── contexts/
│   │   └── NostrContext.test.tsx    # Auth state machine
│   └── hooks/
│       └── use-messages.test.tsx    # Optimistic update, rollback
└── e2e/
    ├── fixtures/
    │   └── auth.fixture.ts          # localStorage session injection
    ├── login.spec.ts
    ├── messages.spec.ts
    └── settings.spec.ts
```

## Step 6: E2E Auth Fixture Pattern

```typescript
// tests/e2e/fixtures/auth.fixture.ts
import { type Page } from '@playwright/test'

export const AUTH_SESSION = {
  isAuthenticated: true,
  username: 'testuser',
  currentPubkey: 'a'.repeat(64),
  masterPubkey: 'a'.repeat(64),
  vaultData: null,
}

// Inject before page.goto() via addInitScript
export async function injectAuthSession(page: Page): Promise<void> {
  await page.addInitScript((session) => {
    localStorage.setItem('dodobox_session', JSON.stringify(session))
    localStorage.setItem('dodobox_nostr_mock', 'true')
  }, AUTH_SESSION)
}

export async function clearAuthSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('dodobox_session')
    localStorage.removeItem('dodobox_nostr_mock')
  })
}
```

**Why `addInitScript` instead of `page.evaluate`:**
- `addInitScript` runs BEFORE the page loads (before React hydration)
- `page.evaluate` runs after — the auth check already fired with empty storage

## Step 7: Critical E2E Lesson — React 19 Strips data-testid

**Problem:** React 19.2.4 removes `data-testid` attributes from DOM after client hydration.

```javascript
// Debug test to verify:
const count = await page.evaluate(() =>
  document.querySelectorAll('[data-testid]').length
)
// Returns 0 — data-testid is gone!
```

**Solution: Use stable selectors instead**

| Old (broken) | New (works) |
|---|---|
| `getByTestId('method-login')` | `getByRole('button', { name: /login to account/i })` |
| `getByTestId('username-input')` | `getByPlaceholder('Enter username')` |
| `getByTestId('submit-btn')` | `getByRole('button', { name: 'Login' })` |
| `getByTestId('chat-item')` | `locator('button').filter({ hasText: 'Alice' })` |
| `getByTestId('message-input')` | `locator('textarea.msg-input')` (static CSS class) |
| `getByTestId('send-btn')` | `locator('button.send-btn')` (static CSS class) |

**Selector priority (most to least stable):**
1. ARIA role + name: `getByRole('button', { name: /text/i })`
2. Placeholder: `getByPlaceholder('Enter username')`
3. Static CSS class: `locator('.send-btn')` — only for custom non-Tailwind classes
4. Structural: `locator('header button')`, `locator('nav')`
5. Text filter: `locator('button').filter({ hasText: 'Alice' })`

## Step 8: package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:install": "playwright install chromium",
    "test:all": "pnpm test && pnpm test:e2e"
  }
}
```

## Unit Test Patterns

### Crypto (node environment)

```typescript
// key-derivation.test.ts
import { deriveMasterKey } from '@/lib/nostr/key-derivation'

describe('deriveMasterKey', () => {
  it('is deterministic — same inputs always produce same keys', () => {
    const a = deriveMasterKey('alice', 'secret123')
    const b = deriveMasterKey('alice', 'secret123')
    expect(a.privateKey).toBe(b.privateKey)
    expect(a.publicKey).toBe(b.publicKey)
  })

  it('produces valid 64-char hex private key', () => {
    const { privateKey } = deriveMasterKey('user', 'pass')
    expect(privateKey).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

### AES-GCM round-trip

```typescript
it('encrypts and decrypts vault data symmetrically', async () => {
  const vault = createEmptyVaultData()
  const encrypted = await encryptVault(vault, 'masterkey123')
  const decrypted = await decryptVault(encrypted, 'masterkey123')
  expect(decrypted).toEqual(vault)
})
```

## Integration Test Pattern (React hooks)

```typescript
// Custom wrapper to provide context
function createWrapper(session: Partial<NostrSession> = {}) {
  const mockAdapter = new MockNostrAdapter()
  const value: NostrContextValue = {
    session: { isAuthenticated: true, ...session },
    adapter: mockAdapter,
    // ... mock methods
  }
  return ({ children }: { children: React.ReactNode }) => (
    <NostrContext.Provider value={value}>{children}</NostrContext.Provider>
  )
}

it('adds message optimistically before send completes', async () => {
  const { result } = renderHook(() => useMessages('contact123'), {
    wrapper: createWrapper(),
  })

  await act(async () => {
    result.current.sendMessage('Hello!')
  })

  expect(result.current.messages).toHaveLength(1)
  expect(result.current.messages[0].text).toBe('Hello!')
})
```

## Verification

```bash
# Run full test suite
pnpm test:all

# Expected output:
# Test Files: 6 passed (6)
# Tests:      80 passed (80)    <- unit + integration
# E2E:        23 passed (23)    <- Playwright
```

## Common Pitfalls

1. **`jsdom` missing**: Run `pnpm add -D jsdom @types/jsdom` — not installed by default
2. **Top-level await in setup**: Use static `import { webcrypto } from 'node:crypto'`, not dynamic import
3. **NostrContext not exported**: Must `export const NostrContext = createContext(...)` for integration test wrappers
4. **Auth redirect test conflict**: Don't put `injectAuthSession` in `beforeEach` when one test expects NO auth
5. **ESM package errors**: Add problematic packages to `deps.inline` in vitest.config.ts
