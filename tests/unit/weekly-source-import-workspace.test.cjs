const assert = require('node:assert/strict');
const test = require('node:test');

const workspace = require('../../js/weekly-source/import-workspace.js');

const GROUP_KEY = `qg_${'1'.repeat(64)}`;
const ASK_PROOF = 'a'.repeat(64);
const MANAGER_PROOF = 'b'.repeat(64);
const WORKSPACE_VERSION = 'c'.repeat(64);
const ACCEPT_PROOF = 'd'.repeat(64);
const INCIDENT_ONE = '66666666-6666-4666-8666-666666666666';

function acceptSystemHoursAction(incidentIds = [INCIDENT_ONE], groupKey = GROUP_KEY, proof = ACCEPT_PROOF) {
  return {
    label: 'Accept system hours', kind: 'COMMAND', command: 'ACCEPT_SYSTEM_HOURS', enabled: true,
    payload: {
      actor_user_id: '71111111-1111-4111-8111-111111111111',
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      projection_publication_id: '55555555-5555-4555-8555-555555555555',
      expected_workspace_version: WORKSPACE_VERSION,
      action: 'ACCEPT_SYSTEM_HOURS',
      selection: {
        mode: 'EXPLICIT', group_keys: [groupKey], excluded_group_keys: [], incident_ids: incidentIds,
        filters: { status: 'UNRESOLVED', candidate: '', issue: 'ALL' },
        sort_key: 'candidate', sort_direction: 'asc', selection_proof: null,
        group_selection_proofs: [{ group_key: groupKey, selection_proof: proof }]
      }
    }
  };
}

function bulkAction(command, proof) {
  return {
    action: command,
    enabled: true,
    eligible_group_count: 1,
    selection_proof: proof,
    request: {
      actor_user_id: 'actor-1', source_cycle_id: 'cycle-1', projection_publication_id: 'publication-1',
      expected_workspace_version: WORKSPACE_VERSION, action: command,
      selection: {
        mode: 'ALL_FILTERED', group_keys: [], excluded_group_keys: [], incident_ids: [],
        filters: { status: 'UNRESOLVED', candidate: '', issue: 'ALL' },
        sort_key: 'candidate', sort_direction: 'asc', selection_proof: proof
      }
    }
  };
}

function bulkActions() {
  return {
    contract: 'WEEKLY_SOURCE_BULK_FILTER_SELECTION_V1', filtered_group_count: 2, selection_complete: true,
    ask_candidates: bulkAction('ASK_CANDIDATES', ASK_PROOF),
    send_manager_now: bulkAction('SEND_MANAGER_NOW', MANAGER_PROOF)
  };
}

test('NHSP upload uses the server-resolved Trust and report scope for acceptance', async () => {
  const originalUpload = globalThis.uploadImportFileToR2;
  const originalFetch = globalThis.authFetch;
  try {
    workspace._session.workspace = fixture({
      profile: { id: 'NHSP_FINAL_BACKING_V1', label: 'NHSP backing report' },
      context: {
        source_group_id: 'group-1', source_cycle_id: 'cycle-1',
        controls: [{ key: 'cutoff', label: 'Cutoff', value: 'Wed 23 Sep 2026 at 15:00' }],
      },
      selected: { source_group_id: 'group-1', source_cycle_id: 'cycle-1' },
    });
    globalThis.uploadImportFileToR2 = async () => ({ fileKey: 'source/test.xlsx', filename: 'test.xlsx' });
    globalThis.authFetch = async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        preview: { ok: true, profileId: 'NHSP_FINAL_BACKING_V1' },
        accept_context: {
          source_group_id: 'group-1', source_cycle_id: 'cycle-1',
          report_scope_id: 'scope-1', client_id: 'client-1', authority_scope_version: 2,
        },
      }),
    });
    const result = await workspace.uploadSource({ name: 'test.xlsx' });
    assert.equal(result.accept_context.report_scope_id, 'scope-1');
    assert.equal(result.accept_context.client_id, 'client-1');
    assert.equal(result.accept_context.authority_scope_version, 2);
    assert.equal(workspace._session.workspace.selected.client_id, 'client-1');
    assert.equal(workspace._session.workspace.selected.report_scope_id, 'scope-1');
    assert.equal(workspace._session.workspace.selected.projection_publication_id, '');
  } finally {
    globalThis.uploadImportFileToR2 = originalUpload;
    globalThis.authFetch = originalFetch;
  }
});

