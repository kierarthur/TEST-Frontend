import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from 'playwright';

// Actual saved workspace renderer, event binder, dispatcher and controls.
// Only the modal shell and authenticated API replies are isolated fixtures.
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),external=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   if(route.request().url()==='https://local-fixture.invalid/'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><button id="btnCloseModal">Close</button><div id="modal"><nav id="modalTabs"></nav><main id="modalBody"></main></div></body></html>'});
   external.push(route.request().url());return route.abort();
  });
  await page.goto('https://local-fixture.invalid/');
  await page.evaluate(()=>{
   const id=n=>`f7160000-0000-4000-8000-${String(n).padStart(12,'0')}`;
   window.SESSION={user:{id:id(1)}};window.__modalStack=[];window.contactCalls=[];
   window.showModal=(title,tabs,render,save,edit,wire,options)=>{
    const frame={kind:options.kind,key:tabs[0].key,setTab:async key=>{
     frame.key=key;document.getElementById('modalBody').innerHTML=render(key);return true;
    }};
    window.__modalStack.push(frame);void frame.setTab(frame.key);
   };
   window.closeModal=()=>{window.__modalStack.pop();const parent=window.__modalStack.at(-1);if(parent)void parent.setTab(parent.key);};
   document.getElementById('btnCloseModal').onclick=window.closeModal;
   const off=()=>({paused:false,paused_until_utc:null,paused_until_local:null,reason:null});
   let scope={scope_id:null,candidate_id:id(10),client_id:id(11),revision:'9007199254740993',next_pause_until_utc:'2026-10-18T23:00:00.000000Z',next_pause_until_local:'2026-10-19 00:00 Europe/London',worker:off(),manager:off(),can_pause:true,can_resume:true,in_flight:[]};
   let accepted=null,lost=false;
   const model=()=>({contract:'WEEKLY_SOURCE_COMBINED_REVIEW_V1',tab:'queries',section:'questions',counts:{questions:1,checks:0},owners:[],rows:[{
    combined_key:'actual-row',scope_key:'actual-owner',candidate_id:id(10),client_id:id(11),candidate:'Taylor',client:'Northbridge Trust',children:[],actions:[],
    contact_controls:{version:'CONTACT_CONTROLS_ROW_V1',candidate_id:id(10),client_id:id(11),scope_revision:scope.revision,
     worker:{paused:scope.worker.paused,until_local:scope.worker.paused?'19/10/2026 00:00 (UK)':null},manager:{paused:false,until_local:null},
     actions:[{operation:'PAUSE',label:'Pause messages'},...(scope.worker.paused?[{operation:'RESUME',label:'Resume messages'}]:[])]}
   }]});
   window.authFetch=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):null;
    if(!body)return new Response(JSON.stringify({contract:'WEEKLY_SOURCE_IMPORT_WORKSPACE_V1',combined_source_workspace:true,profile:{},context:{},counts:{queries:1},imports:{},queries:{},finalise:{},history:{}}));
    const {action,payload}=body;window.contactCalls.push(structuredClone(body));
    if(action==='COMBINED_REVIEW_WORKSPACE')return new Response(JSON.stringify(model()));
    if(action==='CONTACT_PAUSE_GET')return new Response(JSON.stringify({ok:true,version:'CONTACT_PAUSE_STATE_V1',scope}));
    if(!['CONTACT_PAUSE','CONTACT_RESUME'].includes(action))throw Error('Unexpected fixture command');
    if(action==='CONTACT_PAUSE'&&!accepted){
     scope={...scope,scope_id:id(20),revision:'9007199254740994',worker:{paused:true,paused_until_utc:scope.next_pause_until_utc,paused_until_local:scope.next_pause_until_local,reason:payload.note}};
     accepted={ok:true,version:'CONTACT_PAUSE_RECEIPT_V1',request_id:payload.request_id,operation:'PAUSE',audience:payload.audience,changed:true,recheck_task_id:id(50),automatic_send:false,scope:structuredClone(scope)};
    }
    if(action==='CONTACT_PAUSE'&&!lost){lost=true;throw Error('Receipt lost');}
    if(action==='CONTACT_RESUME'){
     scope={...scope,revision:'9007199254740995',worker:off()};
     return new Response(JSON.stringify({ok:true,version:'CONTACT_PAUSE_RECEIPT_V1',request_id:payload.request_id,operation:'RESUME',audience:payload.audience,changed:true,recheck_task_id:id(51),automatic_send:false,scope}));
    }
    return new Response(JSON.stringify(accepted));
   };
  });
  for(const file of ['contact-pause-contract.js','contact-pause-controls.js','combined-review.js','import-workspace.js','workspace-actions.js'])await page.addScriptTag({path:path.resolve('js/weekly-source',file)});
  await page.evaluate(()=>window.CloudTMSWeeklySourceImportWorkspaceV1.open('queries',{actorId:window.SESSION.user.id,currentActorId:()=>window.SESSION.user.id}));
  await page.locator('.ws-contact-more summary').click();
  await page.locator('[data-wsr-contact-control="PAUSE"]').click();
  await page.locator('[data-contact-save]:not([disabled])').waitFor();
  await page.locator('[name="contact_audience"][value="WORKER"]').check();
  await page.locator('[name="contact_note"]').fill('Office checked Taylor only.');
  await page.locator('[data-contact-save]').click();await page.locator('[data-contact-retry]').waitFor();
  await page.locator('[data-wsa-contact-back]').click();
  await page.locator('.ws-contact-more summary').click();await page.locator('[data-wsr-contact-control="PAUSE"]').click();
  await page.locator('[data-contact-retry]').waitFor();
  assert.equal(await page.evaluate(()=>window.contactCalls.filter(x=>x.action==='CONTACT_PAUSE_GET').length),1);
  await page.locator('[data-contact-retry]').click();await page.getByText('Saved acknowledgement',{exact:true}).waitFor();
  const saves=await page.evaluate(()=>window.contactCalls.filter(x=>x.action==='CONTACT_PAUSE'));
  assert.equal(saves.length,2);assert.deepEqual(saves[0],saves[1]);assert.equal(saves[0].payload.audience,'WORKER');
  await page.locator('[data-wsa-contact-back]').click();
  await page.getByText('Worker contact paused until 19/10/2026 00:00 (UK)',{exact:true}).waitFor();
  await page.locator('.ws-contact-more summary').click();await page.locator('[data-wsr-contact-control="RESUME"]').click();
  await page.locator('[data-contact-save]:not([disabled])').waitFor();
  await page.getByText('Old reminders will not all be sent at once.',{exact:false}).waitFor();
  await page.locator('[name="contact_audience"][value="WORKER"]').check();await page.locator('[data-contact-save]').click();
  await page.getByText('Your resume request was saved.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>window.__modalStack.length),2);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  results.push({viewport,actual_workspace_event_binding:true,parent_return:true,original_retry_retained:true,resume_recheck_copy:true,external_requests:0});await page.close();
 }
}finally{await browser.close();}
console.log(JSON.stringify({scope:'LOCAL_WORKSPACE_REAL_DOM_MOCK_SHELL_AND_API_NOT_NATIVE_OR_INSTALLED_ACCEPTANCE',results},null,2));
