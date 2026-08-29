/* Bounded Candidate Banking presentation. The shared controller supplies one
 * accepted revision and owns every read/mutation. This module owns only the
 * child DOM, its local expansion/scroll state and delegated UI intents.
 */
(function(root){
  'use strict';
  const local=typeof module==='object'&&module.exports;
  const table=local?require('./banking-pay-modal-v2-table.js'):root.CloudTMSBankingPayTableV2;
  const details=local?require('./banking-pay-modal-v2-details-legacy.js'):root.CloudTMSBankingPayLegacyDetailsV2;
  const fields=['session_id','session_version','progress_counter_version','scope_hash'];
  const candidateFields=['candidate_id','candidate_name','candidate_reference','candidate_sort_name','candidate_sort_reference',
    'facts_digest','child_revision','selectable_ready_count',
    'selected_ready_count','selection_state','selected_display_amount','selected_deduction_exists','selected_timesheet_count',
    'selected_timesheet_scope_token'];
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const count=value=>Number.isSafeInteger(value)&&value>=0;
  function validGroup(row){
    const keys=['selection_group_kind','selection_group_key','selection_group_member_count','selection_group_selected_count','selection_group_state',
      'selection_group_display_amount','selection_group_selected_display_amount'];
    if(!keys.every(key=>Object.hasOwn(row,key))||!count(row.selection_group_member_count)||!count(row.selection_group_selected_count)
      ||row.selection_group_selected_count>row.selection_group_member_count)return false;
    if(row.selection_group_kind===null)return row.selection_group_key===null&&row.selection_group_member_count===0
      &&row.selection_group_selected_count===0&&row.selection_group_state===null
      &&row.selection_group_display_amount===null&&row.selection_group_selected_display_amount===null;
    return ['TIMESHEET','OVERPAYMENT'].includes(row.selection_group_kind)&&typeof row.selection_group_key==='string'
      &&row.selection_group_key.length>=1&&row.selection_group_key.length<=512&&!/[\u0000-\u001f\u007f]/u.test(row.selection_group_key)
      &&row.selection_group_member_count>=1&&/^-?(?:0|[1-9]\d{0,15})\.\d{2}$/.test(row.selection_group_display_amount)
      &&/^-?(?:0|[1-9]\d{0,15})\.\d{2}$/.test(row.selection_group_selected_display_amount)
      &&row.selection_group_display_amount!=='-0.00'&&row.selection_group_selected_display_amount!=='-0.00'
      &&['NONE','SOME','ALL'].includes(row.selection_group_state)
      &&row.selection_group_state===(row.selection_group_selected_count===0?'NONE'
        :row.selection_group_selected_count===row.selection_group_member_count?'ALL':'SOME');
  }
  function invalid(){throw new Error('BANKING_PAY_V2_INVALID_RESPONSE');}
  function sameCandidate(left,right){
    if(left===null||right===null)return left===right;
    return object(left)&&object(right)&&candidateFields.every(key=>left[key]===right[key])
      &&Array.isArray(left.selected_timesheet_ids)&&Array.isArray(right.selected_timesheet_ids)
      &&left.selected_timesheet_ids.length===right.selected_timesheet_ids.length
      &&left.selected_timesheet_ids.every((id,index)=>id===right.selected_timesheet_ids[index]);
  }
  function validate({summary,candidate,page,context}){
    table.validateSummary(summary);
    if(!object(page)||page.ok!==true||page.contract!==table.CONTRACT||page.contract_version!==1
      ||fields.some(key=>page[key]!==summary[key])||typeof page.candidate_id!=='string'
      ||!Object.hasOwn(page,'candidate'))invalid();
    // The child's response, not an old visible main row or loaded child page,
    // owns its complete candidate amount/selection/Timesheet scope. Any supplied
    // compatibility alias must agree before either view is published.
    if(candidate!==undefined&&!sameCandidate(candidate,page.candidate))invalid();
    candidate=page.candidate;
    if(candidate!==null){
      table.validateRow(candidate);
      if(candidate.candidate_id!==page.candidate_id||candidate.selectable_ready_count>page.total_count
        ||candidate.selectable_ready_count>summary.global.selectable_ready_count
        ||candidate.selected_ready_count>summary.global.selected_ready_count)invalid();
    }
    const visible=summary.rows.find(row=>row.candidate_id===page.candidate_id);
    if(visible&&!table.sameCandidateContent(visible,candidate))invalid();
    if(!Array.isArray(page.rows)||page.rows.length>100||!Number.isSafeInteger(page.total_count)||page.total_count<page.rows.length
      ||typeof page.has_more!=='boolean'||(page.has_more?typeof page.next_cursor!=='string'||!page.next_cursor:page.next_cursor!==null)
      ||page.rows.some(row=>!object(row)||!row.identity||row.candidate_id!==page.candidate_id
        ||row.effective_section!=='canonical_preview_lines'||typeof row.selected!=='boolean'||!validGroup(row))
      ||new Set(page.rows.map(row=>row.identity)).size!==page.rows.length
      ||(page.rows.length===0&&page.total_count!==0)||(candidate===null&&page.total_count!==0))invalid();
    if(!object(context)||!(context.selectedPreviewRowSet instanceof Set))invalid();
    for(const row of page.rows){
      if(context.selectedPreviewRowSet.has(row.preview_row_id)!==row.selected)invalid();
    }
    // These are bounded related-row inputs, never the old complete workbench.
    for(const key of ['readyPreviewLines','canonicalPreviewLines','blockedPreviewLines','hiddenPreviewLines']){
      if(!Array.isArray(context[key])||context[key].length>100
        ||context[key].some(row=>row.candidate_id!==page.candidate_id))invalid();
    }
    if(context.hiddenPreviewLines.length!==0)invalid();
    return {summary,candidate,page,context};
  }
  function rowMarkup(value,openKeys){
    validate(value);
    const renderers=details.create({...value.context,openReadyTimesheetBreakdownKeys:openKeys});
    const timesheets=value.page.rows.filter(row=>String(row.line_type||'').trim().toUpperCase()==='TIMESHEET_PAYMENT');
    const other=value.page.rows.filter(row=>String(row.line_type||'').trim().toUpperCase()!=='TIMESHEET_PAYMENT');
    return renderers.renderReadyTimesheetGroupedRows(timesheets)
      +renderers.renderSimplePreviewRows(renderers.buildOverpaymentRecoveryDisplayLines(other),null,'READY_TO_PAY');
  }
  function bindCompleteGroupControls(container,current){
    const byIdentity=new Map(current.page.rows.map(row=>[row.identity,row]));
    const facts=new Map();
    for(const row of current.page.rows){
      if(row.selection_group_kind===null)continue;
      const id=`${row.selection_group_kind}|${row.selection_group_key}`;
      const prior=facts.get(id);
      if(prior&&(prior.selection_group_member_count!==row.selection_group_member_count
        ||prior.selection_group_selected_count!==row.selection_group_selected_count
        ||prior.selection_group_state!==row.selection_group_state))invalid();
      facts.set(id,row);
    }
    for(const control of container.querySelectorAll('[data-action="banking:pay:toggleTimesheetPreviewGroup"]')){
      let kind,key;
      if(control.dataset.timesheetGroupKey){kind='TIMESHEET';key=control.dataset.timesheetGroupKey;}
      else{
        const identity=control.closest('tr')?.getAttribute('data-preview-row-id');
        const row=identity?byIdentity.get(identity):null;
        kind=row?.selection_group_kind;key=row?.selection_group_key;
      }
      const fact=kind&&key?facts.get(`${kind}|${key}`):null;
      if(!fact)invalid();
      control.dataset.selectionGroupKind=kind;control.dataset.selectionGroupKey=key;
      control.dataset.groupSelectionState=fact.selection_group_state==='SOME'?'PARTIAL':fact.selection_group_state;
      control.removeAttribute('data-preview-row-ids');
      control.checked=fact.selection_group_state==='ALL';control.indeterminate=fact.selection_group_state==='SOME';
      control.setAttribute('aria-checked',control.indeterminate?'mixed':String(control.checked));
      control.setAttribute('aria-label',control.checked?'Untick all eligible payments in this group':'Tick all eligible payments in this group');
      const amountCell=control.closest('tr')?.children?.[6];
      if(amountCell?.ownerDocument){
        const wrapper=amountCell.ownerDocument.createElement('span');wrapper.className='bpv2-group-amount';
        const total=amountCell.ownerDocument.createElement('span');total.textContent=table.formatAmount(fact.selection_group_display_amount);wrapper.append(total);
        if(fact.selection_group_state==='SOME'){
          const selected=amountCell.ownerDocument.createElement('span');selected.className='mini bpv2-group-selected-amount';
          selected.textContent=`(${table.formatAmount(fact.selection_group_selected_display_amount)} selected)`;wrapper.append(selected);
        }
        amountCell.replaceChildren(wrapper);
      }
      const mobileAmount=control.closest('tr')?.querySelector?.('.banking-ready-mobile-row-summary > span:last-child');
      if(mobileAmount){
        const prefix=String(mobileAmount.textContent||'').split(' · ')[0]||'—';
        mobileAmount.textContent=`${prefix} · ${table.formatAmount(fact.selection_group_display_amount)}`;
      }
    }
  }
  function create({document,onIntent,onLegacyAction,onClose,onFailure}){
    for(const callback of [onIntent,onLegacyAction,onClose,onFailure])if(typeof callback!=='function')throw new TypeError('Candidate Banking adapters required');
    const element=document.createElement('section');element.className='banking-pay-v2-candidate';
    element.setAttribute('aria-label','Candidate Banking');
    element.innerHTML=`<header class="bpv2-child-heading"><div><h2>Candidate Banking</h2><div data-bpv2-candidate-name></div></div>
      <button type="button" class="btn btn-outline" data-bpv2-child="close">Back to Banking Pay</button></header>
      <div class="bpv2-child-toolbar"><strong data-bpv2-candidate-amount></strong>
        <div><button type="button" class="btn btn-outline" data-bpv2-child="export-all">Export Ready to Pay CSV</button></div></div>
      <p class="bpv2-child-status" role="status" aria-live="polite" hidden></p>
      <div class="bpv2-child-scroll"><table class="banking-ready-preview-table"><thead><tr>
        <th><label><input type="checkbox" data-bpv2-child="include" aria-label="Include all eligible payments for this candidate"> Include</label></th>
        <th>Line type</th><th>Candidate</th><th>Client</th><th>Week / Date</th><th>Channel</th><th>Amount</th><th>State</th><th>Action</th>
      </tr></thead><tbody></tbody></table><p data-bpv2-candidate-empty hidden>No payments are currently ready to pay for this candidate.</p></div>
      <footer class="bpv2-child-pagination"><span data-bpv2-child-count></span>
        <button type="button" class="btn btn-outline" data-bpv2-child="previous">Previous</button>
        <button type="button" class="btn btn-outline" data-bpv2-child="next">Next</button></footer>`;
    const body=element.querySelector('tbody');const scroll=element.querySelector('.bpv2-child-scroll');
    const status=element.querySelector('[role="status"]');const include=element.querySelector('[data-bpv2-child="include"]');
    let accepted=null,busy=false,destroyed=false,hasPrevious=false;
    const openKeys=new Set();const checkedState=new WeakMap();const busyOwned=new Set();
    function syncChecks(container){
      for(const control of container.querySelectorAll('input[type="checkbox"]')){
        const mixed=control.getAttribute('aria-checked')==='mixed';
        control.indeterminate=mixed;
        checkedState.set(control,{checked:control.checked,mixed});
      }
    }
    function applyBusy(){
      for(const control of element.querySelectorAll('button,input')){
        if(control.dataset.bpv2Child==='close')continue;
        if(busy){if(!control.disabled){control.disabled=true;busyOwned.add(control);}control.setAttribute('aria-busy','true');}
        else{if(busyOwned.delete(control))control.disabled=false;control.removeAttribute('aria-busy');}
      }
      element.setAttribute('aria-busy',String(busy));
    }
    function restoreCheck(control){
      const saved=checkedState.get(control);if(!saved)return;
      control.checked=saved.checked;control.indeterminate=saved.mixed;
      control.setAttribute('aria-checked',saved.mixed?'mixed':String(saved.checked));
    }
    function report(error){
      status.textContent='This action could not be completed. Refresh Banking Pay and try again.';status.hidden=false;
      onFailure({code:typeof error?.code==='string'?error.code:'BANKING_PAY_V2_UPDATE_FAILED'});
    }
    function invoke(callback,value){try{Promise.resolve(callback(value)).catch(report);}catch(error){report(error);}}
    function expand(control){
      const key=control.getAttribute('data-breakdown-key')||control.getAttribute('data-timesheet-group-key');
      const row=control.closest('tr')?.nextElementSibling;
      if(!key||row?.getAttribute('data-banking-ready-breakdown-detail')!==key)throw new Error('Missing exact breakdown');
      const opening=!openKeys.has(key);
      if(opening){
        const template=row.querySelector('template[data-banking-ready-breakdown-template="true"]');
        if(template)template.replaceWith(template.content.cloneNode(true));
        openKeys.add(key);syncChecks(row);
      }else openKeys.delete(key);
      row.hidden=!opening;control.textContent=opening?'−':'+';
      control.setAttribute('aria-expanded',String(opening));
      control.setAttribute('aria-label',opening?'Hide line breakdown':'Show line breakdown');
      control.setAttribute('title',opening?'Hide line breakdown':'Show line breakdown');
    }
    function event(event){
      const control=event.target?.closest?.('[data-bpv2-child],[data-action]');
      if(!control||!element.contains(control))return;
      event.stopPropagation();
      if(event.type==='click'&&control.type==='checkbox')return; // use the single change event
      if(event.type==='change'&&control.type!=='checkbox')return;
      if(control.dataset.bpv2Child==='close'){invoke(onClose);return;}
      const desired=control.type==='checkbox'?control.checked:undefined;
      if(control.type==='checkbox')restoreCheck(control); // server confirmation owns the tick
      if(destroyed||busy||control.disabled||!accepted)return;
      const command=control.dataset.bpv2Child;
      if(command){
        invoke(onIntent,{kind:command,candidate_id:accepted.page.candidate_id,selected:desired,
          element:control,
          authority:Object.fromEntries(fields.map(key=>[key,accepted.page[key]]))});return;
      }
      if(control.dataset.action==='banking:pay:toggleTimesheetBreakdown'){
        try{expand(control);}catch(error){report(error);}return;
      }
      if(control.dataset.action==='banking:pay:toggleTimesheetPreviewGroup'){
        invoke(onIntent,{kind:'group',candidate_id:accepted.page.candidate_id,
          group_kind:control.dataset.selectionGroupKind,group_key:control.dataset.selectionGroupKey,selected:desired,
          authority:Object.fromEntries(fields.map(key=>[key,accepted.page[key]]))});return;
      }
      invoke(onLegacyAction,{action:control.dataset.action,element:control,event_kind:event.type,selected:desired,
        authority:Object.fromEntries(fields.map(key=>[key,accepted.page[key]]))});
    }
    element.addEventListener('click',event);element.addEventListener('change',event);
    return Object.freeze({element,
      prepare(value,{previousAvailable=false}={}){
        if(destroyed)throw new Error('Candidate Banking is closed');
        const current=validate(value);
        const markup=rowMarkup(current,openKeys); // validate/render before touching the accepted DOM
        const staged=document.createElement('tbody');staged.innerHTML=markup;bindCompleteGroupControls(staged,current);syncChecks(staged);
        return ()=>{
          if(destroyed)return;
          const top=scroll.scrollTop,left=scroll.scrollLeft;
          const focused=element.contains(document.activeElement)?document.activeElement:null;
          const focusAction=focused?.dataset.action,focusRow=focused?.getAttribute('data-preview-row-id');
          busyOwned.clear();body.replaceChildren(...Array.from(staged.childNodes));accepted=current;hasPrevious=previousAvailable;
          const candidate=current.candidate;
          element.querySelector('[data-bpv2-candidate-name]').textContent=candidate?`${candidate.candidate_name} · ${candidate.candidate_reference}`:'';
          element.querySelector('[data-bpv2-candidate-amount]').textContent=candidate?`Ready to pay ${table.formatAmount(candidate.selected_display_amount)}`:'No payments ready to include';
          include.checked=candidate?.selection_state==='ALL';include.indeterminate=candidate?.selection_state==='SOME';
          include.disabled=!candidate;include.setAttribute('aria-checked',include.indeterminate?'mixed':String(include.checked));
          syncChecks(element);
          element.querySelector('[data-bpv2-candidate-empty]').hidden=value.page.rows.length!==0;
          element.querySelector('[data-bpv2-child-count]').textContent=`${value.page.total_count} Ready payments`;
          element.querySelector('[data-bpv2-child="previous"]').disabled=!hasPrevious;
          element.querySelector('[data-bpv2-child="next"]').disabled=!value.page.has_more;
          element.querySelector('[data-bpv2-child="export-all"]').disabled=value.page.total_count===0;
          status.hidden=true;status.textContent='';applyBusy();scroll.scrollTop=top;scroll.scrollLeft=left;
          if(focusAction&&focusRow){
            const replacement=Array.from(body.querySelectorAll('[data-action]')).find(node=>node.dataset.action===focusAction&&node.getAttribute('data-preview-row-id')===focusRow);
            replacement?.focus({preventScroll:true});
          }
        };
      },
      setBusy(value){if(!destroyed){busy=Boolean(value);applyBusy();}},
      showFailure(message){if(!destroyed){status.textContent=String(message);status.hidden=false;}},
      capturePosition:()=>({top:scroll.scrollTop,left:scroll.scrollLeft,open_keys:[...openKeys]}),
      destroy(){destroyed=true;accepted=null;busyOwned.clear();openKeys.clear();element.removeEventListener('click',event);element.removeEventListener('change',event);element.remove();}
    });
  }
  const api=Object.freeze({validate,rowMarkup,bindCompleteGroupControls,create});
  if(local)module.exports=api;else root.CloudTMSBankingPayCandidateV2=api;
})(typeof window==='object'?window:this);
