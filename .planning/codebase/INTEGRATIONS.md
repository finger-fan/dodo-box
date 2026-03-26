# External Integrations

**Analysis Date:** 2026-03-26

## APIs & External Services

**AI Services:**
- Google Gemini AI - AI features and capabilities
  - SDK/Client: @google/genai ^1.17.0
  - Auth: GEMINI_API_KEY

**Nostr Protocol:**
- Nostr Relays - Decentralized social network relays
  - SDK/Client: @welshman/* ^0.8.9, nostr-tools ^2.23.3
  - Auth: NIP-07 compatible signers / local private key storage

**Mobile Services:**
- Capgo - Over-the-air updates for mobile apps
  - SDK/Client: @capgo/capacitor-updater ^8.43.11
  - Auth: Capgo API key (required for updates)

## Data Storage

**Databases:**
- IndexedDB (client-side)
  - Connection: Browser API via idb ^8.0.3
  - Client: Custom implementation in `lib/welshman/storage.ts`
- localStorage (client-side)
  - Connection: Browser API
  - Usage: Authentication state, user preferences, mock data

**File Storage:**
- Local filesystem only (client-side)
- Capacitor Filesystem API for mobile storage (not yet implemented)

**Caching:**
- None (application-level caching via Welshman store)
- Next.js built-in caching for static assets

## Authentication & Identity

**Auth Provider:**
- Custom (Nostr native)
  - Implementation: Public/private key pairs (secp256k1)
  - Storage: Local encrypted storage via IndexedDB
  - Standard: NIP-01 Nostr identity specification

## Monitoring & Observability

**Error Tracking:**
- None (client-side console logging only)

**Logs:**
- Browser console logging
- No centralized logging service integrated

## CI/CD & Deployment

**Hosting:**
- Not specified (Next.js supports Vercel, Docker, or any Node.js hosting)
- Android APK distribution via custom publishing workflow

**CI Pipeline:**
- None detected (no GitHub Actions, GitLab CI, or similar config found)

## Environment Configuration

**Required env vars:**
- `GEMINI_API_KEY` - Google Gemini AI API key
- `APP_URL` - Application base URL (AI Studio runtime injected)

**Optional env vars:**
- `DISABLE_HMR` - Disable hot module replacement (for AI Studio runtime)
- `BUILD_TARGET` - Set to "capacitor" for mobile builds

**Secrets location:**
- `.env` file (not committed to version control)
- `.env.example` provided as template

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- Nostr relay connections (websocket)
- Gemini API calls (REST)
- Capgo update checks (HTTPS)

---

*Integration audit: 2026-03-26*