function fixture(overrides = {}) {
  return workspace.normaliseWorkspace({
    contract: workspace.CONTRACT,
    workspace_version: WORKSPACE_VERSION,
    profile: {
      id: 'NHSP_BACKING_REPORT_ACTUAL_V1',
      label: 'NHSP backing report',
      finalise_label: 'Finalise report'
    },
    context: {
      cycle_state: 'Ready for finalisation',
      cycle_tone: 'warning',
      source_group_id: 'group-1',
      source_cycle_id: 'cycle-1',
      projection_publication_id: 'publication-1',
      controls: [
        { key: 'source_group', label: 'Source', value: 'NHSP', options: [{ value: 'group-1', label: 'NHSP' }] },
        { key: 'client', label: 'Trust', value: 'client-1', options: [{ value: 'client-1', label: "St Mary's NHS Trust" }] },
        { key: 'report', label: 'Report number', value: '1741227' },
        { key: 'cutoff', label: 'Cutoff', value: 'Wed 9 Sep 2026 at 15:00' }
      ]
    },
    counts: { queries: 2, blockers: 1, paid_unresolved: 1 },
    imports: {
      total_count: 1,
      rows: [{
        file: 'Backing_report_1741227.xlsx', uploaded: '15 Sep 2026 09:00', rows: '286',
        coverage: '1 Jun–6 Sep 2026', report: '1741227', cutoff: '9 Sep 2026 · 15:00',
        status: { text: 'Ready to review', tone: 'positive' },
        final_source: 'Current', actions: [{ label: 'Review pricing', payload: { upload_id: 'upload-1' } }]
      }]
    },
    queries: {
      total_count: 2,
      bulk_actions: bulkActions(),
      rows: [{
        group_key: GROUP_KEY, candidate: 'Jane Smith', client: "St Mary's NHS Trust", issues: '2',
        candidate_asked: true, manager_informed: false, outreach_eligible: true, expanded: true,
        status: { text: 'Needs Office action', tone: 'danger', subtext: 'Paid - still unresolved', subtone: 'danger' },
        age: 'Paid 8 days ago', actions: ['View details'],
        accept_system_hours_action: acceptSystemHoursAction(),
        children: [{
          incident_id: INCIDENT_ONE, day_date: 'Mon 1 Sep 2026', job_role: 'Staff Nurse',
          candidate_hours: '09:00-18:00 (30 min break)', system_hours: 'Missing or not yet authorised',
          issue: 'Missing or not yet authorised', status: 'Waiting for manager', accept_eligible: true,
          actions: ['View details']
        }]
      }]
    },
    finalise: {
      active_list: 'blocked', source_summary: 'Current final backing report · 286 movements',
      ready: { total_count: 282, rows: [] },
      blocked: { total_count: 1, rows: [{ candidate: 'Elliot James', day_date: 'Sat 6 Sep 2026', problem: 'Charge does not match', actions: ['Open charge details'] }] },
      confirmation_text: "I confirm this is the complete final NHSP backing report for St Mary's NHS Trust, report 1741227, for the cutoff shown.",
      confirmation_required: true, finalise_enabled: false,
      tracker: {
        title: 'Finalisation progress', cycle_label: 'Week ending 13 Sep 2026', complete: false,
        rows: [{ source: 'NHSP', client: "St Mary's NHS Trust", status: { text: 'Still to complete', tone: 'warning' }, actions: [{ label: 'No shifts to import', enabled: false, reason: 'A final report is available.' }] }]
      }
    },
    history: {
      total_count: 1, cycle_filter: 'CURRENT_PAY_CYCLE',
      cycle_options: [{ value: 'CURRENT_PAY_CYCLE', label: 'Current pay cycle' }],
      rows: [{ when: '15 Sep 2026 09:00', source: 'NHSP', event: 'File uploaded', by: 'Office user', detail: 'Backing_report_1741227.xlsx' }]
    },
    ...overrides
  });
}

test('policy-owned tabs use the exact profile label and non-zero counts', () => {
  assert.deepEqual(workspace.tabDescriptors(fixture()).map((tab) => tab.label), [
    'Imports', 'Queries (2)', 'Finalise report (1 blocker)', 'History'
  ]);
});

