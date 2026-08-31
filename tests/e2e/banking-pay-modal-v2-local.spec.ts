import { test, expect } from '@playwright/test';
import path from 'node:path';

const root = path.resolve(process.cwd());
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const hundredCandidatePage = () => ({
  ok: true,
  contract: 'BANKING_PAY_MODAL_STRUCTURE_V2',
  contract_version: 1,
  session_id: id(9000),
  session_version: 2,
  progress_counter_version: 3,
  scope_hash: 'a'.repeat(64),
  view_digest: 'b'.repeat(64),
  sort_key: 'CANDIDATE',
  sort_direction: 'ASC',
  rows: Array.from({ length: 100 }, (_, index) => ({
    candidate_id: id(index + 1),
    candidate_name: `Candidate ${String(index + 1).padStart(3, '0')}`,
    candidate_reference: `TEST-${String(index + 1).padStart(3, '0')}`,
    candidate_sort_name: `candidate ${String(index + 1).padStart(3, '0')}`,
    candidate_sort_reference: `test-${String(index + 1).padStart(3, '0')}`,
    child_revision: `2:3:${index + 1}`,
    facts_digest: 'c'.repeat(64),
    selectable_ready_count: 1,
    selected_ready_count: 0,
    selection_state: 'NONE',
    selected_display_amount: '0.00',
    selected_deduction_exists: false,
    selected_timesheet_count: 0,
    selected_timesheet_ids: [],
    selected_timesheet_scope_token: null
  })),
  total_count: 101,
  has_more: true,
  next_cursor: 'candidate_101',
  page_number: 1,
  has_previous: false,
  previous_cursor: null,
  page_anchor: 'candidate_page_1',
  next_page_anchor: 'candidate_page_2',
  previous_page_anchor: null,
  global: {
    candidate_count: 101,
    selected_candidate_count: 0,
    selected_ready_count: 0,
    selectable_ready_count: 101,
    selected_ready_display_amount: '0.00',
    selection_state: 'NONE',
    action_required_count: 0,
    blocked_count: 0,
    updating_count: 0,
    draft: {
      can_create_draft: false,
      blocker_codes: ['NO_SELECTED_ROWS'],
      session_ready: true,
      read_only: false,
      work_queued: false,
      display_ready: true,
      draft_safe: true,
      draft_block_reason_code: null,
      session_selected_row_count: 0,
      session_selected_eligible_ready_row_count: 0
    }
  }
});
const scripts = [
  'banking-pay-modal-v2-copy.js',
  'banking-pay-modal-v2-details-legacy.js',
  'banking-pay-modal-v2-table.js',
  'banking-pay-modal-v2-draft-review.js',
  'banking-pay-modal-v2-issues.js',
  'banking-pay-modal-v2-issue-detail.js',
  'banking-pay-modal-v2-mutation.js',
  'banking-pay-modal-v2-settlement.js',
  'banking-pay-modal-v2-candidate.js',
  'banking-pay-modal-v2.js',
  'banking-pay-modal-v2-integration.js'
];

