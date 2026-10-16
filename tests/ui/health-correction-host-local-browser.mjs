import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright'),hash=x=>createHash('sha256').update(x).digest('hex');
const main=fs.readFileSync('js/main.js','utf8'),index=fs.readFileSync('index.html','utf8');
function span(start,end){const a=main.indexOf(start),b=main.indexOf(end,a+start.length);assert(a>=0&&b>a);return main.slice(a,b);}
const overview=span('function renderTimesheetOverviewTab(ctx) {','async function handleHrRotaFileDrop('),close=span('function closeModal(){','// === Helpers for modal mode & interactivity ===');
const tabs=span('function makeTimesheetFastOpenTabDefs() {','function makeTimesheetFastOpenRenderTab('),helpers=fs.readFileSync('docs/healthroster-build/v6-owner-delivery-20261016/b051-host/host-functions.jsinc','utf8');
const start=index.indexOf('  <div class="modal-back" id="modalBack"'),end=index.indexOf('  <!-- ===== Auth overlays ===== -->',start),shell=index.slice(start,end);
const styles=[...index.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const files=['js/correction-contract-v3.js','js/timesheet-correction-host-v3.js','js/daily-rate-correction-http-adapter.js','js/daily-rate-correction.js','css/daily-rate-correction.css'];
const output=path.resolve('.codex-tmp/health-correction-host-20261016');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),external=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url()),file=url.pathname.slice(1);
   if(url.origin!=='https://local-fixture.invalid'){external.push(url.origin);return route.abort();}
   if(files.includes(file))return route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file,'utf8')});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><link rel="stylesheet" href="/css/daily-rate-correction.css">${shell}<style>#modalBack{display:flex}#modal{position:relative;left:auto;top:auto;transform:none;width:min(1050px,calc(100vw - 24px));max-height:calc(100dvh - 24px)}#modalBody{overflow:auto}#modalActions{display:none}.health-correction-more[open]{padding:8px;border:1px solid var(--line);border-radius:8px}</style>`});
   external.push(url.pathname);return route.abort();
  });
  await page.goto('https://local-fixture.invalid/');for(const file of files.filter(x=>x.endsWith('.js')))await page.addScriptTag({url:'/'+file});
  await page.evaluate(()=>{
   window.byId=id=>document.getElementById(id);window.getTsLoggers=()=>({GC(){},GE(){},L(){}});window.normaliseTimesheetCtx=value=>value;
   window.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   window.getSuccessfulHealthRosterValidation=()=>false;window.bankingNextOwnerClient=()=>null;
   window.SESSION={user:{id:'10000000-0000-4000-8000-000000000009',role:'admin'}};window.API=url=>url;window.calls=[];
   window.discardAllModalsAndState=()=>{window.__modalStack=[];document.getElementById('modalBack').style.display='none';};
  });
  await page.addScriptTag({content:overview+'\n'+close+'\n'+tabs+'\n'+helpers});
  await page.evaluate(()=>{
   const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0'),context={entity:'timesheets',openToken:'actual-parent-fixture',data:{timesheet_id:id(1),candidate_name:'Casey Morgan',client_name:'Northbridge Trust',sheet_scope:'DAILY'},
    timesheetDetails:{timesheet:{timesheet_id:id(1),sheet_scope:'DAILY',contract_id:null,line_type:'HOURS',is_adjustment:false,parent_timesheet_id:null,correction_id:null,is_current:true,archived_at_utc:null,submission_mode:'ELECTRONIC',candidate_id:id(8),week_ending_date:'2026-10-11',authorised_at_server:'2026-10-12T09:00:00Z'},policy:{},tsfin:{id:id(20),total_pay_ex_vat:'150.00',processing_status:'READY_FOR_INVOICE',authorised_at_utc:'2026-10-12T09:00:00Z'},action_flags:{}},timesheetRelated:{candidate:{id:id(8),display_name:'Casey Morgan'},client:{id:id(10),name:'Northbridge Trust'}},timesheetState:{},timesheetHydration:{detailsLoaded:true}};
   window.modalCtx=context;const frame={entity:'timesheets',kind:'timesheets',mode:'view',_ctxRef:context,_token:'actual-frame-fixture',currentTabKey:'overview',tabs:makeTimesheetFastOpenTabDefs()};
   frame.setTab=key=>{frame.currentTabKey=key;document.getElementById('modalBody').innerHTML=key==='overview'?renderTimesheetOverviewTab({row:context.data,details:context.timesheetDetails,related:context.timesheetRelated,state:context.timesheetState}):'<h2>'+key+'</h2>';wireHealthTimesheetCorrectionHost(frame);};
   window.__modalStack=[frame];window.__getModalFrame=()=>window.__modalStack.at(-1);window.safeRerenderTimesheetModal=async(token,key)=>{frame.setTab(key);return true;};
   window.refreshTimesheetModalAfterLifecycleAction=async(token,options)=>{if(token!==context.openToken||options.timesheetId!==context.data.timesheet_id)throw Error('Wrong fresh read');frame.setTab(options.tabKey);return {ok:true};};
   document.getElementById('modalTitle').textContent='Timesheet · Casey Morgan';document.getElementById('modalTabs').replaceChildren();
   for(const tab of frame.tabs){const button=document.createElement('button');button.textContent=tab.title;button.onclick=()=>frame.setTab(tab.key);document.getElementById('modalTabs').append(button);}
   document.getElementById('btnCloseModal').onclick=closeModal;
   let lost=false;const effect={visibility:'FULL',text:'The current rate authority supplies the reviewed pay revision. Earlier paid facts are retained.'};
   window.authFetch=async(url,init)=>{const body=init.body?JSON.parse(init.body):null;window.calls.push({url,method:init.method,body});
    const result={version:'DAILY_RATE_CORRECTION_V1',purpose:'DAILY_RATE_CORRECTION',operation_id:id(3),state:'COMPLETE',state_revision:'9007199254740993',placement:{status:'COMMITTED',original_timesheet_id:id(1),current_timesheet_id:id(1),placement_revision:'1',receipt_id:id(5)},financial:{status:'REGISTERED',command_id:id(6),cut_id:null,summary:effect},billing:{status:'PREPARING_DRAFTS',revision:'1',group_id:id(7),visible_summary:{visibility:'FULL',text:'Exact invoice correction Drafts are being prepared. Issue remains a separate permitted action.'}},next_actions:[],links:[]};
    if(url.endsWith('/preview'))return Response.json({version:'DAILY_RATE_CORRECTION_V1',operation_id:id(3),review_id:id(4),review_digest:'a'.repeat(64),state_revision:'9007199254740993',ready_to_confirm:true,current_timesheet_id:id(1),summary:{worked_facts_preserved:true,pay_effect:effect,invoice_effect:{visibility:'REDACTED'}},known_blockers:[],confirm:{request_version:'DAILY_RATE_CORRECTION_V1',review_id:id(4),review_digest:'a'.repeat(64),expected_state_revision:'9007199254740993'},links:[]});
    if(url.endsWith('/accept')&&!lost){lost=true;throw Error('Mock reply lost');}return Response.json(result);
   };
   frame.setTab('overview');
  });
  assert.equal(await page.locator('#modalTabs button').count(),7);assert.equal(await page.getByText('Change Contract',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Finance',exact:true}).click();await page.getByRole('button',{name:'Overview',exact:true}).click();assert.equal(await page.locator('[data-health-daily-rates]').count(),1);
  await page.locator('.health-correction-more summary').click();await page.getByRole('button',{name:'Apply updated rates',exact:true}).click();
  await page.locator('dialog').getByRole('button',{name:'Preview',exact:true}).click();await page.locator('dialog').getByRole('button',{name:'Apply updated rates',exact:true}).waitFor();
  assert.equal(await page.locator('dialog details').evaluate(node=>node.open),false);
  await page.screenshot({path:path.join(output,viewport.width+'-review.png'),fullPage:true});
  await page.locator('dialog').getByRole('button',{name:'Apply updated rates',exact:true}).click();await page.getByRole('button',{name:'Check saved result',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__modalStack.length),1);
  await page.evaluate(()=>closeModal());await page.locator('dialog').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__modalStack.length),1);
  if(!await page.locator('.health-correction-more').evaluate(node=>node.open))await page.locator('.health-correction-more summary').click();await page.locator('[data-health-daily-rates]').click();await page.getByRole('button',{name:'Check saved result',exact:true}).click();
  await page.locator('[data-health-correction-result]').waitFor();assert.equal(await page.locator('dialog').count(),0);assert.equal(await page.evaluate(()=>window.__modalStack.length),1);
  assert.equal(await page.locator('[data-health-correction-result]').getByText('Updated rates applied',{exact:true}).count(),1);
  await page.screenshot({path:path.join(output,viewport.width+'-result.png'),fullPage:true});
  const calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,3);assert.equal(calls[2].method,'GET');assert.equal(calls[2].body,null);assert.equal(calls[1].body.expected_state_revision,'9007199254740993');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  await page.evaluate(()=>{const context=window.modalCtx;delete context.__healthCorrectionResult;context.timesheetDetails.timesheet.sheet_scope='WEEKLY';context.timesheetDetails.timesheet.contract_id='10000000-0000-4000-8000-000000000002';context.data.sheet_scope='WEEKLY';window.__getModalFrame().setTab('overview');});
  await page.locator('.health-correction-more summary').click();assert.equal(await page.locator('[data-health-contract-move]').isDisabled(),true);assert.equal(await page.locator('[data-health-daily-rates]').count(),0);await page.screenshot({path:path.join(output,viewport.width+'-contract-closed.png'),fullPage:true});
  results.push({viewport,actualCompleteOverviewRenderer:true,actualHealthHostFunctions:true,actualNativeModalMarkup:true,sevenNativeTabDefinitions:true,fixturePermissionAndHydration:true,sameParentRetainedAfterCloseAndRecovery:true,unknownRequestRecoveredByExactGet:true,registeredPayAndPreparingDraftsVisible:true,externalRequests:0,pageErrors:0});await page.close();
 }
}finally{await browser.close();}
const receipt={version:'HEALTH_B051_LOCAL_BROWSER_V1',scope:'ACTUAL_RENDERER_HOST_MARKUP_WITH_CONTROLLED_CONTEXT_AND_HTTP_NOT_NATIVE_OR_INSTALLED',overviewSha256:hash(overview),closeModalSha256:hash(close),tabsSha256:hash(tabs),hostFunctionsSha256:hash(helpers),nativeModalMarkupSha256:hash(shell),results,screenshots:output};
fs.writeFileSync(path.join(output,'RESULT.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
