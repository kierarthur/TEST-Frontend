const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createTransport,createController,requestBody,printAdvice,openCandidateRecord,Failure,LIMITS}=require('../../js/bpay-next-office.js');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const storage=()=>{const rows=new Map();return{getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),rows};};
const json=(body,status=200)=>Response.json(body,{status});
const createReceipt=()=>({run_id:id(2),status:'PREPARING',selection_state:'OPEN',selection_count:'0',selected_candidate_count:'0'});
const request=()=>requestBody('CREATE',{run_id:id(2),pay_date:'2026-10-05'});
const command=(action,result)=>({ok:true,action,result});
const transport=fetch=>createTransport({api:p=>'https://local.invalid'+p,authFetch:fetch,timeoutMs:20});
const makeController=(rpc,store=storage(),actor=id(1))=>createController({actorId:actor,storage:store,uuid:()=>id(100),transport:rpc});
const row=n=>({work_id:id(n),candidate_id:id(3),original_timesheet_id:id(n+1000),work_kind:'ORDINARY',week_ending_date:'2026-10-04',approval_state:'APPROVED',current_revision_id:id(n+2000),applied_revision_id:id(n+2000),position_ready:true,source_pay_channel:'PAYE',timesheet_reference:`TS-${n}`,client_display_name:'<img src=x onerror=alert(1)>',approved_source_ex_vat:'100.40'});
const pageArgs={candidate_id:id(3),after_week:null,after_work_id:null,limit:100};
const header=()=>({run_id:id(2),run_status:'DRAFT',selection_state:'SEALED',review_revision:'1',run_worker_id:id(4),candidate_id:id(3),worker_status:'READY',target_pay_channel:'PAYE',umbrella_id:null,preparation_revision:'1',case_selection_revision:'0',net_request_revision:'1',net_projection_revision:'1',net_pending:false,review_issue_code:null,review_issue_work_id:null,frozen_gross_ex_vat:'100.00',frozen_gross_vat:'0.00',frozen_gross_inc_vat:'100.00',projection_id:id(5),projection_input_kind:'PAYE_MANUAL',entered_paye_net:'75.00',accepted_recoveries:'10.00',accepted_net_additions:'0.00',cash_amount:'65.00'});

test('bank-details navigation closes the sheet then delegates only the exact Candidate identity',()=>{
  const events=[],store=storage(),c=makeController({},store);c.bind({run_id:id(2),worker_id:id(4),candidate_id:id(3)});
  const before=[...store.rows.entries()];
  const result=openCandidateRecord({actorId:id(1),currentActorId:()=>id(1),openCandidateRecord:(...args)=>{events.push(args);return 'opened';}},id(3),()=>events.push('closed'));
  assert.equal(result,'opened');assert.deepEqual(events,['closed',[id(3)]]);assert.deepEqual([...store.rows.entries()],before);
  assert.equal(makeController({},store).snapshot().run_id,id(2));
});

test('bank-details navigation refuses changed actor, malformed identity or missing owner before closing',()=>{
  let closed=0,opened=0;const options={actorId:id(1),currentActorId:()=>id(1),openCandidateRecord:()=>opened++},close=()=>closed++;
  assert.throws(()=>openCandidateRecord({...options,currentActorId:()=>id(9)},id(3),close),e=>e.code==='ACTOR_CHANGED');
  assert.throws(()=>openCandidateRecord(options,'not-a-candidate',close));
  assert.throws(()=>openCandidateRecord({...options,openCandidateRecord:undefined},id(3),close));
  assert.throws(()=>openCandidateRecord(options,id(3),undefined));assert.equal(closed,0);assert.equal(opened,0);
});

