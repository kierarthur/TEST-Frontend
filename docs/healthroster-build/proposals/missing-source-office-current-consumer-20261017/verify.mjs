// Non-writing finite feature verification. No network, auth, database or source regeneration.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..'),hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false','-C',root,...args],{maxBuffer:32*1024*1024});
assert.deepEqual(process.argv.slice(2),process.argv.includes('--committed')?['--committed']:[]);
assert(fs.realpathSync(root).replaceAll('\\','/').startsWith('D:/Development/GitHub/'));
for(const value of[git('rev-parse','--show-toplevel').toString().trim(),git('rev-parse','--absolute-git-dir').toString().trim(),path.resolve(root,git('rev-parse','--git-common-dir').toString().trim())])assert(fs.realpathSync(value).replaceAll('\\','/').startsWith('D:/Development/GitHub/'));
const manifest=JSON.parse(fs.readFileSync(here+'/MANIFEST.json'));
for(const e of manifest.files){const b=fs.readFileSync(root+'/'+e.path);assert.equal(b.length,e.savedBytes,e.path);assert.equal(hash(b),e.savedSha256,e.path);if(process.argv.includes('--committed'))for(const revision of[':'+e.path,'HEAD:'+e.path]){const c=git('show',revision);assert.equal(c.length,e.gitBytes,e.path);assert.equal(hash(c),e.gitSha256,e.path);}}
const parents=JSON.parse(fs.readFileSync(here+'/PARENT_EDITS.json'));
const{reverseMissingSourceParent}=await import('../../../../tests/helpers/missing-source-office-parent-reverse.mjs');
for(const e of parents.edits){const original=git('show',parents.parentCommit+':'+e.target),v=e.variants.find(v=>v.kind==='git');assert.equal(hash(original),v.inputSha256,e.target);const s=fs.readFileSync(root+'/'+e.target,'utf8'),before=reverseMissingSourceParent(e.target,s);assert.equal(before.replaceAll('\r\n','\n'),original.toString().replaceAll('\r\n','\n'));}
const pins=JSON.parse(fs.readFileSync(here+'/SOURCE_PINS.json')),capture=fs.readFileSync(here+'/reference/health-missing-accept.mjs');
assert.equal(hash(capture),pins.backend.files.find(f=>f.path==='broker/src/weekly-source/missing-accept.mjs').savedSha256);
for(const e of JSON.parse(fs.readFileSync(here+'/SELECTION.json')).targets){const b=fs.readFileSync(root+'/'+e.path);assert.equal(hash(b),e.savedSha256,e.path);}
console.log(JSON.stringify({verdict:'PASS_SOURCE_ONLY',manifestFiles:manifest.files.length,completeParents:parents.edits.length,hunks:parents.edits.reduce((n,e)=>n+e.variants[0].hunks.length,0),backendChanges:0,nativeCalls:0,committed:process.argv.includes('--committed')}));
