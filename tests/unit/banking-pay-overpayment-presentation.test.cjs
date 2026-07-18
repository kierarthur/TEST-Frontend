const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(
  path.resolve(__dirname, '../../js/main.js'),
  'utf8'
);

const helperStart = mainSource.indexOf('const isOverpaymentRecoveryLine =');
const helperEnd = mainSource.indexOf('const getLineCandidateId =', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'Banking Pay overpayment presentation helpers must be present');

const helperSource = mainSource.slice(helperStart, helperEnd);

function installHarness() {
  const context = {
    Math,
    String,
    Number,
    Array,
    isPlainObject: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
    getNestedLinePayload: (value) => value?.nested || {},
    upperTrim: (value) => String(value || '').trim().toUpperCase(),
    trimStr: (value) => String(value || '').trim(),
    asArray: (value) => (Array.isArray(value) ? value : []),
    firstFinitePreviewNumber: (...values) => {
      for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const number = Number(value);
        if (Number.isFinite(number)) return number;
      }
      return null;
    },
    getLineCaseComponents: (value) => (Array.isArray(value?.case_components) ? value.case_components : []),
    getPreviewRowId: (value) => String(value?.preview_row_id || '').trim(),
    isPreviewRowSelectionAllowed: (value) => value?.selection_allowed !== false,
    getLineRowLevelAmount: (value) => Number(value?.amount_ex_vat || 0),
    getLineSectionAmount: (value) => Number(value?.amount_ex_vat || 0),
    toNum: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    uniqTrimmed: (values) => Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))),
    getFriendlyExpenseLabel: (value) => ({ ACCOMMODATION: 'Accommodation', TRAVEL: 'Travel' }[String(value || '').toUpperCase()] || 'Other Expense'),
    ymdToUk: (value) => {
      const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
    },
    enc: (value) => String(value),
    fmtMoney: (value) => Number(value || 0).toFixed(2),
    resolvedRateBadgeHtml: () => ''
  };
  vm.runInNewContext(`${helperSource}\nthis.__overpaymentHelpers = { getOverpaymentRecoveryPresentation, getManualDebtRecoveryPresentation, buildOverpaymentRecoveryDisplayLines, getPreviewLineDisplayAmount, renderPreviewLineTypeHtml, renderPreviewLineAmountHtml };`, context, {
    filename: 'banking-pay-overpayment-presentation-helpers.js'
  });
  return context.__overpaymentHelpers;
}

const eduardoRecoveryRow = {
  line_type: 'OVERPAYMENT_RECOVERY',
  presentation_reason: 'NO_PAY_HEADROOM',
  blocked_reason_codes: ['NO_PAY_HEADROOM'],
  amount_ex_vat: '0.00',
  case_components: [
    { component_key_type: 'EXPENSE_CODE', component_key_value: 'ACCOMMODATION', source_amount: '2.00', remaining_source_amount: '2.00', preview_due_amount_ex_vat: '0.00' },
    { component_key_type: 'EXPENSE_CODE', component_key_value: 'TRAVEL', source_amount: '11.99', remaining_source_amount: '11.99', preview_due_amount_ex_vat: '0.00' },
    { component_key_type: 'TS_DAY', component_key_value: '2026-06-09', source_amount: '0.98', remaining_source_amount: '0.98', preview_due_amount_ex_vat: '0.00' },
    { component_key_type: 'TS_DAY', component_key_value: '2026-06-10', source_amount: '0.87', remaining_source_amount: '0.87', preview_due_amount_ex_vat: '0.00' }
  ]
};

test('shows the full negative outstanding recovery while retaining a zero current-run recovery', () => {
  const helpers = installHarness();
  const presentation = helpers.getOverpaymentRecoveryPresentation(eduardoRecoveryRow);

  assert.equal(presentation.outstanding_total, 15.84);
  assert.equal(presentation.recoverable_this_run, 0);
  assert.equal(presentation.no_available_funds, true);
  assert.equal(helpers.getPreviewLineDisplayAmount(eduardoRecoveryRow), -15.84);
  assert.match(helpers.renderPreviewLineTypeHtml(eduardoRecoveryRow), /No available funds to recover this yet\./);
  assert.match(helpers.renderPreviewLineAmountHtml(eduardoRecoveryRow), /-15\.84/);
  assert.match(helpers.renderPreviewLineAmountHtml(eduardoRecoveryRow), /Recoverable this pay run: 0\.00/);
});

