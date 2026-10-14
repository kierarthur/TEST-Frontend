// Effect-free source checks of actual Office mount; no HTTP/SQL/publication.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=b=>createHash('sha256').update(b).digest('hex');
const receipt=JSON.parse(fs.readFileSync(path.join(root,'docs/healthroster-build/OFFICE_CORRECTION_READ_MOUNT_14102026.json')));
const normalization=JSON.parse(fs.readFileSync(path.join(root,'docs/healthroster-build/OFFICE_CORRECTION_READ_INDEX_LF_14102026.json')));
const owners=receipt.owners.map(p=>p.file==='index.html'?{...p,authorRawSha256:p.sha256,sha256:normalization.savedStagedSha256}:p);
assert.equal(normalization.authorRawSha256,receipt.owners.find(p=>p.file==='index.html').sha256);assert.equal(normalization.removedCarriageReturns,1);
for(const p of owners){const bytes=fs.readFileSync(path.join(root,p.file));assert.equal(sha(bytes),p.sha256);assert.deepEqual(bytes,execFileSync('git',['show',':'+p.file],{cwd:root,maxBuffer:40000000}));}
const author='C:/Users/KierArthur/OneDrive - Arthur Rai/Documents/GitHub/.codex-worktrees/healthroster-v2-report-build-13102026';
const relative='docs/healthroster-build/proposals/install2-office-correction-read-session-successor-20261014';
for(const p of receipt.sourcePins)assert.equal(sha(fs.readFileSync(path.join(author,p.authorFile))),p.sha256);
const dir='docs/healthroster-build/office-correction-read-14102026';fs.mkdirSync(path.join(root,dir),{recursive:true});
const reverse=fs.readFileSync(path.join(author,relative,'CURRENT_OFFICE_READ_FULL_REVERSE.json')),derived=JSON.parse(reverse);
for(const owner of derived.changed_current_owners)if(owner.path==='index.html'){owner.author_raw_after_sha256=owner.after_sha256;owner.after_sha256=normalization.savedStagedSha256;for(const h of owner.hunks){h.before=h.before.replaceAll('\r\n','\n');h.after=h.after.replaceAll('\r\n','\n');}}
fs.writeFileSync(path.join(root,dir,'CURRENT_OFFICE_READ_FULL_REVERSE.json'),JSON.stringify(derived,null,2)+'\n');
const original=fs.readFileSync(path.join(author,relative,'office-correction-read.test.mjs'),'utf8');
const substitutions=[
 ["import {fileURLToPath} from 'node:url';","import {fileURLToPath} from 'node:url';\nimport {execFileSync} from 'node:child_process';",1],
 ['const dir=path.dirname(fileURLToPath(import.meta.url));',"const dir=path.dirname(fileURLToPath(import.meta.url));\nconst actualRoot=path.resolve(dir,'../../..');",1],
 ["path.join(dir,'forward/js/timesheet-correction-office-context.js')","path.join(actualRoot,'js/timesheet-correction-office-context.js')",1],
 ["path.join(dir,'forward',owner.path)","path.join(actualRoot,owner.path)",1],
 ["fs.readFileSync(path.join(dir,'before',owner.path),'utf8')","execFileSync('git',['show',recipe.actual_source_commit+':'+owner.path],{cwd:actualRoot,encoding:'utf8',maxBuffer:40000000})",1]
];let testSource=original.replaceAll('\r\n','\n');for(const [before,after,count]of substitutions){assert.equal(testSource.split(before).length-1,count);testSource=testSource.replaceAll(before,after);}
const testFile=dir+'/office-correction-read-mounted.test.mjs';fs.writeFileSync(path.join(root,testFile),testSource);
const prior=JSON.parse(fs.readFileSync(path.join(root,'docs/healthroster-build/OFFICE_SOURCE_GATES_14102026.json')));
const allowed=new Set(['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','PATHEXT','COMSPEC','USERPROFILE','APPDATA','LOCALAPPDATA']);
const backend='C:/Users/KierArthur/OneDrive - Arthur Rai/Documents/GitHub/.codex-worktrees/healthroster-install2-14102026';
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.has(k.toUpperCase()))),CLOUDTMS_TEST_BACKEND_SOURCE_ROOT:backend,CLOUDTMS_BACKEND_REPO:backend};
const jobs=[['mounted-source32',process.execPath,['--test','--test-reporter=tap',testFile]],
 ...receipt.owners.filter(p=>p.file.endsWith('.js')).map(p=>['syntax-'+p.file,process.execPath,['--check',p.file]]),
 ...['healthroster-mount-correction-read.mjs','healthroster-check-correction-read.mjs','healthroster-normalize-read-index.mjs'].map(p=>['syntax-'+p,process.execPath,['--check','scripts/'+p]]),
 ...prior.steps.map(s=>[s.name,process.execPath,['--test','--test-reporter=tap',...s.files]])];
const steps=[];for(const [name,command,args]of jobs){const r=spawnSync(command,args,{cwd:root,env,windowsHide:true,encoding:'utf8',maxBuffer:8000000}),out=(r.stdout??'')+(r.stderr??'');
 const step={name,exitCode:r.status,outputSha256:sha(out),tests:Number(out.match(/# tests (\d+)/)?.[1]??0),pass:Number(out.match(/# pass (\d+)/)?.[1]??0),fail:Number(out.match(/# fail (\d+)/)?.[1]??0),failedTitles:out.split(/\r?\n/).filter(x=>/^not ok \d+ - /.test(x))};
 steps.push(step);console.log(JSON.stringify(step));if(r.status!==0){fs.writeFileSync(path.join(root,'docs/healthroster-build/OFFICE_CORRECTION_READ_SOURCE_CHECKS_FAILED_14102026.json'),JSON.stringify({status:'SOURCE_GATE_HELD',sourceOnly:true,steps,native:false,publication:false},null,2)+'\n');}assert.equal(r.status,0,name);}
const result={status:'ACTUAL_MOUNTED_SOURCE_PASS_NATIVE_WORKFLOW_HELD',sourceOnly:true,authorCommit:receipt.authorCommit,sourcePins:receipt.sourcePins.length,owners,
 reverseSha256:sha(reverse),reboundTestSha256:sha(testSource),rebindings:substitutions.map(([before,after,count])=>({before,after,count})),steps,backendSourceRoot:backend,native:false,publication:false,
 initialReaderHolds:['First mount attempted .js rather than pinned .mjs backend path and held before writes; corrected to derive the exact path from published CURRENT_BACKEND_READ_SOURCE_PINS.',
 'Git filtered one authored HTML CRLF to LF. Exact raw staged gate held; one-byte source normalization is separately proved and original30 frozen inputs remain unchanged.',
 'Initial managed source gate: 234/236 passed; both failures were stale r1 main-asset expectations after the reviewed r3 reader mount. The r3 expectations now also require the correction module before main; no existing load-order assertion was removed.']};
fs.writeFileSync(path.join(root,'docs/healthroster-build/OFFICE_CORRECTION_READ_SOURCE_CHECKS_14102026.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,tests:steps.reduce((n,s)=>n+s.tests,0),steps:steps.length}));
