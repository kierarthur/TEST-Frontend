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

test('Weekly Roster Timesheet-authority Client reference-before-pay setting defaults false and is preserved', () => {
  const source = section('function canonicalizeClientSettings(input)', 'async function openSettings');
  const canonicalizeClientSettings = vm.runInNewContext(`${source}; canonicalizeClientSettings`);

  const verifyTrue = canonicalizeClientSettings({
    weekly_mode: 'HEALTHROSTER',
    hr_weekly_behaviour: 'VERIFY',
    pay_reference_required: true
  });
  const verifyFalse = canonicalizeClientSettings({
    weekly_mode: 'HEALTHROSTER',
    hr_weekly_behaviour: 'VERIFY'
  });
  const create = canonicalizeClientSettings({
    weekly_mode: 'HEALTHROSTER',
    hr_weekly_behaviour: 'CREATE',
    pay_reference_required: true
  });

  assert.equal(verifyTrue.pay_reference_required, true);
  assert.equal(verifyFalse.pay_reference_required, false);
  assert.equal(create.pay_reference_required, false);
});

test('Client settings show the reference-before-pay control only for Weekly Roster Timesheet authority', () => {
  const source = section('async function renderClientSettingsUI', 'async function upsertClient(payload, id)');
  assert.match(source, /const mode = String\(st\.weekly_mode \|\| 'NONE'\)\.toUpperCase\(\)/);
  assert.match(source, /const isCreate = \(beh === 'CREATE'\)/);
  assert.match(
    source,
    /\$\{isCreate \? '' : checkChoice\('pay_reference_required', 'Reference required before pay', !!st\.pay_reference_required\)\}/
  );
});

test('current Contract settings preserve the same VERIFY-only reference choice', () => {
  const source = section('function openContractSettingsModal()', 'function computePayWorkbenchSessionSignature');
  assert.match(source, /isHrCreate: \(weeklyMode === 'HEALTHROSTER' && hrMode === 'NO_TS'\)/);
  assert.match(
    source,
    /\$\{isHrCreate \? '' : checkChoice\('require_reference_to_pay', 'Reference required before pay'/
  );
  assert.match(
    source,
    /if \(weekly === 'HEALTHROSTER'\) \{[\s\S]*?'require_reference_to_pay',[\s\S]*?isHrCreate \? false : !!root\.querySelector\('input\[type="checkbox"\]\[name="require_reference_to_pay"\]'\)\?\.checked/
  );
});

test('legacy Contract settings fallback renders reference-before-pay for REQUIRE_TS only', () => {
  const source = section('function renderContractSettingsModal', 'function snapshotContractForm');
  assert.match(
    source,
    /\$\{hrMode === 'NO_TS' \? '' : checkChoice\('require_reference_to_pay', 'Reference required before pay'/
  );
});

test('ordinary and NHSP Client reference policy remains unchanged', () => {
  const source = section('function canonicalizeClientSettings(input)', 'async function openSettings');
  const canonicalizeClientSettings = vm.runInNewContext(`${source}; canonicalizeClientSettings`);

  assert.equal(canonicalizeClientSettings({
    weekly_mode: 'NONE',
    pay_reference_required: true
  }).pay_reference_required, true);
  assert.equal(canonicalizeClientSettings({
    weekly_mode: 'NHSP',
    pay_reference_required: true
  }).pay_reference_required, false);
});