test('shows scheduled manual-debt recovery separately from a zero current-run recovery', () => {
  const helpers = installHarness();
  const manualDebtRow = {
    line_type: 'MANUAL_DEBT_RECOVERY',
    presentation_reason: 'NO_PAY_HEADROOM',
    blocked_reason_codes: ['NO_PAY_HEADROOM'],
    amount_ex_vat: '0.00',
    case_components: [{
      source_basis_json: { weekly_due: '100.00' },
      preview_due_amount_ex_vat: '0.00'
    }]
  };

  const presentation = helpers.getManualDebtRecoveryPresentation(manualDebtRow);
  assert.equal(presentation.scheduled_due, 100);
  assert.equal(presentation.recoverable_this_run, 0);
  assert.equal(presentation.no_available_funds, true);
  assert.equal(helpers.getPreviewLineDisplayAmount(manualDebtRow), -100);
  assert.match(helpers.renderPreviewLineTypeHtml(manualDebtRow), /No unreserved payable earnings are available for this recovery\./);
  assert.match(helpers.renderPreviewLineAmountHtml(manualDebtRow), /-100\.00/);
  assert.match(helpers.renderPreviewLineAmountHtml(manualDebtRow), /Scheduled recovery due/);
  assert.match(helpers.renderPreviewLineAmountHtml(manualDebtRow), /Recoverable this pay run: 0\.00/);
});

test('never substitutes the scheduled debt amount for a recoverable ready amount', () => {
  const helpers = installHarness();
  const readyManualDebtRow = {
    line_type: 'MANUAL_DEBT_RECOVERY',
    presentation_reason: 'READY_TO_PAY',
    nominal_due_amount_ex_vat: '100.00',
    recoverable_this_pay_run_ex_vat: '50.00',
    amount_ex_vat: '-50.00'
  };

  const presentation = helpers.getManualDebtRecoveryPresentation(readyManualDebtRow);
  assert.equal(presentation.scheduled_due, 100);
  assert.equal(presentation.recoverable_this_run, 50);
  assert.equal(presentation.no_available_funds, false);
  assert.equal(helpers.getPreviewLineDisplayAmount(readyManualDebtRow), -50);
  assert.match(helpers.renderPreviewLineAmountHtml(readyManualDebtRow), /-50\.00/);
  assert.doesNotMatch(helpers.renderPreviewLineAmountHtml(readyManualDebtRow), /Scheduled recovery due/);
});

test('uses friendly descriptions for every overpayment constituent', () => {
  const helpers = installHarness();
  const presentation = helpers.getOverpaymentRecoveryPresentation(eduardoRecoveryRow);

  assert.deepEqual(
    Array.from(presentation.components, (component) => component.label),
    ['Accommodation', 'Travel', 'Timesheet pay — 09/06/2026', 'Timesheet pay — 10/06/2026']
  );
});

test('renders a dedicated overpayment breakdown instead of the expense-component dropdown', () => {
  assert.match(mainSource, /<summary class="mini"[^>]*>Show overpayment breakdown<\/summary>/);
  assert.match(mainSource, /This overpayment is made up of the following amounts\./);
  assert.match(mainSource, /<th>Description<\/th>/);
  assert.match(mainSource, /<th[^>]*>Original overpayment<\/th>/);
  assert.match(mainSource, /<th[^>]*>Outstanding<\/th>/);
  assert.match(mainSource, /<th[^>]*>Recoverable this pay run<\/th>/);
  assert.match(mainSource, /isOverpaymentRecoveryLine\(line\)[\s\S]*renderOverpaymentRecoveryBreakdown\(line\)[\s\S]*renderExpenseComponentBreakdown\(line\)/);
});

