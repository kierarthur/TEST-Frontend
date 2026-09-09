import { expect, test, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

const root = resolve(__dirname, '../..');
const testOrigin = 'https://testmode.arthur-rai.co.uk';
const testBackend = 'https://test-cloudtms-backend.kier-88a.workers.dev';
const useDeployedAssets = process.env.CANDIDATE_OFFICE_USE_DEPLOYED_ASSETS === '1';
const visualDir = process.env.CANDIDATE_OFFICE_VISUAL_DIR || '';
const localAssets = [
  'index.html',
  'css/candidate-office-v1.css',
  'js/main.js',
  'js/candidate-office-contract-v1.js',
  'js/candidate-office-api-v1.js',
  'js/candidate-office-presenter-v1.js',
  'js/candidate-office-surface-v1.js',
  'js/candidate-office-modal-v1.js',
  'js/candidate-office-controller-v1.js',
  'js/candidate-office-bridge-v1.js',
  'js/candidate-office-ui-policy-v1.js',
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
  workflow: statusCode === 'FINALISED'
    ? { state: 'FINALISED', historical: true }
    : (statusCode === 'AWAITING_PAPER_RETURN' ? { state: 'AWAITING_PAPER_RETURN' } : null),
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
  if (useDeployedAssets) {
    await page.addInitScript(() => { (window as any).__CANDIDATE_OFFICE_DEPLOYED_PROOF = true; });
    await page.route(`${testOrigin}/**`, async route => {
      const url = new URL(route.request().url());
      const key = url.pathname === '/' ? '/index.html' : url.pathname;
      if (sourceByPath.has(key)) counts[key] = (counts[key] || 0) + 1;
      await route.continue();
    });
    return counts;
  }
  await page.route(`${testOrigin}/**`, async route => {
    const url = new URL(route.request().url());
    const key = url.pathname === '/' ? '/index.html' : url.pathname;
    const source = sourceByPath.get(key);
    if (!source) return route.continue();
    counts[key] = (counts[key] || 0) + 1;
    const body = key === '/index.html'
      ? source.replace('</head>', `<script>window.BROKER_BASE_URL=${JSON.stringify(testBackend)};window.__CANDIDATE_OFFICE_LOCAL_PROOF=${JSON.stringify(mainSha256)};</script></head>`)
      : source;
    await route.fulfill({ body, contentType: key.endsWith('.html') ? 'text/html; charset=utf-8' : (key.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8'), headers: { 'cache-control': 'no-store', 'x-codex-local-asset': 'candidate-office-final-correction' } });
  });
  return counts;
}

type ReminderResultMode = 'PARTIAL' | 'FAILED' | 'LOST_PARTIAL' | 'CONTINUED_UNCERTAIN' | 'RETRY_THEN_UNCERTAIN' | 'STATUS_403_THEN_PARTIAL' | 'STATUS_429_THEN_PARTIAL';

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
  let projectionCalls = 0;
  let summaryCalls = 0;
  let summaryCallsWithCandidateProjection = 0;
  const summaryOrders: Array<{ order_by: string; order_dir: string }> = [];
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
    if (path === '/signatures/presign-get/batch') return respond(route, { links: [] });
    if (path === '/api/users/me/grid-prefs') {
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON();
        gridPatches.push(body);
        gridPrefs.grid[body.section] = { ...(gridPrefs.grid[body.section] || {}), ...(body.prefs || {}) };
      }
      return respond(route, gridPrefs);
    }
    if (path === '/api/timesheets/summary') {
      summaryCalls += 1;
      if (url.searchParams.get('include_candidate_projection') === 'true') {
        summaryCallsWithCandidateProjection += 1;
      }
      const pageNumber = Math.max(1, Number(url.searchParams.get('page') || 1));
      const pageSize = Math.max(1, Number(url.searchParams.get('page_size') || 50));
      const orderBy = String(url.searchParams.get('order_by') || 'week_ending_date');
      const orderDir = String(url.searchParams.get('order_dir') || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
      summaryOrders.push({ order_by: orderBy, order_dir: orderDir });
      const candidateStatusLabel: Record<string, string> = {
        CREATED: 'Awaiting Candidate Submission',
        AWAITING_MANAGER_APPROVAL: 'Awaiting Manager Approval',
        FINALISED: 'Candidate Submission Complete',
        WORKER_SUBMITTED: 'Candidate Submitted',
        MANAGER_APPROVED: 'Manager Approved',
        REJECTED: 'Rejected by Agency'
      };
      const valueFor = (row: any) => orderBy === 'candidate_submission'
        ? (candidateStatusLabel[row.__status] || '')
        : String(row[orderBy] ?? '');
      const orderedRows = [...summaryRows].sort((left, right) => {
        const compared = valueFor(left).localeCompare(valueFor(right), 'en-GB', { numeric: true, sensitivity: 'base' });
        const stable = compared || String(left.candidate_name).localeCompare(String(right.candidate_name), 'en-GB', { sensitivity: 'base' });
        return orderDir === 'desc' ? -stable : stable;
      });
      const start = (pageNumber - 1) * pageSize;
      return respond(route, {
        ok: true, items: orderedRows.slice(start, start + pageSize).map(({ __status, ...row }) => {
          const identity = {
            row_key: row.row_key,
            timesheet_id: row.timesheet_id,
            contract_week_id: null,
            expected_row_signature: row.backend_row_signature
          };
          return {
            ...row,
            candidate_office_projection_loaded: true,
            candidate_office_projection_not_applicable: false,
            candidate_office_projection: projectionFor(identity, __status),
            candidate_office_projection_error: null
          };
        }),
        total: summaryRows.length, count: summaryRows.length, has_more: start + pageSize < summaryRows.length,
        total_pay_ex_vat: 615, total_charge_ex_vat: 915, total_margin_ex_vat: 300
      });
    }
    if (path === '/api/candidate-app/timesheets/office-projections') {
      projectionCalls += 1;
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
      if (['LOST_PARTIAL', 'CONTINUED_UNCERTAIN', 'RETRY_THEN_UNCERTAIN', 'STATUS_403_THEN_PARTIAL', 'STATUS_429_THEN_PARTIAL'].includes(String(options.reminderResult || ''))) return route.abort('failed');
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
      if (!eventualReminderStatus && options.reminderResult === 'STATUS_403_THEN_PARTIAL' && statusCalls === 1) {
        return respond(route, { ok: false, code: 'OFFICE_PERMISSION_REQUIRED', error: 'Status is temporarily unavailable.' }, 403);
      }
      if (!eventualReminderStatus && options.reminderResult === 'STATUS_429_THEN_PARTIAL' && statusCalls === 1) {
        return respond(route, { ok: false, code: 'RATE_LIMITED', error: 'Status is temporarily rate limited.' }, 429);
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
    metrics: () => ({
      executeCalls,statusCalls,projectionCalls,summaryCalls,summaryCallsWithCandidateProjection,
      executeBodies: structuredClone(executeBodies), summaryOrders: structuredClone(summaryOrders)
    })
  };
}

async function openPatchedTest(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  if (useDeployedAssets) {
    expect(await page.evaluate(() => (window as any).__CANDIDATE_OFFICE_DEPLOYED_PROOF)).toBe(true);
    expect(await page.evaluate(() => (window as any).__CANDIDATE_OFFICE_LOCAL_PROOF)).toBeUndefined();
  } else {
    expect(await page.evaluate(() => (window as any).__CANDIDATE_OFFICE_LOCAL_PROOF)).toBe(mainSha256);
  }
  expect(new URL(page.url()).origin).toBe(testOrigin);
  expect(await page.evaluate(() => (window as any).BROKER_BASE_URL)).toBe(testBackend);
}

async function captureCandidateOfficeVisual(page: Page, name: string) {
  if (!visualDir) return;
  mkdirSync(visualDir, { recursive: true });
  await page.locator('#modal').screenshot({ path: resolve(visualDir, `${name}.png`) });
}

function expenseCategoryPresentation(overrides: any = {}) {
  const componentId = overrides.componentId || uuid(971);
  return {
    surface: overrides.surface || 'SIMPLE_TIMESHEET',
    identity: { row_key: 'expense-category-visual', timesheet_id: uuid(970), contract_week_id: null, route_family: 'ELECTRONIC' },
    status: { code: 'AWAITING_MANAGER_APPROVAL', label: 'Awaiting Manager Approval', tone: 'warning' },
    statuses: [{ code: 'AWAITING_MANAGER_APPROVAL', label: 'Awaiting Manager Approval', tone: 'warning' }],
    expense_claims: [{
      total: overrides.total || '£37.50',
      updating: false,
      needs_attention: false,
      categories: overrides.categories || [{
        expense_component_id: componentId,
        label: 'Accommodation',
        amount: '£25.00',
        supporting_evidence_count: 3,
        status: { code: 'MANAGER_APPROVAL_REQUIRED', label: 'Awaiting Manager Approval', tone: 'warning' },
        fields: [['Manager', 'Awaiting Manager Approval'], ['Agency', 'Not yet authorised'], ['Supporting evidence', '3 files']],
        rejection_action: { code: 'REJECT_EXPENSE_CATEGORY', enabled: true }
      }, {
        expense_component_id: uuid(972),
        label: 'Travel',
        amount: '£12.50',
        supporting_evidence_count: 1,
        status: { code: 'MANAGER_APPROVED', label: 'Manager Approved', tone: 'success' },
        fields: [['Manager', 'Manager Approved'], ['Agency', 'Not yet authorised'], ['Supporting evidence', '1 file']],
        rejection_action: { code: 'REJECT_EXPENSE_CATEGORY', enabled: true }
      }]
    }]
  };
}

test('Office confirmation dialogs always have a safe exit and cannot be dismissed mid-action', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);

  await page.evaluate(() => {
    const trigger = document.createElement('button');
    trigger.id = 'candidateOfficeSafetyTrigger';
    trigger.textContent = 'Open safety proof';
    document.body.appendChild(trigger);
    trigger.focus();

    let releaseAction: (() => void) | null = null;
    const actionGate = new Promise<void>(resolve => { releaseAction = resolve; });
    (window as any).__releaseCandidateOfficeSafetyAction = () => releaseAction?.();
    (window as any).__candidateOfficeSafetyResult = null;
    void (window as any).CloudTMSCandidateOfficeModals.openDialog({
      kind: 'safety-proof',
      title: 'Apply expense change?',
      body: 'CloudTMS will refresh this Timesheet when the result is known.',
      trigger,
      buttons: [
        { label: 'Go Back', value: 'back', className: 'btn-outline' },
        { label: 'Apply change', value: 'apply', className: 'btn-primary' }
      ],
      defaultFocusSelector: '[data-candidate-dialog-action="back"]',
      busyMessage: 'Applying change…',
      onAction: async () => { await actionGate; return { ok: true }; }
    }).then((result: unknown) => { (window as any).__candidateOfficeSafetyResult = result; });
  });

  const dialog = page.locator('[data-candidate-office-dialog="safety-proof"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Go Back', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Apply change', exact: true }).click();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#btnCloseModal')).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/finishing this action/i)).toBeVisible();

  await page.evaluate(() => (window as any).__releaseCandidateOfficeSafetyAction());
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).__candidateOfficeSafetyResult?.confirmed)).toBe(true);
  await expect(page.locator('#candidateOfficeSafetyTrigger')).toBeFocused();

  await page.evaluate(() => {
    const trigger = document.getElementById('candidateOfficeSafetyTrigger');
    (window as any).__officeConfirmEscapeResult = null;
    void (window as any).openUiConfirmModal({
      title: 'Delete Timesheet?',
      message: 'No change has been made yet.',
      confirm_label: 'Delete Timesheet',
      cancel_label: 'Go Back',
      kind: 'timesheet-delete-safety-proof'
    }).then((result: unknown) => { (window as any).__officeConfirmEscapeResult = result; });
    trigger?.setAttribute('data-proof-open', '1');
  });
  await expect(page.getByRole('button', { name: 'Go Back', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as any).__officeConfirmEscapeResult)).toMatchObject({ confirmed: false, via: 'cancel' });
  await expect(page.locator('#candidateOfficeSafetyTrigger')).toBeFocused();
});

