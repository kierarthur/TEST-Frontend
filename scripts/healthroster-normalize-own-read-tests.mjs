// One-time byte proof for our two edited test fixtures only; source assertions unchanged.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const file='tests/unit/weekly-source-entrypoint-reachability.test.cjs';
const before=fs.readFileSync(file),after=Buffer.from(before.toString().replaceAll('\r\n','\n'));
assert.equal(before.length-after.length,62);assert.deepEqual(after,execFileSync('git',['show',':'+file]));
fs.writeFileSync(file,after);
fs.writeFileSync('docs/healthroster-build/OFFICE_CORRECTION_READ_TEST_LF_14102026.json',JSON.stringify({sourceOnly:true,status:'OWN_TEST_CRLF_TO_EXACT_STAGED_LF',file,beforeSha256:sha(before),afterSha256:sha(after),removedCarriageReturns:62,assertionsChangedByNormalization:false,native:false,publication:false},null,2)+'\n');
console.log('Own reachability test normalized to exact staged LF; all assertions preserved.');
