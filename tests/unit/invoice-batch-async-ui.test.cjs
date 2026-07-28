const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..', '..');
const batchSource = fs.readFileSync(path.join(repoRoot, 'js', 'invoice-batch-modal.js'), 'utf8');
const diagnosticSource = fs.readFileSync(path.join(repoRoot, 'js', 'invoice-diagnostic-catalog.js'), 'utf8');
const batchRuntimeSource = `${diagnosticSource}\n${batchSource}`;
const asyncSource = fs.readFileSync(path.join(repoRoot, 'js', 'invoice-async-ui.js'), 'utf8');

function storage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function baseDocument() {
  return {
    readyState: 'loading',
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    createElement: () => ({
      dataset: {},
      classList: { toggle() {} },
      setAttribute() {},
      click() {},
      insertAdjacentElement() {}
    })
  };
}

function loadScript(source, additions = {}) {
  const local = storage();
  const session = storage();
  const document = additions.document || baseDocument();
  const window = {
    location: { host: 'testmode.arthur-rai.co.uk', origin: 'https://testmode.arthur-rai.co.uk' },
    localStorage: local,
    sessionStorage: session,
    document,
    addEventListener() {},
    ...additions.window
  };
  const context = {
    window,
    document,
    localStorage: local,
    sessionStorage: session,
    URL,
    URLSearchParams,
    Blob,
    AbortController,
    Intl,
    Date,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    Promise,
    RegExp,
    Error,
    structuredClone,
    crypto: webcrypto,
    CSS: { escape: value => String(value) },
    setTimeout,
    clearTimeout,
    queueMicrotask: additions.queueMicrotask || (() => {}),
    console
  };
  window.window = window;
  vm.runInNewContext(source, context, { filename: 'invoice-ui.js' });
  return { window, context, local, session };
}

const UUID_A = '42f1f62c-7d11-437e-85b0-7b135be865e3';
const UUID_B = '241fc420-cbb9-4ed5-b92b-fc3c2ae03078';
const UUID_C = '4ed82adf-da4d-4de6-866b-492d06ba1a77';

test('blocked candidates never receive a checkbox while delivery-blocked issue rows remain selectable', () => {
  const { window } = loadScript(batchRuntimeSource);
  const state = window.InvoiceBatchModalV8.createInvoiceBatchModalState('ISSUE');
  const blocked = {
    selection_key: 'blocked',
    invoice_number: 'INV-1',
    selectable: false,
    issue_blocker_codes: ['DOCUMENT_STALE'],
    client_id: UUID_A,
    candidate_ids: [UUID_B]
  };
  const deliveryBlocked = {
    selection_key: 'delivery',
    invoice_number: 'INV-2',
    selectable: true,
    blocked_for_sending: true,
    delivery_blocker_codes: ['DELIVERY_BLOCKED'],
    client_id: UUID_A,
    candidate_ids: [UUID_B]
  };
  const blockedHtml = window.InvoiceBatchModalV8.renderInvoiceBatchRow(blocked, state);
  const deliveryHtml = window.InvoiceBatchModalV8.renderInvoiceBatchRow(deliveryBlocked, state);
  assert.doesNotMatch(blockedHtml, /type="checkbox"/);
  assert.match(deliveryHtml, /type="checkbox"/);
  assert.match(deliveryHtml, /Blocked for sending/);
});

test('eligible not-generated rows remain selectable and show their neutral generation state', () => {
  const { window } = loadScript(batchRuntimeSource);
  const state = window.InvoiceBatchModalV8.createInvoiceBatchModalState('GENERATE');
  const row = {
    selection_key: 'generate:ready',
    selectable: true,
    generation_state: 'NOT_GENERATED',
    client_name: 'TEST client',
    client_id: UUID_A,
    candidate_ids: [UUID_B]
  };
  const html = window.InvoiceBatchModalV8.renderInvoiceBatchRow(row, state);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /Not generated/);
  assert.match(html, /invbatch-badge--neutral/);
  assert.doesNotMatch(html, /invbatch-badge--red[^>]*>Not generated/);
});

