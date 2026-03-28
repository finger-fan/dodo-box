import { test, expect, Page } from '@playwright/test'

// -- Test data fixtures --

const MULTIPLE_RELEASES = {
  latest: { stable: '1.2.0', beta: '2.0.0-beta.2' },
  releases: [
    { version: '2.0.0-beta.2', channel: 'beta', date: '2026-03-28', versionCode: 5, apk: 'apks/dodo-box-2.0.0-beta.2.apk', bundle: 'updates/2.0.0-beta.2/bundle.zip', notes: 'New discover page' },
    { version: '2.0.0-beta.1', channel: 'beta', date: '2026-03-20', versionCode: 4, apk: 'apks/dodo-box-2.0.0-beta.1.apk', bundle: 'updates/2.0.0-beta.1/bundle.zip', notes: 'Beta testing started' },
    { version: '2.0.0-beta.0', channel: 'beta', date: '2026-03-15', versionCode: 3, apk: 'apks/dodo-box-2.0.0-beta.0.apk', bundle: 'updates/2.0.0-beta.0/bundle.zip', notes: 'Initial beta build' },
    { version: '1.2.0', channel: 'stable', date: '2026-03-27', versionCode: 3, apk: 'apks/dodo-box-1.2.0.apk', bundle: 'updates/1.2.0/bundle.zip', notes: 'Latest stable features' },
    { version: '1.1.0', channel: 'stable', date: '2026-03-15', versionCode: 2, apk: 'apks/dodo-box-1.1.0.apk', bundle: 'updates/1.1.0/bundle.zip', notes: 'Bug fixes and improvements' },
    { version: '1.0.0', channel: 'stable', date: '2026-03-01', versionCode: 1, apk: 'apks/dodo-box-1.0.0.apk', bundle: 'updates/1.0.0/bundle.zip', notes: 'Initial release' },
  ],
}

const STABLE_ONLY = {
  latest: { stable: '1.0.0', beta: '' },
  releases: [
    { version: '1.0.0', channel: 'stable', date: '2026-03-27', versionCode: 1, apk: 'apks/dodo-box-1.0.0.apk', bundle: 'updates/1.0.0/bundle.zip', notes: 'First release' },
    { version: '0.9.0', channel: 'stable', date: '2026-03-15', versionCode: 1, apk: 'apks/dodo-box-0.9.0.apk', bundle: 'updates/0.9.0/bundle.zip', notes: 'Pre-release' },
    { version: '0.8.0', channel: 'stable', date: '2026-03-01', versionCode: 1, apk: 'apks/dodo-box-0.8.0.apk', bundle: 'updates/0.8.0/bundle.zip', notes: 'Early build' },
  ],
}

const EMPTY_RELEASES = { latest: { stable: '', beta: '' }, releases: [] }

const LONG_NOTES = {
  latest: { stable: '1.0.0', beta: '' },
  releases: [
    { version: '1.0.0', channel: 'stable', date: '2026-03-27', versionCode: 1, apk: 'apks/dodo-box-1.0.0.apk', bundle: 'updates/1.0.0/bundle.zip', notes: 'This is a very long release note that definitely exceeds fifty characters in total length' },
  ],
}

// -- Helper --

async function mockVersionsAndGoto(page: Page, data: object | null, status = 200) {
  await page.route('**/versions.json', (route) => {
    if (data === null) {
      return route.abort()
    }
    return route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
    })
  })
  await page.goto('/')
  await page.waitForFunction(() => {
    const container = document.getElementById('versions-container')
    return container && !container.querySelector('.loading')
  })
}

// -- Tests --

test.describe('Landing page - static content', () => {
  test.beforeEach(async ({ page }) => {
    await mockVersionsAndGoto(page, MULTIPLE_RELEASES)
  })

  test('page has correct title', async ({ page }) => {
    await expect(page).toHaveTitle('dodo-box - Privacy-first messaging on Nostr')
  })

  test('hero section renders', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('dodo-box')
    await expect(page.locator('.tagline')).toContainText('Privacy-first messaging')
    await expect(page.locator('.hero .btn-primary')).toContainText('Download APK')
  })

  test('all 6 feature cards render', async ({ page }) => {
    const cards = page.locator('.feature-card')
    await expect(cards).toHaveCount(6)
    await expect(page.locator('.feature-card h3').nth(0)).toHaveText('Vault-Based Identity')
    await expect(page.locator('.feature-card h3').nth(1)).toHaveText('Multi-Account')
    await expect(page.locator('.feature-card h3').nth(2)).toHaveText('Privacy First')
    await expect(page.locator('.feature-card h3').nth(3)).toHaveText('OTA Updates')
    await expect(page.locator('.feature-card h3').nth(4)).toHaveText('Nostr Native')
    await expect(page.locator('.feature-card h3').nth(5)).toHaveText('Mobile Optimized')
  })

  test('footer renders with links', async ({ page }) => {
    const footer = page.locator('.footer')
    await expect(footer).toContainText('dodo-box')
    const links = footer.locator('.footer-links a')
    await expect(links).toHaveCount(3)
  })
})

