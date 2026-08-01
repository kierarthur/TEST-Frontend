const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'main.js'), 'utf8');

const section = (startMarker, endMarker) => {
  const start = main.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = main.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return main.slice(start, end);
};

test('planned draft wrapper always submits and adopts the guarded contract-week signature', () => {
  const source = section(
    'async function contractWeekManualDraftUpsert',
    'function renderBankingIdTab'
  );
  assert.match(source, /expectedPlannedRowSignature/);
  assert.match(source, /safePayload\.expected_row_signature = expectedPlannedRowSignature/);
  assert.match(source, /planned_contract_week_authority_complete !== true/);
  assert.match(source, /returnedPlannedRowSignature/);
  assert.match(source, /ctx\.timesheetDetails\.contract_week/);
});

test('post-save authority uses planned-row proof only for a row without a timesheet', () => {
  const start = main.indexOf('// Post-save row update: a planned contract week uses its own guarded row');
  assert.notEqual(start, -1);
  const source = main.slice(start, start + 6500);
  assert.match(source, /isPlannedWeeklyWithoutTs\s*\?\s*plannedAuthorityAfterSave/);
  assert.match(source, /hasTrustedTimesheetLifecycleSignature/);
  assert.match(source, /planned_contract_week_authority_complete/);
});

test('footer allows planned Process only with the separate planned authority', () => {
  const source = section(
    'function getCanonicalTimesheetFooterState',
    'function setFormReadOnly'
  );
  assert.match(source, /plannedContractWeekAuthorityComplete/);
  assert.match(source, /String\(plannedAuthorityContractWeekId\) === String\(contractWeekId\)/);
  assert.match(source, /const lifecycleAuthoritySatisfied = isPlannedWeek[\s\S]*plannedContractWeekAuthorityComplete[\s\S]*lifecycleAuthorityComplete/);
  assert.match(source, /const canonicalCanProcess = !!\([\s\S]*lifecycleAuthoritySatisfied/);
  assert.match(source, /const canonicalCanAuthoriseBase = !!\([\s\S]*lifecycleAuthorityComplete/);
  assert.match(source, /const localCanUnprocess[\s\S]*hasTs/);
});

test('planned Process carries the contract-week signature into the atomic create', () => {
  const marker = "if (isWeeklyPlannedManualX) {";
  const start = main.indexOf(marker, main.indexOf('// ── Process Timesheet ──'));
  assert.notEqual(start, -1);
  const source = main.slice(start, start + 19000);
  assert.match(source, /const plannedRowSignature/);
  assert.match(source, /expected_row_signature:\s*plannedRowSignature/);
  assert.match(source, /manualUpsertContractWeek\(String\(weekIdX\), payload\)/);
});