test('contained v2 shell renders one-line candidate rows and opens the complete Ready-only Candidate Banking surface', async ({ page }) => {
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  await page.addStyleTag({ path: path.join(root, 'css', 'banking-pay-modal-v2.css') });
  await page.addStyleTag({ path: path.join(root, 'css', 'modal-modernisation.css') });
  await page.addScriptTag({ path: path.join(root, 'tests', 'fixtures', 'banking-pay-v2-detail-page.cjs') });
  for (const file of scripts) await page.addScriptTag({ path: path.join(root, 'js', file) });

  await page.evaluate(async () => {
    const fixture = (window as any).BankingDetailFixture;
    const integration = (window as any).CloudTMSBankingPayModalV2Integration;
    const snapshot = fixture.snapshot();
    for (const row of snapshot.context.readyPreviewLines) {
      row.client_name = 'Berkshire Healthcare NHS Foundation Trust';
    }
    Object.assign(snapshot.page, {
      page_number: 1,
      has_previous: false,
      previous_cursor: null,
      page_anchor: 'fixture_ready_anchor'
    });
    for (const row of snapshot.page.rows.filter((item: any) => item.presentation_group_kind === 'TIMESHEET')) {
      Object.assign(row, { presentation_role: 'PARENT', selection_allowed: false,
        is_ready_for_draft: false, draftable: false, status: 'SUPPORTING_CONTEXT' });
    }
    const state = { pay: { draftWizard: { workbench_v2: { available: true, checked: true } } } };
    const openedTimesheets: unknown[] = [];
    const legacyActions: unknown[] = [];
    const requests: string[] = [];
    let detailFailuresRemaining = 0;
    const authFetch = async (url: string) => {
      requests.push(String(url));
      const requestUrl = String(url);
      if (requestUrl.includes('/candidate/') && (requestUrl.includes('/ready?') || requestUrl.includes('/ready-group?'))) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (requestUrl.includes('/ready-group?') && detailFailuresRemaining > 0) {
        detailFailuresRemaining -= 1;
        return new Response(JSON.stringify({ ok: false, code: 'BANKING_PAY_V2_INVALID_RESPONSE' }), {
          status: 502,
          headers: { 'content-type': 'application/json' }
        });
      }
      const readyGroup = (() => {
        if (!requestUrl.includes('/ready-group?')) return null;
        const url = new URL(requestUrl, 'https://fixture.invalid');
        const groupKind = String(url.searchParams.get('group_kind') || '');
        const groupKey = String(url.searchParams.get('group_key') || '');
        const rows = fixture.readyRows().filter((row: any) => row.presentation_group_kind === groupKind
          && row.presentation_group_key === groupKey);
        if (rows.length >= 3) Object.assign(rows[0], {
          presentation_role: 'PARENT', selection_allowed: false,
          is_ready_for_draft: false, draftable: false, status: 'SUPPORTING_CONTEXT'
        });
        return { ok: true, contract: snapshot.page.contract, contract_version: 1,
          session_id: snapshot.page.session_id, session_version: snapshot.page.session_version,
          progress_counter_version: snapshot.page.progress_counter_version, scope_hash: snapshot.page.scope_hash,
          candidate_id: snapshot.page.candidate_id, group_kind: groupKind, group_key: groupKey,
          rows, total_count: rows.length, page_offset: 0, has_more: false, next_cursor: null };
      })();
      const payload = requestUrl.includes('/progress')
        ? { progress: {
            session_id: snapshot.summary.session_id,
            session_version: snapshot.summary.session_version,
            progress_counter_version: snapshot.summary.progress_counter_version
          } }
        : readyGroup
        ? readyGroup
        : requestUrl.includes('/candidate/') && requestUrl.includes('/ready?')
        ? snapshot.page
        : requestUrl.includes('/candidates?')
          ? snapshot.summary
          : { ok: false, code: 'BANKING_PAY_V2_INVALID_INPUT' };
      return new Response(JSON.stringify(payload), {
        status: payload.ok === false ? 400 : 200,
        headers: { 'content-type': 'application/json' }
      });
    };
    const html = integration.renderShell({
      enabled: true,
      session_id: snapshot.summary.session_id,
      session_version: snapshot.summary.session_version,
      progress_counter_version: snapshot.summary.progress_counter_version,
      pay_channel_scope: 'ALL',
      prelude_html: '<div class="warn">Existing Banking Pay warnings remain here.</div>',
      filter_summary: 'All payment routes',
      progress_html: '',
      has_active_filters: true,
      clear_filters_title: 'Clear Banking Pay filters',
      create_button: { disabled: false, label: 'Create drafts', title: 'Create Draft payments',
        ready_label: 'Create drafts', ready_title: 'Create Draft payments', paye_guard_allows_create: true }
    });
    const modal = document.createElement('div');
    modal.id = 'modal';
    modal.className = 'banking-modal ctms-modern-modal ctms-generic-modal';
    modal.innerHTML = html;
    modal.querySelector('.banking-pay-v2-table table')?.classList.add('ctms-universal-table', 'ctms-universal-card-table');
    document.body.replaceChildren(modal);
    await integration.afterRender({
      document,
      state,
      API: (value: string) => value,
      authFetch,
      rerender: async () => undefined,
      invokeLegacy: async (value: unknown) => { legacyActions.push(value); },
      openTimesheets: async (ids: unknown) => { openedTimesheets.push(ids); },
      newRequestId: () => fixture.id(9001),
      formatIsoToUk: (value: unknown) => String(value ?? ''),
      railEnv: 'TEST',
      railProvider: 'TEST_PROVIDER'
    });
    (window as any).__bankingPayV2Harness = { openedTimesheets, legacyActions, requests,
      failNextDetail: () => { detailFailuresRemaining += 1; } };
  });

  const table = page.locator('.banking-pay-v2-table');
  await expect(table).toBeVisible();
  await expect(table.locator('thead th')).toHaveCount(4);
  await expect(table.locator('thead th')).toHaveText(['Include', 'Candidate', 'Deductions', 'Ready to pay']);
  const candidateRow = table.locator('tbody > tr');
  await expect(candidateRow).toHaveCount(1);
  await expect(candidateRow.locator('td')).toHaveCount(4);
  await expect(candidateRow.locator('[data-bpv2-name]')).toHaveText('Synthetic candidate — detail verification');
  await expect(candidateRow.locator('[data-bpv2-deductions]')).toHaveText('Yes');
  await expect(candidateRow.locator('[data-bpv2-amount]')).toHaveText('£228.50');
  await expect(candidateRow.locator('[data-bpv2-control="candidate"]')).toHaveAttribute('aria-checked', 'mixed');
  expect(await candidateRow.locator('[data-bpv2-control="candidate"]').evaluate((node: HTMLInputElement) => node.indeterminate)).toBe(true);
  await expect(candidateRow.locator('.bpv2-payment [data-bpv2-control="timesheets"]')).toBeVisible();
  await expect(table.getByRole('button', { name: /view|breakdown/i })).toHaveCount(0);
  const rowHeight = await candidateRow.evaluate(node => node.getBoundingClientRect().height);
  expect(rowHeight).toBeGreaterThanOrEqual(40);
  expect(rowHeight).toBeLessThanOrEqual(48);
  await expect(candidateRow.locator('.bpv2-candidate')).toHaveCSS('white-space', 'nowrap');

  await candidateRow.locator('[data-bpv2-control="timesheets"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__bankingPayV2Harness.openedTimesheets)).toEqual([
    ['00000000-0000-4000-8000-000000000201']
  ]);

  const candidatePreflight = await page.evaluate(() => {
    const fixture = (window as any).BankingDetailFixture;
    const snapshot = fixture.snapshot();
    Object.assign(snapshot.page, {
      page_number: 1,
      has_previous: false,
      previous_cursor: null,
      page_anchor: 'fixture_ready_anchor'
    });
    for (const row of snapshot.page.rows.filter((item: any) => item.presentation_group_kind === 'TIMESHEET')) {
      Object.assign(row, { presentation_role: 'PARENT', selection_allowed: false,
        is_ready_for_draft: false, draftable: false, status: 'SUPPORTING_CONTEXT' });
    }
    const presenter = (window as any).CloudTMSBankingPayCandidateV2.create({
      document,
      onIntent: () => undefined,
      onLegacyAction: () => undefined,
      onClose: () => undefined,
      onFailure: () => undefined
    });
    try {
      presenter.prepare({
        summary: snapshot.summary,
        candidate: snapshot.candidate,
        page: snapshot.page,
        context: snapshot.context
      }, { previousAvailable: false });
      return null;
    } catch (error) {
      return String((error as Error)?.stack || error);
    } finally {
      presenter.destroy();
    }
  });
  expect(candidatePreflight).toBeNull();

  const parentBefore = await page.locator('#modal').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  });
  await candidateRow.locator('.bpv2-candidate').dblclick();
  await expect(candidateRow.locator('[data-bpv2-control="candidate"]')).toBeEnabled();
  const preservedWhileOpening = await page.evaluate(() =>
    (window as any).CloudTMSBankingPayModalV2Integration.refreshOpenSurface());
  expect(preservedWhileOpening).toBe(true);
  const candidate = page.locator('.banking-pay-v2-candidate');
  await expect(candidate).toBeVisible();
  await expect(page.locator('body > .banking-pay-v2-child-host')).toBeVisible();
  expect(await page.locator('#modal').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  })).toEqual(parentBefore);
  await expect(candidate.getByRole('heading', { name: 'Candidate Banking' })).toBeVisible();
  await expect(candidate.locator('tbody > tr').first()).toBeVisible();
  const clientCell = candidate.locator('.bpv2-child-client').first();
  const clientName = clientCell.locator('.bpv2-client-name');
  const payMethodCell = candidate.locator('.bpv2-child-method').first();
  const payMethodBadge = payMethodCell.locator('.pill').first();
  await expect(clientName).toHaveText('Berkshire Healthcare NHS Foundation Trust');
  await expect(payMethodBadge).toHaveText('PAYE');
  const columnContainment = await page.evaluate(() => {
    const client = document.querySelector('.banking-pay-v2-candidate .bpv2-child-client');
    const name = client?.querySelector('.bpv2-client-name');
    const method = document.querySelector('.banking-pay-v2-candidate .bpv2-child-method');
    const badge = method?.querySelector('.pill');
    if (!(client instanceof HTMLElement) || !(name instanceof HTMLElement)
      || !(method instanceof HTMLElement) || !(badge instanceof HTMLElement)) return null;
    const clientBox = client.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();
    const methodBox = method.getBoundingClientRect();
    const badgeBox = badge.getBoundingClientRect();
    const nameStyle = getComputedStyle(name);
    return {
      clientRight: clientBox.right,
      nameRight: nameBox.right,
      methodLeft: methodBox.left,
      methodRight: methodBox.right,
      badgeLeft: badgeBox.left,
      badgeRight: badgeBox.right,
      nameWhiteSpace: nameStyle.whiteSpace,
      nameLineClamp: nameStyle.webkitLineClamp
    };
  });
  expect(columnContainment).not.toBeNull();
  expect(columnContainment!.nameWhiteSpace).toBe('normal');
  expect(columnContainment!.nameLineClamp).toBe('2');
  expect(columnContainment!.nameRight).toBeLessThanOrEqual(columnContainment!.clientRight + 0.5);
  expect(columnContainment!.clientRight).toBeLessThanOrEqual(columnContainment!.methodLeft + 0.5);
  expect(columnContainment!.badgeLeft).toBeGreaterThanOrEqual(columnContainment!.methodLeft - 0.5);
  expect(columnContainment!.badgeRight).toBeLessThanOrEqual(columnContainment!.methodRight + 0.5);
  const desktopViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(candidate.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  const narrowContainment = await candidate.evaluate(element => {
    const scroll = element.querySelector('.bpv2-child-scroll');
    const table = element.querySelector('.banking-ready-preview-table');
    const client = element.querySelector('.bpv2-child-client');
    const method = element.querySelector('.bpv2-child-method');
    if (!(scroll instanceof HTMLElement) || !(table instanceof HTMLElement)
      || !(client instanceof HTMLElement) || !(method instanceof HTMLElement)) return null;
    scroll.scrollLeft = client.offsetLeft;
    const clientBox = client.getBoundingClientRect();
    const methodBox = method.getBoundingClientRect();
    return {
      hasBoundedHorizontalScroll: scroll.scrollWidth > scroll.clientWidth,
      tableWidth: table.getBoundingClientRect().width,
      clientRight: clientBox.right,
      methodLeft: methodBox.left
    };
  });
  expect(narrowContainment).not.toBeNull();
  expect(narrowContainment!.hasBoundedHorizontalScroll).toBe(true);
  expect(narrowContainment!.tableWidth).toBeGreaterThanOrEqual(1134);
  expect(narrowContainment!.clientRight).toBeLessThanOrEqual(narrowContainment!.methodLeft + 0.5);
  if (desktopViewport) await page.setViewportSize(desktopViewport);
  await expect(candidate).not.toContainText('Blocked for Pay');
  await expect(candidate).not.toContainText('Action Required');
  await expect(candidate.locator('.banking-ready-mobile-row-summary')).toBeHidden();
  const paymentGroup = candidate.locator('[data-action="banking:pay:toggleTimesheetBreakdown"]').first();
  await page.evaluate(() => (window as any).__bankingPayV2Harness.failNextDetail());
  await paymentGroup.click();
  await expect(paymentGroup).toHaveAttribute('aria-expanded', 'true');
  await expect(candidate.getByRole('alert')).toContainText('Payment details could not be loaded.');
  await expect(candidate.getByRole('alert')).toContainText('The current payment list is unchanged.');
  await expect(candidate.locator('.bpv2-group-detail-loading')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__bankingPayV2Harness.requests
    .filter((value: string) => value.includes('/ready-group?')).length)).toBe(1);
  await candidate.getByRole('button', { name: 'Try again' }).click();
  await expect(candidate.locator('[data-bpv2-group-detail-count]')).toHaveText('2 payment segments');
  await expect(candidate.locator('[data-banking-ready-breakdown-detail]:not([hidden]) table.grid > tbody > tr[data-timesheet-group-key]')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => (window as any).__bankingPayV2Harness.requests
    .filter((value: string) => value.includes('/ready-group?')).length)).toBe(2);
  const candidateExport = candidate.getByRole('button', { name: 'Export CSV', exact: true });
  await expect(candidateExport).toBeVisible();
  expect(await candidateExport.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      border: style.borderTopColor,
      color: style.color,
      font: style.fontFamily
    };
  })).toEqual({
    background: 'rgb(19, 36, 58)',
    border: 'rgb(65, 89, 120)',
    color: 'rgb(248, 250, 252)',
    font: expect.stringContaining('Segoe UI')
  });

  const refreshedInPlace = await page.evaluate(() =>
    (window as any).CloudTMSBankingPayModalV2Integration.refreshOpenSurface());
  expect(refreshedInPlace).toBe(true);
  await expect(candidate).toBeVisible();
  await expect(candidate.getByRole('heading', { name: 'Candidate Banking' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__bankingPayV2Harness.requests
    .filter((value: string) => value.includes('/progress')).length)).toBe(1);

  await candidate.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(table).toBeVisible();
  await expect(table.locator('tbody > tr')).toHaveCount(1);
  await expect(candidateRow.locator('[data-bpv2-control="candidate"]')).toBeEnabled();
  expect(await page.locator('#modal').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  })).toEqual(parentBefore);
});

