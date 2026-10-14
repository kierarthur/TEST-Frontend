const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../../js/weekly-source/checklist.js');
const actor='11111111-1111-4111-8111-111111111111',group='22222222-2222-4222-8222-222222222222',client='33333333-3333-4333-8333-333333333333',cycle='44444444-4444-4444-8444-444444444444';
const scope={source_group_id:group,client_id:client,source_cycle_id:cycle,week_ending:'2026-10-04'};
const cell=value=>({value,status:{text:value?'Done':'To do',tone:'muted',subtext:'',subtone:'muted'},item_count:0,link:null});
const row=id=>({row_id:id,scope,client:'Same name',group:'HealthRoster',route:'AGENCY_INVOICE',checked:cell(false),completed:cell(false),pay_completed:cell(false),admin_actions:[]});
const item=id=>({item_id:id,scope,worker:'Same name',work_date:'2026-10-01',status:{text:'Awaiting Office authorisation',tone:'warning'},permitted_pay_subject:true,subject:'PAY',action:null});
function setup(count=500){let revision='a'.repeat(64),live=true;let rows=Array.from({length:count},(_,i)=>row(`row-${i}`));const items=new Map(),calls=[];
  const read=async request=>{calls.push({...request});const list=request.command==='CHECKLIST'?rows:(items.get(request.client_id)||[]);const start=request.cursor?Number(request.cursor.split(':')[1]):0;
    const records=list.slice(start,start+50),more=start+50<list.length;
    return {ok:true,contract:api.CONTRACT,command:request.command,actor_user_id:actor,permission_view:'ADMIN',binding:'b'.repeat(64),read_revision:revision,rows:request.command==='CHECKLIST'?records:[],items:request.command==='CHECKLIST_ISSUES'?records:[],has_more:more,next_cursor:more?`cursor:${start+50}`:null,refresh_required:false,anchor:null};};
  const reader=api.create({actorId:actor,permissionView:'ADMIN',current:()=>live,read});
  return {reader,calls,items,setRows:value=>{rows=value;revision='c'.repeat(64);},stop:()=>{live=false;},read};
}
test('500 stable rows traverse actual controller with native cursors, no duplicate or offset',async()=>{
  const {reader,calls}=setup();await reader.load();while(reader.state.more)await reader.load(true);
  assert.equal(reader.state.rows.length,500);assert.equal(new Set(reader.state.rows.map(row=>row.row_id)).size,500);assert.equal(calls.length,10);
  assert.equal(calls[1].cursor,'cursor:50');assert.ok(calls.every(request=>request.limit===50&&!Object.hasOwn(request,'offset')));
  assert.match(reader.render(),/500 client-weeks/);assert.doesNotMatch(reader.render(),/first \d+ of|page number|>Next</i);
});
test('refresh discovers insertion before consumed cursor and closing old rows atomically',async()=>{
  const fixture=setup();await fixture.reader.load();await fixture.reader.load(true);
  fixture.reader.state.anchor='row-60';fixture.reader.state.scroll=712;
  const old=fixture.reader.state.rows.map(row=>row.row_id);
  fixture.setRows([row('new-before'),...Array.from({length:499},(_,i)=>row(`row-${i+1}`))]);
  await fixture.reader.refresh();assert.equal(fixture.reader.state.rows[0].row_id,'new-before');assert.ok(!fixture.reader.state.rows.some(row=>row.row_id==='row-0'));
  assert.ok(fixture.reader.state.rows.some(row=>row.row_id==='row-60'));assert.equal(fixture.reader.state.scroll,712);assert.equal(fixture.reader.state.more,true);
  assert.equal(fixture.calls[2].cursor,undefined);assert.ok(fixture.reader.state.rows.length>=old.length);
});
test('230 and 120 expansion items retain independent native cursor and loaded identity',async()=>{
  const fixture=setup(2),a=row('a'),b={...row('b'),scope:{...scope,client_id:'55555555-5555-4555-8555-555555555555'}};
  fixture.setRows([a,b]);fixture.items.set(client,Array.from({length:230},(_,i)=>item(`a-${i}`)));
  fixture.items.set(b.scope.client_id,Array.from({length:120},(_,i)=>({...item(`b-${i}`),scope:b.scope})));
  await fixture.reader.load();await fixture.reader.expand('a');await fixture.reader.expand('b');
  for(const id of ['a','b'])while(fixture.reader.state.expansions.get(id).more)await fixture.reader.expand(id,true);
  assert.equal(fixture.reader.state.expansions.get('a').items.length,230);assert.equal(fixture.reader.state.expansions.get('b').items.length,120);
  fixture.reader.state.expansions.get('a').scroll=83;await fixture.reader.refresh();assert.equal(fixture.reader.state.expansions.get('a').items.length,230);assert.equal(fixture.reader.state.expansions.get('a').scroll,83);
});
test('sort and filter changes invalidate expansions and all old cursors for all five sorts',async()=>{
  const fixture=setup(100);for(const sort of ['client','group','week_ending','checked','completed'])for(const direction of ['ASC','DESC']){
    await fixture.reader.reset({client_id:client},sort,direction);const request=fixture.calls.at(-1);assert.equal(request.sort,sort);assert.equal(request.direction,direction);assert.equal(request.cursor,undefined);assert.equal(fixture.reader.state.expansions.size,0);
  }
  assert.throws(()=>fixture.reader.reset({money:'1'}));assert.throws(()=>fixture.reader.reset({},'invoice'));
});
test('page rejects actor, permission, scope, duplicate identities, empty false-end and malformed hashes',()=>{
  const request={command:'CHECKLIST',client_id:client};const base={ok:true,contract:api.CONTRACT,command:request.command,actor_user_id:actor,permission_view:'ADMIN',binding:'b'.repeat(64),read_revision:'a'.repeat(64),rows:[row('one')],items:[],has_more:false,next_cursor:null,refresh_required:false,anchor:null};
  for(const mutate of [value=>value.actor_user_id='other',value=>value.permission_view='PAY_READONLY',value=>value.rows[0].scope.client_id='other',value=>value.rows.push({...value.rows[0]}),value=>{value.rows=[];value.has_more=true;value.next_cursor='next';},value=>value.binding=['b'.repeat(64)],value=>value.refresh_required=true,value=>value.private_money='1']){
    const value=structuredClone(base);mutate(value);assert.throws(()=>api.page(value,request,actor,'ADMIN'));
  }
});
test('PAY rows and items are text-only with Checked dash and native prior filtering',()=>{
  const value={ok:true,contract:api.CONTRACT,command:'CHECKLIST',actor_user_id:actor,permission_view:'PAY_READONLY',binding:'b'.repeat(64),read_revision:'a'.repeat(64),rows:[{...row('pay'),checked:cell(null)}],items:[],has_more:false,next_cursor:null,refresh_required:false,anchor:null};
  assert.equal(api.page(value,{command:'CHECKLIST'},actor,'PAY_READONLY').rows[0].checked.value,null);
  value.rows[0].completed.link={label:'Forbidden',native_allowed:true};assert.throws(()=>api.page(value,{command:'CHECKLIST'},actor,'PAY_READONLY'));
  value.rows=[];value.command='CHECKLIST_ISSUES';value.items=[{...item('invoice'),subject:'INVOICE_ONLY'}];assert.throws(()=>api.page(value,{command:value.command},actor,'PAY_READONLY'));
});
test('native revision change does not append stale rows or publish partial prefix refresh',async()=>{
  const fixture=setup(150);await fixture.reader.load();const ids=fixture.reader.state.rows.map(row=>row.row_id);
  fixture.setRows(Array.from({length:150},(_,i)=>row(`different-${i}`)));await fixture.reader.load(true);
  assert.deepEqual(fixture.reader.state.rows.map(row=>row.row_id),ids);assert.match(fixture.reader.state.error,/Recheck/);assert.equal(fixture.reader.state.more,true);
});
test('actor change and disposal discard deferred responses without publishing rows',async()=>{
  for(const disposition of ['actor','dispose']){let finish,live=true;const reader=api.create({actorId:actor,permissionView:'ADMIN',current:()=>live,read:()=>new Promise(resolve=>{finish=resolve;})});
    const pending=reader.load();if(disposition==='actor')live=false;else reader.dispose();finish(await setup(1).read({command:'CHECKLIST'}));await pending;assert.equal(reader.state.rows.length,0);}
});
test('native labels are escaped; main cells stay binary and stage grey',async()=>{
  const fixture=setup(1);const raw=row('x');raw.client='<script>evil</script>';raw.checked.status.text='Pay pending';fixture.setRows([raw]);await fixture.reader.load();
  const html=fixture.reader.render();assert.match(html,/&lt;script&gt;evil/);assert.doesNotMatch(html,/<script>/);assert.match(html,/ws-tick--fail/);assert.match(html,/ws-checklist-stage/);assert.doesNotMatch(html,/ws-status--warning/);
});

