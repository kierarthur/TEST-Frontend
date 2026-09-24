/**
 * WP-12 (Gate 10) — the server-owned lifecycle, the two Office decisions, the
 * withdrawal state, invoice movements and the Bulk step model.
 *
 * Every payload used here is a REAL return of
 * `public.weekly_source_office_timesheet_presentation_v1(jsonb)` captured from
 * the local PostgreSQL 17.11 build, not a hand-written shape. Assertions that
 * change a payload say so and say what they changed, so that a negative case is
 * never mistaken for an observed one.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const presentation = require('../../js/weekly-source-presentation-v1.js');
const states = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../fixtures/weekly-source-lifecycle-states.json'),
  'utf8'
));

const clone = (value) => JSON.parse(JSON.stringify(value));
const payload = (label) => clone(states.cases[label].presentation);
const vmFor = (label) => presentation.buildViewModelFromPresentation(payload(label));
const DELETED_HEADING = ['Hours', 'being', 'authorised'].join(' ');

/** The pack's own headings, P:\annexes\ui-lifecycle-state-matrix.csv. */
const MATRIX_HEADINGS = {
  'UI-001': 'Hours to authorise',
  'UI-002': 'Hours to authorise',
  'UI-003': 'Hours to authorise',
  'UI-004': 'Hours to authorise',
  'UI-005': 'Approved hours',
  'UI-006': 'Approved hours',
  'UI-007': 'Hours paid',
  'UI-008': 'Currently approved hours',
  'UI-009': 'Hours paid to date',
  'UI-010': 'Hours paid to date',
  'UI-011': 'Approved hours',
  'UI-012': 'Current paid hours',
  'UI-013': 'Currently approved hours',
  'UI-014': 'Timesheet hours',
  'UI-015': 'Timesheet hours',
  'UI-019': 'Submitted Timesheet',
  'UI-020': 'Submitted Timesheet plus Approved hours to be paid',
  'UI-021': 'Timesheet (read-only)',
  'UI-022': 'Not authorised for pay \u00b7 invoiced from source'
};

