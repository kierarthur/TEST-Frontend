import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from 'playwright';

// Real saved component/DOM with isolated command replies. No real API or send.
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),external=[];
  await page.route('**/*',route=>{
   if(route.request().url()==='https://local-fixture.invalid/'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main id="contact"></main></body></html>'});
   external.push(route.request().url());return route.abort();
  });
  await page.goto('https://local-fixture.invalid/');
  for(const file of ['contact-pause-contract.js','contact-pause-controls.js'])await page.addScriptTag({path:path.resolve('js/weekly-source',file)});
  await page.evaluate(async()=>{
   const id=n=>`f7160000-0000-4000-8000-${String(n).padStart(12,'0')}`;
   const off=()=>({paused:false,paused_until_utc:null,paused_until_local:null,reason:null});
   let scope={scope_id:null,candidate_id:id(10),client_id:id(11),revision:'9007199254740993',
    next_pause_until_utc:'2026-10-18T23:00:00.000000Z',next_pause_until_local:'2026-10-19 00:00 Europe/London',
    worker:off(),manager:off(),can_pause:true,can_resume:true,in_flight:[]};
   let accepted=null,lost=false;window.contactCalls=[];
   const command=async(action,payload)=>{
    window.contactCalls.push({action,payload:structuredClone(payload)});
    if(action==='CONTACT_PAUSE_GET')return{ok:true,version:'CONTACT_PAUSE_STATE_V1',scope:structuredClone(scope)};
    if(!accepted){
     scope={...scope,scope_id:id(20),revision:'9007199254740994',worker:{paused:true,paused_until_utc:scope.next_pause_until_utc,paused_until_local:scope.next_pause_until_local,reason:payload.note}};
     accepted={ok:true,version:'CONTACT_PAUSE_RECEIPT_V1',request_id:payload.request_id,operation:'PAUSE',audience:payload.audience,
      changed:true,recheck_task_id:id(50),automatic_send:false,scope:structuredClone(scope)};
    }
    if(!lost){lost=true;throw new Error('Receipt lost');}
    return structuredClone(accepted);
   };
   window.contactControls=window.CloudTMSContactPauseControlsV1.create({candidateId:id(10),clientId:id(11),candidate:'Taylor',client:'Northbridge Trust',command,isCurrent:()=>true});
   window.contactControls.mount(document.getElementById('contact'));await window.contactControls.load();
  });
  await page.getByText('Messages resume Monday 19/10/2026 at 00:00 (UK), or you can resume them earlier.',{exact:false}).waitFor();
  await page.locator('[name="contact_audience"][value="WORKER"]').check();
  await page.locator('[name="contact_note"]').fill('Office checked Taylor only.');
  await page.locator('[data-contact-save]').click();
  await page.locator('[data-contact-retry]').waitFor();
  assert.equal(await page.locator('[data-contact-refresh]').isDisabled(),true);
  assert.equal(await page.locator('[name="contact_note"]').isDisabled(),true);
  await page.locator('[data-contact-retry]').click();
  await page.getByText('Saved acknowledgement',{exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.contactCalls);
  assert.equal(calls.length,3);assert.deepEqual(calls[1],calls[2]);
  assert.equal(calls[1].payload.expected_revision,'9007199254740993');assert.equal(calls[1].payload.audience,'WORKER');
  assert.equal(calls[1].payload.note,'Office checked Taylor only.');
  await page.locator('[data-contact-refresh]').click();
  await page.waitForFunction(()=>window.contactControls.snapshot().stale===false);
  assert.equal(await page.getByText('Saved acknowledgement',{exact:true}).count(),0);
  assert.equal(external.length,0);results.push({viewport,large_revision:true,exact_uncertain_retry:true,fresh_read_required:true,external_requests:0});
  await page.close();
 }
}finally{await browser.close();}
console.log(JSON.stringify({scope:'LOCAL_COMPONENT_REAL_DOM_MOCK_COMMANDS_NOT_NATIVE_OR_INSTALLED_ACCEPTANCE',results},null,2));
