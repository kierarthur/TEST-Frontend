(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextDecisionsClear=api;})(typeof globalThis==='object'?globalThis:this,function(){'use strict';
/** WB28 closed frozen-operation transport. Existing W2 owns admission and SQL. */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const same=(a,b)=>a===b||object(a)&&object(b)&&exact(a,Object.keys(b))&&Object.keys(a).every(k=>same(a[k],b[k]));
const id=v=>typeof v==='string'&&UUID.test(v);
const integer=(v,positive=false)=>typeof v==='string'&&(positive?/^[1-9][0-9]{0,18}$/:/^(0|[1-9][0-9]{0,18})$/).test(v)&&BigInt(v)<=9223372036854775807n;
const decimal=(v,scale=2,digits=36)=>typeof v==='string'&&new RegExp('^(0|[1-9][0-9]{0,'+(digits-1)+'})(\\.[0-9]{1,'+scale+'})?$').test(v);
const text=(v,n)=>typeof v==='string'&&!v.includes('\0')&&new TextEncoder().encode(v).length<=n;
const nullable=(v,fn)=>v===null||fn(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
const fail=(code='BPAY_NEXT_WORKBENCH_RESPONSE_INVALID',status=503,retryable=false)=>Object.assign(new Error(code),{code,status,retryable});
function scope(v){return exact(v,['candidate_id','client_id','channel'])&&nullable(v.candidate_id,id)&&nullable(v.client_id,id)&&['ALL','PAYE','UMBRELLA'].includes(v.channel);}
function cursor(v){return nullable(v,x=>exact(x,['member_no','owner_no'])&&integer(x.member_no,true)&&integer(x.owner_no,true)&&BigInt(x.owner_no)<=100n);}
function normalizeDecisionsClear(args){
 if(!exact(args,['request_id','scope','owner_epoch','official_pay_date','expected_workbench_revision','phase','step','cursor','confirmed'])||!id(args.request_id)||!scope(args.scope)
  ||!integer(args.owner_epoch,true)||!date(args.official_pay_date)||!integer(args.expected_workbench_revision)||!integer(args.step)||!['FREEZE','VIEW','APPLY'].includes(args.phase)
  ||typeof args.confirmed!=='boolean'||args.confirmed!==(args.phase==='APPLY')||!cursor(args.cursor)||args.cursor!==null&&args.phase!=='VIEW'||bytes(args)>4096)
  throw fail('BPAY_NEXT_DECISIONS_CLEAR_REQUEST_INVALID',400);
 return args;
}
const RESULT_KEYS=['request_id','agency_id','actor_user_id','owner_epoch','official_pay_date','scope','expected_workbench_revision','state','scope_summary','candidate_count','work_count','owner_count','excluded_count','affected_amount','cleared_count','refused_count','cleared_amount','freeze_step','apply_step','reset_sequence','rows','next_cursor'];
const OWNER_KEYS=['owner_id','owner_version','approved_line_id','rate_family','rate_code','amount_ex_vat','clear_class','exclusion_code','target_pay_channel','resolution_mode','manual_replacement_rate','manual_amount_ex_vat'];
const reasons=[null,'IN_DRAFT','CHANGED','UNAVAILABLE'];
function validateDecisionsClearReceipt(v,args,actorId){
 normalizeDecisionsClear(args);const bad=()=>{throw fail();};
 if(!exact(v,['request_id','phase','step','received','replay','processing','result'])||v.request_id!==args.request_id||v.phase!==args.phase||v.step!==args.step
  ||['received','replay','processing'].some(k=>typeof v[k]!=='boolean')||v.replay&&!v.received||v.processing&&(v.received||v.replay||args.phase!=='APPLY')||bytes(v)>120000)bad();
 if(!v.received&&!v.processing){if(v.result!==null)bad();return v;}
 const r=v.result;
 if(!exact(r,RESULT_KEYS)||r.request_id!==args.request_id||!id(r.agency_id)||r.actor_user_id!==actorId||!id(r.actor_user_id)||r.owner_epoch!==args.owner_epoch||r.official_pay_date!==args.official_pay_date
  ||!same(r.scope,args.scope)||r.expected_workbench_revision!==args.expected_workbench_revision||!['DISCOVERING','READY','APPLYING','COMPLETE','PARTIAL'].includes(r.state)
  ||!exact(r.scope_summary,['candidate_count'])||!integer(r.scope_summary.candidate_count)
  ||!['candidate_count','work_count','owner_count','excluded_count','cleared_count','refused_count','freeze_step','apply_step'].every(k=>integer(r[k]))
  ||!decimal(r.affected_amount)||!decimal(r.cleared_amount)||!nullable(r.reset_sequence,x=>integer(x,true))
  ||['COMPLETE','PARTIAL'].includes(r.state)!==(r.reset_sequence!==null)||!Array.isArray(r.rows)||r.rows.length>10||!cursor(r.next_cursor)
  ||BigInt(r.cleared_count)+BigInt(r.refused_count)>BigInt(r.owner_count)||BigInt(r.work_count)>BigInt(r.candidate_count)+BigInt(r.owner_count)+BigInt(r.excluded_count)
  ||r.state==='PARTIAL'&&r.refused_count==='0'||r.state==='COMPLETE'&&r.refused_count!=='0')bad();
 if(args.phase==='FREEZE'&&v.received&&(!['DISCOVERING','READY'].includes(r.state)||BigInt(r.freeze_step)!==BigInt(args.step)+1n)
  ||args.phase==='APPLY'&&(v.received?(!['APPLYING','COMPLETE','PARTIAL'].includes(r.state)||BigInt(r.apply_step)!==BigInt(args.step)+1n)
   :v.processing&&(!['READY','APPLYING'].includes(r.state)||r.apply_step!==args.step)))bad();
 let last=null;
 for(const row of r.rows){
  if(!exact(row,['member_no','owner_no','candidate_id','work_id','owner_family','exclusion_code','subject','outcome_code','cleared','owner'])
   ||!integer(row.member_no,true)||!integer(row.owner_no,true)||BigInt(row.owner_no)>100n||!id(row.candidate_id)||!id(row.work_id)
   ||!['GROSS','WORK_BUCKET'].includes(row.owner_family)||!reasons.includes(row.exclusion_code)||!reasons.includes(row.outcome_code)||typeof row.cleared!=='boolean'
   ||row.cleared&&row.outcome_code!==null||last&&(BigInt(row.member_no)<BigInt(last.member_no)||row.member_no===last.member_no&&BigInt(row.owner_no)<=BigInt(last.owner_no)))bad();
  const s=row.subject;
  if(!exact(s,['candidate_display_name','candidate_reference','client_display_name','timesheet_reference','week_ending_date'])
   ||!text(s.candidate_display_name,8192)||!nullable(s.candidate_reference,x=>text(x,8192))||!text(s.client_display_name,8192)
   ||!nullable(s.timesheet_reference,x=>text(x,8192))||!date(s.week_ending_date))bad();
  const o=row.owner;
  if(o!==null&&(!exact(o,OWNER_KEYS)||!id(o.owner_id)||!integer(o.owner_version,true)||!id(o.approved_line_id)||!['STANDARD','ADDITIONAL','ADJUSTMENT'].includes(o.rate_family)
   ||row.owner_family!==(o.rate_family==='STANDARD'?'WORK_BUCKET':'GROSS')||!text(o.rate_code,1024)||!nullable(o.amount_ex_vat,x=>decimal(x,2,16))
   ||!['RESOLVED_AND_CLEARABLE','NOT_CLEARABLE'].includes(o.clear_class)||!reasons.includes(o.exclusion_code)||!['PAYE','UMBRELLA'].includes(o.target_pay_channel)
   ||!nullable(o.resolution_mode,x=>['SUGGESTED_EQUIVALENT_BASIS','MANUAL_REPLACEMENT_RATE','MANUAL_AMOUNT'].includes(x))
   ||!nullable(o.manual_replacement_rate,x=>decimal(x,6,12))||!nullable(o.manual_amount_ex_vat,x=>decimal(x,2,16))
   ||o.rate_family==='STANDARD'&&!['DAY','NIGHT','SAT','SUN','BH'].includes(o.rate_code)
   ||(o.resolution_mode==='MANUAL_REPLACEMENT_RATE'?o.manual_replacement_rate===null||o.manual_amount_ex_vat!==null
     :o.resolution_mode==='MANUAL_AMOUNT'?o.manual_amount_ex_vat===null||o.manual_replacement_rate!==null
     :o.manual_replacement_rate!==null||o.manual_amount_ex_vat!==null)
   ||o.clear_class==='RESOLVED_AND_CLEARABLE'&&(o.amount_ex_vat===null||o.exclusion_code!==null||o.resolution_mode===null)))bad();
  last=row;
 }
 if(r.next_cursor!==null&&(!last||r.next_cursor.member_no!==last.member_no||r.next_cursor.owner_no!==last.owner_no))bad();
 if(args.phase==='VIEW'&&args.cursor!==null&&r.rows.length&&(BigInt(r.rows[0].member_no)<BigInt(args.cursor.member_no)
  ||r.rows[0].member_no===args.cursor.member_no&&BigInt(r.rows[0].owner_no)<=BigInt(args.cursor.owner_no)))bad();
 return v;
}
const nativeRules=new Map([
 ['22023:BPAY_NEXT_DECISIONS_CLEAR_REQUEST_INVALID',[400,false]],['23514:BPAY_NEXT_DECISIONS_CLEAR_REPLAY_CONFLICT',[409,false]],
 ['23514:BPAY_NEXT_DECISIONS_CLEAR_STALE',[409,false]],['23514:BPAY_NEXT_CHOICE_CONTEXT_CHANGED',[409,false]],
 ['54000:BPAY_NEXT_DECISIONS_CLEAR_SCOPE_TOO_LARGE',[413,false]],['55000:BPAY_NEXT_MODULE_NOT_ACTIVE',[409,false]],
 ['55P03:BPAY_NEXT_CANDIDATE_FINANCIAL_FENCE_BUSY',[409,true]],['42501:BPAY_NEXT_WORKBENCH_COMMAND_FORBIDDEN',[403,false]]
]);
function decisionsClearNativeFault(v){
 const rule=nativeRules.get(v?.code+':'+v?.message);if(rule)return fail(v.message,...rule);
 // PostgreSQL transaction-abort classes prove that this exact page was not accepted.
 if(['55P03','40001','40P01','57014'].includes(v?.code))return fail('BPAY_NEXT_DECISIONS_CLEAR_BUSY',409,true);
 return null;
}
function validateDecisionsClearFault(v){
 if(!exact(v,['ok','error_code','retryable','outcome_unknown'])||v.ok!==false||typeof v.retryable!=='boolean'||typeof v.outcome_unknown!=='boolean')throw fail();
 const known=[...nativeRules.keys()].some(k=>k.slice(6)===v.error_code)||v.error_code==='BPAY_NEXT_DECISIONS_CLEAR_BUSY';
 if(known&&v.outcome_unknown||!known&&!['BPAY_NEXT_WORKBENCH_UNAVAILABLE','BPAY_NEXT_WORKBENCH_RESPONSE_INVALID','BPAY_NEXT_WORKBENCH_UNAUTHORIZED','BPAY_NEXT_WORKBENCH_FORBIDDEN','BPAY_NEXT_ENVIRONMENT_MISMATCH','BPAY_NEXT_OFFICE_FORBIDDEN'].includes(v.error_code))throw fail();
 return v;
}

function createDecisionsClearController(options,initialNamespace){
 let namespace=initialNamespace;
 if(!exact(namespace,['agency_id','owner_epoch','actor_user_id','official_pay_date','scope'])||!id(namespace.agency_id)||!id(namespace.actor_user_id)
  ||!integer(namespace.owner_epoch,true)||!date(namespace.official_pay_date)||!scope(namespace.scope)||typeof options.authFetch!=='function'||typeof options.api!=='function'
  ||typeof options.currentActorId!=='function'||typeof options.current!=='function'||options.environment!=='TEST')throw fail('BPAY_NEXT_DECISIONS_CLEAR_REQUEST_INVALID',400);
 const key='cloudtms:bpay-next:decisions-clear:v1:'+JSON.stringify({agency_id:namespace.agency_id,actor_user_id:namespace.actor_user_id,scope:namespace.scope}),storage=options.storage??options.window?.localStorage;
 const clone=v=>JSON.parse(JSON.stringify(v));let saved=null,busy=false;
 function authority(){if(String(options.currentActorId()??'').toLowerCase()!==namespace.actor_user_id||!options.current())throw fail('BPAY_NEXT_WORKBENCH_UNAUTHORIZED',401);}
 function valid(record){
  if(!exact(record,['version','namespace','identity','local_revision','consented','acknowledged','pending','result'])||record.version!==1||!same(record.namespace,namespace)
   ||!exact(record.identity,['request_id','scope','owner_epoch','official_pay_date','expected_workbench_revision'])||!id(record.identity.request_id)||!same(record.identity.scope,namespace.scope)
   ||record.identity.owner_epoch!==namespace.owner_epoch||record.identity.official_pay_date!==namespace.official_pay_date||!integer(record.identity.expected_workbench_revision)||!Number.isSafeInteger(record.local_revision)||record.local_revision<0||typeof record.consented!=='boolean'||typeof record.acknowledged!=='boolean'
   ||!nullable(record.pending,x=>typeof x==='string'&&new TextEncoder().encode(x).length<=8192)||bytes(record)>131072)return false;
  try{if(record.pending!==null){const body=JSON.parse(record.pending);if(!exact(body,['action','args','readback'])||body.action!=='DECISIONS_CLEAR'||body.readback!==false)return false;
    normalizeDecisionsClear(body.args);if(!['request_id','scope','owner_epoch','official_pay_date','expected_workbench_revision'].every(k=>same(body.args[k],record.identity[k]))||body.args.phase==='VIEW'||body.args.phase==='APPLY'&&!record.consented)return false;}
   if(record.result!==null){const r=record.result,args={...record.identity,phase:'VIEW',step:'0',cursor:null,confirmed:false};
    validateDecisionsClearReceipt({request_id:args.request_id,phase:'VIEW',step:'0',received:true,replay:true,processing:false,result:r},args,namespace.actor_user_id);
    if(r.agency_id!==namespace.agency_id||r.owner_epoch!==namespace.owner_epoch)return false;}
   return true;
  }catch{return false;}
 }
 try{const raw=storage?.getItem(key);if(raw!==null&&raw!==undefined){if(new TextEncoder().encode(raw).length>131072)throw fail();saved=JSON.parse(raw);const old=saved?.namespace;
    if(!exact(old,['agency_id','owner_epoch','actor_user_id','official_pay_date','scope'])||old.agency_id!==initialNamespace.agency_id||old.actor_user_id!==initialNamespace.actor_user_id
     ||!same(old.scope,initialNamespace.scope)||!integer(old.owner_epoch,true)||!date(old.official_pay_date))throw fail();
    namespace=clone(old);if(!valid(saved))throw fail();}}catch{throw fail('BPAY_NEXT_DECISIONS_CLEAR_RECOVERY_UNAVAILABLE',409);}
 if(!storage||typeof storage.setItem!=='function')throw fail('BPAY_NEXT_DECISIONS_CLEAR_RECOVERY_UNAVAILABLE',409);
 function persist(next){if(!valid(next))throw fail();authority();storage.setItem(key,JSON.stringify(next));saved=next;}
 async function transport(args,readback){
  authority();normalizeDecisionsClear(args);const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fail('BPAY_NEXT_WORKBENCH_UNAVAILABLE',503,true));},12000);});
  const send=async()=>{
   const response=await options.authFetch(options.api('/api/banking/pay/next/workbench-command'),{method:'POST',signal:controller.signal,redirect:'error',auth401Mode:'return',
    headers:{accept:'application/json','content-type':'application/json','X-CloudTMS-Banking-Environment':'TEST'},body:JSON.stringify({action:'DECISIONS_CLEAR',args,readback})});
   if(!(response instanceof Response))throw fail();const reader=response.body?.getReader();if(!reader)throw fail();const decoder=new TextDecoder('utf-8',{fatal:true});let total=0,raw='';
   try{while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>131072)throw fail();raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}
   catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
   authority();const value=JSON.parse(raw);
   if(!response.ok||value?.ok===false){
    if(response.status===401||response.status===403)throw fail('BPAY_NEXT_WORKBENCH_UNAUTHORIZED',response.status);
    const refusal=validateDecisionsClearFault(value);throw Object.assign(fail(refusal.error_code,response.status,refusal.retryable),{unknown:refusal.outcome_unknown});}
   if(!exact(value,['ok','action','receipt'])||value.ok!==true||value.action!=='DECISIONS_CLEAR')throw fail();
   const receipt=validateDecisionsClearReceipt(value.receipt,args,namespace.actor_user_id);
   if(receipt.result&&(receipt.result.agency_id!==namespace.agency_id||receipt.result.owner_epoch!==namespace.owner_epoch))throw fail();return receipt;
  };
  try{return await Promise.race([send(),timeout]);}finally{clearTimeout(timer);controller.abort();}
 }
 function accept(receipt){if(receipt.received)persist({...saved,pending:null,result:receipt.result});return receipt;}
 function argsForNext(){
  if(!saved)throw fail();const state=saved.result?.state??'DISCOVERING';
  if(['COMPLETE','PARTIAL'].includes(state))return null;
  const phase=state==='DISCOVERING'?'FREEZE':'APPLY';if(phase==='APPLY'&&!saved.consented)throw fail('BPAY_NEXT_DECISIONS_CLEAR_CONFIRMATION_REQUIRED',409);
  return {...saved.identity,phase,step:phase==='FREEZE'?(saved.result?.freeze_step??'0'):saved.result.apply_step,cursor:null,confirmed:phase==='APPLY'};
 }
 async function dispatch(args){
  persist({...saved,pending:JSON.stringify({action:'DECISIONS_CLEAR',args,readback:false})});
  const receipt=await transport(args,false);if(!receipt.received&&!receipt.processing)throw fail();return accept(receipt);
 }
 return Object.freeze({key,snapshot:()=>saved===null?null:clone(saved),busy:()=>busy,
  start(expectedRevision,localRevision){authority();if(saved!==null)throw fail('BPAY_NEXT_DECISIONS_CLEAR_RECOVERY_REQUIRED',409);
   persist({version:1,namespace:clone(namespace),identity:{request_id:(options.randomUUID??(()=>globalThis.crypto.randomUUID()))(),scope:clone(namespace.scope),owner_epoch:namespace.owner_epoch,official_pay_date:namespace.official_pay_date,expected_workbench_revision:expectedRevision},
    local_revision:localRevision,consented:false,acknowledged:false,pending:null,result:null});return clone(saved);},
  acknowledge(){authority();if(!saved?.result||!['COMPLETE','PARTIAL'].includes(saved.result.state)||saved.pending!==null)throw fail();persist({...saved,acknowledged:true});},
  confirm(){authority();if(busy||!saved||saved.pending!==null||saved.result?.state!=='READY')throw fail('BPAY_NEXT_DECISIONS_CLEAR_CONFIRMATION_REQUIRED',409);persist({...saved,consented:true});},
  async recover(){if(busy||!saved?.pending)return null;busy=true;try{return accept(await transport(JSON.parse(saved.pending).args,true));}finally{busy=false;}},
  async next(){if(busy||!saved)return null;busy=true;try{
    if(saved.pending!==null){const args=JSON.parse(saved.pending).args,receipt=await transport(args,true);if(receipt.received)return accept(receipt);return await dispatch(args);}
    const args=argsForNext();return args===null?null:await dispatch(args);
   }finally{busy=false;}},
  async view(after=null){if(!saved)throw fail();return await transport({...saved.identity,phase:'VIEW',step:'0',cursor:after,confirmed:false},true);},
  async cancelUnconfirmed(){authority();if(busy||saved?.consented)throw fail('BPAY_NEXT_DECISIONS_CLEAR_RECOVERY_REQUIRED',409);
   if(saved?.pending!==null&&saved){const receipt=await transport(JSON.parse(saved.pending).args,true);if(receipt.received)accept(receipt);else persist({...saved,pending:null});}
   authority();storage.removeItem(key);saved=null;namespace=clone(initialNamespace);},
  retire(){authority();if(busy||saved?.pending!==null||saved?.consented&&!['COMPLETE','PARTIAL'].includes(saved.result?.state))throw fail('BPAY_NEXT_DECISIONS_CLEAR_RECOVERY_REQUIRED',409);
   storage.removeItem(key);saved=null;namespace=clone(initialNamespace);}
 });
}

