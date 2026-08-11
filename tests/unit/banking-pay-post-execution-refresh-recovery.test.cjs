const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

test('post-execution refresh is queued behind an already active batch load', () => {
  const start = source.indexOf('const loadBatch = async (opts = {}) =>');
  const end = source.indexOf('const firstRefreshText =', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /mustRunAfterCurrentLoad/);
  assert.match(body, /opts\.executionRefresh === true/);
  assert.match(body, /child\.__loadIdleWaiters\.push\(resolve\)/);
  assert.match(body, /return loadBatch\(\{ \.\.\.opts, __queuedAfterInFlight: true \}\)/);
  assert.match(body, /idleWaiters[\s\S]*resolve\(child\.data \|\| null\)/);
});

test('an explicit stale post-execution flag is sufficient to run the authoritative refresh', () => {
  const start = source.indexOf("const forceChildExecutionRefresh = async");
  const end = source.indexOf('child.__forceRefreshAfterPaymentOperation', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /hasPaymentExecuteRefreshRequiredFlag\(\) \? 'PAYMENT_EXECUTE'/);
  assert.match(body, /detail_mode: 'AUTO'/);
  assert.match(body, /applyPaymentExecutionRefreshFlagsToBatch/);
});

test('Refresh Batch recovers the stale post-execution screen even if operation identity was lost', () => {
  assert.match(
    source,
    /if \(hasPaymentExecuteRefreshContext\(\) \|\| hasPaymentExecuteRefreshRequiredFlag\(\)\) \{[\s\S]*forceChildExecutionRefresh/
  );
});
