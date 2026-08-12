import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block', viewport: { width: 1600, height: 1000 } });

test('double-clicking a batch opens and closes the Pay Batch child without stranding Banking', async ({ page }) => {
  test.setTimeout(180_000);

  const localIndexPath = resolve(__dirname, '../../index.html');
  const localMainPath = resolve(__dirname, '../../js/main.js');
  const localIndex = readFileSync(localIndexPath, 'utf8');
  const localMain = readFileSync(localMainPath, 'utf8');
  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
  const localHashes = { index: sha256(localIndex), main: sha256(localMain) };
  const runtimeMarker = `banking-pay-batch-child-open:${localHashes.main.slice(0, 16)}`;
  let interceptedIndex = 0;
  let interceptedMain = 0;
  const pageErrors: string[] = [];
  const renderFailures: string[] = [];
  const mutations: string[] = [];
  const productionRequests: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[BANKING][PAY BATCH] Overview render failed')) renderFailures.push(text);
  });
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('https://cloudtms.kier-88a.workers.dev/')) productionRequests.push(url);
    if (request.method() !== 'GET' && /\/api\/banking\/pay\/(?:batch\/(?:create-draft|[^/]+\/(?:cancel|execute-payment|schedule|prepare|retry-blocked-funds))|payment\/)/.test(url)) {
      mutations.push(`${request.method()} ${new URL(url).pathname}`);
    }
  });

  await page.route('https://testmode.arthur-rai.co.uk/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/' || url.pathname === '/index.html') {
      interceptedIndex += 1;
      const markedIndex = localIndex.replace(
        '</head>',
        `<script>window.__CODEX_LOCAL_ASSET_PROOF=${JSON.stringify({ runtimeMarker, ...localHashes })};</script></head>`
      );
      await route.fulfill({
        body: markedIndex,
        contentType: 'text/html; charset=utf-8',
        headers: { 'cache-control': 'no-store', 'x-codex-local-asset': runtimeMarker }
      });
      return;
    }
    if (url.pathname === '/js/main.js') {
      interceptedMain += 1;
      await route.fulfill({
        body: localMain,
        contentType: 'application/javascript; charset=utf-8',
        headers: { 'cache-control': 'no-store', 'x-codex-local-asset': runtimeMarker }
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
  expect(new URL(page.url()).hostname).toBe('testmode.arthur-rai.co.uk');
  expect(await page.evaluate(() => (window as any).__CODEX_LOCAL_ASSET_PROOF)).toEqual({ runtimeMarker, ...localHashes });

  await page.getByRole('button', { name: 'Banking', exact: true }).click();
  await page.getByRole('button', { name: 'Pay', exact: true }).click();
  const batchPanel = page.locator('#bankingPayBatchListPanel');
  const batchRow = batchPanel.locator('tr[data-batch-id]').first();
  await expect(batchRow).toBeVisible({ timeout: 60_000 });
  const batchId = String(await batchRow.getAttribute('data-batch-id') || '');
  expect(batchId).not.toBe('');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await batchRow.dblclick();
    await expect(page.locator('#modalTitle')).toHaveText(`Pay Batch — ${batchId.slice(0, 8)}`, { timeout: 60_000 });
    await expect(page.locator('#modal')).toHaveClass(/banking-pay-batch-child-modal/);
    await expect(page.locator('#modalBody [data-banking-pay-child-overview-render-error="1"]')).toHaveCount(0);
    await expect(page.locator('#modalBody').getByText('Overview', { exact: true }).first()).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(page.locator('#modalTitle')).toHaveText('Banking', { timeout: 60_000 });
    await expect(page.locator('#bankingPayBatchListPanel')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1_500);
  }

  const cancelledBatchRow = batchPanel.locator('tr[data-batch-id]').filter({ hasText: /Cancelled/i }).first();
  await expect(cancelledBatchRow).toBeVisible({ timeout: 60_000 });
  const cancelledBatchId = String(await cancelledBatchRow.getAttribute('data-batch-id') || '');
  expect(cancelledBatchId).not.toBe('');
  await cancelledBatchRow.dblclick();
  await expect(page.locator('#modalTitle')).toHaveText(`Pay Batch \u2014 ${cancelledBatchId.slice(0, 8)}`, { timeout: 60_000 });
  await expect(page.locator('#modalBody')).not.toContainText('UNKNOWN', { timeout: 60_000 });
  await expect(page.locator('#modalBody')).toContainText(/Cancelled/i, { timeout: 60_000 });
  expect(await page.evaluate(() => ({
    stackDepth: Array.isArray((window as any).__modalStack) ? (window as any).__modalStack.length : -1,
    childPresent: !!(window as any).modalCtx?.banking?.pay?.child,
    childFramePresent: Array.isArray((window as any).__modalStack) && (window as any).__modalStack.some((frame: any) => frame?.kind === 'banking-pay-batch-child')
  }))).toEqual({ stackDepth: 2, childPresent: true, childFramePresent: true });
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(page.locator('#modalTitle')).toHaveText('Banking', { timeout: 60_000 });
  await expect(page.locator('#bankingPayBatchListPanel')).toBeVisible({ timeout: 60_000 });

  await batchRow.dblclick();
  await expect(page.locator('#modalTitle')).toHaveText(`Pay Batch — ${batchId.slice(0, 8)}`, { timeout: 60_000 });
  const orphanFixture = await page.evaluate(() => {
    const child = (window as any).modalCtx?.banking?.pay?.child || null;
    (window as any).__modalStack = [];
    (window as any).__getModalFrame = () => null;
    return {
      childPresent: !!child,
      childOpenToken: String(child?.openToken || ''),
      modalClassPresent: document.getElementById('modal')?.classList.contains('banking-pay-batch-child-modal') === true
    };
  });
  expect(orphanFixture.childPresent).toBe(true);
  expect(orphanFixture.childOpenToken).not.toBe('');
  expect(orphanFixture.modalClassPresent).toBe(true);
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(page.locator('#modalBack')).toBeHidden();
  expect(await page.evaluate(() => ({
    child: (window as any).modalCtx?.banking?.pay?.child || null,
    stackDepth: Array.isArray((window as any).__modalStack) ? (window as any).__modalStack.length : -1,
    modalClassPresent: document.getElementById('modal')?.classList.contains('banking-pay-batch-child-modal') === true
  }))).toEqual({ child: null, stackDepth: 0, modalClassPresent: false });

  expect(interceptedIndex).toBeGreaterThan(0);
  expect(interceptedMain).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
  expect(renderFailures).toEqual([]);
  expect(mutations).toEqual([]);
  expect(productionRequests).toEqual([]);
});
