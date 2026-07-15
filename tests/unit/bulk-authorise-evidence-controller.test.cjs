const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../js/bulk-authorise-evidence-controller.js'),
  'utf8'
);

const clone = (value) => JSON.parse(JSON.stringify(value));

function evidence(id, kind, storageKey, extra = {}) {
  return {
    id,
    evidence_id: id,
    kind,
    display_name: 'same-file.jpg',
    filename: 'same-file.jpg',
    storage_key: storageKey,
    r2_key: storageKey,
    source_label: 'Attached',
    ...extra
  };
}

function badges(...positiveKinds) {
  return ['TIMESHEET', 'MILEAGE', 'TRAVEL', 'ACCOMMODATION', 'OTHER'].map((kind) => ({
    kind,
    present: positiveKinds.includes(kind),
    has_evidence: positiveKinds.includes(kind),
    count: positiveKinds.includes(kind) ? 1 : 0
  }));
}

function makeState(rows) {
  const activeRow = {
    row_key: 'timesheet:eduardo',
    timesheet_id: 'eduardo',
    current_timesheet_id: 'eduardo',
    bulk_authorise_classification: 'TIMESHEETS',
    bulk_authorise_section: 'authorised_eligible',
    primary_artifact_kind: null,
    primary_artifact_storage_key: 'files/accommodation.jpg',
    evidence_badges: badges('TRAVEL', 'ACCOMMODATION'),
    has_any_evidence: true,
    attached_evidence_count: 2
  };
  return {
    classification: 'TIMESHEETS',
    dataset: { rows: [clone(activeRow)] },
    active_row_key: activeRow.row_key,
    active_row: clone(activeRow),
    active_context: {
      profile: 'full',
      context_profile: 'full',
      evidence_loaded: true,
      row: clone(activeRow),
      evidence: clone(rows),
      details: {
        evidence_loaded: true,
        evidence: clone(rows),
        manual_pdf_r2_key: 'files/accommodation.jpg',
        timesheet: { manual_pdf_r2_key: 'files/accommodation.jpg' }
      }
    },
    active_details: {
      evidence_loaded: true,
      evidence: clone(rows),
      manual_pdf_r2_key: 'files/accommodation.jpg',
      timesheet: { manual_pdf_r2_key: 'files/accommodation.jpg' }
    },
    active_ctx: {
      profile: 'full',
      evidence_loaded: true,
      state: { evidence_loaded: true, evidence: clone(rows) }
    },
    evidence_pane_state: {
      active_tab: 'attached',
      queue_rows: [{ id: 'queue:one', storage_key: 'queue/one.jpg' }],
      attached_rows: clone(rows),
      attached_all_rows: clone(rows),
      active_attached_id: null,
      active_attached_item: null,
      __preview_target_key: '',
      __preview_load_requested_target_key: '',
      __preview_signed_url: ''
    }
  };
}

function install(state) {
  const timers = [];
  const listeners = {};
  const root = { dataset: {}, addEventListener() {} };
  const stage = { textContent: 'Preview is loading…', innerHTML: '' };
  let rerenders = 0;
  const document = {
    addEventListener(type, handler) { listeners[type] = handler; },
    getElementById(id) {
      if (id === 'bulkAuthoriseWorkbenchRoot') return root;
      if (id === 'bulkProcessPreviewStage') return stage;
      return null;
    },
    querySelectorAll() { return []; }
  };
  const win = {
    document,
    modalCtx: { entity: 'bulk-authorise', bulkAuthoriseState: state },
    renderBulkAuthoriseShell() { return '<div id="bulkAuthoriseWorkbenchRoot"></div>'; },
    async refreshBulkAuthoriseActiveContext() { return true; },
    async bindBulkAuthoriseEvidencePane() { return true; },
    async bindBulkAuthorisePreviewPane() { return true; },
    async rerenderBulkAuthoriseWorkbench() { rerenders += 1; return true; },
    setTimeout(callback) { timers.push(callback); return timers.length; }
  };
  const context = {
    window: win,
    console,
    Promise,
    WeakMap,
    Map,
    Set,
    JSON,
    Date,
    Math,
    Object,
    Array,
    String,
    Number
  };
  vm.runInNewContext(source, context, { filename: 'bulk-authorise-evidence-controller.js' });
  return {
    win,
    root,
    stage,
    timers,
    listeners,
    get rerenders() { return rerenders; },
    controller: win.__bulkAuthoriseEvidenceControllerTest.controllerFor(state),
    api: win.__bulkAuthoriseEvidenceControllerTest
  };
}

