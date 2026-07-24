import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

const testFrontendHost = 'testmode.arthur-rai.co.uk';
const testBackendHost = 'test-cloudtms-backend.kier-88a.workers.dev';

async function installLocalMain(page: Page) {
  const localMainPath = resolve(__dirname, '../../js/main.js');
  let interceptedMainUrl = '';

  await page.route('**/js/main.js*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== testFrontendHost || url.pathname !== '/js/main.js') {
      await route.continue();
      return;
    }
    interceptedMainUrl = url.href;
    await route.fulfill({
      path: localMainPath,
      contentType: 'application/javascript; charset=utf-8',
      headers: {
        'cache-control': 'no-store',
        'x-codex-local-asset': 'banking-pay-shared-selection-guard'
      }
    });
  });

  return () => interceptedMainUrl;
}

async function openBankingPay(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  expect(new URL(page.url()).hostname).toBe(testFrontendHost);

  await page.getByRole('button', { name: 'Banking' }).click();
  await page.getByRole('button', { name: 'Pay', exact: true }).click();

  const createButton = page.getByRole('button', { name: 'Create drafts', exact: true });
  await expect(createButton).toBeVisible({ timeout: 60_000 });
  await expect(createButton).toBeEnabled();
  return createButton;
}

test('requires review and starts no draft when the authoritative selection changes', async ({ page }) => {
  test.setTimeout(120_000);

  const getInterceptedMainUrl = await installLocalMain(page);
  const unexpectedProductionBackendRequests: string[] = [];
  let simulateConcurrentChange = false;
  let modifiedPreviewResponses = 0;
  let createDraftRequests = 0;
  let simulatedRemovedRowId = '';

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'cloudtms.kier-88a.workers.dev') unexpectedProductionBackendRequests.push(url.pathname);
  });

  await page.route('**/api/banking/pay/workbench/session/*/preview-page**', async (route) => {
    const url = new URL(route.request().url());
    if (!simulateConcurrentChange || url.hostname !== testBackendHost || url.searchParams.get('section') !== 'canonical_preview_lines') {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    const originalRows = Array.isArray(payload.rows)
      ? payload.rows
      : (Array.isArray(payload.items) ? payload.items : []);
    const selectedIndex = originalRows.findIndex((row) => {
      if (!row || typeof row !== 'object') return false;
      const value = row as Record<string, unknown>;
      const rowId = String(value.preview_row_id || value.previewRowId || value.id || '');
      return rowId === simulatedRemovedRowId && value.selected === true && String(value.status || '').toUpperCase() === 'READY';
    });
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const rows = originalRows.filter((_row, index) => index !== selectedIndex);
    payload.rows = rows;
    payload.items = rows;
    for (const key of ['returned_count', 'returnedCount', 'known_count', 'knownCount', 'total_count', 'totalCount']) {
      if (Number.isFinite(Number(payload[key]))) payload[key] = Math.max(0, Number(payload[key]) - 1);
    }
    payload.progress_counter_version = Number(payload.progress_counter_version || 0) + 2;
    modifiedPreviewResponses += 1;

    await route.fulfill({
      response,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(payload)
    });
  });

  await page.route('**/api/banking/pay/batch/create-draft', async (route) => {
    createDraftRequests += 1;
    await route.abort('blockedbyclient');
  });

  const createButton = await openBankingPay(page);
  expect(new URL(getInterceptedMainUrl()).pathname).toBe('/js/main.js');

  const hiddenConcurrentState = await page.evaluate(() => {
    const wizard = window.modalCtx?.banking?.pay?.draftWizard;
    if (!wizard?.workbench || !wizard?.decisions) throw new Error('Banking Pay wizard state is unavailable');
    const review = wizard.workbench.selection_review_snapshot;
    const reviewedIds = Array.isArray(review?.selected_preview_row_ids) ? review.selected_preview_row_ids.map(String).filter(Boolean) : [];
    if (reviewedIds.length < 2) throw new Error('Rendered Banking Pay selection snapshot is unavailable');
    const rowId = reviewedIds[0];
    const removeRowId = (value: unknown) => Array.isArray(value) ? value.map(String).filter((id) => id && id !== rowId) : value;
    for (const target of [wizard.workbench, wizard.decisions, wizard.preview?.data, wizard.preview?.data?.preview]) {
      if (!target || typeof target !== 'object') continue;
      for (const key of ['selected_preview_row_ids', 'server_selected_preview_row_ids']) {
        if (Array.isArray((target as Record<string, unknown>)[key])) {
          (target as Record<string, unknown>)[key] = removeRowId((target as Record<string, unknown>)[key]);
        }
      }
    }
    return { rowId, reviewedCount: reviewedIds.length };
  });
  simulatedRemovedRowId = hiddenConcurrentState.rowId;
  expect(hiddenConcurrentState.reviewedCount).toBeGreaterThan(1);

  simulateConcurrentChange = true;
  await createButton.click();
  const confirmButton = page.getByRole('button', { name: 'Confirm', exact: true });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();

  await expect(page.getByText('Banking Pay selection changed', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Banking Pay was changed by another user or window. The latest selection is now shown. Review it, then click Create Draft again.', { exact: true }).first()).toBeVisible();

  expect(modifiedPreviewResponses).toBeGreaterThanOrEqual(1);
  expect(createDraftRequests).toBe(0);
  expect(unexpectedProductionBackendRequests).toEqual([]);
  await page.getByRole('button', { name: 'OK', exact: true }).last().click();
});

test('an early shared-session revision drift reaches the exact selection review', async ({ page }) => {
  test.setTimeout(120_000);

  const getInterceptedMainUrl = await installLocalMain(page);
  let simulateRevisionDrift = false;
  let modifiedProgressResponses = 0;
  let modifiedPreviewResponses = 0;
  let createDraftRequests = 0;

  await page.route('**/api/banking/pay/workbench/session/*/progress**', async (route) => {
    const url = new URL(route.request().url());
    if (!simulateRevisionDrift || url.hostname !== testBackendHost) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    payload.progress_counter_version = Number(payload.progress_counter_version || 0) + 1;
    if (payload.progress && typeof payload.progress === 'object' && !Array.isArray(payload.progress)) {
      (payload.progress as Record<string, unknown>).progress_counter_version = payload.progress_counter_version;
    }
    modifiedProgressResponses += 1;
    await route.fulfill({ response, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
  });

  await page.route('**/api/banking/pay/workbench/session/*/preview-page**', async (route) => {
    const url = new URL(route.request().url());
    if (!simulateRevisionDrift || url.hostname !== testBackendHost || url.searchParams.get('section') !== 'canonical_preview_lines') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    payload.progress_counter_version = Number(payload.progress_counter_version || 0) + 1;
    modifiedPreviewResponses += 1;
    await route.fulfill({ response, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
  });

  await page.route('**/api/banking/pay/batch/create-draft', async (route) => {
    createDraftRequests += 1;
    await route.abort('blockedbyclient');
  });

  const createButton = await openBankingPay(page);
  expect(new URL(getInterceptedMainUrl()).pathname).toBe('/js/main.js');

  simulateRevisionDrift = true;
  await createButton.click();
  const confirmButton = page.getByRole('button', { name: 'Confirm', exact: true });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();

  await expect(page.getByText('Banking Pay selection changed', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Banking Pay was changed by another user or window. The latest selection is now shown. Review it, then click Create Draft again.', { exact: true }).first()).toBeVisible();
  expect(modifiedProgressResponses).toBeGreaterThanOrEqual(1);
  expect(modifiedPreviewResponses).toBeGreaterThanOrEqual(1);
  expect(createDraftRequests).toBe(0);
  await page.getByRole('button', { name: 'OK', exact: true }).last().click();
});

test('a rejected row change reloads server truth and repaints the checkbox', async ({ page }) => {
  test.setTimeout(120_000);

  const getInterceptedMainUrl = await installLocalMain(page);
  let rejectNextSelection = true;
  let rejectedSelectionRequests = 0;

  await page.route('**/api/banking/pay/workbench/session/*/selected-rows', async (route) => {
    const url = new URL(route.request().url());
    if (!rejectNextSelection || url.hostname !== testBackendHost) {
      await route.continue();
      return;
    }
    rejectNextSelection = false;
    rejectedSelectionRequests += 1;
    await route.fulfill({
      status: 409,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ok: false,
        error_code: 'WORKBENCH_SESSION_PROGRESS_CHANGED',
        code: 'WORKBENCH_SESSION_PROGRESS_CHANGED',
        title: 'Payment selection changed',
        message: 'Banking Pay changed in another window. The latest selection has been reloaded.'
      })
    });
  });

  await openBankingPay(page);
  expect(new URL(getInterceptedMainUrl()).pathname).toBe('/js/main.js');

  const checkbox = page.locator('input[type="checkbox"][data-preview-row-id]').first();
  await expect(checkbox).toBeVisible({ timeout: 60_000 });
  const previewRowId = await checkbox.getAttribute('data-preview-row-id');
  expect(previewRowId).toBeTruthy();
  const originalChecked = await checkbox.isChecked();

  await checkbox.click();
  await expect.poll(() => rejectedSelectionRequests).toBe(1);

  const repaintedCheckbox = page.locator('input[type="checkbox"][data-preview-row-id="' + previewRowId + '"]');
  if (originalChecked) await expect(repaintedCheckbox).toBeChecked({ timeout: 30_000 });
  else await expect(repaintedCheckbox).not.toBeChecked({ timeout: 30_000 });
});
