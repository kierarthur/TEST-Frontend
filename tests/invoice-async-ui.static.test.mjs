import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const uiSource = await readFile(new URL('../js/invoice-async-ui.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

test('invoice async UI provides one session watch registry and global heartbeat integration', () => {
  for (const name of [
    'loadInvoiceOperationWatches', 'normaliseInvoiceOperationWatch',
    'deduplicateInvoiceOperationWatch', 'pruneInvoiceOperationWatches',
    'saveInvoiceOperationWatches', 'registerInvoiceOperationWatch',
    'applyInvoiceOperationUpdates', 'renderInvoiceAsyncState',
    'renderTimesheetEvidenceProcessingState'
  ]) assert.match(uiSource, new RegExp(`\\b${name}\\b`));
  assert.match(mainSource, /watched_invoice_operation_ids/);
  assert.match(mainSource, /applyInvoiceOperationUpdates\(json\)/);
  assert.doesNotMatch(uiSource, /setInterval\s*\(/);
});

test('invoice modal issue uses one durable command token and freezes delivery intent in the issue command', () => {
  assert.match(mainSource, /invoiceAsync\.issue_command_token/);
  assert.match(mainSource, /delivery_request_token:\s*sendNow \? issueCommandToken/);
  assert.match(mainSource, /registerInvoiceOperationsFromResponse\?\.\(issueRes/);
});

test('batch generation and issue register root watches and remain closeable', () => {
  assert.match(mainSource, /purpose:\s*'BATCH_GENERATE'/);
  assert.match(mainSource, /purpose:\s*'BATCH_ISSUE_AND_DELIVER'/);
  assert.match(mainSource, /You can close this window/);
});

test('issued document presentation never infers an R2 key from an entity id', () => {
  assert.match(uiSource, /payload\.document_version/);
  assert.match(uiSource, /READY_DOCUMENT_IDENTITY_INVALID/);
  assert.doesNotMatch(uiSource, /invoice[-_/]\$\{invoiceId\}.*\.pdf/);
});
