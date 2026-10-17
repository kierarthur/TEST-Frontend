import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const id='10000000-0000-4000-8000-000000000001';
const value=extra=>({version:'TIMESHEET_CORRECTION_ENTRY_V1',requested_timesheet_id:id,current_timesheet_id:id,placement_revision:'9007199254740993',purpose:'CONTRACT_CORRECTION',may_open_review:false,disabled_reason:'REVIEW_UNAVAILABLE',...extra});
function fixture({reply=value(),onFetch=()=>{},onJson=()=>{}}={}){
 let current=true;const calls=[];
 const binding={initialTimesheetId:id,current:()=>current,context:{timesheetDetails:{timesheet:{sheet_scope:'WEEKLY'}}}};
 const sandbox={encodeURIComponent,API:p=>'https://test.invalid'+p,healthTimesheetCorrectionBinding:()=>binding,
  authFetch:async(...args)=>{calls.push(args);onFetch(()=>{current=false;});return {ok:true,json:async()=>{onJson(()=>{current=false;});return reply;}};},
  CloudTMSTimesheetContractMoveV1:{open(){throw Error('MUST_NOT_OPEN');},createTimesheetOverlayAdapter(){throw Error('MUST_NOT_MOUNT');}}};
 sandbox.window=sandbox;vm.createContext(sandbox);
 vm.runInContext(fs.readFileSync('js/timesheet-correction-entry-v1.js','utf8'),sandbox);
 const main=fs.readFileSync('js/main.js','utf8'),a=main.indexOf('async function openTimesheetContractMoveReview('),b=main.indexOf('function openNativeDailyRateCorrection(',a);
 assert(a>=0&&b>a);vm.runInContext(main.slice(a,b),sandbox);
 return {sandbox,binding,calls,run:()=>vm.runInContext(`openTimesheetContractMoveReview({timesheetId:'${id}'})`,sandbox)};
}
test('actual classic loader is hashed once before main and exposes a frozen advisory API',()=>{
 const f=fixture(),index=fs.readFileSync('index.html','utf8'),name='js/timesheet-correction-entry-v1.js';
 const hash=createHash('sha256').update(fs.readFileSync(name)).digest('hex');
 assert.equal(index.split(`./${name}?v=${hash}`).length,2);
 assert(index.indexOf('./'+name)<index.indexOf('./js/main.js?'));
 assert(Object.isFrozen(f.sandbox.CloudTMSCorrectionEntryV1));
});
test('actual saved Contract caller reads genuine advisory entry then refuses before mounting CM17',async()=>{
 const f=fixture();await assert.rejects(f.run(),/REVIEW_UNAVAILABLE/);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],`https://test.invalid/api/timesheets/${id}/correction-entry`);
 assert.equal(f.calls[0][1].method,'GET');assert.equal(f.calls[0][1].cache,'no-store');
});
test('certified pending, Daily and stale fetch/decode cannot open or adopt the old parent',async()=>{
 await assert.rejects(fixture({reply:value({current_timesheet_id:null,disabled_reason:'CURRENT_ALLOCATION_PENDING'})}).run(),/CURRENT_ALLOCATION_PENDING/);
 const daily=fixture();daily.binding.context.timesheetDetails.timesheet.sheet_scope='DAILY';await assert.rejects(daily.run(),/CORRECTION_CURRENT_PARENT_REQUIRED/);assert.equal(daily.calls.length,0);
 for(const boundary of ['onFetch','onJson'])await assert.rejects(fixture({[boundary]:invalidate=>invalidate()}).run(),/CORRECTION_CURRENT_PARENT_REQUIRED/);
});
test('forged readiness, overflow, foreign parent and unknown financial fields cannot enable the saved caller',async()=>{
 for(const extra of [{may_open_review:true},{placement_revision:'9223372036854775808'},{requested_timesheet_id:'10000000-0000-4000-8000-000000000002'},{financial:{state:'READY'}}])
  await assert.rejects(fixture({reply:value(extra)}).run(),/CORRECTION_ENTRY_INVALID_RESPONSE/);
});
