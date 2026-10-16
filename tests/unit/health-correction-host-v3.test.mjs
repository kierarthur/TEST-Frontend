import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import * as dto from '../../js/contract-correction-v3.mjs';
globalThis.CloudTMSCorrectionContractV3=dto;
await import('../../js/timesheet-correction-host-v3.js');
await import('../../js/daily-rate-correction-http-adapter.js');
await import('../../js/daily-rate-correction.js');
const host=globalThis.CloudTMSHealthCorrectionHostV3,daily=globalThis.CloudTMSDailyRateCorrectionV1,http=globalThis.CloudTMSDailyRateCorrectionHttpV1;
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0'),copy=x=>JSON.parse(JSON.stringify(x));
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};};
function fixture(daily=false){
 const ts={timesheet_id:id(1),sheet_scope:daily?'DAILY':'WEEKLY',contract_id:daily?null:id(2),line_type:'HOURS',is_adjustment:false,parent_timesheet_id:null,correction_id:null,is_current:true,archived_at_utc:null};
 const context={entity:'timesheets',openToken:'native-open',data:{timesheet_id:id(1)},timesheetDetails:{timesheet:ts},timesheetHydration:{detailsLoaded:true}};
 const frame={entity:'timesheets',kind:'timesheets',mode:'view',_ctxRef:context,_token:'native-frame',currentTabKey:'finance'};
 let actor=id(9),stack=[frame];const options={frame,context,actorId:actor,currentActorId:()=>actor,getFrame:()=>stack.at(-1),getStack:()=>stack};
 return {ts,context,frame,options,actor(value){actor=value;},stack(value){stack=value;},binding:()=>host.capture(options)};
}
function result(daily=false){return {version:daily?dto.VERSIONS.DAILY:dto.VERSIONS.CONTRACT,purpose:daily?'DAILY_RATE_CORRECTION':'CONTRACT_CORRECTION',operation_id:id(3),state:'COMPLETE',state_revision:'9007199254740993',
 placement:{status:'COMMITTED',original_timesheet_id:id(1),current_timesheet_id:daily?id(1):id(4),placement_revision:'1',receipt_id:id(5)},
 financial:{status:'REGISTERED',command_id:id(6),cut_id:null,summary:{visibility:'FULL',text:'Pay update registered.'}},billing:{status:'PREPARING_DRAFTS',revision:'1',group_id:id(7),visible_summary:{visibility:'REDACTED'}},next_actions:[],links:[]};}
function preview(){return {version:dto.VERSIONS.DAILY,operation_id:id(3),review_id:id(4),review_digest:'a'.repeat(64),state_revision:'9007199254740993',ready_to_confirm:true,current_timesheet_id:id(1),summary:{worked_facts_preserved:true,pay_effect:{visibility:'FULL',text:'Native pay effect'},invoice_effect:{visibility:'REDACTED'}},known_blockers:[],confirm:{request_version:dto.VERSIONS.DAILY,review_id:id(4),review_digest:'a'.repeat(64),expected_state_revision:'9007199254740993'},links:[]};}
function adapter(overrides={}){return {actorUserId:id(9),current:()=>true,onResult:async()=>{},pendingStorage:storage(),preview:async()=>preview(),accept:async()=>result(true),get:async()=>result(true),runAction:async()=>{},...overrides};}

