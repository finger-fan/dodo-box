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
   * Open a chat by clicking a contact in the messages list.
   * (Contacts were merged into the messages page; each contact is a chat item.)
   * @param contactLabel - Contact name (e.g. "Bob") used to locate the chat item by its visible text
   */
  async openChatViaContacts(contactLabel: string) {
    // Contacts now live on the messages page
    await this.navigate()

    // Wait for contacts/chats to load
    await this.page.waitForTimeout(2000)

    // Find the chat item whose visible text contains the contact name
    const item = this.page
      .locator('[data-testid="chat-item"]')
      .filter({ hasText: contactLabel })
      .first()
    await item.waitFor({ state: 'visible', timeout: 10_000 })

    // Use force:true to bypass Framer Motion drag handler on SwipeableListItem
    await item.click({ force: true })

    // Wait for navigation to chat page (client-side)
    await this.page.waitForURL(/\/chat\?peer=/, { timeout: 15_000, waitUntil: 'commit' })

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
