const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'js', 'mytms-office-v1.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

function loadModule({ responses, confirmations }) {
  const requests = [];
  const confirmationCalls = [];
  const window = {
    crypto: {
      randomUUID: (() => {
        let n = 100;
        return () => `10000000-0000-4000-8000-${String(n++).padStart(12, '0')}`;
      })()
    },
    API: (route) => `https://test-broker.example${route}`,
    authFetch: async (url, init = {}) => {
      requests.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error('unexpected request');
      return jsonResponse(next.status, next.body);
    },
    openUiConfirmModal: async (options) => {
      confirmationCalls.push(options);
      return confirmations.shift() || { confirmed: false, via: 'cancel' };
    },
    showModalHint() {},
    document: {},
    setTimeout,
    clearTimeout,
    Event,
    console
  };
  window.window = window;
  const context = vm.createContext({
    window,
    API: window.API,
    authFetch: window.authFetch,
    console,
    Date,
    Event,
    Promise,
    URL,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(source, context, { filename: 'mytms-office-v1.js' });
  return { api: window.CloudTMSMyTmsOffice, requests, confirmationCalls };
}

const statusBody = {
  ok: true,
  agency_display_name: 'CloudTMS TEST',
  candidate_id: '10000000-0000-4000-8000-000000000001',
  candidate_display_name: 'Test Candidate',
  candidate_email: 'candidate@example.test',
  state: 'NOT_INVITED',
  delivery_state: null,
  settings_version: 3,
  action: {
    code: 'INVITE_TO_MYTMS',
    label: 'Invite to MyTMS',
    enabled: true,
    disabled_reason_code: null
  }
};

test('contract success decline performs status read only and never queues email', async () => {
  const runtime = loadModule({
    responses: [{ status: 200, body: statusBody }],
    confirmations: [{ confirmed: false, via: 'cancel' }]
  });
  const result = await runtime.api.offerAfterContractSuccess({
    contract: { candidate_id: statusBody.candidate_id }
  });
  assert.equal(result.offered, true);
  assert.equal(result.sent, false);
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.requests[0].init.method, undefined);
  assert.match(runtime.confirmationCalls[0].message, /contract was saved successfully/i);
  assert.match(runtime.confirmationCalls[0].message, /Agency: CloudTMS TEST/);
  assert.match(runtime.confirmationCalls[0].message, /Candidate: Test Candidate/);
});

test('accepted post-contract offer invokes the same exact Candidate invitation route once', async () => {
  const runtime = loadModule({
    responses: [
      { status: 200, body: statusBody },
      { status: 200, body: { ok: true, status: 'OUTBOX_ACCEPTED', invitation_generation: 1 } }
    ],
    confirmations: [
      { confirmed: true, via: 'confirm' },
      { confirmed: true, via: 'confirm' }
    ]
  });
  const result = await runtime.api.offerAfterContractSuccess({
    contract: { candidate_id: statusBody.candidate_id }
  });
  assert.equal(result.offered, true);
  assert.equal(result.sent, true);
  assert.equal(runtime.requests.length, 2);
  assert.equal(runtime.requests[1].init.method, 'POST');
  assert.match(runtime.requests[1].url, /\/api\/mytms\/candidates\/[^/]+\/invitations$/);
  const body = JSON.parse(runtime.requests[1].init.body);
  assert.equal(body.intent, 'INVITE');
  assert.equal(body.expected_settings_version, 3);
  assert.match(body.idempotency_key, /^[0-9a-f-]{36}$/i);
});

test('non-eligible contract success never prompts or mutates', async () => {
  const runtime = loadModule({
    responses: [{
      status: 200,
      body: { ...statusBody, state: 'ACTIVE', action: { ...statusBody.action, code: 'SEND_ACCESS_REMINDER' } }
    }],
    confirmations: []
  });
  const result = await runtime.api.offerAfterContractSuccess({
    contract: { candidate_id: statusBody.candidate_id }
  });
  assert.equal(result.offered, false);
  assert.equal(result.reason, 'NOT_ELIGIBLE');
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.confirmationCalls.length, 0);
});

test('source wiring keeps MyTMS Office separate, server-authored and post-commit only', () => {
  assert.match(mainSource, /data-k="mytms-app"/);
  assert.match(mainSource, /CloudTMSMyTmsOffice\?\.openSettings/);
  assert.match(mainSource, /CloudTMSMyTmsOffice\?\.mountCandidateAction/);
  assert.match(mainSource, /if \(method === 'POST' && data\)/);
  assert.match(mainSource, /offerAfterContractSuccess/);
  assert.doesNotMatch(mainSource, /renderSettingsTab\([^)]*mytms/i);
  assert.match(htmlSource, /js\/main\.js[\s\S]*js\/mytms-office-v1\.js/);
  assert.match(source, /\/api\/mytms\/candidates\/\$\{encodeURIComponent\(status\.candidate_id\)\}\/invitations/);
  assert.match(source, /openUiConfirmModal/);
  assert.match(source, /data-mytms-activation-readonly="1"/);
  assert.match(source, /mytmsActivationReadonly === '1'[\s\S]*element\.disabled = true/);
  assert.match(source, /Manager approval by email/);
  assert.match(source, /\/api\/mytms\/manager-email-settings/);
  assert.match(source, /Platform-owned/);
  assert.doesNotMatch(source, /output\.test_recipient_allowlist/);
  assert.doesNotMatch(source, /keys = \[[\s\S]*?'android_store_url'/);
  assert.doesNotMatch(source, /kier@arthur-rai\.co\.uk/i);
});
