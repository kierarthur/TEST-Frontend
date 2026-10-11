/* EX-08 closed mirror of the exact Worker contract; no browser money calculation. */
(function(root,factory){const api=factory(root.CloudTMSBpayNextUi);if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextPayMethodChange=api;})(typeof globalThis==='object'?globalThis:this,function(Ui){
'use strict';
// EX-08: exact existing GET/POST contracts; SQL alone owns the future change.
const enc=new TextEncoder(),UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const equal=(a,b)=>object(a)&&object(b)?Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k])):Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>equal(v,b[i])):a===b;
const whole=v=>typeof v==='string'&&/^(?:0|[1-9]\d{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n;
function field(v,t){if(t.endsWith('?'))return v===null||field(v,t.slice(0,-1));
 if(t==='uuid')return typeof v==='string'&&UUID.test(v);
 if(t==='integer')return whole(v);if(t==='positive')return whole(v)&&v!=='0';
 if(t==='channel')return ['PAYE','UMBRELLA'].includes(v);if(t==='boolean')return typeof v==='boolean';
 if(t==='money')return typeof v==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(v)&&enc.encode(v).length<=1024;
 if(t==='date')return typeof v==='string'&&/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 if(t==='key'||t==='text')return typeof v==='string'&&!v.includes('\0')&&enc.encode(v).length<=(t==='key'?1024:1024)&&(t!=='key'||v.length>0);return false;}
const shape=(v,s)=>object(v)&&Object.keys(v).length===Object.keys(s).length&&Object.entries(s).every(([k,t])=>Object.hasOwn(v,k)&&field(v[k],t));
const CONTEXT={agency_id:'uuid',actor_user_id:'uuid',owner_epoch:'positive',candidate_id:'uuid',source_method:'channel',source_umbrella_id:'uuid?',target_method:'channel',target_umbrella_id:'uuid?',target_vat_chargeable:'boolean?',target_umbrella_enabled:'boolean?',financial_view_revision:'integer',metadata_version:'integer',workbench_revision:'integer',adoption_revision:'integer',last_command_sequence:'integer',valuation_policy_id:'uuid',official_pay_date:'date'};
function context(v){return shape(v,CONTEXT)&&enc.encode(JSON.stringify(v)).length<=4096
 &&(v.source_method!=='PAYE'||v.source_umbrella_id===null)
 &&(v.target_method==='PAYE'?[v.target_umbrella_id,v.target_vat_chargeable,v.target_umbrella_enabled].every(x=>x===null):v.target_umbrella_id!==null&&typeof v.target_vat_chargeable==='boolean'&&v.target_umbrella_enabled===true);}
function cursor(v){return object(v)&&Object.keys(v).sort().join()==='context,last_key'&&context(v.context)&&field(v.last_key,'key')&&enc.encode(JSON.stringify(v)).length<=8192;}
function request(v){return object(v)&&Object.keys(v).sort().join()==='destination_patch,expected_old_method,new_method,operation_id,preview_context,reason'
 &&field(v.operation_id,'uuid')&&field(v.new_method,'channel')&&field(v.expected_old_method,'channel')&&object(v.destination_patch)
 &&(v.reason===null||typeof v.reason==='string'&&!v.reason.includes('\0')&&enc.encode(v.reason).length<=2048)
 &&context(v.preview_context)&&v.new_method===v.preview_context.target_method&&v.expected_old_method===v.preview_context.source_method
 &&(v.new_method==='PAYE'?Object.keys(v.destination_patch).length===0:Object.keys(v.destination_patch).join()==='umbrella_id'&&v.destination_patch.umbrella_id===v.preview_context.target_umbrella_id)
 &&enc.encode(JSON.stringify(v)).length<=8192;}
const ROW={key:'key',member_kind:'text',work_id:'uuid?',revision_id:'uuid?',approved_line_id:'uuid?',approved_segment_id:'uuid?',case_id:'uuid?',case_component_id:'uuid?',case_component_revision:'positive?',transfer_id:'uuid?',run_id:'uuid?',source_channel:'channel?',source_umbrella_id:'uuid?',classification:'text',source_amount:'money?',label:'text',detail:'text',original_section:'text'};
const QUOTE={policy_id:'uuid',policy_window_id:'uuid',source_channel:'channel',target_channel:'channel',source_ex_vat:'money',target_ex_vat:'money',target_vat:'money',target_inc_vat:'money',treatment:'text?'};
function row(v,c){if(!object(v)||Object.keys(v).length!==Object.keys(ROW).length+1||!Object.hasOwn(v,'quote')||!shape(Object.fromEntries(Object.keys(ROW).map(k=>[k,v[k]])),ROW)
 ||!['WORK','CASE','PROTECTED_WORK','PROTECTED_CASE','TRANSFER'].includes(v.member_kind)||!['COMPATIBLE','NEEDS_DECISION','UNCHANGED','PROTECTED'].includes(v.classification)
 ||!['READY','ACTION','BLOCKED','WAITING'].includes(v.original_section))return false;
 if(v.member_kind.includes('WORK')&&(v.work_id===null||v.revision_id===null||v.case_id!==null||v.transfer_id!==null)
  ||v.member_kind.includes('CASE')&&(v.case_id===null||v.case_component_id===null||v.case_component_revision===null||v.work_id!==null||v.transfer_id!==null)
  ||v.member_kind==='TRANSFER'&&(v.transfer_id===null||v.work_id!==null||v.case_id!==null)
  ||['PROTECTED_WORK','PROTECTED_CASE','TRANSFER'].includes(v.member_kind)!==(v.classification==='PROTECTED'))return false;
 return v.quote===null?v.classification!=='COMPATIBLE':shape(v.quote,QUOTE)&&v.classification==='COMPATIBLE'&&v.quote.source_channel===v.source_channel&&v.quote.target_channel===c.target_method&&v.quote.source_ex_vat===v.source_amount;}
function preview(v,{actor,candidate,target,umbrella,after=null,limit=20}){if(!object(v)||Object.keys(v).sort().join()!=='candidate_name,candidate_reference,category_counts,complete,context,next_cursor,rows,total_member_count,umbrella_name'
 ||!context(v.context)||v.context.actor_user_id!==actor||v.context.candidate_id!==candidate||v.context.target_method!==target||v.context.target_umbrella_id!==umbrella
 ||after!==null&&!equal(after.context,v.context)||!field(v.candidate_name,'text')||!field(v.candidate_reference,'text?')||!field(v.umbrella_name,'text?')
 ||!Array.isArray(v.rows)||v.rows.length>limit||typeof v.complete!=='boolean'||!whole(v.total_member_count)||BigInt(v.total_member_count)>1000n
 ||!shape(v.category_counts,{stays_payable:'integer',needs_decision:'integer',not_changed:'integer'})
 ||Object.values(v.category_counts).reduce((n,x)=>n+BigInt(x),0n)!==BigInt(v.total_member_count)||enc.encode(JSON.stringify(v)).length>65536)return false;
 let last=after?.last_key??null;for(const r of v.rows){if(!row(r,v.context)||last!==null&&r.key<=last)return false;last=r.key;}
 return v.complete?v.next_cursor===null:cursor(v.next_cursor)&&equal(v.next_cursor.context,v.context)&&v.rows.length>0&&v.next_cursor.last_key===last;}
function receipt(v,r,candidate){return shape(v,{accepted:'boolean',operation_id:'uuid',candidate_id:'uuid',pay_method:'channel',umbrella_id:'uuid?',metadata_version:'positive',task_id:'uuid',task_generation:'positive',affected_member_count:'integer',projection_pending:'boolean'})
 &&v.accepted===true&&v.projection_pending===true&&v.operation_id===r.operation_id&&v.candidate_id===candidate&&v.pay_method===r.new_method
 &&v.umbrella_id===r.preview_context.target_umbrella_id&&BigInt(v.metadata_version)>BigInt(r.preview_context.metadata_version)&&BigInt(v.affected_member_count)<=1000n;}

const MESSAGES={BPAY_NEXT_PAY_METHOD_PREVIEW_CHANGED:'The list has changed; refresh and try again.',BPAY_NEXT_PAY_METHOD_CONTEXT_UNAVAILABLE:'The list is being updated; refresh and try again.',BPAY_NEXT_PAY_METHOD_TARGET_INVALID:'Choose an available Umbrella company.',BPAY_NEXT_PAY_METHOD_NO_CHANGE:'This pay channel and company are already set.',BPAY_NEXT_PAY_METHOD_SCOPE_TOO_LARGE:'There are too many payments to change together.',BPAY_NEXT_PAY_METHOD_PROTECTED_REWRITE_FORBIDDEN:'This change cannot alter money already in a Draft.',BPAY_NEXT_PAY_METHOD_OPERATION_CONFLICT:'The earlier change still needs its result confirmed.',BPAY_NEXT_MODULE_NOT_ACTIVE:'Banking Pay is not available for this agency yet.',BPAY_NEXT_PAY_METHOD_FORBIDDEN:'You cannot make this change.'};
async function open(options){
 const {document:doc,window:win,actorId:actor,candidateId:candidate,targetMethod:target,api,authFetch,showReadWindow}=options;
 if(!doc||!win||!Ui||!field(actor,'uuid')||!field(candidate,'uuid')||!field(target,'channel')||typeof api!=='function'||typeof authFetch!=='function'||typeof showReadWindow!=='function')throw Error('The pay channel window is unavailable.');
 const current=()=>options.currentActorId?.()===actor&&options.ownerReady?.()===true&&options.current?.()!==false;
 if(!current())throw Error('The pay channel window is unavailable.');
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const host=el('section',undefined,'bpay-next-channel-change'),detail=el('p',undefined,'bpay-next-channel-subject'),footer=el('div',undefined,'bpay-next-window-actions bpay-next-channel-actions');
 const hint=el('p','Only future work changes. Drafts and payments already made stay as they are.','bpay-next-channel-hint');
 const apply=el('button','Apply change','btn primary'),refresh=el('button','Refresh','btn');apply.type=refresh.type='button';refresh.hidden=true;footer.append(hint,refresh,apply);
 const result=el('p',undefined,'bpay-next-channel-result');result.setAttribute('data-next-live-copy','');detail.setAttribute('data-next-live-copy','');result.setAttribute('role','status');result.setAttribute('aria-live','polite');result.hidden=true;
 const chooser=el('label',undefined,'bpay-next-channel-company'),select=el('select');select.dataset.nextFocusKey='pay-channel-company';
 if(target==='UMBRELLA'){
  chooser.append(el('span','Umbrella company'),select);select.append(el('option','Choose a company'));
  for(const company of options.companies??[]){if(!field(company.id,'uuid')||typeof company.name!=='string'||company.name.length>256)continue;const option=el('option',company.name);option.value=company.id;select.append(option);}
  select.value=options.umbrellaId??'';host.append(chooser);
 }
 host.append(result);const cards=el('div',undefined,'bpay-next-channel-cards'),sentinel=el('div',undefined,'bpay-next-channel-sentinel');sentinel.setAttribute('data-next-live-copy','');sentinel.setAttribute('role','status');host.append(cards,sentinel);
 const money=v=>{if(v===null)return '—';const negative=v.startsWith('-'),absolute=negative?v.slice(1):v;return (negative?'−':'')+'£'+absolute.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(absolute.split('.')[1]??'').padEnd(2,'0');};
 const title=v=>v==='UMBRELLA'?'Umbrella':'PAYE';
 let page=null,rows=[],busy=false,closed=false,frame,resolve,observer,generation=0,requestController=null,stored=null;
 const done=new Promise(r=>{resolve=r;}),endpoint=api('/api/candidates/'+candidate+'/pay-method-change'),storeKey='cloudtms.bpayNext.payMethod.'+actor+'.'+candidate+'.'+encodeURIComponent(endpoint);
 const active=()=>!closed&&current()&&frame?.alive();
 try{const value=JSON.parse(win.sessionStorage.getItem(storeKey)||'null');if(value&&value.endpoint===endpoint&&typeof value.bytes==='string'&&equal(JSON.parse(value.bytes),value.request)&&typeof value.uncertain==='boolean'&&request(value.request)&&value.request.preview_context.actor_user_id===actor&&value.request.preview_context.candidate_id===candidate&&(value.accepted===null||receipt(value.accepted,value.request,candidate)))stored=value;}catch{}
 const save=()=>{try{if(stored)win.sessionStorage.setItem(storeKey,JSON.stringify(stored));else win.sessionStorage.removeItem(storeKey);}catch{throw Error('The change could not be kept; try again.');}};
 async function call(method,body,after=null,retainedBytes=null){
  if(!current())throw Error('The pay channel window is unavailable.');
  const controller=new AbortController();requestController=controller;let timer,reader;
  const cancel=()=>{controller.abort();try{if(reader)void reader.cancel().catch(()=>{});}catch{}};
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{cancel();reject(Error('Could not confirm the result; try again.'));},method==='POST'?10000:6000);});
  const umbrella=target==='UMBRELLA'?select.value:null,scope={actor,candidate,target,umbrella,after,limit:20};
  const path='/api/candidates/'+candidate+(method==='POST'?'/pay-method-change':'/pay-method-change-preview?'+new URLSearchParams({new_method:target,...(umbrella?{umbrella_id:umbrella}:{}),...(after?{after:JSON.stringify(after)}:{}),limit:'20'}));
  try{return await Promise.race([deadline,(async()=>{
   const raw=await authFetch(api(path),{method,signal:controller.signal,redirect:'error',auth401Mode:'return',headers:{accept:'application/json','content-type':'application/json'},...(method==='POST'?{body:retainedBytes??JSON.stringify(body)}:{})});
   if(controller.signal.aborted){void raw?.body?.cancel().catch(()=>{});throw Error('Could not confirm the result; try again.');}
   if(!raw?.body||!/^application\/json(?:\s*;|$)/i.test(raw.headers.get('content-type')??''))throw Error('Could not confirm the result; try again.');
   reader=raw.body.getReader();let bytes=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});for(;;){const part=await reader.read();if(controller.signal.aborted)throw Error('Could not confirm the result; try again.');if(part.done)break;bytes+=part.value.length;if(bytes>65536)throw Error('Could not confirm the result; try again.');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();
   const value=JSON.parse(text);if(!current())throw Error('The pay channel window is unavailable.');
   if(!raw.ok){if(!object(value)||Object.keys(value).sort().join()!=='error_code,ok,operation_id,unknown_outcome'||value.ok!==false||typeof value.error_code!=='string'||!field(value.operation_id,'uuid?')||typeof value.unknown_outcome!=='boolean'||method==='POST'&&value.operation_id!==body.operation_id)throw Error('Could not confirm the result; try again.');throw Object.assign(Error(MESSAGES[value.error_code]??(method==='POST'?'Could not confirm the result; try again.':'Could not show the payments; refresh and try again.')),{code:value.error_code,unknown_outcome:value.unknown_outcome});}
   if(method==='POST'?!receipt(value,body,candidate):!preview(value,scope))throw Error('Could not confirm the result; try again.');return value;
  })()]);}finally{clearTimeout(timer);cancel();if(requestController===controller)requestController=null;}
 }
 function paint(){if(!active())return;
  sentinel.textContent=busy&&page&&!page.complete?'Loading more…':'';
  apply.disabled=busy||!current()||(!stored&&!page);apply.hidden=Boolean(stored?.accepted);apply.textContent=stored?'Try again':'Apply change';select.disabled=busy||Boolean(stored);chooser.hidden=Boolean(stored);refresh.disabled=busy;cards.replaceChildren();
  const display=stored&&shape(stored.preview_display,{candidate_name:'text',candidate_reference:'text?',umbrella_name:'text?'})?stored.preview_display:null;
  detail.textContent=stored?[display?.candidate_name,display?.candidate_reference,title(stored.request.expected_old_method)+' to '+title(stored.request.new_method),display?.umbrella_name].filter(Boolean).join(' · '):page?[page.candidate_name,page.candidate_reference,title(page.context.source_method)+' to '+title(target)].filter(Boolean).join(' · '):'';
  if(stored?.accepted){result.textContent='Pay channel changed.';result.setAttribute('role','status');result.hidden=false;}
  if(!page){if(stored?.accepted||!busy&&!result.hidden)return;const skeleton=el('div',busy?'Loading payments…':stored?'The earlier change needs its result confirmed.':'Choose a company.','bpay-next-channel-empty');skeleton.setAttribute('role','status');cards.append(skeleton);return;}
  for(const [category,label] of [['stays_payable','Stays payable'],['needs_decision','Needs a decision'],['not_changed','Not changed']]){
   const card=el('section',undefined,'bpay-next-channel-card'),heading=el('header');heading.append(el('span',label),el('strong',page.category_counts[category]+' '+(page.category_counts[category]==='1'?'item':'items')));card.append(heading);
   const selected=rows.filter(r=>(r.classification==='NEEDS_DECISION'?'needs_decision':r.classification==='COMPATIBLE'||r.classification==='UNCHANGED'&&r.original_section==='READY'?'stays_payable':'not_changed')===category);
   const table=el('table'),thead=el('thead'),head=el('tr');for(const label of ['Work','Amount','After the change'])head.append(el('th',label));thead.append(head);table.append(thead);
   const tbody=el('tbody');for(const r of selected){const tr=el('tr'),name=el('td'),amount=el('td'),after=el('td');
    name.append(el('span',r.member_kind==='PROTECTED_WORK'?(r.source_channel?title(r.source_channel)+' Draft':'Draft'):r.label));
    if(r.member_kind!=='PROTECTED_WORK'&&r.detail)name.append(el('small',r.detail));
    amount.className='bpay-next-channel-money';amount.append(el('strong',money(r.quote?.target_ex_vat??r.source_amount)));
    if(r.classification==='NEEDS_DECISION'&&r.source_channel&&r.source_amount!==null)amount.append(el('small',title(r.source_channel)+', as authorised'));
    if(r.classification==='COMPATIBLE')after.append(el('span','Pay channel changed – converted value','bpay-next-channel-badge'));
    else if(r.classification==='NEEDS_DECISION')after.append(el('span','Pay channel decision needed','bpay-next-channel-badge is-warning'));
    else if(r.classification==='PROTECTED')after.append(el('span',r.member_kind==='PROTECTED_CASE'?'Stays as agreed':r.source_channel?'Stays '+title(r.source_channel):'Stays as agreed'));
    else after.append(el('span',r.original_section==='READY'?'Stays '+money(r.source_amount):'Not payable yet'));
    tr.append(name,amount,after);tbody.append(tr);}
   if(!selected.length){const tr=el('tr'),cell=el('td',page.complete?'No payments.':'Payments are still loading.');cell.colSpan=3;tr.append(cell);tbody.append(tr);}table.append(tbody);card.append(table);cards.append(card);
  }
 }
 async function read(after=null){if(!active()||busy||stored)return;const serial=++generation;busy=true;refresh.hidden=true;result.hidden=true;paint();
  try{const v=await call('GET',null,after);if(!active()||generation!==serial)return;
   if(after!==null&&(!equal(v.context,page.context)||!equal(v.category_counts,page.category_counts)))throw Object.assign(Error('The list has changed; refresh and try again.'),{code:'BPAY_NEXT_PAY_METHOD_PREVIEW_CHANGED'});
   page=v;rows=after===null?v.rows:rows.concat(v.rows);if(rows.length>1000)throw Error('Could not show the payments; refresh and try again.');
  }catch(e){if(!active()||generation!==serial)return;page=null;rows=[];result.textContent=MESSAGES[e.code]??'Could not show the payments; refresh and try again.';result.setAttribute('role','alert');result.hidden=false;refresh.hidden=false;}
  finally{if(active()&&generation===serial){busy=false;paint();if(page&&!page.complete&&!stored){observer?.unobserve(sentinel);observer?.observe(sentinel);}}}
 }
 select.onchange=()=>{if(!active()||busy||stored)return;page=null;rows=[];if(field(select.value,'uuid'))void read();else paint();};
 refresh.onclick=()=>{if(active()&&!stored&&!busy)void read();};
 apply.onclick=async()=>{if(!active()||apply.disabled)return;
  if(!stored){const op=win.crypto.randomUUID();const body={operation_id:op,new_method:target,expected_old_method:page.context.source_method,destination_patch:target==='UMBRELLA'?{umbrella_id:select.value}:{},reason:options.reason??null,preview_context:page.context};if(!request(body))return;stored={endpoint,bytes:JSON.stringify(body),request:body,preview_display:{candidate_name:page.candidate_name,candidate_reference:page.candidate_reference,umbrella_name:page.umbrella_name},accepted:null,uncertain:false};try{save();}catch(e){stored=null;result.textContent=e.message;result.setAttribute('role','alert');result.hidden=false;paint();return;}}
  const recovering=stored.uncertain;
  busy=true;result.hidden=true;paint();
  try{stored.uncertain=true;save();const accepted=await call('POST',stored.request,null,stored.bytes);stored={...stored,accepted};save();if(active()){busy=false;result.textContent='Pay channel changed.';result.hidden=false;paint();}}
  catch(e){if(!recovering&&e.unknown_outcome===false&&['BPAY_NEXT_PAY_METHOD_PREVIEW_CHANGED','BPAY_NEXT_PAY_METHOD_NO_CHANGE','BPAY_NEXT_PAY_METHOD_TARGET_INVALID','BPAY_NEXT_PAY_METHOD_SCOPE_TOO_LARGE'].includes(e.code)){stored=null;try{save();}catch{}page=null;rows=[];refresh.hidden=false;}if(active()){result.textContent=MESSAGES[e.code]??'Could not confirm the result; try again.';result.setAttribute('role','alert');result.hidden=false;}}
  finally{busy=false;if(active())paint();}
 };
 frame=showReadWindow({title:'Change pay channel',content:host,footer,headerDetail:detail,canFocus:current,
  onDismiss:()=>{closed=true;generation++;observer?.disconnect();requestController?.abort();
   const accepted=stored?.accepted;if(accepted&&current()){stored=null;try{save();}catch{}resolve({confirmed:true,result:{...accepted,next_owner:true,candidate:{id:candidate,pay_method:accepted.pay_method,umbrella_id:accepted.umbrella_id}}});}
   else resolve({confirmed:false,result:null});}});
 observer=new win.IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&page&&!page.complete&&!busy&&!stored)void read(page.next_cursor);},{root:doc.getElementById('modalBody'),rootMargin:'0px 0px 160px 0px'});observer.observe(sentinel);
 paint();if(!stored&&(target==='PAYE'||field(select.value,'uuid')))void read();return done;
}
return Object.freeze({equal,context,cursor,request,preview,receipt,open});
});
