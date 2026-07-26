import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const uiSource = await readFile(new URL('../js/invoice-async-ui.js', import.meta.url), 'utf8');
const batchSource = await readFile(new URL('../js/invoice-batch-modal.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('capability gating is V7-exact and does not install async overrides unconditionally', () => {
  assert.match(uiSource, /INVOICE_ASYNC_BACKEND_V7/);
  assert.match(uiSource, /INVOICE_DOCUMENT_VERSION_ACCESS_V1/);
  assert.match(uiSource, /enabled_for_user\s*!==\s*true/);
  assert.match(uiSource, /initialiseInvoiceAsyncUi/);
  assert.match(uiSource, /if\s*\(!capabilityCacheKey\(\)\)/);
  assert.doesNotMatch(uiSource, /installOverrides\(\);\s*document\.addEventListener/);
  assert.doesNotMatch(uiSource, /installAsyncFetchObserver/);
  assert.doesNotMatch(uiSource, /window\.authFetch\s*=\s*observed/);
});

test('operation watches use the existing global heartbeat and reject arbitrary UUID objects', () => {
  for (const name of [
    'loadInvoiceOperationWatches',
    'normaliseInvoiceOperationWatch',
    'deduplicateInvoiceOperationWatch',
    'pruneInvoiceOperationWatches',
    'saveInvoiceOperationWatches',
    'registerInvoiceOperationWatch',
    'applyInvoiceOperationUpdates',
    'renderInvoiceAsyncState',
    'renderTimesheetEvidenceProcessingState'
  ]) assert.match(uiSource, new RegExp(`\\b${name}\\b`));
  assert.match(uiSource, /hasOperationMarker/);
  assert.match(uiSource, /OPERATION_ARRAY_FIELDS/);
  assert.match(mainSource, /watched_invoice_operation_ids/);
  assert.match(mainSource, /applyInvoiceOperationUpdates\(json\)/);
  assert.doesNotMatch(uiSource, /setInterval\s*\(/);
});

test('async document access uses only exact document-version identity', () => {
  assert.match(uiSource, /\/api\/invoice-document-versions\/\$\{encodeURIComponent\(id\)\}\/presign/);
  assert.doesNotMatch(uiSource, /\/api\/files\/presign-download/);
  assert.doesNotMatch(uiSource, /openReadyStorageKey/);
  assert.doesNotMatch(uiSource, /invoice[-_/]\$\{invoiceId\}.*\.pdf/);
});

test('issue commands preserve stale-modal protection and durable operation registration', () => {
  assert.match(mainSource, /expected_revision:\s*expectedIssueRevision/);
  assert.match(mainSource, /invoiceAsync\.issue_command_token/);
  assert.match(mainSource, /delivery_request_token:\s*sendNow \? issueCommandToken/);
  assert.match(mainSource, /explicit_operation_ids:\s*true/);
});

test('batch UI is server-paged, selection-contract based and loaded before the async installer', () => {
  assert.match(batchSource, /INVOICE_BATCH_QUERY_V1/);
  assert.match(batchSource, /INVOICE_BATCH_SELECTION_V1/);
  assert.match(batchSource, /mode:\s*'IMPLICIT_ALL'/);
  assert.match(batchSource, /default_selected:\s*true/);
  assert.match(batchSource, /page_size/);
  assert.match(batchSource, /selection_contract:\s*buildInvoiceBatchSelectionContract/);
  assert.match(batchSource, /row\.selectable === true/);
  assert.match(indexSource, /invoice-batch-modal\.css\?v=20260726-invoice-batch-v1/);
  assert.ok(indexSource.indexOf('js/main.js?v=20260726-invoice-batch-v1')
    < indexSource.indexOf('js/invoice-batch-modal.js?v=20260726-invoice-batch-v1'));
  assert.ok(indexSource.indexOf('js/invoice-batch-modal.js?v=20260726-invoice-batch-v1')
    < indexSource.indexOf('js/invoice-async-ui.js?v=20260726-invoice-batch-v1'));
});

test('the async UI uses the shared update model and never creates a second heart', () => {
  assert.match(uiSource, /__updatesAvailable\.invoices\s*=\s*true/);
  assert.doesNotMatch(uiSource, /data-invoice-heart/);
  assert.doesNotMatch(uiSource, /createElement\(['"]button['"]\).*heart/s);
});

test('the effective evidence renderer exposes separate source and document async state', () => {
  const effectiveRenderer = mainSource.slice(mainSource.lastIndexOf('function renderTimesheetEvidenceTab'));
  assert.match(effectiveRenderer, /renderTimesheetEvidenceProcessingState/);
  assert.match(effectiveRenderer, /data-asset-state=/);
  assert.match(effectiveRenderer, /data-asset-operation-id=/);
  assert.match(effectiveRenderer, /data-timesheet-document-state=/);
  assert.match(effectiveRenderer, /data-document-operation-id=/);
});
