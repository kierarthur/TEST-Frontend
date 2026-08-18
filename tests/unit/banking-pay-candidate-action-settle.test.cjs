const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

function sliceBetween(start, end) {
  const from = mainSource.indexOf(start);
  const to = mainSource.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return mainSource.slice(from, to);
}

test('a settled candidate action adopts its final fragment without reopening the full workbench', () => {
  const source = sliceBetween(
    '    const refreshPayWorkbenchAfterCandidateAction = async ({',
    '    const runWorkbenchCandidateMutation = async ({'
  );

  assert.match(source, /candidateSettleResult = await pollPayWorkbenchCandidateUntilSettled/);
  assert.match(source, /candidateSettleResult\.candidate_preview/);
  assert.match(source, /candidateSettleResult\.full_session_refresh_applied === true/);
  assert.match(source, /if \(!candidateSettled\) \{[\s\S]*?await refreshPayWorkbench/);
  assert.match(source, /full_workbench_refresh_used: fullWorkbenchRefreshUsed/);
  assert.doesNotMatch(
    source,
    /markCandidatePendingLocal\([\s\S]*?\);\s*await safeRerender\(null\);/,
    'the progress poll must own the first workbench repaint'
  );
  assert.doesNotMatch(source, /\n\s*await refreshPayWorkbench\(\{ reason, mode \}\);\s*\n\s*return \{ ok: true/);
});

test('candidate action waits for a newer workbench version before adopting the result', () => {
  const refreshSource = sliceBetween(
    '    const refreshPayWorkbenchAfterCandidateAction = async ({',
    '    const runWorkbenchCandidateMutation = async ({'
  );
  const pollSource = sliceBetween(
    'async function pollPayWorkbenchCandidateUntilSettled(sessionId, candidateId, options = {}) {',
    'async function bankingPayWorkbenchSessionOpen(payload = {}) {'
  );

  assert.match(refreshSource, /currentSessionVersionRaw \+ 1/);
  assert.match(refreshSource, /minimumSessionVersion: candidateMinimumSessionVersion/);
  assert.match(refreshSource, /expectedSessionId: sessionId/);
  assert.match(pollSource, /const minimumCandidateVersionReached = minimumSessionVersion == null/);
  assert.match(pollSource, /progressSessionVersion >= minimumSessionVersion/);
  assert.match(pollSource, /if \(progressLooksReady\(progress\) && !normalized\.isAnyWatchedPending && minimumCandidateVersionReached\)/);
});

test('accepted bank details surface partial provider-setup failure in the friendly UI modal', () => {
  const helperSource = sliceBetween(
    '    const showBankingPayFailureModal = async ({',
    '    const confirmBankingPayAction = async ({'
  );
  const actionSource = sliceBetween(
    "    if (a === 'banking:pay:acceptBankDetails') {",
    "    if (a === 'banking:pay:runBankNameCheck' || a === 'banking:pay:ensurePayeeReadiness') {"
  );

  assert.match(helperSource, /getBankingUiConfirmModal\(\)/);
  assert.match(helperSource, /confirm_label: 'OK'/);
  assert.match(helperSource, /RAIL_PROVIDER_SETUP_FAILED/);
  assert.match(actionSource, /railSetupFailed/);
  assert.match(actionSource, /Bank details accepted — account setup incomplete/);
  assert.match(actionSource, /No payment or draft was created/);
  assert.match(actionSource, /Do not accept the same bank details again/);
  assert.match(actionSource, /userInitiated: true/);
  assert.doesNotMatch(actionSource, /\balert\(/);
  assert.doesNotMatch(actionSource, /window\.confirm\(/);
});

test('candidate summary response avoids the redundant full-session fallback', () => {
  const source = sliceBetween(
    '  const candidatePreviewHasSessionSummary = (candidatePreview) => {',
    '  const guardedSleep = async (ms) => {'
  );

  assert.match(source, /isPlainObject\(cp\.summary\)/);
  assert.match(source, /isPlainObject\(cp\.updated_summary\)/);
  assert.match(source, /isPlainObject\(cp\.session\)/);
});

test('informational bank-check result does not open a nested workbench modal', () => {
  const source = sliceBetween(
    '    const showBankingPayNoticeModal = async ({',
    '    const showBankingPayFailureModal = async ({'
  );

  assert.match(source, /showModalHint\(notice, tone\)/);
  assert.match(source, /document\.getElementById\('modalHint'\)/);
  assert.match(source, /toast\(notice\)/);
  assert.doesNotMatch(source, /getBankingUiConfirmModal/);
  assert.doesNotMatch(source, /await confirmFn/);
});

test('bank-check outcome is restored after the candidate refresh repaint', () => {
  const source = sliceBetween(
    "    if (a === 'banking:pay:runBankNameCheck' || a === 'banking:pay:ensurePayeeReadiness') {",
    "    if (a === 'banking:pay:ensurePayeeMap') {"
  );

  const refreshAt = source.indexOf('await refreshPayWorkbenchAfterCandidateAction({');
  const finalNoticeAt = source.indexOf('await showBankingPayNoticeModal({', refreshAt);
  assert.ok(refreshAt >= 0);
  assert.ok(finalNoticeAt > refreshAt);
});

test('payee-map failure uses the safe backend envelope rather than raw provider details', () => {
  const source = sliceBetween(
    "    if (a === 'banking:pay:ensurePayeeMap') {",
    "    if (a === 'banking:pay:bankNameCheckSetOverride') {"
  );

  assert.match(source, /e\?\.backendPayload/);
  assert.match(source, /e\?\.json/);
  assert.match(source, /errorPayload\?\.message/);
  assert.match(source, /RAIL_PROVIDER_SETUP_FAILED/);
  assert.match(source, /No payment or draft was created/);
  assert.doesNotMatch(source, /rawRailError/);
  assert.doesNotMatch(source, /providerMessage/);
});

test('snooze mutations adopt the settled candidate and only fall back to a full workbench refresh', () => {
  const source = sliceBetween(
    'async function openBankingFinanceSnoozeModal(seed = {}) {',
    'async function openBankingFinanceCaseAuditModal(seed = {}) {'
  );

  assert.match(source, /const refreshAfterMutation = async \(mutationResult = null\) =>/);
  assert.match(source, /pollPayWorkbenchCandidateUntilSettled\(/);
  assert.match(source, /reason: 'BANKING_SNOOZE_MUTATION'/);
  assert.match(source, /if \(!candidateSettled && pd && typeof bankingPayPreview === 'function'\)/);
  assert.match(source, /await refreshAfterMutation\(clearResult\)/);
  assert.match(source, /await refreshAfterMutation\(result\)/);
  assert.match(source, /full_workbench_refresh_used: !candidateSettled/);
});

test('snooze cancellation uses the friendly UI confirmation and no native browser confirmation', () => {
  const source = sliceBetween(
    'async function openBankingFinanceSnoozeModal(seed = {}) {',
    'async function openBankingFinanceCaseAuditModal(seed = {}) {'
  );

  assert.match(source, /openUiConfirmModal\(\{/);
  assert.match(source, /kind: 'banking-finance-snooze-cancel-confirm'/);
  assert.match(source, /okToProceed = confirmation\?\.confirmed === true/);
  assert.doesNotMatch(source, /window\.confirm\('Cancel this snooze\?'\)/);
  assert.match(source, /kind: 'banking-finance-snooze-message'/);
  assert.doesNotMatch(source, /\balert\(/);
  assert.doesNotMatch(source, /window\.confirm\(/);
});
