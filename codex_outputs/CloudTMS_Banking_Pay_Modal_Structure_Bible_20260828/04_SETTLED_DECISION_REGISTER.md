# Settled decision register

Every decision below is closed. Implementation may not reopen it without a recorded product-level deviation and explicit user approval.

## Main modal

| Decision | Settled answer |
| --- | --- |
| Main table shape | Exactly one physical, non-wrapping row per candidate. |
| Visible columns | Exactly four: Include, Candidate, Deductions, Ready to pay. |
| Checkbox placement | Dedicated narrow Include column on the far left. |
| Candidate display | Name and canonical reference on the same physical line. |
| Main expansions | None. No child rows, cards or expandable payment details. |
| Details button | None. Double-click non-interactive row area only. |
| Keyboard-opening addition | Do not invent one as part of this redesign. |
| Candidate page size | 100 candidates. |
| Default sort | Candidate A–Z. |
| Sort authority | Server sorts the complete filtered result before pagination. |
| Sortable headers | Candidate, Deductions and Ready to pay. Include remains the global selection control. |
| Candidate search | No new display-only search. |
| Filters | Preserve pay date, week cutoff, Candidate, Client and ALL/PAYE/Umbrella with current Draft semantics. |
| Main Timesheets location | Compact shortcut immediately beside Ready to pay; no Timesheets column. |

## Selection and amounts

| Decision | Settled answer |
| --- | --- |
| Candidate checkbox states | Checked/all, indeterminate/some, unchecked/none across the candidate's complete selectable Ready scope. |
| Candidate with Ready payments but none selected | Keep row, ordinary unchecked box, £0.00, Deductions dash and disabled Timesheets icon. |
| Candidate with no selectable Ready payment | Exclude from main table; do not show a persistent disabled candidate checkbox. |
| Candidate-wide selection | One atomic server operation over all candidate Ready pages. Never browser fan-out. |
| Main header checkbox | Retain current all-pages Ready select/clear authority. |
| Candidate amount | Sum of the candidate's currently selected, selectable/draftable effective Ready display amounts. |
| Headline | Sum of all candidate amounts over the complete active candidate result across all pages. |
| PAYE net | Irrelevant pre-Draft; entered after Draft creation. |
| Browser financial arithmetic | Prohibited. Browser formats server decimals only. |
| Deductions | `Yes` if at least one selected canonical Ready deduction contributes; otherwise `—`. |
| Deduction amount column | None. Full detail is in Candidate Banking. |

## Timesheets

| Decision | Settled answer |
| --- | --- |
| Main shortcut scope | Exact distinct Timesheets linked to currently selected effective Ready payments only. |
| Unticked payment Timesheets | Ignored. |
| Shared selected/unselected Timesheet ID | Include once because a selected payment links it. |
| Broad candidate Timesheet search | Prohibited. |
| No selected Timesheet | Visibly present disabled icon. |
| Exact tooltip | `No Ready Timesheet is linked to this candidate's selected payments.` |
| Modal behaviour | Preserve current Timesheets summary update without closing Banking Pay. |
| Other views | Exact Timesheet shortcut remains in Candidate Banking payment/group rows, Action Required detail and Blocked detail where applicable. |

## Candidate Banking

| Decision | Settled answer |
| --- | --- |
| Scope | One candidate, effective Ready only, filtered in the database before pagination. |
| Page size | Maximum/default 100 Ready items. |
| Cases/Action Required | Excluded. |
| Updating | Excluded. |
| Blocked | Excluded. |
| Indefinite snoozes | Excluded. |
| Existing detail | Retain every current Ready field, grouping, breakdown and action. |
| Local expansion | Allowed only inside Candidate Banking. |
| Live updates | Mutations settle selection, amounts, deductions, headline and section movement at one accepted revision. |
| Closing | Restore exact main page, sort, filters, scroll and focus with already updated row state. |

## Action Required, Updating, Blocked and Snoozes

| Decision | Settled answer |
| --- | --- |
| Cases / Resolutions name | Rename to Action Required. |
| Action Required meaning | A person can and must do something now. |
| Shared issue count | One underlying problem is one task; detail lists every affected candidate/payment/component/Timesheet. |
| Updating | Queued/pending/running CloudTMS work; separate count/state, not Action Required or Blocked. |
| Blocked meaning | Passive nonselectable payment with no immediate safe human action. |
| Insufficient deduction wording | `Insufficient funds to deduct`. |
| Dated snooze/on hold | Blocked where current policy shows it in Banking Pay. |
| Indefinite snooze | Snoozes tab only, absent from every Banking Pay row/count/amount/message. |
| Main controls | Permanent Action Required and Blocked for Pay buttons; Updating shown separately when nonzero. |

## Safety and lifecycle

| Decision | Settled answer |
| --- | --- |
| Economics | Unchanged. |
| Draft owner/path | Existing `pay_workbench_prepare_draft` authority; no second Draft path. |
| Recovery | Existing partitions, order, headroom/available-funds calculations and revalidator unchanged. |
| Post-Draft | Frozen authority and every later lifecycle unchanged. |
| Fallback | Complete legacy UI retained until full v2 TEST proof. |
| Activation | No partial simplified interface. All moved views/actions must be complete first. |
| Implementation isolation | Use clean current-head worktrees; preserve unrelated dirty user changes. |

## Approved technical amendment — open breakdown response

DEV-0007 was expressly approved by the user on 28 August 2026: `YES AND CONTINUE`. A selection reply may carry one already-open Candidate Banking Ready page within its existing 256/512 KB limits, alongside the base 16/32 KB reply (combined 272/544 KB preferred/investigation bounds). No additional automatic request or relaxation of speed, memory, complete-detail, same-revision, financial or Create Draft requirements is approved. Main-only replies retain their original smaller limits. See documents 10 and 17 for the executable boundary.

## Superseded proposals that must not return

- A Timesheets column in the main table.
- Checkbox embedded inside Candidate instead of a dedicated Include cell.
- All Ready Timesheets in the main shortcut.
- A new display-only candidate search.
- A View breakdown button or Actions column.
- A new keyboard-opening product requirement.
- Gross/Net/VAT/ERNI/PAYE/Umbrella/deduction-amount main columns.
- Main-row expansion or responsive cards.
- Visible-page sorting or totals.
- Candidate selection implemented as repeated row requests.
- Client-side removal of non-Ready child rows after pagination.
- Indefinite snooze counts/messages in Banking Pay.
- `Insufficient recovery headroom` or other technical user wording.
- Browser financial equations.
