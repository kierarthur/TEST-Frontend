# CloudTMS Banking Pay Bible

## 1. Status and purpose

This is the mandatory behavioural rulebook for CloudTMS Banking Pay.

Read this document in full before investigating, planning, editing, testing, publishing, installing, or deploying any change involving:

- Banking Pay or its modal;
- Workbench sessions, builds, previews, selection, cases, or resolutions;
- timesheet payments, loans, snoozes, overpayments, or recoveries;
- pay-channel or rate resolution;
- Draft creation, execution, cancellation, payment, settlement, or remittance.

This document records business and safety invariants. It is not permission to mutate data, deploy, or change policy. Current source, installed TEST definitions, and live read-only evidence must still be rechecked before every implementation.

If code, a test, a handover, or an existing screen conflicts with this Bible, do not guess which is right. Stop the affected change, identify the precise conflict, preserve the existing economic authority, and obtain an explicit policy decision if the conflict cannot be resolved from current authoritative evidence.

## 2. Change-control protocol

Every Banking Pay change must follow this order:

1. Re-fetch or otherwise establish the latest repository authority without discarding unrelated local work.
2. Confirm the exact TEST project, current Workbench session/build authority, installed database definitions, and deployed frontend/backend versions relevant to the issue.
3. Trace the behaviour end to end: source truth, build facts, preview publication, effective-section routing, frontend state adoption, user action, Draft boundary, and post-Draft consumer.
4. Classify the defect before editing: economics, identity, routing, presentation, state adoption, performance, or deployment parity.
5. Define the smallest owner boundary. Do not change an economic owner to solve a presentation problem.
6. State which Bible rules the change touches and how Policy X drift is prevented.
7. Add focused executable regression tests for the affected rule and its adjacent invariants.
8. Test current source locally and test the actual patched asset/installed definition, not an older deployed asset.
9. For live TEST mutations, use only explicit user authority, bounded identifiers, before/after evidence, and collision coordination.
10. Update this Bible only when a rule is newly approved, clarified, or independently proved. Never rewrite history to conceal a failed attempt.

No implementation may make one section look correct by corrupting another section, weakening a fence, inventing a fallback, duplicating an economic line, or forcing a full modal rebuild as a substitute for correct in-memory adoption.

## 3. Policy X — immutable financial boundary

Policy X applies to all Banking Pay work:

- Before a Draft is created, Banking Pay may use current live truth through the established Workbench authorities.
- After a Draft is created, all financial behaviour must use the frozen batch/Draft artifacts. Live finance truth must not replace or reinterpret those artifacts.
- `TS_DAY` remains date-bucketed as `YYYY-MM-DD`.
- Do not introduce a new economic-key derivation ladder.
- Do not introduce post-Draft live finance-component identity fallback.
- Do not bypass central freshness, staleness, fingerprint, digest, or ownership validation.
- Do not change provider, execution, settlement, remittance, cancellation, reversal, VAT, ERNI, rate, or allocation policy unless the user explicitly authorises that policy change.
- Presentation and frontend fixes must not recalculate financial amounts.

## 4. Core ownership model

### 4.1 Economic authority

The database owns financial amounts, eligibility, recoverability, selection authority, and effective preview section. The frontend displays that authority and sends bounded user intent; it must not invent amounts, eligibility, resolution family, or headroom.

### 4.2 Physical and economic identity

Economic identity and physical component identity are separate fences.

- Economic rows may contain more than one physical component.
- A `TS_DAY` economic key may contain DAY, NIGHT, SAT, SUN, BH, and arbitrary additional-rate components.
- Arbitrary additional-rate codes are independent identities. They must not be collapsed merely because they share an `ADDITIONAL` category.
- Two different additional codes may carry different rates.
- The same normalized additional identity with conflicting rates must fail closed through the typed multiple-rate contract.
- Physical baseline and reservation amounts come from sealed facts by exact physical or structural identity. Ambiguous multi-bucket economics must fail closed; they must not be proportionally allocated.

### 4.3 Effective section versus physical storage section

