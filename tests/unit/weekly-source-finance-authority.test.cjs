const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '../../js/main.js'), 'utf8');
const start = main.indexOf('function isUnfundedSourceAuthoritativeRootFinance(');
const end = main.indexOf('function renderTimesheetFinanceTab(', start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({});
vm.runInContext(main.slice(start, end), context);
const pending = context.isUnfundedSourceAuthoritativeRootFinance;

test('signed NHSP hours with a Timesheet ID but no TSFIN remain non-financial', () => {
  assert.equal(pending(
    { route_type: 'WEEKLY_NHSP', timesheet_id: 'candidate-timesheet-id' },
    { tsfin: { timesheet_id: 'candidate-timesheet-id' } }
  ), true);
  assert.match(main.slice(end, main.indexOf('const fmtMoney', end)), /if \(isUnfundedSourceAuthoritativeRootFinance\(row, details\)\)/);
});

test('a source-derived financial snapshot enables Finance', () => {
  assert.equal(pending(
    { route_type: 'WEEKLY_NHSP' },
    { tsfin: { id: 'source-financial-id', timesheet_id: 'candidate-timesheet-id' } }
  ), false);
});

test('self-bill source roots wait for financial authority, but adjustment and ordinary routes do not', () => {
  assert.equal(pending({ route_type: 'WEEKLY_HEALTHROSTER', client_no_timesheet_required: true }, { tsfin: {} }), true);
  assert.equal(pending({ route_type: 'WEEKLY_NHSP_ADJUSTMENT' }, { tsfin: {} }), false);
  assert.equal(pending({ route_type: 'WEEKLY_NHSP', additional_seq: 1 }, { tsfin: {} }), false);
  assert.equal(pending({ route_type: 'WEEKLY_MANUAL' }, { tsfin: {} }), false);
});
