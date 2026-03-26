# Coding Conventions

**Analysis Date:** 2026-03-26

## Naming Patterns

**Files:**
- PascalCase for React components: `BottomNav.tsx`, `Providers.tsx`
- kebab-case for utilities, hooks, and non-component files: `use-mobile.ts`, `utils.ts`, `i18n.ts`
- Next.js App Router follows standard conventions: `page.tsx`, `layout.tsx`, `error.tsx`
- Test files: `[module].test.{ts,tsx}` for unit/integration tests, `[feature].spec.ts` for E2E tests

**Functions:**
- camelCase for all functions: `cn()`, `decodeContactInfo()`, `toHex()`
- PascalCase for React component functions: `BottomNav()`, `Providers()`
- Hook functions start with `use-` prefix: `useMobile()`, `useMounted()`

**Variables:**
- camelCase for all variables and constants
- UPPER_SNAKE_CASE for constant values that are fixed at initialization: `FAKE_PUBKEY_HEX`
- React state variables use standard `[state, setState]` pattern

**Types:**
- PascalCase for interfaces, types, and enums
- Props interfaces follow `[ComponentName]Props` pattern where applicable

## Code Style

**Formatting:**
- Semi-colons are optional (not used consistently in the codebase)
- 2-space indentation
- Single quotes for strings
- Trailing commas allowed in multi-line objects/arrays
- No dedicated Prettier config detected, code follows standard TypeScript/React conventions

**Linting:**
- Tool: ESLint 9.39.1 with Next.js recommended configuration
- Config: `eslint.config.mjs`
- Key rules:
  - Next.js core rules enabled
  - React hooks rules enforced
  - TypeScript strict mode enabled
  - Ignores build artifacts, node_modules, and test config files

**Type Safety:**
- TypeScript 5.9.3 with `strict: true` enabled in `tsconfig.json`
- All TypeScript features enabled including strict null checks
- No `any` types allowed in production code
- Type imports use `type` modifier: `import { type ClassValue } from 'clsx'`

## Import Organization

**Order:**
1. External dependencies (React, Next.js, libraries)
2. Internal utilities and components using `@/` path alias
3. Relative imports for same-directory files

**Path Aliases:**
- `@/*` maps to project root directory (configured in `tsconfig.json`)
- Always use `@/` prefix for imports outside the current directory: `import { cn } from '@/lib/utils'`

## Error Handling

**Patterns:**
- Silent try/catch blocks for expected failures (e.g., decoding operations that may fail gracefully)
- Return `null` for failed operations rather than throwing errors when appropriate
- Error boundaries implemented at the app level (`app/error.tsx`)
- Client components handle errors gracefully with fallback UI

## Logging

**Framework:** console
**Patterns:**
- No dedicated logging framework detected
- Console logging used for development debugging
- Production logs rely on Next.js built-in logging capabilities

## Comments

**When to Comment:**
- Public API functions should have JSDoc comments
- Deprecated functions marked with `@deprecated` tag with migration guidance
- Non-obvious logic or workarounds should have explanatory comments
- Avoid redundant comments for self-documenting code

**JSDoc/TSDoc:**
- Used for exported utility functions: `/** @deprecated Use decodeIdentityInfo instead... */`
- Parameter and return type documentation preferred when functionality is not obvious

## Function Design

**Size:**
- Prefer small, single-responsibility functions
- React components are kept focused with clear responsibilities
- Complex logic extracted to utility functions

**Parameters:**
- Prefer named parameters via object destructuring for functions with multiple arguments
- Default parameters used where appropriate
- Type annotations required for all function parameters

**Return Values:**
- Explicit return types preferred for public functions
- Union types used for functions that can return multiple types (e.g., `string | null`)

## Module Design

**Exports:**
- Default exports for React components
- Named exports for utility functions and constants
- Avoid barrel files for simplicity

**Barrel Files:**
- Not detected in the codebase
- Prefer direct imports from specific files

---

*Convention analysis: 2026-03-26*
