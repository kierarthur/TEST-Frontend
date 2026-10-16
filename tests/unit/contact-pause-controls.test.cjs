const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const id=n=>`f7160000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const off=()=>({paused:false,paused_until_utc:null,paused_until_local:null,reason:null});
const scope=()=>({scope_id:null,candidate_id:id(10),client_id:id(11),revision:'9007199254740993',
 next_pause_until_utc:'2026-10-18T23:00:00.000000Z',next_pause_until_local:'2026-10-19 00:00 Europe/London',
 worker:off(),manager:off(),can_pause:true,can_resume:true,in_flight:[]});
function fixture({operation='PAUSE',send}={}){
 const calls=[];let current=true;let next=100;
 const sandbox={module:{exports:{}},console,Intl,Date,crypto:{randomUUID:()=>id(next++)}};
 for(const file of ['contact-pause-contract.js','contact-pause-controls.js'])vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../js/weekly-source',file),'utf8'),sandbox);
 const command=async(action,payload)=>{
  calls.push({action,payload:JSON.parse(JSON.stringify(payload))});
  if(send)return send(action,payload,calls);
  if(action==='CONTACT_PAUSE_GET')return{ok:true,version:'CONTACT_PAUSE_STATE_V1',scope:scope()};
  return{ok:true,version:'CONTACT_PAUSE_RECEIPT_V1',request_id:payload.request_id,operation:action==='CONTACT_PAUSE'?'PAUSE':'RESUME',
   audience:payload.audience,changed:true,recheck_task_id:id(50),automatic_send:false,scope:{...scope(),scope_id:id(20)}};
 };
 const controls=sandbox.module.exports.create({candidateId:id(10),clientId:id(11),candidate:'Taylor',client:'Northbridge Trust',operation,command,isCurrent:()=>current});
 return{controls,calls,sandbox,setCurrent:value=>current=value};
}
test('actual generated contract and controls load exact server expiry and scoped big revision',async()=>{
 const f=fixture();await f.controls.load();
 const state=f.controls.snapshot();assert.equal(state.scope.revision,'9007199254740993');
 assert.deepEqual(f.calls,[{action:'CONTACT_PAUSE_GET',payload:{candidate_id:id(10),client_id:id(11)}}]);
 const html=f.controls.html();assert.match(html,/Monday 19\/10\/2026 at 00:00 \(UK\)/);assert.match(html,/Taylor can still open MyTMS and reply/);
});
test('pause saves only bounded intent; actor, deployment, expiry and recipient never come from browser',async()=>{
 const f=fixture();await f.controls.load();f.controls.edit({audience:'WORKER',note:'Owner checked'});await f.controls.save();
 const p=f.calls[1].payload;assert.deepEqual(Object.keys(p).sort(),['candidate_id','client_id','request_id','expected_revision','audience','note'].sort());
 assert.equal(p.expected_revision,'9007199254740993');assert.equal(p.audience,'WORKER');assert.equal(p.note,'Owner checked');
 assert.equal(f.controls.snapshot().pending,null);assert.equal(f.controls.snapshot().stale,true);
 assert.match(f.controls.html(),/Saved acknowledgement/);
});
test('lost save retains exactly the original UUID/CAS/body and blocks edit or fresh read until retry',async()=>{
 let failed=false;
 const f=fixture({send:(action,payload)=>{
  if(action==='CONTACT_PAUSE_GET')return{ok:true,version:'CONTACT_PAUSE_STATE_V1',scope:scope()};
  if(!failed){failed=true;throw new Error('Response lost');}
  return{ok:true,version:'CONTACT_PAUSE_RECEIPT_V1',request_id:payload.request_id,operation:'PAUSE',audience:payload.audience,
   changed:true,recheck_task_id:id(50),automatic_send:false,scope:{...scope(),scope_id:id(20)}};
 }});
 await f.controls.load();await assert.rejects(f.controls.save());const original=f.controls.snapshot().pending;
 assert.throws(()=>f.controls.edit({audience:'MANAGER'}),/original save/);await assert.rejects(f.controls.load(),/original save/);
 await f.controls.retry();assert.deepEqual(f.calls[1],f.calls[2]);assert.equal(original.payload.request_id,f.calls[2].payload.request_id);
});
test('an inactive original context cannot read, save or retry another worker/client',async()=>{
 const f=fixture();await f.controls.load();f.setCurrent(false);await assert.rejects(f.controls.save(),/original worker and client/);
 await assert.rejects(f.controls.load(),/original worker and client/);assert.equal(f.calls.length,1);
});
test('unknown or corrupt acknowledgement retains original request and never displays a successful pause',async()=>{
 const f=fixture({send:(action)=>action==='CONTACT_PAUSE_GET'?{ok:true,version:'CONTACT_PAUSE_STATE_V1',scope:scope()}:{ok:true}});
 await f.controls.load();await assert.rejects(f.controls.save());assert.ok(f.controls.snapshot().pending);
 assert.equal(f.controls.snapshot().acknowledgement,null);assert.match(f.controls.html(),/Retry original save/);
});
test('a proved stale refusal clears that failed intent and requires a new read',async()=>{
 const error=Object.assign(new Error('stale'),{status:409,code:'CONTACT_REVISION_CONFLICT'});
 const f=fixture({send:(action)=>{if(action==='CONTACT_PAUSE_GET')return{ok:true,version:'CONTACT_PAUSE_STATE_V1',scope:scope()};throw error;}});
 await f.controls.load();await assert.rejects(f.controls.save());assert.equal(f.controls.snapshot().pending,null);
 assert.equal(f.controls.snapshot().stale,true);await assert.rejects(f.controls.save(),/Refresh contact settings/);
});
test('concurrent click cannot allocate another request or submit twice',async()=>{
 let release;
 const f=fixture({send:(action)=>action==='CONTACT_PAUSE_GET'?{ok:true,version:'CONTACT_PAUSE_STATE_V1',scope:scope()}:new Promise(resolve=>{release=resolve;})});
 await f.controls.load();const first=f.controls.save();await assert.rejects(f.controls.save(),/still being checked/);
 const p=f.controls.snapshot().pending.payload;
 release({ok:true,version:'CONTACT_PAUSE_RECEIPT_V1',request_id:p.request_id,operation:'PAUSE',audience:p.audience,changed:true,
  recheck_task_id:id(50),automatic_send:false,scope:{...scope(),scope_id:id(20)}});await first;
 assert.equal(f.calls.length,2);
});
test('resume is a recheck receipt and cannot imply a send or claim no message is needed',async()=>{
 const f=fixture({operation:'RESUME'});await f.controls.load();await f.controls.save();
 assert.equal(f.calls[1].action,'CONTACT_RESUME');assert.match(f.controls.html(),/Old reminders will not all be sent at once/);
 assert.match(f.controls.html(),/We will check which messages are still needed/);assert.doesNotMatch(f.controls.html(),/No message is needed now/);
});
test('note uses codepoints and content is escaped without changing native form identities',async()=>{
 const f=fixture();await f.controls.load();f.controls.edit({note:'🙂'.repeat(500)});
 assert.throws(()=>f.controls.edit({note:'🙂'.repeat(501)}));
 f.controls.edit({note:'<script>no</script>'});assert.match(f.controls.html(),/&lt;script&gt;no&lt;\/script&gt;/);
});

test('legacy original claim is rendered separately without a fabricated provider start or timestamp',async()=>{
 const claim={kind:'LEGACY_QUERY_CLAIM',mail_outbox_id:id(30),query_delivery_id:id(31),claim_identity_sha256:'a'.repeat(64),claimed_at_utc:null,lease_expires_at_utc:null,status:'CHECKING_ORIGINAL_LEGACY_CLAIM',provider_submission_established:false,can_auto_resend:false};
 const f=fixture({send:()=>({ok:true,version:'CONTACT_PAUSE_STATE_V1',scope:{...scope(),in_flight:[claim]}})});await f.controls.load();
 assert.match(f.controls.html(),/Earlier query claimed/);assert.match(f.controls.html(),/will not be sent again automatically/);assert.doesNotMatch(f.controls.html(),/Invalid Date|already started|Worker push/);
});
