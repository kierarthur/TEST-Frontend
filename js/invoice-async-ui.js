(() => {
  'use strict';

  const STORAGE_KEY = 'cloudtms.invoiceOperationWatches.v1';
  const MAX_WATCHES = 100;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TERMINAL = new Set(['COMPLETE', 'FAILED', 'DEAD_LETTER', 'BLOCKED', 'CANCELLED', 'SUPERSEDED']);
  const ACTIVE = new Set(['SUBMITTED', 'QUEUED', 'RUNNING', 'WAITING', 'RETRY_WAIT']);

  const clean = value => String(value == null ? '' : value).trim();
  const upper = value => clean(value).toUpperCase();
  const safeObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const nowIso = () => new Date().toISOString();
  const invoiceApi = path => `${window.BROKER_BASE_URL || ""}${path}`;

  function normaliseInvoiceOperationWatch(value) {
    const row = safeObject(value);
    const operationId = clean(row.operation_id || row.operationId || row.id).toLowerCase();
    if (!UUID_RE.test(operationId)) return null;
    const createdAt = clean(row.created_at_utc || row.createdAtUtc || row.created_at || row.createdAt || nowIso());
    return {
      operation_id: operationId,
      root_operation_id: clean(row.root_operation_id || row.rootOperationId || operationId).toLowerCase(),
      entity_type: upper(row.entity_type || row.entityType),
      entity_id: clean(row.entity_id || row.entityId).toLowerCase() || null,
      purpose: upper(row.purpose || row.document_purpose || row.operation_type || row.operationType),
      effective_change_seq: Math.max(0, Math.trunc(Number(row.effective_change_seq ?? row.change_seq ?? row.changeSeq ?? 0) || 0)),
      modal_identity: clean(row.modal_identity || row.modalIdentity) || null,
      command_token: clean(row.command_token || row.commandToken) || null,
      status: upper(row.status || 'SUBMITTED'),
      phase: upper(row.phase || 'SUBMITTED'),
      document_version_id: clean(row.document_version_id || row.documentVersionId).toLowerCase() || null,
      ready_key: clean(row.ready_key || row.r2_key || row.r2Key) || null,
      error_code: upper(row.error_code || row.errorCode) || null,
      error_summary: clean(row.error_summary || row.errorSummary || row.error || row.message) || null,
      notification_state: safeObject(row.notification_state || row.notificationState),
      created_at_utc: Number.isNaN(Date.parse(createdAt)) ? nowIso() : new Date(createdAt).toISOString(),
      updated_at_utc: nowIso()
    };
  }

  function deduplicateInvoiceOperationWatch(rows) {
    const map = new Map();
    for (const value of Array.isArray(rows) ? rows : []) {
      const row = normaliseInvoiceOperationWatch(value);
      if (!row) continue;
      const previous = map.get(row.operation_id);
      map.set(row.operation_id, previous ? {
        ...previous,
        ...row,
        effective_change_seq: Math.max(previous.effective_change_seq, row.effective_change_seq),
        notification_state: { ...safeObject(previous.notification_state), ...safeObject(row.notification_state) },
        created_at_utc: previous.created_at_utc || row.created_at_utc
      } : row);
    }
    return Array.from(map.values());
  }

  function pruneInvoiceOperationWatches(rows) {
    const cutoff = Date.now() - MAX_AGE_MS;
    return deduplicateInvoiceOperationWatch(rows)
      .filter(row => Date.parse(row.created_at_utc) >= cutoff || !TERMINAL.has(row.status))
      .sort((a, b) => Date.parse(b.updated_at_utc) - Date.parse(a.updated_at_utc))
      .slice(0, MAX_WATCHES);
  }

  function loadInvoiceOperationWatches() {
    try {
      return pruneInvoiceOperationWatches(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'));
    } catch {
      return [];
    }
  }

  function saveInvoiceOperationWatches(rows) {
    const saved = pruneInvoiceOperationWatches(rows);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch {}
    window.__invoiceOperationWatches = saved;
    return saved;
  }

  function registerInvoiceOperationWatch(value) {
    const values = Array.isArray(value) ? value : [value];
    return saveInvoiceOperationWatches([...loadInvoiceOperationWatches(), ...values]);
  }

  function extractOperationRows(payload, depth = 0, rows = []) {
    if (depth > 5 || rows.length >= MAX_WATCHES || payload == null) return rows;
    if (Array.isArray(payload)) {
      for (const value of payload) extractOperationRows(value, depth + 1, rows);
      return rows;
    }
    if (typeof payload !== 'object') return rows;
    const row = normaliseInvoiceOperationWatch(payload);
    if (row) rows.push(row);
    for (const key of ['operations', 'operation_ids', 'results', 'per_command_results', 'issue_results', 'delivery_results', 'children']) {
      if (payload[key] != null) extractOperationRows(payload[key], depth + 1, rows);
    }
    return rows;
  }

  function registerInvoiceOperationsFromResponse(payload, context = {}) {
    const rows = extractOperationRows(payload).map(row => ({ ...row, ...context }));
    if (rows.length) registerInvoiceOperationWatch(rows);
    return rows;
  }

  function buildInvoiceHeartbeatWatches() {
    return loadInvoiceOperationWatches().map(row => ({
      operation_id: row.operation_id,
      known_change_seq: row.effective_change_seq
    }));
  }

  function deriveInvoiceAsyncActionState(value) {
    const row = safeObject(value);
    const status = upper(row.status || row.operation_status || row.state);
    const phase = upper(row.phase || row.current_phase || status);
    if (row.ready_key || row.document_status === 'READY') return { tone: 'ready', label: 'Ready', status: 'READY', phase };
    if (['FAILED', 'DEAD_LETTER', 'BLOCKED'].includes(status)) return { tone: 'error', label: row.error_summary || row.error_code || status, status, phase };
    if (['CANCELLED', 'SUPERSEDED'].includes(status)) return { tone: 'muted', label: status === 'CANCELLED' ? 'Cancelled' : 'Superseded', status, phase };
    if (status === 'RETRY_WAIT') return { tone: 'amber', label: 'Retry scheduled', status, phase };
    if (ACTIVE.has(status) || !status) return { tone: 'amber', label: phase ? phase.replaceAll('_', ' ') : 'Preparing', status: status || 'RUNNING', phase };
    return { tone: 'muted', label: status.replaceAll('_', ' '), status, phase };
  }

  function renderInvoiceProgressText(value) {
    const row = safeObject(value);
    const state = deriveInvoiceAsyncActionState(row);
    const progress = safeObject(row.progress || row.progress_summary);
    const current = Number(progress.completed_units ?? progress.completed ?? progress.current);
    const total = Number(progress.total_units ?? progress.total);
    const counts = Number.isFinite(current) && Number.isFinite(total) && total > 0 ? ` — ${current}/${total}` : '';
    return `${state.label}${counts}`;
  }

  function renderInvoiceOperationError(value) {
    const row = safeObject(value);
    const code = clean(row.error_code || row.errorCode);
    const summary = clean(row.error_summary || row.errorSummary || row.error);
    return [code, summary].filter(Boolean).join(': ');
  }

  function renderDocumentAssetBadge(value) {
    const state = deriveInvoiceAsyncActionState(value);
    const colours = { ready: '#166534', amber: '#92400e', error: '#991b1b', muted: '#475569' };
    const backgrounds = { ready: '#dcfce7', amber: '#fef3c7', error: '#fee2e2', muted: '#e2e8f0' };
    return `<span class="invoice-async-badge" data-tone="${state.tone}" style="display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:12px;font-weight:700;color:${colours[state.tone]};background:${backgrounds[state.tone]};">${escapeHtml(state.label)}</span>`;
  }

  function escapeHtml(value) {
    return clean(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function renderInvoiceAsyncState(detail = {}) {
    const source = safeObject(detail);
    const sections = [
      ['Document', source.document_operation || source.document_state || source.document],
      ['Legal issue', source.issue_operation || source.legal_issue_state || source.issue],
      ['Delivery', source.delivery_operation || source.delivery_state || source.delivery],
      ['Asset processing', source.asset_operation || source.asset_state || source.asset]
    ].filter(([, value]) => value != null);
    if (!sections.length) return '';
    return `<section class="card invoice-async-state" data-invoice-async-state="1" style="margin-top:12px;"><h3 style="margin:0 0 8px;">Asynchronous processing</h3>${sections.map(([label, value]) => {
      const row = typeof value === 'string' ? { status: value } : safeObject(value);
      return `<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-top:1px solid var(--line);"><span>${escapeHtml(label)}</span><span>${renderDocumentAssetBadge(row)} <span class="mini">${escapeHtml(renderInvoiceProgressText(row))}</span></span></div>`;
    }).join('')}</section>`;
  }

  function applyInvoiceActionButtonState(root = document) {
    for (const button of root.querySelectorAll('[data-invoice-async-operation-id]')) {
      const operationId = clean(button.getAttribute('data-invoice-async-operation-id')).toLowerCase();
      const watch = loadInvoiceOperationWatches().find(row => row.operation_id === operationId);
      if (!watch) continue;
      const state = deriveInvoiceAsyncActionState(watch);
      button.dataset.invoiceAsyncTone = state.tone;
      button.classList.toggle('is-processing', state.tone === 'amber');
      button.classList.toggle('is-ready', state.tone === 'ready');
      button.classList.toggle('is-failed', state.tone === 'error');
      button.title = renderInvoiceOperationError(watch) || renderInvoiceProgressText(watch);
    }
  }

  function updateOpenInvoiceModalFromSignal(signal) {
    const modal = window.modalCtx;
    if (!modal || typeof modal !== 'object') return;
    const invoiceId = clean(modal.invoiceId || modal.invoiceDetail?.invoice?.id || modal.data?.id).toLowerCase();
    if (invoiceId && clean(signal.entity_id).toLowerCase() !== invoiceId) return;
    modal.invoiceAsync = { ...safeObject(modal.invoiceAsync), [signal.operation_id]: signal };
    const host = document.querySelector('[data-invoice-async-state-host]');
    if (host) host.innerHTML = renderInvoiceAsyncState({ document_operation: signal });
    ensureInvoiceHeartIndicator();
    applyInvoiceActionButtonState(document);
  }

  function updateOpenInvoiceBatchModalFromSignal(signal) {
    window.dispatchEvent(new CustomEvent('cloudtms:invoice-operation-update', { detail: signal }));
  }

  function updateVisibleAssetStateFromSignal(signal) {
    const entityId = clean(signal.entity_id);
    if (!entityId) return;
    for (const target of document.querySelectorAll(`[data-timesheet-id="${CSS.escape(entityId)}"], [data-evidence-id="${CSS.escape(entityId)}"]`)) {
      target.setAttribute('data-async-state', upper(signal.status));
    }
  }

  function notifyInvoiceOperationResult(signal, previous) {
    if (signal.notify !== true && !TERMINAL.has(signal.status) && !signal.ready_key) return false;
    const key = `${signal.operation_id}:${signal.effective_change_seq}:${signal.status}:${signal.ready_key || ''}`;
    if (safeObject(previous?.notification_state)[key]) return false;
    const state = deriveInvoiceAsyncActionState(signal);
    const message = signal.ready_key ? 'Invoice document is ready.' : `Invoice operation: ${state.label}.`;
    try { window.__toast?.(message); } catch {}
    try {
      const heart = document.querySelector('[data-invoice-heart], #invoiceHeart, #changesHeart');
      if (heart) { heart.hidden = false; heart.classList.add('has-update'); heart.title = message; }
    } catch {}
    signal.notification_state = { ...safeObject(previous?.notification_state), [key]: true };
    return true;
  }

  function scheduleInvoiceSectionRefresh() {
    window.__updatesAvailable = window.__updatesAvailable || {};
    window.__updatesAvailable.invoices = true;
    if (window.currentSection === 'invoices') {
      try { window.renderTools?.(); } catch {}
    }
  }

  function applyInvoiceOperationUpdates(payload) {
    const signals = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.watched_invoice_operations) ? payload.watched_invoice_operations : [];
    if (!signals.length) return [];
    const current = loadInvoiceOperationWatches();
    const map = new Map(current.map(row => [row.operation_id, row]));
    const applied = [];
    for (const value of signals) {
      const signal = normaliseInvoiceOperationWatch(value);
      if (!signal) continue;
      signal.notify = value?.notify === true;
      const previous = map.get(signal.operation_id);
      if (previous && signal.effective_change_seq < previous.effective_change_seq) continue;
      const merged = { ...previous, ...signal, notification_state: safeObject(previous?.notification_state) };
      notifyInvoiceOperationResult(merged, previous);
      map.set(merged.operation_id, merged);
      updateOpenInvoiceModalFromSignal(merged);
      updateOpenInvoiceBatchModalFromSignal(merged);
      updateVisibleAssetStateFromSignal(merged);
      applied.push(merged);
    }
    saveInvoiceOperationWatches(Array.from(map.values()));
    if (applied.length) scheduleInvoiceSectionRefresh();
    return applied;
  }

  function renderTimesheetEvidenceProcessingState(value) {
    const row = safeObject(value);
    const asset = row.asset || row.asset_state || { status: row.asset_status || row.processing_state };
    const documentState = row.document || row.document_state || { status: row.document_status };
    return `<div class="timesheet-evidence-processing"><span>Source ${renderDocumentAssetBadge(asset)}</span><span style="margin-left:8px;">Timesheet PDF ${renderDocumentAssetBadge(documentState)}</span>${renderInvoiceOperationError(asset) ? `<div class="mini error">${escapeHtml(renderInvoiceOperationError(asset))}</div>` : ''}</div>`;
  }

  async function openReadyStorageKey(key) {
    const cleanKey = clean(key).replace(/^\/+/, '');
    if (!cleanKey) throw new Error('READY_DOCUMENT_KEY_MISSING');
    const response = await window.authFetch(invoiceApi('/api/files/presign-download'), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: cleanKey })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url) throw new Error(payload.error || `Download unavailable (${response.status})`);
    window.open(payload.url, '_blank', 'noopener');
  }
  async function openExactReadyDocument(documentVersion) {
    const version = safeObject(documentVersion);
    const key = clean(version.r2_key || version.ready_key);
    if (!UUID_RE.test(clean(version.id || version.document_version_id)) || !key) throw new Error('READY_DOCUMENT_IDENTITY_INVALID');
    const response = await window.authFetch(invoiceApi('/api/files/presign-download'), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url) throw new Error(payload.error || `Download unavailable (${response.status})`);
    window.open(payload.url, '_blank', 'noopener');
  }

  async function handleInvoiceRenderPdfAsync(modalCtx) {
    const invoiceId = clean(modalCtx?.invoiceId || modalCtx?.invoiceDetail?.invoice?.id || modalCtx?.dataLoaded?.invoice?.id || modalCtx?.data?.id);
    if (!UUID_RE.test(invoiceId)) return window.alert('Invoice id missing');
    const response = await window.authFetch(invoiceApi(`/api/invoices/${encodeURIComponent(invoiceId)}/render`), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priority_reason: 'VIEW_NOW' })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 200 && payload.ready === true && payload.document_version) {
      await openExactReadyDocument(payload.document_version);
      return payload;
    }
    if (response.status === 202) {
      const operations = registerInvoiceOperationsFromResponse(payload, { entity_type: 'INVOICE', entity_id: invoiceId, purpose: 'DRAFT_PREVIEW', modal_identity: `invoice:${invoiceId}` });
      try { window.__toast?.('Invoice PDF preparation started. You can close this window.'); } catch {}
      modalCtx.invoiceAsync = { ...safeObject(modalCtx.invoiceAsync), preparing: true, operations };
      applyInvoiceActionButtonState(document);
      return payload;
    }
    const legacyReadyKey = clean(payload.pdf_key || payload.key);
    if (response.status === 200 && payload.ready === true && legacyReadyKey) {
      await openReadyStorageKey(legacyReadyKey);
      return payload;
    }
    throw new Error(payload.error || payload.message || `Invoice document unavailable (${response.status})`);
  }

  async function handleInvoiceEmailAsync(modalCtx) {
    const invoiceId = clean(modalCtx?.invoiceId || modalCtx?.invoiceDetail?.invoice?.id || modalCtx?.data?.id);
    if (!UUID_RE.test(invoiceId)) return window.alert('Invoice id missing');
    modalCtx.invoiceAsync = safeObject(modalCtx.invoiceAsync);
    const commandToken = clean(modalCtx.invoiceAsync.delivery_command_token) || crypto.randomUUID();
    modalCtx.invoiceAsync.delivery_command_token = commandToken;
    const response = await window.authFetch(invoiceApi(`/api/invoices/${encodeURIComponent(invoiceId)}/email`), {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': commandToken }, body: JSON.stringify({ command_token: commandToken })
    });
    const payload = await response.json().catch(() => ({}));
    if (![200, 202, 207].includes(response.status)) throw new Error(payload.error || `Delivery request failed (${response.status})`);
    registerInvoiceOperationsFromResponse(payload, { entity_type: 'INVOICE', entity_id: invoiceId, purpose: 'DELIVERY', command_token: commandToken, modal_identity: `invoice:${invoiceId}` });
    try { window.__toast?.(response.status === 200 ? 'Invoice delivery is already prepared.' : 'Invoice delivery preparation started.'); } catch {}
    return payload;
  }

  function installAsyncFetchObserver() {
    const original = window.authFetch;
    if (typeof original !== 'function' || original.__invoiceAsyncObserved) return;
    const observed = async function invoiceAsyncObservedFetch(input, init) {
      const response = await original.apply(this, arguments);
      try {
        const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
        if (/\/(?:api\/)?(?:invoices|invoice-operations|outbox)\b/i.test(url.pathname)) {
          response.clone().json().then(payload => registerInvoiceOperationsFromResponse(payload)).catch(() => {});
        }
      } catch {}
      return response;
    };
    observed.__invoiceAsyncObserved = true;
    observed.__original = original;
    window.authFetch = observed;
  }

  function augmentInvoiceModalRenderer() {
    const original = window.renderInvoiceModalContent;
    if (typeof original !== 'function' || original.__invoiceAsyncWrapped) return;
    const wrapped = function invoiceAsyncModalRenderer(modalCtx, invoiceData) {
      const html = original.apply(this, arguments);
      const detail = safeObject(invoiceData || modalCtx?.invoiceDetail);
      const blockers = Array.isArray(detail.hard_blockers) ? detail.hard_blockers : [];
      const dependencies = Array.isArray(detail.document_dependencies) ? detail.document_dependencies : [];
      const delivery = Array.isArray(detail.delivery_blockers) ? detail.delivery_blockers : [];
      const warnings = Array.isArray(detail.warnings) ? detail.warnings : [];
      const list = (title, values, tone) => values.length ? `<div class="mini" data-tone="${tone}"><strong>${escapeHtml(title)}:</strong> ${values.map(value => escapeHtml(typeof value === 'string' ? value : value.code || value.message)).join(', ')}</div>` : '';
      return `${html}<div data-invoice-async-state-host>${renderInvoiceAsyncState(detail)}</div><div class="invoice-async-diagnostics">${list('Issue blockers', blockers, 'error')}${list('Document dependencies', dependencies, 'amber')}${list('Delivery blockers', delivery, 'error')}${list('Warnings', warnings, 'amber')}</div>`;
    };
    wrapped.__invoiceAsyncWrapped = true;
    window.renderInvoiceModalContent = wrapped;
  }

  function ensureInvoiceHeartIndicator() {
    let heart = document.querySelector('[data-invoice-heart]');
    if (heart) return heart;
    heart = document.createElement('button');
    heart.type = 'button';
    heart.hidden = true;
    heart.setAttribute('data-invoice-heart', '1');
    heart.setAttribute('aria-label', 'Invoice processing updates');
    heart.textContent = '♥';
    heart.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:1200;width:38px;height:38px;border:0;border-radius:50%;background:#b91c1c;color:white;font-size:20px;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer';
    heart.addEventListener('click', () => {
      heart.classList.remove('has-update');
      heart.hidden = true;
      try { if (window.currentSection !== 'invoices') window.__updatesAvailable.invoices = true; } catch {}
    });
    document.body.appendChild(heart);
    return heart;
  }

  function installOverrides() {
    installAsyncFetchObserver();
    augmentInvoiceModalRenderer();
    window.handleInvoiceRenderPdf = handleInvoiceRenderPdfAsync;
    window.handleInvoiceEmail = handleInvoiceEmailAsync;
    ensureInvoiceHeartIndicator();
    applyInvoiceActionButtonState(document);
  }

  Object.assign(window, {
    loadInvoiceOperationWatches,
    normaliseInvoiceOperationWatch,
    deduplicateInvoiceOperationWatch,
    pruneInvoiceOperationWatches,
    saveInvoiceOperationWatches,
    registerInvoiceOperationWatch,
    registerInvoiceOperationsFromResponse,
    buildInvoiceHeartbeatWatches,
    applyInvoiceOperationUpdates,
    renderInvoiceAsyncState,
    deriveInvoiceAsyncActionState,
    renderInvoiceProgressText,
    renderInvoiceOperationError,
    renderDocumentAssetBadge,
    applyInvoiceActionButtonState,
    renderTimesheetEvidenceProcessingState
  });

  saveInvoiceOperationWatches(loadInvoiceOperationWatches());
  installOverrides();
  document.addEventListener('DOMContentLoaded', installOverrides, { once: true });
})();
