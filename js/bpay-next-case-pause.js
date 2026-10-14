/* FC10 native whole-Case status controls; money and schedules stay server owned. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextCasePause=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const money=v=>v===null?'—':'£'+v.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(v.split('.')[1]??'').padEnd(2,'0');
function open(options,seed={},requestedAction='CASE_PAUSE'){
 const doc=options.document,win=options.window,Office=win.CloudTMSBpayNextOffice,Cases=win.CloudTMSBpayNextCasePreview;
 const caseId=String(seed.case_id??seed.finance_case_id??seed.id??'').toLowerCase(),candidateId=String(seed.candidate_id??'').toLowerCase();
 if(!Office||!Cases||!UUID.test(caseId)||!UUID.test(candidateId)||!UUID.test(options.actorId)
   ||!['CASE_PAUSE','CASE_RESUME'].includes(requestedAction)||options.ownerReady?.()!==true
   ||options.currentActorId?.()!==options.actorId||typeof options.showReadWindow!=='function')throw Error('Window unavailable');
 let frame,closed=false,readBusy=false,loading=true,page=null,state=null,outcome=null,result=null,message='',failed=false,action=requestedAction;
 const current=()=>!closed&&options.current?.()===true&&options.currentActorId?.()===options.actorId&&options.ownerReady?.()===true;
 const active=()=>current()&&frame?.active()===true;
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const content=el('section',undefined,'bpay-next-create-confirmation bpay-next-case-pause'),heading=el('h2'),icon=el('span','?','bpay-next-question-icon'),title=el('span');
 icon.setAttribute('aria-hidden','true');heading.append(icon,title);
 const consequence=el('p'),facts=el('p',undefined,'bpay-next-confirm-values'),notice=el('p'),protection=el('div',undefined,'bpay-next-pause-protection');
 const reasonWrap=el('div',undefined,'bpay-next-pause-reason'),label=el('label','Reason'),reason=el('textarea');
 reason.id='bpay-next-pause-reason';label.htmlFor=reason.id;reason.placeholder='Optional';reason.rows=3;reason.dataset.nextFocusKey='reason';
 const fieldError=el('p');fieldError.id='bpay-next-pause-field-error';fieldError.setAttribute('role','alert');fieldError.hidden=true;
 for(const node of [consequence,facts,notice,fieldError])node.dataset.nextLiveCopy='';
 facts.dataset.nextFormattedMoney='';
 reasonWrap.append(label,reason,fieldError);notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 content.append(heading,consequence,facts,reasonWrap,notice,protection);
 const footer=el('div',undefined,'bpay-next-window-actions');let resolve;const completion=new Promise(r=>{resolve=r;});
 const transport=options.transport??Office.createTransport(options);
 const controller=Office.createController({...options,transport,storage:options.storage??win.sessionStorage,
   uuid:options.uuid??(()=>win.crypto.randomUUID()),reviewJournalQualifier:'.case-pause.'+candidateId+'.'+caseId});
 const saved=controller.snapshot();
 if(saved.run_id!==null||saved.worker_id!==null||saved.case_edit!==null||saved.case_pause!==null&&(!same(saved.case_pause.case_id,caseId)||!same(saved.case_pause.candidate_id,candidateId)))throw Error('Window unavailable');
 if(saved.pending){const b=JSON.parse(saved.pending.bytes);
   if(!['CASE_PAUSE','CASE_RESUME'].includes(b.action)||!same(b.case_id,caseId))throw Error('Window unavailable');
   action=b.action;reason.value=b.reason??'';loading=false;
 }else if(saved.case_pause){action=saved.case_pause.action;reason.value=JSON.parse(saved.case_pause.request_bytes).reason??'';}
 else controller.bind({candidate_id:candidateId});
 function button(text,primary,handler){const b=el('button',text,'btn'+(primary?' primary':''));b.type='button';if(!primary)b.dataset.nextSecondary='';b.onclick=()=>void handler();return b;}
 function restoreFocus(){win.queueMicrotask(()=>{if(active())(footer.querySelector('button:not(:disabled)')??doc.getElementById('btnCloseModal'))?.focus();});}
 async function openDraft(binding){if(!active())return;try{await Office.openCaseProtectedDraft({...options,transport,current:()=>active()},binding,candidateId);}catch{if(active()){message='Could not open this Draft; refresh and try again.';failed=true;paint();}}}
 function protectionLine(summary,binding){protection.replaceChildren();if(!summary||summary.protected_count==='0')return;
   const several=BigInt(summary.protected_count)>1n,historical=outcome?.phase==='BLOCKED',text=summary.protected_amount===null
     ?'This Case is already being prepared in '+(several?'Drafts.':'a Draft.')
     :money(summary.protected_amount)+' is already in '+(several?'Drafts.':'a Draft.');
   const currentChanged=historical&&(!Cases.equal(summary,state?.protection_summary)||!Cases.equal(binding,state?.first_protection));
   const line=el('p',historical?'At the request, '+text.charAt(0).toLowerCase()+text.slice(1).replace(' is already in ',' was in ').replace(' is already being prepared in ',' was being prepared in '):text),next=el('p',currentChanged
     ?'The Draft position has changed. Refresh before trying again.':binding?.next_action==='CANCEL_CANDIDATE_PAYMENT'
     ?'Cancel the Candidate payment before trying again.'
     :binding?.next_action==='DISCARD_PREPARATION'?'Discard the Draft before trying again.':'Remove the Candidate from its Draft or discard the Draft before trying again.');
   line.dataset.nextFormattedMoney='';protection.append(line,next);
   if(binding){const b=button('Open Draft',false,()=>openDraft(binding));b.classList.add('bpay-next-pause-open-draft');protection.append(b);}
 }
 function paint(){if(!current())return;const s=controller.snapshot(),pending=s.pending!==null,accepted=s.case_pause!==null;
   const pause=action==='CASE_PAUSE',noun=page?.rows[0]?.case_kind==='OVERPAYMENT'?'Overpayment recovery':page?.rows[0]?.case_kind==='MANUAL_DEBT'?'Manual Debt':page?'Payment Advance':'Case';
   title.textContent=outcome?(outcome.phase==='BLOCKED'?'This Case cannot be changed.':outcome.phase==='CASE_PAUSED'?'Paused — not collected.':'Recovery resumed.'):(pause?'Pause':'Resume')+' recovery for this '+noun+'?';
   icon.hidden=outcome!==null;
   frame?.setConfirmation(outcome===null);
   const unfundedPayout=page?.rows.some(r=>r.instruction_kind==='PAYOUT'&&/[1-9]/.test(r.outstanding_source_ex_vat));
   consequence.textContent=pause?(unfundedPayout?'New Drafts do not pay out or collect this Payment Advance until you resume it.':'New Drafts take no repayments until you resume it.'):'New Drafts can collect repayments again.';
   const recovery=page?.rows.find(r=>r.instruction_kind==='RECOVERY'&&r.direction==='DEDUCTION');
   facts.textContent=(String(seed.candidate_display_name??seed.candidate_name??seed.candidate_label??'Candidate'))
     +(pause&&recovery?.weekly_due_source_ex_vat!==null&&recovery?.weekly_due_source_ex_vat!==undefined?' · '+money(recovery.weekly_due_source_ex_vat)+' weekly':'')
     +(recovery?' · Outstanding '+money(recovery.outstanding_source_ex_vat):'');
   facts.hidden=false;consequence.hidden=outcome!==null;reasonWrap.hidden=loading||pending||accepted||outcome!==null||state?.supported!==true||state.protection_summary?.protected_count!=='0'||state.status!==(pause?'OPEN':'PAUSED');
   reason.disabled=s.busy||readBusy;notice.textContent=message||(loading?'Loading…':s.busy?'Saving…':pending?'The result is not known yet.':accepted?'Your request is being prepared.':'');
   if(outcome!==null&&notice.textContent===title.textContent)notice.textContent='';
   notice.hidden=notice.textContent==='';notice.setAttribute('role',failed?'alert':'status');
   const summary=outcome?.protection_summary??state?.protection_summary,binding=outcome?.first_protection??state?.first_protection;
   const protectedCase=summary!==null&&summary!==undefined&&summary.protected_count!=='0';
   protectionLine(summary,binding);if(protectedCase&&!pending&&!accepted&&outcome===null){notice.textContent='This Case cannot be changed while it is in a Draft.';notice.hidden=false;notice.setAttribute('role','alert');}content.classList.toggle('is-failed',failed||protectedCase);notice.className=failed||protectedCase?'ws-notice ws-notice--danger':'ws-notice';
   footer.replaceChildren();footer.hidden=false;
   if(s.busy||readBusy){const b=button('Refresh',false,read);b.disabled=true;footer.append(b);return;}
   if(pending){footer.append(button('Close',false,()=>frame.close()),button('Try again',true,retry));return;}
   if(accepted){footer.append(button('Close',false,()=>frame.close()),button('Refresh',true,read));return;}
   if(outcome!==null){if(outcome.phase==='BLOCKED')footer.append(button('Refresh',false,refresh));else footer.hidden=true;return;}
   if(loading||state?.supported!==true){footer.append(button('Close',false,()=>frame.close()),button('Refresh',true,refresh));return;}
   if(protectedCase){footer.append(button('Refresh',false,refresh),button('Close',true,()=>frame.close()));return;}
   const expectedStatus=pause?'OPEN':'PAUSED';
   if(state.status!==expectedStatus){notice.textContent='The Case has changed. Refresh and try again.';notice.hidden=false;notice.setAttribute('role','alert');notice.className='ws-notice ws-notice--danger';footer.append(button('Close',false,()=>frame.close()),button('Refresh',true,refresh));return;}
   footer.append(button(pause?'Keep collecting':'Keep paused',false,()=>frame.close()),button(pause?'Pause recovery':'Resume recovery',true,submit));
 }
 async function read(){if(!active()||readBusy||controller.snapshot().busy||controller.snapshot().pending!==null)return;
   readBusy=true;loading=true;failed=false;message='';paint();
   try{const accepted=controller.snapshot().case_pause;
     const value=await transport.page('CASE_COMPONENTS',{candidate_id:candidateId,case_id:caseId,after_component_ordinal:null,limit:100,...(accepted?{pause_command_id:accepted.command_id}:{})});
     if(!active())return;
     if(value.complete!==true||value.next_cursor!==null||!value.rows.length||value.rows.length>100)throw Error('Case unavailable');
     const currentState=value.rows[0].pause_state;
     if(!Cases.casePauseState(currentState)||value.rows.some(r=>!same(r.case_id,caseId)||!same(r.candidate_id,candidateId)||!Cases.equal(r.pause_state,currentState)))throw Error('Case unavailable');
     page=value;state=currentState;loading=false;
     if(accepted){const receipt=value.rows[0].pause_receipt;
       if(!Cases.casePauseReceipt(receipt)||value.rows.some(r=>!Cases.equal(r.pause_receipt,receipt))
         ||!same(receipt.command_id,accepted.command_id)||!same(receipt.case_id,caseId)||!same(receipt.candidate_id,candidateId)
         ||receipt.action!==accepted.action||receipt.sequence!==accepted.sequence||receipt.expected_case_revision!==accepted.expected_case_revision)throw Error('Result unavailable');
       if(receipt.applied_case_revision!==null&&BigInt(state.case_revision)<BigInt(receipt.applied_case_revision))throw Error('Result unavailable');
       if(receipt.phase!=='PENDING'){controller.finishCasePause(receipt);outcome=receipt;
         if(receipt.phase==='BLOCKED'){failed=true;message=['BPAY_NEXT_CASE_PROTECTED_SLICE','BPAY_NEXT_CASE_PROTECTION_PENDING'].includes(receipt.issue_code)
           ?'The request was refused because this Case was in a Draft.':receipt.issue_code==='BPAY_NEXT_CASE_PROTECTION_CHANGED'||receipt.issue_code==='BPAY_NEXT_CASE_PAUSE_STATE_CHANGED'
           ?'The Case has changed. Refresh and try again.':'This Case cannot be changed; refresh and try again.';
         }else {message=receipt.phase==='CASE_PAUSED'?'Paused — not collected.':'Recovery resumed.';
           if(state.status!==receipt.applied_status||BigInt(state.case_revision)>BigInt(receipt.applied_case_revision))message+=' Current status: '+(state.status==='OPEN'?'Collecting':state.status==='PAUSED'?'Paused':state.status==='WRITTEN_OFF'?'Written off':'Completed')+'.';
           result={bpay_next:true,case_id:caseId,candidate_id:candidateId,page};await options.onCaseChanged?.(receipt,value);}
       }
     }else if(!state.supported){failed=true;message='This Case cannot be changed; refresh and try again.';}
   }catch{if(active()){failed=true;loading=true;message='Could not load this Case; refresh and try again.';}}
   finally{readBusy=false;if(active()){paint();restoreFocus();}}
 }
 async function refresh(){if(!active()||readBusy)return;outcome=null;message='';await read();}
 async function submit(){if(!active()||readBusy||controller.snapshot().busy||!state?.supported||state.protection_summary?.protected_count!=='0')return;
   if(!Cases.pauseReason(reason.value)){fieldError.textContent='Enter a shorter reason.';fieldError.hidden=false;reason.setAttribute('aria-invalid','true');reason.setAttribute('aria-describedby',fieldError.id);reason.focus();return;}
   fieldError.hidden=true;reason.removeAttribute('aria-invalid');reason.removeAttribute('aria-describedby');
   try{const pending=controller.mutate(action,{command_id:(options.uuid??(()=>win.crypto.randomUUID()))(),case_id:caseId,expected_case_revision:state.case_revision,reason:reason.value===''?null:reason.value});paint();await pending;
     if(active()){paint();await read();}
   }catch{if(active()){failed=true;message=controller.snapshot().pending?'The result is not known yet.':'Could not change this Case; refresh and try again.';paint();restoreFocus();}}
 }
 async function retry(){if(!active()||controller.snapshot().busy)return;try{const pending=controller.retry();paint();await pending;if(active()){paint();await read();}}
   catch{if(active()){failed=true;message='The result is not known yet.';paint();restoreFocus();}}}
 frame=options.showReadWindow({title:action==='CASE_PAUSE'?'Pause recovery':'Resume recovery',small:true,confirmation:true,content,footer,
   canFocus:current,onMount:()=>{paint();if(page===null&&!controller.snapshot().pending&&!readBusy)void read();},onDismiss:()=>{closed=true;resolve(result);}});
 paint();return completion;
}
return Object.freeze({open});
});