test('100 candidate rows remain single-line and render as one bounded page', async ({ page }) => {
  await page.setContent('<!doctype html><html><head></head><body><div id="host"></div></body></html>');
  await page.addStyleTag({ path: path.join(root, 'css', 'banking-pay-modal-v2.css') });
  await page.addScriptTag({ path: path.join(root, 'js', 'banking-pay-modal-v2-copy.js') });
  await page.addScriptTag({ path: path.join(root, 'js', 'banking-pay-modal-v2-table.js') });
  const data = hundredCandidatePage();
  const measurement = await page.evaluate(pageData => {
    const table = (window as any).CloudTMSBankingPayTableV2.createCandidateTable({
      document,
      onCandidateIntent: () => undefined,
      onGlobalIntent: () => undefined,
      onTimesheets: () => undefined,
      onOpenCandidate: () => undefined,
      onSort: () => undefined,
      onPage: () => undefined,
      onError: () => undefined
    });
    document.getElementById('host')?.append(table.element);
    const started = performance.now();
    table.publish(pageData);
    const renderMs = performance.now() - started;
    const rows = [...table.element.querySelectorAll('tbody > tr')] as HTMLElement[];
    return {
      renderMs,
      count: rows.length,
      heights: rows.map(row => row.getBoundingClientRect().height),
      cells: rows.map(row => row.children.length),
      wraps: rows.map(row => getComputedStyle(row.querySelector('.bpv2-candidate') as Element).whiteSpace)
    };
  }, data);
  expect(measurement.count).toBe(100);
  expect(new Set(measurement.cells)).toEqual(new Set([4]));
  expect(Math.max(...measurement.heights)).toBeLessThanOrEqual(48);
  expect(Math.min(...measurement.heights)).toBeGreaterThanOrEqual(40);
  expect(new Set(measurement.wraps)).toEqual(new Set(['nowrap']));
  expect(measurement.renderMs).toBeLessThan(500);
});

