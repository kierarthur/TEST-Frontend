import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(repoRoot, 'js', 'main.js'), 'utf8');
const startMarker = 'async function bankingPayWorkbenchSessionApplyCaseResolution(sessionId, payload = {}) {';
const start = source.indexOf(startMarker);
const end = source.indexOf('\n// SHA-256 suffix:', start);

assert.ok(start >= 0, 'case-resolution helper must exist');
assert.ok(end > start, 'case-resolution helper must have a stable end marker');

const functionSource = source.slice(start, end);

function createHarness(responses) {
  const calls = [];
  const context = vm.createContext({
    API: (value) => value,
    bankingBuildEnrichedFriendlyError: (error) => error,
    bankingPayAugmentWorkbenchFreshnessPayload: (_sessionId, payload) => ({ ...payload }),
    authFetch: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      const response = responses.shift();
      assert.ok(response, 'unexpected extra request');
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        text: async () => JSON.stringify(response.body)
      };
    }
  });
  vm.runInContext(`${functionSource}\nglobalThis.caseResolution = bankingPayWorkbenchSessionApplyCaseResolution;`, context);
  return { calls, caseResolution: context.caseResolution };
}

test('retries one progress-only conflict using the server current counter', async () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const { calls, caseResolution } = createHarness([
    {
      status: 409,
      body: {
        ok: false,
        code: 'WORKBENCH_SESSION_PROGRESS_CHANGED',
        current_session_version: 7,
        current_progress_counter_version: 42
      }
    },
    {
      status: 200,
      body: {
        operation: 'DISCOVER',
        session_id: sessionId,
        candidate_id: '22222222-2222-4222-8222-222222222222',
        session_version: 7
      }
    }
  ]);

  const result = await caseResolution(sessionId, {
    operation: 'DISCOVER',
    candidate_id: '22222222-2222-4222-8222-222222222222',
    expected_session_version: 7,
    expected_progress_counter_version: 41
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].expected_progress_counter_version, 41);
  assert.equal(calls[1].expected_session_version, 7);
  assert.equal(calls[1].expected_progress_counter_version, 42);
});

test('does not retry a changed decision session version', async () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const { calls, caseResolution } = createHarness([
    {
      status: 409,
      body: {
        ok: false,
        code: 'STALE_SESSION',
        current_session_version: 8,
        current_progress_counter_version: 42
      }
    }
  ]);

  await assert.rejects(
    caseResolution(sessionId, {
      operation: 'APPLY',
      candidate_id: '22222222-2222-4222-8222-222222222222',
      expected_session_version: 7,
      expected_progress_counter_version: 41
    }),
    (error) => error?.code === 'STALE_SESSION'
  );
  assert.equal(calls.length, 1);
});
