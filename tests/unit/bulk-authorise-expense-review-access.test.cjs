'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');
const start = source.indexOf('function classifyBulkAuthoriseExpensesAccess(');
const end = source.indexOf('\nfunction renderBulkAuthoriseActionRow(', start);
assert.ok(start >= 0 && end > start, 'Bulk Authorise expense access helper must be present');
const context = vm.createContext({});
new vm.Script(`${source.slice(start, end)}\nthis.classify = classifyBulkAuthoriseExpensesAccess;`).runInContext(context);

test('candidate-controlled submitted expenses open in review-only mode', () => {
  const result = context.classify({
    expenseStorageTarget: 'TSFIN',
    canOpenExpenses: false,
    expensesActionDisabled: true,
    canViewExpenses: true,
    hasProcessedExpenses: true
  });
  assert.equal(result.canOpen, true);
  assert.equal(result.reviewOnly, true);
});

test('ordinary editable expenses retain their existing editable opening mode', () => {
  const result = context.classify({
    expenseStorageTarget: 'TSFIN',
    canOpenExpenses: true,
    expensesActionDisabled: false,
    expensesTabDisabled: false,
    canViewExpenses: true,
    hasProcessedExpenses: true
  });
  assert.equal(result.canOpen, true);
  assert.equal(result.reviewOnly, false);
});

test('no submitted expenses does not bypass the existing MyTMS edit block', () => {
  const result = context.classify({
    expenseStorageTarget: 'TSFIN',
    canOpenExpenses: false,
    expensesActionDisabled: true,
    canViewExpenses: true,
    hasProcessedExpenses: false
  });
  assert.equal(result.canOpen, false);
  assert.equal(result.reviewOnly, false);
});

test('submitted expenses remain reviewable without editable storage authority', () => {
  const result = context.classify({
    canOpenExpenses: false,
    expensesActionDisabled: true,
    canViewExpenses: true,
    hasProcessedExpenses: true
  });
  assert.equal(result.canOpen, true);
  assert.equal(result.reviewOnly, true);
});

test('explicit read-only view permission survives a missing processed-expense hint', () => {
  const result = context.classify({
    canOpenExpenses: true,
    canViewExpenses: true,
    hasProcessedExpenses: false,
    expensesReadOnly: true,
    expensesActionDisabled: true
  });
  assert.equal(result.canOpen, true);
  assert.equal(result.reviewOnly, true);
});

test('missing storage authority does not open a row with no submitted expenses', () => {
  const result = context.classify({
    canOpenExpenses: false,
    expensesActionDisabled: true,
    canViewExpenses: true,
    hasProcessedExpenses: false
  });
  assert.equal(result.canOpen, false);
  assert.equal(result.reviewOnly, false);
});

test('Bulk Authorise opener uses the shared access decision and enforces read-only review', () => {
  const actionStart = source.indexOf('function renderBulkAuthoriseActionRow(');
  const handlerStart = source.indexOf('async function handleBulkAuthoriseOpenExpensesModal(');
  const handlerEnd = source.indexOf('\nasync function handleBulkProcessRowChange(', handlerStart);
  assert.ok(actionStart >= 0 && handlerStart > actionStart && handlerEnd > handlerStart);
  assert.match(source.slice(actionStart, handlerStart), /const expenseAccess = classifyBulkAuthoriseExpensesAccess\(editability\)/);
  assert.match(source.slice(actionStart, handlerStart), /data-expenses-review-only=/);
  const handler = source.slice(handlerStart, handlerEnd);
  assert.match(handler, /if \(!activeRow \|\| !expenseAccess\.canOpen\)/);
  assert.match(handler, /expenseAccess\.reviewOnly \|\| editability\.expensesReadOnly/);
  assert.match(handler, /expenses_force_open: !!expenseAccess\.reviewOnly/);
  assert.match(handler, /data-candidate-office-server-enabled="1"/);
  assert.match(handler, /button\.disabled = false/);
  assert.match(handler, /#\$\{rootId\} \.ctms-expense-grid\{min-width:0;overflow:visible;\}/);
  const expensesRendererStart = source.indexOf('function renderTimesheetExpensesTab(');
  const expensesRendererEnd = source.indexOf('\nfunction resolveTimesheetExpensesModalCtx(', expensesRendererStart);
  const expensesRenderer = source.slice(expensesRendererStart, expensesRendererEnd);
  assert.match(expensesRenderer, /const forceOpenProcessedExpenses =/);
  assert.match(expensesRenderer, /policyCanOpenExpenses \|\| additionalManualExpenseSupported \|\| forceOpenProcessedExpenses/);
});
