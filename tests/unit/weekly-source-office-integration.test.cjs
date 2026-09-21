const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const main = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

test('Simple Lines mounts only an explicit Weekly source presentation', () => {
  const start = main.indexOf('function renderTimesheetLinesTab(ctx)');
  const end = main.indexOf('\nfunction ', start + 40);
  const source = main.slice(start, end);

  assert.match(source, /findHostPayload\(\[details, row, ts, ctx\]\)/);
  assert.match(source, /if \(weeklySourcePresentationHost\)/);
  assert.match(source, /if \(weeklySourcePresentationVm\?\.mount === true\)/);
  assert.match(source, /renderSimpleLines\(weeklySourcePresentationVm\)/);
  assert.match(source, /const segs\s*=\s*Array\.isArray\(details\.segments\)/);
  assert.ok(source.indexOf('if (weeklySourcePresentationVm?.mount === true)') < source.indexOf('const segs'));
});

test('source-authority Expenses is read-only while legacy expense controls remain present', () => {
  const start = main.indexOf('function renderTimesheetExpensesTab(ctx)');
  const end = main.indexOf('\nfunction ', start + 40);
  const source = main.slice(start, end);

  assert.match(source, /weeklySourceExpenseVm\?\.mount === true && weeklySourceExpenseVm\.authority === 'CLIENT_SYSTEM'/);
  assert.match(source, /data-weekly-source-expenses-mode/);
  assert.match(source, /SOURCE_SUPPLIED/);
  assert.match(source, /SEPARATE_ADDITIONAL_TIMESHEET/);
  assert.match(source, /Receipt and mileage evidence cannot be added here/);
  assert.match(source, /Expenses are held on a separate additional expense Timesheet/);

  // These are the existing ordinary expense controls after the guarded return.
  assert.match(source, /name="exp_mileage_units"/);
  assert.match(source, /data-expense-category="TRAVEL"/);
  assert.match(source, /data-expense-category="ACCOMMODATION"/);
  assert.match(source, /data-expense-category="OTHER"/);
  assert.match(source, /candidateOfficeExpenseSlot\('MILEAGE'\)/);
});

test('Bulk Authorise keeps one modal and the exact four-category contract', () => {
  assert.match(main, /BULK_AUTHORISE_WEEKLY_SOURCE_CATEGORY_SESSION_KEY/);
  assert.match(main, /renderCategoryTabs\(activeCategory, counts\)/);
  assert.match(main, /st\.weekly_source_category = writeBulkAuthoriseWeeklySourceCategorySession\(nextCategory\)/);
  assert.match(main, /st\.classification = bulkAuthoriseBackendClassificationForCategory\(nextCategory\)/);
  assert.match(main, /qs\.set\('weekly_source_category', weeklySourceCategory\)/);
  assert.match(main, /by_weekly_source_category: serverWeeklySourceCategoryCounts/);
  assert.doesNotMatch(main, /data-weekly-source-select-all-button|data-weekly-source-unselect-all-button/);
});

test('Bulk Authorise category counts stay inside its fetch owner and outside Pay Workbench', () => {
  const payWorkbenchStart = main.indexOf('function applyPayWorkbenchPreviewToState(previewResponse, state = null)');
  const payWorkbenchEnd = main.indexOf('\nfunction mergePayWorkbenchCandidatePreviewIntoState(', payWorkbenchStart);
  const fetchStart = main.indexOf('async function fetchBulkAuthoriseDataset(filters, options = {})');
  const fetchEnd = main.indexOf('\nasync function openTimesheetImportsWorkbench()', fetchStart);

  assert.ok(payWorkbenchStart >= 0 && payWorkbenchEnd > payWorkbenchStart);
  assert.ok(fetchStart >= 0 && fetchEnd > fetchStart);

  const payWorkbenchSource = main.slice(payWorkbenchStart, payWorkbenchEnd);
  const fetchSource = main.slice(fetchStart, fetchEnd);
  const countDeclaration = fetchSource.indexOf('const serverWeeklySourceCategoryCounts = (() => {');
  const countUse = fetchSource.indexOf('by_weekly_source_category: serverWeeklySourceCategoryCounts');

  assert.doesNotMatch(payWorkbenchSource, /serverWeeklySourceCategoryCounts|by_weekly_source_category/);
  assert.ok(countDeclaration >= 0, 'Bulk Authorise fetch must declare its category counts');
  assert.ok(countUse > countDeclaration, 'Bulk Authorise fetch must declare category counts before use');
  assert.equal((fetchSource.match(/serverWeeklySourceCategoryCounts/g) || []).length, 2);
});

