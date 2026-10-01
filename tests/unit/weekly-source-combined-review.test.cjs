const {test}=require('node:test');
const assert=require('node:assert/strict');
const view=require('../../js/weekly-source/combined-review.js');
const model={contract:'WEEKLY_SOURCE_COMBINED_REVIEW_V1',tab:'queries',section:'checks',
  counts:{checks:1},owners:[],rows:[{combined_key:'check',candidate:'<Baljit>',client:'Trust A',
    source:'NHSP',period:'27 Sep 2026',day_date:'21 Sep 2026',system_hours:'09:00–17:00 · 30 min break',
    status:{text:'Needs action'},problem:'Choose the correct candidate.',
    actions:[{label:'Link candidate',enabled:true},{label:'Unavailable',enabled:false}]}]};
test('combined Office checks show identity, source, period, hours and exact indexed actions',()=>{
  const html=view.render(model);
  assert.match(html,/&lt;Baljit&gt;/);assert.match(html,/Trust A/);assert.match(html,/27 Sep 2026/);
  assert.match(html,/30 min break/);assert.match(html,/Choose the correct candidate/);
  assert.match(html,/data-wsr-action="0">Link candidate/);assert.match(html,/data-wsr-action="1" disabled/);
});
test('client filter removes duplicate client column without hiding the candidate',()=>{
  const html=view.render(model,{filters:{client_id:'A'}});
  assert.doesNotMatch(html,/data-wsr-sort="client"/);assert.match(html,/&lt;Baljit&gt;/);
});
test('upload purpose comes from the server and is not inferred from preparation success',()=>{
  const html=view.render({...model,tab:'imports',section:'current',counts:{current:1},
    rows:[{file:'Rejected backing.xlsx',prepared:false,purpose_label:'Finalisation report',status:{text:'Rejected'}}]});
  assert.match(html,/Finalisation report/);assert.doesNotMatch(html,/Checking hours/);
  assert.doesNotMatch(html,/Previous files|Manage questions/);
});
test('protected creation is advertised only when server grants it',()=>{
  assert.doesNotMatch(view.render(model),/data-wsr-add-protected/);
  assert.match(view.render({...model,owners:[{protected_pay_enabled:true}]}),/data-wsr-add-protected/);
});

test('accept system hours is visible only beside a server-eligible shift',()=>{
  const row={combined_key:'question',candidate:'Worker',accept_system_hours_action:{enabled:true,payload:{selection:{incident_ids:['eligible']}}},
    children:[{incident_id:'eligible',actions:[]},{incident_id:'ineligible',actions:[]}]};
  const render=()=>view.render({...model,section:'questions',rows:[row]});
  assert.match(render(),/data-wsr-accept-shift="0">Accept system hours/);
  assert.doesNotMatch(render(),/data-wsr-accept-shift="1"/);
  row.accept_system_hours_action.enabled=false;
  assert.doesNotMatch(render(),/data-wsr-accept-shift/);
});

test('questions have one compact entry point and aligned shifts, retaining exact reminder and child action indexes',()=>{
  const html=view.render({...model,section:'questions',rows:[{combined_key:'question',candidate:'Worker',
    actions:[{label:'Remind candidate',enabled:false},{label:'Open',enabled:true}],
    children:[{day_date:'21 Sep 2026',candidate_hours:'7 hours',system_hours:'7.5 hours',issue:'Hours differ',actions:[{label:'Protect pay',enabled:true}]}]}]});
  assert.doesNotMatch(html,/Manage questions|data-wsr-manage/);
  assert.match(html,/data-wsr-action="1">Open/);
  assert.match(html,/ws-query-contact-actions[^]*data-wsr-action="0" disabled>Remind candidate/);
  assert.match(html,/ws-query-shifts/);
  assert.match(html,/data-label="Candidate hours">7 hours/);
  assert.match(html,/data-wsr-child="0" data-wsr-action="0">Protect pay/);
});

