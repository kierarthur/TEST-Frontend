import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

test('a refreshed planned Manual week exposes Edit without weakening real-timesheet lifecycle gates', async ({ page }) => {
  const localFiles = new Map([
    ['/index.html', resolve(__dirname, '../../index.html')],
    ['/js/main.js', resolve(__dirname, '../../js/main.js')]
  ]);
  const localMainHash = createHash('sha256')
    .update(readFileSync(localFiles.get('/js/main.js')!))
    .digest('hex');
  const intercepted = new Set<string>();

  await page.route('https://testmode.arthur-rai.co.uk/**', async (route) => {
    const url = new URL(route.request().url());
    const key = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = localFiles.get(key);
    if (!file) return route.continue();
    intercepted.add(key);
    let body = readFileSync(file);
    if (key === '/index.html') {
      body = Buffer.from(body.toString('utf8').replace(
        '</head>',
        `<script>window.__PLANNED_MANUAL_EDIT_PATCH__=${JSON.stringify(localMainHash)};</script></head>`
      ));
    }
    return route.fulfill({
      status: 200,
      body,
      contentType: key.endsWith('.js') ? 'application/javascript' : 'text/html'
    });
  });

  await page.goto('/');
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  expect(intercepted.has('/index.html')).toBe(true);
  expect(intercepted.has('/js/main.js')).toBe(true);
  expect(await page.evaluate(() => (window as any).__PLANNED_MANUAL_EDIT_PATCH__)).toBe(localMainHash);

  await page.getByRole('button', { name: '🗒️ Timesheets' }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  const row = page.getByRole('row', {
    name: /12\/07\/2026 Sarah Dumbuya Whittington Health Weekly HealthRoster/
  });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.dblclick();

  await expect(page.getByRole('dialog').filter({ hasText: 'Sarah Dumbuya' })).toBeVisible();
  await expect(page.locator('#btnEditModal')).toBeVisible();
  await expect(page.locator('#btnEditModal')).toBeEnabled();
});
