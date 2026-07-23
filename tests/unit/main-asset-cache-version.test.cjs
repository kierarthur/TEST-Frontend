const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

test('loads the current main frontend asset through an explicit cache version', () => {
  assert.match(
    html,
    /<script src="\.\/js\/main\.js\?v=20260723-paymethod-retained-v1"><\/script>/
  );
});
