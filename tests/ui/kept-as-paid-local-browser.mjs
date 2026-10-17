import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright';
// Actual saved Health modules and real DOM; all API responses below are controlled.
const sourceFixture=JSON.parse(fs.readFileSync('tests/fixtures/weekly-source-presentation-v1.json')).clientSourceProtected;
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const [surface,viewport,multi]of [['SOURCE_WORKSPACE',{width:1366,height:900},false],['SIMPLE_TIMESHEET',{width:390,height:844},false],['SOURCE_WORKSPACE',{width:1366,height:900},true],['SIMPLE_TIMESHEET',{width:390,height:844},true]]){
  const page=await browser.newPage({viewport}),external=[];
  await page.route('**/*',route=>{
   if(route.request().url()==='https://keep-fixture.invalid/'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main id="parent"></main></body></html>'});
   external.push(route.request().url());return route.abort();
  });
  await page.goto('https://keep-fixture.invalid/');
  await page.addStyleTag({content:'body{margin:12px;font:16px Arial}#child{position:fixed;inset:12px;background:#fff;color:#111;border:1px solid #777;padding:12px;overflow:auto;z-index:10}#parent{max-height:85vh;overflow:auto}button{padding:10px}'});
  for(const file of ['css/weekly-source.css','css/kept-as-paid.css'])await page.addStyleTag({path:path.resolve(file)});
  await page.evaluate(({surface,sourceFixture,multi})=>{
   const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
   window.SESSION={user:{id:id(10),role:'payment_authoriser'}};window.API=p=>p;
   window.publicContext={schema_version:'WEEKLY_SOURCE_KEPT_AS_PAID_CONTEXT_READ_V1',work_event_id:id(1),candidate_id:id(2),client_id:id(3),contract_id:id(4),source_group_id:id(5),source_cycle_id:id(6),finalisation_week_ending:'2026-10-18',projection_publication_id:id(7),upload_id:id(8),source_present:false,invoiced:false,paid:null,paid_evidence_state:'UNKNOWN',root_timesheet_ids:[id(9)],credit_lines:[],reason:'NOT_INVOICED_DISAPPEARED',kept_by_default:true,decision_available:true,decision_needed:true,facts_fingerprint:'a'.repeat(64),decision_applies:false,latest_acknowledgement:{audit_id:id(70),decision_id:id(71),actor_user_id:id(72),actor_display:'Earlier <worker>',acknowledged_at_utc:'2026-01-17T12:34:56Z',acknowledgement_sequence:'9007199254740993'},holds_pay:null,holds_invoice:null,accepted_source_removed:false,disabled_reason:null};
   if(multi)window.publicContext={...window.publicContext,invoiced:true,reason:'CREDITED',credit_lines:[{invoice_line_id:id(40)},{invoice_line_id:id(41)}],disabled_reason:{code:'CREDIT_SELECTION_REQUIRED',message:'Open the credited Source line before recording Keep as paid.'}};
   window.discoveryRows=()=>[{work_event_id:id(1),candidate:'Taylor <script>',work_date:'2026-10-17',start:'09:00',end:'17:00',break_minutes:30,context:structuredClone(window.publicContext),unavailable_reason:null}];
   window.rawWorkspace=()=>({profile:{id:'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1'},selected:{source_group_id:id(5),source_cycle_id:id(6),client_id:id(3)},kept_as_paid_contexts:window.discoveryRows(),queries:{rows:[]}});
   window.keepCalls=[];window.loseOnce=true;window.parentRefreshes=0;
   window.authFetch=async(url,options={})=>{
    if(!options.body){window.parentRefreshes++;return Response.json(window.rawWorkspace());}
    const body=JSON.parse(options.body);window.keepCalls.push({body,bytes:options.body});
    if(body.action==='KEEP_AS_PAID_CONTEXT'){
     if(window.changeActorDuringRead)window.SESSION.user.id=id(99);
     const context=window.publicContext;return Response.json(context.reason==='CREDITED'&&context.decision_needed===true?{...context,disabled_reason:body.payload.credit_invoice_line_id?null:{code:'CREDIT_SELECTION_REQUIRED',message:'Open the credited Source line before recording Keep as paid.'}}:context);
    }
    if(window.loseOnce){window.loseOnce=false;throw Error('controlled response loss');}
    const p=body.payload;window.publicContext={...window.publicContext,decision_needed:false,decision_applies:true,disabled_reason:{code:'CURRENT_ACKNOWLEDGEMENT',message:'Keep as paid is already recorded for these Source facts.'},latest_acknowledgement:{audit_id:id(80),decision_id:id(81),actor_user_id:id(10),actor_display:'Office <name>',acknowledged_at_utc:'2026-10-17T12:34:56Z',acknowledgement_sequence:'9223372036854775807'}};
    return Response.json({ok:true,decision:'KEEP_AS_PAID',decision_id:id(81),work_event_id:p.work_event_id,reason:p.reason,credit_invoice_line_id:p.credit_invoice_line_id,facts_fingerprint:p.expected_facts_fingerprint,actor_user_id:id(10),acknowledged_at_utc:'2026-10-17T12:34:56Z',acknowledgement_sequence:'9223372036854775807',idempotent_replay:true,pay_changed:false,invoice_changed:false});
   };
   window.nativeContext={entity:'timesheets',openToken:'real-parent-open',data:{timesheet_id:id(9)},timesheetDetails:{...sourceFixture,timesheet:{timesheet_id:id(9),sheet_scope:'WEEKLY',is_current:true,archived_at_utc:null}}};
   window.parentFrame={kind:surface==='SOURCE_WORKSPACE'?'weekly-source-imports-v1':'timesheets',mode:'view',_ctxRef:window.nativeContext,_token:'real-parent-token'};
   window.__modalStack=[window.parentFrame];window.modalCtx=window.nativeContext;
   window.closeModal=()=>{const child=window.__modalStack.pop();child._detachGlobal?.();document.getElementById('child')?.remove();window.modalCtx=window.parentFrame._ctxRef;document.getElementById('parent').hidden=false;};
   window.showModal=(title,tabs,render,save,edit,wire,options)=>{
    const child={kind:options.kind,_ctxRef:window.modalCtx};window.__modalStack.push(child);document.getElementById('parent').hidden=true;
    const host=document.createElement('section');host.id='child';host.setAttribute('role','dialog');host.setAttribute('aria-label',title);host.innerHTML=render();document.body.append(host);
   };
  },{surface,sourceFixture,multi});
  for(const file of ['js/weekly-source/kept-as-paid-contract.js','js/weekly-source/kept-as-paid-controls.js','js/weekly-source-presentation-v1.js','js/weekly-source/import-workspace.js','js/weekly-source/workspace-actions.js'])await page.addScriptTag({path:path.resolve(file)});
  await page.evaluate(surface=>{
   window.renderParent=()=>{
    if(surface==='SOURCE_WORKSPACE'){
     const api=window.CloudTMSWeeklySourceImportWorkspaceV1,s=api._session;s.workspace=api.normaliseWorkspace(window.rawWorkspace());s.activeTab='queries';s.loadedTab='queries';s.loading=false;s.openGeneration=1;s.openCurrent=()=>true;
     document.getElementById('parent').innerHTML=api.renderWorkspace(s.workspace,'queries',s);
    }else{
     window.nativeContext.timesheetDetails.weekly_source_presentation.kept_as_paid_contexts=window.discoveryRows();
     const api=window.CloudTMSWeeklySourcePresentationV1;document.getElementById('parent').innerHTML=api.renderSimpleLines(api.buildViewModel(window.nativeContext.timesheetDetails));
    }
   };
   window.parentFrame.setTab=async()=>window.renderParent();
   window.refreshSimpleWeeklySourcePresentation=async current=>{if(!current())return false;window.parentRefreshes++;window.renderParent();return current();};window.renderParent();
  },surface);
  await page.getByText('Kept as paid by Earlier <worker> on 17/01/2026 12:34:56',{exact:true}).waitFor();
  assert.equal(await page.locator('script').filter({hasText:'Taylor'}).count(),0);
  await page.locator('[data-kept-work-event]').click();
  if(multi){await page.locator('[data-kept-credit]').waitFor();assert.equal(await page.locator('[data-kept-save]').isDisabled(),true);assert.equal(await page.locator('[data-kept-credit]').inputValue(),'');await page.locator('[data-kept-credit]').selectOption('10000000-0000-0000-0000-000000000041');}
  await page.locator('[data-kept-save]:not([disabled])').waitFor();
  await page.locator('[data-kept-save]').click();await page.locator('[data-kept-retry]').waitFor();assert.equal(await page.locator('[data-kept-refresh]').isDisabled(),true);
  await page.locator('[data-kept-back]').click();assert.equal(await page.evaluate(()=>window.keepCalls.length),multi?3:2);
  await page.locator('[data-kept-work-event]').click();await page.locator('[data-kept-retry]').waitFor();assert.equal(await page.evaluate(()=>window.keepCalls.length),multi?3:2);
  await page.locator('[data-kept-retry]').click();await page.getByText('Kept as paid by Office <name> on 17/10/2026 13:34:56',{exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.keepCalls),writeIndex=multi?2:1;assert.equal(calls.length,multi?5:4);assert.equal(calls[writeIndex].bytes,calls[writeIndex+1].bytes);assert.equal(Object.keys(calls[writeIndex+1].body.payload).length,7);if(multi){assert.equal(calls[1].body.action,'KEEP_AS_PAID_CONTEXT');assert.equal(calls[1].body.payload.credit_invoice_line_id,'10000000-0000-0000-0000-000000000041');assert.equal(calls[writeIndex].body.payload.credit_invoice_line_id,'10000000-0000-0000-0000-000000000041');}
  assert.equal(await page.locator('[data-kept-save]').isDisabled(),true);assert.equal(await page.locator('.ws-kept-controls dd').filter({hasText:'Not known'}).count(),4);
  const back=await page.locator('[data-kept-back]').boundingBox();assert(back&&back.y>=0&&back.y+back.height<=viewport.height);
  await page.locator('[data-kept-back]').click();await page.waitForFunction(()=>window.parentRefreshes===1);
  assert.equal(await page.locator('#child').count(),0);assert.equal(await page.evaluate(()=>window.__modalStack.length),1);
  await page.locator('#parent').getByText('Kept as paid by Office <name> on 17/10/2026 13:34:56',{exact:true}).waitFor();
  assert.equal(await page.locator('#parent').getByText('Kept as paid by Office <name> on 17/10/2026 13:34:56',{exact:true}).count(),1);
  assert.equal(external.length,0);results.push({surface,viewport,explicitGenuineMultiCreditSelection:multi,exactLostReplyJournal:true,currentAcknowledgement:true,parentRefresh:true,externalRequests:0});
  await page.close();
 }
 const shared=await browser.newContext(),tabs=[await shared.newPage(),await shared.newPage()],external=[];
 for(const [index,page]of tabs.entries()){
  await page.route('**/*',route=>{
   if(route.request().url()==='https://keep-race.invalid/'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main id="race"></main></body></html>'});
   external.push(route.request().url());return route.abort();
  });
  await page.goto('https://keep-race.invalid/');
  for(const file of ['js/weekly-source/kept-as-paid-contract.js','js/weekly-source/kept-as-paid-controls.js'])await page.addScriptTag({path:path.resolve(file)});
  await page.evaluate(index=>{
   const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');window.current=true;window.writes=[];window.authorityRevoked=index===1;
   const ctx={schema_version:'WEEKLY_SOURCE_KEPT_AS_PAID_CONTEXT_READ_V1',work_event_id:id(1),candidate_id:id(2),client_id:id(3),contract_id:id(4),source_group_id:id(5),source_cycle_id:id(6),finalisation_week_ending:'2026-10-18',projection_publication_id:id(7),upload_id:id(8),source_present:false,invoiced:false,paid:null,paid_evidence_state:'UNKNOWN',root_timesheet_ids:[id(9)],credit_lines:[],reason:'NOT_INVOICED_DISAPPEARED',kept_by_default:true,decision_available:true,decision_needed:true,facts_fingerprint:'a'.repeat(64),decision_applies:false,latest_acknowledgement:null,holds_pay:null,holds_invoice:null,accepted_source_removed:false,disabled_reason:null};
   window.controller=window.CloudTMSKeptAsPaidV1.create({actorId:id(10),workEventId:id(1),parentKey:'TIMESHEET:'+id(9),isCurrent:()=>window.current,request:async options=>{
    const body=JSON.parse(options.body);if(body.action==='KEEP_AS_PAID_CONTEXT')return Response.json(ctx);
    window.writes.push(options.body);
    if(index===0)return new Promise((resolve,reject)=>{window.loseReply=()=>reject(Error('controlled lost reply after parent closed'));});
    if(window.authorityRevoked)return Response.json({error_code:'WEEKLY_SOURCE_PAYMENT_AUTHORISER_REQUIRED'},{status:403});
    const p=body.payload;return Response.json({ok:true,decision:'KEEP_AS_PAID',decision_id:id(20),work_event_id:p.work_event_id,reason:p.reason,credit_invoice_line_id:p.credit_invoice_line_id,facts_fingerprint:p.expected_facts_fingerprint,actor_user_id:id(10),acknowledged_at_utc:'2026-10-17T12:34:56Z',acknowledgement_sequence:'9007199254740993',idempotent_replay:true,pay_changed:false,invoice_changed:false});
   }});window.controller.mount(document.getElementById('race'));
  },index);
  await page.evaluate(()=>window.controller.load());
 }
 await tabs[0].evaluate(()=>{window.original=window.controller.save().catch(error=>{window.originalError=error.message;});});
 await tabs[0].waitForFunction(()=>window.writes.length===1&&typeof window.loseReply==='function');
 const journal=await tabs[0].evaluate(()=>localStorage.getItem(window.CloudTMSKeptAsPaidV1.journalKey('10000000-0000-0000-0000-000000000010')));
 const competing=await tabs[1].evaluate(()=>window.controller.save().then(()=>null,error=>error.message));assert.equal(competing,'KEEP_ANOTHER_WINDOW_ACTIVE');
 assert.equal(await tabs[1].evaluate(()=>window.writes.length),0);assert.equal(await tabs[1].evaluate(()=>localStorage.getItem(window.CloudTMSKeptAsPaidV1.journalKey('10000000-0000-0000-0000-000000000010'))),journal);
 assert.equal(await tabs[0].evaluate(async()=>(await navigator.locks.query()).held.length),1);
 await tabs[0].evaluate(async()=>{window.current=false;window.loseReply();await window.original;});
 const fresh=await tabs[1].evaluate(()=>window.controller.save().then(()=>null,error=>error.message));assert.match(fresh,/original/);
 const refused=await tabs[1].evaluate(()=>window.controller.retry().then(()=>null,error=>error.code));assert.equal(refused,'WEEKLY_SOURCE_PAYMENT_AUTHORISER_REQUIRED');
 assert.equal(await tabs[1].evaluate(()=>localStorage.getItem(window.CloudTMSKeptAsPaidV1.journalKey('10000000-0000-0000-0000-000000000010'))),journal);assert.match(await tabs[1].locator('#race').innerText(),/save result is uncertain/);assert.doesNotMatch(await tabs[1].locator('#race').innerText(),/was not saved/);
 await tabs[1].evaluate(()=>{window.authorityRevoked=false;});await tabs[1].evaluate(()=>window.controller.retry());
 assert.equal(await tabs[1].evaluate(()=>window.writes.length),2);for(const n of [0,1])assert.equal(await tabs[1].evaluate(n=>window.writes[n],n),await tabs[0].evaluate(()=>window.writes[0]));
 assert.equal(await tabs[1].evaluate(()=>localStorage.getItem(window.CloudTMSKeptAsPaidV1.journalKey('10000000-0000-0000-0000-000000000010'))),null);
 assert.equal(await tabs[1].evaluate(async()=>(await navigator.locks.query()).held.length),0);assert.equal(external.length,0);
 results.push({surface:'TWO_REAL_TABS_SHARED_ORIGIN',exclusiveWebLock:true,competingFreshRequestRefused:true,closedParentLostReplyRetainsOriginalJournal:true,authorityRevocationRetainsCommittedLostAckJournal:true,restoredAuthorityIdenticalReplay:true,identicalCrossTabRetry:true,externalRequests:0});
 await shared.close();
}finally{await browser.close();}
console.log(JSON.stringify({scope:'ACTUAL_SAVED_HEALTH_MODULES_CONTROLLED_RESPONSES_REAL_DOM_NOT_NATIVE_OR_INSTALLED',cases:results.length,results},null,2));
