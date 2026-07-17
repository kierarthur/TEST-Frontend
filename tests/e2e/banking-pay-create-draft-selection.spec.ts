import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

test('preserves compact IMPLICIT_ALL selection when Create drafts is clicked', async ({ page }) => {
  test.setTimeout(120_000);

  const localMainPath = resolve(__dirname, '../../js/main.js');
  let interceptedMainUrl = '';
  let preflightSummary: {
    selectedRowCount: number;
    requestMode: string;
    decisionMode: string;
  } | null = null;
  let blockedNonPreflightRequests = 0;
  const unexpectedProductionBackendRequests: string[] = [];
  const selectionErrors: string[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('https://cloudtms.kier-88a.workers.dev/')) unexpectedProductionBackendRequests.push(url);
  });
  page.on('console', (message) => {
    const value = message.text();
    if (/NO_SELECTED_PREVIEW_ROWS|STALE_WORKBENCH_CONTEXT_ABORTED/.test(value)) selectionErrors.push(value);
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
        'x-codex-local-asset': 'banking-pay-create-draft-selection'
      }
    });
  });

  await page.route('**/api/banking/pay/batch/create-draft', async (route) => {
    let body: Record<string, unknown> = {};
    try { body = route.request().postDataJSON(); } catch {}

    if (body.preflight_only === true) {
      const selectedRows = Array.isArray(body.selected_preview_row_ids) ? body.selected_preview_row_ids : [];
      const decisions = body.preview_decisions_json && typeof body.preview_decisions_json === 'object'
        ? body.preview_decisions_json as Record<string, unknown>
        : {};
      preflightSummary = {
        selectedRowCount: selectedRows.length,
        requestMode: String(body.selected_preview_row_mode || ''),
        decisionMode: String(decisions.selected_preview_row_mode || decisions.__selected_preview_row_mode || '')
      };
      await route.continue();
      return;
    }

    blockedNonPreflightRequests += 1;
    await route.abort('blockedbyclient');
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  expect(new URL(page.url()).hostname).toBe('testmode.arthur-rai.co.uk');
  expect(interceptedMainUrl).toBe('https://testmode.arthur-rai.co.uk/js/main.js');

  await page.getByRole('button', { name: 'Banking' }).click();
  await page.getByRole('button', { name: 'Pay', exact: true }).click();

  const createButton = page.getByRole('button', { name: 'Create drafts', exact: true });
  await expect(createButton).toBeVisible({ timeout: 60_000 });
  await expect(createButton).toBeEnabled();

  const compactSelection = await page.evaluate(() => {
    const wizard = window.modalCtx?.banking?.pay?.draftWizard;
    if (!wizard || !wizard.decisions || !wizard.workbench) throw new Error('Banking Pay wizard state is unavailable');

    wizard.selected_preview_row_mode = 'IMPLICIT_ALL';
    wizard.decisions.selected_preview_row_mode = 'IMPLICIT_ALL';
    delete wizard.decisions.__selected_preview_row_mode;
    wizard.decisions.selected_preview_row_ids = [];
    wizard.decisions.server_selected_preview_row_ids = [];
    wizard.decisions.server_selected_preview_row_ids_provided = false;
    wizard.workbench.selected_preview_row_mode = 'IMPLICIT_ALL';
    wizard.workbench.selected_preview_row_ids = [];
    wizard.workbench.server_selected_preview_row_ids = [];
    wizard.workbench.server_selected_preview_row_ids_provided = false;
    wizard.local_selected_preview_row_ids_dirty = false;

    return {
      wizardMode: wizard.selected_preview_row_mode,
      decisionMode: wizard.decisions.selected_preview_row_mode,
      selectedIdCount: wizard.decisions.selected_preview_row_ids.length
    };
  });

  expect(compactSelection).toEqual({
    wizardMode: 'IMPLICIT_ALL',
    decisionMode: 'IMPLICIT_ALL',
    selectedIdCount: 0
  });

  await createButton.click();
  await expect(page.getByText('A PAYE batch already exists for this payroll week', { exact: true })).toBeVisible({ timeout: 60_000 });

  expect(selectionErrors).toEqual([]);
  expect(preflightSummary).not.toBeNull();
  expect(preflightSummary?.selectedRowCount).toBeGreaterThan(0);
  expect(preflightSummary?.requestMode).toBe('IMPLICIT_ALL');
  expect(preflightSummary?.decisionMode).toBe('IMPLICIT_ALL');
  expect(blockedNonPreflightRequests).toBe(0);
  expect(unexpectedProductionBackendRequests).toEqual([]);

  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
});
