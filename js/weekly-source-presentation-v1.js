(function initialiseWeeklySourcePresentation(root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }

  const isBrowser = typeof window === 'object' && root === window;
  if (isBrowser && !root.CloudTMSWeeklySourcePresentationV1) {
    Object.defineProperty(root, 'CloudTMSWeeklySourcePresentationV1', {
      configurable: false,
      enumerable: true,
      writable: false,
      value: api
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildWeeklySourcePresentationApi() {
  'use strict';

  const CONTRACT = 'WEEKLY_SOURCE_OFFICE_PRESENTATION_V1';
  const PRESENTATION_KEY = 'weekly_source_presentation';
  const COMMAND_ENDPOINT = '/api/weekly-source/v1/commands';

  const APPROVED_HOURS_ACTIONS = Object.freeze([
    'APPROVE_PROTECTED_HOURS',
    'AMEND_PROTECTED_HOURS',
    'WITHDRAW_PROTECTED_HOURS',
    'WAIT_FOR_SOURCE',
    'ACCEPT_SOURCE_AND_RECONCILE',
    'RECORD_NOT_WORKED'
  ]);
  const APPROVED_HOURS_ACTION_SET = new Set(APPROVED_HOURS_ACTIONS);
  const APPROVED_HOURS_EXISTING_ITEM_ACTION_SET = new Set([
    'AMEND_PROTECTED_HOURS',
    'WITHDRAW_PROTECTED_HOURS',
    'WAIT_FOR_SOURCE',
    'ACCEPT_SOURCE_AND_RECONCILE',
    'RECORD_NOT_WORKED'
  ]);
  const APPROVED_HOURS_EDITABLE_SCHEDULE_ACTIONS = new Set([
    'APPROVE_PROTECTED_HOURS',
    'AMEND_PROTECTED_HOURS',
    'WAIT_FOR_SOURCE'
  ]);
  const APPROVED_HOURS_ACTION_LABELS = Object.freeze({
    APPROVE_PROTECTED_HOURS: 'Add approved hours',
    AMEND_PROTECTED_HOURS: 'Save approved hours',
    WITHDRAW_PROTECTED_HOURS: 'Remove approved hours',
    WAIT_FOR_SOURCE: 'Wait for client update',
    ACCEPT_SOURCE_AND_RECONCILE: 'Use client hours',
    RECORD_NOT_WORKED: 'Record as not worked'
  });
  const APPROVED_HOURS_BASE_PAYLOAD_KEYS = Object.freeze([
    'source_cycle_id',
    'candidate_id',
    'client_id',
    'contract_id',
    'week_ending_date',
    'family_id',
    'work_event_id',
    'evidence_timesheet_id',
    'work_date',
    'start_at_local',
    'end_at_local',
    'break_minutes'
  ]);
  const APPROVED_HOURS_BASE_PAYLOAD_KEY_SET = new Set(APPROVED_HOURS_BASE_PAYLOAD_KEYS);
  const APPROVED_HOURS_ACTION_PAYLOAD_KEYS = Object.freeze({
    APPROVE_PROTECTED_HOURS: Object.freeze([
      'source_cycle_id', 'candidate_id', 'client_id', 'contract_id', 'week_ending_date',
      'work_event_id', 'evidence_timesheet_id', 'work_date', 'start_at_local', 'end_at_local',
      'break_minutes', 'reason', 'idempotency_key', 'expected_record_version'
    ]),
    AMEND_PROTECTED_HOURS: Object.freeze([
      'source_cycle_id', 'candidate_id', 'client_id', 'contract_id', 'week_ending_date',
      'work_event_id', 'evidence_timesheet_id', 'work_date', 'start_at_local', 'end_at_local',
      'break_minutes', 'reason', 'idempotency_key', 'expected_record_version'
    ]),
    WITHDRAW_PROTECTED_HOURS: Object.freeze([
      'family_id', 'work_event_id', 'reason', 'idempotency_key', 'expected_record_version'
    ]),
    WAIT_FOR_SOURCE: Object.freeze([
      'family_id', 'work_event_id', 'work_date', 'start_at_local', 'end_at_local', 'break_minutes',
      'reason', 'idempotency_key', 'expected_record_version'
    ]),
    ACCEPT_SOURCE_AND_RECONCILE: Object.freeze([
      'family_id', 'work_event_id', 'reason', 'idempotency_key', 'expected_record_version'
    ]),
    RECORD_NOT_WORKED: Object.freeze([
      'family_id', 'work_event_id', 'reason', 'idempotency_key', 'expected_record_version'
    ])
  });

  const ROUTES = Object.freeze({
    NHSP: Object.freeze({
      key: 'NHSP',
      category_key: 'NHSP',
      category_label: 'NHSP',
      authority: 'CLIENT_SYSTEM',
      default_middle_pane: 'HOURS',
      source_title: 'Client system hours',
      submitted_title: 'Submitted Timesheet'
    }),
    CLIENT_PROVIDED_HOURS: Object.freeze({
      key: 'CLIENT_PROVIDED_HOURS',
      category_key: 'CLIENT_PROVIDED_HOURS',
      category_label: 'Client-provided hours',
      authority: 'CLIENT_SYSTEM',
      default_middle_pane: 'HOURS',
      source_title: 'Client system hours',
      submitted_title: 'Submitted Timesheet'
    }),
    TIMESHEETS_CHECKED_WITH_CLIENT: Object.freeze({
      key: 'TIMESHEETS_CHECKED_WITH_CLIENT',
      category_key: 'TIMESHEETS_CHECKED_WITH_CLIENT',
      category_label: 'Timesheets checked with client',
      authority: 'SIGNED_TIMESHEET',
      default_middle_pane: 'FILES',
      source_title: 'Client system hours',
      submitted_title: 'Signed Timesheet'
    })
  });

  const CATEGORIES = Object.freeze([
    Object.freeze({ key: 'NHSP', label: 'NHSP' }),
    Object.freeze({ key: 'CLIENT_PROVIDED_HOURS', label: 'Client-provided hours' }),
    Object.freeze({ key: 'TIMESHEETS_CHECKED_WITH_CLIENT', label: 'Timesheets checked with client' }),
    Object.freeze({ key: 'STANDARD_TIMESHEETS', label: 'Standard Timesheets' })
  ]);
  const CATEGORY_KEYS = new Set(CATEGORIES.map((category) => category.key));

  const COMPARISON_STATES = new Set([
    'MATCH',
    'MISMATCH',
    'NO_TIMESHEET',
    'WAITING_FOR_COMPLETE_TIMESHEET',
    'UNAVAILABLE'
  ]);

  const ROW_STATES = new Set(['MATCH', 'MISMATCH', 'NO_TIMESHEET', 'WAITING', 'READY', 'PROTECTED']);

  // -------------------------------------------------------------------------
  // Gate 10.  The server-owned lifecycle contract (WP-11b handoff N3).
  //
  // Every heading, every schedule and every permitted action on this surface
  // comes from the server, verbatim.  This file contains NO lifecycle heading
  // string and no mapping from a state to a heading: rule N3.9.1.  The generic
  // heading 25 section 10 removes by name (contract erratum E-4) appears
  // nowhere, and `containsDeletedHeading` below is an executed guard rather
  // than a comment.
  // -------------------------------------------------------------------------
  const LIFECYCLE_CONTRACT = 'WEEKLY_SOURCE_OFFICE_LIFECYCLE_V1';
  const LIFECYCLE_POLICY_CONTRACT = 'WEEKLY_SOURCE_OFFICE_LIFECYCLE_POLICY_V1';

  // N3.3: exactly eight members, in the contract's own order.
  const SCHEDULE_KEYS = Object.freeze([
    'submitted',
    'latest_source',
    'hours_to_authorise',
    'currently_approved',
    'approved',
    'processing',
    'paid_to_date',
    'current_paid'
  ]);
  const SCHEDULE_KEY_SET = new Set(SCHEDULE_KEYS);

  const HEADING_SOURCES = new Set(['SERVER', 'LEGACY_OWNER', 'CONTEXT_PHASE', 'NONE']);

  // N3.2: tokens, never labels.
  const PERMITTED_ACTION_TOKENS = new Set([
    'AUTHORISE',
    'PROTECTED_HOURS_REVIEW',
    'APPROVE_UPDATED_HOURS',
    'KEEP_CURRENTLY_APPROVED_HOURS',
    'EXISTING_LIFECYCLE_ACTIONS_ONLY',
    'EXISTING_BANKING_STATUS_ONLY',
    'EXISTING_MANAGER_EMAIL_JOURNEY',
    'EXISTING_ACTIONS',
    'EXISTING_DAILY_ACTIONS'
  ]);
  const DECISION_ACTION_TOKENS = new Set(['APPROVE_UPDATED_HOURS', 'KEEP_CURRENTLY_APPROVED_HOURS']);

  const PROPOSAL_STATES = new Set([
    'NONE',
    'PROPOSED',
    'PROPOSED_CROSS_CONTRACT',
    'FROZEN_PENDING',
    'UNAVAILABLE'
  ]);

  // Row shapes differ by `source` and the browser must branch on `source`,
  // never guess (N3.3).
  const SCHEDULE_ROW_SHAPES = Object.freeze({
    CANDIDATE_SUBMITTED_SCHEDULE: 'TIME',
    WEEKLY_SOURCE_LATEST_SOURCE: 'TIME',
    WEEKLY_SOURCE_PROPOSED_FIRST_ENTITLEMENT: 'TIME',
    EFFECTIVE_INVENTORY_HEAD: 'COMPONENT',
    EFFECTIVE_INVENTORY_TSFIN: 'COMPONENT',
    // The two-root composer's proposed entitlement is component-shaped and
    // carries the component identity that makes an A-to-B move one line that
    // moves rather than a removal and an addition.
    WEEKLY_SOURCE_ENTITLEMENT_COMPOSER: 'COMPONENT',
    WEEKLY_SOURCE_SETTLEMENT_ALLOCATION: 'SETTLEMENT'
  });

  // A source this owner has never seen must not be silently rendered in the
  // wrong shape: reading a component row as a time row drops `component_id`,
  // and the A-to-B move surface depends on that identity. So an unknown source
  // is resolved from the row's own discriminating keys, and only then falls
  // back to the time shape.
  const scheduleShapeForRows = (rows) => {
    const first = rows.find(isObject);
    if (!first) return 'TIME';
    if (own(first, 'component_id') || own(first, 'component_kind')) return 'COMPONENT';
    if (own(first, 'segment_id') || own(first, 'settlements')) return 'SETTLEMENT';
    return 'TIME';
  };

  // The generic heading 25 section 10 deletes.  It is assembled from its words
  // so that the literal string exists in no Office asset, and it is used only
  // to prove absence.  Files 17 and 18 are stale on the point (contract
  // erratum E-4); file 24 controls.
  const DELETED_HEADING = ['Hours', 'being', 'authorised'].join(' ');

  // 04_MODAL_POLICY.json:244-249 firstAuthorisationWithdrawal.refusalCopy and
  // .resultCopy.  These are POLICY strings owned by the Office surface, keyed
  // by the server's own verdict; the browser never decides availability and
  // never decides whether a refusal is permanent.  Where the server supplies
  // its own `refusal_message` that message is rendered verbatim in preference
  // to these (see WP-12_NEEDS N1: the Gate 9 bridge currently drops it).
  const WITHDRAWAL_REFUSAL_COPY = Object.freeze({
    BANKING_ACTIVE: 'This Timesheet is in a payment Draft or scheduled for payment. Cancel it in Banking Pay first, then try again.',
    WAITING: 'A payment cancellation, transfer or invoice job for this Timesheet has not finished. Try again when it has completed.',
    PERMANENT: 'This Timesheet has been paid, invoiced or reconciled and can no longer be unauthorised. Use the reconciliation process for changes.'
  });
  const WITHDRAWAL_RESULT_COPY = 'Authorisation withdrawn. The Timesheet is awaiting authorisation again and is not eligible for payment.';
  const WITHDRAWAL_INTEGRITY_COPY = 'This Timesheet needs Office review before it can be changed. No financial change has been made.';

  // The one code in the enumeration that 04_MODAL_POLICY.json gives its own
  // string to.  Everything else is keyed by the server's `refusal_nature`.
  const WITHDRAWAL_BANKING_ACTIVE_CODE = 'WEEKLY_SOURCE_UNAUTHORISE_BANKING_ACTIVE';

  // A WITHHELD figure is not a missing one and is not an error: the evidence is
  // sound and only the paid position cannot be stated, so the phase still
  // resolves and the heading is still shown.  The server publishes the class
  // itself (`unavailable_class`, WP-11d D4 / handoff N3.3a), and the browser
  // keys off the CLASS, not off a list of reasons — the reason list is expected
  // to shrink when the finance ruling lands, and a surface coded to the list
  // would then quietly stop recognising a state it still has to render.
  const WITHHELD_UNAVAILABLE_CLASS = 'POSITION_WITHHELD';
  // Only a fallback, for a server that predates `unavailable_class`.  These two
  // are the reasons that class covered when the field was introduced.
  const WITHHELD_SCHEDULE_REASONS_LEGACY = new Set([
    'SETTLEMENT_POSITION_SEMANTICS_UNRULED',
    'SETTLEMENT_ORDER_AMBIGUOUS',
    'SETTLEMENT_SEQUENCE_UNPROVABLE'
  ]);

  // Bulk shell step model (24_TIMESHEET_LIFECYCLE_UI_POLICY.json screens 60 and
  // 61): three clear steps on phone and folding phone, and the same three with
  // the queue collapsed on tablet.  Never a squeezed desktop layout.
  const BULK_WORKSPACE_STEPS = Object.freeze([
    Object.freeze({ key: 'QUEUE', label: 'Queue' }),
    Object.freeze({ key: 'REVIEW', label: 'Review' }),
    Object.freeze({ key: 'AUTHORISE', label: 'Authorise' })
  ]);
  const BULK_WORKSPACE_STEP_KEYS = new Set(BULK_WORKSPACE_STEPS.map((step) => step.key));
  const BULK_BREAKPOINTS = Object.freeze({ fold: 280, phone: 390, tablet: 768, desktop: 1024 });

  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const trim = (value) => String(value == null ? '' : value).trim();
  const upper = (value) => trim(value).toUpperCase();
  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const escapeHtml = (value) => String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const deepFreeze = (value, seen) => {
    if (!value || typeof value !== 'object') return value;
    const visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, visited);
    return value;
  };

  const passthroughViewModel = () => deepFreeze({
    mount: false,
    render_mode: 'LEGACY',
    is_weekly_source: false,
    blocks_authorisation: false,
    category_key: 'STANDARD_TIMESHEETS',
    default_middle_pane: 'FILES'
    // UI-016 / UI-017: the component must not mount, so this view model stays
    // exactly as it was. It deliberately carries NO lifecycle member: an owner
    // that does not mount owns no heading, no schedule and no action, and the
    // legacy Weekly or Daily owner is untouched. Every consumer checks `mount`
    // before reading anything else.
  });

  const unavailableViewModel = (reason) => deepFreeze({
    mount: true,
    render_mode: 'UNAVAILABLE',
    is_weekly_source: true,
    blocks_authorisation: true,
    authorise_allowed: false,
    category_key: '',
    category_label: '',
    default_middle_pane: 'HOURS',
    unavailable_reason: trim(reason) || 'This Timesheet cannot be checked right now. Please refresh and try again.',
    comparison_state: 'UNAVAILABLE',
    source_rows: [],
    submitted_rows: [],
    approved_rows: [],
    totals: null,
    // An unavailable projection has no phase, so it has no heading, no
    // schedule and no permitted action.  Stated explicitly so no renderer has
    // to guess what an absent lifecycle means.
    lifecycle: failedLifecycle('PRESENTATION_UNAVAILABLE', trim(reason)),
    lifecycle_ok: false,
    ui_state: null,
    server_phase: null,
    heading: null,
    heading_source: 'NONE',
    primary_schedule_key: null,
    right_pane_status: null,
    permitted_actions: [],
    overlay_states: [],
    proposal: { present: false, state: 'UNAVAILABLE', decision: null, reason: 'PRESENTATION_UNAVAILABLE' },
    invoice_movements: { ok: false, reason: 'PRESENTATION_UNAVAILABLE', invoiced_from_source: null, movement_count: 0, movements: [] },
    unauthorise: null,
    unauthorise_allowed: false,
    managed_root: false,
    withdrawn: false
  });

  const normaliseAdditionalUnits = (value) => {
    if (!Array.isArray(value)) return [];
    return value
      .filter(isObject)
      .map((unit, index) => ({
        key: trim(unit.key) || `unit-${index + 1}`,
        label: trim(unit.label) || 'Additional unit',
        value: trim(unit.value) || '—',
        state: ROW_STATES.has(upper(unit.state)) ? upper(unit.state) : 'READY'
      }));
  };

  const normaliseHoursRow = (value, index, kind) => {
    const row = isObject(value) ? value : {};
    const state = ROW_STATES.has(upper(row.state)) ? upper(row.state) : 'READY';
    return {
      row_key: trim(row.row_key) || `${kind}-${index + 1}`,
      day_date: trim(row.day_date) || '—',
      hours: trim(row.hours) || '—',
      reference_number: trim(row.reference_number),
      break_text: trim(row.break_text) || '—',
      additional_units: normaliseAdditionalUnits(row.additional_units),
      state,
      status_text: trim(row.status_text),
      issue_text: trim(row.issue_text),
      context_text: trim(row.context_text),
      affected: row.affected === true
    };
  };

  const normaliseHoursRows = (value, kind) => (
    Array.isArray(value)
      ? value.filter(isObject).map((row, index) => normaliseHoursRow(row, index, kind))
      : []
  );

  const normaliseComparisonRows = (value) => {
    if (!Array.isArray(value)) return [];
    return value.filter(isObject).map((entry, index) => ({
      row_key: trim(entry.row_key) || `comparison-${index + 1}`,
      day_date: trim(entry.day_date) || '—',
      state: ROW_STATES.has(upper(entry.state)) ? upper(entry.state) : 'READY',
      issue_text: trim(entry.issue_text),
      source: normaliseHoursRow(entry.source, index, 'comparison-source'),
      submitted: normaliseHoursRow(entry.submitted, index, 'comparison-submitted')
    }));
  };

  const normaliseTotals = (value) => {
    if (!isObject(value) || value.complete !== true) return null;
    const totals = {
      charge_excluding_vat: trim(value.charge_excluding_vat),
      charge_including_vat: trim(value.charge_including_vat),
      pay_excluding_vat: trim(value.pay_excluding_vat),
      pay_including_vat: trim(value.pay_including_vat)
    };
    return Object.values(totals).every(Boolean) ? totals : null;
  };

  const normaliseApprovedHoursSchedule = (value) => {
    const schedule = isObject(value) ? value : {};
    const breakMinutes = Number(schedule.break_minutes);
    return {
      work_date: trim(schedule.work_date),
      start_at_local: trim(schedule.start_at_local),
      end_at_local: trim(schedule.end_at_local),
      break_minutes: Number.isInteger(breakMinutes) && breakMinutes >= 0 ? breakMinutes : null
    };
  };

  const normaliseApprovedHoursCommandPayload = (value) => {
    if (!isObject(value)) return null;
    const keys = Object.keys(value);
    if (keys.some((key) => !APPROVED_HOURS_BASE_PAYLOAD_KEY_SET.has(key))) return null;
    const out = {};
    for (const key of APPROVED_HOURS_BASE_PAYLOAD_KEYS) {
      if (!own(value, key) || value[key] === null || value[key] === undefined) continue;
      if (key === 'break_minutes') {
        const numeric = Number(value[key]);
        if (!Number.isInteger(numeric) || numeric < 0) return null;
        out[key] = numeric;
      } else {
        const stringValue = trim(value[key]);
        if (stringValue) out[key] = stringValue;
      }
    }
    return out;
  };

  const normaliseManageApprovedHours = (actionState, recordVersion) => {
    const state = isObject(actionState) ? actionState : {};
    const allowed = state.manage_approved_hours_allowed === true;
    const supplied = state.manage_approved_hours;
    if (!allowed) return (supplied === null || supplied === undefined) ? null : false;
    if (!isObject(supplied) || trim(supplied.endpoint) !== COMMAND_ENDPOINT) return false;
    const expectedRecordVersion = trim(supplied.expected_record_version);
    if (!expectedRecordVersion || expectedRecordVersion !== recordVersion) return false;

    let newItem = null;
    if (supplied.new_item !== null && supplied.new_item !== undefined) {
      if (!isObject(supplied.new_item) || typeof supplied.new_item.allowed !== 'boolean') return false;
      const newAction = supplied.new_item.action === null ? null : upper(supplied.new_item.action);
      const newPayload = normaliseApprovedHoursCommandPayload(supplied.new_item.command_payload);
      if (!newPayload) return false;
      if (supplied.new_item.allowed === true && newAction !== 'APPROVE_PROTECTED_HOURS') return false;
      if (supplied.new_item.allowed === false && newAction !== null) return false;
      newItem = {
        allowed: supplied.new_item.allowed === true,
        action: newAction,
        command_payload: newPayload
      };
    }

    if (!Array.isArray(supplied.items)) return false;
    const seenItemIds = new Set();
    const items = [];
    for (const rawItem of supplied.items) {
      if (!isObject(rawItem)) return false;
      const itemId = trim(rawItem.item_id);
      const workEventId = rawItem.work_event_id === null ? null : trim(rawItem.work_event_id);
      const itemState = upper(rawItem.state);
      const primaryAction = rawItem.primary_action === null ? null : upper(rawItem.primary_action);
      const availableActions = Array.isArray(rawItem.available_actions)
        ? rawItem.available_actions.map(upper)
        : null;
      const commandPayload = normaliseApprovedHoursCommandPayload(rawItem.command_payload);
      const schedule = normaliseApprovedHoursSchedule(rawItem.schedule);
      if (!itemId || seenItemIds.has(itemId) || (rawItem.work_event_id !== null && !workEventId)) return false;
      if (!['WAIT', 'ACCEPTED_SOURCE', 'NOT_WORKED', 'SOURCE'].includes(itemState)) return false;
      if (!availableActions || availableActions.some((action) => !APPROVED_HOURS_EXISTING_ITEM_ACTION_SET.has(action))) return false;
      if (new Set(availableActions).size !== availableActions.length) return false;
      if (primaryAction !== null && (primaryAction !== 'AMEND_PROTECTED_HOURS' || !availableActions.includes(primaryAction))) return false;
      if (!commandPayload || !schedule.work_date || !schedule.start_at_local || !schedule.end_at_local || schedule.break_minutes === null) return false;
      seenItemIds.add(itemId);
      items.push({
        item_id: itemId,
        work_event_id: workEventId,
        state: itemState,
        primary_action: primaryAction,
        available_actions: availableActions,
        command_payload: commandPayload,
        schedule
      });
    }

    return {
      endpoint: COMMAND_ENDPOINT,
      expected_record_version: expectedRecordVersion,
      new_item: newItem,
      items
    };
  };

  // -------------------------------------------------------------------------
  // Lifecycle normalisation.  Nothing here invents a value: a field the server
  // did not send stays absent, and anything the contract calls three-valued is
  // read with all three values in mind.
  // -------------------------------------------------------------------------

  const strOrNull = (value) => {
    if (value === null || value === undefined) return null;
    const text = trim(value);
    return text ? text : null;
  };

  const intOrNull = (value) => {
    const numeric = Number(value);
    return Number.isInteger(numeric) ? numeric : null;
  };

  const stringArray = (value) => (
    Array.isArray(value)
      ? value.map((entry) => trim(entry)).filter(Boolean)
      : []
  );

  const lifecycleErrors = (value) => {
    if (!Array.isArray(value)) return [];
    return value.filter(isObject).map((entry) => ({
      code: trim(entry.code) || 'LIFECYCLE_ERROR',
      detail: trim(entry.detail)
    }));
  };

  const failedLifecycle = (code, detail) => deepFreeze({
    present: false,
    ok: false,
    ui_state: null,
    server_phase: null,
    surface: '',
    heading: null,
    heading_source: 'NONE',
    primary_schedule: null,
    right_pane_status: null,
    permitted_actions: [],
    forbidden_inference: null,
    overlay_states: [],
    overlays: [],
    errors: [{ code, detail }],
    note: null,
    authorisation_state: 'UNKNOWN',
    withdrawn: false,
    current_head: null,
    schedules: {},
    settlement: null,
    payment: null
  });

  // A TIME row is the same row the comparison panes already render, so it keeps
  // every fact the server puts on it: the state, the server's own status and
  // context text, and the additional units. Dropping those would quietly lose
  // `Office-approved hours`, `Client system: not included` and the
  // client-provided expense line, all of which are server copy.
  const normaliseScheduleRowTime = (row, index) => ({
    row_shape: 'TIME',
    row_key: trim(row.row_key) || `time-${index + 1}`,
    day_date: strOrNull(row.day_date),
    hours: strOrNull(row.hours),
    break_text: strOrNull(row.break_text),
    state: trim(row.state),
    status_text: trim(row.status_text),
    issue_text: trim(row.issue_text),
    context_text: trim(row.context_text),
    additional_units: normaliseAdditionalUnits(row.additional_units),
    affected: row.affected === true,
    reference_number: strOrNull(row.reference_number),
    total_hours: strOrNull(row.total_hours)
  });

  const normaliseScheduleRowComponent = (row, index) => {
    // `day_date` and `total_hours` are JSON null for a non-hours component
    // (`component_kind = 'SOURCE_FIXED_EXPENSE'`).  That is a real shape, not
    // a missing value: it renders as a non-hours line.
    const componentKind = trim(row.component_kind);
    return {
      row_shape: 'COMPONENT',
      row_key: trim(row.row_key) || `component-${index + 1}`,
      component_id: strOrNull(row.component_id),
      component_kind: componentKind,
      is_hours_component: componentKind !== 'SOURCE_FIXED_EXPENSE',
      work_event_id: strOrNull(row.work_event_id),
      day_date: strOrNull(row.day_date),
      reference_number: strOrNull(row.reference_number),
      hours_day: strOrNull(row.hours_day),
      hours_night: strOrNull(row.hours_night),
      hours_sat: strOrNull(row.hours_sat),
      hours_sun: strOrNull(row.hours_sun),
      hours_bh: strOrNull(row.hours_bh),
      total_hours: strOrNull(row.total_hours),
      expense_code: strOrNull(row.expense_code),
      state: trim(row.state)
    };
  };

  const normaliseScheduleRowSettlement = (row, index) => ({
    row_shape: 'SETTLEMENT',
    row_key: trim(row.row_key) || `settled-${index + 1}`,
    day_date: strOrNull(row.day_date),
    segment_id: strOrNull(row.segment_id),
    break_text: strOrNull(row.break_text),
    total_hours: strOrNull(row.total_hours),
    hours_day: strOrNull(row.hours_day),
    hours_night: strOrNull(row.hours_night),
    hours_sat: strOrNull(row.hours_sat),
    hours_sun: strOrNull(row.hours_sun),
    hours_bh: strOrNull(row.hours_bh),
    settlement_count: Array.isArray(row.settlements) ? row.settlements.length : 0,
    state: trim(row.state) || 'SETTLED'
  });

  const normaliseSchedule = (value, key) => {
    const envelope = isObject(value) ? value : {};
    // `available:false` means NOT KNOWN, never zero (N3.9.2).
    const available = envelope.available === true;
    const source = available ? (trim(envelope.source) || null) : null;
    const rawRows = available && Array.isArray(envelope.rows) ? envelope.rows.filter(isObject) : [];
    const shape = (source && SCHEDULE_ROW_SHAPES[source]) || scheduleShapeForRows(rawRows);
    const rows = rawRows.map((row, index) => {
      if (shape === 'COMPONENT') return normaliseScheduleRowComponent(row, index);
      if (shape === 'SETTLEMENT') return normaliseScheduleRowSettlement(row, index);
      return normaliseScheduleRowTime(row, index);
    });
    const declaredCount = intOrNull(envelope.row_count);
    return {
      key,
      available,
      // `reason` is null iff available; otherwise a stable machine reason.
      reason: available ? null : (trim(envelope.reason) || 'NOT_AVAILABLE'),
      // The server's own class, read and not derived. `null` on an available
      // schedule, so it can be read unconditionally.
      unavailable_class: available ? null : (trim(envelope.unavailable_class) || null),
      // The server's own plain-English sentence for this state. There are 14 of
      // them and each is safe to show an Office user, so it is displayed rather
      // than replaced by wording of the browser's own.
      reason_detail: available ? null : strOrNull(envelope.reason_detail),
      // A deliberate withholding, not an absence and not a fault.
      withheld: !available && (
        trim(envelope.unavailable_class)
          ? trim(envelope.unavailable_class) === WITHHELD_UNAVAILABLE_CLASS
          : WITHHELD_SCHEDULE_REASONS_LEGACY.has(trim(envelope.reason))
      ),
      source,
      row_shape: shape,
      // row_count 0 with available:true genuinely means an empty schedule.
      row_count: available ? (declaredCount === null ? rows.length : declaredCount) : 0,
      rows,
      // Settlement envelopes carry extra facts; they are optional everywhere
      // else. `batch_count` and `settlement_count` are COUNTS OF EVENTS and are
      // present even when the figure is not; they are never rendered as hours
      // or as money. `total_hours` exists only on an available schedule — an
      // unpaid week has no paid figure, it does not have zero.
      batch_count: intOrNull(envelope.batch_count),
      settlement_count: intOrNull(envelope.settlement_count),
      first_settled_at_utc: strOrNull(envelope.first_settled_at_utc),
      last_settled_at_utc: strOrNull(envelope.last_settled_at_utc),
      // Provenance of the figure: WHICH settlement restated it. Settlements
      // restate, they never accumulate, so nothing here is ever summed.
      position_basis: available ? strOrNull(envelope.position_basis) : null,
      position_settled_at_utc: available ? strOrNull(envelope.position_settled_at_utc) : null,
      position_pay_batch_id: available ? strOrNull(envelope.position_pay_batch_id) : null,
      total_hours: available ? strOrNull(envelope.total_hours) : null
    };
  };

  const normaliseSchedules = (value) => {
    const supplied = isObject(value) ? value : {};
    const out = {};
    for (const key of SCHEDULE_KEYS) out[key] = normaliseSchedule(supplied[key], key);
    return out;
  };

  const normaliseChangeSet = (value) => {
    const change = isObject(value) ? value : {};
    const list = (entries) => (Array.isArray(entries) ? entries.filter(isObject) : []);
    return {
      added: list(change.added),
      removed: list(change.removed),
      changed: list(change.changed).map((entry) => ({
        component_id: strOrNull(entry.component_id),
        work_date: strOrNull(entry.work_date),
        currently_approved_total_hours: strOrNull(entry.currently_approved_total_hours),
        proposed_total_hours: strOrNull(entry.proposed_total_hours)
      })),
      added_count: intOrNull(change.added_count) ?? 0,
      removed_count: intOrNull(change.removed_count) ?? 0,
      changed_count: intOrNull(change.changed_count) ?? 0,
      unchanged_count: intOrNull(change.unchanged_count) ?? 0
    };
  };

  const normaliseDecision = (value) => {
    // N3.4: JSON null means offer no buttons.  Anything malformed is treated
    // exactly like null — the browser never manufactures a decision.
    if (!isObject(value)) return null;
    const endpoint = trim(value.endpoint);
    if (!endpoint) return null;
    if (!isObject(value.command_payload)) return null;
    const actions = Array.isArray(value.actions) ? value.actions.filter(isObject) : [];
    const normalisedActions = [];
    for (const entry of actions) {
      const action = upper(entry.action);
      const label = trim(entry.label);
      if (!DECISION_ACTION_TOKENS.has(action) || !label) return null;
      if (normalisedActions.some((existing) => existing.action === action)) return null;
      normalisedActions.push({
        action,
        label,
        // Erratum E-5: neither decision carries a reason requirement.  A true
        // here would be a server change, so it is carried rather than assumed.
        reason_required: entry.reason_required === true
      });
    }
    if (normalisedActions.length === 0) return null;
    return {
      endpoint,
      owner: trim(value.owner),
      schema_version: trim(value.schema_version),
      actions: normalisedActions,
      command_payload: value.command_payload
    };
  };

  // N3.4a.  One element per root of the decision, in the caller's own order,
  // which is never re-sorted.  A single-root decision has one member and an
  // A-to-B decision has two; the shape is identical, and the two are NEVER
  // summed — they are two positions of one atomic decision.
  const normaliseProposalMember = (value, index) => {
    const member = isObject(value) ? value : {};
    const ordinal = intOrNull(member.root_ordinal);
    return {
      root_ordinal: ordinal === null ? index + 1 : ordinal,
      root_timesheet_id: strOrNull(member.root_timesheet_id),
      is_requested_root: member.is_requested_root === true,
      family_booking_id: strOrNull(member.family_booking_id),
      root_timesheet_version: intOrNull(member.root_timesheet_version),
      contract_id: strOrNull(member.contract_id),
      // null when the proposed half is unavailable — not a missing value.
      authority_kind: strOrNull(member.authority_kind),
      proposed: normaliseSchedule(member.proposed, `member-${index + 1}-proposed`),
      proposed_component_count: intOrNull(member.proposed_component_count),
      proposed_certified_zero: member.proposed_certified_zero === true,
      currently_approved: normaliseSchedule(member.currently_approved, `member-${index + 1}-currently-approved`),
      currently_approved_authority: strOrNull(member.currently_approved_authority),
      currently_approved_head_id: strOrNull(member.currently_approved_head_id),
      currently_approved_component_count: intOrNull(member.currently_approved_component_count)
    };
  };

  const normaliseProposalMembers = (value) => (
    Array.isArray(value)
      ? value.filter(isObject).map(normaliseProposalMember)
      : []
  );

  const normaliseProposal = (value) => {
    if (!isObject(value)) {
      return { present: false, state: 'NONE', decision: null, reason: null, members: [], member_count: 0 };
    }
    const state = upper(value.state) || 'NONE';
    const proposal = {
      present: value.present === true,
      state: PROPOSAL_STATES.has(state) ? state : 'UNAVAILABLE',
      reason: strOrNull(value.reason),
      detail: strOrNull(value.detail),
      // N3.4: absent unless true.  Never render a proposal without it.
      request_digest_verified: value.request_digest_verified === true,
      decision_bundle_id: strOrNull(value.decision_bundle_id),
      bundle_revision: value.bundle_revision === null || value.bundle_revision === undefined
        ? null
        : trim(value.bundle_revision),
      decision_id: strOrNull(value.decision_id),
      bundle_kind: strOrNull(value.bundle_kind),
      member_count: intOrNull(value.member_count),
      members: normaliseProposalMembers(value.members),
      primary_root_ordinal: intOrNull(value.primary_root_ordinal),
      final_revision_id: strOrNull(value.final_revision_id),
      pending_bundle_id: strOrNull(value.pending_bundle_id),
      pending_state: strOrNull(value.pending_state),
      cross_contract: isObject(value.cross_contract) ? value.cross_contract : null,
      proposed: normaliseSchedule(value.proposed, 'proposed'),
      proposed_component_count: intOrNull(value.proposed_component_count),
      proposed_certified_zero: value.proposed_certified_zero === true,
      currently_approved: normaliseSchedule(value.currently_approved, 'currently_approved'),
      currently_approved_component_count: intOrNull(value.currently_approved_component_count),
      currently_approved_authority: strOrNull(value.currently_approved_authority),
      currently_approved_authority_kind: strOrNull(value.currently_approved_authority_kind),
      currently_approved_head_id: strOrNull(value.currently_approved_head_id),
      change: normaliseChangeSet(value.change),
      decision_reason: isObject(value.decision_reason) ? value.decision_reason : null,
      decision: normaliseDecision(value.decision)
    };
    // A proposal whose request digest the server did not verify is never
    // rendered as a proposal and never offers a decision.
    if (!proposal.request_digest_verified) proposal.decision = null;
    return proposal;
  };

  const normaliseInvoiceMovements = (value) => {
    const supplied = isObject(value) ? value : null;
    if (!supplied) {
      return { ok: false, reason: 'INVOICE_MOVEMENT_HISTORY_ABSENT', invoiced_from_source: null, movement_count: 0, movements: [] };
    }
    const ok = supplied.ok === true;
    return {
      ok,
      reason: strOrNull(supplied.reason),
      // N3.6: null when ok is false, and then unknown — never false.
      invoiced_from_source: ok
        ? (typeof supplied.invoiced_from_source === 'boolean' ? supplied.invoiced_from_source : null)
        : null,
      movement_count: intOrNull(supplied.movement_count) ?? 0,
      bound_line_count: intOrNull(supplied.bound_line_count) ?? 0,
      ordinary_invoice_line_count: intOrNull(supplied.ordinary_invoice_line_count) ?? 0,
      movements: Array.isArray(supplied.movements)
        ? supplied.movements.filter(isObject).map((movement, index) => ({
            billing_movement_id: strOrNull(movement.billing_movement_id) || `movement-${index + 1}`,
            work_event_id: strOrNull(movement.work_event_id),
            movement_role: strOrNull(movement.movement_role),
            source_line_kind: strOrNull(movement.source_line_kind),
            source_profile_kind: strOrNull(movement.source_profile_kind),
            final_revision_id: strOrNull(movement.final_revision_id),
            placement_state: strOrNull(movement.placement_state),
            created_at_utc: strOrNull(movement.created_at_utc),
            binding: isObject(movement.binding) ? movement.binding : null,
            invoice_status: strOrNull(movement.invoice_status),
            note: strOrNull(movement.note)
          }))
        : []
    };
  };

  const normaliseUnauthorise = (actionState) => {
    const state = isObject(actionState) ? actionState : {};
    const supplied = isObject(state.unauthorise) ? state.unauthorise : null;
    if (!supplied) {
      // The server did not answer.  Availability comes from the server only,
      // so the control is not offered, and the screen says nothing about why.
      return {
        answered: false,
        allowed: false,
        available: false,
        refusal_code: null,
        refusal_nature: null,
        permanent: false,
        retryable: false,
        reason: null,
        refusal_message: null,
        authorisation_state: 'UNKNOWN',
        withdrawn: false,
        availability_source: null
      };
    }
    const nature = upper(supplied.refusal_nature) || 'NONE';
    const code = trim(supplied.refusal_code) || 'NONE';
    return {
      answered: true,
      // `unauthorise_allowed` is the server's sibling boolean; `available` is
      // the verdict's own.  Both must be true, and a non-boolean is unsafe.
      allowed: state.unauthorise_allowed === true && supplied.available === true,
      available: supplied.available === true,
      refusal_code: code === 'NONE' ? null : code,
      refusal_nature: nature === 'NONE' ? null : nature,
      permanent: supplied.permanent === true,
      retryable: supplied.retryable === true,
      reason: strOrNull(supplied.reason),
      // Carried when present; the Gate 9 bridge does not send it today
      // (WP-12_NEEDS N1).  When it arrives it is rendered verbatim.
      refusal_message: strOrNull(supplied.refusal_message),
      authorisation_state: upper(supplied.authorisation_state) || 'UNKNOWN',
      withdrawn: supplied.withdrawn === true,
      availability_source: strOrNull(supplied.availability_source)
    };
  };

  const normaliseLifecycle = (presentation, actionState) => {
    const supplied = isObject(presentation) ? presentation.lifecycle : null;
    if (!isObject(supplied)) {
      return failedLifecycle('LIFECYCLE_ABSENT', 'The server did not return a lifecycle phase for this Timesheet.');
    }
    if (trim(supplied.contract) !== LIFECYCLE_CONTRACT) {
      return failedLifecycle('LIFECYCLE_CONTRACT_MISMATCH', 'The lifecycle projection is not the contract this screen reads.');
    }
    if (supplied.ok !== true) {
      const errors = lifecycleErrors(supplied.errors);
      return deepFreeze({
        present: true,
        ok: false,
        ui_state: null,
        server_phase: strOrNull(supplied.server_phase),
        surface: trim(supplied.surface),
        heading: null,
        heading_source: 'NONE',
        primary_schedule: null,
        right_pane_status: null,
        permitted_actions: [],
        forbidden_inference: null,
        overlay_states: stringArray(supplied.overlay_states),
        overlays: [],
        errors: errors.length ? errors : [{ code: 'LIFECYCLE_NOT_OK', detail: '' }],
        note: strOrNull(supplied.note),
        authorisation_state: 'UNKNOWN',
        withdrawn: false,
        current_head: null,
        schedules: {},
        settlement: null,
        payment: null,
        unauthorise: normaliseUnauthorise(actionState)
      });
    }

    const headingSourceRaw = upper(supplied.heading_source);
    const headingSource = HEADING_SOURCES.has(headingSourceRaw) ? headingSourceRaw : 'NONE';
    // The heading is rendered verbatim.  A JSON null means this owner supplies
    // no heading and the legacy owner's is used; it is NEVER a cue to build one
    // in JavaScript.
    const heading = supplied.heading === null || supplied.heading === undefined
      ? null
      : String(supplied.heading);
    const permittedActions = stringArray(supplied.permitted_actions)
      .map(upper)
      .filter((token) => PERMITTED_ACTION_TOKENS.has(token));
    const primarySchedule = strOrNull(supplied.primary_schedule);
    const unauthorise = normaliseUnauthorise(actionState);

    return deepFreeze({
      present: true,
      ok: true,
      ui_state: strOrNull(supplied.ui_state),
      server_phase: strOrNull(supplied.server_phase),
      surface: trim(supplied.surface) || 'OFFICE',
      heading,
      heading_source: headingSource,
      primary_schedule: primarySchedule && SCHEDULE_KEY_SET.has(primarySchedule) ? primarySchedule : null,
      right_pane_status: strOrNull(supplied.right_pane_status),
      permitted_actions: permittedActions,
      forbidden_inference: strOrNull(supplied.forbidden_inference),
      overlay_states: stringArray(supplied.overlay_states),
      overlays: Array.isArray(supplied.overlays) ? supplied.overlays.filter(isObject) : [],
      errors: [],
      note: strOrNull(supplied.note),
      member_timesheet_ids: stringArray(supplied.member_timesheet_ids),
      canonical_timesheet_id: strOrNull(supplied.canonical_timesheet_id),
      authorisation_state: upper(supplied.authorisation_state) || unauthorise.authorisation_state,
      withdrawn: upper(supplied.authorisation_state) === 'WITHDRAWN' || unauthorise.withdrawn === true,
      authorisation_generations: isObject(supplied.authorisation_generations)
        ? supplied.authorisation_generations
        : null,
      // JSON null means no committed current head, NOT zero hours.
      current_head: isObject(supplied.current_head) ? supplied.current_head : null,
      settlement: isObject(supplied.settlement) ? supplied.settlement : null,
      payment: isObject(supplied.payment) ? supplied.payment : null,
      schedules: normaliseSchedules(supplied.schedules),
      unauthorise
    });
  };

  const normaliseLifecyclePolicy = (workspacePayload) => {
    const supplied = isObject(workspacePayload) ? workspacePayload.lifecycle_policy : null;
    if (!isObject(supplied) || trim(supplied.contract) !== LIFECYCLE_POLICY_CONTRACT) return null;
    const rows = Array.isArray(supplied.rows) ? supplied.rows.filter(isObject) : [];
    const byState = {};
    for (const row of rows) {
      const uiState = trim(row.ui_state);
      if (!uiState) continue;
      byState[uiState] = {
        ui_state: uiState,
        server_phase: strOrNull(row.server_phase),
        surface: trim(row.surface),
        heading: row.heading === null || row.heading === undefined ? null : String(row.heading),
        heading_source: upper(row.heading_source) || 'NONE',
        primary_schedule: strOrNull(row.primary_schedule),
        right_pane_status: strOrNull(row.right_pane_status),
        allowed_new_actions: stringArray(row.allowed_new_actions).map(upper),
        forbidden_inference: strOrNull(row.forbidden_inference)
      };
    }
    return deepFreeze({
      contract: LIFECYCLE_POLICY_CONTRACT,
      policy_version: trim(supplied.policy_version),
      source: trim(supplied.source),
      row_count: rows.length,
      by_ui_state: byState,
      browser_may_infer_phase: supplied.browser_may_infer_phase === true
    });
  };

  const buildViewModelFromPresentation = (presentation) => {
    if (!isObject(presentation)) {
      return unavailableViewModel('This Timesheet cannot be checked right now. Please refresh and try again.');
    }
    // UI-016 and UI-017.  The server answers an ordinary Weekly or a Daily
    // Timesheet with an explicit `applicable:false` bypass return, which carries
    // a lifecycle object and NO presentation contract.  That is not a malformed
    // projection: it is the server saying the Weekly Source component must not
    // mount.  Treating it as malformed painted a "Timesheet needs refreshing"
    // notice over an ordinary Weekly Timesheet, which is exactly the regression
    // the two bypass rows exist to prevent.
    if (presentation.applicable === false) return passthroughViewModel();
    if (trim(presentation.contract) !== CONTRACT || upper(presentation.scope) !== 'WEEKLY') {
      return unavailableViewModel('This Timesheet cannot be checked right now. Please refresh and try again.');
    }

    const route = ROUTES[upper(presentation.route)];
    if (!route || upper(presentation.authority) !== route.authority) {
      return unavailableViewModel('The hours for this Timesheet are not available. Please refresh before continuing.');
    }

    const recordVersion = trim(presentation.record_version);
    const freshness = upper(presentation.freshness);
    if (!recordVersion || freshness !== 'CURRENT') {
      return unavailableViewModel('This Timesheet has changed. Please refresh before continuing.');
    }

    const comparison = isObject(presentation.comparison) ? presentation.comparison : {};
    const comparisonState = upper(comparison.state);
    if (!COMPARISON_STATES.has(comparisonState)) {
      return unavailableViewModel('The hours for this Timesheet are not available. Please refresh before continuing.');
    }

    const sourceRows = normaliseHoursRows(comparison.source_rows, 'source');
    const submittedRows = normaliseHoursRows(comparison.submitted_rows, 'submitted');
    const approvedRows = normaliseHoursRows(presentation.approved_rows, 'approved');
    const comparisonRows = normaliseComparisonRows(comparison.rows);
    const totals = normaliseTotals(presentation.totals);
    const actionState = isObject(presentation.action_state) ? presentation.action_state : {};
    const manageApprovedHours = normaliseManageApprovedHours(actionState, recordVersion);
    if (manageApprovedHours === false) {
      return unavailableViewModel('The approved hours actions are not available. Please refresh before continuing.');
    }
    const affectedSubmittedRows = submittedRows.filter((row) => row.affected === true);
    // This fail-closed guard belongs to the CLIENT_SYSTEM route only.  There,
    // a mismatch with submitted rows and none marked affected really is a
    // malformed projection.  On the SIGNED_TIMESHEET route the signed Timesheet
    // is the authority and is never the affected side: the mismatch is a client
    // system check, so the server legitimately returns `affected:false` on every
    // submitted row (matrix row UI-015, "Do not query Candidate"). Applying the
    // CLIENT_SYSTEM invariant there made every Timesheet-authority mismatch
    // render as unavailable.
    if (route.authority === 'CLIENT_SYSTEM'
        && comparisonState === 'MISMATCH'
        && submittedRows.length > 0
        && affectedSubmittedRows.length === 0) {
      return unavailableViewModel('The hours needing attention are not available. Please refresh before continuing.');
    }
    const totalsRequired = true;
    const hasCompleteTotals = !!totals;
    const serverAllowsAuthorise = actionState.authorise_allowed === true;
    const blocksAuthorisation = !hasCompleteTotals || !serverAllowsAuthorise || comparisonState === 'UNAVAILABLE';
    const sourceExpensePolicyRaw = upper(presentation.source_expense_policy);
    if (route.authority === 'CLIENT_SYSTEM' && !['SOURCE_SUPPLIED', 'SEPARATE_ADDITIONAL_TIMESHEET'].includes(sourceExpensePolicyRaw)) {
      return unavailableViewModel('The expense handling for this Timesheet is not available. Please refresh before continuing.');
    }
    const sourceExpensePolicy = sourceExpensePolicyRaw === 'SOURCE_SUPPLIED'
      ? 'SOURCE_SUPPLIED'
      : 'SEPARATE_ADDITIONAL_TIMESHEET';
    const expenseOwner = route.authority === 'SIGNED_TIMESHEET'
      ? 'CURRENT_TIMESHEET'
      : sourceExpensePolicy;

    // Gate 10.  The server phase drives both presentation renderers.  It is
    // read here once, so that no renderer has to reach back into the raw
    // payload and no renderer can be tempted to decide a heading for itself.
    const lifecycle = normaliseLifecycle(presentation, actionState);
    const proposal = normaliseProposal(presentation.proposal);
    const invoiceMovements = normaliseInvoiceMovements(presentation.invoice_movement_history);

    return deepFreeze({
      mount: true,
      render_mode: 'WEEKLY_SOURCE',
      is_weekly_source: true,
      record_version: recordVersion,
      lifecycle,
      lifecycle_ok: lifecycle.ok === true,
      ui_state: lifecycle.ui_state,
      server_phase: lifecycle.server_phase,
      heading: lifecycle.heading,
      heading_source: lifecycle.heading_source,
      primary_schedule_key: lifecycle.primary_schedule,
      right_pane_status: lifecycle.right_pane_status,
      permitted_actions: lifecycle.permitted_actions,
      overlay_states: lifecycle.overlay_states,
      proposal,
      invoice_movements: invoiceMovements,
      unauthorise: lifecycle.unauthorise,
      unauthorise_allowed: lifecycle.unauthorise ? lifecycle.unauthorise.allowed === true : false,
      // A managed root is the server's verdict, not the browser's: the
      // withdrawal availability owner answers `NOT_MANAGED_ROOT` by name for a
      // root it does not manage, and that is the ONLY signal used to decide
      // which owner an `Unauthorise` click belongs to.
      managed_root: !!(lifecycle.unauthorise
        && lifecycle.unauthorise.answered === true
        && lifecycle.unauthorise.refusal_code !== 'WEEKLY_SOURCE_UNAUTHORISE_NOT_MANAGED_ROOT'),
      withdrawn: lifecycle.withdrawn === true,
      route_key: route.key,
      authority: route.authority,
      category_key: route.category_key,
      category_label: route.category_label,
      default_middle_pane: route.default_middle_pane,
      source_title: trim(presentation.source_title) || route.source_title,
      submitted_title: trim(presentation.submitted_title) || route.submitted_title,
      comparison_state: comparisonState,
      source_rows: sourceRows,
      submitted_rows: submittedRows,
      comparison_rows: comparisonRows,
      approved_rows: approvedRows,
      totals,
      totals_required: totalsRequired,
      totals_ready: hasCompleteTotals,
      authorise_allowed: !blocksAuthorisation,
      manage_approved_hours_allowed: actionState.manage_approved_hours_allowed === true && !!manageApprovedHours,
      manage_approved_hours: manageApprovedHours,
      add_additional_expense_timesheet_allowed: actionState.add_additional_expense_timesheet_allowed === true,
      blocks_authorisation: blocksAuthorisation,
      blocked_reason: blocksAuthorisation
        ? (trim(actionState.blocked_reason) || (!hasCompleteTotals
            ? 'Totals are unavailable. Refresh this Timesheet before continuing.'
            : 'This Timesheet is not ready to authorise.'))
        : '',
      submitted_timesheet_available: presentation.submitted_timesheet_available === true,
      submitted_timesheet_complete: presentation.submitted_timesheet_complete === true,
      expense_owner: expenseOwner,
      source_original_allows_candidate_expenses: route.authority === 'SIGNED_TIMESHEET',
      files_owner: 'EXISTING_EVIDENCE_CONTROLLER'
    });
  };

  const buildViewModel = (hostPayload) => {
    if (!isObject(hostPayload) || !own(hostPayload, PRESENTATION_KEY)) return passthroughViewModel();
    const presentation = hostPayload[PRESENTATION_KEY];
    if (!isObject(presentation)) return unavailableViewModel();
    if (upper(presentation.scope) !== 'WEEKLY') return passthroughViewModel();
    return buildViewModelFromPresentation(presentation);
  };

  const normaliseCategoryKey = (value) => {
    const key = upper(value);
    return CATEGORY_KEYS.has(key) ? key : 'STANDARD_TIMESHEETS';
  };

  const backendClassificationForCategory = (value) => {
    const category = normaliseCategoryKey(value);
    if (category === 'NHSP') return 'NHSP';
    if (category === 'CLIENT_PROVIDED_HOURS') return 'HR';
    return 'TIMESHEETS';
  };

  const findHostPayload = (candidates) => {
    const queue = Array.isArray(candidates) ? candidates.slice() : [candidates];
    const seen = new Set();
    const nestedKeys = ['details', 'timesheet', 'row', 'data', 'active_details', 'active_context', 'active_ctx'];

    while (queue.length > 0) {
      const candidate = queue.shift();
      if (!isObject(candidate) || seen.has(candidate)) continue;
      seen.add(candidate);
      if (own(candidate, PRESENTATION_KEY)) {
        const embeddedPresentation = candidate[PRESENTATION_KEY];
        if (isObject(embeddedPresentation)) return candidate;
        // The existing details normaliser carries a null compatibility slot on
        // ordinary Weekly and Daily Timesheets. Treat that slot exactly like an
        // absent projection; a non-null malformed projection still fails closed.
        if (embeddedPresentation !== null && embeddedPresentation !== undefined) return candidate;
      }
      for (const key of nestedKeys) {
        if (isObject(candidate[key])) queue.push(candidate[key]);
      }
    }

    return null;
  };

  const stateMeta = (stateValue) => {
    const state = upper(stateValue);
    if (state === 'MATCH') return { class_name: 'is-match', label: 'Match' };
    if (state === 'MISMATCH') return { class_name: 'is-mismatch', label: 'Check hours' };
    if (state === 'NO_TIMESHEET') return { class_name: 'is-waiting', label: 'Waiting for Timesheet' };
    if (state === 'WAITING') return { class_name: 'is-waiting', label: 'Waiting' };
    if (state === 'PROTECTED') return { class_name: 'is-protected', label: 'Office-approved hours' };
    return { class_name: 'is-ready', label: 'Ready' };
  };

  const renderAdditionalUnits = (units) => {
    if (!Array.isArray(units) || units.length === 0) return '<span class="weekly-source-v1__empty">—</span>';
    return units.map((unit) => {
      const meta = stateMeta(unit.state);
      return `<span class="weekly-source-v1__unit ${meta.class_name}"><span>${escapeHtml(unit.label)}</span><strong>${escapeHtml(unit.value)}</strong></span>`;
    }).join('');
  };

  const renderHoursRows = (rows, options) => {
    const list = Array.isArray(rows) ? rows : [];
    const opts = isObject(options) ? options : {};
    const showStatus = opts.show_status !== false;
    if (list.length === 0) {
      return `<tr><td colspan="${showStatus ? '5' : '4'}"><span class="weekly-source-v1__empty">No hours to show.</span></td></tr>`;
    }
    return list.map((row) => {
      const meta = stateMeta(row.state);
      const statusText = row.status_text || row.issue_text || meta.label;
      return `
        <tr class="${meta.class_name}" data-row-key="${escapeHtml(row.row_key)}">
          <td data-weekly-source-label="Day and date">${escapeHtml(row.day_date)}</td>
          <td data-weekly-source-label="Hours">${escapeHtml(row.hours)}</td>
          <td data-weekly-source-label="Break">${escapeHtml(row.break_text)}</td>
          <td data-weekly-source-label="Additional units"><div class="weekly-source-v1__units">${renderAdditionalUnits(row.additional_units)}</div></td>
          ${showStatus ? `<td data-weekly-source-label="Status"><span class="weekly-source-v1__status ${meta.class_name}">${escapeHtml(statusText)}</span>${row.context_text ? `<span class="weekly-source-v1__row-context">${escapeHtml(row.context_text)}</span>` : ''}</td>` : ''}
        </tr>`;
    }).join('');
  };

  const renderHoursTable = (title, rows, options) => {
    const opts = isObject(options) ? options : {};
    const showStatus = opts.show_status !== false;
    const toneClass = trim(opts.tone_class);
    return `
      <section class="weekly-source-v1__hours-card ${escapeHtml(toneClass)}" aria-label="${escapeHtml(title)}">
        <div class="weekly-source-v1__card-heading">
          <h3>${escapeHtml(title)}</h3>
          ${opts.badge ? `<span class="weekly-source-v1__authority">${escapeHtml(opts.badge)}</span>` : ''}
        </div>
        <div class="weekly-source-v1__table-scroll">
          <table class="weekly-source-v1__table">
            <thead><tr><th>Day and date</th><th>Hours</th><th>Break</th><th>Additional units</th>${showStatus ? '<th>Status</th>' : ''}</tr></thead>
            <tbody>${renderHoursRows(rows, { show_status: showStatus })}</tbody>
          </table>
        </div>
      </section>`;
  };

  const renderFinalisedSourceRows = (title, rows) => {
    const list = Array.isArray(rows) ? rows : [];
    const includesProtected = list.some(row => row.state === 'PROTECTED');
    return `<section class="weekly-source-v1__hours-card" aria-label="${escapeHtml(title)}">
      <div class="weekly-source-v1__card-heading"><h3>${escapeHtml(title)}</h3>
        <span class="weekly-source-v1__authority">${includesProtected ? 'Finalised source + Office-approved' : 'Finalised source'}</span></div>
      <div class="weekly-source-v1__table-scroll"><table class="weekly-source-v1__table">
        <thead><tr><th>Day and date</th><th>Reference</th><th>Start</th><th>End</th><th>Break</th><th>Status</th></tr></thead>
        <tbody>${list.length ? list.map(row => {
          const match = String(row.hours || '').match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/);
          const meta = stateMeta(row.state);
          return `<tr class="${meta.class_name}" data-row-key="${escapeHtml(row.row_key)}">
            <td data-weekly-source-label="Day and date">${escapeHtml(row.day_date)}</td><td data-weekly-source-label="Reference">${escapeHtml(row.reference_number || '—')}</td>
            <td data-weekly-source-label="Start">${escapeHtml(match ? match[1] : row.hours)}</td><td data-weekly-source-label="End">${escapeHtml(match ? match[2] : '—')}</td>
            <td data-weekly-source-label="Break">${escapeHtml(row.break_text)}</td>
            <td data-weekly-source-label="Status"><span class="weekly-source-v1__status ${meta.class_name}">${escapeHtml(row.status_text || meta.label)}</span></td>
          </tr>`;
        }).join('') : '<tr><td colspan="6" class="weekly-source-v1__empty">No finalised source hours to show.</td></tr>'}</tbody>
      </table></div></section>`;
  };

  const renderUnavailable = (viewModel) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    return `
      <div class="weekly-source-v1 weekly-source-v1__notice is-mismatch" role="status">
        <strong>Timesheet needs refreshing</strong>
        <span>${escapeHtml(vm.unavailable_reason || 'This Timesheet cannot be checked right now. Please refresh and try again.')}</span>
      </div>`;
  };

  const renderCategoryTabs = (activeKey, counts) => {
    const active = normaliseCategoryKey(activeKey);
    const countMap = isObject(counts) ? counts : {};
    const optionHtml = CATEGORIES.map((category) => {
      const selected = category.key === active;
      const count = Number(countMap[category.key]);
      const label = `${category.label}${Number.isInteger(count) && count >= 0 ? ` (${count})` : ''}`;
      return `<option value="${escapeHtml(category.key)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    return `
      <label class="weekly-source-v1 weekly-source-v1__category-select">
        <span>Timesheet type</span>
        <select data-weekly-source-category-select aria-label="Timesheet type">${optionHtml}</select>
      </label>
      <nav class="weekly-source-v1 weekly-source-v1__categories" aria-label="Timesheet type">
        ${CATEGORIES.map((category) => {
          const selected = category.key === active;
          const count = Number(countMap[category.key]);
          return `<button type="button" role="tab" class="weekly-source-v1__category${selected ? ' is-active' : ''}" data-weekly-source-category="${escapeHtml(category.key)}" aria-selected="${selected ? 'true' : 'false'}">${escapeHtml(category.label)}${Number.isInteger(count) && count >= 0 ? ` <span>${escapeHtml(String(count))}</span>` : ''}</button>`;
        }).join('')}
      </nav>`;
  };

  const renderMiddlePaneTabs = (activePane) => {
    const active = upper(activePane) === 'FILES' ? 'FILES' : 'HOURS';
    return `
      <div class="weekly-source-v1 weekly-source-v1__middle-tabs" role="tablist" aria-label="Timesheet detail">
        <button type="button" role="tab" data-weekly-source-middle-pane="HOURS" aria-selected="${active === 'HOURS' ? 'true' : 'false'}" class="${active === 'HOURS' ? 'is-active' : ''}">Hours</button>
        <button type="button" role="tab" data-weekly-source-middle-pane="FILES" aria-selected="${active === 'FILES' ? 'true' : 'false'}" class="${active === 'FILES' ? 'is-active' : ''}">Files</button>
      </div>`;
  };

  const renderBulkHoursPane = (viewModel) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    if (vm.render_mode === 'UNAVAILABLE') return renderUnavailable(vm);
    if (!vm.mount) return '';

    if (vm.authority === 'SIGNED_TIMESHEET') {
      const signedRows = vm.approved_rows.length > 0 ? vm.approved_rows : vm.submitted_rows;
      const affectedSystemRows = vm.source_rows.filter((row) => row.affected === true || row.state === 'MISMATCH');
      const signedTable = renderHoursTable('Signed Timesheet hours', signedRows, {
        tone_class: vm.comparison_state === 'MISMATCH' ? 'is-mismatch' : 'is-match',
        badge: 'Used for pay and invoice'
      });
      if (vm.comparison_state === 'WAITING_FOR_COMPLETE_TIMESHEET') {
        return `<div class="weekly-source-v1">${signedTable}<div class="weekly-source-v1__notice is-waiting"><strong>Waiting for completed Timesheet</strong><span>The Timesheet can be checked after the worker and manager have signed it.</span></div></div>`;
      }
      if (vm.comparison_state !== 'MISMATCH') return `<div class="weekly-source-v1">${signedTable}</div>`;
      return `<div class="weekly-source-v1">${signedTable}${renderHoursTable('Client system checks needing attention', affectedSystemRows, { tone_class: 'is-mismatch', badge: 'Check only' })}</div>`;
    }

    const sourceTone = vm.comparison_state === 'MATCH'
      ? 'is-match'
      : (vm.comparison_state === 'NO_TIMESHEET' ? 'is-waiting' : 'is-mismatch');
    const sourceTable = renderHoursTable(vm.source_title, vm.source_rows, {
      tone_class: sourceTone,
      badge: 'Used for pay and invoice'
    });

    if (vm.comparison_state === 'MATCH') return `<div class="weekly-source-v1">${sourceTable}</div>`;

    if (vm.comparison_state === 'NO_TIMESHEET') {
      return `<div class="weekly-source-v1">${sourceTable}<div class="weekly-source-v1__notice is-waiting"><strong>No submitted Timesheet available</strong><span>The client system hours can be reviewed while the Timesheet is awaited.</span></div></div>`;
    }

    if (vm.comparison_state === 'WAITING_FOR_COMPLETE_TIMESHEET') {
      return `<div class="weekly-source-v1">${sourceTable}<div class="weekly-source-v1__notice is-waiting"><strong>Waiting for completed Timesheet</strong><span>The hours can be compared after the Timesheet is complete.</span></div></div>`;
    }

    const affectedSubmittedRows = vm.submitted_rows.filter((row) => row.affected === true);
    return `<div class="weekly-source-v1">${sourceTable}${renderHoursTable('Submitted hours needing attention', affectedSubmittedRows, { tone_class: 'is-mismatch', badge: 'Evidence' })}</div>`;
  };

  const renderSimpleComparison = (viewModel) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    if (vm.render_mode === 'UNAVAILABLE') return renderUnavailable(vm);
    if (!vm.mount) return '';

    const sourceBadge = vm.authority === 'CLIENT_SYSTEM' ? 'Used for pay and invoice' : 'Used to check and add the reference';
    const submittedBadge = vm.authority === 'SIGNED_TIMESHEET' ? 'Used for pay and invoice' : 'Evidence';
    const toneClass = vm.comparison_state === 'MATCH'
      ? 'is-match'
      : (vm.comparison_state === 'NO_TIMESHEET' ? 'is-waiting' : 'is-mismatch');
    const submittedContent = vm.comparison_state === 'NO_TIMESHEET'
      ? `
        <section class="weekly-source-v1__hours-card" aria-label="${escapeHtml(vm.submitted_title)}">
          <div class="weekly-source-v1__card-heading"><h3>${escapeHtml(vm.submitted_title)}</h3><span class="weekly-source-v1__authority">Evidence</span></div>
          <div class="weekly-source-v1__notice is-waiting"><strong>No submitted Timesheet available</strong><span>The client system hours can be reviewed while the Timesheet is awaited.</span></div>
        </section>`
      : renderHoursTable(vm.submitted_title, vm.submitted_rows, { tone_class: toneClass, badge: submittedBadge });

    return `
      <div class="weekly-source-v1 weekly-source-v1__comparison" data-comparison-state="${escapeHtml(vm.comparison_state)}">
        ${renderHoursTable(vm.source_title, vm.source_rows, { tone_class: toneClass, badge: sourceBadge })}
        ${submittedContent}
      </div>`;
  };

  // -------------------------------------------------------------------------
  // Gate 10 renderers driven by the server phase.
  //
  // Five rules, from WP-11b handoff N3.9, are enforced here rather than
  // described:
  //   1. the heading is rendered verbatim and never mapped in JavaScript;
  //   2. `available:false` on a schedule means NOT KNOWN, never zero;
  //   3. `ok:false` is an explicit error state with no heading, schedule or
  //      action;
  //   4. the two decisions appear only when `proposal.decision` is non-null;
  //   5. invoice movement history is never a pay schedule.
  // -------------------------------------------------------------------------

  const lifecycleOf = (viewModel) => (
    isObject(viewModel) && isObject(viewModel.lifecycle) ? viewModel.lifecycle : null
  );

  const renderLifecycleError = (viewModel) => {
    const lifecycle = lifecycleOf(viewModel);
    const errors = lifecycle && Array.isArray(lifecycle.errors) && lifecycle.errors.length
      ? lifecycle.errors
      : [{ code: 'LIFECYCLE_ABSENT', detail: '' }];
    const detail = trim(errors[0].detail);
    return `
      <div class="weekly-source-v1 weekly-source-v1__notice is-mismatch" role="status" data-weekly-source-lifecycle-error="1" data-weekly-source-error-code="${escapeHtml(errors[0].code)}">
        <strong>This Timesheet cannot be shown</strong>
        <span>${escapeHtml(detail || 'The server could not state where this week is in its pay life. Refresh before continuing.')}</span>
      </div>`;
  };

  const renderScheduleUnavailable = (schedule, label) => {
    // The heading is still the server's and is still shown; only the figure is
    // absent. Two states are kept apart because they mean different things to
    // an Office user: "the server did not supply it" and "the server is
    // deliberately not stating it".
    //
    // Where the server supplies its own sentence for the state, that sentence
    // is rendered verbatim. The browser writes its own only as a fallback, and
    // never a number: an unpaid week has no paid figure, it does not have zero.
    const withheld = schedule.withheld === true;
    const title = withheld ? 'This figure is being withheld' : 'Not available';
    const fallback = withheld
      ? 'The paid position for this Timesheet cannot be stated, so it is not shown. No other figure stands in for it.'
      : 'These hours have not been supplied for this Timesheet.';
    const body = schedule.reason_detail || fallback;
    return `
      <section class="weekly-source-v1__hours-card is-waiting" aria-label="${escapeHtml(label)}" data-weekly-source-schedule-unavailable="${escapeHtml(schedule.key)}"${withheld ? ' data-weekly-source-schedule-withheld="1"' : ''}${schedule.unavailable_class ? ` data-weekly-source-unavailable-class="${escapeHtml(schedule.unavailable_class)}"` : ''}>
        <div class="weekly-source-v1__card-heading"><h3>${escapeHtml(label)}</h3></div>
        <div class="weekly-source-v1__notice is-waiting">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(body)} <span class="weekly-source-v1__reason-tag">${escapeHtml(schedule.reason || 'NOT_AVAILABLE')}</span></span>
        </div>
      </section>`;
  };

  const renderTimeScheduleRows = (rows) => {
    if (!rows.length) return '<tr><td colspan="5"><span class="weekly-source-v1__empty">No hours to show.</span></td></tr>';
    return rows.map((row) => {
      const meta = stateMeta(row.state);
      const statusText = row.status_text || row.issue_text || meta.label;
      return `
        <tr class="${meta.class_name}" data-row-key="${escapeHtml(row.row_key)}">
          <td>${escapeHtml(row.day_date || '—')}</td>
          <td>${escapeHtml(row.hours || '—')}</td>
          <td>${escapeHtml(row.break_text || '—')}</td>
          <td><div class="weekly-source-v1__units">${renderAdditionalUnits(row.additional_units)}</div></td>
          <td><span class="weekly-source-v1__status ${meta.class_name}">${escapeHtml(statusText)}</span>${row.context_text ? `<span class="weekly-source-v1__row-context">${escapeHtml(row.context_text)}</span>` : ''}</td>
        </tr>`;
    }).join('');
  };

  const renderComponentScheduleRows = (rows) => {
    if (!rows.length) return '<tr><td colspan="9"><span class="weekly-source-v1__empty">No hours to show.</span></td></tr>';
    return rows.map((row) => {
      const meta = stateMeta(row.state);
      if (!row.is_hours_component) {
        // `day_date` and `total_hours` are null by contract for a non-hours
        // component.  It is rendered as a non-hours line, never as zero hours.
        return `
          <tr class="is-ready weekly-source-v1__non-hours-row" data-row-key="${escapeHtml(row.row_key)}" data-weekly-source-non-hours="1">
            <td colspan="8">Client-provided expense${row.expense_code ? ` · ${escapeHtml(row.expense_code)}` : ''}</td>
            <td><span class="weekly-source-v1__status is-ready">${escapeHtml(row.state || 'Included')}</span></td>
          </tr>`;
      }
      return `
        <tr class="${meta.class_name}" data-row-key="${escapeHtml(row.row_key)}">
          <td>${escapeHtml(row.day_date || '—')}</td>
          <td>${escapeHtml(row.reference_number || '—')}</td>
          <td>${escapeHtml(row.hours_day || '—')}</td>
          <td>${escapeHtml(row.hours_night || '—')}</td>
          <td>${escapeHtml(row.hours_sat || '—')}</td>
          <td>${escapeHtml(row.hours_sun || '—')}</td>
          <td>${escapeHtml(row.hours_bh || '—')}</td>
          <td>${escapeHtml(row.total_hours || '—')}</td>
          <td><span class="weekly-source-v1__status ${meta.class_name}">${escapeHtml(row.state || meta.label)}</span></td>
        </tr>`;
    }).join('');
  };

  const renderSettlementScheduleRows = (rows) => {
    if (!rows.length) return '<tr><td colspan="9"><span class="weekly-source-v1__empty">No settled hours to show.</span></td></tr>';
    return rows.map((row) => `
        <tr class="is-ready" data-row-key="${escapeHtml(row.row_key)}">
          <td>${escapeHtml(row.day_date || '—')}</td>
          <td>${escapeHtml(row.break_text || '—')}</td>
          <td>${escapeHtml(row.hours_day || '—')}</td>
          <td>${escapeHtml(row.hours_night || '—')}</td>
          <td>${escapeHtml(row.hours_sat || '—')}</td>
          <td>${escapeHtml(row.hours_sun || '—')}</td>
          <td>${escapeHtml(row.hours_bh || '—')}</td>
          <td>${escapeHtml(row.total_hours || '—')}</td>
          <td><span class="weekly-source-v1__status is-ready">${escapeHtml(row.state || 'SETTLED')}</span></td>
        </tr>`).join('');
  };

  const SCHEDULE_HEAD_MARKUP = Object.freeze({
    TIME: '<tr><th>Day and date</th><th>Hours</th><th>Break</th><th>Additional units</th><th>Status</th></tr>',
    COMPONENT: '<tr><th>Day and date</th><th>Reference</th><th>Day</th><th>Night</th><th>Saturday</th><th>Sunday</th><th>Bank holiday</th><th>Total hours</th><th>Status</th></tr>',
    SETTLEMENT: '<tr><th>Day and date</th><th>Break</th><th>Day</th><th>Night</th><th>Saturday</th><th>Sunday</th><th>Bank holiday</th><th>Total hours</th><th>Status</th></tr>'
  });

  // `label` always arrives from the server (a lifecycle heading) or from a
  // fixed non-lifecycle caption such as `Proposed hours`.  It is never derived
  // from `ui_state` here.
  const renderServerSchedule = (schedule, label, options) => {
    if (!isObject(schedule)) return '';
    const opts = isObject(options) ? options : {};
    const caption = String(label == null ? '' : label);
    if (schedule.available !== true) return renderScheduleUnavailable(schedule, caption);
    const shape = schedule.row_shape === 'COMPONENT' || schedule.row_shape === 'SETTLEMENT'
      ? schedule.row_shape
      : 'TIME';
    const body = shape === 'COMPONENT'
      ? renderComponentScheduleRows(schedule.rows)
      : (shape === 'SETTLEMENT' ? renderSettlementScheduleRows(schedule.rows) : renderTimeScheduleRows(schedule.rows));
    const settledSummary = shape === 'SETTLEMENT' && schedule.total_hours
      ? `<span class="weekly-source-v1__authority">Total ${escapeHtml(schedule.total_hours)}</span>`
      : '';
    return `
      <section class="weekly-source-v1__hours-card ${escapeHtml(trim(opts.tone_class))}" aria-label="${escapeHtml(caption)}" data-weekly-source-schedule="${escapeHtml(schedule.key)}" data-weekly-source-schedule-source="${escapeHtml(schedule.source || '')}">
        <div class="weekly-source-v1__card-heading">
          <h3>${escapeHtml(caption)}</h3>
          ${opts.badge ? `<span class="weekly-source-v1__authority">${escapeHtml(opts.badge)}</span>` : ''}
          ${settledSummary}
        </div>
        <div class="weekly-source-v1__table-scroll">
          <table class="weekly-source-v1__table">
            <thead>${SCHEDULE_HEAD_MARKUP[shape]}</thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </section>`;
  };

  const renderRightPaneStatus = (viewModel) => {
    const lifecycle = lifecycleOf(viewModel);
    if (!lifecycle || lifecycle.ok !== true || !lifecycle.right_pane_status) return '';
    return `<div class="weekly-source-v1__phase-status" data-weekly-source-right-pane-status="1">${escapeHtml(lifecycle.right_pane_status)}</div>`;
  };

  // The one primary schedule the phase names, under the heading the server
  // supplied, verbatim.  `heading_source` decides whether this owner renders a
  // heading at all.
  const renderPrimaryLifecycleBlock = (viewModel, options) => {
    const lifecycle = lifecycleOf(viewModel);
    if (!lifecycle || lifecycle.ok !== true) return renderLifecycleError(viewModel);
    const opts = isObject(options) ? options : {};
    const heading = lifecycle.heading_source === 'SERVER' ? lifecycle.heading : null;
    if (heading === null) {
      // LEGACY_OWNER, CONTEXT_PHASE or NONE: this owner supplies no heading and
      // must not build one.
      return '';
    }
    const scheduleKey = lifecycle.primary_schedule;
    const schedule = scheduleKey && isObject(lifecycle.schedules) ? lifecycle.schedules[scheduleKey] : null;
    if (!schedule) {
      // UI-022 is the live example: a real phase with a real heading and no
      // schedule approved for pay.
      return `
        <section class="weekly-source-v1__hours-card" aria-label="${escapeHtml(heading)}" data-weekly-source-primary="none" data-weekly-source-ui-state="${escapeHtml(lifecycle.ui_state || '')}">
          <div class="weekly-source-v1__card-heading"><h3>${escapeHtml(heading)}</h3></div>
          ${renderRightPaneStatus(viewModel)}
        </section>`;
    }
    if (schedule.row_shape === 'COMPONENT' && viewModel.authority === 'CLIENT_SYSTEM') {
      // The approved source shifts are clock-time rows from the final revision;
      // the frozen entitlement's category components belong in Finance.
      return `<div data-weekly-source-primary="${escapeHtml(scheduleKey)}" data-weekly-source-ui-state="${escapeHtml(lifecycle.ui_state || '')}" data-weekly-source-finalised-rows="1">
        ${renderFinalisedSourceRows(heading, viewModel.approved_rows)}
        ${renderRightPaneStatus(viewModel)}
      </div>`;
    }
    return `
      <div data-weekly-source-primary="${escapeHtml(scheduleKey)}" data-weekly-source-ui-state="${escapeHtml(lifecycle.ui_state || '')}">
        ${renderServerSchedule(schedule, heading, { badge: opts.badge, tone_class: opts.tone_class })}
        ${renderRightPaneStatus(viewModel)}
      </div>`;
  };

  // -------------------------------------------------------------------------
  // The two Office decisions.  A separate later-change surface: the complete
  // current approved entitlement beside the complete proposal, the changed
  // dates, the decision reason, and exactly two buttons whose labels come from
  // the server.  `Manage approved hours` is untouched and still offered
  // wherever the server permits it.
  // -------------------------------------------------------------------------

  const renderProposalChangeSummary = (change) => {
    if (!isObject(change)) return '';
    const changed = Array.isArray(change.changed) ? change.changed : [];
    if (!changed.length) {
      return `<p class="weekly-source-v1__change-empty">Added ${escapeHtml(String(change.added_count))} · removed ${escapeHtml(String(change.removed_count))} · unchanged ${escapeHtml(String(change.unchanged_count))}.</p>`;
    }
    return `
      <div class="weekly-source-v1__table-scroll">
        <table class="weekly-source-v1__table" aria-label="Changed dates">
          <thead><tr><th>Day and date</th><th>Currently approved</th><th>Proposed</th></tr></thead>
          <tbody>${changed.map((entry) => `
            <tr data-row-key="${escapeHtml(entry.component_id || entry.work_date || '')}">
              <td>${escapeHtml(entry.work_date || '—')}</td>
              <td>${escapeHtml(entry.currently_approved_total_hours || '—')}</td>
              <td>${escapeHtml(entry.proposed_total_hours || '—')}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  };

  const renderProposalDecisionReason = (proposal) => {
    const reason = isObject(proposal.decision_reason) ? proposal.decision_reason : null;
    if (!reason) return '';
    const sourceChange = isObject(reason.source_change) ? reason.source_change : null;
    const currentPosition = isObject(reason.current_position) ? reason.current_position : null;
    const parts = [];
    if (sourceChange && trim(sourceChange.reason)) parts.push(trim(sourceChange.reason));
    if (currentPosition && trim(currentPosition.committed_at_utc)) {
      parts.push(`Current position recorded ${trim(currentPosition.committed_at_utc)}.`);
    }
    if (!parts.length) return '';
    return `<div class="weekly-source-v1__notice is-ready" data-weekly-source-decision-reason="1"><strong>Why these hours differ</strong><span>${escapeHtml(parts.join(' '))}</span></div>`;
  };

  const renderCrossContractSummary = (proposal) => {
    const cross = isObject(proposal.cross_contract) ? proposal.cross_contract : null;
    if (!cross) return '';
    const atomic = trim(cross.atomic);
    return `
      <div class="weekly-source-v1__notice is-waiting" data-weekly-source-cross-contract="1">
        <strong>One decision covers both Contracts</strong>
        <span>${escapeHtml(atomic || 'Both roots are decided together; neither is published on its own.')}</span>
      </div>`;
  };

  const renderLaterChangeDecision = (viewModel, options) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    if (!vm.mount || vm.render_mode !== 'WEEKLY_SOURCE') return '';
    const lifecycle = lifecycleOf(vm);
    if (!lifecycle || lifecycle.ok !== true) return '';
    const proposal = isObject(vm.proposal) ? vm.proposal : null;
    if (!proposal || proposal.state === 'NONE') return '';
    const opts = isObject(options) ? options : {};
    const surface = upper(opts.surface) === 'BULK_AUTHORISE' ? 'BULK_AUTHORISE' : 'SIMPLE_TIMESHEET';

    // N3.9.6: the surface is built from `members[]`.  A single-root decision
    // has one member and an A-to-B decision has two; the shape is identical, so
    // the same renderer serves both and nothing needs reworking when the
    // two-root builder lands (WP-11b N6).  Members are NEVER summed.
    const members = Array.isArray(proposal.members) ? proposal.members : [];
    const effectiveMembers = members.length
      ? members
      : [{
          // A server that predates `members[]` still states one position.  That
          // is one member, not a different shape.
          root_ordinal: 1,
          is_requested_root: true,
          contract_id: null,
          authority_kind: proposal.currently_approved_authority_kind,
          proposed: proposal.proposed,
          proposed_component_count: proposal.proposed_component_count,
          proposed_certified_zero: proposal.proposed_certified_zero,
          currently_approved: proposal.currently_approved,
          currently_approved_authority: proposal.currently_approved_authority,
          currently_approved_head_id: proposal.currently_approved_head_id,
          currently_approved_component_count: proposal.currently_approved_component_count
        }];
    const crossContract = effectiveMembers.length > 1;

    // On a whole-entitlement A-to-B move the SAME `component_id` appears in the
    // old root's currently approved entitlement and in the new root's proposed
    // one. That is one line moving between Contracts, and it is shown as such:
    // never as a removal on one side and an unrelated addition on the other.
    const movedComponents = (() => {
      if (!crossContract) return [];
      const oldRoot = effectiveMembers.find((member) => member.root_ordinal === 1) || effectiveMembers[0];
      const newRoot = effectiveMembers.find((member) => member.root_ordinal === 2) || effectiveMembers[1];
      const oldRows = oldRoot && oldRoot.currently_approved && Array.isArray(oldRoot.currently_approved.rows)
        ? oldRoot.currently_approved.rows : [];
      const newRows = newRoot && newRoot.proposed && newRoot.proposed.available === true && Array.isArray(newRoot.proposed.rows)
        ? newRoot.proposed.rows : [];
      if (!oldRows.length || !newRows.length) return [];
      const newById = new Map();
      for (const row of newRows) if (row.component_id) newById.set(row.component_id, row);
      const moved = [];
      for (const row of oldRows) {
        if (!row.component_id || !newById.has(row.component_id)) continue;
        moved.push({ component_id: row.component_id, from: row, to: newById.get(row.component_id) });
      }
      return moved;
    })();

    const movedMarkup = movedComponents.length
      ? `
        <section class="weekly-source-v1__moved" aria-label="Lines that move between Contracts" data-weekly-source-moved-count="${escapeHtml(String(movedComponents.length))}">
          <h3>Lines that move</h3>
          <div class="weekly-source-v1__table-scroll">
            <table class="weekly-source-v1__table">
              <thead><tr><th>Day and date</th><th>Total hours</th><th>Moves</th></tr></thead>
              <tbody>${movedComponents.map((entry) => `
                <tr data-row-key="${escapeHtml(entry.component_id)}" data-weekly-source-moved-component="${escapeHtml(entry.component_id)}">
                  <td>${escapeHtml(entry.from.day_date || entry.to.day_date || '—')}</td>
                  <td>${escapeHtml(entry.from.total_hours || entry.to.total_hours || '—')}</td>
                  <td>Old Contract to new Contract</td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
        </section>`
      : '';

    const memberBlock = (member) => {
      const roleLabel = crossContract
        ? (member.root_ordinal === 1 ? 'Old root' : 'New root')
        : '';
      const contractCaption = member.contract_id
        ? `<p class="weekly-source-v1__member-contract" data-weekly-source-member-contract="${escapeHtml(member.contract_id)}">Contract ${escapeHtml(member.contract_id)}</p>`
        : '';
      return `
        <section class="weekly-source-v1__member" data-weekly-source-member="${escapeHtml(String(member.root_ordinal))}"${member.is_requested_root ? ' data-weekly-source-member-requested="1"' : ''}>
          ${roleLabel ? `<h4 class="weekly-source-v1__member-role">${escapeHtml(roleLabel)}</h4>` : ''}
          ${contractCaption}
          <div class="weekly-source-v1__later-change-grid">
            ${/* These two captions are structural labels for the side-by-side
                  comparison, deliberately NOT lifecycle headings: the phase
                  heading is rendered once, by the primary block, from the
                  server. Using a matrix heading here would be the browser
                  mapping a state to a heading, which rule N3.9.1 forbids. */''}
            ${renderServerSchedule(member.currently_approved, 'Hours in place now', {})}
            ${renderServerSchedule(member.proposed, 'Change awaiting approval', { tone_class: 'is-mismatch' })}
          </div>
          ${member.proposed_certified_zero === true ? '<div class="weekly-source-v1__notice is-waiting" data-weekly-source-certified-zero="1"><strong>The proposal is an explicit empty entitlement</strong><span>The client has stated there are no hours here. That is different from hours that are not known.</span></div>' : ''}
        </section>`;
    };

    // The proposed half may be unstatable while the decision itself is real.
    // Say so plainly, keep every position that IS statable, and offer nothing.
    // When the server refuses the proposed half it says WHY, in prose. That
    // detail is rendered verbatim: a blank panel here reads as a loading
    // failure and an Office user would retry something that is working exactly
    // as intended.
    //
    // The browser does not interpret the refusal, and in particular does not
    // parse the reason CODE for meaning. `PROPOSAL_CROSS_CONTRACT_MOVE_SET_NOT_RECOVERABLE`
    // is a historical name kept stable on purpose: today it means the accepted
    // decision cannot be reproduced from what is stored now, so it is STALE and
    // should be taken again. A partial Contract-to-Contract move is not the
    // cause and never can be — it is refused when the decision is composed, so
    // no accepted decision is ever one, and this surface has no partial-move
    // state to render (handoff N3.4b).
    const unstatable = proposal.state === 'UNAVAILABLE'
      ? `
        <div class="weekly-source-v1__notice is-mismatch" role="status" data-weekly-source-proposal-unavailable="${escapeHtml(proposal.reason || 'UNAVAILABLE')}">
          <strong>A decision is waiting on this week</strong>
          <span>The updated hours cannot be stated yet, so no decision can be offered here. The hours currently approved are shown below and are unchanged.</span>
          ${proposal.detail ? `<span class="weekly-source-v1__proposal-detail" data-weekly-source-proposal-detail="1">${escapeHtml(proposal.detail)}</span>` : ''}
        </div>`
      : '';

    // Rule N3.9.4, enforced here and nowhere else: the buttons come from
    // `proposal.decision` alone.  `permitted_actions` and the lifecycle matrix
    // are deliberately NOT consulted — `UI-013` lists both decisions as
    // permitted while the server correctly offers neither.
    const decision = proposal.decision;
    const buttons = decision
      ? decision.actions.map((action) => `<button type="button" class="btn ${action.action === 'APPROVE_UPDATED_HOURS' ? 'btn-primary' : 'btn-outline'}" data-weekly-source-decision="${escapeHtml(action.action)}" data-weekly-source-surface="${escapeHtml(surface)}">${escapeHtml(action.label)}</button>`).join('')
      : '';

    return `
      <section class="weekly-source-v1 weekly-source-v1__later-change" data-weekly-source-later-change="${escapeHtml(proposal.state)}" data-weekly-source-surface="${escapeHtml(surface)}" data-weekly-source-member-count="${escapeHtml(String(effectiveMembers.length))}" data-weekly-source-bundle-kind="${escapeHtml(proposal.bundle_kind || 'SINGLE_ROOT')}">
        ${renderCrossContractSummary(proposal)}
        ${unstatable}
        <div class="weekly-source-v1__members${crossContract ? ' is-cross-contract' : ''}">
          ${effectiveMembers.map(memberBlock).join('')}
        </div>
        ${movedMarkup}
        <section class="weekly-source-v1__change-set" aria-label="Changed dates">
          <h3>Changed dates</h3>
          ${renderProposalChangeSummary(proposal.change)}
        </section>
        ${renderProposalDecisionReason(proposal)}
        ${proposal.pending_state ? `<div class="weekly-source-v1__notice is-waiting" data-weekly-source-pending-state="${escapeHtml(proposal.pending_state)}"><strong>Decision saved</strong><span>This decision has been recorded and is waiting for the existing payment process to finish.</span></div>` : ''}
        ${buttons ? `<div class="weekly-source-v1__later-change-actions" data-weekly-source-decision-actions="1">${buttons}</div>` : ''}
      </section>`;
  };

  // Post `command_payload` unchanged, plus the actor and the chosen decision.
  const buildLaterChangeDecisionCommand = (viewModel, request) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    const req = isObject(request) ? request : {};
    const proposal = isObject(vm.proposal) ? vm.proposal : null;
    const decision = proposal ? proposal.decision : null;
    if (!vm.mount || vm.render_mode !== 'WEEKLY_SOURCE' || !decision) {
      throw new Error('That decision is no longer available. Refresh the Timesheet and try again.');
    }
    const action = upper(req.decision || req.action);
    if (!DECISION_ACTION_TOKENS.has(action) || !decision.actions.some((entry) => entry.action === action)) {
      throw new Error('That decision is no longer available. Refresh the Timesheet and try again.');
    }
    const actor = trim(req.actor_user_id);
    if (!actor) throw new Error('This change could not be safely prepared. Please try again.');
    const body = { ...decision.command_payload, actor_user_id: actor, decision: action };
    const idempotencyKey = trim(req.idempotency_key);
    if (idempotencyKey) body.idempotency_key = idempotencyKey;
    return deepFreeze({ endpoint: decision.endpoint, body });
  };

  // -------------------------------------------------------------------------
  // The withdrawal surface.  The control is the EXISTING `Unauthorise` action;
  // this owner adds no screen, dialog or reason prompt.  Availability is the
  // server's and only the server's; the copy is 04_MODAL_POLICY.json's.
  // -------------------------------------------------------------------------

  const withdrawalRefusalText = (unauthorise) => {
    if (!isObject(unauthorise) || unauthorise.answered !== true) return '';
    if (unauthorise.allowed === true) return '';
    // When the server states its own plain-English message, that message wins.
    if (unauthorise.refusal_message) return unauthorise.refusal_message;
    if (unauthorise.refusal_code === WITHDRAWAL_BANKING_ACTIVE_CODE) return WITHDRAWAL_REFUSAL_COPY.BANKING_ACTIVE;
    if (unauthorise.refusal_nature === 'PERMANENT') return WITHDRAWAL_REFUSAL_COPY.PERMANENT;
    if (unauthorise.refusal_nature === 'TEMPORARY') return WITHDRAWAL_REFUSAL_COPY.WAITING;
    if (unauthorise.refusal_nature === 'INTEGRITY') return WITHDRAWAL_INTEGRITY_COPY;
    return '';
  };

  const renderWithdrawalState = (viewModel) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    if (!vm.mount || vm.render_mode !== 'WEEKLY_SOURCE') return '';
    const lifecycle = lifecycleOf(vm);
    if (!lifecycle || lifecycle.ok !== true) return '';
    const unauthorise = isObject(vm.unauthorise) ? vm.unauthorise : null;
    // A refusal is only worth explaining where the control would otherwise be
    // offered.  On a week that is withdrawn or was never authorised the
    // ordinary `Unauthorise` control is not on screen at all, so explaining why
    // the server refuses it would be noise — and, worse, would read as though
    // something had been attempted.
    const explainRefusal = !!(unauthorise && unauthorise.authorisation_state === 'AUTHORISED');
    const refusal = explainRefusal ? withdrawalRefusalText(unauthorise) : '';
    const permanent = !!(unauthorise && unauthorise.permanent === true);
    // The heading itself is already rendered by the primary block, verbatim
    // from the server (UI-022).  This block adds only the refusal explanation
    // and the withdrawn-state note.
    const withdrawnNote = lifecycle.withdrawn === true
      ? `<div class="weekly-source-v1__notice is-waiting" role="status" data-weekly-source-withdrawn="1"><strong>${escapeHtml(WITHDRAWAL_RESULT_COPY)}</strong></div>`
      : '';
    const refusalNote = refusal
      ? `<div class="weekly-source-v1__notice ${permanent ? 'is-mismatch' : 'is-waiting'}" role="status" data-weekly-source-unauthorise-refusal="${escapeHtml(unauthorise.refusal_code || 'UNKNOWN')}" data-weekly-source-unauthorise-permanent="${permanent ? '1' : '0'}"><strong>Unauthorise is not available</strong><span>${escapeHtml(refusal)}</span></div>`
      : '';
    if (!withdrawnNote && !refusalNote) return '';
    return `<div class="weekly-source-v1 weekly-source-v1__withdrawal">${withdrawnNote}${refusalNote}</div>`;
  };

  // -------------------------------------------------------------------------
  // Invoice movement history: its own region, never inside an hours table
  // (24 section 15, N3.9.5).
  // -------------------------------------------------------------------------

  const renderInvoiceMovementHistory = (viewModel) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    if (!vm.mount || vm.render_mode !== 'WEEKLY_SOURCE') return '';
    const history = isObject(vm.invoice_movements) ? vm.invoice_movements : null;
    if (!history) return '';
    if (history.ok !== true) {
      return `
        <section class="weekly-source-v1 weekly-source-v1__movements" aria-label="Invoice movements" data-weekly-source-invoice-movements="unavailable">
          <h3>Invoice movements</h3>
          <div class="weekly-source-v1__notice is-waiting"><strong>Not available</strong><span>Whether this week has been included on an invoice is not known right now.</span></div>
        </section>`;
    }
    if (history.movement_count === 0 && history.movements.length === 0) {
      return `
        <section class="weekly-source-v1 weekly-source-v1__movements" aria-label="Invoice movements" data-weekly-source-invoice-movements="0">
          <h3>Invoice movements</h3>
          <p class="weekly-source-v1__empty">No source movement has been placed on an invoice.</p>
        </section>`;
    }
    return `
      <section class="weekly-source-v1 weekly-source-v1__movements" aria-label="Invoice movements" data-weekly-source-invoice-movements="${escapeHtml(String(history.movement_count))}">
        <h3>Invoice movements</h3>
        ${history.invoiced_from_source === true ? '<p class="weekly-source-v1__movements-state" data-weekly-source-invoiced-from-source="1">This week has been invoiced from source.</p>' : ''}
        <div class="weekly-source-v1__table-scroll">
          <table class="weekly-source-v1__table" aria-label="Invoice movement history">
            <thead><tr><th>Placed</th><th>Role</th><th>Invoice</th><th>State</th></tr></thead>
            <tbody>${history.movements.map((movement) => `
              <tr data-row-key="${escapeHtml(movement.billing_movement_id)}">
                <td>${escapeHtml(movement.created_at_utc || '—')}</td>
                <td>${escapeHtml(movement.movement_role || '—')}</td>
                <td>${escapeHtml((movement.binding && trim(movement.binding.invoice_id)) || '—')}</td>
                <td>${escapeHtml(movement.placement_state || movement.invoice_status || '—')}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
      </section>`;
  };

  // -------------------------------------------------------------------------
  // The responsive Bulk shell.  On phone and folding phone the three desktop
  // panes become three steps; on tablet the same three steps run with the queue
  // collapsed.  Desktop is unchanged.
  // -------------------------------------------------------------------------

  const normaliseBulkStep = (value) => {
    const step = upper(value);
    return BULK_WORKSPACE_STEP_KEYS.has(step) ? step : 'REVIEW';
  };

  const bulkStepForWidth = (width, requestedStep) => {
    const numeric = Number(width);
    const layout = !Number.isFinite(numeric) || numeric >= BULK_BREAKPOINTS.desktop
      ? 'DESKTOP'
      : (numeric >= BULK_BREAKPOINTS.tablet ? 'TABLET' : (numeric >= BULK_BREAKPOINTS.phone ? 'PHONE' : 'FOLD'));
    return {
      layout,
      stepped: layout !== 'DESKTOP',
      step: normaliseBulkStep(requestedStep),
      queue_collapsed: layout === 'TABLET'
    };
  };

  const renderBulkWorkspaceSteps = (activeStep, options) => {
    const opts = isObject(options) ? options : {};
    const active = normaliseBulkStep(activeStep);
    const counts = isObject(opts.counts) ? opts.counts : {};
    return `
      <nav class="weekly-source-v1 weekly-source-v1__workspace-steps" role="tablist" aria-label="Bulk Authorise workspace" data-weekly-source-workspace-steps="1">
        ${BULK_WORKSPACE_STEPS.map((step) => {
          const selected = step.key === active;
          const count = Number(counts[step.key]);
          return `<button type="button" role="tab" class="weekly-source-v1__workspace-step${selected ? ' is-active' : ''}" data-weekly-source-workspace-step="${escapeHtml(step.key)}" aria-selected="${selected ? 'true' : 'false'}">${escapeHtml(step.label)}${Number.isInteger(count) && count >= 0 ? ` <span>${escapeHtml(String(count))}</span>` : ''}</button>`;
        }).join('')}
      </nav>`;
  };

  const renderBulkStickyAction = (activeStep, options) => {
    const opts = isObject(options) ? options : {};
    const active = normaliseBulkStep(activeStep);
    if (active === 'AUTHORISE') return '';
    const target = active === 'QUEUE' ? 'REVIEW' : 'AUTHORISE';
    const label = target === 'REVIEW' ? 'Continue to Review' : 'Continue to Authorise';
    return `
      <div class="weekly-source-v1 weekly-source-v1__workspace-sticky" data-weekly-source-workspace-sticky="1">
        <button type="button" class="btn btn-primary" data-weekly-source-workspace-step="${escapeHtml(target)}"${opts.disabled === true ? ' disabled' : ''}>${escapeHtml(label)}</button>
      </div>`;
  };

  // The real Bulk shell keeps its three panes in the DOM; the step model only
  // decides which one is presented, so keyboard order and the existing
  // Queue/Attached, Previous/Next, Upload, Attach, thumbnail, removal and
  // return controls are never removed or duplicated.
  const applyBulkWorkspaceStep = (container, step, options) => {
    if (!container || typeof container.querySelectorAll !== 'function') return null;
    const opts = isObject(options) ? options : {};
    const width = Number.isFinite(Number(opts.width))
      ? Number(opts.width)
      : (typeof window === 'object' && window && window.innerWidth ? window.innerWidth : BULK_BREAKPOINTS.desktop);
    const model = bulkStepForWidth(width, step);
    try {
      container.setAttribute('data-weekly-source-bulk-layout', model.layout);
      container.setAttribute('data-weekly-source-bulk-step', model.stepped ? model.step : 'DESKTOP');
    } catch {}
    const panes = Array.from(container.querySelectorAll('[data-weekly-source-workspace-pane]'));
    for (const pane of panes) {
      const paneKey = normaliseBulkStep(pane.getAttribute('data-weekly-source-workspace-pane'));
      const presented = !model.stepped || paneKey === model.step;
      try {
        pane.setAttribute('data-weekly-source-pane-presented', presented ? '1' : '0');
        pane.hidden = !presented;
      } catch {}
    }
    const tabs = Array.from(container.querySelectorAll('[data-weekly-source-workspace-step]'));
    for (const tab of tabs) {
      if (tab.getAttribute('role') !== 'tab') continue;
      const tabKey = normaliseBulkStep(tab.getAttribute('data-weekly-source-workspace-step'));
      try {
        tab.setAttribute('aria-selected', tabKey === model.step ? 'true' : 'false');
        tab.classList.toggle('is-active', tabKey === model.step);
      } catch {}
    }
    return model;
  };

  const renderSimpleLines = (viewModel) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    if (vm.render_mode === 'UNAVAILABLE') return renderUnavailable(vm);
    if (!vm.mount) return '';

    // Gate 10.  `ok:false` is an explicit error state: no heading, no schedule
    // and no action (N3.9.3).
    if (vm.lifecycle_ok !== true) return renderLifecycleError(vm);

    const principalRows = vm.approved_rows.length > 0
      ? vm.approved_rows
      : (vm.authority === 'SIGNED_TIMESHEET' ? vm.submitted_rows : vm.source_rows);
    const protectedHoursPresent = principalRows.some((row) => row.state === 'PROTECTED');
    const principalBadge = vm.authority === 'SIGNED_TIMESHEET' ? 'Used for pay and invoice' : 'Approved hours';
    let supportingMarkup = '';

    if (vm.authority === 'CLIENT_SYSTEM') {
      if (vm.comparison_state === 'NO_TIMESHEET') {
        supportingMarkup = '<div class="weekly-source-v1__notice is-waiting"><strong>No submitted Timesheet available</strong><span>No candidate-submitted hours are available for comparison.</span></div>';
      } else if (vm.comparison_state === 'MISMATCH') {
        supportingMarkup = renderHoursTable(
          'Submitted hours needing attention',
          vm.submitted_rows.filter((row) => row.affected === true),
          { tone_class: 'is-mismatch', badge: 'Evidence' }
        );
      }
    } else if (vm.comparison_state === 'MISMATCH') {
      supportingMarkup = renderHoursTable(
        'Client system checks needing attention',
        vm.source_rows.filter((row) => row.affected === true || row.state === 'MISMATCH'),
        { tone_class: 'is-mismatch', badge: 'Check only' }
      );
    } else if (vm.comparison_state === 'WAITING_FOR_COMPLETE_TIMESHEET') {
      supportingMarkup = '<div class="weekly-source-v1__notice is-waiting"><strong>Waiting for completed Timesheet</strong><span>The Timesheet can be checked after the worker and manager have signed it.</span></div>';
    }

    const protectedMarkup = protectedHoursPresent
      ? '<div class="weekly-source-v1__notice is-waiting"><strong>Office-approved hours included</strong><span>The approved schedule below shows the hours that will be authorised.</span></div>'
      : '';

    return `
      <div class="weekly-source-v1 weekly-source-v1__simple-lines" data-weekly-source-simple-lines="1" data-weekly-source-ui-state="${escapeHtml(vm.ui_state || '')}" data-weekly-source-server-phase="${escapeHtml(vm.server_phase || '')}">
        ${protectedMarkup}
        ${renderPrimaryLifecycleBlock(vm, { badge: principalBadge })}
        ${renderWithdrawalState(vm)}
        ${renderLaterChangeDecision(vm, { surface: 'SIMPLE_TIMESHEET' })}
        ${supportingMarkup}
        ${renderSourceExpenseContext(vm)}
        ${renderFourTotals(vm)}
        ${renderManageApprovedHoursButton(vm)}
        ${vm.blocks_authorisation ? `<div class="weekly-source-v1__notice is-mismatch" role="status"><strong>Not ready to authorise</strong><span>${escapeHtml(vm.blocked_reason)}</span></div>` : ''}
      </div>`;
  };

  // The Bulk Authorise right pane.  Same rule: the heading, the schedule and
  // the status are the server's, and the decisions appear only where the
  // server offers them.
  const renderApprovedHours = (viewModel) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    if (vm.render_mode === 'UNAVAILABLE') return renderUnavailable(vm);
    if (!vm.mount) return '';
    if (vm.lifecycle_ok !== true) return renderLifecycleError(vm);
    return `<div class="weekly-source-v1" data-weekly-source-right-pane="1" data-weekly-source-ui-state="${escapeHtml(vm.ui_state || '')}" data-weekly-source-server-phase="${escapeHtml(vm.server_phase || '')}">${renderPrimaryLifecycleBlock(vm, {})}${renderWithdrawalState(vm)}${renderLaterChangeDecision(vm, { surface: 'BULK_AUTHORISE' })}${renderSourceExpenseContext(vm)}</div>`;
  };

  const renderSourceExpenseContext = (viewModel) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    if (!vm.mount || vm.expense_owner !== 'SOURCE_SUPPLIED') return '';
    return '<div class="weekly-source-v1__notice is-ready" role="status" data-weekly-source-expense="source-supplied"><strong>Client-provided expense</strong><span>This Timesheet uses the expense supplied by the client. Receipt and mileage evidence cannot be added here.</span></div>';
  };

  const renderFourTotals = (viewModel) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    if (!vm.mount) return '';
    if (!vm.totals) {
      return '<div class="weekly-source-v1 weekly-source-v1__notice is-mismatch" role="status"><strong>Totals are unavailable</strong><span>Refresh this Timesheet before continuing.</span></div>';
    }
    const items = [
      ['Gross Total Charge (including expenses) excluding VAT', vm.totals.charge_excluding_vat],
      ['Gross Total Charge (including expenses) including VAT', vm.totals.charge_including_vat],
      ['Gross Pay to Candidate (including expenses) excluding VAT', vm.totals.pay_excluding_vat],
      ['Gross Pay to Candidate (including expenses) including VAT', vm.totals.pay_including_vat]
    ];
    return `
      <dl class="weekly-source-v1 weekly-source-v1__totals" aria-label="Timesheet totals">
        ${items.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
      </dl>`;
  };

  const renderManageApprovedHoursButton = (viewModel, options) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    if (!vm.mount || vm.render_mode !== 'WEEKLY_SOURCE' || vm.manage_approved_hours_allowed !== true || !vm.manage_approved_hours) return '';
    const opts = isObject(options) ? options : {};
    const surface = upper(opts.surface) === 'BULK_AUTHORISE' ? 'BULK_AUTHORISE' : 'SIMPLE_TIMESHEET';
    return `
      <div class="weekly-source-v1 weekly-source-v1__approved-hours-action">
        <button type="button" class="btn btn-outline" data-weekly-source-manage-approved-hours="1" data-weekly-source-surface="${escapeHtml(surface)}">Manage approved hours</button>
      </div>`;
  };

  const renderApprovedHoursScheduleFields = (schedule, itemId, disabled) => {
    const value = normaliseApprovedHoursSchedule(schedule);
    const disabledAttribute = disabled ? ' disabled' : '';
    const prefix = escapeHtml(itemId);
    return `
      <div class="weekly-source-v1__approved-hours-fields" data-weekly-source-schedule="${prefix}">
        <label><span>Date</span><input class="input" type="date" data-weekly-source-schedule-field="work_date" value="${escapeHtml(value.work_date)}"${disabledAttribute}></label>
        <label><span>Start</span><input class="input" type="time" data-weekly-source-schedule-field="start_at_local" value="${escapeHtml(value.start_at_local)}"${disabledAttribute}></label>
        <label><span>Finish</span><input class="input" type="time" data-weekly-source-schedule-field="end_at_local" value="${escapeHtml(value.end_at_local)}"${disabledAttribute}></label>
        <label><span>Break (minutes)</span><input class="input" type="number" min="0" step="1" inputmode="numeric" data-weekly-source-schedule-field="break_minutes" value="${value.break_minutes === null ? '' : escapeHtml(String(value.break_minutes))}"${disabledAttribute}></label>
      </div>`;
  };

  const renderApprovedHoursActionOptions = (actions, selectedAction) => {
    const list = Array.isArray(actions) ? actions : [];
    return list.map((action) => `<option value="${escapeHtml(action)}"${action === selectedAction ? ' selected' : ''}>${escapeHtml(APPROVED_HOURS_ACTION_LABELS[action] || 'Continue')}</option>`).join('');
  };

  const approvedHoursActionAllowsSchedule = (action) => APPROVED_HOURS_EDITABLE_SCHEDULE_ACTIONS.has(upper(action));

  const renderManageApprovedHoursDialog = (viewModel) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    const manage = vm.manage_approved_hours;
    if (!vm.mount || vm.manage_approved_hours_allowed !== true || !isObject(manage)) return renderUnavailable(vm);
    const sections = [];
    if (manage.new_item && manage.new_item.allowed === true && manage.new_item.action === 'APPROVE_PROTECTED_HOURS') {
      const newSchedule = normaliseApprovedHoursSchedule(manage.new_item.command_payload);
      sections.push(`
        <section class="weekly-source-v1__approved-hours-card" data-weekly-source-manage-item="__new__" data-weekly-source-new-item="1">
          <h3>Add approved hours</h3>
          ${renderApprovedHoursScheduleFields(newSchedule, '__new__', false)}
          <label class="weekly-source-v1__reason"><span>Reason</span><textarea class="input" rows="2" maxlength="1000" data-weekly-source-reason placeholder="Add a short reason"></textarea></label>
          <div class="weekly-source-v1__approved-hours-submit"><button type="button" class="btn btn-primary" data-weekly-source-submit-action="APPROVE_PROTECTED_HOURS">Add approved hours</button></div>
        </section>`);
    }
    for (const item of manage.items) {
      if (!item.available_actions.length) continue;
      const selectedAction = item.primary_action || item.available_actions[0];
      const scheduleEditable = APPROVED_HOURS_EDITABLE_SCHEDULE_ACTIONS.has(selectedAction);
      sections.push(`
        <section class="weekly-source-v1__approved-hours-card" data-weekly-source-manage-item="${escapeHtml(item.item_id)}">
          <h3>${escapeHtml(item.schedule.work_date)}</h3>
          ${renderApprovedHoursScheduleFields(item.schedule, item.item_id, !scheduleEditable)}
          <label class="weekly-source-v1__reason"><span>Reason</span><textarea class="input" rows="2" maxlength="1000" data-weekly-source-reason placeholder="Add a short reason"></textarea></label>
          <div class="weekly-source-v1__approved-hours-choice">
            <label><span>What would you like to do?</span><select class="input" data-weekly-source-action-select>${renderApprovedHoursActionOptions(item.available_actions, selectedAction)}</select></label>
            <button type="button" class="btn btn-primary" data-weekly-source-submit-selected>Continue</button>
          </div>
        </section>`);
    }
    return `
      <div class="weekly-source-v1 weekly-source-v1__approved-hours-dialog" data-weekly-source-manage-dialog="1">
        <div class="weekly-source-v1__notice" role="status"><strong>Approved hours</strong><span>Choose the hours the worker should be paid while the client record is being resolved.</span></div>
        <div data-weekly-source-command-status aria-live="polite"></div>
        ${sections.length ? sections.join('') : '<div class="weekly-source-v1__notice"><strong>No changes available</strong><span>Close this window and refresh the Timesheet.</span></div>'}
      </div>`;
  };

  const buildApprovedHoursCommand = (viewModel, request) => {
    const vm = isObject(viewModel) ? viewModel : unavailableViewModel();
    const manage = vm.manage_approved_hours;
    const req = isObject(request) ? request : {};
    if (!vm.mount || vm.manage_approved_hours_allowed !== true || !isObject(manage)) {
      throw new Error('Approved hours cannot be changed for this Timesheet.');
    }
    const itemId = trim(req.item_id);
    const requestedAction = upper(req.action);
    const isNew = itemId === '__new__';
    const target = isNew ? manage.new_item : manage.items.find((item) => item.item_id === itemId);
    const availableActions = isNew
      ? (target && target.allowed === true && target.action ? [target.action] : [])
      : (target ? target.available_actions : []);
    if (!target || !APPROVED_HOURS_ACTION_SET.has(requestedAction) || !availableActions.includes(requestedAction)) {
      throw new Error('That choice is no longer available. Refresh the Timesheet and try again.');
    }

    const allowedKeys = new Set(APPROVED_HOURS_ACTION_PAYLOAD_KEYS[requestedAction] || []);
    const payload = {};
    for (const [key, value] of Object.entries(target.command_payload || {})) {
      if (allowedKeys.has(key)) payload[key] = value;
    }
    const edits = isObject(req.edits) ? req.edits : {};
    if (APPROVED_HOURS_EDITABLE_SCHEDULE_ACTIONS.has(requestedAction)) {
      const schedule = normaliseApprovedHoursSchedule(edits);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.work_date) || !/^\d{2}:\d{2}$/.test(schedule.start_at_local) || !/^\d{2}:\d{2}$/.test(schedule.end_at_local) || schedule.break_minutes === null) {
        throw new Error('Enter a valid date, start, finish and break.');
      }
      payload.work_date = schedule.work_date;
      payload.start_at_local = schedule.start_at_local;
      payload.end_at_local = schedule.end_at_local;
      payload.break_minutes = schedule.break_minutes;
    }
    const reason = trim(edits.reason);
    const idempotencyKey = trim(req.idempotency_key);
    if (!reason) throw new Error('Add a short reason before continuing.');
    if (!idempotencyKey) throw new Error('This change could not be safely prepared. Please try again.');
    payload.reason = reason;
    payload.idempotency_key = idempotencyKey;
    payload.expected_record_version = manage.expected_record_version;

    const requiredIdentityKeys = ['APPROVE_PROTECTED_HOURS', 'AMEND_PROTECTED_HOURS'].includes(requestedAction)
      ? ['source_cycle_id', 'candidate_id', 'client_id', 'contract_id', 'week_ending_date']
      : ['family_id', 'work_event_id'];
    if (requiredIdentityKeys.some((key) => !trim(payload[key]))) {
      throw new Error('This Timesheet must be refreshed before that change can be made.');
    }
    const orderedPayload = {};
    for (const key of APPROVED_HOURS_ACTION_PAYLOAD_KEYS[requestedAction]) {
      if (own(payload, key)) orderedPayload[key] = payload[key];
    }
    return deepFreeze({
      endpoint: COMMAND_ENDPOINT,
      body: {
        action: requestedAction,
        payload: orderedPayload
      }
    });
  };

  const renderSelectionHeaderCheckbox = (options) => {
    const opts = isObject(options) ? options : {};
    const checked = opts.checked === true;
    const indeterminate = opts.indeterminate === true && !checked;
    const disabled = opts.disabled === true;
    const selectLabel = trim(opts.select_label) || 'Select all rows';
    const clearLabel = trim(opts.clear_label) || 'Clear all rows';
    const ariaLabel = checked ? clearLabel : selectLabel;
    const state = indeterminate ? 'mixed' : (checked ? 'true' : 'false');
    return `
      <th class="weekly-source-v1__select-column" scope="col">
        <input type="checkbox" data-weekly-source-header-checkbox="1" data-indeterminate="${indeterminate ? '1' : '0'}" aria-label="${escapeHtml(ariaLabel)}" aria-checked="${state}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
      </th>`;
  };

  const applySelectionHeaderState = (container) => {
    if (!container || typeof container.querySelectorAll !== 'function') return 0;
    const boxes = Array.from(container.querySelectorAll('[data-weekly-source-header-checkbox="1"]'));
    for (const box of boxes) {
      try { box.indeterminate = box.getAttribute('data-indeterminate') === '1'; } catch {}
    }
    return boxes.length;
  };

  const renderLegacyOrWeekly = (hostPayload, renderLegacy, renderWeekly) => {
    const vm = buildViewModel(hostPayload);
    if (!vm.mount) {
      if (typeof renderLegacy !== 'function') return '';
      return renderLegacy(hostPayload);
    }
    if (typeof renderWeekly === 'function') return renderWeekly(vm);
    return vm.render_mode === 'UNAVAILABLE' ? renderUnavailable(vm) : '';
  };

  // An executed guard, not a comment: any markup this owner produces is checked
  // against the heading 25 section 10 deletes.  Tests call it on every rendered
  // state, so a reintroduction fails a test rather than shipping.
  const containsDeletedHeading = (markup) => String(markup == null ? '' : markup).includes(DELETED_HEADING);

  return deepFreeze({
    CONTRACT,
    PRESENTATION_KEY,
    COMMAND_ENDPOINT,
    APPROVED_HOURS_ACTIONS,
    CATEGORIES,
    ROUTES,
    LIFECYCLE_CONTRACT,
    LIFECYCLE_POLICY_CONTRACT,
    SCHEDULE_KEYS,
    BULK_WORKSPACE_STEPS,
    BULK_BREAKPOINTS,
    WITHDRAWAL_REFUSAL_COPY,
    WITHDRAWAL_RESULT_COPY,
    containsDeletedHeading,
    normaliseLifecyclePolicy,
    renderPrimaryLifecycleBlock,
    renderServerSchedule,
    renderLifecycleError,
    renderLaterChangeDecision,
    buildLaterChangeDecisionCommand,
    withdrawalRefusalText,
    renderWithdrawalState,
    renderInvoiceMovementHistory,
    renderBulkWorkspaceSteps,
    renderBulkStickyAction,
    applyBulkWorkspaceStep,
    bulkStepForWidth,
    escapeHtml,
    normaliseCategoryKey,
    backendClassificationForCategory,
    findHostPayload,
    buildViewModel,
    buildViewModelFromPresentation,
    renderLegacyOrWeekly,
    renderCategoryTabs,
    renderMiddlePaneTabs,
    renderBulkHoursPane,
    renderSimpleComparison,
    renderSimpleLines,
    renderApprovedHours,
    renderSourceExpenseContext,
    renderFourTotals,
    renderManageApprovedHoursButton,
    renderManageApprovedHoursDialog,
    approvedHoursActionAllowsSchedule,
    buildApprovedHoursCommand,
    renderSelectionHeaderCheckbox,
    applySelectionHeaderState,
    renderUnavailable
  });
});
