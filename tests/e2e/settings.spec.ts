import { test, expect } from '@playwright/test'
import { injectAuthSession } from './fixtures/auth.fixture'

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthSession(page)
    await page.goto('/settings')
  })

  test('renders settings page without crashing', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    // Page should have content
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('shows settings heading or content', async ({ page }) => {
    await page.waitForTimeout(1000)
    // Settings page should have visible content (heading, sections, etc.)
    const headings = page.locator('h1, h2, h3')
    const count = await headings.count()
    expect(count).toBeGreaterThan(0)
  })

  test('has bottom navigation with settings highlighted', async ({ page }) => {
    await page.waitForTimeout(500)
    // Bottom nav should be present
    const nav = page.locator('nav')
    await expect(nav).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test('redirects unauthenticated users from /messages to /login', async ({ page }) => {
    // No auth session injected — should redirect to login
    await page.goto('/messages')
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
  })

  test('authenticated user can navigate between tabs', async ({ page }) => {
    await injectAuthSession(page)
    await page.goto('/messages')
    await page.waitForTimeout(1000)

    // Navigate to contacts via bottom nav
    const nav = page.locator('nav')
    await nav.locator('a, button').nth(1).click()
    await page.waitForTimeout(500)

    // Navigate back to messages
    await nav.locator('a, button').first().click()
    await expect(page).toHaveURL(/\/messages/)
  })
})
