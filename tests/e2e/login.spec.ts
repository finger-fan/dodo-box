import { test, expect } from '@playwright/test'
import { clearAuthSession } from './fixtures/auth.fixture'

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthSession(page)
    await page.goto('/login')
  })

  test('shows login and register method cards', async ({ page }) => {
    await expect(page.getByRole('button', { name: /login to account/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /register account/i })).toBeVisible()
  })

  test('clicking login card shows username/password form', async ({ page }) => {
    await page.getByRole('button', { name: /login to account/i }).click()
    await expect(page.getByPlaceholder('Enter username')).toBeVisible()
    await expect(page.getByPlaceholder('Enter password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
  })

  test('submit button is disabled when fields are empty', async ({ page }) => {
    await page.getByRole('button', { name: /login to account/i }).click()
    await expect(page.getByRole('button', { name: 'Login' })).toBeDisabled()
  })

  test('submit button is enabled after entering credentials', async ({ page }) => {
    await page.getByRole('button', { name: /login to account/i }).click()
    await page.getByPlaceholder('Enter username').fill('testuser')
    await page.getByPlaceholder('Enter password').fill('testpass')
    await expect(page.getByRole('button', { name: 'Login' })).toBeEnabled()
  })

  test('clicking register card shows registration form', async ({ page }) => {
    await page.getByRole('button', { name: /register account/i }).click()
    await expect(page.getByPlaceholder('Enter username')).toBeVisible()
    await expect(page.getByPlaceholder('Enter password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Register' })).toBeVisible()
  })

  test('back button returns to method selection', async ({ page }) => {
    await page.getByRole('button', { name: /login to account/i }).click()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('button', { name: /login to account/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /register account/i })).toBeVisible()
  })

  test('login with new account shows error (account not found)', async ({ page }) => {
    await page.getByRole('button', { name: /login to account/i }).click()
    await page.getByPlaceholder('Enter username').fill('nonexistentuser')
    await page.getByPlaceholder('Enter password').fill('wrongpass')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.locator('body')).toContainText(/not found|failed/i, { timeout: 5000 })
  })

  test('register then login succeeds', async ({ page }) => {
    const username = `user_${Date.now()}`

    // Register
    await page.getByRole('button', { name: /register account/i }).click()
    await page.getByPlaceholder('Enter username').fill(username)
    await page.getByPlaceholder('Enter password').fill('pass123')
    await page.getByRole('button', { name: 'Register' }).click()

    // After success, view transitions to login form (same inputs are visible)
    await page.waitForTimeout(1000)

    // Login with the registered account
    await page.getByPlaceholder('Enter username').fill(username)
    await page.getByPlaceholder('Enter password').fill('pass123')
    await page.getByRole('button', { name: 'Login' }).click()

    // Should navigate to messages
    await expect(page).toHaveURL(/\/messages/, { timeout: 5000 })
  })
})
