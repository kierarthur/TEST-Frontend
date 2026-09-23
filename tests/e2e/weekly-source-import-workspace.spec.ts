import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { externalRequests, mountOfficeShell } from './helpers/weekly-source-local-shell';

const workspaceScript = resolve(__dirname, '../../js/weekly-source/import-workspace.js');
const actionsScript = resolve(__dirname, '../../js/weekly-source/workspace-actions.js');
const stylePath = resolve(__dirname, '../../css/weekly-source.css');
const fixtures = JSON.parse(readFileSync(
  resolve(__dirname, '../fixtures/weekly-source-workspace-actions-v1.json'),
  'utf8'
));

test.use({ storageState: { cookies: [], origins: [] } });

async function loadFoundation(page: import('@playwright/test').Page) {
  await page.setContent(`<!doctype html><html><head></head><body><header><h1 id="modalTitle"></h1><button id="btnCloseModal" type="button">Close</button></header><nav id="modalTabs"></nav><main id="modalBody"></main></body></html>`);
  await page.addStyleTag({ content: `
    :root{--panel:#0f172a;--line:#334155;--muted:#94a3b8;--accent:#3b82f6;color-scheme:dark}
    *{box-sizing:border-box} body{margin:0;padding:12px;background:#020617;color:#f8fafc;font:14px/1.4 Arial,sans-serif;overflow-x:hidden}
    button,input,select,textarea{font:inherit;color:inherit;background:#111827;border:1px solid #475569;border-radius:7px;padding:7px}
    .btn{min-height:40px;padding:7px 11px}.primary{background:#2563eb}.grid th,.grid td{padding:8px;border-bottom:1px solid #334155;text-align:left}
    header{display:flex;justify-content:space-between;align-items:center} #modalBody{min-width:0;max-width:1120px;margin:0 auto}
  ` });
  await page.addStyleTag({ path: stylePath });
  await page.addScriptTag({ path: workspaceScript });
  await page.addScriptTag({ path: actionsScript });
  await page.evaluate(({ workspaceFixture, correctionPreview }) => {
    const win = window as any;
    win.__modalStack = [];
    win.html = (value: unknown) => String(value ?? '');
    win.API = (path: string) => path;
    win.__requests = [];
    win.__nativeConfirmCalls = 0;
    win.authFetch = async (url: string, options: Record<string, unknown> = {}) => {
      if (String(url).includes('/commands')) {
        const request = JSON.parse(String((options as any).body || '{}'));
        win.__requests.push(request);
        return { ok: true, json: async () => request.action === 'PREVIEW_CORRECT_FINAL_SOURCE'
          ? correctionPreview : ({ ok: true, status: 'CORRECTED' }) };
      }
      if (String(url).includes('/uploads/accept')) {
        win.__requests.push({ action: 'UPLOAD_ACCEPT', payload: JSON.parse(String((options as any).body || '{}')) });
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => workspaceFixture };
    };
    win.uploadImportFileToR2 = async (file: File) => ({ fileKey: `mock/${file.name}`, filename: file.name });
    win.showModal = (title: string, tabs: Array<{key:string;label:string}>, render: (key:string) => unknown, _save: unknown, _hasId: unknown, onReturn: (() => void) | null, options: Record<string, unknown> = {}) => {
      const frame: any = {
        kind: options.kind || null,
        isDirty: false,
        _snapshot: { data: {} },
        _updateButtons() {},
        tabs: tabs.slice(),
        currentTabKey: tabs[0]?.key || 'main',
        async setTab(key: string) {
          frame.currentTabKey = key;
          document.getElementById('modalTitle')!.textContent = title;
          document.getElementById('modalTabs')!.innerHTML = frame.tabs.map((tab: any) => `<button type="button" data-test-tab="${tab.key}">${tab.label}</button>`).join('');
          document.getElementById('modalBody')!.innerHTML = String(render(key) ?? '');
          if (typeof onReturn === 'function') onReturn();
        }
      };
      win.__modalStack.push(frame);
      frame.setTab(frame.currentTabKey);
      return frame;
    };
    win.closeModal = () => {
      if (win.__modalStack.at(-1)?.isDirty) {
        win.__nativeConfirmCalls += 1;
        return;
      }
      win.__modalStack.pop();
      const parent = win.__modalStack.at(-1);
      if (parent) parent.setTab(parent.currentTabKey);
      else document.getElementById('modalBody')!.replaceChildren();
    };
    document.getElementById('btnCloseModal')!.addEventListener('click', win.closeModal);
  }, { workspaceFixture: fixtures.workspace, correctionPreview: fixtures.correctFinalPreview });
}

