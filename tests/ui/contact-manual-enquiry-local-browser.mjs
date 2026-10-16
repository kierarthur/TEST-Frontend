import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

// Real browser ES modules/DOM and mock command results, with every network
// request fulfilled locally or blocked. This proves no installed/native send.
const files=new Map([
 ['/js/contract-correction-v3.mjs','js/contract-correction-v3.mjs'],
 ['/js/weekly-source/contact-manual-enquiry-contract.mjs','js/weekly-source/contact-manual-enquiry-contract.mjs'],
 ['/js/weekly-source/contact-manual-enquiry-controls.mjs','js/weekly-source/contact-manual-enquiry-controls.mjs'],
 ['/fixture.mjs','tests/unit/helpers/contact-manual-enquiry-fixture.mjs'],
 ['/css/weekly-source.css','css/weekly-source.css'],
]);
const browser=await chromium.launch({headless:true}),results=[];
const output=path.resolve('.codex-tmp/contact-manual-enquiry-local-browser-20261016');fs.mkdirSync(output,{recursive:true});
try{
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),external=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url()),file=files.get(url.pathname);
   if(url.origin!=='https://local-fixture.invalid'){external.push(url.origin);return route.abort();}
   if(file)return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.resolve(file),'utf8')});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/weekly-source.css"><style>body{font:16px system-ui;margin:16px;color:#17202a;--panel:#fff;--line:#aab1ba;--accent:#145bc0;--ws-muted-text:#45536b}main{max-width:800px;margin:auto}fieldset{display:grid;gap:8px}textarea{display:block;width:95%;min-height:60px}button{min-height:42px;margin:4px;padding:8px}table{width:100%;border-collapse:collapse}td,th{padding:6px;text-align:left;vertical-align:top}h4{overflow-wrap:anywhere}section{min-width:0}</style><body><main id="enquiry"></main></body></html>'});
   external.push(url.pathname);return route.abort();
  });
  await page.goto('https://local-fixture.invalid/');
  await page.evaluate(async()=>{
   const {createContactManualEnquiryControls:create}=await import('/js/weekly-source/contact-manual-enquiry-controls.mjs');
   const {fixture,copy,hex}=await import('/fixture.mjs');const f=fixture(),scope=f.request.scopes[0];
   const context={version:'CONTACT_MANUAL_ENQUIRY_ROW_V1',candidate_id:scope.candidate_id,client_id:scope.client_id,scope_revision:scope.expected_scope_revision,
    checking_revision:scope.expected_checking_revision,checking_facts_sha256:hex(1),available_issue_ids:[...scope.selected_issue_ids],
    actions:['WORKER','MANAGER'].map(audience=>({operation:'CONTACT_MANUAL_ENQUIRY_PREVIEW',audience,label:'New enquiry',enabled:true,disabled_reason:null}))};
   window.enquiryCalls=[];let saved=null,lost=false;
   window.enquiry=create({contexts:[context],selections:[{candidate_id:scope.candidate_id,client_id:scope.client_id,selected_issue_ids:scope.selected_issue_ids}],isCurrent:()=>true,
    command:async(action,payload)=>{
     window.enquiryCalls.push({action,payload:copy(payload)});
     if(action==='CONTACT_MANUAL_ENQUIRY_PREVIEW'){const r=copy(f.result);r.request_id=payload.request_id;r.reason=payload.reason;return r;}
     if(!saved){saved=copy(f.saved);saved.request_id=payload.request_id;saved.reason=payload.reason;}
     if(!lost){lost=true;throw Error('Receipt lost');}return copy(saved);
    }});window.enquiry.mount(document.getElementById('enquiry'));
  });
  await page.locator('[name="enquiry_reason"]').fill('The manager missed the earlier email.');
  await page.locator('[data-enquiry-preview]').click();await page.locator('[data-enquiry-accept]').waitFor();
  assert.equal(await page.getByText('Confirm the worked hours before making this enquiry.',{exact:false}).count(),1);
  assert.equal(await page.getByText('WORK_EVIDENCE_REQUIRED',{exact:false}).count(),0);
  // Editing cannot leave the old preview or confirmation on screen.
  await page.locator('[name="enquiry_reason"]').fill('Office checked: another deliberate enquiry is useful.');
  assert.equal(await page.locator('[data-enquiry-accept]').count(),0);
  assert.equal(await page.locator('[data-enquiry-reviewed] table').count(),0);
  await page.locator('[data-enquiry-preview]').click();await page.locator('[data-enquiry-accept]').waitFor();
  await page.screenshot({path:path.join(output,`${viewport.width}-review.png`),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(viewport.width===390){
   const scroll=page.locator('.ws-child-scroll');
   assert.equal(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth),true);
   await scroll.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
   await page.screenshot({path:path.join(output,'390-current-record.png'),fullPage:true});
   assert.equal(await page.getByText('Hours differ',{exact:false}).count(),1);
  }
  await page.locator('[data-enquiry-accept]').click();await page.locator('[data-enquiry-retry]').waitFor();
  assert.equal(await page.locator('[name="enquiry_reason"]').isDisabled(),true);
  await page.locator('[data-enquiry-retry]').click();await page.getByText('Your enquiry was saved. Delivery is pending.',{exact:false}).waitFor();
  const calls=await page.evaluate(()=>window.enquiryCalls);assert.equal(calls.length,4);assert.deepEqual(calls[2],calls[3]);
  assert.equal(calls[2].payload.scopes[0].expected_scope_revision,'9007199254740993');
  assert.equal(external.length,0);assert.deepEqual(errors,[]);
  results.push({viewport,exact_confirmation_retry:true,stale_preview_removed:true,revision_strings:true,external_requests:0,page_errors:0});await page.close();
 }
}finally{await browser.close();}
const receipt={scope:'LOCAL_ES_MODULE_COMPONENT_REAL_DOM_MOCK_COMMANDS_NOT_NATIVE_OR_INSTALLED_ACCEPTANCE',results,screenshots:output};
fs.writeFileSync(path.join(output,'RESULT.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
