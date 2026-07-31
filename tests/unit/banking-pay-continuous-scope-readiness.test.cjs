const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

test('Banking Pay keeps display readiness separate from backend draft safety', () => {
  assert.match(source, /const displayReady = contractPresent && asBool\(raw\.display_ready\)/);
  assert.match(source, /const draftSafe = contractPresent && asBool\(raw\.draft_safe\)/);
  assert.match(source, /const readyForDraft = contractPresent && asBool\(raw\.ready_for_draft\) && draftSafe/);
  assert.match(source, /The current materialised rows remain available/);
});

test('the central Banking Pay action gate fails closed on backend draft_safe', () => {
  assert.match(
    source,
    /hasOwnProperty\.call\(progress, 'draft_safe'\)[\s\S]*progress\.draft_safe !== true[\s\S]*BACKEND_DRAFT_UNSAFE/
  );
  assert.match(source, /wizard\.createDraftDisabled = createDraftBlocked/);
});