function mountDecisionsClearWindow(options){
 const entry=options.entry,doc=entry.body.ownerDocument,win=doc.defaultView,context=options.context,store=options.choiceStore;
 const namespace={agency_id:context.agency_id,owner_epoch:context.owner_epoch,actor_user_id:context.actor_user_id,official_pay_date:context.official_pay_date,
  scope:{candidate_id:context.scope.candidate_id,client_id:context.scope.client_id,channel:context.scope.channel}};
 const controller=createDecisionsClearController({...options,window:win,environment:'TEST'},namespace);
 if(controller.snapshot()?.acknowledged===true)controller.retire();
 const el=(tag,value,cls)=>{const n=doc.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
 const button=(label,fn,primary=false)=>{const b=el('button',label,'btn'+(primary?' primary':''));b.type='button';b.addEventListener('click',fn);return b;};
 const pounds=value=>win.CloudTMSBpayNextWorkbench.displayPounds(value),number=value=>BigInt(value).toLocaleString('en-GB');
 let running=false,error='',stale=false,processing=false,resetMessage='',resetObserved=false,closed=false,listBusy=false,listError='',pages=[],history=[],consentShown=false,listPending={direction:'reset',after:null};
 const scopeText=el('p',options.scopeLabel,'bpay-next-reset-scope'),question=el('p','','bpay-next-reset-question'),facts=el('div',undefined,'bpay-next-clear-facts'),notice=el('p'),result=el('p');
 notice.setAttribute('data-next-live-copy','');notice.setAttribute('role','status');result.setAttribute('data-next-live-copy','');result.setAttribute('role','status');
 const consequence=el('p','Saved payment decisions will be removed for future Drafts; existing Drafts and snoozes will stay unchanged.');
 const list=el('div',undefined,'bpay-next-clear-list');list.setAttribute('role','region');list.setAttribute('aria-label','Saved decisions');list.tabIndex=0;
 const listStatus=el('p');listStatus.setAttribute('role','status');listStatus.setAttribute('data-next-live-copy','');
 const retryList=button('Try again',()=>void readList('retry'));retryList.hidden=true;
 const action=button('Continue',()=>{if(stale)void refreshScope();else void run();},true),cancel=button('Cancel',()=>void cancelUnconfirmed());
 const heading=el('div',undefined,'bpay-next-reset-heading'),icon=el('span','!','bpay-next-channel-question-icon is-refused');icon.setAttribute('aria-hidden','true');heading.append(icon,question);
 entry.body.replaceChildren(heading,scopeText,facts,consequence,list,listStatus,retryList,notice,result);entry.footer.replaceChildren(cancel,action);
 const alive=()=>!closed&&entry.alive()&&options.current();
 function render(){
  if(!alive())return;const saved=controller.snapshot(),r=saved?.result,terminal=r&&['COMPLETE','PARTIAL'].includes(r.state),ready=r?.state==='READY'&&!saved.consented;
  question.textContent=terminal?(r.state==='PARTIAL'?'Some decisions could not be cleared.':'Decisions cleared.'):ready?'Clear all decisions for '+options.scopeLabel+'?':'Preparing saved decisions…';
  const success=r?.state==='COMPLETE',refused=Boolean(error)||r?.state==='PARTIAL'||ready;
  icon.textContent=success?'✓':refused?'!':'i';icon.classList.toggle('is-success',success);icon.classList.toggle('is-refused',refused);
  result.classList.toggle('bpay-next-clear-result-success',success);entry.body.classList.toggle('bpay-next-clear-consent',ready&&!error);
  facts.replaceChildren();if(r&&r.state!=='DISCOVERING'){
   const money=el('strong',pounds(r.affected_amount));money.setAttribute('data-next-formatted-money','');
   for(const [label,value] of [['Candidates with saved decisions',number(r.candidate_count)],['Timesheets',number(r.work_count)],['Decisions to clear',number(r.owner_count)],['Not included',number(r.excluded_count)],['Saved pay ex VAT',money]]){
    const fact=el('div');fact.append(el('span',label));if(value?.nodeType)fact.append(value);else fact.append(el('strong',value));facts.append(fact);}
  }
  consequence.hidden=terminal;list.hidden=!r||r.state==='DISCOVERING';notice.setAttribute('role',error?'alert':'status');notice.textContent=error||(running?'Working…':processing?'Payments are being updated; continue when they are ready.':'');
  result.textContent=terminal?number(r.cleared_count)+(r.cleared_count==='1'?' decision cleared':' decisions cleared')+(r.refused_count!=='0'?' · '+number(r.refused_count)+' left unchanged':'')+'.'+(resetMessage?' '+resetMessage:''):'';
  cancel.hidden=terminal||saved?.consented===true;action.hidden=terminal;entry.footer.hidden=Boolean(terminal);
  action.disabled=running||!entry.active();action.textContent=stale?'Refresh':ready?'Clear all decisions':error?'Check result':'Continue';
  action.toggleAttribute('data-next-destructive',ready);action.classList.toggle('bpay-next-clear-destructive',ready);cancel.disabled=running;
  if(ready&&!consentShown){consentShown=true;win.setTimeout(()=>{const s=controller.snapshot();if(alive()&&entry.active()&&s?.result?.state==='READY'&&!s.consented)cancel.focus();},0);}
  listStatus.setAttribute('role',listError?'alert':'status');listStatus.textContent=listError||(listBusy?'Loading…':'');retryList.hidden=!listError;
 }
 function reason(row){const owner=row.owner;if(owner===null)return {IN_DRAFT:'In a Draft',CHANGED:'Payment changed',UNAVAILABLE:'Cannot be cleared yet'}[row.exclusion_code]??'Cannot be cleared yet';if(owner?.clear_class==='NOT_CLEARABLE')return {IN_DRAFT:'In a Draft',CHANGED:'Payment changed',UNAVAILABLE:'Cannot be cleared yet'}[owner.exclusion_code]??'Cannot be cleared yet';
  if(row.cleared)return 'Cleared';if(row.outcome_code==='CHANGED')return 'Payment changed; left unchanged';if(row.outcome_code)return 'Left unchanged';return 'Saved decision';}
 function decisionName(o){if(!o)return 'Saved decision';const label=o.rate_family==='STANDARD'?({DAY:'Day',NIGHT:'Night',SAT:'Saturday',SUN:'Sunday',BH:'Bank holiday'}[o.rate_code]??'Work rate'):o.rate_family==='ADDITIONAL'?'Additional payment':'Payment adjustment';
  return label+(o.resolution_mode==='MANUAL_AMOUNT'?' · Saved amount':o.resolution_mode==='MANUAL_REPLACEMENT_RATE'?' · Saved rate':'');}
 function renderList(){
  if(!alive())return;const fragment=doc.createDocumentFragment();for(const row of pages.flatMap(p=>p.rows)){
   const card=el('div',undefined,'bpay-next-clear-row'),identity=el('div'),amount=el('div',undefined,'bpay-next-clear-money');card.dataset.clearRow=row.member_no+':'+row.owner_no;
   const status=el('small',reason(row));status.classList.toggle('bpay-next-clear-row-success',row.cleared);status.classList.toggle('bpay-next-clear-row-refused',row.outcome_code!==null&&row.owner?.clear_class==='RESOLVED_AND_CLEARABLE');
   identity.append(el('strong',row.subject.candidate_display_name),el('span',[row.subject.client_display_name,row.subject.timesheet_reference].filter(Boolean).join(' · ')),el('span',decisionName(row.owner)),status);
   const money=el('strong',row.owner?.amount_ex_vat!==null&&row.owner?.amount_ex_vat!==undefined?pounds(row.owner.amount_ex_vat):'—');money.setAttribute('data-next-formatted-money','');amount.append(money);card.append(identity,amount);fragment.append(card);
  }if(!pages.some(p=>p.rows.length))fragment.append(el('p','No saved decisions.'));list.replaceChildren(fragment);
 }
 async function readList(direction='reset'){
  if(!alive()||listBusy)return;let after=null;if(direction==='retry'){direction=listPending.direction;after=listPending.after;}
  else if(direction==='forward')after=pages.at(-1)?.next??null;else if(direction==='back')after=history.at(-1)??null;listPending={direction,after};
  const oldTop=list.scrollTop;listBusy=true;listError='';render();try{
   const receipt=await controller.view(after);if(!alive())return;if(!receipt.received)throw fail();const p={after,rows:receipt.result.rows,next:receipt.result.next_cursor};
   const box=list.getBoundingClientRect(),visible=Array.from(list.children).find(n=>n.dataset.clearRow&&n.getBoundingClientRect().bottom>box.top+1&&n.getBoundingClientRect().top<box.bottom-1);
   const anchor=visible?{key:visible.dataset.clearRow,top:visible.getBoundingClientRect().top-box.top}:null;
   if(direction==='reset'){pages=[p];history=[];}else if(direction==='back'){pages.unshift(p);history.pop();if(pages.length>3)pages.pop();}
   else{if(pages.length===3){history.push(pages[0].after);while(bytes(history)>32768)history.shift();pages.shift();}pages.push(p);}
   renderList();if(direction==='reset')list.scrollTop=0;else{const kept=anchor&&Array.from(list.children).find(n=>n.dataset.clearRow===anchor.key);
    if(kept)list.scrollTop+=kept.getBoundingClientRect().top-list.getBoundingClientRect().top-anchor.top;
    else list.scrollTop=Math.min(oldTop,list.scrollHeight-list.clientHeight);}
  }catch{if(alive())listError='Could not load saved decisions; try again.';}finally{listBusy=false;if(alive())render();}
 }
 list.addEventListener('scroll',()=>{if(listBusy||listError||!alive())return;if(list.scrollTop<40&&history.length)void readList('back');
  else if(pages.at(-1)?.next&&list.scrollHeight-list.scrollTop-list.clientHeight<120)void readList('forward');});
 function acceptedLocal(){const saved=controller.snapshot();if(!resetObserved&&saved?.result&&['COMPLETE','PARTIAL'].includes(saved.result.state)){
   resetMessage=options.onAccepted?.(saved.local_revision,saved.namespace)===true?'Selection reset.':'Your current ticks were kept.';controller.acknowledge();resetObserved=true;}}
 async function cancelUnconfirmed(){if(running||!alive())return;running=true;render();try{await controller.cancelUnconfirmed();if(alive())entry.close();}
  catch{if(alive())error='Could not check the saved result; try again.';}finally{running=false;if(alive())render();}}
 async function refreshScope(){if(running||!alive())return;running=true;render();try{await controller.cancelUnconfirmed();if(alive()){options.onRefreshScope?.();entry.close();}}
  catch{if(alive())error='Could not check the saved result; try again.';}finally{running=false;if(alive())render();}}
 async function run(){
  if(running||!alive()||!entry.active())return;running=true;error='';processing=false;render();
  try{
   let saved=controller.snapshot();if(!saved){controller.start(context.workbench_revision,store.snapshot().revision);saved=controller.snapshot();}
   else if(saved.result?.state==='READY'&&!saved.consented){controller.confirm();saved=controller.snapshot();}
   const started=Date.now();for(let step=0;step<25&&Date.now()-started<5000;step++){
    if(!alive()||!entry.active())break;saved=controller.snapshot();if(saved.result&&['COMPLETE','PARTIAL'].includes(saved.result.state))break;
    if(saved.result?.state==='READY'&&!saved.consented)break;
    const receipt=await controller.next();if(!alive())return;if(receipt?.processing){processing=true;break;}
    render();if(!receipt)break;
   }
   acceptedLocal();const r=controller.snapshot()?.result;if(r&&r.state!=='DISCOVERING')await readList('reset');
  }catch(e){if(alive()){stale=['BPAY_NEXT_CHOICE_CONTEXT_CHANGED','BPAY_NEXT_DECISIONS_CLEAR_STALE'].includes(e?.code)&&!controller.snapshot()?.consented;error=stale?'The list has changed. Refresh and try again.':e?.code==='BPAY_NEXT_MODULE_NOT_ACTIVE'?'Banking Pay is not available for this agency yet.':'Could not finish; check the saved result and try again.';}}
  finally{running=false;if(alive())render();}
 }
 render();const retained=controller.snapshot();if(retained){
  if(retained.pending!==null){running=true;render();void controller.recover().then(receipt=>{if(alive()){processing=receipt?.processing===true;acceptedLocal();if(controller.snapshot()?.result?.state!=='DISCOVERING')return readList('reset');}})
   .catch(()=>{if(alive())error='Could not check the saved result; try again.';}).finally(()=>{running=false;if(alive())render();});}
  else{acceptedLocal();if(retained.result?.state!=='DISCOVERING')void readList('reset');}
 }else void run();
 return Object.freeze({snapshot:()=>controller.snapshot(),close(){closed=true;},controller});
}

return Object.freeze({normalizeDecisionsClear,validateDecisionsClearReceipt,decisionsClearNativeFault,validateDecisionsClearFault,createDecisionsClearController,mountDecisionsClearWindow});
});
