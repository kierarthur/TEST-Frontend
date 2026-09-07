const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'candidate-office-contract-v1.js'), 'utf8');

function contract() {
  const context = vm.createContext({ window: {}, Object, Set, Map, String, Number, Array, JSON, Error });
  new vm.Script(source, { filename: 'candidate-office-contract-v1.js' }).runInContext(context);
  return context.window.CloudTMSCandidateOfficeContract;
}

const UUID_A = '00000000-0000-4000-8000-000000000001';
const UUID_B = '00000000-0000-4000-8000-000000000002';
const UUID_C = '00000000-0000-4000-8000-000000000003';
const UUID_D = '00000000-0000-4000-8000-000000000004';

function action(code = 'SEND_MANAGER_REMINDER', overrides = {}) {
  return {
    contract_version: 'OFFICE_CANDIDATE_ACTION_V1',
    code,
    label: code.replaceAll('_', ' '),
    group: 'MANAGER_APPROVAL',
    prominent: true,
    enabled: true,
    requires_confirmation: true,
    requires_reason: false,
    invocation: {
      version: 1,
      kind: 'HTTP',
      method: 'POST',
      path: `/api/candidate-app/workflows/${UUID_A}/actions/remind`,
      fixed_body: { expected_generation: 1 },
      required_user_inputs: [],
      idempotency: 'REQUIRED'
    },
    ...overrides
  };
}

function projection(rowKey, timesheetId, availableActions = []) {
  return {
    ok: true,
    contract_version: 'OFFICE_CANDIDATE_TIMESHEET_V1',
    office_contract_version: 'CLOUDTMS_OFFICE_CANDIDATE_API_V1',
    current_identity: { row_key: rowKey, timesheet_id: timesheetId, contract_week_id: null },
    candidate_status: { code: 'AWAITING_MANAGER_APPROVAL', label: 'Awaiting Manager Approval', tone: 'danger' },
    workflow: null,
    manager_approval: null,
    paper_pack: { state: 'NOT_APPLICABLE' },
    rejections: [],
    primary_action: availableActions[0] || null,
    available_actions: availableActions,
    diagnostics: [],
    refresh_hints: { refetch: 'ROW' },
    observed_at_utc: '2026-08-13T08:00:00Z'
  };
}

function expenseClaim(overrides = {}) {
  return {
    workflow_id: UUID_B,
    generation: 2,
    document_generation: 2,
    state: 'AWAITING_MANAGER_APPROVAL',
    status_code: 'MANAGER_APPROVAL_REQUIRED',
    manager_approval_state: 'PENDING',
    agency_authorisation_state: 'NOT_AUTHORISED',
    attention_code: null,
    target_timesheet_id: UUID_A,
    submitted_at_utc: '2026-09-06T08:00:00Z',
    updated_at_utc: '2026-09-06T08:00:00Z',
    protected: false,
    can_withdraw: true,
    totals: {
      expenses_pay_ex_vat: 37.5,
      expenses_description: 'Travel and accommodation',
      mileage_units: 0,
      mileage_pay_ex_vat: 0,
      travel_pay_ex_vat: 12.5,
      accommodation_pay_ex_vat: 25,
      other_pay_ex_vat: 0
    },
    supporting_evidence_count: 4,
    supporting_evidence_categories: ['TRAVEL', 'ACCOMMODATION'],
    categories: [
      {
        expense_component_id: UUID_C,
        component_generation: 1,
        expense_category: 'ACCOMMODATION',
        amount: 25,
        included_in_total: true,
        mileage_units: 0,
        supporting_evidence_count: 3,
        state: 'SUBMITTED',
        status_code: 'MANAGER_APPROVAL_REQUIRED',
        manager_approval_state: 'PENDING',
        agency_authorisation_state: 'NOT_AUTHORISED',
        owning_timesheet_id: UUID_A,
        refusal: null,
        protected: false,
        available_action: null
      }
    ],
    whole_claim_action: null,
    begin_update_action: null,
    update_state: 'NONE',
    ...overrides
  };
}

