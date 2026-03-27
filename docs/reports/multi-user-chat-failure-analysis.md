# Multi-User Chat E2E Test Failure Analysis

## Date: 2026-03-27

## Summary

E2E tests `multi-user-chat.spec.ts` (2 tests) fail because messages sent by Alice never appear on Bob's screen. Root cause: **two independent issues** in how NIP-59 gift-wrapped messages interact with the strfry relay.

---

## Root Cause 1: strfry rejects gift-wrapped events (CRITICAL)

### Symptom
`publishEvent()` returns `status: "failure"` with detail `"invalid: created_at too early"` for kind-1059 (gift-wrap) events.

### Cause
Welshman's NIP-59 implementation randomizes `created_at` for privacy:

```javascript
// node_modules/@welshman/signer/dist/signer/src/nip59.js
export const now = (drift = 0) =>
  Math.round(Date.now() / 1000 - Math.random() * Math.pow(10, drift));

// Used in getSeal() and getWrap() with drift=5:
created_at: now(5)  // drifts up to 100,000 seconds (~27.8 hours) into the past
```

strfry relay rejects these events as "too early" despite `rejectEventsOlderThanSeconds = 0` in config. Testing revealed that `0` does NOT disable the check in the current strfry version (`ghcr.io/hoytech/strfry:latest`).

### Fix
**File: `docker/strfry.conf`** - Set `rejectEventsOlderThanSeconds = 604800` (7 days) to accommodate NIP-59 timestamp randomization.

### Verification
After config change, diagnostic tests Step 1-6 all pass (publish, fetch, decrypt work correctly).

---

## Root Cause 2: Subscription `since` filter incompatible with NIP-59 timestamps (CRITICAL)

### Symptom
Bob's real-time subscription never receives Alice's messages, even after Root Cause 1 is fixed.

### Cause
In `lib/nostr/real-adapter.ts:177-183`:

```typescript
const filters: NostrFilter[] = [
  {
    kinds: [KIND_DM_WRAP],
    '#p': [this.session.currentPubkey],
    since: Math.floor(Date.now() / 1000),  // <-- PROBLEM
  },
]
```

The subscription uses `since: now` to filter for "new" messages. But NIP-59 gift-wrap events have `created_at` randomized up to ~28 hours in the past. The relay's real-time push correctly filters events by `since`, so the gift-wrapped events are excluded because their `created_at` predates the `since` value.

### Fix (APPLIED)
**File: `lib/nostr/real-adapter.ts`** - Removed `since` from subscription filter. Dedup handled by welshman's Tracker.

---

## Root Cause 3: Shared Tracker singleton causes event loss under React StrictMode (CRITICAL)

### Symptom
After fixing Root Causes 1 and 2, Bob still can't see messages. Debug logging revealed:
- `getMessages` is called TWICE (React StrictMode double-fires effects in dev mode)
- First call fetches 1 event successfully from relay
- Second call fetches 0 events (Tracker dedup)
- First call's results are discarded (`mounted = false` from cleanup)
- Second call returns empty, setting messages state to `[]`

### Cause
`fetchEvents()` in `lib/welshman/relay-manager.ts` used a **shared global Tracker singleton** (`getTracker()`). The Tracker tracks event IDs to prevent duplicate processing. When React StrictMode re-runs effects:

1. Effect Run 1: `getMessages` + `subscribeToMessages` → both send REQs → Tracker consumes events
2. StrictMode cleanup: `mounted = false`, subscription cancelled
3. Effect Run 2: new `getMessages` + `subscribeToMessages` → Tracker says "already seen" → returns 0 events
4. Run 1's results discarded (mounted=false), Run 2 gets nothing → **messages lost**

### Fix (APPLIED)
**File: `lib/welshman/relay-manager.ts`** - `fetchEvents` now creates a **fresh `new Tracker()`** per call instead of using the shared singleton. This ensures each fetch operates independently. Subscriptions still use the shared tracker for cross-subscription dedup.

