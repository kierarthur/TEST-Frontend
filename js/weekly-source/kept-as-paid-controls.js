(function(root){'use strict';
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
 const closed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 const copy=v=>JSON.parse(JSON.stringify(v)),escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const inFlight=new Set(),listeners=new Set(),journalKey=actor=>'cloudtms.health.keep-as-paid.v1:'+actor;
 const publish=()=>{for(const render of listeners)render();};
 function uniqueJson(text){
  if(typeof text!=='string'||text.length>131072)throw Error('KEEP_RESPONSE_INVALID');
  const stack=[];for(let i=0;i<text.length;i++){
   if(text[i]==='{'||text[i]==='['){stack.push(text[i]==='{'?new Set():null);if(stack.length>32)throw Error('KEEP_RESPONSE_INVALID');}
   else if(text[i]==='}'||text[i]===']')stack.pop();
   else if(text[i]==='"'){const start=i++;for(;i<text.length;i++){if(text[i]==='\\')i++;else if(text[i]==='"')break;}const token=JSON.parse(text.slice(start,i+1));let next=i+1;while(/\s/.test(text[next]||'')&&next<text.length)next++;if(text[next]===':'){const keys=stack.at(-1);if(!(keys instanceof Set)||keys.has(token))throw Error('KEEP_RESPONSE_INVALID');keys.add(token);}}
  }return JSON.parse(text);
 }
 function london(value){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
 }
 function acknowledgement(context){
  const ack=context?.latest_acknowledgement;if(!ack)return '';
  return `Kept as paid by ${ack.actor_display===null?'Office user (name unavailable)':ack.actor_display} on ${london(ack.acknowledged_at_utc)}`;
 }
 function discovery(rows){
  if(!Array.isArray(rows))throw Error('KEEP_DISCOVERY_INVALID');const seen=new Set();
  return rows.map(row=>{
   if(!closed(row,['work_event_id','candidate','work_date','start','end','break_minutes','context','unavailable_reason'])||!uuid(row.work_event_id)||seen.has(row.work_event_id)
    ||typeof row.candidate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.work_date)||!/^\d\d:\d\d$/.test(row.start)||!/^\d\d:\d\d$/.test(row.end)
    ||!Number.isInteger(row.break_minutes)||row.break_minutes<0)throw Error('KEEP_DISCOVERY_INVALID');
   seen.add(row.work_event_id);
   if(row.context!==null){root.CloudTMSKeptAsPaidContractV1.decodeKeptPayContext(row.context,{work_event_id:row.work_event_id});if(row.unavailable_reason!==null)throw Error('KEEP_DISCOVERY_INVALID');}
   else if(!closed(row.unavailable_reason,['code','message'])||row.unavailable_reason.code!=='CURRENT_SOURCE_CONTEXT_UNAVAILABLE'
    ||row.unavailable_reason.message!=='The current Source context is not yet available. Refresh this shift before deciding.')throw Error('KEEP_DISCOVERY_INVALID');
   return row;
  });
 }
 function renderRows(rows,surface){
  if(!rows?.length)return '';if(!['SOURCE_WORKSPACE','SIMPLE_TIMESHEET'].includes(surface))return '';
  let valid;try{valid=discovery(rows);}catch{return '<p role="status">Current Keep as paid information is unavailable. Refresh this work.</p>';}
  return `<section class="ws-kept-work" aria-label="Keep as paid"><h3>Keep as paid</h3>${valid.map(row=>`<div class="ws-notice"><strong>${escape(row.candidate)} · ${escape(row.work_date.split('-').reverse().join('/'))} · ${escape(row.start)}–${escape(row.end)}</strong>${row.context?`${row.context.latest_acknowledgement?`<p>${escape(acknowledgement(row.context))}</p><p>${row.context.decision_applies?'This acknowledgement applies to the current Source facts.':'This is a historical acknowledgement; it does not apply to the current Source facts.'}</p>`:''}<button type="button" class="btn btn-outline" data-kept-work-event="${row.work_event_id}" data-kept-surface="${surface}">Review Keep as paid</button>`:`<p>${escape(row.unavailable_reason.message)}</p>`}</div>`).join('')}</section>`;
 }
 function create({actorId,workEventId,parentKey,expectedScope,selectedCredit,request,isCurrent,storage=root.localStorage}){
  const dto=root.CloudTMSKeptAsPaidContractV1;
  if(!dto||!uuid(actorId)||!uuid(workEventId)||typeof parentKey!=='string'||!parentKey||typeof request!=='function'||typeof isCurrent!=='function'||(selectedCredit!==undefined&&!uuid(selectedCredit)))throw TypeError('KEEP_CONTEXT_REQUIRED');
  const state={context:null,receipt:null,pending:null,busy:false,stale:true,error:'',message:'',journalBlocked:false};let changed=()=>{};
  const current=()=>{if(!isCurrent())throw Error('Return to the original actor, shift and parent before continuing.');};
  function record(){
   const raw=storage.getItem(journalKey(actorId));if(raw===null)return null;
   const item=uniqueJson(raw);
   if(!closed(item,['version','actor_id','work_event_id','parent_key','payload_text'])||item.version!=='HEALTH_KEEP_PENDING_V1'||item.actor_id!==actorId||!uuid(item.work_event_id)||typeof item.parent_key!=='string'||typeof item.payload_text!=='string')throw Error('KEEP_JOURNAL_INVALID');
   const payload=uniqueJson(item.payload_text);dto.validateKeptPayCommand({action:'KEEP_AS_PAID',payload});
   if(payload.work_event_id!==item.work_event_id||JSON.stringify(payload)!==item.payload_text)throw Error('KEEP_JOURNAL_INVALID');return item;
  }
  function recover(){
   const saved=record();
   if(saved&&(saved.work_event_id!==workEventId||saved.parent_key!==parentKey))throw Error('KEEP_ORIGINAL_PARENT_REQUIRED');
   state.pending=saved?uniqueJson(saved.payload_text):null;return saved;
  }
  try{recover();}catch{state.journalBlocked=true;state.error='An earlier Keep as paid request needs the original actor, shift and parent. Do not start another request.';}
  async function call(action,payload){
   current();const controller=new root.AbortController(),timer=root.setTimeout(()=>controller.abort(),45000);
   try{
    const response=await request({method:'POST',signal:controller.signal,cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({action,payload})});current();
    const reader=response.body?.getReader();if(!reader)throw Error('KEEP_RESPONSE_INVALID');let size=0;const chunks=[];
    try{for(;;){current();const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>131072){await reader.cancel();throw Error('KEEP_RESPONSE_INVALID');}chunks.push(part.value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
    const value=uniqueJson(new root.TextDecoder('utf-8',{fatal:true}).decode(bytes));current();
    if(!response.ok)throw Object.assign(Error('Keep as paid request refused'),{status:response.status,code:value?.error_code||value?.code});return value;
   }finally{root.clearTimeout(timer);controller.abort();}
  }
  async function load(){
   current();if(state.journalBlocked||state.busy||inFlight.has(actorId))throw Error('The original Keep as paid request is still being checked.');recover();
   if(state.pending)throw Error('Retry the original Keep as paid request before refreshing.');
   state.busy=true;state.error='';changed();
   try{
    const payload={schema_version:'WEEKLY_SOURCE_KEEP_AS_PAID_CONTEXT_REQUEST_V1',work_event_id:workEventId,...(selectedCredit!==undefined?{credit_invoice_line_id:selectedCredit}:{})};
    const context=dto.decodeKeptPayContext(await call('KEEP_AS_PAID_CONTEXT',payload),payload);current();
    for(const [key,value]of Object.entries(expectedScope||{}))if(context[key]!==value)throw Error('KEEP_SCOPE_CHANGED');
    state.context=copy(context);state.stale=false;
   }catch(error){state.stale=true;state.error='Current Keep as paid information could not be confirmed. Refresh before deciding.';throw error;}
   finally{state.busy=false;changed();}return snapshot();
  }
  function removeSaved(saved){
   const actual=record();if(!actual||JSON.stringify(actual)!==JSON.stringify(saved))throw Error('KEEP_JOURNAL_CHANGED');
   storage.removeItem(journalKey(actorId));if(storage.getItem(journalKey(actorId))!==null)throw Error('KEEP_JOURNAL_NOT_CLEARED');state.pending=null;
  }
  const refusals={WEEKLY_SOURCE_KEEP_AS_PAID_REQUEST_INVALID:400,WEEKLY_SOURCE_KEEP_AS_PAID_IDEMPOTENCY_COLLISION:409,
   WEEKLY_SOURCE_KEEP_AS_PAID_FACTS_CHANGED:409,WEEKLY_SOURCE_KEEP_AS_PAID_SCOPE_CHANGED:409,WEEKLY_SOURCE_KEEP_AS_PAID_NOT_ELIGIBLE:409,
   WEEKLY_SOURCE_PAYMENT_AUTHORISER_REQUIRED:403,WEEKLY_SOURCE_OFFICE_ACTOR_INACTIVE:403,WEEKLY_SOURCE_CLIENT_NOT_IN_GROUP:403,WEEKLY_SOURCE_GROUP_NOT_ACTIVE:403};
  async function submit(retry=false){
   current();if(state.journalBlocked||state.busy||inFlight.has(actorId))throw Error('The original Keep as paid request is still being checked.');recover();
   if(state.pending&&!retry||!state.pending&&retry)throw Error('Use the original Keep as paid request.');
   if(!state.pending){
    const c=state.context;if(state.stale||!c||!c.decision_available||c.decision_needed!==true||c.disabled_reason!==null)throw Error('Refresh current Source facts before deciding.');
    const credit=c.reason==='CREDITED'?(selectedCredit!==undefined?selectedCredit:c.credit_lines.length===1?c.credit_lines[0].invoice_line_id:null):null;
    const payload={schema_version:'WEEKLY_SOURCE_KEEP_AS_PAID_REQUEST_V1',work_event_id:workEventId,decision:'KEEP_AS_PAID',reason:c.reason,
     credit_invoice_line_id:credit,expected_facts_fingerprint:c.facts_fingerprint,idempotency_key:root.crypto.randomUUID()};
    dto.validateKeptPayCommand({action:'KEEP_AS_PAID',payload});
    const saved={version:'HEALTH_KEEP_PENDING_V1',actor_id:actorId,work_event_id:workEventId,parent_key:parentKey,payload_text:JSON.stringify(payload)};
    if(record()!==null)throw Error('KEEP_JOURNAL_CHANGED');
    const bytes=JSON.stringify(saved);storage.setItem(journalKey(actorId),bytes);if(storage.getItem(journalKey(actorId))!==bytes)throw Error('KEEP_JOURNAL_NOT_SAVED');state.pending=payload;
   }
   const saved=recover(),payload=copy(state.pending);state.busy=true;inFlight.add(actorId);state.error='';state.message='';changed();let accepted=false;
   try{
    const receipt=dto.decodeKeptPayAcknowledgement(await call('KEEP_AS_PAID',payload),payload,actorId);current();removeSaved(saved);
    state.receipt=copy(receipt);state.stale=true;state.message='Keep as paid was recorded. Checking the current acknowledgement…';accepted=true;
   }catch(error){
    if(isCurrent()&&Object.hasOwn(refusals,error?.code)&&error.status===refusals[error.code]){
     removeSaved(saved);state.stale=true;state.error='This request was not saved. Refresh the current Source facts before deciding again.';
    }else state.error='The save result is uncertain. Retry the original Keep as paid request.';
    throw error;
   }finally{state.busy=false;inFlight.delete(actorId);changed();publish();}
   if(accepted&&isCurrent()){try{await load();state.message='Keep as paid was recorded.';}catch{}changed();}return snapshot();
  }
  async function safe(fn){try{return await fn();}catch(error){if(!state.error)state.error='This request could not be prepared safely. Refresh, or retry the original saved request.';try{recover();}catch{state.journalBlocked=true;}changed();throw error;}}
  const snapshot=()=>copy(state);
  function html(){
   const c=state.context,busy=state.busy||inFlight.has(actorId),pending=!!state.pending;
   const ack=acknowledgement(c),fact=v=>v===null?'Not known':v?'Yes':'No';
   return `<section class="ws-kept-controls" aria-label="Keep as paid"><h3>Keep as paid</h3><p>This records your decision for the current Source facts. It does not change pay or invoice amounts.</p>${ack?`<p>${escape(ack)}</p><p>${c.decision_applies?'This acknowledgement applies to the current Source facts.':'This is a historical acknowledgement; it does not apply to the current Source facts.'}</p>`:''}${c?`<dl><dt>Present in Source</dt><dd>${fact(c.source_present)}</dd><dt>Invoiced</dt><dd>${fact(c.invoiced)}</dd><dt>Paid</dt><dd>${fact(c.paid)}</dd><dt>Payment evidence</dt><dd>${escape({UNKNOWN:'Not known',NOT_SETTLED:'Not settled',SETTLED_ORIGINAL:'Original payment settled',SETTLED_SOURCE_SEGMENT:'Source payment segment settled'}[c.paid_evidence_state])}</dd><dt>Pay hold</dt><dd>${fact(c.holds_pay)}</dd><dt>Invoice hold</dt><dd>${fact(c.holds_invoice)}</dd></dl>${c.disabled_reason?`<p role="status">${escape(c.disabled_reason.message)}</p>`:''}`:''}${state.error?`<p role="alert">${escape(state.error)}</p>`:''}${state.message?`<p role="status">${escape(state.message)}</p>`:''}<div class="ws-toolbar"><button type="button" class="btn btn-outline" data-kept-refresh${busy||pending||state.journalBlocked?' disabled':''}>Refresh current facts</button>${pending?`<button type="button" class="btn" data-kept-retry${busy||state.journalBlocked?' disabled':''}>${busy?'Checking original request…':'Retry original Keep as paid request'}</button>`:`<button type="button" class="btn" data-kept-save${busy||state.stale||state.journalBlocked||!c||!c.decision_available||c.decision_needed!==true||c.disabled_reason!==null?' disabled':''}>Keep as paid</button>`}</div></section>`;
  }
  function mount(host){
   const render=()=>{host.innerHTML=html();for(const [selector,fn]of [['[data-kept-refresh]',load],['[data-kept-save]',()=>submit(false)],['[data-kept-retry]',()=>submit(true)]])host.querySelector(selector)?.addEventListener('click',()=>{safe(fn).catch(()=>{});});};
   changed=render;listeners.add(render);render();return()=>{listeners.delete(render);changed=()=>{};host.replaceChildren();};
  }
  return Object.freeze({load:()=>safe(load),save:()=>safe(()=>submit(false)),retry:()=>safe(()=>submit(true)),snapshot,html,mount});
 }
 const api=Object.freeze({create,discovery,renderRows,acknowledgement,london,journalKey,uniqueJson});
 if(typeof module==='object'&&module.exports)module.exports=api;root.CloudTMSKeptAsPaidV1=api;
 root.document?.addEventListener('click',event=>{const button=event.target?.closest?.('[data-kept-work-event]');if(!button||button.disabled)return;event.preventDefault();root.CloudTMSWeeklySourceWorkspaceActionsV1?.openKeepAsPaid?.({workEventId:button.dataset.keptWorkEvent,surface:button.dataset.keptSurface});});
})(typeof window==='object'?window:globalThis);