test('Queries keeps the two selection planes separate and uses only sticky header checkboxes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1700, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async () => {
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    await (window as any).__modalStack.at(-1).setTab('queries');
  });
  await page.waitForTimeout(50);

  const outreach = page.getByRole('checkbox', { name: 'Select all query groups' });
  const shifts = page.getByRole('checkbox', { name: 'Select all shifts in this group' });
  await expect(outreach).toHaveCount(1);
  await expect(shifts).toHaveCount(1);
  await expect(page.getByRole('columnheader', { name: 'Candidate says they worked' })).toBeVisible();
  await expect(page.getByRole('button', { name: /select all|unselect all/i })).toHaveCount(0);

  const sticky = await shifts.evaluate((input) => {
    const cell = input.closest('th')!;
    const style = getComputedStyle(cell);
    return { position: style.position, left: style.left, width: Math.round(cell.getBoundingClientRect().width) };
  });
  expect(sticky).toEqual({ position: 'sticky', left: '0px', width: 48 });

  await outreach.check();
  await expect(page.getByLabel('Select Jane Smith')).toBeChecked();
  await expect(page.getByLabel('Select Mon 14 Sep 2026')).not.toBeChecked();

  await shifts.check();
  await expect(page.getByLabel('Select Mon 14 Sep 2026')).toBeChecked();
  await expect(page.getByLabel('Select Tue 15 Sep 2026')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Accept system hours for selected shifts' })).toBeEnabled();

  const text = await page.locator('#modalBody').innerText();
  expect(text).not.toMatch(/source rounding|Workbench|RPC|manifest|fingerprint|hourly rate/i);
  await page.screenshot({ path: testInfo.outputPath('weekly-source-queries-desktop.png'), fullPage: true });

  await page.getByRole('button', { name: 'Accept system hours for selected shifts' }).click();
  await expect(page.getByRole('heading', { name: 'Accept system hours' })).toBeVisible();
  await expect(page.getByText('2 shifts selected', { exact: true })).toBeVisible();
  await page.getByLabel('I confirm the system hours are correct for the selected shifts.').check();
  await page.locator('#modalBody').getByRole('button', { name: 'Accept system hours', exact: true }).click();
  await page.waitForTimeout(50);
  const acceptRequest = await page.evaluate(() => (window as any).__requests[0]);
  expect(acceptRequest).toEqual({
    action: 'ACCEPT_SYSTEM_HOURS',
    payload: {
      actor_user_id: '71111111-1111-4111-8111-111111111111',
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      projection_publication_id: '55555555-5555-4555-8555-555555555555',
      expected_workspace_version: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      action: 'ACCEPT_SYSTEM_HOURS',
      selection: {
        mode: 'EXPLICIT',
        group_keys: ['qg_1111111111111111111111111111111111111111111111111111111111111111'],
        excluded_group_keys: [],
        incident_ids: ['66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777'],
        filters: { status: 'UNRESOLVED', candidate: '', issue: 'ALL' },
        sort_key: 'candidate',
        sort_direction: 'asc',
        selection_proof: null,
        group_selection_proofs: [{
          group_key: 'qg_1111111111111111111111111111111111111111111111111111111111111111',
          selection_proof: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
        }]
      }
    }
  });

  await page.getByLabel('Select Jane Smith').uncheck();
  await expect(page.getByText('1 query group selected')).toBeVisible();
  await page.getByRole('button', { name: 'Ask selected candidates' }).click();
  await page.waitForTimeout(50);
  const request = await page.evaluate(() => (window as any).__requests[1]);
  expect(request.action).toBe('ASK_CANDIDATES');
  expect(request.payload.selection).toEqual({
    mode: 'ALL_FILTERED',
    group_keys: [],
    excluded_group_keys: ['qg_1111111111111111111111111111111111111111111111111111111111111111'],
    incident_ids: [],
    filters: { status: 'UNRESOLVED', candidate: '', issue: 'ALL' },
    sort_key: 'candidate',
    sort_direction: 'asc',
    selection_proof: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  });
});

test('Imports opens as the shared weekly-source landing view', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async () => {
    await (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open();
  });
  await expect(page.getByRole('button', { name: 'Upload source file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Daily rota check' })).toBeVisible();
  await expect(page.getByText('Backing report 1741227.xlsx')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('imports-tab.png'), fullPage: true });
});

test('NHSP imports clearly select the exact pre-final or final file journey', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.profile = { id: 'NHSP_FINAL_BACKING_V1', label: 'NHSP', finalise_label: 'Finalise report' };
    payload.context.cycle_state = 'Before cutoff';
    payload.context.controls[0].options[0].label = 'NHSP';
    const win = window as any;
    win.authFetch = async () => ({ ok: true, json: async () => payload });
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open();
  }, fixtures.workspace);

  const fileType = page.getByLabel('File type');
  await expect(fileType).toBeVisible();
  await expect(fileType).toHaveValue('NHSP_PREFINAL_RELEASED_V1');
  await expect(fileType.locator('option')).toHaveText(['Previously released shifts', 'Final backing report']);
  await fileType.selectOption('NHSP_FINAL_BACKING_V1');
  await expect(fileType).toHaveValue('NHSP_FINAL_BACKING_V1');
  await expect(page.getByLabel('Source', { exact: true })).toHaveText(/NHSP/);
  await page.screenshot({ path: testInfo.outputPath('nhsp-import-file-type.png'), fullPage: true });
});

test('NHSP previously released review accepts the shared group scope without one Trust', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  const result = await page.evaluate(() => {
    const actions = (window as any).CloudTMSWeeklySourceWorkspaceActionsV1;
    const model = actions.normalisePreview({
      ok: true,
      file_key: 'mock/previously-released.xlsx',
      preview: {
        ok: true,
        profileId: 'NHSP_PREFINAL_RELEASED_V1',
        rows: [{ candidateName: 'Kier Arthur', shiftDate: '2026-09-08', actualTotal: 2.5 }],
        fatalErrors: [],
        warnings: []
      },
      accept_context: {
        file_key: 'mock/previously-released.xlsx',
        original_filename: 'previously-released.xlsx',
        source_group_id: '11111111-1111-4111-8111-111111111111',
        source_cycle_id: '22222222-2222-4222-8222-222222222222',
        client_id: null,
        report_scope_id: null,
        profile_id: 'NHSP_PREFINAL_RELEASED_V1'
      }
    });
    const payload = actions.buildUploadAcceptancePayload(model, { confirmed: true });
    return {
      ok: model.ok,
      authorityReady: model.authority_ready,
      hasClientId: Object.hasOwn(payload, 'client_id'),
      hasReportScopeId: Object.hasOwn(payload, 'report_scope_id'),
      html: actions.renderPreview(model, { confirmed: true })
    };
  });

  expect(result.ok).toBe(true);
  expect(result.authorityReady).toBe(true);
  expect(result.hasClientId).toBe(false);
  expect(result.hasReportScopeId).toBe(false);
  expect(result.html).not.toContain('This file cannot be accepted yet');
  expect(result.html).not.toContain('data-wsa-accept disabled');
});

