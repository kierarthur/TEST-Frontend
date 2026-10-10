const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const api=require('../../js/bpay-next-payment-history.js');
const dates=require('../../js/bpay-next-dates.js');
const actor='b8100000-0000-4000-8000-000000000001',candidate='b8100000-0000-4000-8000-000000000002',
  timesheet='b8100000-0000-4000-8000-000000000003',work='b8100000-0000-4000-8000-000000000004';
const scope={candidate_id:candidate,timesheet_id:null};
const call=(extra={})=>({version:'PAYMENT_HISTORY_V1',...scope,section:'MANIFEST',parent_id:null,context_id:null,
  component_key:null,after:null,upper:null,limit:50,...extra});
const unavailable=['MOVED_ROOT_FLAT_PAID_BINDING','CANONICAL_MULTI_CHANNEL_VECTOR','MOVE_COMPARISON_RECEIPT','GENERAL_APPROVAL_ACTOR_REASON_NOT_CAPTURED_IN_NEXT_ROWS'];
const manifest=request=>({version:'PAYMENT_HISTORY_V1',candidate_id:candidate,work_id:request.timesheet_id?work:null,
  sections:Object.entries(api.sections).map(([section,definition])=>({section,...definition,
    applicability:request.timesheet_id && ['CASES','COMMANDS'].includes(section)?'CANDIDATE_ONLY_USE_REFERENCED_PARENT':'SCOPE_QUALIFIED'})),
  terminal:true,next_cursor:null,consistency:'LIVE_KEYSET_REFRESH_FOR_LATE_COMMIT',scalar_encoding:'STRING_OR_NULL',
  unavailable:unavailable.concat(request.timesheet_id?['TIMESHEET_COMMAND_WITHOUT_WORK_OR_CASE_ANCESTRY']:[])});
const row=(section,key,extra={})=>{
  const data=Object.fromEntries(api.sections[section].fields.map(field=>[field,null]));
  api.sections[section].keys.forEach(([field],i)=>data[field]=key[i]);
  if(section==='POSITIONS')data.current_residual_source_ex_vat='0.00';
  return {key,data:{...data,...extra}};
};
const page=(request,rows,terminal=true,upper=rows.at(-1)?.key??null)=>({
  version:'PAYMENT_HISTORY_V1',candidate_id:candidate,work_id:request.timesheet_id?work:null,
  section:request.section,parent_id:request.parent_id,context_id:request.context_id,component_key:request.component_key,
  amount_scope:api.sections[request.section].amount_scope,consistency:'LIVE_KEYSET_REFRESH_FOR_LATE_COMMIT',rows,upper,terminal,
  next_cursor:terminal?null:{version:'PAYMENT_HISTORY_CURSOR_V1',scope_kind:request.timesheet_id?'TIMESHEET':'CANDIDATE',
    scope_id:request.timesheet_id||request.candidate_id,section:request.section,parent_id:request.parent_id,
    context_id:request.context_id,component_key:request.component_key,upper,key:rows.at(-1).key}
});
const response=value=>Response.json({ok:true,page:value});

test('PF11 shared London clock covers BST, winter, DST boundaries and unchanged date buckets',()=>{
  for(const [wire,shown] of [
    ['2026-06-30T23:30:00Z','01/07/2026 00:30:00'],
    ['2026-12-30T23:30:00Z','30/12/2026 23:30:00'],
    ['2026-03-29T00:59:59Z','29/03/2026 00:59:59'],
    ['2026-03-29T01:00:00Z','29/03/2026 02:00:00'],
    ['2026-10-25T00:59:59Z','25/10/2026 01:59:59'],
    ['2026-10-25T01:00:00Z','25/10/2026 01:00:00'],
    ['2026-06-30 23:30:00.123456+00','01/07/2026 00:30:00'],
    ['2026-07-01T00:30:00+01:00','01/07/2026 00:30:00']]){
    assert.equal(dates.formatTimestamp(wire),shown);
    assert.equal(api.displayScalar(wire,'occurred_at_utc'),shown);
  }
  assert.equal(dates.formatTimestamp('2026-02-30T00:00:00Z'),'Not recorded');
  assert.equal(dates.formatTimestamp('2026-06-30 23:30:00'),'Not recorded');
  assert.equal(dates.formatTimestamp(null),'Not recorded');
  assert.equal(dates.formatDate('2026-06-30'),'30/06/2026');
  assert.equal(api.displayScalar('2026-06-30','work_date'),'30/06/2026');
  assert.equal(api.displayScalar('2026-06-30','date_from'),'30/06/2026');
  assert.equal(api.displayScalar('2026-06-30','date_to'),'30/06/2026');
  assert.equal(api.displayScalar('2026-06-30T23:30:00Z','captured_deadline'),'01/07/2026 00:30:00');
  assert.equal(api.displayScalar('2026-06-30 23:30:00.123456+00','queue_wake_after_utc'),'01/07/2026 00:30:00');
  const request=call({section:'WORKS'}),validate=api.validateRequest(request);
  assert.equal(validate,request);
});

