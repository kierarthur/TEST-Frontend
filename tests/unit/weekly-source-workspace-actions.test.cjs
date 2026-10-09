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

test('source Contract creation preserves resolved IDs/date and displays the selected Candidate and Client without cache', () => {
  const seed = { candidate_id: 'resolved-candidate', client_id: 'resolved-client', start_date: '2026-09-21' };
  const payload = { candidate: 'Baljit Rai-Baptiste', client: 'Berkshire Healthcare NHS Foundation Trust', contract_seed: seed };
  const model = actions.normaliseContractChooser(payload);
  assert.deepEqual(model.contract_seed, { ...seed, candidate_display: payload.candidate, client_name: payload.client });
  assert.deepEqual(seed, { candidate_id: 'resolved-candidate', client_id: 'resolved-client', start_date: '2026-09-21' });
  assert.equal(actions.normaliseContractChooser({ ...payload, contract_seed: {} }).contract_seed.candidate_id, undefined);
  assert.equal(actions.normaliseContractChooser({ ...payload, contract_seed: { ...seed, client_name: 'Resolved Client' } }).contract_seed.client_name, 'Resolved Client');
  assert.equal(model.contract_seed.rates_json, undefined);
  assert.equal(model.contract_seed.pay_method_snapshot, undefined);
});

test('a pending source-absent retry is not redirected to its own overlap; new work still is', async () => {
  const { runInNewContext } = require('node:vm');
  const editor = require('../../js/weekly-source/protected-shift-editor.js');
  const source = readFileSync(resolve(__dirname, '../../js/weekly-source/workspace-actions.js'), 'utf8');
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const original = { work_date: '2026-09-21', start: '09:00', end: '17:00', break_minutes: 30,
    reason: 'Office confirmed', contract_id: id(4) };
  async function opened(pending) {
    const titles = [], timers = [];
    const root = { module: { exports: {} }, CloudTMSProtectedShiftEditorV1: editor,
      __modalStack: [], document: { querySelector: () => null },
      setTimeout: callback => timers.push(callback),
      CloudTMSWeeklySourceImportWorkspaceV1: { issueCommand: async action => {
        assert.equal(action, 'PROTECTED_EDITOR_CONTEXT');
        return { contract: 'WEEKLY_PROTECTED_EDITOR_V1', allowed: true,
          client_id: id(2), candidate_id: id(3), work_date: original.work_date,
          contracts: [{ id: id(4), label: 'Band 6' }], work_event_id: id(7),
          pending_approval: pending, resume_request: pending ? original : null,
          events: [{ work_event_id: id(7), start: original.start, end: original.end }] };
      } },
      showModal: (title, tabs, render, save, edit, wire, options) => {
        titles.push(title);
        root.__modalStack.push({ kind: options.kind, setTab: () => render() });
        render();
      } };
    runInNewContext(source, root);
    assert.equal(root.module.exports.handleAction({ label: 'Add protected shift',
      payload: { ...original, client_id: id(2), candidate_id: id(3) } }), true);
    await new Promise(resolve => setImmediate(resolve));
    while (timers.length) timers.shift()();
    return titles;
  }
  assert.deepEqual(await opened(true), ['Protect shift pay']);
  assert.deepEqual(await opened(false), ['Protect shift pay', 'Shift hours overlap']);
});

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

