import { test, expect } from '@playwright/test'
import { injectAuthSession } from './fixtures/auth.fixture'

test.describe('Messages page', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthSession(page)
    await page.goto('/messages')
  })

  test('shows chat list with items', async ({ page }) => {
    await expect(
      page.locator('button').filter({ hasText: 'Alice' }).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('displays at least one mock chat', async ({ page }) => {
    const chatItems = page.locator('button').filter({ hasText: /Alice|Bob|Charlie/ })
    await expect(chatItems.first()).toBeVisible({ timeout: 5000 })
    const count = await chatItems.count()
    expect(count).toBeGreaterThan(0)
  })

  test('has search button in header', async ({ page }) => {
    await expect(page.locator('header button')).toBeVisible()
  })

  test('clicking a chat navigates to chat detail', async ({ page }) => {
    await page.locator('button').filter({ hasText: 'Alice' }).first().click()
    await expect(page).toHaveURL(/\/messages\/.+/, { timeout: 3000 })
  })
})

test.describe('Chat detail page', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthSession(page)
    // Navigate to Alice's chat (mock pubkey is 'a'.repeat(64))
    await page.goto(`/messages/${'a'.repeat(64)}`)
  })

  test('shows message input field', async ({ page }) => {
    await expect(page.locator('textarea.msg-input')).toBeVisible({ timeout: 5000 })
  })

  test('shows send button', async ({ page }) => {
    await expect(page.locator('button.send-btn')).toBeVisible({ timeout: 5000 })
  })

  test('send button is disabled when input is empty', async ({ page }) => {
    await expect(page.locator('button.send-btn')).toBeDisabled({ timeout: 5000 })
  })

  test('can type a message and send button becomes active', async ({ page }) => {
    await page.locator('textarea.msg-input').fill('Hello from E2E test!')
    await expect(page.locator('button.send-btn')).toBeEnabled()
  })

  test('sends a message and it appears in the chat', async ({ page }) => {
    const messageText = `E2E test message ${Date.now()}`
    await page.locator('textarea.msg-input').fill(messageText)
    await page.locator('button.send-btn').click()
    await expect(page.locator(`text="${messageText}"`)).toBeVisible({ timeout: 3000 })
  })

  test('shows back button to return to messages list', async ({ page }) => {
    await expect(page.locator('button').first()).toBeVisible()
  })
})
