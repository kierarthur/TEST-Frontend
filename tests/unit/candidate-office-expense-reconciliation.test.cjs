'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'candidate-office-bridge-v1.js'), 'utf8');
const TIMESHEET_ID = '00000000-0000-4000-8000-000000000001';

function createHarness({ modalCtx = {}, frame = null, affectedRefresh = null } = {}) {
  let controllerDependencies = null;
  const lifecycleCalls = [];
  const document = {
    body: {},
    documentElement: {
      toggleAttribute() {},
      removeAttribute() {}
    },
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    modalCtx,
    __modalStack: [],
    CloudTMSCandidateOfficeApi: {},
    CloudTMSCandidateOfficeModals: {},
    CloudTMSCandidateOfficeController: {
      createCandidateOfficeActionController(dependencies) {
        controllerDependencies = dependencies;
        return {};
      }
    },
    addEventListener() {},
    dispatchEvent() {},
    __getModalFrame() { return frame; },
    async refreshTimesheetLifecycleAffectedRows(result, options) {
      lifecycleCalls.push({ result, options });
      return affectedRefresh;
    }
  };
  const context = vm.createContext({
    window,
    document,
    console,
    CSS: { escape: value => String(value) },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000099' },
    CustomEvent: class CustomEvent {},
    HTMLElement: class HTMLElement {},
    MutationObserver: class MutationObserver { observe() {} },
    setTimeout,
    clearTimeout
  });
  new vm.Script(source, { filename: 'candidate-office-bridge-v1.js' }).runInContext(context);
  window.CloudTMSCandidateOfficeBridge.initialize({
    contract_version: 'CLOUDTMS_OFFICE_CANDIDATE_CAPABILITIES_V1',
    authority_applies: true,
    permissions: { view_candidate_state: true },
    surfaces: {}
  });
  assert.ok(controllerDependencies, 'bridge must provide controller reconciliation dependencies');
  return { window, controllerDependencies, lifecycleCalls };
}

function actionContext(surface) {
  return {
    surface,
    identity: { row_key: 'row-a', timesheet_id: TIMESHEET_ID },
    projection: { current_identity: { row_key: 'row-a', timesheet_id: TIMESHEET_ID } }
  };
}

function result(overrides = {}) {
  return {
    empty_timesheet_consequence: 'NONE',
    owning_timesheet_deleted: false,
    deleted_timesheet_ids: [],
    retained_timesheet_ids: [TIMESHEET_ID],
    affected_timesheet_ids: [TIMESHEET_ID],
    removed_from_current_timesheet_ids: [],
    refresh_timesheet_ids: [TIMESHEET_ID],
    ...overrides
  };
}

test('retained Simple Timesheet performs one structural finance refresh after authoritative row refresh', async () => {
  const structuralRefreshes = [];
  const modalCtx = {
    async refreshTimesheetAfterFinanceChange(options) {
      structuralRefreshes.push(options);
    }
  };
  const harness = createHarness({ modalCtx });

  await harness.controllerDependencies.reconcileExpenseCategory(result(), actionContext('SIMPLE_TIMESHEET'));

  assert.equal(harness.lifecycleCalls.length, 1);
  assert.deepEqual(
    Array.from(harness.lifecycleCalls[0].result.affected_rows, row => ({ ...row })),
    [{ timesheet_id: TIMESHEET_ID, context: 'timesheet_modal' }]
  );
  assert.equal(harness.lifecycleCalls[0].options.context, 'timesheet_modal');
  assert.deepEqual(structuralRefreshes.map(options => ({ ...options })), [{
    silent: true,
    structural: true,
    skipSummaryRefresh: true,
    refreshMode: 'candidate-expense-category-rejection'
  }]);
});