test('groups one multi-component recovery into one visible parent while preserving every economic row id', () => {
  const helpers = installHarness();
  const rows = Array.from({ length: 5 }, (_, index) => ({
    line_type: 'OVERPAYMENT_RECOVERY',
    presentation_role: 'CHILD',
    presentation_parent_line_id: 'finance:case-1:overpayment_recovery',
    finance_case_id: 'case-1',
    preview_row_id: `row-${index + 1}`,
    amount_ex_vat: '-0.25',
    selection_allowed: true,
    case_components: [{
      finance_component_id: `component-${index + 1}`,
      component_key_type: 'TS_DAY',
      component_key_value: `2026-07-${String(index + 6).padStart(2, '0')}`,
      source_amount: '11.25',
      remaining_source_amount: '11.25',
      preview_due_amount_ex_vat: '0.25'
    }]
  }));

  const displayRows = helpers.buildOverpaymentRecoveryDisplayLines(rows);
  assert.equal(displayRows.length, 1);
  assert.deepEqual(Array.from(displayRows[0].__presentation_group_preview_row_ids), ['row-1', 'row-2', 'row-3', 'row-4', 'row-5']);
  assert.equal(displayRows[0].case_components.length, 5);
  assert.equal(displayRows[0].amount_ex_vat, -1.25);
  assert.equal(displayRows[0].presentation_role, 'PARENT');
  assert.equal(displayRows[0].source_ref, 'advance:case-1');

  const presentation = helpers.getOverpaymentRecoveryPresentation(displayRows[0]);
  assert.equal(presentation.outstanding_total, 56.25);
  assert.equal(presentation.recoverable_this_run, 1.25);
  assert.match(mainSource, /if \(a === 'banking:pay:toggleTimesheetPreviewGroup'\)[\s\S]*setPreviewRowsSelection\(previewRowIds, selectAllChildren\)/);
});

test('gives terminal failure precedence over stale pending state and de-duplicates failure levels', () => {
  assert.match(mainSource, /if \(authoritativeRenderState\.hasFailure \|\| hasFailedCandidates\) return 'Refresh failed';\s*if \(hasPendingCandidates\) return 'Preparing…';/);
  assert.match(mainSource, /const issueCount = Math\.max\([\s\S]*candidateCounts\.failed[\s\S]*lineCounts\.failed[\s\S]*jobCounts\.unresolved_failed/);
  assert.match(mainSource, /pendingCandidateIds\.filter\(\(candidateId\) => !failedCandidateIdSet\.has\(candidateId\)\)/);
});

test('Banking Pay Refresh enqueues a full live workbench refresh without clearing decisions', () => {
  const helperStart = mainSource.indexOf('async function bankingPayWorkbenchSessionRefresh');
  const helperEnd = mainSource.indexOf('async function bankingPayWorkbenchSessionClearAllDecisions', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'workbench refresh helper must be present');
  const helperBody = mainSource.slice(helperStart, helperEnd);
  assert.match(helperBody, /\/api\/banking\/pay\/workbench\/session\/\$\{encodeURIComponent\(sessionIdText\)\}\/refresh/);
  assert.doesNotMatch(helperBody, /clear-all-decisions|\/discard|create-draft|execute|settle/i);

  const refreshStart = mainSource.indexOf('const refreshBankingPayAll = async');
  const refreshEnd = mainSource.indexOf('const childResultShouldRefreshPayWorkbench', refreshStart);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, 'Banking Pay Refresh action must be present');
  const refreshBody = mainSource.slice(refreshStart, refreshEnd);
  const enqueueIndex = refreshBody.indexOf('await bankingPayWorkbenchSessionRefresh');
  const rereadIndex = refreshBody.indexOf('await refreshPayWorkbench');
  assert.ok(enqueueIndex >= 0, 'Refresh must enqueue authoritative workbench recomputation');
  assert.ok(rereadIndex > enqueueIndex, 'Refresh must reread the workbench after enqueueing recomputation');
  assert.doesNotMatch(refreshBody, /bankingPayWorkbenchSessionClearAllDecisions|bankingPayWorkbenchSessionDiscard/);
});
