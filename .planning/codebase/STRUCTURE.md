# Codebase Structure

**Analysis Date:** 2026-03-26

## Directory Layout

```
[project-root]/
├── app/                    # Next.js App Router pages and routing
├── android/                # Capacitor Android native project
├── components/             # Reusable React components
├── contexts/               # React Context providers
├── docker/                 # Docker configuration files
├── docs/                   # Project documentation
├── hooks/                  # Custom React hooks
├── lib/                    # Core business logic and utilities
├── public/                 # Static assets and localization files
├── scripts/                # Build and deployment scripts
├── tests/                  # Test suite (unit, integration, E2E)
├── .planning/              # Planning and codebase documentation
├── next.config.ts          # Next.js configuration
├── package.json            # Dependencies and scripts
└── tsconfig.json           # TypeScript configuration
```

## Directory Purposes

**`app/`:**
- Purpose: Next.js App Router implementation
- Contains: Page components, route handlers, layout components
- Key files:
  - `app/layout.tsx`: Root application layout
  - `app/(main)/layout.tsx`: Authenticated section layout with guard
  - `app/login/page.tsx`: Authentication page
  - `app/(main)/messages/`: Chat interface routes
  - `app/(main)/contacts/`: Contact management routes
  - `app/(main)/discover/`: Discovery and social features
  - `app/(main)/settings/`: Application settings

**`components/`:**
- Purpose: Reusable UI components
- Contains: Shared components, feature-specific components, UI primitives
- Key files:
  - `components/Providers.tsx`: Root provider wrapper (theme, i18n, Nostr)
  - `components/ui/`: Shared UI components (BottomNav, ConfirmDialog, etc.)
  - `components/settings/`: Settings page components

**`contexts/`:**
- Purpose: Global state management via React Context
- Contains: Context providers and custom hooks
- Key files:
  - `contexts/NostrContext.tsx`: Nostr session and identity management

**`hooks/`:**
- Purpose: Custom React hooks
- Contains: Shared utility hooks, Nostr-specific hooks
- Key files:
  - `hooks/use-mobile.ts`: Responsive mobile detection
  - `hooks/nostr/`: Nostr-specific functionality hooks

**`lib/`:**
- Purpose: Core business logic and utilities
- Contains: Shared libraries, Nostr implementation, utilities
- Key files:
  - `lib/utils.ts`: Shared utility functions (cn, protocol handlers)
  - `lib/i18n.ts`: Internationalization configuration
  - `lib/nostr/`: Nostr protocol implementation and types
  - `lib/welshman/`: Welshman Nostr library integration layer

**`public/`:**
- Purpose: Static assets served directly
- Contains: Images, fonts, translation files
- Key files:
  - `public/locales/{en,zh}.json`: i18n translation files

**`tests/`:**
- Purpose: Automated test suite
- Contains: Unit tests, integration tests, E2E tests
- Key files:
  - `tests/unit/`: Unit tests for utilities and hooks
  - `tests/integration/`: Integration tests for components and flows
  - `tests/e2e/`: Playwright end-to-end tests

## Key File Locations

**Entry Points:**
- `app/layout.tsx`: Root application entry
- `app/(main)/layout.tsx`: Authenticated application entry

**Configuration:**
- `next.config.ts`: Next.js framework configuration
- `tsconfig.json`: TypeScript compiler configuration
- `package.json`: Dependencies and npm scripts

**Core Logic:**
- `contexts/NostrContext.tsx`: Global state and identity management
- `lib/nostr/`: Nostr protocol implementation
- `lib/welshman/`: Welshman Nostr library integration

**Testing:**
- `tests/`: All test files organized by type

## Naming Conventions

**Files:**
- PascalCase for React components: `BottomNav.tsx`, `Providers.tsx`
- kebab-case for utilities, hooks, and non-component files: `use-mobile.ts`, `vault-crypto.ts`
- `.tsx` extension for React components, `.ts` for non-component TypeScript files

**Directories:**
- kebab-case for all directories: `lib/nostr`, `components/ui`
- Parentheses for Next.js route groups: `(main)`

## Where to Add New Code

**New Feature:**
- Primary code: `app/(main)/[feature-name]/` for pages, `components/[feature-name]/` for components
- Tests: `tests/[unit|integration]/[feature-name]/`

**New Component/Module:**
- Implementation: `components/ui/` for shared UI components, `components/[feature]/` for feature-specific components
- Business logic: `lib/[module]/` for new core modules

**Utilities:**
- Shared helpers: `lib/utils.ts` for small utilities, `lib/[module]/` for larger utility modules

## Special Directories

**`android/`:**
- Purpose: Capacitor native Android project
- Generated: Yes (via `pnpm cap:sync`)
- Committed: Yes (contains custom native configuration)

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (in .gitignore)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No (in .gitignore)

---

*Structure analysis: 2026-03-26*
