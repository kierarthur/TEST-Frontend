const { test } = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../../js/weekly-source/protected-shift-editor.js');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = { allowed: true, source_cycle_id: id(1), client_id: id(2), candidate_id: id(3),
  work_date: '2026-09-21', contracts: [{ id: id(4), label: 'Band 6', week_ending_date: '2026-09-27' }] };
const values = { work_date: '2026-09-21', start: '09:00', end: '16:00', break_minutes: '15', reason: 'Office confirmed' };
test('minutes only, net hours and overnight shifts', () => {
  assert.equal(editor.schedule(values).net_minutes, 405);
  assert.equal(editor.schedule({ ...values, start: '20:00', end: '08:00', break_minutes: 60 }).net_minutes, 660);
  for (const bad of ['', null, -1, 1.5, 420]) assert.throws(() => editor.schedule({ ...values, break_minutes: bad }));
  assert.equal(editor.schedule({ ...values, break_minutes: 0 }).net_minutes, 420);
  assert.throws(() => editor.schedule({ ...values, work_date: '2026-02-30' }));
});
test('new unsigned, unimported shift needs a qualified contract, not a booking reference', () => {
  const result = editor.request(context, values, 'protected-editor-test-001');
  assert.equal(result.action, 'APPROVE_PROTECTED_HOURS');
  assert.equal(result.payload.contract_id, id(4));
  assert.equal(result.payload.evidence_timesheet_id, null);
  assert.equal(result.payload.work_event_id, null);
  assert.ok(!('booking_reference' in result.payload));
  assert.ok(!('pay' in editor.request(context, { ...values, pay: 123 }, 'protected-editor-test-001').payload));
});
test('future work dates are unavailable in the calendar and rejected if typed', () => {
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  assert.match(editor.render(context, values), /data-protected-field="work_date" type="date"[^>]+max="\d{4}-\d{2}-\d{2}"/);
  assert.throws(() => editor.request({ ...context, work_date: future },
    { ...values, work_date: future }, 'protected-editor-test-future'), /Future shifts cannot be protected/);
});
test('a same-day second shift is warned only when its times actually overlap', () => {
  const existing = { work_event_id: id(7), start: '09:00', end: '16:00' };
  const selected = { ...context, events: [existing] };
  assert.deepEqual(editor.overlappingEvents(selected, { start: '16:00', end: '18:00' }), []);
  assert.equal(editor.request(selected, { ...values, start: '16:00', end: '18:00' },
    'protected-editor-test-second').payload.work_event_id, null);
  assert.deepEqual(editor.overlappingEvents(selected, { start: '15:45', end: '18:00' }).map(item => item.work_event_id), [id(7)]);
  assert.throws(() => editor.request(selected, { ...values, start: '15:45', end: '18:00' },
    'protected-editor-test-overlap'), /overlap an existing shift/);
  assert.deepEqual(editor.overlappingEvents(selected, { start: '15:45', end: '18:00', shift_choice: id(7) }), []);
  assert.deepEqual(editor.overlappingEvents(selected, { start: '15:', end: '18:00' }), []);
  assert.deepEqual(editor.overlappingEvents({ events: [{ ...existing, start: '22:00', end: '06:00' }] },
    { start: '23:00', end: '07:00' }).map(item => item.work_event_id), [id(7)]);
  assert.equal(editor.overlappingEvents({ events: [{ ...existing, candidate_start: '09:00', candidate_end: '16:00',
    source_start: '09:00', source_end: '17:00' }] }, { start: '16:00', end: '18:00' })[0].overlap_kind, 'Imported source');
});
test('multiple contracts never default; changed context is stale', () => {
  const many = { ...context, contracts: [...context.contracts, { id: id(5), week_ending_date: '2026-09-27' }] };
  assert.equal(editor.contractChoice(many.contracts, ''), '');
  assert.throws(() => editor.request(many, values, 'protected-editor-test-001'));
  assert.throws(() => editor.request(context, { ...values, work_date: '2026-09-22' }, 'protected-editor-test-001'));
  assert.throws(() => editor.request({ ...context, allowed: false }, values, 'protected-editor-test-001'));
});
test('amendment and reconciliation retain exact event and current version', () => {
  const current = { ...context, family_id: id(6), work_event_id: id(7), expected_family_bound_version: 3 };
  const result = editor.request(current, values, 'protected-editor-test-002', 'amend');
  assert.equal(result.payload.work_event_id, id(7));
  assert.equal(result.payload.expected_family_bound_version, 3);
  assert.ok(!('candidate_id' in result.payload));
  assert.throws(() => editor.request(current, values, 'protected-editor-test-003', 'reconcile'));
  assert.throws(() => editor.request({ ...current, can_reconcile: true }, values, 'protected-editor-test-003', 'reconcile'), /final source/);
  const ready = { ...current, can_reconcile: true, final_source_proposal: { source_hash: 'a'.repeat(64), source_revision: id(8) } };
  const accepted = editor.request(ready, values, 'protected-editor-test-003', 'reconcile');
  assert.equal(accepted.action, 'ACCEPT_SOURCE_AND_RECONCILE');
  assert.equal(accepted.payload.expected_source_hash, 'a'.repeat(64));
  assert.equal(accepted.payload.expected_source_revision, id(8));
});

