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

test('safe draft cancellation remains available after a pre-provider review failure', () => {
  const source = sliceBetween('  const canShowDraftCancel = !!(', '  const canShowCancelReverseCorrectPanel = !!(');

  assert.match(source, /overviewCancelMode === 'DRAFT_DELETE'/);
  assert.match(source, /providerSubmitOverviewModel\.hasIssue !== true/);
  assert.match(source, /overviewHasExecutionEvidence !== true/);
  assert.doesNotMatch(source, /!activePaymentExecuteOperation/);
  assert.doesNotMatch(source, /!reviewRequired/);
});

test('a stopped payment operation waiting for user review does not impersonate provider activity', () => {
  const source = sliceBetween(
    "  const terminalOperationStatuses = new Set(['COMPLETE'",
    '  const activeOperationStatuses = new Set('
  );

  assert.match(source, /'REVIEW_REQUIRED'/);
  assert.match(source, /'WAITING_USER_REVIEW'/);
});

test('successful draft cancellation immediately clears only affected visible selections', () => {
  const source = sliceBetween(
    '  const reconcileCancelPatchSelectionState =',
    '  const markCancelPatchCandidatesRefreshing ='
  );
  const wizard = {
    workbench: {
      server_selected_preview_row_ids: ['cancelled-row', 'unrelated-row'],
      selected_preview_row_ids: ['cancelled-row', 'unrelated-row']
    },
    decisions: {
      server_selected_preview_row_ids: ['cancelled-row', 'unrelated-row'],
      selected_preview_row_ids: ['cancelled-row', 'unrelated-row']
    },
    selected_preview_row_ids: ['cancelled-row', 'unrelated-row'],
    local_selected_preview_row_ids_dirty: true
  };
  const context = {
    Set,
    Array,
    String,
    Object,
    isPlainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); },
    resolvePayState() { return { draftWizard: wizard }; },
    readPatchPreviewRows(value) { return Array.isArray(value?.rows) ? value.rows : []; },
    readIdsFromCancelPatch(value, ...keys) { return keys.flatMap((key) => Array.isArray(value?.[key]) ? value[key] : []); },
    upper(value) { return String(value == null ? '' : value).trim().toUpperCase(); },
    uniqStrings(...values) {
      const out = [];
      const add = (value) => {
        if (Array.isArray(value)) return value.forEach(add);
        const text = String(value == null ? '' : value).trim();
        if (text && !out.includes(text)) out.push(text);
      };
      values.forEach(add);
      return out;
    }
  };
  vm.runInNewContext(
    `${source}\nglobalThis.reconcileCancelPatchSelectionStateForTest = reconcileCancelPatchSelectionState;`,
    context,
    { filename: 'cancel-draft-selection-ui.js' }
  );

  const result = context.reconcileCancelPatchSelectionStateForTest({
    patched_row_ids: ['cancelled-row'],
    rows: [{
      preview_row_id: 'cancelled-row',
      selected: false,
      selection_state: 'UNSELECTED'
    }]
  });

  assert.equal(result.applied, true);
  assert.deepEqual(Array.from(result.removed_preview_row_ids), ['cancelled-row']);
  assert.deepEqual(Array.from(wizard.workbench.server_selected_preview_row_ids), ['unrelated-row']);
  assert.deepEqual(Array.from(wizard.decisions.selected_preview_row_ids), ['unrelated-row']);
  assert.equal(wizard.workbench.server_selected_preview_row_ids_provided, true);
  assert.equal(wizard.selected_preview_row_mode, 'EXPLICIT_SUBSET');
  assert.equal(wizard.local_selected_preview_row_ids_dirty, false);
});
