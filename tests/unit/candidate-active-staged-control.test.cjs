const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'main.js'), 'utf8');
const mytms = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'mytms-office-v1.js'), 'utf8');

function section(from, to) {
  const start = main.indexOf(from);
  assert.notEqual(start, -1, `missing ${from}`);
  const end = main.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `missing ${to}`);
  return main.slice(start, end);
}

test('Candidate status is separate from the MyTMS diagnostic badge', () => {
  const render = section('function renderCandidateTab(key, row = {})', 'async function openCandidateLoansOverpaymentsModal');
  assert.match(render, /<label>Candidate status<\/label>/);
  assert.match(render, /name="active" value="\$\{candidateActive \? 'true' : 'false'\}"/);
  assert.match(render, /data-candidate-active-toggle/);
  assert.match(render, /separate from MyTMS app access/);
  assert.match(mytms, /function candidateStatusPresentation\(status = \{\}\)/);
  assert.doesNotMatch(mytms, /data-candidate-active-toggle/);
});

test('active status only stages in Edit mode and is persisted by Candidate Save', () => {
  const bind = section('function bindCandidateMainFormEvents(container, model)', 'async function apiPostcodeLookup');
  assert.match(bind, /frame\?\.mode !== 'edit' && frame\?\.mode !== 'create'/);
  assert.match(bind, /statusInput\.value = active \? 'true' : 'false'/);
  assert.match(bind, /model\.active = active;\s*updatePending\(\);\s*markDirty\(\)/);
  assert.doesNotMatch(bind, /upsertCandidate|authFetch|fetch\(/);

  const save = section('async function openCandidate(row)', 'async function openCandidateRateModal');
  assert.match(save, /let payload\s+= \{ \.\.\.stateMain, \.\.\.statePay, \.\.\.main, \.\.\.pay, roles \}/);
  assert.match(save, /payload\.active = coerceBool\(payload\.active\)/);
  assert.match(save, /saved = await upsertCandidate\(payload, idForUpdate\)/);
});
