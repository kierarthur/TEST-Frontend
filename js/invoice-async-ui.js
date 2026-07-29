(() => {
  'use strict';

  const CAPABILITY_CACHE_KEY = 'cloudtms.invoiceAsyncCapabilities.v8';
  const WATCH_STORAGE_KEY_PREFIX = 'cloudtms.invoiceOperationWatches.v8';
  const LEGACY_WATCH_STORAGE_KEY = 'cloudtms.invoiceOperationWatches.v8';
  const EXPECTED_BACKEND_CONTRACT = 'INVOICE_ASYNC_BACKEND_V8';
  const EXPECTED_DOCUMENT_CONTRACT = 'INVOICE_DOCUMENT_VERSION_ACCESS_V1';
  const SUPPORTED_MEDIA = Object.freeze(['application/pdf', 'image/jpeg', 'image/png']);
  const REQUIRED_FEATURES = Object.freeze([
    'batch_candidate_paging_v2',
    'batch_selection_rules_v2',
    'batch_selection_summary_v2',
    'batch_facets_v2',
    'batch_result_paging_v2',
    'generate_and_view_v2',
    'exact_document_version_access_v1',
    'separate_issue_delivery_state_v2',
    'bounded_viewer_contract_v2'
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
  let activeWatchStorageKey = null;
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

  function invoiceAsyncIdentity() {
    const userId = clean(window.__USER_ID || window.__auth?.user?.id || window.SESSION?.user?.id).toLowerCase();
    const environment = clean(window.location?.host || 'unknown').toLowerCase();
    return UUID_RE.test(userId) ? { environment, user_id: userId } : null;
  }

  function capabilityCacheKey() {
    const identity = invoiceAsyncIdentity();
    return identity
      ? `${CAPABILITY_CACHE_KEY}:${identity.environment}:${identity.user_id}`
      : null;
  }

  function operationWatchStorageKey() {
    const identity = invoiceAsyncIdentity();
    return identity
      ? `${WATCH_STORAGE_KEY_PREFIX}:${identity.environment}:${identity.user_id}`
      : null;
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
    if (source.database_contract_ready !== true || source.deployment_contract_ready !== true) {
      throw new Error('INVOICE_ASYNC_DEPLOYMENT_CONTRACT_MISMATCH');
    }
    return Object.freeze({
      available: true,
      contract_version: backendContract,
      backend_contract_version: backendContract,
      database_contract_ready: true,
      deployment_contract_ready: true,
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
      database_contract_ready: false,
      deployment_contract_ready: false,
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
      const envelope = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (!envelope || clean(envelope.cache_version) !== 'V8') return null;
      if (Date.parse(envelope.expires_at_utc) <= Date.now()) return null;
      return validateInvoiceAsyncCapabilities(envelope.capabilities);
    } catch {
      return null;
    }
  }

  function cacheInvoiceAsyncCapabilities(capabilities) {
    try {
      const key = capabilityCacheKey();
      if (key) {
        if (capabilities?.available === true) {
          sessionStorage.setItem(key, JSON.stringify({
            cache_version: 'V8',
            cached_at_utc: nowIso(),
            expires_at_utc: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            capabilities
          }));
        }
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
    if (options.force === true) {
      try {
        const key = capabilityCacheKey();
        if (key) sessionStorage.removeItem(key);
      } catch {}
    }
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
    const operationId = clean(row.operation_id || row.operationId).toLowerCase();
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
      error_code: upper(row.error_code || row.errorCode || context.error_code) || null,
      error_summary: clean(row.error_summary || row.errorSummary || row.message || context.error_summary) || null,
      retry_available: row.retry_available === true || row.can_retry === true,
      notify: row.notify === true,
      progress: asObject(row.progress || row.progress_summary || context.progress),
      notification_state: asObject(row.notification_state || row.notificationState || context.notification_state),
      modal_identity: clean(row.modal_identity || row.modalIdentity || context.modal_identity) || null,
      command_token: clean(row.command_token || row.commandToken || context.command_token) || null,
      issue_mode: upper(row.issue_mode || row.issueMode || context.issue_mode) || null,
      result_page_revision: clean(row.result_page_revision || row.resultPageRevision || context.result_page_revision) || null,
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
      error_code: incoming.error_code || previous.error_code,
      error_summary: incoming.error_summary || previous.error_summary,
      progress: { ...asObject(previous.progress), ...asObject(incoming.progress) },
      notification_state: { ...asObject(previous.notification_state), ...asObject(incoming.notification_state) },
      issue_mode: incoming.issue_mode || previous.issue_mode,
      result_page_revision: incoming.result_page_revision || previous.result_page_revision,
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
      sessionStorage.removeItem(LEGACY_WATCH_STORAGE_KEY);
      const key = operationWatchStorageKey();
      if (!key) return [];
      return pruneInvoiceOperationWatches(JSON.parse(sessionStorage.getItem(key) || '[]'));
    } catch {
      return [];
    }
  }

  function saveInvoiceOperationWatches(rows) {
    const saved = pruneInvoiceOperationWatches(rows);
    const key = operationWatchStorageKey();
    if (!key) {
      window.__invoiceOperationWatches = [];
      return [];
    }
    try {
      sessionStorage.removeItem(LEGA×xÒÚ$z{-®éÜj×54”ärr’°¢F‡&÷ræWrW'&÷"†F†R—77VVBÆVvÂFö7VÖVçB6ææ÷B&R÷VæVB‚G¶W'&÷$6öFWÒ’æ“°¢Ğ¢F‡&÷ræWrW'&÷"†W'&÷$6öFR“°¢Ğ ¢7–æ2gVæ7F–öâ÷VåF–ÖW6†VWDFö7VÖVçEc‚‡F–ÖW6†VWD–BÂ÷F–öç2Ò·Ò’°¢6öç7B6æöæ–6Ä–BÒ6ÆVâ‡F–ÖW6†VWD–B’çFôÆ÷vW$66R‚“°¢–b‚UT”Eõ$RçFW7B†6æöæ–6Ä–B’’F‡&÷ræWrW'&÷"‚uD”ÔU4„TUEô”Eô”ådÄ”Br“°¢6öç7BÖöFÄ7G‚Ò7F—fT–çfö–6Uf–WvW'2ævWB†6æöæ–6Ä–B’ÇÂ²–çfö–6T7–æ3¢·ÒÓ°¢6öç7B&WF–æVBÒ4ö&¦V7B†ÖöFÄ7G‚æ–çfö–6T7–æ3òçf–WvW%÷&WVW7B“°¢6öç7B6öÖÖæEFö¶VâÒ6ÆVâ†÷F–öç2æ6öÖÖæE÷Fö¶Vâ¢ÇÂ‡&WF–æVBæ÷Vâbb&WF–æVBæVçF—G•ö–BÓÓÒ6æöæ–6Ä–Bò6ÆVâ‡&WF–æVBæ6öÖÖæE÷Fö¶Vâ’¢rr¢ÇÂ7'—Fòç&æFöÕUT”B‚“°¢6öç7B&WVW7E6W&–ÂÒ÷Vå&W&–æt–çfö–6Uf–WvW"€¢ÖöFÄ7G‚À¢uD”ÔU4„TUBrÀ¢6æöæ–6Ä–BÀ¢uD”ÔU4„TUBrÀ¢6öÖÖæEFö¶Và¢“°¢ÆWB&W7öç6S°¢G'’°¢&W7öç6RÒv—Bv–æF÷ræWF„fWF6‚†–çfö–6T’†ö’÷F–ÖW6†VWG2òG¶Væ6öFUU$”6ö×öæVçB†6æöæ–6Ä–B—Ò÷Ff’Â°¢ÖWF†öC¢uõ5BrÀ¢†VFW'3¢²v6öçFVçB×G—Rs¢vÆ–6F–öâö§6öârÂv–FV×÷FVæ7’Ö¶W’s¢6öÖÖæEFö¶VâÒÀ¢&öG“¢¥4ôâç7G&–æv–g’‡²6öÖÖæE÷Fö¶Vã¢6öÖÖæEFö¶VâÂ&–÷&—G•÷&V6öã¢ud”UuôäõrrÒ’À¢6–væÃ¢ÖöFÄ7G‚æ–çfö–6T7–æ2çf–WvW%÷&WVW7Bæ&÷'Eö6öçG&öÆÆW"ç6–væÀ¢Ò“°¢Ò6F6‚†W'&÷"’°¢6öç7Bf–WvW"Ò4ö&¦V7B†ÖöFÄ7G‚æ–çfö–6T7–æ3òçf–WvW%÷&WVW7B“°¢–b‡f–WvW"ç&WVW7E÷6W&–ÂÓÓÒ&WVW7E6W&–Â’°¢f–WvW"çf–WvW%÷7FFRÒt$Äô4´TBs°¢f–WvW"ç7FGW5öÖW76vRÒuF–ÖW6†VWBFö7VÖVçBf–ÆVBs°¢f–WvW"æW'&÷"Ò6ÆVâ†W'&÷#òæÖW76vRÇÂW'&÷"“°¢&W–çD–çfö–6T7–æ5f–WvW"†ÖöFÄ7G‚“°¢Ğ¢F‡&÷rW'&÷#°¢Ğ¢6öç7B–ÆöBÒv—B&W7öç6Ræ§6öâ‚’æ6F6‚‚‚’Óâ‡·Ò’“°¢6öç7Bf–WvW"Ò4ö&¦V7B†ÖöFÄ7G‚æ–çfö–6T7–æ3òçf–WvW%÷&WVW7B“°¢6öç7B7W'&VçE&WVW7BÒf–WvW"æ÷Và¢bbf–WvW"ç&WVW7E÷6W&–ÂÓÓÒ&WVW7E6W&–À¢bbf–WvW"æVçF—G•÷G—RÓÓÒuD”ÔU4„TUBp¢bbf–WvW"æVçF—G•ö–BÓÓÒ6æöæ–6Ä–C°¢–b†6ÆVâ‡–ÆöBæ6öçG&7E÷fW'6–öâ’ÓÒt”ådô”4Uõd”UtU%õc"r’°¢–b†7W'&VçE&WVW7B’°¢f–WvW"çf–WvW%÷7FFRÒt$Äô4´TBs°¢f–WvW"ç7FGW5öÖW76vRÒuF–ÖW6†VWBFö7VÖVçBf–ÆVBs°¢f–WvW"æW'&÷"Òt”ådô”4Uõd”UtU%ô4ôåE$5EôÔ•4ÔD4‚s°¢&W–çD–çfö–6T7–æ5f–WvW"†ÖöFÄ7G‚“°¢Ğ¢F‡&÷ræWrW'&÷"‚t”ådô”4Uõd”UtU%ô4ôåE$5EôÔ•4ÔD4‚r“°¢Ğ¢6öç7Bf–WvW%7FFRÒWW"‡–ÆöBçf–WvW%÷7FFR“°¢6öç7BW'÷6RÒWW"‡–ÆöBçW'÷6RÇÂuD”ÔU4„TUBr“°¢6öç7BfW'6–öä–BÒ6ÆVâ‡–ÆöBæFö7VÖVçE÷fW'6–öãòæ–BÇÂ–ÆöBæFö7VÖVçE÷fW'6–öåö–B’çFôÆ÷vW$66R‚“°¢–b‚7W'&VçE&WVW7B’&WGW&â–ÆöC°¢–b‡W'÷6RÓÒuD”ÔU4„TUBr’°¢f–WvW"çf–WvW%÷7FFRÒt$Äô4´TBs°¢f–WvW"ç7FGW5öÖW76vRÒuF–ÖW6†VWBFö7VÖVçBf–ÆVBs°¢f–WvW"æW'&÷"Òt”ådô”4Uõd”UtU%õU%õ4Uô”ådÄ”Bs°¢&W–çD–çfö–6T7–æ5f–WvW"†ÖöFÄ7G‚“°¢F‡&÷ræWrW'&÷"‚t”ådô”4Uõd”UtU%õU%õ4Uô”ådÄ”Br“°¢Ğ¢f–WvW"çW'÷6RÒW'÷6S°¢–b‡&W7öç6Rç7FGW2ÓÓÒ#bbf–WvW%7FFRÓÓÒu$TE’rbbUT”Eõ$RçFW7B‡fW'6–öä–B’’°¢v—B6ö×ÆWFT–çfö–6T7–æ5f–WvW"†ÖöFÄ7G‚ÂfW'6–öä–BÂ°¢&WVW7E÷6W&–Ã¢&WVW7E6W&–ÂÀ¢VçF—G•ö–C¢6æöæ–6Ä–BÀ¢W'÷6P¢Ò“°¢&WGW&â–ÆöC°¢Ğ¢–b‡&W7öç6Rç7FGW2ÓÓÒ#"bbf–WvW%7FFRÓÓÒu$U$”ärrbbUT”Eõ$RçFW7B†6ÆVâ‡–ÆöBæ÷W&F–öåö–B’’’°¢6öç7B¶÷W&F–öåÒÒ&Vv—7FW$–çfö–6T÷W&F–öåvF6‚‡°¢÷W&F–öåö–C¢–ÆöBæ÷W&F–öåö–BÀ¢÷W&F–öå÷G—S¢ud”UuõD”ÔU4„TUEôDô5TÔTåBrÀ¢VçF—G•÷G—S¢uD”ÔU4„TUBrÀ¢VçF—G•ö–C¢6æöæ–6Ä–BÀ¢W'÷6RÀ¢7FGW3¢uTUTTBrÀ¢†6S¢t%U4”äU55õtõ$²rÀ¢6öÖÖæE÷Fö¶Vã¢6öÖÖæEFö¶VâÀ¢ÖöFÅö–FVçF—G“¢F–ÖW6†VWC¢G¶6æöæ–6Ä–GÖ ¢ÒÂ²&W7öç6UöfÖ–Ç“¢ud”UrrÂW‡Æ–6—Eö÷W&F–öåö–G3¢G'VRÒ“°¢ÖöFÄ7G‚æ–çfö–6T7–æ2çf–WvW%÷&WVW7Bæ÷W&F–öåö–BÒ÷W&F–öãòæ÷W&F–öåö–BÇÂ–ÆöBæ÷W&F–öåö–C°¢ÖöFÄ7G‚æ–çfö–6T7–æ2çf–WvW%÷&WVW7Bç7FGW5öÖW76vRÒ–ÆöBç7FGW5öÖW76vRÇÂu&W&–ærF–ÖW6†VWBs°¢&WGW&â–ÆöC°¢Ğ¢6öç7BW'&÷$6öFRÒ6ÆVâ‡–ÆöBæW'&÷%ö6öFRÇÂ–ÆöBæW'&÷"ÇÂ–ÆöBæÖW76vRÇÂD”ÔU4„TUEôDô5TÔTåEô…EEòG·&W7öç6Rç7FGW7Ö“°¢–b†7W'&VçE&WVW7B’°¢f–WvW"çf–WvW%÷7FFRÒt$Äô4´TBs°¢f–WvW"ç7FGW5öÖW76vRÒ–ÆöBç7FGW5öÖW76vRÇÂuF–ÖW6†VWBFö7VÖVçB&Æö6¶VBs°¢f–WvW"æW'&÷"ÒW'&÷$6öFS°¢&W–çD–çfö–6T7–æ5f–WvW"†ÖöFÄ7G‚“°¢Ğ¢F‡&÷ræWrW'&÷"†W'&÷$6öFR“°¢Ğ ¢7–æ2gVæ7F–öâ†æFÆT–çfö–6TVÖ–Ä7–æ2†ÖöFÄ7G‚Â÷F–öç2Ò·Ò’°¢6öç7B–çfö–6T–BÒ6ÆVâ†ÖöFÄ7Gƒòæ–çfö–6T–BÇÂÖöFÄ7Gƒòæ–çfö–6TFWF–Ãòæ–çfö–6Sòæ–BÇÂÖöFÄ7GƒòæFFòæ–B’çFôÆ÷vW$66R‚“°¢–b‚UT”Eõ$RçFW7B†–çfö–6T–B’’°¢v–æF÷ræÆW'Còâ‚t–çfö–6R–BÖ—76–ærr“°¢&WGW&âçVÆÃ°¢Ğ¢ÖöFÄ7G‚æ–çfö–6T7–æ2Ò4ö&¦V7B†ÖöFÄ7G‚æ–çfö–6T7–æ2“°¢6öç7BW‡Æ–6—E&W6VæBÒ÷F–öç2ç&W6VæBÓÓÒG'VS°¢6öç7B6öÖÖæEFö¶VâÒW‡Æ–6—E&W6VæBÇÂ6ÆVâ†ÖöFÄ7G‚æ–çfö–6T7–æ2æFVÆ—fW'•ö6öÖÖæE÷Fö¶Vâ¢ò7'—Fòç&æFöÕUT”B‚¢¢6ÆVâ†ÖöFÄ7G‚æ–çfö–6T7–æ2æFVÆ—fW'•ö6öÖÖæE÷Fö¶Vâ“°¢6öç7BFVÆ—fW'•Fö¶VâÒW‡Æ–6—E&W6VæBÇÂ6ÆVâ†ÖöFÄ7G‚æ–çfö–6T7–æ2æFVÆ—fW'•÷&WVW7E÷Fö¶Vâ¢ò7'—Fòç&æFöÕUT”B‚¢¢6ÆVâ†ÖöFÄ7G‚æ–çfö–6T7–æ2æFVÆ—fW'•÷&WVW7E÷Fö¶Vâ“°¢–b†6öÖÖæEFö¶VâÓÓÒFVÆ—fW'•Fö¶Vâ’F‡&÷ræWrW'&÷"‚tDTÄ•dU%•õ$UTU5EõDô´Tåô”ådÄ”Br“°¢ÖöFÄ7G‚æ–çfö–6T7–æ2æFVÆ—fW'•ö6öÖÖæE÷Fö¶VâÒ6öÖÖæEFö¶Vã°¢ÖöFÄ7G‚æ–çfö–6T7–æ2æFVÆ—fW'•÷&WVW7E÷Fö¶VâÒFVÆ—fW'•Fö¶Vã°¢6öç7B&öG’Ò°¢6öÖÖæE÷Fö¶Vã¢6öÖÖæEFö¶VâÀ¢FVÆ—fW'•÷&WVW7E÷Fö¶Vã¢FVÆ—fW'•Fö¶Và¢Ó°¢6öç7BFVÆ—fW'’Ò4ö&¦V7B†ÖöFÄ7G‚æ–çfö–6T7–æ2æFVÆ—fW'•ö–çFVçBÇÂÖöFÄ7G‚æFVÆ—fW'•ö–çFVçB“°¢–b†FVÆ—fW'’æFVÆ—fW'•÷öÆ–7’’&öG’æFVÆ—fW'•÷öÆ–7’ÒFVÆ—fW'’æFVÆ—fW'•÷öÆ–7“°¢–b†FVÆ—fW'’ç&V6—–VçE÷6WB’&öG’ç&V6—–VçE÷6WBÒFVÆ—fW'’ç&V6—–VçE÷6WC°¢–b†FVÆ—fW'’æ62’&öG’æ62ÒFVÆ—fW'’æ63°¢–b†FVÆ—fW'’æ&62’&öG’æ&62ÒFVÆ—fW'’æ&63°¢6öç7B&W7öç6RÒv—Bv–æF÷ræWF„fWF6‚†–çfö–6T’†ö’ö–çfö–6W2òG¶Væ6öFUU$”6ö×öæVçB†–çfö–6T–B—ÒöVÖ–Æ’Â°¢ÖWF†öC¢uõ5BrÀ¢†VFW'3¢²v6öçFVçB×G—Rs¢vÆ–6F–öâö§6öârÂv–FV×÷FVæ7’Ö¶W’s¢6öÖÖæEFö¶VâÒÀ¢&öG“¢¥4ôâç7G&–æv–g’†&öG’¢Ò“°¢6öç7B–ÆöBÒv—B&W7öç6Ræ§6öâ‚’æ6F6‚‚‚’Óâ‡·Ò’“°¢–b‚³#Â#"Â#uÒæ–æ6ÇVFW2‡&W7öç6Rç7FGW2’’°¢F‡&÷ræWrW'&÷"‡–ÆöBæW'&÷"ÇÂ–ÆöBæÖW76vRÇÂ”ådô”4UôDTÄ•dU%•ô…EEòG·&W7öç6Rç7FGW7Ö“°¢Ğ¢6öç7B÷W&F–öç2Ò&Vv—7FW$–çfö–6T÷W&F–öç4g&öÕ&W7öç6R‡–ÆöBÂ°¢&W7öç6UöfÖ–Ç“¢tDTÄ•dU%’rÀ¢÷W&F–öå÷G—S¢tDTÄ•dU%ô”ådô”4U2rÀ¢VçF—G•÷G—S¢t”ådô”4RrÀ¢VçF—G•ö–C¢–çfö–6T–BÀ¢W'÷6S¢tDTÄ•dU%’rÀ¢6öÖÖæE÷Fö¶Vã¢6öÖÖæEFö¶VâÀ¢ÖöFÅö–FVçF—G“¢–çfö–6S¢G¶–çfö–6T–GÖÀ¢W‡Æ–6—Eö÷W&F–öåö–G3¢G'VP¢Ò“°¢6öç7B÷W&F–öâÒ÷W&F–öç5³Ó°¢ÖöFÄ7G‚æ–çfö–6T7–æ2æFVÆ—fW'•ö÷W&F–öâÒ÷W&F–öã°¢GF6„÷W&F–öåFô'WGFöç2†÷W&F–öâÂtDTÄ•dU%’r“°¢G'’²v–æF÷råõ÷Fö7Còâ†W‡Æ–6—E&W6VæBòtæWr–çfö–6RFVÆ—fW'’GFV×B†27F'FVBâr¢t–çfö–6RFVÆ—fW'’&W&F–öâ7F'FVBâr“²Ò6F6‚·Ğ¢&WGW&â–ÆöC°¢Ğ ¢gVæ7F–öâVvÖVçD–çfö–6TÖöFÅ&VæFW&W"‚’°¢6öç7B÷&–v–æÂÒv–æF÷rç&VæFW$–çfö–6TÖöFÄ6öçFVçC°¢–b‡G—Vöb÷&–v–æÂÓÒvgVæ7F–öârÇÂ÷&–v–æÂåõö–çfö–6T7–æ5w&VB’&WGW&ã°¢6öç7Bw&VBÒgVæ7F–öâ–çfö–6T7–æ4ÖöFÅ&VæFW&W"†ÖöFÄ7G‚Â–çfö–6TFF’°¢6öç7B‡FÖÂÒ÷&–v–æÂæÇ’‡F†—2Â&wVÖVçG2“°¢6öç7BFWF–ÂÒ4ö&¦V7B†–çfö–6TFFÇÂÖöFÄ7Gƒòæ–çfö–6TFWF–Â“°¢6öç7B7–æ57FFRÒ²ââæFWF–ÂÂââæ4ö&¦V7B†ÖöFÄ7Gƒòæ–çfö–6T7–æ2’Ó°¢&WGW&âG¶‡FÖÇÓÆF—bFFÖ–çfö–6RÖ7–æ2×7FFRÖ†÷7CâG·&VæFW$–çfö–6T7–æ57FFR†7–æ57FFR—ÓÂöF—cæ°¢Ó°¢w&VBåõö–çfö–6T7–æ5w&VBÒG'VS°¢w&VBåõö–çfö–6T7–æ4÷&–v–æÂÒ÷&–v–æÃ°¢v–æF÷rç&VæFW$–çfö–6TÖöFÄ6öçFVçBÒw&VC°¢Ğ ¢7–æ2gVæ7F–öâ–çfö–6T7–æ5Væf–Æ&ÆT7F–öâ†7F–öäæÖRÒçVÆÂÂ&w2ÒµÒ’°¢–b†7F–öäæÖRbbG—Vöbv–æF÷ræ–æ—F–Æ—6T–çfö–6T7–æ5V’ÓÓÒvgVæ7F–öâr’°¢6öç7B6&–Æ—F–W2Òv—Bv–æF÷ræ–æ—F–Æ—6T–çfö–6T7–æ5V’‡²f÷&6S¢G'VRÒ’æ6F6‚‚‚’ÓâçVÆÂ“°¢6öç7B&V6÷fW&VBÒv–æF÷u¶7F–öäæÖUÓ°¢–b€¢6&–Æ—F–W3òæVæ&ÆVEöf÷%÷W6W"ÓÓÒG'VP¢bbG—Vöb&V6÷fW&VBÓÓÒvgVæ7F–öâp¢bb&V6÷fW&VBÓÒVæf–Æ&ÆT–çfö–6T7F–öä†æFÆW'5¶7F–öäæÖUĞ¢’°¢&WGW&â&V6÷fW&VB‚ââæ&w2“°¢Ğ¢Ğ¢6öç7BÖW76vRÒt–çfö–6R&ö6W76–ær—2FV×÷&&–Ç’Væf–Æ&ÆRv†–ÆRF†RæWr–çfö–6R7—7FVÒ—2&V–ærWFFVBâs°¢G'’²v–æF÷råõ÷Fö7Còâ†ÖW76vR“²Ò6F6‚·Ğ¢–b‡G—Vöbv–æF÷råõ÷Fö7BÓÒvgVæ7F–öâr’v–æF÷ræÆW'Còâ†ÖW76vR“°¢&WGW&âçVÆÃ°¢Ğ ¢6öç7BVæf–Æ&ÆT–çfö–6T7F–öä†æFÆW'2Òö&¦V7Bæg&VW¦R‡°¢†æFÆT–çfö–6U&VæFW%Fc¢‚ââæ&w2’Óâ–çfö–6T7–æ5Væf–Æ&ÆT7F–öâ‚v†æFÆT–çfö–6U&VæFW%FbrÂ&w2’À¢†æFÆT–çfö–6TVÖ–Ã¢‚ââæ&w2’Óâ–çfö–6T7–æ5Væf–Æ&ÆT7F–öâ‚v†æFÆT–çfö–6TVÖ–ÂrÂ&w2’À¢÷Vä–çfö–6T&F6„vVæW&FTÖöFÃ¢‚ââæ&w2’Óâ–çfö–6T7–æ5Væf–Æ&ÆT7F–öâ‚v÷Vä–çfö–6T&F6„vVæW&FTÖöFÂrÂ&w2’À¢÷Vä–çfö–6T&F6„—77VTÖöFÃ¢‚ââæ&w2’Óâ–çfö–6T7–æ5Væf–Æ&ÆT7F–öâ‚v÷Vä–çfö–6T&F6„—77VTÖöFÂrÂ&w2’À¢vWEF–ÖW6†VWEFeW&Ã¢‚ââæ&w2’Óâ–çfö–6T7–æ5Væf–Æ&ÆT7F–öâ‚vvWEF–ÖW6†VWEFeW&ÂrÂ&w2’À¢÷VåF–ÖW6†VWEFc¢‚ââæ&w2’Óâ–çfö–6T7–æ5Væf–Æ&ÆT7F–öâ‚v÷VåF–ÖW6†VWEFbrÂ&w2’À¢÷VåF–ÖW6†VWDFö7VÖVçEcƒ¢‚ââæ&w2’Óâ–çfö–6T7–æ5Væf–Æ&ÆT7F–öâ‚v÷VåF–ÖW6†VWDFö7VÖVçEc‚rÂ&w2¢Ò“° ¢gVæ7F–öâ–ç7FÆÄ–çfö–6T7–æ5Væf–Æ&ÆT7F–öç2‚’°¢ö&¦V7Bæ76–vâ‡v–æF÷rÂVæf–Æ&ÆT–çfö–6T7F–öä†æFÆW'2“°¢v–æF÷råõö–çfö–6T7–æ4÷fW'&–FW4–ç7FÆÆVBÒfÇ6S°¢v–æF÷råõö–çfö–6T&F6„ÖöFÄ÷fW'&–FW4–ç7FÆÆVBÒfÇ6S°¢&WGW&âG'VS°¢Ğ ¢gVæ7F–öâ–ç7FÆÄ÷fW'&–FW2‚’°¢–b†–ç7FÆÆVB’&WGW&âG'VS°¢–b‡v–æF÷råõö–çfö–6T7–æ46&–Æ—G“òæVæ&ÆVEöf÷%÷W6W"ÓÒG'VR’&WGW&âfÇ6S°¢VvÖVçD–çfö–6TÖöFÅ&VæFW&W"‚“°¢v–æF÷ræ†æFÆT–çfö–6U&VæFW%FbÒ†æFÆT–çfö–6U&VæFW%Fd7–æ3°¢v–æF÷ræ†æFÆT–çfö–6TVÖ–ÂÒ†æFÆT–çfö–6TVÖ–Ä7–æ3°¢v–æF÷rævWEF–ÖW6†VWEFeW&ÂÒ÷VåF–ÖW6†VWDFö7VÖVçEcƒ°¢v–æF÷ræ÷VåF–ÖW6†VWEFbÒ÷VåF–ÖW6†VWDFö7VÖVçEcƒ°¢v–æF÷ræ÷VåF–ÖW6†VWDFö7VÖVçEc‚Ò÷VåF–ÖW6†VWDFö7VÖVçEcƒ°¢v–æF÷rä–çfö–6T&F6„ÖöFÅcƒòæ–ç7FÆÃòâ‚“°¢GF6„–çfö–6T7–æ4FVÆVvFVD†æFÆW'2‚“°¢6fT–çfö–6T÷W&F–öåvF6†W2†ÆöD–çfö–6T÷W&F–öåvF6†W2‚’“°¢Ç”–çfö–6T7F–öä'WGFöå7FFR†Fö7VÖVçB“°¢‡–G&FUf—6–&ÆUF–ÖW6†VWDWf–FVæ6U&ö6W76–æu7FFW2†Fö7VÖVçB“°¢–ç7FÆÆVBÒG'VS°¢v–æF÷råõö–çfö–6T7–æ4÷fW'&–FW4–ç7FÆÆVBÒG'VS°¢&WGW&âG'VS°¢Ğ ¢gVæ7F–öâVæ–ç7FÆÄ÷fW'&–FW2†÷F–öç2Ò·Ò’°¢6öç7B&V6öâÒ6ÆVâ†÷F–öç2ç&V6öâÇÂv6&–Æ—G’×Væf–Æ&ÆRr’çFôÆ÷vW$66R‚“°¢6öç7B&–÷%vF6„¶W’Ò6ÆVâ†÷F–öç2ç&Wf–÷W5÷vF6…÷7F÷&vUö¶W’ÇÂ7F—fUvF6…7F÷&vT¶W’“°¢f÷"†6öç7BÖöFÄ7G‚öb7F—fT–çfö–6Uf–WvW'2çfÇVW2‚’’°¢6öç7Bf–WvW"Ò4ö&¦V7B†ÖöFÄ7Gƒòæ–çfö–6T7–æ3òçf–WvW%÷&WVW7B“°¢f–WvW"æ÷VâÒfÇ6S°¢G'’²f–WvW"æ&÷'Eö6öçG&öÆÆW#òæ&÷'B‚“²Ò6F6‚·Ğ¢&Wfö¶T–çfö–6T7–æ5f–WvW$&Æö"†ÖöFÄ7G‚“°¢Ğ¢7F—fT–çfö–6Uf–WvW'2æ6ÆV"‚“°¢G'’²v–æF÷rä–çfö–6T&F6„ÖöFÅcƒòæ6Æ÷6Sòâ‚“²Ò6F6‚·Ğ¢FWF6„–çfö–6T7–æ4FVÆVvFVD†æFÆW'2‚“°¢–b‡&Vg&W6…F–ÖW"’6ÆV%F–ÖV÷WB‡&Vg&W6…F–ÖW"“°¢&Vg&W6…F–ÖW"ÒçVÆÃ°¢v–æF÷råõö–çfö–6T÷W&F–öåvF6†W2ÒµÓ°¢–b…²vÆöv÷WBrÂwW6W"×&WÆ6VÖVçBuÒæ–æ6ÇVFW2‡&V6öâ’’°¢G'’°¢–b‡&–÷%vF6„¶W’’6W76–öå7F÷&vRç&VÖ÷fT—FVÒ‡&–÷%vF6„¶W’“°¢6W76–öå7F÷&vRç&VÖ÷fT—FVÒ„ÄTt5•õtD4…õ5Dõ$tUô´U’“°¢Ò6F6‚·Ğ¢7F—fUvF6…7F÷&vT¶W’ÒçVÆÃ°¢Ğ¢–ç7FÆÆVBÒfÇ6S°¢–ç7FÆÄ–çfö–6T7–æ5Væf–Æ&ÆT7F–öç2‚“°¢&WGW&âG'VS°¢Ğ ¢7–æ2gVæ7F–öâ–æ—F–Æ—6T–çfö–6T7–æ5V’†÷F–öç2Ò·Ò’°¢6öç7B&WVW7FVEvF6„¶W’Ò÷W&F–öåvF6…7F÷&vT¶W’‚“°¢–b†7F—fUvF6…7F÷&vT¶W’bb7F—fUvF6…7F÷&vT¶W’ÓÒ&WVW7FVEvF6„¶W’’°¢Væ–ç7FÆÄ÷fW'&–FW2‡°¢&V6öã¢&WVW7FVEvF6„¶W’òwW6W"×&WÆ6VÖVçBr¢vÆöv÷WBrÀ¢&Wf–÷W5÷vF6…÷7F÷&vUö¶W“¢7F—fUvF6…7F÷&vT¶W¢Ò“°¢Ğ¢6öç7B6&–Æ—F–W2Òv—BÆöD–çfö–6T7–æ46&–Æ—F–W2†÷F–öç2“°¢6öç7B&W6öÇfVEvF6„¶W’Ò÷W&F–öåvF6…7F÷&vT¶W’‚“°¢–b‡&WVW7FVEvF6„¶W’ÓÒ&W6öÇfVEvF6„¶W’’°¢Væ–ç7FÆÄ÷fW'&–FW2‡°¢&V6öã¢&W6öÇfVEvF6„¶W’òwW6W"×&WÆ6VÖVçBr¢vÆöv÷WBrÀ¢&Wf–÷W5÷vF6…÷7F÷&vUö¶W“¢7F—fUvF6…7F÷&vT¶W¢Ò“°¢Ğ¢–b†6&–Æ—F–W2æVæ&ÆVEöf÷%÷W6W"ÓÒG'VR’°¢Væ–ç7FÆÄ÷fW'&–FW2‡°¢&V6öã¢&W6öÇfVEvF6„¶W’òv6&–Æ—G’×Væf–Æ&ÆRr¢vÆöv÷WBrÀ¢&Wf–÷W5÷vF6…÷7F÷&vUö¶W“¢7F—fUvF6…7F÷&vT¶W¢Ò“°¢&WGW&â6&–Æ—F–W3°¢Ğ¢7F—fUvF6…7F÷&vT¶W’Ò&W6öÇfVEvF6„¶W“°¢–ç7FÆÄ÷fW'&–FW2‚“°¢&WGW&â6&–Æ—F–W3°¢Ğ ¢ö&¦V7Bæ76–vâ‡v–æF÷rÂ°¢fWF6„–çfö–6T7–æ46&–Æ—F–W2À¢fÆ–FFT–çfö–6T7–æ46&–Æ—F–W2À¢66†T–çfö–6T7–æ46&–Æ—F–W2À¢ÆöD–çfö–6T7–æ46&–Æ—F–W2À¢—4–çfö–6T7–æ5V”Væ&ÆVBÀ¢–æ—F–Æ—6T–çfö–6T7–æ5V’À¢–ç7FÆÄ–çfö–6T7–æ4÷fW'&–FW3¢–ç7FÆÄ÷fW'&–FW2À¢–ç7FÆÄ–çfö–6T7–æ5Væf–Æ&ÆT7F–öç2À¢Væ–ç7FÆÄ–çfö–6T7–æ4÷fW'&–FW3¢Væ–ç7FÆÄ÷fW'&–FW2À¢ÆöD–çfö–6T÷W&F–öåvF6†W2À¢æ÷&ÖÆ—6T–çfö–6T÷W&F–öåvF6‚À¢FVGWÆ–6FT–çfö–6T÷W&F–öåvF6‚À¢'VæT–çfö–6T÷W&F–öåvF6†W2À¢6fT–çfö–6T÷W&F–öåvF6†W2À¢&Vv—7FW$–çfö–6T÷W&F–öåvF6‚À¢W‡G&7D–çfö–6T÷W&F–öå&÷w3¢W‡G&7D÷W&F–öå&÷w2À¢&Vv—7FW$–çfö–6T÷W&F–öç4g&öÕ&W7öç6RÀ¢Ö&´–çfö–6T÷W&F–öä†æFÆVBÀ¢6¶æ÷vÆVFvT–çfö–6T÷W&F–öäæ÷F–f–6F–öâÀ¢'V–ÆD–çfö–6T†V'F&VEvF6†W2À¢Ç”–çfö–6T÷W&F–öåWFFW2À¢&VæFW$–çfö–6T7–æ57FFRÀ¢FW&—fT–çfö–6T7–æ47F–öå7FFRÀ¢&VæFW$–çfö–6U&öw&W75FW‡BÀ¢&VæFW$–çfö–6T÷W&F–öäW'&÷"À¢&VæFW$Fö7VÖVçD76WD&FvRÀ¢Ç”–çfö–6T7F–öä'WGFöå7FFRÀ¢&VæFW%F–ÖW6†VWDWf–FVæ6U&ö6W76–æu7FFRÀ¢‡–G&FUf—6–&ÆUF–ÖW6†VWDWf–FVæ6U&ö6W76–æu7FFW2À¢&WG'”–çfö–6TWf–FVæ6T÷W&F–öâÀ¢7V&Ö—D–çfö–6T÷W&F–öä6öçG&öÂÀ¢÷VäW†7E&VG”Fö7VÖVçBÀ¢&Wfö¶T–çfö–6T7–æ5f–WvW$&Æö"À¢6ö×ÆWFT–çfö–6T7–æ5f–WvW"À¢÷VåF–ÖW6†VWDFö7VÖVçEc‚À¢†æFÆT–çfö–6U&VæFW%Fd7–æ2À¢†æFÆT–çfö–6TVÖ–Ä7–æ0¢Ò“° ¢v–æF÷råõö–çfö–6T7–æ46&–Æ—G’ÒVæf–Æ&ÆT6&–Æ—F–W2‚täõEô”ä•D”Ä•4TBr“°¢–ç7FÆÄ–çfö–6T7–æ5Væf–Æ&ÆT7F–öç2‚“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚wvV†–FRrÂ‚’Óâ°¢f÷"†6öç7BÖöFÄ7G‚öb7F—fT–çfö–6Uf–WvW'2çfÇVW2‚’’°¢&Wfö¶T–çfö–6T7–æ5f–WvW$&Æö"†ÖöFÄ7G‚“°¢G'’²ÖöFÄ7Gƒòæ–çfö–6T7–æ3òçf–WvW%÷&WVW7Còæ&÷'Eö6öçG&öÆÆW#òæ&÷'B‚“²Ò6F6‚·Ğ¢Ğ¢7F—fT–çfö–6Uf–WvW'2æ6ÆV"‚“°¢Ò“°¢6öç7B&Vv–âÒ‚’Óâ°¢òòF†R6&–Æ—G’VæGö–çB—2WF†VçF–6FVBâöâF†R6–væVBÖ÷WBÆöv–âvRÀ¢òòv—Bf÷"&ö÷G7G&‚’gFW"Æöv–â–ç7FVBöb7&VF–ærâW‡V7FVBC¢òò&WVW7BæBæö—7’'&÷w6W"6öç6öÆRVçG'’à¢–b‚6&–Æ—G”66†T¶W’‚’’°¢&WGW&â&öÖ—6Rç&W6öÇfR†66†T–çfö–6T7–æ46&–Æ—F–W2€¢Væf–Æ&ÆT6&–Æ—F–W2‚t”ådô”4Uô5”ä5ôUD„TåD”4DTEõU4U%õ$UT•$TBr¢’“°¢Ğ¢&WGW&â–æ—F–Æ—6T–çfö–6T7–æ5V’‚’æ6F6‚‚‚’ÓâVæf–Æ&ÆT6&–Æ—F–W2‚’“°¢Ó°¢–b†Fö7VÖVçBç&VG•7FFRÓÓÒvÆöF–ærr’°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚tDôÔ6öçFVçDÆöFVBrÂ&Vv–âÂ²öæ6S¢G'VRÒ“°¢ÒVÇ6R°¢VWVTÖ–7&÷F6²†&Vv–â“°¢Ğ§Ò’‚“°