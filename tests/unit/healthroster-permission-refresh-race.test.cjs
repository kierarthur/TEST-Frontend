// Controlled responses exercise the actual saved module; no HTTP or database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname,'../../js/weekly-source/import-workspace.js'),'utf8');
const response = (body,ok=true,status=200) => ({ok,status,json:async()=>body});

function harness() {
  let calls=0,resolveDiscovery,rejectDiscovery;
  const discovery=new Promise((resolve,reject)=>{resolveDiscovery=resolve;rejectDiscovery=reject;});
  const frame={kind:'weekly-source-imports-v1',setTab:async()=>{}};
  const root={module:{exports:{}},URLSearchParams,__modalStack:[frame],document:{querySelectorAll:()=>[]},
    setTimeout:()=>{},addEventListener:()=>{},authFetch:async()=>{
      calls++;
      if(calls===1)return response({error_code:'WEEKLY_SOURCE_OFFICE_ADMIN_REQUIRED'},false,403);
      if(calls===2)return discovery;
      if(calls===3)return response({context:{subtitle:'NEWER_CURRENT_RESPONSE'}});
      throw Error('UNEXPECTED_CONTROLLED_REQUEST');
    }};
  vm.runInNewContext(source,root);
  const workspace=root.module.exports;
  workspace._session.workspace=workspace.normaliseWorkspace({context:{subtitle:'INITIAL'}});
  return {workspace,resolveDiscovery,rejectDiscovery,waitForDiscovery:async()=>{
    for(let i=0;i<30&&calls<2;i++)await Promise.resolve();
    assert.equal(calls,2);
  }};
}

for(const outcome of ['success','failure'])test(`older permission discovery ${outcome} cannot replace a newer accepted refresh`,async()=>{
  const h=harness(),first=h.workspace.refresh('imports');
  await h.waitForDiscovery();
  await h.workspace.refresh('imports');
  if(outcome==='success')h.resolveDiscovery(response({context:{subtitle:'OLDER_PERMISSION_DISCOVERY'}}));
  else h.rejectDiscovery(Error('OLDER_PERMISSION_DISCOVERY_FAILED'));
  await first;
  assert.equal(h.workspace._session.workspace.context.subtitle,'NEWER_CURRENT_RESPONSE');
  assert.equal(h.workspace._session.error,'');
  assert.equal(h.workspace._session.loading,false);
});

test('permission discovery cannot adopt after its open actor changes',async()=>{
  const h=harness();let actor='original';
  h.workspace._session.openCurrent=()=>actor==='original';
  const first=h.workspace.refresh('imports');await h.waitForDiscovery();
  actor='replacement';h.resolveDiscovery(response({context:{subtitle:'OLD_ACTOR_DISCOVERY'}}));await first;
  assert.equal(h.workspace._session.workspace.context.subtitle,'INITIAL');
  assert.equal(h.workspace._session.error,'');
});
