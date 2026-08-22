const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const modalJs = fs.readFileSync(path.join(root, 'js', 'modal-modernisation.js'), 'utf8');
const summaryJs = fs.readFileSync(path.join(root, 'js', 'summary-modernisation.js'), 'utf8');
const summaryCss = fs.readFileSync(path.join(root, 'css', 'summary-modernisation.css'), 'utf8');

test('mobile summary sheets retain a usable scrollable records viewport', () => {
  assert.match(summaryJs, /document\.documentElement\.classList\.toggle\('ctms-summary-proposal', active\)/);
  assert.match(summaryCss, /height:clamp\(400px,66dvh,640px\);min-height:400px/);
  assert.match(summaryCss, /grid-template-rows:auto auto/);
  assert.match(summaryCss, /touch-action:pan-y/);
});

test('dirty create modals use the CloudTMS confirmation UI', () => {
  assert.match(main, /kind: 'create-record-discard-confirm'/);
  assert.match(main, /title: 'Discard new record\?'/);
  assert.doesNotMatch(main, /window\.confirm\('You have unsaved changes\. Discard them and close\?'\)/);
});

test('contract modal decoration tolerates picker and confirmation child frames', () => {
  assert.match(modalJs, /form\?\.id === 'contractForm'/);
  assert.doesNotMatch(modalJs, /body\.querySelector\('#contractForm'\)\?\.dataset\.ctmsEnhanced !== '1'/);
});

test('contract candidate and client fields automatically launch filtered pickers', () => {
  assert.match(main, /typed\.length >= 3/);
  assert.match(main, /await launchFn\(latest\)/);
  assert.match(main, /seed_query: String\(seedQuery \|\| ''\)\.trim\(\)/);
  assert.match(main, /compositionstart/);
  assert.match(main, /compositionend/);
});

test('picker dirty propagation cannot overwrite picker modal chrome with the parent state', () => {
  assert.match(main, /The picker owns the shared modal chrome while it is open/);
  assert.match(main, /p\.isDirty = true;\s*\/\/ The picker owns[\s\S]*?fr\._updateButtons && fr\._updateButtons\(\)/);
  assert.match(main, /A background parent must never[\s\S]*?if \(currentFrame\(\) !== top\) return;/);
  assert.match(main, /top\.kind === 'candidate-picker' \|\| top\.kind === 'client-picker'[\s\S]*?btnClose\.textContent = 'Close'/);
});
