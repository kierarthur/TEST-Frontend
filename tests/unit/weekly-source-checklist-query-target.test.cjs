const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const targetKey=`qg_${'7'.repeat(64)}`;
const scope={source_group_id:'11111111-1111-4111-8111-111111111111',source_cycle_id:'22222222-2222-4222-8222-222222222222',client_id:'33333333-3333-4333-8333-333333333333',week_ending:'2026-10-04'};
function harness(){
  const source=fs.readFileSync(require.resolve('../../js/weekly-source/import-workspace.js'),'utf8');
  const seam='friendlyWorkspaceError, cycleForClientChange, queryFor })';
  assert.equal(source.split(seam).length,2);
  const requests=[],scrolls=[];let response={selected:scope,queries:{rows:[{group_key:targetKey}],total_count:1,has_more:false}};
  const target={dataset:{wsGroupKey:targetKey},scrollIntoView:options=>scrolls.push(options)};
  const host={dataset:{},querySelector:()=>null,querySelectorAll:selector=>selector==='[data-ws-group-key]'?[target]:[],prepend:()=>{}};
  const root={module:{exports:{}},URLSearchParams,console,setTimeout:()=>{},CSS:{escape:x=>x},
    document:{querySelector:()=>host,querySelectorAll:()=>[],createElement:()=>({addEventListener:()=>{}})},
    __modalStack:[{kind:'weekly-source-imports-v1',setTab:async()=>{}}],
    authFetch:async(url)=>{requests.push(new URL(url,'https://test.invalid'));return{ok:true,json:async()=>response};}};
  vm.runInNewContext(source.replace(seam,'friendlyWorkspaceError, cycleForClientChange, queryFor, openChecklistAction, loadWorkspace, wire, returnToChecklist })'),root);
  const api=root.module.exports,s=api._session;
  s.workspace=api.normaliseWorkspace({selected:{...scope,report_scope_id:'OLD-REPORT',projection_publication_id:'OLD-PUBLICATION'},combined_source_workspace:true});
  s.openCurrent=()=>true;s.openGeneration=1;s.checklist={capture:()=>{},suspend:()=>{},refresh:async()=>{}};s.activeTab='checklist';
  return{api,s,host,root,requests,scrolls,respond:value=>response=value,
    open:()=>api._test.openChecklistAction({kind:'QUERIES',native_allowed:true,target:{row_key:targetKey}},{scope})};
}
test('whole Checklist action clears an inherited report and requests the exact native Queries group',async()=>{
  const h=harness();await h.open();await h.api._test.loadWorkspace('queries');
  assert.equal(h.requests.length,1);const p=h.requests[0].searchParams;
  assert.equal(p.get('row_key'),targetKey);for(const key of ['source_group_id','source_cycle_id','client_id'])assert.equal(p.get(key),scope[key]);
  assert.equal(p.has('report_scope_id'),false);assert.equal(h.s.workspace.selected.projection_publication_id,'');
  assert.equal(h.s.workspace.queries.rows[0].expanded,true);
});
test('scrolling the actual group retains exact targeting for a later refresh',async()=>{
  const h=harness();await h.open();await h.api._test.loadWorkspace('queries');h.api._test.wire('queries');
  assert.equal(h.scrolls.length,1);assert.equal(h.scrolls[0].block,'nearest');assert.equal(h.s.checklistQueryTarget,targetKey);
  await h.api._test.loadWorkspace('queries');assert.equal(h.requests[1].searchParams.get('row_key'),targetKey);
});
test('missing, wrong or ambiguous native target never expands a first-page substitute',async()=>{
  for(const rows of [[],[{group_key:'other'}],[{group_key:targetKey},{group_key:'other'}]]){
    const h=harness();await h.open();h.respond({selected:scope,queries:{rows,total_count:rows.length}});await h.api._test.loadWorkspace('queries');
    assert.match(h.s.error,/Return to Checklist and recheck/);assert.equal(h.s.workspace.queries.rows.length,0);
  }
});
test('a superseded whole caller response cannot install or expand a stale target',async()=>{
  const h=harness();await h.open();let resolve,entered;
  const waiting=new Promise(r=>entered=r);
  h.root.authFetch=async()=>({ok:true,json:()=>new Promise(r=>{resolve=r;entered();})});
  const pending=h.api._test.loadWorkspace('queries');await waiting;
  h.s.openGeneration++;resolve({selected:scope,queries:{rows:[{group_key:targetKey}],total_count:1}});await pending;
  assert.equal(h.s.workspace.queries.rows.length,0);assert.equal(h.scrolls.length,0);
});
test('returning to Checklist clears targeting before ordinary Queries requests',async()=>{
  const h=harness();await h.open();await h.api._test.returnToChecklist();
  assert.equal(h.api._test.queryFor('queries').row_key,undefined);assert.equal(h.s.reviewSingleScope,false);
  assert.equal(h.s.checklistQueryTarget,null);assert.equal(h.s.checklistQueryScrollPending,false);
});
test('ordinary Queries requests retain report scope and never reuse a stale Checklist target',()=>{
  const h=harness();h.s.checklistQueryTarget=targetKey;
  assert.equal(h.api._test.queryFor('queries').report_scope_id,'OLD-REPORT');assert.equal(h.api._test.queryFor('queries').row_key,undefined);
  h.s.checklistReturnLink=true;h.s.reviewSingleScope=false;assert.equal(h.api._test.queryFor('queries').row_key,undefined);
});
test('pay read-only admission cannot invoke the linked native action',async()=>{
  const h=harness();h.s.workspace.permissions={view:'PAY'};await h.open();
  assert.equal(h.s.checklistQueryTarget,undefined);assert.equal(h.requests.length,0);assert.equal(h.s.activeTab,'checklist');
});
