// Actual saved Office transport/controller + actual saved frozen handler.
// Controlled RAW rows prove presentation/caller contracts, not native money.
const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs');
const {createTransport,createController,Failure}=require('../../js/bpay-next-office.js');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const backend=path.resolve(__dirname,'../../../bpay-next-build-backend-20261009/broker/src/bpay-next-frozen-read.js');
const handler=import(pathToFileURL(backend).href);
const shift=()=>({shift_detail_id:id(9),detail_no:1,work_date:'2026-09-13',shift_start_at:'2026-09-13T08:00:00Z',shift_end_at:'2026-09-13T17:00:00Z',shift_start_local:'09:00',shift_end_local:'18:00',shift_overnight:false,submitted_minutes:540,approved_minutes:540,approved_hours:'9.000000',detail_label:'Frozen nine-hour entitlement',segment_pay_ex_vat:'180.00',pay_excluded:false,hours_day:'9.000000',hours_night:'0.000000',hours_sat:'0.000000',hours_sun:'0.000000',hours_bh:'0.000000'});
const rows={SHIFTS:()=>[shift()],BREAKS:()=>[{break_detail_id:id(10),break_no:1,break_start_at:null,break_end_at:null,break_start_local:null,break_end_local:null,break_minutes:30}],RATE_DETAILS:()=>[{rate_detail_id:id(11),bucket:'DAY',approved_hours:'9.000000',source_pay_rate:'20.000000'}],RATE_SCHEDULE:()=>[{rate_schedule_id:id(12),rate_family:'STANDARD',rate_code:'DAY',unit_label:null,paye_rate:'20.000000',umbrella_rate:null,charge_rate:'25.000000'}]};
const args={SHIFTS:{run_line_id:id(8),after_detail_no:null,limit:1},BREAKS:{run_line_id:id(8),shift_detail_id:id(9),after_break_no:null,limit:1},RATE_DETAILS:{run_line_id:id(8),after_bucket:null,limit:1},RATE_SCHEDULE:{run_work_id:id(13),after_rate_family:null,after_rate_code:null,limit:1}};
const cursor={SHIFTS:{after_detail_no:1},BREAKS:{after_break_no:1},RATE_DETAILS:{after_bucket:'DAY'},RATE_SCHEDULE:{after_rate_family:'STANDARD',after_rate_code:'DAY'}};
const transport=authFetch=>createTransport({actorId:id(1),currentActorId:()=>id(1),api:p=>'https://local.invalid'+p,authFetch});
const store=()=>{const saved=new Map();return{saved,getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};};
const controller=(rpc,storage=store())=>createController({actorId:id(1),uuid:()=>id(90),storage,transport:rpc});

test('all four Office frozen pages reach the actual handler with exact captured scope and decimal TEXT',async()=>{
  const {handleBpayNextFrozenRead}=await handler,seen=[];
  for(const kind of Object.keys(rows)){
    const actual=transport(async(url,init)=>{
      assert.equal(new URL(url).pathname,'/api/banking/pay/next/frozen-detail');assert.equal(init.method,'POST');assert.equal(init.auth401Mode,'return');assert.equal(init.redirect,'error');
      return handleBpayNextFrozenRead(new Request(url,init),{requireOfficeUser:async()=>({id:id(1),role:'admin'}),frozenPageRpc:async(k,a,o)=>{seen.push({kind:k,args:a,actor:o.actorUserId});return Response.json({rows:rows[k](),complete:false});}});
    });
    const page=await actual.frozenPage(kind,args[kind]);assert.deepEqual(page.rows,rows[kind]());assert.equal(page.complete,false);assert.deepEqual(page.next_cursor,cursor[kind]);assert.equal(seen.at(-1).actor,id(1));
    assert.equal(seen.at(-1).args.p_limit,1);assert.equal(seen.at(-1).args[kind==='RATE_SCHEDULE'?'p_run_work_id':'p_run_line_id'],kind==='RATE_SCHEDULE'?id(13):id(8));
    if(kind==='BREAKS')assert.equal(seen.at(-1).args.p_shift_detail_id,id(9));
  }
});

