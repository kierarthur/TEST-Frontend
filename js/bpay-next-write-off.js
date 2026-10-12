/* FC-11: one native recovery component; all balances and outcomes are server owned. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextWriteOff=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const cash=v=>typeof v==='string'&&/^(0|[1-9][0-9]*)\.[0-9]{2}$/.test(v);
const pennies=v=>BigInt(v.split('.')[0])*100n+BigInt(v.split('.')[1]);
const money=v=>v==null?'—':'£'+v.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+v.split('.')[1];
const time=v=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(v)).replace(',','');
function open(options,seed={}){
 const doc=options.document,win=options.window,Office=win.CloudTMSBpayNextOffice,Cases=win.CloudTMSBpayNextCasePreview,History=win.CloudTMSBpayNextHistory;
 const caseId=String(seed.case_id??seed.finance_case_id??seed.id??'').toLowerCase(),candidateId=String(seed.candidate_id??'').toLowerCase(),ns=options.writeOffNamespace;
 if(!Office||!Cases||!History||![caseId,candidateId,options.actorId,ns?.agency_id].every(v=>UUID.test(v))||!/^\d+$/.test(ns?.owner_epoch)||BigInt(ns.owner_epoch)<=0n
   ||options.ownerReady?.()!==true||options.currentActorId?.()!==options.actorId||typeof options.showReadWindow!=='function')throw Error('Window unavailable');
 const namespace={environment:'TEST',agency_id:ns.agency_id.toLowerCase(),owner_epoch:ns.owner_epoch,actor_user_id:options.actorId.toLowerCase(),candidate_id:candidateId,case_id:caseId};
 const key='cloudtms.bpay-next.write-off.v1.'+JSON.stringify(namespace),storage=options.storage??win.sessionStorage,transport=options.transport??Office.createTransport(options);
 let frame,closed=false,busy=false,readBusy=false,authBusy=false,loading=true,component=null,caseState=null,record=null,journal=null,message='',failed=false,result=null,timer;
 const current=()=>!closed&&options.current?.()===true&&options.currentActorId?.()===options.actorId&&options.ownerReady?.()===true;
 const active=()=>current()&&frame?.active()===true;
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const body=el('section',undefined,'bpay-next-write-off'),subtitle=el('p',undefined,'bpay-next-write-off-subtitle'),warning=el('p','A write-off cannot be undone.','bpay-next-write-off-warning'),facts=el('dl',undefined,'bpay-next-write-off-facts');
 const form=el('div',undefined,'bpay-next-write-off-form'),scope=el('fieldset'),legend=el('legend','Write off'),allLabel=el('label'),partLabel=el('label'),all=el('input'),part=el('input'),allText=el('span'),partText=el('span');
 all.type=part.type='radio';all.name=part.name='bpay-next-write-off-scope';all.value='ALL';part.value='AMOUNT';part.checked=true;allLabel.append(all,allText);partLabel.append(part,partText);scope.append(legend,allLabel,partLabel);
 const amountLabel=el('label','Amount'),amount=el('input'),reasonLabel=el('label','Reason'),reason=el('textarea'),authLine=el('p','Confirm it is you','bpay-next-write-off-auth');
 amount.id='bpay-next-write-off-amount';amount.inputMode='decimal';amount.autocomplete='off';amountLabel.htmlFor=amount.id;reason.id='bpay-next-write-off-reason';reasonLabel.htmlFor=reason.id;reason.rows=3;reason.required=true;
 const fieldError=el('p',undefined,'ws-notice ws-notice--danger');fieldError.id='bpay-next-write-off-error';fieldError.dataset.nextLiveCopy='';fieldError.setAttribute('role','alert');fieldError.hidden=true;
 form.append(scope,amountLabel,amount,reasonLabel,reason,fieldError,authLine);
 const notice=el('p',undefined,'ws-notice'),draft=el('div',undefined,'bpay-next-write-off-draft'),footer=el('div',undefined,'bpay-next-window-actions');notice.setAttribute('aria-live','polite');notice.dataset.nextLiveCopy='';facts.dataset.nextFormattedMoney='';
 body.append(warning,facts,form,notice,draft);let resolve;const completion=new Promise(r=>resolve=r);
 const history=options.historyClient??History.createClient({...options,api:options.api(''),environment:'TEST',scope:{candidate_id:candidateId,timesheet_id:null}});
 function save(){storage.setItem(key,JSON.stringify({version:1,namespace,journal}));}
 const raw=storage.getItem(key);
 if(raw!==null){try{const saved=JSON.parse(raw);if(raw.length>16384||saved.version!==1||JSON.stringify(saved.namespace)!==JSON.stringify(namespace)||!saved.journal)throw Error();
   const args=JSON.parse(saved.journal.bytes);if(args.action!=='WRITE_OFF'||!UUID.test(args.case_component_id)||seed.case_component_id&&!same(args.case_component_id,seed.case_component_id)
     ||Office.requestBody('WRITE_OFF',Object.fromEntries(Object.entries(args).filter(([k])=>k!=='action')))!==saved.journal.bytes||typeof saved.journal.accepted!=='boolean')throw Error();
   journal={...saved.journal,unknown:!saved.journal.accepted};save();reason.value=args.reason;all.checked=args.scope==='ALL';part.checked=!all.checked;amount.value=args.amount??'';
  }catch{history.close();throw Error('Saved request unavailable');}}
 const button=(text,main,fn)=>{const destructive=main&&/^(Write off|Try again)/.test(text),b=el('button',text,'btn'+(main?' primary':'')+(destructive?' btn-warn bpay-next-write-off-destructive':''));b.type='button';if(destructive)b.dataset.nextDestructive='';if(!main)b.dataset.nextSecondary='';b.onclick=()=>{if(active())void fn();};return b;};
 function fact(label,value){facts.append(el('dt',label),el('dd',value));}
 function paint(){if(!current()||authBusy)return;
  const kind=component?.case_kind??seed.case_kind,noun=kind==='MANUAL_DEBT'?'Manual Debt':kind==='OVERPAYMENT'?'Overpayment recovery':['LOAN','ADVANCE'].includes(kind)?'Payment Advance':'Case';
  subtitle.textContent=noun+' · '+String(seed.candidate_name??seed.candidate_display_name??'Candidate')+(seed.candidate_reference?' · '+seed.candidate_reference:'');
  const terminal=record&&record.status!=='REQUESTED',done=record?.status==='WRITTEN_OFF',summary=caseState?.protection_summary,noBalance=cash(component?.outstanding_source_ex_vat)&&pennies(component.outstanding_source_ex_vat)===0n;
  facts.replaceChildren();if(done){fact('Written off',money(record.applied_amount));fact('Outstanding',money(record.remaining_amount));fact('Protected in a Draft',money(record.protected_amount));fact('Date',time(record.completed_at_utc).slice(0,10));}
  else{fact('Outstanding',money(component?.outstanding_source_ex_vat));fact('Protected in a Draft',money(summary?.protected_amount));fact('Can be written off',money(summary?.unreserved_capacity));}
  if(journal&&!terminal){const args=JSON.parse(journal.bytes);fact('Requested',args.scope==='ALL'?'All outstanding':money(normalAmount(args.amount)));fact('Reason',args.reason);}
  form.hidden=loading||journal!==null&&!terminal||done||noBalance;warning.hidden=done||noBalance;allText.textContent='All outstanding  '+money(component?.outstanding_source_ex_vat);partText.textContent='An amount  '+(summary?.unreserved_capacity===null?'—':'Up to '+money(summary?.unreserved_capacity));
  amountLabel.hidden=amount.hidden=all.checked;for(const n of [all,part,amount,reason])n.disabled=busy||readBusy||journal!==null;
  notice.textContent=message||(loading?'Loading…':busy?'Saving…':journal?journal.accepted?'Your request is being prepared.':'The result is not known yet.':noBalance?'There is no balance to write off.':summary?.unreserved_capacity===null?'The Draft balance is not available; refresh and try again.':'');notice.hidden=!notice.textContent;notice.className='ws-notice'+(failed?' ws-notice--danger':done?' is-success':'');notice.setAttribute('role',failed?'alert':'status');
  body.insertBefore(notice,failed?facts:draft);
  draft.replaceChildren();const binding=caseState?.first_protection;
  if(binding){const channel=binding.channel==='PAYE'?'PAYE ':binding.channel==='UMBRELLA'?'Umbrella ':'';draft.append(el('p',(terminal?'Current ':'')+channel+'Draft'),button('Open Draft',false,openDraft));}
  footer.replaceChildren();footer.hidden=false;frame?.setConfirmation(false);
  if(busy||readBusy){const b=button('Write off',true,submit);b.disabled=true;footer.append(b,button('Cancel',false,()=>frame.close()));return;}
  if(terminal){if(done)footer.hidden=true;else{const b=button(all.checked?'Write off all':'Write off',true,submit);b.disabled=true;footer.append(button('Cancel',false,()=>frame.close()),b,button('Refresh',false,fresh));}return;}
  if(journal){footer.append(button(journal.accepted?'Refresh':'Try again',true,journal.accepted?read:dispatch));return;}
  if(loading||!component){footer.append(button('Refresh',true,read),button('Cancel',false,()=>frame.close()));return;}
  if(noBalance){footer.append(button('Refresh',false,read));return;}
  const primary=button('Write off'+(all.checked?'':/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(amount.value)?' '+money(normalAmount(amount.value)):''),true,submit);
  primary.disabled=summary?.unreserved_capacity==null||!cash(component.outstanding_source_ex_vat)||pennies(component.outstanding_source_ex_vat)===0n;footer.append(button('Cancel',false,()=>frame.close()),primary);if(summary?.unreserved_capacity===null)footer.append(button('Refresh',false,read));
 }
 function normalAmount(v){const [a,b='']=v.split('.');return a+'.'+b.padEnd(2,'0');}
 function issue(code){return code==='BPAY_NEXT_WRITE_OFF_PROTECTED_CAPACITY'?'This amount is protected in a Draft; cancel the Candidate payment before trying again.'
  :code==='BPAY_NEXT_WRITE_OFF_AMOUNT_EXCEEDS_BALANCE'?'The amount exceeds the available balance.'
  :code==='BPAY_NEXT_WRITE_OFF_NO_BALANCE'?'There is no balance to write off.'
  :code==='BPAY_NEXT_WRITE_OFF_INPUT_PENDING'?'The Draft balance is not available; refresh and try again.'
  :code==='BPAY_NEXT_WRITE_OFF_COMPONENT_CHANGED'?'The Case has changed; refresh and try again.':'This recovery cannot be written off; refresh and try again.';}
 async function openDraft(){try{await Office.openCaseProtectedDraft({...options,transport,current:active},caseState.first_protection,candidateId);}catch{if(active()){message='Could not open this Draft; refresh and try again.';failed=true;paint();}}}
 async function read(){if(!active()||readBusy||busy||authBusy)return;readBusy=true;message='';failed=false;paint();
  try{const value=await transport.page('CASE_COMPONENTS',{candidate_id:candidateId,case_id:caseId,after_component_ordinal:null,limit:100});if(!active())return;
   if(value.complete!==true||value.next_cursor!==null||!value.rows.length)throw Error();const id=journal?JSON.parse(journal.bytes).case_component_id:seed.case_component_id;
   const rows=value.rows.filter(r=>r.instruction_kind==='RECOVERY'&&r.direction==='DEDUCTION'&&['LOAN','ADVANCE','MANUAL_DEBT','OVERPAYMENT'].includes(r.case_kind)&&(!id||same(r.case_component_id,id)));
   if(rows.length!==1||!same(rows[0].case_id,caseId)||!same(rows[0].candidate_id,candidateId)||!Cases.casePauseState(rows[0].pause_state))throw Error();
   component=rows[0];caseState=component.pause_state;loading=false;
   if(journal){await history.manifest();if(!active())return;const args=JSON.parse(journal.bytes),value=await history.section({section:'WRITE_OFF',parent_id:args.command_id,context_id:null,component_key:null});if(!active())return;
    if(value.page.rows.length!==1||!value.page.terminal)throw Error();const data=value.page.rows[0].data;
    if(!same(data.command_id,args.command_id)||!same(data.case_id,caseId)||!same(data.candidate_id,candidateId)||!same(data.case_component_id,args.case_component_id)||!same(data.actor_user_id,options.actorId)
      ||data.expected_component_revision!==args.expected_component_revision||data.requested_scope!==args.scope||data.input_amount!==(args.amount??null)||data.reason!==args.reason)throw Error();
    if(data.status!=='REQUESTED'){
     if(!['WRITTEN_OFF','BLOCKED','REVIEW'].includes(data.status)||![data.applied_amount,data.remaining_amount,data.protected_amount].every(cash)||pennies(data.protected_amount)>pennies(data.remaining_amount)
       ||typeof data.completed_at_utc!=='string'||!Number.isFinite(Date.parse(data.completed_at_utc)))throw Error();
     if(data.status==='WRITTEN_OFF'){if(!same(data.event_id,args.command_id)||data.issue_code!==null||pennies(data.applied_amount)<=0n||args.scope==='AMOUNT'&&pennies(data.applied_amount)!==pennies(normalAmount(args.amount))||args.scope==='ALL'&&pennies(data.remaining_amount)!==0n)throw Error();}
     else if(data.event_id!==null||pennies(data.applied_amount)!==0n||typeof data.issue_code!=='string')throw Error();
     const first=record===null;record=data;journal.accepted=true;save();message=data.status==='WRITTEN_OFF'?'Written off.':issue(data.issue_code);failed=data.status!=='WRITTEN_OFF';
     if(first&&data.status==='WRITTEN_OFF'){result={bpay_next:true,case_id:caseId,candidate_id:candidateId,page:value};try{await options.onCaseChanged?.(data,value);}catch{/* The exact terminal record remains authoritative; parent owns its refresh error. */}}
    }else{journal.accepted=true;save();}
   }
  }catch{if(active()){failed=true;message=journal?'The result is not known yet; refresh or try again.':'Could not load this recovery; refresh and try again.';}}
  finally{readBusy=false;if(active())paint();schedule();}
 }
 async function fresh(){if(!active()||!record||record.status==='WRITTEN_OFF')return;storage.removeItem(key);journal=null;record=null;message='';await read();}
 async function submit(){if(!active()||busy||readBusy||authBusy||journal||!component)return;fieldError.hidden=true;
  const error=!reason.value.trim()||new TextEncoder().encode(reason.value).length>1024?'Enter a reason.':!all.checked&&(!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(amount.value)||pennies(normalAmount(amount.value))<=0n)?'Enter an amount above £0.00.'
   :!all.checked&&(caseState.protection_summary.unreserved_capacity===null||pennies(normalAmount(amount.value))>pennies(caseState.protection_summary.unreserved_capacity))?'The amount exceeds the available balance.':null;
  if(error){fieldError.textContent=error;fieldError.hidden=false;(!reason.value.trim()?reason:amount).focus();return;}
  const args={command_id:(options.uuid??(()=>win.crypto.randomUUID()))(),case_component_id:component.case_component_id,expected_component_revision:component.component_revision,scope:all.checked?'ALL':'AMOUNT',reason:reason.value,...(!all.checked?{amount:amount.value}:{})};
  let persisted=false;authBusy=true;for(const n of footer.querySelectorAll('button'))n.disabled=true;
  try{const token=await Office.openBpayNextReauth({...options,transport,reauthCurrent:()=>current()&&frame.alive()},{action:'WRITE_OFF',...args});if(!active()||token===null)return;
   journal={bytes:Office.requestBody('WRITE_OFF',{...args,reauth_token:token}),accepted:false,unknown:false};save();persisted=true;
  }catch{if(!persisted)journal=null;if(active()){failed=true;message='Could not confirm this request; try again.';}}
  finally{authBusy=false;if(active())paint();}
  if(active()&&journal&&persisted)await dispatch();
 }
 async function dispatch(){if(!active()||busy||readBusy||authBusy||!journal||record)return;const previousUnknown=journal.unknown===true||journal.accepted;
  try{journal.unknown=true;save();}catch{failed=true;message='Could not save this request; try again.';paint();return;}
  busy=true;failed=false;message='';paint();
  try{const receipt=await transport.mutation('WRITE_OFF',journal.bytes);if(!active())return;const args=JSON.parse(journal.bytes);
   if(!same(receipt.command_id,args.command_id)||!same(receipt.case_id,caseId)||!same(receipt.case_component_id,args.case_component_id))throw Error();journal.accepted=true;save();
  }catch(error){if(active()){failed=true;if(!previousUnknown&&error instanceof Office.Failure&&['SERVER_REFUSED','AUTH_REQUIRED'].includes(error.code)&&!error.unknown){storage.removeItem(key);journal=null;message='The request was not accepted; refresh and try again.';}else message='The result is not known yet.';}}
  finally{busy=false;if(active())paint();}
  if(active()&&journal)await read();
 }
 function schedule(){win.clearTimeout(timer);if(!closed&&journal?.accepted&&!record)timer=win.setTimeout(()=>{if(active()&&!doc.hidden)void read();else schedule();},4000);}
 function visible(){if(active()&&!doc.hidden&&journal&&!record&&!authBusy)void read();}
 all.onchange=part.onchange=()=>paint();amount.oninput=()=>paint();
 doc.addEventListener('visibilitychange',visible);win.addEventListener('focus',visible);win.addEventListener('online',visible);
 frame=options.showReadWindow({title:'Write off',headerDetail:subtitle,small:true,confirmation:false,content:body,footer,canFocus:current,onMount:()=>{paint();void read();},onDismiss:()=>{closed=true;win.clearTimeout(timer);history.close();reason.value='';doc.removeEventListener('visibilitychange',visible);win.removeEventListener('focus',visible);win.removeEventListener('online',visible);if(record?.status==='WRITTEN_OFF')storage.removeItem(key);resolve(result);}});
 paint();return completion;
}
return Object.freeze({open});
});