test('nested batch groups terminate in candidate rows without treating rows as groups', () => {
  const { window } = loadScript(batchRuntimeSource);
  const state = window.InvoiceBatchModalV8.createInvoiceBatchModalState('GENERATE');
  state.candidate_page = {
    rows: [{
      selection_key: 'scope:nested',
      selectable: true,
      generation_state: 'NOT_GENERATED',
      row_status: 'READY',
      client_id: UUID_A,
      client_name: 'TEST client',
      candidate_ids: [UUID_B],
      candidate_names: ['TEST candidate'],
      week_ending_date: '2026-07-26'
    }]
  };
  const html = window.renderInvoiceBatchGroups(state);
  assert.match(html, /data-selection-key="scope:nested"/);
  assert.match(html, /TEST candidate/);
  assert.match(html, /type="checkbox"/);
});

test('implicit-all selection persists exclusions and later child rules override group rules', () => {
  const { window } = loadScript(batchRuntimeSource);
  const selection = window.InvoiceBatchModalV8.createInvoiceBatchSelectionState();
  const row = {
    selection_key: 'scope:a',
    selectable: true,
    week_ending_date: '2026-07-26',
    client_id: UUID_A,
    candidate_ids: [UUID_B]
  };
  assert.equal(window.InvoiceBatchModalV8.isInvoiceBatchRowSelected(selection, row), true);
  window.InvoiceBatchModalV8.applyInvoiceBatchSelectionRule(
    selection,
    'EXCLUDE',
    { type: 'WEEK', week_ending_date: '2026-07-26' }
  );
  assert.equal(window.InvoiceBatchModalV8.isInvoiceBatchRowSelected(selection, row), false);
  window.InvoiceBatchModalV8.applyInvoiceBatchSelectionRule(
    selection,
    'INCLUDE',
    { type: 'ROW', selection_key: 'scope:a' }
  );
  assert.equal(window.InvoiceBatchModalV8.isInvoiceBatchRowSelected(selection, row), true);
  assert.equal(
    window.InvoiceBatchModalV8.deriveInvoiceBatchGroupSelectionState(
      selection,
      [row],
      { type: 'WEEK', week_ending_date: '2026-07-26' },
      [{
        selector: { type: 'WEEK', week_ending_date: '2026-07-26' },
        eligible_total: 2,
        selected_total: 1,
        state: 'INDETERMINATE',
        has_hidden_override: true
      }]
    ),
    'INDETERMINATE'
  );
});

test('a later hidden descendant rule keeps its parent group indeterminate', () => {
  const { window } = loadScript(batchRuntimeSource);
  const selection = window.InvoiceBatchModalV8.createInvoiceBatchSelectionState();
  const visibleRow = {
    selection_key: 'scope:visible',
    selectable: true,
    week_ending_date: '2026-07-26',
    client_id: UUID_A,
    candidate_ids: [UUID_B]
  };
  window.InvoiceBatchModalV8.applyInvoiceBatchSelectionRule(
    selection,
    'INCLUDE',
    { type: 'WEEK', week_ending_date: '2026-07-26' }
  );
  window.InvoiceBatchModalV8.applyInvoiceBatchSelectionRule(
    selection,
    'EXCLUDE',
    { type: 'WEEK_CLIENT', week_ending_date: '2026-07-26', client_id: UUID_C }
  );
  assert.equal(
    window.InvoiceBatchModalV8.deriveInvoiceBatchGroupSelectionState(
      selection,
      [visibleRow],
      { type: 'WEEK', week_ending_date: '2026-07-26' },
      [{
        selector: { type: 'WEEK', week_ending_date: '2026-07-26' },
        eligible_total: 3,
        selected_total: 2,
        state: 'INDETERMINATE',
        has_hidden_override: true
      }]
    ),
    'INDETERMINATE'
  );
});