test('the owned assets contain no lifecycle heading string at all', () => {
  const owned = [
    '../../js/weekly-source-presentation-v1.js',
    '../../css/weekly-source-presentation-v1.css',
    '../../css/weekly-source.css'
  ].map((file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8')).join('\n');

  // 25 section 10 "Removed" deletes the generic heading by name (erratum E-4).
  // It must appear nowhere at all, in any form.
  assert.equal(owned.includes(DELETED_HEADING), false);

  // No lifecycle heading is EMITTED AS A HEADING by these assets: every one
  // arrives from the server and is passed through a variable. Two matrix
  // strings appear as substrings of long-standing, non-heading copy, and are
  // checked below rather than banned:
  //   * `Approved hours` — the authority badge on the principal table and the
  //     `Manage approved hours` control (reconciliation report 04 §4.1 records
  //     both as pre-existing and correct);
  //   * `Timesheet hours` — inside `Signed Timesheet hours`, the Bulk MIDDLE
  //     pane's supporting comparison caption, which the matrix does not make a
  //     heading for UI-014/UI-015;
  //   * `Submitted Timesheet` — the long-standing ROUTE label for the submitted
  //     comparison table. UI-019's identical heading is the CANDIDATE surface's
  //     and is never rendered by the Office.
  for (const heading of new Set(Object.values(MATRIX_HEADINGS))) {
    assert.equal(owned.includes(`<h3>${heading}</h3>`), false,
      `${heading} must not be emitted as a literal heading element`);
  }
  const unexpected = [...new Set(Object.values(MATRIX_HEADINGS))]
    .filter((heading) => owned.includes(heading))
    .sort();
  assert.deepEqual(unexpected, ['Approved hours', 'Submitted Timesheet', 'Timesheet hours'],
    'only the three documented non-heading substrings may appear');

  // And both appear only in the places named above.
  assert.equal(/<h3>[^<]*(Approved hours|Timesheet hours)[^<]*<\/h3>/.test(owned), false,
    'neither substring is used as a heading element');
});

test('every Office row carries the server heading verbatim into the rendered markup', () => {
  const officeRows = Object.keys(MATRIX_HEADINGS).filter((label) => !['UI-019', 'UI-020', 'UI-021'].includes(label));
  for (const label of officeRows) {
    const vm = vmFor(label);
    assert.equal(vm.mount, true, `${label} must mount`);
    assert.equal(vm.lifecycle_ok, true, `${label} must resolve`);
    assert.equal(vm.heading_source, 'SERVER', `${label} heading source`);
    assert.equal(vm.heading, MATRIX_HEADINGS[label], `${label} heading text`);

    const markup = `${presentation.renderSimpleLines(vm)}${presentation.renderApprovedHours(vm)}`;
    assert.ok(markup.includes(`<h3>${presentation.escapeHtml(MATRIX_HEADINGS[label])}</h3>`),
      `${label} must paint its server heading`);
    assert.equal(presentation.containsDeletedHeading(markup), false, `${label} must not paint the deleted heading`);
  }
});

test('the two bypass rows do not mount and the legacy owner keeps its output byte for byte', () => {
  for (const label of ['UI-016', 'UI-017']) {
    const host = { weekly_source_presentation: payload(label) };
    const exact = '  <section data-owner="legacy">legacy output & spacing</section>\n';
    let legacy = 0;
    let weekly = 0;
    const rendered = presentation.renderLegacyOrWeekly(host, () => { legacy += 1; return exact; }, () => { weekly += 1; return 'wrong'; });
    assert.equal(rendered, exact, `${label} passthrough is byte-identical`);
    assert.equal(legacy, 1);
    assert.equal(weekly, 0);
    assert.equal(presentation.buildViewModel(host).mount, false);
  }
});

test('UI-018 is an overlay on the phase the week is really in, and never a phase of its own', () => {
  const vm = vmFor('UI-018');
  assert.equal(vm.ui_state, 'UI-001');
  assert.deepEqual(vm.overlay_states, ['UI-018']);
  assert.equal(vm.heading, 'Hours to authorise');
  const markup = presentation.renderSimpleLines(vm);
  assert.match(markup, /Client-provided expense/);
  assert.doesNotMatch(markup, /type="file"|Receipt upload|Add additional expense Timesheet/i);
});

test('a schedule the server did not supply is NOT KNOWN, never zero', () => {
  const vm = vmFor('UI-022');
  const approved = vm.lifecycle.schedules.approved;
  assert.equal(approved.available, false);
  assert.equal(approved.reason, 'NO_CURRENT_AUTHORISED_ENTITLEMENT');
  assert.equal(approved.row_count, 0);
  assert.deepEqual(approved.rows, []);

  const markup = presentation.renderServerSchedule(approved, 'Approved hours', {});
  assert.match(markup, /Not available/);
  assert.match(markup, /NO_CURRENT_AUTHORISED_ENTITLEMENT/);
  assert.doesNotMatch(markup, /0:00|0\.00|£0\.00/);
});

test('the withheld/damaged split is read from unavailable_class, not from a list of reasons', () => {
  // CONSTRUCTED PAYLOAD, and stated as such. The captured corpus predates
  // `unavailable_class` and `reason_detail` (see WP-12_REPORT §12: a stale
  // migration lock owned by another package blocks a newer build). The field
  // names and the sentences below are copied verbatim from the installed owner
  // `rep\17092026_1000_weekly_source_settlement_allocation_v1.sql:284-320`, so
  // the shape is the server's even though this build could not emit it.
  //
  // Handoff N3.3a: code against the two CLASSES, not against the reason list,
  // because the reason list shrinks when the finance ruling lands.
  const withClass = (unavailableClass, reason, detail) => {
    const payload = clone(states.cases['UI-012'].presentation);
    for (const key of ['paid_to_date', 'current_paid']) {
      payload.lifecycle.schedules[key] = {
        available: false,
        reason,
        reason_detail: detail,
        unavailable_class: unavailableClass,
        source: null,
        row_count: 0,
        rows: [],
        settlement_count: 2,
        batch_count: 2
      };
    }
    return presentation.buildViewModelFromPresentation(payload);
  };

  // A reason this file has NEVER heard of, carrying the withheld class. It must
  // still be recognised as withheld, which is the whole point of the class.
  const unknownReason = withClass(
    'POSITION_WITHHELD',
    'SETTLEMENT_SEQUENCE_UNPROVABLE',
    'This week has been paid more than once. The payment records are complete and consistent, '
    + 'but which of the payments states the current position cannot be proved from an installed '
    + 'settlement sequence, so no figure is shown.'
  );
  assert.equal(unknownReason.lifecycle.schedules.current_paid.withheld, true);
  assert.equal(unknownReason.lifecycle.schedules.current_paid.unavailable_class, 'POSITION_WITHHELD');
  assert.equal(unknownReason.lifecycle_ok, true, 'a withheld position is not a damaged projection');
  assert.equal(unknownReason.heading, 'Current paid hours');

  const markup = presentation.renderSimpleLines(unknownReason);
  // The SERVER's sentence is displayed, not one of ours.
  assert.match(markup, /which of the payments states the current position cannot be proved/);
  assert.match(markup, /data-weekly-source-unavailable-class="POSITION_WITHHELD"/);
  assert.match(markup, /This figure is being withheld/);
  // Counts of financial events are never rendered as hours or money.
  assert.doesNotMatch(markup, /2 hours|2\.00|£2/);

  // The other class is NOT a withholding; it is a damaged projection, and the
  // server marks the whole lifecycle ok:false for it. The browser must not
  // dress it up as a withheld figure.
  const damaged = withClass('EVIDENCE_DAMAGED', 'SETTLEMENT_HISTORY_CONFLICT', 'This week has more than one payment record for the same payment run.');
  assert.equal(damaged.lifecycle.schedules.current_paid.withheld, false);
  assert.equal(damaged.lifecycle.schedules.current_paid.unavailable_class, 'EVIDENCE_DAMAGED');
  const damagedMarkup = presentation.renderServerSchedule(damaged.lifecycle.schedules.current_paid, 'Current paid hours', {});
  assert.match(damagedMarkup, /Not available/);
  assert.doesNotMatch(damagedMarkup, /being withheld/);

  // An unpaid position has NO total_hours member at all — not a zero.
  assert.equal(unknownReason.lifecycle.schedules.current_paid.total_hours, null);
  assert.deepEqual(unknownReason.lifecycle.schedules.current_paid.rows, []);
  assert.doesNotMatch(markup, /\b0:00\b|£0\.00/);
});

test('a WITHHELD paid figure is a stated position, not an error and not a zero', () => {
  // OBSERVED, not constructed: `UI-012`'s root settled more than once on the
  // local build, so the server withholds the paid figure by name pending the
  // finance ruling. The phase still resolves and the heading is still shown.
  const vm = vmFor('UI-012');
  assert.equal(vm.lifecycle.schedules.current_paid.reason, 'SETTLEMENT_POSITION_SEMANTICS_UNRULED');
  assert.equal(vm.lifecycle_ok, true, 'a withheld figure does not damage the projection');
  assert.equal(vm.heading, 'Current paid hours', 'the heading is still shown');
  assert.equal(vm.lifecycle.schedules.current_paid.withheld, true);

  const markup = presentation.renderSimpleLines(vm);
  assert.match(markup, /This figure is being withheld/);
  assert.match(markup, /No other figure stands in for it/);
  assert.match(markup, /SETTLEMENT_POSITION_SEMANTICS_UNRULED/);
  assert.doesNotMatch(markup, /cannot be shown|0:00|£0\.00/);

  // And an ordinary unavailable schedule is still an ordinary unavailable one.
  const ordinary = vmFor('UI-022');
  assert.equal(ordinary.lifecycle.schedules.approved.withheld, false);
});

test('a contradictory projection is an explicit error state with no heading, schedule or action', () => {
  // CHANGED PAYLOAD: `ok:false` with the server's own error shape.
  const broken = payload('UI-005');
  broken.lifecycle = {
    contract: 'WEEKLY_SOURCE_OFFICE_LIFECYCLE_V1',
    ok: false,
    ui_state: null,
    server_phase: null,
    heading: null,
    heading_source: 'NONE',
    permitted_actions: [],
    errors: [{ code: 'LIFECYCLE_PHASE_UNRESOLVED', detail: 'No lifecycle phase could be resolved from the evidence.' }]
  };
  const vm = presentation.buildViewModelFromPresentation(broken);
  assert.equal(vm.lifecycle_ok, false);
  assert.equal(vm.heading, null);
  assert.deepEqual(vm.permitted_actions, []);

  const markup = `${presentation.renderSimpleLines(vm)}${presentation.renderApprovedHours(vm)}`;
  assert.match(markup, /LIFECYCLE_PHASE_UNRESOLVED/);
  assert.doesNotMatch(markup, /<h3>/);
  assert.doesNotMatch(markup, /<button/);
});

test('an absent lifecycle fails closed rather than rendering an unlabelled schedule', () => {
  // CHANGED PAYLOAD: `lifecycle` removed, as a server predating Gate 9 returns.
  const stale = payload('UI-001');
  delete stale.lifecycle;
  const vm = presentation.buildViewModelFromPresentation(stale);
  assert.equal(vm.lifecycle_ok, false);
  assert.equal(vm.lifecycle.errors[0].code, 'LIFECYCLE_ABSENT');
  assert.doesNotMatch(presentation.renderSimpleLines(vm), /<h3>/);
});

test('the two decisions are rendered only from proposal.decision, never from the matrix', () => {
  const proposed = vmFor('UI-008');
  assert.equal(proposed.proposal.state, 'PROPOSED');
  assert.equal(proposed.proposal.request_digest_verified, true);
  assert.ok(proposed.proposal.decision, 'UI-008 offers a decision');
  const markup = presentation.renderLaterChangeDecision(proposed, { surface: 'SIMPLE_TIMESHEET' });
  assert.match(markup, /data-weekly-source-decision="APPROVE_UPDATED_HOURS"/);
  assert.match(markup, /data-weekly-source-decision="KEEP_CURRENTLY_APPROVED_HOURS"/);
  assert.match(markup, />Approve updated hours</);
  assert.match(markup, />Keep currently approved hours</);
  // Erratum E-5: no reason box on either decision.
  assert.doesNotMatch(markup, /<textarea/);

  // CHANGED PAYLOAD: the decision is removed while the matrix still lists both
  // actions as permitted. No button may appear.
  const refused = payload('UI-008');
  refused.proposal.decision = null;
  const refusedVm = presentation.buildViewModelFromPresentation(refused);
  assert.deepEqual([...refusedVm.permitted_actions].sort(), ['APPROVE_UPDATED_HOURS', 'KEEP_CURRENTLY_APPROVED_HOURS']);
  assert.doesNotMatch(presentation.renderLaterChangeDecision(refusedVm, {}), /data-weekly-source-decision="/);
});

test('a proposal the server did not verify offers no decision', () => {
  // CHANGED PAYLOAD: `request_digest_verified` removed. N3.4 says never render
  // a proposal without it, so the decision must disappear with it.
  const unverified = payload('UI-008');
  delete unverified.proposal.request_digest_verified;
  const vm = presentation.buildViewModelFromPresentation(unverified);
  assert.equal(vm.proposal.request_digest_verified, false);
  assert.equal(vm.proposal.decision, null);
  assert.doesNotMatch(presentation.renderLaterChangeDecision(vm, {}), /data-weekly-source-decision="/);
});

test('a refused cross-Contract proposal shows the server detail rather than a blank', () => {
  // CHANGED PAYLOAD: the stale-decision refusal, as WP-11b N3.4b now states it.
  // The reason CODE is historical — it was named when a partial move was still
  // the case it covered — and today it means the accepted decision cannot be
  // reproduced from what is stored, so it is stale. The browser keys off the
  // code and renders the detail; it never parses the name for meaning, and it
  // has no partial-move state, because a partial Contract-to-Contract move is
  // refused when the decision is composed and can never be accepted.
  const refusedDetail = 'The proposed entitlement is not shown because it cannot be proved. '
    + 'The usual cause is that one of the two Contracts no longer holds the entitlement the '
    + 'decision was taken against, which makes the decision stale and means it should be taken again.';
  const refused = payload('UI-013');
  refused.proposal = {
    ...refused.proposal,
    present: true,
    state: 'UNAVAILABLE',
    reason: 'PROPOSAL_CROSS_CONTRACT_MOVE_SET_NOT_RECOVERABLE',
    detail: refusedDetail,
    decision: null
  };
  const vm = presentation.buildViewModelFromPresentation(refused);
  const markup = presentation.renderLaterChangeDecision(vm, {});
  assert.match(markup, /data-weekly-source-proposal-unavailable="PROPOSAL_CROSS_CONTRACT_MOVE_SET_NOT_RECOVERABLE"/);
  assert.ok(markup.includes(presentation.escapeHtml(refusedDetail)), 'the server detail is displayed');
  assert.doesNotMatch(markup, /data-weekly-source-decision="/);
  // Both roots' current positions are still shown.
  assert.match(markup, /data-weekly-source-member="1"/);
  assert.match(markup, /data-weekly-source-member="2"/);
});

test('the cross-Contract surface is built from members and never sums them', () => {
  const vm = vmFor('UI-013');
  assert.equal(vm.proposal.state, 'PROPOSED_CROSS_CONTRACT');
  assert.equal(vm.proposal.bundle_kind, 'CROSS_CONTRACT_A_B');
  assert.equal(vm.proposal.member_count, 2);
  assert.equal(vm.proposal.members.length, 2);
  assert.equal(vm.proposal.members[0].root_ordinal, 1);
  assert.equal(vm.proposal.members[1].root_ordinal, 2);
  assert.notEqual(vm.proposal.members[0].contract_id, vm.proposal.members[1].contract_id);
  // The old root gives the entitlement up; that is an explicit certified zero,
  // not a missing figure.
  assert.equal(vm.proposal.members[0].proposed.available, true);
  assert.equal(vm.proposal.members[0].proposed.row_count, 0);
  assert.equal(vm.proposal.members[0].proposed_certified_zero, true);
  // The new root receives it complete, onto a genuinely blank TSFIN position.
  assert.equal(vm.proposal.members[1].proposed.available, true);
  assert.equal(vm.proposal.members[1].currently_approved_authority, 'TSFIN');
  assert.equal(vm.proposal.members[1].currently_approved.row_count, 0);

  const markup = presentation.renderLaterChangeDecision(vm, {});
  assert.match(markup, /data-weekly-source-member-count="2"/);
  assert.match(markup, /Old root/);
  assert.match(markup, /New root/);
  // The two positions are shown side by side; no total of the two appears.
  assert.doesNotMatch(markup, /combined|total across|sum of/i);

  // Now the server offers the decision, so the two buttons appear on their own.
  assert.ok(vm.proposal.decision, 'the cross-Contract decision is offered');
  assert.match(markup, /data-weekly-source-decision="APPROVE_UPDATED_HOURS"/);
  assert.match(markup, /data-weekly-source-decision="KEEP_CURRENTLY_APPROVED_HOURS"/);
});

test('a whole-entitlement A-to-B move is shown as ONE line moving, not a removal and an addition', () => {
  const vm = vmFor('UI-013');
  const oldRows = vm.proposal.members[0].currently_approved.rows;
  const newRows = vm.proposal.members[1].proposed.rows;
  const shared = oldRows
    .map((row) => row.component_id)
    .filter((id) => id && newRows.some((row) => row.component_id === id));
  assert.ok(shared.length > 0, 'the moved component keeps its identity across both roots');

  const markup = presentation.renderLaterChangeDecision(vm, {});
  assert.match(markup, /Lines that move/);
  for (const componentId of shared) {
    assert.ok(markup.includes(`data-weekly-source-moved-component="${componentId}"`),
      `${componentId} is rendered as one line that moves`);
  }
  assert.match(markup, /Old Contract to new Contract/);
});

test('a single-root decision uses the same member shape as an A-to-B decision', () => {
  const single = vmFor('UI-008');
  assert.equal(single.proposal.member_count, 1);
  const markup = presentation.renderLaterChangeDecision(single, {});
  assert.match(markup, /data-weekly-source-member-count="1"/);
  assert.doesNotMatch(markup, /Old root|New root/);
});

test('the decision command posts command_payload unchanged plus the actor and the decision', () => {
  const vm = vmFor('UI-008');
  const command = presentation.buildLaterChangeDecisionCommand(vm, {
    decision: 'APPROVE_UPDATED_HOURS',
    actor_user_id: 'd1000000-0000-4000-8000-000000000001',
    idempotency_key: 'wp12-decision-1'
  });
  assert.equal(command.endpoint, vm.proposal.decision.endpoint);
  for (const [key, value] of Object.entries(vm.proposal.decision.command_payload)) {
    assert.deepEqual(command.body[key], value, `${key} is posted unchanged`);
  }
  assert.equal(command.body.actor_user_id, 'd1000000-0000-4000-8000-000000000001');
  assert.equal(command.body.decision, 'APPROVE_UPDATED_HOURS');
  assert.equal(command.body.idempotency_key, 'wp12-decision-1');

  assert.throws(() => presentation.buildLaterChangeDecisionCommand(vm, {
    decision: 'SOMETHING_ELSE',
    actor_user_id: 'd1000000-0000-4000-8000-000000000001'
  }), /no longer available/);
});

test('UI-022 is the withdrawn state: the server heading, no action, and the result copy', () => {
  const vm = vmFor('UI-022');
  assert.equal(vm.ui_state, 'UI-022');
  assert.equal(vm.withdrawn, true);
  assert.equal(vm.unauthorise.authorisation_state, 'WITHDRAWN');
  assert.deepEqual(vm.permitted_actions, []);
  assert.equal(vm.primary_schedule_key, null);

  const markup = presentation.renderSimpleLines(vm);
  assert.ok(markup.includes(presentation.escapeHtml('Not authorised for pay \u00b7 invoiced from source')));
  assert.match(markup, /Authorisation withdrawn\./);
  assert.doesNotMatch(markup, /data-weekly-source-decision=/);
});

test('withdrawal availability is the server\'s alone, and a permanent refusal never invites a retry', () => {
  const paid = vmFor('UI-007');
  assert.equal(paid.managed_root, true);
  assert.equal(paid.unauthorise_allowed, false);
  assert.equal(paid.unauthorise.permanent, true);
  assert.equal(paid.unauthorise.refusal_code, 'WEEKLY_SOURCE_UNAUTHORISE_PAID');
  const permanentText = presentation.withdrawalRefusalText(paid.unauthorise);
  assert.equal(permanentText, presentation.WITHDRAWAL_REFUSAL_COPY.PERMANENT);
  assert.doesNotMatch(permanentText, /try again/i);

  // An unauthorised week is not a managed root, so the ordinary owner keeps it.
  const neverAuthorised = vmFor('UI-001');
  assert.equal(neverAuthorised.unauthorise.refusal_code, 'WEEKLY_SOURCE_UNAUTHORISE_NOT_MANAGED_ROOT');
  assert.equal(neverAuthorised.managed_root, false);

  // CHANGED PAYLOAD: a TEMPORARY Banking refusal, which the policy gives its own
  // string; and the server's own message wins when it supplies one.
  const banking = payload('UI-007');
  banking.action_state.unauthorise = {
    ...banking.action_state.unauthorise,
    refusal_code: 'WEEKLY_SOURCE_UNAUTHORISE_BANKING_ACTIVE',
    refusal_nature: 'TEMPORARY',
    permanent: false,
    retryable: true
  };
  const bankingVm = presentation.buildViewModelFromPresentation(banking);
  assert.equal(presentation.withdrawalRefusalText(bankingVm.unauthorise), presentation.WITHDRAWAL_REFUSAL_COPY.BANKING_ACTIVE);

  banking.action_state.unauthorise.refusal_message = 'A server-authored sentence.';
  const spokenVm = presentation.buildViewModelFromPresentation(banking);
  assert.equal(presentation.withdrawalRefusalText(spokenVm.unauthorise), 'A server-authored sentence.');
});

test('invoice movement history has its own Audit region and is never an hours table', () => {
  const vm = vmFor('UI-022');
  const region = presentation.renderInvoiceMovementHistory(vm);
  assert.match(region, /weekly-source-v1__movements/);
  assert.match(region, /Invoice movements/);
  // The Lines tab stays focused on the hours being reviewed. Invoice history is
  // mounted separately by the Timesheet Audit owner.
  const simple = presentation.renderSimpleLines(vm);
  assert.match(simple, /data-weekly-source-primary/);
  assert.doesNotMatch(simple, /data-weekly-source-invoice-movements/);

  // CHANGED PAYLOAD: ok:false. `invoiced_from_source` is then UNKNOWN, not false.
  const broken = payload('UI-022');
  broken.invoice_movement_history = { ok: false, reason: 'MOVEMENT_READER_DID_NOT_ANSWER', invoiced_from_source: false, movement_count: 0, movements: [] };
  const brokenVm = presentation.buildViewModelFromPresentation(broken);
  assert.equal(brokenVm.invoice_movements.invoiced_from_source, null);
  assert.match(presentation.renderInvoiceMovementHistory(brokenVm), /is not known right now/);
});

test('the Bulk step model is three steps, and the layout is decided by width alone', () => {
  assert.deepEqual(presentation.BULK_WORKSPACE_STEPS.map((step) => step.label), ['Queue', 'Review', 'Authorise']);
  assert.deepEqual(presentation.bulkStepForWidth(1440, 'REVIEW'), { layout: 'DESKTOP', stepped: false, step: 'REVIEW', queue_collapsed: false });
  assert.deepEqual(presentation.bulkStepForWidth(768, 'AUTHORISE'), { layout: 'TABLET', stepped: true, step: 'AUTHORISE', queue_collapsed: true });
  assert.deepEqual(presentation.bulkStepForWidth(390, 'QUEUE'), { layout: 'PHONE', stepped: true, step: 'QUEUE', queue_collapsed: false });
  assert.deepEqual(presentation.bulkStepForWidth(280, 'REVIEW'), { layout: 'FOLD', stepped: true, step: 'REVIEW', queue_collapsed: false });
  // An unknown step is never invented; it falls back to Review.
  assert.equal(presentation.bulkStepForWidth(390, 'NOT_A_STEP').step, 'REVIEW');
  const nav = presentation.renderBulkWorkspaceSteps('AUTHORISE', {});
  assert.match(nav, /aria-selected="true"[^>]*>Authorise|data-weekly-source-workspace-step="AUTHORISE"[^>]*aria-selected="true"/);
  assert.equal(presentation.renderBulkStickyAction('AUTHORISE', {}), '');
  assert.match(presentation.renderBulkStickyAction('QUEUE', {}), /Continue to Review/);
  assert.match(presentation.renderBulkStickyAction('REVIEW', {}), /Continue to Authorise/);
});

test('the lifecycle policy index carries all 22 rows and forbids browser inference', () => {
  const policy = presentation.normaliseLifecyclePolicy({ lifecycle_policy: states.lifecycle_policy });
  assert.equal(policy.row_count, 22);
  assert.equal(policy.browser_may_infer_phase, false);
  for (const [label, heading] of Object.entries(MATRIX_HEADINGS)) {
    assert.equal(policy.by_ui_state[label].heading, heading, `${label} heading from the server policy`);
  }
  for (const label of ['UI-016', 'UI-017', 'UI-018']) {
    assert.equal(policy.by_ui_state[label].heading, null, `${label} carries no Weekly Source heading`);
  }
});

test('the component schedule shape renders a non-hours component as a non-hours line', () => {
  // CHANGED PAYLOAD: a SOURCE_FIXED_EXPENSE component added to a real
  // EFFECTIVE_INVENTORY_HEAD envelope, whose day_date and total_hours are null
  // by contract.
  const withExpense = payload('UI-008');
  const schedule = withExpense.lifecycle.schedules.currently_approved;
  assert.equal(schedule.source, 'EFFECTIVE_INVENTORY_HEAD');
  schedule.rows = schedule.rows.concat([{
    row_key: 'entitlement-expense',
    component_id: 'c0000000-0000-4000-8000-0000000000ff',
    component_kind: 'SOURCE_FIXED_EXPENSE',
    work_event_id: null,
    day_date: null,
    total_hours: null,
    expense_code: 'PARKING',
    state: 'ENTITLED'
  }]);
  const vm = presentation.buildViewModelFromPresentation(withExpense);
  const markup = presentation.renderServerSchedule(vm.lifecycle.schedules.currently_approved, 'Hours in place now', {});
  assert.match(markup, /data-weekly-source-non-hours="1"/);
  assert.match(markup, /Client-provided expense · PARKING/);
  // The hours components still render their string hours verbatim, unrounded.
  const hoursRow = vm.lifecycle.schedules.currently_approved.rows.find((row) => row.is_hours_component);
  assert.match(hoursRow.total_hours, /^\d+\.\d{6}$/);
  assert.ok(markup.includes(hoursRow.total_hours));
});

test('finalised source Approved hours show frozen clock rows, not category components', () => {
  // CHANGED PAYLOAD: supply one finalised source row beside a category schedule
  // to prove the two independent server projections are not mixed in Lines.
  const source = payload('UI-005');
  source.lifecycle.schedules.approved = {
    ...source.lifecycle.schedules.approved,
    row_shape: 'COMPONENT',
    rows: [{ row_key: 'category-only', component_kind: 'HOURS',
      hours_day: '1.500000', hours_night: '1.000000', total_hours: '2.500000' }]
  };
  source.approved_rows = [{ row_key: 'final-physical-1',
    day_date: 'Tue 15 Sep 2026', reference_number: 'A990000101',
    hours: '01:00-04:00', break_text: '30 min', state: 'READY',
    status_text: 'Ready' }];
  const vm = presentation.buildViewModelFromPresentation(source);
  const markup = presentation.renderSimpleLines(vm);
  assert.match(markup, /Approved hours/);
  assert.match(markup, /Finalised source/);
  assert.match(markup, /A990000101/);
  assert.match(markup, /<th>Start<\/th><th>End<\/th><th>Break<\/th>/);
  assert.match(markup, /data-weekly-source-label="Start">01:00<\/td><td data-weekly-source-label="End">04:00<\/td>/);
  assert.doesNotMatch(markup, /1\.500000|1\.000000|category-only/);
});

test('hours are rendered exactly as the server sent them and are never recomputed', () => {
  const vm = vmFor('UI-013');
  const rows = vm.proposal.members[0].currently_approved.rows;
  const total = rows[0].total_hours;
  // The server states hours as a fixed-scale string; the browser does no
  // arithmetic on it and does not reformat it.
  assert.match(total, /^\d+\.\d{6}$/);
  assert.equal(rows[0].hours_day, total);
  const markup = presentation.renderServerSchedule(vm.proposal.members[0].currently_approved, 'Hours in place now', {});
  assert.ok(markup.includes(total), 'the string is painted exactly as sent');
  const rounded = Number(total).toFixed(2);
  assert.equal(markup.includes(`>${rounded}<`), false, 'no rounded form is substituted');
});

test('a refused Weekly Source command is explained in the server\'s own words', () => {
  // The refusal reader lives in main.js, which is not a module, so it is read
  // out of the shipped source and evaluated. That keeps the assertion EXECUTED
  // rather than a text search: the function actually runs.
  const main = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');
  const start = main.indexOf('function weeklySourceCommandRefusalMessage(');
  const end = main.indexOf('\n// Gate 10.  The two Office decisions.', start);
  assert.ok(start > 0 && end > start, 'the refusal reader is present');
  // eslint-disable-next-line no-eval
  const weeklySourceCommandRefusalMessage = eval(`(${main.slice(start, end).trim()})`);

  // The partial-move refusal, verbatim from the installed owner
  // `rep\15092026_1534_weekly_source_ordinary_pay_projection_v1.sql:1444-1456`.
  const serverMessage = 'This proposal moves only part of the entitlement from one Contract to the '
    + 'other and leaves the rest behind. Moving part of an entitlement is not supported in this '
    + 'release: a Contract-to-Contract amendment must move the whole entitlement, so that the old '
    + 'Contract is left holding nothing. Nothing has been proposed. Either move every component of '
    + 'the old Contract\'s entitlement, or leave the entitlement where it is.';

  assert.equal(weeklySourceCommandRefusalMessage({
    ok: false,
    detail: {
      code: 'WEEKLY_SOURCE_PROPOSAL_PARTIAL_MOVE_UNSUPPORTED',
      reason: 'ONLY_A_WHOLE_ENTITLEMENT_MOVE_IS_SUPPORTED_IN_THIS_RELEASE',
      message: serverMessage
    }
  }), serverMessage, 'the server sentence is shown verbatim');

  // A bare machine code is not an explanation and is never shown as one.
  assert.equal(weeklySourceCommandRefusalMessage({
    ok: false,
    error: 'WEEKLY_SOURCE_PROPOSAL_PARTIAL_MOVE_UNSUPPORTED'
  }), '');

  // The withdrawal owner's own field is read too.
  assert.equal(weeklySourceCommandRefusalMessage({
    ok: false,
    refusal_message: 'This Timesheet has been paid, so the first authorisation can no longer be withdrawn.'
  }), 'This Timesheet has been paid, so the first authorisation can no longer be withdrawn.');

  // Nothing usable means nothing is invented; the caller supplies the fallback.
  assert.equal(weeklySourceCommandRefusalMessage({ ok: false }), '');
  assert.equal(weeklySourceCommandRefusalMessage(null), '');
});
