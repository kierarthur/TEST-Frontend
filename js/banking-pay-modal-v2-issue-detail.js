/* Bounded Action Required / Blocked detail presentation. The complete payment
 * payloads and action metadata come from the server. Existing Banking Pay
 * renderers and delegated action owners are reused; this file creates no new
 * financial rule, selection owner or action implementation.
 */
(function(root){
  'use strict';
  const local=typeof module==='object'&&module.exports;
  const issues=local?require('./banking-pay-modal-v2-issues.js'):root.CloudTMSBankingPayIssuesV2;
  const details=local?require('./banking-pay-modal-v2-details-legacy.js'):root.CloudTMSBankingPayLegacyDetailsV2;
  const fields=['session_id','session_version','progress_counter_version','scope_hash'];
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function fail(){const error=new Error('BANKING_PAY_V2_INVALID_RESPONSE');error.code=error.message;throw error;}
  const caseResolutionAction=Object.freeze({
    BUCKETED:'banking:pay:openBucketedResolution',
    NON_BUCKET:'banking:pay:openNonBucketResolution',
    TAXABLE_CHANNEL_RESTRUCTURE:'banking:pay:openTaxableFinanceCaseRestructure'
  });
  const caseActions=new Set([...Object.values(caseResolutionAction),'banking:pay:toggleExcludeTimesheet']);
  const componentActions=new Set(['banking:pay:componentUseSuggested','banking:pay:componentManualRate',
    'banking:pay:componentManualAmount','banking:pay:componentClearResolution']);
  const text=value=>String(value??'').trim();
  const upper=value=>text(value).toUpperCase();
  const firstText=(...values)=>values.map(text).find(Boolean)||'';
  const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))
    ?`${text(value).slice(8,10)}/${text(value).slice(5,7)}/${text(value).slice(0,4)}`:'';
  const friendlyType=value=>text(value||'Payment').replace(/_/g,' ').toLowerCase().replace(/(^|\s)\S/g,letter=>letter.toUpperCase());
  const payMethod=value=>['PAYE','UMBRELLA'].includes(upper(value))?upper(value):'';
  function exactActions(meta,allowed){
    if(!Array.isArray(meta?.actions))fail();
    const actions=meta.actions.map(value=>String(value||''));
    if(actions.some(action=>!action||!allowed.has(action))||new Set(actions).size!==actions.length)fail();
    return actions;
  }
  function renderedActions(html){return [...String(html||'').matchAll(/data-action="([^"]+)"/g)].map(match=>match[1]);}
  function sameActions(actual,expected){
    return actual.length===expected.length&&actual.every((action,index)=>action===expected[index]);
  }
  function payload(row){
    if(!object(row)||!object(row.payload)||!object(row.task_meta))fail();
    return {...row.payload,...(object(row.bank_row)?row.bank_row:{}),candidate_id:row.candidate_id,
      preview_row_id:row.preview_row_id,context_only:row.context_only,task_meta:row.task_meta};
  }
  function context(page,adapters,openKeys){
    if(!object(adapters)||typeof adapters.formatIsoToUk!=='function')throw new TypeError('Issue detail adapters required');
    const values=page.rows.map(payload);
    const ready=values.filter(row=>String(row.effective_section||row.presentation_section||'').toUpperCase()==='CANONICAL_PREVIEW_LINES');
    const blocked=values.filter(row=>!ready.includes(row));
    const candidateMeta=new Map();
    for(const row of values){
      const id=String(row.candidate_id||'');
      if(!id||candidateMeta.has(id))continue;
      candidateMeta.set(id,{candidate_id:id,display_name:String(row.candidate_name||row.display_name||''),
        tms_ref:String(row.candidate_reference||row.tms_ref||''),current_pay_method:String(row.pay_channel||'')});
    }
    return {
      blockedPreviewLines:blocked,candidateMetaById:candidateMeta,candidateRefreshStateById:new Map(),
      canonicalPreviewLines:values,enc:esc,failedCandidateIds:[],failedCandidateRowById:new Map(),failedCandidateStateById:new Map(),
      formatIsoToUk:adapters.formatIsoToUk,getBankingPayAdoptedPreviewRowSectionV1:row=>String(row?.effective_section||row?.presentation_section||''),
      getCurrentWorkbenchSessionId:()=>page.session_id,getCurrentWorkbenchSessionVersion:()=>page.session_version,
      hiddenPreviewLines:[],openReadyTimesheetBreakdownKeys:openKeys,pendingCandidateIds:[],pendingCandidateJobById:new Map(),
      pendingCandidateRowById:new Map(),railEnv:String(adapters.railEnv||''),railProvider:String(adapters.railProvider||''),
      readyPreviewLines:ready,selectedPreviewRowSet:new Set(values.filter(row=>row.selected===true).map(row=>String(row.preview_row_id||'')).filter(Boolean))
    };
  }
  function sourceCard(row){
    const data=payload(row),meta=row.task_meta;
    const name=String(data.candidate_name||data.display_name||'Candidate');
    const ref=String(data.candidate_reference||data.tms_ref||'');
    const title=String(meta.title||'Payment preview needs refreshing.');
    const action=String(meta.action||'');
    return `<article class="card bpv2-source-detail" data-bpv2-detail-member="${esc(row.identity)}">
      <div><strong>${esc(name)}</strong>${ref?`<span class="mini">${esc(ref)}</span>`:''}</div>
      <p>${esc(title)}</p>${action?`<button type="button" class="btn btn-outline" data-action="${esc(action)}">Refresh Banking Pay</button>`:''}
    </article>`;
  }
  function financeTask(row,data,renderer){
    const meta=row.task_meta,family=String(meta.family||'').toUpperCase();
    if(family==='FINANCE_CASE'){
      const expected=exactActions(meta,caseActions);
      const resolutionFamily=String(meta.resolution_family||data.resolution_family||'').toUpperCase();
      const expectedResolution=caseResolutionAction[resolutionFamily];
      if(!expectedResolution||!expected.includes(expectedResolution))fail();
      const entry={...data,candidate_id:String(row.candidate_id||data.candidate_id||''),
        case_key:String(meta.case_key||data.case_key||''),finance_case_id:String(meta.finance_case_id||data.finance_case_id||''),
        linked_timesheet_id:String(meta.linked_timesheet_id||data.linked_timesheet_id||data.timesheet_id||''),
        resolution_family:resolutionFamily,
        excluded_from_run:data.excluded_from_run===true||data.exclude_from_run===true};
      if(!entry.candidate_id||(!entry.case_key&&!entry.finance_case_id))fail();
      const actionHtml=renderer.renderCaseActionButtons(entry);
      if(!sameActions(renderedActions(actionHtml),expected))fail();
      return {data:{...data,__case_entry:entry},resolutionHtml:''};
    }
    if(family==='FINANCE_COMPONENT'){
      const expected=exactActions(meta,componentActions),component=meta.component;
      if(!object(component)||!expected.length)fail();
      const entry={...data,candidate_id:String(row.candidate_id||data.candidate_id||''),
        case_key:String(meta.case_key||data.case_key||''),finance_case_id:String(meta.finance_case_id||data.finance_case_id||''),
        linked_timesheet_id:String(meta.linked_timesheet_id||data.linked_timesheet_id||data.timesheet_id||''),
        resolution_family:String(meta.resolution_family||data.resolution_family||'').toUpperCase(),components:[component]};
      if(!entry.candidate_id||(!entry.case_key&&!entry.finance_case_id))fail();
      const componentHtml=renderer.renderComponentRows(entry);
      if(!sameActions(renderedActions(componentHtml),expected))fail();
      return {data,resolutionHtml:`<section class="bpv2-resolution-panel" data-bpv2-detail-member="${esc(row.identity)}">
        <div class="bpv2-resolution-panel-heading"><span class="bpv2-resolution-badge">Rate decision required</span>
          <strong>Choose how this rate should be handled.</strong></div>${componentHtml}</section>`};
    }
    return {data,resolutionHtml:''};
  }
  function render(page,summary,kind,adapters,openKeys){
    issues.validateDetail(page,summary,kind,page[kind==='actions'?'task_key':'blocker_key'],undefined,100);
    const renderer=details.create(context(page,adapters,openKeys));
    const prepared=page.rows.filter(row=>row.source_kind!=='SOURCE_PROGRESS')
      .map(row=>financeTask(row,payload(row),renderer));
    const paymentRows=prepared.map(item=>item.data);
    const timesheets=paymentRows.filter(row=>String(row.line_type||'').toUpperCase()==='TIMESHEET_PAYMENT');
    const other=paymentRows.filter(row=>String(row.line_type||'').toUpperCase()!=='TIMESHEET_PAYMENT');
    const section=kind==='actions'?'CASES_RESOLUTIONS':'BLOCKED_FOR_PAY';
    const tableRows=renderer.renderTimesheetParentRows(timesheets,section)
      +renderer.renderSimplePreviewRows(renderer.buildOverpaymentRecoveryDisplayLines(other),kind==='actions'?'Action required':'Blocked for pay',section);
    const sourceRows=page.rows.filter(row=>row.source_kind==='SOURCE_PROGRESS').map(sourceCard).join('');
    const resolutionRows=prepared.map(item=>item.resolutionHtml).filter(Boolean).join('');
    return {tableRows,sourceRows,resolutionRows};
  }
  function routeDirection(data){
    const nested=object(data?.payload)?data.payload:{};
    const components=[...(Array.isArray(data?.case_components)?data.case_components:[]),
      ...(Array.isArray(nested?.case_components)?nested.case_components:[])].filter(object);
    const sources=[...new Set(components.map(component=>payMethod(firstText(component.source_pay_method,component.sourcePayMethod,
      component.source_method,component.sourceMethod))).filter(Boolean))];
    const targets=[...new Set(components.map(component=>payMethod(firstText(component.current_target_pay_method,component.currentTargetPayMethod,
      component.target_pay_method,component.targetPayMethod,component.saved_target_pay_method,component.savedTargetPayMethod))).filter(Boolean))];
    const source=sources.length===1?sources[0]:payMethod(firstText(data?.source_pay_method,data?.sourcePayMethod,nested?.source_pay_method,nested?.sourcePayMethod));
    const target=targets.length===1?targets[0]:payMethod(firstText(data?.target_pay_method,data?.targetPayMethod,nested?.target_pay_method,
      nested?.targetPayMethod,data?.pay_channel,data?.payChannel,nested?.pay_channel,nested?.payChannel));
    return source&&target&&source!==target?{source,target}:null;
  }
  function attentionCopy(row,kind,legacyCells){
    const data=payload(row),meta=row.task_meta||{},lineType=upper(data.line_type);
    const reason=upper(firstText(data.presentation_reason,data.blocked_reason,meta.reason));
    if(kind==='blocked'&&['OVERPAYMENT_RECOVERY','MANUAL_DEBT_RECOVERY'].includes(lineType)
      &&(reason.includes('HEADROOM')||reason.includes('AVAILABLE_FUNDS')||reason.includes('INSUFFICIENT'))){
      return {title:'Insufficient funds to deduct',body:'No recovery can be taken from the currently selected payments.'};
    }
    const resolutionFamily=upper(firstText(meta.resolution_family,data.resolution_family));
    if(kind==='actions'&&resolutionFamily==='TAXABLE_CHANNEL_RESTRUCTURE'){
      const direction=routeDirection(data);
      const body=direction?.source==='PAYE'
        ?'Payment was originally PAYE. Candidate is now paid through an umbrella company.'
        :direction?.source==='UMBRELLA'
          ?'Payment was originally through an umbrella company. Candidate is now PAYE.'
          :'The candidate’s payment method has changed. Review how this payment should be handled.';
      return {title:'Payment method changed',body};
    }
    if(kind==='actions'&&['BUCKETED','NON_BUCKET'].includes(resolutionFamily)){
      return {title:'Rate decision required',body:'Review the suggested rates or enter the rate that should be used.'};
    }
    const state=legacyCells[6];
    const title=firstText(meta.title,state?.querySelector?.('.pill')?.textContent,kind==='actions'?'Action required':'Payment blocked');
    const body=firstText(legacyCells[5]?.querySelector?.('.mini')?.textContent,legacyCells[1]?.querySelector?.('.mini')?.textContent,
      data.presentation_message,data.blocked_reason_text,data.reason);
    return {title,body};
  }
  function appendInteractiveUnits(fromCells,target){
    const seen=new Set();
    for(const control of fromCells.flatMap(cell=>Array.from(cell.querySelectorAll('button,input,select,textarea,a[href]')))){
      const unit=control.closest('label')||control;
      if(seen.has(unit)||unit.closest('.bpv2-detail-actions'))continue;
      seen.add(unit);target.append(unit);
    }
  }
  function compactRows(document,tbody,page,kind){
    const rowsById=new Map(page.rows.filter(row=>row.preview_row_id).map(row=>[String(row.preview_row_id),row]));
    for(const tr of Array.from(tbody.children)){
      const legacyCells=Array.from(tr.children).filter(cell=>cell.tagName==='TD');
      if(legacyCells.length===1){legacyCells[0].colSpan=5;continue;}
      if(legacyCells.length!==8)continue;
      const row=rowsById.get(String(tr.dataset.previewRowId||''));if(!row)fail();
      const data=payload(row),copy=attentionCopy(row,kind,legacyCells);
      const candidate=document.createElement('td');candidate.className='bpv2-detail-candidate';
      const candidateName=firstText(data.candidate_name,data.display_name,'Candidate');
      const candidateRef=firstText(data.candidate_reference,data.tms_ref);
      candidate.innerHTML=`<strong>${esc(candidateName)}</strong>${candidateRef?`<span>${esc(candidateRef)}</span>`:''}`;
      const payment=document.createElement('td');payment.className='bpv2-detail-payment';
      const client=firstText(data.client_name,data.client_display_name);
      const paymentDate=date(firstText(data.timesheet_week_ending,data.week_ending_date,data.week_ending,data.payment_date,
        data.segment_date,data.linked_shift_date,data.shift_date));
      const route=payMethod(firstText(data.pay_channel,data.payChannel));
      payment.innerHTML=`<strong>${esc(friendlyType(data.line_type))}</strong>${client?`<span>${esc(client)}</span>`:''}`
        +((paymentDate||route)?`<span>${paymentDate?esc(paymentDate):''}${paymentDate&&route?' · ':''}${route?`<span class="bpv2-route-badge bpv2-route-badge--${route.toLowerCase()}">${route==='UMBRELLA'?'Umbrella':'PAYE'}</span>`:''}</span>`:'');
      const why=document.createElement('td');why.className='bpv2-detail-why';
      why.innerHTML=`<strong>${esc(copy.title)}</strong>${copy.body?`<span>${esc(copy.body)}</span>`:''}`;
      const amount=document.createElement('td');amount.className='bpv2-detail-amount';
      while(legacyCells[5].firstChild)amount.append(legacyCells[5].firstChild);
      // The retained renderer includes explanatory mini-copy beside some
      // legacy amounts. In the five-column detail that explanation belongs
      // solely in the dedicated reason column; retaining it here repeats the
      // same sentence and makes the amount unreadable. Keep the authoritative
      // value/badges, remove only duplicate presentation text, and apply the
      // normal currency symbol without recalculating the server scalar.
      for(const duplicate of amount.querySelectorAll('.mini'))duplicate.remove();
      for(const routeLabel of amount.querySelectorAll(':scope > div > strong'))routeLabel.remove();
      const valueNode=Array.from(amount.querySelectorAll(':scope > div')).find(node=>/^-?[\d,]+(?:\.\d{1,2})?$/.test(text(node.textContent)));
      if(valueNode&&!text(valueNode.textContent).includes('£')){
        const value=text(valueNode.textContent);valueNode.textContent=value.startsWith('-')?`-£${value.slice(1)}`:`£${value}`;
      }
      const actions=document.createElement('td');actions.className='bpv2-detail-actions-cell';
      const actionWrap=document.createElement('div');actionWrap.className='bpv2-detail-actions';actions.append(actionWrap);
      appendInteractiveUnits(legacyCells,actionWrap);
      tr.replaceChildren(candidate,payment,why,amount,actions);
    }
  }
  function create({document,kind,adapters,onPage,onClose,onLegacyAction,onFailure}){
    if(!['actions','blocked'].includes(kind))throw new TypeError('Unknown issue detail kind');
    for(const callback of [onPage,onClose,onLegacyAction,onFailure])if(typeof callback!=='function')throw new TypeError('Issue detail adapters required');
    const element=document.createElement('section');element.className='banking-pay-v2-issue-detail';
    element.innerHTML=`<header><div><h2>${kind==='actions'?'Action Required':'Blocked for Pay'}</h2><p class="mini" data-bpv2-detail-summary></p></div>
      <button type="button" class="btn btn-outline" data-bpv2-detail-command="close">Close</button></header>
      <p role="status" class="bpv2-detail-status" aria-live="polite" hidden></p>
      <div class="bpv2-detail-scroll"><div data-bpv2-source-rows></div><div data-bpv2-resolution-rows></div><table class="grid banking-ready-preview-table"><thead><tr>
        <th>Candidate</th><th>Payment</th><th>${kind==='actions'?'What needs attention':'Why it is blocked'}</th><th>Amount</th><th>Actions</th>
      </tr></thead><tbody></tbody></table></div>
      <footer><span data-bpv2-detail-count></span><button type="button" class="btn btn-outline" data-bpv2-detail-command="previous">Previous</button>
      <button type="button" class="btn btn-outline" data-bpv2-detail-command="next">Next</button></footer>`;
    const body=element.querySelector('tbody'),sources=element.querySelector('[data-bpv2-source-rows]');
    const resolutions=element.querySelector('[data-bpv2-resolution-rows]');
    const status=element.querySelector('[role="status"]'),scroll=element.querySelector('.bpv2-detail-scroll');
    const openKeys=new Set();let accepted=null,busy=false,destroyed=false;
    function controls(){for(const control of element.querySelectorAll('button,input')){
      if(control.dataset.bpv2DetailCommand==='close')continue;control.disabled=busy||!accepted;
    }
      element.querySelector('[data-bpv2-detail-command="previous"]').disabled=busy||!accepted||!accepted.has_previous;
      element.querySelector('[data-bpv2-detail-command="next"]').disabled=busy||!accepted||!accepted.has_more;
      element.setAttribute('aria-busy',String(busy));
    }
    function report(error){if(destroyed)return;status.textContent='This detail could not be updated. Refresh Banking Pay and try again.';
      status.hidden=false;onFailure({code:typeof error?.code==='string'?error.code:'BANKING_PAY_V2_UPDATE_FAILED'});}
    function invoke(callback,value){try{Promise.resolve(callback(value)).catch(report);}catch(error){report(error);}}
    function expand(control){
      const key=control.getAttribute('data-breakdown-key')||control.getAttribute('data-timesheet-group-key');
      const row=control.closest('tr')?.nextElementSibling;if(!key||row?.getAttribute('data-banking-ready-breakdown-detail')!==key)fail();
      const opening=!openKeys.has(key);if(opening){const template=row.querySelector('template[data-banking-ready-breakdown-template="true"]');
        if(template)template.replaceWith(template.content.cloneNode(true));openKeys.add(key);}else openKeys.delete(key);
      row.hidden=!opening;control.textContent=opening?'−':'+';control.setAttribute('aria-expanded',String(opening));
    }
    function event(event){
      const control=event.target?.closest?.('[data-bpv2-detail-command],[data-action]');if(!control||!element.contains(control))return;
      event.stopPropagation();const command=control.dataset.bpv2DetailCommand;
      if(command==='close'){invoke(onClose);return;}if(destroyed||busy||!accepted||control.disabled)return;
      if(command){invoke(onPage,{direction:command,authority:Object.fromEntries(fields.map(key=>[key,accepted[key]]))});return;}
      if(control.dataset.action==='banking:pay:toggleTimesheetBreakdown'){try{expand(control);}catch(error){report(error);}return;}
      invoke(onLegacyAction,{action:control.dataset.action,element:control,event_kind:event.type,
        authority:Object.fromEntries(fields.map(key=>[key,accepted[key]]))});
    }
    element.addEventListener('click',event);
    return Object.freeze({element,
      prepare(page,summary){
        if(destroyed)throw new Error('BANKING_PAY_V2_CLOSED');const markup=render(page,summary,kind,adapters,openKeys);
        const staged=document.createElement('tbody');staged.innerHTML=markup.tableRows;compactRows(document,staged,page,kind);
        const stagedSources=document.createElement('div');stagedSources.innerHTML=markup.sourceRows;
        const stagedResolutions=document.createElement('div');stagedResolutions.innerHTML=markup.resolutionRows;
        return ()=>{if(destroyed)return;const top=scroll.scrollTop,left=scroll.scrollLeft;accepted=page;
          body.replaceChildren(...Array.from(staged.childNodes));sources.replaceChildren(...Array.from(stagedSources.childNodes));
          resolutions.replaceChildren(...Array.from(stagedResolutions.childNodes));
          element.querySelector('[data-bpv2-detail-summary]').textContent=`${page.affected_candidate_count} candidate${page.affected_candidate_count===1?'':'s'} affected`;
          element.querySelector('[data-bpv2-detail-count]').textContent=`${page.total_count} item${page.total_count===1?'':'s'}`;
          status.hidden=true;status.textContent='';controls();scroll.scrollTop=top;scroll.scrollLeft=left;};
      },
      setBusy(value){if(!destroyed){busy=Boolean(value);controls();}},
      showFailure(message){if(!destroyed){status.textContent=String(message);status.hidden=false;}},
      destroy(){destroyed=true;accepted=null;openKeys.clear();element.removeEventListener('click',event);element.remove();}
    });
  }
  const api=Object.freeze({payload,context,render,compactRows,create});
  if(local)module.exports=api;else root.CloudTMSBankingPayIssueDetailV2=api;
})(typeof window==='object'?window:this);
