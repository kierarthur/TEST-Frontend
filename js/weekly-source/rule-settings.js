(function (global) {
  'use strict';
  const STATE = '__weeklySourceRuleSettings';
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const copy = value => JSON.parse(JSON.stringify(value));
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const labels = Object.freeze({
    checking_profile_kind:'Checking-file layout', self_bill_source:'Self-bill comes from', final_report_profile_kind:'Final report layout',
    invoice_membership:'Invoice includes',pay_membership:'Pay includes',invoice_amount_basis:'Invoice amounts come from',source_amount_basis:'Source amount',
    line_vat_method:'Line VAT',invoice_vat_method:'Invoice VAT',rate_difference_policy:'Contract-rate difference',negative_adjustment_policy:'Credits on the self-bill',lookback_warning:'Look-back warning',invoice_sender:'Invoice sender'
  });
  const names = Object.freeze({
    HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1:'HealthRoster: actual from/to',HEALTHROSTER_WEEKLY_EXPLICIT_ACTUAL_V1:'HealthRoster: explicit actual hours',ROSTER_WEEKLY_SUMMARY_ACTUAL_V1:'Weekly summary: actual hours',
    SAME_FILE:'The checking file',SEPARATE_FINAL_REPORT:'A separate final report',NONE:'None',ACACIUM_SELF_BILL_REPORT_V1:'Acacium self-bill report',
    FINALISED_IN_CYCLE_WINDOW:'Finalised in the cycle window',FOLLOW_FINAL_REPORT_LINES:'Shifts on the final report',ALL_FINALISED_IN_FILE:'All finalised in the file',ON_ACCEPTED_REPORT_OR_PROTECTED:'On the accepted report or protected',
    CONTRACT_CALCULATION:'Contract calculation',SOURCE_AMOUNT:'Amount in the source file',EXPORT_ACTUAL_COST_INC_VAT_NET_AGENCY_WORKER_PAY:'Actual Cost including VAT; Agency Worker Pay as net',REPORT_LINE_NET:'Report line net',
    ROUND_EACH_LINE_FROM_NET:'Round each line from net',LINE_GROSS_MINUS_NET_FROM_SOURCE:'File gross minus file net',LINE_VAT_FROM_REPORT:'VAT from the report',ROUND_TOTAL_FROM_EXACT_NET:'Round total from exact Contract net',
    SUM_OF_LINES:'Sum the line VAT',ONCE_ON_TOTAL_TRUNCATE:'Once on total: truncate',ONCE_ON_TOTAL_HALF_UP:'Once on total: round half up',NOT_APPLICABLE:'Not applicable',FLAG_ALLOW_IGNORE:'Flag differences; allow source amount',
    NOT_ALLOWED:'Not allowed',NEGATIVE_ADJUSTMENT_LINE:'Negative adjustment line',OFF:'Off',WARN_IF_AFTER_OLDEST_PROTECTED:'Warn after the oldest protected shift',CLIENT_SELF_BILL:'Client self-bill',AGENCY_INVOICE:'Agency invoice'
  });
  const uuid = () => { if(!global.crypto?.randomUUID) throw Error('A secure save request cannot be created.'); return global.crypto.randomUUID(); };
  const dateText = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value).split('-').reverse().join('/') : 'Open-ended';
  const versionOptions = catalogue => catalogue.rule_sets.flatMap(set => set.versions.map(v => ({id:v.id,label:`${set.display_name} · version ${v.version_number}`})));
  function catalogue(value) {
    if(value?.contract !== 'WEEKLY_SOURCE_RULE_SETS_V1' || !Array.isArray(value.rule_sets) || !Array.isArray(value.assignments)) throw Error('Source rules cannot be confirmed. Refresh after the service updates.');
    if(value.rule_sets.some(set=>!set.id||!Array.isArray(set.versions)||!set.versions.length||set.versions.some(v=>!v.id||!v.values||typeof v.values!=='object'))) throw Error('Source rule versions could not be read.');
    return copy(value);
  }
  async function request(path,body) {
    if(typeof global.authFetch!=='function')throw Error('Source rule settings are unavailable.');
    const endpoint='/api/weekly-source/v1/settings'+path;
    const response=await global.authFetch(typeof global.API==='function'?global.API(endpoint):endpoint,{cache:'no-store',...(body?{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.message||'Source rules could not be saved.');
    return result;
  }
  function initial() {
    return {catalogue:null,loading:false,busy:false,error:'',notice:'',requests:new Map(),groupVersions:new Map(),editor:{id:'',code:'',display_name:'',source_group_id:'',values:{...global.CloudTMSWeeklySourceRuleValues.defaults,checking_profile_kind:'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1'}},assignment:{source_group_id:'',rule_set_version_id:'',effective_from_week_ending:'',effective_to_week_ending:''}};
  }
  function requestId(state,body) { const key=JSON.stringify(body); if(!state.requests.has(key))state.requests.set(key,uuid());return state.requests.get(key); }
  function saveBody(state) {
    const editor=state.editor,set=state.catalogue.rule_sets.find(v=>v.id===editor.id);
    if(!editor.source_group_id)throw Error('Choose a saved Roster source group.');
    const display_name=String(editor.display_name||'').trim(),code=String(editor.code||'').trim().toUpperCase();
    if(!display_name||display_name.length>160||! /^[A-Z][A-Z0-9_]{1,79}$/.test(code))throw Error('Enter a name and a code using capital letters, numbers and underscores.');
    const body={source_group_id:editor.source_group_id,rule_set:{id:set?.id||null,code,display_name,expected_version:set?.version||0},values:copy(global.CloudTMSWeeklySourceRuleValues.validate(editor.values))};
    return {...body,request_id:requestId(state,body)};
  }
  function assignmentBody(state,groups) {
    const a=state.assignment,group=groups.find(v=>v.id===a.source_group_id);
    if(!group||group.source_family!=='ROSTER'||group.active===false)throw Error('Choose a saved active Roster source group.');
    if(! /^\d{4}-\d{2}-\d{2}$/.test(a.effective_from_week_ending)|| (a.effective_to_week_ending&&! /^\d{4}-\d{2}-\d{2}$/.test(a.effective_to_week_ending)))throw Error('Choose the effective week ending and, if needed, the final week ending.');
    if(a.rule_set_version_id && !versionOptions(state.catalogue).some(v=>v.id===a.rule_set_version_id))throw Error('Choose an available rule version.');
    const body={rule_set_version_id:a.rule_set_version_id||null,effective_from_week_ending:a.effective_from_week_ending,effective_to_week_ending:a.effective_to_week_ending||null,expected_group_version:Number(state.groupVersions.get(group.id)??group.expected_version??group.version)};
    if(!Number.isSafeInteger(body.expected_group_version)||body.expected_group_version<1)throw Error('Refresh the source group before assigning rules.');
    return {...body,request_id:requestId(state,{source_group_id:group.id,...body})};
  }
  const option=(value,label,selected)=>`<option value="${esc(value)}"${value===String(selected??'')?' selected':''}>${esc(label)}</option>`;
  const row=(label,control)=>`<label class="weekly-source-setting-row"><span>${esc(label)}</span><span>${control}</span></label>`;
  function html(state,groups) {
    const available=groups.filter(g=>g.id&&g.source_family==='ROSTER'&&g.active!==false),editor=state.editor;
    const groupSelect=name=>`<select name="${name}">${option('','Choose a saved Source group',name==='rule_group'?editor.source_group_id:state.assignment.source_group_id)}${available.map(g=>option(g.id,g.display_name||g.code,name==='rule_group'?editor.source_group_id:state.assignment.source_group_id)).join('')}</select>`;
    if(!state.catalogue)return `<section class="card" data-weekly-source-rule-settings><h3>Source rules</h3><p role="status">${esc(state.error||'Loading source rules…')}</p>${state.error?'<button type="button" class="btn" data-rule-refresh>Retry</button>':''}</section>`;
    const agency=editor.values.invoice_sender==='AGENCY_INVOICE';
    const fields=Object.entries(labels).filter(([key])=>key!=='invoice_sender'&&(!agency)).map(([key,label])=>row(label,`<select name="rule_value_${key}">${(global.CloudTMSWeeklySourceRuleValues.choices[key]||[]).map(value=>option(value,names[value]||value,editor.values[key])).join('')}</select>`)).join('');
    const clockUnused=agency||editor.values.checking_profile_kind==='ROSTER_WEEKLY_SUMMARY_ACTUAL_V1';
    const clocks=agency?'':clockUnused?'<p>Earliest final upload: Not used. The group cut-off opens finalising.</p>':row('Earliest final upload',`<select name="rule_final_day">${days.map((label,value)=>option(String(value),label,editor.values.earliest_final_weekday)).join('')}</select><input type="time" name="rule_final_time" value="${esc(editor.values.earliest_final_local_time)}"/>`);
    const versions=versionOptions(state.catalogue),assigned=state.catalogue.assignments.map(a=>`<li>${esc(groups.find(g=>g.id===a.source_group_id)?.display_name||'Source group')} · ${esc(versions.find(v=>v.id===a.rule_set_version_id)?.label||'No rule set')} · ${dateText(a.effective_from_week_ending)} to ${dateText(a.effective_to_week_ending)} · ${a.feature_enabled?'Enabled':'Saved · not enabled'}</li>`).join('');
    return `<section class="card weekly-source-rule-settings" data-weekly-source-rule-settings><h3>Source rules</h3><p>Save an immutable version, then assign it from a future unfinalised week. Saving keeps the rules off until the release checks pass.</p><p role="status" data-rule-status>${esc(state.error||state.notice)}</p>
      ${row('Rule set',`<select name="rule_set">${option('','New rule set',editor.id)}${state.catalogue.rule_sets.map(s=>option(s.id,s.display_name,editor.id)).join('')}</select>`)}
      ${row('Name',`<input name="rule_name" maxlength="160" value="${esc(editor.display_name)}"/>`)}${row('Code',`<input name="rule_code" maxlength="80" value="${esc(editor.code)}"/>`)}${row('Check against',groupSelect('rule_group'))}
      ${row('Invoice sender',`<select name="rule_value_invoice_sender">${global.CloudTMSWeeklySourceRuleValues.choices.invoice_sender.map(value=>option(value,names[value],editor.values.invoice_sender)).join('')}</select>`)}
      ${fields}${clocks}<label><input type="checkbox" name="rule_attach"${editor.values.attach_healthroster_section?' checked':''}/> Attach the HealthRoster section</label>
      ${agency?'<p>The agency-invoice preset uses its fixed checking rules.</p>':'<p>The client file is rechecked at every publication. Identical rekeys, authorised late additions and equal protected hours resolve automatically. Unfinalised shifts are chased from the first checking import; changed query clocks exclude unchanged shifts.</p>'}
      <p>Existing versions stay unchanged.</p><button type="button" class="btn" data-rule-save>Save new version</button>
      <h4>Assign rules</h4>${row('Source group',groupSelect('assignment_group'))}${row('Version',`<select name="assignment_version">${option('','No rule set',state.assignment.rule_set_version_id)}${versions.map(v=>option(v.id,v.label,state.assignment.rule_set_version_id)).join('')}</select>`)}
      ${row('Effective week ending',`<input type="date" name="assignment_from" value="${esc(state.assignment.effective_from_week_ending)}"/>`)}${row('Final week ending (optional)',`<input type="date" name="assignment_to" value="${esc(state.assignment.effective_to_week_ending)}"/>`)}
      <button type="button" class="btn" data-rule-assign>Save assignment</button><button type="button" class="btn" data-rule-refresh>Refresh rules</button><ul>${assigned||'<li>No saved assignments.</li>'}</ul></section>`;
  }
  function read(host,state) {
    const value=name=>host.querySelector(`[name="${name}"]`)?.value??'';
    Object.assign(state.editor,{id:value('rule_set'),display_name:value('rule_name'),code:value('rule_code'),source_group_id:value('rule_group')});
    for(const key of Object.keys(labels)){ const control=host.querySelector(`[name="rule_value_${key}"]`);if(control)state.editor.values[key]=control.value; }
    state.editor.values.attach_healthroster_section=!!host.querySelector('[name="rule_attach"]')?.checked;
    if(state.editor.values.invoice_sender==='AGENCY_INVOICE')state.editor.values={...global.CloudTMSWeeklySourceRuleValues.defaults,checking_profile_kind:'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1',invoice_sender:'AGENCY_INVOICE',earliest_final_weekday:null,earliest_final_local_time:null,attach_healthroster_section:state.editor.values.attach_healthroster_section};
    else if(state.editor.values.checking_profile_kind==='ROSTER_WEEKLY_SUMMARY_ACTUAL_V1'){state.editor.values.earliest_final_weekday=null;state.editor.values.earliest_final_local_time=null;}
    else {state.editor.values.earliest_final_weekday=value('rule_final_day')===''?4:Number(value('rule_final_day'));state.editor.values.earliest_final_local_time=value('rule_final_time')||'00:00';}
    Object.assign(state.assignment,{source_group_id:value('assignment_group'),rule_set_version_id:value('assignment_version'),effective_from_week_ending:value('assignment_from'),effective_to_week_ending:value('assignment_to')});
  }
  function mount(root,ctx,groups) {
    if(!root||!ctx||!global.CloudTMSWeeklySourceRuleValues)return;
    const state=ctx[STATE]??(ctx[STATE]=initial());
    const render=()=>{
      root.querySelector('[data-weekly-source-rule-settings]')?.remove();root.insertAdjacentHTML('beforeend',html(state,groups));
      const host=root.querySelector('[data-weekly-source-rule-settings]'),frame=global.__getModalFrame?.(),editable=!frame||['edit','create'].includes(frame.mode);
      host.querySelectorAll('input,select,button').forEach(control=>{control.disabled=state.busy||(!editable&&!control.matches('[data-rule-refresh]'));});
      host.querySelector('[name="rule_set"]')?.addEventListener('change',event=>{read(host,state);const set=state.catalogue.rule_sets.find(s=>s.id===event.target.value);state.editor={...state.editor,id:set?.id||'',code:set?.code||'',display_name:set?.display_name||'',values:set?copy(set.versions[0].values):{...global.CloudTMSWeeklySourceRuleValues.defaults,checking_profile_kind:'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1'}};state.error='';render();});
      host.querySelectorAll('input,select').forEach(control=>control.addEventListener('change',()=>{if(control.name==='rule_set')return;read(host,state);if(['rule_value_invoice_sender','rule_value_checking_profile_kind'].includes(control.name))render();}));
      const act=async(kind)=>{
        if(state.busy||!editable)return;
        read(host,state);state.error='';state.notice='';
        try {
          const body=kind==='save'?saveBody(state):assignmentBody(state,groups);state.busy=true;render();
          const result=await request(kind==='save'?'/rule-sets':`/source-groups/${encodeURIComponent(state.assignment.source_group_id)}/rules`,body);
          if(kind==='save'&&result.contract!=='WEEKLY_SOURCE_RULE_SET_SAVED_V1'||kind==='assign'&&result.contract!=='WEEKLY_SOURCE_RULE_ASSIGNED_V1')throw Error('The saved rules could not be confirmed. Refresh before continuing.');
          state.catalogue=catalogue(await request('/rule-sets'));
          if(kind==='save'){state.editor.id=result.rule_set_id;state.assignment.rule_set_version_id=result.rule_set_version_id;}
          else state.groupVersions.set(result.source_group_id,result.source_group_version);
          state.notice=kind==='save'?'New immutable rule version saved.':'Assignment saved. The rules are not enabled.';
        }catch(error){state.error=error.message||'Source rules could not be saved.';}finally{state.busy=false;render();}
      };
      host.querySelector('[data-rule-save]')?.addEventListener('click',()=>act('save'));
      host.querySelector('[data-rule-assign]')?.addEventListener('click',()=>act('assign'));
      host.querySelector('[data-rule-refresh]')?.addEventListener('click',()=>{if(state.busy)return;state.catalogue=null;state.error='';load();});
    };
    const load=async()=>{if(state.loading)return;state.loading=true;render();try{state.catalogue=catalogue(await request('/rule-sets'));}catch(error){state.error=error.message||'Source rules could not be loaded.';}finally{state.loading=false;render();}};
    if(state.catalogue)render();else load();
  }
  const api=Object.freeze({mount,catalogue,saveBody,assignmentBody,html,initial,dateText,stateKey:STATE});
  global.CloudTMSWeeklySourceRuleSettings=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
