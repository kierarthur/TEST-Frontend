import fs from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex');
const bytes=fs.readFileSync('docs/healthroster-build/proposals/paid-overlap-office-20261017/PARENT_EDITS.json');
assert.equal(hash(bytes.toString().replaceAll('\r\n','\n')),'11a176b385062e4ead5684e7cb2c70d923d9da440e29eaefc093cf45ecfd3818');
export const paidMatchParents=JSON.parse(bytes);
export function reversePaidMatchParent(file,value){
 const edit=paidMatchParents.edits.find(e=>e.target===file);if(!edit)return value;
 const raw=hash(value)===edit.outputSha256;
 if(!raw){const lf=value.replaceAll('\r\n','\n');assert(value===lf||value===lf.replaceAll('\n','\r\n'),'Only exact complete LF/CRLF checkout forms are permitted');value=lf;assert.equal(hash(value),edit.outputCanonicalSha256);}
 const lines=value.match(/[^\n]*\n|[^\n]+$/g)||[];
 for(const h of [...edit.hunks].reverse()){
  const at=h.newStartLine-1,after=raw?h.after:h.after.replaceAll('\r\n','\n'),before=raw?h.before:h.before.replaceAll('\r\n','\n');
  assert.equal(lines.slice(at,at+h.newLineCount).join(''),after);lines.splice(at,h.newLineCount,...(before.match(/[^\n]*\n|[^\n]+$/g)||[]));
 }
 value=lines.join('');assert.equal(hash(value),raw?edit.inputSha256:edit.inputCanonicalSha256);return value;
}
