import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {createContactManualEnquiryControls as create} from '../../js/weekly-source/contact-manual-enquiry-controls.mjs';
import {decodeContactManualEnquiryRow as decodeRow} from '../../js/weekly-source/contact-manual-enquiry-contract.mjs';
import {id,hex,copy,fixture} from './helpers/contact-manual-enquiry-fixture.mjs';
const require=createRequire(import.meta.url);
globalThis.CloudTMSContactManualEnquiryV1={create,decodeRow};
const view=require('../../js/weekly-source/combined-review.js');
function row(){const f=fixture(),s=f.request.scopes[0];return {combined_key:'exact-row',scope_key:'native-owner',candidate_id:s.candidate_id,client_id:s.client_id,candidate:'Taylor',client:'Northbridge Trust',
 contact_manual_enquiry:{version:'CONTACT_MANUAL_ENQUIRY_ROW_V1',candidate_id:s.candidate_id,client_id:s.client_id,scope_revision:s.expected_scope_revision,
 checking_revision:s.expected_checking_revision,checking_facts_sha256:hex(1),available_issue_ids:[...s.selected_issue_ids,id(99)],
 actions:['WORKER','MANAGER'].map(audience=>({operation:'CONTACT_MANUAL_ENQUIRY_PREVIEW',audience,label:'New enquiry',enabled:true,disabled_reason:null}))},
 children:s.selected_issue_ids.map((incident_id,index)=>({incident_id,day_date:index?'09/10/2026':'05/10/2026',candidate_hours:'09:00–17:00',system_hours:'09:00–16:00',issue:'Hours differ'}))};}
