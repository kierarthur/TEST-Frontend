const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const authorisers = fs.readFileSync(path.join(root, 'js', 'manager-authorisers.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'modal-modernisation.css'), 'utf8');

const section = (startMarker, endMarker) => {
  const start = main.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = main.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return main.slice(start, end);
};

test('Contract settings are a child draft and only Apply dirties the parent', () => {
  const source = section('function openContractSettingsModal()', 'function computePayWorkbenchSessionSignature');
  assert.match(source, /const localMainDraft = clonePlain\(parentMainDraft/);
  assert.match(source, /for \(const key of Object\.keys\(parentMainDraft\)\) delete parentMainDraft\[key\]/);
  assert.match(source, /Object\.assign\(parentMainDraft, clonePlain\(localMainDraft\)\)/);
  assert.match(source, /primaryLabel: 'Apply'/);
  assert.match(source, /dirtyClosePolicy: 'confirm-discard-close'/);
  assert.match(source, /disabledPaperPolicy = \(viewOnly \|\| lifecycleLocks\.veryHighLocked\)/);
  assert.doesNotMatch(source, /Staged only until/);
});

test('Returning from a Contract child restores the parent tab titles', () => {
  assert.match(main, /btn\.textContent = tab\.label \|\| tab\.title \|\| tab\.key \|\| '';/);
});

test('Candidate Bookings opens Contract as an independently editable record modal', () => {
  const openContract = section('function openContract(row, openOptions = {})', 'function formatCandidateLabel');
  assert.match(openContract, /noParentGate: !!isSuccessorCreate \|\| openOptions\?\.noParentGate === true/);

  const bookings = section('async function fetchAndRenderCandidateCalendar', 'function renderCandidateContractList');
  assert.match(bookings, /openContract\(fresh, \{ noParentGate: true \}\)/);

  const editHandler = section('btnEdit.onclick = async ()=>', 'const restoreFrameSnapshot');
  assert.match(editHandler, /isChildNow && !top\.noParentGate/);
  assert.doesNotMatch(editHandler, /\(isChildNow \|\| top\.kind === 'advanced-search'\)/);
});

test('Contract lifecycle protects very-high fields after start but locks rates only after worked timesheets exist', () => {
  const locks = section('function getContractLifecycleLocks', 'function markContractParentDirty');
  assert.match(locks, /veryHighLocked: hasProtectedHistory \|\| startedByDate/);
  assert.match(locks, /ratesLocked: hasProtectedHistory/);

  const mainTab = section('function renderContractMainTab', 'function renderContractRatesTab');
  assert.match(mainTab, /candidate_name_display[\s\S]*veryHighReadonly/);
  assert.match(mainTab, /client_name_display[\s\S]*veryHighReadonly/);
  assert.match(mainTab, /name="role"[\s\S]*veryHighReadonly/);
  assert.match(mainTab, /name="band"[\s\S]*veryHighReadonly/);
  assert.match(mainTab, /ctms-readonly-setting/);
  assert.match(mainTab, /Contract override/);
  assert.match(mainTab, /Client default/);
});

test('Modify actions stage week changes and use branded confirmation', () => {
  const source = section('async function runContractModifyAction', 'function renderContractMainTab');
  assert.match(source, /stageAddMissingWeeks/);
  assert.match(source, /removeAllUnsubmittedWeeks/);
  assert.match(source, /openUiConfirmModal/);
  assert.match(source, /Save the Contract to apply/);
  assert.doesNotMatch(source, /window\.confirm|\bconfirm\(/);

  const mainTab = section('function renderContractMainTab', 'function renderContractRatesTab');
  assert.match(mainTab, /Unassign all eligible weeks/);
  assert.match(mainTab, /Add missing weeks/);
  assert.match(mainTab, /Extend to new contract/);
  assert.match(mainTab, /Duplicate contract/);
});

test('Calendar Save includes remove-all staging and never uses a native overlap warning', () => {
  const source = section('async function commitContractCalendarStageIfPending', 'function wireContractCalendarSaveControls');
  assert.match(source, /st\.add\.size[\s\S]*!!st\.removeAll/);
  assert.match(source, /contract-calendar-overlap-confirm/);
  assert.match(source, /openUiConfirmModal/);
  assert.doesNotMatch(source, /Proceed anyway and save with overlapping windows\?`\)/);
});

test('Extend and manager-authoriser children stage into the parent Contract', () => {
  const extend = section('function openContractCloneAndExtend', 'async function openUiConfirmModal');
  assert.match(extend, /__stagedCloneExtendPlan/);
  assert.match(extend, /expected_source_updated_at/);
  assert.match(extend, /Extension prepared\. Save the Contract to create it\./);
  assert.match(extend, /showWorkflowIssue/);
  assert.doesNotMatch(extend.slice(0, extend.indexOf('return { ok:true, saved:null }')), /window\.prompt|window\.confirm/);

  const stagedRunner = section('async function performStagedContractExtension', 'async function openUiConfirmModal');
  assert.match(stagedRunner, /contract-extend-schedule-clash/);
  assert.match(stagedRunner, /contract-extend-split-week/);
  assert.match(stagedRunner, /openUiPromptModal/);
  assert.doesNotMatch(stagedRunner, /window\.prompt|window\.confirm|\balert\(/);

  assert.match(authorisers, /__stagedManagerAuthoriserPolicy/);
  assert.match(authorisers, /Save the Contract to apply/);
  assert.doesNotMatch(authorisers, /#contractSettingsForm/);
});

test('Duplicate Contract Studio supports polished responsive candidate assignment', () => {
  const start = main.indexOf('function openContractDuplicateStudio');
  assert.notEqual(start, -1);
  const source = main.slice(start, start + 25_000);
  assert.match(source, /Duplicate Contract/);
  assert.match(source, /Find candidates/);
  assert.match(source, /Primary job title/);
  assert.match(source, /data-duplicate-sort="last_name"/);
  assert.match(source, /data-duplicate-sort="first_name"/);
  assert.match(source, /data-duplicate-sort="primary_job_title"/);
  assert.match(source, /data-duplicate-sort="city"/);
  assert.match(source, /Create contracts/);
  assert.match(css, /\.ctms-contract-duplicate-grid/);
  assert.match(css, /@media \(max-width: 1024px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /-webkit-overflow-scrolling: touch/);
});
