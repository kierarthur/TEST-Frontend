const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

function sliceBetween(start, end) {
  const from = mainSource.indexOf(start);
  const to = mainSource.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return mainSource.slice(from, to);
}

test('a settled candidate action adopts its final fragment without reopening the full workbench', () => {
  const source = sliceBetween(
    '    const refreshPayWorkbenchAfterCandidateAction = async ({',
    '    const runWorkbenchCandidateMutation = async ({'
  );

  assert.match(source, /candidateSettleResult = await pollPayWorkbenchCandidateUntilSettled/);
  assert.match(source, /candidateSettleResult\.candidate_preview/);
  assert.match(source, /candidateSettleResult\.full_session_refresh_applied === true/);
  assert.match(source, /if \(!candidateSettled\) \{\s*await refreshPayWorkbench/);
  assert.match(source, /full_workbench_refresh_used: !candidateSettled/);
  assert.doesNotMatch(source, /\n\s*await refreshPayWorkbench\(\{ reason, mode \}\);\s*\n\s*return \{ ok: true/);
});

test('payee-map failure uses the safe backend envelope rather than raw provider details', () => {
  const source = sliceBetween(
    "    if (a === 'banking:pay:ensurePayeeMap') {",
    "    if (a === 'banking:pay:bankNameCheckSetOverride') {"
  );

  assert.match(source, /e\?\.backendPayload/);
  assert.match(source, /e\?\.json/);
  assert.match(source, /errorPayload\?\.message/);
  assert.match(source, /RAIL_PROVIDER_SETUP_FAILED/);
  assert.match(source, /No payment or draft was created/);
  assert.doesNotMatch(source, /rawRailError/);
  assert.doesNotMatch(source, /providerMessage/);
});
