import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const files=new Map(['js/contract-correction-v3.mjs','js/weekly-source/contact-manual-enquiry-contract.mjs',
 'js/weekly-source/contact-manual-enquiry-controls.mjs','tests/unit/helpers/contact-manual-enquiry-fixture.mjs','css/weekly-source.css'].map(x=>['/'+x,x]));
const output=path.resolve('.codex-tmp/contact-manual-enquiry-workspace-20261016');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),external=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url()),file=files.get(url.pathname);
   if(url.origin!=='https://local-fixture.invalid'){external.push(url.href);return route.abort();}
   if(file)return route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file,'utf8')});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/weekly-source.css"><style>body{font:16px system-ui;margin:12px;background:#131d30;color:#e3e9f6;--panel:#1e2c42;--line:#506078;--accent:#687ae8}#modal{max-width:1100px;margin:auto}#modalBody{min-width:0}button{min-height:40px;margin:4px;padding:8px}input,textarea{font:inherit}table{width:100%;border-collapse:collapse}td,th{padding:7px;text-align:left;vertical-align:top}fieldset{display:grid;gap:8px}h4{overflow-wrap:anywhere}</style><button id="btnCloseModal">Close</button><div id="modal"><nav id="modalTabs"></nav><main id="modalBody"></main></div>'});
   external.push(url.href);return route.abort();
  });
  await page.goto('https://local-fixture.invalid/');
  await page.evaluate(async()=>{
   const {fixture,copy,hex,id}=await import('/tests/unit/helpers/contact-manual-enquiry-fixture.mjs');
   await import('/js/weekly-source/contact-manual-enquiry-controls.mjs');const f=fixture(),s=f.request.scopes[0];
   window.SESSION={user:{id:id(100)}};window.__modalStack=[];window.calls=[];
   window.showModal=(title,tabs,render,save,edit,wire,options)=>{const frame={kind:options.kind,key:tabs[0].key,setTab:async key=>{
    frame.key=key;document.getElementById('modalBody').innerHTML=render(key);return true;
   }};window.__modalStack.push(frame);void frame.setTab(frame.key);};
   window.closeModal=()=>{window.__modalStack.pop();const p=window.__modalStack.at(-1);if(p)void p.setTab(p.key);};
   document.getElementById('btnCloseModal').onclick=window.closeModal;
   let saved=null,lost=false;
   const model=()=>({contract:'WEEKLY_SOURCE_COMBINED_REVIEW_V1',tab:'queries',section:'questions',counts:{questions:1,checks:0},owners:[],rows:[{
    combined_key:'exact-row',scope_key:'native-owner',candidate_id:s.candidate_id,client_id:s.client_id,candidate:'Taylor',client:'Northbridge Trust',actions:[],
    children:lost?[]:s.selected_issue_ids.map((incident_id,i)=>({incident_id,day_date:i?'10/10/2026':'09/10/2026',candidate_hours:'09:00–17:00',system_hours:'09:00–16:00',issue:'Hours differ'})),
    ...(lost?{}:{contact_manual_enquiry:{version:'CONTACT_MANUAL_ENQUIRY_ROW_V1',candidate_id:s.candidate_id,client_id:s.client_id,scope_revision:s.expected_scope_revision,
     checking_revision:s.expected_checking_revision,checking_facts_sha256:hex(1),available_issue_ids:s.selected_issue_ids,
     actions:['WORKER','MANAGER'].map(audience=>({operation:'CONTACT_MANUAL_ENQUIRY_PREVIEW',audience,label:'New enquiry',enabled:true,disabled_reason:null}))}})
   }]});
   window.authFetch=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):null;
    if(!body)return Response.json({contract:'WEEKLY_SOURCE_IMPORT_WORKSPACE_V1',combined_source_workspace:true,profile:{},context:{},counts:{queries:1},imports:{},queries:{},finalise:{},history:{}});
    window.calls.push(copy(body));const {action,payload}=body;
    if(action==='COMBINED_REVIEW_WORKSPACE')return Response.json(model());
    if(action==='CONTACT_MANUAL_ENQUIRY_PREVIEW'){
     const r=copy(f.result);r.request_id=payload.request_id;r.reason=payload.reason;
     r.scope_results[0].members=r.scope_results[0].members.filter(m=>payload.scopes[0].selected_issue_ids.includes(m.issue_id));return Response.json(r);
    }
    if(action!=='CONTACT_MANUAL_ENQUIRY_ACCEPT')throw Error('Unexpected command '+action);
    if(!saved){saved=copy(f.saved);saved.request_id=payload.request_id;saved.reason=payload.reason;saved.scope_results[0].members=saved.scope_results[0].members.filter(m=>payload.scopes[0].selected_issue_ids.includes(m.issue_id));}
    if(!lost){lost=true;throw Error('Receipt lost');}return Response.json(saved);
   };
  });
  for(const file of ['contact-pause-contract.js','contact-pause-controls.js','combined-review.js','import-workspace.js','workspace-actions.js'])await page.addScriptTag({path:path.resolve('js/weekly-source',file)});
  await page.evaluate(()=>window.CloudTMSWeeklySourceImportWorkspaceV1.open('queries',{actorId:window.SESSION.user.id,currentActorId:()=>window.SESSION.user.id}));
  await page.locator('.ws-contact-more summary').click();await page.getByRole('button',{name:'New enquiry',exact:true}).click();
  await page.locator('[data-enquiry-issue]').first().waitFor();assert.equal(await page.locator('[data-enquiry-issue]').count(),2);
  await page.locator('[data-enquiry-issue]').nth(1).uncheck();await page.locator('[name="enquiry_reason"]').fill('The manager missed the earlier email.');
  await page.getByRole('button',{name:'Preview message',exact:true}).click();await page.getByRole('button',{name:'Send email',exact:true}).waitFor();
  assert.equal(await page.getByText('Worker / client / shift',{exact:true}).count(),1);
  await page.screenshot({path:path.join(output,viewport.width+'-review.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Send email',exact:true}).click();await page.locator('[data-enquiry-retry]').waitFor();
  await page.locator('[data-wsa-enquiry-back]').click();await page.locator('[data-wsr-original-enquiry]').waitFor();
  assert.equal(await page.locator('[data-wsr-new-enquiry]').count(),0);
  await page.locator('[data-wsr-original-enquiry]').click();await page.locator('[data-enquiry-retry]').waitFor();
  await page.locator('[data-enquiry-retry]').click();await page.getByText('Your enquiry was saved. Delivery is pending.',{exact:false}).waitFor();
  const commands=await page.evaluate(()=>window.calls.filter(c=>c.action.startsWith('CONTACT_MANUAL')));
  assert.equal(commands.length,3);assert.deepEqual(commands[1],commands[2]);assert.equal(commands[0].payload.scopes[0].selected_issue_ids.length,1);
  assert.equal(commands[0].payload.scopes[0].expected_scope_revision,'9007199254740993');assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  results.push({viewport,actual_parent_and_event_binding:true,exact_shift_selection:true,original_retry_after_row_disappears:true,revision_strings:true,page_errors:0,external_requests:0});await page.close();
 }
}finally{await browser.close();}
const receipt={scope:'LOCAL_ACTUAL_WORKSPACE_MOCK_SHELL_API_NOT_NATIVE_OR_INSTALLED',results,screenshots:output};
fs.writeFileSync(path.join(output,'RESULT.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
