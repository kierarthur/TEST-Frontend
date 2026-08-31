const assert=require('node:assert/strict');
const test=require('node:test');
const api=require('../../js/banking-pay-modal-v2-issue-detail.js');
const {fixture}=require('../fixtures/banking-pay-v2-issue-detail-page.cjs');

function blockedPayment(){
  const value=fixture('blocked',1,1);value.summary.global.blocked_count=1;
  const row=value.page.rows[0];row.task_meta={task_family:'PASSIVE_PAYMENT',state:'BLOCKED'};
  Object.assign(row.payload,{candidate_id:row.candidate_id,preview_row_id:row.preview_row_id,
    display_name:'Candidate with blocked payment',tms_ref:'TEST-001',client_name:'Test client',line_type:'LOAN_REPAYMENT',
    presentation_section:'BLOCKED_FOR_PAY',effective_section:'blocked_for_pay',amount_ex_vat:'-15.00',section_amount_ex_vat:'-15.00'});
  return value;
}

test('Blocked detail reuses the complete legacy payment renderer and keeps selection unavailable',()=>{
  const value=blockedPayment();const rendered=api.render(value.page,value.summary,'blocked',
    {formatIsoToUk:v=>v,railEnv:'TEST',railProvider:'CSV'},new Set());
  assert.match(rendered.tableRows,/Candidate with blocked payment/);
  assert.match(rendered.tableRows,/LOAN REPAYMENT/);
  assert.doesNotMatch(rendered.tableRows,/data-action="banking:pay:togglePreviewRow"/);
});

test('issue detail refuses an invented or missing action contract before rendering',()=>{
  const value=blockedPayment();delete value.page.rows[0].task_meta;
  assert.throws(()=>api.render(value.page,value.summary,'blocked',
    {formatIsoToUk:v=>v,railEnv:'TEST',railProvider:'CSV'},new Set()),/INVALID_RESPONSE/);
});

test('source-progress detail keeps the existing refresh action and no payment identity',()=>{
  const value=fixture('actions',1,1);value.summary.global.action_required_count=1;
  Object.assign(value.page,{affected_payment_count:null,affected_payment_count_complete:false});
  const row=value.page.rows[0];Object.assign(row,{preview_row_id:null,source_kind:'SOURCE_PROGRESS',context_only:true,
    task_meta:{task_family:'SOURCE_PROGRESS',title:'Candidate payment information needs refreshing.',action:'banking:pay:refreshAll'},
    payload:{candidate_id:row.candidate_id,display_name:'Candidate needing refresh',tms_ref:'TEST-002'}});
  const rendered=api.render(value.page,value.summary,'actions',
    {formatIsoToUk:v=>v,railEnv:'TEST',railProvider:'CSV'},new Set());
  assert.match(rendered.sourceRows,/Candidate payment information needs refreshing\./);
  assert.match(rendered.sourceRows,/data-action="banking:pay:refreshAll"/);
  assert.equal(rendered.tableRows,'');
});

test('action detail joins the exact server-owned case actions back onto the preserved controls',()=>{
  const value=fixture('actions',1,1);value.summary.global.action_required_count=1;
  const row=value.page.rows[0];
  row.task_meta={family:'FINANCE_CASE',actions:[
    'banking:pay:openBucketedResolution','banking:pay:toggleExcludeTimesheet'
  ],case_key:'finance:00000000-0000-4000-8000-000000000088',
  finance_case_id:'00000000-0000-4000-8000-000000000088',resolution_family:'BUCKETED',
  linked_timesheet_id:'00000000-0000-4000-8000-000000000089'};
  Object.assign(row.payload,{candidate_id:row.candidate_id,preview_row_id:row.preview_row_id,
    display_name:'Candidate needing a rate decision',tms_ref:'TEST-003',client_name:'Test client',
    line_type:'TIMESHEET_PAYMENT',presentation_section:'CASES_RESOLUTIONS',effective_section:'cases_resolutions',
    pay_channel:'PAYE',section_amount_ex_vat:'200.00',excluded_from_run:false,
    case_needs_resolution:true,case_resolution_satisfied_now:false,
    has_actionable_suggested_resolution:true,resolution_action_requires_actionable_components:false});
  const rendered=api.render(value.page,value.summary,'actions',
    {formatIsoToUk:v=>v,railEnv:'TEST',railProvider:'CSV'},new Set());
  const actions=[...rendered.tableRows.matchAll(/data-action="([^"]+)"/g)].map(match=>match[1]);
  assert.ok(actions.includes('banking:pay:openBucketedResolution'));
  assert.ok(actions.includes('banking:pay:toggleExcludeTimesheet'));
  assert.ok(actions.includes('banking:pay:openSnooze'));
  assert.match(rendered.tableRows,/>Review suggested rates<\/button>/);
  assert.match(rendered.tableRows,/>Exclude case<\/button>/);
});

test('component action detail exposes every exact component control without inventing another action',()=>{
  const value=fixture('actions',1,1);value.summary.global.action_required_count=1;
  const row=value.page.rows[0];
  const component={finance_component_id:'00000000-0000-4000-8000-000000000090',key:'DAY',
    label:'Day rate',needs_action:true,show_suggested_rate:true,suggested_available:true,
    show_manual_rate_control:true,show_manual_amount_control:false,has_operator_choice:false,
    source_units:8,source_rate:19,target_rate:20,source_pay_amount:152,target_pay_amount:160};
  row.task_meta={family:'FINANCE_COMPONENT',actions:[
    'banking:pay:componentUseSuggested','banking:pay:componentManualRate'
  ],case_key:'finance:00000000-0000-4000-8000-000000000091',
  finance_case_id:'00000000-0000-4000-8000-000000000091',resolution_family:'BUCKETED',
  linked_timesheet_id:'00000000-0000-4000-8000-000000000092',component};
  Object.assign(row.payload,{candidate_id:row.candidate_id,preview_row_id:row.preview_row_id,
    display_name:'Candidate needing a component decision',line_type:'TIMESHEET_PAYMENT',
    presentation_section:'CASES_RESOLUTIONS',effective_section:'cases_resolutions'});
  const rendered=api.render(value.page,value.summary,'actions',
    {formatIsoToUk:v=>v,railEnv:'TEST',railProvider:'CSV'},new Set());
  const actions=[...rendered.resolutionRows.matchAll(/data-action="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(actions,['banking:pay:componentUseSuggested','banking:pay:componentManualRate']);
  assert.match(rendered.resolutionRows,/Accept suggestion/);
  assert.match(rendered.resolutionRows,/Manual rate/);
});

test('action detail rejects mismatched task actions instead of guessing a resolution control',()=>{
  const value=fixture('actions',1,1);value.summary.global.action_required_count=1;
  const row=value.page.rows[0];
  row.task_meta={family:'FINANCE_CASE',actions:['banking:pay:openNonBucketResolution'],
    case_key:'finance:00000000-0000-4000-8000-000000000093',
    finance_case_id:'00000000-0000-4000-8000-000000000093',resolution_family:'BUCKETED'};
  Object.assign(row.payload,{candidate_id:row.candidate_id,line_type:'TIMESHEET_PAYMENT',
    presentation_section:'CASES_RESOLUTIONS',effective_section:'cases_resolutions'});
  assert.throws(()=>api.render(value.page,value.summary,'actions',
    {formatIsoToUk:v=>v,railEnv:'TEST',railProvider:'CSV'},new Set()),/INVALID_RESPONSE/);
});
