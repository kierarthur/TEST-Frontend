(function installBulkAuthoriseLifecycleV2(win) {
  'use strict';

  if (!win || win.__bulkAuthoriseLifecycleV2Installed === true) return;

  const legacy = {
    open: win.openBulkAuthoriseWorkbench,
    setActiveRow: win.setActiveBulkAuthoriseRowFromVisibleRows,
    bindClassification: win.bindBulkAuthoriseClassificationButtons,
    rerender: win.rerenderBulkAuthoriseWorkbench,
    authoriseSelected: win.handleBulkAuthoriseSelected,
    unauthoriseSelected: win.handleBulkUnauthoriseSelected
  };

  if (
    typeof legacy.open !== 'function' ||
    typeof legacy.setActiveRow !== 'function' ||
    typeof legacy.rerender !== 'function'
  ) {
    return;
  }

  win.__bulkAuthoriseLifecycleV2Installed = true;

  const controllers = new WeakMap();
  const trim = (value) => String(value == null ? '' : value).trim();
  const deep = (value) => {
    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
  };
  const classificationOf = (value) => {
    const key = trim(value).toUpperCase();
    return (key === 'TIMESHEETS' || key === 'NHSP' || key === 'HR') ? key : 'TIMESHEETS';
  };
  const rowKeyOf = (row) => {
    const value = row && typeof row === 'object' ? row : {};
    const explicit = trim(value.row_key || value.rowKey);
    if (explicit) return explicit;
    const timesheetId = trim(value.current_timesheet_id || value.timesheet_id || value.requested_timesheet_id || value.expected_timesheet_id);
    if (timesheetId) return `timesheet:${timesheetId}`;
    const contractWeekId = trim(value.contract_week_id || value.contractWeekId);
    return contractWeekId ? `contract_week:${contractWeekId}` : '';
  };
  const failedRowKeys = (result) => {
    const rows = Array.isArray(result && result.failed_items) ? result.failed_items : [];
    return Array.from(new Set(rows.map((entry) => trim(
      entry && (entry.row_key || entry.row_key_before || entry.row_key_after || entry.previous_row_key)
    )).filter(Boolean)));
  };
  const currentState = (state) => {
    if (state && typeof state === 'object') return state;
    const modalState = win.modalCtx && win.modalCtx.bulkAuthoriseState;
    return modalState && typeof modalState === 'object' ? modalState : null;
  };
  const visibleRowsFor = (state) => {
    if (typeof win.getVisibleBulkAuthoriseRows === 'function') {
      try {
        const visible = win.getVisibleBulkAuthoriseRows(state);
        if (Array.isArray(visible)) return visible.slice();
        if (Array.isArray(visible && visible.visible_rows)) return visible.visible_rows.slice();
      } catch {}
    }
    return Array.isArray(state && state.dataset && state.dataset.rows) ? state.dataset.rows.slice() : [];
  };
  const requestFiltersFor = (state) => {
    if (typeof win.buildBulkAuthoriseDatasetRequestFilters === 'function') {
      try { return win.buildBulkAuthoriseDatasetRequestFilters(state); } catch {}
    }
    return { ...(state && state.filters ? state.filters : {}), classification: classificationOf(state && state.classification) };
  };

  function cancelPreviewInflight(pane) {
    const inflight = pane && pane.__preview_presign_inflight;
    if (!inflight || typeof inflight !== 'object') return;
    for (const pending of Object.values(inflight)) {
      try { pending && typeof pending.abort === 'function' && pending.abort(); } catch {}
      try { pending && typeof pending.cancel === 'function' && pending.cancel(); } catch {}
    }
  }

  function clearDockedViewer(state, key) {
    if (!state[key] || typeof state[key] !== 'object') return;
    state[key] = {
      ...state[key],
      open: false,
      row_key: '',
      evidence_id: '',
      storage_key: '',
      signed_url: '',
      file_name: '',
      kind: '',
      mime_type: '',
      rotation_deg: 0
    };
  }

  function clearRowOwnedState(state, options = {}) {
    if (!state || typeof state !== 'object') return;
    const pane = state.evidence_pane_state && typeof state.evidence_pane_state === 'object'
      ? state.evidence_pane_state
      : {};
    const queueRows = options.preserveQueueRows === false
      ? []
      : (Array.isArray(pane.queue_rows) ? pane.queue_rows.map(deep) : []);

    cancelPreviewInflight(pane);
    state.evidence_pane_state = {
      ...pane,
      active_tab: 'attached',
      attached_rows: [],
      attached_all_rows: [],
      active_attached_id: null,
      active_attached_item: null,
      active_queue_id: null,
      active_queue_item: null,
      queue_rows: queueRows,
      all_rows: queueRows,
      __preview_presign_inflight: {},
      __preview_target_key: '',
      __preview_signed_url: '',
      __preview_load_requested_target_key: '',
      __preview_identity: '',
      __active_attached_preview_target: '',
      __bulk_authorise_evidence_identity: '',
      __queue_loaded_identity: '',
      __queue_manual_override: false,
      __queue_manual_override_identity: '',
      __queue_manual_override_scope: '',
      __attached_manual_override: true,
      pendingAttached: false,
      __pending_attached: false,
      __pendingAttached: false,
      pendingAttachedIdentity: '',
      __pending_attached_identity: '',
      pendingAttachedRequestKey: '',
      __pending_attached_request_key: ''
    };

    state.__bulkAuthorisePreviewActiveRowKey = '';
    state.__bulkAuthorisePreviewActiveBackendRowSignature = '';
    state.__bulkAuthorisePreviewActiveRenderSignature = '';
    state.__bulkAuthorisePreviewActiveRowSignature = '';
    state.__bulk_authorise_open_preview_settle_key = '';
    state.__bulk_authorise_open_preview_settle_pending = false;
    state.__bulk_authorise_open_preview_settle_last_committed_key = '';
    state.__bulk_authorise_open_preview_settle_last_record_identity = '';
    state.__bulkAuthoriseImportEvidenceView = { loading: false, error: '', payload: null, request_key: '' };
    state.imported_evidence_context_cache = {};
    clearDockedViewer(state, 'bulkAuthoriseDockedEvidenceViewer');
    clearDockedViewer(state, 'dockedEvidenceViewer');

    if (win.modalCtx && (win.modalCtx.bulkAuthoriseState === state || trim(win.modalCtx.entity).toLowerCase() === 'bulk-authorise')) {
      win.modalCtx.__bulkAuthoriseRecordIdentity = null;
      win.modalCtx.timesheetDetails = {};
      win.modalCtx.timesheetRelated = {};
      win.modalCtx.timesheetMeta = {};
      win.modalCtx.timesheetState = { evidence: [] };
    }
  }

  function clearActiveRow(state) {
    state.active_row_key = null;
    state.activeRowKey = null;
    state.active_row = null;
    state.active_context = null;
    state.active_ctx = null;
    state.active_details = null;
    state.activeRecordIdentity = null;
    state.activeTimesheetId = null;
    state.activeContractWeekId = null;
    state.__bulkAuthoriseRecordIdentity = '';
    state.__bulk_authorise_active_backend_row_signature = '';
    state.__bulk_authorise_active_render_signature = '';
    state.__bulk_authorise_active_row_signature = '';
    state.__bulk_authorise_row_context_ready = false;
    state.__bulk_authorise_row_context_ready_backend_signature = '';
    state.__bulk_authorise_row_context_ready_render_signature = '';
    state.__bulk_authorise_row_context_ready_signature = '';
    state.__bulk_authorise_row_context_ready_seq = Number(state.__bulk_authorise_row_change_seq || 0) || 0;
  }

  class BulkAuthoriseLifecycleController {
    constructor(state) {
      this.state = state;
      this.rowEpoch = 0;
      this.datasetEpoch = 0;
      this.closed = false;
      this.initialised = false;
      this.frame = null;
      this.frameDismiss = null;
      state.__bulkAuthoriseLifecycleVersion = 2;
      state.__bulkAuthoriseLifecycleController = this;
    }

    rows() {
      return visibleRowsFor(this.state);
    }

    findRow(preferredRowKey) {
      const rows = this.rows();
      const preferred = trim(preferredRowKey);
      if (preferred) {
        const exact = rows.find((row) => rowKeyOf(row) === preferred);
        if (exact) return exact;
      }
      return rows.find((row) => trim(row && row.bulk_authorise_section) === 'processed_eligible')
        || rows.find((row) => trim(row && row.bulk_authorise_section) === 'authorised_eligible')
        || rows[0]
        || null;
    }

    hasGenuineDirtyEdits() {
      if (typeof win.hasBulkAuthoriseGenuineDirtyEdits === 'function') {
        try { return !!win.hasBulkAuthoriseGenuineDirtyEdits(this.state, { preferDom: true }); } catch {}
      }
      return !!this.state.dirty;
    }

    async passDirtyGuard(nextRowKey, intent) {
      if (!this.hasGenuineDirtyEdits()) return true;
      if (typeof win.handleBulkAuthoriseUnsavedChangeGuard !== 'function') return false;
      return !!(await win.handleBulkAuthoriseUnsavedChangeGuard(this.state, nextRowKey || null, {
        intent: intent || 'bulk-authorise-lifecycle-v2',
        nextRowKey: nextRowKey || null,
        force: true,
        source: 'bulk-authorise-lifecycle-v2'
      }));
    }

    stampRoot() {
      const root = win.document && win.document.getElementById('bulkAuthoriseWorkbenchRoot');
      if (!root) return;
      root.dataset.bulkAuthoriseController = 'v2';
      root.dataset.bulkAuthoriseRowEpoch = String(this.rowEpoch);
      root.dataset.bulkAuthoriseDatasetEpoch = String(this.datasetEpoch);
      this.installDomBoundary();
    }

    async runOwnedAction(button) {
      const state = this.state;
      if (!button || button.disabled || state.loading || state.batch_busy || state.saving || state.unprocessing || state.__workbench_modal_spinner_active) return false;

      const selectedAction = trim(button.getAttribute('data-bulk-authorise-selected-action') || '').toLowerCase();
      const id = trim(button.id || '');
      const action = selectedAction || (id === 'bulkAuthActionRowAuthoriseBtn' ? 'authorise' : (id === 'bulkAuthActionRowUnauthoriseBtn' ? 'unauthorise' : ''));
      if (action !== 'authorise' && action !== 'unauthorise') return false;

      const selectedControl = !!selectedAction;
      const activeRowKey = trim(state.active_row_key || rowKeyOf(state.active_row));
      const buttonRowKey = trim(button.getAttribute('data-row-key') || button.dataset?.rowKey || '');
      if (!selectedControl && buttonRowKey && activeRowKey && buttonRowKey !== activeRowKey) {
        await this.render('[TS][BULK-AUTH][LIFECYCLE-V2][STALE-ACTION]');
        return false;
      }

      let options;
      if (selectedControl) {
        const selectedCount = Array.isArray(state.selected_row_keys) ? state.selected_row_keys.length : 0;
        const selectedSection = trim(state.selected_section);
        if (selectedCount < 1) return false;
        if (action === 'authorise' && selectedSection !== 'processed_eligible') return false;
        if (action === 'unauthorise' && selectedSection !== 'authorised_eligible') return false;
        options = {
          source: 'selected-bulk',
          showCompletionModal: false,
          returnCompletionResult: true
        };
      } else {
        if (!activeRowKey) return false;
        const backendSignature = trim(
          state.__bulk_authorise_active_backend_row_signature ||
          state.active_row?.backend_row_signature ||
          state.active_row?.row_backend_signature ||
          state.active_row?.row_signature
        );
        const renderSignature = trim(state.__bulk_authorise_active_render_signature || '');
        const rowChangeSeq = Number(state.__bulk_authorise_row_change_seq || 0) || 0;
        const recordIdentity = trim(state.__bulkAuthoriseRecordIdentity || state.activeRecordIdentity || '');
        options = {
          source: 'action-row',
          showCompletionModal: false,
          actionRowKey: activeRowKey,
          activeRowStrategy: action === 'authorise' ? 'next-processed-after-authorise' : 'same-row-after-unauthorise',
          actionSource: action === 'authorise' ? 'action-row-authorise' : 'action-row-unauthorise',
          actionRowSignature: backendSignature,
          actionBackendRowSignature: backendSignature,
          actionRenderSignature: renderSignature,
          actionRowChangeSeq: rowChangeSeq,
          actionRecordIdentity: recordIdentity
        };
        if (action === 'authorise') options.commitDirtyBeforeAuthorise = true;
      }

      const handler = action === 'authorise' ? win.handleBulkAuthoriseSelected : win.handleBulkUnauthoriseSelected;
      if (typeof handler !== 'function') return false;
      const execute = () => handler(state, options);
      const label = action === 'authorise' ? 'Authorising' : 'Unauthorising';
      const outcome = typeof win.withExistingModalLoadingSpinner === 'function'
        ? await win.withExistingModalLoadingSpinner(state, label, execute)
        : await execute();

      const completionModal = selectedControl && outcome && typeof outcome === 'object' ? outcome.completionModal : null;
      if (completionModal?.shouldShow && !state.__workbench_modal_spinner_active && typeof win.openUiConfirmModal === 'function') {
        await win.openUiConfirmModal({
          title: completionModal.title || (action === 'authorise' ? 'Bulk Authorise result' : 'Bulk Unauthorise result'),
          message: completionModal.message || '',
          confirm_label: completionModal.confirm_label || 'OK',
          cancel_label: completionModal.cancel_label || ''
        });
      }
      return outcome;
    }

    installDomBoundary() {
      const doc = win.document;
      if (!doc) return;
      const controller = this;
      const stopOwnedEvent = (event) => {
        try { event.preventDefault(); } catch {}
        try { event.stopImmediatePropagation(); } catch {}
        try { event.stopPropagation(); } catch {}
      };
      doc.__bulkAuthoriseLifecycleV2ActiveController = this;
      if (typeof doc.addEventListener === 'function' && doc.__bulkAuthoriseLifecycleV2DocumentBoundary !== true) {
        const dispatch = (event) => {
          const live = doc.__bulkAuthoriseLifecycleV2ActiveController;
          if (!live || live.closed) return;
          const state = live.state;
          if (!state || state.loading || state.batch_busy || state.__workbench_modal_spinner_active) return;
          const workbenchRoot = doc.getElementById('bulkAuthoriseWorkbenchRoot');
          if (!workbenchRoot) return;
          const target = event.target;
          if (!target || typeof target.closest !== 'function') return;

          if (event.type === 'click') {
            const classificationRoot = doc.getElementById('bulkAuthoriseClassificationButtonsRoot');
            const classificationButton = target.closest('[data-bulk-authorise-classification-btn="1"][data-classification]');
            if (classificationRoot && classificationButton && classificationRoot.contains(classificationButton)) {
              stopOwnedEvent(event);
              void live.transitionToClassification(classificationButton.getAttribute('data-classification'));
              return;
            }

            const actionButton = target.closest('[data-bulk-authorise-selected-action], #bulkAuthActionRowAuthoriseBtn, #bulkAuthActionRowUnauthoriseBtn');
            if (actionButton && workbenchRoot.contains(actionButton)) {
              stopOwnedEvent(event);
              void live.runOwnedAction(actionButton);
              return;
            }
          }

          if (event.type === 'keydown') {
            const key = trim(event.key);
            if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return;
          } else if (event.type !== 'click') {
            return;
          }

          const listsRoot = doc.getElementById('bulkAuthoriseListsRoot');
          const rowElement = target.closest('[data-bulk-authorise-row="1"][data-row-key]');
          if (!listsRoot || !rowElement || !listsRoot.contains(rowElement)) return;
          const interactive = target.closest([
            '[data-bulk-authorise-row-checkbox="1"]',
            '[data-bulk-authorise-section-checkbox="1"]',
            '[data-bulk-authorise-selected-action]',
            'button',
            'a',
            'input',
            'select',
            'textarea',
            'label',
            '[role="button"]',
            '[role="link"]',
            '[role="checkbox"]',
            '[contenteditable]',
            '[data-bulk-authorise-action-control="1"]',
            '[data-bulk-authorise-no-row-open="1"]',
            '[data-no-row-open="1"]',
            '[data-row-open-ignore="1"]'
          ].join(','));
          if (interactive && rowElement.contains(interactive)) return;
          const nextRowKey = trim(rowElement.getAttribute('data-row-key') || '');
          if (!nextRowKey) return;
          stopOwnedEvent(event);
          void live.transitionToRow(nextRowKey, { source: 'row_click' });
        };
        doc.addEventListener('click', dispatch, true);
        doc.addEventListener('keydown', dispatch, true);
        doc.__bulkAuthoriseLifecycleV2DocumentBoundary = true;
      }

      const listsRoot = doc.getElementById('bulkAuthoriseListsRoot');
      if (listsRoot && typeof listsRoot.addEventListener === 'function' && listsRoot.__bulkAuthoriseLifecycleV2RowBoundary !== this) {
        const handleRowEvent = (event) => {
          if (controller.closed || controller.state.loading || controller.state.batch_busy || controller.state.__workbench_modal_spinner_active) return;
          if (event.type === 'keydown') {
            const key = trim(event.key);
            if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return;
          }
          const target = event.target;
          if (!target || typeof target.closest !== 'function') return;
          const rowElement = target.closest('[data-bulk-authorise-row="1"][data-row-key]');
          if (!rowElement || !listsRoot.contains(rowElement)) return;
          const interactive = target.closest([
            '[data-bulk-authorise-row-checkbox="1"]',
            '[data-bulk-authorise-section-checkbox="1"]',
            '[data-bulk-authorise-selected-action]',
            'button',
            'a',
            'input',
            'select',
            'textarea',
            'label',
            '[role="button"]',
            '[role="link"]',
            '[role="checkbox"]',
            '[contenteditable]',
            '[data-bulk-authorise-action-control="1"]',
            '[data-bulk-authorise-no-row-open="1"]',
            '[data-no-row-open="1"]',
            '[data-row-open-ignore="1"]'
          ].join(','));
          if (interactive && rowElement.contains(interactive)) return;
          const nextRowKey = trim(rowElement.getAttribute('data-row-key') || '');
          if (!nextRowKey) return;
          stopOwnedEvent(event);
          void controller.transitionToRow(nextRowKey, { source: 'row_click' });
        };
        listsRoot.addEventListener('click', handleRowEvent, true);
        listsRoot.addEventListener('keydown', handleRowEvent, true);
        listsRoot.__bulkAuthoriseLifecycleV2RowBoundary = this;
      }

      const classificationRoot = doc.getElementById('bulkAuthoriseClassificationButtonsRoot');
      if (classificationRoot && typeof classificationRoot.addEventListener === 'function' && classificationRoot.__bulkAuthoriseLifecycleV2Boundary !== this) {
        classificationRoot.addEventListener('click', (event) => {
          const target = event.target;
          const button = target && typeof target.closest === 'function'
            ? target.closest('[data-bulk-authorise-classification-btn="1"][data-classification]')
            : null;
          if (!button || !classificationRoot.contains(button)) return;
          stopOwnedEvent(event);
          void controller.transitionToClassification(button.getAttribute('data-classification'));
        }, true);
        classificationRoot.__bulkAuthoriseLifecycleV2Boundary = this;
      }

      const workbenchRoot = doc.getElementById('bulkAuthoriseWorkbenchRoot');
      if (workbenchRoot && typeof workbenchRoot.addEventListener === 'function' && workbenchRoot.__bulkAuthoriseLifecycleV2ActionBoundary !== this) {
        workbenchRoot.addEventListener('click', (event) => {
          const target = event.target;
          const button = target && typeof target.closest === 'function'
            ? target.closest('[data-bulk-authorise-selected-action], #bulkAuthActionRowAuthoriseBtn, #bulkAuthActionRowUnauthoriseBtn')
            : null;
          if (!button || !workbenchRoot.contains(button)) return;
          stopOwnedEvent(event);
          void controller.runOwnedAction(button);
        }, true);
        workbenchRoot.__bulkAuthoriseLifecycleV2ActionBoundary = this;
      }
    }

    enforcePreviewOwnership() {
      const state = this.state;
      const activeKey = trim(state.active_row_key || rowKeyOf(state.active_row));
      const pane = state.evidence_pane_state && typeof state.evidence_pane_state === 'object'
        ? state.evidence_pane_state
        : null;
      if (!pane) return;

      if (!activeKey) {
        clearRowOwnedState(state);
        return;
      }

      if (classificationOf(state.classification) !== 'TIMESHEETS') {
        const importedView = deep(state.__bulkAuthoriseImportEvidenceView);
        clearRowOwnedState(state);
        state.__bulkAuthoriseImportEvidenceView = importedView;
        return;
      }

      if (trim(pane.active_tab).toLowerCase() === 'queue') return;
      const owner = trim(
        state.__bulkAuthorisePreviewActiveRowKey ||
        pane.__bulk_authorise_evidence_identity ||
        pane.__preview_identity
      );
      if (owner && owner !== activeKey && owner !== `row:${activeKey}`) clearRowOwnedState(state);
    }

    async render(reason) {
      if (this.closed) return false;
      await legacy.rerender(this.state, reason || '[TS][BULK-AUTH][LIFECYCLE-V2]');
      if (this.closed) return false;
      this.enforcePreviewOwnership();
      this.stampRoot();
      return true;
    }

    isCurrentRowTransition(epoch, expectedClassification, expectedRowKey) {
      return !this.closed
        && this.rowEpoch === epoch
        && classificationOf(this.state.classification) === expectedClassification
        && trim(this.state.active_row_key || rowKeyOf(this.state.active_row)) === expectedRowKey;
    }

    async transitionToRow(preferredRowKey, options = {}) {
      if (this.closed) return false;
      const target = this.findRow(preferredRowKey);
      const targetKey = rowKeyOf(target);
      const currentKey = trim(this.state.active_row_key || rowKeyOf(this.state.active_row));

      if (targetKey !== currentKey && options.skipDirtyGuard !== true) {
        const allowed = await this.passDirtyGuard(targetKey, options.intent || options.source || 'row-switch');
        if (!allowed) return false;
      }

      const selection = Array.isArray(this.state.selected_row_keys) ? this.state.selected_row_keys.slice() : [];
      const selectedSection = this.state.selected_section || null;
      const epoch = ++this.rowEpoch;
      const expectedClassification = classificationOf(this.state.classification);
      this.state.__bulk_authorise_row_change_seq = (Number(this.state.__bulk_authorise_row_change_seq || 0) || 0) + 1;
      this.state.__bulk_authorise_v2_transition_loading = true;
      clearRowOwnedState(this.state);

      await legacy.setActiveRow(this.state, targetKey || null, {
        ...options,
        __bulkAuthoriseLifecycleBypass: true,
        skipDirtyGuard: true,
        rerender: false,
        datasetOnly: true,
        minimalOnly: true,
        deferContextRefresh: true,
        refreshContext: false,
        scheduleHydration: false,
        skipEvidenceHydration: true,
        skip_evidence_hydration: true,
        hydrationRerender: false,
        source: options.source || 'row_click'
      });

      this.state.selected_row_keys = selection;
      this.state.selected_section = selectedSection;
      const activeKey = trim(this.state.active_row_key || rowKeyOf(this.state.active_row));
      if (!activeKey) {
        this.state.__bulk_authorise_v2_transition_loading = false;
        await this.render('[TS][BULK-AUTH][LIFECYCLE-V2][EMPTY]');
        return true;
      }

      await this.render('[TS][BULK-AUTH][LIFECYCLE-V2][ROW-SKELETON]');
      if (!this.isCurrentRowTransition(epoch, expectedClassification, activeKey)) return false;

      try {
        if (typeof win.refreshBulkAuthoriseActiveContext === 'function') {
          await win.refreshBulkAuthoriseActiveContext(this.state, {
            row: this.state.active_row,
            row_key: activeKey,
            rowChangeSeq: Number(this.state.__bulk_authorise_row_change_seq || 0) || 0,
            source: 'bulk-authorise-lifecycle-v2-row',
            profile: 'full',
            context_profile: 'full',
            full: true,
            forceFull: true,
            include_evidence: true,
            include_compare: true,
            include_import_source_rows: true,
            bypassCache: true,
            authoritative: true,
            rerender: false
          });
        }
      } catch (error) {
        if (this.isCurrentRowTransition(epoch, expectedClassification, activeKey)) {
          this.state.warning_text = trim(error && error.message) || 'The selected row could not be fully refreshed.';
        }
      }

      if (!this.isCurrentRowTransition(epoch, expectedClassification, activeKey)) return false;
      this.state.__bulk_authorise_v2_transition_loading = false;
      await this.render('[TS][BULK-AUTH][LIFECYCLE-V2][ROW-READY]');
      return true;
    }

    resetClassificationState(nextClassification) {
      this.state.classification = nextClassification;
      this.state.selected_row_keys = [];
      this.state.selected_section = null;
      this.state.middle_pane_mode = 'single';
      this.state.middle_pane_section = 'processed_eligible';
      this.state.imported_evidence_page = 1;
      this.state.imported_evidence_page_index = 0;
      this.state.error_text = '';
      this.state.warning_text = '';
      this.state.__bulk_authorise_context_cache = {};
      this.state.__bulk_authorise_context_inflight = {};
      this.state.__bulk_authorise_context_bypass_signatures = {};
      this.state.__bulkAuthoriseImportEvidenceCache = {};
      this.state.__bulkAuthoriseImportEvidenceInflight = {};
      this.state.__bulkAuthoriseImportEvidenceErrors = {};
      clearActiveRow(this.state);
      clearRowOwnedState(this.state);
    }

    async transitionToClassification(nextValue) {
      if (this.closed || this.state.loading || this.state.batch_busy) return false;
      const nextClassification = classificationOf(nextValue);
      if (nextClassification === classificationOf(this.state.classification)) return true;
      const allowed = await this.passDirtyGuard(null, 'classification-change');
      if (!allowed || this.closed) return false;

      const epoch = ++this.datasetEpoch;
      ++this.rowEpoch;
      this.resetClassificationState(nextClassification);
      this.state.loading = true;
      this.state.__bulk_authorise_classification_changing = true;
      this.state.__bulk_authorise_dataset_refreshing = true;
      this.state.__bulk_authorise_dataset_ready = false;
      await this.render('[TS][BULK-AUTH][LIFECYCLE-V2][CLASSIFICATION-LOADING]');

      try {
        const dataset = await win.fetchBulkAuthoriseDataset(requestFiltersFor(this.state), {
          bypassCache: true,
          forceFreshDataset: true,
          noBackgroundRevalidate: true,
          state: this.state
        });
        if (this.closed || this.datasetEpoch !== epoch || classificationOf(this.state.classification) !== nextClassification) return false;
        this.state.dataset = deep(dataset);
        this.state.loading = false;
        this.state.__bulk_authorise_classification_changing = false;
        this.state.__bulk_authorise_dataset_refreshing = false;
        this.state.__bulk_authorise_dataset_ready = true;
        return await this.transitionToRow(null, { skipDirtyGuard: true, source: 'classification-change' });
      } catch (error) {
        if (this.closed || this.datasetEpoch !== epoch) return false;
        this.state.loading = false;
        this.state.__bulk_authorise_classification_changing = false;
        this.state.__bulk_authorise_dataset_refreshing = false;
        this.state.__bulk_authorise_dataset_ready = false;
        this.state.error_text = trim(error && error.message) || 'Failed to switch Bulk Authorise classification.';
        await this.render('[TS][BULK-AUTH][LIFECYCLE-V2][CLASSIFICATION-ERROR]');
        return false;
      }
    }

    bindClassificationButtons() {
      const root = win.document && win.document.getElementById('bulkAuthoriseClassificationButtonsRoot');
      if (!root || root.dataset.boundBulkAuthoriseClassificationButtonsV2 === '1') return;
      root.dataset.boundBulkAuthoriseClassificationButtonsV2 = '1';
      const buttons = Array.from(root.querySelectorAll('[data-bulk-authorise-classification-btn="1"][data-classification]'));
      for (const button of buttons) {
        if (button.dataset.boundBulkAuthoriseClassificationButtonV2 === '1') continue;
        button.dataset.boundBulkAuthoriseClassificationButtonV2 = '1';
        button.addEventListener('click', () => {
          void this.transitionToClassification(button.getAttribute('data-classification'));
        });
      }
    }

    chooseActiveAfterMutation(action, previousActiveKey) {
      const rows = this.rows();
      const previous = rows.find((row) => rowKeyOf(row) === previousActiveKey) || null;
      if (action === 'unauthorise' && previous) return rowKeyOf(previous);
      if (action === 'authorise' && previous && trim(previous.bulk_authorise_section) === 'processed_eligible') return rowKeyOf(previous);
      const processed = rows.find((row) => trim(row && row.bulk_authorise_section) === 'processed_eligible');
      if (processed) return rowKeyOf(processed);
      if (previous) return rowKeyOf(previous);
      return rowKeyOf(rows[0]);
    }

    async refreshCanonicalDatasetAfterMutation(action, result) {
      if (this.closed || !result || result.batch_completed === false || Number(result.success_count || 0) < 1) return false;
      const epoch = ++this.datasetEpoch;
      const previousActiveKey = trim(this.state.active_row_key || rowKeyOf(this.state.active_row));
      this.state.__bulk_authorise_v2_canonical_refreshing = true;
      try {
        const dataset = await win.fetchBulkAuthoriseDataset(requestFiltersFor(this.state), {
          bypassCache: true,
          forceFreshDataset: true,
          mutationRefresh: true,
          noBackgroundRevalidate: true,
          mutationSeq: Number(result.mutationSeq || 0) || 0,
          state: this.state
        });
        if (this.closed || this.datasetEpoch !== epoch) return false;
        this.state.dataset = deep(dataset);

        const visibleKeys = new Set(this.rows().map(rowKeyOf).filter(Boolean));
        const failedKeys = failedRowKeys(result).filter((key) => visibleKeys.has(key));
        this.state.selected_row_keys = failedKeys;
        this.state.selected_section = failedKeys.length
          ? (action === 'authorise' ? 'processed_eligible' : 'authorised_eligible')
          : null;
        const nextActiveKey = this.chooseActiveAfterMutation(action, previousActiveKey);
        await this.transitionToRow(nextActiveKey, {
          skipDirtyGuard: true,
          source: 'canonical-mutation-refresh'
        });
        result.canonical_dataset_refreshed = true;
        return true;
      } catch (error) {
        result.canonical_dataset_refreshed = false;
        result.canonical_dataset_refresh_error = trim(error && error.message) || 'Canonical Bulk Authorise refresh failed.';
        this.state.lifecycle_refresh_failed = true;
        this.state.lifecycle_refresh_error = result.canonical_dataset_refresh_error;
        return false;
      } finally {
        this.state.__bulk_authorise_v2_canonical_refreshing = false;
      }
    }

    attachFrameTeardown() {
      const frame = typeof win.__getModalFrame === 'function' ? win.__getModalFrame() : null;
      if (!frame || trim(frame.kind) !== 'bulk-authorise-workbench' || frame.__bulkAuthoriseLifecycleV2Teardown === true) return;
      frame.__bulkAuthoriseLifecycleV2Teardown = true;
      this.frame = frame;
      this.frameDismiss = typeof frame._onDismiss === 'function' ? frame._onDismiss : null;
      const controller = this;
      frame._onDismiss = function bulkAuthoriseLifecycleV2Dismiss(...args) {
        controller.close();
        return controller.frameDismiss ? controller.frameDismiss.apply(this, args) : undefined;
      };
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      ++this.rowEpoch;
      ++this.datasetEpoch;
      this.state.__bulk_authorise_row_change_seq = (Number(this.state.__bulk_authorise_row_change_seq || 0) || 0) + 1;
      clearRowOwnedState(this.state, { preserveQueueRows: false });
      clearActiveRow(this.state);
      if (this.state.__bulk_authorise_evidence_guard_observer && typeof this.state.__bulk_authorise_evidence_guard_observer.disconnect === 'function') {
        try { this.state.__bulk_authorise_evidence_guard_observer.disconnect(); } catch {}
      }
      this.state.__bulk_authorise_evidence_guard_observer = null;
    }

    async initialise() {
      if (this.initialised || this.closed) return this.state;
      this.initialised = true;
      this.attachFrameTeardown();
      this.state.selected_row_keys = [];
      this.state.selected_section = null;
      const initialKey = trim(this.state.active_row_key || rowKeyOf(this.state.active_row));
      await this.transitionToRow(initialKey, {
        skipDirtyGuard: true,
        source: 'initial-lifecycle-v2'
      });
      return this.state;
    }
  }

  function controllerFor(stateLike) {
    const state = currentState(stateLike);
    if (!state) return null;
    let controller = controllers.get(state);
    if (!controller) {
      controller = new BulkAuthoriseLifecycleController(state);
      controllers.set(state, controller);
    }
    return controller;
  }

  win.bindBulkAuthoriseClassificationButtons = function bindBulkAuthoriseClassificationButtonsV2(state) {
    const controller = controllerFor(state);
    if (!controller) return;
    controller.bindClassificationButtons();
  };

  win.setActiveBulkAuthoriseRowFromVisibleRows = async function setActiveBulkAuthoriseRowV2(state, preferredRowKey, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const source = trim(opts.source || opts.mode || opts.actionSource).toLowerCase();
    const bypass = opts.__bulkAuthoriseLifecycleBypass === true
      || opts.statusPatch === true
      || opts.status_patch === true
      || opts.identityPatch === true
      || opts.identity_patch === true
      || /^(status_patch|identity_patch|affected_row_refresh|canonical-mutation-refresh)$/.test(source);
    if (bypass) return legacy.setActiveRow(state, preferredRowKey, opts);
    const controller = controllerFor(state);
    return controller ? controller.transitionToRow(preferredRowKey, opts) : legacy.setActiveRow(state, preferredRowKey, opts);
  };

  if (typeof legacy.authoriseSelected === 'function') {
    win.handleBulkAuthoriseSelected = async function handleBulkAuthoriseSelectedV2(state, options) {
      const result = await legacy.authoriseSelected(state, options);
      const controller = controllerFor(state);
      if (controller) await controller.refreshCanonicalDatasetAfterMutation('authorise', result);
      return result;
    };
  }

  if (typeof legacy.unauthoriseSelected === 'function') {
    win.handleBulkUnauthoriseSelected = async function handleBulkUnauthoriseSelectedV2(state, options) {
      const result = await legacy.unauthoriseSelected(state, options);
      const controller = controllerFor(state);
      if (controller) await controller.refreshCanonicalDatasetAfterMutation('unauthorise', result);
      return result;
    };
  }

  win.openBulkAuthoriseWorkbench = async function openBulkAuthoriseWorkbenchV2(...args) {
    const state = await legacy.open.apply(this, args);
    const controller = controllerFor(state);
    if (controller) await controller.initialise();
    return state;
  };

  win.__bulkAuthoriseLifecycleV2Test = {
    controllerFor,
    clearRowOwnedState,
    classificationOf,
    rowKeyOf,
    legacy
  };
})(window);
