// One-time single CRLF normalization to exact Git-staged HTML; no behavior change.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex'),before=fs.readFileSync('index.html');
assert.equal(sha(before),'356d202cfa5b1271f7922a11ad499ca022012157e69c085637f615013543a321');
assert.equal(before.toString().split('\r\n').length-1,1);const after=Buffer.from(before.toString().replaceAll('\r\n','\n'));
assert.deepEqual(after,execFileSync('git',['show',':index.html']));assert.equal(sha(after),'dc1f0926754b6758889a44fc31006735d60370b0d2e41f4f75247fc3041c02d5');
fs.writeFileSync('index.html',after);
fs.writeFileSync('docs/healthroster-build/OFFICE_CORRECTION_READ_INDEX_LF_14102026.json',JSON.stringify({sourceOnly:true,status:'ONE_CRLF_TO_STAGED_LF',
 file:'index.html',authorRawSha256:sha(before),savedStagedSha256:sha(after),removedCarriageReturns:1,beforeBytes:before.length,afterBytes:after.length,
 authorFrozenFilesUntouched:true,behaviorChanged:false,publication:false},null,2)+'\n');
console.log('Single HTML CRLF normalized to exact staged LF; frozen author source preserved.');
