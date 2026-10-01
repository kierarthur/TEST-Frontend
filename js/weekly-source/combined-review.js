(function initialise(root,factory){
  'use strict'; const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window==='object'&&root===window)Object.defineProperty(root,'CloudTMSCombinedReviewV1',{value:api});
})(typeof globalThis!=='undefined'?globalThis:this,function build(){
  'use strict';
  const e=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const a=value=>Array.isArray(value)?value:[];
  function questionSummary(row){
    const children=a(row.children);
    const kinds=new Set(children.map(child=>({
      'Hours differ':'Mismatch','Missing or not yet authorised':'Missing',
      'Reference missing':'Reference','Not finalised':'Unfinalised','Timesheet missing':'Timesheet'
    })[child.issue]||'Review'));
    const problem=kinds.size>1?'Multiple':[...kinds][0]||'Review';
    const manager=children.filter(child=>child.manager_response);
    const candidate=children.filter(child=>child.candidate_response);
    const responseLabel=(rows,key)=>{
      const values=new Set(rows.map(child=>child[key]));
      const label=values.size===1?[...values][0]:'Mixed replies';
      return rows.length<children.length?`${rows.length}/${children.length} replied — ${label}`:label;
    };
    if(manager.length)return {problem,progress:'Manager: '+responseLabel(manager,'manager_response'),
      next:manager.length===children.length&&manager.every(child=>child.manager_response==='Reported a source correction')?'Import corrected hours':'Review manager reply'};
    if(candidate.length)return {problem,progress:'Candidate: '+responseLabel(candidate,'candidate_response'),
      next:candidate.some(child=>child.candidate_response==='My hours are correct')&&row.source_family==='NHSP'?'Review / query in NHSP':row.manager_informed?'Await manager reply':'Review response'};
    return {problem,progress:row.status?.text||'Needs review',
      next:row.manager_informed?'Await manager reply':row.candidate_asked?'Await candidate response':'Review contact status'};
  }
  function render(model,state={}){
    if(model?.contract==='WEEKLY_SOURCE_REPORT_HISTORY_V1')return renderHistory(model,state);
    if(model?.contract!=='WEEKLY_SOURCE_COMBINED_REVIEW_V1')return '<p role="status">Loading source work…</p>';
    const filters=state.filters||{},options=a(state.options||model.scope_options);
    const select=(label,key,id,name,all)=>{
      const values=new Map(options.map(item=>[item[id],item[name]]).filter(([value,label])=>value&&label));
      return `<label>${label}<select data-wsr-filter="${key}"><option value="">${all}</option>${[...values].sort((x,y)=>String(x[1]).localeCompare(String(y[1]),'en-GB')).map(([value,label])=>`<option value="${e(value)}"${filters[key]===value?' selected':''}>${e(label)}</option>`).join('')}</select></label>`;
    };
    const tabs=model.tab==='imports'?[]:[['questions','Hours questions'],['checks','Office checks'],['protected','Protected shifts']];
    const columns=model.tab==='imports'
      ? [...(!filters.client_id?[['Client','client']]:[]),['File','file'],['Uploaded','uploaded'],['Coverage','coverage'],['Purpose','purpose_label'],['Status','status'],['Actions','actions']]
      : [...(!filters.client_id?[['Client','client']]:[]),['Candidate','candidate'],...(model.section==='questions'?[['Problem','question_problem'],['Progress','question_progress'],['Next action','question_next']]:[['Day/date','day_date'],['Hours / break',model.section==='protected'?'protected_hours':'system_hours'],['Status / problem','status']]),['Actions','actions']];
    if(model.section==='questions')columns.unshift(['Select','selection']);
    const head=columns.map(([label,key])=>['client','candidate','day_date','status','file','uploaded'].includes(key)?`<th><button class="ws-sort" data-wsr-sort="${key}">${label}${model.sort_key===key?(model.sort_direction==='desc'?' ↓':' ↑'):''}</button></th>`:`<th>${label}</th>`).join('');
    const selected=state.selected||new Set();
    const actionButtons=(row,actions,childIndex,filter=()=>true)=>{
      const buttons=a(actions).map((action,index)=>filter(action)?`<button class="btn btn-outline" data-wsr-row="${e(row.combined_key)}"${childIndex===undefined?'':` data-wsr-child="${childIndex}"`} data-wsr-action="${index}"${action.enabled===false?' disabled':''}>${e(action.label)}</button>`:'').join('');
      const accept=row.accept_system_hours_action;
      const canAccept=childIndex!==undefined && accept?.enabled===true
        && a(accept.payload?.selection?.incident_ids).includes(row.children?.[childIndex]?.incident_id);
      return buttons+(canAccept?`<button class="btn btn-outline" data-wsr-row="${e(row.combined_key)}" data-wsr-accept-shift="${childIndex}"${state.busy?' disabled':''}>Accept system hours</button>`:'');
    };
    const rows=a(model.rows).map(row=>`<tr>${columns.map(([label,key])=>{
      if(key==='selection')return `<td data-label="Select"><input type="checkbox" data-wsr-select="${e(row.combined_key)}"${selected.has(row.combined_key)?' checked':''}${state.busy?' disabled':''} aria-label="Select ${e(row.candidate)}"></td>`;
      if(key.startsWith('question_'))return `<td data-label="${e(label)}">${e(questionSummary(row)[key.slice(9)])}</td>`;
      if(key==='actions')return `<td data-label="Actions" class="ws-actions">${row.follow_up_scope?`<button class="btn btn-outline" data-wsr-follow-up="${e(row.combined_key)}">Open</button>`:actionButtons(row,row.actions,undefined,action=>model.section!=='questions'||action.label==='Open')}</td>`;
      if(key==='status')return `<td data-label="${e(label)}"><span class="ws-status">${e(row.status?.text||'—')}</span>${row.problem?`<p>${e(row.problem)}</p>`:''}</td>`;
      if(key==='candidate_asked'||key==='manager_informed')return `<td data-label="${e(label)}">${row[key]===true?'Yes':'Not yet'}</td>`;
      if(key==='purpose_label')return `<td data-label="${e(label)}">${e(row.purpose_label||'Not recorded')}</td>`;
      return `<td data-label="${e(label)}">${e(row[key]??'—')}${key===(filters.client_id?'candidate':'client')?`<span class="ws-status-sub">${e(row.source)} · ${e(row.period)}</span>`:''}</td>`;
    }).join('')}</tr>${model.section==='questions'?`<tr class="ws-query-expansion"><td colspan="${columns.length}"><details><summary>Shifts for ${e(row.candidate)}</summary><div class="ws-query-contact-actions">${actionButtons(row,row.actions,undefined,action=>action.label!=='Open')}</div><table class="grid mini ws-query-shifts"><thead><tr><th>Day/date</th><th>Candidate hours</th><th>Client hours</th><th>Problem</th><th>Actions</th></tr></thead><tbody>${a(row.children).map((child,childIndex)=>`<tr><td data-label="Day/date">${e(child.day_date)}</td><td data-label="Candidate hours">${e(child.candidate_hours||'Not submitted')}</td><td data-label="Client hours">${e(child.system_hours||'Not recorded')}</td><td data-label="Problem">${e(child.issue)}</td><td data-label="Actions" class="ws-actions">${actionButtons(row,child.actions,childIndex)}</td></tr>`).join('')}</tbody></table></details></td></tr>`:''}`).join('');
    const outreach=model.section==='questions'?`<div class="ws-toolbar"><span>${selected.size} selected</span><button class="btn btn-outline" data-wsr-outreach="ASK_CANDIDATES"${!selected.size||state.busy?' disabled':''}>Ask selected candidates</button><button class="btn btn-outline" data-wsr-outreach="SEND_MANAGER_NOW"${!selected.size||state.busy?' disabled':''}>Send selected to manager now</button></div>`:'';
    const add=model.tab==='queries'&&a(model.owners).some(owner=>owner.protected_pay_enabled)?'<button class="btn btn-outline" data-wsr-add-protected>Add protected shift</button>':'';
    return `<div class="ws-toolbar">${select('Source','source_group_id','source_group_id','source','All sources')}${select('Client','client_id','client_id','client','All clients')}${select('Period','week_ending','week_ending','period','All periods')}<button class="btn btn-outline" data-wsr-refresh>Refresh list</button>${add}</div><div class="ws-inner-tabs">${tabs.map(([key,label])=>`<button class="btn btn-outline${model.counts?.[key]?'':' ws-tab-empty'}" data-wsr-section="${key}" aria-selected="${model.section===key}">${label} (${Number(model.counts?.[key]||0)})</button>`).join('')}</div>${outreach}<div class="ws-scroll" data-wsr-table tabindex="0" aria-label="Source work. Type to jump in the sorted column."><table class="grid mini ws-grid"><thead><tr>${head}</tr></thead><tbody>${rows||`<tr><td colspan="${columns.length}">No matching work.</td></tr>`}</tbody></table>${model.has_more?'<button class="btn btn-outline" data-wsr-more>Load more</button>':''}</div>`;
  }
  function renderHistory(model,state={}){
    const filters=state.filters||{}, options=a(state.options||model.scope_options);
    const select=(label,key,id,name,all)=>{
      const values=new Map(options.map(item=>[item[id],item[name]]).filter(([value,label])=>value&&label));
      return `<label>${label}<select data-wsr-filter="${key}"><option value="">${all}</option>${[...values].sort((left,right)=>key==='week_ending'?String(right[0]).localeCompare(String(left[0])):String(left[1]).localeCompare(String(right[1]),'en-GB')).map(([value,label])=>`<option value="${e(value)}"${filters[key]===value?' selected':''}>${e(label)}</option>`).join('')}</select></label>`;
    };
    const columns=[...(!filters.client_id?[['Client','client']]:[]),['Source','source'],['Period','period'],['Report','report'],['Finalised','finalised_at'],['By','finalised_by'],['Action','action']];
    const rows=a(model.rows).map(row=>`<tr>${columns.map(([label,key])=>`<td data-label="${e(label)}">${key==='action'?`<button class="btn btn-outline" data-wsr-report="${e(row.report_key)}">View report</button>`:e(row[key]||'—')}${key==='report'&&row.revision_state==='SUPERSEDED'?'<span class="ws-status-sub">Earlier revision</span>':''}</td>`).join('')}</tr>`).join('');
    const detail=state.reportDetail;
    const money=value=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(value||0)/100);
    const detailView=detail?`<section class="ws-completed-report"><button class="btn btn-outline" data-wsr-close-report>Back to completed reports</button><h3>${e(detail.report.client)} · ${e(detail.report.report)}</h3><p>${e(detail.report.period)} · Finalised ${e(detail.report.finalised_at)} by ${e(detail.report.finalised_by)}</p>${detail.report.completion_kind==='NO_SHIFTS_TO_IMPORT'?`<p>No shifts to import</p><p>${e(detail.report.attestation||'')}</p>`:`<h4>Finalised shifts (${Number(detail.shift_count)})</h4><div class="ws-scroll" data-wsr-table><table class="grid mini"><thead><tr><th>Candidate</th><th>Day/date</th><th>Hours</th><th>Break</th><th>Net hours</th><th>Booking reference</th></tr></thead><tbody>${a(detail.shifts).map(row=>`<tr><td data-label="Candidate">${e(row.candidate)}</td><td data-label="Day/date">${e(row.day_date)}</td><td data-label="Hours">${e(row.start)}–${e(row.end)}</td><td data-label="Break">${Number(row.break_minutes)} min</td><td data-label="Net hours">${(Number(row.net_minutes)/60).toFixed(2)}</td><td data-label="Booking reference">${e(row.booking_reference||'—')}</td></tr>`).join('')}</tbody></table></div><h4>Invoice movements (${Number(detail.movement_count)})</h4><div class="ws-scroll" data-wsr-table><table class="grid mini"><thead><tr><th>Candidate</th><th>Day/date</th><th>Movement</th><th>Invoice charge</th></tr></thead><tbody>${a(detail.movements).map(row=>`<tr><td data-label="Candidate">${e(row.candidate)}</td><td data-label="Day/date">${e(row.day_date)}</td><td data-label="Movement">${e(row.movement)}</td><td data-label="Invoice charge">${e(money(row.invoice_charge_pence))}</td></tr>`).join('')}</tbody></table></div><p>Total invoice charge: ${e(money(detail.invoice_charge_pence))}</p>`}${detail.has_more?'<button class="btn btn-outline" data-wsr-report-more>Load more report details</button>':''}</section>`:'';
    const actions=detail?a(detail.actions).map((action,index)=>`<button class="btn btn-outline" data-wsr-report-action="${index}"${action.enabled===false?' disabled':''}>${e(action.label)}</button>`).join(''):'';
    return `${detailView?detailView+actions:`<div class="ws-toolbar">${select('Source','source_group_id','source_group_id','source','All sources')}${select('Client','client_id','client_id','client','All clients')}${select('Period','week_ending','week_ending','period','All completed periods')}<button class="btn btn-outline" data-wsr-refresh>Refresh list</button></div><div class="ws-scroll" data-wsr-table tabindex="0" aria-label="Completed reports. Type to jump in the sorted column."><table class="grid mini ws-grid"><thead><tr>${columns.map(([label,key])=>`<th>${['client','source','period','report','finalised_at'].includes(key)?`<button class="ws-sort" data-wsr-sort="${key}">${label}${model.sort_key===key?(model.sort_direction==='desc'?' ↓':' ↑'):''}</button>`:label}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${columns.length}">No completed reports for this selection.</td></tr>`}</tbody></table>${model.has_more?'<button class="btn btn-outline" data-wsr-more>Load more</button>':''}</div>`}`;
  }
  return Object.freeze({render,questionSummary,renderHistory});
});
