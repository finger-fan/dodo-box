import { test as base, type BrowserContext, type Page } from '@playwright/test'
import { ALICE, BOB, type TestIdentity } from './identity.fixture'
import { LoginPage } from '../pages/login.page'
import * as fs from 'fs'
import * as path from 'path'

export interface UserFixture {
  context: BrowserContext
  page: Page
  identity: TestIdentity
}

// Screenshot directory with timestamp for this test run
const runId = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const screenshotDir = path.join('tests', 'e2e', 'screenshots', runId)

let screenshotCounter = 0

export async function screenshot(page: Page, name: string) {
  fs.mkdirSync(screenshotDir, { recursive: true })
  screenshotCounter++
  const paddedIndex = String(screenshotCounter).padStart(2, '0')
  await page.screenshot({
    path: path.join(screenshotDir, `${paddedIndex}-${name}.png`),
    fullPage: true,
  })
}

// Console log collector per user
const consoleLogs: Record<string, string[]> = { alice: [], bob: [] }

function attachConsoleLogger(page: Page, label: string) {
  page.on('console', (msg) => {
    const tag = `[${label}][${msg.type()}] ${msg.text()}`
    consoleLogs[label]?.push(tag)
  })
}

/** Flush collected console logs to a file in the screenshot directory */
export function flushLogs() {
  fs.mkdirSync(screenshotDir, { recursive: true })
  for (const [label, logs] of Object.entries(consoleLogs)) {
    if (logs.length === 0) continue
    fs.writeFileSync(
      path.join(screenshotDir, `console-${label}.log`),
      logs.join('\n') + '\n',
    )
  }
}

/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture `use` is not a React Hook */
export const test = base.extend<{ alice: UserFixture; bob: UserFixture }>({
  alice: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    attachConsoleLogger(page, 'alice')

    // Register and login via UI
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.registerAndLogin(ALICE.username, ALICE.password)

    await use({ context, page, identity: ALICE })
    await context.close()
  },

  bob: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    attachConsoleLogger(page, 'bob')

    // Register and login via UI
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.registerAndLogin(BOB.username, BOB.password)

    await use({ context, page, identity: BOB })
    await context.close()
  },
})
/* eslint-enable react-hooks/rules-of-hooks */

export { expect } from '@playwright/test'
export { screenshot as snap }
