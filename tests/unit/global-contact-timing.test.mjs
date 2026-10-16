import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const uuid='a2222222-2222-4222-8222-222222222222';
const settings=()=>({candidate_reminder_minutes:121,candidate_response_deadline_minutes:763,manager_digest_minutes:137,
 manager_manual_resend_cooldown_minutes:11,candidate_manual_reminder_cooldown_minutes:83,manager_secure_link_days:9,
 automatic_reconcile_actor_user_id:uuid,manager_first_delay_value:0,manager_first_delay_unit:'HOURS',
 manager_followups:[{sequence:1,interval_value:2,interval_unit:'CLIENT_WORKING_DAYS',mode:'MANUAL'}],
 manager_recent_completed_weeks:1,manager_max_work_age_days:14});
const state=()=>({ok:true,settings_version:'9007199254740993',policy_revision:'9007199254740993',settings:settings(),
 cutoff:{kind:'CLIENT_CUTOFF_PRECEDENCE',editable:false,explanation:'The actual Client cut-off overrides routine limits.'},
 actions:[{action:'SAVE_GLOBAL_CONTACT_TIMING',enabled:true,reason:null}]});
const save=()=>({request_id:uuid,expected_settings_version:'9007199254740993',settings:settings()});
function office({uncertain=false}={}){
 const requests=[];let server=state();let failed=false;
 const sandbox={module:{exports:{}},console,crypto:webcrypto,structuredClone,authFetch:async(url,options={})=>{
  if(url.endsWith('/source-groups'))return {ok:true,json:async()=>({source_groups:[]})};
  if(options.method==='PUT'){
   const body=JSON.parse(options.body);requests.push(body);assert.equal(typeof body.expected_settings_version,'string');assert.equal(typeof body.request_id,'string');
   server={...state(),settings_version:'9007199254740994',policy_revision:'9007199254740994',settings:body.settings};
   if(uncertain&&!failed){failed=true;throw new Error('response lost');}
  }
  return {ok:true,json:async()=>structuredClone(server)};
 }};
 vm.runInNewContext(fs.readFileSync(new URL('../../js/weekly-source/settings.js',import.meta.url),'utf8'),sandbox);
 return {api:sandbox.module.exports,sandbox,requests};
}
function form(d){
 const values={weekly_source_candidate_reminder_hours:d.candidate_reminder_minutes/60,weekly_source_candidate_deadline_hours:d.candidate_response_deadline_minutes/60,
  weekly_source_manager_digest_hours:d.manager_digest_minutes/60,weekly_source_manager_resend_minutes:d.manager_manual_resend_cooldown_minutes,
  weekly_source_candidate_resend_minutes:d.candidate_manual_reminder_cooldown_minutes,weekly_source_manager_link_days:d.manager_secure_link_days,
  weekly_source_manager_first_delay_value:d.manager_first_delay_value,weekly_source_manager_first_delay_unit:d.manager_first_delay_unit,
  weekly_source_manager_recent_completed_weeks:d.manager_recent_completed_weeks,weekly_source_manager_max_work_age_days:d.manager_max_work_age_days};
 return {querySelector(selector){const name=selector.match(/name="([^"]+)"/)?.[1];return name&&Object.hasOwn(values,name)?{value:String(values[name])}:null;},
  querySelectorAll(selector){if(selector==='[data-manager-followup-index]')return d.manager_followups.map(step=>({querySelector(selector){return {value:selector.includes('value')?String(step.interval_value):selector.includes('unit')?step.interval_unit:step.mode};}}));return [];}};
}
test('Office render and edited timing save preserve canonical137/11 and all unrelated configured values',async()=>{
 const o=office(),ctx={};const loaded=await o.api.loadGlobal(ctx);
 assert.equal(loaded.settings_version,'9007199254740993');const html=o.api.globalHtml(loaded);
 assert.ok(html.includes('value="11"'));assert.ok(html.includes('Manager contact timing'));
 const edited=settings();edited.manager_first_delay_value=3;edited.manager_followups=[];
 o.sandbox.document={querySelector:()=>form(edited)};
 await o.api.saveGlobal(ctx);assert.equal(o.requests.length,1);
 const actual=o.requests[0].settings;
 for(const key of ['candidate_reminder_minutes','candidate_response_deadline_minutes','manager_digest_minutes','manager_manual_resend_cooldown_minutes','candidate_manual_reminder_cooldown_minutes','manager_secure_link_days','automatic_reconcile_actor_user_id'])assert.equal(actual[key],settings()[key],key);
 assert.equal(actual.manager_first_delay_value,3);assert.deepEqual(actual.manager_followups,[]);
 assert.equal(Object.hasOwn(actual,'manager_partial_digest_minutes'),false);assert.equal(Object.hasOwn(actual,'manager_manual_send_cooldown_minutes'),false);
});
test('lost save response retries identical native request identity/body',async()=>{
 const o=office({uncertain:true}),ctx={};const loaded=await o.api.loadGlobal(ctx);loaded.draft.manager_first_delay_value=1;loaded.dirty=true;
 await assert.rejects(()=>o.api.saveGlobal(ctx),/response lost/);await o.api.saveGlobal(ctx);
 assert.deepEqual(o.requests[0],o.requests[1]);assert.equal(ctx[o.api.stateKeys.GLOBAL_STATE].settings_version,'9007199254740994');
});
test('changed draft after uncertainty requires fresh read',async()=>{
 const o=office({uncertain:true}),ctx={};const loaded=await o.api.loadGlobal(ctx);loaded.draft.manager_first_delay_value=1;loaded.dirty=true;
 await assert.rejects(()=>o.api.saveGlobal(ctx));loaded.draft.manager_first_delay_value=2;
 await assert.rejects(()=>o.api.saveGlobal(ctx),/refresh settings/);assert.equal(o.requests.length,1);
 await o.api.loadGlobal(ctx,true);assert.equal(ctx[o.api.stateKeys.GLOBAL_STATE].draft.manager_first_delay_value,1);
});
test('fresh server canonical settings replace old cached aliases and defaults',async()=>{
 const o=office(),ctx={[o.api.stateKeys.GLOBAL_STATE]:{loaded:true,draft:{manager_partial_digest_minutes:360,manager_manual_send_cooldown_minutes:5}}};
 const loaded=await o.api.loadGlobal(ctx,true);assert.equal(loaded.draft.manager_digest_minutes,137);assert.equal(loaded.draft.manager_manual_resend_cooldown_minutes,11);
 assert.equal(Object.hasOwn(loaded.draft,'manager_partial_digest_minutes'),false);
});
