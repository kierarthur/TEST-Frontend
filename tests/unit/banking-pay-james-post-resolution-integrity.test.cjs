const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} must exist`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return source.slice(start, end);
}

test('settled candidate adoption reads every page and merges once atomically', () => {
  const poll = sliceBetween(
    'async function pollPayWorkbenchCandidateUntilSettled(sessionId, candidateId, options = {}) {',
    'async function bankingPayWorkbenchSessionOpen(payload = {}) {'
  );

  assert.match(poll, /while \(candidatePreviewPageCount < 100\)/);
  assert.match(poll, /before_candidate_preview_page_fetch/);
  assert.match(poll, /after_candidate_preview_page_fetch/);
  assert.match(poll, /returnedSessionId !== sessionIdText \|\| returnedCandidateId !== candidateIdText/);
  assert.match(poll, /returnedVersion !== candidatePreviewVersion/);
  assert.match(poll, /returnedVersion < minimumSessionVersion/);
  assert.match(poll, /BANKING_PAY_CANDIDATE_ATOMIC_REFRESH_ROW_IDENTITY_INVALID/);
  assert.match(poll, /candidatePreviewRows\.length > 10000/);
  assert.match(poll, /atomic_candidate_refresh_complete: true/);
  assert.match(poll, /mergePayWorkbenchCandidatePreviewIntoState\(candidatePreview\)/);
  assert.equal((poll.match(/mergePayWorkbenchCandidatePreviewIntoState\(candidatePreview\)/g) || []).length, 1);
});

test('candidate merge treats the complete response as authoritative across all sections', () => {
  const merge = sliceBetween(
    'function mergePayWorkbenchCandidatePreviewIntoState(candidateResponse, state = null) {',
    'async function pollPayWorkbenchCandidateUntilSettled(sessionId, candidateId, options = {}) {'
  );

  assert.match(merge, /candidateRowPayloadProvided/);
  assert.match(merge, /mergeRowsForCandidate\(nextPreview\[key\], incoming, responseCandidateId\)/);
  assert.match(merge, /case_resolution_states = mergeRowsForKey\('case_resolution_states', \['cases_resolutions'\]\)/);
  assert.match(merge, /canonical_preview_lines = mergeRowsForKey\('canonical_preview_lines', \['canonical_preview_lines'\]\)/);
  assert.match(merge, /blocked_for_pay_now = mergeRowsForKey\('blocked_for_pay_now', \['blocked_for_pay'\]\)/);
});

test('Ready grouped timesheets expose one exact cancel action and fail closed on identity conflict', () => {
  const render = sliceBetween(
    'const resolvedRateCancelActionHtml =',
    'const previewActionHtml ='
  ) + sliceBetween(
    'const renderReadyTimesheetGroupedRows =',
    'const renderTimesheetParentRows ='
  );

  assert.match(source, /const resolvedRateGroupClearIdentity =/);
  assert.match(source, /resolved_rate_clear_payload_json/);
  assert.match(render, /resolvedRateClearIdentities\.length !== 1/);
  assert.match(render, /resolvedRateActionLines\.some\(\(line\) => resolvedRateGroupClearIdentity\(line\)/);
  assert.match(render, /const resolvedRateActionCarrier = resolvedRateActionLines\[0\] \|\| null/);
  assert.match(render, /BANKING_PAY_RESOLVED_RATE_GROUP_IDENTITY_CONFLICT/);
  assert.match(render, /data-action="banking:pay:clearCaseResolution"/);
  assert.match(render, />Cancel Resolved Rate<\/button>/);
});

test('expanded Ready timesheet breakdown renders canonical segment details rather than parent placeholders', () => {
  const breakdown = sliceBetween(
    'const buildReadyTimesheetBreakdownEntries =',
    'const renderReadyTimesheetGroupedRows ='
  );

  assert.match(breakdown, /segment\?\.date/);
  assert.match(breakdown, /segment\?\.role/);
  assert.match(breakdown, /segment\?\.band/);
  assert.match(breakdown, /segment\?\.start_utc/);
  assert.match(breakdown, /segment\?\.end_utc/);
  assert.match(breakdown, /segment\?\.break_start/);
  assert.match(breakdown, /findExactOperationalContext/);
  assert.match(breakdown, /contextSegment\?\.role/);
  assert.match(breakdown, /contextSegment\?\.band/);
  assert.match(breakdown, /getLineSectionAmount\(line\)/);
  assert.match(breakdown, /Source pay:/);
  assert.match(breakdown, /Source rate:/);
  assert.match(breakdown, /Target rate:/);
  assert.match(
    breakdown,
    /isSyntheticTimesheetResidualLine\(line\)[\s\S]*isReadyTimesheetDisplayContextLine\(line\)[\s\S]*continue;/
  );
});

test('authoritative row-backed page copies outrank stale duplicate component-cache copies', () => {
  const rendering = sliceBetween(
    'const collectUnionRows =',
    'const hasOwnValue ='
  );

  assert.match(rendering, /const rowAuthorityScore =/);
  assert.match(rendering, /effective_section/);
  assert.match(rendering, /physical_section/);
  assert.match(rendering, /score > existing\.score/);
  assert.match(source, /evictAuthoritativeRowsFromOtherSections/);
});

test('recovery presentation allocates the certified row recovery when legacy components still report zero', () => {
  const presentation = sliceBetween(
    'const getOverpaymentRecoveryPresentation =',
    'const getManualDebtRecoveryPresentation ='
  );

  assert.match(presentation, /selection_recovery_headroom_v1/);
  assert.match(presentation, /recoverable_this_pay_run_ex_vat/);
  assert.match(presentation, /useCertifiedRowRecoveryAllocation/);
  assert.match(presentation, /component\.outstanding \?\? component\.original/);
  assert.match(presentation, /Math\.min\(rawRecoverable, remainingRowRecovery\)/);
});

test('taxable restructure refreshes and atomically adopts the affected Workbench candidate', () => {
  const restructure = sliceBetween(
    'async function openBankingFinanceCaseRestructureModal(seed = {}) {',
    'async function runBulkTimesheetSelectionChunks(action, items, options = {}) {'
  );

  assert.match(restructure, /refreshTaxableRestructureWorkbenchAfterSave/);
  assert.match(restructure, /bankingPayWorkbenchSessionRefresh\(sessionId,\s*\{[\s\S]*TAXABLE_CHANNEL_RESTRUCTURE_APPLIED/);
  assert.match(restructure, /pollPayWorkbenchCandidateUntilSettled\(sessionId, candidateId/);
  assert.match(restructure, /requirePreviewSectionsAfterReady:\s*true/);
  assert.match(restructure, /forceFullSessionRefresh:\s*true/);
  assert.match(restructure, /scheduleTaxableRestructureWorkbenchRefresh\(result\)/);
  assert.match(restructure, /setTimeout\(\(\) => \{[\s\S]*refreshTaxableRestructureWorkbenchAfterSave/);
  assert.match(restructure, /dirty_reason = 'TAXABLE_CHANNEL_RESTRUCTURE_APPLIED'/);
});

test('non-draftable READY parent context is merged back beside allocation children', () => {
  const adoption = sliceBetween(
    'const isReadyToPayDisplayContextRow =',
    'const derivePayeesForWorkbench ='
  );

  assert.match(adoption, /presentationSection !== 'READY_TO_PAY'/);
  assert.match(adoption, /presentationRole !== 'PARENT'/);
  assert.match(adoption, /lineType !== 'TIMESHEET_PAYMENT'/);
  assert.match(adoption, /const contextRows = asArray\(rowUniverse\)\.filter\(isReadyToPayDisplayContextRow\)/);
  assert.match(adoption, /return withDisplayContext\(filtered\)/);
  assert.match(source, /const isCanonicalReadyDisplayRow = \(row\) => isReadyToPayPreviewRow\(row\) \|\| isReadyToPayDisplayContextRow\(row\)/);
  assert.match(source, /const previewStatePageRows = collectRowsFromPageCaches\(wiz\.preview/);
  assert.match(source, /preview\.state\.page\.cache\.preview\.rows/);
  assert.match(source, /const isReadyTimesheetDisplayContextLine =/);
  assert.match(source, /!isReadyTimesheetDisplayContextLine\(line\)/);
  assert.match(source, /asBool\(line\?\.is_excluded_from_allocation\) && !isReadyTimesheetDisplayContextLine\(line\)/);
});
