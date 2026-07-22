(function installCloudTmsImportReviewV1(global) {
  'use strict';

  const CONTRACT = Object.freeze({
    schema: 'IMPORT_REVIEW_DB_V1',
    apply: 'IMPORT_REVIEW_APPLY_V1',
    operation: 'IMPORT_APPLY_OPERATION_V2',
    correction: 'IMPORT_CORRECTION_OPERATION_V2',
    followUp: 'IMPORT_REVIEW_FOLLOW_UP_COMPONENT_V1',
    ui: 'IMPORT_REVIEW_UI_V2',
    emailGrouping: 'TIMESHEET_QUERY_RECIPIENT_EMAIL_V1'
  });
  const PAGE_SIZES = Object.freeze([25, 50, 75, 100]);
  const ACTIVE_VIEWS = Object.freeze(['PENDING', 'READY', 'EMAIL', 'NO_ACTION']);
  const TERMINAL = new Set(['APPLYING', 'APPLIED', 'ABANDONED', 'SUPERSEDED']);
  const state = {
    contract: null,
    contractError: '',
    home: { reviews: [], clients: [], busy: '', error: '', statusClass: 'ACTIVE', pageSize: 25, page: 1, cursorStack: [null], nextCursor: null },
    coverage: null,
    review: null,
    saveTimer: null,
    reviewEpoch: 0,
    closeBypass: false
  };

  const esc = (value) => (typeof global.escapeHtml === 'function')
    ? global.escapeHtml(String(value == null ? '' : value))
    : String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const apiUrl = (path) => {
    if (typeof global.API === 'function') return global.API(path);
    const base = String(global.BROKER_BASE_URL || '').replace(/\/$/, '');
    if (!base) throw new Error('The CloudTMS API address is unavailable.');
    return `${base}${path}`;
  };
  const makeUuid = () => (global.crypto && typeof global.crypto.randomUUID === 'function')
    ? global.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      });
  const recoveryKey = (importId) => `cloudtms:import-review:v2:apply:${importId}`;
  function recoveryFor(importId) {
    try { return JSON.parse(global.sessionStorage.getItem(recoveryKey(importId)) || 'null'); } catch { return null; }
  }
  function storeRecovery(importId, value) {
    try {
      if (value) global.sessionStorage.setItem(recoveryKey(importId), JSON.stringify(value));
      else global.sessionStorage.removeItem(recoveryKey(importId));
    } catch {}
  }

  async function request(path, options = {}) {
    if (typeof global.authFetch !== 'function') throw new Error('The signed-in API helper is unavailable.');
    const response = await global.authFetch(apiUrl(path), options);
    const text = await response.text().catch(() => '');
    let payload = null;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
    if (!response.ok || payload?.ok === false) {
      const message = payload?.error?.message || payload?.message || payload?.error_message || `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.code = payload?.error?.code || payload?.error_code || 'REQUEST_FAILED';
      error.action = payload?.error?.action || null;
      error.payload = payload;
      throw error;
    }
    return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
  }

  function showScreen(title, render, kind) {
    global.modalCtx = { entity: kind, data: {}, importsState: state };
    global.showModal(
      title,
      [{ key: 'main', label: title }],
      (key) => key === 'main' ? render() : '',
      null,
      false,
      null,
      { kind, noParentGate: true, showSave: false, stayOpenOnSave: true }
    );
  }

  function formatDate(value) {
    const raw = String(value || '').slice(0, 10);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return raw || '—';
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'Europe/London'
    }).format(date).replace(',', '');
  }

  function contractIsValid(contract) {
    return contract?.ok === true
      && contract.schema_contract_version === CONTRACT.schema
      && contract.apply_envelope_version === CONTRACT.apply
      && contract.apply_operation_version === CONTRACT.operation
      && contract.correction_operation_version === CONTRACT.correction
      && contract.follow_up_component_version === CONTRACT.followUp
      && contract.review_ui_contract_version === CONTRACT.ui
      && contract.email_grouping_version === CONTRACT.emailGrouping
      && contract.legacy_contracts_supported === false;
  }

  async function ensureContract(force = false) {
    if (state.contract && !force) return state.contract;
    const contract = await request('/api/import-review/contract');
    if (!contractIsValid(contract)) throw new Error('The installed import-review contract is not the approved frontend contract.');
    state.contract = contract;
    return contract;
  }

  function reviewListPath() {
    const home = state.home;
    const params = new URLSearchParams({ status_class: home.statusClass, page_size: String(home.pageSize) });
    const cursor = home.cursorStack[home.page - 1];
    if (cursor?.updated_at_utc && cursor?.import_id) {
      params.set('cursor_updated_at', cursor.updated_at_utc);
      params.set('cursor_import_id', cursor.import_id);
    }
    return `/api/import-reviews?${params.toString()}`;
  }

  async function loadHome({ resetPaging = false } = {}) {
    state.home.error = '';
    state.contractError = '';
    if (resetPaging) Object.assign(state.home, { page: 1, cursorStack: [null], nextCursor: null });
    const contract = await ensureContract(true);
    const [reviewList, clients] = await Promise.all([
      request(reviewListPath()),
      request('/api/healthroster/autoprocess/clients').catch(() => ({ items: [] }))
    ]);
    state.contract = contract;
    state.home.reviews = Array.isArray(reviewList?.items) ? reviewList.items : [];
    state.home.clients = Array.isArray(clients?.items) ? clients.items : [];
    state.home.nextCursor = reviewList?.next_cursor || null;
  }

  function clientOptions() {
    return state.home.clients.map((client) => {
      const id = String(client.client_id || client.id || '');
      const name = client.client_name || client.name || id;
      return `<option value="${esc(id)}">${esc(name)}</option>`;
    }).join('');
  }

  function importTile(kind, icon, title, description, needsClient) {
    return `<article class="irv1-tile" tabindex="0" data-ir-drop="${esc(kind)}" aria-label="${esc(title)} file upload">
      <div class="irv1-tile-icon" aria-hidden="true">${esc(icon)}</div>
      <div><h4>${esc(title)}</h4><p>${esc(description)}</p></div>
      ${needsClient ? `<label class="mini">Client<select class="input irv1-client-select" data-ir-client="${esc(kind)}"><option value="">Choose a HealthRoster client</option>${clientOptions()}</select></label>` : ''}
      <div class="irv1-drop"><strong>Drop the file here</strong><span>or click to browse (.xls, .xlsx or .csv)</span></div>
      <input class="irv1-file" type="file" accept=".xls,.xlsx,.csv" data-ir-file="${esc(kind)}" />
    </article>`;
  }

  function renderHome() {
    if (!contractIsValid(state.contract)) {
      return `<div class="irv1-shell"><div class="irv1-alert error"><strong>Import review is unavailable.</strong><br/>${esc(state.contractError || state.home.error || 'The approved database and Worker contract could not be verified. Upload and review controls are disabled.')}</div><div class="irv1-review-actions"><button type="button" class="irv1-btn" data-ir-action="reload-home">Retry contract check</button></div></div>`;
    }
    const rows = state.home.reviews.length ? state.home.reviews.map((item) => `<div class="irv1-history-row">
      <div><strong>${esc(item.filename || 'Import')}</strong><small>${esc(item.source_route || item.source_system || '')}</small></div>
      <div>${esc(formatDate(item.coverage_start_date))} – ${esc(formatDate(item.coverage_end_date))}</div>
      <div><span class="irv1-status">${esc(item.status || 'IN REVIEW')}</span><small>Updated ${esc(formatDateTime(item.updated_at_utc))}</small></div>
      <button type="button" class="irv1-btn" data-ir-action="continue" data-import-id="${esc(item.import_id)}">Continue</button>
    </div>`).join('') : '<div class="irv1-empty">There are no unfinished import reviews.</div>';
    const busy = state.home.busy ? `<div class="irv1-alert">${esc(state.home.busy)}</div>` : '';
    const error = state.home.error ? `<div class="irv1-alert error">${esc(state.home.error)}</div>` : '';
    return `<div class="irv1-shell" id="irv1Home">
      <section class="irv1-intro"><div><h3>Import and review timesheets</h3><p>Upload a source file, confirm exactly what it covers, then resolve only the items that need attention. You can close this window and continue later.</p></div><span class="irv1-contract">✓ Approved contract ${esc(CONTRACT.ui)}</span></section>
      ${busy}${error}
      <section class="irv1-tiles">
        ${importTile('NHSP', 'N', 'NHSP weekly', 'Import an NHSP weekly export and review the server-classified changes.', false)}
        ${importTile('HR_WEEKLY', 'W', 'HealthRoster weekly', 'Create or validate weekly records for the selected HealthRoster client.', true)}
        ${importTile('HR_DAILY', 'D', 'HealthRoster daily validation', 'Compare daily HealthRoster evidence with existing daily timesheets.', true)}
      </section>
      <section class="irv1-history"><div class="irv1-history-head"><div><strong>${state.home.statusClass === 'ACTIVE' ? 'Continue an import' : 'Import review history'}</strong><div class="mini">Saved reviews resume with their selections and review position. Completed and abandoned reviews reopen read-only.</div></div><div class="irv1-toolbar-group"><label>Status <select class="input" data-ir-home-status>${['ACTIVE','ALL','COMPLETED','ABANDONED','SUPERSEDED'].map((value) => `<option value="${value}" ${state.home.statusClass === value ? 'selected' : ''}>${value.toLowerCase().replace('_',' ')}</option>`).join('')}</select></label><label>Rows <select class="input" data-ir-home-page-size>${PAGE_SIZES.map((size) => `<option value="${size}" ${state.home.pageSize === size ? 'selected' : ''}>${size}</option>`).join('')}</select></label><button type="button" class="irv1-btn" data-ir-action="reload-home">Refresh</button></div></div><div class="irv1-history-list">${rows}</div><div class="irv1-pager irv1-history-pager"><button class="irv1-btn" data-ir-action="home-page" data-page="${state.home.page - 1}" ${state.home.page > 1 ? '' : 'disabled="disabled" aria-disabled="true"'}>Previous</button><span>Page ${state.home.page}</span><button class="irv1-btn" data-ir-action="home-page" data-page="${state.home.page + 1}" ${state.home.nextCursor ? '' : 'disabled="disabled" aria-disabled="true"'}>Next</button></div></section>
    </div>`;
  }

  async function openImportsModalV1() {
    try {
      await loadHome();
    } catch (error) {
      state.contract = null;
      state.contractError = error.message || 'The approved import-review contract could not be verified.';
      state.home.error = error.message || 'Import review is unavailable.';
    }
    showScreen('Imports', renderHome, 'imports-v1');
  }

  async function handleStageFile(kind, file) {
    if (!file) return;
    await ensureContract(true);
    const allowed = /\.(xlsx?|csv)$/i.test(file.name || '');
    if (!allowed) throw new Error('Choose an .xls, .xlsx or .csv file.');
    let clientId = null;
    if (kind !== 'NHSP') {
      clientId = String(document.querySelector(`[data-ir-client="${kind}"]`)?.value || '').trim();
      if (!clientId) throw new Error('Choose the HealthRoster client before uploading the file.');
    }
    state.home.busy = `Uploading ${file.name}…`;
    state.home.error = '';
    showScreen('Imports', renderHome, 'imports-v1');
    try {
      const uploaded = await global.uploadImportFileToR2(file);
      const route = kind === 'NHSP' ? '/api/nhsp/import'
        : kind === 'HR_WEEKLY' ? '/api/healthroster/autoprocess/import'
          : '/api/imports/hr-rota/parse';
      const body = kind === 'HR_DAILY'
        ? { file_r2_key: uploaded.fileKey, original_name: uploaded.filename, client_id: clientId, tz_assumption: 'Europe/London' }
        : { file_key: uploaded.fileKey, original_name: uploaded.filename, ...(clientId ? { client_id: clientId } : {}), tz_assumption: 'Europe/London' };
      state.home.busy = 'The file is uploaded. The server is parsing its rows and fixing the review scope…';
      showScreen('Imports', renderHome, 'imports-v1');
      const staged = await request(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const importId = staged?.import_id || staged?.id;
      if (!importId) throw new Error('The staged import did not return an import ID.');
      state.home.busy = '';
      await openCoverage(importId);
    } catch (error) {
      state.home.busy = '';
      state.home.error = error.message || 'The file could not be staged.';
      showScreen('Imports', renderHome, 'imports-v1');
    }
  }

  async function fetchScope(importId, page = 1, size = 25) {
    return request(`/api/import-reviews/staged/${encodeURIComponent(importId)}/scope?candidate_page=${page}&candidate_page_size=${size}`);
  }

  async function openCoverage(importId) {
    const scope = await fetchScope(importId, 1, 25);
    if (scope.review_already_created) return openReview(importId);
    state.coverage = {
      importId,
      scope,
      mode: null,
      selectedCandidates: new Set(),
      candidatePage: 1,
      candidatePageSize: 25,
      overlapChoice: null,
      selectedOverlapId: (scope.overlapping_unfinished_reviews || [])[0]?.import_id || null,
      createOperationKey: `import-review-create-ui-v2:${importId}:${scope.source_file_sha256}`,
      error: '',
      busy: false
    };
    showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1');
  }

  function renderCoverageCandidates() {
    const coverage = state.coverage;
    if (!coverage || coverage.mode !== 'COMPLETE_SELECTED_CANDIDATES') return '';
    const items = Array.isArray(coverage.scope.candidate_options) ? coverage.scope.candidate_options : [];
    const rows = items.map((item) => {
      const key = String(item.source_candidate_key || '');
      const checked = coverage.selectedCandidates.has(key);
      return `<label class="irv1-candidate-row"><input type="checkbox" data-ir-coverage-candidate="${esc(key)}" ${checked ? 'checked' : ''}/><span>${esc(item.source_display_label || 'Unnamed candidate')}</span><small>${item.resolved ? `Matched to ${esc(item.resolved_display_name || 'candidate')}` : 'Mapping unresolved — review will be blocked until fixed'}</small></label>`;
    }).join('');
    return `<section><div class="irv1-history-head"><div><strong>Select the candidates covered by this file</strong><div class="mini">Selections remain selected while you move between pages.</div></div><span class="irv1-chip">${coverage.selectedCandidates.size} selected</span></div>
      <div class="irv1-candidate-picker">${rows || '<div class="irv1-empty">No candidates were found.</div>'}</div>
      <div class="irv1-pager"><button class="irv1-btn" data-ir-action="coverage-page" data-page="${coverage.candidatePage - 1}" ${coverage.scope.candidate_has_previous ? '' : 'disabled="disabled" aria-disabled="true"'}>Previous</button><span>Page ${coverage.candidatePage} of ${coverage.scope.candidate_total_pages || 1}</span><button class="irv1-btn" data-ir-action="coverage-page" data-page="${coverage.candidatePage + 1}" ${coverage.scope.candidate_has_next ? '' : 'disabled="disabled" aria-disabled="true"'}>Next</button></div>
    </section>`;
  }

  function renderCoverage() {
    const c = state.coverage;
    if (!c) return '<div class="irv1-empty">No staged import is open.</div>';
    const error = c.error ? `<div class="irv1-alert error">${esc(c.error)}</div>` : '';
    const clients = (c.scope.scope_clients || []).map((client) => `<span class="irv1-chip">${esc(client.resolved_display_name || client.source_display_label || 'Unresolved client')}</span>`).join('');
    const overlaps = Array.isArray(c.scope.overlapping_unfinished_reviews) ? c.scope.overlapping_unfinished_reviews : [];
    const overlapHtml = overlaps.length ? `<section class="irv1-overlap"><div class="irv1-alert"><strong>An unfinished review already covers this client and some of these dates.</strong><br/>Choose what this new file means before creating another review.</div><div class="irv1-overlap-list">${overlaps.map((item) => `<label class="irv1-choice"><input type="radio" name="irOverlapTarget" value="${esc(item.import_id)}" ${c.selectedOverlapId === item.import_id ? 'checked' : ''}/><span><strong>${esc(item.filename || 'Earlier import')}</strong><span>${esc(formatDate(item.coverage_start_date))} to ${esc(formatDate(item.coverage_end_date))} · ${esc(item.status)}</span></span></label>`).join('')}</div><div class="irv1-overlap-actions"><button class="irv1-btn" data-ir-action="overlap-resume">Resume selected review</button><button class="irv1-btn" data-ir-action="overlap-separate" ${c.overlapChoice === 'START_SEPARATE' ? 'aria-pressed="true"' : ''}>Keep both as separate reviews</button><button class="irv1-btn danger" data-ir-action="overlap-replace" ${c.overlapChoice === 'SUPERSEDE' ? 'aria-pressed="true"' : ''}>Replace selected review with this file</button></div><div class="mini">A separate review leaves the earlier review active. Replace creates this review first, then marks the selected earlier review as superseded.</div></section>` : '';
    const coverageChosen = !!c.mode;
    const overlapChosen = overlaps.length === 0 || ['START_SEPARATE','SUPERSEDE'].includes(c.overlapChoice);
    return `<div class="irv1-shell" id="irv1Coverage" data-coverage-mode="${esc(c.mode || '')}" data-overlap-choice="${esc(c.overlapChoice || '')}">
      <section class="irv1-intro"><div><h3>${esc(c.scope.filename || 'Staged import')}</h3><p>${esc(formatDate(c.scope.coverage_start_date))} to ${esc(formatDate(c.scope.coverage_end_date))} · ${Number(c.scope.staged_row_count || 0)} parsed rows. Coverage becomes immutable when the review is created.</p></div><span class="irv1-contract">${esc(c.scope.source_route || '')}</span></section>
      ${error}
      <div class="irv1-scope-summary">${clients || '<span class="irv1-chip">Client mapping will be reviewed</span>'}</div>
      ${overlapHtml}
      <div class="irv1-alert"><strong>Confirm the file coverage.</strong> No option is preselected because this choice controls whether omitted shifts are meaningful.</div>
      <section class="irv1-coverage-options">
        <label class="irv1-choice"><input type="radio" name="irCoverage" value="COMPLETE_ALL" ${c.mode === 'COMPLETE_ALL' ? 'checked' : ''}/><span><strong>All shifts for this period</strong><span>Omissions can be treated as meaningful for every candidate in the file period.</span></span></label>
        <label class="irv1-choice"><input type="radio" name="irCoverage" value="COMPLETE_SELECTED_CANDIDATES" ${c.mode === 'COMPLETE_SELECTED_CANDIDATES' ? 'checked' : ''}/><span><strong>All shifts for selected candidates</strong><span>Only the candidates you choose are complete; other candidates are outside scope.</span></span></label>
        <label class="irv1-choice"><input type="radio" name="irCoverage" value="PARTIAL" ${c.mode === 'PARTIAL' ? 'checked' : ''}/><span><strong>Partial file</strong><span>Omitted shifts are not cancellations, reference problems or missing-shift email issues.</span></span></label>
      </section>
      ${renderCoverageCandidates()}
      <div class="irv1-review-actions"><button class="irv1-btn" data-ir-action="coverage-cancel">Back</button><button class="irv1-btn primary" data-ir-action="coverage-create" ${c.busy || !coverageChosen || !overlapChosen ? 'disabled="disabled" aria-disabled="true"' : 'aria-disabled="false"'}>${c.busy ? 'Creating review…' : 'Create review'}</button></div>
    </div>`;
  }

  async function loadCoveragePage(page) {
    const c = state.coverage;
    if (!c || page < 1) return;
    c.scope = await fetchScope(c.importId, page, c.candidatePageSize);
    c.candidatePage = page;
    showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1');
  }

  async function createReviewFromCoverage() {
    const c = state.coverage;
    if (!c || c.busy) return;
    if (!c.mode) {
      c.error = 'Choose exactly what the file covers before creating the review.';
      showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1');
      return;
    }
    const overlaps = Array.isArray(c.scope.overlapping_unfinished_reviews) ? c.scope.overlapping_unfinished_reviews : [];
    if (overlaps.length && !['START_SEPARATE','SUPERSEDE'].includes(c.overlapChoice)) {
      c.error = 'Resume the earlier review, keep both reviews, or replace the selected earlier review.';
      showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1');
      return;
    }
    if (c.mode === 'COMPLETE_SELECTED_CANDIDATES' && c.selectedCandidates.size === 0) {
      c.error = 'Select at least one candidate, or choose a different coverage option.';
      showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1');
      return;
    }
    c.busy = true;
    c.error = '';
    showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1');
    try {
      const allScope = await fetchScope(c.importId, 1, 100);
      const candidates = [];
      let pageScope = allScope;
      for (;;) {
        for (const item of (pageScope.candidate_options || [])) {
          if (c.selectedCandidates.has(String(item.source_candidate_key || ''))) candidates.push(item);
        }
        if (!pageScope.candidate_has_next) break;
        pageScope = await fetchScope(c.importId, Number(pageScope.candidate_page || 1) + 1, 100);
      }
      await request('/api/import-reviews', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          import_id: c.importId,
          coverage_mode: c.mode,
          coverage_start_date: allScope.coverage_start_date,
          coverage_end_date: allScope.coverage_end_date,
          scope_clients: allScope.scope_clients || [],
          scope_candidates: c.mode === 'COMPLETE_SELECTED_CANDIDATES' ? candidates : [],
          expected_source_file_sha256: allScope.source_file_sha256,
          expected_parser_version: allScope.parser_version,
          operation_key: c.createOperationKey
        })
      });
      if (c.overlapChoice === 'SUPERSEDE') {
        const targetId = String(c.selectedOverlapId || '');
        const target = overlaps.find((item) => String(item.import_id) === targetId);
        if (!target) throw new Error('Choose the unfinished review that this new file replaces.');
        const oldHeader = await fetchReviewHeader(targetId);
        await request(`/api/import-reviews/${encodeURIComponent(targetId)}/supersede`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
            new_import_id: c.importId,
            expected_state_version: oldHeader.state.state_version
          })
        });
      }
      await openReview(c.importId);
    } catch (error) {
      c.busy = false;
      c.error = error.message || 'The review could not be created.';
      showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1');
    }
  }

  async function fetchReviewHeader(importId) {
    return request(`/api/import-reviews/${encodeURIComponent(importId)}?action_limit=1&event_limit=25`);
  }

  async function fetchActionPage(review) {
    const params = new URLSearchParams({
      page: String(review.page), page_size: String(review.pageSize), sort_by: review.sortBy,
      sort_direction: review.sortDirection, view: review.view
    });
    return request(`/api/import-reviews/${encodeURIComponent(review.importId)}/actions?${params.toString()}`);
  }

  async function openReview(importId, options = {}) {
    const epoch = ++state.reviewEpoch;
    const header = await fetchReviewHeader(importId);
    if (epoch !== state.reviewEpoch) return;
    const saved = header?.state?.ui_state || {};
    const prior = options.preserveLocal === true && state.review && state.review.importId === importId ? state.review : null;
    const savedView = ACTIVE_VIEWS.includes(String(saved.active_section || '').toUpperCase()) ? String(saved.active_section).toUpperCase() : 'PENDING';
    const pageSize = PAGE_SIZES.includes(Number(saved.page_size)) ? Number(saved.page_size) : 25;
    state.review = {
      importId,
      header,
      view: options.view || prior?.view || savedView,
      page: options.page || prior?.page || Number(saved.page_number || 1),
      pageSize: prior?.pageSize || pageSize,
      sortBy: prior?.sortBy || String(saved.sort_by || 'CANDIDATE').toUpperCase(),
      sortDirection: prior?.sortDirection || String(saved.sort_direction || 'ASC').toUpperCase(),
      pageData: null,
      dirty: prior?.dirty || new Map(),
      expanded: prior?.expanded || new Set([
        ...(Array.isArray(saved.expanded_candidates) ? saved.expanded_candidates : []),
        ...(Array.isArray(saved.expanded_clients) ? saved.expanded_clients : []),
        ...(Array.isArray(saved.expanded_weeks) ? saved.expanded_weeks : []),
        ...(Array.isArray(saved.expanded_shifts) ? saved.expanded_shifts : [])
      ]),
      saveChain: prior?.saveChain || Promise.resolve(true),
      pendingSave: prior?.pendingSave || null,
      conflictBuffer: prior?.conflictBuffer || null,
      operationId: recoveryFor(importId)?.operation_id || null,
      requestHash: recoveryFor(importId)?.request_hash || null,
      confirmAcknowledged: false,
      saveState: '', error: options.message || '', busy: false, screen: 'review', epoch
    };
    state.review.pageData = await fetchActionPage(state.review);
    if (epoch !== state.reviewEpoch) return;
    showScreen('Import review', renderReview, 'import-review-v1');
  }

  function reviewUiState(review) {
    const values = Array.from(review.expanded).slice(0, 500);
    return {
      expanded_candidates: values.filter((key) => key.startsWith('candidate:')),
      expanded_clients: values.filter((key) => key.startsWith('client:')),
      expanded_weeks: values.filter((key) => key.startsWith('week:')),
      expanded_shifts: values.filter((key) => key.startsWith('shift:')),
      active_section: review.view,
      scroll_anchor: null,
      show_no_action: review.view === 'NO_ACTION',
      show_automatic: review.view === 'NO_ACTION',
      page_number: review.page,
      page_size: review.pageSize,
      sort_by: review.sortBy,
      sort_direction: review.sortDirection
    };
  }

  async function performSelectionFlush(review, { quiet = false } = {}) {
    if (!review || state.review !== review) return false;
    if (review.dirty.size === 0 && !review.pendingSave) return true;
    clearTimeout(state.saveTimer);
    const pending = review.pendingSave || {
      requestId: makeUuid(),
      changes: Array.from(review.dirty, ([action_id, selected]) => ({ action_id, selected }))
    };
    review.pendingSave = pending;
    const changes = pending.changes;
    review.saveState = 'Saving selections…';
    if (!quiet) showScreen('Import review', renderReview, 'import-review-v1');
    try {
      const result = await request(`/api/import-reviews/${encodeURIComponent(review.importId)}/selections`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          expected_state_version: review.header.state.state_version,
          expected_preview_generation: review.header.state.preview_generation,
          expected_preview_fingerprint: review.header.state.preview_fingerprint,
          action_changes: changes,
          ui_state: reviewUiState(review),
          request_id: pending.requestId
        })
      });
      if (state.review !== review) return true;
      for (const change of changes) {
        if (review.dirty.get(change.action_id) === change.selected) review.dirty.delete(change.action_id);
      }
      review.pendingSave = null;
      review.conflictBuffer = null;
      review.header.state.state_version = result.state_version;
      review.header.state.status = result.status;
      if (result.preview_generation != null) review.header.state.preview_generation = result.preview_generation;
      if (result.preview_fingerprint) review.header.state.preview_fingerprint = result.preview_fingerprint;
      review.saveState = 'Selections saved';
      return true;
    } catch (error) {
      if (state.review !== review) return false;
      review.saveState = '';
      review.error = error.message || 'Selections were not saved.';
      if (error.status === 409) {
        review.pendingSave = null;
        review.conflictBuffer = changes;
        const freshHeader = await fetchReviewHeader(review.importId);
        if (state.review !== review) return false;
        review.header = freshHeader;
        review.pageData = await fetchActionPage(review);
        review.error = 'The review changed on the server. Your unsaved choices are still buffered. Check the refreshed rows, then save the buffered choices or discard them.';
      }
      showScreen('Import review', renderReview, 'import-review-v1');
      return false;
    }
  }

  function flushSelections(options = {}) {
    const review = state.review;
    if (!review) return Promise.resolve(true);
    review.saveChain = Promise.resolve(review.saveChain).catch(() => false).then(() => performSelectionFlush(review, options));
    return review.saveChain;
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => { void flushSelections(); }, 650);
  }

  function reasonText(code) {
    const labels = {
      CANDIDATE_UNRESOLVED: 'Candidate mapping is unresolved. Leave this import, update the candidate mapping, then return and recheck.',
      CLIENT_UNRESOLVED: 'Client mapping is unresolved. Leave this import, update the client mapping, then return and recheck.',
      CONTRACT_MISSING: 'No matching contract exists for this worker and date. Create or correct the contract outside this review, then return and recheck.',
      CONTRACT_AMBIGUOUS: 'More than one contract matches this worker and date. Correct the contracts outside this review, then return and recheck.',
      GRADE_MAPPING_REQUIRED: 'The HealthRoster grade needs a role mapping. Configure it outside this review, then return and recheck.',
      TIMESHEET_NOT_FOUND: 'No eligible existing daily timesheet was found. Correct the timesheet records outside this review, then return and recheck.',
      TIMESHEET_AMBIGUOUS: 'Choose the existing timesheet that this HealthRoster row validates.',
      BLOCKED_ACTIVE_PAY_DRAFT: 'An active Banking Pay draft protects this timesheet. Resolve the draft outside the import.'
    };
    return labels[String(code || '').toUpperCase()] || String(code || '').replaceAll('_', ' ').toLowerCase();
  }

  function timeText(value) {
    const raw = String(value || '');
    const match = raw.match(/(\d{2}:\d{2})/);
    return match ? match[1] : raw || '—';
  }

  function selectedFor(item, review) {
    return review.dirty.has(item.action_id) ? review.dirty.get(item.action_id) : item.selected === true;
  }

  function reviewCan(review, command) {
    const commands = review?.header?.state?.editability?.allowed_commands;
    return Array.isArray(commands) && commands.includes(command);
  }

  function dailySelect(item, review) {
    const options = Array.isArray(item.daily_timesheet_options) ? item.daily_timesheet_options : [];
    const current = item.timesheet_id || '';
    const disabled = reviewCan(review, 'RESOLVE_DAILY_TIMESHEET') ? '' : 'disabled="disabled" aria-disabled="true"';
    return `<div class="irv1-resolution"><select class="input" ${disabled} data-ir-daily-resolution="${esc(item.action_id)}" data-hr-row-id="${esc(item.hr_row_id || '')}" data-evidence="${esc(item.evidence_fingerprint || '')}"><option value="">${current ? 'Saved timesheet choice' : 'Choose an existing timesheet'}</option>${options.map((option) => {
      const label = `${formatDate(option.worked_start_iso)} · ${timeText(option.worked_start_iso)}–${timeText(option.worked_end_iso)} · ${Math.round(Number(option.worked_minutes || 0) / 60 * 100) / 100} hours${option.reference_number ? ` · ref ${option.reference_number}` : ''}`;
      return `<option value="${esc(option.timesheet_id)}" ${String(option.timesheet_id) === String(current) ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('')}</select>${current ? `<button type="button" class="irv1-btn" ${disabled} data-ir-action="daily-clear" data-action-id="${esc(item.action_id)}">Clear saved choice</button>` : ''}</div>`;
  }

  function shiftRow(item, review) {
    const summary = item.summary || {};
    const reason = summary.reason_code ? `<span class="irv1-reason">${esc(reasonText(summary.reason_code))}</span>` : '';
    const advice = item.action_kind === 'ADVISORY' ? '<span class="irv1-advisory">This is an advisory. Use Save & close, fix it in the relevant record, then reopen and choose Recheck.</span>' : '';
    const editable = reviewCan(review, 'SAVE_SELECTIONS');
    const checkbox = item.selectable
      ? `<input type="checkbox" data-ir-select="${esc(item.action_id)}" ${selectedFor(item, review) ? 'checked' : ''} ${editable ? '' : 'disabled="disabled" aria-disabled="true"'} aria-label="Include ${esc(item.action_kind)}"/>`
      : item.action_kind === 'DAILY_TIMESHEET_RESOLUTION' ? dailySelect(item, review) : '';
    const reasonCode = String(summary.reason_code || '').toUpperCase();
    const resolution = reasonCode === 'CANDIDATE_UNRESOLVED' && editable
      ? `<button type="button" class="irv1-btn" data-ir-action="resolve-mapping" data-resolution="CANDIDATE" data-action-id="${esc(item.action_id)}">Link candidate</button>`
      : reasonCode === 'CLIENT_UNRESOLVED' && editable
        ? `<button type="button" class="irv1-btn" data-ir-action="resolve-mapping" data-resolution="CLIENT" data-action-id="${esc(item.action_id)}">Link client</button>`
        : reasonCode === 'GRADE_MAPPING_REQUIRED' && editable
          ? `<button type="button" class="irv1-btn" data-ir-action="resolve-mapping" data-resolution="GRADE" data-action-id="${esc(item.action_id)}">Map grade to role</button>` : '';
    return `<tr data-action-id="${esc(item.action_id)}"><td>${checkbox}</td><td>${esc(formatDate(item.work_date || summary.work_date))}</td><td>${esc(timeText(summary.start_time))}</td><td>${esc(timeText(summary.end_time))}</td><td>${esc(summary.break_minutes == null ? '—' : `${summary.break_minutes} min`)}</td><td>${esc(summary.role || '—')}</td><td><strong>${esc(String(item.action_kind || '').replaceAll('_', ' '))}</strong>${reason}${advice}${resolution}</td></tr>`;
  }

  function groupItems(items, review) {
    const groups = new Map();
    for (const item of items) {
      const candidate = item.candidate_name || item.summary?.candidate_name || 'Unknown candidate';
      const candidateId = String(item.candidate_id || item.source_identity || item.action_id);
      const client = item.client_name || item.summary?.client_name || 'Unknown client';
      const clientId = String(item.client_id || item.summary?.recipient_scope_key || item.target_key || item.action_id);
      const week = item.week_ending_date || item.summary?.week_ending_date || item.work_date || item.summary?.work_date || 'Unknown week';
      if (!groups.has(candidateId)) groups.set(candidateId, { label: candidate, clients: new Map() });
      const candidateGroup = groups.get(candidateId);
      if (!candidateGroup.clients.has(clientId)) candidateGroup.clients.set(clientId, { label: client, weeks: new Map() });
      const clientGroup = candidateGroup.clients.get(clientId);
      if (!clientGroup.weeks.has(week)) clientGroup.weeks.set(week, []);
      clientGroup.weeks.get(week).push(item);
    }
    return Array.from(groups, ([candidateId, candidateGroup]) => {
      const candidateKey = `candidate:${candidateId}`;
      const open = review.expanded.has(candidateKey) || review.view === 'PENDING';
      const clientHtml = Array.from(candidateGroup.clients, ([clientId, clientGroup]) => {
        const clientKey = `client:${candidateId}:${clientId}`;
        return `<details class="irv1-group" data-ir-expand-key="${esc(clientKey)}" ${review.expanded.has(clientKey) ? 'open' : ''}><summary>${esc(clientGroup.label)}</summary>${Array.from(clientGroup.weeks, ([week, shifts]) => { const weekKey = `week:${candidateId}:${clientId}:${week}`; return `<details class="irv1-group" data-ir-expand-key="${esc(weekKey)}" ${review.expanded.has(weekKey) ? 'open' : ''}><summary>Week ending ${esc(formatDate(week))} · ${shifts.length} item${shifts.length === 1 ? '' : 's'}</summary><table class="irv1-shifts"><thead><tr><th>Use</th><th>Date</th><th>Start</th><th>End</th><th>Break</th><th>Role</th><th>Review item</th></tr></thead><tbody>${shifts.map((item) => shiftRow(item, review)).join('')}</tbody></table></details>`; }).join('')}</details>`;
      }).join('');
      const count = Array.from(candidateGroup.clients.values()).reduce((sum, clientGroup) => sum + Array.from(clientGroup.weeks.values()).reduce((n, rows) => n + rows.length, 0), 0);
      return `<details class="irv1-group" data-ir-expand-key="${esc(candidateKey)}" ${open ? 'open' : ''}><summary>${esc(candidateGroup.label)} · ${count} item(s)</summary>${clientHtml}</details>`;
    }).join('');
  }

  function renderEmailGroups(items, review) {
    const groups = new Map();
    for (const item of items) {
      const recipient = String(item.recipient_email || 'Recipient unavailable').toLowerCase();
      const recipientKey = String(item.recipient_group_key || recipient);
      if (!groups.has(recipientKey)) groups.set(recipientKey, { recipient, clients: new Map() });
      const clientKey = String(item.client_id || item.summary?.recipient_scope_key || 'client-unavailable');
      const clientLabel = item.client_name || item.summary?.client_name || 'Client';
      const group = groups.get(recipientKey);
      if (!group.clients.has(clientKey)) group.clients.set(clientKey, { label: clientLabel, contracts: new Map() });
      const client = group.clients.get(clientKey);
      const contractKey = String(item.contract_id || item.summary?.recipient_scope_key || 'client-default');
      const contractLabel = item.contract_label || 'Client default';
      if (!client.contracts.has(contractKey)) client.contracts.set(contractKey, { label: contractLabel, rows: [] });
      client.contracts.get(contractKey).rows.push(item);
    }
    return Array.from(groups, ([recipientKey, group]) => `<section class="irv1-email-group"><h4>One email to ${esc(group.recipient)}</h4><div class="mini">All selected rows are combined into one tidy message. They are shown below as Client → Contract → Shift.</div>${Array.from(group.clients, ([clientKey, client]) => { const expandClient = `client:email:${recipientKey}:${clientKey}`; return `<details class="irv1-group" data-ir-expand-key="${esc(expandClient)}" ${review.expanded.has(expandClient) ? 'open' : ''}><summary>${esc(client.label)}</summary>${Array.from(client.contracts, ([contractKey, contract]) => { const expandContract = `week:email:${recipientKey}:${clientKey}:${contractKey}`; return `<details class="irv1-group" data-ir-expand-key="${esc(expandContract)}" ${review.expanded.has(expandContract) ? 'open' : ''}><summary>${esc(contract.label)} · ${contract.rows.length} shift${contract.rows.length === 1 ? '' : 's'}</summary><table class="irv1-shifts"><thead><tr><th>Use</th><th>Date</th><th>Start</th><th>End</th><th>Break</th><th>Role</th><th>Query</th></tr></thead><tbody>${contract.rows.map((item) => shiftRow(item, review)).join('')}</tbody></table></details>`; }).join('')}</details>`; }).join('')}</section>`).join('');
  }

  function sortButtons(review) {
    const entries = [['CANDIDATE', 'Candidate'], ['CLIENT', 'Client'], ['WEEK_ENDING', 'Week ending'], ['WORK_DATE', 'Date'], ['ACTION', 'Action'], ['STATUS', 'Status']];
    return entries.map(([key, label]) => `<button type="button" class="irv1-sort ${review.sortBy === key ? 'is-active' : ''}" data-ir-action="sort" data-sort="${key}">${esc(label)}${review.sortBy === key ? (review.sortDirection === 'ASC' ? ' ↑' : ' ↓') : ''}</button>`).join('');
  }

  function reviewCards(review) {
    const counts = review.pageData?.view_counts || {};
    const cards = [
      ['PENDING', 'Pending action', 'Resolve blockers or choose required evidence'],
      ['READY', 'Ready', 'Changes and selections ready to apply'],
      ['EMAIL', 'Emails', 'Client query rows selected for grouped emails'],
      ['NO_ACTION', 'No action required', 'Automatic and unchanged rows']
    ];
    return cards.map(([view, label, help]) => `<button type="button" class="irv1-card-filter ${review.view === view ? 'is-active' : ''}" data-ir-action="review-view" data-view="${view}"><strong>${Number(counts[view] || 0)}</strong><span>${esc(label)}</span><small>${esc(help)}</small></button>`).join('');
  }

  function renderApplyConfirmation(review) {
    const header = review.header;
    const apply = header.state.apply_contract || {};
    const summary = header.confirmation_summary || {};
    const selectedCount = Number(summary.selected_total ?? (Array.isArray(apply.selected_action_ids) ? apply.selected_action_ids.length : 0));
    const invalidationCount = Number(summary.selected_reference_invalidation_count ?? (Array.isArray(apply.reference_invalidation_action_ids) ? apply.reference_invalidation_action_ids.length : 0));
    const evidence = header.evidence || {};
    const canApply = reviewCan(review, 'APPLY') && Number(summary.blocking_count || 0) === 0;
    return `<div class="irv1-shell"><section class="irv1-intro"><div><h3>Final confirmation</h3><p>The server will revalidate the saved review before committing. The browser is not supplying financial values, validation rows or email recipients.</p></div><span class="irv1-contract">${esc(header.state.status)}</span></section>
      ${review.error ? `<div class="irv1-alert error">${esc(review.error)}</div>` : ''}
      <div class="irv1-settings-grid"><div class="irv1-settings-card"><strong>Source and coverage</strong><p>${esc(header.import.filename || 'Import')}<br/>${esc(String(header.import.coverage_mode || '').replaceAll('_', ' '))}<br/>${esc(formatDate(header.import.coverage_start_date))} to ${esc(formatDate(header.import.coverage_end_date))}</p><div class="mini">Verified source ${esc(String(evidence.source_file_sha256 || '').slice(0, 12))} · parser ${esc(evidence.parser_version || '—')} · preview generation ${esc(evidence.preview_generation || '—')}</div></div><div class="irv1-settings-card"><strong>Operational changes</strong><p>${Number(summary.selected_change_count || 0)} change(s)<br/>${selectedCount} total saved selection(s)</p></div><div class="irv1-settings-card"><strong>Client query email</strong><p>${Number(summary.selected_email_issue_count || 0)} new issue(s)<br/>${Number(summary.selected_email_reminder_count || 0)} explicit reminder(s)</p><div class="mini">The server groups every selected item into one email per normalised recipient address.</div></div><div class="irv1-settings-card"><strong>Reference decisions</strong><p>${invalidationCount} explicit invalidation(s)<br/>${Number(summary.blocking_count || 0)} unresolved blocker(s)</p></div></div>
      ${invalidationCount === 0 ? '<div class="irv1-alert">No reference numbers will be cleared. A missing selection is explicit and clears nothing.</div>' : `<div class="irv1-alert">${invalidationCount} reference invalidation action(s) are explicitly selected. Only eligible, unlocked references can be cleared.</div>`}
      <label class="irv1-choice"><input type="checkbox" data-ir-confirm-ack ${review.confirmAcknowledged ? 'checked' : ''}/><span><strong>I have checked the coverage and selected actions</strong><span>I understand that selected email issues/reminders will be queued after the source import commits, while reference invalidation clears only the explicitly selected eligible references.</span></span></label>
      <div class="irv1-review-actions"><button class="irv1-btn" data-ir-action="apply-back">Back to review</button><button class="irv1-btn primary" data-ir-action="apply-confirm" ${review.busy || !review.confirmAcknowledged || !canApply ? 'disabled="disabled" aria-disabled="true"' : 'aria-disabled="false"'}>${review.busy ? 'Applying safely…' : 'Confirm and apply'}</button></div>
    </div>`;
  }

  function renderReview() {
    const review = state.review;
    if (!review) return '<div class="irv1-empty">No import review is open.</div>';
    if (review.screen === 'confirm') return renderApplyConfirmation(review);
    const header = review.header;
    const page = review.pageData || { items: [], view_counts: {} };
    const items = Array.isArray(page.items) ? page.items : [];
    const editability = header.state.editability || {};
    const readOnly = editability.read_only === true;
    const followUp = String(header.state.follow_up_status || 'NOT_REQUIRED').toUpperCase();
    const body = items.length
      ? (review.view === 'EMAIL' ? renderEmailGroups(items, review) : groupItems(items, review))
      : `<div class="irv1-empty">There are no ${esc(review.view.toLowerCase().replaceAll('_', ' '))} items on this page.</div>`;
    const statusActions = reviewCan(review, 'VIEW_APPLY_STATUS') || recoveryFor(review.importId)
      ? `<button class="irv1-btn" data-ir-action="status">Refresh apply status</button>${reviewCan(review, 'RETRY_FOLLOW_UP') ? '<button class="irv1-btn" data-ir-action="retry">Retry failed follow-up</button>' : ''}`
      : '';
    const evidence = header.evidence || {};
    const conflictActions = review.conflictBuffer ? '<div class="irv1-alert"><strong>Your local choices are buffered.</strong><div class="irv1-review-actions"><button class="irv1-btn" data-ir-action="conflict-save">Save buffered choices against refreshed rows</button><button class="irv1-btn" data-ir-action="conflict-discard">Discard buffered choices</button></div></div>' : '';
    return `<div class="irv1-shell" id="irv1Review">
      <section class="irv1-review-head"><div><h3 class="irv1-title">${esc(header.import.filename || 'Import review')}</h3><div class="irv1-review-meta"><span class="irv1-chip">${esc(header.import.source_route || header.import.source_system || '')}</span><span class="irv1-chip">${esc(formatDate(header.import.coverage_start_date))} – ${esc(formatDate(header.import.coverage_end_date))}</span><span class="irv1-status">${esc(header.state.status)}</span><span class="irv1-chip">Follow-up: ${esc(followUp)}</span></div><div class="mini irv1-evidence">Server evidence: source ${esc(String(evidence.source_file_sha256 || '').slice(0, 12) || 'unavailable')} · parser ${esc(evidence.parser_version || 'unavailable')} · preview ${esc(evidence.preview_generation || '—')}</div></div><div class="irv1-review-actions"><button class="irv1-btn" data-ir-action="home">${readOnly ? 'Close' : 'Save & close'}</button>${reviewCan(review, 'REFRESH') ? '<button class="irv1-btn" data-ir-action="refresh">Recheck</button>' : ''}${reviewCan(review, 'ABANDON') ? '<button class="irv1-btn danger" data-ir-action="abandon">Abandon import</button>' : ''}${statusActions}<button class="irv1-btn primary" data-ir-action="apply-preview" ${reviewCan(review, 'APPLY') ? 'aria-disabled="false"' : 'disabled="disabled" aria-disabled="true"'}>Review and apply</button></div></section>
      ${review.error ? `<div class="irv1-alert error">${esc(review.error)}</div>` : ''}
      ${header.state.follow_up_error_message ? `<div class="irv1-alert error">${esc(header.state.follow_up_error_message)}</div>` : ''}
      ${conflictActions}
      <section class="irv1-cards">${reviewCards(review)}</section>
      <section class="irv1-toolbar"><div class="irv1-toolbar-group"><span class="mini">Sort:</span>${sortButtons(review)}</div><div class="irv1-toolbar-group"><label>Rows per page <select class="input" data-ir-page-size>${PAGE_SIZES.map((size) => `<option value="${size}" ${review.pageSize === size ? 'selected' : ''}>${size}</option>`).join('')}</select></label><span class="irv1-save-state ${review.saveState === 'Selections saved' ? 'is-ok' : ''}">${esc(review.saveState)}</span></div></section>
      <section class="irv1-groups">${body}</section>
      <div class="irv1-pager"><button class="irv1-btn" data-ir-action="review-page" data-page="${review.page - 1}" ${page.has_previous ? '' : 'disabled="disabled" aria-disabled="true"'}>Previous</button><span>Page ${page.page_number || review.page} of ${page.total_pages || 1}<br/>${Number(page.total_items || 0)} item(s)</span><button class="irv1-btn" data-ir-action="review-page" data-page="${review.page + 1}" ${page.has_next ? '' : 'disabled="disabled" aria-disabled="true"'}>Next</button></div>
    </div>`;
  }

  async function changeReviewPage(patch) {
    const review = state.review;
    if (!review) return;
    if (!(await flushSelections({ quiet: true }))) return;
    Object.assign(review, patch);
    review.error = '';
    review.pageData = await fetchActionPage(review);
    showScreen('Import review', renderReview, 'import-review-v1');
  }

  async function saveDailyResolution(select, explicitTimesheetId) {
    const review = state.review;
    if (!review || !reviewCan(review, 'RESOLVE_DAILY_TIMESHEET')) return;
    if (!(await flushSelections({ quiet: true }))) return;
    const actionId = select.getAttribute('data-ir-daily-resolution');
    const item = (review.pageData?.items || []).find((entry) => entry.action_id === actionId);
    if (!item) return;
    try {
      await request(`/api/import-reviews/${encodeURIComponent(review.importId)}/daily-timesheet-resolution`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          hr_row_id: select.getAttribute('data-hr-row-id'),
          timesheet_id: explicitTimesheetId !== undefined ? explicitTimesheetId : (select.value || null),
          expected_state_version: review.header.state.state_version,
          expected_preview_generation: review.header.state.preview_generation,
          expected_evidence_fingerprint: select.getAttribute('data-evidence'),
          request_id: makeUuid()
        })
      });
      await openReview(review.importId);
    } catch (error) {
      review.error = error.message || 'The existing timesheet selection was not saved.';
      showScreen('Import review', renderReview, 'import-review-v1');
    }
  }

  async function refreshReview() {
    const review = state.review;
    if (!review) return;
    if (!(await flushSelections({ quiet: true }))) return;
    try {
      await request(`/api/import-reviews/${encodeURIComponent(review.importId)}/refresh`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expected_state_version: review.header.state.state_version, max_actions: 500 })
      });
      await openReview(review.importId, { page: 1 });
    } catch (error) {
      review.error = error.message || 'The review could not be rechecked.';
      showScreen('Import review', renderReview, 'import-review-v1');
    }
  }

  async function abandonReview() {
    const review = state.review;
    if (!review || !global.confirm('Abandon this import review? The staged import will remain in history, but this review cannot be resumed.')) return;
    await request(`/api/import-reviews/${encodeURIComponent(review.importId)}/abandon`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        expected_state_version: review.header.state.state_version,
        reason: 'Operator abandoned the import review to start again.', confirmed: true
      })
    });
    await openImportsModalV1();
  }

  async function applyReview() {
    const review = state.review;
    if (!review || review.busy || !review.confirmAcknowledged || !reviewCan(review, 'APPLY')) return;
    review.busy = true;
    review.error = '';
    showScreen('Import review', renderReview, 'import-review-v1');
    try {
      const operationId = makeUuid();
      review.operationId = operationId;
      review.requestHash = review.header.state.apply_contract.request_hash;
      storeRecovery(review.importId, { operation_id: operationId, request_hash: review.requestHash, started_at_utc: new Date().toISOString() });
      const result = await request(`/api/import-reviews/${encodeURIComponent(review.importId)}/apply`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          operation_id: operationId,
          expected_state_version: review.header.state.state_version,
          expected_request_hash: review.header.state.apply_contract.request_hash
        })
      });
      if (result?.operation?.outcome || result?.apply?.ok) { storeRecovery(review.importId, null); await openReview(review.importId); }
      else await pollApplyStatus(review.importId, operationId, review.requestHash);
    } catch (error) {
      review.busy = false;
      if (error.status === 202 || error.action === 'CHECK_APPLY_STATUS') {
        await pollApplyStatus(review.importId, review.operationId, review.requestHash);
      } else {
        review.error = error.message || 'The import was not applied.';
        showScreen('Import review', renderReview, 'import-review-v1');
      }
    }
  }

  async function pollApplyStatus(importId, operationId, requestHash) {
    if (!operationId || !requestHash) return openReview(importId);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const status = await request(`/api/import-reviews/${encodeURIComponent(importId)}/apply-status?operation_id=${encodeURIComponent(operationId)}&request_hash=${encodeURIComponent(requestHash)}`);
      const outcome = String(status?.outcome || '').toUpperCase();
      if (outcome.startsWith('COMMITTED_')) {
        storeRecovery(importId, null);
        return openReview(importId);
      }
      if (outcome === 'FAILED_BEFORE_COMMIT') {
        await request(`/api/import-reviews/${encodeURIComponent(importId)}/apply-recover`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation_id: operationId, request_hash: requestHash })
        });
        storeRecovery(importId, null);
        return openReview(importId, { message: 'The apply attempt failed before any source commit. Nothing was applied. The review is open again and can be checked before a new attempt.' });
      }
      if (outcome === 'NOT_STARTED' || outcome === 'NOT_COMMITTED') {
        const current = state.review;
        if (current?.importId === importId) {
          current.error = 'The source commit is not proven. The operation ID and request hash are saved in this browser; use Refresh apply status before attempting anything again.';
          showScreen('Import review', renderReview, 'import-review-v1');
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 900 + attempt * 200));
    }
    const current = state.review;
    if (current?.importId === importId) {
      current.error = 'The apply outcome is still unknown. This recovery reference is saved for this browser. Refresh apply status; do not start another import apply.';
      current.operationId = operationId;
      current.requestHash = requestHash;
      showScreen('Import review', renderReview, 'import-review-v1');
      return;
    }
    await openReview(importId, { message: 'The apply outcome is still unknown. Refresh apply status before retrying.' });
  }

  async function refreshApplyStatus() {
    const review = state.review;
    const recovery = recoveryFor(review?.importId);
    const op = review?.header?.state?.last_operation_id || recovery?.operation_id || review?.operationId;
    const hash = recovery?.request_hash || review?.requestHash || review?.header?.state?.apply_contract?.request_hash;
    if (!review || !op || !hash) return openReview(review.importId);
    await pollApplyStatus(review.importId, op, hash);
  }

  async function retryFollowUp() {
    const review = state.review;
    const op = review?.header?.state?.last_operation_id;
    const hash = review?.header?.state?.apply_contract?.request_hash;
    if (!review || !op || !hash) return;
    await request(`/api/import-reviews/${encodeURIComponent(review.importId)}/follow-up/retry`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation_id: op, request_hash: hash })
    });
    await openReview(review.importId);
  }

  function reviewItem(actionId) {
    return (state.review?.pageData?.items || []).find((item) => String(item.action_id) === String(actionId)) || null;
  }

  async function persistMapping(item, kind, selected) {
    const review = state.review;
    if (!review || !item) return;
    const summary = item.summary || {};
    const route = String(review.header?.import?.source_route || review.header?.import?.source_system || '').toUpperCase();
    const isDaily = route.includes('DAILY');
    if (kind === 'CANDIDATE') {
      const mapping = {
        staff_norm: String(summary.candidate_name || item.candidate_name || '').trim().toLowerCase(),
        hospital_or_trust: String(summary.client_name || item.client_name || '').trim().toLowerCase() || null,
        candidate_id: selected.id,
        client_id: item.client_id || null,
        work_date: item.work_date || summary.work_date || null
      };
      if (isDaily) await global.postHrRotaResolveMappings(review.importId, { candidate_mappings: [mapping] });
      else await global.postWeeklyResolveMappings(review.importId, route === 'NHSP' ? 'NHSP' : 'HR_WEEKLY', { candidate_mappings: [mapping], client_aliases: [] });
    } else if (kind === 'CLIENT') {
      const alias = {
        hospital_norm: String(summary.client_name || item.client_name || '').trim().toLowerCase(),
        client_id: selected.id,
        hr_row_ids: item.hr_row_id ? [item.hr_row_id] : []
      };
      if (isDaily) await global.postHrRotaResolveMappings(review.importId, { client_aliases: [alias] });
      else await global.postWeeklyResolveMappings(review.importId, route === 'NHSP' ? 'NHSP' : 'HR_WEEKLY', { candidate_mappings: [], client_aliases: [alias] });
    }
    await refreshReview();
  }

  async function resolveMapping(button) {
    const item = reviewItem(button.getAttribute('data-action-id'));
    const kind = button.getAttribute('data-resolution');
    if (!item || !kind || !reviewCan(state.review, 'SAVE_SELECTIONS')) return;
    const summary = item.summary || {};
    if (kind === 'CANDIDATE') {
      if (typeof global.openCandidatePicker !== 'function') throw new Error('The candidate picker is unavailable.');
      return global.openCandidatePicker(async ({ id, label }) => persistMapping(item, kind, { id, label }), {
        context: { staffName: summary.candidate_name || item.candidate_name, unit: summary.client_name || item.client_name, importId: state.review.importId, dateYmd: item.work_date || summary.work_date },
        seed_hint: { source: 'import_review_v2', display_name: summary.candidate_name || item.candidate_name || '' },
        ignoreMembership: true
      });
    }
    if (kind === 'CLIENT') {
      if (typeof global.openClientPicker !== 'function') throw new Error('The client picker is unavailable.');
      return global.openClientPicker(async ({ id, label }) => persistMapping(item, kind, { id, label }));
    }
    if (kind === 'GRADE') {
      const incoming = String(summary.role || '').trim();
      if (!incoming) throw new Error('The incoming grade is unavailable for this row.');
      let saved = false;
      global.showModal('Map HealthRoster grade to role', [{ key: 'main', label: 'Mapping' }], () => `<div class="form"><div class="irv1-settings-card"><p>Incoming grade: <strong>${esc(incoming)}</strong></p><label>Role code<input class="input" id="irv2GradeRole" placeholder="For example RMN"/></label><label>Band (optional)<input class="input" id="irv2GradeBand" placeholder="For example Band 5"/></label></div></div>`, async () => {
        const role = String(document.getElementById('irv2GradeRole')?.value || '').trim().toUpperCase();
        if (!role) { global.alert('Role code is required.'); return false; }
        await global.postHrRotaResolveMappings(state.review.importId, { grade_role_mappings: [{ incoming_grade_norm: incoming.toLowerCase(), role_code: role, band_norm: String(document.getElementById('irv2GradeBand')?.value || '').trim() || null }] });
        saved = true;
        return true;
      }, false, () => { if (saved) void refreshReview(); }, { kind: 'import-review-grade-map-v2', noParentGate: true, showSave: true, primaryLabel: 'Save mapping' });
    }
  }

  async function handleAction(button) {
    const action = button.getAttribute('data-ir-action');
    if (!action) return;
    try {
      if (action === 'reload-home') {
        await loadHome({ resetPaging: false });
        return showScreen('Imports', renderHome, 'imports-v1');
      }
      if (action === 'home' || action === 'coverage-cancel') {
        if (action === 'home' && !(await flushSelections({ quiet: true }))) return;
        return openImportsModalV1();
      }
      if (action === 'home-page') {
        const page = Number(button.getAttribute('data-page'));
        if (page < 1) return;
        if (page > state.home.page && state.home.nextCursor) state.home.cursorStack[state.home.page] = state.home.nextCursor;
        state.home.page = page;
        await loadHome();
        return showScreen('Imports', renderHome, 'imports-v1');
      }
      if (action === 'continue') return openReview(button.getAttribute('data-import-id'));
      if (action === 'coverage-page') return loadCoveragePage(Number(button.getAttribute('data-page')));
      if (action === 'coverage-create') return createReviewFromCoverage();
      if (action === 'overlap-resume') return openReview(state.coverage?.selectedOverlapId);
      if (action === 'overlap-separate') { state.coverage.overlapChoice = 'START_SEPARATE'; state.coverage.error = ''; return showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1'); }
      if (action === 'overlap-replace') { state.coverage.overlapChoice = 'SUPERSEDE'; state.coverage.error = ''; return showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1'); }
      if (action === 'review-view') {
        const nextView = button.getAttribute('data-view');
        if (state.review && nextView !== state.review.view) state.review.expanded.clear();
        return changeReviewPage({ view: nextView, page: 1 });
      }
      if (action === 'review-page') return changeReviewPage({ page: Number(button.getAttribute('data-page')) });
      if (action === 'sort') {
        const key = button.getAttribute('data-sort');
        return changeReviewPage({ sortBy: key, sortDirection: state.review.sortBy === key && state.review.sortDirection === 'ASC' ? 'DESC' : 'ASC', page: 1 });
      }
      if (action === 'refresh') return refreshReview();
      if (action === 'abandon') return abandonReview();
      if (action === 'resolve-mapping') return resolveMapping(button);
      if (action === 'daily-clear') {
        const item = reviewItem(button.getAttribute('data-action-id'));
        const select = document.querySelector(`[data-ir-daily-resolution="${CSS.escape(item?.action_id || '')}"]`);
        if (select) return saveDailyResolution(select, null);
      }
      if (action === 'conflict-save') { state.review.conflictBuffer = null; return flushSelections(); }
      if (action === 'conflict-discard') { state.review.dirty.clear(); state.review.pendingSave = null; state.review.conflictBuffer = null; state.review.error = ''; return openReview(state.review.importId); }
      if (action === 'apply-preview') {
        if (!(await flushSelections({ quiet: true }))) return;
        state.review.header = await fetchReviewHeader(state.review.importId);
        if (!reviewCan(state.review, 'APPLY')) { state.review.error = 'The server no longer permits apply. Recheck the review status.'; return showScreen('Import review', renderReview, 'import-review-v1'); }
        state.review.screen = 'confirm';
        return showScreen('Import review', renderReview, 'import-review-v1');
      }
      if (action === 'apply-back') { state.review.screen = 'review'; return showScreen('Import review', renderReview, 'import-review-v1'); }
      if (action === 'apply-confirm') return applyReview();
      if (action === 'status') return refreshApplyStatus();
      if (action === 'retry') return retryFollowUp();
    } catch (error) {
      if (state.review) {
        state.review.error = error.message || 'The action could not be completed.';
        showScreen('Import review', renderReview, 'import-review-v1');
      } else {
        state.home.error = error.message || 'The action could not be completed.';
        showScreen('Imports', renderHome, 'imports-v1');
      }
    }
  }

  document.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-ir-action]');
    if (actionButton) { event.preventDefault(); void handleAction(actionButton); return; }
    const tile = event.target.closest('[data-ir-drop]');
    if (tile && !event.target.closest('select,input,button')) tile.querySelector('[data-ir-file]')?.click();
  }, true);

  document.addEventListener('keydown', (event) => {
    const tile = event.target.closest?.('[data-ir-drop]');
    if (tile && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      tile.querySelector('[data-ir-file]')?.click();
    }
  }, true);

  document.addEventListener('click', (event) => {
    const close = event.target.closest?.('#btnCloseModal');
    const review = state.review;
    if (!close || !document.getElementById('irv1Review') || state.closeBypass || !review) return;
    if (review.dirty.size === 0 && !review.pendingSave && review.saveState !== 'Saving selections…') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void (async () => {
      const saved = await flushSelections({ quiet: true });
      if (!saved && !global.confirm('Your selection changes could not be saved. Discard the unsaved changes and close?')) return;
      state.closeBypass = true;
      try { close.click(); } finally { state.closeBypass = false; }
    })();
  }, true);

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-ir-file]')) {
      const kind = target.closest('[data-ir-drop]')?.getAttribute('data-ir-drop');
      const file = target.files?.[0];
      target.value = '';
      void handleStageFile(kind, file);
      return;
    }
    if (target.name === 'irCoverage' && state.coverage) {
      state.coverage.mode = target.value;
      state.coverage.error = '';
      showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1');
      return;
    }
    if (target.name === 'irOverlapTarget' && state.coverage) {
      state.coverage.selectedOverlapId = target.value;
      state.coverage.overlapChoice = null;
      showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1');
      return;
    }
    if (target.matches('[data-ir-home-status]')) {
      state.home.statusClass = target.value;
      void loadHome({ resetPaging: true }).then(() => showScreen('Imports', renderHome, 'imports-v1'));
      return;
    }
    if (target.matches('[data-ir-home-page-size]')) {
      state.home.pageSize = Number(target.value);
      void loadHome({ resetPaging: true }).then(() => showScreen('Imports', renderHome, 'imports-v1'));
      return;
    }
    if (target.matches('[data-ir-coverage-candidate]') && state.coverage) {
      const key = target.getAttribute('data-ir-coverage-candidate');
      if (target.checked) state.coverage.selectedCandidates.add(key); else state.coverage.selectedCandidates.delete(key);
      showScreen('Confirm import coverage', renderCoverage, 'import-coverage-v1');
      return;
    }
    if (target.matches('[data-ir-select]') && state.review) {
      const actionId = target.getAttribute('data-ir-select');
      state.review.dirty.set(actionId, target.checked);
      state.review.saveState = 'Unsaved selection';
      scheduleSave();
      return;
    }
    if (target.matches('[data-ir-page-size]') && state.review) {
      const size = Number(target.value);
      if (PAGE_SIZES.includes(size)) void changeReviewPage({ pageSize: size, page: 1 });
      return;
    }
    if (target.matches('[data-ir-daily-resolution]') && target.value) void saveDailyResolution(target);
    if (target.matches('[data-ir-confirm-ack]') && state.review) {
      state.review.confirmAcknowledged = target.checked;
      showScreen('Import review', renderReview, 'import-review-v1');
    }
  }, true);

  document.addEventListener('toggle', (event) => {
    const details = event.target.closest('[data-ir-expand-key]');
    if (!details || !state.review) return;
    const key = details.getAttribute('data-ir-expand-key');
    if (details.open) state.review.expanded.add(key); else state.review.expanded.delete(key);
  }, true);

  for (const eventName of ['dragenter', 'dragover', 'dragleave', 'drop']) {
    document.addEventListener(eventName, (event) => {
      const tile = event.target.closest?.('[data-ir-drop]');
      if (!tile) return;
      event.preventDefault();
      event.stopPropagation();
      if (eventName === 'dragenter' || eventName === 'dragover') tile.classList.add('is-dragging');
      else tile.classList.remove('is-dragging');
      if (eventName === 'drop') void handleStageFile(tile.getAttribute('data-ir-drop'), event.dataTransfer?.files?.[0]);
    }, true);
  }

  function settingsValue(source, key) {
    const value = source && Object.prototype.hasOwnProperty.call(source, key) ? String(source[key] || '').toUpperCase() : '';
    return value === 'PAID_DATE' || value === 'NOW' ? value : null;
  }

  async function injectGlobalPolicy(root) {
    if (!root || root.querySelector('#irv1GlobalPolicy')) return;
    const card = document.createElement('section');
    card.id = 'irv1GlobalPolicy';
    card.className = 'irv1-settings-card';
    card.innerHTML = '<div class="irv1-save-state">Loading the stored import policy…</div>';
    root.appendChild(card);
    try {
      const result = await request('/api/settings/defaults');
      const source = result?.settings || result?.settings_defaults || result || {};
      const complete = settingsValue(source, 'reversal_complete_financials_date');
      const replacement = settingsValue(source, 'reversal_replacement_financials_date');
      if (!complete || !replacement || !source.updated_at) {
        card.innerHTML = '<div class="irv1-alert error"><strong>Import policy unavailable.</strong><br/>The stored global values or their concurrency version are missing. Nothing has been defaulted and saving is disabled.</div>';
        return;
      }
      global.modalCtx.data = Object.assign(global.modalCtx.data || {}, source);
      card.innerHTML = `<h3 class="irv1-title">Import-authoritative correction dates</h3><p class="mini">New clients inherit these global defaults. These settings affect only import-authoritative correction/replacement shifts; ordinary timesheets and Banking Pay financial authority are unchanged.</p><div class="irv1-settings-grid"><label>Completed reversal uses<select class="input" data-ir-global-policy="reversal_complete_financials_date"><option value="PAID_DATE" ${complete === 'PAID_DATE' ? 'selected' : ''}>Original paid date</option><option value="NOW" ${complete === 'NOW' ? 'selected' : ''}>Current date (now)</option></select></label><label>Replacement shift uses<select class="input" data-ir-global-policy="reversal_replacement_financials_date"><option value="PAID_DATE" ${replacement === 'PAID_DATE' ? 'selected' : ''}>Original paid date</option><option value="NOW" ${replacement === 'NOW' ? 'selected' : ''}>Current date (now)</option></select></label></div><div class="irv1-review-actions"><span class="irv1-save-state" data-ir-global-policy-status></span><button type="button" class="irv1-btn" data-ir-settings-save="global">Save import policy</button></div>`;
    } catch (error) {
      card.innerHTML = `<div class="irv1-alert error"><strong>Import policy unavailable.</strong><br/>${esc(error.message || 'The stored global settings could not be loaded.')} Nothing has been defaulted and saving is disabled.</div>`;
    }
  }

  async function loadClientPolicy(root) {
    if (!root || root.querySelector('#irv1ClientPolicy')) return;
    const clientId = global.modalCtx?.data?.id;
    const card = document.createElement('section');
    card.id = 'irv1ClientPolicy';
    card.className = 'irv1-settings-card';
    root.appendChild(card);
    if (!clientId) {
      card.innerHTML = '<h3 class="irv1-title">Import correction dates</h3><p class="mini">Create the client first. A new client inherits the global defaults automatically; eligible clients can then override them here.</p>';
      return;
    }
    card.innerHTML = '<div class="irv1-save-state">Loading import policy…</div>';
    try {
      const response = await request(`/api/clients/${encodeURIComponent(clientId)}`);
      const policy = response.import_financial_policy || {};
      global.modalCtx.__importFinancialPolicy = policy;
      if (!policy.eligible) {
        card.innerHTML = '<h3 class="irv1-title">Import correction dates</h3><p class="mini">Not available for this client. These controls are shown only when the client is import-authoritative.</p>';
        return;
      }
      const complete = policy.reversal_complete_financials_date || {};
      const replacement = policy.reversal_replacement_financials_date || {};
      const option = (value, current, label) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`;
      card.innerHTML = `<h3 class="irv1-title">Import-authoritative correction dates</h3><p class="mini">Choose a client override or inherit the global default. A blank override is stored as inheritance, not as NOW.</p><div class="irv1-settings-grid"><label>Completed reversal uses<select class="input" data-ir-client-policy="reversal_complete_financials_date">${option('', complete.override == null ? '' : complete.override, `Inherit global (${complete.effective === 'PAID_DATE' ? 'Original paid date' : 'Current date'})`)}${option('PAID_DATE', complete.override, 'Original paid date')}${option('NOW', complete.override, 'Current date (now)')}</select></label><label>Replacement shift uses<select class="input" data-ir-client-policy="reversal_replacement_financials_date">${option('', replacement.override == null ? '' : replacement.override, `Inherit global (${replacement.effective === 'PAID_DATE' ? 'Original paid date' : 'Current date'})`)}${option('PAID_DATE', replacement.override, 'Original paid date')}${option('NOW', replacement.override, 'Current date (now)')}</select></label></div><div class="irv1-review-actions"><span class="irv1-save-state" data-ir-client-policy-status></span><button type="button" class="irv1-btn" data-ir-settings-save="client">Save import policy</button></div>`;
    } catch (error) {
      card.innerHTML = `<div class="irv1-alert error">${esc(error.message || 'The client policy could not be loaded.')}</div>`;
    }
  }

  function injectContractQueryEmail(root) {
    if (!root || root.querySelector('#irv1ContractQueryEmail')) return;
    const ctx = global.modalCtx || {};
    const main = ctx.formState?.main || {};
    const source = Object.prototype.hasOwnProperty.call(main, 'send_ts_queries_to_different_email') ? main : (ctx.data || {});
    const enabled = source.send_ts_queries_to_different_email === true || source.send_ts_queries_to_different_email === 'on';
    const address = String(source.ts_queries_alt_email_address || '');
    const frame = typeof global.__getModalFrame === 'function' ? global.__getModalFrame() : null;
    const editable = !frame || frame.mode === 'edit' || frame.mode === 'create';
    const card = document.createElement('section');
    card.id = 'irv1ContractQueryEmail';
    card.className = 'irv1-settings-card';
    card.innerHTML = `<h3 class="irv1-title">Timesheet query email</h3><p class="mini">This override is independent of invoice routing. If several contracts resolve to the same email address, the recipient receives one combined message with a separate, tidy contract section.</p><label style="display:grid;grid-template-columns:20px 1fr;align-items:center"><input type="checkbox" data-ir-contract-query-enabled ${enabled ? 'checked' : ''} ${editable ? '' : 'disabled="disabled" aria-disabled="true"'}/><span>Send this contract’s missing shifts, wrong hours and reference queries to a different address</span></label><label style="margin-top:10px">Contract query email<input type="email" class="input" data-ir-contract-query-address value="${esc(address)}" ${enabled && editable ? '' : 'disabled="disabled" aria-disabled="true"'} placeholder="name@trust.nhs.uk"/></label>`;
    root.appendChild(card);
  }

  async function saveGlobalPolicy(button) {
    const root = button.closest('#irv1GlobalPolicy');
    const status = root.querySelector('[data-ir-global-policy-status]');
    const source = global.modalCtx?.data || {};
    status.textContent = 'Saving…';
    const result = await request('/api/settings/defaults', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        reversal_complete_financials_date: root.querySelector('[data-ir-global-policy="reversal_complete_financials_date"]').value,
        reversal_replacement_financials_date: root.querySelector('[data-ir-global-policy="reversal_replacement_financials_date"]').value,
        expected_updated_at: source.updated_at,
        request_key: `global-import-policy:${makeUuid()}`
      })
    });
    Object.assign(source, result.stored || {}, { updated_at: result.updated_at });
    status.textContent = 'Saved'; status.classList.add('is-ok');
  }

  async function saveClientPolicy(button) {
    const root = button.closest('#irv1ClientPolicy');
    const status = root.querySelector('[data-ir-client-policy-status]');
    const policy = global.modalCtx?.__importFinancialPolicy || {};
    const clientId = global.modalCtx?.data?.id;
    status.textContent = 'Saving…';
    const result = await request(`/api/clients/${encodeURIComponent(clientId)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        reversal_complete_financials_date: root.querySelector('[data-ir-client-policy="reversal_complete_financials_date"]').value || null,
        reversal_replacement_financials_date: root.querySelector('[data-ir-client-policy="reversal_replacement_financials_date"]').value || null,
        expected_client_rev: policy.client_rev,
        expected_settings_updated_at: policy.client_settings_updated_at,
        request_key: `client-import-policy:${makeUuid()}`
      })
    });
    policy.client_rev = result.client_rev;
    policy.client_settings_updated_at = result.settings_updated_at;
    status.textContent = 'Saved'; status.classList.add('is-ok');
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ir-settings-save]');
    if (!button) return;
    event.preventDefault();
    const task = button.getAttribute('data-ir-settings-save') === 'global' ? saveGlobalPolicy(button) : saveClientPolicy(button);
    task.catch((error) => {
      const status = button.parentElement?.querySelector('.irv1-save-state');
      if (status) { status.textContent = error.message || 'Not saved'; status.classList.add('is-error'); }
    });
  }, true);

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-ir-contract-query-enabled],[data-ir-contract-query-address]')) {
      const card = event.target.closest('#irv1ContractQueryEmail');
      const enabled = card.querySelector('[data-ir-contract-query-enabled]').checked;
      const address = card.querySelector('[data-ir-contract-query-address]');
      address.disabled = !enabled;
      const ctx = global.modalCtx || {};
      ctx.formState = ctx.formState || { main: {}, pay: {} };
      ctx.formState.main = ctx.formState.main || {};
      ctx.formState.main.send_ts_queries_to_different_email = enabled ? 'on' : '';
      ctx.formState.main.ts_queries_alt_email_address = enabled ? String(address.value || '').trim().toLowerCase() : null;
      ctx.__nonCalendarDirty = true;
      ctx.__contractSettingsDirty = true;
      try { global.dispatchEvent(new Event('modal-dirty')); } catch {}
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (!event.target.matches('[data-ir-contract-query-address]')) return;
    const card = event.target.closest('#irv1ContractQueryEmail');
    const ctx = global.modalCtx || {};
    ctx.formState = ctx.formState || { main: {}, pay: {} };
    ctx.formState.main = ctx.formState.main || {};
    ctx.formState.main.ts_queries_alt_email_address = card.querySelector('[data-ir-contract-query-enabled]')?.checked
      ? String(event.target.value || '').trim().toLowerCase()
      : null;
    ctx.__nonCalendarDirty = true;
    ctx.__contractSettingsDirty = true;
    try { global.dispatchEvent(new Event('modal-dirty')); } catch {}
  }, true);

  const observer = new MutationObserver(() => {
    const settingsRoot = document.getElementById('settingsForm');
    if (settingsRoot) void injectGlobalPolicy(settingsRoot);
    const clientRoot = document.getElementById('clientSettingsForm');
    if (clientRoot) void loadClientPolicy(clientRoot);
    const contractRoot = document.getElementById('contractSettingsForm');
    if (contractRoot) injectContractQueryEmail(contractRoot);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  global.CloudTmsImportReviewV1 = Object.freeze({
    contract: CONTRACT,
    pageSizes: PAGE_SIZES,
    openImportsModal: openImportsModalV1,
    ensureContract,
    formatDate,
    reasonText,
    _state: state
  });
  global.openImportsModal = openImportsModalV1;
})(window);