test('main and two expansions have independent observer roots; collapse and disposal block queued callbacks',async()=>{
  const prior=global.IntersectionObserver,observers=[];
  class Observer{constructor(callback,options){this.callback=callback;this.root=options.root;this.disconnected=false;observers.push(this);}observe(element){this.element=element;}disconnect(){this.disconnected=true;}}
  global.IntersectionObserver=Observer;
  try{
    const fixture=setup(100);fixture.items.set(client,Array.from({length:120},(_,i)=>item(`i-${i}`)));await fixture.reader.load();await fixture.reader.expand('row-0');await fixture.reader.expand('row-1');
    function list(id){return {dataset:id?{wsChecklistItems:id}:{},scrollTop:0,addEventListener(){},querySelector:()=>({}),querySelectorAll:()=>[]};}
    const main=list(),a=list('row-0'),b=list('row-1');
    const host={querySelector:selector=>selector==='[data-ws-scroll]'?main:selector==='[data-ws-sentinel]'?{}:null,querySelectorAll:selector=>selector==='[data-ws-checklist-items]'?[a,b]:[]};
    fixture.reader.bind(host);assert.deepEqual(observers.map(observer=>observer.root),[main,a,b]);
    const calls=fixture.calls.length;await fixture.reader.expand('row-0');assert.equal(observers[1].disconnected,true);assert.equal(observers[0].disconnected,false);assert.equal(observers[2].disconnected,false);
    observers[1].callback([{isIntersecting:true}]);assert.equal(fixture.calls.length,calls);
    fixture.reader.dispose();assert.ok(observers.every(observer=>observer.disconnected));for(const observer of observers)observer.callback([{isIntersecting:true}]);assert.equal(fixture.calls.length,calls);
    assert.doesNotMatch(fixture.reader.render(),/>Load more</);
  }finally{if(prior===undefined)delete global.IntersectionObserver;else global.IntersectionObserver=prior;}
});