test('Bulk source rows preserve the existing Files owner and show the complete approved schedule', () => {
  assert.match(main, /renderMiddlePaneTabs\(weeklySourceMiddlePane\)/);
  assert.match(main, /renderBulkHoursPane\(weeklySourceVm\)/);
  assert.match(main, /renderBulkAuthoriseEvidencePane\(st\)/);
  assert.match(main, /renderApprovedHours\(weeklySourceVm\)/);
  assert.match(main, /renderFourTotals\(weeklySourceVm\)/);
  assert.match(main, /weeklySourceVm\?\.add_additional_expense_timesheet_allowed === true/);
});

test('server source state can narrow but never widen existing authorisation', () => {
  assert.match(main, /canAuthorise:\s*!!editability\.canAuthorise && weeklySourceVm\.authorise_allowed === true/);
  assert.match(main, /canonicalCanAuthoriseBase\s*&&\s*\(!weeklySourcePresentationVm\?\.mount \|\| weeklySourcePresentationVm\.authorise_allowed === true\)/);
  assert.match(main, /weeklySourceAuthoriseBlockedReason/);
});

test('existing lifecycle and evidence command owners remain in place', () => {
  const requiredOwners = [
    'handleBulkAuthoriseSelected',
    'handleBulkUnauthoriseSelected',
    'renderBulkAuthoriseEvidencePane',
    'bindBulkAuthorisePreviewPane',
    'Reject Candidate Submission',
    '/api/timesheets/bulk-authorise-selected',
    '/api/timesheets/bulk-unauthorise-selected',
    '/evidence?meta=1',
    '/return-to-queue',
    '/archive-transition',
    '/delete-preview'
  ];
  for (const owner of requiredOwners) assert.ok(main.includes(owner), `${owner} must remain available`);
});

test('approved-hours changes use the single Weekly Source command boundary and refresh the server projection', () => {
  assert.match(main, /openWeeklySourceApprovedHoursModal/);
  assert.match(main, /buildApprovedHoursCommand/);
  assert.match(main, /apiPostJson\(command\.endpoint, command\.body/);
  assert.match(main, /refreshSimpleWeeklySourcePresentation/);
  assert.match(main, /refreshBulkWeeklySourcePresentation/);
  assert.match(main, /refreshBulkAuthoriseActiveContext/);
  assert.match(main, /Number\(error\?\.status \|\| error\?\.response\?\.status \|\| 0\) === 409/);
  assert.match(main, /bulkAuthActionRowManageApprovedHoursBtn/);
  assert.match(main, /bindSimpleWeeklySourceApprovedHoursAction/);
  assert.doesNotMatch(main, /weekly-source\/v1\/commands[^\n]+banking/i);
});

test('Timesheet panes never expose a finalise command or browser financial inputs for approved hours', () => {
  const start = main.indexOf('function openWeeklySourceApprovedHoursModal(options = {})');
  const end = main.indexOf('\nasync function openBulkAuthoriseWorkbench()', start);
  const source = main.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(source, /FINALISE_WEEK|C1|gross_pay|hourly_rate|pay_rate|charge_rate|target_entitlement/i);
  assert.match(source, /work_date/);
  assert.match(source, /start_at_local/);
  assert.match(source, /end_at_local/);
  assert.match(source, /break_minutes/);
  assert.match(source, /reason/);
});
