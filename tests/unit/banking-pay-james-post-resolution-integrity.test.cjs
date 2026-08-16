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
  assert.match(render, /payableGroupLines\.some\(\(line\) => resolvedRateGroupClearIdentity\(line\)/);
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
  assert.match(breakdown, /getLineSectionAmount\(line\)/);
  assert.match(breakdown, /Source pay:/);
  assert.match(breakdown, /Source rate:/);
  assert.match(breakdown, /Target rate:/);
});
