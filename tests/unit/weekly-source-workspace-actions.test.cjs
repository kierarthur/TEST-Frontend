const assert = require('node:assert/strict');
const test = require('node:test');

test('query details show actual replies and timestamps without treating delivery as a reply', () => {
  const model = actions.normaliseDetail({ detail: { shifts: [{ day_date: '21 Sep 2026',
    candidate_response: 'My hours are correct', candidate_responded_at: '1 Oct 2026, 10:00',
    manager_response: 'Reported a source correction', manager_responded_at: '1 Oct 2026, 11:00',
    manager_intended_hours: '09:00-16:00 (15 min break)' }] } });
  const html = actions.renderDetail(model);
  for (const value of ['My hours are correct', '1 Oct 2026, 10:00', 'Reported a source correction', '1 Oct 2026, 11:00', '09:00-16:00 (15 min break)']) assert.ok(html.includes(value));
  assert.doesNotMatch(actions.renderDetail(actions.normaliseDetail({ detail: { shifts: [{ day_date: '21 Sep 2026', status: 'Manager informed' }] } })), /Recorded replies/);
});
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const actions = require('../../js/weekly-source/workspace-actions.js');
const fixtures = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/weekly-source-workspace-actions-v1.json'), 'utf8'));

test('signed-Timesheet manager action opens the exact established import review', () => {
  const importId = '11111111-1111-4111-8111-111111111111';
  const previous = global.CloudTmsImportReviewV1;
  let opened = '';
  global.CloudTmsImportReviewV1 = {
    openReview: (id) => { opened = id; return true; },
    openImportsModal: () => { throw new Error('Must not reopen the upload hub'); }
  };
  try {
    actions.handleAction({label:'Email manager',payload:{import_id:importId}});
    assert.equal(opened,importId);
  } finally {
    global.CloudTmsImportReviewV1 = previous;
  }
});

test('Open query detail offers selection only for server-eligible shifts, without authorising acceptance itself', () => {
  const payload={accept_group:{accept_system_hours_action:{enabled:true,payload:{selection:{incident_ids:['allowed']}}}},
    detail:{shifts:[{incident_id:'allowed',day_date:'21 Sep 2026',candidate_hours:'7 hours',system_hours:'7.5 hours'},
      {incident_id:'foreign',day_date:'22 Sep 2026'}]}};
  const html=actions.renderDetail(actions.normaliseDetail(payload));
  assert.match(html,/data-wsa-accept-incident="allowed"/);
  assert.doesNotMatch(html,/data-wsa-accept-incident="foreign"/);
  assert.match(html,/data-wsa-accept-selected disabled>Accept selected system hours/);
  payload.accept_group.accept_system_hours_action.enabled=false;
  assert.doesNotMatch(actions.renderDetail(actions.normaliseDetail(payload)),/data-wsa-accept-/);
});

test('saved rejected upload reasons remain explanatory', () => {
  assert.match(actions._plainMessage('WEEKLY_SOURCE_UPLOAD_DUPLICATE_EXTERNAL_KEY'), /repeats a booking reference/);
  assert.match(actions._plainMessage('WEEKLY_SOURCE_COVERAGE_SHRINK_ACKNOWLEDGEMENT_REQUIRED'), /shorter period/);
  assert.match(actions._plainMessage('WEEKLY_SOURCE_REPORT_SCOPE_NOT_OPEN'), /correction journey/);
});

test('missing-week reminder confirmation identifies the week and source-link errors give usable guidance', () => {
  const html = actions.renderCommandConfirmation({ message: 'Remind missing timesheet',
    context: { candidate: 'Kier Arthur', weeks: '20 Sep 2026' }, confirmation: 'Send reminder', action_label: 'Send reminder' }, {});
  assert.match(html, /Weeks ending/);
  assert.match(html, /20 Sep 2026/);
  assert.match(actions._plainMessage('WEEKLY_SOURCE_CANDIDATE_INACTIVE_OR_MISSING'), /inactive/);
  assert.match(actions._plainMessage('WEEKLY_SOURCE_RECHECK_REPLAY_CONFLICT'), /refresh Queries/);
});

