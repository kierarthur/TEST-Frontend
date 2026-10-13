const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
require('../../js/weekly-source/rule-set-validation.js');
const rules=require('../../js/weekly-source/rule-settings.js');
const catalogue={contract:'WEEKLY_SOURCE_RULE_SETS_V1',rule_sets:[],assignments:[]};
const group={id:'22222222-2222-4222-8222-222222222222',source_family:'ROSTER',display_name:'Synthetic roster',expected_version:7,active:true};
const state=()=>{const s=rules.initial();s.catalogue=rules.catalogue(catalogue);s.editor={...s.editor,source_group_id:group.id,code:'TEST_RULES',display_name:'Synthetic rules'};return s;};
test('immutable version request is closed and replay-stable after a failed save',()=>{
 const s=state(),a=rules.saveBody(s),b=rules.saveBody(s);
 assert.deepEqual(a,b);assert.equal(a.rule_set.expected_version,0);assert.equal(a.rule_set.id,null);
 assert.deepEqual(Object.keys(a).sort(),['request_id','rule_set','source_group_id','values']);
 s.editor.display_name='Changed name';assert.notEqual(rules.saveBody(s).request_id,a.request_id);
 assert.equal(Object.hasOwn(a,'actor_user_id'),false);assert.equal(Object.hasOwn(a,'feature_enabled'),false);
});
test('syntax refusal occurs before a request id is retained',()=>{
 const s=state();s.editor.values.invoice_amount_basis='SOURCE_AMOUNT';
 assert.throws(()=>rules.saveBody(s),/source file|chosen invoice amount/);assert.equal(s.requests.size,0);
});
test('NULL assignment uses the exact group CAS and separate request scope without modifying global settings',()=>{
 const s=state();s.assignment={source_group_id:group.id,rule_set_version_id:'',effective_from_week_ending:'2026-11-01',effective_to_week_ending:''};
 const before=JSON.stringify(group),a=rules.assignmentBody(s,[group]);assert.equal(a.rule_set_version_id,null);assert.equal(a.expected_group_version,7);
 s.groupVersions.set(group.id,8);assert.equal(rules.assignmentBody(s,[group]).expected_group_version,8);assert.equal(JSON.stringify(group),before);
 assert.equal(Object.hasOwn(a,'feature_enabled'),false);assert.equal(Object.hasOwn(a,'source_group_id'),false);
 assert.throws(()=>rules.assignmentBody(s,[{...group,source_family:'NHSP'}]),/Roster/);
});
test('render escapes names and hides all mutable preset values for agency invoices',()=>{
 const s=state();s.editor.values={...global.CloudTMSWeeklySourceRuleValues.defaults,checking_profile_kind:'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1',invoice_sender:'AGENCY_INVOICE',earliest_final_weekday:null,earliest_final_local_time:null};
 s.editor.display_name='<script>alert(1)</script>';const html=rules.html(s,[group,{...group,id:'other',source_family:'NHSP',display_name:'NHSP'}]);
 assert.doesNotMatch(html,/<script>|name="rule_value_(line_vat_method|checking_profile_kind)"|<option value="other"/);
 assert.match(html,/Attach the HealthRoster section/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/data-rule-activate/);
});
test('unknown catalogue fails closed and dates retain the Office display format',()=>{
 assert.throws(()=>rules.catalogue({rule_sets:[],assignments:[]}),/confirmed/);
 assert.throws(()=>rules.catalogue({...catalogue,rule_sets:[{id:'x',versions:[]}]}),/read/);
 assert.equal(rules.dateText('2026-11-01'),'01/11/2026');
});
test('saved shell loads syntax and UI modules before settings and retains the existing settings owner',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 assert.ok(html.indexOf('weekly-source/rule-set-validation.js')<html.indexOf('weekly-source/rule-settings.js'));
 assert.ok(html.indexOf('weekly-source/rule-settings.js')<html.indexOf('weekly-source/settings.js'));
 const source=fs.readFileSync(path.join(__dirname,'../../js/weekly-source/settings.js'),'utf8');assert.match(source,/CloudTMSWeeklySourceRuleSettings\?\.mount\(root, ctx, state\.source_groups/);
});