test('frozen full page follows exact cursor then accepts empty terminal; invalid or regressing cursors refuse',async()=>{
  for(const kind of Object.keys(rows)){
    let calls=0;const seen=[];
    const t=transport(async(url,init)=>{seen.push(JSON.parse(init.body));calls++;return Response.json({ok:true,kind,rows:calls===1?rows[kind]():[],complete:calls!==1,next_cursor:calls===1?cursor[kind]:null});});
    const first=await t.frozenPage(kind,args[kind]);const next=await t.frozenPage(kind,{...args[kind],...first.next_cursor});assert.equal(next.complete,true);assert.deepEqual(next.rows,[]);assert.deepEqual(seen[1],{kind,...args[kind],...cursor[kind]});
    const bad=transport(async()=>Response.json({ok:true,kind,rows:rows[kind](),complete:false,next_cursor:null}));await assert.rejects(bad.frozenPage(kind,args[kind]));
  }
  await assert.rejects(transport(async()=>Response.json({ok:true,kind:'SHIFTS',rows:[shift()],complete:true,next_cursor:null})).frozenPage('SHIFTS',{...args.SHIFTS,after_detail_no:1}));
});

test('Office frozen request refuses actor/current finance/foreign fields and unpaired rate cursor before transport',async()=>{
  let called=0;const t=transport(async()=>{called++;throw Error('not called');});
  for(const a of [{...args.SHIFTS,actor_id:id(1)},{...args.SHIFTS,candidate_id:id(3)},{...args.SHIFTS,current_revision_id:id(7)},{...args.SHIFTS,after_detail_no:'1'},{...args.SHIFTS,limit:101}])await assert.rejects(t.frozenPage('SHIFTS',a),e=>e.code==='REQUEST_INVALID');
  await assert.rejects(t.frozenPage('RATE_SCHEDULE',{...args.RATE_SCHEDULE,after_rate_family:'STANDARD'}),e=>e.code==='REQUEST_INVALID');assert.equal(called,0);
});

test('exact nullable/excluded facts and duration-only breaks stay truthful; malformed detail refuses',async()=>{
  const result=r=>({ok:true,kind:'SHIFTS',rows:[r],complete:true,next_cursor:null});
  const valid={...shift(),segment_pay_ex_vat:'0.00',pay_excluded:true,hours_day:'0.000000',source_pay_rate:undefined};delete valid.source_pay_rate;
  assert.deepEqual((await transport(async()=>Response.json(result(valid))).frozenPage('SHIFTS',args.SHIFTS)).rows,[valid]);
  for(const r of [{...shift(),approved_hours:9},{...shift(),pay_excluded:true},{...shift(),hours_night:null},{...shift(),shift_start_local:null},{...shift(),hours_day:'-1.000000'},{...shift(),work_date:'2026-02-31'},{...shift(),live_rate:'99.00'}])await assert.rejects(transport(async()=>Response.json(result(r))).frozenPage('SHIFTS',args.SHIFTS));
  const unavailable=transport(async()=>Response.json({ok:false,error_code:'BPAY_NEXT_FROZEN_DETAIL_NOT_AVAILABLE',retryable:false},{status:409}));await assert.rejects(unavailable.frozenPage('SHIFTS',args.SHIFTS),e=>e.code==='SERVER_REFUSED'&&e.unknown===false);
});

test('Candidate switch preserves accepted global Work manifest but clears only old page intent; unknown refuses',async()=>{
  const saved=store(),seen=[];const c=controller({mutation:async(a,bytes)=>{seen.push(bytes);return {run_id:id(2),page_no:'1',item_count:'1',selection_count:'1',selected_candidate_count:'1',replay:false};}},saved);
  c.bind({run_id:id(2),candidate_id:id(3)});await c.mutate('WORK_PAGE',{run_id:id(2),page_no:'1',choices:[{work_id:id(5),expected_revision_id:id(6),mode:'ALL'}]});c.setCurrentCursor({after_week:'2026-10-04',after_work_id:id(5)});c.bind({candidate_id:id(33)});
  const state=controller({},saved).snapshot();assert.equal(state.run_id,id(2));assert.equal(state.selection_pages,'1');assert.equal(state.selection_count,'1');assert.equal(state.candidate_id,id(33));assert.equal(state.current_cursor,null);assert.deepEqual(state.accepted_page_work_ids,[]);assert.equal(seen.length,1);
  const unknown=controller({mutation:async()=>{throw new Failure('TIMEOUT');}},saved);await assert.rejects(unknown.mutate('WORK_PAGE',{run_id:id(2),page_no:'2',choices:[{work_id:id(55),expected_revision_id:id(66),mode:'ALL'}]}));const before=unknown.snapshot().pending.bytes;assert.throws(()=>unknown.bind({candidate_id:id(333)}));assert.equal(unknown.snapshot().pending.bytes,before);
});

