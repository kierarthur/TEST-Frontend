const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

test('loads the current main frontend asset through an explicit cache version', () => {
  assert.match(
    html,
    /<script src="\.\/js\/main\.js\?v=20260728-invoice-v8-banking-correction-carrier-v4"><\/script>/
  );
  assert.match(html, /invoice-diagnostic-catalog\.js\?v=20260728-invoice-async-v8/);
  assert.match(html, /invoice-batch-modal\.js\?v=20260728-invoice-async-v8/);
  assert.match(html, /invoice-async-ui\.js\?v=20260728-invoice-async-v8/);
});