test('selection submission uses the locked query and implicit selection contracts', () => {
  const { window } = loadScript(batchRuntimeSource);
  const state = window.InvoiceBatchModalV8.createInvoiceBatchModalState('GENERATE');
  state.snapshot = {
    contract_version: 'INVOICE_BATCH_SNAPSHOT_V2',
    action: 'GENERATE',
    at_utc: '2026-07-26T12:00:00.000Z',
    revision: 7,
    expires_at_utc: '2026-07-26T12:30:00.000Z',
    key_id: 'test-key',
    token: 'opaque'
  };
  state.filter.allow_early = false;
  state.display_mode = 'BLOCKED';
  const contract = window.InvoiceBatchModalV8.buildInvoiceBatchSelectionContract(state);
  assert.equal(contract.contract_version, 'INVOICE_BATCH_SELECTION_ROOT_V2');
  assert.equal(contract.query.contract_version, 'INVOICE_BATCH_QUERY_V2');
  assert.equal(contract.query.action, 'GENERATE');
  assert.deepEqual(JSON.parse(JSON.stringify(contract.query.snapshot)), state.snapshot);
  assert.equal(contract.query.filters.allow_early, false);
  assert.equal(contract.query.filters.display_mode, 'BLOCKED');
  assert.equal(contract.selection.mode, 'IMPLICIT_ALL');
  assert.equal(contract.selection.default_selected, true);
});

test('capabilities reject contract drift and arbitrary UUID objects are not operations', () => {
  const { window } = loadScript(asyncSource);
  const valid = {
    contract_version: 'INVOICE_ASYNC_BACKEND_V8',
    backend_contract_version: 'INVOICE_ASYNC_BACKEND_V8',
    database_contract_ready: true,
    deployment_contract_ready: true,
    pipeline_enabled: true,
    processor_enabled: true,
    enabled_for_user: true,
    controlled_cohort: true,
    scheduled_enabled: false,
    supported_media_types: ['application/pdf', 'image/jpeg', 'image/png'],
    document_view_contract_version: 'INVOICE_DOCUMENT_VERSION_ACCESS_V1',
    heartbeat_supported: true,
    feature_flags: {
      batch_candidate_paging_v2: true,
      batch_selection_rules_v2: true,
      batch_selection_summary_v2: true,
      batch_facets_v2: true,
      batch_result_paging_v2: true,
      generate_and_view_v2: true,
      exact_document_version_access_v1: true,
      separate_issue_delivery_state_v2: true,
      bounded_viewer_contract_v2: true
    }
  };
  assert.equal(window.validateInvoiceAsyncCapabilities(valid).enabled_for_user, true);
  assert.throws(
    () => window.validateInvoiceAsyncCapabilities({
      ...valid,
      supported_media_types: [...valid.supported_media_types, 'image/webp']
    }),
    /INVOICE_ASYNC_MEDIA_CONTRACT_MISMATCH/
  );
  assert.equal(window.normaliseInvoiceOperationWatch({ id: UUID_A, invoice_number: 'INV-1' }), null);
  assert.equal(window.normaliseInvoiceOperationWatch(UUID_A), null);
  assert.equal(
    window.normaliseInvoiceOperationWatch(UUID_A, {
      explicit_operation_ids: true,
      operation_type: 'BATCH_GENERATE',
      purpose: 'BATCH_GENERATE'
    }).operation_id,
    UUID_A
  );
});

test('disabled capability installs unavailable actions and enabled capability installs V8 exactly once', async () => {
  const legacyRender = () => 'legacy-render';
  const legacyEmail = () => 'legacy-email';
  let batchInstalls = 0;
  const { window } = loadScript(asyncSource, {
    window: {
      handleInvoiceRenderPdf: legacyRender,
      handleInvoiceEmail: legacyEmail,
      renderInvoiceModalContent: () => '<div>legacy</div>',
      InvoiceBatchModalV8: { install: () => { batchInstalls += 1; } }
    }
  });
  window.__invoiceAsyncCapability = { enabled_for_user: false };
  assert.equal(window.installInvoiceAsyncOverrides(), false);
  assert.notEqual(window.handleInvoiceRenderPdf, legacyRender);
  assert.notEqual(window.handleInvoiceEmail, legacyEmail);
  assert.equal(await window.handleInvoiceRenderPdf(), null);

  window.__invoiceAsyncCapability = { enabled_for_user: true };
  assert.equal(window.installInvoiceAsyncOverrides(), true);
  assert.notEqual(window.handleInvoiceRenderPdf, legacyRender);
  assert.notEqual(window.handleInvoiceEmail, legacyEmail);
  assert.equal(window.installInvoiceAsyncOverrides(), true);
  assert.equal(batchInstalls, 1);
});

