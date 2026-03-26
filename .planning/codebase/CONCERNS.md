# Codebase Concerns

**Analysis Date:** 2026-03-26

## Tech Debt

**Nostr Implementation - Dual Adapter Pattern:**
- Issue: Codebase maintains both mock and real Nostr adapter implementations, with mock data layer still present from prototype phase
- Files:
  - `lib/nostr/real-adapter.ts` (450 lines)
  - `lib/nostr/empty-adapter.ts`
  - `lib/mock-data.ts`
- Impact: Unnecessary code duplication, potential for inconsistent behavior between adapters, increased maintenance overhead
- Fix approach: Remove mock data layer entirely, use real adapter with in-memory relay for testing purposes only

**Welshman Integration - Partial Migration:**
- Issue: Recent Welshman Nostr library integration is incomplete, with duplicate relay management and crypto logic spread across `lib/welshman/` and `lib/nostr/` directories
- Files:
  - `lib/nostr/relay-client.ts`
  - `lib/welshman/relay-manager.ts`
  - `lib/nostr/vault-crypto.ts`
  - `lib/welshman/crypto.ts`
- Impact: Conflicting implementations, potential for bugs when switching between relay management systems, increased code complexity
- Fix approach: Complete migration to Welshman libraries, remove duplicate custom implementations, consolidate all Nostr logic under unified interfaces

**Key Derivation - Static Salt Vulnerability:**
- Issue: Master key derivation uses a hardcoded static salt (`VAULT_SALT`) combined with username and password, reducing entropy and making brute-force attacks feasible
- Files: `lib/nostr/key-derivation.ts`
- Impact: Weakened cryptographic security, user accounts vulnerable to rainbow table attacks if vault data is compromised
- Fix approach: Implement per-user unique salt storage, use PBKDF2 or Argon2 for key derivation instead of single SHA-256 hash

**AES Key Derivation - Static Salt:**
- Issue: AES key derivation for vault encryption uses a hardcoded static salt (`PBKDF2_SALT = 'vault-aes-key-derivation'`)
- Files: `lib/nostr/vault-crypto.ts`
- Impact: Reduced encryption strength, potential for cryptographic attacks targeting the static salt
- Fix approach: Generate unique random salt for each encryption operation, store salt alongside ciphertext

## Known Bugs

**Session Persistence - Page Refresh Logout:**
- Issue: Users are automatically logged out on page refresh because private keys are only stored in memory refs and not persisted
- Files: `contexts/NostrContext.tsx` (lines 102-118)
- Trigger: Page refresh or browser restart while authenticated
- Workaround: Users must re-login after each page refresh
- Fix approach: Implement secure session persistence with Web Crypto API and password-protected key storage

**Relay Connection - No Fallback Mechanism:**
- Issue: Application only connects to hardcoded default relays, with no fallback if primary relays are unavailable
- Files: `lib/nostr/real-adapter.ts` (lines 48-50)
- Trigger: Default relay outage or network connectivity issues
- Workaround: Users cannot send/receive messages when relays are down
- Fix approach: Implement dynamic relay discovery, multiple relay fallbacks, and user-configurable relay settings

**Vault Sync - No Conflict Resolution:**
- Issue: Vault synchronization between devices does not handle concurrent modifications, leading to potential data loss
- Files: `lib/nostr/vault-sync.ts`
- Trigger: Simultaneous vault updates from multiple devices
- Workaround: Users must avoid modifying identities on multiple devices simultaneously
- Fix approach: Implement versioned vault updates with merge conflict detection and resolution

## Security Considerations

**Private Key Management - Memory Only Storage:**
- Risk: Private keys are stored in plaintext in JavaScript memory, vulnerable to XSS attacks and memory inspection
- Files: `contexts/NostrContext.tsx` (lines 97-99)
- Current mitigation: Keys are not persisted to localStorage, auto-logout on page refresh
- Recommendations: Use Web Crypto API for key storage with extractable: false, implement secure memory wiping, add XSS protection headers

**LocalStorage Data Exposure:**
- Risk: Sensitive user data (contacts, chat metadata, relay quality metrics) is stored unencrypted in localStorage
- Files:
  - `lib/nostr/contact-cache.ts`
  - `lib/welshman/relay-quality.ts`
  - `lib/nostr/seq-counter.ts`
- Current mitigation: Private keys are not stored in localStorage
- Recommendations: Encrypt all sensitive data stored in localStorage, implement secure storage purge on logout

**Nostr Gift Wrap Decryption - Missing Error Handling:**
- Risk: Gift wrap message decryption failures are silently ignored, potentially leading to lost messages or undetected tampering
- Files: `lib/nostr/real-adapter.ts` (line 92)
- Current mitigation: Only validly decrypted messages are processed
- Recommendations: Implement proper error logging for decryption failures, add tampering detection mechanisms

**Protocol Handler - Unvalidated Input:**
- Risk: `dodobox://` protocol handler does not properly validate input, potentially leading to injection attacks
- Files: `lib/utils.ts` (lines 13-29)
- Current mitigation: Basic protocol prefix check
- Recommendations: Implement strict input validation for all protocol links, add sandboxing for external content

## Performance Bottlenecks

**Message Fetching - Linear Scan:**
- Problem: Message fetching and filtering performs linear scan of all downloaded events, causing O(n) performance degradation with large message volumes
- Files: `lib/nostr/real-adapter.ts` (lines 74-100+)
- Cause: No client-side indexing or pagination for message history
- Improvement path: Implement client-side database indexing (IndexedDB), add incremental message loading with pagination

