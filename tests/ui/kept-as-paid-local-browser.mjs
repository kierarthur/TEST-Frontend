import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright';
// Actual saved Health modules and real DOM; all API responses below are controlled.
const sourceFixture=JSON.parse(fs.readFileSync('tests/fixtures/weekly-source-presentation-v1.json')).clientSourceProtected;
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const [surface,viewport]of [['SOURCE_WORKSPACE',{width:1366,height:900}],['SIMPLE_TIMESHEET',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),external=[];
  await page.route('**/*',route=>{
   if(route.request().url()==='https://keep-fixture.invalid/'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main id="parent"></main></body></html>'});
   external.push(route.request().url());return route.abort();
  });
  await page.goto('https://keep-fixture.invalid/');
  await page.addStyleTag({content:'body{margin:12px;font:16px Arial}#child{position:fixed;inset:12px;background:#fff;color:#111;border:1px solid #777;padding:12px;overflow:auto;z-index:10}#parent{max-height:85vh;overflow:auto}button{padding:10px}'});
  for(const file of ['css/weekly-source.css','css/kept-as-paid.css'])await page.addStyleTag({path:path.resolve(file)});
  await page.evaluate(({surface,sourceFixture})=>{
   const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
   window.SESSION={user:{id:id(10),role:'payment_authoriser'}};window.API=p=>p;
   window.publicContext={schema_version:'WEEKLY_SOURCE_KEPT_AS_PAID_CONTEXT_READ_V1',work_event_id:id(1),candidate_id:id(2),client_id:id(3),contract_id:id(4),source_group_id:id(5),source_cycle_id:id(6),finalisation_week_ending:'2026-10-18',projection_publication_id:id(7),upload_id:id(8),source_present:false,invoiced:false,paid:null,paid_evidence_state:'UNKNOWN',root_timesheet_ids:[id(9)],credit_lines:[],reason:'NOT_INVOICED_DISAPPEARED',kept_by_default:true,decision_available:true,decision_needed:true,facts_fingerprint:'a'.repeat(64),decision_applies:false,latest_acknowledgement:{audit_id:id(70),decision_id:id(71),actor_user_id:id(72),actor_display:'Earlier <worker>',acknowledged_at_utc:'2026-01-17T12:34:56Z',acknowledgement_sequence:'9007199254740993'},holds_pay:null,holds_invoice:null,accepted_source_removed:false,disabled_reason:null};
   window.discoveryRows=()=>[{work_event_id:id(1),candidate:'Taylor <script>',work_date:'2026-10-17',start:'09:00',end:'17:00',break_minutes:30,context:structuredClone(window.publicContext),unavailable_reason:null}];
   window.rawWorkspace=()=>({profile:{id:'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1'},selected:{source_group_id:id(5),source_cycle_id:id(6),client_id:id(3)},kept_as_paid_contexts:window.discoveryRows(),queries:{rows:[]}});
   window.keepCalls=[];window.loseOnce=true;window.parentRefreshes=0;
   window.authFetch=async(url,options={})=>{
    if(!options.body){window.parentRefreshes++;return Response.json(window.rawWorkspace());}
    const body=JSON.parse(options.body);window.keepCalls.push({body,bytes:options.body});
    if(body.action==='KEEP_AS_PAID_CONTEXT'){
     if(window.changeActorDuringRead)window.SESSION.user.id=id(99);
     return Response.json(window.publicContext);
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
  },{surface,sourceFixture});
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
  await page.locator('[data-kept-work-event]').click();await page.locator('[data-kept-save]:not([disabled])').waitFor();
  await page.locator('[data-kept-save]').click();await page.locator('[data-kept-retry]').waitFor();assert.equal(await page.locator('[data-kept-refresh]').isDisabled(),true);
  await page.locator('[data-kept-back]').click();assert.equal(await page.evaluate(()=>window.keepCalls.length),2);
  await page.locator('[data-kept-work-event]').click();await page.locator('[data-kept-retry]').waitFor();assert.equal(await page.evaluate(()=>window.keepCalls.length),2);
  await page.locator('[data-kept-retry]').click();await page.getByText('Kept as paid by Office <name> on 17/10/2026 13:34:56',{exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.keepCalls);assert.equal(calls.length,4);assert.equal(calls[1].bytes,calls[2].bytes);assert.equal(Object.keys(calls[2].body.payload).length,7);
  assert.equal(await page.locator('[data-kept-save]').isDisabled(),true);assert.equal(await page.locator('.ws-kept-controls dd').filter({hasText:'Not known'}).count(),4);
  const back=await page.locator('[data-kept-back]').boundingBox();assert(back&&back.y>=0&&back.y+back.height<=viewport.height);
  await page.locator('[data-kept-back]').click();await page.waitForFunction(()=>window.parentRefreshes===1);
  assert.equal(await page.locator('#child').count(),0);assert.equal(await page.evaluate(()=>window.__modalStack.length),1);
  await page.locator('#parent').getByText('Kept as paid by Office <name> on 17/10/2026 13:34:56',{exact:true}).waitFor();
  assert.equal(await page.locator('#parent').getByText('Kept as paid by Office <name> on 17/10/2026 13:34:56',{exact:true}).count(),1);
  assert.equal(external.length,0);results.push({surface,viewport,exactLostReplyJournal:true,currentAcknowledgement:true,parentRefresh:true,externalRequests:0});
  await page.close();
 }
}finally{await browser.close();}
console.log(JSON.stringify({scope:'ACTUAL_SAVED_HEALTH_MODULES_CONTROLLED_RESPONSES_REAL_DOM_NOT_NATIVE_OR_INSTALLED',cases:results.length,results},null,2));
