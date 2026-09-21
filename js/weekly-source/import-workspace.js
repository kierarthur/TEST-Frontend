(function initialiseWeeklySourceImportWorkspace(root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof window === 'object' && root === window && !root.CloudTMSWeeklySourceImportWorkspaceV1) {
    Object.defineProperty(root, 'CloudTMSWeeklySourceImportWorkspaceV1', {
      configurable: false, enumerable: true, writable: false, value: api
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildWeeklySourceImportWorkspace(root) {
  'use strict';

  const CONTRACT = 'WEEKLY_SOURCE_IMPORT_WORKSPACE_V1';
  const ENDPOINTS = Object.freeze({
    workspace: '/api/weekly-source/v1/workspace',
    preview: '/api/weekly-source/v1/uploads/preview',
    accept: '/api/weekly-source/v1/uploads/accept',
    command: '/api/weekly-source/v1/commands'
  });
  const TABS = Object.freeze(['imports', 'queries', 'finalise', 'history']);
  const CYCLE_STATES = new Set(['Before cutoff', 'Ready for finalisation', 'Finalised', 'Correction in progress']);
  const FINALISE_LABELS = Object.freeze({
    NHSP_FINAL_BACKING_V1: 'Finalise report',
    NHSP_BACKING_REPORT_ACTUAL_V1: 'Finalise report',
    HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1: 'Finalise source',
    HEALTHROSTER_WEEKLY_EXPLICIT_ACTUAL_V1: 'Finalise source',
    HEALTHROSTER_TIMESHEET_ACTUAL_V1: 'Finalise source',
    HEALTHROSTER_TIMESHEET_ACTUAL_LAYOUT_A_V1: 'Finalise source',
    HEALTHROSTER_TIMESHEET_ACTUAL_LAYOUT_B_V1: 'Finalise source',
    ROSTER_WEEKLY_SUMMARY_ACTUAL_V1: 'Finalise week'
  });
  const ACTIONS = Object.freeze({
    imports: new Set(['Review', 'Review pricing', 'View', 'View final source', 'Correct final source', 'View Timesheet', 'Email manager']),
    queries: new Set(['Open', 'View details', 'Remind candidate']),
    shifts: new Set(['Accept system hours', 'View details']),
    finalise: new Set(['Link candidate', 'Link client', 'Choose contract', 'Create contract', 'Create contract for this band', 'Review overlapping shift', 'Open Banking Pay', 'Upload corrected source', 'Open charge details', 'Review source details', 'View query', 'Protect pay', 'View details']),
    tracker: new Set(['No shifts to import', 'View'])
  });
  const TONES = new Set(['neutral', 'info', 'warning', 'positive', 'danger']);
  // This is deliberately a presentation contract, not a charge calculator.
  // The Weekly Source service has already classified every line and sealed the
  // acceptance binding.  Office can select only the server-provided warning
  // keys, and returns that exact binding with the selected keys.  In
  // particular, source or Contract money never enters this browser contract.
  const RATE_WARNING_CONTRACT = 'NHSP_RATE_WARNING_WORKSPACE_V1';
  const RATE_WARNING_PHASES = new Set(['PREFINAL', 'FINAL_AWAITING_ACCEPTANCE', 'READY']);
  const RATE_WARNING_ACTION = 'ACCEPT_NHSP_SOURCE_CHARGES';
  const MUTATING_ACTIONS = new Set([
    'Review', 'Review pricing', 'Correct final source', 'Remind candidate', 'Accept system hours',
    'Link candidate', 'Link client', 'Choose contract', 'Create contract', 'Create contract for this band',
    'Review overlapping shift', 'Upload corrected source', 'Protect pay', 'No shifts to import'
  ]);
  const asText = (value) => String(value == null ? '' : value).trim();
  const asArray = (value) => Array.isArray(value) ? value : [];
  const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const integer = (value) => Number.isInteger(Number(value)) ? Math.max(0, Number(value)) : 0;
  const escapeHtml = (value) => String(value == null ? '' : value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const tone = (value, fallback = 'neutral') => TONES.has(asText(value).toLowerCase()) ? asText(value).toLowerCase() : fallback;
  const safeKey = (value) => asText(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'row';

  function normaliseStatus(value) {
    const raw = typeof value === 'string' ? { text: value } : asObject(value);
    return { text: asText(raw.text) || '—', tone: tone(raw.tone), subtext: asText(raw.subtext), subtone: tone(raw.subtone) };
  }

  function normalisePage(value) {
    const raw = asObject(value);
    return {
      rows: asArray(raw.rows), total_count: integer(raw.total_count), next_cursor: asText(raw.next_cursor),
      has_more: raw.has_more === true, record_version: asText(raw.record_version), stale: raw.stale === true
    };
  }

  function normaliseControls(value) {
    return asArray(value).slice(0, 5).map((entry, index) => {
      const raw = asObject(entry);
      const options = asArray(raw.options).map((option) => ({ value: asText(option?.value), label: asText(option?.label) })).filter((option) => option.value && option.label);
      return { key: asText(raw.key) || `context_${index + 1}`, label: asText(raw.label) || 'Context', value: asText(raw.value), options };
    });
  }

  function normaliseFinalisationTracker(value) {
    const raw = asObject(value);
    return {
      title: asText(raw.title) || 'Finalisation progress',
      cycle_label: asText(raw.cycle_label),
      complete: raw.complete === true,
      rows: asArray(raw.rows).map((entry, index) => {
        const row = asObject(entry);
        return {
          row_key: asText(row.row_key) || `tracker-${index + 1}`,
          source: asText(row.source),
          client: asText(row.client || row.trust),
          status: normaliseStatus(row.status),
          detail: asText(row.detail),
          actions: normaliseActions(row.actions, ACTIONS.tracker)
        };
      })
    };
  }

  function normaliseApprovedHoursFollowUp(value) {
    const raw = asObject(value);
    const action = asObject(raw.action);
    const command = asText(action.command).toUpperCase();
    return {
      state: asText(raw.state).toUpperCase(),
      title: asText(raw.title),
      body: asText(raw.body),
      action: action.label && ['FINALISE_WEEK', 'RECOVER_FINALISED_PAY'].includes(command)
        ? { label: asText(action.label), command, payload: asObject(action.payload) }
        : null
    };
  }

  function normaliseBulkOutreachAction(value, command) {
    const raw = asObject(value);
    const request = asObject(raw.request);
    const selection = asObject(request.selection);
    const proof = asText(raw.selection_proof);
    const list = (entry) => asArray(entry).map(asText).filter(Boolean);
    const valid = asText(raw.action).toUpperCase() === command
      && asText(request.action).toUpperCase() === command
      && [request.actor_user_id, request.source_cycle_id, request.projection_publication_id, request.expected_workspace_version].every((entry) => asText(entry))
      && /^[0-9a-f]{64}$/.test(proof)
      && asText(selection.selection_proof) === proof
      && asText(selection.mode).toUpperCase() === 'ALL_FILTERED'
      && list(selection.group_keys).length === 0
      && list(selection.excluded_group_keys).length === 0
      && list(selection.incident_ids).length === 0
      && ['asc', 'desc'].includes(asText(selection.sort_direction).toLowerCase())
      && !!asText(selection.sort_key)
      && Object.keys(asObject(selection.filters)).every((key) => ['status', 'candidate', 'issue'].includes(key));
    if (!valid) return null;
    return {
      action: command,
      enabled: raw.enabled === true,
      eligible_group_count: integer(raw.eligible_group_count),
      selection_proof: proof,
      request: {
        ...request,
        selection: {
          ...selection,
          mode: 'ALL_FILTERED',
          group_keys: [],
          excluded_group_keys: [],
          incident_ids: [],
          filters: { ...asObject(selection.filters) },
          sort_key: asText(selection.sort_key),
          sort_direction: asText(selection.sort_direction).toLowerCase(),
          selection_proof: proof
        }
      }
    };
  }

  function normaliseBulkActions(value) {
    const raw = asObject(value);
    if (asText(raw.contract) !== 'WEEKLY_SOURCE_BULK_FILTER_SELECTION_V1' || raw.selection_complete !== true) {
      return { contract: '', filtered_group_count: 0, selection_complete: false, ask_candidates: null, send_manager_now: null };
    }
    return {
      contract: 'WEEKLY_SOURCE_BULK_FILTER_SELECTION_V1',
      filtered_group_count: integer(raw.filtered_group_count),
      selection_complete: true,
      ask_candidates: normaliseBulkOutreachAction(raw.ask_candidates, 'ASK_CANDIDATES'),
      send_manager_now: normaliseBulkOutreachAction(raw.send_manager_now, 'SEND_MANAGER_NOW')
    };
  }

  function normaliseRateWarningRow(value) {
    const raw = asObject(value);
    const key = asText(raw.warning_key || raw.row_key || raw.source_line_key);
    const detailRows = asArray(raw.detail_rows).slice(0, 100).map((entry) => {
      const detail = asObject(entry);
      return {
        candidate: asText(detail.candidate), day_date: asText(detail.day_date),
        source_charge: asText(detail.source_charge), warning: asText(detail.warning)
      };
    }).filter((detail) => detail.candidate || detail.day_date || detail.warning);
    return {
      // A client-generated fallback key would turn an unbound warning into an
      // acceptance candidate, so a missing key is intentionally not rendered
      // as selectable (and disables the whole acceptance request below).
      warning_key: key,
      candidate: asText(raw.candidate), day_date: asText(raw.day_date),
      source_charge: asText(raw.source_charge), warning: asText(raw.warning),
      warning_tone: tone(raw.warning_tone || raw.tone, 'warning'),
      action_label: asText(raw.action_label) || (detailRows.length ? 'View affected shifts' : 'Review rate warning'),
      accept_eligible: raw.accept_eligible === true,
      detail_rows: detailRows
    };
  }

  function normaliseRateWarningAcceptance(value) {
    const raw = asObject(value);
    const selection = asObject(raw.selection);
    const action = asText(raw.action).toUpperCase();
    const selectionKey = asText(selection.key);
    const proofKey = asText(selection.proof_key);
    const proof = asText(selection.proof).toLowerCase();
    const valid = raw.enabled === true
      && action === RATE_WARNING_ACTION
      && /^[a-z][a-z0-9_]{0,63}$/.test(selectionKey)
      && /^[a-z][a-z0-9_]{0,63}$/.test(proofKey)
      && /^[0-9a-f]{64}$/.test(proof)
      && Object.keys(asObject(raw.payload)).every((key) => /^[a-z][a-z0-9_]{0,63}$/.test(key));
    return valid ? {
      action, payload: { ...asObject(raw.payload) },
      selection: { key: selectionKey, proof_key: proofKey, proof }
    } : null;
  }

  function normaliseRateWarnings(value, profileId) {
    const raw = asObject(value);
    const phase = asText(raw.phase).toUpperCase();
    // No generic Weekly route receives the NHSP rate-card presentation.  A
    // malformed or absent projection is simply unavailable rather than being
    // inferred from a numeric field in a row.
    if (!/^NHSP_/.test(profileId) || asText(raw.contract) !== RATE_WARNING_CONTRACT || !RATE_WARNING_PHASES.has(phase)) {
      return { available: false, phase: '', rows: [], total_count: 0, accepted_count: 0, ready_count: 0, hard_blocker_count: 0, notice: null, acceptance: null };
    }
    const rawRows = asArray(raw.rows);
    const rows = rawRows.map(normaliseRateWarningRow).filter((row) => !!row.warning_key);
    const boundRows = rows.length === rawRows.length && new Set(rows.map((row) => row.warning_key)).size === rows.length;
    const notice = asObject(raw.notice);
    return {
      available: true, phase, rows,
      total_count: integer(raw.total_count || rows.length),
      accepted_count: integer(raw.accepted_count), ready_count: integer(raw.ready_count),
      hard_blocker_count: integer(raw.hard_blocker_count),
      notice: (asText(notice.title) || asText(notice.body)) ? { title: asText(notice.title), body: asText(notice.body), tone: tone(notice.tone, 'warning') } : null,
      acceptance: boundRows ? normaliseRateWarningAcceptance(raw.acceptance) : null
    };
  }

  function normaliseWorkspace(payload) {
    const source = asObject(payload?.workspace || payload);
    const profile = asObject(source.profile);
    const profileId = asText(profile.id || source.profile_id || source.source_profile_kind);
    const context = asObject(source.context);
    const counts = asObject(source.counts);
    const cycleState = asText(context.cycle_state || source.cycle_state);
    const finalise = asObject(source.finalise);
    const queries = asObject(source.queries);
    const imports = asObject(source.imports);
    const journey = asObject(imports.journey);
    return {
      contract: asText(source.contract) || CONTRACT,
      workspace_version: asText(source.workspace_version || source.record_version),
      profile: {
        id: profileId, label: asText(profile.label || source.source_label) || 'Weekly source',
        finalise_label: asText(profile.finalise_label) || FINALISE_LABELS[profileId] || 'Finalise week'
      },
      context: {
        subtitle: asText(context.subtitle || source.subtitle),
        cycle_state: CYCLE_STATES.has(cycleState) ? cycleState : (cycleState || 'Before cutoff'),
        cycle_tone: tone(context.cycle_tone, cycleState === 'Finalised' ? 'positive' : 'warning'),
        controls: normaliseControls(context.controls)
      },
      selected: {
        source_group_id: asText(source.selected?.source_group_id || context.source_group_id),
        source_cycle_id: asText(source.selected?.source_cycle_id || context.source_cycle_id),
        client_id: asText(source.selected?.client_id || context.client_id),
        report_scope_id: asText(source.selected?.report_scope_id || context.report_scope_id),
        projection_publication_id: asText(source.selected?.projection_publication_id || context.projection_publication_id)
      },
      counts: { queries: integer(counts.queries), blockers: integer(counts.blockers), paid_unresolved: integer(counts.paid_unresolved) },
      imports: {
        ...normalisePage(imports),
        journey: {
          authority_mode: asText(journey.authority_mode).toUpperCase(),
          title: asText(journey.title), body: asText(journey.body),
          attention_count: integer(journey.attention_count),
          attention_rows: asArray(journey.attention_rows)
        }
      },
      queries: { ...normalisePage(queries), bulk_actions: normaliseBulkActions(queries.bulk_actions) },
      finalise: {
        ...normalisePage(finalise), ready: normalisePage(finalise.ready), blocked: normalisePage(finalise.blocked),
        active_list: asText(finalise.active_list).toLowerCase() === 'ready' ? 'ready' : 'blocked',
        confirmation_text: asText(finalise.confirmation_text), confirmation_required: finalise.confirmation_required !== false,
        finalise_enabled: finalise.finalise_enabled === true, finalise_payload: asObject(finalise.finalise_payload),
        source_summary: asText(finalise.source_summary),
        rate_warnings: normaliseRateWarnings(finalise.rate_warnings, profileId),
        tracker: normaliseFinalisationTracker(finalise.tracker || source.finalisation_tracker),
        approved_hours_follow_up: normaliseApprovedHoursFollowUp(finalise.approved_hours_follow_up)
      },
      history: {
        ...normalisePage(source.history), cycle_filter: asText(source.history?.cycle_filter) || 'CURRENT_PAY_CYCLE',
        cycle_options: asArray(source.history?.cycle_options).map((entry) => ({ value: asText(entry?.value), label: asText(entry?.label) })).filter((entry) => entry.value && entry.label)
      },
      notices: asArray(source.notices).map((entry) => ({ tone: tone(entry?.tone, 'warning'), title: asText(entry?.title), body: asText(entry?.body) })).filter((entry) => entry.title || entry.body)
    };
  }

  function emptyWorkspace() {
    return normaliseWorkspace({ profile: {}, context: {}, imports: {}, queries: {}, finalise: { ready: {}, blocked: {} }, history: {} });
  }

  function tabDescriptors(workspace) {
    const ws = workspace || emptyWorkspace();
    return [
      { key: 'imports', label: 'Imports' },
      { key: 'queries', label: `Queries${ws.counts.queries ? ` (${ws.counts.queries})` : ''}` },
      { key: 'finalise', label: `${ws.profile.finalise_label}${ws.counts.blockers ? ` (${ws.counts.blockers} blocker${ws.counts.blockers === 1 ? '' : 's'})` : ''}` },
      { key: 'history', label: 'History' }
    ];
  }

  function normaliseActions(value, allowlist) {
    return asArray(Array.isArray(value) ? value : value ? [value] : []).map((entry) => {
      const raw = typeof entry === 'string' ? { label: entry } : asObject(entry);
      const label = asText(raw.label);
      return allowlist.has(label) ? {
        label,
        enabled: raw.enabled !== false,
        payload: asObject(raw.payload),
        context: asObject(raw.context),
        reason: asText(raw.reason),
        kind: asText(raw.kind).toUpperCase(),
        command: asText(raw.command).toUpperCase()
      } : null;
    }).filter(Boolean);
  }

  function renderActions(actions, stale = false, scopeKey = '') {
    return actions.map((action, index) => {
      const mutation = !!action.command || action.kind === 'MUTATION' || MUTATING_ACTIONS.has(action.label);
      const enabled = action.enabled && !(stale && mutation);
      const reason = stale && mutation ? 'This information has changed. Recheck before continuing.' : action.reason;
      const reasonId = reason ? safeKey(`${scopeKey || 'action'}-${action.label}-${index + 1}-reason`) : '';
      return `<button type="button" class="btn btn-outline ws-row-action" data-ws-action="${escapeHtml(action.label)}" data-ws-kind="${escapeHtml(action.kind)}" data-ws-command="${escapeHtml(action.command)}" data-ws-payload="${escapeHtml(JSON.stringify(action.payload))}" data-ws-context="${escapeHtml(JSON.stringify(action.context))}"${enabled ? '' : ' disabled'}${reason ? ` title="${escapeHtml(reason)}" aria-describedby="${escapeHtml(reasonId)}"` : ''}>${escapeHtml(action.label)}</button>${reason ? `<span id="${escapeHtml(reasonId)}" class="sr-only">${escapeHtml(reason)}</span>` : ''}`;
    }).join('');
  }

  function renderStatus(value) {
    const status = normaliseStatus(value);
    return `<span class="ws-status ws-status--${escapeHtml(status.tone)}">${escapeHtml(status.text)}</span>${status.subtext ? `<span class="ws-status-sub ws-status-sub--${escapeHtml(status.subtone)}">${escapeHtml(status.subtext)}</span>` : ''}`;
  }

  function withFallbackDetail(actions, detail) {
    return actions.map((action) => {
      if (!['Open', 'View details', 'Open charge details', 'Review source details', 'View query'].includes(action.label)) return action;
      if (Object.keys(asObject(action.payload?.detail || action.payload?.details)).length) return action;
      return { ...action, payload: { ...action.payload, detail } };
    });
  }

  function renderSortHeader(label, key, sortState = {}) {
    const active = asText(sortState.key) === key;
    const direction = active && asText(sortState.direction).toLowerCase() === 'desc' ? 'descending' : active ? 'ascending' : 'none';
    const arrow = active ? (direction === 'descending' ? ' ↓' : ' ↑') : '';
    return `<th aria-sort="${direction}"><button type="button" data-ws-sort="${escapeHtml(key)}">${escapeHtml(label)}<span aria-hidden="true">${arrow}</span></button></th>`;
  }

  function renderMobileSort(fields, sortState = {}) {
    const direction = asText(sortState.direction).toLowerCase() === 'desc' ? 'desc' : 'asc';
    return `<div class="ws-mobile-sort" aria-label="Sort results"><label>Sort by<select data-ws-mobile-sort>${fields.map(([label, key]) => `<option value="${escapeHtml(key)}"${sortState.key === key ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label><label>Order<select data-ws-mobile-direction><option value="asc"${direction === 'asc' ? ' selected' : ''}>Ascending</option><option value="desc"${direction === 'desc' ? ' selected' : ''}>Descending</option></select></label></div>`;
  }

  function renderContext(workspace) {
    const fields = workspace.context.controls.map((control) => {
      const value = control.options.length
        ? `<select data-ws-context="${escapeHtml(control.key)}" aria-label="${escapeHtml(control.label)}">${control.options.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === control.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>`
        : `<span class="ws-context-value">${escapeHtml(control.value || '—')}</span>`;
      return `<div class="ws-context-item"><span class="ws-context-label">${escapeHtml(control.label)}</span>${value}</div>`;
    }).join('');
    return `<div class="ws-context-bar" aria-label="Weekly source context">${fields}<span class="ws-status ws-status--${escapeHtml(workspace.context.cycle_tone)}">${escapeHtml(workspace.context.cycle_state)}</span></div>`;
  }

  function renderImports(workspace, state) {
    const journey = workspace.imports.journey || {};
    const attentionRows = asArray(journey.attention_rows).map((rowValue) => {
      const row = asObject(rowValue);
      const actions = normaliseActions(row.actions, ACTIONS.imports);
      return `<tr><td><input type="checkbox" data-ws-import-attention value="${escapeHtml(asText(row.row_key))}" aria-label="Select ${escapeHtml(asText(row.candidate) || 'row')}"></td><td data-label="Candidate">${escapeHtml(asText(row.candidate) || '—')}</td><td data-label="Day/date">${escapeHtml(asText(row.day_date) || '—')}</td><td data-label="What needs attention">${escapeHtml(asText(row.attention) || '—')}</td><td data-label="Reference">${escapeHtml(asText(row.reference) || '—')}</td><td data-label="Status">${renderStatus(row.status)}</td><td data-label="Action" class="ws-actions">${renderActions(actions, false, asText(row.row_key))}</td></tr>`;
    }).join('');
    const journeyPanel = journey.title ? `<section class="ws-import-journey" data-ws-import-journey="${escapeHtml(journey.authority_mode)}"><div class="ws-import-journey__heading"><div><span>Journey</span><strong>${escapeHtml(journey.title)}</strong></div>${journey.attention_count ? `<span class="ws-status ws-status--warning">${journey.attention_count} need attention</span>` : '<span class="ws-status ws-status--positive">Up to date</span>'}</div>${journey.body ? `<p>${escapeHtml(journey.body)}</p>` : ''}${journey.authority_mode === 'TIMESHEET_AUTHORITY' ? `<div class="ws-inner-tabs" role="tablist"><button type="button" role="tab" aria-selected="true">Needs attention (${journey.attention_count})</button><button type="button" role="tab" aria-selected="false">Ready</button><button type="button" role="tab" aria-selected="false">History</button></div><div class="ws-inner-scroll"><table class="grid mini ws-inner-grid"><thead><tr><th><input type="checkbox" data-ws-import-attention-header aria-label="Select all visible rows"></th><th>Candidate</th><th>Day/date</th><th>What needs attention</th><th>Reference</th><th>Status</th><th>Action</th></tr></thead><tbody>${attentionRows || '<tr><td colspan="7" class="ws-empty">No Timesheet checks need attention.</td></tr>'}</tbody></table></div><div class="ws-import-journey__actions"><span data-ws-import-attention-count>0 selected</span><button type="button" class="btn primary" data-ws-import-email-manager disabled>Email manager</button></div>` : ''}</section>` : '';
    const rows = workspace.imports.rows.map((rowValue) => {
      const row = asObject(rowValue);
      return `<tr><td data-label="File">${escapeHtml(asText(row.file) || '—')}</td><td data-label="Uploaded">${escapeHtml(asText(row.uploaded) || '—')}</td><td data-label="Rows">${escapeHtml(asText(row.rows) || '0')}</td><td data-label="Coverage">${escapeHtml(asText(row.coverage) || '—')}</td><td data-label="Status">${renderStatus(row.status)}</td><td data-label="Final source">${escapeHtml(asText(row.final_source) || '—')}</td><td data-label="Actions" class="ws-actions">${renderActions(normaliseActions(row.actions, ACTIONS.imports), workspace.imports.stale, asText(row.row_key || row.file))}</td></tr>`;
    }).join('');
    const sort = state.sort?.imports || {};
    const sortable = [['File','file'],['Uploaded','uploaded'],['Rows','rows'],['Coverage','coverage'],['Status','status'],['Final source','final_source']];
    const stale = workspace.imports.stale ? '<div class="ws-notice ws-notice--warning" role="status"><span>This information has changed. Recheck before continuing.</span></div>' : '';
    return `${stale}${journeyPanel}<div class="ws-toolbar"><button type="button" class="btn primary" data-ws-upload${workspace.imports.stale ? ' disabled title="Recheck before uploading another source file."' : ''}>Upload source file</button><button type="button" class="btn btn-outline" data-ws-recheck>Recheck</button><button type="button" class="btn btn-outline" data-ws-daily>Daily rota check</button><input type="file" data-ws-upload-input hidden accept=".xlsx,.xls,.csv,.htm,.html"><input type="file" data-ws-daily-input hidden accept=".xlsx,.xls,.csv"></div>${renderMobileSort(sortable, sort)}<div class="ws-scroll" data-ws-scroll><table class="grid mini ws-grid"><thead><tr>${sortable.map(([label,key]) => renderSortHeader(label,key,sort)).join('')}<th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="ws-empty">Nothing matches the current filters.</td></tr>'}</tbody></table><div data-ws-sentinel></div></div><div class="ws-sticky-footer"><span>${workspace.imports.total_count} source file${workspace.imports.total_count === 1 ? '' : 's'}</span></div>`;
  }

  function renderTick(value, yesLabel, noLabel) {
    return value === true ? `<span class="ws-tick" aria-label="${escapeHtml(yesLabel)}">✓</span>` : `<span class="ws-blank" aria-label="${escapeHtml(noLabel)}"></span>`;
  }

  function exactAcceptSystemHoursPayload(payloadValue) {
    const envelope = asObject(payloadValue);
    const nested = asObject(envelope.payload);
    const payload = Object.keys(nested).length ? nested : envelope;
    const selection = asObject(payload.selection);
    const list = (value) => asArray(value).map(asText).filter(Boolean);
    const groupKeys = list(selection.group_keys);
    const excludedGroupKeys = list(selection.excluded_group_keys);
    const incidentIds = list(selection.incident_ids);
    const filters = asObject(selection.filters);
    const filterKeys = Object.keys(filters);
    const proofs = asArray(selection.group_selection_proofs).map((value) => {
      const proof = asObject(value);
      return { group_key: asText(proof.group_key), selection_proof: asText(proof.selection_proof).toLowerCase() };
    });
    const unique = (values) => new Set(values).size === values.length;
    const groupKeyValid = (value) => /^qg_[0-9a-f]{64}$/.test(value);
    const hashValid = (value) => /^[0-9a-f]{64}$/.test(value);
    if (asText(payload.action).toUpperCase() !== 'ACCEPT_SYSTEM_HOURS'
      || asText(selection.mode).toUpperCase() !== 'EXPLICIT'
      || ![payload.actor_user_id, payload.source_cycle_id, payload.projection_publication_id].every((value) => asText(value))
      || !hashValid(asText(payload.expected_workspace_version).toLowerCase())
      || !groupKeys.length || !incidentIds.length || excludedGroupKeys.length
      || !unique(groupKeys) || !unique(incidentIds)
      || groupKeys.some((value) => !groupKeyValid(value))
      || filterKeys.some((key) => !['status', 'candidate', 'issue'].includes(key) || typeof filters[key] !== 'string')
      || !['asc', 'desc'].includes(asText(selection.sort_direction).toLowerCase())
      || !asText(selection.sort_key)
      || selection.selection_proof != null
      || proofs.length !== groupKeys.length || !unique(proofs.map((proof) => proof.group_key))
      || proofs.some((proof) => !groupKeys.includes(proof.group_key) || !hashValid(proof.selection_proof))) return null;
    return {
      actor_user_id: asText(payload.actor_user_id),
      source_cycle_id: asText(payload.source_cycle_id),
      projection_publication_id: asText(payload.projection_publication_id),
      expected_workspace_version: asText(payload.expected_workspace_version).toLowerCase(),
      action: 'ACCEPT_SYSTEM_HOURS',
      selection: {
        mode: 'EXPLICIT', group_keys: [...groupKeys].sort(), excluded_group_keys: [],
        incident_ids: [...incidentIds].sort(), filters: { ...filters },
        sort_key: asText(selection.sort_key), sort_direction: asText(selection.sort_direction).toLowerCase(),
        selection_proof: null,
        group_selection_proofs: proofs.sort((left, right) => left.group_key.localeCompare(right.group_key))
      }
    };
  }

  function exactAcceptSystemHoursAction(group) {
    return exactAcceptSystemHoursPayload(group?.accept_system_hours_action);
  }

  function combinedAcceptSystemHoursPayload() {
    const selectedGroups = [];
    for (const [groupKey, selected] of session.shiftSelections.entries()) {
      if (!selected.size) continue;
      const group = session.workspace?.queries?.rows?.find((entry) => asText(entry.group_key) === groupKey);
      const request = exactAcceptSystemHoursAction(group);
      if (!request || request.selection.group_keys.length !== 1 || request.selection.group_keys[0] !== groupKey) return null;
      const eligible = new Set(request.selection.incident_ids);
      const incidentIds = [...selected].map(asText).filter(Boolean).sort();
      if (!incidentIds.length || new Set(incidentIds).size !== incidentIds.length
        || incidentIds.some((incidentId) => !eligible.has(incidentId))) return null;
      selectedGroups.push({ request, groupKey, incidentIds });
    }
    if (!selectedGroups.length) return null;
    const first = selectedGroups[0].request;
    const filters = JSON.stringify(first.selection.filters);
    if (selectedGroups.some(({ request }) => request.actor_user_id !== first.actor_user_id
      || request.source_cycle_id !== first.source_cycle_id
      || request.projection_publication_id !== first.projection_publication_id
      || request.expected_workspace_version !== first.expected_workspace_version
      || request.selection.sort_key !== first.selection.sort_key
      || request.selection.sort_direction !== first.selection.sort_direction
      || JSON.stringify(request.selection.filters) !== filters)) return null;
    const incidentIds = selectedGroups.flatMap((entry) => entry.incidentIds);
    if (new Set(incidentIds).size !== incidentIds.length) return null;
    return {
      actor_user_id: first.actor_user_id,
      source_cycle_id: first.source_cycle_id,
      projection_publication_id: first.projection_publication_id,
      expected_workspace_version: first.expected_workspace_version,
      action: 'ACCEPT_SYSTEM_HOURS',
      selection: {
        mode: 'EXPLICIT',
        group_keys: selectedGroups.map((entry) => entry.groupKey).sort(),
        excluded_group_keys: [], incident_ids: [...incidentIds].sort(),
        filters: { ...first.selection.filters }, sort_key: first.selection.sort_key,
        sort_direction: first.selection.sort_direction, selection_proof: null,
        group_selection_proofs: selectedGroups.flatMap((entry) => entry.request.selection.group_selection_proofs)
          .sort((left, right) => left.group_key.localeCompare(right.group_key))
      }
    };
  }

  function bulkOutreachAction(queries, command) {
    if (queries?.bulk_actions?.selection_complete !== true) return null;
    if (command === 'ASK_CANDIDATES') return queries.bulk_actions.ask_candidates;
    if (command === 'SEND_MANAGER_NOW') return queries.bulk_actions.send_manager_now;
    return null;
  }

  function buildOutreachRequest(queries, selectionState, command) {
    const action = bulkOutreachAction(queries, command);
    const selection = selectionState || {};
    if (!action?.enabled || !action.request || !['ALL_FILTERED', 'EXPLICIT'].includes(selection.mode)) return null;
    const request = { ...action.request, selection: { ...action.request.selection } };
    if (selection.mode === 'ALL_FILTERED') {
      request.selection.mode = 'ALL_FILTERED';
      request.selection.group_keys = [];
      request.selection.excluded_group_keys = [...new Set(selection.exclusions || [])].map(asText).filter(Boolean).sort();
      request.selection.incident_ids = [];
    } else {
      const groupKeys = [...new Set(selection.ids || [])].map(asText).filter((key) => /^qg_[0-9a-f]{64}$/.test(key)).sort();
      if (!groupKeys.length || groupKeys.length !== new Set(selection.ids || []).size) return null;
      request.selection.mode = 'EXPLICIT';
      request.selection.group_keys = groupKeys;
      request.selection.excluded_group_keys = [];
      request.selection.incident_ids = [];
    }
    return request;
  }

  function renderShiftRows(group, stale = false) {
    const groupKey = asText(group.group_key);
    const rows = asArray(group.children).map((rowValue) => {
      const row = asObject(rowValue);
      const detail = {
        day_date: asText(row.day_date), candidate_hours: asText(row.candidate_hours),
        system_hours: asText(row.system_hours), issue: asText(row.issue), status: normaliseStatus(row.status).text
      };
      const actions = withFallbackDetail(normaliseActions(row.actions, ACTIONS.shifts), detail);
      return `<tr class="ws-shift-row"><td data-label="Select"><input type="checkbox" data-ws-shift-select="${escapeHtml(groupKey)}" value="${escapeHtml(asText(row.incident_id))}"${row.accept_eligible === true && !stale ? '' : ' disabled'} aria-label="Select ${escapeHtml(asText(row.day_date) || 'shift')}"></td><td data-label="Day/date"><strong>${escapeHtml(asText(row.day_date) || '—')}</strong></td><td data-label="Job role">${escapeHtml(asText(row.job_role) || '—')}</td><td data-label="Candidate hours">${escapeHtml(asText(row.candidate_hours) || 'Timesheet not submitted')}</td><td data-label="System hours">${escapeHtml(asText(row.system_hours) || '—')}</td><td data-label="Issue">${escapeHtml(asText(row.issue) || '—')}</td><td data-label="Status">${renderStatus(row.status)}</td><td data-label="Actions" class="ws-actions">${renderActions(actions, stale, `${groupKey}-${asText(row.incident_id)}`)}</td></tr>`;
    }).join('');
    const exactGroupPayload = exactAcceptSystemHoursAction(group);
    const eligible = !!exactGroupPayload;
    return `<tr class="ws-expanded"><td colspan="10"><div class="ws-inner-scroll"><table class="grid mini ws-inner-grid ws-query-shift-grid"><thead><tr><th><input type="checkbox" data-ws-shift-header="${escapeHtml(groupKey)}" aria-label="Select all shifts in this group"${eligible && !stale ? '' : ' disabled'}></th>${['Day/date','Job role','Candidate hours','System hours','Issue','Status','Actions'].map((label) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></td></tr>`;
  }

  function renderQueries(workspace, state) {
    const stale = workspace.queries.stale;
    const hasOutreachAuthority = bulkOutreachAction(workspace.queries, 'ASK_CANDIDATES')?.enabled === true
      || bulkOutreachAction(workspace.queries, 'SEND_MANAGER_NOW')?.enabled === true;
    const rows = workspace.queries.rows.map((rowValue) => {
      const row = asObject(rowValue);
      const key = asText(row.group_key);
      const selectable = hasOutreachAuthority && !stale;
      const detail = {
        candidate: asText(row.candidate), client: asText(row.client), status: normaliseStatus(row.status).text,
        age: asText(row.age), shifts: asArray(row.children).map((shift) => ({
          day_date: asText(shift?.day_date), candidate_hours: asText(shift?.candidate_hours),
          system_hours: asText(shift?.system_hours), issue: asText(shift?.issue), status: normaliseStatus(shift?.status).text
        }))
      };
      const actions = withFallbackDetail(normaliseActions(row.actions, ACTIONS.queries), detail);
      return `<tr data-ws-group-key="${escapeHtml(key)}"><td data-label="Select"><input type="checkbox" data-ws-group-select value="${escapeHtml(key)}"${selectable ? '' : ' disabled'} aria-label="Select ${escapeHtml(asText(row.candidate) || 'query group')}"></td><td data-label="Shifts"><button type="button" class="ws-expand" data-ws-expand="${escapeHtml(key)}" aria-expanded="${row.expanded === true}" aria-label="${row.expanded === true ? 'Collapse' : 'Expand'} ${escapeHtml(asText(row.candidate) || 'query group')}">⌄</button></td><td data-label="Candidate">${escapeHtml(asText(row.candidate) || '—')}</td><td data-label="Client">${escapeHtml(asText(row.client) || '—')}</td><td data-label="Issues">${escapeHtml(asText(row.issues) || '0')}</td><td data-label="Candidate asked">${renderTick(row.candidate_asked, 'Candidate asked', 'Candidate not yet asked')}</td><td data-label="Manager informed">${renderTick(row.manager_informed, 'Manager informed', 'Manager not yet informed')}</td><td data-label="Status">${renderStatus(row.status)}</td><td data-label="Age">${escapeHtml(asText(row.age) || '—')}</td><td data-label="Actions" class="ws-actions">${renderActions(actions, stale, key)}</td></tr>${row.expanded === true ? renderShiftRows(row, stale) : ''}`;
    }).join('');
    const paid = workspace.counts.paid_unresolved ? '<div class="ws-notice ws-notice--danger"><strong>Paid shifts still need attention</strong><span>Paid unresolved shifts remain at the top until resolved.</span></div>' : '';
    const sort = state.sort?.queries || {};
    const sortable = [['Candidate','candidate'],['Client','client'],['Issues','issues'],['Candidate asked','candidate_asked'],['Manager informed','manager_informed'],['Status','status'],['Age','age']];
    const filters = state.query?.filters || {};
    const staleNotice = stale ? '<div class="ws-notice ws-notice--warning" role="status"><span>This information has changed. Recheck before continuing.</span></div>' : '';
    const filterControls = `
      <label>Status<select data-ws-filter="status"><option value="UNRESOLVED"${filters.status !== 'ALL' ? ' selected' : ''}>All unresolved</option><option value="ALL"${filters.status === 'ALL' ? ' selected' : ''}>All</option></select></label>
      <label>Candidate<input type="search" data-ws-filter="candidate" placeholder="All" value="${escapeHtml(filters.candidate || '')}"></label>
      <label>Issue<select data-ws-filter="issue"><option value="ALL"${!filters.issue || filters.issue === 'ALL' ? ' selected' : ''}>All</option><option value="HOURS_DIFFER"${filters.issue === 'HOURS_DIFFER' ? ' selected' : ''}>Hours differ</option><option value="MISSING_SHIFT"${filters.issue === 'MISSING_SHIFT' ? ' selected' : ''}>Missing shift</option><option value="TIMESHEET_MISSING"${filters.issue === 'TIMESHEET_MISSING' ? ' selected' : ''}>Timesheet missing</option></select></label>
      ${renderMobileSort(sortable, sort)}
      <button type="button" class="btn btn-outline" data-ws-recheck>Recheck</button>`;
    const actionControls = `
      <button type="button" class="btn primary" data-ws-bulk-action="ASK_CANDIDATES" disabled>Ask selected candidates</button>
      <button type="button" class="btn btn-outline" data-ws-bulk-action="SEND_MANAGER_NOW" disabled>Send selected to manager now</button>
      <button type="button" class="btn btn-outline" data-ws-accept-selected hidden${stale ? ' disabled' : ''}>Accept system hours for selected shifts</button>`;
    return `${staleNotice}${paid}
      <div class="ws-query-controls">
        <details class="ws-query-filter-menu" open>
          <summary class="btn btn-outline">Filters and sorting</summary>
          <div class="ws-query-filter-fields">${filterControls}</div>
        </details>
        <details class="ws-query-actions-menu" open>
          <summary class="btn primary" data-ws-actions-summary aria-disabled="true">Actions for selected</summary>
          <div class="ws-query-action-choices">${actionControls}</div>
        </details>
      </div>
      <div class="ws-selection-summary" data-ws-selection-summary>0 query groups selected</div>
      <div class="ws-scroll ws-query-scroll" data-ws-scroll><table class="grid mini ws-grid ws-query-grid"><thead><tr><th><input type="checkbox" data-ws-group-header aria-label="Select all query groups"${stale || !hasOutreachAuthority ? ' disabled' : ''}></th><th></th>${sortable.map(([label,key]) => renderSortHeader(label,key,sort)).join('')}<th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="10" class="ws-empty">Nothing matches the current filters.</td></tr>'}</tbody></table><div data-ws-sentinel></div></div>
      <div class="ws-sticky-footer"><span>${workspace.counts.queries} unresolved</span><span data-ws-shift-summary>0 shifts selected</span></div>`;
  }

  function finaliseColumns(workspace, blocked) {
    if (/^HEALTHROSTER_WEEKLY_/.test(workspace.profile.id)) return [
      ['Candidate','candidate'], ['Day/date','day_date'], ['System hours','system_hours'], ['Status','status'], ['Action','actions']
    ];
    if (blocked) return [
      ['Candidate', 'candidate'], ['Day/date', 'day_date'], ['Problem', 'problem'], ['Action', 'actions']
    ];
    if (workspace.profile.id === 'NHSP_FINAL_BACKING_V1' || workspace.profile.id === 'NHSP_BACKING_REPORT_ACTUAL_V1') return [
      ['Candidate','candidate'], ['Day/date','day_date'], ['Actual hours','actual_hours'], ['Movement','movement'],
      ['Commission','commission'], ['Total cost','total_cost'], ['Invoice charge','invoice_charge'], ['Status','status']
    ];
    return [
      ['Candidate','candidate'], ['Day/date','day_date'], ['Job role','job_role'], ['Client','client'],
      ['System hours','system_hours'], ['Contract','contract'], ['Outcome','outcome']
    ];
  }

  function renderFinaliseTable(workspace, page, blocked, state) {
    const columns = finaliseColumns(workspace, blocked);
    const sort = state.sort?.finalise || {};
    const rows = page.rows.map((rowValue) => {
      const row = asObject(rowValue);
      return `<tr>${columns.map(([label, key]) => {
        if (key === 'actions') {
          const detail = { candidate: asText(row.candidate), day_date: asText(row.day_date), problem: asText(row.problem), guidance: asText(row.guidance || row.next_step) };
          const actions = withFallbackDetail(normaliseActions(row.actions, ACTIONS.finalise), detail);
          return `<td data-label="${escapeHtml(label)}" class="ws-actions">${renderActions(actions, page.stale, asText(row.row_key || `${row.candidate}-${row.day_date}`))}</td>`;
        }
        if (key === 'status') return `<td data-label="${escapeHtml(label)}">${renderStatus(row.status)}</td>`;
        return `<td data-label="${escapeHtml(label)}">${escapeHtml(asText(row[key]) || '—')}</td>`;
      }).join('')}</tr>`;
    }).join('');
    return `<table class="grid mini ws-grid"><thead><tr>${columns.map(([label, key]) => key === 'actions' ? `<th>${label}</th>` : renderSortHeader(label, key, sort)).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${columns.length}" class="ws-empty">Nothing matches the current filters.</td></tr>`}</tbody></table>`;
  }

  function renderFinalisationTracker(workspace) {
    const tracker = workspace.finalise.tracker;
    if (!tracker.rows.length) return '';
    const rows = tracker.rows.map((row) => `<tr><td data-label="Source">${escapeHtml(row.source || '—')}</td><td data-label="Trust or client">${escapeHtml(row.client || '—')}</td><td data-label="Status">${renderStatus(row.status)}${row.detail ? `<span class="ws-status-sub">${escapeHtml(row.detail)}</span>` : ''}</td><td data-label="Action" class="ws-actions">${renderActions(row.actions, false, row.row_key)}</td></tr>`).join('');
    const complete = tracker.complete
      ? '<span class="ws-status ws-status--positive">Complete</span>'
      : '<span class="ws-status ws-status--warning">Still to complete</span>';
    return `<section class="ws-tracker" aria-labelledby="ws-tracker-title"><div class="ws-tracker-heading"><div><h3 id="ws-tracker-title">${escapeHtml(tracker.title)}</h3>${tracker.cycle_label ? `<span>${escapeHtml(tracker.cycle_label)}</span>` : ''}</div>${complete}</div><div class="ws-inner-scroll"><table class="grid mini ws-inner-grid"><thead><tr><th>Source</th><th>Trust or client</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  function renderApprovedHoursFollowUp(finalise, viewState) {
    const followUp = finalise.approved_hours_follow_up || {};
    const retry = asObject(viewState.finaliseRetry);
    if (retry.task_id) {
      return '<div class="ws-notice ws-notice--warning" role="status"><strong>Approved hours update was not confirmed</strong><span>The source is already finalised. Retry only the approved-hours update.</span><button type="button" class="btn btn-outline" data-ws-finalise-retry>Retry approved hours update</button></div>';
    }
    if (!followUp.title && !followUp.body) return '';
    const noticeTone = followUp.state === 'ACTION_REQUIRED' ? 'danger' : 'warning';
    const action = followUp.action
      ? `<button type="button" class="btn btn-outline" data-ws-approved-follow-up data-ws-command="${escapeHtml(followUp.action.command)}" data-ws-payload="${escapeHtml(JSON.stringify(followUp.action.payload))}">${escapeHtml(followUp.action.label)}</button>`
      : '';
    return `<div class="ws-notice ws-notice--${noticeTone}" role="status"><strong>${escapeHtml(followUp.title)}</strong>${followUp.body ? `<span>${escapeHtml(followUp.body)}</span>` : ''}${action}</div>`;
  }

  function buildRateWarningAcceptancePayload(rateWarnings, selectedKeys) {
    const warnings = rateWarnings || {};
    const acceptance = warnings.acceptance;
    if (warnings.phase !== 'FINAL_AWAITING_ACCEPTANCE' || !acceptance) return null;
    const eligible = new Set(warnings.rows.filter((row) => row.accept_eligible).map((row) => row.warning_key));
    const selected = [...new Set(asArray(selectedKeys).map(asText).filter((key) => eligible.has(key)))];
    if (!selected.length) return null;
    return {
      action: acceptance.action,
      payload: {
        ...acceptance.payload,
        [acceptance.selection.key]: selected,
        [acceptance.selection.proof_key]: acceptance.selection.proof
      }
    };
  }

  function renderRateWarningRows(rateWarnings, viewState) {
    const selected = viewState.rateWarningSelection || new Set();
    const accepting = rateWarnings.phase === 'FINAL_AWAITING_ACCEPTANCE';
    return rateWarnings.rows.map((row) => {
      const rowSelected = selected.has(row.warning_key);
      const selectCell = accepting
        ? `<td data-label="Select"><input type="checkbox" data-ws-rate-warning-select value="${escapeHtml(row.warning_key)}"${row.accept_eligible ? '' : ' disabled'} aria-label="Select ${escapeHtml(row.candidate || 'rate warning')}"${rowSelected ? ' checked' : ''}></td>`
        : '';
      const action = row.detail_rows.length
        ? `<button type="button" class="btn btn-outline" data-ws-rate-expand="${escapeHtml(row.warning_key)}" aria-expanded="${viewState.expandedRateWarning === row.warning_key}">${escapeHtml(row.action_label)}</button>`
        : `<span class="ws-muted-action">${escapeHtml(row.action_label)}</span>`;
      const base = `<tr data-ws-rate-warning-row="${escapeHtml(row.warning_key)}">${selectCell}<td data-label="Candidate">${escapeHtml(row.candidate || '—')}</td><td data-label="Day/date">${escapeHtml(row.day_date || '—')}</td><td data-label="Source charge">${escapeHtml(row.source_charge || '—')}</td><td data-label="Warning">${renderStatus({ text: row.warning || 'Rate warning', tone: row.warning_tone })}</td><td data-label="Action" class="ws-actions">${action}</td></tr>`;
      if (viewState.expandedRateWarning !== row.warning_key || !row.detail_rows.length) return base;
      const detailRows = row.detail_rows.map((detail) => `<tr><td>${escapeHtml(detail.candidate || '—')}</td><td>${escapeHtml(detail.day_date || '—')}</td><td>${escapeHtml(detail.source_charge || '—')}</td><td>${escapeHtml(detail.warning || '—')}</td></tr>`).join('');
      return `${base}<tr class="ws-rate-warning-drilldown"><td colspan="${accepting ? 6 : 5}"><div class="ws-inner-scroll"><table class="grid mini ws-inner-grid"><thead><tr><th>Candidate</th><th>Day/date</th><th>Source charge</th><th>Warning</th></tr></thead><tbody>${detailRows}</tbody></table></div></td></tr>`;
    }).join('');
  }

  function renderRateWarnings(rateWarnings, viewState) {
    if (!rateWarnings.available) return '';
    const accepting = rateWarnings.phase === 'FINAL_AWAITING_ACCEPTANCE';
    const selected = viewState.rateWarningSelection || new Set();
    const eligible = rateWarnings.rows.filter((row) => row.accept_eligible);
    const allSelected = eligible.length > 0 && eligible.every((row) => selected.has(row.warning_key));
    const someSelected = eligible.some((row) => selected.has(row.warning_key));
    const notice = rateWarnings.notice
      ? `<div class="ws-notice ws-notice--${escapeHtml(rateWarnings.notice.tone)}" role="status"><strong>${escapeHtml(rateWarnings.notice.title)}</strong>${rateWarnings.notice.body ? `<span>${escapeHtml(rateWarnings.notice.body)}</span>` : ''}</div>`
      : '';
    if (rateWarnings.phase === 'READY') {
      return `<section class="ws-rate-warnings" data-ws-rate-warning-phase="ready"><div class="ws-rate-warning-heading"><h3>Rate warnings accepted</h3><span class="ws-status ws-status--positive">Ready for finalisation</span></div><p>${rateWarnings.accepted_count} rate warning${rateWarnings.accepted_count === 1 ? '' : 's'} accepted. The final source charge remains unchanged.</p>${notice}</section>`;
    }
    const heading = rateWarnings.phase === 'PREFINAL' ? 'Rate warnings found' : 'Rate warnings to accept';
    const intro = rateWarnings.phase === 'PREFINAL'
      ? 'Check these warnings with NHSP before cutoff. Hours checking remains available.'
      : 'Select the warnings checked, then confirm the acceptance.';
    const headerSelect = accepting
      ? `<th><input type="checkbox" data-ws-rate-warning-header aria-label="${allSelected ? 'Clear visible rate warnings' : 'Select visible rate warnings'}"${eligible.length ? '' : ' disabled'}${allSelected ? ' checked' : ''}${someSelected && !allSelected ? ' data-indeterminate="1" aria-checked="mixed"' : ` aria-checked="${allSelected ? 'true' : 'false'}"`}></th>`
      : '';
    const confirmation = accepting
      ? `<label class="ws-confirm"><input type="checkbox" data-ws-rate-warning-confirm${selected.size ? '' : ' disabled'}><span>I have checked the warnings shown.</span></label><div class="ws-rate-warning-actions"><span data-ws-rate-warning-summary>${selected.size} warning row${selected.size === 1 ? '' : 's'} selected</span><button type="button" class="btn primary" data-ws-rate-warning-accept disabled>Accept selected source charges</button></div>`
      : '';
    return `<section class="ws-rate-warnings" data-ws-rate-warning-phase="${escapeHtml(rateWarnings.phase.toLowerCase())}"><div class="ws-rate-warning-heading"><div><h3>${heading}</h3><p>${intro}</p></div><span class="ws-status ws-status--warning">${rateWarnings.total_count} warning${rateWarnings.total_count === 1 ? '' : 's'}</span></div>${notice}<div class="ws-inner-scroll"><table class="grid mini ws-inner-grid ws-rate-warning-grid${accepting ? ' ws-rate-warning-grid--selectable' : ''}"><thead><tr>${headerSelect}<th>Candidate</th><th>Day/date</th><th>Source charge</th><th>Warning</th><th>Action</th></tr></thead><tbody>${renderRateWarningRows(rateWarnings, viewState) || `<tr><td colspan="${accepting ? 6 : 5}" class="ws-empty">No rate warnings are currently shown.</td></tr>`}</tbody></table></div>${confirmation}</section>`;
  }

  function renderFinalise(workspace, viewState) {
    const finalise = workspace.finalise;
    const active = finalise.active_list;
    const ready = finalise.ready.total_count;
    const blocked = finalise.blocked.total_count;
    const page = finalise[active];
    const sortable = finaliseColumns(workspace, active === 'blocked').filter(([,key]) => key !== 'actions');
    const stale = page.stale || finalise.stale;
    const staleNotice = stale ? '<div class="ws-notice ws-notice--warning" role="status"><span>This information has changed. Recheck before continuing.</span></div>' : '';
    return `${renderFinalisationTracker(workspace)}${renderApprovedHoursFollowUp(finalise, viewState)}${staleNotice}<div class="ws-source-summary">${escapeHtml(finalise.source_summary || 'Current source')}</div>${renderRateWarnings(finalise.rate_warnings, viewState)}<div class="ws-inner-tabs" role="tablist"><button type="button" role="tab" data-ws-finalise-list="ready" aria-selected="${active === 'ready'}">Ready (${ready})</button><button type="button" role="tab" data-ws-finalise-list="blocked" aria-selected="${active === 'blocked'}">Blocked (${blocked})</button></div>${renderMobileSort(sortable, viewState.sort?.finalise || {})}<div class="ws-scroll" data-ws-scroll>${renderFinaliseTable(workspace, page, active === 'blocked', viewState)}<div data-ws-sentinel></div></div><label class="ws-confirm"><input type="checkbox" data-ws-finalise-confirm${finalise.confirmation_required ? '' : ' checked'}${stale ? ' disabled' : ''}><span>${escapeHtml(finalise.confirmation_text || 'I confirm this source is complete for the period shown.')}</span></label><div class="ws-sticky-footer"><span>${ready} ready · ${finalise.rate_warnings.phase === 'READY' ? `${finalise.rate_warnings.accepted_count} rate warnings accepted · ` : ''}${blocked} blocked</span><div><button type="button" class="btn btn-outline" data-ws-recheck>Recheck</button><button type="button" class="btn primary" data-ws-finalise disabled>${escapeHtml(workspace.profile.finalise_label)}</button></div></div>`;
  }

  function renderHistory(workspace, state) {
    const history = workspace.history;
    const options = history.cycle_options.length ? history.cycle_options : [{ value: 'CURRENT_PAY_CYCLE', label: 'Current pay cycle' }];
    const rows = history.rows.map((rowValue) => { const row = asObject(rowValue); return `<tr><td data-label="When">${escapeHtml(asText(row.when) || '—')}</td><td data-label="Source">${escapeHtml(asText(row.source) || '—')}</td><td data-label="Event">${escapeHtml(asText(row.event) || '—')}</td><td data-label="By">${escapeHtml(asText(row.by) || '—')}</td><td data-label="Details">${escapeHtml(asText(row.detail) || '—')}</td></tr>`; }).join('');
    const sort = state.sort?.history || {};
    const sortable = [['When','when'],['Source','source'],['Event','event'],['By','by'],['Details','detail']];
    return `<div class="ws-toolbar"><label>Period<select data-ws-history-cycle>${options.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === history.cycle_filter ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label><button type="button" class="btn btn-outline" data-ws-recheck>Recheck</button></div>${renderMobileSort(sortable, sort)}<div class="ws-scroll" data-ws-scroll><table class="grid mini ws-grid"><thead><tr>${sortable.map(([label,key]) => renderSortHeader(label,key,sort)).join('')}</tr></thead><tbody>${rows || '<tr><td colspan="5" class="ws-empty">Nothing matches the current filters.</td></tr>'}</tbody></table><div data-ws-sentinel></div></div><div class="ws-sticky-footer"><span>${history.total_count} event${history.total_count === 1 ? '' : 's'}</span></div>`;
  }

  function renderWorkspace(workspace, tabKey, state = {}) {
    const tab = TABS.includes(tabKey) ? tabKey : 'imports';
    const notices = workspace.notices.map((notice) => `<div class="ws-notice ws-notice--${escapeHtml(notice.tone)}"><strong>${escapeHtml(notice.title)}</strong>${notice.body ? `<span>${escapeHtml(notice.body)}</span>` : ''}</div>`).join('');
    const error = asText(state.error) ? `<div class="ws-notice ws-notice--danger" role="alert"><strong>Weekly source information could not be loaded</strong><span>${escapeHtml(state.error)}</span></div>` : '';
    const body = state.loading === true ? '<div class="ws-loading" role="status">Loading weekly source information...</div>' : tab === 'imports' ? renderImports(workspace, state) : tab === 'queries' ? renderQueries(workspace, state) : tab === 'finalise' ? renderFinalise(workspace, state) : renderHistory(workspace, state);
    return `<div class="ws-workspace" data-ws-contract="${CONTRACT}" data-ws-tab="${tab}">${renderContext(workspace)}${notices}${error}${body}</div>`;
  }

  const session = {
    workspace: null, activeTab: 'imports', loading: false, error: '', requestSequence: 0,
    query: { filters: {} },
    sort: {
      imports: { key: 'uploaded', direction: 'desc' },
      queries: { key: 'candidate', direction: 'asc' },
      finalise: { key: 'candidate', direction: 'asc' },
      history: { key: 'when', direction: 'desc' }
    },
    scrollByTab: Object.create(null), finaliseRetry: null,
    rateWarningSelection: new Set(), expandedRateWarning: '',
    groupSelection: { mode: 'NONE', ids: new Set(), exclusions: new Set() }, shiftSelections: new Map(), observer: null
  };

  const currentFrame = () => { const stack = Array.isArray(root.__modalStack) ? root.__modalStack : []; const frame = stack[stack.length - 1]; return frame?.kind === 'weekly-source-imports-v1' ? frame : null; };
  const endpoint = (path) => typeof root.API === 'function' ? root.API(path) : path;

  async function requestJson(path, options) {
    const fetcher = typeof root.authFetch === 'function' ? root.authFetch : root.fetch;
    if (typeof fetcher !== 'function') throw new Error('Weekly source access is unavailable.');
    const response = await fetcher(endpoint(path), options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(asText(payload.message) || 'Weekly source request failed.');
      error.status = response.status;
      error.code = asText(payload.error_code);
      error.details = asObject(payload.details);
      throw error;
    }
    return payload;
  }

  function queryFor(tab, extra = {}) {
    const selected = session.workspace?.selected || {};
    const sort = session.sort[tab] || {};
    return {
      tab,
      source_group_id: selected.source_group_id,
      source_cycle_id: selected.source_cycle_id,
      client_id: selected.client_id,
      report_scope_id: selected.report_scope_id,
      sort_key: sort.key,
      sort_direction: sort.direction,
      ...(tab === 'queries' ? {
        ...session.query.filters
      } : {}),
      ...(tab === 'history' ? { cycle_filter: session.workspace?.history?.cycle_filter } : {}),
      ...extra
    };
  }

  function pageFor(tab) { return tab === 'finalise' ? session.workspace?.finalise?.[session.workspace.finalise.active_list] : session.workspace?.[tab]; }
  function repaint() { const frame = currentFrame(); if (frame?.setTab) { frame.tabs = tabDescriptors(session.workspace); Promise.resolve(frame.setTab(session.activeTab)).catch(() => {}); } }

  async function loadWorkspace(tab = session.activeTab, append = false) {
    const sequence = ++session.requestSequence;
    session.loading = !append; session.error = ''; if (session.workspace && !append) repaint();
    const current = pageFor(tab);
    const params = new URLSearchParams(queryFor(tab, append ? { cursor: current?.next_cursor || '' } : {}));
    try {
      const next = normaliseWorkspace(await requestJson(`${ENDPOINTS.workspace}?${params}`));
      if (sequence !== session.requestSequence) return;
      if (append && current) {
        const nextPage = tab === 'finalise' ? next.finalise[next.finalise.active_list] : next[tab];
        const keys = new Set(current.rows.map((row) => asText(row.row_key || row.group_key || row.id)));
        nextPage.rows = [...current.rows, ...nextPage.rows.filter((row) => { const key = asText(row.row_key || row.group_key || row.id); if (!key || keys.has(key)) return false; keys.add(key); return true; })];
      }
      session.workspace = next; session.loading = false;
    } catch (error) { if (sequence !== session.requestSequence) return; session.loading = false; session.error = asText(error?.message); }
    repaint();
  }

  function selectionSpec() {
    return {
      mode: session.groupSelection.mode,
      ids: new Set(session.groupSelection.ids),
      exclusions: new Set(session.groupSelection.exclusions)
    };
  }

  async function issueCommand(action, payload) {
    const command = asText(action).toUpperCase();
    const commandPayload = { ...asObject(payload) };
    return requestJson(ENDPOINTS.command, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: command, payload: commandPayload })
    });
  }

  function updateSelection(host) {
    host.querySelectorAll('[data-ws-group-select]').forEach((input) => { input.checked = session.groupSelection.mode === 'ALL_FILTERED' ? !session.groupSelection.exclusions.has(input.value) : session.groupSelection.ids.has(input.value); });
    const selectedVisible = [...host.querySelectorAll('[data-ws-group-select]:checked')].filter((input) => !input.disabled).length;
    const total = session.groupSelection.mode === 'ALL_FILTERED' ? Math.max(selectedVisible, session.workspace.queries.total_count - session.groupSelection.exclusions.size) : session.groupSelection.ids.size;
    const header = host.querySelector('[data-ws-group-header]');
    if (header) { header.checked = session.groupSelection.mode === 'ALL_FILTERED' && session.groupSelection.exclusions.size === 0; header.indeterminate = !header.checked && total > 0; header.setAttribute('aria-label', header.checked ? 'Clear all query groups' : 'Select all query groups'); }
    const summary = host.querySelector('[data-ws-selection-summary]'); if (summary) summary.textContent = `${total} query group${total === 1 ? '' : 's'} selected`;
    const shiftCount = [...session.shiftSelections.values()].reduce((sum, value) => sum + value.size, 0);
    const shiftSummary = host.querySelector('[data-ws-shift-summary]'); if (shiftSummary) shiftSummary.textContent = `${shiftCount} shift${shiftCount === 1 ? '' : 's'} selected`;
    const actionsSummary = host.querySelector('[data-ws-actions-summary]');
    if (actionsSummary) {
      const selectedCount = total + shiftCount;
      actionsSummary.textContent = selectedCount > 0 ? `Actions for ${selectedCount} selected` : 'Actions for selected';
      actionsSummary.setAttribute('aria-disabled', selectedCount > 0 ? 'false' : 'true');
    }
    const accept = host.querySelector('[data-ws-accept-selected]'); if (accept) accept.hidden = shiftCount === 0;
    host.querySelectorAll('[data-ws-bulk-action]').forEach((button) => {
      button.disabled = session.workspace.queries.stale || total === 0
        || !buildOutreachRequest(session.workspace.queries, selectionSpec(), button.dataset.wsBulkAction);
    });
    if (accept) accept.disabled = session.workspace.queries.stale || shiftCount === 0 || !combinedAcceptSystemHoursPayload();
    host.querySelectorAll('[data-ws-shift-header]').forEach((shiftHeader) => {
      const group = session.workspace.queries.rows.find((entry) => asText(entry.group_key) === shiftHeader.dataset.wsShiftHeader);
      const exactIds = exactAcceptSystemHoursAction(group)?.selection?.incident_ids || [];
      const selected = session.shiftSelections.get(shiftHeader.dataset.wsShiftHeader) || new Set();
      shiftHeader.checked = exactIds.length > 0 && exactIds.every((id) => selected.has(id));
      shiftHeader.indeterminate = !shiftHeader.checked && exactIds.some((id) => selected.has(id));
      shiftHeader.disabled = session.workspace.queries.stale || exactIds.length === 0;
      shiftHeader.setAttribute('aria-label', shiftHeader.checked ? 'Clear all shifts in this group' : 'Select all shifts in this group');
    });
    if (header) header.disabled = session.workspace.queries.stale || session.workspace.queries.total_count === 0
      || (bulkOutreachAction(session.workspace.queries, 'ASK_CANDIDATES')?.enabled !== true && bulkOutreachAction(session.workspace.queries, 'SEND_MANAGER_NOW')?.enabled !== true);
  }

  function bindQueries(host) {
    if (root.matchMedia?.('(max-width: 900px)').matches) {
      host.querySelectorAll('.ws-query-filter-menu, .ws-query-actions-menu').forEach((menu) => menu.removeAttribute('open'));
    }
    host.querySelector('[data-ws-actions-summary]')?.addEventListener('click', (event) => {
      if (event.currentTarget.getAttribute('aria-disabled') === 'true') event.preventDefault();
    });
    host.querySelector('[data-ws-group-header]')?.addEventListener('change', (event) => { session.groupSelection = event.target.checked ? { mode: 'ALL_FILTERED', ids: new Set(), exclusions: new Set() } : { mode: 'NONE', ids: new Set(), exclusions: new Set() }; updateSelection(host); });
    host.querySelectorAll('[data-ws-group-select]').forEach((input) => input.addEventListener('change', () => { if (session.groupSelection.mode === 'ALL_FILTERED') { input.checked ? session.groupSelection.exclusions.delete(input.value) : session.groupSelection.exclusions.add(input.value); } else { session.groupSelection.mode = 'EXPLICIT'; input.checked ? session.groupSelection.ids.add(input.value) : session.groupSelection.ids.delete(input.value); if (!session.groupSelection.ids.size) session.groupSelection.mode = 'NONE'; } updateSelection(host); }));
    host.querySelectorAll('[data-ws-expand]').forEach((button) => button.addEventListener('click', () => { const row = session.workspace.queries.rows.find((entry) => asText(entry.group_key) === button.dataset.wsExpand); if (row) row.expanded = row.expanded !== true; repaint(); }));
    host.querySelectorAll('[data-ws-shift-header]').forEach((input) => input.addEventListener('change', () => { const group = session.workspace.queries.rows.find((entry) => asText(entry.group_key) === input.dataset.wsShiftHeader); const ids = exactAcceptSystemHoursAction(group)?.selection?.incident_ids || []; if (!ids.length) { input.checked = false; return; } session.shiftSelections.set(input.dataset.wsShiftHeader, new Set(input.checked ? ids : [])); host.querySelectorAll(`[data-ws-shift-select="${CSS.escape(input.dataset.wsShiftHeader)}"]`).forEach((rowInput) => { rowInput.checked = input.checked && ids.includes(rowInput.value); }); updateSelection(host); }));
    host.querySelectorAll('[data-ws-shift-select]').forEach((input) => input.addEventListener('change', () => { const key = input.dataset.wsShiftSelect; const set = session.shiftSelections.get(key) || new Set(); input.checked ? set.add(input.value) : set.delete(input.value); session.shiftSelections.set(key, set); const header = host.querySelector(`[data-ws-shift-header="${CSS.escape(key)}"]`); const eligible = [...host.querySelectorAll(`[data-ws-shift-select="${CSS.escape(key)}"]`)].filter((entry) => !entry.disabled); if (header) { header.checked = eligible.length > 0 && eligible.every((entry) => entry.checked); header.indeterminate = !header.checked && eligible.some((entry) => entry.checked); header.setAttribute('aria-label', header.checked ? 'Clear all shifts in this group' : 'Select all shifts in this group'); } updateSelection(host); }));
    host.querySelectorAll('[data-ws-filter]').forEach((control) => control.addEventListener('change', () => {
      session.query.filters[control.dataset.wsFilter] = control.value;
      session.groupSelection = { mode: 'NONE', ids: new Set(), exclusions: new Set() };
      loadWorkspace('queries');
    }));
    host.querySelectorAll('[data-ws-bulk-action]').forEach((button) => button.addEventListener('click', async () => {
      const payload = buildOutreachRequest(session.workspace.queries, selectionSpec(), button.dataset.wsBulkAction);
      if (!payload) return;
      button.disabled = true;
      try { await issueCommand(button.dataset.wsBulkAction, payload); session.groupSelection = { mode: 'NONE', ids: new Set(), exclusions: new Set() }; await loadWorkspace('queries'); }
      catch (error) { session.error = asText(error?.message); repaint(); }
    }));
    host.querySelector('[data-ws-accept-selected]')?.addEventListener('click', async (event) => {
      const payload = combinedAcceptSystemHoursPayload();
      if (!payload) return;
      event.currentTarget.disabled = true;
      const count = payload.selection.incident_ids.length;
      root.dispatchEvent?.(new CustomEvent('cloudtms:weekly-source-action', {
        detail: {
          label: 'Accept system hours', command: 'ACCEPT_SYSTEM_HOURS', payload,
          context: { status: `${count} shift${count === 1 ? '' : 's'} selected` }
        }
      }));
    });
    updateSelection(host);
  }

  async function uploadSource(file) {
    if (!file || typeof root.uploadImportFileToR2 !== 'function') throw new Error('File upload is unavailable.');
    const stored = await root.uploadImportFileToR2(file);
    const preview = await requestJson(ENDPOINTS.preview, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_key: stored.fileKey, original_filename: stored.filename, source_group_id: session.workspace.selected.source_group_id, source_cycle_id: session.workspace.selected.source_cycle_id, client_id: session.workspace.selected.client_id, parser_options: { profileId: session.workspace.profile.id } }) });
    const controlValue = (key) => asText(session.workspace.context.controls.find((control) => control.key === key)?.value);
    const acceptContext = {
      file_key: stored.fileKey,
      original_filename: stored.filename,
      source_group_id: session.workspace.selected.source_group_id,
      source_cycle_id: session.workspace.selected.source_cycle_id,
      client_id: session.workspace.selected.client_id,
      report_scope_id: session.workspace.selected.report_scope_id,
      cutoff: controlValue('cutoff'),
      profile_id: asText(preview?.preview?.profileId || session.workspace.profile.id),
      parser_options: { profileId: asText(preview?.preview?.profileId || session.workspace.profile.id) }
    };
    root.dispatchEvent?.(new CustomEvent('cloudtms:weekly-source-preview', { detail: { ...preview, accept_context: acceptContext } }));
    return { ...preview, accept_context: acceptContext };
  }

  async function acceptUpload(payload) {
    return requestJson(ENDPOINTS.accept, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(asObject(payload))
    });
  }

  function bindCommon(host) {
    host.querySelectorAll('[data-ws-context]').forEach((control) => control.addEventListener('change', () => { const keyMap = { source_group: 'source_group_id', cycle: 'source_cycle_id', client: 'client_id' }; const key = keyMap[control.dataset.wsContext] || control.dataset.wsContext; if (Object.prototype.hasOwnProperty.call(session.workspace.selected, key)) session.workspace.selected[key] = control.value; session.groupSelection = { mode: 'NONE', ids: new Set(), exclusions: new Set() }; session.shiftSelections.clear(); loadWorkspace(session.activeTab); }));
    host.querySelectorAll('[data-ws-recheck]').forEach((button) => button.addEventListener('click', () => loadWorkspace(session.activeTab)));
    host.querySelectorAll('.ws-row-action').forEach((button) => button.addEventListener('click', () => {
      let payload = {}; let context = {};
      try { payload = JSON.parse(button.dataset.wsPayload || '{}'); } catch {}
      try { context = JSON.parse(button.dataset.wsContext || '{}'); } catch {}
      root.dispatchEvent?.(new CustomEvent('cloudtms:weekly-source-action', { detail: { label: button.dataset.wsAction, kind: button.dataset.wsKind, command: button.dataset.wsCommand, payload, context } }));
    }));
    host.querySelectorAll('[data-ws-sort]').forEach((button) => button.addEventListener('click', () => {
      const sort = session.sort[session.activeTab];
      const key = button.dataset.wsSort;
      if (!sort || !key) return;
      if (sort.key === key) sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
      else { sort.key = key; sort.direction = 'asc'; }
      session.scrollByTab[session.activeTab] = 0;
      loadWorkspace(session.activeTab);
    }));
    const mobileSort = host.querySelector('[data-ws-mobile-sort]');
    const mobileDirection = host.querySelector('[data-ws-mobile-direction]');
    const applyMobileSort = () => {
      const sort = session.sort[session.activeTab];
      if (!sort || !mobileSort?.value || !mobileDirection?.value) return;
      sort.key = mobileSort.value;
      sort.direction = mobileDirection.value === 'desc' ? 'desc' : 'asc';
      session.scrollByTab[session.activeTab] = 0;
      loadWorkspace(session.activeTab);
    };
    mobileSort?.addEventListener('change', applyMobileSort);
    mobileDirection?.addEventListener('change', applyMobileSort);
    const uploadInput = host.querySelector('[data-ws-upload-input]'); host.querySelector('[data-ws-upload]')?.addEventListener('click', () => uploadInput?.click()); uploadInput?.addEventListener('change', async () => { const file = uploadInput.files?.[0]; uploadInput.value = ''; try { await uploadSource(file); await loadWorkspace('imports'); } catch (error) { session.error = asText(error?.message); repaint(); } });
    const dailyInput = host.querySelector('[data-ws-daily-input]'); host.querySelector('[data-ws-daily]')?.addEventListener('click', () => dailyInput?.click()); dailyInput?.addEventListener('change', async () => { const file = dailyInput.files?.[0]; dailyInput.value = ''; if (file && typeof root.handleHrRotaFileDrop === 'function') await root.handleHrRotaFileDrop(file); });
    const attentionHeader = host.querySelector('[data-ws-import-attention-header]');
    const attentionRows = [...host.querySelectorAll('[data-ws-import-attention]')];
    const attentionButton = host.querySelector('[data-ws-import-email-manager]');
    const attentionCount = host.querySelector('[data-ws-import-attention-count]');
    const syncAttention = () => {
      const selected = attentionRows.filter((input) => input.checked);
      if (attentionHeader) {
        attentionHeader.checked = attentionRows.length > 0 && selected.length === attentionRows.length;
        attentionHeader.indeterminate = selected.length > 0 && selected.length < attentionRows.length;
      }
      if (attentionCount) attentionCount.textContent = `${selected.length} selected`;
      if (attentionButton) attentionButton.disabled = selected.length === 0;
    };
    attentionHeader?.addEventListener('change', () => {
      attentionRows.forEach((input) => { input.checked = attentionHeader.checked; });
      syncAttention();
    });
    attentionRows.forEach((input) => input.addEventListener('change', syncAttention));
    attentionButton?.addEventListener('click', () => {
      root.dispatchEvent?.(new CustomEvent('cloudtms:weekly-source-action', {
        detail: { label: 'Email manager', kind: 'NAVIGATION', payload: { row_keys: attentionRows.filter((input) => input.checked).map((input) => input.value) } }
      }));
    });
    syncAttention();
  }

  function bindFinalise(host) {
    host.querySelectorAll('[data-ws-finalise-list]').forEach((button) => button.addEventListener('click', () => { session.workspace.finalise.active_list = button.dataset.wsFinaliseList === 'ready' ? 'ready' : 'blocked'; repaint(); }));
    const confirmation = host.querySelector('[data-ws-finalise-confirm]'); const action = host.querySelector('[data-ws-finalise]');
    const sync = () => { if (action) action.disabled = !(session.workspace.finalise.finalise_enabled && session.workspace.finalise.rate_warnings.phase !== 'FINAL_AWAITING_ACCEPTANCE' && !session.workspace.finalise.stale && !session.workspace.finalise[session.workspace.finalise.active_list]?.stale && Object.keys(session.workspace.finalise.finalise_payload).length > 0 && session.workspace.finalise.blocked.total_count === 0 && (!session.workspace.finalise.confirmation_required || confirmation?.checked)); };
    confirmation?.addEventListener('change', sync); sync();
    action?.addEventListener('click', async () => { action.disabled = true; try { session.finaliseRetry = null; await issueCommand('FINALISE_WEEK', session.workspace.finalise.finalise_payload); await loadWorkspace('finalise'); } catch (error) { session.error = asText(error?.message); repaint(); } });
    host.querySelector('[data-ws-approved-follow-up]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      let payload = {};
      try { payload = JSON.parse(button.dataset.wsPayload || '{}'); } catch {}
      button.disabled = true;
      try {
        const result = await issueCommand(button.dataset.wsCommand, payload);
        const recovery = asObject(result?.recovery);
        const projection = asObject(result?.ordinary_pay_projection);
        if (asText(button.dataset.wsCommand) === 'RECOVER_FINALISED_PAY'
            && result?.status === 'FINALISED_PAY_RECOVERY_REQUIRED'
            && recovery.task_id && recovery.run_id && recovery.expected_task_version
            && projection.final_revision_id) {
          session.finaliseRetry = {
            final_revision_id: projection.final_revision_id,
            run_id: recovery.run_id,
            task_id: recovery.task_id,
            expected_task_version: recovery.expected_task_version,
            confirm_retry: true
          };
          repaint();
          return;
        }
        session.finaliseRetry = null;
        await loadWorkspace('finalise');
      } catch (error) { session.error = asText(error?.message); repaint(); }
    });
    host.querySelector('[data-ws-finalise-retry]')?.addEventListener('click', async (event) => {
      const payload = asObject(session.finaliseRetry);
      if (!payload.task_id) return;
      event.currentTarget.disabled = true;
      try {
        await issueCommand('RECOVER_FINALISED_PAY', payload);
        session.finaliseRetry = null;
        await loadWorkspace('finalise');
      } catch (error) { session.error = asText(error?.message); repaint(); }
    });
    const warnings = session.workspace.finalise.rate_warnings;
    const updateRateWarningSelection = () => {
      const eligible = warnings.rows.filter((row) => row.accept_eligible);
      const selected = session.rateWarningSelection;
      const allSelected = eligible.length > 0 && eligible.every((row) => selected.has(row.warning_key));
      const someSelected = eligible.some((row) => selected.has(row.warning_key));
      const header = host.querySelector('[data-ws-rate-warning-header]');
      if (header) {
        header.checked = allSelected;
        header.indeterminate = someSelected && !allSelected;
        header.setAttribute('aria-checked', header.indeterminate ? 'mixed' : (allSelected ? 'true' : 'false'));
        header.setAttribute('aria-label', allSelected ? 'Clear visible rate warnings' : 'Select visible rate warnings');
      }
      const summary = host.querySelector('[data-ws-rate-warning-summary]');
      if (summary) summary.textContent = `${selected.size} warning row${selected.size === 1 ? '' : 's'} selected`;
      const accept = host.querySelector('[data-ws-rate-warning-accept]');
      const confirmation = host.querySelector('[data-ws-rate-warning-confirm]');
      if (confirmation) confirmation.disabled = selected.size === 0;
      const checked = confirmation?.checked === true;
      if (accept) accept.disabled = !checked || !buildRateWarningAcceptancePayload(warnings, [...selected]);
    };
    host.querySelector('[data-ws-rate-warning-header]')?.addEventListener('change', (event) => {
      const eligible = warnings.rows.filter((row) => row.accept_eligible).map((row) => row.warning_key);
      session.rateWarningSelection = new Set(event.target.checked ? eligible : []);
      host.querySelectorAll('[data-ws-rate-warning-select]').forEach((input) => { input.checked = event.target.checked && !input.disabled; });
      updateRateWarningSelection();
    });
    host.querySelectorAll('[data-ws-rate-warning-select]').forEach((input) => input.addEventListener('change', () => {
      input.checked ? session.rateWarningSelection.add(input.value) : session.rateWarningSelection.delete(input.value);
      updateRateWarningSelection();
    }));
    host.querySelector('[data-ws-rate-warning-confirm]')?.addEventListener('change', updateRateWarningSelection);
    host.querySelector('[data-ws-rate-warning-accept]')?.addEventListener('click', async (event) => {
      const request = buildRateWarningAcceptancePayload(warnings, [...session.rateWarningSelection]);
      if (!request) return;
      event.currentTarget.disabled = true;
      try {
        await issueCommand(request.action, request.payload);
        session.rateWarningSelection.clear();
        await loadWorkspace('finalise');
      } catch (error) { session.error = asText(error?.message); repaint(); }
    });
    host.querySelectorAll('[data-ws-rate-expand]').forEach((button) => button.addEventListener('click', () => {
      session.expandedRateWarning = session.expandedRateWarning === button.dataset.wsRateExpand ? '' : button.dataset.wsRateExpand;
      repaint();
    }));
    updateRateWarningSelection();
  }

  function bindInfiniteScroll(host) {
    session.observer?.disconnect?.(); const sentinel = host.querySelector('[data-ws-sentinel]'); const page = pageFor(session.activeTab);
    if (!sentinel || !page?.has_more || !page.next_cursor || typeof IntersectionObserver !== 'function') return;
    session.observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) loadWorkspace(session.activeTab, true); }, { root: host.querySelector('[data-ws-scroll]'), rootMargin: '160px' }); session.observer.observe(sentinel);
  }

  function wire(tab) {
    const host = document.querySelector(`.ws-workspace[data-ws-tab="${CSS.escape(tab)}"]`); if (!host || host.dataset.wsWired === '1') return; host.dataset.wsWired = '1';
    bindCommon(host); if (tab === 'queries') bindQueries(host); if (tab === 'finalise') bindFinalise(host);
    const scroll = host.querySelector('[data-ws-scroll]');
    if (scroll) {
      scroll.scrollTop = Number(session.scrollByTab[tab] || 0);
      scroll.addEventListener('scroll', () => { session.scrollByTab[tab] = scroll.scrollTop; }, { passive: true });
    }
    host.querySelector('[data-ws-history-cycle]')?.addEventListener('change', (event) => { session.workspace.history.cycle_filter = event.target.value; session.scrollByTab.history = 0; loadWorkspace('history'); }); bindInfiniteScroll(host);
  }

  function renderTab(tab) { session.activeTab = TABS.includes(tab) ? tab : 'imports'; const markup = renderWorkspace(session.workspace || emptyWorkspace(), session.activeTab, session); setTimeout(() => wire(session.activeTab), 0); return typeof root.html === 'function' ? root.html(markup) : markup; }

  async function open(initialTab = 'imports') {
    const tab = TABS.includes(initialTab) ? initialTab : 'imports';
    session.activeTab = tab; session.loading = true; session.error = '';
    try { session.workspace = normaliseWorkspace(await requestJson(`${ENDPOINTS.workspace}?tab=${encodeURIComponent(tab)}`)); } catch (error) { session.workspace = emptyWorkspace(); session.error = asText(error?.message); }
    session.loading = false; root.modalCtx = { entity: 'weekly-source-imports', data: {}, weeklySourceState: session };
    if (typeof root.showModal !== 'function') throw new Error('The Imports screen is unavailable.');
    root.showModal('Weekly source imports', tabDescriptors(session.workspace), renderTab, null, false, () => wire(session.activeTab), { kind: 'weekly-source-imports-v1', noParentGate: true, stayOpenOnSave: false, showSave: false, showApply: false, runOnRender: true });
  }

  return Object.freeze({
    CONTRACT, ENDPOINTS, normaliseWorkspace, tabDescriptors, renderWorkspace, selectionSpec,
    normaliseBulkActions, normaliseRateWarnings, buildRateWarningAcceptancePayload, buildOutreachRequest,
    open, requestJson, issueCommand, acceptUpload, uploadSource,
    refresh: (tab = session.activeTab) => loadWorkspace(tab),
    clearShiftSelections: () => { session.shiftSelections.clear(); },
    _test: Object.freeze({ exactAcceptSystemHoursPayload, combinedAcceptSystemHoursPayload }),
    _session: session
  });
});