A row may retain an immutable physical storage section while a certified pre-Draft overlay determines its current effective presentation section.

The UI must use the canonical effective-section owner. Do not physically move or rewrite certified source rows merely to change whether the row appears in Ready to Pay, Cases / Resolutions, or Blocked for Pay.

## 5. One-effective-section rule

At a single authoritative Workbench revision, one economic/physical preview identity may appear in only one user-visible section:

- Ready to Pay;
- Cases / Resolutions;
- Blocked for Pay;
- or an intentionally hidden/internal section.

The same effective identity must never be rendered simultaneously in two sections. Compatibility aliases and page caches are alternate views of the same authority, not independent sources that may accumulate rows.

When an action changes a row's effective section, the open modal must adopt the new authority atomically:

- remove the identity from every stale alias and old section;
- insert it once into the new section;
- update counts, totals, selection state, badges, and actions from the same revision;
- preserve unaffected candidates and rows;
- keep the modal open unless the user closes it.

Closing and reopening the modal must never be required to make a completed server transition visible.

## 6. Ready to Pay

Ready to Pay contains only currently eligible, effective Ready rows.

### 6.1 Positive ordinary payments

- A positive timesheet payment may be selected for a Draft when all current eligibility and freshness checks pass.
- Unticking a positive row removes it from the selected positive headroom used by recovery allocation.
- Unticked positive rows may remain visible as Ready but must not count toward the Draft or selected recovery headroom.

### 6.2 Negative overpayment recoveries

A negative recovery may appear in Ready to Pay only when current selected positive pay for the same recovery partition provides recoverable headroom.

The established partition is candidate and pay channel. Headroom must not cross candidates or pay channels.

- Selected positive ordinary pay creates headroom.
- A negative recovery never creates headroom.
- Recovery is capped by both the outstanding/nominal recovery amount and remaining selected positive headroom.
- Full recovery is allowed when enough headroom exists.
- Partial recovery is allowed when only part of the outstanding amount can be deducted.
- Earlier eligible recoveries consume headroom in the established deterministic recovery order; later recoveries may be partial or blocked.
- A Ready recovery displays the amount actually recoverable in this pay run as a negative amount.
- A Ready recovery must be selected/draftable only to the extent allowed by the canonical server authority.

The frontend must not keep a recovery in Ready after its selected positive headroom becomes zero.

## 7. Recovery headroom and selection mutations

Any change to selected positive pay can change same-candidate recovery amounts and sections. Therefore every individual, grouped, page-wide, or global selection mutation must:

1. send the bounded selection intent to the current Workbench session;
2. allow the canonical server revalidator to recompute recovery headroom;
3. reload both Ready and Blocked authorities for the same resulting session revision;
4. atomically replace the affected identities across all frontend aliases;
5. rerender once from the reconciled state.

It is incorrect to:

- refresh only Ready;
- refresh only Blocked;
- render between two section reads as though each were a complete state;
- merge new rows without evicting identities that departed the old section;
- preserve a stale Ready alias because a fresh Ready page no longer contains the moved row;
- require a modal close/reopen to obtain the correct placement.

### 7.1 Zero headroom

When selected positive headroom is zero:

- recoverable this pay run is `0.00`;
- the recovery is not selectable;
- it is not Draft-eligible;
- its effective section is Blocked for Pay;
- the outstanding recovery remains financially intact for a future pay run.

The row must not appear in Ready to Pay merely because the underlying recovery exists.

### 7.2 Current verified open defect — 17 August 2026

Status: **OPEN — presentation/state-adoption defect; economics verified correct.**

Observed sequence:

1. The user unticked all relevant positive payments in an already-open Banking Pay modal.
2. TEST persisted the positive rows as unselected.
3. TEST recomputed selected positive headroom to exactly zero.
4. All four inspected James recovery rows became `0.00` recoverable, non-selectable, non-draftable, and effectively `blocked_for_pay`.
5. The still-open modal temporarily retained the old Ready placement.
6. Closing and reopening the modal rebuilt state from current server authority and showed the recoveries correctly under Blocked for Pay.

