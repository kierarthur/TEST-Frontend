(() => {
  'use strict';

  const VERSIONS = Object.freeze({
    office: 'CLOUDTMS_OFFICE_CANDIDATE_API_V1',
    capabilities: 'OFFICE_CANDIDATE_CAPABILITIES_V1',
    projection: 'OFFICE_CANDIDATE_TIMESHEET_V1',
    projectionBatch: 'OFFICE_CANDIDATE_PROJECTION_BATCH_V1',
    action: 'OFFICE_CANDIDATE_ACTION_V1',
    rejectionPreview: 'OFFICE_CANDIDATE_REJECTION_PREVIEW_V1',
    reminderEligibility: 'OFFICE_CANDIDATE_REMINDER_ELIGIBILITY_PAGE_V1',
    reminderPreview: 'OFFICE_CANDIDATE_REMINDER_BATCH_PREVIEW_V1',
    reminderResult: 'OFFICE_CANDIDATE_REMINDER_BATCH_RESULT_V1',
    expenseCategoryRejectionResult: 'OFFICE_EXPENSE_CATEGORY_REJECTION_RESULT_V2',
    mutation: 'OFFICE_CANDIDATE_MUTATION_RESULT_V1'
  });
  const SURFACES = Object.freeze([
    'SIMPLE_TIMESHEET', 'TIMESHEET_SUMMARY', 'BULK_PROCESS',
    'BULK_AUTHORISE', 'INVOICE_GENERATOR', 'INVOICE_ISSUER'
  ]);
  const PAPER_STATES = new Set([
    'NOT_APPLICABLE', 'PREPARING', 'BACKOFF', 'READY', 'RETURN_RECEIVED',
    'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'RETIRED', 'STALE'
  ]);
  const HTTP_METHODS = new Set(['GET', 'POST']);
  const IDEMPOTENCY = new Set(['NONE', 'REQUIRED']);
  const EXPENSE_CATEGORIES = new Set(['MILEAGE', 'TRAVEL', 'ACCOMMODATION', 'OTHER']);
  const EXPENSE_COMPONENT_STATES = new Set(['DRAFT', 'SUBMITTED', 'MANAGER_APPROVED', 'MANAGER_REFUSED', 'OFFICE_REJECTED', 'WITHDRAWN', 'CANCELLED', 'SUPERSEDED']);
  const EXPENSE_COMPONENT_STATUS_CODES = new Set(['DRAFT', 'SUBMITTED', 'MANAGER_APPROVAL_REQUIRED', 'MANAGER_APPROVED', 'AGENCY_AUTHORISED', 'INVOICED', 'PAID', 'MANAGER_REFUSED', 'AGENCY_REJECTED', 'WITHDRAWN', 'CANCELLED', 'SUPERSEDED']);
  const EXPENSE_CLAIM_STATUS_CODES = new Set([
    'DRAFT', 'SUBMITTED', 'MANAGER_APPROVAL_REQUIRED', 'MANAGER_APPROVED',
    'AGENCY_AUTHORISED', 'INVOICED', 'PAID', 'MANAGER_REFUSED',
    'AGENCY_REJECTED', 'WITHDRAWN', 'CANCELLED', 'SUPERSEDED', 'MIXED'
  ]);
  const EXPENSE_MANAGER_STATES = new Set(['NOT_REQUESTED', 'PENDING', 'APPROVED', 'REFUSED']);
  const EXPENSE_AGENCY_STATES = new Set(['NOT_AUTHORISED', 'AUTHORISED', 'INVOICED', 'PAID']);
  const EXPENSE_CLAIM_MANAGER_STATES = new Set([...EXPENSE_MANAGER_STATES, 'MIXED']);
  const EXPENSE_CLAIM_AGENCY_STATES = new Set([...EXPENSE_AGENCY_STATES, 'MIXED']);
  const EXPENSE_UPDATE_STATES = new Set(['NONE', 'UPDATING']);
  const EXPENSE_REFUSAL_KINDS = new Set(['MANAGER_REFUSAL', 'AGENCY_REJECTION']);
  const EMPTY_TIMESHEET_CONSEQUENCES = new Set([
    'NONE', 'PERMANENT_REMOVE', 'REMOVE_FROM_CURRENT_KEEP_HISTORY'
  ]);
  const EXPENSE_ATTENTION_CODES = new Set(['MULTIPLE_PENDING_EXPENSE_CLAIMS']);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SHA_RE = /^[a-f0-9]{64}$/;
  const CANONICAL_ACTION_LABELS = Object.freeze({
    REJECT_CANDIDATE_SUBMISSION: 'Reject Candidate Submission',
    REJECT_EXPENSE_CATEGORY: 'Reject expense',
    SEND_MANAGER_REMINDER: 'Send manager reminder',
    RENEW_MANAGER_REQUEST: 'Request manager approval again',
    CANCEL_MANAGER_REQUEST: 'Cancel manager approval request'
  });

  class CandidateOfficeContractError extends Error {
    constructor(code, message, details = null) {
      super(message);
      this.name = 'CandidateOfficeContractError';
      this.code = code;
      this.details = details;
    }
  }

  const fail = (code, message, details) => { throw new CandidateOfficeContractError(code, message, details); };
  const object = (value, name) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `${name} must be an object.`);
    return value;
  };
  const text = (value, name, { nullable = false, max = 4096 } = {}) => {
    if (nullable && value == null) return null;
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `${name} is invalid.`);
    return value.trim();
  };
  const boolean = (value, name) => {
    if (typeof value !== 'boolean') fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `${name} must be a boolean.`);
    return value;
  };
  const integer = (value, name, minimum = 0) => {
    if (!Number.isInteger(value) || value < minimum) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `${name} must be an integer of at least ${minimum}.`);
    return value;
  };
  const optionalInteger = (value, name, minimum = 0) => {
    if (value == null) return null;
    return integer(value, name, minimum);
  };
  const finiteNumber = (value, name, minimum = 0) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `${name} must be a finite number of at least ${minimum}.`);
    return value;
  };
  const enumValue = (value, values, name) => {
    const normalized = text(value, name, { max: 128 }).toUpperCase();
    if (!values.has(normalized)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `${name} is unknown.`);
    return normalized;
  };
  const version = (value, expected, name = 'contract_version') => {
    if (value !== expected) fail('CANDIDATE_OFFICE_CONTRACT_VERSION_UNSUPPORTED', `${name} is not supported.`, { expected, actual: value ?? null });
    return value;
  };
  const optionalUuid = (value, name) => {
    if (value == null || value === '') return null;
    const normalized = text(value, name, { max: 36 });
    if (!UUID_RE.test(normalized)) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', `${name} is invalid.`);
    return normalized;
  };
  const optionalSha = (value, name) => {
    if (value == null || value === '') return null;
    const normalized = text(value, name, { max: 64 }).toLowerCase();
    if (!SHA_RE.test(normalized)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `${name} is invalid.`);
    return normalized;
  };
  const optionalText = (value, name, max) => {
    if (value == null || value === '') return null;
    return text(value, name, { max });
  };
  const freeze = (value) => Object.freeze(value);
  const canonicalJson = value => {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  };

  function assertCandidateOfficeContractVersion(value) {
    return version(value, VERSIONS.office, 'office_contract_version');
  }

  function normalizeOfficeCandidateIdentity(raw, { requireRowKey = true } = {}) {
    const src = object(raw, 'identity');
    const rowKey = src.row_key == null ? '' : String(src.row_key).trim();
    if (requireRowKey && (!rowKey || rowKey.length > 256)) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', 'row_key is required.');
    const timesheetId = optionalUuid(src.timesheet_id, 'timesheet_id');
    const contractWeekId = optionalUuid(src.contract_week_id, 'contract_week_id');
    if (!timesheetId && !contractWeekId) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', 'A timesheet or contract-week identity is required.');
    return freeze({
      row_key: rowKey || timesheetId || contractWeekId,
      timesheet_id: timesheetId,
      contract_week_id: contractWeekId,
      expected_row_signature: optionalText(src.expected_row_signature, 'expected_row_signature', 256)
    });
  }

  function normalizeOfficeCandidateCapabilities(raw) {
    const src = object(raw, 'capabilities');
    if (src.ok !== true) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Capabilities were not accepted.');
    version(src.contract_version, VERSIONS.office);
    version(src.office_contract_version, VERSIONS.office, 'office_contract_version');
    version(src.capabilities_version, VERSIONS.capabilities, 'capabilities_version');
    if (src.mode !== 'ENABLED' || src.required_office_role !== 'admin' || src.permission_source !== 'OFFICE_ADMIN_ROLE_V1') {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Office capability authority is not the frozen admin contract.');
    }
    const surfaces = object(src.surfaces, 'surfaces');
    const permissions = object(src.permissions, 'permissions');
    const normalizedSurfaces = {};
    for (const surface of SURFACES) {
      const key = surface.toLowerCase();
      normalizedSurfaces[key] = boolean(surfaces[key], `surfaces.${key}`);
    }
    const requiredPermissions = [
      'view_candidate_state', 'change_route', 'reject_submission', 'resubmit_rejected',
      'send_manager_reminder', 'send_manager_reminder_batch', 'renew_manager_request',
      'cancel_manager_request', 'manage_phone_approval', 'manage_paper',
      'retry_finalisation', 'mark_no_work'
    ];
    const normalizedPermissions = {};
    requiredPermissions.forEach(key => { normalizedPermissions[key] = boolean(permissions[key], `permissions.${key}`); });
    return freeze({
      ...src,
      authority_applies: boolean(src.authority_applies, 'authority_applies'),
      mode: 'ENABLED',
      surfaces: freeze(normalizedSurfaces),
      permissions: freeze(normalizedPermissions)
    });
  }

  function normalizeOfficeCandidateAction(raw) {
    const src = object(raw, 'action');
    version(src.contract_version, VERSIONS.action);
    const invocation = object(src.invocation, 'action.invocation');
    integer(invocation.version, 'action.invocation.version', 1);
    if (invocation.version !== 1) fail('CANDIDATE_OFFICE_CONTRACT_VERSION_UNSUPPORTED', 'Action invocation version is not supported.');
    const kind = text(invocation.kind, 'action.invocation.kind', { max: 32 }).toUpperCase();
    if (!['HTTP', 'CLIENT_DESTINATION'].includes(kind)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Action invocation kind is invalid.');
    const method = invocation.method == null ? null : String(invocation.method).trim().toUpperCase();
    if ((kind === 'HTTP' && !HTTP_METHODS.has(method)) || (kind === 'CLIENT_DESTINATION' && method != null)) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Action invocation method is invalid.');
    }
    const path = text(invocation.path, 'action.invocation.path', { max: 2048 });
    if (kind === 'HTTP' && !path.startsWith('/api/candidate-app/')) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Action path is outside the frozen Office API.');
    const requiredUserInputs = Array.isArray(invocation.required_user_inputs) ? invocation.required_user_inputs.map((item, index) => freeze({ ...object(item, `required_user_inputs[${index}]`) })) : fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'required_user_inputs must be an array.');
    const idempotency = text(invocation.idempotency, 'action.invocation.idempotency', { max: 16 }).toUpperCase();
    if (!IDEMPOTENCY.has(idempotency)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Action idempotency contract is invalid.');
    const code = text(src.code, 'action.code', { max: 128 }).toUpperCase();
    return freeze({
      contract_version: VERSIONS.action,
      code,
      label: CANONICAL_ACTION_LABELS[code] || text(src.label, 'action.label', { max: 256 }),
      group: text(src.group, 'action.group', { max: 128 }).toUpperCase(),
      prominent: src.prominent === true,
      enabled: boolean(src.enabled, 'action.enabled'),
      disabled_reason_code: src.disabled_reason_code == null ? null : String(src.disabled_reason_code).trim() || null,
      disabled_reason: src.disabled_reason == null ? null : String(src.disabled_reason).trim() || null,
      requires_confirmation: src.requires_confirmation === true,
      requires_reason: src.requires_reason === true,
      invocation: freeze({
        version: 1,
        kind,
        method,
        path,
        fixed_body: freeze({ ...object(invocation.fixed_body, 'action.invocation.fixed_body') }),
        required_user_inputs: freeze(requiredUserInputs),
        idempotency
      })
    });
  }

  function normalizeOfficeExpenseCategory(raw, index, { surface = null, routeFamily = null, workflowId = null, workflowGeneration = null } = {}) {
    const src = object(raw, `expense category ${index + 1}`);
    const componentId = optionalUuid(src.expense_component_id, `expense_claims.categories[${index}].expense_component_id`);
    if (!componentId) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `expense_claims.categories[${index}].expense_component_id is required.`);
    const state = enumValue(src.state, EXPENSE_COMPONENT_STATES, `expense_claims.categories[${index}].state`);
    const statusCode = enumValue(src.status_code, EXPENSE_COMPONENT_STATUS_CODES, `expense_claims.categories[${index}].status_code`);
    const managerApprovalState = enumValue(src.manager_approval_state, EXPENSE_MANAGER_STATES, `expense_claims.categories[${index}].manager_approval_state`);
    const agencyAuthorisationState = enumValue(src.agency_authorisation_state, EXPENSE_AGENCY_STATES, `expense_claims.categories[${index}].agency_authorisation_state`);
    const category = enumValue(src.expense_category, EXPENSE_CATEGORIES, `expense_claims.categories[${index}].expense_category`);
    const isProtected = boolean(src.protected, `expense_claims.categories[${index}].protected`);
    const refusal = src.refusal == null ? null : object(src.refusal, `expense_claims.categories[${index}].refusal`);
    const normalizedRefusal = refusal == null ? null : freeze({
      ...refusal,
      kind: enumValue(refusal.kind, EXPENSE_REFUSAL_KINDS, `expense_claims.categories[${index}].refusal.kind`),
      reason: text(refusal.reason, `expense_claims.categories[${index}].refusal.reason`, { max: 1000 }),
      at_utc: text(refusal.at_utc, `expense_claims.categories[${index}].refusal.at_utc`, { max: 64 })
    });
    if (src.available_action != null) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Candidate expense actions must not be exposed to Office.');
    if (src.rejection_action != null || src.rejection_confirmation != null) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Expense rejection authority must use the frozen Office-only fields.');
    }
    const rejectionAction = src.office_rejection_action == null ? null : normalizeOfficeCandidateAction(src.office_rejection_action);
    const rejectionConfirmationSource = src.office_rejection_confirmation == null ? null : object(src.office_rejection_confirmation, `expense_claims.categories[${index}].office_rejection_confirmation`);
    const rejectionEmptyTimesheetConsequence = rejectionConfirmationSource == null ? null : enumValue(
      rejectionConfirmationSource.empty_timesheet_consequence,
      EMPTY_TIMESHEET_CONSEQUENCES,
      `expense_claims.categories[${index}].office_rejection_confirmation.empty_timesheet_consequence`
    );
    const rejectionWillDeleteTimesheet = rejectionConfirmationSource == null ? null : boolean(
      rejectionConfirmationSource.will_delete_timesheet,
      `expense_claims.categories[${index}].office_rejection_confirmation.will_delete_timesheet`
    );
    if (rejectionConfirmationSource != null
        && rejectionWillDeleteTimesheet !== (rejectionEmptyTimesheetConsequence === 'PERMANENT_REMOVE')) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Expense rejection confirmation has a contradictory empty Timesheet consequence.');
    }
    const rejectionConfirmation = rejectionConfirmationSource == null ? null : freeze({
      contract_version: text(rejectionConfirmationSource.contract_version, `expense_claims.categories[${index}].office_rejection_confirmation.contract_version`, { max: 128 }),
      confirmation_sha256: optionalSha(rejectionConfirmationSource.confirmation_sha256, `expense_claims.categories[${index}].office_rejection_confirmation.confirmation_sha256`),
      expense_category: enumValue(rejectionConfirmationSource.expense_category, EXPENSE_CATEGORIES, `expense_claims.categories[${index}].office_rejection_confirmation.expense_category`),
      amount: finiteNumber(rejectionConfirmationSource.amount, `expense_claims.categories[${index}].office_rejection_confirmation.amount`, 0),
      mileage_units: finiteNumber(rejectionConfirmationSource.mileage_units, `expense_claims.categories[${index}].office_rejection_confirmation.mileage_units`, 0),
      supporting_evidence_count: integer(rejectionConfirmationSource.supporting_evidence_count, `expense_claims.categories[${index}].office_rejection_confirmation.supporting_evidence_count`, 0),
      owning_timesheet_id: optionalUuid(rejectionConfirmationSource.owning_timesheet_id, `expense_claims.categories[${index}].office_rejection_confirmation.owning_timesheet_id`),
      empty_timesheet_consequence: rejectionEmptyTimesheetConsequence,
      will_delete_timesheet: rejectionWillDeleteTimesheet,
      remaining_hours: finiteNumber(rejectionConfirmationSource.remaining_hours, `expense_claims.categories[${index}].office_rejection_confirmation.remaining_hours`, 0),
      remaining_expense_total: finiteNumber(rejectionConfirmationSource.remaining_expense_total, `expense_claims.categories[${index}].office_rejection_confirmation.remaining_expense_total`, 0),
      route_family: text(rejectionConfirmationSource.route_family, `expense_claims.categories[${index}].office_rejection_confirmation.route_family`, { max: 32 }).toUpperCase()
    });
    if ((rejectionAction == null) !== (rejectionConfirmation == null)) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'An expense rejection action and its confirmation must be supplied together.');
    }
    if (rejectionAction) {
      const normalizedSurface = String(surface || '').toUpperCase();
      const normalizedRouteFamily = String(routeFamily || '').toUpperCase();
      const fixed = rejectionAction.invocation.fixed_body;
      const expectedPath = `/api/candidate-app/workflows/${workflowId}/actions/reject-expense-category`;
      const expectedInputs = [{ name: 'reason_note', type: 'string', required: true, max_length: 1000 }];
      const fixedKeys = Object.keys(fixed).sort();
      if (!['SIMPLE_TIMESHEET', 'BULK_AUTHORISE'].includes(normalizedSurface)
          || !['ELECTRONIC', 'QR'].includes(normalizedRouteFamily)
          || rejectionAction.code !== 'REJECT_EXPENSE_CATEGORY'
          || rejectionAction.enabled !== true
          || rejectionAction.prominent !== false
          || rejectionAction.requires_confirmation !== true
          || rejectionAction.requires_reason !== true
          || rejectionAction.invocation.kind !== 'HTTP'
          || rejectionAction.invocation.method !== 'POST'
          || rejectionAction.invocation.path !== expectedPath
          || rejectionAction.invocation.idempotency !== 'REQUIRED'
          || canonicalJson(rejectionAction.invocation.required_user_inputs) !== canonicalJson(expectedInputs)
          || canonicalJson(fixedKeys) !== canonicalJson(['component_generation', 'confirmation_sha256', 'expense_component_id', 'generation'])
          || fixed.generation !== workflowGeneration
          || agencyAuthorisationState !== 'NOT_AUTHORISED'
          || !['SUBMITTED', 'MANAGER_APPROVED'].includes(state)
          || isProtected
          || fixed.expense_component_id !== componentId
          || fixed.component_generation !== src.component_generation
          || String(fixed.confirmation_sha256 || '').toLowerCase() !== rejectionConfirmation.confirmation_sha256
          || !rejectionConfirmation.confirmation_sha256
          || rejectionConfirmation.expense_category !== category
          || rejectionConfirmation.amount !== src.amount
          || rejectionConfirmation.mileage_units !== src.mileage_units
          || rejectionConfirmation.supporting_evidence_count !== src.supporting_evidence_count
          || !rejectionConfirmation.owning_timesheet_id
          || rejectionConfirmation.owning_timesheet_id !== src.owning_timesheet_id
          || rejectionConfirmation.route_family !== normalizedRouteFamily) {
        fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'An expense rejection action was exposed outside its exact eligible category context.');
      }
      if (rejectionConfirmation.contract_version !== 'OFFICE_EXPENSE_CATEGORY_REJECTION_CONFIRMATION_V1') {
        fail('CANDIDATE_OFFICE_CONTRACT_VERSION_UNSUPPORTED', 'Expense rejection confirmation version is not supported.');
      }
    }
    return freeze({
      ...src,
      expense_component_id: componentId,
      component_generation: integer(src.component_generation, `expense_claims.categories[${index}].component_generation`, 1),
      expense_category: category,
      amount: finiteNumber(src.amount, `expense_claims.categories[${index}].amount`, 0),
      included_in_total: boolean(src.included_in_total, `expense_claims.categories[${index}].included_in_total`),
      mileage_units: finiteNumber(src.mileage_units, `expense_claims.categories[${index}].mileage_units`, 0),
      supporting_evidence_count: integer(src.supporting_evidence_count, `expense_claims.categories[${index}].supporting_evidence_count`, 0),
      state,
      status_code: statusCode,
      manager_approval_state: managerApprovalState,
      agency_authorisation_state: agencyAuthorisationState,
      owning_timesheet_id: optionalUuid(src.owning_timesheet_id, `expense_claims.categories[${index}].owning_timesheet_id`),
      refusal: normalizedRefusal,
      protected: isProtected,
      available_action: null,
      office_rejection_action: rejectionAction,
      office_rejection_confirmation: rejectionConfirmation,
      rejection_action: rejectionAction,
      rejection_confirmation: rejectionConfirmation
    });
  }

  function normalizeOfficeExpenseClaim(raw, index, { surface = null, routeFamily = null } = {}) {
    const src = object(raw, `expense_claims[${index}]`);
    const workflowId = optionalUuid(src.workflow_id, `expense_claims[${index}].workflow_id`);
    if (!workflowId) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `expense_claims[${index}].workflow_id is required.`);
    const workflowGeneration = integer(src.generation, `expense_claims[${index}].generation`, 1);
    const totals = object(src.totals, `expense_claims[${index}].totals`);
    const categories = Array.isArray(src.categories)
      ? src.categories.map((category, categoryIndex) => normalizeOfficeExpenseCategory(category, categoryIndex, { surface, routeFamily, workflowId, workflowGeneration }))
      : fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `expense_claims[${index}].categories must be an array.`);
    const supportingEvidenceCategories = Array.isArray(src.supporting_evidence_categories)
      ? src.supporting_evidence_categories.map((category, categoryIndex) => enumValue(category, EXPENSE_CATEGORIES, `expense_claims[${index}].supporting_evidence_categories[${categoryIndex}]`))
      : fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `expense_claims[${index}].supporting_evidence_categories must be an array.`);
    if (src.whole_claim_action != null || src.begin_update_action != null) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Candidate-only whole-claim or update actions must not be exposed to Office.');
    }
    const attentionCode = src.attention_code == null
      ? null
      : enumValue(src.attention_code, EXPENSE_ATTENTION_CODES, `expense_claims[${index}].attention_code`);
    return freeze({
      ...src,
      workflow_id: workflowId,
      generation: workflowGeneration,
      document_generation: integer(src.document_generation, `expense_claims[${index}].document_generation`, 1),
      state: text(src.state, `expense_claims[${index}].state`, { max: 128 }).toUpperCase(),
      status_code: enumValue(src.status_code, EXPENSE_CLAIM_STATUS_CODES, `expense_claims[${index}].status_code`),
      manager_approval_state: enumValue(src.manager_approval_state, EXPENSE_CLAIM_MANAGER_STATES, `expense_claims[${index}].manager_approval_state`),
      agency_authorisation_state: enumValue(src.agency_authorisation_state, EXPENSE_CLAIM_AGENCY_STATES, `expense_claims[${index}].agency_authorisation_state`),
      attention_code: attentionCode,
      target_timesheet_id: optionalUuid(src.target_timesheet_id, `expense_claims[${index}].target_timesheet_id`),
      submitted_at_utc: optionalText(src.submitted_at_utc, `expense_claims[${index}].submitted_at_utc`, 64),
      updated_at_utc: optionalText(src.updated_at_utc, `expense_claims[${index}].updated_at_utc`, 64),
      protected: boolean(src.protected, `expense_claims[${index}].protected`),
      can_withdraw: boolean(src.can_withdraw, `expense_claims[${index}].can_withdraw`),
      totals: freeze({
        expenses_pay_ex_vat: finiteNumber(totals.expenses_pay_ex_vat, `expense_claims[${index}].totals.expenses_pay_ex_vat`, 0),
        expenses_description: totals.expenses_description == null ? null : String(totals.expenses_description),
        mileage_units: finiteNumber(totals.mileage_units, `expense_claims[${index}].totals.mileage_units`, 0),
        mileage_pay_ex_vat: finiteNumber(totals.mileage_pay_ex_vat, `expense_claims[${index}].totals.mileage_pay_ex_vat`, 0),
        travel_pay_ex_vat: finiteNumber(totals.travel_pay_ex_vat, `expense_claims[${index}].totals.travel_pay_ex_vat`, 0),
        accommodation_pay_ex_vat: finiteNumber(totals.accommodation_pay_ex_vat, `expense_claims[${index}].totals.accommodation_pay_ex_vat`, 0),
        other_pay_ex_vat: finiteNumber(totals.other_pay_ex_vat, `expense_claims[${index}].totals.other_pay_ex_vat`, 0)
      }),
      supporting_evidence_count: integer(src.supporting_evidence_count, `expense_claims[${index}].supporting_evidence_count`, 0),
      supporting_evidence_categories: freeze(supportingEvidenceCategories),
      categories: freeze(categories),
      whole_claim_action: null,
      begin_update_action: null,
      update_state: enumValue(src.update_state, EXPENSE_UPDATE_STATES, `expense_claims[${index}].update_state`)
    });
  }

  function normalizeOfficeCandidateProjection(raw, { surface = null, rowIdentity = null } = {}) {
    const src = object(raw, 'projection');
    if (src.ok !== true) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Projection was not accepted.');
    version(src.contract_version, VERSIONS.projection);
    version(src.office_contract_version, VERSIONS.office, 'office_contract_version');
    if (surface && !SURFACES.includes(String(surface).toUpperCase())) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Projection surface is invalid.');
    const currentIdentity = object(src.current_identity, 'current_identity');
    const currentTimesheetId = optionalUuid(currentIdentity.timesheet_id, 'current_identity.timesheet_id');
    const currentContractWeekId = optionalUuid(currentIdentity.contract_week_id, 'current_identity.contract_week_id');
    const routeFamily = String(currentIdentity.route_family || '').trim().toUpperCase();
    if (!currentTimesheetId && !currentContractWeekId) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', 'Projection is missing its current timesheet or contract-week identity.');
    const status = object(src.candidate_status, 'candidate_status');
    const statusCode = text(status.code, 'candidate_status.code', { max: 128 }).toUpperCase();
    const actions = Array.isArray(src.available_actions) ? src.available_actions.map(normalizeOfficeCandidateAction) : fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'available_actions must be an array.');
    const actionCodes = new Set();
    actions.forEach(action => {
      if (actionCodes.has(action.code)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'available_actions contains a duplicate action code.');
      actionCodes.add(action.code);
    });
    const enabledRejection = actions.find(action => action.code === 'REJECT_CANDIDATE_SUBMISSION' && action.enabled);
    if (enabledRejection && ['AUTHORISED', 'INVOICED_NOT_PAID', 'PAID'].includes(statusCode)) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'A financially protected or authorised submission cannot expose an enabled Office rejection action.');
    }
    const diagnostics = Array.isArray(src.diagnostics) ? src.diagnostics.map((item, index) => freeze({ ...object(item, `diagnostics[${index}]`) })) : fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'diagnostics must be an array.');
    const paper = src.paper_pack == null ? { state: 'NOT_APPLICABLE' } : object(src.paper_pack, 'paper_pack');
    const paperState = String(paper.state || '').toUpperCase();
    if (!PAPER_STATES.has(paperState)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'QR Pack state is unknown.');
    if (paper.retryable === true && paperState !== 'FAILED_RETRYABLE') fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Only an explicitly retryable QR Pack failure may be retried.');
    if (rowIdentity) {
      const requested = normalizeOfficeCandidateIdentity(rowIdentity);
      if (currentIdentity.moved === true) fail('CANDIDATE_TIMESHEET_MOVED', 'The requested timesheet has moved to another current version.');
      const returnedSignature = String(currentIdentity.row_signature || '').trim();
      if (requested.expected_row_signature && (currentIdentity.stale_signature === true || !returnedSignature || returnedSignature !== requested.expected_row_signature)) {
        fail('CANDIDATE_CONTEXT_STALE', 'The requested timesheet has changed since it was loaded.');
      }
      const returnedRowKey = String(currentIdentity.row_key || '').trim();
      if (!returnedRowKey) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', 'Projection is missing its requested row identity.');
      if (returnedRowKey && requested.row_key && returnedRowKey !== requested.row_key) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', 'Projection row identity does not match the request.');
      if (requested.timesheet_id && currentTimesheetId !== requested.timesheet_id) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', 'Projection timesheet identity does not match the request.');
      if (requested.contract_week_id && currentContractWeekId !== requested.contract_week_id) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', 'Projection contract-week identity does not match the request.');
    }
    const primaryAction = src.primary_action == null ? null : normalizeOfficeCandidateAction(src.primary_action);
    if (primaryAction) {
      const available = actions.find(action => action.code === primaryAction.code);
      if (!primaryAction.enabled || !primaryAction.prominent || !available || canonicalJson(primaryAction) !== canonicalJson(available)) {
        fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'primary_action must exactly match one enabled prominent available action.');
      }
    }
    const rejections = (Array.isArray(src.rejections) ? src.rejections : []).map((item, index) => {
      const rejection = object(item, `rejections[${index}]`);
      const actionable = boolean(rejection.rejection_actionable, `rejections[${index}].rejection_actionable`);
      const replacementWorkflowId = optionalUuid(rejection.replacement_workflow_id, `rejections[${index}].replacement_workflow_id`);
      if ((!actionable || replacementWorkflowId) && rejection.recovery_action != null) {
        fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Historical or replaced rejection cannot expose a recovery action.');
      }
      return freeze({
        ...rejection,
        rejection_actionable: actionable,
        replacement_workflow_id: replacementWorkflowId,
        recovery_action: rejection.recovery_action == null ? null : normalizeOfficeCandidateAction(rejection.recovery_action)
      });
    });
    const manager = src.manager_approval == null ? null : object(src.manager_approval, 'manager_approval');
    let normalizedManager = null;
    if (manager) {
      const method = text(manager.method, 'manager_approval.method', { max: 16 }).toUpperCase();
      if (!['EMAIL', 'PHONE'].includes(method)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager approval method is unknown.');
      if (method === 'PHONE' && actions.some(action => action.enabled && ['SEND_MANAGER_REMINDER', 'RENEW_MANAGER_REQUEST', 'CANCEL_MANAGER_REQUEST'].includes(action.code))) {
        fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'A PHONE approval workflow cannot expose EMAIL request actions to Office.');
      }
      normalizedManager = freeze({
        ...manager,
        method,
        request_id: optionalUuid(manager.request_id, 'manager_approval.request_id'),
        request_generation: integer(manager.request_generation, 'manager_approval.request_generation', 1),
        state: text(manager.state, 'manager_approval.state', { max: 64 }).toUpperCase(),
        resend_count: optionalInteger(manager.resend_count, 'manager_approval.resend_count', 0),
        resends_remaining: optionalInteger(manager.resends_remaining, 'manager_approval.resends_remaining', 0)
      });
    }
    const retainedManager = src.retained_manager_approval == null
      ? null
      : object(src.retained_manager_approval, 'retained_manager_approval');
    let normalizedRetainedManager = null;
    if (retainedManager) {
      const workflowId = optionalUuid(retainedManager.workflow_id, 'retained_manager_approval.workflow_id');
      const workflowGeneration = integer(retainedManager.workflow_generation, 'retained_manager_approval.workflow_generation', 1);
      const currentGeneration = integer(retainedManager.current_generation, 'retained_manager_approval.current_generation', workflowGeneration);
      const workflowKind = text(retainedManager.workflow_kind, 'retained_manager_approval.workflow_kind', { max: 32 }).toUpperCase();
      const scope = text(retainedManager.scope, 'retained_manager_approval.scope', { max: 16 }).toUpperCase();
      const route = text(retainedManager.route, 'retained_manager_approval.route', { max: 16 }).toUpperCase();
      const method = text(retainedManager.method, 'retained_manager_approval.method', { max: 16 }).toUpperCase();
      if (!workflowId
          || !['CONTRACT_HOURS', 'CONTRACT_EXPENSE', 'CONTRACT_COMBINED', 'DAILY'].includes(workflowKind)
          || !['HOURS', 'EXPENSE', 'COMBINED'].includes(scope)
          || !['ELECTRONIC', 'PHONE', 'EMAIL', 'PAPER'].includes(route)
          || !['PHONE', 'EMAIL'].includes(method)) {
        fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Retained manager approval is invalid.');
      }
      const activeWorkflowId = src.workflow?.workflow_id == null
        ? null
        : optionalUuid(src.workflow.workflow_id, 'workflow.workflow_id');
      if (activeWorkflowId && activeWorkflowId === workflowId) {
        fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Retained manager approval duplicates the active workflow.');
      }
      normalizedRetainedManager = freeze({
        ...retainedManager,
        workflow_id: workflowId,
        workflow_generation: workflowGeneration,
        current_generation: currentGeneration,
        workflow_kind: workflowKind,
        scope,
        route,
        state: text(retainedManager.state, 'retained_manager_approval.state', { max: 64 }).toUpperCase(),
        method,
        approved_at_utc: text(retainedManager.approved_at_utc, 'retained_manager_approval.approved_at_utc', { max: 64 })
      });
    }
    const expenseClaims = Array.isArray(src.expense_claims)
      ? src.expense_claims.map((claim, index) => normalizeOfficeExpenseClaim(claim, index, { surface, routeFamily }))
      : [];
    const expenseWorkflowIds = new Set();
    const expenseComponentIds = new Set();
    expenseClaims.forEach((claim) => {
      if (expenseWorkflowIds.has(claim.workflow_id)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'expense_claims contains a duplicate workflow.');
      expenseWorkflowIds.add(claim.workflow_id);
      claim.categories.forEach((category) => {
        if (expenseComponentIds.has(category.expense_component_id)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'expense_claims contains a duplicate expense component.');
        expenseComponentIds.add(category.expense_component_id);
      });
    });
    return freeze({
      ...src,
      current_identity: freeze({ ...currentIdentity, timesheet_id: currentTimesheetId, contract_week_id: currentContractWeekId, route_family: routeFamily || null }),
      candidate_status: freeze({
        ...status,
        code: statusCode,
        label: text(status.label, 'candidate_status.label', { max: 256 }),
        tone: String(status.tone || 'neutral').trim().toLowerCase()
      }),
      workflow: src.workflow == null ? null : freeze({ ...object(src.workflow, 'workflow') }),
      manager_approval: normalizedManager,
      retained_manager_approval: normalizedRetainedManager,
      expense_claims: freeze(expenseClaims),
      paper_pack: freeze({ ...paper, state: paperState }),
      rejections: freeze(rejections),
      primary_action: primaryAction,
      available_actions: freeze(actions),
      diagnostics: freeze(diagnostics),
      refresh_hints: freeze({ ...object(src.refresh_hints, 'refresh_hints') })
    });
  }

  function normalizeOfficeCandidateProjectionBatch(raw, { surface, identities = [] } = {}) {
    const src = object(raw, 'projection batch');
    if (src.ok !== true) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Projection batch was not accepted.');
    version(src.contract_version, VERSIONS.projectionBatch);
    const normalizedSurface = text(src.surface, 'surface', { max: 64 }).toUpperCase();
    if (!SURFACES.includes(normalizedSurface) || (surface && normalizedSurface !== String(surface).toUpperCase())) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Projection batch surface does not match.');
    if (!Array.isArray(identities) || identities.length < 1 || identities.length > 100) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Projection batch request cardinality is invalid.');
    if (!Array.isArray(src.results) || src.results.length !== identities.length || src.result_count !== src.results.length) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Projection batch cardinality is invalid.');
    const identityMap = new Map();
    identities.forEach((item, index) => {
      const identity = normalizeOfficeCandidateIdentity(item);
      if (identityMap.has(identity.row_key)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `Projection batch request contains duplicate row_key at index ${index}.`);
      identityMap.set(identity.row_key, identity);
    });
    const returnedKeys = new Set();
    const results = src.results.map((item, index) => {
      const row = object(item, `results[${index}]`);
      const correlationKey = String(row.correlation_key || '').trim();
      if (!correlationKey) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Projection batch result is missing its correlation key.');
      if (!identityMap.has(correlationKey)) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', 'Projection batch returned an unrequested correlation key.');
      if (returnedKeys.has(correlationKey)) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', 'Projection batch returned a duplicate correlation key.');
      returnedKeys.add(correlationKey);
      if (row.ok === true) {
        const projection = normalizeOfficeCandidateProjection(row.projection, {
          surface: normalizedSurface,
          rowIdentity: identityMap.get(correlationKey) || null
        });
        return freeze({ ok: true, correlation_key: correlationKey, projection });
      }
      return freeze({
        ok: false,
        correlation_key: correlationKey,
        error: freeze({ ...object(row.error, `results[${index}].error`) })
      });
    });
    if (returnedKeys.size !== identityMap.size) fail('CANDIDATE_OFFICE_PROJECTION_IDENTITY_INVALID', 'Projection batch did not return every requested row exactly once.');
    return freeze({ ...src, surface: normalizedSurface, results: freeze(results) });
  }

  function normalizeCandidateRoutePreview(raw) {
    const src = object(raw, 'route preview');
    const expectedTimesheetId = optionalUuid(src.expected_timesheet_id || src.current_timesheet_id, 'expected_timesheet_id');
    if (!expectedTimesheetId) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Route preview is missing the current timesheet identity.');
    const permission = src.permitted_action;
    if (typeof permission === 'boolean' && permission !== true) {
      fail('CANDIDATE_ACTION_NOT_ELIGIBLE', 'This route change is not currently available.');
    }
    const action = text(
      typeof permission === 'string' ? permission : src.action,
      'permitted_action',
      { max: 64 }
    ).toUpperCase();
    const context = optionalSha(src.context_sha256 || src.expected_context_sha256, 'context_sha256');
    if (!context) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Route preview is missing its context hash.');
    const rowSignature = text(src.expected_row_signature || src.row_signature, 'expected_row_signature', { max: 256 });
    return freeze({ ...src, expected_timesheet_id: expectedTimesheetId, expected_row_signature: rowSignature, permitted_action: action, context_sha256: context });
  }

  function normalizeCandidateRejectPreview(raw) {
    const src = object(raw, 'rejection preview');
    version(src.contract_version, VERSIONS.rejectionPreview);
    const contextSha256 = optionalSha(src.context_sha256, 'context_sha256');
    const expectedTimesheetId = optionalUuid(src.expected_timesheet_id, 'expected_timesheet_id');
    if (!contextSha256 || !expectedTimesheetId) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Rejection preview is missing its exact current identity or context hash.');
    return freeze({
      ...src,
      permitted: boolean(src.permitted, 'permitted'),
      context_sha256: contextSha256,
      expected_timesheet_id: expectedTimesheetId,
      expected_row_signature: text(src.expected_row_signature, 'expected_row_signature', { max: 256 })
    });
  }

  function normalizeManagerReminderEligibilityPage(raw) {
    const src = object(raw, 'manager reminder eligibility page');
    if (src.ok !== true) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder eligibility was not accepted.');
    version(src.contract_version, VERSIONS.reminderEligibility);
    const page = integer(src.page, 'page', 1);
    const pageSize = integer(src.page_size, 'page_size', 1);
    const pageCount = integer(src.page_count, 'page_count', 0);
    const totalItems = integer(src.total_items, 'total_items', 0);
    const catalogueTotalItems = integer(src.catalogue_total_items, 'catalogue_total_items', 0);
    const surnameQuery = src.surname_query == null ? '' : String(src.surname_query);
    const sortBy = String(src.sort_by || '').trim().toUpperCase();
    const sortDirection = String(src.sort_direction || '').trim().toUpperCase();
    if (pageSize > 100 || totalItems > catalogueTotalItems || catalogueTotalItems > 1000
        || surnameQuery.length > 100 || !['CANDIDATE_SURNAME', 'LAST_MANAGER_EMAIL'].includes(sortBy)
        || !['ASC', 'DESC'].includes(sortDirection)
        || (totalItems === 0 ? page !== 1 || pageCount !== 0 : page > pageCount)) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder pagination is inconsistent.');
    }
    const catalogueRevision = optionalSha(src.catalogue_revision, 'catalogue_revision');
    if (!catalogueRevision) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder catalogue revision is missing.');
    const keys = new Set();
    const items = (Array.isArray(src.items) ? src.items : fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder items must be an array.')).map((rawItem, index) => {
      const item = object(rawItem, `items[${index}]`);
      const selectionKey = text(item.selection_key, `items[${index}].selection_key`, { max: 256 });
      if (keys.has(selectionKey)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder page contains a duplicate selection key.');
      keys.add(selectionKey);
      const identity = normalizeOfficeCandidateIdentity(item.identity || item);
      return freeze({
        selection_key: selectionKey,
        identity,
        candidate_name: text(item.candidate_name, `items[${index}].candidate_name`, { max: 300 }),
        candidate_surname: text(item.candidate_surname, `items[${index}].candidate_surname`, { max: 200 }),
        last_manager_email_at_utc: text(item.last_manager_email_at_utc, `items[${index}].last_manager_email_at_utc`, { max: 64 })
      });
    });
    const matchingSelectionKeys = (Array.isArray(src.matching_selection_keys)
      ? src.matching_selection_keys
      : fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder matching selection keys must be an array.'))
      .map((value, index) => optionalUuid(value, `matching_selection_keys[${index}]`));
    if (new Set(matchingSelectionKeys).size !== matchingSelectionKeys.length
        || matchingSelectionKeys.length !== totalItems
        || matchingSelectionKeys.some(value => !value)
        || items.some(item => !matchingSelectionKeys.includes(item.selection_key))
        || items.length > pageSize || (totalItems === 0 && items.length)) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder page size or filtered selection is inconsistent.');
    }
    return freeze({
      ...src,
      contract_version: VERSIONS.reminderEligibility,
      catalogue_revision: catalogueRevision,
      page,
      page_size: pageSize,
      page_count: pageCount,
      total_items: totalItems,
      catalogue_total_items: catalogueTotalItems,
      surname_query: surnameQuery,
      sort_by: sortBy,
      sort_direction: sortDirection,
      matching_selection_keys: freeze(matchingSelectionKeys),
      items: freeze(items)
    });
  }

  function normalizeManagerReminderBatchPreview(raw) {
    const src = object(raw, 'manager reminder batch preview');
    if (src.ok !== true) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder preview was not accepted.');
    version(src.contract_version, VERSIONS.reminderPreview);
    const previewContextHash = optionalSha(src.preview_context_hash, 'preview_context_hash');
    const selectionFingerprint = optionalSha(src.selection_fingerprint, 'selection_fingerprint');
    if (!previewContextHash || !selectionFingerprint) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder preview is missing its frozen selection authority.');
    const selectedRows = (Array.isArray(src.selected_rows)
      ? src.selected_rows
      : fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder preview is missing its frozen selected rows.'))
      .map(normalizeOfficeCandidateIdentity);
    const selectedCount = integer(src.selected_count, 'selected_count', 1);
    if (selectedRows.length !== selectedCount || selectedRows.length > 1000) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder preview selection is inconsistent.');
    }
    return freeze({
      ...src,
      preview_context_hash: previewContextHash,
      selection_fingerprint: selectionFingerprint,
      selected_count: selectedCount,
      selected_rows: freeze(selectedRows)
    });
  }

  function normalizeManagerReminderBatchResult(raw) {
    const src = object(raw, 'manager reminder batch result');
    version(src.contract_version, VERSIONS.reminderResult);
    if (src.ok !== true) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder batch result is not durable.');
    const status = text(src.status, 'status', { max: 32 }).toUpperCase();
    if (!['COMPLETED', 'PARTIAL', 'FAILED'].includes(status)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Manager reminder batch status is invalid.');
    return freeze({
      ...src,
      status,
      batch_id: optionalUuid(src.batch_id, 'batch_id'),
      success_count: integer(src.success_count, 'success_count', 0),
      failure_count: integer(src.failure_count, 'failure_count', 0),
      skipped_count: integer(src.skipped_count, 'skipped_count', 0)
    });
  }

  function normalizeOfficeExpenseCategoryRejectionResult(raw, { action = null, expenseCategory = null } = {}) {
    const src = object(raw, 'expense category rejection result');
    if (src.ok !== true) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Expense category rejection was not accepted.');
    version(src.contract_version, VERSIONS.expenseCategoryRejectionResult);
    const operationId = optionalUuid(src.operation_id, 'operation_id');
    const workflowId = optionalUuid(src.workflow_id, 'workflow_id');
    const expenseComponentId = optionalUuid(src.expense_component_id, 'expense_component_id');
    const previousOwningTimesheetId = optionalUuid(src.previous_owning_timesheet_id, 'previous_owning_timesheet_id');
    if (!operationId || !workflowId || !expenseComponentId || !previousOwningTimesheetId) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Expense category rejection result is missing its durable identity.');
    }
    const normalizeUuidArray = (value, name) => {
      if (!Array.isArray(value)) fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `${name} must be an array.`);
      const normalized = value.map((item, index) => optionalUuid(item, `${name}[${index}]`));
      if (normalized.some(item => !item) || new Set(normalized).size !== normalized.length) {
        fail('CANDIDATE_OFFICE_CONTRACT_INVALID', `${name} contains an invalid or duplicate Timesheet identity.`);
      }
      return freeze(normalized);
    };
    const deletedTimesheetIds = normalizeUuidArray(src.deleted_timesheet_ids, 'deleted_timesheet_ids');
    const retainedTimesheetIds = normalizeUuidArray(src.retained_timesheet_ids, 'retained_timesheet_ids');
    const affectedTimesheetIds = normalizeUuidArray(src.affected_timesheet_ids, 'affected_timesheet_ids');
    const removedFromCurrentTimesheetIds = normalizeUuidArray(src.removed_from_current_timesheet_ids, 'removed_from_current_timesheet_ids');
    const refreshTimesheetIds = normalizeUuidArray(src.refresh_timesheet_ids, 'refresh_timesheet_ids');
    const emptyTimesheetConsequence = enumValue(
      src.empty_timesheet_consequence,
      EMPTY_TIMESHEET_CONSEQUENCES,
      'empty_timesheet_consequence'
    );
    const owningTimesheetDeleted = boolean(src.owning_timesheet_deleted, 'owning_timesheet_deleted');
    const affected = new Set(affectedTimesheetIds);
    if (deletedTimesheetIds.some(id => !affected.has(id))
        || retainedTimesheetIds.some(id => !affected.has(id))
        || removedFromCurrentTimesheetIds.some(id => !affected.has(id))
        || deletedTimesheetIds.some(id => retainedTimesheetIds.includes(id))
        || (emptyTimesheetConsequence === 'PERMANENT_REMOVE' && (
          !owningTimesheetDeleted
          || !deletedTimesheetIds.includes(previousOwningTimesheetId)
          || !removedFromCurrentTimesheetIds.includes(previousOwningTimesheetId)
          || retainedTimesheetIds.includes(previousOwningTimesheetId)
        ))
        || (emptyTimesheetConsequence === 'REMOVE_FROM_CURRENT_KEEP_HISTORY' && (
          owningTimesheetDeleted
          || deletedTimesheetIds.includes(previousOwningTimesheetId)
          || !retainedTimesheetIds.includes(previousOwningTimesheetId)
          || !removedFromCurrentTimesheetIds.includes(previousOwningTimesheetId)
        ))
        || (emptyTimesheetConsequence === 'NONE' && (
          owningTimesheetDeleted
          || deletedTimesheetIds.includes(previousOwningTimesheetId)
          || !retainedTimesheetIds.includes(previousOwningTimesheetId)
          || removedFromCurrentTimesheetIds.includes(previousOwningTimesheetId)
        ))) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Expense category rejection result Timesheet reconciliation is inconsistent.');
    }
    const refreshHints = object(src.refresh_hints, 'refresh_hints');
    if (canonicalJson(Object.keys(refreshHints).sort()) !== canonicalJson(['bulk_authorise', 'bulk_process', 'refetch', 'simple_timesheet', 'summary'])
        || refreshHints.summary !== true
        || refreshHints.simple_timesheet !== true
        || refreshHints.bulk_process !== true
        || refreshHints.bulk_authorise !== true
        || refreshHints.refetch !== 'AFFECTED_ROWS') {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Expense category rejection refresh hints are incomplete.');
    }
    const refusal = object(src.refusal, 'refusal');
    if (canonicalJson(Object.keys(refusal).sort()) !== canonicalJson(['at_utc', 'kind', 'reason'])) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Expense category rejection refusal shape is invalid.');
    }
    const normalizedRefusal = freeze({
      ...refusal,
      kind: enumValue(refusal.kind, EXPENSE_REFUSAL_KINDS, 'refusal.kind'),
      reason: text(refusal.reason, 'refusal.reason', { max: 1000 }),
      at_utc: text(refusal.at_utc, 'refusal.at_utc', { max: 64 })
    });
    const fixed = action?.invocation?.fixed_body || {};
    const expectedActionPath = `/api/candidate-app/workflows/${workflowId}/actions/reject-expense-category`;
    if (normalizedRefusal.kind !== 'AGENCY_REJECTION'
        || String(src.action_code || '').toUpperCase() !== 'REJECT_EXPENSE_CATEGORY'
        || String(src.state || '').toUpperCase() !== 'OFFICE_REJECTED'
        || (action && action.invocation?.path !== expectedActionPath)
        || (fixed.expense_component_id && fixed.expense_component_id !== expenseComponentId)
        || (expenseCategory?.expense_component_id && expenseCategory.expense_component_id !== expenseComponentId)
        || (expenseCategory?.rejection_confirmation?.empty_timesheet_consequence
          && expenseCategory.rejection_confirmation.empty_timesheet_consequence !== emptyTimesheetConsequence)) {
      fail('CANDIDATE_OFFICE_CONTRACT_INVALID', 'Expense category rejection result does not match the confirmed category.');
    }
    return freeze({
      ...src,
      contract_version: VERSIONS.expenseCategoryRejectionResult,
      action_code: 'REJECT_EXPENSE_CATEGORY',
      operation_id: operationId,
      workflow_id: workflowId,
      expense_component_id: expenseComponentId,
      component_generation: integer(src.component_generation, 'component_generation', 1),
      state: 'OFFICE_REJECTED',
      refusal: normalizedRefusal,
      previous_owning_timesheet_id: previousOwningTimesheetId,
      empty_timesheet_consequence: emptyTimesheetConsequence,
      owning_timesheet_deleted: owningTimesheetDeleted,
      deleted_timesheet_ids: deletedTimesheetIds,
      retained_timesheet_ids: retainedTimesheetIds,
      affected_timesheet_ids: affectedTimesheetIds,
      removed_from_current_timesheet_ids: removedFromCurrentTimesheetIds,
      refresh_timesheet_ids: refreshTimesheetIds,
      refresh_hints: freeze({ summary: true, simple_timesheet: true, bulk_process: true, bulk_authorise: true, refetch: 'AFFECTED_ROWS' }),
      idempotent_replay: boolean(src.idempotent_replay, 'idempotent_replay')
    });
  }

  function normalizeCandidateOfficeError(errorOrResponse) {
    const src = errorOrResponse?.payload || errorOrResponse?.json || errorOrResponse || {};
    const code = String(src.error_code || src.code || errorOrResponse?.code || 'CANDIDATE_OFFICE_UNKNOWN').trim().toUpperCase();
    const safeMessages = {
      OFFICE_AUTH_REQUIRED: 'Your CloudTMS session has expired. Sign in again, then review the current state.',
      CANDIDATE_OFFICE_PERMISSION_DENIED: 'You do not have permission to perform this Candidate action.',
      CANDIDATE_CONTEXT_STALE: 'This timesheet has changed since it was loaded.',
      CANDIDATE_TIMESHEET_MOVED: 'This timesheet has moved to a new current version.',
      CANDIDATE_REQUEST_GENERATION_STALE: 'The manager approval request has changed.',
      CANDIDATE_EXPENSE_CATEGORY_CONTEXT_CHANGED: 'This expense category has changed since it was loaded. Refresh and review the current details.',
      CANDIDATE_REQUIRES_UNAUTHORISE: 'Unauthorise this timesheet before continuing.',
      CANDIDATE_PROTECTED_FINANCIAL_HISTORY: 'This timesheet has protected financial history and cannot be changed.',
      CANDIDATE_IMPORT_AUTHORITATIVE: 'This timesheet is controlled by an import.',
      CANDIDATE_PROVIDER_HANDOFF_IN_PROGRESS: 'The provider is currently processing this request. Try again when that handoff has completed.',
      CANDIDATE_OFFICE_REQUEST_TIMEOUT: 'CloudTMS did not receive a response in time. The current record has been checked; retrying the same action is safe.',
      CANDIDATE_IDEMPOTENCY_CONFLICT: 'This action no longer matches the original request. Refresh and review the current state.',
      CANDIDATE_REMINDER_BATCH_SELECTION_CHANGED: 'The eligible manager reminder list changed. Refresh and review the current state before sending.',
      CANDIDATE_REMINDER_BATCH_SELECTION_INVALID: 'The manager reminder selection is no longer valid. Refresh and make the selection again.',
      CANDIDATE_REMINDER_CATALOGUE_TOO_LARGE: 'CloudTMS found more than 1,000 eligible reminders. No reminders were sent; contact support to split the operation safely.',
      CANDIDATE_REMINDER_CATALOGUE_UNAVAILABLE: 'CloudTMS could not build the current eligible reminder list. No reminders were sent.'
    };
    const message = safeMessages[code] || (typeof src.message === 'string' && !/[{}]|SQLSTATE|stack|constraint|function /i.test(src.message) ? src.message.trim() : '') || 'CloudTMS could not complete this Candidate action. Refresh the current state and try again.';
    return freeze({
      code,
      message,
      retryable: src.retryable === true,
      request_id: src.request_id == null ? null : String(src.request_id),
      status: Number(errorOrResponse?.status || src.status || 0) || null,
      stale: ['CANDIDATE_CONTEXT_STALE', 'CANDIDATE_TIMESHEET_MOVED', 'CANDIDATE_REQUEST_GENERATION_STALE', 'CANDIDATE_EXPENSE_CATEGORY_CONTEXT_CHANGED', 'CANDIDATE_IDEMPOTENCY_CONFLICT', 'CANDIDATE_REMINDER_BATCH_SELECTION_CHANGED', 'CANDIDATE_REMINDER_BATCH_SELECTION_INVALID'].includes(code),
      auth: code === 'OFFICE_AUTH_REQUIRED' || Number(errorOrResponse?.status) === 401
    });
  }

  Object.assign(window, {
    CloudTMSCandidateOfficeContract: freeze({
      VERSIONS, SURFACES, CandidateOfficeContractError,
      assertCandidateOfficeContractVersion,
      normalizeOfficeCandidateIdentity,
      normalizeOfficeCandidateCapabilities,
      normalizeOfficeCandidateAction,
      normalizeOfficeCandidateProjection,
      normalizeOfficeCandidateProjectionBatch,
      normalizeCandidateRoutePreview,
      normalizeCandidateRejectPreview,
      normalizeManagerReminderEligibilityPage,
      normalizeManagerReminderBatchPreview,
      normalizeManagerReminderBatchResult,
      normalizeOfficeExpenseCategoryRejectionResult,
      normalizeCandidateOfficeError
    })
  });
})();