test('PF11 printable frozen facts use the same formatter without changing local clocks, money or free text',()=>{
  const pair=(label,value)=>({textContent:label,nextElementSibling:{tagName:'DD',textContent:value}});
  const terms=[pair('Pay date','2026-06-30'),pair('Week ending','2026-06-30'),pair('Work date','2026-06-30'),
    pair('Issued at (recorded timezone)','2026-06-30T23:30:00Z'),pair('Recorded start (timezone retained)','2026-06-30T23:30:00Z'),
    pair('Recorded end (timezone retained)',null),pair('Local start (no timezone inferred)','23:30'),
    pair('Selected source difference','9007199254740993.01'),pair('Explanation','2026-06-30T23:30:00Z')];
  const headings=['Break start (recorded)','Break end (recorded)','Local start','Local end','Duration minutes'].map(textContent=>({textContent}));
  const row={children:['2026-06-30T23:30:00Z','2026-07-01T00:00:00Z','00:30','01:00','30'].map(textContent=>({textContent}))};
  const duration={children:[{textContent:'Duration-only break; no clock endpoints invented.'}]};
  const table={querySelectorAll:selector=>selector==='thead th'?headings:[row,duration]};
  dates.formatAdvice({querySelectorAll:selector=>selector==='dl > dt'?terms:[table]});
  for(const term of terms.slice(0,3))assert.equal(term.nextElementSibling.textContent,'30/06/2026');
  assert.equal(terms[3].nextElementSibling.textContent,'01/07/2026 00:30:00');
  assert.equal(terms[3].textContent,'Issued at (London time)');
  assert.equal(terms[5].nextElementSibling.textContent,'Not recorded');
  assert.equal(terms[6].nextElementSibling.textContent,'23:30');
  assert.equal(terms[7].nextElementSibling.textContent,'9007199254740993.01');
  assert.equal(terms[8].nextElementSibling.textContent,'2026-06-30T23:30:00Z');
  assert.deepEqual(row.children.map(cell=>cell.textContent),['01/07/2026 00:30:00','01/07/2026 01:00:00','00:30','01:00','30']);
  assert.equal(duration.children[0].textContent,'Duration-only break; no clock endpoints invented.');
});