Conclusion: the financial/headroom rule is operating correctly. The remaining defect is that the open frontend state does not always atomically evict the departed recovery identities from every Ready alias after the selection mutation. This must be fixed in the selection-result/section-page adoption boundary without changing recovery economics, resolution authority, or Policy X.

Required regression: in one continuously open modal, select positive pay, observe eligible recovery in Ready, untick the positive pay, and prove the recovery leaves Ready and appears once in Blocked without closing/reopening. Re-selecting sufficient positive pay must promote the permitted full/partial recovery back to Ready once, again without reopening.

## 8. Blocked for Pay

Blocked for Pay contains rows that cannot currently proceed to the selected Draft but do not require an actionable user resolution.

For an overpayment recovery blocked only by insufficient selected positive funds:

- line type: `OVERPAYMENT RECOVERY`;
- supporting label: `No available funds to recover this yet.`;
- Amount shows the nominal/outstanding amount due for recovery, not a misleading `£0.00` recoverable value;
- explanatory text: `No recovery can be made because there are no available funds to deduct from this pay run.`;
- State: `Insufficient funds`;
- do not show a generic `This case is currently blocked and needs review...` message;
- do not show meaningless channel text such as `UMBRELLA • NONE` beneath the state.

Blocked-for-insufficient-funds is not a resolution case. When sufficient selected positive headroom later exists, the canonical revalidator may promote a full or partial recovery to Ready to Pay.

Negative ordinary presentation-only timesheet rows may also be blocked under their existing policy. They must not be confused with an actionable pay-channel/rate resolution, and they must not duplicate a Cases / Resolutions identity.

## 9. Cases / Resolutions

Cases / Resolutions contains only current actionable cases for which the user can perform the displayed resolution action.

- A row must not be routed here merely because it is blocked by insufficient funds.
- A row requiring pay-channel conversion/restructure belongs here until resolved or explicitly excluded through the canonical action.
- Once its required resolution is satisfied, the case must disappear from Cases / Resolutions in the same open modal and its effective payment/recovery row must appear in the appropriate section exactly once.
- If a saved resolution becomes stale, the server must reject it without writing a replacement based on stale evidence.

For a pay-channel resolution case, presentation must state the real source and target direction rather than `CHANNEL • NONE`. Approved compact direction labels are:

- `PAYE>UMBR`
- `UMBR>PAYE`

The Amount area must show the relevant channel-owned amount and explain that the current amount is determined under the source channel but requires resolution to the target channel. Do not present `£0.00` as though no financial amount exists when the case actually concerns a non-zero outstanding/restructured amount.

## 10. Rate resolution

- DAY, NIGHT, SAT, SUN, BH, and every arbitrary additional-rate identity save independently.
- Multiple physical components may sit beneath one `TS_DAY` economic key without blending their rates.
- Resolving one component must not silently resolve a different component unless the user explicitly confirms the server-provided matching-timesheet scope.
- The matching-timesheet option may apply the same compatible resolution to other eligible physical components, but unrelated candidates and ineligible components must not rebuild or change.
- The save boundary binds current row-backed evidence through source basis fingerprint, source family, bucket, economic key, units, and rates. Do not claim the save RPC literally compares fields it does not consume.
- Resolved Ready timesheet rows must expose `Cancel Resolved Rate` when the canonical clear action is valid.
- Cancel must restore the actionable case without deleting unrelated resolution evidence or altering finance economics.

Known boundary as of 17 August 2026: cancelling saved resolved-rate timesheet cases has been exercised separately. Extending cancellation to other resolved financial families is a distinct investigation/implementation and must not change the working timesheet cancellation authority.

## 11. Resolved financial-case cancellation

Every resolved case category should be cancellable only through its canonical saved-resolution ownership and clear action. The frontend must not infer that every resolved item belongs to the BUCKETED timesheet family.

For overpayment/restructure and other financial cases:

