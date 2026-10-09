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
const helpers = ['canonicalizeClientSettings', 'contractTimesheetAuthorisersRequired', 'markContractModalSaved', 'restoreModalDirtyAfterRender', 'offerMyTmsAfterContractModalSaved'].map(fn).join('\n');
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

for (const nested of [false, true, 'force-edit-create']) {
  for (const outcome of ['decline', 'header-close', 'escape', 'accepted', 'status-failure', 'send-failure']) {
    test(`successful ${nested ? 'nested' : 'top-level'} create stays saved after invitation ${outcome}`, async () => {
      const ctx = context({ weekly_mode: 'NHSP' });
      ctx.data = { candidate_id: 'candidate', client_id: 'client' };
      ctx.formState.__forId = 'new';
      ctx.__nonCalendarDirty = true;
      const events = [];
      const saved = { id: 'saved-contract', candidate_id: 'candidate', client_id: 'client' };
      const frame = { entity: 'contracts', kind: 'contracts', mode: nested === 'force-edit-create' ? 'edit' : 'create', hasId: false, noParentGate: true, isDirty: true, _ctxRef: ctx,
        persistCurrentTabState() {}, _updateButtons() {}, onSave: async () => {
          events.push('contract-persisted', 'source-settings-saved', 'authorisers-saved');
          return { ok: true, saved };
        } };
      const stack = nested ? [{ kind: 'weekly-source-workspace' }, frame] : [frame];
      let requests = 0, prompts = 0;
      const window = { modalCtx: ctx, __modalStack: stack,
        API: String, console, crypto: { randomUUID: () => 'test-request-key' }, showModalHint() {},
        authFetch: async (url, init = {}) => {
          requests++;
          if (!init.method) {
            if (outcome === 'status-failure') throw Error('unavailable');
            return { ok: true, json: async () => ({ state: 'NOT_INVITED', candidate_id: 'candidate', settings_version: 1,
              action: { code: 'INVITE_TO_MYTMS', enabled: true } }) };
          }
          if (outcome === 'send-failure') throw Error('unavailable');
          return { ok: true, json: async () => ({ status: 'OUTBOX_ACCEPTED' }) };
        },
        openUiConfirmModal: async (opts) => {
          prompts++;
          assert.equal(events.at(-1), 'view', 'all Contract saves precede the offer');
          assert.equal(frame.mode, 'view'); assert.equal(frame.isDirty, false);
          assert.equal(frame.hasId, true); assert.equal(ctx.data.id, saved.id);
          assert.equal(ctx.formState.__forId, saved.id); assert.equal(ctx.__nonCalendarDirty, false);
          assert.equal(opts.frameEntity, 'mytms-action-confirmation', 'child does not inherit Contract identity');
          const previousDirty = frame.isDirty;
          const revision = frame.__contractSaveRevision;
          // Execute dirty restoration as a suspended render completes after the child returns.
          sandbox.restoreModalDirtyAfterRender(frame, previousDirty, revision);
          return { confirmed: ['accepted', 'send-failure'].includes(outcome), via: outcome };
        } };
      window.window = window;
      const sandbox = { window, console, L() {}, hasStagedClientDeletes: () => false,
        isPrimaryRecordFrame: () => true, isTemplateEditorKind: () => false, deep: (v) => v, currentRows: [],
        mergeContractAuthoritativeIntoModal: (old, row) => ({ ...old, ...row }),
        setFrameMode: (fr, mode) => { events.push(mode); fr.mode = mode; }, Date, Promise, URL };
      vm.createContext(sandbox);
      vm.runInContext(fs.readFileSync(path.join(root, 'js/mytms-office-v1.js'), 'utf8'), sandbox);
      vm.runInContext(`${helpers}\n${fn('saveForFrame')}`, sandbox);
      await sandbox.saveForFrame(frame);
      assert.equal(frame.isDirty, false); assert.equal(frame.mode, 'view');
      assert.equal(frame._snapshot, null); assert.equal(ctx.data.id, saved.id);
      assert.equal(stack.at(-1), frame, 'same saved parent and underlying chooser survive');
      assert.equal(prompts, outcome === 'status-failure' ? 0 : outcome === 'accepted' ? 2 : 1);
      assert.equal(requests, ['accepted', 'send-failure'].includes(outcome) ? 2 : 1);
      frame.mode = 'edit'; frame.isDirty = true;
      sandbox.restoreModalDirtyAfterRender(frame, false, frame.__contractSaveRevision);
      assert.equal(frame.isDirty, true, 'later real edits still require Discard');
    });
  }
}

test('post-save offer ignores updates, closed/replaced owners and incomplete saved identity', async () => {
  let offered = 0;
  const fr = { entity: 'contracts', mode: 'view', isDirty: false };
  const window = { __modalStack: [fr], CloudTMSMyTmsOffice: { offerAfterContractSuccess: async () => { offered++; } } };
  const offer = vm.runInNewContext(`${fn('offerMyTmsAfterContractModalSaved')}; offerMyTmsAfterContractModalSaved`, { window });
  await offer(fr, { id: 'contract', candidate_id: 'candidate' }, false);
  await offer(fr, { candidate_id: 'candidate' }, true);
  await offer(fr, { id: 'contract' }, true);
  window.__modalStack = [{ entity: 'candidates' }];
  await offer(fr, { id: 'contract', candidate_id: 'candidate' }, true);
  assert.equal(offered, 0);
});

test('invitation is outside low-level persistence and confirmation forwards its isolated frame identity', () => {
  assert.doesNotMatch(fn('upsertContract'), /offerAfterContractSuccess/);
  assert.match(fn('saveForFrame'), /setFrameMode\(fr, 'view'\)[\s\S]*await offerMyTmsAfterContractModalSaved/);
  assert.match(fn('openUiConfirmModal'), /frameEntity: opts\.frameEntity/);
});
