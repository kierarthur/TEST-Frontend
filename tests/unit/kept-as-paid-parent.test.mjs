import {reverseMissingSourceParent} from '../helpers/missing-source-office-parent-reverse.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {reverseKeepParent,keepParents} from '../helpers/kept-office-parent-reverse.mjs';
const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0'),clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(x).digest('hex');
const context=()=>({schema_version:'WEEKLY_SOURCE_KEPT_AS_PAID_CONTEXT_READ_V1',work_event_id:id(1),candidate_id:id(2),client_id:id(3),contract_id:id(4),source_group_id:id(5),source_cycle_id:id(6),finalisation_week_ending:'2026-10-18',projection_publication_id:id(7),upload_id:id(8),source_present:false,invoiced:false,paid:null,paid_evidence_state:'UNKNOWN',root_timesheet_ids:[id(9)],credit_lines:[],reason:'NOT_INVOICED_DISAPPEARED',kept_by_default:true,decision_available:true,decision_needed:true,facts_fingerprint:'a'.repeat(64),decision_applies:false,latest_acknowledgement:null,holds_pay:null,holds_invoice:null,accepted_source_removed:false,disabled_reason:null});
const row=()=>({work_event_id:id(1),candidate:'Worker',work_date:'2026-10-17',start:'09:00',end:'17:00',break_minutes:30,context:context(),unavailable_reason:null});
function fixture(source=false){
 const controllers=[],timers=[],calls=[],values=new Map();let host,scopeCurrent=true,lost=true;
 const native={timesheet_id:id(9),sheet_scope:'WEEKLY',is_current:true,archived_at_utc:null};
 const ctx={entity:'timesheets',openToken:'open',data:{timesheet_id:id(9)},timesheetDetails:{timesheet:native},vm:{mount:true,record_version:'current',kept_as_paid_contexts:[row()]}};
 const parent={kind:source?'weekly-source-imports-v1':'timesheets',mode:'view',_ctxRef:ctx,_token:'token'};
 const held=new Set();
 const root={module:{exports:{}},SESSION:{user:{id:id(10),role:'payment_authoriser'}},modalCtx:ctx,__modalStack:[parent],Intl,Date,Response,AbortController,TextDecoder,Uint8Array,
  navigator:{locks:{async request(name,options,fn){assert.equal(options.ifAvailable,true);if(held.has(name))return fn(null);held.add(name);try{return await fn({name});}finally{held.delete(name);}}}},
  crypto:{randomUUID:()=>id(100)},localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
  setTimeout:(fn,ms)=>{if(ms===45000)return 0;timers.push(fn);return 1;},clearTimeout(){},document:{addEventListener(){},querySelector:()=>host,getElementById:()=>null},
  CloudTMSWeeklySourcePresentationV1:{findHostPayload:()=>ctx,buildViewModel:()=>ctx.vm},
  closeModal(){const child=root.__modalStack.pop();child._detachGlobal?.();root.modalCtx=parent._ctxRef;},
  showModal(title,tabs,render,save,edit,wire,options){const back={addEventListener:(kind,fn)=>{back.click=fn;}};const inner={innerHTML:'',querySelector:()=>null,replaceChildren(){}};host={dataset:{},querySelector:s=>s==='[data-kept-controls-host]'?inner:back};root.__modalStack.push({kind:options.kind});render();},
  CloudTMSWeeklySourceImportWorkspaceV1:{_session:{workspace:{kept_as_paid_contexts:[row()]}},captureKeepContext:()=>({key:'SOURCE:real-selected-scope',current:()=>scopeCurrent}),
   keepAsPaidRequest:async options=>{const body=JSON.parse(options.body);calls.push(body);if(body.action==='KEEP_AS_PAID_CONTEXT')return Response.json(context());if(lost){lost=false;throw Error('lost');}
    const p=body.payload;return Response.json({ok:true,decision:'KEEP_AS_PAID',decision_id:id(20),work_event_id:p.work_event_id,reason:p.reason,credit_invoice_line_id:p.credit_invoice_line_id,facts_fingerprint:p.expected_facts_fingerprint,actor_user_id:id(10),acknowledged_at_utc:'2026-10-17T12:34:56Z',acknowledgement_sequence:'9007199254740993',idempotent_replay:true,pay_changed:false,invoice_changed:false});}}};
 for(const file of ['kept-as-paid-contract.js','kept-as-paid-controls.js','workspace-actions.js'])vm.runInNewContext(fs.readFileSync('js/weekly-source/'+file,'utf8'),root);
 const actual=root.CloudTMSKeptAsPaidV1;root.CloudTMSKeptAsPaidV1={...actual,create:options=>{const c=actual.create(options);controllers.push(c);return c;}};
 const settle=async()=>{while(timers.length)timers.shift()();await new Promise(resolve=>setImmediate(resolve));};
 const open=async(detail={})=>{const result=root.module.exports.openKeepAsPaid({workEventId:id(1),surface:source?'SOURCE_WORKSPACE':'SIMPLE_TIMESHEET',...detail});await settle();return result;};
 return {root,ctx,parent,controllers,calls,values,open,settle,changeScope:()=>scopeCurrent=false,back:()=>host.querySelector('[data-kept-back]').click()};
}
test('actual Source and Work child dispatcher retain the same pending seven-field request across Back/reopen',async()=>{
 for(const source of [false,true]){const f=fixture(source);assert.equal(await f.open(),true);assert.equal(f.calls.length,1);await assert.rejects(f.controllers[0].save());const original=clone(f.calls[1]);f.back();assert.equal(f.root.__modalStack.at(-1),f.parent);
  assert.equal(await f.open(),true);assert.equal(f.calls.length,2);await f.controllers[1].retry();assert.deepEqual(f.calls[2],original);assert.equal(f.values.size,0);}
});
test('actual Work parent actor/token/open/generation/root/currentness/record changes refuse before save',async()=>{
 for(const change of [f=>f.root.SESSION.user.id=id(99),f=>f.parent._token='changed',f=>f.ctx.openToken='changed',f=>f.ctx.__timesheetLatestLifecycleMutationSeq=1,f=>f.ctx.data.timesheet_id=id(99),f=>f.ctx.timesheetDetails.timesheet.is_current=false,f=>f.ctx.vm.record_version='changed',f=>f.root.__modalStack[0]={kind:'foreign'}]){
  const f=fixture();await f.open();change(f);await assert.rejects(f.controllers[0].save());assert.equal(f.calls.length,1);assert.equal(f.values.size,0);}
});
test('actual Source parent scope and actor changes refuse before native request',async()=>{
 for(const change of [f=>f.changeScope(),f=>f.root.SESSION.user.id=id(99),f=>f.root.CloudTMSWeeklySourceImportWorkspaceV1={},f=>f.root.__modalStack[0]={kind:'foreign'}]){const f=fixture(true);await f.open();change(f);await assert.rejects(f.controllers[0].save());assert.equal(f.calls.length,1);}
});
test('unknown event, stale native parent, wrong surface and unrelated modal never open a child',async()=>{
 for(const change of [f=>f.ctx.timesheetDetails.timesheet.is_current=false,f=>f.parent.mode='edit',f=>f.parent._ctxRef={},f=>f.parent.kind='banking',f=>f.ctx.vm.mount=false]){const f=fixture();change(f);assert.equal(await f.open(),false);assert.equal(f.calls.length,0);}
 assert.equal(await fixture().open({workEventId:id(99)}),false);assert.equal(await fixture().open({surface:'BANKING'}),false);
});
test('four complete parents reverse to exact original saved bytes and canonical genuine6d Git owners',()=>{
 assert.equal(keepParents.edits.length,4);
 for(const entry of keepParents.edits){const value=reverseMissingSourceParent(entry.target,fs.readFileSync(entry.target,'utf8')),before=reverseKeepParent(entry.target,value);assert.equal(hash(before),entry.inputSha256);
  const original=execFileSync('git',['show',keepParents.base+':'+entry.target],{maxBuffer:32*1024*1024}).toString();assert.equal(before.replaceAll('\r\n','\n'),original.replaceAll('\r\n','\n'));
  for(const altered of [value+'\n// unrelated drift',value.replace(entry.hunks[0].after,''),value+entry.hunks[0].after])assert.throws(()=>reverseKeepParent(entry.target,altered));}
 assert.equal(hash(reverseMissingSourceParent('js/main.js',fs.readFileSync('js/main.js','utf8'))),keepParents.mainUnchangedSha256);
});
test('all directly loaded Keep assets are pinned once and shared parents publish their exact cache successor',()=>{
 const index=reverseMissingSourceParent('index.html',fs.readFileSync('index.html','utf8'));for(const file of ['js/weekly-source/kept-as-paid-contract.js','js/weekly-source/kept-as-paid-controls.js','css/kept-as-paid.css'])assert.equal(index.split('./'+file+'?v='+hash(reverseMissingSourceParent(file,fs.readFileSync(file,'utf8')))).length,2);
 for(const file of ['js/weekly-source/workspace-actions.js','js/weekly-source/import-workspace.js','js/weekly-source-presentation-v1.js'])assert(index.includes('&kept-as-paid='+hash(reverseMissingSourceParent(file,fs.readFileSync(file,'utf8')))));
});
test('actual Source capture binds open generation, selected scope, filters and tab while permitting its child',()=>{
 const root={module:{exports:{}},__modalStack:[],document:{addEventListener(){}}};vm.runInNewContext(fs.readFileSync('js/weekly-source/import-workspace.js','utf8'),root);
 const api=root.module.exports,s=api._session,frame={kind:'weekly-source-imports-v1'};root.__modalStack=[frame];s.openGeneration=3;s.openCurrent=()=>true;s.activeTab='queries';s.sourceFilters={client_id:id(3)};s.workspace={selected:{source_group_id:id(5),source_cycle_id:id(6),client_id:id(3)}};
 for(const change of [()=>s.openGeneration++,()=>s.workspace.selected.client_id=id(99),()=>s.sourceFilters.client_id=id(99),()=>s.activeTab='history',()=>s.openCurrent=()=>false]){
  s.openGeneration=3;s.activeTab='queries';s.sourceFilters={client_id:id(3)};s.workspace.selected.client_id=id(3);s.openCurrent=()=>true;root.__modalStack=[frame];
  const binding=api.captureKeepContext();assert.equal(binding.current(),true);root.__modalStack.push({kind:'weekly-source-keep-as-paid'});assert.equal(binding.current(),true);change();assert.equal(binding.current(),false);
 }
});
test('actual transport uses current authFetch and fixed command endpoint, with no anonymous fallback',async()=>{
 const calls=[],root={module:{exports:{}},API:p=>'https://configured-test.invalid'+p,authFetch:(...args)=>{calls.push(args);return 'rawResponse';},document:{addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync('js/weekly-source/import-workspace.js','utf8'),root);const api=root.module.exports,options={method:'POST',body:'exact pending bytes'};
 assert.equal(api.keepAsPaidRequest(options),'rawResponse');assert.equal(calls[0][0],'https://configured-test.invalid/api/weekly-source/v1/commands');assert.equal(calls[0][1],options);
 delete root.authFetch;root.fetch=()=>{throw Error('anonymous fallback must not run');};assert.throws(()=>api.keepAsPaidRequest(options),/authenticated Office/);
});
