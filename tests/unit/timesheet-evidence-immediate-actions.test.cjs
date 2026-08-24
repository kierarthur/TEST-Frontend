const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');
const blockStart = mainSource.indexOf("if (this.entity === 'timesheets' && k === 'evidence') {");
const blockEnd = mainSource.indexOf('// Finalise setTab', blockStart);

assert.ok(blockStart >= 0 && blockEnd > blockStart, 'timesheet Evidence wiring block must exist');

const evidenceBlock = mainSource.slice(blockStart, blockEnd);

test('Evidence actions are delegated before the awaited source-of-truth refresh', () => {
  const delegateInstall = evidenceBlock.indexOf("root.addEventListener('click', root.__tsEvidenceViewDelegate)");
  const refreshAwait = evidenceBlock.indexOf('await refreshTimesheetEvidenceIntoModalState(tsId)');

  assert.ok(delegateInstall >= 0, 'the immediate Evidence action delegate must be installed');
  assert.ok(refreshAwait >= 0, 'the Evidence source-of-truth refresh must remain present');
  assert.ok(
    delegateInstall < refreshAwait,
    'visible Evidence controls must be wired before the refresh can delay tab readiness'
  );
});

test('the immediate delegate covers every Evidence control exposed before hydration completes', () => {
  for (const selector of [
    'button[data-evidence-view]',
    'button[data-evidence-manage]',
    'button[data-evidence-add]',
    'button[data-evidence-return]',
    'button[data-evidence-remove]'
  ]) {
    assert.match(evidenceBlock, new RegExp(selector.replace(/[\[\]]/g, '\\$&')));
  }

  assert.match(evidenceBlock, /btn\.textContent = 'Opening…'/);
  assert.match(evidenceBlock, /btn\.textContent = 'Preparing…'/);
  assert.match(evidenceBlock, /__tsEvidenceViewOpening/);
  assert.match(evidenceBlock, /__tsPendingEvidenceAction/);
});

test('repainted controls keep one owner and queued sensitive actions reuse existing handlers', () => {
  assert.doesNotMatch(evidenceBlock, /__tsEvViewWired/);
  assert.doesNotMatch(evidenceBlock, /__tsEvManageWired/);
  assert.match(evidenceBlock, /if \(btn\.hasAttribute\('data-evidence-return'\) && !btn\.__tsEvReturnWired\)/);
  assert.match(evidenceBlock, /if \(btn\.hasAttribute\('data-evidence-remove'\) && !btn\.__tsEvRemoveWired\)/);
  assert.match(evidenceBlock, /if \(replayButton\.isConnected\) replayButton\.click\(\)/);
});
