(function initialise(root,factory){
  'use strict'; const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window==='object'&&root===window)Object.defineProperty(root,'CloudTMSCombinedReviewV1',{value:api});
})(typeof globalThis!=='undefined'?globalThis:this,function build(){
  'use strict';
  const e=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const a=value=>Array.isArray(value)?value:[];
  function manualProblem(child){
    const query=child?.manual_query;
    if(child?.issue!=='Manually queried'||!query?.reason)return e(child?.issue||'Review');
    const full=String(query.reason).trim();
    const firstWords=full.split(/\s+/).slice(0,10).join(' ');
    const preview=firstWords.length>80?`${firstWords.slice(0,77).trimEnd()}…`:firstWords;
    const shortened=preview!==full?`${preview}${preview.endsWith('…')?'':'…'}`:preview;
    const by=String(query.opened_by||'Office user');
    const at=String(query.opened_at_uk||'').trim();
    const context=`${by} queried this${at?` on ${at}`:''} because “${full}”`;
    return `<span class="ws-query-problem"><strong>Manually queried</strong><small>${e(by)}${at?` · ${e(at)}`:''}</small><span class="ws-query-reason" tabindex="0" title="${e(context)}" aria-label="${e(context)}">“${e(shortened)}”</span></span>`;
  }
  function groupProblem(row,summary){
    const children=a(row.children), manual=children.filter(child=>child.issue==='Manually queried');
    if(manual.length===1&&children.length===1)return manualProblem(manual[0]);
    if(manual.length>1&&manual.length===children.length)return e(`Manual queries (${manual.length})`);
    return e(summary.problem);
  }
  function questionSummary(row){
    const children=a(row.children);
    const kinds=new Set(children.map(child=>({
      'Hours differ':'Mismatch','Missing or not yet authorised':'Missing',
      'Reference missing':'Reference','Not finalised':'Unfinalised','Timesheet missing':'Timesheet',
      'Manually queried':'Manually queried'
    })[child.issue]||'Review'));
    const problem=kinds.size>1?'Multiple':[...kinds][0]||'Review';
    const progress=(replyKey,contactKey,contacted,absent)=>{
      const values=[...new Set(children.map(child=>child[replyKey]||(child[contactKey]?contacted:absent)))];
      return values.length===1?values[0]:values.length>1?'Mixed progress':absent;
    };
    const oneTime=key=>{const values=[...new Set(children.map(child=>child[key]).filter(Boolean))];return values.length===1?values[0]:'';};
    const candidateReplyTime=oneTime('candidate_responded_at');
    const managerReplyTime=oneTime('manager_responded_at');
    const candidateContactTime=oneTime('candidate_contacted_at');
    const managerContactTime=oneTime('manager_contacted_at');
    const candidate=progress('candidate_response','candidate_contacted_at','Candidate contacted','Candidate not contacted');
    const manager=progress('manager_response','manager_contacted_at','Manager contacted','Manager not contacted');
    if(children.length&&children.every(child=>child.issue==='Timesheet missing'))return {
      problem:'Timesheet',candidate:'Timesheet not received',manager:'Not needed',
      next:row.candidate_app_available===false?'Check candidate contact':'Await Timesheet',
      candidateHint:'',managerHint:''
    };
    const disagree=children.some(child=>child.candidate_response==='My hours are correct'&&child.manager_response==='System hours are correct');
    const corrected=children.some(child=>child.manager_response==='Reported a source correction');
    const next=disagree?'Speak to candidate':corrected?'Import corrected source':problem==='Manually queried'?'Accept source or protect pay':
      children.some(child=>child.candidate_response==='My hours are correct')?(row.source_family==='NHSP'?'Query in NHSP':'Review response'):
      children.some(child=>child.manager_contacted_at)?'Await manager reply':
      children.some(child=>child.candidate_contacted_at)?'Await candidate reply':'Review contact status';
    return {problem,candidate,manager,next,
      candidateHint:candidateReplyTime?`Candidate responded ${candidateReplyTime} UK`:candidateContactTime?`Candidate contacted ${candidateContactTime} UK`:'',
      managerHint:managerReplyTime?`Manager responded ${managerReplyTime} UK`:managerContactTime?`Manager contacted ${managerContactTime} UK`:''};
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
      : [...(!filters.client_id?[['Client','client']]:[]),['Candidate','candidate'],...(model.section==='questions'?[['Problem','question_problem'],['Candidate','question_candidate'],['Manager','question_manager'],['Next action','question_next']]:[['Day/date','day_date'],['Hours / break',model.section==='protected'?'protected_hours':'system_hours'],['Status / problem','status']]),['Actions','actions']];
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
    const rows=a(model.rows).map(row=>`<tr class="${model.section==='questions'?(a(row.children).some(child=>child.issue!=='Timesheet missing')?'ws-query-hold':'ws-query-nonblocking'):model.section==='protected'?'ws-query-nonblocking':''}">${columns.map(([label,key])=>{
      if(key==='selection')return `<td data-label="Select"><input type="checkbox" data-wsr-select="${e(row.combined_key)}"${selected.has(row.combined_key)?' checked':''}${state.busy?' disabled':''} aria-label="Select ${e(row.candidate)}"></td>`;
      if(key.startsWith('question_')){const summary=questionSummary(row),part=key.slice(9),hint=summary[`${part}Hint`];return `<td data-label="${e(label)}"${hint?` title="${e(hint)}"`:''}>${part==='problem'?groupProblem(row,summary):e(summary[part])}</td>`;}
      if(key==='actions')return `<td data-label="Actions" class="ws-actions">${row.follow_up_scope?`<button class="btn btn-outline" data-wsr-follow-up="${e(row.combined_key)}">Open</button>`:actionButtons(row,row.actions,undefined,action=>model.section!=='questions'||action.label==='Open')}</td>`;
      if(key==='status')return `<td data-label="${e(label)}"><span class="ws-status">${e(row.status?.text||'—')}</span>${row.problem?`<p>${e(row.problem)}</p>`:''}</td>`;
      if(key==='candidate'&&model.section==='checks'){
        const sourceRef=String(row.source_reference||'').trim();
        const bookingRef=String(row.booking_reference||'').trim();
        const ids=[sourceRef&&sourceRef.toLocaleLowerCase('en-GB')!==String(row.candidate||'').trim().toLocaleLowerCase('en-GB')?`Source ref: ${e(sourceRef)}`:'',bookingRef?`Booking: ${e(bookingRef)}`:''].filter(Boolean);
        return `<td data-label="${e(label)}">${e(row.candidate||'—')}${ids.length?`<span class="ws-source-ids">${ids.join(' · ')}</span>`:''}</td>`;
      }
      if(key==='candidate_asked'||key==='manager_informed')return `<td data-label="${e(label)}">${row[key]===true?'Yes':'Not yet'}</td>`;
      if(key==='purpose_label')return `<td data-label="${e(label)}">${e(row.purpose_label||'Not recorded')}</td>`;
      return `<td data-label="${e(label)}">${e(row[key]??'—')}${key===(filters.client_id?'candidate':'client')?`<span class="ws-status-sub">${e(row.source)} · ${e(row.period)}</span>`:''}</td>`;
    }).join('')}</tr>${model.section==='questions'?`<tr class="ws-query-expansion"><td colspan="${columns.length}"><details><summary>Shifts for ${e(row.candidate)}</summary><div class="ws-query-contact-actions">${actionButtons(row,row.actions,undefined,action=>action.label!=='Open')}</div><table class="grid mini ws-query-shifts"><thead><tr><th>Day/date</th><th>Candidate hours</th><th>Client hours</th><th>Problem</th><th>Actions</th></tr></thead><tbody>${a(row.children).map((child,childIndex)=>`<tr class="${child.issue==='Timesheet missing'?'ws-query-nonblocking':'ws-query-hold'}"><td data-label="Day/date">${e(child.day_date)}</td><td data-label="Candidate hours">${e(child.candidate_hours||'Not submitted')}</td><td data-label="Client hours">${e(child.system_hours||'Not recorded')}</td><td data-label="Problem">${manualProblem(child)}</td><td data-label="Actions" class="ws-actions">${actionButtons(row,child.actions,childIndex)}</td></tr>`).join('')}</tbody></table></details></td></tr>`:''}`).join('');
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
    const shiftRows=a(detail?.shifts).map(row=>{
      const sourceCharges=row.source_shift_charge_pence==null?'—':
        `<details><summary>${e(money(row.source_shift_charge_pence))}</summary><span>Cost ${e(money(row.source_total_cost_pence))} · Commission ${e(money(row.source_commission_pence))} · Charge ${e(money(row.source_shift_charge_pence))}</span></details>`;
      return `<tr><td data-label="Candidate">${e(row.candidate)}</td><td data-label="Day/date">${e(row.day_date)}</td><td data-label="Hours">${e(row.start)}–${e(row.end)}</td><td data-label="Break">${Number(row.break_minutes)} min</td><td data-label="Net hours">${(Number(row.net_minutes)/60).toFixed(2)}</td><td data-label="Booking reference">${e(row.booking_reference||'—')}</td><td data-label="Source charges">${sourceCharges}</td><td data-label="Action">${row.source_row_id?`<button class="btn btn-outline" data-wsr-manual-review="${e(row.source_row_id)}">Send back to Queries</button>`:''}</td></tr>`;
    }).join('');
    const movementRows=a(detail?.movements).map(row=>`<tr><td data-label="Candidate">${e(row.candidate)}</td><td data-label="Day/date">${e(row.day_date)}</td><td data-label="Booking reference">${e(row.booking_reference||'—')}</td><td data-label="Movement">${e(row.movement)}</td><td data-label="Pay ex VAT">${e(money(row.pay_ex_vat_pence))}</td><td data-label="Invoice charge">${e(money(row.invoice_charge_pence))}</td><td data-label="VAT">${e(money(row.vat_pence))}</td><td data-label="Invoice total">${e(money(row.total_inc_vat_pence))}</td></tr>`).join('');
    const detailView=detail?`<section class="ws-completed-report"><button class="btn btn-outline" data-wsr-close-report>Back to completed reports</button><h3>${e(detail.report.client)} · ${e(detail.report.report)}</h3><p>${e(detail.report.period)} · Finalised ${e(detail.report.finalised_at)} by ${e(detail.report.finalised_by)}</p>${detail.report.completion_kind==='NO_SHIFTS_TO_IMPORT'?`<p>No shifts to import</p><p>${e(detail.report.attestation||'')}</p>`:`<h4>Finalised shifts (${Number(detail.shift_count)})</h4><div class="ws-scroll" data-wsr-table><table class="grid mini"><thead><tr><th>Candidate</th><th>Day/date</th><th>Hours</th><th>Break</th><th>Net hours</th><th>Booking reference</th><th>Source charges</th><th>Action</th></tr></thead><tbody>${shiftRows}</tbody></table></div><h4>Invoice movements (${Number(detail.movement_count)})</h4><div class="ws-scroll" data-wsr-table><table class="grid mini"><thead><tr><th>Candidate</th><th>Day/date</th><th>Booking reference</th><th>Movement</th><th>Pay ex VAT</th><th>Invoice charge</th><th>VAT</th><th>Invoice total</th></tr></thead><tbody>${movementRows}</tbody></table></div><p>Total invoice charge: ${e(money(detail.invoice_charge_pence))}</p>`}${detail.has_more?'<button class="btn btn-outline" data-wsr-report-more>Load more report details</button>':''}</section>`:'';
    const actions=detail?a(detail.actions).map((action,index)=>`<button class="btn btn-outline" data-wsr-report-action="${index}"${action.enabled===false?' disabled':''}>${e(action.label)}</button>`).join(''):'';
    return `${detailView?detailView+actions:`<div class="ws-toolbar">${select('Source','source_group_id','source_group_id','source','All sources')}${select('Client','client_id','client_id','client','All clients')}${select('Period','week_ending','week_ending','period','All completed periods')}<label>Finalised from<input type="date" data-wsr-filter="date_from" value="${e(filters.date_from||'')}"></label><label>To<input type="date" data-wsr-filter="date_to" value="${e(filters.date_to||'')}"></label><button class="btn btn-outline" data-wsr-refresh>Refresh list</button></div><div class="ws-scroll" data-wsr-table tabindex="0" aria-label="Completed reports. Type to jump in the sorted column."><table class="grid mini ws-grid"><thead><tr>${columns.map(([label,key])=>`<th>${['client','source','period','report','finalised_at'].includes(key)?`<button class="ws-sort" data-wsr-sort="${key}">${label}${model.sort_key===key?(model.sort_direction==='desc'?' ↓':' ↑'):''}</button>`:label}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${columns.length}">No completed reports for this selection.</td></tr>`}</tbody></table>${model.has_more?'<button class="btn btn-outline" data-wsr-more>Load more</button>':''}</div>`}`;
  }
  return Object.freeze({render,questionSummary,renderHistory});
});