const returnHeader=()=>({run_id:id(2),run_worker_id:id(4),candidate_id:id(3),financial_view_revision:'0'});
const returnRow=()=>({original_transfer_id:id(6),original_transfer_no:'2',original_transfer_status:'RETURNED',original_cash_amount:'65.00',beneficiary_kind:'CANDIDATE',beneficiary_id:id(3),return_command_id:id(60),return_posting_complete:true,return_cash_id:id(61),amount_owed:'65.00',amount_held:'0.00',amount_reissued_paid:'0.00',amount_available:'65.00',pending_reissue_command_id:null,action_state:'CASH_AVAILABLE'});
const returnArgs=()=>({run_id:id(2),run_worker_id:id(4),after_transfer_no:null,limit:100});
const returnPage=()=>({ok:true,kind:'RETURN_CASH',header:returnHeader(),rows:[returnRow()],complete:false,next_cursor:{after_transfer_no:'4'}});
test('changing the worker scope clears only prior scoped CSV/advice identities and refuses overlap with unknown intent',async()=>{
  const c=makeController({mutation:async()=>({instruction_id:id(70),transfer_id:id(6),file_name:'proof.csv',csv_sha256:'a'.repeat(64),csv_text:'a,b\r\n',phase:'ISSUED_CSV',payment_recorded:false,replay:false})});
  c.bind({run_id:id(2),worker_id:id(4),candidate_id:id(3)});await c.mutate('CSV_ISSUE',{instruction_id:id(70),transfer_id:id(6)});
  c.bind({worker_id:id(4),candidate_id:id(3)});assert.equal(c.snapshot().instruction_id,id(70));
  c.bind({worker_id:id(44),candidate_id:id(33)});assert.equal(c.snapshot().instruction_id,null);assert.equal(c.snapshot().transfer_id,null);assert.equal(c.snapshot().run_id,id(2));
  const pending=makeController({mutation:async()=>{throw new Failure('TIMEOUT');}});pending.bind({run_id:id(2),worker_id:id(4),candidate_id:id(3)});
  await assert.rejects(pending.mutate('CSV_ISSUE',{instruction_id:id(70),transfer_id:id(6)}));const before=pending.snapshot().pending.bytes;
  assert.throws(()=>pending.bind({worker_id:id(44),candidate_id:id(33)}));assert.equal(pending.snapshot().pending.bytes,before);
});
test('batch return reader keeps exact balances and accepts raw skipped-leg cursor, including empty nonterminal window',async()=>{
  const value=returnPage();assert.deepEqual(await transport(async()=>json(value)).page('RETURN_CASH',returnArgs()),value);
  const empty={...value,rows:[],next_cursor:{after_transfer_no:'6'}};
  assert.deepEqual(await transport(async()=>json(empty)).page('RETURN_CASH',{...returnArgs(),after_transfer_no:'4'}),empty);
  const final={...empty,complete:true,next_cursor:null};assert.deepEqual(await transport(async()=>json(final)).page('RETURN_CASH',{...returnArgs(),after_transfer_no:'6'}),final);
});
test('batch return reader refuses malformed balances, wrong scope, duplicate original and regressing raw cursor',async()=>{
  const value=returnPage();
  for(const bad of [
    {...value,header:{...returnHeader(),run_worker_id:id(90)}},
    {...value,header:{...returnHeader(),financial_view_revision:0}},
    {...value,rows:[{...returnRow(),amount_available:65}]},
    {...value,rows:[{...returnRow(),amount_available:'-1.00'}]},
    {...value,rows:[{...returnRow(),amount_available:'65'}]},
    {...value,rows:[returnRow(),{...returnRow(),original_transfer_id:id(7),original_transfer_no:'3'}]},
    {...value,rows:[{...returnRow(),original_transfer_status:'SETTLED'}]},
    {...value,rows:[returnRow(),{...returnRow(),original_transfer_no:'3'}]},
    {...value,next_cursor:{after_transfer_no:'1'}},
    {...value,rows:[],next_cursor:null},
    {...value,rows:[{...returnRow(),bank_verified:true}]},
    {...value,rows:[{...returnRow(),beneficiary_id:id(99)}]}
  ])await assert.rejects(transport(async()=>json(bad)).page('RETURN_CASH',returnArgs()));
  await assert.rejects(transport(async()=>json({...value,rows:[],next_cursor:{after_transfer_no:'4'}})).page('RETURN_CASH',{...returnArgs(),after_transfer_no:'4'}));
});
test('return posting pending preserves NULL balances and cannot claim spendable or verified cash',async()=>{
  const pending={...returnRow(),return_posting_complete:false,return_cash_id:null,amount_owed:null,amount_held:null,amount_reissued_paid:null,amount_available:null,action_state:'RETURN_POSTING_PENDING'};
  const value={...returnPage(),rows:[pending],complete:true,next_cursor:null};
  assert.deepEqual(await transport(async()=>json(value)).page('RETURN_CASH',returnArgs()),value);
  for(const extra of [{amount_available:'0.00'},{action_state:'CASH_AVAILABLE'},{pending_reissue_command_id:id(70)},{return_posting_complete:true}])await assert.rejects(transport(async()=>json({...value,rows:[{...pending,...extra}]})).page('RETURN_CASH',returnArgs()));
});

