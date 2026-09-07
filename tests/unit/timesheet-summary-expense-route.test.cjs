const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const main = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');
const helperStart = main.indexOf('const APPROVED_EXPENSE_ROUTE_LABELS');
const helperEnd = main.indexOf('\nfunction formatDisplayValue', helperStart);
const helperSource = main.slice(helperStart, helperEnd);

function routeLabel(row) {
  const context = vm.createContext({ row, result: null });
  new vm.Script(`
    function formatDisplayValue(key, value) {
      if (key === 'route_type' && value === 'WEEKLY_NHSP_ADJUSTMENT') return 'Weekly NHSP Adjustment';
      return String(value || '');
    }
    ${helperSource}
    result = formatTimesheetSummaryRoute(row);
  `).runInContext(context);
  return context.result;
}

test('Timesheet Summary uses the proved expense origin in every rendering path', () => {
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.equal(routeLabel({ is_expense_only: true, total_hours: 0, display_route_label: 'Electronic Expense', route_type: 'WEEKLY_NHSP_ADJUSTMENT' }), 'Electronic Expense');
  assert.equal(routeLabel({ is_expense_only: true, display_route_label: 'Manual Expense', route_type: 'WEEKLY_NHSP_ADJUSTMENT' }), 'Manual Expense');
  assert.equal(routeLabel({ is_expense_only: true, total_hours: 0, display_route_label: 'QR Expense', route_type: 'WEEKLY_NHSP_ADJUSTMENT' }), 'QR Expense');
  assert.equal(routeLabel({
    is_expense_only: true,
    total_hours: 0,
    display_route_label: 'QR Expense',
    correction_id: '00000000-0000-4000-8000-000000000099',
    correction_kind: 'CHANGED_HOURS_REVERSAL',
    adjustment_origin: 'IMPORT_CORRECTION',
    correction_source_system: 'NHSP',
    route_type: 'WEEKLY_NHSP_ADJUSTMENT'
  }), 'QR Expense');
  assert.equal(routeLabel({ is_expense_only: true, display_route_label: 'unproved wording', route_type: 'WEEKLY_NHSP_ADJUSTMENT' }), 'Expense');
  assert.equal((main.match(/formatTimesheetSummaryRoute\(/g) || []).length, 6,
    'the shared rule must cover both row patchers, targeted refresh, full rendering and Bulk Authorise');
});

test('a worked NHSP adjustment keeps its worked-timesheet label', () => {
  assert.equal(routeLabel({
    is_expense_only: false,
    display_route_label: 'Electronic Expense',
    route_type: 'WEEKLY_NHSP_ADJUSTMENT'
  }), 'Weekly NHSP Adjustment');
});

test('an authoritative changed-hours reversal is labelled Timesheet Adjustment', () => {
  assert.equal(routeLabel({
    correction_id: '00000000-0000-4000-8000-000000000001',
    correction_kind: 'CHANGED_HOURS_REVERSAL',
    adjustment_origin: 'IMPORT_CORRECTION',
    correction_source_system: 'NHSP',
    total_hours: -8,
    route_type: 'WEEKLY_NHSP_ADJUSTMENT'
  }), 'Timesheet Adjustment');
  assert.equal(routeLabel({
    correction_id: '00000000-0000-4000-8000-000000000002',
    correction_kind: 'CHANGED_HOURS_REVERSAL',
    adjustment_origin: 'IMPORT_CORRECTION',
    correction_source_system: 'HEALTHROSTER',
    total_hours: -7.5,
    route_type: 'WEEKLY_HEALTHROSTER_ADJUSTMENT'
  }), 'Timesheet Adjustment');
});

test('Bulk Authorise rejects malformed date fragments and uses the same reversal wording', () => {
  const start = main.indexOf('function renderBulkAuthoriseLists(state)');
  const end = main.indexOf('\nfunction bindBulkAuthoriseLists(state)', start);
  assert.ok(start >= 0 && end > start, 'Bulk Authorise list renderer must exist');
  const block = main.slice(start, end);
  assert.match(block, /const candidates = \[/);
  assert.match(block, /for \(const value of candidates\)/);
  assert.match(block, /if \(row\?\.is_expense_only === true\) return formatTimesheetSummaryRoute\(row\)/);
  assert.match(block, /if \(isTimesheetAdjustmentReversal\(row\)\) return 'Timesheet Adjustment'/);
  assert.doesNotMatch(block, /if \(!ymd\) return raw/);
});

test('the current Timesheet UI has no one-way Show more options control', () => {
  assert.doesNotMatch(main, /Show more options/i);
});

test('Timesheet detail gives an expense-only record its expense label, not adjustment wording', () => {
  assert.match(main, /if \(expenseOnlyForOverview\) return routeDisplayForDisplay \|\| 'Expense'/);
  assert.match(main, /expenseOnlyForOverview \? "Expense – Can't delete yet" : "Manual adjustment – Can't delete yet"/);
});
