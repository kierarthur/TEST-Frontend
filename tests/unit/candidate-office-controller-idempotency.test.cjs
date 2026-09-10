const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'js', 'candidate-office-controller-v1.js'), 'utf8');

function loadController() {
  const window = {
    CloudTMSCandidateOfficeUiPolicy: {
      MANAGER_JOURNEY_ACTIONS: [],
      CANDIDATE_APP_ACTIONS: [],
      assertOfficeButtonApproved: () => true
    },
    CloudTMSCandidateOfficeContract: {
      normalizeOfficeCandidateAction: action => action,
      normalizeOfficeExpenseCategoryRejectionResult: result => result,
      normalizeCandidateOfficeError: error => ({
        code: error.code || 'CANDIDATE_OFFICE_UNKNOWN',
        message: error.message,
        stale: error.code === 'CANDIDATE_CONTEXT_STALE'
      })
    },
    CloudTMSCandidateOfficeApi: {},
    CloudTMSCandidateOfficeModals: {
      openCandidateManagerActionModal: async () => ({ confirmed: true, inputs: {} }),
      openCandidateTypedActionModal: async () => ({ confirmed: true, inputs: {} }),
      openCandidateExpenseCategoryRejectionModal: async () => ({ confirmed: true, inputs: { reason_note: 'Incorrect expense.' } })
    },
    location: { origin: 'https://testmode.example' },
    open: () => null
  };
  const context = vm.createContext({ window, Object, Set, Map, String, Number, Array, JSON, Error, URL, Blob, setTimeout, crypto });
  new vm.Script(source, { filename: 'candidate-office-controller-v1.js' }).runInContext(context);
  return context.window.CloudTMSCandidateOfficeController;
}

function action(fixedBody = { generation: 1 }) {
  return {
    code: 'SEND_MANAGER_REMINDER',
    label: 'Send manager reminder',
    enabled: true,
    requires_confirmation: false,
    requires_reason: false,
    invocation: {
      kind: 'HTTP',
      path: '/api/candidate-app/workflows/example/actions/remind',
      fixed_body: fixedBody,
      required_user_inputs: [],
      idempotency: 'REQUIRED'
    }
  };
}

function expenseAction(componentId, fixedBody = { generation: 1 }) {
  return {
    ...action(fixedBody),
    code: 'REJECT_EXPENSE_CATEGORY',
    label: 'Reject expense',
    invocation: {
      ...action(fixedBody).invocation,
      path: '/api/candidate-app/workflows/example/actions/reject-expense-category',
      required_user_inputs: [{ name: 'reason_note', type: 'string', required: true, max_length: 1000 }]
    },
    componentId
  };
}

test('an unknown transport result reuses the same operation key on exact retry', async () => {
  const module = loadController();
  const seen = [];
  let reconciliations = 0;
  let attempt = 0;
  const controller = module.createCandidateOfficeActionController({
    api: {
      invokeOfficeCandidateAction: async input => {
        seen.push(input.idempotencyKey);
        attempt += 1;
        if (attempt === 1) throw Object.assign(new Error('Connection lost'), { code: 'CANDIDATE_OFFICE_NETWORK_ERROR' });
        return { ok: true, refresh_hints: { refetch: 'NONE' } };
      }
    },
    createIdempotencyKey: () => 'operation-key-1',
    ensureFresh: async () => true,
    refetchProjection: async () => { reconciliations += 1; },
    showToast: () => {}
  });
  const context = { surface: 'SIMPLE_TIMESHEET', identity: { row_key: 'row-a' }, action: action() };

  assert.equal((await controller.runTypedAction(context)).ok, false);
  assert.equal(reconciliations, 1);
  assert.equal((await controller.runTypedAction(context)).ok, true);
  assert.deepEqual(seen, ['operation-key-1', 'operation-key-1']);
});

test('changed factual input cannot replace an unresolved operation under the same logical action', async () => {
  const module = loadController();
  let calls = 0;
  const controller = module.createCandidateOfficeActionController({
    api: {
      invokeOfficeCandidateAction: async () => {
        calls += 1;
        throw Object.assign(new Error('Connection lost'), { code: 'CANDIDATE_OFFICE_NETWORK_ERROR' });
      }
    },
    createIdempotencyKey: () => 'operation-key-1',
    ensureFresh: async () => true,
    refetchProjection: async () => {},
    showToast: () => {}
  });
  const base = { surface: 'SIMPLE_TIMESHEET', identity: { row_key: 'row-a' } };
  await controller.runTypedAction({ ...base, action: action({ generation: 1 }) });
  const changed = await controller.runTypedAction({ ...base, action: action({ generation: 2 }) });
  assert.equal(changed.ok, false);
  assert.equal(changed.error.code, 'CANDIDATE_IDEMPOTENCY_CONFLICT');
  assert.equal(calls, 1);
});

test('a duplicate click cannot start a second in-flight mutation', async () => {
  const module = loadController();
  let calls = 0;
  let release;
  const firstResult = new Promise(resolve => { release = resolve; });
  const controller = module.createCandidateOfficeActionController({
    api: {
      invokeOfficeCandidateAction: async () => {
        calls += 1;
        await firstResult;
        return { ok: true, refresh_hints: { refetch: 'NONE' } };
      }
    },
    createIdempotencyKey: () => 'operation-key-1',
    ensureFresh: async () => true,
    refetchProjection: async () => {},
    showToast: () => {}
  });
  const context = { surface: 'SIMPLE_TIMESHEET', identity: { row_key: 'row-a' }, action: action() };
  const first = controller.runTypedAction(context);
  await new Promise(resolve => setImmediate(resolve));
  const second = await controller.runTypedAction(context);
  assert.equal(second.ok, false);
  assert.equal(second.busy, true);
  assert.equal(calls, 1);
  release();
  assert.equal((await first).ok, true);
});