test('switching tabs fetches the selected tab rows instead of reusing a partial workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    win.__workspaceUrls = [];
    win.authFetch = async (url: string) => {
      const requestUrl = String(url);
      win.__workspaceUrls.push(requestUrl);
      const payload = JSON.parse(JSON.stringify(workspaceFixture));
      if (requestUrl.includes('tab=finalise')) {
        payload.imports.rows = [];
        payload.imports.total_count = 1;
      }
      if (requestUrl.includes('tab=imports')) {
        payload.imports.rows = [{
          row_key: 'selected-tab-upload',
          file: 'SELECTED_TAB_SOURCE.xlsx',
          uploaded: '22 Sep 2026 19:30',
          rows: '2',
          report: '990100001',
          cutoff: '23 Sep 2026 15:00',
          status: { text: 'Ready', tone: 'positive' },
          final_source: '—',
          actions: [{ label: 'View', enabled: true }]
        }];
        payload.imports.total_count = 1;
      }
      return { ok: true, json: async () => payload };
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open('finalise');
    await win.__modalStack.at(-1).setTab('imports');
  }, fixtures.workspace);

  await expect(page.getByText('SELECTED_TAB_SOURCE.xlsx', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing matches the current filters.')).toHaveCount(0);
  const urls = await page.evaluate(() => (window as any).__workspaceUrls);
  expect(urls.some((url: string) => url.includes('tab=finalise'))).toBe(true);
  expect(urls.some((url: string) => url.includes('tab=imports'))).toBe(true);
});

test('NHSP import review and finalise show the accepted source facts without blank details', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.profile = {
      id: 'NHSP_FINAL_BACKING_V1',
      label: 'NHSP backing report',
      finalise_label: 'Finalise report'
    };
    payload.imports.rows = [{
      row_key: 'nhsp-accepted-report',
      file: 'NHSP_STAGE8_TEST_CLIENT_KIER_ARTHUR_INITIAL.xlsx',
      uploaded: '22 Sep 2026 10:15',
      rows: '2',
      report: '990100001',
      cutoff: '16 Sep 2026 15:00',
      status: { text: 'Ready to review', tone: 'positive' },
      final_source: 'Current',
      actions: [{ label: 'Review', enabled: true }]
    }];
    payload.imports.total_count = 1;
    payload.finalise.active_list = 'ready';
    payload.finalise.ready = {
      total_count: 1,
      rows: [{
        row_key: 'nhsp-ready-row',
        candidate: 'Kier Arthur',
        day_date: 'Tue 15 Sep 2026',
        actual_hours: '09:00-17:00 · 30 min break · 7.5 hours',
        movement: 'Positive',
        commission: '£10.00',
        total_cost: '£90.00',
        invoice_charge: '£100.00',
        status: { text: 'Ready', tone: 'positive' }
      }]
    };
    payload.finalise.blocked = { total_count: 0, rows: [] };
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    await (window as any).__modalStack.at(-1).setTab('imports');
  }, fixtures.workspace);

  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: 'NHSP_STAGE8_TEST_CLIENT_KIER_ARTHUR_INITIAL.xlsx' })).toBeVisible();
  await expect(page.getByText('22 Sep 2026 10:15', { exact: true })).toBeVisible();
  await expect(page.getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByText('990100001', { exact: true })).toBeVisible();
  await expect(page.getByText('Current', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();

  await page.evaluate(async () => {
    (window as any).CloudTMSWeeklySourceImportWorkspaceV1._session.loadedTab = 'finalise';
    await (window as any).__modalStack.at(-1).setTab('finalise');
  });
  const table = page.locator('.ws-scroll table');
  await expect(table.getByText('09:00-17:00 · 30 min break · 7.5 hours')).toBeVisible();
  await expect(table.getByText('Positive', { exact: true })).toBeVisible();
  await expect(table.getByText('£10.00', { exact: true })).toBeVisible();
  await expect(table.getByText('£90.00', { exact: true })).toBeVisible();
  await expect(table.getByText('£100.00', { exact: true })).toBeVisible();
  await expect(table.getByText('—')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('nhsp-accepted-report-finalise-facts.png'), fullPage: true });
});

for (const tab of ['imports', 'queries'] as const) {
  test(`${tab} appends the next cursor page on scrolling without numbered pages`, async ({ page }) => {
    await page.setViewportSize({ width: 1700, height: 900 });
    await loadFoundation(page);
    await page.addStyleTag({ content: '.ws-scroll{max-height:180px!important;overflow-y:auto!important}' });
    await page.evaluate(({ fixture, activeTab }) => {
      const win = window as any;
      const first = structuredClone(fixture);
      const second = structuredClone(fixture);
      const original = first[activeTab].rows[0];
      const makeRow = (index: number) => activeTab === 'imports'
        ? { ...original, row_key: `page-one-${index}`, file: `Page one ${index}.xlsx` }
        : { ...original, group_key: `page-one-${index}`, candidate: `Page one candidate ${index}`, expanded: false };
      first[activeTab].rows = Array.from({ length: 30 }, (_, index) => makeRow(index));
      first[activeTab].total_count = 31;
      first[activeTab].has_more = true;
      first[activeTab].next_cursor = 'cursor-page-two';
      second[activeTab].rows = [activeTab === 'imports'
        ? { ...original, row_key: 'page-two', file: 'Page two file.xlsx' }
        : { ...original, group_key: 'page-two', candidate: 'Page two candidate', expanded: false }];
      second[activeTab].total_count = 31;
      second[activeTab].has_more = false;
      second[activeTab].next_cursor = '';
      win.__cursorRequests = [];
      win.authFetch = async (url: string) => {
        const parsed = new URL(String(url), 'https://weekly-source.test/');
        const cursor = parsed.searchParams.get('cursor') || '';
        win.__cursorRequests.push({ tab: parsed.searchParams.get('tab'), cursor });
        return { ok: true, json: async () => cursor === 'cursor-page-two' ? second : first };
      };
    }, { fixture: fixtures.workspace, activeTab: tab });
    await page.evaluate(async (activeTab) => {
      await (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open();
      if (activeTab !== 'imports') await (window as any).__modalStack.at(-1).setTab(activeTab);
    }, tab);
    const scroll = page.locator(`.ws-workspace[data-ws-tab="${tab}"] [data-ws-scroll]`);
    await expect(scroll).toBeVisible();
    await expect(page.getByText(tab === 'imports' ? 'Page one 29.xlsx' : 'Page one candidate 29')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__cursorRequests.some((request: any) => request.cursor))).toBe(false);
    await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByText(tab === 'imports' ? 'Page two file.xlsx' : 'Page two candidate', { exact: true })).toBeVisible();
    const cursorRequests = await page.evaluate(() => (window as any).__cursorRequests.filter((request: any) => request.cursor));
    expect(cursorRequests).toEqual([{ tab, cursor: 'cursor-page-two' }]);
    await expect(page.getByText(tab === 'imports' ? 'Page one 0.xlsx' : 'Page one candidate 0', { exact: true })).toHaveCount(1);
    await expect(page.locator('.ws-workspace').getByRole('navigation', { name: /pagination/i })).toHaveCount(0);
  });
}

