(() => {
  'use strict';

  const CONTRACT_VERSION = 'INVOICE_BATCH_CANDIDATES_V1';
  const QUERY_VERSION = 'INVOICE_BATCH_QUERY_V1';
  const SELECTION_VERSION = 'INVOICE_BATCH_SELECTION_V1';
  const PAGE_SIZE = 100;
  const MAX_RULES = 10000;
  const MODES = new Set(['GENERATE', 'ISSUE']);
  const DISPLAY_MODES = ['ALL', 'BLOCKED', 'READY'];
  const GROUP_PRESETS = [
    'WEEK_CLIENT_CANDIDATE',
    'CLIENT_WEEK_CANDIDATE',
    'CANDIDATE_WEEK_CLIENT',
    'STATUS_WEEK_CLIENT'
  ];
  const SORT_KEYS = {
    GENERATE: ['WEEK_ENDING_DATE', 'CLIENT_NAME', 'CANDIDATE_NAME', 'TOTAL_EX_VAT', 'TOTAL_INC_VAT', 'STATUS'],
    ISSUE: ['WEEK_ENDING_DATE', 'CLIENT_NAME', 'CANDIDATE_NAME', 'TOTAL_EX_VAT', 'TOTAL_INC_VAT', 'STATUS', 'INVOICE_NUMBER']
  };
  const RESULT_CATEGORIES = {
    GENERATE: ['ALL', 'COMPLETED', 'BLOCKED', 'FAILED', 'CHANGED'],
    ISSUE: ['ALL', 'ISSUED', 'ISSUED_SEND_BLOCKED', 'BLOCKED', 'FAILED', 'CHANGED']
  };
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TERMINAL = new Set(['COMPLETE', 'FAILED', 'DEAD_LETTER', 'BLOCKED', 'CANCELLED', 'SUPERSEDED']);
  const activeModalStates = new Map();
  const rootOperationStates = new Map();

  const clean = value => String(value == null ? '' : value).trim();
  const upper = value => clean(value).toUpperCase();
  const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const asArray = value => Array.isArray(value) ? value : [];
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const invoiceApi = path => `${window.BROKER_BASE_URL || ''}${path}`;

  function normaliseMode(value) {
    const mode = upper(value);
    if (!MODES.has(mode)) throw new Error('INVOICE_BATCH_MODE_INVALID');
    return mode;
  }

  function emptyFilter() {
    return {
      client_ids: [],
      candidate_ids: [],
      week_endings: [],
      week_ending_from: null,
      week_ending_to: null,
      status_codes: [],
      blocker_codes: [],
      search: null,
      allow_early: false,
      display_mode: 'ALL'
    };
  }

  function normaliseStringArray(value, transform = clean) {
    return [...new Set(asArray(value).map(transform).filter(Boolean))].sort();
  }

  function normaliseFilter(value) {
    const source = asObject(value);
    const displayMode = upper(source.display_mode || 'ALL');
    return {
      client_ids: normaliseStringArray(source.client_ids, item => clean(item).toLowerCase()),
      candidate_ids: normaliseStringArray(source.candidate_ids, item => clean(item).toLowerCase()),
      week_endings: normaliseStringArray(source.week_endings),
      week_ending_from: clean(source.week_ending_from) || null,
      week_ending_to: clean(source.week_ending_to) || null,
      status_codes: normaliseStringArray(source.status_codes, upper),
      blocker_codes: normaliseStringArray(source.blocker_codes, upper),
      search: clean(source.search) || null,
      allow_early: source.allow_early === true,
      display_mode: DISPLAY_MODES.includes(displayMode) ? displayMode : 'ALL'
    };
  }

  function normaliseSort(value, mode) {
    const source = asObject(value);
    const canonicalMode = normaliseMode(mode);
    const groupPreset = upper(source.group_preset || 'WEEK_CLIENT_CANDIDATE');
    const sortKey = upper(source.sort_key || 'WEEK_ENDING_DATE');
    const sortDirection = upper(source.sort_direction || 'DESC');
    return {
      group_preset: GROUP_PRESETS.includes(groupPreset) ? groupPreset : 'WEEK_CLIENT_CANDIDATE',
      sort_key: SORT_KEYS[canonicalMode].includes(sortKey) ? sortKey : 'WEEK_ENDING_DATE',
      sort_direction: ['ASC', 'DESC'].includes(sortDirection) ? sortDirection : 'DESC'
    };
  }

  function preferenceKey(mode) {
    const environment = clean(window.location?.host || 'unknown').toLowerCase();
    const userId = clean(window.__USER_ID || window.__auth?.user?.id || window.SESSION?.user?.id || 'anonymous').toLowerCase();
    return `cloudtms.invoiceBatchPreferences.v1:${environment}:${userId}:${normaliseMode(mode)}`;
  }

  function loadInvoiceBatchPreferences(mode) {
    try {
      return normaliseSort(JSON.parse(localStorage.getItem(preferenceKey(mode)) || '{}'), mode);
    } catch {
      return normaliseSort({}, mode);
    }
  }

  function saveInvoiceBatchPreferences(mode, value) {
    const saved = normaliseSort(value, mode);
    try { localStorage.setItem(preferenceKey(mode), JSON.stringify(saved)); } catch {}
    return saved;
  }

  function createInvoiceBatchSelectionState() {
    return {
      contract_version: SELECTION_VERSION,
      mode: 'IMPLICIT_ALL',
      default_selected: true,
      rules: [],
      next_sequence: 1
    };
  }

  function canonicalSelector(value) {
    const source = asObject(value);
    const type = upper(source.type);
    const selector = { type };
    if (type === 'ROW') {
      selector.selection_key = clean(source.selection_key);
      if (!selector.selection_key) throw new Error('BATCH_SELECTION_SELECTOR_INVALID');
      return selector;
    }
    if (['WEEK', 'WEEK_CLIENT', 'WEEK_CLIENT_CANDIDATE'].includes(type)) {
      selector.week_ending_date = clean(source.week_ending_date);
      if (!selector.week_ending_date) throw new Error('BATCH_SELECTION_SELECTOR_INVALID');
    }
    if (['CLIENT', 'WEEK_CLIENT', 'WEEK_CLIENT_CANDIDATE'].includes(type)) {
      selector.client_id = clean(source.client_id).toLowerCase();
      if (!UUID_RE.test(selector.client_id)) throw new Error('BATCH_SELECTION_SELECTOR_INVALID');
    }
    if (['CANDIDATE', 'WEEK_CLIENT_CANDIDATE'].includes(type)) {
      selector.candidate_id = clean(source.candidate_id).toLowerCase();
      if (!UUID_RE.test(selector.candidate_id)) throw new Error('BATCH_SELECTION_SELECTOR_INVALID');
    }
    if (!['WEEK', 'CLIENT', 'CANDIDATE', 'WEEK_CLIENT', 'WEEK_CLIENT_CANDIDATE'].includes(type)) {
      throw new Error('BATCH_SELECTION_SELECTOR_INVALID');
    }
    return selector;
  }

  function selectorIdentity(selector) {
    const value = canonicalSelector(selector);
    return JSON.stringify(value);
  }

  function applyInvoiceBatchSelectionRule(selection, action, selector) {
    const state = selection && typeof selection === 'object' ? selection : createInvoiceBatchSelectionState();
    const canonicalAction = upper(action);
    if (!['INCLUDE', 'EXCLUDE'].includes(canonicalAction)) throw new Error('BATCH_SELECTION_ACTION_INVALID');
    const canonical = canonicalSelector(selector);
    const identity = selectorIdentity(canonical);
    const rules = asArray(state.rules).filter(rule => selectorIdentity(rule.selector) !== identity);
    if (rules.length >= MAX_RULES) throw new Error('BATCH_SELECTION_RULE_LIMIT_EXCEEDED');
    rules.push({
      sequence: Math.max(1, Number(state.next_sequence) || 1),
      action: canonicalAction,
      selector: canonical
    });
    state.rules = rules;
    state.next_sequence = rules[rules.length - 1].sequence + 1;
    return state;
  }

  function rowCandidateIds(row) {
    const ids = normaliseStringArray(row?.candidate_ids, value => clean(value).toLowerCase());
    const direct = clean(row?.candidate_id).toLowerCase();
    if (direct && !ids.includes(direct)) ids.push(direct);
    return ids;
  }

  function selectorMatchesRow(selectorValue, rowValue) {
    const selector = canonicalSelector(selectorValue);
    const row = asObject(rowValue);
    const week = clean(row.week_ending_date);
    const client = clean(row.client_id).toLowerCase();
    const candidates = rowCandidateIds(row);
    if (selector.type === 'ROW') return clean(row.selection_key) === selector.selection_key;
    if (selector.type === 'WEEK') return week === selector.week_ending_date;
    if (selector.type === 'CLIENT') return client === selector.client_id;
    if (selector.type === 'CANDIDATE') return candidates.includes(selector.candidate_id);
    if (selector.type === 'WEEK_CLIENT') return week === selector.week_ending_date && client === selector.client_id;
    return week === selector.week_ending_date
      && client === selector.client_id
      && candidates.includes(selector.candidate_id);
  }

  function isInvoiceBatchRowSelected(selection, rowValue) {
    const row = asObject(rowValue);
    if (row.selectable !== true) return false;
    let selected = selection?.default_selected !== false;
    for (const rule of asArray(selection?.rules).slice().sort((a, b) => Number(a.sequence) - Number(b.sequence))) {
      if (selectorMatchesRow(rule.selector, row)) selected = upper(rule.action) === 'INCLUDE';
    }
    return selected;
  }

  function selectorContainsSelector(parentValue, childValue) {
    const parent = canonicalSelector(parentValue);
    const child = canonicalSelector(childValue);
    if (parent.type === 'ROW') return child.type === 'ROW' && parent.selection_key === child.selection_key;
    if (parent.week_ending_date && child.week_ending_date !== parent.week_ending_date) return false;
    if (parent.client_id && child.client_id !== parent.client_id) return false;
    if (parent.candidate_id && child.candidate_id !== parent.candidate_id) return false;
    const specificity = { WEEK: 1, CLIENT: 1, CANDIDATE: 1, WEEK_CLIENT: 2, WEEK_CLIENT_CANDIDATE: 3, ROW: 4 };
    return (specificity[child.type] || 0) >= (specificity[parent.type] || 0);
  }

  function deriveInvoiceBatchGroupSelectionState(selection, rows, selector) {
    const selectableRows = asArray(rows).filter(row => row?.selectable === true && selectorMatchesRow(selector, row));
    if (!selectableRows.length) return 'DISABLED';
    const visibleStates = selectableRows.map(row => isInvoiceBatchRowSelected(selection, row));
    const latestGroupRule = asArray(selection?.rules)
      .filter(rule => selectorIdentity(rule.selector) === selectorIdentity(selector))
      .sort((a, b) => Number(b.sequence) - Number(a.sequence))[0];
    const hasLaterDescendant = latestGroupRule && asArray(selection?.rules).some(rule =>
      Number(rule.sequence) > Number(latestGroupRule.sequence)
      && selectorIdentity(rule.selector) !== selectorIdentity(selector)
      && (
        selectorContainsSelector(selector, rule.selector)
        || selectableRows.some(row => selectorMatchesRow(rule.selector, row))
      )
    );
    if (hasLaterDescendant || (visibleStates.some(Boolean) && visibleStates.some(value => !value))) return 'INDETERMINATE';
    return visibleStates.every(Boolean) ? 'CHECKED' : 'UNCHECKED';
  }

  function resetInvoiceBatchSelection(stateOrSelection) {
    const target = stateOrSelection?.selection || stateOrSelection;
    if (!target || typeof target !== 'object') return createInvoiceBatchSelectionState();
    Object.assign(target, createInvoiceBatchSelectionState());
    return target;
  }

  function buildInvoiceBatchSelectionContract(state) {
    const mode = normaliseMode(state.mode);
    const filter = normaliseFilter({ ...state.filter, display_mode: state.display_mode, allow_early: state.filter.allow_early === true });
    const sort = normaliseSort(state.sort, mode);
    const rules = asArray(state.selection?.rules).map(rule => ({
      sequence: Number(rule.sequence),
      action: upper(rule.action),
      selector: canonicalSelector(rule.selector)
    }));
    return {
      contract_version: SELECTION_VERSION,
      query: {
        contract_version: QUERY_VERSION,
        action: mode,
        mode: 'PAGE',
        snapshot_at_utc: clean(state.snapshot_at_utc) || new Date().toISOString(),
        allow_early: filter.allow_early,
        display_mode: filter.display_mode,
        filters: filter,
        sort
      },
      selection: {
        contract_version: SELECTION_VERSION,
        mode: 'IMPLICIT_ALL',
        default_selected: true,
        rules
      }
    };
  }

  function createInvoiceBatchModalState(mode) {
    const canonicalMode = normaliseMode(mode);
    const sort = loadInvoiceBatchPreferences(canonicalMode);
    return {
      id: `invoice-batch:${canonicalMode.toLowerCase()}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      mode: canonicalMode,
      candidate_page: null,
      page_cursor: null,
      page_history: [],
      snapshot_at_utc: null,
      filter: emptyFilter(),
      display_mode: 'ALL',
      sort,
      grouping: sort.group_preset,
      facets: {},
      totals: {},
      selection: createInvoiceBatchSelectionState(),
      loading: false,
      submitting: false,
      confirmation: false,
      root_operation_id: null,
      progress: null,
      result_filter: 'ALL',
      result_page: null,
      result_cursor: null,
      result_history: [],
      viewer_request: null,
      detail_row: null,
      filter_drawer_open: false,
      filter_draft: null,
      error: null,
      command_token: null,
      abort_controller: null,
      request_serial: 0,
      destroyed: false,
      root_element: null,
      delegated_handler: null,
      keydown_handler: null
    };
  }

  function appendArrayParams(params, key, values) {
    for (const value of normaliseStringArray(values)) params.append(key, value);
  }

  function buildCandidateUrl(state, cursor = null) {
    const path = state.mode === 'GENERATE'
      ? '/api/invoices/batch-generate/candidates'
      : '/api/invoices/batch-issue/candidates';
    const params = new URLSearchParams();
    const filter = normaliseFilter({ ...state.filter, display_mode: state.display_mode });
    params.set('page_size', String(PAGE_SIZE));
    params.set('allow_early', String(filter.allow_early));
    params.set('display_mode', filter.display_mode);
    params.set('group_preset', state.sort.group_preset);
    params.set('sort_key', state.sort.sort_key);
    params.set('sort_direction', state.sort.sort_direction);
    if (state.snapshot_at_utc) params.set('snapshot_at_utc', state.snapshot_at_utc);
    if (cursor) params.set('cursor', cursor);
    appendArrayParams(params, 'client_ids', filter.client_ids);
    appendArrayParams(params, 'candidate_ids', filter.candidate_ids);
    appendArrayParams(params, 'week_endings', filter.week_endings);
    appendArrayParams(params, 'status_codes', filter.status_codes);
    appendArrayParams(params, 'blocker_codes', filter.blocker_codes);
    if (filter.week_ending_from) params.set('week_ending_from', filter.week_ending_from);
    if (filter.week_ending_to) params.set('week_ending_to', filter.week_ending_to);
    if (filter.search) params.set('search', filter.search);
    return invoiceApi(`${path}?${params.toString()}`);
  }

  async function fetchInvoiceBatchCandidatePage(state, options = {}) {
    const response = await window.authFetch(buildCandidateUrl(state, options.cursor || null), {
      method: 'GET',
      signal: options.signal,
      headers: { accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Candidate page unavailable (${response.status})`);
    if (payload.contract_version !== CONTRACT_VERSION || upper(payload.action) !== state.mode || !Array.isArray(payload.rows)) {
      throw new Error('INVOICE_BATCH_CANDIDATE_CONTRACT_MISMATCH');
    }
    return payload;
  }

  async function loadInvoiceBatchCandidatePage(state, options = {}) {
    if (state.destroyed) return null;
    try { state.abort_controller?.abort(); } catch {}
    const controller = new AbortController();
    state.abort_controller = controller;
    const serial = ++state.request_serial;
    state.loading = true;
    state.error = null;
    renderInvoiceBatchModal(state);
    try {
      const payload = await fetchInvoiceBatchCandidatePage(state, {
        cursor: options.cursor || null,
        signal: controller.signal
      });
      if (state.destroyed || serial !== state.request_serial) return null;
      state.candidate_page = payload;
      state.snapshot_at_utc = clean(payload.snapshot_at_utc) || state.snapshot_at_utc;
      state.page_cursor = clean(payload.page?.next_cursor) || null;
      state.facets = asObject(payload.facets);
      state.totals = asObject(payload.totals);
      state.filter = normaliseFilter(payload.normalised_filter || payload.normalized_filter || state.filter);
      state.display_mode = state.filter.display_mode;
      state.sort = normaliseSort(payload.normalised_sort || payload.normalized_sort || state.sort, state.mode);
      state.grouping = state.sort.group_preset;
      return payload;
    } catch (error) {
      if (error?.name !== 'AbortError' && serial === state.request_serial) state.error = clean(error?.message || error);
      return null;
    } finally {
      if (serial === state.request_serial) {
        state.loading = false;
        renderInvoiceBatchModal(state);
      }
    }
  }

  function formatMoney(value, currency = 'GBP') {
    const amount = Number(value);
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: /^[A-Z]{3}$/.test(upper(currency)) ? upper(currency) : 'GBP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number.isFinite(amount) ? amount : 0);
    } catch {
      return `£${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
    }
  }

  function candidateDisplay(row) {
    const display = clean(row?.candidate_display);
    if (display) return display;
    const names = normaliseStringArray(row?.candidate_names);
    if (names.length > 1) return `Multiple candidates (${names.length})`;
    return names[0] || '—';
  }

  function weekDisplay(row) {
    const weeks = normaliseStringArray(row?.week_ending_dates || [row?.week_ending_date]);
    return weeks.length > 1 ? 'Multiple weeks' : (clean(row?.week_ending_display || weeks[0]) || '—');
  }

  function shortBadge(codeValue) {
    const code = upper(codeValue);
    const exact = {
      STALE: ['Stale', 'amber'],
      DOCUMENT_STALE: ['Stale', 'amber'],
      MISSING_REFERENCES: ['Missing refs', 'red'],
      REFERENCE_REQUIRED: ['Missing refs', 'red'],
      VAT_REGISTRATION_NUMBER_REQUIRED: ['Missing VAT', 'red'],
      MISSING_VAT_REGISTRATION: ['Missing VAT', 'red'],
      ON_HOLD: ['On hold', 'red'],
      INVOICE_ON_HOLD: ['On hold', 'red'],
      DOCUMENT_NOT_READY: ['Not generated', 'red'],
      NOT_GENERATED: ['Not generated', 'neutral'],
      RENDER_FAILED: ['Failed render', 'red'],
      DOCUMENT_RENDER_FAILED: ['Failed render', 'red'],
      VERIFICATION_FAILED: ['Verification failed', 'red'],
      DOCUMENT_VERIFICATION_FAILED: ['Verification failed', 'red'],
      BLOCKED_FOR_SENDING: ['Blocked for sending', 'amber'],
      DELIVERY_BLOCKED: ['Blocked for sending', 'amber'],
      EARLY: ['Early', 'neutral'],
      IN_PROGRESS: ['In progress', 'blue'],
      FAILED: ['Generation failed', 'red'],
      GENERATION_FAILED: ['Generation failed', 'red'],
      ISSUE_FAILED: ['Issue failed', 'red']
    };
    if (exact[code]) return { code, label: exact[code][0], tone: exact[code][1] };
    if (/VAT/.test(code)) return { code, label: 'Missing VAT', tone: 'red' };
    if (/REF/.test(code)) return { code, label: 'Missing refs', tone: 'red' };
    if (/STALE|REVISION_CHANGED/.test(code)) return { code, label: 'Stale', tone: 'amber' };
    if (/VERIFY/.test(code)) return { code, label: 'Verification failed', tone: 'red' };
    if (/RENDER/.test(code)) return { code, label: 'Failed render', tone: 'red' };
    if (/HOLD/.test(code)) return { code, label: 'On hold', tone: 'red' };
    if (/DELIVERY|SEND/.test(code)) return { code, label: 'Blocked for sending', tone: 'amber' };
    return { code, label: code.replaceAll('_', ' ').toLowerCase().replace(/^\w/, value => value.toUpperCase()), tone: 'red' };
  }

  function rowBadgeCodes(row, mode) {
    const codes = mode === 'ISSUE'
      ? [...asArray(row.issue_blocker_codes), ...asArray(row.delivery_blocker_codes), ...asArray(row.informational_codes)]
      : [...asArray(row.action_blocker_codes), ...asArray(row.informational_codes)];
    if (mode === 'GENERATE') {
      const generationState = upper(row.generation_state);
      if (['NOT_GENERATED', 'STALE', 'FAILED', 'GENERATION_FAILED'].includes(generationState)) {
        codes.push(generationState);
      }
    }
    if (row.is_early === true) codes.push('EARLY');
    if (row.blocked_for_sending === true) codes.push('BLOCKED_FOR_SENDING');
    if (upper(row.row_status) === 'IN_PROGRESS') codes.push('IN_PROGRESS');
    return [...new Set(codes.map(upper).filter(Boolean))];
  }

  function renderInvoiceBatchBadges(row, mode) {
    return rowBadgeCodes(row, mode).map(code => {
      const badge = shortBadge(code);
      return `<span class="invbatch-badge invbatch-badge--${badge.tone}" title="${escapeHtml(code)}">${escapeHtml(badge.label)}</span>`;
    }).join('');
  }

  function rowSelector(row) {
    return { type: 'ROW', selection_key: clean(row.selection_key) };
  }

  function encodeSelector(selector) {
    return encodeURIComponent(JSON.stringify(canonicalSelector(selector)));
  }

  function decodeSelector(value) {
    try { return canonicalSelector(JSON.parse(decodeURIComponent(value))); } catch { throw new Error('BATCH_SELECTION_SELECTOR_INVALID'); }
  }

  function renderInvoiceBatchRow(row, state) {
    const selected = isInvoiceBatchRowSelected(state.selection, row);
    const issue = state.mode === 'ISSUE';
    const checkbox = row.selectable === true
      ? `<input type="checkbox" data-batch-field="row-selection" data-selection-key="${escapeHtml(row.selection_key)}" ${selected ? 'checked' : ''} aria-label="${selected ? 'Exclude' : 'Include'} ${escapeHtml(issue ? row.invoice_number : candidateDisplay(row))}">`
      : '<span class="invbatch-checkbox-space" aria-hidden="true"></span>';
    const previewAction = !issue && row.selectable === true && upper(row.row_status) !== 'IN_PROGRESS'
      ? `<button type="button" class="btn btn-xs btn-outline" data-batch-action="generate-view" data-selection-key="${escapeHtml(row.selection_key)}">${upper(row.generation_state) === 'STALE' ? 'Regenerate and view' : 'Generate and view'}</button>`
      : (upper(row.row_status) === 'IN_PROGRESS' ? '<span class="invbatch-inline-state">Generating</span>' : '');
    const viewAction = row.document_version_id && row.can_view === true
      ? `<button type="button" class="btn btn-xs btn-outline" data-batch-action="view-document" data-document-version-id="${escapeHtml(row.document_version_id)}">View</button>`
      : '';
    return `
      <div class="invbatch-row ${row.selectable === true ? '' : 'is-blocked'}" data-selection-key="${escapeHtml(row.selection_key)}" role="row">
        <div class="invbatch-cell invbatch-cell--select" role="cell">${checkbox}</div>
        ${issue ? `<div class="invbatch-cell invbatch-cell--invoice" role="cell"><strong>${escapeHtml(row.invoice_number || '—')}</strong></div>` : ''}
        <div class="invbatch-cell" role="cell"><strong>${escapeHtml(row.client_name || '—')}</strong></div>
        <div class="invbatch-cell" role="cell">${escapeHtml(weekDisplay(row))}</div>
        <div class="invbatch-cell" role="cell">${escapeHtml(candidateDisplay(row))}</div>
        <div class="invbatch-cell invbatch-cell--money" role="cell">${escapeHtml(formatMoney(row.total_ex_vat, row.currency))}</div>
        <div class="invbatch-cell invbatch-cell--money" role="cell">${escapeHtml(formatMoney(row.total_inc_vat, row.currency))}</div>
        <div class="invbatch-cell invbatch-cell--status" role="cell">${renderInvoiceBatchBadges(row, state.mode) || '<span class="invbatch-badge invbatch-badge--ready">Ready</span>'}</div>
        <div class="invbatch-cell invbatch-cell--actions" role="cell">
          ${previewAction}${viewAction}
          <button type="button" class="btn btn-xs btn-outline" data-batch-action="row-details" data-selection-key="${escapeHtml(row.selection_key)}">Details</button>
        </div>
      </div>`;
  }

  function groupLevels(state) {
    const preset = state.grouping || state.sort.group_preset;
    if (preset === 'CLIENT_WEEK_CANDIDATE') return ['CLIENT', 'WEEK', 'CANDIDATE'];
    if (preset === 'CANDIDATE_WEEK_CLIENT') return ['CANDIDATE', 'WEEK', 'CLIENT'];
    if (preset === 'STATUS_WEEK_CLIENT') return ['STATUS', 'WEEK', 'CLIENT'];
    return ['WEEK', 'CLIENT', 'CANDIDATE'];
  }

  function groupValue(row, level) {
    if (level === 'WEEK') {
      const weeks = normaliseStringArray(row.week_ending_dates || [row.week_ending_date]);
      return weeks.length > 1 ? `multiple:${weeks.join(',')}` : (weeks[0] || 'unknown');
    }
    if (level === 'CLIENT') return clean(row.client_id).toLowerCase() || 'unknown';
    if (level === 'CANDIDATE') {
      const ids = rowCandidateIds(row);
      return ids.length === 1 ? ids[0] : `multiple:${ids.join(',')}`;
    }
    return upper(row.row_status || row.generation_state || row.generated_state || 'UNKNOWN');
  }

  function groupLabel(row, level) {
    if (level === 'WEEK') {
      const weeks = normaliseStringArray(row.week_ending_dates || [row.week_ending_date]);
      return weeks.length > 1 ? 'Multiple weeks' : (clean(row.week_ending_display || weeks[0]) || 'Unknown week');
    }
    if (level === 'CLIENT') return clean(row.client_name) || 'Unknown client';
    if (level === 'CANDIDATE') return candidateDisplay(row);
    return clean(row.row_status || row.generation_state || row.generated_state).replaceAll('_', ' ') || 'Unknown status';
  }

  function groupSelectorForRows(level, rows) {
    const first = rows[0] || {};
    const weeks = [...new Set(asArray(rows).flatMap(row => normaliseStringArray(row.week_ending_dates || [row.week_ending_date])))];
    const clients = [...new Set(asArray(rows).map(row => clean(row.client_id).toLowerCase()).filter(Boolean))];
    const candidateSets = asArray(rows).map(rowCandidateIds);
    const commonCandidates = candidateSets.length
      ? candidateSets[0].filter(id => candidateSets.every(ids => ids.includes(id)))
      : [];
    if (level === 'WEEK') {
      return weeks.length === 1 ? { type: 'WEEK', week_ending_date: weeks[0] } : null;
    }
    if (level === 'CLIENT') {
      if (clients.length !== 1) return null;
      if (weeks.length === 1 && commonCandidates.length === 1) {
        return { type: 'WEEK_CLIENT_CANDIDATE', week_ending_date: weeks[0], client_id: clients[0], candidate_id: commonCandidates[0] };
      }
      if (weeks.length === 1) return { type: 'WEEK_CLIENT', week_ending_date: weeks[0], client_id: clients[0] };
      return { type: 'CLIENT', client_id: clients[0] };
    }
    if (level === 'CANDIDATE') {
      const ids = rowCandidateIds(first);
      if (ids.length !== 1) return null;
      if (weeks.length === 1 && clients.length === 1) {
        return { type: 'WEEK_CLIENT_CANDIDATE', week_ending_date: weeks[0], client_id: clients[0], candidate_id: ids[0] };
      }
      return { type: 'CANDIDATE', candidate_id: ids[0] };
    }
    return null;
  }

  function buildGroups(rows, levels, depth = 0) {
    if (depth >= levels.length) return asArray(rows);
    const level = levels[depth];
    const map = new Map();
    for (const row of rows) {
      const key = groupValue(row, level);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()].map(([key, children]) => ({
      key,
      level,
      label: groupLabel(children[0], level),
      rows: children,
      children: buildGroups(children, levels, depth + 1)
    }));
  }

  function renderGroupNode(node, state, depth = 0) {
    if (!node) return '';
    if (Array.isArray(node)) return node.map(child => renderGroupNode(child, state, depth)).join('');
    if (!Array.isArray(node.rows)) return renderInvoiceBatchRow(node, state);
    const selector = groupSelectorForRows(node.level, node.rows);
    const groupState = selector ? deriveInvoiceBatchGroupSelectionState(state.selection, node.rows, selector) : 'DISABLED';
    const eligibleCount = node.rows.filter(row => row.selectable === true).length;
    const checkbox = selector && groupState !== 'DISABLED'
      ? `<input type="checkbox" data-batch-field="group-selection" data-selector="${escapeHtml(encodeSelector(selector))}" ${groupState === 'CHECKED' ? 'checked' : ''} data-indeterminate="${groupState === 'INDETERMINATE' ? 'true' : 'false'}" aria-label="Select ${escapeHtml(node.label)}">`
      : '';
    return `
      <section class="invbatch-group invbatch-group--depth-${depth}">
        <header class="invbatch-group-header">
          ${checkbox}
          <span>${escapeHtml(node.label)}</span>
          <span class="invbatch-group-count">${eligibleCount} eligible · ${node.rows.length - eligibleCount} blocked</span>
        </header>
        <div class="invbatch-group-body">${asArray(node.children)
          .map(child => renderGroupNode(child, state, depth + 1))
          .join('')}</div>
      </section>`;
  }

  function renderInvoiceBatchGroups(state) {
    const rows = asArray(state.candidate_page?.rows);
    if (!rows.length) return '<div class="invbatch-empty">No matching items.</div>';
    const grouped = buildGroups(rows, groupLevels(state));
    return grouped.map(group => renderGroupNode(group, state)).join('');
  }

  function displayModeLabel(state) {
    const labels = state.mode === 'ISSUE'
      ? { ALL: 'All invoices', BLOCKED: 'Blocked invoices', READY: 'Ready invoices' }
      : { ALL: 'All generation candidates', BLOCKED: 'Blocked generation candidates', READY: 'Ready generation candidates' };
    return labels[state.display_mode] || labels.ALL;
  }

  function renderInvoiceBatchToolbar(state) {
    const sortOptions = SORT_KEYS[state.mode].map(key => `<option value="${key}" ${state.sort.sort_key === key ? 'selected' : ''}>${escapeHtml(key.replaceAll('_', ' ').toLowerCase().replace(/^\w/, value => value.toUpperCase()))}</option>`).join('');
    const groupOptions = GROUP_PRESETS.map(key => `<option value="${key}" ${state.grouping === key ? 'selected' : ''}>${escapeHtml(key.replaceAll('_', ' › ').toLowerCase().replace(/^\w/, value => value.toUpperCase()))}</option>`).join('');
    return `
      <div class="invbatch-toolbar">
        <button type="button" class="btn btn-sm btn-outline" data-batch-action="cycle-display">${escapeHtml(displayModeLabel(state))}</button>
        <button type="button" class="btn btn-sm btn-outline" data-batch-action="open-filter" aria-expanded="${state.filter_drawer_open ? 'true' : 'false'}">Filter</button>
        <label class="invbatch-toggle"><input type="checkbox" data-batch-field="allow-early" ${state.filter.allow_early ? 'checked' : ''}> Batch early</label>
        <label>Group by <select data-batch-field="grouping">${groupOptions}</select></label>
        <label>Sort <select data-batch-field="sort-key">${sortOptions}</select></label>
        <label>Direction <select data-batch-field="sort-direction"><option value="DESC" ${state.sort.sort_direction === 'DESC' ? 'selected' : ''}>Descending</option><option value="ASC" ${state.sort.sort_direction === 'ASC' ? 'selected' : ''}>Ascending</option></select></label>
        <label class="invbatch-search"><span class="sr-only">Search</span><input type="search" data-batch-field="toolbar-search" value="${escapeHtml(state.filter.search || '')}" placeholder="Search"><button type="button" class="btn btn-sm btn-outline" data-batch-action="apply-search">Search</button></label>
        <button type="button" class="btn btn-sm btn-outline" data-batch-action="reset-selection">Reset selection</button>
      </div>`;
  }

  function facetOptions(state, kind) {
    const rows = asArray(state.candidate_page?.rows);
    const map = new Map();
    const facetValues = asArray(state.facets?.[kind]);
    for (const item of facetValues) {
      const row = asObject(item);
      const id = clean(row.id || row[`${kind.slice(0, -1)}_id`]).toLowerCase();
      const label = clean(row.name || row.label || row.display);
      if (id && label) map.set(id, label);
    }
    for (const row of rows) {
      if (kind === 'clients') {
        const id = clean(row.client_id).toLowerCase();
        if (id) map.set(id, clean(row.client_name) || id);
      } else if (kind === 'candidates') {
        const ids = rowCandidateIds(row);
        const names = asArray(row.candidate_names);
        ids.forEach((id, index) => map.set(id, clean(names[index]) || (ids.length === 1 ? candidateDisplay(row) : id)));
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }

  function blockerOptions(state) {
    return [...new Set(asArray(state.candidate_page?.rows).flatMap(row => rowBadgeCodes(row, state.mode)))].sort();
  }

  function weekOptions(state) {
    const map = new Map();
    for (const item of asArray(state.facets?.week_endings)) {
      const row = asObject(item);
      const value = clean(row.value || row.week_ending_date || row.id);
      if (value) map.set(value, clean(row.label || row.week_ending_display || value));
    }
    for (const row of asArray(state.candidate_page?.rows)) {
      for (const value of normaliseStringArray(row.week_ending_dates || [row.week_ending_date])) {
        if (value) map.set(value, clean(row.week_ending_display) || value);
      }
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }

  function renderCheckOptions(entries, selected, field) {
    const selectedSet = new Set(asArray(selected));
    if (!entries.length) return '<span class="mini">No choices on this page.</span>';
    return entries.map(([value, label]) => `<label><input type="checkbox" data-filter-list="${field}" value="${escapeHtml(value)}" ${selectedSet.has(value) ? 'checked' : ''}> ${escapeHtml(label)}</label>`).join('');
  }

  function renderInvoiceBatchFilterDrawer(state) {
    if (!state.filter_drawer_open) return '';
    const draft = normaliseFilter(state.filter_draft || state.filter);
    const clientOptions = facetOptions(state, 'clients');
    const candidateOptions = facetOptions(state, 'candidates');
    const weeks = weekOptions(state);
    const blockers = blockerOptions(state).map(code => [code, shortBadge(code).label]);
    const statuses = ['READY', 'BLOCKED', 'IN_PROGRESS', 'STALE', 'FAILED'].map(code => [code, code.replaceAll('_', ' ')]);
    return `
      <aside class="invbatch-filter-drawer" data-batch-filter-drawer role="dialog" aria-modal="true" aria-label="Invoice batch filters">
        <header><h3>Filter</h3><button type="button" class="btn btn-sm btn-outline" data-batch-action="close-filter">Close</button></header>
        <label>Search<input type="search" data-filter-field="search" value="${escapeHtml(draft.search || '')}"></label>
        <div class="invbatch-filter-dates"><label>Week ending from<input type="date" data-filter-field="week_ending_from" value="${escapeHtml(draft.week_ending_from || '')}"></label><label>Week ending to<input type="date" data-filter-field="week_ending_to" value="${escapeHtml(draft.week_ending_to || '')}"></label></div>
        <fieldset><legend>Week ending</legend><div class="invbatch-filter-options">${renderCheckOptions(weeks, draft.week_endings, 'week_endings')}</div></fieldset>
        <fieldset><legend>Clients</legend><div class="invbatch-filter-options">${renderCheckOptions(clientOptions, draft.client_ids, 'client_ids')}</div></fieldset>
        <fieldset><legend>Candidates</legend><div class="invbatch-filter-options">${renderCheckOptions(candidateOptions, draft.candidate_ids, 'candidate_ids')}</div></fieldset>
        <fieldset><legend>Status</legend><div class="invbatch-filter-options">${renderCheckOptions(statuses, draft.status_codes, 'status_codes')}</div></fieldset>
        <fieldset><legend>Blockers</legend><div class="invbatch-filter-options">${renderCheckOptions(blockers, draft.blocker_codes, 'blocker_codes')}</div></fieldset>
        <label class="invbatch-toggle"><input type="checkbox" data-filter-field="allow_early" ${draft.allow_early ? 'checked' : ''}> Batch early</label>
        <footer><button type="button" class="btn btn-outline" data-batch-action="clear-filter">Clear filters</button><button type="button" class="btn btn-primary" data-batch-action="apply-filter">Apply</button></footer>
      </aside>`;
  }

  function renderInvoiceBatchPager(state) {
    const page = asObject(state.candidate_page?.page);
    const total = Number(state.totals.all ?? page.total_count ?? 0);
    const returned = asArray(state.candidate_page?.rows).length;
    const start = returned ? state.page_history.length * PAGE_SIZE + 1 : 0;
    const end = returned ? start + returned - 1 : 0;
    return `
      <div class="invbatch-pager">
        <span>Showing ${start.toLocaleString('en-GB')}–${end.toLocaleString('en-GB')} of ${Math.max(total, end).toLocaleString('en-GB')}</span>
        <span><button type="button" class="btn btn-sm btn-outline" data-batch-action="page-back" ${state.page_history.length ? '' : 'disabled'}>Back</button><button type="button" class="btn btn-sm btn-outline" data-batch-action="page-next" ${page.has_more && state.page_cursor ? '' : 'disabled'}>Next</button></span>
      </div>`;
  }

  function selectedSummary(state) {
    const rows = asArray(state.candidate_page?.rows);
    const ready = Math.max(0, Number(state.totals.ready || 0));
    if (!asArray(state.selection.rules).length) return { exact: true, count: ready, label: ready.toLocaleString('en-GB') };
    const allRowsVisible = Number(state.totals.all || 0) <= rows.length;
    const visibleSelected = rows.filter(row => isInvoiceBatchRowSelected(state.selection, row)).length;
    if (allRowsVisible) return { exact: true, count: visibleSelected, label: visibleSelected.toLocaleString('en-GB') };
    return {
      exact: false,
      count: ready > 0 ? ready : visibleSelected,
      label: `${ready.toLocaleString('en-GB')} eligible minus saved exclusions`
    };
  }

  function renderInvoiceBatchFooter(state) {
    const selected = selectedSummary(state);
    const ready = Math.max(0, Number(state.totals.ready || 0));
    const blocked = Math.max(0, Number(state.totals.blocked || 0));
    const primary = state.mode === 'ISSUE' ? 'Issue selected invoices' : 'Generate selected';
    return `
      <footer class="invbatch-footer">
        <div><span><strong>${ready.toLocaleString('en-GB')}</strong> eligible</span><span><strong>${escapeHtml(selected.label)}</strong> selected</span><span><strong>${blocked.toLocaleString('en-GB')}</strong> blocked</span></div>
        <div><button type="button" class="btn btn-outline" data-batch-action="close">Cancel</button><button type="button" class="btn btn-primary" data-batch-action="confirm-open" ${(selected.count > 0 && !state.submitting) ? '' : 'disabled'}>${escapeHtml(primary)}</button></div>
      </footer>`;
  }

  function renderInvoiceBatchConfirmation(state) {
    const selected = selectedSummary(state);
    const early = state.filter.allow_early === true ? 'Batch early is included.' : 'Batch early is not included.';
    if (state.mode === 'ISSUE') {
      return `<section class="invbatch-confirmation" role="alertdialog" aria-modal="true" aria-label="Confirm legal invoice issue">
        <h3>Issue selected invoices?</h3>
        <p><strong>${escapeHtml(selected.label)}</strong> invoices will be submitted for legal issue.</p>
        <p>${Number(state.totals.blocked_for_sending || 0).toLocaleString('en-GB')} invoices are blocked for sending but may still be issued.</p>
        <p>${Number(state.totals.blocked || 0).toLocaleString('en-GB')} blocked invoices will be skipped.</p>
        <p>${escapeHtml(early)}</p>
        <p class="invbatch-legal-warning">Issuing invoices is a legal action. Only generated, fresh and verified invoices will be issued.</p>
        <div><button type="button" class="btn btn-outline" data-batch-action="confirm-cancel">Back</button><button type="button" class="btn btn-primary" data-batch-action="submit" ${state.submitting ? 'disabled' : ''}>Issue selected invoices</button></div>
      </section>`;
    }
    return `<section class="invbatch-confirmation" role="dialog" aria-modal="true" aria-label="Confirm invoice generation">
      <h3>Generate selected items?</h3>
      <p><strong>${escapeHtml(selected.label)}</strong> items will be submitted.</p>
      <p>${Number(state.totals.not_generated || 0).toLocaleString('en-GB')} not generated.</p>
      <p>${Number(state.totals.stale || 0).toLocaleString('en-GB')} stale items will be regenerated.</p>
      <p>${Number(state.totals.blocked || 0).toLocaleString('en-GB')} blocked items will be skipped.</p>
      <p>${escapeHtml(early)}</p>
      <div><button type="button" class="btn btn-outline" data-batch-action="confirm-cancel">Back</button><button type="button" class="btn btn-primary" data-batch-action="submit" ${state.submitting ? 'disabled' : ''}>Generate selected</button></div>
    </section>`;
  }

  function progressLabel(state) {
    const progress = asObject(state.progress);
    const status = upper(progress.status || 'QUEUED');
    const phase = upper(progress.phase || progress.current_phase || status);
    const labels = {
      SUBMITTED: 'Queued', QUEUED: 'Queued', EXPAND_SELECTION: 'Preparing selection',
      GENERATE: 'Generating', BUILD: 'Generating', RENDER: 'Rendering', SOURCE_RENDER: 'Rendering',
      FREEZE: 'Freezing final snapshot', MERGE: 'Merging', PDF_MERGE: 'Merging',
      VERIFY: 'Verifying', DOCUMENT_VERIFY: 'Verifying', FINALISE: 'Finalising issue',
      COMPLETE: state.mode === 'ISSUE' ? 'Issued' : 'Generated',
      FAILED: 'Failed', DEAD_LETTER: 'Failed', BLOCKED: 'Needs attention'
    };
    return labels[phase] || labels[status] || clean(phase.replaceAll('_', ' ').toLowerCase()).replace(/^\w/, value => value.toUpperCase());
  }

  function renderInvoiceBatchProgress(state) {
    const progress = asObject(state.progress);
    const counts = asObject(progress.progress || progress.progress_summary || progress.progress_counts);
    const completed = Number(counts.completed ?? counts.complete ?? counts.completed_count);
    const total = Number(counts.total ?? counts.total_count);
    return `<section class="invbatch-progress" aria-live="polite">
      <div class="invbatch-spinner" aria-hidden="true"></div>
      <h3>${escapeHtml(progressLabel(state))}</h3>
      ${Number.isFinite(completed) && Number.isFinite(total) && total > 0 ? `<p>${completed.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}</p>` : '<p>The operation is continuing in the background. You can close this window and return later.</p>'}
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ''}
      <button type="button" class="btn btn-outline" data-batch-action="close">Close</button>
    </section>`;
  }

  function resultCounts(state) {
    const operation = asObject(state.progress);
    const progress = asObject(operation.progress || operation.result || operation.progress_summary);
    return {
      completed: Number(progress.completed_count ?? progress.generated_count ?? progress.issued_count ?? progress.complete ?? 0) || 0,
      regenerated: Number(progress.regenerated_count ?? 0) || 0,
      active: Number(progress.reused_active_count ?? progress.already_active_count ?? 0) || 0,
      blocked: Number(progress.blocked_count ?? 0) || 0,
      changed: Number(progress.changed_count ?? progress.skipped_count ?? 0) || 0,
      failed: Number(progress.failed_count ?? 0) || 0,
      sendBlocked: Number(progress.issued_send_blocked_count ?? progress.blocked_for_sending_count ?? 0) || 0
    };
  }

  function renderResultRows(state) {
    const rows = asArray(state.result_page?.rows);
    if (!rows.length) return '<div class="invbatch-empty">No results in this category.</div>';
    return rows.map(row => `<div class="invbatch-result-row">
      <span><strong>${escapeHtml(row.invoice_number || row.client_name || row.selection_key || 'Result')}</strong><br><span class="mini">${escapeHtml(row.candidate_display || '')} ${escapeHtml(row.week_ending_display || '')}</span></span>
      <span>${renderInvoiceBatchBadges({ ...row, informational_codes: row.badge_codes || [] }, state.mode) || `<span class="invbatch-badge invbatch-badge--${upper(row.status) === 'COMPLETE' ? 'ready' : 'neutral'}">${escapeHtml(clean(row.status || row.phase || 'Complete'))}</span>`}</span>
      <span>${row.document_version_id && row.can_view ? `<button type="button" class="btn btn-xs btn-outline" data-batch-action="view-document" data-document-version-id="${escapeHtml(row.document_version_id)}">View</button>` : ''}</span>
    </div>`).join('');
  }

  function renderInvoiceBatchResultSummary(state) {
    const counts = resultCounts(state);
    const issue = state.mode === 'ISSUE';
    const categories = RESULT_CATEGORIES[state.mode].map(category => `<button type="button" class="btn btn-sm ${state.result_filter === category ? 'btn-primary' : 'btn-outline'}" data-batch-action="result-filter" data-result-category="${category}">${escapeHtml(category.replaceAll('_', ' ').toLowerCase().replace(/^\w/, value => value.toUpperCase()))}</button>`).join('');
    return `<section class="invbatch-results">
      <h3>${issue ? 'Batch Issue results' : 'Batch Generate results'}</h3>
      <div class="invbatch-result-summary">
        <span><strong>${counts.completed}</strong> ${issue ? 'Issued' : 'Generated'}</span>
        ${issue ? `<span><strong>${counts.sendBlocked}</strong> Issued but blocked for sending</span>` : `<span><strong>${counts.regenerated}</strong> Regenerated</span>`}
        <span><strong>${counts.active}</strong> Already active</span>
        <span><strong>${counts.blocked}</strong> Blocked</span>
        <span><strong>${counts.changed}</strong> Changed/skipped</span>
        <span><strong>${counts.failed}</strong> Failed</span>
      </div>
      <div class="invbatch-result-filters">${categories}</div>
      <div class="invbatch-result-rows">${renderResultRows(state)}</div>
      <div class="invbatch-pager"><span>${Number(state.result_page?.total_count || 0).toLocaleString('en-GB')} results</span><span><button type="button" class="btn btn-sm btn-outline" data-batch-action="result-back" ${state.result_history.length ? '' : 'disabled'}>Back</button><button type="button" class="btn btn-sm btn-outline" data-batch-action="result-next" ${state.result_page?.has_more && state.result_cursor ? '' : 'disabled'}>Next</button></span></div>
      <button type="button" class="btn btn-outline" data-batch-action="close">Close</button>
    </section>`;
  }

  function findRow(state, selectionKey) {
    return asArray(state.candidate_page?.rows).find(row => clean(row.selection_key) === clean(selectionKey)) || null;
  }

  function renderRowDetails(state) {
    const row = state.detail_row;
    if (!row) return '';
    const codes = rowBadgeCodes(row, state.mode);
    return `<aside class="invbatch-detail-panel" role="dialog" aria-modal="true" aria-label="Invoice batch item details">
      <header><h3>Item details</h3><button type="button" class="btn btn-sm btn-outline" data-batch-action="close-details">Close</button></header>
      <dl>
        ${state.mode === 'ISSUE' ? `<dt>Invoice</dt><dd>${escapeHtml(row.invoice_number || '—')}</dd>` : ''}
        <dt>Client</dt><dd>${escapeHtml(row.client_name || '—')}</dd>
        <dt>Candidate</dt><dd>${escapeHtml(candidateDisplay(row))}</dd>
        <dt>Week ending</dt><dd>${escapeHtml(weekDisplay(row))}</dd>
        <dt>Current state</dt><dd>${escapeHtml(row.row_status || row.generation_state || row.generated_state || '—')}</dd>
      </dl>
      <h4>Why this item needs attention</h4>
      ${codes.length ? `<ul>${codes.map(code => `<li><strong>${escapeHtml(shortBadge(code).label)}:</strong> ${escapeHtml(code.replaceAll('_', ' ').toLowerCase())}</li>`).join('')}</ul>` : '<p>No blockers were reported by the backend.</p>'}
      <p class="mini">Eligibility and legal status are determined by the server. Internal technical details are intentionally hidden.</p>
    </aside>`;
  }

  function renderViewer(state) {
    const viewer = asObject(state.viewer_request);
    if (!viewer.open) return '';
    return `<aside class="invbatch-viewer" role="dialog" aria-modal="true" aria-label="Invoice preview">
      <header><h3>Invoice preview</h3><button type="button" class="btn btn-sm btn-outline" data-batch-action="close-viewer">Close</button></header>
      <div class="invbatch-viewer-status" aria-live="polite">${escapeHtml(viewer.status_message || 'Preparing preview')}</div>
      ${viewer.error ? `<div class="error">${escapeHtml(viewer.error)}</div>` : ''}
      ${viewer.blob_url ? `<iframe src="${escapeHtml(viewer.blob_url)}" title="Invoice PDF preview"></iframe>` : '<div class="invbatch-viewer-placeholder"><div class="invbatch-spinner"></div><span>Preparing preview</span></div>'}
    </aside>`;
  }

  function applyIndeterminateCheckboxes(root) {
    for (const checkbox of root?.querySelectorAll?.('input[data-indeterminate="true"]') || []) checkbox.indeterminate = true;
  }

  function renderInvoiceBatchModal(state) {
    const root = state.root_element;
    if (!root || state.destroyed) return '';
    let body;
    if (state.result_page && TERMINAL.has(upper(state.progress?.status))) body = renderInvoiceBatchResultSummary(state);
    else if (state.root_operation_id) body = renderInvoiceBatchProgress(state);
    else if (state.confirmation) body = renderInvoiceBatchConfirmation(state);
    else body = `
      <div class="invbatch-summary-strip">
        <span><strong>${Number(state.totals.all || 0).toLocaleString('en-GB')}</strong> shown by current filter</span>
        <span><strong>${Number(state.totals.ready || 0).toLocaleString('en-GB')}</strong> eligible</span>
        <span><strong>${Number(state.totals.blocked || 0).toLocaleString('en-GB')}</strong> blocked</span>
      </div>
      ${renderInvoiceBatchToolbar(state)}
      ${state.error ? `<div class="invbatch-error" role="alert">${escapeHtml(state.error)}</div>` : ''}
      <div class="invbatch-list" role="table" aria-busy="${state.loading ? 'true' : 'false'}">
        ${state.loading && !state.candidate_page ? '<div class="invbatch-empty"><div class="invbatch-spinner"></div> Loading candidates…</div>' : renderInvoiceBatchGroups(state)}
      </div>
      ${renderInvoiceBatchPager(state)}
      ${renderInvoiceBatchFooter(state)}
      ${renderInvoiceBatchFilterDrawer(state)}
      ${renderRowDetails(state)}
      ${renderViewer(state)}`;
    root.innerHTML = body;
    applyIndeterminateCheckboxes(root);
    if (state.filter_drawer_open) {
      const drawer = root.querySelector('[data-batch-filter-drawer]');
      const first = drawer?.querySelector('input,select,button');
      try { first?.focus({ preventScroll: true }); } catch {}
    }
    return body;
  }

  function readFilterDrawer(state) {
    const drawer = state.root_element?.querySelector('[data-batch-filter-drawer]');
    if (!drawer) return normaliseFilter(state.filter);
    const values = field => [...drawer.querySelectorAll(`[data-filter-list="${field}"]:checked`)].map(input => input.value);
    return normaliseFilter({
      client_ids: values('client_ids'),
      candidate_ids: values('candidate_ids'),
      status_codes: values('status_codes'),
      blocker_codes: values('blocker_codes'),
      week_endings: values('week_endings'),
      week_ending_from: drawer.querySelector('[data-filter-field="week_ending_from"]')?.value || null,
      week_ending_to: drawer.querySelector('[data-filter-field="week_ending_to"]')?.value || null,
      search: drawer.querySelector('[data-filter-field="search"]')?.value || null,
      allow_early: drawer.querySelector('[data-filter-field="allow_early"]')?.checked === true,
      display_mode: state.display_mode
    });
  }

  function resetPaging(state) {
    state.snapshot_at_utc = null;
    state.page_cursor = null;
    state.page_history = [];
    state.candidate_page = null;
  }

  async function reloadFirstPage(state) {
    resetPaging(state);
    await loadInvoiceBatchCandidatePage(state);
  }

  async function submitInvoiceBatchOperation(state) {
    if (state.submitting) return null;
    state.submitting = true;
    state.error = null;
    state.command_token = state.command_token || crypto.randomUUID();
    renderInvoiceBatchModal(state);
    try {
      const path = state.mode === 'GENERATE'
        ? '/api/invoices/batch-generate/confirm'
        : '/api/invoices/batch-issue/confirm';
      const body = {
        selection_contract: buildInvoiceBatchSelectionContract(state),
        command_token: state.command_token
      };
      if (state.mode === 'ISSUE') {
        body.deliver = true;
        body.delivery_request_token = state.command_token;
      }
      const response = await window.authFetch(invoiceApi(path), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': state.command_token },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (![200, 202, 207].includes(response.status)) throw new Error(payload.error || payload.message || `Batch request failed (${response.status})`);
      const registered = window.registerInvoiceOperationsFromResponse?.(payload, {
        response_family: state.mode === 'GENERATE' ? 'BATCH_GENERATE' : 'BATCH_ISSUE',
        operation_type: state.mode === 'GENERATE' ? 'BATCH_GENERATE' : 'BATCH_ISSUE',
        purpose: state.mode === 'GENERATE' ? 'BATCH_GENERATE' : 'BATCH_ISSUE_AND_DELIVER',
        command_token: state.command_token,
        modal_identity: state.id,
        explicit_operation_ids: true
      }) || [];
      state.root_operation_id = clean(payload.root_operation_id || registered[0]?.operation_id).toLowerCase() || null;
      state.progress = registered.find(row => row.operation_id === state.root_operation_id)
        || asObject(payload.per_command_results?.[0])
        || { operation_id: state.root_operation_id, status: response.status === 200 ? 'COMPLETE' : 'QUEUED', phase: 'QUEUED' };
      state.confirmation = false;
      if (state.root_operation_id) {
        rootOperationStates.set(state.root_operation_id, state);
        registerInvoiceBatchOperation(state, payload);
      }
      if (response.status === 200 && state.root_operation_id) await loadInvoiceBatchResultPage(state, { category: 'ALL' });
      return payload;
    } catch (error) {
      state.error = clean(error?.message || error);
      state.root_operation_id = null;
      state.progress = null;
      return null;
    } finally {
      state.submitting = false;
      renderInvoiceBatchModal(state);
    }
  }

  function registerInvoiceBatchOperation(state, payload = {}) {
    if (!state.root_operation_id) return null;
    const record = {
      operation_id: state.root_operation_id,
      root_operation_id: state.root_operation_id,
      operation_type: state.mode === 'GENERATE' ? 'BATCH_GENERATE' : 'BATCH_ISSUE',
      purpose: state.mode === 'GENERATE' ? 'BATCH_GENERATE' : 'BATCH_ISSUE_AND_DELIVER',
      status: upper(payload.status || state.progress?.status || 'QUEUED'),
      phase: upper(state.progress?.phase || 'QUEUED'),
      effective_change_seq: Number(state.progress?.effective_change_seq || state.progress?.change_seq || 0) || 0,
      modal_identity: state.id,
      command_token: state.command_token,
      filter_summary: {
        display_mode: state.display_mode,
        allow_early: state.filter.allow_early,
        rule_count: state.selection.rules.length
      },
      created_at_utc: new Date().toISOString()
    };
    window.registerInvoiceOperationWatch?.(record);
    return record;
  }

  async function loadInvoiceBatchResultPage(state, options = {}) {
    if (!state.root_operation_id || state.destroyed) return null;
    const category = upper(options.category || state.result_filter || 'ALL');
    const body = {
      operation_ids: [state.root_operation_id],
      mode: 'DETAIL',
      action: state.mode,
      result_category: category,
      result_limit: PAGE_SIZE
    };
    if (options.cursor) body.result_cursor = options.cursor;
    const response = await window.authFetch(invoiceApi('/api/invoice-operations/get'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      state.error = payload.error || `Operation results unavailable (${response.status})`;
      renderInvoiceBatchModal(state);
      return null;
    }
    const operation = asArray(payload.operations).find(row => clean(row.operation_id) === state.root_operation_id)
      || asArray(payload.operations)[0];
    if (operation) state.progress = { ...asObject(state.progress), ...operation };
    state.result_filter = category;
    state.result_page = asObject(payload.result_page);
    state.result_cursor = clean(payload.signed_next_result_cursor) || null;
    const viewerRow = asArray(state.result_page?.rows).find(row =>
      clean(row.selection_key) === clean(state.viewer_request?.selection_key)
      && UUID_RE.test(clean(row.document_version_id))
    );
    if (viewerRow && state.viewer_request?.open && !state.viewer_request?.blob_url) {
      await openExactVersionInViewer(viewerRow.document_version_id, state);
    }
    renderInvoiceBatchModal(state);
    return payload;
  }

  async function applyInvoiceBatchOperationSignal(signalValue) {
    const signal = asObject(signalValue);
    const operationId = clean(signal.operation_id).toLowerCase();
    const rootId = clean(signal.root_operation_id || operationId).toLowerCase();
    const state = rootOperationStates.get(rootId) || rootOperationStates.get(operationId);
    if (!state) return false;
    if (
      state.viewer_request?.operation_id === operationId
      && UUID_RE.test(clean(signal.document_version_id))
      && state.viewer_request?.open
      && !state.viewer_request?.blob_url
    ) {
      await openExactVersionInViewer(signal.document_version_id, state);
    }
    if (operationId !== state.root_operation_id) return false;
    state.progress = { ...asObject(state.progress), ...signal };
    if (TERMINAL.has(upper(signal.status))) {
      const loadKey = `${signal.effective_change_seq || signal.change_seq || 0}:${signal.status}`;
      if (state.last_result_load_key !== loadKey) {
        state.last_result_load_key = loadKey;
        await loadInvoiceBatchResultPage(state, { category: state.result_filter || 'ALL' });
      }
    } else {
      renderInvoiceBatchModal(state);
    }
    return true;
  }

  async function openExactVersionInViewer(documentVersionId, state) {
    const viewer = asObject(state.viewer_request);
    try {
      const result = await window.openExactReadyDocument(documentVersionId, { returnBlobUrl: true });
      viewer.blob_url = result?.blob_url || null;
      viewer.status_message = 'Ready to view';
      viewer.document_version_id = documentVersionId;
      viewer.error = null;
    } catch (error) {
      viewer.error = clean(error?.message || error);
      viewer.status_message = 'Preview failed';
    }
    state.viewer_request = viewer;
    renderInvoiceBatchModal(state);
  }

  async function generateAndViewInvoiceCandidate(state, row) {
    if (!row?.selectable || state.viewer_request?.submitting) return null;
    state.viewer_request = {
      open: true,
      selection_key: row.selection_key,
      status_message: 'Preparing preview',
      submitting: true,
      error: null,
      blob_url: null
    };
    renderInvoiceBatchModal(state);
    const token = crypto.randomUUID();
    try {
      const response = await window.authFetch(invoiceApi('/api/invoices/batch-generate/confirm'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': token },
        body: JSON.stringify({
          rows: [{
            scope_key: row.scope_key,
            canonical_source_revision: row.source_revision
          }],
          allow_early: state.filter.allow_early === true,
          command_token: token
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (![200, 202, 207].includes(response.status)) throw new Error(payload.error || `Preview request failed (${response.status})`);
      const registered = window.registerInvoiceOperationsFromResponse?.(payload, {
        response_family: 'GENERATE_AND_VIEW',
        operation_type: 'BATCH_GENERATE',
        purpose: 'DRAFT_PREVIEW',
        command_token: token,
        modal_identity: state.id,
        viewer_selection_key: row.selection_key,
        explicit_operation_ids: true
      }) || [];
      const operationId = clean(payload.root_operation_id || registered[0]?.operation_id).toLowerCase();
      state.viewer_request.operation_id = operationId;
      if (operationId) rootOperationStates.set(operationId, state);
      const readyVersionId = clean(payload.document_version_id || payload.document_version?.id);
      if (readyVersionId) await openExactVersionInViewer(readyVersionId, state);
      return payload;
    } catch (error) {
      state.viewer_request.error = clean(error?.message || error);
      state.viewer_request.status_message = 'Preview failed';
      return null;
    } finally {
      state.viewer_request.submitting = false;
      renderInvoiceBatchModal(state);
    }
  }

  function focusTrap(event, state) {
    if (event.key === 'Escape') {
      if (state.detail_row) state.detail_row = null;
      else if (state.viewer_request?.open) state.viewer_request.open = false;
      else if (state.filter_drawer_open) state.filter_drawer_open = false;
      else return;
      event.preventDefault();
      renderInvoiceBatchModal(state);
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = state.root_element?.querySelector('[aria-modal="true"]');
    if (!panel) return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function closeInvoiceBatchModal(state) {
    state.destroyed = true;
    try { state.abort_controller?.abort(); } catch {}
    if (state.viewer_request?.blob_url) {
      try { URL.revokeObjectURL(state.viewer_request.blob_url); } catch {}
      state.viewer_request.blob_url = null;
    }
    if (state.root_element && state.delegated_handler) {
      state.root_element.removeEventListener('click', state.delegated_handler);
      state.root_element.removeEventListener('change', state.delegated_handler);
      state.root_element.removeEventListener('keydown', state.delegated_handler);
    }
    if (state.keydown_handler) document.removeEventListener('keydown', state.keydown_handler, true);
    activeModalStates.delete(state.id);
    if (state.root_operation_id && TERMINAL.has(upper(state.progress?.status))) {
      try { window.markInvoiceOperationHandled?.(state.root_operation_id); } catch {}
      rootOperationStates.delete(state.root_operation_id);
    }
    try {
      const modal = document.getElementById('modal');
      modal?.classList.remove('invbatch-modal', 'invbatch-generate-modal', 'invbatch-issue-modal');
    } catch {}
  }

  function attachInvoiceBatchModalDelegatedHandlers(state) {
    const root = state.root_element;
    if (!root || state.delegated_handler) return;
    const handler = async event => {
      const actionElement = event.target.closest?.('[data-batch-action]');
      const field = event.target.closest?.('[data-batch-field]');
      if (event.type === 'keydown' && field?.dataset.batchField === 'toolbar-search' && event.key === 'Enter') {
        event.preventDefault();
        state.filter.search = clean(field.value) || null;
        await reloadFirstPage(state);
        return;
      }
      if (event.type === 'change' && field) {
        const name = field.dataset.batchField;
        if (name === 'row-selection') {
          const row = findRow(state, field.dataset.selectionKey);
          if (row?.selectable === true) applyInvoiceBatchSelectionRule(state.selection, field.checked ? 'INCLUDE' : 'EXCLUDE', rowSelector(row));
          renderInvoiceBatchModal(state);
        } else if (name === 'group-selection') {
          applyInvoiceBatchSelectionRule(state.selection, field.checked ? 'INCLUDE' : 'EXCLUDE', decodeSelector(field.dataset.selector));
          renderInvoiceBatchModal(state);
        } else if (name === 'allow-early') {
          state.filter.allow_early = field.checked === true;
          await reloadFirstPage(state);
        } else if (name === 'grouping') {
          state.grouping = upper(field.value);
          state.sort.group_preset = state.grouping;
          saveInvoiceBatchPreferences(state.mode, state.sort);
          await reloadFirstPage(state);
        } else if (name === 'sort-key' || name === 'sort-direction') {
          if (name === 'sort-key') state.sort.sort_key = upper(field.value);
          else state.sort.sort_direction = upper(field.value);
          state.sort = saveInvoiceBatchPreferences(state.mode, state.sort);
          await reloadFirstPage(state);
        }
        return;
      }
      if (event.type !== 'click' || !actionElement) return;
      const action = actionElement.dataset.batchAction;
      if (action === 'cycle-display') {
        state.display_mode = DISPLAY_MODES[(DISPLAY_MODES.indexOf(state.display_mode) + 1) % DISPLAY_MODES.length];
        state.filter.display_mode = state.display_mode;
        await reloadFirstPage(state);
      } else if (action === 'open-filter') {
        state.filter_drawer_open = true;
        state.filter_draft = { ...state.filter };
        renderInvoiceBatchModal(state);
      } else if (action === 'close-filter') {
        state.filter_drawer_open = false;
        renderInvoiceBatchModal(state);
      } else if (action === 'clear-filter') {
        const keepEarly = state.filter.allow_early;
        state.filter_draft = { ...emptyFilter(), allow_early: keepEarly, display_mode: state.display_mode };
        state.filter = normaliseFilter(state.filter_draft);
        state.filter_drawer_open = false;
        await reloadFirstPage(state);
      } else if (action === 'apply-filter') {
        state.filter = readFilterDrawer(state);
        state.display_mode = state.filter.display_mode;
        state.filter_drawer_open = false;
        await reloadFirstPage(state);
      } else if (action === 'apply-search') {
        state.filter.search = clean(root.querySelector('[data-batch-field="toolbar-search"]')?.value) || null;
        await reloadFirstPage(state);
      } else if (action === 'reset-selection') {
        resetInvoiceBatchSelection(state);
        renderInvoiceBatchModal(state);
      } else if (action === 'page-next' && state.page_cursor) {
        state.page_history.push(state.candidate_page);
        await loadInvoiceBatchCandidatePage(state, { cursor: state.page_cursor });
      } else if (action === 'page-back' && state.page_history.length) {
        state.candidate_page = state.page_history.pop();
        state.page_cursor = clean(state.candidate_page?.page?.next_cursor) || null;
        state.totals = asObject(state.candidate_page?.totals);
        renderInvoiceBatchModal(state);
      } else if (action === 'confirm-open') {
        state.confirmation = true;
        renderInvoiceBatchModal(state);
      } else if (action === 'confirm-cancel') {
        state.confirmation = false;
        renderInvoiceBatchModal(state);
      } else if (action === 'submit') {
        await submitInvoiceBatchOperation(state);
      } else if (action === 'row-details') {
        state.detail_row = findRow(state, actionElement.dataset.selectionKey);
        renderInvoiceBatchModal(state);
      } else if (action === 'close-details') {
        state.detail_row = null;
        renderInvoiceBatchModal(state);
      } else if (action === 'generate-view') {
        await generateAndViewInvoiceCandidate(state, findRow(state, actionElement.dataset.selectionKey));
      } else if (action === 'close-viewer') {
        state.viewer_request = { ...asObject(state.viewer_request), open: false };
        renderInvoiceBatchModal(state);
      } else if (action === 'view-document') {
        await window.openExactReadyDocument?.(actionElement.dataset.documentVersionId);
      } else if (action === 'result-filter') {
        state.result_history = [];
        state.result_cursor = null;
        await loadInvoiceBatchResultPage(state, { category: actionElement.dataset.resultCategory });
      } else if (action === 'result-next' && state.result_cursor) {
        state.result_history.push({ page: state.result_page, next_cursor: state.result_cursor });
        await loadInvoiceBatchResultPage(state, { category: state.result_filter, cursor: state.result_cursor });
      } else if (action === 'result-back' && state.result_history.length) {
        const prior = state.result_history.pop();
        state.result_page = prior?.page || prior;
        state.result_cursor = clean(prior?.next_cursor) || null;
        renderInvoiceBatchModal(state);
      } else if (action === 'close') {
        try { window.closeModal?.(); } catch {}
      }
    };
    state.delegated_handler = handler;
    root.addEventListener('click', handler);
    root.addEventListener('change', handler);
    root.addEventListener('keydown', handler);
    state.keydown_handler = event => focusTrap(event, state);
    document.addEventListener('keydown', state.keydown_handler, true);
  }

  async function resumeLatestBatchOperation(state) {
    const watches = window.loadInvoiceOperationWatches?.() || [];
    const purpose = state.mode === 'GENERATE' ? 'BATCH_GENERATE' : 'BATCH_ISSUE_AND_DELIVER';
    const latest = watches
      .filter(row => upper(row.purpose) === purpose || upper(row.operation_type) === `BATCH_${state.mode}`)
      .filter(row => !TERMINAL.has(upper(row.status)) || !row.terminal_handled_at_utc)
      .sort((a, b) => Date.parse(b.updated_at_utc || b.created_at_utc || 0) - Date.parse(a.updated_at_utc || a.created_at_utc || 0))[0];
    if (!latest?.operation_id) return false;
    state.root_operation_id = latest.operation_id;
    state.progress = latest;
    rootOperationStates.set(latest.operation_id, state);
    if (TERMINAL.has(upper(latest.status))) await loadInvoiceBatchResultPage(state, { category: 'ALL' });
    return true;
  }

  async function openInvoiceBatchModal(mode) {
    const state = createInvoiceBatchModalState(mode);
    activeModalStates.set(state.id, state);
    window.modalCtx = {
      entity: 'invoices',
      openToken: state.id,
      data: {},
      invoiceBatchState: state
    };
    const title = state.mode === 'ISSUE' ? 'Batch Issue — Invoices' : 'Batch Generate — Invoices';
    const label = state.mode === 'ISSUE' ? 'Batch Issue' : 'Batch Generate';
    window.showModal(
      title,
      [{ key: 'main', label }],
      () => `<div class="invbatch-root" data-invoice-batch-root="${escapeHtml(state.id)}"></div>`,
      null,
      false,
      null,
      {
        kind: state.mode === 'ISSUE' ? 'invoice-batch-issue-v1' : 'invoice-batch-generate-v1',
        noParentGate: true,
        showSave: false,
        showApply: false,
        onDismiss: () => closeInvoiceBatchModal(state)
      }
    );
    const modal = document.getElementById('modal');
    modal?.classList.add('invbatch-modal', state.mode === 'ISSUE' ? 'invbatch-issue-modal' : 'invbatch-generate-modal');
    state.root_element = document.querySelector(`[data-invoice-batch-root="${CSS.escape(state.id)}"]`);
    attachInvoiceBatchModalDelegatedHandlers(state);
    renderInvoiceBatchModal(state);
    const resumed = await resumeLatestBatchOperation(state);
    if (!resumed) await loadInvoiceBatchCandidatePage(state);
    else renderInvoiceBatchModal(state);
    return state;
  }

  function installInvoiceBatchModalOverrides() {
    if (window.__invoiceBatchModalOverridesInstalled) return true;
    window.__invoiceBatchModalOverridesInstalled = true;
    window.openInvoiceBatchGenerateModal = () => openInvoiceBatchModal('GENERATE');
    window.openInvoiceBatchIssueModal = () => openInvoiceBatchModal('ISSUE');
    return true;
  }

  Object.assign(window, {
    createInvoiceBatchModalState,
    loadInvoiceBatchPreferences,
    saveInvoiceBatchPreferences,
    createInvoiceBatchSelectionState,
    applyInvoiceBatchSelectionRule,
    isInvoiceBatchRowSelected,
    deriveInvoiceBatchGroupSelectionState,
    resetInvoiceBatchSelection,
    buildInvoiceBatchSelectionContract,
    fetchInvoiceBatchCandidatePage,
    loadInvoiceBatchCandidatePage,
    renderInvoiceBatchModal,
    renderInvoiceBatchToolbar,
    renderInvoiceBatchFilterDrawer,
    renderInvoiceBatchGroups,
    renderInvoiceBatchRow,
    renderInvoiceBatchBadges,
    renderInvoiceBatchPager,
    renderInvoiceBatchFooter,
    renderInvoiceBatchConfirmation,
    submitInvoiceBatchOperation,
    registerInvoiceBatchOperation,
    applyInvoiceBatchOperationSignal,
    loadInvoiceBatchResultPage,
    renderInvoiceBatchResultSummary,
    openInvoiceBatchRowDetails: (state, row) => { state.detail_row = row; return renderInvoiceBatchModal(state); },
    generateAndViewInvoiceCandidate,
    attachInvoiceBatchModalDelegatedHandlers
  });

  window.InvoiceBatchModalV1 = Object.freeze({
    install: installInvoiceBatchModalOverrides,
    open: openInvoiceBatchModal,
    createInvoiceBatchModalState,
    createInvoiceBatchSelectionState,
    applyInvoiceBatchSelectionRule,
    isInvoiceBatchRowSelected,
    deriveInvoiceBatchGroupSelectionState,
    resetInvoiceBatchSelection,
    buildInvoiceBatchSelectionContract,
    renderInvoiceBatchRow,
    renderInvoiceBatchBadges,
    applyInvoiceBatchOperationSignal,
    activeModalStates,
    rootOperationStates
  });
})();
