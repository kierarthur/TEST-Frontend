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

test('candidate refresh builds one successor graph without cloning the installed envelope first', () => {
  const start = main.indexOf('function mergePayWorkbenchCandidatePreviewIntoState(');
  const end = main.indexOf('\n\nasync function bankingPayWorkbench', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const body = main.slice(start, end);

  assert.match(
    body,
    /const currentEnvelope = isPlainObject\(wiz\.preview\.data\) \? wiz\.preview\.data : \{\};/
  );
  assert.match(body, /const nextPreview = cloneJson\(currentPreview\) \|\| \{\};/);
  assert.doesNotMatch(
    body,
    /const currentEnvelope = isPlainObject\(wiz\.preview\.data\) \? \(cloneJson\(wiz\.preview\.data\)/
  );
});

test('workbench page-cache compatibility keys share one bounded graph', () => {
  const start = main.indexOf('const applyMergedPreviewPagesToState = (targetEnvelope = null) => {');
  const end = main.indexOf('  const responseMutationContext =', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const body = main.slice(start, end);

  assert.match(body, /const attachPageMapAliases = \(target\) => \{/);
  for (const key of [
    'preview_pages',
    'previewPages',
    'preview_page_cache',
    'previewPageCache',
    'page_cache',
    'pageCache'
  ]) {
    assert.match(body, new RegExp(`target\\.${key} = pageMap;`));
  }
  assert.doesNotMatch(body, /target\.(?:previewPages|preview_page_cache|previewPageCache|page_cache|pageCache) = cloneJson\(pageMap\)/);
});

test('candidate settle compares completed progress with the pre-adoption snapshot', () => {
  const start = main.indexOf('const scheduleWorkbenchCandidateSettlePoll =');
  const end = main.indexOf('        const refreshWorkbenchAfterHeartbeatSignal =', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const body = main.slice(start, end);

  const snapshotAt = body.indexOf('const beforeProgressAdoption = getWorkbenchProgressSnapshot(afterRead);');
  const stateApplyAt = body.indexOf('applyWorkbenchCandidateRefreshingState(watchContext, nextProgress');
  const settleMergeAt = body.indexOf('refreshWorkbenchVisiblePageAfterProgress(watchContext, nextProgress, beforeProgressAdoption');
  assert.ok(snapshotAt >= 0);
  assert.ok(stateApplyAt > snapshotAt);
  assert.ok(settleMergeAt > stateApplyAt);
  assert.doesNotMatch(
    body,
    /refreshWorkbenchVisiblePageAfterProgress\(watchContext,\s*nextProgress,\s*getWorkbenchProgressSnapshot\(watchContext\)/
  );
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

test('a hidden Banking Pay batch child remains a valid refresh target under its progress modal', () => {
  const start = main.indexOf('const currentChildStateMatches = () => {');
  const end = main.indexOf('  const topChildFrameConflictsWithThisChild', start);
  assert.ok(start >= 0);
  assert.ok(end > start);

  const outcome = vm.runInNewContext(`
    const id = 'batch-1';
    const KIND = 'banking-pay-batch-child';
    const child = { batchId: id, openToken: 'child-token' };
    const getFrameOpenTokenSafe = (frame) => String(frame?.childOpenToken || frame?._childOpenToken || frame?.openToken || '');
    const getFrameBatchIdSafe = (frame) => String(frame?.payBatchId || frame?.batchId || '');
    const window = {
      modalCtx: { entity: 'banking-operation-progress' },
      __modalStack: [{
        kind: KIND,
        childOpenToken: child.openToken,
        payBatchId: id,
        _ctxRef: {
          entity: 'banking',
          banking: { pay: { child } }
        }
      }, {
        kind: 'banking-operation-progress',
        _ctxRef: { entity: 'banking-operation-progress' }
      }]
    };
    ${main.slice(start, end)}
    ({
      hiddenParentMatches: currentChildStateMatches(),
      wrongTokenRejected: (() => {
        window.__modalStack[0].childOpenToken = 'other-token';
        return currentChildStateMatches();
      })()
    });
  `);

  assert.deepEqual(
    JSON.parse(JSON.stringify(outcome)),
    { hiddenParentMatches: true, wrongTokenRejected: false }
  );
});