test('Reject Candidate Submission explains the complete selected Timesheet and blank restart', async ({ page }) => {
  test.setTimeout(90_000);
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);

  await page.evaluate(() => {
    (window as any).__candidateRejectionCopyResult = null;
    void (window as any).CloudTMSCandidateOfficeModals.openCandidateRejectionModal({
      preview: { linked_pending_expense_claim_count: 1 },
      context: { candidateName: 'Test Candidate', clientName: 'Test Client', weekEnding: '23 August 2026' }
    }).then((result: unknown) => { (window as any).__candidateRejectionCopyResult = result; });
  });

  const dialog = page.locator('[data-candidate-office-dialog="rejection"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('complete Candidate Submission for the selected Timesheet');
  await expect(dialog).toContainText('including all affected expenses on that Timesheet');
  await expect(dialog).toContainText('linked pending expense claim');
  await expect(dialog).toContainText('It will be rejected at the same time');
  await expect(dialog).toContainText('Start a new claim');
  await expect(dialog).toContainText('The new claim begins blank');
  await expect(dialog.getByRole('button', { name: 'Go Back', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Go Back', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__candidateRejectionCopyResult)).toMatchObject({ confirmed: false });
});

test('complete expense categories have tidy rejection controls only in approved Expenses views', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1180, height: 900 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);
  const view = expenseCategoryPresentation();

  await page.evaluate(input => {
    const surface = (window as any).CloudTMSCandidateOfficeSurface;
    (window as any).showModal('Expenses', [{ key: 'main', label: 'Expenses' }], () => `<div class="tabc" data-expense-category-visual="simple">${surface.renderCandidateFragment(input, { surface: 'SIMPLE_TIMESHEET', variant: 'expenses' })}</div>`, null, false, null, { kind: 'candidate-office-expense-category-simple-visual', noParentGate: true, showSave: false, showApply: false });
  }, view);
  const modal = page.locator('#modal');
  await expect(modal.getByText('Accommodation · £25.00', { exact: true })).toBeVisible();
  await expect(modal.getByText('Travel · £12.50', { exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Reject complete Accommodation expense' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Reject complete Travel expense' })).toBeVisible();
  await expect(modal).not.toContainText(/00000000-|expense_component_id|workflow_id/);
  const layout = await modal.locator('.candidate-office-expenses').evaluate(element => ({
    overflow: element.scrollWidth - element.clientWidth,
    labels: Array.from(element.querySelectorAll('.candidate-office-expense-category__header strong')).map(label => getComputedStyle(label).whiteSpace)
  }));
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.labels).toEqual(['nowrap', 'nowrap']);
  await captureCandidateOfficeVisual(page, '01-simple-expenses-eligible-categories');

  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await modal.locator('.candidate-office-expenses').evaluate(element => element.scrollWidth - element.clientWidth);
  expect(narrow).toBeLessThanOrEqual(1);
  await captureCandidateOfficeVisual(page, '02-simple-expenses-eligible-narrow');

  await page.evaluate(input => {
    const surface = (window as any).CloudTMSCandidateOfficeSurface;
    const manual = structuredClone(input);
    manual.identity.route_family = 'MANUAL_NON_QR';
    (window as any).showModal('Expenses', [{ key: 'main', label: 'Expenses' }], () => `<div class="tabc" data-expense-category-visual="negative">${surface.renderCandidateFragment(manual, { surface: 'SIMPLE_TIMESHEET', variant: 'expenses' })}</div>`, null, false, null, { kind: 'candidate-office-expense-category-negative-visual', noParentGate: true, showSave: false, showApply: false });
  }, view);
  await expect(modal.getByRole('button', { name: /Reject complete .* expense/ })).toHaveCount(0);
  await expect(modal).toContainText('Accommodation · £25.00');
  await captureCandidateOfficeVisual(page, '03-manual-or-protected-no-category-action');
});

