const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'main.js'), 'utf8');

test('a typed pre-provider failure exposes retry instead of a dead review-only action', () => {
  assert.match(source, /activeOperationResumeReason === 'PAYMENT_EXECUTE_OPERATION_FAILED'/);
  assert.match(source, /activeOperationResumeReason === 'PAYMENT_EXECUTE_OPERATION_FAILED' \|\|\s*!activeOperationResumeReason/);
  assert.match(source, /const retryablePreProviderFailure = !!\(/);
  assert.match(source, /!retryablePreProviderFailure && !!\(/);
  assert.match(source, /retryablePreProviderFailure \? 'Retry payment' : 'Execute payment'/);
  assert.match(source, /data-retry-pre-provider-failure=/);
});

test('a redacted review summary may offer retry but the server remains final authority', () => {
  assert.match(source, /activeOperationStatus === 'REVIEW_REQUIRED'/);
  assert.match(source, /!activeOperationResumeReason/);
  assert.match(source, /data-retry-operation-id=/);
  assert.match(source, /retry_pre_provider_operation_id: retryPreProviderOperationId \|\| null/);
});

test('the retry command carries the exact failed operation through normal reauthentication', () => {
  const reauthIndex = source.indexOf("purpose: 'PAYMENT_SCHEDULE'");
  const requestIndex = source.indexOf('retry_pre_provider_operation_id: retryPreProviderOperationId || null', reauthIndex);
  assert.ok(reauthIndex >= 0);
  assert.ok(requestIndex > reauthIndex);
  assert.match(source, /operationStatus === 'REVIEW_REQUIRED'/);
  assert.match(source, /failureCode === 'PAYMENT_EXECUTE_OPERATION_FAILED'/);
  assert.match(source, /retry_pre_provider_failure: !!retryPreProviderOperationId/);
});