test('actual Draft action gate needs confirmed parent and prepared READY/DRAFT worker',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../../js/bpay-next-office.js'),'utf8');
  const helper=source.match(/function draftActionsAllowed\(h\) \{[^\n]+\}/)[0];
  const context={};vm.runInNewContext(`${helper};globalThis.allowed=draftActionsAllowed;`,context);
  for(const worker_status of ['READY','DRAFT'])assert.equal(context.allowed({run_status:'DRAFT',worker_status}),true);
  for(const run_status of ['PREPARING','REVIEW','CANCELLING','CANCELLED','EXECUTING','COMPLETE']){
    for(const worker_status of ['READY','DRAFT'])assert.equal(context.allowed({run_status,worker_status}),false);
  }
  for(const worker_status of ['PREPARING','REVIEW','CANCELLING','CANCELLED','ISSUED','COMPLETE'])assert.equal(context.allowed({run_status:'DRAFT',worker_status}),false);
  assert.match(source,/if\(draftActionsAllowed\(h\)&&h\.target_pay_channel==='PAYE'\)/);
  assert.match(source,/locked\|\|h\.net_pending\|\|h\.projection_id===null/);
});
const caseRow=()=>({case_id:id(30),candidate_id:id(3),case_kind:'MANUAL_DEBT',tax_treatment:'NON_TAXABLE',status:'OPEN',principal_approved:'10',principal_funded:'0',principal_recovered:'0',principal_written_off:'0',active_hold_amount:'0'});
const componentRow=()=>({case_component_id:id(30),case_id:id(30),candidate_id:id(3),component_ordinal:'10',component_revision:'1',case_kind:'MANUAL_DEBT',case_subtype:'MANUAL_DEBT',tax_treatment:'NON_TAXABLE',instruction_kind:'RECOVERY',direction:'DEDUCTION',payroll_stage:'NET_DEDUCT',source_pay_channel:'PAYE',resolution_state:'REVIEW',approved_source_ex_vat:'10',funded_source_ex_vat:'0',recovered_source_ex_vat:'0',written_off_source_ex_vat:'0',active_payout_source_ex_vat:'0',active_recovery_source_ex_vat:'0'});
const caseArgs=()=>({run_id:id(2),candidate_id:id(3),selection_revision:'1',page_no:'1',request_id:id(31),component_ids:[id(30)],selected:[true]});
test('closed Case selection accepts explicit booleans only and refuses actor/duplicate/oversize/misalignment',()=>{
  assert.equal(JSON.parse(requestBody('CASE_PAGE',caseArgs())).selected[0],true);
  for(const extra of [{actor_id:id(1)},{component_ids:[id(30),id(30)],selected:[true,false]},{component_ids:Array.from({length:101},(_,i)=>id(i+100)),selected:Array(101).fill(true)},{selected:[]},{selected:['true']}])assert.throws(()=>requestBody('CASE_PAGE',{...caseArgs(),...extra}));
});
test('current Case pages are scoped factual text, never allocation or closed history',async()=>{
  const args={candidate_id:id(3),after_case_id:null,limit:100},raw={ok:true,kind:'CURRENT_CASES',rows:[caseRow()],complete:true,next_cursor:null};
  assert.deepEqual(await transport(async()=>json(raw)).page('CURRENT_CASES',args),raw);
  for(const row of [{...caseRow(),candidate_id:id(99)},{...caseRow(),status:'CLOSED'},{...caseRow(),principal_approved:10},{...caseRow(),allocated_cash:'10'}])await assert.rejects(transport(async()=>json({...raw,rows:[row]})).page('CURRENT_CASES',args));
});
test('Case components use exact ordinal text and reject foreign/duplicate IDs or changed cursor',async()=>{
  const args={candidate_id:id(3),case_id:id(30),after_component_ordinal:'2',limit:100};
  const raw={ok:true,kind:'CASE_COMPONENTS',rows:[componentRow()],complete:false,next_cursor:{after_component_ordinal:'10'}};
  assert.deepEqual(await transport(async()=>json(raw)).page('CASE_COMPONENTS',args),raw);
  for(const value of [{...raw,rows:[{...componentRow(),case_id:id(99)}]},{...raw,rows:[{...componentRow(),component_ordinal:10}]},{...raw,next_cursor:{after_component_ordinal:'11'}},{...raw,rows:[componentRow(),{...componentRow(),component_ordinal:'11'}],next_cursor:{after_component_ordinal:'11'}}])await assert.rejects(transport(async()=>json(value)).page('CASE_COMPONENTS',args));
});
test('Case lost reply resumes identical bytes once; exact metadata counts block unsealed preparation',async()=>{
  const store=storage(),calls=[];let lost=true;
  const rpc={mutation:async(action,bytes)=>{calls.push(bytes);const args=JSON.parse(bytes);if(lost){lost=false;throw new Failure('TIMEOUT');}return action==='CASE_PAGE'?{run_id:id(2),candidate_id:id(3),selection_revision:'1',page_no:args.page_no,item_count:String(args.component_ids.length),replay:true}:{run_id:id(2),candidate_id:id(3),selection_revision:'1',sealed:true,selected_count:'1',excluded_count:'1',replay:false};}};
  const c=makeController(rpc,store);c.bind({run_id:id(2),candidate_id:id(3)});c.setComponentScope(id(30),null);await assert.rejects(c.mutate('CASE_PAGE',caseArgs()));
  const resumed=makeController(rpc,store);await resumed.retry();assert.equal(calls[0],calls[1]);assert.equal(resumed.snapshot().case_items,'1');assert.equal(resumed.snapshot().case_selected_count,'1');
  await assert.rejects(resumed.mutate('SEAL_ENQUEUE',{run_id:id(2),command_id:id(90),expected_pages:'0',expected_count:'0'}),e=>e.code==='REQUEST_INVALID');assert.equal(calls.length,2);
  resumed.setComponentScope(id(40),null);await resumed.mutate('CASE_PAGE',{...caseArgs(),page_no:'2',request_id:id(41),component_ids:[id(40)],selected:[false]});
  assert.deepEqual(resumed.snapshot().accepted_page_component_selected,[false]);assert.equal(resumed.snapshot().case_items,'2');assert.equal(resumed.snapshot().case_selected_count,'1');assert.equal(resumed.snapshot().case_excluded_count,'1');
  await assert.rejects(resumed.mutate('CASE_SEAL',{run_id:id(2),candidate_id:id(3),selection_revision:'1',expected_pages:'2',expected_items:'1'}));
  await resumed.mutate('CASE_SEAL',{run_id:id(2),candidate_id:id(3),selection_revision:'1',expected_pages:'2',expected_items:'2'});assert.equal(makeController({},store).snapshot().case_sealed,true);
});
test('complete legacy ALL journal adoption preserves its unknown bytes; partial new case metadata refuses',async()=>{
  const store=storage(),c=makeController({mutation:async()=>{throw new Failure('TIMEOUT');}},store);await assert.rejects(c.mutate('CREATE',{run_id:id(2),pay_date:'2026-10-05'}));
  const key=[...store.rows.keys()][0],value=JSON.parse(store.getItem(key));value.version=1;delete value.accepted_prepare;delete value.prior_case_selected_count;delete value.drafts;delete value.pay_channel;for(const k of Object.keys(value))if(k.startsWith('case_')||k==='component_cursor'||k.startsWith('accepted_page_component_'))delete value[k];store.setItem(key,JSON.stringify(value));
  const resumed=makeController({},store);assert.equal(resumed.snapshot().pending.bytes,request());assert.equal(resumed.snapshot().case_pages,'0');
  store.setItem(key,JSON.stringify({...value,case_pages:'0'}));assert.throws(()=>makeController({},store),e=>e.code==='JOURNAL_INVALID');
});

