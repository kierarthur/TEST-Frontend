/* FC-05 native Manual Credit creation. Existing Case owners supply all financial facts. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextManualCredit=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function open(options,seed={}){
  const editId=String(seed.finance_case_id??seed.case_id??seed.id??'').toLowerCase(),editing=editId!=='';
  if(editing&&!UUID.test(editId))throw Error('Window unavailable');
  const doc=options.document,win=options.window,Office=win.CloudTMSBpayNextOffice,Cases=win.CloudTMSBpayNextCasePreview;
  if(!Office||!Cases||!UUID.test(options.actorId)||options.ownerReady?.()!==true||options.currentActorId?.()!==options.actorId
    ||typeof options.showReadWindow!=='function'||typeof options.pickCandidate!=='function')throw Error('Window unavailable');
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const body=el('section',undefined,'bpay-next-advance bpay-next-credit'),form=el('fieldset',undefined,'bpay-next-advance-form'),previewHost=el('div'),footer=el('div');
  const field=(label,name,{area=false,placeholder='',hint='',value=''}={})=>{
    const wrap=el('label',undefined,'bpay-next-advance-field'),title=el('span',label),input=el(area?'textarea':'input');input.id='bpay-next-credit-'+name;input.name=name;input.value=value;input.placeholder=placeholder;
    input.dataset.nextFocusKey='credit:'+name;input.dataset.nextExactInput='';wrap.append(title);
    if(name==='principal'){const money=el('div',undefined,'bpay-next-advance-currency'),prefix=el('span','£');prefix.setAttribute('aria-hidden','true');money.append(prefix,input);wrap.append(money);input.placeholder=placeholder.replace(/^£/,'');}else wrap.append(input);
    if(hint){const p=el('small',hint);p.id=input.id+'-hint';input.setAttribute('aria-describedby',p.id);wrap.append(p);}form.append(wrap);return input;
  };
  let candidateId=UUID.test(seed.candidate_id??'')?seed.candidate_id.toLowerCase():null;
  let candidateLabel=String(seed.candidate_display_name??seed.candidate_name??seed.candidate_label??'');
  let channel=String(seed.pay_method??seed.candidate?.pay_method??'').toUpperCase();if(!['PAYE','UMBRELLA'].includes(channel))channel=null;
  let channelKnown=Object.hasOwn(seed,'pay_method')||Boolean(seed.candidate&&Object.hasOwn(seed.candidate,'pay_method'));
  let editState=null,editInput=null,editPage=null,editLoading=editing,editReadBusy=false;
  const editCards=el('section',undefined,'bpay-next-case-edit-cards');editCards.hidden=!editing;
  const headerDetail=el('span',undefined,'bpay-next-progress-subtitle');headerDetail.hidden=!editing;headerDetail.dataset.nextLiveCopy='';
  let frame,view,controller,closed=false,generation=0,locked=false,accepted=false,pickerBusy=false,result=null,resolve,touched=false;
  const completion=new Promise(done=>{resolve=done;}),transport=options.transport??Office.createTransport(options),storage=options.storage??win.sessionStorage;
  const current=()=>!closed&&frame?.alive()===true&&options.currentActorId()===options.actorId&&options.ownerReady()===true&&options.current?.()!==false;
  const candidateWrap=el('div',undefined,'bpay-next-advance-field'),candidateTitle=el('span','Candidate'),pick=el('button',undefined,'bpay-next-advance-picker'),channelLine=el('small');
  pick.type='button';pick.dataset.nextFocusKey='credit:candidate';candidateWrap.append(candidateTitle,pick,channelLine);form.append(candidateWrap);
  const principal=field('Amount','principal',{placeholder:'£0.00'});principal.inputMode='decimal';principal.required=true;
  const methods=el('fieldset',undefined,'bpay-next-advance-method'),legend=el('legend','Tax');methods.append(legend);
  const radio=(label,value,hint)=>{const row=el('label'),input=el('input'),copy=el('span',label),sub=el('small',hint);input.type='radio';input.name='credit-tax';input.value=value;row.append(input,copy,sub);methods.append(row);return {input,sub};};
  const taxable=radio('Taxable','TAXABLE','Added to PAYE gross'),nonTaxable=radio('Not taxable','NON_TAXABLE','Added after PAYE net');form.append(methods);
  const reason=field('Comment','reason',{area:true,placeholder:'Required'}),note=field('Note','note',{area:true,placeholder:'Optional'});reason.required=true;
  const error=el('p','', 'bpay-next-advance-error');error.dataset.nextLiveCopy='';error.setAttribute('role','alert');error.setAttribute('aria-live','polite');form.append(error);
  const acceptedSubject=el('p','', 'bpay-next-advance-subject');acceptedSubject.dataset.nextLiveCopy='';acceptedSubject.hidden=true;body.append(editCards,form,acceptedSubject,previewHost);
  function input(){return {candidate_id:candidateId,case_kind:'CREDIT',case_subtype:'MANUAL_CREDIT',tax_treatment:taxable.input.checked?'TAXABLE':nonTaxable.input.checked?'NON_TAXABLE':null,principal:principal.value.trim(),due_date:editing?editInput?.due_date??null:null,start_monday:null,
    weekly_due:null,week_count:null,minimum_earnings_threshold:null,take_home_floor_override:null,reason:reason.value.trim(),note:note.value.trim()===''?null:note.value,original_liability_reference:null};}
  function problem(){
    const value=input();if(!candidateId)return 'Choose a Candidate before Preview.';
    if(channelKnown&&channel===null)return 'Set a pay channel on the Candidate, then preview again.';
    if(value.tax_treatment===null)return 'Choose taxable or not taxable.';
    if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.principal)||!/[1-9]/.test(value.principal))return 'Enter an amount greater than £0.00, with at most two decimal places.';
    if(value.principal.length>1024)return 'Enter a shorter amount before Preview.';
    const bytes=v=>new TextEncoder().encode(v).byteLength;
    if(!value.reason)return 'Enter a comment before Preview.';
    if(value.reason.includes('\0')||bytes(value.reason)>2048)return 'Enter a shorter comment before Preview.';
    if(value.note!==null&&(value.note.includes('\0')||bytes(value.note)>2048))return 'Enter a shorter note before Preview.';
    if(!Cases.caseInput(value))return 'Check the entered details before Preview.';return '';
  }
  function paintForm(){
    headerDetail.textContent=editing?(candidateLabel||'Candidate')+' · '+(channel==='UMBRELLA'?'Umbrella':channel??'—'):'';
    pick.textContent=candidateLabel||'Choose Candidate';channelLine.textContent='Pay channel: '+(channel==='UMBRELLA'?'Umbrella':channel??'—')+'.';
    taxable.sub.hidden=nonTaxable.sub.hidden=channel!=='PAYE';form.disabled=locked||pickerBusy||(editing&&(editLoading||editState?.editable!==true));form.hidden=accepted||editing&&(editLoading||editState?.editable===false);candidateWrap.hidden=editing;
    acceptedSubject.textContent=candidateLabel||'Candidate';acceptedSubject.hidden=!accepted||editing;
    const issue=touched?problem():'';error.textContent=issue;error.hidden=issue==='';error.id='bpay-next-credit-field-error';
    const fields=[principal,taxable.input,nonTaxable.input,reason,note];for(const field of fields){field.removeAttribute('aria-invalid');const described=(field.getAttribute('aria-describedby')??'').split(' ').filter(v=>v&&v!==error.id);if(described.length)field.setAttribute('aria-describedby',described.join(' '));else field.removeAttribute('aria-describedby');}
    if(issue){const field=/amount/.test(issue)?principal:/comment/.test(issue)?reason:/note/.test(issue)?note:null;
      if(field){field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',((field.getAttribute('aria-describedby')??'')+' '+error.id).trim());field.closest('.bpay-next-advance-field').append(error);}else if(/Candidate|pay channel/.test(issue))candidateWrap.append(error);else if(/taxable/.test(issue))methods.append(error);else form.append(error);}
  }
  function fillInput(v){principal.value=v.principal;reason.value=v.reason;note.value=v.note??'';taxable.input.checked=v.tax_treatment==='TAXABLE';nonTaxable.input.checked=v.tax_treatment==='NON_TAXABLE';}
  function restorePending(){const state=controller.snapshot();if(!state.pending)return;
    const v=JSON.parse(state.pending.bytes);if(v.case_kind!=='CREDIT'||(editing&&v.action!=='CASE_EDIT')||(!editing&&v.action!=='CASE_CREATE'))return false;
    if(editing){if(v.case_id.toLowerCase()!==editId)return false;editInput=v;}
    fillInput(v);
  }
  async function openDraft(protection){if(!current()||!frame.active())return;try{await Office.openCaseProtectedDraft({...options,transport,current:()=>current()&&frame.active()},protection,candidateId);}catch{if(current()&&frame.active())previewHost.replaceChildren(el('p','Could not open this Draft; refresh and try again.','bpay-next-case-result'));}}
  async function loadEdit(){
    if(!editing||editReadBusy||!current()||!frame.active())return;
    editReadBusy=true;editLoading=true;paintForm();editCards.hidden=false;editCards.replaceChildren(el('p','Loading…','bpay-next-case-result'));footer.replaceChildren();
    const ticket=++generation;
    try{
      if(!candidateId)throw Error('Candidate unavailable');
      const value=await Office.readCaseEditContext(transport,candidateId,editId);
      if(!current()||!frame.active()||ticket!==generation)return;
      const kind=value.page.rows[0].case_kind;if(!['CREDIT'].includes(kind)||value.state.input===null)throw Error('Case unavailable');
      editState=value.state;editInput=value.state.input;editPage=value.page;channel=value.page.rows[0].source_pay_channel;channelKnown=true;
      fillInput(editInput);Office.paintCaseEditCards(doc,editCards,editPage,candidateLabel,openDraft);editLoading=false;mount();
    }catch(error){if(current()&&frame.active()&&ticket===generation){editLoading=true;editCards.replaceChildren(el('p','Could not load this Case; refresh and try again.','bpay-next-case-result'));
      const refresh=el('button','Refresh','btn');refresh.type='button';refresh.onclick=()=>void loadEdit();footer.replaceChildren(refresh);paintForm();}}
    finally{editReadBusy=false;}
  }
  function mount(){
    if(!current()||!frame.active()||editing&&editLoading)return;view?.destroy();const ticket=++generation;paintForm();if(!candidateId){previewHost.replaceChildren(el('p','Choose a Candidate before Preview.','bpay-next-case-result'));footer.replaceChildren();const p=el('button','Preview','btn'),a=el('button','Apply','btn primary');p.disabled=a.disabled=true;footer.append(p,a);return;}
    controller=Office.createController({...options,storage,transport,uuid:options.uuid??(()=>win.crypto.randomUUID()),reviewJournalQualifier:editing?'.case-edit.'+candidateId+'.'+editId:'.case-create.'+candidateId});if(restorePending()===false){locked=true;form.hidden=true;acceptedSubject.textContent=candidateLabel||'Candidate';acceptedSubject.hidden=false;previewHost.replaceChildren(el('p','Finish the previous Case change before creating a Manual Credit.','bpay-next-case-result'));footer.replaceChildren();footer.classList.add('bpay-next-window-actions');footer.hidden=true;return;}
    const saved=controller.snapshot(),pendingBody=saved.pending?JSON.parse(saved.pending.bytes):null;
    const editContext=editing?{case_id:editId,expected_case_revision:pendingBody?.expected_case_revision??(saved.case_edit?String(BigInt(saved.case_edit.case_revision)-1n):editState.case_revision)}:null;
    if(editing&&!editState.editable&&!saved.pending&&!saved.case_edit){locked=true;accepted=false;paintForm();previewHost.replaceChildren();footer.replaceChildren();footer.hidden=true;return;}
    footer.hidden=false;
    view=Office.mountCasePreviewFooter({...options,document:doc,candidateId,controller,transport,storage,uuid:options.uuid??(()=>win.crypto.randomUUID()),host:previewHost,footer,editContext,getInput:input,onEditRefresh:()=>loadEdit(),
      onEditBlocked:async(receipt,page)=>{editState=page.rows[0].edit_state;editPage=page;editInput=editState.input;if(editInput)fillInput(editInput);Office.paintCaseEditCards(doc,editCards,page,candidateLabel,openDraft);win.queueMicrotask(()=>{if(current()&&frame.active())mount();});},validInput:v=>Cases.caseInput(v)&&!(channelKnown&&channel===null),creditPresentation:true,inputHint:()=>touched&&problem()?'Preview first.':problem(),
      current:()=>current()&&frame.active()&&generation===ticket,
      onState:state=>{if(generation!==ticket||!current())return;locked=state.busy||state.pending||state.accepted;accepted=state.accepted;if(state.preview){channel=state.preview.preview_token.context.pay_channel;channelKnown=true;}paintForm();},
      onApplied:async(receipt,page)=>{if(!current()||!frame.active()||generation!==ticket||page.rows.some(r=>r.candidate_id.toLowerCase()!==candidateId))throw Error('Case unavailable');
        if(editing&&options.onCaseEdited)await options.onCaseEdited(receipt,page);else if(options.onCaseCreated)await options.onCaseCreated(receipt,page);if(!current()||generation!==ticket)throw Error('Context changed');result={bpay_next:true,case_id:receipt.case_id,candidate_id:candidateId,page};win.queueMicrotask(()=>{if(current()&&frame.active())void frame.close();});}
    });
  }
  function changed(){if(locked||!current())return;touched=true;paintForm();view?.changed();}
  form.addEventListener('input',changed);form.addEventListener('change',changed);
  pick.onclick=()=>{if(editing||!current()||!frame.active()||locked||pickerBusy)return;pickerBusy=true;paintForm();const ticket=generation;
    try{options.pickCandidate(picked=>{if(!current()||generation!==ticket||locked)return;const id=String(picked?.id??picked?.candidate_id??'');if(!UUID.test(id))return;view?.destroy();view=null;generation++;controller=null;accepted=false;candidateId=id.toLowerCase();candidateLabel=String(picked.label??picked.display_name??picked.candidate?.display_name??'');const raw=String(picked.candidate?.pay_method??picked.pay_method??'').toUpperCase();channel=['PAYE','UMBRELLA'].includes(raw)?raw:null;channelKnown=Boolean(picked.candidate&&Object.hasOwn(picked.candidate,'pay_method'))||Object.hasOwn(picked,'pay_method');touched=false;pickerBusy=false;paintForm();});}catch{pickerBusy=false;error.textContent='Could not choose a Candidate; try again.';error.hidden=false;}};
  frame=options.showReadWindow({title:editing?'Edit Manual Credit':'New Manual Credit',small:true,content:body,footer,headerDetail,canFocus:current,onMount:()=>{pickerBusy=false;if(editing&&!editState){void loadEdit();return;}if(view){paintForm();view.refresh();}else mount();},onDismiss:()=>{closed=true;generation++;view?.destroy();resolve(result);}});
  return completion;
}
return Object.freeze({open});
});
