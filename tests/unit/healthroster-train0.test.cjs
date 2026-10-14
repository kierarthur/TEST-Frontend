const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const workspace = require('../../js/weekly-source/import-workspace.js');
const combined = require('../../js/weekly-source/combined-review.js');
const payPermissions = { contract: 'WEEKLY_SOURCE_PAYMENT_VIEW_V1', view: 'PAY',
  allowed_tabs: ['queries'], allowed_sections: ['questions', 'checks', 'protected'], landing_tab: 'queries',
  can_upload: false, can_finalise: false, can_manage_settings: false,
  checklist: { available: false, read_only: true, pay_only: true, action_links: false } };

test('server pay permissions select Queries without exposing administrative tabs or communications', () => {
  const model = workspace.normaliseWorkspace({ permissions: payPermissions, queries: { rows: [] } });
  assert.deepEqual(workspace.tabDescriptors(model).map(tab => tab.key), ['queries']);
  for (const deepLink of ['imports', 'finalise', 'history', 'checklist']) {
    const html = workspace.renderWorkspace(model, deepLink);
    assert.match(html, /data-ws-tab="queries"/);
    assert.doesNotMatch(html, /data-ws-upload|data-ws-recheck|Ask selected candidates|Send selected to manager now|data-ws-finalise>/);
    assert.match(html, /Refresh list/);
  }
});

test('combined pay view keeps declared sections and read selectors while hiding contact and attention controls', () => {
  const html = combined.render({ contract: 'WEEKLY_SOURCE_COMBINED_REVIEW_V1', tab: 'queries',
    section: 'questions', rows: [], owners: [], permissions: payPermissions });
  assert.match(html, /Hours questions|Office checks|Protected shifts|Refresh list/);
  assert.doesNotMatch(html, /Outstanding Office decisions|Needs attention|Ask selected|Email manager|ws-contact/);
  const forbidden = combined.render({ contract: 'WEEKLY_SOURCE_COMBINED_REVIEW_V1', tab: 'imports',
    section: 'questions', rows: [{ file: 'must-not-render' }], permissions: payPermissions });
  assert.doesNotMatch(forbidden, /must-not-render/);
});

test('an absent cycle never appears to have reached a cutoff or finalisation', () => {
  const model = workspace.normaliseWorkspace({ context: {} });
  assert.equal(model.context.cycle_state, 'To check');
  assert.equal(model.context.cycle_tone, 'warning');
  assert.doesNotMatch(workspace.renderWorkspace(model, 'imports'), />Before cutoff<|>Ready for finalisation<|>Finalised</);
});

test('new correction and mail labels remain visible but cannot dispatch uninstalled commands', () => {
  const labels = ['Send reminder', 'Send reminder for selected', 'Send again', 'Correct this Timesheet',
    'Cancel correction', 'Authorise both', 'Open Timesheet'];
  const model = workspace.normaliseWorkspace({ queries: { rows: [{ group_key: 'synthetic',
    actions: labels.map(label => ({ label, enabled: true, command: 'UNINSTALLED_COMMAND', payload: { id: 'synthetic' } }))
  }] } });
  const html = workspace.renderWorkspace(model, 'queries');
  for (const label of labels) {
    assert.match(html, new RegExp(` disabled[^>]*>${label}</button>`), label);
  }
  assert.match(html, /This action is not available yet/);
  assert.doesNotMatch(html, /UNINSTALLED_COMMAND/);
});

test('daily review forward labels stay disabled while the existing source actions work', () => {
  const model = workspace.normaliseWorkspace({ imports: { rows: [{ file: 'synthetic.xlsx', actions: [
    { label: 'Continue daily check', enabled: true }, { label: 'View daily check', enabled: true },
    { label: 'View', enabled: true }
  ] }] } });
  const html = workspace.renderWorkspace(model, 'imports');
  assert.match(html, / disabled[^>]*>Continue daily check<\/button>/);
  assert.match(html, / disabled[^>]*>View daily check<\/button>/);
  assert.match(html, /data-ws-action="View"[^>]*>View<\/button>/);
});

test('the shared modal supplies stable tab keys and the workspace reads those keys', () => {
  const main = fs.readFileSync(require.resolve('../../js/main.js'), 'utf8');
  const source = fs.readFileSync(require.resolve('../../js/weekly-source/import-workspace.js'), 'utf8');
  assert.match(main, /b\.dataset\.tabKey = String\(t\.key \|\| ''\)/);
  assert.match(source, /descriptors\.find\(\(entry\) => entry\.key === button\.dataset\.tabKey\)/);
});

test('legacy signed checks remain until the replacement producer contract is qualified', () => {
  const model = workspace.normaliseWorkspace({ imports: { journey: {
    authority_mode: 'TIMESHEET_AUTHORITY', title: 'Signed Timesheet decides hours',
    attention_rows: [{ candidate: 'Synthetic worker', attention: 'Existing comparison', actions: ['View Timesheet'] }]
  } } });
  assert.deepEqual(workspace.tabDescriptors(model).map(tab => tab.key), ['imports', 'queries', 'finalise', 'history', 'checklist']);
  const html = workspace.renderWorkspace(model, 'imports');
  assert.match(html, /Existing comparison/);
  assert.doesNotMatch(html, /Any difference is emailed to Temp Staffing/);
});

test('native pay Checklist admission requires every reduced-view declaration together', () => {
  const native={...payPermissions,allowed_tabs:['queries','checklist'],checklist:{available:true,read_only:true,pay_only:true,action_links:false}};
  assert.deepEqual(workspace.tabDescriptors(workspace.normaliseWorkspace({permissions:native})).map(tab=>tab.key),['queries','checklist']);
  for(const alter of [value=>value.allowed_tabs=['queries'],value=>value.checklist.available=false,value=>value.checklist.read_only=false,value=>value.checklist.pay_only=false,value=>value.checklist.action_links=true]){
    const value=structuredClone(native);alter(value);assert.deepEqual(workspace.tabDescriptors(workspace.normaliseWorkspace({permissions:value})).map(tab=>tab.key),['queries']);
  }
});