test('a known Local publisher refusal is not described as an uncertain or accepted save', () => {
  for (const value of ['WEEKLY_PROTECTED_LOCAL_PUBLICATION_OWNER_NOT_READY',
    'RPC weekly_exceptional_pay_complete_local_v1 failed 400: WEEKLY_PROTECTED_LOCAL_PUBLICATION_OWNER_NOT_READY']) {
    const message = actions._plainMessage(value);
    assert.match(message, /pay change was not saved/);
    assert.match(message, /Existing approved pay is unchanged/);
    assert.match(message, /request has been kept for retry/);
    assert.doesNotMatch(message, /could not be confirmed|RPC|WEEKLY_|saved.and.waiting/i);
  }
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

test('source linking explains that a selected inactive Candidate must be reactivated', async () => {
  const saved = { picker: globalThis.openCandidatePicker, workspace: globalThis.CloudTMSWeeklySourceImportWorkspaceV1 };
  let choose;
  try {
    globalThis.openCandidatePicker = (callback) => { choose = callback; };
    globalThis.CloudTMSWeeklySourceImportWorkspaceV1 = {
      issueCommand: () => { throw new Error('An inactive candidate must not be sent to recheck.'); },
      refresh: () => { throw new Error('An inactive candidate must not refresh the workspace.'); }
    };
    actions.handleAction({ label: 'Link candidate', payload: {
      candidate: 'Source Worker', recheck_payload: { request_id: 'request', upload_id: 'upload', upload_row_id: 'row' }
    } });
    await assert.rejects(choose({ id: 'inactive-candidate', candidate: { active: false } }),
      /currently inactive\. Reactivate their Candidate record before linking this shift/);
    assert.match(actions._plainMessage('RPC failed: {"message":"WEEKLY_SOURCE_CANDIDATE_INACTIVE_OR_MISSING"}'),
      /reactivate their Candidate record/);
  } finally {
    globalThis.openCandidatePicker = saved.picker;
    globalThis.CloudTMSWeeklySourceImportWorkspaceV1 = saved.workspace;
  }
});

test('saved source recheck retry reuses its exact request and refreshes without closing the parent modal', async () => {
  const calls=[];
  const previous=globalThis.CloudTMSWeeklySourceImportWorkspaceV1;
  const payload={request_id:'saved-request',candidate_id:'saved-candidate',upload_row_id:'saved-row'};
  try {
    globalThis.CloudTMSWeeklySourceImportWorkspaceV1={
      issueCommand:async (...args)=>calls.push(args),refresh:async()=>calls.push(['refresh'])
    };
    await actions.handleAction({label:'Retry recheck',command:'RECHECK_SOURCE',payload});
    assert.deepEqual(calls,[['RECHECK_SOURCE',payload],['refresh']]);
  } finally {globalThis.CloudTMSWeeklySourceImportWorkspaceV1=previous;}
});

test('saved linking selection with failed recheck refreshes retained work and explains the partial outcome', async () => {
  const saved = { picker: globalThis.openCandidatePicker, workspace: globalThis.CloudTMSWeeklySourceImportWorkspaceV1 };
  let choose, refreshed = 0;
  try {
    globalThis.openCandidatePicker = callback => { choose = callback; };
    globalThis.CloudTMSWeeklySourceImportWorkspaceV1 = {
      issueCommand: async () => { throw Object.assign(new Error('Internal failure'), { code: 'WEEKLY_SOURCE_RECHECK_INCOMPLETE' }); },
      refresh: async () => { refreshed++; }
    };
    actions.handleAction({ label: 'Link candidate', payload: { recheck_payload: { request_id: 'same-request' } } });
    await assert.rejects(choose({ id: 'active' }), /selection was saved.*recheck did not finish/i);
    assert.equal(refreshed, 1);
    assert.match(actions._plainMessage('WEEKLY_SOURCE_RECHECK_INCOMPLETE'), /retry the saved recheck/i);
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
  assert.equal((html.match(/type="checkbox"/g) || []).length, 3);
  assert.doesNotMatch(html, /type="radio"|type="checkbox"[^>]* checked/);
  assert.match(html, /Role \/ band/);
  assert.match(html, /Contract site/);
  assert.match(html, /Pay type/);
  assert.doesNotMatch(html, /£|hourly rate|source charge|calculated charge|source_row_ordinal/i);
});

test('contract chooser tick boxes switch exclusively, untick, and gate creation without rerendering', async () => {
  const { runInNewContext } = require('node:vm');
  const source = readFileSync(resolve(__dirname, '../../js/weekly-source/workspace-actions.js'), 'utf8');
  const payload = { ...fixtures.contractChooser,
    contract_seed: { candidate_id: 'candidate', client_id: 'client' },
    recheck_payload: { request_id: 'request' } };
  const inputs = payload.choices.map(choice => ({ value: choice.contract_id, checked: false,
    handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; } }));
  const controls = Object.fromEntries(['close', 'create-contract', 'use-contract'].map(key => [key,
    { disabled: key === 'use-contract', handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; } }]));
  const host = { dataset: {}, querySelector: selector => controls[selector.match(/data-wsa-(.+)\]/)?.[1]],
    querySelectorAll: selector => selector.startsWith('input') ? inputs : [] };
  const timers = [], creates = [], commands = [];
  let rerenders = 0, rejectCommand;
  const root = { module: { exports: {} }, document: { querySelector: () => host },
    setTimeout: callback => timers.push(callback), __modalStack: [],
    openContract: (seed, options) => creates.push({ seed, options }),
    CloudTMSWeeklySourceImportWorkspaceV1: { issueCommand: (command, data) => {
      commands.push({ command, data }); return new Promise((resolve, reject) => { rejectCommand = reject; });
    } },
    showModal: (title, tabs, render, save, edit, wire, options) => {
      root.__modalStack.push({ kind: options.kind, setTab: () => { rerenders++; return render(); } });
      render(); wire();
    } };
  runInNewContext(source, root);
  assert.equal(root.module.exports.handleAction({ label: 'Choose contract', payload }), true);
  while (timers.length) timers.shift()();
  const change = (index, checked) => { inputs[index].checked = checked; inputs[index].handlers.change(); };
  controls['create-contract'].handlers.click();
  assert.equal(creates.length, 1);
  change(0, true);
  assert.deepEqual(inputs.map(input => input.checked), [true, false, false]);
  assert.equal(controls['create-contract'].disabled, true);
  assert.equal(controls['use-contract'].disabled, false);
  controls['create-contract'].handlers.click();
  assert.equal(creates.length, 1, 'handler also rejects creation when selected');
  change(1, true);
  assert.deepEqual(inputs.map(input => input.checked), [false, true, false]);
  change(1, false);
  assert.deepEqual(inputs.map(input => input.checked), [false, false, false]);
  assert.equal(controls['create-contract'].disabled, false);
  assert.equal(controls['use-contract'].disabled, true);
  await controls['use-contract'].handlers.click();
  assert.equal(commands.length, 0, 'nothing is submitted without a selection');
  assert.equal(rerenders, 0, 'selection changes preserve the layout');
  change(2, true);
  const pending = controls['use-contract'].handlers.click();
  await controls['use-contract'].handlers.click();
  controls['create-contract'].handlers.click();
  assert.equal(commands.length, 1, 'double submission is blocked');
  assert.equal(creates.length, 1);
  assert.equal(commands[0].command, 'RECHECK_SOURCE');
  assert.equal(commands[0].data.contract_id, 'contract-3');
  assert.equal(commands[0].data.request_id, 'request');
  rejectCommand(new Error('Fixture rejection'));
  await pending;
  const selected = actions.renderContractChooser(actions.normaliseContractChooser(payload), { selected: 'contract-2' });
  assert.equal((selected.match(/type="checkbox"[^>]* checked/g) || []).length, 1);
  assert.match(selected, /data-wsa-create-contract disabled/);
  assert.doesNotMatch(selected, /data-wsa-use-contract disabled/);
  const busy = actions.renderContractChooser(actions.normaliseContractChooser(payload), { selected: 'contract-2', busy: true });
  assert.equal((busy.match(/type="checkbox"[^>]* disabled/g) || []).length, 3);
  assert.match(busy, /data-wsa-create-contract disabled/);
  assert.match(busy, /data-wsa-use-contract disabled/);
  const empty = actions.renderContractChooser(actions.normaliseContractChooser({ ...payload, choices: [] }));
  assert.doesNotMatch(empty, /data-wsa-create-contract disabled/);
  assert.match(empty, /data-wsa-use-contract disabled/);
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
