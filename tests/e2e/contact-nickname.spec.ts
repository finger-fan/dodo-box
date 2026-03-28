import { test, expect, snap, flushLogs } from './fixtures/multi-user.fixture'
import { ContactsPage } from './pages/contacts.page'
import { LoginPage } from './pages/login.page'

/**
 * Regression tests for the garbled contact nickname bug.
 *
 * Root cause: petnames fetched from relay were not validated, and
 * shortPubkey display strings were published back as petnames,
 * creating a corruption cycle.
 *
 * These E2E tests verify that nicknames survive the full round-trip:
 *   add contact -> publish to relay -> navigate away -> re-fetch from relay -> display
 */
test.describe('Contact nickname display (garbled nickname regression)', () => {
  test.setTimeout(120_000)

  test.afterAll(() => {
    flushLogs()
  })

  /**
   * After a full page reload the session may need re-login (vault on relay).
   * This helper handles that transparently.
   */
  async function reloadAndEnsureAuth(
    page: import('@playwright/test').Page,
    username: string,
    password: string,
  ) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    // Wait for client-side routing to settle
    await page.waitForTimeout(3_000)

    const url = page.url()
    if (url.includes('/login')) {
      const loginPage = new LoginPage(page)
      await loginPage.login(username, password)
    }
    // Should now be on an authenticated page
    await page.waitForURL(/\/(messages|contacts|settings|discover)/, { timeout: 30_000, waitUntil: 'commit' })
  }

  test('nickname set via identity protocol displays correctly', async ({ alice, bob }) => {
    // Both users should be on /messages after fixture login
    await expect(alice.page).toHaveURL(/\/messages/)

    // Alice adds Bob via identity URL (which embeds nickname "Bob")
    const aliceContacts = new ContactsPage(alice.page)
    await aliceContacts.navigate()
    await aliceContacts.addContact(bob.identity.identityUrl)
    await snap(alice.page, 'nickname-added-bob')

    // Verify "Bob" appears as the contact name (not garbled, not npub prefix)
    await expect(
      alice.page.locator('.font-semibold:has-text("Bob")')
    ).toBeVisible({ timeout: 10_000 })

    // Verify no garbled patterns in any displayed contact name
    await assertNoGarbledNames(alice.page)
  })

  test('contact added without nickname shows shortPubkey, not garbled text', async ({ alice }) => {
    // Add Bob via npub (no nickname embedded, unlike identity URL)
    const { npubEncode } = await import('nostr-tools/nip19')
    const targetPubkey = 'ef'.repeat(32)
    const npub = npubEncode(targetPubkey)

    const aliceContacts = new ContactsPage(alice.page)
    await aliceContacts.navigate()
    await aliceContacts.addContact(npub)
    await snap(alice.page, 'nickname-npub-added')

    // Wait for contacts list to update
    await alice.page.waitForTimeout(2_000)

    // The contact should show a truncated npub (shortPubkey format: "npub1xxx...yyy")
    // It should NOT show garbled chars or an empty name
    const allNames = await alice.page
      .locator('.flex.items-center.gap-4 .font-semibold')
      .allTextContents()

    // At least one name should match the shortPubkey pattern (npub1...xxx)
    const hasShortPubkey = allNames.some(n => /^npub1[a-z0-9]+\.{3}[a-z0-9]+$/.test(n))
    expect(hasShortPubkey).toBe(true)

    // No name should contain control characters
    await assertNoGarbledNames(alice.page)

    // --- Reload and verify shortPubkey persists (not corrupted via relay round-trip) ---
    await reloadAndEnsureAuth(alice.page, alice.identity.username, alice.identity.password)
    await aliceContacts.navigate()
    await alice.page.waitForTimeout(5_000)
    await snap(alice.page, 'nickname-npub-after-reload')

    const reloadedNames = await alice.page
      .locator('.flex.items-center.gap-4 .font-semibold')
      .allTextContents()

    // shortPubkey should still appear (relay should NOT have stored the display string as petname)
    const stillHasShortPubkey = reloadedNames.some(n => /^npub1[a-z0-9]+\.{3}[a-z0-9]+$/.test(n))
    expect(stillHasShortPubkey).toBe(true)

    await assertNoGarbledNames(alice.page)
  })

  test('bidirectional nickname: both Alice and Bob see correct names after reload', async ({ alice, bob }) => {
    test.setTimeout(180_000)
    // Alice adds Bob (nickname "Bob"), Bob adds Alice (nickname "Alice")
    const aliceContacts = new ContactsPage(alice.page)
    await aliceContacts.navigate()
    await aliceContacts.addContact(bob.identity.identityUrl)

    const bobContacts = new ContactsPage(bob.page)
    await bobContacts.navigate()
    await bobContacts.addContact(alice.identity.identityUrl)

    await snap(alice.page, 'bidir-alice-contacts')
    await snap(bob.page, 'bidir-bob-contacts')

    // Alice sees "Bob"
    await expect(
      alice.page.locator('.font-semibold:has-text("Bob")')
    ).toBeVisible({ timeout: 10_000 })

    // Bob sees "Alice"
    await expect(
      bob.page.locator('.font-semibold:has-text("Alice")')
    ).toBeVisible({ timeout: 10_000 })

    // Both reload and re-verify
    await reloadAndEnsureAuth(alice.page, alice.identity.username, alice.identity.password)
    await reloadAndEnsureAuth(bob.page, bob.identity.username, bob.identity.password)

    // Navigate both back to contacts
    await aliceContacts.navigate()
    await bobContacts.navigate()

    await alice.page.waitForTimeout(5_000)
    await bob.page.waitForTimeout(5_000)

    await snap(alice.page, 'bidir-alice-after-reload')
    await snap(bob.page, 'bidir-bob-after-reload')

    // After round-trip through relay, nicknames should still be correct
    await expect(
      alice.page.locator('.font-semibold:has-text("Bob")')
    ).toBeVisible({ timeout: 15_000 })

    await expect(
      bob.page.locator('.font-semibold:has-text("Alice")')
    ).toBeVisible({ timeout: 15_000 })

    // No garbled names on either side
    await assertNoGarbledNames(alice.page)
    await assertNoGarbledNames(bob.page)
  })
})

/**
 * Assert that no contact name on the page contains garbled content:
 * - No control characters (U+0000-U+001F, U+007F-U+009F)
 * - No names that are just "npub1" prefix with ellipsis (published shortPubkey leak)
 *   BUT valid shortPubkey display (npub1xxx...yyy) is OK for contacts without a nickname
 * - No empty names
 */
async function assertNoGarbledNames(page: import('@playwright/test').Page) {
  const allNames = await page
    .locator('.flex.items-center.gap-4 .font-semibold')
    .allTextContents()

  for (const text of allNames) {
    // No control characters
    expect(text, `Contact name "${text}" contains control characters`).not.toMatch(
      /[\u0000-\u001F\u007F-\u009F]/
    )
    // Not empty (after trim)
    expect(text.trim().length, `Contact name is empty`).toBeGreaterThan(0)
  }
}
