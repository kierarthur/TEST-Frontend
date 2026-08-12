const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

test('loads the current main frontend asset through an explicit cache version', () => {
  const scriptBuildVersion = '20260803-invoice-reference-policy-r2';
  const stylesheetBuildVersion = '20260729-invoice-v8-flat-table-r5';
  const mainAsset = 'main.js?v=20260730-invoice-refs-ward-r10&banking-owner-recovery=20260730-r1&planned-week-authority=20260801-r3&invoice-email-policy=20260801-r2&summary-money=20260803-r1&outbox-cursor-pagination=20260803-r1&banking-paye-net-schedule=20260807-r1&banking-pre-provider-retry=20260808-r1&banking-cancellation-progress=20260812-r18&banking-responsive-layout=20260807-r1&banking-test-reauth=20260809-r3&banking-semantic-cancellation=20260810-r5&banking-ready-compact=20260809-r4&banking-wave1=20260811-r12&banking-batch-child-open=20260812-r2';
  const diagnosticAsset = 'invoice-diagnostic-catalog.js?v=20260803-invoice-reference-policy-r2';
  const batchAsset = `invoice-batch-modal.js?v=${scriptBuildVersion}`;
  const asyncAsset = 'invoice-async-ui.js?v=20260730-invoice-refs-ward-r13';
  const stylesheetAsset = `invoice-batch-modal.css?v=${stylesheetBuildVersion}`;
  assert.match(
    html,
    /<script src="\.\/js\/main\.js\?v=20260730-invoice-refs-ward-r10&banking-owner-recovery=20260730-r1&planned-week-authority=20260801-r3&invoice-email-policy=20260801-r2&summary-money=20260803-r1&outbox-cursor-pagination=20260803-r1&banking-paye-net-schedule=20260807-r1&banking-pre-provider-retry=20260808-r1&banking-cancellation-progress=20260812-r18&banking-responsive-layout=20260807-r1&banking-test-reauth=20260809-r3&banking-semantic-cancellation=20260810-r5&banking-ready-compact=20260809-r4&banking-wave1=20260811-r12&banking-batch-child-open=20260812-r2"><\/script>/
  );
  assert.match(html, /invoice-batch-modal\.css\?v=20260729-invoice-v8-flat-table-r5/);
  assert.match(html, /invoice-diagnostic-catalog\.js\?v=20260803-invoice-reference-policy-r2/);
  assert.match(html, /invoice-batch-modal\.js\?v=20260803-invoice-reference-policy-r2/);
  assert.doesNotMatch(html, /invoice-batch-modal\.(?:js|css)\?v=20260728-invoice-v8-presentation-r[123]["']/);
  assert.match(html, /invoice-async-ui\.js\?v=20260730-invoice-refs-ward-r13/);
  assert.doesNotMatch(
    html,
    /invoice-batch-modal\.js\?v=20260728-invoice-async-v8(?:-correction-r5)?["']/
  );
  assert.ok(html.includes(stylesheetAsset));
  assert.ok(html.indexOf(mainAsset) < html.indexOf(diagnosticAsset));
  assert.ok(html.indexOf(diagnosticAsset) < html.indexOf(batchAsset));
  assert.ok(html.indexOf(batchAsset) < html.indexOf(asyncAsset));
});