test('capture refuses bulk, checking-only, placeholder and mismatched native record frames',()=>{
 for(const change of [f=>f.frame.kind='bulk-authorise',f=>f.frame._ctxRef={},f=>delete f.ts.timesheet_id,f=>f.context.timesheetHydration.detailsLoaded=false,f=>f.context.data.timesheet_id=id(8),f=>f.frame.mode='edit']){const f=fixture();change(f);assert.throws(f.binding,/CORRECTION_CURRENT_PARENT_REQUIRED/);}
});
test('actor, frame, token, generation and open record changes invalidate old caller',()=>{
 for(const change of [f=>f.actor(id(8)),f=>f.stack([f.frame,{}]),f=>f.frame._token='changed',f=>f.context.openToken='changed',f=>f.context.__timesheetLatestLifecycleMutationSeq=1,f=>f.context.data.timesheet_id=id(8)]){const f=fixture(),b=f.binding();change(f);assert.equal(b.current(),false);assert.throws(b.assertCurrent,/CORRECTION_PARENT_CHANGED/);}
});
test('every Daily omits Change Contract, strict native eligibility has no inferred defaults',()=>{
 const f=fixture(true),actor={id:id(9),role:'admin'};assert.equal(host.dailyEligible(f.context,actor),true);assert.doesNotMatch(host.moreHtml(f.context,actor),/Change Contract/);
 for(const [key,value] of [['contract_id',id(2)],['is_current',undefined],['line_type','EXPENSE'],['archived_at_utc','2026-10-16']]){const changed=copy(f.context);changed.timesheetDetails.timesheet[key]=value;assert.equal(host.dailyEligible(changed,actor),false);assert.doesNotMatch(host.moreHtml(changed,actor),/Change Contract/);}
 assert.equal(host.dailyEligible(f.context,{id:id(9),role:'payment_authoriser'}),false);
});
test('Contract control is dependency-closed for every role, not a Contract-wide Admin filter',()=>{
 const f=fixture();for(const role of ['admin','payment_authoriser','golden_key','reader'])assert.match(host.moreHtml(f.context,{id:id(9),role}),/data-health-contract-move disabled/);
});
test('genuine COMMITTED B is read immediately with registered pay and preparing Drafts',async()=>{
 const f=fixture(),b=f.binding(),r=result();let called=0;
 await b.adopt(r,async(target,tab)=>{called++;assert.equal(target,id(4));assert.equal(tab,'finance');f.context.data.timesheet_id=target;f.ts.timesheet_id=target;return true;});
 assert.equal(called,1);assert.equal(b.current(),true);assert.deepEqual(f.context.__healthCorrectionResult,r);assert.match(host.resultHtml(f.context),/Contract corrected/);assert.match(host.resultHtml(f.context),/Pay update registered/);
});
test('failed or wrong current read does not fabricate current placement or adopt receipt',async()=>{
 for(const refresh of [async()=>false,async()=>true]){const f=fixture();await assert.rejects(f.binding().adopt(result(),refresh),/CORRECTION_CURRENT_READ_REQUIRED/);assert.equal(f.context.__healthCorrectionResult,undefined);assert.equal(f.ts.timesheet_id,id(1));}
});
test('Daily same physical binding and private Source/unknown nested receipts refuse',async()=>{
 const f=fixture(true),r=result(true);r.placement.current_timesheet_id=id(7);await assert.rejects(f.binding().adopt(r,async()=>true),/CORRECTION_CONTRACT_INVALID/);
 assert.throws(()=>dto.validateResult({version:'SOURCE_NATIVE_COMPOSED_RESULT_V1'}),/CORRECTION_CONTRACT_INVALID/);
 const extra=result();extra.financial.raw_private_dto={};await assert.rejects(fixture().binding().adopt(extra,async()=>true),/CORRECTION_CONTRACT_INVALID/);
});
test('typed native actions never navigate arbitrary URL or invent unsupported owner',async()=>{
 const action={kind:'OPEN_TIMESHEET',target_type:'TIMESHEET',target_id:id(1),url:'/untrusted-but-not-navigated',caption:'Open Timesheet',enabled:true,disabled_reason:null};
 let got;await host.resolveAction(action,{'OPEN_TIMESHEET:TIMESHEET':x=>{got=x.target_id;}});assert.equal(got,id(1));
 await assert.rejects(host.resolveAction(action,{}),/CORRECTION_ACTION_DEPENDENCY_REQUIRED/);await assert.rejects(host.resolveAction({...action,kind:'EXECUTE_PAYMENT'},{}),/CORRECTION_CONTRACT_INVALID/);
 await assert.rejects(host.resolveAction({...action,enabled:false,disabled_reason:'Unavailable'},{}),/CORRECTION_ACTION_DISABLED/);
});
test('overlay close is scoped, cleanup chains and never overwrites a newer native hook',async()=>{
 const f=fixture(),b=f.binding();let close=0,disposed=0,old=0;f.frame._detachGlobal=()=>old++;
 const handle={active:true,requestClose:async()=>{close++;},dispose:()=>{disposed++;}},owned=host.ownOverlay(b,handle);
 assert.equal(host.requestOverlayClose(f.frame,'Close'),true);await Promise.resolve();assert.equal(close,1);assert.equal(host.requestOverlayClose({kind:'bpay-next-read'},'Close'),false);
 const wrapper=f.frame._detachGlobal,newer=()=>{};f.frame._detachGlobal=newer;owned.remove();assert.equal(f.frame._detachGlobal,newer);wrapper();assert.equal(old,1);assert.equal(disposed,1);
});
test('lost Daily Accept response preserves exact request through reopen and GET recovery',async()=>{
 const saved=storage(),calls=[],a=adapter({pendingStorage:saved,accept:async body=>{calls.push(copy(body));throw Error('lost');}}),c=daily.createController({timesheetId:id(1),adapter:a});
 await c.preview();await c.accept();assert.equal(c.state.phase,'RECOVERY');assert.equal(saved.values.size,1);
 const reopened=daily.createController({timesheetId:id(1),adapter:a});await reopened.accept();assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].expected_state_revision,'9007199254740993');
 let operation;const recovery=daily.createController({timesheetId:id(1),adapter:adapter({pendingStorage:saved,get:async value=>{operation=value;return result(true);}})});await recovery.get();assert.equal(operation,id(3));assert.equal(saved.values.size,0);assert.equal(recovery.state.phase,'RESULT');
});
test('storage failure or damaged journal prevents a fresh Accept and preserves recovery',async()=>{
 let writes=0;const a=adapter({pendingStorage:{getItem:()=>null,setItem(){throw Error('blocked');},removeItem(){}},accept:async()=>{writes++;return result(true);}}),c=daily.createController({timesheetId:id(1),adapter:a});await c.preview();await c.accept();assert.equal(writes,0);
 const corrupt=daily.createController({timesheetId:id(1),adapter:adapter({pendingStorage:{getItem:()=>'{broken',setItem(){},removeItem(){}},accept:async()=>{writes++;}})});await corrupt.accept();await corrupt.preview();assert.equal(writes,0);assert.equal(corrupt.state.phase,'RECOVERY');
});
test('late actor change cannot adopt/clear accepted request and unavailable preview cannot confirm',async()=>{
 let current=true,adopted=0;const saved=storage(),c=daily.createController({timesheetId:id(1),adapter:adapter({current:()=>current,pendingStorage:saved,accept:async()=>{current=false;return result(true);},onResult:async()=>{adopted++;}})});await c.preview();await c.accept();assert.equal(adopted,0);assert.equal(saved.values.size,1);
 let accepted=0;const blocked=daily.createController({timesheetId:id(1),adapter:adapter({preview:async()=>{throw Error('dependency');},accept:async()=>{accepted++;}})});await blocked.preview();await blocked.accept();assert.equal(accepted,0);
});
test('HTTP adapter uses exact GET ABI and refuses duplicate JSON, oversized and drifted replies',async()=>{
 const paths=[],make=request=>http.create({timesheetId:id(1),actorUserId:id(9),current:()=>true,onResult:async()=>{},runAction:async()=>{},request});
 const a=make(async(url,init)=>{paths.push([url,init.method,init.body]);return Response.json(result(true));});await a.get(id(3));assert.deepEqual(paths,[['/api/timesheets/daily-rate-correction/operations/'+id(3),'GET',undefined]]);
 for(const body of ['{"version":"x","version":"y"}',JSON.stringify({...result(true),extra:true}),'x'.repeat(131073)])await assert.rejects(make(async()=>new Response(body)).get(id(3)),/DAILY_RATE_RESPONSE|CORRECTION_CONTRACT_INVALID/);
});
test('whole main/index reverse exactly to 045c; Manual New Enquiry source stays unchanged',()=>{
 const receipt=JSON.parse(fs.readFileSync('docs/healthroster-build/v6-owner-delivery-20261016/b051-host/PARENT_EDITS.json'));
 for(const entry of receipt.edits){let value=fs.readFileSync(entry.file,'utf8');for(const edit of [...entry.edits].reverse()){assert.equal(value.split(edit.after).length,2);value=value.replace(edit.after,edit.before);}assert.equal(Buffer.compare(Buffer.from(value),execFileSync('git',['show',receipt.base+':'+entry.file],{maxBuffer:64*1024*1024})),0);}
 for(const file of ['js/weekly-source/contact-manual-enquiry-controls.mjs','js/weekly-source/workspace-actions.js','js/weekly-source/import-workspace.js','js/weekly-source/combined-review.js','css/weekly-source.css'])assert.equal(Buffer.compare(fs.readFileSync(file),execFileSync('git',['show',receipt.base+':'+file])),0);
 const main=fs.readFileSync('js/main.js','utf8');assert.match(main,/requestOverlayClose\(top, 'parent-close'\)/);assert.match(main,/requestOverlayClose\(window\.__modalStack\?\.at\(-1\), 'direct-close'\)/);assert.match(main,/activeOverlay\(top\)/);
});
test('generated closed DTO and byte-pinned new loaders match actual sole sources',()=>{
 const source=fs.readFileSync('js/contract-correction-v3.mjs','utf8'),hash=x=>createHash('sha256').update(x).digest('hex');
 const names=[...source.matchAll(/export\s+(?:const|function)\s+(\w+)/g)].map(m=>m[1]);
 const expected=`// Generated from sole Health closed DTO source SHA256 ${hash(source)}. Do not edit.\n(function(root){'use strict';\n${source.replace(/export\s+(?=(?:const|function)\b)/g,'')}\nroot.CloudTMSCorrectionContractV3=Object.freeze({${names.join(',')}});\n})(typeof window!=='undefined'?window:globalThis);\n`;
 assert.equal(fs.readFileSync('js/correction-contract-v3.js','utf8'),expected);
 const index=fs.readFileSync('index.html','utf8');for(const file of ['js/correction-contract-v3.js','js/timesheet-correction-host-v3.js','js/daily-rate-correction-http-adapter.js','js/daily-rate-correction.js'])assert.equal(index.split(`./${file}?v=${hash(fs.readFileSync(file))}`).length,2);
 assert.doesNotMatch(index,/<script[^>]+timesheet-contract-move\.js/);
});
test('actual Health Contract hook refuses missing native capability even with a module present',async()=>{
 const f=fixture(),context={window:{CloudTMSHealthCorrectionHostV3:host,CloudTMSTimesheetContractMoveV1:{open(){throw Error('must not open');},createTimesheetOverlayAdapter(){}},__getModalFrame:()=>f.frame,modalCtx:f.context,__modalStack:[f.frame]},SESSION:{user:{id:id(9),role:'payment_authoriser'}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('docs/healthroster-build/v6-owner-delivery-20261016/b051-host/host-functions.jsinc','utf8'),context);
 await assert.rejects(vm.runInContext(`openTimesheetContractMoveReview({timesheetId:'${id(1)}'})`,context),/CONTRACT_MOVE_CAPABILITY_PROJECTION_REQUIRED/);
});
test('actual native refresh refuses late caller drift before adopting its read result',async()=>{
 const source=fs.readFileSync('js/main.js','utf8'),a=source.indexOf('async function refreshTimesheetModalAfterLifecycleAction('),b=source.indexOf('function resolveContractWeekScheduleForModal(',a),full=source.slice(a,b);
 const f=fixture();let live=true,complete,reads=0;const oldDetails=f.context.timesheetDetails;
 const sandbox={window:{modalCtx:f.context,__getModalFrame:()=>f.frame},getTsLoggers:()=>({LOGM:false,L(){},GC(){},GE(){}}),isActiveTimesheetModalToken:()=>true,
  fetchTimesheetWorkbenchDetails:async()=>{reads++;return new Promise(resolve=>{complete=resolve;});}};
 vm.createContext(sandbox);vm.runInContext(full,sandbox);const pending=sandbox.refreshTimesheetModalAfterLifecycleAction('native-open',{forceFullDetails:true,callerCurrent:()=>live});
 assert.equal(reads,1);live=false;complete({timesheet:{timesheet_id:id(4)}});assert.equal(await pending,false);assert.equal(f.context.timesheetDetails,oldDetails);assert.equal(f.context.data.timesheet_id,id(1));
 assert.equal(full.split('if (!isCurrentCaller()) return false;').length,9);
});
test('role-redacted and hostile text remains shape-safe and never becomes markup',()=>{
 const r=result();r.financial.summary={visibility:'REDACTED',text:'private'};assert.throws(()=>dto.validateResult(r),/CORRECTION_CONTRACT_INVALID/);
 r.financial.summary={visibility:'FULL',text:'<img src=x onerror=alert(1)>'};const f=fixture();f.context.__healthCorrectionResult=r;const html=host.resultHtml(f.context);assert.doesNotMatch(html,/img src/);
 const nodes=new Map();host.fillResult({querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);}},f.context);assert.equal(nodes.get('[data-health-correction-effect="financial"]').textContent,r.financial.summary.text);
 r.links=[{kind:'READ_RESULT',target_type:'CONTRACT_MOVE_OPERATION',target_id:id(3),url:'/actual/saved/owner',caption:'Check saved result',enabled:true,disabled_reason:null}];assert.match(host.resultHtml(f.context),/data-health-correction-action="0" disabled/);
});
