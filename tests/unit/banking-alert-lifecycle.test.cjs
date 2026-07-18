const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

function sliceBetween(start, end) {
  const from = mainSource.indexOf(start);
  const to = mainSource.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return mainSource.slice(from, to);
}

const scheduledAlert = {
  alert_kind: 'BATCH_SCHEDULED_SUCCESS',
  severity: 'info',
  entity_kind: 'pay_batch',
  entity_id: '11111111-1111-4111-8111-111111111111',
  pay_batch_id: '11111111-1111-4111-8111-111111111111',
  alert_fingerprint: 'banking-alert-scheduled',
  label: 'Future payment batch scheduled',
  description: 'Payment batch scheduled successfully. £1,234.56 will be paid across 3 individual payments on 1 September 2026 at 23:00 (UK Time).',
  acknowledged_for_current_user: false,
  payload_json: {
    alert_kind: 'BATCH_SCHEDULED_SUCCESS',
    is_success_only: true,
    individual_payment_count: 3,
    amount_gbp: 1234.56,
    user_label: 'Future payment batch scheduled',
    user_description: 'Payment batch scheduled successfully. £1,234.56 will be paid across 3 individual payments on 1 September 2026 at 23:00 (UK Time).'
  }
};

const settledAlert = {
  ...scheduledAlert,
  alert_kind: 'BATCH_SETTLED_SUCCESS',
  alert_fingerprint: 'banking-alert-settled',
  label: 'Payment batch settled',
  description: 'Payment batch settled successfully. £1,234.56 across 3 individual payments completed on 1 September 2026 at 23:05 (UK Time).',
  payload_json: {
    ...scheduledAlert.payload_json,
    alert_kind: 'BATCH_SETTLED_SUCCESS',
    user_label: 'Payment batch settled',
    user_description: 'Payment batch settled successfully. £1,234.56 across 3 individual payments completed on 1 September 2026 at 23:05 (UK Time).'
  }
};

test('popover renders successful schedule and settlement messages with clear controls', () => {
  const source = sliceBetween('function renderBankingNavAlertPopover(attentionState)', 'function applyAlertSummaryToState(responsePayload)');
  const context = {
    window: {},
    Intl,
    Date,
    Number,
    String,
    Math,
    Array,
    Object,
    JSON,
    encodeURIComponent
  };
  vm.runInNewContext(source, context, { filename: 'banking-alert-popover.js' });
  const markup = context.renderBankingNavAlertPopover({
    count: 2,
    alerts: [scheduledAlert, settledAlert],
    banking_alert_summary: { unacknowledged_count: 2, alerts: [scheduledAlert, settledAlert] }
  });

  assert.match(markup, /Future payment batch scheduled/);
  assert.match(markup, /£1,234\.56 will be paid across 3 individual payments on 1 September 2026 at 23:00 \(UK Time\)/);
  assert.match(markup, /Payment batch settled/);
  assert.match(markup, /completed on 1 September 2026 at 23:05 \(UK Time\)/);
  assert.match(markup, /color:var\(--text,#f8fafc\)/);
  assert.doesNotMatch(markup, /color:#111827/);
  assert.equal((markup.match(/data-action="banking:nav:alerts:clear"/g) || []).length, 2);
  assert.match(markup, /data-action="banking:nav:alerts:clearAll"/);
  assert.match(markup, /2 unread Banking alerts/);
});

test('summary application no longer filters success-only alerts', () => {
  const source = sliceBetween('function applyAlertSummaryToState(responsePayload)', 'async function bankingAcknowledgeAlerts(input = {})');
  let attentionState = null;
  const context = {
    window: {
      modalCtx: { banking: { pay: { list: {} } } },
      __bankingLocallyAcknowledgedFingerprints: {},
      __changesHeartbeat: {}
    },
    document: { querySelector() { return null; } },
    updateBankingNavAttentionState(value) { attentionState = value; context.window.__bankingNavAttentionState = value; },
    console,
    setTimeout,
    clearTimeout,
    Date,
    Number,
    String,
    Math,
    Array,
    Object,
    JSON,
    Set
  };
  vm.runInNewContext(source, context, { filename: 'banking-alert-state.js' });
  const result = context.applyAlertSummaryToState({
    banking_alert_summary_included: true,
    banking_alert_summary: {
      alerts: [scheduledAlert, settledAlert],
      unacknowledged_count: 2,
      banking_unacknowledged_alert_count: 2,
      banking_alert_hash: 'hash-success-alerts',
      banking_alert_summary_signature: 'hash-success-alerts'
    }
  });

  assert.equal(result.count, 2);
  assert.equal(result.alerts.length, 2);
  assert.equal(attentionState.count, 2);
  assert.deepEqual(Array.from(attentionState.alerts, (alert) => alert.alert_kind), ['BATCH_SCHEDULED_SUCCESS', 'BATCH_SETTLED_SUCCESS']);
});

test('dedicated alert fetch loads full details and applies them', async () => {
  const source = sliceBetween('async function bankingAlertsFetchActive(options = {})', 'async function bankingAlertPreferencesFetch()');
  let requestedUrl = '';
  let applied = null;
  const responsePayload = {
    ok: true,
    alerts: [scheduledAlert],
    unacknowledged_count: 1,
    banking_unacknowledged_alert_count: 1,
    banking_alert_hash: 'hash-one'
  };
  const context = {
    window: {},
    API(value) { return value; },
    async authFetch(url, options) {
      requestedUrl = url;
      assert.equal(options.method, 'GET');
      return {
        ok: true,
        status: 200,
        async text() { return JSON.stringify(responsePayload); }
      };
    },
    applyAlertSummaryToState(value) { applied = value; },
    encodeURIComponent,
    Number,
    String,
    Math,
    Array,
    Object,
    JSON,
    Error
  };
  vm.runInNewContext(source, context, { filename: 'banking-alert-fetch.js' });
  const result = await context.bankingAlertsFetchActive({ limit: 25 });

  assert.equal(requestedUrl, '/api/banking/alerts?limit=25');
  assert.equal(result.banking_alert_summary_included, true);
  assert.equal(applied.banking_alert_summary.alerts.length, 1);
});

function createAcknowledgeContext(responseSummary, options = {}) {
  const requests = [];
  let friendlyModal = null;
  const configuredResponse = options.response || null;
  const source = sliceBetween('async function bankingAcknowledgeAlerts(input = {})', 'async function bankingPayBatchRetryBlockedFunds');
  const context = {
    window: {
      __bankingNavAttentionState: {
        alerts: [scheduledAlert, settledAlert],
        banking_alerts: [scheduledAlert, settledAlert]
      },
      __bankingAlertSummary: {
        alerts: [scheduledAlert, settledAlert],
        unacknowledged_count: 2
      },
      __changesHeartbeat: {}
    },
    document: {
      querySelector() { return null; },
      createElement() { return { innerHTML: '', firstElementChild: null }; }
    },
    API(value) { return value; },
    async authFetch(url, fetchOptions) {
      requests.push({ url, method: fetchOptions.method, body: JSON.parse(fetchOptions.body) });
      if (configuredResponse) return configuredResponse;
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            acknowledged: true,
            acknowledged_alerts: responseSummary.acknowledged_alerts || [],
            remaining_alert_summary: responseSummary
          });
        }
      };
    },
    bankingHandleApiError(error) { return error && error.json ? error.json : {}; },
    async openUiConfirmModal(config) { friendlyModal = config; },
    applyAlertSummaryToState(payload) {
      const summary = payload.remaining_alert_summary || payload.alert_summary;
      return {
        count: summary.unacknowledged_count,
        alerts: summary.alerts,
        banking_alerts: summary.alerts,
        alertSummary: summary,
        banking_alert_summary: summary
      };
    },
    updateBankingNavAttentionState() {},
    renderBankingNavAlertPopover() { return '<div></div>'; },
    attachBankingNavAlertPopoverHandlers() {},
    console,
    Date,
    Number,
    String,
    Math,
    Array,
    Object,
    JSON,
    Set,
    Error
  };
  vm.runInNewContext(source, context, { filename: 'banking-alert-acknowledge.js' });
  return { context, requests, getFriendlyModal: () => friendlyModal };
}