test('document action states expose visible labels, disabled state and ARIA busy semantics', () => {
  const { window } = loadScript(asyncSource);
  const preparing = window.deriveInvoiceAsyncActionState({
    operation_type: 'VIEW_INVOICE_DOCUMENT',
    status: 'RUNNING',
    phase: 'SOURCE_RENDER'
  });
  assert.equal(preparing.tone, 'amber');
  assert.equal(preparing.button_label, 'Preparing PDF…');
  assert.equal(preparing.disabled, true);
  assert.equal(preparing.aria_busy, true);

  const ready = window.deriveInvoiceAsyncActionState({
    operation_type: 'VIEW_INVOICE_DOCUMENT',
    status: 'COMPLETE',
    document_version_id: UUID_A
  });
  assert.equal(ready.tone, 'ready');
  assert.equal(ready.button_label, 'View invoice PDF');
  assert.equal(ready.view_available, true);

  const readyAlias = window.deriveInvoiceAsyncActionState({
    operation_type: 'VIEW_INVOICE_DOCUMENT',
    status: 'READY',
    document_version_id: UUID_A
  });
  assert.equal(readyAlias.tone, 'ready');
  assert.equal(readyAlias.button_label, 'View invoice PDF');
});

test('evidence retry submits only the operation identity through the control route', async () => {
  const calls = [];
  const { window } = loadScript(asyncSource, {
    window: {
      authFetch: async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [{
              operation_id: UUID_A,
              operation_type: 'PREPARE_INVOICE_ASSET',
              status: 'QUEUED',
              change_seq: 9
            }]
          })
        };
      }
    }
  });
  await window.retryInvoiceEvidenceOperation(UUID_A);
  assert.match(calls[0].url, /\/api\/invoice-operations\/control$/);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.contract_version, 'INVOICE_OPERATION_CONTROL_V2');
  assert.equal(body.command_token, body.request_token);
  assert.deepEqual(body.actions, [{ operation_id: UUID_A, action: 'RETRY' }]);
  assert.equal(calls[0].init.headers['idempotency-key'], body.request_token);
  assert.doesNotMatch(calls[0].init.body, /work_key|fence|plan_generation|replacement_payload/);
});

test('capability failure installs unavailable actions rather than legacy processing', async () => {
  const legacyRender = () => 'legacy-render';
  const legacyEmail = () => 'legacy-email';
  const { window } = loadScript(asyncSource, {
    window: {
      handleInvoiceRenderPdf: legacyRender,
      handleInvoiceEmail: legacyEmail,
      authFetch: async () => { throw new Error('offline'); }
    }
  });
  const capability = await window.initialiseInvoiceAsyncUi({ force: true });
  assert.equal(capability.enabled_for_user, false);
  assert.notEqual(window.handleInvoiceRenderPdf, legacyRender);
  assert.notEqual(window.handleInvoiceEmail, legacyEmail);
  assert.equal(window.__invoiceAsyncOverridesInstalled, false);
});

test('operation extraction follows documented paths and ignores arbitrary result objects', () => {
  const { window } = loadScript(asyncSource);
  const rows = window.extractInvoiceOperationRows({
    operation: { operation_id: UUID_A, operation_type: 'BATCH_GENERATE', status: 'RUNNING' },
    children: [{ operation_id: UUID_B, operation_type: 'VIEW_INVOICE_DOCUMENT', status: 'QUEUED' }],
    results: [{ id: '4ed82adf-da4d-4de6-866b-492d06ba1a77', status: 'READY' }],
    invoice: { id: 'a754cb59-c347-4ee1-8f47-43c075e18f3a' }
  });
  assert.equal(
    JSON.stringify([...rows].map(row => row.operation_id).sort()),
    JSON.stringify([UUID_B, UUID_A].sort())
  );
});

