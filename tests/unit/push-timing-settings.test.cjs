const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createController, validatePolicy } = require('../../js/push-timing-settings.js');
const ID = 'f7160000-0000-4000-8000-000000000002';
const REV = '9007199254740993';
const policy = () => ({ version: 'PUSH_TIMING_POLICY_V1', enabled: true, timezone: 'Europe/London',
  normal_quiet_start: '00:00', normal_quiet_end: '07:00',
  day_rules: Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { mode: 'INHERIT' }])),
  bank_holiday_rule: { mode: 'INHERIT' } });
const loaded = () => ({ ok: true, version: 'PUSH_TIMING_STATE_V1', revision: REV, policy: policy(),
  policy_sha256: 'a'.repeat(64), updated_at_utc: '2026-10-15T23:32:00.000000Z', can_edit: true });
const saved = body => ({ ok: true, version: 'PUSH_TIMING_SAVED_V1', request_id: body.request_id,
  revision: '9007199254740994', policy: body.policy, policy_sha256: 'b'.repeat(64), updated_at_utc: '2026-10-15T23:33:00.000000Z' });

test('agency QT controller round-trips large revision and only its exact four browser fields', async () => {
  const calls = [];
  const c = createController({ requestId: () => ID, request: async options => {
    calls.push(options); return options.method === 'GET' ? loaded() : saved(JSON.parse(options.body));
  } });
  await c.load(); const draft = c.snapshot().draft; draft.normal_quiet_end = '08:00'; c.edit(draft);
  assert.deepEqual(await c.save(), { ok: true });
  const body = JSON.parse(calls[1].body);
  assert.deepEqual(Object.keys(body).sort(), ['expected_revision','policy','request_id','version']);
  assert.equal(body.expected_revision, REV); assert.equal(body.policy.normal_quiet_end, '08:00');
  assert.equal(c.snapshot().current.revision, '9007199254740994'); assert.equal(c.snapshot().pending, false);
});
test('uncertain save retains exact original bytes/UUID and blocks editing or refresh until retry', async () => {
  let count = 0, ids = 0; const bodies = [];
  const c = createController({ requestId: () => { ids++; return ID; }, request: async options => {
    if (options.method === 'GET') return loaded();
    bodies.push(options.body); count++;
    if (count === 1) throw new Error('response lost');
    return saved(JSON.parse(options.body));
  } });
  await c.load(); await assert.rejects(c.save(), /response lost/);
  assert.equal(c.snapshot().pending, true);
  assert.throws(() => c.edit(policy()), /Refresh/);
  await assert.rejects(c.load(), /original save/);
  assert.deepEqual(await c.save(), { ok: true }); assert.equal(ids, 1); assert.equal(bodies[0], bodies[1]);
});
test('revision conflict requires actual new GET and cannot quietly overwrite fresher settings', async () => {
  let calls = 0;
  const c = createController({ requestId: () => ID, request: async options => {
    calls++; if (options.method === 'GET') return loaded();
    throw Object.assign(new Error('Refresh settings'), { code: 'PUSH_TIMING_REVISION_CONFLICT' });
  } });
  await c.load(); await assert.rejects(c.save(), /Refresh settings/);
  assert.equal(c.snapshot().refreshRequired, true); assert.equal(c.snapshot().pending, false);
  await assert.rejects(c.save(), /Refresh/); assert.equal(calls, 2);
  await c.load(); assert.equal(c.snapshot().refreshRequired, false);
});
test('an incomplete local time remains a draft but cannot allocate a request or PUT', async () => {
  let ids = 0, puts = 0;
  const c = createController({ requestId: () => { ids++; return ID; }, request: async options => {
    if (options.method === 'PUT') puts++; return loaded();
  } });
  await c.load(); const p = policy(); p.normal_quiet_start = ''; c.edit(p);
  assert.equal(c.snapshot().draft.normal_quiet_start, '');
  await assert.rejects(c.save(), /Check/); assert.equal(ids, 0); assert.equal(puts, 0);
});
test('bad server scalar/policy/permissions cannot load editable defaults', async () => {
  for (const bad of [{ ...loaded(), revision: 1 }, { ...loaded(), can_edit: false },
    { ...loaded(), internal: true }, { ...loaded(), policy: { ...policy(), timezone: 'UTC' } }]) {
    const c = createController({ requestId: () => ID, request: async () => bad });
    await assert.rejects(c.load()); assert.equal(c.snapshot().current, null); assert.equal(c.snapshot().draft, null);
  }
});
test('wrong saved receipt request or numeric revision retains original pending ownership', async () => {
  for (const change of [v => ({ ...v, request_id: ID.replace('002','003') }), v => ({ ...v, revision: 2 })]) {
    const c = createController({ requestId: () => ID, request: async options => options.method === 'GET'
      ? loaded() : change(saved(JSON.parse(options.body))) });
    await c.load(); await assert.rejects(c.save(), /verified/); assert.equal(c.snapshot().pending, true);
  }
});
test('concurrent save does not create another key or provider-facing request', async () => {
  let resolve, puts = 0, ids = 0;
  const c = createController({ requestId: () => { ids++; return ID; }, request: options => {
    if (options.method === 'GET') return Promise.resolve(loaded());
    puts++; return new Promise(done => { resolve = () => done(saved(JSON.parse(options.body))); });
  } });
  await c.load(); const first = c.save(); assert.deepEqual(await c.save(), { ok: false });
  resolve(); await first; assert.equal(puts, 1); assert.equal(ids, 1);
});
test('closed policy preserves day/holiday rules and rejects impossible or extra fields', () => {
  const p = policy(); p.day_rules.saturday = { mode: 'ALLOW_WINDOW', start: '09:00', end: '13:00' };
  p.day_rules.sunday = { mode: 'NO_PUSH_DAY' }; p.bank_holiday_rule = { mode: 'NO_PUSH_DAY' };
  assert.equal(validatePolicy(p), p);
  assert.throws(() => validatePolicy({ ...p, agency_id: ID }));
  assert.throws(() => validatePolicy({ ...p, normal_quiet_start: ['00:00'] }));
  for (const day of Object.keys(p.day_rules)) p.day_rules[day] = { mode: 'NO_PUSH_DAY' };
  assert.throws(() => validatePolicy(p), /at least one/);
});
test('existing settings host delegates QT save separately from control-plane settingsPayload', () => {
  const source = fs.readFileSync(require.resolve('../../js/mytms-office-v1.js'), 'utf8');
  const payload = source.slice(source.indexOf('function settingsPayload'), source.indexOf('async function settingsSave'));
  assert.doesNotMatch(payload, /push|quiet|policy_json/);
  assert.match(source, /activeSettingsTab === 'push-timing'\) return await global.CloudTMSPushTimingSettings\?\.save/);
  const html = fs.readFileSync(require.resolve('../../index.html'), 'utf8');
  assert.ok(html.indexOf('js/push-timing-settings.js') < html.indexOf('js/mytms-office-v1.js'));
});