- publish and consume the actual saved resolution family and owner;
- expose a cancel action only when the canonical backend says the exact resolution is clearable;
- clear only that resolution identity;
- preserve the already-working resolved-rate/timesheet cancellation path;
- after cancellation, return the item to its correct actionable section in the same modal;
- never reinterpret the economic amount or create a new pay-channel decision in the frontend.

Status as of 17 August 2026: broader resolved-financial cancellation remains a separately scoped requirement unless newer authority proves it complete.

### 11.1 Exact cancellation-owner contract approved on 17 August 2026

Financial cancellation is a server-owned pre-Draft action. Presentation words such as `resolved`, the line type, a historical timesheet link, or the section containing the row are not proof of ownership.

The only supported non-timesheet cancellation owners are:

- `TAXABLE_CHANNEL_RESTRUCTURE` for a current exact finance-component owner set;
- `NON_BUCKET` for one current exact session-owned gross-total decision.

`BUCKETED` remains the existing physical timesheet/rate family. It must not be published or accepted as the owner of a finance-case cancellation, and this financial extension must not change `Cancel Resolved Rate`.

The database must classify each finance case into one explicit clearability state:

- `NOT_REQUIRED` — no saved owner and no resolution is required;
- `REQUIRES_RESOLUTION` — an authoritative blocker exists without a current saved owner;
- `RESOLVED_AND_CLEARABLE` — one supported, exact, current saved owner has been proved;
- `RESOLVED_BUT_FINANCIALLY_BOUND` — only when that exact clear branch proves a real financial boundary;
- `STALE_OR_AMBIGUOUS` — saved evidence is stale, incomplete, mixed, duplicated, conflicting, or otherwise not exact.

Only `RESOLVED_AND_CLEARABLE` may publish an executable financial clear action. All other states publish no mutation-shaped clear action.

For `TAXABLE_CHANNEL_RESTRUCTURE`, the canonical action is finance-case scoped and must not contain a timesheet identity. For `NON_BUCKET`, one exact linked timesheet may be included only when it belongs to the unique saved owner. If legacy `timesheet_id` and canonical `linked_timesheet_id` are both present, they must agree or the action fails closed.

The canonical action must contain exact server-owned candidate ID, finance-case ID, `finance:<finance-case-id>` case key, supported family, action name and enabled state. The frontend validates and dispatches this object; it must not default a family, synthesize `advance:<id>`, scrape a historical timesheet, or infer ownership from amount, date, badge, channel, or line type.

Cancellation availability is independent of recovery headroom. A current saved financial resolution may be cancelled while its recovery is displayed in either Ready to Pay or Blocked for Pay. Headroom governs recovery allocation and Draft eligibility, not whether the saved decision can be removed.

The clear RPC must re-prove the exact current owner under lock immediately before mutation. Stale, forged, missing, duplicated, mixed-family, target-mismatched, fingerprint-mismatched, or identity-conflicting requests must fail typed without a partial write.

Clearing a live financial resolution removes only its exact saved owner evidence and refreshes the affected candidate. It must preserve source and remaining balances, reservations, settled history, Snooze state, fixed-case policy, payment economics, and unrelated candidates. Existing frozen Draft items are never rewritten; the established stale-Draft signal is used where the supported taxable branch permits a live clear after Draft creation.

Approved labels are:

- `Cancel Resolved Pay Channel` for `TAXABLE_CHANNEL_RESTRUCTURE`;
- `Cancel Resolved Gross Total` for `NON_BUCKET`;
- `Cancel Resolved Rate` remains exclusively the existing `BUCKETED` timesheet workflow.

## 12. Timesheet and recovery breakdowns

Expanding a timesheet must show the available authoritative detail, including:

- date;
- client;
- role;
- band;
- start;
- finish;
- break;
- amount;
- source pay and target pay where the row carries both.

Do not render a second target-only copy of a segment already represented by its source/target line. Deduplication must use canonical identity, not visual similarity.

Expanding an overpayment recovery must show its constituent recovery amounts and the current recoverable amount without duplicating the parent identity.

Expansion/collapse is an in-place UI action. It must not trigger an unnecessary full Workbench refresh, full modal rebuild, or unrelated candidate recomputation.