test('Action Required, Updating and Blocked components retain compact Chromium interactions', async ({ page }) => {
  await page.setContent(`<!doctype html><html><head></head><body><main>
    <button id="actions">Show Action Required</button><button id="blocked">Show Blocked for Pay</button>
    <button id="checks">Run component checks</button><div id="host" style="width:1100px"></div>
    <p id="result" role="status">Ready</p></main></body></html>`);
  await page.addStyleTag({ path: path.join(root, 'css', 'banking-pay-modal-v2.css') });
  await page.addScriptTag({ path: path.join(root, 'tests', 'fixtures', 'banking-pay-v2-detail-page.cjs') });
  await page.addScriptTag({ path: path.join(root, 'js', 'banking-pay-modal-v2-copy.js') });
  await page.addScriptTag({ path: path.join(root, 'js', 'banking-pay-modal-v2-table.js') });
  await page.addScriptTag({ path: path.join(root, 'js', 'banking-pay-modal-v2-issues.js') });
  await page.addScriptTag({ path: path.join(root, 'tests', 'fixtures', 'banking-pay-v2-issues-browser.js') });
  await page.getByRole('button', { name: 'Run component checks' }).click();
  await expect(page.locator('#result')).toContainText('PASS — both issue-list components');
  await expect(page.locator('#result')).toContainText('separate Updating');
  await expect(page.locator('.banking-pay-v2-issues')).toHaveCount(1);
});