test('expense-category confirmation is accessible, compulsory and states all empty-Timesheet consequences', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 900, height: 760 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);

  await page.evaluate(() => {
    (window as any).__expenseCategoryDecision = null;
    void (window as any).CloudTMSCandidateOfficeModals.openCandidateExpenseCategoryRejectionModal({
      category: { label: 'Accommodation', amount: '£25.00', supporting_evidence_count: 3 },
      confirmation: { supporting_evidence_count: 3, empty_timesheet_consequence: 'NONE', will_delete_timesheet: false },
      trigger: document.body
    }).then((result: unknown) => { (window as any).__expenseCategoryDecision = result; });
  });
  let dialog = page.locator('[data-candidate-office-dialog="expense-category-rejection"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Reject Accommodation expense?');
  await expect(dialog).toContainText('complete Accommodation expense of £25.00');
  await expect(dialog).toContainText('All 3 supporting items');
  await expect(dialog).toContainText('Individual receipts or pages cannot be rejected');
  await expect(dialog).toContainText('Hours and other expense categories on this Timesheet will stay as they are');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Reject Accommodation expense', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('A reason for rejection is required');
  await captureCandidateOfficeVisual(page, '04-confirm-normal-category-consequence');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__expenseCategoryDecision)).toMatchObject({ confirmed: false });

  await page.evaluate(() => {
    void (window as any).CloudTMSCandidateOfficeModals.openCandidateExpenseCategoryRejectionModal({
      category: { label: 'Travel', amount: '£12.50', supporting_evidence_count: 1 },
      confirmation: { supporting_evidence_count: 1, empty_timesheet_consequence: 'PERMANENT_REMOVE', will_delete_timesheet: true },
      trigger: document.body
    });
  });
  dialog = page.locator('[data-candidate-office-dialog="expense-category-rejection"]');
  await expect(dialog).toContainText('All 1 supporting item');
  await expect(dialog).toContainText('final category on its expense-only Timesheet');
  await expect(dialog).toContainText('will permanently remove the now-empty Timesheet');
  await captureCandidateOfficeVisual(page, '05-confirm-delete-empty-expense-timesheet');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.evaluate(() => {
    void (window as any).CloudTMSCandidateOfficeModals.openCandidateExpenseCategoryRejectionModal({
      category: { label: 'Mileage', amount: '£9.00', supporting_evidence_count: 2 },
      confirmation: {
        supporting_evidence_count: 2,
        empty_timesheet_consequence: 'REMOVE_FROM_CURRENT_KEEP_HISTORY',
        will_delete_timesheet: false
      },
      trigger: document.body
    });
  });
  dialog = page.locator('[data-candidate-office-dialog="expense-category-rejection"]');
  await expect(dialog).toContainText('remove the now-empty Timesheet from current records');
  await expect(dialog).toContainText('keeping a record of it in History');
  await captureCandidateOfficeVisual(page, '05b-confirm-history-retained-empty-expense-timesheet');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Simple Timesheet expenses keep Manager status in its own column and open category-scoped evidence', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1180, height: 900 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await page.route(`${testBackend}/api/files/presign-download`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'data:text/html,%3Cdiv%20style%3D%22font-family%3Asans-serif%3Bpadding%3A30px%22%3EExpense%20evidence%3C%2Fdiv%3E' })
    });
  });
  await openPatchedTest(page);

  const category = {
    expense_component_id: uuid(991),
    category: 'TRAVEL',
    label: 'Travel',
    amount: '£15.00',
    supporting_evidence_count: 2,
    status: { code: 'MANAGER_APPROVED', label: 'Manager Approved', tone: 'success' },
    rejection_action: { code: 'REJECT_EXPENSE_CATEGORY', enabled: true },
    rejection_confirmation: { supporting_evidence_count: 2, empty_timesheet_consequence: 'NONE' }
  };
  const expenseProofTimesheetId = uuid(990);
  const expenseEvidence = [
    { id: 'travel-evidence-1', kind: 'TRAVEL', storage_key: 'evidence/travel-1.png', filename: 'travel-1.png', is_view_only: true },
    { id: 'travel-evidence-2', kind: 'TRAVEL', storage_key: 'evidence/travel-2.png', filename: 'travel-2.png', is_view_only: true }
  ];
  await page.route(`${testBackend}/api/timesheets/${expenseProofTimesheetId}/evidence?meta=1`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        current_timesheet_id: expenseProofTimesheetId,
        evidence: expenseEvidence,
        withdrawn_submissions: [{ evidence: [{ id: 'old-travel', kind: 'TRAVEL', storage_key: 'evidence/old.png', withdrawn_at: '2026-08-01T00:00:00Z' }] }]
      })
    });
  });

  await page.evaluate(({ category, timesheetId }) => {
    const bridge = (window as any).CloudTMSCandidateOfficeBridge;
    const surface = (window as any).CloudTMSCandidateOfficeSurface;
    const view = {
      identity: { row_key: timesheetId, timesheet_id: timesheetId, route_family: 'ELECTRONIC' },
      expense_claims: [{ total: '£15.00', categories: [category] }]
    };
    (window as any).CloudTMSCandidateOfficeBridge = {
      ...bridge,
      capabilities: { ...bridge.capabilities, permissions: { ...bridge.capabilities.permissions, reject_submission: true } },
      slotHtml: (_surface: string, _row: unknown, options: { variant?: string }) => `<div class="candidate-office-slot" data-candidate-office-slot="1" data-candidate-office-surface="SIMPLE_TIMESHEET" data-row-key="${timesheetId}" data-timesheet-id="${timesheetId}" data-candidate-office-hydrated="1">${surface.renderCandidateFragment(view, { surface: 'SIMPLE_TIMESHEET', variant: options.variant })}</div>`
    };
    const ctx = {
      entity: 'timesheets',
      mode: 'view',
      candidateOfficeSurface: 'SIMPLE_TIMESHEET',
      data: { id: timesheetId, timesheet_id: timesheetId, row_key: timesheetId, route_family: 'ELECTRONIC' },
      row: { id: timesheetId, timesheet_id: timesheetId, row_key: timesheetId, route_family: 'ELECTRONIC' },
      timesheetDetails: {
        timesheet: { timesheet_id: timesheetId, route_family: 'ELECTRONIC' },
        tsfin: { travel_pay: 15, travel_charge: 15, mileage_units: 0, mileage_pay: 0, mileage_charge: 0 },
        route_family: 'ELECTRONIC'
      },
      timesheetState: { expensesDraft: { travel_pay: 15, travel_charge: 15, mileage_units: 0 } },
      timesheetEditDomains: { canOpenExpenses: true, canEditExpenses: false, expenseStorageTarget: 'TSFIN' },
      editDomains: { canOpenExpenses: true, canEditExpenses: false, expenseStorageTarget: 'TSFIN' }
    };
    (window as any).modalCtx = ctx;
    (window as any).__openExpenseLayoutProof = () => {
      (window as any).modalCtx = ctx;
      (window as any).showModal('Timesheet expenses', [{ key: 'expenses', label: 'Expenses' }], () => (window as any).renderTimesheetExpensesTab(ctx), null, false, undefined, { kind: 'timesheets', frameEntity: 'timesheets', noParentGate: true, showSave: false, showApply: false });
    };
    (window as any).__openExpenseLayoutProof();
  }, { category, timesheetId: expenseProofTimesheetId });

  const modal = page.locator('#modal');
  const travelRow = modal.locator('[data-expense-category="TRAVEL"]');
  await expect(travelRow).toBeVisible();
  await expect(modal.locator('.ctms-expense-grid__head')).toContainText('Manager status');
  await expect(modal.locator('.ctms-expense-grid__head')).toContainText('Actions');
  await expect(travelRow.locator('.candidate-office-expense-manager')).toHaveText('Manager Approved');
  await expect(travelRow.locator('.candidate-office-expense-row-action')).toContainText('View 2 files');
  await expect(travelRow.locator('.candidate-office-expense-row-action')).toContainText('Reject Travel');
  const desktopLayout = await travelRow.evaluate(row => {
    const charge = row.children[3].getBoundingClientRect();
    const status = row.querySelector('.candidate-office-expense-manager')!.getBoundingClientRect();
    const actions = row.querySelector('.candidate-office-expense-row-action')!.getBoundingClientRect();
    const evidence = row.querySelector('.candidate-office-expense-evidence')!.getBoundingClientRect();
    const reject = row.querySelector('.candidate-office-expense-reject')!.getBoundingClientRect();
    return {
      statusAfterCharge: status.left >= charge.right - 1,
      actionsAfterStatus: actions.left >= status.right - 1,
      controlsShareLine: Math.abs(evidence.top - reject.top) <= 1,
      overflow: row.scrollWidth - row.clientWidth
    };
  });
  expect(desktopLayout).toEqual({ statusAfterCharge: true, actionsAfterStatus: true, controlsShareLine: true, overflow: 0 });
  await captureCandidateOfficeVisual(page, '11-simple-timesheet-expenses-desktop');

  await page.evaluate(() => (window as any).closeCurrentModalFrameSafely({ expectedKind: 'timesheets' }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (window as any).__openExpenseLayoutProof());
  await expect(travelRow).toBeVisible();
  const mobileBounds = await modal.evaluate(element => ({ overflow: element.scrollWidth - element.clientWidth, right: element.getBoundingClientRect().right, viewport: innerWidth }));
  expect(mobileBounds.overflow).toBeLessThanOrEqual(1);
  expect(mobileBounds.right).toBeLessThanOrEqual(mobileBounds.viewport + 1);
  await expect(travelRow.locator('.candidate-office-expense-row-action')).toBeVisible();
  await captureCandidateOfficeVisual(page, '13-simple-timesheet-expenses-mobile');
  await page.evaluate(() => (window as any).closeCurrentModalFrameSafely({ expectedKind: 'timesheets' }));
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.evaluate(() => (window as any).__openExpenseLayoutProof());
  await expect(travelRow).toBeVisible();

  await page.evaluate(({ category, timesheetId }) => {
    const parentCtx: any = {
      data: { timesheet_id: timesheetId },
      timesheetDetails: { timesheet: { timesheet_id: timesheetId } },
      timesheetState: { evidence: [] }
    };
    (window as any).modalCtx = parentCtx;
    const frame = (window as any).__getModalFrame?.();
    if (frame) frame._ctxRef = parentCtx;
    const currentBridge = (window as any).CloudTMSCandidateOfficeBridge;
    (window as any).CloudTMSCandidateOfficeBridge = {
      ...currentBridge,
      runExpenseCategoryAction: async ({ trigger }: any) => {
        const decision = await (window as any).CloudTMSCandidateOfficeModals.openCandidateExpenseCategoryRejectionModal({
          category,
          confirmation: category.rejection_confirmation,
          trigger
        });
        if (!decision.confirmed) return { ok: false, cancelled: true };
        (window as any).__expenseViewerConfirmed = decision.inputs;
        await new Promise(resolve => requestAnimationFrame(resolve));
        (window as any).closeCurrentModalFrameSafely({ expectedKind: 'timesheet-evidence-viewer' });
        return { ok: true, result: { owning_timesheet_deleted: false } };
      }
    };
  }, { category, timesheetId: expenseProofTimesheetId });

  await expect(travelRow.getByRole('button', { name: 'View 2 supporting files for Travel' })).toBeVisible();
  await page.evaluate(({ category, timesheetId }) => (window as any).openTimesheetExpenseEvidenceViewer({
    category,
    categoryKey: 'TRAVEL',
    context: { surface: 'SIMPLE_TIMESHEET', identity: { row_key: timesheetId, timesheet_id: timesheetId }, projection: {} },
    expenseComponentId: category.expense_component_id,
    trigger: document.querySelector('[data-candidate-office-expense-evidence="TRAVEL"]')
  }), { category, timesheetId: uuid(990) });
  await expect(modal).toContainText('Travel evidence');
  await expect(modal.getByText('Manager Approval', { exact: true })).toBeVisible();
  await expect(modal.getByText('Manager Approved', { exact: true })).toBeVisible();
  await expect(modal.getByText('1 of 2', { exact: true }).first()).toBeVisible();
  await expect(modal.getByRole('link', { name: 'Download', exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(modal.getByText('Open / Download', { exact: true })).toHaveCount(0);

  await modal.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(modal.getByText('2 of 2', { exact: true }).first()).toBeVisible();
  await modal.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(modal.getByText('125%', { exact: true })).toBeVisible();
  const zoomed = await modal.locator('.ctms-expense-evidence-preview').evaluate(element => ({
    horizontalOverflow: element.scrollWidth > element.clientWidth,
    scrollbarWidth: getComputedStyle(element).scrollbarWidth,
    scrollbarColor: getComputedStyle(element).scrollbarColor
  }));
  expect(zoomed.horizontalOverflow).toBe(true);
  expect(zoomed.scrollbarWidth).toBe('thin');
  expect(zoomed.scrollbarColor).toContain('rgba');
  await captureCandidateOfficeVisual(page, '12-expense-evidence-viewer-zoomed');

  await modal.getByRole('button', { name: 'Reject Travel', exact: true }).click();
  let confirmation = page.locator('[data-candidate-office-dialog="expense-category-rejection"]');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(modal).toContainText('Travel evidence');

  const viewerReject = modal.getByRole('button', { name: 'Reject Travel', exact: true });
  await expect(viewerReject).toBeEnabled();
  await viewerReject.click();
  confirmation = page.locator('[data-candidate-office-dialog="expense-category-rejection"]');
  await confirmation.getByLabel('Reason for rejection').fill('Receipt image is unreadable.');
  await confirmation.getByRole('button', { name: 'Reject Travel expense', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__expenseViewerConfirmed?.reason_note)).toBe('Receipt image is unreadable.');
  await expect(modal.getByText('Travel evidence')).toHaveCount(0);
});

test('Bulk Authorise expense categories and totals rerender cleanly after one category is rejected', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1100, height: 820 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);
  const before = expenseCategoryPresentation({ surface: 'BULK_AUTHORISE' });

  await page.evaluate(input => {
    const surface = (window as any).CloudTMSCandidateOfficeSurface;
    (window as any).showModal('Expenses', [{ key: 'main', label: 'Expenses' }], () => `<div class="tabc" data-expense-category-visual="bulk-before">${surface.renderCandidateFragment(input, { surface: 'BULK_AUTHORISE', variant: 'expenses' })}</div>`, null, false, null, { kind: 'candidate-office-expense-category-bulk-visual', noParentGate: true, showSave: false, showApply: false });
  }, before);
  const modal = page.locator('#modal');
  await expect(modal).toContainText('Expense total £37.50');
  await expect(modal.getByRole('button', { name: 'Reject complete Accommodation expense' })).toBeVisible();
  await captureCandidateOfficeVisual(page, '06-bulk-authorise-before-category-rejection');

  const after = expenseCategoryPresentation({
    surface: 'BULK_AUTHORISE',
    total: '£12.50',
    categories: [before.expense_claims[0].categories[1]]
  });
  await page.evaluate(input => {
    const surface = (window as any).CloudTMSCandidateOfficeSurface;
    (window as any).showModal('Expenses', [{ key: 'main', label: 'Expenses' }], () => `<div class="tabc" data-expense-category-visual="bulk-after">${surface.renderCandidateFragment(input, { surface: 'BULK_AUTHORISE', variant: 'expenses' })}</div>`, null, false, null, { kind: 'candidate-office-expense-category-bulk-refreshed-visual', noParentGate: true, showSave: false, showApply: false });
  }, after);
  await expect(modal).toContainText('Expense total £12.50');
  await expect(modal).toContainText('Travel · £12.50');
  await expect(modal).not.toContainText('Accommodation · £25.00');
  await captureCandidateOfficeVisual(page, '07-bulk-authorise-after-category-rejection');
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 30_000 });
  await expect(modal.locator('[aria-busy="true"]')).toHaveCount(0);
  await captureCandidateOfficeVisual(page, '08-bulk-authorise-settled-after-category-rejection');
});

