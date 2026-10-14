// One-time source WIP backup gate. No database, HTTP, secrets or deployment.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {execFileSync,spawnSync}from'node:child_process';import{createHash}from'node:crypto';
const before='cce7b6bce0903d11889f9c16a504bc097087a8df',sha=b=>createHash('sha256').update(b).digest('hex');
const git=args=>execFileSync('git',['-c','maintenance.auto=false','-c','gc.auto=0',...args],{maxBuffer:40000000});
assert.equal(git(['rev-parse','HEAD']).toString().trim(),before);
const selected=['css/weekly-source.css','index.html','js/main.js','js/weekly-source/import-workspace.js',
 'js/weekly-source/checklist.js','tests/unit/healthroster-train0.test.cjs','tests/unit/main-asset-cache-version.test.cjs',
 'tests/unit/weekly-source-entrypoint-reachability.test.cjs','tests/unit/weekly-source-import-workspace.test.cjs',
 'tests/unit/weekly-source-protected-resume-asset-cache.test.cjs','tests/unit/weekly-source-checklist.test.cjs',
 'tests/unit/weekly-source-checklist-mounted.test.cjs','docs/healthroster-build/OFFICE_CHECKLIST_WIP_14102026.md',
 'docs/healthroster-build/OFFICE_CHECKLIST_SOURCE_CHECKS_14102026.json',
 'docs/healthroster-build/OFFICE_CHECKLIST_SOURCE_CHECKS_FAILED_14102026.json','scripts/healthroster-checklist-checkpoint.mjs'];
assert.deepEqual(git(['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean).sort(),[...selected].sort());
const rules=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/,/gh[pousr]_[A-Za-z0-9]{30,}/,/AKIA[0-9A-Z]{16}/];
const syntax=[];
const pins=selected.map(file=>{const bytes=fs.readFileSync(file);assert.deepEqual(bytes,git(['show',':'+file]),file+' exact saved/staged');assert.ok(rules.every(re=>!re.test(bytes.toString())),file+' credential');
 if(/\.(mjs|js|cjs)$/.test(file)){const run=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,file);syntax.push({file,exitCode:0});}
 return{file,bytes:bytes.length,sha256:sha(bytes)};});
const changed=selected.filter(file=>{try{git(['cat-file','-e',before+':'+file]);return true;}catch{return false;}});
const diff=git(['diff','--cached','--binary',before,'--',...changed]);
const reverse=spawnSync('git',['apply','--reverse','--check','-'],{input:diff,encoding:'utf8',windowsHide:true});assert.equal(reverse.status,0,reverse.stderr);
const whitespace=spawnSync('git',['diff','--cached','--check'],{encoding:'utf8',windowsHide:true});assert.equal(whitespace.status,0,whitespace.stdout);
const checks=JSON.parse(fs.readFileSync('docs/healthroster-build/OFFICE_CHECKLIST_SOURCE_CHECKS_14102026.json'));assert.ok(checks.steps.every(step=>step.exitCode===0));assert.equal(checks.steps.reduce((count,step)=>count+step.tests,0),499);
const result={status:'ACTUAL_OFFICE_CHECKLIST_SOURCE_BACKUP_WIP_NATIVE_AND_ACTION_GATES_HELD',beforeCommit:before,sourceOnly:true,pins,syntax,
 wholeChangedFilesReverseCheck:true,changedFiles:changed,reverseDiffSha256:sha(diff),rawStagedWhitespaceExitCode:0,selectedCredentialFindings:0,
 sourceTests:499,sourceCheckReceiptSha256:sha(fs.readFileSync('docs/healthroster-build/OFFICE_CHECKLIST_SOURCE_CHECKS_14102026.json')),
 historicalCorrectionReadReceiptsPreserved:true,nativeMissing:checks.nativeMissing,independentSourceReview:'PENDING',native:false,browser:false,installation:false,publication:false};
const file='docs/healthroster-build/OFFICE_CHECKLIST_CHECKPOINT_14102026.json';fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,pins:pins.length,syntax:syntax.length,sourceTests:499,sha256:sha(fs.readFileSync(file))}));
