import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const origin = 'https://testmode.arthur-rai.co.uk';
const root = resolve(__dirname, '../..');
const useLocalMain = process.env.CLOUDTMS_LOCAL_MAIN === '1';
const localIndex = useLocalMain ? readFileSync(resolve(root, 'index.html'), 'utf8') : '';
const localMain = useLocalMain ? readFileSync(resolve(root, 'js/main.js'), 'utf8') : '';

test.use({
  serviceWorkers: 'block',
  storageState: process.env.E2E_STORAGE_STATE_PATH || 'tests/e2e/.auth/user.json'
});

async function openTimesheets(page: Page) {
  if (useLocalMain) {
    await page.route(`${origin}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return route.fulfill({ body: localIndex, contentType: 'text/html; charset=utf-8', headers: { 'cache-control': 'no-store' } });
      }
      if (url.pathname === '/js/main.js') {
        return route.fulfill({ body: localMain, contentType: 'application/javascript; charset=utf-8', headers: { 'cache-control': 'no-store' } });
      }
      return route.continue();
    });
  }

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
  await page.getByRole('button', { name: /Timesheets$/ }).click();
  await expect(page.getByRole('button', { name: 'Bulk Process', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
}

for (const workbench of ['Bulk Process', 'Bulk Authorise']) {
  test(`${workbench} opens from the Timesheets action panel`, async ({ page }) => {
    test.setTimeout(180_000);
    await openTimesheets(page);
    await page.getByRole('button', { name: workbench, exact: true }).click();
    await expect(page.locator('#modalTitle')).toHaveText(workbench, { timeout: 15_000 });
    await expect(page.locator('#modal')).toBeVisible();
  });
}

test('Bulk Authorise paints its shell while the saved-preference read is still pending', async ({ page }) => {
  test.skip(!useLocalMain, 'local source timing regression');
  test.setTimeout(180_000);
  await openTimesheets(page);
  await page.evaluate(() => { (window as any).__gridPrefs = null; });
  await page.route('**/api/users/me/grid-prefs', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.fulfill({ json: { grid: {} } });
  });

  await page.getByRole('button', { name: 'Bulk Authorise', exact: true }).click();
  await expect(page.locator('#modalTitle')).toHaveText('Bulk Authorise', { timeout: 1_500 });
  await expect(page.locator('#modal')).toBeVisible();
});

test('Bulk Process paints its shell while its dataset read is still pending', async ({ page }) => {
  test.skip(!useLocalMain, 'local source timing regression');
  test.setTimeout(180_000);
  await openTimesheets(page);
  await page.route('**/api/timesheets/bulk-process-dataset**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.fulfill({ json: { rows: [], counts: {} } });
  });

  await page.getByRole('button', { name: 'Bulk Process', exact: true }).click();
  await expect(page.locator('#modalTitle')).toHaveText('Bulk Process', { timeout: 1_500 });
  await expect(page.locator('#modal')).toBeVisible();
});
