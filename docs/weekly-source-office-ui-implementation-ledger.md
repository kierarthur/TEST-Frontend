# Weekly Source Office UI implementation ledger

Status: frontend implementation complete against a server-owned contract; backend projection and command ownership is still required.

This ledger covers only the Office frontend. It does not authorise or describe changes to Banking Pay, the payment Workbench, MyTMS, deployment, or the Weekly Source import/finalisation service.

## 1. Normative frontend contract

The only read projection understood by the new rendering layer is the top-level property `weekly_source_presentation` whose value validates against:

- `docs/weekly-source-office-presentation-v1.schema.json`
- contract name `WEEKLY_SOURCE_OFFICE_PRESENTATION_V1`
- scope `WEEKLY`
- freshness `CURRENT`

The executable examples are in `tests/fixtures/weekly-source-presentation-v1.json`:

| Fixture | Route proved | Special state |
|---|---|---|
| `nhspMatch` | `NHSP` | complete match |
| `clientSourceMismatch` | `CLIENT_PROVIDED_HOURS` | source/submitted mismatch |
| `clientSourceNoTimesheet` | `CLIENT_PROVIDED_HOURS` | no submitted Timesheet |
| `clientSourceProtected` | `CLIENT_PROVIDED_HOURS` | Office-approved hours and all permitted later choices |
| `clientSourceSuppliedExpense` | `CLIENT_PROVIDED_HOURS` | same-root source-supplied expense |
| `clientSourceSuppliedExpenseZeroHours` | `CLIENT_PROVIDED_HOURS` | same-root source-supplied expense with zero source hours |
| `timesheetCheckedWaiting` | `TIMESHEETS_CHECKED_WITH_CLIENT` | signed Timesheet incomplete |
| `timesheetCheckedMismatch` | `TIMESHEETS_CHECKED_WITH_CLIENT` | signed Timesheet is authority; client hours are check-only |
| `ordinaryWeekly` | no projection | exact legacy pass-through |
| `daily` | no projection | exact legacy pass-through |

The canonical route keys are exactly:

1. `NHSP`
2. `CLIENT_PROVIDED_HOURS`
3. `TIMESHEETS_CHECKED_WITH_CLIENT`

The fourth Bulk category, `STANDARD_TIMESHEETS`, deliberately has no Weekly Source projection route. It remains owned by the existing renderer. There is no `CLIENT_SOURCE` or singular `TIMESHEET_CHECKED_WITH_CLIENT` alias in the sealed contract.

The presentation contains only display-ready hours, breaks, additional units, comparison state, four display-ready totals, action permissions, and opaque action identity. The browser does not decide which hours are authoritative, calculate money, calculate VAT, compare rates, resolve rounding, or decide which command is available.

## 2. Exact read locations and call sites

The backend must include the same current `weekly_source_presentation` object in all three existing reads below. A source record must not move between categories or change authority between the list, context, and detail responses.

| Existing read | Frontend call site | Required placement |
|---|---|---|
| `GET /api/timesheets/bulk-authorise-dataset` | `fetchBulkAuthoriseDataset` in `js/main.js` | each returned row: `row.weekly_source_category` plus `row.weekly_source_presentation` |
| `GET /api/timesheets/:id/bulk-authorise-context` | `fetchBulkAuthoriseContext` in `js/main.js` | current row/context/detail object must carry `weekly_source_presentation` |
| `GET /api/timesheets/:id/details` | `fetchTimesheetDetails` in `js/main.js` | top-level `weekly_source_presentation` |

The Bulk dataset request always includes:

```text
weekly_source_category=NHSP
weekly_source_category=CLIENT_PROVIDED_HOURS
weekly_source_category=TIMESHEETS_CHECKED_WITH_CLIENT
weekly_source_category=STANDARD_TIMESHEETS
```

Only one of those values is sent on a request. The existing `classification` compatibility query remains:

| Weekly category | Existing classification sent |
|---|---|
| `NHSP` | `NHSP` |
| `CLIENT_PROVIDED_HOURS` | `HR` |
| `TIMESHEETS_CHECKED_WITH_CLIENT` | `TIMESHEETS` |
| `STANDARD_TIMESHEETS` | `TIMESHEETS` |

All existing filters are still sent. The dataset may also return `counts.by_weekly_source_category` with a non-negative integer for each canonical category. Those server counts are displayed; the browser does not invent cross-category counts from a filtered response.

## 3. Exact command boundary

The new Office action surface posts only to:

```http
POST /api/weekly-source/v1/commands
Content-Type: application/json
```

The envelope is exactly:

