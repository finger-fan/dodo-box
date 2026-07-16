import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class MessagesPage {
  constructor(private readonly page: Page) {}

  /** Navigate to messages via bottom nav (preserves in-memory session) */
  async navigate() {
    await this.page.locator('nav a[href="/messages"]').click()
    await this.page.waitForURL('**/messages', { timeout: 10_000, waitUntil: 'commit' })
  }

  /**
   * Open a chat by navigating to contacts and clicking a contact.
   * @param contactLabel - Contact name (e.g. "Bob") or pubkey prefix to locate the row
   */
  async openChatViaContacts(contactLabel: string) {
    // Navigate to contacts via bottom nav
    await this.page.locator('nav a[href="/contacts"]').click()
    await this.page.waitForURL('**/contacts', { timeout: 10_000, waitUntil: 'commit' })

    // Wait for contacts to load
    await this.page.waitForTimeout(2000)

    // Find the contact row by name or pubkey prefix shown in the contact list.
    // Contact structure: font-semibold (name), font-mono (pubkey prefix)
    // Try name first (font-semibold), then fall back to pubkey prefix (font-mono)
    const nameEl = this.page.locator(`.font-semibold:has-text("${contactLabel}")`)
    const monoEl = this.page.locator(`.font-mono:has-text("${contactLabel}")`)

    let targetEl = nameEl
    if (await nameEl.isVisible().catch(() => false)) {
      targetEl = nameEl
    } else {
      targetEl = monoEl
    }
    await targetEl.waitFor({ state: 'visible', timeout: 10_000 })

    // Click the parent clickable div (two levels up: font-semibold > div.flex-1 > div[onClick])
    // Use force:true to bypass Framer Motion drag handler on SwipeableListItem
    await targetEl.locator('..').locator('..').click({ force: true })

    // Wait for navigation to chat page (client-side)
    await this.page.waitForURL(/\/messages\//, { timeout: 15_000, waitUntil: 'commit' })

    // Wait for the chat view to load
    await this.page.locator('[data-testid="message-input"]').waitFor({
      state: 'visible',
      timeout: 15_000,
    })

    // Allow relay WebSocket connection to establish before sending
    await this.page.waitForTimeout(2000)
  }

  async sendMessage(text: string) {
    const input = this.page.locator('[data-testid="message-input"]')
    await input.fill(text)
    await this.page.locator('[data-testid="send-btn"]').click()

    // Wait for the message to appear in the chat (optimistic update)
    await expect(this.page.locator(`text="${text}"`)).toBeVisible({ timeout: 10_000 })

    // If message shows as failed (red X), retry once
    const failedIndicator = this.page.locator('button[title="Tap to retry"]').first()
    if (await failedIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      await failedIndicator.click()
      // Wait for retry to complete
      await this.page.waitForTimeout(3000)
    }
  }

  async waitForMessage(text: string, timeout = 15_000) {
    await expect(this.page.locator(`text="${text}"`)).toBeVisible({ timeout })
  }

  /**
   * Click any visible "Tap to recover" gap indicators and wait for recovery.
   * Returns the number of gaps recovered.
   */
  async recoverGaps(maxAttempts = 3): Promise<number> {
    let totalRecovered = 0
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const gapButtons = this.page.locator('button:has-text("may be missing")')
      const count = await gapButtons.count()
      if (count === 0) break

      for (let i = 0; i < count; i++) {
        const btn = gapButtons.nth(i)
        if (await btn.isVisible().catch(() => false)) {
          await btn.click()
          totalRecovered++
          // Wait for recovery to complete (button text changes or disappears)
          await btn.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
        }
      }
      // Brief pause before checking for more gaps
      await this.page.waitForTimeout(1000)
    }
    return totalRecovered
  }
}
