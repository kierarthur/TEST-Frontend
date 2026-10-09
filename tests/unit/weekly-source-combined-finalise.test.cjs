const { test }=require('node:test');
const assert=require('node:assert/strict');
const view=require('../../js/weekly-source/combined-finalise.js');
const model={contract:'WEEKLY_SOURCE_COMBINED_FINALISE_V1',list:'ready',counts:{ready:1,blocked:1,complete:0},
  scopes:[{key:'A',client:'Trust A',source:'NHSP',period:'27 Sep 2026',finalise_enabled:true,blocked_count:0},
    {key:'B',client:'Trust B',period:'27 Sep 2026',finalise_enabled:false,blocked_count:1}],
  rows:[{scope_key:'A',row_key:'shift',client:'Trust A',candidate:'<Nurse>',day_date:'Mon 21 Sep 2026',
    system_hours:'09:00–17:00 · 30 min break',profile_id:'NHSP_FINAL_BACKING_V1',invoice_charge:'£100.00',
    status:{text:'Ready'},actions:[{label:'Unavailable',enabled:false},{label:'Link candidate',enabled:true}]}],summary:{}};
test('combined Finalise lists reports once, with shift and financial details behind Open',()=>{
  const html=view.render(model);
  assert.match(html,/Trust A/);assert.match(html,/data-wsc-open-report="A">Open/);
  assert.doesNotMatch(html,/&lt;Nurse&gt;|£100.00|Reports to finalise|data-wsc-list="complete"/);
  assert.doesNotMatch(html,/data-wsc-select="B"/);
  const blocked=view.render({...model,list:'blocked'});
  assert.match(blocked,/data-wsc-select="B" disabled/);assert.match(blocked,/data-wsc-open-report="B"/);
});
test('single-client view hides the redundant client column; missing-report warning only appears when nonzero',()=>{
  assert.doesNotMatch(view.render(model,{filters:{client_id:'A'}}),/data-wsc-sort="client"/);
  assert.doesNotMatch(view.render(model),/missing finalisation reports for previous weeks/);
  assert.match(view.render({...model,summary:{missing_previous_reports:2}}),/2 missing finalisation reports for previous weeks/);
  assert.match(view.render({...model,summary:{missing_previous_reports:2}}),/data-wsc-progress="missing"/);
  assert.match(view.render({...model,summary:{reports_awaiting_finalisation:1}}),/data-wsc-progress="awaiting"/);
});
test('completed rows never show a selection or finalise action',()=>{
  const html=view.render({...model,scopes:model.scopes.map(item=>({...item,completed:true}))});
  assert.doesNotMatch(html,/data-wsc-review|data-wsc-select=/);
  assert.doesNotMatch(html,/data-wsc-list="complete"/);
});

test('Ready and Blocked use authoritative status row colours, not zebra/hover colours',()=>{
  assert.match(view.render(model),/<tr class="ws-query-nonblocking">/);
  assert.match(view.render({...model,list:'blocked'}),/<tr class="ws-query-hold">/);
  const css=require('node:fs').readFileSync(require('node:path').join(__dirname,'../../css/weekly-source.css'),'utf8');
  for(const tone of ['hold','nonblocking']) assert.match(css,new RegExp(`#modal\\.ctms-modern-modal :is\\(\\[data-wsr-table\\], \\[data-wsc-table\\], \\.ws-office-checks\\) tr\\.ws-query-${tone} > td \\{ background:`));
});

test('every displayed finalisation data column remains sortable',()=>{
  const html=view.render(model);
  for(const key of ['client','source','period'])
    assert.match(html,new RegExp(`data-wsc-sort="${key}"`));
});

test('empty lists are genuinely disabled and never presented as the selected list',()=>{
  const html=view.render({...model,list:'ready',counts:{ready:0,blocked:0,complete:2}});
  assert.match(html,/data-wsc-list="ready" aria-selected="false" disabled/);
  assert.match(html,/data-wsc-list="blocked" aria-selected="false" disabled/);
});
