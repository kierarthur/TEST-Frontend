import fs from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex'),bytes=fs.readFileSync(new URL('../../docs/healthroster-build/proposals/missing-source-keep-successor-forward-20261017/FULL_PARENT_FORWARD.json',import.meta.url));
assert.equal(hash(bytes),'6583feebdeff991678ee1fd4d0bc996711ef0721b362219cf9effdc8a6189ab8');const proof=JSON.parse(bytes);
export function reverseKeepSuccessorParent(file,value){
 const e=proof.edits.find(e=>e.target===file);if(!e)return value;
 if(e.variants.some(v=>hash(value)===v.inputSha256))return value;
 const v=e.variants.find(v=>hash(value)===v.outputSha256);assert(v,'Exact complete KEEP successor required: '+file);
 const lines=value.match(/[^\n]*\n|[^\n]+$/g)||[];for(const h of [...v.hunks].reverse()){const at=h.newStartLine-1;assert.equal(lines.slice(at,at+h.newLineCount).join(''),h.after);lines.splice(at,h.newLineCount,...(h.before.match(/[^\n]*\n|[^\n]+$/g)||[]));}
 value=lines.join('');assert.equal(Buffer.byteLength(value),v.inputBytes);assert.equal(hash(value),v.inputSha256);return value;
}