## 13. Modal responsiveness and state adoption

The Banking Pay modal must remain responsive during refresh, resolve, cancel, selection, expansion, and Draft preparation.

- Do not repeatedly deep-clone the entire preview graph for a local expand/collapse.
- Do not retain multiple independent full copies of the same page in compatibility aliases.
- Compatibility aliases must share or be replaced from one bounded authoritative graph.
- Candidate-scoped actions must update only the affected candidate plus any explicitly server-declared linked scope.
- Do not rebuild unrelated candidates merely to resolve or cancel one candidate's case.
- Network completion is not UI completion: the open modal must visibly adopt the returned authoritative revision.
- Tests must observe responsiveness and request count as well as final content.

## 14. Draft creation

- A Draft uses only rows that are selected and Draft-eligible under the current canonical Workbench revision.
- A recovery cannot enter a Draft beyond its current selected positive headroom.
- Rows in Cases / Resolutions or Blocked for Pay are not Draft inputs.
- Draft creation must fail closed on stale selection, stale fingerprint, stale session, missing authority, or unresolved required case.
- Once created, the Draft and all downstream operations use frozen artifacts under Policy X.
- A successful pre-Draft screen does not prove Draft execution, future payment execution, fast cancellation, settlement, or remittance; each lifecycle stage requires its own evidence.

## 15. Fast future-payment cancellation

Fast cancellation is a post-Draft workflow and must remain separate from live Workbench truth.

- Cancellation must use frozen Draft/execution artifacts.
- It must not refresh live rates, current finance facts, or current recovery headroom to reinterpret the payment.
- Obsolete/superseded job liveness, idempotency, provider state, and cancellation ownership must be fenced by their existing contracts.
- No Workbench presentation fix may alter this path unless explicitly authorised.

## 16. Mandatory regression matrix

Any change touching relevant code must run focused tests for the affected rows plus adjacent safeguards.

Minimum recovery/selection matrix:

1. Zero selected positive headroom -> recovery appears once in Blocked, recoverable `0.00`, not selectable/draftable.
2. Exact headroom -> full recovery appears once in Ready.
3. Partial headroom -> partial recovery appears once in Ready; unrecovered balance remains intact.
4. More recovery than headroom -> deterministic earlier allocation, partial boundary recovery, later recoveries blocked.
5. Headroom in another candidate -> no effect.
6. Headroom in another pay channel -> no effect.
7. Untick positive row in an open modal -> immediate Ready-to-Blocked transition without reopen.
8. Re-tick positive row in the same modal -> immediate Blocked-to-Ready full/partial transition without reopen.
9. No duplicated identity across Ready, Cases, and Blocked.
10. Selected totals and Draft inputs exactly match current server authority.

Minimum resolution matrix:

1. DAY/NIGHT and other physical buckets save independently.
2. Arbitrary additional codes with different rates remain independent.
3. Conflicting duplicate physical identity fails typed.
4. Matching-timesheet scope changes only eligible linked rows.
5. Resolution disappears from Cases and appears once in the correct section without reopen.
6. Cancel resolved rate restores the case without reopen.
7. Stale units, rates, fingerprint, or ownership fails without a write.
8. A current taxable finance-component owner publishes one `Cancel Resolved Pay Channel` action with no timesheet identity in Ready or Blocked.
9. A unique current non-bucket owner publishes one `Cancel Resolved Gross Total` action with only its exact optional linked-timesheet identity.
10. BUCKETED, missing, stale, closed, duplicate, mixed-family, target-mismatched, and fingerprint-mismatched finance owners publish no financial clear action.
11. A forged or stale financial clear request is rejected under the database lock without mutation.
12. A successful financial clear changes only the saved owner, preserves frozen Draft/economic artefacts, refreshes the same modal, and can be restored through the supported apply path.

Minimum presentation/performance matrix:

1. Breakdown fields are populated from canonical backend data.
2. No duplicate source/target segment lines.
3. Expand/collapse does not fetch/rebuild the whole modal.
4. Repeated expand/collapse, selection, resolve, and cancel do not make the modal non-responsive.
5. The test proves the patched frontend asset or installed database definition was actually exercised.