function attachExpenseCategoryRejection(input, routeFamily = 'ELECTRONIC', emptyTimesheetConsequence = 'NONE') {
  const category = input.expense_claims[0].categories[0];
  input.current_identity.route_family = routeFamily;
  category.office_rejection_action = action('REJECT_EXPENSE_CATEGORY', {
    label: 'Reject expense',
    group: 'EXPENSE',
    prominent: false,
    requires_reason: true,
    invocation: {
      version: 1,
      kind: 'HTTP',
      method: 'POST',
      path: `/api/candidate-app/workflows/${UUID_B}/actions/reject-expense-category`,
      fixed_body: {
        generation: 2,
        expense_component_id: UUID_C,
        component_generation: 1,
        confirmation_sha256: 'a'.repeat(64)
      },
      required_user_inputs: [{ name: 'reason_note', type: 'string', required: true, max_length: 1000 }],
      idempotency: 'REQUIRED'
    }
  });
  category.office_rejection_confirmation = {
    contract_version: 'OFFICE_EXPENSE_CATEGORY_REJECTION_CONFIRMATION_V1',
    confirmation_sha256: 'a'.repeat(64),
    expense_category: 'ACCOMMODATION',
    amount: 25,
    mileage_units: 0,
    supporting_evidence_count: 3,
    owning_timesheet_id: UUID_A,
    empty_timesheet_consequence: emptyTimesheetConsequence,
    will_delete_timesheet: emptyTimesheetConsequence === 'PERMANENT_REMOVE',
    remaining_hours: emptyTimesheetConsequence === 'NONE' ? 7.5 : 0,
    remaining_expense_total: emptyTimesheetConsequence === 'NONE' ? 12.5 : 0,
    route_family: routeFamily
  };
  return input;
}

