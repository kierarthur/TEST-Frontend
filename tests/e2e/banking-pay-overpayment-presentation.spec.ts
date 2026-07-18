import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

test('shows each Eduardo recovery once, blocks it without pay headroom, and preserves its constituent breakdown', async ({ page }) => {
  test.setTimeout(120_000);

  const localMainPath = resolve(__dirname, '../../js/main.js');
  const normalTestBackendRequests: Array<{ at: number; method: string; pathname: string }> = [];
  const unexpectedProductionBackendRequests: string[] = [];
  let interceptedMainUrl = '';

  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('https://test-cloudtms-backend.kier-88a.workers.dev/')) {
      normalTestBackendRequests.push({
        at: Date.now(),
        method: request.method(),
        pathname: new URL(url).pathname
      });
    }
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

  const bankingModal = page.locator('#modal');
  await expect(bankingModal).toBeVisible({ timeout: 60_000 });
  const readyCard = bankingModal.locator('.card').filter({ hasText: 'Ready to Pay' }).first();
  await expect(readyCard).toContainText('Ready to Pay 0 candidate(s) 0 line(s) Amount 0.00');
  await expect(bankingModal).not.toContainText('Preparing…');
  await expect(bankingModal).not.toContainText('Refreshing');
  await expect(bankingModal).not.toContainText('Refresh failed');

  const eduardoRecoveryRows = bankingModal.locator('tr').filter({ hasText: 'CCR-03727' });
  await expect(eduardoRecoveryRows).toHaveCount(2);

  const recoveryRow = eduardoRecoveryRows.filter({ hasText: '12/07/2026' });
  await expect(recoveryRow).toHaveCount(1);
  await expect(recoveryRow).toBeVisible();
  await expect(recoveryRow).toContainText('OVERPAYMENT RECOVERY');
  await expect(recoveryRow).toContainText('No available funds to recover this yet.');
  await expect(recoveryRow).toContainText('-56.25');
  await expect(recoveryRow).toContainText('Outstanding recovery');
  await expect(recoveryRow).toContainText('Recoverable this pay run: 0.00');
  await expect(recoveryRow).toContainText('Blocked for pay');
  await expect(recoveryRow).not.toContainText('Ready to pay');
  await expect(recoveryRow).not.toContainText('Timesheet pay — 06/07/2026');
  await expect(bankingModal.getByText('Live amount -72.09', { exact: true })).toBeVisible();

  const olderRecoveryRow = eduardoRecoveryRows.filter({ hasText: '14/06/2026' });
  await expect(olderRecoveryRow).toHaveCount(1);
  await expect(olderRecoveryRow).toContainText('-15.84');
  await expect(olderRecoveryRow).toContainText('Recoverable this pay run: 0.00');
  await expect(olderRecoveryRow).toContainText('Blocked for pay');

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
  await expect(componentRows).toHaveCount(5);
  for (const [index, date] of ['06/07/2026', '07/07/2026', '08/07/2026', '09/07/2026', '10/07/2026'].entries()) {
    await expect(componentRows.nth(index)).toContainText(`Timesheet pay — ${date}`);
    await expect(componentRows.nth(index)).toContainText('-11.25');
    await expect(componentRows.nth(index)).toContainText('0.00');
  }
  await expect(breakdown.locator('tfoot')).toContainText('Total outstanding recovery');
  await expect(breakdown.locator('tfoot')).toContainText('-56.25');
  await expect(breakdown.locator('tfoot')).toContainText('0.00');

  const settledTrafficWindowStartedAt = Date.now();
  await page.waitForTimeout(12_000);
  const settledWorkbenchRequests = normalTestBackendRequests.filter((request) =>
    request.at >= settledTrafficWindowStartedAt
    && request.pathname.startsWith('/api/banking/pay/workbench/')
  );
  expect(settledWorkbenchRequests).toEqual([]);

  expect(normalTestBackendRequests.length).toBeGreaterThan(0);
  expect(unexpectedProductionBackendRequests).toEqual([]);
});
