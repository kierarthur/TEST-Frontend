const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('the protected-pay retry publishes both changed Office assets with new explicit cache keys', () => {
  const index = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
  const editor = '<script src="./js/weekly-source/protected-shift-editor.js?v=20261007-history-r1&protected-next-receipts=20261010-r1&source-pay-query-admission=20261010-r1"></script>';
  const actions = '<script src="./js/weekly-source/workspace-actions.js?v=20261009-contract-checkbox-r1&protected-next-receipts=20261010-r1&source-pay-query-admission=20261010-r1"></script>';
  assert.ok(index.includes(editor));
  assert.ok(index.includes(actions));
  assert.ok(index.indexOf(editor) < index.indexOf(actions), 'the editor must load before its action owner');
  assert.ok(index.includes('css/weekly-source.css?v=20261009-status-colours-r2'));
  assert.ok(index.includes('js/weekly-source/combined-review.js?v=20261007-recheck-recovery-r1'));
  assert.ok(index.includes('js/weekly-source/import-workspace.js?v=20261010-next-source-retirement-r1'));
  assert.doesNotMatch(index, /protected-shift-editor\.js\?v=20261003-r2|workspace-actions\.js\?v=20261003-r3/);
});
