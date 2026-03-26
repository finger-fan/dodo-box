# Architecture

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** Client-side privacy-first multi-account messaging application with Nostr protocol integration

**Key Characteristics:**
- Next.js 15 App Router with client-side rendering for all interactive features
- React Context-based state management for Nostr identities and sessions
- Layered Nostr abstraction with adapter pattern for easy testing and implementation switching
- Memory-only private key storage for enhanced security (never persisted to disk)
- Capacitor support for cross-platform Android deployment
- Multi-identity architecture allowing users to manage multiple Nostr identities within a single account

## Layers

**Presentation Layer:**
- Purpose: User interface and client-side interaction
- Location: `app/`, `components/`
- Contains: Next.js pages, UI components, routing, layout
- Depends on: Context providers, hooks, utility functions
- Used by: End users directly

**Context Layer:**
- Purpose: Global state management and dependency injection
- Location: `contexts/`
- Contains: React Context providers (NostrProvider, ThemeProvider)
- Depends on: Business logic layer, Nostr adapters
- Used by: Presentation layer components

**Business Logic Layer:**
- Purpose: Core application logic and use cases
- Location: `lib/nostr/`, `hooks/`
- Contains: Identity management, vault encryption, Nostr event handling, relay communication
- Depends on: Nostr protocol libraries, utilities, external services
- Used by: Context layer

**Infrastructure Layer:**
- Purpose: External service integrations and low-level operations
- Location: `lib/welshman/`, third-party dependencies
- Contains: Nostr relay management, signing, storage via Welshman library
- Depends on: External Nostr libraries, network APIs
- Used by: Business logic layer

## Data Flow

**Authentication Flow:**

1. User enters username and password on `/login` page
2. Credentials passed to `login()` or `register()` method in `NostrContext`
3. Master key derived from password using PBKDF2
4. Encrypted vault loaded from localStorage or created for new users
5. Vault decrypted in memory with derived master key
6. Session state updated with authentication status and vault metadata
7. User redirected to `/messages` page

**Messaging Flow:**

1. User composes message in chat interface
2. Message data passed to Nostr adapter via context
3. Message signed using in-memory identity private key
4. Signed event published to connected Nostr relays
5. Incoming messages from relays are received and stored locally
6. UI updates with new messages via context state changes

**State Management:**
- Global application state managed via React Context (`NostrContext`)
- Private keys stored exclusively in `useRef()` memory references (never in React state or persisted storage)
- Local storage used only for encrypted vault data and session metadata (no sensitive material)
- UI state managed locally within components where appropriate

## Key Abstractions

**Nostr Adapter:**
- Purpose: Abstract Nostr protocol implementation from business logic
- Examples: `lib/nostr/empty-adapter.ts`, `lib/nostr/real-adapter.ts`
- Pattern: Strategy pattern allowing seamless switching between mock and real implementations

**Encrypted Vault:**
- Purpose: Secure storage for multiple Nostr identities
- Examples: `lib/nostr/vault-crypto.ts`, `lib/nostr/vault-sync.ts`
- Pattern: Client-side encrypted storage with AES-GCM encryption

**Identity Management:**
- Purpose: Handle multiple Nostr identities per user account
- Examples: `contexts/NostrContext.tsx`, `lib/nostr/key-derivation.ts`
- Pattern: Hierarchical key derivation from single master password

## Entry Points

**Web Application:**
- Location: `app/layout.tsx`
- Triggers: Browser page load
- Responsibilities: Root layout, font loading, metadata, provider initialization

**Main Authenticated App:**
- Location: `app/(main)/layout.tsx`
- Triggers: Navigation to any authenticated route
- Responsibilities: Authentication guard, layout container, bottom navigation rendering

**Android Application:**
- Location: `android/` directory (Capacitor build)
- Triggers: Mobile app launch
- Responsibilities: Native wrapper, status bar management, auto-updates

## Error Handling

**Strategy:** Layered error handling with Result pattern

**Patterns:**
- All asynchronous operations return `NostrResult<T>` type with explicit success/error states
- No thrown exceptions for expected error cases
- Global error boundaries for unexpected runtime errors
- User-facing error messages via toast notifications

## Cross-Cutting Concerns

**Logging:** Console logging for development, with plans for production error tracking
**Validation:** Zod schema validation for data structures and user input
**Authentication:** Session-based authentication with in-memory key storage, automatic logout on page refresh for security
**Internationalization:** i18next with browser language detection, translation files in `public/locales/`
**Theming:** next-themes with system preference detection, dark/light mode support

---

*Architecture analysis: 2026-03-26*