test('Bulk Authorise keeps the surviving Timesheet selected and redraws its current categories through the production child refresh', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1100, height: 820 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);
  const before = expenseCategoryPresentation({ surface: 'BULK_AUTHORISE' });
  const after = expenseCategoryPresentation({
    surface: 'BULK_AUTHORISE',
    total: '£12.50',
    categories: [before.expense_claims[0].categories[1]]
  });

  await page.evaluate(({ before, after, timesheetId }) => {
    const state: any = {
      active_row_key: timesheetId,
      active_row: {
        row_key: timesheetId,
        timesheet_id: timesheetId,
        current_timesheet_id: timesheetId,
        route_family: 'ELECTRONIC'
      },
      active_details: {
        current_timesheet_id: timesheetId,
        route_family: 'ELECTRONIC',
        timesheet: { timesheet_id: timesheetId, route_family: 'ELECTRONIC' },
        tsfin: {
          mileage_units: 0,
          accommodation_pay_ex_vat: 25,
          accommodation_charge_ex_vat: 25,
          travel_pay_ex_vat: 12.5,
          travel_charge_ex_vat: 12.5,
          other_pay_ex_vat: 0,
          other_charge_ex_vat: 0
        }
      }
    };
    state.active_context = {
      owner_kind: 'BULK_AUTHORISE',
      candidateOfficeSurface: 'BULK_AUTHORISE',
      row: state.active_row,
      details: state.active_details,
      state: { expensesReadOnly: true }
    };
    state.active_ctx = state.active_context;
    (window as any).__bulkRetainedProofState = state;
    (window as any).__bulkRetainedView = before;
    (window as any).__bulkRetainedAfterView = after;

    const bridge = (window as any).CloudTMSCandidateOfficeBridge;
    const surface = (window as any).CloudTMSCandidateOfficeSurface;
    (window as any).CloudTMSCandidateOfficeBridge = {
      ...bridge,
      slotHtml: (_surface: string, row: any, options: { variant?: string }) => `<div class="candidate-office-slot" data-candidate-office-slot="1" data-candidate-office-surface="BULK_AUTHORISE" data-row-key="${row.row_key}" data-timesheet-id="${row.timesheet_id}" data-candidate-office-hydrated="1">${surface.renderCandidateFragment((window as any).__bulkRetainedView, { surface: 'BULK_AUTHORISE', variant: options.variant })}</div>`
    };
    (window as any).classifyBulkAuthoriseEditability = () => ({
      canOpenExpenses: false,
      canViewExpenses: true,
      hasProcessedExpenses: true,
      expensesReadOnly: true,
      expenseStorageTarget: 'TSFIN'
    });
    (window as any).refreshBulkAuthoriseActiveContext = async () => true;

    (window as any).modalCtx = { entity: 'bulk-authorise', owner_kind: 'BULK_AUTHORISE', bulkAuthoriseState: state };
    (window as any).showModal(
      'Bulk Authorise',
      [{ key: 'main', label: 'Review' }],
      () => `<div id="bulkAuthoriseRetainedIntegrity"><div data-row-key="${timesheetId}">Current Timesheet</div></div>`,
      null,
      false,
      null,
      { kind: 'bulk-authorise', noParentGate: true, showSave: false, showApply: false }
    );
  }, { before, after, timesheetId: uuid(994) });

  await page.evaluate(async () => {
    await (window as any).handleBulkAuthoriseOpenExpensesModal((window as any).__bulkRetainedProofState);
  });
  const modal = page.locator('#modal');
  await expect(modal.locator('[data-exp-out="total_pay"]')).toHaveText('£37.50');
  await expect(modal.locator('input[data-exp-field="travel_pay"]')).toHaveValue('12.50');
  await expect(modal.locator('input[data-exp-field="accommodation_pay"]')).toHaveValue('25.00');

  await page.evaluate(async () => {
    const state = (window as any).__bulkRetainedProofState;
    state.active_details.tsfin = {
      mileage_units: 0,
      accommodation_pay_ex_vat: 0,
      accommodation_charge_ex_vat: 0,
      travel_pay_ex_vat: 12.5,
      travel_charge_ex_vat: 12.5,
      other_pay_ex_vat: 0,
      other_charge_ex_vat: 0
    };
    state.active_context.details = state.active_details;
    state.active_ctx.details = state.active_details;
    (window as any).__bulkRetainedView = (window as any).__bulkRetainedAfterView;
    const frame = (window as any).__getModalFrame?.();
    await frame.__refreshCandidateOfficeExpenseCategory({ rowVanished: false });
  });

  await expect(modal).toHaveAttribute('data-ctms-modal-kind', 'bulk-authorise-expenses');
  await expect(modal.locator('[data-exp-out="total_pay"]')).toHaveText('£12.50');
  await expect(modal.locator('input[data-exp-field="travel_pay"]')).toHaveValue('12.50');
  await expect(modal.locator('input[data-exp-field="accommodation_pay"]')).toHaveValue('0.00');
  await expect(modal.locator('[aria-busy="true"]')).toHaveCount(0);
  const samples = await page.evaluate(async () => {
    const observed = [];
    for (let index = 0; index < 12; index += 1) {
      const modal = document.getElementById('modal');
      const totalPay = modal?.querySelector('[data-exp-out="total_pay"]')?.textContent?.trim() || '';
      const travelPay = (modal?.querySelector('input[data-exp-field="travel_pay"]') as HTMLInputElement | null)?.value || '';
      const accommodationPay = (modal?.querySelector('input[data-exp-field="accommodation_pay"]') as HTMLInputElement | null)?.value || '';
      observed.push({
        kind: modal?.getAttribute('data-ctms-modal-kind') || '',
        childCount: document.querySelectorAll('#bulkProcessExpensesChildRoot').length,
        totalPay,
        travelPay,
        accommodationPay,
        busyCount: document.querySelectorAll('#modal [aria-busy="true"]').length,
        overflow: modal ? Math.max(0, modal.scrollWidth - modal.clientWidth) : -1
      });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return observed;
  });
  expect(samples).toEqual(Array.from({ length: 12 }, () => ({
    kind: 'bulk-authorise-expenses',
    childCount: 1,
    totalPay: '£12.50',
    travelPay: '12.50',
    accommodationPay: '0.00',
    busyCount: 0,
    overflow: 0
  })));
  await captureCandidateOfficeVisual(page, '08b-bulk-authorise-retained-timesheet-production-refresh');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(modal.locator('[data-exp-out="total_pay"]')).toHaveText('£12.50');
  await expect(modal.locator('input[data-exp-field="travel_pay"]')).toHaveValue('12.50');
  expect(await modal.evaluate(element => Math.max(0, element.scrollWidth - element.clientWidth))).toBe(0);
  await expect(page.locator('#btnCloseModal')).toBeVisible();
});

test('Bulk Authorise returns to a clean parent when rejecting the final category removes the expense-only Timesheet', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1100, height: 820 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);

  await page.evaluate(timesheetId => {
    const state: any = {
      active_row_key: timesheetId,
      active_row: {
        row_key: timesheetId,
        timesheet_id: timesheetId,
        current_timesheet_id: timesheetId,
        route_family: 'ELECTRONIC'
      },
      active_details: {
        current_timesheet_id: timesheetId,
        route_family: 'ELECTRONIC',
        timesheet: { timesheet_id: timesheetId, route_family: 'ELECTRONIC' },
        tsfin: {
          mileage_units: 0,
          accommodation_pay_ex_vat: 2.34,
          accommodation_charge_ex_vat: 2.34,
          travel_pay_ex_vat: 0,
          travel_charge_ex_vat: 0,
          other_pay_ex_vat: 0,
          other_charge_ex_vat: 0
        }
      }
    };
    state.active_context = {
      owner_kind: 'BULK_AUTHORISE',
      candidateOfficeSurface: 'BULK_AUTHORISE',
      row: state.active_row,
      details: state.active_details,
      state: { expensesReadOnly: true }
    };
    state.active_ctx = state.active_context;

    (window as any).classifyBulkAuthoriseEditability = () => ({
      canOpenExpenses: false,
      canViewExpenses: true,
      hasProcessedExpenses: true,
      expensesReadOnly: true,
      expenseStorageTarget: 'TSFIN'
    });
    (window as any).refreshBulkAuthoriseActiveContext = async () => true;

    const renderParent = () => state.active_row
      ? `<div id="bulkAuthoriseDeletionIntegrity"><div data-row-key="${timesheetId}">Accommodation · £2.34</div></div>`
      : '<div id="bulkAuthoriseDeletionIntegrity"><div data-bulk-authorise-empty-selection="1">Select another Timesheet to continue.</div></div>';
    (window as any).modalCtx = { entity: 'bulk-authorise', owner_kind: 'BULK_AUTHORISE', bulkAuthoriseState: state };
    (window as any).showModal(
      'Bulk Authorise',
      [{ key: 'main', label: 'Review' }],
      renderParent,
      null,
      false,
      null,
      { kind: 'bulk-authorise', noParentGate: true, showSave: false, showApply: false }
    );
    (window as any).__bulkDeletionProofState = state;
  }, uuid(995));

  await expect(page.locator('#modalTitle')).toHaveText('Bulk Authorise');
  await expect(page.locator('[data-row-key]')).toContainText('Accommodation · £2.34');

  await page.evaluate(async () => {
    await (window as any).handleBulkAuthoriseOpenExpensesModal((window as any).__bulkDeletionProofState);
  });
  await expect(page.locator('#modalTitle')).toHaveText('Expenses');
  await expect(page.locator('#bulkProcessExpensesChildRoot')).toBeVisible();

  await page.evaluate(async () => {
    const state = (window as any).__bulkDeletionProofState;
    state.active_row_key = null;
    state.active_row = null;
    state.active_details = {};
    state.active_context = {};
    state.active_ctx = {};
    const frame = (window as any).__getModalFrame?.();
    await frame.__refreshCandidateOfficeExpenseCategory({ rowVanished: true });
  });

  await expect(page.locator('#modalTitle')).toHaveText('Bulk Authorise');
  await expect(page.locator('#bulkProcessExpensesChildRoot')).toHaveCount(0);
  await expect(page.locator('[data-row-key]')).toHaveCount(0);
  await expect(page.locator('[data-bulk-authorise-empty-selection="1"]')).toHaveText('Select another Timesheet to continue.');
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden();
  await expect(page.locator('#modal [aria-busy="true"]')).toHaveCount(0);

  const samples = await page.evaluate(async () => {
    const observed = [];
    for (let index = 0; index < 12; index += 1) {
      const modal = document.getElementById('modal');
      observed.push({
        title: document.getElementById('modalTitle')?.textContent?.trim() || '',
        childCount: document.querySelectorAll('#bulkProcessExpensesChildRoot').length,
        staleRowCount: document.querySelectorAll('[data-row-key]').length,
        emptyCount: document.querySelectorAll('[data-bulk-authorise-empty-selection="1"]').length,
        busyCount: document.querySelectorAll('#modal [aria-busy="true"]').length,
        overflow: modal ? Math.max(0, modal.scrollWidth - modal.clientWidth) : -1
      });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return observed;
  });
  expect(samples).toEqual(Array.from({ length: 12 }, () => ({
    title: 'Bulk Authorise',
    childCount: 0,
    staleRowCount: 0,
    emptyCount: 1,
    busyCount: 0,
    overflow: 0
  })));
  await captureCandidateOfficeVisual(page, '09-bulk-authorise-final-category-timesheet-removed');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-bulk-authorise-empty-selection="1"]')).toHaveText('Select another Timesheet to continue.');
  expect(await page.locator('#modal').evaluate(element => Math.max(0, element.scrollWidth - element.clientWidth))).toBe(0);
  await expect(page.locator('#btnCloseModal')).toBeVisible();
});

