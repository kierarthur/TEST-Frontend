(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window==='object'&&root===window&&!root.CloudTMSWeeklySourceChecklistV1)
    Object.defineProperty(root,'CloudTMSWeeklySourceChecklistV1',{value:api,enumerable:true});
})(typeof globalThis==='object'?globalThis:this,function(root){
  'use strict';
  const CONTRACT='WEEKLY_SOURCE_CHECKLIST_V1',SORTS=['client','group','week_ending','checked','completed'];
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const copy=value=>JSON.parse(JSON.stringify(value));
  const fail=()=>{const error=new Error('Checklist information has changed. Recheck before continuing.');error.code='WEEKLY_SOURCE_CHECKLIST_ANCHORED_REFRESH_REQUIRED';throw error;};
  const keys=(object,names)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).sort().join('|')===[...names].sort().join('|');
  const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
  const token=value=>typeof value==='string'&&value.length>0&&value.length<=4096&&!/[\x00-\x1f]/.test(value);
  const scopes=['source_group_id','client_id','source_cycle_id','week_ending'];
  function page(value,request,actor,view){
    if(!keys(value,['ok','contract','command','actor_user_id','permission_view','binding','read_revision','rows','items','has_more','next_cursor','refresh_required','anchor'])
      ||value.ok!==true||value.contract!==CONTRACT||value.actor_user_id!==actor||value.permission_view!==view
      ||value.command!==request.command||!hash(value.binding)||!hash(value.read_revision)||value.refresh_required!==false
      ||!Array.isArray(value.rows)||!Array.isArray(value.items)||value.rows.length>50||value.items.length>50
      ||typeof value.has_more!=='boolean'||(value.has_more?!token(value.next_cursor):value.next_cursor!==null)
      ||(value.anchor!==null&&!token(value.anchor))||new TextEncoder().encode(JSON.stringify(value)).byteLength>200000)fail();
    const rows=request.command==='CHECKLIST'?value.rows:value.items;
    if((request.command==='CHECKLIST'?value.items:value.rows).length||value.has_more&&!rows.length)fail();
    const ids=new Set();
    for(const row of rows){
      const id=request.command==='CHECKLIST'?row.row_id:row.item_id;
      if(typeof id!=='string'||!id||id.length>512||ids.has(id)||!keys(row.scope,scopes))fail();ids.add(id);
      if(scopes.some(key=>request[key]&&request[key]!==row.scope[key]))fail();
      if(request.command==='CHECKLIST'){
        if(typeof row.client!=='string'||typeof row.group!=='string'||!Array.isArray(row.admin_actions)
          ||![true,false].includes(row.completed?.value)||!(view==='PAY_READONLY'?row.checked?.value===null:[true,false].includes(row.checked?.value)))fail();
        if(view==='PAY_READONLY'&&(row.admin_actions.length||row.checked.link||row.completed.link||row.pay_completed?.link))fail();
      }else if(typeof row.worker!=='string'||typeof row.status?.text!=='string'||typeof row.work_date!=='string'
        ||(view==='PAY_READONLY'&&(row.action!==null||row.permitted_pay_subject!==true||row.subject==='INVOICE_ONLY')))fail();
    }
    return copy(value);
  }
  function create(options){
    if(typeof options.read!=='function'||typeof options.current!=='function'||!options.actorId||!['ADMIN','PAY_READONLY'].includes(options.permissionView))throw new Error('Checklist access is unavailable.');
    const state={rows:[],binding:null,revision:null,next:null,more:false,loaded:false,busy:false,refreshing:false,error:'',sort:'week_ending',direction:'DESC',filters:{},expansions:new Map(),scroll:0,anchor:null,anchorOffset:0};
    let generation=0,disposed=false,mainObserver=null,host=null;
    const current=()=>!disposed&&options.current()===true;
    const notify=()=>{if(current())options.changed?.();};
    function disconnect(){mainObserver?.disconnect();mainObserver=null;for(const entry of state.expansions.values()){entry.observer?.disconnect();entry.observer=null;}}
    function capture(){
      const list=host?.querySelector('[data-ws-scroll]');
      if(list){state.scroll=list.scrollTop;const bounds=list.getBoundingClientRect?.();
        if(bounds){const row=[...list.querySelectorAll('[data-ws-checklist-row]')].find(row=>row.getBoundingClientRect().bottom>bounds.top);state.anchor=row?.dataset.wsChecklistRow||null;state.anchorOffset=row?row.getBoundingClientRect().top-bounds.top:0;}}
      for(const [id,entry]of state.expansions){const list=[...(host?.querySelectorAll('[data-ws-checklist-items]')||[])].find(element=>element.dataset.wsChecklistItems===id);if(list){entry.scroll=list.scrollTop;const bounds=list.getBoundingClientRect?.();if(bounds){const row=[...list.querySelectorAll('[data-ws-checklist-item]')].find(row=>row.getBoundingClientRect().bottom>bounds.top);entry.anchor=row?.dataset.wsChecklistItem||null;entry.anchorOffset=row?row.getBoundingClientRect().top-bounds.top:0;}}}
    }
    const mainRequest=cursor=>({command:'CHECKLIST',...state.filters,sort:state.sort,direction:state.direction,limit:50,...(cursor?{cursor}:{})});
    const itemRequest=(row,cursor)=>({command:'CHECKLIST_ISSUES',...row.scope,sort:'worker',direction:'ASC',limit:50,...(cursor?{cursor}:{})});
    async function read(request,stamp){const result=await options.read(request);if(!current()||stamp!==generation)return null;return page(result,request,options.actorId,options.permissionView);}
    function appendRows(previous,incoming,key){const ids=new Set(previous.map(row=>row[key]));if(incoming.some(row=>ids.has(row[key])))fail();return [...previous,...incoming];}
    async function load(append=false){
      if(!current()||state.busy||(append&&(!state.more||!state.next||state.error)))return;
      capture();const stamp=generation;state.busy=true;state.error='';notify();
      try{const value=await read(mainRequest(append?state.next:null),stamp);if(!value)return;
        if(append&&(value.binding!==state.binding||value.read_revision!==state.revision))fail();
        state.rows=append?appendRows(state.rows,value.rows,'row_id'):value.rows;state.binding=value.binding;state.revision=value.read_revision;
        state.next=value.next_cursor;state.more=value.has_more;state.loaded=true;
      }catch(error){if(current()&&stamp===generation)state.error=error.code==='WEEKLY_SOURCE_CHECKLIST_ANCHORED_REFRESH_REQUIRED'?'Checklist information has changed. Recheck to keep your place.':'Checklist information could not be loaded. Try again.';}
      finally{if(stamp===generation){state.busy=false;notify();}}
    }
    function survivingAnchor(previous, rows, key, anchor) {
      if (!anchor) return null;
      const live = new Set(rows.map(row => row[key]));
      if (live.has(anchor)) return anchor;
      const index = previous.findIndex(row => row[key] === anchor);
      for (let distance = 1; index >= 0 && distance < previous.length; distance++) {
        const next = previous[index + distance]?.[key], before = previous[index - distance]?.[key];
        if (next && live.has(next)) return next;
        if (before && live.has(before)) return before;
      }
      return rows[0]?.[key] ?? null;
    }
    // Refresh every previously consumed prefix, plus the surviving visible
    // anchor. New rows before a consumed keyset are discovered from the origin.
    // Commit only one consistent native revision; never publish a partial reset.
    async function refreshPrefix(requestFor,previous,key,anchor,stamp){
      let rows=[],cursor=null,binding=null,revision=null,value;
      const cursors=new Set();
      for(let pages=0;pages<100;pages++){
        value=await read(requestFor(cursor),stamp);if(!value)return null;
        if(binding!==null&&(value.binding!==binding||value.read_revision!==revision))fail();
        binding=value.binding;revision=value.read_revision;
        rows=appendRows(rows,key==='row_id'?value.rows:value.items,key);
        if(!value.has_more||(rows.length>=previous.length&&(!anchor||rows.some(row=>row[key]===anchor))))return {rows,binding,revision,next:value.next_cursor,more:value.has_more,anchor:survivingAnchor(previous,rows,key,anchor)};
        if(cursors.has(value.next_cursor))fail();cursors.add(value.next_cursor);cursor=value.next_cursor;
      }fail();
    }
    async function refresh(){
      if(!current()||state.busy)return;capture();disconnect();const stamp=++generation;state.busy=true;state.refreshing=true;state.error='';notify();
      try{const fresh=await refreshPrefix(mainRequest,state.rows,'row_id',state.anchor,stamp);if(!fresh)return;
        const replacements=new Map();
        for(const [id,entry]of state.expansions){const row=fresh.rows.find(row=>row.row_id===id);if(!row)continue;
          const next=await refreshPrefix(cursor=>itemRequest(row,cursor),entry.items,'item_id',entry.anchor,stamp);if(!next)return;
          if(next.revision!==fresh.revision)fail();replacements.set(id,{...entry,...next,items:next.rows,observer:null,busy:false,error:''});}
        if(!current()||stamp!==generation)return;
        Object.assign(state,fresh,{expansions:replacements,loaded:true});
      }catch(error){if(current()&&stamp===generation)state.error='Checklist information has changed. Recheck to keep your place.';}
      finally{if(stamp===generation){state.busy=false;state.refreshing=false;for(const entry of state.expansions.values())entry.busy=false;notify();}}
    }
    async function expand(id,append=false){
      const row=state.rows.find(row=>row.row_id===id);if(!row||!current()||state.refreshing)return;
      let entry=state.expansions.get(id);
      if(!append&&entry){capture();entry.observer?.disconnect();state.expansions.delete(id);notify();return;}
      if(!entry){entry={items:[],binding:null,revision:null,next:null,more:false,busy:false,error:'',scroll:0,anchor:null,observer:null};state.expansions.set(id,entry);}
      if(entry.busy||(append&&(!entry.more||!entry.next||entry.error)))return;
      capture();const stamp=generation;entry.busy=true;entry.error='';notify();
      try{const value=await read(itemRequest(row,append?entry.next:null),stamp);if(!value||state.expansions.get(id)!==entry)return;
        if(value.read_revision!==state.revision||(append&&value.binding!==entry.binding))fail();
        entry.items=append?appendRows(entry.items,value.items,'item_id'):value.items;entry.binding=value.binding;entry.revision=value.read_revision;entry.next=value.next_cursor;entry.more=value.has_more;
      }catch(error){if(current()&&stamp===generation&&state.expansions.get(id)===entry){entry.error='These items have changed. Recheck the Checklist.';if(error.code==='WEEKLY_SOURCE_CHECKLIST_ANCHORED_REFRESH_REQUIRED')state.error='Checklist information has changed. Recheck to keep your place.';}}
      finally{if(stamp===generation&&state.expansions.get(id)===entry){entry.busy=false;notify();}}
    }
    function reset(filters={},sort=state.sort,direction=state.direction){
      if(!SORTS.includes(sort)||!['ASC','DESC'].includes(direction)||Object.keys(filters).some(key=>!scopes.includes(key)))throw new Error('Checklist filters are unavailable.');
      disconnect();generation++;Object.assign(state,{rows:[],binding:null,revision:null,next:null,more:false,loaded:false,busy:false,refreshing:false,error:'',sort,direction,filters:copy(filters),expansions:new Map(),scroll:0,anchor:null});return load();
    }
    const link=(action,key)=>action?`<button type="button" class="ws-checklist-link" data-ws-checklist-action="${escape(key)}">${escape(action.label)}</button>`:'';
    function cell(row,name){const value=row[name],symbol=value.value===null?'—':value.value?'✓':'✗';
      const expansion=name==='completed'&&['AGENCY_INVOICE','SIGNED_TIMESHEETS'].includes(row.route)
        ?`<button type="button" class="ws-checklist-expand" data-ws-checklist-expand="${escape(row.row_id)}" aria-expanded="${state.expansions.has(row.row_id)}">${symbol}</button>`
        :`<span class="ws-tick${value.value===false?' ws-tick--fail':''}">${symbol}</span>`;
      return `${expansion}<span class="ws-checklist-stage">${escape(value.status?.text)}${value.status?.subtext?` · ${escape(value.status.subtext)}`:''}</span>${value.link?link(value.link,`${row.row_id}:${name}`):''}`;}
    function render(){
      const rows=state.rows.map(row=>{const entry=state.expansions.get(row.row_id);
        const items=entry?.items.map(item=>`<tr data-ws-checklist-item="${escape(item.item_id)}"><td>${escape(item.worker)}</td><td>${escape(item.scope.week_ending)}</td><td><span class="ws-status ws-status--${escape(item.status.tone)}">${escape(item.status.text)}</span>${item.status.subtext?`<span class="ws-status-sub">${escape(item.status.subtext)}</span>`:''}</td><td>${link(item.action,`${row.row_id}:item:${item.item_id}`)}</td></tr>`).join('');
        return `<tr data-ws-checklist-row="${escape(row.row_id)}"><td data-label="Client"><button type="button" class="ws-checklist-expand" data-ws-checklist-expand="${escape(row.row_id)}" aria-expanded="${!!entry}">${escape(row.client)}</button></td><td data-label="Group">${escape(row.group)}</td><td data-label="Week ending">${escape(row.scope.week_ending)}</td><td data-label="Checked">${cell(row,'checked')}</td><td data-label="Completed">${cell(row,'completed')}<span class="ws-checklist-stage">${row.completed.item_count} items</span>${row.admin_actions.map((action,index)=>link(action,`${row.row_id}:admin:${index}`)).join('')}</td></tr>`
          +(entry?`<tr class="ws-expanded"><td colspan="5"><div class="ws-inner-scroll ws-checklist-items" data-ws-checklist-items="${escape(row.row_id)}"><table class="grid mini ws-inner-grid"><thead><tr><th>Worker</th><th>Week</th><th>Reason</th><th>Action</th></tr></thead><tbody>${items||'<tr><td colspan="4">No items to show.</td></tr>'}</tbody></table>${entry.busy?'<p role="status">Loading items…</p>':''}${entry.error?`<p role="alert">${escape(entry.error)}</p>`:''}${entry.more?`<div data-ws-checklist-item-sentinel="${escape(row.row_id)}"></div>${typeof root.IntersectionObserver!=='function'?`<button data-ws-checklist-item-more="${escape(row.row_id)}">Load more</button>`:''}`:''}</div></td></tr>`:'');}).join('');
      return `<div class="ws-toolbar"><button type="button" class="btn btn-outline" data-ws-checklist-refresh${state.busy?' disabled':''}>Recheck</button></div>${state.error?`<p role="alert">${escape(state.error)}</p>`:''}<div class="ws-scroll ws-checklist-scroll" data-ws-scroll><table class="grid mini ws-grid ws-checklist-grid"><thead><tr>${SORTS.map(sort=>`<th aria-sort="${sort===state.sort?(state.direction==='ASC'?'ascending':'descending'):'none'}"><button type="button" data-ws-checklist-sort="${sort}">${escape({client:'Client',group:'Group',week_ending:'Week ending',checked:'Checked',completed:'Completed'}[sort])} ↕</button></th>`).join('')}</tr></thead><tbody>${rows||(!state.busy?'<tr><td colspan="5">No client-weeks match these filters.</td></tr>':'')}</tbody></table>${state.busy?'<p role="status">Loading Checklist…</p>':''}${state.more?`<div data-ws-sentinel></div>${typeof root.IntersectionObserver!=='function'?'<button data-ws-checklist-more>Load more</button>':''}`:''}</div><div class="ws-sticky-footer"><span>${state.rows.length} client-weeks</span></div>`;
    }
    function restore(list,scroll,anchor,attribute,offset=0){
      list.scrollTop=scroll;if(!anchor||!list.getBoundingClientRect)return;
      const target=[...list.querySelectorAll(`[${attribute}]`)].find(row=>row.getAttribute(attribute)===anchor);
      if(target)list.scrollTop+=target.getBoundingClientRect().top-list.getBoundingClientRect().top-offset;
    }
    function bind(element){
      disconnect();host=element;if(!current())return;
      const list=host.querySelector('[data-ws-scroll]');if(list){restore(list,state.scroll,state.anchor,'data-ws-checklist-row',state.anchorOffset);list.addEventListener('scroll',capture,{passive:true});}
      const Observer=root.IntersectionObserver,stamp=generation,boundHost=host;
      if(typeof Observer==='function'&&state.more&&!state.error){const sentinel=host.querySelector('[data-ws-sentinel]');if(sentinel){const observer=new Observer(entries=>{if(current()&&host===boundHost&&mainObserver===observer&&stamp===generation&&entries.some(entry=>entry.isIntersecting))load(true);},{root:list,rootMargin:'160px'});mainObserver=observer;mainObserver.observe(sentinel);}}
      for(const [id,entry]of state.expansions){const inner=[...host.querySelectorAll('[data-ws-checklist-items]')].find(element=>element.dataset.wsChecklistItems===id);if(!inner)continue;restore(inner,entry.scroll,entry.anchor,'data-ws-checklist-item',entry.anchorOffset);inner.addEventListener('scroll',capture,{passive:true});
        const sentinel=inner.querySelector('[data-ws-checklist-item-sentinel]');if(typeof Observer==='function'&&sentinel&&!entry.error){const observer=new Observer(entries=>{if(current()&&host===boundHost&&entry.observer===observer&&stamp===generation&&state.expansions.get(id)===entry&&entries.some(entry=>entry.isIntersecting))expand(id,true);},{root:inner,rootMargin:'100px'});entry.observer=observer;entry.observer.observe(sentinel);}}
      host.querySelector('[data-ws-checklist-refresh]')?.addEventListener('click',refresh);
      host.querySelector('[data-ws-checklist-more]')?.addEventListener('click',()=>load(true));
      host.querySelectorAll('[data-ws-checklist-item-more]').forEach(button=>button.addEventListener('click',()=>expand(button.dataset.wsChecklistItemMore,true)));
      host.querySelectorAll('[data-ws-checklist-expand]').forEach(button=>button.addEventListener('click',()=>expand(button.dataset.wsChecklistExpand)));
      host.querySelectorAll('[data-ws-checklist-sort]').forEach(button=>button.addEventListener('click',()=>reset(state.filters,button.dataset.wsChecklistSort,state.sort===button.dataset.wsChecklistSort&&state.direction==='ASC'?'DESC':'ASC')));
      host.querySelectorAll('[data-ws-checklist-action]').forEach(button=>button.addEventListener('click',()=>{if(!current()||state.busy||state.error||options.permissionView!=='ADMIN')return;
        let action=null,row=null;for(const candidate of state.rows){for(const name of ['checked','completed'])if(button.dataset.wsChecklistAction===`${candidate.row_id}:${name}`){action=candidate[name].link;row=candidate;}
          candidate.admin_actions.forEach((value,index)=>{if(button.dataset.wsChecklistAction===`${candidate.row_id}:admin:${index}`){action=value;row=candidate;}});
          for(const item of state.expansions.get(candidate.row_id)?.items||[])if(button.dataset.wsChecklistAction===`${candidate.row_id}:item:${item.item_id}`){action=item.action;row=candidate;}}
        if(!action||action.native_allowed!==true)return;capture();disconnect();options.onAction?.(copy(action),copy(row));}));
    }
    return Object.freeze({state,load,refresh,expand,reset,render,bind,capture,suspend:()=>{capture();disconnect();},dispose:()=>{capture();disconnect();disposed=true;generation++;host=null;}});
  }
  return Object.freeze({CONTRACT,create,page});
});