```json
{
  "action": "AMEND_PROTECTED_HOURS",
  "payload": {
    "source_cycle_id": "source-cycle-2026-09-13",
    "candidate_id": "candidate-1",
    "client_id": "client-1",
    "contract_id": "contract-1",
    "week_ending_date": "2026-09-13",
    "work_event_id": "work-event-fri",
    "evidence_timesheet_id": "timesheet-1",
    "work_date": "2026-09-11",
    "start_at_local": "06:00",
    "end_at_local": "16:00",
    "break_minutes": 45,
    "reason": "Worker corrected the submitted hours.",
    "idempotency_key": "browser-generated-unique-value",
    "expected_record_version": "client-protected-v1"
  }
}
```

The action-specific payload allow-list is enforced in `buildApprovedHoursCommand`:

| Action | Required server identity | Browser-editable fields |
|---|---|---|
| `APPROVE_PROTECTED_HOURS` | source cycle, candidate, client, contract, week; optional work event/evidence Timesheet | work date, start, finish, break, reason |
| `AMEND_PROTECTED_HOURS` | source cycle, candidate, client, contract, week; optional work event/evidence Timesheet | work date, start, finish, break, reason |
| `WITHDRAW_PROTECTED_HOURS` | family and work event | reason only |
| `WAIT_FOR_SOURCE` | family and work event | work date, start, finish, break, reason |
| `ACCEPT_SOURCE_AND_RECONCILE` | family and work event | reason only |
| `RECORD_NOT_WORKED` | family and work event | reason only |

Every command also receives a browser-generated `idempotency_key` and the exact `expected_record_version` supplied by the server. The browser cannot add money, rates, target entitlement, C1 facts, Banking identifiers, or finalisation facts.

Expected response:

```json
{
  "ok": true,
  "outcome": "UPDATED",
  "record_version": "next-version",
  "presentation": {}
}
```

`record_version` and `presentation` are optional. On success the UI closes the child modal and refetches the authoritative details/context. On HTTP 409 it does the same refetch and tells the user to review the changed Timesheet. It does not apply an optimistic economic result.

The UI mounts `Manage approved hours` only when:

```text
action_state.manage_approved_hours_allowed = true
```

and `action_state.manage_approved_hours` is present, current, uses the exact endpoint, and supplies the server-owned action list and identity payload described by the schema. Any contradiction fails closed.

`FINALISE_WEEK` is intentionally not accepted or rendered anywhere in the Timesheet panes. Finalisation belongs to the Weekly Source import workspace and its backend owner.

## 4. Requirements-to-code-and-test trace

| ID | Locked requirement | Implementation owner | Deterministic proof |
|---|---|---|---|
| OFF-01 | Four clear Bulk categories in one familiar modal | `CATEGORIES`, category session/filter wiring in `js/main.js` | unit: exact category contract; Playwright category tab assertions |
| OFF-02 | Ordinary Weekly and Daily remain unchanged | `buildViewModel`, `renderLegacyOrWeekly`, guarded integration in `js/main.js` | unit + Playwright byte-for-byte legacy pass-through |
| OFF-03 | Client-source match shows source hours only in Bulk middle pane | `renderBulkHoursPane` | unit complete-match test |
| OFF-04 | Client-source mismatch shows all source hours and only affected submitted dates | `renderBulkHoursPane` | unit + Playwright mismatch tests |
| OFF-05 | Signed Timesheet remains hours authority; client data is check-only | signed-authority branch in `renderBulkHoursPane` and `renderSimpleLines` | unit + Playwright Timesheet-authority tests |
| OFF-06 | Incomplete signed Timesheet is not eligible | server `authorise_allowed` intersection and waiting presentation | unit + Playwright incomplete test |
| OFF-07 | Right pane shows hours being authorised | `renderApprovedHours` | unit + Playwright approved schedule tests |
| OFF-08 | Four totals are server-owned and complete or authorisation fails closed | `normaliseTotals`, `renderFourTotals` | unit incomplete-total and exact-label tests |
| OFF-09 | Source-supplied expense remains same Weekly root, even with zero hours | `source_expense_policy`, `renderSourceExpenseContext`, guarded Expenses tab | unit + Playwright normal and zero-hour source-expense tests |
| OFF-10 | No receipt, mileage or separate-expense action on source-supplied root | `renderTimesheetExpensesTab`, `add_additional_expense_timesheet_allowed` gate | unit + Playwright no-control assertions |
| OFF-11 | All other source/client expenses use the existing separate additional expense Timesheet | existing `create-expense-sheet` owner retained; server action gate | preservation tests + static owner test |
| OFF-12 | Queue/Attached, Upload, Attach, evidence kind, thumbnails, X, full preview, Previous/Next remain | existing `renderBulkAuthoriseEvidencePane` and binders remain the Files owner | full frontend unit suite; existing evidence suites |
| OFF-13 | Reject candidate submission and per-category expense rejection remain separate | existing Candidate Office module/routes untouched | full frontend unit suite; existing rejection suites |
| OFF-14 | Existing Authorise/Unauthorise remain and source policy may narrow, never widen | permission intersection in Simple/Bulk | static integration test + full suite |
| OFF-15 | Select/clear all is one far-left header checkbox; no planned buttons | section-header checkbox + reusable table-header helper | unit + Playwright checkbox/indeterminate/sticky tests |
| OFF-16 | Continuous scroll and sticky table headings | existing section scrollers + `weekly-source-presentation-v1.css` | Playwright computed-style/responsive checks |
| OFF-17 | Approved hours can be add/amend/remove/wait/use-source/not-worked only as server permits | strict action projection and canonical command builder | unit action/payload tests + Playwright dialog test |
| OFF-18 | No technical/internal language in visible copy | dedicated presentation renderer | unit and Playwright forbidden-copy checks |
| OFF-19 | Source route is read-only; manual fields remain standard-route only | guarded render mount; legacy path untouched | full frontend unit suite + legacy pass-through |
| OFF-20 | Reference-before-pay setting is visible for Weekly Roster Timesheet authority, defaults false, and remains hidden for no-Timesheet source authority | existing settings UI normalization corrected in `js/main.js` | `weekly-timesheet-authority-settings.test.cjs` |
| OFF-21 | Stale/malformed/contradictory projection fails closed | strict normalisation and version checks | unit stale/malformed/action-contract tests |
| OFF-22 | Child action returns to the exact Simple/Bulk owner and refreshes after success/conflict | refresh helpers in `js/main.js` | static integration test; command Playwright rendering proof |

