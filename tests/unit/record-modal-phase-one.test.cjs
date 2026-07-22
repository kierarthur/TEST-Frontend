const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');

test('record dialog has explicit dialog semantics and a responsive single-scroll shell', () => {
  assert.match(html, /id="modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="modalTitle"/);
  assert.match(html, /#modal\.record-modal \.modal-b\s*\{[^}]*display:flex;[^}]*overflow:hidden;/s);
  assert.match(html, /#modal\.record-modal #modalBody\s*\{[^}]*overflow:auto;[^}]*overscroll-behavior:contain;/s);
  assert.match(html, /@media \(max-width:720px\)[\s\S]*?#modal\.record-modal \.form\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
});

test('contract rate values have usable numeric width and Additional Rates are collapsible', () => {
  assert.match(html, /#ratesCards \.grid-5\s*\{[^}]*minmax\(104px,1fr\)/s);
  assert.match(html, /#ratesCards input\[name\^="paye_"\][\s\S]*?min-width:92px;/);
  assert.match(main, /<details class="contract-extra-rate-card extra-rate-row"/);
  assert.match(main, /contract-extra-rate-summary-state/);
  assert.match(main, /const hasAny = !!\(bucket_name \|\| unit_name_raw \|\| payRaw \|\| chargeRaw\);/);
});

test('contract Calendar uses the modal body as its vertical scroll owner', () => {
  const start = main.indexOf('function renderContractCalendarTab');
  const end = main.indexOf('function isConsecutiveDailyRun', start);
  const renderer = main.slice(start, end);
  assert.match(renderer, /<div class="tabc contract-calendar-shell">/);
  assert.match(renderer, /id="__calScroll"[^>]*overflow-x:auto;overflow-y:hidden/);
  assert.doesNotMatch(renderer, /height:calc\(72vh\);max-height:calc\(72vh\)/);
  assert.match(renderer, /class="record-inline-actions" style="margin-top:8px"/);
});

test('Candidate create bookings explain the save-first state', () => {
  assert.match(main, /key === 'bookings' && !String\(row\?\.id \|\| ''\)\.trim\(\)/);
  assert.match(main, /Save this candidate before viewing bookings\./);
});

test('record modal accessibility and truthful save gates are installed', () => {
  assert.match(main, /const resolveRecordModalTitle = \(fr\) =>/);
  assert.match(main, /b\.setAttribute\('role', 'tab'\)/);
  assert.match(main, /b\.setAttribute\('aria-selected'/);
  assert.match(main, /const enhanceRecordModalDom = \(fr\) =>/);
  assert.match(main, /control\.required = true/);
  assert.match(main, /!top\.isDirty \|\| !isRecordModalBasicValid\(top\)/);
  assert.match(main, /field\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(main, /const syncRecordControlValidity = \(fr, control\) =>/);
  assert.match(main, /syncRecordControlValidity\(this, ev\?\.target\)/);
});

test('Client contact details are optional and Client settings always dirty the owning modal', () => {
  const validateStart = main.indexOf('function validateClientMain(payload)');
  const validateEnd = main.indexOf('async function restoreGridPrefsToDefault', validateStart);
  const validateClient = main.slice(validateStart, validateEnd);
  assert.match(validateClient, /if \(emailRaw\) \{/);
  assert.doesNotMatch(validateClient, /Primary invoice email is required/);

  const modalStart = main.indexOf('function showModal(title, tabs, renderTab, onSave, hasId, onReturn, options)');
  const modalEnd = main.indexOf('async function upsertClient(payload, id)', modalStart);
  const modal = main.slice(modalStart, modalEnd);
  assert.match(modal, /if \(!name \|\| \(email && !emailOk\(email\)\)\) return false/);
  assert.match(modal, /fr\.entity === 'clients' \? \['name'\] : \[\]/);

  const settingsStart = main.indexOf('async function renderClientSettingsUI(settingsObj)');
  const settingsEnd = main.indexOf('async function upsertClient(payload, id)', settingsStart);
  const settings = main.slice(settingsStart, settingsEnd);
  assert.match(settings, /new CustomEvent\('modal-dirty', \{[\s\S]*?source: 'client-settings'/);
});

test('Client hospital child action is genuinely unavailable until a name is entered', () => {
  assert.match(main, /t\.kind==='client-hospital'/);
  assert.match(main, /modal-apply-enabled'[\s\S]*?enabled: !!String\(name\.value \|\| ''\)\.trim\(\)/);
  assert.match(main, /fr\.kind === 'client-hospital'[\s\S]*?fr\._applyDesired === true/);
  assert.match(main, /primaryLabel: 'Add hospital'/);
});

test('Client hospital Remove stages the exact persisted row from the rendered button', () => {
  const start = main.indexOf('function renderClientHospitalsTable()');
  const end = main.indexOf('async function renderClientSettingsUI', start);
  const renderer = main.slice(start, end);
  assert.match(renderer, /rmBtn\.onclick = \(\) =>/);
  assert.match(renderer, /H\.stagedDeletes\.add\(String\(x\.id\)\)/);
  assert.match(renderer, /window\.dispatchEvent\(new CustomEvent\('modal-dirty'\)\)/);
  assert.match(renderer, /renderClientHospitalsTable\(\)/);
});
