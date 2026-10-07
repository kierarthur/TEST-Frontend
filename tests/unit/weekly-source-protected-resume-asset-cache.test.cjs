const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('the protected-pay retry publishes both changed Office assets with new explicit cache keys', () => {
  const index = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
  const editor = '<script src="./js/weekly-source/protected-shift-editor.js?v=20261007-history-r1"></script>';
  const actions = '<script src="./js/weekly-source/workspace-actions.js?v=20261007-history-r1"></script>';
  assert.ok(index.includes(editor));
  assert.ok(index.includes(actions));
  assert.ok(index.indexOf(editor) < index.indexOf(actions), 'the editor must load before its action owner');
  for (const asset of ['css/weekly-source.css', 'js/weekly-source/combined-review.js', 'js/weekly-source/import-workspace.js']) {
    assert.ok(index.includes(`${asset}?v=20261007-history-r1`));
  }
  assert.doesNotMatch(index, /protected-shift-editor\.js\?v=20261003-r2|workspace-actions\.js\?v=20261003-r3/);
});
