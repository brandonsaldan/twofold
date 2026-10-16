import { expect, test, type Page } from '@playwright/test'

const fixedFiles = /^\/(?:data\/(?:core|text)\.json|_astro\/.+|sw\.js|mark(?:-dark)?\.svg)$/

function sameSiteFixed(urls: string[], origin: string) {
  return urls.filter(url => { const parsed = new URL(url); return parsed.origin !== origin || !fixedFiles.test(parsed.pathname) || parsed.search })
}

async function openSample(page: Page) {
  await page.locator('.hero').getByRole('button', { name: 'Try a sample report' }).click()
  await page.getByRole('button', { name: 'I understand, open the report' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
}

function reportNav(page: Page) {
  return page.getByRole('navigation', { name: 'Report sections' })
}

test('sample report works offline and only reads fixed files', async ({ page, context, baseURL }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await context.setOffline(true)
  await openSample(page)
  await reportNav(page).getByRole('button', { name: /^Findings/ }).click()
  await expect(page.locator('.findings .row').first()).toBeVisible()
  expect(sameSiteFixed(requests, new URL(baseURL!).origin)).toEqual([])
})

test('23andMe format processes offline without new requests', async ({ page, context }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await context.setOffline(true)
  const rows = ['# 23andMe raw data', '# genome build 37', '# rsid chromosome position genotype']
  for (let index = 100000; index < 600000; index += 1) rows.push(`rs${index}\t1\t${index}\tAG`)
  rows.push('rs12913832\t15\t28120472\tGG', 'rs762551\t15\t74749576\tAA', 'rs1801133\t1\t11796321\tGA')
  await page.locator('input[type="file"]').setInputFiles({ name: 'realistic-23andme.txt', mimeType: 'text/plain', buffer: Buffer.from(rows.join('\n')) })
  await page.getByRole('button', { name: 'I understand, open the report' }).click()
  await expect(page.locator('.facts').getByText('23andMe', { exact: true })).toBeVisible()
  await reportNav(page).getByRole('button', { name: /^Findings/ }).click()
  await expect(page.locator('.findings .row').first()).toBeVisible()
  expect(requests).toEqual([])
})

test('the app loads again offline after its first visit', async ({ page, context }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.hero').getByRole('button', { name: 'Try a sample report' })).toBeVisible()
})

test('a report can be encrypted, reopened and deleted locally', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await openSample(page)
  await page.getByRole('button', { name: 'Save on this device' }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill('correct horse battery staple')
  await page.getByLabel('Repeat passphrase').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Save encrypted copy' }).click()
  await expect(page.getByText('Saved. You can unlock it from the start page with this passphrase.')).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Open your saved report' })).toBeVisible()
  await page.getByLabel('Passphrase', { exact: true }).fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByRole('button', { name: 'I understand, open the report' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await page.getByRole('button', { name: 'Saved on this device' }).click()
  await page.getByRole('button', { name: 'Delete saved copy' }).click()
  await expect(page.getByText('The saved copy was deleted from this browser.')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.locator('.rail-actions').getByRole('button', { name: 'Close report' }).click()
  await expect(page.locator('.hero').getByRole('button', { name: 'Try a sample report' })).toBeVisible()
})

test('the acknowledgement shows before every report and details open offline', async ({ page, context }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await context.setOffline(true)
  await page.locator('.hero').getByRole('button', { name: 'Try a sample report' }).click()
  await expect(page.getByText('Twofold makes no guarantee that the report, or any entry in it, is accurate or complete.')).toBeVisible()
  await page.getByRole('button', { name: 'I understand, open the report' }).click()
  await reportNav(page).getByRole('button', { name: /^Findings/ }).click()
  await page.locator('.row-open').first().click()
  await expect(page.getByRole('heading', { name: 'Possible genotypes' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
