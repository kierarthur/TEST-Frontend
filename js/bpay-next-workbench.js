/* WB09 bounded read client; typed failure is surfaced, never an empty GBP0 list. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextWorkbench=api;})(typeof globalThis==='object'?globalThis:this,function(){'use strict';
/** WB09 pure Office reads. Closed kinds, trusted admin actor, fixed RPC only.
 * No reconstruction, financial calculation, command or automatic page retry. */
const BPAY_NEXT_WORKBENCH_LIMITS=Object.freeze({requestBytes:32768,responseBytes:131072,timeoutMs:4000});
const ENCODER=new TextEncoder(),UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const KINDS=['HEADER','CANDIDATES','ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL','CANDIDATE_GROUPS','GROUP_LINES','PICK_CANDIDATES','PICK_CLIENTS','EXPORT_ROWS'];
const COMMON={candidate_id:'uuid?',client_id:'uuid?',channel:'scopeChannel',section:'scopeSection',search:'search',sort:'sort',group_key:'groupKey?',item_id:'uuid?',reason_code:'code?',count_selection:'countSelection?',after:'cursor?',limit:'limit'};
const BPAY_NEXT_WORKBENCH_PAGE_INPUTS=Object.freeze(Object.fromEntries(KINDS.map(k=>[k,Object.freeze({...COMMON})])));
// Generated once from the explicit SQL projections; reviewed source is durable.
const ROWS=Object.freeze({
  "HEADER": {
    "candidate_count": "integer",
    "selectable_member_count": "integer?",
    "selected_candidate_count": "integer?",
    "selected_member_count": "integer?",
    "item_count": "integer",
    "contribution_count": "integer",
    "segment_count": "integer",
    "payable_count": "integer",
    "selected_count": "integer",
    "snoozed_count": "integer",
    "held_count": "integer",
    "queried_count": "integer",
    "blocked_count": "integer",
    "deduction_item_count": "integer",
    "unknown_amount_count": "integer",
    "unknown_selected_amount_count": "integer",
    "amount": "decimal?",
    "waiting_amount": "decimal?",
    "ready_net_add_amount": "decimal?",
    "waiting_net_add_amount": "decimal?",
    "gross_deduction_balance": "decimal?",
    "net_deduction_balance": "decimal?",
    "approved_amount": "decimal?",
    "paid_credit_amount": "decimal?",
    "reserved_amount": "decimal?",
    "excluded_amount": "decimal?",
    "recovery_amount": "decimal?",
    "selected_amount": "decimal?",
    "has_deduction": "boolean"
  },
  "CANDIDATES": {
    "candidate_id": "uuid",
    "candidate_sort_name": "text?",
    "tms_ref": "text?",
    "bank_warning_code": "bank?",
    "metadata_version": "positive",
    "projection_revision": "positive",
    "item_count": "integer",
    "contribution_count": "integer",
    "segment_count": "integer",
    "payable_count": "integer",
    "selected_count": "integer",
    "snoozed_count": "integer",
    "held_count": "integer",
    "queried_count": "integer",
    "blocked_count": "integer",
    "deduction_item_count": "integer",
    "unknown_amount_count": "integer",
    "unknown_selected_amount_count": "integer",
    "amount": "decimal?",
    "waiting_amount": "decimal?",
    "ready_net_add_amount": "decimal?",
    "waiting_net_add_amount": "decimal?",
    "gross_deduction_balance": "decimal?",
    "net_deduction_balance": "decimal?",
    "approved_amount": "decimal?",
    "paid_credit_amount": "decimal?",
    "reserved_amount": "decimal?",
    "excluded_amount": "decimal?",
    "recovery_amount": "decimal?",
    "selected_amount": "decimal?",
    "has_deduction": "boolean"
  },
  "PICK_CANDIDATES": {
    "candidate_id": "uuid",
    "candidate_sort_name": "text?",
    "tms_ref": "text?"
  },
  "PICK_CLIENTS": {
    "client_id": "uuid",
    "client_display_name": "text"
  },
  "ACTION_REQUIRED": {
    "item_id": "uuid",
    "group_key": "text",
    "candidate_id": "uuid",
    "work_id": "uuid?",
    "case_id": "uuid?",
    "case_component_id": "uuid?",
    "client_id": "uuid?",
    "physical_timesheet_id": "uuid?",
    "revision_id": "uuid?",
    "component_key": "text",
    "member_kind": "member",
    "member_key": "text",
    "portion_kind": "portion",
    "candidate_display_name": "text?",
    "candidate_reference": "text?",
    "timesheet_reference": "text?",
    "week_ending_date": "date?",
    "reason_code": "code",
    "reason_priority": "small",
    "nominal_source_ex_vat": "decimal?",
    "amount_known": "boolean",
    "source_pay_channel": "channel?",
    "target_pay_channel": "channel?",
    "section": "section",
    "query_state": "query",
    "query_qualified": "boolean",
    "pay_hold": "boolean?",
    "pay_hold_reason": "text?",
    "eligible_from_date": "date?",
    "snooze_id": "uuid?",
    "snooze_version": "positive?",
    "snooze_until_date": "date?",
    "stale_snooze_code": "text?",
    "progress_state": "progress",
    "error_code": "text?",
    "financial_view_revision": "integer",
    "projection_revision": "positive",
    "metadata_version": "positive",
    "direction": "direction",
    "payroll_stage": "stage?",
    "approved_source_ex_vat": "decimal?",
    "active_reserved_source_ex_vat": "decimal?",
    "deduction_balance_source_ex_vat": "decimal?",
    "recovery_source_ex_vat": "decimal?",
    "included_source_ex_vat": "decimal?",
    "gross_due_source_ex_vat": "decimal?"
  },
  "BLOCKED": {
    "item_id": "uuid",
    "group_key": "text",
    "candidate_id": "uuid",
    "work_id": "uuid?",
    "case_id": "uuid?",
    "case_component_id": "uuid?",
    "client_id": "uuid?",
    "physical_timesheet_id": "uuid?",
    "revision_id": "uuid?",
    "component_key": "text",
    "member_kind": "member",
    "member_key": "text",
    "portion_kind": "portion",
    "candidate_display_name": "text?",
    "candidate_reference": "text?",
    "timesheet_reference": "text?",
    "week_ending_date": "date?",
    "reason_code": "code",
    "reason_priority": "small",
    "nominal_source_ex_vat": "decimal?",
    "amount_known": "boolean",
    "source_pay_channel": "channel?",
    "target_pay_channel": "channel?",
    "section": "section",
    "query_state": "query",
    "query_qualified": "boolean",
    "pay_hold": "boolean?",
    "pay_hold_reason": "text?",
    "eligible_from_date": "date?",
    "snooze_id": "uuid?",
    "snooze_version": "positive?",
    "snooze_until_date": "date?",
    "stale_snooze_code": "text?",
    "progress_state": "progress",
    "error_code": "text?",
    "financial_view_revision": "integer",
    "projection_revision": "positive",
    "metadata_version": "positive",
    "direction": "direction",
    "payroll_stage": "stage?",
    "approved_source_ex_vat": "decimal?",
    "active_reserved_source_ex_vat": "decimal?",
    "deduction_balance_source_ex_vat": "decimal?",
    "recovery_source_ex_vat": "decimal?",
    "included_source_ex_vat": "decimal?",
    "gross_due_source_ex_vat": "decimal?"
  },
  "ISSUE_DETAIL": {
    "item_id": "uuid",
    "group_key": "text",
    "candidate_id": "uuid",
    "work_id": "uuid?",
    "case_id": "uuid?",
    "case_component_id": "uuid?",
    "client_id": "uuid?",
    "physical_timesheet_id": "uuid?",
    "revision_id": "uuid?",
    "component_key": "text",
    "member_kind": "member",
    "member_key": "text",
    "portion_kind": "portion",
    "candidate_display_name": "text?",
    "candidate_reference": "text?",
    "timesheet_reference": "text?",
    "week_ending_date": "date?",
    "reason_code": "code",
    "reason_priority": "small",
    "nominal_source_ex_vat": "decimal?",
    "amount_known": "boolean",
    "source_pay_channel": "channel?",
    "target_pay_channel": "channel?",
    "section": "section",
    "query_state": "query",
    "query_qualified": "boolean",
    "pay_hold": "boolean?",
    "pay_hold_reason": "text?",
    "eligible_from_date": "date?",
    "snooze_id": "uuid?",
    "snooze_version": "positive?",
    "snooze_until_date": "date?",
    "stale_snooze_code": "text?",
    "progress_state": "progress",
    "error_code": "text?",
    "financial_view_revision": "integer",
    "projection_revision": "positive",
    "metadata_version": "positive",
    "direction": "direction",
    "payroll_stage": "stage?",
    "approved_source_ex_vat": "decimal?",
    "active_reserved_source_ex_vat": "decimal?",
    "deduction_balance_source_ex_vat": "decimal?",
    "recovery_source_ex_vat": "decimal?",
    "included_source_ex_vat": "decimal?",
    "gross_due_source_ex_vat": "decimal?"
  },
  "GROUP_LINES": {
    "item_id": "uuid",
    "group_key": "text",
    "component_key": "text",
    "member_key": "text",
    "candidate_id": "uuid",
    "work_id": "uuid?",
    "revision_id": "uuid?",
    "approved_line_id": "uuid?",
    "approved_segment_id": "uuid?",
    "case_id": "uuid?",
    "case_component_id": "uuid?",
    "rule_id": "uuid?",
    "client_id": "uuid?",
    "contract_id": "uuid?",
    "physical_timesheet_id": "uuid?",
    "snooze_id": "uuid?",
    "accepted_run_id": "uuid?",
    "accepted_command_id": "uuid?",
    "segment_key": "text?",
    "candidate_display_name": "text?",
    "candidate_reference": "text?",
    "client_display_name": "text?",
    "timesheet_reference": "text?",
    "component_kind": "text?",
    "tax_treatment": "text?",
    "unit_label": "text?",
    "pay_hold_reason": "text?",
    "channel_note_code": "text?",
    "snooze_scope": "text?",
    "stale_snooze_code": "text?",
    "error_code": "text?",
    "member_kind": "member",
    "portion_kind": "portion",
    "source_pay_channel": "channel?",
    "target_pay_channel": "channel?",
    "direction": "direction",
    "payroll_stage": "stage?",
    "work_date": "date?",
    "week_ending_date": "date?",
    "eligible_from_date": "date?",
    "snooze_until_date": "date?",
    "approved_quantity": "decimal?",
    "amount_known": "boolean",
    "selected_amount_known": "boolean",
    "selectable": "boolean",
    "is_selected": "boolean",
    "query_qualified": "boolean",
    "pay_hold": "boolean?",
    "section": "section",
    "reason_code": "code",
    "reason_priority": "small",
    "query_state": "query",
    "progress_state": "progress",
    "financial_view_revision": "integer",
    "projection_revision": "positive",
    "metadata_version": "positive",
    "snooze_version": "positive?",
    "accepted_module_epoch": "positive?",
    "nominal_source_ex_vat": "decimal?",
    "approved_source_ex_vat": "decimal?",
    "realised_source_ex_vat": "decimal?",
    "active_reserved_source_ex_vat": "decimal?",
    "residual_source_ex_vat": "decimal?",
    "gross_due_source_ex_vat": "decimal?",
    "included_source_ex_vat": "decimal?",
    "excluded_source_ex_vat": "decimal?",
    "recovery_source_ex_vat": "decimal?",
    "held_overhang_source_ex_vat": "decimal?",
    "deduction_balance_source_ex_vat": "decimal?",
    "selected_source_ex_vat": "decimal?",
    "written_off_source_ex_vat": "decimal?"
  },
  "EXPORT_ROWS": {
    "item_id": "uuid",
    "group_key": "text",
    "candidate_id": "uuid",
    "work_id": "uuid?",
    "case_id": "uuid?",
    "case_component_id": "uuid?",
    "revision_id": "uuid?",
    "client_id": "uuid?",
    "component_key": "text",
    "member_kind": "member",
    "member_key": "text",
    "portion_kind": "portion",
    "candidate_display_name": "text?",
    "candidate_reference": "text?",
    "client_display_name": "text?",
    "timesheet_reference": "text?",
    "work_date": "date?",
    "week_ending_date": "date?",
    "component_kind": "text?",
    "tax_treatment": "text?",
    "source_pay_channel": "channel?",
    "target_pay_channel": "channel?",
    "direction": "direction",
    "payroll_stage": "stage?",
    "approved_quantity": "decimal?",
    "unit_label": "text?",
    "nominal_source_ex_vat": "decimal?",
    "approved_source_ex_vat": "decimal?",
    "realised_source_ex_vat": "decimal?",
    "active_reserved_source_ex_vat": "decimal?",
    "residual_source_ex_vat": "decimal?",
    "included_source_ex_vat": "decimal?",
    "excluded_source_ex_vat": "decimal?",
    "deduction_balance_source_ex_vat": "decimal?",
    "amount_known": "boolean",
    "section": "section",
    "reason_code": "code",
    "selectable": "boolean",
    "financial_view_revision": "integer",
    "projection_revision": "positive",
    "metadata_version": "positive"
  },
  "CANDIDATE_GROUPS": {
    "group_key": "text",
    "group_kind": "group",
    "candidate_id": "uuid",
    "work_id": "uuid?",
    "case_id": "uuid?",
    "client_id": "uuid?",
    "contract_id": "uuid?",
    "physical_timesheet_id": "uuid?",
    "current_revision_id": "uuid?",
    "source_pay_channel": "channel?",
    "target_pay_channel": "channel?",
    "week_ending_date": "date?",
    "complete": "boolean",
    "dirty": "boolean",
    "certified_zero": "boolean",
    "ready_count": "integer",
    "action_count": "integer",
    "blocked_count": "integer",
    "waiting_count": "integer",
    "stale_snooze_count": "integer",
    "financial_view_revision": "integer",
    "projection_revision": "positive",
    "metadata_version": "positive",
    "stale_snooze_code": "text?",
    "error_code": "text?",
    "progress_state": "progress",
    "client_display_name": "text?",
    "bank_warning_code": "bank?",
    "section": "scopeSection",
    "reason_code": "code?",
    "has_deduction": "boolean",
    "selectable": "boolean",
    "group_amount": "decimal?",
    "ready_net_add_amount": "decimal?",
    "gross_deduction_balance": "decimal?",
    "net_deduction_balance": "decimal?"
  }
});
const SCOPE=Object.freeze(Object.fromEntries(Object.entries(COMMON).filter(([k])=>!['after','limit'].includes(k))));
const CONTEXT={kind:'kind',agency_id:'uuid',actor_user_id:'uuid',owner_epoch:'positive',official_pay_date:'date',workbench_revision:'integer',adoption_revision:'integer',scope:'scope'};
const REFUSAL={ok:'false',error_code:'refusal',retryable:'boolean',reload_required:'boolean',workbench_revision:'integer?',complete:'false',projection_state:'adoption?',dirty_candidate_count:'integer?',dirty_group_count:'integer?',pending_task_count:'integer?'};
const FAILURE_CODES=['BPAY_NEXT_MODULE_NOT_ACTIVE','BPAY_NEXT_WORKBENCH_FORBIDDEN','BPAY_NEXT_WORKBENCH_UNAUTHORIZED','BPAY_NEXT_WORKBENCH_METHOD_NOT_ALLOWED','BPAY_NEXT_WORKBENCH_REQUEST_INVALID','BPAY_NEXT_WORKBENCH_RESPONSE_INVALID','BPAY_NEXT_WORKBENCH_RESPONSE_TOO_LARGE','BPAY_NEXT_WORKBENCH_CURSOR_STALE','BPAY_NEXT_WORKBENCH_PROJECTION_NOT_CURRENT','BPAY_NEXT_WORKBENCH_DATE_UNAVAILABLE','BPAY_NEXT_WORKBENCH_UNAVAILABLE'];
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
function exact(v,keys){return record(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable===true&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));}
const same=(a,b)=>a===b||(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,n)=>same(v,b[n])))||(record(a)&&record(b)&&exact(a,Object.keys(b))&&Object.keys(a).every(k=>same(a[k],b[k])));
const enums={kind:KINDS,scopeChannel:['ALL','PAYE','UMBRELLA'],channel:['PAYE','UMBRELLA'],scopeSection:['ALL','READY','ACTION','BLOCKED','WAITING'],section:['READY','ACTION','BLOCKED','WAITING'],sort:['NAME_ASC','NAME_DESC','AMOUNT_ASC','AMOUNT_DESC','DEDUCTIONS_ASC','DEDUCTIONS_DESC','PAYMENT_ASC','PAYMENT_DESC','STATUS_ASC','STATUS_DESC','REASON_ASC','REASON_DESC'],bank:['BANK_DETAILS_MISSING','BANK_DETAILS_CHANGED'],group:['WORK','CASE'],member:['WORK_COMPONENT','WORK_SEGMENT','CASE_COMPONENT','GROUP_EVIDENCE'],portion:['AVAILABLE','RESERVED','RECOVERY','ZERO','EVIDENCE','WITHDRAWN'],direction:['PAYMENT','DEDUCTION','INFORMATIONAL'],stage:['GROSS_ADD','GROSS_DEDUCT','NET_ADD','NET_DEDUCT'],query:['NOT_APPLICABLE','UNAVAILABLE','CLEAR','OPEN'],progress:['CURRENT','PROCESSING','UNAVAILABLE'],adoption:['UNSEEDED','SEEDING','CURRENT','ERROR']};
function field(v,type){
  if(type.endsWith('?'))return v===null||field(v,type.slice(0,-1));
  if(Object.hasOwn(enums,type))return enums[type].includes(v);
  if(type==='uuid')return typeof v==='string'&&UUID.test(v);
  if(type==='boolean'||type==='false')return typeof v==='boolean'&&(type!=='false'||v===false);
  if(type==='integer'||type==='positive')return typeof v==='string'&&/^(0|[1-9]\d{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n&&(type!=='positive'||v!=='0');
  if(type==='small')return Number.isInteger(v)&&v>=1&&v<=200;
  if(type==='limit')return Number.isInteger(v)&&v>=1&&v<=100;
  if(type==='decimal')return typeof v==='string'&&ENCODER.encode(v).byteLength<=BPAY_NEXT_WORKBENCH_LIMITS.responseBytes&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v);
  if(type==='text'||type==='search')return typeof v==='string'&&!v.includes('\0')&&ENCODER.encode(v).byteLength<=(type==='search'?800:8192)&&(type!=='search'||([...v].length<=200&&v.trim()===v));
  if(type==='code')return typeof v==='string'&&/^[A-Z][A-Z0-9_]{0,255}$/.test(v);
  if(type==='groupKey')return typeof v==='string'&&/^(?:WORK|CASE):[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
  if(type==='date'){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v.startsWith('0000'))return false;const d=new Date(`${v}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
  if(type==='countSelection')return exact(v,['mode','candidate_ids'])&&['ALL','NONE'].includes(v.mode)&&Array.isArray(v.candidate_ids)&&v.candidate_ids.every(id=>field(id,'uuid'))&&new Set(v.candidate_ids).size===v.candidate_ids.length&&ENCODER.encode(JSON.stringify(v)).byteLength<=32768;
  if(type==='scope')return shape(v,SCOPE);
  if(type==='cursor')return exact(v,['context','key'])&&shape(v.context,CONTEXT)&&validKey(v.key,v.context.kind,v.context.scope.sort);
  if(type==='refusal')return FAILURE_CODES.includes(v);
  return false;
}
const shape=(v,schema)=>exact(v,Object.keys(schema))&&Object.entries(schema).every(([k,type])=>field(v[k],type));
function validKey(key,kind,sort){
  if(!Array.isArray(key))return false;
  if(['CANDIDATES','PICK_CANDIDATES'].includes(kind))return sort.startsWith('STATUS_')?key.length===5&&field(key[0],'boolean')&&field(key[1],'boolean')&&field(key[2],'text')&&field(key[3],'text')&&field(key[4],'uuid'):sort.startsWith('DEDUCTIONS_')?key.length===5&&field(key[0],'boolean')&&field(key[1],'text')&&field(key[2],'boolean')&&field(key[3],'text')&&field(key[4],'uuid'):sort.startsWith('AMOUNT_')?key.length===3&&field(key[0],'boolean')&&field(key[1],'decimal')&&field(key[2],'uuid'):key.length===4&&field(key[0],'text')&&field(key[1],'boolean')&&field(key[2],'text')&&field(key[3],'uuid');
  if(kind==='CANDIDATE_GROUPS')return key.length===4&&field(key[0],'boolean')&&(key[0]?key[1]==='':field(key[1],'date'))&&field(key[2],'group')&&field(key[3],'uuid');
  if(['ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL'].includes(kind))return sort.startsWith('REASON_')?key.length===3&&field(key[0],'small')&&field(key[1],'text')&&field(key[2],'uuid'):sort.startsWith('PAYMENT_')?key.length===2&&field(key[0],'text')&&field(key[1],'uuid'):sort.startsWith('AMOUNT_')?key.length===3&&field(key[0],'boolean')&&field(key[1],'decimal')&&field(key[2],'uuid'):key.length===3&&field(key[0],'text')&&field(key[1],'uuid')&&field(key[2],'uuid');
  return kind!=='HEADER'&&key.length===1&&field(key[0],kind==='CANDIDATE_GROUPS'?'groupKey':'uuid');
}
function rowKey(kind,scope,row){
  if(['CANDIDATES','PICK_CANDIDATES'].includes(kind)){if(scope.sort.startsWith('STATUS_'))return [row.payable_count==='0',row.bank_warning_code===null,row.bank_warning_code??'',row.candidate_sort_name,row.candidate_id];if(scope.sort.startsWith('DEDUCTIONS_'))return [row.has_deduction,row.candidate_sort_name,row.tms_ref===null,row.tms_ref??'',row.candidate_id];if(scope.sort.startsWith('AMOUNT_'))return [row.unknown_amount_count!=='0',row.amount??'0',row.candidate_id];return [row.candidate_sort_name,row.tms_ref===null,row.tms_ref??'',row.candidate_id];}
  if(kind==='HEADER')return null;
  if(kind==='CANDIDATE_GROUPS')return [row.week_ending_date===null,row.week_ending_date??'',row.group_kind,row.work_id??row.case_id];
  if(['ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL'].includes(kind)){if(scope.sort.startsWith('REASON_'))return [row.reason_priority,row.reason_code,row.item_id];if(scope.sort.startsWith('PAYMENT_'))return [row.timesheet_reference??'',row.item_id];if(scope.sort.startsWith('AMOUNT_'))return [row.nominal_source_ex_vat===null,row.nominal_source_ex_vat??'0',row.item_id];return [row.candidate_display_name??'',row.candidate_id,row.item_id];}
  return [kind==='PICK_CLIENTS'?row.client_id:row.item_id];
}
function textCompare(a,b){const x=ENCODER.encode(a),y=ENCODER.encode(b);for(let n=0;n<Math.min(x.length,y.length);n++)if(x[n]!==y[n])return x[n]<y[n]?-1:1;return Math.sign(x.length-y.length);}
// Ordering validation only. Exact decimal strings never become browser money.
function decimalCompare(a,b){const negA=a.startsWith('-'),negB=b.startsWith('-');const parts=v=>{const [whole,fraction='']=v.replace(/^-/,'').split('.');return [whole,fraction.replace(/0+$/,'')];};const [aw,af]=parts(a),[bw,bf]=parts(b);const az=aw==='0'&&af==='',bz=bw==='0'&&bf==='';if(az&&bz)return 0;const an=negA&&!az,bn=negB&&!bz;if(an!==bn)return an?-1:1;const sign=an?-1:1;return sign*(aw.length!==bw.length?Math.sign(aw.length-bw.length):aw!==bw?textCompare(aw,bw):textCompare(af.padEnd(Math.max(af.length,bf.length),'0'),bf.padEnd(Math.max(af.length,bf.length),'0')));}
function keyCompare(a,b,kind,sort){for(let n=0;n<a.length;n++){const value=typeof a[n]==='number'?a[n]-b[n]:typeof a[n]==='boolean'?Number(a[n])-Number(b[n]):n===1&&sort.startsWith('AMOUNT_')?decimalCompare(a[n],b[n]):textCompare(a[n],b[n]);if(value)return sort.endsWith('_DESC')?-value:value;}return 0;}
function fail(code,status=503,retryable=false,reload=false){return Object.assign(new Error(code),{code,status,retryable,reload});}
function normalizeWorkbenchInput(kind,input={}){
  if(!KINDS.includes(kind)||!record(input)||Reflect.ownKeys(input).some(k=>typeof k!=='string'||!Object.hasOwn(COMMON,k)))throw fail('BPAY_NEXT_WORKBENCH_REQUEST_INVALID',400);
  const args={candidate_id:null,client_id:null,channel:'ALL',section:'ALL',search:'',sort:'NAME_ASC',group_key:null,item_id:null,reason_code:null,count_selection:null,after:null,limit:kind==='CANDIDATE_GROUPS'?10:50,...input};
  for(const k of ['candidate_id','client_id','item_id'])if(typeof args[k]==='string')args[k]=args[k].toLowerCase();
  if(args.count_selection!==null&&(kind!=='HEADER'||args.section!=='READY')||kind!=='CANDIDATES'&&String(args.sort).startsWith('STATUS_'))throw fail('BPAY_NEXT_WORKBENCH_REQUEST_INVALID',400);
  if(!shape(args,COMMON)||(kind==='CANDIDATE_GROUPS'&&args.limit>10)||(!['CANDIDATES','ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL'].includes(kind)&&args.sort!=='NAME_ASC')||(!['ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL'].includes(kind)&&args.sort.startsWith('REASON_'))||(kind==='CANDIDATES'&&args.sort.startsWith('PAYMENT_'))||(['ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL'].includes(kind)&&args.sort.startsWith('DEDUCTIONS_'))
    ||(['CANDIDATE_GROUPS','GROUP_LINES'].includes(kind)&&args.candidate_id===null)||(['GROUP_LINES','ISSUE_DETAIL'].includes(kind)&&args.group_key===null)||(kind==='ISSUE_DETAIL'&&args.reason_code===null)
    ||(!['GROUP_LINES','ISSUE_DETAIL'].includes(kind)&&[args.group_key,args.item_id,args.reason_code].some(v=>v!==null))
    ||(!['CANDIDATES','PICK_CANDIDATES','PICK_CLIENTS','ACTION_REQUIRED','BLOCKED','EXPORT_ROWS'].includes(kind)&&args.search!=='')||(kind==='HEADER'&&args.after!==null))throw fail('BPAY_NEXT_WORKBENCH_REQUEST_INVALID',400);
  if(kind==='CANDIDATES')args.section='READY';else if(kind==='ACTION_REQUIRED')args.section='ACTION';else if(kind==='BLOCKED')args.section='BLOCKED';
  if(kind==='PICK_CANDIDATES'&&args.sort!=='NAME_ASC')throw fail('BPAY_NEXT_WORKBENCH_REQUEST_INVALID',400);
  const scope=Object.fromEntries(Object.keys(SCOPE).map(k=>[k,args[k]]));
  if(args.after!==null&&(args.after.context.kind!==kind||!same(args.after.context.scope,scope)))throw fail('BPAY_NEXT_WORKBENCH_CURSOR_STALE',409,false,true);
  return args;
}
function parseUniqueJson(text){const stack=[];for(let n=0;n<text.length;n++){const c=text[n];if(c==='{'||c==='['){stack.push(c==='{'?new Set():null);if(stack.length>8)throw new Error();}else if(c==='}'||c===']')stack.pop();else if(c==='"'){const start=n;n++;for(;n<text.length;n++){if(text[n]==='\\')n++;else if(text[n]==='"')break;}const token=JSON.parse(text.slice(start,n+1));let after=n+1;while(after<text.length&&/\s/.test(text[after]))after++;if(text[after]===':'){const keys=stack.at(-1);if(!(keys instanceof Set)||keys.has(token))throw new Error();keys.add(token);}}}return JSON.parse(text);}
async function readWorkbenchJson(response,signal,onBytes){
  const reader=response.body?.getReader();if(!reader)throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
  const chunks=[];let length=0;try{while(true){if(signal?.aborted)throw fail('BPAY_NEXT_WORKBENCH_UNAVAILABLE',503,true);const {done,value}=await reader.read();if(signal?.aborted)throw fail('BPAY_NEXT_WORKBENCH_UNAVAILABLE',503,true);if(done)break;length+=value.byteLength;try{onBytes?.(length);}catch{}if(length>BPAY_NEXT_WORKBENCH_LIMITS.responseBytes)throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_TOO_LARGE');chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return parseUniqueJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch(e){void reader.cancel().catch(()=>{});throw e?.code?e:fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');}finally{try{onBytes?.(length);}catch{}signal?.removeEventListener('abort',cancel);reader.releaseLock();}
}
function validateWorkbenchResponse(payload,kind,args,actorId=null){
  if(payload?.ok===false){if(!shape(payload,REFUSAL)||payload.reload_required!==(payload.error_code==='BPAY_NEXT_WORKBENCH_CURSOR_STALE'))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');return payload;}
  if(!exact(payload,['ok','kind','workbench_revision','complete','context','rows','next_cursor','page_receipt','affected_candidate_count'])||payload.ok!==true||payload.kind!==kind||!field(payload.workbench_revision,'integer')||typeof payload.complete!=='boolean'||!shape(payload.context,CONTEXT)||payload.context.kind!==kind||payload.context.workbench_revision!==payload.workbench_revision||!Array.isArray(payload.rows)||payload.rows.length>args.limit||(kind==='HEADER'&&payload.rows.length!==1)||(!payload.complete&&payload.rows.length===0)||(kind==='ISSUE_DETAIL'?!field(payload.affected_candidate_count,'integer'):payload.affected_candidate_count!==null))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
  const scope=Object.fromEntries(Object.keys(SCOPE).map(k=>[k,args[k]])),context=payload.context;
  if(!same(context.scope,scope)||(actorId!==null&&context.actor_user_id!==actorId)||args.after!==null&&!same(args.after.context,context))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
  let prior=args.after?.key??null,last=null;const seen=new Set();
  for(const row of payload.rows){if(!shape(row,ROWS[kind]))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');const key=rowKey(kind,scope,row);
    if(key!==null){if(!validKey(key,kind,scope.sort)||(prior!==null&&keyCompare(prior,key,kind,scope.sort)>=0)||seen.has(JSON.stringify(key)))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');seen.add(JSON.stringify(key));prior=key;last=key;}
    if(args.candidate_id!==null&&Object.hasOwn(row,'candidate_id')&&row.candidate_id!==args.candidate_id||args.client_id!==null&&Object.hasOwn(row,'client_id')&&row.client_id!==args.client_id||args.group_key!==null&&row.group_key!==args.group_key||args.item_id!==null&&row.item_id!==args.item_id||args.reason_code!==null&&row.reason_code!==args.reason_code)throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
    if(Object.hasOwn(row,'section')&&scope.section!=='ALL'&&row.section!==scope.section||Object.hasOwn(row,'target_pay_channel')&&scope.channel!=='ALL'&&row.target_pay_channel!==scope.channel)throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
    if(Object.hasOwn(row,'amount_known')&&row.amount_known===false&&row.nominal_source_ex_vat!==null)throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
    if(Object.hasOwn(row,'amount_known')&&row.selectable===true&&(row.section!=='READY'||row.amount_known!==true||!['AVAILABLE','ZERO'].includes(row.portion_kind)))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
    if(Object.hasOwn(row,'group_key')){if(!field(row.group_key,'groupKey')||(row.work_id!==null)===(row.case_id!==null)||row.group_key!==(row.work_id!==null?'WORK:'+row.work_id:'CASE:'+row.case_id))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');}
    if(kind==='CANDIDATE_GROUPS'&&row.selectable&&(!row.complete||row.dirty||row.progress_state!=='CURRENT'))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
    if(kind==='HEADER'){
      const counted=args.count_selection!==null;
      if((row.selected_candidate_count!==null)!==counted||(row.selected_member_count!==null)!==counted||(row.selectable_member_count!==null)!==(args.section==='READY')||counted&&(BigInt(row.selected_candidate_count)>BigInt(row.candidate_count)||BigInt(row.selected_member_count)>BigInt(row.selectable_member_count)))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
    }
    if(['HEADER','CANDIDATES'].includes(kind)){const unknown=row.unknown_amount_count!=='0';for(const k of ['amount','waiting_amount','ready_net_add_amount','waiting_net_add_amount','gross_deduction_balance','net_deduction_balance','approved_amount','paid_credit_amount','reserved_amount','excluded_amount','recovery_amount'])if((row[k]===null)!==unknown)throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');if((row.selected_amount===null)!==(row.unknown_selected_amount_count!=='0')||row.has_deduction!==(row.deduction_item_count!=='0'))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');}
  }
  const expected=payload.complete?null:{context,key:last};if(!same(payload.next_cursor,expected)||!exact(payload.page_receipt,['context','start_key','end_key','row_count'])||!same(payload.page_receipt.context,context)||!same(payload.page_receipt.start_key,args.after?.key??null)||!same(payload.page_receipt.end_key,last)||payload.page_receipt.row_count!==String(payload.rows.length))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
  return payload;
}


class WorkbenchReadError extends Error {
  constructor(code,retryable=false,reloadRequired=false){
    super(code==='BPAY_NEXT_WORKBENCH_CURSOR_STALE'?'The Workbench changed. Reload this list before continuing.':code==='BPAY_NEXT_WORKBENCH_PROJECTION_NOT_CURRENT'?'Pay facts are being updated. This list is not yet available.':code==='BPAY_NEXT_MODULE_NOT_ACTIVE'?'Banking Pay NEXT is not active.':'The Workbench could not be loaded. No amounts are available.');
    this.name='WorkbenchReadError';this.code=code;this.serverCode=code;this.retryable=retryable;this.reloadRequired=reloadRequired;
  }
}
function createWorkbenchClient(options){
  if(!record(options)||typeof options.authFetch!=='function'||typeof options.api!=='function'||!field(options.actorId?.toLowerCase(),'uuid')||typeof options.currentActorId!=='function')throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAUTHORIZED');
  const actor=options.actorId.toLowerCase(),environment=options.environment??'TEST';
  // Local, bounded observation lives outside the durable financial journal.
  const debug=options.debug&&Array.isArray(options.debug.workbenchReads)?options.debug:{workbenchReads:[]};
  const now=()=>globalThis.performance?.now?.()??Date.now();
  if(!['TEST','LIVE'].includes(environment))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAVAILABLE');
  function assertActor(){if(String(options.currentActorId()||'').toLowerCase()!==actor)throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_ACTOR_CHANGED');}
  async function loadWorkbenchPage(kind,params={}){
    let controller,timer,bytes=0,rows=0,status='REFUSED',timedOut=false;const started=now();
    try{
      assertActor();const args=normalizeWorkbenchInput(kind,params);
      if(args.after!==null&&args.after.context.actor_user_id!==actor)throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_CURSOR_STALE',false,true);
      const query=new URLSearchParams({kind});for(const [key,value] of Object.entries(args))if(value!==null)query.set(key,['after','count_selection'].includes(key)?JSON.stringify(value):String(value));
      if(ENCODER.encode(query.toString()).byteLength>32768)throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
      controller=new AbortController();const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAVAILABLE',true));},BPAY_NEXT_WORKBENCH_LIMITS.timeoutMs);});
      const read=async()=>{
        const response=await options.authFetch(options.api('/api/banking/pay/next/workbench-page?'+query.toString()),{method:'GET',signal:controller.signal,auth401Mode:'return',redirect:'error',headers:{accept:'application/json','X-CloudTMS-Banking-Environment':environment}});
        if(!(response instanceof Response))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
        if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAVAILABLE',true);}
        const body=await readWorkbenchJson(response,controller.signal,n=>{bytes=n;});assertActor();
        if(body?.ok===false){
          if(shape(body,REFUSAL)){validateWorkbenchResponse(body,kind,args,actor);throw new WorkbenchReadError(body.error_code,body.retryable,body.reload_required);}
          if(exact(body,['ok','error_code','retryable'])&&body.ok===false&&body.retryable===false&&['BPAY_NEXT_ENVIRONMENT_MISMATCH','BPAY_NEXT_OFFICE_FORBIDDEN'].includes(body.error_code))throw new WorkbenchReadError(body.error_code,false);
          throw new WorkbenchReadError(response.status===401?'BPAY_NEXT_WORKBENCH_UNAUTHORIZED':response.status===403?'BPAY_NEXT_WORKBENCH_FORBIDDEN':'BPAY_NEXT_WORKBENCH_UNAVAILABLE',response.status>=500);
        }
        if(!response.ok)throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAVAILABLE',response.status>=500);
        const validated=validateWorkbenchResponse(body,kind,args,actor);rows=validated.rows.length;return validated;
      };
      const result=await Promise.race([read(),timeout]);status='OK';return result;
    }catch(e){const error=e instanceof WorkbenchReadError?e:new WorkbenchReadError(FAILURE_CODES.includes(e?.code)?e.code:'BPAY_NEXT_WORKBENCH_UNAVAILABLE',e?.retryable===true,e?.reload===true);try{if(typeof options.onReadFailure==='function'&&String(options.currentActorId()||'').toLowerCase()===actor)options.onReadFailure(error);}catch{}throw error;}
    finally{if(timer!==undefined)clearTimeout(timer);try{if(KINDS.includes(kind)&&String(options.currentActorId()||'').toLowerCase()===actor){debug.workbenchReads.push(Object.freeze({kind,rows,bytes,status:timedOut?'TIMEOUT':status,elapsedMs:Math.round(Math.max(0,now()-started))}));if(debug.workbenchReads.length>100)debug.workbenchReads.splice(0,debug.workbenchReads.length-100);}}catch{}}
  }
  return Object.freeze({loadWorkbenchPage,debug});
}
function loadWorkbenchPage(kind,params={},options){return createWorkbenchClient(options).loadWorkbenchPage(kind,params);}
// WB13 consumes maintained facts only. No tick, estimate or mutation owner.
const ISSUE_REASONS=Object.freeze({
 DATA_UNAVAILABLE:'Required pay data is missing',SEGMENT_CREDIT_ATTRIBUTION_UNAVAILABLE:'Original shift credit needs review',
 APPROVAL_WITHDRAWN:'Missing approval — approval withdrawn',MISSING_APPROVAL:'Awaiting authorisation',APPLY_PENDING:'Updating',
 PAY_QUERY_UNAVAILABLE:'Pay query status unavailable',PAY_QUERY_OPEN:'Pay query open',AWAITING_REAUTHORISATION:'Paid — awaiting re-authorisation',
 ORIGIN_UNAUTHORISED_WAIT:'Waiting for re-authorisation — recovery paused',CASE_REVIEW_REQUIRED:'Finance case needs review',RECOVERY_MANAGED:'Recovery managed through the finance case',
 IN_PREPARATION:'Included in Draft preparation',CASE_PAUSED:'Finance case paused',RESERVED:'Reserved in an existing payment',SNOOZED:'Snoozed'
});
function issueReason(row){
 if(row.reason_code==='PAY_ON_HOLD')return 'Pay on hold'+(row.pay_hold_reason?': '+row.pay_hold_reason:'');
 if(['RATE_RESOLUTION_REQUIRED','GROSS_RESOLUTION_REQUIRED'].includes(row.reason_code)){
  const direction=row.source_pay_channel&&row.target_pay_channel&&row.source_pay_channel!==row.target_pay_channel
    ?(row.source_pay_channel==='PAYE'?'PAYE to Umbrella':'Umbrella to PAYE'):null;
  return (direction?'Pay channel changed: '+direction: 'Pay value needs a decision')+'. Choose the '+(row.reason_code==='RATE_RESOLUTION_REQUIRED'?'rate':'amount');
 }
 if(row.reason_code==='FUTURE_WEEK')return 'Not payable until '+(row.eligible_from_date?row.eligible_from_date.split('-').reverse().join('/'):'date unavailable');
 return ISSUE_REASONS[row.reason_code]??'Payment needs review';
}
function issueAmounts(row){
 const netStage=['NET_ADD','NET_DEDUCT'].includes(row.payroll_stage);
 const values=[];const add=(label,value)=>{if(value!==null)values.push({label,value});};
 if(!row.amount_known||row.nominal_source_ex_vat===null)values.push({label:'Current amount',value:null});
 else add(row.portion_kind==='RESERVED'?(netStage?'Reserved adjustment':'Reserved'):row.direction==='DEDUCTION'?(netStage?'Deduction balance':'Deduction balance'):row.reason_code==='AWAITING_REAUTHORISATION'?'As authorised':netStage?'Adjustment':'Amount ex VAT',row.nominal_source_ex_vat);
 if(row.portion_kind!=='RESERVED'&&row.approved_source_ex_vat!==row.nominal_source_ex_vat)add(netStage?'As authorised adjustment':'As authorised',row.approved_source_ex_vat);
 if(row.direction==='DEDUCTION')add('Outstanding deduction balance',row.deduction_balance_source_ex_vat);
 if(row.portion_kind!=='RESERVED'&&row.active_reserved_source_ex_vat!==null&&!/^0(?:\.0+)?$/.test(row.active_reserved_source_ex_vat))add(netStage?'Reserved adjustment':'Reserved',row.active_reserved_source_ex_vat);
 if(row.recovery_source_ex_vat!==null&&!/^0(?:\.0+)?$/.test(row.recovery_source_ex_vat))add('Recovery',row.recovery_source_ex_vat);
 return values;
}
// WB11 reads maintained totals and scoped identities; never creates a Draft.
function sameWorkbenchRevision(a,b){return Boolean(a&&b&&['agency_id','actor_user_id','owner_epoch','official_pay_date','workbench_revision','adoption_revision'].every(k=>a[k]===b[k]));}
function displayPounds(value){
 if(value===null)return '—';
 // Presentation rounding only. Original decimal text remains the authority.
 const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^-/,'').split('.');
 const pence=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0').slice(0,2))+(fraction[2]>='5'?1n:0n);
 return (negative&&pence!==0n?'−':'')+'£'+(pence/100n).toLocaleString('en-GB')+'.'+String(pence%100n).padStart(2,'0');
}
function mountWorkbenchShell(options){
 if(!record(options)||!options.host?.ownerDocument||!field(options.actorId?.toLowerCase(),'uuid')||typeof options.showReadWindow!=='function'||typeof options.ownerReady!=='function'||typeof options.currentActorId!=='function')throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
 const host=options.host,doc=host.ownerDocument,win=doc.defaultView,client=options.client??createWorkbenchClient(options);
 async function readPage(kind,args){if(!current())throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_ACTOR_CHANGED');const page=await client.loadWorkbenchPage(kind,args);if(!current())throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_ACTOR_CHANGED');return validateWorkbenchResponse(page,kind,normalizeWorkbenchInput(kind,args),options.actorId.toLowerCase());}
 const ui=typeof module==='object'&&module.exports?require('./bpay-next-ui.js'):win.CloudTMSBpayNextUi;
 const el=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 const button=(label,fn)=>{const node=el('button',label,'btn');node.type='button';node.addEventListener('click',fn);return node;};
 let scope={candidate_id:null,client_id:null,channel:'ALL'},labels={candidate:null,client:null},tab='READY',bundle=null,busy=false,error='',closed=false,generation=0,dialog=null,issueAvailability={available:false,context:null};
 const root=el('section',undefined,'bpay-next-workbench-shell'),tabs=el('div',undefined,'bpay-next-main-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Payments');
 const strip=el('div',undefined,'bpay-next-header-strip'),facts=el('div',undefined,'bpay-next-header-facts'),chips=el('div',undefined,'ma-chips'),actions=el('div',undefined,'bpay-next-header-actions');
 const alert=el('p','', 'ws-notice');alert.setAttribute('role','alert');alert.setAttribute('data-next-live-copy','');const readyHost=el('div'),issueHost=el('div');
 const filters=button('Filters',()=>openFilters()),refresh=button('Refresh',()=>{options.onRefresh?.();void load();});actions.append(filters,refresh);strip.append(facts,chips,actions);root.append(tabs,strip,alert,readyHost,issueHost);host.append(root);
 const tabButtons={};for(const [key,label] of [['READY','Ready'],['ACTION','Action required'],['BLOCKED','Blocked']]){const b=button(label,()=>setTab(key));b.setAttribute('role','tab');b.id='bpay-next-main-tab-'+key;b.setAttribute('aria-controls','bpay-next-main-panel-'+key);tabButtons[key]=b;tabs.append(b);}
 readyHost.id='bpay-next-main-panel-READY';readyHost.setAttribute('role','tabpanel');readyHost.setAttribute('aria-labelledby',tabButtons.READY.id);
 function actorCurrent(){try{return options.ownerReady()===true&&String(options.currentActorId()||'').toLowerCase()===options.actorId.toLowerCase();}catch{return false;}}
 function current(){return !closed&&(root.isConnected||options.windowAlive?.()===true)&&actorCurrent();}
 function scopeLabel(value=scope,names=labels){return [value.channel==='ALL'?'PAYE + Umbrella':value.channel==='PAYE'?'PAYE only':'Umbrella',names.candidate,names.client].filter(Boolean).join(' · ');}
 function notify(){try{options.onAvailability?.({available:Boolean(bundle&&!busy&&!error&&current()),context:bundle?.READY.context??null});}catch{}}
 function joinIssues(){issueHost.hidden=tab==='READY';}
 function render(){
  const available=Boolean(bundle&&!busy&&!error&&current());
  facts.classList.toggle('bpay-next-stale',!available);facts.replaceChildren();for(const [name,value] of [['Ready to pay',bundle?displayPounds(bundle.READY.rows[0].amount):'—'],['Candidates',bundle?BigInt(bundle.READY.rows[0].candidate_count).toLocaleString('en-GB'):'—']]){const fact=el('div');const amount=el('strong',value);amount.setAttribute('data-next-formatted-money','');fact.append(el('span',name),amount);facts.append(fact);}
  // The local-exclusion label is supplied by WB12; no selected count is invented.
  if(typeof options.selectionLabel==='function'){const fact=el('div');fact.append(el('span','Selected'),el('strong',options.selectionLabel()));facts.append(fact);}
  chips.replaceChildren(el('span',scope.channel==='ALL'?'PAYE + Umbrella':scope.channel==='PAYE'?'PAYE':'Umbrella','ma-chip'));
  if(scope.channel!=='ALL'||scope.candidate_id!==null||scope.client_id!==null)chips.append(el('span',scopeLabel(),'ma-chip'));
  for(const [key,b] of Object.entries(tabButtons)){const count=available?(key==='READY'?bundle[key].rows[0].candidate_count:bundle[key].rows[0].item_count):null;b.textContent=key==='READY'?'Ready':key==='ACTION'?'Action required':'Blocked';if(count!==null)b.append(el('span',BigInt(count).toLocaleString('en-GB'),'bpay-next-tab-count'));b.setAttribute('aria-selected',String(tab===key));b.tabIndex=tab===key?0:-1;b.disabled=busy;}
  readyHost.hidden=tab!=='READY';issueHost.hidden=tab==='READY';issueHost.id='bpay-next-main-panel-'+(tab==='READY'?'ACTION':tab);issueHost.setAttribute('role','tabpanel');issueHost.setAttribute('aria-labelledby',tabButtons[tab==='READY'?'ACTION':tab].id);
  filters.disabled=busy||!current();refresh.disabled=busy||!current();alert.hidden=!busy&&!error;alert.textContent=error||(busy?'Loading…':'');root.setAttribute('aria-busy',String(busy));joinIssues();notify();
 }
 function setTab(value){if(!current()||busy||!Object.hasOwn(tabButtons,value))return;tab=value;render();options.onTab?.(value);}
 async function load(){
  if(!current())return;const ticket=++generation,readScope={...scope};busy=true;error='';render();
  try{
   const channels=readScope.channel==='ALL'?['PAYE','UMBRELLA']:[],sections=['READY','ACTION','BLOCKED'];
   const pages=await Promise.all([...sections.map(section=>readPage('HEADER',{...readScope,section})),...channels.map(channel=>readPage('HEADER',{...readScope,channel,section:'READY'}))]);
   if(ticket!==generation||!current())return;if(pages.some(p=>!sameWorkbenchRevision(pages[0].context,p.context)))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_CURSOR_STALE',false,true);
   bundle=Object.freeze({READY:pages[0],ACTION:pages[1],BLOCKED:pages[2],channels:Object.freeze(Object.fromEntries(channels.map((k,i)=>[k,pages[i+3]])))});
  }catch{if(ticket===generation&&current())error='Could not refresh payments; try again.';}
  finally{if(ticket===generation&&current()){busy=false;render();}}
 }
 function child(title,parent){
  if(!current())throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_ACTOR_CHANGED');
  const previous=doc.activeElement,body=el('div',undefined,'bpay-next-filter-content'),footer=el('div',undefined,'bpay-next-window-actions');let frame,focused=false;
  const entry={body,footer,active:()=>frame?.active()===true,alive:()=>frame?.alive()===true,close:()=>frame?.close()};dialog=entry;
  frame=options.showReadWindow({title,content:body,footer,small:true,canFocus:current,onDismiss:()=>{
    if(dialog===entry)dialog=parent??null;
    win.setTimeout(()=>{if(current()&&previous?.isConnected)previous.focus();},0);
  },onMount:()=>{if(focused)return;focused=true;win.setTimeout(()=>{if(entry.active()&&current())body.querySelector('input,button')?.focus();},0);}});
  return entry;
 }
 function openFilters(){
  if(dialog||busy||!current())return;const entry=child('Filters'),draft={...scope},draftLabels={...labels};let countTicket=0,valid=false,closedFilter=false;
  const group=el('fieldset'),legend=el('legend','Pay channel');group.append(legend);
  for(const [key,text] of [['ALL','PAYE and Umbrella'],['PAYE','PAYE only'],['UMBRELLA','Umbrella only']]){const wrap=el('label'),radio=el('input');radio.type='radio';radio.name='bpay-next-filter-channel';radio.value=key;radio.checked=draft.channel===key;radio.addEventListener('change',()=>{if(radio.checked&&current()){draft.channel=key;void count();}});wrap.append(radio,el('span',text));group.append(wrap);}
  const candidateLabel=el('label','Candidate'),candidate=button(draftLabels.candidate??'All Candidates · type to search',()=>openPicker('PICK_CANDIDATES',entry,draft,draftLabels,()=>{updateLabels();void count();}));candidate.setAttribute('aria-label','All Candidates · type to search');candidateLabel.append(candidate);
  const clientLabel=el('label','Client'),clientButton=button(draftLabels.client??'All Clients · type to search',()=>openPicker('PICK_CLIENTS',entry,draft,draftLabels,()=>{updateLabels();void count();}));clientButton.setAttribute('aria-label','All Clients · type to search');clientLabel.append(clientButton);
  const card=el('div',undefined,'bpay-next-filter-count'),message=el('p');message.setAttribute('role','alert');message.setAttribute('data-next-live-copy','');const apply=button('Apply',()=>{if(!valid||!current())return;bundle=null;scope={...draft};labels={...draftLabels};closedFilter=true;entry.close();options.onScope?.({...scope});void load();});apply.classList.add('btn-primary');
  const clear=button('Clear filters',()=>{if(!current())return;bundle=null;scope={candidate_id:null,client_id:null,channel:'ALL'};labels={candidate:null,client:null};closedFilter=true;entry.close();options.onScope?.({...scope});void load();});
  const retry=button('Try again',()=>void count());retry.hidden=true;entry.body.append(group,candidateLabel,clientLabel,card,message,retry);entry.footer.append(clear,apply);
  function updateLabels(){candidate.textContent=draftLabels.candidate??'All Candidates · type to search';clientButton.textContent=draftLabels.client??'All Clients · type to search';}
  async function count(){const ticket=++countTicket,readScope={...draft};valid=false;apply.disabled=true;card.textContent='Loading…';message.textContent='';retry.hidden=true;
   try{const page=await readPage('HEADER',{...readScope,section:'READY'});if(ticket!==countTicket||closedFilter||!entry.alive()||!current())return;const total=el('strong',BigInt(page.rows[0].candidate_count).toLocaleString('en-GB')+(page.rows[0].candidate_count==='1'?' Candidate · ':' Candidates · ')+displayPounds(page.rows[0].amount)+' ready');total.setAttribute('data-next-formatted-money','');card.replaceChildren(total,el('p',scopeLabel(readScope,{...draftLabels})));valid=true;apply.disabled=false;
   }catch{if(ticket===countTicket&&entry.alive()&&current()){card.textContent='—';message.textContent='Could not load payments; try again.';retry.hidden=false;}}
  }
  void count();
 }
 function openPicker(kind,parent,draft,names,chosen){
  if(!current()||dialog!==parent)return;
  const candidateKind=kind==='PICK_CANDIDATES',id=candidateKind?'candidate_id':'client_id',name=candidateKind?'candidate_sort_name':'client_display_name';
  const entry=child(candidateKind?'Choose Candidate':'Choose Client',parent),readScope={...draft,[id]:null};
  let pages=[],history=[],context=null,loading=false,error='',pick=null,ticket=0,search='',reloadRequired=false,pending={direction:'reset',after:null};
  const subtitle=el('p',scopeLabel(readScope,{candidate:candidateKind?null:names.candidate,client:candidateKind?names.client:null})),form=el('form'),label=el('label',candidateKind?'Search name or TMS ref':'Search Client'),input=el('input');
  input.type='search';input.maxLength=200;input.setAttribute('data-next-focus-key','picker-search');label.append(input);const find=button('Search',()=>{});find.type='submit';form.append(label,find);
  const scroller=el('div',undefined,'ctms-universal-table-host bpay-next-picker-list'),status=el('p');status.setAttribute('role','status');status.setAttribute('data-next-live-copy','');
  const choose=button('Choose',()=>{if(!pick||loading||error||!entry.active()||!current())return;draft[id]=pick[id];names[candidateKind?'candidate':'client']=pick[name]??(candidateKind?'Candidate':'Client');entry.close();chosen();});choose.classList.add('btn-primary');choose.disabled=true;
  const retry=button('Try again',()=>{if(reloadRequired){context=null;pages=[];history=[];pick=null;reloadRequired=false;void read('reset',null);}else void read(pending.direction,pending.after);});retry.hidden=true;
  const hint=el('span',candidateKind?'Choose a Candidate.':'Choose a Client.');hint.hidden=true;hint.setAttribute('data-next-live-copy','');
  entry.body.append(subtitle,form,scroller,status,retry);entry.footer.append(hint,button(candidateKind?'All Candidates':'All Clients',()=>{if(!entry.active()||!current())return;draft[id]=null;names[candidateKind?'candidate':'client']=null;entry.close();chosen();}),choose);
  function pageHeight(page){return Array.from(scroller.querySelectorAll('tr[data-picker-id]')).filter(node=>page.rows.some(row=>row[id]===node.dataset.pickerId)).reduce((sum,node)=>sum+node.getBoundingClientRect().height,0);}
  function renderRows(){
   const focus=ui.capture(entry.body,doc),table=el('table',undefined,'ctms-universal-table ctms-universal-card-table'),head=el('thead'),header=el('tr'),body=el('tbody');header.append(el('th',candidateKind?'Candidate':'Client'));head.append(header);
   for(const row of pages.flatMap(page=>page.rows)){
    const tr=el('tr');tr.tabIndex=0;tr.dataset.pickerId=row[id];tr.setAttribute('data-next-focus-key','picker:'+row[id]);tr.setAttribute('aria-selected',String(pick?.[id]===row[id]));
    const cell=el('td'),title=el('strong',row[name]??(candidateKind?'Candidate':'Client'));cell.dataset.label=candidateKind?'Candidate':'Client';cell.append(title);if(candidateKind&&row.tms_ref)cell.append(el('small','TMS '+row.tms_ref));
    const select=()=>{if(!entry.active()||!current()||loading||error)return;pick=row;hint.hidden=true;for(const node of body.children)node.setAttribute('aria-selected',String(node===tr));choose.disabled=false;};
    const open=()=>{select();choose.click();};tr.addEventListener('click',select);tr.addEventListener('dblclick',event=>{if(!event.target.closest('button'))open();});
    tr.addEventListener('keydown',event=>{if(event.target!==tr)return;if(event.key==='Enter'){event.preventDefault();open();}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const nodes=Array.from(body.children),i=nodes.indexOf(tr),n=event.key==='Home'?0:event.key==='End'?nodes.length-1:Math.max(0,Math.min(nodes.length-1,i+(event.key==='ArrowDown'?1:-1)));nodes[n]?.focus();}});
    const phone=button('Open',event=>{event.stopPropagation();open();});phone.setAttribute('data-next-focus-key','picker-open:'+row[id]);phone.className='btn bpay-next-phone-open';cell.append(phone);tr.append(cell);body.append(tr);
   }
   table.append(head,body);scroller.replaceChildren(table);if(!loading&&!pages.some(page=>page.rows.length)&&!error)scroller.append(el('p','No matches.'));
   choose.disabled=loading||Boolean(error)||!pick;hint.hidden=loading||Boolean(error)||Boolean(pick)||!pages.some(page=>page.rows.length);retry.hidden=!error;retry.textContent=reloadRequired?'Refresh':'Try again';status.setAttribute('role',error?'alert':'status');status.textContent=error||(loading?(pending.direction==='reset'?'Loading…':'Loading more…'):'');
   if(focus&&entry.active()&&current())ui.restore(entry.body,focus,input);
  }
  async function read(direction,after){
   if(loading||!current()||!entry.active())return;
   const mine=++ticket,scroll=scroller.scrollTop;let adjustment=0;loading=true;error='';pending={direction,after};choose.disabled=true;retry.hidden=true;status.setAttribute('role','status');status.textContent=direction==='reset'?'Loading…':'Loading more…';
   try{
    const page=await readPage(kind,{...readScope,section:'ALL',search,after,limit:100});if(mine!==ticket||!current()||!entry.active())return;
    if(context&&!sameWorkbenchRevision(context,page.context))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_CURSOR_STALE',false,true);context=page.context;
    const block={after,next:page.next_cursor,rows:page.rows};
    if(direction==='reset'){pages=[block];history=[];pick=null;}
    else if(direction==='back'){pages.unshift(block);history.pop();if(pages.length>3)pages.pop();}
    else{if(pages.length===3){const first=pages[0];adjustment=-pageHeight(first);history.push(first.after?.key??null);while(ENCODER.encode(JSON.stringify(history)).byteLength>32768)history.shift();pages.shift();}pages.push(block);}
   }catch(e){if(mine===ticket&&entry.active()&&current()){reloadRequired=e?.reloadRequired===true||e?.reload===true;error=reloadRequired?'Payments changed; refresh to continue.':'Could not load this list; try again.';}}
   finally{if(mine===ticket&&entry.active()&&current()){loading=false;renderRows();if(!error){if(direction==='back')adjustment=pageHeight(pages[0]);scroller.scrollTop=direction==='reset'?0:Math.max(0,scroll+adjustment);}}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();if(loading||!current()||!entry.active())return;search=input.value.trim();context=null;pages=[];history=[];pick=null;void read('reset',null);});
  scroller.addEventListener('scroll',()=>{if(loading||error||!entry.active())return;const next=pages.at(-1)?.next;if(scroller.scrollTop<40&&history.length){const key=history.at(-1);void read('back',key===null?null:{context,key});}else if(next&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<100)void read('forward',next);});
  void read('reset',null);
 }
 tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const keys=Object.keys(tabButtons),i=keys.indexOf(tab),next=event.key==='Home'?keys[0]:event.key==='End'?keys.at(-1):keys[(i+(event.key==='ArrowRight'?1:2))%3];setTab(next);tabButtons[next].focus();});
 const ownerChanged=()=>{if(!actorCurrent()){generation++;bundle=null;busy=false;dialog?.close();dialog?.close();closed=true;root.remove();}};win.addEventListener('cloudtms:bpay-next-owner-changed',ownerChanged);
 render();void load();
 return Object.freeze({readyHost,issueHost,client,load,setTab,openFilters,refreshSelectionLabel(){if(current())render();},setIssueAvailability(value){if(!current())return;issueAvailability=value;render();},snapshot:()=>Object.freeze({scope:{...scope},labels:{...labels},tab,available:Boolean(bundle&&!busy&&!error&&current()),context:bundle?.READY.context??null,headers:bundle}),invalidate(){if(!current())return;generation++;bundle=null;busy=false;error='Payments changed; refresh to continue.';render();},close(){closed=true;generation++;dialog?.close();dialog?.close();win.removeEventListener('cloudtms:bpay-next-owner-changed',ownerChanged);root.remove();}});
}

function mountReadyCandidates(options){
 if(!record(options)||!options.host?.ownerDocument||!field(options.actorId?.toLowerCase(),'uuid')||typeof options.currentActorId!=='function'||typeof options.ownerReady!=='function'||typeof options.openCandidate!=='function')throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
 const doc=options.host.ownerDocument,win=doc.defaultView,client=options.client??createWorkbenchClient(options),ui=win.CloudTMSBpayNextUi;
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const b=el('button',text,'btn');b.type='button';b.addEventListener('click',fn);return b;};
 let scope={candidate_id:null,client_id:null,channel:'ALL',...(options.scope??{})},sort='NAME_ASC',pages=[],history=[],context=null,header=null,joined={available:false,context:null},busy=false,error='',selectionError='',closed=false,generation=0,highlight=null,baseline='ALL',exceptions=new Set(),intentRevision=0,reloadRequired=false,pending={direction:'reset',after:null};
 const root=el('section',undefined,'bpay-next-ready-list'),mobileSort=el('label','Sort by','bpay-next-ready-mobile-sort'),select=el('select'),scroller=el('div',undefined,'ctms-universal-table-host bpay-next-ready-scroll'),status=el('p',''),foot=el('p','', 'bpay-next-ready-foot'),retry=button('Try again',()=>{if(reloadRequired){context=null;pages=[];history=[];void read('reset',null);}else void read(pending.direction,pending.after);});
 select.setAttribute('data-next-focus-key','ready-sort');for(const [key,label] of [['NAME','Candidate'],['DEDUCTIONS','Deductions'],['AMOUNT','Amount ex VAT'],['STATUS','Status']])for(const dir of ['ASC','DESC']){const o=el('option',label+(dir==='ASC'?' ▲':' ▼'));o.value=key+'_'+dir;select.append(o);}mobileSort.append(select);
 scroller.setAttribute('role','region');scroller.setAttribute('aria-label','Ready payments');scroller.tabIndex=0;status.setAttribute('data-next-live-copy','');status.setAttribute('role','status');foot.setAttribute('data-next-live-copy','');root.append(mobileSort,scroller,status,retry,foot);options.host.append(root);
 function actorCurrent(){try{return options.ownerReady()===true&&String(options.currentActorId()||'').toLowerCase()===options.actorId.toLowerCase();}catch{return false;}}
 function current(){return !closed&&(root.isConnected||options.windowAlive?.()===true)&&actorCurrent();}
 function coherent(){return current()&&!busy&&!error&&context&&header&&joined.available&&sameWorkbenchRevision(context,joined.context);}
 function selected(id){return (baseline==='ALL')!==exceptions.has(id);}
 function intent(){return {mode:baseline,candidate_ids:[...exceptions]};}
 function selectionLabel(){return baseline==='ALL'?'All except '+exceptions.size:exceptions.size===0?'None':exceptions.size+' chosen';}
 function notify(){try{options.onAvailability?.({available:Boolean(coherent()),context});}catch{}}
 function choose(row,value){if(!coherent()||row.payable_count==='0')return;const next=new Set(exceptions);if(value===(baseline==='ALL'))next.delete(row.candidate_id);else next.add(row.candidate_id);const proposed={mode:baseline,candidate_ids:[...next]};const args=normalizeWorkbenchInput('HEADER',{...scope,section:'READY',count_selection:proposed}),query=new URLSearchParams({kind:'HEADER'});for(const [key,value] of Object.entries(args))if(value!==null)query.set(key,['after','count_selection'].includes(key)?JSON.stringify(value):String(value));if(!field(proposed,'countSelection')||ENCODER.encode(query.toString()).byteLength>32768){selectionError='Too many choices to count; clear some choices and try again.';render();return;}selectionError='';exceptions=next;intentRevision++;options.onSelection?.(Object.freeze(intent()));render();}
 function open(row){if(!coherent())return;Promise.resolve(options.openCandidate(Object.freeze({candidate_id:row.candidate_id,context,scope:{...scope}}))).catch(()=>{if(current()){error='Could not open this Candidate; try again.';render();}});}
 function pageHeight(page){const ids=new Set(page.rows.map(row=>row.candidate_id));return Array.from(scroller.querySelectorAll('tr[data-candidate-id]')).filter(n=>ids.has(n.dataset.candidateId)).reduce((sum,n)=>sum+n.getBoundingClientRect().height,0);}
 function render(){
  const focus=ui.capture(root,doc),available=coherent(),table=el('table',undefined,'ctms-universal-table ctms-universal-card-table'),thead=el('thead'),trHead=el('tr'),tbody=el('tbody');
  const tickHead=el('th');tickHead.setAttribute('aria-label','Selected');trHead.append(tickHead);
  for(const [key,label] of [['NAME','Candidate'],['DEDUCTIONS','Deductions'],['AMOUNT','Amount ex VAT'],['STATUS','Status']]){const th=el('th');th.scope='col';const active=sort.startsWith(key+'_'),b=button(label+(active?(sort.endsWith('ASC')?' ▲':' ▼'):''),()=>setSort(key+'_'+(sort===key+'_ASC'?'DESC':'ASC')));b.setAttribute('data-next-focus-key','ready-heading:'+key);b.disabled=busy||!current();if(active)th.setAttribute('aria-sort',sort.endsWith('ASC')?'ascending':'descending');th.append(b);trHead.append(th);}const openHead=el('th','');openHead.className='bpay-next-ready-open-cell';trHead.append(openHead);thead.append(trHead);
  for(const row of pages.flatMap(p=>p.rows)){
   const id=row.candidate_id,tr=el('tr');tr.tabIndex=0;tr.dataset.candidateId=id;tr.setAttribute('data-next-focus-key','ready:'+id);tr.setAttribute('aria-selected',String(highlight===id));
   const ticks=el('td'),tick=el('input');tick.type='checkbox';tick.checked=row.payable_count!=='0'&&selected(id);tick.disabled=!available||row.payable_count==='0';tick.setAttribute('aria-label','Select '+(row.candidate_sort_name??'Candidate'));tick.setAttribute('data-next-focus-key','ready-tick:'+id);tick.addEventListener('click',event=>event.stopPropagation());tick.addEventListener('change',()=>choose(row,tick.checked));ticks.append(tick);tr.append(ticks);
   const name=el('td'),ded=el('td'),amount=el('td'),state=el('td'),phone=el('td');for(const [n,label] of [[name,'Candidate'],[ded,'Deductions'],[amount,'Amount ex VAT'],[state,'Status']])n.dataset.label=label;
   name.append(el('strong',row.candidate_sort_name??'Candidate'));if(row.tms_ref!==null)name.append(el('small','TMS '+row.tms_ref));ded.textContent=row.has_deduction&&(row.payable_count==='0'||selected(id))?'Yes':'No';const money=el('strong',displayPounds(row.amount));money.setAttribute('data-next-formatted-money','');amount.className='bpay-next-ready-money';amount.append(money);
   // NET additions and debts retain their own provenance; never combine with SOURCE.
   if(row.ready_net_add_amount!==null&&decimalCompare(row.ready_net_add_amount,'0')!==0){const net=el('small','Payment addition '+displayPounds(row.ready_net_add_amount));net.setAttribute('data-next-formatted-money','');amount.append(net);}
   state.append(el('span',row.payable_count==='0'?'Nothing to pay this week':'Ready','candidate-office-badge candidate-office-badge--'+(row.payable_count==='0'?'neutral':'success')));
   if(row.bank_warning_code!==null){const label=row.bank_warning_code==='BANK_DETAILS_CHANGED'?'Bank details changed':'Bank details missing',bank=el('a',label,'candidate-office-badge candidate-office-badge--warning');bank.href='#';bank.tabIndex=available?0:-1;bank.setAttribute('aria-disabled',String(!available));bank.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(available)options.openBankRecord?.(id);});bank.setAttribute('data-next-focus-key','ready-bank:'+id);state.append(bank);}
   const b=button('Open',event=>{event.stopPropagation();open(row);});b.setAttribute('data-next-focus-key','ready-open:'+id);b.disabled=!available;phone.className='bpay-next-ready-open-cell';phone.append(b);tr.append(name,ded,amount,state,phone);
   const focusRow=()=>{if(!available)return;highlight=id;for(const n of tbody.children)n.setAttribute('aria-selected',String(n===tr));tr.focus({preventScroll:true});};tr.addEventListener('click',event=>{if(!event.target.closest('button,input'))focusRow();});tr.addEventListener('dblclick',event=>{if(!event.target.closest('button,input'))open(row);});
   tr.addEventListener('keydown',event=>{if(event.target!==tr||!available)return;if(event.key==='Enter'){event.preventDefault();open(row);}else if(event.key===' '){event.preventDefault();choose(row,!selected(id));}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const nodes=Array.from(tbody.children),i=nodes.indexOf(tr),at=event.key==='Home'?0:event.key==='End'?nodes.length-1:Math.max(0,Math.min(nodes.length-1,i+(event.key==='ArrowDown'?1:-1)));nodes[at]?.focus();}});tbody.append(tr);
  }
  table.append(thead,tbody);table.hidden=Boolean(context&&(!joined.available||!sameWorkbenchRevision(context,joined.context)));scroller.replaceChildren(table);scroller.classList.toggle('bpay-next-stale',!available);select.value=sort;select.disabled=busy||!current();
  if(available&&!pages.some(p=>p.rows.length))scroller.append(el('p','No payments are ready.','bpay-next-ready-empty'));
  status.setAttribute('role',error||selectionError?'alert':'status');status.textContent=error||selectionError||(busy?(pending.direction==='reset'?'Loading…':'Loading more…'):context&&!available?'Payments changed; refresh to continue.':'');retry.hidden=!error;retry.textContent=reloadRequired?'Refresh':'Try again';
  foot.textContent=available?BigInt(header.candidate_count).toLocaleString('en-GB')+' Candidates · '+BigInt(header.selectable_member_count).toLocaleString('en-GB')+' payment items · Sorted by '+(sort.startsWith('NAME')?'Candidate':sort.startsWith('AMOUNT')?'amount':sort.startsWith('DEDUCTIONS')?'deductions':'status')+(sort.endsWith('ASC')?', ascending':', descending'):'';
  root.setAttribute('aria-busy',String(busy));if(focus&&current()&&root.isConnected)ui.restore(root,focus,scroller);notify();
 }
 async function read(direction,after){
  if(busy||!current())return;const ticket=++generation,readScope={...scope},readSort=sort,scroll=scroller.scrollTop;let adjustment=0;busy=true;error='';reloadRequired=false;pending={direction,after};render();
  try{const page=await client.loadWorkbenchPage('CANDIDATES',{...readScope,sort:readSort,after,limit:100});if(ticket!==generation||!current())return;validateWorkbenchResponse(page,'CANDIDATES',normalizeWorkbenchInput('CANDIDATES',{...readScope,sort:readSort,after,limit:100}),options.actorId.toLowerCase());
   const summary=await client.loadWorkbenchPage('HEADER',{...readScope,section:'READY'});if(ticket!==generation||!current())return;validateWorkbenchResponse(summary,'HEADER',normalizeWorkbenchInput('HEADER',{...readScope,section:'READY'}),options.actorId.toLowerCase());
   if(!sameWorkbenchRevision(page.context,summary.context)||context&&!sameWorkbenchRevision(context,page.context))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_CURSOR_STALE',false,true);
   context=page.context;header=summary.rows[0];const block={after,next:page.next_cursor,rows:page.rows};if(direction==='reset'){pages=[block];history=[];}else if(direction==='back'){pages.unshift(block);history.pop();if(pages.length>3)pages.pop();adjustment=page.rows.length;}else{if(pages.length===3){adjustment=-pageHeight(pages[0]);history.push(pages[0].after?.key??null);while(ENCODER.encode(JSON.stringify(history)).byteLength>32768)history.shift();pages.shift();}pages.push(block);}
  }catch(e){if(ticket===generation&&current()){reloadRequired=e?.reloadRequired===true||e?.reload===true;error=reloadRequired?'Payments changed; refresh to continue.':'Could not load payments; try again.';}}
  finally{if(ticket===generation&&current()){busy=false;render();if(!error){if(direction==='back')adjustment=pageHeight(pages[0]);scroller.scrollTop=direction==='reset'?0:Math.max(0,scroll+adjustment);}}}
 }
 function reset(){generation++;busy=false;context=null;header=null;pages=[];history=[];highlight=null;void read('reset',null);}
 function setSort(value){if(!current()||busy||!['NAME_ASC','NAME_DESC','DEDUCTIONS_ASC','DEDUCTIONS_DESC','AMOUNT_ASC','AMOUNT_DESC','STATUS_ASC','STATUS_DESC'].includes(value))return;sort=value;reset(true);}
 select.addEventListener('change',()=>setSort(select.value));scroller.addEventListener('scroll',()=>{if(busy||error||!coherent())return;if(scroller.scrollTop<40&&history.length){const key=history.at(-1);void read('back',key===null?null:{context,key});}else if(pages.at(-1)?.next&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<120)void read('forward',pages.at(-1).next);});
 const ownerChanged=()=>{if(!actorCurrent()){closed=true;generation++;pages=[];exceptions.clear();root.remove();}};win.addEventListener('cloudtms:bpay-next-owner-changed',ownerChanged);
 render();void read('reset',null);
 return Object.freeze({selectionLabel,snapshot:()=>Object.freeze({scope:{...scope},sort,context,available:Boolean(coherent()),intent:Object.freeze(intent())}),joinHeader(value){if(!current())return;joined=value;render();},reload(){if(current())reset();},setScope(value){if(!current()||!exact(value,['candidate_id','client_id','channel'])||!field(value.candidate_id,'uuid?')||!field(value.client_id,'uuid?')||!field(value.channel,'scopeChannel'))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');scope={...value};baseline='ALL';exceptions.clear();intentRevision++;options.onSelection?.(Object.freeze(intent()));reset();},
  async countSelection(){if(!coherent())throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_CURSOR_STALE',false,true);const revision=intentRevision,captured=context,args={...scope,section:'READY',count_selection:intent()};const page=await client.loadWorkbenchPage('HEADER',args);if(!current()||revision!==intentRevision||!sameWorkbenchRevision(captured,page.context))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_CURSOR_STALE',false,true);validateWorkbenchResponse(page,'HEADER',normalizeWorkbenchInput('HEADER',args),options.actorId.toLowerCase());return Object.freeze({context:page.context,candidate_count:page.rows[0].selected_candidate_count,member_count:page.rows[0].selected_member_count});},
  close(){closed=true;generation++;pages=[];exceptions.clear();win.removeEventListener('cloudtms:bpay-next-owner-changed',ownerChanged);root.remove();}
 });
}

// WB14 one bounded reason-driven view shared by main issue lists and the child.
function mountIssueView(options){
 if(!record(options)||!options.host?.ownerDocument||!field(options.actorId?.toLowerCase(),'uuid')||typeof options.currentActorId!=='function'||typeof options.ownerReady!=='function')throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
 const host=options.host,doc=host.ownerDocument,win=doc.defaultView,ui=win.CloudTMSBpayNextUi,client=options.client??createWorkbenchClient(options),detail=options.detail??null;
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const n=el('button',text,'btn');n.type='button';n.addEventListener('click',fn);return n;};
 let scope={candidate_id:null,client_id:null,channel:'ALL',...(options.scope??{})},kind=detail?'ISSUE_DETAIL':'ACTION_REQUIRED',section=detail?.section??'ACTION',sort='NAME_ASC',search='',pages=[],history=[],context=null,headers=null,affected=null,highlight=null,busy=false,error='',reloadRequired=false,closed=false,generation=0,pending={direction:'reset',after:null};
 const root=el('section',undefined,'bpay-next-issue-lists'),form=el('form'),label=el('label','Search Candidate, TMS ref or Timesheet'),input=el('input'),submit=button('Search',()=>{}),mobile=el('label','Sort by','bpay-next-issue-mobile-sort'),select=el('select'),scroller=el('div',undefined,'ctms-universal-table-host bpay-next-issue-table'),count=el('p'),status=el('p'),foot=el('p'),retry=button('Try again',()=>{if(reloadRequired){if(detail&&options.refreshDetail)options.refreshDetail();else reset();}else void read(pending.direction,pending.after);});
 input.type='search';input.maxLength=200;input.setAttribute('data-next-focus-key','issue-search');label.append(input);submit.type='submit';form.append(label,submit);form.hidden=Boolean(detail);select.setAttribute('data-next-focus-key','issue-sort');
 function columns(){return [['NAME','Candidate'],['PAYMENT','Payment'],['REASON',section==='BLOCKED'?'Why it is blocked':'What needs attention'],['AMOUNT','Amount ex VAT']];}
 function sorts(){select.replaceChildren();for(const [key,text] of columns())for(const dir of ['ASC','DESC']){const n=el('option',text+(dir==='ASC'?' ▲':' ▼'));n.value=key+'_'+dir;select.append(n);}select.value=sort;}
 sorts();mobile.append(select);scroller.tabIndex=0;scroller.setAttribute('role','region');scroller.setAttribute('aria-label',detail?'Affected payments':'Payments needing attention');count.setAttribute('data-next-live-copy','');status.setAttribute('data-next-live-copy','');status.setAttribute('role','status');foot.setAttribute('data-next-live-copy','');root.append(count,form,mobile,scroller,status,retry,foot);host.append(root);
 function current(){try{return !closed&&(root.isConnected||options.windowAlive?.()===true)&&options.ownerReady()===true&&String(options.currentActorId()||'').toLowerCase()===options.actorId.toLowerCase();}catch{return false;}}
 function available(){return Boolean(current()&&context&&!busy&&!error&&options.parentAvailable?.()!==false&&(!options.parentContext?.()||sameWorkbenchRevision(context,options.parentContext())));}
 function notify(){try{options.onAvailability?.({available:available(),context});}catch{}}
 function args(after){return {...scope,section:detail?section:'ALL',search,sort,after,limit:100,...(detail?{group_key:detail.group_key,reason_code:detail.reason_code,item_id:detail.item_id??null}: {})};}
 function address(row){return Object.freeze({item_id:row.item_id,group_key:row.group_key,candidate_id:row.candidate_id,work_id:row.work_id,case_id:row.case_id,case_component_id:row.case_component_id,physical_timesheet_id:row.physical_timesheet_id,revision_id:row.revision_id,reason_code:row.reason_code,section:row.section,context,scope:{...scope}});}
 async function invoke(callback,row){if(!available()||options.canInteract?.()===false||typeof callback!=='function'||detail&&callback===options.openPayment&&row.physical_timesheet_id===null)return;const captured=context;try{await callback(address(row),row);}catch{if(current()&&context===captured){error='Could not open this payment; try again.';render();}}}
 function pageHeight(page){const ids=new Set(page.rows.map(r=>r.item_id));return Array.from(scroller.querySelectorAll('tr[data-item-id]')).filter(n=>ids.has(n.dataset.itemId)).reduce((sum,n)=>sum+n.getBoundingClientRect().height,0);}
 function render(){
  const focus=ui.capture(root,doc),usable=available(),table=el('table',undefined,'ctms-universal-table ctms-universal-card-table'),thead=el('thead'),head=el('tr'),tbody=el('tbody');
  for(const [key,text] of columns()){const th=el('th');th.scope='col';const active=sort.startsWith(key+'_'),b=button(text+(active?(sort.endsWith('ASC')?' ▲':' ▼'):''),()=>setSort(key+'_'+(sort===key+'_ASC'?'DESC':'ASC')));b.disabled=busy||!current();b.setAttribute('data-next-focus-key','issue-heading:'+key);if(active)th.setAttribute('aria-sort',sort.endsWith('ASC')?'ascending':'descending');th.append(b);head.append(th);}head.append(el('th','Actions'));thead.append(head);
  for(const row of pages.flatMap(p=>p.rows)){
   const tr=el('tr');tr.tabIndex=0;tr.dataset.itemId=row.item_id;tr.setAttribute('data-next-focus-key','issue:'+row.item_id);tr.setAttribute('aria-selected',String(highlight===row.item_id));
   const cells=columns().map(([,text])=>{const n=el('td');n.dataset.label=text;return n;}),actions=el('td');actions.dataset.label='Actions';
   cells[0].append(el('strong',row.candidate_display_name??'Candidate'));if(row.candidate_reference)cells[0].append(el('small','TMS '+row.candidate_reference));
   cells[1].append(el('strong',issuePayment(row)));if(row.week_ending_date)cells[1].append(el('small','w/e '+row.week_ending_date.split('-').reverse().join('/')));
   cells[2].textContent=issueReason(row);const values=issueAmounts(row);for(const [i,value] of values.entries()){const n=el(i===0?'strong':'small',(i===0?'':value.label+' ')+displayPounds(value.value));n.setAttribute('data-next-formatted-money','');cells[3].append(n);}
   if(['RATE_RESOLUTION_REQUIRED','GROSS_RESOLUTION_REQUIRED'].includes(row.reason_code)&&row.source_pay_channel)cells[3].append(el('small',(row.source_pay_channel==='PAYE'?'PAYE':'Umbrella')+', as authorised'));
   cells[3].className='bpay-next-issue-money';
   {for(const action of issueActions(row,options)){const b=button(action.label,event=>{event.stopPropagation();void invoke(action.callback,row);});b.disabled=!usable;if(detail&&action.key==='timesheet')b.classList.add('bpay-next-issue-record-open');b.setAttribute('data-next-focus-key','issue-action:'+row.item_id+':'+action.key);actions.append(b);}}
   if(!detail){const b=button('Open',event=>{event.stopPropagation();void invoke(options.openIssue,row);});b.disabled=!usable;b.classList.add('bpay-next-issue-phone-open');actions.append(b);}
   tr.append(...cells,actions);
   tr.addEventListener('click',event=>{if(!usable||event.target.closest('button,input,select,a'))return;highlight=row.item_id;for(const n of tbody.children)n.setAttribute('aria-selected',String(n===tr));tr.focus({preventScroll:true});});
   const open=()=>void invoke(detail?options.openPayment:options.openIssue,row);tr.addEventListener('dblclick',event=>{if(!event.target.closest('button,input,select,a'))open();});
   tr.addEventListener('keydown',event=>{if(event.target!==tr||!usable)return;if(event.key==='Enter'){event.preventDefault();open();}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const nodes=Array.from(tbody.children),i=nodes.indexOf(tr),at=event.key==='Home'?0:event.key==='End'?nodes.length-1:Math.max(0,Math.min(nodes.length-1,i+(event.key==='ArrowDown'?1:-1)));nodes[at]?.focus();}});
   if(detail&&row.physical_timesheet_id!==null&&typeof options.openPayment==='function'){const b=button('Open',event=>{event.stopPropagation();open();});b.disabled=!usable;b.classList.add('bpay-next-issue-phone-open');actions.append(b);}tbody.append(tr);
  }
  table.append(thead,tbody);table.hidden=pages.length===0&&!usable;scroller.classList.toggle('bpay-next-stale',!usable);scroller.replaceChildren(table);
  if(usable&&!pages.some(p=>p.rows.length))scroller.append(el('p',detail?'No payments need attention here.':kind==='BLOCKED'?'No payments are blocked.':'No payments need a decision.'));
  select.value=sort;select.disabled=input.disabled=submit.disabled=busy||!current();status.setAttribute('role',error?'alert':'status');status.textContent=error||(busy?(pending.direction==='reset'?'Loading…':'Loading more…'):context&&!usable?'Payments changed; refresh to continue.':'');retry.hidden=!error;retry.textContent=reloadRequired?'Refresh':'Try again';
  count.textContent=affected!==null&&detail?BigInt(affected).toLocaleString('en-GB')+(affected==='1'?' Candidate affected':' Candidates affected'):'';
  const sortLabel=columns().find(([key])=>sort.startsWith(key+'_'))?.[1]??'Candidate';foot.textContent=(pages.length>0||context)&&(detail||headers)?(detail?count.textContent:BigInt(headers[kind].item_count).toLocaleString('en-GB')+(headers[kind].item_count==='1'?' payment':' payments')+(search?' before search':''))+' · Sorted by '+sortLabel+(sort.endsWith('ASC')?', ascending':', descending'):'';
  root.setAttribute('aria-busy',String(busy));if(focus&&current()&&root.isConnected)ui.restore(root,focus,scroller);notify();
 }
 async function read(direction,after){
  if(busy||!current())return;const ticket=++generation,readKind=kind,request=args(after),scroll=scroller.scrollTop;let adjustment=0;busy=true;error='';reloadRequired=false;pending={direction,after};render();
  try{
   const page=await client.loadWorkbenchPage(readKind,request);if(ticket!==generation||!current())return;validateWorkbenchResponse(page,readKind,normalizeWorkbenchInput(readKind,request),options.actorId.toLowerCase());
   let readHeaders=null;if(!detail){const responses=await Promise.all(['ACTION','BLOCKED'].map(section=>client.loadWorkbenchPage('HEADER',{...scope,section})));if(ticket!==generation||!current())return;for(let i=0;i<responses.length;i++)validateWorkbenchResponse(responses[i],'HEADER',normalizeWorkbenchInput('HEADER',{...scope,section:i===0?'ACTION':'BLOCKED'}),options.actorId.toLowerCase());if(responses.some(p=>!sameWorkbenchRevision(page.context,p.context)))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_CURSOR_STALE',false,true);readHeaders={ACTION_REQUIRED:responses[0].rows[0],BLOCKED:responses[1].rows[0]};}
   if(context&&!sameWorkbenchRevision(context,page.context)||options.parentContext?.()&&!sameWorkbenchRevision(page.context,options.parentContext())||options.expectedRevision!==undefined&&page.workbench_revision!==options.expectedRevision)throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_CURSOR_STALE',false,true);
   context=page.context;headers=readHeaders;affected=page.affected_candidate_count;
   const block={after,next:page.next_cursor,rows:page.rows};if(direction==='reset'){pages=[block];history=[];}else if(direction==='back'){pages.unshift(block);history.pop();if(pages.length>3)pages.pop();}else{if(pages.length===3){adjustment=-pageHeight(pages[0]);history.push(pages[0].after?.key??null);while(ENCODER.encode(JSON.stringify(history)).byteLength>32768)history.shift();pages.shift();}pages.push(block);}
  }catch(e){if(ticket===generation&&current()){reloadRequired=e?.reloadRequired===true||e?.reload===true;error=reloadRequired?'Payments changed; refresh to continue.':'Could not load payments; try again.';}}
  finally{if(ticket===generation&&current()){busy=false;render();if(!error){if(direction==='back')adjustment=pageHeight(pages[0]);scroller.scrollTop=direction==='reset'?0:Math.max(0,scroll+adjustment);}}}
 }
 function reset(clear=false){generation++;busy=false;context=null;history=[];if(clear){pages=[];headers=null;affected=null;}highlight=null;void read('reset',null);}
 function setSort(value){if(!current()||busy||!columns().some(([key])=>value===key+'_ASC'||value===key+'_DESC'))return;sort=value;reset();}
 form.addEventListener('submit',event=>{event.preventDefault();if(!busy&&current()){search=input.value.trim();reset(true);}});select.addEventListener('change',()=>setSort(select.value));
 scroller.addEventListener('scroll',()=>{if(busy||error||!available())return;if(scroller.scrollTop<40&&history.length){const key=history.at(-1);void read('back',key===null?null:{context,key});}else if(pages.at(-1)?.next&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<120)void read('forward',pages.at(-1).next);});
 const ownerChanged=()=>{if(!current()){closed=true;generation++;root.remove();}};win.addEventListener('cloudtms:bpay-next-owner-changed',ownerChanged);render();void read('reset',null);
 return Object.freeze({reload(){if(current())reset();},setKind(value){if(!current()||detail||!['ACTION_REQUIRED','BLOCKED'].includes(value))return;if(value===kind)return;kind=value;section=value==='BLOCKED'?'BLOCKED':'ACTION';sorts();reset(true);},setScope(value){if(!current()||!exact(value,['candidate_id','client_id','channel'])||!field(value.candidate_id,'uuid?')||!field(value.client_id,'uuid?')||!field(value.channel,'scopeChannel'))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');scope={...value};reset(true);},adoptAffected(receipt){if(!field(receipt?.workbench_revision,'integer'))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');options.expectedRevision=receipt.workbench_revision;if(current())reset();},invalidate(){if(current()){generation++;busy=false;error='Payments changed; refresh to continue.';render();}},close(){closed=true;generation++;pages=[];win.removeEventListener('cloudtms:bpay-next-owner-changed',ownerChanged);root.remove();},snapshot:()=>Object.freeze({kind,search,sort,scope:{...scope},context,available:available()})});
}
function issuePayment(row){
 if(row.case_id)return row.direction==='DEDUCTION'?'Deduction':'Payment addition';
 if(row.timesheet_reference)return row.timesheet_reference;
 return row.member_kind==='SOURCE'?'Source hours':row.member_kind==='PROTECTED'?'Protected payment':'Timesheet';
}
function issueActions(row,options){
 const actions=[],add=(key,label,condition)=>{const callback=options.issueOwners?.[key];if(condition&&typeof callback==='function')actions.push({key,label,callback});};
 add('timesheet','Open Timesheet',row.physical_timesheet_id!==null);
 add('query','Open in Source checks',['PAY_QUERY_OPEN','PAY_QUERY_UNAVAILABLE'].includes(row.reason_code));
 return actions;
}
function mountIssueLists(options){return mountIssueView(options);}
function openIssueWindow(options,issue){
 if(!record(options)||typeof options.showReadWindow!=='function'||!record(issue)||!field(issue.item_id,'uuid')||!field(issue.candidate_id,'uuid')||!field(issue.group_key,'groupKey')||!field(issue.reason_code,'code')||!shape(issue.context,CONTEXT)||!['ACTION','BLOCKED'].includes(issue.section))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
 const doc=options.document??options.host.ownerDocument,win=doc.defaultView,previous=doc.activeElement,body=doc.createElement('div'),footer=doc.createElement('div');let frame,view,closed=false,openingContext=issue.context,changed=false;
 const current=()=>!closed&&options.ownerReady()===true&&String(options.currentActorId()||'').toLowerCase()===options.actorId.toLowerCase();
 const refresh=doc.createElement('button');refresh.type='button';refresh.className='btn';refresh.textContent='Refresh';const refreshDetail=()=>{if(current()&&frame.active()){openingContext=null;view.reload();}};refresh.addEventListener('click',refreshDetail);footer.append(refresh);
 frame=options.showReadWindow({title:issue.section==='BLOCKED'?'Why it is blocked':'What needs attention',content:body,footer,canFocus:current,onDismiss:()=>{closed=true;view?.close();win.setTimeout(()=>{if(options.ownerReady()===true&&String(options.currentActorId()||'').toLowerCase()===options.actorId.toLowerCase()&&previous?.isConnected)previous.focus({preventScroll:true});},0);}});
 view=mountIssueView({...options,host:body,scope:{...issue.scope},detail:{group_key:issue.group_key,reason_code:issue.reason_code,item_id:null,section:issue.section},parentContext:()=>openingContext,onAvailability:value=>{if(value.available&&!changed&&!sameWorkbenchRevision(value.context,issue.context)){changed=true;options.onIssueChanged?.();}},windowAlive:()=>frame.alive(),canInteract:()=>frame.active(),refreshDetail,openPayment:options.issueOwners?.timesheet});
 return Object.freeze({close:()=>frame.close(),refresh:refreshDetail,alive:()=>frame.alive()});
}


return Object.freeze({createWorkbenchClient,loadWorkbenchPage,WorkbenchReadError,BPAY_NEXT_WORKBENCH_PAGE_INPUTS,ROWS,mountWorkbenchShell,sameWorkbenchRevision,displayPounds,mountReadyCandidates,mountIssueLists,openIssueWindow,issueReason,issueAmounts});

});
