import type { Page } from '@playwright/test'

export class ContactsPage {
  constructor(private readonly page: Page) {}

  /** Navigate to contacts via bottom nav (preserves in-memory session) */
  async navigate() {
    await this.page.locator('nav a[href="/contacts"]').click()
    await this.page.waitForURL('**/contacts', { timeout: 10_000, waitUntil: 'commit' })
  }

  /**
   * Add a contact. Silently succeeds if contact already exists.
   */
  async addContact(pubkeyOrIdentityUrl: string) {
    // Click the add button (Plus icon in header)
    await this.page.locator('button:has(svg.lucide-plus)').click()

    // Wait for modal to appear
    const textarea = this.page.getByPlaceholder(/dodobox:\/\/identity/i)
    await textarea.waitFor({ state: 'visible', timeout: 5_000 })

    // Fill in the contact string
    await textarea.fill(pubkeyOrIdentityUrl)

    // Click Add Contact button
    await this.page.getByRole('button', { name: /add contact/i }).click()

    // Wait a moment for the result
    await this.page.waitForTimeout(2000)

    // Check if "already exists" error appeared (inline error in modal)
    const alreadyExists = await this.page.getByText(/already exists/i).isVisible().catch(() => false)

    if (alreadyExists) {
      // Close modal via the X button (svg.lucide-x inside the modal)
      await this.page.locator('.lucide-x').first().click()
      await this.page.waitForTimeout(500)
    } else {
      // Wait for modal to close (success)
      await textarea.waitFor({ state: 'hidden', timeout: 15_000 })
    }
  }

  async waitForContact(nameOrPubkeyPrefix: string, timeout = 10_000) {
    await this.page.getByText(nameOrPubkeyPrefix).waitFor({ state: 'visible', timeout })
  }
}
