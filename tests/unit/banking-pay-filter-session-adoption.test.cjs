const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../js/main.js'),
  'utf8'
);
const modalCss = fs.readFileSync(
  path.resolve(__dirname, '../../css/modal-modernisation.css'),
  'utf8'
);

const filterModalBody = () => {
  const start = source.indexOf('async function openBankingPayFiltersModal');
  const end = source.indexOf('\nasync function openBankingPay', start);
  assert.ok(start >= 0 && end > start, 'Banking Pay filters modal function must be present');
  return source.slice(start, end);
};

test('Banking Pay filter save fails closed unless the new session context is adopted', () => {
  const body = filterModalBody();

  assert.match(body, /const resetOutcome = await resetPayPreviewAndDecisions/);
  assert.match(body, /resetOutcome\?\.ok === false/);
  assert.match(body, /!adoptedSessionId/);
  assert.match(body, /previousSessionId && adoptedSessionId === previousSessionId/);
  assert.match(body, /BANKING_PAY_FILTER_SESSION_NOT_ADOPTED/);
  assert.match(body, /The previous payment preview remains unchanged; please try again\./);
});

test('Banking Pay filters and their pickers expose clearly labelled shared Apply actions', () => {
  const body = filterModalBody();

  assert.match(body, /kind: 'banking-pay-filters'/);
  assert.match(body, /showSave: false/);
  assert.match(body, /showApply: true/);
  assert.match(body, /primaryLabel: 'Apply filters'/);
  assert.match(
    modalCss,
    /ctms-kind-banking-pay-filters #modalActions,[\s\S]*?display: flex !important;/
  );
  assert.match(
    modalCss,
    /ctms-kind-candidate-picker #modalActions,[\s\S]*?display: flex !important;/
  );
  assert.match(
    modalCss,
    /ctms-kind-client-picker #modalActions,[\s\S]*?display: flex !important;/
  );
  assert.match(
    modalCss,
    /#modal\.banking-modal\.ctms-modern-modal #modalActions \{\s*display: none !important;\s*\}/
  );
});
