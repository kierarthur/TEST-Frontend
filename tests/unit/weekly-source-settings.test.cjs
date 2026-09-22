const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const settings = require('../../js/weekly-source/settings.js');

const ctx = (clientSettingsState = {}) => ({
  data: { id: '11111111-1111-4111-8111-111111111111' },
  clientSettingsState
});

test('legacy Weekly routes map to the correct narrow source-setting capability', () => {
  assert.deepEqual(settings.legacyCapability(ctx({ weekly_mode: 'NONE' })), {
    eligible: false, source_family: null, authority_mode: null,
    document_mode: null, self_bill_enabled: false
  });
  assert.equal(settings.legacyCapability(ctx({ weekly_mode: 'NHSP' })).authority_mode, 'SOURCE_AUTHORITY');
  assert.equal(settings.legacyCapability(ctx({ weekly_mode: 'NHSP' })).source_family, 'NHSP');
  assert.equal(settings.legacyCapability(ctx({
    weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'CREATE'
  })).authority_mode, 'SOURCE_AUTHORITY');
  const verify = settings.legacyCapability(ctx({
    weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'VERIFY'
  }));
  assert.equal(verify.authority_mode, 'TIMESHEET_AUTHORITY');
  assert.equal(verify.document_mode, 'INVOICE_EVIDENCE_REQUIRED');
  assert.equal(verify.self_bill_enabled, false);
});

test('Timesheet-authority Weekly settings do not expose the secure query workflow', () => {
  const result = settings.normaliseClientPayload({}, ctx({
    weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'VERIFY'
  }));
  assert.equal(result.eligible, true);
  assert.equal(result.capabilities.show_query_settings, false);
  assert.equal(result.capabilities.show_completed_pack, true);
  assert.equal(result.capabilities.show_self_bill_correction, false);
});

test('NHSP never exposes a configurable correction presentation', () => {
  const nhspGroupId = '88888888-8888-4888-8888-888888888888';
  const result = settings.normaliseClientPayload({
    source_groups: [{ id: nhspGroupId, source_family: 'NHSP', active: true }]
  }, ctx({ weekly_mode: 'NHSP' }));
  assert.equal(result.capabilities.show_query_settings, true);
  assert.equal(result.capabilities.show_self_bill_correction, false);
  assert.equal(result.draft.self_bill_correction_presentation, null);
  assert.equal(result.draft.source_group_id, nhspGroupId);
  assert.doesNotMatch(settings.clientCards(result).queries, /weekly_source_group_id|Choose a source group/);
  assert.match(settings.clientCards(result).queries, /Ask candidates about differences/);
});

test('Roster clients retain the source-group picker', () => {
  const result = settings.normaliseClientPayload({
    source_groups: [{ id: '99999999-9999-4999-8999-999999999999', source_family: 'ROSTER', active: true }]
  }, ctx({ weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'CREATE' }));
  assert.match(settings.clientCards(result).queries, /weekly_source_group_id/);
});

test('Global settings offer NHSP on at most one source-group row', () => {
  const html = settings.globalHtml({
    draft: {},
    source_groups: [
      settings.normaliseSourceGroupDraft({ id: '1', source_family: 'NHSP', display_name: 'NHSP', active: true }),
      settings.normaliseSourceGroupDraft({ id: '2', source_family: 'ROSTER', display_name: 'Roster', active: true })
    ]
  });
  assert.equal((html.match(/<option value="NHSP"/g) || []).length, 1);
  assert.equal((html.match(/<option value="ROSTER"/g) || []).length, 2);
});

test('Roster source authority defaults to full reversal and replacement', () => {
  const result = settings.normaliseClientPayload({}, ctx({
    weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'CREATE'
  }));
  assert.equal(result.capabilities.show_self_bill_correction, true);
  assert.equal(result.draft.self_bill_correction_presentation, 'FULL_REVERSAL_REPLACEMENT');
});

test('integration hooks remain outside Banking Pay owners and preserve existing settings saves', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'main.js'), 'utf8');
  const layout = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'record-modal-layout.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  assert.match(html, /weekly-source\/settings\.js/);
  assert.match(layout, /CloudTMSWeeklySourceSettings\?\.mountClient/);
  assert.match(main, /CloudTMSWeeklySourceSettings\?\.saveClient/);
  assert.match(main, /CloudTMSWeeklySourceSettings\?\.saveContract/);
  assert.match(main, /CloudTMSWeeklySourceSettings\?\.saveGlobal/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'weekly-source', 'settings.js'), 'utf8'),
    /banking|workbench|pay_batch|execute_payment/i
  );
});

