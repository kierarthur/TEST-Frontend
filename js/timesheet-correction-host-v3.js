(function(root){'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 const clone=value=>JSON.parse(JSON.stringify(value));
 const fail=code=>{throw new TypeError(code);};
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dto=()=>root.CloudTMSCorrectionContractV3||fail('CORRECTION_DTO_DEPENDENCY_REQUIRED');
 function identity(context){
  const ts=context?.timesheetDetails?.timesheet;
  if(context?.entity!=='timesheets'||!ts||!UUID.test(ts.timesheet_id||'')||context.timesheetHydration?.detailsLoaded!==true
   ||context.timesheetDetails.__placeholder||context.data?.timesheet_id!==ts.timesheet_id)return null;
  return ts;
 }
 function dailyEligible(context,actor){
  const ts=identity(context);
  return !!(ts&&actor?.role==='admin'&&UUID.test(actor.id||'')&&ts.sheet_scope==='DAILY'&&ts.contract_id===null
   &&ts.line_type==='HOURS'&&ts.is_adjustment===false&&ts.parent_timesheet_id===null&&ts.correction_id===null
   &&ts.is_current===true&&ts.archived_at_utc===null);
 }
 function capture({frame,context,actorId,currentActorId,getFrame,getStack}){
  const ts=identity(context),prefix=getStack().slice(),token=frame?._token,openToken=context?.openToken;
  if(!ts||!UUID.test(actorId||'')||frame?.kind!=='timesheets'||frame.entity!=='timesheets'||frame.mode!=='view'
   ||frame._ctxRef!==context||!token||!openToken||getFrame()!==frame||prefix.at(-1)!==frame)fail('CORRECTION_CURRENT_PARENT_REQUIRED');
  let timesheetId=ts.timesheet_id,generation=context.__timesheetLatestLifecycleMutationSeq??0,adopting=false;
  const current=()=>currentActorId()===actorId&&getFrame()===frame&&frame._ctxRef===context&&frame._token===token
   &&context.openToken===openToken&&frame.mode==='view'&&getStack().length===prefix.length&&prefix.every((x,i)=>getStack()[i]===x)
   &&(adopting||(context.data?.timesheet_id===timesheetId&&(context.__timesheetLatestLifecycleMutationSeq??0)===generation));
  const assertCurrent=()=>{if(!current())fail('CORRECTION_PARENT_CHANGED');};
  async function adopt(value,refresh){
   dto().validateResult(value);
   if(value.version===dto().VERSIONS.DAILY&&(value.placement.original_timesheet_id!==timesheetId||value.placement.current_timesheet_id!==timesheetId))fail('CORRECTION_DAILY_IDENTITY_CHANGED');
   assertCurrent();
   // A saved result is independent of payment application and invoice rendering.
   // Only a genuine committed placement selects a new current physical record.
   if(value.placement.status==='COMMITTED'){
    const tab=frame.currentTabKey,target=value.placement.current_timesheet_id;
    adopting=true;
    try{
     if(await refresh(target,tab)!==true||!current()||identity(context)?.timesheet_id!==target)fail('CORRECTION_CURRENT_READ_REQUIRED');
     timesheetId=target;generation=context.__timesheetLatestLifecycleMutationSeq??0;
    }finally{adopting=false;}
   }
   assertCurrent();context.__healthCorrectionResult=clone(value);
   return value;
  }
  return Object.freeze({frame,context,actorId,initialTimesheetId:timesheetId,current,assertCurrent,adopt});
 }
 function ownOverlay(binding,handle){
  binding.assertCurrent();
  if(!handle||typeof handle.dispose!=='function'||typeof handle.requestClose!=='function')fail('CORRECTION_OVERLAY_INVALID');
  const frame=binding.frame,previous=frame._healthCorrectionOverlay;
  if(previous&&previous!==handle)fail('CORRECTION_REVIEW_ALREADY_OPEN');
  frame._healthCorrectionOverlay=handle;
  const oldDetach=frame._detachGlobal,oldDismiss=frame._onDismiss;
  let removed=false;
  function remove(){
   if(removed)return;removed=true;
   if(frame._healthCorrectionOverlay===handle)delete frame._healthCorrectionOverlay;
   if(frame._detachGlobal===detach)frame._detachGlobal=oldDetach;
   if(frame._onDismiss===dismiss)frame._onDismiss=oldDismiss;
  }
  function dispose(){remove();handle.dispose();}
  function detach(...args){dispose();if(typeof oldDetach==='function')return oldDetach.apply(this,args);}
  function dismiss(...args){dispose();if(typeof oldDismiss==='function')return oldDismiss.apply(this,args);}
  frame._detachGlobal=detach;frame._onDismiss=dismiss;
  return Object.freeze({remove,dispose});
 }
 function activeOverlay(frame){
  return frame?.kind==='timesheets'&&frame.entity==='timesheets'&&frame._healthCorrectionOverlay?.active===true?frame._healthCorrectionOverlay:null;
 }
 function requestOverlayClose(frame,reason){
  const handle=activeOverlay(frame);if(!handle)return false;
  try{Promise.resolve(handle.requestClose(reason)).catch(()=>{});}catch{}
  return true;
 }
 function moreHtml(context,actor){
  const ts=identity(context);if(!ts)return '';
  if(ts.sheet_scope==='DAILY')return `<details class="health-correction-more" data-health-correction-more><summary>More</summary><button type="button" class="btn btn-outline" data-health-daily-rates${dailyEligible(context,actor)?'':' disabled'}>Apply updated rates</button>${dailyEligible(context,actor)?'':'<p class="mini">This rate review is unavailable for the current record or permission.</p>'}<p data-health-correction-notice role="status"></p></details>`;
  if(ts.sheet_scope!=='WEEKLY'||!UUID.test(ts.contract_id||''))return '';
  // Current Office has neither the reviewed Bank CM17 module nor a declared
  // native Move capability projection. Do not invent a server DTO key/permission.
  return '<details class="health-correction-more" data-health-correction-more><summary>More</summary><button type="button" class="btn btn-outline" data-health-contract-move disabled>Change Contract</button><p class="mini">This check is temporarily unavailable. Try again.</p><p data-health-correction-notice role="status"></p></details>';
 }
 const financial={NOT_REQUIRED:'No pay update required',REGISTERED:'Pay update registered',PROCESSING:'Pay update processing',APPLIED:'Pay update applied',ACTION_REQUIRED:'Pay result needs attention'};
 const billing={NOT_REQUIRED:'No invoice correction required',PREPARING_DRAFTS:'Invoice drafts being prepared',DRAFTS_READY:'Invoice drafts ready for review',PARTIALLY_ISSUED:'Invoice correction partly issued',ISSUED:'Invoice correction issued',RETRY_WAIT:'Invoice preparation waiting to retry',ACTION_REQUIRED:'Invoice result needs attention'};
 function resultHtml(context){
  const value=context?.__healthCorrectionResult;if(!value)return '';
  try{dto().validateResult(value);}catch{return '';}
  const heading=value.state==='COMPLETE'?(value.purpose==='CONTRACT_CORRECTION'?'Contract corrected':'Updated rates applied'):'Saved correction result';
  const effect=(value,key)=>value===null?'':`<p data-health-correction-effect="${key}"></p>`;
  const actions=[...value.next_actions,...value.links],available=new Set(['OPEN_TIMESHEET:TIMESHEET','OPEN_INVOICE:INVOICE']);
  const controls=actions.map((action,index)=>{const enabled=action.enabled&&available.has(action.kind+':'+action.target_type),reason=!action.enabled?action.disabled_reason:enabled?null:'This action is temporarily unavailable.';
   return `<div><button type="button" class="btn btn-outline" data-health-correction-action="${index}"${enabled?'':' disabled'}>${escape(action.caption)}</button>${reason?`<p class="mini" data-health-correction-action-reason="${index}"></p>`:''}</div>`;}).join('');
  return `<section class="health-correction-result card" data-health-correction-result aria-live="polite"><h3>${heading}</h3><p>${escape(financial[value.financial.status])}</p>${effect(value.financial.summary,'financial')}<p>${escape(billing[value.billing.status])}</p>${effect(value.billing.visible_summary,'billing')}${controls}<p data-health-correction-action-notice role="status"></p></section>`;
 }
 function fillResult(element,context){
  const value=context?.__healthCorrectionResult;if(!element||!value)return;dto().validateResult(value);
  for(const [key,effect] of [['financial',value.financial.summary],['billing',value.billing.visible_summary]]){
   const node=element.querySelector(`[data-health-correction-effect="${key}"]`);
   if(node&&effect!==null)node.textContent=effect.visibility==='FULL'?effect.text:'Restricted for your current role.';
  }
  const actions=[...value.next_actions,...value.links],available=new Set(['OPEN_TIMESHEET:TIMESHEET','OPEN_INVOICE:INVOICE']);
  actions.forEach((action,index)=>{const node=element.querySelector(`[data-health-correction-action-reason="${index}"]`);if(node)node.textContent=!action.enabled?action.disabled_reason:available.has(action.kind+':'+action.target_type)?'':'This action is temporarily unavailable.';});
 }
 async function resolveAction(action,owners){
  dto().validateAction(action);if(!action.enabled)fail('CORRECTION_ACTION_DISABLED');
  // The returned URL is descriptive. Dispatch only an exact typed native owner.
  const key=action.kind+':'+action.target_type,owner=owners?.[key];
  if(typeof owner!=='function')fail('CORRECTION_ACTION_DEPENDENCY_REQUIRED');
  return owner(clone(action));
 }
 root.CloudTMSHealthCorrectionHostV3=Object.freeze({identity,dailyEligible,capture,ownOverlay,activeOverlay,requestOverlayClose,moreHtml,resultHtml,fillResult,resolveAction});
 if(typeof module==='object'&&module.exports)module.exports=root.CloudTMSHealthCorrectionHostV3;
})(typeof window!=='undefined'?window:globalThis);