test('different native revisions within a refreshed consumed range never replace the original cache',async()=>{
  const fixture=setup(150);let changeDuringRefresh=false;
  const reader=api.create({actorId:actor,permissionView:'ADMIN',current:()=>true,read:async request=>{
    const value=await fixture.read(request);if(changeDuringRefresh&&!request.cursor){changeDuringRefresh=false;fixture.setRows(Array.from({length:150},(_,i)=>row(`changed-${i}`)));}return value;
  }});
  await reader.load();while(reader.state.more)await reader.load(true);const before=reader.state.rows.map(row=>row.row_id);changeDuringRefresh=true;
  await reader.refresh();assert.deepEqual(reader.state.rows.map(row=>row.row_id),before);assert.match(reader.state.error,/Recheck/);assert.equal(reader.state.revision,'a'.repeat(64));
});

test('append from duplicate native identities refuses rather than masking overlap after pagination',async()=>{
  const fixture=setup(100);const reader=api.create({actorId:actor,permissionView:'ADMIN',current:()=>true,read:async request=>{const value=await fixture.read(request);if(request.cursor)value.rows[0]=row('row-0');return value;}});
  await reader.load();await reader.load(true);assert.equal(reader.state.rows.length,50);assert.equal(reader.state.more,true);assert.match(reader.state.error,/Recheck/);
});