test.describe('Landing page - stable versions', () => {
  test.beforeEach(async ({ page }) => {
    await mockVersionsAndGoto(page, MULTIPLE_RELEASES)
  })

  test('stable download card shows latest stable info', async ({ page }) => {
    const card = page.locator('#stable-download')
    await expect(card.locator('#stable-version-badge')).toHaveText('v1.2.0')
    await expect(card.locator('#stable-download-meta')).toContainText('Version 1.2.0')
    await expect(card.locator('#stable-download-meta')).toContainText('Build 3')
    await expect(card.locator('#stable-release-notes-text')).toHaveText('Latest stable features')
    await expect(card.locator('#stable-download-link')).toHaveAttribute('href', 'apks/dodo-box-1.2.0.apk')
  })

  test('stable version table renders 3 rows', async ({ page }) => {
    const stableSection = page.locator('.versions-section[data-channel="stable"]')
    const rows = stableSection.locator('tbody tr')
    await expect(rows).toHaveCount(3)
  })

  test('first stable row has latest badge', async ({ page }) => {
    const stableSection = page.locator('.versions-section[data-channel="stable"]')
    const firstRow = stableSection.locator('tbody tr').first()
    await expect(firstRow.locator('.version-badge-small')).toHaveText('latest')
    // Second row should NOT have the badge
    const secondRow = stableSection.locator('tbody tr').nth(1)
    await expect(secondRow.locator('.version-badge-small')).toHaveCount(0)
  })
})

test.describe('Landing page - beta versions', () => {
  test.beforeEach(async ({ page }) => {
    await mockVersionsAndGoto(page, MULTIPLE_RELEASES)
  })

  test('beta download card shows latest beta info', async ({ page }) => {
    const card = page.locator('#beta-download')
    await expect(card.locator('#beta-version-badge')).toHaveText('v2.0.0-beta.2')
    await expect(card.locator('#beta-download-meta')).toContainText('Version 2.0.0-beta.2')
    await expect(card.locator('#beta-download-meta')).toContainText('Build 5')
    await expect(card.locator('#beta-release-notes-text')).toHaveText('New discover page')
    await expect(card.locator('#beta-download-link')).toHaveAttribute('href', 'apks/dodo-box-2.0.0-beta.2.apk')
  })

  test('beta version table renders 3 rows', async ({ page }) => {
    const betaSection = page.locator('.versions-section[data-channel="beta"]')
    const rows = betaSection.locator('tbody tr')
    await expect(rows).toHaveCount(3)
  })

  test('first beta row has latest badge', async ({ page }) => {
    const betaSection = page.locator('.versions-section[data-channel="beta"]')
    const firstRow = betaSection.locator('tbody tr').first()
    await expect(firstRow.locator('.version-badge-small')).toHaveText('latest')
    const secondRow = betaSection.locator('tbody tr').nth(1)
    await expect(secondRow.locator('.version-badge-small')).toHaveCount(0)
  })
})

test.describe('Landing page - mixed scenarios', () => {
  test('stable and beta sections both visible', async ({ page }) => {
    await mockVersionsAndGoto(page, MULTIPLE_RELEASES)
    await expect(page.locator('#stable-download')).toBeVisible()
    await expect(page.locator('#beta-download')).toBeVisible()
    await expect(page.locator('.versions-section[data-channel="stable"]')).toBeVisible()
    await expect(page.locator('.versions-section[data-channel="beta"]')).toBeVisible()
  })

  test('only stable, no beta releases - beta shows empty state', async ({ page }) => {
    await mockVersionsAndGoto(page, STABLE_ONLY)
    // Stable should render normally
    await expect(page.locator('#stable-version-badge')).toHaveText('v1.0.0')
    const stableRows = page.locator('.versions-section[data-channel="stable"] tbody tr')
    await expect(stableRows).toHaveCount(3)
    // Beta download card should show no releases
    await expect(page.locator('#beta-download-meta')).toHaveText('No releases available')
    await expect(page.locator('#beta-download-link')).toBeHidden()
    // Beta version section should show empty message
    await expect(page.locator('.versions-section[data-channel="beta"] .versions-empty')).toContainText('No beta releases found')
  })
})

test.describe('Landing page - edge cases', () => {
  test('empty releases shows empty messages', async ({ page }) => {
    await mockVersionsAndGoto(page, EMPTY_RELEASES)
    await expect(page.locator('#stable-download-meta')).toHaveText('No releases available')
    await expect(page.locator('#beta-download-meta')).toHaveText('No releases available')
    await expect(page.locator('.versions-section[data-channel="stable"] .versions-empty')).toContainText('No stable releases found')
    await expect(page.locator('.versions-section[data-channel="beta"] .versions-empty')).toContainText('No beta releases found')
  })

  test('fetch failure shows error message', async ({ page }) => {
    await mockVersionsAndGoto(page, null, 500)
    await expect(page.locator('#versions-container .error')).toContainText('Error loading versions')
  })

  test('server error shows error message', async ({ page }) => {
    await page.route('**/versions.json', (route) => {
      return route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Internal Server Error',
      })
    })
    await page.goto('/')
    await page.waitForFunction(() => {
      const container = document.getElementById('versions-container')
      return container && !container.querySelector('.loading')
    })
    await expect(page.locator('#versions-container .error')).toContainText('Error loading versions')
  })

  test('long release notes are truncated in table', async ({ page }) => {
    await mockVersionsAndGoto(page, LONG_NOTES)
    const notesCell = page.locator('.versions-section[data-channel="stable"] tbody tr td').nth(3)
    const text = await notesCell.textContent()
    expect(text).toContain('...')
    expect(text!.length).toBeLessThanOrEqual(53) // 50 chars + '...'
  })
})
