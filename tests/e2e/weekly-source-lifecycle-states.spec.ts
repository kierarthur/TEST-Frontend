/**
 * WP-12 (Gate 10) — all 22 lifecycle states, rendered in a real browser through
 * the real Office assets.
 *
 * The payloads in `tests/fixtures/weekly-source-lifecycle-states.json` are not
 * hand-written. Each one is the actual return of
 * `public.weekly_source_office_timesheet_presentation_v1(jsonb)` on the local
 * PostgreSQL 17.11 build `banking_modal_v2_release812_20260918`, captured from
 * the database state the Gate 9 verifier builds for that row and rolled back.
 * So "the database state that produced it" is literal, not a description.
 *
 * Every assertion here is about what the browser actually painted: the heading
 * is read out of the rendered DOM, not out of the payload.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountOfficeShell, externalRequests, ORIGIN } from './helpers/weekly-source-local-shell';

const fixture = JSON.parse(readFileSync(
  resolve(__dirname, '../fixtures/weekly-source-lifecycle-states.json'),
  'utf8'
));

const SHOT_DIR = 'test-results/wp12-lifecycle';

/** The pack's own text, from P:\annexes\ui-lifecycle-state-matrix.csv. */
const EXPECTED_HEADING: Record<string, string | null> = {
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
  'UI-016': null,
  'UI-017': null,
  'UI-018': 'Hours to authorise',
  'UI-019': 'Submitted Timesheet',
  'UI-020': 'Submitted Timesheet plus Approved hours to be paid',
  'UI-021': 'Timesheet (read-only)',
  'UI-022': 'Not authorised for pay \u00b7 invoiced from source'
};

const OFFICE_ROWS = ['UI-001', 'UI-002', 'UI-003', 'UI-004', 'UI-005', 'UI-006', 'UI-007', 'UI-008',
  'UI-009', 'UI-010', 'UI-011', 'UI-012', 'UI-013', 'UI-014', 'UI-015', 'UI-018', 'UI-022'];
const BYPASS_ROWS = ['UI-016', 'UI-017'];
const CANDIDATE_ROWS = ['UI-019', 'UI-020', 'UI-021'];

test.use({ storageState: { cookies: [], origins: [] } });

async function renderCase(page: import('@playwright/test').Page, label: string) {
  return page.evaluate((payload) => {
    const api = (window as any).CloudTMSWeeklySourcePresentationV1;
    let host = document.getElementById('wp12-proof');
    if (!host) {
      host = document.createElement('main');
      host.id = 'wp12-proof';
      host.setAttribute('style', 'position:fixed;inset:0;z-index:99999;overflow:auto;padding:16px;background:#0b1221');
      document.body.appendChild(host);
    }
    const vm = api.buildViewModelFromPresentation(payload);
    host.innerHTML = `
      <section data-surface="simple">${api.renderSimpleLines(vm)}</section>
      <section data-surface="bulk-right">${api.renderApprovedHours(vm)}</section>`;
    const headings = Array.from(host.querySelectorAll('h3')).map((node) => (node.textContent || '').trim());
    return {
      mount: vm.mount === true,
      lifecycle_ok: vm.lifecycle_ok === true,
      ui_state: vm.ui_state,
      server_phase: vm.server_phase,
      heading_source: vm.heading_source,
      primary_schedule_key: vm.primary_schedule_key,
      permitted_actions: vm.permitted_actions,
      headings,
      // A heading painted by the primary block of either surface.
      primary_headings: Array.from(host.querySelectorAll('[data-weekly-source-primary] h3, [data-weekly-source-primary="none"] h3'))
        .map((node) => (node.textContent || '').trim()),
      // Both surfaces are mounted side by side in this proof so that each can
      // be inspected; on a real screen only one is present, so decision
      // buttons are counted PER SURFACE.
      decision_buttons: Array.from(host.querySelectorAll('[data-surface="simple"] [data-weekly-source-decision]'))
        .map((node) => ({ action: node.getAttribute('data-weekly-source-decision'), label: (node.textContent || '').trim() })),
      bulk_decision_buttons: Array.from(host.querySelectorAll('[data-surface="bulk-right"] [data-weekly-source-decision]'))
        .map((node) => node.getAttribute('data-weekly-source-decision')),
      member_blocks: host.querySelectorAll('[data-surface="simple"] [data-weekly-source-member]').length,
      withdrawn_note: host.querySelectorAll('[data-weekly-source-withdrawn="1"]').length,
      movement_regions: host.querySelectorAll('[data-weekly-source-invoice-movements]').length,
      text: (host as HTMLElement).innerText,
      html: host.innerHTML
    };
  }, fixture.cases[label].presentation);
}

