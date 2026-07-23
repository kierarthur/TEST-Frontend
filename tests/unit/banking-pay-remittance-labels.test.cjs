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

test('labels PAYE candidate remittances independently from umbrella remittances', () => {
  assert.match(renderer, /kindRaw === 'CANDIDATE_REMITTANCE'/);
  assert.match(renderer, /recipientKind === 'candidate'/);
  assert.match(renderer, /return 'Candidate remittance'/);
  assert.match(renderer, /kindRaw === 'UMBRELLA_REMITTANCE'/);
  assert.match(renderer, /recipientKind === 'umbrella'/);
  assert.match(renderer, /return isUmbrellaRemittance \? 'Umbrella remittance' : 'Remittance'/);
});

test('uses neutral remittance section headings for mixed PAYE and umbrella batches', () => {
  assert.match(renderer, /sectionSummaryHtml\('Remittance rows', remittanceRows/);
  assert.match(renderer, />Remittance rows<\/div>\$\{rowsTableHtml\(remittanceRows/);
  assert.doesNotMatch(renderer, /sectionSummaryHtml\('Umbrella remittance rows'/);
});
