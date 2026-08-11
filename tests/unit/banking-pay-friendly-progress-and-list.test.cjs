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
  assert.doesNotMatch(modal, /This progress covers the complete operation and will not move backwards/);
  assert.doesNotMatch(modal, /data-role="op-total"/);
  assert.doesNotMatch(modal, /data-role="op-chunk"/);
  assert.doesNotMatch(modal, /data-role="op-failed"/);
  assert.doesNotMatch(modal, /Heartbeat:/);
  assert.doesNotMatch(modal, /Resume reason:/);
  assert.doesNotMatch(modal, /Lease:/);
  assert.match(modal, /refreshButton\.style\.display = operationType === 'DRAFT_CREATE' \? 'none' : ''/);
  assert.doesNotMatch(source, /handleViewActiveDraftCreateStatus\(operation, 'Refresh status'/);
});

test('a failed cancellation start remains visible until status changes or the user refreshes', () => {
  const cancellation = sliceBetween('const bankingPayCancellationProgressState', 'async function loadCompleteBankingPayCancellationProjectionStatus');
  assert.match(cancellation, /errorStatusKey/);
  assert.match(cancellation, /Identity was confirmed, but CloudTMS could not start the cancellation/);
  assert.match(source, /if \(!state\.error \|\| !state\.errorStatusKey \|\| nextStatusKey !== state\.errorStatusKey\)/);
  assert.match(cancellation, /data-banking-pay-cancellation-refresh="1"/);
  assert.doesNotMatch(cancellation, /Retry cancellation preparation/);
});

test('cancellation authenticates before the progress modal and uses a calm Workbench-pending state', () => {
  const cancellation = sliceBetween('const bankingPayCancellationProgressState', 'async function loadCompleteBankingPayCancellationProjectionStatus');
  const reauth = sliceBetween('async function openBankingReauthModal', 'async function openPayBatchPasswordConfirmModal');
  assert.match(source, /const requiresCancellationReauth = \['DRAFT_CANCEL', 'CANCEL_PAYMENT'\]/);
  assert.match(source, /if \(requiresCancellationReauth && !draftReauthToken\) return/);
  assert.match(reauth, /const lexicalParentModalCtx =/);
  assert.match(reauth, /const restoredModalCtx = parentModalCtx \|\| lexicalParentModalCtx/);
  assert.match(reauth, /if \(title\) title\.textContent = parentModalTitle/);
  assert.match(cancellation, /Financial cancellation is complete\./);
  assert.match(cancellation, /Banking Pay is updating quietly in the background\./);
  assert.doesNotMatch(cancellation, /aria-label="\$\{workbenchPending \? 'Banking Pay update in progress'/);
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

test('Draft PAYE amounts distinguish missing net input from a real zero bank payment', () => {
  const helper = sliceBetween('function bankingPayCandidateAwaitingPayeNetAmount', 'function normaliseBankingPayStage3StatusRow');
  const statusPanel = sliceBetween('function renderBankingPayStage3StatusPanel', 'function refreshBankingPayStage3SelectedRows');
  const overview = sliceBetween('function renderBankingPayBatchChildModalOverview', 'function renderBankingPayBatchChildModalRemittanceTab');
  assert.match(helper, /latest_paye_net_input/);
  assert.match(helper, /global_missing_explicit_paye_input_count/);
  assert.match(statusPanel, /Awaiting PAYE net amount/);
  assert.match(overview, /PAYE net amount required/);
  assert.match(overview, /Ready to execute/);
  assert.match(overview, /data-banking-pay-awaiting-paye-net/);
});

test('Overview has a prominent whole-candidate tree toggle in addition to nested toggles', () => {
  const overview = sliceBetween('function renderBankingPayBatchChildModalOverview', 'function renderBankingPayBatchChildModalRemittanceTab');
  const handlers = sliceBetween("if (act === 'banking:pay:child:expandAll')", 'const onChange = async');
  assert.match(overview, /data-action="banking:pay:child:toggleCandidateTree"/);
  assert.match(overview, /font-size:21px/);
  assert.match(overview, /expandWholeTree \|\| groupExpansionState\[weekKey\]/);
  assert.match(overview, /expandWholeTree \|\| groupExpansionState\[clientKey\]/);
  assert.match(overview, /expandWholeTree \|\| groupExpansionState\[timesheetKey\]/);
  assert.match(handlers, /toggleCandidateTree/);
  assert.match(handlers, /candidateDetailExpandAllByKey/);
});