## 5. Existing mutation routes deliberately preserved

These are existing owners, not new Weekly Source commands:

| Capability | Existing route |
|---|---|
| Bulk authorise | `POST /api/timesheets/bulk-authorise-selected` |
| Bulk unauthorise | `POST /api/timesheets/bulk-unauthorise-selected` |
| Simple authorise | `POST /api/timesheets/:id/authorise` |
| Simple unauthorise | `POST /api/timesheets/:id/unauthorise` |
| Additional expense Timesheet | `POST /api/contract-weeks/:weekId/create-expense-sheet` |
| Evidence list/create | `GET/POST /api/timesheets/:id/evidence` |
| Evidence delete | `DELETE /api/timesheets/:id/evidence/:evidenceId` |
| Evidence return to Queue | `POST /api/timesheets/:id/evidence/:evidenceId/return-to-queue` |
| Candidate-submission reject preview | `GET /api/candidate-app/timesheets/:id/reject-preview` |
| Candidate-submission reject | `POST /api/candidate-app/timesheets/:id/reject` |

No existing route is repurposed to perform Weekly Source reconciliation.

## 6. Bound versus outstanding

Frontend bound now:

- contract normalisation, fail-closed rendering, category switching and category-scoped reads;
- Simple and Bulk source views;
- existing Files/evidence owner preservation;
- source-expense restrictions and same-root display;
- approved-hours modal and exact command envelope;
- success/conflict refetch;
- tests and fixtures.

Backend outstanding and required before end-to-end acceptance:

1. Populate the identical current projection on all three reads in section 2.
2. Return canonical category keys, not aliases.
3. Return cross-category counts if counts are wanted on inactive category tabs.
4. Implement `POST /api/weekly-source/v1/commands` with the exact action/payload/version/idempotency contract.
5. Enforce every permission and financial/source rule server-side; frontend visibility is not authority.
6. Implement/retain the separate Weekly Source import/finalisation workspace and commands. This Timesheet-pane implementation deliberately has no finalisation command.

There is no frontend dependency on a Banking Pay endpoint, Workbench endpoint, C1 projection, pay-rate input, charge-rate input, or browser-side financial calculation.

## 7. Verification record

Run from the isolated frontend worktree:

- JavaScript syntax: `js/main.js` and `js/weekly-source-presentation-v1.js` passed.
- All frontend unit tests: passed after preserving two legacy static contracts found by the first full run.
- Focused Weekly Source unit/integration/settings tests: passed.
- Focused Playwright browser tests: passed, including desktop, narrow layout, legacy pass-through, mismatch, Timesheet authority, approved-hours action, same-root source expense, and zero-hour source expense.
- `git diff --check`: passed.

