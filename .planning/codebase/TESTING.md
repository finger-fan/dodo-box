# Testing Patterns

**Analysis Date:** 2026-03-26

## Test Framework

**Runner:**
- Vitest 4.1.0 for unit and integration tests
- Config: `vitest.config.ts`
- Playwright 1.58.2 for E2E tests
- Config: `playwright.config.ts`

**Assertion Library:**
- Built-in Vitest `expect` assertions
- Playwright `expect` for E2E tests
- @testing-library/jest-dom for DOM assertions

**Run Commands:**
```bash
pnpm test              # Run all unit and integration tests
pnpm test:watch        # Run tests in watch mode
pnpm test:coverage     # Run tests with coverage report
pnpm test:e2e          # Run E2E tests
pnpm test:all          # Run all test types (unit + integration + E2E)
```

## Test File Organization

**Location:**
- Tests are located in a separate top-level `tests/` directory, not co-located with source code
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`

**Naming:**
- Unit/integration tests: `[module-name].test.{ts,tsx}`
- E2E tests: `[feature-name].spec.ts`

**Structure:**
```
tests/
├── unit/
│   ├── hooks/          # Hook tests
│   └── lib/            # Utility/library tests
├── integration/
│   ├── contexts/       # Context provider tests
│   └── hooks/          # Integration hook tests
└── e2e/
    └── fixtures/       # E2E test fixtures
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'vitest'
import { functionToTest } from '@/path/to/module'

describe('functionToTest', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test'

    // Act
    const result = functionToTest(input)

    // Assert
    expect(result).toBe(expectedValue)
  })
})
```

**Patterns:**
- `describe` blocks group related tests by module or function
- `it` blocks describe specific test cases in natural language
- Arrange-Act-Assert pattern followed consistently
- `beforeEach`/`afterEach` used for common setup/teardown

## Mocking

**Framework:** Vitest built-in mocking
**Patterns:**
```typescript
import { vi } from 'vitest'

vi.mock('@/path/to/dependency', () => ({
  dependencyFunction: vi.fn().mockReturnValue('mocked value')
}))
```

**What to Mock:**
- External API calls and network requests
- Third-party library functions that have side effects
- Browser APIs not available in test environment
- Complex dependencies that are not the subject of the test

**What NOT to Mock:**
- Utility functions that are pure and have no side effects
- Core business logic being tested
- Simple dependencies that are easy to include

## Fixtures and Factories

**Test Data:**
- Simple test data defined inline in test files
- Shared fixtures for E2E tests located in `tests/e2e/fixtures/`
- Example fixture: `clearAuthSession()` helper for authentication tests

**Location:**
- E2E fixtures: `tests/e2e/fixtures/`
- Unit test data typically defined in test files directly

## Coverage

**Requirements:**
- Minimum coverage thresholds enforced:
  - Lines: 80%
  - Functions: 80%
  - Branches: 75%
- Coverage reports generated in text, lcov, and HTML formats

**View Coverage:**
```bash
pnpm test:coverage
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, utilities, and hooks in isolation
- Approach: Test all edge cases and input variations
- Environment: jsdom for React-related code, node for pure utilities

**Integration Tests:**
- Scope: Interaction between multiple modules, hooks with context, components
- Approach: Test how modules work together
- Environment: jsdom

**E2E Tests:**
- Framework: Playwright with Chromium
- Scope: Full application flows from user perspective
- Approach: Test critical user journeys and interactions
- Run against local development server

## Common Patterns

**Async Testing:**
```typescript
it('handles async operations', async () => {
  const result = await asyncFunction()
  expect(result).toBe(expected)
})
```

**Error Testing:**
```typescript
it('throws error for invalid input', () => {
  expect(() => functionThatThrows('invalid')).toThrow('Error message')
})

// For async functions
it('rejects with error for invalid input', async () => {
  await expect(asyncFunctionThatThrows('invalid')).rejects.toThrow('Error message')
})
```

---

*Testing analysis: 2026-03-26*
