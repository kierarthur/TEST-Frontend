import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex');
const bytes=fs.readFileSync('docs/healthroster-build/proposals/kept-as-paid-office-20261017/PARENT_EDITS.json');
assert.equal(hash(bytes),'cf959d80385eb665c61dfffc8e62d3ced954285af2716fa145820f3feb654862');
export const keepParents=JSON.parse(bytes);
export function reverseKeepParent(file,value){
 const edit=keepParents.edits.find(x=>x.target===file);if(!edit)return value;
 // The original presentation working file uses CRLF while its Git blob uses
 // LF. Both forms have complete independent hashes; no other drift is allowed.
 const raw=hash(value)===edit.outputSha256;
 if(!raw){value=value.replaceAll('\r\n','\n');assert.equal(hash(value),edit.outputCanonicalSha256);}
 for(const h of [...edit.hunks].reverse()){
  const after=raw?h.after:h.after.replaceAll('\r\n','\n'),before=raw?h.before:h.before.replaceAll('\r\n','\n');
  assert.equal(value.split(after).length,2);value=value.replace(after,()=>before);
 }
 assert.equal(hash(value),raw?edit.inputSha256:edit.inputCanonicalSha256);return value;
}
