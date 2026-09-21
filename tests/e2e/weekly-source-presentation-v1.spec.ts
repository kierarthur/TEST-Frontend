import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scriptPath = resolve(__dirname, '../../js/weekly-source-presentation-v1.js');
const stylePath = resolve(__dirname, '../../css/weekly-source-presentation-v1.css');
const fixtures = JSON.parse(readFileSync(
  resolve(__dirname, '../fixtures/weekly-source-presentation-v1.json'),
  'utf8'
));

test.use({ storageState: { cookies: [], origins: [] } });

async function loadFoundation(page: import('@playwright/test').Page) {
  await page.setContent(`<!doctype html><html><head></head><body style="margin:0;background:#020617;color:#f8fafc"><main id="fixture" style="padding:16px"></main></body></html>`);
  await page.addStyleTag({ path: stylePath });
  await page.addScriptTag({ path: scriptPath });
}

test('source-authority fixture stays compact, readable and uses the header checkbox', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loadFoundation(page);

  await page.evaluate((payload) => {
    const api = (window as any).CloudTMSWeeklySourcePresentationV1;
    const vm = api.buildViewModel(payload);
    const root = document.getElementById('fixture')!;
    root.innerHTML = `
      ${api.renderCategoryTabs(vm.category_key, {
        NHSP: 4,
        CLIENT_PROVIDED_HOURS: 6,
        TIMESHEETS_CHECKED_WITH_CLIENT: 3,
        STANDARD_TIMESHEETS: 12
      })}
      ${api.renderMiddlePaneTabs(vm.default_middle_pane)}
      ${api.renderBulkHoursPane(vm)}
      ${api.renderApprovedHours(vm)}
      ${api.renderFourTotals(vm)}
      <div class="weekly-source-v1 weekly-source-v1__table-scroll">
        <table class="weekly-source-v1__table" aria-label="Selectable shifts">
          <thead><tr>${api.renderSelectionHeaderCheckbox({
            indeterminate: true,
            select_label: 'Select all shifts in this group',
            clear_label: 'Clear all shifts in this group'
          })}<th>Candidate</th><th>Day and date</th></tr></thead>
          <tbody><tr><td><input type="checkbox" aria-label="Select shift"></td><td>Alex Reed</td><td>Tue 8 Sep 2026</td></tr></tbody>
        </table>
      </div>`;
    api.applySelectionHeaderState(root);
  }, fixtures.clientSourceMismatch);

  await expect(page.getByRole('tab', { name: /Client-provided hours/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Hours', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Client system hours' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Submitted hours needing attention' })).toBeVisible();
  // Contract erratum E-4. `P:\25…md` §10 "Removed" deletes the single generic
  // lifecycle heading by name, and `P:\annexes\ui-lifecycle-state-matrix.csv`
  // replaces it with eight phase headings. This fixture is matrix row `UI-003`,
  // whose heading the SERVER supplies; the browser renders it verbatim and maps
  // nothing. Files 17 and 18 are stale on the point; file 24 controls.
  await expect(page.getByRole('heading', { name: 'Hours to authorise' })).toBeVisible();
  await expect(page.locator('#fixture')).not.toContainText(['Hours', 'being', 'authorised'].join(' '));
  await expect(page.getByText('Mon 7 Sep 2026').first()).toBeVisible();
  await expect(page.getByText('Tue 8 Sep 2026').first()).toBeVisible();
  await expect(page.getByText('20:00-09:00')).toHaveCount(1);

  const headerCheckbox = page.getByRole('checkbox', { name: 'Select all shifts in this group' });
  await expect(headerCheckbox).toHaveCount(1);
  expect(await headerCheckbox.evaluate((element: HTMLInputElement) => element.indeterminate)).toBe(true);
  await expect(page.getByRole('button', { name: /select all|unselect all/i })).toHaveCount(0);

  const selectCellStyle = await headerCheckbox.evaluate((element) => {
    const cell = element.closest('th')!;
    const style = getComputedStyle(cell);
    return { position: style.position, left: style.left, width: Math.round(cell.getBoundingClientRect().width) };
  });
  expect(selectCellStyle.position).toBe('sticky');
  expect(selectCellStyle.left).toBe('0px');
  expect(selectCellStyle.width).toBe(42);

  const visibleText = await page.locator('#fixture').innerText();
  expect(visibleText).not.toMatch(/\bimport\b|TSFIN|RPC|Workbench|rounding|margin|hourly rate/i);

  await page.setViewportSize({ width: 760, height: 900 });
  const totalColumns = await page.locator('.weekly-source-v1__totals').evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(totalColumns.trim().split(/\s+/)).toHaveLength(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const pageWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(pageWidth.scroll).toBe(pageWidth.client);
});

test('browser helper leaves ordinary Weekly and Daily rendering byte-for-byte with the legacy owner', async ({ page }) => {
  await loadFoundation(page);

  const result = await page.evaluate(({ ordinary, daily }) => {
    const api = (window as any).CloudTMSWeeklySourcePresentationV1;
    const exact = '  <section data-owner="existing">existing output & spacing</section>\n';
    const calls = { legacy: 0, weekly: 0 };
    const render = (payload: unknown) => api.renderLegacyOrWeekly(
      payload,
      () => { calls.legacy += 1; return exact; },
      () => { calls.weekly += 1; return 'wrong'; }
    );
    return {
      exact,
      ordinary: render(ordinary),
      daily: render(daily),
      calls,
      fixtureHtml: document.getElementById('fixture')!.innerHTML
    };
  }, { ordinary: fixtures.ordinaryWeekly, daily: fixtures.daily });

  expect(result.ordinary).toBe(result.exact);
  expect(result.daily).toBe(result.exact);
  expect(result.calls).toEqual({ legacy: 2, weekly: 0 });
  expect(result.fixtureHtml).toBe('');
});

test('Office-approved hours remain clear without exposing internal reconciliation language', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await loadFoundation(page);

  await page.evaluate((payload) => {
    const api = (window as any).CloudTMSWeeklySourcePresentationV1;
    const vm = api.buildViewModel(payload);
    document.getElementById('fixture')!.innerHTML = `
      ${api.renderBulkHoursPane(vm)}
      ${api.renderApprovedHours(vm)}
      ${api.renderFourTotals(vm)}`;
  }, fixtures.clientSourceProtected);

  // Contract erratum E-4, as above. This fixture is matrix row `UI-004`
  // (Office alternate hours awaiting first authorisation), whose heading is
  // also `Hours to authorise` and also comes from the server.
  await expect(page.getByRole('heading', { name: 'Hours to authorise' })).toBeVisible();
  await expect(page.locator('#fixture')).not.toContainText(['Hours', 'being', 'authorised'].join(' '));
  await expect(page.getByText('Office-approved hours', { exact: true })).toBeVisible();
  await expect(page.getByText('Client system: not included · Submitted: 05:00-15:00 (60 min break)')).toBeVisible();
  await expect(page.getByText('£180.00')).toHaveCount(2);

  const visibleText = await page.locator('#fixture').innerText();
  expect(visibleText).not.toMatch(/exceptional|reconciliation|recovery|Workbench|rate|margin|rounding/i);
});

test('Manage approved hours is plain, compact and builds only the sealed command', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 900 });
  await loadFoundation(page);

  const command = await page.evaluate((payload) => {
    const api = (window as any).CloudTMSWeeklySourcePresentationV1;
    const vm = api.buildViewModel(payload);
    document.getElementById('fixture')!.innerHTML = `
      ${api.renderManageApprovedHoursButton(vm)}
      ${api.renderManageApprovedHoursDialog(vm)}`;
    return api.buildApprovedHoursCommand(vm, {
      item_id: 'approved-fri',
      action: 'ACCEPT_SOURCE_AND_RECONCILE',
      edits: {
        work_date: '2099-01-01',
        start_at_local: '00:00',
        end_at_local: '23:59',
        break_minutes: 999,
        reason: 'Use the client hours.'
      },
      idempotency_key: 'browser-proof-1'
    });
  }, fixtures.clientSourceProtected);

  await expect(page.getByRole('button', { name: 'Manage approved hours' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add approved hours' })).toBeVisible();
  await expect(page.getByLabel('Date').first()).toBeVisible();
  await expect(page.getByLabel('Start').first()).toBeVisible();
  await expect(page.getByLabel('Finish').first()).toBeVisible();
  await expect(page.getByLabel('Break (minutes)').first()).toBeVisible();
  await expect(page.getByRole('option', { name: 'Save approved hours' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Remove approved hours' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Wait for client update' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Use client hours' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Record as not worked' })).toHaveCount(1);

  const visibleText = await page.locator('#fixture').innerText();
  expect(visibleText).not.toMatch(/exceptional|protected|reconcile|family_id|work_event_id|idempotency|Workbench|Banking|rate|rounding/i);
  expect(command).toEqual({
    endpoint: '/api/weekly-source/v1/commands',
    body: {
      action: 'ACCEPT_SOURCE_AND_RECONCILE',
      payload: {
        family_id: 'approved-hours-family-1',
        work_event_id: 'work-event-fri',
        reason: 'Use the client hours.',
        idempotency_key: 'browser-proof-1',
        expected_record_version: 'client-protected-v1'
      }
    }
  });
});

test('approved-hours actions render from the real component at desktop and phone widths', async ({ page }, testInfo) => {
  await loadFoundation(page);
  for (const viewport of [{ name: 'desktop', width: 960, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate((payload) => {
      const api = (window as any).CloudTMSWeeklySourcePresentationV1;
      const vm = api.buildViewModel(payload);
      document.getElementById('fixture')!.innerHTML = api.renderManageApprovedHoursDialog(vm);
    }, fixtures.clientSourceProtected);
    await expect(page.locator('[data-weekly-source-manage-dialog="1"]')).toBeVisible();
    await expect(page.getByRole('option', { name: 'Save approved hours' })).toHaveCount(1);
    await expect(page.getByRole('option', { name: 'Remove approved hours' })).toHaveCount(1);
    await expect(page.getByRole('option', { name: 'Use client hours' })).toHaveCount(1);
    await expect(page.getByRole('option', { name: 'Record as not worked' })).toHaveCount(1);
    const pageWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(pageWidth.scroll).toBe(pageWidth.client);
    await page.locator('[data-weekly-source-manage-dialog="1"]').screenshot({ path: testInfo.outputPath(`approved-hours-actions-${viewport.name}.png`) });
    if (viewport.name === 'desktop') {
      await page.locator('[data-weekly-source-manage-item="__new__"]').screenshot({ path: testInfo.outputPath('protected-shift-add.png') });
      const selector = page.locator('[data-weekly-source-action-select]');
      for (const [action, imageName] of [
        ['AMEND_PROTECTED_HOURS', 'protected-shift-change.png'],
        ['WITHDRAW_PROTECTED_HOURS', 'protected-shift-stop.png'],
        ['ACCEPT_SOURCE_AND_RECONCILE', 'reconcile-approved-hours.png'],
        ['WAIT_FOR_SOURCE', 'protected-shift-stale.png'],
        ['RECORD_NOT_WORKED', 'record-not-worked.png']
      ] as const) {
        await selector.selectOption(action);
        await page.locator('[data-weekly-source-manage-dialog="1"]').screenshot({ path: testInfo.outputPath(imageName) });
      }
    } else {
      await page.locator('[data-weekly-source-manage-item="__new__"]').screenshot({ path: testInfo.outputPath('protected-shift-add-mobile.png') });
    }
  }
});

test('Stage 11: every checked-in Weekly Source presentation fixture has a production-component visual record', async ({ page }, testInfo) => {
  await loadFoundation(page);
  await page.setViewportSize({ width: 1120, height: 900 });
  const fixtureNames = [
    'nhspMatch',
    'clientSourceMismatch',
    'clientSourceNoTimesheet',
    'clientSourceProtected',
    'clientSourceSuppliedExpense',
    'clientSourceSuppliedExpenseZeroHours',
    'timesheetCheckedWaiting',
    'timesheetCheckedMismatch'
  ] as const;

  for (const fixtureName of fixtureNames) {
    await page.evaluate(({ payload, name }) => {
      const api = (window as any).CloudTMSWeeklySourcePresentationV1;
      const vm = api.buildViewModel(payload);
      const host = document.getElementById('fixture')!;
      host.innerHTML = `<main data-stage11-presentation="${api.escapeHtml(name)}" style="display:grid;gap:16px;max-width:1040px;margin:0 auto;padding:16px">
        <section class="card"><h2 style="margin:0 0 12px">Simple Timesheet · Lines</h2>${api.renderSimpleLines(vm)}</section>
        <section class="card"><h2 style="margin:0 0 12px">Bulk Authorise · Review</h2>${api.renderBulkHoursPane(vm)}</section>
        <section class="card"><h2 style="margin:0 0 12px">Bulk Authorise · Hours</h2>${api.renderApprovedHours(vm)}${api.renderFourTotals(vm)}</section>
        <section class="card"><h2 style="margin:0 0 12px">Expense handling</h2>${api.renderSourceExpenseContext(vm)}</section>
      </main>`;
    }, { payload: (fixtures as any)[fixtureName], name: fixtureName });
    const surface = page.locator(`[data-stage11-presentation="${fixtureName}"]`);
    await expect(surface).toBeVisible();
    await surface.screenshot({ path: testInfo.outputPath(`presentation-${fixtureName}-desktop.png`) });
  }
});

test('source-supplied expense stays read-only on the same Timesheet', async ({ page }) => {
  await loadFoundation(page);

  await page.evaluate((payload) => {
    const api = (window as any).CloudTMSWeeklySourcePresentationV1;
    const vm = api.buildViewModel(payload);
    document.getElementById('fixture')!.innerHTML = api.renderSourceExpenseContext(vm);
  }, fixtures.clientSourceSuppliedExpense);

  await expect(page.getByRole('status')).toContainText('Client-provided expense');
  await expect(page.getByRole('status')).toContainText('This Timesheet uses the expense supplied by the client.');
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  await expect(page.getByText(/Add additional expense Timesheet/i)).toHaveCount(0);
});

test('zero source hours keep the client-provided expense on the same Weekly Timesheet', async ({ page }) => {
  await loadFoundation(page);

  await page.evaluate((payload) => {
    const api = (window as any).CloudTMSWeeklySourcePresentationV1;
    const vm = api.buildViewModel(payload);
    document.getElementById('fixture')!.innerHTML = `${api.renderSimpleLines(vm)}${api.renderApprovedHours(vm)}`;
  }, fixtures.clientSourceSuppliedExpenseZeroHours);

  await expect(page.getByText('Client-provided expense only')).toHaveCount(2);
  await expect(page.getByText('Client-provided expense', { exact: true })).toHaveCount(2);
  await expect(page.getByText('£24.00')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /additional expense/i })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test('signed-Timesheet authority opens on Files and shows only client checks needing attention', async ({ page }) => {
  await loadFoundation(page);

  await page.evaluate((payload) => {
    const api = (window as any).CloudTMSWeeklySourcePresentationV1;
    const vm = api.buildViewModel(payload);
    document.getElementById('fixture')!.innerHTML = `
      ${api.renderCategoryTabs(vm.category_key, {})}
      ${api.renderMiddlePaneTabs(vm.default_middle_pane)}
      ${api.renderBulkHoursPane(vm)}
      ${api.renderApprovedHours(vm)}
      ${api.renderFourTotals(vm)}`;
  }, fixtures.timesheetCheckedMismatch);

  await expect(page.getByRole('tab', { name: 'Timesheets checked with client' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Files', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Signed Timesheet hours' })).toBeVisible();
  await expect(page.getByText('Used for pay and invoice').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Client system checks needing attention' })).toBeVisible();
  await expect(page.getByText('Check only')).toBeVisible();
  await expect(page.getByText('09:00-17:00').first()).toBeVisible();
  await expect(page.getByText('09:00-16:30')).toBeVisible();
});

test('incomplete signed Timesheet is visibly held and cannot look ready', async ({ page }) => {
  await loadFoundation(page);

  await page.evaluate((payload) => {
    const api = (window as any).CloudTMSWeeklySourcePresentationV1;
    const vm = api.buildViewModel(payload);
    document.getElementById('fixture')!.innerHTML = `
      ${api.renderBulkHoursPane(vm)}
      ${api.renderApprovedHours(vm)}
      ${api.renderFourTotals(vm)}
      <output data-blocked>${vm.blocks_authorisation ? vm.blocked_reason : ''}</output>`;
  }, fixtures.timesheetCheckedWaiting);

  await expect(page.getByText('Waiting for completed Timesheet')).toBeVisible();
  await expect(page.locator('[data-blocked]')).toContainText('Waiting for the worker and manager');
  await expect(page.getByText('Unavailable')).toHaveCount(0);
});
