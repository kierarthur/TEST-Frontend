const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'js', 'main.js'), 'utf8');

test('Create Draft selection count follows the newest progress revision and fails closed on conflict', () => {
  const start = source.indexOf('const authoritativeSelectedCurrentEligibleReadyRowCount = (() => {');
  const end = source.indexOf('\n  const payeCreateBlocked', start);
  assert.ok(start >= 0 && end > start, 'selection authority resolver must exist');
  const body = source.slice(start, end);
  assert.match(body, /progress_counter_version/);
  assert.match(body, /Math\.max\(\.\.\.versioned\.map/);
  assert.match(body, /counts\.size === 1/);
  assert.match(body, /selectionCountAuthorityConflict/);
  assert.match(body, /unversioned cached zero must never override/);
});

test('Create Draft is synchronously locked before the first asynchronous authority read', () => {
  const start = source.indexOf("if (a === 'banking:pay:createDraft')");
  const end = source.indexOf("if (a === 'banking:pay:toggleTimesheetPreviewGroup')", start);
  assert.ok(start >= 0 && end > start, 'Create Draft handler must exist');
  const body = source.slice(start, end);
  const busyAt = body.indexOf('wiz.createDraftBusy = true;');
  const awaitAt = body.indexOf('await bankingPayCreateDraft');
  assert.ok(busyAt >= 0 && awaitAt > busyAt, 'busy authority must be set before calling the async Draft owner');
  assert.match(body, /draftSubmissionState\.active === true/);
  assert.match(body, /el\.disabled = true/);
  assert.match(body, /aria-busy/);
  assert.match(body, /finally/);
});

test('payment scheduling blocks past UK dates and removes internal Advanced controls', () => {
  const start = source.indexOf('async function openBankingPayExecuteConfirmModal');
  const end = source.indexOf('async function bankingPayBatchExecutePayment', start);
  assert.ok(start >= 0 && end > start, 'execution confirmation modal must exist');
  const body = source.slice(start, end);
  assert.match(body, /attachUkDatePicker\(elDate, \{ minDate: londonTodayIsoLocal\(\) \}\)/);
  assert.match(body, /The scheduled payment date must be today or in the future\./);
  assert.doesNotMatch(body, />Advanced ▸</);
  assert.doesNotMatch(body, /Warning hours JSON/);
});

test('failed Draft creation becomes terminal and clears stale 99 percent progress authority', () => {
  const progressStart = source.indexOf('async function runBankingPayOperationWithProgress');
  const progressEnd = source.indexOf('function renderBankingPayBatchChildModalPaymentIssues', progressStart);
  assert.ok(progressStart >= 0 && progressEnd > progressStart, 'Draft progress observer must exist');
  const progressBody = source.slice(progressStart, progressEnd);
  assert.match(progressBody, /const markTerminalStateVisible = \(operationState\) =>/);
  assert.match(progressBody, /terminal: true/);
  assert.match(progressBody, /backend_execution_continues: false/);
  assert.match(progressBody, /still_running: false/);
  assert.match(progressBody, /modal\.markCompleted\(visibleState\)/);
  assert.match(progressBody, /if \(isTerminal\(current\) \|\| isReview\(current\)/);

  const clearStart = source.indexOf('const clearCreateDraftTransientRefreshState = (failureMessage = \'\') =>');
  const clearEnd = source.indexOf('const failCreateDraftContext = async', clearStart);
  assert.ok(clearStart >= 0 && clearEnd > clearStart, 'failed-Draft transient-state cleanup must exist');
  const clearBody = source.slice(clearStart, clearEnd);
  assert.match(clearBody, /createDraftBusy = false/);
  assert.match(clearBody, /post_create_preview_refresh_failed = false/);
  assert.match(clearBody, /active_draft_create_operation_id = null/);
  assert.match(clearBody, /draft_create_status = null/);
});
