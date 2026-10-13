import {expect,test} from '@playwright/test';
import {externalRequests,mountOfficeShell} from './helpers/weekly-source-local-shell';
test.use({storageState:{cookies:[],origins:[]},serviceWorkers:'block'});
const group={id:'f7120000-0000-4000-8000-000000000001',source_family:'ROSTER',display_name:'Synthetic group',expected_version:7,active:true};
const setId='f7120000-0000-4000-8000-000000000002',versionId='f7120000-0000-4000-8000-000000000003';
test('saved Office rule editor preserves replay identity, immutable versions and group CAS',async({page})=>{
 let model:any={contract:'WEEKLY_SOURCE_RULE_SETS_V1',rule_sets:[],assignments:[]};const writes:any[]=[];
 await mountOfficeShell(page,{async broker(path,method,body,route){
  if(path==='/api/weekly-source/v1/settings/rule-sets'&&method==='GET')return model;
  if(path==='/api/weekly-source/v1/settings/rule-sets'&&method==='PUT'){
   writes.push({path,body});const b:any=body;
   if(writes.length===1){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Source rules cannot be confirmed right now.'})});return null;}
   model={...model,rule_sets:[{id:setId,code:b.rule_set.code,display_name:b.rule_set.display_name,version:1,versions:[{id:versionId,version_number:1,values:b.values}]}]};
   return {contract:'WEEKLY_SOURCE_RULE_SET_SAVED_V1',rule_set_id:setId,rule_set_version_id:versionId};
  }
  if(path.endsWith(`/source-groups/${group.id}/rules`)&&method==='PUT'){
   writes.push({path,body});const b:any=body;
   model.assignments=[{id:'f7120000-0000-4000-8000-000000000004',source_group_id:group.id,rule_set_version_id:versionId,effective_from_week_ending:b.effective_from_week_ending,effective_to_week_ending:null,feature_enabled:false}];
   return {contract:'WEEKLY_SOURCE_RULE_ASSIGNED_V1',source_group_id:group.id,source_group_version:8,feature_enabled:false};
  }
  return undefined;
 }});
 await page.waitForFunction(()=>!!(window as any).CloudTMSWeeklySourceRuleSettings);
 await page.evaluate(group=>{(window as any).__getModalFrame=()=>({mode:'edit'});const root=document.createElement('div');root.id='rule-proof-root';document.body.append(root);(window as any).CloudTMSWeeklySourceRuleSettings.mount(root,{},[group]);},group);
 const host=page.locator('[data-weekly-source-rule-settings]');
 await host.locator('[name="rule_name"]').fill('Synthetic rules');await host.locator('[name="rule_code"]').fill('TEST_RULES');await host.locator('[name="rule_group"]').selectOption(group.id);
 await host.locator('[name="rule_value_checking_profile_kind"]').selectOption('ROSTER_WEEKLY_SUMMARY_ACTUAL_V1');await expect(host).toContainText('Earliest final upload: Not used.');
 await host.getByRole('button',{name:'Save new version',exact:true}).click();await expect(host.locator('[data-rule-status]')).toContainText('cannot be confirmed');
 await host.getByRole('button',{name:'Save new version',exact:true}).click();await expect(host.locator('[data-rule-status]')).toContainText('immutable rule version saved');
 expect(writes[0].body.request_id).toBe(writes[1].body.request_id);expect(writes[1].body.values.earliest_final_weekday).toBeNull();expect(writes[1].body.rule_set.expected_version).toBe(0);
 await host.locator('[name="assignment_group"]').selectOption(group.id);await host.locator('[name="assignment_from"]').fill('2026-11-01');await host.getByRole('button',{name:'Save assignment',exact:true}).click();
 await expect(host.locator('[data-rule-status]')).toContainText('not enabled');await expect(host).toContainText('01/11/2026');expect(writes[2].body.expected_group_version).toBe(7);expect(writes[2].body.rule_set_version_id).toBe(versionId);
 expect(writes.every(w=>!Object.hasOwn(w.body,'feature_enabled')&&!Object.hasOwn(w.body,'actor_user_id'))).toBe(true);
 await page.setViewportSize({width:390,height:1000});await expect(host.getByRole('button',{name:'Save new version',exact:true})).toBeVisible();
 expect(externalRequests(page)).toEqual([]);
});
test('view mode disables mutations and an unavailable rule service leaves a retry',async({page})=>{
 await mountOfficeShell(page,{broker(path){if(path==='/api/weekly-source/v1/settings/rule-sets')return {contract:'UNSUPPORTED'};return undefined;}});
 await page.waitForFunction(()=>!!(window as any).CloudTMSWeeklySourceRuleSettings);
 await page.evaluate(group=>{(window as any).__getModalFrame=()=>({mode:'view'});const root=document.createElement('div');document.body.append(root);(window as any).CloudTMSWeeklySourceRuleSettings.mount(root,{},[group]);},group);
 const host=page.locator('[data-weekly-source-rule-settings]');await expect(host).toContainText('cannot be confirmed');await expect(host.getByRole('button',{name:'Retry',exact:true})).toBeEnabled();await expect(host.getByRole('button',{name:'Save new version',exact:true})).toHaveCount(0);expect(externalRequests(page)).toEqual([]);
});