test('review shows only the selected final-source shift and keeps provisional hours out', () => {
  const current = { ...context, work_event_id: id(7), current_schedule: values,
    source_hours: 'PROVISIONAL HOURS MUST NOT BE USED', can_reconcile: true,
    final_source_proposal: { source_present: true, source_minutes: 390,
      source_segments: [{ work_event_id: id(7), start: '09:00', end: '16:00', break_mins: 30 },
        { work_event_id: id(9), start: 'OTHER SHIFT', end: '18:00', break_mins: 0 }] } };
  const html = editor.renderReview(current);
  assert.match(html, /09:00–16:00 · 30 min break/);
  assert.match(html, /390 minutes after breaks/);
  assert.doesNotMatch(html, /PROVISIONAL|OTHER SHIFT/);
  assert.match(editor.renderReview({ ...current, can_reconcile: false }), /data-protected-review-action="reconcile" disabled/);
});
test('form is minutes-only, never invents missing evidence before the read, and escapes labels', () => {
  const html = editor.render({ ...context, client: '<script>' }, values);
  assert.match(html, /6 hours 45 minutes/);
  assert.match(html, /Choose the client, candidate and date to check/);
  assert.doesNotMatch(html, /No signed candidate submission|Not present in the import/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /Break start|Break end|booking_reference/);
});

test('an uncertain save retains the same action without a second result button', () => {
  const pending = editor.render(context, values, { pending: { action: 'APPROVE_PROTECTED_HOURS' } });
  assert.match(pending, /data-protected-submit[^>]*>Protect pay<\/button>/);
  assert.doesNotMatch(pending, /Check saved result/);
  assert.doesNotMatch(pending, /Saving…/);
  assert.match(pending, /data-protected-field="start"[^>]* disabled/);
  assert.doesNotMatch(pending, /data-protected-cancel disabled/);
  const saved = editor.render(context, values, { protectedSaved: true, finishManualReview: true });
  assert.match(saved, /data-protected-submit[^>]*>Finish query<\/button>/);
});

test('review history uses recorded actors, reasons and before/after schedules safely', () => {
  const html = editor.renderReview({ ...context, history: [{
    at: '2026-10-01T10:15:00Z', by: '<Office user>', reason: '<confirmed>', state: 'WAIT',
    before: { start: '09:00', end: '17:00', break_minutes: 30 },
    after: { start: '09:00', end: '16:00', break_minutes: 15 }
  }] });
  assert.match(html, /1 Oct 2026, 11:15/);
  assert.match(html, /&lt;Office user&gt;/);
  assert.match(html, /&lt;confirmed&gt;/);
  assert.match(html, /Before: 09:00–17:00 · 30 min break/);
  assert.match(html, /After: 09:00–16:00 · 15 min break/);
  assert.doesNotMatch(editor.renderReview(context), /Protected shift history/);
});

test('existing same-day shifts require an explicit identity and protect cannot silently amend', () => {
  const current = { ...context, events: [{ work_event_id: id(7) }], work_event_id: id(7), shift_contract_id: id(4) };
  assert.throws(() => editor.request(current, values, 'protected-editor-test-004'), /selected shift changed/);
  const selected = { ...values, shift_choice: id(7) };
  assert.equal(editor.request(current, selected, 'protected-editor-test-004').payload.work_event_id, id(7));
  assert.throws(() => editor.request({ ...current, family_id: id(6), protected_state: 'WAIT' }, selected, 'protected-editor-test-004'), /already has protected pay/);
  assert.throws(() => editor.request({ ...current, shift_contract_id: id(5) }, selected, 'protected-editor-test-004'), /contract already linked/);
});