## 17. Evidence standards

Completion claims must distinguish:

- static source evidence;
- compile/canonical-hash evidence;
- installed-definition evidence;
- rollback-fixture evidence;
- read-only live runtime evidence;
- real user-visible lifecycle evidence.

One category must not be presented as another. A source test does not prove the deployed browser. An installed hash does not prove a live lifecycle. A close/reopen result does not prove same-modal adoption.

For database work, record the current TEST project, object identity, owner/ACL/search path where relevant, source and installed hashes, and bounded before/after results. For frontend work, record the repository commit, deployed asset parity, Playwright/browser path, request scope, and whether the modal stayed open.

## 18. Verified implementation/evidence register

The following frontend commits form part of the current 17 August 2026 evidence trail. They are historical pointers, not permission to assume their deployed behaviour remains current:

- `e8be014` — clarified case presentation and deduplicated breakdowns.
- `e6f8f2b` — refreshed after recovery restructure.
- `950012e` — preserved accepted resolved-rate clears.
- `f1669a0` — adopted linked rate-resolution results.
- `ae17c57` — evicted a stale case alias.
- `c1f95ee` — replaced candidate case aliases.
- `e6f326d` — atomically adopted candidate sections for the covered action path.
- `f5468ed` — clarified zero-headroom recovery rows.
- `aee02f1` — settled the covered James modal-adoption path.
- `2ca622b` — evicted resolved candidate cases.

Current frontend authority at the time this Bible was created: `2ca622bb15f77647b49aba8ac5bf78a2a485ca67`.

Current backend authority observed at the time this Bible was created: `6117000635a2f287220e5d20b90ba9e74d5cd8b1`.

These identities are observations, not pinned baselines. Every later task must use the most recent authority available at execution time.

## 19. Current open-items register

### Open and proved

- Same-modal recovery routing after positive-selection change: server state is correct, but the open frontend can retain stale Ready placement until modal reopen. Fix only the frontend selection-result/section adoption path and prove both directions without reopening.

### Separately scoped / do not assume complete

- Canonical cancellation of resolved overpayment/restructure and other non-timesheet financial resolution families.
- End-to-end James Draft creation followed by future execution and fast cancellation, unless newer evidence closes it.
- Performance proof for repeated row expansion under the current deployed asset.

### Working contracts that must be preserved

- James physical rate authority and independent component resolution.
- Typed failure and fail-closed physical baseline/reservation handling.
- One-effective-section server readers.
- Zero-headroom blocked presentation wording.
- Detailed timesheet breakdown and source/target deduplication.
- Existing resolved-rate cancellation for the already-supported timesheet family.

## 20. Change record

### 17 August 2026 — initial Bible

- Consolidated the controlling Banking Pay rules established through the James rate-authority, post-resolution, recovery presentation, same-modal adoption, and Draft-integrity work.
- Recorded the user-confirmed recovery-headroom policy.
- Recorded read-only TEST proof that deselection correctly produced zero headroom and effective Blocked rows.
- Recorded the remaining same-modal Ready-alias eviction defect separately from economics.
- Made this Bible mandatory through `AGENTS.md`.

### 17 August 2026 — resolved financial cancellation authority

- Recorded the exact non-timesheet owner families: `TAXABLE_CHANNEL_RESTRUCTURE` and `NON_BUCKET`.
- Kept `BUCKETED` and `Cancel Resolved Rate` exclusively within the working timesheet/rate workflow.
- Added the explicit finance clearability state model and fail-closed canonical action contract.
- Confirmed that cancellation visibility is independent of Ready/Blocked headroom routing.
- Required under-lock current-owner revalidation and Policy X preservation of frozen Draft and downstream artefacts.
- Added the finance cancellation regression matrix and prohibited frontend ownership inference.

Future entries must include the date, approved rule change or clarification, affected owners, executable regression evidence, deployed/installed authority where applicable, and explicit Policy X assessment.