test('Action Required detail renders and dispatches the exact existing resolution controls', async ({ page }) => {
  await page.setContent('<!doctype html><html><head></head><body><main id="host"></main><p id="result"></p></body></html>');
  await page.addStyleTag({ path: path.join(root, 'css', 'banking-pay-modal-v2.css') });
  await page.addScriptTag({ path: path.join(root, 'js', 'banking-pay-modal-v2-copy.js') });
  await page.addScriptTag({ path: path.join(root, 'js', 'banking-pay-modal-v2-table.js') });
  await page.addScriptTag({ path: path.join(root, 'js', 'banking-pay-modal-v2-issues.js') });
  await page.addScriptTag({ path: path.join(root, 'js', 'banking-pay-modal-v2-details-legacy.js') });
  await page.addScriptTag({ path: path.join(root, 'js', 'banking-pay-modal-v2-issue-detail.js') });
  const summary = hundredCandidatePage();
  summary.global.action_required_count = 1;
  await page.evaluate(({ summary, ids }) => {
    const detail = (window as any).CloudTMSBankingPayIssueDetailV2.create({
      document,
      kind: 'actions',
      adapters: { formatIsoToUk: (value: string) => value, railEnv: 'TEST', railProvider: 'CSV' },
      onPage: () => {},
      onClose: () => {},
      onLegacyAction: ({ action }: { action: string }) => {
        document.querySelector('#result')!.textContent = action;
      },
      onFailure: ({ code }: { code: string }) => {
        document.querySelector('#result')!.textContent = code;
      }
    });
    document.querySelector('#host')!.append(detail.element);
    const response = {
      ok: true,
      contract: summary.contract,
      contract_version: 1,
      session_id: summary.session_id,
      session_version: summary.session_version,
      progress_counter_version: summary.progress_counter_version,
      scope_hash: summary.scope_hash,
      task_key: 'rate-decision',
      total_count: 1,
      has_more: false,
      next_cursor: null,
      page_number: 1,
      has_previous: false,
      previous_cursor: null,
      affected_candidate_count: 1,
      affected_payment_count: 1,
      affected_payment_count_complete: true,
      rows: [{
        identity: 'rate-decision-member',
        candidate_id: ids.candidate,
        preview_row_id: ids.preview,
        source_kind: 'PREVIEW_ROW',
        context_only: false,
        task_meta: {
          family: 'FINANCE_CASE',
          actions: ['banking:pay:openBucketedResolution', 'banking:pay:toggleExcludeTimesheet'],
          case_key: `finance:${ids.financeCase}`,
          finance_case_id: ids.financeCase,
          resolution_family: 'BUCKETED',
          linked_timesheet_id: ids.timesheet
        },
        payload: {
          candidate_id: ids.candidate,
          preview_row_id: ids.preview,
          display_name: 'James Terwane',
          tms_ref: 'CCR-03726',
          client_name: 'West London Mental Health NHS Trust',
          line_type: 'TIMESHEET_PAYMENT',
          presentation_section: 'CASES_RESOLUTIONS',
          effective_section: 'cases_resolutions',
          pay_channel: 'PAYE',
          section_amount_ex_vat: '200.00',
          excluded_from_run: false,
          case_needs_resolution: true,
          case_resolution_satisfied_now: false,
          has_actionable_suggested_resolution: true,
          resolution_action_requires_actionable_components: false
        }
      }]
    };
    detail.prepare(response, summary)();
  }, { summary, ids: { candidate: id(1), preview: id(2), financeCase: id(3), timesheet: id(4) } });

  const review = page.getByRole('button', { name: 'Review suggested rates' });
  await expect(review).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exclude case' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Snooze whole timesheet' })).toBeVisible();
  const badge = page.locator('.banking-pay-v2-issue-detail .pill.pill-warn').first();
  await expect(badge).toHaveText('Resolution required');
  const badgeStyle = await badge.evaluate(element => {
    const style = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, whiteSpace: style.whiteSpace };
  });
  expect(badgeStyle.height).toBeLessThanOrEqual(28);
  expect(badgeStyle.whiteSpace).toBe('nowrap');
  await review.click();
  await expect(page.locator('#result')).toHaveText('banking:pay:openBucketedResolution');
});
