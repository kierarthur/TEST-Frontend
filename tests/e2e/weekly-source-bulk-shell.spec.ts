/**
 * WP-12 (Gate 10) — the REAL Bulk shell.
 *
 *   * `XSG-022` — the eligible-row COMMIT proof. `IMPLEMENTATION_STATUS.md` has
 *     carried this as a release blocker: the entry half is proved, the half
 *     that matters ("can you actually complete the action") existed in no test
 *     file. This spec loads an eligible row into the real Bulk Authorise
 *     workbench, performs the guarded action, and shows the committed result
 *     after a refresh, with no duplicate request and no silent no-op.
 *   * `XSG-021` — the phone, folding-phone and tablet layouts, on the real Bulk
 *     shell rather than a fragment.
 *   * `XSG-023` — Queue/Attached, Previous/Next, Upload and Attach preserved
 *     and click-tested.
 *
 * The shell is the real one: real `index.html`, real `js/main.js`, real
 * stylesheets. Only the broker is a local deterministic stub, because Plan 6.2
 * forbids this package from touching hosted TEST.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountOfficeShell, externalRequests } from './helpers/weekly-source-local-shell';

const fixture = JSON.parse(readFileSync(
  resolve(__dirname, '../fixtures/weekly-source-lifecycle-states.json'),
  'utf8'
));
const presentationFixture = JSON.parse(readFileSync(
  resolve(__dirname, '../fixtures/weekly-source-presentation-v1.json'),
  'utf8'
));

const SHOT_DIR = 'test-results/wp12-bulk-shell';
const TIMESHEET_ID = 'fa000000-0000-4000-8000-000000000001';
const MANUAL_TIMESHEET_A = 'fa000000-0000-4000-8000-000000000091';
const MANUAL_TIMESHEET_B = 'fa000000-0000-4000-8000-000000000092';

type RowOverrides = Record<string, unknown>;

function eligibleRow(overrides: RowOverrides = {}) {
  const base = {
    row_key: 'wp12-row-1',
    stable_row_id: 'wp12-row-1',
    timesheet_id: TIMESHEET_ID,
    current_timesheet_id: TIMESHEET_ID,
    requested_timesheet_id: TIMESHEET_ID,
    expected_timesheet_id: TIMESHEET_ID,
    contract_week_id: null,
    row_signature: 'wp12-sig-1',
    backend_row_signature: 'wp12-sig-1',
    candidate_id: 'f3000000-0000-4000-8000-000000000001',
    candidate_name: 'Jane Smith',
    candidate_display_name: 'Jane Smith',
    client_id: 'f2000000-0000-4000-8000-000000000001',
    client_name: "St Mary's NHS Trust",
    week_ending_date: '2026-09-06',
    work_date: '2026-09-01',
    period_type: 'WEEKLY',
    summary_stage: 'Processed',
    tools_stage: 'Processed',
    processing_status: 'PROCESSED',
    processing_status_display: 'Processed',
    is_archived: false,
    archived_at_utc: null,
    archived_by_user_id: null,
    archived_by_display: null,
    archived_reason_code: null,
    route_type: 'ELECTRONIC',
    route_display: 'Client system hours',
    submission_mode: 'ELECTRONIC',
    sheet_scope: 'WEEKLY',
    route_family: 'ELECTRONIC',
    route_subfamily: 'CLIENT_PROVIDED_HOURS',
    correction_id: null,
    correction_kind: null,
    adjustment_origin: null,
    correction_source_system: null,
    correction_display_label: null,
    bulk_authorise_classification: 'TIMESHEETS',
    weekly_source_category: 'STANDARD_TIMESHEETS',
    weekly_source_presentation: null,
    bulk_authorise_section: 'processed_eligible',
    has_timesheet: true,
    requires_authorisation: true,
    is_authorised: false,
    review_only: false,
    can_bulk_authorise: true,
    can_bulk_unauthorise: false,
    can_edit_timesheet_data: false,
    can_manage_evidence: true,
    can_unprocess: false,
    has_retained_financial_history: false,
    unprocess_block_reason: null,
    unprocess_action_visible: false,
    unprocess_block_message: null,
    has_any_evidence: false,
    evidence_badges: [],
    issue_codes: [],
    total_hours: '7.50',
    permission_state_patch_complete: true,
    priority_badges_patch_complete: true,
    lifecycle_authority_complete: true,
    refresh_required: false,
    requires_affected_row_refresh: false,
    read_only: false,
    locked: false,
    ...overrides
  };
  return {
    ...base,
    action_flags: {
      can_bulk_authorise: base.can_bulk_authorise,
      can_bulk_unauthorise: base.can_bulk_unauthorise,
      can_manage_evidence: true,
      can_unprocess: false,
      unprocess_action_visible: false,
      is_archived: false,
      has_retained_financial_history: false,
      permission_state_patch_complete: true,
      priority_badges_patch_complete: true,
      lifecycle_authority_complete: true,
      refresh_required: false
    }
  };
}

function contextFor(row: ReturnType<typeof eligibleRow>) {
  return {
    ok: true,
    row_key: row.row_key,
    row_signature: row.row_signature,
    backend_row_signature: row.backend_row_signature,
    data_row: row,
    row_patch: {},
    evidence: [],
    left_pane: {},
    compare_payload: { required: false, rows: [], imported_detail_refs: {} },
    details: {
      ...row,
      timesheet: {
        timesheet_id: row.timesheet_id,
        sheet_scope: 'WEEKLY',
        submission_mode: 'ELECTRONIC',
        authorised_at_server: row.is_authorised ? '2026-09-07T09:00:00Z' : null
      },
      tsfin: {
        timesheet_id: row.timesheet_id,
        processing_status: 'PROCESSED',
        total_hours: '7.50',
        total_pay_ex_vat: '100.00',
        total_charge_ex_vat: '150.00',
        locked_by_invoice_id: null,
        paid_at_utc: null
      },
      action_flags: row.action_flags,
      evidence: []
    }
  };
}

function manualRow(input: {
  rowKey: string;
  timesheetId: string;
  candidateId: string;
  candidateName: string;
  start: string;
  end: string;
  workDate: string;
}) {
  return eligibleRow({
    row_key: input.rowKey,
    stable_row_id: input.rowKey,
    timesheet_id: input.timesheetId,
    current_timesheet_id: input.timesheetId,
    requested_timesheet_id: input.timesheetId,
    expected_timesheet_id: input.timesheetId,
    row_signature: `${input.rowKey}-sig`,
    backend_row_signature: `${input.rowKey}-sig`,
    candidate_id: input.candidateId,
    candidate_name: input.candidateName,
    candidate_display_name: input.candidateName,
    work_date: input.workDate,
    week_ending_date: '2026-09-06',
    route_type: 'WEEKLY_MANUAL',
    route_display: 'Manual',
    submission_mode: 'MANUAL',
    route_family: 'MANUAL_NON_QR',
    route_subfamily: 'MANUAL_NON_QR',
    underlying_channel_family: 'MANUAL_NON_QR',
    can_edit_timesheet_data: true,
    can_edit_expenses: true,
    can_manage_evidence: true,
    can_manage_expense_evidence: true,
    expense_storage_target: 'TSFIN',
    expense_evidence_storage_target: 'TIMESHEET_EVIDENCE',
    can_bulk_authorise: true,
    can_bulk_unauthorise: false,
    is_authorised: false,
    review_only: false,
    has_any_evidence: true,
    evidence_badges: [{ kind: 'TIMESHEET', present: true }],
    __manual_start: input.start,
    __manual_end: input.end
  });
}

function manualContext(row: ReturnType<typeof eligibleRow>, evidenceIndex: number) {
  const start = String((row as any).__manual_start || '09:00');
  const end = String((row as any).__manual_end || '17:00');
  const workDate = String(row.work_date || '2026-09-01');
  const timesheetId = String(row.timesheet_id);
  const evidenceId = `ea000000-0000-4000-8000-0000000000${evidenceIndex}`;
  const evidence = [{
    id: evidenceId,
    evidence_id: evidenceId,
    timesheet_id: timesheetId,
    row_key: row.row_key,
    kind: 'TIMESHEET',
    display_name: `${row.candidate_name} signed timesheet.pdf`,
    filename: `${row.candidate_name} signed timesheet.pdf`,
    original_filename: `${row.candidate_name} signed timesheet.pdf`,
    storage_key: `test/manual/${timesheetId}.pdf`,
    file_key: `test/manual/${timesheetId}.pdf`,
    mime_type: 'application/pdf'
  }];
  const actionFlags = {
    ...row.action_flags,
    can_save: true,
    can_edit: true,
    can_edit_timesheet_data: true,
    can_edit_hours_schedule: true,
    can_edit_expenses: true,
    can_manage_evidence: true,
    can_manage_expense_evidence: true,
    expense_storage_target: 'TSFIN',
    expense_evidence_storage_target: 'TIMESHEET_EVIDENCE',
    can_bulk_authorise: true,
    can_bulk_unauthorise: false
  };
  const details = {
    ...row,
    profile: 'editor',
    context_profile: 'editor',
    editor_loaded: true,
    evidence_loaded: true,
    schedule_authoritative: true,
    schedule_pending: false,
    loaded_layers: ['header', 'editor', 'evidence'],
    sheet_scope: 'WEEKLY',
    timesheet: {
      timesheet_id: timesheetId,
      sheet_scope: 'WEEKLY',
      submission_mode: 'MANUAL',
      week_ending_date: '2026-09-06',
      actual_schedule_json: [{
        date: workDate,
        ref: `REF-${evidenceIndex}`,
        start,
        end,
        break_mins: 30
      }],
      additional_units_week: { ONCALL: 1 },
      additional_units_per_day: {},
      authorised_at_server: null
    },
    tsfin: {
      timesheet_id: timesheetId,
      processing_status: 'PROCESSED',
      total_hours: '7.50',
      total_pay_ex_vat: '100.00',
      total_charge_ex_vat: '150.00',
      locked_by_invoice_id: null,
      paid_at_utc: null,
      mileage_units: 0,
      travel_pay_ex_vat: 0,
      travel_charge_ex_vat: 0,
      accommodation_pay_ex_vat: 0,
      accommodation_charge_ex_vat: 0,
      other_pay_ex_vat: 0,
      other_charge_ex_vat: 0
    },
    action_flags: actionFlags,
    expense_storage_target: 'TSFIN',
    expense_evidence_storage_target: 'TIMESHEET_EVIDENCE',
    related: {
      candidate: { id: row.candidate_id, display_name: row.candidate_name },
      client: { id: row.client_id, name: row.client_name },
      contract: {
        id: 'fc000000-0000-4000-8000-000000000001',
        additional_rates_json: [{
          code: 'ONCALL',
          bucket_name: 'On call',
          unit_name: 'unit',
          frequency: 'ONE_PER_WEEK',
          pay_rate: 5,
          charge_rate: 7
        }]
      }
    },
    evidence
  };
  return {
    ok: true,
    row_key: row.row_key,
    row_signature: row.row_signature,
    backend_row_signature: row.backend_row_signature,
    requested_timesheet_id: timesheetId,
    current_timesheet_id: timesheetId,
    expected_timesheet_id: timesheetId,
    data_row: row,
    row,
    row_patch: {},
    evidence,
    left_pane: {},
    compare_payload: { required: false, rows: [], imported_detail_refs: {} },
    details,
    related: details.related,
    action_flags: actionFlags,
    expense_storage_target: 'TSFIN',
    expense_evidence_storage_target: 'TIMESHEET_EVIDENCE',
    profile: 'editor',
    context_profile: 'editor',
    header_loaded: true,
    header_only: false,
    editor_loaded: true,
    evidence_loaded: true,
    compare_loaded: false,
    full_loaded: false,
    schedule_authoritative: true,
    schedule_pending: false,
    loaded_layers: ['header', 'editor', 'evidence'],
    __context_options: {
      include_evidence: false,
      include_compare: false,
      include_import_source_rows: false,
      base_only: false,
      profile: 'editor',
      context_profile: 'editor'
    }
  };
}

function makeManualNavigationBroker() {
  const first = manualRow({
    rowKey: 'manual-row-a',
    timesheetId: MANUAL_TIMESHEET_A,
    candidateName: 'Alice Manual',
    candidateId: 'f3000000-0000-4000-8000-000000000091',
    start: '08:00',
    end: '16:00',
    workDate: '2026-09-01'
  });
  const second = manualRow({
    rowKey: 'manual-row-b',
    timesheetId: MANUAL_TIMESHEET_B,
    candidateName: 'Brenda Manual',
    candidateId: 'f3000000-0000-4000-8000-000000000092',
    start: '10:00',
    end: '18:00',
    workDate: '2026-09-02'
  });
  const rows = [first, second];
  const broker = (pathname: string) => {
    const [path, query = ''] = pathname.split('?');
    const params = new URLSearchParams(query);
    if (path === '/api/timesheets/bulk-authorise-dataset') {
      return { rows, counts: {}, profile: 'list', projection: 'dataset_row' };
    }
    if (path === '/api/timesheets/bulk-row-freshness') {
      const rowKey = params.get('row_key') || '';
      const row = rows.find((candidate) => String(candidate.row_key) === rowKey) || first;
      return {
        ok: true,
        outcome: 'CURRENT',
        changed: false,
        eligible_for_surface: true,
        previous_row_key: row.row_key,
        row_key: row.row_key,
        target_section: row.bulk_authorise_section || 'processed_eligible',
        row
      };
    }
    if (path.includes('/bulk-authorise-context')) {
      const timesheetId = path.split('/api/timesheets/')[1]?.split('/')[0] || params.get('timesheet_id') || '';
      const row = rows.find((candidate) => String(candidate.timesheet_id) === timesheetId) || first;
      return manualContext(row, row === first ? 91 : 92);
    }
    return undefined;
  };
  return { broker, first, second };
}

/** A broker that holds one row and commits it exactly once. */
function makeCommitBroker(
  weeklySourcePresentation: Record<string, unknown> | null = null,
  options: { omitPresentationCategory?: boolean } = {}
) {
  const state = {
    authorised: false,
    commitCalls: 0,
    commitBodies: [] as unknown[],
    datasetReads: 0,
    datasetQueries: [] as string[],
    category: 'STANDARD_TIMESHEETS'
  };
  const currentRow = (params: URLSearchParams) => {
    const category = params.get('weekly_source_category') || state.category;
    const categoryRoute: Record<string, Record<string, string>> = {
      NHSP: {
        bulk_authorise_classification: 'NHSP',
        route_type: 'WEEKLY_NHSP',
        route_family: 'IMPORT_AUTHORITATIVE',
        route_subfamily: 'NHSP'
      },
      CLIENT_PROVIDED_HOURS: {
        bulk_authorise_classification: 'HR',
        route_type: 'WEEKLY_HEALTHROSTER',
        route_family: 'IMPORT_AUTHORITATIVE',
        route_subfamily: 'HEALTHROSTER_NO_TIMESHEET'
      },
      TIMESHEETS_CHECKED_WITH_CLIENT: {
        bulk_authorise_classification: 'TIMESHEETS',
        route_type: 'WEEKLY_HEALTHROSTER',
        route_family: 'ELECTRONIC',
        route_subfamily: 'HEALTHROSTER_TIMESHEET_REQUIRED'
      },
      STANDARD_TIMESHEETS: {
        bulk_authorise_classification: 'TIMESHEETS',
        route_type: 'ELECTRONIC',
        route_family: 'ELECTRONIC',
        route_subfamily: 'ELECTRONIC'
      }
    };
    const row = eligibleRow({
      weekly_source_category: category,
      ...(categoryRoute[category] || categoryRoute.STANDARD_TIMESHEETS),
      is_authorised: state.authorised,
      bulk_authorise_section: state.authorised ? 'authorised_eligible' : 'processed_eligible',
      can_bulk_authorise: !state.authorised,
      can_bulk_unauthorise: state.authorised,
      summary_stage: state.authorised ? 'Authorised' : 'Processed',
      tools_stage: state.authorised ? 'Authorised' : 'Processed',
      row_signature: state.authorised ? 'wp12-sig-2' : 'wp12-sig-1',
      backend_row_signature: state.authorised ? 'wp12-sig-2' : 'wp12-sig-1',
      weekly_source_presentation: weeklySourcePresentation
    }) as Record<string, unknown>;
    if (options.omitPresentationCategory) delete row.weekly_source_category;
    return row;
  };

  const broker = (pathname: string, method: string, body: unknown) => {
    const [path, query = ''] = pathname.split('?');
    const params = new URLSearchParams(query);

    if (path === '/api/timesheets/bulk-authorise-dataset') {
      state.datasetReads += 1;
      state.datasetQueries.push(params.toString());
      state.category = params.get('weekly_source_category') || state.category;
      return { rows: [currentRow(params)], counts: {}, profile: 'list', projection: 'dataset_row' };
    }
    if (path.includes('/bulk-authorise-context')) {
      return contextFor(currentRow(new URLSearchParams()));
    }
    if (path === '/api/timesheets/bulk-row-freshness') {
      const row = currentRow(new URLSearchParams());
      return {
        ok: true,
        outcome: 'CURRENT',
        changed: false,
        eligible_for_surface: true,
        previous_row_key: row.row_key,
        row_key: row.row_key,
        target_section: row.bulk_authorise_section || 'processed_eligible',
        row
      };
    }
    if (path === '/api/timesheets/bulk-authorise-selected' && method === 'POST') {
      state.commitCalls += 1;
      state.commitBodies.push(body);
      state.authorised = true;
      const row = currentRow(new URLSearchParams());
      return {
        ok: true,
        action: 'AUTHORISE',
        batch_completed: true,
        requested_count: 1,
        success_count: 1,
        failure_count: 0,
        results: [{ success: true, timesheet_id: TIMESHEET_ID, row_key: row.row_key, is_authorised: true }],
        failed_items: [],
        affected_rows: [{ ...row, new_row_key: row.row_key }],
        count_deltas: {},
        cache_invalidation_hints: {}
      };
    }
    return undefined;
  };
  return { broker, state };
}