test('one confirmed preparation retains two channel addresses across resume and cannot adopt a foreign Draft',()=>{
  const store=storage(),c=makeController({},store),drafts=[{run_id:id(2),pay_channel:'PAYE'},{run_id:id(2),pay_channel:'UMBRELLA'}];
  c.bind({run_id:id(2)});c.setDrafts(drafts);c.bindDraft(drafts[0]);c.bind({worker_id:id(4),candidate_id:id(3)});
  const resumed=makeController({},store);assert.deepEqual(resumed.snapshot().drafts,drafts);assert.equal(resumed.snapshot().pay_channel,'PAYE');
  resumed.bindDraft(drafts[1]);assert.equal(resumed.snapshot().worker_id,null);assert.equal(resumed.snapshot().candidate_id,null);assert.equal(resumed.snapshot().pay_channel,'UMBRELLA');
  assert.equal(resumed.snapshot().run_id,id(2));assert.equal(resumed.snapshot().confirmed,true);assert.equal(resumed.snapshot().selection_sealed,true);
  assert.throws(()=>resumed.bindDraft({run_id:id(22),pay_channel:'UMBRELLA'}));assert.throws(()=>resumed.bind({run_id:id(22)}));
  assert.throws(()=>resumed.setDrafts([{run_id:id(2),pay_channel:'PAYE'}]));assert.deepEqual(resumed.snapshot().drafts,drafts);
});

test('complete v2 journal preserves uncertain request bytes without guessing a Draft channel; partial metadata refuses',async()=>{
  const store=storage(),c=makeController({mutation:async()=>{throw new Failure('TIMEOUT');}},store);
  await assert.rejects(c.mutate('CREATE',{run_id:id(2),pay_date:'2026-10-05'}));
  const key=[...store.rows.keys()][0],v2=JSON.parse(store.getItem(key));v2.version=2;delete v2.accepted_prepare;delete v2.drafts;delete v2.pay_channel;
  const bytes=v2.pending.bytes;store.setItem(key,JSON.stringify(v2));const resumed=makeController({},store);
  assert.equal(resumed.snapshot().version,4);assert.equal(resumed.snapshot().pending.bytes,bytes);assert.deepEqual(resumed.snapshot().drafts,[]);assert.equal(resumed.snapshot().pay_channel,null);
  store.setItem(key,JSON.stringify({...v2,pay_channel:null}));assert.throws(()=>makeController({},store),e=>e.code==='JOURNAL_INVALID');
  store.setItem(key,JSON.stringify({...v2,drafts:[]}));assert.throws(()=>makeController({},store),e=>e.code==='JOURNAL_INVALID');
});

test('whole-Candidate cancellation sends the selected frozen channel and refuses a different channel before transport',async()=>{
  const seen=[],c=makeController({mutation:async(action,bytes)=>{seen.push({action,bytes});return{command_id:id(100),run_worker_id:id(4),sequence:'1',phase:'REQUESTED',cursor:null,released_line_count:'0',blocked_code:null,replay:false};}});
  const draft={run_id:id(2),pay_channel:'UMBRELLA'};c.bind({run_id:id(2)});c.setDrafts([draft]);c.bindDraft(draft);c.bind({worker_id:id(4),candidate_id:id(3)});
  await assert.rejects(c.mutate('CANCEL_REQUEST',{command_id:id(100),run_worker_id:id(4),run_id:id(2),pay_channel:'PAYE'}));assert.equal(seen.length,0);
  const args={command_id:id(100),run_worker_id:id(4),...draft};await c.mutate('CANCEL_REQUEST',args);
  assert.deepEqual(JSON.parse(seen[0].bytes),{action:'CANCEL_REQUEST',...args});assert.equal(seen.length,1);
});

