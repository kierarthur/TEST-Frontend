/* WB-38 shared NEXT Snooze window. Native context and original commands only.
 * No pricing, claim authorisation, producer, polling or typing-time requests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextSnooze=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 /* BEGIN NATIVE SNOOZE CONTRACT */
/** WB-36 finite W2 snooze action contract. WB-19 owns transport, active admin,
 * module admission and the single public dispatcher. No new route or retry.
 */
const BPAY_NEXT_SNOOZE_ACTIONS=Object.freeze([
  'SNOOZE_CHECK','SNOOZE_CONTEXT','SNOOZE_WARNING_ACK_ISSUE','SNOOZE_SET','SNOOZE_CLEAR'
]);
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const VERSION=/^(?:0|[1-9]\d{0,18})$/;
const MAX_VERSION=9223372036854775807n;
const KINDS=new Set(['DO_NOT_PAY','BLOCKED_TIMESHEET','TIMESHEET_PAYMENT',
  'OVERPAYMENT_RECOVERY','PAYMENT_ADVANCE_REPAYMENT','MANUAL_DEBT_RECOVERY']);
const SCOPES=new Set(['WHOLE_TIMESHEET','SEGMENT','EXPENSE_LINE','EXPENSES_ALL','CASE']);
const OBJECT=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const invalid=()=>{const e=new Error('BPAY_NEXT_SNOOZE_REQUEST_INVALID');e.code=e.message;e.status=400;throw e;};
const version=value=>typeof value==='string'&&VERSION.test(value)&&BigInt(value)<=MAX_VERSION;
const uuid=value=>typeof value==='string'&&UUID.test(value);
const text=(value,max)=>typeof value==='string'&&!value.includes('\0')&&[...value].length<=max;
function date(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-'))return false;
  const parsed=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
/** Validate before W2 forwards/journals the exact normalised body. Stable keys
 * retain case, even when they look like UUIDs; only typed UUID fields normalise.
 */
function normaliseBpayNextSnoozeAction(action,args){
  if(!BPAY_NEXT_SNOOZE_ACTIONS.includes(action)||!OBJECT(args)
    ||new TextEncoder().encode(JSON.stringify(args)).byteLength>4096)invalid();
  const allowed=new Set(action==='SNOOZE_CLEAR'
    ?['request_id','snooze_id','candidate_id','expected_version']
    :['request_id','candidate_id','work_id','expected_revision_id','physical_timesheet_id','physical_timesheet_version','scope_kind','segment_key','component_key',
      'case_id','case_component_id','snooze_kind','until_date','indefinite','note','expected_version',
      'worker_pay_basis','acknowledgement_token','phase','expected_case_revision']);
  if(Object.keys(args).some(key=>!allowed.has(key))||!uuid(args.candidate_id))invalid();
  const mutation=!['SNOOZE_CHECK','SNOOZE_CONTEXT'].includes(action);
  if(mutation&&(!uuid(args.request_id)||!version(args.expected_version)))invalid();
  if(action==='SNOOZE_CLEAR'){
    if(!uuid(args.snooze_id)||Object.keys(args).length!==4)invalid();
  }else{
    const kind=typeof args.snooze_kind==='string'?args.snooze_kind.trim().toUpperCase():'';
    const canonical=kind==='BLOCKED'?'BLOCKED_TIMESHEET':kind==='LOAN_REPAYMENT'?'PAYMENT_ADVANCE_REPAYMENT':kind;
    const opening=!mutation&&args.phase==='PRE_OPEN';
    if(!SCOPES.has(args.scope_kind)||!KINDS.has(canonical)||typeof args.indefinite!=='boolean'
      ||(!opening&&(args.indefinite!==(args.until_date==null)||(!args.indefinite&&!date(args.until_date))))
      ||(opening&&args.until_date!=null&&!date(args.until_date))
      ||(args.note!==undefined&&!text(args.note,500))
      ||(args.phase!==undefined&&!['PRE_OPEN','PRE_SAVE'].includes(args.phase)))invalid();
    if(args.scope_kind==='CASE'){
      if(!uuid(args.case_id)||!uuid(args.case_component_id)||args.work_id!==undefined
        ||args.expected_revision_id!==undefined||args.physical_timesheet_id!==undefined||args.physical_timesheet_version!==undefined||args.segment_key!==undefined||args.component_key!==undefined
        ||!['OVERPAYMENT_RECOVERY','PAYMENT_ADVANCE_REPAYMENT','MANUAL_DEBT_RECOVERY'].includes(canonical)
        ||(mutation&&!version(args.expected_case_revision)))invalid();
    }else{
      const physicalOpening=opening&&uuid(args.physical_timesheet_id)&&version(args.physical_timesheet_version)&&args.physical_timesheet_version!=='0'&&BigInt(args.physical_timesheet_version)<=2147483647n&&args.scope_kind==='WHOLE_TIMESHEET'
        &&args.work_id===undefined&&args.expected_revision_id===undefined;
      if((!physicalOpening&&(!uuid(args.work_id)||!uuid(args.expected_revision_id)))||(args.physical_timesheet_id!==undefined||args.physical_timesheet_version!==undefined)&&!physicalOpening||args.case_id!==undefined
        ||args.case_component_id!==undefined||args.expected_case_revision!==undefined
        ||!['DO_NOT_PAY','BLOCKED_TIMESHEET','TIMESHEET_PAYMENT'].includes(canonical))invalid();
      if(args.scope_kind==='SEGMENT'){
        if(!text(args.segment_key,245)||args.segment_key.length===0||args.segment_key.trim()!==args.segment_key
          ||args.component_key!==undefined)invalid();
      }else if(args.segment_key!==undefined)invalid();
      if(args.scope_kind==='EXPENSE_LINE'){
        if(!text(args.component_key,256)||args.component_key.length===0||canonical!=='DO_NOT_PAY')invalid();
      }else if(args.component_key!==undefined)invalid();
      if(args.scope_kind==='EXPENSES_ALL'&&canonical!=='DO_NOT_PAY')invalid();
    }
    if(mutation&&(typeof args.worker_pay_basis!=='string'||!/^[0-9a-f]{64}$/.test(args.worker_pay_basis)
      ||(action==='SNOOZE_SET'&&args.phase==='PRE_OPEN')))invalid();
    if(args.acknowledgement_token!==undefined&&!uuid(args.acknowledgement_token))invalid();
    args={...args,snooze_kind:canonical};
  }
  return Object.freeze(Object.fromEntries(Object.entries(args).map(([key,value])=>[
    key,key.endsWith('_id')||key==='acknowledgement_token'?typeof value==='string'?value.toLowerCase():value:value
  ])));
}

const CONTEXT_FIELDS=['agency_id','candidate_id','work_id','expected_revision_id','physical_timesheet_id','physical_timesheet_version','scope_kind','scope_identity','segment_key','approved_segment_id','component_key','expense_approved_line_id','case_id','case_component_id','case_kind','snooze_kind','worker_pay_basis','snooze_id','expected_version','financial_revision','stale_control','module_epoch','control_cut','expense_count','conflict','indefinite_wins','until_date','note','active','business_date','warning_context'];
const exact=(v,keys)=>OBJECT(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const responseInvalid=()=>{throw Object.assign(new Error('BPAY_NEXT_WORKBENCH_RESPONSE_INVALID'),{code:'BPAY_NEXT_WORKBENCH_RESPONSE_INVALID',status:503});};
function validateBpayNextSnoozeContext(value,args,acknowledgement=false){
  const keys=acknowledgement?[...CONTEXT_FIELDS,'acknowledgement_token','acknowledgement_expires_at_utc']:CONTEXT_FIELDS;
  if(!exact(value,keys)||!uuid(value.agency_id)||value.candidate_id!==args.candidate_id||value.scope_kind!==args.scope_kind
    ||(!args.physical_timesheet_id&&(value.work_id!==(args.work_id??null)||value.expected_revision_id!==(args.expected_revision_id??null)))
    ||args.physical_timesheet_id&&(value.physical_timesheet_id!==args.physical_timesheet_id||!uuid(value.work_id)||!uuid(value.expected_revision_id))
    ||args.physical_timesheet_version&&value.physical_timesheet_version!==args.physical_timesheet_version
    ||value.case_id!==(args.case_id??null)||value.case_component_id!==(args.case_component_id??null)
    ||value.segment_key!==(args.segment_key??null)||args.scope_kind==='EXPENSE_LINE'&&value.component_key!==args.component_key
    ||!SCOPES.has(value.scope_kind)||value.snooze_kind!==args.snooze_kind||!text(value.scope_identity,600)
    ||!version(value.expected_version)||!version(value.financial_revision)||!version(value.module_epoch)||value.module_epoch==='0'||!version(value.control_cut)||!version(value.expense_count)
    ||typeof value.worker_pay_basis!=='string'||!/^[0-9a-f]{64}$/.test(value.worker_pay_basis)
    ||!date(value.business_date)||value.until_date!==null&&!date(value.until_date)||!text(value.note,500)
    ||['active','stale_control','indefinite_wins'].some(k=>typeof value[k]!=='boolean')
    ||!['SEGMENT_SNOOZES_ALREADY_EXIST','WHOLE_TIMESHEET_ALREADY_SNOOZED',null].includes(value.conflict))responseInvalid();
  for(const k of ['physical_timesheet_id','approved_segment_id','expense_approved_line_id','snooze_id'])if(value[k]!==null&&!uuid(value[k]))responseInvalid();
  if(value.segment_key!==null&&!text(value.segment_key,245)||value.component_key!==null&&!text(value.component_key,256)
    ||![null,'OVERPAYMENT','LOAN','ADVANCE','MANUAL_DEBT'].includes(value.case_kind))responseInvalid();
  if(value.physical_timesheet_version!==null&&(!version(value.physical_timesheet_version)||value.physical_timesheet_version==='0'))responseInvalid();
  if(value.active!==(value.snooze_id!==null)||value.active===(value.expected_version==='0'))responseInvalid();
  const warning=value.warning_context;
  if(!exact(warning,['phase','until_date','business_date','next_official_pay_date','configuration_fingerprint','warning_code','warning_required'])
    ||!['PRE_OPEN','PRE_SAVE'].includes(warning.phase)||!date(warning.business_date)||!date(warning.next_official_pay_date)
    ||warning.until_date!==null&&!date(warning.until_date)||!text(warning.configuration_fingerprint,256)
    ||![null,'SNOOZE_DATE_BEFORE_NEXT_PAY_RUN','SNOOZE_INCLUDES_NEXT_PAY_RUN'].includes(warning.warning_code)
    ||typeof warning.warning_required!=='boolean'||warning.warning_required!==(warning.warning_code!==null)
    ||acknowledgement&&(!uuid(value.acknowledgement_token)||typeof value.acknowledgement_expires_at_utc!=='string'
      ||value.acknowledgement_expires_at_utc.length>40||!Number.isFinite(Date.parse(value.acknowledgement_expires_at_utc))))responseInvalid();
  return value;
}
function validateBpayNextSnoozeReceipt(receipt,action,args){
  if(!exact(receipt,['request_id','candidate_id','received','replay','result'])||receipt.request_id!==args.request_id
    ||receipt.candidate_id!==args.candidate_id||typeof receipt.received!=='boolean'||typeof receipt.replay!=='boolean'
    ||!receipt.received&&(receipt.replay||receipt.result!==null))responseInvalid();
  if(receipt.received){const r=receipt.result;
    if(action==='SNOOZE_WARNING_ACK_ISSUE')validateBpayNextSnoozeContext(r,args,true);
    else if(!exact(r,['snooze_id','version','active','control_sequence','indefinite_wins'])||!uuid(r.snooze_id)
      ||!version(r.version)||r.version==='0'||BigInt(r.version)!==BigInt(args.expected_version)+1n||!version(r.control_sequence)||r.control_sequence==='0'
      ||typeof r.indefinite_wins!=='boolean'||r.active!==(action==='SNOOZE_SET')
      ||action==='SNOOZE_CLEAR'&&r.snooze_id!==args.snooze_id)responseInvalid();
  }
  return receipt;
}
const BPAY_NEXT_SNOOZE_REFUSALS=Object.freeze([
  'BPAY_NEXT_SNOOZE_REQUEST_INVALID','BPAY_NEXT_SNOOZE_FORBIDDEN','BPAY_NEXT_MODULE_NOT_ACTIVE',
  'BPAY_NEXT_SNOOZE_ACTION_INVALID','BPAY_NEXT_SNOOZE_CLEAR_ARGS_INVALID','BPAY_NEXT_SNOOZE_CANDIDATE_MISMATCH',
  'BPAY_NEXT_SNOOZE_CASE_AUTHORITY_MISMATCH','BPAY_NEXT_SNOOZE_EXPENSE_IDENTITY_INVALID','BPAY_NEXT_SNOOZE_EXPENSE_SCOPE_UNSUPPORTED',
  'BPAY_NEXT_SNOOZE_FINANCIAL_VERSION_STALE','BPAY_NEXT_SNOOZE_FOREIGN_SCOPE_FIELD','BPAY_NEXT_SNOOZE_REVISION_STALE',
  'BPAY_NEXT_SNOOZE_REQUEST_REPLAY_MISMATCH','BPAY_NEXT_SNOOZE_SCOPE_OR_VALUE_INVALID','BPAY_NEXT_SNOOZE_SET_REQUIRES_PRE_SAVE',
  'BPAY_NEXT_SNOOZE_VERSION_REQUIRED','BPAY_NEXT_SNOOZE_VERSION_STALE','BPAY_NEXT_SNOOZE_WARNING_ACK_REQUIRED_OR_STALE',
  'BPAY_NEXT_SNOOZE_WORK_AUTHORITY_MISMATCH','BPAY_NEXT_SNOOZE_WORKER_BASIS_UNAVAILABLE',
  'SNOOZE_DATE_IN_PAST','SNOOZE_SEGMENT_SCOPE_UNSUPPORTED','SNOOZE_SEGMENT_STALE',
  'SEGMENT_SNOOZES_ALREADY_EXIST','WHOLE_TIMESHEET_ALREADY_SNOOZED',
  'BPAY_NEXT_SNOOZE_MANY_REQUEST_INVALID','BPAY_NEXT_SNOOZE_MANY_FIRST_PAGE_REQUIRED',
  'BPAY_NEXT_SNOOZE_MANY_RETRY_NOT_FAILED','BPAY_NEXT_SNOOZE_MANY_CURSOR_INVALID'
]);
function normaliseBpayNextSnoozeMany(action,args){
  const keys=['request_id','candidate_id','work_id','expected_revision_id','worker_pay_basis','control_cut','until_date','indefinite','note','warning_context','page_no','after_line_no','retry_line_nos'];
  if(!['SNOOZE_SET_MANY','SNOOZE_CLEAR_MANY'].includes(action)||!exact(args,keys)||new TextEncoder().encode(JSON.stringify(args)).byteLength>24576
    ||['request_id','candidate_id','work_id','expected_revision_id'].some(k=>!uuid(args[k]))
    ||typeof args.worker_pay_basis!=='string'||!/^[0-9a-f]{64}$/.test(args.worker_pay_basis)||!version(args.control_cut)
    ||typeof args.indefinite!=='boolean'||args.indefinite!==(args.until_date===null)||args.until_date!==null&&!date(args.until_date)
    ||!text(args.note,500)||!version(args.page_no)||args.page_no==='0'
    ||args.after_line_no!==null&&(!version(args.after_line_no)||BigInt(args.after_line_no)>2147483647n)
    ||!Array.isArray(args.retry_line_nos)||args.retry_line_nos.length>100||new Set(args.retry_line_nos).size!==args.retry_line_nos.length
    ||args.retry_line_nos.some(v=>!version(v)||v==='0'||BigInt(v)>2147483647n)
    ||args.retry_line_nos.length>0&&args.after_line_no!==null
    ||action==='SNOOZE_CLEAR_MANY'&&(args.until_date!==null||!args.indefinite||args.note!==''))invalid();
  const w=args.warning_context;
  if(!exact(w,['phase','until_date','business_date','next_official_pay_date','configuration_fingerprint','warning_code','warning_required'])
    ||w.phase!=='PRE_SAVE'||w.until_date!==args.until_date||!date(w.business_date)||!date(w.next_official_pay_date)
    ||!text(w.configuration_fingerprint,256)||![null,'SNOOZE_DATE_BEFORE_NEXT_PAY_RUN','SNOOZE_INCLUDES_NEXT_PAY_RUN'].includes(w.warning_code)
    ||typeof w.warning_required!=='boolean'||w.warning_required!==(w.warning_code!==null))invalid();
  return Object.freeze({...args,...Object.fromEntries(['request_id','candidate_id','work_id','expected_revision_id'].map(k=>[k,args[k].toLowerCase()])),retry_line_nos:Object.freeze([...args.retry_line_nos]),warning_context:Object.freeze({...w})});
}
function validateBpayNextSnoozeManyReceipt(r,args){
  if(!exact(r,['request_id','candidate_id','page_no','received','replay','result'])||r.request_id!==args.request_id||r.candidate_id!==args.candidate_id
    ||r.page_no!==args.page_no||typeof r.received!=='boolean'||typeof r.replay!=='boolean'||!r.received&&(r.replay||r.result!==null))responseInvalid();
  if(r.received){const v=r.result;
    if(!exact(v,['rows','complete','next_after_line_no','total_count','successful_count','failed_count'])||!Array.isArray(v.rows)||v.rows.length===0||v.rows.length>100
      ||typeof v.complete!=='boolean'||['total_count','successful_count','failed_count'].some(k=>!version(v[k]))||v.total_count==='0'
      ||BigInt(v.successful_count)+BigInt(v.failed_count)>BigInt(v.total_count)
      ||v.complete!==(v.next_after_line_no===null)||v.next_after_line_no!==null&&(!version(v.next_after_line_no)||v.next_after_line_no==='0')
      ||args.retry_line_nos.length>0&&(!v.complete||v.rows.length!==args.retry_line_nos.length)
      ||args.retry_line_nos.length===0&&v.complete&&BigInt(v.successful_count)+BigInt(v.failed_count)!==BigInt(v.total_count))responseInvalid();
    let previous=0n;for(const row of v.rows){if(!exact(row,['line_no','approved_line_id','component_key','label','amount','successful','reason_code','whole_timesheet_snoozed'])
      ||!version(row.line_no)||BigInt(row.line_no)<=previous||!uuid(row.approved_line_id)||!text(row.component_key,256)||!text(row.label,1024)
      ||typeof row.amount!=='string'||!/^\-?(?:0|[1-9]\d{0,15})\.\d{2}$/.test(row.amount)||typeof row.successful!=='boolean'
      ||typeof row.whole_timesheet_snoozed!=='boolean'||row.reason_code!==null&&(typeof row.reason_code!=='string'||!/^[A-Z][A-Z0-9_]{0,240}$/.test(row.reason_code))
      ||row.successful!==(row.reason_code===null)||args.retry_line_nos.length>0&&!args.retry_line_nos.includes(row.line_no)
      ||args.retry_line_nos.length===0&&BigInt(row.line_no)<=BigInt(args.after_line_no??'0'))responseInvalid();previous=BigInt(row.line_no);}
    if(!v.complete&&v.next_after_line_no!==v.rows.at(-1)?.line_no)responseInvalid();
  }
  return r;
}

 /* END NATIVE SNOOZE CONTRACT */
 const encoder=new TextEncoder();
 function copy(code){
  if(code==='SNOOZE_DATE_IN_PAST')return 'Choose today or a later date.';
  if(code==='WHOLE_TIMESHEET_ALREADY_SNOOZED')return 'The whole Timesheet is already snoozed.';
  if(code==='SEGMENT_SNOOZES_ALREADY_EXIST')return 'Unsnooze the shifts before snoozing the whole Timesheet.';
  if(code==='BPAY_NEXT_SNOOZE_WARNING_ACK_REQUIRED_OR_STALE')return 'The warning changed; check the snooze again.';
  if(code==='SNOOZE_SEGMENT_SCOPE_UNSUPPORTED')return 'This Timesheet can only be snoozed as a whole.';
  if(code==='BPAY_NEXT_SNOOZE_EXPENSE_SCOPE_UNSUPPORTED')return 'There are no expenses to snooze.';
  if(code==='BPAY_NEXT_SNOOZE_FORBIDDEN'||code==='BPAY_NEXT_MODULE_NOT_ACTIVE')return 'This payment is unavailable.';
  if(code?.includes('STALE')||code?.includes('VERSION'))return 'The payment changed; refresh and try again.';
  return 'Could not update the snooze; try again.';
 }
 function seed(row,scope){
  if(!OBJECT(row)||!uuid(row.candidate_id))invalid();
  if(scope==='CASE'){
   const kind=['LOAN','ADVANCE'].includes(row.case_kind)?'PAYMENT_ADVANCE_REPAYMENT':row.case_kind==='OVERPAYMENT'?'OVERPAYMENT_RECOVERY':row.case_kind==='MANUAL_DEBT'?'MANUAL_DEBT_RECOVERY':null;
   if(!kind)invalid();return {candidate_id:row.candidate_id,scope_kind:'CASE',case_id:row.case_id,case_component_id:row.case_component_id,snooze_kind:kind};
  }
  const value={candidate_id:row.candidate_id,work_id:row.work_id,expected_revision_id:row.revision_id??row.current_revision_id??row.selection_basis?.expected_revision_id,
    scope_kind:scope,snooze_kind:['EXPENSE_LINE','EXPENSES_ALL'].includes(scope)?'DO_NOT_PAY':'TIMESHEET_PAYMENT'};
  if(scope==='SEGMENT')value.segment_key=row.segment_key;
  if(scope==='EXPENSE_LINE')value.component_key=row.component_key;
  return value;
 }
 function displayDate(value){return value?.split('-').reverse().join('/')??'—';}
 function eligible(value){const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return displayDate(d.toISOString().slice(0,10));}
 async function json(response,maximum,signal){
  const reader=response.body?.getReader();if(!reader)throw Error('Could not read the result.');let size=0;const parts=[];
  try{while(true){if(signal.aborted)throw Error('Request ended.');const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maximum)throw Error('Result too large.');parts.push(part.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch(e){void reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 }
 function open(options,subject){
  const doc=options.document,win=options.window??doc.defaultView,actor=String(options.actorId??'').toLowerCase();
  if(!doc||!uuid(actor)||typeof options.showReadWindow!=='function'||typeof options.authFetch!=='function'||typeof options.api!=='function')invalid();
  const base=normaliseBpayNextSnoozeAction('SNOOZE_CHECK',{...subject.scope,phase:'PRE_OPEN',until_date:null,indefinite:false,note:''});
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(label,fn,primary=false)=>{const b=el('button',label,'btn'+(primary?' primary':''));b.type='button';b.addEventListener('click',fn);return b;};
  const body=el('section',undefined,'bpay-next-snooze-window'),fact=el('div',undefined,'bpay-next-snooze-subject'),form=el('div',undefined,'bpay-next-snooze-form');
  const heading=el('h2'),consequence=el('p'),indefinite=el('input'),dateInput=el('input'),note=el('textarea'),result=el('p','','ws-notice'),footer=el('div',undefined,'bpay-next-window-actions');
  const warning=el('div',undefined,'bpay-next-snooze-warning'),warningText=el('p'),consentLabel=el('label'),consent=el('input');consent.type='checkbox';consentLabel.append(consent,doc.createTextNode(' I understand'));warning.append(warningText,consentLabel);warning.hidden=true;
  warningText.setAttribute('data-next-live-copy','');consequence.setAttribute('data-next-live-copy','');
  indefinite.type='checkbox';dateInput.type='text';dateInput.inputMode='numeric';dateInput.placeholder='DD/MM/YYYY';dateInput.autocomplete='off';note.rows=2;note.maxLength=500;note.placeholder='Optional';
  const indefiniteLabel=el('label'),dateLabel=el('label','Snooze until'),dateHint=el('small'),dateError=el('small',undefined,'bpay-next-snooze-field-error'),noteLabel=el('label','Note');
  dateError.setAttribute('role','status');indefiniteLabel.append(indefinite,doc.createTextNode(' Snooze indefinitely'));dateLabel.append(dateInput,dateHint,dateError);noteLabel.append(note);
  for(const [control,key,label]of [[indefinite,'snooze-indefinite','Snooze indefinitely'],[dateInput,'snooze-until','Snooze until'],[note,'snooze-note','Note'],[consent,'snooze-consent','I understand']]){control.setAttribute('data-next-focus-key',key);control.setAttribute('aria-label',label);}
  const subjectLine=el('div',undefined,'bpay-next-snooze-subject-line');subjectLine.append(el('strong',[subject.candidateLabel,subject.label??'Timesheet payment'].filter(Boolean).join(' · ')));fact.append(subjectLine);
  const subjectDetail=[subject.clientLabel,subject.dateLabel].filter(Boolean);if(subjectDetail.length)fact.append(el('span',subjectDetail.join(' · ')));
  if(subject.amount!==undefined){const value=el('strong',win.CloudTMSBpayNextWorkbench.displayPounds(subject.amount));value.setAttribute('data-next-formatted-money','');subjectLine.append(value);}
  result.setAttribute('role','status');result.setAttribute('data-next-live-copy','');form.append(indefiniteLabel,dateLabel,noteLabel);body.append(heading,consequence,warning,result,fact,form);
  let frame,context=null,busy=true,closed=false,accepted=null,original='',pending=null,journalKey=null,namespace=null,progress=null,pageBlocks=[],resultList=null,question=null,warningCheck=null,warningInput=null;
  let finish;const done=new Promise(resolve=>{finish=resolve;});
  const current=()=>{try{return !closed&&frame?.alive()===true&&options.ownerReady()===true&&String(options.currentActorId()??'').toLowerCase()===actor;}catch{return false;}};
  const live=()=>current()&&frame.active(),storage=options.storage??win.localStorage,snapshot=()=>JSON.stringify([indefinite.checked,dateInput.value,note.value]);
  const cancel=button('Cancel',()=>void frame.close()),cancelSnooze=button('Cancel snooze',()=>void clear()),apply=button('Apply snooze',()=>void save(),true);footer.append(cancel,cancelSnooze,apply);
  cancelSnooze.classList.add('btn-warn');cancelSnooze.setAttribute('data-next-destructive','');
  function inputDate(){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateInput.value.trim());return m?m[3]+'-'+m[2]+'-'+m[1]:null;}
  function render(){const ready=current()&&!busy&&context!==null;body.setAttribute('aria-busy',String(busy));
   for(const n of [indefinite,dateInput,note,consent])n.disabled=!ready||pending!==null||progress!==null;dateInput.disabled=dateInput.disabled||indefinite.checked;
   cancel.hidden=progress!==null||!subject.clear&&!subject.many;cancel.textContent=subject.clear?'Keep snoozed':'Cancel';cancel.disabled=busy;
   resultList?.querySelectorAll('button').forEach(control=>{control.disabled=!ready||pending!==null;});
   const invalidDate=!subject.clear&&!indefinite.checked&&(!date(inputDate())||context&&inputDate()<context.business_date);dateInput.setAttribute('aria-invalid',String(invalidDate&&dateInput.value!==''));dateError.textContent=invalidDate&&dateInput.value!==''?(date(inputDate())?'Choose today or a later date.':'Enter a date as DD/MM/YYYY.'):'';dateError.hidden=!dateError.textContent;
   cancelSnooze.hidden=!context?.active||subject.clear||subject.many===true||progress!==null;cancelSnooze.disabled=!ready||pending!==null;apply.disabled=!ready||!pending&&!progress&&(invalidDate||!subject.clear&&context?.conflict!==null||subject.clear&&!subject.many&&!context?.active||warningCheck!==null&&!consent.checked);
   apply.hidden=progress?.complete===true&&pending===null;footer.hidden=apply.hidden;
   apply.textContent=pending?'Try again':progress?(progress.complete?'Close':'Continue'):subject.clear?(subject.many?'Unsnooze all':'Unsnooze'):subject.many?'Snooze all':context?.active?'Save changes':'Apply snooze';
   result.hidden=!result.textContent;result.classList.toggle('ws-notice--danger',result.getAttribute('role')==='alert');result.classList.toggle('bpay-next-snooze-partial',progress!==null&&progress.summary.failed_count!=='0');
   heading.hidden=progress!==null||!subject.clear&&!subject.many;consequence.hidden=heading.hidden;form.hidden=subject.clear||progress!==null;
   if(context){heading.textContent=subject.many?(subject.clear?'Unsnooze all expenses?':'Snooze all '+BigInt(context.expense_count).toLocaleString('en-GB')+' expenses?'):'Unsnooze this payment?';
    if(progress&&live()){const panel=doc.getElementById('modal');panel.classList.remove('bpay-next-confirmation');panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','modalTitle');}
    consequence.textContent=subject.clear?'These payments return to Banking Pay for the next Draft.':indefinite.checked?'These expenses and mileage will be snoozed indefinitely.':'These expenses and mileage will be snoozed until the date below.';
    if(live())doc.getElementById('modalTitle').textContent=progress?'Expense results':subject.clear?(subject.many?'Unsnooze all expenses':'Unsnooze'):subject.many?'Snooze all expenses':context.active?'Amend snooze':subject.scope.scope_kind==='SEGMENT'?'Snooze shift':subject.scope.scope_kind==='WHOLE_TIMESHEET'?'Snooze Timesheet':subject.scope.scope_kind==='EXPENSE_LINE'?'Snooze expense':'Snooze payment';}
  }
  function notice(text,error=false){result.textContent=text;result.setAttribute('role',error?'alert':'status');render();}
  async function request(path,init,maximum=131072){
   if(!current())throw Error('Payment unavailable.');const controller=new AbortController(),timer=win.setTimeout(()=>controller.abort(),8000);
   try{const response=await options.authFetch(options.api(path),{...init,redirect:'error',auth401Mode:'return',signal:controller.signal});const value=await json(response,maximum,controller.signal);
    if(!current())throw Error('Payment unavailable.');return {response,value};}finally{win.clearTimeout(timer);controller.abort();}
  }
  async function check(args){const normalized=normaliseBpayNextSnoozeAction('SNOOZE_CHECK',args),query=new URLSearchParams({kind:'SNOOZE_CHECK',snooze:JSON.stringify(normalized)});
   const {response,value}=await request('/api/banking/pay/next/workbench-page?'+query,{method:'GET'},16384);
   if(!response.ok||value?.ok!==true)throw Object.assign(Error(copy(value?.error_code)),{code:value?.error_code});
   if(!exact(value,['ok','kind','context'])||value.kind!=='SNOOZE_CHECK')responseInvalid();return validateBpayNextSnoozeContext(value.context,normalized);
  }
  function store(){const value=JSON.stringify({version:2,namespace,pending,progress});if(encoder.encode(value).byteLength>32768)invalid();storage.setItem(journalKey,value);}
  function keep(body){const bytes=JSON.stringify(body);if(encoder.encode(bytes).byteLength>32768)invalid();const old=pending;pending=bytes;try{store();}catch(e){pending=old;throw e;}}
  function clearPending(){pending=null;if(progress)store();else storage.removeItem(journalKey);}
  function boundArgs(action,args,retained=false){const value=action.endsWith('_MANY')?normaliseBpayNextSnoozeMany(action,args):normaliseBpayNextSnoozeAction(action,args);
   if(value.candidate_id!==context.candidate_id||action.endsWith('_MANY')&&(value.work_id!==context.work_id||!retained&&value.expected_revision_id!==context.expected_revision_id)
    ||action!=='SNOOZE_CLEAR'&&!action.endsWith('_MANY')&&(value.work_id??null)!==context.work_id
    ||action==='SNOOZE_CLEAR'&&!retained&&value.snooze_id!==context.snooze_id
    ||action!=='SNOOZE_CLEAR'&&!action.endsWith('_MANY')&&(value.scope_kind!==context.scope_kind||value.snooze_kind!==context.snooze_kind
      ||(value.case_id??null)!==context.case_id||(value.case_component_id??null)!==context.case_component_id
      ||(value.segment_key??null)!==context.segment_key||value.scope_kind==='EXPENSE_LINE'&&value.component_key!==context.component_key))invalid();return value;
  }
  async function send(action,args,readback){const {response,value}=await request('/api/banking/pay/next/workbench-command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,readback,args})});
   if(!response.ok||value?.ok!==true){if(!readback&&exact(value,['ok','error_code','retryable','outcome_unknown'])&&value.outcome_unknown===false)clearPending();throw Object.assign(Error(copy(value?.error_code)),{code:value?.error_code});}
   if(!exact(value,['ok','action','receipt'])||value.action!==action)responseInvalid();return action.endsWith('_MANY')?validateBpayNextSnoozeManyReceipt(value.receipt,args):validateBpayNextSnoozeReceipt(value.receipt,action,args);
  }
  async function execute(action,args,retainedScope=false){const retained=pending!==null;if(retained){const body=JSON.parse(pending);action=body.action;args=body.args;}else{args=boundArgs(action,args,retainedScope);keep({action,readback:false,args});}
   let receipt=retained?await send(action,args,true):null;if(!receipt?.received)receipt=await send(action,args,false);if(!receipt.received)responseInvalid();return {action,args,receipt};
  }
  function confirm(title,text,label){if(!live())return Promise.resolve(false);return new Promise(resolve=>{let settled=false;const content=el('div'),actions=el('div',undefined,'bpay-next-window-actions');content.append(el('h2',title),el('p',text));
   const dismiss=button(title==='Cancel snooze?'?'Keep snooze':'Cancel',()=>void question.close()),yes=button(label,()=>{settled=true;void question.close().then(()=>resolve(current()));},true);yes.classList.add('btn-warn');yes.setAttribute('data-next-destructive','');actions.append(dismiss,yes);
   question=options.showReadWindow({title,content,footer:actions,small:true,confirmation:true,canFocus:current,onDismiss:()=>{if(!settled)resolve(false);question=null;}});
  });}
  function proposal(clearing=false){let until=null;if(!clearing&&!indefinite.checked){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateInput.value.trim());until=m?m[3]+'-'+m[2]+'-'+m[1]:null;if(!date(until))throw Error('Enter a date as DD/MM/YYYY.');}
   return {candidate_id:context.candidate_id,...(context.work_id?{work_id:context.work_id,expected_revision_id:context.expected_revision_id}:{case_id:context.case_id,case_component_id:context.case_component_id}),
    scope_kind:context.scope_kind,snooze_kind:context.snooze_kind,...(context.scope_kind==='SEGMENT'?{segment_key:context.segment_key}:{}),...(context.scope_kind==='EXPENSE_LINE'?{component_key:context.component_key}:{}),
    phase:'PRE_SAVE',until_date:until,indefinite:clearing||indefinite.checked,note:clearing?'':note.value};
  }
  function compare(checked){if(checked.worker_pay_basis!==context.worker_pay_basis||checked.expected_version!==context.expected_version||checked.module_epoch!==context.module_epoch)throw Object.assign(Error('The payment changed; refresh and try again.'),{code:'BPAY_NEXT_SNOOZE_FINANCIAL_VERSION_STALE'});}
  function understands(checked,args){if(!checked.warning_context.warning_required)return true;
   const unchanged=warningCheck!==null&&warningInput===JSON.stringify(args)&&JSON.stringify(warningCheck.warning_context)===JSON.stringify(checked.warning_context);
   if(unchanged&&consent.checked)return true;warningCheck=checked;warningInput=JSON.stringify(args);consent.checked=false;warning.hidden=false;
   warningText.textContent=checked.warning_context.warning_code==='SNOOZE_DATE_BEFORE_NEXT_PAY_RUN'?'This payment may be eligible again before the next Draft.':'This snooze includes the next Draft.';notice('');return false;
  }
  function message(action,args){return action.includes('CLEAR')?'Snooze removed.':args.until_date?'Moved to Waiting. Eligible again on '+eligible(args.until_date)+'.':'Indefinitely snoozed. Manage it in Payment Advances / Snoozes.';}
  async function adopted(value){clearPending();accepted={ok:true,next:true,action:value.action.includes('CLEAR')?'clear':'set',result:value.receipt.result,candidate_id:context.candidate_id,work_id:context.work_id,message:message(value.action,value.args)};original=snapshot();busy=false;await frame.close();}
  async function clear(){if(!live()||busy||!context?.active||pending)return;if(!await confirm('Cancel snooze?','This payment returns to Banking Pay for the next Draft.','Cancel snooze'))return;
   busy=true;notice('Saving…');try{await adopted(await execute('SNOOZE_CLEAR',{request_id:win.crypto.randomUUID(),candidate_id:context.candidate_id,snooze_id:context.snooze_id,expected_version:context.expected_version}));}catch(e){if(current())notice(pending?'Could not confirm the result; try again.':copy(e.code),true);}finally{busy=false;if(current())render();}
  }
  async function save(){if(!live()||busy)return;
   if(progress?.complete&&!pending){void frame.close();return;}busy=true;let pageAdopted=false;notice('Checking…');try{
    if(pending){let value=await execute();if(value.action.endsWith('_MANY')){await receiveBulk(value);pageAdopted=true;return;}
     if(value.action==='SNOOZE_WARNING_ACK_ISSUE'){clearPending();value=await execute('SNOOZE_SET',{...value.args,request_id:win.crypto.randomUUID(),acknowledgement_token:value.receipt.result.acknowledgement_token});}await adopted(value);return;}
    if(progress){await receiveBulk(await execute(progress.action,progress.next,true));pageAdopted=true;return;}
    if(subject.clear&&!subject.many){await adopted(await execute('SNOOZE_CLEAR',{request_id:win.crypto.randomUUID(),candidate_id:context.candidate_id,snooze_id:context.snooze_id,expected_version:context.expected_version}));return;}
    const args=proposal(subject.clear===true),checked=await check(args);if(!current())return;compare(checked);if(!subject.clear&&!understands(checked,args))return;
    if(subject.many){const cut=warningCheck??checked;const many={request_id:win.crypto.randomUUID(),candidate_id:cut.candidate_id,work_id:cut.work_id,expected_revision_id:cut.expected_revision_id,worker_pay_basis:cut.worker_pay_basis,control_cut:cut.control_cut,
      until_date:args.until_date,indefinite:args.indefinite,note:args.note,warning_context:cut.warning_context,page_no:'1',after_line_no:null,retry_line_nos:[]};await receiveBulk(await execute(subject.clear?'SNOOZE_CLEAR_MANY':'SNOOZE_SET_MANY',many));pageAdopted=true;return;}
    let write={...args,expected_version:checked.expected_version,worker_pay_basis:checked.worker_pay_basis};if(checked.scope_kind==='CASE')write.expected_case_revision=checked.financial_revision;
    if(checked.warning_context.warning_required){const ack=await execute('SNOOZE_WARNING_ACK_ISSUE',{...write,request_id:win.crypto.randomUUID()});clearPending();write.acknowledgement_token=ack.receipt.result.acknowledgement_token;}
    await adopted(await execute('SNOOZE_SET',{...write,request_id:win.crypto.randomUUID()}));
   }catch(e){if(current())notice(pending?'Could not confirm the result; try again.':e.code?copy(e.code):e.message,true);}finally{busy=false;if(current()){render();if(pageAdopted)advanceBulk();}}
  }
  // The visible, explicitly chosen operation advances finite native pages; no other work is drained.
  function pageKey(request,page){return journalKey+'.'+request+'.'+page;}
  function rememberPage(value){const body=JSON.stringify({action:value.action,readback:false,args:value.args});if(encoder.encode(body).byteLength>32768)invalid();storage.setItem(pageKey(value.args.request_id,value.args.page_no),body);}
  function latestRows(rows){return rows.map(row=>{const saved=storage.getItem(pageKey(progress.next.request_id,'line-'+row.line_no));if(saved===null)return row;const value=JSON.parse(saved);
   boundArgs(progress.action,value.args,true);validateBpayNextSnoozeManyReceipt(value.receipt,value.args);if(value.args.request_id!==progress.next.request_id||value.args.retry_line_nos.length!==1||value.args.retry_line_nos[0]!==row.line_no)invalid();const latest=value.receipt.result.rows[0];if(latest.approved_line_id!==row.approved_line_id)invalid();return latest;});}
  async function receiveBulk(value){const r=value.receipt.result,isRetry=value.args.retry_line_nos.length>0;rememberPage(value);
   if(isRetry)for(const row of r.rows)storage.setItem(pageKey(value.args.request_id,'line-'+row.line_no),JSON.stringify({args:value.args,receipt:value.receipt}));
   const next={...value.args,page_no:(BigInt(value.args.page_no)+1n).toString(),after_line_no:isRetry?progress.next.after_line_no:r.next_after_line_no,retry_line_nos:[]};
   const updated={action:value.action,next,complete:isRetry?progress.complete:r.complete,summary:{total_count:r.total_count,successful_count:r.successful_count,failed_count:r.failed_count}};
   const previous=progress,oldPending=pending;progress=updated;pending=null;try{store();}catch(e){progress=previous;pending=oldPending;throw e;}
   if(isRetry){for(const page of pageBlocks)page.rows=page.rows.map(row=>r.rows.find(n=>n.line_no===row.line_no)??row);}else{pageBlocks.push({page_no:value.args.page_no,rows:r.rows});if(pageBlocks.length>3)pageBlocks.shift();}
   warning.hidden=true;ensureResults();drawBulk();original=snapshot();accepted={ok:true,next:true,candidate_id:context.candidate_id,work_id:context.work_id,action:value.action.includes('CLEAR')?'clear':'set',result:r,message:bulkMessage(progress)};
   if(progress.complete&&r.failed_count==='0'){storage.removeItem(journalKey);busy=false;await frame.close();}
  }
  function ensureResults(){if(resultList)return;resultList=el('div',undefined,'bpay-next-snooze-results');resultList.tabIndex=0;resultList.setAttribute('role','region');resultList.setAttribute('aria-label','Expense results');body.append(resultList);
   resultList.addEventListener('scroll',()=>{if(!live()||busy)return;if(resultList.scrollTop<40&&pageBlocks[0]?.page_no!=='1')void oldPage('back');else if(resultList.scrollHeight-resultList.scrollTop-resultList.clientHeight<100)void oldPage('forward');});
   resultList.addEventListener('wheel',e=>{if(e.deltaY<0&&resultList.scrollTop<40&&!busy&&live()&&pageBlocks[0]?.page_no!=='1'){e.preventDefault();void oldPage('back');}},{passive:false});
  }
  function bulkMessage(value){const r=value.summary;return BigInt(r.successful_count).toLocaleString('en-GB')+' of '+BigInt(r.total_count).toLocaleString('en-GB')+(value.action==='SNOOZE_CLEAR_MANY'?' unsnoozed':' snoozed')+(r.failed_count!=='0'?'; '+BigInt(r.failed_count).toLocaleString('en-GB')+' could not be updated':'')+'.'+(value.action==='SNOOZE_SET_MANY'&&r.successful_count!=='0'?(value.next.until_date?' Eligible again on '+eligible(value.next.until_date)+'.':' Manage it in Payment Advances / Snoozes.'):'');}
  function drawBulk(){if(!resultList||!progress)return;const scroll=resultList.scrollTop;resultList.replaceChildren();const table=el('table',undefined,'ctms-universal-table ctms-universal-card-table'),head=el('thead'),tr=el('tr'),rows=el('tbody');
   for(const text of ['Expense','Amount','Result']){const th=el('th',text,text==='Amount'?'bpay-next-snooze-money':undefined);th.scope='col';tr.append(th);}head.append(tr);table.append(head,rows);
   for(const page of pageBlocks)for(const row of page.rows){const r=el('tr'),label=el('td',row.label),amount=el('td',win.CloudTMSBpayNextWorkbench.displayPounds(row.amount),'bpay-next-snooze-money'),state=el('td');label.dataset.label='Expense';amount.dataset.label='Amount';state.dataset.label='Result';amount.setAttribute('data-next-formatted-money','');
    state.append(el('span',row.successful?(progress.action==='SNOOZE_CLEAR_MANY'?'Unsnoozed':'Snoozed'):copy(row.reason_code),row.successful?'bpay-next-snooze-success':'bpay-next-snooze-failure'));
    if(row.whole_timesheet_snoozed)state.append(el('small','Whole Timesheet snoozed'));if(!row.successful){const retry=button('Retry',()=>void retryBulk([row.line_no]));retry.disabled=busy||pending!==null;state.append(retry);}r.append(label,amount,state);rows.append(r);}
   resultList.append(table);resultList.scrollTop=scroll;const r=progress.summary;notice(BigInt(r.successful_count).toLocaleString('en-GB')+' of '+BigInt(r.total_count).toLocaleString('en-GB')+(progress.action==='SNOOZE_CLEAR_MANY'?' unsnoozed.':' snoozed.')+(r.failed_count!=='0'?' '+BigInt(r.failed_count).toLocaleString('en-GB')+' could not be updated.':''));
  }
  function advanceBulk(){if(live()&&!busy&&progress&&!progress.complete&&!pending)win.queueMicrotask(()=>{if(live()&&!busy&&!progress.complete&&!pending)void save();});}
  async function retryBulk(ids){if(!live()||busy||pending||!progress)return;busy=true;let pageAdopted=false;render();try{await receiveBulk(await execute(progress.action,{...progress.next,after_line_no:null,retry_line_nos:ids},true));pageAdopted=true;}catch(e){if(current())notice(pending?'Could not confirm the result; try again.':copy(e.code),true);}finally{busy=false;if(current()){render();if(pageAdopted)advanceBulk();}}}
  async function oldPage(direction){if(!live()||busy||!progress||!pageBlocks.length)return;busy=true;render();const anchor=direction==='back'?pageBlocks[0]:pageBlocks.at(-1);let page=BigInt(anchor.page_no)+(direction==='back'?-1n:1n);
   try{while(page>0n&&page<BigInt(progress.next.page_no)){const saved=storage.getItem(pageKey(progress.next.request_id,page.toString()));if(saved===null)break;const body=JSON.parse(saved);if(!exact(body,['action','readback','args'])||body.action!==progress.action||body.readback!==false)invalid();const args=boundArgs(body.action,body.args,true);
     if(args.request_id!==progress.next.request_id||args.page_no!==page.toString())invalid();if(args.retry_line_nos.length){page+=direction==='back'?-1n:1n;continue;}
     const receipt=await send(body.action,args,true);if(!receipt.received)responseInvalid();const block={page_no:args.page_no,rows:latestRows(receipt.result.rows)};
     if(direction==='back'){pageBlocks.unshift(block);if(pageBlocks.length>3)pageBlocks.pop();}else{pageBlocks.push(block);if(pageBlocks.length>3)pageBlocks.shift();}drawBulk();if(direction==='back')resultList.scrollTop=Math.max(1,resultList.scrollHeight/3);break;}
   }catch{if(current())notice('Could not load the results; try again.',true);}finally{busy=false;if(current())render();}
  }
  frame=options.showReadWindow({title:subject.many?'Snooze all expenses':subject.clear?'Unsnooze':'Snooze payment',content:body,footer,small:true,confirmation:subject.many===true||subject.clear===true,canFocus:current,
   beforeClose:async()=>{if(busy)return false;if(!accepted&&context&&snapshot()!==original&&!pending)return await confirm('Discard changes?','Your snooze changes have not been saved.','Discard changes');return true;},
   onDismiss:()=>{closed=true;void(async()=>{if(accepted){try{await options.onAccepted?.(accepted);}catch{accepted={...accepted,message:'Saved; could not refresh.'};}win.dispatchEvent(new win.CustomEvent('cloudtms:bpay-next:snooze-changed',{detail:{candidate_id:context.candidate_id,work_id:context.work_id,message:accepted.message}}));}finish(accepted);})();}});
  for(const control of [indefinite,dateInput,note])control.addEventListener('input',()=>{warning.hidden=true;warningCheck=null;warningInput=null;consent.checked=false;render();});consent.addEventListener('input',render);render();notice('Loading…');
  void(async()=>{try{context=Object.freeze(await check(base));if(!current())return;namespace={environment:'TEST',agency_id:context.agency_id,owner_epoch:context.module_epoch,actor_user_id:actor,scope_kind:context.scope_kind,scope_identity:context.scope_identity};journalKey='cloudtms.bpay-next.snooze.v1.'+JSON.stringify(namespace);
    const saved=storage.getItem(journalKey);if(saved!==null){const entry=JSON.parse(saved);if(!exact(entry,['version','namespace','pending','progress'])||entry.version!==2||JSON.stringify(entry.namespace)!==JSON.stringify(namespace))invalid();
     if(entry.pending!==null){if(typeof entry.pending!=='string'||encoder.encode(entry.pending).byteLength>32768)invalid();const retained=JSON.parse(entry.pending);if(!exact(retained,['action','readback','args'])||retained.readback!==false||retained.action==='SNOOZE_CHECK')invalid();boundArgs(retained.action,retained.args,true);pending=entry.pending;}
     if(entry.progress!==null){const p=entry.progress;if(!exact(p,['action','next','complete','summary'])||!['SNOOZE_SET_MANY','SNOOZE_CLEAR_MANY'].includes(p.action)||typeof p.complete!=='boolean'||!exact(p.summary,['total_count','successful_count','failed_count'])||Object.values(p.summary).some(v=>!version(v))||BigInt(p.summary.successful_count)+BigInt(p.summary.failed_count)>BigInt(p.summary.total_count))invalid();boundArgs(p.action,p.next,true);progress=p;}
    }
    const inputs=pending?JSON.parse(pending).args:progress?.next;indefinite.checked=inputs?.indefinite??(context.active&&context.until_date===null);dateInput.value=(inputs?.until_date??context.until_date)?displayDate(inputs?.until_date??context.until_date):'';note.value=inputs?.note??context.note;dateHint.textContent='Earliest '+displayDate(context.business_date)+'.';original=snapshot();
    if(progress){ensureResults();notice('Scroll to see the results.');if(BigInt(progress.next.page_no)>1n){pageBlocks=[{page_no:progress.next.page_no,rows:[]}];busy=false;await oldPage('back');}accepted={ok:true,next:true,candidate_id:context.candidate_id,work_id:context.work_id,message:bulkMessage(progress)};}
    notice(pending?'A previous request needs its result checked.':progress&&!progress.complete?'Continue the saved operation.':context.conflict?copy(context.conflict):subject.clear&&!subject.many&&!context.active?'There is no snooze to remove.':'',context.conflict!==null);
   }catch(e){context=null;if(current())notice(e.code?copy(e.code):'Could not open the snooze; try again.',true);}finally{busy=false;if(current())render();}})();
  return Object.freeze({done,close:()=>frame.close(),alive:()=>frame.alive()});
 }
 return Object.freeze({open,seed,copy,normaliseBpayNextSnoozeAction,normaliseBpayNextSnoozeMany,validateBpayNextSnoozeContext,validateBpayNextSnoozeReceipt,validateBpayNextSnoozeManyReceipt});
});
