const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

function load(...names) {
  const context = vm.createContext({ window: {}, console, Date, Intl, Object, Set, String });
  names.forEach(name => new vm.Script(
    fs.readFileSync(path.join(root, 'js', name), 'utf8'),
    { filename: name }
  ).runInContext(context));
  return context.window;
}

function projection(code, label, tone, overrides = {}) {
  return {
    current_identity: { row_key: 'row-1', route_family: 'ELECTRONIC' },
    candidate_status: { code, label, tone },
    workflow: null,
    manager_approval: null,
    paper_pack: { state: 'NOT_APPLICABLE' },
    rejections: [],
    diagnostics: [],
    primary_action: null,
    available_actions: [],
    observed_at_utc: '2026-08-13T08:00:00Z',
    ...overrides
  };
}

test('Summary renders only the complete user-approved Candidate Submission catalogue', () => {
  const window = load(
    'candidate-office-ui-policy-v1.js',
    'candidate-office-presenter-v1.js',
    'candidate-office-surface-v1.js'
  );

  const cases = [
    [projection('CREATED', 'wrong', 'danger'), 'Awaiting Candidate Submission'],
    [projection('WORKER_SUBMITTED', 'wrong', 'danger'), 'Candidate Submitted'],
    [projection('AWAITING_MANAGER_APPROVAL', 'wrong', 'success'), 'Awaiting Manager Approval'],
    [projection('MANAGER_APPROVED', 'wrong', 'danger'), 'Manager Approved'],
    [projection('AWAITING_PAPER_RETURN', 'wrong', 'danger', { paper_pack: { state: 'READY' } }), 'QR Awaiting Signed Return'],
    [projection('AWAITING_PAPER_RETURN', 'wrong', 'danger', { paper_pack: { state: 'PREPARING' } }), 'QR Pack Preparing'],
    [projection('READY_TO_FINALISE', 'wrong', 'danger'), 'Finalising Submission'],
    [projection('MANAGER_APPROVED', 'wrong', 'success', { available_actions: [{ code: 'RETRY_FINALISATION', enabled: true }] }), 'Finalisation Needs Attention'],
    [projection('AWAITING_PAPER_RETURN', 'wrong', 'success', { paper_pack: { state: 'FAILED_RETRYABLE' } }), 'QR Pack Needs Attention'],
    [projection('REFUSED', 'wrong', 'success'), 'Refused by Client'],
    [projection('REJECTED', 'wrong', 'success'), 'Rejected by Agency'],
    [projection('CANCELLED', 'wrong', 'success'), 'Candidate Submission Cancelled'],
    [projection('FINALISED', 'wrong', 'danger'), 'Candidate Submission Complete'],
    [projection('FUTURE_UNKNOWN_STATE', 'wrong', 'success'), 'Status unavailable']
  ];
  const rendered = cases.map(([input, expected]) => {
    const view = window.CloudTMSCandidateOfficePresenter.presentCandidateOfficeSummary(input);
    const html = window.CloudTMSCandidateOfficeSurface.renderCandidateSummaryCell(view);
    assert.match(html, new RegExp(`>${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
    assert.doesNotMatch(html, /<button/i);
    return html;
  }).join('');

  assert.doesNotMatch(rendered, /PHONE|Phone|EMAIL|Email/);
  assert.match(rendered, /Refused by Client/);
  assert.doesNotMatch(rendered, /Candidate Refused by Manager|Manager refused/);
});

test('Summary leaves non-Candidate manual records blank', () => {
  const window = load(
    'candidate-office-ui-policy-v1.js',
    'candidate-office-presenter-v1.js',
    'candidate-office-surface-v1.js'
  );
  const input = projection('PENDING_AUTH', 'Pending authorisation', 'warning', {
    current_identity: { row_key: 'row-1', route_family: 'MANUAL_NON_QR' }
  });
  const view = window.CloudTMSCandidateOfficePresenter.presentCandidateOfficeSummary(input);
  assert.equal(view.status, null);
  assert.equal(window.CloudTMSCandidateOfficeSurface.renderCandidateCompactBadges(view), '');
});

test('unknown server status fails closed instead of inventing a lifecycle label', () => {
  const window = load(
    'candidate-office-ui-policy-v1.js',
    'candidate-office-presenter-v1.js',
    'candidate-office-surface-v1.js'
  );
  const view = window.CloudTMSCandidateOfficePresenter.presentCandidateOfficeSummary(
    projection('FUTURE_UNKNOWN_STATE', 'Server supplied text', 'success')
  );
  const html = window.CloudTMSCandidateOfficeSurface.renderCandidateSummaryCell(view);

  assert.match(html, /Status unavailable/);
  assert.doesNotMatch(html, /Server supplied text/);
  assert.doesNotMatch(html, /candidate-office-badge--success/);
});

test('Summary integration queues bounded projection batches and never fetches detail per row', () => {
  const bridge = fs.readFileSync(path.join(root, 'js', 'candidate-office-bridge-v1.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');

  assert.doesNotMatch(main, /mountCandidateStatus\(\)/);
  assert.doesNotMatch(main, /CloudTMSCandidateOfficeBridge\.mountSummaryBadge\(wrap, rowObj\)/);
  assert.equal((main.match(/CloudTMSCandidateOfficeBridge\.mountSummaryBadge\(td, (?:row|r)\)/g) || []).length, 3,
    'full render, patched rows and newly inserted rows must all mount the dedicated Candidate Submission cell');
  assert.match(main, /cols\.splice\(candidateIndex, 0, 'candidate_submission', 'issue_codes'\)/);
  assert.match(main, /label = 'Candidate Submission'/);
  assert.match(main, /c === 'candidate_submission'\s*\? false/);
  assert.match(bridge, /if \(surface === 'SIMPLE_TIMESHEET'\) loadSlot\(slot\);\s*else queueBatchSlot\(slot\)/);
  assert.match(bridge, /let chunk = chunks\.find\(candidate => candidate\.rows\.length < 100 && !candidate\.rowKeys\.has\(row\.row_key\)\)/);
  assert.match(bridge, /chunk = \{ rows: \[\], rowKeys: new Set\(\) \}; chunks\.push\(chunk\)/);
  assert.match(bridge, /fetchOfficeCandidateProjections\(\{ surface, identities: chunk \}\)/);
  assert.match(bridge, /function projectionMatchesRow\(projection, row\)/);
  assert.match(bridge, /row\.expected_row_signature && String\(current\.row_signature \|\| ''\) !== String\(row\.expected_row_signature\)/);
  assert.match(bridge, /if \(projectionMatchesRow\(cached, row\)\)/);
  assert.match(bridge, /cache\.delete\(cacheKey\)/);
});

test('Summary uses the settled existing warning style for authoritative unexpected hours', () => {
  const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  assert.match(main, /rowObj\?\.has_deviation_marker === true/);
  assert.match(main, /unexpectedHours\.className = 'pill pill-warn'/);
  assert.match(main, /unexpectedHours\.textContent = 'Unexpected hours - needs checking'/);
  assert.equal((main.match(/unexpectedHours\.textContent = 'Unexpected hours - needs checking'/g) || []).length, 3,
    'full render, patched rows and newly inserted rows must agree');
});
