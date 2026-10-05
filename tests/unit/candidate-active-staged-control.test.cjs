const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'main.js'), 'utf8');
const mytms = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'mytms-office-v1.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'candidate-office-v1.css'), 'utf8');

function section(from, to) {
  const start = main.indexOf(from);
  assert.notEqual(start, -1, `missing ${from}`);
  const end = main.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `missing ${to}`);
  return main.slice(start, end);
}

test('Candidate status is a header control with no additional visible section or guidance', () => {
  const render = section('function renderCandidateTab(key, row = {})', 'async function openCandidateLoansOverpaymentsModal');
  assert.doesNotMatch(render, /<label>Candidate status<\/label>|data-candidate-active-toggle|data-candidate-active-pending/);
  assert.match(render, /name="active" value="\$\{candidateActive \? 'true' : 'false'\}"/);
  assert.doesNotMatch(render, /This is the CloudTMS Candidate status/);
  assert.match(mytms, /function candidateStatusPresentation\(status = \{\}\)/);
  assert.doesNotMatch(mytms, /data-candidate-active-toggle/);
  assert.doesNotMatch(mytms, /To activate this CloudTMS Candidate/);
  assert.match(main, /mt\.appendChild\(pill\);\s*\}\);\s*renderCandidateActiveHeader\(mt, top\)/);
});

test('active status only stages in Edit mode and is persisted by Candidate Save', () => {
  const bind = section('function renderCandidateActiveHeader(titleRoot, frame)', 'function showModal(');
  assert.match(bind, /!\['edit', 'create'\]\.includes\(frame.mode\)/);
  assert.match(bind, /candidateMainModel \|\|= \{\}\)\.active = active/);
  assert.match(bind, /frame\.isDirty = true/);
  assert.doesNotMatch(bind, /upsertCandidate|authFetch|fetch\(/);

  const save = section('async function openCandidate(row)', 'async function openCandidateRateModal');
  assert.match(save, /let payload\s+= \{ \.\.\.stateMain, \.\.\.statePay, \.\.\.main, \.\.\.pay, roles \}/);
  assert.match(save, /payload\.active = coerceBool\(payload\.active\)/);
  assert.match(save, /saved = await upsertCandidate\(payload, idForUpdate\)/);
  assert.match(save, /payload\.active = stagedCandidate\.active/);
});

test('Candidate Discard snapshots preserve the rate-deletion Set without sharing staged edits', () => {
  const sandbox = { Set };
  vm.createContext(sandbox);
  vm.runInContext(section('function cloneCandidateRateOverrideStage(overrides)', 'function renderCandidateActiveHeader('), sandbox);
  for (const deletes of [new Set(), new Set(['rate-one']), ['rate-one']]) {
    const original = { existing: [{ id: 'rate-one' }], stagedNew: [], stagedEdits: {}, stagedDeletes: deletes };
    const snapshot = sandbox.cloneCandidateRateOverrideStage(original);
    const restored = sandbox.cloneCandidateRateOverrideStage(snapshot);
    assert(restored.stagedDeletes instanceof Set);
    assert.deepEqual(Array.from(restored.stagedDeletes), Array.from(deletes));
    restored.stagedDeletes.add('rate-two');
    restored.existing[0].id = 'changed';
    assert.equal(snapshot.stagedDeletes.has('rate-two'), false);
    assert.equal(original.existing[0].id, 'rate-one');
  }
  assert.throws(() => sandbox.cloneCandidateRateOverrideStage({ stagedDeletes: {} }), /stage is invalid/);
  assert.equal((main.match(/cloneCandidateRateOverrideStage\(window\.modalCtx\?\.overrides\)/g) || []).length, 2);
  assert.equal((main.match(/cloneCandidateRateOverrideStage\((?:fr|top)\._snapshot\.overrides\)/g) || []).length, 3);
});

