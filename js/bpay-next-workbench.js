/* WB09 bounded read client; typed failure is surfaced, never an empty GBP0 list. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextWorkbench=api;})(typeof globalThis==='object'?globalThis:this,function(){'use strict';
/** WB09 pure Office reads. Closed kinds, trusted admin actor, fixed RPC only.
 * No reconstruction, financial calculation, command or automatic page retry. */
const BPAY_NEXT_WORKBENCH_LIMITS=Object.freeze({requestBytes:32768,responseBytes:131072,timeoutMs:8000});
const ENCODER=new TextEncoder(),UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const KINDS=['HEADER','CANDIDATES','ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL','CANDIDATE_GROUPS','GROUP_LINES','PICK_CANDIDATES','PICK_CLIENTS','EXPORT_ROWS'];
const COMMON={candidate_id:'uuid?',client_id:'uuid?',channel:'scopeChannel',section:'scopeSection',search:'search',sort:'sort',group_key:'groupKey?',item_id:'uuid?',reason_code:'code?',after:'cursor?',limit:'limit'};
const BPAY_NEXT_WORKBENCH_PAGE_INPUTS=Object.freeze(Object.fromEntries(KINDS.map(k=>[k,Object.freeze({...COMMON})])));
// Generated once from the explicit SQL projections; reviewed source is durable.
const ROWS=Object.freeze({
  "HEADER": {
    "candidate_count": "integer",
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
const enums={kind:KINDS,scopeChannel:['ALL','PAYE','UMBRELLA'],channel:['PAYE','UMBRELLA'],scopeSection:['ALL','READY','ACTION','BLOCKED','WAITING'],section:['READY','ACTION','BLOCKED','WAITING'],sort:['NAME_ASC','NAME_DESC','AMOUNT_ASC','AMOUNT_DESC','DEDUCTIONS_ASC','DEDUCTIONS_DESC','PAYMENT_ASC','PAYMENT_DESC'],bank:['BANK_DETAILS_MISSING','BANK_DETAILS_CHANGED'],group:['WORK','CASE'],member:['WORK_COMPONENT','WORK_SEGMENT','CASE_COMPONENT','GROUP_EVIDENCE'],portion:['AVAILABLE','RESERVED','RECOVERY','ZERO','EVIDENCE','WITHDRAWN'],direction:['PAYMENT','DEDUCTION','INFORMATIONAL'],stage:['GROSS_ADD','GROSS_DEDUCT','NET_ADD','NET_DEDUCT'],query:['NOT_APPLICABLE','UNAVAILABLE','CLEAR','OPEN'],progress:['CURRENT','PROCESSING','UNAVAILABLE'],adoption:['UNSEEDED','SEEDING','CURRENT','ERROR']};
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
  if(type==='scope')return shape(v,SCOPE);
  if(type==='cursor')return exact(v,['context','key'])&&shape(v.context,CONTEXT)&&validKey(v.key,v.context.kind,v.context.scope.sort);
  if(type==='refusal')return FAILURE_CODES.includes(v);
  return false;
}
const shape=(v,schema)=>exact(v,Object.keys(schema))&&Object.entries(schema).every(([k,type])=>field(v[k],type));
function validKey(key,kind,sort){
  if(!Array.isArray(key))return false;
  if(['CANDIDATES','PICK_CANDIDATES'].includes(kind))return sort.startsWith('DEDUCTIONS_')?key.length===5&&field(key[0],'boolean')&&field(key[1],'text')&&field(key[2],'boolean')&&field(key[3],'text')&&field(key[4],'uuid'):sort.startsWith('AMOUNT_')?key.length===3&&field(key[0],'boolean')&&field(key[1],'decimal')&&field(key[2],'uuid'):key.length===4&&field(key[0],'text')&&field(key[1],'boolean')&&field(key[2],'text')&&field(key[3],'uuid');
  if(kind==='CANDIDATE_GROUPS')return key.length===4&&field(key[0],'boolean')&&(key[0]?key[1]==='':field(key[1],'date'))&&field(key[2],'group')&&field(key[3],'uuid');
  if(['ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL'].includes(kind))return sort.startsWith('PAYMENT_')?key.length===2&&field(key[0],'text')&&field(key[1],'uuid'):sort.startsWith('AMOUNT_')?key.length===3&&field(key[0],'boolean')&&field(key[1],'decimal')&&field(key[2],'uuid'):key.length===3&&field(key[0],'text')&&field(key[1],'uuid')&&field(key[2],'uuid');
  return kind!=='HEADER'&&key.length===1&&field(key[0],kind==='CANDIDATE_GROUPS'?'groupKey':'uuid');
}
function rowKey(kind,scope,row){
  if(['CANDIDATES','PICK_CANDIDATES'].includes(kind)){if(scope.sort.startsWith('DEDUCTIONS_'))return [row.has_deduction,row.candidate_sort_name,row.tms_ref===null,row.tms_ref??'',row.candidate_id];if(scope.sort.startsWith('AMOUNT_'))return [row.unknown_amount_count!=='0',row.amount??'0',row.candidate_id];return [row.candidate_sort_name,row.tms_ref===null,row.tms_ref??'',row.candidate_id];}
  if(kind==='HEADER')return null;
  if(kind==='CANDIDATE_GROUPS')return [row.week_ending_date===null,row.week_ending_date??'',row.group_kind,row.work_id??row.case_id];
  if(['ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL'].includes(kind)){if(scope.sort.startsWith('PAYMENT_'))return [row.timesheet_reference??'',row.item_id];if(scope.sort.startsWith('AMOUNT_'))return [row.nominal_source_ex_vat===null,row.nominal_source_ex_vat??'0',row.item_id];return [row.candidate_display_name??'',row.candidate_id,row.item_id];}
  return [kind==='PICK_CLIENTS'?row.client_id:row.item_id];
}
function textCompare(a,b){const x=ENCODER.encode(a),y=ENCODER.encode(b);for(let n=0;n<Math.min(x.length,y.length);n++)if(x[n]!==y[n])return x[n]<y[n]?-1:1;return Math.sign(x.length-y.length);}
// Ordering validation only. Exact decimal strings never become browser money.
function decimalCompare(a,b){const negA=a.startsWith('-'),negB=b.startsWith('-');const parts=v=>{const [whole,fraction='']=v.replace(/^-/,'').split('.');return [whole,fraction.replace(/0+$/,'')];};const [aw,af]=parts(a),[bw,bf]=parts(b);const az=aw==='0'&&af==='',bz=bw==='0'&&bf==='';if(az&&bz)return 0;const an=negA&&!az,bn=negB&&!bz;if(an!==bn)return an?-1:1;const sign=an?-1:1;return sign*(aw.length!==bw.length?Math.sign(aw.length-bw.length):aw!==bw?textCompare(aw,bw):textCompare(af.padEnd(Math.max(af.length,bf.length),'0'),bf.padEnd(Math.max(af.length,bf.length),'0')));}
function keyCompare(a,b,kind,sort){for(let n=0;n<a.length;n++){const value=typeof a[n]==='boolean'?Number(a[n])-Number(b[n]):n===1&&sort.startsWith('AMOUNT_')?decimalCompare(a[n],b[n]):textCompare(a[n],b[n]);if(value)return sort.endsWith('_DESC')?-value:value;}return 0;}
function fail(code,status=503,retryable=false,reload=false){return Object.assign(new Error(code),{code,status,retryable,reload});}
function normalizeWorkbenchInput(kind,input={}){
  if(!KINDS.includes(kind)||!record(input)||Reflect.ownKeys(input).some(k=>typeof k!=='string'||!Object.hasOwn(COMMON,k)))throw fail('BPAY_NEXT_WORKBENCH_REQUEST_INVALID',400);
  const args={candidate_id:null,client_id:null,channel:'ALL',section:'ALL',search:'',sort:'NAME_ASC',group_key:null,item_id:null,reason_code:null,after:null,limit:kind==='CANDIDATE_GROUPS'?10:50,...input};
  for(const k of ['candidate_id','client_id','item_id'])if(typeof args[k]==='string')args[k]=args[k].toLowerCase();
  if(!shape(args,COMMON)||(kind==='CANDIDATE_GROUPS'&&args.limit>10)||(!['CANDIDATES','ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL'].includes(kind)&&args.sort!=='NAME_ASC')||(kind==='CANDIDATES'&&args.sort.startsWith('PAYMENT_'))||(['ACTION_REQUIRED','BLOCKED','ISSUE_DETAIL'].includes(kind)&&args.sort.startsWith('DEDUCTIONS_'))
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
async function readWorkbenchJson(response,signal){
  const reader=response.body?.getReader();if(!reader)throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
  const chunks=[];let length=0;try{while(true){if(signal?.aborted)throw fail('BPAY_NEXT_WORKBENCH_UNAVAILABLE',503,true);const {done,value}=await reader.read();if(signal?.aborted)throw fail('BPAY_NEXT_WORKBENCH_UNAVAILABLE',503,true);if(done)break;length+=value.byteLength;if(length>BPAY_NEXT_WORKBENCH_LIMITS.responseBytes)throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_TOO_LARGE');chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return parseUniqueJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch(e){void reader.cancel().catch(()=>{});throw e?.code?e:fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');}finally{signal?.removeEventListener('abort',cancel);reader.releaseLock();}
}
function validateWorkbenchResponse(payload,kind,args,actorId=null){
  if(payload?.ok===false){if(!shape(payload,REFUSAL)||payload.reload_required!==(payload.error_code==='BPAY_NEXT_WORKBENCH_CURSOR_STALE'))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');return payload;}
  if(!exact(payload,['ok','kind','workbench_revision','complete','context','rows','next_cursor','page_receipt','affected_candidate_count'])||payload.ok!==true||payload.kind!==kind||!field(payload.workbench_revision,'integer')||typeof payload.complete!=='boolean'||!shape(payload.context,CONTEXT)||payload.context.kind!==kind||payload.context.workbench_revision!==payload.workbench_revision||!Array.isArray(payload.rows)||payload.rows.length>args.limit||(kind==='HEADER'&&payload.rows.length!==1)||(!payload.complete&&payload.rows.length===0)||(kind==='ISSUE_DETAIL'?!['0','1'].includes(payload.affected_candidate_count):payload.affected_candidate_count!==null))throw fail('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
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
  if(!['TEST','LIVE'].includes(environment))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAVAILABLE');
  function assertActor(){if(String(options.currentActorId()||'').toLowerCase()!==actor)throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_ACTOR_CHANGED');}
  async function loadWorkbenchPage(kind,params={}){
    let controller,timer;
    try{
      assertActor();const args=normalizeWorkbenchInput(kind,params);
      if(args.after!==null&&args.after.context.actor_user_id!==actor)throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_CURSOR_STALE',false,true);
      const query=new URLSearchParams({kind});for(const [key,value] of Object.entries(args))if(value!==null)query.set(key,key==='after'?JSON.stringify(value):String(value));
      if(ENCODER.encode(query.toString()).byteLength>32768)throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
      controller=new AbortController();const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAVAILABLE',true));},BPAY_NEXT_WORKBENCH_LIMITS.timeoutMs);});
      const read=async()=>{
        const response=await options.authFetch(options.api('/api/banking/pay/next/workbench-page?'+query.toString()),{method:'GET',signal:controller.signal,auth401Mode:'return',redirect:'error',headers:{accept:'application/json','X-CloudTMS-Banking-Environment':environment}});
        if(!(response instanceof Response))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID');
        if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAVAILABLE',true);}
        const body=await readWorkbenchJson(response,controller.signal);assertActor();
        if(body?.ok===false){
          if(shape(body,REFUSAL)){validateWorkbenchResponse(body,kind,args,actor);throw new WorkbenchReadError(body.error_code,body.retryable,body.reload_required);}
          if(exact(body,['ok','error_code','retryable'])&&body.ok===false&&body.retryable===false&&['BPAY_NEXT_ENVIRONMENT_MISMATCH','BPAY_NEXT_OFFICE_FORBIDDEN'].includes(body.error_code))throw new WorkbenchReadError(body.error_code,false);
          throw new WorkbenchReadError(response.status===401?'BPAY_NEXT_WORKBENCH_UNAUTHORIZED':response.status===403?'BPAY_NEXT_WORKBENCH_FORBIDDEN':'BPAY_NEXT_WORKBENCH_UNAVAILABLE',response.status>=500);
        }
        if(!response.ok)throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAVAILABLE',response.status>=500);
        return validateWorkbenchResponse(body,kind,args,actor);
      };
      return await Promise.race([read(),timeout]);
    }catch(e){const error=e instanceof WorkbenchReadError?e:new WorkbenchReadError(FAILURE_CODES.includes(e?.code)?e.code:'BPAY_NEXT_WORKBENCH_UNAVAILABLE',e?.retryable===true,e?.reload===true);try{if(typeof options.onReadFailure==='function'&&String(options.currentActorId()||'').toLowerCase()===actor)options.onReadFailure(error);}catch{}throw error;}
    finally{if(timer!==undefined)clearTimeout(timer);}
  }
  return Object.freeze({loadWorkbenchPage});
}
function loadWorkbenchPage(kind,params={},options){return createWorkbenchClient(options).loadWorkbenchPage(kind,params);}
// WB13 consumes maintained facts only. No tick, estimate or mutation owner.
const ISSUE_REASONS=Object.freeze({
 DATA_UNAVAILABLE:'Required pay data is missing',SEGMENT_CREDIT_ATTRIBUTION_UNAVAILABLE:'Original shift credit needs review',
 APPROVAL_WITHDRAWN:'Missing approval — approval withdrawn',MISSING_APPROVAL:'Awaiting authorisation',APPLY_PENDING:'Pay facts are being updated',
 PAY_QUERY_UNAVAILABLE:'Pay Query status unavailable',PAY_QUERY_OPEN:'Pay Query open',AWAITING_REAUTHORISATION:'Paid — awaiting re-authorisation',
 ORIGIN_UNAUTHORISED_WAIT:'Waiting for re-authorisation — recovery paused',CASE_REVIEW_REQUIRED:'Finance case needs review',RECOVERY_MANAGED:'Recovery managed through the finance case',
 IN_PREPARATION:'Included in Draft preparation',CASE_PAUSED:'Finance case paused',RESERVED:'Reserved in an existing payment',SNOOZED:'Snoozed'
});
function issueReason(row){
 if(row.reason_code==='PAY_ON_HOLD')return 'Pay on hold'+(row.pay_hold_reason?': '+row.pay_hold_reason:'');
 if(['RATE_RESOLUTION_REQUIRED','GROSS_RESOLUTION_REQUIRED'].includes(row.reason_code)){
  const direction=row.source_pay_channel&&row.target_pay_channel&&row.source_pay_channel!==row.target_pay_channel
    ?(row.source_pay_channel==='PAYE'?'PAYE>UMBR':'UMBR>PAYE'):null;
  return (direction?'Pay channel changed '+direction:'Pay value needs a decision')+' - choose the '+(row.reason_code==='RATE_RESOLUTION_REQUIRED'?'rate':'amount');
 }
 if(row.reason_code==='FUTURE_WEEK')return 'Not payable until '+(row.eligible_from_date?row.eligible_from_date.split('-').reverse().join('/'):'date unavailable');
 return ISSUE_REASONS[row.reason_code]??'Pay evidence needs review';
}
function issueAmounts(row){
 const netStage=['NET_ADD','NET_DEDUCT'].includes(row.payroll_stage);
 const values=[];const add=(label,value)=>{if(value!==null)values.push({label,value});};
 if(!row.amount_known||row.nominal_source_ex_vat===null)values.push({label:'Current amount',value:null});
 else add(row.portion_kind==='RESERVED'?(netStage?'Frozen NET adjustment reservation':'Frozen reservation'):row.direction==='DEDUCTION'?(netStage?'Available NET deduction balance':'Available deduction balance'):row.reason_code==='AWAITING_REAUTHORISATION'?'Last approved SOURCE amount':netStage?'Current NET adjustment':'Unresolved SOURCE amount',row.nominal_source_ex_vat);
 if(row.portion_kind!=='RESERVED')add(netStage?'Last approved NET adjustment':'Last approved SOURCE gross',row.approved_source_ex_vat);
 if(row.direction==='DEDUCTION')add('Outstanding deduction balance',row.deduction_balance_source_ex_vat);
 if(row.portion_kind!=='RESERVED'&&row.active_reserved_source_ex_vat!==null&&!/^0(?:\.0+)?$/.test(row.active_reserved_source_ex_vat))add(netStage?'Reserved NET adjustment':'Reserved SOURCE gross',row.active_reserved_source_ex_vat);
 if(row.recovery_source_ex_vat!==null&&!/^0(?:\.0+)?$/.test(row.recovery_source_ex_vat))add('Recovery difference',row.recovery_source_ex_vat);
 return values;
}
function mountIssueLists(options){
 if(!record(options)||!options.host?.ownerDocument||typeof options.openIssue!=='function'||typeof options.ownerReady!=='function'||!field(options.actorId?.toLowerCase(),'uuid')||typeof options.currentActorId!=='function')throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
 const client=options.client??createWorkbenchClient(options),doc=options.host.ownerDocument,host=options.host;
 if(typeof client.loadWorkbenchPage!=='function')throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
 const base={candidate_id:null,client_id:null,channel:'ALL',...(options.scope??{})};
 if(!exact(base,['candidate_id','client_id','channel'])||!field(base.candidate_id,'uuid?')||!field(base.client_id,'uuid?')||!field(base.channel,'scopeChannel'))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
 let kind='ACTION_REQUIRED',search='',sort='NAME_ASC',bundle=null,busy=false,error=null,closed=false,generation=0,after=null,back=[],backTrimmed=false,pending=null;
 const el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const root=el('section');root.className='bpay-next-issue-lists';root.setAttribute('aria-label','Payments needing attention');
 const tabs=el('div');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Payment issues');
 const panel=el('div');panel.setAttribute('role','tabpanel');const form=el('form'),searchLabel=el('label','Search Candidate, TMS or Timesheet reference'),input=el('input');input.type='search';input.maxLength=200;input.setAttribute('data-next-focus-key','issue-search');searchLabel.append(input);
 const selectLabel=el('label','Sort'),select=el('select');select.setAttribute('data-next-focus-key','issue-sort');
 for(const [key,label] of [['NAME','Candidate'],['PAYMENT','Payment'],['AMOUNT','Amount']])for(const dir of ['ASC','DESC']){const option=el('option',label+' '+(dir==='ASC'?'ascending':'descending'));option.value=key+'_'+dir;select.append(option);}selectLabel.append(select);
 const apply=el('button','Search');apply.type='submit';form.append(searchLabel,selectLabel,apply);
 const alert=el('p');alert.setAttribute('role','alert');alert.className='bpay-next-alert';const retry=el('button','Try again');retry.type='button';
 const reload=el('button','Reload changed list');reload.type='button';const content=el('div');content.className='bpay-next-issue-table';content.tabIndex=0;
 const footer=el('p');footer.setAttribute('aria-live','polite');const previous=el('button','Previous'),next=el('button','Next'),first=el('button','First page');previous.type=next.type=first.type='button';
 const status=el('p');status.setAttribute('aria-live','polite');root.append(tabs,panel);panel.append(form,alert,retry,reload,status,content,footer,first,previous,next);host.append(root);
 const buttons={};for(const [value,label] of [['ACTION_REQUIRED','Action Required'],['BLOCKED','Blocked for Pay']]){const b=el('button',label);b.type='button';b.setAttribute('role','tab');b.id='bpay-next-issue-tab-'+value;b.setAttribute('aria-controls','bpay-next-issue-panel');b.addEventListener('click',()=>{if(value===kind||busy)return;kind=value;after=null;back=[];void load(null,{reset:true});});buttons[value]=b;tabs.append(b);}panel.id='bpay-next-issue-panel';
 function notify(available,context=null){try{options.onAvailability?.({available,context});}catch{}}
 function current(){return !closed&&root.isConnected&&options.ownerReady()===true&&String(options.currentActorId?.()??'').toLowerCase()===String(options.actorId??'').toLowerCase();}
 function sameRevision(a,b){return ['agency_id','actor_user_id','owner_epoch','official_pay_date','workbench_revision','adoption_revision'].every(k=>a[k]===b[k]);}
 function render(){
  const available=Boolean(bundle&&!busy&&!error&&current());for(const [value,b] of Object.entries(buttons)){const count=available?bundle[value].rows[0].item_count:null;b.textContent=(value==='ACTION_REQUIRED'?'Action Required':'Blocked for Pay')+(count===null?' — unavailable':' ('+count+')');b.setAttribute('aria-selected',String(value===kind));b.tabIndex=value===kind?0:-1;b.disabled=busy;}
  panel.setAttribute('aria-labelledby',buttons[kind].id);panel.setAttribute('aria-busy',String(busy));apply.disabled=select.disabled=input.disabled=busy;
  alert.hidden=!error;alert.textContent=error?.message??'';retry.hidden=!error||error.reloadRequired===true;retry.disabled=busy||!current();reload.hidden=!error?.reloadRequired;reload.disabled=busy||!current();
  status.textContent=busy?'Loading current pay facts…':kind==='ACTION_REQUIRED'?'Payments that need a decision before they can be included.':'';
  content.replaceChildren();if(!available){content.append(el('p',busy?'Loading…':'Current rows and amounts are unavailable.'));footer.textContent='Section counts are unavailable.';first.disabled=previous.disabled=next.disabled=true;return;}
  const page=bundle.page;const table=el('table'),thead=el('thead'),tr=el('tr'),tbody=el('tbody');
  for(const label of ['Candidate','Payment',kind==='BLOCKED'?'Why it is blocked':'Decision needed','Amount','Actions']){const th=el('th',label);th.scope='col';tr.append(th);}thead.append(tr);
  for(const row of page.rows){const r=el('tr');r.dataset.itemId=row.item_id;r.tabIndex=0;r.setAttribute('data-next-focus-key','issue:'+row.item_id);const cells=[el('td'),el('td'),el('td',issueReason(row)),el('td'),el('td')];
   cells[0].append(el('span',row.candidate_display_name??'Candidate name unavailable'));if(row.candidate_reference)cells[0].append(el('small',' · '+row.candidate_reference));
   cells[1].append(el('span',row.timesheet_reference??(row.case_id?'Finance case':'Payment evidence')));cells[1].append(el('small',' · '+row.component_key));
   for(const value of issueAmounts(row))cells[3].append(el('div',value.label+': '+(value.value===null?'Unavailable':'£'+value.value)));
   const open=el('button','Open item');open.type='button';open.setAttribute('data-next-focus-key','issue-open:'+row.item_id);
   const show=async()=>{if(!current()||busy||error||!bundle)return;const captured=bundle;try{await options.openIssue(Object.freeze({item_id:row.item_id,group_key:row.group_key,candidate_id:row.candidate_id,work_id:row.work_id,case_id:row.case_id,case_component_id:row.case_component_id,physical_timesheet_id:row.physical_timesheet_id,reason_code:row.reason_code,context:captured.page.context}),Object.freeze({scope:{...base},kind,search,sort,after,scrollTop:content.scrollTop}));}catch(e){if(current()&&bundle===captured){error=e instanceof WorkbenchReadError?e:new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAVAILABLE',true);notify(false);render();}}};
   open.addEventListener('click',event=>{event.stopPropagation();void show();});r.addEventListener('dblclick',event=>{if(event.target.closest('button,input,select,a'))return;void show();});r.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target===r){event.preventDefault();void show();}});cells[4].append(open);r.append(...cells);tbody.append(r);
  }
  if(page.rows.length===0){const row=el('tr'),cell=el('td',kind==='ACTION_REQUIRED'?'No payments need a decision in this view.':'No payments are blocked in this view.');cell.colSpan=5;row.append(cell);tbody.append(row);}table.append(thead,tbody);content.append(table);
  footer.textContent=page.rows.length+' shown · '+bundle[kind].rows[0].item_count+' items in this section'+(search?' before search':'')+'. Gross values are SOURCE ex-VAT; NET adjustments are labelled separately. Estimates and cash are separate.';
  first.disabled=after===null;previous.disabled=back.length===0;next.disabled=page.complete;if(backTrimmed)footer.textContent+=' Earlier page history was discarded; First page returns to the start.';
 }
 async function load(cursor,{reset=false,previousPage=false,expectedRevision=null,scrollTop=null}={}){
  if(busy||!current())return;const ticket=++generation,scroll=scrollTop??content.scrollTop,readKind=kind,readBase={...base},focusKey=doc.activeElement?.getAttribute?.('data-next-focus-key');busy=true;error=null;notify(false);render();
  const request={...readBase,search,sort,after:cursor,limit:100};pending={cursor,reset,previousPage,expectedRevision,scrollTop:scroll,bundle};
  try{
   const page=await client.loadWorkbenchPage(readKind,request);if(ticket!==generation||!current())return;
   const action=await client.loadWorkbenchPage('HEADER',{...readBase,section:'ACTION'});if(ticket!==generation||!current())return;
   const blocked=await client.loadWorkbenchPage('HEADER',{...readBase,section:'BLOCKED'});
   if(ticket!==generation||!current())return;
   if(!sameRevision(page.context,action.context)||!sameRevision(page.context,blocked.context)||expectedRevision!==null&&page.workbench_revision!==expectedRevision)throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_CURSOR_STALE',false,true);
   if(!reset&&cursor!==after&&!previousPage){const candidate=[...back,after];while(ENCODER.encode(JSON.stringify(candidate)).byteLength>32768){candidate.shift();backTrimmed=true;}back=candidate;}
   if(previousPage)back.pop();if(reset){back=[];backTrimmed=false;}after=cursor;bundle=Object.freeze({page,ACTION_REQUIRED:action,BLOCKED:blocked});error=null;notify(true,page.context);
  }catch(e){if(ticket===generation&&current()){error=e instanceof WorkbenchReadError?e:new WorkbenchReadError('BPAY_NEXT_WORKBENCH_UNAVAILABLE',true);notify(false);}}
  finally{if(ticket===generation&&!closed){busy=false;if(!current()){closed=true;bundle=null;root.remove();return;}render();content.scrollTop=scroll;if(focusKey){const target=Array.from(root.querySelectorAll('[data-next-focus-key]')).find(n=>n.getAttribute('data-next-focus-key')===focusKey);target?.focus();}}}
 }
 form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;search=input.value.trim();sort=select.value;after=null;back=[];void load(null,{reset:true});});
 select.addEventListener('change',()=>{if(busy)return;search=input.value.trim();sort=select.value;after=null;back=[];void load(null,{reset:true});});
 first.addEventListener('click',()=>{if(!busy)void load(null,{reset:true});});
 previous.addEventListener('click',()=>{if(back.length&&!busy)void load(back.at(-1),{previousPage:true});});next.addEventListener('click',()=>{if(bundle&&!bundle.page.complete&&!busy)void load(bundle.page.next_cursor);});
 retry.addEventListener('click',()=>{if(!busy)void load(pending?.cursor??after,pending??{});});reload.addEventListener('click',()=>{after=null;back=[];void load(null,{reset:true});});
 tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const other=kind==='ACTION_REQUIRED'?'BLOCKED':'ACTION_REQUIRED';buttons[event.key==='Home'?'ACTION_REQUIRED':event.key==='End'?'BLOCKED':other].focus();});
 render();void load(null,{reset:true});
 return Object.freeze({
  setScope(scope){if(!current())throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_ACTOR_CHANGED');if(!exact(scope,['candidate_id','client_id','channel'])||!field(scope.candidate_id,'uuid?')||!field(scope.client_id,'uuid?')||!field(scope.channel,'scopeChannel'))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');Object.assign(base,scope);generation++;busy=false;bundle=null;after=null;back=[];notify(false);void load(null,{reset:true});},
  adoptAffected(receipt){if(!current())throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_ACTOR_CHANGED');if(!field(receipt?.workbench_revision,'integer'))throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');generation++;busy=false;bundle=null;after=null;back=[];notify(false);void load(null,{reset:true,expectedRevision:receipt.workbench_revision});},
  invalidate(){if(!current())throw new WorkbenchReadError('BPAY_NEXT_WORKBENCH_ACTOR_CHANGED');generation++;busy=false;bundle=null;error=new WorkbenchReadError('BPAY_NEXT_WORKBENCH_PROJECTION_NOT_CURRENT',true);notify(false);render();},
  close(){const active=current();closed=true;generation++;bundle=null;if(active)notify(false);root.remove();},
  snapshot(){return Object.freeze({kind,search,sort,scope:{...base},context:bundle?.page.context??null,available:Boolean(bundle&&!busy&&!error&&current())});}
 });
}
return Object.freeze({createWorkbenchClient,loadWorkbenchPage,WorkbenchReadError,BPAY_NEXT_WORKBENCH_PAGE_INPUTS,ROWS,mountIssueLists,issueReason,issueAmounts});

});
