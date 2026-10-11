/* WB-39 reader/management actions. FC-02 is the only list renderer. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextSnoozeActions=api;})(typeof globalThis==='object'?globalThis:this,function(){'use strict';

const SR_UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const SR_VERSION=/^(?:0|[1-9]\d{0,18})$/;
const SR_DATE=/^\d{4}-\d{2}-\d{2}$/;
const SR_TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+]00:00)$/;
const srRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const srExact=(v,keys)=>srRecord(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const srEqual=(a,b)=>JSON.stringify(srCanonical(a))===JSON.stringify(srCanonical(b));
function srCanonical(v){if(Array.isArray(v))return v.map(srCanonical);if(srRecord(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,srCanonical(v[k])]));return v;}
function srFail(code='BPAY_NEXT_WORKBENCH_RESPONSE_INVALID'){throw Object.assign(Error(code),{code});}
function srUuid(v,optional=false){return optional&&v===null||typeof v==='string'&&SR_UUID.test(v);}
function srVersion(v,positive=false){return typeof v==='string'&&SR_VERSION.test(v)&&BigInt(v)<=9223372036854775807n&&(!positive||BigInt(v)>0n);}
const SR_INPUT=['candidate_id','client_id','scope_kind','filter','snooze_id','sort','after','limit'];
function normalizeSnoozesInput(params={}){
 if(!srRecord(params)||Object.keys(params).some(k=>!SR_INPUT.includes(k)))srFail('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
 const a={candidate_id:null,client_id:null,scope_kind:'ALL',filter:'ACTIVE',snooze_id:null,sort:'CREATED_DESC',after:null,limit:20,...params};
 if(!['candidate_id','client_id','snooze_id'].every(k=>srUuid(a[k],true))||!['ALL','WORK','CASE'].includes(a.scope_kind)
  ||!['ACTIVE','INDEFINITE','DATED'].includes(a.filter)||!['CREATED_ASC','CREATED_DESC'].includes(a.sort)
  ||!Number.isSafeInteger(a.limit)||a.limit<1||a.limit>50||a.snooze_id!==null&&a.after!==null)srFail('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
 if(a.after!==null&&(!srExact(a.after,['context','key'])||!srContext(a.after.context)||!srKey(a.after.key)
  ||!srEqual(a.after.context.scope,srScope(a))))srFail('BPAY_NEXT_WORKBENCH_REQUEST_INVALID');
 return a;
}
function srScope(a){return Object.fromEntries(SR_INPUT.filter(k=>!['after','limit'].includes(k)).map(k=>[k,a[k]]));}
function srKey(k){return srExact(k,['created_at_utc','id'])&&srUuid(k.id)&&typeof k.created_at_utc==='string'&&SR_TIME.test(k.created_at_utc)&&Number.isFinite(Date.parse(k.created_at_utc));}
function srContext(c){return srExact(c,['actor_user_id','agency_id','owner_epoch','workbench_revision','adoption_revision','control_cut','scope'])
 &&srUuid(c.actor_user_id)&&srUuid(c.agency_id)&&srVersion(c.owner_epoch,true)&&['workbench_revision','adoption_revision','control_cut'].every(k=>srVersion(c[k]))
 &&srExact(c.scope,SR_INPUT.filter(k=>!['after','limit'].includes(k)));}
const SR_ROW=['snooze_id','candidate_id','work_id','expected_revision_id','revision_id','physical_timesheet_id','case_id','case_component_id','case_kind','case_component_revision','scope_kind','scope_identity','segment_key','component_key','snooze_kind','version','control_sequence','active','until_date','note','created_at_utc','candidate_display_name','candidate_reference','client_id','client_display_name','timesheet_reference','week_ending_date','label','work_date','shift_start_local','shift_end_local','can_amend','can_unsnooze','amend_unavailable_reason'];
function validateSnoozesRow(r){
 if(!srExact(r,SR_ROW)||!['snooze_id','candidate_id'].every(k=>srUuid(r[k]))||!['work_id','expected_revision_id','revision_id','physical_timesheet_id','case_id','case_component_id','client_id'].every(k=>srUuid(r[k],true))
  ||!srVersion(r.version,true)||!srVersion(r.control_sequence,true)||typeof r.active!=='boolean'||typeof r.can_amend!=='boolean'||r.can_unsnooze!==r.active||!r.active&&r.can_amend
  ||!['WHOLE_TIMESHEET','SEGMENT','EXPENSE_LINE','EXPENSES_ALL','CASE'].includes(r.scope_kind)
  ||!['DO_NOT_PAY','BLOCKED_TIMESHEET','TIMESHEET_PAYMENT','OVERPAYMENT_RECOVERY','PAYMENT_ADVANCE_REPAYMENT','MANUAL_DEBT_RECOVERY'].includes(r.snooze_kind)
  ||!['until_date','week_ending_date','work_date'].every(k=>r[k]===null||typeof r[k]==='string'&&SR_DATE.test(r[k])&&Number.isFinite(Date.parse(r[k])))
  ||!srKey({created_at_utc:r.created_at_utc,id:r.snooze_id})||typeof r.note!=='string'||r.note.length>500
  ||typeof r.scope_identity!=='string'||r.scope_identity.length<1||r.scope_identity.length>500
  ||typeof r.label!=='string'||r.label.length<1||r.label.length>256
  ||typeof r.candidate_display_name!=='string'||new TextEncoder().encode(r.candidate_display_name).byteLength>8192
  ||!['candidate_reference','client_display_name','timesheet_reference','shift_start_local','shift_end_local','component_key','segment_key'].every(k=>r[k]===null||typeof r[k]==='string'&&new TextEncoder().encode(r[k]).byteLength<=8192)
  ||r.amend_unavailable_reason!==(r.can_amend?null:'PAYMENT_CHANGED'))srFail();
 const isCase=r.scope_kind==='CASE';
 if(isCase!==(r.work_id===null)||isCase!==(r.case_id!==null)||isCase!==(r.case_component_id!==null)
  ||isCase!==(r.expected_revision_id===null)||isCase!==(r.physical_timesheet_id===null)
  ||isCase&&(!srVersion(r.case_component_revision,true)||!['LOAN','ADVANCE','MANUAL_DEBT','OVERPAYMENT'].includes(r.case_kind)
   ||!((['LOAN','ADVANCE'].includes(r.case_kind)&&r.snooze_kind==='PAYMENT_ADVANCE_REPAYMENT')||(r.case_kind==='MANUAL_DEBT'&&r.snooze_kind==='MANUAL_DEBT_RECOVERY')||(r.case_kind==='OVERPAYMENT'&&r.snooze_kind==='OVERPAYMENT_RECOVERY')))
  ||!isCase&&(r.case_kind!==null||r.case_component_revision!==null||!['DO_NOT_PAY','BLOCKED_TIMESHEET','TIMESHEET_PAYMENT'].includes(r.snooze_kind))
  ||r.scope_kind==='SEGMENT'&&(r.segment_key===null||r.component_key===null)
  ||r.scope_kind==='EXPENSE_LINE'&&r.component_key===null
  ||r.can_amend&&!isCase&&r.revision_id===null)srFail();
 return r;
}
function validateSnoozesResponse(p,args,actor){
 const a=normalizeSnoozesInput(args);
 if(!srExact(p,['ok','kind','context','rows','complete','next_cursor'])||p.ok!==true||p.kind!=='SNOOZES'||!srContext(p.context)
  ||p.context.actor_user_id!==actor||!srEqual(p.context.scope,srScope(a))||a.after!==null&&!srEqual(a.after.context,p.context)
  ||!Array.isArray(p.rows)||p.rows.length>a.limit||typeof p.complete!=='boolean'||!p.complete&&p.rows.length===0)srFail();
 let last=a.after?.key??null;const seen=new Set();
 for(const row of p.rows){validateSnoozesRow(row);if(!row.active&&a.snooze_id===null||seen.has(row.snooze_id)||a.snooze_id!==null&&row.snooze_id!==a.snooze_id||a.candidate_id!==null&&row.candidate_id!==a.candidate_id
   ||a.client_id!==null&&row.client_id!==a.client_id||a.scope_kind!=='ALL'&&(a.scope_kind==='CASE')!==(row.scope_kind==='CASE')
   ||a.filter!=='ACTIVE'&&(a.filter==='INDEFINITE')!==(row.until_date===null))srFail();seen.add(row.snooze_id);
  const key={created_at_utc:row.created_at_utc,id:row.snooze_id};if(last){const t=Date.parse(key.created_at_utc),prior=Date.parse(last.created_at_utc);
   // Compare the full native microsecond timestamp, not a truncated JS millisecond.
   const native=v=>v.replace(/[+]00:00$/,'Z').replace(/(?:\.(\d+))?Z$/,(_,n)=>'.'+(n??'').padEnd(6,'0')+'Z');const n=native(key.created_at_utc),old=native(last.created_at_utc);
   if(a.sort==='CREATED_DESC'?n>old||n===old&&key.id<=last.id:n<old||n===old&&key.id<=last.id)srFail();}
  last=key;
 }
 if(!srEqual(p.next_cursor,p.complete?null:{context:p.context,key:last}))srFail();return p;
}

function create(options){
 if(!options||typeof options.loadSnoozes!=='function'||typeof options.showReadWindow!=='function')srFail('BPAY_NEXT_SNOOZE_REQUEST_INVALID');
 const win=options.window??options.document?.defaultView,snooze=win?.CloudTMSBpayNextSnooze;if(!snooze)srFail('BPAY_NEXT_SNOOZE_REQUEST_INVALID');
 async function point(id){if(!srUuid(id))srFail('BPAY_NEXT_SNOOZE_REQUEST_INVALID');const args=normalizeSnoozesInput({snooze_id:id,limit:1});
  const p=validateSnoozesResponse(await options.loadSnoozes(args),args,String(options.actorId).toLowerCase());
  if(p.rows.length!==1)throw Error('This snooze has changed. Refresh and try again.');return {row:p.rows[0],context:p.context};}
 function subject(row){const scope={candidate_id:row.candidate_id,scope_kind:row.scope_kind,snooze_kind:row.snooze_kind,
   ...(row.scope_kind==='CASE'?{case_id:row.case_id,case_component_id:row.case_component_id}:{work_id:row.work_id,expected_revision_id:row.revision_id??row.expected_revision_id}),
   ...(row.scope_kind==='SEGMENT'?{segment_key:row.segment_key}:{}),...(row.scope_kind==='EXPENSE_LINE'?{component_key:row.component_key}:{})};
  const uk=d=>d.split('-').reverse().join('/'),detail=[];
  if(row.week_ending_date)detail.push('w/e '+uk(row.week_ending_date));
  if(row.work_date){const day=new Date(row.work_date+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'});detail.push(day+' '+uk(row.work_date));}
  if(row.shift_start_local!==null||row.shift_end_local!==null)detail.push((row.shift_start_local??'—')+'–'+(row.shift_end_local??'—'));
  return {scope,candidateLabel:row.candidate_display_name,label:row.label,clientLabel:row.client_display_name,dateLabel:detail.join(' · ')||null};}
 function openSnoozeFor(scope){
  if(!scope||scope.snooze_id)srFail('BPAY_NEXT_SNOOZE_REQUEST_INVALID');
  const s=scope.scope??scope;if(s.scope_kind==='CASE'&&!['PAYMENT_ADVANCE_REPAYMENT','MANUAL_DEBT_RECOVERY'].includes(s.snooze_kind))srFail('BPAY_NEXT_SNOOZE_CASE_AUTHORITY_MISMATCH');
  return snooze.open(options,{...scope,scope:s});
 }
 async function amendSnooze(id){const p=await point(id);if(!p.row.can_amend)throw Error('This payment has changed. You can remove its snooze.');return snooze.open(options,subject(p.row));}
 async function unsnooze(id){const p=await point(id);return snooze.open(options,{...subject(p.row),clear:true,management:{
  agency_id:p.context.agency_id,module_epoch:p.context.owner_epoch,candidate_id:p.row.candidate_id,work_id:p.row.work_id,
  scope_kind:p.row.scope_kind,scope_identity:p.row.scope_identity,snooze_id:p.row.snooze_id,expected_version:p.row.version,
  active:p.row.active,until_date:p.row.until_date,note:p.row.note}});}
 return Object.freeze({openSnoozeFor,amendSnooze,unsnooze});
}

return Object.freeze({create,normalizeSnoozesInput,validateSnoozesRow,validateSnoozesResponse});
});