test('source linking opens the existing picker and rechecks the exact saved row', async () => {
  const calls = [];
  const saved = { picker: globalThis.openCandidatePicker, workspace: globalThis.CloudTMSWeeklySourceImportWorkspaceV1 };
  let choose;
  try {
    globalThis.openCandidatePicker = (callback, options) => { choose = callback; calls.push(['picker', options]); };
    globalThis.CloudTMSWeeklySourceImportWorkspaceV1 = {
      issueCommand: async (...args) => calls.push(args), refresh: async () => calls.push(['refresh'])
    };
    actions.handleAction({ label: 'Link candidate', payload: { candidate: 'Source Worker', client: 'Trust',
      recheck_payload: { request_id: 'request', upload_id: 'upload', upload_row_id: 'row' } } });
    assert.equal(typeof choose, 'function');
    await choose({ id: 'chosen-candidate' });
    assert.equal(calls[0][1].context.staffName, 'Source Worker');
    assert.deepEqual(calls[1], ['RECHECK_SOURCE', { request_id: 'request', upload_id: 'upload', upload_row_id: 'row', candidate_id: 'chosen-candidate' }]);
    assert.deepEqual(calls[2], ['refresh']);
  } finally {
    globalThis.openCandidatePicker = saved.picker;
    globalThis.CloudTMSWeeklySourceImportWorkspaceV1 = saved.workspace;
  }
});

test('an unmatched contract provides a create path without pretending it is a tie', () => {
  const model = actions.normaliseContractChooser({ choices: [], recheck_payload: { request_id: 'request' },
    contract_seed: { candidate_id: 'candidate', client_id: 'client' } });
  const html = actions.renderContractChooser(model);
  assert.match(html, /data-wsa-create-contract/);
  assert.match(html, /No contract covers this shift/);
  assert.doesNotMatch(html, /More than one contract/);
});

