(function initialise(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window === 'object' && root === window) Object.defineProperty(root, 'CloudTMSCombinedFinaliseV1', { value: api });
})(typeof globalThis !== 'undefined' ? globalThis : this, function build() {
  'use strict';
  const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const array = value => Array.isArray(value) ? value : [];
  function render(model, state = {}) {
    if (!model || model.contract !== 'WEEKLY_SOURCE_COMBINED_FINALISE_V1') return '<p role="status">Loading finalisation reports…</p>';
    const filters = state.filters || {}, selected = state.selected || new Set(), exclusions = state.exclusions || new Set();
    const scopes = array(model.scopes).filter(item=>!item.completed), options = array(state.options || model.scope_options);
    const select = (label, key, id, name, all) => {
      const unique = new Map(options.map(item => [String(item[id] || ''),String(item[name] || '')]).filter(([value,label]) => value && label));
      return `<label>${label}<select data-wsc-filter="${key}"><option value="">${all}</option>${[...unique].sort((a,b)=>a[1].localeCompare(b[1],'en-GB')).map(([value,label])=>`<option value="${escape(value)}"${filters[key]===value?' selected':''}>${escape(label)}</option>`).join('')}</select></label>`;
    };
    const context = `<div class="ws-toolbar">${select('Source','source_group_id','source_group_id','source','All sources')}${select('Client','client_id','client_id','client','All clients')}${select('Period','week_ending','week_ending','period','All outstanding periods')}<button class="btn btn-outline" data-wsc-refresh>Recheck</button></div>`;
    const date = value => { const d = new Date(value); return Number.isFinite(d.valueOf()) ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(d) : ''; };
    const deadlines = array(model.summary?.this_week_cutoffs).map(item=>`<span>${escape(item.source)}: ${escape(date(item.cutoff))} — ${item.passed?'passed':'not yet passed'}</span>`).join('<br>');
    const summaries = `${model.summary?.missing_previous_reports ? `<button class="btn btn-outline" data-wsc-progress="missing">${escape(model.summary.missing_previous_reports)} missing finalisation report${Number(model.summary.missing_previous_reports)===1?'':'s'} for previous weeks</button>`:''}${model.summary?.reports_awaiting_finalisation ? `<button class="btn btn-outline" data-wsc-progress="awaiting">${escape(model.summary.reports_awaiting_finalisation)} received report${Number(model.summary.reports_awaiting_finalisation)===1?'':'s'} awaiting finalisation</button>`:''}`;
    const tabs = ['ready','blocked'].map(key=>`<button class="btn btn-outline${model.counts?.[key]?'':' ws-tab-empty'}" data-wsc-list="${key}" aria-selected="${model.list===key && Number(model.counts?.[key]||0)>0}"${Number(model.counts?.[key]||0)>0?'':' disabled'}>${key[0].toUpperCase()+key.slice(1)} (${Number(model.counts?.[key]||0)})</button>`).join('');
    const eligible=item=>item.finalise_enabled===true&&Number(item.blocked_count)===0;
    const columns=[['Select','selection'],...(!filters.client_id?[['Client','client']]:[]),['Source','source'],['Period','period'],['Status','status'],['Action','action']];
    const sortKey=state.sort||model.sort_key||'client',direction=state.direction||model.sort_direction||'asc';
    const sortValue=item=>String(sortKey==='period'?item.week_ending||item.period:item[sortKey]||'');
    let reports=scopes.filter(item=>model.list==='ready'?eligible(item):model.list==='blocked'?!eligible(item):false)
      .sort((left,right)=>(direction==='desc'?-1:1)*sortValue(left).localeCompare(sortValue(right),'en-GB')||String(left.key).localeCompare(String(right.key)));
    const jump=state.seek?reports.findIndex(item=>sortValue(item).toLowerCase().startsWith(state.seek.toLowerCase())):-1;
    if(jump>0)reports=reports.slice(jump);
    const rows=reports.map(item=>`<tr>${columns.map(([label,key])=>{
      if(key==='selection')return `<td data-label="Select"><input type="checkbox" aria-label="Select ${escape(item.client)} ${escape(item.period)}" data-wsc-select="${escape(item.key)}"${selected.has(item.key)?' checked':''}${eligible(item)&&!state.batch?'':' disabled'}></td>`;
      if(key==='action')return `<td data-label="Action" class="ws-actions"><button class="btn btn-outline" data-wsc-open-report="${escape(item.key)}">Open</button></td>`;
      if(key==='status')return `<td data-label="Status">${eligible(item)?'Ready to finalise':Number(item.blocked_count)>0?`${Number(item.blocked_count)} blockers — not included`:'Not ready — open for details'}</td>`;
      return `<td data-label="${escape(label)}">${escape(item[key]||'—')}</td>`;
    }).join('')}</tr>${item.exclusion_confirmation?`<tr><td colspan="${columns.length}"><label class="ws-confirm"><input type="checkbox" data-wsc-exclude="${escape(item.key)}"${exclusions.has(item.key)?' checked':''}${state.batch?' disabled':''}>${escape(item.exclusion_confirmation)}</label><p>${array(item.excluded_rows).map(row=>escape(`${row.candidate} · ${row.day_date} · ${row.system_hours||'No confirmed hours'}`)).join('<br>')}</p></td></tr>`:''}`).join('');
    const head=columns.map(([label,key])=>['client','source','period'].includes(key)?`<th><button class="ws-sort" data-wsc-sort="${key}">${label}${sortKey===key?(direction==='desc'?' ↓':' ↑'):''}</button></th>`:`<th>${label}</th>`).join('');
    const finished = state.batch?.items.every(item=>['COMPLETE','SOURCE_COMPLETE_PAY_PENDING'].includes(item.state));
    const notStarted = state.batch?.items.every(item=>item.state==='READY');
    const obligations = `<details data-wsc-obligations><summary>Client and week progress${model.summary?.missing_previous_reports?' — missing reports need attention':''}</summary><ul>${array(model.obligations).map(item=>`<li><strong>${escape(item.client)} · ${escape(item.period)} · ${escape(item.source)}</strong><span> ${escape(item.progress?.status?.text||'Not finalised')}</span>${item.missing_previous_report?' — Finalisation report missing':''}${array(item.progress?.actions).filter(action=>action.label==='No shifts to import').map((action,index)=>`<button class="btn btn-outline" data-wsc-zero="${escape(item.key)}"${action.enabled===false?' disabled':''}>No shifts to import</button>`).join('')}<button class="btn btn-outline" data-wsc-open-report="${escape(item.key)}">Open period</button></li>`).join('')}</ul></details>`;
    const journal = state.batch ? `<section><h3>Finalisation review</h3><p>Only these reports will be submitted. Other clients and blocked reports are not included.</p><ul>${state.batch.items.map(item=>`<li>${escape(item.client)} · ${escape(item.period)} — ${escape({READY:'Ready for confirmation',RUNNING:'Finalising…',COMPLETE:'Complete',SOURCE_COMPLETE_PAY_PENDING:'Source complete; approved-hours follow-up needed',CHECK_REQUIRED:'Result needs checking'}[item.state])}${item.error?`<p>${escape(item.error)}</p>`:''}</li>`).join('')}</ul>${finished?'<button class="btn btn-outline" data-wsc-dismiss>Done</button>':`<button class="btn primary" data-wsc-run${state.batch.running?' disabled':''}>${state.batch.items.some(item=>item.state==='CHECK_REQUIRED')?'Check saved results':'Confirm finalisation'}</button>${notStarted&&!state.batch.running?'<button class="btn btn-outline" data-wsc-dismiss>Cancel review</button>':''}`}</section>`:'';
    return `${context}<div class="ws-notice"><strong>This week’s finalisation cutoff</strong><span>${deadlines||'No current cutoff for this selection.'}</span>${summaries}</div>${obligations}<div class="ws-inner-tabs">${tabs}</div><div class="ws-scroll" data-wsc-table tabindex="0" aria-label="Finalisation reports. Type to jump in the sorted column."><table class="grid mini ws-grid"><thead><tr>${head}</tr></thead><tbody>${rows||`<tr><td colspan="${columns.length}">No ${escape(model.list==='blocked'?'blocked':'ready')} reports for this selection.</td></tr>`}</tbody></table></div>${scopes.length?`<div class="ws-toolbar"><button class="btn btn-outline" data-wsc-select-all${state.batch||!scopes.some(eligible)?' disabled':''}>Select all eligible reports</button><button class="btn primary" data-wsc-review${!selected.size||state.batch?' disabled':''}>Review selected reports</button></div>`:''}${journal}${state.error?`<p role="alert">${escape(state.error)}</p>`:''}`;
  }
  return Object.freeze({render});
});