test('actual flattened intake is fixed, authenticated once and disables auth mutation retry',async()=>{
  let called=0;const rpc=transport(async(url,init)=>{called++;assert.equal(url,'https://local.invalid/api/banking/pay/next/preparation');assert.equal(init.auth401Mode,'return');assert.equal(init.redirect,'error');assert.equal(init.body,request());assert.ok(init.signal instanceof AbortSignal);return json(command('CREATE',createReceipt()));});
  assert.deepEqual(await rpc.mutation('CREATE',request()),createReceipt());assert.equal(called,1);
});
test('caller actor, float money, guessed revisions and unknown actions refuse before network',async()=>{
  let calls=0;const rpc=transport(async()=>{calls++;return json({});});
  assert.throws(()=>requestBody('PAYE_NET',{command_id:id(1),run_worker_id:id(4),entered_paye_net:75}));
  assert.throws(()=>requestBody('CREATE',{run_id:id(2),pay_date:'2026-10-05',actor_id:id(3)}));
  assert.throws(()=>requestBody('DRAIN',{run_id:id(2)}));
  await assert.rejects(rpc.page('CURRENT_WORK',{...pageArgs,after_week:'2026-10-04'}));assert.equal(calls,0);
});
test('serialized journal is written before send and second intent cannot overlap',async()=>{
  const store=storage();let release;const rpc={mutation:async()=>{assert.ok([...store.rows.values()][0].includes(request().replace(/"/g,'\\"')));return new Promise(r=>release=r);}};
  const c=makeController(rpc,store);const first=c.mutate('CREATE',{run_id:id(2),pay_date:'2026-10-05'});
  await assert.rejects(c.mutate('CREATE',{run_id:id(9),pay_date:'2026-10-05'}));assert.equal(c.snapshot().busy,true);
  release(createReceipt());await first;assert.equal(c.snapshot().pending,null);assert.equal(c.snapshot().run_id,id(2));
});
test('unknown receipt freezes changes, close/resume retains exact bytes, explicit retry uses same IDs',async()=>{
  const store=storage(),calls=[];let lost=true;
  const rpc={mutation:async(action,bytes)=>{calls.push(bytes);if(lost)throw new Failure('TIMEOUT');return createReceipt();}};
  const c=makeController(rpc,store);await assert.rejects(c.mutate('CREATE',{run_id:id(2),pay_date:'2026-10-05'}));
  await assert.rejects(c.mutate('CREATE',{run_id:id(9),pay_date:'2026-10-05'}));assert.equal(calls.length,1);
  const reopened=makeController(rpc,store);assert.equal(reopened.snapshot().pending.bytes,request());lost=false;await reopened.retry();assert.deepEqual(calls,[request(),request()]);assert.equal(reopened.snapshot().pending,null);
});
test('malformed known-looking receipt cannot clear pending mutation',async()=>{
  const c=makeController({mutation:async()=>({...createReceipt(),run_id:id(99)})});
  await assert.rejects(c.mutate('CREATE',{run_id:id(2),pay_date:'2026-10-05'}));assert.ok(c.snapshot().pending);
});
test('typed known refusal clears only that noncommitted intent; unknown refusal retains it',async()=>{
  for(const unknown of [false,true]){const c=makeController({mutation:async()=>{throw new Failure('SERVER_REFUSED',unknown);}});await assert.rejects(c.mutate('CREATE',{run_id:id(2),pay_date:'2026-10-05'}));assert.equal(c.snapshot().pending!==null,unknown);}
});
test('known auth/refusal on retry cannot erase an earlier unknown outcome',async()=>{
  for(const code of ['AUTH_REQUIRED','SERVER_REFUSED']){
    const store=storage();let first=true;const rows=[];const rpc={mutation:async(action,bytes)=>{rows.push(bytes);if(first){first=false;throw new Failure('TIMEOUT');}throw new Failure(code,false);}};
    const c=makeController(rpc,store);await assert.rejects(c.mutate('CREATE',{run_id:id(2),pay_date:'2026-10-05'}));const saved=[...store.rows.values()][0];
    await assert.rejects(c.retry(),e=>e.code===code);assert.equal([...store.rows.values()][0],saved);assert.equal(c.snapshot().pending.bytes,request());assert.deepEqual(rows,[request(),request()]);
    await assert.rejects(c.mutate('CREATE',{run_id:id(9),pay_date:'2026-10-05'}));
  }
});
test('401 response does not silently resubmit, malformed failure is unknown',async()=>{
  let calls=0;const rpc=transport(async()=>{calls++;return json({ok:false,error_code:'BPAY_NEXT_COMMAND_FORBIDDEN',retryable:false,outcome_unknown:false},401);});
  await assert.rejects(rpc.mutation('CREATE',request()),e=>e.code==='AUTH_REQUIRED');assert.equal(calls,1);
  const c=makeController(transport(async()=>json({ok:false,error_code:'arbitrary',retryable:false,outcome_unknown:false},409)));
  await assert.rejects(c.mutate('CREATE',{run_id:id(2),pay_date:'2026-10-05'}));assert.ok(c.snapshot().pending);
});
test('Office actor namespaces journal and corrupt/saved action mismatch cannot be adopted',()=>{
  const store=storage(),c=makeController({},store);c.bind({run_id:id(2)});assert.equal(makeController({},store,id(9)).snapshot().run_id,null);
  const value=JSON.parse([...store.rows.values()][0]);value.pending={action:'PAYE_NET',bytes:request()};store.setItem([...store.rows.keys()][0],JSON.stringify(value));assert.throws(()=>makeController({},store),e=>e.code==='JOURNAL_INVALID');
});
test('changed actor refuses before network and preserves the original uncertain journal',async()=>{
  const store=storage();let actor=id(1),calls=0;
  const rpc=createTransport({api:p=>p,actorId:id(1),currentActorId:()=>actor,timeoutMs:20,authFetch:async()=>{calls++;throw new Failure('TIMEOUT');}});
  const c=makeController(rpc,store);await assert.rejects(c.mutate('CREATE',{run_id:id(2),pay_date:'2026-10-05'}));
  const prior=[...store.rows.values()][0];actor=id(9);
  await assert.rejects(c.retry(),e=>e.code==='ACTOR_CHANGED');await assert.rejects(rpc.page('CURRENT_WORK',pageArgs),e=>e.code==='ACTOR_CHANGED');
  assert.equal(calls,1);assert.equal([...store.rows.values()][0],prior);assert.equal(makeController({},store,id(9)).snapshot().pending,null);
  const win=printWindow();await assert.rejects(printAdvice({api:p=>p,actorId:id(1),currentActorId:()=>actor,authFetch:async()=>{calls++;}},id(7),win),e=>e.code==='ACTOR_CHANGED');assert.equal(calls,1);assert.equal(win.chunks.length,0);
});
test('actor change during a pending response closes its body before adoption',async()=>{
  let actor=id(1),cancelled=false;
  const rpc=createTransport({api:p=>p,actorId:id(1),currentActorId:()=>actor,authFetch:async()=>{actor=null;return new Response(new ReadableStream({cancel(){cancelled=true;}}));}});
  await assert.rejects(rpc.mutation('CREATE',request()),e=>e.code==='ACTOR_CHANGED');assert.equal(cancelled,true);
});
test('current facts page preserves exact decimal text and does not assert eligibility',async()=>{
  const raw={ok:true,kind:'CURRENT_WORK',rows:[row(5)],complete:false,next_cursor:{after_week:'2026-10-04',after_work_id:id(5)}};
  const rpc=transport(async(url)=>{assert.match(url,/preparation-page\?kind=CURRENT_WORK/);return json(raw);});
  assert.deepEqual(await rpc.page('CURRENT_WORK',pageArgs),raw);
});
test('page rejects duplicate/foreign IDs, changed cursor, missing fields and empty incomplete response',async()=>{
  for(const raw of [
    {rows:[row(5),row(5)],complete:true,next_cursor:null},
    {rows:[{...row(5),candidate_id:id(99)}],complete:true,next_cursor:null},
    {rows:[row(5)],complete:false,next_cursor:{after_week:'2026-10-04',after_work_id:id(99)}},
    {rows:[{...row(5),current_calculator_amount:'999'}],complete:true,next_cursor:null},
    {rows:[],complete:false,next_cursor:null}
  ])await assert.rejects(transport(async()=>json({ok:true,kind:'CURRENT_WORK',...raw})).page('CURRENT_WORK',pageArgs));
});
test('STATUS P01 shows original accepted payroll75/recovery10/cash65 and rejects pending inconsistency',async()=>{
  const args={run_id:id(2),run_worker_id:id(4),after_transfer_no:null,limit:100},h=header();
  const raw={ok:true,kind:'STATUS',header:h,rows:[],complete:true,next_cursor:null};
  assert.deepEqual((await transport(async()=>json(raw)).page('STATUS',args)).header,h);
  await assert.rejects(transport(async()=>json({...raw,header:{...h,net_pending:true}})).page('STATUS',args));
});
test('transfer ordinals are exact decimal text, ordered numerically, never JSON numbers',async()=>{
  const t=n=>({transfer_id:id(Number(n)+100),transfer_no:n,projection_id:id(5),execution_kind:'BANK',status:'DRAFT',cash_amount:'65.00',original_transfer_id:null});
  const args={run_id:id(2),run_worker_id:id(4),after_transfer_no:'2',limit:100};
  const raw={ok:true,kind:'STATUS',header:header(),rows:[t('10')],complete:false,next_cursor:{after_transfer_no:'10'}};
  assert.deepEqual((await transport(async()=>json(raw)).page('STATUS',args)).next_cursor,{after_transfer_no:'10'});
  await assert.rejects(transport(async()=>json({...raw,rows:[{...t('10'),transfer_no:10}]})).page('STATUS',args));
});
test('actual STATUS internal-zero execution accepts exact INTERNAL_ZERO and refuses obsolete INTERNAL',async()=>{
  const args={run_id:id(2),run_worker_id:id(4),after_transfer_no:null,limit:100};
  const h={...header(),entered_paye_net:'0.00',accepted_recoveries:'0.00',accepted_net_additions:'0.00',cash_amount:'0.00'};
  const t={transfer_id:id(6),transfer_no:'1',projection_id:id(5),execution_kind:'INTERNAL_ZERO',status:'INTERNAL_SETTLED',cash_amount:'0.00',original_transfer_id:null};
  const raw={ok:true,kind:'STATUS',header:h,rows:[t],complete:true,next_cursor:null};
  assert.deepEqual(await transport(async()=>json(raw)).page('STATUS',args),raw);
  await assert.rejects(transport(async()=>json({...raw,rows:[{...t,execution_kind:'INTERNAL'}]})).page('STATUS',args));
  const source=fs.readFileSync(path.resolve(__dirname,'../../js/bpay-next-office.js'),'utf8');assert.match(source,/t\.execution_kind==='INTERNAL_ZERO'/);assert.doesNotMatch(source,/t\.execution_kind==='INTERNAL'/);
});
test('resume retains only this factual page cursor and accepted IDs, not full Candidate population',async()=>{
  const store=storage(),rpc={mutation:async()=>({run_id:id(2),page_no:'1',item_count:'1',selection_count:'1',selected_candidate_count:'1',replay:false})};
  const c=makeController(rpc,store);c.setCurrentCursor({after_week:'2026-10-04',after_work_id:id(100)});
  await c.mutate('WORK_PAGE',{run_id:id(2),page_no:'1',choices:[{work_id:id(101),expected_revision_id:id(201),mode:'ALL'}]});
  const reopened=makeController(rpc,store);assert.deepEqual(reopened.snapshot().accepted_page_work_ids,[id(101)]);assert.deepEqual(reopened.snapshot().current_cursor,{after_week:'2026-10-04',after_work_id:id(100)});
  reopened.setCurrentCursor({after_week:'2026-10-04',after_work_id:id(200)});assert.deepEqual(reopened.snapshot().accepted_page_work_ids,[]);assert.equal(reopened.snapshot().selection_count,'1');
});
test('REVIEW revision alone never enables confirmation if all_ready false',async()=>{
  const c=makeController({mutation:async()=>({run_id:id(2),phase:'REVIEW',reason:null,review_revision:'1',all_ready:false,replay:false})});
  await c.mutate('REVIEW',{run_id:id(2)});assert.equal(c.snapshot().can_confirm,false);assert.equal(c.snapshot().review_revision,null);
});
test('actual pending REVIEW receipt leaves confirmation disabled across journal resume',async()=>{
  const store=storage(),results=[{run_id:id(2),phase:'PREPARING',reason:'WORKERS_INCOMPLETE',review_revision:'0',all_ready:null,replay:false},{run_id:id(2),phase:'REVIEW',reason:null,review_revision:'1',all_ready:true,replay:false}],calls=[];
  const c=makeController({mutation:async(action,bytes)=>{calls.push(bytes);return results.shift();}},store);
  await c.mutate('REVIEW',{run_id:id(2)});assert.equal(c.snapshot().can_confirm,false);assert.equal(c.snapshot().review_revision,null);assert.equal(c.snapshot().pending,null);
  const resumed=makeController({},store);assert.equal(resumed.snapshot().can_confirm,false);assert.equal(resumed.snapshot().review_revision,null);
  await c.mutate('REVIEW',{run_id:id(2)});assert.equal(c.snapshot().can_confirm,true);assert.equal(c.snapshot().review_revision,'1');assert.equal(calls[0],calls[1]);
});
test('no-case NET omits case revision and frozen case NET uses exact accepted revision text',()=>{
  const args={command_id:id(6),run_worker_id:id(4),entered_paye_net:'9007199254740993.01'};
  assert.equal(JSON.parse(requestBody('PAYE_NET',args)).expected_projection_revision,undefined);
  assert.equal(JSON.parse(requestBody('PAYE_NET',{...args,expected_projection_revision:'2'})).entered_paye_net,args.entered_paye_net);
});
test('bounded Response stream is cancelled before oversized JSON adoption',async()=>{
  let cancelled=false;const raw=new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(LIMITS.bytes+1));},cancel(){cancelled=true;}}));
  await assert.rejects(transport(async()=>raw).mutation('CREATE',request()));assert.equal(cancelled,true);
});
test('deadline cannot trigger automatic retry and late response body is closed',async()=>{
  let release,cancelled=false,calls=0;const rpc=transport(async()=>{calls++;return new Promise(r=>release=r);});
  const p=rpc.mutation('CREATE',request());await assert.rejects(p,e=>e.code==='TIMEOUT');
  release(new Response(new ReadableStream({cancel(){cancelled=true;}})));await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);assert.equal(cancelled,true);
});
function printWindow(){const chunks=[];return{child:{closed:false,opener:{},document:{open(){chunks.length=0;},write:t=>chunks.push(t),close(){},querySelectorAll(){return [];}}},chunks,open(){return this.child;},setTimeout,clearTimeout};}
test('advice uses authFetch-return and split streamed UTF8 writes, never whole-body/Blob',async()=>{
  const win=printWindow();let fetched=0;const text='<html><body>'+('£'.repeat(20000))+'<p data-advice-state="complete">COMPLETE</p></body></html>';
  await printAdvice({api:p=>p,authFetch:async(url,init)=>{fetched++;assert.equal(url,'/api/banking/pay/next/advice/'+id(7));assert.equal(init.auth401Mode,'return');return new Response(text,{headers:{'content-type':'text/html','x-bpay-next-advice-template':'original-csv-html-v1'}});}},id(7),win);
  assert.equal(fetched,1);assert.equal(win.child.opener,null);assert.match(win.chunks.join(''),/data-advice-state="complete"/);assert.ok(win.chunks.length>3);assert.ok(win.chunks.every(c=>encoderBytes(c)<=16384));
});
const encoderBytes=t=>new TextEncoder().encode(t).byteLength;
test('missing or failed advice stream leaves visible INCOMPLETE warning',async()=>{
  const win=printWindow();await assert.rejects(printAdvice({api:p=>p,authFetch:async()=>new Response('<p data-advice-state="failed">failed</p>',{headers:{'content-type':'text/html','x-bpay-next-advice-template':'original-csv-html-v1'}})},id(7),win));assert.match(win.chunks.join(''),/Do not use this as complete/);
});
test('actual menu enters NEXT before legacy boot and all new directly loaded assets align',()=>{
  const root=path.resolve(__dirname,'../..'),main=fs.readFileSync(path.join(root,'js/main.js'),'utf8'),index=fs.readFileSync(path.join(root,'index.html'),'utf8'),source=fs.readFileSync(path.join(root,'js/bpay-next-office.js'),'utf8');
  const start=main.indexOf("if (destination === 'pay_next')"),end=main.indexOf("if (typeof openBanking !== 'function')",start);assert.ok(start>0&&end>start);assert.match(main.slice(start,end),/ignoreMembership: true/);assert.match(main.slice(start,end),/currentActorId: \(\) => SESSION\?\.user\?\.id \|\| null/);assert.match(main.slice(start,end),/return;/);
  assert.match(index,/bpay-next-office\.js\?v=20261010-next-dates-r1/);assert.match(index,/bpay-next-office\.css\?v=20261010-next-dates-r1/);
  assert.doesNotMatch(source,/parseFloat|\.toFixed\(|response\.text\(|response\.json\(|sbRpc|WORKBENCH_|drain_v1/);
});
test('actual authFetch with debug enabled never clones/buffers/logs NEXT, preserves unrelated logging',async()=>{
  const main=fs.readFileSync(path.resolve(__dirname,'../../js/main.js'),'utf8'),start=main.indexOf('async function authFetch(input, init = {})'),end=main.indexOf('// ===== Auth API calls =====',start);
  const logs=[];let clones=0,calls=0;const response={status:200,ok:true,clone(){clones++;return{text:async()=>'<private-test-financial>'};}};
  const context={window:{__LOG_API:true},Headers,URL,URLSearchParams,AbortController,console:{log:(...x)=>logs.push(x)},fetch:async()=>{calls++;return response;}};
  vm.runInNewContext(`const SESSION={accessToken:'local-only-placeholder'};const __LOG_API=false;${main.slice(start,end)};globalThis.run=authFetch;`,context);
  await context.run('https://local.invalid/api/banking/pay/next/advice/'+id(7),{auth401Mode:'return'});assert.equal(clones,0);assert.equal(logs.length,0);assert.equal(calls,1);
  await context.run('https://local.invalid/api/nonfinancial',{auth401Mode:'return'});assert.equal(clones,1);assert.ok(logs.length>0);assert.equal(calls,2);
});
test('actual clearSession closes NEXT without deleting its actor journal or changing legacy session cleanup',()=>{
  const main=fs.readFileSync(path.resolve(__dirname,'../../js/main.js'),'utf8'),start=main.indexOf('function clearSession() {'),end=main.indexOf('async function refreshToken()',start);
  const store=storage(),journal='cloudtms.bpay-next.v1.'+id(1);store.setItem(journal,'retained-uncertain-test');const removed=[];let closes=0,events=0;
  const context={window:{CloudTMSBpayNextOffice:{close:()=>closes++},dispatchEvent:()=>events++},clearTimeout,localStorage:{removeItem:k=>removed.push(k)},sessionStorage:{removeItem:k=>{removed.push(k);store.rows.delete(k);}},CustomEvent:class{},renderUserChip(){}};
  vm.runInNewContext(`let SESSION={user:{id:'${id(1)}'}},refreshTimer=0,officeAuthRefreshRetryAttempt=4;${main.slice(start,end)};clearSession();globalThis.session=SESSION;globalThis.attempt=officeAuthRefreshRetryAttempt;`,context);
  assert.equal(closes,1);assert.equal(events,1);assert.equal(context.session,null);assert.equal(context.attempt,0);assert.equal(store.getItem(journal),'retained-uncertain-test');assert.deepEqual(removed,['cloudtms.tfa','cloudtms.session','cloudtms.session']);
});
