const { test } = require('node:test');
const assert = require('node:assert/strict');
const batch = require('../../js/weekly-source/finalise-batch.js');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = n => ({ key: String(n), client: `Client ${n}`, period: '27 Sep 2026', finalise_enabled: true,
  blocked_count: 0, finalise_payload: { source_cycle_id: id(n), authority_scope_kind: 'CYCLE', report_scope_id: null,
    upload_id: id(n+10), projection_publication_id: id(n+20), expected_authority_scope_version: 1,
    expected_row_manifest_hash: 'a'.repeat(64), expected_comparison_manifest_hash: 'b'.repeat(64), expected_issue_set_hash: 'c'.repeat(64) } });
const completed = n => ({ ok: true, source_finalised: true, invoice_authority_committed: true,
  source_finalisation: { final_revision_id: id(n+100), source_cycle_id: id(n) }, status: 'FINALISED' });

test('selection freezes exact per-client proofs and never includes unselected or blocked scopes', () => {
  const a = scope(1), b = { ...scope(2), finalise_enabled: false, blocked_count: 1 };
  const review = batch.create([a,b], ['1']);
  a.finalise_payload.expected_issue_set_hash = 'd'.repeat(64);
  assert.equal(review.items[0].request.expected_issue_set_hash, 'c'.repeat(64));
  assert.ok(Object.isFrozen(review.items[0].request));
  assert.throws(() => batch.create([a,b], ['2']), /no longer ready/);
  assert.throws(() => batch.create([a], ['3']), /no longer in this review/);
  assert.throws(() => batch.create([a], ['1','1']));
  assert.throws(() => batch.create([a,{ ...a, key:'other' }], ['1','other']), /same report scope/);
});
test('HealthRoster exclusions must be individually acknowledged; extra financial facts rejected', () => {
  const a = { ...scope(1), exclusion_confirmation: 'Exclude non-finalised shifts' };
  assert.throws(() => batch.create([a], ['1']), /Confirm/);
  assert.equal(batch.create([a], ['1'], ['1']).items[0].request.exclude_unfinalised_acknowledged, true);
  assert.throws(() => batch.create([{ ...a, finalise_payload: { ...a.finalise_payload, pay: 100 } }], ['1'], ['1']));
});
test('partial failure retains successes and resumes only failed exact requests without concurrency', async () => {
  const review = batch.create([scope(1),scope(2),scope(3)], ['1','2','3']);
  const calls = []; let concurrent = 0, maximum = 0, fail = true;
  const command = async (action,payload) => {
    calls.push([action,payload]); maximum = Math.max(maximum, ++concurrent);
    await new Promise(resolve => setImmediate(resolve)); concurrent--;
    if (payload.source_cycle_id === id(2) && fail) throw new Error('Unknown response');
    return completed(Number(payload.source_cycle_id.slice(-12)));
  };
  await batch.run(review, command);
  assert.deepEqual(review.items.map(item => item.state), ['COMPLETE','CHECK_REQUIRED','COMPLETE']);
  fail = false; await batch.run(review,command);
  assert.equal(calls.length, 4); assert.equal(calls[1][1],calls[3][1]); assert.equal(maximum,1);
});
test('pay follow-up is not confused with an unfinalised source or automatically retried', async () => {
  const review = batch.create([scope(1)], ['1']); let calls = 0;
  await batch.run(review, async () => { calls++; return { ...completed(1), status:'FINALISED_PAY_RECOVERY_REQUIRED' }; });
  assert.equal(review.items[0].state,'SOURCE_COMPLETE_PAY_PENDING');
  await batch.run(review, async () => { calls++; }); assert.equal(calls,1);
});
test('unknown results are retained, no blind automatic retry; revoked session stops later clients', async () => {
  const review = batch.create([scope(1),scope(2)], ['1','2']); let calls = 0;
  await batch.run(review, async () => { calls++; const error = new Error('Session expired'); error.status = 401; throw error; });
  assert.equal(calls,1); assert.equal(review.items[1].state,'READY'); assert.equal(review.running,false);
  await batch.run(review,async () => ({ok:true}));
  assert.deepEqual(review.items.map(item=>item.state),['CHECK_REQUIRED','CHECK_REQUIRED']);
});

test('a response for another client cycle or an unknown completion status is not treated as success', async () => {
  const review = batch.create([scope(1)], ['1']);
  await batch.run(review, async () => completed(2));
  assert.equal(review.items[0].state, 'CHECK_REQUIRED');
  await batch.run(review, async () => ({ ...completed(1), status: 'UNRECOGNISED' }));
  assert.equal(review.items[0].state, 'CHECK_REQUIRED');
});
