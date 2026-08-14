import { expect, test, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

const root = resolve(__dirname, '../..');
const testOrigin = 'https://testmode.arthur-rai.co.uk';
const testBackend = 'https://test-cloudtms-backend.kier-88a.workers.dev';
const localAssets = [
  'index.html',
  'js/main.js',
  'js/candidate-office-contract-v1.js',
  'js/candidate-office-api-v1.js',
  'js/candidate-office-presenter-v1.js',
  'js/candidate-office-surface-v1.js',
  'js/candidate-office-bridge-v1.js',
  'js/candidate-office-reminder-workspace-v1.js'
];
const sourceByPath = new Map(localAssets.map(file => [`/${file === 'index.html' ? 'index.html' : file.replaceAll('\\', '/')}`, readFileSync(resolve(root, file), 'utf8')]));
const mainSha256 = createHash('sha256').update(sourceByPath.get('/js/main.js') || '').digest('hex');

const uuid = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const summaryRows = [
  ['1', 'Alpha', 'FINALISED'],
  ['2', 'Bravo', 'CREATED'],
  ['3', 'Charlie', 'REJECTED'],
  ['4', 'Delta', 'AWAITING_MANAGER_APPROVAL'],
  ['5', 'Echo', 'MANAGER_APPROVED'],
  ['6', 'Foxtrot', 'WORKER_SUBMITTED']
].map(([number, candidate, status], index) => ({
  id: uuid(index + 1),
  timesheet_id: uuid(index + 1),
  row_key: uuid(index + 1),
  backend_row_signature: `candidate-office-row-${number}`,
  candidate_name: `${candidate} Candidate`,
  client_name: 'Arthur Rai Medical Services',
  week_ending_date: `2026-08-${String(2 + index * 7).padStart(2, '0')}`,
  route_type: 'WEEKLY_ELECTRONIC',
  processing_status_display: 'Unprocessed',
  sheet_scope: 'HOURS',
  total_pay_ex_vat: 100 + index,
  total_charge_ex_vat: 150 + index,
  margin_ex_vat: 50,
  __status: status
}));

const statusForIdentity = (identity: any) => summaryRows.find(row => row.timesheet_id === identity.timesheet_id)?.__status || 'CREATED';
const projectionFor = (identity: any, statusCode = statusForIdentity(identity), paperState = 'NOT_APPLICABLE') => ({
  ok: true,
  contract_version: 'OFFICE_CANDIDATE_TIMESHEET_V1',
  office_contract_version: 'CLOUDTMS_OFFICE_CANDIDATE_API_V1',
  current_identity: {
    row_key: identity.row_key,
    timesheet_id: identity.timesheet_id || null,
    contract_week_id: identity.contract_week_id || null,
    row_signature: identity.expected_row_signature || null,
    route_family: 'ELECTRONIC'
  },
  candidate_status: { code: statusCode, label: `raw ${statusCode}`, tone: 'danger' },
  workflow: statusCode === 'AWAITING_PAPER_RETURN' ? { state: 'AWAITING_PAPER_RETURN' } : null,
  manager_approval: null,
  paper_pack: { state: paperState, retryable: paperState === 'FAILED_RETRYABLE' },
  rejections: [],
  primary_action: null,
  available_actions: [],
  diagnostics: [],
  refresh_hints: { refetch: 'CURRENT_ROW' },
  observed_at_utc: '2026-08-13T08:00:00Z'
});

const capabilities = {
  ok: true,
  contract_version: 'CLOUDTMS_OFFICE_CANDIDATE_API_V1',
  office_contract_version: 'CLOUDTMS_OFFICE_CANDIDATE_API_V1',
  capabilities_version: 'OFFICE_CANDIDATE_CAPABILITIES_V1',
  authority_applies: true,
  mode: 'ENABLED',
  required_office_role: 'admin',
  permission_source: 'OFFICE_ADMIN_ROLE_V1',
  surfaces: { simple_timesheet: true, timesheet_summary: true, bulk_process: true, bulk_authorise: true, invoice_generator: true, invoice_issuer: true },
  permissions: { view_candidate_state: true, change_route: true, reject_submission: true, resubmit_rejected: true, send_manager_reminder: true, send_manager_reminder_batch: true, renew_manager_request: true, cancel_manager_request: true, manage_phone_approval: true, manage_paper: true, retry_finalisation: true, mark_no_work: true }
};

async function installPatchedAssets(page: Page) {
  const counts: Record<string, number> = {};
  await page.route(`${testOrigin}/**`, async route => {
    const url = new URL(route.request().url());
    const key = url.pathname === '/' ? '/index.html' : url.pathname;
    const source = sourceByPath.get(key);
    if (!source) return route.continue();
    counts[key] = (counts[key] || 0) + 1;
    const body = key === '/index.html'
      ? source.replace('</head>', `<script>window.BROKER_BASE_URL=${JSON.stringify(testBackend)};window.__CANDIDATE_OFFICE_LOCAL_PROOF=${JSON.stringify(mainSha256)};</script></head>`)
      : source;
    await route.fulfill({ body, contentType: key.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8', headers: { 'cache-control': 'no-store', 'x-codex-local-asset': 'candidate-office-final-correction' } });
  });
  return counts;
}

type ReminderResultMode = 'PARTIAL' | 'FAILED' | 'LOST_PARTIAL' | 'CONTINUED_UNCERTAIN' | 'RETRY_THEN_UNCERTAIN';

async function installOfficeMocks(page: Page, options: { reminderResult?: ReminderResultMode } = {}) {
  let gridPrefs: any = { grid: { timesheets: { columns: {
    id: { visible: true, order: 0 },
    week_ending_date: { visible: true, order: 1 },
    candidate_name: { visible: true, order: 2 },
    client_name: { visible: true, order: 3 },
    route_type: { visible: true, order: 4 },
    processing_status_display: { visible: true, order: 5 },
    candidate_submission: { visible: true, order: 6 },
    issue_codes: { visible: true, order: 7 },
    sheet_scope: { visible: true, order: 8 }
  } } } };
  const gridPatches: any[] = [];
  let executeCalls = 0;
  let statusCalls = 0;
  let eventualReminderStatus: 'PARTIAL' | 'FAILED' | null = null;
  const executeBodies: any[] = [];
  const reminderRows = [
    { key: uuid(101), name: 'Alice Smith', surname: 'Smith', sent: '2026-08-13T08:00:00Z' },
    { key: uuid(102), name: 'Ben Baines', surname: 'Baines', sent: '2026-08-12T09:00:00Z' },
    { key: uuid(103), name: 'Cara Barker', surname: 'Barker', sent: '2026-08-11T10:00:00Z' }
  ];
  const respond = (route: Route, body: any, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(`${testBackend}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/candidate-app/office-capabilities') return respond(route, capabilities);
    if (path === '/api/users/me/grid-prefs') {
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON();
        gridPatches.push(body);
        gridPrefs.grid[body.section] = { ...(gridPrefs.grid[body.section] || {}), ...(body.prefs || {}) };
      }
      return respond(route, gridPrefs);
    }
    if (path === '/api/timesheets/summary') {
      const pageNumber = Math.max(1, Number(url.searchParams.get('page') || 1));
      const pageSize = Math.max(1, Number(url.searchParams.get('page_size') || 50));
      const start = (pageNumber - 1) * pageSize;
      return respond(route, {
        ok: true, items: summaryRows.slice(start, start + pageSize).map(({ __status, ...row }) => row),
        total: summaryRows.length, count: summaryRows.length, has_more: start + pageSize < summaryRows.length,
        total_pay_ex_vat: 615, total_charge_ex_vat: 915, total_margin_ex_vat: 300
      });
    }
    if (path === '/api/candidate-app/timesheets/office-projections') {
      const body = request.postDataJSON();
      return respond(route, {
        ok: true,
        contract_version: 'OFFICE_CANDIDATE_PROJECTION_BATCH_V1',
        surface: body.surface,
        result_count: body.selected_rows.length,
        results: body.selected_rows.map((identity: any) => ({ ok: true, correlation_key: identity.row_key, projection: projectionFor(identity) }))
      });
    }
    if (path === '/api/candidate-app/manager-reminder-eligibility') {
      const query = String(url.searchParams.get('surname_query') || '').toLowerCase();
      const filtered = reminderRows.filter(row => row.surname.toLowerCase().includes(query));
      return respond(route, {
        ok: true,
        contract_version: 'OFFICE_CANDIDATE_REMINDER_ELIGIBILITY_PAGE_V1',
        catalogue_revision: 'a'.repeat(64), page: 1, page_size: 25,
        page_count: filtered.length ? 1 : 0, total_items: filtered.length, catalogue_total_items: reminderRows.length,
        surname_query: query, sort_by: url.searchParams.get('sort_by') || 'CANDIDATE_SURNAME', sort_direction: url.searchParams.get('sort_direction') || 'ASC',
        matching_selection_keys: filtered.map(row => row.key),
        items: filtered.map((row, index) => ({ selection_key: row.key, candidate_name: row.name, candidate_surname: row.surname, last_manager_email_at_utc: row.sent, identity: { row_key: row.key, timesheet_id: uuid(201 + index), contract_week_id: null, expected_row_signature: `reminder-${row.key}` } }))
      });
    }
    if (path === '/api/candidate-app/manager-reminder-batches/preview') {
      const body = request.postDataJSON();
      const keys = body.selection.mode === 'ALL_ELIGIBLE'
        ? reminderRows.map(row => row.key).filter(key => !body.selection.excluded_row_keys.includes(key))
        : body.selection.included_row_keys;
      return respond(route, {
        ok: true, contract_version: 'OFFICE_CANDIDATE_REMINDER_BATCH_PREVIEW_V1',
        preview_context_hash: 'b'.repeat(64), selection_fingerprint: 'c'.repeat(64), selected_count: keys.length,
        eligible_count: keys.length, skipped_count: 0,
        selected_rows: keys.map((key: string, index: number) => ({ row_key: key, timesheet_id: uuid(301 + index), contract_week_id: null, expected_row_signature: `preview-${key}` }))
      });
    }
    if (path === '/api/candidate-app/manager-reminder-batches' && request.method() === 'POST') {
      executeCalls += 1;
      executeBodies.push(request.postDataJSON());
      if (['LOST_PARTIAL', 'CONTINUED_UNCERTAIN', 'RETRY_THEN_UNCERTAIN'].includes(String(options.reminderResult || ''))) return route.abort('failed');
      const failed = options.reminderResult === 'FAILED';
      const body = request.postDataJSON();
      return respond(route, {
        ok: true, contract_version: 'OFFICE_CANDIDATE_REMINDER_BATCH_RESULT_V1', batch_id: body.batch_id,
        status: failed ? 'FAILED' : 'PARTIAL', success_count: failed ? 0 : 2, skipped_count: failed ? 0 : 1, failure_count: failed ? 3 : 1, items: []
      }, 202);
    }
    if (/^\/api\/candidate-app\/manager-reminder-batches\/[0-9a-f-]+$/i.test(path) && request.method() === 'GET') {
      statusCalls += 1;
      const batchId = path.split('/').pop();
      if (!eventualReminderStatus && options.reminderResult === 'CONTINUED_UNCERTAIN') {
        return respond(route, { ok: false, code: 'CANDIDATE_OFFICE_UNAVAILABLE', error: 'Temporarily unavailable.' }, 503);
      }
      if (!eventualReminderStatus && options.reminderResult === 'RETRY_THEN_UNCERTAIN') {
        if (statusCalls === 1 || statusCalls > 2) {
          return respond(route, { ok: false, code: 'CANDIDATE_REMINDER_BATCH_NOT_FOUND', error: 'The reminder batch was not found.' }, 404);
        }
        return respond(route, { ok: false, code: 'CANDIDATE_OFFICE_UNAVAILABLE', error: 'Temporarily unavailable.' }, 503);
      }
      const failed = eventualReminderStatus === 'FAILED';
      return respond(route, {
        ok: true, contract_version: 'OFFICE_CANDIDATE_REMINDER_BATCH_RESULT_V1', batch_id: batchId,
        status: failed ? 'FAILED' : 'PARTIAL', success_count: failed ? 0 : 2,
        skipped_count: failed ? 0 : 1, failure_count: failed ? 3 : 1, items: []
      });
    }
    return route.continue();
  });
  return {
    gridPatches,
    resolveReminderWith: (status: 'PARTIAL' | 'FAILED') => { eventualReminderStatus = status; },
    metrics: () => ({ executeCalls, statusCalls, executeBodies: structuredClone(executeBodies) })
  };
}

async function openPatchedTest(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  expect(await page.evaluate(() => (window as any).__CANDIDATE_OFFICE_LOCAL_PROOF)).toBe(mainSha256);
  expect(new URL(page.url()).origin).toBe(testOrigin);
  expect(await page.evaluate(() => (window as any).BROKER_BASE_URL)).toBe(testBackend);
}

test('Timesheet Summary Candidate Submission column reorders, resizes, persists and sorts like its peers', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const assets = await installPatchedAssets(page);
  const mocks = await installOfficeMocks(page);
  await openPatchedTest(page);
  await page.locator('button[data-section-key="timesheets"]').click();
  const grid = page.locator('.summary-body[data-summary-section="timesheets"]');
  await expect(grid).toBeVisible();
  const candidate = grid.locator('th[data-col-key="candidate_submission"]');
  await expect(candidate).toBeVisible();
  await expect(candidate).toHaveAttribute('draggable', 'true');
  await expect(grid.locator('td[data-col-key="candidate_submission"]')).toHaveCount(summaryRows.length);
  // Width defaults are persisted asynchronously on first render. Let that
  // initial work settle so every subsequent PATCH belongs to this interaction.
  await page.waitForTimeout(750);

  const headers = grid.locator('th[data-col-key]');
  const beforeOrder = await headers.evaluateAll(items => items.map(header => (header as HTMLElement).dataset.colKey));
  const candidateStartIndex = beforeOrder.indexOf('candidate_submission');
  const targetKey = beforeOrder[Math.max(0, candidateStartIndex - 1)];
  const patchesBeforeCandidateDrag = mocks.gridPatches.length;
  await candidate.dragTo(grid.locator(`th[data-col-key="${targetKey}"]`));
  await expect.poll(async () => mocks.gridPatches.length).toBeGreaterThan(patchesBeforeCandidateDrag);
  await expect.poll(async () => {
    const keys = await grid.locator('th[data-col-key]').evaluateAll(items => items.map(header => (header as HTMLElement).dataset.colKey));
    return keys.join('|');
  }).not.toBe(beforeOrder.join('|'));
  const afterCandidateOrder = await grid.locator('th[data-col-key]').evaluateAll(headers => headers.map(header => (header as HTMLElement).dataset.colKey));
  expect(afterCandidateOrder).not.toEqual(beforeOrder);
  expect(afterCandidateOrder.indexOf(targetKey) - afterCandidateOrder.indexOf('candidate_submission')).toBe(1);

  await candidate.scrollIntoViewIfNeeded();
  const widthBefore = await candidate.evaluate(element => Math.round(element.getBoundingClientRect().width));
  const resizer = candidate.locator('.col-resizer');
  const box = await resizer.boundingBox();
  if (!box) throw new Error('Candidate Submission resize handle was not measurable.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 75, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await candidate.evaluate(element => Math.round(element.getBoundingClientRect().width))) > widthBefore + 20).toBe(true);
  await expect.poll(async () => mocks.gridPatches.some(patch => Number(patch?.prefs?.columns?.candidate_submission?.width) > widthBefore)).toBe(true);

  const issueHeader = grid.locator('th[data-col-key="issue_codes"]');
  const patchesBeforeIssueDrag = mocks.gridPatches.length;
  await issueHeader.dragTo(candidate);
  await expect.poll(async () => mocks.gridPatches.length).toBeGreaterThan(patchesBeforeIssueDrag);

  await candidate.click();
  await expect(candidate).toContainText('▲');
  const statusLabels = await grid.locator('td[data-col-key="candidate_submission"] .candidate-office-summary-status').allTextContents();
  expect(statusLabels).toEqual([
    'Awaiting Candidate Submission', 'Awaiting Manager Approval', 'Candidate Submission Complete',
    'Candidate Submitted', 'Manager Approved', 'Rejected by Agency'
  ]);
  await candidate.click();
  await expect(candidate).toContainText('▼');
  expect(await grid.locator('td[data-col-key="candidate_submission"] .candidate-office-summary-status').allTextContents()).toEqual([...statusLabels].reverse());
  expect(assets['/index.html']).toBeGreaterThan(0);
  expect(assets['/js/main.js']).toBeGreaterThan(0);
});

for (const viewport of [{ label: 'desktop', width: 1440, height: 960 }, { label: 'narrow', width: 412, height: 915 }]) {
  test(`approved Candidate status and winning QR lifecycle remain tidy in existing modals on ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await installPatchedAssets(page);
    await installOfficeMocks(page);
    await openPatchedTest(page);
    const result = await page.evaluate(() => {
      const identity = { row_key: 'fixture-row', timesheet_id: '00000000-0000-4000-8000-000000000901', contract_week_id: null, expected_row_signature: 'fixture-signature' };
      const make = (code: string, paper: string) => ({
        ok: true, contract_version: 'OFFICE_CANDIDATE_TIMESHEET_V1', office_contract_version: 'CLOUDTMS_OFFICE_CANDIDATE_API_V1',
        current_identity: { ...identity, row_signature: identity.expected_row_signature, route_family: 'QR' },
        candidate_status: { code, label: `raw ${code}`, tone: 'danger' }, workflow: { state: code }, manager_approval: null,
        paper_pack: { state: paper, retryable: false }, rejections: [], primary_action: null, available_actions: [], diagnostics: [],
        refresh_hints: { refetch: 'CURRENT_ROW' }, observed_at_utc: '2026-08-13T08:00:00Z'
      });
      const presenter = (window as any).CloudTMSCandidateOfficePresenter;
      const surface = (window as any).CloudTMSCandidateOfficeSurface;
      const created = presenter.presentCandidateOfficeDetail(make('CREATED', 'NOT_APPLICABLE'), { surface: 'SIMPLE_TIMESHEET' });
      const received = presenter.presentCandidateOfficeDetail(make('AWAITING_PAPER_RETURN', 'RETURN_RECEIVED'), { surface: 'SIMPLE_TIMESHEET' });
      const complete = presenter.presentCandidateOfficeDetail(make('PAID', 'RETURN_RECEIVED'), { surface: 'SIMPLE_TIMESHEET' });
      const rejected = presenter.presentCandidateOfficeDetail(make('REJECTED', 'NOT_APPLICABLE'), { surface: 'SIMPLE_TIMESHEET' });
      (window as any).showModal('Timesheet — Candidate submission', [
        { key: 'overview', label: 'Overview' }, { key: 'issues', label: 'Issues' }
      ], (key: string) => `<div class="tabc">${key === 'issues' ? surface.renderCandidateIssuesFragment(rejected) : `${surface.renderCandidateStageFragment(created)}${surface.renderCandidateStageFragment(received)}${surface.renderCandidateStageFragment(complete)}`}</div>`, null, false, null, { kind: 'candidate-office-e2e', noParentGate: true, showSave: false, showApply: false });
      return { created: created.status.label, received: received.status.label, complete: complete.status.label, rejected: rejected.status.label };
    });
    expect(result).toEqual({ created: 'Awaiting Candidate Submission', received: 'Finalising Submission', complete: 'Candidate Submission Complete', rejected: 'Rejected by Agency' });
    const modal = page.locator('#modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Awaiting Candidate Submission', { exact: true })).toBeVisible();
    await expect(modal.getByText('Finalising Submission', { exact: true })).toBeVisible();
    await expect(modal.getByText('Candidate Submission Complete', { exact: true })).toBeVisible();
    await expect(modal.getByText(/QR Pack Preparing|QR Awaiting Signed Return|QR Pack ready|Signed QR Pack received/)).toHaveCount(0);
    const bounds = await modal.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
    await modal.getByRole('button', { name: 'Issues', exact: true }).click();
    await expect(modal.getByText('Rejected by Agency', { exact: true })).toBeVisible();
    await expect(modal.getByText(/Rejected — resubmission required|PHONE|EMAIL/)).toHaveCount(0);
    expect(await page.evaluate(() => !!(window as any).__nativeDialogUsed)).toBe(false);
  });
}

for (const scenario of [
  { name: 'PARTIAL result', result: 'PARTIAL' as const, heading: 'Some reminders could not be sent', counts: ['2 sent', '1 no longer eligible', '1 failed'] },
  { name: 'FAILED result', result: 'FAILED' as const, heading: 'Manager reminders were not sent', counts: ['0 sent', '0 no longer eligible', '3 failed'] },
  { name: 'lost-response recovery', result: 'LOST_PARTIAL' as const, heading: 'Some reminders could not be sent', counts: ['2 sent', '1 no longer eligible', '1 failed'] }
]) {
  test(`manager reminder workspace renders ${scenario.name} as durable structured truth`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 960 });
    await installPatchedAssets(page);
    const mocks = await installOfficeMocks(page, { reminderResult: scenario.result });
    await openPatchedTest(page);
    await page.evaluate(() => { void (window as any).openCandidateManagerReminderWorkspace(); return true; });
    const workspace = page.locator('#candidateManagerReminderWorkspace');
    await expect(workspace).toBeVisible();
    await workspace.getByLabel('Select Alice Smith').check();
    const search = workspace.getByLabel('Search by Candidate surname');
    await search.fill('ba');
    await expect(workspace.getByText('Ben Baines', { exact: true })).toBeVisible();
    await workspace.getByLabel('Select Ben Baines').check();
    await search.fill('');
    await expect(workspace.getByLabel('Select Alice Smith')).toBeChecked();
    await expect(workspace.getByLabel('Select Ben Baines')).toBeChecked();
    await workspace.getByRole('button', { name: 'Send Reminders', exact: true }).click();
    const confirmation = page.locator('[data-candidate-office-dialog="reminder-batch"]');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Send Manager Reminders', exact: true }).click();
    await expect(workspace.getByRole('heading', { name: scenario.heading, exact: true })).toBeVisible();
    for (const count of scenario.counts) await expect(workspace.getByText(count, { exact: false })).toBeVisible();
    await expect(workspace.locator('.candidate-reminder-workspace__error')).toHaveCount(0);
    const metrics = mocks.metrics();
    expect(metrics.executeCalls).toBe(1);
    expect(metrics.statusCalls).toBe(scenario.result === 'LOST_PARTIAL' ? 1 : 0);
    expect(await page.getByText('Refresh current state', { exact: true }).count()).toBe(0);
    expect(await page.evaluate(() => !!(window as any).__nativeDialogUsed)).toBe(false);
  });
}

