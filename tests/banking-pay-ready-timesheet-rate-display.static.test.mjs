import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(repoRoot, 'js', 'main.js'), 'utf8');

const start = source.indexOf('const renderReadyTimesheetBreakdown =');
const end = source.indexOf('const renderReadyTimesheetGroupedRows =', start);
assert.ok(start >= 0 && end > start, 'Ready timesheet breakdown owner must exist');
const render = source.slice(start, end);

test('Ready timesheet details use server segment fields and Europe/London time authority', () => {
  assert.match(render, /timeZone:\s*'Europe\/London'/);
  assert.match(render, /segment\?\.start_utc/);
  assert.match(render, /segment\?\.end_utc/);
  assert.match(render, /segment\?\.role/);
  assert.match(render, /segment\?\.band/);
  assert.match(render, /segment\?\.break_mins/);
  assert.match(render, /segment\?\.breaks/);
});

test('source and target pay/rate labels are independent server-owned values', () => {
  assert.match(render, /data-rate-field="source-pay"[\s\S]*Source pay:/);
  assert.match(render, /data-rate-field="source-rate"[\s\S]*Source rate:/);
  assert.match(render, /data-rate-field="target-rate"[\s\S]*Target rate:/);
  assert.match(render, /data-rate-field="target-pay"[\s\S]*Target pay:/);
  assert.doesNotMatch(render, /sourceUnits\s*\*\s*sourceRate/i);
});

test('grouped resolved-rate action fails closed when child identities disagree', () => {
  assert.match(source, /BANKING_PAY_RESOLVED_RATE_GROUP_IDENTITY_CONFLICT/);
  assert.match(source, /resolvedRateClearIdentities\.length !== 1/);
  assert.match(source, />Cancel Resolved Rate<\/button>/);
});
