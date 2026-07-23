import { test, expect } from '@playwright/test'
import { LoginPage } from './pages/login.page'

function uniqueUser() {
  return {
    username: `msgtest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    password: 'test_pass_123',
  }
}

test.describe('Messages page', () => {
  test.setTimeout(90_000)

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    const user = uniqueUser()
    await loginPage.registerAndLogin(user.username, user.password)
    await page.waitForURL(/\/messages/, { timeout: 30_000 })
  })

  test('shows messages page with header', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible({ timeout: 5000 })
  })

  test('displays empty chat list for new user', async ({ page }) => {
    const chatItems = page.locator('[data-testid="chat-item"]')
    const count = await chatItems.count()
    expect(count).toBe(0)
  })

  test('has search button in header', async ({ page }) => {
    await expect(page.locator('header button')).toBeVisible()
  })

  test('has bottom navigation', async ({ page }) => {
    await expect(page.locator('nav')).toBeVisible()
    await expect(page.locator('nav a[href="/messages"]')).toBeVisible()
    await expect(page.locator('nav a[href="/contacts"]')).toBeVisible()
    await expect(page.locator('nav a[href="/settings"]')).toBeVisible()
  })
})

test.describe('Chat detail page', () => {
  test.setTimeout(90_000)

  const fakePubkey = 'a'.repeat(64)

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    const user = uniqueUser()
    await loginPage.registerAndLogin(user.username, user.password)
    await page.waitForURL(/\/messages/, { timeout: 30_000 })
    await page.goto(`/chat?peer=${fakePubkey}`)
  })

  test('shows message input field', async ({ page }) => {
    await expect(page.locator('[data-testid="message-input"]')).toBeVisible({ timeout: 5000 })
  })

  test('shows send button', async ({ page }) => {
    await expect(page.locator('[data-testid="send-btn"]')).toBeVisible({ timeout: 5000 })
  })

  test('send button is disabled when input is empty', async ({ page }) => {
    await expect(page.locator('[data-testid="send-btn"]')).toBeDisabled({ timeout: 5000 })
  })

  test('can type a message and send button becomes active', async ({ page }) => {
    await page.locator('[data-testid="message-input"]').fill('Hello from E2E test!')
    await expect(page.locator('[data-testid="send-btn"]')).toBeEnabled()
  })

  test('shows back button to return to messages list', async ({ page }) => {
    await expect(page.locator('button').first()).toBeVisible()
  })
})
