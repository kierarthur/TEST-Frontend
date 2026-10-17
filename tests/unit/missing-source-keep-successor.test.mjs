import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import{createRequire}from'node:module';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
import{reverseKeepSuccessorParent}from'../helpers/missing-source-keep-successor-parent-reverse.mjs';
const require=createRequire(import.meta.url),api=require('../../js/weekly-source-presentation-v1.js'),id='10000000-0000-0000-0000-000000000001',sha=v=>createHash('sha256').update(v).digest('hex');
const request=(decision,revision)=>({decision,decision_bundle_id:id,bundle_revision:revision});
const reply=(p,revision)=>({ok:true,idempotent_replay:false,decision:p.decision,decision_bundle_id:id,retained:false,published:true,reviewed_bundle_revision:p.bundle_revision,bundle_revision:revision});
test('real KEEP successor outcome restores the complete original numeric branch and supports lossless native int63',()=>{
 const original=execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false','show','ac112422e529aefbcba0fc0147d2b28123751823:js/main.js'],{maxBuffer:32*1024*1024}).toString();
 const block=original.slice(original.indexOf('  const accepted = (response, record) => {',original.indexOf('function bindWeeklySourceLaterChangeDecisions()'))).split('  const definiteRefusal')[0].trim();
 const accepted=vm.runInNewContext('('+block.replace(/^const accepted = /,'').replace(/;$/,'')+')');
 for(const decision of['KEEP_CURRENTLY_APPROVED_HOURS','APPROVE_UPDATED_HOURS']){const p=request(decision,3),v=reply(p,4);assert(accepted(v,{command:{body:{payload:p}}}));assert(api.isLaterChangeDecisionResult(v,p));for(const replay of[false,true])for(const published of[false,true])assert(api.isLaterChangeDecisionResult({...v,idempotent_replay:replay,published},p));
  for(const [from,to]of[['9007199254740993','9007199254740994'],['9223372036854775806','9223372036854775807']]){const q=request(decision,from);assert(api.isLaterChangeDecisionResult(reply(q,to),q));}
 }
});
test('retained KEEP stays same revision and every foreign/unsafe/overflow successor remains refused',()=>{const p=request('KEEP_CURRENTLY_APPROVED_HOURS','3'),v=reply(p,'4');assert(api.isLaterChangeDecisionResult({...v,retained:true,published:false,bundle_revision:'3'},p));
 for(const change of[{retained:true},{published:null},{reviewed_bundle_revision:'2'},{bundle_revision:'3'},{bundle_revision:'5'},{bundle_revision:9007199254740992},{bundle_revision:'04'},{decision_bundle_id:'foreign'},{decision:'UNKNOWN'},{ok:false},{idempotent_replay:null}])assert(!api.isLaterChangeDecisionResult({...v,...change},p));
 assert(!api.isLaterChangeDecisionResult(reply(request('UNKNOWN','3'),'4'),request('UNKNOWN','3')));
 const max=request('KEEP_CURRENTLY_APPROVED_HOURS','9223372036854775807');assert(!api.isLaterChangeDecisionResult(reply(max,'9223372036854775808'),max));
 const bytes=JSON.stringify({action:'LATER_CHANGE_DECISION',payload:request('KEEP_CURRENTLY_APPROVED_HOURS',3)});api.isLaterChangeDecisionResult(reply(JSON.parse(bytes).payload,4),JSON.parse(bytes).payload);assert.equal(JSON.stringify(JSON.parse(bytes)),bytes);
});
test('four complete forward parents reverse literally; missing/duplicate/foreign current source refuses',()=>{const p=JSON.parse(fs.readFileSync('docs/healthroster-build/proposals/missing-source-keep-successor-forward-20261017/FULL_PARENT_FORWARD.json'));for(const e of p.edits){const value=fs.readFileSync(e.target,'utf8'),v=e.variants.find(v=>sha(value)===v.outputSha256);assert(v);assert.equal(sha(reverseKeepSuccessorParent(e.target,value)),v.inputSha256);const h=v.hunks[0];for(const bad of[value+'\n// drift',value.replace(h.after,''),value+h.after])assert.throws(()=>reverseKeepSuccessorParent(e.target,bad));}});
