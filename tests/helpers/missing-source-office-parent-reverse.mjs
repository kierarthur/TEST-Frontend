import{reverseKeepSuccessorParent}from'./missing-source-keep-successor-parent-reverse.mjs';
import fs from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex'),bytes=fs.readFileSync(new URL('../../docs/healthroster-build/proposals/missing-source-office-current-consumer-20261017/PARENT_EDITS.json',import.meta.url));
assert.equal(hash(bytes),'99f6ae3977dac3238c2977362067b7e5445b144ccc145932e0f2fa63691f8a04');const proof=JSON.parse(bytes);
export function reverseMissingSourceParent(file,value){
 const e=proof.edits.find(e=>e.target===file);if(!e)return value;
 if(e.variants.some(v=>hash(value)===v.inputSha256))return value;
 value=reverseKeepSuccessorParent(file,value);
 const v=e.variants.find(v=>hash(value)===v.outputSha256);assert(v,'Exact complete current source required: '+file);
 const lines=value.match(/[^\n]*\n|[^\n]+$/g)||[];for(const h of [...v.hunks].reverse()){const at=h.newStartLine-1;assert.equal(lines.slice(at,at+h.newLineCount).join(''),h.after);lines.splice(at,h.newLineCount,...(h.before.match(/[^\n]*\n|[^\n]+$/g)||[]));}
 value=lines.join('');assert.equal(Buffer.byteLength(value),v.inputBytes);assert.equal(hash(value),v.inputSha256);return value;
}
