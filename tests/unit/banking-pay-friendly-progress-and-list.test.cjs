const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'js', 'main.js'), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `${startMarker} source must be present`);
  return source.slice(start, end);
}

test('Banking Pay batch list hides technical ids and presents one status with UK timing and plain routes', () => {
  const list = sliceBetween('function renderPayBatchListPanel', 'function deriveTimesheetModalInvoicingState');
  assert.match(list, />Type<\/th>/);
  assert.match(list, />Status<\/th>/);
  assert.match(list, />Timing<\/th>/);
  assert.match(list, />Route<\/th>/);
  assert.match(list, />Timesheets<\/th>/);
  assert.doesNotMatch(list, /<th>ID<\/th>/);
  assert.doesNotMatch(list, /<th>Rail<\/th>/);
  assert.match(list, /CSV upload/);
  assert.match(list, /Cashless settlement/);
  assert.match(list, /Revolut/);
  assert.match(list, /Created \$\{enc\(created\)\}/);
  assert.match(list, /Scheduled for \$\{scheduledAtUkLabel\}/);
  assert.doesNotMatch(list, /class="mono">\$\{enc\(id/);
});

test('draft and payment progress use friendly operation-wide or indeterminate progress only', () => {
  const modal = sliceBetween('function openBankingPayOperationProgressModal', 'async function bankingPayOperationGet');
  assert.match(modal, /Still working…/);
  assert.match(modal, /maxMeaningfulPercent/);
  assert.match(modal, /counterMode === 'CUMULATIVE'/);
  assert.match(modal, /counterScope === 'DRAFT_CREATE'/);
  assert.match(modal, /is-indeterminate/);
  assert.doesNotMatch(modal, /data-role="op-total"/);
  assert.doesNotMatch(modal, /data-role="op-chunk"/);
  assert.doesNotMatch(modal, /data-role="op-failed"/);
  assert.doesNotMatch(modal, /Heartbeat:/);
  assert.doesNotMatch(modal, /Resume reason:/);
  assert.doesNotMatch(modal, /Lease:/);
});

test('a failed cancellation start remains visible until status changes or the user refreshes', () => {
  const cancellation = sliceBetween('const bankingPayCancellationProgressState', 'async function loadCompleteBankingPayCancellationProjectionStatus');
  assert.match(cancellation, /errorStatusKey/);
  assert.match(cancellation, /Identity was confirmed, but CloudTMS could not start the cancellation/);
  assert.match(source, /if \(!state\.error \|\| !state\.errorStatusKey \|\| nextStatusKey !== state\.errorStatusKey\)/);
  assert.match(cancellation, /data-banking-pay-cancellation-refresh="1"/);
  assert.doesNotMatch(cancellation, /Retry cancellation preparation/);
});

test('Banking Pay keeps operational diagnostics out of the customer modal and presents a compact create summary', () => {
  const banking = sliceBetween('function renderBankingTab', 'function renderBankingPayTab');
  assert.doesNotMatch(banking, /Test mode: $\{isTestMode \? 'On' : 'Off'\}/);
  assert.doesNotMatch(banking, /<summary[^>]*>Diagnostics/);

  const wizard = sliceBetween('const readyEmptyMessage', 'function deriveBankingAttentionStateFromBatchList');
  assert.match(wizard, /Create payment batch/);
  assert.match(wizard, /Choose Ready to Pay rows, then create a draft/);
  assert.match(source, /const filterSummary = `Scope:/);
  assert.doesNotMatch(wizard, /Create \/ Preview/);
  assert.doesNotMatch(wizard, /Selected current eligible Ready to Pay rows:/);
});

test('Current Payment Status presents cancelled PAYE gross and net and one Umbrella payable amount', () => {
  const panel = sliceBetween('function renderBankingPayStage3StatusPanel', 'function refreshBankingPayStage3SelectedRows');
  assert.match(panel, /Gross\/base/);
  assert.match(panel, /historicalVerb\.toLowerCase/);
  assert.match(panel, /cancelledGrossBaseAmountPence/);
  assert.match(panel, /cancelledPayableAmountPence/);
  assert.match(panel, /cancelledBankAmountPence/);
});