**Contact Cache - Full Reconstruction:**
- Problem: Contact list and chat list are fully reconstructed on every data update, leading to unnecessary re-renders
- Files: `lib/nostr/real-adapter.ts`
- Cause: No incremental update mechanism for contact/chat lists
- Improvement path: Implement differential updates, use memoization and optimized state management

**Welshman Relay Quality - Frequent Persistence:**
- Problem: Relay quality metrics are persisted to localStorage on every quality update, causing unnecessary I/O operations
- Files: `lib/welshman/relay-quality.ts`
- Cause: No debouncing or batching of localStorage writes
- Improvement path: Implement debounced persistence, batch multiple quality updates into single write operation

## Fragile Areas

**Nostr Context - Large Monolithic Component:**
- Files: `contexts/NostrContext.tsx` (368 lines)
- Why fragile: Contains authentication, identity management, vault operations, and adapter initialization in a single file. High cyclomatic complexity.
- Safe modification: Refactor into smaller, focused hooks and utilities first. Add comprehensive unit tests before modifying core logic.
- Test coverage: Integration tests exist but unit test coverage is limited for edge cases.

**Real Nostr Adapter - God Class:**
- Files: `lib/nostr/real-adapter.ts` (450 lines)
- Why fragile: Contains all Nostr protocol logic, message handling, caching, and relay communication. Dependencies on multiple external libraries.
- Safe modification: Split into separate modules for messaging, contacts, profiles, and relay management before making changes.
- Test coverage: Limited integration tests, no unit tests for individual methods.

**Vault Crypto Module - Security Critical:**
- Files: `lib/nostr/vault-crypto.ts`
- Why fragile: Implements custom cryptographic operations for vault encryption. Any modification can break backward compatibility or introduce security vulnerabilities.
- Safe modification: Do not modify existing encryption/decryption logic. Implement versioned upgrades if changes are needed. Add extensive test vectors.
- Test coverage: No dedicated security tests for crypto operations.

## Scaling Limits

**Message Storage - localStorage Capacity:**
- Current capacity: ~5MB total localStorage capacity
- Limit: Will break when message history exceeds storage limits
- Scaling path: Migrate from localStorage to IndexedDB for client-side storage, implement automatic message pruning based on TTL settings

**Relay Connection - Single Connection Pool:**
- Current capacity: Limited to configured default relays
- Limit: Performance degrades with >10 concurrent relay connections
- Scaling path: Implement relay pooling with dynamic connection management, prioritize relays based on quality metrics

**Identity Management - In-Memory Vault:**
- Current capacity: Limited to memory constraints
- Limit: Performance degrades with >100 identities per vault
- Scaling path: Implement lazy loading of identity metadata, optimize vault data structure for large identity counts

## Dependencies at Risk

**Svelte - Unused Dependency:**
- Risk: Svelte v5.55.0 is listed as a production dependency but not used in the codebase (React is used for UI)
- Impact: Increased bundle size, unnecessary dependency bloat, potential for confusion in dependency management
- Migration plan: Remove Svelte from production dependencies

**Welshman Libraries - Pre-release Version:**
- Risk: Using v0.8.9 of multiple Welshman packages, which are pre-release and may have breaking API changes
- Impact: Future updates may require significant refactoring, potential for unexpected bugs from unstable library versions
- Migration plan: Pin to specific versions until stable release, create abstraction layer to isolate Welshman implementation details

**Next.js - Release Candidate Version:**
- Risk: Using Next.js 15.4.9 which is a release candidate, not a stable LTS version
- Impact: Potential for breaking changes, security issues, or unstable behavior
- Migration plan: Upgrade to stable Next.js 15 release when available, monitor for security patches

## Missing Critical Features

**End-to-End Testing Coverage:**
- Problem: No E2E tests for core messaging flows, authentication, or identity management
- Blocks: Safe refactoring of core modules, confident release of new features
- Priority: High

**Backup and Recovery:**
- Problem: No mechanism for users to backup or recover their vault data if password is lost
- Blocks: Production readiness, user trust in the platform
- Priority: High

**Relay Configuration UI:**
- Problem: Users cannot configure custom Nostr relays, only use hardcoded defaults
- Blocks: Decentralization, user control over network infrastructure
- Priority: Medium

**Cross-Device Sync:**
- Problem: Vault synchronization between devices is not fully implemented
- Blocks: Multi-device usage patterns
- Priority: Medium

## Test Coverage Gaps

**Cryptographic Modules:**
- What's not tested: Vault encryption/decryption, key derivation, gift wrap message handling
- Files:
  - `lib/nostr/vault-crypto.ts`
  - `lib/nostr/key-derivation.ts`
  - `lib/welshman/crypto.ts`
- Risk: Undetected cryptographic vulnerabilities, broken backward compatibility when modifying crypto logic
- Priority: High

**Nostr Adapter Edge Cases:**
- What's not tested: Network failures, relay disconnections, malformed events, decryption failures
- Files: `lib/nostr/real-adapter.ts`
- Risk: Unhandled errors in production, poor user experience during network issues
- Priority: High

**Authentication Flows:**
- What's not tested: Edge cases in login/register flows, identity switching, vault sync conflicts
- Files: `contexts/NostrContext.tsx`
- Risk: Authentication bugs, potential for account lockouts or data loss
- Priority: High

---

*Concerns audit: 2026-03-26*