test('newer document and issue signals remain in independent modal slots', () => {
  const { window } = loadScript(asyncSource);
  window.modalCtx = {
    invoiceId: UUID_A,
    invoiceDetail: { invoice: { id: UUID_A } },
    invoiceAsync: {}
  };
  window.applyInvoiceOperationUpdates({
    watched_invoice_operations: [{
      operation_id: UUID_B,
      operation_type: 'VIEW_INVOICE_DOCUMENT',
      entity_type: 'INVOICE',
      entity_id: UUID_A,
      status: 'RUNNING',
      phase: 'SOURCE_RENDER',
      change_seq: 2
    }, {
      operation_id: '4ed82adf-da4d-4de6-866b-492d06ba1a77',
      operation_type: 'ISSUE_INVOICES',
      entity_type: 'INVOICE',
      entity_id: UUID_A,
      status: 'RUNNING',
      phase: 'FREEZE',
      change_seq: 3
    }]
  });
  assert.equal(window.modalCtx.invoiceAsync.document_operation.operation_id, UUID_B);
  assert.equal(window.modalCtx.invoiceAsync.issue_operation.operation_type, 'ISSUE_INVOICES');
  assert.equal(window.modalCtx.invoiceAsync.delivery_operation, undefined);

  window.applyInvoiceOperationUpdates({
    watched_invoice_operations: [{
      operation_id: UUID_B,
      operation_type: 'VIEW_INVOICE_DOCUMENT',
      entity_type: 'INVOICE',
      entity_id: UUID_A,
      status: 'QUEUED',
      phase: 'QUEUED',
      change_seq: 1
    }]
  });
  assert.equal(window.modalCtx.invoiceAsync.document_operation.effective_change_seq, 2);
  assert.equal(window.modalCtx.invoiceAsync.document_operation.phase, 'SOURCE_RENDER');
});

test('exact document access sends only the document-version id', async () => {
  const calls = [];
  const { window } = loadScript(asyncSource, {
    window: {
      authFetch: async (url, init) => {
        calls.push({ url, init });
        if (calls.length === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              document_version_id: UUID_A,
              purpose: 'DRAFT_PREVIEW',
              url: `https://test-cloudtms-backend.example/api/invoice-document-versions/${UUID_A}/download?token=opaque`
            })
          };
        }
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(['%PDF-test'], { type: 'application/pdf' })
        };
      }
    }
  });
  const result = await window.openExactReadyDocument(UUID_A, { returnBlobUrl: true });
  assert.match(calls[0].url, new RegExp(`/api/invoice-document-versions/${UUID_A}/presign$`));
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, undefined);
  assert.doesNotMatch(JSON.stringify(calls), /r2_key|ready_key|presign-download/);
  assert.equal(result.document_version_id, UUID_A);
  result.revoke();
});

test('all nine V2 selectors are accepted and GROUP_KEY is rejected', () => {
  const { window } = loadScript(batchRuntimeSource);
  const selection = window.InvoiceBatchModalV8.createInvoiceBatchSelectionState();
  const selectors = [
    { type: 'ROW', selection_key: 'generate:one' },
    { type: 'WEEK', week_ending_date: '2026-07-26' },
    { type: 'CLIENT', client_id: UUID_A },
    { type: 'CANDIDATE', candidate_id: UUID_B },
    { type: 'STATUS', status_code: 'READY' },
    { type: 'WEEK_CLIENT', week_ending_date: '2026-07-26', client_id: UUID_A },
    { type: 'WEEK_CLIENT_CANDIDATE', week_ending_date: '2026-07-26', client_id: UUID_A, candidate_id: UUID_B },
    { type: 'STATUS_WEEK', status_code: 'READY', week_ending_date: '2026-07-26' },
    { type: 'STATUS_WEEK_CLIENT', status_code: 'READY', week_ending_date: '2026-07-26', client_id: UUID_A }
  ];
  for (const selector of selectors) {
    window.InvoiceBatchModalV8.applyInvoiceBatchSelectionRule(selection, 'EXCLUDE', selector);
  }
  assert.equal(selection.rules.length, 9);
  assert.throws(
    () => window.InvoiceBatchModalV8.applyInvoiceBatchSelectionRule(
      selection,
      'EXCLUDE',
      { type: 'GROUP_KEY', group_key: 'opaque' }
    ),
    /BATCH_SELECTION_SELECTOR_INVALID/
  );
});

