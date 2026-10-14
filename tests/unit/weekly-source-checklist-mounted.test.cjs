const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const workspace=require('../../js/weekly-source/import-workspace.js');
test('actual saved main Imports entry binds session, user and all permission dimensions',async()=>{
  const source=fs.readFileSync(require.resolve('../../js/main.js'),'utf8');
  const start=source.indexOf('async function openImportsModal() {'),end=source.indexOf('  // Seed a neutral modalCtx for this screen',start);
  assert.ok(start>0&&end>start);const literal=source.slice(start,end)+'return "LEGACY";\n}';
  const cases=[context=>context.SESSION={...context.SESSION},context=>context.SESSION.user={...context.SESSION.user},context=>context.SESSION.user.roles.push('other'),context=>context.SESSION.user.role='other',context=>context.SESSION.user.is_active=false,context=>context.SESSION.user.payment_authoriser=true,context=>context.SESSION.user.payment_golden_key=true];
  for(const mutate of cases){let request;const context={SESSION:{user:{id:'same',roles:['admin'],role:'admin',is_active:true,payment_authoriser:false,payment_golden_key:false}},window:{CloudTMSWeeklySourceImportWorkspaceV1:{open:async(tab,options)=>{request={tab,options};return 'OPEN';}}},bankingNextOwnerClient:()=>null};
    vm.createContext(context);vm.runInContext(literal,context);assert.equal(await context.openImportsModal(),'OPEN');assert.equal(request.tab,'imports');assert.equal(request.options.current(),true);mutate(context);assert.equal(request.options.current(),false);}
});
test('actual fifth-tab dispatch renders the real Checklist controller region rather than History',()=>{
  const model=workspace.normaliseWorkspace({history:{rows:[{when:'HISTORY-MUST-NOT-RENDER'}]}});
  const html=workspace.renderWorkspace(model,'checklist',{checklist:{render:()=>'<div class="ws-scroll ws-checklist-scroll" data-ws-scroll>CHECKLIST-CONTROLLER</div>'}});
  assert.match(html,/data-ws-tab="checklist"/);assert.match(html,/CHECKLIST-CONTROLLER/);assert.doesNotMatch(html,/HISTORY-MUST-NOT-RENDER/);
  assert.equal(workspace.ENDPOINTS.checklist,'/api/weekly-source/v1/checklist');assert.equal(workspace.tabDescriptors(model).at(-1).label,'Checklist');
});
test('saved asset order and modal cleanup retain correction read and ordinary Source owners',()=>{
  const html=fs.readFileSync(require.resolve('../../index.html'),'utf8'),main=fs.readFileSync(require.resolve('../../js/main.js'),'utf8'),source=fs.readFileSync(require.resolve('../../js/weekly-source/import-workspace.js'),'utf8');
  assert.ok(html.indexOf('js/weekly-source/checklist.js?')<html.indexOf('js/weekly-source/import-workspace.js?'));
  assert.ok(html.indexOf('js/timesheet-correction-office-context.js?')<html.indexOf('js/main.js?'));
  assert.match(main,/closing\?\.kind === 'weekly-source-imports-v1'\) window\.CloudTMSWeeklySourceImportWorkspaceV1\?\.disposeChecklist\?\.\(\)/);
  assert.match(source,/onDismiss: \(\) => \{ session\.checklist\?\.dispose\(\)/);assert.match(source,/if \(tab === 'checklist'\) return loadChecklist\(append\)/);
});