test('expense-category rejection uses its dedicated decision modal and category-specific reconciliation', async () => {
  const module = loadController();
  const seen = [];
  const reconciled = [];
  const controller = module.createCandidateOfficeActionController({
    api: {
      invokeOfficeCandidateAction: async input => {
        seen.push(input);
        return { ok: true, owning_timesheet_deleted: false };
      }
    },
    createIdempotencyKey: () => 'expense-operation-key',
    ensureFresh: async context => ({
      projection: context.projection,
      action: context.action,
      expenseCategory: context.expenseCategory,
      expenseConfirmation: context.expenseConfirmation
    }),
    reconcileExpenseCategory: async (result, context) => reconciled.push({ result, context }),
    showToast: () => {}
  });
  const componentId = '00000000-0000-4000-8000-000000000101';
  const context = {
    surface: 'SIMPLE_TIMESHEET',
    identity: { row_key: 'row-a' },
    projection: { current_identity: { row_key: 'row-a' } },
    action: expenseAction(componentId, { generation: 2, expense_component_id: componentId, component_generation: 3, context_digest: 'a'.repeat(64) }),
    expenseComponentId: componentId,
    expenseCategory: { expense_component_id: componentId, label: 'Accommodation', amount: '£25.00' },
    expenseConfirmation: { empty_timesheet_consequence: 'NONE', will_delete_timesheet: false, supporting_evidence_count: 3 }
  };

  const result = await controller.runTypedAction(context);
  assert.equal(result.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].userInputs.reason_note, 'Incorrect expense.');
  assert.equal(seen[0].idempotencyKey, 'expense-operation-key');
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].context.expenseComponentId, componentId);
});

test('a committed expense rejection reports its safe refresh warning instead of a misleading ordinary success', async () => {
  const module = loadController();
  const toasts = [];
  const controller = module.createCandidateOfficeActionController({
    api: {
      invokeOfficeCandidateAction: async () => ({ ok: true, owning_timesheet_deleted: false })
    },
    createIdempotencyKey: () => 'expense-refresh-warning-key',
    ensureFresh: async context => ({
      projection: context.projection,
      action: context.action,
      expenseCategory: context.expenseCategory,
      expenseConfirmation: context.expenseConfirmation
    }),
    reconcileExpenseCategory: async () => ({
      refresh_failed: true,
      user_message: 'Expense rejected. Bulk Authorise was closed because the latest figures could not be reloaded. Reopen Bulk Authorise to continue.',
      toast_tone: 'ok'
    }),
    showToast: (message, tone) => toasts.push({ message, tone })
  });
  const componentId = '00000000-0000-4000-8000-000000000102';
  const context = {
    surface: 'BULK_AUTHORISE',
    identity: { row_key: 'row-a' },
    projection: { current_identity: { row_key: 'row-a' } },
    action: expenseAction(componentId, { generation: 2, expense_component_id: componentId, component_generation: 3, context_digest: 'b'.repeat(64) }),
    expenseComponentId: componentId,
    expenseCategory: { expense_component_id: componentId, label: 'Travel', amount: '£4.56' },
    expenseConfirmation: { empty_timesheet_consequence: 'NONE', will_delete_timesheet: false, supporting_evidence_count: 1 }
  };

  const result = await controller.runTypedAction(context);

  assert.equal(result.ok, true);
  assert.equal(result.reconciliation.refresh_failed, true);
  assert.deepEqual(toasts, [{
    message: 'Expense rejected. Bulk Authorise was closed because the latest figures could not be reloaded. Reopen Bulk Authorise to continue.',
    tone: 'ok'
  }]);
});

test('different expense categories do not share the duplicate-action lock', async () => {
  const module = loadController();
  const pending = [];
  const controller = module.createCandidateOfficeActionController({
    api: {
      invokeOfficeCandidateAction: async input => new Promise(resolve => pending.push(() => resolve({ ok: true, body: input })))
    },
    createIdempotencyKey: (() => { let index = 0; return () => `expense-operation-${++index}`; })(),
    ensureFresh: async context => ({ action: context.action, expenseCategory: context.expenseCategory, expenseConfirmation: context.expenseConfirmation }),
    reconcileExpenseCategory: async () => {},
    showToast: () => {}
  });
  const firstId = '00000000-0000-4000-8000-000000000111';
  const secondId = '00000000-0000-4000-8000-000000000112';
  const base = { surface: 'SIMPLE_TIMESHEET', identity: { row_key: 'row-a' }, expenseConfirmation: { empty_timesheet_consequence: 'NONE', will_delete_timesheet: false } };
  const first = controller.runTypedAction({ ...base, expenseComponentId: firstId, expenseCategory: { expense_component_id: firstId, label: 'Travel' }, action: expenseAction(firstId) });
  const second = controller.runTypedAction({ ...base, expenseComponentId: secondId, expenseCategory: { expense_component_id: secondId, label: 'Other' }, action: expenseAction(secondId) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2);
  pending.splice(0).forEach(release => release());
  assert.equal((await first).ok, true);
  assert.equal((await second).ok, true);
});