test('V2 candidate requests keep signed cursors opaque and browser explicit hydration is exactly one key', () => {
  const { window } = loadScript(batchRuntimeSource);
  const state = window.InvoiceBatchModalV8.createInvoiceBatchModalState('GENERATE');
  state.snapshot = {
    contract_version: 'INVOICE_BATCH_SNAPSHOT_V2',
    action: 'GENERATE',
    at_utc: '2026-07-26T12:00:00.000Z',
    revision: 9,
    expires_at_utc: '2026-07-26T12:30:00.000Z',
    key_id: 'key-1',
    token: 'signed-snapshot'
  };
  const opaque = 'opaque.signed.cursor';
  const page = window.buildInvoiceBatchCandidateRequest(state, 'PAGE', { cursor: opaque });
  assert.equal(page.cursor, opaque);
  assert.equal(page.mode, 'PAGE');
  assert.equal(page.contract_version, 'INVOICE_BATCH_QUERY_V2');
  const explicit = window.buildInvoiceBatchCandidateRequest(state, 'EXPLICIT_KEYS', {
    selection_keys: ['generate:one'],
    expected_source_revisions: { 'generate:one': 'revision-1' }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(explicit.selection_keys)), ['generate:one']);
  assert.throws(
    () => window.buildInvoiceBatchCandidateRequest(state, 'EXPLICIT_KEYS', {
      selection_keys: ['generate:one', 'generate:two'],
      expected_source_revisions: { 'generate:one': 'revision-1', 'generate:two': 'revision-2' }
    }),
    /BATCH_EXPLICIT_KEYS_INVALID/
  );
});

test('Batch Issue defaults to Issue and send with distinct durable identities', async () => {
  const calls = [];
  const { window } = loadScript(batchRuntimeSource, {
    window: {
      authFetch: async (url, init) => {
        calls.push({ url, init });
        return {
          status: 202,
          ok: true,
          json: async () => ({ root_operation_id: UUID_A, status: 'QUEUED' })
        };
      },
      registerInvoiceOperationsFromResponse: () => [{
        operation_id: UUID_A,
        status: 'QUEUED',
        phase: 'BUILD_MANIFEST'
      }],
      registerInvoiceOperationWatch() {}
    }
  });
  const state = window.InvoiceBatchModalV8.createInvoiceBatchModalState('ISSUE');
  state.snapshot = {
    contract_version: 'INVOICE_BATCH_SNAPSHOT_V2',
    action: 'ISSUE',
    at_utc: '2026-07-26T12:00:00.000Z',
    revision: 3,
    expires_at_utc: '2026-07-26T12:30:00.000Z',
    key_id: 'key-1',
    token: 'signed-snapshot'
  };
  await window.submitInvoiceBatchOperation(state);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(state.issue_mode, 'ISSUE_AND_SEND');
  assert.equal(body.deliver, true);
  assert.equal(body.delivery_intent.route_mode, 'SERVER_RESOLVED');
  assert.equal(body.delivery_intent.template_version, 'INVOICE_EMAIL_V2');
  assert.notEqual(body.command_token, body.delivery_request_token);
  assert.equal(calls[0].init.headers['idempotency-key'], body.command_token);
});

test('stale result cursors recover to page one once and retain the root/category', async () => {
  const calls = [];
  const revision = '12';
  const { window } = loadScript(batchRuntimeSource, {
    window: {
      authFetch: async (url, init) => {
        calls.push(JSON.parse(init.body));
        if (calls.length === 1) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ error: 'OPERATION_RESULT_CURSOR_STALE', result_page_revision: revision })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            operations: [{ operation_id: UUID_A, result_page_revision: revision }],
            result_page: {
              contract_version: 'INVOICE_BATCH_RESULT_PAGE_V2',
              root_operation_id: UUID_A,
              category: 'FAILED',
              result_page_revision: revision,
              rows: [],
              has_more: false,
              total_count: 0,
              next_cursor: null
            }
          })
        };
      }
    }
  });
  const state = window.InvoiceBatchModalV8.createInvoiceBatchModalState('GENERATE');
  state.root_operation_id = UUID_A;
  state.result_page_revision = revision;
  await window.loadInvoiceBatchResultPage(state, {
    category: 'FAILED',
    cursor: 'opaque.stale.cursor'
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].result_cursor, 'opaque.stale.cursor');
  assert.equal(calls[1].result_cursor, undefined);
  assert.equal(calls[1].operation_ids[0], UUID_A);
  assert.equal(calls[1].result_category, 'FAILED');
});
