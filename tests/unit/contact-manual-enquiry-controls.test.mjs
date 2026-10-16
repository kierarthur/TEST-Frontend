import test from 'node:test';
import assert from 'node:assert/strict';
import {createContactManualEnquiryControls as create} from '../../js/weekly-source/contact-manual-enquiry-controls.mjs';
import {id,hex,copy,fixture} from './helpers/contact-manual-enquiry-fixture.mjs';

function model({responses=[],current=()=>true}={}){
 const f=fixture(),calls=[],scope=f.request.scopes[0];
 const context={version:'CONTACT_MANUAL_ENQUIRY_ROW_V1',candidate_id:scope.candidate_id,client_id:scope.client_id,
  scope_revision:scope.expected_scope_revision,checking_revision:scope.expected_checking_revision,checking_facts_sha256:hex(1),available_issue_ids:[...scope.selected_issue_ids],
  actions:['WORKER','MANAGER'].map(audience=>({operation:'CONTACT_MANUAL_ENQUIRY_PREVIEW',audience,label:'New enquiry',enabled:true,disabled_reason:null}))};
 const controls=create({contexts:[context],selections:[{candidate_id:scope.candidate_id,client_id:scope.client_id,selected_issue_ids:[...scope.selected_issue_ids]}],
  command:async(action,payload)=>{
   calls.push({action,payload:copy(payload)});const next=responses.shift();if(next instanceof Error)throw next;
   if(typeof next==='function')return next(action,payload,f);
   const result=copy(action==='CONTACT_MANUAL_ENQUIRY_PREVIEW'?f.result:f.saved);
   result.request_id=payload.request_id;result.reason=payload.reason;return result;
  },isCurrent:current});
 controls.edit({reason:f.request.reason});return {f,controls,calls,context};
}
test('review then confirm retains server eligibility, selected issues and exact opaque string witnesses',async()=>{
 const {controls,calls}=model();await controls.preview();await controls.accept();
 assert.equal(calls.length,2);assert.equal(calls[0].action,'CONTACT_MANUAL_ENQUIRY_PREVIEW');assert.equal(calls[1].action,'CONTACT_MANUAL_ENQUIRY_ACCEPT');
 assert.equal(calls[0].payload.scopes[0].expected_scope_revision,'9007199254740993');
 const {review_id,review_digest,...base}=calls[1].payload;assert.deepEqual(base,calls[0].payload);assert.equal(review_id,id(10));assert.equal(review_digest,hex(4));
 assert.equal(controls.snapshot().receipt.provider_submission_started,false);assert.match(controls.html(),/Delivery is pending/);
 await assert.rejects(()=>controls.accept(),/Refresh the workspace/);assert.equal(calls.length,2);
});
test('lost preview keeps the same exact original request and blocks reason/audience/selection edits',async()=>{
 const {controls,calls}=model({responses:[Error('transport lost')]});
 await assert.rejects(()=>controls.preview());const pending=controls.snapshot().pending;
 assert.throws(()=>controls.edit({reason:'Another reason'}),/original request/);
 await assert.rejects(()=>controls.preview(),/Retry the original/);await controls.retry();
 assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1],pending);assert.equal(controls.snapshot().pending,null);
});
test('lost confirmation is retried unchanged and cannot allocate another enquiry or ordinal',async()=>{
 const rejected=new Error('reply lost');
 // Simulate a committed acceptance whose reply is lost without changing the
 // saved native receipt. The command callback owns that response uncertainty.
 const second=model({responses:[undefined,rejected]});await second.controls.preview();
 await assert.rejects(()=>second.controls.accept());assert.match(second.controls.html(),/Retry original confirmation/);
 assert.throws(()=>second.controls.edit({audience:'WORKER'}),/original request/);await second.controls.retry();
 assert.deepEqual(second.calls[1],second.calls[2]);assert.equal(second.controls.snapshot().receipt.groups[0].members[0].send_ordinal,3);
});
test('a foreign or changed parent blocks every command',async()=>{
 let active=true;const {controls,calls}=model({current:()=>active});await controls.preview();active=false;
 await assert.rejects(()=>controls.accept(),/selected work/);assert.equal(calls.length,1);
 assert.throws(()=>controls.edit({reason:'new'}),/selected work/);
});
test('editing a reviewed reason clears confirmation authority; no browser recalculation',async()=>{
 const {controls,calls}=model();await controls.preview();controls.edit({reason:'A different deliberate reason.'});
 assert.equal(controls.snapshot().review,null);await assert.rejects(()=>controls.accept(),/Review the current/);assert.equal(calls.length,1);
 await controls.preview();assert.notEqual(calls[0].payload.request_id,calls[1].payload.request_id);
 assert.equal(calls[1].payload.reason,'A different deliberate reason.');
});
test('a stale native review refusal clears the review but does not silently retry',async()=>{
 const error=Object.assign(Error('native stale'),{status:409,code:'CONTACT_MANUAL_ENQUIRY_REVIEW_STALE'});
 const {controls,calls}=model({responses:[undefined,error]});await controls.preview();await assert.rejects(()=>controls.accept());
 assert.equal(calls.length,2);assert.equal(controls.snapshot().pending,null);assert.equal(controls.snapshot().review,null);
 assert.match(controls.html(),/Refresh the workspace/);
});
test('missing reason is visible and sends nothing; server-provided names and reason are escaped',async()=>{
 const {controls,calls}=model();controls.edit({reason:''});await assert.rejects(()=>controls.preview(),/Enter a reason/);
 assert.equal(calls.length,0);assert.match(controls.html(),/role="alert"/);
 controls.edit({reason:'<img src=x onerror=alert(1)>'});await controls.preview();assert.doesNotMatch(controls.html(),/<img/);assert.match(controls.html(),/&lt;img/);
});
test('ineligible preview cannot be confirmed and foreign selected issues are refused',async()=>{
 const {controls,calls}=model({responses:[(action,payload,f)=>{
  const result=copy(f.result);result.request_id=payload.request_id;result.reason=payload.reason;
  for(const member of result.scope_results[0].members){member.eligible=false;member.exclusion_reason='PAUSED';}
  Object.assign(result,{groups:[],can_accept:false,review_id:null,review_digest:null,expires_at_utc:null});return result;
 }]});
 await controls.preview();await assert.rejects(()=>controls.accept(),/Review the current/);assert.equal(calls.length,1);
 assert.throws(()=>controls.edit({selections:[{candidate_id:id(2),client_id:id(3),selected_issue_ids:[id(90)]}]}),/Refresh the selected/);
});
