const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../js/main.js'),
  'utf8'
);

const start = source.indexOf('function renderBankingPayBatchChildModalRemittanceTab()');
const end = source.indexOf('function renderBankingPayBatchChildModalPayeWorksheetTab()', start);
assert.ok(start >= 0 && end > start, 'Remittance tab renderer must be present');

const renderer = source.slice(start, end);

test('classifies PAYE and umbrella remittances independently', () => {
  assert.match(renderer, /return 'PAYE_REMITTANCE'/);
  assert.match(renderer, /return 'UMBRELLA_REMITTANCE'/);
  assert.match(renderer, /return 'PAYE remittance'/);
  assert.match(renderer, /return 'Umbrella remittance'/);
});

test('uses neutral remittance section headings for mixed PAYE and umbrella batches', () => {
  assert.match(renderer, /sectionSummaryHtml\('Remittance rows', remittanceRows/);
  assert.match(renderer, />Remittance rows<\/div>\$\{rowsTableHtml\(remittanceRows/);
  assert.doesNotMatch(renderer, /sectionSummaryHtml\('Umbrella remittance rows'/);
});

test('classifies shared processing and completion broadcasts as system payment notices', () => {
  assert.match(renderer, /referenceLower\.startsWith\('pay_batch_'\)/);
  assert.match(renderer, /return 'SYSTEM_PAYMENT_NOTICE'/);
  assert.match(renderer, /return 'System payment notice'/);
  assert.match(renderer, /sectionSummaryHtml\('System payment notice rows', systemNoticeRows/);
  assert.match(renderer, />System payment notice rows<\/div>\$\{rowsTableHtml\(systemNoticeRows/);
});