test('browser Back discards stale Office state and reloads canonical Timesheet truth', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installPatchedAssets(page);
  const mocks = await installOfficeMocks(page);
  await openPatchedTest(page);
  await page.locator('button[data-section-key="timesheets"]').click();
  await expect(page.locator('.summary-body[data-summary-section="timesheets"]')).toBeVisible();
  const callsBeforeBack = mocks.metrics().summaryCalls;

  await page.evaluate(() => {
    (window as any).showModal(
      'Stale Timesheet proof',
      [{ key: 'main', label: 'Timesheet' }],
      () => '<div class="tabc" id="candidateOfficeStaleHistoryProof">This view must not survive browser Back.</div>',
      null,
      false,
      null,
      { kind: 'candidate-office-stale-history-proof', noParentGate: true, showSave: false, showApply: false }
    );
    history.pushState({ candidateOfficeProof: true }, '', `${location.pathname}${location.search}#candidate-office-stale-proof`);
  });
  await expect(page.locator('#candidateOfficeStaleHistoryProof')).toBeVisible();

  await page.evaluate(() => history.back());
  await expect(page.locator('#candidateOfficeStaleHistoryProof')).toBeHidden();
  await expect.poll(() => mocks.metrics().summaryCalls).toBeGreaterThan(callsBeforeBack);
  await expect(page.locator('.summary-body[data-summary-section="timesheets"]')).toBeVisible();
  await expect(page.locator('td[data-col-key="candidate_submission"]')).toHaveCount(summaryRows.length);
});

test('Office detail keeps mixed expense facts on their owning Timesheet and keeps each category amount together', async ({ page }) => {
  test.setTimeout(90_000);
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);

  const hoursTimesheetId = uuid(951);
  const expenseTimesheetId = uuid(952);
  const otherExpenseTimesheetId = uuid(956);
  const claim = {
    workflow_id: uuid(953), generation: 2, document_generation: 2,
    state: 'AWAITING_MANAGER_APPROVAL', status_code: 'MIXED', manager_approval_state: 'MIXED', agency_authorisation_state: 'MIXED', attention_code: null,
    target_timesheet_id: hoursTimesheetId, submitted_at_utc: '2026-09-06T08:00:00Z', updated_at_utc: '2026-09-06T09:00:00Z',
    protected: false, can_withdraw: true,
    totals: {
      expenses_pay_ex_vat: 47.5, expenses_description: 'Mixed expenses', mileage_units: 0,
      mileage_pay_ex_vat: 0, travel_pay_ex_vat: 12.5, accommodation_pay_ex_vat: 25, other_pay_ex_vat: 10
    },
    supporting_evidence_count: 5, supporting_evidence_categories: ['ACCOMMODATION', 'TRAVEL', 'OTHER'],
    categories: [
      {
        expense_component_id: uuid(954), component_generation: 1, expense_category: 'ACCOMMODATION', amount: 25, included_in_total: true, mileage_units: 0,
        supporting_evidence_count: 3, state: 'MANAGER_APPROVED', status_code: 'MANAGER_APPROVED', manager_approval_state: 'APPROVED',
        agency_authorisation_state: 'NOT_AUTHORISED', owning_timesheet_id: expenseTimesheetId, refusal: null, protected: false, available_action: null
      },
      {
        expense_component_id: uuid(955), component_generation: 1, expense_category: 'TRAVEL', amount: 12.5, included_in_total: true, mileage_units: 0,
        supporting_evidence_count: 1, state: 'SUBMITTED', status_code: 'MANAGER_APPROVAL_REQUIRED', manager_approval_state: 'PENDING',
        agency_authorisation_state: 'NOT_AUTHORISED', owning_timesheet_id: expenseTimesheetId, refusal: null, protected: false, available_action: null
      },
      {
        expense_component_id: uuid(957), component_generation: 1, expense_category: 'OTHER', amount: 10, included_in_total: true, mileage_units: 0,
        supporting_evidence_count: 1, state: 'MANAGER_APPROVED', status_code: 'MANAGER_APPROVED', manager_approval_state: 'APPROVED',
        agency_authorisation_state: 'NOT_AUTHORISED', owning_timesheet_id: otherExpenseTimesheetId, refusal: null, protected: false, available_action: null
      }
    ],
    whole_claim_action: null, begin_update_action: null, update_state: 'NONE'
  };
  const makeProjection = (timesheetId: string, rowKey: string) => ({
    ...projectionFor({ row_key: rowKey, timesheet_id: timesheetId, contract_week_id: null, expected_row_signature: `${rowKey}-signature` }, 'AWAITING_MANAGER_APPROVAL'),
    expense_claims: [claim]
  });

  await page.evaluate(({ hoursProjection, expenseProjection }) => {
    const contract = (window as any).CloudTMSCandidateOfficeContract;
    const presenter = (window as any).CloudTMSCandidateOfficePresenter;
    const surface = (window as any).CloudTMSCandidateOfficeSurface;
    const render = (raw: any) => surface.renderCandidateOfficeCard(
      presenter.presentCandidateOfficeDetail(contract.normalizeOfficeCandidateProjection(raw, { surface: 'SIMPLE_TIMESHEET' }), { surface: 'SIMPLE_TIMESHEET' }),
      { surface: 'SIMPLE_TIMESHEET' }
    );
    document.body.insertAdjacentHTML('beforeend', `<div id="officeExpenseOwnershipProof" style="display:grid;gap:16px;max-width:740px;padding:16px"><div id="hoursExpenseProof">${render(hoursProjection)}</div><div id="expenseExpenseProof">${render(expenseProjection)}</div></div>`);
  }, {
    hoursProjection: makeProjection(hoursTimesheetId, 'hours-row'),
    expenseProjection: makeProjection(expenseTimesheetId, 'expense-row')
  });

  await expect(page.locator('#hoursExpenseProof')).not.toContainText('Expenses on this Timesheet');
  const expense = page.locator('#expenseExpenseProof');
  await expect(expense).toContainText('Expense total £37.50');
  await expect(expense).toContainText('Accommodation · £25.00');
  await expect(expense).toContainText('Travel · £12.50');
  await expect(expense).toContainText('Manager Approved');
  await expect(expense).toContainText('Awaiting Manager Approval');
  await expect(expense).not.toContainText('Other · £10.00');
  await expect(expense).not.toContainText(/00000000-|workflow_id|expense_component_id|WITHDRAW_EXPENSE|CANCEL_EXPENSE/);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await expense.evaluate(element => ({
      overflow: element.scrollWidth - element.clientWidth,
      labels: Array.from(element.querySelectorAll('.candidate-office-expense-category__header strong')).map(label => ({
        whiteSpace: getComputedStyle(label).whiteSpace,
        height: label.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(label).lineHeight)
      }))
    }));
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.labels).toHaveLength(2);
    for (const label of layout.labels) {
      expect(label.whiteSpace).toBe('nowrap');
      expect(label.height).toBeLessThanOrEqual(label.lineHeight * 1.25);
    }
  }
});

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
  await expect(grid).not.toContainText('Loading Candidate status');
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
  const startX = Math.round(box.x + box.width / 2);
  await resizer.dispatchEvent('mousedown', { button: 0, clientX: startX, clientY: Math.round(box.y + box.height / 2) });
  await page.evaluate(({ from, to }) => {
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: to }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: to }));
    return { from, to };
  }, { from: startX, to: startX + 75 });
  await expect.poll(async () => (await candidate.evaluate(element => Math.round(element.getBoundingClientRect().width))) > widthBefore + 20).toBe(true);
  await expect.poll(async () => mocks.gridPatches.some(patch => Number(patch?.prefs?.columns?.candidate_submission?.width) > widthBefore)).toBe(true);

  const issueHeader = grid.locator('th[data-col-key="issue_codes"]');
  const patchesBeforeIssueDrag = mocks.gridPatches.length;
  await issueHeader.dragTo(candidate);
  await expect.poll(async () => mocks.gridPatches.length).toBeGreaterThan(patchesBeforeIssueDrag);

  await candidate.click();
  await expect(candidate).toContainText('▲');
  await expect.poll(() => mocks.metrics().summaryOrders.some(order => order.order_by === 'candidate_submission' && order.order_dir === 'asc')).toBe(true);
  const statusLabels = await grid.locator('td[data-col-key="candidate_submission"] .candidate-office-summary-status').allTextContents();
  expect(statusLabels).toEqual([
    'Awaiting Candidate Submission', 'Awaiting Manager Approval', 'Candidate Submission Complete',
    'Candidate Submitted', 'Manager Approved', 'Rejected by Agency'
  ]);
  await candidate.click();
  await expect(candidate).toContainText('▼');
  await expect.poll(() => mocks.metrics().summaryOrders.some(order => order.order_by === 'candidate_submission' && order.order_dir === 'desc')).toBe(true);
  expect(await grid.locator('td[data-col-key="candidate_submission"] .candidate-office-summary-status').allTextContents()).toEqual([...statusLabels].reverse());
  expect(mocks.metrics().projectionCalls).toBe(0);
  expect(mocks.metrics().summaryCallsWithCandidateProjection).toBe(mocks.metrics().summaryCalls);
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
      const completeProjection = make('PAID', 'RETURN_RECEIVED');
      completeProjection.workflow = { state: 'FINALISED', historical: true };
      const complete = presenter.presentCandidateOfficeDetail(completeProjection, { surface: 'SIMPLE_TIMESHEET' });
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

