/* WB33 exact saved-owner consent; original controller and publication readers only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextClearChoice=api;})(typeof globalThis==='object'?globalThis:this,function(){'use strict';
const labels={DAY:'Day',NIGHT:'Night',SAT:'Sat',SUN:'Sun',BH:'Bank holiday'},uk=v=>v.split('-').reverse().join('/');
const pounds=v=>{if(v==null)return '—';const [whole,fraction='']=v.split('.');return '£'+BigInt(whole).toLocaleString('en-GB')+'.'+fraction.padEnd(2,'0');};
const identity=r=>JSON.stringify([r.approved_line_id,r.rate_family,r.rate_code]);
function anchorValid(anchor,reply,scope,api){
 if(anchor===null)return true;
 if(!anchor||Object.keys(anchor).sort().join(',')!=='approved_line_id,component_key,expected_revision_id,rate_code,rate_family,work_id'||anchor.work_id!==scope.work_id||anchor.expected_revision_id!==scope.expected_revision_id||typeof anchor.component_key!=='string'||new TextEncoder().encode(anchor.component_key).length>8192)return false;
 const work=reply.context.works.find(w=>w.work_id===anchor.work_id&&w.expected_revision_id===anchor.expected_revision_id);
 try{api.normalizeResolutionInput({resolution:{candidate_id:scope.candidate_id,works:[{work_id:anchor.work_id,expected_revision_id:anchor.expected_revision_id,rows:[{approved_line_id:anchor.approved_line_id,rate_family:anchor.rate_family,rate_code:anchor.rate_code,intent:null}]}],reason:null}});}catch{return false;}
 const row=work?.rows.find(r=>identity(r)===identity(anchor));return !row||row.original_basis.component_key===anchor.component_key;
}
function retained(options,address){
 const win=options.window??options.document?.defaultView,api=win?.CloudTMSBpayNextResolution,context=address.context??options.context,actor=String(options.actorId||'').toLowerCase();
 if(!api||!context?.agency_id)return null;
 const namespace={agency_id:context.agency_id,actor_user_id:actor,candidate_id:address.candidate_id},storage=options.storage??win.localStorage,key='cloudtms.bpay-next.clear-window.v1.'+JSON.stringify(namespace),saved=storage.getItem(key);
 if(saved===null)return null;if(new TextEncoder().encode(saved).length>327680)throw Error('Recovery unavailable');const record=JSON.parse(saved);
 if(record.version!==1||!['RATES','COMPONENT','CHANNEL'].includes(record.parent_kind)||record.parent_kind!==options.clearParentKind||![record.scope.work_id,record.parent_work_id].includes(address.work_id)||record.scope.candidate_id!==namespace.candidate_id||record.reply.context.agency_id!==namespace.agency_id||record.reply.context.actor_user_id!==actor)throw Error('Recovery unavailable');
 api.validateResolutionResponse(record.reply,{resolution:{clear_review:record.scope}},actor);api.normalizeResolutionCommand('RESOLUTION_CLEAR',record.args,actor);
 if(!anchorValid(record.anchor,record.reply,record.scope,api)||record.parent_kind==='RATES'&&record.scope.owner_family!=='WORK_BUCKET'||record.parent_kind==='COMPONENT'&&(!record.anchor||record.anchor.rate_family!==address.rate_family||record.anchor.rate_code!==address.rate_code))throw Error('Recovery unavailable');
 if(typeof record.body!=='string'||new TextEncoder().encode(record.body).length>32768||record.body!==JSON.stringify({action:'RESOLUTION_CLEAR',args:record.args,readback:false})||JSON.stringify(record.args.context)!==JSON.stringify(api.resolutionWriteContext(record.reply.context)))throw Error('Recovery unavailable');
 for(const w of record.args.works)for(const r of w.rows)if(!record.reply.clear_review.owners.some(o=>o.work_id===w.work_id&&o.expected_revision_id===w.expected_revision_id&&identity(o)===identity(r)&&o.owner_id===r.expected_decision_id&&o.owner_version===r.expected_decision_version&&o.clear_class==='RESOLVED_AND_CLEARABLE'))throw Error('Recovery unavailable');
 const pending=storage.getItem('cloudtms.bpay-next.resolution-command.v1.'+JSON.stringify(namespace));
 if(record.receipt){api.validateResolutionCommandReceipt(record.receipt,'RESOLUTION_CLEAR',record.args);if(!record.receipt.received||pending!==null)throw Error('Recovery unavailable');}
 else if(pending!==null){if(new TextEncoder().encode(pending).length>65536||JSON.parse(pending).body!==record.body)throw Error('Recovery unavailable');}
 return {...record,key};
}
function open(options,address){
 const doc=options.document??options.host?.ownerDocument,win=options.window??doc?.defaultView,api=win?.CloudTMSBpayNextResolution,client=options.client??win?.CloudTMSBpayNextWorkbench?.createWorkbenchClient(options);
 if(!doc||!api||!client||typeof options.current!=='function'||typeof options.onRestored!=='function'||!options.preparationTransport)throw Error('Clear unavailable');
 const saved=retained(options,address),scope=saved?.scope??{candidate_id:address.candidate_id,work_id:address.work_id,expected_revision_id:address.expected_revision_id??address.revision_id,owner_family:address.owner_family,owner_id:address.owner_id??null};
 api.normalizeResolutionInput({resolution:{clear_review:scope}});
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const content=el('div',undefined,'bpay-next-clear-confirmation'),header=el('div',undefined,'bpay-next-window-subtitle'),footer=el('div',undefined,'bpay-next-clear-footer'),status=el('p');
 content.dataset.nextFormattedMoney='';status.dataset.nextLiveCopy='';status.setAttribute('role','status');header.dataset.nextLiveCopy='';
 let frame,closed=false,busy=false,reply=saved?.reply??null,controller=null,receipt=saved?.receipt??null,includeLinked=false,error='',generation=0,timer=null,restoreState=null,restoring=false,record=saved,operation='Loading…';
 const storage=options.storage??win.localStorage;
 function retain(args,value=null){const anchor=record?.anchor??options.restorationAnchor??null;if(!anchorValid(anchor,reply,scope,api)||!['RATES','COMPONENT','CHANNEL'].includes(options.clearParentKind))throw Error('Recovery unavailable');const namespace={agency_id:reply.context.agency_id,actor_user_id:reply.context.actor_user_id,candidate_id:scope.candidate_id},key='cloudtms.bpay-next.clear-window.v1.'+JSON.stringify(namespace);record={version:1,scope,parent_kind:options.clearParentKind,parent_work_id:options.parentWorkId??scope.work_id,anchor,reply,args,body:JSON.stringify({action:'RESOLUTION_CLEAR',args,readback:false}),receipt:value};const raw=JSON.stringify(record);if(new TextEncoder().encode(raw).length>327680)throw Error('Recovery unavailable');storage.setItem(key,raw);record.key=key;}
 const alive=()=>!closed&&options.ownerReady()===true&&String(options.currentActorId()||'').toLowerCase()===options.actorId.toLowerCase()&&(!frame||frame.alive()),current=()=>alive()&&options.current()===true;
 const button=(text,fn,kind='')=>{const n=el('button',text,'btn'+(kind?' '+kind:''));n.type='button';n.onclick=()=>void fn();return n;};
 const keepLabel=()=>options.channel?'Keep decision':scope.owner_family==='GROSS'?'Keep amount':'Keep rate';
 const keep=button(keepLabel(),()=>frame.close()),cancel=button(options.channel?'Cancel decision':scope.owner_family==='GROSS'?'Cancel amount':'Cancel rate',()=>submit(),'btn-warn'),retry=button('Try again',()=>recover()),refresh=button('Refresh',()=>load());
 cancel.dataset.nextDestructive='';footer.append(keep,cancel,retry,refresh);
 const chosen=()=>reply?.clear_review.owners.filter(o=>!o.linked||includeLinked)??[];
 const plain=e=>e?.reload||e?.reload_required||e?.reloadRequired||['BPAY_NEXT_RESOLUTION_STALE','BPAY_NEXT_RESOLUTION_BASIS_CHANGED','BPAY_NEXT_RESOLUTION_POSITION_BASIS_CHANGED'].includes(e?.code)?'The list has changed; refresh and try again.':e?.code==='BPAY_NEXT_RESOLUTION_SCOPE_TOO_LARGE'?'There are too many matching payments to show together.':'Could not cancel this choice; try again.';
 function render(){
  if(!alive())return;content.replaceChildren();status.textContent=error||(busy?operation:'');status.setAttribute('role',error?'alert':'status');content.setAttribute('aria-busy',String(busy));content.classList.toggle('is-stale',Boolean(error)&&Boolean(reply));if(status.textContent)content.append(status);
  const progress=Boolean(receipt)||Boolean(controller?.pending());frame?.setConfirmation(!progress);if(progress&&frame?.active())doc.getElementById('modalTitle').textContent=receipt?'Choice removed':'Cancel saved choice';keep.hidden=progress;keep.textContent=keepLabel();keep.disabled=busy;cancel.hidden=!reply||progress||Boolean(error)||chosen().some(o=>o.clear_class!=='RESOLVED_AND_CLEARABLE');cancel.disabled=busy||Boolean(error)||!current()||chosen().some(o=>o.clear_class!=='RESOLVED_AND_CLEARABLE');
  retry.hidden=!controller?.pending()&&!receipt;retry.disabled=busy;refresh.hidden=(!error&&!chosen().some(o=>o.clear_class!=='RESOLVED_AND_CLEARABLE'))||Boolean(controller?.pending())||Boolean(receipt);refresh.disabled=busy;refresh.classList.toggle('btn-primary',!refresh.hidden);retry.classList.toggle('btn-primary',progress);
  if(controller?.pending()){if(status.textContent!=='The result has not been confirmed.')content.append(el('p','The result has not been confirmed.'));retry.textContent=controller.canRetry()?'Try again':'Check result';retry.onclick=()=>void(controller.canRetry()?retryOriginal():recover());return;}
  if(receipt){const success=el('p','Choice removed.','bpay-next-component-success');success.setAttribute('role','status');success.dataset.nextLiveCopy='';content.append(success);retry.textContent='Check progress';retry.onclick=()=>void restore();for(const w of receipt.result.works){const facts=reply?.context.works.find(c=>c.work_id===w.work_id);content.append(el('p',facts?'Timesheet w/e '+uk(facts.week_ending_date)+' · Processing':'Timesheet · Processing'));}return;}
  if(!reply){content.append(el('p',busy?'Loading the saved choice…':'The saved choice is unavailable.'));return;}
  const heading=el('h2',scope.owner_family==='GROSS'?'Cancel the resolved gross total?':options.channel?'Cancel the resolved pay channel?':'Cancel the resolved rate?'),icon=el('span','!','bpay-next-component-question bpay-next-component-question-danger');icon.setAttribute('aria-hidden','true');heading.prepend(icon);content.append(heading,el('p',[reply.clear_review.header.candidate_display_name,reply.clear_review.header.candidate_reference].filter(Boolean).join(' · ')),el('p','This removes the saved choice for the payments below.'));
  const h=reply.clear_review.header;header.textContent=[h.candidate_display_name,h.candidate_reference].filter(Boolean).join(' · ');
  const linked=[...new Set(reply.clear_review.owners.filter(o=>o.linked).map(o=>o.work_id))];let linkedControl;if(linked.length){linkedControl=el('label',undefined,'bpay-next-clear-linked');const tick=el('input');tick.type='checkbox';tick.checked=includeLinked;tick.disabled=busy||Boolean(error);tick.onchange=()=>{includeLinked=tick.checked;render();};linkedControl.append(tick,el('span','Also cancel for '+linked.length+' linked Timesheet'+(linked.length===1?'':'s')));}
  const list=el('div',undefined,'bpay-next-clear-list');for(const o of chosen()){const row=el('div',undefined,'bpay-next-clear-row'),name=el('div');name.append(el('strong',(labels[o.rate_code]??(o.rate_family==='ADJUSTMENT'?'Adjustment':'Additional pay'))+' · '+o.client_display_name),el('small','Timesheet w/e '+uk(o.week_ending_date)));const amount=el('div');amount.append(el('strong',pounds(o.amount_ex_vat)),el('small','Saved pay · '+(o.target_pay_channel==='UMBRELLA'?'Umbrella, ex VAT':'PAYE')));row.append(name,amount);list.append(row);if(o.clear_class!=='RESOLVED_AND_CLEARABLE')list.append(el('p','The saved amount cannot be checked yet.'));}content.append(list);
  if(linkedControl)content.append(linkedControl);const count=new Set(chosen().map(o=>o.work_id)).size;content.append(el('p','Cancels for '+count+' Timesheet'+(count===1?'':'s')+'. Any Draft already created stays unchanged.'));
  for(const reason of ['IN_DRAFT','CHANGED','UNAVAILABLE']){const n=reply.clear_review.excluded.filter(x=>x.reason===reason).length;if(n)content.append(el('p',n+' linked Timesheet'+(n===1?' is':'s are')+(reason==='IN_DRAFT'?' in a Draft and will stay unchanged.':reason==='CHANGED'?' changed and will not be included.':' unavailable and will not be included.')));}
 }
 async function load(){
  if(busy||receipt||controller?.pending()||!current())return;busy=true;operation='Loading…';error='';const ticket=++generation;render();
  try{const context=address.context??options.context;if(context?.agency_id){const namespace={agency_id:context.agency_id,actor_user_id:options.actorId.toLowerCase(),candidate_id:scope.candidate_id};if(storage.getItem('cloudtms.bpay-next.resolution-command.v1.'+JSON.stringify(namespace))!==null)throw Error('Other choice pending');}const next=await client.loadWorkbenchPage('RESOLUTION_CONTEXT',{resolution:{clear_review:scope}});if(!current()||ticket!==generation)return;const staged=api.createResolutionCommandController({...options,window:win,current},api.resolutionWriteContext(next.context));if(staged.pending())throw Error('Other choice pending');reply=next;includeLinked=false;controller=staged;}
  catch(e){if(current()&&ticket===generation)error=plain(e);}finally{busy=false;if(current()&&ticket===generation)render();}
 }
 async function accept(value){if(!record)throw Error('Recovery unavailable');api.validateResolutionCommandReceipt(value,'RESOLUTION_CLEAR',record.args);if(!value.received)throw Error('Recovery unavailable');receipt=value;restoreState=null;error='';try{retain(record.args,value);}catch{error='Choice removed; keep this window open until the Timesheet is updated.';}render();await restore();}
 async function submit(){
  if(busy||!current()||frame?.active()!==true||!reply||chosen().some(o=>o.clear_class!=='RESOLVED_AND_CLEARABLE'))return;
  const selected=chosen(),works=reply.works.map(w=>({work_id:w.work_id,expected_revision_id:w.expected_revision_id,rows:selected.filter(o=>o.work_id===w.work_id).map(o=>({approved_line_id:o.approved_line_id,rate_family:o.rate_family,rate_code:o.rate_code,intent:null,expected_decision_id:o.owner_id,expected_decision_version:o.owner_version}))})).filter(w=>w.rows.length);
  const args={request_id:win.crypto.randomUUID(),candidate_id:scope.candidate_id,context:api.resolutionWriteContext(reply.context),works,reason:null,zero_confirmed:false};
  try{
   api.normalizeResolutionCommand('RESOLUTION_CLEAR',args,options.actorId.toLowerCase());
   const anchor=options.restorationAnchor??null;if(!anchorValid(anchor,reply,scope,api))throw Error('Invalid parent');
   const readWorks=works.map(w=>({...w,rows:[...new Map(w.rows.map(r=>{const x={approved_line_id:r.approved_line_id,rate_family:r.rate_family,rate_code:r.rate_code,intent:null};return [identity(x),x];})).values()]}));
   if(anchor){const w=readWorks.find(w=>w.work_id===anchor.work_id);if(!w)throw Error('Invalid parent');if(!w.rows.some(r=>identity(r)===identity(anchor)))w.rows.push({approved_line_id:anchor.approved_line_id,rate_family:anchor.rate_family,rate_code:anchor.rate_code,intent:null});}
   const read={resolution:{candidate_id:scope.candidate_id,works:readWorks,reason:null}};api.normalizeResolutionInput(read);
   if(readWorks.reduce((n,w)=>n+w.rows.length,0)>100||new TextEncoder().encode(JSON.stringify(read.resolution)).length>30000)throw Object.assign(Error(),{code:'BPAY_NEXT_RESOLUTION_SCOPE_TOO_LARGE'});
  }catch(e){error=plain(e);render();return;}

  busy=true;operation='Cancelling…';error='';render();try{const namespace={agency_id:args.context.agency_id,actor_user_id:args.context.actor_user_id,candidate_id:scope.candidate_id};if(storage.getItem('cloudtms.bpay-next.resolution-command.v1.'+JSON.stringify(namespace))!==null)throw Error('Other choice pending');retain(args);const value=await controller.execute('RESOLUTION_CLEAR',args);if(current()&&value){busy=false;await accept(value);}}catch(e){if(!controller.pending()&&!receipt&&record?.key){storage.removeItem(record.key);record=null;}if(current())error=controller.pending()?'The result has not been confirmed.':plain(e);}finally{busy=false;if(alive())render();}
 }
 async function recover(){
  if(busy||!current()||frame?.active()!==true)return;if(receipt){await restore();return;}if(!controller?.pending())return;busy=true;operation='Checking…';error='';render();
  try{let value=await controller.recover();if(current()&&value?.received){busy=false;await accept(value);}else if(current()&&controller.canRetry()){error='The choice has not been cancelled.';retry.textContent='Try again';retry.onclick=()=>void retryOriginal();}}
  catch(e){if(current())error=plain(e);}finally{busy=false;if(alive())render();}
 }
 async function retryOriginal(){if(busy||!current()||!controller?.canRetry())return;busy=true;operation='Cancelling…';error='';render();try{const value=await controller.retry();if(current()&&value){busy=false;await accept(value);}}catch(e){if(current())error=controller.pending()?'The result has not been confirmed.':plain(e);}finally{busy=false;if(alive())render();}}
 async function restore(){
  if(restoring||busy||!receipt||!reply||!current())return;restoring=true;busy=true;operation='Updating…';error='';const ticket=generation,start=Date.now();let pages=0;
   if(timer!==null){win.clearTimeout(timer);timer=null;}
   if(!restoreState)restoreState=receipt.result.works.map(w=>({work:w,after:null,complete:false,mapped:new Map(),wanted:new Set([...record.args.works.find(c=>c.work_id===w.work_id).rows.map(r=>reply.context.works.find(c=>c.work_id===w.work_id).rows.find(c=>identity(c)===identity(r)).original_basis.component_key),...(record.anchor?.work_id===w.work_id?[record.anchor.component_key]:[])])}));
  try{
   for(const state of restoreState){while(!state.complete&&pages<10&&Date.now()-start<5000){
    if(!current()||ticket!==generation||doc.hidden)return;const page=await options.preparationTransport.page('COMPONENTS',{work_id:state.work.work_id,expected_revision_id:state.work.published_revision_id,after_line_no:state.after,limit:100});pages++;
    if(!current()||ticket!==generation)return;for(const row of page.rows)if(state.wanted.has(row.component_key)){if(!row.position_ready||state.mapped.has(row.component_key))throw Error('Changed');state.mapped.set(row.component_key,row.approved_line_id);}
    if(page.complete){if(state.mapped.size!==state.wanted.size)throw Error('Changed');state.complete=true;}
    else{const next=page.next_cursor?.after_line_no;if(typeof next!=='string'||!/^([1-9][0-9]{0,18})$/.test(next)||BigInt(next)<=BigInt(state.after??'0'))throw Error('Changed');state.after=next;}
   }if(pages>=10||Date.now()-start>=5000)break;}
   if(!current()||ticket!==generation)return;
   if(restoreState.every(s=>s.complete)){
    if(pages>=10||Date.now()-start>=5000)return;
    const works=receipt.result.works.map(actual=>{const w=record.args.works.find(w=>w.work_id===actual.work_id),state=restoreState.find(s=>s.work.work_id===w.work_id),old=reply.context.works.find(c=>c.work_id===w.work_id),rows=w.rows.map(r=>({approved_line_id:state.mapped.get(old.rows.find(c=>identity(c)===identity(r)).original_basis.component_key),rate_family:r.rate_family,rate_code:r.rate_code,intent:null}));if(record.anchor?.work_id===w.work_id)rows.push({approved_line_id:state.mapped.get(record.anchor.component_key),rate_family:record.anchor.rate_family,rate_code:record.anchor.rate_code,intent:null});return {work_id:w.work_id,expected_revision_id:state.work.published_revision_id,rows:[...new Map(rows.map(r=>[identity(r),r])).values()]};});
    const fresh=await client.loadWorkbenchPage('RESOLUTION_CONTEXT',{resolution:{candidate_id:scope.candidate_id,works,reason:null}});if(!current()||ticket!==generation)return;
    for(const state of restoreState){
     if(state.status?.context&&['agency_id','actor_user_id','owner_epoch','workbench_revision','adoption_revision'].some(k=>state.status.context[k]!==fresh.context[k]))state.status=null;
     if(!state.status){state.status={after:null,complete:false,rows:new Map()};}
     while(!state.status.complete&&pages<10&&Date.now()-start<5000){
      if(!current()||ticket!==generation||doc.hidden)return;
      const page=await client.loadWorkbenchPage('GROUP_LINES',{candidate_id:scope.candidate_id,group_key:'WORK:'+state.work.work_id,channel:'ALL',section:'ALL',search:'',sort:'NAME_ASC',after:state.status.after,limit:100});pages++;
      if(!current()||ticket!==generation)return;
      if(['agency_id','actor_user_id','owner_epoch','workbench_revision','adoption_revision'].some(k=>page.context[k]!==fresh.context[k]))throw Error('Changed');
      state.status.context=Object.fromEntries(['agency_id','actor_user_id','owner_epoch','workbench_revision','adoption_revision'].map(k=>[k,page.context[k]]));
      for(const member of page.rows){if(member.work_id!==state.work.work_id||member.revision_id!==state.work.published_revision_id)throw Error('Changed');if(state.wanted.has(member.component_key)&&member.approved_line_id===state.mapped.get(member.component_key)){const old=state.status.rows.get(member.component_key)??[];const reason=['RATE_RESOLUTION_REQUIRED','GROSS_RESOLUTION_REQUIRED','CHANNEL_RESOLUTION_REQUIRED'].includes(member.reason_code)?member.reason_code:null;if(!old.some(r=>r.section===member.section&&r.reason_code===reason))old.push({section:member.section,reason_code:reason});state.status.rows.set(member.component_key,old);}}
      state.status.complete=page.complete;state.status.after=page.next_cursor;
      if(state.status.complete&&[...state.wanted].some(key=>!state.status.rows.has(key)))throw Error('Updated payment unavailable');
     }
    }
    if(restoreState.every(s=>s.status?.complete)){
     await options.onRestored(fresh,receipt,reply,restoreState.map(s=>({work_id:s.work.work_id,rows:[...s.status.rows].flatMap(([component_key,values])=>values.map(r=>({component_key,...r})))})));if(record?.key)storage.removeItem(record.key);if(alive()){busy=false;await frame.close();}return;
    }
   }
  }catch(e){if(current()&&ticket===generation){if(e?.serverCode==='BPAY_NEXT_CHOICE_REVISION_NOT_CURRENT'||e?.code==='BPAY_NEXT_CHOICE_REVISION_NOT_CURRENT')error='';else {for(const state of restoreState)state.status=null;error='Choice removed; could not load the updated Timesheet.';}}}
  finally{restoring=false;busy=false;if(alive())render();if(current()&&!error&&!doc.hidden&&restoreState?.some(s=>!s.complete||!s.status?.complete)){timer=win.setTimeout(()=>{timer=null;void restore();},1000);}}
 }
 const visible=()=>{if(!doc.hidden&&current()&&receipt)void restore();};doc.addEventListener('visibilitychange',visible);
 frame=options.showReadWindow({title:scope.owner_family==='GROSS'?'Cancel resolved gross total':options.channel?'Cancel resolved pay channel':'Cancel resolved rate',content,footer,headerDetail:header,small:true,confirmation:true,canFocus:current,beforeClose:()=>!busy,onDismiss:()=>{closed=true;generation++;if(timer!==null)win.clearTimeout(timer);doc.removeEventListener('visibilitychange',visible);options.onClearDismiss?.();}});
 if(saved&&!receipt){const namespace={agency_id:record.args.context.agency_id,actor_user_id:record.args.context.actor_user_id,candidate_id:scope.candidate_id},key='cloudtms.bpay-next.resolution-command.v1.'+JSON.stringify(namespace);if(storage.getItem(key)===null)storage.setItem(key,JSON.stringify({version:1,namespace:{...namespace,owner_epoch:record.args.context.owner_epoch},body:record.body}));controller=api.createResolutionCommandController({...options,window:win,current},record.args.context);}
 render();if(receipt)void restore();else if(controller?.pending())void recover();else void load();return Object.freeze({close:()=>frame.close(),alive:()=>frame.alive()});
}
return Object.freeze({open,retained});
});
