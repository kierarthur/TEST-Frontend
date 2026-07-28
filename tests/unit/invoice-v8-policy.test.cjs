const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const asyncSource = read('js/invoice-async-ui.js');
const batchSource = read('js/invoice-batch-modal.js');
const mainSource = read('js/main.js');
const diagnosticSource = read('js/invoice-diagnostic-catalog.js');
const batchCss = read('css/invoice-batch-modal.css');

test('shared diagnostic catalogue exposes locked labels and a bounded unknown fallback', () => {
  const window = {};
  vm.runInNewContext(diagnosticSource, { window, Object, String });
  const expected = new Map([
    ['INVOICE_CORRECTION_CONTRACT_MISMATCH', 'Contract mismatch'],
    ['INVOICE_CORRECTION_STREAM_MISMATCH', 'Invoice stream mismatch'],
    ['INVOICE_REFERENCE_REQUIRED', 'Missing refs'],
    ['MISSING_IMPORT_SOURCE_EVIDENCE', 'Source evidence missing'],
    ['NOT_READY_FOR_INVOICE', 'Not ready'],
    ['SEGMENT_ALREADY_LOCKED', 'Already locked'],
    ['BLOCKED_FOR_SENDING', 'Blocked for sending']
  ]);
  for (const [code, label] of expected) {
    const diagnostic = window.invoiceDiagnosticForCode(code);
    assert.equal(diagnostic.short_label, label);
    assert.ok(diagnostic.long_explanation.length > 10);
    assert.ok(diagnostic.family);
  }
  assert.equal(window.invoiceDiagnosticForCode('FUTURE_CODE').short_label, 'Needs attention');
});

test('hard cutover never restores captured legacy Invoice actions', () => {
  assert.match(asyncSource, /installInvoiceAsyncUnavailableActions/);
  assert.doesNotMatch(asyncSource, /captureOriginalFunctions/);
  assert.doesNotMatch(asyncSource, /originalFunctions/);
  assert.doesNotMatch(asyncSource, /InvoiceBatchModalV1/);
  assert.match(mainSource, /window\.InvoiceBatchModalV8\?\.open/);
});