test('query summary distinguishes problems and recorded replies from contact alone',()=>{
  const base={source:'A named trust group',source_family:'NHSP',candidate_asked:true,manager_informed:true,status:{text:'Manager informed'},children:[{issue:'Hours differ'}]};
  assert.deepEqual(view.questionSummary(base),{problem:'Mismatch',progress:'Manager informed',next:'Await manager reply'});
  base.children.push({issue:'Timesheet missing'});
  assert.equal(view.questionSummary(base).problem,'Multiple');
  base.children[0].candidate_response='My hours are correct';
  assert.equal(view.questionSummary(base).next,'Review / query in NHSP');
  base.children[0].manager_response='Reported a source correction';
  assert.equal(view.questionSummary(base).next,'Review manager reply');
  assert.match(view.questionSummary(base).progress,/1\/2 replied/);
  base.children[1].manager_response='Reported a source correction';
  assert.equal(view.questionSummary(base).next,'Import corrected hours');
  const html=view.render({...model,section:'questions',rows:[base]});
  assert.match(html,/Next action/);assert.doesNotMatch(html,/Candidate asked|Manager informed<\/th>/);
});

test('NHSP guidance uses the server source family, not a display name',()=>{
  const row={source:'NHSP',source_family:'ROSTER',children:[{issue:'Hours differ',candidate_response:'My hours are correct'}]};
  assert.equal(view.questionSummary(row).next,'Review response');
});

test('History lists completed reports and actual periods without an upload archive or cycle counters',()=>{
  const history={contract:'WEEKLY_SOURCE_REPORT_HISTORY_V1',sort_key:'finalised_at',sort_direction:'desc',
    scope_options:[{week_ending:'2026-09-20',period:'20 Sep 2026'},{week_ending:'2026-09-27',period:'27 Sep 2026'}],
    rows:[{report_key:'FINAL:report',client:'Trust A',source:'NHSP',period:'27 Sep 2026',report:'1234',finalised_at:'30 Sep 2026, 15:00',finalised_by:'Office user'}]};
  const html=view.render(history);
  assert.match(html,/data-wsr-report="FINAL:report">View report/);
  assert.match(html,/Office user/);
  assert.ok(html.indexOf('value="2026-09-27"')<html.indexOf('value="2026-09-20"'));
  assert.doesNotMatch(html,/Previous files|pay cycles|data-wsc-select|Finalise selected/);
});

test('completed report detail displays immutable hours, breaks and separate invoice movements',()=>{
  const html=view.render({contract:'WEEKLY_SOURCE_REPORT_HISTORY_V1'},{reportDetail:{
    report:{client:'Trust A',report:'1234',period:'27 Sep 2026',finalised_at:'30 Sep 2026',finalised_by:'Office user'},
    shift_count:1,movement_count:1,invoice_charge_pence:15000,has_more:true,
    shifts:[{candidate:'Worker',day_date:'21 Sep 2026',start:'09:00',end:'17:00',break_minutes:30,net_minutes:450,booking_reference:'123'}],
    movements:[{candidate:'Worker',day_date:'21 Sep 2026',movement:'Charge',invoice_charge_pence:15000}]}});
  assert.match(html,/30 min/);assert.match(html,/7\.50/);assert.match(html,/£150\.00/);
  assert.match(html,/Finalised shifts/);assert.match(html,/Invoice movements/);
  assert.match(html,/data-wsr-report-more/);assert.match(html,/Back to completed reports/);
});

test('zero-return report detail retains its attestation without inventing shifts or invoice totals',()=>{
  const html=view.render({contract:'WEEKLY_SOURCE_REPORT_HISTORY_V1'},{reportDetail:{
    report:{client:'Trust A',completion_kind:'NO_SHIFTS_TO_IMPORT',attestation:'Confirmed no shifts <today>'}}});
  assert.match(html,/No shifts to import/);assert.match(html,/Confirmed no shifts &lt;today&gt;/);
  assert.doesNotMatch(html,/Invoice movements|Total invoice charge|Finalised shifts/);
});