test('Candidate Case pages require accepted seal before switch, then next Candidate begins independent revision1/page1',async()=>{
  const saved=store(),seen=[];const rpc={mutation:async(a,bytes)=>{const b=JSON.parse(bytes);seen.push(b);return a==='CASE_PAGE'?{run_id:id(2),candidate_id:b.candidate_id,selection_revision:'1',page_no:b.page_no,item_count:'1',replay:false}:{run_id:id(2),candidate_id:b.candidate_id,selection_revision:'1',sealed:true,selected_count:'1',excluded_count:'0',replay:false};}};const c=controller(rpc,saved);
  c.bind({run_id:id(2),candidate_id:id(3)});c.setComponentScope(id(30),null);await c.mutate('CASE_PAGE',{run_id:id(2),candidate_id:id(3),selection_revision:'1',page_no:'1',request_id:id(31),component_ids:[id(30)],selected:[true]});
  assert.throws(()=>c.bind({candidate_id:id(33)}));assert.equal(c.snapshot().candidate_id,id(3));
  await c.mutate('CASE_SEAL',{run_id:id(2),candidate_id:id(3),selection_revision:'1',expected_pages:'1',expected_items:'1'});c.bind({candidate_id:id(33)});const next=controller(rpc,saved);assert.equal(next.snapshot().case_pages,'0');assert.equal(next.snapshot().case_id,null);assert.equal(next.snapshot().case_sealed,false);assert.equal(next.snapshot().run_id,id(2));assert.equal(next.snapshot().prior_case_selected_count,'1');
  next.setComponentScope(id(330),null);await assert.rejects(next.mutate('CASE_PAGE',{run_id:id(2),candidate_id:id(3),selection_revision:'1',page_no:'1',request_id:id(331),component_ids:[id(330)],selected:[true]}));assert.equal(seen.length,2);
  await next.mutate('CASE_PAGE',{run_id:id(2),candidate_id:id(33),selection_revision:'1',page_no:'1',request_id:id(331),component_ids:[id(330)],selected:[true]});assert.equal(next.snapshot().case_selected_count,'1');assert.equal(next.snapshot().prior_case_selected_count,'1');assert.equal(seen[2].candidate_id,id(33));assert.equal(seen[2].page_no,'1');
});

