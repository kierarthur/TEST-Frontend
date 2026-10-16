import {decodeContactManualEnquiryRow,decodeContactManualEnquiryReview,decodeContactManualEnquiryReceipt} from './contact-manual-enquiry-contract.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const date=value=>String(value).replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');
const uk=value=>{
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
 return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second} (UK)`;
};
const knownRefusals=new Set(['CONTACT_MANUAL_ENQUIRY_REQUEST_INVALID','CONTACT_MANUAL_ENQUIRY_REVIEW_STALE',
 'CONTACT_MANUAL_ENQUIRY_IDEMPOTENCY_CONFLICT','CONTACT_MANUAL_ENQUIRY_REVISION_CONFLICT',
 'CONTACT_MANUAL_ENQUIRY_REVIEW_EXPIRED','CONTACT_MANUAL_ENQUIRY_NOT_ELIGIBLE',
 'CONTACT_SOURCE_ORDINAL_EXHAUSTED','CONTACT_CHECKING_REVISION_EXHAUSTED']);
const exclusionCopy=Object.freeze({WORK_EVIDENCE_REQUIRED:'Confirm the worked hours before making this enquiry.',
 PAUSED:'Contact is paused for this worker and client.',QUESTION_NOT_ACTIVE:'There is no active question for this worker.',
 QUESTION_EXPIRED:'The earlier question has expired. Review this shift in Office.',
 CHECK_ORIGINAL_ATTEMPT:'The earlier send result is being checked. Review the original message first.'});
const exclusion=value=>exclusionCopy[value]||(/^[A-Z][A-Z0-9_]+$/.test(value)?'Review this shift in Office before making another enquiry.':value);

// The parent supplies genuine bounded read projections and current-frame guard.
// Commands alone determine permission/eligibility/recipient/clocks and authority.
export function createContactManualEnquiryControls({contexts,selections,choices=[],audience='MANAGER',command,isCurrent,openAction}){
 if(typeof command!=='function'||typeof isCurrent!=='function'||!['WORKER','MANAGER'].includes(audience)||!Array.isArray(contexts)||!contexts.length||contexts.length>100)throw Error('ENQUIRY_CONTEXT_REQUIRED');
 const available=new Map();
 for(const context of contexts){
  decodeContactManualEnquiryRow(context,context);const key=context.candidate_id+'/'+context.client_id;
  if(available.has(key))throw Error('ENQUIRY_SCOPE_REPEATED');available.set(key,clone(context));
 }
 // Choice text is presentation from actual bounded workspace children; IDs must
 // also belong to the exact native read projection. It grants no eligibility.
 if(!Array.isArray(choices)||choices.length>500)throw Error('ENQUIRY_CHOICE_INVALID');
 const choiceIds=new Set();
 for(const choice of choices){
  const context=available.get(choice?.candidate_id+'/'+choice?.client_id);
  if(!context||!context.available_issue_ids.includes(choice.issue_id)||choiceIds.has(choice.issue_id))throw Error('ENQUIRY_CHOICE_INVALID');
  choiceIds.add(choice.issue_id);
 }
 const state={audience,reason:'',selections:[],busy:false,pending:null,review:null,reviewRequest:null,receipt:null,error:''};
 let notify=()=>{};
 const current=()=>{if(!isCurrent())throw Error('Return to the selected work before continuing.');};
 const snapshot=()=>clone(state);
 function validateSelections(value,allowEmpty=false){
  if(!Array.isArray(value)||(!allowEmpty&&!value.length)||value.length>100)throw Error('Select the shifts for this enquiry.');
  const scopes=new Set(),issues=new Set();
  for(const item of value){
   const key=item?.candidate_id+'/'+item?.client_id,context=available.get(key);
   if(!context||scopes.has(key)||!Array.isArray(item.selected_issue_ids)||!item.selected_issue_ids.length)throw Error('Refresh the selected work before reviewing.');scopes.add(key);
   for(const id of item.selected_issue_ids){if(!context.available_issue_ids.includes(id)||issues.has(id)||(choices.length&&!choiceIds.has(id)))throw Error('Refresh the selected work before reviewing.');issues.add(id);}
  }
  if(issues.size>500)throw Error('Select up to 500 shifts for one enquiry.');
  return value.map(item=>({candidate_id:item.candidate_id,client_id:item.client_id,selected_issue_ids:[...item.selected_issue_ids]}));
 }
 state.selections=validateSelections(selections);
 function edit({reason=state.reason,audience:nextAudience=state.audience,selections:nextSelections=state.selections}={}){
  current();if(state.busy||state.pending)throw Error('Check the original request before changing it.');
  if(state.receipt)throw Error('Refresh the workspace before starting another enquiry.');
  if(!['WORKER','MANAGER'].includes(nextAudience)||typeof reason!=='string'||[...reason].length>1000)throw Error('Check the audience and reason.');
  state.selections=validateSelections(nextSelections,true);state.reason=reason;state.audience=nextAudience;
  state.review=null;state.reviewRequest=null;state.error='';notify();return snapshot();
 }
 function request(){
  validateSelections(state.selections);
  if(!state.reason.trim()||[...state.reason].length>1000)throw Error('Enter a reason of up to 1,000 characters for this new enquiry.');
  if(typeof globalThis.crypto?.randomUUID!=='function')throw Error('Refresh the page to create a request identity.');
  return {version:'CONTACT_MANUAL_ENQUIRY_V1',request_id:globalThis.crypto.randomUUID(),audience:state.audience,reason:state.reason,
   scopes:state.selections.map(item=>{const context=available.get(item.candidate_id+'/'+item.client_id);
    if(!context.actions.some(a=>a.audience===state.audience&&a.enabled))throw Error('Refresh the selected work before reviewing.');
    return {...clone(item),expected_scope_revision:context.scope_revision,expected_checking_revision:context.checking_revision};})};
 }
 async function run(action,retry=false){
  current();if(state.busy)throw Error('The original request is being checked.');
  if(state.receipt)throw Error('Refresh the workspace before starting another enquiry.');
  if(state.pending){if(!retry||state.pending.action!==action)throw Error('Retry the original request before changing it.');}
  else{
   if(retry)throw Error('There is no original request to retry.');
   if(action==='CONTACT_MANUAL_ENQUIRY_PREVIEW'){
    try{state.pending={action,payload:request()};}
    catch(error){state.error=error.message;notify();throw error;}
   }
   else{
    if(!state.review?.can_accept||!state.reviewRequest)throw Error('Review the current enquiry before confirming.');
    state.pending={action,payload:{...clone(state.reviewRequest),review_id:state.review.review_id,review_digest:state.review.review_digest}};
   }
  }
  const original=clone(state.pending);state.busy=true;state.error='';notify();
  try{
   const result=await command(original.action,clone(original.payload));current();
   if(action==='CONTACT_MANUAL_ENQUIRY_PREVIEW'){
    state.review=clone(decodeContactManualEnquiryReview(result,original.payload));state.reviewRequest=clone(original.payload);
   }else state.receipt=clone(decodeContactManualEnquiryReceipt(result,original.payload,state.review));
   state.pending=null;return snapshot();
  }catch(error){
   if([400,409].includes(error?.status)&&knownRefusals.has(error?.code)){
    state.pending=null;state.review=null;state.reviewRequest=null;
    state.error='The selected work changed. Refresh the workspace before reviewing again.';
   }else state.error='The original result is being checked. Retry the same request.';
   throw error;
  }finally{state.busy=false;notify();}
 }
 function html(){
  const disabled=state.busy||!!state.pending||!!state.receipt,review=state.review;
  const count=state.selections.reduce((n,s)=>n+s.selected_issue_ids.length,0);
  const selectedIds=new Set(state.selections.flatMap(s=>s.selected_issue_ids));
  const selection=choices.length?'<div class="ws-child-scroll" role="region" aria-label="Choose enquiry shifts"><table class="ws-child-table"><thead><tr><th>Select</th><th>Worker / client / shift</th><th>Worker says</th><th>Current record</th><th>Status</th></tr></thead><tbody>'+choices.map(c=>`<tr><td><input type="checkbox" data-enquiry-issue="${escape(c.issue_id)}" aria-label="Select ${escape(c.label)}"${selectedIds.has(c.issue_id)?' checked':''}${disabled?' disabled':''}></td><td>${escape(c.label)}</td><td>${escape(c.candidate_hours||'—')}</td><td>${escape(c.system_hours||'—')}</td><td>${escape(c.status||'—')}</td></tr>`).join('')+'</tbody></table></div>':'';
  const groups=review?.groups.map(group=>`<section><h4>${group.audience==='MANAGER'?`Manager: ${escape(group.recipient.manager_address)}`:'Worker in MyTMS'}</h4>${group.preview.rows.length?
   '<div class="ws-child-scroll" role="region" aria-label="Selected shifts"><table class="ws-child-table"><thead><tr><th>Worker / client</th><th>Work date</th><th>Hours to check</th><th>Current record / issue</th></tr></thead><tbody>'+group.preview.rows.map(row=>`<tr><td>${escape(row.displayName)}<br>${escape(row.clientName)}</td><td>${escape(date(row.workDate))}</td><td>${escape(row.start)}–${escape(row.end)} · ${escape(row.breakMinutes)} min break</td><td>${escape(({HOURS_DIFFER:'Hours differ',NHSP_ABSENT:'Not shown in NHSP',SOURCE_ABSENT:'Not shown in the system',HEALTHROSTER_NOT_FINALISED:'HealthRoster not finalised'})[row.issueFamily])}${!row.systemAbsent&&row.systemStart!==null&&row.systemEnd!==null?`<br>${escape(row.systemStart)}–${escape(row.systemEnd)}${row.systemBreakMinutes!==null?` · ${escape(row.systemBreakMinutes)} min break`:''}`:''}</td></tr>`).join('')+'</tbody></table></div>':`<p>${escape(group.preview.plain_body)}</p>`}</section>`).join('')||'';
  const members=review?.scope_results.flatMap(scope=>scope.members).map(member=>`<li>${escape(date(member.cutoff.work_date))}: ${member.eligible?'Included':escape(exclusion(member.exclusion_reason))} · ${escape(member.same_purpose_reason)}${member.last_accepted_send?`<p>Last accepted sending: ${escape(uk(member.last_accepted_send.accepted_at_utc))}</p>`:''}${member.next_routine_step?`<p>Next routine step: ${escape(uk(member.next_routine_step.due_at_utc))}</p>`:''}${member.cooldown_until_utc?`<p>At review: ${escape(member.cooldown_remaining_seconds)} seconds of the manual resend wait remained, until ${escape(uk(member.cooldown_until_utc))}.</p>`:''}${!member.cutoff.routine.in_scope?'<p>The routine automation limit can be exceeded for this deliberate enquiry.</p>':''}${member.resolution_action?`<button type="button" class="btn btn-outline" data-enquiry-resolution="${escape(member.issue_id)}">${escape(member.resolution_action.caption)}</button>`:''}</li>`).join('')||'';
  return `<section class="ws-contact-manual-enquiry"><h3>New enquiry</h3><p>${count} selected shift${count===1?'':'s'}. Review the earlier contact and explain why another enquiry is useful.</p>
   ${selection}${state.error?`<p role="alert">${escape(state.error)}</p>`:''}${state.receipt?'<p role="status">Your enquiry was saved. Delivery is pending. Refresh the workspace to check progress.</p>':''}
   <fieldset ${disabled?'disabled':''}><legend>Audience</legend><label><input type="radio" name="enquiry_audience" value="MANAGER"${state.audience==='MANAGER'?' checked':''}>Manager</label><label><input type="radio" name="enquiry_audience" value="WORKER"${state.audience==='WORKER'?' checked':''}>Worker in MyTMS</label><label>Why another contact would help<textarea name="enquiry_reason" maxlength="1000">${escape(state.reason)}</textarea></label></fieldset>
   <div data-enquiry-reviewed>${groups}${members?`<h4>Eligibility and earlier contact</h4><ul>${members}</ul>`:''}${review&&!review.can_accept?'<p role="status">This enquiry cannot be confirmed. Review the exclusions and refresh the selected work.</p>':''}</div>
   <div class="ws-toolbar">${state.pending?`<button type="button" class="btn" data-enquiry-retry${state.busy?' disabled':''}>Retry original ${state.pending.action==='CONTACT_MANUAL_ENQUIRY_ACCEPT'?'confirmation':'review'}</button>`:`<button type="button" class="btn btn-outline" data-enquiry-preview${disabled?' disabled':''}>Preview message</button>${review?.can_accept?`<button type="button" class="btn" data-enquiry-accept${disabled?' disabled':''}>${state.audience==='MANAGER'?'Send email':'Send worker question'}</button>`:''}`}</div></section>`;
 }
 function mount(host){
  if(typeof host?.querySelector!=='function')throw Error('ENQUIRY_HOST_REQUIRED');
  const render=()=>{
   host.innerHTML=html();
   host.querySelector('[name="enquiry_reason"]')?.addEventListener('input',event=>{
    if(state.busy||state.pending||state.receipt)return;state.reason=event.target.value;
    state.review=null;state.reviewRequest=null;
    // Keep focus/caret while ensuring an old confirmation cannot remain live.
    host.querySelector('[data-enquiry-accept]')?.remove();
    host.querySelector('[data-enquiry-reviewed]')?.replaceChildren();
   });
   host.querySelectorAll('[data-enquiry-issue]').forEach(input=>input.addEventListener('change',()=>{
    const ids=new Set([...host.querySelectorAll('[data-enquiry-issue]:checked')].map(el=>el.dataset.enquiryIssue));
    const selections=[...available.values()].map(c=>({candidate_id:c.candidate_id,client_id:c.client_id,
     selected_issue_ids:choices.filter(x=>x.candidate_id===c.candidate_id&&x.client_id===c.client_id&&ids.has(x.issue_id)).map(x=>x.issue_id)})).filter(s=>s.selected_issue_ids.length);
    edit({selections});
   }));
   host.querySelectorAll('[name="enquiry_audience"]').forEach(input=>input.addEventListener('change',()=>edit({audience:input.value})));
   host.querySelector('[data-enquiry-preview]')?.addEventListener('click',()=>{void run('CONTACT_MANUAL_ENQUIRY_PREVIEW').catch(()=>{});});
   host.querySelector('[data-enquiry-accept]')?.addEventListener('click',()=>{void run('CONTACT_MANUAL_ENQUIRY_ACCEPT').catch(()=>{});});
   host.querySelector('[data-enquiry-retry]')?.addEventListener('click',()=>{void run(state.pending.action,true).catch(()=>{});});
   host.querySelectorAll('[data-enquiry-resolution]').forEach(button=>button.addEventListener('click',()=>{
    current();const action=state.review?.scope_results.flatMap(s=>s.members).find(m=>m.issue_id===button.dataset.enquiryResolution)?.resolution_action;
    if(action&&typeof openAction==='function')openAction(clone(action));
   }));
  };
  notify=render;render();return()=>{notify=()=>{};host.replaceChildren();};
 }
 return Object.freeze({edit,preview:()=>run('CONTACT_MANUAL_ENQUIRY_PREVIEW'),accept:()=>run('CONTACT_MANUAL_ENQUIRY_ACCEPT'),
  retry:()=>state.pending?run(state.pending.action,true):Promise.reject(Error('There is no original request to retry.')),snapshot,html,mount});
}

if(typeof window==='object'&&!window.CloudTMSContactManualEnquiryV1){
 Object.defineProperty(window,'CloudTMSContactManualEnquiryV1',{value:Object.freeze({create:createContactManualEnquiryControls,decodeRow:decodeContactManualEnquiryRow})});
}