test('NHSP preview shows the confirmed Trust, report and cutoff without technical details', () => {
  const model = actions.normalisePreview(fixtures.nhspPreview);
  assert.equal(model.ok, true);
  assert.equal(model.report_number, '1741227');
  const html = actions.renderPreview(model, { confirmed: true });
  assert.match(html, /St Mary&#39;s NHS Trust/);
  assert.match(html, /1741227/);
  assert.match(html, /Wed 16 Sep 2026 at 15:00/);
  assert.match(html, /I confirm this is the complete final NHSP backing report/);
  assert.doesNotMatch(html, /source_group_id|report_scope_id|manifest|fingerprint|rounding/i);
});

test('NHSP previously released shifts can be accepted for the shared group without choosing one Trust', () => {
  const model = actions.normalisePreview({
    ok: true,
    file_key: 'weekly-source/test/prefinal.xlsx',
    preview: {
      ok: true,
      profileId: 'NHSP_PREFINAL_RELEASED_V1',
      rows: [{ candidateName: 'Kier Arthur', shiftDate: '2026-09-08', actualTotal: 2.5 }],
      fatalErrors: [],
      warnings: []
    },
    accept_context: {
      file_key: 'weekly-source/test/prefinal.xlsx',
      original_filename: 'previously-released.xlsx',
      source_group_id: '11111111-1111-4111-8111-111111111111',
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      client_id: null,
      report_scope_id: null,
      profile_id: 'NHSP_PREFINAL_RELEASED_V1'
    }
  });

  assert.equal(model.authority_ready, true);
  assert.equal(model.ok, true);
  const html = actions.renderPreview(model, { confirmed: true });
  assert.doesNotMatch(html, /This file cannot be accepted yet/);
  assert.doesNotMatch(html, /data-wsa-accept disabled/);
  const payload = actions.buildUploadAcceptancePayload(model, { confirmed: true });
  assert.equal(Object.hasOwn(payload, 'client_id'), false);
  assert.equal(Object.hasOwn(payload, 'report_scope_id'), false);
  assert.equal(payload.profile_id, 'NHSP_PREFINAL_RELEASED_V1');
});

test('a saved source with an ambiguous earlier shift is not described as a rejected file or blindly retried', () => {
  const model = actions.normalisePreview(fixtures.nhspPreview);
  assert.equal(actions._test.isCandidateComparisonAmbiguity({ message: 'WEEKLY_SOURCE_CANDIDATE_COMPARISON_AMBIGUOUS' }), true);
  assert.equal(actions._test.isCandidateComparisonAmbiguity({ message: 'WEEKLY_SOURCE_UPLOAD_DUPLICATE_EXTERNAL_KEY' }), false);
  const html = actions.renderPreview(model, {
    confirmed: true, failed: true, ambiguous: true,
    error: 'WEEKLY_SOURCE_CANDIDATE_COMPARISON_AMBIGUOUS'
  });
  assert.match(html, /File saved; comparison paused/);
  assert.match(html, /Do not upload it again/);
  assert.match(html, /data-wsa-accept disabled/);
  assert.doesNotMatch(html, /The source file was not accepted|>Try again<|WEEKLY_SOURCE_CANDIDATE_COMPARISON_AMBIGUOUS/);
});

test('Trust-specific and roster files remain fail-closed without their required scope', () => {
  const finalModel = actions.normalisePreview({
    ok: true,
    file_key: 'weekly-source/test/final.xlsx',
    preview: {
      ok: true,
      profileId: 'NHSP_FINAL_BACKING_V1',
      reportNumber: '1741227',
      scope: { trust: "St Mary's NHS Trust" },
      rows: [{ candidateName: 'Kier Arthur', shiftDate: '2026-09-08' }]
    },
    accept_context: {
      file_key: 'weekly-source/test/final.xlsx',
      source_group_id: '11111111-1111-4111-8111-111111111111',
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      profile_id: 'NHSP_FINAL_BACKING_V1',
      cutoff: 'Wed 16 Sep 2026 at 15:00'
    }
  });
  assert.equal(finalModel.ok, false);

  const rosterModel = actions.normalisePreview({
    ok: true,
    file_key: 'weekly-source/test/roster.xlsx',
    preview: {
      ok: true,
      profileId: 'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1',
      rows: [{ candidateName: 'Kier Arthur', shiftDate: '2026-09-08' }]
    },
    accept_context: {
      file_key: 'weekly-source/test/roster.xlsx',
      source_group_id: '11111111-1111-4111-8111-111111111111',
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      profile_id: 'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1'
    }
  });
  assert.equal(rosterModel.ok, false);
});

test('HealthRoster preview requires a second confirmation when coverage shrinks', () => {
  const model = actions.normalisePreview(fixtures.healthRosterPreview);
  const html = actions.renderPreview(model, {
    coverage_start: '2026-06-08', coverage_end: '2026-09-13', confirmed: true, shrink_acknowledged: false
  });
  assert.match(html, /This period is shorter than the previous complete file/);
  assert.match(html, /I confirm this shorter date range is complete/);
  assert.match(html, /data-wsa-accept disabled/);

  const payload = actions.buildUploadAcceptancePayload(model, {
    coverage_start: '2026-06-08', coverage_end: '2026-09-13', shrink_acknowledged: true
  });
  assert.deepEqual(payload.coverage, {
    start_local_date: '2026-06-08', end_local_date: '2026-09-13',
    proof_kind: 'HEALTHROSTER_COMPLETE_EXPORT_ATTESTATION', shrink_acknowledged: true
  });
});

test('contract chooser appears for every qualifying choice with no default selection or money', () => {
  const model = actions.normaliseContractChooser(fixtures.contractChooser);
  assert.equal(model.choices.length, 3);
  const html = actions.renderContractChooser(model);
  assert.equal((html.match(/type="radio"/g) || []).length, 3);
  assert.doesNotMatch(html, /type="radio"[^>]* checked/);
  assert.match(html, /Role \/ band/);
  assert.match(html, /Contract site/);
  assert.match(html, /Pay type/);
  assert.doesNotMatch(html, /£|hourly rate|source charge|calculated charge|source_row_ordinal/i);
});

test('detail renderer whitelists plain Office facts and suppresses technical commentary', () => {
  const model = actions.normaliseDetail({
    detail: {
      candidate: 'Jane Smith', day_date: 'Mon 14 Sep 2026', issue: 'Hours differ',
      message: 'RPC manifest fingerprint failed', internal_id: 'secret-row-id', hourly_rate: '£40.00'
    }
  }, 'View details');
  const html = actions.renderDetail(model);
  assert.match(html, /Jane Smith/);
  assert.match(html, /Hours differ/);
  assert.doesNotMatch(html, /RPC|manifest|fingerprint|internal_id|secret-row-id|hourly_rate|£40/);
});

test('Correct final source requires a newly uploaded file and waits for a replacement-specific preview', () => {
  const model = actions.normaliseCorrectFinal(fixtures.correctFinal);
  const html = actions.renderCorrectFinal(model);
  assert.match(html, /The previous final version will remain in History/);
  assert.match(html, /Upload the replacement source file again/);
  assert.match(html, /Choose file/);
  assert.match(html, /data-wsa-review-correction disabled/);
  assert.doesNotMatch(html, /Choose a saved source|eligible_replacements|This shift is already on an invoice|Hours changed/);
  assert.doesNotMatch(html, /Remove|Exclude|Ignore|fixture-manifest-hash|expected_current_final_revision_id/);
});

test('Correct final source renders the server review and requires reason plus exact confirmation', () => {
  const model = actions.normaliseCorrectFinal(fixtures.correctFinal);
  const preview = actions.normaliseCorrectFinalPreview(fixtures.correctFinalPreview);
  const html = actions.renderCorrectFinal(model, {
    phase: 'reviewed', filename: 'replacement.xlsx', preview, active_tab: 'changes',
    reason: 'Wrong file was finalised.', confirmed: true, busy: false
  });
  assert.match(html, /Changes \(1\)/);
  assert.match(html, /Blocked \(0\)/);
  assert.match(html, /Jane Smith/);
  assert.match(html, /09:00-17:00 \(30 min break\)/);
  assert.match(html, /Apply corrected final source/);
  assert.match(html, /Wrong file was finalised/);
  assert.doesNotMatch(html, /correction_session_id|expected_preview_hash|manifest|fingerprint|RPC/i);
  assert.doesNotMatch(html, /Remove|Exclude|Ignore/);
});

test('Correct final source shows non-removable blockers and never exposes Apply', () => {
  const model = actions.normaliseCorrectFinal(fixtures.correctFinal);
  const preview = actions.normaliseCorrectFinalPreview(fixtures.correctFinalBlockedPreview);
  const html = actions.renderCorrectFinal(model, {
    phase: 'reviewed', filename: 'replacement.xlsx', preview, active_tab: 'blocked',
    reason: '', confirmed: false, busy: false
  });
  assert.match(html, /This correction cannot be applied yet/);
  assert.match(html, /Alex Reed/);
  assert.match(html, /Recheck/);
  assert.doesNotMatch(html, /Apply corrected final source/);
  assert.doesNotMatch(html, /Remove|Exclude|Ignore/);
});

test('No-shifts confirmation is concise and contains no financial or technical language', () => {
  const html = actions.renderCommandConfirmation({
    title: 'No shifts to import',
    message: 'Use this only when this Trust or client has no source shifts for the week shown.',
    confirmation: 'I confirm there are no shifts to import for this week.',
    action_label: 'Confirm no shifts to import',
    context: { trust: "St Mary's NHS Trust", cutoff: 'Wed 16 Sep 2026 at 15:00' }
  }, { confirmed: true });
  assert.match(html, /Confirm no shifts to import/);
  assert.doesNotMatch(html, /£|rate|Workbench|RPC|hash|manifest|rounding/i);
});