test('complete old case-only journal retains current counts; new journal missing prior scalar fails rather than fabricating zero',async()=>{
  const saved=store(),rpc={mutation:async(a,bytes)=>{const b=JSON.parse(bytes);return a==='CASE_PAGE'?{run_id:id(2),candidate_id:id(3),selection_revision:'1',page_no:'1',item_count:'1',replay:false}:{run_id:id(2),candidate_id:id(3),selection_revision:'1',sealed:true,selected_count:'1',excluded_count:'0',replay:false};}},c=controller(rpc,saved);
  c.bind({run_id:id(2),candidate_id:id(3)});c.setComponentScope(id(30),null);await c.mutate('CASE_PAGE',{run_id:id(2),candidate_id:id(3),selection_revision:'1',page_no:'1',request_id:id(31),component_ids:[id(30)],selected:[true]});await c.mutate('CASE_SEAL',{run_id:id(2),candidate_id:id(3),selection_revision:'1',expected_pages:'1',expected_items:'1'});
  const key=[...saved.saved.keys()][0],old=JSON.parse(saved.getItem(key));old.version=1;delete old.prior_case_selected_count;delete old.drafts;delete old.pay_channel;delete old.accepted_prepare;saved.setItem(key,JSON.stringify(old));
  const adopted=controller({},saved);assert.equal(adopted.snapshot().version,4);assert.deepEqual(adopted.snapshot().drafts,[]);assert.equal(adopted.snapshot().pay_channel,null);assert.equal(adopted.snapshot().accepted_prepare,null);assert.equal(adopted.snapshot().selection_count,'0');assert.equal(adopted.snapshot().case_selected_count,'1');assert.equal(adopted.snapshot().case_sealed,true);assert.equal(adopted.snapshot().prior_case_selected_count,'0');
  adopted.bind({candidate_id:id(33)});assert.equal(controller({},saved).snapshot().prior_case_selected_count,'1');assert.throws(()=>adopted.bind({run_id:id(22)}),e=>e.code==='REQUEST_INVALID');assert.equal(adopted.snapshot().run_id,id(2));const damaged=JSON.parse(saved.getItem(key));delete damaged.prior_case_selected_count;saved.setItem(key,JSON.stringify(damaged));assert.throws(()=>controller({},saved),e=>e.code==='JOURNAL_INVALID');
  saved.setItem(key,JSON.stringify({...damaged,prior_case_selected_count:0}));assert.throws(()=>controller({},saved),e=>e.code==='JOURNAL_INVALID');
});

test('old case-only uncertain seal/enqueue keeps original UUID/body and cannot switch until exact receipt',async()=>{
  const saved=store(),c=controller({mutation:async()=>{throw new Failure('TIMEOUT');}},saved);c.bind({run_id:id(2),candidate_id:id(3)});
  const key=[...saved.saved.keys()][0],known=JSON.parse(saved.getItem(key));Object.assign(known,{case_pages:'1',case_items:'1',case_selected_count:'1',case_excluded_count:'0',case_sealed:true,case_id:id(30)});saved.setItem(key,JSON.stringify(known));
  const pending=controller({mutation:async()=>{throw new Failure('TIMEOUT');}},saved);await assert.rejects(pending.mutate('SEAL_ENQUEUE',{run_id:id(2),command_id:id(90),expected_pages:'0',expected_count:'0'}));const bytes=pending.snapshot().pending.bytes;
  const old=JSON.parse(saved.getItem(key));old.version=1;delete old.prior_case_selected_count;delete old.drafts;delete old.pay_channel;delete old.accepted_prepare;saved.setItem(key,JSON.stringify(old));const calls=[];
  const resumed=controller({mutation:async(a,b)=>{calls.push(b);return{run_id:id(2),command_id:id(90),agency_sequence:'1',replay:true};}},saved);assert.equal(resumed.snapshot().pending.bytes,bytes);assert.equal(resumed.snapshot().case_selected_count,'1');assert.throws(()=>resumed.bind({candidate_id:id(33)}));await resumed.retry();assert.deepEqual(calls,[bytes]);assert.equal(resumed.snapshot().selection_sealed,true);assert.equal(resumed.snapshot().case_selected_count,'1');
});

test('actor changes refuse frozen reads both before dispatch and after the awaited reply',async()=>{
  let actor=id(2),called=0;const options={actorId:id(1),currentActorId:()=>actor,api:p=>'https://local.invalid'+p,authFetch:async()=>{called++;actor=id(2);return Response.json({ok:true,kind:'SHIFTS',rows:[shift()],complete:true,next_cursor:null});}};
  await assert.rejects(createTransport(options).frozenPage('SHIFTS',args.SHIFTS),e=>e.code==='ACTOR_CHANGED');assert.equal(called,0);actor=id(1);await assert.rejects(createTransport(options).frozenPage('SHIFTS',args.SHIFTS),e=>e.code==='ACTOR_CHANGED');assert.equal(called,1);
});