test('deleted expense-only Simple Timesheet closes the stale modal and refreshes the summary', async () => {
  let structuralRefreshes = 0;
  let modalCloses = 0;
  let summaryRefreshes = 0;
  const modalCtx = {
    async refreshTimesheetAfterFinanceChange() { structuralRefreshes += 1; }
  };
  const harness = createHarness({ modalCtx });
  harness.window.discardAllModalsAndState = () => { modalCloses += 1; };
  harness.window.renderAll = async () => { summaryRefreshes += 1; };

  await harness.controllerDependencies.reconcileExpenseCategory(result({
    empty_timesheet_consequence: 'PERMANENT_REMOVE',
    owning_timesheet_deleted: true,
    deleted_timesheet_ids: [TIMESHEET_ID],
    retained_timesheet_ids: [],
    removed_from_current_timesheet_ids: [TIMESHEET_ID],
    refresh_timesheet_ids: []
  }), actionContext('SIMPLE_TIMESHEET'));

  assert.equal(structuralRefreshes, 0);
  assert.equal(modalCloses, 1);
  assert.equal(summaryRefreshes, 1);
});

test('history-retained expense-only Simple Timesheet closes the row without claiming physical deletion', async () => {
  let structuralRefreshes = 0;
  let modalCloses = 0;
  let summaryRefreshes = 0;
  const harness = createHarness({
    modalCtx: { async refreshTimesheetAfterFinanceChange() { structuralRefreshes += 1; } }
  });
  harness.window.discardAllModalsAndState = () => { modalCloses += 1; };
  harness.window.renderAll = async () => { summaryRefreshes += 1; };

  await harness.controllerDependencies.reconcileExpenseCategory(result({
    empty_timesheet_consequence: 'REMOVE_FROM_CURRENT_KEEP_HISTORY',
    owning_timesheet_deleted: false,
    deleted_timesheet_ids: [],
    retained_timesheet_ids: [TIMESHEET_ID],
    removed_from_current_timesheet_ids: [TIMESHEET_ID]
  }), actionContext('SIMPLE_TIMESHEET'));

  assert.equal(structuralRefreshes, 0);
  assert.equal(modalCloses, 1);
  assert.equal(summaryRefreshes, 1);
  assert.deepEqual(
    Array.from(harness.lifecycleCalls[0].result.affected_rows, row => ({ ...row })),
    [{ timesheet_id: TIMESHEET_ID, context: 'timesheet_modal' }]
  );
});

test('Bulk Authorise refreshes the owning dataset before asking the existing Expenses child to reconcile', async () => {
  const state = { active_row_key: 'row-a' };
  const order = [];
  const datasetRefreshes = [];
  const childRefreshes = [];
  const frame = {
    async __refreshCandidateOfficeExpenseCategory(payload) {
      order.push('child');
      childRefreshes.push(payload);
    }
  };
  const harness = createHarness({ modalCtx: { bulkAuthoriseState: state }, frame });
  harness.window.refreshBulkAuthoriseDatasetPreservingState = async (receivedState, options) => {
    order.push('dataset');
    datasetRefreshes.push({ receivedState, options });
  };

  const rejectionResult = result({
    empty_timesheet_consequence: 'PERMANENT_REMOVE',
    owning_timesheet_deleted: true,
    deleted_timesheet_ids: [TIMESHEET_ID],
    retained_timesheet_ids: [],
    removed_from_current_timesheet_ids: [TIMESHEET_ID],
    refresh_timesheet_ids: []
  });
  const context = actionContext('BULK_AUTHORISE');
  await harness.controllerDependencies.reconcileExpenseCategory(rejectionResult, context);

  assert.deepEqual(order, ['dataset', 'child']);
  assert.equal(harness.lifecycleCalls[0].options.context, 'bulk_authorise');
  assert.equal(harness.lifecycleCalls[0].options.state, state);
  assert.equal(datasetRefreshes[0].receivedState, state);
  assert.equal(datasetRefreshes[0].options.preferredRowKey, 'row-a');
  assert.equal(datasetRefreshes[0].options.forceFreshDataset, true);
  assert.equal(datasetRefreshes[0].options.forceContextRefresh, true);
  assert.equal(datasetRefreshes[0].options.deferFinalRerender, true);
  assert.equal(childRefreshes[0].rowVanished, true);
  assert.equal(childRefreshes[0].result, rejectionResult);
  assert.equal(childRefreshes[0].context, context);
});
