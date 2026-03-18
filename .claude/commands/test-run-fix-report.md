---
description: Run the full test suite (unit + integration + E2E), auto-fix failing code, and generate a structured test report. Drives the Red-Green-Refactor cycle autonomously.
---

# Test Run → Fix → Report Command

Execute all tests, diagnose failures, fix the implementation (not the tests), and produce a structured report.

## What This Command Does

1. **Run unit + integration tests** via Vitest
2. **Run E2E tests** via Playwright
3. **Diagnose failures** — identify root cause in implementation
4. **Fix code** — minimal changes to make tests pass (never modify tests unless they are wrong)
5. **Re-run tests** — verify fixes
6. **Generate report** — structured summary of results, coverage, and actions taken

## Full Execution Flow

```
pnpm test:coverage          (unit + integration, with coverage)
     ↓ failures?
  Diagnose → Fix implementation → Re-run
     ↓ green
pnpm test:e2e               (Playwright E2E)
     ↓ failures?
  Diagnose → Fix implementation → Re-run
     ↓ green
Generate Report
```

## Step 1: Run Unit + Integration Tests

```bash
pnpm test:coverage 2>&1
```

Expected output when healthy:
```
Test Files: 6 passed (6)
Tests:      80 passed (80)
Coverage:   lib/     → 82% lines
            hooks/   → 85% lines
            contexts/→ 78% branches
```

If failures appear:

```
FAIL tests/unit/lib/nostr/vault-crypto.test.ts
  ● encryptVault › wrong password returns null
    Expected: null
    Received: {...}
```

**Diagnosis process:**
1. Read the failing test to understand expected behavior
2. Read the implementation file
3. Identify the gap — is it a missing guard, wrong logic, or stale mock?
4. Apply minimal fix (change implementation, not the test)
5. Re-run only that test file: `pnpm vitest run tests/unit/lib/nostr/vault-crypto.test.ts`

## Step 2: Run E2E Tests

```bash
pnpm test:e2e 2>&1
```

Expected output when healthy:
```
Running 23 tests using 1 worker
  23 passed (33.8s)
```

### Common E2E Failure Patterns

**Selector not found (timeout)**
```
Error: Timeout 30000ms exceeded.
waiting for locator('button').filter({ hasText: 'Alice' })
```
Diagnosis:
- Check if mock data is loading (auth session injected before goto?)
- Inspect `addInitScript` — must call BEFORE `page.goto()`
- Verify mock adapter returns data for the injected pubkey

**Page redirect unexpected**
```
Error: expect(page).toHaveURL(/messages/)
Received: http://localhost:3000/login
```
Diagnosis:
- Auth session key mismatch — check `SESSION_STORAGE_KEY` constant in NostrContext
- `addInitScript` timing — inject before goto, not after

**React 19 data-testid stripped**
```
Error: getByTestId('submit-btn') — 0 elements found
```
Fix: Replace with stable selectors:
- `getByRole('button', { name: /text/i })`
- `getByPlaceholder('...')`
- `locator('.static-css-class')`
- `locator('button').filter({ hasText: '...' })`

**i18n placeholder mismatch**
```
Error: getByPlaceholder('Type a message...') — 0 elements found
```
Diagnosis: Check translation key in `public/locales/en.json`
```bash
grep -r "type_message" public/locales/en.json
```

## Step 3: Coverage Analysis

After tests pass, check coverage thresholds:

```bash
pnpm test:coverage 2>&1 | grep -A 20 "Coverage"
```

If below 80%:

```
lib/nostr/real-adapter.ts  | 12% | BELOW THRESHOLD
```

Decision tree:
1. Is the file critical business logic? → Add tests
2. Is it an adapter for external service (relay, network)? → Mock at boundary, skip integration
3. Is it dead code? → Remove it (use refactor-cleaner agent)

Add tests to bring coverage up:
```bash
# Run coverage with detailed per-file breakdown
pnpm vitest run --coverage --reporter=verbose
```

## Step 4: Fix Patterns

### Pattern 1: Missing null/undefined guard

```typescript
// Test expects:
expect(decryptVault(encrypted, 'wrongpass')).resolves.toBeNull()

// Implementation missing:
export async function decryptVault(data: EncryptedVault, password: string) {
  // Add guard:
  try {
    const result = await decrypt(data, password)
    return result
  } catch {
    return null  // ← this was missing
  }
}
```

### Pattern 2: Optimistic update race condition

