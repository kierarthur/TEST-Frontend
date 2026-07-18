const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

function sliceBetween(start, end) {
  const from = mainSource.indexOf(start);
  const to = mainSource.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return mainSource.slice(from, to);
}

test('selection drift displays a specific readable cancellation explanation', async () => {
  const source = sliceBetween('  const showCancelFailureModal =', '  const resolvePayState =');
  let modalInput = null;
  const context = {
    id: 'test-batch-id',
    isDraftDeleteMode: true,
    window: {},
    console: { error() {} },
    Number,
    String,
    Math,
    Object,
    Array,
    extractCancelFailurePayload(value) { return value; },
    isPlainObject(value) { return value && typeof value === 'object' && !Array.isArray(value); },
    upper(value) { return String(value == null ? '' : value).trim().toUpperCase(); },
    formatCancelFailureSummary() { return ''; },
    resolvePayState() { return null; },
    async openUiConfirmModal(input) { modalInput = input; return true; }
  };
  vm.runInNewContext(`${source}\nglobalThis.showCancelFailureModalForTest = showCancelFailureModal;`, context, { filename: 'cancel-draft-error-ui.js' });

  const result = await context.showCancelFailureModalForTest({ code: 'WORK_SELECTION_DRIFT' });

  assert.equal(result.error_code, 'WORK_SELECTION_DRIFT');
  assert.equal(result.title, 'Cancel Draft Batch selection could not be verified');
  assert.match(result.message, /could not safely select the full frozen draft/);
  assert.match(result.message, /Nothing was cancelled/);
  assert.match(result.message, /Refresh Banking Pay and try again/);
  assert.equal(modalInput.title, result.title);
  assert.equal(modalInput.message, result.message);
  assert.equal(modalInput.hide_cancel, true);
});
