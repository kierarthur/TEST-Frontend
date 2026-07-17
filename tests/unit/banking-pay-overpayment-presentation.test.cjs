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
    getLineRowLevelAmount: (value) => Number(value?.amount_ex_vat || 0),
    getLineSectionAmount: (value) => Number(value?.amount_ex_vat || 0),
    getFriendlyExpenseLabel: (value) => ({ ACCOMMODATION: 'Accommodation', TRAVEL: 'Travel' }[String(value || '').toUpperCase()] || 'Other Expense'),
    ymdToUk: (value) => {
      const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
    },
    enc: (value) => String(value),
    fmtMoney: (value) => Number(value || 0).toFixed(2),
    resolvedRateBadgeHtml: () => ''
  };
  vm.runInNewContext(`${helperSource}\nthis.__overpaymentHelpers = { getOverpaymentRecoveryPresentation, getPreviewLineDisplayAmount, renderPreviewLineTypeHtml, renderPreviewLineAmountHtml };`, context, {
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