test('Weekly Source captures Client settings before the legacy form repaints', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/weekly-source/settings.js'), 'utf8');
  assert.match(source, /captureClientDraftBeforeLegacyRepaint/);
  assert.match(source, /addEventListener\?\.\('change', captureClientDraftBeforeLegacyRepaint, true\)/);
  assert.match(source, /CLIENT_BINDINGS\.set\(root, \{ ctx, state:/);
});

test('Weekly Source global controls respect View mode', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../js/weekly-source/settings.js'), 'utf8');
  assert.match(source, /\['edit', 'create'\]\.includes\(frame\.mode\)/);
  assert.match(source, /querySelectorAll\('input,select,button'\)[\s\S]*control\.disabled = true/);
});

test('Global settings save failures use the CloudTMS modal rather than a native alert', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');
  const start = main.indexOf('await window.CloudTMSWeeklySourceSettings?.saveGlobal(modalCtx)');
  const excerpt = main.slice(start, start + 2500);
  assert.match(excerpt, /openUiConfirmModal\(\{[\s\S]*title: 'Settings not saved'/);
  assert.doesNotMatch(excerpt, /alert\(/);
});

test('Contract settings read effective display values but send only editable override fields', () => {
  const client = settings.normaliseClientPayload({
    eligible: true,
    capabilities: { show_rate_settings: true },
    settings: { weekly_rate_classification_method: 'SPLIT_RATE_WINDOWS' }
  }, ctx({ weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'CREATE' }));
  const state = settings.normaliseContractPayload({
    eligible: true,
    contract_id: '22222222-2222-4222-8222-222222222222',
    effective_date: '2026-09-16',
    settings_version: 'fresh-contract-version',
    settings: {
      effective_from: '2026-09-16',
      weekly_rate_classification_method_override: 'WHOLE_SHIFT_START_DAY',
      duration_break_tie_rule_override: null,
      source_fixed_expenses_enabled_override: null,
      source_expense_vat_enabled_override: null,
      candidate_queries_enabled_override: null,
      manager_queries_enabled_override: null,
      manager_query_recipient_override: null,
      completed_pack_copy_enabled_override: null,
      completed_pack_recipient_override: null,
      effective: { weekly_rate_classification_method: 'WHOLE_SHIFT_START_DAY' },
      client_settings: { source_group_id: 'read-only' }
    }
  }, client);

  assert.equal(state.effective.weekly_rate_classification_method, 'WHOLE_SHIFT_START_DAY');
  assert.equal(state.draft.weekly_rate_classification_method_override, 'WHOLE_SHIFT_START_DAY');
  assert.equal(Object.hasOwn(state.draft, 'effective'), false);
  assert.equal(Object.hasOwn(state.draft, 'client_settings'), false);
  assert.deepEqual(Object.keys(state.draft).sort(), [
    'candidate_queries_enabled_override',
    'completed_pack_copy_enabled_override',
    'completed_pack_recipient_override',
    'duration_break_tie_rule_override',
    'effective_from',
    'manager_queries_enabled_override',
    'manager_query_recipient_override',
    'source_expense_vat_enabled_override',
    'source_fixed_expenses_enabled_override',
    'weekly_rate_classification_method_override'
  ]);
});

test('source-group save shape contains expected_version and never sends read-only version', () => {
  const group = settings.normaliseSourceGroupDraft({
    id: '33333333-3333-4333-8333-333333333333',
    code: 'NHSP',
    display_name: 'NHSP',
    source_family: 'NHSP',
    cutoff_weekday: 3,
    cutoff_local_time: '15:00:00',
    nhsp_report_heading_name: 'Arthur Rai Medical Servic',
    active: true,
    version: 7
  });
  assert.equal(group.expected_version, 7);
  assert.equal(group.cutoff_local_time, '15:00');
  assert.equal(Object.hasOwn(group, 'version'), false);
});

test('first Client and Contract weekly-source saves refresh their server version before PUT', async () => {
  const originalFetch = globalThis.authFetch;
  const calls = [];
  globalThis.authFetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url: String(url), method, body: options.body ? JSON.parse(options.body) : null });
    if (method === 'GET' && String(url).includes('/clients/')) {
      return new Response(JSON.stringify({
        eligible: true,
        client_id: '11111111-1111-4111-8111-111111111111',
        settings_version: 'client-cas-v1',
        capabilities: { source_family: 'ROSTER', authority_mode: 'SOURCE_AUTHORITY' },
        settings: {
          effective_from: '2026-09-16', authority_mode: 'SOURCE_AUTHORITY', document_mode: 'CHECK_ONLY',
          self_bill_enabled: true, source_group_id: null
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'GET' && String(url).includes('/contracts/')) {
      return new Response(JSON.stringify({
        eligible: true,
        contract_id: '22222222-2222-4222-8222-222222222222',
        settings_version: 'contract-cas-v1',
        settings: {
          effective_from: '2026-09-16',
          effective: { weekly_rate_classification_method: 'SPLIT_RATE_WINDOWS' }
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, eligible: true, settings_version: 'saved', settings: {} }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const clientCtx = ctx({ weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'CREATE' });
    const clientState = settings.normaliseClientPayload({}, clientCtx);
    clientState.draft.source_group_id = '44444444-4444-4444-8444-444444444444';
    clientState.dirty = true;
    clientCtx[settings.stateKeys.CLIENT_STATE] = clientState;
    await settings.saveClient('11111111-1111-4111-8111-111111111111', clientCtx);
    const clientPut = calls.find((call) => call.method === 'PUT' && call.url.includes('/clients/'));
    assert.equal(clientPut.body.expected_settings_version, 'client-cas-v1');
    assert.equal(clientPut.body.settings.source_group_id, '44444444-4444-4444-8444-444444444444');
    assert.equal(clientPut.body.settings.authority_mode, 'SOURCE_AUTHORITY');

    const contractState = settings.normaliseContractPayload({}, clientCtx[settings.stateKeys.CLIENT_STATE]);
    contractState.draft.weekly_rate_classification_method_override = 'WHOLE_SHIFT_START_DAY';
    contractState.dirty = true;
    clientCtx[settings.stateKeys.CONTRACT_STATE] = contractState;
    await settings.saveContract('22222222-2222-4222-8222-222222222222', clientCtx);
    const contractPut = calls.find((call) => call.method === 'PUT' && call.url.includes('/contracts/'));
    assert.equal(contractPut.body.expected_settings_version, 'contract-cas-v1');
    assert.equal(contractPut.body.settings.effective_from, '2026-09-16');
    assert.equal(contractPut.body.settings.weekly_rate_classification_method_override, 'WHOLE_SHIFT_START_DAY');
    assert.equal(Object.hasOwn(contractPut.body.settings, 'effective'), false);
    assert.equal(Object.hasOwn(contractPut.body.settings, 'client_settings'), false);
  } finally {
    if (originalFetch) globalThis.authFetch = originalFetch;
    else delete globalThis.authFetch;
  }
});

test('global timing edits compare canonical source groups instead of marking every group dirty', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'weekly-source', 'settings.js'), 'utf8');
  assert.match(source, /source_groups_baseline:\s*clone\(sourceGroups\)/);
  assert.match(source, /state\.groups_dirty\s*=\s*JSON\.stringify\(state\.source_groups_baseline \|\| \[\]\) !== JSON\.stringify\(nextGroups\)/);
  assert.doesNotMatch(source, /state\.groups_dirty\s*=\s*true;\s*\n\s*}\s*\n\s*\n\s*function mountGlobal/);
});

test('saving a timing-only edit does not PUT unchanged source groups', async () => {
  const originalFetch = globalThis.authFetch;
  const originalDocument = globalThis.document;
  const calls = [];
  const groupId = '55555555-5555-4555-8555-555555555555';
  const group = settings.normaliseSourceGroupDraft({
    id: groupId,
    code: 'ROSTER_A',
    display_name: 'Roster A',
    source_family: 'ROSTER',
    cutoff_weekday: 3,
    cutoff_local_time: '15:00:00',
    active: true,
    version: 7
  });
  const globalSettings = {
    candidate_reminder_minutes: 360,
    candidate_response_deadline_minutes: 720,
    manager_partial_digest_minutes: 360,
    manager_manual_send_cooldown_minutes: 5,
    candidate_manual_reminder_cooldown_minutes: 60,
    manager_secure_link_days: 7
  };
  const values = {
    weekly_source_candidate_reminder_hours: '7',
    weekly_source_candidate_deadline_hours: '12',
    weekly_source_manager_digest_hours: '6',
    weekly_source_manager_resend_minutes: '5',
    weekly_source_candidate_resend_minutes: '60',
    weekly_source_manager_link_days: '7'
  };
  const groupControls = {
    source_group_id: { value: groupId },
    source_group_display_name: { value: 'Roster A' },
    source_group_family: { value: 'ROSTER' },
    source_group_cutoff_weekday: { value: '3' },
    source_group_cutoff_time: { value: '15:00' },
    source_group_heading: { value: '' },
    source_group_active: { checked: true }
  };
  const controlName = (selector) => selector.match(/\[name="([^"]+)"\]/)?.[1];
  const groupRoot = {
    dataset: { expectedVersion: '7' },
    querySelector: (selector) => groupControls[controlName(selector)] || null
  };
  const mounted = {
    querySelector: (selector) => {
      const name = controlName(selector);
      return Object.hasOwn(values, name) ? { value: values[name] } : null;
    },
    querySelectorAll: (selector) => selector === '[data-source-group-index]' ? [groupRoot] : []
  };
  const globalCtx = {
    [settings.stateKeys.GLOBAL_STATE]: {
      loaded: true,
      settings_version: 3,
      baseline: structuredClone(globalSettings),
      draft: structuredClone(globalSettings),
      source_groups: [structuredClone(group)],
      source_groups_baseline: [structuredClone(group)],
      dirty: false,
      groups_dirty: false
    }
  };

  globalThis.document = { querySelector: () => mounted };
  globalThis.authFetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url: String(url), method, body: options.body ? JSON.parse(options.body) : null });
    if (method === 'GET' && String(url).endsWith('/global')) {
      return new Response(JSON.stringify({ settings_version: 4, settings: { ...globalSettings, candidate_reminder_minutes: 420 } }), { status: 200 });
    }
    if (method === 'GET' && String(url).endsWith('/source-groups')) {
      return new Response(JSON.stringify({ source_groups: [{ ...group, expected_version: undefined, version: 7 }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    await settings.saveGlobal(globalCtx);
    const puts = calls.filter((call) => call.method === 'PUT');
    assert.equal(puts.length, 1);
    assert.equal(puts[0].url.endsWith('/global'), true);
    assert.equal(puts[0].body.expected_settings_version, 3);
    assert.equal(puts[0].body.settings.candidate_reminder_minutes, 420);
    assert.equal(calls.some((call) => call.method === 'PUT' && call.url.endsWith('/source-groups')), false);
  } finally {
    if (originalFetch) globalThis.authFetch = originalFetch;
    else delete globalThis.authFetch;
    if (originalDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  }
});

test('saving a changed source group sends expected_version and no read-only version', async () => {
  const originalFetch = globalThis.authFetch;
  const originalDocument = globalThis.document;
  const calls = [];
  const group = settings.normaliseSourceGroupDraft({
    id: '66666666-6666-4666-8666-666666666666',
    code: 'ROSTER_B',
    display_name: 'Roster B updated',
    source_family: 'ROSTER',
    cutoff_weekday: 4,
    cutoff_local_time: '16:30:00',
    active: true,
    version: 11
  });
  const globalSettings = {
    candidate_reminder_minutes: 360,
    candidate_response_deadline_minutes: 720,
    manager_partial_digest_minutes: 360,
    manager_manual_send_cooldown_minutes: 5,
    candidate_manual_reminder_cooldown_minutes: 60,
    manager_secure_link_days: 7
  };
  const globalCtx = {
    [settings.stateKeys.GLOBAL_STATE]: {
      loaded: true,
      settings_version: 3,
      baseline: structuredClone(globalSettings),
      draft: structuredClone(globalSettings),
      source_groups: [group],
      source_groups_baseline: [{ ...group, display_name: 'Roster B' }],
      dirty: false,
      groups_dirty: true
    }
  };

  globalThis.document = { querySelector: () => null };
  globalThis.authFetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url: String(url), method, body: options.body ? JSON.parse(options.body) : null });
    if (method === 'GET' && String(url).endsWith('/global')) {
      return new Response(JSON.stringify({ settings_version: 3, settings: globalSettings }), { status: 200 });
    }
    if (method === 'GET' && String(url).endsWith('/source-groups')) {
      return new Response(JSON.stringify({ source_groups: [{ ...group, expected_version: undefined, version: 12 }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    await settings.saveGlobal(globalCtx);
    const groupPut = calls.find((call) => call.method === 'PUT' && call.url.endsWith('/source-groups'));
    assert.ok(groupPut);
    assert.equal(groupPut.body.source_group.expected_version, 11);
    assert.equal(Object.hasOwn(groupPut.body.source_group, 'version'), false);
  } finally {
    if (originalFetch) globalThis.authFetch = originalFetch;
    else delete globalThis.authFetch;
    if (originalDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  }
});
