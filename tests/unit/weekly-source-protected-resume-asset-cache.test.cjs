const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('the protected-pay retry publishes both changed Office assets with new explicit cache keys', () => {
  const index = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
  const editor = '<script src="./js/weekly-source/protected-shift-editor.js?v=20261007-history-r1&protected-next-receipts=20261010-r1&source-pay-query-admission=20261010-r1&bpay-next-standard-window=20261010-r2"></script>';
  const actions = index.match(/<script src="\.\/js\/weekly-source\/workspace-actions\.js\?[^"]+"><\/script>/)?.[0];
  assert.ok(actions);
  const query = new URL(actions.match(/src="([^"]+)"/)[1], 'https://isolated.invalid/').searchParams;
  for (const [key,value] of Object.entries({v:'20261009-contract-checkbox-r1','protected-next-receipts':'20261010-r1','source-pay-query-admission':'20261010-r1','bpay-next-standard-window':'20261010-r2','contact-controls':'20261016-r1','manual-enquiry':'20261016-parent-r1'})) assert.equal(query.get(key),value);
  assert.match(index, /type="module" src="\.\/js\/weekly-source\/contact-manual-enquiry-controls\.mjs\?v=20261016-parent-r1/);
  assert.ok(index.includes(editor));
  assert.ok(index.includes(actions));
  assert.ok(index.indexOf(editor) < index.indexOf(actions), 'the editor must load before its action owner');
  assert.ok(index.includes('css/weekly-source.css?v=20261010-contact-policy-r2'));
  assert.ok(index.includes('js/weekly-source/combined-review.js?v=20261013-contact-policy-next-r1'));
  assert.ok(index.includes('js/weekly-source/import-workspace.js?v=20261013-contact-policy-next-r1&healthroster=20261014-checklist-r3'));
  assert.doesNotMatch(index, /protected-shift-editor\.js\?v=20261003-r2|workspace-actions\.js\?v=20261003-r3/);
});
