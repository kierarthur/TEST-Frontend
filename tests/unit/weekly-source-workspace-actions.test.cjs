const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const actions = require('../../js/weekly-source/workspace-actions.js');
const fixtures = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/weekly-source-workspace-actions-v1.json'), 'utf8'));

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
