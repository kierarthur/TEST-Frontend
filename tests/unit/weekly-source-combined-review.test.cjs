const {test}=require('node:test');
const assert=require('node:assert/strict');
const view=require('../../js/weekly-source/combined-review.js');
const model={contract:'WEEKLY_SOURCE_COMBINED_REVIEW_V1',tab:'queries',section:'checks',
  counts:{checks:1},owners:[],rows:[{combined_key:'check',candidate:'<Baljit>',client:'Trust A',
    source:'NHSP',period:'27 Sep 2026',day_date:'21 Sep 2026',system_hours:'09:00–17:00 · 30 min break',
    status:{text:'Needs action'},problem:'Choose the correct candidate.',
    actions:[{label:'Link candidate',enabled:true},{label:'Unavailable',enabled:false}]}]};

test('Office checks, hours questions and protected shifts retain status colouring on every row',()=>{
  for(const section of ['checks','questions','protected']) {
    const rows=[1,2].map(id=>({combined_key:String(id),candidate:'Test',pay_blocking:false,children:[{issue:'Timesheet missing'}],actions:[]}));
    const html=view.render({...model,section,rows});
    assert.equal((html.match(/data-wsr-group="[12]" class="ws-query-nonblocking"/g)||[]).length,2);
  }
  assert.match(view.render({...model,rows:[{combined_key:'blocked',pay_blocking:true,actions:[]}]}),/class="ws-query-hold"/);
});
test('protected review needs server-confirmed attention and retains original action indexes',()=>{
  for (const requires_attention of [false, undefined, true]) {
    const html=view.render({...model,section:'protected',rows:[{combined_key:'protected',requires_attention,
      actions:[{label:'Review protected pay',enabled:true},{label:'Change protected shift',enabled:true},
        {label:'Review and reconcile',enabled:true}]}]});
    assert.match(html,/data-wsr-action="1">Change protected shift/);
    if (requires_attention===true) {
      assert.match(html,/data-wsr-action="0">Review protected pay/);
      assert.match(html,/data-wsr-action="2">Review and reconcile/);
      assert.equal((html.match(/class="btn ws-protected-review-ready"/g)||[]).length,2);
      assert.match(html,/class="btn btn-outline"[^>]*data-wsr-action="1">Change protected shift/);
    } else assert.doesNotMatch(html,/Review protected pay|Review and reconcile/);
  }
});
test('protected review readiness colour never applies to disabled, busy or unrelated actions',()=>{
  const row={combined_key:'protected',requires_attention:true,actions:[
    {label:'Review protected pay',enabled:false},{label:'Review and reconcile',enabled:true},
    {label:'Change protected shift',enabled:true}]};
  const html=view.render({...model,section:'protected',rows:[row]});
  assert.match(html,/class="btn btn-outline"[^>]*data-wsr-action="0" disabled>Review protected pay/);
  assert.equal((html.match(/ws-protected-review-ready/g)||[]).length,1);
  assert.doesNotMatch(view.render({...model,section:'protected',rows:[row]},{busy:true}),/ws-protected-review-ready/);
  assert.doesNotMatch(view.render({...model,section:'checks',rows:[row]}),/ws-protected-review-ready/);
});
test('attention uses the complete server census, not visible rows or tab totals',()=>{
  const html=view.render({...model,counts:{questions:20,checks:10,protected:40},rows:[],
    attention:{complete:true,missing_source:1,questions:1,checks:1,protected:3,total:6}});
  assert.match(html,/Needs attention/);
  assert.match(html,/data-wsr-section="questions" data-wsr-attention="missing_source"[^]*?Shift missing[^]*?<strong>1<\/strong>/);
  assert.match(html,/data-wsr-section="questions" data-wsr-attention="questions"[^]*?Hours don’t agree[^]*?<strong>1<\/strong>/);
  assert.match(html,/data-wsr-section="checks" data-wsr-attention[^]*?<strong>1<\/strong>/);
  assert.match(html,/data-wsr-section="protected" data-wsr-attention[^]*?Protected shifts ready to reconcile[^]*?<strong>3<\/strong>/);
  assert.match(html,/title="The candidate reported working this shift, but it has no matching row in the import/);
  assert.match(html,/title="A finalised import is available to compare with the protected payment/);
  assert.match(html,/Protected shifts \(40\)/);
  assert.ok(html.indexOf('Needs attention')<html.indexOf('ws-inner-tabs'));
});
test('waiting-only protection and missing Timesheet are not invented attention items',()=>{
  const html=view.attentionSummary({...model,counts:{questions:1,checks:0,protected:2},
    attention:{complete:true,missing_source:0,questions:0,checks:0,protected:0,total:0}},{});
  assert.match(html,/No decisions outstanding/);
  assert.doesNotMatch(html,/data-wsr-attention/);
});

test('unfinished file recheck never displays a reassuring all-clear and keeps prior checks visible',()=>{
  const html=view.render({...model,summary:{recheck_pending_count:2},counts:{checks:2},
    attention:{complete:true,missing_source:0,questions:0,checks:0,protected:0,total:0},
    rows:[{...model.rows[0],candidate:'Baljit',status:{text:'Recheck incomplete'},
      problem:'Selection saved; replacement check incomplete.',actions:[{label:'Retry recheck',enabled:true}]},
      {...model.rows[0],combined_key:'rate',candidate:'Kier',pay_blocking:false,
        problem:'Previous contract charge warning — replacement check incomplete.',actions:[]}]});
  assert.match(html,/Source recheck incomplete/);
  assert.match(html,/Office checks \(2\)/);
  assert.match(html,/Baljit/);assert.match(html,/Kier/);assert.match(html,/Retry recheck/);
  assert.match(html,/ws-query-nonblocking/);
  assert.doesNotMatch(html,/No decisions outstanding|No matching work/);
});
test('attention displays only positive outstanding categories without hiding normal tabs',()=>{
  const html=view.render({...model,attention:{complete:true,missing_source:0,questions:0,checks:1,protected:0,total:1}});
  assert.match(html,/data-wsr-section="checks" data-wsr-attention/);
  assert.doesNotMatch(html,/data-wsr-section="questions" data-wsr-attention|data-wsr-section="protected" data-wsr-attention/);
  assert.match(html,/Hours questions \(0\)|Protected shifts \(0\)/);
});
test('missing, partial, malformed or contradictory attention census is not reassuring zero',()=>{
  for(const attention of [null,{complete:false},{complete:true,missing_source:0,questions:0,checks:0,protected:0,total:1},
    {complete:true,missing_source:0,questions:'1',checks:0,protected:0,total:1},
    {complete:true,missing_source:0,questions:-1,checks:1,protected:0,total:0},
    {complete:true,questions:0,checks:0,protected:0,total:0}]){
    const html=view.attentionSummary({...model,attention},{});
    assert.match(html,/Refresh to verify/);assert.doesNotMatch(html,/No decisions outstanding|data-wsr-attention/);
  }
});
test('attention links are disabled during mutations and absent from Imports and History',()=>{
  assert.match(view.attentionSummary({...model,attention:{complete:true,missing_source:0,questions:1,checks:0,protected:0,total:1}},
    {busy:true}),/data-wsr-attention="questions" disabled/);
  for(const tab of ['imports','history'])assert.equal(view.attentionSummary({...model,tab},{}),'');
});
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

test('attention question view keeps exact shift actions without hidden whole-cohort contact commands',()=>{
  const questions={...model,section:'questions',rows:[{combined_key:'missing',candidate:'Worker',
    actions:[{label:'Remind candidate'},{label:'Remind missing Timesheet'},{label:'Open'}],
    children:[{incident_id:'visible',issue:'Missing or not yet authorised',actions:[{label:'Protect pay'}]}]}]};
  const narrowed=view.render({...questions,attention_kind:'missing_source'});
  assert.doesNotMatch(narrowed,/data-wsr-select|data-wsr-outreach|Remind candidate|Remind missing Timesheet/);
  assert.match(narrowed,/data-wsr-action="2">Open/);
  assert.match(narrowed,/data-wsr-child="0" data-wsr-action="0">Protect pay/);
  assert.match(narrowed,/data-wsr-section="questions"[^>]*>Hours questions/);
  const full=view.render(questions);
  assert.match(full,/data-wsr-select|data-wsr-outreach/);
  assert.match(full,/Remind candidate/);
});

test('query summary distinguishes problems and recorded replies from contact alone',()=>{
  const base={source:'A named trust group',source_family:'NHSP',children:[{issue:'Hours differ',candidate_contacted_at:'1 Sep 2026, 14:30',manager_contacted_at:'1 Sep 2026, 14:35'}]};
  assert.equal(view.questionSummary(base).problem,'Mismatch');
  assert.equal(view.questionSummary(base).candidate,'Candidate contacted');
  assert.equal(view.questionSummary(base).manager,'Manager contacted');
  assert.equal(view.questionSummary(base).next,'Await manager reply');
  base.children.push({issue:'Timesheet missing'});
  assert.equal(view.questionSummary(base).problem,'Multiple');
  base.children[0].candidate_response='My hours are correct';
  assert.equal(view.questionSummary(base).next,'Query in NHSP');
  base.children[0].manager_response='Reported a source correction';
  assert.equal(view.questionSummary(base).next,'Import corrected source');
  base.children[1].manager_response='Reported a source correction';
  assert.equal(view.questionSummary(base).next,'Import corrected source');
  const html=view.render({...model,section:'questions',rows:[base]});
  assert.match(html,/Next action/);assert.doesNotMatch(html,/Candidate asked|Manager informed<\/th>/);
});

test('NHSP guidance uses the server source family, not a display name',()=>{
  const row={source:'NHSP',source_family:'ROSTER',children:[{issue:'Hours differ',candidate_response:'My hours are correct'}]};
  assert.equal(view.questionSummary(row).next,'Review response');
});
test('Office checks distinguish pay-blocking identity work from charge decisions',()=>{
  const rows=[{...model.rows[0],combined_key:'identity',pay_blocking:true},
    {...model.rows[0],combined_key:'charge',candidate:'Kier',problem:'Accept final charge',pay_blocking:false}];
  const html=view.render({...model,rows});
  assert.match(html,/<tr data-wsr-group="identity" class="ws-query-hold">[^]*&lt;Baljit&gt;/);
  assert.match(html,/<tr data-wsr-group="charge" class="ws-query-nonblocking">[^]*Accept final charge/);
});

test('manual Office check shows author, UK time and a short escaped reason, retaining full context on hover',()=>{
  const reason='Should be an extra hour here and please double check the manager approval <script> before accepting source';
  const html=view.render({...model,section:'checks',rows:[{combined_key:'manual-check',candidate:'Worker',client:'Trust A',
    day_date:'8 Sep 2026',pay_blocking:true,manual_query:{opened_by:'Kier Arthur',opened_at_uk:'1 Sep 2026, 14:30',reason},
    actions:[{label:'Protect pay',enabled:true}]}]});
  assert.match(html,/Manually queried/);
  assert.match(html,/Kier Arthur · 1 Sep 2026, 14:30/);
  assert.match(html,/“Should be an extra hour here and please double check…/);
  assert.match(html,/title="Kier Arthur queried this on 1 Sep 2026, 14:30 because/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/<tr data-wsr-group="manual-check" class="ws-query-hold">/);
  assert.match(html,/data-wsr-action="0">Protect pay/);
  assert.equal((html.match(/class="ws-query-problem"/g)||[]).length,1);
});

test('several manual Office checks retain their own reasons',()=>{
  const rows=[{combined_key:'manual-1',candidate:'Worker',pay_blocking:true,manual_query:{opened_by:'Kier Arthur',opened_at_uk:'1 Sep 2026, 14:30',reason:'First reason'}},
    {combined_key:'manual-2',candidate:'Worker',pay_blocking:true,manual_query:{opened_by:'Alex Office',opened_at_uk:'2 Sep 2026, 09:00',reason:'Second reason'}}];
  const html=view.render({...model,section:'checks',rows});
  assert.match(html,/data-wsr-group="manual-1"/);
  assert.match(html,/data-wsr-group="manual-2"/);
  assert.match(html,/First reason/);
  assert.match(html,/Second reason/);
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
