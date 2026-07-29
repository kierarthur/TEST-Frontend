import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const uiSource = await readFile(new URL('../js/invoice-async-ui.js', import.meta.url), 'utf8');
const batchSource = await readFile(new URL('../js/invoice-batch-modal.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('capability gating is V8-exact and disabled state installs no legacy fallback', () => {
  assert.match(uiSource, /INVOICE_ASYNC_BACKEND_V8/);
  assert.match(uiSource, /INVOICE_DOCUMENT_VERSION_ACCESS_V1/);
  assert.match(uiSource, /database_contract_ready\s*!==\s*true/);
  assert.match(uiSource, /deployment_contract_ready\s*!==\s*true/);
  assert.match(uiSource, /enabled_for_user\s*!==\s*true/);
  assert.match(uiSource, /installInvoiceAsyncUnavailableActions/);
  assert.match(uiSource, /initialiseInvoiceAsyncUi/);
  assert.match(uiSource, /if\s*\(!capabilityCacheKey\(\)\)/);
  assert.doesNotMatch(uiSource, /INVOICE_ASYNC_BACKEND_V7/);
  assert.doesNotMatch(uiSource, /originalFunctions/);
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

test('individual Generate uses one bounded foreground watcher without changing the global heartbeat', () => {
  assert.match(uiSource, /DOCUMENT_FOREGROUND_WATCH_FAST_MS\s*=\s*30\s*\*\s*1000/);
  assert.match(uiSource, /DOCUMENT_FOREGROUND_WATCH_MEDIUM_MS\s*=\s*2\s*\*\s*60\s*\*\s*1000/);
  assert.match(uiSource, /DOCUMENT_FOREGROUND_WATCH_MAX_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(uiSource, /return 2000[\s\S]*return 5000[\s\S]*return 15000/);
  assert.match(uiSource, /__changesHeartbeat[\s\S]*pingOnce/);
  assert.match(uiSource, /if \(watch\.in_flight === true\) return false/);
  assert.match(uiSource, /deadline_timer\s*=\s*setTimeout[\s\S]*DOCUMENT_FOREGROUND_WATCH_MAX_MS/);
  assert.match(uiSource, /response\.status === 202 && viewerState === 'PREPARING'[\s\S]*startInvoiceDocumentForegroundWatch/);
  assert.match(uiSource, /stopAllInvoiceDocumentForegroundWatches\(reason\)/);
  assert.match(uiSource, /stopAllInvoiceDocumentForegroundWatches\('pagehide'\)/);
  assert.doesNotMatch(uiSource, /setInterval\s*\(/);
  assert.match(mainSource, /hb\.intervalMs\s*=\s*Number\(hb\.intervalMs \|\| 45000\)/);
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
  assert.match(mainSource, /delivery_request_token:\s*deliveryRequestToken/);
  assert.match(mainSource, /deliveryRequestToken === issueCommandToken/);
  assert.match(mainSource, /'Idempotency-Key':\s*issueCommandToken/);
  assert.match(mainSource, /explicit_operation_ids:\s*true/);
});

test('batch UI is server-paged, selection-contract based and loaded before the async installer', () => {
  assert.match(batchSource, /INVOICE_BATCH_QUERY_V2/);
  assert.match(batchSource, /INVOICE_BATCH_SELECTION_V2/);
  assert.match(batchSource, /INVOICE_BATCH_SELECTION_ROOT_V2/);
  assert.doesNotMatch(batchSource, /INVOICE_BATCH_QUERY_V1/);
  assert.match(batchSource, /mode:\s*'IMPLICIT_ALL'/);
  assert.match(batchSource, /default_selected:\s*true/);
  assert.match(batchSource, /method:\s*'POST'/);
  assert.match(batchSource, /mode:\s*'SUMMARY'/);
  assert.match(batchSource, /mode:\s*'FACETS'/);
  assert.match(batchSource, /next_cursor/);
  assert.match(batchSource, /selection_contract:\s*buildInvoiceBatchSelectionContract/);
  assert.match(batchSource, /row\.selectable === true/);
  assert.match(batchSource, /installInvoiceBatchModalOverrides\(\);\s*\n\}\)\(\);/);
  assert.doesNotMatch(uiSource, /openInvoiceBatchGenerateModal:\s*\(\.\.\.args\)/);
  assert.doesNotMatch(uiSource, /openInvoiceBatchIssueModal:\s*\(\.\.\.args\)/);
  assert.match(mainSource, /openInvoiceBatchV8WhenReady/);
  assert.doesNotMatch(mainSource, /Batch (?:Generate|Issue) modal not yet implemented/);
  assert.match(indexSource, /invoice-batch-modal\.css\?v=20260729-invoice-v8-flat-table-r5/);
  assert.ok(indexSource.indexOf('js/main.js?v=20260729-invoice-batch-loader-race-v7')
    < indexSource.indexOf('js/invoice-diagnostic-catalog.js?v=20260728-invoice-async-v8-source-evidence-r1'));
  assert.ok(indexSource.indexOf('js/invoice-diagnostic-catalog.js?v=20260728-invoice-async-v8-source-evidence-r1')
    < indexSource.indexOf('js/invoice-batch-modal.js?v=20260729-invoice-v8-sort-auto-r7'));
  assert.ok(indexSource.indexOf('js/invoice-batch-modal.js?v=20260729-invoice-v8-sort-auto-r7')
    < indexSource.indexOf('js/invoice-async-ui.js?v=20260729-invoice-foreground-watch-r11'));
});

test('Timesheet and Invoice preparation use V8 POST identities and no active raw-key path', () => {
  assert.match(uiSource, /openTimesheetDocumentV8/);
  assert.match(uiSource, /INVOICE_VIEWER_V2/);
  assert.match(uiSource, /idempotency-key/);
  assert.doesNotMatch(uiSource, /\/api\/files\/presign-download/);
  assert.match(mainSource, /window\.openTimesheetDocumentV8\(tsIdForPdf\)/);
  assert.match(mainSource, /window\.openTimesheetDocumentV8\(idNow\)/);
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
