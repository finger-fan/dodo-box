# Technology Stack

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- TypeScript 5.9.3 - Used for all application code (React components, business logic, utilities)
- React 19.2.1 - UI components (JSX/TSX)

**Secondary:**
- CSS - Tailwind CSS v4 styles
- JSON - Configuration, translation files, and data schemas

## Runtime

**Environment:**
- Node.js 22.15.0

**Package Manager:**
- pnpm 10.20.0
- Lockfile: present (pnpm-lock.yaml)

## Frameworks

**Core:**
- Next.js 15.4.9 - Full-stack React framework with App Router
- React 19.2.1 - UI library
- Tailwind CSS 4.1.11 - Utility-first CSS framework

**Testing:**
- Vitest 4.1.0 - Unit and integration testing
- Playwright 1.58.2 - End-to-end testing
- @testing-library/react 16.3.2 - React component testing utilities

**Build/Dev:**
- Vite 6 (via Vitest) - Test runner and bundler
- PostCSS 8.5.6 - CSS processing
- TypeScript 5.9.3 - Static type checking
- ESLint 9.39.1 - Code linting

## Key Dependencies

**Critical:**
- @welshman/* 0.8.9 - Nostr protocol implementation suite (app, lib, net, router, signer, store, util)
- nostr-tools 2.23.3 - Nostr protocol utilities
- @noble/curves 1.9.7 - Cryptographic primitives for Nostr
- next-themes 0.4.6 - Dark/light theme management
- i18next 25.8.18 - Internationalization framework
- motion 12.23.24 - Animation library (Framer Motion)

**UI Components:**
- lucide-react 0.553.0 - Icon library
- clsx 2.1.1 + tailwind-merge 3.3.1 - Class name utilities
- class-variance-authority 0.7.1 - Component variant management

**Infrastructure:**
- @capacitor/core 8.2.0 - Mobile app runtime (Android)
- idb 8.0.3 - IndexedDB wrapper for client-side storage
- @google/genai 1.17.0 - Google Gemini AI API client
- @capgo/capacitor-updater 8.43.11 - Over-the-air updates for Capacitor

## Configuration

**Environment:**
- Environment variables loaded from .env files
- Key configs required: GEMINI_API_KEY, APP_URL, DISABLE_HMR (optional)

**Build:**
- `next.config.ts` - Next.js configuration
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `postcss.config.js` - PostCSS configuration
- `vitest.config.ts` - Test configuration
- `playwright.config.ts` - E2E test configuration
- `eslint.config.mjs` - Linting configuration

## Platform Requirements

**Development:**
- Node.js 22+
- pnpm 10+
- Android Studio (for Capacitor builds)

**Production:**
- Deployment target: Node.js runtime (web) / Android 10+ (mobile)
- Docker container support via provided Dockerfile

---

*Stack analysis: 2026-03-26*