```typescript
// Test expects immediate update before async completes:
act(() => { result.current.sendMessage('Hello') })
expect(result.current.messages).toHaveLength(1)  // must be immediate

// Fix: set state before awaiting
const sendMessage = async (text: string) => {
  const optimistic = createOptimisticMessage(text)
  setMessages(prev => [...prev, optimistic])  // ← immediate
  const result = await adapter.sendMessage(contactPubkey, text)  // ← async
  if (!result.success) {
    setMessages(prev => prev.filter(m => m.id !== optimistic.id))  // rollback
  }
}
```

### Pattern 3: Context not exported for test wrapper

```typescript
// Integration test needs raw context:
import { NostrContext } from '@/contexts/NostrContext'

// Fix — must be exported (not just the hook):
export const NostrContext = createContext<NostrContextValue | null>(null)
//  ↑ was: const NostrContext (unexported)
```

### Pattern 4: E2E auth not persisting

```typescript
// WRONG — evaluate runs after page load:
await page.goto('/messages')
await page.evaluate(() => localStorage.setItem('dodobox_session', '...'))

// CORRECT — addInitScript runs before page load:
await page.addInitScript((session) => {
  localStorage.setItem('dodobox_session', JSON.stringify(session))
}, AUTH_SESSION)
await page.goto('/messages')
```

## Step 5: Generate Report

After all tests pass, produce this structured report:

---

## Test Report — dodo-box

**Date:** [ISO timestamp]
**Branch:** main
**Commit:** [git hash]

### Summary

| Suite | Tests | Passed | Failed | Duration |
|-------|-------|--------|--------|----------|
| Unit | 64 | 64 | 0 | 3.2s |
| Integration | 16 | 16 | 0 | 4.1s |
| E2E | 23 | 23 | 0 | 33.8s |
| **Total** | **103** | **103** | **0** | **41.1s** |

**Status: ALL TESTS PASSING**

### Coverage

| Module | Lines | Functions | Branches |
|--------|-------|-----------|----------|
| lib/ | 82% | 85% | 79% |
| hooks/ | 85% | 88% | 80% |
| contexts/ | 91% | 90% | 78% |
| **Overall** | **85%** | **87%** | **79%** |

Threshold: 80% lines/functions, 75% branches — **PASSED**

### Fixes Applied

List any code changes made during this run:

```
[FIXED] lib/nostr/vault-crypto.ts:45 — add null return on decrypt failure
[FIXED] hooks/nostr/use-messages.ts:78 — optimistic update before async call
```

### E2E Test Coverage

| User Flow | Tests | Status |
|-----------|-------|--------|
| Login / Register | 8 | PASS |
| Messages list | 4 | PASS |
| Chat detail | 6 | PASS |
| Settings page | 3 | PASS |
| Navigation guards | 2 | PASS |

### Artifacts

- Coverage HTML: `coverage/index.html`
- Playwright report: `playwright-report/index.html`
- Trace files: `test-results/` (on failure only)

---

## Running the Command

```bash
# Full run (unit + integration + E2E)
pnpm test:all

# With coverage
pnpm test:coverage && pnpm test:e2e

# Watch mode for active development
pnpm test:watch

# Single test file
pnpm vitest run tests/unit/lib/nostr/vault-crypto.test.ts
pnpm playwright test tests/e2e/login.spec.ts
```

## Autonomous Fix Protocol

When running this command autonomously (user is away):

1. **Never modify tests** unless the test itself has a clear bug (wrong expected value, wrong assertion)
2. **Fix implementation** to match test expectations
3. **Minimal diff** — change only what's needed to pass the test
4. **Re-run after each fix** — don't batch fixes, verify each independently
5. **Stop if ambiguous** — if fixing test A would break test B, report the conflict
6. **Commit when green** — commit each fix with message `fix: make <test name> pass`
7. **Final commit** — `test: all 103 tests passing` after full green run

## Integration with CI

```yaml
# .github/workflows/test.yml
- name: Install dependencies
  run: pnpm install

- name: Install Playwright browsers
  run: pnpm test:e2e:install

- name: Run unit + integration tests
  run: pnpm test:coverage

- name: Run E2E tests
  run: pnpm test:e2e
  env:
    CI: true
    NEXT_PUBLIC_NOSTR_MOCK: true

- name: Upload Playwright report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

## Related Commands

- `/build-test-suite` — bootstrap test infrastructure from scratch
- `/tdd` — write tests first, then implementation
- `/code-review` — review code quality after fixes
- `/build-fix` — fix TypeScript/build errors blocking test run
