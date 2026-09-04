const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'main.js'), 'utf8');

const section = (startMarker, endMarker) => {
  const start = main.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = main.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return main.slice(start, end);
};

test('Client settings expose and preserve the independent Candidate expense policy', () => {
  const source = section('async function renderClientSettingsUI', 'async function upsertClient(payload, id)');

  assert.match(source, /candidate_expenses_require_separate_timesheet/);
  assert.match(source, /candidate_expense_invoice_email/);
  assert.match(source, /const candidateExpenseDeliveryBlock = \(st\) =>/);
  assert.match(source, /Import-authoritative Timesheets always use a separate expense Timesheet/);
  assert.match(source, /is not suppressed by self-bill hours/);
  assert.match(source, /importAuthoritative \|\| !!st\.candidate_expenses_require_separate_timesheet/);
  assert.match(source, /importAuthoritative\s*\n\s*\)\}/);
});

test('Client settings force separate Candidate expenses only for import-authoritative workflows', () => {
  const source = section('function canonicalizeClientSettings(input)', 'async function openSettings');
  const canonicalizeClientSettings = vm.runInNewContext(`${source}; canonicalizeClientSettings`);

  assert.equal(canonicalizeClientSettings({ weekly_mode: 'NHSP', candidate_expenses_require_separate_timesheet: false }).candidate_expenses_require_separate_timesheet, true);
  assert.equal(canonicalizeClientSettings({ weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'CREATE', candidate_expenses_require_separate_timesheet: false }).candidate_expenses_require_separate_timesheet, true);
  assert.equal(canonicalizeClientSettings({ weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'VERIFY', candidate_expenses_require_separate_timesheet: false }).candidate_expenses_require_separate_timesheet, false);
  assert.equal(canonicalizeClientSettings({ weekly_mode: 'NONE', candidate_expenses_require_separate_timesheet: false }).candidate_expenses_require_separate_timesheet, false);
});

test('Contract settings make the Contract override authoritative over the Client default', () => {
  const source = section('function openContractSettingsModal()', 'function computePayWorkbenchSessionSignature');

  assert.match(source, /candidate_expenses_require_separate_timesheet_override/);
  assert.match(source, /candidate_expense_invoice_email_override/);
  assert.match(source, /expenseSeparationOverride === null[\s\S]*clientExpenseSeparation[\s\S]*expenseSeparationOverride/);
  assert.match(source, /Require a separate expense Timesheet/);
  assert.match(source, /Allow one combined Timesheet/);
  assert.match(source, /import-authoritative workflow and cannot be overridden/);
});

test('Contract and Client expense policy fields are included in their save payloads', () => {
  assert.match(main, /candidate_expenses_require_separate_timesheet_override,\s*\n\s*candidate_expense_invoice_email_override,/);
  assert.match(main, /csClean\.candidate_expenses_require_separate_timesheet =/);
  assert.match(main, /csClean\.candidate_expense_invoice_email =/);

  const calendar = section('async function fetchAndRenderCandidateCalendar', 'function renderCandidateContractList');
  assert.doesNotMatch(calendar, /csClean\.|csMerged\./);
});
