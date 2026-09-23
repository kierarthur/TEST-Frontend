(function initialiseWeeklySourceWorkspaceActions(root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof window === 'object' && root === window && !root.CloudTMSWeeklySourceWorkspaceActionsV1) {
    Object.defineProperty(root, 'CloudTMSWeeklySourceWorkspaceActionsV1', {
      configurable: false, enumerable: true, writable: false, value: api
    });
    root.addEventListener('cloudtms:weekly-source-preview', (event) => api.openPreview(event.detail));
    root.addEventListener('cloudtms:weekly-source-batch-preview', (event) => api.openBatchPreview(event.detail));
    root.addEventListener('cloudtms:weekly-source-action', (event) => api.handleAction(event.detail));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildWeeklySourceWorkspaceActions(root) {
  'use strict';

  const CONTRACT = 'WEEKLY_SOURCE_WORKSPACE_ACTIONS_V1';
  const PROFILE_LABELS = Object.freeze({
    NHSP_FINAL_BACKING_V1: 'NHSP backing report',
    NHSP_PREFINAL_RELEASED_V1: 'NHSP released shifts',
    HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1: 'HealthRoster Timesheet Export',
    HEALTHROSTER_WEEKLY_EXPLICIT_ACTUAL_V1: 'HealthRoster Full Timesheet Export',
    ROSTER_WEEKLY_SUMMARY_ACTUAL_V1: 'Weekly source file'
  });
  const NON_TECHNICAL_DETAIL_LABELS = Object.freeze([
    ['candidate', 'Candidate'], ['client', 'Client'], ['trust', 'Trust'], ['shift', 'Shift'],
    ['day_date', 'Day/date'], ['candidate_hours', 'Candidate says they worked'], ['system_hours', 'System hours'],
    ['issue', 'Issue'], ['status', 'Status'], ['age', 'Age'], ['manager', 'Manager'],
    ['manager_contact', 'Manager'], ['candidate_asked_at', 'Candidate asked'],
    ['manager_informed_at', 'Manager informed'], ['next_step', 'Next step'], ['problem', 'Problem'],
    ['guidance', 'What to do'], ['file', 'File'], ['uploaded', 'Uploaded'], ['rows', 'Rows'],
    ['coverage', 'Coverage'], ['report_number', 'Report number'], ['cutoff', 'Cutoff'],
    ['final_source', 'Final source']
  ]);
  const CHARGE_DETAIL_LABELS = Object.freeze([
    ['commission', 'Commission'], ['total_cost', 'Total cost'], ['source_charge', 'Source charge'],
    ['calculated_charge', 'Calculated charge'], ['difference', 'Difference']
  ]);
  const asText = (value) => String(value == null ? '' : value).trim();
  const asArray = (value) => Array.isArray(value) ? value : [];
  const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const escapeHtml = (value) => String(value == null ? '' : value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(asText(value)) ? asText(value) : '';
  const titleCaseStatus = (value) => asText(value).replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (token) => token.toUpperCase());
  const workspaceApi = () => root.CloudTMSWeeklySourceImportWorkspaceV1;

  function plainMessage(value, fallback = 'This item needs attention before you can continue.') {
    const text = asText(value);
    if (!text || /\b(uuid|hash|fingerprint|rpc|tsfin|manifest|stack|sql|exception|workbench|idempotency|generation|authority pointer|work event|rate class)\b/i.test(text)) return fallback;
    return text.replace(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,}\b/g, '').replace(/\s{2,}/g, ' ').trim() || fallback;
  }

  function rowDate(row) {
    return isoDate(row.workDate || row.work_date || row.date || row.date_local);
  }

  function rowCandidate(row) {
    return asText(row.workerName || row.worker_name || row.staff || row.staff_name || row.candidate);
  }

  function rowHours(row) {
    const actual = asObject(row.actual);
    const start = asText(actual.start || row.actualStart || row.actual_start || row.start_at_local || row.start);
    const end = asText(actual.end || row.actualEnd || row.actual_end || row.end_at_local || row.end);
    const breakMinutes = row.breakMinutes ?? row.break_minutes ?? actual.breakMinutes;
    if (!start || !end) return '—';
    return `${start}-${end}${Number.isFinite(Number(breakMinutes)) ? ` · ${Number(breakMinutes)} min break` : ''}`;
  }

  function previewIssue(value) {
    const raw = asObject(value);
    return { message: plainMessage(raw.message || value), physical_row: asText(raw.physicalRow || raw.physical_row) };
  }

  function normalisePreview(detail) {
    const envelope = asObject(detail);
    const preview = asObject(envelope.preview?.preview || envelope.preview);
    const rows = asArray(preview.rows);
    const dates = rows.map(rowDate).filter(Boolean).sort();
    const profileId = asText(preview.profileId || envelope.accept_context?.profile_id);
    const profileLabel = PROFILE_LABELS[profileId] || 'Weekly source file';
    const scope = asObject(preview.scope);
    const first = asObject(rows[0]);
    const finalReport = profileId === 'NHSP_FINAL_BACKING_V1';
    const groupWideNhspPrefinal = profileId === 'NHSP_PREFINAL_RELEASED_V1';
    const trust = asText(scope.trust || asArray(scope.trusts)[0] || first.trust || first.clientName || first.client);
    const reportNumber = asText(preview.reportNumber || preview.report_number || scope.backingReportNumber || scope.reportNumber || scope.report_number);
    const cutoff = asText(envelope.accept_context?.cutoff || preview.cutoff || preview.cutoffLabel);
    const fatal = asArray(preview.fatalErrors).map(previewIssue);
    const warnings = asArray(preview.warnings).map(previewIssue)
      .filter((issue) => !/round/i.test(issue.message));
    const acceptContext = asObject(envelope.accept_context);
    const previousCoverage = asObject(acceptContext.previous_coverage || preview.previousCoverage || preview.previous_coverage);
    const baseAuthorityReady = [
      acceptContext.file_key || envelope.file_key,
      acceptContext.source_group_id,
      acceptContext.source_cycle_id,
      acceptContext.profile_id || profileId
    ].every((value) => asText(value));
    const clientReady = groupWideNhspPrefinal || !!asText(acceptContext.client_id);
    const finalReportReady = !finalReport
      || (!!trust && !!reportNumber && !!cutoff && !!asText(acceptContext.report_scope_id));
    const authorityReady = baseAuthorityReady && clientReady && finalReportReady;
    return {
      ok: envelope.ok === true && preview.ok === true && fatal.length === 0 && authorityReady,
      file_key: asText(envelope.file_key || envelope.accept_context?.file_key),
      filename: asText(envelope.accept_context?.original_filename || preview.fileFacts?.filename),
      profile_id: profileId,
      profile_label: profileLabel,
      final_report: finalReport,
      trust, report_number: reportNumber, cutoff,
      rows,
      counts: asObject(preview.counts || preview.rowCounts),
      coverage_start: dates[0] || '', coverage_end: dates.at(-1) || '',
      previous_coverage_start: isoDate(previousCoverage.start_local_date || previousCoverage.start),
      previous_coverage_end: isoDate(previousCoverage.end_local_date || previousCoverage.end),
      fatal_errors: fatal, warnings,
      accept_context: acceptContext,
      authority_ready: authorityReady
    };
  }

  function previewConfirmation(model, start, end) {
    if (model.final_report) {
      const trust = model.trust || 'the Trust shown';
      const report = model.report_number ? `, report ${model.report_number},` : '';
      return `I confirm this is the complete final NHSP backing report for ${trust}${report} for the cutoff shown.`;
    }
    if (!model.rows.length) return 'I confirm there are no shifts in this date range.';
    return `I confirm this is the complete source file from ${start || 'the start date shown'} to ${end || 'the end date shown'}.`;
  }

  function previewRows(model) {
    const rows = model.rows.slice(0, 100).map((row) => `<tr><td>${escapeHtml(rowCandidate(row) || '—')}</td><td>${escapeHtml(rowDate(row) || '—')}</td><td>${escapeHtml(rowHours(row))}</td><td>${escapeHtml(titleCaseStatus(row.rowKind || row.row_kind || row.sourcePosition || row.source_position) || 'Ready')}</td></tr>`).join('');
    return `<div class="ws-child-scroll"><table class="grid mini ws-child-table"><thead><tr><th>Candidate</th><th>Day/date</th><th>System hours</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="ws-empty">No shift rows are shown in this file.</td></tr>'}</tbody></table></div>${model.rows.length > 100 ? `<p class="mini">Showing the first 100 of ${model.rows.length} rows. The complete file will be checked before it is accepted.</p>` : ''}`;
  }

  function renderPreview(model, state = {}) {
    const start = isoDate(state.coverage_start || model.coverage_start);
    const end = isoDate(state.coverage_end || model.coverage_end);
    const issueMarkup = !model.authority_ready
      ? '<div class="ws-notice ws-notice--danger" role="alert"><strong>This file cannot be accepted yet</strong><span>Recheck the selected source, Trust or client, and finalisation period.</span></div>'
      : model.fatal_errors.length
      ? `<div class="ws-notice ws-notice--danger" role="alert"><strong>This file cannot be accepted yet</strong>${model.fatal_errors.map((issue) => `<span>${escapeHtml(issue.message)}</span>`).join('')}</div>`
      : model.warnings.length
        ? `<div class="ws-notice ws-notice--warning"><strong>Check this file</strong>${model.warnings.map((issue) => `<span>${escapeHtml(issue.message)}</span>`).join('')}</div>` : '';
    const context = [
      ['File', model.filename || 'Selected source file'], ['File type', model.profile_label],
      ...(model.final_report ? [['Trust', model.trust || '—'], ['Report number', model.report_number || '—'], ['Cutoff', model.cutoff || 'As selected']] : [])
    ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    const coverage = model.final_report ? '' : `<fieldset class="ws-child-fieldset"><legend>Complete file period</legend><label>From<input type="date" data-wsa-coverage-start value="${escapeHtml(start)}" required></label><label>To<input type="date" data-wsa-coverage-end value="${escapeHtml(end)}" required></label></fieldset>`;
    const shorter = !model.final_report && !!model.previous_coverage_start && !!model.previous_coverage_end
      && (!!start && start > model.previous_coverage_start || !!end && end < model.previous_coverage_end);
    const shorterConfirmation = shorter ? `<div class="ws-notice ws-notice--warning"><span>This period is shorter than the previous complete file.</span></div><label class="ws-confirm"><input type="checkbox" data-wsa-shrink-confirm${state.shrink_acknowledged ? ' checked' : ''}><span>I confirm this shorter date range is complete.</span></label>` : '';
    const confirmation = previewConfirmation(model, start, end);
    return `<div class="ws-child" data-wsa-screen="preview"><div class="ws-child-context">${context}</div>${issueMarkup}${coverage}${shorterConfirmation}${previewRows(model)}<label class="ws-confirm"><input type="checkbox" data-wsa-confirm${state.confirmed ? ' checked' : ''}${model.ok ? '' : ' disabled'}><span>${escapeHtml(confirmation)}</span></label>${state.error ? `<div class="ws-notice ws-notice--danger" role="alert"><strong>The source file was not accepted</strong><span>${escapeHtml(plainMessage(state.error, 'Recheck the file and try again.'))}</span></div>` : ''}<div class="ws-child-actions"><button type="button" class="btn btn-outline" data-wsa-close>Cancel</button><button type="button" class="btn primary" data-wsa-accept${model.ok && state.confirmed && (!shorter || state.shrink_acknowledged) ? '' : ' disabled'}>${state.busy ? 'Checking…' : state.failed ? 'Try again' : 'Accept source file'}</button></div></div>`;
  }

  function buildUploadAcceptancePayload(model, state = {}) {
    const context = asObject(model.accept_context);
    const payload = {
      file_key: asText(context.file_key || model.file_key),
      original_filename: asText(context.original_filename || model.filename),
      source_group_id: asText(context.source_group_id),
      source_cycle_id: asText(context.source_cycle_id),
      client_id: asText(context.client_id) || undefined,
      report_scope_id: asText(context.report_scope_id) || undefined,
      profile_id: asText(context.profile_id || model.profile_id),
      parser_options: { ...asObject(context.parser_options), profileId: asText(context.profile_id || model.profile_id) }
    };
    if (!model.final_report) {
      payload.coverage = {
        start_local_date: isoDate(state.coverage_start || model.coverage_start),
        end_local_date: isoDate(state.coverage_end || model.coverage_end),
        proof_kind: model.rows.length ? (model.profile_id.startsWith('HEALTHROSTER_') ? 'HEALTHROSTER_COMPLETE_EXPORT_ATTESTATION' : 'OFFICE_COMPLETE_EXPORT_ATTESTATION') : 'EXPLICIT_EMPTY_CONFIRMATION',
        shrink_acknowledged: state.shrink_acknowledged === true
      };
    }
    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
    return payload;
  }

  function normaliseDetail(payload, label = 'View details') {
    const raw = asObject(payload.detail || payload.details || payload);
    const fields = NON_TECHNICAL_DETAIL_LABELS.map(([key, fieldLabel]) => ({ label: fieldLabel, value: asText(raw[key]) })).filter((field) => field.value);
    const chargeFields = label === 'Open charge details'
      ? CHARGE_DETAIL_LABELS.map(([key, fieldLabel]) => ({ label: fieldLabel, value: asText(raw[key]) })).filter((field) => field.value)
      : [];
    return {
      title: label === 'Open charge details' ? 'Charge details' : label === 'View final source' ? 'Final source' : 'Weekly source details',
      heading: asText(raw.heading || raw.title),
      body: plainMessage(raw.body || raw.message || raw.guidance, ''),
      fields: [...fields, ...chargeFields],
      shifts: asArray(raw.shifts).map((row) => ({
        day_date: asText(row.day_date), candidate_hours: asText(row.candidate_hours),
        system_hours: asText(row.system_hours), issue: plainMessage(row.issue, ''), status: asText(row.status?.text || (typeof row.status === 'string' ? row.status : ''))
      }))
    };
  }

  function renderDetail(model) {
    const fields = model.fields.map((field) => `<div><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(field.value)}</strong></div>`).join('');
    const shifts = model.shifts.length ? `<div class="ws-child-scroll"><table class="grid mini ws-child-table"><thead><tr><th>Day/date</th><th>Candidate says they worked</th><th>System hours</th><th>Issue and status</th></tr></thead><tbody>${model.shifts.map((row) => `<tr><td>${escapeHtml(row.day_date || '—')}</td><td>${escapeHtml(row.candidate_hours || '—')}</td><td>${escapeHtml(row.system_hours || '—')}</td><td>${escapeHtml([row.issue, row.status].filter(Boolean).join(' · ') || '—')}</td></tr>`).join('')}</tbody></table></div>` : '';
    return `<div class="ws-child" data-wsa-screen="details">${model.heading ? `<h3>${escapeHtml(model.heading)}</h3>` : ''}${model.body ? `<p>${escapeHtml(model.body)}</p>` : ''}${fields ? `<div class="ws-child-context">${fields}</div>` : ''}${shifts}<div class="ws-child-actions"><button type="button" class="btn primary" data-wsa-close>Close</button></div></div>`;
  }

  function normaliseContractChooser(payload) {
    const raw = asObject(payload);
    const choices = asArray(raw.choices || raw.contract_choices || raw.qualifying_contracts).map((entry) => {
      const item = asObject(entry);
      return {
        id: asText(item.contract_id || item.id), role_band: asText(item.role_band || item.role || item.band),
        site: asText(item.site || item.contract_site), dates: asText(item.dates || item.contract_dates),
        pay_type: asText(item.pay_type), details_label: asText(item.details_label) || 'View contract'
      };
    }).filter((entry) => entry.id);
    return {
      choices, candidate: asText(raw.candidate), client: asText(raw.client), shift: asText(raw.shift),
      source_role_band: asText(raw.source_role_band), source_row_ordinal: asText(raw.source_row_ordinal),
      accept_payload: asObject(raw.accept_payload), existing_selections: asObject(raw.contract_selections)
    };
  }

  function renderContractChooser(model, state = {}) {
    const context = [['Candidate',model.candidate],['Client',model.client],['Shift',model.shift],['Source role / band',model.source_role_band]].filter(([,value]) => value).map(([label,value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    const rows = model.choices.map((choice) => `<tr><td><input type="radio" name="wsa-contract" value="${escapeHtml(choice.id)}" aria-label="Choose ${escapeHtml(choice.role_band || 'contract')}"${state.selected === choice.id ? ' checked' : ''}></td><td>${escapeHtml(choice.role_band || '—')}</td><td>${escapeHtml(choice.site || '—')}</td><td>${escapeHtml(choice.dates || '—')}</td><td>${escapeHtml(choice.pay_type || '—')}</td><td><button type="button" class="btn btn-outline" data-wsa-view-contract="${escapeHtml(choice.id)}">${escapeHtml(choice.details_label)}</button></td></tr>`).join('');
    return `<div class="ws-child" data-wsa-screen="contract"><div class="ws-child-context">${context}</div><p>More than one contract matches this shift. Choose the one that applies.</p><div class="ws-child-scroll"><table class="grid mini ws-child-table"><thead><tr><th>Choose</th><th>Role / band</th><th>Contract site</th><th>Contract dates</th><th>Pay type</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></div>${state.error ? `<div class="ws-notice ws-notice--danger" role="alert"><span>${escapeHtml(plainMessage(state.error))}</span></div>` : ''}<div class="ws-child-actions"><button type="button" class="btn btn-outline" data-wsa-close>Cancel</button><button type="button" class="btn primary" data-wsa-use-contract${state.selected && !state.busy ? '' : ' disabled'}>${state.failed ? 'Try again' : 'Use selected contract'}</button></div></div>`;
  }

  function normaliseCorrectFinal(payload) {
    const raw = asObject(payload);
    const base = asObject(raw.correction_payload || raw.command_payload);
    return {
      base_payload: base,
      source_label: asText(raw.source_label) || 'Replacement source',
      scope_label: asText(raw.scope_label),
      current_label: asText(raw.current_label),
      replacement_context: asObject(raw.replacement_context)
    };
  }

  function normaliseCorrectFinalPreview(payload) {
    const raw = asObject(payload);
    const changes = asArray(raw.changes).map((rowValue) => {
      const row = asObject(rowValue);
      return {
        candidate: plainMessage(row.candidate, 'Candidate'),
        day_date: plainMessage(row.day_date, '—'),
        current_final: plainMessage(row.current_final, '—'),
        replacement: plainMessage(row.replacement, '—'),
        result: plainMessage(row.result, 'Changed')
      };
    });
    const blockers = asArray(raw.blockers).map((rowValue) => {
      const row = asObject(rowValue);
      return {
        candidate: plainMessage(row.candidate, 'Candidate'),
        day_date: plainMessage(row.day_date, '—'),
        problem: plainMessage(row.problem),
        action: plainMessage(row.action, 'View details')
      };
    });
    return {
      ready: raw.ok === true && raw.status === 'READY_FOR_CONFIRMATION'
        && blockers.length === 0 && Object.keys(asObject(raw.apply_context)).length > 0,
      changes,
      blockers,
      confirmation_text: plainMessage(raw.confirmation_text, 'I understand this will replace the current final version.'),
      review_context: asObject(raw.review_context),
      apply_context: asObject(raw.apply_context)
    };
  }

  function correctFinalTable(model, activeTab) {
    if (activeTab === 'blocked') {
      const rows = model.blockers.map((row) => `<tr><td>${escapeHtml(row.candidate)}</td><td>${escapeHtml(row.day_date)}</td><td>${escapeHtml(row.problem)}</td><td>${escapeHtml(row.action)}</td></tr>`).join('');
      return `<div class="ws-child-scroll"><table class="grid mini ws-child-table"><thead><tr><th>Candidate</th><th>Day/date</th><th>Problem</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="ws-empty">Nothing is blocking this correction.</td></tr>'}</tbody></table></div>`;
    }
    const rows = model.changes.map((row) => `<tr><td>${escapeHtml(row.candidate)}</td><td>${escapeHtml(row.day_date)}</td><td>${escapeHtml(row.current_final)}</td><td>${escapeHtml(row.replacement)}</td><td>${escapeHtml(row.result)}</td></tr>`).join('');
    return `<div class="ws-child-scroll"><table class="grid mini ws-child-table"><thead><tr><th>Candidate</th><th>Day/date</th><th>Current final</th><th>Replacement</th><th>Result</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="ws-empty">No changed rows were found.</td></tr>'}</tbody></table></div>`;
  }

  function renderCorrectFinal(model, state = {}) {
    const context = `<div class="ws-child-context">${model.current_label ? `<div><span>Current final</span><strong>${escapeHtml(model.current_label)}</strong></div>` : ''}${model.scope_label ? `<div><span>Trust and cutoff</span><strong>${escapeHtml(model.scope_label)}</strong></div>` : ''}${state.filename ? `<div><span>Replacement file</span><strong>${escapeHtml(state.filename)}</strong></div>` : ''}</div>`;
    const error = state.error ? `<div class="ws-notice ws-notice--danger" role="alert"><strong>${state.phase === 'reviewed' ? 'The final source was not changed' : 'The replacement could not be reviewed'}</strong><span>${escapeHtml(plainMessage(state.error, state.phase === 'reviewed' ? 'Recheck the blockers and try again.' : 'Recheck the file and try again.'))}</span></div>` : '';
    if (state.phase !== 'reviewed') {
      return `<div class="ws-child" data-wsa-screen="correct-final"><p>The previous final version will remain in History.</p>${context}<div class="ws-child-fields"><span>Upload the replacement source file again</span><label class="btn btn-outline ws-file-button">Choose file<input type="file" data-wsa-replacement-file hidden accept=".xlsx,.xls,.csv,.htm,.html"${state.busy ? ' disabled' : ''}></label>${state.filename ? `<strong>${escapeHtml(state.filename)}</strong>` : ''}</div>${error}<div class="ws-child-actions"><button type="button" class="btn btn-outline" data-wsa-close>${state.busy ? 'Close' : 'Cancel'}</button><button type="button" class="btn primary" data-wsa-review-correction${state.file && !state.busy ? '' : ' disabled'}>${state.busy ? 'Reviewing…' : 'Review replacement'}</button></div></div>`;
    }
    const preview = state.preview;
    const activeTab = state.active_tab === 'blocked' ? 'blocked' : 'changes';
    const tabs = `<div class="ws-child-tablist" role="tablist" aria-label="Correction review"><button type="button" role="tab" data-wsa-correction-tab="changes" aria-selected="${activeTab === 'changes'}">Changes (${preview.changes.length})</button><button type="button" role="tab" data-wsa-correction-tab="blocked" aria-selected="${activeTab === 'blocked'}">Blocked (${preview.blockers.length})</button></div>`;
    const blocked = preview.blockers.length ? '<div class="ws-notice ws-notice--warning" role="status"><strong>This correction cannot be applied yet</strong><span>Resolve every blocked item, then review the replacement again.</span></div>' : '';
    const confirmation = `<div class="ws-child-fields"><label>Reason<textarea data-wsa-correction-reason maxlength="1000" required>${escapeHtml(state.reason || '')}</textarea></label></div><label class="ws-confirm"><input type="checkbox" data-wsa-correction-confirm${state.confirmed ? ' checked' : ''}${preview.ready ? '' : ' disabled'}><span>${escapeHtml(preview.confirmation_text)}</span></label>`;
    const applyEnabled = preview.ready && asText(state.reason) && state.confirmed && !state.busy;
    return `<div class="ws-child" data-wsa-screen="correct-final"><p>The previous final version will remain in History.</p>${context}${blocked}${tabs}${correctFinalTable(preview, activeTab)}${confirmation}${error}<div class="ws-child-actions"><button type="button" class="btn btn-outline" data-wsa-close>Close</button>${preview.blockers.length ? '<button type="button" class="btn primary" data-wsa-review-correction>Recheck</button>' : `<button type="button" class="btn primary" data-wsa-apply-correction${applyEnabled ? '' : ' disabled'}>${state.busy ? 'Applying…' : 'Apply corrected final source'}</button>`}</div></div>`;
  }

  function renderCommandConfirmation(model, state = {}) {
    return `<div class="ws-child" data-wsa-screen="command"><p>${escapeHtml(model.message)}</p>${model.context ? `<div class="ws-child-context">${NON_TECHNICAL_DETAIL_LABELS.map(([key,label]) => asText(model.context[key]) ? `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(asText(model.context[key]))}</strong></div>` : '').join('')}</div>` : ''}<label class="ws-confirm"><input type="checkbox" data-wsa-confirm${state.confirmed ? ' checked' : ''}><span>${escapeHtml(model.confirmation)}</span></label>${state.error ? `<div class="ws-notice ws-notice--danger" role="alert"><span>${escapeHtml(plainMessage(state.error))}</span></div>` : ''}<div class="ws-child-actions"><button type="button" class="btn btn-outline" data-wsa-close>Cancel</button><button type="button" class="btn primary" data-wsa-run-command${state.confirmed && !state.busy ? '' : ' disabled'}>${state.failed ? 'Try again' : escapeHtml(model.action_label)}</button></div></div>`;
  }

  function currentChild(kind) {
    const stack = Array.isArray(root.__modalStack) ? root.__modalStack : [];
    const frame = stack[stack.length - 1];
    return frame?.kind === kind ? frame : null;
  }

  function closeChild() {
    const button = root.document?.getElementById('btnCloseModal');
    if (button) button.click();
    else root.closeModal?.();
  }

  function openChild({ title, kind, render, wire }) {
    if (typeof root.showModal !== 'function') return false;
    root.modalCtx = { entity: 'weekly-source-child', data: {}, weeklySourceChildKind: kind };
    root.showModal(title, [{ key: 'main', label: title }], () => {
      const markup = render();
      setTimeout(wire, 0);
      return typeof root.html === 'function' ? root.html(markup) : markup;
    }, null, false, wire, { kind, noParentGate: true, showSave: false, showApply: false, runOnRender: true });
    return true;
  }

  function rerender(kind) {
    const frame = currentChild(kind);
    if (frame?.setTab) Promise.resolve(frame.setTab('main')).catch(() => {});
  }

  function markCompletedChildClean() {
    const stack = Array.isArray(root.__modalStack) ? root.__modalStack : [];
    const frame = stack[stack.length - 1];
    if (!frame || !asText(frame.kind).startsWith('weekly-source-')) return;
    frame.isDirty = false;
    frame._snapshot = null;
    frame._updateButtons?.();
  }

  async function finishAction() {
    // The shared modal shell treats changes to confirmation controls as form
    // edits. Once the server has completed the requested action, this child no
    // longer owns unsaved input and must close without a discard prompt.
    markCompletedChildClean();
    closeChild();
    await workspaceApi()?.refresh?.();
  }

  function normaliseBatchPreview(details) {
    const entries = asArray(details).map((entry, index) => {
      const model = entry?.detail ? normalisePreview(entry.detail) : null;
      return {
        index, filename: asText(entry?.filename || model?.filename) || `File ${index + 1}`,
        model, error: asText(entry?.error), duplicate: false, status: 'PENDING'
      };
    });
    const trusts = new Map();
    for (const entry of entries) {
      if (!entry.model?.ok || !entry.model.final_report || !entry.model.trust) continue;
      const key = `${entry.model.trust.toLocaleLowerCase('en-GB')}|${entry.model.cutoff}`;
      const group = trusts.get(key) || [];
      group.push(entry);
      trusts.set(key, group);
    }
    for (const group of trusts.values()) if (group.length > 1) group.forEach((entry) => { entry.duplicate = true; });
    return entries;
  }

  function renderBatchPreview(entries, state) {
    const rows = entries.map((entry) => {
      const ready = entry.model?.ok && entry.model.final_report && !entry.duplicate && !entry.error;
      const issue = entry.duplicate
        ? 'More than one selected backing report belongs to this Trust and cutoff. Upload these separately.'
        : entry.error || entry.model?.fatal_errors?.[0]?.message
          || (!ready ? 'This backing report could not be prepared for acceptance.' : '');
      const status = entry.status === 'ACCEPTED' ? 'Accepted'
        : entry.status === 'FAILED' ? 'Not accepted'
          : ready ? 'Ready' : 'Needs attention';
      return `<div class="ws-batch-report" data-wsa-batch-row="${entry.index}"><label class="ws-batch-report__select"><input type="checkbox" data-wsa-batch-select="${entry.index}"${ready && entry.status !== 'ACCEPTED' && !state.busy ? '' : ' disabled'}${state.selected.has(entry.index) && entry.status !== 'ACCEPTED' ? ' checked' : ''}><span class="ws-batch-report__file">${escapeHtml(entry.filename)}</span></label><div class="ws-batch-report__facts"><span>Trust <strong>${escapeHtml(entry.model?.trust || '—')}</strong></span><span>Report <strong>${escapeHtml(entry.model?.report_number || '—')}</strong></span><span>Cutoff <strong>${escapeHtml(entry.model?.cutoff || '—')}</strong></span><span class="ws-status ws-status--${entry.status === 'ACCEPTED' ? 'positive' : ready && entry.status !== 'FAILED' ? 'info' : 'warning'}">${status}</span></div>${issue || entry.status === 'FAILED' ? `<p class="ws-batch-report__issue">${escapeHtml(plainMessage(entry.error || issue, 'Recheck this file before retrying.'))}</p>` : ''}</div>`;
    }).join('');
    const pending = entries.filter((entry) => state.selected.has(entry.index) && entry.status !== 'ACCEPTED' && entry.model?.ok && !entry.duplicate);
    const accepted = entries.filter((entry) => entry.status === 'ACCEPTED').length;
    return `<div class="ws-child ws-batch-preview" data-wsa-screen="batch-preview"><p>Review each backing report before accepting it. Each Trust stays separate; no week is finalised here.</p><div class="ws-child-scroll ws-batch-preview__list">${rows}</div><label class="ws-confirm"><input type="checkbox" data-wsa-batch-confirm${state.confirmed ? ' checked' : ''}${pending.length && !state.busy ? '' : ' disabled'}><span>I confirm the selected reports and their Trusts.</span></label><div class="ws-child-actions"><span role="status">${accepted} accepted · ${pending.length} selected</span><button type="button" class="btn btn-outline" data-wsa-batch-close${state.busy ? ' disabled' : ''}>${accepted ? 'Done' : 'Close'}</button><button type="button" class="btn primary" data-wsa-batch-accept${pending.length && state.confirmed && !state.busy ? '' : ' disabled'}>${state.busy ? 'Accepting…' : 'Accept selected reports'}</button></div></div>`;
  }

  function openBatchPreview(details) {
    const entries = normaliseBatchPreview(details);
    const state = {
      selected: new Set(entries.filter((entry) => entry.model?.ok && entry.model.final_report && !entry.duplicate).map((entry) => entry.index)),
      confirmed: false, busy: false
    };
    const kind = 'weekly-source-batch-preview-v1';
    const render = () => renderBatchPreview(entries, state);
    const wire = () => {
      const host = root.document?.querySelector('[data-wsa-screen="batch-preview"]');
      if (!host || host.dataset.wsaWired === '1') return;
      host.dataset.wsaWired = '1';
      host.querySelectorAll('[data-wsa-batch-select]').forEach((input) => input.addEventListener('change', () => {
        const index = Number(input.dataset.wsaBatchSelect);
        input.checked ? state.selected.add(index) : state.selected.delete(index);
        state.confirmed = false;
        rerender(kind);
      }));
      host.querySelector('[data-wsa-batch-confirm]')?.addEventListener('change', (event) => {
        state.confirmed = event.target.checked;
        rerender(kind);
      });
      host.querySelector('[data-wsa-batch-close]')?.addEventListener('click', async () => {
        markCompletedChildClean();
        closeChild();
        if (entries.some((entry) => entry.status === 'ACCEPTED')) await workspaceApi()?.refresh?.('imports');
      });
      host.querySelector('[data-wsa-batch-accept]')?.addEventListener('click', async () => {
        if (!state.confirmed || state.busy) return;
        state.busy = true;
        rerender(kind);
        for (const entry of entries) {
          if (!state.selected.has(entry.index) || entry.status === 'ACCEPTED' || !entry.model?.ok || entry.duplicate) continue;
          try {
            await workspaceApi()?.acceptUpload?.(buildUploadAcceptancePayload(entry.model, { confirmed: true }));
            entry.status = 'ACCEPTED';
            entry.error = '';
            state.selected.delete(entry.index);
            workspaceApi()?.selectAcceptedScope?.(entry.model.accept_context);
          } catch (error) {
            entry.status = 'FAILED';
            entry.error = asText(error?.message) || 'This backing report was not accepted.';
          }
        }
        state.busy = false;
        state.confirmed = false;
        rerender(kind);
      });
    };
    return openChild({ title: 'Review backing reports', kind, render, wire });
  }

  function openPreview(detail) {
    const model = normalisePreview(detail);
    const state = { coverage_start: model.coverage_start, coverage_end: model.coverage_end, confirmed: false, busy: false, failed: false, error: '' };
    const kind = 'weekly-source-preview-v1';
    const render = () => renderPreview(model, state);
    const wire = () => {
      const host = root.document?.querySelector('[data-wsa-screen="preview"]');
      if (!host || host.dataset.wsaWired === '1') return;
      host.dataset.wsaWired = '1';
      host.querySelector('[data-wsa-close]')?.addEventListener('click', closeChild);
      const sync = () => {
        state.coverage_start = host.querySelector('[data-wsa-coverage-start]')?.value || state.coverage_start;
        state.coverage_end = host.querySelector('[data-wsa-coverage-end]')?.value || state.coverage_end;
        state.confirmed = host.querySelector('[data-wsa-confirm]')?.checked === true;
        state.shrink_acknowledged = host.querySelector('[data-wsa-shrink-confirm]')?.checked === true;
        const shorter = !model.final_report && !!model.previous_coverage_start && !!model.previous_coverage_end
          && (!!state.coverage_start && state.coverage_start > model.previous_coverage_start || !!state.coverage_end && state.coverage_end < model.previous_coverage_end);
        const button = host.querySelector('[data-wsa-accept]');
        if (button) button.disabled = !model.ok || !state.confirmed || (shorter && !state.shrink_acknowledged) || state.busy || (!model.final_report && (!isoDate(state.coverage_start) || !isoDate(state.coverage_end) || state.coverage_start > state.coverage_end));
      };
      host.querySelectorAll('[data-wsa-coverage-start],[data-wsa-coverage-end]').forEach((input) => input.addEventListener('change', () => { sync(); rerender(kind); }));
      host.querySelectorAll('[data-wsa-confirm],[data-wsa-shrink-confirm]').forEach((input) => input.addEventListener('change', sync));
      sync();
      host.querySelector('[data-wsa-accept]')?.addEventListener('click', async () => {
        sync(); state.busy = true; state.error = ''; rerender(kind);
        try { await workspaceApi()?.acceptUpload?.(buildUploadAcceptancePayload(model, state)); await finishAction(); }
        catch (error) { state.busy = false; state.failed = true; state.error = error?.message; rerender(kind); }
      });
    };
    return openChild({ title: 'Review source file', kind, render, wire });
  }

  function openDetail(payload, label) {
    const model = normaliseDetail(payload, label);
    const kind = 'weekly-source-details-v1';
    return openChild({ title: model.title, kind, render: () => renderDetail(model), wire: () => {
      const host = root.document?.querySelector('[data-wsa-screen="details"]');
      if (!host || host.dataset.wsaWired === '1') return;
      host.dataset.wsaWired = '1'; host.querySelector('[data-wsa-close]')?.addEventListener('click', closeChild);
    } });
  }

  function openContractChooser(payload) {
    const model = normaliseContractChooser(payload);
    if (model.choices.length < 2) return false;
    const state = { selected: '', busy: false, failed: false, error: '' };
    const kind = 'weekly-source-contract-chooser-v1';
    const render = () => renderContractChooser(model, state);
    const wire = () => {
      const host = root.document?.querySelector('[data-wsa-screen="contract"]');
      if (!host || host.dataset.wsaWired === '1') return;
      host.dataset.wsaWired = '1'; host.querySelector('[data-wsa-close]')?.addEventListener('click', closeChild);
      host.querySelectorAll('input[name="wsa-contract"]').forEach((input) => input.addEventListener('change', () => { state.selected = input.checked ? input.value : state.selected; host.querySelector('[data-wsa-use-contract]').disabled = !state.selected; }));
      host.querySelectorAll('[data-wsa-view-contract]').forEach((button) => button.addEventListener('click', () => {
        const choice = model.choices.find((entry) => entry.id === button.dataset.wsaViewContract);
        if (choice && typeof root.openContract === 'function') root.openContract({ id: choice.id });
      }));
      host.querySelector('[data-wsa-use-contract]')?.addEventListener('click', async () => {
        if (!state.selected || !model.source_row_ordinal || !asText(model.accept_payload.file_key)) return;
        state.busy = true; state.error = ''; rerender(kind);
        try {
          await workspaceApi()?.acceptUpload?.({ ...model.accept_payload, contract_selections: { ...model.existing_selections, [model.source_row_ordinal]: state.selected } });
          await finishAction();
        } catch (error) { state.busy = false; state.failed = true; state.error = error?.message; rerender(kind); }
      });
    };
    return openChild({ title: 'Choose contract', kind, render, wire });
  }

  function correctFinalAuthorityReady(payload) {
    const raw = asObject(payload);
    const kind = asText(raw.authority_scope_kind).toUpperCase();
    return ['expected_current_final_revision_id', 'expected_final_manifest_hash', 'idempotency_key', 'source_cycle_id']
      .every((key) => asText(raw[key]))
      && ['CYCLE', 'NHSP_REPORT_SCOPE'].includes(kind)
      && (kind === 'NHSP_REPORT_SCOPE') === !!asText(raw.report_scope_id);
  }

  function openCorrectFinal(payload) {
    const model = normaliseCorrectFinal(payload);
    if (!correctFinalAuthorityReady(model.base_payload)) {
      return openDetail({ detail: { problem: 'This action is not available yet.', guidance: 'Recheck the Weekly source screen and try again.' } }, 'View details');
    }
    const state = { file: null, filename: '', phase: 'choose', preview: null, active_tab: 'changes', reason: '', confirmed: false, busy: false, error: '', recheck_count: 0 };
    const kind = 'weekly-source-correct-final-v1';
    const render = () => renderCorrectFinal(model, state);
    const wire = () => {
      const host = root.document?.querySelector('[data-wsa-screen="correct-final"]');
      if (!host || host.dataset.wsaWired === '1') return;
      host.dataset.wsaWired = '1'; host.querySelector('[data-wsa-close]')?.addEventListener('click', closeChild);
      const review = async () => {
        const rechecking = state.phase === 'reviewed'
          && state.preview?.blockers?.length > 0
          && Object.keys(asObject(state.preview?.review_context)).length > 0;
        if ((!rechecking && !state.file) || state.busy) return;
        state.busy = true; state.error = ''; rerender(kind);
        try {
          let request;
          if (rechecking) {
            state.recheck_count += 1;
            request = {
              correction_context: state.preview.review_context,
              idempotency_key: `${asText(model.base_payload.idempotency_key)}:recheck:${state.recheck_count}`
            };
          } else {
            if (typeof root.uploadImportFileToR2 !== 'function') throw new Error('File upload is unavailable.');
            const stored = await root.uploadImportFileToR2(state.file);
            const replacementSource = {
              ...model.replacement_context,
              file_key: asText(stored?.fileKey),
              original_filename: asText(stored?.filename || state.filename)
            };
            request = { ...model.base_payload, replacement_source: replacementSource };
          }
          const response = await workspaceApi()?.issueCommand?.('PREVIEW_CORRECT_FINAL_SOURCE', request);
          state.preview = normaliseCorrectFinalPreview(response);
          state.phase = 'reviewed';
          state.active_tab = state.preview.blockers.length ? 'blocked' : 'changes';
          state.confirmed = false; state.reason = ''; state.busy = false; rerender(kind);
        } catch (error) {
          state.busy = false; state.error = error?.message; rerender(kind);
        }
      };
      host.querySelector('[data-wsa-replacement-file]')?.addEventListener('change', (event) => {
        state.file = event.target.files?.[0] || null;
        state.filename = state.file?.name || '';
        rerender(kind);
      });
      host.querySelector('[data-wsa-review-correction]')?.addEventListener('click', review);
      host.querySelectorAll('[data-wsa-correction-tab]').forEach((button) => button.addEventListener('click', () => {
        state.active_tab = button.dataset.wsaCorrectionTab === 'blocked' ? 'blocked' : 'changes';
        rerender(kind);
      }));
      const sync = () => {
        state.reason = host.querySelector('[data-wsa-correction-reason]')?.value || state.reason;
        state.confirmed = host.querySelector('[data-wsa-correction-confirm]')?.checked === true;
        const apply = host.querySelector('[data-wsa-apply-correction]');
        if (apply) apply.disabled = !state.preview?.ready || !asText(state.reason) || !state.confirmed || state.busy;
      };
      host.querySelector('[data-wsa-correction-reason]')?.addEventListener('input', sync);
      host.querySelector('[data-wsa-correction-confirm]')?.addEventListener('change', sync);
      host.querySelector('[data-wsa-apply-correction]')?.addEventListener('click', async () => {
        sync();
        if (!state.preview?.ready || !asText(state.reason) || !state.confirmed || state.busy) return;
        state.busy = true; state.error = ''; rerender(kind);
        try {
          await workspaceApi()?.issueCommand?.('APPLY_CORRECT_FINAL_SOURCE', {
            correction_context: state.preview.apply_context,
            reason: state.reason,
            confirmation_text: state.preview.confirmation_text,
            idempotency_key: `${asText(model.base_payload.idempotency_key)}:confirm`
          });
          await finishAction();
        } catch (error) {
          state.busy = false;
          state.error = 'The final source was not changed. Recheck the blockers and try again.';
          rerender(kind);
        }
      });
    };
    return openChild({ title: 'Correct final source', kind, render, wire });
  }

  function commandModel(detail) {
    const label = asText(detail.label);
    const payload = asObject(detail.payload);
    const context = asObject(detail.context);
    if (label === 'No shifts to import') return {
      title: 'No shifts to import', message: 'Use this only when this Trust or client has no source shifts for the week shown.',
      confirmation: 'I confirm there are no shifts to import for this week.', action_label: 'Confirm no shifts to import', context
    };
    if (label === 'Accept system hours') return {
      title: 'Accept system hours', message: 'This resolves the selected hours queries using the system hours shown.',
      confirmation: 'I confirm the system hours are correct for the selected shifts.', action_label: 'Accept system hours', context
    };
    if (label === 'Remind candidate') return {
      title: 'Remind candidate', message: 'The candidate will receive another reminder for the existing request. The original deadline will not change.',
      confirmation: 'Send this reminder now.', action_label: 'Send reminder', context
    };
    return {
      title: label || 'Confirm action', message: plainMessage(payload.confirmation_message || payload.message),
      confirmation: `I confirm I want to ${label.toLowerCase()}.`, action_label: label || 'Confirm', context
    };
  }

  function commandFor(detail) {
    const explicit = asText(detail.command).toUpperCase();
    if (explicit) return explicit;
    if (detail.label === 'Remind candidate') return 'REMIND_CANDIDATE';
    if (detail.label === 'Accept system hours') return 'ACCEPT_SYSTEM_HOURS';
    return '';
  }

  function commandAuthorityAvailable(command, payload) {
    if (!command || !Object.keys(payload).length) return false;
    if (command === 'REMIND_CANDIDATE') return !!asText(payload.candidate_generation_id) && !!asText(payload.projection_publication_id);
    if (command === 'ACCEPT_SYSTEM_HOURS') {
      const selection = asObject(payload.selection);
      const groupKeys = asArray(selection.group_keys).map(asText).filter(Boolean);
      const incidentIds = asArray(selection.incident_ids).map(asText).filter(Boolean);
      const excluded = asArray(selection.excluded_group_keys).map(asText).filter(Boolean);
      const proofs = asArray(selection.group_selection_proofs).map(asObject);
      return asText(payload.action).toUpperCase() === 'ACCEPT_SYSTEM_HOURS'
        && [payload.source_cycle_id, payload.projection_publication_id].every((value) => asText(value))
        && /^[0-9a-f]{64}$/.test(asText(payload.expected_workspace_version).toLowerCase())
        && asText(selection.mode).toUpperCase() === 'EXPLICIT'
        && groupKeys.length > 0 && new Set(groupKeys).size === groupKeys.length
        && groupKeys.every((value) => /^qg_[0-9a-f]{64}$/.test(value))
        && incidentIds.length > 0 && new Set(incidentIds).size === incidentIds.length
        && excluded.length === 0 && selection.selection_proof == null
        && proofs.length === groupKeys.length
        && new Set(proofs.map((proof) => asText(proof.group_key))).size === groupKeys.length
        && proofs.every((proof) => groupKeys.includes(asText(proof.group_key))
          && /^[0-9a-f]{64}$/.test(asText(proof.selection_proof).toLowerCase()));
    }
    if (command === 'CORRECT_FINAL_SOURCE') return false;
    if (command === 'NO_SHIFTS_TO_IMPORT') return !!asText(payload.source_cycle_id)
      && !!asText(payload.source_group_id)
      && !!asText(payload.client_id)
      && Number.isInteger(Number(payload.expected_cycle_version))
      && Number(payload.expected_cycle_version) >= 0
      && !!asText(payload.attestation_text);
    if (command === 'PROTECT_PAY') return !!asText(payload.expected_record_version);
    return false;
  }

  function openCommand(detail) {
    const payload = asObject(detail.payload);
    const command = commandFor(detail);
    if (!commandAuthorityAvailable(command, payload)) return openDetail({ detail: { problem: 'This action is not available yet.', guidance: 'Recheck the Weekly source screen and try again.' } }, 'View details');
    const model = commandModel(detail);
    const state = { confirmed: false, busy: false, failed: false, error: '' };
    const kind = 'weekly-source-command-confirm-v1';
    const render = () => renderCommandConfirmation(model, state);
    const wire = () => {
      const host = root.document?.querySelector('[data-wsa-screen="command"]');
      if (!host || host.dataset.wsaWired === '1') return;
      host.dataset.wsaWired = '1'; host.querySelector('[data-wsa-close]')?.addEventListener('click', closeChild);
      host.querySelector('[data-wsa-confirm]')?.addEventListener('change', (event) => { state.confirmed = event.target.checked; host.querySelector('[data-wsa-run-command]').disabled = !state.confirmed; });
      host.querySelector('[data-wsa-run-command]')?.addEventListener('click', async () => {
        if (!state.confirmed) return; state.busy = true; state.error = ''; rerender(kind);
        try {
          await workspaceApi()?.issueCommand?.(command, payload);
          if (command === 'ACCEPT_SYSTEM_HOURS') workspaceApi()?.clearShiftSelections?.();
          await finishAction();
        }
        catch (error) { state.busy = false; state.failed = true; state.error = error?.message; rerender(kind); }
      });
    };
    return openChild({ title: model.title, kind, render, wire });
  }

  function handleAction(detailValue) {
    const detail = asObject(detailValue);
    const label = asText(detail.label);
    if (label === 'View Timesheet' && typeof root.openTimesheet === 'function') {
      return root.openTimesheet({ timesheet_id: asText(detail.payload?.timesheet_id) });
    }
    if (label === 'Email manager' && root.CloudTmsImportReviewV1?.openImportsModal) {
      return root.CloudTmsImportReviewV1.openImportsModal();
    }
    if (label === 'Correct final source') return openCorrectFinal(detail.payload);
    if (label === 'Choose contract') return openContractChooser(detail.payload);
    if (label === 'Review' || label === 'Review pricing') {
      if (detail.payload?.preview) return openPreview(detail.payload.preview);
      return openDetail(detail.payload, label);
    }
    if ((label === 'Create contract' || label === 'Create contract for this band') && typeof root.openContract === 'function') {
      const seed = asObject(detail.payload?.contract_seed);
      if (Object.keys(seed).length) return root.openContract(seed, { noParentGate: true });
    }
    if (['View','View final source','View details','Open','Open charge details','Review source details','View query'].includes(label)) return openDetail(detail.payload, label);
    if (detail.command || ['Remind candidate','Accept system hours','No shifts to import','Protect pay'].includes(label)) return openCommand(detail);
    return openDetail({ detail: { problem: 'This action is not available yet.', guidance: 'Recheck the Weekly source screen and try again.' } }, 'View details');
  }

  return Object.freeze({
    CONTRACT, normalisePreview, renderPreview, buildUploadAcceptancePayload,
    normaliseDetail, renderDetail, normaliseContractChooser, renderContractChooser,
    normaliseCorrectFinal, normaliseCorrectFinalPreview, renderCorrectFinal, renderCommandConfirmation,
    openPreview, openBatchPreview, handleAction, _plainMessage: plainMessage,
    _test: Object.freeze({ commandAuthorityAvailable })
  });
});
