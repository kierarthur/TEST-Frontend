const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const moduleSource = fs.readFileSync(path.join(root, 'js/manager-authorisers.js'), 'utf8');
function fn(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\)[ \\t]*\\{[\\s\\S]*?\\r?\\n\\}`));
  assert.ok(match, name);
  return match[0];
}
const helpers = ['canonicalizeClientSettings', 'contractTimesheetAuthorisersRequired', 'markContractModalSaved', 'restoreModalDirtyAfterRender'].map(fn).join('\n');
const api = vm.runInNewContext(`${helpers}; ({contractTimesheetAuthorisersRequired, markContractModalSaved, restoreModalDirtyAfterRender})`, { window: {} });
function context(settings, data = {}, main = {}) {
  return { entity: 'contracts', data: { id: 'contract', client_id: 'client', ...data }, formState: { __forId: 'contract', main }, client_settings_snapshot_client_id: 'client', client_settings_snapshot: settings };
}
for (const [label, settings, expected] of [
  ['NHSP', { weekly_mode: 'NHSP' }, false],
  ['legacy NHSP', { is_nhsp: true }, false],
  ['roster authoritative', { weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'CREATE' }, false],
  ['legacy roster authoritative', { autoprocess_hr: true, no_timesheet_required: true }, false],
  ['roster verification', { weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'VERIFY' }, true],
  ['ordinary weekly', { weekly_mode: 'NONE' }, true],
  ['empty defaults', {}, true]
]) test(`authorisers follow inherited ${label} route`, () => assert.equal(api.contractTimesheetAuthorisersRequired(context(settings)), expected));
test('explicit and staged Contract overrides take precedence, including switching back to Client inheritance', () => {
  assert.equal(api.contractTimesheetAuthorisersRequired(context({ weekly_mode: 'NHSP' }, { overrideclientsettings: true, is_nhsp: false })), true);
  assert.equal(api.contractTimesheetAuthorisersRequired(context({ weekly_mode: 'NONE' }, {}, { overrideclientsettings: 'on', autoprocess_hr: '1', no_timesheet_required: true })), false);
  assert.equal(api.contractTimesheetAuthorisersRequired(context({ weekly_mode: 'NHSP' }, { overrideclientsettings: true, is_nhsp: false }, { overrideclientsettings: false })), false);
});
test('unresolved, stale Client snapshots and another record’s draft are not used', () => {
  const ctx = context({ weekly_mode: 'NHSP' });
  ctx.client_settings_snapshot_client_id = 'old-client';
  assert.equal(api.contractTimesheetAuthorisersRequired(ctx), null);
  ctx.client_settings_snapshot_client_id = 'client';
  ctx.formState = { __forId: 'other', main: { overrideclientsettings: true, is_nhsp: false } };
  assert.equal(api.contractTimesheetAuthorisersRequired(ctx), false);
});
for (const result of ['success', 'false', 'throw']) test(`actual nested Contract save handler: ${result}`, async () => {
  const ctx = context({ weekly_mode: 'NHSP' });
  ctx.__calendarDirty = ctx.__nonCalendarDirty = ctx.__contractSettingsDirty = true;
  const frame = { entity: 'contracts', kind: 'contracts', mode: 'create', noParentGate: true, isDirty: true, _ctxRef: ctx, persistCurrentTabState() {}, _updateButtons() {}, onSave: async () => {
    if (result === 'throw') throw Error('save failed');
    return result === 'success' ? { ok: true, saved: { id: 'contract' } } : false;
  } };
  const sandbox = { window: { modalCtx: ctx, __modalStack: [{ kind: 'weekly-source-workspace' }, frame] }, console, L() {}, hasStagedClientDeletes: () => false, isPrimaryRecordFrame: () => true, isTemplateEditorKind: () => false, deep: (v) => v, currentRows: [], mergeContractAuthoritativeIntoModal: (old, saved) => ({ ...old, ...saved }), setFrameMode: (fr, mode) => { fr.mode = mode; } };
  const save = vm.runInNewContext(`${helpers}\n${fn('saveForFrame')}; saveForFrame`, sandbox);
  await save(frame);
  assert.equal(frame.isDirty, result !== 'success');
  assert.equal(frame.mode, result === 'success' ? 'view' : 'create');
  assert.equal(ctx.__nonCalendarDirty, result !== 'success');
  assert.equal(sandbox.window.__modalStack.length, 2, 'saved Contract remains open; chooser stays underneath');
  assert.equal(sandbox.window.__modalStack[0].kind, 'weekly-source-workspace');
  if (result === 'success') {
    api.restoreModalDirtyAfterRender(frame, true, 0);
    assert.equal(frame.isDirty, false, 'old rendering cannot resurrect saved dirtiness');
    frame.mode = 'edit';
    api.restoreModalDirtyAfterRender(frame, true, 0);
    assert.equal(frame.isDirty, false, 'old rendering cannot make a later clean edit dirty');
    frame.isDirty = true;
    api.restoreModalDirtyAfterRender(frame, false, frame.__contractSaveRevision);
    assert.equal(frame.isDirty, true, 'new genuine edit still requires confirmation');
  }
});
test('dirty restore preserves failed-save drafts and leaves other entity behaviour unchanged', () => {
  const contract = { entity: 'contracts', mode: 'edit', isDirty: true };
  api.restoreModalDirtyAfterRender(contract, true, 0);
  assert.equal(contract.isDirty, true);
  const other = { entity: 'timesheets', mode: 'view', isDirty: false };
  api.markContractModalSaved(other);
  api.restoreModalDirtyAfterRender(other, true, 0);
  assert.equal(other.isDirty, true);
  assert.equal(other.__contractSaveRevision, undefined);
});
test('authoriser scan waits for routing, removes irrelevant panels, and still loads ordinary authorisers', async () => {
  let required = null, panel = null, requests = 0, observer;
  const events = {};
  const contractRoot = { querySelector: () => panel, insertBefore(node) { panel = node; } };
  const document = { documentElement: {}, getElementById: (id) => id === 'contractForm' ? contractRoot : null, addEventListener() {}, createElement: () => ({ dataset: {}, isConnected: true, remove() { this.isConnected = false; panel = null; } }) };
  vm.runInNewContext(moduleSource, { window: { modalCtx: context({}), contractTimesheetAuthorisersRequired: () => required, addEventListener: (name, cb) => { events[name] = cb; } }, document, MutationObserver: class { constructor(cb) { observer = cb; } observe() {} }, API: String, authFetch: async () => { requests++; return { ok: true, json: async () => ({ effective_policy: {} }) }; } });
  await Promise.resolve();
  assert.equal(panel, null);
  required = false; events['contracts-client-settings-loaded'](); await Promise.resolve();
  assert.equal(panel, null); assert.equal(requests, 0);
  required = true; observer(); await new Promise(setImmediate);
  assert.match(panel.innerHTML, /Timesheet authorisers/); assert.equal(requests, 1);
  required = false; events['contracts-main-rendered'](); await Promise.resolve();
  assert.equal(panel, null);
});