test('PF11 source routing rejects raw ISO display and retains wire TS_DAY and exact CSV',()=>{
  const root=path.resolve(__dirname,'../..'),office=fs.readFileSync(path.join(root,'js/bpay-next-office.js'),'utf8'),history=fs.readFileSync(path.join(root,'js/bpay-next-payment-history.js'),'utf8'),shared=fs.readFileSync(path.join(root,'js/bpay-next-dates.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const check=({office,history,shared,html})=>{
  assert.match(office,/const humanDate = dates\.formatDate;/);
  assert.match(office,/const humanTimestamp = dates\.formatTimestamp;/);
  for(const name of ['shift_start_at','shift_end_at','break_start_at','break_end_at'])assert.match(office,new RegExp('humanTimestamp\\(r\\.'+name+'\\)'));
  assert.match(history,/return dates\.formatTimestamp\(value\)/);
  assert.match(history,/return dates\.formatDate\(value\)/);
  assert.match(shared,/root\.formatUkDate\(value\)/);
  assert.match(shared,/timeZone:'Europe\/London'/);assert.match(shared,/hourCycle:'h23'/);
  assert.equal((shared.match(/new Intl\.DateTimeFormat/g)||[]).length,1);
  assert.doesNotMatch(office.slice(office.indexOf('const humanDate'),office.indexOf('const clockPair')),/slice\(|UTC|toISOString/);
  assert.doesNotMatch(history.slice(history.indexOf('function displayScalar'),history.indexOf('const copy=')),/UTC|toISOString|slice\(/);
  assert.match(office,/child\.document\.close\(\);dates\.formatAdvice\(child\.document\);completed=true/);
  assert.match(office,/new Blob\(\[result\.csv_text\]/);
  assert.match(office,/JSON\.stringify\(\{kind,\.\.\.args\}\)/);
  assert.ok(html.indexOf('js/bpay-next-dates.js?')>=0&&html.indexOf('js/bpay-next-dates.js?')<html.indexOf('js/bpay-next-office.js?'));
  assert.doesNotMatch(office.slice(office.indexOf('function requestBody'),office.indexOf('function receipt')),/formatDate|formatTimestamp/);
  assert.doesNotMatch(history.slice(history.indexOf('function validateBpayNextHistoryRequest'),history.indexOf('function displayScalar')),/formatDate|formatTimestamp/);
  assert.ok(html.indexOf('js/bpay-next-dates.js?')<html.indexOf('js/bpay-next-payment-history.js?'));
  };
  const current={office,history,shared,html};check(current);
  for(const changed of [
    {...current,office:office.replace("const humanTimestamp = dates.formatTimestamp;","const humanTimestamp = value => value;")},
    {...current,office:office.replace("humanTimestamp(r.break_start_at)","r.break_start_at")},
    {...current,history:history.replace("return dates.formatTimestamp(value)","return value")},
    {...current,shared:shared.replace("Europe/London","UTC")},
    {...current,office:office.replace("dates.formatAdvice(child.document);","")},
    {...current,office:office.replace("new Blob([result.csv_text]","new Blob([dates.formatDate(result.csv_text)]")},
    {...current,html:html.replace("js/bpay-next-dates.js?","js/missing-dates.js?")}
  ])assert.throws(()=>check(changed));
});
test('frontend and backend closed field contracts stay byte-equivalent as data',async()=>{
  const backend=await import('../../../bpay-next-build-backend-20261009/broker/src/bpay-next-history.js');
  assert.deepEqual(api.sections,backend.BPAY_NEXT_HISTORY_SECTIONS);assert.equal(Object.keys(api.sections).length,52);
});
test('client is dormant until explicit open and never sends actor, SQL or arbitrary body fields',async()=>{
  let calls=0;
  const client=api.createClient({scope,actorId:actor,currentActorId:()=>actor,api:'https://controlled.invalid/',authFetch:async(url,init)=>{
    calls++;assert.equal(url,'https://controlled.invalid/api/banking/pay/next/history-page');
    assert.equal(init.method,'POST');assert.equal(init.auth401Mode,'return');assert.ok(init.signal instanceof AbortSignal);
    const request=JSON.parse(init.body);assert.deepEqual(request,call());assert.ok(!Object.hasOwn(request,'actor_user_id'));
    return response(manifest(request));
  }});
  assert.equal(calls,0);await client.manifest();assert.equal(calls,1);assert.equal(client.snapshot().page,null);
  assert.ok(Object.isFrozen(client.snapshot().manifest));client.close();
});
test('next cursor retains scope/parent/upper and refresh restarts only one section',async()=>{
  const seen=[];let revisionPage=0;
  const client=api.createClient({scope,actorId:actor,currentActorId:()=>actor,api:'https://controlled.invalid',authFetch:async(_,init)=>{
    const request=JSON.parse(init.body);seen.push(request);
    if(request.section==='MANIFEST')return response(manifest(request));
    revisionPage++;
    return response(page(request,[row('REVISIONS',[request.after?'2':'1'],{approved_source_ex_vat:'1234567890.123456',source_pay_channel:null})],
      Boolean(request.after),['2']));
  }});
  await client.manifest();await client.section({section:'REVISIONS',parent_id:work,context_id:null,component_key:null});
  const original=client.snapshot().page.next_cursor;
  assert.equal(client.snapshot().page.rows[0].data.source_pay_channel,null);
  await client.next();assert.deepEqual(seen[2].after,original);assert.deepEqual(seen[2].upper,['2']);
  assert.equal(client.snapshot().page.terminal,true);assert.throws(()=>client.next());
  await client.refresh();assert.equal(seen[3].after,null);assert.equal(seen[3].upper,null);assert.equal(revisionPage,3);
});
test('captured graph exposes all 52 sections including failed commands and CASE-only worker context',()=>{
  const reached=new Set(['WORKS','CASES','COMMANDS']);
  for(const [section,kind] of Object.entries({WORKS:'WORK',REVISIONS:'REVISION',LINES:'LINE',SHIFTS:'SHIFT',RUN_WORKS:'RUN_WORK',
    RUN_LINES:'RUN_LINE',WORKER:'WORKER',TRANSFERS:'TRANSFER',CASES:'CASE',COMPONENTS:'COMPONENT',INSTRUCTIONS:'INSTRUCTION',
    COMMAND:'COMMAND',COMMANDS:'COMMAND',POSITIONS:'WORK',COLLECTIONS:'WORK'})) {
    const data={id:work,command_id:work,work_id:work,component_key:'component',case_id:work,run_worker_id:work};
    for(const link of api.childLinks(section,{data},call({section})))reached.add(link.section);
  }
  assert.deepEqual([...reached].sort(),Object.keys(api.sections).sort());
  const ts=call({candidate_id:null,timesheet_id:timesheet,section:'INSTRUCTIONS'});
  assert.deepEqual(api.childLinks('INSTRUCTIONS',{data:{id:actor,run_worker_id:work}},ts).find(x=>x.section==='WORKER'),
    {section:'WORKER',parent_id:work,context_id:actor,component_key:null});
  const children=api.childLinks('WORKER',{data:{id:work}}, {...ts,section:'WORKER',context_id:actor});
  assert.equal(children.find(x=>x.section==='TRANSFERS').context_id,actor);
});
test('actor change and close suppress a late response and cannot retain or fetch stale scope',async()=>{
  let current=actor,calls=0,release;
  const client=api.createClient({scope,actorId:actor,currentActorId:()=>current,api:'https://controlled.invalid',authFetch:async()=>{
    calls++;return new Promise(resolve=>release=()=>resolve(response(manifest(call()))));
  }});
  const pending=client.manifest();await Promise.resolve();current=work;release();
  await assert.rejects(pending,/ACTOR_CHANGED/);assert.equal(client.snapshot().manifest,null);assert.equal(client.snapshot().closed,true);
  await assert.rejects(client.manifest());assert.equal(calls,1);
});
test('malformed/foreign scalar response refuses atomically and malicious labels are escaped',async()=>{
  let wrong=false;
  const client=api.createClient({scope,actorId:actor,currentActorId:()=>actor,api:'https://controlled.invalid',authFetch:async(_,init)=>{
    const req=JSON.parse(init.body);const m=manifest(req);if(wrong)m.candidate_id=work;return response(m);
  }});
  await client.manifest();const accepted=client.snapshot().manifest;wrong=true;
  await assert.rejects(client.manifest(),/RESPONSE_INVALID/);assert.equal(client.snapshot().manifest,accepted);
  assert.equal(api.escape('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.match(api.amountNotice('WHOLE_TRANSFER_CASH_CURRENT_STATUS'),/no Timesheet cash allocation/);
  assert.equal(api.displayScalar('2026-10-06 13:04:05.123456+00','occurred_at_utc'),'06/10/2026 14:04:05');
  assert.equal(api.displayScalar('2026-10-04','week_ending_date'),'04/10/2026');
  assert.equal(api.displayScalar('1234567890.123456','frozen_ex_vat'),'1234567890.123456');
});
test('real modal entry, framework cleanup and versioned asset are connected without autoload',()=>{
  const root=path.resolve(__dirname,'../..');
  const main=fs.readFileSync(path.join(root,'js/main.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(main,/CloudTMSBpayNextHistory\.open\(\{[\s\S]{0,400}currentActorId: \(\) => SESSION\?\.user\?\.id/);
  assert.match(main,/scope: \{candidate_id: top\.entity === 'candidates' \? scopeId : null/);
  assert.match(main,/timesheet_id: top\.entity === 'timesheets' \? scopeId : null/);
  assert.match(main,/currentFrame\(\) !== top \|\| paymentHistoryButton\.disabled/);
  assert.match(html,/id="btnPaymentHistory"/);assert.match(html,/bpay-next-payment-history\.js\?v=20261010-next-environment-r1/);
  const module=fs.readFileSync(path.join(root,'js/bpay-next-payment-history.js'),'utf8');
  assert.match(module,/frameEntity:'payment-history'/);assert.match(module,/onDismiss/);
  assert.doesNotMatch(module,/console\.|localStorage|sessionStorage|WORK_PAGE|PAYE_NET|CSV_ISSUE|\.reduce\(/);
});
