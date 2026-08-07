const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

test('the progress modal accepts only the server-returned planning retry action', () => {
  assert.match(source, /'CANCEL_REQUEST', 'REAUTHORISE_REMAINING', 'RETRY_PLANNING'/);
  assert.match(source, /RETRY_PLANNING: 'Retry cancellation preparation'/);
  assert.match(source, /const primaryAction = \['RETRY_PLANNING', 'AUTHORISE', 'USE_GOLDEN_KEY', 'REAUTHORISE_REMAINING'\]/);
  assert.match(source, /const secondaryActions = \['REJECT', 'CANCEL_REQUEST'\]\.filter\(\(action\) => availableActions\.includes\(action\)\)/);
  assert.match(source, /\[primaryAction, \.\.\.secondaryActions\]\.filter\(Boolean\)/);
});

test('planning retry reuses the existing correction auth-action route', () => {
  assert.match(source, /data-banking-pay-cancellation-auth-action/);
  assert.match(source, /const rpcAction = action === 'CANCEL_REQUEST' \? 'CANCEL' : action/);
  assert.match(source, /bankingPayPaymentCorrectionAuthAction\(state\.correctionRequestId, \{ action: rpcAction \}\)/);
});
