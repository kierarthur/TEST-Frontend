import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(repoRoot, 'js', 'main.js'), 'utf8');
const pollStart = source.indexOf('async function pollPayWorkbenchCandidateUntilSettled(sessionId, candidateId, options = {}) {');
const pollEnd = source.indexOf('async function bankingPayWorkbenchSessionOpen(payload = {}) {', pollStart);
assert.ok(pollStart >= 0 && pollEnd > pollStart, 'candidate settled poll owner must exist');
const poll = source.slice(pollStart, pollEnd);

test('post-resolution adoption exhausts every candidate page before one merge', () => {
  assert.match(poll, /while \(candidatePreviewPageCount < 100\)/);
  assert.match(poll, /candidatePreviewCursor = nextCursor/);
  assert.match(poll, /BANKING_PAY_CANDIDATE_ATOMIC_REFRESH_CURSOR_MISSING/);
  assert.match(poll, /BANKING_PAY_CANDIDATE_ATOMIC_REFRESH_ROW_IDENTITY_INVALID/);
  assert.match(poll, /candidatePreviewRows\.length > 10000/);
  assert.equal((poll.match(/mergePayWorkbenchCandidatePreviewIntoState\(candidatePreview\)/g) || []).length, 1);
});

test('authoritative empty Cases is preserved in the complete replacement payload', () => {
  assert.match(poll, /rows:\s*cloneJson\(candidatePreviewRows\) \|\| \[\]/);
  assert.match(poll, /atomic_candidate_refresh_complete:\s*true/);
  assert.match(source, /case_resolution_states = mergeRowsForKey\('case_resolution_states', \['cases_resolutions'\]\)/);
  assert.match(source, /cases_resolutions = mergeRowsForKey\('cases_resolutions', \['cases_resolutions'\]\)/);
});

test('candidate merge prefers backend effective section and treats physical section as diagnostic', () => {
  assert.match(source, /row\?\.effective_section \|\| row\?\.effectiveSection[\s\S]*\|\| row\?\.section/);
  assert.doesNotMatch(source, /normalizeCandidateMergeSection\(row\?\.physical_section/);
});
