import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/login')
    await this.page.waitForLoadState('networkidle')
  }

  /**
   * Register a new account. If account already exists, returns false (caller should login directly).
   */
  async register(username: string, password: string): Promise<boolean> {
    await this.page.getByRole('button', { name: /register account/i }).click()
    await this.page.getByPlaceholder('Enter username').fill(username)
    await this.page.getByPlaceholder('Enter password').fill(password)
    await this.page.getByRole('button', { name: 'Register' }).click()

    // Wait for either: success ("Account Login" heading) or error toast ("already exists")
    const loginHeading = this.page.getByText('Account Login')
    const errorToast = this.page.getByText(/already exists|failed/i)

    const result = await Promise.race([
      loginHeading.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'success' as const),
      errorToast.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'exists' as const),
    ])

    if (result === 'exists') {
      // Go back to initial view, then login directly
      await this.page.getByRole('button', { name: 'Back' }).click()
      return false
    }
    return true
  }

  async login(username: string, password: string) {
    // If we're on the initial view, click login card first
    const loginCard = this.page.getByRole('button', { name: /login to account/i })
    if (await loginCard.isVisible().catch(() => false)) {
      await loginCard.click()
    }

    // Wait for the form to be visible
    await this.page.getByPlaceholder('Enter username').waitFor({ state: 'visible', timeout: 5_000 })

    await this.page.getByPlaceholder('Enter username').fill(username)
    await this.page.getByPlaceholder('Enter password').fill(password)

    // Wait for button to be enabled then click
    const loginBtn = this.page.getByRole('button', { name: 'Login' })
    await expect(loginBtn).toBeEnabled({ timeout: 3_000 })

    // Retry login up to 3 times — vault fetch from relay can be slow after fresh registration
    for (let attempt = 0; attempt < 3; attempt++) {
      await loginBtn.click()

      // Race: either navigation succeeds or an error toast appears
      const navPromise = this.page.waitForURL(/\/messages/, {
        timeout: 15_000, waitUntil: 'commit',
      }).then(() => 'navigated' as const)

      const errorPromise = this.page.getByText(/not found|failed|no relay/i)
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => 'error' as const)

      const outcome = await Promise.race([navPromise, errorPromise]).catch(() => 'timeout' as const)

      if (outcome === 'navigated') return

      // Login failed or timed out — wait briefly for relay to sync, then retry
      console.log(`[LoginPage] login attempt ${attempt + 1} failed (${outcome}), retrying...`)
      await this.page.waitForTimeout(2_000)
    }

    // Final attempt with longer timeout
    await loginBtn.click()
    await this.page.waitForURL(/\/messages/, { timeout: 30_000, waitUntil: 'commit' })
  }

  async registerAndLogin(username: string, password: string) {
    const registered = await this.register(username, password)
    if (!registered) {
      // Account already exists from a previous test — just login
    }
    await this.login(username, password)
  }
}