test('an ineligible candidate reminder stays disabled and explains its cooldown only on hover or focus', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await loadFoundation(page);
  await page.evaluate((workspaceFixture) => {
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.queries.rows[0].actions = [
      { label: 'Open', enabled: true, payload: { detail: { candidate: 'Jane Smith' } } },
      { label: 'Remind candidate', kind: 'COMMAND', command: 'REMIND_CANDIDATE', enabled: false,
        reason: 'A reminder can be sent after Wed 23 Sep 2026 22:46.', payload: {} }
    ];
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    document.getElementById('modalBody')!.innerHTML = api.renderWorkspace(api.normaliseWorkspace(payload), 'queries', api._session);
  }, fixtures.workspace);
  const reminder = page.getByRole('button', { name: 'Remind candidate' });
  await expect(reminder).toBeDisabled();
  await expect(reminder.locator('..')).toHaveAttribute('title', 'A reminder can be sent after Wed 23 Sep 2026 22:46.');
  expect(await page.locator('.ws-action-hint .sr-only').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  expect(await page.locator('.ws-query-scroll').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
});

test('Imports keeps signed-Timesheet checks inside the same weekly workspace', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.imports.journey = {
      authority_mode: 'TIMESHEET_AUTHORITY',
      title: 'Signed Timesheet decides hours',
      body: 'Timesheet hours are used. The client system is checked so matching references can be added.',
      attention_count: 2,
      attention_rows: [
        { row_key: 'authority-1', candidate: 'Abigail Jones', day_date: 'Mon 14 Sep 2026', attention: 'Hours are different', reference: 'Not added', status: { text: 'Manager correction needed', tone: 'warning' }, actions: [{ label: 'View Timesheet', enabled: true, payload: { timesheet_id: 'timesheet-1' } }, { label: 'Email manager', enabled: true, payload: { comparison_id: 'comparison-1' } }] },
        { row_key: 'authority-2', candidate: 'Jane Smith', day_date: 'Tue 15 Sep 2026', attention: 'Reference is missing', reference: 'Not added', status: { text: 'Reference needed', tone: 'warning' }, actions: [{ label: 'View Timesheet', enabled: true, payload: { timesheet_id: 'timesheet-2' } }] }
      ]
    };
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    await (window as any).__modalStack.at(-1).setTab('imports');
  }, fixtures.workspace);
  await expect(page.getByText('Signed Timesheet decides hours')).toBeVisible();
  await expect(page.getByText('Timesheet hours are used. The client system is checked so matching references can be added.')).toBeVisible();
  await expect(page.getByText('Hours are different')).toBeVisible();
  await expect(page.getByText('Reference is missing')).toBeVisible();
  await expect(page.getByRole('button', { name: /select all|unselect all/i })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Select all visible rows' })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('weekly-imports-two-journeys.png'), fullPage: true });
});