test('main append completion cannot clear or duplicate an independent expansion append',async()=>{
  const fixture=setup(100);fixture.items.set(client,Array.from({length:120},(_,i)=>item(`i-${i}`)));let release;
  const reader=api.create({actorId:actor,permissionView:'ADMIN',current:()=>true,read:request=>request.command==='CHECKLIST_ISSUES'&&request.cursor
    ?new Promise(resolve=>{release=async()=>resolve(await fixture.read(request));}):fixture.read(request)});
  await reader.load();await reader.expand('row-0');const pending=reader.expand('row-0',true);await reader.load(true);
  assert.equal(reader.state.expansions.get('row-0').busy,true);const before=fixture.calls.length;await reader.expand('row-0',true);assert.equal(fixture.calls.length,before);
  await release();await pending;assert.equal(reader.state.expansions.get('row-0').items.length,100);assert.equal(reader.state.error,'');assert.equal(reader.state.expansions.get('row-0').error,'');
});
test('one expansion completion owns only its own busy flag while a sibling append remains pending',async()=>{
  const fixture=setup(2);fixture.items.set(client,Array.from({length:120},(_,i)=>item(`i-${i}`)));const releases=[];
  const reader=api.create({actorId:actor,permissionView:'ADMIN',current:()=>true,read:request=>request.command==='CHECKLIST_ISSUES'&&request.cursor
    ?new Promise(resolve=>{releases.push(async()=>resolve(await fixture.read(request)));}):fixture.read(request)});
  await reader.load();await reader.expand('row-0');await reader.expand('row-1');const a=reader.expand('row-0',true),b=reader.expand('row-1',true);
  await releases[0]();await a;assert.equal(reader.state.expansions.get('row-0').busy,false);assert.equal(reader.state.expansions.get('row-1').busy,true);
  await reader.expand('row-1',true);assert.equal(releases.length,2);await releases[1]();await b;assert.equal(reader.state.expansions.get('row-1').items.length,100);assert.equal(reader.state.error,'');
});

test('removed visible row uses the nearest prior-order survivor with following tie preference',async()=>{
 for(const kept of [['row-0','row-1','row-3','row-4'],['row-0','row-1','row-4'],['new'],[]]){const f=setup(5);await f.reader.load();f.reader.state.anchor='row-2';f.reader.state.anchorOffset=-7;f.reader.state.scroll=80;f.setRows(kept.map(row));await f.reader.refresh();assert.equal(f.reader.state.anchor,kept.includes('row-3')?'row-3':kept.includes('row-1')?'row-1':kept[0]??null);assert.equal(f.reader.state.scroll,80);assert.equal(f.reader.state.anchorOffset,-7);assert.equal(f.reader.state.error,'');}
});
test('removed item selects its nearest survivor without moving another expansion anchor',async()=>{
 const f=setup(2),a=row('a'),b={...row('b'),scope:{...scope,client_id:'55555555-5555-4555-8555-555555555555'}};f.setRows([a,b]);f.items.set(client,Array.from({length:60},(_,i)=>item('a-'+i)));f.items.set(b.scope.client_id,Array.from({length:60},(_,i)=>({...item('b-'+i),scope:b.scope})));await f.reader.load();await f.reader.expand('a');await f.reader.expand('b');const ea=f.reader.state.expansions.get('a'),eb=f.reader.state.expansions.get('b');ea.anchor='a-20';ea.anchorOffset=-3;ea.scroll=70;eb.anchor='b-30';eb.anchorOffset=4;eb.scroll=130;f.items.set(client,Array.from({length:60},(_,i)=>item('a-'+i)).filter(i=>i.item_id!=='a-20'));f.setRows([a,b]);await f.reader.refresh();assert.equal(f.reader.state.expansions.get('a').anchor,'a-21');assert.equal(f.reader.state.expansions.get('b').anchor,'b-30');assert.equal(f.reader.state.expansions.get('a').scroll,70);assert.equal(f.reader.state.expansions.get('b').scroll,130);assert.equal(f.reader.state.expansions.get('a').anchorOffset,-3);assert.equal(f.reader.state.expansions.get('b').anchorOffset,4);assert.equal(f.reader.state.error,'');
});