### Additional Fix (APPLIED)
**File: `hooks/nostr/use-messages.ts`** - Changed `setMessages(msgs)` to updater form `setMessages(prev => {...merge...})` to safely merge fetched messages with any already delivered via subscription, preventing overwrites.

---

## How the Two Bugs Interact

| Scenario | Root Cause 1 (relay rejects) | Root Cause 2 (since filter) | Result |
|----------|------------------------------|----------------------------|--------|
| Alice sends, Bob fetches history | Message never stored | N/A | No message |
| Alice sends, Bob subscribes | Message never stored | Would also filter it out | No message |
| After fix 1 only | Message stored OK | Subscription filters it | Bob sees via history, not real-time |
| After both fixes | Message stored OK | Subscription receives it | Full real-time messaging works |

---

## Additional Findings

### Test code is correct
The E2E test code itself is NOT the problem. The test flow (register, add contacts, open chat, send/receive messages) is logically correct. The page objects and fixtures work as expected.

### Console errors are silent
Neither Alice nor Bob's browser console shows any Nostr-related errors. The `publishEvent` failure is caught in `sendMessage()` and returned as `sendStatus: 'failed'`, but no `console.error` is triggered on the publish path (only on the catch path which isn't reached since publish returns a failure result, not an exception).

### NIP-59 `now(5)` drift is by design
The 100,000-second drift is an intentional privacy feature in NIP-59 to prevent timestamp-based metadata correlation. This is part of the welshman library (`@welshman/signer` v0.8.9) and should NOT be modified. The relay and subscription code must accommodate it.

### Seal event also uses `now(5)`
Both the inner seal (kind 13) and outer wrap (kind 1059) use `now(5)`. Only the wrap's `created_at` matters for relay acceptance (the seal is encrypted inside the wrap).

### Duplicate p-tags in wrap
The `createGiftWrap` function passes `[['p', recipientPubkey]]` as tags, and welshman's `getWrap` also adds `["p", pubkey]`, resulting in duplicate p-tags. This is harmless but worth noting.

---

## All Fixes Applied and Verified

All three root causes have been fixed. Full E2E test suite: **24 passed, 0 failed**.

### Changes Made

| File | Change |
|------|--------|
| `docker/strfry.conf` | `rejectEventsOlderThanSeconds`: `0` -> `604800` (7 days) |
| `lib/nostr/real-adapter.ts` | Removed `since` from subscription filter |
| `lib/welshman/relay-manager.ts` | `fetchEvents` uses `new Tracker()` instead of shared singleton |
| `hooks/nostr/use-messages.ts` | `setMessages(msgs)` -> merge updater form |

### Note
The production relay (`docker-compose.yml`) uses the same `docker/strfry.conf`, so the relay fix applies to both environments.

---

## Diagnostic Evidence

### Diagnostic test results (after strfry fix, before subscription fix)

| Step | Description | Result |
|------|-------------|--------|
| 1 | Publish plain event (kind 1) | PASS |
| 2 | Build direct message (kind 14) | PASS |
| 3 | Create gift wrap (kind 1059) | PASS |
| 4 | Publish gift wrap to relay | PASS |
| 5 | Bob fetches events from relay | PASS |
| 6 | Bob decrypts gift-wrapped message | PASS |
| 7 | Real-time subscription (with `since`) | FAIL |
| 7 | Real-time subscription (without `since`) | PASS |

### Files involved

- `docker/strfry.conf` - Relay configuration (Root Cause 1)
- `lib/nostr/real-adapter.ts:177-183` - Subscription filter (Root Cause 2)
- `lib/welshman/crypto.ts` - Gift-wrap creation (correct, uses welshman)
- `lib/welshman/relay-manager.ts` - Relay publish/subscribe (correct)
- `lib/welshman/engine.ts` - Welshman singleton init (correct)
- `node_modules/@welshman/signer/dist/signer/src/nip59.js` - NIP-59 `now(5)` drift (by design)