test('Finalise tracker stays simple and no-shifts certification uses the exact server action', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async () => {
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    await (window as any).__modalStack.at(-1).setTab('finalise');
  });
  await page.waitForTimeout(50);

  await expect(page.getByRole('heading', { name: 'Finalisation progress' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Finalisation week' })).toHaveValue('22222222-2222-4222-8222-222222222222');
  await expect(page.getByText('Royal Berkshire NHS Trust')).toBeVisible();
  await expect(page.getByRole('button', { name: 'No shifts to import' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('weekly-source-finalisation-tracker.png'), fullPage: true });

  await page.getByRole('button', { name: 'No shifts to import' }).click();
  await page.waitForTimeout(25);
  await expect(page.getByRole('heading', { name: 'No shifts to import' })).toBeVisible();
  await expect(page.getByText('Royal Berkshire NHS Trust', { exact: true })).toBeVisible();
  await page.getByLabel('I confirm there are no shifts to import for this week.').check();
  await page.getByRole('button', { name: 'Confirm no shifts to import' }).click();
  await page.waitForTimeout(50);

  const sent = await page.evaluate(() => (window as any).__requests[0]);
  expect(sent).toEqual({
    action: 'NO_SHIFTS_TO_IMPORT',
    payload: {
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      source_group_id: '11111111-1111-4111-8111-111111111111',
      client_id: '63333333-3333-4333-8333-333333333333',
      expected_cycle_version: 3,
      attestation_text: 'No shifts to import'
    }
  });
});

test('NHSP earlier-week filter changes the selected server cycle without changing the locked context bar', async ({ page }) => {
  await loadFoundation(page);
  await page.evaluate(() => {
    const win = window as any;
    const originalFetch = win.authFetch;
    win.__cycleRequests = [];
    win.authFetch = async (url: string, options: any = {}) => {
      if (String(url).includes('/workspace')) {
        const request = Object.fromEntries(new URLSearchParams(String(url).split('?')[1] || '').entries());
        win.__cycleRequests.push(request);
        const payload = structuredClone(win.__workspaceFixture);
        if (request.source_cycle_id === '52222222-2222-4222-8222-222222222222') {
          payload.selected = { source_group_id: '11111111-1111-4111-8111-111111111111', source_cycle_id: request.source_cycle_id };
          payload.finalise.tracker.cycle_id = request.source_cycle_id;
          payload.finalise.tracker.cycle_label = 'Week ending 6 Sep 2026';
        }
        return { ok: true, json: async () => payload };
      }
      return originalFetch(url, options);
    };
  });
  await page.evaluate(async (fixture) => {
    (window as any).__workspaceFixture = fixture;
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    await (window as any).__modalStack.at(-1).setTab('finalise');
  }, fixtures.workspace);
  await page.getByRole('combobox', { name: 'Finalisation week' }).selectOption('52222222-2222-4222-8222-222222222222');
  const last = await page.evaluate(() => (window as any).__cycleRequests.at(-1));
  expect(last.source_cycle_id).toBe('52222222-2222-4222-8222-222222222222');
  await expect(page.getByRole('combobox', { name: 'Finalisation week' })).toHaveValue('52222222-2222-4222-8222-222222222222');
  await expect(page.getByRole('combobox', { name: 'Trust' })).toHaveCount(1);
  await expect(page.locator('.ws-context-bar [data-ws-context="cycle"]')).toHaveCount(0);
  expect(last.client_id).toBe('');
  expect(last.report_scope_id).toBe('');
});

for (const width of [360, 720, 1120]) {
  test(`NHSP week filter stays compact and usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 820 });
    await loadFoundation(page);
    await page.evaluate(async () => {
      const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
      await api.open();
      await (window as any).__modalStack.at(-1).setTab('finalise');
    });
    await expect(page.getByRole('combobox', { name: 'Finalisation week' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Finalisation progress' })).toBeVisible();
    const bounds = await page.getByRole('combobox', { name: 'Finalisation week' }).boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`nhsp-finalisation-week-${width}.png`), fullPage: true });
  });
}

test('Weekly Source sort headings stay flat inside the real modern Office modal', async ({ page }) => {
  await mountOfficeShell(page);
  await page.evaluate(() => {
    const modal = document.getElementById('modal')!;
    modal.classList.add('ctms-modern-modal');
    modal.innerHTML = '<div id="modalBody"><table class="grid mini ws-grid ws-import-grid"><thead><tr><th><button type="button" data-ws-sort="uploaded">Uploaded <span aria-hidden="true">↓</span></button></th><th>Rows</th></tr></thead><tbody><tr><td><span class="ws-import-filename" title="NHSP_STAGE8_PREVIOUSLY_RELEASED_KIER_ARTHUR_2026-09-08_FORMAT_PRESERVED.xlsx">NHSP_STAGE8_PREVIOUSLY_RELEASED_KIER_ARTHUR_2026-09-08_FORMAT_PRESERVED.xlsx</span></td><td>2</td></tr></tbody></table></div>';
    document.getElementById('modalBack')!.style.display = 'flex';
    (window as any).__applyCloudTmsModalModernisation();
  });
  const header = page.locator('#modal .ws-grid th button[data-ws-sort]');
  await expect(header).toBeVisible();
  expect((await header.getAttribute('class')) || '').not.toContain('ctms-action-primary');
  const appearance = await header.evaluate((node) => {
    const style = getComputedStyle(node);
    return { border: style.borderTopWidth, background: style.backgroundColor, radius: style.borderRadius, padding: style.paddingLeft };
  });
  expect(appearance).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)', radius: '0px', padding: '0px' });
  const filename = await page.locator('#modal .ws-import-filename').evaluate((node) => ({
    cellWidth: node.getBoundingClientRect().width,
    contentWidth: node.scrollWidth,
    wrapping: getComputedStyle(node).overflowWrap,
    lineClamp: getComputedStyle(node).webkitLineClamp,
    fullName: node.getAttribute('title')
  }));
  expect(filename.contentWidth).toBeLessThanOrEqual(Math.ceil(filename.cellWidth));
  expect(filename.wrapping).toBe('anywhere');
  expect(filename.lineClamp).toBe('2');
  expect(filename.fullName).toContain('FORMAT_PRESERVED.xlsx');
});

test('History keeps the current pay cycle and long details compact but accessible', async ({ page }) => {
  await loadFoundation(page);
  await page.evaluate(async () => {
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    await (window as any).__modalStack.at(-1).setTab('history');
  });
  await expect(page.getByRole('combobox', { name: 'Period' })).toHaveValue('CURRENT_PAY_CYCLE');
  const detail = page.locator('.ws-history-grid .ws-history-detail').first();
  await expect(detail).toBeVisible();
  expect(await detail.getAttribute('title')).toContain('Backing report 1741227.xlsx');
  const measured = await detail.evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    contentWidth: node.scrollWidth,
    wrapping: getComputedStyle(node).overflowWrap,
    lineClamp: getComputedStyle(node).webkitLineClamp
  }));
  expect(measured.contentWidth).toBeLessThanOrEqual(Math.ceil(measured.width));
  expect(measured.wrapping).toBe('anywhere');
  expect(measured.lineClamp).toBe('2');
});

test('before cutoff deliberately locks finalisation against the shared modal control reset', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.context.cycle_state = 'Before cutoff';
    payload.finalise.active_list = 'ready';
    payload.finalise.ready = { total_count: 2, rows: [] };
    payload.finalise.blocked = { total_count: 0, rows: [] };
    payload.finalise.finalise_enabled = false;
    payload.finalise.finalise_payload = {
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      report_scope_id: '33333333-3333-4333-8333-333333333333'
    };
    const api = win.CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    api._session.loadedTab = 'finalise';
    await win.__modalStack.at(-1).setTab('finalise');

    // Recreate the shared modal's normal editable-mode pass. Only controls
    // explicitly marked as policy locks are allowed to remain disabled.
    document.querySelectorAll('#modalBody input, #modalBody button').forEach((control: any) => {
      control.disabled = control.dataset.ctmsIntentionalLock === '1';
    });
  }, fixtures.workspace);

  const confirmation = page.getByLabel(/I confirm this is the complete final NHSP backing report/);
  const action = page.getByRole('button', { name: 'Finalise report', exact: true });
  await expect(confirmation).toBeDisabled();
  await expect(action).toBeDisabled();

  // The command handler independently refuses the action if another UI layer
  // ever disturbs the disabled property.
  await action.evaluate((button: HTMLButtonElement) => {
    button.disabled = false;
    button.click();
  });
  await page.waitForTimeout(25);
  const finaliseRequests = await page.evaluate(() => (window as any).__requests.filter((request: any) => request.action === 'FINALISE_WEEK'));
  expect(finaliseRequests).toEqual([]);
  await expect(action).toBeDisabled();
});

test('final NHSP rate warnings use the far-left header selection and require explicit acceptance', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.finalise.rate_warnings = {
      contract: 'NHSP_RATE_WARNING_WORKSPACE_V1', phase: 'FINAL_AWAITING_ACCEPTANCE', total_count: 2,
      notice: { title: 'Possible Trust rate card issue', body: 'One shift has a £0 source charge. Check the Trust rate card in NHSP before accepting.' },
      rows: [
        { warning_key: 'zero-row', candidate: 'Amara Patel', day_date: 'Mon 14 Sep 2026', source_charge: '£0.00', warning: 'Possible NHSP rate card issue', accept_eligible: true, detail_rows: [{ candidate: 'Amara Patel', day_date: 'Mon 14 Sep 2026', source_charge: '£0.00', warning: 'Possible NHSP rate card issue' }] },
        { warning_key: 'different-row', candidate: 'Elliot James', day_date: 'Tue 15 Sep 2026', source_charge: '£248.00', warning: 'Rate card expired or wrong Contract rate', accept_eligible: true }
      ],
      acceptance: {
        enabled: true, action: 'ACCEPT_NHSP_SOURCE_CHARGES',
        payload: { source_cycle_id: '22222222-2222-4222-8222-222222222222', projection_publication_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
        selection: { key: 'warning_keys', proof_key: 'selection_proof', proof: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }
      }
    };
    const api = win.CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    api._session.loadedTab = 'finalise';
    await win.__modalStack.at(-1).setTab('finalise');
  }, fixtures.workspace);
  await page.waitForTimeout(50);

  await expect(page.getByText('Possible Trust rate card issue')).toBeVisible();
  await expect(page.getByText('Rate card expired or wrong Contract rate')).toBeVisible();
  await expect(page.getByRole('button', { name: /select all|unselect all/i })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('weekly-source-nhsp-final-rate-warnings.png'), fullPage: true });
  const header = page.getByRole('checkbox', { name: 'Select visible rate warnings' });
  await expect(header).toHaveCount(1);
  await header.check();
  await expect(page.getByLabel('Select Amara Patel')).toBeChecked();
  await expect(page.getByLabel('Select Elliot James')).toBeChecked();
  const accept = page.getByRole('button', { name: 'Accept selected source charges' });
  await expect(accept).toBeDisabled();
  await page.getByLabel('I have checked the warnings shown.').check();
  await expect(accept).toBeEnabled();
  await accept.click();
  await page.waitForTimeout(50);
  const request = await page.evaluate(() => (window as any).__requests.at(-1));
  expect(request).toEqual({
    action: 'ACCEPT_NHSP_SOURCE_CHARGES',
    payload: {
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      projection_publication_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      warning_keys: ['zero-row', 'different-row'],
      selection_proof: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    }
  });
});

test('pre-final NHSP rate warnings explain the issue without blocking the checking journey', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.finalise.rate_warnings = {
      contract: 'NHSP_RATE_WARNING_WORKSPACE_V1', phase: 'PREFINAL', total_count: 2,
      notice: { title: 'Possible Trust rate card issue', body: 'One shift has a £0 source charge. Check the Trust rate card in NHSP.' },
      rows: [
        { warning_key: 'zero-row', candidate: 'Amara Patel', day_date: 'Mon 14 Sep 2026', source_charge: '£0.00', warning: 'Possible NHSP rate card issue', accept_eligible: false },
        { warning_key: 'different-row', candidate: 'Elliot James', day_date: 'Tue 15 Sep 2026', source_charge: '£248.00', warning: 'Rate card expired or wrong Contract rate', accept_eligible: false }
      ],
      acceptance: { enabled: false }
    };
    const api = win.CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    api._session.loadedTab = 'finalise';
    await win.__modalStack.at(-1).setTab('finalise');
  }, fixtures.workspace);
  await page.waitForTimeout(50);

  await expect(page.getByText('Possible Trust rate card issue')).toBeVisible();
  await expect(page.getByText('Rate card expired or wrong Contract rate')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept selected source charges' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('nhsp-prefinal-rate-warnings.png'), fullPage: true });
});

test('HealthRoster finalisation uses the same simple finalise workspace with the client source label', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.profile = {
      id: 'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1',
      label: 'HealthRoster Timesheet Export',
      finalise_label: 'Finalise source'
    };
    payload.context.controls[0] = {
      key: 'source_group', label: 'Source', value: 'roster',
      options: [{ value: 'roster', label: 'HealthRoster Timesheet Export' }]
    };
    payload.context.controls[1].label = 'Client';
    payload.finalise.source_summary = 'HealthRoster final source · week ending 20 Sep 2026';
    payload.finalise.active_list = 'blocked';
    payload.finalise.ready = { total_count: 0, rows: [] };
    payload.finalise.blocked = { total_count: 1, rows: [{ candidate: 'Abigail Jones', day_date: 'Mon 14 Sep 2026', system_hours: '20:00-08:00 · 60 min break · 11 hours', status: { text: 'Not finalised', tone: 'warning' }, actions: [{ label: 'Open', enabled: true }] }] };
    payload.finalise.confirmation_text = 'I confirm this is the final source for this week.';
    payload.finalise.tracker = {
      title: 'Finalisation progress', cycle_label: 'Week ending 20 Sep 2026', complete: false,
      rows: [
        { source: 'HealthRoster Timesheet Export', client: "St Mary's NHS Trust", status: { text: 'Finalised', tone: 'positive' }, detail: '20 Sep 2026 15:06', actions: [] },
        { source: 'HealthRoster Timesheet Export', client: 'Royal Berkshire NHS Trust', status: { text: 'Not finalised', tone: 'warning' }, detail: '', actions: [{ label: 'No shifts to import', enabled: true }] }
      ]
    };
    payload.finalise.rate_warnings = { contract: 'NHSP_RATE_WARNING_WORKSPACE_V1', phase: 'NONE', total_count: 0, rows: [], acceptance: { enabled: false } };
    const api = win.CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    api._session.loadedTab = 'finalise';
    await win.__modalStack.at(-1).setTab('finalise');
  }, fixtures.workspace);
  await expect(page.getByText('HealthRoster final source · week ending 20 Sep 2026')).toBeVisible();
  const finaliseTable = page.locator('.ws-scroll table');
  for (const heading of ['Candidate', 'Day/date', 'System hours', 'Status', 'Action']) {
    await expect(finaliseTable.getByRole('columnheader', { name: heading })).toBeVisible();
  }
  await expect(page.getByText('20:00-08:00 · 60 min break · 11 hours')).toBeVisible();
  await expect(finaliseTable.getByText('Not finalised')).toBeVisible();
  await expect(finaliseTable.getByRole('columnheader', { name: 'Problem' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finalise source' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('healthroster-finalise.png'), fullPage: true });
});

test('preview, contract choice and Correct final source follow deterministic policy screens', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);

  await page.evaluate((preview) => window.dispatchEvent(new CustomEvent('cloudtms:weekly-source-preview', { detail: preview })), fixtures.nhspPreview);
  await page.waitForTimeout(25);
  await expect(page.getByRole('heading', { name: 'Review source file' })).toBeVisible();
  await expect(page.getByText("St Mary's NHS Trust", { exact: true }).first()).toBeVisible();
  await expect(page.getByText('1741227', { exact: true })).toBeVisible();
  await page.getByLabel(/I confirm this is the complete final NHSP backing report/).check();
  await expect(page.getByRole('button', { name: 'Accept source file' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('nhsp-ready-finalise.png'), fullPage: true });

  await page.evaluate(() => { (window as any).__modalStack.at(-1).isDirty = true; });
  await page.getByRole('button', { name: 'Accept source file' }).click();
  await expect(page.locator('#modalBody')).toBeEmpty();
  expect(await page.evaluate(() => (window as any).__modalStack.length)).toBe(0);
  expect(await page.evaluate(() => (window as any).__nativeConfirmCalls)).toBe(0);
  expect(await page.evaluate(() => (window as any).__requests.some((request: any) => request.action === 'UPLOAD_ACCEPT'))).toBe(true);

  await page.evaluate((payload) => (window as any).CloudTMSWeeklySourceWorkspaceActionsV1.handleAction({ label: 'Choose contract', payload }), fixtures.contractChooser);
  await page.waitForTimeout(25);
  const choices = page.getByRole('radio');
  await expect(choices).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) await expect(choices.nth(index)).not.toBeChecked();
  await choices.nth(1).check();
  await expect(page.getByRole('button', { name: 'Use selected contract' })).toBeEnabled();
  const contractText = await page.locator('#modalBody').innerText();
  expect(contractText).not.toMatch(/£|hourly rate|source charge|calculated charge|source_row_ordinal/i);
  await page.screenshot({ path: testInfo.outputPath('choose-contract.png'), fullPage: true });

  await page.evaluate(() => (window as any).closeModal());
  await page.evaluate((payload) => (window as any).CloudTMSWeeklySourceWorkspaceActionsV1.handleAction({ label: 'Correct final source', payload }), fixtures.correctFinal);
  await page.waitForTimeout(25);
  await expect(page.getByText('The previous final version will remain in History.')).toBeVisible();
  await expect(page.getByText('Upload the replacement source file again')).toBeVisible();
  await expect(page.getByText('Backing report 1741228 · uploaded 16 Sep 2026 16:10')).toHaveCount(0);
  await expect(page.getByText('This shift is already on an invoice.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review replacement' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /remove|exclude|ignore/i })).toHaveCount(0);
  await page.locator('[data-wsa-replacement-file]').setInputFiles({
    name: 'replacement-report.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('replacement-source-bytes')
  });
  await expect(page.getByRole('button', { name: 'Review replacement' })).toBeEnabled();
  await page.getByRole('button', { name: 'Review replacement' }).click();
  await expect(page.getByRole('tab', { name: 'Changes (1)' })).toBeVisible();
  await expect(page.getByText('Jane Smith')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply corrected final source' })).toBeDisabled();
  await page.getByLabel('Reason').fill('The wrong report was finalised.');
  await page.getByLabel(fixtures.correctFinalPreview.confirmation_text).check();
  await expect(page.getByRole('button', { name: 'Apply corrected final source' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('weekly-source-correct-final.png'), fullPage: true });
  await page.getByRole('button', { name: 'Apply corrected final source' }).click();
  await page.waitForTimeout(50);
  const correctionRequests = await page.evaluate(() => (window as any).__requests.slice(-2));
  expect(correctionRequests.map((request: any) => request.action)).toEqual([
    'PREVIEW_CORRECT_FINAL_SOURCE', 'APPLY_CORRECT_FINAL_SOURCE'
  ]);
  expect(correctionRequests[0].payload.replacement_source.file_key).toBe('mock/replacement-report.xlsx');
  expect(correctionRequests[1].payload.reason).toBe('The wrong report was finalised.');
  expect(correctionRequests[1].payload.confirmation_text).toBe(fixtures.correctFinalPreview.confirmation_text);
  expect(correctionRequests[1].payload).not.toHaveProperty('root_service_snapshots');
});

for (const viewport of [
  { name: 'fold', width: 280, height: 653 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 }
]) {
  test(`${viewport.name} query workspace is readable without horizontal panning`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loadFoundation(page);
    await page.evaluate((payload) => {
      const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
      const model = api.normaliseWorkspace(payload);
      document.getElementById('modalBody')!.innerHTML = api.renderWorkspace(model, 'queries', api._session);
    }, fixtures.workspace);

    await expect(page.locator('.ws-mobile-sort')).toBeVisible();
    await expect(page.getByLabel('Sort by')).toHaveValue('candidate');
    await expect(page.locator('.ws-sticky-footer')).toHaveCSS('position', 'static');
    await expect(page.getByLabel('Select all query groups')).toBeVisible();
    await expect(page.getByText('Jane Smith', { exact: true })).toBeVisible();
    const widths = await page.evaluate(() => {
      const pageRoot = document.documentElement;
      const region = document.querySelector('[data-ws-scroll]')!;
      return {
        pageClient: pageRoot.clientWidth,
        pageScroll: pageRoot.scrollWidth,
        regionClient: region.clientWidth,
        regionScroll: region.scrollWidth
      };
    });
    expect(widths.pageScroll).toBe(widths.pageClient);
    expect(widths.regionScroll).toBeLessThanOrEqual(widths.regionClient + 1);
    const groupToggle = page.locator('[data-ws-expand]').first();
    if (await groupToggle.getAttribute('aria-expanded') !== 'true') await groupToggle.click();
    await expect(page.getByText('09:00-18:00 (30 min break)', { exact: true })).toBeVisible();
    await expect(page.getByText('09:00-17:00 (30 min break)', { exact: true }).first()).toBeVisible();
    const expandedWidths = await page.evaluate(() => {
      const region = document.querySelector('[data-ws-scroll]')!;
      return { client: region.clientWidth, scroll: region.scrollWidth };
    });
    expect(expandedWidths.scroll).toBeLessThanOrEqual(expandedWidths.client + 1);
    await page.screenshot({ path: testInfo.outputPath(`weekly-source-queries-${viewport.name}.png`), fullPage: true });
  });
}

test('Stage 11: real Office import modal keeps mobile query controls compact and complete', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await mountOfficeShell(page, {
    broker(pathname) {
      if (pathname.startsWith('/api/weekly-source/v1/workspace')) return fixtures.workspace;
      return undefined;
    }
  });

  await page.waitForFunction(() => typeof (window as any).CloudTMSWeeklySourceImportWorkspaceV1?.open === 'function', null, { timeout: 30_000 });
  await page.evaluate(() => { void (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open(); });
  await expect(page.locator('#modal')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#modalTitle')).toContainText('Weekly source imports');
  await page.locator('#modalTabs').getByRole('button', { name: /^Queries(?:\s|$)/ }).click();
  await expect(page.getByText('Jane Smith', { exact: true })).toBeVisible();

  const filters = page.locator('.ws-query-filter-menu');
  const actions = page.locator('.ws-query-actions-menu');
  await expect(filters).not.toHaveAttribute('open', '');
  await expect(actions).not.toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Ask selected candidates' })).toBeHidden();
  await expect(page.locator('[data-ws-bulk-action="ASK_CANDIDATES"]')).toBeDisabled();
  await expect(page.locator('[data-ws-bulk-action="SEND_MANAGER_NOW"]')).toBeDisabled();

  await page.getByLabel('Select Jane Smith').check();
  await expect(page.locator('[data-ws-actions-summary]')).toContainText('Actions for 1 selected');
  await expect(page.locator('[data-ws-bulk-action="ASK_CANDIDATES"]')).toBeEnabled();
  await page.getByLabel('Select Jane Smith').uncheck();
  await expect(page.locator('[data-ws-bulk-action="ASK_CANDIDATES"]')).toBeDisabled();
  await expect(page.locator('[data-ws-bulk-action="SEND_MANAGER_NOW"]')).toBeDisabled();
  await page.getByLabel('Select Jane Smith').check();
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    modalClient: document.querySelector('#modal')?.clientWidth || 0,
    modalScroll: document.querySelector('#modal')?.scrollWidth || 0
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
  expect(size.modalScroll).toBeLessThanOrEqual(size.modalClient + 1);
  await page.locator('#modal').screenshot({ path: testInfo.outputPath('UI-064-real-query-phone.png') });

  await page.locator('[data-ws-actions-summary]').click();
  await expect(page.getByRole('button', { name: 'Ask selected candidates' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send selected to manager now' })).toBeVisible();
  await expect(page.getByRole('button', { name: /select all|unselect all/i })).toHaveCount(0);
  await page.locator('#modal').screenshot({ path: testInfo.outputPath('UI-075-real-query-actions-phone.png') });

  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(page.locator('.ws-query-grid > tbody > tr[data-ws-group-key]')).toHaveCSS('display', 'grid');
  await expect(page.locator('.ws-query-grid > tbody > tr[data-ws-group-key] > td.ws-actions').first()).toBeVisible();
  const intermediate = await page.evaluate(() => {
    const region = document.querySelector('.ws-query-scroll')!;
    const actionsCell = document.querySelector('.ws-query-grid > tbody > tr[data-ws-group-key] > td.ws-actions')!;
    const box = actionsCell.getBoundingClientRect();
    const row = actionsCell.closest('tr')!.getBoundingClientRect();
    return { pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      regionOverflow: region.scrollWidth - region.clientWidth, actionRight: box.right, rowRight: row.right };
  });
  expect(intermediate.pageOverflow).toBeLessThanOrEqual(1);
  expect(intermediate.regionOverflow).toBeLessThanOrEqual(1);
  expect(intermediate.actionRight).toBeLessThanOrEqual(intermediate.rowRight + 1);
  await page.locator('#modal').screenshot({ path: testInfo.outputPath('UI-075-real-query-actions-intermediate.png') });

  expect(errors).toEqual([]);
  expect(externalRequests(page)).toEqual([]);
});
