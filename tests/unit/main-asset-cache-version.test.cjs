const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

test('loads the current main frontend asset through an explicit cache version', () => {
  const scriptBuildVersion = '20260728-invoice-v8-presentation-r2';
  const stylesheetBuildVersion = '20260728-invoice-v8-presentation-r1';
  const mainAsset = 'main.js?v=20260728-invoice-v8-banking-correction-carrier-v4';
  const diagnosticAsset = 'invoice-diagnostic-catalog.js?v=20260728-invoice-async-v8';
  const batchAsset = `invoice-batch-modal.js?v=${scriptBuildVersion}`;
  const asyncAsset = 'invoice-async-ui.js?v=20260728-invoice-async-v8-correction-r5';
  const stylesheetAsset = `invoice-batch-modal.css?v=${stylesheetBuildVersion}`;
  assert.match(
    html,
    /<script src="\.\/js\/main\.js\?v=20260728-invoice-v8-banking-correction-carrier-v4"><\/script>/
  );
  assert.match(html, /invoice-batch-modal\.css\?v=20260728-invoice-v8-presentation-r1/);
  assert.match(html, /invoice-diagnostic-catalog\.js\?v=20260728-invoice-async-v8/);
  assert.match(html, /invoice-batch-modal\.js\?v=20260728-invoice-v8-presentation-r2/);
  assert.doesNotMatch(html, /invoice-batch-modal\.js\?v=20260728-invoice-v8-presentation-r1["']/);
  assert.match(html, /invoice-async-ui\.js\?v=20260728-invoice-async-v8-correction-r5/);
  assert.doesNotMatch(
    html,
    /invoice-batch-modal\.js\?v=20260728-invoice-async-v8(?:-correction-r5)?["']/
  );
  assert.ok(html.includes(stylesheetAsset));
  assert.ok(html.indexOf(mainAsset) < html.indexOf(diagnosticAsset));
  assert.ok(html.indexOf(diagnosticAsset) < html.indexOf(batchAsset));
  assert.ok(html.indexOf(batchAsset) < html.indexOf(asyncAsset));
});
