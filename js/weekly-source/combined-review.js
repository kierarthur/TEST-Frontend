(function initialise(root,factory){
  'use strict'; const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window==='object'&&root===window)Object.defineProperty(root,'CloudTMSCombinedReviewV1',{value:api});
})(typeof globalThis!=='undefined'?globalThis:this,function build(){
  'use strict';
  const e=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const a=value=>Array.isArray(value)?value:[];
  function render(model,state={}){
    if(model?.contract!=='WEEKLY_SOURCE_COMBINED_REVIEW_V1')return '<p role="status">Loading source work…</p>';
    const filters=state.filters||{},options=a(state.options||model.scope_options);
    const select=(label,key,id,name,all)=>{
      const values=new Map(options.map(item=>[item[id],item[name]]).filter(([value,label])=>value&&label));
      return `<label>${label}<select data-wsr-filter="${key}"><option value="">${all}</option>${[...values].sort((x,y)=>String(x[1]).localeCompare(String(y[1]),'en-GB')).map(([value,label])=>`<option value="${e(value)}"${filters[key]===value?' selected':''}>${e(label)}</option>`).join('')}</select></label>`;
    };
    const tabs=model.tab==='imports'?[['current','Current work'],['archive','Previous files']]:[['questions','Hours questions'],['checks','Office checks'],['protected','Protected shifts']];
    const columns=model.tab==='imports'
      ? [...(!filters.client_id?[['Client','client']]:[]),['File','file'],['Uploaded','uploaded'],['Coverage','coverage'],['Purpose','purpose_label'],['Status','status'],['Actions','actions']]
      : [...(!filters.client_id?[['Client','client']]:[]),['Candidate','candidate'],...(model.section==='questions'?[['Issues','issues'],['Candidate asked','candidate_asked'],['Manager informed','manager_informed']]:[['Day/date','day_date'],['Hours / break',model.section==='protected'?'protected_hours':'system_hours']]),['Status / problem','status'],['Actions','actions']];
    if(model.section==='questions')columns.unshift(['Select','selection']);
    const head=columns.map(([label,key])=>['client','candidate','day_date','status','file','uploaded'].includes(key)?`<th><button class="ws-sort" data-wsr-sort="${key}">${label}${model.sort_key===key?(model.sort_direction==='desc'?' ↓':' ↑'):''}</button></th>`:`<th>${label}</th>`).join('');
    const selected=state.selected||new Set();
    const rows=a(model.rows).map(row=>`<tr>${columns.map(([label,key])=>{
      if(key==='selection')return `<td data-label="Select"><input type="checkbox" data-wsr-select="${e(row.combined_key)}"${selected.has(row.combined_key)?' checked':''}${state.busy?' disabled':''} aria-label="Select ${e(row.candidate)}"></td>`;
      if(key==='actions')return `<td data-label="Actions" class="ws-actions">${a(row.actions).map((action,index)=>`<button class="btn btn-outline" data-wsr-row="${e(row.combined_key)}" data-wsr-action="${index}"${action.enabled===false?' disabled':''}>${e(action.label)}</button>`).join('')}${model.section==='questions'?`<button class="btn btn-outline" data-wsr-manage="${e(row.scope_key)}">Manage questions</button>`:''}</td>`;
      if(key==='status')return `<td data-label="${e(label)}"><span class="ws-status">${e(row.status?.text||'—')}</span>${row.problem?`<p>${e(row.problem)}</p>`:''}</td>`;
      if(key==='candidate_asked'||key==='manager_informed')return `<td data-label="${e(label)}">${row[key]===true?'Yes':'Not yet'}</td>`;
      if(key==='purpose_label')return `<td data-label="${e(label)}">${e(row.purpose_label||'Not recorded')}</td>`;
      return `<td data-label="${e(label)}">${e(row[key]??'—')}${key===(filters.client_id?'candidate':'client')?`<span class="ws-status-sub">${e(row.source)} · ${e(row.period)}</span>`:''}</td>`;
    }).join('')}</tr>${model.section==='questions'?`<tr><td colspan="${columns.length}"><details><summary>Shifts for ${e(row.candidate)}</summary><ul>${a(row.children).map((child,childIndex)=>`<li>${e(child.day_date)} · Candidate: ${e(child.candidate_hours||'Not submitted')} · Source: ${e(child.system_hours||'Not recorded')} · ${e(child.issue)}${a(child.actions).map((action,index)=>`<button class="btn btn-outline" data-wsr-row="${e(row.combined_key)}" data-wsr-child="${childIndex}" data-wsr-action="${index}"${action.enabled===false?' disabled':''}>${e(action.label)}</button>`).join('')}</li>`).join('')}</ul></details></td></tr>`:''}`).join('');
    const outreach=model.section==='questions'?`<div class="ws-toolbar"><span>${selected.size} selected</span><button class="btn btn-outline" data-wsr-outreach="ASK_CANDIDATES"${!selected.size||state.busy?' disabled':''}>Ask selected candidates</button><button class="btn btn-outline" data-wsr-outreach="SEND_MANAGER_NOW"${!selected.size||state.busy?' disabled':''}>Send selected to manager now</button></div>`:'';
    const add=model.tab==='queries'&&a(model.owners).some(owner=>owner.protected_pay_enabled)?'<button class="btn btn-outline" data-wsr-add-protected>Add protected shift</button>':'';
    return `<div class="ws-toolbar">${select('Source','source_group_id','source_group_id','source','All sources')}${select('Client','client_id','client_id','client','All clients')}${select('Period','week_ending','week_ending','period','All periods')}<button class="btn btn-outline" data-wsr-refresh>Refresh list</button>${add}</div><div class="ws-inner-tabs">${tabs.map(([key,label])=>`<button class="btn btn-outline${model.counts?.[key]?'':' ws-tab-empty'}" data-wsr-section="${key}" aria-selected="${model.section===key}">${label} (${Number(model.counts?.[key]||0)})</button>`).join('')}</div>${outreach}<div class="ws-scroll" data-wsr-table tabindex="0" aria-label="Source work. Type to jump in the sorted column."><table class="grid mini ws-grid"><thead><tr>${head}</tr></thead><tbody>${rows||`<tr><td colspan="${columns.length}">No matching work.</td></tr>`}</tbody></table>${model.has_more?'<button class="btn btn-outline" data-wsr-more>Load more</button>':''}</div>`;
  }
  return Object.freeze({render});
});