test('clearing one alert sends its full identity and keeps the remaining message visible', async () => {
  const remainingSummary = {
    alerts: [settledAlert],
    unacknowledged_count: 1,
    banking_unacknowledged_alert_count: 1,
    acknowledged_alerts: [scheduledAlert]
  };
  const { context, requests } = createAcknowledgeContext(remainingSummary);

  const result = await context.bankingAcknowledgeAlerts(scheduledAlert);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/banking/alerts/acknowledge');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body.alert_fingerprint, scheduledAlert.alert_fingerprint);
  assert.equal(requests[0].body.alert_kind, 'BATCH_SCHEDULED_SUCCESS');
  assert.equal(requests[0].body.entity_id, scheduledAlert.entity_id);
  assert.equal(result.banking_unacknowledged_alert_count, 1);
  assert.equal(result.banking_alerts[0].description, settledAlert.description);
  assert.ok(context.window.__bankingLocallyAcknowledgedFingerprints[scheduledAlert.alert_fingerprint]);
});

test('clear all sends an explicit clear_all request and empties the alert state', async () => {
  const emptySummary = {
    alerts: [],
    unacknowledged_count: 0,
    banking_unacknowledged_alert_count: 0,
    acknowledged_alerts: [scheduledAlert, settledAlert]
  };
  const { context, requests } = createAcknowledgeContext(emptySummary);

  const result = await context.bankingAcknowledgeAlerts({ clear_all: true });

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body, { clear_all: true });
  assert.equal(result.banking_unacknowledged_alert_count, 0);
  assert.equal(result.banking_alerts.length, 0);
  assert.ok(context.window.__bankingLocallyAcknowledgedFingerprints[scheduledAlert.alert_fingerprint]);
  assert.ok(context.window.__bankingLocallyAcknowledgedFingerprints[settledAlert.alert_fingerprint]);
});

test('expired session gives a specific reason when an alert cannot be cleared', async () => {
  const { context, getFriendlyModal } = createAcknowledgeContext({ alerts: [], unacknowledged_count: 0 }, {
    response: {
      ok: false,
      status: 401,
      async text() { return JSON.stringify({ ok: false, error: 'Unauthorized' }); }
    }
  });

  await assert.rejects(
    context.bankingAcknowledgeAlerts(scheduledAlert),
    /Your session has expired\. Please sign in again, then reopen Banking alerts\./
  );

  const modal = getFriendlyModal();
  assert.equal(modal.title, 'Session expired');
  assert.match(modal.message, /sign in again/i);
});

test('preferences expose successful lifecycle alerts as enabled by default', () => {
  assert.match(mainSource, /include_success_alerts: mode !== 'NO_BANKING_PAY_ALERTS' && boolOr\(rawPrefs\.include_success_alerts, true\)/);
  assert.match(mainSource, /data-alert-preference-success-alerts="1"/);
  assert.match(mainSource, /Immediate payments and CSV settlements only alert on settlement/);
  assert.match(mainSource, /await bankingAlertsFetchActive\(\{ silent: true, limit: 100 \}\)/);
  assert.doesNotMatch(mainSource, /function renderBankingNavAlertPopover[\s\S]*?isSuccessOnlyAlert/);
});