test('approved hours stay clean while the pending expense appears only on its own Timesheet row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);

  const hoursTimesheetId = uuid(941);
  const expenseTimesheetId = uuid(942);
  const claim = {
    workflow_id: uuid(943), generation: 2, document_generation: 2,
    state: 'READY_FOR_MANAGER_APPROVAL', status_code: 'MANAGER_APPROVAL_REQUIRED',
    manager_approval_state: 'PENDING', agency_authorisation_state: 'NOT_AUTHORISED', attention_code: null,
    target_timesheet_id: hoursTimesheetId, submitted_at_utc: '2026-09-05T08:00:00Z', updated_at_utc: '2026-09-05T08:00:00Z',
    protected: false, can_withdraw: true,
    totals: {
      expenses_pay_ex_vat: 25, expenses_description: 'Accommodation', mileage_units: 0,
      mileage_pay_ex_vat: 0, travel_pay_ex_vat: 0, accommodation_pay_ex_vat: 25, other_pay_ex_vat: 0
    },
    supporting_evidence_count: 3, supporting_evidence_categories: ['ACCOMMODATION'],
    categories: [{
      expense_component_id: uuid(944), component_generation: 1, expense_category: 'ACCOMMODATION', amount: 25,
      included_in_total: true, mileage_units: 0, supporting_evidence_count: 3, state: 'SUBMITTED',
      status_code: 'MANAGER_APPROVAL_REQUIRED', manager_approval_state: 'PENDING', agency_authorisation_state: 'NOT_AUTHORISED',
      owning_timesheet_id: expenseTimesheetId, refusal: null, protected: false, available_action: null
    }],
    whole_claim_action: null, begin_update_action: null, update_state: 'NONE'
  };
  const hoursBase = projectionFor({ row_key: 'approved-hours-row', timesheet_id: hoursTimesheetId, contract_week_id: null, expected_row_signature: 'approved-hours-signature' }, 'MANAGER_APPROVED');
  const expenseBase = projectionFor({ row_key: 'pending-expense-row', timesheet_id: expenseTimesheetId, contract_week_id: null, expected_row_signature: 'pending-expense-signature' }, 'WORKER_SUBMITTED');
  const hoursProjection = {
    ...hoursBase,
    current_identity: {
      ...hoursBase.current_identity,
      record_role: 'HOURS_ONLY'
    },
    workflow: { state: 'MANAGER_APPROVED', workflow_kind: 'CONTRACT_HOURS', route: 'EMAIL', historical: false },
    expense_claims: [claim]
  };
  const expenseProjection = {
    ...expenseBase,
    current_identity: {
      ...expenseBase.current_identity,
      record_role: 'EXPENSE_ONLY'
    },
    workflow: { state: 'READY_FOR_MANAGER_APPROVAL', workflow_kind: 'CONTRACT_EXPENSE', route: 'PHONE', historical: false },
    expense_claims: [claim]
  };

  const result = await page.evaluate(({ hoursProjection, expenseProjection }) => {
    const contract = (window as any).CloudTMSCandidateOfficeContract;
    const presenter = (window as any).CloudTMSCandidateOfficePresenter;
    const surface = (window as any).CloudTMSCandidateOfficeSurface;
    const present = (raw: any) => {
      const normalized = contract.normalizeOfficeCandidateProjection(raw, { surface: 'SIMPLE_TIMESHEET' });
      const detail = presenter.presentCandidateOfficeDetail(normalized, { surface: 'SIMPLE_TIMESHEET' });
      const summary = presenter.presentCandidateOfficeSummary(normalized);
      return {
        status: detail.status?.label,
        summaryHtml: surface.renderCandidateSummaryCell(summary),
        stageHtml: surface.renderCandidateStageFragment(detail),
        overviewHtml: surface.renderCandidateOverviewFragment(detail),
        cardHtml: surface.renderCandidateOfficeCard(detail, { surface: 'SIMPLE_TIMESHEET' })
      };
    };
    return {
      hours: present(hoursProjection),
      expense: present(expenseProjection)
    };
  }, { hoursProjection, expenseProjection });

  expect(result.hours.status).toBe('Manager Approved');
  for (const html of [result.hours.summaryHtml, result.hours.stageHtml, result.hours.cardHtml]) {
    expect(html).toContain('Manager Approved');
    expect(html).not.toContain('Candidate Submitted');
    expect(html).not.toContain('Expense claim');
  }
  expect(result.hours.overviewHtml).not.toContain('Expenses on this Timesheet');
  expect(result.hours.overviewHtml).not.toContain('Accommodation');

  expect(result.expense.status).toBe('Candidate Submitted');
  for (const html of [result.expense.summaryHtml, result.expense.stageHtml, result.expense.cardHtml]) {
    expect(html).toContain('Candidate Submitted');
    expect(html).not.toContain('Timesheet hours');
  }
  expect(result.expense.overviewHtml).toContain('Candidate submission');
  expect(result.expense.overviewHtml).toContain('Candidate Submitted');
  expect(result.expense.overviewHtml).not.toContain('Expenses on this Timesheet');
  expect(result.expense.overviewHtml).not.toContain('Accommodation · £25.00');
});

test('Manual non-QR, HealthRoster and NHSP authoritative rows never display a Candidate lifecycle on any Office surface', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installPatchedAssets(page);
  const mocks = await installOfficeMocks(page);
  await openPatchedTest(page);

  const bridgeTransport = await page.evaluate(() => {
    const bridge = (window as any).CloudTMSCandidateOfficeBridge;
    const manual = {
      row_key: 'real-shaped-daily-manual',
      timesheet_id: '00000000-0000-4000-8000-000000000990',
      contract_id: null,
      contract_week_id: null,
      route_type: 'DAILY_MANUAL',
      route_family: 'MANUAL_NON_QR',
      candidate_office_projection_not_applicable: true
    };
    return ['TIMESHEET_SUMMARY', 'SIMPLE_TIMESHEET', 'BULK_PROCESS', 'BULK_AUTHORISE']
      .map(surface => ({ surface, html: bridge.slotHtml(surface, manual, { compact: surface !== 'SIMPLE_TIMESHEET' }) }));
  });
  expect(bridgeTransport).toEqual([
    { surface: 'TIMESHEET_SUMMARY', html: '' },
    { surface: 'SIMPLE_TIMESHEET', html: '' },
    { surface: 'BULK_PROCESS', html: '' },
    { surface: 'BULK_AUTHORISE', html: '' }
  ]);
  expect(mocks.metrics().projectionCalls).toBe(0);

  const result = await page.evaluate(() => {
    const presenter = (window as any).CloudTMSCandidateOfficePresenter;
    const surface = (window as any).CloudTMSCandidateOfficeSurface;
    const make = (name: string, routeFamily: string, code: string, availableActions: any[] = []) => ({
      ok: true,
      contract_version: 'OFFICE_CANDIDATE_TIMESHEET_V1',
      office_contract_version: 'CLOUDTMS_OFFICE_CANDIDATE_API_V1',
      current_identity: { row_key: name, route_family: routeFamily },
      candidate_status: { code, label: `raw ${code}`, tone: 'success' },
      workflow: null,
      manager_approval: null,
      paper_pack: { state: 'NOT_APPLICABLE' },
      rejections: [],
      primary_action: null,
      available_actions: availableActions,
      diagnostics: [],
      refresh_hints: { refetch: 'CURRENT_ROW' },
      observed_at_utc: '2026-08-14T08:00:00Z'
    });
    const inputs = [
      make('manual', 'MANUAL_NON_QR', 'PAID', [{ code: 'ALLOW_ELECTRONIC_AGAIN', label: 'Enable Electronic Submission', group: 'ROUTE', enabled: true, prominent: false }]),
      make('manual-adjustment', 'MANUAL_NON_QR', 'INVOICED_NOT_PAID'),
      make('healthroster', 'IMPORT_AUTHORITATIVE', 'AUTHORISED'),
      make('healthroster-adjustment', 'IMPORT_AUTHORITATIVE', 'PAID'),
      make('nhsp', 'IMPORT_AUTHORITATIVE', 'INVOICED_NOT_PAID'),
      make('nhsp-adjustment', 'IMPORT_AUTHORITATIVE', 'FINALISED')
    ];
    const surfaces = ['TIMESHEET_SUMMARY', 'SIMPLE_TIMESHEET', 'BULK_PROCESS', 'BULK_AUTHORISE'];
    const rendered: any[] = [];
    for (const projection of inputs) {
      for (const surfaceName of surfaces) {
        const view = surfaceName === 'TIMESHEET_SUMMARY'
          ? presenter.presentCandidateOfficeSummary(projection)
          : presenter.presentCandidateOfficeDetail(projection, { surface: surfaceName });
        rendered.push({
          row: projection.current_identity.row_key,
          surface: surfaceName,
          status: view.status,
          html: surface.renderCandidateFragment(view, { surface: surfaceName, variant: surfaceName === 'SIMPLE_TIMESHEET' ? 'stage' : 'compact' }),
          actionCodes: view.actions?.map((action: any) => action.code) || []
        });
      }
    }
    return rendered;
  });

  expect(result).toHaveLength(24);
  for (const row of result) {
    expect(row.status, `${row.row} / ${row.surface}`).toBeNull();
    expect(row.html, `${row.row} / ${row.surface}`).not.toMatch(/Candidate Submission|Status unavailable/);
  }
  const manualDetail = result.find(row => row.row === 'manual' && row.surface === 'SIMPLE_TIMESHEET');
  expect(manualDetail.actionCodes).toContain('ALLOW_ELECTRONIC_AGAIN');
  expect(mocks.metrics().projectionCalls).toBe(0);
});