test('Queries uses sticky-scope header checkboxes and never separate select-all buttons', () => {
  const html = workspace.renderWorkspace(fixture(), 'queries');
  assert.match(html, /data-ws-group-header/);
  assert.match(html, /aria-label="Select all query groups"/);
  assert.match(html, new RegExp(`data-ws-shift-header="${GROUP_KEY}"`));
  assert.match(html, /aria-label="Select all shifts in this group"/);
  assert.doesNotMatch(html, />Select all shifts</);
  assert.doesNotMatch(html, />Unselect all shifts</);
  assert.doesNotMatch(html, />Select all</);
  assert.doesNotMatch(html, />Unselect all</);
});

test('NHSP missing wording and paid unresolved status are visible without a Pay column', () => {
  const html = workspace.renderWorkspace(fixture(), 'queries');
  assert.match(html, /Missing or not yet authorised/);
  assert.match(html, /Paid - still unresolved/);
  assert.match(html, /Paid shifts still need attention/);
  assert.doesNotMatch(html, /<th>Pay<\/th>/);
});

test('Imports preserves Daily as a separate existing journey and contains no implementation jargon', () => {
  const html = workspace.renderWorkspace(fixture(), 'imports');
  assert.match(html, />Daily rota check</);
  assert.match(html, />Upload source file</);
  assert.match(html, /data-ws-sort="report">Report/);
  assert.match(html, /data-ws-sort="cutoff">Cutoff/);
  assert.match(html, />1741227</);
  assert.doesNotMatch(html, /data-ws-sort="coverage">Coverage/);
  assert.doesNotMatch(html, /nhsp_shifts/i);
  assert.doesNotMatch(html, /source rounding applied/i);
  assert.doesNotMatch(html, /pagination|page size|previous page|next page/i);
  assert.match(html, /data-ws-action="Review pricing"/);
  assert.match(html, /&quot;file&quot;:&quot;Backing_report_1741227\.xlsx&quot;/);
  assert.match(html, /&quot;report_number&quot;:&quot;1741227&quot;/);
});

test('workspace errors are always plain English and never expose an RPC response', () => {
  const technical = new Error('RPC weekly_source_office_workspace_v1 failed 400: {"code":"22023","message":"WEEKLY_SOURCE_CYCLE_NOT_FOUND"}');
  technical.code = '';
  const message = workspace._test.friendlyWorkspaceError(technical);
  const html = workspace.renderWorkspace(fixture(), 'imports', { error: message });
  assert.equal(message, 'This source is still being prepared. Recheck in a moment.');
  assert.doesNotMatch(html, /RPC|22023|WEEKLY_SOURCE_CYCLE_NOT_FOUND|weekly_source_office_workspace_v1/);
});

test('the cutoff refusal explains when finalisation is available', () => {
  const technical = new Error('WEEKLY_SOURCE_CUTOFF_NOT_REACHED');
  technical.code = 'WEEKLY_SOURCE_CUTOFF_NOT_REACHED';
  assert.equal(
    workspace._test.friendlyWorkspaceError(technical),
    'This source can be finalised after the cutoff shown above.'
  );
});

test('an unresolved NHSP Trust is shown as a choice rather than a false selection', () => {
  const unresolved = fixture({
    context: {
      cycle_state: 'Before cutoff',
      cycle_tone: 'warning',
      controls: [
        { key: 'source_group', label: 'Source', value: 'group-1', options: [{ value: 'group-1', label: 'NHSP backing report' }] },
        { key: 'client', label: 'Trust', value: '', options: [{ value: 'client-1', label: "St Mary's NHS Trust" }] },
        { key: 'report', label: 'Report number', value: 'Not confirmed' },
      ],
    },
  });
  const html = workspace.renderWorkspace(unresolved, 'finalise');
  assert.match(html, /<option value="" selected disabled>Choose a trust<\/option>/);
  assert.doesNotMatch(html, /value="client-1" selected/);
});

