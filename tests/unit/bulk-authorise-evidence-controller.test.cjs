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

function thumbnailButton(item, initialClasses = []) {
  const attributes = {
    'data-attached-id': item.evidence_id || item.id || ''
  };
  const classes = new Set(['btn', 'btn-outline', ...initialClasses]);
  return {
    style: {},
    __listeners: {},
    getAttribute(name) { return attributes[name] || ''; },
    setAttribute(name, value) { attributes[name] = String(value); },
    addEventListener(type, handler) { this.__listeners[type] = handler; },
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) { return classes.has(name); }
    }
  };
}

function actionButton() {
  const listeners = {};
  return {
    dataset: {},
    disabled: false,
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    async dispatch(type = 'click') {
      const event = {
        defaultPrevented: false,
        immediatePropagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.immediatePropagationStopped = true; }
      };
      for (const handler of listeners[type] || []) await handler(event);
      return event;
    }
  };
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

function install(state, options = {}) {
  const timers = [];
  const listeners = {};
  const thumbnailButtons = Array.isArray(options.thumbnailButtons) ? options.thumbnailButtons : [];
  const elements = options.elements && typeof options.elements === 'object' ? options.elements : {};
  const previewLabel = options.previewLabel || null;
  const root = {
    dataset: {},
    addEventListener() {},
    querySelector(selector) {
      return selector === '#bulkProcessPreviewLabel' ? previewLabel : null;
    },
    querySelectorAll() { return []; }
  };
  const stage = { textContent: 'Preview is loading…', innerHTML: '' };
  let rerenders = 0;
  const document = {
    addEventListener(type, handler) { listeners[type] = handler; },
    getElementById(id) {
      if (id === 'bulkAuthoriseWorkbenchRoot') return root;
      if (id === 'bulkProcessPreviewStage') return stage;
      if (Object.prototype.hasOwnProperty.call(elements, id)) return elements[id];
      return null;
    },
    querySelectorAll(selector) {
      return String(selector).includes('[data-bp-preview-attached-thumb="1"]') ? thumbnailButtons : [];
    }
  };
  const win = {
    document,
    modalCtx: { entity: 'bulk-authorise', bulkAuthoriseState: state },
    BROKER_BASE_URL: options.brokerBaseUrl || '',
    authFetch: options.authFetch,
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

test('authoritative server badge flags remain usable when attachment normalisation yields no rows', () => {
  const state = makeState([]);
  const harness = install(state);
  const badgeState = harness.api.badgeStateFromPayload({
    evidence_badges: badges('TIMESHEET'),
    has_any_evidence: true,
    attached_evidence_count: 1
  }, []);

  assert.deepEqual(Array.from(harness.api.positiveBadgeKinds(badgeState.evidence_badges), String), ['TIMESHEET']);
  assert.equal(badgeState.has_any_evidence, true);
  assert.equal(badgeState.attached_evidence_count, 1);
});

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

test('the active thumbnail border moves with the selected evidence item', async () => {
  const accommodation = evidence('evidence:accommodation', 'ACCOMMODATION', 'files/accommodation.jpg');
  const travel = evidence('evidence:travel', 'TRAVEL', 'files/travel.jpg');
  const accommodationButton = thumbnailButton(accommodation);
  const travelButton = thumbnailButton(travel, ['active', 'selected']);
  const state = makeState([accommodation, travel]);
  const harness = install(state, { thumbnailButtons: [accommodationButton, travelButton] });

  harness.controller.sanitize('initial');
  harness.controller.renderAttachedSelection();

  assert.equal(accommodationButton.style.border, '2px solid var(--accent,#6ea8fe)');
  assert.equal(travelButton.style.border, '1px solid var(--line)');
  assert.equal(accommodationButton.getAttribute('aria-selected'), 'true');
  assert.equal(accommodationButton.classList.contains('active'), true);
  assert.equal(accommodationButton.classList.contains('selected'), true);
  assert.equal(travelButton.classList.contains('active'), false);
  assert.equal(travelButton.classList.contains('selected'), false);

  await harness.controller.selectFromButton(travelButton);

  assert.equal(accommodationButton.style.border, '1px solid var(--line)');
  assert.equal(travelButton.style.border, '2px solid var(--accent,#6ea8fe)');
  assert.equal(accommodationButton.getAttribute('aria-selected'), 'false');
  assert.equal(travelButton.getAttribute('aria-selected'), 'true');
  assert.equal(accommodationButton.classList.contains('active'), false);
  assert.equal(accommodationButton.classList.contains('selected'), false);
  assert.equal(travelButton.classList.contains('active'), true);
  assert.equal(travelButton.classList.contains('selected'), true);
});

test('the preview heading uses the real filename instead of a generic PDF-style label', async () => {
  const timesheet = evidence('evidence:timesheet', 'TIMESHEET', 'files/TIMESHEET.jpg', {
    filename: 'TIMESHEET.jpg',
    display_name: 'Uploaded timesheet PDF',
    mime_type: 'image/jpeg'
  });
  let textWrites = 0;
  let labelText = '';
  const previewLabel = {
    attributes: {},
    get textContent() { return labelText; },
    set textContent(value) { textWrites += 1; labelText = String(value); },
    getAttribute(name) { return this.attributes[name] || ''; },
    setAttribute(name, value) { this.attributes[name] = String(value); }
  };
  const state = makeState([timesheet]);
  const harness = install(state, { previewLabel });

  harness.controller.sanitize('initial');
  await harness.controller.selectAttached(timesheet, 'test-filename');
  harness.controller.syncPreviewMetadata(timesheet);

  assert.equal(previewLabel.textContent, 'TIMESHEET.jpg');
  assert.equal(previewLabel.attributes.title, 'TIMESHEET.jpg');
  assert.equal(textWrites, 1);
});

test('Attached Previous and Next use the controller selection while Queue navigation remains untouched', async () => {
  const accommodation = evidence('evidence:accommodation', 'ACCOMMODATION', 'files/accommodation.jpg');
  const travel = evidence('evidence:travel', 'TRAVEL', 'files/travel.jpg');
  const previous = actionButton();
  const next = actionButton();
  const state = makeState([accommodation, travel]);
  const harness = install(state, {
    elements: {
      bpQueuePrevBtn: previous,
      bpQueueNextBtn: next
    }
  });
  harness.controller.sanitize('initial');
  harness.controller.renderAttachedSelection();

  const attachedNextEvent = await next.dispatch();
  assert.equal(attachedNextEvent.defaultPrevented, true);
  assert.equal(attachedNextEvent.immediatePropagationStopped, true);
  assert.equal(state.evidence_pane_state.active_attached_id, travel.evidence_id);
  assert.equal(state.evidence_pane_state.__preview_target_key, harness.api.selectionKey(travel));

  const attachedPreviousEvent = await previous.dispatch();
  assert.equal(attachedPreviousEvent.defaultPrevented, true);
  assert.equal(attachedPreviousEvent.immediatePropagationStopped, true);
  assert.equal(state.evidence_pane_state.active_attached_id, accommodation.evidence_id);
  assert.equal(state.evidence_pane_state.__preview_target_key, harness.api.selectionKey(accommodation));

  state.evidence_pane_state.active_tab = 'queue';
  state.evidence_pane_state.active_queue_id = 'queue:one';
  const queueEvent = await next.dispatch();
  assert.equal(queueEvent.defaultPrevented, false);
  assert.equal(queueEvent.immediatePropagationStopped, false);
  assert.equal(state.evidence_pane_state.active_tab, 'queue');
  assert.equal(state.evidence_pane_state.active_queue_id, 'queue:one');
});

test('a visibly selected Queue tab wins over stale Attached state and preserves shared Queue navigation', async () => {
  const accommodation = evidence('evidence:accommodation', 'ACCOMMODATION', 'files/accommodation.jpg');
  const travel = evidence('evidence:travel', 'TRAVEL', 'files/travel.jpg');
  const next = actionButton();
  const state = makeState([accommodation, travel]);
  const harness = install(state, {
    elements: {
      bpQueueNextBtn: next,
      bulkProcessEvidenceTabQueue: {
        getAttribute(name) { return name === 'aria-selected' ? 'true' : ''; },
        classList: { contains() { return false; } }
      }
    }
  });
  harness.controller.sanitize('initial');
  harness.controller.renderAttachedSelection();

  const event = await next.dispatch();

  assert.equal(event.defaultPrevented, false);
  assert.equal(event.immediatePropagationStopped, false);
  assert.equal(state.evidence_pane_state.active_attached_id, accommodation.evidence_id);
});

test('a shared Attached navigation selection survives controller reconciliation', () => {
  const accommodation = evidence('evidence:accommodation', 'ACCOMMODATION', 'files/accommodation.jpg');
  const travel = evidence('evidence:travel', 'TRAVEL', 'files/travel.jpg');
  const state = makeState([accommodation, travel]);
  const harness = install(state);
  harness.controller.sanitize('initial');
  state.evidence_pane_state.active_attached_id = travel.evidence_id;
  state.evidence_pane_state.active_attached_item = clone(travel);
  state.evidence_pane_state.__preview_target_key = harness.api.selectionKey(travel);

  harness.controller.sanitize('after-shared-navigation');

  assert.equal(state.evidence_pane_state.active_attached_id, travel.evidence_id);
  assert.equal(state.evidence_pane_state.__preview_target_key, harness.api.selectionKey(travel));
  assert.equal(harness.controller.selectedByIdentity.get(state.active_row_key), harness.api.itemKey(travel));
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

test('all dataset row badges hydrate from evidence context before the corrected render', async () => {
  const travel = evidence('evidence:travel', 'TRAVEL', 'files/travel.jpg');
  const accommodation = evidence('evidence:accommodation', 'ACCOMMODATION', 'files/accommodation.jpg');
  const state = makeState([travel]);
  state.dataset.rows[0].evidence_badges = badges('TIMESHEET');
  state.dataset.rows[0].has_any_evidence = true;
  state.dataset.rows[0].attached_evidence_count = 1;
  state.active_row.evidence_badges = badges('TIMESHEET');
  state.dataset.rows.push({
    ...clone(state.dataset.rows[0]),
    row_key: 'timesheet:second',
    timesheet_id: 'second',
    current_timesheet_id: 'second',
    requested_timesheet_id: 'second',
    expected_timesheet_id: 'second',
    evidence_badges: badges('TIMESHEET')
  });

  let releaseSecondResponse;
  const secondResponseGate = new Promise((resolve) => { releaseSecondResponse = resolve; });
  const authFetch = async (url) => {
    if (String(url).includes('/second/')) await secondResponseGate;
    const rowEvidence = String(url).includes('/second/') ? [accommodation] : [travel];
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          ok: true,
          profile: 'evidence',
          context_profile: 'evidence',
          evidence_loaded: true,
          evidence: rowEvidence
        });
      }
    };
  };
  const harness = install(state, {
    brokerBaseUrl: 'https://test-worker.invalid',
    authFetch
  });

  const hydration = harness.controller.hydrateDatasetBadges();
  assert.deepEqual(Array.from(harness.api.positiveBadgeKinds(state.dataset.rows[0].evidence_badges), String), []);
  assert.deepEqual(Array.from(harness.api.positiveBadgeKinds(state.dataset.rows[1].evidence_badges), String), []);
  for (let attempt = 0; attempt < 20 && harness.rerenders === 0; attempt += 1) await Promise.resolve();
  assert.deepEqual(Array.from(harness.api.positiveBadgeKinds(state.dataset.rows[0].evidence_badges), String), ['TRAVEL']);
  assert.deepEqual(Array.from(harness.api.positiveBadgeKinds(state.dataset.rows[1].evidence_badges), String), []);
  assert.ok(harness.rerenders >= 1, 'the first verified row should render before all requests finish');
  releaseSecondResponse();
  const result = await hydration;

  assert.deepEqual(Array.from(harness.api.positiveBadgeKinds(state.dataset.rows[0].evidence_badges), String), ['TRAVEL']);
  assert.deepEqual(Array.from(harness.api.positiveBadgeKinds(state.dataset.rows[1].evidence_badges), String), ['ACCOMMODATION']);
  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 0);
  assert.equal(state.__bulk_authorise_badge_hydration_complete, true);
  assert.ok(harness.rerenders >= 2);
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
