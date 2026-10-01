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
  assert.match(html,/Previous files/);assert.doesNotMatch(html,/Manage questions/);
});
test('protected creation is advertised only when server grants it',()=>{
  assert.doesNotMatch(view.render(model),/data-wsr-add-protected/);
  assert.match(view.render({...model,owners:[{protected_pay_enabled:true}]}),/data-wsr-add-protected/);
});