test('Simple Timesheet route labels and Authorise eligibility follow only canonical route and processing authority', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);

  const result = await page.evaluate(() => {
    const makeCtx = (name: string, routeFamily: string, routeType: string, processingStatus: string, canAuthorise: boolean, notApplicable = false) => {
      const timesheetId = name === 'qr-awaiting' ? '00000000-0000-4000-8000-000000000981'
        : (name === 'qr-complete' ? '00000000-0000-4000-8000-000000000982'
          : (name === 'manual' ? '00000000-0000-4000-8000-000000000983' : '00000000-0000-4000-8000-000000000984'));
      const signature = `trusted-${name}`;
      const actionFlags = {
        can_authorise: canAuthorise,
        can_unauthorise: false,
        can_unprocess: false,
        unprocess_action_visible: false,
        can_save: routeFamily === 'MANUAL_NON_QR',
        can_edit: routeFamily === 'MANUAL_NON_QR',
        is_archived: false,
        has_retained_financial_history: false,
        read_only: false,
        refresh_required: false,
        requires_affected_row_refresh: false,
        lifecycle_authority_complete: true,
        permission_state_patch_complete: true,
        priority_badges_patch_complete: true
      };
      const row: any = {
        row_key: `timesheet:${timesheetId}`,
        id: timesheetId,
        timesheet_id: timesheetId,
        current_timesheet_id: timesheetId,
        expected_timesheet_id: timesheetId,
        backend_row_signature: signature,
        row_signature: signature,
        expected_row_signature: signature,
        route_family: routeFamily,
        route_subfamily: routeFamily,
        underlying_channel_family: routeFamily,
        route_type: routeType,
        processing_status: processingStatus,
        summary_stage: processingStatus,
        tools_stage: processingStatus === 'PENDING_AUTH' ? 'PROCESSED' : 'UNPROCESSED',
        processing_status_display: processingStatus === 'PENDING_AUTH' ? 'Processed' : 'Unprocessed',
        sheet_scope: 'DAILY',
        submission_mode: routeFamily === 'MANUAL_NON_QR' ? 'MANUAL' : 'ELECTRONIC',
        authorised: false,
        is_authorised: false,
        is_archived: false,
        has_retained_financial_history: false,
        can_unprocess: false,
        unprocess_action_visible: false,
        read_only: false,
        locked: false,
        lifecycle_authority_complete: true,
        permission_state_patch_complete: true,
        priority_badges_patch_complete: true,
        lifecycle_state_trusted: true,
        candidate_office_projection_not_applicable: notApplicable,
        action_flags: actionFlags
      };
      return {
        entity: 'timesheets',
        mode: 'view',
        data: { ...row },
        timesheetMeta: { expected_timesheet_id: timesheetId, current_timesheet_id: timesheetId, backend_row_signature: signature },
        timesheetDetails: {
          ...row,
          row: { ...row },
          effective: { route_family: routeFamily, route_subfamily: routeFamily, underlying_channel_family: routeFamily, route_type: routeType },
          timesheet: { ...row },
          tsfin: { processing_status: processingStatus, authorised_at_utc: null, locked_by_invoice_id: null },
          action_flags: actionFlags,
          lifecycle_authority_complete: true,
          permission_state_patch_complete: true,
          priority_badges_patch_complete: true,
          refresh_required: false,
          requires_affected_row_refresh: false
        },
        __timesheetLifecycleTrusted: { trusted: true, timesheet_id: timesheetId, signature, backend_row_signature: signature },
        __timesheetLifecyclePermissionStateComplete: true,
        __timesheetLifecyclePriorityBadgesComplete: true,
        __timesheetLifecycleCriticalStateIncomplete: false
      };
    };
    const contexts = {
      qrAwaiting: makeCtx('qr-awaiting', 'QR', 'DAILY_QR', 'UNPROCESSED', false),
      qrComplete: makeCtx('qr-complete', 'QR', 'DAILY_QR', 'PENDING_AUTH', true),
      manual: makeCtx('manual', 'MANUAL_NON_QR', 'DAILY_MANUAL', 'PENDING_AUTH', true, true),
      electronic: makeCtx('electronic', 'ELECTRONIC', 'DAILY_ELECTRONIC', 'PENDING_AUTH', true)
    };
    const readOverview = (ctx: any) => {
      const host = document.createElement('div');
      host.innerHTML = (window as any).renderTimesheetOverviewTab(ctx);
      const rowText = (label: string) => {
        const labelNode = Array.from(host.querySelectorAll('label')).find(node => String(node.textContent || '').trim() === label);
        return String((labelNode?.closest('.row') || labelNode?.parentElement)?.textContent || '').replace(/\s+/g, ' ').trim();
      };
      return { route: rowText('Route'), stage: rowText('Stage') };
    };
    const overview = Object.fromEntries(Object.entries(contexts).map(([key, ctx]) => [key, readOverview(ctx)]));
    (window as any).__candidateRouteContexts = contexts;
    return { overview };
  });

  expect(result.overview.qrAwaiting.route).toContain('QR');
  expect(result.overview.qrComplete.route).toContain('QR');
  expect(result.overview.manual.route).toContain('Manual');
  expect(result.overview.manual.route).not.toContain('QR');
  expect(result.overview.electronic.route).toContain('Electronic');
  expect(result.overview.qrComplete.stage).toContain('Processed');

  const openFixture = async (key: 'qrAwaiting' | 'qrComplete' | 'manual' | 'electronic') => {
    const close = page.locator('#btnCloseModal');
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      await expect(page.locator('#modal')).toBeHidden();
    }
    await page.evaluate((fixtureKey) => {
      const contexts = (window as any).__candidateRouteContexts;
      (window as any).modalCtx = contexts[fixtureKey];
      (window as any).showModal('Timesheet — canonical authority', [{ key: 'overview', label: 'Overview' }], () => (window as any).renderTimesheetOverviewTab((window as any).modalCtx), null, true, undefined, { kind: 'timesheets' });
    }, key);
    await expect(page.locator('#modal')).toBeVisible();
  };

  await openFixture('qrAwaiting');
  await expect(page.locator('#btnTsAuthorise')).toBeHidden();
  await openFixture('manual');
  await expect(page.locator('#btnTsAuthorise')).toBeVisible();
  await expect(page.locator('#btnTsAuthorise')).toBeEnabled();
  await openFixture('electronic');
  await expect(page.locator('#btnTsAuthorise')).toBeVisible();
  await expect(page.locator('#btnTsAuthorise')).toBeEnabled();
  await openFixture('qrComplete');

  const modal = page.locator('#modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Processed', { exact: true })).toBeVisible();
  await expect(modal.getByText('QR', { exact: true })).toBeVisible();
  await expect(page.locator('#btnTsAuthorise')).toBeVisible();
  await expect(page.locator('#btnTsAuthorise')).toBeEnabled();
  const bounds = await modal.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
});

test('Manual QR, reversal and expense carriers use exact Office wording without malformed dates or a false processing delay', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);

  const result = await page.evaluate(() => {
    const presenter = (window as any).CloudTMSCandidateOfficePresenter;
    const surface = (window as any).CloudTMSCandidateOfficeSurface;
    const make = (identity: any, workflow: any, paperPack: any, code: string) => ({
      ok: true,
      contract_version: 'OFFICE_CANDIDATE_TIMESHEET_V1',
      office_contract_version: 'CLOUDTMS_OFFICE_CANDIDATE_API_V1',
      current_identity: identity,
      candidate_status: { code, label: `raw ${code}`, tone: 'danger' },
      workflow,
      manager_approval: null,
      retained_manager_approval: null,
      paper_pack: paperPack,
      rejections: [], primary_action: null, available_actions: [], diagnostics: [],
      refresh_hints: {}, observed_at_utc: '2026-09-05T08:00:00Z'
    });
    const printed = make(
      { row_key: 'printed', route_family: 'QR', record_role: 'COMBINED_ALLOWED' },
      { state: 'AWAITING_PAPER_RETURN', route: 'PAPER', historical: false, is_current_action_workflow: true },
      { state: 'FAILED_TERMINAL', reason_code: 'CANDIDATE_PAPER_OUTBOX_CONFLICT' },
      'AWAITING_PAPER_RETURN'
    );
    printed.available_actions = [{
      code: 'ISSUE_REPLACEMENT_PAPER_PACK',
      label: 'raw replacement label',
      group: 'PAPER',
      enabled: true,
      prominent: true
    }];
    const expense = make(
      { row_key: 'expense', route_family: 'IMPORT_AUTHORITATIVE', record_role: 'EXPENSE_ONLY' },
      { state: 'FINALISED', route: 'PHONE', historical: true, is_current_action_workflow: false },
      { state: 'NOT_APPLICABLE' },
      'AUTHORISED'
    );
    const processingBadge = (buildTimesheetProcessingStatusBadge as any)({
      processing_status: 'AWAITING_MANUAL_SIGNATURE',
      processing_status_display: 'Processed',
      summary_stage: 'PROCESSED',
      tools_stage: 'PROCESSED'
    }, 'Processed').outerHTML;
    const reversalList = (renderBulkAuthoriseLists as any)({
      classification: 'TIMESHEETS',
      filters: {},
      selected_row_keys_by_section: {},
      dataset: { rows: [{
        row_key: '00000000-0000-4000-8000-000000000120',
        timesheet_id: '00000000-0000-4000-8000-000000000120',
        candidate_name: 'Reversal candidate',
        client_name: 'Reversal client',
        bulk_authorise_classification: 'TIMESHEETS',
        bulk_authorise_section: 'processed_eligible',
        route_family: 'IMPORT_AUTHORITATIVE',
        period_type: 'WEEKLY',
        correction_id: '00000000-0000-4000-8000-000000000121',
        correction_kind: 'CHANGED_HOURS_REVERSAL',
        adjustment_origin: 'IMPORT_CORRECTION',
        correction_source_system: 'NHSP',
        correction_display_label: 'NHSP Reversal',
        total_hours: -8,
        week_ending_date: '2026—2026-',
        contract_week_ending_date: '2026-09-06'
      }] }
    });
    return {
      printed: surface.renderCandidateSummaryCell(presenter.presentCandidateOfficeSummary(printed)),
      printedDetail: surface.renderCandidateOfficeCard(presenter.presentCandidateOfficeDetail(printed)),
      expense: surface.renderCandidateSummaryCell(presenter.presentCandidateOfficeSummary(expense)),
      processingBadge,
      reversalList
    };
  });

  expect(result.printed).toContain('QR Pack Needs Attention');
  expect(result.printedDetail).toContain('Reason');
  expect(result.printedDetail).toContain('CloudTMS found conflicting QR Pack delivery records, so it stopped before sending another copy.');
  expect(result.printedDetail).toContain('Next step');
  expect(result.printedDetail).toContain('Use “Create Replacement QR Pack and Notify Worker” below.');
  expect(result.printedDetail).toContain('data-candidate-office-action="ISSUE_REPLACEMENT_PAPER_PACK"');
  expect(result.printedDetail).not.toContain('CANDIDATE_PAPER_OUTBOX_CONFLICT');
  expect(result.expense).toContain('Candidate Submission Complete');
  expect(result.processingBadge).toContain('Processed');
  expect(result.processingBadge).not.toContain('Processing Delayed');
  expect(result.reversalList).toContain('06-09-2026');
  expect(result.reversalList).toContain('Timesheet Adjustment');
  expect(result.reversalList).not.toContain('2026—2026-');
  expect(result.reversalList).not.toContain('NHSP Reversal');

  await page.evaluate(detailHtml => {
    (window as any).showModal(
      'QR Pack Needs Attention',
      [{ key: 'main', label: 'Candidate Submission' }],
      () => `<div class="tabc" data-qr-attention-visual="1">${detailHtml}</div>`,
      null,
      false,
      null,
      { kind: 'candidate-office-qr-attention-visual', noParentGate: true, showSave: false, showApply: false }
    );
  }, result.printedDetail);
  const qrAttentionModal = page.locator('#modal');
  await expect(qrAttentionModal.getByText('Reason', { exact: true })).toBeVisible();
  await expect(qrAttentionModal).toContainText('CloudTMS found conflicting QR Pack delivery records, so it stopped before sending another copy.');
  await expect(qrAttentionModal.getByText('Next step', { exact: true })).toBeVisible();
  await expect(qrAttentionModal).toContainText('Use “Create Replacement QR Pack and Notify Worker” below.');
  await expect(qrAttentionModal.getByRole('button', { name: 'Create Replacement QR Pack and Notify Worker', exact: true })).toBeVisible();
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 30_000 });
  await captureCandidateOfficeVisual(page, '09-qr-pack-needs-attention-reason-next-step');
});

