const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const presentation = require('../../js/weekly-source-presentation-v1.js');
const fixtures = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../fixtures/weekly-source-presentation-v1.json'),
  'utf8'
));

const clone = (value) => JSON.parse(JSON.stringify(value));

test('the dormant foundation loads before the existing application owner', () => {
  const index = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  const styleMarker = './css/weekly-source-presentation-v1.css?v=20260915-r1';
  const scriptMarker = './js/weekly-source-presentation-v1.js?v=20260915-r1';
  const existingOwnerMarker = './js/main.js?';
  assert.equal((index.match(new RegExp(styleMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1);
  assert.equal((index.match(new RegExp(scriptMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1);
  assert.ok(index.indexOf(scriptMarker) < index.indexOf(existingOwnerMarker));
});

test('ordinary Weekly and Daily payloads remain exact legacy passthroughs', () => {
  for (const fixtureName of ['ordinaryWeekly', 'daily']) {
    const payload = clone(fixtures[fixtureName]);
    const before = JSON.stringify(payload);
    let legacyCalls = 0;
    let weeklyCalls = 0;
    const legacyMarkup = `  <section data-legacy="${fixtureName}">unchanged & exact</section>\n`;

    const result = presentation.renderLegacyOrWeekly(
      payload,
      (received) => {
        legacyCalls += 1;
        assert.equal(received, payload);
        return legacyMarkup;
      },
      () => {
        weeklyCalls += 1;
        return 'wrong renderer';
      }
    );

    assert.equal(result, legacyMarkup);
    assert.equal(legacyCalls, 1);
    assert.equal(weeklyCalls, 0);
    assert.equal(JSON.stringify(payload), before);
    assert.deepEqual(presentation.buildViewModel(payload), {
      mount: false,
      render_mode: 'LEGACY',
      is_weekly_source: false,
      blocks_authorisation: false,
      category_key: 'STANDARD_TIMESHEETS',
      default_middle_pane: 'FILES'
    });
  }
});

test('the existing null details slot remains legacy while a malformed non-null projection fails closed', () => {
  const ordinaryDetails = {
    sheet_scope: 'WEEKLY',
    weekly_source_presentation: null,
    timesheet: { timesheet_id: 'ordinary-weekly' }
  };
  assert.equal(presentation.findHostPayload(ordinaryDetails), null);

  const dailyDetails = {
    sheet_scope: 'DAILY',
    weekly_source_presentation: null,
    timesheet: { timesheet_id: 'ordinary-daily' }
  };
  assert.equal(presentation.findHostPayload(dailyDetails), null);

  const malformed = { weekly_source_presentation: 'not-an-object' };
  assert.equal(presentation.findHostPayload(malformed), malformed);
  assert.equal(presentation.buildViewModel(malformed).render_mode, 'UNAVAILABLE');
});

test('route classifier accepts only explicit current Weekly server presentations', () => {
  const nhsp = presentation.buildViewModel(clone(fixtures.nhspMatch));
  assert.equal(nhsp.mount, true);
  assert.equal(nhsp.route_key, 'NHSP');
  assert.equal(nhsp.category_label, 'NHSP');
  assert.equal(nhsp.authority, 'CLIENT_SYSTEM');
  assert.equal(nhsp.default_middle_pane, 'HOURS');
  assert.equal(nhsp.authorise_allowed, true);
  assert.equal(nhsp.expense_owner, 'SEPARATE_ADDITIONAL_TIMESHEET');
  assert.equal(nhsp.source_original_allows_candidate_expenses, false);

  const checked = presentation.buildViewModel(clone(fixtures.timesheetCheckedMismatch));
  assert.equal(checked.category_label, 'Timesheets checked with client');
  assert.equal(checked.authority, 'SIGNED_TIMESHEET');
  assert.equal(checked.default_middle_pane, 'FILES');
  assert.equal(checked.expense_owner, 'CURRENT_TIMESHEET');
  assert.equal(checked.source_original_allows_candidate_expenses, true);

  const contradictory = clone(fixtures.nhspMatch);
  contradictory.weekly_source_presentation.authority = 'SIGNED_TIMESHEET';
  const unavailable = presentation.buildViewModel(contradictory);
  assert.equal(unavailable.render_mode, 'UNAVAILABLE');
  assert.equal(unavailable.blocks_authorisation, true);

  const stale = clone(fixtures.nhspMatch);
  stale.weekly_source_presentation.freshness = 'STALE';
  const staleVm = presentation.buildViewModel(stale);
  assert.equal(staleVm.render_mode, 'UNAVAILABLE');
  assert.match(staleVm.unavailable_reason, /refresh/i);
});

test('normalisation is immutable and keeps only the explicit presentation fields', () => {
  const payload = clone(fixtures.clientSourceMismatch);
  payload.weekly_source_presentation.comparison.source_rows[0].candidate_name = '<script>wrong place</script>';
  const before = JSON.stringify(payload);
  const vm = presentation.buildViewModel(payload);

  assert.equal(JSON.stringify(payload), before);
  assert.equal(Object.isFrozen(vm), true);
  assert.equal(Object.isFrozen(vm.source_rows), true);
  assert.equal(Object.hasOwn(vm.source_rows[0], 'candidate_name'), false);
  assert.equal(vm.source_rows.length, 2);
  assert.equal(vm.submitted_rows.length, 2);
});

test('Bulk Hours shows all system rows and only affected submitted dates on a mismatch', () => {
  const vm = presentation.buildViewModel(clone(fixtures.clientSourceMismatch));
  const markup = presentation.renderBulkHoursPane(vm);

  assert.match(markup, /Client system hours/);
  assert.match(markup, /Mon 7 Sep 2026/);
  assert.match(markup, /Tue 8 Sep 2026/);
  assert.match(markup, /Submitted hours needing attention/);
  assert.equal((markup.match(/submitted-mon/g) || []).length, 0);
  assert.equal((markup.match(/submitted-tue/g) || []).length, 1);
  assert.match(markup, /20:00-09:00/);
  assert.doesNotMatch(markup, /Pay<\/th>|Charge<\/th>|Rate<\/th>|Margin<\/th>/i);
});

test('Bulk complete match shows system hours without duplicating submitted evidence', () => {
  const vm = presentation.buildViewModel(clone(fixtures.nhspMatch));
  const markup = presentation.renderBulkHoursPane(vm);

  assert.match(markup, /Client system hours/);
  assert.match(markup, /Used for pay and invoice/);
  assert.doesNotMatch(markup, /Submitted hours needing attention/);
  assert.doesNotMatch(markup, /submitted-mon/);
});

test('missing Timesheet is clear without exposing technical wording', () => {
  const vm = presentation.buildViewModel(clone(fixtures.clientSourceNoTimesheet));
  const markup = presentation.renderBulkHoursPane(vm);
  const simpleMarkup = presentation.renderSimpleComparison(vm);
  assert.match(markup, /No submitted Timesheet available/);
  assert.match(markup, /Waiting for Timesheet/);
  assert.match(simpleMarkup, /No submitted Timesheet available/);
  assert.equal((simpleMarkup.match(/is-waiting/g) || []).length >= 2, true);
  assert.doesNotMatch(markup, /TSFIN|RPC|Workbench|rounding|database/i);
});

test('a mismatch without server-identified affected dates fails closed', () => {
  const payload = clone(fixtures.clientSourceMismatch);
  payload.weekly_source_presentation.comparison.submitted_rows.forEach((row) => { row.affected = false; });
  const vm = presentation.buildViewModel(payload);
  assert.equal(vm.render_mode, 'UNAVAILABLE');
  assert.equal(vm.authorise_allowed, false);
  assert.match(vm.unavailable_reason, /refresh/i);
});

test('four totals are server-provided display strings and never calculated in the browser', () => {
  const payload = clone(fixtures.nhspMatch);
  const vm = presentation.buildViewModel(payload);
  const markup = presentation.renderFourTotals(vm);

  assert.match(markup, /Gross Total Charge \(including expenses\) excluding VAT/);
  assert.match(markup, /Gross Total Charge \(including expenses\) including VAT/);
  assert.match(markup, /Gross Pay to Candidate \(including expenses\) excluding VAT/);
  assert.match(markup, /Gross Pay to Candidate \(including expenses\) including VAT/);
  assert.match(markup, /£209\.85/);
  assert.match(markup, /£251\.82/);
  assert.match(markup, /£120\.00/);

  delete payload.weekly_source_presentation.totals.pay_including_vat;
  const incomplete = presentation.buildViewModel(payload);
  assert.equal(incomplete.totals, null);
  assert.equal(incomplete.authorise_allowed, false);
  assert.match(presentation.renderFourTotals(incomplete), /Totals are unavailable/);
});

test('renderers escape all server-provided copy', () => {
  const payload = clone(fixtures.clientSourceMismatch);
  payload.weekly_source_presentation.source_title = '<img src=x onerror=alert(1)>';
  payload.weekly_source_presentation.comparison.source_rows[0].day_date = '<script>alert(1)</script>';
  payload.weekly_source_presentation.totals.charge_excluding_vat = '<b>£1</b>';
  const vm = presentation.buildViewModel(payload);

  const markup = [
    presentation.renderBulkHoursPane(vm),
    presentation.renderSimpleComparison(vm),
    presentation.renderFourTotals(vm)
  ].join('');

  assert.doesNotMatch(markup, /<script>|<img|<b>/i);
  assert.match(markup, /&lt;script&gt;/);
  assert.match(markup, /&lt;img/);
  assert.match(markup, /&lt;b&gt;/);
});

test('selection ownership is a three-state checkbox in the far-left header cell', () => {
  const unchecked = presentation.renderSelectionHeaderCheckbox({
    select_label: 'Select all shifts in this group',
    clear_label: 'Clear all shifts in this group'
  });
  const mixed = presentation.renderSelectionHeaderCheckbox({
    indeterminate: true,
    select_label: 'Select all shifts in this group',
    clear_label: 'Clear all shifts in this group'
  });
  const checked = presentation.renderSelectionHeaderCheckbox({
    checked: true,
    select_label: 'Select all shifts in this group',
    clear_label: 'Clear all shifts in this group'
  });

  for (const markup of [unchecked, mixed, checked]) {
    assert.match(markup, /^\s*<th class="weekly-source-v1__select-column"/);
    assert.match(markup, /type="checkbox"/);
    assert.doesNotMatch(markup, /<button/i);
    assert.doesNotMatch(markup, />\s*Select all\s*</i);
    assert.doesNotMatch(markup, />\s*Unselect all\s*</i);
  }
  assert.match(unchecked, /aria-checked="false"/);
  assert.match(mixed, /aria-checked="mixed"/);
  assert.match(mixed, /data-indeterminate="1"/);
  assert.match(checked, /aria-checked="true"/);
  assert.match(checked, /aria-label="Clear all shifts in this group"/);
});

test('visible foundation copy contains no technical labels or hidden price detail', () => {
  const vm = presentation.buildViewModel(clone(fixtures.clientSourceMismatch));
  const markup = [
    presentation.renderCategoryTabs(vm.category_key, {}),
    presentation.renderMiddlePaneTabs(vm.default_middle_pane),
    presentation.renderBulkHoursPane(vm),
    presentation.renderApprovedHours(vm),
    presentation.renderFourTotals(vm)
  ].join('');

  const visibleCopy = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(visibleCopy, /\bimport\b|TSFIN|RPC|Workbench|rounding|margin|hourly rate/i);
  assert.match(markup, /data-weekly-source-category-select/);
  assert.match(markup, /aria-label="Timesheet type"/);
});

test('Office-approved hours stay inside the approved schedule and retain compact source context', () => {
  const vm = presentation.buildViewModel(clone(fixtures.clientSourceProtected));
  const middle = presentation.renderBulkHoursPane(vm);
  const right = presentation.renderApprovedHours(vm);
  const simple = presentation.renderSimpleLines(vm);

  assert.equal(vm.manage_approved_hours_allowed, true);
  assert.equal(vm.add_additional_expense_timesheet_allowed, true);
  assert.match(right, /05:00-15:00/);
  assert.match(right, /Office-approved hours/);
  assert.match(right, /Client system: not included/);
  assert.match(simple, /Office-approved hours included/);
  assert.match(middle, /Not included/);
  assert.match(middle, /Submitted hours needing attention/);
  assert.doesNotMatch([middle, right, simple].join(' '), /exceptional|reconciliation|recovery|Workbench/i);
});

test('approved-hours actions are mounted only from the exact current server contract', () => {
  const vm = presentation.buildViewModel(clone(fixtures.clientSourceProtected));
  assert.equal(vm.manage_approved_hours_allowed, true);
  assert.equal(vm.manage_approved_hours.endpoint, '/api/weekly-source/v1/commands');
  assert.equal(vm.manage_approved_hours.expected_record_version, vm.record_version);
  assert.deepEqual(vm.manage_approved_hours.items[0].available_actions, [
    'AMEND_PROTECTED_HOURS',
    'WITHDRAW_PROTECTED_HOURS',
    'WAIT_FOR_SOURCE',
    'ACCEPT_SOURCE_AND_RECONCILE',
    'RECORD_NOT_WORKED'
  ]);

  const missing = clone(fixtures.clientSourceProtected);
  delete missing.weekly_source_presentation.action_state.manage_approved_hours;
  assert.equal(presentation.buildViewModel(missing).render_mode, 'UNAVAILABLE');

  const wrongEndpoint = clone(fixtures.clientSourceProtected);
  wrongEndpoint.weekly_source_presentation.action_state.manage_approved_hours.endpoint = '/api/banking/pay/not-allowed';
  assert.equal(presentation.buildViewModel(wrongEndpoint).render_mode, 'UNAVAILABLE');

  const stale = clone(fixtures.clientSourceProtected);
  stale.weekly_source_presentation.action_state.manage_approved_hours.expected_record_version = 'older-version';
  assert.equal(presentation.buildViewModel(stale).render_mode, 'UNAVAILABLE');

  const unexpectedIdentity = clone(fixtures.clientSourceProtected);
  unexpectedIdentity.weekly_source_presentation.action_state.manage_approved_hours.items[0].command_payload.gross_pay = '£180.00';
  assert.equal(presentation.buildViewModel(unexpectedIdentity).render_mode, 'UNAVAILABLE');
});

test('approved-hours dialog stays compact and uses plain Office wording', () => {
  const vm = presentation.buildViewModel(clone(fixtures.clientSourceProtected));
  const button = presentation.renderManageApprovedHoursButton(vm);
  const dialog = presentation.renderManageApprovedHoursDialog(vm);
  const visibleCopy = `${button} ${dialog}`.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  assert.match(button, /Manage approved hours/);
  assert.match(dialog, /Date/);
  assert.match(dialog, /Start/);
  assert.match(dialog, /Finish/);
  assert.match(dialog, /Break \(minutes\)/);
  assert.match(dialog, /Save approved hours/);
  assert.match(dialog, /Remove approved hours/);
  assert.match(dialog, /Wait for client update/);
  assert.match(dialog, /Use client hours/);
  assert.match(dialog, /Record as not worked/);
  assert.doesNotMatch(visibleCopy, /PROTECTED|RECONCILE|SOURCE|family_id|work_event_id|idempotency|Workbench|Banking|rate|rounding/i);
});

test('approved-hours command builder sends only the sealed endpoint and payload keys', () => {
  const vm = presentation.buildViewModel(clone(fixtures.clientSourceProtected));
  const command = presentation.buildApprovedHoursCommand(vm, {
    item_id: 'approved-fri',
    action: 'AMEND_PROTECTED_HOURS',
    edits: {
      work_date: '2026-09-11',
      start_at_local: '06:00',
      end_at_local: '16:00',
      break_minutes: '45',
      reason: 'Worker corrected the submitted hours.',
      gross_pay: 'must not leave the browser'
    },
    idempotency_key: 'command-once-1'
  });

  assert.equal(command.endpoint, presentation.COMMAND_ENDPOINT);
  assert.equal(command.body.action, 'AMEND_PROTECTED_HOURS');
  assert.deepEqual(command.body.payload, {
    source_cycle_id: 'source-cycle-2026-09-13',
    candidate_id: 'candidate-1',
    client_id: 'client-1',
    contract_id: 'contract-1',
    week_ending_date: '2026-09-13',
    work_event_id: 'work-event-fri',
    evidence_timesheet_id: 'timesheet-1',
    work_date: '2026-09-11',
    start_at_local: '06:00',
    end_at_local: '16:00',
    break_minutes: 45,
    reason: 'Worker corrected the submitted hours.',
    idempotency_key: 'command-once-1',
    expected_record_version: 'client-protected-v1'
  });
  assert.equal(Object.hasOwn(command.body.payload, 'family_id'), false);
  assert.equal(Object.hasOwn(command.body.payload, 'gross_pay'), false);
});

test('server action availability controls later outcomes and non-schedule choices ignore browser schedule edits', () => {
  const vm = presentation.buildViewModel(clone(fixtures.clientSourceProtected));
  const command = presentation.buildApprovedHoursCommand(vm, {
    item_id: 'approved-fri',
    action: 'ACCEPT_SOURCE_AND_RECONCILE',
    edits: {
      work_date: '2099-12-31',
      start_at_local: '00:01',
      end_at_local: '23:59',
      break_minutes: 999,
      reason: 'Use the hours confirmed by the client.'
    },
    idempotency_key: 'command-once-2'
  });
  assert.deepEqual(command.body.payload, {
    family_id: 'approved-hours-family-1',
    work_event_id: 'work-event-fri',
    reason: 'Use the hours confirmed by the client.',
    idempotency_key: 'command-once-2',
    expected_record_version: 'client-protected-v1'
  });
  assert.throws(() => presentation.buildApprovedHoursCommand(vm, {
    item_id: 'approved-fri',
    action: 'FINALISE_WEEK',
    edits: { reason: 'not allowed' },
    idempotency_key: 'command-once-3'
  }), /no longer available/i);
});

test('source-supplied expenses stay in the source Timesheet and expose no receipt route', () => {
  const vm = presentation.buildViewModel(clone(fixtures.clientSourceSuppliedExpense));
  const sourceExpense = presentation.renderSourceExpenseContext(vm);

  assert.equal(vm.expense_owner, 'SOURCE_SUPPLIED');
  assert.equal(vm.source_original_allows_candidate_expenses, false);
  assert.equal(vm.add_additional_expense_timesheet_allowed, false);
  assert.match(sourceExpense, /Client-provided expense/);
  assert.match(sourceExpense, /Receipt and mileage evidence cannot be added here/);
  assert.doesNotMatch(sourceExpense, /Add additional expense Timesheet/i);
});

test('source-supplied expense remains on an ordinary Weekly root when source hours are zero', () => {
  const vm = presentation.buildViewModel(clone(fixtures.clientSourceSuppliedExpenseZeroHours));
  const markup = `${presentation.renderSimpleLines(vm)}${presentation.renderApprovedHours(vm)}`;

  assert.equal(vm.expense_owner, 'SOURCE_SUPPLIED');
  assert.equal(vm.add_additional_expense_timesheet_allowed, false);
  assert.equal(vm.approved_rows[0].hours, '0');
  assert.match(markup, /Client-provided expense only/);
  assert.match(markup, /Client-provided expense/);
  assert.match(markup, /£24\.00/);
  assert.doesNotMatch(markup, /Add additional expense Timesheet|type="file"|Receipt upload|data-expense-category/i);
});

test('an incomplete signed Timesheet cannot enter the client-check authorisation route', () => {
  const vm = presentation.buildViewModel(clone(fixtures.timesheetCheckedWaiting));
  const middle = presentation.renderBulkHoursPane(vm);

  assert.equal(vm.authority, 'SIGNED_TIMESHEET');
  assert.equal(vm.default_middle_pane, 'FILES');
  assert.equal(vm.authorise_allowed, false);
  assert.match(vm.blocked_reason, /Waiting for the worker and manager/i);
  assert.match(middle, /Waiting for completed Timesheet/);
  assert.doesNotMatch(middle, /Ask candidate|Accept system hours|Finalise/i);
});

test('the category contract is exact and maps only to existing dataset classifications', () => {
  assert.deepEqual(
    presentation.CATEGORIES.map((category) => category.key),
    ['NHSP', 'CLIENT_PROVIDED_HOURS', 'TIMESHEETS_CHECKED_WITH_CLIENT', 'STANDARD_TIMESHEETS']
  );
  assert.equal(presentation.backendClassificationForCategory('NHSP'), 'NHSP');
  assert.equal(presentation.backendClassificationForCategory('CLIENT_PROVIDED_HOURS'), 'HR');
  assert.equal(presentation.backendClassificationForCategory('TIMESHEETS_CHECKED_WITH_CLIENT'), 'TIMESHEETS');
  assert.equal(presentation.backendClassificationForCategory('STANDARD_TIMESHEETS'), 'TIMESHEETS');
  assert.deepEqual(Object.keys(presentation.ROUTES), [
    'NHSP',
    'CLIENT_PROVIDED_HOURS',
    'TIMESHEETS_CHECKED_WITH_CLIENT'
  ]);
});
