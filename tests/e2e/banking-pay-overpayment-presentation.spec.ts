import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

test('shows the full Eduardo overpayment and its user-friendly constituent breakdown', async ({ page }) => {
  test.setTimeout(120_000);

  const localMainPath = resolve(__dirname, '../../js/main.js');
  const normalTestBackendRequests: string[] = [];
  const unexpectedProductionBackendRequests: string[] = [];
  let interceptedMainUrl = '';

  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('https://test-cloudtms-backend.kier-88a.workers.dev/')) normalTestBackendRequests.push(url);
    if (url.startsWith('https://cloudtms.kier-88a.workers.dev/')) unexpectedProductionBackendRequests.push(url);
  });

  await page.route('**/js/main.js', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'testmode.arthur-rai.co.uk' || url.pathname !== '/js/main.js') {
      await route.continue();
      return;
    }
    interceptedMainUrl = url.href;
    await route.fulfill({
      path: localMainPath,
      contentType: 'application/javascript; charset=utf-8',
      headers: {
        'cache-control': 'no-store',
        'x-codex-local-asset': 'banking-overpayment-presentation'
      }
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  expect(new URL(page.url()).hostname).toBe('testmode.arthur-rai.co.uk');
  expect(interceptedMainUrl).toBe('https://testmode.arthur-rai.co.uk/js/main.js');

  await page.getByRole('button', { name: 'Banking' }).click();
  await page.getByRole('button', { name: 'Pay', exact: true }).click();

  const recoveryRow = page.locator('tr').filter({ hasText: 'CCR-03727' }).first();
  await expect(recoveryRow).toBeVisible({ timeout: 60_000 });
  await expect(recoveryRow).toContainText('OVERPAYMENT RECOVERY');
  await expect(recoveryRow).toContainText('No available funds to recover this yet.');
  await expect(recoveryRow).toContainText('-15.84');
  await expect(recoveryRow).toContainText('Outstanding recovery');
  await expect(recoveryRow).toContainText('Recoverable this pay run: 0.00');
  await expect(recoveryRow).not.toContainText('Accommodation');
  await expect(page.getByText('Live amount -15.84', { exact: true })).toBeVisible();

  const detailRow = recoveryRow.locator('xpath=following-sibling::tr[1]');
  const breakdown = detailRow.locator('details[data-overpayment-recovery-breakdown]');
  await expect(breakdown.getByText('Show overpayment breakdown', { exact: true })).toBeVisible();
  await breakdown.locator('summary').click();
  await expect(breakdown).toContainText('This overpayment is made up of the following amounts.');
  await expect(breakdown.locator('thead')).toContainText('Description');
  await expect(breakdown.locator('thead')).toContainText('Original overpayment');
  await expect(breakdown.locator('thead')).toContainText('Outstanding');
  await expect(breakdown.locator('thead')).toContainText('Recoverable this pay run');

  const componentRows = breakdown.locator('tbody tr');
  await expect(componentRows).toHaveCount(4);
  await expect(componentRows.nth(0)).toContainText('Accommodation');
  await expect(componentRows.nth(0)).toContainText('-2.00');
  await expect(componentRows.nth(1)).toContainText('Travel');
  await expect(componentRows.nth(1)).toContainText('-11.99');
  await expect(componentRows.nth(2)).toContainText('Timesheet pay — 09/06/2026');
  await expect(componentRows.nth(2)).toContainText('-0.98');
  await expect(componentRows.nth(3)).toContainText('Timesheet pay — 10/06/2026');
  await expect(componentRows.nth(3)).toContainText('-0.87');
  await expect(breakdown.locator('tfoot')).toContainText('Total outstanding recovery');
  await expect(breakdown.locator('tfoot')).toContainText('-15.84');
  await expect(breakdown.locator('tfoot')).toContainText('0.00');

  expect(normalTestBackendRequests.length).toBeGreaterThan(0);
  expect(unexpectedProductionBackendRequests).toEqual([]);
});
