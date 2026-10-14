// One-time Source read/view integration. No HTTP, database or publication.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=b=>createHash('sha256').update(b).digest('hex');
const author='C:/Users/KierArthur/OneDrive - Arthur Rai/Documents/GitHub/.codex-worktrees/healthroster-v2-report-build-13102026';
const beforeCommit='f2de35ec8a376a814aefab1db2d7cf099b888784',authorCommit='67fd9f4a0f8262536999f02146aaf47a77c5f701';
const git=(args,cwd=root)=>execFileSync('git',['-c','maintenance.auto=false','-c','gc.auto=0',...args],{cwd,windowsHide:true,maxBuffer:40000000});
assert.equal(git(['rev-parse','HEAD']).toString().trim(),beforeCommit);
assert.equal(git(['ls-remote','origin','refs/heads/codex/healthroster-v2-report-build-13102026'],author).toString().trim().split(/\s/)[0],authorCommit);
git(['merge-base','--is-ancestor',git(['rev-parse','origin/main']).toString().trim(),beforeCommit]);
const packets=[{folder:'install2-office-correction-read-consumer-20261014',count:14,manifest:'2d39c34ce67e3255b362cd9c8427fec4700b202790f624bbb4b6c044ce5354d6'},
 {folder:'install2-office-correction-read-session-successor-20261014',count:16,manifest:'ad0f5b3915d7e56004710dc55fd8b434e42acdb91f0cbd651535df19df9c002f'}];
const sourcePins=[];for(const packet of packets){const relative='docs/healthroster-build/proposals/'+packet.folder;
 const raw=fs.readFileSync(path.join(author,relative,'REVIEW_MANIFEST.json'));assert.equal(sha(raw),packet.manifest);
 const manifest=JSON.parse(raw);assert.equal(manifest.artifact_count,packet.count);assert.equal(manifest.entries.length+1,packet.count);
 for(const p of [...manifest.entries,{path:'REVIEW_MANIFEST.json',bytes:raw.length,sha256:sha(raw)}]){
  const file=relative+'/'+p.path,bytes=fs.readFileSync(path.join(author,file));assert.equal(bytes.length,p.bytes);assert.equal(sha(bytes),p.sha256);
  assert.deepEqual(bytes,git(['show',authorCommit+':'+file],author));sourcePins.push({authorFile:file,sha256:sha(bytes),bytes:bytes.length});
 }
}
const successor='docs/healthroster-build/proposals/'+packets[1].folder;
const recipe=JSON.parse(fs.readFileSync(path.join(author,successor,'CURRENT_OFFICE_READ_FULL_REVERSE.json')));
const writes=[];for(const owner of recipe.changed_current_owners){const before=fs.readFileSync(path.join(root,owner.path)),after=fs.readFileSync(path.join(author,successor,'forward',owner.path));
 assert.equal(sha(before),owner.before_sha256);assert.equal(sha(after),owner.after_sha256);assert.deepEqual(before,git(['show',beforeCommit+':'+owner.path]));
 let reverse=after.toString();for(const h of [...owner.hunks].reverse()){assert.equal(reverse.split(h.after).length,2);reverse=reverse.replace(h.after,h.before);}assert.deepEqual(Buffer.from(reverse),before);
 writes.push({file:owner.path,bytes:after,sha256:sha(after),beforeSha256:sha(before),fullReverseHunks:owner.hunks.length});
}
for(const module of recipe.new_modules){assert.ok(!fs.existsSync(path.join(root,module.path)));const bytes=fs.readFileSync(path.join(author,successor,'forward',module.path));
 assert.equal(sha(bytes),module.after_sha256);writes.push({file:module.path,bytes,sha256:sha(bytes),beforeAbsent:true});}
const backend='C:/Users/KierArthur/OneDrive - Arthur Rai/Documents/GitHub/.codex-worktrees/healthroster-install2-14102026';
const backendPins=JSON.parse(fs.readFileSync(path.join(author,successor,'CURRENT_BACKEND_READ_SOURCE_PINS.json')));
assert.equal(sha(fs.readFileSync(path.join(backend,backendPins.context.path))),recipe.backend_context_module_sha256);
assert.equal(sha(fs.readFileSync(path.join(backend,backendPins.current_me.path))),backendPins.current_me.full_source_raw_sha256);
const destination=path.join(root,'docs/healthroster-build/OFFICE_CORRECTION_READ_MOUNT_14102026.json');assert.ok(!fs.existsSync(destination));
for(const w of writes){fs.mkdirSync(path.dirname(path.join(root,w.file)),{recursive:true});fs.writeFileSync(path.join(root,w.file),w.bytes);}
fs.mkdirSync(path.dirname(destination),{recursive:true});const receipt={status:'SOURCE_MOUNT_NATIVE_AND_WORKFLOW_HELD',beforeCommit,authorCommit,
 incomingMain:git(['rev-parse','origin/main']).toString().trim(),sourcePins,owners:writes.map(({bytes,...v})=>v),
 backendContextSha256:recipe.backend_context_module_sha256,backendSource:git(['rev-parse','HEAD'],backend).toString().trim(),
 readOnly:true,mutationCommands:[],native:false,publication:false,frozenPacketsPreserved:true,reviewedSessionRolesSuccessor:true};
fs.writeFileSync(destination,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,authorSourcePins:sourcePins.length,owners:receipt.owners}));
