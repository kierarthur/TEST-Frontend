import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0'),clone=x=>JSON.parse(JSON.stringify(x));
const storage=()=>{const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
function context(extra={}){return {schema_version:'WEEKLY_SOURCE_KEPT_AS_PAID_CONTEXT_READ_V1',work_event_id:id(1),candidate_id:id(2),client_id:id(3),contract_id:id(4),source_group_id:id(5),source_cycle_id:id(6),finalisation_week_ending:'2026-10-18',projection_publication_id:id(7),upload_id:id(8),source_present:false,invoiced:false,paid:null,paid_evidence_state:'UNKNOWN',root_timesheet_ids:[id(9)],credit_lines:[],reason:'NOT_INVOICED_DISAPPEARED',kept_by_default:true,decision_available:true,decision_needed:true,facts_fingerprint:'a'.repeat(64),decision_applies:false,latest_acknowledgement:null,holds_pay:null,holds_invoice:null,accepted_source_removed:false,disabled_reason:null,...extra};}
function receipt(p,extra={}){return {ok:true,decision:'KEEP_AS_PAID',decision_id:id(20),work_event_id:p.work_event_id,reason:p.reason,credit_invoice_line_id:p.credit_invoice_line_id,facts_fingerprint:p.expected_facts_fingerprint,actor_user_id:id(10),acknowledged_at_utc:'2026-10-17T12:34:56Z',acknowledgement_sequence:'9007199254740993',idempotent_replay:false,pay_changed:false,invoice_changed:false,...extra};}
function fixture({saved=storage(),ctx=context(),send,selectedCredit,parentKey='TIMESHEET:'+id(9),event=id(1)}={}){
 let current=true,next=100;const calls=[];
 const sandbox={module:{exports:{}},Intl,Date,Response,AbortController,TextDecoder,Uint8Array,setTimeout,clearTimeout,crypto:{randomUUID:()=>id(next++)}};
 for(const file of ['kept-as-paid-contract.js','kept-as-paid-controls.js'])vm.runInNewContext(fs.readFileSync('js/weekly-source/'+file,'utf8'),sandbox);
 const api=sandbox.module.exports;
 const request=async options=>{const body=JSON.parse(options.body);calls.push(clone(body));if(body.action==='KEEP_AS_PAID')assert(saved.getItem(api.journalKey(id(10))),'journal must exist before network');
  return send?send(body,options):Response.json(body.action==='KEEP_AS_PAID_CONTEXT'?ctx:receipt(body.payload));};
 const options={actorId:id(10),workEventId:event,parentKey,expectedScope:{candidate_id:id(2),client_id:id(3),source_group_id:id(5),source_cycle_id:id(6),contract_id:id(4)},selectedCredit,storage:saved,request,isCurrent:()=>current};
 return {api,dto:sandbox.CloudTMSKeptAsPaidContractV1,create:()=>api.create(options),options,calls,saved,context:ctx,setCurrent:v=>current=v};
}
test('fresh context retains nullable facts and seven exact request fields without browser actor or money',async()=>{
 const f=fixture(),c=f.create();await c.load();assert.equal(c.snapshot().context.paid,null);assert.equal(c.snapshot().context.holds_pay,null);assert.match(c.html(),/<dt>Paid<\/dt><dd>Not known/);
 await c.save();assert.equal(f.calls.length,3);const p=f.calls[1].payload;
 assert.deepEqual(Object.keys(p),['schema_version','work_event_id','decision','reason','credit_invoice_line_id','expected_facts_fingerprint','idempotency_key']);assert.equal(p.credit_invoice_line_id,null);assert.equal(p.expected_facts_fingerprint,'a'.repeat(64));assert.equal(f.saved.values.size,0);assert.equal(c.snapshot().receipt.acknowledgement_sequence,'9007199254740993');
});
test('unknown save survives controller close/reopen and retries identical bytes before any new context',async()=>{
 let lost=true;const f=fixture({send:body=>{if(body.action==='KEEP_AS_PAID_CONTEXT')return Response.json(context());if(lost){lost=false;throw Error('lost');}return Response.json(receipt(body.payload,{idempotent_replay:true}));}});
 const c=f.create();await c.load();await assert.rejects(c.save());const bytes=f.saved.getItem(f.api.journalKey(id(10)));
 const reopened=f.create();await assert.rejects(reopened.load(),/original/);await assert.rejects(reopened.save(),/original/);assert.equal(f.saved.getItem(f.api.journalKey(id(10))),bytes);
 await reopened.retry();assert.deepEqual(f.calls[1],f.calls[2]);assert.equal(f.saved.values.size,0);assert.equal(f.calls.filter(x=>x.action==='KEEP_AS_PAID').length,2);
});
test('storage failure, corrupted JSON, duplicate journal fields and damaged exact payload refuse before mutation',async()=>{
 for(const broken of ['{broken','{"version":"x","version":"x"}']){const saved=storage();saved.setItem('cloudtms.health.keep-as-paid.v1:'+id(10),broken);const f=fixture({saved}),c=f.create();await assert.rejects(c.load());await assert.rejects(c.save());assert.equal(f.calls.length,0);assert.equal(saved.values.size,1);}
 const saved=storage();saved.setItem=()=>{throw Error('storage blocked');};const f=fixture({saved}),c=f.create();await c.load();await assert.rejects(c.save());assert.equal(f.calls.length,1);assert.match(c.html(),/could not be prepared safely/);
});
test('actor/event/parent mismatch cannot reuse or bypass a pending journal',async()=>{
 const f=fixture({send:body=>body.action==='KEEP_AS_PAID_CONTEXT'?Response.json(context()):Promise.reject(Error('lost'))}),c=f.create();await c.load();await assert.rejects(c.save());
 for(const change of [{workEventId:id(30)},{parentKey:'TIMESHEET:'+id(31)}]){const other=f.api.create({...f.options,...change});await assert.rejects(other.save());await assert.rejects(other.retry());assert.equal(other.snapshot().journalBlocked,true);}
 f.setCurrent(false);await assert.rejects(c.retry(),/original actor/);assert.equal(f.calls.length,2);assert.equal(f.saved.values.size,1);
});
test('late parent/actor drift cannot adopt or erase the pending request after a valid reply',async()=>{
 let f;f=fixture({send:body=>{if(body.action==='KEEP_AS_PAID_CONTEXT')return Response.json(context());f.setCurrent(false);return Response.json(receipt(body.payload));}});
 const c=f.create();await c.load();await assert.rejects(c.save());assert.equal(c.snapshot().receipt,null);assert.equal(f.saved.values.size,1);
});
test('one actor cannot dispatch another save while its original network call is in flight',async()=>{
 let release;const f=fixture({send:body=>body.action==='KEEP_AS_PAID_CONTEXT'?Response.json(context()):new Promise(resolve=>{release=()=>resolve(Response.json(receipt(body.payload)));})}),c=f.create();await c.load();const first=c.save();
 await assert.rejects(f.create().retry(),/still being checked/);await assert.rejects(c.save(),/still being checked/);assert.equal(f.calls.length,2);release();await first;assert.equal(f.saved.values.size,0);
});
test('only exact typed transactional refusal clears an unsuccessful intent and requires fresh facts',async()=>{
 const f=fixture({send:body=>body.action==='KEEP_AS_PAID_CONTEXT'?Response.json(context()):Response.json({error_code:'WEEKLY_SOURCE_KEEP_AS_PAID_FACTS_CHANGED'},{status:409})}),c=f.create();await c.load();await assert.rejects(c.save());assert.equal(f.saved.values.size,0);await assert.rejects(c.save(),/Refresh/);assert.equal(f.calls.length,2);
 for(const [code,status]of [['WEEKLY_SOURCE_KEEP_AS_PAID_FACTS_CHANGED',400],['UNEXPECTED',409]]){const x=fixture({send:body=>body.action==='KEEP_AS_PAID_CONTEXT'?Response.json(context()):Response.json({error_code:code},{status})}),v=x.create();await v.load();await assert.rejects(v.save());assert.equal(x.saved.values.size,1);}
});
test('one genuine credit is admitted unchanged; multiple credits require a genuine selected native member',async()=>{
 const credits=[{invoice_line_id:id(40)},{invoice_line_id:id(41)}];
 const one=fixture({ctx:context({invoiced:true,reason:'CREDITED',credit_lines:credits.slice(0,1)})}),a=one.create();await a.load();await a.save();assert.equal(one.calls[1].payload.credit_invoice_line_id,id(40));
 const multi=fixture({ctx:context({invoiced:true,reason:'CREDITED',credit_lines:credits,disabled_reason:{code:'CREDIT_SELECTION_REQUIRED',message:'Open the credited Source line before recording Keep as paid.'}})}),b=multi.create();await b.load();await assert.rejects(b.save());assert.equal(multi.calls.length,1);
 const selected=fixture({selectedCredit:id(41),ctx:context({invoiced:true,reason:'CREDITED',credit_lines:credits})}),c=selected.create();await c.load();await c.save();assert.equal(selected.calls[1].payload.credit_invoice_line_id,id(41));
 const forged=fixture({selectedCredit:id(42),ctx:context({invoiced:true,reason:'CREDITED',credit_lines:credits})});await assert.rejects(forged.create().load());assert.equal(forged.calls.length,1);
});
test('latest genuine ACK displays separately even when decision no longer applies; hostile labels are text',async()=>{
 const ack={audit_id:id(50),decision_id:id(51),actor_user_id:id(52),actor_display:'<img onerror=alert(1)>',acknowledged_at_utc:'2026-10-17T12:34:56Z',acknowledgement_sequence:'9223372036854775807'};
 const f=fixture({ctx:context({latest_acknowledgement:ack,decision_applies:false})}),c=f.create();await c.load();assert.match(c.html(),/Kept as paid by &lt;img onerror=alert\(1\)&gt; on 17\/10\/2026 13:34:56/);assert.match(c.html(),/historical acknowledgement/);assert.doesNotMatch(c.html(),/<img/);assert.equal(c.snapshot().context.latest_acknowledgement.acknowledgement_sequence,'9223372036854775807');
});
test('London presentation respects winter/DST without changing UTC or decimal fields',()=>{
 const f=fixture();assert.equal(f.api.london('2026-01-17T12:34:56Z'),'17/01/2026 12:34:56');assert.equal(f.api.london('2026-07-17T23:34:56Z'),'18/07/2026 00:34:56');assert.equal(f.api.london('2026-10-25T01:30:00Z'),'25/10/2026 01:30:00');
});
test('frozen public decoder refuses calendar/clock normalization, unknown keys and numeric ACK counters',()=>{
 const f=fixture(),base={audit_id:id(50),decision_id:id(51),actor_user_id:id(52),actor_display:'Office',acknowledged_at_utc:'2026-10-17T12:34:56Z',acknowledgement_sequence:'1'};
 for(const ack of [{...base,acknowledged_at_utc:'2026-02-31T12:34:56Z'},{...base,acknowledged_at_utc:'2026-10-17T24:00:00Z'},{...base,acknowledgement_sequence:9007199254740992}])assert.throws(()=>f.dto.decodeKeptPayContext(context({latest_acknowledgement:ack}),{work_event_id:id(1)}));
 assert.throws(()=>f.dto.decodeKeptPayContext({...context(),cut_id:id(99)},{work_event_id:id(1)}));
});
test('unknown, duplicate-key, oversized or wrong-actor ACK retains the original request',async()=>{
 for(const mode of ['duplicate','large','actor','extra']){const f=fixture({send:body=>{if(body.action==='KEEP_AS_PAID_CONTEXT')return Response.json(context());const r=receipt(body.payload);return mode==='duplicate'?new Response(JSON.stringify(r).replace('"ok":true','"ok":true,"ok":true')):mode==='large'?new Response('x'.repeat(131073)):Response.json(mode==='actor'?{...r,actor_user_id:id(99)}:{...r,raw_receipt:{}});}}),c=f.create();await c.load();await assert.rejects(c.save());assert.equal(f.saved.values.size,1);assert.equal(c.snapshot().receipt,null);}
});
test('discovery uses exact genuine current rows and never manufactures an available action from absence',()=>{
 const f=fixture(),row={work_event_id:id(1),candidate:'<b>worker</b>',work_date:'2026-10-17',start:'09:00',end:'17:00',break_minutes:30,context:context(),unavailable_reason:null};
 assert.match(f.api.renderRows([row],'SIMPLE_TIMESHEET'),/&lt;b&gt;worker&lt;\/b&gt;/);assert.match(f.api.renderRows([row],'SOURCE_WORKSPACE'),/data-kept-work-event/);assert.equal(f.api.renderRows([],'SOURCE_WORKSPACE'),'');assert.equal(f.api.renderRows([row],'BANKING'),'');
 assert.throws(()=>f.api.discovery([row,row]));assert.throws(()=>f.api.discovery([{...row,context:null}]));assert.doesNotMatch(f.api.renderRows([{...row,context:null,unavailable_reason:{code:'CURRENT_SOURCE_CONTEXT_UNAVAILABLE',message:'The current Source context is not yet available. Refresh this shift before deciding.'}}],'SOURCE_WORKSPACE'),/data-kept-work-event/);
});
test('fresh response scope drift refuses before any journal or save',async()=>{
 const f=fixture({ctx:context({contract_id:id(99)})}),c=f.create();await assert.rejects(c.load());await assert.rejects(c.save());assert.equal(f.saved.values.size,0);assert.equal(f.calls.length,1);
});
