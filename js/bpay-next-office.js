/* Thin NEXT Office caller. Policy X: no calculator, old Workbench, drain,
 * provider or current-fact substitution after Draft. Money remains text.
 * A dispatched mutation is journalled before network; unknown outcomes allow
 * only an explicit SAME-byte retry. Closing the sheet never clears it.
 */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./bpay-next-dates.js') : root.CloudTMSBpayNextDates, typeof module === 'object' && module.exports ? require('./bpay-next-ui.js') : root.CloudTMSBpayNextUi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CloudTMSBpayNextOffice = api;
})(typeof globalThis === 'object' ? globalThis : this, function (dates, ui) {
  'use strict';
  const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const INT = /^(?:0|[1-9]\d{0,18})$/;
  const MONEY = /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,6})?$/;
  const encoder = new TextEncoder();
  const LIMITS = Object.freeze({ page: 100, bytes: 128 * 1024, journalBytes: 65536, timeout: 12000 });
  const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
  const integer = v => typeof v === 'string' && INT.test(v) && BigInt(v) <= 9223372036854775807n;
  const positive = v => integer(v) && v !== '0';
  const isZero = v => typeof v === 'string' && /^0(?:\.0+)?$/.test(v);
  const RUN = ['PREPARING', 'REVIEW', 'DRAFT', 'CANCELLING', 'CANCELLED', 'EXECUTING', 'COMPLETE'];
  const WORKER = ['PREPARING', 'REVIEW', 'READY', 'DRAFT', 'CANCELLING', 'CANCELLED', 'ISSUED', 'COMPLETE'];
  const TRANSFER = ['BUILDING', 'MEMBERS_READY', 'DRAFT', 'SCHEDULED', 'ISSUED_CSV', 'SUBMITTED', 'UNKNOWN', 'SETTLED', 'RETURNED', 'REFUSED', 'CANCELLED', 'INTERNAL_PROCESSING', 'INTERNAL_SETTLED'];
  // CONFIRM freezes the parent Draft; its prepared worker remains READY.
  function draftActionsAllowed(h) { return h.run_status === 'DRAFT' && ['READY', 'DRAFT'].includes(h.worker_status); }
  const INPUT = {
    CREATE: { run_id: 'uuid', pay_date: 'date' },
    WORK_PAGE: { run_id: 'uuid', page_no: 'positive', choices: 'choices' },
    COMPONENT_PAGE: {run_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',page_no:'positive',approved_line_ids:'ids'},
    COMPONENT_SEAL: {run_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',expected_pages:'positive',expected_count:'positive'},
    CASE_PAGE: { run_id: 'uuid', candidate_id: 'uuid', selection_revision: 'positive', page_no: 'positive', request_id: 'uuid', component_ids: 'ids', selected: 'booleans' },
    CASE_SEAL: { run_id: 'uuid', candidate_id: 'uuid', selection_revision: 'positive', expected_pages: 'positive', expected_items: 'positive' },
    SEAL_ENQUEUE: { run_id: 'uuid', command_id: 'uuid', expected_pages: 'integer', expected_count: 'integer' },
    REVIEW: { run_id: 'uuid' }, CONFIRM: { run_id: 'uuid', review_revision: 'positive' },
    PAYE_NET: { command_id: 'uuid', run_worker_id: 'uuid', entered_paye_net: 'cash' },
    TRANSFER_BEGIN: { command_id: 'uuid', run_worker_id: 'uuid' },
    CANCEL_REQUEST: { command_id: 'uuid', run_worker_id: 'uuid' },
    CSV_ISSUE: { instruction_id: 'uuid', transfer_id: 'uuid' }
  };
  const RECEIPT = {
    CREATE: { run_id: 'uuid', status: 'run', selection_state: 'selection', selection_count: 'integer', selected_candidate_count: 'integer', official_pay_date: 'date' },
    WORK_PAGE: { run_id: 'uuid', page_no: 'positive', item_count: 'positive', selection_count: 'integer', selected_candidate_count: 'integer', replay: 'boolean', skipped: 'skipped' },
    COMPONENT_PAGE: {run_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',page_no:'positive',item_count:'positive',component_count:'positive',replay:'boolean'},
    COMPONENT_SEAL: {run_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',sealed:'true',component_count:'positive',replay:'boolean'},
    CASE_PAGE: { run_id: 'uuid', candidate_id: 'uuid', selection_revision: 'positive', page_no: 'positive', item_count: 'positive', replay: 'boolean' },
    CASE_SEAL: { run_id: 'uuid', candidate_id: 'uuid', selection_revision: 'positive', sealed: 'true', selected_count: 'integer', excluded_count: 'integer', replay: 'boolean' },
    SEAL_ENQUEUE: { run_id: 'uuid', command_id: 'uuid', agency_sequence: 'positive', replay: 'boolean' },
    REVIEW: { run_id: 'uuid', phase: 'review', reason: 'reviewReason?', review_revision: 'integer', all_ready: 'boolean?', replay: 'boolean' },
    CONFIRM: { run_id: 'uuid', phase: 'draft', review_revision: 'positive', replay: 'boolean', drafts: 'drafts' },
    PAYE_NET: { command_id: 'uuid', run_worker_id: 'uuid', sequence: 'positive', request_no: 'positive', phase: 'net', replay: 'boolean' },
    TRANSFER_BEGIN: { command_id: 'uuid', run_worker_id: 'uuid', sequence: 'positive', transfer_id: 'uuid', phase: 'transfer', replay: 'boolean' },
    CANCEL_REQUEST: { command_id: 'uuid', run_worker_id: 'uuid', sequence: 'positive', phase: 'cancel', cursor: 'positive?', released_line_count: 'integer', blocked_code: 'code?', replay: 'boolean' },
    CSV_ISSUE: { instruction_id: 'uuid', transfer_id: 'uuid', file_name: 'file', csv_sha256: 'sha', csv_text: 'csv', phase: 'csv', payment_recorded: 'boolean', replay: 'boolean' }
  };
  const ROWS = {
    WORK_CHOICES:{work_id:'uuid',expected_revision_id:'uuid?',selection_mode:'mode',selection_state:'selection',page_count:'integer',component_count:'integer'},
    SELECTED_COMPONENTS:{selection_no:'positive',approved_line_id:'uuid',expected_revision_id:'uuid',component_key:'key'},
    ACCEPTED_CANDIDATES:{candidate_id:'uuid',accepted_input_id:'uuid',module_epoch:'positive',target_pay_channel:'channel',target_umbrella_id:'uuid?',pay_week_start:'date',case_scope:'acceptedCaseScope',case_selection_revision:'positive?',settings_witness_kind:'settingsWitness',input_evidence_sha256:'sha',prepare_job_id:'uuid?',prepare_job_status:'prepareJobStatus?',prepare_job_phase:'prepareJobPhase?',run_worker_id:'uuid?',worker_status:'worker?',has_unsealed_work:'boolean',waiting_command_id:'uuid?',waiting_command_sequence:'positive?',progress_state:'acceptedProgress',progress_code:'acceptedProgressCode?',review_issue_code:'issue?'},
    ACCEPTED_WORK:{candidate_id:'uuid',accepted_input_id:'uuid',accepted_work_input_id:'uuid',work_id:'uuid',original_revision_id:'uuid',effective_revision_id:'uuid',selection_mode:'mode',selected_line_count:'integer',publication_command_id:'uuid',predecessor_sequence:'positive',source_kind:'acceptedSourceKind',query_disposition:'acceptedQuery?',query_state_sha256:'sha?',input_evidence_sha256:'sha',effective_cut_id:'uuid?',cut_state:'acceptedCutState'},
    CURRENT_CASES: { case_id: 'uuid', candidate_id: 'uuid', case_kind: 'caseKind', tax_treatment: 'tax', status: 'caseStatus', principal_approved: 'money', principal_funded: 'money', principal_recovered: 'money', principal_written_off: 'money', active_hold_amount: 'money' },
    CASE_COMPONENTS: { case_component_id: 'uuid', case_id: 'uuid', candidate_id: 'uuid', component_ordinal: 'positive', component_revision: 'positive', case_kind: 'caseKind', case_subtype: 'caseSubtype', tax_treatment: 'tax', instruction_kind: 'instruction', direction: 'direction', payroll_stage: 'stage', source_pay_channel: 'channel', resolution_state: 'resolution', approved_source_ex_vat: 'money', funded_source_ex_vat: 'money', recovered_source_ex_vat: 'money', written_off_source_ex_vat: 'money', active_payout_source_ex_vat: 'money', active_recovery_source_ex_vat: 'money' },
    CURRENT_WORK: { work_id: 'uuid', candidate_id: 'uuid', original_timesheet_id: 'uuid', work_kind: 'workKind', week_ending_date: 'date', approval_state: 'approval', current_revision_id: 'uuid?', applied_revision_id: 'uuid?', position_ready: 'boolean', source_pay_channel: 'channel?', timesheet_reference: 'label?', client_display_name: 'label?', approved_source_ex_vat: 'money?' },
    WORKERS: { run_worker_id: 'uuid', candidate_id: 'uuid', worker_status: 'worker', frozen_ex_vat: 'money?', frozen_vat: 'money?', frozen_inc_vat: 'money?', review_issue_code: 'issue?' },
    CHANNEL_WORKERS: { run_worker_id: 'uuid', candidate_id: 'uuid', pay_channel:'channel', worker_status:'worker', frozen_ex_vat:'money', frozen_vat:'money', frozen_inc_vat:'money', review_issue_code:'issue?' },
    LINES: { run_line_id: 'uuid', line_no: 'positive', original_timesheet_id: 'uuid', captured_revision_id: 'uuid', component_key: 'key', component_kind: 'component', work_date: 'date?', source_pay_channel: 'channel', target_pay_channel: 'channel', source_consumed_ex_vat: 'money', frozen_ex_vat: 'money', frozen_vat: 'money', frozen_inc_vat: 'money' },
    REVISION_COMPARISON: { run_work_id: 'uuid', work_id: 'uuid', original_timesheet_id: 'uuid', captured_revision_id: 'uuid', current_revision_id: 'uuid?', newer_approval_available: 'boolean' },
    STATUS: { transfer_id: 'uuid', transfer_no: 'transferNo', projection_id: 'uuid?', execution_kind: 'execution', status: 'transfer', cash_amount: 'money', original_transfer_id: 'uuid?', reservation_state:'reservationState',remaining_reservation_cash:'cashMoney?',reservation_holds_state:'reservationHolds' },
    RETURN_CASH: { original_transfer_id:'uuid',original_transfer_no:'transferNo',original_transfer_status:'returned',original_cash_amount:'cashMoney',beneficiary_kind:'beneficiary',beneficiary_id:'uuid',return_command_id:'uuid',return_posting_complete:'boolean',return_cash_id:'uuid?',amount_owed:'cashMoney?',amount_held:'cashMoney?',amount_reissued_paid:'cashMoney?',amount_available:'cashMoney?',pending_reissue_command_id:'uuid?',action_state:'returnState' }
  };
  const ACCEPTED_HEADER={run_id:'uuid',prepare_command_id:'uuid',accepted_sequence:'positive',accepted_module_epoch:'positive',run_status:'run',command_status:'prepareCommandStatus',expected_candidate_count:'positive',enrolled_candidate_count:'integer'};
  const STATUS_HEADER = {
    run_id: 'uuid', run_status: 'run', selection_state: 'selection', review_revision: 'integer', run_worker_id: 'uuid', candidate_id: 'uuid', worker_status: 'worker', target_pay_channel: 'channel', umbrella_id: 'uuid?', preparation_revision: 'positive', case_selection_revision: 'integer', net_request_revision: 'integer', net_projection_revision: 'integer', net_pending: 'boolean', review_issue_code: 'issue?', review_issue_work_id: 'uuid?', frozen_gross_ex_vat: 'money', frozen_gross_vat: 'money', frozen_gross_inc_vat: 'money', projection_id: 'uuid?', projection_input_kind: 'projection?', entered_paye_net: 'money?', accepted_recoveries: 'money?', accepted_net_additions: 'money?', cash_amount: 'money?', reservation_mode:'reservationMode',reservation_projection_id:'uuid?',remaining_reservation_cash:'cashMoney?',reservation_internal_zero:'boolean',reservation_holds_state:'reservationHolds'
  };
  const RETURN_HEADER = {run_id:'uuid',run_worker_id:'uuid',candidate_id:'uuid',financial_view_revision:'integer'};
  const PAGES = {
    WORK_CHOICES:{run_id:'uuid',after_work_id:'uuid?',limit:'limit'},
    SELECTED_COMPONENTS:{run_id:'uuid',work_id:'uuid',after_selection_no:'integer?',limit:'limit'},
    ACCEPTED_CANDIDATES:{run_id:'uuid',after_candidate_id:'uuid?',limit:'limit'},
    ACCEPTED_WORK:{run_id:'uuid',candidate_id:'uuid',after_work_id:'uuid?',limit:'limit'},
    CURRENT_CASES: { candidate_id: 'uuid', after_case_id: 'uuid?', limit: 'limit' },
    CASE_COMPONENTS: { candidate_id: 'uuid', case_id: 'uuid', after_component_ordinal: 'integer?', limit: 'limit' },
    CURRENT_WORK: { candidate_id: 'uuid', after_week: 'date?', after_work_id: 'uuid?', limit: 'limit' },
    WORKERS: { run_id: 'uuid', after_candidate_id: 'uuid?', limit: 'limit' },
    CHANNEL_DRAFTS: {run_id:'uuid'},
    CHANNEL_WORKERS: {run_id:'uuid',pay_channel:'channel',after_candidate_id:'uuid?',limit:'limit'},
    CHANNEL_STATUS: {run_id:'uuid',pay_channel:'channel',run_worker_id:'uuid',after_transfer_no:'transferNo?',limit:'limit'},
    LINES: { run_worker_id: 'uuid', after_line_no: 'integer?', limit: 'limit' },
    REVISION_COMPARISON: { run_worker_id: 'uuid', after_work_id: 'uuid?', limit: 'limit' },
    STATUS: { run_id: 'uuid', run_worker_id: 'uuid', after_transfer_no: 'transferNo?', limit: 'limit' },
    RETURN_CASH: { run_id:'uuid',run_worker_id:'uuid',after_transfer_no:'transferNo?',limit:'limit' }
  };
  // These are the existing frozen-detail service contracts, not current facts.
  const DETAIL_INPUT = {
    SHIFTS: { run_line_id:'uuid',after_detail_no:'numberInt?',limit:'limit' },
    BREAKS: { run_line_id:'uuid',shift_detail_id:'uuid',after_break_no:'numberInt?',limit:'limit' },
    RATE_DETAILS: { run_line_id:'uuid',after_bucket:'bucket?',limit:'limit' },
    RATE_SCHEDULE: { run_work_id:'uuid',after_rate_family:'rateFamily?',after_rate_code:'rateCode?',limit:'limit' }
  };
  const DETAIL_ROWS = {
    SHIFTS: { shift_detail_id:'uuid',detail_no:'numberPositive',work_date:'date',shift_start_at:'timestamp?',shift_end_at:'timestamp?',shift_start_local:'clock?',shift_end_local:'clock?',shift_overnight:'boolean?',submitted_minutes:'numberInt?',approved_minutes:'numberInt?',approved_hours:'detailDecimal?',detail_label:'label?',segment_pay_ex_vat:'detailMoney?',pay_excluded:'boolean?',hours_day:'detailDecimal?',hours_night:'detailDecimal?',hours_sat:'detailDecimal?',hours_sun:'detailDecimal?',hours_bh:'detailDecimal?' },
    BREAKS: { break_detail_id:'uuid',break_no:'numberPositive',break_start_at:'timestamp?',break_end_at:'timestamp?',break_start_local:'clock?',break_end_local:'clock?',break_minutes:'numberInt' },
    RATE_DETAILS: { rate_detail_id:'uuid',bucket:'bucket',approved_hours:'detailDecimal',source_pay_rate:'detailDecimal?' },
    RATE_SCHEDULE: { rate_schedule_id:'uuid',rate_family:'rateFamily',rate_code:'rateCode',unit_label:'unit?',paye_rate:'detailDecimal?',umbrella_rate:'detailDecimal?',charge_rate:'detailDecimal?' }
  };
  class Failure extends Error {
    constructor(code, unknown = false) { super(code); this.code = code; this.unknown = unknown; }
  }
  const fail = (code = 'RESPONSE_INVALID', unknown = false) => { throw new Failure(code, unknown); };

  function reservationDescription(value){
    const key=value.reservation_mode??value.reservation_state;
    const labels={UNCONFIRMED:'Awaiting Draft confirmation',PENDING_PREPARATION:'Preparation pending',PENDING_NET:'NET acceptance pending',ORIGINAL_OBLIGATION:'Confirmed original obligation',ORIGINAL_LEGS:'Remaining reservations are shown per original transfer below',CANCELLING:'Cancellation in progress; reserved sources are being released',CANCELLED:'Cancelled original obligation',EVIDENCE_CONFLICT:'Reservation evidence needs review',SUPPRESSED_UNCONFIRMED:'Awaiting Draft confirmation',PENDING:'Acceptance pending',INCLUDED_IN_ORIGINAL_OBLIGATION:'Included in the original obligation above',REISSUE_EXCLUDED:'Returned-cash reissue; separate from original reservation',RESERVED:'Held original reservation',ISSUED_AWAITING_RECEIPT:'CSV issued; reservation awaits recorded settlement',EXECUTION_UNCERTAIN:'Execution outcome uncertain',EXECUTED_PENDING_POSTING:'Settlement recorded; posting pending',POSTED:'Settlement posted',RETURNED:'Original payment returned; returned cash is separate',INTERNAL_RESERVED:'Internal zero-cash obligation reserved',INTERNAL_PENDING_POSTING:'Internal execution recorded; posting pending',CLOSED_INTERNAL:'Internal execution posted'};
    const amount=value.remaining_reservation_cash;
    return (labels[key]??'Reservation evidence needs review')+(amount===null?'':': £'+amount)+(value.reservation_internal_zero?' (internal zero-cash obligation)':'');
  }

  function requireActor(options) {
    if (typeof options.ownerReady === 'function' && options.ownerReady() !== true) fail('OWNER_UNAVAILABLE');
    if (options.currentActorId === undefined) return;
    if (typeof options.currentActorId !== 'function' || !field(options.actorId, 'uuid')) fail('DEPENDENCY_UNAVAILABLE');
    let actor; try { actor = options.currentActorId(); } catch { fail('ACTOR_CHANGED'); }
    // Do not clear a previously uncertain, actor-namespaced journal on this
    // local refusal: it says nothing about the earlier request's outcome.
    if (!same(actor, options.actorId)) fail('ACTOR_CHANGED');
  }

function validReservation(h,row=null){
  const amountModes=['ORIGINAL_OBLIGATION','CANCELLING','CANCELLED'];
  if(amountModes.includes(h.reservation_mode)!==(h.remaining_reservation_cash!==null))return false;
  if(h.reservation_mode==='ORIGINAL_LEGS'&&h.reservation_projection_id===null)return false;
  if(['CANCELLING','CANCELLED'].includes(h.reservation_mode)&&h.remaining_reservation_cash!=='0.00')return false;
  if(h.reservation_internal_zero&&(h.reservation_mode!=='ORIGINAL_OBLIGATION'||h.remaining_reservation_cash!=='0.00'))return false;
  if(row===null)return true;
  const s=row.reservation_state,c=row.remaining_reservation_cash;
  const nativeStatuses={RESERVED:['MEMBERS_READY','DRAFT','SCHEDULED','REFUSED'],ISSUED_AWAITING_RECEIPT:['ISSUED_CSV'],EXECUTION_UNCERTAIN:['SUBMITTED','UNKNOWN'],EXECUTED_PENDING_POSTING:['SETTLED'],POSTED:['SETTLED'],RETURNED:['RETURNED'],INTERNAL_RESERVED:['MEMBERS_READY','DRAFT','SCHEDULED','REFUSED'],INTERNAL_PENDING_POSTING:['INTERNAL_PROCESSING','INTERNAL_SETTLED'],CLOSED_INTERNAL:['INTERNAL_SETTLED']};
  if(Object.hasOwn(nativeStatuses,s)&&!nativeStatuses[s].includes(row.status))return false;
  if(['RESERVED','ISSUED_AWAITING_RECEIPT'].includes(s)&&row.reservation_holds_state!=='ACTIVE')return false;
  if(s==='EXECUTION_UNCERTAIN'&&h.reservation_mode!=='ORIGINAL_LEGS')return false;
  if(['CANCELLING','CANCELLED'].includes(s)&&s!==h.reservation_mode)return false;
  if((row.original_transfer_id!==null)!==(s==='REISSUE_EXCLUDED'))return false;
  if(['EVIDENCE_CONFLICT','SUPPRESSED_UNCONFIRMED','PENDING','INCLUDED_IN_ORIGINAL_OBLIGATION','EXECUTION_UNCERTAIN'].includes(s)){
    if(c!==null)return false;
    if(s==='INCLUDED_IN_ORIGINAL_OBLIGATION'&&h.reservation_mode!=='ORIGINAL_OBLIGATION')return false;
  }else if(['RESERVED','ISSUED_AWAITING_RECEIPT'].includes(s)){
    if(c!==row.cash_amount||row.execution_kind!=='BANK'||h.reservation_mode!=='ORIGINAL_LEGS')return false;
  }else if(['REISSUE_EXCLUDED','CANCELLING','CANCELLED','EXECUTED_PENDING_POSTING','POSTED','RETURNED','INTERNAL_RESERVED','INTERNAL_PENDING_POSTING','CLOSED_INTERNAL'].includes(s)){
    if(c!=='0.00')return false;
    if(s.startsWith('INTERNAL_')||s==='CLOSED_INTERNAL'){
      if(row.execution_kind!=='INTERNAL_ZERO'||row.cash_amount!=='0.00')return false;
    }
  }else return false;
  return true;
}
function field(v,type){
    if(type==='descriptor')return shape(v,{namespace:'choiceNamespace',intent:'choiceIntent',revision:'localRevision',workbench_revision:'integer',adoption_revision:'integer'})&&encoder.encode(JSON.stringify(v)).byteLength<=32768;
    if(type==='scopeChannel')return ['ALL','PAYE','UMBRELLA'].includes(v);
    if(type==='localRevision')return Number.isSafeInteger(v)&&v>=0;
    if(type==='choiceMode')return ['ALL_MATCHING','NONE'].includes(v);
    if(type==='choiceNamespace')return shape(v,{agency_id:'uuid',owner_epoch:'positive',actor_user_id:'uuid',official_pay_date:'date',scope:'choiceScope'});
    if(type==='choiceScope')return shape(v,{candidate_id:'uuid?',client_id:'uuid?',channel:'scopeChannel'});
    if(type==='choiceIntent'){
      if(!record(v)||Object.keys(v).sort().join()!=='candidates,cases,components,mode,works'||!field(v.mode,'choiceMode'))return false;
      const schemas={candidates:{candidate_id:'uuid',selected:'boolean'},works:{candidate_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',selected:'boolean',mode:'mode'},components:{candidate_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',approved_line_id:'uuid',selected:'boolean'},cases:{candidate_id:'uuid',case_component_id:'uuid',selected:'boolean'}};
      return Object.entries(schemas).every(([kind,schema])=>Array.isArray(v[kind])&&v[kind].length<=1000&&v[kind].every(row=>shape(row,schema))&&new Set(v[kind].map(row=>(row.case_component_id??row.approved_line_id??row.work_id??row.candidate_id).toLowerCase())).size===v[kind].length);
    }
    if(type==='skipCode')return ['BPAY_NEXT_WORK_WEEK_NOT_YET_PAYABLE','BPAY_NEXT_SELECTION_ON_HOLD','BPAY_NEXT_SELECTION_PAY_ON_HOLD','BPAY_NEXT_SELECTION_SNOOZED','BPAY_NEXT_SELECTION_WORK_NOT_APPROVED','BPAY_NEXT_SELECTION_REVISION_NOT_CURRENT','BPAY_NEXT_SELECTION_SIGNED_LINE_NOT_ELIGIBLE','PAYE_EXCLUDED_BY_SAME_WEEK_GUARD','SOURCE_PAY_QUERY_OPEN','SOURCE_PAY_QUERY_EVIDENCE_UNAVAILABLE'].includes(v);
    if(type==='skipped')return Array.isArray(v)&&v.length<=LIMITS.page&&v.every(x=>shape(x,{work_id:'uuid',code:'skipCode'}))
      &&new Set(v.map(x=>x.work_id.toLowerCase())).size===v.length;
    const reservationEnums={"reservationMode":["UNCONFIRMED","PENDING_PREPARATION","PENDING_NET","ORIGINAL_OBLIGATION","ORIGINAL_LEGS","CANCELLING","CANCELLED","EVIDENCE_CONFLICT"],"reservationState":["EVIDENCE_CONFLICT","SUPPRESSED_UNCONFIRMED","PENDING","INCLUDED_IN_ORIGINAL_OBLIGATION","PAGED_ORIGINAL_LEGS","REISSUE_EXCLUDED","CANCELLING","CANCELLED","RESERVED","ISSUED_AWAITING_RECEIPT","EXECUTION_UNCERTAIN","EXECUTED_PENDING_POSTING","POSTED","RETURNED","INTERNAL_RESERVED","INTERNAL_PENDING_POSTING","CLOSED_INTERNAL"],"reservationHolds":["ACTIVE","NONE","RELEASING","POSTING"]};
    if(Object.hasOwn(reservationEnums,type))return reservationEnums[type].includes(v);
    const acceptedEnums={acceptedCaseScope:['NO_CASE','SEALED_SELECTION'],settingsWitness:['BASELINE_AT_ACCEPTANCE','ORDERED_VERSION'],
    prepareJobStatus:['READY','LEASED','BLOCKED','DONE','FAILED'],prepareJobPhase:['NEW','PINNING','RESERVE','ALLOCATE','FINANCE_ALLOCATE','READY','DONE','EXPIRED'],
    acceptedProgress:['WAITING_ENROLLMENT','WAITING_EARLIER_COMMAND','PREPARING','READY','REVIEW','CANCELLING','CANCELLED','FAILED','EPOCH_PAUSED'],
    acceptedProgressCode:['ENROLLMENT_PENDING','EARLIER_COMMAND_PENDING','CUT_PENDING','PREPARATION_RUNNING','REVIEW_REQUIRED','CANCELLATION_PENDING','PREPARATION_EXPIRED','OWNER_EPOCH_STALE','JOB_FAILED'],
    acceptedSourceKind:['ORDINARY','SOURCE','PROTECTED','EXPENSE','ADJUSTMENT'],acceptedQuery:['CLEAR'],acceptedCutState:['WAITING_PREDECESSOR','WAITING_PIN','SEALED'],
    prepareCommandStatus:['RECEIVED','ENROLLING','SEALED','COMPLETE','FAILED']};
    if(Object.hasOwn(acceptedEnums,type))return acceptedEnums[type].includes(v);
    if(type==='beforeAcceptance')return v==='BEFORE_ACCEPTANCE';
    if(type==='acceptedIdentity')return v==='ACCEPTED_IDENTITY';
    if(type==='commandConflict')return v==='COMMAND_CONFLICT';
    if(type==='acceptanceReason')return ['EARLIER_ECONOMIC_PENDING','QUERY_UNAVAILABLE','QUERY_BLOCKED','QUERY_BUSY','INPUT_UNAVAILABLE','SELECTION_INCOMPLETE','ORIGIN_UNAVAILABLE','TRANSACTION_NOT_FRESH'].includes(v);
    if(type==='mode')return ['ALL','SUBSET'].includes(v);
    if (type.endsWith('?')) return v === null || field(v, type.slice(0, -1));
    if (type === 'uuid') return typeof v === 'string' && UUID.test(v);
    if (type === 'integer') return integer(v);
    if (type === 'positive') return positive(v);
    if (type === 'projectionRevision') return integer(v) && BigInt(v) < 9223372036854775807n;
    if (type === 'boolean') return typeof v === 'boolean';
    if (type === 'numberInt') return Number.isInteger(v) && v >= 0 && v <= 2147483647;
    if (type === 'numberPositive') return field(v,'numberInt') && v > 0;
    if (type === 'detailDecimal') return typeof v === 'string' && /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(v);
    if (type === 'detailMoney') return typeof v === 'string' && /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(v);
    if (type === 'clock') return typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
    if (type === 'timestamp') return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v) && field(v.slice(0,10),'date') && Number.isFinite(Date.parse(v));
    if (type === 'rateCode') return typeof v === 'string' && [...v].length >= 1 && [...v].length <= 128;
    if (type === 'unit') return typeof v === 'string' && encoder.encode(v).byteLength <= 512;
    if (type === 'true') return v === true;
    if (type === 'false') return v === false;
    if (type === 'money') return typeof v === 'string' && MONEY.test(v);
    if (type === 'cash') return typeof v === 'string' && /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(v);
    if (type === 'cashMoney') return typeof v === 'string' && /^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(v);
    if (type === 'date') { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v.startsWith('0000')) return false; const d = new Date(v + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; }
    if (type === 'limit') return Number.isInteger(v) && v >= 1 && v <= LIMITS.page;
    if (type === 'transferNo') return positive(v) && BigInt(v) <= 2147483647n;
    if (type === 'choices') return Array.isArray(v) && v.length >= 1 && v.length <= LIMITS.page && v.every(x => shape(x, { work_id: 'uuid', expected_revision_id: 'uuid', mode: 'mode' })) && new Set(v.map(x => x.work_id.toLowerCase())).size === v.length;
    if (type === 'ids') return Array.isArray(v) && v.length >= 1 && v.length <= LIMITS.page && v.every(x => field(x, 'uuid')) && new Set(v.map(x => x.toLowerCase())).size === v.length;
    if (type === 'booleans') return Array.isArray(v) && v.length >= 1 && v.length <= LIMITS.page && v.every(x => typeof x === 'boolean');
    if (type === 'drafts') return Array.isArray(v) && v.length >= 1 && v.length <= 2 && v.every(x=>shape(x,{run_id:'uuid',pay_channel:'channel'})) && (v.length===1 || (v[0].pay_channel==='PAYE' && v[1].pay_channel==='UMBRELLA'));
    if (['label', 'key', 'file', 'csv', 'code', 'issue'].includes(type)) {
      if (typeof v !== 'string' || v.includes('\0')) return false;
      const n = encoder.encode(v).byteLength;
      if (type === 'label') return n <= 8192;
      if (type === 'csv') return n >= 1 && n <= 120000;
      if (type === 'file') return n >= 1 && n <= 256;
      if (type === 'key') return [...v].length >= 1 && [...v].length <= 256;
      return n <= 256 && (type === 'code' ? /^BPAY_NEXT_[A-Z0-9_]+$/ : /^[A-Z][A-Z0-9_]*$/).test(v);
    }
    if (type === 'sha') return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
    const values = {
      all: ['ALL'], run: RUN, worker: WORKER, transfer: TRANSFER,
      bucket:['BH','DAY','NIGHT','SAT','SUN'],rateFamily:['ADDITIONAL','MILEAGE','STANDARD'],
      returned:['RETURNED'],beneficiary:['CANDIDATE','UMBRELLA','OTHER_APPROVED'],returnState:['RETURN_POSTING_PENDING','UNSUPPORTED_BENEFICIARY','REISSUE_REQUESTED','CASH_RESERVED','CASH_REPAID','CASH_AVAILABLE'],
      caseKind: ['LOAN', 'ADVANCE', 'OVERPAYMENT', 'CREDIT', 'MANUAL_DEBT'], caseSubtype: ['LOAN', 'PAYMENT_ADVANCE', 'OVERPAYMENT', 'UNDERPAYMENT', 'MANUAL_CREDIT', 'MANUAL_DEBT'], tax: ['TAXABLE', 'NON_TAXABLE', 'NOT_APPLICABLE'], caseStatus: ['OPEN', 'PAUSED'], instruction: ['PAYOUT', 'RECOVERY', 'CREDIT'], direction: ['PAYMENT', 'DEDUCTION'], stage: ['GROSS_ADD', 'GROSS_DEDUCT', 'NET_ADD', 'NET_DEDUCT'], resolution: ['RESOLVED', 'REVIEW'],
      selection: ['OPEN', 'SEALED'], review: ['PREPARING', 'REVIEW'], reviewReason: ['ENROLLMENT_INCOMPLETE', 'WORKERS_INCOMPLETE'], draft: ['DRAFT'], net: ['ACCEPTED_PENDING_PROJECTION'], cancel: ['REQUESTED', 'CANCELLING', 'CANCELLED', 'BLOCKED'], csv: ['ISSUED_CSV'],
      channel: ['PAYE', 'UMBRELLA'], execution: ['BANK', 'INTERNAL_ZERO'], projection: ['PAYE_MANUAL', 'PAYE_IMPORT', 'CASE_PAYOUT', 'UMBRELLA'],
      component: ['WORK', 'PROTECTED_WORK', 'EXPENSE', 'MILEAGE', 'ADDITIONAL', 'ADJUSTMENT'], workKind: ['ORDINARY', 'SOURCE', 'EXPENSE', 'ADJUSTMENT'], approval: ['PENDING', 'APPROVED', 'WITHDRAWN']
    };
    return Object.hasOwn(values, type) && values[type].includes(v);
  }
  function normalizeAccepted(v){if(Array.isArray(v))return v.map(normalizeAccepted);if(record(v))return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalizeAccepted(x)]));return typeof v==='string'&&UUID.test(v)?v.toLowerCase():v;}
  function shape(v, schema) { return record(v) && Object.keys(v).length === Object.keys(schema).length && Object.entries(schema).every(([k, t]) => Object.hasOwn(v, k) && field(v[k], t)); }
  function environment(options){const value=options.environment??'TEST';if(!['TEST','LIVE'].includes(value))fail('DEPENDENCY_UNAVAILABLE');return value;}
  function capabilityReceipt(value,expected){
    if(!record(value)||Object.keys(value).length!==11||value.ok!==true||value.scope!=='NEXT'
      ||![null,'TEST','LIVE'].includes(value.worker_environment)||value.requested_environment!==expected
      ||typeof value.environment_ready!=='boolean'||typeof value.test_mode!=='boolean'||typeof value.env_mismatch!=='boolean'
      ||value.test_mode!==(value.worker_environment==='TEST')||value.env_mismatch===value.environment_ready
      ||(value.environment_ready&&value.worker_environment!==expected)||value.cop_available!==false
      ||value.provider_status!=='DISABLED'||value.funding_status!=='UNAVAILABLE'||value.csv_available!==value.environment_ready)fail();
    return Object.freeze({...value});
  }
  const financial = action => ['PAYE_NET', 'TRANSFER_BEGIN', 'CANCEL_REQUEST', 'CSV_ISSUE'].includes(action);
  function requestBody(action, args) {
    let schema = INPUT[action];
    if(action==='CREATE'&&Object.hasOwn(args||{},'descriptor'))schema={run_id:'uuid',command_id:'uuid',descriptor:'descriptor'};
    else if (action === 'CREATE' && !Object.hasOwn(args || {}, 'pay_date')) schema = {run_id:'uuid'};
    if (action === 'PAYE_NET' && Object.hasOwn(args || {}, 'expected_projection_revision')) schema = { ...schema, expected_projection_revision: 'projectionRevision' };
    if (action === 'CANCEL_REQUEST' && (Object.hasOwn(args || {}, 'run_id') || Object.hasOwn(args || {}, 'pay_channel'))) schema = {...schema,run_id:'uuid',pay_channel:'channel'};
    if (!schema || !shape(args, schema) || (action === 'CASE_PAGE' && args.component_ids.length !== args.selected.length)) fail('REQUEST_INVALID');
    return JSON.stringify({ action, ...args });
  }
  function receipt(payload, action, args) {
    const schema=action==='CREATE'&&Object.hasOwn(args,'descriptor')?{...RECEIPT.CREATE,command_id:'uuid',agency_sequence:'positive?',choice_work_count:'integer',choice_case_count:'integer',empty:'boolean',replay:'boolean'}:RECEIPT[action];
    if (!shape(payload, schema)) fail();
    for (const k of ['run_id', 'run_worker_id', 'candidate_id', 'work_id', 'expected_revision_id', 'command_id', 'transfer_id', 'instruction_id']) if (Object.hasOwn(args, k) && !(action==='CANCEL_REQUEST'&&k==='run_id') && !same(payload[k], args[k])) fail();
    if(action==='CREATE'&&Object.hasOwn(args,'pay_date')&&payload.official_pay_date!==args.pay_date)fail();
    if(action==='CREATE'&&Object.hasOwn(args,'descriptor')&&(payload.empty!==(payload.selected_candidate_count==='0')||payload.empty!==(payload.agency_sequence===null)||BigInt(payload.selection_count)>BigInt(payload.choice_work_count)||payload.official_pay_date!==args.descriptor.namespace.official_pay_date))fail();
    if(action==='WORK_PAGE'){
      const ids=args.choices.map(x=>x.work_id.toLowerCase()),positions=payload.skipped.map(x=>ids.indexOf(x.work_id.toLowerCase()));
      if(positions.some((n,i)=>n<0||(i>0&&n<=positions[i-1])))fail();
    }
    if(action==='COMPONENT_PAGE'&&(payload.page_no!==args.page_no||payload.item_count!==String(args.approved_line_ids.length)))fail();
    if(action==='COMPONENT_SEAL'&&payload.component_count!==args.expected_count)fail();
    if (action === 'CASE_PAGE' && (payload.page_no !== args.page_no || payload.selection_revision !== args.selection_revision || payload.item_count !== String(args.component_ids.length))) fail();
    if (action === 'CASE_SEAL' && (payload.selection_revision !== args.selection_revision || BigInt(payload.selected_count) + BigInt(payload.excluded_count) !== BigInt(args.expected_items))) fail();
    if (action === 'WORK_PAGE' && (payload.page_no !== args.page_no || payload.item_count !== String(args.choices.length))) fail();
    if (action === 'CONFIRM' && (payload.review_revision !== args.review_revision || payload.drafts.some(d=>!same(d.run_id,args.run_id)))) fail();
    if (action === 'REVIEW' && ((payload.phase === 'PREPARING') !== (payload.reason !== null))) fail();
    if (action === 'REVIEW' && payload.all_ready === true && !positive(payload.review_revision)) fail();
    if (action === 'CANCEL_REQUEST' && ((payload.phase === 'BLOCKED') !== (payload.blocked_code !== null))) fail();
    if (action === 'CSV_ISSUE' && payload.payment_recorded !== false) fail();
    return payload;
  }
  async function boundedJson(response, signal) {
    if (!(response instanceof Response) || !response.body) fail();
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMITS.bytes)) { await response.body.cancel().catch(() => {}); fail('RESPONSE_TOO_LARGE'); }
    const reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true });
    const parts = []; let count = 0;
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      while (true) { if (signal.aborted) fail('TIMEOUT'); const row = await reader.read(); if (signal.aborted) fail('TIMEOUT'); if (row.done) break; count += row.value.byteLength; if (count > LIMITS.bytes) fail('RESPONSE_TOO_LARGE'); parts.push(decoder.decode(row.value, { stream: true })); }
      parts.push(decoder.decode()); return JSON.parse(parts.join(''));
    } catch (e) { await reader.cancel().catch(() => {}); throw e instanceof Failure ? e : new Failure('RESPONSE_INVALID'); }
    finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  }
  function createTransport(options) {
    if (typeof options?.api !== 'function' || typeof options.authFetch !== 'function') fail('DEPENDENCY_UNAVAILABLE');
    async function call(path, init, frozenRead = false, context = null) {
      requireActor(options);
      const controller = new AbortController(); let timer;
      const task = (async () => {
        const raw = await options.authFetch(options.api(path), { ...init, signal: controller.signal, auth401Mode: 'return', redirect: 'error', headers: { 'content-type': 'application/json', accept: 'application/json', 'X-CloudTMS-Banking-Environment':environment(options) } });
        if (controller.signal.aborted) { await raw?.body?.cancel().catch(() => {}); fail('TIMEOUT'); }
        try { requireActor(options); } catch (e) { await raw?.body?.cancel().catch(() => {}); throw e; }
        const body = await boundedJson(raw, controller.signal);
        requireActor(options);
        if (!raw.ok) {
          const schema = frozenRead ? { ok:'false',error_code:'code',retryable:'boolean' } : { ok: 'false', error_code: 'code', retryable: 'boolean', outcome_unknown: 'boolean' };
          const typed=Object.hasOwn(body||{},'refusal');
          if(!shape(typed?(({refusal,...rest})=>rest)(body):body,schema))fail();
          if(typed){
            const r=body.refusal,reasons={EARLIER_ECONOMIC_PENDING:true,QUERY_UNAVAILABLE:true,QUERY_BLOCKED:false,QUERY_BUSY:true,INPUT_UNAVAILABLE:false,SELECTION_INCOMPLETE:false,ORIGIN_UNAVAILABLE:false,TRANSACTION_NOT_FRESH:false};
            if(frozenRead||context?.action!=='SEAL_ENQUEUE'||raw.status!==409||body.outcome_unknown!==false||!record(r))fail();
            if(r.phase==='BEFORE_ACCEPTANCE'){
              if(!shape(r,{phase:'beforeAcceptance',reason:'acceptanceReason',candidate_id:'uuid?',work_id:'uuid?'})||(r.work_id!==null&&r.candidate_id===null)||body.error_code!=='BPAY_NEXT_PREPARATION_'+r.reason||body.retryable!==reasons[r.reason])fail();
            }else if(!shape(r,{phase:'acceptedIdentity',reason:'commandConflict',run_id:'uuid',command_id:'uuid',agency_sequence:'positive'})||!same(r.run_id,context.args.run_id)||body.error_code!=='BPAY_NEXT_PREPARATION_COMMAND_CONFLICT'||body.retryable!==false)fail();
          }
          const refusal = new Failure(raw.status === 401 || raw.status === 403 ? 'AUTH_REQUIRED' : 'SERVER_REFUSED', frozenRead ? false : body.outcome_unknown);
          refusal.serverCode=body.error_code;refusal.retryable=body.retryable;refusal.refusal=typed?Object.freeze({...body.refusal}):null;
          if (['BPAY_NEXT_COMMAND_MODULE_NOT_ACTIVE','BPAY_NEXT_PREPARATION_MODULE_NOT_ACTIVE'].includes(body.error_code)) {
            refusal.ownerCode = body.error_code;
            try { const refresh = options.onOwnerStale?.(body.error_code); if(refresh)void refresh.catch(()=>{}); } catch {}
          }
          throw refusal;
        }
        return body;
      })();
      try { return await Promise.race([task, new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Failure('TIMEOUT')); }, options.timeoutMs ?? LIMITS.timeout); })]); }
      finally { clearTimeout(timer); }
    }
    return Object.freeze({
      async capabilities(){return capabilityReceipt(await call('/api/banking/capabilities?scope=NEXT',{method:'GET'},true),environment(options));},
      async mutation(action, bytes) {
        const body = JSON.parse(bytes), { action: saved, ...args } = body;
        if (saved !== action || requestBody(action, args) !== bytes) fail('REQUEST_INVALID');
        const result = await call('/api/banking/pay/next/' + (financial(action) ? 'command' : 'preparation'), { method: 'POST', body: bytes },false,{action,args});
        if (!record(result) || result.ok !== true || result.action !== action || Object.keys(result).length !== 3) fail();
        return receipt(result.result, action, args);
      },
      async frozenPage(kind, args) {
        if (!Object.hasOwn(DETAIL_INPUT,kind) || !shape(args,DETAIL_INPUT[kind]) || (kind==='RATE_SCHEDULE' && (args.after_rate_family===null)!==(args.after_rate_code===null))) fail('REQUEST_INVALID');
        const body = await call('/api/banking/pay/next/frozen-detail',{method:'POST',body:JSON.stringify({kind,...args})},true);
        if (!shapePage(body,kind,args.limit) || !body.rows.every(r=>shape(r,DETAIL_ROWS[kind]))) fail();
        let prior = kind==='SHIFTS' ? args.after_detail_no??0 : kind==='BREAKS' ? args.after_break_no??0 : args.after_bucket??'';
        const seen=new Set();
        for(const row of body.rows){
          const cursor=detailCursor(kind,row),key=JSON.stringify(cursor);if(seen.has(key))fail();seen.add(key);
          if(kind==='SHIFTS'||kind==='BREAKS'){
            const n=row.detail_no??row.break_no;if(n<=prior)fail();prior=n;
            const prefix=kind==='SHIFTS'?'shift':'break';if((row[prefix+'_start_at']===null)!==(row[prefix+'_end_at']===null)||(row[prefix+'_start_local']===null)!==(row[prefix+'_end_local']===null))fail();
            if(kind==='SHIFTS'){
              if(row.approved_minutes===null&&row.approved_hours===null&&row.shift_start_at===null&&row.shift_start_local===null)fail();
              const facts=['segment_pay_ex_vat','pay_excluded','hours_day','hours_night','hours_sat','hours_sun','hours_bh'],present=facts.filter(k=>row[k]!==null).length;
              if(present!==0&&present!==facts.length)fail();
              if(present!==0&&(facts.slice(2).some(k=>row[k].startsWith('-')&&!/^-0(?:\.0{1,6})?$/.test(row[k]))||(row.pay_excluded&&!/^-?0(?:\.0{1,2})?$/.test(row.segment_pay_ex_vat))))fail();
            }
          }else if(kind==='RATE_DETAILS'){if(row.bucket<=prior)fail();prior=row.bucket;}
          else if((row.rate_family===args.after_rate_family&&row.rate_code===args.after_rate_code)||[row.paye_rate,row.umbrella_rate,row.charge_rate].every(v=>v===null)||(row.rate_family==='STANDARD'&&!field(row.rate_code,'bucket'))||(row.rate_family==='MILEAGE'&&row.rate_code!=='MILE'))fail();
        }
        const cursor=body.complete?null:detailCursor(kind,body.rows.at(-1));if(JSON.stringify(body.next_cursor)!==JSON.stringify(cursor))fail();
        return body;
      },
      async page(kind, args) {
        if (!Object.hasOwn(PAGES, kind) || !shape(args, PAGES[kind]) || (kind === 'CURRENT_WORK' && (args.after_week === null) !== (args.after_work_id === null))) fail('REQUEST_INVALID');
        const query = new URLSearchParams({ kind }); for (const [k, v] of Object.entries(args)) if (v !== null) query.set(k, String(v));
        let body = await call('/api/banking/pay/next/preparation-page?' + query.toString(), { method: 'GET' });
  if(['ACCEPTED_CANDIDATES','ACCEPTED_WORK'].includes(kind)){
    body=normalizeAccepted(body);
    if(!record(body)||Object.keys(body).length!==6||body.ok!==true||body.kind!==kind||!Object.hasOwn(body,'next_cursor')||!Object.hasOwn(body,'header')||!Object.hasOwn(body,'rows')||!Object.hasOwn(body,'complete')
      ||!shape(body.header,ACCEPTED_HEADER)||!same(body.header.run_id,args.run_id)
      ||BigInt(body.header.enrolled_candidate_count)>BigInt(body.header.expected_candidate_count)
      ||!Array.isArray(body.rows)||body.rows.length>args.limit||typeof body.complete!=='boolean'
      ||(!body.complete&&body.rows.length===0))fail();
    const h=body.header,candidates=kind==='ACCEPTED_CANDIDATES',key=candidates?'candidate_id':'work_id',inputKey=candidates?'after_candidate_id':'after_work_id';
    let previous=args[inputKey]===null?null:args[inputKey].toLowerCase(),workInput=null;const acceptedIds=new Set();
    for(const row of body.rows){
      if(!shape(row,ROWS[kind])||(previous!==null&&row[key]<=previous)||acceptedIds.has(candidates?row.accepted_input_id:row.accepted_work_input_id))fail();
      previous=row[key];acceptedIds.add(candidates?row.accepted_input_id:row.accepted_work_input_id);
      if(candidates){
        if(row.module_epoch!==h.accepted_module_epoch||(row.target_pay_channel==='UMBRELLA')!==(row.target_umbrella_id!==null)
          ||(row.case_scope==='NO_CASE')!==(row.case_selection_revision===null)
          ||(row.prepare_job_id===null)!==(row.prepare_job_status===null)||(row.prepare_job_id===null)!==(row.prepare_job_phase===null)
          ||(row.run_worker_id===null)!==(row.worker_status===null)||(row.waiting_command_id===null)!==(row.waiting_command_sequence===null)
          ||(row.waiting_command_sequence!==null&&BigInt(row.waiting_command_sequence)>=BigInt(h.accepted_sequence)))fail();
        const codes={WAITING_ENROLLMENT:['ENROLLMENT_PENDING'],WAITING_EARLIER_COMMAND:['EARLIER_COMMAND_PENDING'],PREPARING:['CUT_PENDING','PREPARATION_RUNNING'],READY:[null],REVIEW:['REVIEW_REQUIRED'],CANCELLING:['CANCELLATION_PENDING'],CANCELLED:[null,'PREPARATION_EXPIRED'],FAILED:['JOB_FAILED'],EPOCH_PAUSED:['OWNER_EPOCH_STALE']};
        if(!codes[row.progress_state].includes(row.progress_code)
          ||(row.progress_state==='WAITING_ENROLLMENT'&&(row.prepare_job_id!==null||row.run_worker_id!==null||!['RECEIVED','ENROLLING'].includes(h.command_status)))
          ||(row.progress_state==='WAITING_EARLIER_COMMAND'&&(row.waiting_command_id===null||!['READY','LEASED','BLOCKED'].includes(row.prepare_job_status)))
          ||(row.progress_state==='READY'&&(row.prepare_job_status!=='DONE'||row.prepare_job_phase!=='READY'||!['READY','DRAFT','ISSUED','COMPLETE'].includes(row.worker_status)||h.run_status==='CANCELLING'||row.has_unsealed_work||!['SEALED','COMPLETE'].includes(h.command_status)||h.expected_candidate_count!==h.enrolled_candidate_count))
          ||(row.progress_state==='REVIEW'&&row.worker_status!=='REVIEW')
          ||(row.progress_state==='CANCELLED'&&!(row.worker_status==='CANCELLED'||(row.prepare_job_status==='DONE'&&row.prepare_job_phase==='EXPIRED')))
          ||(row.progress_state==='CANCELLING'&&row.worker_status!=='CANCELLING'&&h.run_status!=='CANCELLING')
          ||(row.progress_state==='FAILED'&&row.prepare_job_status!=='FAILED'&&h.command_status!=='FAILED')
          ||(row.progress_state==='PREPARING'&&(row.waiting_command_id!==null||!['READY','LEASED','BLOCKED'].includes(row.prepare_job_status)||!['NEW','PINNING','RESERVE','ALLOCATE','FINANCE_ALLOCATE'].includes(row.prepare_job_phase)||(row.worker_status!==null&&row.worker_status!=='PREPARING')||((row.progress_code==='CUT_PENDING')!==row.has_unsealed_work))))fail();
      }else {
        if(workInput!==null&&workInput!==row.accepted_input_id)fail();workInput=row.accepted_input_id;
        if(!same(row.candidate_id,args.candidate_id)||BigInt(row.predecessor_sequence)>=BigInt(h.accepted_sequence)
        ||(['SOURCE','PROTECTED'].includes(row.source_kind)!==(row.query_disposition==='CLEAR'&&row.query_state_sha256!==null))
        ||(!['SOURCE','PROTECTED'].includes(row.source_kind)&&(row.query_disposition!==null||row.query_state_sha256!==null))
        ||(row.cut_state==='SEALED')!==(row.effective_cut_id!==null))fail();
      }
    }
    const cursor=body.complete?null:{[inputKey]:previous};if(JSON.stringify(body.next_cursor)!==JSON.stringify(cursor))fail();return body;
  }
        if(kind==='CHANNEL_DRAFTS'){
          if(!record(body)||Object.keys(body).length!==5||!['ok','kind','rows','complete','next_cursor'].every(k=>Object.hasOwn(body,k))||body.ok!==true||body.kind!==kind||body.complete!==true||body.next_cursor!==null||!field(body.rows,'drafts')||body.rows.some(d=>!same(d.run_id,args.run_id)))fail();
          return body;
        }
        const statusKind=kind==='STATUS'||kind==='CHANNEL_STATUS',workerKind=kind==='WORKERS'||kind==='CHANNEL_WORKERS';
        const keys = ['STATUS','CHANNEL_STATUS','RETURN_CASH'].includes(kind) ? ['ok', 'kind', 'header', 'rows', 'complete', 'next_cursor'] : ['ok', 'kind', 'rows', 'complete', 'next_cursor'];
        if (!record(body) || Object.keys(body).length !== keys.length || keys.some(k => !Object.hasOwn(body, k)) || body.ok !== true || body.kind !== kind || !Array.isArray(body.rows) || body.rows.length > args.limit || typeof body.complete !== 'boolean' || (!body.complete && body.rows.length === 0 && kind!=='RETURN_CASH') || !body.rows.every(r => shape(r, ROWS[statusKind?'STATUS':kind]))) fail();
        if(kind==='RETURN_CASH'){
          const h=body.header;if(!shape(h,RETURN_HEADER)||!same(h.run_id,args.run_id)||!same(h.run_worker_id,args.run_worker_id))fail();
          let prior=args.after_transfer_no;const identities=new Set(),cashIdentities=new Set();
          for(const r of body.rows){
            if((prior!==null&&BigInt(r.original_transfer_no)<=BigInt(prior))||identities.has(r.original_transfer_id.toLowerCase())||isZero(r.original_cash_amount))fail();
            prior=r.original_transfer_no;identities.add(r.original_transfer_id.toLowerCase());
            const balances=['amount_owed','amount_held','amount_reissued_paid','amount_available'];
            if(!r.return_posting_complete){if(r.return_cash_id!==null||balances.some(k=>r[k]!==null)||r.pending_reissue_command_id!==null||r.action_state!=='RETURN_POSTING_PENDING')fail();}
            else{
              if(r.return_cash_id===null||balances.some(k=>r[k]===null)||isZero(r.amount_owed)||cashIdentities.has(r.return_cash_id.toLowerCase()))fail();cashIdentities.add(r.return_cash_id.toLowerCase());
              const expected=r.beneficiary_kind!=='CANDIDATE'||!same(r.beneficiary_id,h.candidate_id)?'UNSUPPORTED_BENEFICIARY':r.pending_reissue_command_id!==null?'REISSUE_REQUESTED':!isZero(r.amount_available)?'CASH_AVAILABLE':!isZero(r.amount_held)?'CASH_RESERVED':'CASH_REPAID';
              if(r.action_state!==expected)fail();
            }
          }
          // The raw scan can pass skipped/unreturned/reissue legs. Never
          // fabricate its cursor from the last displayed original transfer.
          if(body.complete){if(body.next_cursor!==null)fail();}
          else if(!shape(body.next_cursor,{after_transfer_no:'transferNo'})||(args.after_transfer_no!==null&&BigInt(body.next_cursor.after_transfer_no)<=BigInt(args.after_transfer_no))||(prior!==null&&BigInt(body.next_cursor.after_transfer_no)<BigInt(prior)))fail();
          return body;
        }
        if (statusKind && (!shape(body.header, STATUS_HEADER) || !same(body.header.run_id, args.run_id) || !same(body.header.run_worker_id, args.run_worker_id) || (kind==='CHANNEL_STATUS'&&body.header.target_pay_channel!==args.pay_channel) || body.header.net_pending !== (body.header.net_request_revision !== body.header.net_projection_revision) || !validReservation(body.header))) fail();
        if(kind==='CHANNEL_WORKERS'&&(body.rows.some(r=>r.pay_channel!==args.pay_channel)||new Set(body.rows.map(r=>r.run_worker_id.toLowerCase())).size!==body.rows.length))fail();
        if (kind === 'CASE_COMPONENTS' && new Set(body.rows.map(r=>r.case_component_id.toLowerCase())).size !== body.rows.length) fail();
        if(statusKind){const h=body.header,facts=['projection_input_kind','entered_paye_net','accepted_recoveries','accepted_net_additions','cash_amount'];if(h.projection_id===null&&facts.some(k=>h[k]!==null))fail();if(h.projection_id!==null&&(h.projection_input_kind===null||['accepted_recoveries','accepted_net_additions','cash_amount'].some(k=>h[k]===null)||(['UMBRELLA','CASE_PAYOUT'].includes(h.projection_input_kind)!==(h.entered_paye_net===null))))fail();}
        let prior = kind === 'CURRENT_WORK' ? (args.after_week === null ? null : [args.after_week, args.after_work_id]) : (statusKind ? args.after_transfer_no : (args.after_case_id ?? args.after_component_ordinal ?? args.after_candidate_id ?? args.after_line_no ?? args.after_selection_no ?? args.after_work_id ?? null));
        for (const r of body.rows) {
          if(statusKind&&!validReservation(body.header,r))fail();
          const v = kind === 'CURRENT_WORK' ? [r.week_ending_date, r.work_id] : kind === 'CURRENT_CASES' ? r.case_id : kind === 'CASE_COMPONENTS' ? r.component_ordinal : kind==='SELECTED_COMPONENTS'?r.selection_no:statusKind ? r.transfer_no : workerKind ? r.candidate_id : kind === 'LINES' ? r.line_no : r.work_id;
          if (prior !== null) { const ordered = Array.isArray(v) ? v[0] > prior[0] || (v[0] === prior[0] && v[1] > prior[1]) : (statusKind||['LINES','CASE_COMPONENTS','SELECTED_COMPONENTS'].includes(kind)) ? BigInt(v) > BigInt(prior) : v > prior; if (!ordered) fail(); }
          if(kind==='WORK_CHOICES'&&r.selection_mode==='ALL'&&(r.selection_state!=='SEALED'||r.page_count!=='0'||r.component_count!=='0'))fail();
          if (['CURRENT_CASES','CASE_COMPONENTS'].includes(kind) && (!same(r.candidate_id,args.candidate_id) || (kind === 'CASE_COMPONENTS' && !same(r.case_id,args.case_id)))) fail();
          if (kind === 'CURRENT_WORK' && (!same(r.candidate_id, args.candidate_id) || (r.position_ready&&(r.approval_state!=='APPROVED'||r.current_revision_id===null||!same(r.current_revision_id,r.applied_revision_id))))) fail(); prior = v;
        }
        const cursor = body.complete ? null : kind === 'CURRENT_WORK' ? { after_week: prior[0], after_work_id: prior[1] } : { [kind === 'CURRENT_CASES' ? 'after_case_id' : kind === 'CASE_COMPONENTS' ? 'after_component_ordinal' : kind==='SELECTED_COMPONENTS'?'after_selection_no':statusKind ? 'after_transfer_no' : workerKind ? 'after_candidate_id' : kind === 'LINES' ? 'after_line_no' : 'after_work_id']: prior };
        if (JSON.stringify(body.next_cursor) !== JSON.stringify(cursor)) fail();
        return body;
      }
    });
  }
  function shapePage(body,kind,limit) { return record(body) && Object.keys(body).length===5 && ['ok','kind','rows','complete','next_cursor'].every(k=>Object.hasOwn(body,k)) && body.ok===true && body.kind===kind && Array.isArray(body.rows) && body.rows.length<=limit && typeof body.complete==='boolean' && (body.complete||body.rows.length!==0); }
  function detailCursor(kind,row) { return kind==='SHIFTS'?{after_detail_no:row.detail_no}:kind==='BREAKS'?{after_break_no:row.break_no}:kind==='RATE_DETAILS'?{after_bucket:row.bucket}:{after_rate_family:row.rate_family,after_rate_code:row.rate_code}; }
  const choiceSubmissionMemory = new Map();
  const choiceSubmissionOperations = new Map();
  function createChoiceSubmission(options) {
    if (!field(options?.descriptor,'descriptor') || !options.transport || typeof options.uuid!=='function') fail('DEPENDENCY_UNAVAILABLE');
    const clone=value=>JSON.parse(JSON.stringify(value)),descriptor=clone(options.descriptor);
    const key='cloudtms.bpay-next.submit.v1.'+JSON.stringify(descriptor.namespace);
    const immutable=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))immutable(child);Object.freeze(value);}return value;};
    const hash=async bytes=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',encoder.encode(bytes))),value=>value.toString(16).padStart(2,'0')).join('');
    const phases=['CREATE','SUBSETS','EXCLUSIONS','MATCHING','EXPLICIT','CASES','GUARD','SEAL','READBACK','COMPLETE','EMPTY'];
    const allowed=new Set(['CREATE','WORK_PAGE','COMPONENT_PAGE','COMPONENT_SEAL','CASE_PAGE','CASE_SEAL','SEAL_ENQUEUE']);
    const readback=()=>({work_cursor:null,work_page:[],work_complete:false,index:0,component_cursor:null,component_count:'0',seen_works:'0'});
    let storage=null,persistent=false;

    try{storage=options.storage??options.window?.localStorage??null;persistent=Boolean(storage);}catch{}
    function valid(value){
      if(!record(value)||Object.keys(value).sort().join()!==['version','descriptor','run_id','command_id','create_receipt','last_receipt','pending','phase','selection_pages','selection_count','readback'].sort().join()
        ||value.version!==1||!field(value.descriptor,'descriptor')||JSON.stringify(value.descriptor.namespace)!==JSON.stringify(descriptor.namespace)
        ||!field(value.run_id,'uuid')||!field(value.command_id,'uuid')||!phases.includes(value.phase)
        ||!integer(value.selection_pages)||!integer(value.selection_count)||encoder.encode(JSON.stringify(value)).byteLength>131072)return false;
      try{
        if((value.phase==='CREATE')!==(value.create_receipt===null))return false;
        if(value.create_receipt!==null)receipt(value.create_receipt,'CREATE',{run_id:value.run_id,command_id:value.command_id,descriptor:value.descriptor});
        if(value.create_receipt!==null&&value.create_receipt.empty!==(value.phase==='EMPTY'))return false;
        if(['READBACK','COMPLETE'].includes(value.phase)&&(value.pending!==null||value.last_receipt?.action!=='SEAL_ENQUEUE'))return false;
        for(const saved of [value.pending,value.last_receipt])if(saved!==null){
          if(!record(saved)||!allowed.has(saved.action)||typeof saved.bytes!=='string'||!field(saved.body_sha256,'sha')
            ||Object.keys(saved).sort().join()!==(saved===value.pending?['action','bytes','body_sha256']:['action','bytes','body_sha256','result']).sort().join())return false;
          const {action,...args}=JSON.parse(saved.bytes);
          if(action!==saved.action||requestBody(action,args)!==saved.bytes||!same(args.run_id,value.run_id))return false;
          if(action==='CREATE'&&(!same(args.command_id,value.command_id)||JSON.stringify(args.descriptor)!==JSON.stringify(value.descriptor)
            ||(saved===value.pending&&value.phase!=='CREATE')))return false;
          if(action!=='CREATE'&&(value.create_receipt===null||value.create_receipt.empty))return false;
          if(action==='SEAL_ENQUEUE'&&(!same(args.command_id,value.command_id)||args.expected_pages!==value.selection_pages||args.expected_count!==value.selection_count))return false;
          if(action==='WORK_PAGE'&&saved===value.pending&&args.page_no!==String(BigInt(value.selection_pages)+1n))return false;
          if(saved===value.last_receipt)receipt(saved.result,action,args);
          if(saved===value.last_receipt&&action==='SEAL_ENQUEUE'&&saved.result.agency_sequence!==value.create_receipt.agency_sequence)return false;
        }
      }catch{return false;}
      const r=value.readback;
      return record(r)&&Object.keys(r).sort().join()===Object.keys(readback()).sort().join()
        &&(r.work_cursor===null||field(r.work_cursor,'uuid'))&&Array.isArray(r.work_page)&&r.work_page.length<=100
        &&r.work_page.every(row=>shape(row,ROWS.WORK_CHOICES))&&typeof r.work_complete==='boolean'
        &&Number.isInteger(r.index)&&r.index>=0&&r.index<=r.work_page.length
        &&(r.component_cursor===null||integer(r.component_cursor))&&integer(r.component_count)&&integer(r.seen_works);
    }
    let state=choiceSubmissionMemory.get(key);
    if(!state){if(choiceSubmissionMemory.size>=256)fail('JOURNAL_TOO_LARGE');let raw=null;try{raw=storage?.getItem(key)??null;}catch{persistent=false;}
      if(raw!==null){try{state=JSON.parse(raw);}catch{fail('JOURNAL_INVALID');}if(!valid(state))fail('JOURNAL_INVALID');}
      else{const run_id=options.uuid(),command_id=options.uuid();if(!field(run_id,'uuid')||!field(command_id,'uuid'))fail('DEPENDENCY_UNAVAILABLE');state={version:1,descriptor,run_id:run_id.toLowerCase(),command_id:command_id.toLowerCase(),create_receipt:null,last_receipt:null,pending:null,phase:'CREATE',selection_pages:'0',selection_count:'0',readback:readback()};}
      choiceSubmissionMemory.set(key,state);
    }
    if(!valid(state))fail('JOURNAL_INVALID');
    const operation=choiceSubmissionOperations.get(key)??{busy:false,retired:false};
    choiceSubmissionOperations.set(key,operation);
    const snapshot=()=>immutable(clone({...state,busy:operation.busy,persistent}));
    function save(next){if(!valid(next))fail('JOURNAL_TOO_LARGE');Object.assign(state,clone(next));try{if(storage){storage.setItem(key,JSON.stringify(state));persistent=true;}}catch{persistent=false;}options.onChange?.(snapshot());}
    function authority(){requireActor(options);if(operation.retired||choiceSubmissionMemory.get(key)!==state||choiceSubmissionOperations.get(key)!==operation)fail('ACCEPTED_IDENTITY_CONFLICT');if(options.ownerReady()!==true)fail('OWNER_UNAVAILABLE');}
    async function dispatch(unknown){
      authority();operation.busy=true;options.onChange?.(snapshot());
      try{
        const pending=clone(state.pending);
        if(await hash(pending.bytes)!==pending.body_sha256)fail('JOURNAL_INVALID');
        const {action,...args}=JSON.parse(pending.bytes),result=receipt(await options.transport.mutation(action,pending.bytes),action,args);
        authority();if(state.pending===null||state.pending.action!==pending.action||state.pending.bytes!==pending.bytes||state.pending.body_sha256!==pending.body_sha256)fail('ACCEPTED_IDENTITY_CONFLICT');
        const next={...state,pending:null,last_receipt:{...pending,result}};
        if(action==='CREATE'){next.create_receipt=result;next.selection_count=result.selection_count;next.phase=result.empty?'EMPTY':'SUBSETS';}
        if(action==='WORK_PAGE'){next.selection_pages=result.page_no;next.selection_count=result.selection_count;}
        if(action==='SEAL_ENQUEUE'){
          if(!state.create_receipt||!same(result.command_id,state.command_id)||result.agency_sequence!==state.create_receipt.agency_sequence)fail('ACCEPTED_IDENTITY_CONFLICT');
          next.phase='READBACK';next.readback=readback();
        }
        save(next);return result;
      }catch(error){if(!unknown&&error instanceof Failure&&['SERVER_REFUSED','AUTH_REQUIRED'].includes(error.code)&&!error.unknown)save({...state,pending:null});throw error;}
      finally{operation.busy=false;options.onChange?.(snapshot());}
    }
    return Object.freeze({key,snapshot,
      async create(){return this.mutate('CREATE',{run_id:state.run_id,command_id:state.command_id,descriptor:state.descriptor});},
      async mutate(action,args){
        authority();if(operation.busy||state.pending!==null)fail('OUTCOME_UNKNOWN');
        if(!allowed.has(action)||!same(args?.run_id,state.run_id))fail('REQUEST_INVALID');
        if(action==='CREATE'){if(state.phase!=='CREATE'||JSON.stringify(args.descriptor)!==JSON.stringify(state.descriptor)||!same(args.command_id,state.command_id))fail('REQUEST_INVALID');}
        else if(!state.create_receipt||state.create_receipt.empty||['READBACK','COMPLETE'].includes(state.phase))fail('REQUEST_INVALID');
        if(action==='WORK_PAGE'&&args.page_no!==String(BigInt(state.selection_pages)+1n))fail('REQUEST_INVALID');
        if(action==='SEAL_ENQUEUE'&&(!same(args.command_id,state.command_id)||args.expected_pages!==state.selection_pages||args.expected_count!==state.selection_count))fail('REQUEST_INVALID');
        const bytes=requestBody(action,args),body_sha256=await hash(bytes);
        authority();if(operation.busy||state.pending!==null)fail('OUTCOME_UNKNOWN');save({...state,pending:{action,bytes,body_sha256}});return dispatch(false);
      },
      async retry(){if(operation.busy||state.pending===null)fail('NO_PENDING_REQUEST');return dispatch(true);},
      acknowledgeComplete(store){
        authority();if(operation.busy||state.pending!==null||!['COMPLETE','EMPTY'].includes(state.phase)
          ||typeof store?.acknowledge!=='function'||JSON.stringify(store.namespace)!==JSON.stringify(state.descriptor.namespace))fail('REQUEST_INVALID');
        try{storage?.removeItem(key);}catch{persistent=false;return false;}
        store.acknowledge(state.descriptor.revision);
        operation.retired=true;
        if(choiceSubmissionMemory.get(key)===state)choiceSubmissionMemory.delete(key);
        if(choiceSubmissionOperations.get(key)===operation)choiceSubmissionOperations.delete(key);
        return true;
      },
      async readback(){
        authority();if(operation.busy||state.pending!==null||state.phase!=='READBACK')fail('REQUEST_INVALID');operation.busy=true;
        try{
          for(;;){authority();let r=clone(state.readback);
            if(r.index===r.work_page.length){
              if(r.work_page.length&&r.work_complete){if(r.seen_works!==state.selection_count)fail('RESPONSE_INVALID');save({...state,phase:'COMPLETE'});return snapshot();}
              const page=await options.transport.page('WORK_CHOICES',{run_id:state.run_id,after_work_id:r.work_cursor,limit:100});authority();
              if(page.rows.some(row=>row.selection_state!=='SEALED'||row.expected_revision_id===null))fail('RESPONSE_INVALID');
              if(!page.rows.length&&page.complete){if(r.seen_works!==state.selection_count)fail('RESPONSE_INVALID');save({...state,phase:'COMPLETE'});return snapshot();}
              r={...r,work_page:page.rows,work_complete:page.complete,index:0,work_cursor:page.next_cursor?.after_work_id??page.rows.at(-1).work_id,component_cursor:null,component_count:'0'};save({...state,readback:r});
            }
            const work=r.work_page[r.index];
            if(work.selection_mode==='SUBSET'){
              const page=await options.transport.page('SELECTED_COMPONENTS',{run_id:state.run_id,work_id:work.work_id,after_selection_no:r.component_cursor,limit:100});authority();
              if(page.rows.some(row=>!same(row.expected_revision_id,work.expected_revision_id)))fail('RESPONSE_INVALID');
              r.component_count=String(BigInt(r.component_count)+BigInt(page.rows.length));
              if(BigInt(r.component_count)>BigInt(work.component_count))fail('RESPONSE_INVALID');
              if(!page.complete){r.component_cursor=page.next_cursor.after_selection_no;save({...state,readback:r});continue;}
              if(r.component_count!==work.component_count)fail('RESPONSE_INVALID');
            }
            r.index++;r.seen_works=String(BigInt(r.seen_works)+1n);r.component_cursor=null;r.component_count='0';save({...state,readback:r});
          }
        }finally{operation.busy=false;options.onChange?.(snapshot());}
      }
    });
  }
  function createController(options) {
    if (!field(options?.actorId, 'uuid') || typeof options.uuid !== 'function' || !options.storage || !options.transport) fail('DEPENDENCY_UNAVAILABLE');
    const key = 'cloudtms.bpay-next.v1.' + options.actorId.toLowerCase();
    const debug = {workbenchReads:[]};
    const caseDefaults = { case_pages: '0', case_items: '0', case_selected_count: '0', case_excluded_count: '0', case_sealed: false, case_cursor: null, case_id: null, component_cursor: null, accepted_page_component_ids: [], accepted_page_component_selected: [] };
    const ids = rows => Array.isArray(rows) && rows.length <= 100 && rows.every(x => field(x,'uuid')) && new Set(rows.map(x=>x.toLowerCase())).size === rows.length;
    const validCases = value => ['case_pages','case_items','case_selected_count','case_excluded_count'].every(k=>integer(value[k])) && BigInt(value.case_items) === BigInt(value.case_selected_count) + BigInt(value.case_excluded_count) && (value.case_pages==='0') === (value.case_items==='0') && typeof value.case_sealed === 'boolean' && (!value.case_sealed || positive(value.case_pages)) && (value.case_cursor === null || shape(value.case_cursor,{after_case_id:'uuid'})) && (value.case_id === null || field(value.case_id,'uuid')) && (value.component_cursor === null || shape(value.component_cursor,{after_component_ordinal:'positive'})) && ids(value.accepted_page_component_ids) && Array.isArray(value.accepted_page_component_selected) && value.accepted_page_component_selected.length === value.accepted_page_component_ids.length && value.accepted_page_component_selected.every(v=>typeof v==='boolean') && (value.case_id !== null || (value.component_cursor === null && value.accepted_page_component_ids.length === 0));
    let state = { version: 4, accepted_prepare:null, drafts:[], pay_channel:null, actor_id: options.actorId.toLowerCase(), run_id: null, worker_id: null, candidate_id: null, selection_pages: '0', selection_count: '0', selection_sealed: false, current_cursor: null, accepted_page_work_ids: [], can_confirm: false, confirmed: false, review_revision: null, instruction_id: null, transfer_id: null, pending: null, prior_case_selected_count:'0', ...caseDefaults };
    let busy = false;
    const saved = options.storage.getItem(key);
    if (saved !== null) {
      if (encoder.encode(saved).byteLength > LIMITS.journalBytes) fail('JOURNAL_INVALID');
      try { let value = JSON.parse(saved);
        // Older ALL-Work journals have no case intent. Preserve their exact
        // pending bytes; absence of only this complete new metadata set is the
        // sole allowed schema adoption, never a financial/selection fallback.
        // Older journals contain only the current Candidate's Case counts.
        // No prior Candidate could be chosen in that UI; retain all original
        // metadata and unknown bytes, adding only this exact zero count.
        if(record(value)&&value.version===1&&!Object.hasOwn(value,'prior_case_selected_count')){
          if(Object.keys(caseDefaults).every(k=>!Object.hasOwn(value,k)))value={...value,...caseDefaults};
          value={...value,version:2,prior_case_selected_count:'0'};
        }
        // Complete v2 journals retain all IDs and exact uncertain bytes. The
        // new channel is deliberately unknown until an actual server header
        // and descriptor read qualify it; never default an old worker to PAYE.
        if(record(value)&&value.version===2&&!Object.hasOwn(value,'drafts')&&!Object.hasOwn(value,'pay_channel')){
          const oldKeys=Object.keys(state).filter(k=>!['drafts','pay_channel','accepted_prepare'].includes(k)).sort().join();
          if(Object.keys(value).sort().join()!==oldKeys)fail('JOURNAL_INVALID');
          value={...value,version:3,drafts:[],pay_channel:null};
        }
        if(record(value)&&value.version===3&&!Object.hasOwn(value,'accepted_prepare')){const oldKeys=Object.keys(state).filter(k=>k!=='accepted_prepare').sort().join();if(Object.keys(value).sort().join()!==oldKeys)fail('JOURNAL_INVALID');value={...value,version:4,accepted_prepare:null};}
        if (!record(value) || value.version !== 4 || !(value.accepted_prepare===null||shape(value.accepted_prepare,{command_id:'uuid',agency_sequence:'positive'})) || value.actor_id !== state.actor_id || Object.keys(value).sort().join() !== Object.keys(state).sort().join() || !['run_id','worker_id','candidate_id','instruction_id','transfer_id'].every(k => value[k] === null || field(value[k], 'uuid')) || !['selection_sealed','can_confirm','confirmed'].every(k=>typeof value[k]==='boolean') || !integer(value.selection_pages) || !integer(value.selection_count) || !integer(value.prior_case_selected_count) || !(value.current_cursor === null || shape(value.current_cursor,{after_week:'date',after_work_id:'uuid'})) || !ids(value.accepted_page_work_ids) || !validCases(value) || !(Array.isArray(value.drafts)&&(value.drafts.length===0||field(value.drafts,'drafts'))&&value.drafts.every(d=>same(d.run_id,value.run_id))) || !(value.pay_channel===null||(field(value.pay_channel,'channel')&&value.drafts.some(d=>d.pay_channel===value.pay_channel))) || !(value.review_revision === null || positive(value.review_revision)) || !(value.pending === null || (record(value.pending) && Object.keys(value.pending).length === 2 && typeof value.pending.action === 'string' && typeof value.pending.bytes === 'string' && JSON.parse(value.pending.bytes).action === value.pending.action && requestBody(value.pending.action, (({ action, ...args }) => args)(JSON.parse(value.pending.bytes))) === value.pending.bytes))) fail('JOURNAL_INVALID'); state = value; } catch { fail('JOURNAL_INVALID'); }
    }
    const notify = () => options.onChange?.(snapshot());
    const snapshot = () => Object.freeze({ ...state, accepted_prepare:state.accepted_prepare===null?null:Object.freeze({...state.accepted_prepare}), drafts:Object.freeze(state.drafts.map(d=>Object.freeze({...d}))), current_cursor:state.current_cursor===null?null:Object.freeze({...state.current_cursor}),case_cursor:state.case_cursor===null?null:Object.freeze({...state.case_cursor}),component_cursor:state.component_cursor===null?null:Object.freeze({...state.component_cursor}),accepted_page_work_ids:Object.freeze([...state.accepted_page_work_ids]),accepted_page_component_ids:Object.freeze([...state.accepted_page_component_ids]),accepted_page_component_selected:Object.freeze([...state.accepted_page_component_selected]),pending: state.pending === null ? null : Object.freeze({ ...state.pending }), busy });
    function save(next) { if(!integer(next.prior_case_selected_count))fail('JOURNAL_INVALID');const bytes = JSON.stringify(next); if (encoder.encode(bytes).byteLength > LIMITS.journalBytes) fail('JOURNAL_TOO_LARGE'); options.storage.setItem(key, bytes); state = next; notify(); }
    function adopt(action, result, args) {
      const next = { ...state, pending: null };
      if(result.run_id&&state.accepted_prepare!==null&&!same(result.run_id,state.run_id))fail('ACCEPTED_IDENTITY_CONFLICT');
      if (result.run_id) next.run_id = result.run_id;
      if (result.run_worker_id) next.worker_id = result.run_worker_id;
      if (action === 'CREATE') next.selection_sealed = result.selection_state === 'SEALED';
      if (action === 'WORK_PAGE') { next.selection_pages = result.page_no; next.selection_count = result.selection_count; next.accepted_page_work_ids=Array.from(new Set([...state.accepted_page_work_ids,...args.choices.filter(x=>!result.skipped.some(s=>same(s.work_id,x.work_id))).map(x=>x.work_id.toLowerCase())]));if(next.accepted_page_work_ids.length>100)fail('JOURNAL_INVALID'); }
      if (action === 'CASE_PAGE') { next.case_pages=result.page_no;next.case_items=String(BigInt(state.case_items)+BigInt(result.item_count));const selected=BigInt(args.selected.filter(x=>x).length);next.case_selected_count=String(BigInt(state.case_selected_count)+selected);next.case_excluded_count=String(BigInt(state.case_excluded_count)+BigInt(result.item_count)-selected);next.accepted_page_component_ids=[...state.accepted_page_component_ids,...args.component_ids.map(x=>x.toLowerCase())];next.accepted_page_component_selected=[...state.accepted_page_component_selected,...args.selected];if(!ids(next.accepted_page_component_ids))fail('JOURNAL_INVALID'); }
      if (action === 'CASE_SEAL') { if(result.selected_count!==state.case_selected_count||result.excluded_count!==state.case_excluded_count)fail();next.case_sealed=true; }
      if (action === 'SEAL_ENQUEUE') {if(state.accepted_prepare&&(!same(state.accepted_prepare.command_id,result.command_id)||state.accepted_prepare.agency_sequence!==result.agency_sequence))fail('ACCEPTED_IDENTITY_CONFLICT');next.selection_sealed=true;next.accepted_prepare={command_id:result.command_id,agency_sequence:result.agency_sequence};}
      // A validated REVIEW receipt comes only from the existing sealed-run owner.
      // PREPARING is pending, not ready; never retain a stale confirm revision.
      if (action === 'REVIEW') { next.selection_sealed = true; next.can_confirm = result.phase === 'REVIEW' && result.all_ready === true; next.review_revision = next.can_confirm ? result.review_revision : null; }
      if (action === 'CONFIRM') { next.confirmed = true; next.can_confirm = false; next.drafts=result.drafts.map(d=>({...d})); }
      if (result.transfer_id) next.transfer_id = result.transfer_id;
      if (result.instruction_id) next.instruction_id = result.instruction_id;
      save(next); return result;
    }
    async function dispatch(previousOutcomeUnknown) {
      busy = true; notify();
      try { const pending = state.pending; const {action,...args}=JSON.parse(pending.bytes); const result=receipt(await options.transport.mutation(pending.action, pending.bytes),action,args); return adopt(pending.action,result,args); }
      catch (e) {
        // An initial typed refusal can prove that dispatch did not commit.
        // A later auth/refusal response says nothing about the earlier lost
        // reply, so retry must retain its original identity until receipt.
        if (!previousOutcomeUnknown && e instanceof Failure && ['SERVER_REFUSED', 'AUTH_REQUIRED'].includes(e.code) && !e.unknown) save({ ...state, pending: null });
        throw e;
      } finally { busy = false; notify(); }
    }
    return Object.freeze({ snapshot, debug,
      async mutate(action, args) { if (busy || state.pending !== null) fail('OUTCOME_UNKNOWN'); const bytes = requestBody(action, args);
        if(action==='CANCEL_REQUEST'&&Object.hasOwn(args,'run_id')&&(!same(args.run_id,state.run_id)||args.pay_channel!==state.pay_channel||!same(args.run_worker_id,state.worker_id)))fail('REQUEST_INVALID');
        if(['CASE_PAGE','CASE_SEAL'].includes(action)&&(!same(args.run_id,state.run_id)||!same(args.candidate_id,state.candidate_id)||args.selection_revision!=='1'||state.case_sealed))fail('REQUEST_INVALID');
        if(action==='CASE_PAGE'&&(state.case_id===null||args.page_no!==String(BigInt(state.case_pages)+1n)))fail('REQUEST_INVALID');
        if(action==='CASE_SEAL'&&(args.expected_pages!==state.case_pages||args.expected_items!==state.case_items))fail('REQUEST_INVALID');
        if(action==='SEAL_ENQUEUE'&&state.case_pages!=='0'&&!state.case_sealed)fail('REQUEST_INVALID');
        save({ ...state, pending: { action, bytes } }); return dispatch(false); },
      async retry() { if (busy || state.pending === null) fail('NO_PENDING_REQUEST'); return dispatch(true); },
      bind(values) { if (busy || state.pending !== null || Object.keys(values).some(k => !['run_id','worker_id','candidate_id'].includes(k)) || (state.accepted_prepare!==null&&Object.hasOwn(values,'run_id')&&!same(values.run_id,state.run_id)) || (state.drafts.length!==0&&Object.hasOwn(values,'run_id')&&!same(values.run_id,state.run_id)) || !Object.values(values).every(v => field(v,'uuid')) || ((state.case_pages!=='0'||state.prior_case_selected_count!=='0')&&Object.hasOwn(values,'run_id')&&!same(values.run_id,state.run_id)) || (state.case_pages!=='0'&&!state.case_sealed&&!state.selection_sealed&&Object.hasOwn(values,'candidate_id')&&!same(values.candidate_id,state.candidate_id))) fail('REQUEST_INVALID'); const changed=['run_id','worker_id','candidate_id'].some(k=>Object.hasOwn(values,k)&&!same(values[k],state[k]));const changedChoice=!state.selection_sealed&&Object.hasOwn(values,'candidate_id')&&!same(values.candidate_id,state.candidate_id);save({ ...state, ...values,...(changed?{transfer_id:null,instruction_id:null}:{}),...(changedChoice?{...caseDefaults,prior_case_selected_count:String(BigInt(state.prior_case_selected_count)+(state.case_sealed?BigInt(state.case_selected_count):0n)),current_cursor:null,accepted_page_work_ids:[]}: {}) }); },
      setDrafts(rows) {
        if(busy||state.pending!==null||!field(rows,'drafts')||rows.some(d=>!same(d.run_id,state.run_id)))fail('REQUEST_INVALID');
        if(state.drafts.length!==0&&JSON.stringify(state.drafts)!==JSON.stringify(rows))fail('RESPONSE_INVALID');
        save({...state,confirmed:true,selection_sealed:true,can_confirm:false,drafts:rows.map(d=>({...d}))});
      },
      bindDraft(address) {
        if(busy||state.pending!==null||!shape(address,{run_id:'uuid',pay_channel:'channel'})||!state.drafts.some(d=>same(d.run_id,address.run_id)&&d.pay_channel===address.pay_channel))fail('REQUEST_INVALID');
        const changed=state.pay_channel!==address.pay_channel;
        save({...state,pay_channel:address.pay_channel,...(changed?{worker_id:null,candidate_id:null,transfer_id:null,instruction_id:null}:{})});
      },
      qualifyWorkerChannel(header) {
        if(busy||state.pending!==null||!shape(header,STATUS_HEADER)||!same(header.run_id,state.run_id)||!same(header.run_worker_id,state.worker_id)||!same(header.candidate_id,state.candidate_id)||!state.drafts.some(d=>d.pay_channel===header.target_pay_channel))fail('REQUEST_INVALID');
        if(state.pay_channel!==null&&state.pay_channel!==header.target_pay_channel)fail('RESPONSE_INVALID');
        save({...state,pay_channel:header.target_pay_channel});
      },
      setCurrentCursor(cursor) { if(busy||state.pending!==null||!(cursor===null||shape(cursor,{after_week:'date',after_work_id:'uuid'})))fail('REQUEST_INVALID');if(JSON.stringify(cursor)!==JSON.stringify(state.current_cursor))save({...state,current_cursor:cursor,accepted_page_work_ids:[]}); },
      setCaseCursor(cursor) { if(busy||state.pending!==null||!(cursor===null||shape(cursor,{after_case_id:'uuid'})))fail('REQUEST_INVALID');if(JSON.stringify(cursor)!==JSON.stringify(state.case_cursor))save({...state,case_cursor:cursor}); },
      setComponentScope(case_id,cursor) { if(busy||state.pending!==null||!field(case_id,'uuid')||!(cursor===null||shape(cursor,{after_component_ordinal:'positive'})))fail('REQUEST_INVALID');if(!same(case_id,state.case_id)||JSON.stringify(cursor)!==JSON.stringify(state.component_cursor))save({...state,case_id,component_cursor:cursor,accepted_page_component_ids:[],accepted_page_component_selected:[]}); },
      newId() { const id = options.uuid(); if (!field(id, 'uuid')) fail('DEPENDENCY_UNAVAILABLE'); return id.toLowerCase(); },
      async page(kind,args){if(['ACCEPTED_CANDIDATES','ACCEPTED_WORK'].includes(kind))fail('REQUEST_INVALID');const page=await options.transport.page(kind,args);if(['ACCEPTED_CANDIDATES','ACCEPTED_WORK'].includes(kind)){
        const h=page.header;if(!shape(h,ACCEPTED_HEADER)||!same(h.run_id,state.run_id))fail();
        if(state.accepted_prepare&&(!same(state.accepted_prepare.command_id,h.prepare_command_id)||state.accepted_prepare.agency_sequence!==h.accepted_sequence))fail('ACCEPTED_IDENTITY_CONFLICT');
        if(state.pending?.action==='SEAL_ENQUEUE'&&!same(JSON.parse(state.pending.bytes).command_id,h.prepare_command_id))fail('ACCEPTED_IDENTITY_CONFLICT');
        if(state.accepted_prepare===null)save({...state,accepted_prepare:{command_id:h.prepare_command_id,agency_sequence:h.accepted_sequence},selection_sealed:true});
      }return page;},
      async frozenPage(kind,args) { return options.transport.frozenPage(kind,args); }
    });
  }
  const humanDate = dates.formatDate;
  const humanTimestamp = dates.formatTimestamp;
  const clockPair = (a,b) => a === null ? 'Not recorded' : a+'–'+b;
  async function openCandidateRecord(options, candidateId, closeSheet) {
    requireActor(options);
    if (!field(candidateId, 'uuid') || typeof options.openCandidateRecord !== 'function' || typeof closeSheet !== 'function') fail('DEPENDENCY_UNAVAILABLE');
    // The existing Candidate owner hydrates and edits the record. Never pass
    // a bank tuple, proposed replacement, frozen artifact or financial intent.
    // Close this top-layer sheet, retaining its actor journal, so the normal
    // Candidate modal is reachable rather than hidden beneath it.
    if(await closeSheet()!==true)return false;
    requireActor(options);
    return options.openCandidateRecord(candidateId);
  }
  let sheet = null;
  function close() { sheet?.close(); }
  function open(options) {
    if (typeof options.ownerReady !== 'function' || options.ownerReady() !== true) fail('OWNER_UNAVAILABLE');
    requireActor(options);
    if(typeof options.showReadWindow!=='function')fail('DEPENDENCY_UNAVAILABLE');
    if (sheet) { sheet.focus(); return sheet; }
    const doc = options.document || document; const win = options.window || window;
    const transport = createTransport(options); let controller, drafts = null, current = null, cases = null, components = null, workers = null, status = null, returnedCash = null, lines = null, comparisons = null, frozenLine = null, shifts = null, breaks = null, usedRates = null, frozenWork = null, rateSchedule = null;
    let selection = new Map(), caseSelection = new Map(), renderEpoch = 0, readBusy = false, capabilities = null, capabilityError = '', error = '', progressTimer, workersCursor=null, statusCursor=null, statusScope=null, reviewObserved=false, preparationPending=false;
    const host = doc.createElement('section'); host.className = 'bpay-next-office-content'; host.tabIndex = -1;
    const previousFocus = doc.activeElement;
    const el = (tag, text, className) => { const n = doc.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
    const button = (text, action, disabled = false, direct = false, focusKey = text) => { const b = el('button',text); b.setAttribute('data-next-focus-key','action:'+focusKey); b.type='button'; b.disabled=disabled; b.addEventListener('click', () => { if(direct)action();else void act(action); }); return b; };
    const input = (label, type, value) => { const wrap = el('label', label); const n = el('input'); n.type=type; n.setAttribute('data-next-focus-key','input:'+label); n.value=value || ''; wrap.append(n); return [wrap,n]; };
    let netInput, resumeInput,workbenchShell=null,issueLists=null,readyLists=null,issueWindow=null,candidateWindow=null,issueReadAvailable=false,readWindow=null,closed=false,started=false;
    const choiceStores=new Map();
    const dirtyChoices=()=>Array.from(choiceStores.values()).filter(store=>store.snapshot().dirty);
    const beforeUnload=event=>{if(!closed&&same(options.currentActorId(),options.actorId)&&dirtyChoices().length){event.preventDefault();event.returnValue='';}};
    async function beforeClose(){
      if(!same(options.currentActorId(),options.actorId)||options.ownerReady()!==true)return true;
      const choices=dirtyChoices().map(store=>({store,revision:store.snapshot().revision}));
      if(!choices.length)return true;
      const content=el('section'),footer=el('div',undefined,'bpay-next-window-actions');let decision=null,dialog;
      content.append(el('h2','Discard your unsaved selection?'),el('p',choices.every(({store})=>store.persistenceAvailable())?'Keep saves your ticks for next time.':'Keep leaves your ticks in this tab.'));
      const keep=button('Keep',()=>{decision='KEEP';void dialog.close();},false,true),discard=button('Discard',()=>{decision='DISCARD';void dialog.close();},false,true);
      keep.classList.add('btn');discard.classList.add('btn','btn-warn');footer.append(keep,discard);
      return new Promise(resolve=>{dialog=options.showReadWindow({title:'Banking Pay',content,footer,small:true,confirmation:true,canFocus:()=>same(options.currentActorId(),options.actorId)&&options.ownerReady()===true,onDismiss:()=>{
        const current=same(options.currentActorId(),options.actorId)&&options.ownerReady()===true&&choices.every(({store,revision})=>store.snapshot().revision===revision);
        if(current&&decision==='DISCARD')for(const {store} of choices)store.discard();
        resolve(current&&decision!==null);
      }});});
    }
    const issueHost=el('div');
    const dismiss = () => { if(closed)return;closed=true;renderEpoch += 1;win.clearTimeout(progressTimer);win.removeEventListener('beforeunload',beforeUnload);win.removeEventListener('cloudtms:bpay-next-owner-changed',render);doc.removeEventListener('visibilitychange',render);readyLists?.close();issueLists?.close();workbenchShell?.close();host.remove();sheet=null;if(previousFocus?.isConnected&&same(options.currentActorId(),options.actorId))previousFocus.focus(); };
    const close = () => readWindow?.close()??Promise.resolve(false);
    const focus=ui.continuity(host,doc,()=>host.querySelector('button'));
    async function act(action) { if (readBusy) return; error=''; readBusy=true; render(); try { await action(); } catch(e) { if(e?.serverCode==='BPAY_NEXT_ENVIRONMENT_MISMATCH'){capabilities=null;capabilityError='Banking environment is unavailable or mismatched. Re-check before continuing.';} error=controller?.snapshot().pending ? 'The result is not known. Payment controls are paused. Retry this exact request; do not start a replacement.' : refusalCopy(e) || 'This action could not be completed. Refresh or sign in again.'; } finally { readBusy=false; render(); } }
    async function loadCapabilities(){capabilities=null;capabilityError='';try{capabilities=await transport.capabilities();
      if(capabilities.environment_ready&&!issueLists){
        if(!win.CloudTMSBpayNextWorkbench||typeof win.CloudTMSBpayNextWorkbench.openIssueWindow!=='function')throw new Failure('SCHEMA_UNAVAILABLE');
        workbenchShell=win.CloudTMSBpayNextWorkbench.mountWorkbenchShell({...options,host:issueHost,debug:controller.debug,
          windowAlive:()=>readWindow?.alive()===true,onRefresh:()=>{issueLists?.reload();readyLists?.reload();},selectionLabel:()=>readyLists?.selectionLabel()??'All except 0',
          onAvailability:value=>{readyLists?.joinHeader(value);const issues=issueLists?.snapshot();issueReadAvailable=value.available&&Boolean(issues?.available&&win.CloudTMSBpayNextWorkbench.sameWorkbenchRevision(value.context,issues.context));},
          onScope:scope=>{issueLists?.setScope(scope);readyLists?.setScope(scope);},onTab:tab=>{if(tab!=='READY')issueLists?.setKind(tab==='ACTION'?'ACTION_REQUIRED':'BLOCKED');}});
        readyLists=win.CloudTMSBpayNextWorkbench.mountReadyCandidates({...options,host:workbenchShell.readyHost,client:workbenchShell.client,debug:controller.debug,windowAlive:()=>readWindow?.alive()===true,
          onChoiceStore:store=>choiceStores.set(store.key,store),onSelection:()=>workbenchShell?.refreshSelectionLabel(),openBankRecord:id=>openCandidateRecord(options,id,close),
          openCandidate:address=>{if(candidateWindow?.alive())return;candidateWindow=win.CloudTMSBpayNextWorkbench.openCandidateWindow({...options,host:workbenchShell.readyHost,client:workbenchShell.client,choiceStore:readyLists.choiceStore(),onSelection:()=>workbenchShell?.refreshSelectionLabel(),onChanged:()=>{issueLists?.invalidate();workbenchShell?.invalidate();}},address);}});
        readyLists.joinHeader(workbenchShell.snapshot());
        issueLists=win.CloudTMSBpayNextWorkbench.mountIssueLists({...options,host:workbenchShell.issueHost,windowAlive:()=>readWindow?.alive()===true,client:workbenchShell.client,externalTabs:true,debug:controller.debug,parentContext:()=>workbenchShell.snapshot().context,parentAvailable:()=>workbenchShell.snapshot().available,canInteract:()=>readWindow?.active()===true,
          openIssue:address=>{if(issueWindow?.alive())return;issueWindow=win.CloudTMSBpayNextWorkbench.openIssueWindow({...options,host:workbenchShell.issueHost,client:workbenchShell.client,windowAlive:()=>readWindow?.alive()===true,onIssueChanged:()=>{issueLists?.invalidate();workbenchShell?.invalidate();}},address);},onAvailability:value=>{workbenchShell.setIssueAvailability(value);const header=workbenchShell.snapshot();issueReadAvailable=value.available&&header.available&&win.CloudTMSBpayNextWorkbench.sameWorkbenchRevision(value.context,header.context);if(host.isConnected)render();}});
      }
    }catch{capabilityError='Banking capabilities are unavailable. Re-check before continuing.';issueReadAvailable=false;}}
    function refusalCopy(e){
      if(e?.serverCode==='BPAY_NEXT_ENVIRONMENT_MISMATCH')return 'Banking environment does not match this request. Nothing was accepted. Re-check before continuing.';
      if(e?.refusal?.phase==='BEFORE_ACCEPTANCE'){
        const copy={EARLIER_ECONOMIC_PENDING:'An earlier financial command must finish before preparation can be accepted.',QUERY_UNAVAILABLE:'The Source Query check is unavailable. Preparation was not accepted.',QUERY_BLOCKED:'A Source Query blocks this selection. Preparation was not accepted.',QUERY_BUSY:'The Source Query check is busy. Preparation was not accepted.',INPUT_UNAVAILABLE:'A selected preparation input is unavailable. Preparation was not accepted.',SELECTION_INCOMPLETE:'Complete the selection before preparing.',ORIGIN_UNAVAILABLE:'An original payment or source obligation cannot be proved. Preparation was not accepted.',TRANSACTION_NOT_FRESH:'The preparation transaction could not accept a new command.'};return copy[e.refusal.reason];
      }
      if(e?.refusal?.phase==='ACCEPTED_IDENTITY')return 'This run already has accepted command '+e.refusal.command_id+' at sequence '+e.refusal.agency_sequence+'. Open its original progress; do not prepare a replacement.';
      if(e?.serverCode==='BPAY_NEXT_PREPARATION_SCHEMA_UNAVAILABLE')return 'Preparation progress is unavailable until the database and Worker versions are aligned.';
      return null;
    }
    function table(headers, rows) { const t=el('table'), h=el('thead'), hr=el('tr'), b=el('tbody'); for(const label of headers) hr.append(el('th',label)); h.append(hr); for(const values of rows){const r=el('tr');for(const value of values){const c=el('td');if(value?.nodeType)c.append(value);else c.textContent=value===null?'Not recorded':String(value);r.append(c);}b.append(r);}t.append(h,b);return t; }
    async function loadCurrent(cursor) { const s=controller.snapshot(), epoch=renderEpoch; const page=await controller.page('CURRENT_WORK',{candidate_id:s.candidate_id,after_week:cursor?.after_week??null,after_work_id:cursor?.after_work_id??null,limit:100}); if(epoch!==renderEpoch)return;current=page;selection=new Map();controller.setCurrentCursor(cursor??null); }
    async function loadCases(cursor) { const s=controller.snapshot(),epoch=renderEpoch;const page=await controller.page('CURRENT_CASES',{candidate_id:s.candidate_id,after_case_id:cursor?.after_case_id??null,limit:100});if(epoch!==renderEpoch)return;cases=page;controller.setCaseCursor(cursor??null); }
    async function loadCaseComponents(case_id,cursor) { const s=controller.snapshot(),epoch=renderEpoch;const page=await controller.page('CASE_COMPONENTS',{candidate_id:s.candidate_id,case_id,after_component_ordinal:cursor?.after_component_ordinal??null,limit:100});if(epoch!==renderEpoch)return;components=page;caseSelection=new Map();controller.setComponentScope(case_id,cursor??null); }
    async function loadWorkers(cursor) { const s=controller.snapshot(),epoch=renderEpoch;const page=await controller.page(s.confirmed?'CHANNEL_WORKERS':'WORKERS',{run_id:s.run_id,...(s.confirmed?{pay_channel:s.pay_channel}:{}),after_candidate_id:cursor?.after_candidate_id??null,limit:100});if(epoch!==renderEpoch)return;workers=page;workersCursor=cursor??null;reviewObserved=true;preparationPending=false; }
    async function loadStatus(cursor) { const s=controller.snapshot(),epoch=renderEpoch;const different=statusScope&&(!same(statusScope.run_id,s.run_id)||!same(statusScope.worker_id,s.worker_id)||!same(statusScope.candidate_id,s.candidate_id));statusScope={run_id:s.run_id,worker_id:s.worker_id,candidate_id:s.candidate_id};status=null;returnedCash=null;frozenLine=null;shifts=null;breaks=null;usedRates=null;frozenWork=null;rateSchedule=null;if(different){lines=null;comparisons=null;netInput=null;}let page=await controller.page(s.pay_channel===null?'STATUS':'CHANNEL_STATUS',{run_id:s.run_id,...(s.pay_channel===null?{}:{pay_channel:s.pay_channel}),run_worker_id:s.worker_id,after_transfer_no:cursor?.after_transfer_no??null,limit:100});if(epoch!==renderEpoch)return;if(!same(page.header.candidate_id,s.candidate_id))fail();if(s.confirmed&&s.pay_channel===null&&s.pending===null){controller.qualifyWorkerChannel(page.header);page=await controller.page('CHANNEL_STATUS',{run_id:s.run_id,pay_channel:page.header.target_pay_channel,run_worker_id:s.worker_id,after_transfer_no:cursor?.after_transfer_no??null,limit:100});if(epoch!==renderEpoch)return;if(!same(page.header.candidate_id,s.candidate_id))fail();}status=page;statusCursor=cursor??null; }
    async function loadReturnedCash(cursor) { const s=controller.snapshot(),epoch=renderEpoch;const page=await controller.page('RETURN_CASH',{run_id:s.run_id,run_worker_id:s.worker_id,after_transfer_no:cursor?.after_transfer_no??null,limit:100});if(epoch!==renderEpoch)return;if(!status||!same(page.header.candidate_id,status.header.candidate_id))fail();returnedCash=page; }
    async function loadLines(cursor) { const s=controller.snapshot(),epoch=renderEpoch;const page=await controller.page('LINES',{run_worker_id:s.worker_id,after_line_no:cursor?.after_line_no??null,limit:100});if(epoch!==renderEpoch)return;lines=page; }
    function chooseCandidate() { try{requireActor(options);options.pickCandidate(picked=>{void act(async()=>{requireActor(options);if(!field(picked?.id,'uuid'))fail('REQUEST_INVALID');const different=!same(picked.id,controller.snapshot().candidate_id);controller.bind({candidate_id:picked.id});if(different){current=null;cases=null;components=null;selection=new Map();caseSelection=new Map();}await loadCurrent(controller.snapshot().current_cursor);});});}catch{void act(()=>fail('ACTOR_CHANGED'));} }
    async function loadShifts(line,cursor) { const epoch=renderEpoch;if(!frozenLine||!same(line.run_line_id,frozenLine.run_line_id)){frozenLine=line;shifts=null;breaks=null;usedRates=null;}const page=await controller.frozenPage('SHIFTS',{run_line_id:line.run_line_id,after_detail_no:cursor?.after_detail_no??null,limit:100});if(epoch!==renderEpoch)return;shifts=page;breaks=null; }
    async function loadBreaks(shift,cursor) { const epoch=renderEpoch;breaks=null;const page=await controller.frozenPage('BREAKS',{run_line_id:frozenLine.run_line_id,shift_detail_id:shift.shift_detail_id,after_break_no:cursor?.after_break_no??null,limit:100});if(epoch!==renderEpoch)return;breaks={...page,shift}; }
    async function loadUsedRates(cursor) { const epoch=renderEpoch;usedRates=null;const page=await controller.frozenPage('RATE_DETAILS',{run_line_id:frozenLine.run_line_id,after_bucket:cursor?.after_bucket??null,limit:100});if(epoch!==renderEpoch)return;usedRates=page; }
    async function loadRateSchedule(work,cursor) { const epoch=renderEpoch;frozenWork=work;rateSchedule=null;const page=await controller.frozenPage('RATE_SCHEDULE',{run_work_id:work.run_work_id,after_rate_family:cursor?.after_rate_family??null,after_rate_code:cursor?.after_rate_code??null,limit:100});if(epoch!==renderEpoch)return;rateSchedule=page; }
    async function applyReview(result) { if(result.phase==='REVIEW'){reviewObserved=true;preparationPending=false;await loadWorkers();}else{reviewObserved=false;preparationPending=true;workers=null;} }
    async function loadDrafts() { const s=controller.snapshot(),epoch=renderEpoch;const page=await controller.page('CHANNEL_DRAFTS',{run_id:s.run_id});if(epoch!==renderEpoch)return;drafts=page;if(s.pending===null)controller.setDrafts(page.rows); }
    async function openDraft(address) { controller.bindDraft(address);workers=null;status=null;returnedCash=null;lines=null;comparisons=null;frozenLine=null;shifts=null;breaks=null;usedRates=null;frozenWork=null;rateSchedule=null;netInput=null;statusScope=null;await loadWorkers(); }
    async function refresh() { let s=controller.snapshot();if(s.confirmed){await loadDrafts();s=controller.snapshot();}if(s.worker_id)await loadStatus();else if(s.run_id){if(s.confirmed){if(s.pay_channel!==null)await loadWorkers();}else if(s.selection_sealed||s.review_revision!==null||reviewObserved)await loadWorkers();if(!s.selection_sealed&&s.candidate_id&&!s.pending){await loadCurrent(s.current_cursor);if(s.case_id){await loadCases(s.case_cursor);await loadCaseComponents(s.case_id,s.component_cursor);}}} }
    function render() {
      if (!controller || !host.isConnected) return;
      const focusToken=focus.before();
      win.clearTimeout(progressTimer);
      const s=controller.snapshot(),locked=!capabilities?.environment_ready||readBusy||s.busy||s.pending!==null||(!s.selection_sealed&&!issueReadAvailable)||(typeof options.ownerReady==='function'&&options.ownerReady()!==true);
      const header=el('header');header.append(el('h2','Banking Pay'),button('Close',close,false,true));
      const body=el('div',undefined,'bpay-next-body');
      if(!s.selection_sealed){
        body.append(issueHost);
        if(!capabilities?.environment_ready){const notice=el('p','Payments are unavailable; try again.','bpay-next-alert');notice.setAttribute('role','alert');body.append(notice,button('Try again',loadCapabilities,readBusy||s.busy));}
        if(typeof options.ownerReady==='function'&&options.ownerReady()!==true)body.append(el('p','Banking Pay is paused.','bpay-next-alert'));
        host.replaceChildren(body);focus.after(focusToken);return;
      }
      if(capabilities?.test_mode)body.append(el('p','TEST MODE — no bank, provider or email action.','bpay-next-alert'));
      if(capabilityError||!capabilities?.environment_ready){const banner=el('p',capabilityError||'Payments are blocked because the Banking environment is unavailable or does not match this screen.','bpay-next-alert');banner.setAttribute('role','alert');body.append(banner);}
      else body.append(el('p','Banking environment: '+capabilities.worker_environment+'.'));
      body.append(button('Re-check Banking capabilities',loadCapabilities,readBusy||s.busy));
      body.append(el('p','Name check (Confirmation of Payee) is unavailable. Provider execution is disabled; funding availability is not verified.'));
      body.append(el('p','One selection produces separately addressable PAYE / Umbrella frozen Drafts. PAYE CSV and original advice are supported; Umbrella execution is not implemented in this thin view.'),el('p','Unsubmitted checkbox choices are not saved on Close; accepted selection and uncertain requests are retained.'));
      if(typeof options.ownerReady==='function'&&options.ownerReady()!==true)body.append(el('p','Banking ownership is unavailable or paused. Money controls are disabled.','bpay-next-alert'));
      if(error) {const a=el('p',error,'bpay-next-alert');a.setAttribute('role','alert');body.append(a);}
      if(s.pending){body.append(el('p','Uncertain request retained. Conflicting changes are disabled.'),button('Retry exact request',async()=>{const action=s.pending.action;const result=await controller.retry();if(action==='CSV_ISSUE')download(result);if(action==='REVIEW')await applyReview(result);else await refresh();},!capabilities?.environment_ready||readBusy||s.busy||(typeof options.ownerReady==='function'&&options.ownerReady()!==true)));}
      body.append(el('p',readBusy||s.busy?'Waiting for server…':'Server-owned amounts; no payment totals calculated here.'));
      if(!s.selection_sealed&&!s.worker_id){body.append(button('Choose Candidate',chooseCandidate,locked||(s.case_pages!=='0'&&!s.case_sealed),true));if(s.case_pages!=='0'&&!s.case_sealed)body.append(el('p','Seal this Candidate’s Case selection before choosing another Candidate.'));}
      if(!s.run_id){
        if(s.candidate_id)body.append(el('p','Candidate selected. Approval facts below do not guarantee payment eligibility.'));
        body.append(button('Start selection',async()=>{const run=controller.newId();await controller.mutate('CREATE',{run_id:run});},locked||!s.candidate_id));
        // Resume explicitly reviews the existing run; no new preparation identity.
        const [r,ri]=input('Resume run ID','text',resumeInput?.value||'');resumeInput=ri;body.append(r,el('p','Resume asks the server to Review this same sealed preparation; it does not create or prepare a replacement.'),button('Resume',async()=>{await applyReview(await controller.mutate('REVIEW',{run_id:resumeInput.value}));},locked),button('Open confirmed channel Drafts',async()=>{controller.bind({run_id:resumeInput.value});await loadDrafts();workers=null;},locked));
      }else{body.append(el('p','Run '+s.run_id),button('Refresh progress',refresh,locked));}
      if(current&&!s.selection_sealed&&(!status||status.header.run_status==='PREPARING')){
        const rows=current.rows.map(r=>{const accepted=s.accepted_page_work_ids.includes(r.work_id.toLowerCase());const check=el('input');check.type='checkbox';check.setAttribute('data-next-focus-key','work:'+r.work_id);check.checked=accepted||selection.has(r.work_id);check.disabled=locked||accepted||r.current_revision_id===null;check.setAttribute('aria-label','Include '+(r.timesheet_reference||r.work_id));check.addEventListener('change',()=>{if(check.checked)selection.set(r.work_id,{work_id:r.work_id,expected_revision_id:r.current_revision_id,mode:'ALL'});else selection.delete(r.work_id);});return[check,r.timesheet_reference,r.client_display_name,humanDate(r.week_ending_date),r.approval_state,r.approved_source_ex_vat===null?null:'£'+r.approved_source_ex_vat,r.position_ready?'Current approval applied':'Position pending / not approved'];});
        body.append(el('h3','Current approval facts — explicit Work selection'),table(['Include','Timesheet','Client','Week ending','Approval','Full approval ex VAT','Position fact'],rows));
        body.append(button('Add selected Work page',async()=>{await controller.mutate('WORK_PAGE',{run_id:s.run_id,page_no:String(BigInt(s.selection_pages)+1n),choices:Array.from(selection.values())});selection.clear();},locked||!s.run_id));
        if(!current.complete)body.append(button('Next Work page',()=>loadCurrent(current.next_cursor),locked));
        if(s.run_id)body.append(el('p','Accepted selected Work: '+s.selection_count),el('p','Accepted sealed Case choices from prior Candidates: '+s.prior_case_selected_count),button('Prepare selected Work',async()=>{await controller.mutate('SEAL_ENQUEUE',{run_id:s.run_id,command_id:controller.newId(),expected_pages:s.selection_pages,expected_count:s.selection_count});current=null;cases=null;components=null;workers=null;reviewObserved=false;preparationPending=true;await loadWorkers();},locked||(s.selection_count==='0'&&s.case_selected_count==='0'&&s.prior_case_selected_count==='0')||(s.case_pages!=='0'&&!s.case_sealed)));
      }
      if(s.run_id&&s.candidate_id&&!s.selection_sealed){
        body.append(button('Current Case facts',()=>loadCases(s.case_cursor),locked),el('p','Case facts are not an allocation or collection approval. Only explicitly submitted selected / excluded components enter this manifest.'));
        if(cases){body.append(el('h3','Current Case facts'),table(['Case','Kind','Tax treatment','State','Approved source principal','Recovered source principal','Actions'],cases.rows.map(c=>[c.case_id,c.case_kind==='LOAN'?'Payment Advance':c.case_kind,c.tax_treatment,c.status,'£'+c.principal_approved,'£'+c.principal_recovered,c.status==='PAUSED'?el('span','Paused — not collection approved'):button('Open Case components',()=>loadCaseComponents(c.case_id),locked||s.case_sealed,false,'case:'+c.case_id)])));if(!cases.complete)body.append(button('Next Case page',()=>loadCases(cases.next_cursor),locked));}
        if(components){const currentOpen=cases?.rows.some(c=>same(c.case_id,s.case_id)&&c.status==='OPEN')===true;const allAccepted=components.rows.length>0&&components.rows.every(c=>s.accepted_page_component_ids.includes(c.case_component_id.toLowerCase()));body.append(el('h3','Explicit selected / excluded Case components'),table(['Select','Kind','Tax treatment','Instruction','Payroll stage','Approved source','Resolution fact'],components.rows.map(c=>{const acceptedIndex=s.accepted_page_component_ids.indexOf(c.case_component_id.toLowerCase()),accepted=acceptedIndex!==-1;const check=el('input');check.type='checkbox';check.setAttribute('data-next-focus-key','case-component:'+c.case_component_id);check.checked=accepted?s.accepted_page_component_selected[acceptedIndex]:caseSelection.get(c.case_component_id)===true;check.disabled=locked||s.case_sealed||accepted||!currentOpen;check.setAttribute('aria-label','Select Case component '+c.case_component_id);check.addEventListener('change',()=>caseSelection.set(c.case_component_id,check.checked));return[check,c.case_kind==='LOAN'?'Payment Advance':c.case_kind,c.tax_treatment,c.instruction_kind,c.payroll_stage,'£'+c.approved_source_ex_vat,c.resolution_state];})));
          body.append(button('Add selected / excluded Case page',async()=>{await controller.mutate('CASE_PAGE',{run_id:s.run_id,candidate_id:s.candidate_id,selection_revision:'1',page_no:String(BigInt(s.case_pages)+1n),request_id:controller.newId(),component_ids:components.rows.map(c=>c.case_component_id),selected:components.rows.map(c=>caseSelection.get(c.case_component_id)===true)});caseSelection.clear();},locked||s.case_sealed||components.rows.length===0||allAccepted||!currentOpen));
          if(!components.complete)body.append(button('Next Case component page',()=>loadCaseComponents(s.case_id,components.next_cursor),locked||!allAccepted||s.case_sealed));
        }
        if(s.case_pages!=='0')body.append(el('p','Accepted Case components: '+s.case_items+' / selected '+s.case_selected_count+' / excluded '+s.case_excluded_count),s.case_sealed?el('p','Case manifest sealed.'):button('Seal Case selection',()=>controller.mutate('CASE_SEAL',{run_id:s.run_id,candidate_id:s.candidate_id,selection_revision:'1',expected_pages:s.case_pages,expected_items:s.case_items}),locked));
      }
      if(s.run_id&&s.selection_sealed&&!s.confirmed){if(!reviewObserved&&s.review_revision===null)body.append(el('p',preparationPending?'Preparation is still pending. Choose Review preparation again after background processing has progressed.':'Preparation accepted. Choose Review preparation to ask the server whether it is complete.'));body.append(button('Review preparation',async()=>{await applyReview(await controller.mutate('REVIEW',{run_id:s.run_id}));},locked));}
      const addresses=drafts?.rows??s.drafts;
      if(s.confirmed&&addresses.length){body.append(el('h3','Frozen channel Drafts'),el('p','Each address opens this same preparation for one frozen pay channel; Source and ordinary Work are not separate Drafts.'));
        for(const address of addresses)body.append(button('Open '+(address.pay_channel==='PAYE'?'PAYE':'Umbrella')+' Draft',()=>openDraft(address),locked,false,'draft:'+address.pay_channel));
        if(s.pay_channel!==null)body.append(el('p','Selected Draft channel: '+(s.pay_channel==='PAYE'?'PAYE':'Umbrella')));
      }
      if(workers){body.append(el('h3',s.confirmed?(s.pay_channel==='PAYE'?'PAYE Draft Candidates':'Umbrella Draft Candidates'):'Frozen preparation progress'),table(['Candidate','State','Frozen gross ex VAT','Review'],workers.rows.map(r=>[button('Open worker',async()=>{controller.bind({worker_id:r.run_worker_id,candidate_id:r.candidate_id});await loadStatus();},locked,false,'worker:'+r.run_worker_id),r.worker_status,r.frozen_ex_vat===null?null:'£'+r.frozen_ex_vat,r.review_issue_code===null?'No issue recorded':'Review required'])));if(!workers.complete)body.append(button('Next worker page',()=>loadWorkers(workers.next_cursor),locked));if(s.can_confirm&&s.review_revision)body.append(button('Confirm frozen Draft',async()=>{await controller.mutate('CONFIRM',{run_id:s.run_id,review_revision:s.review_revision});await refresh();},locked));}
      if(status){const h=status.header;body.append(el('h3','Accepted worker state'),el('p',h.worker_status+' / '+h.target_pay_channel),el('p','Frozen gross ex VAT: '+(h.frozen_gross_ex_vat===null?'Not available':'£'+h.frozen_gross_ex_vat)),el('p','Accepted payroll net: '+(h.entered_paye_net===null?'Not recorded':'£'+h.entered_paye_net)),el('p','Accepted recoveries: '+(h.accepted_recoveries===null?'Not recorded':'£'+h.accepted_recoveries)),el('p','Accepted bank cash: '+(h.cash_amount===null?'Not recorded':'£'+h.cash_amount)),el('p',h.net_pending?'NET request pending; old accepted projection remains shown.':'Accepted projection current for this worker.'));
        body.append(el('p',reservationDescription(h)),el('p','Reservation facts are shown once: the confirmed obligation while building, then individual original transfers. Each page is a live read; amounts are not summed across pages.'));
        body.append(button('Frozen payment lines',()=>loadLines(),locked),button('Check later approval flag',async()=>{comparisons=await controller.page('REVISION_COMPARISON',{run_worker_id:s.worker_id,after_work_id:null,limit:100});},locked));
        if(draftActionsAllowed(h)&&h.target_pay_channel==='PAYE'){
          const [n,ni]=input('Enter PAYE payroll net (GBP, exact pence)','text',netInput?.value||'');netInput=ni;ni.inputMode='decimal';body.append(n,button('Accept PAYE net',async()=>{const args={command_id:controller.newId(),run_worker_id:s.worker_id,entered_paye_net:netInput.value};if(h.case_selection_revision!=='0')args.expected_projection_revision=h.net_projection_revision;await controller.mutate('PAYE_NET',args);await loadStatus();},locked));
          body.append(button('Build original transfer',async()=>{await controller.mutate('TRANSFER_BEGIN',{command_id:controller.newId(),run_worker_id:s.worker_id});await loadStatus();},locked||h.net_pending||h.projection_id===null));
        }
        if(draftActionsAllowed(h)&&(h.target_pay_channel==='PAYE'||(s.pay_channel==='UMBRELLA'&&h.worker_status==='READY'))){
          if(h.target_pay_channel==='UMBRELLA')body.append(el('p','Umbrella execution is not implemented here. Only the server can permit whole-Candidate cancellation of a no-case, pre-execution Draft.'));
          body.append(button('Cancel this unpaid Candidate Draft',async()=>{const args={command_id:controller.newId(),run_worker_id:s.worker_id};if(s.pay_channel!==null){args.run_id=s.run_id;args.pay_channel=s.pay_channel;}await controller.mutate('CANCEL_REQUEST',args);await loadStatus();},locked));
        }
        if(h.worker_status==='CANCELLING')body.append(el('p','Whole-Candidate cancellation is in progress; released page counts are not a completed cancellation.'));
        body.append(el('h3','Current payment status'),el('p','Bank details are changed in the Candidate record, not in this payment view. Reopening this run retains its accepted state.'));
        if(typeof options.openCandidateRecord==='function')body.append(button('Open Candidate record for bank details',()=>openCandidateRecord(options,h.candidate_id,close),locked));
        body.append(button('Returned money in this batch',()=>loadReturnedCash(),locked));
        body.append(table(['Transfer','State','Execution','Frozen cash','Remaining reservation','Actions'],status.rows.map(t=>{const actions=el('span');if(h.target_pay_channel==='PAYE'&&t.execution_kind==='BANK'&&t.original_transfer_id===null&&['MEMBERS_READY','DRAFT','SCHEDULED','ISSUED_CSV'].includes(t.status))actions.append(button(t.status==='ISSUED_CSV'?'Retrieve exact CSV':'Issue original CSV',async()=>{const id=s.transfer_id===t.transfer_id&&s.instruction_id?s.instruction_id:controller.newId();const result=await controller.mutate('CSV_ISSUE',{instruction_id:id,transfer_id:t.transfer_id});download(result);await loadStatus();},locked,false,'csv:'+t.transfer_id));if(t.execution_kind==='INTERNAL_ZERO')actions.append(el('span','No external cash file'));return[t.transfer_id,t.status,t.execution_kind,'£'+t.cash_amount,reservationDescription(t),actions];})));
        if(!status.complete)body.append(button('Next transfer page',()=>loadStatus(status.next_cursor),locked));
        if(returnedCash){
          body.append(el('h3','Returned money — this Candidate in this batch'),el('p','These are returned-cash records, not new earnings or a new payroll calculation. Available cash is not permission to send it: the destination still needs the existing bank safety approval.'));
          const labels={RETURN_POSTING_PENDING:'Return recorded — posting pending',UNSUPPORTED_BENEFICIARY:'Different legal payee — repayment review required',REISSUE_REQUESTED:'Repayment preparation requested',CASH_RESERVED:'Reserved for repayment',CASH_REPAID:'Repayment recorded — see transfer status',CASH_AVAILABLE:'Available for repayment review'};
          const cash=v=>v===null?'Not yet available':'£'+v;
          body.append(table(['Original transfer','Return state','Returned cash owed','Reserved','Repayment recorded','Available'],returnedCash.rows.map(r=>[r.original_transfer_id,labels[r.action_state],cash(r.amount_owed),cash(r.amount_held),cash(r.amount_reissued_paid),cash(r.amount_available)])));
          if(returnedCash.rows.length===0)body.append(el('p',returnedCash.complete?'No returned money on this page.':'No returned money in this scanned window; continue to the next page.'));
          if(!returnedCash.complete)body.append(button('Next returned-money page',()=>loadReturnedCash(returnedCash.next_cursor),locked));
        }
      }
      if(lines){body.append(el('h3','Frozen paid differences — never current rates'),table(['Component','Date','Captured revision','Source difference','Ex VAT','VAT','Including VAT','Captured detail'],lines.rows.map(r=>[r.component_key,humanDate(r.work_date),r.captured_revision_id,'£'+r.source_consumed_ex_vat,'£'+r.frozen_ex_vat,'£'+r.frozen_vat,'£'+r.frozen_inc_vat,button('Open frozen shift details',()=>loadShifts(r),locked,false,'line:'+r.run_line_id)])));if(!lines.complete)body.append(button('Next frozen lines',()=>loadLines(lines.next_cursor),locked));}
      if(frozenLine){body.append(el('h3','Captured shift evidence'),el('p','Captured revision '+frozenLine.captured_revision_id+'; selected payment difference £'+frozenLine.source_consumed_ex_vat+'. Approved shift quantities and segment amounts below are not additional payment.'),button('Used frozen bucket rates',()=>loadUsedRates(),locked));}
      if(shifts){body.append(table(['Date','Local shift','Recorded start','Recorded end','Overnight','Submitted minutes','Approved minutes','Approved hours','Approved segment ex VAT','Excluded from pay','DAY','NIGHT','SAT','SUN','BH','Recorded label','Break detail'],shifts.rows.map(r=>[humanDate(r.work_date),clockPair(r.shift_start_local,r.shift_end_local),humanTimestamp(r.shift_start_at),humanTimestamp(r.shift_end_at),r.shift_overnight===null?null:r.shift_overnight?'Yes':'No',r.submitted_minutes,r.approved_minutes,r.approved_hours,r.segment_pay_ex_vat===null?null:'£'+r.segment_pay_ex_vat,r.pay_excluded===null?null:r.pay_excluded?'Yes':'No',r.hours_day,r.hours_night,r.hours_sat,r.hours_sun,r.hours_bh,r.detail_label,button('Open frozen breaks',()=>loadBreaks(r),locked,false,'shift:'+r.shift_detail_id)])));if(shifts.rows.length===0)body.append(el('p','No recorded shifts on this frozen page.'));if(!shifts.complete)body.append(button('Next frozen shifts',()=>loadShifts(frozenLine,shifts.next_cursor),locked));}
      if(breaks){body.append(el('h3','Frozen breaks — shift '+breaks.shift.detail_no),table(['Local break','Recorded start','Recorded end','Break minutes'],breaks.rows.map(r=>[r.break_start_local===null?'Duration only — no invented clock':clockPair(r.break_start_local,r.break_end_local),humanTimestamp(r.break_start_at),humanTimestamp(r.break_end_at),r.break_minutes])));if(breaks.rows.length===0)body.append(el('p','No recorded breaks on this frozen page.'));if(!breaks.complete)body.append(button('Next frozen breaks',()=>loadBreaks(breaks.shift,breaks.next_cursor),locked));}
      if(usedRates){body.append(el('h3','Used frozen bucket rates'),table(['Bucket','Approved hours','Source pay rate'],usedRates.rows.map(r=>[r.bucket,r.approved_hours,r.source_pay_rate===null?null:'£'+r.source_pay_rate])));if(usedRates.rows.length===0)body.append(el('p','No recorded used rates on this frozen page.'));if(!usedRates.complete)body.append(button('Next used rates',()=>loadUsedRates(usedRates.next_cursor),locked));}
      if(comparisons){body.append(el('p',comparisons.rows.some(r=>r.newer_approval_available)?'A later approval exists. This frozen Draft is unchanged.':'No later approval on this comparison page.'),table(['Captured revision','Later approval','Captured Work rates'],comparisons.rows.map(r=>[r.captured_revision_id,r.newer_approval_available?'Available — not used for this Draft':'Not recorded',button('Open available frozen rates',()=>loadRateSchedule(r),locked,false,'work-rates:'+r.run_work_id)])));if(!comparisons.complete)body.append(button('Next comparison page',async()=>{comparisons=await controller.page('REVISION_COMPARISON',{run_worker_id:s.worker_id,...comparisons.next_cursor,limit:100});},locked));}
      if(rateSchedule){body.append(el('h3','Available frozen contract/channel rates'),el('p','Captured revision '+frozenWork.captured_revision_id+' — available rates are evidence, not a new price calculation.'),table(['Family','Code','Unit','PAYE rate','Umbrella rate','Charge rate'],rateSchedule.rows.map(r=>[r.rate_family,r.rate_code,r.unit_label,r.paye_rate===null?null:'£'+r.paye_rate,r.umbrella_rate===null?null:'£'+r.umbrella_rate,r.charge_rate===null?null:'£'+r.charge_rate])));if(rateSchedule.rows.length===0)body.append(el('p','No available rates on this frozen page.'));if(!rateSchedule.complete)body.append(button('Next available rates',()=>loadRateSchedule(frozenWork,rateSchedule.next_cursor),locked));}
      if(s.instruction_id)body.append(button('Open original frozen advice',()=>printAdvice(options,s.instruction_id,win),locked));
      host.replaceChildren(header,body);focus.after(focusToken);
      // Only one bounded factual progress read. No enqueue/claim/step/REVIEW
      // mutation, current Work census or financial rebuild in this timer.
      const progressing=s.selection_sealed&&((!s.worker_id&&workers?.rows.some(r=>r.worker_status==='PREPARING'))||(s.worker_id&&status&&(status.header.net_pending||['PREPARING','CANCELLING'].includes(status.header.worker_status)||status.rows.some(r=>['BUILDING','INTERNAL_PROCESSING'].includes(r.status)))));
      if(!locked&&progressing&&doc.visibilityState!=='hidden')progressTimer=win.setTimeout(()=>{if(!host.isConnected||doc.visibilityState==='hidden')return;void act(()=>s.worker_id?loadStatus(statusCursor):loadWorkers(workersCursor));},2000);
    }
    function download(result){const blob=new Blob([result.csv_text],{type:'text/csv;charset=utf-8'});const url=win.URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=result.file_name;a.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),0);}
    controller=createController({actorId:options.actorId,storage:options.storage||win.sessionStorage,uuid:options.uuid||(()=>win.crypto.randomUUID()),transport,onChange:render});
    win.addEventListener('cloudtms:bpay-next-owner-changed',render);
    win.addEventListener('beforeunload',beforeUnload);
    doc.addEventListener('visibilitychange',render);
    sheet=Object.freeze({focus:()=>readWindow?.focus(),close,controller});
    readWindow=options.showReadWindow({title:'Banking Pay',content:host,beforeClose,canFocus:()=>same(options.currentActorId(),options.actorId)&&options.ownerReady()===true,onDismiss:dismiss,onMount:()=>{
      render();if(!started){started=true;void act(async()=>{await loadCapabilities();if(capabilities?.environment_ready&&controller.snapshot().run_id)await refresh();});}
    }});
    return sheet;
  }
  async function printAdvice(options,instructionId,win) {
    if(!field(instructionId,'uuid'))fail('REQUEST_INVALID');
    requireActor(options);
    const child=win.open('about:blank','_blank');if(!child)fail('PRINT_WINDOW_BLOCKED');
    child.opener=null;child.document.open();child.document.write('<!doctype html><title>Loading frozen advice</title><p>INCOMPLETE — loading frozen payment advice.</p>');
    const controller=new AbortController();let reader,timer,response,completed=false;
    const abort=()=>{void reader?.cancel().catch(()=>{});};controller.signal.addEventListener('abort',abort,{once:true});
    try{
      timer=win.setTimeout(()=>controller.abort(),60000);
      response=await options.authFetch(options.api('/api/banking/pay/next/advice/'+instructionId),{method:'GET',auth401Mode:'return',signal:controller.signal,redirect:'error',headers:{'X-CloudTMS-Banking-Environment':environment(options)}});
      requireActor(options);
      if(!response.ok||!response.body||!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')||'')||response.headers.get('x-bpay-next-advice-template')!=='original-csv-html-v1')fail();
      child.document.open();child.document.write('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">');
      reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let tail='';
      // Browser/network framing may coalesce several 16KiB server writes.
      // Bound each read and split writes, rather than require frame equality.
      while(true){requireActor(options);if(child.closed||controller.signal.aborted)fail();const item=await reader.read();requireActor(options);if(controller.signal.aborted)fail();if(item.done)break;if(item.value.byteLength>LIMITS.bytes)fail('RESPONSE_TOO_LARGE');for(let offset=0;offset<item.value.byteLength;offset+=16384){const text=decoder.decode(item.value.subarray(offset,offset+16384),{stream:true});child.document.write(text);tail=(tail+text).slice(-512);}}
      const rest=decoder.decode();child.document.write(rest);tail+=rest;if(!tail.includes('data-advice-state="complete"')||tail.includes('data-advice-state="failed"'))fail();child.document.close();dates.formatAdvice(child.document);completed=true;
    }finally{win.clearTimeout(timer);controller.abort();controller.signal.removeEventListener('abort',abort);await reader?.cancel().catch(()=>{});reader?.releaseLock();if(!reader)await response?.body?.cancel().catch(()=>{});if(!completed&&!child.closed){child.document.write('<p style="color:#900">INCOMPLETE: advice could not be loaded. Do not use this as complete payment advice.</p>');child.document.close();}}
  }
  return Object.freeze({ open, close, createTransport, createController, createChoiceSubmission, printAdvice, openCandidateRecord, requestBody, capabilityReceipt, Failure, LIMITS });
});
