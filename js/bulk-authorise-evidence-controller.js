(function installBulkAuthoriseEvidenceController(win) {
  'use strict';

  if (!win || win.__bulkAuthoriseEvidenceControllerInstalled === true) return;
  win.__bulkAuthoriseEvidenceControllerInstalled = true;

  const doc = win.document;
  const controllers = new WeakMap();
  const legacy = {
    open: win.openBulkAuthoriseWorkbench,
    renderShell: win.renderBulkAuthoriseShell,
    refreshContext: win.refreshBulkAuthoriseActiveContext,
    bindEvidence: win.bindBulkAuthoriseEvidencePane,
    bindPreview: win.bindBulkAuthorisePreviewPane,
    reconcileEvidence: win.reconcileBulkProcessEvidenceStateAfterContextRefresh
  };

  const trim = (value) => String(value == null ? '' : value).trim();
  const upper = (value) => trim(value).toUpperCase();
  const clone = (value) => {
    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
  };
  const cleanFileKey = (value) => trim(value).replace(/^\/+/, '');
  const classificationOf = (state) => {
    const value = upper(state && state.classification);
    return value === 'NHSP' || value === 'HR' || value === 'HEALTHROSTER' ? value : 'TIMESHEETS';
  };
  const rowIdentityOf = (state) => trim(
    state && (
      state.active_row_key ||
      state.active_row?.row_key ||
      state.__bulkAuthoriseRecordIdentity ||
      state.active_row?.timesheet_id ||
      state.active_row?.current_timesheet_id ||
      state.active_row?.contract_week_id
    )
  );
  const evidenceIdOf = (item) => trim(
    item && (
      item.evidence_id ||
      item.timesheet_evidence_id ||
      item.evidenceId ||
      item.id
    )
  );
  const evidenceFileKeyOf = (item) => cleanFileKey(
    item && (
      item.storage_key ||
      item.r2_key ||
      item.file_key ||
      item.download_storage_key ||
      item.preview_storage_key
    )
  );
  const evidenceKindOf = (item) => {
    const value = upper(item && (item.kind || item.evidence_kind || item.staged_kind));
    if (value === 'TIME SHEET' || value === 'TIME-SHEET') return 'TIMESHEET';
    if (value === 'ACCOM') return 'ACCOMMODATION';
    return value || 'OTHER';
  };
  const isSyntheticEvidence = (item) => {
    const id = evidenceIdOf(item);
    return !!(
      !item ||
      item.__synthetic_attached_fallback === true ||
      item.is_synthetic_attached_fallback === true ||
      item.__primary_artifact_fallback === true ||
      item.is_primary_artifact_fallback === true ||
      /^synthetic-attached:/i.test(id)
    );
  };
  const normaliseEvidence = (item) => {
    if (!item || typeof item !== 'object' || isSyntheticEvidence(item)) return null;
    const fileKey = evidenceFileKeyOf(item);
    if (!fileKey) return null;
    const staged = item.is_staged_context === true || ['STAGED', 'QUEUED'].includes(upper(item.status || item.queue_status));
    const source = upper(item.source_label || item.source_badge);
    if (staged && !trim(item.evidence_id || item.timesheet_evidence_id) && source !== 'ATTACHED') return null;
    const kind = evidenceKindOf(item);
    const id = evidenceIdOf(item) || `system:${kind}:${fileKey}`;
    const displayName = trim(item.display_name || item.filename || item.original_filename || item.file_name) || `${kind === 'TIMESHEET' ? 'Timesheet' : 'Evidence'} file`;
    return {
      ...clone(item),
      id,
      evidence_id: trim(item.evidence_id || item.timesheet_evidence_id) || (item.system === true ? id : null),
      kind,
      staged_kind: kind,
      display_name: displayName,
      filename: trim(item.filename) || displayName,
      original_filename: trim(item.original_filename) || displayName,
      storage_key: fileKey,
      r2_key: fileKey,
      file_key: fileKey,
      download_storage_key: cleanFileKey(item.download_storage_key || fileKey),
      source_label: trim(item.source_label) || 'Attached',
      source_badge: trim(item.source_badge) || 'Attached'
    };
  };
  const itemKey = (item) => {
    const normalised = normaliseEvidence(item);
    return normalised ? `${evidenceIdOf(normalised)}|${evidenceFileKeyOf(normalised)}` : '';
  };
  const selectionKey = (item) => {
    const normalised = normaliseEvidence(item);
    return normalised ? `attached|${evidenceIdOf(normalised)}|${evidenceFileKeyOf(normalised)}` : '';
  };
  const rowKeyOf = (row) => trim(row && (row.row_key || row.timesheet_id || row.current_timesheet_id || row.contract_week_id));
  const badgeKinds = ['TIMESHEET', 'MILEAGE', 'TRAVEL', 'ACCOMMODATION', 'OTHER'];
  const badgeLabel = (kind) => kind === 'TIMESHEET'
    ? 'Timesheet'
    : (kind === 'ACCOMMODATION' ? 'Accommodation' : `${kind.slice(0, 1)}${kind.slice(1).toLowerCase()}`);
  const buildBadges = (rows) => {
    const counts = new Map();
    for (const item of rows) {
      const kind = badgeKinds.includes(evidenceKindOf(item)) ? evidenceKindOf(item) : 'OTHER';
      counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    return badgeKinds.map((kind) => ({
      kind,
      label: badgeLabel(kind),
      present: (counts.get(kind) || 0) > 0,
      has_evidence: (counts.get(kind) || 0) > 0,
      count: counts.get(kind) || 0
    }));
  };
  const positiveBadgeKinds = (badges) => (Array.isArray(badges) ? badges : [])
    .filter((badge) => badge && (badge.present === true || badge.has_evidence === true || Number(badge.count || 0) > 0))
    .map((badge) => evidenceKindOf(badge));
  const badgeStateFromRows = (rows) => ({
    evidence_badges: buildBadges(Array.isArray(rows) ? rows : []),
    has_any_evidence: Array.isArray(rows) && rows.length > 0,
    attached_evidence_count: Array.isArray(rows) ? rows.length : 0
  });
  const badgeStateFromPayload = (payload, evidenceRows) => {
    const rows = Array.isArray(evidenceRows) ? evidenceRows : [];
    const serverBadges = Array.isArray(payload?.evidence_badges)
      ? payload.evidence_badges.filter((badge) => badge && typeof badge === 'object')
      : [];
    if (!serverBadges.length) return badgeStateFromRows(rows);
    const badgeCount = serverBadges.reduce((total, badge) => {
      const explicit = Number(badge.count || 0) || 0;
      return total + (explicit > 0 ? explicit : (badge.present === true || badge.has_evidence === true ? 1 : 0));
    }, 0);
    const payloadCount = Number(payload?.attached_evidence_count ?? payload?.evidence_count);
    const attachedCount = Number.isFinite(payloadCount) && payloadCount >= 0
      ? payloadCount
      : (rows.length || badgeCount);
    return {
      evidence_badges: clone(serverBadges),
      has_any_evidence: payload?.has_any_evidence === true || attachedCount > 0 || badgeCount > 0,
      attached_evidence_count: attachedCount
    };
  };

  class BulkAuthoriseEvidenceController {
    constructor(state) {
      this.state = state;
      this.datasetRef = null;
      this.datasetBadgeTruth = new Map();
      this.datasetInitialBadgeTruth = new Map();
      this.datasetPendingBadgeIdentities = new Set();
      this.badgeHydrationDatasetRef = null;
      this.badgeHydrationPromise = null;
      this.badgeHydrationRenderPromise = null;
      this.badgeHydrationRenderRequested = false;
      this.badgeHydrationEpoch = 0;
      this.badgeHydrationAbortControllers = [];
      this.rowsByIdentity = new Map();
      this.selectedByIdentity = new Map();
      this.selectionEpoch = 0;
      this.guardEpoch = 0;
      this.pendingGuardKey = '';
      this.basePostRenderBindings = null;
      this.boundPostRenderBindings = null;
      this.previewRequestKey = '';
      this.previewRequestPromise = null;
      this.previewAbortController = null;
      this.postRenderSettleEpoch = 0;
      this.lastPointerSelectionKey = '';
    }

    isTimesheets() {
      return classificationOf(this.state) === 'TIMESHEETS';
    }

    isLive() {
      return !!(
        this.isTimesheets() &&
        win.modalCtx &&
        win.modalCtx.bulkAuthoriseState === this.state &&
        doc && doc.getElementById('bulkAuthoriseWorkbenchRoot')
      );
    }

    datasetRows() {
      const dataset = this.state && this.state.dataset;
      if (!dataset || typeof dataset !== 'object') return [];
      const collections = [
        dataset.rows,
        dataset.processed_eligible_rows,
        dataset.authorised_eligible_rows,
        dataset.unauthorised_rows,
        dataset.processed_eligible,
        dataset.authorised_eligible
      ];
      const rows = [];
      const seen = new Set();
      for (const collection of collections) {
        if (!Array.isArray(collection)) continue;
        for (const row of collection) {
          if (!row || typeof row !== 'object' || seen.has(row)) continue;
          seen.add(row);
          rows.push(row);
        }
      }
      return rows;
    }

    captureDatasetTruth() {
      const dataset = this.state && this.state.dataset;
      if (dataset === this.datasetRef) return;
      for (const controller of this.badgeHydrationAbortControllers) {
        try { controller?.abort?.(); } catch {}
      }
      this.badgeHydrationAbortControllers = [];
      this.badgeHydrationEpoch += 1;
      this.badgeHydrationDatasetRef = null;
      this.badgeHydrationPromise = null;
      this.badgeHydrationRenderPromise = null;
      this.badgeHydrationRenderRequested = false;
      this.datasetRef = dataset || null;
      this.datasetBadgeTruth.clear();
      this.datasetInitialBadgeTruth.clear();
      this.datasetPendingBadgeIdentities.clear();
      for (const row of this.datasetRows()) {
        const key = rowKeyOf(row);
        if (!key) continue;
        const initial = {
          evidence_badges: clone(Array.isArray(row.evidence_badges) ? row.evidence_badges : []),
          has_any_evidence: row.has_any_evidence === true,
          attached_evidence_count: Number(row.attached_evidence_count || 0) || 0,
          artifact_hints: {
            primary_artifact_id: row.primary_artifact_id ?? null,
            primary_artifact_kind: row.primary_artifact_kind ?? null,
            primary_artifact_storage_key: row.primary_artifact_storage_key ?? null,
            manual_pdf_r2_key: row.manual_pdf_r2_key ?? null,
            manualPdfR2Key: row.manualPdfR2Key ?? null,
            uploaded_pdf_r2_key: row.uploaded_pdf_r2_key ?? null,
            uploadedPdfR2Key: row.uploadedPdfR2Key ?? null
          }
        };
        this.datasetBadgeTruth.set(key, clone(initial));
        this.datasetInitialBadgeTruth.set(key, clone(initial));
      }
    }

    writeDatasetBadgeState(identity, badgeState, options = {}) {
      if (!identity || !badgeState) return;
      const initial = this.datasetInitialBadgeTruth.get(identity) || null;
      for (const row of this.datasetRows()) {
        if (rowKeyOf(row) !== identity) continue;
        row.evidence_badges = clone(badgeState.evidence_badges);
        row.has_any_evidence = badgeState.has_any_evidence === true;
        row.attached_evidence_count = Number(badgeState.attached_evidence_count || 0) || 0;
        if (options.pending === true) {
          row.primary_artifact_id = null;
          row.primary_artifact_kind = null;
          row.primary_artifact_storage_key = null;
          row.manual_pdf_r2_key = null;
          row.manualPdfR2Key = null;
          row.uploaded_pdf_r2_key = null;
          row.uploadedPdfR2Key = null;
        } else if (options.restoreArtifactHints === true && initial?.artifact_hints) {
          Object.assign(row, clone(initial.artifact_hints));
        }
      }
    }

    prepareDatasetBadgeHydration(rows) {
      const pendingState = badgeStateFromRows([]);
      for (const row of rows) {
        const identity = rowKeyOf(row);
        const timesheetId = trim(row?.current_timesheet_id || row?.timesheet_id || row?.requested_timesheet_id);
        if (!identity || !timesheetId) continue;
        this.datasetPendingBadgeIdentities.add(identity);
        this.datasetBadgeTruth.set(identity, clone(pendingState));
        this.writeDatasetBadgeState(identity, pendingState, { pending: true });
      }
    }

    extractEvidencePayload(payload) {
      if (!payload || typeof payload !== 'object') return [];
      const sources = [payload.evidence, payload.details?.evidence, payload.state?.evidence].filter(Array.isArray);
      const rows = [];
      const seen = new Set();
      for (const source of sources) {
        for (const raw of source) {
          const item = normaliseEvidence(raw);
          if (!item) continue;
          const key = itemKey(item);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          rows.push(item);
        }
      }
      return rows;
    }

    async hydrateDatasetBadgeRow(row, datasetRef, epoch) {
      const identity = rowKeyOf(row);
      const timesheetId = trim(row?.current_timesheet_id || row?.timesheet_id || row?.requested_timesheet_id);
      const brokerBaseUrl = trim(win.BROKER_BASE_URL).replace(/\/$/, '');
      if (!identity || !timesheetId || !brokerBaseUrl || typeof win.authFetch !== 'function') return false;

      const pairs = [
        ['row_key', identity],
        ['timesheet_id', timesheetId],
        ['current_timesheet_id', trim(row?.current_timesheet_id || row?.timesheet_id || timesheetId)],
        ['requested_timesheet_id', trim(row?.requested_timesheet_id || row?.timesheet_id || timesheetId)],
        ['expected_timesheet_id', trim(row?.expected_timesheet_id || row?.current_timesheet_id || row?.timesheet_id || timesheetId)],
        ['contract_week_id', trim(row?.contract_week_id)],
        ['profile', 'evidence'],
        ['context_profile', 'evidence'],
        ['include_evidence', 'true'],
        ['include_compare', 'false'],
        ['include_import_source_rows', 'false']
      ].filter(([, value]) => trim(value));
      const query = pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
      const endpoint = `${brokerBaseUrl}/api/timesheets/${encodeURIComponent(timesheetId)}/bulk-authorise-context?${query}`;
      const abortController = typeof win.AbortController === 'function' ? new win.AbortController() : null;
      if (abortController) this.badgeHydrationAbortControllers.push(abortController);

      try {
        const response = await win.authFetch(endpoint, abortController ? { signal: abortController.signal } : undefined);
        const text = await response.text().catch(() => '');
        if (!response.ok) return false;
        const payload = text ? JSON.parse(text) : {};
        if (!payload || typeof payload !== 'object' || payload.ok === false || payload.soft_failure === true || payload.evidence_refresh_failed === true) return false;
        if (datasetRef !== this.datasetRef || epoch !== this.badgeHydrationEpoch) return false;

        const evidenceRows = this.extractEvidencePayload(payload);
        const badgeState = badgeStateFromPayload(payload, evidenceRows);
        this.datasetBadgeTruth.set(identity, clone(badgeState));
        this.datasetPendingBadgeIdentities.delete(identity);
        this.writeDatasetBadgeState(identity, badgeState, { restoreArtifactHints: evidenceRows.length > 0 });
        return true;
      } catch {
        return false;
      } finally {
        if (abortController) {
          this.badgeHydrationAbortControllers = this.badgeHydrationAbortControllers.filter((candidate) => candidate !== abortController);
        }
      }
    }

    scheduleDatasetBadgeHydrationRender(datasetRef, epoch, reason = 'row-settled') {
      if (datasetRef !== this.datasetRef || epoch !== this.badgeHydrationEpoch) return Promise.resolve(false);
      this.badgeHydrationRenderRequested = true;
      if (this.badgeHydrationRenderPromise) return this.badgeHydrationRenderPromise;

      const work = (async () => {
        let rendered = false;
        while (this.badgeHydrationRenderRequested && datasetRef === this.datasetRef && epoch === this.badgeHydrationEpoch) {
          this.badgeHydrationRenderRequested = false;
          await Promise.resolve();
          if (
            datasetRef !== this.datasetRef ||
            epoch !== this.badgeHydrationEpoch ||
            typeof win.rerenderBulkAuthoriseWorkbench !== 'function' ||
            !this.isLive()
          ) continue;
          await win.rerenderBulkAuthoriseWorkbench(this.state, `[TS][BULK-AUTH][EVIDENCE-BADGES:${reason}]`);
          rendered = true;
          if (datasetRef === this.datasetRef && epoch === this.badgeHydrationEpoch) {
            this.settle(`dataset-badge-hydration:${reason}`);
          }
        }
        return rendered;
      })();
      const renderPromise = work.finally(() => {
        if (this.badgeHydrationRenderPromise === renderPromise) this.badgeHydrationRenderPromise = null;
      });
      this.badgeHydrationRenderPromise = renderPromise;
      return renderPromise;
    }

    hydrateDatasetBadges() {
      if (!this.isTimesheets()) return Promise.resolve({ applied: false, reason: 'non-timesheets' });
      this.captureDatasetTruth();
      const datasetRef = this.datasetRef;
      if (!datasetRef) return Promise.resolve({ applied: false, reason: 'no-dataset' });
      if (this.badgeHydrationDatasetRef === datasetRef && this.badgeHydrationPromise) return this.badgeHydrationPromise;
      if (this.badgeHydrationDatasetRef === datasetRef && this.state.__bulk_authorise_badge_hydration_complete === true) {
        return Promise.resolve({ applied: true, cached: true });
      }

      const rows = this.datasetRows().filter((row) => trim(row?.current_timesheet_id || row?.timesheet_id || row?.requested_timesheet_id));
      if (!rows.length) return Promise.resolve({ applied: false, reason: 'no-timesheet-rows' });
      const epoch = ++this.badgeHydrationEpoch;
      this.badgeHydrationDatasetRef = datasetRef;
      this.state.__bulk_authorise_badge_hydration_complete = false;
      this.state.__bulk_authorise_badge_hydration_pending = true;
      this.prepareDatasetBadgeHydration(rows);

      const work = (async () => {
        let cursor = 0;
        let succeeded = 0;
        let failed = 0;
        const worker = async () => {
          while (datasetRef === this.datasetRef && epoch === this.badgeHydrationEpoch) {
            const index = cursor;
            cursor += 1;
            if (index >= rows.length) return;
            const row = rows[index];
            const identity = rowKeyOf(row);
            const ok = await this.hydrateDatasetBadgeRow(row, datasetRef, epoch);
            if (datasetRef !== this.datasetRef || epoch !== this.badgeHydrationEpoch) return;
            if (ok) {
              succeeded += 1;
            } else {
              failed += 1;
              const initial = clone(this.datasetInitialBadgeTruth.get(identity) || null);
              if (initial) {
                this.datasetBadgeTruth.set(identity, clone(initial));
                this.writeDatasetBadgeState(identity, initial, { restoreArtifactHints: true });
              }
              this.datasetPendingBadgeIdentities.delete(identity);
            }
            void this.scheduleDatasetBadgeHydrationRender(datasetRef, epoch, ok ? 'row-verified' : 'row-failed');
          }
        };
        await Promise.all(Array.from({ length: Math.min(4, rows.length) }, () => worker()));
        if (datasetRef !== this.datasetRef || epoch !== this.badgeHydrationEpoch) return { applied: false, stale: true };

        this.state.__bulk_authorise_badge_hydration_pending = false;
        this.state.__bulk_authorise_badge_hydration_complete = true;
        this.state.__bulk_authorise_badge_hydration_succeeded = succeeded;
        this.state.__bulk_authorise_badge_hydration_failed = failed;
        await this.scheduleDatasetBadgeHydrationRender(datasetRef, epoch, 'complete');
        return { applied: true, succeeded, failed };
      })();
      this.badgeHydrationPromise = work.finally(() => {
        if (datasetRef === this.badgeHydrationDatasetRef) this.badgeHydrationPromise = null;
      });
      return this.badgeHydrationPromise;
    }

    authoritativeEvidence() {
      const state = this.state;
      const context = state.active_context && typeof state.active_context === 'object' ? state.active_context : {};
      const details = state.active_details && typeof state.active_details === 'object' ? state.active_details : {};
      const activeCtx = state.active_ctx && typeof state.active_ctx === 'object' ? state.active_ctx : {};
      const sources = [
        context.evidence,
        context.details?.evidence,
        details.evidence,
        activeCtx.state?.evidence,
        activeCtx.evidence,
        activeCtx.details?.evidence
      ].filter(Array.isArray);
      const profile = trim(
        context.context_profile || context.profile || context.details?.context_profile ||
        details.context_profile || details.profile || activeCtx.context_profile || activeCtx.profile
      ).toLowerCase();
      const authoritative = !!(
        context.evidence_loaded === true || context.details?.evidence_loaded === true ||
        details.evidence_loaded === true || activeCtx.evidence_loaded === true ||
        activeCtx.state?.evidence_loaded === true || profile === 'evidence' || profile === 'full' ||
        sources.some((source) => source.length > 0)
      );
      if (!authoritative) return { authoritative: false, rows: [] };

      const rows = [];
      const seen = new Set();
      for (const source of sources) {
        for (const raw of source) {
          const item = normaliseEvidence(raw);
          if (!item) continue;
          const key = itemKey(item);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          rows.push(item);
        }
      }
      return { authoritative: true, rows };
    }

    clearFalseTimesheetFallback(rows) {
      const state = this.state;
      const primaryKind = upper(
        state.active_row?.primary_artifact_kind ||
        state.active_context?.row?.primary_artifact_kind ||
        state.active_context?.data_row?.primary_artifact_kind
      );
      const primaryStorage = cleanFileKey(
        state.active_row?.primary_artifact_storage_key ||
        state.active_context?.row?.primary_artifact_storage_key ||
        state.active_context?.data_row?.primary_artifact_storage_key
      );
      if (!primaryStorage || primaryKind === 'TIMESHEET') return;
      const genuineTimesheetUsesPrimary = rows.some((item) => evidenceKindOf(item) === 'TIMESHEET' && evidenceFileKeyOf(item) === primaryStorage);
      if (genuineTimesheetUsesPrimary) return;

      const containers = [
        state.active_row,
        state.active_context,
        state.active_context?.row,
        state.active_context?.data_row,
        state.active_context?.details,
        state.active_context?.details?.timesheet,
        state.active_details,
        state.active_details?.timesheet,
        state.active_ctx,
        state.active_ctx?.row,
        state.active_ctx?.details,
        state.active_ctx?.details?.timesheet,
        state.active_ctx?.state,
        state.active_ctx?.state?.timesheet
      ];
      for (const container of containers) {
        if (!container || typeof container !== 'object') continue;
        if (cleanFileKey(container.manual_pdf_r2_key) === primaryStorage) container.manual_pdf_r2_key = null;
        if (cleanFileKey(container.manualPdfR2Key) === primaryStorage) container.manualPdfR2Key = null;
      }
    }

    applyEvidenceBadges(rows, authoritative) {
      const state = this.state;
      const identity = rowIdentityOf(state);
      if (!identity || !state.active_row) return;

      let badgeState = null;
      if (authoritative) {
        badgeState = {
          evidence_badges: buildBadges(rows),
          has_any_evidence: rows.length > 0,
          attached_evidence_count: rows.length
        };
        this.datasetBadgeTruth.set(identity, clone(badgeState));
      } else {
        badgeState = clone(this.datasetBadgeTruth.get(identity) || null);
      }
      if (!badgeState) return;

      const targets = [state.active_row, state.active_context?.row, state.active_context?.data_row];
      for (const row of this.datasetRows()) {
        if (rowKeyOf(row) === identity) targets.push(row);
      }
      for (const target of targets) {
        if (!target || typeof target !== 'object') continue;
        target.evidence_badges = clone(badgeState.evidence_badges);
        target.has_any_evidence = badgeState.has_any_evidence === true;
        target.attached_evidence_count = Number(badgeState.attached_evidence_count || 0) || 0;
      }
    }

    applyAttachedRows(rows, authoritative) {
      const state = this.state;
      const identity = rowIdentityOf(state);
      if (!identity || !authoritative) return false;
      const pane = state.evidence_pane_state && typeof state.evidence_pane_state === 'object'
        ? state.evidence_pane_state
        : (state.evidence_pane_state = {});
      this.rowsByIdentity.set(identity, rows.map(clone));

      const previousItemKey = itemKey(pane.active_attached_item);
      const rememberedKey = this.selectedByIdentity.get(identity) || '';
      const activeItem = rows.find((item) => itemKey(item) === previousItemKey)
        || rows.find((item) => itemKey(item) === rememberedKey)
        || rows[0]
        || null;
      const activeItemKey = itemKey(activeItem);
      if (activeItemKey) this.selectedByIdentity.set(identity, activeItemKey);
      else this.selectedByIdentity.delete(identity);

      pane.attached_rows = rows.map(clone);
      pane.attached_all_rows = rows.map(clone);
      pane.active_attached_item = activeItem ? clone(activeItem) : null;
      pane.active_attached_id = activeItem ? evidenceIdOf(activeItem) : null;
      pane.__bulk_authorise_evidence_identity = identity;
      pane.__evidence_loaded = true;
      pane.__attached_loaded = true;

      const activeTab = trim(pane.active_tab || 'attached').toLowerCase() === 'queue' ? 'queue' : 'attached';
      if (activeTab === 'attached') {
        pane.active_tab = 'attached';
        pane.active_queue_id = null;
        pane.active_queue_item = null;
        pane.__queue_manual_override = false;
        const nextSelection = selectionKey(activeItem);
        const currentTarget = trim(pane.__preview_target_key);
        const sameSelection = !!(nextSelection && currentTarget === nextSelection && trim(pane.__preview_signed_url));
        if (!sameSelection) {
          pane.__preview_signed_url = '';
          pane.__preview_signed_url_error = '';
          pane.__preview_signed_url_stored_at_ms = 0;
          pane.__preview_signed_url_expires_at_ms = 0;
        }
        pane.__preview_target_key = nextSelection;
        pane.__preview_load_requested_target_key = sameSelection ? nextSelection : '';
        pane.__active_attached_preview_target = nextSelection;
        pane.__preview_attached_request_key = sameSelection ? nextSelection : '';
        pane.__preview_loading = !!nextSelection && !sameSelection;
        pane.__preview_error = '';
      }

      win.modalCtx = win.modalCtx && typeof win.modalCtx === 'object' ? win.modalCtx : {};
      win.modalCtx.timesheetState = win.modalCtx.timesheetState && typeof win.modalCtx.timesheetState === 'object'
        ? win.modalCtx.timesheetState
        : {};
      win.modalCtx.timesheetState.evidence = rows.map(clone);
      return true;
    }

    sanitize(reason = 'sanitize') {
      if (!this.isTimesheets()) return { applied: false, reason: 'non-timesheets' };
      this.captureDatasetTruth();
      const evidence = this.authoritativeEvidence();
      const identity = rowIdentityOf(this.state);
      const rows = evidence.authoritative
        ? evidence.rows
        : (this.rowsByIdentity.get(identity) || []);
      this.clearFalseTimesheetFallback(rows);
      this.applyEvidenceBadges(rows, evidence.authoritative);
      const applied = this.applyAttachedRows(rows, evidence.authoritative);
      this.state.__bulk_authorise_evidence_controller = 'v3';
      this.state.__bulk_authorise_evidence_controller_reason = reason;
      return { applied, authoritative: evidence.authoritative, rows: rows.map(clone) };
    }

    installStateBoundary() {
      const current = this.state && this.state.__runPostRenderBindings;
      if (typeof current !== 'function' || current === this.boundPostRenderBindings) return;
      this.basePostRenderBindings = current;
      const controller = this;
      this.boundPostRenderBindings = async function bulkAuthoriseEvidencePostRenderBoundary(...args) {
        controller.sanitize('before-post-render-bindings');
        const result = await controller.basePostRenderBindings.apply(this, args);
        controller.sanitize('after-post-render-bindings');
        controller.stamp();
        const pane = controller.state && controller.state.evidence_pane_state ? controller.state.evidence_pane_state : {};
        if (trim(pane.active_tab).toLowerCase() === 'attached') {
          controller.scheduleTerminalGuard(rowIdentityOf(controller.state), selectionKey(pane.active_attached_item));
        }
        return result;
      };
      this.state.__runPostRenderBindings = this.boundPostRenderBindings;
    }

    settle(reason = 'settle') {
      this.installStateBoundary();
      this.sanitize(reason);
      this.stamp();
      const pane = this.state && this.state.evidence_pane_state ? this.state.evidence_pane_state : {};
      if (trim(pane.active_tab).toLowerCase() === 'attached') {
        this.scheduleTerminalGuard(rowIdentityOf(this.state), selectionKey(pane.active_attached_item));
      }
    }

    stamp() {
      const root = doc && doc.getElementById('bulkAuthoriseWorkbenchRoot');
      if (!root) return;
      const liveController = controllerFor(win.modalCtx && win.modalCtx.bulkAuthoriseState) || this;
      root.dataset.bulkAuthoriseEvidenceController = 'v3';
      if (liveController.isTimesheets()) {
        liveController.sanitize('stamp-live-boundary');
        liveController.renderAttachedSelection();
        liveController.schedulePostRenderSettle();
        void liveController.ensureAttachedPreview(false);
      }
      if (typeof win.MutationObserver === 'function' && root.__bulkAuthoriseEvidenceObserver == null) {
        root.__bulkAuthoriseEvidenceObserver = new win.MutationObserver(() => {
          const currentState = win.modalCtx && win.modalCtx.bulkAuthoriseState;
          const currentController = controllerFor(currentState);
          if (!currentController || !currentController.isLive()) return;
          const pane = currentState.evidence_pane_state || {};
          currentController.renderAttachedSelection();
          if (trim(pane.active_tab).toLowerCase() !== 'attached') return;
          currentController.sanitize('modal-dom-settle');
          const stage = doc.getElementById('bulkProcessPreviewStage');
          if (trim(pane.__preview_signed_url)) {
            if (stage && /loading/i.test(trim(stage.textContent))) {
              currentController.renderResolvedPreview(pane.active_attached_item, trim(pane.__preview_signed_url));
            }
          } else if (!currentController.previewRequestPromise) {
            void currentController.ensureAttachedPreview(false);
          }
        });
        root.__bulkAuthoriseEvidenceObserver.observe(root, { childList: true, subtree: true });
      }
      if (root.__bulkAuthoriseEvidenceController === this) return;
      root.__bulkAuthoriseEvidenceController = this;
      root.addEventListener('click', (event) => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function' || !this.isTimesheets()) return;
        const retry = target.closest('[data-bulk-authorise-preview-retry="1"]');
        if (retry) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void this.retryAttached();
          return;
        }
        const thumbnail = target.closest('[data-bp-preview-attached-thumb="1"]');
        if (thumbnail && !target.closest('[data-bp-preview-attached-remove="1"]')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void this.selectFromButton(thumbnail);
          return;
        }
        if (target.closest('#bulkProcessEvidenceTabQueue')) {
          this.rememberAttachedSelection();
          return;
        }
        if (target.closest('#bulkProcessEvidenceTabAttached')) {
          this.rememberAttachedSelection();
          this.sanitize('return-attached-tab');
        }
      }, true);
    }

    rememberAttachedSelection() {
      const identity = rowIdentityOf(this.state);
      const pane = this.state.evidence_pane_state || {};
      const key = itemKey(pane.active_attached_item);
      if (identity && key) this.selectedByIdentity.set(identity, key);
    }

    selectAttached(item, reason = 'thumbnail') {
      const state = this.state;
      const identity = rowIdentityOf(state);
      const normalised = normaliseEvidence(item);
      if (!identity || !normalised) return Promise.resolve(false);
      const rows = this.rowsByIdentity.get(identity) || [];
      const chosen = rows.find((row) => itemKey(row) === itemKey(normalised)) || normalised;
      const pane = state.evidence_pane_state && typeof state.evidence_pane_state === 'object'
        ? state.evidence_pane_state
        : (state.evidence_pane_state = {});
      const target = selectionKey(chosen);
      this.selectedByIdentity.set(identity, itemKey(chosen));
      this.selectionEpoch += 1;
      this.pendingGuardKey = '';
      this.lastPointerSelectionKey = target;
      pane.active_tab = 'attached';
      pane.__attached_manual_override = true;
      pane.__queue_manual_override = false;
      pane.active_queue_id = null;
      pane.active_queue_item = null;
      pane.active_attached_id = evidenceIdOf(chosen);
      pane.active_attached_item = clone(chosen);
      pane.active_attached_pdf_page = 1;
      pane.__active_attached_preview_target = target;
      pane.__preview_target_key = target;
      pane.__preview_load_requested_target_key = '';
      pane.__preview_attached_request_key = '';
      pane.__preview_signed_url = '';
      pane.__preview_signed_url_error = '';
      pane.__preview_signed_url_stored_at_ms = 0;
      pane.__preview_signed_url_expires_at_ms = 0;
      pane.__preview_loading = true;
      pane.__preview_error = '';
      pane.__bulk_authorise_evidence_selection_epoch = this.selectionEpoch;

      this.sanitize(`select-attached:${reason}`);
      this.renderAttachedSelection();
      this.stamp();
      return this.ensureAttachedPreview(true).then(() => true);
    }

    selectFromButton(button) {
      const identity = rowIdentityOf(this.state);
      const rows = this.rowsByIdentity.get(identity) || [];
      const requestedSelection = trim(button.getAttribute('data-attached-selection-key'));
      const requestedId = trim(button.getAttribute('data-attached-id'));
      const requestedFile = cleanFileKey(button.getAttribute('data-file-key') || button.getAttribute('data-storage-key'));
      let item = rows.find((row) => selectionKey(row) === requestedSelection) || null;
      if (!item && (requestedId || requestedFile)) {
        item = rows.find((row) => (
          (!requestedId || evidenceIdOf(row) === requestedId) &&
          (!requestedFile || evidenceFileKeyOf(row) === requestedFile)
        )) || null;
      }
      if (!item && doc) {
        const buttons = Array.from(doc.querySelectorAll('#bulkAuthoriseWorkbenchRoot [data-bp-preview-attached-thumb="1"]'));
        const index = buttons.indexOf(button);
        if (index >= 0) item = rows[index] || null;
      }
      return item ? this.selectAttached(item, 'thumbnail') : Promise.resolve(false);
    }

    retryAttached() {
      const identity = rowIdentityOf(this.state);
      const rows = this.rowsByIdentity.get(identity) || [];
      const selected = this.selectedByIdentity.get(identity) || '';
      const item = rows.find((row) => itemKey(row) === selected) || rows[0] || null;
      return item ? this.selectAttached(item, 'retry') : Promise.resolve(false);
    }

    navigateAttached(delta) {
      const pane = this.state.evidence_pane_state || {};
      if (trim(pane.active_tab).toLowerCase() !== 'attached') return Promise.resolve(false);
      const identity = rowIdentityOf(this.state);
      const rows = this.rowsByIdentity.get(identity) || [];
      const activeKey = itemKey(pane.active_attached_item) || this.selectedByIdentity.get(identity) || '';
      const index = rows.findIndex((row) => itemKey(row) === activeKey);
      const nextIndex = index + Number(delta || 0);
      const next = index >= 0 && nextIndex >= 0 && nextIndex < rows.length ? rows[nextIndex] : null;
      return next ? this.selectAttached(next, 'navigation') : Promise.resolve(false);
    }

    renderAttachedSelection() {
      if (!doc || typeof doc.querySelectorAll !== 'function') return;
      const pane = this.state.evidence_pane_state || {};
      const active = selectionKey(pane.active_attached_item);
      const buttons = doc.querySelectorAll('#bulkAuthoriseWorkbenchRoot [data-bp-preview-attached-thumb="1"]');
      const identity = rowIdentityOf(this.state);
      const rows = this.rowsByIdentity.get(identity) || [];
      let index = 0;
      for (const button of buttons) {
        const item = rows[index] || null;
        index += 1;
        const buttonSelection = selectionKey(item) || trim(button.getAttribute('data-attached-selection-key'));
        if (item) {
          try { button.setAttribute('data-attached-selection-key', buttonSelection); } catch {}
          try { button.setAttribute('data-file-key', evidenceFileKeyOf(item)); } catch {}
          try { button.setAttribute('data-storage-key', evidenceFileKeyOf(item)); } catch {}
        }
        const selected = !!buttonSelection && buttonSelection === active;
        if (button.__bulkAuthoriseEvidencePointerBound !== true) {
          button.__bulkAuthoriseEvidencePointerBound = true;
          button.addEventListener('pointerdown', (event) => {
            const currentState = win.modalCtx && win.modalCtx.bulkAuthoriseState;
            const currentController = controllerFor(currentState);
            if (!currentController || !currentController.isTimesheets()) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            void currentController.selectFromButton(button);
          }, true);
        }
        try { button.setAttribute('aria-pressed', selected ? 'true' : 'false'); } catch {}
        try { button.setAttribute('aria-selected', selected ? 'true' : 'false'); } catch {}
        try { button.classList.toggle('is-active', selected); } catch {}
        try { button.classList.toggle('active', selected); } catch {}
        try { button.classList.toggle('selected', selected); } catch {}
        try { button.style.border = selected ? '2px solid var(--accent,#6ea8fe)' : '1px solid var(--line)'; } catch {}
        try { button.style.background = selected ? 'rgba(110,168,254,0.12)' : 'var(--panel,#0f1115)'; } catch {}
      }
      const root = doc.getElementById('bulkAuthoriseWorkbenchRoot');
      const canQueryRoot = root && typeof root.querySelectorAll === 'function';
      for (const [buttonId, delta] of [['bpQueuePrevBtn', -1], ['bpQueueNextBtn', 1]]) {
        const navButton = doc.getElementById(buttonId);
        if (!navButton || navButton.__bulkAuthoriseAttachedNavigationBound === true) continue;
        navButton.__bulkAuthoriseAttachedNavigationBound = true;
        navButton.addEventListener('click', (event) => {
          const currentState = win.modalCtx && win.modalCtx.bulkAuthoriseState;
          const currentController = controllerFor(currentState);
          const currentPane = currentState && currentState.evidence_pane_state ? currentState.evidence_pane_state : {};
          const queueTab = doc.getElementById('bulkProcessEvidenceTabQueue');
          const queueIsVisiblySelected = !!(
            queueTab && (
              trim(queueTab.getAttribute?.('aria-selected')).toLowerCase() === 'true' ||
              queueTab.classList?.contains?.('is-active') ||
              queueTab.classList?.contains?.('active')
            )
          );
          if (
            queueIsVisiblySelected ||
            !currentController ||
            !currentController.isTimesheets() ||
            trim(currentPane.active_tab).toLowerCase() !== 'attached'
          ) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          void currentController.navigateAttached(delta);
        }, true);
      }
      for (const queueTab of (canQueryRoot ? root.querySelectorAll('[id="bulkProcessEvidenceTabQueue"]') : [])) {
        if (queueTab.__bulkAuthoriseEvidencePointerBound !== true) {
          queueTab.__bulkAuthoriseEvidencePointerBound = true;
          queueTab.addEventListener('pointerdown', () => {
            const currentState = win.modalCtx && win.modalCtx.bulkAuthoriseState;
            const currentController = controllerFor(currentState);
            if (currentController && currentController.isTimesheets()) currentController.rememberAttachedSelection();
          }, true);
        }
      }
      for (const attachedTab of (canQueryRoot ? root.querySelectorAll('[id="bulkProcessEvidenceTabAttached"]') : [])) {
        if (attachedTab.__bulkAuthoriseEvidencePointerBound !== true) {
          attachedTab.__bulkAuthoriseEvidencePointerBound = true;
          attachedTab.addEventListener('pointerdown', () => {
            const currentState = win.modalCtx && win.modalCtx.bulkAuthoriseState;
            const currentController = controllerFor(currentState);
            if (!currentController || !currentController.isTimesheets()) return;
            currentController.rememberAttachedSelection();
            currentController.scheduleAttachedReturn();
          }, true);
        }
      }
    }

    renderPreviewLoading() {
      const stage = doc && doc.getElementById('bulkProcessPreviewStage');
      if (!stage || typeof doc.createElement !== 'function') return;
      const holder = doc.createElement('div');
      holder.style.cssText = 'min-height:220px;display:flex;align-items:center;justify-content:center;text-align:center;';
      const message = doc.createElement('div');
      message.className = 'mini';
      message.textContent = 'Preview is loading…';
      holder.appendChild(message);
      stage.replaceChildren(holder);
    }

    renderPreviewError(message = 'The preview could not be prepared.') {
      const stage = doc && doc.getElementById('bulkProcessPreviewStage');
      if (!stage || typeof doc.createElement !== 'function') return;
      const holder = doc.createElement('div');
      holder.style.cssText = 'min-height:220px;display:flex;align-items:center;justify-content:center;text-align:center;';
      const inner = doc.createElement('div');
      const copy = doc.createElement('div');
      copy.className = 'mini';
      copy.style.opacity = '.85';
      copy.textContent = message;
      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-outline';
      retry.dataset.bulkAuthorisePreviewRetry = '1';
      retry.style.marginTop = '8px';
      retry.textContent = 'Retry preview';
      retry.addEventListener('pointerdown', (event) => {
        const currentState = win.modalCtx && win.modalCtx.bulkAuthoriseState;
        const currentController = controllerFor(currentState);
        if (!currentController || !currentController.isTimesheets()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void currentController.retryAttached();
      }, true);
      inner.append(copy, retry);
      holder.appendChild(inner);
      stage.replaceChildren(holder);
    }

    renderResolvedPreview(item, signedUrl) {
      const stage = doc && doc.getElementById('bulkProcessPreviewStage');
      if (!stage || typeof doc.createElement !== 'function' || !trim(signedUrl)) return false;
      const fileKey = evidenceFileKeyOf(item);
      const mime = trim(item && (item.mime_type || item.content_type)).toLowerCase();
      const isPdf = mime.includes('pdf') || /\.pdf(?:$|[?#])/i.test(fileKey);
      stage.replaceChildren();
      if (isPdf) {
        const frame = doc.createElement('iframe');
        frame.id = 'bulkProcessPdfPreviewFrame';
        frame.title = trim(item && (item.display_name || item.filename)) || 'Evidence preview';
        frame.src = `${signedUrl}#page=1&zoom=page-width`;
        frame.style.cssText = 'width:100%;min-height:460px;border:0;background:#fff;';
        stage.appendChild(frame);
      } else {
        const image = doc.createElement('img');
        image.id = 'bulkProcessImagePreviewEl';
        image.alt = trim(item && (item.display_name || item.filename)) || 'Evidence preview';
        image.src = signedUrl;
        image.style.cssText = 'display:block;max-width:100%;max-height:640px;margin:0 auto;object-fit:contain;';
        stage.appendChild(image);
      }
      return true;
    }

    ensureAttachedPreview(force = false) {
      if (!this.isLive()) return Promise.resolve(false);
      const state = this.state;
      const pane = state.evidence_pane_state || {};
      if (trim(pane.active_tab || 'attached').toLowerCase() !== 'attached') return Promise.resolve(false);
      const identity = rowIdentityOf(state);
      const rows = this.rowsByIdentity.get(identity) || [];
      const remembered = this.selectedByIdentity.get(identity) || '';
      const item = rows.find((row) => itemKey(row) === remembered)
        || rows.find((row) => itemKey(row) === itemKey(pane.active_attached_item))
        || rows[0]
        || null;
      const target = selectionKey(item);
      const fileKey = evidenceFileKeyOf(item);
      if (!identity || !target || !fileKey) return Promise.resolve(false);
      if (!force && trim(pane.__preview_target_key) === target && trim(pane.__preview_signed_url)) {
        const stage = doc && doc.getElementById('bulkProcessPreviewStage');
        const resolved = stage && stage.querySelector('#bulkProcessImagePreviewEl, #bulkProcessPdfPreviewFrame');
        if (!resolved || /loading/i.test(trim(stage.textContent))) {
          this.renderResolvedPreview(item, trim(pane.__preview_signed_url));
        }
        return Promise.resolve(true);
      }
      const requestKey = `${identity}|${target}`;
      if (!force && this.previewRequestKey === requestKey && this.previewRequestPromise) return this.previewRequestPromise;
      try { this.previewAbortController?.abort?.(); } catch {}
      const abortController = typeof win.AbortController === 'function' ? new win.AbortController() : null;
      this.previewAbortController = abortController;
      this.previewRequestKey = requestKey;
      pane.active_attached_id = evidenceIdOf(item);
      pane.active_attached_item = clone(item);
      pane.__preview_target_key = target;
      pane.__active_attached_preview_target = target;
      pane.__preview_load_requested_target_key = target;
      pane.__preview_attached_request_key = target;
      pane.__preview_signed_url = '';
      pane.__preview_loading = true;
      pane.__preview_error = '';
      this.renderPreviewLoading();

      const authFetch = win.authFetch;
      const brokerBaseUrl = trim(win.BROKER_BASE_URL).replace(/\/$/, '');
      const endpoint = brokerBaseUrl ? `${brokerBaseUrl}/api/files/presign-download` : '';
      if (typeof authFetch !== 'function' || !endpoint) {
        this.scheduleTerminalGuard(identity, target);
        this.previewRequestKey = '';
        return Promise.resolve(false);
      }
      const body = {
        key: fileKey,
        owner_kind: 'bulk_authorise',
        owner_identity: trim(state.__bulkAuthoriseRecordIdentity || identity) || null,
        row_key: trim(state.active_row_key || state.active_row?.row_key) || null,
        row_change_seq: Number(state.__bulk_authorise_row_change_seq || 0) || null,
        active_tab: 'attached',
        selection_key: target,
        file_key: fileKey,
        item_id: evidenceIdOf(item) || null
      };
      const work = (async () => {
        try {
          const response = await authFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            ...(abortController ? { signal: abortController.signal } : {})
          });
          const text = await response.text().catch(() => '');
          if (!response.ok) throw new Error('The preview request failed.');
          const payload = text ? JSON.parse(text) : {};
          const signedUrl = trim(payload.signed_url || payload.url || payload.download_url);
          if (!signedUrl) throw new Error('The preview request returned no file URL.');
          const livePane = state.evidence_pane_state || {};
          if (!this.isLive() || rowIdentityOf(state) !== identity || trim(livePane.active_tab).toLowerCase() !== 'attached' || trim(livePane.__preview_target_key) !== target) return false;
          livePane.__preview_signed_url = signedUrl;
          livePane.__preview_signed_url_stored_at_ms = Date.now();
          livePane.__preview_loading = false;
          livePane.__preview_error = '';
          this.pendingGuardKey = '';
          return this.renderResolvedPreview(item, signedUrl);
        } catch (error) {
          if (abortController?.signal?.aborted) return false;
          const livePane = state.evidence_pane_state || {};
          if (this.isLive() && rowIdentityOf(state) === identity && trim(livePane.__preview_target_key) === target) {
            livePane.__preview_loading = false;
            livePane.__preview_error = 'The preview could not be prepared.';
            livePane.__preview_signed_url_error = 'The preview could not be prepared.';
            this.renderPreviewError();
          }
          return false;
        } finally {
          if (this.previewRequestKey === requestKey) {
            this.previewRequestKey = '';
            this.previewRequestPromise = null;
          }
        }
      })();
      this.previewRequestPromise = work;
      return work;
    }

    schedulePostRenderSettle() {
      if (typeof win.setTimeout !== 'function') return;
      const epoch = ++this.postRenderSettleEpoch;
      for (const delay of [0, 250, 1000]) {
        win.setTimeout(() => {
          if (epoch !== this.postRenderSettleEpoch || !this.isLive()) return;
          this.sanitize(`post-render-settle:${delay}`);
          this.renderAttachedSelection();
          const pane = this.state.evidence_pane_state || {};
          const stage = doc.getElementById('bulkProcessPreviewStage');
          if (trim(pane.active_tab).toLowerCase() !== 'attached') return;
          if (trim(pane.__preview_signed_url) && stage && /loading/i.test(trim(stage.textContent))) {
            this.renderResolvedPreview(pane.active_attached_item, trim(pane.__preview_signed_url));
          } else if (!trim(pane.__preview_signed_url) && !this.previewRequestPromise) {
            void this.ensureAttachedPreview(false);
          }
        }, delay);
      }
    }

    scheduleAttachedReturn() {
      if (typeof win.setTimeout !== 'function') return;
      for (const delay of [0, 100, 500]) {
        win.setTimeout(() => {
          if (!this.isLive()) return;
          const pane = this.state.evidence_pane_state || {};
          if (trim(pane.active_tab).toLowerCase() !== 'attached') return;
          this.sanitize(`return-attached-settle:${delay}`);
          this.renderAttachedSelection();
          void this.ensureAttachedPreview(false);
        }, delay);
      }
    }

    scheduleTerminalGuard(identity, target) {
      if (!identity || !target) return;
      const guardKey = `${identity}|${target}`;
      if (this.pendingGuardKey === guardKey) return;
      this.pendingGuardKey = guardKey;
      const epoch = ++this.guardEpoch;
      if (typeof win.setTimeout !== 'function') return;
      win.setTimeout(() => {
        if (epoch !== this.guardEpoch || !this.isLive()) { if (this.pendingGuardKey === guardKey) this.pendingGuardKey = ''; return; }
        const pane = this.state.evidence_pane_state || {};
        if (rowIdentityOf(this.state) !== identity || trim(pane.active_tab).toLowerCase() !== 'attached') { if (this.pendingGuardKey === guardKey) this.pendingGuardKey = ''; return; }
        if (trim(pane.__preview_target_key) !== target || trim(pane.__preview_signed_url)) { if (this.pendingGuardKey === guardKey) this.pendingGuardKey = ''; return; }
        const stage = doc.getElementById('bulkProcessPreviewStage');
        if (!stage || !/loading/i.test(trim(stage.textContent))) { if (this.pendingGuardKey === guardKey) this.pendingGuardKey = ''; return; }
        pane.__preview_loading = false;
        pane.__preview_error = 'The preview could not be prepared.';
        pane.__preview_signed_url_error = 'The preview could not be prepared.';
        stage.innerHTML = '<div style="min-height:220px;display:flex;align-items:center;justify-content:center;text-align:center;"><div><div class="mini" style="opacity:.85;">The preview could not be prepared.</div><button type="button" class="btn btn-outline" data-bulk-authorise-preview-retry="1" style="margin-top:8px;">Retry preview</button></div></div>';
        if (this.pendingGuardKey === guardKey) this.pendingGuardKey = '';
      }, 10000);
    }
  }

  const controllerFor = (state) => {
    if (!state || typeof state !== 'object') return null;
    let controller = controllers.get(state);
    if (!controller) {
      controller = new BulkAuthoriseEvidenceController(state);
      controllers.set(state, controller);
    }
    return controller;
  };

  if (typeof legacy.open === 'function') {
    win.openBulkAuthoriseWorkbench = async function openBulkAuthoriseWorkbenchWithEvidenceController(...args) {
      const state = await legacy.open.apply(this, args);
      const controller = controllerFor(state);
      if (controller) {
        controller.settle('after-open');
        void controller.hydrateDatasetBadges();
      }
      return state;
    };
  }

  if (typeof legacy.renderShell === 'function') {
    win.renderBulkAuthoriseShell = function renderBulkAuthoriseShellWithEvidenceController(state, ...args) {
      const controller = controllerFor(state);
      if (controller) {
        controller.installStateBoundary();
        controller.sanitize('before-shell-render');
        void controller.hydrateDatasetBadges();
      }
      return legacy.renderShell.call(this, state, ...args);
    };
  }

  if (typeof legacy.refreshContext === 'function') {
    win.refreshBulkAuthoriseActiveContext = async function refreshBulkAuthoriseContextWithEvidenceController(state, ...args) {
      const result = await legacy.refreshContext.call(this, state, ...args);
      const controller = controllerFor(state);
      if (controller) {
        controller.installStateBoundary();
        controller.sanitize('after-context-refresh');
      }
      return result;
    };
  }

  if (typeof legacy.reconcileEvidence === 'function') {
    win.reconcileBulkProcessEvidenceStateAfterContextRefresh = function reconcileEvidenceWithBulkAuthoriseIsolation(state, ...args) {
      const result = legacy.reconcileEvidence.call(this, state, ...args);
      if (state && win.modalCtx?.bulkAuthoriseState === state && classificationOf(state) === 'TIMESHEETS') {
        const controller = controllerFor(state);
        if (controller) controller.sanitize('after-legacy-reconcile');
      }
      return result;
    };
  }

  if (typeof legacy.bindEvidence === 'function') {
    win.bindBulkAuthoriseEvidencePane = async function bindBulkAuthoriseEvidenceWithController(state, ...args) {
      const controller = controllerFor(state);
      if (controller) controller.sanitize('before-evidence-bind');
      const result = await legacy.bindEvidence.call(this, state, ...args);
      if (controller) controller.sanitize('after-evidence-bind');
      return result;
    };
  }

  if (typeof legacy.bindPreview === 'function') {
    win.bindBulkAuthorisePreviewPane = async function bindBulkAuthorisePreviewWithEvidenceController(state, ...args) {
      const controller = controllerFor(state);
      if (controller) controller.sanitize('before-preview-bind');
      const result = await legacy.bindPreview.call(this, state, ...args);
      if (controller) {
        controller.sanitize('after-preview-bind');
        controller.stamp();
        const pane = state && state.evidence_pane_state ? state.evidence_pane_state : {};
        if (trim(pane.active_tab).toLowerCase() === 'attached') {
          controller.scheduleTerminalGuard(rowIdentityOf(state), selectionKey(pane.active_attached_item));
        }
      }
      return result;
    };
  }

  const handleWindowCapture = (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const root = target.closest('#bulkAuthoriseWorkbenchRoot');
    const state = win.modalCtx && win.modalCtx.bulkAuthoriseState;
    const controller = controllerFor(state);
    if (!root || !controller || !controller.isTimesheets()) return;
    const retry = target.closest('[data-bulk-authorise-preview-retry="1"]');
    const thumbnail = target.closest('[data-bp-preview-attached-thumb="1"]');
    if (target.closest('#bulkProcessEvidenceTabQueue')) {
      controller.rememberAttachedSelection();
      return;
    }
    if (target.closest('#bulkProcessEvidenceTabAttached')) {
      controller.rememberAttachedSelection();
      controller.scheduleAttachedReturn();
      return;
    }
    if (!retry && (!thumbnail || target.closest('[data-bp-preview-attached-remove="1"]'))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (retry) void controller.retryAttached();
    else void controller.selectFromButton(thumbnail);
  };
  if (typeof win.addEventListener === 'function') win.addEventListener('pointerdown', handleWindowCapture, true);

  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const root = target.closest('#bulkAuthoriseWorkbenchRoot');
      const state = win.modalCtx && win.modalCtx.bulkAuthoriseState;
      const controller = controllerFor(state);
      if (!root || !controller || !controller.isTimesheets()) return;

      const retry = target.closest('[data-bulk-authorise-preview-retry="1"]');
      if (retry) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void controller.retryAttached();
        return;
      }

      const thumbnail = target.closest('[data-bp-preview-attached-thumb="1"]');
      if (thumbnail && !target.closest('[data-bp-preview-attached-remove="1"]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void controller.selectFromButton(thumbnail);
        return;
      }

      if (target.closest('#bulkProcessEvidenceTabQueue')) {
        controller.rememberAttachedSelection();
        return;
      }
      if (target.closest('#bulkProcessEvidenceTabAttached')) {
        controller.rememberAttachedSelection();
        controller.sanitize('return-attached-tab');
      }
    }, true);
  }

  if (typeof win.setInterval === 'function' && !win.__bulkAuthoriseEvidenceWatchdog) {
    win.__bulkAuthoriseEvidenceWatchdog = win.setInterval(() => {
      const root = doc && doc.getElementById('bulkAuthoriseWorkbenchRoot');
      const state = win.modalCtx && win.modalCtx.bulkAuthoriseState;
      if (!root || !state || classificationOf(state) !== 'TIMESHEETS') return;
      const controller = controllerFor(state);
      if (!controller || !controller.isLive()) return;
      const pane = state.evidence_pane_state || {};
      controller.renderAttachedSelection();
      if (trim(pane.active_tab).toLowerCase() !== 'attached') return;
      controller.sanitize('lifecycle-watchdog');
      void controller.ensureAttachedPreview(false);
    }, 500);
  }

  win.__bulkAuthoriseEvidenceControllerTest = {
    controllerFor,
    normaliseEvidence,
    itemKey,
    selectionKey,
    positiveBadgeKinds,
    badgeStateFromPayload,
    legacy
  };
})(window);