function headerFixture(mode, savedActive = true, stagedActive = savedActive) {
  const children = [], inputs = [{ value: String(savedActive) }], events = [];
  const document = {
    createElement() { return { dataset: {}, attributes: {}, listeners: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(key, handler) { this.listeners[key] = handler; } }; },
    querySelectorAll() { return inputs; }
  };
  const sandbox = { document, Event: class { constructor(type) { this.type = type; } },
    window: { dispatchEvent(event) { events.push(event.type); } } };
  vm.createContext(sandbox);
  vm.runInContext(section('function renderCandidateActiveHeader(titleRoot, frame)', 'function showModal('), sandbox);
  const context = { data: { active: savedActive }, candidateMainModel: { active: stagedActive }, formState: { main: {} } };
  let updates = 0;
  const frame = { entity: 'candidates', mode, _ctxRef: context, _updateButtons() { updates++; } };
  const root = { querySelector() { return null; }, appendChild(element) { children.push(element); } };
  sandbox.renderCandidateActiveHeader(root, frame);
  return { sandbox, root, children, frame, context, inputs, events, updates: () => updates };
}

test('View cannot toggle; Edit rotates green/red, stages without changing saved data, and survives rerender', () => {
  const view = headerFixture('view', false);
  assert.equal(view.children[0].disabled, true);
  view.children[0].listeners.click();
  assert.equal(view.context.data.active, false);
  assert.equal(view.events.length, 0);
  const edit = headerFixture('edit');
  const badge = edit.children[0];
  assert.equal(badge.textContent, 'Active');
  badge.listeners.click();
  assert.equal(badge.textContent, 'Inactive');
  assert.match(badge.className, /--inactive/);
  assert.equal(edit.context.candidateMainModel.active, false);
  assert.equal(edit.context.formState.main.active, false);
  assert.equal(edit.inputs[0].value, 'false');
  assert.equal(edit.context.data.active, true);
  assert.equal(edit.frame.isDirty, true);
  assert.equal(edit.updates(), 1);
  assert.deepEqual(edit.events, ['modal-dirty']);
  edit.sandbox.renderCandidateActiveHeader(edit.root, edit.frame);
  assert.equal(edit.children[1].textContent, 'Inactive');
  edit.children[1].listeners.click();
  assert.equal(edit.context.candidateMainModel.active, true);
  assert.equal(edit.context.data.active, true);
});

test('saving and child dialogs cannot mutate candidate status', () => {
  const fixture = headerFixture('edit');
  fixture.frame._saving = true;
  fixture.children[0].listeners.click();
  assert.equal(fixture.context.candidateMainModel.active, true);
  fixture.frame.kind = 'candidate-rate';
  fixture.sandbox.renderCandidateActiveHeader(fixture.root, fixture.frame);
  assert.equal(fixture.children.length, 1);
});

test('mode changes rebuild the header control and its colours override generic modal buttons', () => {
  assert.equal(main.includes('renderCandidateActiveHeader(mt, top)'), true);
  assert.equal(main.includes("renderCandidateActiveHeader(byId('modalTitle'), top)"), true);
  assert.match(styles, /#modal\.ctms-modern-modal #modalTitle \.candidate-agency-status--active/);
  assert.match(styles, /#modal\.ctms-modern-modal #modalTitle \.candidate-agency-status--inactive/);
  const fixture = headerFixture('view', false);
  fixture.frame.mode = 'edit';
  fixture.sandbox.renderCandidateActiveHeader(fixture.root, fixture.frame);
  assert.equal(fixture.children[1].disabled, false);
  fixture.children[1].listeners.click();
  assert.equal(fixture.context.candidateMainModel.active, true);
  // Discard restores the saved model; rebuilding View must not retain the staged value.
  fixture.context.candidateMainModel = { active: fixture.context.data.active };
  fixture.frame.mode = 'view';
  fixture.sandbox.renderCandidateActiveHeader(fixture.root, fixture.frame);
  assert.equal(fixture.children[2].textContent, 'Inactive');
  assert.equal(fixture.children[2].disabled, true);
});
