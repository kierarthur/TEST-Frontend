// Source-only backup gate. Never publishes Office or accesses a database.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=args=>execFileSync('git',['-c','maintenance.auto=false','-c','gc.auto=0',...args],{maxBuffer:40000000});
const before='f2de35ec8a376a814aefab1db2d7cf099b888784';
assert.equal(git(['rev-parse','HEAD']).toString().trim(),before);
const files=git(['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
const rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['jwt',/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/],['github-token',/gh[pousr]_[A-Za-z0-9]{30,}/],['aws-access-key',/AKIA[0-9A-Z]{16}/]];
const findings=[];const pins=files.map(file=>{const bytes=fs.readFileSync(file),staged=git(['show',':'+file]);assert.deepEqual(bytes,staged,file+' saved/staged bytes');for(const [rule,re] of rules)if(re.test(bytes.toString()))findings.push({file,rule});return {file,bytes:bytes.length,sha256:sha(bytes)};});
assert.deepEqual(findings,[]);
const whitespace=spawnSync('git',['diff','--cached','--check'],{encoding:'utf8',windowsHide:true});
assert.equal(whitespace.status,0,'new source delta whitespace');
const checks=JSON.parse(fs.readFileSync('docs/healthroster-build/OFFICE_CORRECTION_READ_SOURCE_CHECKS_14102026.json'));
assert.equal(checks.status,'ACTUAL_MOUNTED_SOURCE_PASS_NATIVE_WORKFLOW_HELD');assert.equal(checks.steps.reduce((n,s)=>n+s.tests,0),515);assert.ok(checks.steps.every(s=>s.exitCode===0));
const result={status:'SOURCE_BACKUP_READY_NATIVE_AND_PUBLICATION_HELD',beforeCommit:before,sourceOnly:true,pins,credentialFindings:findings.length,rawNewDeltaWhitespaceExitCode:whitespace.status,sourceTests:515,
 initialFailures:['Initial managed gate 234/236: both stale r1 cache-version expectations.','First updated load-order check mistakenly expected r3 on the new reader asset; recorded failed receipt is retained. Actual reader asset is 20261014-correction-read-r1, main HealthRoster marker r3.','First checkpoint byte gate held for CRLF in our edited reachability test. Exact staged LF normalization is separately recorded; no assertion change or byte waiver.'],
 testChanges:'Update both exact main asset expectations; additionally require correction reader after settings and before main, retaining all existing load-order and import bridge assertions.',
 qualifiedNative:false,installation:false,publication:false,workflowCompletion:false};
const destination='docs/healthroster-build/OFFICE_CORRECTION_READ_CHECKPOINT_14102026.json';fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,pins:pins.length,checkpointSha256:sha(fs.readFileSync(destination)),sourceTests:515}));
