const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');

test('Banking Pay graph cloning preserves shared aliases and cycles', () => {
  const start = main.indexOf('function createBankingPayGraphCloneV1()');
  const end = main.indexOf('\n\nfunction applyPayWorkbenchPreviewToState', start);
  assert.ok(start >= 0);
  assert.ok(end > start);

  const outcome = vm.runInNewContext(`
    const createClone = (${main.slice(start, end)});
    const clone = createClone();
    const row = { preview_row_id: 'row-1', amount: 43 };
    const source = { canonical_preview_lines: [row], ready_preview_lines: [row] };
    source.self = source;
    const copied = clone(source);
    ({
      copied: copied !== source,
      cycle: copied.self === copied,
      alias: copied.canonical_preview_lines[0] === copied.ready_preview_lines[0],
      memo: clone(source) === copied
    });
  `);
  assert.deepEqual(
    JSON.parse(JSON.stringify(outcome)),
    { copied: true, cycle: true, alias: true, memo: true }
  );
});

test('full and candidate preview state application use the bounded graph clone', () => {
  const fullStart = main.indexOf('function applyPayWorkbenchPreviewToState(');
  const mergeStart = main.indexOf('function mergePayWorkbenchCandidatePreviewIntoState(');
  const mergeEnd = main.indexOf('\n\nasync function bankingPayWorkbench', mergeStart);
  assert.ok(fullStart >= 0);
  assert.ok(mergeStart > fullStart);
  assert.ok(mergeEnd > mergeStart);

  const fullBody = main.slice(fullStart, fullStart + 600);
  const mergeBody = main.slice(mergeStart, mergeStart + 600);
  assert.match(fullBody, /const cloneJson = createBankingPayGraphCloneV1\(\);/);
  assert.match(mergeBody, /const cloneJson = createBankingPayGraphCloneV1\(\);/);
  assert.doesNotMatch(fullBody, /JSON\.parse\(JSON\.stringify\(value\)\)/);
  assert.doesNotMatch(mergeBody, /JSON\.parse\(JSON\.stringify\(value\)\)/);
});

test('Banking modal dismissal releases the paged workbench graph', () => {
  const start = main.indexOf('async function openBanking()');
  const end = main.indexOf('\nasync function ', start + 1);
  const body = main.slice(start, end);
  assert.match(body, /for \(const key of Object\.keys\(wizard\)\) delete wizard\[key\]/);
  assert.match(body, /payState\.draftWizard = null/);
  assert.match(body, /st\.settings\.raw = null/);
  assert.match(body, /st\.caps\.raw = null/);
});

test('modal global listener cleanup retains the existing drag cleanup chain', () => {
  assert.match(
    main,
    /const previousDetachGlobal = \(typeof top\._detachGlobal === 'function'\) \? top\._detachGlobal : null;/
  );
  assert.match(
    main,
    /if \(previousDetachGlobal\) \{\s*try \{ previousDetachGlobal\(\); \} catch \{\}\s*\}/
  );
});
