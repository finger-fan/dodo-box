import type { Page } from '@playwright/test'

const ALICE_PUBKEY = 'a'.repeat(64)

export const AUTH_SESSION = {
  isAuthenticated: true,
  username: 'testuser',
  currentPubkey: ALICE_PUBKEY,
  masterPubkey: ALICE_PUBKEY,
  vaultData: null,
}

/**
 * Inject authenticated session into localStorage before page load.
 * Must be called before page.goto().
 */
export async function injectAuthSession(page: Page): Promise<void> {
  await page.addInitScript((session) => {
    localStorage.setItem('dodobox_session', JSON.stringify(session))
    // App defaults to Chinese; force English so text-based selectors stay valid
    localStorage.setItem('dodobox_language', 'en')
  }, AUTH_SESSION)
}

/**
 * Clear auth session from localStorage.
 */
export async function clearAuthSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('dodobox_session')
    // App defaults to Chinese; force English so text-based selectors stay valid
    localStorage.setItem('dodobox_language', 'en')
  })
}
