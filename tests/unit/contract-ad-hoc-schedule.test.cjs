const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../js/main.js'), 'utf8');
function fn(name) {
  const match = source.match(new RegExp(`function ${name}\\([^\\n]*\\)[ \\t]*\\{[\\s\\S]*?\\r?\\n\\}`));
  assert.ok(match, name); return match[0];
}
function harness() {
  const controls = Array.from({length:35}, (_, i) => ({tagName:i%5<3?'INPUT':'BUTTON', value:'09:00', disabled:false, attrs:{}, setAttribute(k,v){this.attrs[k]=v;}, getAttribute(k){return this.attrs[k];}, removeAttribute(k){delete this.attrs[k];}}));
  const checkbox = { type:'checkbox', checked:false };
  const form = { querySelector: selector => selector.includes('is_ad_hoc') ? checkbox : null, querySelectorAll: () => controls };
  const data = {client_id:'client', candidate_id:'candidate', role:'CPN', start_date:'2026-10-12', end_date:'2026-10-25', rates_json:{paye_day:20,charge_day:30}, std_schedule_json:{mon:{start:'09:00',end:'17:00',break_minutes:30}}, std_hours_json:{mon:7.5}};
  const ctx = {data, formState:{main:{},pay:{}}};
  const sandbox = {window:{modalCtx:ctx,dispatchEvent(){}}, document:{querySelector:()=>form,getElementById:()=>null}, CSS:{escape:v=>v}, CustomEvent:class{}, console};
  const api = vm.runInNewContext(`${['contractAdHocEnabled','syncContractAdHocSchedule','setContractFormValue','computeContractSaveEligibility'].map(fn).join('\n')}; ({setContractFormValue,computeContractSaveEligibility})`, sandbox);
  return {api,ctx,controls};
}
test('actual checkbox setter clears and locks all 21 schedule inputs and 14 Copy/Paste controls; untick unlocks blank fields', () => {
  const {api,ctx,controls}=harness();
  const history={worked:'17:00', protected:true};ctx.data.history=history;
  api.setContractFormValue('is_ad_hoc', true);
  assert.equal(ctx.data.std_schedule_json,null);assert.equal(ctx.data.std_hours_json,null);
  assert.ok(controls.every(el=>el.disabled && el.attrs['data-ctms-intentional-lock']==='1'));
  assert.ok(controls.filter(el=>el.tagName==='INPUT').every(el=>el.value===''));
  for(const day of ['mon','tue','wed','thu','fri','sat','sun']) for(const part of ['start','end','break']) assert.equal(ctx.formState.main[`${day}_${part}`],'');
  api.setContractFormValue('is_ad_hoc',false);
  assert.ok(controls.every(el=>!el.disabled && !el.attrs['data-ctms-intentional-lock']));
  assert.ok(controls.filter(el=>el.tagName==='INPUT').every(el=>el.value===''));
  assert.equal(ctx.data.history,history);assert.equal(history.worked,'17:00');
  api.setContractFormValue('mon_start','10:00');assert.equal(ctx.formState.main.mon_start,'10:00');
  api.setContractFormValue('is_ad_hoc',true);assert.equal(ctx.formState.main.mon_start,'');
});
test('actual Save gate accepts blank ad hoc, rejects blank fixed schedule and retains rate/date guards', () => {
  const {api,ctx}=harness();api.setContractFormValue('is_ad_hoc',true);
  assert.equal(api.computeContractSaveEligibility().ok,true);
  api.setContractFormValue('is_ad_hoc',false);
  assert.equal(api.computeContractSaveEligibility().ok,false);
  ctx.formState.main.mon_start='09:00';ctx.formState.main.mon_end='17:00';
  assert.equal(api.computeContractSaveEligibility().ok,true);
  api.setContractFormValue('is_ad_hoc',true);ctx.data.rates_json={};
  assert.equal(api.computeContractSaveEligibility().ok,false);
});
test('unticking a saved legacy ad hoc Contract does not revive its hidden template on later rendering',()=>{
  const {api,ctx,controls}=harness();ctx.data.is_ad_hoc=true;
  api.setContractFormValue('is_ad_hoc',false);
  assert.equal(ctx.data.std_schedule_json,null);assert.equal(ctx.data.std_hours_json,null);
  assert.ok(controls.every(el=>!el.disabled));
  assert.equal(ctx.formState.main.mon_start,'');
  assert.equal(api.computeContractSaveEligibility().ok,false);
});
test('save serialization does not resurrect an ad hoc or explicitly cleared base pattern',()=>{
  assert.match(source,/adHocSchedule \? \{ schedule: null, issues: \[\] \} : buildScheduleJson\(\)/);
  assert.match(source,/if \(adHocSchedule\) std_hours_json = null/);
  assert.match(source,/if \(adHocSchedule\) std_schedule_json = null/);
  assert.match(source,/!fs.main\?\.__scheduleClearedForAdHoc && base.std_schedule_json/);
});
