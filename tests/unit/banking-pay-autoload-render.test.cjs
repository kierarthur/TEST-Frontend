const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

function sliceBetween(start, end) {
  const from = mainSource.indexOf(start);
  const to = mainSource.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return mainSource.slice(from, to);
}

test('Banking Pay autoload renders the loading state once and lets each authoritative loader render its own result', () => {
  const autoload = sliceBetween(
    'const maybeAutoloadPayWorkbench = async () => {',
    'function buildTimesheetSummaryFilterSpec(input = {})'
  );

  assert.match(autoload, /status_text = 'Loading Banking Pay'/);
  assert.match(autoload, /bankingPayBatchesList\(/);
  assert.match(autoload, /bankingPayPreview\(/);
  assert.match(autoload, /Promise\.resolve\(listPromise\)\.catch/);
  assert.match(autoload, /Promise\.resolve\(previewPromise\)\.catch/);
  assert.doesNotMatch(autoload, /Promise\.resolve\(listPromise\)\.then\(async/);
  assert.doesNotMatch(autoload, /Promise\.resolve\(previewPromise\)\.then\(async/);
});
