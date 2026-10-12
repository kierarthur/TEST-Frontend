/* Thin NEXT Office caller. Policy X: no calculator, old Workbench, drain,
 * provider or current-fact substitution after Draft. Money remains text.
 * A dispatched mutation is journalled before network; unknown outcomes allow
 * only an explicit SAME-byte retry. Closing the sheet never clears it.
 */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./bpay-next-dates.js') : root.CloudTMSBpayNextDates, typeof module === 'object' && module.exports ? require('./bpay-next-ui.js') : root.CloudTMSBpayNextUi, typeof module === 'object' && module.exports ? require('./bpay-next-case-preview.js') : root.CloudTMSBpayNextCasePreview);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CloudTMSBpayNextOffice = api;
})(typeof globalThis === 'object' ? globalThis : this, function (dates, ui, cases) {
  'use strict';
  const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const INT = /^(?:0|[1-9]\d{0,18})$/;
  const MONEY = /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,6})?$/;
  const encoder = new TextEncoder();
  const LIMITS = Object.freeze({ page: 100, bytes: 128 * 1024, journalBytes: 65536, timeout: 12000 });
  const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  // DY-08: exact closed Daily refusal copy for the existing Timesheet authorisation notices.
  function dailyHoursOnlyRefusal(value) {
    const body = value?.json || value?.response || value;
    const expected = 'BPAY_NEXT_DAILY_HOURS_ONLY_VIOLATION';
    if (!record(body) || body.ok === true || body.success === true
        || ![body.code, body.error_code, body.error].includes(expected)) return null;
    return { code: expected, error_code: expected, retryable: false,
      message: 'This Daily Timesheet must contain hours only; correct it before authorising.' };
  }

  // DY-10: native current-Daily evidence, never a payment calculation or approval.
  function dailyProcessingState(details) {
    const ts=details?.timesheet, tf=details?.tsfin, fact=details?.daily_processing;
    if(!record(ts)||ts.sheet_scope!=='DAILY')return null;
    const unavailable={key:'UNAVAILABLE',label:'Could not check this Daily Timesheet.',action:'Refresh',retry:false};
    const version=ts.version;
    if(!UUID.test(ts.timesheet_id||'')||ts.is_current!==true||!Number.isSafeInteger(version)||version<1
      ||!same(details.current_timesheet_id,ts.timesheet_id)||Number(details.current_version)!==version||details.was_stale===true
      ||!record(fact)||Object.keys(fact).sort().join(',')!=='current_version,status,timesheet_id'
      ||!same(fact.timesheet_id,ts.timesheet_id)||fact.current_version!==version
      ||!['NONE','PENDING','FAILED','UNAVAILABLE'].includes(fact.status))return unavailable;
    const stamp=v=>typeof v==='string'&&v.trim()!==''&&Number.isFinite(Date.parse(v));
    const exactTf=record(tf)&&same(tf.timesheet_id,ts.timesheet_id)&&tf.timesheet_version===version&&tf.is_current===true&&tf.is_stale===false;
    const approved=exactTf&&stamp(ts.authorised_at_server)&&stamp(tf.authorised_at_utc);
    if(stamp(ts.revoked_at)||ts.status==='REVOKED')return {key:'WITHDRAWN',label:'Authorisation withdrawn.',action:null,retry:false};
    if(stamp(ts.archived_at_utc))return {key:'ARCHIVED',label:'This Daily Timesheet is archived.',action:null,retry:false};
    if(fact.status==='UNAVAILABLE')return unavailable;
    if(fact.status==='FAILED')return {key:'FAILED',label:'Pay for this Daily shift could not be worked out.',action:'Retry',retry:true,retainedApproval:approved};
    if(fact.status==='PENDING')return {key:'PENDING',label:'Updating…',action:'Refresh',retry:false,retainedApproval:approved};
    if(!record(tf)||Object.keys(tf).length===0)return {key:'UNPREPARED',label:'Pay for this Daily shift has not been worked out yet.',action:'Retry',retry:true};
    if(!exactTf)return {key:'DAMAGED',label:'This Daily Timesheet needs to be checked.',action:'Refresh',retry:false};
    const stages=['UNASSIGNED','CLIENT_UNRESOLVED','RATE_MISSING','PAY_CHANNEL_MISSING','READY_FOR_HR','READY_FOR_INVOICE','PENDING_AUTH','AWAITING_MANUAL_SIGNATURE','UNPROCESSED'];
    if(!stages.includes(tf.processing_status))return {key:'DAMAGED',label:'This Daily Timesheet needs to be checked.',action:'Refresh',retry:false};
    if(tf.has_rate_issue===true||tf.processing_status==='RATE_MISSING')return {key:'RATE_MISSING',label:'The rate needs to be set before authorisation.',action:null,retry:false};
    if(tf.has_pay_channel_issue===true||tf.processing_status==='PAY_CHANNEL_MISSING')return {key:'PAY_CHANNEL_MISSING',label:'The pay channel needs to be set before authorisation.',action:null,retry:false};
    if(!approved)return {key:'NOT_AUTHORISED',label:'Not authorised.',action:null,retry:false};
    const hours=tf.total_hours;
    if(!(typeof hours==='number'&&Number.isFinite(hours)&&hours>=0||typeof hours==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(hours)))return {key:'DAMAGED',label:'This Daily Timesheet needs to be checked.',action:'Refresh',retry:false};
    const zero=hours===0||typeof hours==='string'&&/^0(?:\.0+)?$/.test(hours);
    return {key:zero?'AUTHORISED_ZERO_HOURS':'AUTHORISED',label:zero?'Authorised · 0.00 hours':'Authorised.',action:null,retry:false};
  }
  function mountDailyProcessingNotice({document:doc,host,details,current,onRetry,onRefresh,requestState={}}) {
    const state=dailyProcessingState(details);if(!state||!current())return null;
    const pending=requestState;
    pending.busy=pending.busy===true;pending.unknown=pending.unknown===true;
    pending.result=typeof pending.result==='string'?pending.result:'';
    const paint=()=>{
      if(!current())return;
      const line=doc.createElement('span');line.className='bpay-next-daily-status';line.textContent=state.label;
      line.setAttribute('role',['FAILED','DAMAGED','UNAVAILABLE'].includes(state.key)?'alert':'status');
      const nodes=[line];
      const tone=state.key==='FAILED'?'danger':state.key==='PENDING'?'info':state.key.startsWith('AUTHORISED')?'success':null;
      if(tone){
        const badge=state.key==='FAILED'?doc.createElement('span'):line;
        badge.className+=' mytms-status-badge mytms-status-badge--'+tone;
        if(state.key==='FAILED'){badge.textContent='Failed';nodes.unshift(badge);}
      }
      if(['FAILED','UNPREPARED','DAMAGED','UNAVAILABLE'].includes(state.key)){
        const amount=doc.createElement('span');amount.className='bpay-next-daily-amount';amount.textContent='—';
        amount.setAttribute('aria-label','Pay amount unavailable');nodes.push(amount);
      }
      const action=pending.unknown?'Refresh':state.action;
      if(action){
        const button=doc.createElement('button');button.type='button';button.className='btn';
        button.textContent=action;button.disabled=pending.busy;
        button.onclick=async()=>{
          if(pending.busy||!current())return;
          pending.busy=true;pending.unknown=true;paint();
          let acknowledged=false;
          try{
            if(action==='Retry'){
              const reply=await onRetry();if(!current())return;
              if(!record(reply)||reply.enqueued!==1)throw Error('Unconfirmed');
              acknowledged=true;pending.result='Processing requested.';paint();
            }
            const refreshed=await onRefresh();
            if(refreshed===false)throw Error('Refresh unavailable');
          }catch{
            pending.unknown=true;
            pending.result=action==='Retry'&&!acknowledged
              ?'Could not confirm the processing request; refresh before trying again.'
              :'Could not refresh this Daily Timesheet.';
          }finally{
            pending.busy=false;pending.paint?.();
          }
        };
        nodes.push(button);
      }
      if(pending.result){
        const message=doc.createElement('span');message.className='bpay-next-daily-result';
        message.setAttribute('role',pending.result.startsWith('Could not ')?'alert':'status');message.textContent=pending.result;nodes.push(message);
      }
      host.replaceChildren(...nodes);host.hidden=false;
    };
    pending.paint=paint;paint();return Object.freeze({state});
  }

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
    CASE_CREATE:{command_id:'uuid',...cases.CASE_INPUT_SCHEMA,preview_token:'caseToken'},
    CASE_PAUSE:{command_id:'uuid',case_id:'uuid',expected_case_revision:'positive',reason:'pauseReason'},
    CASE_RESUME:{command_id:'uuid',case_id:'uuid',expected_case_revision:'positive',reason:'pauseReason'},
    CASE_EDIT:{command_id:'uuid',case_id:'uuid',expected_case_revision:'positive',...cases.CASE_INPUT_SCHEMA,preview_token:'caseEditToken'},
    PREPARATION_DISCARD:{command_id:'uuid',run_id:'uuid',expected_preparation_revision:'integer'},
    WAKE:{run_id:'uuid'},
  EXCLUSION_PAGE:{run_id:'uuid',page_no:'positive',excluded_work_ids:'emptyIds',excluded_candidate_ids:'emptyIds'},
  MATCHING_PAGE:{run_id:'uuid',page_no:'positive',after_member_no:'positive?'},

    CREATE: { run_id: 'uuid', command_id: 'uuid', descriptor: 'descriptor' },
    PAYE_GUARD_DECISION:{run_id:'uuid',command_id:'uuid',descriptor:'descriptor',decision:'guardDecision',reason:'guardReason?'},
    WORK_PAGE: { run_id: 'uuid', page_no: 'positive', choices: 'choices' },
    COMPONENT_PAGE: {run_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',page_no:'positive',approved_line_ids:'ids'},
    COMPONENT_SEAL: {run_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',expected_pages:'positive',expected_count:'positive'},
    CASE_PAGE: { run_id: 'uuid', candidate_id: 'uuid', selection_revision: 'positive', page_no: 'positive', request_id: 'uuid', component_ids: 'ids', selected: 'booleans' },
    CASE_SEAL: { run_id: 'uuid', candidate_id: 'uuid', selection_revision: 'positive', expected_pages: 'positive', expected_items: 'positive' },
    SEAL_ENQUEUE: { run_id: 'uuid', command_id: 'uuid', expected_pages: 'integer', expected_count: 'integer' },
    WORKER_REPREPARE:{command_id:'uuid',run_worker_id:'uuid',expected_preparation_revision:'positive'},
    WORKER_RELEASE:{command_id:'uuid',run_worker_id:'uuid',expected_preparation_revision:'positive'},
    REVIEW: { run_id: 'uuid' }, CONFIRM: { run_id: 'uuid', review_revision: 'positive' },
    PAYE_NET: { command_id: 'uuid', run_worker_id: 'uuid', entered_paye_net: 'cash' },
    TRANSFER_BEGIN: { command_id: 'uuid', run_worker_id: 'uuid' },
    CANCEL_REQUEST: { command_id: 'uuid', run_worker_id: 'uuid' },
    CSV_ISSUE: { instruction_id: 'uuid', transfer_id: 'uuid' }
  };
  const RECEIPT = {
    CASE_CREATE:{case_id:'uuid',command_id:'uuid',sequence:'positive',phase:'caseCreatePhase',replay:'boolean'},
    CASE_PAUSE:{case_id:'uuid',candidate_id:'uuid',command_id:'uuid',action:'pauseAction',sequence:'positive',expected_case_revision:'positive',phase:'pauseAdmissionPhase',replay:'boolean'},
    CASE_RESUME:{case_id:'uuid',candidate_id:'uuid',command_id:'uuid',action:'pauseAction',sequence:'positive',expected_case_revision:'positive',phase:'pauseAdmissionPhase',replay:'boolean'},
    CASE_EDIT:{case_id:'uuid',command_id:'uuid',sequence:'positive',case_revision:'positive',rule_id:'uuid',phase:'caseEditPhase',replay:'boolean'},
    PREPARATION_DISCARD:{command_id:'uuid',run_id:'uuid',sequence:'positive?',phase:'discardReceiptPhase',expected_candidates:'integer',completed_candidates:'integer',removed_candidates:'integer',already_removed_candidates:'integer',blocked_candidates:'integer',replay:'boolean'},
    WAKE:{run_id:'uuid',accepted:'boolean',throttled:'boolean'},
  EXCLUSION_PAGE:{run_id:'uuid',page_no:'positive',item_count:'integer',complete:'boolean',replay:'boolean'},
  MATCHING_PAGE:{run_id:'uuid',page_no:'positive',item_count:'integer',selection_count:'integer',selected_candidate_count:'integer',replay:'boolean',skipped:'skipped',complete:'boolean',next_after_member_no:'positive?'},

    CREATE: { run_id: 'uuid', status: 'run', selection_state: 'selection', selection_count: 'integer', selected_candidate_count: 'integer', official_pay_date: 'date', command_id:'uuid', agency_sequence:'positive?', choice_work_count:'integer', choice_case_count:'integer', empty:'boolean', replay:'boolean' },
    PAYE_GUARD_DECISION:{run_id:'uuid',status:'run',selection_state:'selection',selection_count:'integer',selected_candidate_count:'integer',official_pay_date:'date',command_id:'uuid',agency_sequence:'positive?',choice_work_count:'integer',choice_case_count:'integer',empty:'boolean',replay:'boolean',decision:'guardDecision',channel_scope:'guardChannel'},
    WORK_PAGE: { run_id: 'uuid', page_no: 'positive', item_count: 'positive', selection_count: 'integer', selected_candidate_count: 'integer', replay: 'boolean', skipped: 'skipped' },
    COMPONENT_PAGE: {run_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',page_no:'positive',item_count:'positive',component_count:'positive',replay:'boolean'},
    COMPONENT_SEAL: {run_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',sealed:'true',component_count:'positive',replay:'boolean'},
    CASE_PAGE: { run_id: 'uuid', candidate_id: 'uuid', selection_revision: 'positive', page_no: 'positive', item_count: 'positive', replay: 'boolean' },
    CASE_SEAL: { run_id: 'uuid', candidate_id: 'uuid', selection_revision: 'positive', sealed: 'true', selected_count: 'integer', excluded_count: 'integer', replay: 'boolean' },
    SEAL_ENQUEUE: { run_id: 'uuid', command_id: 'uuid', agency_sequence: 'positive', selection_count: 'integer', replay: 'boolean' },
    WORKER_REPREPARE:{command_id:'uuid',run_id:'uuid',run_worker_id:'uuid',action:'workerAction',expected_preparation_revision:'positive',preparation_revision:'positive',review_revision:'positive',agency_sequence:'positive',phase:'workerActionPhase',replay:'boolean'},
    WORKER_RELEASE:{command_id:'uuid',run_id:'uuid',run_worker_id:'uuid',action:'workerAction',expected_preparation_revision:'positive',preparation_revision:'positive',review_revision:'positive',agency_sequence:'positive',phase:'workerActionPhase',replay:'boolean'},
    REVIEW: { run_id: 'uuid', phase: 'review', reason: 'reviewReason?', review_revision: 'integer', all_ready: 'boolean?', replay: 'boolean' },
    CONFIRM: { run_id: 'uuid', phase: 'draft', review_revision: 'positive', replay: 'boolean', drafts: 'drafts' },
    PAYE_NET: { command_id: 'uuid', run_worker_id: 'uuid', sequence: 'positive', request_no: 'positive', phase: 'net', replay: 'boolean' },
    TRANSFER_BEGIN: { command_id: 'uuid', run_worker_id: 'uuid', sequence: 'positive', transfer_id: 'uuid', phase: 'transfer', replay: 'boolean' },
    CANCEL_REQUEST: { command_id: 'uuid', run_worker_id: 'uuid', sequence: 'positive', phase: 'cancel', cursor: 'positive?', released_line_count: 'integer', blocked_code: 'code?', replay: 'boolean' },
    CSV_ISSUE: { instruction_id: 'uuid', transfer_id: 'uuid', file_name: 'file', csv_sha256: 'sha', csv_text: 'csv', phase: 'csv', payment_recorded: 'boolean', replay: 'boolean' }
  };
  const ROWS = {
    PROGRESS:{needs_attention:'boolean',waiting_on_other_run:'boolean',run_id:'uuid',status:'run',actor_display_name:'label',started_at_utc:'timestamp',expires_at_utc:'timestamp',selected_candidates:'integer',ready:'integer',review:'integer',pending:'integer',preparing:'integer',removed:'integer',enrolled_candidates:'integer',enrolment_complete:'boolean',enrolment_failed:'boolean',safe_to_close:'true',expired_at_utc:'timestamp?',review_revision:'integer',discard_phase:'discardPhase?',discard_actor_display_name:'label?',discarded_at_utc:'timestamp?',discard_removed_candidates:'integer',discard_already_removed_candidates:'integer',discard_blocked_candidates:'integer'},
    RATES:{rate_detail_id:'uuid',bucket:'bucket',approved_hours:'money',source_pay_rate:'money?',rate_schedule_id:'uuid?',available_paye_rate:'money?',available_umbrella_rate:'money?',available_charge_rate:'money?',approved_charge_rate:'money?'},
    BREAKS:{break_detail_id:'uuid',break_no:'positive',break_start_at:'timestamp?',break_end_at:'timestamp?',break_start_local:'clock?',break_end_local:'clock?',break_minutes:'integer'},
    SHIFTS:{shift_detail_id:'uuid',detail_no:'positive',work_date:'date',shift_start_at:'timestamp?',shift_end_at:'timestamp?',shift_start_local:'clock?',shift_end_local:'clock?',
    shift_overnight:'boolean?',submitted_minutes:'integer?',approved_minutes:'integer?',approved_hours:'money?',detail_label:'label?',segment_pay_ex_vat:'money?',pay_excluded:'boolean?',
    hours_day:'money?',hours_night:'money?',hours_sat:'money?',hours_sun:'money?',hours_bh:'money?',segment_key:'key?',approved_segment_id:'uuid?',job_title:'label?',band_label:'label?'},
    COMPONENTS:{approved_line_id:'uuid',line_no:'positive',component_key:'key',component_kind:'component',work_date:'date?',source_pay_channel:'channel',
    approved_source_ex_vat:'money',realised_source_ex_vat:'money?',held_source_ex_vat:'money?',residual_source_ex_vat:'money?',position_ready:'boolean',unit_label:'unit?',approved_quantity:'money?',approved_unit_rate:'money?',job_title:'label?',band_label:'label?',original_work_ref:'label?',original_timesheet_id:'uuid?',is_adjustment:'boolean?',correction_kind:'label?',associated_rate_schedule_id:'uuid?',associated_rate_family:'rateFamily?',associated_rate_code:'nativeRateCode?',available_paye_rate:'money?',available_umbrella_rate:'money?',available_charge_rate:'money?',approved_charge_rate:'money?',standard_rate_schedule:'standardSchedule'},
    WORK_CHOICES:{work_id:'uuid',expected_revision_id:'uuid?',selection_mode:'mode',selection_state:'selection',page_count:'integer',component_count:'integer'},
    SELECTED_COMPONENTS:{selection_no:'positive',approved_line_id:'uuid',expected_revision_id:'uuid',component_key:'key'},
    ACCEPTED_CANDIDATES:{candidate_id:'uuid',accepted_input_id:'uuid',module_epoch:'positive',target_pay_channel:'channel',target_umbrella_id:'uuid?',pay_week_start:'date',case_scope:'acceptedCaseScope',case_selection_revision:'positive?',settings_witness_kind:'settingsWitness',input_evidence_sha256:'sha',prepare_job_id:'uuid?',prepare_job_status:'prepareJobStatus?',prepare_job_phase:'prepareJobPhase?',run_worker_id:'uuid?',worker_status:'worker?',has_unsealed_work:'boolean',waiting_command_id:'uuid?',waiting_command_sequence:'positive?',progress_state:'acceptedProgress',progress_code:'acceptedProgressCode?',review_issue_code:'issue?'},
    ACCEPTED_WORK:{candidate_id:'uuid',accepted_input_id:'uuid',accepted_work_input_id:'uuid',work_id:'uuid',original_revision_id:'uuid',effective_revision_id:'uuid',selection_mode:'mode',selected_line_count:'integer',publication_command_id:'uuid',predecessor_sequence:'positive',source_kind:'acceptedSourceKind',query_disposition:'acceptedQuery?',query_state_sha256:'sha?',input_evidence_sha256:'sha',effective_cut_id:'uuid?',cut_state:'acceptedCutState'},
    CURRENT_CASES: { case_id: 'uuid', candidate_id: 'uuid', case_kind: 'caseKind', tax_treatment: 'tax', status: 'caseStatus', principal_approved: 'money', principal_funded: 'money', principal_recovered: 'money', principal_written_off: 'money', active_hold_amount: 'money' },
    CASE_COMPONENTS: { case_component_id: 'uuid', case_id: 'uuid', candidate_id: 'uuid', component_ordinal: 'positive', component_revision: 'positive', case_kind: 'caseKind', case_subtype: 'caseSubtype', tax_treatment: 'tax', instruction_kind: 'instruction', direction: 'direction', payroll_stage: 'stage', source_pay_channel: 'channel', resolution_state: 'resolution', approved_source_ex_vat: 'money', funded_source_ex_vat: 'money', recovered_source_ex_vat: 'money', written_off_source_ex_vat: 'money', active_payout_source_ex_vat: 'money', active_recovery_source_ex_vat: 'money' ,case_principal_approved:'money',rule_id:'uuid',current_rule_id:'uuid?',rule_revision:'positive?',weekly_due_source_ex_vat:'money?',minimum_earnings_threshold:'money?',take_home_floor_override:'money?',schedule_start_monday:'date?',next_due_monday:'date?',schedule_week_count:'positive?',outstanding_source_ex_vat:'money',amount_due:'money?',recoverable_this_run:'null',original_liability_reference:'caseReference?',edit_state:'caseEditState',edit_receipt:'caseEditReceipt?',pause_state:'casePauseState',pause_receipt:'casePauseReceipt?'},
    CURRENT_WORK: { work_id: 'uuid', candidate_id: 'uuid', original_timesheet_id: 'uuid', work_kind: 'workKind', week_ending_date: 'date', approval_state: 'approval', current_revision_id: 'uuid?', applied_revision_id: 'uuid?', position_ready: 'boolean', source_pay_channel: 'channel?', timesheet_reference: 'label?', client_display_name: 'label?', approved_source_ex_vat: 'money?' },
    WORKERS: { run_worker_id: 'uuid', candidate_id: 'uuid', worker_status: 'worker', frozen_ex_vat: 'money?', frozen_vat: 'money?', frozen_inc_vat: 'money?', review_issue_code: 'issue?', discard_outcome:'discardOutcome?',discard_blocked_code:'discardBlockedCode?' },
    CHANNEL_WORKERS: { run_worker_id: 'uuid', candidate_id: 'uuid', pay_channel:'channel', worker_status:'worker', frozen_ex_vat:'money', frozen_vat:'money', frozen_inc_vat:'money', review_issue_code:'issue?' },
    LINES: { run_line_id: 'uuid', line_no: 'positive', original_timesheet_id: 'uuid', captured_revision_id: 'uuid', component_key: 'key', component_kind: 'component', work_date: 'date?', source_pay_channel: 'channel', target_pay_channel: 'channel', source_consumed_ex_vat: 'money', frozen_ex_vat: 'money', frozen_vat: 'money', frozen_inc_vat: 'money' },
    REVISION_COMPARISON: { run_work_id: 'uuid', work_id: 'uuid', original_timesheet_id: 'uuid', captured_revision_id: 'uuid', current_revision_id: 'uuid?', newer_approval_available: 'boolean' },
    STATUS: { transfer_id: 'uuid', transfer_no: 'transferNo', projection_id: 'uuid?', execution_kind: 'execution', status: 'transfer', cash_amount: 'money', original_transfer_id: 'uuid?', reservation_state:'reservationState',remaining_reservation_cash:'cashMoney?',reservation_holds_state:'reservationHolds' },
    RETURN_CASH: { original_transfer_id:'uuid',original_transfer_no:'transferNo',original_transfer_status:'returned',original_cash_amount:'cashMoney',beneficiary_kind:'beneficiary',beneficiary_id:'uuid',return_command_id:'uuid',return_posting_complete:'boolean',return_cash_id:'uuid?',amount_owed:'cashMoney?',amount_held:'cashMoney?',amount_reissued_paid:'cashMoney?',amount_available:'cashMoney?',pending_reissue_command_id:'uuid?',action_state:'returnState' }
  };
  const ACCEPTED_HEADER={run_id:'uuid',prepare_command_id:'uuid',accepted_sequence:'positive',accepted_module_epoch:'positive',run_status:'run',command_status:'prepareCommandStatus',expected_candidate_count:'positive',enrolled_candidate_count:'integer'};
  const STATUS_HEADER = {
    run_id: 'uuid', run_status: 'run', selection_state: 'selection', review_revision: 'integer', run_worker_id: 'uuid', candidate_id: 'uuid', worker_status: 'worker', target_pay_channel: 'channel', umbrella_id: 'uuid?', preparation_revision: 'positive', case_selection_revision: 'integer', net_request_revision: 'integer', net_projection_revision: 'integer', net_pending: 'boolean', review_issue_code: 'issue?', review_issue_work_id: 'uuid?', frozen_gross_ex_vat: 'money', frozen_gross_vat: 'money', frozen_gross_inc_vat: 'money', gross_stage_deductions:'money',net_recovery_reserved:'money',frozen_offer_complete:'boolean', projection_id: 'uuid?', projection_input_kind: 'projection?', entered_paye_net: 'money?', accepted_recoveries: 'money?', accepted_net_additions: 'money?', cash_amount: 'money?', reservation_mode:'reservationMode',reservation_projection_id:'uuid?',remaining_reservation_cash:'cashMoney?',reservation_internal_zero:'boolean',reservation_holds_state:'reservationHolds'
  };
  const RETURN_HEADER = {run_id:'uuid',run_worker_id:'uuid',candidate_id:'uuid',financial_view_revision:'integer'};

// DR16 explicit frozen review contracts, shared shape in Worker and Office.
const REVIEW_CONTEXT={run_id:'uuid',actor_user_id:'uuid',owner_epoch:'positive',review_revision:'integer',run_status:'reviewRun',selection_state:'reviewSelection',paye_totals_revision:'integer',umbrella_totals_revision:'integer',run_worker_id:'uuid?',candidate_id:'uuid?',worker_status:'reviewWorker?',preparation_revision:'positive?',captured_preparation_revision:'positive?',case_selection_revision:'integer?',net_request_revision:'integer?',net_projection_revision:'integer?',sort:'reviewCaseSort?'};
const REVIEW_TOTAL={candidate_count:'integer',ready_count:'integer',gross_ex_vat:'reviewMoney',gross_vat:'reviewMoney',gross_inc_vat:'reviewMoney',gross_stage_deductions:'reviewMoney',net_recovery_reserved:'reviewMoney',cash_known:'reviewMoney',net_missing_count:'integer',applicable_net_missing_count:'integer',net_replacement_pending_count:'integer',net_refused_code:'reviewNetRefusal?'};
const REVIEW_CASE={case_id:'uuid',case_component_id:'uuid',instruction_id:'uuid?',selected:'boolean',case_subtype:'label?',direction:'reviewDirection?',payroll_stage:'reviewStage?',source_pay_channel:'channel?',label:'label',due:'reviewAmount?',this_draft:'reviewAmount?',outstanding_after:'reviewAmount?',result_basis:'reviewBasis?',reason_code:'issue?',note:'label',captured_at_utc:'timestamp?',other_run_capacity_reduction:'reviewAmount?',other_run_capacity_reason:'reviewForeign?',sort_key:'reviewKey'};
function reviewField(v,t,base,shape){
 if(t==='reviewAmount')return typeof v==='string'&&/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(v);
 if(t==='reviewMoney')return typeof v==='string'&&/^-?(?:0|[1-9]\d{0,35})(?:\.\d{1,2})?$/.test(v);
 if(t==='reviewRun')return ['PREPARING','REVIEW','DRAFT','EXECUTING','COMPLETE','CANCELLING','CANCELLED'].includes(v);
 if(t==='reviewSelection')return ['OPEN','SEALED'].includes(v);
 if(t==='reviewWorker')return ['PREPARING','REVIEW','READY','DRAFT','ISSUED','COMPLETE','CANCELLING','CANCELLED'].includes(v);
 if(t==='reviewCaseSort')return typeof v==='string'&&/^(DEDUCTION|DUE|THIS_DRAFT|OUTSTANDING|NOTE)_(ASC|DESC)$/.test(v);
 if(t==='reviewNetRefusal')return ['CASE_INPUT_UNBOUND','CASE_WEEK_BASIS_UNBOUND','CASE_RETURN_FLOOR_UNBOUND'].includes(v);
 if(t==='reviewDirection')return ['PAYMENT','DEDUCTION'].includes(v);
 if(t==='reviewStage')return ['GROSS_ADD','GROSS_DEDUCT','NET_ADD','NET_DEDUCT'].includes(v);
 if(t==='reviewBasis')return ['DRAFT','NET_ACCEPTED'].includes(v);
 if(t==='reviewForeign')return ['SAME_WEEK_INSTALMENT','CASE_BALANCE'].includes(v);
 if(t==='reviewContext')return shape(v,REVIEW_CONTEXT);
 if(t==='reviewKey')return Array.isArray(v)&&v.length===3&&typeof v[0]==='boolean'&&(v[0]?v[1]===null:base(v[1],'label'))&&base(v[2],'uuid');
 if(t==='reviewCursor')return shape(v,{context:'reviewContext',key:'reviewKey'})&&new TextEncoder().encode(JSON.stringify(v)).byteLength<=8192;
 if(t==='reviewCases')return Array.isArray(v)&&v.length<=100&&v.every(r=>shape(r,REVIEW_CASE));
 if(t==='reviewTotal')return shape(v,REVIEW_TOTAL);
 if(t==='reviewChannels')return Array.isArray(v)&&v.length===2&&v[0].pay_channel==='PAYE'&&v[1].pay_channel==='UMBRELLA'&&v.every(r=>shape(r,{pay_channel:'channel',...REVIEW_TOTAL,totals_revision:'integer',updated_at_utc:'timestamp'}));
 return false;
}
function reviewPence(v){const negative=v.startsWith('-'),[w,f='']=v.replace(/^-/,'').split('.');return (negative?-1n:1n)*(BigInt(w)*100n+BigInt(f.padEnd(2,'0')));}
function reviewSame(a,b){if(a===b)return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&reviewSame(a[k],b[k]));}
function reviewCompare(a,b,sort){
 if(a[0]!==b[0])return a[0]?1:-1;
 const numeric=/^(DUE|THIS_DRAFT|OUTSTANDING)_/.test(sort),enc=new TextEncoder();
 const bytes=(x,y)=>{const a=enc.encode(x??''),b=enc.encode(y??'');for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]<b[i]?-1:1;return a.length===b.length?0:a.length<b.length?-1:1;};
 let n=numeric?(reviewPence(a[1]??'0')===reviewPence(b[1]??'0')?0:reviewPence(a[1]??'0')<reviewPence(b[1]??'0')?-1:1):bytes(a[1],b[1]);
 if(n===0)n=bytes(a[2],b[2]);return sort.endsWith('_DESC')?-n:n;
}
function reviewResult(p,kind,args,actor,base,shape,bad){
 const totals=kind==='REVIEW_TOTALS';
 if(!shape(p,totals?{context:'reviewContext',whole:'reviewTotal',channels:'reviewChannels',captured_at_utc:'timestamp',observed_at_utc:'timestamp'}:{context:'reviewContext',rows:'reviewCases',complete:'boolean',next_cursor:'reviewCursor?',counts:'reviewCounts'}))bad();
 const c=p.context;if(c.run_id!==args.run_id||c.actor_user_id!==actor)bad();
 if(totals){
  if(['run_worker_id','candidate_id','worker_status','preparation_revision','captured_preparation_revision','case_selection_revision','net_request_revision','net_projection_revision','sort'].some(k=>c[k]!==null))bad();
  if(c.paye_totals_revision!==p.channels[0].totals_revision||c.umbrella_totals_revision!==p.channels[1].totals_revision)bad();
  for(const row of [p.whole,...p.channels]){
   if(BigInt(row.ready_count)>BigInt(row.candidate_count)||BigInt(row.applicable_net_missing_count)>BigInt(row.net_missing_count)||BigInt(row.net_missing_count)>BigInt(row.candidate_count)||BigInt(row.net_replacement_pending_count)>BigInt(row.candidate_count)||reviewPence(row.gross_inc_vat)!==reviewPence(row.gross_ex_vat)+reviewPence(row.gross_vat)||['gross_stage_deductions','net_recovery_reserved','cash_known'].some(k=>reviewPence(row[k])<0n))bad();
  }
  for(const k of Object.keys(REVIEW_TOTAL).filter(k=>k!=='net_refused_code')){const n=REVIEW_TOTAL[k]==='reviewMoney'?reviewPence:BigInt;if(n(p.whole[k])!==n(p.channels[0][k])+n(p.channels[1][k]))bad();}
  const codes=p.channels.map(r=>r.net_refused_code).filter(x=>x!==null).sort();if(p.whole.net_refused_code!==(codes[0]??null))bad();
  return p;
 }
 if(c.run_worker_id!==args.run_worker_id||c.candidate_id===null||c.worker_status===null||['preparation_revision','captured_preparation_revision','case_selection_revision','net_request_revision','net_projection_revision'].some(k=>c[k]===null)||c.sort!==args.sort||p.rows.length>args.limit||p.complete!==(p.next_cursor===null)||!p.complete&&p.rows.length===0||args.after!==null&&!reviewSame(args.after.context,c)||BigInt(p.counts.selected)+BigInt(p.counts.excluded)!==BigInt(p.counts.scope_count))bad();
 let previous=args.after?.key??null;const ids=new Set();
 for(const r of p.rows){
  if((r.other_run_capacity_reduction===null||reviewPence(r.other_run_capacity_reduction)===0n)!==(r.other_run_capacity_reason===null)||ids.has(r.case_component_id)||r.sort_key[2]!==r.case_component_id||!r.selected&&(r.instruction_id!==null||r.this_draft!==null||r.result_basis!==null)||r.instruction_id===null&&r.result_basis!==null||r.outstanding_after!==null&&reviewPence(r.outstanding_after)<0n)bad();ids.add(r.case_component_id);
  const value=args.sort.startsWith('DEDUCTION_')?r.label:args.sort.startsWith('DUE_')?r.due:args.sort.startsWith('THIS_DRAFT_')?r.this_draft:args.sort.startsWith('OUTSTANDING_')?r.outstanding_after:r.note;
  if(!reviewSame(r.sort_key,[value===null,value,r.case_component_id])||previous!==null&&reviewCompare(r.sort_key,previous,args.sort)<=0)bad();previous=r.sort_key;
 }
 if(p.next_cursor!==null&&(!reviewSame(p.next_cursor.context,c)||!reviewSame(p.next_cursor.key,p.rows.at(-1).sort_key)))bad();return p;
}

const PREPARE_ISSUE_INPUT={run_id:'uuid',view:'prepareIssueView',sort:'prepareIssueSort',after:'prepareIssueCursor?',limit:'limit',row_key:'prepareIssueRowKey?',waiting_only:'boolean'};
const PREPARE_ISSUE_CONTEXT={run_id:'uuid',actor_user_id:'uuid',owner_epoch:'positive',review_revision:'integer',run_status:'run',selection_state:'selection',selection_pages:'integer',selected_candidates:'integer',preparing:'integer',ready:'integer',review:'integer',removed:'integer',workbench_revision:'integer',adoption_revision:'integer',view:'prepareIssueView',sort:'prepareIssueSort',row_key:'prepareIssueRowKey?',waiting_only:'boolean',paye_totals_revision:'integer?',umbrella_totals_revision:'integer?'};
const PREPARE_ISSUE_ROW={row_key:'prepareIssueRowKey',origin:'prepareIssueOrigin',candidate_id:'uuid',run_worker_id:'uuid?',worker_status:'prepareIssueState',issue_code:'issue?',work_id:'uuid?',expected_revision_id:'uuid?',physical_timesheet_id:'uuid?',physical_timesheet_version:'positive?',candidate_display_name:'label?',candidate_reference:'label?',label_origin:'prepareIssueLabelOrigin',timesheet_reference:'label?',week_ending_date:'date?',frozen_ex_vat:'money?',preparation_revision:'positive?',discard_outcome:'discardOutcome?',discard_blocked_code:'discardBlockedCode?',waiting_on_other_run:'boolean',waiting_run_id:'uuid?',waiting_actor_display_name:'label?',capacity_reduced_by_other_run:'boolean',pay_channel:'channel?',deduction_total:'money?',frozen_offer_complete:'boolean',case_count:'integer?',sort_key:'prepareIssueKey'};
function prepareIssueField(v,t,base,shape){
  if(t==='prepareIssueView')return ['CANDIDATES','NOT_IN_DRAFT'].includes(v);
  if(t==='prepareIssueSort')return /^(CANDIDATE|PAYMENT|REASON|GROSS|DEDUCTIONS|CHANNEL|STATE)_(ASC|DESC)$/.test(v)&&typeof v==='string';
  if(t==='prepareIssueRowKey')return typeof v==='string'&&v.length<=160&&/^(?:(?:SKIP|RELEASE|CANDIDATE|EXPIRED|DISCARDED):|PAGE:[1-9][0-9]{0,18}:)[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
  if(t==='prepareIssueKey')return Array.isArray(v)&&v.length===3&&typeof v[0]==='boolean'&&(v[0]?v[1]===null:base(v[1],'label'))&&prepareIssueField(v[2],'prepareIssueRowKey',base,shape);
  if(t==='prepareIssueContext')return shape(v,PREPARE_ISSUE_CONTEXT);
  if(t==='prepareIssueCursor')return shape(v,{context:'prepareIssueContext',key:'prepareIssueKey'});
  if(t==='prepareIssueOrigin')return ['CANDIDATE','SKIPPED_WORK','SYSTEM_RELEASE','OFFICE_RELEASE','EXPIRED','DISCARDED'].includes(v);
  if(t==='prepareIssueState')return ['PENDING','FAILED','NOT_IN_DRAFT','PREPARING','REVIEW','READY','DRAFT','CANCELLING','CANCELLED','ISSUED','COMPLETE'].includes(v);
  if(t==='prepareIssueLabelOrigin')return ['CAPTURED_WORK','CURRENT_CANDIDATE','UNKNOWN_ORIGINAL'].includes(v);
  return false;
}
function prepareIssuesResult(payload,args,actor,base,shape,bad){
  if(!shape(payload,{context:'prepareIssueContext',rows:'prepareIssueRows',complete:'boolean',next_cursor:'prepareIssueCursor?',counts:'prepareIssueCounts'}))bad();
  const h=payload.context,ids=new Set(),sameJson=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(h.run_id!==args.run_id||h.actor_user_id!==actor||h.view!==args.view||h.sort!==args.sort||h.row_key!==args.row_key||h.waiting_only!==args.waiting_only
    ||payload.rows.length>args.limit||(!payload.complete&&payload.rows.length===0)||payload.complete!==(payload.next_cursor===null)
    ||args.after!==null&&!sameJson(h,args.after.context))bad();
  for(const r of payload.rows){
    if(ids.has(r.row_key)||r.sort_key[2]!==r.row_key||args.row_key!==null&&r.row_key!==args.row_key
      ||(r.physical_timesheet_id===null)!==(r.physical_timesheet_version===null)
      ||r.physical_timesheet_id!==null&&(r.work_id===null||r.expected_revision_id===null||r.week_ending_date===null)
      ||(r.discard_outcome==='BLOCKED')!==(r.discard_blocked_code!==null))bad();ids.add(r.row_key);
    if(/^(GROSS|DEDUCTIONS)_/.test(args.sort)&&r.sort_key[1]!==null&&!base(r.sort_key[1],'money'))bad();
    if(r.waiting_on_other_run!==(r.waiting_run_id!==null)||!r.waiting_on_other_run&&r.waiting_actor_display_name!==null||r.waiting_run_id===args.run_id||args.waiting_only&&!r.waiting_on_other_run)bad();
    if(r.origin==='CANDIDATE'){
      if(args.view!=='CANDIDATES'||r.row_key!=='CANDIDATE:'+r.candidate_id
        ||(r.run_worker_id===null)!==(['PENDING','FAILED'].includes(r.worker_status))
        ||r.run_worker_id!==null&&r.preparation_revision===null||['PENDING','PREPARING','CANCELLING','CANCELLED','FAILED'].includes(r.worker_status)&&r.frozen_ex_vat!==null||r.worker_status==='REVIEW'&&!r.frozen_offer_complete&&r.frozen_ex_vat!==null||r.frozen_offer_complete&&(!['READY','REVIEW','DRAFT','ISSUED','COMPLETE'].includes(r.worker_status)||r.run_worker_id===null||r.frozen_ex_vat===null||r.deduction_total===null||r.pay_channel===null)||!r.frozen_offer_complete&&r.deduction_total!==null)bad();
    }else{
      if(r.pay_channel!==null||r.deduction_total!==null||r.frozen_offer_complete||r.case_count!==null||r.waiting_on_other_run||r.capacity_reduced_by_other_run||args.view!=='NOT_IN_DRAFT'||r.worker_status!=='NOT_IN_DRAFT'||r.issue_code===null||r.frozen_ex_vat!==null)bad();
      if(r.origin==='SKIPPED_WORK'&&(r.run_worker_id!==null||r.work_id===null||!r.row_key.endsWith(':'+r.work_id)))bad();
      if(['SYSTEM_RELEASE','OFFICE_RELEASE'].includes(r.origin)&&(r.run_worker_id===null||r.row_key!=='RELEASE:'+r.run_worker_id||r.preparation_revision===null))bad();
      if(r.origin==='SYSTEM_RELEASE'&&!['SELECTED_WORK_NOT_APPROVED','SELECTED_WORK_REVISION_CHANGED','SELECTED_WORK_POSITION_PENDING','SOURCE_PAY_QUERY_OPEN','SOURCE_PAY_QUERY_EVIDENCE_UNAVAILABLE','CASE_NO_PAYABLE_AMOUNT'].includes(r.issue_code))bad();
      if(r.origin==='OFFICE_RELEASE'&&r.issue_code!=='DRAFT_CANDIDATE_REMOVED'||r.origin==='EXPIRED'&&(r.issue_code!=='PREPARATION_EXPIRED'||r.row_key!=='EXPIRED:'+r.candidate_id)||r.origin==='DISCARDED'&&(r.issue_code!=='DRAFT_DISCARDED'||r.row_key!=='DISCARDED:'+r.candidate_id))bad();
    }
  }
  if(payload.next_cursor!==null&&(!sameJson(payload.next_cursor.context,h)||!sameJson(payload.next_cursor.key,payload.rows.at(-1).sort_key)))bad();
  return payload;
}

  const PAGES = {
    REVIEW_TOTALS:{run_id:'uuid'},
  REVIEW_CASES:{run_id:'uuid',run_worker_id:'uuid',sort:'reviewCaseSort',after:'reviewCursor?',limit:'limit'},
  PREPARE_ISSUES:PREPARE_ISSUE_INPUT,
    CASE_PREVIEW:{input:'caseInput'},
    GUARD:{run_id:'uuid'},
    PROGRESS:{run_id:'uuid'},
    RATES:{work_id:'uuid',expected_revision_id:'uuid',approved_line_id:'uuid',after_bucket:'bucket?',limit:'limit'},
    BREAKS:{work_id:'uuid',expected_revision_id:'uuid',approved_line_id:'uuid',shift_detail_id:'uuid',after_break_no:'integer?',limit:'limit'},
    SHIFTS:{work_id:'uuid',expected_revision_id:'uuid',approved_line_id:'uuid',after_detail_no:'integer?',limit:'limit'},
    COMPONENTS:{work_id:'uuid',expected_revision_id:'uuid',after_line_no:'integer?',limit:'limit'},
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
  const FROZEN_ORIGIN={"classification":"classification","revision_id":"uuid","origin_kind":"originKind","sheet_scope":"dailyScope?","contract_id":"uuid?","client_id":"uuid?","work_date":"date?","physical_timesheet_id":"uuid","physical_timesheet_version":"numberPositive","candidate_display_name":"label","candidate_reference":"label?","client_display_name":"label","job_title":"label?","band_label":"label?","timesheet_reference":"label?","pay_channel":"channel","authorised_at_utc":"timestamp?"};
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
function validDiscardProgress(p){
  const removed=BigInt(p.discard_removed_candidates),already=BigInt(p.discard_already_removed_candidates),blocked=BigInt(p.discard_blocked_candidates);
  if(p.discard_phase===null)return p.discard_actor_display_name===null&&p.discarded_at_utc===null&&removed+already+blocked===0n;
  if(!p.discard_actor_display_name?.trim()||p.expired_at_utc!==null||removed+already+blocked>BigInt(p.selected_candidates))return false;
  if(p.discard_phase==='CANCELLING')return p.status==='CANCELLING'&&p.discarded_at_utc===null;
  return p.discarded_at_utc!==null&&Date.parse(p.discarded_at_utc)>=Date.parse(p.started_at_utc)
    &&BigInt(p.pending)===0n&&BigInt(p.preparing)===0n
    &&(p.discard_phase==='DISCARDED'?p.status==='CANCELLED'&&blocked===0n:p.status==='REVIEW'&&blocked>0n);
}
function field(v,type){
 if(type==='reviewCounts')return shape(v,{selected:'integer',excluded:'integer',scope_count:'integer'});
 if(["reviewAmount","reviewMoney","reviewRun","reviewSelection","reviewWorker","reviewCaseSort","reviewNetRefusal","reviewDirection","reviewStage","reviewBasis","reviewForeign","reviewContext","reviewKey","reviewCursor","reviewCases","reviewTotal","reviewChannels"].includes(type))return reviewField(v,type,field,shape);
  if(type==='prepareIssueRows')return Array.isArray(v)&&v.length<=100&&v.every(r=>shape(r,PREPARE_ISSUE_ROW));
  if(type==='prepareIssueCounts')return shape(v,{skipped_timesheets:'integer',removed_candidates:'integer',scope_count:'integer'});
  if(type.startsWith('prepareIssue')&&!type.endsWith('?'))return prepareIssueField(v,type,field,shape);
    if(type==='pauseReason')return cases.pauseReason(v);
    if(type==='pauseAction')return ['CASE_PAUSE','CASE_RESUME'].includes(v);
    if(type==='pauseAdmissionPhase')return v==='ACCEPTED_PENDING_STATUS';
    if(type==='casePauseState')return cases.casePauseState(v);
    if(type==='casePauseReceipt')return cases.casePauseReceipt(v);
    if(type==='caseEditToken')return cases.caseEditToken(v);
    if(type==='caseEditState')return cases.caseEditState(v);
    if(type==='caseEditReceipt')return cases.caseEditReceipt(v);
    if(type==='caseEditPhase')return v==='ACCEPTED_PENDING_EDIT';
  if(type==='caseReference')return typeof v==='string'&&v.trim().length>0&&!v.includes('\0')&&encoder.encode(v).byteLength<=2048;
    if(type==='caseCreatePhase')return v==='ACCEPTED_PENDING_CASE';
    if(type==='caseInput')return cases.caseInput(v);
    if(type==='caseToken')return cases.caseToken(v);
    if(type==='guardDecision')return ['UMBRELLA_ONLY','VERIFY_BOTH','VERIFY_PAYE'].includes(v);
    if(type==='guardChannel')return ['ALL','PAYE','UMBRELLA'].includes(v);
    if(type==='guardReason')return typeof v==='string'&&v.trim().length>0&&!v.includes('\0')&&encoder.encode(v).byteLength<=500;
    if(type==='guardContext')return shape(v,{namespace:'choiceNamespace',workbench_revision:'integer',adoption_revision:'integer'});
    if(type==='guardStatus')return ['Paid','Not paid yet'].includes(v);
    if(type==='guardStoredDecision')return v==='NONE'||field(v,'guardDecision');
    if(type==='guardFacts')return Array.isArray(v)&&v.length<=100&&v.every(x=>shape(x,{run_id:'uuid',reference:'label?',legacy:'boolean',unexecuted:'boolean',status:'guardStatus'})
      &&(x.reference===null||x.reference.length<=80&&!UUID.test(x.reference))&&(x.status==='Paid')===!x.unexecuted)&&new Set(v.map(x=>x.run_id)).size===v.length;
    if(type==='guardRows')return Array.isArray(v)&&v.length===1&&shape(v[0],{run_id:'uuid',guard_applies:'boolean',unexecuted:'boolean',existing:'guardFacts',paye_candidates:'integer',umbrella_candidates:'integer',context:'guardContext',decision:'guardStoredDecision',channel_scope:'guardChannel'});
    if(type==='reauthToken')return typeof v==='string' && v.length>0 && encoder.encode(v).byteLength<=1536 && /^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$/.test(v);
    if(type==='discardReason')return typeof v==='string'&&v.trim().length>0&&!v.includes('\0')&&encoder.encode(v).byteLength<=500;
    if(type==='discardReceiptPhase')return ['EMPTY','CANCELLING','DISCARDED','PARTIAL'].includes(v);
    if(type==='discardPhase')return ['CANCELLING','DISCARDED','PARTIAL'].includes(v);
    if(type==='discardOutcome')return ['REMOVED','ALREADY_REMOVED','BLOCKED'].includes(v);
    if(type==='discardBlockedCode')return ['PAYMENT_ALREADY_PROTECTED','PREPARATION_STATE_PROTECTED'].includes(v);
    if(type==='choiceMember')return ['WORK','CASE_COMPONENT'].includes(v);
    if(type==='emptyIds')return Array.isArray(v)&&v.length<=100&&v.every(x=>field(x,'uuid'))&&new Set(v.map(x=>x.toLowerCase())).size===v.length;
  if(type==='requestBytes')return typeof v==='string'&&encoder.encode(v).byteLength<=32768;
  if(type==='null')return v===null;
  if(type==='unit')return typeof v==='string'&&!v.includes('\0')&&encoder.encode(v).byteLength<=512;
  if(type==='nativeRateCode')return typeof v==='string'&&!v.includes('\0')&&[...v].length>=1&&[...v].length<=245;
  if(type==='rateFamily')return ['STANDARD','ADDITIONAL','MILEAGE'].includes(v);
  if(type==='standardSchedule')return Array.isArray(v)&&v.length<=5&&v.every(x=>shape(x,{rate_schedule_id:'uuid',bucket:'bucket',available_paye_rate:'money?',available_umbrella_rate:'money?',available_charge_rate:'money?',approved_charge_rate:'money?'}))&&new Set(v.map(x=>x.bucket)).size===v.length&&new Set(v.map(x=>x.rate_schedule_id.toLowerCase())).size===v.length;

    if(type==='lastRunVersion')return v===1;
    if(type==='descriptor')return shape(v,{namespace:'choiceNamespace',intent:'choiceIntent',revision:'localRevision',workbench_revision:'integer',adoption_revision:'integer',...(record(v)&&Object.hasOwn(v,'memory_baseline_run_id')?{memory_baseline_run_id:'uuid?'}:{})})&&encoder.encode(JSON.stringify(v)).byteLength<=32768;
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
    if(type==='skipCode')return ['BPAY_NEXT_WORK_WEEK_NOT_YET_PAYABLE','BPAY_NEXT_SELECTION_ON_HOLD','BPAY_NEXT_SELECTION_SNOOZED','BPAY_NEXT_SELECTION_WORK_NOT_APPROVED','BPAY_NEXT_SELECTION_REVISION_NOT_CURRENT','BPAY_NEXT_SELECTION_SIGNED_LINE_NOT_ELIGIBLE','PAYE_EXCLUDED_BY_SAME_WEEK_GUARD','SOURCE_PAY_QUERY_OPEN','SOURCE_PAY_QUERY_EVIDENCE_UNAVAILABLE'].includes(v);
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
    if(type==='classification')return ['CLASSIFIED','UNCLASSIFIED_MISMATCH','UNKNOWN'].includes(v);
    if(type==='originKind')return ['CONTRACT','DAILY'].includes(v);
    if(type==='dailyScope')return v==='DAILY';
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
      workerAction:['REPREPARE','RELEASE'],workerActionPhase:['ACCEPTED','RUNNING','COMPLETE','EXPIRED','DISCARDED'],
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
  const financial = action => ['CASE_CREATE','CASE_EDIT','CASE_PAUSE','CASE_RESUME','PAYE_NET', 'TRANSFER_BEGIN', 'CANCEL_REQUEST', 'CSV_ISSUE'].includes(action);
  const reauthAction = action => ['CANCEL_REQUEST','CSV_ISSUE','PAYE_SAME_WEEK_OVERRIDE'].includes(action);
  function reauthIntentBody(action,args){
    if(action!=='PAYE_SAME_WEEK_OVERRIDE')return requestBody(action,args);
    const {reauth_token,...intent}=args||{};
    if(!shape(intent,{run_id:'uuid',command_id:'uuid',decision:'guardDecision',reason:'guardReason',context:'guardContext'})
      ||intent.decision==='UMBRELLA_ONLY'||(reauth_token!==undefined&&!field(reauth_token,'reauthToken')))fail('REQUEST_INVALID');
    const bytes=JSON.stringify({action,...intent,...(reauth_token===undefined?{}:{reauth_token})});
    // Token is not part of the auth intent; token shape retains its own bound.
    if(encoder.encode(JSON.stringify({action,...intent})).byteLength>2048)fail('REQUEST_INVALID');return bytes;
  }
  function requestBody(action, args) {
    let schema = INPUT[action];
    if(action==='PREPARATION_DISCARD'&&Object.hasOwn(args||{},'reason'))schema={...schema,reason:'discardReason'};
    if (action === 'PAYE_NET' && Object.hasOwn(args || {}, 'expected_projection_revision')) schema = { ...schema, expected_projection_revision: 'projectionRevision' };
    if (action === 'CANCEL_REQUEST' && (Object.hasOwn(args || {}, 'run_id') || Object.hasOwn(args || {}, 'pay_channel'))) schema = {...schema,run_id:'uuid',pay_channel:'channel'};
    // Historical tokenless journals remain readable, byte-for-byte. A new
    // protected dispatch separately requires the completed helper below.
    if((reauthAction(action)||action==='PAYE_GUARD_DECISION') && Object.hasOwn(args || {},'reauth_token'))schema={...schema,reauth_token:'reauthToken'};
    if(action==='CASE_CREATE'){const {command_id,preview_token,...input}=args||{};if(!field(command_id,'uuid')||!cases.caseInput(input)||!cases.caseToken(preview_token)||!cases.equal(preview_token.input,input))fail('REQUEST_INVALID');}
    if(['CASE_PAUSE','CASE_RESUME'].includes(action)&&(!positive(args?.expected_case_revision)||BigInt(args.expected_case_revision)>=9223372036854775807n))fail('REQUEST_INVALID');
    if(action==='CASE_EDIT'){const {command_id,case_id,expected_case_revision,preview_token,...input}=args||{};
      if(!field(command_id,'uuid')||!field(case_id,'uuid')||!positive(expected_case_revision)||!cases.caseInput(input)
        ||!cases.caseEditToken(preview_token,{case_id,expected_case_revision})||!cases.equal(preview_token.input,input))fail('REQUEST_INVALID');}
    if (!schema || (!['CASE_CREATE','CASE_EDIT'].includes(action)&&!shape(args, schema)) || (action==='EXCLUSION_PAGE'&&args.excluded_work_ids.length+args.excluded_candidate_ids.length>100) || (action === 'CASE_PAGE' && args.component_ids.length !== args.selected.length)) fail('REQUEST_INVALID');
    if(action==='PAYE_GUARD_DECISION'&&((args.decision==='UMBRELLA_ONLY'&&(args.reason!==null||Object.hasOwn(args,'reauth_token')))
      ||(args.decision!=='UMBRELLA_ONLY'&&!field(args.reauth_token,'reauthToken'))))fail('REQUEST_INVALID');
    const bytes=JSON.stringify({ action, ...args });
    if(action==='PAYE_GUARD_DECISION'&&encoder.encode(bytes).byteLength>32768)fail('REQUEST_INVALID');
    if(financial(action) && encoder.encode(bytes).byteLength>(['CASE_PAUSE','CASE_RESUME'].includes(action)?16384:action==='CASE_EDIT'?49152:action==='CASE_CREATE'?32768:2048))fail('REQUEST_INVALID');
    return bytes;
  }
  function receipt(payload, action, args) {
    const schema=RECEIPT[action];
    if (!shape(payload, schema)) fail();
    for (const k of ['run_id', 'run_worker_id', 'candidate_id', 'work_id', 'expected_revision_id', 'command_id', 'transfer_id', 'instruction_id']) if (Object.hasOwn(args, k) && !(action==='CANCEL_REQUEST'&&k==='run_id') && !(['CASE_CREATE','CASE_EDIT'].includes(action)&&k==='candidate_id') && !same(payload[k], args[k])) fail();
    if(action==='CASE_CREATE'&&!same(payload.case_id,args.command_id))fail();
    if(['CASE_PAUSE','CASE_RESUME'].includes(action)&&(payload.action!==action||!same(payload.case_id,args.case_id)||payload.expected_case_revision!==args.expected_case_revision))fail();
    if(action==='CASE_EDIT'&&(!same(payload.case_id,args.case_id)||!same(payload.rule_id,args.command_id)
      ||BigInt(payload.case_revision)!==BigInt(args.expected_case_revision)+1n))fail();
    if(['EXCLUSION_PAGE','MATCHING_PAGE'].includes(action)&&payload.page_no!==args.page_no)fail();
    if(action==='EXCLUSION_PAGE'&&payload.item_count!==String(args.excluded_work_ids.length+args.excluded_candidate_ids.length))fail();
    if(action==='MATCHING_PAGE'&&(BigInt(payload.item_count)>100n||payload.skipped.length>Number(payload.item_count)
      ||(payload.complete!==(payload.next_after_member_no===null))||(!payload.complete&&(payload.item_count==='0'
      ||BigInt(payload.next_after_member_no)!==BigInt(args.after_member_no??'0')+BigInt(payload.item_count)))))fail();
    if(['CREATE','PAYE_GUARD_DECISION'].includes(action)&&(payload.empty!==(payload.selected_candidate_count==='0')||payload.empty!==(payload.agency_sequence===null)||BigInt(payload.selection_count)>BigInt(payload.choice_work_count)||payload.official_pay_date!==args.descriptor.namespace.official_pay_date))fail();
    if(action==='PAYE_GUARD_DECISION'&&(payload.decision!==args.decision
      ||payload.channel_scope!==({UMBRELLA_ONLY:'UMBRELLA',VERIFY_BOTH:'ALL',VERIFY_PAYE:'PAYE'})[args.decision]))fail();
    if(action==='WORK_PAGE'){
      const ids=args.choices.map(x=>x.work_id.toLowerCase()),positions=payload.skipped.map(x=>ids.indexOf(x.work_id.toLowerCase()));
      if(positions.some((n,i)=>n<0||(i>0&&n<=positions[i-1])))fail();
    }
    if(action==='COMPONENT_PAGE'&&(payload.page_no!==args.page_no||payload.item_count!==String(args.approved_line_ids.length)))fail();
    if(action==='COMPONENT_SEAL'&&payload.component_count!==args.expected_count)fail();
    if(action==='SEAL_ENQUEUE'&&payload.selection_count!==args.expected_count)fail();
    if(action==='PREPARATION_DISCARD'){
      const n=k=>BigInt(payload[k]),terminal=['DISCARDED','PARTIAL'].includes(payload.phase);
      if((payload.phase==='EMPTY')!==(payload.sequence===null)
        ||n('completed_candidates')!==n('removed_candidates')+n('already_removed_candidates')+n('blocked_candidates')
        ||n('completed_candidates')>n('expected_candidates')
        ||(terminal&&n('completed_candidates')!==n('expected_candidates'))
        ||(payload.phase==='DISCARDED'&&n('blocked_candidates')!==0n)
        ||(payload.phase==='PARTIAL'&&n('blocked_candidates')===0n)
        ||(payload.phase==='EMPTY'&&n('expected_candidates')!==0n))fail();
    }
    if(action==='WAKE'&&payload.accepted===payload.throttled)fail();
    if(['WORKER_REPREPARE','WORKER_RELEASE'].includes(action)&&(payload.action!==(action==='WORKER_REPREPARE'?'REPREPARE':'RELEASE')||payload.expected_preparation_revision!==args.expected_preparation_revision||BigInt(payload.preparation_revision)!==BigInt(args.expected_preparation_revision)+1n))fail();
    if (action === 'CASE_PAGE' && (payload.page_no !== args.page_no || payload.selection_revision !== args.selection_revision || payload.item_count !== String(args.component_ids.length))) fail();
    if (action === 'CASE_SEAL' && (payload.selection_revision !== args.selection_revision || BigInt(payload.selected_count) + BigInt(payload.excluded_count) !== BigInt(args.expected_items))) fail();
    if (action === 'WORK_PAGE' && (payload.page_no !== args.page_no || payload.item_count !== String(args.choices.length))) fail();
    if (action === 'CONFIRM' && (payload.review_revision !== args.review_revision || payload.drafts.some(d=>!same(d.run_id,args.run_id)))) fail();
    if (action === 'REVIEW' && ((payload.phase === 'PREPARING') !== (payload.reason !== null))) fail();
    if (action === 'REVIEW' && payload.all_ready === true && !positive(payload.review_revision)) fail();
    if (action === 'CANCEL_REQUEST' && ((payload.phase === 'BLOCKED') !== (payload.blocked_code !== null))) fail();
    if (action === 'CSV_ISSUE' && !payload.replay && payload.payment_recorded !== false) fail();
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
const CASE_LIST_FILTERS={candidate_id:'uuid?',client_id:'uuid?',case_subtype:'caseListSubtype',view:'caseListView',snooze:'caseListSnooze',hide_completed:'boolean'};
const CASE_LIST_DEFAULT_FILTERS=Object.freeze({candidate_id:null,client_id:null,case_subtype:'ALL',view:'ALL',snooze:'ALL',hide_completed:true});
const CASE_LIST_CONTEXT={agency_id:'uuid',actor_user_id:'uuid',owner_epoch:'positive',local_date:'date',official_pay_date:'date',pay_week_start:'date',workbench_revision:'integer',adoption_revision:'integer',valuation_policy_id:'uuid?'};
const CASE_LIST_LAST={case_id:'uuid',created_at_utc:'timestamp?',sort_value:'label?'};
const CASE_LIST_CURSOR_LAST={case_id:'uuid',created_at_utc:'timestamp?',sort_value:'caseListEncodedSort?'};
const CASE_LIST_COUNTS=['payment_advances_active_count','overpayments_active_count','underpayments_active_count',
  'manual_debt_adjustments_active_count','manual_credit_adjustments_count','mixed_finance_cases_count',
  'unresolved_finance_cases_count','stale_finance_cases_count','finance_cases_with_active_snooze_count'];
const CASE_LIST_ROW={case_id:'uuid',candidate_id:'uuid',candidate_name:'label',candidate_reference:'label?',
  client_id:'uuid?',client_name:'label?',client_association:'caseListClient',case_kind:'issue',case_subtype:'issue?',case_type_label:'label',original_liability_reference:'caseReference?',
  tax_treatment:'issue',tax_label:'label',status:'caseListStatus',created_at_utc:'timestamp?',case_revision:'positive',
  principal_approved:'money',principal_funded:'money',principal_recovered:'money',principal_written_off:'money',
  outstanding:'money',pending_payout:'money?',amount_due:'money?',recoverable_this_run:'null',active_hold_amount:'money',
  active_hold_explanation:'label?',protected_run_id:'uuid?',protected_channel:'channel?',input_pending:'boolean',
  due_date:'date?',weekly_due:'money?',schedule_start_monday:'date?',next_due_monday:'date?',schedule_week_count:'positive?',
  minimum_earnings_threshold:'money?',take_home_floor:'money?',has_active_snooze:'boolean?',active_snooze_count:'integer?',
  indefinite_snooze_count:'integer?',snooze_until_date:'date?',stale_snooze_count:'integer?',is_mixed_case:'boolean?',
  unresolved_taxable:'boolean?',resolution_stale:'boolean?',gap_code:'issue?',sort_key:'caseListLast'};
function caseListField(value,type){
  if(type.endsWith('?'))return value===null||caseListField(value,type.slice(0,-1));
  if(type==='caseListEncodedSort'){
    if(typeof value!=='string'||value.length>11000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))return false;
    try{const raw=atob(value),decoded=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));
      return btoa(raw)===value&&!decoded.includes('\0')&&encoder.encode(decoded).byteLength<=8192;
    }catch{return false;}
  }
  const enums={caseListSubtype:['ALL','LOAN','PAYMENT_ADVANCE','OVERPAYMENT','UNDERPAYMENT','MANUAL_CREDIT','MANUAL_DEBT','UNMAPPED'],
    caseListView:['ALL','ACTIVE','SNOOZED','HISTORY'],caseListSnooze:['ALL','FINITE','INDEFINITE'],
    caseListSort:['CREATED_ASC','CREATED_DESC','CANDIDATE_ASC','CANDIDATE_DESC','TYPE_ASC','TYPE_DESC','STATUS_ASC','STATUS_DESC','ORIGINAL_ASC','ORIGINAL_DESC','OUTSTANDING_ASC','OUTSTANDING_DESC','WEEKLY_ASC','WEEKLY_DESC','FUNDED_ASC','FUNDED_DESC','RECOVERED_ASC','RECOVERED_DESC','WRITTEN_OFF_ASC','WRITTEN_OFF_DESC'],
    caseListStatus:['OPEN','PAUSED','CLOSED','WRITTEN_OFF'],caseListClient:['FROZEN','UNASSOCIATED','UNKNOWN']};
  if(Object.hasOwn(enums,type))return enums[type].includes(value);
  if(type==='caseListLast')return caseListExact(value,CASE_LIST_LAST);
  if(type==='issue')return typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,119}$/.test(value);
  if(type==='label')return typeof value==='string'&&!value.includes('\0')&&encoder.encode(value).byteLength<=8192;
  return field(value,type);
}
function caseListExact(value,schema){
  return record(value)&&Object.keys(value).length===Object.keys(schema).length
    &&Object.entries(schema).every(([key,type])=>Object.hasOwn(value,key)&&caseListField(value[key],type));
}
function caseListSame(a,b){
  if(a===b)return true;
  if(!record(a)||!record(b)||Object.keys(a).length!==Object.keys(b).length)return false;
  return Object.keys(a).every(key=>Object.hasOwn(b,key)&&caseListSame(a[key],b[key]));
}
function caseListCursor(cursor,kind,filters,sort){
  if(!record(cursor)||Object.keys(cursor).sort().join()!=='context,filters,last,sort'
    ||!caseListExact(cursor.context,CASE_LIST_CONTEXT)||!caseListExact(cursor.filters,CASE_LIST_FILTERS)
    ||!caseListSame(cursor.filters,filters)||cursor.sort!==(kind==='CASE_SUMMARY'?'CASE_ID_ASC':sort)
    ||!caseListExact(cursor.last,CASE_LIST_CURSOR_LAST)||encoder.encode(JSON.stringify(cursor)).byteLength>16384)return false;
  return kind==='CASE_SUMMARY'?cursor.last.created_at_utc===null&&cursor.last.sort_value===null:
    sort.startsWith('CREATED_')?cursor.last.sort_value===null:cursor.last.sort_value!==null;
}
function caseListCall(kind,params){
  const bad=()=>{throw new Failure('REQUEST_INVALID');};
  const parse=(key,fallback)=>{const raw=params.get(key);if(raw===null)return fallback;
    if(encoder.encode(raw).byteLength>32768)bad();try{return JSON.parse(raw);}catch{bad();}};
  const supplied=parse('filters',{});
  if(!record(supplied)||Object.keys(supplied).some(key=>!Object.hasOwn(CASE_LIST_FILTERS,key)))bad();
  const filters={...CASE_LIST_DEFAULT_FILTERS,...supplied};
  if(!caseListExact(filters,CASE_LIST_FILTERS))bad();
  const sort=params.get('sort')??'CREATED_DESC';
  const after=parse('after',null);
  if(kind==='CASE_LIST'&&!caseListField(sort,'caseListSort'))bad();
  if(after!==null&&!caseListCursor(after,kind,filters,sort))bad();
  const args={filters:normalizeAccepted(filters),after:normalizeAccepted(after)};
  if(kind==='CASE_LIST'){
    const raw=params.get('limit')??'10';if(!['5','10','20','50'].includes(raw))bad();
    args.sort=sort;args.limit=Number(raw);
  }
  if(encoder.encode(JSON.stringify(args)).byteLength>32768)bad();
  return {kind,args:Object.freeze(args)};
}
// PostgreSQL C collation compares UTF-8 bytes. JS UTF-16 order and millisecond
// timestamps would lose valid server tie-breaks.
function caseListTextCompare(a,b){
  const x=encoder.encode(a),y=encoder.encode(b);
  for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;
  return x.length===y.length?0:x.length<y.length?-1:1;
}
function caseListTime(value){
  const fraction=value.match(/\.(\d{1,6})/)?.[1]??'';
  return BigInt(Date.parse(value))*1000n+BigInt(fraction.padEnd(6,'0').slice(3));
}
function caseListCompare(a,b,sort){
  if(sort==='CASE_ID_ASC')return caseListTextCompare(a.case_id,b.case_id);
  if(!sort.startsWith('CREATED_')){
    let key;
    if(/^(ORIGINAL|OUTSTANDING|WEEKLY|FUNDED|RECOVERED|WRITTEN_OFF)_/.test(sort)){
      if((a.sort_value==='~')!==(b.sort_value==='~'))return a.sort_value==='~'?1:-1;
      const scaled=value=>{if(value==='~')return 0n;if(!/^-?\d{1,24}(?:\.\d{1,6})?$/.test(value))throw new Failure('RESPONSE_INVALID');
        const [whole,part='']=value.replace(/^-/,'').split('.');return BigInt(whole+part.padEnd(6,'0'))*(value.startsWith('-')?-1n:1n);};
      const x=scaled(a.sort_value),y=scaled(b.sort_value);key=x===y?0:x<y?-1:1;
    }else key=caseListTextCompare(a.sort_value,b.sort_value);
    if(key)return sort.endsWith('_DESC')?-key:key;
  }
  if((a.created_at_utc===null)!==(b.created_at_utc===null))return a.created_at_utc===null?1:-1;
  if(a.created_at_utc!==null){
    const x=caseListTime(a.created_at_utc),y=caseListTime(b.created_at_utc);
    if(x!==y){const direction=sort==='CREATED_ASC'?1:-1;return x<y?-direction:direction;}
  }
  return caseListTextCompare(a.case_id,b.case_id);
}
function caseListDecodedLast(cursor){
  if(cursor===null)return null;
  const raw=cursor.last.sort_value;
  return {...cursor.last,sort_value:raw===null?null:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Uint8Array.from(atob(raw),c=>c.charCodeAt(0)))};
}
function caseListResult(payload,call,bad){
  const summary=call.kind==='CASE_SUMMARY',limit=summary?100:call.args.limit,sort=summary?'CASE_ID_ASC':call.args.sort;
  const shape=summary?['context','filters','counts','scanned_count','matched_count','gap_case_count','complete','next_cursor']:
    ['context','filters','sort','rows','scanned_count','complete','next_cursor'];
  if(!record(payload)||Object.keys(payload).length!==shape.length||shape.some(key=>!Object.hasOwn(payload,key))
    ||!caseListExact(payload.context,CASE_LIST_CONTEXT)||payload.context.actor_user_id!==call.actorUserId
    ||!caseListSame(payload.filters,call.args.filters)||!field(payload.scanned_count,'integer')
    ||BigInt(payload.scanned_count)>BigInt(limit)||typeof payload.complete!=='boolean'
    ||call.args.after!==null&&!caseListSame(call.args.after.context,payload.context))bad();
  const next=payload.next_cursor;
  if(payload.complete?next!==null:!caseListCursor(next,call.kind,call.args.filters,call.args.sort)
    ||!caseListSame(next.context,payload.context)||payload.scanned_count==='0'
    ||call.args.after!==null&&caseListCompare(caseListDecodedLast(next),caseListDecodedLast(call.args.after),sort)<=0)bad();
  if(summary){
    const counts=Object.fromEntries(CASE_LIST_COUNTS.map((key,index)=>[key,index>=5?'integer?':'integer']));
    if(!caseListExact(payload.counts,counts)||!field(payload.matched_count,'integer')||!field(payload.gap_case_count,'integer')
      ||BigInt(payload.matched_count)>BigInt(payload.scanned_count)||BigInt(payload.gap_case_count)>BigInt(payload.matched_count)
      ||Object.values(payload.counts).some(value=>value===null)&&payload.gap_case_count==='0'
      ||Object.values(payload.counts).some(value=>value!==null&&BigInt(value)>BigInt(payload.matched_count))
      ||CASE_LIST_COUNTS.slice(0,5).reduce((total,key)=>total+BigInt(payload.counts[key]),0n)>BigInt(payload.matched_count))bad();
  }else{
    if(payload.sort!==sort||!Array.isArray(payload.rows)||payload.rows.length>limit
      ||BigInt(payload.rows.length)>BigInt(payload.scanned_count))bad();
    let previous=caseListDecodedLast(call.args.after);
    for(const row of payload.rows){
      if(!caseListExact(row,CASE_LIST_ROW)||encoder.encode(JSON.stringify(row)).byteLength>90000
        ||row.original_liability_reference!==null&&(row.case_kind!=='MANUAL_DEBT'||row.case_subtype!=='MANUAL_DEBT')
        ||row.sort_key.case_id!==row.case_id||row.sort_key.created_at_utc!==row.created_at_utc
        ||sort.startsWith('CREATED_')&&row.sort_key.sort_value!==null
        ||sort.startsWith('TYPE_')&&row.sort_key.sort_value!==row.case_type_label
        ||sort.startsWith('STATUS_')&&row.sort_key.sort_value!==row.status
        ||/^(ORIGINAL|OUTSTANDING|WEEKLY|FUNDED|RECOVERED|WRITTEN_OFF)_/.test(sort)&&caseListCompare({...row.sort_key,case_id:row.case_id},
          {...row.sort_key,sort_value:(sort.startsWith('ORIGINAL_')?row.principal_approved:sort.startsWith('OUTSTANDING_')?row.outstanding:sort.startsWith('FUNDED_')?row.principal_funded:sort.startsWith('RECOVERED_')?row.principal_recovered:sort.startsWith('WRITTEN_OFF_')?row.principal_written_off:row.weekly_due)??'~'},sort)!==0
        ||sort.startsWith('CANDIDATE_')&&row.sort_key.sort_value===null
        ||previous!==null&&caseListCompare(row.sort_key,previous,sort)<=0
        ||next!==null&&caseListCompare(row.sort_key,caseListDecodedLast(next),sort)>0
        ||(row.client_association==='FROZEN')!==(row.client_id!==null)
        ||(row.protected_run_id===null)!==(row.protected_channel===null)
        ||row.input_pending&&row.protected_run_id===null
        ||[row.resolution_stale,row.has_active_snooze,row.is_mixed_case,row.unresolved_taxable,row.pending_payout].some(value=>value===null)&&row.gap_code===null)bad();
      const membership=[row.pending_payout,row.is_mixed_case,row.unresolved_taxable,row.has_active_snooze];
      if(membership.some(value=>value===null)&&(!membership.every(value=>value===null)
        ||row.amount_due!==null||row.resolution_stale!==null||row.gap_code===null))bad();
      if(row.has_active_snooze===null){
        if([row.active_snooze_count,row.indefinite_snooze_count,row.stale_snooze_count,row.snooze_until_date].some(value=>value!==null)||row.gap_code===null)bad();
      }else if([row.active_snooze_count,row.indefinite_snooze_count,row.stale_snooze_count].some(value=>value===null)
        ||row.has_active_snooze!==(row.active_snooze_count!=='0')
        ||BigInt(row.indefinite_snooze_count)>BigInt(row.active_snooze_count)
        ||(BigInt(row.active_snooze_count)>BigInt(row.indefinite_snooze_count))!==(row.snooze_until_date!==null))bad();
      const f=call.args.filters,subtype=row.case_subtype,known=['LOAN','PAYMENT_ADVANCE','OVERPAYMENT','UNDERPAYMENT','MANUAL_CREDIT','MANUAL_DEBT'].includes(subtype);
      if(f.candidate_id!==null&&row.candidate_id!==f.candidate_id||f.client_id!==null&&row.client_id!==f.client_id
        ||f.case_subtype!=='ALL'&&!(f.case_subtype===subtype||f.case_subtype==='PAYMENT_ADVANCE'&&['LOAN','PAYMENT_ADVANCE'].includes(subtype)||f.case_subtype==='UNMAPPED'&&!known)
        ||!known&&(row.gap_code===null||row.tax_label!=='Tax treatment unavailable')
        ||f.hide_completed&&['CLOSED','WRITTEN_OFF'].includes(row.status)
        ||f.view==='ACTIVE'&&(!['OPEN','PAUSED'].includes(row.status)||row.has_active_snooze!==false)||f.view==='HISTORY'&&!['CLOSED','WRITTEN_OFF'].includes(row.status)
        ||f.view==='SNOOZED'&&row.has_active_snooze!==true||f.snooze==='FINITE'&&(row.active_snooze_count===null||BigInt(row.active_snooze_count)<=BigInt(row.indefinite_snooze_count))
        ||f.snooze==='INDEFINITE'&&(row.indefinite_snooze_count===null||row.indefinite_snooze_count==='0'))bad();
      previous=row.sort_key;
    }
  }
  return payload;
}

  function createTransport(options) {
    if (typeof options?.api !== 'function' || typeof options.authFetch !== 'function') fail('DEPENDENCY_UNAVAILABLE');
    async function call(path, init, frozenRead = false, context = null, timeoutMs = options.timeoutMs ?? LIMITS.timeout) {
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
      try { return await Promise.race([task, new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Failure('TIMEOUT')); }, timeoutMs); })]); }
      finally { clearTimeout(timer); }
    }
    return Object.freeze({
      async capabilities(){return capabilityReceipt(await call('/api/banking/capabilities?scope=NEXT',{method:'GET'},true),environment(options));},
      async reauthPreview(action,args){
        const bytes=reauthIntentBody(action,args);
        if(!reauthAction(action) || Object.hasOwn(args,'reauth_token'))fail('REQUEST_INVALID');
        const body=await call('/api/banking/pay/next/reauth-preview',{method:'POST',body:bytes},false,{action,args},8000);
        if(!record(body)||Object.keys(body).length!==2||body.ok!==true||!shape(body.preview,
          {action_kind:'label',action_label:'label',candidate_count:action==='PAYE_SAME_WEEK_OVERRIDE'?'null':'numberPositive',candidate_name:'label',total_amount:action==='PAYE_SAME_WEEK_OVERRIDE'?'null':'cash',amount_basis:'label',scope_sha256:'sha?',accepted:'boolean',second_factor_required:'boolean'})
          ||body.preview.action_kind!==action||(action==='PAYE_SAME_WEEK_OVERRIDE'?body.preview.candidate_count!==null:body.preview.candidate_count!==1)
          ||(action==='PAYE_SAME_WEEK_OVERRIDE'?body.preview.amount_basis!=='PAYE_POLICY':!['CASH','DRAFT_GROSS'].includes(body.preview.amount_basis))
          ||(body.preview.scope_sha256===null&&!(action==='CSV_ISSUE'&&body.preview.accepted)))fail();
        return Object.freeze({...body.preview});
      },
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
        if(!record(body)||Object.keys(body).length!==6||!shape(body.origin,FROZEN_ORIGIN)
          ||(body.origin.origin_kind==='DAILY'&&(body.origin.sheet_scope!=='DAILY'||body.origin.contract_id!==null||body.origin.work_date===null))
          ||(body.origin.origin_kind==='CONTRACT'&&body.origin.contract_id===null)
          ||((body.origin.classification==='CLASSIFIED')!==(body.origin.client_id!==null)))fail();
        const {origin,...page}=body;
        if (!shapePage(page,kind,args.limit) || !body.rows.every(r=>shape(r,DETAIL_ROWS[kind]))) fail();
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
          else if((row.rate_family===args.after_rate_family&&row.rate_code===args.after_rate_code)||(row.rate_family!=='STANDARD'&&[row.paye_rate,row.umbrella_rate,row.charge_rate].every(v=>v===null))||(row.rate_family==='STANDARD'&&!field(row.rate_code,'bucket'))||(row.rate_family==='MILEAGE'&&row.rate_code!=='MILE'))fail();
        }
        const cursor=body.complete?null:detailCursor(kind,body.rows.at(-1));if(JSON.stringify(body.next_cursor)!==JSON.stringify(cursor))fail();
        return body;
      },
      async page(kind, args) {
        if(['CASE_LIST','CASE_SUMMARY'].includes(kind)){
          if(!record(args)||Object.keys(args).some(key=>!['filters','after',...(kind==='CASE_LIST'?['sort','limit']:[])].includes(key)))fail('REQUEST_INVALID');
          const query=new URLSearchParams({kind});for(const [key,value]of Object.entries(args))query.set(key,['filters','after'].includes(key)?JSON.stringify(value):String(value));
          const callArgs=caseListCall(kind,query);if(encoder.encode(query.toString()).byteLength>32768)fail('REQUEST_INVALID');
          const body=await call('/api/banking/pay/next/preparation-page?'+query.toString(),{method:'GET'},false,null,2000);
          if(!record(body)||body.ok!==true||body.kind!==kind)fail();
          const {ok,kind:returnedKind,...payload}=body;caseListResult(payload,{...callArgs,actorUserId:options.actorId.toLowerCase()},()=>fail());return body;
        }

        if(['CASE_AUDIT','CANDIDATE_CASE_REPORT'].includes(kind)){
          const contract=globalThis.CloudTMSBpayNextCaseAuditContract;if(!contract?.caseFinanceInput(kind,args))fail('REQUEST_INVALID');
          const query=new URLSearchParams({kind});for(const [key,value] of Object.entries(args))query.set(key,['after','limit','active_only','include_count'].includes(key)?JSON.stringify(value):value);
          if(encoder.encode(query.toString()).byteLength>32768)fail('REQUEST_INVALID');
          const body=await call('/api/banking/pay/next/preparation-page?'+query.toString(),{method:'GET'},false,null,options.timeoutMs??LIMITS.timeout);
          if(!record(body)||body.ok!==true||body.kind!==kind)fail();
          const {ok,...payload}=body;try{contract.caseFinanceResult(payload,kind,args,options.actorId.toLowerCase());}catch{fail();}
          return body;
        }
        const pageSchema=kind==='WORKERS'&&Object.hasOwn(args,'attention_only')?{...PAGES.WORKERS,attention_only:'true'}:kind==='CASE_PREVIEW'&&(Object.hasOwn(args,'case_id')||Object.hasOwn(args,'expected_case_revision'))?{input:'caseInput',case_id:'uuid',expected_case_revision:'positive'}:kind==='CASE_COMPONENTS'?{...PAGES.CASE_COMPONENTS,...(Object.hasOwn(args,'edit_command_id')?{edit_command_id:'uuid'}:{}),...(Object.hasOwn(args,'pause_command_id')?{pause_command_id:'uuid'}:{})}:kind==='GUARD'&&Object.hasOwn(args,'descriptor')?{run_id:'uuid',descriptor:'descriptor'}:kind==='WORK_CHOICES'&&Object.hasOwn(args,'accepted_inputs')?{run_id:'uuid',accepted_inputs:'true',after_member_no:'positive?',limit:'limit',...(Object.hasOwn(args,'member_kind')?{member_kind:'choiceMember'}:{})}:PAGES[kind];
        if (!Object.hasOwn(PAGES, kind) || !shape(args, pageSchema) || (kind === 'CURRENT_WORK' && (args.after_week === null) !== (args.after_work_id === null))) fail('REQUEST_INVALID');
        const query = new URLSearchParams({ kind }); for (const [k, v] of Object.entries(args)) if (v !== null) query.set(k, (k==='descriptor'||k==='input'||['PREPARE_ISSUES','REVIEW_CASES'].includes(kind)&&k==='after')?JSON.stringify(v):String(v));
        if(kind==='GUARD'&&encoder.encode(query.toString()).byteLength>128*1024)fail('REQUEST_INVALID');
        let body = await call('/api/banking/pay/next/preparation-page?' + query.toString(), { method: 'GET' },false,null,kind==='PROGRESS'?Math.min(options.timeoutMs??LIMITS.timeout,2000):options.timeoutMs??LIMITS.timeout);
  if(['REVIEW_TOTALS','REVIEW_CASES'].includes(kind)){const {ok,kind:replyKind,...payload}=body;if(ok!==true||replyKind!==kind)fail();return {ok,kind,...reviewResult(payload,kind,args,options.actorId.toLowerCase(),field,shape,()=>fail())};}
  if(kind==='PREPARE_ISSUES'){const {ok,kind:replyKind,...payload}=body;if(ok!==true||replyKind!==kind)fail();return {ok,kind,...prepareIssuesResult(payload,args,options.actorId.toLowerCase(),field,shape,()=>fail())};}
  if(kind==='CASE_PREVIEW'){
    if(!record(body)||Object.keys(body).sort().join()!=='complete,kind,next_cursor,ok,rows'||body.ok!==true||body.kind!==kind
      ||body.complete!==true||body.next_cursor!==null||!Array.isArray(body.rows)||body.rows.length!==1||!cases.casePreview(body.rows[0],args.input,args.case_id?args:null))fail();
    return body;
  }
  if(kind==='GUARD'){
    if(!shape(body,{ok:'true',kind:'label',rows:'guardRows',complete:'true',next_cursor:'null'})||body.kind!==kind)fail();
    const g=body.rows[0];if(!same(g.run_id,args.run_id)||g.guard_applies!==(g.paye_candidates!=='0'&&g.existing.length>0)
      ||g.unexecuted!==g.existing.some(x=>x.unexecuted)||g.channel_scope!==({NONE:'ALL',UMBRELLA_ONLY:'UMBRELLA',VERIFY_BOTH:'ALL',VERIFY_PAYE:'PAYE'})[g.decision])fail();
    if(args.descriptor){const d=args.descriptor,c=g.context;
      if(c.workbench_revision!==d.workbench_revision||c.adoption_revision!==d.adoption_revision
        ||['agency_id','owner_epoch','actor_user_id','official_pay_date'].some(k=>c.namespace[k]!==d.namespace[k])
        ||['candidate_id','client_id','channel'].some(k=>c.namespace.scope[k]!==d.namespace.scope[k]))fail();}
    return body;
  }
  if(kind==='PROGRESS'){
    if(!record(body)||Object.keys(body).sort().join()!=='complete,kind,next_cursor,ok,rows'||body.ok!==true||body.kind!==kind
      ||body.complete!==true||body.next_cursor!==null||!Array.isArray(body.rows)||body.rows.length!==1||!shape(body.rows[0],ROWS.PROGRESS))fail();
    const p=body.rows[0],n=k=>BigInt(p[k]);
    if(!same(p.run_id,args.run_id)||!p.actor_display_name.trim()
      ||n('ready')+n('review')+n('pending')+n('removed')!==n('selected_candidates')
      ||!validDiscardProgress(p)
      ||n('preparing')>n('pending')||n('enrolled_candidates')>n('selected_candidates')
      ||(p.enrolment_complete&&n('enrolled_candidates')!==n('selected_candidates'))
      ||Date.parse(p.expires_at_utc)-Date.parse(p.started_at_utc)!==72*60*60*1000
      ||(p.expired_at_utc!==null&&(p.status!=='CANCELLED'||n('pending')!==0n||n('preparing')!==0n
        ||Date.parse(p.expired_at_utc)<Date.parse(p.expires_at_utc))))fail();
    return body;
  }
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
        if(kind==='WORK_CHOICES'&&args.accepted_inputs===true&&args.member_kind==='CASE_COMPONENT'){
          const schema={run_id:'uuid',candidate_id:'uuid?',selection_revision:'positive',selection_state:'selection',page_count:'integer',item_count:'integer',selected_count:'integer',excluded_count:'integer',expected_count:'integer',candidate_complete:'boolean'};
          if(!record(body)||Object.keys(body).sort().join()!=='complete,header,kind,next_cursor,ok,rows'||body.ok!==true||body.kind!==kind
            ||!shape(body.header,schema)||!same(body.header.run_id,args.run_id)||!Array.isArray(body.rows)||body.rows.length>args.limit
            ||typeof body.complete!=='boolean'||!body.complete&&!body.rows.length)fail();
          const h=body.header;let previous=BigInt(args.after_member_no??'0');const ids=new Set();
          if(h.selection_revision!=='1'||BigInt(h.item_count)!==BigInt(h.selected_count)+BigInt(h.excluded_count)
            ||BigInt(h.item_count)>BigInt(h.expected_count)||(h.page_count==='0')!==(h.item_count==='0')
            ||h.selection_state==='SEALED'&&h.item_count!==h.expected_count
            ||(h.candidate_id===null)!==(body.rows.length===0)||h.candidate_id===null&&(!body.complete||h.expected_count!=='0'||h.item_count!=='0'||!h.candidate_complete))fail();
          for(const row of body.rows){if(!shape(row,{member_no:'positive',candidate_id:'uuid',case_component_id:'uuid',selected:'boolean',uploaded:'boolean'})
            ||!same(row.candidate_id,h.candidate_id)||BigInt(row.member_no)!==previous+1n||ids.has(row.case_component_id)
            ||h.selection_state==='SEALED'&&!row.uploaded)fail();previous=BigInt(row.member_no);ids.add(row.case_component_id);}
          if(body.complete&&!h.candidate_complete)fail();
          const cursor=body.complete?null:{after_member_no:String(previous)};if(JSON.stringify(body.next_cursor)!==JSON.stringify(cursor))fail();return body;
        }
        if(kind==='WORK_CHOICES'&&args.accepted_inputs===true){
          if(!record(body)||Object.keys(body).sort().join()!=='complete,header,kind,next_cursor,ok,rows'||body.ok!==true||body.kind!==kind
            ||!shape(body.header,{run_id:'uuid',uploaded_choice_work_count:'integer',selection_page_count:'integer',selection_count:'integer',exclusion_page_count:'integer'})||!same(body.header.run_id,args.run_id)||!Array.isArray(body.rows)||body.rows.length>args.limit
            ||typeof body.complete!=='boolean'||(!body.complete&&!body.rows.length))fail();
          let previous=BigInt(args.after_member_no??'0');const ids=new Set();
          for(const row of body.rows){if(!shape(row,{member_no:'positive',candidate_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',selection_mode:'mode',skip_code:'skipCode?',choice_state:'selection?',component_page_count:'integer?',component_count:'integer?'})||BigInt(row.member_no)!==previous+1n||ids.has(row.work_id.toLowerCase()))fail();if((row.skip_code!==null)!==(row.choice_state===null)||(row.choice_state===null)!==(row.component_page_count===null)||(row.choice_state===null)!==(row.component_count===null)||row.choice_state!==null&&row.selection_mode==='ALL'&&(row.choice_state!=='SEALED'||row.component_page_count!=='0'||row.component_count!=='0'))fail();previous=BigInt(row.member_no);ids.add(row.work_id.toLowerCase());}
          const cursor=body.complete?null:{after_member_no:String(previous)};if(JSON.stringify(body.next_cursor)!==JSON.stringify(cursor))fail();return body;
        }
        if(kind==='CHANNEL_DRAFTS'){
          if(!record(body)||Object.keys(body).length!==5||!['ok','kind','rows','complete','next_cursor'].every(k=>Object.hasOwn(body,k))||body.ok!==true||body.kind!==kind||body.complete!==true||body.next_cursor!==null||!field(body.rows,'drafts')||body.rows.some(d=>!same(d.run_id,args.run_id)))fail();
          return body;
        }
        const statusKind=kind==='STATUS'||kind==='CHANNEL_STATUS',workerKind=kind==='WORKERS'||kind==='CHANNEL_WORKERS';
        const keys = ['STATUS','CHANNEL_STATUS','RETURN_CASH'].includes(kind) ? ['ok', 'kind', 'header', 'rows', 'complete', 'next_cursor'] : ['ok', 'kind', 'rows', 'complete', 'next_cursor'];
        if(kind==='WORKERS'&&args.attention_only===true&&body.rows?.some(row=>row.retry_count!=='5'||!['NEW','PINNING','RESERVE','ALLOCATE','FINANCE_ALLOCATE','WORKBENCH_WORK','WORKBENCH_CASE'].includes(row.phase)))fail();
        if(kind==='WORKERS'&&!args.attention_only&&body.rows?.some(row=>(row.discard_outcome==='BLOCKED')!==(row.discard_blocked_code!==null)))fail();
        if (!record(body) || Object.keys(body).length !== keys.length || keys.some(k => !Object.hasOwn(body, k)) || body.ok !== true || body.kind !== kind || !Array.isArray(body.rows) || body.rows.length > args.limit || typeof body.complete !== 'boolean' || (!body.complete && body.rows.length === 0 && kind!=='RETURN_CASH') || !body.rows.every(r => shape(r, kind==='WORKERS'&&args.attention_only===true?{run_worker_id:'uuid',candidate_id:'uuid',candidate_display_name:'label',pay_channel:'channel',worker_status:'worker',job_id:'uuid',work_id:'null',module_epoch:'positive',owner_epoch:'positive',phase:'label',cursor:'label?',retry_count:'positive',last_error_code:'issue?',retry_eligible:'boolean'}:ROWS[statusKind?'STATUS':kind]))) fail();
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
        let prior = kind === 'CURRENT_WORK' ? (args.after_week === null ? null : [args.after_week, args.after_work_id]) : (statusKind ? args.after_transfer_no : (args.after_detail_no ?? args.after_break_no ?? args.after_bucket ?? args.after_case_id ?? args.after_component_ordinal ?? args.after_candidate_id ?? args.after_line_no ?? args.after_selection_no ?? args.after_work_id ?? null));
        for (const r of body.rows) {
      if(kind==='COMPONENTS'){
        if((r.associated_rate_schedule_id===null)!==(r.associated_rate_family===null)||(r.associated_rate_schedule_id===null)!==(r.associated_rate_code===null)
          ||(r.associated_rate_schedule_id===null&&['available_paye_rate','available_umbrella_rate','available_charge_rate','approved_charge_rate'].some(k=>r[k]!==null))
          ||(r.original_timesheet_id===null&&r.original_work_ref!==null))fail();
      }
      if(kind==='RATES'&&r.rate_schedule_id===null&&['available_paye_rate','available_umbrella_rate','available_charge_rate','approved_charge_rate'].some(k=>r[k]!==null))fail();
      if(kind==='SHIFTS'&&r.segment_key===null&&r.approved_segment_id!==null)fail();
          if(statusKind&&!validReservation(body.header,r))fail();
          const v = kind==='COMPONENTS'?r.line_no:kind==='SHIFTS'?r.detail_no:kind==='BREAKS'?r.break_no:kind==='RATES'?r.bucket:kind === 'CURRENT_WORK' ? [r.week_ending_date, r.work_id] : kind === 'CURRENT_CASES' ? r.case_id : kind === 'CASE_COMPONENTS' ? r.component_ordinal : kind==='SELECTED_COMPONENTS'?r.selection_no:statusKind ? r.transfer_no : workerKind ? r.candidate_id : kind === 'LINES' ? r.line_no : r.work_id;
          if (prior !== null) { const ordered = Array.isArray(v) ? v[0] > prior[0] || (v[0] === prior[0] && v[1] > prior[1]) : (statusKind||['LINES','CASE_COMPONENTS','SELECTED_COMPONENTS','COMPONENTS','SHIFTS','BREAKS'].includes(kind)) ? BigInt(v) > BigInt(prior) : v > prior; if (!ordered) fail(); }
          if(kind==='WORK_CHOICES'&&r.selection_mode==='ALL'&&(r.selection_state!=='SEALED'||r.page_count!=='0'||r.component_count!=='0'))fail();
          if(kind==='CASE_COMPONENTS'&&r.original_liability_reference!==null&&(r.case_kind!=='MANUAL_DEBT'||r.case_subtype!=='MANUAL_DEBT'))fail();
          if(kind==='CASE_COMPONENTS'&&(!same(r.pause_state.case_id,r.case_id)||!same(r.pause_state.candidate_id,r.candidate_id)
            ||(r.pause_receipt!==null&&(!same(r.pause_receipt.case_id,r.case_id)||!same(r.pause_receipt.candidate_id,r.candidate_id)||!same(r.pause_receipt.command_id,args.pause_command_id)))
            ||(Object.hasOwn(args,'pause_command_id')?(r.pause_receipt===null):r.pause_receipt!==null)))fail();
          if(kind==='CASE_COMPONENTS'&&(!same(r.edit_state.case_id,r.case_id)||!same(r.edit_state.candidate_id,r.candidate_id)
            ||(r.edit_receipt!==null&&(!same(r.edit_receipt.case_id,r.case_id)||!same(r.edit_receipt.candidate_id,r.candidate_id)||!same(r.edit_receipt.command_id,args.edit_command_id)))
            ||(Object.hasOwn(args,'edit_command_id')?(r.edit_receipt===null):r.edit_receipt!==null)))fail();
          if (['CURRENT_CASES','CASE_COMPONENTS'].includes(kind) && (!same(r.candidate_id,args.candidate_id) || (kind === 'CASE_COMPONENTS' && !same(r.case_id,args.case_id)))) fail();
          if (kind === 'CURRENT_WORK' && (!same(r.candidate_id, args.candidate_id) || (r.position_ready&&(r.approval_state!=='APPROVED'||r.current_revision_id===null||!same(r.current_revision_id,r.applied_revision_id))))) fail(); prior = v;
        }
        const cursor = body.complete ? null : kind === 'CURRENT_WORK' ? { after_week: prior[0], after_work_id: prior[1] } : { [kind==='COMPONENTS'?'after_line_no':kind==='SHIFTS'?'after_detail_no':kind==='BREAKS'?'after_break_no':kind==='RATES'?'after_bucket':kind === 'CURRENT_CASES' ? 'after_case_id' : kind === 'CASE_COMPONENTS' ? 'after_component_ordinal' : kind==='SELECTED_COMPONENTS'?'after_selection_no':statusKind ? 'after_transfer_no' : workerKind ? 'after_candidate_id' : kind === 'LINES' ? 'after_line_no' : 'after_work_id']: prior };
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
    const allowed=new Set(['CREATE','PAYE_GUARD_DECISION','WORK_PAGE','EXCLUSION_PAGE','MATCHING_PAGE','COMPONENT_PAGE','COMPONENT_SEAL','CASE_PAGE','CASE_SEAL','SEAL_ENQUEUE']);
    const upload=()=>({member_no:null,subset_cursor:'0',subset:null,component_page:'0',component_count:'0',component_scan_after:null,component_scan_count:'0',component_ready:false,remaining_ids:[],exclusion_page:'0'});
    const inputRow={member_no:'positive',candidate_id:'uuid',work_id:'uuid',expected_revision_id:'uuid',selection_mode:'mode',skip_code:'skipCode?',choice_state:'selection?',component_page_count:'integer?',component_count:'integer?'};
    const readback=()=>({work_cursor:null,work_page:[],work_complete:false,index:0,component_cursor:null,component_count:'0',seen_works:'0'});
    let storage=null,persistent=false;

    try{storage=options.storage??options.window?.localStorage??null;persistent=Boolean(storage);}catch{}
    function valid(value){
      if(!record(value)||Object.keys(value).sort().join()!==['version','descriptor','run_id','command_id','create_receipt','last_receipt','pending','phase','selection_pages','selection_count','readback',...(Object.hasOwn(value,'upload')?['upload']:[]),...(Object.hasOwn(value,'case_upload')?['case_upload']:[])].sort().join()
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
          if(['CREATE','PAYE_GUARD_DECISION'].includes(action)&&(!same(args.command_id,value.command_id)||JSON.stringify(args.descriptor)!==JSON.stringify(value.descriptor)
            ||(saved===value.pending&&value.phase!=='CREATE')))return false;
          if(!['CREATE','PAYE_GUARD_DECISION'].includes(action)&&(value.create_receipt===null||value.create_receipt.empty))return false;
          if(action==='SEAL_ENQUEUE'&&(!same(args.command_id,value.command_id)||args.expected_pages!==value.selection_pages||args.expected_count!==value.selection_count))return false;
          if(['WORK_PAGE','MATCHING_PAGE'].includes(action)&&saved===value.pending&&args.page_no!==String(BigInt(value.selection_pages)+1n))return false;
          if(saved===value.last_receipt){
            // Only the closed historical journal receipt may restore its original
            // attempted count; every new network receipt requires the native count.
            const historical=action==='SEAL_ENQUEUE'&&['READBACK','COMPLETE'].includes(value.phase)
              &&shape(saved.result,{run_id:'uuid',command_id:'uuid',agency_sequence:'positive',replay:'boolean'});
            receipt(historical?{...saved.result,selection_count:args.expected_count}:saved.result,action,args);
          }
          if(saved===value.last_receipt&&action==='SEAL_ENQUEUE'&&saved.result.agency_sequence!==value.create_receipt.agency_sequence)return false;
        }
      }catch{return false;}
      if(Object.hasOwn(value,'upload')){const u=value.upload;if(!record(u)||Object.keys(u).sort().join()!==Object.keys(upload()).sort().join()
        ||!field(u.member_no,'positive?')||!integer(u.subset_cursor)||!integer(u.component_page)||!integer(u.exclusion_page)
        ||!integer(u.component_count)||!integer(u.component_scan_count)||!field(u.component_scan_after,'positive?')||typeof u.component_ready!=='boolean'
        ||!Array.isArray(u.remaining_ids)||u.remaining_ids.length>1000||!u.remaining_ids.every(id=>field(id,'uuid'))||new Set(u.remaining_ids.map(id=>id.toLowerCase())).size!==u.remaining_ids.length
        ||(u.subset!==null&&(!shape(u.subset,inputRow)||u.subset.selection_mode!=='SUBSET'))||u.subset===null&&u.component_page!=='0')return false;}
      if(Object.hasOwn(value,'case_upload')&&!shape(value.case_upload,{after_member_no:'positive?'}))return false;
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
      else{if(options.resumeOnly===true)return null;const run_id=options.uuid(),command_id=options.uuid();if(!field(run_id,'uuid')||!field(command_id,'uuid'))fail('DEPENDENCY_UNAVAILABLE');state={version:1,descriptor,run_id:run_id.toLowerCase(),command_id:command_id.toLowerCase(),create_receipt:null,last_receipt:null,pending:null,phase:'CREATE',selection_pages:'0',selection_count:'0',readback:readback(),upload:upload()};}
      choiceSubmissionMemory.set(key,state);
    }
    if(!valid(state))fail('JOURNAL_INVALID');
    // Upgrade only the exact validated prior schema; retain original unknown bytes.
    if(!Object.hasOwn(state,'upload'))state.upload=upload();
    if(!Object.hasOwn(state,'case_upload'))state.case_upload={after_member_no:null};
    const operation=choiceSubmissionOperations.get(key)??{busy:false,retired:false,sequencing:false};
    choiceSubmissionOperations.set(key,operation);
    const snapshot=()=>immutable(clone({...state,busy:operation.busy||operation.sequencing,persistent}));
    function save(next){if(!valid(next))fail('JOURNAL_TOO_LARGE');Object.assign(state,clone(next));try{if(storage){storage.setItem(key,JSON.stringify(state));persistent=true;}}catch{persistent=false;}options.onChange?.(snapshot());}
    function authority(){requireActor(options);if(operation.retired||choiceSubmissionMemory.get(key)!==state||choiceSubmissionOperations.get(key)!==operation)fail('ACCEPTED_IDENTITY_CONFLICT');if(options.ownerReady()!==true)fail('OWNER_UNAVAILABLE');}
    async function dispatch(unknown){
      authority();operation.busy=true;options.onChange?.(snapshot());
      try{
        const pending=clone(state.pending);
        if(await hash(pending.bytes)!==pending.body_sha256)fail('JOURNAL_INVALID');
        const {action,...args}=JSON.parse(pending.bytes),result=receipt(await options.transport.mutation(action,pending.bytes),action,args);
        authority();if(state.pending===null||state.pending.action!==pending.action||state.pending.bytes!==pending.bytes||state.pending.body_sha256!==pending.body_sha256)fail('ACCEPTED_IDENTITY_CONFLICT');
        if(['WORK_PAGE','MATCHING_PAGE'].includes(action)&&(result.selection_count!==state.create_receipt.selection_count||result.selected_candidate_count!==state.create_receipt.selected_candidate_count))fail('RESPONSE_INVALID');
        if(action==='EXCLUSION_PAGE'){
          const exclusions=state.descriptor.intent.candidates.filter(row=>!row.selected).length+state.descriptor.intent.works.filter(row=>!row.selected).length;
          if(result.complete!==(BigInt(args.page_no)===BigInt(Math.max(1,Math.ceil(exclusions/100)))))fail('RESPONSE_INVALID');
        }
        const next={...state,pending:null,last_receipt:{...pending,result}};
        if(['CREATE','PAYE_GUARD_DECISION'].includes(action)){const {decision,channel_scope,...original}=result;next.create_receipt=original;next.selection_count=result.selection_count;next.phase=result.empty?'EMPTY':'SUBSETS';}
        if(action==='WORK_PAGE'){next.selection_pages=result.page_no;next.selection_count=result.selection_count;
          if(state.upload.member_no!==null||state.selection_pages==='0')next.upload={...state.upload,member_no:String(BigInt(state.upload.member_no??'0')+BigInt(result.item_count))};
          if(state.phase==='SUBSETS'&&state.upload.subset&&args.choices.length===1&&same(args.choices[0].work_id,state.upload.subset.work_id)&&result.skipped.length){
            next.upload={...next.upload,subset_cursor:state.upload.subset.member_no,subset:null,component_page:'0',component_count:'0',component_scan_after:null,component_scan_count:'0',component_ready:false,remaining_ids:[]};
          }
        }
        if(action==='COMPONENT_PAGE'&&state.phase==='SUBSETS'&&state.upload.subset&&same(args.work_id,state.upload.subset.work_id)){
          if(!state.upload.component_ready||args.page_no!==String(BigInt(state.upload.component_page)+1n)||result.component_count!==String(BigInt(state.upload.component_count)+BigInt(args.approved_line_ids.length))
            ||args.approved_line_ids.some(id=>!state.upload.remaining_ids.some(remaining=>same(remaining,id))))fail('RESPONSE_INVALID');
          next.upload={...state.upload,component_page:result.page_no,component_count:result.component_count,remaining_ids:state.upload.remaining_ids.filter(id=>!args.approved_line_ids.some(sent=>same(sent,id)))};
        }
        if(action==='COMPONENT_SEAL'&&state.phase==='SUBSETS'&&state.upload.subset&&same(args.work_id,state.upload.subset.work_id))next.upload={...state.upload,subset_cursor:state.upload.subset.member_no,subset:null,component_page:'0',component_count:'0',component_scan_after:null,component_scan_count:'0',component_ready:false,remaining_ids:[]};
        if(action==='EXCLUSION_PAGE'){next.upload={...state.upload,exclusion_page:result.page_no};if(result.complete)next.phase=state.descriptor.intent.mode==='ALL_MATCHING'?'MATCHING':'EXPLICIT';}
        if(action==='MATCHING_PAGE'){next.selection_pages=result.page_no;next.selection_count=result.selection_count;const attempted=BigInt(args.after_member_no??'0')+BigInt(result.item_count);next.upload={...state.upload,member_no:attempted===0n?null:String(attempted)};if(result.complete)next.phase='CASES';}

        if(action==='SEAL_ENQUEUE'){
          if(!state.create_receipt||!same(result.command_id,state.command_id)||result.agency_sequence!==state.create_receipt.agency_sequence)fail('ACCEPTED_IDENTITY_CONFLICT');
          rememberPreparation(options,{version:1,run_id:state.run_id,command_id:result.command_id,agency_sequence:result.agency_sequence,namespace:state.descriptor.namespace,readback_complete:false});
          next.phase='READBACK';next.readback=readback();
        }
        save(next);return result;
      }catch(error){if(!unknown&&error instanceof Failure&&['SERVER_REFUSED','AUTH_REQUIRED'].includes(error.code)&&!error.unknown)save({...state,pending:null});throw error;}
      finally{operation.busy=false;options.onChange?.(snapshot());}
    }
    async function submit(action,args,internal=false){
        authority();if(operation.busy||state.pending!==null||(operation.sequencing&&!internal))fail('OUTCOME_UNKNOWN');
        if(!allowed.has(action)||!same(args?.run_id,state.run_id))fail('REQUEST_INVALID');
        if(['CREATE','PAYE_GUARD_DECISION'].includes(action)){if(state.phase!=='CREATE'||JSON.stringify(args.descriptor)!==JSON.stringify(state.descriptor)||!same(args.command_id,state.command_id))fail('REQUEST_INVALID');}
        else if(!state.create_receipt||state.create_receipt.empty||['READBACK','COMPLETE'].includes(state.phase))fail('REQUEST_INVALID');
        if(['WORK_PAGE','MATCHING_PAGE'].includes(action)&&args.page_no!==String(BigInt(state.selection_pages)+1n))fail('REQUEST_INVALID');
        if(action==='SEAL_ENQUEUE'&&(!same(args.command_id,state.command_id)||args.expected_pages!==state.selection_pages||args.expected_count!==state.selection_count))fail('REQUEST_INVALID');
        const bytes=requestBody(action,args),body_sha256=await hash(bytes);
        authority();if(operation.busy||state.pending!==null||(operation.sequencing&&!internal))fail('OUTCOME_UNKNOWN');save({...state,pending:{action,bytes,body_sha256}});return dispatch(false);
      }
    return Object.freeze({key,snapshot,
      async decide(decision,reason,token){return this.mutate('PAYE_GUARD_DECISION',{run_id:state.run_id,command_id:state.command_id,descriptor:state.descriptor,decision,reason,...(token===null?{}:{reauth_token:token})});},
      retireUnaccepted(){authority();if(operation.busy||operation.sequencing||state.pending!==null||state.phase!=='CREATE'||state.create_receipt!==null)fail('OUTCOME_UNKNOWN');
        try{storage?.removeItem(key);}catch{fail('JOURNAL_INVALID');}operation.retired=true;choiceSubmissionMemory.delete(key);choiceSubmissionOperations.delete(key);},
      async create(){return this.mutate('CREATE',{run_id:state.run_id,command_id:state.command_id,descriptor:state.descriptor});},
      async mutate(action,args){return submit(action,args);},
      async retry(){if(operation.busy||operation.sequencing||state.pending===null)fail('NO_PENDING_REQUEST');return dispatch(true);},
      // WB23 uploads Work selection. WB26 advanceCases continues the original cut; DR cards own GUARD.
      async advanceSelection(){
        authority();if(operation.busy||operation.sequencing||state.pending!==null||!['SUBSETS','EXCLUSIONS','MATCHING','EXPLICIT'].includes(state.phase))fail('REQUEST_INVALID');
        operation.sequencing=true;options.onChange?.(snapshot());
        try{
          while(['SUBSETS','EXCLUSIONS','MATCHING','EXPLICIT'].includes(state.phase)){
            authority();
            if(state.phase==='SUBSETS'){
              let member=state.upload.subset;
              if(member===null){
                const before=state.upload.subset_cursor,page=await options.transport.page('WORK_CHOICES',{run_id:state.run_id,accepted_inputs:true,after_member_no:before==='0'?null:before,limit:1});authority();
                if(state.phase!=='SUBSETS'||state.upload.subset_cursor!==before)fail('ACCEPTED_IDENTITY_CONFLICT');
                if(page.header.selection_count!==state.selection_count||page.header.selection_page_count!==state.selection_pages)fail('ACCEPTED_IDENTITY_CONFLICT');
                if(!page.rows.length||page.rows[0].selection_mode==='ALL'){
                  save({...state,phase:'EXCLUSIONS',upload:{...state.upload,member_no:page.header.uploaded_choice_work_count==='0'?null:page.header.uploaded_choice_work_count}});continue;
                }
                member=page.rows[0];const remaining=state.descriptor.intent.components.filter(row=>same(row.work_id,member.work_id)&&same(row.expected_revision_id,member.expected_revision_id)&&row.selected).map(row=>row.approved_line_id).sort();
                save({...state,upload:{...state.upload,member_no:page.header.uploaded_choice_work_count==='0'?null:page.header.uploaded_choice_work_count,subset:member,
                  component_page:member.component_page_count??'0',component_count:member.component_count??'0',component_scan_after:null,component_scan_count:'0',component_ready:member.choice_state==='SEALED'||member.component_count==='0',remaining_ids:member.choice_state==='SEALED'?[]:remaining}});
              }
                if(BigInt(member.member_no)>BigInt(state.upload.member_no??'0')){
                  await submit('WORK_PAGE',{run_id:state.run_id,page_no:String(BigInt(state.selection_pages)+1n),choices:[{work_id:member.work_id,expected_revision_id:member.expected_revision_id,mode:'SUBSET'}]},true);
                  if(state.upload.subset===null)continue;
                }else if(member.skip_code!==null){save({...state,upload:{...state.upload,subset_cursor:member.member_no,subset:null,component_page:'0',component_count:'0',component_scan_after:null,component_scan_count:'0',component_ready:false,remaining_ids:[]}});continue;}
              if(!state.upload.component_ready){
                const before=state.upload.component_scan_after,page=await options.transport.page('SELECTED_COMPONENTS',{run_id:state.run_id,work_id:member.work_id,after_selection_no:before,limit:100});authority();
                if(state.phase!=='SUBSETS'||!same(state.upload.subset?.work_id,member.work_id)||state.upload.component_scan_after!==before)fail('ACCEPTED_IDENTITY_CONFLICT');
                let remaining=[...state.upload.remaining_ids];
                for(const row of page.rows){const index=remaining.findIndex(id=>same(id,row.approved_line_id));if(!same(row.expected_revision_id,member.expected_revision_id)||index<0)fail('RESPONSE_INVALID');remaining.splice(index,1);}
                const count=String(BigInt(state.upload.component_scan_count)+BigInt(page.rows.length));
                if(BigInt(count)>BigInt(state.upload.component_count)||page.complete&&count!==state.upload.component_count)fail('RESPONSE_INVALID');
                save({...state,upload:{...state.upload,remaining_ids:remaining,component_scan_count:count,component_scan_after:page.next_cursor?.after_selection_no??null,component_ready:page.complete}});continue;
              }
              if(state.upload.remaining_ids.length){
                await submit('COMPONENT_PAGE',{run_id:state.run_id,work_id:member.work_id,expected_revision_id:member.expected_revision_id,page_no:String(BigInt(state.upload.component_page)+1n),approved_line_ids:state.upload.remaining_ids.slice(0,100)},true);continue;
              }
              if(state.upload.component_page==='0'||state.upload.component_count==='0')fail('REQUEST_INVALID');
              await submit('COMPONENT_SEAL',{run_id:state.run_id,work_id:member.work_id,expected_revision_id:member.expected_revision_id,expected_pages:state.upload.component_page,expected_count:state.upload.component_count},true);continue;
            }
            if(state.phase==='EXCLUSIONS'){
              const candidates=state.descriptor.intent.candidates.filter(row=>!row.selected).map(row=>row.candidate_id).sort(),works=state.descriptor.intent.works.filter(row=>!row.selected).map(row=>row.work_id).sort();
              const pageNo=BigInt(state.upload.exclusion_page)+1n,start=Number((pageNo-1n)*100n),end=start+100;
              await submit('EXCLUSION_PAGE',{run_id:state.run_id,page_no:String(pageNo),excluded_candidate_ids:candidates.slice(start,end),excluded_work_ids:works.slice(Math.max(0,start-candidates.length),Math.max(0,end-candidates.length))},true);continue;
            }
            if(state.phase==='MATCHING'){
              await submit('MATCHING_PAGE',{run_id:state.run_id,page_no:String(BigInt(state.selection_pages)+1n),after_member_no:state.upload.member_no},true);continue;
            }
            const before=state.upload.member_no,page=await options.transport.page('WORK_CHOICES',{run_id:state.run_id,accepted_inputs:true,after_member_no:before,limit:100});authority();
            if(state.phase!=='EXPLICIT'||state.upload.member_no!==before||page.header.selection_page_count!==state.selection_pages||page.header.selection_count!==state.selection_count||page.header.uploaded_choice_work_count!==(before??'0'))fail('ACCEPTED_IDENTITY_CONFLICT');
            if(page.rows.some(row=>row.selection_mode!=='ALL'))fail('RESPONSE_INVALID');
            if(!page.rows.length){if(!page.complete)fail('RESPONSE_INVALID');save({...state,phase:'CASES'});continue;}
            await submit('WORK_PAGE',{run_id:state.run_id,page_no:String(BigInt(state.selection_pages)+1n),choices:page.rows.map(row=>({work_id:row.work_id,expected_revision_id:row.expected_revision_id,mode:'ALL'}))},true);
            if(page.complete)save({...state,phase:'CASES'});
          }
          return snapshot();
        }finally{operation.sequencing=false;options.onChange?.(snapshot());}
      },
      // WB26: scan only original retained Case membership; native counters own recovery.
      // Keep the cursor before the page until its upload and Candidate seal are known.
      // Old unknown CASE_PAGE bytes are retried unchanged, then this reader discovers them.
      async advanceCases(){
        authority();if(operation.busy||operation.sequencing||state.pending!==null||state.phase!=='CASES')fail('REQUEST_INVALID');
        operation.sequencing=true;options.onChange?.(snapshot());
        try{while(state.phase==='CASES'){
          const before=state.case_upload.after_member_no;
          const page=await options.transport.page('WORK_CHOICES',{run_id:state.run_id,accepted_inputs:true,member_kind:'CASE_COMPONENT',after_member_no:before,limit:100});
          authority();if(state.phase!=='CASES'||state.case_upload.after_member_no!==before)fail('ACCEPTED_IDENTITY_CONFLICT');
          const h=page.header,missing=page.rows.filter(row=>!row.uploaded);
          if(!page.rows.length){if(!page.complete)fail('RESPONSE_INVALID');save({...state,phase:'GUARD'});break;}
          if(missing.length){
            if(h.selection_state!=='OPEN')fail('RESPONSE_INVALID');
            await submit('CASE_PAGE',{run_id:state.run_id,candidate_id:h.candidate_id,selection_revision:h.selection_revision,
              page_no:String(BigInt(h.page_count)+1n),request_id:options.uuid(),component_ids:missing.map(row=>row.case_component_id),selected:missing.map(row=>row.selected)},true);
            continue;
          }
          if(h.candidate_complete&&h.selection_state!=='SEALED'){
            if(h.item_count!==h.expected_count||h.item_count==='0')fail('RESPONSE_INVALID');
            await submit('CASE_SEAL',{run_id:state.run_id,candidate_id:h.candidate_id,selection_revision:h.selection_revision,expected_pages:h.page_count,expected_items:h.item_count},true);
            continue;
          }
          save({...state,case_upload:{after_member_no:page.rows.at(-1).member_no},phase:page.complete?'GUARD':'CASES'});
        }return snapshot();}finally{operation.sequencing=false;options.onChange?.(snapshot());}
      },
      async sealEnqueue(){
        authority();if(operation.busy||operation.sequencing||state.pending!==null||!['GUARD','SEAL'].includes(state.phase))fail('REQUEST_INVALID');
        if(state.phase==='GUARD'){
          const g=(await options.transport.page('GUARD',{run_id:state.run_id})).rows[0];authority();
          if(g.guard_applies&&g.decision==='NONE'||g.unexecuted&&['VERIFY_BOTH','VERIFY_PAYE'].includes(g.decision))fail('GUARD_UNRESOLVED');
          save({...state,phase:'SEAL'});
        }
        return submit('SEAL_ENQUEUE',{run_id:state.run_id,command_id:state.command_id,expected_pages:state.selection_pages,expected_count:state.selection_count});
      },
      acknowledgeComplete(store){
        authority();if(operation.busy||state.pending!==null||!['COMPLETE','EMPTY'].includes(state.phase)
          ||typeof store?.acknowledge!=='function'||JSON.stringify(store.namespace)!==JSON.stringify(state.descriptor.namespace))fail('REQUEST_INVALID');
        if(state.phase==='COMPLETE'&&!rememberPreparation(options,{version:1,run_id:state.run_id,command_id:state.command_id,agency_sequence:state.create_receipt.agency_sequence,namespace:state.descriptor.namespace,readback_complete:true}))return false;
        try{storage?.removeItem(key);}catch{persistent=false;return false;}
        // Only completed sealed readback owns an acknowledged memory baseline.
        // An empty Create has no preparation command; keep its local choices.
        if(state.phase==='COMPLETE'&&Object.hasOwn(state.descriptor,'memory_baseline_run_id'))store.acknowledge(state.descriptor.revision,state.run_id);
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
    if(options.reviewRunId!==undefined&&!field(options.reviewRunId,'uuid'))fail('REQUEST_INVALID');
    const key = 'cloudtms.bpay-next.v1.' + options.actorId.toLowerCase()+(options.reviewRunId?'.run.'+options.reviewRunId.toLowerCase():'')+(options.reviewJournalQualifier??'');
    const debug = {workbenchReads:[]};
    const caseDefaults = { case_pages: '0', case_items: '0', case_selected_count: '0', case_excluded_count: '0', case_sealed: false, case_cursor: null, case_id: null, component_cursor: null, accepted_page_component_ids: [], accepted_page_component_selected: [] };
    const validWorkerAction=value=>{if(!shape(value,{...RECEIPT.WORKER_REPREPARE,request_bytes:'requestBytes'}))return false;try{const {action,...args}=JSON.parse(value.request_bytes);return action===(value.action==='REPREPARE'?'WORKER_REPREPARE':'WORKER_RELEASE')&&requestBody(action,args)===value.request_bytes&&same(args.command_id,value.command_id)&&same(args.run_worker_id,value.run_worker_id)&&args.expected_preparation_revision===value.expected_preparation_revision&&BigInt(value.preparation_revision)===BigInt(value.expected_preparation_revision)+1n;}catch{return false;}};
    const ids = rows => Array.isArray(rows) && rows.length <= 100 && rows.every(x => field(x,'uuid')) && new Set(rows.map(x=>x.toLowerCase())).size === rows.length;
    const validCases = value => ['case_pages','case_items','case_selected_count','case_excluded_count'].every(k=>integer(value[k])) && BigInt(value.case_items) === BigInt(value.case_selected_count) + BigInt(value.case_excluded_count) && (value.case_pages==='0') === (value.case_items==='0') && typeof value.case_sealed === 'boolean' && (!value.case_sealed || positive(value.case_pages)) && (value.case_cursor === null || shape(value.case_cursor,{after_case_id:'uuid'})) && (value.case_id === null || field(value.case_id,'uuid')) && (value.component_cursor === null || shape(value.component_cursor,{after_component_ordinal:'positive'})) && ids(value.accepted_page_component_ids) && Array.isArray(value.accepted_page_component_selected) && value.accepted_page_component_selected.length === value.accepted_page_component_ids.length && value.accepted_page_component_selected.every(v=>typeof v==='boolean') && (value.case_id !== null || (value.component_cursor === null && value.accepted_page_component_ids.length === 0));
    const validCasePause=(value,parent)=>{try{if(!record(value)||!['CASE_PAUSE','CASE_RESUME'].includes(value.action))return false;
      const {request_bytes,...accepted}=value,{action,...args}=JSON.parse(request_bytes);
      return shape(accepted,RECEIPT[value.action])&&requestBody(action,args)===request_bytes&&action===value.action
        &&same(args.command_id,value.command_id)&&same(args.case_id,value.case_id)&&args.expected_case_revision===value.expected_case_revision
        &&same(parent.case_id,value.case_id)&&same(parent.candidate_id,value.candidate_id);
    }catch{return false;}};
    let state = { version: 7, case_pause:null, case_edit:null, worker_action:null, accepted_prepare:null, drafts:[], pay_channel:null, actor_id: options.actorId.toLowerCase(), run_id: null, worker_id: null, candidate_id: null, selection_pages: '0', selection_count: '0', selection_sealed: false, current_cursor: null, accepted_page_work_ids: [], can_confirm: false, confirmed: false, review_revision: null, instruction_id: null, transfer_id: null, pending: null, prior_case_selected_count:'0', ...caseDefaults };
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
          const oldKeys=Object.keys(state).filter(k=>!['drafts','pay_channel','accepted_prepare','worker_action','case_edit','case_pause'].includes(k)).sort().join();
          if(Object.keys(value).sort().join()!==oldKeys)fail('JOURNAL_INVALID');
          value={...value,version:3,drafts:[],pay_channel:null};
        }
        if(record(value)&&value.version===3&&!Object.hasOwn(value,'accepted_prepare')){const oldKeys=Object.keys(state).filter(k=>!['accepted_prepare','worker_action','case_edit','case_pause'].includes(k)).sort().join();if(Object.keys(value).sort().join()!==oldKeys)fail('JOURNAL_INVALID');value={...value,version:4,accepted_prepare:null};}
        if(record(value)&&value.version===4&&!Object.hasOwn(value,'worker_action')){const oldKeys=Object.keys(state).filter(k=>!['worker_action','case_edit','case_pause'].includes(k)).sort().join();if(Object.keys(value).sort().join()!==oldKeys)fail('JOURNAL_INVALID');value={...value,version:5,worker_action:null};}
        if(record(value)&&value.version===5&&!Object.hasOwn(value,'case_edit')){const oldKeys=Object.keys(state).filter(k=>!['case_edit','case_pause'].includes(k)).sort().join();if(Object.keys(value).sort().join()!==oldKeys)fail('JOURNAL_INVALID');value={...value,version:6,case_edit:null};}
        if(record(value)&&value.version===6&&!Object.hasOwn(value,'case_pause')){const oldKeys=Object.keys(state).filter(k=>k!=='case_pause').sort().join();if(Object.keys(value).sort().join()!==oldKeys)fail('JOURNAL_INVALID');value={...value,version:7,case_pause:null};}
        if (!record(value) || value.version !== 7 || !(value.case_pause===null||validCasePause(value.case_pause,value)) || !(value.case_edit===null||shape(value.case_edit,RECEIPT.CASE_EDIT)&&same(value.case_edit.case_id,value.case_id)&&same(value.case_edit.rule_id,value.case_edit.command_id)) || !(value.worker_action===null||validWorkerAction(value.worker_action)) || !(value.accepted_prepare===null||shape(value.accepted_prepare,{command_id:'uuid',agency_sequence:'positive'})) || value.actor_id !== state.actor_id || Object.keys(value).sort().join() !== Object.keys(state).sort().join() || !['run_id','worker_id','candidate_id','instruction_id','transfer_id'].every(k => value[k] === null || field(value[k], 'uuid')) || !['selection_sealed','can_confirm','confirmed'].every(k=>typeof value[k]==='boolean') || !integer(value.selection_pages) || !integer(value.selection_count) || !integer(value.prior_case_selected_count) || !(value.current_cursor === null || shape(value.current_cursor,{after_week:'date',after_work_id:'uuid'})) || !ids(value.accepted_page_work_ids) || !validCases(value) || !(Array.isArray(value.drafts)&&(value.drafts.length===0||field(value.drafts,'drafts'))&&value.drafts.every(d=>same(d.run_id,value.run_id))) || !(value.pay_channel===null||(field(value.pay_channel,'channel')&&value.drafts.some(d=>d.pay_channel===value.pay_channel))) || !(value.review_revision === null || positive(value.review_revision)) || !(value.pending === null || (record(value.pending) && Object.keys(value.pending).length === 2 && typeof value.pending.action === 'string' && typeof value.pending.bytes === 'string' && JSON.parse(value.pending.bytes).action === value.pending.action && requestBody(value.pending.action, (({ action, ...args }) => args)(JSON.parse(value.pending.bytes))) === value.pending.bytes))) fail('JOURNAL_INVALID'); state = value; } catch { fail('JOURNAL_INVALID'); }
    }
    const notify = () => options.onChange?.(snapshot());
    const snapshot = () => Object.freeze({ ...state, case_pause:state.case_pause===null?null:Object.freeze({...state.case_pause}), case_edit:state.case_edit===null?null:Object.freeze({...state.case_edit}), worker_action:state.worker_action===null?null:Object.freeze({...state.worker_action}), accepted_prepare:state.accepted_prepare===null?null:Object.freeze({...state.accepted_prepare}), drafts:Object.freeze(state.drafts.map(d=>Object.freeze({...d}))), current_cursor:state.current_cursor===null?null:Object.freeze({...state.current_cursor}),case_cursor:state.case_cursor===null?null:Object.freeze({...state.case_cursor}),component_cursor:state.component_cursor===null?null:Object.freeze({...state.component_cursor}),accepted_page_work_ids:Object.freeze([...state.accepted_page_work_ids]),accepted_page_component_ids:Object.freeze([...state.accepted_page_component_ids]),accepted_page_component_selected:Object.freeze([...state.accepted_page_component_selected]),pending: state.pending === null ? null : Object.freeze({ ...state.pending }), busy });
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
      if(['WORKER_REPREPARE','WORKER_RELEASE'].includes(action)){if(!same(result.run_id,state.run_id)||!same(result.run_worker_id,state.worker_id))fail('ACCEPTED_IDENTITY_CONFLICT');next.can_confirm=false;next.review_revision=null;next.worker_action=['EXPIRED','DISCARDED'].includes(result.phase)?null:{...result,request_bytes:state.pending.bytes};}
      if(action==='PREPARATION_DISCARD'){if(!same(result.run_id,state.run_id))fail('ACCEPTED_IDENTITY_CONFLICT');next.can_confirm=false;next.review_revision=null;}
      if (action === 'CONFIRM') { next.confirmed = true; next.can_confirm = false; next.drafts=result.drafts.map(d=>({...d})); }
      if(action==='CASE_CREATE'){next.case_id=result.case_id;next.candidate_id=args.candidate_id;}
      if(['CASE_PAUSE','CASE_RESUME'].includes(action)){if(!same(state.candidate_id,result.candidate_id))fail('ACCEPTED_IDENTITY_CONFLICT');next.case_id=result.case_id;next.case_pause={...result,request_bytes:state.pending.bytes};}
      if(action==='CASE_EDIT'){next.case_id=result.case_id;next.candidate_id=args.candidate_id;next.case_edit={...result};}
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
      finishCaseCreation(caseId){if(busy||state.pending!==null||state.run_id!==null||state.worker_id!==null||!same(state.case_id,caseId))fail('REQUEST_INVALID');save({...state,case_id:null});},
      finishCaseEdit(commandId){if(busy||state.pending!==null||state.run_id!==null||state.worker_id!==null||!same(state.case_edit?.command_id,commandId))fail('REQUEST_INVALID');save({...state,case_id:null,case_edit:null});},
      finishCasePause(outcome){const a=state.case_pause;
        if(busy||state.pending!==null||state.run_id!==null||state.worker_id!==null||a===null||!cases.casePauseReceipt(outcome)||outcome.phase==='PENDING'
          ||!same(a.command_id,outcome.command_id)||!same(a.case_id,outcome.case_id)||!same(a.candidate_id,outcome.candidate_id)
          ||a.action!==outcome.action||a.sequence!==outcome.sequence||a.expected_case_revision!==outcome.expected_case_revision)fail('REQUEST_INVALID');
        save({...state,case_id:null,case_pause:null});},
      async mutate(action, args) { if (busy || state.pending !== null || state.case_edit!==null || state.case_pause!==null) fail('OUTCOME_UNKNOWN');
        if(reauthAction(action) && !Object.hasOwn(args||{},'reauth_token')
          && !(action==='CSV_ISSUE'&&same(args.instruction_id,state.instruction_id)&&same(args.transfer_id,state.transfer_id)))fail('AUTH_REQUIRED');
        const bytes = requestBody(action, args);
        if(action==='CANCEL_REQUEST'&&Object.hasOwn(args,'run_id')&&(!same(args.run_id,state.run_id)||args.pay_channel!==state.pay_channel||!same(args.run_worker_id,state.worker_id)))fail('REQUEST_INVALID');
        if(['CASE_PAGE','CASE_SEAL'].includes(action)&&(!same(args.run_id,state.run_id)||!same(args.candidate_id,state.candidate_id)||args.selection_revision!=='1'||state.case_sealed))fail('REQUEST_INVALID');
        if(action==='CASE_PAGE'&&(state.case_id===null||args.page_no!==String(BigInt(state.case_pages)+1n)))fail('REQUEST_INVALID');
        if(action==='CASE_SEAL'&&(args.expected_pages!==state.case_pages||args.expected_items!==state.case_items))fail('REQUEST_INVALID');
        if(action==='SEAL_ENQUEUE'&&state.case_pages!=='0'&&!state.case_sealed)fail('REQUEST_INVALID');
        if(['WORKER_REPREPARE','WORKER_RELEASE'].includes(action)&&(!state.selection_sealed||state.confirmed||state.worker_action!==null||!same(args.run_worker_id,state.worker_id)))fail('REQUEST_INVALID');
        if(action==='PREPARATION_DISCARD'&&(state.confirmed||state.worker_action!==null||!same(args.run_id,state.run_id)))fail('REQUEST_INVALID');
        save({ ...state,...(['PREPARATION_DISCARD','WORKER_REPREPARE','WORKER_RELEASE'].includes(action)?{can_confirm:false,review_revision:null}:{}), pending: { action, bytes } }); return dispatch(false); },
      async retry() { if (busy || state.pending === null) fail('NO_PENDING_REQUEST'); return dispatch(true); },
      bind(values) { if (busy || state.pending !== null || Object.keys(values).some(k => !['run_id','worker_id','candidate_id'].includes(k)) || (state.accepted_prepare!==null&&Object.hasOwn(values,'run_id')&&!same(values.run_id,state.run_id)) || (state.drafts.length!==0&&Object.hasOwn(values,'run_id')&&!same(values.run_id,state.run_id)) || !Object.values(values).every(v => field(v,'uuid')) || ((state.case_pages!=='0'||state.prior_case_selected_count!=='0')&&Object.hasOwn(values,'run_id')&&!same(values.run_id,state.run_id)) || (state.case_pages!=='0'&&!state.case_sealed&&!state.selection_sealed&&Object.hasOwn(values,'candidate_id')&&!same(values.candidate_id,state.candidate_id))) fail('REQUEST_INVALID'); const changed=['run_id','worker_id','candidate_id'].some(k=>Object.hasOwn(values,k)&&!same(values[k],state[k]));const changedChoice=!state.selection_sealed&&Object.hasOwn(values,'candidate_id')&&!same(values.candidate_id,state.candidate_id);save({ ...state, ...values,...(changed?{transfer_id:null,instruction_id:null}:{}),...(changedChoice?{...caseDefaults,prior_case_selected_count:String(BigInt(state.prior_case_selected_count)+(state.case_sealed?BigInt(state.case_selected_count):0n)),current_cursor:null,accepted_page_work_ids:[]}: {}) }); },
      async refreshWorkerAction(){if(busy||state.pending!==null||state.worker_action===null)fail('REQUEST_INVALID');const bytes=state.worker_action.request_bytes,action=JSON.parse(bytes).action;save({...state,pending:{action,bytes}});return dispatch(true);},
      settleWorkerAction(header,review){if(busy||state.pending!==null||state.worker_action===null)return false;const a=state.worker_action;if(!shape(header,STATUS_HEADER)||!shape(review,RECEIPT.REVIEW)||!same(header.run_id,state.run_id)||!same(header.run_worker_id,a.run_worker_id)||!same(review.run_id,state.run_id)||review.phase!=='REVIEW'||BigInt(header.preparation_revision)<BigInt(a.preparation_revision)||!(header.preparation_revision===a.preparation_revision||(a.phase==='COMPLETE'&&a.replay===true))||!(a.action==='RELEASE'?header.worker_status==='CANCELLED':['READY','REVIEW','CANCELLED'].includes(header.worker_status)))return false;save({...state,worker_action:null});return true;},
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
  // EX-01: this native child owns credential fields only. The server supplies
  // action/Candidate/amount; the existing caller owns the original command.
  // DR-10 / SCR-39: one original-cut policy choice, never a financial total.
  async function openPayeSameWeekGuard(options,guard,submission){
    requireActor(options);
    if(typeof options.showReadWindow!=='function'||typeof options.current!=='function'||!field([guard],'guardRows')
      ||!guard.guard_applies||!same(guard.run_id,submission.run_id)||!field(submission.command_id,'uuid')||!field(submission.descriptor,'descriptor'))fail('REQUEST_INVALID');
    const doc=options.document||document,win=options.window||window;
    const el=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
    const content=el('section',undefined,'bpay-next-paye-guard'),footer=el('div',undefined,'bpay-next-window-actions');
    const notice=el('div',undefined,'bpay-next-paye-banner '+(guard.unexecuted?'is-blocked':'is-warning'));
    notice.append(el('strong',guard.unexecuted?'An unpaid PAYE Draft already exists for this pay week.':'A paid PAYE Draft already exists for this pay week.'),
      el('p',guard.unexecuted?'Pay or cancel that Draft first, or create the Umbrella Draft only.':'Another PAYE Draft for the same week needs a verified override.'));
    content.append(notice);
    const subjects=el('div',undefined,'bpay-next-paye-subjects');
    for(const fact of guard.existing){const subject=el('div',undefined,'bpay-next-paye-subject');subject.append(el('strong','PAYE Draft'+(fact.reference?' · '+fact.reference:'')),el('span',fact.status));subjects.append(subject);}
    content.append(subjects);
    const choices=el('fieldset',undefined,'bpay-next-paye-choices');choices.append(el('legend','What to create'));
    const name='paye-choice-'+submission.run_id;
    let decision=guard.unexecuted?'UMBRELLA_ONLY':'VERIFY_BOTH',busy=false,closed=false,frame,resolve,reject;
    const done=new Promise((r,j)=>{resolve=r;reject=j;});
    const definitions=[['UMBRELLA_ONLY','Create Umbrella only',guard.umbrella_candidates+' Candidates. PAYE payments stay ticked.'],
      ['VERIFY_BOTH','Verify and create PAYE + Umbrella',guard.paye_candidates+' PAYE and '+guard.umbrella_candidates+' Umbrella Candidates.'],
      ['VERIFY_PAYE','Verify and create PAYE Draft',guard.paye_candidates+' Candidates.']];
    for(const [key,title,sub] of definitions){if(guard.unexecuted&&key!=='UMBRELLA_ONLY')continue;
      const label=el('label',undefined,'bpay-next-paye-choice'),radio=el('input');radio.type='radio';radio.name=name;radio.value=key;radio.checked=key===decision;
      radio.onchange=()=>{if(busy||!current())return;decision=key;paint();};label.append(radio,el('strong',title),el('span',sub));choices.append(label);}
    content.append(choices);
    const reasonLabel=el('label',undefined,'bpay-next-paye-reason'),reason=el('textarea');reason.rows=3;reason.maxLength=500;reason.placeholder='Required';reasonLabel.append(el('span','Reason for the override'),reason);
    const confirmLabel=el('label',undefined,'bpay-next-paye-confirm'),confirm=el('input');confirm.type='checkbox';confirmLabel.append(confirm,el('span','I confirm a second PAYE Draft for this pay week'));
    if(!guard.unexecuted)content.append(reasonLabel,confirmLabel);
    const result=el('p','', 'ws-notice ws-notice--danger');result.dataset.nextLiveCopy='';result.hidden=true;result.setAttribute('role','alert');content.append(result);
    const hint=el('span','Next: your password and code.','bpay-next-paye-hint'),cancel=el('button','Cancel','btn'),create=el('button','Verify and create','btn primary');
    cancel.type=create.type='button';cancel.dataset.nextSecondary='';footer.append(hint,cancel,create);
    const current=()=>!closed&&options.current()===true&&same(options.currentActorId(),options.actorId)&&options.ownerReady()===true;
    function paint(){const verify=decision!=='UMBRELLA_ONLY';reasonLabel.hidden=confirmLabel.hidden=!verify;hint.hidden=!verify&&guard.umbrella_candidates!=='0';
      hint.textContent=!verify?'No Umbrella payments are ticked.':busy?'Checking…':!reason.value.trim()?'Enter a reason and tick the confirmation.':!field(reason.value,'guardReason')?'Enter a shorter reason.':!confirm.checked?'Tick the confirmation to continue.':'Next: your password and code.';
      create.textContent=busy?'Checking…':verify?'Verify and create':'Create Umbrella Draft';
      create.disabled=busy||!current()||(verify&&(!field(reason.value,'guardReason')||!confirm.checked));
      cancel.disabled=busy;for(const input of choices.querySelectorAll('input'))input.disabled=busy;reason.disabled=confirm.disabled=busy;
      // No empty companion Draft can be requested.
      if(!verify&&guard.umbrella_candidates==='0')create.disabled=true;
    }
    reason.oninput=confirm.onchange=paint;
    cancel.onclick=()=>{if(!busy)void frame.close();};
    create.onclick=async()=>{if(create.disabled||!current())return;busy=true;result.hidden=true;paint();
      try{let token=null;const savedReason=decision==='UMBRELLA_ONLY'?null:reason.value;
        if(decision!=='UMBRELLA_ONLY')token=await openBpayNextReauth({...options,reauthCurrent:()=>current()&&frame.alive()},
          {action:'PAYE_SAME_WEEK_OVERRIDE',run_id:submission.run_id,command_id:submission.command_id,decision,reason:savedReason,context:guard.context});
        if(!current())fail('ACCEPTED_IDENTITY_CONFLICT');if(decision!=='UMBRELLA_ONLY'&&token===null)return;
        resolve({decision,reason:savedReason,token});await frame.close();
      }catch(e){
        if(['BPAY_NEXT_CHOICE_CONTEXT_CHANGED','BPAY_NEXT_WORKBENCH_CURSOR_STALE'].includes(e?.serverCode)){
          e.serverCode='BPAY_NEXT_CHOICE_CONTEXT_CHANGED';reject(e);await frame.close();return;
        }
        result.textContent='Could not verify this choice; try again.';result.hidden=false;
        win.requestAnimationFrame(()=>{if(!closed)result.scrollIntoView({block:'center'});});
      }
      finally{busy=false;if(!closed)paint();}
    };
    frame=options.showReadWindow({title:'PAYE Draft needs your decision',content,footer,small:true,
      canFocus:()=>same(options.currentActorId(),options.actorId)&&options.ownerReady()===true,
      onDismiss:()=>{closed=true;reason.value='';confirm.checked=false;resolve(null);}});
    paint();return done;
  }

  async function openBpayNextReauth(options,intent) {
    requireActor(options);
    if(!options || typeof options.showReadWindow!=='function' || typeof options.currentActorId!=='function'
      || typeof options.ownerReady!=='function' || !record(intent) || !reauthAction(intent.action))fail('DEPENDENCY_UNAVAILABLE');
    const {action,...args}=intent,bytes=reauthIntentBody(action,args);
    if(Object.hasOwn(args,'reauth_token'))fail('REQUEST_INVALID');
    const doc=options.document||document,win=options.window||window,transport=options.transport||createTransport(options);
    const prefix=(win.__modalStack||[]).slice(),endpoint=options.api('/api/banking/pay/next/command');
    const contextCurrent=()=>{try{requireActor(options);return options.api('/api/banking/pay/next/command')===endpoint
      && prefix.every((f,i)=>win.__modalStack?.[i]===f) && (typeof options.reauthCurrent!=='function'||options.reauthCurrent()===true);}catch{return false;}};
    const parentCurrent=()=>contextCurrent()&&(win.__modalStack?.length??0)===prefix.length;
    const preview=await transport.reauthPreview(action,args);
    if(!parentCurrent() || preview.accepted)fail('AUTH_REQUIRED');
    const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const content=el('section',undefined,'bpay-next-reauth'),intro=el('div',undefined,'bpay-next-reauth-intro');
    const title=el('strong',preview.action_label+' · '+preview.candidate_name);
    intro.append(title);
    if(preview.total_amount!==null){const [whole,fraction='']=preview.total_amount.split('.');
      intro.append(el('p','£'+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+fraction.padEnd(2,'0')+(preview.amount_basis==='DRAFT_GROSS'?' · Draft gross':'')));}
    content.append(intro);
    const fieldWrap=el('label',undefined,'bpay-next-reauth-field'),fieldTitle=el('span','Password'),input=el('input');
    input.type='password';input.autocomplete='current-password';input.placeholder='Your CloudTMS password';input.dataset.nextFocusKey='reauth-password';fieldWrap.append(fieldTitle,input);
    const error=el('p','', 'bpay-next-reauth-error'),result=el('p','', 'bpay-next-reauth-result');error.setAttribute('role','alert');result.setAttribute('role','status');
    error.dataset.nextLiveCopy='';result.dataset.nextLiveCopy='';
    const errorIcon=el('span','!','bpay-next-reauth-error-icon'),errorCopy=el('span');errorIcon.setAttribute('aria-hidden','true');errorCopy.dataset.nextLiveCopy='';error.append(errorIcon,errorCopy);
    error.hidden=true;result.hidden=true;content.append(fieldWrap,error,result);
    const resend=el('button','Send a new code','btn');resend.type='button';resend.dataset.nextSecondary='';resend.hidden=true;content.append(resend);
    const footer=el('div',undefined,'bpay-next-window-actions'),submit=el('button',preview.second_factor_required?'Send code':preview.action_label,'btn primary');
    submit.type='button';footer.append(submit);
    function showActionButton(){
      submit.textContent=preview.action_label;
      const destructive=/^(?:Cancel |Write off )/.test(preview.action_label);
      submit.classList.toggle('primary',!destructive);submit.classList.toggle('btn-warn',destructive);
      footer.classList.toggle('bpay-next-reauth-destructive',destructive);
    }
    if(!preview.second_factor_required)showActionButton();
    let frame,closed=false,busy=false,challenge=null,password='',token=null,ticket=0,activeRequest=null,settle;
    const current=()=>!closed&&contextCurrent()&&(win.__modalStack?.length??0)===prefix.length+1&&frame?.active()===true;
    const promise=new Promise(resolve=>{settle=resolve;});
    function clearCredentials(){password='';input.value='';activeRequest?.abort();activeRequest=null;}
    function paint(){submit.disabled=busy;resend.disabled=busy;input.disabled=busy;content.setAttribute('aria-busy',String(busy));
      result.classList.toggle('bpay-next-reauth-checking',busy);
      if(busy){result.textContent='Checking…';result.hidden=false;}else if(result.textContent==='Checking…')result.hidden=true;}
    function message(text){errorCopy.textContent=text;error.hidden=false;input.setAttribute('aria-invalid','true');}
    async function authRequest(path,payload){
      const controller=new AbortController();activeRequest=controller;let timer;
      const task=(async()=>{
        const raw=await options.authFetch(options.api(path),{method:'POST',body:JSON.stringify(payload),signal:controller.signal,auth401Mode:'return',redirect:'error',
          headers:{'content-type':'application/json',accept:'application/json','X-CloudTMS-Banking-Environment':environment(options)}});
        const body=await boundedJson(raw,controller.signal);
        if(controller.signal.aborted||!current())fail('ACTOR_CHANGED');
        if(!raw.ok){const code=body?.error_code??body?.error??body?.message;
          const problem=new Failure(code==='Invalid code'?'REAUTH_CODE_WRONG':['invalid_or_expired_code','max_attempts_exceeded'].includes(code)?'REAUTH_CODE_EXPIRED':code==='Invalid credentials'?'REAUTH_PASSWORD_WRONG':'AUTH_REQUIRED');throw problem;}
        return body;
      })();
      try{return await Promise.race([task,new Promise((_,reject)=>{timer=win.setTimeout(()=>{controller.abort();reject(new Failure('TIMEOUT'));},LIMITS.timeout);})]);}
      finally{win.clearTimeout(timer);if(activeRequest===controller)activeRequest=null;}
    }
    async function acceptToken(body,start){
      const expected=start?{ok:'true',tfa_required:'false',purpose:'label',reauth_token:'reauthToken',expires_in:'numberPositive'}
        :{ok:'true',purpose:'label',reauth_token:'reauthToken',expires_in:'numberPositive'};
      if(!shape(body,expected)||body.purpose!=='BPAY_NEXT_ACTION'||body.expires_in>300||!current())fail();
      reauthIntentBody(action,{...args,reauth_token:body.reauth_token});
      token=body.reauth_token;clearCredentials();await frame.close();
    }
    async function start(){
      const body=await authRequest('/auth/reauth/start',{purpose:'BPAY_NEXT_ACTION',password,intent:JSON.parse(bytes),expected_scope_sha256:preview.scope_sha256});
      if(body.tfa_required!==preview.second_factor_required)fail('AUTH_REQUIRED');
      if(body.tfa_required===false){await acceptToken(body,true);return;}
      if(!shape(body,{ok:'true',tfa_required:'true',purpose:'label',challenge_id:'uuid',expires_in:'numberPositive'})||body.purpose!=='BPAY_NEXT_ACTION')fail();
      challenge=body.challenge_id;input.value='';input.type='text';input.placeholder='Six-digit code';input.inputMode='numeric';input.autocomplete='one-time-code';input.maxLength=6;
      input.dataset.nextFocusKey='reauth-code';fieldTitle.textContent='Email code';showActionButton();resend.hidden=false;
    }
    async function act(resending=false){
      if(!current()||busy)return;const serial=++ticket;busy=true;error.hidden=true;input.removeAttribute('aria-invalid');result.hidden=true;paint();
      try{
        if(resending){await start();if(current()){result.textContent='A new code has been sent.';result.hidden=false;}}
        else if(challenge===null){password=input.value;if(!password){message('Enter your password.');return;}await start();}
        else {if(!/^\d{6}$/.test(input.value)){message('Enter the six-digit code.');return;}
          await acceptToken(await authRequest('/auth/reauth/verify',{purpose:'BPAY_NEXT_ACTION',challenge_id:challenge,code:input.value}),false);}
      }catch(e){if(current()&&ticket===serial)message(e?.code==='REAUTH_CODE_WRONG'?'That code is wrong; check the email and try again.'
        :e?.code==='REAUTH_CODE_EXPIRED'?'That code has expired; send a new code.':e?.code==='REAUTH_PASSWORD_WRONG'?'That password is wrong; try again.'
        :e?.code==='TIMEOUT'?'Could not confirm it is you; try again.':'Could not confirm it is you; close and try again.');}
      finally{if(!closed&&ticket===serial){busy=false;paint();if(current())input.focus();}}
    }
    submit.addEventListener('click',()=>void act());resend.addEventListener('click',()=>void act(true));
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void act();}});
    const changed=()=>{if(!current()){clearCredentials();token=null;if(frame?.active())void frame.close();}};
    win.addEventListener('cloudtms:bpay-next-owner-changed',changed);
    frame=options.showReadWindow({title:'Confirm it is you',content,footer,small:true,canFocus:current,
      onDismiss:()=>{closed=true;ticket++;clearCredentials();win.removeEventListener('cloudtms:bpay-next-owner-changed',changed);
        const accepted=parentCurrent()?token:null;token=null;settle(accepted);},onMount:()=>paint()});
    return promise;
  }
  function openBpayNextPaymentIssueReauth(options,intent){return openBpayNextReauth(options,intent);}

  // SCR160: one explicit WB12 count read; cancellation never sends CREATE.
  function openCreateDraftConfirmation(options) {
    const doc=options.document||document,store=options.choiceStore,context=options.context;
    const captured=store.freeze(context),revision=store.snapshot().revision;
    const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const content=el('section',undefined,'bpay-next-create-confirmation'),question=el('h2'),icon=el('span','?','bpay-next-question-icon'),title=el('span','Create Draft?');
    icon.setAttribute('aria-hidden','true');question.append(icon,title);
    const consequence=el('p','The Draft will include exactly what is ticked now. Anything that changes afterwards goes to the next Draft.'),values=el('p','Counting ticked Candidates…','bpay-next-confirm-values'),result=el('p');
    for(const node of [consequence,values,result])node.setAttribute('data-next-live-copy','');values.setAttribute('role','status');result.setAttribute('role','alert');result.hidden=true;content.append(question,consequence,values,result);
    const footer=el('div',undefined,'bpay-next-window-actions'),cancel=el('button','Cancel','btn'),create=el('button','Create Draft','btn primary');
    cancel.type=create.type='button';cancel.dataset.nextSecondary='';create.disabled=true;footer.append(cancel,create);
    let frame,closed=false,counting=false,count=null,failed=false,stale=false,accepted=false,resolve;
    const done=new Promise(r=>{resolve=r;});
    const current=()=>{try{return !closed&&options.current()===true&&store.snapshot().revision===revision&&JSON.stringify(store.freeze(options.currentContext()))===JSON.stringify(captured);}catch{return false;}};
    function update(){content.classList.toggle('is-failed',failed);icon.textContent=failed?'!':'?';create.textContent=stale?'Refresh':failed?'Try again':'Create Draft';create.disabled=counting||(stale?options.current()!==true:!current()||(!failed&&(!count||count.candidate_count==='0')));result.classList.toggle('ws-notice',failed);result.classList.toggle('ws-notice--danger',failed);result.hidden=!failed&&count?.candidate_count!=='0';result.setAttribute('role',failed?'alert':'status');result.textContent=stale?'The list has changed. Refresh and try again.':failed?'Try again or contact support if it keeps happening.':count?.candidate_count==='0'?'There is nothing to pay in this selection.':'';}
    async function readCount(){
      if(counting||!current())return;counting=true;failed=false;count=null;title.textContent='Create Draft?';consequence.textContent='The Draft will include exactly what is ticked now. Anything that changes afterwards goes to the next Draft.';values.hidden=false;values.textContent='Counting ticked Candidates…';update();
      try{
        const value=await options.countSelection();
        if(!current()||!sameWorkbenchRevisionForSubmit(context,value.context)){const changed=new Failure('SERVER_REFUSED');changed.serverCode='BPAY_NEXT_CHOICE_CONTEXT_CHANGED';throw changed;}
        if(!field(value.candidate_count,'integer')||!field(value.member_count,'integer'))throw new Failure('RESPONSE_INVALID');
        count=value;title.textContent='Create Draft for '+BigInt(value.candidate_count).toLocaleString('en-GB')+(value.candidate_count==='1'?' Candidate?':' Candidates?');
        const channel=captured.namespace.scope.channel;values.textContent=(channel==='ALL'?'PAYE + Umbrella':channel==='PAYE'?'PAYE':'Umbrella')+' · '+options.selectionLabel();
      }catch(e){
        if(closed)return;failed=true;stale=['BPAY_NEXT_CHOICE_CONTEXT_CHANGED','BPAY_NEXT_WORKBENCH_CURSOR_STALE'].includes(e?.serverCode);title.textContent=stale?'Create Draft?':'Could not count the ticked Candidates.';consequence.textContent='Nothing was created. Your ticks are kept.';values.hidden=true;
      }finally{counting=false;if(!closed)update();}
    }
    cancel.addEventListener('click',()=>void frame.close());
    create.addEventListener('click',()=>{if(create.disabled)return;if(stale){void frame.close().then(()=>options.onRefresh?.());return;}if(!current())return;if(failed){void readCount();return;}accepted=true;void frame.close();});
    frame=options.showReadWindow({title:'Create Draft',content,footer,small:true,confirmation:true,canFocus:()=>options.current()===true,onDismiss:()=>{let answer=null;try{if(accepted&&current())answer=store.freeze(options.currentContext());}catch{}closed=true;resolve(answer);},onMount:()=>void readCount()});
    // The standard adapter schedules onMount; direct local adapters may not.
    return done;
  }
  function sameWorkbenchRevisionForSubmit(a,b){return Boolean(a&&b&&a.workbench_revision===b.workbench_revision&&a.adoption_revision===b.adoption_revision&&a.owner_epoch===b.owner_epoch&&a.actor_user_id===b.actor_user_id&&a.agency_id===b.agency_id&&a.official_pay_date===b.official_pay_date);}
  // DR05: exact accepted-run remediation in the existing standard review owner.
  // DR09 uses the current header revision; unknown replies keep identical bytes.
  async function confirmPreparationDiscard(options,controller,facts,current,el){
    if(!current()||controller.snapshot().pending||controller.snapshot().worker_action||controller.snapshot().confirmed
      ||!facts||facts.discard_phase!==null||!['PREPARING','REVIEW'].includes(facts.status))fail('REQUEST_INVALID');
    const body=el('section',undefined,'bpay-next-worker-confirmation is-remove'),heading=el('h2'),icon=el('span','!','bpay-next-question-icon');
    icon.setAttribute('aria-hidden','true');heading.append(icon,el('span','Discard this Draft for '+String(BigInt(facts.selected_candidates)-BigInt(facts.removed)).replace(/\B(?=(\d{3})+(?!\d))/g,',')+(BigInt(facts.selected_candidates)-BigInt(facts.removed)===1n?' Candidate?':' Candidates?')));
    const consequence=el('p','The payments go back to Banking Pay with your ticks kept.'),value=el('p','Started by '+facts.actor_display_name+' · '+(options.window||window).CloudTMSBpayNextDates.formatTimestamp(facts.started_at_utc));
    for(const n of [heading,consequence,value])n.dataset.nextLiveCopy='';body.append(heading,consequence,value);
    const actions=el('div',undefined,'bpay-next-window-actions bpay-next-worker-remove-actions'),keep=el('button','Keep Draft','btn'),discard=el('button','Discard Draft','btn btn-warn');
    keep.type=discard.type='button';keep.dataset.nextSecondary='';discard.dataset.nextDestructive='';let dialog,accepted=false;
    keep.addEventListener('click',()=>void dialog.close());discard.addEventListener('click',()=>{if(!current())return;accepted=true;void dialog.close();});actions.append(keep,discard);
    const confirmed=await new Promise(resolve=>{dialog=options.showReadWindow({title:'Discard this Draft',content:body,footer:actions,small:true,confirmation:true,canFocus:current,onDismiss:()=>resolve(accepted&&current())});});
    if(!confirmed)return null;requireActor(options);
    return controller.mutate('PREPARATION_DISCARD',{command_id:controller.newId(),run_id:facts.run_id,expected_preparation_revision:facts.review_revision});
  }
  function discardResultCopy(p){
    if(p.discard_phase==='DISCARDED')return 'Draft discarded. Its payments are back in Banking Pay.';
    if(p.discard_phase==='PARTIAL')return p.discard_removed_candidates+(BigInt(p.discard_removed_candidates)===1n?' Candidate removed; ':' Candidates removed; ')+p.discard_already_removed_candidates+' already removed; '+p.discard_blocked_candidates+' could not be removed.';
    return 'Discarding Draft…';
  }
  function discardActorCopy(p,format){return (p.discard_phase==='DISCARDED'?'Discarded by ':'Discard requested by ')+p.discard_actor_display_name+(p.discarded_at_utc?' · '+format(p.discarded_at_utc):'');}
  // WORKERS is an outcome list; full DR15 readers/totals remain their own card.
  // DY05: captured detail only; existing service readers retain run/line scope.
  function openFrozenWorkerDetail(options,workerId){
    requireActor(options);if(!field(workerId,'uuid')||!field(options.detailRunId,'uuid')||!field(options.detailCandidateId,'uuid')||options.ownerReady()!==true)fail('REQUEST_INVALID');
    const doc=options.document||document,win=options.window||window,transport=options.transport||createTransport(options);
    const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const content=el('section',undefined,'bpay-next-frozen-detail'),footer=el('div',undefined,'bpay-next-window-actions'),subtitle=el('span',undefined,'bpay-next-progress-subtitle');
    let frame,closed=false,busy=false,error='',tab='Lines',lines=null,comparisons=null,line=null,origin=null,shifts=null,breaks=null,rates=null,schedule=null,shiftId=null,selectedShift=null,selected=null,scrollTop=0;
    const scope=options.progressNamespace?preparationScope(options.progressNamespace):null;let started=false,scrollAnchor=null,failedRead=null,loadingMore=false,summary=null,summaryError='';
    const current=()=>{try{return !closed&&same(options.currentActorId(),options.actorId)&&options.ownerReady()===true&&(!scope||!options.progressCurrentNamespace||preparationScope(options.progressCurrentNamespace())===scope);}catch{return false;}};
    const focus=ui.continuity(content,doc,()=>content.querySelector('button'));
    const date=v=>v?new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T00:00:00Z')):'—';
    const rateNames={DAY:'Day',NIGHT:'Night',SAT:'Sat',SUN:'Sun',BH:'Bank holiday'};
    const decimal=v=>{if(v===null)return '—';const [whole,fraction='']=v.split('.');return whole+'.'+fraction.replace(/0+$/,'').padEnd(2,'0');},rate=v=>{if(v===null)return '—';const text=decimal(v),neg=text.startsWith('-'),[whole,fraction]=text.replace(/^-/, '').split('.');return (neg?'−':'')+'£'+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+fraction;};
    const button=(label,fn,primary=false,preserveDetailError=false)=>{const n=el('button',label,primary?'btn primary':'btn');n.type='button';n.disabled=busy||!current();if(!primary)n.dataset.nextSecondary='';n.dataset.nextFocusKey=label;n.addEventListener('click',()=>void act(fn,preserveDetailError));return n;};
    async function act(fn,preserveDetailError=false){if(busy||!current())return;const host=content.querySelector('.bpay-next-frozen-scroll'),top=host?.getBoundingClientRect().top,node=host&&Array.from(host.querySelectorAll('[data-frozen-row-key]')).find(n=>n.getBoundingClientRect().bottom>top);scrollAnchor=node?{key:node.dataset.frozenRowKey,offset:node.getBoundingClientRect().top-top}:null;busy=true;if(!preserveDetailError)error='';render();try{await fn();}catch{error='Could not load this detail; refresh and try again.';}finally{busy=false;loadingMore=false;render();}}
    const append=(old,next,direction='next')=>{const history=[...(old?.history??[])],pages=[...(old?.pages??[])],after=old?(direction==='back'?history.at(-1):old.next_cursor):null,block={after,...next};
      if(!old){pages.push(block);}else if(direction==='back'){pages.unshift(block);history.pop();if(pages.length>3)pages.pop();}else{pages.push(block);if(pages.length>3){history.push(pages.shift().after);while(encoder.encode(JSON.stringify(history)).byteLength>32768)history.shift();}}
      const last=pages.at(-1);return {...last,pages,history,rows:pages.flatMap(p=>p.rows)};};
    // DY-09: one existing scoped read; these totals are not a sum of loaded lines.
    async function readSummary(){
      summary=null;summaryError='';
      try{
        const page=await transport.page('STATUS',{run_id:options.detailRunId,run_worker_id:workerId,after_transfer_no:null,limit:1});
        if(!current())return;
        const h=page.header;
        if(!same(h.run_id,options.detailRunId)||!same(h.run_worker_id,workerId)||!same(h.candidate_id,options.detailCandidateId))fail();
        summary=h;
      }catch{if(current())summaryError='Could not load payment totals; refresh and try again.';}
    }
    async function readLines(cursor=null,direction='next'){const args={run_worker_id:workerId,after_line_no:cursor?.after_line_no??null,limit:100};failedRead={kind:'LINES',args,direction};const next=await transport.page('LINES',args);if(current()){lines=append(cursor||direction==='back'?lines:null,next,direction);failedRead=null;}}
    async function readDetail(kind,args,old=null,direction='next'){failedRead={kind,args:{...args},old,direction};const next=await transport.frozenPage(kind,args);if(!current())return null;if(line&&!same(next.origin.revision_id,line.captured_revision_id))fail();if(origin&&JSON.stringify(origin)!==JSON.stringify(next.origin))fail();origin=next.origin;failedRead=null;return append(old,next,direction);}
    async function chooseLine(next){line=next;origin=null;shifts=breaks=rates=schedule=null;shiftId=null;selectedShift=null;selected=next.run_line_id;scrollTop=0;scrollAnchor=null;
      shifts=await readDetail('SHIFTS',{run_line_id:line.run_line_id,after_detail_no:null,limit:100});selectedShift=shifts?.rows[0]??null;shiftId=selectedShift?.shift_detail_id??null;}
    async function findWork(after=null){let page=null;while(current()){
      const found=page?.rows.find(r=>same(r.captured_revision_id,line.captured_revision_id)&&same(r.original_timesheet_id,line.original_timesheet_id));if(found)return found;
      if(page?.complete)fail();const args={run_worker_id:workerId,after_work_id:page?.next_cursor?.after_work_id??after,limit:100};failedRead={kind:'REVISION_COMPARISON',args};const next=await transport.page('REVISION_COMPARISON',args);if(!current())return null;failedRead=null;comparisons=next;page=next;
    }}
    async function switchTab(next){tab=next;scrollTop=0;scrollAnchor=null;
      if(tab==='Breaks'&&shiftId&&!breaks)breaks=await readDetail('BREAKS',{run_line_id:line.run_line_id,shift_detail_id:shiftId,after_break_no:null,limit:100});
      if(tab==='Used rates'&&!rates)rates=await readDetail('RATE_DETAILS',{run_line_id:line.run_line_id,after_bucket:null,limit:100});
      if(tab==='Available rates'&&!schedule){const work=await findWork();if(work)schedule=await readDetail('RATE_SCHEDULE',{run_work_id:work.run_work_id,after_rate_family:null,after_rate_code:null,limit:100});}
    }
    async function more(direction='next'){const page=tab==='Lines'?lines:tab==='Shifts'?shifts:tab==='Breaks'?breaks:tab==='Used rates'?rates:schedule;if(!page||(direction==='next'&&page.complete)||(direction==='back'&&!page.history.length))return;const cursor=(direction==='back'?page.history.at(-1):page.next_cursor)??{};loadingMore=true;render();
      if(tab==='Lines')return readLines(Object.keys(cursor).length?cursor:null,direction);
      if(tab==='Shifts'){shifts=await readDetail('SHIFTS',{run_line_id:line.run_line_id,after_detail_no:null,...cursor,limit:100},shifts,direction);return;}
      if(tab==='Breaks'){breaks=await readDetail('BREAKS',{run_line_id:line.run_line_id,shift_detail_id:shiftId,after_break_no:null,...cursor,limit:100},breaks,direction);return;}
      if(tab==='Used rates'){rates=await readDetail('RATE_DETAILS',{run_line_id:line.run_line_id,after_bucket:null,...cursor,limit:100},rates,direction);return;}
      const work=await findWork();if(work)schedule=await readDetail('RATE_SCHEDULE',{run_work_id:work.run_work_id,after_rate_family:null,after_rate_code:null,...cursor,limit:100},schedule,direction);
    }
    function list(headers,values,openRow=null){const host=el('div',undefined,'ctms-universal-table-host bpay-next-frozen-scroll'),table=el('table',undefined,'ctms-universal-table ctms-universal-card-table'),thead=el('thead'),heading=el('tr'),tbody=el('tbody');
      const numeric=title=>/amount|pay$|charge$|rate$|hours$|minutes$/i.test(title)&&title!=='Rate';
      for(const title of headers){const th=el('th',title);th.scope='col';if(numeric(title))th.className='bpay-next-frozen-number';heading.append(th);}thead.append(heading);
      for(const [rowIndex,cells] of values.entries()){const tr=el('tr');const page=tab==='Lines'?lines:tab==='Shifts'?shifts:tab==='Breaks'?breaks:tab==='Used rates'?rates:schedule;const fact=page?.rows[rowIndex];tr.dataset.frozenRowKey=fact?.run_line_id??fact?.shift_detail_id??fact?.break_detail_id??fact?.rate_detail_id??fact?.rate_schedule_id??String(rowIndex);for(const [i,value] of cells.entries()){const td=el('td');td.dataset.label=headers[i];if(numeric(headers[i]))td.className='bpay-next-frozen-number';if(typeof value==='string'&&value.includes('£'))td.dataset.nextFormattedMoney='';if(value?.nodeType)td.append(value);else td.textContent=value??'—';tr.append(td);}
        if(openRow){tr.tabIndex=0;tr.setAttribute('aria-selected',String(selected===lines.rows[rowIndex].run_line_id));tr.addEventListener('click',e=>{if(e.target.closest('button'))return;selected=lines.rows[rowIndex].run_line_id;tbody.querySelectorAll('tr').forEach(n=>n.setAttribute('aria-selected',String(n===tr)));});tr.addEventListener('dblclick',()=>void act(()=>openRow(lines.rows[rowIndex])));tr.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void act(()=>openRow(lines.rows[rowIndex]));}});}tbody.append(tr);}
      table.append(thead,tbody);host.append(table);host.tabIndex=0;host.setAttribute('role','region');host.setAttribute('aria-label',tab);host.addEventListener('scroll',()=>{scrollTop=host.scrollTop;if(host.scrollTop+host.clientHeight>=host.scrollHeight-80&&!busy&&!(tab==='Lines'?lines:tab==='Shifts'?shifts:tab==='Breaks'?breaks:tab==='Used rates'?rates:schedule)?.complete)void act(more);});let touchY=null;const earlier=()=>{const page=tab==='Lines'?lines:tab==='Shifts'?shifts:tab==='Breaks'?breaks:tab==='Used rates'?rates:schedule;if(!busy&&host.scrollTop<40&&page?.history.length){void act(()=>more('back'));return true;}return false;};host.addEventListener('wheel',e=>{if(e.deltaY<0&&earlier())e.preventDefault();},{passive:false});host.addEventListener('keydown',e=>{if(e.target===host&&['Home','ArrowUp','PageUp'].includes(e.key)&&earlier())e.preventDefault();});host.addEventListener('touchstart',e=>{touchY=e.touches[0]?.clientY??null;},{passive:true});host.addEventListener('touchmove',e=>{const y=e.touches[0]?.clientY;if(touchY!==null&&y>touchY&&earlier())touchY=null;else touchY=y;},{passive:true});return host;
    }
    function subject(){const box=el('div',undefined,'bpay-next-frozen-subject');box.append(el('strong',origin?.client_display_name||'—'));
      if(origin?.origin_kind==='DAILY'&&origin.contract_id===null)box.append(el('small','No Contract (Daily)'));
      box.append(el('small',[origin?.job_title,origin?.band_label].filter(Boolean).join(' · ')||'—'));return box;}
    function render(){if(!content.isConnected)return;const token=focus.before();footer.replaceChildren();footer.hidden=true;
      if(!current()){content.replaceChildren(el('p','Banking Pay is unavailable.'));subtitle.textContent='';return;}
      if(frame?.active()===true&&!subtitle.isConnected)doc.getElementById('modalTitle')?.insertAdjacentElement('afterend',subtitle);
      subtitle.textContent=origin?[origin.candidate_display_name,origin.candidate_reference,origin.timesheet_reference,line.target_pay_channel==='PAYE'?'PAYE Draft':'Umbrella Draft'].filter(Boolean).join(' · '):'';
      const tabs=el('div',undefined,'bpay-next-frozen-tabs');tabs.setAttribute('role','tablist');for(const name of ['Lines','Shifts','Breaks','Used rates','Available rates']){const b=button(name,()=>switchTab(name));b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===name));b.disabled=busy||(name!=='Lines'&&!line);tabs.append(b);}
      const parts=[tabs];if(error){const n=el('p',error,'ws-notice ws-notice--danger');n.setAttribute('role','alert');parts.push(n,button('Refresh',async()=>{const request=failedRead;if(!request)return;if(request.kind==='LINES'){await readLines(request.args.after_line_no===null?null:{after_line_no:request.args.after_line_no},request.direction);return;}if(request.kind==='REVISION_COMPARISON'){const work=await findWork(request.args.after_work_id);if(work)schedule=await readDetail('RATE_SCHEDULE',{run_work_id:work.run_work_id,after_rate_family:null,after_rate_code:null,limit:100});return;}const next=await readDetail(request.kind,request.args,request.old,request.direction);if(request.kind==='SHIFTS'){shifts=next;if(!selectedShift){selectedShift=next?.rows[0]??null;shiftId=selectedShift?.shift_detail_id??null;}}else if(request.kind==='BREAKS')breaks=next;else if(request.kind==='RATE_DETAILS')rates=next;else schedule=next;}));}
      if(origin&&tab!=='Lines'&&tab!=='Shifts')parts.push(subject());let host;
      if(tab==='Lines'){host=list(['Payment','Date','Amount ex VAT','Actions'],(lines?.rows??[]).map(r=>[
        ({WORK:'Timesheet',PROTECTED_WORK:'Protected pay',ADDITIONAL:'Additional payment',EXPENSE:'Expense',MILEAGE:'Mileage'})[r.component_kind]||'Payment',date(r.work_date),rate(r.frozen_ex_vat),button('Open',async()=>{await chooseLine(r);await switchTab('Shifts');})
      ]),async r=>{await chooseLine(r);await switchTab('Shifts');});}
      if(tab==='Shifts'){parts.push(el('p','Approved hours, not paid hours','bpay-next-frozen-caption'));host=list(['Date','Client and Contract','Role and band','Start – finish','Approved hours'],(shifts?.rows??[]).map(r=>{const client=el('div');client.append(el('span',origin?.client_display_name||'—'));if(origin?.origin_kind==='DAILY'&&origin.contract_id===null)client.append(el('small','No Contract (Daily)'));const role=el('div');role.append(el('span',origin?.job_title||'—'),el('small',origin?.band_label||'—'));return [date(r.work_date),client,role,r.shift_start_local&&r.shift_end_local?r.shift_start_local+' – '+r.shift_end_local:'—',decimal(r.approved_hours)];}));}
      if(tab==='Breaks'){const choices=selectedShift&&!shifts?.rows.some(r=>same(r.shift_detail_id,selectedShift.shift_detail_id))?[selectedShift,...(shifts?.rows??[])]:shifts?.rows??[];if(choices.length>1){const label=el('label','Shift'),select=el('select');select.disabled=busy;select.setAttribute('aria-label','Shift');for(const row of choices){const option=el('option',date(row.work_date)+(row.shift_start_local?' · '+row.shift_start_local:''));option.value=row.shift_detail_id;option.selected=shiftId===row.shift_detail_id;select.append(option);}select.addEventListener('change',()=>void act(async()=>{shiftId=select.value;selectedShift=choices.find(r=>same(r.shift_detail_id,shiftId))??null;breaks=null;breaks=await readDetail('BREAKS',{run_line_id:line.run_line_id,shift_detail_id:shiftId,after_break_no:null,limit:100});}));label.append(select);parts.push(label);}host=list(['Break','Start – finish','Minutes'],(breaks?.rows??[]).map(r=>['Break '+r.break_no,r.break_start_local&&r.break_end_local?r.break_start_local+' – '+r.break_end_local:'—',String(r.break_minutes)]));}
      if(tab==='Used rates')host=list(['Rate','Approved hours','Used pay rate'],['DAY','NIGHT','SAT','SUN','BH'].flatMap(code=>(rates?.rows??[]).filter(r=>r.bucket===code)).map(r=>[rateNames[r.bucket],decimal(r.approved_hours),rate(r.source_pay_rate)]));
      if(tab==='Available rates'){const rows=schedule?.rows??[],standard=['DAY','NIGHT','SAT','SUN','BH'].flatMap(code=>rows.filter(r=>r.rate_family==='STANDARD'&&r.rate_code===code));host=list(['Rate','PAYE pay','Umbrella pay','Charge'],[...standard,...rows.filter(r=>r.rate_family!=='STANDARD')].map(r=>[rateNames[r.rate_code]||r.rate_code,rate(r.paye_rate),rate(r.umbrella_rate),rate(r.charge_rate)]));}
      if(host)parts.push(host);
      if(summary&&tab==='Lines'){
        const totals=el('dl',undefined,'bpay-next-frozen-totals');totals.setAttribute('aria-label','Candidate payment totals');
        for(const [label,key] of [['Gross ex VAT','frozen_gross_ex_vat'],['VAT','frozen_gross_vat'],['Gross inc VAT','frozen_gross_inc_vat'],['Deductions at gross','gross_stage_deductions'],[summary.target_pay_channel==='PAYE'?'Recoveries from PAYE net':'Recoveries at net','net_recovery_reserved'],['Bank amount','cash_amount']]){
          const group=el('div'),value=el('dd',rate(summary[key]));value.dataset.nextFormattedMoney='';group.append(el('dt',label),value);totals.append(group);
        }
        parts.push(totals);
      }
      if(summaryError){const notice=el('div',undefined,'ws-notice ws-notice--danger'),copy=el('p',summaryError);copy.setAttribute('role','alert');notice.append(copy,button('Refresh',readSummary,false,true));parts.push(notice);}
      const page=tab==='Lines'?lines:tab==='Shifts'?shifts:tab==='Breaks'?breaks:tab==='Used rates'?rates:schedule;
      if(busy){const n=el('p',loadingMore?'Loading more…':'Loading…','bpay-next-frozen-caption');n.setAttribute('role','status');parts.push(n);}else if(page?.complete&&page.rows.length===0)parts.push(el('p',tab==='Breaks'?'No recorded breaks.':'No recorded detail.','bpay-next-frozen-caption'));
      content.replaceChildren(...parts);if(host){host.scrollTop=scrollTop;const node=scrollAnchor&&Array.from(host.querySelectorAll('[data-frozen-row-key]')).find(n=>n.dataset.frozenRowKey===scrollAnchor.key);if(node)host.scrollTop=Math.max(0,host.scrollTop+node.getBoundingClientRect().top-host.getBoundingClientRect().top-scrollAnchor.offset);}focus.after(token);
    }
    frame=options.showReadWindow({title:'Draft detail',headerDetail:subtitle,content,footer,canFocus:current,onDismiss:()=>{closed=true;},onMount:()=>{render();if(!started){started=true;void act(async()=>{await readSummary();await readLines();if(lines?.rows.length)await chooseLine(lines.rows[0]);});}}});return frame;
  }
  // DR15 lists consume only their own closed PREPARE_ISSUES reader.
  function preparationIssuePages(transport,runId,view,waitingOnly=false){
    let value=null,sort=view==='CANDIDATES'?'STATE_ASC':'CANDIDATE_ASC';
    return {snapshot:()=>value,sort:()=>sort,setSort:s=>{sort=s;value=null;},async refreshVisible(){
      if(!value)return this.read();const old=value,blocks=[];let after=old.pages[0].after;for(const block of old.pages){const next=await transport.page('PREPARE_ISSUES',{run_id:runId,view,sort,after,limit:100,row_key:null,waiting_only:waitingOnly});if(blocks.length&&JSON.stringify(blocks[0].context)!==JSON.stringify(next.context))fail('READ_CHANGED');blocks.push({after,...next});if(next.complete)break;after=next.next_cursor;}
      value={...blocks.at(-1),pages:blocks,history:old.history,rows:blocks.flatMap(p=>p.rows)};return value;
    },async read(after=null,direction='next'){
      const old=value,next=await transport.page('PREPARE_ISSUES',{run_id:runId,view,sort,after,limit:100,row_key:null,waiting_only:waitingOnly});
      if(old&&(after!==null||direction==='back')&&JSON.stringify(old.context)!==JSON.stringify(next.context))fail('READ_CHANGED');
      const pages=after!==null||direction==='back'?[...(old?.pages??[])]:[],history=after!==null||direction==='back'?[...(old?.history??[])]:[];
      const block={after,...next};if(direction==='back'){pages.unshift(block);history.pop();if(pages.length>3)pages.pop();}
      else{pages.push(block);if(pages.length>3){history.push(pages.shift().after);while(encoder.encode(JSON.stringify(history)).byteLength>32768)history.shift();}}
      const tail=pages.at(-1);value={...tail,pages,history,rows:pages.flatMap(p=>p.rows)};return value;
    }};
  }
  function preparationIssueReason(row,omitted=false){
    if(row.waiting_on_other_run)return 'Waiting for another Draft'+(row.waiting_actor_display_name?' started by '+row.waiting_actor_display_name:'')+'.';
    if(row.issue_code!==null)return PREPARATION_ISSUE_COPY[row.issue_code]?.[omitted?'omitted':'review']||'Could not prepare this Candidate; contact support.';
    return row.worker_status==='PENDING'?'Waiting to prepare':['PREPARING','CANCELLING'].includes(row.worker_status)?'Preparing':row.worker_status==='FAILED'?'Could not prepare this Candidate; contact support.':'—';
  }
  function preparationOmissionCopy(counts){
    const parts=[],format=v=>String(v).replace(/\B(?=(\d{3})+(?!\d))/g,',');
    if(BigInt(counts.skipped_timesheets)>0n)parts.push(format(counts.skipped_timesheets)+(counts.skipped_timesheets==='1'?' Timesheet':' Timesheets'));
    if(BigInt(counts.removed_candidates)>0n)parts.push(format(counts.removed_candidates)+(counts.removed_candidates==='1'?' Candidate':' Candidates'));
    return parts.length?parts.join(' and ')+(parts.length===1&&(counts.skipped_timesheets==='1'||counts.removed_candidates==='1')?' is':' are')+' not in this Draft. '+(parts.length===1&&(counts.skipped_timesheets==='1'||counts.removed_candidates==='1')?'It is':'They are')+' back in Banking Pay.':'';
  }
  async function openPreparationIssueTimesheet(options,transport,runId,row,context){
    requireActor(options);if(options.ownerReady()!==true||typeof options.issueOwners?.reviewTimesheet!=='function'||row.physical_timesheet_id===null||row.expected_revision_id===null)fail('REQUEST_INVALID');
    const page=await transport.page('PREPARE_ISSUES',{run_id:runId,view:context.view,sort:context.sort,after:null,limit:1,row_key:row.row_key,waiting_only:context.waiting_only}),latest=page.rows[0];
    const fields=['row_key','origin','candidate_id','run_worker_id','work_id','expected_revision_id','physical_timesheet_id','physical_timesheet_version','preparation_revision','issue_code'];
    if(!latest||fields.some(k=>latest[k]!==row[k])||!same(page.context.actor_user_id,options.actorId)||page.context.owner_epoch!==context.owner_epoch)fail('READ_CHANGED');
    requireActor(options);if(options.ownerReady()!==true)fail('ACTOR_CHANGED');
    await options.issueOwners.reviewTimesheet(Object.freeze({reader_kind:'PREPARE_ISSUES',accepted_run_id:runId,row_key:latest.row_key,origin:latest.origin,
      run_worker_id:latest.run_worker_id,work_id:latest.work_id,expected_revision_id:latest.expected_revision_id,candidate_id:latest.candidate_id,
      physical_timesheet_id:latest.physical_timesheet_id,physical_timesheet_version:latest.physical_timesheet_version,timesheet_reference:latest.timesheet_reference,
      reason_code:latest.issue_code,context:Object.freeze({actor_user_id:page.context.actor_user_id,owner_epoch:page.context.owner_epoch})}));
  }
  function openNotInDraft(options,runId){
    requireActor(options);if(!field(runId,'uuid')||options.ownerReady()!==true)fail('REQUEST_INVALID');
    const doc=options.document||document,win=options.window||window,transport=options.transport||createTransport(options),pages=preparationIssuePages(transport,runId,'NOT_IN_DRAFT');
    const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const content=el('section',undefined,'bpay-next-omitted-list'),footer=el('div',undefined,'bpay-next-window-actions');let frame,closed=false,busy=false,error='',selected=null,offset=0,anchor=null;
    const current=()=>!closed&&same(options.currentActorId(),options.actorId)&&options.ownerReady()===true;
    const focus=ui.continuity(content,doc,()=>content.querySelector('button'));
    const button=(text,fn,primary=false)=>{const b=el('button',text,primary?'btn primary':'btn');b.type='button';b.disabled=busy||!current()||Boolean(error)&&text!=='Refresh';if(!primary)b.dataset.nextSecondary='';b.dataset.nextFocusKey=text;b.addEventListener('click',()=>void act(fn));return b;};
    async function act(fn){if(busy||!current())return;const host=content.querySelector('.bpay-next-omitted-scroll'),top=host?.getBoundingClientRect().top,node=host&&Array.from(host.querySelectorAll('[data-issue-row-key]')).find(n=>n.getBoundingClientRect().bottom>top);anchor=node?{key:node.dataset.issueRowKey,offset:node.getBoundingClientRect().top-top}:null;busy=true;error='';render();try{await fn();}catch(e){error=e?.serverCode==='BPAY_NEXT_PREPARE_ISSUES_CONTEXT_CHANGED'||e?.code==='READ_CHANGED'?'The list has changed. Refresh and try again.':'Could not load these payments; refresh and try again.';}finally{busy=false;render();}}
    async function refresh(){offset=0;anchor=null;await pages.read();}
    function render(){
      if(!frame||!content.isConnected)return;const token=focus.before(),page=pages.snapshot(),tools=el('div',undefined,'bpay-next-omitted-tools');if(error)tools.append(button('Refresh',refresh));
      const sortLabel=el('label','Sort by','bpay-next-issue-phone-sort'),sortSelect=el('select');for(const [key,label]of [['CANDIDATE_ASC','Candidate A–Z'],['CANDIDATE_DESC','Candidate Z–A'],['PAYMENT_ASC','Payment A–Z'],['PAYMENT_DESC','Payment Z–A'],['REASON_ASC','Reason A–Z'],['REASON_DESC','Reason Z–A']]){const option=el('option',label);option.value=key;sortSelect.append(option);}sortSelect.value=pages.sort();sortSelect.disabled=busy||Boolean(error);sortSelect.addEventListener('change',()=>void act(async()=>{pages.setSort(sortSelect.value);await refresh();}));sortLabel.append(sortSelect);tools.prepend(sortLabel);
      const body=[];if(error){const notice=el('p',error,'ws-notice ws-notice--danger');notice.setAttribute('role','alert');body.push(notice);}else if(!page||busy){const notice=el('p',!page?'Loading payments…':anchor?'Loading more…':'Checking payments…');notice.setAttribute('role','status');body.push(notice);}
      body.push(tools);const host=el('div',undefined,'ctms-universal-table-host bpay-next-omitted-scroll');host.tabIndex=0;host.setAttribute('role','region');host.setAttribute('aria-label','Not in this Draft');
      const table=el('table',undefined,'ctms-universal-table ctms-universal-card-table'),head=el('thead'),titles=el('tr'),rows=el('tbody');
      for(const [label,key]of [['Candidate','CANDIDATE'],['Payment','PAYMENT'],['Reason','REASON'],['Actions',null]]){const th=el('th');if(key){const sorted=pages.sort().startsWith(key+'_'),desc=sorted&&pages.sort().endsWith('_DESC');th.setAttribute('aria-sort',sorted?(desc?'descending':'ascending'):'none');th.append(button(label,async()=>{pages.setSort(key+'_'+(desc?'ASC':'DESC'));await refresh();}));}else th.textContent=label;titles.append(th);}head.append(titles);
      for(const row of page?.rows??[]){const tr=el('tr');tr.tabIndex=0;tr.dataset.issueRowKey=row.row_key;tr.setAttribute('aria-selected',String(selected===row.row_key));
        tr.dataset.nextFocusKey='issue-row:'+row.row_key;
        tr.addEventListener('keydown',e=>{if(e.target!==tr||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const all=Array.from(tr.parentElement.querySelectorAll('tr[data-issue-row-key]')),i=all.indexOf(tr),target=e.key==='Home'?all[0]:e.key==='End'?all.at(-1):all[Math.max(0,Math.min(all.length-1,i+(e.key==='ArrowDown'?1:-1)))];if(target){selected=target.dataset.issueRowKey;for(const node of all)node.setAttribute('aria-selected',String(node===target));target.focus();target.scrollIntoView({block:'nearest'});}});
        tr.addEventListener('click',e=>{if(e.target.closest('button'))return;selected=row.row_key;render();});const known=!error&&row.physical_timesheet_id!==null&&row.expected_revision_id!==null&&typeof options.issueOwners?.reviewTimesheet==='function';
        const open=()=>act(()=>openPreparationIssueTimesheet(options,transport,runId,row,page.context));tr.addEventListener('dblclick',e=>{if(!e.target.closest('button')&&known)void open();});tr.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.target.closest('button')&&known){e.preventDefault();void open();}});
        for(const [label,text]of [['Candidate',row.candidate_display_name??'—'],['Payment',row.timesheet_reference!==null?'Timesheet '+row.timesheet_reference:(row.work_id===null?'Payments':'Timesheet')],['Reason',preparationIssueReason(row,true)],['Actions',null]]){const td=el('td',label==='Candidate'?undefined:text);if(label==='Candidate')td.append(el('strong',text));td.dataset.label=label;
          if(label==='Candidate'&&row.candidate_reference!==null)td.append(el('small',row.candidate_reference));if(label==='Payment'&&row.week_ending_date!==null)td.append(el('small','Week ending '+row.week_ending_date.split('-').reverse().join('/')));
          if(label==='Actions'&&known){const action=button('Open Timesheet',()=>openPreparationIssueTimesheet(options,transport,runId,row,page.context));action.classList.add('bpay-next-desktop-open');const phone=button('Open',()=>openPreparationIssueTimesheet(options,transport,runId,row,page.context));phone.classList.add('bpay-next-phone-open');phone.setAttribute('aria-label','Open '+(row.timesheet_reference??'Timesheet'));td.append(action,phone);}tr.append(td);}for(const action of tr.querySelectorAll('button'))action.dataset.nextFocusKey='issue-action:'+row.row_key+':'+action.textContent;rows.append(tr);
      }table.append(head,rows);host.append(table);
      if(page?.complete&&page.rows.length===0)body.push(el('p','No payments were left out of this Draft.','bpay-next-omitted-empty'));else body.push(host);
      host.addEventListener('scroll',()=>{offset=host.scrollTop;if(busy||error||!page)return;if(host.scrollTop<40&&page.history.length)void act(()=>pages.read(page.history.at(-1),'back'));else if(host.scrollTop+host.clientHeight>=host.scrollHeight-100&&!page.complete)void act(()=>pages.read(page.next_cursor));});
      if(page){const sortName=({CANDIDATE:'Candidate',PAYMENT:'Payment',REASON:'Reason'})[pages.sort().split('_')[0]],count=String(page.counts.scope_count).replace(/\B(?=(\d{3})+(?!\d))/g,',');body.push(el('p',count+' '+(page.counts.scope_count==='1'?'item':'items')+' · Sorted by '+sortName+' '+(pages.sort().endsWith('_DESC')?'Z–A':'A–Z'),'bpay-next-omitted-summary'));}
      content.replaceChildren(...body);host.scrollTop=offset;if(anchor){const node=Array.from(host.querySelectorAll('[data-issue-row-key]')).find(n=>n.dataset.issueRowKey===anchor.key);if(node)host.scrollTop=Math.max(0,host.scrollTop+node.getBoundingClientRect().top-host.getBoundingClientRect().top-anchor.offset);}footer.replaceChildren();footer.hidden=true;focus.after(token);
    }
    frame=options.showReadWindow({title:'Not in this Draft',content,footer,canFocus:current,onMount:()=>{render();if(pages.snapshot()===null&&!busy)void act(refresh);},onDismiss:()=>{closed=true;}});return frame;
  }

  const workerReviewWindows=new Map();
  // SP15 owns these two entries; DR15 extends the same closed table.
  const PREPARATION_ISSUE_COPY=Object.freeze({
  "SOURCE_PAY_QUERY_OPEN": {
    "review": "Pay Query open on this Timesheet — resolve it in Weekly Source Office Checks",
    "omitted": "Pay query open"
  },
  "SOURCE_PAY_QUERY_EVIDENCE_UNAVAILABLE": {
    "review": "Pay Query evidence could not be confirmed — check the Timesheet's queries",
    "omitted": "Could not check the pay query"
  },
  "SELECTED_WORK_NOT_APPROVED": {
    "review": "The Timesheet is no longer authorised.",
    "omitted": "Changed after Create Draft — next Draft"
  },
  "SELECTED_WORK_REVISION_CHANGED": {
    "review": "The authorised Timesheet changed after Create Draft.",
    "omitted": "Changed after Create Draft — next Draft"
  },
  "SELECTED_WORK_POSITION_PENDING": {
    "review": "The authorised Timesheet changed after Create Draft.",
    "omitted": "Changed after Create Draft — next Draft"
  },
  "CAPTURE_POSITION_CHANGED": {
    "review": "The authorised Timesheet could not be prepared; try again.",
    "omitted": "The authorised Timesheet could not be prepared; try again."
  },
  "POSITION_COMPONENT_EVIDENCE_MISSING": {
    "review": "Part of the authorised Timesheet could not be checked; try again.",
    "omitted": "Part of the authorised Timesheet could not be checked; try again."
  },
  "POSITION_APPROVAL_AMOUNT_MISMATCH": {
    "review": "The authorised Timesheet amount could not be checked; try again.",
    "omitted": "The authorised Timesheet amount could not be checked; try again."
  },
  "UMBRELLA_WORK_EXECUTION_UNSUPPORTED": {
    "review": "This Timesheet cannot be paid this way; check the Timesheet.",
    "omitted": "This Timesheet cannot be paid this way; check the Timesheet."
  },
  "SOURCE_BOOK_APPROVAL_UNBOUND": {
    "review": "The authorised Source Timesheet could not be checked; try again.",
    "omitted": "The authorised Source Timesheet could not be checked; try again."
  },
  "FINANCIAL_RESOLUTION_REQUIRED": {
    "review": "The payment needs a decision before it can be prepared.",
    "omitted": "The payment needs a decision before it can be prepared."
  },
  "TARGET_UMBRELLA_MISSING": {
    "review": "Choose the Candidate’s Umbrella before trying again.",
    "omitted": "Choose the Candidate’s Umbrella before trying again."
  },
  "SEGMENT_CREDIT_ATTRIBUTION_UNAVAILABLE": {
    "review": "The Timesheet correction could not be checked; contact support.",
    "omitted": "The Timesheet correction could not be checked; contact support."
  },
  "CASE_SELECTION_REQUIRED": {
    "review": "The selected payments could not be checked; contact support.",
    "omitted": "The selected payments could not be checked; contact support."
  },
  "CASE_TARGET_UNSUPPORTED": {
    "review": "The selected payment cannot be paid this way; contact support.",
    "omitted": "The selected payment cannot be paid this way; contact support."
  },
  "CASE_INPUT_UNBOUND": {
    "review": "The selected payment details could not be checked; contact support.",
    "omitted": "The selected payment details could not be checked; contact support."
  },
  "CASE_WEEK_BASIS_UNBOUND": {
    "review": "The payment week could not be checked; contact support.",
    "omitted": "The payment week could not be checked; contact support."
  },
  "CASE_RETURN_FLOOR_UNBOUND": {
    "review": "The returned payment details could not be checked; contact support.",
    "omitted": "The returned payment details could not be checked; contact support."
  },
  "CASE_NO_PAYABLE_AMOUNT": {
    "review": "Nothing to pay — deductions stay outstanding.",
    "omitted": "Nothing to pay — deductions stay outstanding."
  },
  "PF08_NEEDS_ATTENTION": {
    "review": "Could not prepare this Candidate after several tries.",
    "omitted": "Could not prepare this Candidate after several tries."
  },
  "BPAY_NEXT_WORK_WEEK_NOT_YET_PAYABLE": {
    "review": "Not yet payable",
    "omitted": "Not yet payable"
  },
  "BPAY_NEXT_SELECTION_ON_HOLD": {
    "review": "Pay on hold",
    "omitted": "Pay on hold"
  },
  "BPAY_NEXT_SELECTION_SNOOZED": {
    "review": "Snoozed",
    "omitted": "Snoozed"
  },
  "BPAY_NEXT_SELECTION_WORK_NOT_APPROVED": {
    "review": "No longer authorised",
    "omitted": "No longer authorised"
  },
  "BPAY_NEXT_SELECTION_REVISION_NOT_CURRENT": {
    "review": "Changed after Create Draft — next Draft",
    "omitted": "Changed after Create Draft — next Draft"
  },
  "BPAY_NEXT_SELECTION_SIGNED_LINE_NOT_ELIGIBLE": {
    "review": "This line cannot be paid in Banking Pay; check the Timesheet.",
    "omitted": "This line cannot be paid in Banking Pay; check the Timesheet."
  },
  "BPAY_NEXT_SIGNED_COMPONENT_NOT_ELIGIBLE": {
    "review": "This line cannot be paid in Banking Pay; check the Timesheet.",
    "omitted": "This line cannot be paid in Banking Pay; check the Timesheet."
  },
  "PAYE_EXCLUDED_BY_SAME_WEEK_GUARD": {
    "review": "A PAYE Draft already exists for this pay week",
    "omitted": "A PAYE Draft already exists for this pay week"
  },
  "ORIGIN_UNAUTHORISED_WAIT": {
    "review": "Recovery paused — waiting for re-authorisation",
    "omitted": "Recovery paused — waiting for re-authorisation"
  },
  "DRAFT_CANDIDATE_REMOVED": {
    "review": "Removed from Draft — payments are back in Banking Pay.",
    "omitted": "Removed from Draft — payments are back in Banking Pay."
  },
  "PREPARATION_ENROLMENT_FAILED": {
    "review": "Could not prepare this Candidate; contact support.",
    "omitted": "Could not prepare this Candidate; contact support."
  },
  "PREPARATION_EXPIRED": {
    "review": "The Draft expired — payments are back in Banking Pay.",
    "omitted": "The Draft expired — payments are back in Banking Pay."
  },
  "DRAFT_DISCARDED": {
    "review": "The Draft was discarded — payments are back in Banking Pay.",
    "omitted": "The Draft was discarded — payments are back in Banking Pay."
  }
});

  function openWorkerReview(options,runId){
    requireActor(options);if(!field(runId,'uuid')||options.ownerReady()!==true)fail('REQUEST_INVALID');
    const reviewScope=options.progressNamespace?preparationScope(options.progressNamespace):null;
    const identity=options.actorId.toLowerCase()+':'+(reviewScope??'')+':'+runId.toLowerCase(),existing=workerReviewWindows.get(identity);
    if(existing?.alive()){existing.focus();return existing;}
    const doc=options.document||document,win=options.window||window,transport=options.transport||createTransport(options);
    const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const issuePages=preparationIssuePages(transport,runId,'CANDIDATES');
    const content=el('section',undefined,'bpay-next-worker-review'),footer=el('div',undefined,'bpay-next-window-actions'),headerDetail=el('span',undefined,'bpay-next-progress-subtitle');
    headerDetail.hidden=true;headerDetail.dataset.nextLiveCopy='';
    let totals=null,caseDetail=null;
    let frame,controller,busy=false,closed=false,timer=null,page=null,progressFacts=null,progressTicket=0,readError='',result='',selected=null,scrollOffset=0,loadingMore=false,discardRequested=false;
    const current=()=>{try{return !closed&&same(options.currentActorId(),options.actorId)&&options.ownerReady()===true
      &&(!reviewScope||!options.progressCurrentNamespace||preparationScope(options.progressCurrentNamespace())===reviewScope);}catch{return false;}};
    const button=(text,fn,disabled=false,primary=false)=>{const b=el('button',text,primary?'btn primary':'btn');b.type='button';b.disabled=disabled;if(!primary)b.dataset.nextSecondary='';b.dataset.nextFocusKey=text;b.addEventListener('click',()=>void act(fn));return b;};
    const money=v=>{if(v===null)return '—';const neg=v.startsWith('-'),[whole,fraction='']=(neg?v.slice(1):v).split('.');return (neg?'−':'')+'£'+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+fraction.padEnd(2,'0').slice(0,2);};
    const focus=ui.continuity(content,doc,()=>content.querySelector('button'));
    async function act(fn){if(busy||!current())return;busy=true;readError='';render();try{await fn();}catch(e){readError=e?.serverCode==='BPAY_NEXT_CONFIRM_PREPARATION_DISCARDED_OR_BLOCKED'?'This Draft was discarded or has payments that could not be removed.':e?.serverCode==='BPAY_NEXT_CONFIRM_PREPARATION_EXPIRED_OR_UNBOUND'?'This Draft has expired.':controller.snapshot().pending?'The result is not known; try this request again.':e?.serverCode==='BPAY_NEXT_PREPARE_ISSUES_CONTEXT_CHANGED'||e?.code==='READ_CHANGED'?'The list has changed. Refresh and try again.':'Could not complete this action; refresh and try again.';}finally{busy=false;render();}}

    async function readTotals(next){
      const total=await transport.page('REVIEW_TOTALS',{run_id:runId});
      if(!current())return;
      for(const key of ['review_revision','run_status','selection_state','paye_totals_revision','umbrella_totals_revision'])if(total.context[key]!==next.context[key])fail('READ_CHANGED');
      return total;
    }
    async function readCases(row,after=null,direction='next'){
      const state=caseDetail?.worker===row.run_worker_id?caseDetail:{worker:row.run_worker_id,row,sort:'DEDUCTION_ASC',page:null,history:[],after:null,scroll:0};
      const next=await transport.page('REVIEW_CASES',{run_id:runId,run_worker_id:row.run_worker_id,sort:state.sort,after,limit:100});
      if(!current()||!page)return;
      for(const key of ['review_revision','paye_totals_revision','umbrella_totals_revision'])if(next.context[key]!==page.context[key])fail('READ_CHANGED');
      if(next.context.preparation_revision!==row.preparation_revision)fail('READ_CHANGED');
      const history=after===null?[]:direction==='back'?state.history.slice(0,-1):[...state.history,state.after];
      caseDetail={...state,page:next,after,history,scroll:0};
    }
    async function toggleCases(row){
      if(caseDetail?.worker===row.run_worker_id){caseDetail=null;return;}
      caseDetail={worker:row.run_worker_id,row,sort:'DEDUCTION_ASC',page:null,history:[],after:null,scroll:0};await readCases(row);
    }
    function caseLines(row,locked){
      const state=caseDetail,host=el('div',undefined,'bpay-next-case-review-scroll');
      host.tabIndex=0;host.setAttribute('role','region');host.setAttribute('aria-label',row.candidate_display_name+' payments');
      if(!state?.page){const loading=el('p','Loading payments…');loading.setAttribute('role','status');host.append(loading);return host;}
      const table=el('table',undefined,'ctms-universal-table ctms-universal-card-table'),head=el('thead'),titles=el('tr'),body=el('tbody');
      const sort=async key=>{state.sort=key+'_'+(state.sort===key+'_ASC'?'DESC':'ASC');await readCases(row);};
      for(const [label,key]of [['Deduction','DEDUCTION'],['Due','DUE'],['This Draft','THIS_DRAFT'],['Outstanding after','OUTSTANDING'],['Note','NOTE']]){
        const th=el('th'),sorted=state.sort.startsWith(key+'_');th.setAttribute('aria-sort',sorted?(state.sort.endsWith('_DESC')?'descending':'ascending'):'none');th.append(button(label,()=>sort(key),locked));titles.append(th);
      }
      head.append(titles);
      const phone=el('label','Sort payments by','bpay-next-issue-phone-sort'),select=el('select');
      for(const [label,key]of [['Deduction','DEDUCTION'],['Due','DUE'],['This Draft','THIS_DRAFT'],['Outstanding after','OUTSTANDING'],['Note','NOTE']])for(const direction of ['ASC','DESC']){const o=el('option',label+(direction==='ASC'?' ascending':' descending'));o.value=key+'_'+direction;select.append(o);}
      select.value=state.sort;select.disabled=locked;select.addEventListener('change',()=>void act(async()=>{state.sort=select.value;await readCases(row);}));phone.append(select);
      for(const item of state.page.rows){
        const tr=el('tr');tr.tabIndex=0;tr.dataset.caseComponentId=item.case_component_id;tr.dataset.nextFocusKey='review-case:'+item.case_component_id;tr.setAttribute('aria-selected',String(state.selected===item.case_component_id));tr.addEventListener('click',()=>{state.selected=item.case_component_id;for(const n of body.children)n.setAttribute('aria-selected',String(n===tr));});tr.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const all=Array.from(body.children),i=all.indexOf(tr),next=e.key==='Home'?all[0]:e.key==='End'?all.at(-1):all[Math.max(0,Math.min(all.length-1,i+(e.key==='ArrowDown'?1:-1)))];if(next){state.selected=next.dataset.caseComponentId;for(const n of all)n.setAttribute('aria-selected',String(n===next));next.focus();next.scrollIntoView({block:'nearest'});}});const values=[item.label,money(item.due),money(item.this_draft),money(item.outstanding_after),item.note||'—'];
        for(let i=0;i<values.length;i++){const td=el('td',values[i]);td.dataset.label=['Deduction','Due','This Draft','Outstanding after','Note'][i];
          if(i>0&&i<4){td.dataset.nextFormattedMoney='';td.classList.add('bpay-next-review-money');if((i===1||i===3)&&item.source_pay_channel!==null&&item.source_pay_channel!==row.pay_channel)td.append(el('small',item.source_pay_channel==='PAYE'?'PAYE':'Umbrella'));}
          tr.append(td);
        }
        body.append(tr);
      }
      table.append(head,body);host.append(phone,table);host.scrollTop=state.scroll;
      host.addEventListener('scroll',()=>{state.scroll=host.scrollTop;if(locked||readError)return;if(host.scrollTop<30&&state.history.length)void act(()=>readCases(row,state.history.at(-1),'back'));else if(host.scrollTop+host.clientHeight>=host.scrollHeight-50&&!state.page.complete)void act(()=>readCases(row,state.page.next_cursor));});
      return host;
    }
    function totalsCards(){
      const host=el('div',undefined,'bpay-next-draft-totals');host.classList.toggle('is-stale',Boolean(readError));host.setAttribute('aria-label','Draft totals');
      const cards=[['Whole Draft',totals?.whole],['PAYE Draft',totals?.channels[0]],['Umbrella Draft',totals?.channels[1]]];
      for(const [name,value]of cards){const card=el('section',undefined,'bpay-next-draft-total-card'),title=el('h3',name),count=el('strong',value?value.candidate_count+(value.candidate_count==='1'?' Candidate':' Candidates'):'—');card.append(title,count);
        const list=el('dl');const unknown=value===undefined||BigInt(value.net_missing_count)>0n||BigInt(value.net_replacement_pending_count)>0n;
        for(const [label,key]of [['Gross ex VAT','gross_ex_vat'],['VAT','gross_vat'],['Deductions at gross','gross_stage_deductions'],['Recoveries from PAYE net','net_recovery_reserved'],['Bank amount','cash_known']]){
          if(name==='PAYE Draft'&&key==='gross_vat')continue;
          const text=key==='cash_known'&&unknown?(value===undefined?'—':BigInt(value.net_replacement_pending_count)>0n?'PAYE net is updating':'PAYE net not entered'):money(value?.[key]??null);
          const group=el('div');group.append(el('dt',key==='net_recovery_reserved'&&name!=='PAYE Draft'?'Recoveries at net':label),el('dd',text));group.lastChild.dataset.nextFormattedMoney='';list.append(group);
        }
        card.append(list);host.append(card);
      }return host;
    }

    async function readRows(cursor=null,direction='next'){
      loadingMore=cursor!==null;if(cursor===null&&direction!=='back')scrollOffset=0;render();
      try{const next=await issuePages.read(cursor,direction);if(!current())return;const total=await readTotals(next);if(!current())return;page=next;totals=total;caseDetail=null;}finally{loadingMore=false;}
    }
    async function updateAction(){
      const s=controller.snapshot(),a=s.worker_action;if(!a||s.pending)return;
      const status=await controller.page('STATUS',{run_id:runId,run_worker_id:a.run_worker_id,after_transfer_no:null,limit:1}),h=status.header;
      if(!current()||!same(h.candidate_id,s.candidate_id)||BigInt(h.preparation_revision)<BigInt(a.preparation_revision))return;
      if(!['READY','REVIEW','CANCELLED'].includes(h.worker_status)||(a.action==='RELEASE'&&h.worker_status!=='CANCELLED'))return;
      if(h.preparation_revision!==a.preparation_revision||h.run_status==='CANCELLED'){
        const original=await controller.refreshWorkerAction();if(original.phase==='EXPIRED'){result='This Draft has expired.';return;}if(original.phase!=='COMPLETE')return;
      }
      const review=await controller.mutate('REVIEW',{run_id:runId});
      if(controller.settleWorkerAction(h,review))result=h.worker_status==='CANCELLED'?(a.action==='RELEASE'?'Candidate removed from Draft.':'Candidate not in this Draft.'):h.worker_status==='READY'?'Candidate ready.':'Could not prepare this Candidate after several tries.';
    }
    async function openReviewTimesheet(row){
      if(!current()||controller.snapshot().pending||controller.snapshot().worker_action||!page)fail('REQUEST_INVALID');
      await openPreparationIssueTimesheet(options,transport,runId,row,page.context);
    }
    async function readDeadline(){
      const ticket=++progressTicket;const next=await transport.page('PROGRESS',{run_id:runId});
      if(!current()||ticket!==progressTicket)return false;progressFacts=next.rows[0];return true;
    }
    async function refresh(){
      const s=controller.snapshot();if(s.pending)return;if(!await readDeadline())return;
      if(progressFacts.discard_phase!==null){result=discardResultCopy(progressFacts);await readRows();if(progressFacts.discard_phase==='DISCARDED'&&discardRequested){discardRequested=false;await backToBankingPay();}return;}
      if(['CANCELLING','CANCELLED'].includes(progressFacts.status)){result=progressFacts.expired_at_utc?'This Draft has expired.':'Its payments are returning to Banking Pay.';await readRows();return;}
      await updateAction();
      if(!controller.snapshot().worker_action)await controller.mutate('REVIEW',{run_id:runId});await readRows();
    }
    async function backToBankingPay(){const p=progressFacts;if(await frame.close()===true&&p?.discard_phase==='DISCARDED')await options.onPreparationDiscarded?.(p);}
    async function discardDraft(){if(!await readDeadline())return;const receipt=await confirmPreparationDiscard(options,controller,progressFacts,current,el);if(!receipt)return;discardRequested=receipt.phase!=='EMPTY';result=receipt.phase==='EMPTY'?'There are no Candidates to discard.':'Discarding Draft…';await refresh();}
    async function ask(row,kind){
      const s=controller.snapshot();if(s.pending||s.worker_action||s.confirmed)fail('REQUEST_INVALID');
      controller.bind({worker_id:row.run_worker_id,candidate_id:row.candidate_id});
      const status=await controller.page('STATUS',{run_id:runId,run_worker_id:row.run_worker_id,after_transfer_no:null,limit:1}),h=status.header;
      if(!current()||!same(h.candidate_id,row.candidate_id)||progressFacts?.discard_phase!==null||!['PREPARING','REVIEW'].includes(h.run_status)||h.selection_state!=='SEALED'||!(kind==='WORKER_REPREPARE'?h.worker_status==='REVIEW':['PREPARING','REVIEW','READY'].includes(h.worker_status)))fail('REQUEST_INVALID');
      const remove=kind==='WORKER_RELEASE',body=el('section',undefined,'bpay-next-worker-confirmation'),heading=el('h2'),icon=el('span',remove?'!':'?','bpay-next-question-icon');icon.setAttribute('aria-hidden','true');
      heading.append(icon,el('span',remove?'Remove this Candidate from the Draft?':'Try this Candidate again?'));
      body.classList.toggle('is-remove',remove);
      const consequence=el('p',remove?'Their payments go back to Banking Pay for the next Draft.':'Banking Pay tries this Candidate again with the same payments. The rest of the Draft does not change.'),value=el('p',h.target_pay_channel==='PAYE'?'PAYE':'Umbrella');
      for(const n of [heading,consequence,value])n.dataset.nextLiveCopy='';body.append(heading,consequence,value);
      const actions=el('div',undefined,'bpay-next-window-actions');let dialog,accepted=false;
      const cancel=el('button',remove?'Keep in Draft':'Cancel','btn'),submit=el('button',remove?'Remove from Draft':'Try again',remove?'btn btn-warn':'btn primary');
      cancel.type=submit.type='button';cancel.dataset.nextSecondary='';if(remove)submit.dataset.nextDestructive='';cancel.addEventListener('click',()=>void dialog.close());submit.addEventListener('click',()=>{if(!current())return;accepted=true;void dialog.close();});
      if(remove)actions.classList.add('bpay-next-worker-remove-actions');
      actions.append(cancel,submit);
      const confirmed=await new Promise(resolve=>{dialog=options.showReadWindow({title:remove?'Remove from Draft':'Try again',content:body,footer:actions,small:true,confirmation:true,canFocus:current,onDismiss:()=>resolve(accepted&&current())});});
      if(!confirmed)return;requireActor(options);
      const receipt=await controller.mutate(kind,{command_id:controller.newId(),run_worker_id:row.run_worker_id,expected_preparation_revision:h.preparation_revision});
      result=receipt.phase==='DISCARDED'?'This Draft was discarded.':receipt.phase==='EXPIRED'?'This Draft has expired.':remove?'Removing from Draft…':'Trying again…';
      await updateAction();await readRows();
    }
    function render(){
      if(!controller||!content.isConnected)return;win.clearTimeout(timer);if(!current()){headerDetail.hidden=true;headerDetail.textContent='';content.replaceChildren(el('p','Banking Pay is unavailable.'));footer.replaceChildren();return;}
      headerDetail.textContent=progressFacts?'Started by '+progressFacts.actor_display_name+' · '+win.CloudTMSBpayNextDates.formatTimestamp(progressFacts.started_at_utc):'';if(totals)headerDetail.textContent+=' · Figures from '+win.CloudTMSBpayNextDates.formatTimestamp(totals.captured_at_utc);headerDetail.hidden=!headerDetail.textContent;
      content.classList.toggle('has-read-error',Boolean(readError));const token=focus.before(),s=controller.snapshot(),locked=busy||s.busy||s.pending!==null||s.worker_action!==null||!current();
      if(progressFacts?.discard_phase!==null&&progressFacts?.discard_phase!==undefined){headerDetail.textContent=discardActorCopy(progressFacts,win.CloudTMSBpayNextDates.formatTimestamp);headerDetail.hidden=false;}
      const top=el('div',undefined,'bpay-next-review-tools');top.append(button('Refresh',refresh,locked));if(progressFacts){const strip=el('div',undefined,'bpay-next-review-counts');for(const [label,value]of [['Candidates',page?.counts.scope_count??progressFacts.selected_candidates],['To review',progressFacts.review],['Expires',win.CloudTMSBpayNextDates.formatTimestamp(progressFacts.expires_at_utc)]]){const group=el('div');group.append(el('small',label),el('strong',value));strip.append(group);}top.prepend(strip);}if(totals)top.append(el('small','Updated '+win.CloudTMSBpayNextDates.formatTimestamp(totals.observed_at_utc))); const sortLabel=el('label','Sort by','bpay-next-issue-phone-sort'),sortSelect=el('select');for(const [key,label]of [['CANDIDATE_ASC','Candidate A–Z'],['CANDIDATE_DESC','Candidate Z–A'],['GROSS_ASC','Amount low–high'],['GROSS_DESC','Amount high–low'],['CHANNEL_ASC','Pay channel A–Z'],['CHANNEL_DESC','Pay channel Z–A'],['DEDUCTIONS_ASC','Deductions low–high'],['DEDUCTIONS_DESC','Deductions high–low'],['STATE_ASC','To review first'],['STATE_DESC','Reverse state order']]){const option=el('option',label);option.value=key;sortSelect.append(option);}sortSelect.value=issuePages.sort();sortSelect.disabled=locked;sortSelect.addEventListener('change',()=>void act(async()=>{issuePages.setSort(sortSelect.value);await readRows();}));sortLabel.append(sortSelect);top.prepend(sortLabel);
      const message=el('p',readError||(s.pending?'The result is not known; try this request again.':result||(busy&&!loadingMore?(page===null?'Loading Draft…':'Checking Candidates…'):'')),readError||s.pending?'ws-notice ws-notice--danger':'ws-notice ws-notice--info');message.hidden=!message.textContent;message.dataset.nextLiveCopy='';message.setAttribute('role',readError||s.pending?'alert':'status');
      if(!readError&&!s.pending&&['Candidate ready.','Candidate removed from Draft.','Candidate not in this Draft.','Draft confirmed.'].includes(result))message.className='ws-notice bpay-next-result-success';
      if(!readError&&!s.pending&&progressFacts?.discard_phase==='PARTIAL')message.className='ws-notice ws-notice--danger';
      const scroll=el('div',undefined,'ctms-universal-table-host bpay-next-review-results');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Draft results');
      const hasActions=(page?.rows??[]).some(row=>row.physical_timesheet_id!==null||row.worker_status==='READY'||progressFacts?.discard_phase===null&&['PREPARING','REVIEW'].includes(row.worker_status));
      const table=el('table',undefined,'ctms-universal-table ctms-universal-card-table'),head=el('thead'),titles=el('tr'),rows=el('tbody');for(const [label,key]of [['Candidate','CANDIDATE'],['Pay channel','CHANNEL'],['Gross ex VAT','GROSS'],['Deductions','DEDUCTIONS'],['State','STATE'],...(hasActions?[['Actions',null]]:[])]){const th=el('th');if(key){const sorted=issuePages.sort().startsWith(key+'_'),desc=sorted&&issuePages.sort().endsWith('_DESC');th.setAttribute('aria-sort',sorted?(desc?'descending':'ascending'):'none');th.append(button(label,async()=>{issuePages.setSort(key+'_'+(desc?'ASC':'DESC'));await readRows();},locked));}else th.textContent=label;titles.append(th);}head.append(titles);
      for(const row of page?.rows??[]){
        const tr=el('tr');tr.tabIndex=0;tr.dataset.workerId=row.run_worker_id??'';tr.dataset.issueRowKey=row.row_key;tr.setAttribute('aria-selected',String(selected===row.row_key));
        tr.dataset.nextFocusKey='issue-row:'+row.row_key;
        tr.addEventListener('keydown',e=>{if(e.target!==tr||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const all=Array.from(tr.parentElement.querySelectorAll('tr[data-issue-row-key]')),i=all.indexOf(tr),target=e.key==='Home'?all[0]:e.key==='End'?all.at(-1):all[Math.max(0,Math.min(all.length-1,i+(e.key==='ArrowDown'?1:-1)))];if(target){selected=target.dataset.issueRowKey;for(const node of all)node.setAttribute('aria-selected',String(node===target));target.focus();target.scrollIntoView({block:'nearest'});}});
        tr.addEventListener('click',event=>{if(event.target.closest('button'))return;selected=row.row_key;render();});
        const labels=[row.candidate_display_name??'—',row.pay_channel===null?'—':row.pay_channel==='PAYE'?'PAYE':'Umbrella',money(row.frozen_ex_vat),money(row.deduction_total),null,null];
        for(let i=0;i<(hasActions?6:5);i++){const td=el('td',labels[i]);td.dataset.label=['Candidate','Pay channel','Gross ex VAT','Deductions','State','Actions'][i];if(i===0){td.replaceChildren(el('strong',labels[i]));if(row.frozen_offer_complete&&BigInt(row.case_count??'0')>0n){const open=caseDetail?.worker===row.run_worker_id,caret=button(open?'▾':'▸',()=>toggleCases(row),locked||Boolean(readError));caret.className='bpay-next-review-caret';caret.setAttribute('aria-expanded',String(open));caret.setAttribute('aria-label',(open?'Hide':'Show')+' payments for '+(row.candidate_display_name??'Candidate'));td.prepend(caret);}if(row.candidate_reference!==null)td.append(el('small',row.candidate_reference));if(row.timesheet_reference!==null)td.append(el('small','Timesheet '+row.timesheet_reference+(row.week_ending_date?' · Week ending '+row.week_ending_date.split('-').reverse().join('/') : '')));}if(i===2||i===3){td.className='bpay-next-review-money';td.dataset.nextFormattedMoney='';}tr.append(td);}
        const state=el('span',row.waiting_on_other_run?'Waiting':({PENDING:'Waiting to prepare',FAILED:'To review',NOT_IN_DRAFT:'Not in this Draft',DRAFT:'Confirmed',ISSUED:'Issued',COMPLETE:'Complete',PREPARING:'Preparing',REVIEW:'To review',READY:'Ready',CANCELLING:'Removing',CANCELLED:'Not in this Draft'})[row.worker_status]||'Preparing','candidate-office-badge candidate-office-badge--'+({PENDING:'neutral',FAILED:'warning',NOT_IN_DRAFT:'neutral',DRAFT:'success',ISSUED:'info',COMPLETE:'success',REVIEW:'warning',READY:'success',PREPARING:'info',CANCELLING:'info',CANCELLED:'neutral'})[row.worker_status]);
        const stateValue=el('div');stateValue.append(state);tr.children[4].replaceChildren(stateValue);if(row.waiting_on_other_run)stateValue.append(el('small',preparationIssueReason(row)));if(row.capacity_reduced_by_other_run)stateValue.append(el('small','Some deductions are already in another Draft.'));
        if(['REVIEW','FAILED'].includes(row.worker_status)){stateValue.append(el('small',preparationIssueReason(row)));}
        if(row.discard_outcome==='BLOCKED'){state.textContent='Could not remove';state.className='candidate-office-badge candidate-office-badge--danger';stateValue.replaceChildren(state,el('small','This payment cannot be removed; refresh or contact support.'));}
        const actions=el('div',undefined,'bpay-next-review-row-actions'),rowLocked=locked||Boolean(readError);
        if(row.physical_timesheet_id!==null&&row.expected_revision_id!==null&&typeof options.issueOwners?.reviewTimesheet==='function')actions.append(button('Open Timesheet',()=>openReviewTimesheet(row),rowLocked));
        if(row.worker_status==='READY')actions.append(button('Draft detail',()=>openFrozenWorkerDetail({...options,detailRunId:runId,detailCandidateId:row.candidate_id},row.run_worker_id),rowLocked));
        const openRow=()=>{if(locked||readError)return;if(row.worker_status==='READY')openFrozenWorkerDetail({...options,detailRunId:runId,detailCandidateId:row.candidate_id},row.run_worker_id);else if(row.physical_timesheet_id!==null&&row.expected_revision_id!==null&&typeof options.issueOwners?.reviewTimesheet==='function')void act(()=>openReviewTimesheet(row));};
        tr.addEventListener('dblclick',e=>{if(!e.target.closest('button'))openRow();});
        tr.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.target.closest('button')){e.preventDefault();openRow();}});
        if(progressFacts?.discard_phase===null&&row.worker_status==='REVIEW')actions.append(button('Try again',async()=>{
          if(row.issue_code==='PF08_NEEDS_ATTENTION'){
            let namespace=options.progressNamespace||options.progressCurrentNamespace?.();
            if(!namespace){const header=await win.CloudTMSBpayNextWorkbench.createWorkbenchClient(options).loadWorkbenchPage('HEADER',{});if(!current())fail('ACTOR_CHANGED');namespace=header.context;}
            if(await frame.close()===true)openBpayNextPreparationProgress({...options,progressNamespace:namespace,submissionComplete:true},runId);
          }else await ask(row,'WORKER_REPREPARE');
        },rowLocked));
        if(progressFacts?.discard_phase===null&&['PREPARING','REVIEW','READY'].includes(row.worker_status))actions.append(button('Remove from Draft',()=>ask(row,'WORKER_RELEASE'),rowLocked));
        if(row.physical_timesheet_id!==null&&row.expected_revision_id!==null||row.worker_status==='READY'){const phone=button('Open',()=>{if(row.worker_status==='READY')return openFrozenWorkerDetail({...options,detailRunId:runId,detailCandidateId:row.candidate_id},row.run_worker_id);return openReviewTimesheet(row);},rowLocked);phone.classList.add('bpay-next-phone-open');for(const child of actions.querySelectorAll('button'))if(['Open Timesheet','Draft detail'].includes(child.textContent))child.classList.add('bpay-next-desktop-open');actions.append(phone);}if(hasActions){tr.children[5].append(actions);tr.children[5].hidden=actions.childElementCount===0;}for(const action of tr.querySelectorAll('button'))action.dataset.nextFocusKey='issue-action:'+row.row_key+':'+action.textContent;rows.append(tr);if(caseDetail?.worker===row.run_worker_id){const detail=el('tr',undefined,'bpay-next-case-detail-row'),td=el('td');td.colSpan=hasActions?6:5;td.append(caseLines(row,rowLocked));detail.append(td);rows.append(detail);}
      }
      table.append(head,rows);scroll.append(table);
      scroll.addEventListener('scroll',()=>{scrollOffset=scroll.scrollTop;if(locked||readError||!page)return;if(scroll.scrollTop<40&&page.history.length)void act(()=>readRows(page.history.at(-1),'back'));else if(scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-80&&!page.complete)void act(()=>readRows(page.next_cursor));});
      const recovery=s.pending?button('Try again',async()=>{const action=controller.snapshot().pending?.action,receipt=await controller.retry();if(action==='PREPARATION_DISCARD'){discardRequested=receipt.phase!=='EMPTY';result=receipt.phase==='EMPTY'?'There are no Candidates to discard.':'Discarding Draft…';await refresh();return;}result=receipt.phase==='EXPIRED'?'This Draft has expired.':receipt.action==='RELEASE'?'Removing from Draft…':receipt.action==='REPREPARE'?'Trying again…':'';await updateAction();await readRows();},busy||s.busy||!current()):null;
      const empty=page?.complete&&page.rows.length===0?el('p','No Candidates in this Draft.'):null,more=loadingMore?el('p','Loading more…'):null;
      more?.setAttribute('role','status');
      const reviewWarning=el('p',progressFacts&&BigInt(progressFacts.review)>0n?String(progressFacts.review)+(progressFacts.review==='1'?' Candidate needs':' Candidates need')+' review before you can confirm.':'','ws-notice ws-notice--warning');reviewWarning.setAttribute('role','status');
      const omitted=el('div',undefined,'bpay-next-omitted-information ws-notice ws-notice--info'),omission=page?preparationOmissionCopy(page.counts):'';if(omission){omitted.append(el('span',omission),button('Not in this Draft',()=>openNotInDraft({...options,transport},runId),locked));}
      content.replaceChildren(...(message.hidden?[]:[message]),...(recovery?[recovery]:[]),...(reviewWarning.textContent?[reviewWarning]:[]),...(omission?[omitted]:[]),top,...(empty?[empty]:[]),scroll,...(page?[el('p',String(page.counts.scope_count).replace(/\B(?=(\d{3})+(?!\d))/g,',')+(page.counts.scope_count==='1'?' Candidate':' Candidates')+' · Sorted by '+(issuePages.sort()==='STATE_ASC'?'state, To review first':issuePages.sort()==='STATE_DESC'?'state, reverse order':issuePages.sort().startsWith('CHANNEL_')?'pay channel, '+(issuePages.sort().endsWith('_DESC')?'Z to A':'A to Z'):issuePages.sort().startsWith('DEDUCTIONS_')?'deductions, '+(issuePages.sort().endsWith('_DESC')?'high to low':'low to high'):issuePages.sort().startsWith('GROSS_')?'amount, '+(issuePages.sort().endsWith('_DESC')?'high to low':'low to high'):'Candidate, '+(issuePages.sort().endsWith('_DESC')?'Z to A':'A to Z')),'bpay-next-omitted-summary')]:[]),...(more?[more]:[]),totalsCards());scroll.scrollTop=scrollOffset;footer.replaceChildren();
      if(progressFacts?.discard_phase===null&&['PREPARING','REVIEW'].includes(progressFacts.status)&&!s.confirmed){const discard=button('Discard this Draft',discardDraft,locked||Boolean(readError));discard.dataset.nextDestructive='';footer.append(discard);}
      if(['DISCARDED','PARTIAL'].includes(progressFacts?.discard_phase))footer.append(button('Back to Banking Pay',backToBankingPay,locked,true));
      else if(progressFacts?.discard_phase===null)footer.append(button('Confirm Draft',async()=>{await controller.mutate('CONFIRM',{run_id:runId,review_revision:s.review_revision});result='Draft confirmed.';await readRows();},locked||Boolean(readError)||page===null||totals===null||!progressFacts||progressFacts.discard_phase!==null||['CANCELLING','CANCELLED'].includes(progressFacts.status)||!s.can_confirm||!s.review_revision||s.confirmed,true));focus.after(token);
      footer.hidden=footer.childElementCount===0;
      if(!busy&&!s.busy&&!s.pending&&current()&&frame?.active()&&doc.visibilityState!=='hidden'&&(s.worker_action||progressFacts?.discard_phase==='CANCELLING'))timer=win.setTimeout(()=>void act(async()=>{if(progressFacts?.discard_phase==='CANCELLING')await refresh();else{await updateAction();await readRows();}}),2000);
    }
    controller=createController({actorId:options.actorId,reviewRunId:runId,storage:options.storage||win.sessionStorage,uuid:options.uuid||(()=>win.crypto.randomUUID()),transport,onChange:render});
    if(controller.snapshot().run_id===null)controller.bind({run_id:runId});
    const visibility=()=>{win.clearTimeout(timer);if(doc.visibilityState!=='hidden'&&frame?.active())void act(refresh);};
    frame=options.showReadWindow({title:'Draft review',content,footer,headerDetail,canFocus:current,onMount:()=>{render();void act(refresh);},onDismiss:()=>{closed=true;progressTicket++;win.clearTimeout(timer);doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('focus',visibility);win.removeEventListener('cloudtms:bpay-next-owner-changed',render);workerReviewWindows.delete(identity);}});
    doc.addEventListener('visibilitychange',visibility);win.addEventListener('focus',visibility);win.addEventListener('cloudtms:bpay-next-owner-changed',render);workerReviewWindows.set(identity,frame);return frame;
  }
  // DR06 navigation metadata uses the original actor/agency/owner, never a new cut.
  function preparationScope(namespace){
    if(!record(namespace)||!field(namespace.agency_id,'uuid')||!field(namespace.actor_user_id,'uuid')||!positive(namespace.owner_epoch))fail('JOURNAL_INVALID');
    return [namespace.actor_user_id.toLowerCase(),namespace.agency_id.toLowerCase(),namespace.owner_epoch].join('.');
  }
  function preparationStorage(options){try{return options.progressStorage??(options.window||window).localStorage;}catch{return null;}}
  function lastPreparation(options,namespace){
    try{const scope=preparationScope(namespace),raw=preparationStorage(options)?.getItem('cloudtms.bpay-next.last-run.v1.'+scope);if(raw===null||raw===undefined)return null;
      const value=JSON.parse(raw);if(!shape(value,{version:'lastRunVersion',run_id:'uuid',command_id:'uuid',agency_sequence:'positive',namespace:'choiceNamespace',readback_complete:'boolean'})
        ||preparationScope(value.namespace)!==scope||!same(value.namespace.actor_user_id,options.actorId))return null;return value;
    }catch{return null;}
  }
  function rememberPreparation(options,value){
    requireActor(options);if(options.ownerReady()!==true||!shape(value,{version:'lastRunVersion',run_id:'uuid',command_id:'uuid',agency_sequence:'positive',namespace:'choiceNamespace',readback_complete:'boolean'})||!same(value.namespace.actor_user_id,options.actorId))fail('JOURNAL_INVALID');
    try{const storage=preparationStorage(options);if(!storage)return false;storage.setItem('cloudtms.bpay-next.last-run.v1.'+preparationScope(value.namespace),JSON.stringify(value));return true;}catch{return false;}
  }
  const preparationProgressWindows=new Map();
  function openBpayNextPreparationProgress(options,runId) {
    requireActor(options);if(!field(runId,'uuid')||options.ownerReady()!==true)fail('REQUEST_INVALID');
    const namespace=options.progressNamespace,scope=preparationScope(namespace),identity=scope+'.'+runId.toLowerCase();
    if(!same(namespace.actor_user_id,options.actorId))fail('JOURNAL_INVALID');
    const prior=preparationProgressWindows.get(identity);if(prior?.alive()){prior.focus();return prior;}
    const doc=options.document||document,win=options.window||window,transport=options.transport||createTransport(options);
    const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const content=el('section',undefined,'bpay-next-progress'),footer=el('div',undefined,'bpay-next-window-actions'),headerDetail=el('span',undefined,'bpay-next-progress-subtitle');headerDetail.hidden=true;headerDetail.dataset.nextLiveCopy='';
    const format=v=>win.CloudTMSBpayNextDates.formatTimestamp(v),count=v=>String(v).replace(/\B(?=(\d{3})+(?!\d))/g,',');
    const current=()=>{try{return !closed&&same(options.currentActorId(),options.actorId)&&options.ownerReady()===true
      &&(!options.progressCurrentNamespace||preparationScope(options.progressCurrentNamespace())===scope);}catch{return false;}};
    let frame,closed=false,busy=false,readBusy=false,timer=null,ticket=0,facts=null,updated=null,readError='',result='',submissionError='',submissionComplete=options.submissionComplete===true,moreOpen=false,discardRequested=false;
    let omissionCounts=null,omissionError='';
    const waitingPages=preparationIssuePages(transport,runId,'CANDIDATES',true);let waitingBusy=false,waitingContinuation=false,waitingError='',waitingObserver=null,waitingTicket=0,waitingAnchor=null,waitingReset=false,waitingSelected=null;
    let attentionRows=[],attentionCursor=null,attentionComplete=true,attentionBusy=false,attentionError='',attentionVersion=null,attentionObserver=null,attentionTicket=0;
    const attentionEntries=new Map();
    if(options.restoredReadbackPending===true&&!submissionComplete)submissionError='Could not check the ticked payments; your Draft request is kept.';
    const focus=ui.continuity(doc.getElementById('modal'),doc,()=>doc.getElementById('btnCloseModal'));
    const controller=createController({...options,uuid:options.uuid||(()=>win.crypto.randomUUID()),storage:preparationStorage(options),transport,reviewRunId:runId,reviewJournalQualifier:'.progress.'+namespace.agency_id.toLowerCase()+'.'+namespace.owner_epoch,onChange:()=>render()});
    if(controller.snapshot().run_id===null)controller.bind({run_id:runId});
    if(!same(controller.snapshot().run_id,runId)||controller.snapshot().worker_action!==null||controller.snapshot().pending&&!['WAKE','PREPARATION_DISCARD'].includes(controller.snapshot().pending.action))fail('JOURNAL_INVALID');
    function button(text,action,disabled=false,primary=false){const b=el('button',text,primary?'btn primary':'btn');b.type='button';b.disabled=disabled;b.dataset.nextFocusKey=text;if(!primary)b.dataset.nextSecondary='';b.addEventListener('click',()=>void act(action));return b;}
    async function read(force=false){
      if(readBusy||!current())return;readBusy=true;const attempt=++ticket;render();
      try{const page=await transport.page('PROGRESS',{run_id:runId});if(!current()||attempt!==ticket)return;facts=page.rows[0];updated=new Date().toISOString();readError='';
        try{const omitted=await transport.page('PREPARE_ISSUES',{run_id:runId,view:'NOT_IN_DRAFT',sort:'CANDIDATE_ASC',after:null,limit:1,row_key:null,waiting_only:false});if(!current()||attempt!==ticket)return;omissionCounts=omitted.counts;omissionError='';}catch{omissionCounts=null;omissionError='Could not check payments outside this Draft; refresh and try again.';}if(facts.discard_phase==='DISCARDED'&&discardRequested){discardRequested=false;await backToBankingPay();}
        if(facts.discard_phase===null&&['PREPARING','REVIEW'].includes(facts.status)&&facts.needs_attention){if(force||attentionError||attentionVersion!==facts.review_revision)await readAttention(true);}
        else{attentionRows=[];attentionCursor=null;attentionComplete=true;attentionError='';attentionVersion=facts.review_revision;}
        if(facts.waiting_on_other_run)await readWaiting(force||!waitingPages.snapshot(), 'refresh');else{waitingError='';waitingPages.setSort(waitingPages.sort());}
      }
      catch{if(current()&&attempt===ticket)readError='Could not refresh.';}
      finally{if(attempt===ticket)readBusy=false;render();}
    }
    async function readWaiting(reset=false,direction='next'){
      if(waitingBusy||!current()||!facts?.waiting_on_other_run)return;waitingContinuation=!reset&&direction!=='refresh';waitingBusy=true;const attempt=++waitingTicket;render();
      try{const old=waitingPages.snapshot(),after=reset?null:direction==='back'?old?.history.at(-1)??null:old?.next_cursor??null;
        if(direction==='refresh'&&!reset)await waitingPages.refreshVisible();else{if(reset)waitingReset=true;await waitingPages.read(after,direction);}if(current()&&attempt===waitingTicket)waitingError='';
      }catch{if(current()&&attempt===waitingTicket)waitingError='Could not check waiting Candidates; refresh and try again.';}
      finally{if(attempt===waitingTicket)waitingBusy=false;render();}
    }
    async function readAttention(reset=false){
      if(attentionBusy||!current()||!facts?.needs_attention)return;attentionBusy=true;const attempt=++attentionTicket,requestedVersion=facts.review_revision;let stale=false;render();
      try{const page=await transport.page('WORKERS',{run_id:runId,after_candidate_id:reset?null:attentionCursor,limit:100,attention_only:true});
        if(!current()||attempt!==attentionTicket)return;
        if(!facts?.needs_attention||facts.review_revision!==requestedVersion){stale=true;return;}
        attentionRows=reset?page.rows:[...attentionRows,...page.rows];attentionCursor=page.next_cursor?.after_candidate_id??null;
        attentionComplete=page.complete;attentionVersion=requestedVersion;attentionError='';
      }catch{if(current()&&attempt===attentionTicket)attentionError='Could not check the Candidates who need attention.';}
      finally{if(attempt===attentionTicket)attentionBusy=false;render();if(stale&&current()&&facts?.needs_attention)void readAttention(true);}
    }
    function attentionEntry(row){
      let entry=attentionEntries.get(row.job_id);if(!entry){
        const retry=win.CloudTMSBpayNextWorkbench?.createWorkbenchRetryController;
        if(typeof retry!=='function')fail('DEPENDENCY_UNAVAILABLE');
        entry={row,result:'',unknown:false,controller:retry({...options,window:win,storage:preparationStorage(options),current},namespace,row)};
        attentionEntries.set(row.job_id,entry);
      }else if(!entry.controller.pending()&&!entry.controller.busy()){
        const operands=['candidate_id','work_id','job_id','owner_epoch','phase','cursor'];
        if(operands.some(key=>entry.row[key]!==row[key])){
          entry.controller=win.CloudTMSBpayNextWorkbench.createWorkbenchRetryController({...options,window:win,storage:preparationStorage(options),current},namespace,row);
          entry.result='';entry.unknown=false;
        }
        entry.row=row;
      }
      return entry;
    }
    async function retryAttention(entry){
      if(!current()||entry.controller.busy())return;entry.result='';entry.unknown=false;render();
      const request=entry.controller.execute();render();
      try{const receipt=await request;if(!current())return;entry.result=receipt?'Processing requested.':'';if(receipt)result='Processing requested for '+entry.row.candidate_display_name+'.';entry.unknown=false;await read(true);}
      catch(e){if(current()){entry.unknown=entry.controller.pending();entry.result=e?.definite?'Could not try this Candidate again; refresh and try again.':'The result is not known; try this request again.';}}
      finally{render();}
    }
    async function act(action){if(busy||!current())return;busy=true;render();try{await action();}catch(e){if(current())result=controller.snapshot().pending?'The result is not known; try this request again.':'Could not complete this action.';}finally{busy=false;render();}}
    async function wake(){moreOpen=false;render();const receipt=controller.snapshot().pending?await controller.retry():await controller.mutate('WAKE',{run_id:runId});if(!current())return;result=receipt.accepted?'Processing requested.':'Processing was already requested.';await read();}
    async function backToBankingPay(){const p=facts;if(await frame.close()===true&&p?.discard_phase==='DISCARDED')await options.onPreparationDiscarded?.(p);}
    async function discardDraft(){await read();if(!current()||readError)return;const receipt=await confirmPreparationDiscard(options,controller,facts,current,el);if(!receipt)return;discardRequested=receipt.phase!=='EMPTY';result=receipt.phase==='EMPTY'?'There are no Candidates to discard.':'Discarding Draft…';await read();}
    async function retryPending(){const action=controller.snapshot().pending?.action,receipt=await controller.retry();if(action==='PREPARATION_DISCARD'){discardRequested=receipt.phase!=='EMPTY';result=receipt.phase==='EMPTY'?'There are no Candidates to discard.':'Discarding Draft…';}else result=receipt.accepted?'Processing requested.':'Processing was already requested.';await read();}
    async function retryReadback(){
      if(options.retrySubmission){await options.retrySubmission();return;}
      const pointer=lastPreparation(options,namespace);if(!pointer||!same(pointer.run_id,runId))fail('JOURNAL_INVALID');
      const raw=preparationStorage(options)?.getItem('cloudtms.bpay-next.submit.v1.'+JSON.stringify(pointer.namespace));if(!raw)fail('JOURNAL_INVALID');
      const saved=JSON.parse(raw);if(!field(saved.descriptor,'descriptor')||JSON.stringify(saved.descriptor.namespace)!==JSON.stringify(pointer.namespace))fail('JOURNAL_INVALID');
      const submission=createChoiceSubmission({...options,window:win,storage:preparationStorage(options),transport,descriptor:saved.descriptor,resumeOnly:true,uuid:()=>fail('REQUEST_INVALID')});
      let before=submission?.snapshot();if(!before||!same(before.run_id,runId)||!same(before.command_id,pointer.command_id))fail('JOURNAL_INVALID');
      if(before.pending){if(before.pending.action!=='SEAL_ENQUEUE'||before.phase!=='SEAL')fail('JOURNAL_INVALID');await submission.retry();if(!current())return;before=submission.snapshot();}
      if(before.pending||!['READBACK','COMPLETE'].includes(before.phase))fail('JOURNAL_INVALID');
      if(before.phase==='READBACK')await submission.readback();if(!current())return;
      if(submission.snapshot().phase!=='COMPLETE'||!rememberPreparation(options,{...pointer,readback_complete:true}))fail('JOURNAL_INVALID');
      submissionComplete=true;submissionError='';await read();
    }
    async function review(){if(!current()||readError||!facts||facts.discard_phase!==null||facts.status!=='REVIEW'||!facts.enrolment_complete||!submissionComplete||controller.snapshot().pending)fail('REQUEST_INVALID');if(await frame.close()===true)openWorkerReview({...options,transport},runId);}
    async function issue(){if(!current()||readError||!submissionComplete||!facts||(BigInt(facts.review)===0n&&!(facts.discard_phase==='PARTIAL'&&BigInt(facts.discard_blocked_candidates)>0n))||controller.snapshot().pending)fail('REQUEST_INVALID');if(await frame.close()===true)openWorkerReview({...options,transport},runId);}
    function render(){
      const priorWaiting=content.querySelector('.bpay-next-waiting-scroll');if(priorWaiting&&!waitingReset){const top=priorWaiting.getBoundingClientRect().top,row=Array.from(priorWaiting.querySelectorAll('[data-waiting-row]')).find(n=>n.getBoundingClientRect().bottom>top);if(row)waitingAnchor={key:row.dataset.waitingRow,offset:row.getBoundingClientRect().top-top};}if(waitingReset){waitingAnchor=null;waitingReset=false;}
      win.clearTimeout(timer);attentionObserver?.disconnect();waitingObserver?.disconnect();if(!frame||closed||!content.isConnected)return;
      if(!current()){headerDetail.hidden=true;headerDetail.textContent='';content.replaceChildren(el('p','Banking Pay is unavailable.'));footer.replaceChildren();return;}
      const token=frame.active()?focus.before():null,state=controller.snapshot(),attentionPending=[...attentionEntries.values()].some(entry=>entry.controller.pending()),locked=busy||state.busy||state.pending!==null||attentionPending,body=[];
      const error=submissionError||readError||(state.pending?'The result is not known; try this request again.':'');
      if(error){const notice=el('div',undefined,'ws-notice ws-notice--danger');notice.setAttribute('role','alert');notice.append(el('strong',error));
        if(readError&&updated)notice.append(el('p','The figures below are from '+format(updated)+'.'));
        if(submissionError)notice.append(button('Try again',retryReadback,busy));else if(state.pending)notice.append(button('Try again',retryPending,busy||state.busy));else notice.append(button('Try again',read,busy||readBusy));body.push(notice);
      }else if(result&&facts?.discard_phase==null){const notice=el('p',result,'ws-notice ws-notice--info');notice.setAttribute('role','status');body.push(notice);}
      if(facts){
        const p=facts,n=k=>BigInt(p[k]),terminal=p.discard_phase!==null||['DRAFT','EXECUTING','COMPLETE','CANCELLING','CANCELLED'].includes(p.status);
        headerDetail.textContent='Started by '+p.actor_display_name+' · '+format(p.started_at_utc);headerDetail.hidden=false;
        if(p.discard_phase!==null){headerDetail.textContent=discardActorCopy(p,format);const notice=el('p',discardResultCopy(p),p.discard_phase==='PARTIAL'?'ws-notice ws-notice--danger':p.discard_phase==='DISCARDED'?'ws-notice bpay-next-result-success':'ws-notice ws-notice--info');notice.setAttribute('role','status');body.push(notice);}
        if(p.discard_phase===null&&p.status==='REVIEW'){const notice=el('div',undefined,'ws-notice bpay-next-result-success');notice.append(el('strong','The Draft is ready to review.'));if(n('review')>0n)notice.append(el('p',count(p.review)+(n('review')===1n?' Candidate needs':' Candidates need')+' review before you can confirm.'));body.push(notice);}
        if(p.discard_phase===null&&(p.status==='CANCELLING'||p.status==='CANCELLED')){const notice=el('p',p.status==='CANCELLING'?'Its payments are returning to Banking Pay.':p.expired_at_utc?'Its payments are back in Banking Pay. Create a new Draft to pay them.':'Could not check whether its payments are back in Banking Pay.',p.status==='CANCELLING'?'ws-notice ws-notice--info':'ws-notice ws-notice--danger');body.push(notice);}
        if(['DRAFT','EXECUTING','COMPLETE'].includes(p.status))body.push(el('p','This Draft is confirmed.','ws-notice bpay-next-result-success'));
        if(omissionCounts){const text=preparationOmissionCopy(omissionCounts);if(text){const excluded=el('div',undefined,'bpay-next-omitted-information');excluded.append(el('span',text),button('Not in this Draft',()=>openNotInDraft({...options,transport},runId),busy));body.push(excluded);}}else if(omissionError){const line=el('p',omissionError,'ws-notice ws-notice--info');line.setAttribute('role','status');body.push(line);}
        const figures=el('div',undefined,'bpay-next-progress-figures');if(readError)figures.classList.add('is-stale');
        const effective=n('selected_candidates')-n('removed'),done=n('ready')+n('review');
        const subject=el('div',undefined,'bpay-next-progress-subject');subject.append(el('h3',count(terminal?p.selected_candidates:effective)+' Candidates'));figures.append(subject);
        if(p.discard_phase===null&&!['DRAFT','EXECUTING','COMPLETE'].includes(p.status))subject.append(el('p',p.expired_at_utc?'Expired at '+format(p.expired_at_utc):(terminal?'Expiry time ':'Expires ')+format(p.expires_at_utc)+(terminal?'':' if not confirmed')));
        if(!terminal){const progress=el('progress');progress.max=10000;progress.value=effective===0n?10000:Number(done*10000n/effective);progress.setAttribute('aria-label','Draft');const heading=el('div',undefined,'bpay-next-progress-heading');heading.append(el('strong','Draft'),el('span',count(done)+' of '+count(effective)+' Candidates'));figures.append(heading,progress);
          const totals=el('dl',undefined,'bpay-next-progress-totals');for(const [label,key] of [['Done','ready'],['To review','review'],['Still to do','pending']]){const group=el('div');group.append(el('dt',label),el('dd',count(p[key])));totals.append(group);}figures.append(totals);
          if(!p.enrolment_complete)figures.append(el('p',p.enrolment_failed?'Could not start every Candidate; continue processing or contact support.':'Starting Candidates…'));
          else if(p.status==='PREPARING'&&n('pending')===0n)figures.append(el('p','Finishing the Draft…'));
        }
        if(updated)figures.append(el('p','Updated '+format(updated),'bpay-next-progress-updated'));body.push(figures);
        if(!terminal){
          const rows=new Map(attentionRows.map(row=>[row.job_id,row]));
          for(const entry of attentionEntries.values())if(entry.controller.pending()||entry.result&&entry.result!=='Processing requested.')rows.set(entry.row.job_id,entry.row);
          if(p.needs_attention||rows.size||attentionError){
            const section=el('section',undefined,'bpay-next-progress-attention');section.append(el('h3','Needs attention'));
            const table=el('table',undefined,'bpay-next-progress-attention-table'),thead=el('thead'),head=el('tr');
            for(const title of ['Candidate','Pay channel','What happened','Action'])head.append(el('th',title));thead.append(head);table.append(thead);
            const tbody=el('tbody');for(const row of rows.values()){
              const entry=attentionEntry(row),tr=el('tr');const values=[row.candidate_display_name,row.pay_channel==='UMBRELLA'?'Umbrella':'PAYE',
                ['WORKBENCH_WORK','WORKBENCH_CASE'].includes(row.phase)?'Could not finish updating this Candidate.':'Could not prepare this Candidate.'];
              values.forEach((value,i)=>{const td=el('td');td.dataset.label=['Candidate','Pay channel','What happened'][i];if(i===2)td.append(el('span','Failed','candidate-office-badge candidate-office-badge--danger'),el('p',value,'bpay-next-progress-row-reason'));else td.textContent=value;tr.append(td);});
              const actions=el('td');actions.dataset.label='Action';const retry=button('Try again',()=>retryAttention(entry),busy||state.busy||state.pending!==null||readError!==''||attentionError!==''||entry.controller.busy()||!row.retry_eligible&&!entry.controller.pending()||entry.result==='Processing requested.');
              retry.dataset.nextFocusKey='retry:'+row.job_id;actions.append(retry);
              if(entry.controller.busy()){const sending=el('p','Sending request…','bpay-next-progress-row-result');sending.setAttribute('role','status');actions.append(sending);}
              else if(entry.result){const message=el('p',entry.result,'bpay-next-progress-row-result');message.setAttribute('role',entry.result==='Processing requested.'?'status':'alert');actions.append(message);}
              else if(!row.retry_eligible)actions.append(el('p','This Draft can no longer be prepared.','bpay-next-progress-row-result'));
              tr.append(actions);tbody.append(tr);
            }table.append(tbody);section.append(table);
            if(attentionError){const message=el('p',attentionError,'ws-notice ws-notice--danger');message.setAttribute('role','alert');section.append(message,button('Try again',()=>readAttention(true),busy||attentionBusy));}
            if(attentionBusy){const checking=el('p',attentionRows.length?'Loading more…':'Checking Candidates…');checking.setAttribute('role','status');section.append(checking);}
            if(!attentionComplete&&!attentionError){const sentinel=el('div',undefined,'bpay-next-progress-attention-sentinel');sentinel.dataset.attentionScroll='';section.append(sentinel);}
            body.push(section);
          }
        }
        if(!terminal&&(p.waiting_on_other_run||waitingError)){
          const section=el('section',undefined,'bpay-next-progress-waiting'),waiting=waitingPages.snapshot();section.setAttribute('aria-label','Waiting Candidates');section.append(el('h3','Waiting'));if(waitingError){const line=el('p',waitingError,'ws-notice ws-notice--danger');line.setAttribute('role','alert');section.append(line);}
          if(waiting)section.append(el('p',count(waiting.counts.scope_count)+' '+(waiting.counts.scope_count==='1'?'Candidate':'Candidates')+' · '+(waitingPages.sort().startsWith('CANDIDATE')?'Candidate':'State')+' '+(waitingPages.sort().endsWith('_ASC')?'ascending':'descending'),'bpay-next-waiting-order'));
          const phoneSort=el('label',undefined,'bpay-next-waiting-phone-sort');phoneSort.append(el('span','Sort by'));const select=el('select');select.dataset.nextFocusKey='waiting-sort-phone';select.disabled=waitingBusy;for(const [value,label] of [['CANDIDATE_ASC','Candidate A–Z'],['CANDIDATE_DESC','Candidate Z–A'],['STATE_ASC','State A–Z'],['STATE_DESC','State Z–A']]){const option=el('option',label);option.value=value;option.selected=waitingPages.sort()===value;select.append(option);}select.addEventListener('change',()=>{waitingPages.setSort(select.value);void readWaiting(true);});phoneSort.append(select);section.append(phoneSort);
          const scroll=el('div',undefined,'bpay-next-waiting-scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Candidates waiting for another Draft');
          if(waiting?.history.length){const top=el('div');top.dataset.waitingBack='';scroll.append(top);}
          const table=el('table',undefined,'bpay-next-progress-waiting-table'),head=el('tr');for(const [label,key] of [['Candidate','CANDIDATE'],['State','STATE']]){
            const th=el('th'),sort=waitingPages.sort(),b=button(label,async()=>{waitingPages.setSort(key+(sort===key+'_ASC'?'_DESC':'_ASC'));await readWaiting(true);},waitingBusy);
            b.dataset.nextFocusKey='waiting-sort:'+key;th.scope='col';if(sort.startsWith(key+'_'))th.setAttribute('aria-sort',sort.endsWith('_ASC')?'ascending':'descending');th.append(b);head.append(th);
          }const thead=el('thead');thead.append(head);table.append(thead);const rows=el('tbody');for(const row of waiting?.rows??[]){const tr=el('tr'),name=el('td',row.candidate_display_name??'—'),reason=el('td');tr.dataset.waitingRow=row.row_key;tr.dataset.nextFocusKey='waiting-row:'+row.row_key;tr.tabIndex=0;tr.setAttribute('aria-selected',String(waitingSelected===row.row_key));tr.addEventListener('click',()=>{waitingSelected=row.row_key;for(const n of rows.children)n.setAttribute('aria-selected',String(n===tr));tr.focus();});tr.addEventListener('keydown',e=>{if(e.target!==tr||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const all=Array.from(rows.children),i=all.indexOf(tr),target=e.key==='Home'?all[0]:e.key==='End'?all.at(-1):all[Math.max(0,Math.min(all.length-1,i+(e.key==='ArrowDown'?1:-1)))];if(target){waitingSelected=target.dataset.waitingRow;for(const n of all)n.setAttribute('aria-selected',String(n===target));target.focus();target.scrollIntoView({block:'nearest'});}});name.dataset.label='Candidate';reason.dataset.label='State';const state=el('div');state.append(el('span','Waiting','candidate-office-badge candidate-office-badge--neutral'),el('p',preparationIssueReason(row),'bpay-next-progress-row-reason'));reason.append(state);tr.append(name,reason);rows.append(tr);}table.append(rows);scroll.append(table);
          if(waiting&&!waiting.complete&&!waitingError){const tail=el('div');tail.dataset.waitingNext='';scroll.append(tail);}section.append(scroll);

          if(waitingBusy){const line=el('p',waitingContinuation?'Loading more…':'Checking waiting Candidates…');line.setAttribute('role','status');section.append(line);}body.push(section);
        }
        if(p.discard_phase===null&&['PREPARING','REVIEW'].includes(p.status)){const safe=el('div',undefined,'ws-notice ws-notice--info');safe.append(el('strong','You can close this window.'),el('p',p.status==='PREPARING'?'The Draft keeps building. Reopen it from Banking Pay.':'Reopen this Draft from Banking Pay.'));body.push(safe);}
      }else if(!readError){const loading=el('p','Loading Draft…');loading.setAttribute('role','status');body.push(loading);}
      content.replaceChildren(...body);footer.replaceChildren();
      const sentinel=content.querySelector('[data-attention-scroll]');if(sentinel&&typeof win.IntersectionObserver==='function'){
        attentionObserver=new win.IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&frame.active()&&doc.visibilityState!=='hidden')void readAttention();},{root:null,rootMargin:'120px'});attentionObserver.observe(sentinel);
      }
      const waitingScroll=content.querySelector('.bpay-next-waiting-scroll');if(waitingScroll&&waitingAnchor){const row=Array.from(waitingScroll.querySelectorAll('[data-waiting-row]')).find(n=>n.dataset.waitingRow===waitingAnchor.key);if(row)waitingScroll.scrollTop+=row.getBoundingClientRect().top-waitingScroll.getBoundingClientRect().top-waitingAnchor.offset;}if(waitingScroll&&typeof win.IntersectionObserver==='function'){
        waitingObserver=new win.IntersectionObserver(entries=>{if(waitingBusy||!frame.active()||doc.visibilityState==='hidden')return;const next=entries.find(e=>e.isIntersecting&&e.target.dataset.waitingNext!==undefined),back=entries.find(e=>e.isIntersecting&&e.target.dataset.waitingBack!==undefined);if(next)void readWaiting();else if(back)void readWaiting(false,'back');},{root:waitingScroll,rootMargin:'120px'});for(const n of waitingScroll.querySelectorAll('[data-waiting-next],[data-waiting-back]'))waitingObserver.observe(n);
      }
      const terminal=facts&&(facts.discard_phase!==null||['DRAFT','EXECUTING','COMPLETE','CANCELLING','CANCELLED'].includes(facts.status));
      if(!terminal&&(readError||submissionError||state.pending||!submissionComplete||facts?.status!=='REVIEW'||facts?.enrolment_complete!==true)){const hint=el('p',submissionError?'Check the ticked payments before continuing.':readError?'Refresh before continuing.':state.pending?'Try this request again before continuing.':!submissionComplete?'Checking the ticked payments…':'Continue to review opens when building finishes.','bpay-next-progress-footer-hint');footer.append(hint);}
      if(!terminal){if(facts?.status==='PREPARING'&&!readError&&!state.pending){const more=el('details',undefined,'bpay-next-progress-more'),summary=el('summary','More');summary.dataset.nextFocusKey='More';more.open=moreOpen;more.addEventListener('toggle',()=>{if(more.isConnected)moreOpen=more.open;});more.append(summary,button('Continue processing',wake,locked||readError!==''||facts?.status!=='PREPARING'));footer.append(more);}
        if(facts&&BigInt(facts.review)>0n){const more=footer.querySelector('details')||el('details',undefined,'bpay-next-progress-more');if(!more.isConnected){const summary=el('summary','More');summary.dataset.nextFocusKey='More';more.append(summary);footer.append(more);}const menu=el('div',undefined,'bpay-next-progress-more-options');for(const option of [...more.children].filter(n=>n.matches('button')))menu.append(option);menu.append(button('Review payment issue',issue,locked||readError!==''||!submissionComplete));more.append(menu);}
      }
      if(facts?.discard_phase===null&&!terminal&&submissionComplete){const discard=button('Discard this Draft',discardDraft,locked||readError!=='');discard.dataset.nextDestructive='';footer.prepend(discard);}
      if(facts?.discard_phase==='PARTIAL')footer.append(button('Review payment issue',issue,locked||readError!==''));
      footer.append(button('Refresh',()=>read(true),busy||readBusy));
      if(terminal&&(facts.status==='CANCELLED'||facts.discard_phase==='PARTIAL'))footer.append(button('Back to Banking Pay',backToBankingPay,busy,true));
      else if(!terminal)footer.append(button('Continue to review',review,locked||readError!==''||submissionError!==''||!submissionComplete||facts?.status!=='REVIEW'||facts?.enrolment_complete!==true,true));
      if(frame.active())focus.after(token);
      if(!closed&&!readBusy&&current()&&frame.active()&&doc.visibilityState!=='hidden'&&facts&&!['DRAFT','EXECUTING','COMPLETE','CANCELLED'].includes(facts.status))timer=win.setTimeout(()=>void read(),2000);
    }
    const visible=()=>{win.clearTimeout(timer);if(current()&&doc.visibilityState!=='hidden'&&frame?.active())void read();},changed=()=>render();
    frame=options.showReadWindow({title:'Preparing payment Draft',content,footer,headerDetail,canFocus:current,onMount:()=>void read(),onDismiss:()=>{closed=true;ticket++;attentionTicket++;waitingTicket++;waitingObserver?.disconnect();attentionObserver?.disconnect();win.clearTimeout(timer);doc.removeEventListener('visibilitychange',visible);win.removeEventListener('focus',visible);win.removeEventListener('cloudtms:bpay-next-owner-changed',changed);preparationProgressWindows.delete(identity);}});
    const api=Object.freeze({...frame,run_id:runId,submissionRecovered(){submissionComplete=true;submissionError='';render();},submissionFailure(){submissionComplete=false;submissionError='Could not check the ticked payments; your Draft request is kept.';render();}});
    preparationProgressWindows.set(identity,api);doc.addEventListener('visibilitychange',visible);win.addEventListener('focus',visible);win.addEventListener('cloudtms:bpay-next-owner-changed',changed);render();void read();return api;
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
    let selection = new Map(), caseSelection = new Map(), renderEpoch = 0, readBusy = false, capabilities = null, capabilityError = '', error = '', progressTimer, workersCursor=null, statusCursor=null, statusScope=null, reviewObserved=false, preparationPending=false,progressReattached=false;
    const host = doc.createElement('section'); host.className = 'bpay-next-office-content'; host.tabIndex = -1;
    const previousFocus = doc.activeElement;
    const el = (tag, text, className) => { const n = doc.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
    const button = (text, action, disabled = false, direct = false, focusKey = text) => { const b = el('button',text); b.setAttribute('data-next-focus-key','action:'+focusKey); b.type='button'; b.disabled=disabled; b.addEventListener('click', () => { if(direct)action();else void act(action); }); return b; };
    const input = (label, type, value) => { const wrap = el('label', label); const n = el('input'); n.type=type; n.setAttribute('data-next-focus-key','input:'+label); n.value=value || ''; wrap.append(n); return [wrap,n]; };
    let netInput, resumeInput,workbenchShell=null,issueLists=null,readyLists=null,issueWindow=null,candidateWindow=null,issueReadAvailable=false,readWindow=null,closed=false,started=false;
    const choiceStores=new Map();let submissionBusy=false;
    async function protectedMutation(action,args){
      const before=controller.snapshot();
      const identity=JSON.stringify([before.run_id,before.worker_id,before.candidate_id,before.pay_channel,workbenchShell?.snapshot().context??null]);
      const current=()=>{const now=controller.snapshot();return !closed&&readWindow?.alive()===true&&now.pending===null&&!now.busy
        && JSON.stringify([now.run_id,now.worker_id,now.candidate_id,now.pay_channel,workbenchShell?.snapshot().context??null])===identity;};
      const token=await openBpayNextReauth({...options,document:doc,window:win,transport,reauthCurrent:current},{action,...args});
      if(token===null)return null;
      requireActor(options);
      if(!current())fail('ACTOR_CHANGED');
      return controller.mutate(action,{...args,reauth_token:token});
    }
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
    const issueHost=el('div'),discardResult=el('p','','ws-notice bpay-next-result-success'),officeFooter=el('div',undefined,'bpay-next-window-actions');officeFooter.hidden=true;
    discardResult.hidden=true;discardResult.setAttribute('role','status');
    async function onPreparationDiscarded(p){if(closed||!same(options.currentActorId(),options.actorId)||options.ownerReady()!==true)return;discardResult.textContent='Draft discarded. Your ticks are kept.';discardResult.hidden=false;issueHost.prepend(discardResult);await workbenchShell?.load();readyLists?.reload();issueLists?.reload();}
    const dismiss = () => { if(closed)return;closed=true;renderEpoch += 1;win.clearTimeout(progressTimer);win.removeEventListener('beforeunload',beforeUnload);win.removeEventListener('cloudtms:bpay-next-owner-changed',render);doc.removeEventListener('visibilitychange',render);readyLists?.close();issueLists?.close();workbenchShell?.close();host.remove();sheet=null;if(previousFocus?.isConnected&&same(options.currentActorId(),options.actorId))previousFocus.focus(); };
    const close = () => readWindow?.close()??Promise.resolve(false);
    const focus=ui.continuity(host,doc,()=>host.querySelector('button'));
    async function act(action) { if (readBusy) return; error=''; readBusy=true; render(); try { await action(); } catch(e) { if(e?.serverCode==='BPAY_NEXT_ENVIRONMENT_MISMATCH'){capabilities=null;capabilityError='Banking environment is unavailable or mismatched. Re-check before continuing.';} error=controller?.snapshot().pending ? 'The result is not known. Payment controls are paused. Retry this exact request; do not start a replacement.' : refusalCopy(e) || 'This action could not be completed. Refresh or sign in again.'; } finally { readBusy=false; render(); } }
    function canCreateDraft(){
      const ready=readyLists?.snapshot(),header=workbenchShell?.snapshot();
      return !closed&&!submissionBusy&&capabilities?.environment_ready===true&&readWindow?.alive()===true
        &&same(options.currentActorId(),options.actorId)&&options.ownerReady()===true&&ready?.available===true
        &&header?.available===true&&header.canCreateDraft===true
        &&win.CloudTMSBpayNextWorkbench.sameWorkbenchRevision(ready.context,header.context);
    }
    async function createDraft(){
      if(!canCreateDraft())return;
      const store=readyLists.choiceStore(),context=readyLists.snapshot().context;
      const current=()=>!closed&&same(options.currentActorId(),options.actorId)&&options.ownerReady()===true
        &&readyLists.snapshot().available&&workbenchShell.snapshot().available&&workbenchShell.snapshot().canCreateDraft
        &&win.CloudTMSBpayNextWorkbench.sameWorkbenchRevision(readyLists.snapshot().context,workbenchShell.snapshot().context);
      let submission,submissionWindow=null,progressWindow=null,retry=null,running=false,finished=false;
      const body=el('section',undefined,'bpay-next-choice-submit'),message=el('p','Sending the ticked payments…'),result=el('p'),footer=el('div',undefined,'bpay-next-window-actions');
      const sendingStatus=el('div',undefined,'bpay-next-sending-status'),spinner=el('span',undefined,'bpay-next-sending-spinner');spinner.setAttribute('aria-hidden','true');spinner.setAttribute('data-next-live-copy','');sendingStatus.append(spinner,message);message.setAttribute('role','status');for(const node of [message,result])node.setAttribute('data-next-live-copy','');result.setAttribute('role','alert');result.hidden=true;const keepOpen=el('p','Keep this window open until the Draft starts.','ws-notice ws-notice--info');keepOpen.setAttribute('data-next-live-copy','');body.append(sendingStatus,keepOpen,result);
      footer.hidden=true;
      const submissionOptions={...options,window:win,storage:options.storage,transport,uuid:options.uuid||(()=>win.crypto.randomUUID()),descriptor:store.freeze(context),onChange:()=>{workbenchShell?.refreshSelectionLabel();}};
      try{
        submissionBusy=true;workbenchShell.refreshSelectionLabel();
        submission=createChoiceSubmission({...submissionOptions,resumeOnly:true});
        if(!submission){
          const descriptor=await openCreateDraftConfirmation({...options,document:doc,choiceStore:store,context,current,currentContext:()=>readyLists.snapshot().context,
            countSelection:()=>readyLists.countSelection(),selectionLabel:()=>readyLists.selectionLabel(),onRefresh:async()=>{await workbenchShell.load();await readyLists.refresh();}});
          if(!descriptor)return;
          if(!current())fail('ACCEPTED_IDENTITY_CONFLICT');
          submission=createChoiceSubmission({...submissionOptions,descriptor});
        }
        submissionWindow=options.showReadWindow({title:'Creating Draft',content:body,footer,small:true,canFocus:()=>same(options.currentActorId(),options.actorId)&&options.ownerReady()===true,onDismiss:()=>{if(!running){submissionBusy=false;workbenchShell?.refreshSelectionLabel();}}});
        async function continueOriginal(){
          if(running||finished)return;running=true;submissionBusy=true;workbenchShell?.refreshSelectionLabel();retry&&(retry.disabled=true);result.hidden=true;spinner.hidden=false;
          try{
            let state=submission.snapshot();
            if(state.pending){await submission.retry();state=submission.snapshot();}
            if(state.phase==='CREATE'){
              const captured=state.descriptor;
              const cutCurrent=()=>current()&&JSON.stringify(store.freeze(readyLists.snapshot().context))===JSON.stringify(captured);
              if(!cutCurrent()){const changed=new Failure('SERVER_REFUSED');changed.serverCode='BPAY_NEXT_CHOICE_CONTEXT_CHANGED';throw changed;}
              const guard=(await transport.page('GUARD',{run_id:state.run_id,descriptor:captured})).rows[0];
              if(!cutCurrent()){const changed=new Failure('SERVER_REFUSED');changed.serverCode='BPAY_NEXT_CHOICE_CONTEXT_CHANGED';throw changed;}
              if(guard.guard_applies){
                const decision=await openPayeSameWeekGuard({...options,document:doc,window:win,transport,current:cutCurrent},guard,state);
                if(decision===null){submission.retireUnaccepted();finished=true;await submissionWindow.close();return;}
                if(!cutCurrent()){const changed=new Failure('SERVER_REFUSED');changed.serverCode='BPAY_NEXT_CHOICE_CONTEXT_CHANGED';throw changed;}
                await submission.decide(decision.decision,decision.reason,decision.token);
              }else await submission.create();
              state=submission.snapshot();
            }
            if(['SUBSETS','EXCLUSIONS','MATCHING','EXPLICIT'].includes(state.phase)){await submission.advanceSelection();state=submission.snapshot();}
            if(state.phase==='CASES'){await submission.advanceCases();state=submission.snapshot();}
            if(['GUARD','SEAL'].includes(state.phase)){await submission.sealEnqueue();state=submission.snapshot();}
            // Finish exact sealed readback before acknowledging this local revision.
            if(state.phase==='READBACK'){
              // The exact accepted SEAL_ENQUEUE receipt owns the progress address.
              await submissionWindow.close();
              if(!progressWindow&&!closed&&same(options.currentActorId(),options.actorId)&&options.ownerReady()===true)
                progressWindow=openBpayNextPreparationProgress({...options,onPreparationDiscarded,document:doc,retrySubmission:continueOriginal,progressNamespace:state.descriptor.namespace,progressCurrentNamespace:()=>readyLists?.snapshot().context},state.run_id);
              await submission.readback();state=submission.snapshot();
            }
            if(!['COMPLETE','EMPTY'].includes(state.phase))fail('RESPONSE_INVALID');
            if(submission.acknowledgeComplete(store)!==true)fail('JOURNAL_INVALID');finished=true;progressWindow?.submissionRecovered();
            await submissionWindow.close();
            if(!closed&&same(options.currentActorId(),options.actorId)&&options.ownerReady()===true){
              if(state.phase==='EMPTY'){message.textContent='There is nothing to pay in this selection.';error=message.textContent;render();}
              else if(!progressWindow)progressWindow=openBpayNextPreparationProgress({...options,onPreparationDiscarded,document:doc,submissionComplete:true,progressNamespace:state.descriptor.namespace,progressCurrentNamespace:()=>readyLists?.snapshot().context},state.run_id);
              readyLists?.refreshSelection();workbenchShell?.refreshSelectionLabel();
            }
          }catch(e){
            const state=submission.snapshot();
            if(e?.serverCode==='BPAY_NEXT_CHOICE_CONTEXT_CHANGED'&&state.phase==='CREATE'&&state.pending===null){
              spinner.hidden=true;keepOpen.hidden=true;message.textContent='The list has changed. Refresh and try again.';result.hidden=true;
              footer.replaceChildren(button('Refresh',async()=>{submission.retireUnaccepted();finished=true;await submissionWindow.close();await workbenchShell.load();await readyLists.refresh();},false,true));footer.hidden=false;return;
            }
            if(progressWindow){progressWindow.submissionFailure();return;}const beforeAcceptance=state.phase==='CREATE'&&state.create_receipt===null&&state.pending===null&&e instanceof Failure&&['SERVER_REFUSED','AUTH_REQUIRED'].includes(e.code)&&!e.unknown;
            message.textContent=beforeAcceptance?'The Draft was not started; your ticks are kept.':state.pending?'The result is not known; your request is kept.':'The request is kept and can be continued.';
            keepOpen.hidden=true;spinner.hidden=true;result.className='ws-notice ws-notice--danger';result.textContent='Could not finish sending the ticked payments.';result.hidden=false;
            if(!retry){retry=button('Try again',()=>void continueOriginal(),false,true);retry.className='btn primary';footer.hidden=false;footer.append(retry);}retry.disabled=false;
          }finally{running=false;if(finished||!submissionWindow.alive()){submissionBusy=false;workbenchShell?.refreshSelectionLabel();}}
        }
        await continueOriginal();
      }catch{error='Could not start the Draft; your ticks are kept.';render();}
      finally{if(!submissionWindow||finished){submissionBusy=false;workbenchShell?.refreshSelectionLabel();}}
    }
    async function loadCapabilities(){capabilities=null;capabilityError='';try{capabilities=await transport.capabilities();
      if(capabilities.environment_ready&&!issueLists){
        if(!win.CloudTMSBpayNextWorkbench||typeof win.CloudTMSBpayNextWorkbench.openIssueWindow!=='function')throw new Failure('SCHEMA_UNAVAILABLE');
        workbenchShell=win.CloudTMSBpayNextWorkbench.mountWorkbenchShell({...options,host:issueHost,footerHost:officeFooter,debug:controller.debug,
          windowAlive:()=>readWindow?.alive()===true,canCreateDraft,onCreateDraft:createDraft,onWorkJobAccepted:async receipt=>{if(candidateWindow?.alive()&&candidateWindow.snapshot().candidate_id===receipt.candidate_id)await candidateWindow.refresh();},onRefresh:()=>{issueLists?.refresh();readyLists?.refresh();},selectionLabel:()=>readyLists?.selectionLabel()??'All except 0',
          onAvailability:value=>{readyLists?.joinHeader(value);if(value.available&&!progressReattached){progressReattached=true;const pointer=lastPreparation(options,value.context);if(pointer)win.queueMicrotask(()=>{if(!closed&&same(options.currentActorId(),options.actorId)&&options.ownerReady()===true&&preparationScope(workbenchShell.snapshot().context)===preparationScope(pointer.namespace))openBpayNextPreparationProgress({...options,onPreparationDiscarded,document:doc,progressNamespace:pointer.namespace,progressCurrentNamespace:()=>workbenchShell?.snapshot().context,submissionComplete:pointer.readback_complete,restoredReadbackPending:!pointer.readback_complete},pointer.run_id);});}const issues=issueLists?.snapshot();issueReadAvailable=value.available&&Boolean(issues?.available&&win.CloudTMSBpayNextWorkbench.sameWorkbenchRevision(value.context,issues.context));},
          onExport:()=>{const state=readyLists?.snapshot(),header=workbenchShell.snapshot();if(!state?.available||!header.available||!win.CloudTMSBpayNextWorkbench.sameWorkbenchRevision(state.context,header.context))throw new Failure('SCHEMA_UNAVAILABLE');win.CloudTMSBpayNextWorkbench.openWorkbenchExport({...options,document:doc},{context:state.context,choiceStore:readyLists.choiceStore(),sort:'C_'+state.sort,parentCurrent:()=>readWindow?.alive()===true&&readyLists.snapshot().available&&workbenchShell.snapshot().available});},
          onScope:scope=>{issueLists?.setScope(scope);readyLists?.setScope(scope);},onTab:tab=>{if(tab!=='READY')issueLists?.setKind(tab==='ACTION'?'ACTION_REQUIRED':'BLOCKED');}});
        readyLists=win.CloudTMSBpayNextWorkbench.mountReadyCandidates({...options,host:workbenchShell.readyHost,client:workbenchShell.client,debug:controller.debug,windowAlive:()=>readWindow?.alive()===true,
          canInteract:()=>readWindow?.active()===true,onChoiceStore:store=>choiceStores.set(store.key,store),onSelection:()=>workbenchShell?.refreshSelectionLabel(),openBankRecord:id=>openCandidateRecord(options,id,close),
          openCandidate:address=>{if(candidateWindow?.alive())return;candidateWindow=win.CloudTMSBpayNextWorkbench.openCandidateWindow({...options,host:workbenchShell.readyHost,client:workbenchShell.client,preparationTransport:transport,choiceStore:readyLists.choiceStore(),onSelection:()=>{readyLists?.refreshSelection();workbenchShell?.refreshSelectionLabel();},onChanged:()=>{issueLists?.invalidate();workbenchShell?.invalidate();}},address);}});
        readyLists.joinHeader(workbenchShell.snapshot());
        issueLists=win.CloudTMSBpayNextWorkbench.mountIssueLists({...options,host:workbenchShell.issueHost,windowAlive:()=>readWindow?.alive()===true,client:workbenchShell.client,externalTabs:true,debug:controller.debug,parentContext:()=>workbenchShell.snapshot().context,parentAvailable:()=>workbenchShell.snapshot().available,parentReadError:()=>workbenchShell.snapshot().readError,canInteract:()=>readWindow?.active()===true,
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
      officeFooter.hidden=s.selection_sealed||!workbenchShell;
      if(!s.selection_sealed){
        body.append(issueHost);if(error){const notice=el('p',error,'ws-notice ws-notice--danger');notice.setAttribute('role','alert');body.append(notice);}
        if(!capabilities?.environment_ready){const notice=el('p','Payments are unavailable; try again.','bpay-next-alert');notice.setAttribute('role','alert');body.append(notice,button('Try again',loadCapabilities,readBusy||s.busy));}
        if(typeof options.ownerReady==='function'&&options.ownerReady()!==true)body.append(el('p','Banking Pay is paused.','bpay-next-alert'));
        host.replaceChildren(body);focus.after(focusToken);return;
      }
      if(capabilities?.test_mode)body.append(el('p','TEST MODE — no bank, provider or email action.','bpay-next-alert'));
      if(capabilityError||!capabilities?.environment_ready){const banner=el('p',capabilityError||'Payments are blocked because the Banking environment is unavailable or does not match this screen.','bpay-next-alert');banner.setAttribute('role','alert');body.append(banner);}
      else body.append(el('p','Banking environment: '+capabilities.worker_environment+'.'));
      body.append(button('Re-check Banking capabilities',loadCapabilities,readBusy||s.busy));
      body.append(el('p','Name check (Confirmation of Payee) is unavailable. Provider execution is disabled; funding availability is not verified.'));
      if(typeof options.ownerReady==='function'&&options.ownerReady()!==true)body.append(el('p','Banking ownership is unavailable or paused. Money controls are disabled.','bpay-next-alert'));
      if(error) {const a=el('p',error,'bpay-next-alert');a.setAttribute('role','alert');body.append(a);}
      if(s.pending){body.append(el('p','Uncertain request retained. Conflicting changes are disabled.'),button('Retry exact request',async()=>{const action=s.pending.action;const result=await controller.retry();if(action==='CSV_ISSUE')download(result);if(action==='REVIEW')await applyReview(result);else await refresh();},!capabilities?.environment_ready||readBusy||s.busy||(typeof options.ownerReady==='function'&&options.ownerReady()!==true)));}
      body.append(el('p',readBusy||s.busy?'Waiting for server…':'Server-owned amounts; no payment totals calculated here.'));
      if(s.run_id&&s.selection_sealed&&!s.confirmed)body.append(button('Open progress',()=>openBpayNextPreparationProgress({...options,onPreparationDiscarded,document:doc,progressNamespace:workbenchShell?.snapshot().context,progressCurrentNamespace:()=>workbenchShell?.snapshot().context,submissionComplete:true},s.run_id),locked));
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
          body.append(button('Cancel this unpaid Candidate Draft',async()=>{const args={command_id:controller.newId(),run_worker_id:s.worker_id};if(s.pay_channel!==null){args.run_id=s.run_id;args.pay_channel=s.pay_channel;}const result=await protectedMutation('CANCEL_REQUEST',args);if(result!==null)await loadStatus();},locked));
        }
        if(h.worker_status==='CANCELLING')body.append(el('p','Whole-Candidate cancellation is in progress; released page counts are not a completed cancellation.'));
        body.append(el('h3','Current payment status'),el('p','Bank details are changed in the Candidate record, not in this payment view. Reopening this run retains its accepted state.'));
        if(typeof options.openCandidateRecord==='function')body.append(button('Open Candidate record for bank details',()=>openCandidateRecord(options,h.candidate_id,close),locked));
        body.append(button('Returned money in this batch',()=>loadReturnedCash(),locked));
        body.append(table(['Transfer','State','Execution','Frozen cash','Remaining reservation','Actions'],status.rows.map(t=>{const actions=el('span');if(h.target_pay_channel==='PAYE'&&t.execution_kind==='BANK'&&t.original_transfer_id===null&&['MEMBERS_READY','DRAFT','SCHEDULED','ISSUED_CSV'].includes(t.status))actions.append(button(t.status==='ISSUED_CSV'?'Retrieve exact CSV':'Issue original CSV',async()=>{const retained=s.transfer_id===t.transfer_id&&s.instruction_id?s.instruction_id:null;if(t.status==='ISSUED_CSV'&&!retained){error='The original file is not available in this window.';return;}const args={instruction_id:retained??controller.newId(),transfer_id:t.transfer_id};const result=t.status==='ISSUED_CSV'?await controller.mutate('CSV_ISSUE',args):await protectedMutation('CSV_ISSUE',args);if(result!==null){download(result);await loadStatus();}},locked,false,'csv:'+t.transfer_id));if(t.execution_kind==='INTERNAL_ZERO')actions.append(el('span','No external cash file'));return[t.transfer_id,t.status,t.execution_kind,'£'+t.cash_amount,reservationDescription(t),actions];})));
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
    controller=createController({actorId:options.actorId,reviewRunId:options.reviewRunId,storage:options.storage||win.sessionStorage,uuid:options.uuid||(()=>win.crypto.randomUUID()),transport,onChange:render});
    if(options.reviewRunId&&controller.snapshot().run_id===null)controller.bind({run_id:options.reviewRunId});
    win.addEventListener('cloudtms:bpay-next-owner-changed',render);
    win.addEventListener('beforeunload',beforeUnload);
    doc.addEventListener('visibilitychange',render);
    sheet=Object.freeze({focus:()=>readWindow?.focus(),close,controller,
      async selectDraft(address,rows){
        requireActor(options);const saved=controller.snapshot();
        if(closed||readBusy||saved.busy||saved.pending!==null||saved.worker_action!==null||saved.case_edit!==null
          ||!shape(address,{run_id:'uuid',pay_channel:'channel',run_worker_id:'uuid',candidate_id:'uuid'})
          ||saved.run_id!==null&&!same(saved.run_id,address.run_id))fail('REQUEST_INVALID');
        // Clear every old subject cache before any controller change can render.
        renderEpoch++;current=cases=components=workers=status=returnedCash=lines=comparisons=frozenLine=shifts=breaks=usedRates=frozenWork=rateSchedule=null;
        statusCursor=workersCursor=statusScope=netInput=resumeInput=null;selection=new Map();caseSelection=new Map();
        controller.bind({run_id:address.run_id});controller.setDrafts(rows);controller.bindDraft({run_id:address.run_id,pay_channel:address.pay_channel});
        controller.bind({worker_id:address.run_worker_id,candidate_id:address.candidate_id});await loadStatus();render();
      }});
    readWindow=options.showReadWindow({title:'Banking Pay',content:host,footer:officeFooter,beforeClose,canFocus:()=>same(options.currentActorId(),options.actorId)&&options.ownerReady()===true,onDismiss:dismiss,onMount:()=>{
      render();readyLists?.refreshSelection();if(!started){started=true;void act(async()=>{await loadCapabilities();if(capabilities?.environment_ready&&controller.snapshot().run_id){if(options.reviewRunId&&!controller.snapshot().selection_sealed)await applyReview(await controller.mutate('REVIEW',{run_id:options.reviewRunId}));await refresh();}});}
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
  async function readCaseEditContext(transport,candidateId,caseId){
    const page=await transport.page('CASE_COMPONENTS',{candidate_id:candidateId,case_id:caseId,after_component_ordinal:null,limit:100});
    if(page.complete!==true||page.next_cursor!==null||page.rows.length<1||page.rows.length>2)fail('RESPONSE_INVALID');
    const state=page.rows[0].edit_state;
    if(!cases.caseEditState(state)||page.rows.some(row=>!same(row.case_id,caseId)||!same(row.candidate_id,candidateId)
      ||!cases.equal(row.edit_state,state)||row.source_pay_channel!==page.rows[0].source_pay_channel))fail('RESPONSE_INVALID');
    return {page,state};
  }
  function paintCaseEditCards(doc,host,page,candidateLabel,onOpenDraft){
    const state=page.rows[0].edit_state,el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const money=value=>'£'+value.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(value.split('.')[1]??'').padEnd(2,'0');
    const facts=el('dl',undefined,'bpay-next-case-edit-facts'),add=(label,value)=>{const item=el('dd',value);if(label==='Status')item.className='bpay-next-case-edit-status';facts.append(el('dt',label),item);};
    add('Candidate',candidateLabel||'Candidate');add('Pay channel',page.rows[0].source_pay_channel==='UMBRELLA'?'Umbrella':'PAYE');
    add('Status',state.status==='OPEN'?(state.editable?(['ADVANCE','LOAN'].includes(page.rows[0].case_kind)?'Not paid out yet':page.rows[0].case_kind==='CREDIT'?'Due once':'Repayments not started'):state.issue_code==='BPAY_NEXT_CASE_HELD_BY_DRAFT'?'In a Draft':'Payment activity'):state.status==='PAUSED'?'Paused':state.status==='WRITTEN_OFF'?'Written off':'Completed');
    for(const row of page.rows){
      const name=row.instruction_kind==='PAYOUT'?'Payout':row.instruction_kind==='CREDIT'?'Credit':'Repayments';
      const text=row.instruction_kind==='RECOVERY'?(!/[1-9]/.test(row.recovered_source_ex_vat)?'Not started':'Started')
        :(!/[1-9]/.test(row.funded_source_ex_vat)?(state.issue_code==='BPAY_NEXT_CASE_HAS_ACTIVITY'?'Payment committed':'With the next Draft'):'Paid out');
      add(name,text);
    }
    if(!state.editable&&page.rows[0].case_kind==='CREDIT'&&state.input){
      add('Amount',money(state.input.principal));add('Tax',state.input.tax_treatment==='TAXABLE'?'Taxable':'Not taxable');add('Comment',state.input.reason);add('Note',state.input.note??'—');
    }
    host.replaceChildren(facts);
    if(state.protection){const p=state.protection,pill=el('p','Batch blocked: '+(p.channel==='UMBRELLA'?'Umbrella':p.channel==='PAYE'?'PAYE':'')+' Draft','bpay-next-case-edit-blocked');
      if(p.protected_amount!==null)pill.append(el('span',' · '+money(p.protected_amount)));
      if(typeof onOpenDraft==='function'){const link=el('button','Open Draft','btn');link.type='button';link.dataset.nextSecondary='';link.onclick=()=>void onOpenDraft(p);pill.append(link);}host.prepend(pill);}
    if(!state.editable)host.append(el('p',state.issue_code==='BPAY_NEXT_CASE_HELD_BY_DRAFT'?'This Case is in a Draft and cannot be changed.':'This Case has payment activity and cannot be changed.','bpay-next-case-result'));
  }
  async function openCaseProtectedDraft(options,protection,candidateId){
    requireActor(options);if(options.current?.()!==true||options.ownerReady()!==true||!field(candidateId,'uuid')||!field(protection?.run_id,'uuid'))fail('REQUEST_INVALID');
    if(protection.run_status!=='DRAFT')return openWorkerReview(options,protection.run_id);
    if(!field(protection.channel,'channel')||!field(protection.run_worker_id,'uuid'))fail('REQUEST_INVALID');
    const transport=options.transport??createTransport(options),drafts=await transport.page('CHANNEL_DRAFTS',{run_id:protection.run_id});
    const status=await transport.page('CHANNEL_STATUS',{run_id:protection.run_id,pay_channel:protection.channel,run_worker_id:protection.run_worker_id,after_transfer_no:null,limit:100});
    requireActor(options);if(options.current?.()!==true||options.ownerReady()!==true||!same(status.header.candidate_id,candidateId))fail('REQUEST_INVALID');
    if(sheet){const target=sheet;await target.selectDraft({run_id:protection.run_id,pay_channel:protection.channel,run_worker_id:protection.run_worker_id,candidate_id:candidateId},drafts.rows);
      requireActor(options);if(options.current?.()!==true||options.ownerReady()!==true||sheet!==target)fail('REQUEST_INVALID');target.focus();return target;}
    const controller=createController({...options,reviewRunId:protection.run_id,storage:options.storage??(options.window??window).sessionStorage,uuid:options.uuid??(()=>(options.window??window).crypto.randomUUID()),transport});
    const saved=controller.snapshot();if(saved.pending!==null||saved.worker_action!==null||saved.case_edit!==null||saved.case_pause!==null||saved.run_id!==null&&!same(saved.run_id,protection.run_id))fail('OUTCOME_UNKNOWN');
    controller.bind({run_id:protection.run_id});controller.setDrafts(drafts.rows);controller.bindDraft({run_id:protection.run_id,pay_channel:protection.channel});
    controller.bind({worker_id:protection.run_worker_id,candidate_id:candidateId});
    return open({...options,reviewRunId:protection.run_id});
  }
  function mountCasePreviewFooter(options){
    const candidateId=options.candidateId,edit=options.editContext??null;
    if(!field(candidateId,'uuid')||(edit!==null&&!shape(edit,{case_id:'uuid',expected_case_revision:'positive'})))fail('REQUEST_INVALID');
    const controller=options.controller??createController({...options,reviewJournalQualifier:edit?'.case-edit.'+candidateId.toLowerCase()+'.'+edit.case_id.toLowerCase():'.case-create.'+candidateId.toLowerCase()});
    const transport=options.transport,state=controller.snapshot(),action=edit?'CASE_EDIT':'CASE_CREATE';
    if(state.run_id!==null||state.worker_id!==null||state.case_id!==null&&!same(state.candidate_id,candidateId)
      ||(!edit&&state.case_edit!==null)||(edit&&state.case_edit!==null&&!same(state.case_edit.case_id,edit.case_id)))fail('REQUEST_INVALID');
    if(state.pending){const body=JSON.parse(state.pending.bytes);if(state.pending.action!==action||body.action!==action||!same(body.candidate_id,candidateId)
      ||(edit&&(!same(body.case_id,edit.case_id)||body.expected_case_revision!==edit.expected_case_revision)))fail('REQUEST_INVALID');}
    return cases.mount({...options,editContext:edit,
      validPreview:(value,input)=>cases.casePreview(value,input,edit),
      current:()=>{try{requireActor(options);return options.current?.()===true;}catch{return false;}},
      snapshot:controller.snapshot,retry:controller.retry,
      acceptedCase:()=>{const saved=controller.snapshot();return edit?saved.case_edit:saved.case_id?{case_id:saved.case_id}:null;},
      onApplied:typeof options.onApplied==='function'?async(receipt,page)=>{await options.onApplied(receipt,page);if(edit)controller.finishCaseEdit(receipt.command_id);else controller.finishCaseCreation(receipt.case_id);}:undefined,
      onBlocked:edit?async(receipt,page)=>{controller.finishCaseEdit(receipt.command_id);await options.onEditBlocked?.(receipt,page);}:undefined,
      preview:async input=>{if(!same(input.candidate_id,candidateId))fail('REQUEST_INVALID');return (await transport.page('CASE_PREVIEW',{input,...(edit??{})})).rows[0];},
      submit:(input,preview_token)=>{if(!same(input.candidate_id,candidateId))fail('REQUEST_INVALID');return controller.mutate(action,{command_id:options.uuid(),...(edit??{}),...input,preview_token});},
      readCase:(case_id,receipt)=>transport.page('CASE_COMPONENTS',{candidate_id:candidateId,case_id,after_component_ordinal:null,limit:100,...(edit?{edit_command_id:receipt.command_id}:{})})
    });
  }
  return Object.freeze({ openCaseProtectedDraft, readCaseEditContext, paintCaseEditCards, mountCasePreviewFooter, open, close, openBpayNextReauth, openBpayNextPaymentIssueReauth, openPayeSameWeekGuard, createTransport, createController, createChoiceSubmission, openCreateDraftConfirmation, openBpayNextPreparationProgress, openWorkerReview, openNotInDraft, openFrozenWorkerDetail, printAdvice, openCandidateRecord, requestBody, capabilityReceipt, dailyHoursOnlyRefusal, dailyProcessingState, mountDailyProcessingNotice, Failure, LIMITS });
});