async function startReminderBatch(page: Page) {
  await page.evaluate(() => { void (window as any).openCandidateManagerReminderWorkspace(); return true; });
  const workspace = page.locator('#candidateManagerReminderWorkspace');
  await expect(workspace).toBeVisible();
  await workspace.getByLabel('Select Alice Smith').check();
  await workspace.getByRole('button', { name: 'Send Reminders', exact: true }).click();
  const confirmation = page.locator('[data-candidate-office-dialog="reminder-batch"]');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Send Manager Reminders', exact: true }).click();
  return workspace;
}

async function expectRecoveryOnly(workspace: ReturnType<Page['locator']>) {
  await expect(workspace.getByRole('heading', { name: 'Reminder result pending', exact: true })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Refresh current state', exact: true })).toBeVisible();
  await expect(workspace.locator('[data-reminder-recovery-only]')).toBeVisible();
  await expect(workspace.locator('[data-reminder-send], [data-reminder-cancel], [data-reminder-search], [data-reminder-select-all], [data-reminder-sort], [data-reminder-page]')).toHaveCount(0);
}

test('continued reminder uncertainty locks the workspace and survives forced dismissal with the same operation', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await installPatchedAssets(page);
  const mocks = await installOfficeMocks(page, { reminderResult: 'CONTINUED_UNCERTAIN' });
  await openPatchedTest(page);
  let workspace = await startReminderBatch(page);
  await expectRecoveryOnly(workspace);
  if (process.env.CANDIDATE_OFFICE_VISUAL_DIR) {
    await page.screenshot({ path: resolve(process.env.CANDIDATE_OFFICE_VISUAL_DIR, 'reminder-recovery-desktop.png'), fullPage: true });
  }
  await expect(page.locator('#btnCloseModal')).toBeDisabled();
  await expect(page.locator('#btnCloseModal')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(workspace).toBeVisible();
  expect(mocks.metrics().executeCalls).toBe(1);
  expect(mocks.metrics().statusCalls).toBe(1);

  await workspace.getByRole('button', { name: 'Refresh current state', exact: true }).click();
  await expectRecoveryOnly(workspace);
  expect(mocks.metrics().executeCalls).toBe(1);
  expect(mocks.metrics().statusCalls).toBe(2);

  // Simulate a framework-level dismissal that bypasses the disabled close
  // control. Reopening must still restore the exact retained operation.
  await page.evaluate(() => {
    const close = document.getElementById('btnCloseModal') as HTMLButtonElement | null;
    if (close) { close.disabled = false; close.click(); }
  });
  await expect(workspace).toBeHidden();
  await page.evaluate(() => { void (window as any).openCandidateManagerReminderWorkspace(); return true; });
  workspace = page.locator('#candidateManagerReminderWorkspace');
  await expectRecoveryOnly(workspace);
  expect(mocks.metrics().executeCalls).toBe(1);

  mocks.resolveReminderWith('PARTIAL');
  await workspace.getByRole('button', { name: 'Refresh current state', exact: true }).click();
  await expect(workspace.getByRole('heading', { name: 'Some reminders could not be sent', exact: true })).toBeVisible();
  await expect(page.locator('#btnCloseModal')).toBeEnabled();
  expect(mocks.metrics().executeCalls).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('cloudtms.candidateOffice.managerReminderRecovery.v1'))).toBeNull();
});