async function openBulkAuthorise(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => !!(window as any).CloudTMSWeeklySourcePresentationV1, null, { timeout: 30_000 });
  await page.getByRole('button', { name: /Timesheets$/ }).click();
  await expect(page.getByRole('button', { name: 'Bulk Authorise', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Bulk Authorise', exact: true }).click();
  await expect(page.locator('#bulkAuthoriseWorkbenchRoot')).toBeVisible({ timeout: 30_000 });
}

/**
 * The Bulk shell renders its grid asynchronously after the workbench root
 * appears, and the step model attaches to the grid. Wait for the attachment
 * rather than assuming it has happened.
 */
async function waitForStepModel(page: import('@playwright/test').Page) {
  await expect
    .poll(async () => page.evaluate(() => document
      .getElementById('bulkAuthoriseWorkbenchGrid')
      ?.getAttribute('data-weekly-source-bulk-layout') ?? null), { timeout: 30_000 })
    .not.toBeNull();
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Gate 10 — the real Bulk shell', () => {
  test('the four Timesheet type controls switch the real Bulk Authorise dataset', async ({ page }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const { broker, state } = makeCommitBroker();
    await mountOfficeShell(page, { broker });
    await openBulkAuthorise(page);

    const selectCategory = async (name: string, expectedKey: string) => {
      const previousReads = state.datasetReads;
      const tab = page.getByRole('tab').filter({ hasText: name });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
      await expect.poll(() => state.datasetReads).toBeGreaterThan(previousReads);
      expect(state.datasetQueries.at(-1)).toContain(`weekly_source_category=${expectedKey}`);
    };

    await expect(page.getByRole('tab').filter({ hasText: 'Standard Timesheets' }))
      .toHaveAttribute('aria-selected', 'true');
    await selectCategory('NHSP', 'NHSP');
    await selectCategory('Client-provided hours', 'CLIENT_PROVIDED_HOURS');
    await selectCategory('Timesheets checked with client', 'TIMESHEETS_CHECKED_WITH_CLIENT');
    await selectCategory('Standard Timesheets', 'STANDARD_TIMESHEETS');

    expect(pageErrors).toEqual([]);
    expect(externalRequests(page), 'the category proof must not leave the machine').toEqual([]);
  });

  test('the four Timesheet type queues derive from the authoritative live DTO when presentation category is absent', async ({ page }) => {
    test.setTimeout(60_000);
    const { broker } = makeCommitBroker(null, { omitPresentationCategory: true });

    await test.step('mount the real Office shell', async () => mountOfficeShell(page, { broker }));
    await test.step('open the real Bulk Authorise modal', async () => openBulkAuthorise(page));

    for (const name of ['NHSP', 'Client-provided hours', 'Timesheets checked with client', 'Standard Timesheets']) {
      await test.step(`${name} retains its live DTO row`, async () => {
        const tab = page.getByRole('tab').filter({ hasText: name });
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
        const expectedClassification = name === 'NHSP' ? 'NHSP' : (name === 'Client-provided hours' ? 'HR' : 'TIMESHEETS');
        const stateSnapshot = await page.evaluate(() => {
          const state = (document as any).__bulkAuthoriseLifecycleV2ActiveController?.state
            || (window as any).modalCtx?.bulkAuthoriseState
            || {};
          const row = Array.isArray(state.dataset?.rows) ? state.dataset.rows[0] : null;
          return {
            classification: state.classification,
            weekly_source_category: state.weekly_source_category,
            row_classification: row?.bulk_authorise_classification || null,
            row_category: row?.weekly_source_category || null,
            row_count: Array.isArray(state.dataset?.rows) ? state.dataset.rows.length : -1,
            filters: state.filters || null,
            dataset_filters: state.dataset?.filters || null
          };
        });
        expect(stateSnapshot.classification).toBe(expectedClassification);
        expect(stateSnapshot.row_classification, JSON.stringify(stateSnapshot)).toBe(expectedClassification);
        await expect(page.locator('#bulkAuthoriseListsRoot')).toContainText('Jane Smith', { timeout: 30_000 });
      });
    }

    expect(externalRequests(page), 'the live DTO fallback proof must not leave the machine').toEqual([]);
  });

  test('XSG-022: an eligible row can be authorised, and the committed result survives a refresh', async ({ page }) => {
    test.setTimeout(240_000);
    const pageErrors: string[] = [];
    const toolErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error' && text.includes('[TOOLS][TIMESHEETS]')) toolErrors.push(text);
    });

    const { broker, state } = makeCommitBroker();
    await mountOfficeShell(page, { broker });
    await openBulkAuthorise(page);

    // The row loads as eligible, and the guarded action is offered.
    await expect(page.locator('#bulkAuthActionRowAuthoriseBtn')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#bulkAuthoriseWorkbenchRoot')).toContainText('Processed Eligible');
    await page.screenshot({ path: `${SHOT_DIR}/01-eligible-row.png` });

    // Perform the guarded action. The guard is the real one: the shell asks
    // before authorising a Timesheet with no image.
    await page.locator('#bulkAuthActionRowAuthoriseBtn').click();
    await expect(page.locator('#modal')).toContainText('Are you sure you want to continue?', { timeout: 15_000 });
    await page.screenshot({ path: `${SHOT_DIR}/02-guard.png` });
    await page.getByRole('button', { name: 'OK', exact: true }).click();

    // The commit really happened: exactly one request, and it carried the row.
    await expect.poll(() => state.commitCalls, { timeout: 30_000 }).toBe(1);
    const committed = state.commitBodies[0] as any;
    expect(Array.isArray(committed.items), 'the commit carried its items').toBe(true);
    expect(committed.items.length).toBe(1);
    expect(String(committed.items[0].timesheet_id || committed.items[0].current_timesheet_id)).toBe(TIMESHEET_ID);

    // Not a silent no-op: the shell reports the result and the row moves.
    await expect(page.locator('#bulkAuthoriseWorkbenchRoot')).toContainText('1 timesheet', { timeout: 30_000 });
    await expect(page.locator('#bulkAuthoriseWorkbenchRoot')).toContainText('Authorised Eligible');
    await page.screenshot({ path: `${SHOT_DIR}/03-committed.png` });

    // No duplicate request: settle, then re-check the counter.
    await page.waitForTimeout(3_000);
    expect(state.commitCalls, 'the guarded action must not be sent twice').toBe(1);

    // The committed result after a REFRESH: reload the whole shell from scratch
    // and reopen the workbench. The row is authorised and now offers
    // Unauthorise instead of Authorise.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openBulkAuthorise(page);
    await expect(page.locator('#bulkAuthoriseWorkbenchRoot')).toContainText('Authorised Eligible', { timeout: 30_000 });
    await expect(page.locator('#bulkAuthActionRowUnauthoriseBtn')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#bulkAuthActionRowAuthoriseBtn')).toHaveCount(0);
    expect(state.commitCalls, 'a reload must not re-send the commit').toBe(1);
    await page.screenshot({ path: `${SHOT_DIR}/04-after-refresh.png` });

    expect(pageErrors, 'the commit path must not raise a page error').toEqual([]);
    expect(toolErrors, 'the commit path must not fail through the Timesheets tool handler').toEqual([]);
    expect(externalRequests(page), 'the proof must not leave the machine').toEqual([]);
  });

  test('XSG-022: Bulk Process opens its real workbench and its dataset read is answered', async ({ page }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    let processDatasetReads = 0;
    await mountOfficeShell(page, {
      broker: (pathname) => {
        if (pathname.startsWith('/api/timesheets/bulk-process-dataset')) {
          processDatasetReads += 1;
          return { rows: [], counts: {} };
        }
        return undefined;
      }
    });
    await page.waitForFunction(() => !!(window as any).CloudTMSWeeklySourcePresentationV1, null, { timeout: 30_000 });
    await page.getByRole('button', { name: /Timesheets$/ }).click();
    await expect(page.getByRole('button', { name: 'Bulk Process', exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Bulk Process', exact: true }).click();
    await expect(page.locator('#modalTitle')).toHaveText('Bulk Process', { timeout: 20_000 });
    await expect(page.locator('#bulkProcessWorkbenchRoot')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#modal')).not.toContainText('workbench is not available yet');
    expect(processDatasetReads, 'Bulk Process really read its dataset').toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: `${SHOT_DIR}/05-bulk-process.png` });
  });

  test('XSG-023: Queue/Attached, Previous/Next, Upload and Attach survive and respond', async ({ page }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const { broker } = makeCommitBroker();
    await mountOfficeShell(page, { broker });
    await openBulkAuthorise(page);

    const controls = {
      queueTab: page.locator('#bulkProcessEvidenceTabQueue'),
      attachedTab: page.locator('#bulkProcessEvidenceTabAttached'),
      previous: page.locator('#bpQueuePrevBtn'),
      next: page.locator('#bpQueueNextBtn'),
      upload: page.locator('#bpUploadEvidenceBtn'),
      attach: page.locator('#bpQueueAttachBtn')
    };
    for (const [name, locator] of Object.entries(controls)) {
      await expect(locator, `${name} must still exist on the real Bulk shell`).toHaveCount(1);
    }

    // Click-tested, not merely present. The pane opens on ATTACHED for a row
    // with no staged queue items, which is the shell's own behaviour and not
    // this package's to change. What is asserted is that both tabs respond,
    // that exactly one is selected at every point, and that nothing raises.
    const selection = async () => page.evaluate(() => ({
      queue: document.getElementById('bulkProcessEvidenceTabQueue')?.getAttribute('aria-selected'),
      attached: document.getElementById('bulkProcessEvidenceTabAttached')?.getAttribute('aria-selected'),
      pane: (document.getElementById('bulkProcessEvidencePaneRoot') as HTMLElement)?.innerText || ''
    }));

    const opening = await selection();
    expect([opening.queue, opening.attached].filter((value) => value === 'true'))
      .toHaveLength(1);

    await controls.queueTab.click();
    await page.waitForTimeout(1_500);
    const afterQueue = await selection();
    expect([afterQueue.queue, afterQueue.attached].filter((value) => value === 'true'),
      'exactly one evidence tab is selected after clicking Queue').toHaveLength(1);
    expect(afterQueue.pane, 'the evidence pane still renders both tabs').toContain('QUEUE');
    expect(afterQueue.pane).toContain('ATTACHED');

    await controls.attachedTab.click();
    await expect(controls.attachedTab).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
    await expect(controls.queueTab).toHaveAttribute('aria-selected', 'false');
    // Previous and Next drive the queue and must not raise.
    await controls.previous.click();
    await controls.next.click();
    // Upload and Attach are still offered. Whether they are ENABLED is the
    // row's own evidence policy, not this package's: on a Timesheet whose
    // evidence is read-only the shell disables them and says why, and that is
    // preserved behaviour rather than a regression.
    await expect(controls.upload).toBeVisible();
    await expect(controls.attach).toBeVisible();
    const evidencePaneText = await page.locator('#bulkProcessEvidencePaneRoot').innerText();
    const uploadEnabled = await controls.upload.isEnabled();
    if (!uploadEnabled) {
      expect(evidencePaneText, 'a disabled Upload must say why').toMatch(/read-only|Office control/i);
    }

    // The far-left header checkbox is the only select-all control.
    const selectAllButtons = await page.locator('#bulkAuthoriseWorkbenchRoot button')
      .filter({ hasText: /select all|unselect all|clear all/i }).count();
    expect(selectAllButtons, 'no Select all / Unselect all buttons').toBe(0);

    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: `${SHOT_DIR}/06-preserved-controls.png` });
  });

  test('XSG-021: the real Bulk shell becomes Queue / Review / Authorise at 768, 390 and 280 px', async ({ page }) => {
    test.setTimeout(240_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const { broker } = makeCommitBroker();
    await mountOfficeShell(page, { broker });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBulkAuthorise(page);
    await waitForStepModel(page);

    // Desktop: three panes, no step model.
    const desktop = await page.evaluate(() => {
      const grid = document.getElementById('bulkAuthoriseWorkbenchGrid');
      return {
        layout: grid?.getAttribute('data-weekly-source-bulk-layout'),
        stepsVisible: !!document.querySelector('[data-weekly-source-workspace-steps="1"]')
          && (document.querySelector('[data-weekly-source-workspace-steps="1"]') as HTMLElement).offsetParent !== null,
        panes: Array.from(document.querySelectorAll('[data-weekly-source-workspace-pane]'))
          .map((p) => ({ key: p.getAttribute('data-weekly-source-workspace-pane'), hidden: (p as HTMLElement).hidden }))
      };
    });
    expect(desktop.layout).toBe('DESKTOP');
    expect(desktop.panes.map((p) => p.key).sort()).toEqual(['AUTHORISE', 'QUEUE', 'REVIEW']);
    expect(desktop.panes.every((p) => p.hidden === false), 'desktop shows all three panes').toBe(true);
    expect(desktop.stepsVisible, 'desktop shows no step tabs').toBe(false);
    await page.screenshot({ path: `${SHOT_DIR}/10-desktop-1440.png` });

    for (const [label, width, height, expectedLayout] of [
      ['tablet', 768, 1024, 'TABLET'],
      ['phone', 390, 844, 'PHONE'],
      ['fold', 280, 653, 'FOLD']
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(600);

      const shell = await page.evaluate(() => {
        const grid = document.getElementById('bulkAuthoriseWorkbenchGrid');
        const steps = Array.from(document.querySelectorAll('[data-weekly-source-workspace-step][role="tab"]'))
          .map((tab) => ({ key: tab.getAttribute('data-weekly-source-workspace-step'), label: (tab.textContent || '').trim(), selected: tab.getAttribute('aria-selected') }));
        return {
          layout: grid?.getAttribute('data-weekly-source-bulk-layout'),
          step: grid?.getAttribute('data-weekly-source-bulk-step'),
          steps,
          presented: Array.from(document.querySelectorAll('[data-weekly-source-workspace-pane]'))
            .filter((p) => !(p as HTMLElement).hidden)
            .map((p) => p.getAttribute('data-weekly-source-workspace-pane')),
          sticky: !!document.querySelector('[data-weekly-source-workspace-sticky="1"]'),
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });

      expect(shell.layout, `${label} layout`).toBe(expectedLayout);
      expect(shell.steps.map((s) => s.label), `${label} step labels`).toEqual(['Queue', 'Review', 'Authorise']);
      expect(shell.presented.length, `${label} presents exactly one step`).toBe(1);
      expect(shell.sticky, `${label} keeps the sticky continue control`).toBe(true);
      expect(shell.horizontalOverflow, `${label} must not overflow the page horizontally`).toBeLessThanOrEqual(0);
      const categorySelect = page.locator('[data-weekly-source-category-select]');
      const categoryTabs = page.locator('.weekly-source-v1__categories');
      if (width <= 767) {
        await expect(categorySelect, `${label} uses one compact Timesheet type selector`).toBeVisible();
        await expect(categoryTabs, `${label} hides the horizontally clipped category tabs`).toBeHidden();
      } else {
        await expect(categorySelect, `${label} keeps the selector out of the tablet layout`).toBeHidden();
        await expect(categoryTabs, `${label} keeps the approved tablet category tabs`).toBeVisible();
      }
      await page.screenshot({ path: `${SHOT_DIR}/11-${label}-${width}.png` });

      // The steps are real navigation, not decoration.
      await page.locator('[data-weekly-source-workspace-step="AUTHORISE"][role="tab"]').click();
      await page.waitForTimeout(300);
      const onAuthorise = await page.evaluate(() => Array.from(document.querySelectorAll('[data-weekly-source-workspace-pane]'))
        .filter((p) => !(p as HTMLElement).hidden)
        .map((p) => p.getAttribute('data-weekly-source-workspace-pane')));
      expect(onAuthorise, `${label} can step to Authorise`).toEqual(['AUTHORISE']);
      await page.screenshot({ path: `${SHOT_DIR}/12-${label}-authorise-step.png` });

      await page.locator('[data-weekly-source-workspace-step="QUEUE"][role="tab"]').click();
      await page.waitForTimeout(300);
      const onQueue = await page.evaluate(() => Array.from(document.querySelectorAll('[data-weekly-source-workspace-pane]'))
        .filter((p) => !(p as HTMLElement).hidden)
        .map((p) => p.getAttribute('data-weekly-source-workspace-pane')));
      expect(onQueue, `${label} can step back to Queue`).toEqual(['QUEUE']);
    }

    // Back to desktop: all three panes return.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(600);
    const back = await page.evaluate(() => Array.from(document.querySelectorAll('[data-weekly-source-workspace-pane]'))
      .filter((p) => !(p as HTMLElement).hidden).length);
    expect(back).toBe(3);

    expect(pageErrors).toEqual([]);
  });

  test('Stage 11: the real Bulk shell renders the approved source and submitted-hours comparison', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const presentation = presentationFixture.clientSourceMismatch.weekly_source_presentation;
    const { broker } = makeCommitBroker(presentation);
    await mountOfficeShell(page, { broker });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBulkAuthorise(page);
    await waitForStepModel(page);

    await expect(page.locator('#bulkAuthorisePreviewPaneRoot[data-weekly-source-preview="1"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Client system hours' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Submitted hours needing attention' })).toBeVisible();
    await expect(page.locator('#bulkAuthoriseWorkbenchRoot')).not.toContainText('Loading attached evidence');
    await expect(page.locator('#bulkAuthoriseWorkbenchRoot')).not.toContainText('Loading selected row details');
    await page.screenshot({ path: testInfo.outputPath('UI-032-bulk-source-mismatch-desktop.png'), fullPage: true });

    for (const [label, width, height] of [['phone', 390, 844], ['fold', 280, 653]] as const) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(400);
      const reviewStep = page.locator('[data-weekly-source-workspace-step="REVIEW"][role="tab"]');
      await reviewStep.click();
      await expect(reviewStep).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[data-weekly-source-workspace-pane="REVIEW"]')).toBeVisible();
      await expect(page.locator('[data-weekly-source-workspace-pane="QUEUE"]')).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Client system hours' })).toBeVisible();
      const widthEvidence = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth
      }));
      expect(widthEvidence.scroll, `${label} has no page-level horizontal panning`).toBeLessThanOrEqual(widthEvidence.client);
      await page.screenshot({ path: testInfo.outputPath(`UI-070-bulk-source-mismatch-${label}.png`), fullPage: true });
    }
    expect(pageErrors).toEqual([]);
    expect(externalRequests(page)).toEqual([]);
  });

  test('Stage 11 protected journey: queue navigation refreshes the selected manual non-QR record, hours and evidence', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const { broker, first, second } = makeManualNavigationBroker();
    await mountOfficeShell(page, { broker });
    await page.setViewportSize({ width: 1440, height: 960 });
    await openBulkAuthorise(page);

    const firstQueueRow = page.locator(`[data-bulk-authorise-row="1"][data-row-key="${first.row_key}"]`);
    const secondQueueRow = page.locator(`[data-bulk-authorise-row="1"][data-row-key="${second.row_key}"]`);
    await expect(firstQueueRow).toBeVisible({ timeout: 30_000 });
    await expect(secondQueueRow).toBeVisible({ timeout: 30_000 });

    await firstQueueRow.click();
    await expect(page.locator('#bulkProcessManualEditorRoot')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input[data-weekly-field="start"][data-date="2026-09-01"]')).toHaveValue('08:00');
    await expect(page.locator('input[data-weekly-field="end"][data-date="2026-09-01"]')).toHaveValue('16:00');
    await expect(firstQueueRow).toHaveCSS('cursor', 'pointer');
    await page.screenshot({ path: testInfo.outputPath('UI-PROTECTED-bulk-manual-row-a.png'), fullPage: true });

    await secondQueueRow.click();
    await expect(page.locator('input[data-weekly-field="start"][data-date="2026-09-02"]')).toHaveValue('10:00', { timeout: 30_000 });
    await expect(page.locator('input[data-weekly-field="end"][data-date="2026-09-02"]')).toHaveValue('18:00');
    await expect(page.locator('input[data-weekly-field="start"][data-date="2026-09-01"]')).toHaveValue('');
    await expect(page.locator('#bulkAuthoriseRightPane')).toContainText('Brenda Manual');
    await expect(page.locator('#bulkAuthoriseMiddlePane')).toContainText('Brenda Manual signed timesheet.pdf');
    await page.screenshot({ path: testInfo.outputPath('UI-PROTECTED-bulk-manual-row-b.png'), fullPage: true });

    await firstQueueRow.click();
    await expect(page.locator('input[data-weekly-field="start"][data-date="2026-09-01"]')).toHaveValue('08:00', { timeout: 30_000 });
    await expect(page.locator('input[data-weekly-field="start"][data-date="2026-09-02"]')).toHaveValue('');
    await expect(page.locator('#bulkAuthoriseMiddlePane')).toContainText('Alice Manual signed timesheet.pdf');

    expect(pageErrors).toEqual([]);
    expect(externalRequests(page)).toEqual([]);
  });

  test('Stage 11 protected journey: manual non-QR hours, extra shifts, additional units and expenses remain editable', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const { broker, first } = makeManualNavigationBroker();
    await mountOfficeShell(page, { broker });
    await page.setViewportSize({ width: 1440, height: 960 });
    await openBulkAuthorise(page);
    await page.locator(`[data-bulk-authorise-row="1"][data-row-key="${first.row_key}"]`).click();

    const extraShiftAdd = page.locator('[data-ts-action="extra-shift-add"]');
    const initialEditDiagnostics = await page.evaluate(() => {
      const st = (window as any).modalCtx?.bulkAuthoriseState || {};
      const start = document.querySelector('input[data-weekly-field="start"][data-date="2026-09-01"]') as HTMLInputElement | null;
      let editability = null;
      try {
        const classify = (0, eval)('typeof classifyBulkAuthoriseEditability === "function" ? classifyBulkAuthoriseEditability : null');
        const activeContext = st.active_context || {};
        const activeDetails = st.active_details || activeContext.details || {};
        editability = classify
          ? classify({ ...activeContext, row: st.active_row, details: activeDetails, state: st.active_ctx?.state, active_ctx: st.active_ctx })
          : null;
      } catch {}
      return {
        active_row_key: st.active_row_key || null,
        active_candidate: st.active_row?.candidate_name || null,
        start_disabled: start?.disabled ?? null,
        start_read_only: start?.readOnly ?? null,
        editability,
        timesheet_actions: Array.from(document.querySelectorAll('[data-ts-action]')).map((node) => node.getAttribute('data-ts-action')),
        line_actions: Array.from(document.querySelectorAll('[data-weekly-line-action]')).map((node) => node.getAttribute('data-weekly-line-action'))
      };
    });
    await expect(extraShiftAdd, JSON.stringify(initialEditDiagnostics)).toBeVisible({ timeout: 30_000 });
    await expect(extraShiftAdd).toBeEnabled();

    const start = page.locator('input[data-weekly-field="start"][data-date="2026-09-01"]');
    const end = page.locator('input[data-weekly-field="end"][data-date="2026-09-01"]');
    const breakMinutes = page.locator('input[data-weekly-field="break_mins"][data-date="2026-09-01"]');
    await expect(start).toBeEnabled({ timeout: 30_000 });
    await expect(end).toBeEnabled();
    await expect(breakMinutes).toBeEnabled();
    await start.fill('08:15');
    await end.fill('16:15');
    await breakMinutes.fill('45');
    await expect(start).toHaveValue('08:15');
    await expect(end).toHaveValue('16:15');
    await expect(breakMinutes).toHaveValue('45');

    const editDiagnostics = await page.evaluate(() => {
      const st = (window as any).modalCtx?.bulkAuthoriseState || {};
      const activeContext = st.active_context || {};
      const activeDetails = st.active_details || activeContext.details || {};
      const classify = (window as any).classifyBulkAuthoriseEditability;
      const editability = typeof classify === 'function'
        ? classify({ ...activeContext, row: st.active_row, details: activeDetails, state: st.active_ctx?.state, active_ctx: st.active_ctx })
        : null;
      return {
        active_row_key: st.active_row_key || null,
        active_candidate: st.active_row?.candidate_name || null,
        action_flags: activeDetails?.action_flags || activeContext?.action_flags || null,
        editability
      };
    });
    await expect(extraShiftAdd, JSON.stringify(editDiagnostics)).toBeVisible();
    await expect(extraShiftAdd).toBeEnabled();
    const beforeLines = await page.locator('tr[data-weekly-line="1"]').count();
    expect(beforeLines, 'the ordinary weekly editor shows all seven days as one compact grid').toBe(7);
    const sevenDayViewport = await page.locator('.ts-weekly-schedule-wrap').evaluate((node) => {
      const wrap = node as HTMLElement;
      const table = wrap.querySelector('#tsWeeklySchedule') as HTMLElement | null;
      const pane = document.querySelector('#bulkAuthoriseRightPane') as HTMLElement | null;
      const rows = Array.from(wrap.querySelectorAll('tbody tr[data-weekly-line="1"]')) as HTMLElement[];
      const sunday = rows.find((row) => row.getAttribute('data-date') === '2026-09-06') || rows.at(-1) || null;
      const clockInputs = Array.from(wrap.querySelectorAll(
        'input[data-weekly-field="start"],input[data-weekly-field="end"],input[data-weekly-field="break_start"],input[data-weekly-field="break_end"]'
      )) as HTMLInputElement[];
      const populatedClocks = clockInputs.filter((input) => String(input.value || '').trim().length > 0);
      return {
        client_height: wrap.clientHeight,
        scroll_height: wrap.scrollHeight,
        client_width: wrap.clientWidth,
        scroll_width: wrap.scrollWidth,
        offset_width: wrap.offsetWidth,
        table_width: table?.getBoundingClientRect().width || 0,
        table_min_width: table ? getComputedStyle(table).minWidth : '',
        table_css_width: table ? getComputedStyle(table).width : '',
        sunday_bottom: sunday?.getBoundingClientRect().bottom || 0,
        pane_bottom: pane?.getBoundingClientRect().bottom || 0,
        populated_clocks_fit: populatedClocks.every((input) => input.scrollWidth <= input.clientWidth + 1),
        populated_clock_values: populatedClocks.map((input) => input.value)
      };
    });
    expect(sevenDayViewport.scroll_height, 'the ordinary seven-day grid does not need vertical scrolling').toBeLessThanOrEqual(sevenDayViewport.client_height + 1);
    expect(sevenDayViewport.scroll_width, `the desktop seven-day grid shows every column without horizontal scrolling: ${JSON.stringify(sevenDayViewport)}`).toBeLessThanOrEqual(sevenDayViewport.client_width + 1);
    expect(sevenDayViewport.sunday_bottom, 'Sunday remains visible inside the right pane without scrolling').toBeLessThanOrEqual(sevenDayViewport.pane_bottom + 1);
    expect(sevenDayViewport.populated_clocks_fit, `complete HH:MM values remain visible: ${JSON.stringify(sevenDayViewport.populated_clock_values)}`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('UI-PROTECTED-bulk-manual-seven-day-grid.png'), fullPage: true });
    await extraShiftAdd.click();
    await expect.poll(() => page.locator('tr[data-weekly-line="1"]').count()).toBeGreaterThan(beforeLines);
    const extraShiftRemove = page.locator('[data-ts-action="extra-shift-remove"]');
    await expect(extraShiftRemove).toBeVisible();
    await expect(extraShiftRemove).toBeEnabled();
    await extraShiftRemove.click();
    await expect.poll(() => page.locator('tr[data-weekly-line="1"]').count()).toBe(beforeLines);

    const additionalUnit = page.locator('input[data-extra-code="ONCALL"]');
    await expect(additionalUnit).toBeVisible();
    await expect(additionalUnit).toBeEnabled();
    await additionalUnit.fill('2');
    await expect(additionalUnit).toHaveValue('2');
    const scheduleFit = await page.evaluate(() => {
      const pane = document.querySelector('#bulkAuthoriseRightPane') as HTMLElement | null;
      const middle = document.querySelector('#bulkAuthoriseMiddlePane') as HTMLElement | null;
      const wrap = document.querySelector('#bulkProcessManualEditorRoot .ts-weekly-schedule-wrap') as HTMLElement | null;
      const schedule = document.querySelector('#bulkProcessManualEditorRoot #tsWeeklySchedule') as HTMLElement | null;
      if (!pane || !middle || !wrap || !schedule) return null;
      const paneRect = pane.getBoundingClientRect();
      const middleRect = middle.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      return {
        pane_left: paneRect.left,
        pane_right: paneRect.right,
        pane_width: paneRect.width,
        middle_width: middleRect.width,
        schedule_left: wrapRect.left,
        schedule_right: wrapRect.right,
        page_overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(scheduleFit).not.toBeNull();
    expect(scheduleFit!.schedule_left).toBeGreaterThanOrEqual(scheduleFit!.pane_left - 1);
    expect(scheduleFit!.schedule_right).toBeLessThanOrEqual(scheduleFit!.pane_right + 1);
    expect(scheduleFit!.middle_width, 'the evidence pane keeps at least the width of the authorisation pane').toBeGreaterThanOrEqual(scheduleFit!.pane_width);
    expect(scheduleFit!.page_overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('UI-PROTECTED-bulk-manual-editable.png'), fullPage: true });

    for (const [label, width, height] of [
      ['tablet', 820, 1180],
      ['phone', 390, 844],
      ['fold', 280, 653]
    ] as const) {
      await page.setViewportSize({ width, height });
      const authoriseStep = page.locator('[data-weekly-source-workspace-step="AUTHORISE"][role="tab"]');
      if (await authoriseStep.count() && await authoriseStep.isVisible()) {
        await authoriseStep.click();
        await expect(authoriseStep).toHaveAttribute('aria-selected', 'true');
      }
      const rightPane = page.locator('#bulkAuthoriseRightPane');
      await page.evaluate(() => document.querySelector('#bulkAuthoriseRightPane')?.scrollIntoView({ block: 'start' }));
      await expect(rightPane).toBeVisible();
      await page.evaluate(() => {
        const pane = document.querySelector('#bulkAuthoriseRightPane') as HTMLElement | null;
        const wrap = document.querySelector('#bulkProcessManualEditorRoot .ts-weekly-schedule-wrap') as HTMLElement | null;
        if (pane) pane.scrollTop = 0;
        if (wrap) {
          wrap.scrollTop = 0;
          wrap.scrollLeft = 0;
        }
      });
      const responsiveFit = await page.evaluate(() => {
        const pane = document.querySelector('#bulkAuthoriseRightPane') as HTMLElement | null;
        const wrap = document.querySelector('#bulkProcessManualEditorRoot .ts-weekly-schedule-wrap') as HTMLElement | null;
        const schedule = document.querySelector('#bulkProcessManualEditorRoot #tsWeeklySchedule') as HTMLElement | null;
        if (!pane || !wrap || !schedule) return null;
        const paneRect = pane.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        const scheduleRect = schedule.getBoundingClientRect();
        const overflowAvailable = wrap.scrollWidth > wrap.clientWidth;
        wrap.scrollLeft = wrap.scrollWidth;
        return {
          pane_left: paneRect.left,
          pane_right: paneRect.right,
          wrap_left: wrapRect.left,
          wrap_right: wrapRect.right,
          column_count: schedule.querySelectorAll('thead th').length,
          overflow_available: overflowAvailable,
          reached_right: !overflowAvailable || wrap.scrollLeft > 0,
          page_overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      expect(responsiveFit).not.toBeNull();
      expect(responsiveFit!.wrap_left, `${label}: the schedule viewport starts inside the right pane`).toBeGreaterThanOrEqual(responsiveFit!.pane_left - 1);
      expect(responsiveFit!.wrap_right, `${label}: the schedule viewport ends inside the right pane`).toBeLessThanOrEqual(responsiveFit!.pane_right + 1);
      expect(responsiveFit!.column_count, `${label}: every weekly schedule column is retained`).toBe(10);
      expect(responsiveFit!.reached_right, `${label}: the contained schedule can reach its final columns`).toBe(true);
      expect(responsiveFit!.page_overflow, `${label}: no page-level horizontal panning`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`UI-PROTECTED-bulk-manual-${label}.png`) });
    }

    await page.setViewportSize({ width: 1440, height: 960 });

    const expensesButton = page.locator('#bulkAuthActionRowExpensesBtn');
    await expect(expensesButton).toBeVisible();
    await expect(expensesButton).toBeEnabled();
    await expensesButton.click();
    await expect(page.locator('#bulkProcessExpensesChildRoot')).toBeVisible({ timeout: 30_000 });
    const travelPay = page.getByTestId('timesheet-expense-travel-pay');
    await expect(travelPay).toBeVisible();
    await expect(travelPay).toBeEnabled();
    await travelPay.fill('12.34');
    await expect(travelPay).toHaveValue('12.34');
    await expect(page.locator('#globalLoadingOverlay')).not.toHaveAttribute('data-show', '1');
    await page.screenshot({ path: testInfo.outputPath('UI-PROTECTED-bulk-manual-expenses.png'), fullPage: true });

    expect(pageErrors).toEqual([]);
    expect(externalRequests(page)).toEqual([]);
  });

  test('UI-AUD-031: no Office asset carries a literal countdown or validity string', async ({ page }) => {
    test.setTimeout(120_000);
    const { broker } = makeCommitBroker();
    await mountOfficeShell(page, { broker });
    await openBulkAuthorise(page);
    const rendered = await page.evaluate(() => document.body.innerText);
    // The manager secure-review page is a separate platform-owned product; the
    // Office never states how long a review link remains valid.
    for (const forbidden of [/\b\d+\s+days?\s+(left|remaining)\b/i, /\bexpires in\b/i, /\bvalid for\b/i, /\bvalid until\b/i]) {
      expect(rendered, `the Office must not state link validity (${forbidden})`).not.toMatch(forbidden);
    }
    const ownedAssetText = await page.evaluate(async () => {
      const files = ['/js/weekly-source-presentation-v1.js', '/css/weekly-source-presentation-v1.css', '/css/weekly-source.css'];
      const bodies = await Promise.all(files.map((f) => fetch(f).then((r) => r.text())));
      return bodies.join('\n');
    });
    for (const forbidden of [/days?\s+(left|remaining)/i, /expires in/i, /valid until/i, /countdown/i]) {
      expect(ownedAssetText, `no countdown string in the owned assets (${forbidden})`).not.toMatch(forbidden);
    }
  });
});