test('weekly evidence with an empty schedule omits the misleading zero-shift count', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 760 });
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);

  await page.evaluate(() => {
    const timesheetId = '00000000-0000-4000-8000-000000000130';
    (window as any).modalCtx = {
      data: { timesheet_id: timesheetId },
      timesheetDetails: {
        timesheet: {
          id: timesheetId,
          timesheet_id: timesheetId,
          sheet_scope: 'WEEKLY',
          week_ending_date: '2026-09-06',
          actual_schedule_json: []
        }
      }
    };
    (window as any).__zeroShiftEvidenceError = '';
    void (window as any).openTimesheetEvidenceViewerSignatures({
      created_at: '2026-09-06T09:00:00Z',
      meta: {
        booking_id: '00000000-0000-4000-8000-000000000131',
        sheet_scope: 'WEEKLY',
        week_ending_date: '2026-09-06',
        actual_schedule_json: [],
        auth_name: 'Test Manager',
        auth_job_title: 'Ward Manager',
        authorised_at_server: '2026-09-06T09:00:00Z'
      }
    }).catch((error: unknown) => { (window as any).__zeroShiftEvidenceError = String((error as Error)?.message || error); });
  });

  const modal = page.locator('#modal');
  await expect(modal).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__zeroShiftEvidenceError)).toBe('');
  await expect(modal.getByText('Shift details', { exact: true })).toBeVisible();
  await expect(modal).toContainText('Week ending: 2026-09-06');
  await expect(modal).not.toContainText('Shifts: 0');
  await expect(modal).not.toContainText(/Shifts:/);
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 30_000 });
  await captureCandidateOfficeVisual(page, '10-weekly-evidence-zero-shifts-omitted');
});

test('Office values and evidence are read-only for Candidate-controlled QR and Electronic routes', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installPatchedAssets(page);
  await installOfficeMocks(page);
  await openPatchedTest(page);

  const viewports = [
    { name: 'desktop', width: 1440, height: 960 },
    { name: 'ipad', width: 820, height: 1180 },
    { name: 'large-phone', width: 412, height: 915 },
    { name: 'phone', width: 390, height: 844 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const mode of ['ELECTRONIC', 'QR', 'MANUAL'] as const) {
      const policy = await page.evaluate((submissionMode) => {
        (window as any).discardAllModalsAndState?.();
        const timesheetId = `00000000-0000-4000-8000-${submissionMode === 'MANUAL' ? '000000000991' : (submissionMode === 'QR' ? '000000000992' : '000000000993')}`;
        const routeFamily = submissionMode === 'MANUAL' ? 'MANUAL_NON_QR' : submissionMode;
        const routeType = `WEEKLY_${submissionMode}`;
        const timesheet = {
          id: timesheetId,
          timesheet_id: timesheetId,
          submission_mode: submissionMode,
          route_family: routeFamily,
          route_type: routeType,
          processing_status: 'UNPROCESSED',
          qr_status: submissionMode === 'QR' ? 'USED' : null
        };
        const tsfin = {
          id: `financial-${submissionMode.toLowerCase()}`,
          timesheet_id: timesheetId,
          processing_status: 'UNPROCESSED',
          mileage_units: 2,
          mileage_pay_rate: 0.55,
          mileage_charge_rate: 0.65,
          travel_pay_ex_vat: 12.34,
          travel_charge_ex_vat: 15.67,
          accommodation_pay_ex_vat: 0,
          accommodation_charge_ex_vat: 0,
          other_pay_ex_vat: 0,
          other_charge_ex_vat: 0
        };
        const row = {
          ...timesheet,
          current_timesheet_id: timesheetId,
          sheet_scope: 'HOURS',
          lifecycle_authority_complete: true,
          permission_state_patch_complete: true,
          priority_badges_patch_complete: true,
          read_only: false,
          locked: false,
          authorised: false,
          is_authorised: false
        };
        const policy = (window as any).classifyTimesheetEditDomains({ row, timesheet, tsfin });
        const ctx: any = {
          entity: 'timesheets',
          mode: 'view',
          data: { ...row },
          row: { ...row },
          timesheetEditDomains: policy,
          editDomains: policy,
          timesheetDetails: {
            ...row,
            row: { ...row },
            timesheet,
            tsfin,
            effective: { route_family: routeFamily, route_type: routeType },
            lifecycle_authority_complete: true,
            permission_state_patch_complete: true,
            priority_badges_patch_complete: true
          },
          timesheetState: { expensesDraft: null }
        };
        (window as any).modalCtx = ctx;
        (window as any).showModal(
          `Office ${submissionMode} timesheet expenses`,
          [{ key: 'expenses', label: 'Expenses' }],
          () => (window as any).renderTimesheetExpensesTab((window as any).modalCtx),
          null,
          true,
          undefined,
          { kind: 'timesheet-office-expense-policy' }
        );
        return {
          canEditExpenses: policy.canEditExpenses,
          canManageExpenseEvidence: policy.canManageExpenseEvidence,
          expenseStorageTarget: policy.expenseStorageTarget,
          expenseEvidenceStorageTarget: policy.expenseEvidenceStorageTarget,
          expensesDisabledReason: policy.expensesDisabledReason
        };
      }, mode);

      const modal = page.locator('#modal');
      const travelPay = page.getByTestId('timesheet-expense-travel-pay');
      await expect(modal).toBeVisible();
      await page.evaluate(() => {
        const frame = (window as any).__getModalFrame?.();
        if (!frame) throw new Error('Timesheet modal frame is unavailable');
        frame.entity = 'timesheets';
        frame.mode = 'edit';
        frame.setTab('expenses');
        frame._updateButtons?.();
      });
      await expect(travelPay).toBeVisible();

      if (mode === 'MANUAL') {
        expect(policy.canEditExpenses).toBe(true);
        expect(policy.canManageExpenseEvidence).toBe(true);
        await expect(travelPay).toBeEnabled();
        await expect(modal.locator('.ctms-expense-grid')).toBeVisible();
      } else {
        expect(policy.canEditExpenses).toBe(false);
        expect(policy.canManageExpenseEvidence).toBe(false);
        expect(policy.expenseStorageTarget).toBe('TSFIN');
        expect(policy.expenseEvidenceStorageTarget).toBe('TIMESHEET_EVIDENCE');
        expect(policy.expensesDisabledReason).toMatch(/controlled through MyTMS/i);
        await expect(travelPay).toBeDisabled();
        await expect(modal.getByText(/controlled through MyTMS/i)).toHaveCount(0);
        await expect(modal.getByText(/return the Timesheet to Office control/i)).toHaveCount(0);
        const evidenceHtml = await page.evaluate(() => (window as any).renderTimesheetEvidenceTab((window as any).modalCtx));
        expect(evidenceHtml).not.toContain('data-evidence-add="1"');
        expect(evidenceHtml).not.toMatch(/return the Timesheet to Office control/i);
      }

      const bounds = await modal.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(-1);
      expect(bounds.top).toBeGreaterThanOrEqual(-1);
      expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);

      if (mode === 'ELECTRONIC') {
        await page.screenshot({ path: testInfo.outputPath(`office-expenses-${viewport.name}.png`), fullPage: false });
      }
    }
  }
});

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

for (const scenario of [
  { status: 403, mode: 'STATUS_403_THEN_PARTIAL' as const, viewport: { width: 1440, height: 960 }, layout: 'desktop' },
  { status: 429, mode: 'STATUS_429_THEN_PARTIAL' as const, viewport: { width: 768, height: 900 }, layout: 'narrow' }
]) {
  test(`a ${scenario.status} status lookup on ${scenario.layout} retains the exact batch until durable recovery`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(scenario.viewport);
    await installPatchedAssets(page);
    const mocks = await installOfficeMocks(page, { reminderResult: scenario.mode });
    await openPatchedTest(page);
    const workspace = await startReminderBatch(page);
    await expectRecoveryOnly(workspace);
    await expect(page.locator('#btnCloseModal')).toBeDisabled();
    await expect(page.locator('#btnCloseModal')).toBeHidden();
    const retained = await page.evaluate(() => sessionStorage.getItem('cloudtms.candidateOffice.managerReminderRecovery.v1'));
    expect(retained).not.toBeNull();
    expect(mocks.metrics().executeCalls).toBe(1);
    expect(mocks.metrics().statusCalls).toBe(1);
    const recoveryLayout = await workspace.evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    expect(recoveryLayout.scrollWidth).toBeLessThanOrEqual(recoveryLayout.clientWidth + 2);

    await workspace.getByRole('button', { name: 'Refresh current state', exact: true }).click();
    await expect(workspace.getByRole('heading', { name: 'Some reminders could not be sent', exact: true })).toBeVisible();
    await expect(page.locator('#btnCloseModal')).toBeEnabled();
    expect(mocks.metrics().executeCalls).toBe(1);
    expect(mocks.metrics().statusCalls).toBe(2);
    expect(await page.evaluate(() => sessionStorage.getItem('cloudtms.candidateOffice.managerReminderRecovery.v1'))).toBeNull();
    expect(await page.evaluate(() => !!(window as any).__nativeDialogUsed)).toBe(false);
  });
}