test('one exact reminder retry is consumed once and every later refresh is status-only', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 412, height: 915 });
  await installPatchedAssets(page);
  const mocks = await installOfficeMocks(page, { reminderResult: 'RETRY_THEN_UNCERTAIN' });
  await openPatchedTest(page);
  const workspace = await startReminderBatch(page);
  await expectRecoveryOnly(workspace);
  if (process.env.CANDIDATE_OFFICE_VISUAL_DIR) {
    await page.screenshot({ path: resolve(process.env.CANDIDATE_OFFICE_VISUAL_DIR, 'reminder-recovery-narrow.png'), fullPage: true });
  }

  const afterRetry = mocks.metrics();
  expect(afterRetry.executeCalls).toBe(2);
  expect(afterRetry.statusCalls).toBe(2);
  expect(afterRetry.executeBodies).toHaveLength(2);
  expect(afterRetry.executeBodies[1]).toEqual(afterRetry.executeBodies[0]);
  expect(afterRetry.executeBodies[0].batch_id).toBe(afterRetry.executeBodies[0].idempotency_key);

  for (let index = 0; index < 3; index += 1) {
    await workspace.getByRole('button', { name: 'Refresh current state', exact: true }).click();
    await expectRecoveryOnly(workspace);
  }
  const afterRefreshes = mocks.metrics();
  expect(afterRefreshes.executeCalls).toBe(2);
  expect(afterRefreshes.statusCalls).toBe(5);
  await expect(page.locator('#btnCloseModal')).toBeDisabled();
  await expect(page.locator('#btnCloseModal')).toBeHidden();

  mocks.resolveReminderWith('FAILED');
  await workspace.getByRole('button', { name: 'Refresh current state', exact: true }).click();
  await expect(workspace.getByRole('heading', { name: 'Manager reminders were not sent', exact: true })).toBeVisible();
  await expect(workspace.getByText('3 failed', { exact: false })).toBeVisible();
  await expect(page.locator('#btnCloseModal')).toBeEnabled();
  expect(mocks.metrics().executeCalls).toBe(2);
  expect(await page.evaluate(() => !!(window as any).__nativeDialogUsed)).toBe(false);
});
