const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(
  path.resolve(__dirname, '../../js/main.js'),
  'utf8'
);

function sliceBetween(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  assert.ok(start >= 0, startMarker + ' must exist');
  const end = mainSource.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, endMarker + ' must follow ' + startMarker);
  return mainSource.slice(start, end);
}

test('successful selection changes store the returned server progress revision', () => {
  const body = sliceBetween(
    'const applySelectionPayloadSummaryToWizard =',
    'const togglePreviewRowSelection ='
  );

  assert.match(body, /payload\.progress_counter_version/);
  assert.match(body, /workbench\.progress_counter_version = progressCounterVersion/);
  assert.match(body, /decisions\.progress_counter_version = progressCounterVersion/);
});

test('a rejected optimistic selection reloads the canonical page and always repaints', () => {
  const toggleBody = sliceBetween(
    'const togglePreviewRowSelection =',
    'const setPreviewRowsSelection ='
  );
  assert.match(toggleBody, /updatePreviewRowSelectionInLoadedState\(\[rowId\], !wantChecked\)/);
  assert.match(toggleBody, /loadPayWorkbenchPreviewPageForSection\('canonical_preview_lines', 'reload'\)/);

  assert.match(
    mainSource,
    /try \{\s*await togglePreviewRowSelection\(previewRowId, checked\);\s*\} finally \{\s*await safeRerender\(null\);\s*\}/
  );
});

test('Create Draft requires review when the authoritative selected set changed', () => {
  const refreshBody = sliceBetween(
    'const refreshCurrentSelectedPreviewRowsForCreateDraft =',
    'const countEligibleCandidatesForScope ='
  );

  assert.match(refreshBody, /const rawSelectionReviewContext =/);
  assert.match(refreshBody, /const currentRevisionUnavailable =/);
  assert.match(refreshBody, /const reviewedProgressChanged =/);
  assert.match(refreshBody, /reviewedSelectionSetComplete/);
  assert.match(refreshBody, /const remapped = currentRevisionUnavailable \|\| reviewedProgressChanged/);
  assert.match(refreshBody, /WORKBENCH_SELECTION_CHANGED_REVIEW_REQUIRED/);
  assert.match(refreshBody, /operation_started: false/);
  assert.match(refreshBody, /no_operation_started: true/);
  assert.match(refreshBody, /no_batch_created: true/);

  const createBody = sliceBetween(
    'async function bankingPayCreateDraft',
    'function bankingPayHasPollableRailEvidence'
  );
  const refreshCall = createBody.indexOf('refreshCurrentSelectedPreviewRowsForCreateDraft(');
  const failureStop = createBody.indexOf('if (!currentSelectionBeforeSubmit || currentSelectionBeforeSubmit.ok !== true)');
  const draftRequest = createBody.indexOf('/api/banking/pay/batch/create-draft');

  assert.match(createBody, /const createDraftSelectionReviewSnapshot =/);
  assert.match(createBody, /selection_review_snapshot/);
  assert.match(createBody, /expectedSessionVersion,\s*createDraftSelectionReviewSnapshot/);
  assert.match(mainSource, /captured_from_rendered_workbench: true/);

  assert.ok(refreshCall >= 0);
  assert.ok(failureStop > refreshCall, 'selection mismatch must stop after the authoritative refresh');
  assert.ok(draftRequest > failureStop, 'no create request may be sent before the mismatch stop');
});

test('an early shared-session revision change reaches the exact selection recheck', () => {
  const createBody = sliceBetween(
    'async function bankingPayCreateDraft',
    'function bankingPayHasPollableRailEvidence'
  );
  const progressChangedGuard = createBody.indexOf('if (localExpectedProgressCounterVersion && authoritativeProgressCounterVersion && localExpectedProgressCounterVersion !== authoritativeProgressCounterVersion)');
  const deferredLog = createBody.indexOf('INITIAL_PROGRESS_COUNTER_CHANGED_DEFERRED_TO_EXACT_SELECTION_RECHECK');
  const exactSelectionRefresh = createBody.indexOf('const currentSelectionBeforeSubmit = await refreshCurrentSelectedPreviewRowsForCreateDraft(');
  const draftRequest = createBody.indexOf('/api/banking/pay/batch/create-draft');

  assert.ok(progressChangedGuard >= 0, 'the early revision comparison must remain');
  assert.ok(deferredLog > progressChangedGuard, 'revision drift must be explicitly deferred');
  assert.ok(exactSelectionRefresh > deferredLog, 'server truth must be re-read after revision drift');
  assert.ok(draftRequest > exactSelectionRefresh, 'the draft request must remain after the exact selection guard');
  assert.doesNotMatch(
    createBody,
    /return await rejectAuthoritativeCreateDraftReadiness\('INITIAL_PROGRESS_COUNTER_CHANGED'/
  );
});

test('current-page reload keeps the existing page instead of advancing pagination', () => {
  const pageBody = sliceBetween(
    'const loadPayWorkbenchPreviewPageForSection =',
    'const ensurePayWorkbenchUiState ='
  );

  assert.match(pageBody, /reloadCurrentPage = dir === 'reload'/);
  assert.match(pageBody, /targetPage = reloadCurrentPage \? currentPage/);
});
test('selection-review failure retains its specific user-friendly browser message', () => {
  const normalizerBody = sliceBetween(
    'function bankingNormalizeApiError',
    'function bankingPayNormaliseBatchIssueBadge'
  );

  assert.match(normalizerBody, /'WORKBENCH_SELECTION_CHANGED_REVIEW_REQUIRED'/);
  assert.match(normalizerBody, /WORKBENCH_SELECTION_CHANGED_REVIEW_REQUIRED: \{/);
  assert.match(normalizerBody, /title: 'Banking Pay selection changed'/);
  assert.match(normalizerBody, /The latest selection is now shown\. Review it, then click Create Draft again\./);

  const createBody = sliceBetween(
    'async function bankingPayCreateDraft',
    'function bankingPayHasPollableRailEvidence'
  );
  assert.match(createBody, /const selectionReviewFailure = \[/);
  assert.match(createBody, /const friendly = selectionReviewFailure/);
});
test('normalizer behavior preserves the selection-review code and copy', () => {
  const normalizerBody = sliceBetween(
    'function bankingNormalizeApiError',
    'function bankingPayNormaliseBatchIssueBadge'
  );
  const context = { JSON, Array, Number, String, Boolean, Object, Set, Map, WeakSet, Error, RegExp, Math, Date };
  vm.runInNewContext(
    normalizerBody + '\nthis.__normalize = bankingNormalizeApiError;',
    context,
    { filename: 'banking-normalizer.js' }
  );

  const payload = {
    ok: false,
    error_code: 'WORKBENCH_SELECTION_CHANGED_REVIEW_REQUIRED',
    code: 'WORKBENCH_SELECTION_CHANGED_REVIEW_REQUIRED',
    title: 'Banking Pay selection changed',
    message: 'Banking Pay was changed by another user or window. The latest selection is now shown. Review it, then click Create Draft again.',
    operation_started: false,
    no_operation_started: true,
    no_batch_created: true
  };
  const normalized = context.__normalize(payload, payload, {
    action: 'CREATE_DRAFT',
    fallbackCode: 'BANKING_PAY_CREATE_DRAFT_FAILED',
    userInitiated: true,
    showModal: true
  });

  assert.equal(normalized.error_code, 'WORKBENCH_SELECTION_CHANGED_REVIEW_REQUIRED');
  assert.equal(normalized.title, 'Banking Pay selection changed');
  assert.equal(normalized.message, payload.message);
});