const model=rows=>({contract:'WEEKLY_SOURCE_COMBINED_REVIEW_V1',tab:'queries',section:'questions',rows,owners:[]});
test('actual More consumes distinct typed read and intersects only genuine visible child issue IDs',()=>{
 const r=row(),m=model([r]),action=view.manualEnquiryAction(r,m);
 assert.equal(action.label,'New enquiry');assert.deepEqual(action.payload.selections[0].selected_issue_ids,[id(4),id(5)]);
 assert.equal(action.payload.contexts[0].scope_revision,'9007199254740993');assert.equal(action.payload.choices.length,2);
 assert.match(view.contactControlMenu(r,m,{}),/New enquiry/);assert.equal(r.contact_controls,undefined);
 const c=create({...action.payload,command:()=>{},isCurrent:()=>true});assert.match(c.html(),/Choose enquiry shifts/);
 assert.throws(()=>c.edit({selections:[{candidate_id:id(2),client_id:id(3),selected_issue_ids:[id(99)]}]}),/Refresh/);
 c.edit({selections:[]});assert.match(c.html(),/0 selected shifts/);
});
test('missing or malformed projection, foreign pair and payment-only views offer no enquiry',()=>{
 for(const change of [r=>delete r.contact_manual_enquiry,r=>r.contact_manual_enquiry.candidate_id=id(80),r=>r.contact_manual_enquiry.checking_revision=7,
 r=>r.contact_manual_enquiry.actions[0].extra=true,r=>r.children=[]]){const r=row();change(r);assert.equal(view.manualEnquiryAction(r,model([r])),null);}
 for(const permissions of [{contract:'WEEKLY_SOURCE_PAYMENT_VIEW_V1'},{view:'PAY'}]){const r=row();assert.equal(view.manualEnquiryAction(r,{...model([r]),permissions}),null);}
});
test('explicit selected rows retain grouped multi-scope membership and reject inconsistent same-pair witnesses',()=>{
 const r=row(),other=copy(r);other.combined_key='second';other.candidate_id=id(20);other.children[0].incident_id=id(24);other.children=other.children.slice(0,1);
 Object.assign(other.contact_manual_enquiry,{candidate_id:id(20),available_issue_ids:[id(24)]});
 const selected=new Set([r.combined_key,other.combined_key]),m=model([r,other]);
 assert.equal(view.manualEnquiryAction(r,m,selected).payload.selections.length,2);
 other.candidate_id=r.candidate_id;other.contact_manual_enquiry.candidate_id=r.candidate_id;
 assert.equal(view.manualEnquiryAction(r,m,selected),null);
});
test('worker review uses its actual typed question preview and exact Send worker question action',async()=>{
 const r=row(),f=fixture(),calls=[];
 const c=create({...view.manualEnquiryAction(r,model([r])).payload,isCurrent:()=>true,command:async(action,payload)=>{
  calls.push({action,payload:copy(payload)});const result=copy(f.result);result.request_id=payload.request_id;result.reason=payload.reason;result.audience='WORKER';
  Object.assign(result.groups[0],{audience:'WORKER',channel:'PUSH',recipient_route_id:null,candidate_generation_id:id(80),recipient:{candidate_id:id(2),manager_address:null},
   preview:{kind:'WORKER_QUERY_MODEL_V1',policy_version:'weekly-source-candidate-push-v1',renderer_version:'1.0.0',structure_version:null,rows:[],plain_body:'Open MyTMS to check your Timesheet hours.',attachment_count:0}});
  return result;
 }});
 c.edit({audience:'WORKER',reason:'Please check the same original question.'});await c.preview();
 assert.match(c.html(),/Send worker question/);assert.match(c.html(),/Open MyTMS to check your Timesheet hours/);
 assert.doesNotMatch(c.html(),/>Send email</);assert.equal(calls.length,1);assert.equal(calls[0].payload.audience,'WORKER');
 c.edit({selections:[]});await assert.rejects(()=>c.preview(),/Select the shifts/);assert.equal(calls.length,1);
});
function parentFixture(){
 const f=fixture(),calls=[],controllers=[],timers=[],parent={kind:'weekly-source-imports-v1'};let host,lost=true,contextCurrent=true;
 const root={module:{exports:{}},SESSION:{user:{id:id(100)}},__modalStack:[parent],Intl,Date,crypto:globalThis.crypto,setTimeout:fn=>timers.push(fn),
 document:{querySelector:()=>host,getElementById:()=>null},closeModal:()=>root.__modalStack.pop(),
 CloudTMSContactManualEnquiryV1:{decodeRow,create:options=>{const c=create(options);controllers.push(c);return c;}},
 CloudTMSWeeklySourceImportWorkspaceV1:{captureContactContext:()=>()=>contextCurrent,refresh:()=>{},issueCommand:async(action,payload)=>{
  calls.push({action,payload:copy(payload)});if(action.endsWith('ACCEPT')&&lost){lost=false;throw Error('Receipt lost');}
  const result=copy(action.endsWith('PREVIEW')?f.result:f.saved);result.request_id=payload.request_id;result.reason=payload.reason;return result;
 }},showModal:(title,tabs,render,save,edit,wire,options)=>{
  const inner={querySelector:()=>null,querySelectorAll:()=>[],innerHTML:''},back={addEventListener:(_,fn)=>back.click=fn};
  host={dataset:{},querySelector:s=>s==='[data-manual-enquiry-host]'?inner:back};root.__modalStack.push({kind:options.kind});render();
 }};
 vm.runInNewContext(fs.readFileSync(new URL('../../js/weekly-source/workspace-actions.js',import.meta.url),'utf8'),root);
 const settle=async()=>{while(timers.length)timers.shift()();await new Promise(r=>setImmediate(r));};
 const open=async(detail=view.manualEnquiryAction(row(),model([row()])))=>{assert.equal(root.module.exports.openContactManualEnquiry(detail),true);await settle();};
 return {root,parent,calls,controllers,open,settle,back:()=>host.querySelector('[data-wsa-enquiry-back]').click(),changeContext:()=>contextCurrent=false};
}
test('actual parent retains original uncertain confirmation across Back and changed row, with no second controller or request',async()=>{
 const f=parentFixture();await f.open();const c=f.controllers[0];c.edit({reason:'The manager missed the earlier email.'});await c.preview();await assert.rejects(()=>c.accept());
 f.back();assert.equal(f.root.module.exports.hasPendingContactManualEnquiry(),true);await assert.rejects(()=>c.retry(),/selected work/);
 await f.open();assert.equal(f.controllers.length,1);await c.retry();assert.deepEqual(f.calls[1],f.calls[2]);assert.equal(c.snapshot().receipt.provider_submission_started,false);
 assert.equal(f.calls.length,3);
});
test('actual parent blocks changed actor, workspace, parent or captured selection context before a native command',async()=>{
 for(const change of [f=>f.root.SESSION.user.id=id(101),f=>f.root.CloudTMSWeeklySourceImportWorkspaceV1={},f=>f.root.__modalStack[0]={kind:'other'},f=>f.changeContext()]){
  const f=parentFixture();await f.open();change(f);await assert.rejects(()=>f.controllers[0].preview(),/selected work/);assert.equal(f.calls.length,0);
 }
});
