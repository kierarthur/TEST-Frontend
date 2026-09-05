const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');

function section(startMarker, endMarker) {
  const start = main.indexOf(startMarker);
  const end = main.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return main.slice(start, end);
}

test('authoritative processing status wins over stale unprocessed summary fallbacks', () => {
  const overview = section('function renderTimesheetOverviewTab', 'function renderTimesheetFinanceTab');
  assert.match(overview, /stageRaw === 'UNPROCESSED'[\s\S]*stageRaw === 'UNASSIGNED'[\s\S]*\(!stageRaw && \([\s\S]*summaryStageRaw === 'UNPROCESSED'[\s\S]*toolsStageRaw === 'UNPROCESSED'/);
  assert.match(overview, /if \(authInfo\.showAwaitingBadge\) \{[\s\S]*addStage\('Processed'/);
});

test('incomplete lifecycle authority is never described as archived', () => {
  const footer = section('const lifecycleBlockedReason = lifecycleBusy', 'const styleLifecycleButton =');
  assert.match(footer, /isArchivedNow[\s\S]*Archived timesheets must be Unarchived/);
  assert.doesNotMatch(footer, /lifecycleReadOnlyBlocked[\s\S]*Archived timesheets must be Unarchived/);
  assert.match(footer, /Waiting for trusted lifecycle state/);
});
