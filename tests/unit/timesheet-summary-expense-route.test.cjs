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
  assert.equal(routeLabel({ is_expense_only: true, display_route_label: 'Electronic Expense', route_type: 'WEEKLY_NHSP_ADJUSTMENT' }), 'Electronic Expense');
  assert.equal(routeLabel({ is_expense_only: true, display_route_label: 'Manual Expense', route_type: 'WEEKLY_NHSP_ADJUSTMENT' }), 'Manual Expense');
  assert.equal(routeLabel({ is_expense_only: true, display_route_label: 'QR Expense', route_type: 'WEEKLY_NHSP_ADJUSTMENT' }), 'QR Expense');
  assert.equal(routeLabel({ is_expense_only: true, display_route_label: 'unproved wording', route_type: 'WEEKLY_NHSP_ADJUSTMENT' }), 'Expense');
  assert.equal((main.match(/formatTimesheetSummaryRoute\(/g) || []).length, 5,
    'the shared rule must cover both row patchers, targeted refresh and full rendering');
});

test('a worked NHSP adjustment keeps its worked-timesheet label', () => {
  assert.equal(routeLabel({
    is_expense_only: false,
    display_route_label: 'Electronic Expense',
    route_type: 'WEEKLY_NHSP_ADJUSTMENT'
  }), 'Weekly NHSP Adjustment');
});

test('Timesheet detail gives an expense-only record its expense label, not adjustment wording', () => {
  assert.match(main, /if \(expenseOnlyForOverview\) return routeDisplayForDisplay \|\| 'Expense'/);
  assert.match(main, /expenseOnlyForOverview \? "Expense – Can't delete yet" : "Manual adjustment – Can't delete yet"/);
});