test('Finalisation contains no row-removal checkbox and remains disabled with blockers', () => {
  const html = workspace.renderWorkspace(fixture(), 'finalise');
  assert.match(html, /Ready \(282\)/);
  assert.match(html, /Blocked \(1\)/);
  assert.match(html, /Charge does not match/);
  assert.match(html, /data-ws-finalise disabled/);
  assert.doesNotMatch(html, /data-ws-group-header|data-ws-shift-header/);
  assert.doesNotMatch(html, />Remove|>Exclude|>Ignore/);
});

test('History defaults to the current pay cycle and exposes no technical detail column', () => {
  const html = workspace.renderWorkspace(fixture(), 'history');
  assert.match(html, /Current pay cycle/);
  assert.match(html, /data-ws-sort="detail">Details/);
  assert.doesNotMatch(html, /<th>Technical details<\/th>/i);
});

test('Finalisation tracker is calm and offers no selection controls', () => {
  const html = workspace.renderWorkspace(fixture(), 'finalise');
  assert.match(html, /Finalisation progress/);
  assert.match(html, /Week ending 13 Sep 2026/);
  assert.match(html, /St Mary&#39;s NHS Trust/);
  assert.doesNotMatch(html, /data-ws-group-header|Select all|Unselect all/);
});

test('a durable post-finalisation follow-up uses plain approved-hours wording and one exact action', () => {
  const finalRevisionId = '77777777-7777-4777-8777-777777777777';
  const runId = '88888888-8888-4888-8888-888888888888';
  const taskId = '99999999-9999-4999-8999-999999999999';
  const ws = fixture({
    finalise: {
      active_list: 'ready', ready: { total_count: 1, rows: [] }, blocked: { total_count: 0, rows: [] },
      approved_hours_follow_up: {
        state: 'RECOVERY_REQUIRED',
        title: 'Approved hours update needs checking',
        body: 'The source is finalised. Check the approved-hours update before trying it again.',
        action: {
          label: 'Check approved hours update', command: 'RECOVER_FINALISED_PAY',
          payload: {
            final_revision_id: finalRevisionId, run_id: runId, task_id: taskId,
            expected_task_version: 2, confirm_retry: false
          }
        }
      }
    }
  });
  const html = workspace.renderWorkspace(ws, 'finalise');
  assert.match(html, /Approved hours update needs checking/);
  assert.match(html, /Check approved hours update/);
  assert.match(html, /data-ws-command="RECOVER_FINALISED_PAY"/);
  assert.doesNotMatch(html, /projection|checkpoint|idempotency|Workbench|Banking Pay/i);
});

test('NHSP and HealthRoster finalisation use their locked column contracts', () => {
  const nhsp = workspace.renderWorkspace(fixture({ finalise: {
    active_list: 'ready', ready: { total_count: 1, rows: [{
      candidate: 'A', day_date: 'Mon 1 Sep 2026', actual_hours: '09:00-17:00 (30 min break)',
      movement: 'Positive', commission: '£10.00', total_cost: '£90.00', invoice_charge: '£100.00',
      status: { text: 'Ready', tone: 'positive' }
    }] },
    blocked: { total_count: 0, rows: [] }
  } }), 'finalise');
  for (const label of ['Actual hours','Movement','Commission','Total cost','Invoice charge']) assert.match(nhsp, new RegExp(`>${label}`));
  for (const value of ['09:00-17:00 (30 min break)','Positive','£10.00','£90.00','£100.00']) {
    assert.ok(nhsp.includes(value));
  }

  const healthRoster = workspace.renderWorkspace(fixture({
    profile: { id: 'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1', label: 'HealthRoster Timesheet Export' },
    finalise: { active_list: 'ready', ready: { total_count: 1, rows: [{ candidate: 'A', day_date: 'Mon 1 Sep 2026', system_hours: '09:00-17:00 · 30 min break · 7.5 hours' }] }, blocked: { total_count: 0, rows: [] } }
  }), 'finalise');
  assert.match(healthRoster, />System hours/);
  assert.doesNotMatch(healthRoster, />Commission|>Movement/);

  const healthRosterBlocked = workspace.renderWorkspace(fixture({
    profile: { id: 'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1', label: 'HealthRoster Timesheet Export' },
    finalise: { active_list: 'blocked', ready: { total_count: 0, rows: [] }, blocked: { total_count: 1, rows: [{ candidate: 'A', day_date: 'Mon 1 Sep 2026', system_hours: '09:00-17:00 · 30 min break · 7.5 hours', status: { text: 'Needs correction', tone: 'danger' }, actions: ['Open'] }] } }
  }), 'finalise');
  for (const label of ['Candidate', 'Day/date', 'System hours', 'Status', 'Action']) assert.match(healthRosterBlocked, new RegExp(`>${label}`));
  assert.doesNotMatch(healthRosterBlocked, />Problem|>Commission|>Movement/);
});

test('Imports presents signed-Timesheet authority inside the same calm workspace', () => {
  const html = workspace.renderWorkspace(fixture({ imports: {
    total_count: 1,
    journey: {
      authority_mode: 'TIMESHEET_AUTHORITY',
      title: 'Signed Timesheet decides hours',
      body: 'Timesheet hours are used. The client system is checked so matching references can be added.',
      attention_count: 1,
      attention_rows: [{ row_key: 'authority-comparison-1', candidate: 'Jane Smith', day_date: 'Mon 1 Sep 2026', attention: 'Hours are different', reference: 'Not added', status: { text: 'Needs manager correction', tone: 'warning' }, actions: ['View Timesheet', 'Email manager'] }]
    },
    rows: []
  } }), 'imports');
  assert.match(html, /Signed Timesheet decides hours/);
  assert.match(html, /Timesheet hours are used\. The client system is checked so matching references can be added\./);
  assert.match(html, /Needs attention \(1\)/);
  assert.match(html, /aria-label="Select all visible rows"/);
  assert.match(html, /Hours are different/);
  assert.match(html, /View Timesheet/);
  assert.match(html, /Email manager/);
  assert.doesNotMatch(html, /secure manager response|source authority|non-authoritative/i);
});

test('Reminder command preserves the exact server payload without injecting a source cycle', async () => {
  const priorFetch = globalThis.authFetch;
  const priorApi = globalThis.API;
  let sent;
  globalThis.API = (path) => path;
  globalThis.authFetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  workspace._session.workspace = fixture();
  const payload = { candidate_generation_id: 'candidate-generation-1', projection_publication_id: 'publication-1' };
  await workspace.issueCommand('REMIND_CANDIDATE', payload);
  assert.deepEqual(sent, { action: 'REMIND_CANDIDATE', payload });
  if (priorFetch === undefined) delete globalThis.authFetch; else globalThis.authFetch = priorFetch;
  if (priorApi === undefined) delete globalThis.API; else globalThis.API = priorApi;
});

test('server-owned all-filtered outreach keeps its proof and adds only Office exclusions', () => {
  const queries = fixture().queries;
  const payload = workspace.buildOutreachRequest(queries, {
    mode: 'ALL_FILTERED', ids: new Set(), exclusions: new Set([GROUP_KEY])
  }, 'ASK_CANDIDATES');
  assert.equal(payload.selection.mode, 'ALL_FILTERED');
  assert.deepEqual(payload.selection.group_keys, []);
  assert.deepEqual(payload.selection.excluded_group_keys, [GROUP_KEY]);
  assert.deepEqual(payload.selection.incident_ids, []);
  assert.equal(payload.selection.selection_proof, ASK_PROOF);
  assert.deepEqual(payload.selection.filters, { status: 'UNRESOLVED', candidate: '', issue: 'ALL' });
});

test('manual outreach selection uses only selected server group keys and keeps the server proof', () => {
  const queries = fixture().queries;
  const payload = workspace.buildOutreachRequest(queries, {
    mode: 'EXPLICIT', ids: new Set([GROUP_KEY]), exclusions: new Set()
  }, 'SEND_MANAGER_NOW');
  assert.equal(payload.selection.mode, 'EXPLICIT');
  assert.deepEqual(payload.selection.group_keys, [GROUP_KEY]);
  assert.deepEqual(payload.selection.excluded_group_keys, []);
  assert.deepEqual(payload.selection.incident_ids, []);
  assert.equal(payload.selection.selection_proof, MANAGER_PROOF);
});

test('outreach fails closed when the server filter-selection proof is missing or a group key is not exact', () => {
  const invalidActions = bulkActions();
  delete invalidActions.ask_candidates.selection_proof;
  const queries = workspace.normaliseWorkspace({ queries: { total_count: 1, bulk_actions: invalidActions, rows: [] } }).queries;
  assert.equal(workspace.buildOutreachRequest(queries, { mode: 'ALL_FILTERED', ids: new Set(), exclusions: new Set() }, 'ASK_CANDIDATES'), null);
  assert.equal(workspace.buildOutreachRequest(fixture().queries, { mode: 'EXPLICIT', ids: new Set(['loaded-row-guess']), exclusions: new Set() }, 'SEND_MANAGER_NOW'), null);
});

test('Accept system hours preserves the complete server guard for one selected shift', () => {
  workspace._session.workspace = fixture();
  workspace.clearShiftSelections();
  workspace._session.shiftSelections.set(GROUP_KEY, new Set([INCIDENT_ONE]));
  const payload = workspace._test.combinedAcceptSystemHoursPayload();
  assert.equal(payload.action, 'ACCEPT_SYSTEM_HOURS');
  assert.deepEqual(payload.selection.group_keys, [GROUP_KEY]);
  assert.deepEqual(payload.selection.incident_ids, [INCIDENT_ONE]);
  assert.deepEqual(payload.selection.group_selection_proofs, [
    { group_key: GROUP_KEY, selection_proof: ACCEPT_PROOF }
  ]);
  assert.equal(payload.selection.selection_proof, null);
  assert.equal(payload.expected_workspace_version, WORKSPACE_VERSION);
});

test('Accept system hours combines exact selections across groups without stripping proofs', () => {
  const secondGroup = `qg_${'2'.repeat(64)}`;
  const secondProof = 'e'.repeat(64);
  const secondIncident = '88888888-8888-4888-8888-888888888888';
  const model = fixture();
  model.queries.rows.push({
    group_key: secondGroup,
    accept_system_hours_action: acceptSystemHoursAction([secondIncident], secondGroup, secondProof),
    children: [{ incident_id: secondIncident, accept_eligible: true }]
  });
  workspace._session.workspace = model;
  workspace.clearShiftSelections();
  workspace._session.shiftSelections.set(GROUP_KEY, new Set([INCIDENT_ONE]));
  workspace._session.shiftSelections.set(secondGroup, new Set([secondIncident]));
  const payload = workspace._test.combinedAcceptSystemHoursPayload();
  assert.deepEqual(payload.selection.group_keys, [GROUP_KEY, secondGroup]);
  assert.deepEqual(payload.selection.incident_ids, [INCIDENT_ONE, secondIncident]);
  assert.deepEqual(payload.selection.group_selection_proofs, [
    { group_key: GROUP_KEY, selection_proof: ACCEPT_PROOF },
    { group_key: secondGroup, selection_proof: secondProof }
  ]);
});

test('Accept system hours rejects a stale proof, an added incident, and an empty group selection', () => {
  const invalid = acceptSystemHoursAction();
  invalid.payload.selection.group_selection_proofs[0].selection_proof = 'not-a-proof';
  assert.equal(workspace._test.exactAcceptSystemHoursPayload(invalid), null);

  workspace._session.workspace = fixture();
  workspace.clearShiftSelections();
  workspace._session.shiftSelections.set(GROUP_KEY, new Set(['99999999-9999-4999-8999-999999999999']));
  assert.equal(workspace._test.combinedAcceptSystemHoursPayload(), null);
  workspace.clearShiftSelections();
  workspace._session.shiftSelections.set(GROUP_KEY, new Set());
  assert.equal(workspace._test.combinedAcceptSystemHoursPayload(), null);
});

test('unknown actions are refused instead of appearing in the interface', () => {
  const model = fixture({
    imports: { total_count: 1, rows: [{ file: 'x.xlsx', actions: ['Delete', 'Review'] }] }
  });
  const html = workspace.renderWorkspace(model, 'imports');
  assert.match(html, />Review<\/button>/);
  assert.doesNotMatch(html, />Delete<\/button>/);
});

test('NHSP rate warnings are grouped before cutoff and final acceptance is sealed to visible warning keys', () => {
  const model = workspace.normaliseWorkspace({
    profile: { id: 'NHSP_FINAL_BACKING_V1', finalise_label: 'Finalise report' },
    finalise: {
      ready: { rows: [], total_count: 262 }, blocked: { rows: [], total_count: 0 },
      rate_warnings: {
        contract: 'NHSP_RATE_WARNING_WORKSPACE_V1', phase: 'FINAL_AWAITING_ACCEPTANCE', total_count: 24,
        notice: { title: 'Possible Trust rate card issue', body: '23 shifts have a £0 source charge. Check the Trust rate card in NHSP before accepting.' },
        rows: [
          { warning_key: 'trust-zero', candidate: '23 affected candidates', day_date: 'Multiple shifts', source_charge: '£0.00', warning: 'Possible NHSP rate card issue', accept_eligible: true, detail_rows: [{ candidate: 'Amara Patel', day_date: 'Mon 14 Sep 2026', source_charge: '£0.00', warning: 'Possible NHSP rate card issue' }] },
          { warning_key: 'elliot-mismatch', candidate: 'Elliot James', day_date: 'Sat 6 Sep 2026', source_charge: '£248.00', warning: 'Rate card expired or wrong Contract rate', accept_eligible: true }
        ],
        acceptance: {
          enabled: true, action: 'ACCEPT_NHSP_SOURCE_CHARGES',
          payload: { source_cycle_id: 'cycle-1', projection_publication_id: 'publication-1' },
          selection: { key: 'warning_keys', proof_key: 'selection_proof', proof: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
        }
      }
    }
  });
  const html = workspace.renderWorkspace(model, 'finalise', {
    sort: { finalise: { key: 'candidate', direction: 'asc' } }, rateWarningSelection: new Set(['trust-zero'])
  });
  const acceptance = workspace.buildRateWarningAcceptancePayload(model.finalise.rate_warnings, ['trust-zero', 'not-a-server-warning']);

  assert.match(html, /Possible Trust rate card issue/);
  assert.match(html, /Rate card expired or wrong Contract rate/);
  assert.match(html, /Possible NHSP rate card issue/);
  assert.match(html, /data-ws-rate-warning-header/);
  assert.match(html, /Accept selected source charges/);
  assert.match(html, /I have checked the warnings shown\./);
  assert.doesNotMatch(html, />\s*Select all\s*</i);
  assert.doesNotMatch(html, />\s*Unselect all\s*</i);
  assert.deepEqual(acceptance, {
    action: 'ACCEPT_NHSP_SOURCE_CHARGES',
    payload: {
      source_cycle_id: 'cycle-1', projection_publication_id: 'publication-1',
      warning_keys: ['trust-zero'],
      selection_proof: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  });
});

test('pre-final warning is informational and cannot become final acceptance', () => {
  const warnings = workspace.normaliseRateWarnings({
    contract: 'NHSP_RATE_WARNING_WORKSPACE_V1', phase: 'PREFINAL', total_count: 1,
    rows: [{ warning_key: 'warning-1', candidate: 'Amara Patel', warning: 'Possible NHSP rate card issue', accept_eligible: true }],
    acceptance: { enabled: true, action: 'ACCEPT_NHSP_SOURCE_CHARGES', payload: {}, selection: { key: 'warning_keys', proof_key: 'selection_proof', proof: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }
  }, 'NHSP_FINAL_BACKING_V1');
  assert.equal(workspace.buildRateWarningAcceptancePayload(warnings, ['warning-1']), null);
});

test('a missing or duplicate server warning key fails closed for acceptance', () => {
  const baseline = {
    contract: 'NHSP_RATE_WARNING_WORKSPACE_V1', phase: 'FINAL_AWAITING_ACCEPTANCE',
    rows: [{ warning_key: 'one', warning: 'Possible NHSP rate card issue', accept_eligible: true }],
    acceptance: { enabled: true, action: 'ACCEPT_NHSP_SOURCE_CHARGES', payload: {}, selection: { key: 'warning_keys', proof_key: 'selection_proof', proof: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }
  };
  const missing = workspace.normaliseRateWarnings({ ...baseline, rows: [{ warning: 'Possible NHSP rate card issue', accept_eligible: true }] }, 'NHSP_FINAL_BACKING_V1');
  const duplicate = workspace.normaliseRateWarnings({ ...baseline, rows: [baseline.rows[0], baseline.rows[0]] }, 'NHSP_FINAL_BACKING_V1');
  assert.equal(missing.acceptance, null);
  assert.equal(duplicate.acceptance, null);
});
