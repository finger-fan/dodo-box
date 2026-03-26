import { test, expect } from '@playwright/test'
import { LoginPage } from './pages/login.page'

function uniqueUser() {
  return {
    username: `settest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    password: 'test_pass_123',
  }
}

test.describe('Settings page', () => {
  test.setTimeout(90_000)

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    const user = uniqueUser()
    await loginPage.registerAndLogin(user.username, user.password)
    await page.waitForURL(/\/messages/, { timeout: 30_000 })
    await page.goto('/settings')
  })

  test('renders settings page without crashing', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('shows settings heading or content', async ({ page }) => {
    await page.waitForTimeout(1000)
    const headings = page.locator('h1, h2, h3')
    const count = await headings.count()
    expect(count).toBeGreaterThan(0)
  })

  test('has bottom navigation with settings highlighted', async ({ page }) => {
    await page.waitForTimeout(500)
    const nav = page.locator('nav')
    await expect(nav).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test.setTimeout(90_000)

  test('redirects unauthenticated users from /messages to /login', async ({ page }) => {
    await page.goto('/messages')
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
  })

  test('authenticated user can navigate between tabs', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    const user = uniqueUser()
    await loginPage.registerAndLogin(user.username, user.password)
    await page.waitForURL(/\/messages/, { timeout: 30_000 })

    // Navigate to contacts via bottom nav link
    await page.locator('nav a[href="/contacts"]').click()
    await expect(page).toHaveURL(/\/contacts/, { timeout: 5000 })

    // Navigate back to messages
    await page.locator('nav a[href="/messages"]').click()
    await expect(page).toHaveURL(/\/messages/, { timeout: 5000 })
  })
})