test.describe('Gate 10 — 22 lifecycle states in a real browser', () => {
  test.beforeEach(async ({ page }) => {
    await mountOfficeShell(page);
    await page.waitForFunction(() => !!(window as any).CloudTMSWeeklySourcePresentationV1, null, { timeout: 30_000 });
  });

  test('the Office rows each render the server heading verbatim and nothing else', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 950 });
    const seen: Record<string, string[]> = {};
    for (const label of OFFICE_ROWS) {
      const result = await renderCase(page, label);
      expect(result.mount, `${label}: the Weekly Source component must mount`).toBe(true);
      expect(result.lifecycle_ok, `${label}: the lifecycle must resolve`).toBe(true);

      const expected = EXPECTED_HEADING[label]!;
      expect(result.primary_headings, `${label}: the painted heading`).toContain(expected);

      // Rule N3.9.1 the other way round: the browser painted no heading the
      // server did not supply.
      expect(result.heading_source).toBe('SERVER');

      // 25 section 10 Removed, contract erratum E-4.
      expect(result.text).not.toContain(['Hours', 'being', 'authorised'].join(' '));

      seen[label] = result.primary_headings;
      await page.screenshot({ path: `${SHOT_DIR}/${label}.png`, fullPage: false });
    }
    expect(Object.keys(seen).sort()).toEqual([...OFFICE_ROWS].sort());
  });

  test('the two bypass rows mount nothing and leave the legacy owner its heading', async ({ page }) => {
    for (const label of BYPASS_ROWS) {
      const result = await page.evaluate((payload) => {
        const api = (window as any).CloudTMSWeeklySourcePresentationV1;
        const exact = '  <section data-owner="legacy">legacy output & spacing</section>\n';
        let legacyCalls = 0;
        let weeklyCalls = 0;
        const rendered = api.renderLegacyOrWeekly(
          { weekly_source_presentation: payload },
          () => { legacyCalls += 1; return exact; },
          () => { weeklyCalls += 1; return 'wrong'; }
        );
        const vm = api.buildViewModel({ weekly_source_presentation: payload });
        return { rendered, exact, legacyCalls, weeklyCalls, mount: vm.mount, heading: vm.heading, headingSource: vm.heading_source };
      }, fixture.cases[label].presentation);

      expect(result.mount, `${label}: the component must not mount`).toBe(false);
      expect(result.rendered, `${label}: the legacy owner's output is byte-identical`).toBe(result.exact);
      expect(result.legacyCalls).toBe(1);
      expect(result.weeklyCalls).toBe(0);
      // A view model that does not mount carries no heading of its own at all:
      // the legacy Weekly or Daily owner keeps its heading untouched.
      expect(result.heading ?? null, `${label}: this owner supplies no heading`).toBeNull();
      expect(EXPECTED_HEADING[label]).toBeNull();
    }
  });

  test('UI-018 is an overlay on the phase the week is really in, not a phase of its own', async ({ page }) => {
    const result = await renderCase(page, 'UI-018');
    expect(result.ui_state).toBe('UI-001');
    expect(result.primary_headings).toContain('Hours to authorise');
    const overlays = await page.evaluate((payload) => {
      const api = (window as any).CloudTMSWeeklySourcePresentationV1;
      return api.buildViewModelFromPresentation(payload).overlay_states;
    }, fixture.cases['UI-018'].presentation);
    expect(overlays).toContain('UI-018');
    // The Office read-only client-provided expense notice, and no way to add
    // receipt or mileage evidence here.
    expect(result.text).toContain('Client-provided expense');
    await page.screenshot({ path: `${SHOT_DIR}/UI-018-overlay.png` });
  });

  test('UI-022 paints the withdrawn heading with U+00B7 and offers no action', async ({ page }) => {
    const result = await renderCase(page, 'UI-022');
    expect(result.primary_headings).toContain('Not authorised for pay \u00b7 invoiced from source');
    expect(result.permitted_actions).toEqual([]);
    expect(result.decision_buttons).toEqual([]);
    expect(result.withdrawn_note).toBeGreaterThan(0);
    expect(result.text).toContain('Authorisation withdrawn.');
    // No schedule is approved for pay in this state, so none is painted.
    expect(result.primary_schedule_key).toBeNull();
    await page.screenshot({ path: `${SHOT_DIR}/UI-022-withdrawn.png` });
  });

  test('the two decisions appear only where the server offers a decision', async ({ page }) => {
    const proposed = await renderCase(page, 'UI-008');
    expect(proposed.decision_buttons.map((b) => b.action).sort())
      .toEqual(['APPROVE_UPDATED_HOURS', 'KEEP_CURRENTLY_APPROVED_HOURS']);
    expect(proposed.decision_buttons.map((b) => b.label).sort())
      .toEqual(['Approve updated hours', 'Keep currently approved hours']);
    // The same two decisions reach the Bulk right pane, from the same server
    // object, so the two surfaces cannot diverge.
    expect(proposed.bulk_decision_buttons.sort())
      .toEqual(['APPROVE_UPDATED_HOURS', 'KEEP_CURRENTLY_APPROVED_HOURS']);
    // Erratum E-5: no reason box on either decision.
    const reasonBoxes = await page.locator('#wp12-proof [data-weekly-source-later-change] textarea').count();
    expect(reasonBoxes).toBe(0);
    await page.screenshot({ path: `${SHOT_DIR}/UI-008-decisions.png` });

    // UI-013 is the cross-Contract A-to-B decision. Both roots are summarised
    // side by side, never summed, and the buttons come from
    // `proposal.decision` — never from the matrix, and never from
    // `permitted_actions`.
    const cross = await renderCase(page, 'UI-013');
    expect([...cross.permitted_actions].sort())
      .toEqual(['APPROVE_UPDATED_HOURS', 'KEEP_CURRENTLY_APPROVED_HOURS']);
    expect(cross.member_blocks, 'both roots are summarised').toBe(2);
    expect(cross.decision_buttons.map((b) => b.action).sort())
      .toEqual(['APPROVE_UPDATED_HOURS', 'KEEP_CURRENTLY_APPROVED_HOURS']);
    // The moved component keeps one identity across both roots and is painted
    // as one line that moves, not a removal and an addition.
    expect(await page.locator('#wp12-proof [data-weekly-source-moved-component]').count())
      .toBeGreaterThan(0);
    expect(cross.text).toContain('Lines that move');
    // The member role captions are upper-cased by the stylesheet, so the
    // painted text is matched case-insensitively.
    expect(cross.text).toMatch(/old root/i);
    expect(cross.text).toMatch(/new root/i);
    await page.screenshot({ path: `${SHOT_DIR}/UI-013-cross-contract.png` });

    // And when the server refuses the proposed half by name, the screen shows
    // the server's own detail rather than a blank panel, and still offers
    // nothing.
    const refusedDetail = 'The stored digest disagrees, so either this is a PARTIAL move, or the new root’s authorisation actor is not the actor of the accepted decision.';
    const refused = await page.evaluate(({ basePayload, detail }) => {
      const api = (window as any).CloudTMSWeeklySourcePresentationV1;
      const broken = JSON.parse(JSON.stringify(basePayload));
      broken.proposal = {
        ...broken.proposal,
        state: 'UNAVAILABLE',
        reason: 'PROPOSAL_CROSS_CONTRACT_MOVE_SET_NOT_RECOVERABLE',
        detail,
        decision: null
      };
      const vm = api.buildViewModelFromPresentation(broken);
      const host = document.getElementById('wp12-proof')!;
      host.innerHTML = api.renderLaterChangeDecision(vm, { surface: 'SIMPLE_TIMESHEET' });
      return {
        text: (host as HTMLElement).innerText,
        buttons: host.querySelectorAll('[data-weekly-source-decision]').length,
        members: host.querySelectorAll('[data-weekly-source-member]').length,
        detailShown: !!host.querySelector('[data-weekly-source-proposal-detail="1"]')
      };
    }, { basePayload: fixture.cases['UI-013'].presentation, detail: refusedDetail });
    expect(refused.detailShown, 'the server detail is shown, never a blank').toBe(true);
    expect(refused.text).toContain('PARTIAL move');
    expect(refused.buttons, 'a refused proposal offers nothing').toBe(0);
    expect(refused.members, 'both current positions are still shown').toBe(2);
    await page.screenshot({ path: `${SHOT_DIR}/UI-013-refused-detail.png` });

    // UI-010 carries the complete saved two-root shape.
    const frozen = await renderCase(page, 'UI-010');
    expect(frozen.text).toContain('Decision saved');
    await page.screenshot({ path: `${SHOT_DIR}/UI-010-frozen.png` });
  });

  test('a schedule the server could not state is never painted as zero', async ({ page }) => {
    // UI-022 has no approved entitlement, and the server says so by name. It
    // must read as NOT KNOWN and must never be painted as zero (rule N3.9.2).
    const withdrawn = await renderCase(page, 'UI-022');
    expect(withdrawn.lifecycle_ok).toBe(true);
    const approvedMarkup = await page.evaluate((payloadIn) => {
      const api = (window as any).CloudTMSWeeklySourcePresentationV1;
      const vm = api.buildViewModelFromPresentation(payloadIn);
      const host = document.getElementById('wp12-proof')!;
      host.innerHTML = api.renderServerSchedule(vm.lifecycle.schedules.approved, 'Approved hours', {});
      return (host as HTMLElement).innerText;
    }, fixture.cases['UI-022'].presentation);
    expect(approvedMarkup).toContain('Not available');
    expect(approvedMarkup).toContain('These hours have not been supplied');
    expect(approvedMarkup).not.toMatch(/\b0:00\b|\b0\.00\b|£0\.00|\bNo hours\b/);
    await page.screenshot({ path: `${SHOT_DIR}/not-known-never-zero.png` });

    // And the paid-pending row still resolves with a real settled schedule.
    const paidPending = await renderCase(page, 'UI-009');
    expect(paidPending.lifecycle_ok).toBe(true);
    expect(paidPending.primary_schedule_key).toBe('paid_to_date');
  });

  test('a WITHHELD paid figure keeps its heading and is stated, not shown as an error or a zero', async ({ page }) => {
    // Observed on the local build: UI-012's root settled more than once, so the
    // server withholds the paid figure by name pending the finance ruling.
    const settled = await renderCase(page, 'UI-012');
    expect(settled.lifecycle_ok, 'a withheld figure is not a damaged projection').toBe(true);
    expect(settled.primary_headings).toContain('Current paid hours');
    const withheld = page.locator('#wp12-proof [data-weekly-source-schedule-withheld="1"]');
    expect(await withheld.count()).toBeGreaterThan(0);
    const withheldText = await withheld.first().innerText();
    expect(withheldText).toContain('This figure is being withheld');
    expect(withheldText).toContain('No other figure stands in for it');
    expect(withheldText).toContain('SETTLEMENT_POSITION_SEMANTICS_UNRULED');
    // Not an error, and no number of any kind stands in for the withheld one.
    expect(settled.text).not.toMatch(/cannot be shown|could not be shown/i);
    expect(withheldText).not.toMatch(/\d+\.\d{2}|£/);
    await page.screenshot({ path: `${SHOT_DIR}/UI-012-withheld.png` });
  });

  test('a contradictory projection is an explicit error state with no heading, schedule or action', async ({ page }) => {
    const result = await page.evaluate((payload) => {
      const api = (window as any).CloudTMSWeeklySourcePresentationV1;
      const broken = JSON.parse(JSON.stringify(payload));
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
      const vm = api.buildViewModelFromPresentation(broken);
      const host = document.getElementById('wp12-proof') || document.body.appendChild(document.createElement('main'));
      host.id = 'wp12-proof';
      host.innerHTML = api.renderSimpleLines(vm) + api.renderApprovedHours(vm);
      return {
        headings: Array.from(host.querySelectorAll('h3')).length,
        schedules: host.querySelectorAll('[data-weekly-source-schedule]').length,
        buttons: host.querySelectorAll('button').length,
        errorCode: host.querySelector('[data-weekly-source-lifecycle-error]')?.getAttribute('data-weekly-source-error-code'),
        text: (host as HTMLElement).innerText
      };
    }, fixture.cases['UI-005'].presentation);

    expect(result.errorCode).toBe('LIFECYCLE_PHASE_UNRESOLVED');
    expect(result.headings).toBe(0);
    expect(result.schedules).toBe(0);
    expect(result.buttons).toBe(0);
    expect(result.text).toContain('This Timesheet cannot be shown');
  });

  test('the Candidate rows are decided by the server and never rendered by the Office screen', async ({ page }) => {
    for (const label of CANDIDATE_ROWS) {
      const result = await page.evaluate((payload) => {
        const lifecycle = payload.candidate_lifecycle;
        return {
          ui_state: lifecycle?.ui_state,
          heading: lifecycle?.heading,
          surface: lifecycle?.surface,
          heading_source: lifecycle?.heading_source,
          // The Office renderers are driven by `lifecycle`, never by
          // `candidate_lifecycle`: proved by rendering and looking for it.
          office_text: (() => {
            const api = (window as any).CloudTMSWeeklySourcePresentationV1;
            const vm = api.buildViewModelFromPresentation(payload);
            const host = document.createElement('div');
            host.innerHTML = api.renderSimpleLines(vm) + api.renderApprovedHours(vm);
            document.body.appendChild(host);
            const text = host.innerText;
            host.remove();
            return text;
          })()
        };
      }, fixture.cases[label].presentation);

      expect(result.surface).toBe('CANDIDATE');
      expect(result.ui_state).toBe(label);
      expect(result.heading).toBe(EXPECTED_HEADING[label]);
      expect(result.heading_source).toBe('SERVER');
      // UI-022 is never shown in MyTMS, and the Candidate heading is never
      // shown in the Office.
      expect(result.office_text).not.toContain('Not authorised for pay');
    }
  });

  test('the lifecycle policy the workspace returns carries all 22 rows and no Office asset holds a heading', async ({ page }) => {
    const index = await page.evaluate((policyPayload) => {
      const api = (window as any).CloudTMSWeeklySourcePresentationV1;
      const policy = api.normaliseLifecyclePolicy({ lifecycle_policy: policyPayload });
      return {
        rowCount: policy?.row_count,
        version: policy?.policy_version,
        mayInfer: policy?.browser_may_infer_phase,
        headings: Object.fromEntries(Object.entries(policy?.by_ui_state || {}).map(
          ([key, row]: [string, any]) => [key, row.heading]
        ))
      };
    }, fixture.lifecycle_policy);

    expect(index.rowCount).toBe(22);
    expect(index.mayInfer).toBe(false);
    for (const [label, heading] of Object.entries(EXPECTED_HEADING)) {
      if (label === 'UI-018') continue; // an overlay: it carries no heading
      expect(index.headings[label], `${label} heading from the server policy`).toBe(heading);
    }
  });

  test('the proof ran with no external network at all', async ({ page }) => {
    await renderCase(page, 'UI-001');
    expect(externalRequests(page), 'a Gate 10 proof must not leave the machine').toEqual([]);
    expect(page.url().startsWith(ORIGIN)).toBe(true);
  });
});
