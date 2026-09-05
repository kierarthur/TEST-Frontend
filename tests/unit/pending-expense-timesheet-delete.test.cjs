const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing ${start}`);
  assert.ok(to > from, `missing ${end}`);
  return source.slice(from, to);
}

test('friendly delete modal gives the exact pending-expense consequence before confirmation', () => {
  const modal = section(
    'const pendingExpenseClaimCount = Number(freshDpX?.pending_expense_claim_count || 0);',
    '// OK-only info modal (utility child)'
  );
  assert.match(modal, /Pending expense claim/);
  assert.match(modal, /There is a pending expense claim which has not yet been approved by a manager\. If you delete the Timesheet the pending expense claim will be cancelled\. Do you want to continue\?/);
  assert.match(modal, /Delete Timesheet and cancel pending expense\?/);
  assert.match(modal, /Delete Timesheet and cancel expense/);
  assert.match(modal, /role="alert"/);
  assert.match(modal, /pendingExpenseWarningHtml.*buildDeleteTableHtml\(dpItems\)/s);
});

test('cancel leaves the delete handler before any permanent mutation', () => {
  const modal = section(
    'const pendingExpenseClaimCount = Number(freshDpX?.pending_expense_claim_count || 0);',
    '// OK-only info modal (utility child)'
  );
  assert.match(modal, /const confirmRes = await openUiConfirmModal/);
  assert.match(modal, /if \(!confirmRes \|\| !confirmRes\.confirmed\) return;/);
  assert.doesNotMatch(modal, /deleteTimesheetPermanent\(/);
});

test('the confirmed pending-expense digest must match the second preview', () => {
  const caller = section(
    'await deleteTimesheetPermanent(tsIdX, {',
    'await showOkInfoModal('
  );
  const deletion = section(
    'async function deleteTimesheetPermanent(timesheetId, opts = {})',
    'async function ensureSimpleTimesheetLifecycleHydrated'
  );
  assert.match(caller, /expected_pending_expense_context_sha256:\s*freshDpX\?\.expected_pending_expense_context_sha256 \|\| freshDpX\?\.context_sha256/);
  assert.match(deletion, /const pendingExpenseContextSha256/);
  assert.match(deletion, /const confirmedPendingExpenseContextSha256/);
  assert.match(deletion, /confirmedPendingExpenseContextSha256 !== pendingExpenseContextSha256/);
  assert.match(deletion, /The pending expense claim changed after the warning was shown/);
  assert.match(deletion, /expected_pending_expense_context_sha256:\s*pendingExpenseContextSha256/);
});

test('all existing permanent Timesheet removal types retain support', () => {
  const deletion = section(
    'async function deleteTimesheetPermanent(timesheetId, opts = {})',
    'async function ensureSimpleTimesheetLifecycleHydrated'
  );
  for (const kind of [
    'STANDARD_DELETE',
    'DAILY_ABANDONED_RECEIPT_DELETE',
    'WEEKLY_CHAIN_DELETE_PARENT',
    'WEEKLY_MANUAL_ADJUSTMENT_DELETE'
  ]) {
    assert.match(deletion, new RegExp(kind));
  }
});

test('a direct fallback delete also warns about pending expense cancellation', () => {
  const deletion = section(
    'async function deleteTimesheetPermanent(timesheetId, opts = {})',
    'async function ensureSimpleTimesheetLifecycleHydrated'
  );
  assert.match(deletion, /const pendingExpenseWarning =/);
  assert.match(deletion, /pendingExpenseClaimCount === 1/);
  assert.match(deletion, /await confirmAction\(deletionSummary\(preview\)\)/);
});

test('a fresh eligible delete preview overrides an older summary permission hint', () => {
  const footer = section(
    'function getCanonicalTimesheetFooterState(mc, frameMode)',
    '// ✅ Canonical timesheet refresh helper'
  );
  assert.match(
    footer,
    /const backendCanDelete = \(isPlannedWeek && plannedContractWeekAuthorityComplete\)[\s\S]*safeRealTimesheetDeletePreview[\s\S]*\? true[\s\S]*readLifecycleFalseWins\('can_delete', 'canDelete'\)/
  );
  assert.match(
    footer,
    /const canonicalCanDelete = !!\([\s\S]*lifecycleAuthoritySatisfied[\s\S]*!isArchived[\s\S]*backendCanDelete === true[\s\S]*localCanDelete/
  );
});

test('submitted Candidate Timesheets keep Delete visible but route it to rejection first', () => {
  const footer = section(
    'function getCanonicalTimesheetFooterState(mc, frameMode)',
    '// ✅ Canonical timesheet refresh helper'
  );
  const handler = section(
    '// ── Delete Timesheet ──',
    '// OK-only info modal (utility child)'
  );
  assert.match(footer, /const dpCandidateRejectionRequired = dp\?\.candidate_submission_rejection_required === true/);
  assert.match(footer, /\(dpEligible === true \|\| dpCandidateRejectionRequired\)/);
  assert.match(handler, /title: 'Reject before deleting'/);
  assert.match(handler, /confirmLabel: 'Reject Candidate Submission'/);
  assert.match(handler, /actionCode: 'REJECT_CANDIDATE_SUBMISSION'/);
  assert.match(handler, /Rejecting the Candidate Submission will also reject the linked pending expense claim at the same time/);
});

test('the ordinary rejection form warns when a linked expense will be rejected too', () => {
  const modal = fs.readFileSync(path.resolve(__dirname, '../../js/candidate-office-modal-v1.js'), 'utf8');
  const bridge = fs.readFileSync(path.resolve(__dirname, '../../js/candidate-office-bridge-v1.js'), 'utf8');
  assert.match(modal, /linked_pending_expense_claim_count/);
  assert.match(modal, /It will be rejected at the same time/);
  assert.match(bridge, /async function runVisibleAction/);
  assert.match(bridge, /runVisibleAction/);
});