test('browser-side V8 never decodes candidate, facet or result keysets', () => {
  assert.match(batchSource, /cursor:\s*options\.cursor\s*\|\|\s*null/);
  assert.match(batchSource, /result_cursor\s*=\s*options\.cursor/);
  assert.doesNotMatch(batchSource, /after_sort_date|after_sort_text|after_sort_numeric|after_chunk_id/);
  assert.doesNotMatch(batchSource, /atob\s*\(|base64.*cursor/i);
});

test('active Invoice and Timesheet document preparation is POST-only and exact-version access has no raw key', () => {
  assert.match(asyncSource, /\/api\/invoices\/\$\{encodeURIComponent\(invoiceId\)\}\/render/);
  assert.match(asyncSource, /\/api\/timesheets\/\$\{encodeURIComponent\(canonicalId\)\}\/pdf/);
  assert.match(asyncSource, /method:\s*'POST'/);
  assert.match(asyncSource, /\/api\/invoice-document-versions\/\$\{encodeURIComponent\(id\)\}\/presign/);
  assert.doesNotMatch(asyncSource, /\br2_key\b|\bstorage_key\b|\/api\/files\/presign-download/);
});

test('Batch Issue uses the locked default and keeps legal Issue separate from Delivery', () => {
  assert.match(batchSource, /issue_mode:\s*'ISSUE_AND_SEND'/);
  assert.match(batchSource, /Issue and send/);
  assert.match(batchSource, /Issue only/);
  assert.match(batchSource, /Issued but delivery suppressed/);
  assert.match(batchSource, /delivery_request_token/);
  assert.match(batchSource, /SERVER_RESOLVED/);
  assert.match(batchSource, /INVOICE_EMAIL_V2/);
});

test('frontend progress uses only V2 total fields and committed_at_utc', () => {
  for (const field of [
    'candidate_total',
    'invoice_total',
    'selected_total',
    'released_total',
    'generated_total',
    'regenerated_total',
    'issued_total',
    'issued_send_blocked_total',
    'blocked_total',
    'changed_total',
    'missing_total',
    'failed_total',
    'in_progress_total',
    'delivery_complete_total',
    'release_conflict_total',
    'release_blocked_total',
    'committed_at_utc'
  ]) assert.match(batchSource, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(batchSource, /\b(?:generated|issued|blocked|failed)_count\b/);
  assert.doesNotMatch(batchSource, /manifest_committed_at_utc/);
});

test('Timesheet hard-cutover callers delegate to the unified V8 viewer', () => {
  assert.match(mainSource, /window\.openTimesheetDocumentV8\(tsIdForPdf\)/);
  assert.match(mainSource, /window\.openTimesheetDocumentV8\(idNow\)/);
  assert.match(mainSource, /async function openTimesheetPdf[\s\S]*window\.openTimesheetDocumentV8\(timesheetId\)/);
  assert.match(mainSource, /async function getTimesheetPdfUrl[\s\S]*window\.openTimesheetDocumentV8\(timesheetId\)/);
});

test('the V8 batch modal remains usable at a narrow viewport without global style drift', () => {
  assert.match(batchCss, /@media \(max-width: 600px\)/);
  assert.match(batchCss, /#modal\.invbatch-modal \.invbatch-row[\s\S]*grid-template-columns: 28px minmax\(0, 1fr\)/);
  assert.match(batchCss, /#modal\.invbatch-modal \.invbatch-footer[\s\S]*flex-direction: column/);
  assert.doesNotMatch(batchCss, /(?:^|\n)\s*(?:button|input|select|table|\.modal)\s*\{/);
});

test('batch grouping is a four-level draggable order and the filter drawer remains closable above modal bands', () => {
  assert.match(batchSource, /DEFAULT_GROUP_ORDER[\s\S]*'WEEK', 'CLIENT', 'CANDIDATE', 'STATUS'/);
  assert.match(batchSource, /draggable="true"/);
  assert.match(batchSource, /data-batch-action="group-up"/);
  assert.match(batchSource, /data-batch-action="group-down"/);
  assert.match(batchSource, /data-batch-action="toggle-group"/);
  assert.match(batchSource, /data-batch-action="toggle-group-all"/);
  assert.match(batchSource, /collapsed_group_ids: new Set\(\)/);
  assert.match(batchSource, /invbatch-toolbar-row--primary/);
  assert.match(batchSource, /invbatch-toolbar-row--secondary/);
  assert.doesNotMatch(batchSource, /data-batch-field="grouping"/);
  assert.match(batchSource, /class="invbatch-row invbatch-row--header"/);
  assert.match(batchSource, /class="btn btn-sm btn-outline invbatch-drawer-close"/);
  assert.match(batchSource, /captureInvoiceBatchViewport/);
  assert.match(batchSource, /restoreInvoiceBatchViewport/);
  assert.match(batchSource, /focus\(\{ preventScroll: true \}\)/);
  assert.match(batchCss, /#modal\.invbatch-modal\s*\{[\s\S]*position: relative/);
  assert.match(batchCss, /\.invbatch-filter-drawer[\s\S]*z-index: 120/);
  assert.match(batchCss, /\.invbatch-filter-drawer[\s\S]*inset: 58px 10px 10px auto/);
  assert.match(batchCss, /\.invbatch-filter-drawer header[\s\S]*position: sticky/);
  assert.match(batchCss, /\.invbatch-group-toggle-all[\s\S]*width: 32px/);
  assert.match(batchCss, /\.invbatch-badge--ready[\s\S]*background: #86efac/);
});

test('batch selection gives immediate local feedback without rebuilding the whole modal', () => {
  assert.match(batchSource, /function markInvoiceBatchSelectionSummaryPending/);
  assert.match(batchSource, /data-batch-selected-count/);
  assert.match(batchSource, /primary\.disabled = true/);
  assert.match(batchSource, /selectedCount\.textContent = 'Calculating…'/);
  assert.match(
    batchSource,
    /function scheduleInvoiceBatchSelectionSummary[\s\S]*markInvoiceBatchSelectionSummaryPending\(state\)/,
  );
});

test('Invoice Summary uses one fixed attachment column and invoice document actions expose exact lifecycle labels', () => {
  assert.match(mainSource, /cols\.splice\(invoiceNumberIndex >= 0 \? invoiceNumberIndex \+ 1 : 0, 0, 'attachment_state'\)/);
  assert.match(mainSource, /label = 'Attachment'/);
  assert.match(mainSource, /function paintInvoiceAttachmentIndicator/);
  assert.match(mainSource, /Invoice attachment waiting to be generated/);
  assert.match(mainSource, /Invoice attachment generated/);
  assert.match(mainSource, /Generating invoice PDF…/);
  assert.match(mainSource, /Generate invoice PDF/);
  assert.match(mainSource, /Open invoice PDF/);
  assert.match(asyncSource, /if \(state\.view_available\) return 'Ready'/);
});
