const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../js/main.js'), 'utf8');

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing ${startMarker}`);
  assert.ok(end > start, `missing ${endMarker}`);
  return source.slice(start, end);
}

function stage3Context() {
  const code = slice('const BANKING_PAY_STAGE3_STATUS_ACTIONS', 'async function bankingPayPaymentCorrectionReauth');
  const context = {
    window: { modalCtx: { banking: { pay: { child: { correction: {}, data: { id: 'batch-1' } } } } } },
    globalThis: { crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' } },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    Set, Map, Array, Object, String, Number, Math, Date, Error, AbortController,
    bankingPayPaymentStatusPage: async () => ({}), bankingRerender: async () => {}
  };
  vm.runInNewContext(`${code}\nthis.api = { canonical: bankingPayStage3CanonicalStatusAction, ensure: ensureBankingPayStage3SelectionState, normalise: normaliseBankingPayStage3StatusRow, apply: applyBankingPayStage3StatusPage, selectedActions: bankingPayStage3SelectedActions, build: buildBankingPayStage3Selection };`, context);
  return context.api;
}

test('Stage 3 consumes only server-returned candidate tokens and available actions', () => {
  const api = stage3Context();
  const state = {};
  const row = api.normalise({ candidate_token: 'candidate-1', payment_display_state: 'NOT_PAID', available_actions: ['RELEASE_FAILED_PAYMENT'], active_payment_amount_pence: 1234 }, state);
  assert.equal(row.candidate_token, 'candidate-1');
  assert.deepEqual(Array.from(row.available_actions), ['RELEASE_FAILED_PAYMENT']);
  assert.equal(row.selectable, true);
  const blocked = api.normalise({ candidate_token: 'candidate-2', payment_display_state: 'ACTIVE', available_actions: [], pre_provider_cancel_eligible: true }, state);
  assert.equal(blocked.selectable, false);
});

test('explicit selection emits the exact Stage 2 contract with no filter authority', () => {
  const api = stage3Context();
  const state = { stage3Enabled: true, stage3SnapshotToken: 'snapshot-1', stage3SortKey: 'STATUS', stage3SortDirection: 'ASC' };
  const selection = api.ensure(state);
  selection.explicitCandidateTokens.add('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  selection.explicitCandidateTokens.add('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  selection.tokenActions.set('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ['CANCEL_PAYMENT']);
  selection.tokenActions.set('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ['CANCEL_PAYMENT']);
  const payload = api.build(state, 'CANCEL_PAYMENT');
  assert.equal(payload.command, 'PREPARE');
  assert.equal(payload.context, 'CURRENT_PAYMENT_STATUS');
  assert.equal(payload.contract_version, 1);
  assert.equal(payload.mode, 'EXPLICIT');
  assert.deepEqual(Array.from(payload.explicit_candidate_tokens), ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
  assert.equal(Object.hasOwn(payload, 'filter_json'), false);
});

test('all-matching selection freezes filter, action, snapshot and exclusions', () => {
  const api = stage3Context();
  const state = { stage3Enabled: true, stage3SnapshotToken: 'snapshot-2', stage3Filter: { status: 'NOT_PAID' }, stage3SortKey: 'AMOUNT', stage3SortDirection: 'DESC' };
  const selection = api.ensure(state);
  selection.mode = 'ALL_MATCHING';
  selection.requestedAction = 'RELEASE_FAILED_PAYMENT';
  selection.excludedCandidateTokens.add('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  const payload = api.build(state, 'RELEASE_FAILED_PAYMENT');
  assert.equal(payload.requested_action, 'NO_MONEY_RELEASE');
  assert.equal(payload.filter_json.action, 'RELEASE_FAILED_PAYMENT');
  assert.equal(payload.filter_json.actionable_only, true);
  assert.deepEqual(Array.from(payload.excluded_candidate_tokens), ['cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
  assert.equal(Object.hasOwn(payload, 'explicit_candidate_tokens'), false);
});

test('Stage 3 status panel is selection-first and renders no technical evidence controls', () => {
  const panel = slice('function renderBankingPayStage3StatusPanel', 'function refreshBankingPayStage3SelectedRows');
  assert.match(panel, /Select payments first/);
  assert.match(panel, /data-banking-pay-stage3-action="toggle-all"/);
  assert.match(panel, /data-banking-pay-stage3-action="review"/);
  assert.match(panel, /Previous/);
  assert.match(panel, /Next/);
  assert.doesNotMatch(panel, /Select all visible|Select all matching this issue|Clear selection|View details|Technical details|status signature|provider payload/i);
  assert.doesNotMatch(panel, /type="checkbox" disabled aria-disabled/);
});

test('All loading is sequential, snapshot-bound and capped at 10,000 candidates', () => {
  const loader = slice('async function loadBankingPayStage3StatusPage', 'function bankingPayStage3SelectedActions');
  assert.match(loader, /while \(cursor && rows\.length < 10000 && pageCount < 100\)/);
  assert.match(loader, /snapshot_token/);
  assert.match(loader, /await bankingPayPaymentStatusPage/);
  assert.doesNotMatch(loader, /Promise\.all|candidate.*authFetch|forEach\([^)]*bankingPayPaymentStatusPage/);
});

test('progress modal obeys server-safe action and polling contracts', () => {
  const modal = slice('function renderBankingPayCancellationProgressModal', 'function buildBankingPayCancellationActiveProjection');
  assert.match(modal, /status\.progress_stage/);
  assert.match(modal, /status\.user_title/);
  assert.match(modal, /status\.user_message/);
  assert.match(modal, /status\.candidate_counts/);
  assert.match(modal, /status\.blockers/);
  assert.match(modal, /status\.workbench_refresh/);
  assert.match(modal, /availableActions\.includes\('REAUTHENTICATE'\)/);
  assert.match(modal, /AUTHORISE/);
  assert.match(modal, /REJECT/);
  assert.match(modal, /REAUTHORISE_REMAINING/);
  assert.doesNotMatch(modal, /JSON\.stringify\(status|provider_event_id|plan_hash|selection_hash/);
  const polling = slice('function scheduleBankingPayCancellationProgressPoll', 'async function openBankingPayCancellationProgressModal');
  assert.match(polling, /poll_after_ms/);
  assert.match(polling, /Math\.min\(5000, Math\.max\(1000/);
  assert.match(polling, /state\.abortController/);
});

test('Stage 3 performs one plan request and never loops candidate mutations', () => {
  const handlers = slice('function installBankingPayStage3Handlers', 'function renderBankingPaymentIssuePanel');
  assert.match(handlers, /await bankingPayPaymentCorrectionPlan\(payBatchId, prepared\)/);
  assert.match(handlers, /openBankingPayCancellationProgressModal/);
  assert.doesNotMatch(handlers, /for\s*\([^)]*candidate|forEach\([^)]*(correctionPlan|correctionStart)|Promise\.all/);
  assert.doesNotMatch(handlers, /bankingPayPaymentCorrectionProcess/);
});
