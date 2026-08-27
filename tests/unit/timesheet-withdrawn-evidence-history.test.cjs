const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');
const renderStart = source.indexOf('function renderTimesheetEvidenceTab(ctx)');
const renderEnd = source.indexOf('async function openTimesheetEvidenceUploadDialog', renderStart);
const refreshStart = source.indexOf('async function refreshTimesheetEvidenceIntoModalState');
const refreshEnd = source.indexOf('async function', refreshStart + 30);

assert.ok(renderStart >= 0 && renderEnd > renderStart, 'Timesheet Evidence renderer must exist');
assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, 'Timesheet Evidence refresh must exist');
const render = source.slice(renderStart, renderEnd);
const refresh = source.slice(refreshStart, refreshEnd);

test('withdrawn submissions are presented in a separate audit-only section', () => {
  assert.match(render, /Withdrawn submission history/);
  assert.match(render, /Previous submissions are retained for audit only\. They cannot be edited, restored, authorised or used for invoicing\./);
  assert.match(render, /data-withdrawn-submission-history="1"/);
  assert.match(render, /Read-only history/);
});

test('withdrawn files expose only view and download actions with phone-safe wrapping', () => {
  const historyStart = render.indexOf('const withdrawnHistoryHtml');
  const historyEnd = render.indexOf('const policyEvidenceReason', historyStart);
  assert.ok(historyStart >= 0 && historyEnd > historyStart, 'withdrawn history renderer must exist');
  const history = render.slice(historyStart, historyEnd);
  assert.match(history, /data-evidence-view=/);
  assert.match(history, /__tsEvidenceDownload/);
  assert.match(history, /overflow-wrap:anywhere/);
  assert.match(history, /min-height:44px/);
  assert.doesNotMatch(history, /data-evidence-(?:manage|return|remove|upload)/);
});

test('refresh stores history separately and hardens every item as read-only', () => {
  assert.match(refresh, /Array\.isArray\(json\.withdrawn_submissions\)/);
  assert.match(refresh, /out\.withdrawn_history = true/);
  assert.match(refresh, /out\.can_delete = false/);
  assert.match(refresh, /out\.can_reclassify = false/);
  assert.match(refresh, /out\.can_return_to_queue = false/);
  assert.match(refresh, /targetState\.withdrawn_submissions = withdrawnCloned/);
  assert.match(refresh, /targetDetails\.withdrawn_submissions = withdrawnCloned/);
  assert.match(refresh, /targetData\.withdrawn_submissions = withdrawnCloned/);
});

test('viewer and downloader resolve both current and withdrawn evidence without merging their tables', () => {
  assert.match(source, /function getTimesheetEvidenceItemsFromModalContext/);
  assert.match(source, /const historical = withdrawn\.flatMap/);
  assert.match(source, /getTimesheetEvidenceItemsFromModalContext\(window\.modalCtx\)/);
  assert.match(source, /getTimesheetEvidenceItemsFromModalContext\(mc2\)/);
});