test('authoritative context removes synthetic Timesheet evidence and derives matching badges', () => {
  const accommodation = evidence('evidence:accommodation', 'ACCOMMODATION', 'files/accommodation.jpg');
  const travel = evidence('evidence:travel', 'TRAVEL', 'files/travel.jpg');
  const syntheticTimesheet = evidence('synthetic-attached:primary', 'TIMESHEET', 'files/accommodation.jpg', {
    evidence_id: null,
    __synthetic_attached_fallback: true,
    is_synthetic_attached_fallback: true
  });
  const state = makeState([syntheticTimesheet, accommodation, travel]);
  const { win, api } = install(state);

  win.renderBulkAuthoriseShell(state);

  assert.deepEqual(
    Array.from(state.evidence_pane_state.attached_rows, (item) => String(item.kind)),
    ['ACCOMMODATION', 'TRAVEL']
  );
  assert.deepEqual(Array.from(api.positiveBadgeKinds(state.active_row.evidence_badges), String), ['TRAVEL', 'ACCOMMODATION']);
  assert.equal(state.active_details.manual_pdf_r2_key, null);
  assert.equal(state.active_details.timesheet.manual_pdf_r2_key, null);
  assert.equal(state.active_context.details.manual_pdf_r2_key, null);
  assert.equal(state.active_context.details.timesheet.manual_pdf_r2_key, null);
  assert.equal(state.active_row.attached_evidence_count, 2);
  assert.equal(state.active_row.has_any_evidence, true);
});

test('a thumbnail selection remains canonical without rerendering the whole modal', async () => {
  const accommodation = evidence('evidence:accommodation', 'ACCOMMODATION', 'files/accommodation.jpg');
  const travel = evidence('evidence:travel', 'TRAVEL', 'files/travel.jpg');
  const state = makeState([accommodation, travel]);
  const harness = install(state);
  harness.controller.sanitize('initial');
  const travelSelection = harness.api.selectionKey(travel);
  const button = {
    getAttribute(name) {
      const values = {
        'data-attached-selection-key': travelSelection,
        'data-attached-id': travel.evidence_id,
        'data-file-key': travel.storage_key,
        'data-storage-key': travel.storage_key
      };
      return values[name] || '';
    }
  };

  await harness.controller.selectFromButton(button);
  harness.controller.sanitize('simulated-rerender');

  assert.equal(harness.rerenders, 0);
  assert.equal(state.evidence_pane_state.active_attached_id, travel.evidence_id);
  assert.equal(state.evidence_pane_state.active_attached_item.kind, 'TRAVEL');
  assert.equal(state.evidence_pane_state.__preview_target_key, travelSelection);
  assert.equal(state.evidence_pane_state.__preview_load_requested_target_key, '');
});

test('Queue preview remains separate and Attached restores the row selection and badges', async () => {
  const accommodation = evidence('evidence:accommodation', 'ACCOMMODATION', 'files/accommodation.jpg');
  const travel = evidence('evidence:travel', 'TRAVEL', 'files/travel.jpg');
  const state = makeState([accommodation, travel]);
  const harness = install(state);
  harness.controller.sanitize('initial');
  await harness.controller.selectAttached(travel, 'test');

  const pane = state.evidence_pane_state;
  pane.active_tab = 'queue';
  pane.active_queue_id = 'queue:one';
  pane.active_queue_item = { id: 'queue:one', storage_key: 'queue/one.jpg' };
  pane.__preview_target_key = 'queue|queue:one|queue/one.jpg';
  pane.__preview_load_requested_target_key = 'queue|queue:one|queue/one.jpg';
  pane.__preview_signed_url = 'https://example.invalid/queue-one';
  state.active_row.evidence_badges = badges('TIMESHEET', 'TRAVEL', 'ACCOMMODATION');

  harness.controller.sanitize('queue-open');

  assert.equal(pane.active_tab, 'queue');
  assert.equal(pane.active_queue_id, 'queue:one');
  assert.equal(pane.__preview_target_key, 'queue|queue:one|queue/one.jpg');
  assert.equal(pane.__preview_signed_url, 'https://example.invalid/queue-one');
  assert.deepEqual(Array.from(harness.api.positiveBadgeKinds(state.active_row.evidence_badges), String), ['TRAVEL', 'ACCOMMODATION']);

  pane.active_tab = 'attached';
  harness.controller.sanitize('return-attached');

  assert.equal(pane.active_queue_id, null);
  assert.equal(pane.active_attached_id, travel.evidence_id);
  assert.equal(pane.active_attached_item.kind, 'TRAVEL');
  assert.equal(pane.__preview_target_key, harness.api.selectionKey(travel));
});

test('an unresolved loading state becomes an explicit retryable error', () => {
  const travel = evidence('evidence:travel', 'TRAVEL', 'files/travel.jpg');
  const state = makeState([travel]);
  const harness = install(state);
  harness.controller.sanitize('initial');
  const target = harness.api.selectionKey(travel);

  harness.controller.scheduleTerminalGuard(state.active_row_key, target);
  harness.timers.at(-1)();

  assert.equal(state.evidence_pane_state.__preview_loading, false);
  assert.equal(state.evidence_pane_state.__preview_error, 'The preview could not be prepared.');
  assert.match(harness.stage.innerHTML, /Retry preview/);
  assert.doesNotMatch(harness.stage.innerHTML, /Preview is loading/);
});

test('non-Timesheets classifications are not changed', () => {
  const travel = evidence('evidence:travel', 'TRAVEL', 'files/travel.jpg');
  const state = makeState([travel]);
  state.classification = 'NHSP';
  const before = clone(state);
  const harness = install(state);

  const result = harness.controller.sanitize('non-timesheets');

  assert.equal(result.applied, false);
  assert.deepEqual(state, before);
});