test('expense component facts are normalized by a closed Office catalogue without exposing Candidate actions', () => {
  const api = contract();
  const input = projection('expense-row', UUID_A, []);
  input.expense_claims = [expenseClaim()];

  const normalized = api.normalizeOfficeCandidateProjection(input, { surface: 'SIMPLE_TIMESHEET' });
  assert.equal(normalized.expense_claims.length, 1);
  assert.equal(normalized.expense_claims[0].categories[0].expense_category, 'ACCOMMODATION');
  assert.equal(normalized.expense_claims[0].categories[0].included_in_total, true);
  assert.equal(normalized.expense_claims[0].categories[0].status_code, 'MANAGER_APPROVAL_REQUIRED');
  assert.equal(normalized.expense_claims[0].whole_claim_action, null);
  assert.equal(normalized.expense_claims[0].begin_update_action, null);

  const mixed = structuredClone(input);
  mixed.expense_claims[0].status_code = 'MIXED';
  mixed.expense_claims[0].manager_approval_state = 'MIXED';
  mixed.expense_claims[0].agency_authorisation_state = 'MIXED';
  assert.equal(
    api.normalizeOfficeCandidateProjection(mixed, { surface: 'SIMPLE_TIMESHEET' }).expense_claims[0].status_code,
    'MIXED'
  );

  const attention = structuredClone(input);
  attention.expense_claims[0].attention_code = 'MULTIPLE_PENDING_EXPENSE_CLAIMS';
  assert.equal(
    api.normalizeOfficeCandidateProjection(attention, { surface: 'SIMPLE_TIMESHEET' }).expense_claims[0].attention_code,
    'MULTIPLE_PENDING_EXPENSE_CLAIMS'
  );

  const unknown = structuredClone(input);
  unknown.expense_claims[0].categories[0].status_code = 'MAYBE_APPROVED';
  assert.throws(
    () => api.normalizeOfficeCandidateProjection(unknown, { surface: 'SIMPLE_TIMESHEET' }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );

  const missingTotalMembership = structuredClone(input);
  delete missingTotalMembership.expense_claims[0].categories[0].included_in_total;
  assert.throws(
    () => api.normalizeOfficeCandidateProjection(missingTotalMembership, { surface: 'SIMPLE_TIMESHEET' }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );

  const leakedCandidateAction = structuredClone(input);
  leakedCandidateAction.expense_claims[0].whole_claim_action = action('WITHDRAW_EXPENSE');
  assert.throws(
    () => api.normalizeOfficeCandidateProjection(leakedCandidateAction, { surface: 'SIMPLE_TIMESHEET' }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );
});

test('expense category rejection authority is accepted only for Candidate Electronic or QR records', () => {
  const api = contract();
  for (const routeFamily of ['ELECTRONIC', 'QR']) {
    const input = attachExpenseCategoryRejection(
      Object.assign(projection(`expense-${routeFamily}`, UUID_A, []), { expense_claims: [expenseClaim()] }),
      routeFamily
    );
    const category = api.normalizeOfficeCandidateProjection(input, { surface: 'SIMPLE_TIMESHEET' }).expense_claims[0].categories[0];
    assert.equal(category.rejection_action.code, 'REJECT_EXPENSE_CATEGORY');
    assert.equal(category.rejection_action.label, 'Reject expense');
  }

  for (const routeFamily of ['MANUAL_NON_QR', 'IMPORT_AUTHORITATIVE']) {
    const input = attachExpenseCategoryRejection(
      Object.assign(projection(`expense-${routeFamily}`, UUID_A, []), { expense_claims: [expenseClaim()] }),
      routeFamily
    );
    assert.throws(
      () => api.normalizeOfficeCandidateProjection(input, { surface: 'SIMPLE_TIMESHEET' }),
      error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID',
      routeFamily
    );
  }

  const contradictory = attachExpenseCategoryRejection(
    Object.assign(projection('expense-contradictory', UUID_A, []), { expense_claims: [expenseClaim()] }),
    'ELECTRONIC',
    'REMOVE_FROM_CURRENT_KEEP_HISTORY'
  );
  contradictory.expense_claims[0].categories[0].office_rejection_confirmation.will_delete_timesheet = true;
  assert.throws(
    () => api.normalizeOfficeCandidateProjection(contradictory, { surface: 'SIMPLE_TIMESHEET' }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );
});

test('expense category rejection V2 result preserves authoritative deletion and refresh identities', () => {
  const api = contract();
  const input = attachExpenseCategoryRejection(
    Object.assign(projection('expense-result', UUID_A, []), { expense_claims: [expenseClaim()] })
  );
  const normalizedProjection = api.normalizeOfficeCandidateProjection(input, { surface: 'SIMPLE_TIMESHEET' });
  const category = normalizedProjection.expense_claims[0].categories[0];
  const result = {
    ok: true,
    contract_version: 'OFFICE_EXPENSE_CATEGORY_REJECTION_RESULT_V2',
    operation_id: UUID_D,
    action_code: 'REJECT_EXPENSE_CATEGORY',
    workflow_id: UUID_B,
    expense_component_id: UUID_C,
    component_generation: 2,
    state: 'OFFICE_REJECTED',
    refusal: { kind: 'AGENCY_REJECTION', reason: 'Receipt is not allowable.', at_utc: '2026-09-06T09:00:00Z' },
    previous_owning_timesheet_id: UUID_A,
    empty_timesheet_consequence: 'NONE',
    owning_timesheet_deleted: false,
    deleted_timesheet_ids: [],
    retained_timesheet_ids: [UUID_A],
    affected_timesheet_ids: [UUID_A],
    removed_from_current_timesheet_ids: [],
    refresh_timesheet_ids: [UUID_A],
    refresh_hints: { summary: true, simple_timesheet: true, bulk_process: true, bulk_authorise: true, refetch: 'AFFECTED_ROWS' },
    idempotent_replay: false
  };

  const normalized = api.normalizeOfficeExpenseCategoryRejectionResult(result, {
    action: category.rejection_action,
    expenseCategory: category
  });
  assert.equal(normalized.component_generation, 2);
  assert.deepEqual(Array.from(normalized.retained_timesheet_ids), [UUID_A]);
  assert.equal(normalized.owning_timesheet_deleted, false);

  const permanentInput = attachExpenseCategoryRejection(
    Object.assign(projection('expense-result-permanent', UUID_A, []), { expense_claims: [expenseClaim()] }),
    'ELECTRONIC',
    'PERMANENT_REMOVE'
  );
  const permanentCategory = api.normalizeOfficeCandidateProjection(permanentInput, { surface: 'SIMPLE_TIMESHEET' }).expense_claims[0].categories[0];
  const deleted = structuredClone(result);
  deleted.empty_timesheet_consequence = 'PERMANENT_REMOVE';
  deleted.owning_timesheet_deleted = true;
  deleted.deleted_timesheet_ids = [UUID_A];
  deleted.retained_timesheet_ids = [];
  deleted.removed_from_current_timesheet_ids = [UUID_A];
  assert.equal(api.normalizeOfficeExpenseCategoryRejectionResult(deleted, {
    action: permanentCategory.rejection_action,
    expenseCategory: permanentCategory
  }).owning_timesheet_deleted, true);

  const retainedHistoryInput = attachExpenseCategoryRejection(
    Object.assign(projection('expense-result-history', UUID_A, []), { expense_claims: [expenseClaim()] }),
    'ELECTRONIC',
    'REMOVE_FROM_CURRENT_KEEP_HISTORY'
  );
  const retainedHistoryCategory = api.normalizeOfficeCandidateProjection(retainedHistoryInput, { surface: 'SIMPLE_TIMESHEET' }).expense_claims[0].categories[0];
  const retainedHistory = structuredClone(result);
  retainedHistory.empty_timesheet_consequence = 'REMOVE_FROM_CURRENT_KEEP_HISTORY';
  retainedHistory.removed_from_current_timesheet_ids = [UUID_A];
  const normalizedRetainedHistory = api.normalizeOfficeExpenseCategoryRejectionResult(retainedHistory, {
    action: retainedHistoryCategory.rejection_action,
    expenseCategory: retainedHistoryCategory
  });
  assert.equal(normalizedRetainedHistory.owning_timesheet_deleted, false);
  assert.deepEqual(Array.from(normalizedRetainedHistory.removed_from_current_timesheet_ids), [UUID_A]);

  const contradictoryResult = structuredClone(retainedHistory);
  contradictoryResult.owning_timesheet_deleted = true;
  assert.throws(
    () => api.normalizeOfficeExpenseCategoryRejectionResult(contradictoryResult, {
      action: retainedHistoryCategory.rejection_action,
      expenseCategory: retainedHistoryCategory
    }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );

  const incompleteRefresh = structuredClone(result);
  incompleteRefresh.refresh_hints.bulk_authorise = false;
  assert.throws(
    () => api.normalizeOfficeExpenseCategoryRejectionResult(incompleteRefresh, { action: category.rejection_action, expenseCategory: category }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );

  const expandedRefresh = structuredClone(result);
  expandedRefresh.refresh_hints.extra = true;
  assert.throws(
    () => api.normalizeOfficeExpenseCategoryRejectionResult(expandedRefresh, { action: category.rejection_action, expenseCategory: category }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );

  const expandedRefusal = structuredClone(result);
  expandedRefusal.refusal.refused_at_utc = expandedRefusal.refusal.at_utc;
  assert.throws(
    () => api.normalizeOfficeExpenseCategoryRejectionResult(expandedRefusal, { action: category.rejection_action, expenseCategory: category }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );

  const managerRefusal = structuredClone(result);
  managerRefusal.refusal.kind = 'MANAGER_REFUSAL';
  assert.throws(
    () => api.normalizeOfficeExpenseCategoryRejectionResult(managerRefusal, { action: category.rejection_action, expenseCategory: category }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );

  const wrongWorkflow = structuredClone(result);
  wrongWorkflow.workflow_id = UUID_D;
  assert.throws(
    () => api.normalizeOfficeExpenseCategoryRejectionResult(wrongWorkflow, { action: category.rejection_action, expenseCategory: category }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );
});

test('stale expense-category confirmation fails with refresh guidance and no retry ambiguity', () => {
  const normalized = contract().normalizeCandidateOfficeError({
    status: 409,
    code: 'CANDIDATE_EXPENSE_CATEGORY_CONTEXT_CHANGED',
    message: 'internal detail must not replace the friendly copy'
  });
  assert.equal(normalized.code, 'CANDIDATE_EXPENSE_CATEGORY_CONTEXT_CHANGED');
  assert.equal(normalized.status, 409);
  assert.equal(normalized.stale, true);
  assert.equal(normalized.retryable, false);
  assert.equal(normalized.message, 'This expense category has changed since it was loaded. Refresh and review the current details.');
});

test('primary action must exactly match one enabled prominent available action', () => {
  const api = contract();
  const available = action();
  assert.equal(api.normalizeOfficeCandidateProjection(projection('row-a', UUID_A, [available])).primary_action.code, available.code);

  const mismatched = projection('row-a', UUID_A, [available]);
  mismatched.primary_action = action('SEND_MANAGER_REMINDER', {
    invocation: { ...available.invocation, path: `/api/candidate-app/workflows/${UUID_B}/actions/remind` }
  });
  assert.throws(
    () => api.normalizeOfficeCandidateProjection(mismatched),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );

  const disabled = action('SEND_MANAGER_REMINDER', { enabled: false, disabled_reason: 'Not eligible' });
  assert.throws(
    () => api.normalizeOfficeCandidateProjection(projection('row-a', UUID_A, [disabled])),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );
});

test('projection rejects duplicate action codes and normalizes rejection recovery envelopes', () => {
  const api = contract();
  assert.throws(
    () => api.normalizeOfficeCandidateProjection(projection('row-a', UUID_A, [action(), action()])),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );

  const input = projection('row-a', UUID_A, []);
  input.rejections = [{ state: 'REJECTED', rejection_actionable: true, recovery_action: action('RESUBMIT_REJECTED', {
    group: 'RECOVERY',
    prominent: false,
    invocation: {
      version: 1,
      kind: 'CLIENT_DESTINATION',
      method: null,
      path: `/candidate/submissions/${UUID_A}/resubmit`,
      fixed_body: {},
      required_user_inputs: [],
      idempotency: 'NONE'
    }
  }) }];
  const normalized = api.normalizeOfficeCandidateProjection(input);
  assert.equal(normalized.rejections[0].recovery_action.code, 'RESUBMIT_REJECTED');
  assert.equal(normalized.rejections[0].recovery_action.invocation.kind, 'CLIENT_DESTINATION');

  const historical = projection('row-a', UUID_A, []);
  historical.rejections = [{
    state: 'REJECTED',
    rejection_actionable: false,
    replacement_workflow_id: UUID_B,
    recovery_action: action('RESUBMIT_REJECTED')
  }];
  assert.throws(
    () => api.normalizeOfficeCandidateProjection(historical),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );
});

test('authorised or financially protected submissions cannot expose enabled Office rejection', () => {
  const api = contract();
  const rejection = action('REJECT_CANDIDATE_SUBMISSION', {
    group: 'REJECTION',
    invocation: {
      version: 1,
      kind: 'HTTP',
      method: 'GET',
      path: `/api/candidate-app/timesheets/${UUID_A}/reject-preview`,
      fixed_body: {},
      required_user_inputs: [],
      idempotency: 'NONE'
    }
  });

  for (const code of ['AUTHORISED', 'INVOICED_NOT_PAID', 'PAID']) {
    const input = projection('row-a', UUID_A, [rejection]);
    input.candidate_status = { code, label: code, tone: 'warning' };
    assert.throws(
      () => api.normalizeOfficeCandidateProjection(input),
      error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
    );
  }

  const disabled = { ...rejection, enabled: false, prominent: false, disabled_reason: 'Unauthorise this timesheet first.' };
  const input = projection('row-a', UUID_A, [disabled]);
  input.primary_action = null;
  input.candidate_status = { code: 'AUTHORISED', label: 'Authorised', tone: 'success' };
  assert.equal(api.normalizeOfficeCandidateProjection(input).available_actions[0].enabled, false);
});

test('manager and PAPER facts are validated before presentation', () => {
  const api = contract();
  const input = projection('row-a', UUID_A, []);
  input.manager_approval = {
    method: 'email',
    request_id: UUID_B,
    request_generation: 3,
    state: 'pending',
    resend_count: 2,
    resends_remaining: 3
  };
  input.paper_pack = { state: 'PREPARING', retryable: false };
  const normalized = api.normalizeOfficeCandidateProjection(input);
  assert.equal(normalized.manager_approval.method, 'EMAIL');
  assert.equal(normalized.manager_approval.request_generation, 3);
  assert.equal(normalized.paper_pack.state, 'PREPARING');

  const invalidPaper = projection('row-a', UUID_A, []);
  invalidPaper.paper_pack = { state: 'PREPARING', retryable: true };
  assert.throws(
    () => api.normalizeOfficeCandidateProjection(invalidPaper),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );
});

test('PHONE workflows fail closed if EMAIL request controls are advertised', () => {
  const api = contract();
  for (const code of ['SEND_MANAGER_REMINDER', 'RENEW_MANAGER_REQUEST', 'CANCEL_MANAGER_REQUEST']) {
    const input = projection('row-a', UUID_A, [action(code)]);
    input.manager_approval = {
      method: 'PHONE', request_id: UUID_B, request_generation: 1,
      state: 'PENDING', resend_count: 0, resends_remaining: 0
    };
    assert.throws(
      () => api.normalizeOfficeCandidateProjection(input),
      error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
    );
  }
});

test('bounded batch returns every requested identity exactly once', () => {
  const api = contract();
  const identities = [
    { row_key: 'row-a', timesheet_id: UUID_A },
    { row_key: 'row-b', timesheet_id: UUID_B }
  ];
  const good = {
    ok: true,
    contract_version: 'OFFICE_CANDIDATE_PROJECTION_BATCH_V1',
    surface: 'TIMESHEET_SUMMARY',
    result_count: 2,
    results: [
      { ok: true, correlation_key: 'row-a', projection: projection('row-a', UUID_A) },
      { ok: true, correlation_key: 'row-b', projection: projection('row-b', UUID_B) }
    ]
  };
  assert.equal(api.normalizeOfficeCandidateProjectionBatch(good, { surface: 'TIMESHEET_SUMMARY', identities }).results.length, 2);

  const duplicate = structuredClone(good);
  duplicate.results[1].correlation_key = 'row-a';
  duplicate.results[1].projection.current_identity.row_key = 'row-a';
  assert.throws(
    () => api.normalizeOfficeCandidateProjectionBatch(duplicate, { surface: 'TIMESHEET_SUMMARY', identities }),
    error => error.code === 'CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID'
  );

  const foreign = structuredClone(good);
  foreign.results[1].correlation_key = 'row-c';
  foreign.results[1].projection.current_identity.row_key = 'row-c';
  assert.throws(
    () => api.normalizeOfficeCandidateProjectionBatch(foreign, { surface: 'TIMESHEET_SUMMARY', identities }),
    error => error.code === 'CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID'
  );

  const missing = structuredClone(good);
  missing.result_count = 1;
  missing.results.pop();
  assert.throws(
    () => api.normalizeOfficeCandidateProjectionBatch(missing, { surface: 'TIMESHEET_SUMMARY', identities }),
    error => error.code === 'CANDIDATE_OFFICE_CONTRACT_INVALID'
  );
});

test('single projection requires the exact requested timesheet and contract-week identity', () => {
  const api = contract();
  const input = projection('row-a', UUID_A, []);
  input.current_identity.contract_week_id = UUID_B;
  const requested = { row_key: 'row-a', timesheet_id: UUID_A, contract_week_id: UUID_B };
  assert.equal(api.normalizeOfficeCandidateProjection(input, { rowIdentity: requested }).current_identity.timesheet_id, UUID_A);

  assert.throws(
    () => api.normalizeOfficeCandidateProjection(input, {
      rowIdentity: { row_key: 'row-a', timesheet_id: '00000000-0000-4000-8000-000000000009', contract_week_id: UUID_B }
    }),
    error => error.code === 'CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID'
  );
});

test('single projection rejects stale or moved identity before presentation', () => {
  const api = contract();
  const base = projection('row-a', UUID_A);
  assert.throws(
    () => api.normalizeOfficeCandidateProjection(base, {
      surface: 'SIMPLE_TIMESHEET',
      rowIdentity: { ...base.current_identity, expected_row_signature: 'old-signature' }
    }),
    error => error.code === 'CANDIDATE_CONTEXT_STALE'
  );
  assert.throws(
    () => api.normalizeOfficeCandidateProjection({
      ...base,
      current_identity: { ...base.current_identity, row_signature: 'new-signature', stale_signature: true }
    }, {
      surface: 'SIMPLE_TIMESHEET',
      rowIdentity: { ...base.current_identity, expected_row_signature: 'old-signature' }
    }),
    error => error.code === 'CANDIDATE_CONTEXT_STALE'
  );
  assert.throws(
    () => api.normalizeOfficeCandidateProjection({
      ...base,
      current_identity: { ...base.current_identity, moved: true }
    }, { surface: 'SIMPLE_TIMESHEET', rowIdentity: base.current_identity }),
    error => error.code === 'CANDIDATE_TIMESHEET_MOVED'
  );
});

test('route preview keeps the server action separate from its boolean permission gate', () => {
  const api = contract();
  const preview = {
    ok: true,
    action: 'REISSUE_QR',
    permitted_action: true,
    expected_timesheet_id: UUID_A,
    expected_row_signature: 'current-row-signature',
    context_sha256: 'a'.repeat(64)
  };

  const normalized = api.normalizeCandidateRoutePreview(preview);
  assert.equal(normalized.permitted_action, 'REISSUE_QR');
  assert.equal(normalized.expected_timesheet_id, UUID_A);

  assert.throws(
    () => api.normalizeCandidateRoutePreview({ ...preview, permitted_action: false }),
    error => error.code === 'CANDIDATE_ACTION_NOT_ELIGIBLE'
  );
});
