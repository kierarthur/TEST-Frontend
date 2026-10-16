const {timingSettings,timingState}=require('./helpers/global-contact-timing.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../../js/weekly-source/settings.js');

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

test('fresh GET, rendered137/11 and actual form PUT preserve canonical settings and full version', async (t) => {
  const originalFetch = globalThis.authFetch;
  const originalDocument = globalThis.document;
  t.after(() => {
    if (originalFetch) globalThis.authFetch = originalFetch;
    else delete globalThis.authFetch;
    if (originalDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  });
  let stored = timingSettings({
    candidate_reminder_minutes: 360,
    candidate_response_deadline_minutes: 753,
    manager_digest_minutes: 137,
    manager_manual_resend_cooldown_minutes: 11,
    candidate_manual_reminder_cooldown_minutes: 83,
    manager_secure_link_days: 9,
    automatic_reconcile_actor_user_id: '66666666-6666-4666-8666-666666666666'
  });
  const puts = [];
  const revision = '9007199254740993';
  const ctx = { [settings.stateKeys.GLOBAL_STATE]: {
    loaded: true, settings_version: '2',
    draft: { manager_partial_digest_minutes: 360, manager_manual_send_cooldown_minutes: 5 },
    baseline: {}, source_groups: [], dirty: true
  } };
  globalThis.authFetch = async (url, options = {}) => {
    if (String(url).endsWith('/source-groups')) return response({ source_groups: [] });
    assert.ok(String(url).endsWith('/global'));
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      puts.push(body);
      assert.equal(body.expected_settings_version, revision);
      assert.deepEqual(Object.keys(body.settings).sort(), Object.keys(stored).sort());
      stored = body.settings;
    }
    return response(timingState(stored,revision));
  };
  const state = await settings.loadGlobal(ctx, true);
  assert.equal(state.draft.manager_digest_minutes, 137);
  assert.equal(state.draft.manager_manual_resend_cooldown_minutes, 11);
  assert.equal(Object.hasOwn(state.draft, 'manager_partial_digest_minutes'), false);
  assert.equal(Object.hasOwn(state.draft, 'manager_manual_send_cooldown_minutes'), false);
  const html = settings.globalHtml(state);
  assert.match(html, /name="weekly_source_manager_digest_hours" value="2\.283333333333333/);
  assert.match(html, /name="weekly_source_manager_resend_minutes" value="11"/);
  const values = Object.fromEntries([...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)]
    .map((match) => [match[1], match[2]]));
  values.weekly_source_candidate_reminder_hours = '7';
  values.weekly_source_manager_first_delay_unit='HOURS';
  const mounted = {
    querySelector(selector) {
      const name = selector.match(/\[name="([^"]+)"\]/)?.[1];
      return Object.hasOwn(values, name) ? { value: values[name] } : null;
    },
    querySelectorAll() { return []; }
  };
  globalThis.document = { querySelector() { return mounted; } };
  // A stale cached alias cannot override the fresh canonical fields or leak
  // into the strict SQL save, even if a caller retained those old properties.
  state.draft.manager_partial_digest_minutes = 360;
  state.draft.manager_manual_send_cooldown_minutes = 5;
  await settings.saveGlobal(ctx);
  assert.equal(puts.length, 1);
  assert.equal(stored.candidate_reminder_minutes, 420);
  assert.equal(stored.candidate_response_deadline_minutes, 753);
  assert.equal(stored.manager_digest_minutes, 137);
  assert.equal(stored.manager_manual_resend_cooldown_minutes, 11);
  assert.equal(stored.candidate_manual_reminder_cooldown_minutes, 83);
  assert.equal(stored.manager_secure_link_days, 9);
  assert.equal(stored.automatic_reconcile_actor_user_id, '66666666-6666-4666-8666-666666666666');
  assert.equal(ctx[settings.stateKeys.GLOBAL_STATE].settings_version, revision);
});

test('unmounted dirty cached draft never PUTs stale aliases, and a failed save stays dirty', async (t) => {
  const originalFetch = globalThis.authFetch;
  const originalDocument = globalThis.document;
  t.after(() => {
    if (originalFetch) globalThis.authFetch = originalFetch;
    else delete globalThis.authFetch;
    if (originalDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  });
  const state = {
    loaded: true, settings_version: '11', dirty: true, groups_dirty: false,
    draft: timingSettings({
      manager_digest_minutes: 137, manager_manual_resend_cooldown_minutes: 11,
      manager_partial_digest_minutes: 999, manager_manual_send_cooldown_minutes: 99
    }), source_groups: []
  };
  let calls = 0;
  globalThis.document = { querySelector() { return null; } };
  globalThis.authFetch = async (url, options) => {
    calls += 1;
    assert.equal(options.method, 'PUT');
    const body=JSON.parse(options.body);
    assert.match(body.request_id,/^[0-9a-f-]{36}$/);
    assert.deepEqual({...body,request_id:undefined}, {request_id:undefined,expected_settings_version:'11',settings:timingSettings()});
    return response({ message: 'Refresh settings' }, 409);
  };
  await assert.rejects(settings.saveGlobal({ [settings.stateKeys.GLOBAL_STATE]: state }), /Refresh settings/);
  assert.equal(calls, 1);
  assert.equal(state.dirty, true);
  assert.equal(state.settings_version, '11');
});