test('two Candidate case-only manifests use actual Office transport and saved preparation handler before one real enqueue contract',async()=>{
  const {handleBpayNextPreparationCommand}=await import(pathToFileURL(path.resolve(path.dirname(backend),'bpay-next-preparation.js')).href),calls=[],headers=[];
  const t=transport(async(url,init)=>{
    assert.equal(new URL(url).pathname,'/api/banking/pay/next/preparation');
    const response=await handleBpayNextPreparationCommand(new Request(url,init),{requireOfficeUser:async(req,roles)=>{assert.deepEqual(roles,['admin']);return{id:id(1),role:'admin'};},preparationRpc:async(action,a,o)=>{
      calls.push({action,args:a,actor:o.actorUserId});
      if(action==='CASE_PAGE')return Response.json({run_id:id(2),candidate_id:a.candidate_id,selection_revision:'1',page_no:'1',item_count:'1',replay:false});
      if(action==='CASE_SEAL')return Response.json({run_id:id(2),candidate_id:a.candidate_id,selection_revision:'1',sealed:true,selected_count:'1',excluded_count:'0',replay:false});
      assert.equal(action,'SEAL_ENQUEUE');return Response.json({run_id:id(2),command_id:a.command_id,agency_sequence:'1',replay:false});
    }});headers.push(response.headers.get('x-bpay-next-preparation-wake'));return response;
  });
  const c=controller(t);c.bind({run_id:id(2),candidate_id:id(3)});
  for(const [candidate,component] of [[3,30],[33,330]]){
    c.bind({candidate_id:id(candidate)});c.setComponentScope(id(component),null);await c.mutate('CASE_PAGE',{run_id:id(2),candidate_id:id(candidate),selection_revision:'1',page_no:'1',request_id:id(component+1),component_ids:[id(component)],selected:[true]});await c.mutate('CASE_SEAL',{run_id:id(2),candidate_id:id(candidate),selection_revision:'1',expected_pages:'1',expected_items:'1'});
  }
  await c.mutate('SEAL_ENQUEUE',{run_id:id(2),command_id:id(90),expected_pages:'0',expected_count:'0'});assert.equal(c.snapshot().selection_sealed,true);assert.equal(c.snapshot().selection_count,'0');assert.equal(c.snapshot().prior_case_selected_count,'1');assert.equal(c.snapshot().case_selected_count,'1');assert.deepEqual(headers,[null,null,null,null,'ENROLL']);assert.ok(calls.every(x=>x.actor===id(1)));assert.deepEqual(calls.filter(x=>x.action==='CASE_PAGE').map(x=>[x.args.candidate_id,x.args.selection_revision,x.args.page_no]),[[id(3),'1','1'],[id(33),'1','1']]);
});

test('actual public owner retains per-Candidate initial admission, exact replay and sealed refusal; caller never guesses a new revision',()=>{
  const sql=fs.readFileSync(path.resolve(path.dirname(backend),'../../supabase/repeatable/04102026_0330_banking_pay_next_case_creation_selection_v1.sql'),'utf8');
  const append=sql.match(/create or replace function private\.bpay_next_append_case_selection_page_v1\([\s\S]*?\$function\$;/)[0];
  assert.match(append,/p\.run_id=p_run_id and p\.candidate_id=p_candidate_id and p\.selection_revision=p_selection_revision and p\.page_no=p_page_no/);
  assert.match(append,/v_page\.request_id<>p_request_id/);assert.match(append,/BPAY_NEXT_CASE_SELECTION_REPLAY_CONFLICT/);
  assert.match(append,/p_page_no<>1 or exists\(select 1 from private\.bpay_next_case_selection h where h\.run_id=p_run_id and h\.candidate_id=p_candidate_id\)/);
  assert.match(append,/v_header\.status<>'OPEN' or p_page_no<>v_header\.page_count\+1/);
  const publicSql=fs.readFileSync(path.resolve(path.dirname(backend),'../../supabase/repeatable/04102026_0575_banking_pay_next_preparation_service_v1.sql'),'utf8');assert.match(publicSql,/when 'CASE_PAGE' then\s+v_result:=private\.bpay_next_append_case_selection_page_v1/);assert.match(publicSql,/when 'CASE_SEAL' then\s+v_result:=private\.bpay_next_seal_case_selection_v1/);
});
