const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const moduleSource = () => fs.readFileSync(path.join(root, 'js', 'banking-pay-modal-v2.js'), 'utf8');
const source = (name) => fs.readFileSync(path.join(root, 'js', name), 'utf8');
const mainSource = () => fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const htmlSource = () => fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('main candidate table is exactly four columns and one non-expandable row per candidate', () => {
  const table = source('banking-pay-modal-v2-table.js');
  assert.match(table, /<th[^>]*>\s*<label[^>]*>\s*<input[^>]*>Include<\/label><\/th>/);
  assert.match(table, />Candidate<\/button>/);
  assert.match(table, />Deductions<\/button>/);
  assert.match(table, />Ready to pay<\/button>/);
  assert.match(table, /data-banking-pay-v2-candidate-row/);
  assert.doesNotMatch(table, /View (?:breakdown|details)/i);
  assert.doesNotMatch(table, /data-banking-pay-v2-expand/);
  assert.doesNotMatch(table, /<th[^>]*>\s*Timesheets\s*<\/th>/i);
  assert.doesNotMatch(table, /candidate-search|search candidates/i);
});

test('selected-only amount, deduction and Timesheet wording is explicit', () => {
  const combined = source('banking-pay-modal-v2-table.js') + source('banking-pay-modal-v2-copy.js');
  assert.match(combined, /selected_display_amount/);
  assert.match(combined, /selected_deduction_exists/);
  assert.match(combined, /selected_timesheet_count/);
  assert.match(combined, /No Ready Timesheet is linked to this candidate's selected payments\./);
  assert.equal(require(path.join(root, 'js', 'banking-pay-modal-v2-table.js')).formatAmount('0.00'), '£0.00');
  assert.match(combined, /aria-checked.*mixed/);
});

test('the v2 surface has dedicated Candidate Banking, Action Required and Blocked modal owners', () => {
  const combined = [
    'banking-pay-modal-v2.js',
    'banking-pay-modal-v2-candidate.js',
    'banking-pay-modal-v2-issues.js',
    'banking-pay-modal-v2-issue-detail.js',
    'banking-pay-modal-v2-integration.js',
    'banking-pay-modal-v2-copy.js'
  ].map(source).join('\n');
  assert.match(combined, /Candidate Banking/);
  assert.match(combined, /Action Required/);
  assert.match(combined, /Blocked for Pay/);
  assert.match(combined, /Updating/);
  assert.match(combined, /Insufficient funds to deduct/);
  const copy = fs.readFileSync(path.join(root, 'js', 'banking-pay-modal-v2-copy.js'), 'utf8');
  assert.match(copy, /Payment was originally PAYE\. Candidate is now paid through an umbrella company\./);
  assert.match(copy, /Payment was originally through an umbrella company\. Candidate is now PAYE\./);
  assert.doesNotMatch(combined, /Insufficient recovery headroom/i);
});

test('main.js delegates v2 actions while retaining every legacy Banking Pay handler', () => {
  const main = mainSource();
  assert.ok(main.includes('CloudTMSBankingPayModalV2'), 'main asset must delegate to the contained v2 controller');
  for (const action of [
    'banking:pay:createDraft',
    'banking:pay:togglePreviewRow',
    'banking:pay:toggleAllReadyPreviewRows',
    'banking:pay:viewRowTimesheets',
    'banking:pay:clearAllDecisions',
    'banking:pay:openFiltersModal'
  ]) assert.ok(main.includes(action), `legacy action retained: ${action}`);
  const html = htmlSource();
  const integrationIndex = html.indexOf('./js/banking-pay-modal-v2-integration.js');
  const mainIndex = html.indexOf('./js/main.js');
  assert.ok(integrationIndex >= 0 && mainIndex > integrationIndex, 'the capability-gated integration must load before main.js');
  assert.ok(main.includes('CloudTMSBankingPayModalV2Integration.afterRender'));
  assert.ok(main.includes('dispatch,'), 'the unchanged delegated handler is exposed to the contained integration');
});
