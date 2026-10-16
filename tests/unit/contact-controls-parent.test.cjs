const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const view=require('../../js/weekly-source/combined-review.js');
const id=n=>`f7160000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clone=x=>JSON.parse(JSON.stringify(x));
function row(){return{combined_key:'real-row',scope_key:'real-owner',candidate_id:id(10),client_id:id(11),candidate:'Taylor',client:'Northbridge Trust',
 contact_controls:{version:'CONTACT_CONTROLS_ROW_V1',candidate_id:id(10),client_id:id(11),scope_revision:'9007199254740993',
 worker:{paused:true,until_local:'19/10/2026 00:00 (UK)'},manager:{paused:false,until_local:null},
 actions:[{operation:'PAUSE',label:'Pause messages'},{operation:'RESUME',label:'Resume messages'}]}};}
test('server-qualified More controls retain exact pair and coexist with checks status and identifiers',()=>{
 const r=row(),model={contract:'WEEKLY_SOURCE_COMBINED_REVIEW_V1',tab:'queries',section:'checks',rows:[{...r,source_reference:'source-001',booking_reference:'booking-002',status:{text:'Needs action'},pay_blocking:true}],owners:[]};
 assert.deepEqual(view.contactControlAction(r,model,'RESUME'),{label:'Resume messages',payload:{candidate_id:id(10),client_id:id(11)},context:{candidate:'Taylor',client:'Northbridge Trust'}});
 const html=view.render(model,{});
 for(const text of ['More','Pause messages','Resume messages','Worker contact paused until 19/10/2026 00:00 (UK)','Source ref: source-001','Booking: booking-002','Needs action','ws-query-hold'])assert.ok(html.includes(text),text);
 assert.match(view.contactControlMenu(r,model,{busy:true}),/disabled/);
 assert.doesNotMatch(html,/Manager contact paused/);
});
test('contact controls fail closed for mismatched, malformed or payment-only projections',()=>{
 for(const mutate of [r=>r.contact_controls.candidate_id=id(99),r=>r.contact_controls.scope_revision=9007199254740993,
  r=>r.contact_controls.scope_revision='9223372036854775808',r=>r.contact_controls.worker.until_local='tomorrow',
  r=>r.contact_controls.actions.push({...r.contact_controls.actions[0]}),r=>r.contact_controls.actions[0].label='Send email',
  r=>r.contact_controls.extra=true,r=>r.contact_controls.manager.until_local='19/10/2026 00:00 (UK)']){
  const r=row();mutate(r);assert.equal(view.contactControlAction(r,{},'PAUSE'),null);
 }
 for(const permissions of [{contract:'WEEKLY_SOURCE_PAYMENT_VIEW_V1'},{view:'PAY'}])assert.equal(view.contactControlAction(row(),{permissions},'PAUSE'),null);
 assert.equal(view.contactControlAction(row(),{},'SEND'),null);
});
function parentFixture(){
 const calls=[],controllers=[],timers=[];let host,refreshes=0,lost=true;
 const parent={kind:'weekly-source-parent'};
 const off=()=>({paused:false,paused_until_utc:null,paused_until_local:null,reason:null});
 const scope=()=>({scope_id:null,candidate_id:id(10),client_id:id(11),revision:'9007199254740993',next_pause_until_utc:'2026-10-18T23:00:00.000000Z',next_pause_until_local:'2026-10-19 00:00 Europe/London',worker:off(),manager:off(),can_pause:true,can_resume:true,in_flight:[]});
 const root={module:{exports:{}},SESSION:{user:{id:id(1)}},Intl,Date,crypto:{randomUUID:()=>id(100)},__modalStack:[parent],setTimeout:fn=>timers.push(fn),
  document:{querySelector:()=>host,getElementById:()=>null},closeModal:()=>root.__modalStack.pop(),
  CloudTMSWeeklySourceImportWorkspaceV1:{refresh:()=>{refreshes++;},issueCommand:async(action,payload)=>{
   calls.push({action,payload:clone(payload)});
   if(action==='CONTACT_PAUSE_GET')return{ok:true,version:'CONTACT_PAUSE_STATE_V1',scope:scope()};
   if(lost){lost=false;throw Error('Receipt lost');}
   return{ok:true,version:'CONTACT_PAUSE_RECEIPT_V1',request_id:payload.request_id,operation:'PAUSE',audience:payload.audience,changed:true,recheck_task_id:id(50),automatic_send:false,scope:{...scope(),scope_id:id(20)}};
  }},showModal:(title,tabs,render,save,edit,wire,options)=>{
   const back={addEventListener:(event,fn)=>{back.click=fn;}};
   const inner={querySelector:()=>null,querySelectorAll:()=>[],innerHTML:''};
   host={dataset:{},querySelector:selector=>selector==='[data-contact-controls-host]'?inner:back};
   root.__modalStack.push({kind:options.kind});render();
  }};
 for(const file of ['contact-pause-contract.js','contact-pause-controls.js'])vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../js/weekly-source',file),'utf8'),root);
 const actual=root.CloudTMSContactPauseControlsV1;
 root.CloudTMSContactPauseControlsV1={create:options=>{const c=actual.create(options);controllers.push(c);return c;}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../js/weekly-source/workspace-actions.js'),'utf8'),root);
 const settle=async()=>{while(timers.length)timers.shift()();await new Promise(resolve=>setImmediate(resolve));};
 const open=async()=>{assert.equal(root.module.exports.handleAction(view.contactControlAction(row(),{},'PAUSE')),true);await settle();};
 return{root,parent,calls,controllers,open,settle,back:()=>host.querySelector('[data-wsa-contact-back]').click(),refreshes:()=>refreshes};
}
test('actual parent dispatcher retains the uncertain original controller on child return and reopens without a new GET',async()=>{
 const f=parentFixture();await f.open();assert.equal(f.controllers.length,1);const c=f.controllers[0];
 assert.equal(f.calls.length,1);c.edit({audience:'WORKER',note:'Office checked'});await assert.rejects(c.save());
 const original=clone(c.snapshot().pending);f.back();assert.equal(f.root.__modalStack.at(-1),f.parent);assert.equal(f.refreshes(),1);
 await assert.rejects(c.retry(),/original worker and client/);await f.open();assert.equal(f.controllers.length,1);assert.equal(f.calls.length,2);
 await c.retry();assert.deepEqual(f.calls[1],f.calls[2]);assert.deepEqual(original.payload,f.calls[2].payload);
 f.back();await f.open();assert.equal(f.calls.at(-1).action,'CONTACT_PAUSE_GET');assert.equal(c.snapshot().stale,false);
});
test('a changed actor, workspace, or parent cannot send through a retained child context',async()=>{
 for(const change of [f=>f.root.SESSION.user.id=id(2),f=>f.root.CloudTMSWeeklySourceImportWorkspaceV1={},f=>f.root.__modalStack[0]={kind:'different-parent'}]){
  const f=parentFixture();await f.open();change(f);await assert.rejects(f.controllers[0].save(),/original worker and client/);assert.equal(f.calls.length,1);
 }
});
