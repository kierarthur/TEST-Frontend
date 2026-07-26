(() => {
  'use strict';

  const CAPABILITY_CACHE_KEY = 'cloudtms.invoiceAsyncCapabilities.v7';
  const WATCH_STORAGE_KEY = 'cloudtms.invoiceOperationWatches.v2';
  const EXPECTED_BACKEND_CONTRACT = 'INVOICE_ASYNC_BACKEND_V7';
  const EXPECTED_DOCUMENT_CONTRACT = 'INVOICE_DOCUMENT_VERSION_ACCESS_V1';
  const SUPPORTED_MEDIA = Object.freeze(['application/pdf', 'image/jpeg', 'image/png']);
  const REQUIRED_FEATURES = Object.freeze([
    'batch_candidate_paging_v1',
    'batch_selection_rules_v1',
    'batch_result_paging_v1',
    'generate_and_view_v1',
    'exact_document_version_access_v1',
    'separate_issue_delivery_state_v1'
  ]);
  const MAX_WATCHES = 100;
  const ACTIVE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const TERMINAL_UNHANDLED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const TERMINAL_HANDLED_GRACE_MS = 15 * 60 * 1000;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TERMINAL = new Set(['COMPLETE', 'FAILED', 'DEAD_LETTER', 'BLOCKED', 'CANCELLED', 'SUPERSEDED']);
  const ACTIVE = new Set(['SUBMITTED', 'QUEUED', 'RUNNING', 'WAITING', 'RETRY_WAIT']);
  const OPERATION_ARRAY_FIELDS = Object.freeze([
    'operations',
    'per_command_results',
    'issue_results',
    'delivery_results',
    'children',
    'child_operations',
    'document_operations',
    'delivery_operations',
    'watched_invoice_operations'
  ]);

  let capabilityPromise = null;
  let installed = false;
  let delegatedClickInstalled = false;
  let refreshTimer = null;
  let originalFunctions = null;
  const activeInvoiceViewers = new Map();

  const clean = value => String(value == null ? '' : value).trim();
  const upper = value => clean(value).toUpperCase();
  const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const asArray = value => Array.isArray(value) ? value : [];
  const nowIso = () => new Date().toISOString();
  const invoiceApi = path => `${window.BROKER_BASE_URL || ''}${path}`;
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  function capabilityCacheKey() {
    const userId = clean(window.__USER_ID || window.__auth?.user?.id || window.SESSION?.user?.id).toLowerCase();
    const environment = clean(window.location?.host || 'unknown').toLowerCase();
    return UUID_RE.test(userId) ? `${CAPABILITY_CACHE_KEY}:${environment}:${userId}` : null;
  }

  function exactMediaContract(value) {
    const media = asArray(value).map(item => clean(item).toLowerCase()).filter(Boolean);
    return media.length === SUPPORTED_MEDIA.length
      && SUPPORTED_MEDIA.every((item, index) => media[index] === item);
  }

  function featureEnabled(payload, key) {
    return payload?.[key] === true || payload?.feature_flags?.[key] === true;
  }

  function validateInvoiceAsyncCapabilities(value) {
    const source = asObject(value);
    const backendContract = clean(source.backend_contract_version || source.contract_version);
    if (backendContract !== EXPECTED_BACKEND_CONTRACT) {
      throw new Error('INVOICE_ASYNC_CAPABILITY_CONTRACT_MISMATCH');
    }
    if (clean(source.document_view_contract_version) !== EXPECTED_DOCUMENT_CONTRACT) {
      throw new Error('INVOICE_DOCUMENT_ACCESS_CONTRACT_MISMATCH');
    }
    if (!exactMediaContract(source.supported_media_types)) {
      throw new Error('INVOICE_ASYNC_MEDIA_CONTRACT_MISMATCH');
    }
    if (source.heartbeat_supported !== true || REQUIRED_FEATURES.some(key => !featureEnabled(source, key))) {
      throw new Error('INVOICE_ASYNC_REQUIRED_FEATURE_MISSING');
    }
    return Object.freeze({
      available: true,
      contract_version: backendContract,
      pipeline_enabled: source.pipeline_enabled === true,
      processor_enabled: source.processor_enabled === true,
      enabled_for_user: source.enabled_for_user === true
        && source.pipeline_enabled === true
        && source.processor_enabled === true,
      controlled_cohort: source.controlled_cohort === true,
      scheduled_enabled: source.scheduled_enabled === true,
      heartbeat_supported: true,
      supported_media_types: Object.freeze([...SUPPORTED_MEDIA]),
      document_view_contract_version: EXPECTED_DOCUMENT_CONTRACT,
      feature_flags: Object.freeze(Object.fromEntries(REQUIRED_FEATURES.map(key => [key, true])))
    });
  }

  function unavailableCapabilities(errorCode = 'INVOICE_ASYNC_CAPABILITY_UNAVAILABLE') {
    return Object.freeze({
      available: false,
      enabled_for_user: false,
      pipeline_enabled: false,
      processor_enabled: false,
      controlled_cohort: false,
      scheduled_enabled: false,
      heartbeat_supported: false,
      supported_media_types: Object.freeze([]),
      error_code: clean(errorCode) || 'INVOICE_ASYNC_CAPABILITY_UNAVAILABLE'
    });
  }

  function readCachedInvoiceAsyncCapabilities() {
    try {
      const key = capabilityCacheKey();
      if (!key) return null;
      const parsed = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (!parsed || clean(parsed.contract_version) !== EXPECTED_BACKEND_CONTRACT) return null;
      return validateInvoiceAsyncCapabilities(parsed);
    } catch {
      return null;
    }
  }

  function cacheInvoiceAsyncCapabilities(capabilities) {
    try {
      const key = capabilityCacheKey();
      if (key) {
        if (capabilities?.available === true) sessionStorage.setItem(key, JSON.stringify(capabilities));
        else sessionStorage.removeItem(key);
      }
    } catch {}
    window.__invoiceAsyncCapability = capabilities;
    return capabilities;
  }

  async function fetchInvoiceAsyncCapabilities() {
    if (typeof window.authFetch !== 'function') {
      throw new Error('INVOICE_ASYNC_AUTH_FETCH_UNAVAILABLE');
    }
    const response = await window.authFetch(invoiceApi('/api/invoice-async/capabilities'), {
      method: 'GET',
      headers: { accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `INVOICE_ASYNC_CAPABILITY_HTTP_${response.status}`);
    return validateInvoiceAsyncCapabilities(payload);
  }

  async function loadInvoiceAsyncCapabilities(options = {}) {
    if (options.force !== true) {
      const cached = readCachedInvoiceAsyncCapabilities();
      if (cached) return cacheInvoiceAsyncCapabilities(cached);
      if (capabilityPromise) return capabilityPromise;
    }
    capabilityPromise = fetchInvoiceAsyncCapabilities()
      .then(cacheInvoiceAsyncCapabilities)
      .catch(error => cacheInvoiceAsyncCapabilities(unavailableCapabilities(error?.message)));
    try {
      return await capabilityPromise;
    } finally {
      capabilityPromise = null;
    }
  }

  function isInvoiceAsyncUiEnabled() {
    return window.__invoiceAsyncCapability?.enabled_for_user === true && installed === true;
  }

  function hasOperationMarker(row, context = {}) {
    return !!(
      row.operation_id
      || row.operationId
      || row.operation_type
      || row.operationType
      || row.change_seq != null
      || row.effective_change_seq != null
      || row.phase
      || (context.explicit_operation_ids === true && (context.operation_type || context.purpose))
    );
  }

  function normaliseInvoiceOperationWatch(value, context = {}) {
    if (typeof value === 'string') {
      if (
        context.explicit_operation_ids !== true
        || !UUID_RE.test(clean(value))
        || (!context.operation_type && !context.purpose)
      ) return null;
      value = { operation_id: value };
    }
    const row = asObject(value);
    if (!hasOperationMarker(row, context)) return null;
    const mayUseGenericId = context.explicit_operation_ids === true
      || !!(row.operation_type || row.operationType || row.change_seq != null || row.effective_change_seq != null);
    const operationId = clean(row.operation_id || row.operationId || (mayUseGenericId ? row.id : '')).toLowerCase();
    if (!UUID_RE.test(operationId)) return null;
    const rootId = clean(row.root_operation_id || row.rootOperationId || context.root_operation_id || operationId).toLowerCase();
    const createdRaw = clean(row.created_at_utc || row.createdAtUtc || context.created_at_utc || nowIso());
    const updatedRaw = clean(row.updated_at_utc || row.updatedAtUtc || nowIso());
    const status = upper(row.status || row.operation_status || context.status || 'SUBMITTED');
    const handledAt = clean(row.terminal_handled_at_utc || row.terminalHandledAtUtc);
    return {
      operation_id: operationId,
      root_operation_id: UUID_RE.test(rootId) ? rootId : operationId,
      operation_type: upper(row.operation_type || row.operationType || context.operation_type || context.operationType),
      purpose: upper(row.purpose || row.document_purpose || context.purpose),
      entity_type: upper(row.entity_type || row.entityType || context.entity_type),
      entity_id: clean(row.entity_id || row.entityId || context.entity_id).toLowerCase() || null,
      status,
      phase: upper(row.phase || row.current_phase || context.phase || status),
      effective_change_seq: Math.max(0, Math.trunc(Number(
        row.effective_change_seq ?? row.change_seq ?? row.changeSeq ?? context.effective_change_seq ?? 0
      ) || 0)),
      document_version_id: clean(row.document_version_id || row.documentVersionId || context.document_version_id).toLowerCase() || null,
      ready_key: clean(row.ready_key || context.ready_key) || null,
      error_code: upper(row.error_code || row.errorCode || context.error_code) || null,
      error_summary: clean(row.error_summary || row.errorSummary || row.message || context.error_summary) || null,
      retry_available: row.retry_available === true || row.can_retry === true,
      notify: row.notify === true,
      progress: asObject(row.progress || row.progress_summary || context.progress),
      notification_state: asObject(row.notification_state || row.notificationState || context.notification_state),
      modal_identity: clean(row.modal_identity || row.modalIdentity || context.modal_identity) || null,
      command_token: clean(row.command_token || row.commandToken || context.command_token) || null,
      created_at_utc: Number.isNaN(Date.parse(createdRaw)) ? nowIso() : new Date(createdRaw).toISOString(),
      updated_at_utc: Number.isNaN(Date.parse(updatedRaw)) ? nowIso() : new Date(updatedRaw).toISOString(),
      terminal_handled_at_utc: Number.isNaN(Date.parse(handledAt)) ? null : new Date(handledAt).toISOString()
    };
  }

  function mergeWatch(previous, incoming) {
    if (!previous) return incoming;
    if (incoming.effective_change_seq < previous.effective_change_seq) return previous;
    return {
      ...previous,
      ...incoming,
      root_operation_id: incoming.root_operation_id || previous.root_operation_id,
      operation_type: incoming.operation_type || previous.operation_type,
      purpose: incoming.purpose || previous.purpose,
      entity_type: incoming.entity_type || previous.entity_type,
      entity_id: incoming.entity_id || previous.entity_id,
      document_version_id: incoming.document_version_id || previous.document_version_id,
      ready_key: incoming.ready_key || previous.ready_key,
      error_code: incoming.error_code || previous.error_code,
      error_summary: incoming.error_summary || previous.error_summary,
      progress: { ...asObject(previous.progress), ...asObject(incoming.progress) },
      notification_state: { ...asObject(previous.notification_state), ...asObject(incoming.notification_state) },
      created_at_utc: previous.created_at_utc || incoming.created_at_utc,
      terminal_handled_at_utc: incoming.terminal_handled_at_utc || previous.terminal_handled_at_utc
    };
  }

  function deduplicateInvoiceOperationWatch(rows) {
    const map = new Map();
    for (const value of asArray(rows)) {
      const row = normaliseInvoiceOperationWatch(value, { explicit_operation_ids: false });
      if (!row) continue;
      map.set(row.operation_id, mergeWatch(map.get(row.operation_id), row));
    }
    return [...map.values()];
  }

  function pruneInvoiceOperationWatches(rows) {
    const now = Date.now();
    const kept = deduplicateInvoiceOperationWatch(rows).filter(row => {
      const created = Date.parse(row.created_at_utc) || now;
      if (!TERMINAL.has(row.status)) return created >= now - ACTIVE_MAX_AGE_MS;
      const handled = Date.parse(row.terminal_handled_at_utc);
      if (Number.isFinite(handled)) return handled >= now - TERMINAL_HANDLED_GRACE_MS;
      return created >= now - TERMINAL_UNHANDLED_MAX_AGE_MS;
    });
    return kept
      .sort((a, b) => {
        const aPriority = !TERMINAL.has(a.status) ? 0 : (a.terminal_handled_at_utc ? 2 : 1);
        const bPriority = !TERMINAL.has(b.status) ? 0 : (b.terminal_handled_at_utc ? 2 : 1);
        if (aPriority !== bPriority) return aPriority - bPriority;
        return Date.parse(b.updated_at_utc) - Date.parse(a.updated_at_utc);
      })
      .slice(0, MAX_WATCHES);
  }

  function loadInvoiceOperationWatches() {
    try {
      return pruneInvoiceOperationWatches(JSON.parse(sessionStorage.getItem(WATCH_STORAGE_KEY) || '[]'));
    } catch {
      return [];
    }
  }

  function saveInvoiceOperationWatches(rows) {
    const saved = pruneInvoiceOperationWatches(rows);
    try { sessionStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify(saved)); } catch {}
    window.__invoiceOperationWatches = saved;
    return saved;
  }

  function registerInvoiceOperationWatch(value, context = {}) {
    const values = asArray(value).length || Array.isArray(value) ? asArray(value) : [value];
    const accepted = values.map(item => normaliseInvoiceOperationWatch(item, context)).filter(Boolean);
    if (!accepted.length) return [];
    const existing = loadInvoiceOperationWatches();
    const map = new Map(existing.map(row => [row.operation_id, row]));
    for (const row of accepted) map.set(row.operation_id, mergeWatch(map.get(row.operation_id), row));
    saveInvoiceOperationWatches([...map.values()]);
    return accepted;
  }

  function extractOperationRows(payload, context = {}) {
    const source = asObject(payload);
    const rows = [];
    const direct = normaliseInvoiceOperationWatch(source, context);
    if (direct) rows.push(direct);
    const singular = normaliseInvoiceOperationWatch(source.operation, context);
    if (singular) rows.push(singular);
    for (const field of OPERATION_ARRAY_FIELDS) {
      for (const value of asArray(source[field])) {
        const row = normaliseInvoiceOperationWatch(value, context);
        if (row) rows.push(row);
      }
    }
    for (const value of asArray(source.operation_ids)) {
      const row = normaliseInvoiceOperationWatch(value, { ...context, explicit_operation_ids: true });
      if (row) rows.push(row);
    }
    return deduplicateInvoiceOperationWatch(rows);
  }

  function registerInvoiceOperationsFromResponse(payload, context = {}) {
    const rows = extractOperationRows(payload, context);
    if (rows.length) registerInvoiceOperationWatch(rows, context);
    return rows;
  }

  function markInvoiceOperationHandled(operationId) {
    const canonicalId = clean(operationId).toLowerCase();
    const handledAt = nowIso();
    return saveInvoiceOperationWatches(loadInvoiceOperationWatches().map(row =>
      row.operation_id === canonicalId ? { ...row, terminal_handled_at_utc: handledAt } : row
    ));
  }

  function acknowledgeInvoiceOperationNotification(operationId, notificationKey) {
    const canonicalId = clean(operationId).toLowerCase();
    return saveInvoiceOperationWatches(loadInvoiceOperationWatches().map(row => row.operation_id === canonicalId
      ? {
        ...row,
        notification_state: { ...asObject(row.notification_state), [clean(notificationKey)]: true }
      }
      : row));
  }

  function buildInvoiceHeartbeatWatches() {
    return loadInvoiceOperationWatches().slice(0, MAX_WATCHES).map(row => ({
      operation_id: row.operation_id,
      known_change_seq: row.effective_change_seq
    }));
  }

  function operationFamily(value) {
    const row = asObject(value);
    const combined = `${upper(row.operation_type)} ${upper(row.purpose)} ${upper(row.phase)}`;
    if (/DELIVER|DELIVERY|EMAIL/.test(combined)) return 'DELIVERY';
    if (/ISSUE|LEGAL|FREEZE|FINALISE/.test(combined)) return 'ISSUE';
    if (/ASSET|INSPECT|NORMALIS/.test(combined)) return 'ASSET';
    if (/TIMESHEET/.test(combined)) return 'TIMESHEET_DOCUMENT';
    return 'DOCUMENT';
  }

  function deriveInvoiceAsyncActionState(value, familyOverride = '') {
    const row = asObject(value);
    const family = upper(familyOverride) || operationFamily(row);
    const status = upper(row.status || row.operation_status || row.state);
    const phase = upper(row.phase || row.current_phase || status);
    const failed = ['FAILED', 'DEAD_LETTER', 'BLOCKED'].includes(status);
    const cancelled = ['CANCELLED', 'SUPERSEDED'].includes(status);
    const ready = ['COMPLETE', 'READY', 'ISSUED'].includes(status) || !!row.document_version_id;
    const retry = row.retry_available === true;
    const base = {
      family,
      status,
      phase,
      terminal: TERMINAL.has(status),
      retry_available: retry,
      view_available: ready && !!row.document_version_id,
      document_version_id: row.document_version_id || null,
      tone: 'muted',
      label: status || 'Not started',
      button_label: '',
      disabled: false,
      aria_busy: false
    };
    if (family === 'ASSET') {
      const labels = {
        QUEUED: 'Queued', ASSET_INSPECT: 'Inspecting', INSPECTING: 'Inspecting',
        ASSET_NORMALISE: 'Normalising', NORMALISING: 'Normalising', COMPLETE: 'Ready',
        ASSET_MEDIA_TYPE_UNSUPPORTED: 'Unsupported', ASSET_CORRUPT: 'Corrupt',
        ASSET_MISSING: 'Missing', FAILED: 'Failed', DEAD_LETTER: 'Failed', RETRY_WAIT: 'Retry scheduled'
      };
      return {
        ...base,
        tone: ready ? 'ready' : (failed ? 'error' : (ACTIVE.has(status) ? 'amber' : 'muted')),
        label: labels[phase] || labels[status] || clean(phase.replaceAll('_', ' ')) || 'Queued',
        button_label: retry ? 'Retry evidence' : '',
        disabled: !retry,
        aria_busy: ACTIVE.has(status)
      };
    }
    if (family === 'DELIVERY') {
      const label = ready ? 'Email queued'
        : failed ? (status === 'BLOCKED' ? 'Delivery blocked' : 'Delivery failed')
          : (ACTIVE.has(status) ? 'Preparing email…' : 'Email not requested');
      return {
        ...base,
        tone: ready ? 'ready' : (failed ? 'error' : (ACTIVE.has(status) ? 'amber' : 'muted')),
        label,
        button_label: retry ? 'Retry delivery' : (ready ? 'Email queued' : 'Email invoice'),
        disabled: ACTIVE.has(status) || ready || (failed && !retry),
        aria_busy: ACTIVE.has(status)
      };
    }
    if (family === 'ISSUE') {
      let label = 'Issue invoice';
      if (/VALIDAT/.test(phase)) label = 'Validating…';
      else if (/FREEZE|FINAL_DOCUMENT|RENDER|MERGE|VERIFY/.test(phase)) label = 'Preparing final document…';
      else if (/FINALIS|LEGAL/.test(phase)) label = 'Finalising issue…';
      else if (ready) label = 'Issued';
      else if (failed) label = 'Issue blocked';
      return {
        ...base,
        tone: ready ? 'ready' : (failed ? 'error' : (ACTIVE.has(status) ? 'amber' : 'muted')),
        label,
        button_label: retry ? 'Retry issue' : label,
        disabled: ACTIVE.has(status) || ready || (failed && !retry),
        aria_busy: ACTIVE.has(status)
      };
    }
    const timesheet = family === 'TIMESHEET_DOCUMENT';
    const preparingLabel = timesheet ? 'Preparing timesheet…' : 'Preparing PDF…';
    const readyLabel = timesheet ? 'View timesheet PDF' : 'View invoice PDF';
    const failedLabel = timesheet ? 'Timesheet PDF failed' : 'PDF failed — retry';
    return {
      ...base,
      tone: ready ? 'ready' : (failed ? 'error' : (ACTIVE.has(status) ? 'amber' : 'muted')),
      label: ready ? readyLabel : (failed ? failedLabel : (ACTIVE.has(status) ? preparingLabel : (timesheet ? 'Prepare timesheet PDF' : 'Prepare invoice PDF'))),
      button_label: ready ? readyLabel : (failed && retry ? 'Retry PDF' : (ACTIVE.has(status) ? preparingLabel : (timesheet ? 'Prepare timesheet PDF' : 'Prepare invoice PDF'))),
      disabled: ACTIVE.has(status) || (failed && !retry),
      aria_busy: ACTIVE.has(status),
      view_available: ready && !!row.document_version_id
    };
  }

  function renderInvoiceProgressText(value) {
    const row = asObject(value);
    const state = deriveInvoiceAsyncActionState(row);
    const progress = asObject(row.progress);
    const current = Number(progress.completed_units ?? progress.completed ?? progress.current);
    const total = Number(progress.total_units ?? progress.total);
    return Number.isFinite(current) && Number.isFinite(total) && total > 0
      ? `${state.label} — ${current}/${total}`
      : state.label;
  }

  function renderInvoiceOperationError(value) {
    const row = asObject(value);
    return [clean(row.error_code), clean(row.error_summary)].filter(Boolean).join(': ');
  }

  function renderDocumentAssetBadge(value, family = '') {
    const state = deriveInvoiceAsyncActionState(value, family);
    const colours = {
      ready: ['#14532d', '#dcfce7'],
      amber: ['#78350f', '#fef3c7'],
      error: ['#7f1d1d', '#fee2e2'],
      muted: ['#334155', '#e2e8f0']
    };
    const [colour, background] = colours[state.tone] || colours.muted;
    return `<span class="invoice-async-badge invoice-async-badge--${escapeHtml(state.tone)}" data-tone="${escapeHtml(state.tone)}" style="display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:750;color:${colour};background:${background};">${escapeHtml(state.label)}</span>`;
  }

  function renderDiagnosticList(title, values, tone) {
    const rows = asArray(values).map(value => typeof value === 'string' ? value : value?.message || value?.label || value?.code).filter(Boolean);
    if (!rows.length) return '';
    return `<details class="invoice-async-diagnostic invoice-async-diagnostic--${tone}" style="margin-top:6px;"><summary>${escapeHtml(title)} (${rows.length})</summary><ul>${rows.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul></details>`;
  }

  function renderInvoiceAsyncState(detail = {}) {
    const source = asObject(detail);
    const sections = [
      ['Invoice document', source.document_operation || source.document_state, 'DOCUMENT'],
      ['Timesheet document', source.timesheet_document_operation || source.timesheet_document_state, 'TIMESHEET_DOCUMENT'],
      ['Legal issue', source.issue_operation || source.legal_issue_state, 'ISSUE'],
      ['Delivery', source.delivery_operation || source.delivery_state, 'DELIVERY'],
      ['Asset processing', source.asset_operation || source.asset_state, 'ASSET']
    ].filter(([, value]) => value != null);
    return `${sections.length ? `<section class="card invoice-async-state" data-invoice-async-state style="margin-top:12px;">
      <h3>Document and delivery progress</h3>
      ${sections.map(([label, value, family]) => {
        const row = typeof value === 'string' ? { status: value } : asObject(value);
        return `<div class="invoice-async-state-row" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--line);"><span>${escapeHtml(label)}</span><span>${renderDocumentAssetBadge(row, family)} <span class="mini">${escapeHtml(renderInvoiceProgressText(row))}</span></span></div>`;
      }).join('')}
    </section>` : ''}
    <div class="invoice-async-diagnostics">
      ${renderDiagnosticList('Hard issue blockers', source.hard_blockers || source.hard_blocker_codes, 'error')}
      ${renderDiagnosticList('Document dependencies', source.document_dependencies || source.document_dependency_codes, 'amber')}
      ${renderDiagnosticList('Delivery blockers', source.delivery_blockers || source.delivery_blocker_codes, 'error')}
      ${renderDiagnosticList('Warnings', source.warnings || source.warning_codes, 'amber')}
    </div>`;
  }

  function applyInvoiceActionButtonState(root = document) {
    const watches = new Map(loadInvoiceOperationWatches().map(row => [row.operation_id, row]));
    for (const button of root?.querySelectorAll?.('[data-invoice-async-operation-id]') || []) {
      const operationId = clean(button.dataset.invoiceAsyncOperationId).toLowerCase();
      const watch = watches.get(operationId);
      if (!watch) continue;
      const state = deriveInvoiceAsyncActionState(watch, button.dataset.invoiceAsyncFamily);
      if (!button.dataset.invoiceAsyncOriginalLabel) button.dataset.invoiceAsyncOriginalLabel = clean(button.textContent);
      button.dataset.invoiceAsyncTone = state.tone;
      button.dataset.documentVersionId = state.document_version_id || '';
      button.classList.toggle('is-processing', state.tone === 'amber');
      button.classList.toggle('is-ready', state.tone === 'ready');
      button.classList.toggle('is-failed', state.tone === 'error');
      button.style.borderColor = state.tone === 'amber' ? '#d97706'
        : state.tone === 'ready' ? '#16a34a'
          : state.tone === 'error' ? '#dc2626' : '';
      button.disabled = state.disabled;
      button.setAttribute('aria-busy', String(state.aria_busy));
      button.setAttribute('aria-disabled', String(state.disabled));
      const visibleLabel = state.button_label || state.label || button.dataset.invoiceAsyncOriginalLabel;
      if (state.aria_busy) {
        button.innerHTML = `<span aria-hidden="true">⟳</span> <span>${escapeHtml(visibleLabel)}</span>`;
      } else {
        button.textContent = visibleLabel;
      }
      button.title = renderInvoiceOperationError(watch) || renderInvoiceProgressText(watch);
      let status = button.parentElement?.querySelector(`[data-invoice-button-status="${CSS.escape(operationId)}"]`);
      if (!status) {
        status = document.createElement('span');
        status.className = 'sr-only';
        status.dataset.invoiceButtonStatus = operationId;
        button.insertAdjacentElement('afterend', status);
      }
      status.textContent = state.label;
    }
  }

  function updateOpenInvoiceModalFromSignal(signal) {
    const signalEntityId = clean(signal.entity_id).toLowerCase();
    const viewerModal = activeInvoiceViewers.get(signalEntityId);
    if (
      viewerModal
      && signal.document_version_id
      && ['DOCUMENT', 'TIMESHEET_DOCUMENT'].includes(operationFamily(signal))
    ) {
      Promise.resolve(completeInvoiceAsyncViewer(viewerModal, signal.document_version_id)).catch(() => {});
    }
    const modal = window.modalCtx;
    if (!modal || typeof modal !== 'object') return false;
    const invoiceId = clean(modal.invoiceId || modal.invoiceDetail?.invoice?.id || modal.dataLoaded?.invoice?.id || modal.data?.id).toLowerCase();
    if (invoiceId && signalEntityId !== invoiceId) return false;
    modal.invoiceAsync = asObject(modal.invoiceAsync);
    const family = operationFamily(signal);
    const slot = family === 'ISSUE' ? 'issue_operation'
      : family === 'DELIVERY' ? 'delivery_operation'
        : family === 'ASSET' ? 'asset_operation'
          : family === 'TIMESHEET_DOCUMENT' ? 'timesheet_document_operation'
            : 'document_operation';
    const previous = asObject(modal.invoiceAsync[slot]);
    if (Number(signal.effective_change_seq) < Number(previous.effective_change_seq || 0)) return false;
    modal.invoiceAsync[slot] = { ...previous, ...signal };
    if (signal.document_version_id && ['DOCUMENT', 'TIMESHEET_DOCUMENT'].includes(family)) {
      modal.invoiceAsync.document_version_id = signal.document_version_id;
    }
    const host = document.querySelector('[data-invoice-async-state-host]');
    if (host) host.innerHTML = renderInvoiceAsyncState({ ...asObject(modal.invoiceDetail), ...modal.invoiceAsync });
    applyInvoiceActionButtonState(document);
    return true;
  }

  function updateOpenInvoiceBatchModalFromSignal(signal) {
    return window.InvoiceBatchModalV1?.applyInvoiceBatchOperationSignal?.(signal)
      || window.applyInvoiceBatchOperationSignal?.(signal)
      || false;
  }

  function renderTimesheetEvidenceProcessingState(value) {
    const row = asObject(value);
    const asset = typeof row.asset_state === 'string' ? { status: row.asset_state, error_code: row.asset_error } : asObject(row.asset_operation || row.asset_state);
    const documentState = typeof row.timesheet_document_state === 'string'
      ? { status: row.timesheet_document_state }
      : asObject(row.timesheet_document_operation || row.timesheet_document_state);
    const error = renderInvoiceOperationError(asset);
    const retryOperationId = clean(asset.operation_id || row.asset_operation_id).toLowerCase();
    return `<div class="timesheet-evidence-processing" data-timesheet-evidence-processing style="display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;margin-top:6px;">
      <span>Source ${renderDocumentAssetBadge(asset, 'ASSET')}</span>
      <span>Timesheet PDF ${renderDocumentAssetBadge(documentState, 'TIMESHEET_DOCUMENT')}</span>
      ${error ? `<span class="mini error">${escapeHtml(error)}</span>` : ''}
      ${asset.retry_available === true && UUID_RE.test(retryOperationId)
        ? `<button type="button" class="btn btn-xs btn-outline" data-invoice-evidence-retry data-operation-id="${escapeHtml(retryOperationId)}">Retry</button>`
        : ''}
      ${upper(asset.error_code) === 'ASSET_MEDIA_TYPE_UNSUPPORTED' ? '<span class="mini">PDF, JPEG/JPG and static PNG only</span>' : ''}
    </div>`;
  }

  async function retryInvoiceEvidenceOperation(operationId, button) {
    const canonicalId = clean(operationId).toLowerCase();
    if (!UUID_RE.test(canonicalId)) throw new Error('INVOICE_EVIDENCE_OPERATION_ID_INVALID');
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }
    try {
      const response = await window.authFetch(invoiceApi('/api/invoice-operations/control'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actions: [{ operation_id: canonicalId, action: 'RETRY' }] })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || `INVOICE_EVIDENCE_RETRY_HTTP_${response.status}`);
      const results = asArray(payload.results).filter(row => clean(row?.operation_id).toLowerCase() === canonicalId);
      if (results.length) {
        registerInvoiceOperationWatch(results, {
          explicit_operation_ids: true,
          operation_type: 'PREPARE_INVOICE_ASSET',
          purpose: 'ASSET'
        });
        applyInvoiceOperationUpdates({ watched_invoice_operations: results });
      }
      try { window.__toast?.('Evidence retry queued.'); } catch {}
      return payload;
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
      }
    }
  }

  function handleInvoiceAsyncDelegatedClick(event) {
    const button = event?.target?.closest?.('[data-invoice-evidence-retry]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    retryInvoiceEvidenceOperation(button.dataset.operationId, button)
      .catch(error => {
        try { window.__toast?.(clean(error?.message || error) || 'Evidence retry failed.'); } catch {}
      });
  }

  function attachInvoiceAsyncDelegatedHandlers() {
    if (delegatedClickInstalled) return;
    document.addEventListener('click', handleInvoiceAsyncDelegatedClick);
    delegatedClickInstalled = true;
  }

  function detachInvoiceAsyncDelegatedHandlers() {
    if (!delegatedClickInstalled) return;
    document.removeEventListener('click', handleInvoiceAsyncDelegatedClick);
    delegatedClickInstalled = false;
  }

  function updateVisibleAssetStateFromSignal(signal) {
    const entityId = clean(signal.entity_id);
    if (!entityId) return false;
    let applied = false;
    const selector = [
      `[data-evidence-id="${CSS.escape(entityId)}"]`,
      `[data-timesheet-id="${CSS.escape(entityId)}"]`,
      `[data-asset-id="${CSS.escape(entityId)}"]`
    ].join(',');
    for (const target of document.querySelectorAll(selector)) {
      const family = operationFamily(signal);
      const model = family === 'ASSET'
        ? { asset_operation: signal, timesheet_document_state: target.dataset.timesheetDocumentState || 'NOT_READY' }
        : { asset_state: target.dataset.assetState || 'QUEUED', timesheet_document_operation: signal };
      target.dataset.asyncState = upper(signal.status);
      let host = target.querySelector('[data-timesheet-evidence-processing-host]');
      if (!host) {
        host = document.createElement('div');
        host.dataset.timesheetEvidenceProcessingHost = '1';
        target.appendChild(host);
      }
      host.innerHTML = renderTimesheetEvidenceProcessingState(model);
      applied = true;
    }
    return applied;
  }

  function hydrateVisibleTimesheetEvidenceProcessingStates(root = document) {
    let applied = 0;
    for (const target of root?.querySelectorAll?.('[data-evidence-id], [data-timesheet-id]') || []) {
      const assetState = clean(target.dataset.assetState || target.dataset.processingState);
      const documentState = clean(target.dataset.timesheetDocumentState || target.dataset.documentState);
      const assetOperationId = clean(target.dataset.assetOperationId);
      const documentOperationId = clean(target.dataset.documentOperationId);
      if (!assetState && !documentState && !assetOperationId && !documentOperationId) continue;
      const watches = loadInvoiceOperationWatches();
      const assetOperation = watches.find(row => row.operation_id === assetOperationId);
      const documentOperation = watches.find(row => row.operation_id === documentOperationId);
      let host = target.querySelector('[data-timesheet-evidence-processing-host]');
      if (!host) {
        host = document.createElement('div');
        host.dataset.timesheetEvidenceProcessingHost = '1';
        target.appendChild(host);
      }
      host.innerHTML = renderTimesheetEvidenceProcessingState({
        asset_state: assetState || 'QUEUED',
        asset_operation: assetOperation,
        timesheet_document_state: documentState || 'NOT_READY',
        timesheet_document_operation: documentOperation
      });
      applied += 1;
    }
    return applied;
  }

  function notificationMessage(signal) {
    const family = operationFamily(signal);
    const success = signal.status === 'COMPLETE' || !!signal.document_version_id;
    if (family === 'DELIVERY') return success ? 'Invoice email has been queued.' : 'Invoice delivery needs attention.';
    if (family === 'ISSUE') return success ? 'Invoice issue completed.' : 'Invoice issue needs attention.';
    if (family === 'ASSET') {
      if (signal.error_code === 'ASSET_MEDIA_TYPE_UNSUPPORTED') return 'Evidence image is unsupported. Use PDF, JPEG/JPG or static PNG.';
      return success ? 'Evidence is ready.' : 'Evidence processing needs attention.';
    }
    if (family === 'TIMESHEET_DOCUMENT') return success ? 'Timesheet PDF is ready.' : 'Timesheet PDF preparation failed.';
    return success ? 'Invoice PDF is ready.' : 'Invoice document preparation failed.';
  }

  function markSharedInvoiceUpdate(message) {
    window.__updatesAvailable = window.__updatesAvailable || {};
    window.__updatesAvailable.invoices = true;
    window.__invoiceAsyncLastUpdateMessage = clean(message);
    try { window.renderTools?.(); } catch {}
  }

  function notifyInvoiceOperationResult(signal, previous) {
    if (signal.notify !== true && !TERMINAL.has(signal.status) && !signal.document_version_id) return null;
    const key = `${signal.operation_id}:${signal.effective_change_seq}:${signal.status}:${signal.document_version_id || ''}`;
    if (asObject(previous?.notification_state)[key]) return null;
    const message = notificationMessage(signal);
    try { window.__toast?.(message); } catch {}
    signal.notification_state = { ...asObject(previous?.notification_state), [key]: true };
    markSharedInvoiceUpdate(message);
    return key;
  }

  function scheduleInvoiceSectionRefresh(reason = 'invoice-operation-update') {
    markSharedInvoiceUpdate(reason);
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      refreshTimer = null;
      try {
        if (typeof window.invoiceAsyncRefreshVisibleSection === 'function') {
          await window.invoiceAsyncRefreshVisibleSection({ reason });
        } else if (clean(window.currentSection).toLowerCase() === 'invoices' && typeof window.refreshCurrentSection === 'function') {
          await window.refreshCurrentSection({ preserve_state: true, reason });
        } else {
          window.renderTools?.();
        }
      } catch {}
    }, 500);
  }

  function applyInvoiceOperationUpdates(payload) {
    const signals = Array.isArray(payload) ? payload : asArray(payload?.watched_invoice_operations);
    if (!signals.length) return [];
    const map = new Map(loadInvoiceOperationWatches().map(row => [row.operation_id, row]));
    const applied = [];
    for (const value of signals) {
      const signal = normaliseInvoiceOperationWatch(value);
      if (!signal) continue;
      const previous = map.get(signal.operation_id);
      if (previous && signal.effective_change_seq < previous.effective_change_seq) continue;
      const merged = mergeWatch(previous, signal);
      notifyInvoiceOperationResult(merged, previous);
      map.set(merged.operation_id, merged);
      updateOpenInvoiceModalFromSignal(merged);
      Promise.resolve(updateOpenInvoiceBatchModalFromSignal(merged)).catch(() => {});
      updateVisibleAssetStateFromSignal(merged);
      applied.push(merged);
    }
    saveInvoiceOperationWatches([...map.values()]);
    if (applied.some(row => TERMINAL.has(row.status) || row.document_version_id)) {
      scheduleInvoiceSectionRefresh('Invoice processing updated');
    }
    return applied;
  }

  async function openExactReadyDocument(documentVersionId, options = {}) {
    const id = clean(typeof documentVersionId === 'string'
      ? documentVersionId
      : documentVersionId?.document_version_id || documentVersionId?.id).toLowerCase();
    if (!UUID_RE.test(id)) throw new Error('READY_DOCUMENT_VERSION_ID_INVALID');
    const presign = await window.authFetch(invoiceApi(`/api/invoice-document-versions/${encodeURIComponent(id)}/presign`), {
      method: 'POST',
      headers: { accept: 'application/json' }
    });
    const descriptor = await presign.json().catch(() => ({}));
    if (!presign.ok || !descriptor.url || clean(descriptor.document_version_id).toLowerCase() !== id) {
      throw new Error(descriptor.error || `READY_DOCUMENT_ACCESS_FAILED_${presign.status}`);
    }
    const documentResponse = await window.authFetch(descriptor.url, {
      method: 'GET',
      headers: { accept: 'application/pdf' }
    });
    if (!documentResponse.ok) throw new Error(`READY_DOCUMENT_DOWNLOAD_FAILED_${documentResponse.status}`);
    const blob = await documentResponse.blob();
    if (blob.type && blob.type !== 'application/pdf') throw new Error('READY_DOCUMENT_MEDIA_TYPE_INVALID');
    const blobUrl = URL.createObjectURL(blob);
    if (options.returnBlobUrl === true) {
      return {
        document_version_id: id,
        purpose: descriptor.purpose || null,
        blob_url: blobUrl,
        revoke: () => URL.revokeObjectURL(blobUrl)
      };
    }
    const opened = window.open(blobUrl, '_blank', 'noopener');
    if (!opened) {
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.click();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
    return { document_version_id: id, purpose: descriptor.purpose || null };
  }

  function renderInvoiceAsyncViewerContent(modalCtx) {
    const viewer = asObject(modalCtx?.invoiceAsync?.viewer_request);
    return `<div class="invoice-async-viewer" data-invoice-async-viewer="${escapeHtml(viewer.invoice_id || '')}">
      <div class="invoice-async-viewer-status" aria-live="polite">
        ${viewer.error ? `<span class="error">${escapeHtml(viewer.error)}</span>` : escapeHtml(viewer.status_message || 'Preparing preview')}
      </div>
      ${viewer.blob_url
        ? `<iframe src="${escapeHtml(viewer.blob_url)}" title="Invoice PDF preview" style="width:100%;height:75vh;border:1px solid var(--line);border-radius:10px;background:#111;"></iframe>`
        : '<div style="display:grid;place-items:center;min-height:55vh;gap:10px;"><span class="invbatch-spinner" aria-hidden="true"></span><span>Preparing preview</span></div>'}
    </div>`;
  }

  function repaintInvoiceAsyncViewer(modalCtx) {
    const invoiceId = clean(modalCtx?.invoiceAsync?.viewer_request?.invoice_id);
    if (!invoiceId) return;
    const host = document.querySelector(`[data-invoice-async-viewer="${CSS.escape(invoiceId)}"]`);
    if (host) host.outerHTML = renderInvoiceAsyncViewerContent(modalCtx);
  }

  function openPreparingInvoiceViewer(modalCtx, invoiceId) {
    modalCtx.invoiceAsync = asObject(modalCtx.invoiceAsync);
    const prior = asObject(modalCtx.invoiceAsync.viewer_request);
    if (prior.blob_url) {
      try { URL.revokeObjectURL(prior.blob_url); } catch {}
    }
    modalCtx.invoiceAsync.viewer_request = {
      invoice_id: invoiceId,
      open: true,
      status_message: 'Preparing preview',
      document_version_id: null,
      operation_id: null,
      blob_url: null,
      error: null
    };
    activeInvoiceViewers.set(invoiceId, modalCtx);
    if (typeof window.showModal !== 'function') return;
    window.showModal(
      'Invoice PDF Preview',
      [{ key: 'main', label: 'PDF' }],
      () => renderInvoiceAsyncViewerContent(modalCtx),
      null,
      true,
      null,
      {
        kind: 'invoice-async-document-viewer-v1',
        noParentGate: true,
        onDismiss: () => {
          const viewer = asObject(modalCtx.invoiceAsync?.viewer_request);
          if (viewer.blob_url) {
            try { URL.revokeObjectURL(viewer.blob_url); } catch {}
          }
          viewer.open = false;
          activeInvoiceViewers.delete(invoiceId);
        }
      }
    );
  }

  async function completeInvoiceAsyncViewer(modalCtx, documentVersionId) {
    const viewer = asObject(modalCtx?.invoiceAsync?.viewer_request);
    const canonicalVersion = clean(documentVersionId).toLowerCase();
    if (!viewer.open || !UUID_RE.test(canonicalVersion)) return null;
    if (viewer.document_version_id === canonicalVersion && viewer.blob_url) return viewer;
    viewer.status_message = 'Opening exact document version';
    viewer.error = null;
    repaintInvoiceAsyncViewer(modalCtx);
    try {
      const result = await openExactReadyDocument(canonicalVersion, { returnBlobUrl: true });
      if (!viewer.open) {
        result.revoke?.();
        return null;
      }
      if (viewer.blob_url) {
        try { URL.revokeObjectURL(viewer.blob_url); } catch {}
      }
      viewer.document_version_id = canonicalVersion;
      viewer.blob_url = result.blob_url;
      viewer.status_message = 'Invoice PDF ready';
      viewer.error = null;
      repaintInvoiceAsyncViewer(modalCtx);
      return viewer;
    } catch (error) {
      viewer.status_message = 'Preview failed';
      viewer.error = clean(error?.message || error);
      repaintInvoiceAsyncViewer(modalCtx);
      return null;
    }
  }

  function attachOperationToButtons(operation, family) {
    if (!operation?.operation_id) return;
    const modal = window.modalCtx;
    const selectors = family === 'DELIVERY'
      ? ['[data-action*="email"]', '#btnInvoiceEmail']
      : ['[data-action*="pdf"]', '[data-action*="render"]', '#btnInvoiceRenderPdf'];
    for (const selector of selectors) {
      for (const button of document.querySelectorAll(selector)) {
        button.dataset.invoiceAsyncOperationId = operation.operation_id;
        button.dataset.invoiceAsyncFamily = family;
        if (modal?.invoiceId) button.dataset.invoiceId = modal.invoiceId;
      }
    }
    applyInvoiceActionButtonState(document);
  }

  async function handleInvoiceRenderPdfAsync(modalCtx) {
    const invoiceId = clean(
      modalCtx?.invoiceId
      || modalCtx?.invoiceDetail?.invoice?.id
      || modalCtx?.dataLoaded?.invoice?.id
      || modalCtx?.data?.id
    ).toLowerCase();
    if (!UUID_RE.test(invoiceId)) {
      window.alert?.('Invoice id missing');
      return null;
    }
    openPreparingInvoiceViewer(modalCtx, invoiceId);
    let response;
    try {
      response = await window.authFetch(invoiceApi(`/api/invoices/${encodeURIComponent(invoiceId)}/render`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority_reason: 'VIEW_NOW' })
      });
    } catch (error) {
      modalCtx.invoiceAsync.viewer_request.status_message = 'Preview failed';
      modalCtx.invoiceAsync.viewer_request.error = clean(error?.message || error);
      repaintInvoiceAsyncViewer(modalCtx);
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 200 && payload.ready === true && payload.document_version_id) {
      await completeInvoiceAsyncViewer(modalCtx, payload.document_version_id);
      return payload;
    }
    if (response.status === 202) {
      const operations = registerInvoiceOperationsFromResponse(payload, {
        response_family: 'VIEW',
        operation_type: 'VIEW_INVOICE_DOCUMENT',
        entity_type: 'INVOICE',
        entity_id: invoiceId,
        purpose: upper(payload.purpose || 'DRAFT_PREVIEW'),
        modal_identity: `invoice:${invoiceId}`,
        explicit_operation_ids: true
      });
      const operation = operations[0];
      modalCtx.invoiceAsync.viewer_request.operation_id = operation?.operation_id || null;
      modalCtx.invoiceAsync.viewer_request.status_message = payload.status_message || 'Preparing preview';
      modalCtx.invoiceAsync = {
        ...asObject(modalCtx.invoiceAsync),
        document_operation: operation,
        document_state: 'PREPARING'
      };
      repaintInvoiceAsyncViewer(modalCtx);
      attachOperationToButtons(operation, 'DOCUMENT');
      try { window.__toast?.(payload.status_message || 'Invoice PDF preparation started. You can close this window.'); } catch {}
      return payload;
    }
    const errorCode = clean(payload.error_code || payload.error || payload.message || `INVOICE_DOCUMENT_HTTP_${response.status}`);
    modalCtx.invoiceAsync.viewer_request.status_message = 'Preview failed';
    modalCtx.invoiceAsync.viewer_request.error = errorCode;
    repaintInvoiceAsyncViewer(modalCtx);
    if (errorCode === 'ISSUED_DOCUMENT_INTEGRITY_FAILURE' || errorCode === 'ISSUED_DOCUMENT_POINTER_MISSING') {
      throw new Error(`The issued legal document cannot be opened (${errorCode}).`);
    }
    throw new Error(errorCode);
  }

  async function handleInvoiceEmailAsync(modalCtx, options = {}) {
    const invoiceId = clean(modalCtx?.invoiceId || modalCtx?.invoiceDetail?.invoice?.id || modalCtx?.data?.id).toLowerCase();
    if (!UUID_RE.test(invoiceId)) {
      window.alert?.('Invoice id missing');
      return null;
    }
    modalCtx.invoiceAsync = asObject(modalCtx.invoiceAsync);
    const explicitResend = options.resend === true;
    const token = explicitResend || !clean(modalCtx.invoiceAsync.delivery_command_token)
      ? crypto.randomUUID()
      : clean(modalCtx.invoiceAsync.delivery_command_token);
    modalCtx.invoiceAsync.delivery_command_token = token;
    const body = {
      command_token: token,
      delivery_request_token: token
    };
    const delivery = asObject(modalCtx.invoiceAsync.delivery_intent || modalCtx.delivery_intent);
    if (delivery.delivery_policy) body.delivery_policy = delivery.delivery_policy;
    if (delivery.recipient_set) body.recipient_set = delivery.recipient_set;
    if (delivery.cc) body.cc = delivery.cc;
    if (delivery.bcc) body.bcc = delivery.bcc;
    const response = await window.authFetch(invoiceApi(`/api/invoices/${encodeURIComponent(invoiceId)}/email`), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': token },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (![200, 202, 207].includes(response.status)) {
      throw new Error(payload.error || payload.message || `INVOICE_DELIVERY_HTTP_${response.status}`);
    }
    const operations = registerInvoiceOperationsFromResponse(payload, {
      response_family: 'DELIVERY',
      operation_type: 'DELIVER_INVOICES',
      entity_type: 'INVOICE',
      entity_id: invoiceId,
      purpose: 'DELIVERY',
      command_token: token,
      modal_identity: `invoice:${invoiceId}`,
      explicit_operation_ids: true
    });
    const operation = operations[0];
    modalCtx.invoiceAsync.delivery_operation = operation;
    attachOperationToButtons(operation, 'DELIVERY');
    try { window.__toast?.(explicitResend ? 'A new invoice delivery attempt has started.' : 'Invoice delivery preparation started.'); } catch {}
    return payload;
  }

  function augmentInvoiceModalRenderer() {
    const original = window.renderInvoiceModalContent;
    if (typeof original !== 'function' || original.__invoiceAsyncWrapped) return;
    const wrapped = function invoiceAsyncModalRenderer(modalCtx, invoiceData) {
      const html = original.apply(this, arguments);
      const detail = asObject(invoiceData || modalCtx?.invoiceDetail);
      const asyncState = { ...detail, ...asObject(modalCtx?.invoiceAsync) };
      return `${html}<div data-invoice-async-state-host>${renderInvoiceAsyncState(asyncState)}</div>`;
    };
    wrapped.__invoiceAsyncWrapped = true;
    wrapped.__invoiceAsyncOriginal = original;
    window.renderInvoiceModalContent = wrapped;
  }

  function captureOriginalFunctions() {
    if (originalFunctions) return originalFunctions;
    originalFunctions = Object.freeze({
      handleInvoiceRenderPdf: window.handleInvoiceRenderPdf,
      handleInvoiceEmail: window.handleInvoiceEmail,
      renderInvoiceModalContent: window.renderInvoiceModalContent,
      openInvoiceBatchGenerateModal: window.openInvoiceBatchGenerateModal,
      openInvoiceBatchIssueModal: window.openInvoiceBatchIssueModal
    });
    return originalFunctions;
  }

  function installOverrides() {
    if (installed) return true;
    if (window.__invoiceAsyncCapability?.enabled_for_user !== true) return false;
    captureOriginalFunctions();
    augmentInvoiceModalRenderer();
    window.handleInvoiceRenderPdf = handleInvoiceRenderPdfAsync;
    window.handleInvoiceEmail = handleInvoiceEmailAsync;
    window.InvoiceBatchModalV1?.install?.();
    attachInvoiceAsyncDelegatedHandlers();
    saveInvoiceOperationWatches(loadInvoiceOperationWatches());
    applyInvoiceActionButtonState(document);
    hydrateVisibleTimesheetEvidenceProcessingStates(document);
    installed = true;
    window.__invoiceAsyncOverridesInstalled = true;
    return true;
  }

  function uninstallOverrides() {
    if (!installed || !originalFunctions) {
      window.__invoiceAsyncOverridesInstalled = false;
      return false;
    }
    window.handleInvoiceRenderPdf = originalFunctions.handleInvoiceRenderPdf;
    window.handleInvoiceEmail = originalFunctions.handleInvoiceEmail;
    window.renderInvoiceModalContent = originalFunctions.renderInvoiceModalContent;
    window.openInvoiceBatchGenerateModal = originalFunctions.openInvoiceBatchGenerateModal;
    window.openInvoiceBatchIssueModal = originalFunctions.openInvoiceBatchIssueModal;
    detachInvoiceAsyncDelegatedHandlers();
    installed = false;
    window.__invoiceAsyncOverridesInstalled = false;
    window.__invoiceBatchModalOverridesInstalled = false;
    return true;
  }

  async function initialiseInvoiceAsyncUi(options = {}) {
    const capabilities = await loadInvoiceAsyncCapabilities(options);
    if (capabilities.enabled_for_user !== true) {
      uninstallOverrides();
      return capabilities;
    }
    installOverrides();
    return capabilities;
  }

  Object.assign(window, {
    fetchInvoiceAsyncCapabilities,
    validateInvoiceAsyncCapabilities,
    cacheInvoiceAsyncCapabilities,
    loadInvoiceAsyncCapabilities,
    isInvoiceAsyncUiEnabled,
    initialiseInvoiceAsyncUi,
    installInvoiceAsyncOverrides: installOverrides,
    uninstallInvoiceAsyncOverrides: uninstallOverrides,
    loadInvoiceOperationWatches,
    normaliseInvoiceOperationWatch,
    deduplicateInvoiceOperationWatch,
    pruneInvoiceOperationWatches,
    saveInvoiceOperationWatches,
    registerInvoiceOperationWatch,
    extractInvoiceOperationRows: extractOperationRows,
    registerInvoiceOperationsFromResponse,
    markInvoiceOperationHandled,
    acknowledgeInvoiceOperationNotification,
    buildInvoiceHeartbeatWatches,
    applyInvoiceOperationUpdates,
    renderInvoiceAsyncState,
    deriveInvoiceAsyncActionState,
    renderInvoiceProgressText,
    renderInvoiceOperationError,
    renderDocumentAssetBadge,
    applyInvoiceActionButtonState,
    renderTimesheetEvidenceProcessingState,
    hydrateVisibleTimesheetEvidenceProcessingStates,
    retryInvoiceEvidenceOperation,
    openExactReadyDocument,
    handleInvoiceRenderPdfAsync,
    handleInvoiceEmailAsync
  });

  window.__invoiceAsyncCapability = unavailableCapabilities('NOT_INITIALISED');
  const begin = () => {
    // The capability endpoint is authenticated. On the signed-out login page,
    // wait for bootstrapApp() after login instead of creating an expected 401
    // request and a noisy browser console entry.
    if (!capabilityCacheKey()) {
      return Promise.resolve(cacheInvoiceAsyncCapabilities(
        unavailableCapabilities('INVOICE_ASYNC_AUTHENTICATED_USER_REQUIRED')
      ));
    }
    return initialiseInvoiceAsyncUi().catch(() => unavailableCapabilities());
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, { once: true });
  } else {
    queueMicrotask(begin);
  }
})();
