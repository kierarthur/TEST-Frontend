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

### Canonical storage and publication

- The single controlling working document is `BANKING_PAY_BIBLE.md` at the root of the `kierarthur/TEST-Frontend` repository.
- Its published GitHub location is `https://github.com/kierarthur/TEST-Frontend/blob/main/BANKING_PAY_BIBLE.md`. The current `main` branch copy is the online authority; a local checkout is current only when its exact file bytes match that branch.
- Historical handovers, downloaded plans, attachments, generated archives and the earlier `CloudTMS_Banking_Pay_Modal_Structure_Bible_20260828` pack are evidence only. They do not become a second rulebook and must not override a later rule or change record in this file.
- `TEST-Frontend/AGENTS.md` requires every future Banking Pay, Workbench, Draft, payment, recovery, settlement, cancellation and remittance task to read this file in full and to update its change record when verified behaviour or an approved policy changes.

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
- payment context shows the exact current client, human week/date and pay-method badge;
- Amount shows the nominal/outstanding amount due for recovery, not a misleading `£0.00` recoverable value;
- heading: `Insufficient funds to deduct`;
- explanatory text: `No recovery can be taken from the currently selected payments.`;
- do not show a generic `This case is currently blocked and needs review...` message;
- do not show meaningless channel text such as `UMBRELLA • NONE` beneath the state.

The Blocked detail table uses exactly five presentation columns: `Candidate`, `Payment`, `Why it is blocked`, `Amount`, and `Actions`. Candidate contains the human name and CloudTMS reference. Payment contains the line type plus current client/date/pay-method context. Why it is blocked contains the plain-English heading and explanation above. Amount is left-aligned, currency-formatted and remains database-owned; it must not repeat the explanation already shown in Why it is blocked. Actions retains every existing applicable Timesheets, Snooze, resolution/cancellation and breakdown control; the presentation may move a control into this column but must not remove, replace or reinterpret it. An expanded breakdown remains inside the same bounded table and spans the five presentation columns.

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

The Action Required detail table uses exactly five presentation columns: `Candidate`, `Payment`, `What needs attention`, `Amount`, and `Actions`. It retains every existing applicable resolution, alternative-rate/amount, matching-timesheet scope, Timesheets, Snooze, exclusion, cancellation, restore and breakdown control. Row double-click and the visible candidate control both open the same fixed top-layer detail authority; interactive child controls must not accidentally trigger a second open. The compact table is a presentation over the existing server payload and retained action handlers, never a second action or financial owner.

For an actionable finance case, the displayed amount must come from the existing authoritative unresolved/nominal case scalar when the current-pay-run recoverable scalar is zero. A zero recoverable scalar means that nothing can presently be deducted; it does not mean that the outstanding decision or recovery is worth zero. The browser must not select, calculate, sum or substitute this amount. An ordinary zero with no non-zero unresolved case amount is shown as unavailable rather than as a misleading payable `£0.00`.

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
- A selection checkbox may update optimistically, but the Draft action must immediately show a disabled selection-update state until the accepted server result and its authoritative Ready/Blocked adoption settle. It must never remain labelled as though no selection exists, and it must never become Draft-enabled from optimistic client state.
- Tests must observe responsiveness and request count as well as final content.

## 14. Draft creation

- A Draft uses only rows that are selected and Draft-eligible under the current canonical Workbench revision.
- A recovery cannot enter a Draft beyond its current selected positive headroom.
- Rows in Cases / Resolutions or Blocked for Pay are not Draft inputs.
- Draft creation must fail closed on stale selection, stale fingerprint, stale session, missing authority, or unresolved required case.
- Draft-action visibility and enablement must come from the accepted server-owned Workbench selection authority. A pending selection mutation may only disable that action temporarily; it must not erase or overwrite the settled action state published by the authoritative rerender.
- Once created, the Draft and all downstream operations use frozen artifacts under Policy X.
- A successful pre-Draft screen does not prove Draft execution, future payment execution, fast cancellation, settlement, or remittance; each lifecycle stage requires its own evidence.

## 15. Fast future-payment cancellation

Fast cancellation is a post-Draft workflow and must remain separate from live Workbench truth.

- Cancellation must use frozen Draft/execution artifacts.
- It must not refresh live rates, current finance facts, or current recovery headroom to reinterpret the payment.
- Obsolete/superseded job liveness, idempotency, provider state, and cancellation ownership must be fenced by their existing contracts.
- A terminal `BLOCKED`, `FAILED_FINAL`, or `FAILED_RETRYABLE` result from an older cancellation attempt remains immutable audit history, but must not permanently suppress a fresh whole-Draft cancellation when the current exact Draft diagnostic independently re-proves every frozen-item, provider, settlement, instruction-scope, carry-forward, and current-batch fence.
- That retry creates a new bounded cancellation request; it must not reopen, rewrite, or erase the terminal historical request. Scheduled or executed non-Draft cancellations retain their historical-work fences.
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
6. During a real selection request, the Draft action immediately displays a disabled in-progress state, remains fail-closed while the request is unsettled, then adopts the exact authoritative `Select rows` or `Create drafts` result without modal reopen.

Minimum Draft-cancellation retry matrix:

1. A current safe `DRAFT` with no prior correction outcome exposes `DRAFT_CANCEL`.
2. The same current safe `DRAFT` still exposes `DRAFT_CANCEL` when its latest historical attempt is terminal `BLOCKED`, `FAILED_FINAL`, or `FAILED_RETRYABLE`.
3. The historical request/work item remains unchanged and visible as audit evidence.
4. Provider submission, paid/settled evidence, incomplete instruction scope, ambiguous provider outcome, manual carry-forward, or carry-forward freshness failure still withholds cancellation.
5. Scheduled and executed non-Draft cancellation keeps the established historical-work fences.
6. Reader and immutable selection preparation classify the safe Draft retry identically before a new request is allowed.

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

### Closed by verified current authority

- Same-modal recovery routing after an accepted selection change is closed for the frontend selection-result path by the `20260821-banking-selection-result-refresh-r2` asset. Commit `6ef2285868bcab8c59272aba8b62ddc6d321bbc6` established the atomic concurrent Ready/Blocked pair, but later exact browser evidence proved that its accepted page graph was not installed on the render-consumed `draftWizard.preview` wrapper aliases. That omission could reintroduce a departed recovery from `preview.preview_pages.canonical_preview_lines` even though the direct Workbench rows and server readers were current. The narrow correction installs the same bounded accepted page graph on `workbench`, the accepted envelope, `preview`, and `preview.data`; it does not add a source, perform a second merge, or recalculate any amount. An executable stale-wrapper regression failed before the correction and passed after it. A patched-asset TEST browser lifecycle then selected James positive headroom, observed a promoted recovery, unticked the last positive, and proved zero recovery rows in every Ready page-cache root, one-or-more Blocked recovery presentations, no cross-section duplicate, the modal still open, and exact restoration of the original unselected James state. The two selection mutations settled in 1,766 ms and 1,558 ms. TEST database truth after restoration showed James with zero selected rows and zero selected recoveries in the current open READY session.

### Separately scoped / do not assume complete

- Canonical cancellation of resolved overpayment/restructure and other non-timesheet financial resolution families.
- End-to-end James Draft creation followed by future execution and fast cancellation, unless newer evidence closes it.
- Performance proof for repeated row expansion under the current deployed asset.
- Whole-database Supabase privilege hardening remains separately scoped. TEST currently uses a Worker/service-role data path plus a pre-request MFA gate; later approved hardening must remove direct browser-role object authority in staged TEST phases, preserve the exact Worker and MFA contracts, measure route latency, and never copy a TEST-only authentication exception to LIVE.

### Working contracts that must be preserved

- James physical rate authority and independent component resolution.
- Typed failure and fail-closed physical baseline/reservation handling.
- One-effective-section server readers.
- A terminal historical cancellation attempt cannot poison a currently safe whole-Draft retry; all current provider, settlement, frozen-scope, carry-forward, and completeness fences remain mandatory.
- Active post-Draft batches exclude an exact frozen timesheet/component identity even when an older valid `OVERPAYMENT_RECOVERY` artifact stores the timesheet only as `frozen_source_basis_json.linked_timesheet_id` or `frozen_component_snapshot_json.source_basis_json.linked_timesheet_id`; the Draft seed must independently reject the same overlap.
- A current pre-Draft `OVERPAYMENT_RECOVERY` preview may expose only the positive residual not owned by active Draft reservations. A fully reserved recovery is absent from the Workbench; a genuine positive partial residual may remain exactly once only when the canonical versioned residual contract matches the current active reservation aggregate. Missing, malformed, stale, candidate-mismatched, or arithmetically inconsistent contract evidence fails closed.
- Zero-headroom blocked presentation wording.
- Detailed timesheet breakdown and source/target deduplication.
- Existing resolved-rate cancellation for the already-supported timesheet family.
- Database security work must preserve the Worker/service-role path, fail closed rather than fall back to browser-role database access, avoid permissive RLS policies for Worker-only tables, and use exact object/signature manifests plus post-repeatable verification so later migrations cannot silently regrant browser authority.
- A historical Candidate refresh instruction which lacks the current run identity or enabled authority fingerprint is not a payment and must never be repaired by filling in guessed fields. Before source-build claim, the service-only Workbench repair terminalises every proved-invalid queued instruction for the same open session/Candidate under the established Candidate lock, retains it as `DEAD` audit evidence, and delegates replacement only to the existing canonical owner-repair/enqueue authority.
- A terminal historical refresh instruction must never remain the current owner. The same transaction must preserve an already-valid current owner or prove a new canonical successor with the current session, session version, source-change sequence, source-build identity, authority fingerprint and required publication contract. Current scope and Candidate-state pointers must agree; no invalid active owner may remain. Repeating the repair must be a no-op.
- `DEAD` refresh instructions are excluded from source claims and the active-job dedupe rule. They may remain as bounded audit history; compatibility repair must not delete, recycle, claim, or treat them as payment rows. Long-term terminal-job retention is a separate housekeeping policy and must not be combined with financial refresh recovery.
- Every future Workbench queue-contract upgrade that makes a previously valid persisted instruction unclaimable must ship the bounded compatibility repair and rollback-contained first-use verifier in the same release. The verifier must reproduce the old failure and prove current-owner preservation, multi-row convergence, idempotency, service-only access, and no Draft, batch, provider, payment, settlement or remittance action.
- A Workbench Timesheet refresh may begin with one changed Timesheet and then discover that the identity belongs to a wider replacement/version family. Family discovery is an identity and invalidation fence, not permission to pay every family member. Retired, revoked, superseded, unauthorised or otherwise ineligible versions remain non-payable; only the canonical current version may enter Ready to Pay after the existing eligibility and authorisation owners approve it.
- A preceding scope authority may be reused only when it covers the complete final family discovered by the canonical normaliser and still matches the current scope generation. If final family discovery widens or changes that scope, the dirty-apply owner must obtain one new full-family authority through the central scope invalidator before any Candidate/session fan-out. It must not patch the old authority, guess a generation or continue with a partial family.
- A historical dirty-apply instruction which terminated specifically because its preceding authority did not cover the final family remains immutable `DEAD` audit evidence. A service-only repair may create a canonical successor only for the exact proved failure codes, only for a still-open affected session, and only when there is no later active or successful instruction for that Candidate. The repair must re-prove the successor, current scope registry, pending transaction and Candidate state in one bounded operation; replay must be a no-op.
- The Banking Pay worker must run this bounded invalid-dirty-apply repair before ordinary Workbench claims and must stop visibly if complete convergence cannot be proved. It must not conceal the problem by showing stale data as current, enabling Create Draft from uncertain authority, rewriting the failed instruction, changing a Timesheet version or relaxing eligibility.
- Candidate Banking must keep the accepted server response immutable while preparing an outer Timesheet payment group for the retained row renderer. When, and only when, the server has supplied a complete non-null `selection_group_kind` and `selection_group_key`, a shallow temporary display copy may clear the representative row's display-only allocation exclusion so the retained renderer emits the group checkbox placeholder. Before the staged DOM is adopted, the complete-group binder must remove every representative preview-row identity and bind that control to the exact certified group kind and key. A visible Timesheet row whose selection-group tuple is null/zero remains display-only and must not gain a checkbox.

## 20. Change record

### 1 September 2026 — certified Candidate Banking group-checkbox bridge

- Real signed-in TEST evidence showed Kier Arthur as `All payments included` with 28 of 28 selectable payment segments selected while every visible Timesheet outer row showed a dash. The server authority was not missing: across 32 Ready payment groups, 12 Timesheet groups had complete certified selection facts covering 18 selectable segments, 10 Timesheet rows were deliberate display-only context, and 10 overpayment groups were selectable. Page 1 contained two certified Timesheet groups, four display-only Timesheet rows and four overpayment groups.
- The presentation defect was confined to the shallow outer-row compatibility copy. Candidate Banking already promoted a certified Timesheet representative to `GROUP_REPRESENTATIVE`, but it retained the representative's `is_excluded_from_allocation=true` display-only flag. The retained renderer therefore refused to emit a checkbox before the existing complete-group binder could replace the representative identity with the server-certified group identity. The accepted response, group reader, selection mutation, amount, candidate total, Draft contract and Policy X authority were correct.
- For a Timesheet outer row with a complete non-null server selection-group identity, the temporary display copy now clears only that allocation-exclusion presentation flag. The original accepted row remains byte-for-byte unchanged. The existing binder must then remove `data-preview-row-ids`, attach the exact `data-selection-group-kind` and group key and apply the authoritative NONE/SOME/ALL state before the staged Candidate page is adopted. Rows with the canonical null/zero display-only tuple remain visible with a dash and their ordinary breakdown controls; the browser never invents selection authority from visibility, line type, candidate identity, amount or loaded-page position.
- Regression protection covers both sides of this boundary: a certified representative carrying the real `PARENT`, non-selectable and allocation-excluded shape must produce one exact complete-group checkbox without mutating the accepted row, while an otherwise similar display-only Timesheet row with no certified group must remain visible without a checkbox. The existing 10-complete-group outer paging, bounded inner expansion, overpayment controls, mobile `Close`, parent-modal position, Action Required and Blocked-for-Pay controls remain in the same executable suite.
- Frontend TEST commit `a6061f7acbbda3dd7f13fb6a5167207d769fbe7a` published the correction and the coherent `20260901-r12` Banking asset boundary. The complete frontend unit suite passed 1,299/1,299; the focused Chromium Banking suite passed 5/5; GitHub Pages run `33457716283` and App-Ready run `33457717049` both succeeded, including the complete real Candidate/Client modal-handler browser regression.
- Real signed-in deployed TEST acceptance opened Kier from the two-candidate Ready list at 28 of 28 selected and £0.00. Page 1 displayed exactly 10 complete payment groups: the two certified Timesheet groups had checked controls bound to exact server group identities with no representative preview-row IDs; the four true context-only Timesheet rows retained dashes; and all four overpayment controls remained checked. One certified two-segment group was unticked once and settled at 26 of 28, then reticked once and settled at 28 of 28 with no duplicate mutation, raw code or amount change. Closing and reopening retained 28 of 28. Expanding the 05/07/2026 group stayed inside the bounded table, displayed both payment segments and did not reproduce `BANKING_PAY_V2_READY_TOO_LARGE`; the next outer page remained available and the footer remained `32 Ready payment groups`.
- The acceptance ended with every tested selection restored to its exact starting state. No Create Draft, Snooze save, Timesheet authorisation, provider, payment, settlement, remittance or cancellation action was performed. Policy X assessment: compliant; this is a frontend presentation bridge only and changes no financial, eligibility, selection, recovery/headroom, rate, VAT, ERNI, PAYE/Umbrella, Timesheet-validity, Draft-input or frozen post-Draft authority.

### 31 August 2026 — truthful Action Required amounts and five-column issue details

- Real read-only TEST evidence proved that the Action Required `Payment method changed` row displayed as `£0.00` was not a zero-value payment or case. It was an existing £25.00 overpayment-recovery decision for a PAYE-to-Umbrella change. The current-pay-run recoverable scalar was correctly zero because no amount could presently be deducted, while the existing nominal/unresolved case scalar remained £25.00. The defect was confined to choosing the wrong existing scalar for the Action Required summary.
- The server-owned Action Required page projection now preserves every non-zero current presentation unchanged. For an affected finance case whose current-pay-run presentation rounds to zero, it presents the existing authoritative unresolved/nominal case amount. Where neither authority contains a non-zero amount, the presentation is unavailable rather than a misleading payable `£0.00`. The browser does not calculate, sum, infer or replace an amount, and the change does not make any recovery selectable or Draft-eligible.
- Action Required detail uses exactly `Candidate`, `Payment`, `What needs attention`, `Amount`, and `Actions`. Blocked for Pay detail uses exactly `Candidate`, `Payment`, `Why it is blocked`, `Amount`, and `Actions`. Both are fixed top-layer child surfaces. The retained legacy row/action authority still constructs the rows; compaction moves every real interactive control into Actions, removes only the legacy explanation duplicated by the dedicated reason column, currency-formats the unchanged server value, and keeps every expandable breakdown inside the bounded five-column table.
- The approved insufficient-funds presentation is `Insufficient funds to deduct` followed by `No recovery can be taken from the currently selected payments.` The Payment cell retains the overpayment-recovery label, exact client, human week/date and PAYE/Umbrella badge. The Amount cell retains the outstanding/nominal recovery amount. Timesheets, Snooze and every other applicable existing control remain wired to their established handlers.
- Both an issue row double-click and its visible candidate control open the same current child authority. A stable delegated shell fallback protects this behaviour while the healthy presenter prevents propagation and duplicate opening. Interactive row descendants do not become accidental row opens.
- Local executable evidence passed the complete frontend unit suite 1,298/1,298, the focused Chromium Banking suite 6/6, the complete backend suite 1,103/1,103, a clean PostgreSQL 17 NEW-database replay, the rollback-contained first-use verifier and exact generated-contract comparison. The contract delta was one existing Action Required page-reader definition hash only.
- Backend TEST commit `5eb6e3614be1c175d06c6b1ad85cafead82c25bd` was installed by protected managed Miget TEST UPGRADE run `33446917486`. The release applied exactly the new presentation repeatable `31082026_2230_banking_pay_action_required_amount_presentation_v1.sql`, closure SHA-256 `5a43dd7a351834567bf298937519b7788d4055a7758729fe351c615207f97028`, and completed the exact installed contract, security and first-use certification. The canonical contract SHA-256 is `154bed788e77d5729a18043e5c41b6901520268a2ec390605124d987d3fd038c`; only the existing Action Required page reader changed.
- The final child-opening defect was not a missing server action and was not resolved by inventing another handler. The bounded detail response correctly supplied the exact server-owned `task_meta` action contract, including the established Bucketed resolution and case-exclusion actions, but intentionally omitted four older presentation-only booleans. The retained legacy renderer treated those absent hints as false, hid `Review suggested rates`, and then failed the adapter's exact action-parity check. The child therefore remained closed even though its read returned HTTP 200 and passed response validation.
- The presenter now makes one shallow display copy and derives only those legacy presentation hints from the response's explicit authoritative action contract. The original accepted response is unchanged. The adapter still compares the complete rendered action set with that exact server contract and still rejects any missing, extra or unknown action. This is a compatibility bridge into the established controls, not a new resolution, exclusion, Snooze, Timesheet or financial authority.
- Frontend TEST commit `aff6a028b4b543881b3caff146bc6701f00aa6b2` published the correction and one coherent `20260831-r11` Banking asset boundary. Pages run `33450229639` and App-Ready run `33450230704` both succeeded; App-Ready included the real Candidate/Client modal-handler browser regression. Focused unit proof passed 16/16, the complete applicable source suite passed 1,405/1,405, and the focused Chromium Banking suite passed 6/6. Two separately recorded dormant non-Banking static assertions remain outside this change and were not weakened.
- Direct deployed-asset verification proved exactly one `20260831-r11` issue-detail script. Signed-in real TEST acceptance opened all four current Action Required rows by double-click, opened the same child through the visible Candidate control, and proved every row retained Timesheets, Snooze, its applicable resolution action and `Exclude case`. The payment-method row displayed the authoritative unresolved amount `£25.00`; no internal code was shown.
- The same signed-in acceptance opened the current insufficient-funds Blocked row by double-click and by the visible Candidate control. Its detail had exactly `Candidate`, `Payment`, `Why it is blocked`, `Amount`, and `Actions`; displayed `Insufficient funds to deduct` and `No recovery can be taken from the currently selected payments.`; retained the outstanding amount, Timesheets and Snooze; and exposed no internal code. Opening and closing either child left the parent modal's position, dimensions and scroll state unchanged. There were no page errors, failed Banking requests, Draft creations, selection changes, Snooze saves, provider actions, payments, settlements or remittances during acceptance.
- Documentation closure commit `bf0625fbae8b15811899dbc65b290025d050cbc5` published this verified evidence through Pages run `33451300869`. App-Ready run `33451301870` completed successfully on attempt 2 with all 104 broader Candidate/Client browser checks and the Banking/UI seam checks passing. Attempt 1 contained one isolated desktop rate-client-picker timing miss while the same scenario passed on phone and iPad; the exact desktop test then passed locally and the complete unchanged rerun passed. No Banking rule, test or unrelated application behaviour was weakened to obtain the green gate.
- Policy X assessment: compliant. This is a server-owned display-projection and presentation correction. It changes no payment economics, eligibility, selection, recovery/headroom, rates, VAT, ERNI, PAYE/Umbrella treatment, Timesheet validity, Draft input, frozen post-Draft artefacts, provider execution, payment, settlement, remittance or cancellation authority.

### 31 August 2026 — Candidate Banking client and pay-method column containment

- Real and synthetic Candidate Banking evidence reproduced a presentation defect in which a long client name, including `Berkshire Healthcare NHS Foundation Trust`, retained the legacy row renderer's `white-space: nowrap` instruction and drew through the Client-cell boundary underneath the PAYE badge. The accepted data, payment-group paging and pay-method authority were correct; this was a display collision only.
- Candidate Banking retains its seven established columns and every existing row, amount, deduction flag, selection control, payment-group expansion, Timesheet action, Snooze action and paging control. The table still pages exactly 10 complete payment groups, and expanded segments remain inside the bounded table.
- The Client column now owns a dedicated full-text label. It may wrap to at most two visual lines inside a protected 300-pixel table column; the unabridged accessible text and title remain present. The Pay method column is separately protected and non-wrapping, so its existing PAYE or Umbrella badge cannot be covered by neighbouring content.
- The complete outer table has a deterministic 1,134-pixel minimum width. At a wide desktop modal all seven columns fit without collision. At narrower and mobile widths, the existing bounded table scroller exposes the complete table horizontally instead of squeezing, hiding or overlapping columns; the child heading and reachable `Close` action remain outside that scroller.
- Executable Chromium proof uses the exact long NHS client-name shape and requires the rendered client label to remain within the Client cell, the Client cell to end no later than the Pay method cell begins, the pay-method badge to remain wholly inside its own cell and the label's two-line containment rule to be active. It repeats that boundary at 390 x 844, proves bounded horizontal scrolling and a reachable `Close` action, then continues through the existing expansion failure/retry, complete segment rendering, read-only refresh, close and parent-position preservation checks. The complete frontend unit suite passed 1,314/1,314 and the focused Chromium Banking suite passed 5/5.
- Frontend TEST commit `c5577123f1bc277861746b73cf8da303c2ef40b2` published the correction and the complete `20260831-r8` Banking asset boundary. Pages run `33433913922` and App-Ready run `33433915125` both succeeded, including the real Candidate/Client modal-handler browser regression. Direct deployed-asset verification proved that both the Candidate module and stylesheet were served with `20260831-r8`, and that the served files contained the exact label and 1,134-pixel containment rules.
- Real signed-in deployed TEST evidence opened Kier Arthur with 22 Ready payment groups and 10 complete groups on the first page. Every real `Berkshire Healthcare NHS Foundation Trust` label remained in Client and every PAYE badge remained visibly separate in Pay method. Expanding the 05/07/2026 group kept its two payment segments inside the bounded table. At 390 x 844 the heading and `Close` action remained reachable while the table owned its horizontal and vertical scrolling. Closing the child restored the unchanged parent with both Candidate rows. No selection, Snooze save, Create Draft, provider, payment, settlement or remittance action was performed.
- Policy X assessment: compliant. This is presentation-only. It does not change client identity, pay method, payment-group membership, Timesheet validity, selection, amount, deduction, recovery/headroom, rates, VAT, ERNI, PAYE/Umbrella treatment, Draft input, frozen post-Draft artefacts, provider execution, payment, settlement, remittance or cancellation authority.

### 31 August 2026 — outer payment-group presentation and retryable read-only adoption

- The Candidate Ready outer reader deliberately returns one certified representative for each complete Timesheet payment group. That representative may be marked `PARENT`, non-selectable and non-draftable because it is not itself a physical payment segment. Those flags are valid server authority: they prevent the representative from being mistaken for Draft input while the separate certified `selection_group_*` fields describe the complete group's selectable membership, selection state and display amounts.
- The retained detailed Timesheet renderer historically treated every `PARENT` plus non-selectable row as supporting context and hid it. Applied to a grouped outer page, that presentation rule could hide all ten otherwise valid group representatives. The transport, database reader, grouping, payment values and selection authority could all be correct while Candidate Banking failed during display preparation.
- Candidate Banking must bridge this shape only through a shallow display copy. A `TIMESHEET` outer representative is presented to the retained renderer as `GROUP_REPRESENTATIVE`; when the server supplied a complete certified selection group, the display copy may expose the placeholder group control required by that renderer. The original accepted row and its server fields remain unchanged. Validation, complete-group rebinding, emitted selection intent, candidate total and Create Draft compatibility authority must continue to use the original server response and exact `selection_group_kind`/`selection_group_key`.
- A Timesheet outer representative with no selectable group must remain visible with its breakdown and ordinary controls but without a selection checkbox. Presentation must never invent selection authority merely because the row is visible.
- A failure while preparing a read-only candidate page must preserve the already accepted parent Banking Pay list, keep its financial controls usable and permit the user to open or page the candidate again. It must not leave `Create drafts` mislabeled as `Updating selection…`, because no selection request was submitted. By contrast, a stale authority, a dispatched mutation with an uncertain result, or a failure during the single commit boundary remains fail-closed and requires the established current-authority recovery.
- Candidate display and adoption failures use one dedicated contained alert with plain wording. Internal codes are not user copy. The exact runtime-status node must be targeted rather than whichever generic status element happens to appear first in the modal.
- Focused executable proof covers a real-shape `PARENT` Timesheet representative, non-selectable representative visibility, unchanged original server authority, exact group-control binding, read-only preparation failure, retained parent snapshot and successful retry. Publication and real signed-in deployed-browser evidence must be appended before this item is treated as release-complete.
- Policy X assessment: compliant. This is a presentation/adoption correction only. It does not change payment amounts, Timesheet validity, eligibility, selection economics, recovery/headroom, rates, VAT, ERNI, PAYE/Umbrella treatment, Draft input, frozen post-Draft artefacts, provider execution, payment, settlement, remittance or cancellation authority.

### 31 August 2026 — complete Candidate payment-group paging and Action Required control parity

- Candidate Banking pages complete payment groups rather than whichever physical rows happen to fit. The outer page contains exactly 10 Timesheet, overpayment-recovery or single-row payment groups whenever at least 10 groups remain; only the final page may contain fewer. Selecting or unselecting a payment may change amounts and membership, but it must not cause short, duplicated or skipped outer pages merely because one Timesheet contains more segments than another.
- A payment group remains one outer-page position regardless of its number of segments. Opening a group reads its complete current server-owned membership through a separate opaque cursor and shows at most 10 complete segment/payment lines at a time inside the expanded bounded table. `Previous` and `Next` page that inner group. A large group is never hidden, rejected as too large, split across the outer Candidate page or allowed to displace other outer payment groups.
- The two paging layers have separate authorities and counts: the outer footer reports complete Ready payment groups; the inner footer reports the opened group's payment segments. Candidate-wide selection state, selected segment count and Ready-to-pay amount remain server-owned across the complete eligible Candidate scope and are never inferred from either loaded page.
- `public.pay_workbench_session_get_candidate_ready_page_v1` remains the Candidate Ready reader and now returns grouped representatives before outer pagination. `public.pay_workbench_session_get_candidate_ready_group_page_v1` is the bounded read-only inner-group owner. Both require the exact current Workbench session, Candidate, revision and scope authority; both retain the complete existing row payload and every established Timesheet, snooze, resolution, deduction and selection control. The existing group-selection and Draft-input owners are unchanged.
- Certified historical Ready payloads may retain `line_type` inside `row_json`/`rowJson` rather than as a top-level field. Candidate Banking classifies these rows from the server-owned presentation-group kind plus the same certified line-type aliases used by the database. It must never show an empty table when a validated page reports payment groups; a non-empty page that produces no supported row presentation fails visibly instead of publishing a false empty state.
- Every directly loaded Banking Pay asset changed by one release must publish with the same new cache marker. The browser must never be allowed to combine a current controller, transport or stylesheet with an older Candidate or Action Required renderer; an executable asset-marker guard owns this publication boundary.
- Action Required detail must join each accepted server task's exact action metadata to the existing Banking action renderers. A finance case may expose only the server-returned supported resolution and current-session exclusion actions; a component decision may expose only the server-returned suggestion/manual/clear actions. Missing, duplicated, unknown or family-mismatched action metadata fails closed instead of guessing a button. Timesheet and Snooze controls remain available through their existing owners.
- `Exclude case` remains an optional current-Workbench-session override. The unresolved item is already excluded from Draft input, so the user may continue paying other eligible items without pressing it. The action is useful when the user deliberately wants the case removed from the current pay-run preparation view; it reverses to `Include case`, has no user-defined expiry and is not a substitute for dated or indefinite Snooze. Any wording change remains a separate approved presentation decision.
- The `Resolution required` state is a compact gold, single-line status chip. This is presentation only: it neither replaces the explanatory sentence nor changes the permitted actions. The Action column must retain enough width for its established buttons without converting the status message into a tall repeated block.
- Executable proof passed the complete clean PostgreSQL 17 `NEW` release from an empty database, including the rollback-contained 28-line large-group fixture which pages 10/10/8 without duplicate or missing identities, exact security/ACL checks and final canonical contract comparison. All 1,097 backend tests, 132 focused frontend Banking unit tests and 5/5 local Chromium Banking tests passed. The Chromium proof renders the restored `Review suggested rates`, `Exclude case` and `Snooze whole timesheet` controls, verifies the compact non-wrapping status chip and proves that the resolution button dispatches the existing resolution action.
- Policy X assessment: compliant. No payment amount, eligibility, Timesheet validity, rate, VAT, ERNI, PAYE/Umbrella treatment, recovery/headroom, selection economics, Draft input, frozen post-Draft artefact, provider, payment, settlement, remittance or cancellation authority changed. The Create Draft owner continues to consume the same selected, Draft-eligible Workbench rows; neither presentation page is a Draft contract.

### 31 August 2026 — complete Timesheet-family authority repair

- A real deployed TEST Banking Pay refresh remained fail-closed with the warning that a background scope update had not recovered. The affected historical `WORKBENCH_CANDIDATE_DIRTY_APPLY` instruction had correctly become `DEAD`: it began with a narrower Timesheet identity, the canonical normaliser then discovered the complete replacement/version family, and its preceding invalidation authority did not cover that final family. This is distinct from the 29 August missing-fingerprint compatibility incident.
- Read-only evidence proved the observed family contained an older revoked/non-current Timesheet version and its current replacement. The replacement was current but not authorised at the time inspected. The correction does not make either row payable: the old version remains retired and the current version can enter Ready only if the unchanged authorisation, eligibility, freshness and Workbench owners permit it.
- The dirty-apply processor now tests the preceding authority against the complete final normalised family. When that proof fails, it requests one new complete authority through `private.pay_workbench_scope_invalidate_v1`, preserves the existing deferred finalisation path, and requeues the same bounded Candidate refresh through the canonical owner. It does not rewrite a Timesheet, infer a family in JavaScript, patch a generation, calculate an amount or introduce another financial path.
- `public.pay_workbench_repair_invalid_dirty_apply_jobs_v1` is a service-only, idempotent recovery for only `PAY_WORKBENCH_PRECEDING_SCOPE_INVALIDATION_UNPROVED` and `PAY_WORKBENCH_STALE_PREINVALIDATED_AUTHORITY_NOT_CURRENT`. It retains each failed row as immutable `DEAD` audit history, excludes any Candidate with later active/successful work, obtains the replacement through the central invalidator, and proves the successor, scope registry, transaction and Candidate-state postconditions before reporting success. The Worker invokes this repair before ordinary Workbench claims and fails visibly if any targeted row remains unreconciled.
- The release's rollback-contained PostgreSQL 17.6 verifier recreated the incomplete-family failure, proved the new full-family successor and current ownership, proved replay idempotency and service-only access, and proved unchanged Draft, batch, provider, payment, settlement and remittance state. The temporary verifier Timesheets are test evidence only and are rolled back. Two unrelated existing Candidate PAPER rollback fixtures were brought up to the current mandatory schema and made date-stable so the protected release could exercise current code; those fixture corrections did not change application Timesheets or runtime policy.
- Backend commit `9272beb961` introduced the family-authority correction; final sealed backend TEST authority `e76a7d0f67babda6d1a7aaaf433bab768d8e3691` passed 1,084/1,084 backend tests. Protected managed Miget TEST UPGRADE run `33343488904` succeeded. The normal TEST Worker Git build `9b63ca14-a699-41b6-a72d-76dc1118d2f5` succeeded and deployed version `1c00cb30-d5c2-450e-b096-c7efdeb9c2a4` at 100%.
- Real signed-in deployed TEST browser evidence opened Banking Pay twice against that authority. Both times the current `£450.00` Ready total and the same two Candidate rows settled, Create drafts was enabled from accepted server authority, no background-failure or `Checking changes...` state remained, and the browser console contained zero errors or warnings. No Create Draft, selection, Timesheet authorisation, provider, payment, settlement or remittance action was performed.
- Policy X assessment: compliant. The change repairs pre-Draft refresh ownership only. It does not change Timesheet validity, selection economics, recovery/headroom, rates, VAT, ERNI, PAYE/Umbrella treatment, Draft input contract, frozen post-Draft artifacts, provider execution, settlement, remittance or cancellation.

### 31 August 2026 — Candidate Banking display-only detail contract and recoverable expansion failure

- A real signed-in TEST Candidate Banking group could remain on `Loading payment details…` because the detail endpoint returned HTTP `502`. Read-only Worker and PostgreSQL evidence proved that the payment group itself was valid and complete. The contradictory part was limited to display-only child rows: they correctly had no selectable group owner, but the reader attached the payment group's non-zero selected/member counts to those rows while leaving their selection kind, key, state and amounts null. The existing Worker validator correctly rejected that impossible combination rather than weakening its financial boundary.
- Display-only rows must use the existing non-selectable selection tuple in full: null group kind, null group key, zero member count, zero selected count, null group amount, null selected group amount and null group state. Selectable rows continue to receive their complete server-owned group counts, state and amounts. The correction is made in `public.pay_workbench_session_get_candidate_ready_group_page_v1`; it does not change presentation grouping, Ready membership, selection eligibility, selected membership, amounts, recovery, resolution, snooze, Timesheet or Draft authority.
- A detail-read failure must not leave an indefinite spinner or close/rebuild either modal. The expanded row remains inside the bounded Candidate Banking table and shows one compact alert: `Payment details could not be loaded.` / `The current payment list is unchanged.` with `Try again`. Retry issues one new bounded read only; it never retries a selection mutation, never changes a checkbox optimistically and never displays the internal response code.
- Executable evidence includes a rollback-contained PostgreSQL 17 first-use fixture whose three visible Timesheet rows have no selection owner, exact installed-definition/ACL verification, the unchanged strict Worker response validator, and a Playwright failure-then-retry case. The fixture proves the complete null/zero tuple, unchanged Workbench rows and unchanged session progress. A complete clean PostgreSQL 17 NEW replay passed all 207 migrations, 502 repeatables, mandatory verifiers and the exact generated contract; the contract delta is one existing reader definition only.
- Backend TEST commit `a3ae64801b9a7ed072e78e26278ec0cb8304a7cf` installed the one-reader correction through protected managed Miget TEST UPGRADE run `33422337039`. The release passed 1,097/1,097 backend tests, 33 focused Banking/release tests, the complete clean PostgreSQL 17 NEW replay and exact contract verification; canonical contract SHA-256 `0db2d3c075a0aa4167e3f0d9c4e5df7a0eaaf2f9195fa17a5ab26b8ab4813393` differs by that one existing reader definition only. No Worker JavaScript changed, so no Worker deployment was required.
- Frontend TEST commit `a9fa03f589fa25a633d291f992ec455400a07aaa` published the bounded failure presentation and cache markers. Pages run `33422628600` and App-Ready run `33422629880` both succeeded; the complete frontend unit suite passed 1,313/1,313 and the focused Chromium suite passed 5/5.
- Frontend TEST commit `9a3723d26de44aebe802832d880b58a867bdddfa` made the rendered payment rows the sole owner of the expanded-group count and published the `20260831-r7` cache marker. Pages run `33425905348` and App-Ready run `33425907115` both succeeded; the complete frontend unit suite passed 1,313/1,313 and the focused Chromium suite passed 5/5. The reader, selection, mutation, Draft and financial authorities were unchanged.
- Real signed-in deployed TEST evidence loaded the `20260831-r7` Candidate Banking asset and stylesheet, opened Kier Arthur from the current Ready list, retained 22 payment groups paged exactly 10/10/2, and expanded the previously failing 05/07/2026 group. The endpoint's three presentation rows comprised one intentionally non-payable parent/context row and two real payable payment segments; the renderer correctly omitted the duplicate context row and the footer truthfully displayed `2 payment segments`. The spinner cleared, no compact error or raw internal response code appeared, the phone-sized `Close` action was visible/enabled and closed the child cleanly, and the parent Banking Pay modal remained open on the same Ready list with the same headline, Candidate rows, selection states and page. No selection, Create Draft, snooze save, provider, payment, settlement or remittance action was performed.
- Policy X assessment: compliant. This is a pre-Draft read-envelope and failure-presentation correction. It does not alter eligibility, economics, rates, VAT, ERNI, PAYE/Umbrella treatment, recovery/headroom, Draft input, frozen post-Draft artifacts, provider execution, settlement, remittance or cancellation.

### 31 August 2026 — Candidate Banking selection-response bound and mobile closure

- Real signed-in TEST evidence reproduced a Candidate Banking selection failure for the larger candidate. The old screen had 50 current Ready payments, displayed 28 of 28 selected payment segments after the user unticked a Timesheet group, and exposed the internal code `BANKING_PAY_V2_READY_TOO_LARGE`. After the bounded reader was deployed, a fresh authoritative open showed 26 of 28 selected. The earlier statement that the server had rolled the request back was therefore unsupported: the old screen had failed to adopt current selection authority and had remained visibly stale.
- The failure was response size, not invalid payment data and not a financial calculation error. The normal Candidate Banking reader requested 25 complete Ready rows, while the hidden authoritative read-back used after a selection still requested 100. Complete Ready rows now include the existing breakdown, rate, resolution, snooze and Timesheet-family facts; the larger candidate's current response could therefore exceed the existing 512 KiB fail-closed guard even though the same 25-row limit had fitted earlier data. The accepted selection and its follow-up presentation read are separate boundaries: failure of the latter is not proof that the former did not occur.
- Candidate Banking and every candidate-scoped post-selection/read-back path must use the same exported bound of 10 complete Ready rows per opaque server cursor. The main Banking Pay list remains independently bounded at 100 candidates per page. No field, payment, segment, resolution, control, total or selection state may be omitted to fit: paging changes only how many complete rows travel at once. Candidate-wide totals and selection state remain server-owned across the complete candidate scope, never the loaded child page.
- `BANKING_PAY_V2_READY_TOO_LARGE` and `BANKING_PAY_V2_SELECTION_TOO_LARGE` must never be displayed as raw codes and must never be used to claim that the selection did or did not change without a current-authority read. A size rejection returned before a mutation is accepted triggers one bounded read-back before another intent may run. A size failure encountered after an accepted mutation triggers the same bounded current-authority read-back and adoption. The mutation is never retried automatically. Only if that read-back also fails may the interface remain fail-closed and ask the user to refresh; it must use plain wording and keep Create Draft unavailable.
- On a mobile viewport, Candidate Banking remains a bounded top-layer child. Its heading and `Close` action stay in the reachable top area while the complete payment table owns the internal vertical and horizontal scrolling. The child uses the visible dynamic viewport and safe-area insets; scrolling payment rows must not move the close action off the top of the child.
- Local executable evidence for the first bounded/mobile release passed 1,277/1,277 frontend unit tests. The focused contract proves the 10-row bound in ordinary child reads, mutation responses and hidden current-authority read-back; it rejects the former 100-row recovery request, prevents raw internal-size codes from becoming visible, and asserts the mobile close/header and bounded-scroll rules. A real 390 x 844 browser fixture retained the `Close` action before and after expanded payment content was scrolled.
- Frontend commit `fa7c4405024dd7785bef587e775138ee18426ca3` deployed successfully through TEST Pages run `33351972880` and App-Ready run `33351973648`. In the real signed-in mobile-sized browser, Kier opened with 50 complete Ready payments and the authoritative 26 of 28 selected segments; the second 10-row page loaded without HTTP `413`. One exact selected Timesheet group on 15/03/2026 was unticked, the authoritative selection settled at 25 of 28 without a raw code, and that same group was reticked. Candidate Banking returned to 26 of 28 after reopen, preserving the exact state present at the start of the acceptance. The `Close` action remained visible after expansion and internal scrolling, and the parent retained Ready to pay `£450.00` with Kier at `£0.00`. No Create Draft, provider, settlement or payment action was performed.
- The post-acceptance settlement correction adds executable cases for both bounded-response rejection codes and for an accepted mutation whose open Ready response is too large. The complete frontend unit suite passes 1,280/1,280. These tests require one current-authority read-back, one atomic adoption and zero mutation resubmission.
- Final settlement commit `5d34987731ca1f69b16c090b0b4cb858397714c2` deployed through TEST Pages run `33352609660`; App-Ready run `33352610222` passed both the Office/UI seam job and the complete Candidate/Client real-handler browser regression. The deployed asset markers were proved as `banking-pay-modal-v2-settlement.js?v=20260831-r2` and `banking-pay-modal-v2-integration.js?v=20260831-r2`.
- The final signed-in deployed acceptance repeated the exact reversible selection proof after that settlement change. Kier opened with 50 Ready payments and 26 of 28 payment segments selected. The selected 15/03/2026 Timesheet group was unticked once and settled at 25 of 28 with no internal code; that exact group was then reticked once and settled back at 26 of 28. Closing and reopening Candidate Banking retained 26 of 28, the parent retained Ready to pay `£450.00` and Kier at `£0.00`, and the child `Close` action remained visible. No Create Draft, provider, payment, settlement or remittance action was performed.
- Policy X assessment: compliant. This is a bounded presentation and response-transport correction. It does not change selection economics, eligibility, recovery/headroom, Timesheet validity, rates, VAT, ERNI, PAYE/Umbrella treatment, Draft input or frozen post-Draft authority.

### 30 August 2026 — stable Banking Pay publication and usable payment-snooze editor

- The Banking Pay parent now has one visible publication boundary. Opening and reopening the modal may show the compact loading presentation until current Workbench authority arrives, but it must not publish a retired or partially populated Banking layout between loading and the accepted current presentation. The parent table, section counts, selected headline, Draft action and current filters are adopted from the same accepted controller state. Frontend commits `99ad622`, `9cb24cf` and `e108633` established and then reset this single-render controller correctly between opens.
- Real signed-in deployed TEST evidence proved the settled parent twice without a wrong-screen flash: Ready to Pay `£450.00`, Baljit Rai-Baptiste `£450.00`, Kier Arthur `£0.00`, Action Required `4`, Blocked for Pay `5`. The compact loading view remained visible until the current presentation was accepted. No selection, Create Draft, provider or payment action was performed.
- A nested Banking payment-snooze editor must retain the existing snooze authority and payload; presentation does not create a second mutation path. `PRE_OPEN` and `PRE_SAVE` validation remain mandatory, and the established upsert continues to receive the exact session, identity, target, date/indefinite and note fields. The editor remains scoped to the selected payment or segment; it does not broaden the target or infer financial ownership from displayed text.
- The shared modal footer is now visible for the Banking payment-snooze child, so `Apply Snooze` is always reachable within the bounded desktop and mobile viewport. The prior blanket Banking-footer suppression must not be reintroduced for this child. Dirty close uses the branded `Discard changes?` confirmation with `Keep editing` and discard actions; it must not call a native browser/Windows confirmation prompt.
- The target summary uses concise user-facing wording once: `Shift payment` for a segment, the human date/time, candidate/client context, and role/band. It must not expose UUIDs or stable keys, repeat `Specific segment` / `Segment payment`, repeat the candidate, or render `Band Band 6`. Current snooze and the exact post-save destination remain visible. Indefinite snoozes continue to be available only in Loans / Snoozes; a dated snooze may state that the payment remains in Blocked for Pay until the chosen date.
- Frontend commits `20526f5`, `a51d9a5` and final cache-publication commit `8d5bab4` own this correction. The generated legacy Candidate Banking detail renderer was reconciled mechanically with the source owner; no independent legacy behaviour was invented.
- Source evidence passed `node --check`, generated-detail parity, 20/20 focused snooze/action/cache unit checks, 2/2 mobile Snooze Playwright cases and 5/5 combined Banking modal/Snooze Playwright cases. The mobile test proves the visible `Apply Snooze` action, exact validation/upsert wiring, branded dirty-close prompt, return-to-edit behaviour and zero native dialog events. The full source suite passed 1,381/1,382; the sole failure was independently present on the prior deployed baseline and concerns the unrelated dormant break-entry preference assertion.
- Real signed-in deployed TEST evidence against `8d5bab4610185d751e9b87ca3cd05fbeba7007e2` opened Baljit's Candidate Banking, expanded the three payment segments and opened the first segment's Snooze editor. The deployed screen showed the compact dark-theme target card, `03/07/2026 • 09:00-17:00`, Baljit and the client once, `Role CPN • Band 6`, current snooze, post-save movement, date/note controls and a visible in-viewport `Apply Snooze`; it showed no doubled band, repeated segment label or technical identity. This deployed inspection was deliberately read-only: it did not save or change a real snooze.
- TEST Pages run `33290142796` and complete App-Ready workflow `33290143210` succeeded for `8d5bab4`, including the real modal-handler browser regression job.
- Policy X assessment: compliant. No amount, eligibility, selection, recovery, resolution, rate, VAT, ERNI, PAYE/Umbrella, Draft, batch, provider, settlement, remittance, cancellation, database or backend authority changed.

### 29 August 2026 — bounded Candidate Banking detail and stable child-modal ownership

- Real deployed TEST evidence proved that Candidate Banking failed for the larger real candidate because the Ready-detail request asked for up to 100 complete rows in one response. The candidate had 51 effective Ready rows: limits 50 and 100 exceeded the existing 512 KiB response guard and produced HTTP `413`, while the other candidate's four rows remained below the guard. This was not invalid candidate data and was not repaired by omitting fields, rows or controls.
- At that release, Candidate Banking was reduced to at most 25 complete Ready rows per existing opaque server cursor. Rollback-contained read-only measurements at the time proved the larger candidate as three complete pages: 25 rows / 250,462 bytes, 25 rows / 333,692 bytes and 1 row / 31,308 bytes. The later 31 August response-growth evidence above supersedes that historical child-page bound with 10. The main candidate list remains independently bounded at 100 candidates per page. Candidate-wide selection state and totals remain server-owned across the complete candidate scope; detail paging never turns a loaded page into the selection authority.
- Opening, paging and closing a read-only child surface is explicitly distinguished from a selection mutation. Read-only navigation no longer disables or fades the parent candidate checkboxes; selection mutations, reconciliation, transport uncertainty and Draft-safety settlement remain fail-closed and continue to lock affected controls.
- Candidate, Action Required and Blocked for Pay detail surfaces are mounted as fixed top-layer children of `document.body`, outside the parent Banking modal's scroll layout. The child retains the established dark-theme controls, desktop-only compact row presentation, bounded internal scrolling and existing legacy action handlers. Closing it hides the child, preserves the parent tab/page, and restores focus without moving or rebuilding the parent modal.
- Executable evidence passed 1,267/1,267 frontend unit tests and 3/3 local Chromium policy tests, including a 100-candidate one-line main page, exact parent rectangle before/during/after the child, enabled selected checkboxes while the child is open, top-layer ownership, retained dark button styling and suppression of the mobile-only duplicate desktop summary.
- Real signed-in deployed-browser evidence against frontend commits `59f02a48aecd98dab7cffb68acadbd2f80df63d4`, `edc7428d61de78a659502acb1fe57a328425d67e` and final presentation commit `b9c1a92355211601be98cafd398ed5361e0a29ac` proved: Baljit Candidate Banking opened in 1,179 ms; Kier Candidate Banking opened in 1,495 ms; Kier's second and third pages settled in 1,718 ms and 1,050 ms; the third page was terminal; both selected parent checkboxes remained checked, enabled, fully opaque and purple; the parent rectangle and scroll position were byte-for-byte equivalent before, during and after both candidates; Action Required and Blocked for Pay rows opened separate top-layer details in 1,650 ms and 1,462 ms without parent movement; and the final browser log contained no Banking Pay error or HTTP `413`.
- TEST Pages deployment run `33279218751` and complete App-Ready workflow `33279219123` succeeded for the final presentation commit.
- Policy X assessment: compliant. No amount, eligibility, selection, recovery, rate, VAT, ERNI, PAYE/Umbrella, Draft, batch, provider, settlement, remittance, cancellation or database authority changed. No Create Draft, selection mutation, provider action or payment action was performed during the deployed acceptance proof.

### 29 August 2026 — historical source-authority compatibility repair

- Real TEST evidence found four queued Candidate refresh instructions across three candidates which had been created by the pre-upgrade dirty-trigger path before the current authority-fingerprint writer was installed. Their source-build run identities were valid, but the required fingerprint evidence was absent. The current claim correctly rejected them with SQLSTATE `22023`; because the parallel two-call source route bypassed the older general poison-repair pass, the same terminally unclaimable instructions remained queued and repeatedly blocked Banking Pay refresh.
- The accepted correction follows the already-established replacement-session precedent: under the Candidate serial and exact row locks, every proved-invalid queued instruction for that open session/Candidate is marked `DEAD`, its terminal shape is recorded, and the existing orphan-owner repair plus canonical Candidate refresh enqueue elects the current owner. No old payload is patched and no amount, selection, recovery, timesheet, case, Draft, provider, payment, settlement or remittance authority is introduced.
- The rollback-contained PostgreSQL 17.6 first-use proof recreates the exact fingerprint rejection, includes two invalid instructions for one Candidate, includes a second Candidate with an already-valid canonical owner, proves three terminal audit rows, proves consistent scope/Candidate-state ownership, proves replay idempotency and service-only ACL, and proves unchanged Draft/batch/provider/settlement/remittance counts. The correction remains subject to the complete NEW/UPGRADE, installed-hash, deployed Worker and real-browser acceptance gates before it is described as released.

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

### 18 August 2026 — finance cancel/restore adoption clarification

- A successful financial clear or restore RPC is not same-modal completion. Completion requires the still-open modal to show the exact postcondition, remove every stale opposite-section alias, expose the correct canonical action, and render `data-progress-active="false"` without closing or reopening.
- Candidate-scoped successor rows and all first pages that own Ready, Cases / Resolutions, and Blocked placement must belong to one accepted session revision before a terminal render. A mixture of a current candidate graph and prior-revision section-page caches is not publishable UI state.
- The restore path may legitimately keep the same Workbench session version while advancing the progress/generation authority. Tests must prove a current exact owner and exact row/action postcondition; they must not invent a mandatory `session_version + 1` rule.
- The modal must publish one terminal render only after the candidate graph, section pages, progress authority, and refresh-state aliases agree. Clearing only polling flags, or obtaining correct rows only after modal reopen, is insufficient.
- Frontend commit `a204ffdaa3930a90797da22f8a6cb81f4a690a47` synchronized accepted candidate and section-page revisions but did not close the strict same-modal restore condition in live TEST: the restored owner and fresh-open modal were correct, while the original modal failed to reach the combined restored-and-terminal condition within 120 seconds. Treat this commit as diagnostic progress, not final closure.
- Policy X assessment: no payment economics, recovery headroom, frozen Draft artifacts, provider execution, settlement, or remittance authority changed.

### 18 August 2026 — active-batch frozen linked-timesheet exclusion

- TEST batch `4f87739e-6e6f-48db-acad-5702bb2e198a` proved an older valid frozen `OVERPAYMENT_RECOVERY` shape whose direct `pay_batch_items.timesheet_id` was null while the exact timesheet identity was retained at both `frozen_source_basis_json.linked_timesheet_id` and `frozen_component_snapshot_json.source_basis_json.linked_timesheet_id`.
- The existing batch-mutation overlay and active-batch preview readers recognised a direct item timesheet ID and the older top-level frozen `timesheet_id`, but not these sealed linked-timesheet paths. This allowed one already-reserved `TS_DAY` allocation component for £25.00 ex VAT to be reselected and shown in Ready to Pay after a live source refresh.
- The verified correction extends only the existing exact frozen-timesheet identity resolution in `pay_workbench_patch_preview_after_batch_mutation`, `pay_workbench_session_get_candidate_preview`, `pay_workbench_session_get_preview_page`, and the independent `pay_workbench_prepare_draft_scope_seed` fail-closed guard. It does not add a live finance identity fallback or a new economic-key derivation rule.
- Staged definitions compiled in rollback, canonical definition hashes matched the catalogue, and a James-specific rollback runtime proof returned zero target rows from both readers, one exact Draft-guard match, one exact overlay patch, and unchanged batch/item/reservation state. Focused source tests passed 93/93 before installation.
- Installed TEST verification showed the target row selected count `0`, NOT_SELECTABLE count `1`, both public-reader target counts `0`, no active Workbench jobs, and an open session at version `51`. The signed-in TEST browser then showed no James £25.00 Ready row and no James Cases / Resolutions row.
- Financial invariants remained: scheduled/not-submitted batch; eight active frozen items; £35.63 ex VAT / £42.76 inc VAT net; four recoveries totalling £-755.00 ex VAT / £-906.00 inc VAT; four COMMITTED reservations totalling £755.00; zero RELEASED reservations.
- This evidence proves the Workbench exclusion and Draft fail-closed boundary for the observed artifact. It does not by itself prove future-payment cancellation, settlement, provider submission, remittance, or every historical frozen payload shape.
- Policy X assessment: compliant. Post-Draft exclusion uses only frozen batch artifacts; the pre-Draft certified source builder, payment economics, reservations, provider state, settlement, and remittance owners were unchanged.

### 19 August 2026 — terminal historical Draft-cancellation retry recovery

- A failed legacy cancellation attempt remained terminal `BLOCKED` after its reviewed communications count changed, while the batch itself remained a current `DRAFT`, `NOT_SUBMITTED`, with no provider submission or money-movement evidence. The status reader incorrectly gave the historical work label precedence over the current exact cancellation diagnostic, permanently hiding `DRAFT_CANCEL`.
- The verified correction changes only `pay_batch_payment_status_page_v1` and the matching status-filter precedence in `pay_payment_correction_selection_prepare_chunk_v1`. For a `DRAFT` only, the current exact diagnostic now governs a fresh retry; scheduled and executed non-Draft cancellations retain all historical-work fences.
- The installed TEST reader now returns `ACTIVE`, `DRAFT_CANCEL`, `pre_provider_cancel_eligible=true`, no stale blocker, and no stale failure reason for the observed £72.76 Draft. The old correction request and work item remain terminal `BLOCKED` audit evidence.
- Before and after installation, the Draft remained `NOT_SUBMITTED` with seven active frozen items totalling £72.76 and three committed reservations totalling £730.00. No batch, item, reservation, communication, provider, settlement, or financial row was changed by installation or verification.
- Exact staged Git blobs compiled in a rollback-only TEST transaction. The complete Banking Pay source suite passed 717 tests with zero failures and 17 intentional skips before installation. Installed owner, security-definer configuration, search path, timeouts, ACLs, and canonical hashes matched the catalogue authority.
- This evidence proves safe retry visibility and reader/preparation parity. It does not by itself prove the subsequent user-authorised cancellation lifecycle, Workbench rebuild, or same-modal closure; those remain to be exercised end to end.
- Policy X assessment: compliant. The change does not recalculate or reinterpret any frozen amount and does not alter provider, execution, reservation, settlement, remittance, email, or Workbench economics.

### 20 August 2026 — active-reservation partial recovery residual

- The active-batch exclusion remains strict for fully reserved `OVERPAYMENT_RECOVERY` rows, but exact physical overlap alone must not suppress a genuine unreserved balance. The canonical pre-Draft publisher now freezes a versioned residual contract containing source outstanding ex VAT, current active reserved ex VAT, and residual outstanding ex VAT.
- Both Workbench readers validate that contract against one current set-wise active-reservation aggregate. They may publish only a strictly positive, current residual and retain the established strict frozen-sibling fence. Missing, malformed, stale, candidate-mismatched, or arithmetically inconsistent evidence is suppressed rather than inferred.
- TEST catalogue hashes were pinned as follows: residual validator `4317bb7fbf6fd222fc26133fa08c931b2a9d23f0cc60ff71522ff930f59d344a`; canonical publisher `9216d9e6c3c73514149dc20e93b75648c42ffd6850b0eaff2fbe4764e713c0b5`; candidate reader `7e669a4dd7d00e332207161460444ced8d71045c1549ef837e8e8b19d25aab2b`; page reader `99309bf519fa791b05249f74fc0c3de2079006f9eed64fd3dbf3e6ca25486b48`.
- Bounded TEST proof found 13 current Ready recovery contracts and 13 valid residual validations, with zero malformed or invalid rows. The two public readers returned identical 63-row identities before frontend filter/adoption, cursor paging remained stable, and the combined eight-call plan executed in 876.27 ms without shared or temporary reads/writes.
- The seven-item active James Draft reconciled to £948.76 positive inc VAT, £-876.00 recovery inc VAT, and £72.76 net bank amount. Its three active reservations totalled £730.00 ex VAT and were absent from Workbench presentation; the separate unreserved £25.00 control remained exactly once under resolution authority.
- A normal TEST browser refresh completed without a Banking Pay failure and showed 60 Ready lines. No fully reserved James recovery from the active Draft was shown. The unrelated authenticated capability probes continued to return 401 and did not fail a Banking Pay request.
- Backend commit `28265873244bb5345440078c38a2a7921ded5334` was published to `test`. Safe migration run `32384500076` passed the PostgreSQL 17.6 and 18.1 candidate-runtime gates, source/catalogue verification, and the TEST repeatable replay. The four installed catalogue hashes still matched the published manifests after that replay.
- The browser proof is an exclusion and refresh-health proof, not proof that every server-owned section is visible in every signed-in session: the final signed-in browser showed 60 Ready, 0 Cases, and 0 Blocked rows, while the bounded direct reader proof performed earlier returned 60 Ready, 1 Case, and 2 Blocked rows for its inspected session. A later investigation must identify the exact session/user/filter/adoption reason before claiming complete browser-to-reader parity; it must not weaken the residual or frozen-reservation fences to make the counts agree.
- Policy X assessment: compliant. The new contract is frozen by the canonical pre-Draft publisher and validated only against active reservation ownership. No post-Draft live finance-component fallback, new economic-key ladder, recovery/VAT/ERNI/headroom calculation, Draft artifact, provider, settlement, remittance, or cancellation authority changed.

### 21 August 2026 — atomic selection-result Ready/Blocked refresh

- Frontend commit `6ef2285868bcab8c59272aba8b62ddc6d321bbc6` changes only the accepted selection-result refresh path. Individual rows, grouped rows, the Ready header and explicit all-page selection actions pass one exact queued selection epoch into their existing mutation owner.
- The accepted row-selection response remains the membership/readiness authority. Only a response matching the active session and carrying a valid session version and progress revision may launch the paired section refresh. An older or superseded selection epoch cannot publish page results or perform a terminal success render.
- Ready and Blocked page reads now start concurrently in deferred mode. Deferred reads do not mutate page state, cursors, loading/error state, compatibility aliases, scroll position, or the DOM. Both returned pages must match the accepted session ID, session version, progress revision and requested/resolved section, must contain unique non-empty row identities, and must be disjoint across Ready and Blocked.
- One new narrow owner, `adoptSelectionMutationReadyBlockedPagesV1`, stages a cloned Draft Workbench wizard, supplies direct Ready and Blocked authority to the existing `applyPayWorkbenchPreviewToState` owner once, retains Cases / Resolutions and mutation-owned selection/readiness fields, commits only after complete validation/adoption, and marks the exact intent `ADOPTED`. A request, validation or adoption failure marks the exact intent `FAILED`, publishes neither partial section and releases the normal watcher recovery path.
- The same-revision watcher suppresses only duplicate Ready/Blocked page work for the exact current selection epoch while that pair is `PENDING` or `ADOPTED`. Failed, older and newer revisions continue through the established authoritative watcher path.
- The full Banking Pay unit set passed 240/240, including executable atomic Ready-to-Blocked and Blocked-to-Ready transitions, cross-section duplicate rejection, mismatched-tuple rejection, no-partial-commit failure and exact watcher suppression. The complete focused Playwright file passed all applicable current-state cases; four precondition-dependent cases were intentionally skipped because their old server-selected/Kier fixture was absent.
- Patched-asset and deployed-asset Playwright both used the normal TEST origin and normal TEST backend. The deployed run settled one real TEST selection in 1,562 ms versus the captured approximately 26.8-second baseline, issued exactly one selected-row request plus one concurrent Ready GET and one concurrent Blocked GET, retained the open Banking modal, left Cases / Resolutions unchanged, produced zero cross-section duplicate identities, and restored the original selection plus the exact original Ready/Blocked presentation hash.
- GitHub Pages run `32480773533` deployed the commit successfully. The served `main.js` matched the committed bytes exactly; the served `index.html` matched after normalising GitHub Pages line endings, and both `20260821` selection-refresh asset markers were present.
- No backend source, SQL, database object, reservation, Draft artifact, batch, provider, settlement, remittance, cancellation, recovery amount, VAT, ERNI or headroom calculation changed. Policy X assessment: compliant; this is presentation/adoption orchestration only and introduces no post-Draft live fallback or economic-key derivation.

### 21 August 2026 — render-consumed preview-wrapper page-cache closure

- Exact live diagnostics found that the accepted atomic Ready/Blocked pair was installed on the Workbench, accepted envelope, and `preview.data`, but not on the renderer-consumed `draftWizard.preview` wrapper. The renderer intentionally reads that wrapper for compatibility, so its stale canonical page could reintroduce a recovery that had already moved to Blocked under current server authority.
- The correction adds the `draftWizard.preview` wrapper to the existing page-alias installation owner. All six compatibility aliases on all four roots now reference the same bounded accepted page graph. No new fetch, page merge, renderer source, fallback, or economic owner was introduced.
- The focused frontend suite passed 241/241. The new executable regression seeds a stale Ready recovery only on the wrapper cache, proves the prior source fails, and proves the correction replaces every alias with the accepted disjoint Ready/Blocked graph.
- Patched-asset Playwright on the normal TEST origin and backend proved the current James last-positive-headroom lifecycle without modal reopen: promoted recovery in Ready, last positive unticked, zero recovery rows in every Ready cache root, recovery present only in Blocked, no cross-section duplicate, and the original selection restored. Mutation settlement was 1,766 ms and 1,558 ms.
- Bounded TEST database verification after restoration found the current open session READY at version `51`; James had zero selected rows and zero selected recoveries. No Draft, payment, reservation, provider, settlement, remittance, cancellation, or database definition was created or changed by this frontend correction.
- Policy X assessment: compliant. The patch adopts server-owned pre-Draft presentation authority only; it does not recalculate recovery headroom or alter frozen post-Draft artifacts, financial identity, VAT, ERNI, amounts, provider state, settlement, remittance, or cancellation behaviour.

### 22 August 2026 — fail-closed Draft action during selection settlement

- Exact deployed TEST diagnostics reproduced a transient mismatch: the checkbox and selected-count display changed optimistically while the Draft action retained the prior `Select rows` state until the accepted selection response and concurrent Ready/Blocked adoption completed. Database authority for the observed open session already reported two selected, Draft-eligible rows and `ready_for_draft=true`; no eligibility, amount, recovery-headroom, or Draft-authority defect was found.
- The narrow frontend correction extends only the existing selection-controls busy owner. A real selection request immediately presents `Updating selection…`, native-disabled plus ARIA-disabled/busy, and remains fail-closed. When the authoritative renderer replaces the action, that renderer wins; when no replacement occurs, only the exact prior element state is restored.
- Focused unit/cache checks passed 11/11, the complete Banking Pay unit suite passed 242/242, and patched-asset Playwright on the normal TEST origin/backend proved both immediate disabled busy state and authoritative settlement while restoring the exact original two-row TEST selection. No Draft was created.
- Policy X assessment: compliant. This changes transient action presentation only. It does not infer Draft eligibility, calculate any amount/headroom, add a frontend economic authority, or alter frozen Draft, provider, settlement, remittance, cancellation, database, or backend behaviour.

### 22 August 2026 — read-only Supabase security boundary audit

- A whole-TEST-database read-only Advisor/catalogue audit confirmed that the supported CloudTMS data path is Worker/service-role based and that a database-wide MFA pre-request hook is only a compensating control, not a substitute for object-level RLS and privileges.
- The approved future target is staged least privilege: Worker-only application tables stay fail-closed to browser roles with RLS enabled and no permissive policies; application views use invoker rights; internal RPCs and sequences are unavailable to browser roles; default privileges prevent silent regrant; and the exact Worker and MFA contracts are preserved and latency-tested.
- Security installation remains separately scoped and unapproved. It must be rehearsed and verified in TEST by bounded object/signature manifests and post-repeatable migration gates before any LIVE migration. TEST-only authentication exceptions must never be copied to LIVE.
- No database, Auth, API, RLS, privilege, function, view, extension, index, connection, Banking Pay, or financial object was changed by the audit. Policy X was not touched.

### 22 August 2026 — verified TEST browser-isolation security phase

- The approved non-LIVE phase was subsequently installed only on the `test-cloudtms` Supabase project. It excluded the completed Candidate/MyTMS boundary and every Candidate-named object, preserved the database MFA pre-request hook, enabled fail-closed RLS on 126 audited non-Candidate relations, removed direct `PUBLIC`/`anon`/`authenticated` authority from those relations and eight sequences, changed 20 audited non-Candidate views to invoker rights, and removed browser execution from 403 audited non-Candidate security-definer RPC signatures. Exact pre-state count/hash guards stopped the migrations if the inspected catalogue differed.
- The Worker remains the application data broker. Its required `service_role` table, sequence, view and RPC privileges were retained and verified. One legacy Worker helper was made fail-closed so it cannot substitute a service-key or anonymous browser credential for `SUPABASE_SERVICE_ROLE_KEY`.
- Default privileges owned by the application migration role now retain the Worker authority and deny automatic future browser grants. Supabase-managed owner defaults were not forcibly changed. The repository migrations accept only the exact audited pre-state or the exact verified already-installed state, so a management-first TEST install can be safely adopted by the GitHub ledger without replay drift. The migration workflow now runs both the general browser-isolation verifier and the unchanged Candidate/MyTMS verifier after repeatables and one-time migrations, preventing a later migration from silently weakening either boundary.
- Post-install TEST verification passed both SQL boundaries, the normal backend health/readiness probes, the 735-test backend suite, the new service-role fallback regression, and all 112 Candidate broker/boundary tests. Candidate registration/read/write/daily/notification/manager/paper and related feature flags remained false; Candidate accounts, active sessions/challenges/approvals and pending Candidate mail remained zero; client and contract paper enablement remained zero.
- Supabase Security Advisor findings fell from 756 to 292, with errors falling from 103 to 13 and warnings from 552 to 106. This is not a claim that the legacy TEST database is fully clean: the remaining Candidate-named objects stay outside this phase for the App-Ready owner, mutable function search paths and public-schema extensions require separate dependency-aware work, and the remaining fail-closed RLS-without-policy notices are expected. Those deferred areas must not be changed merely to clear Advisor counts.
- No application row, permissive RLS policy, function body, view body, economic key, amount, VAT, ERNI, recovery headroom, Draft artifact, provider, settlement, remittance or cancellation rule changed. Policy X remains intact. Before any later LIVE migration, re-establish the exact LIVE catalogue and dependencies, preserve the Candidate/MyTMS boundary and Worker/MFA contracts, rehearse the migration independently, and rerun both verification files; TEST-only authentication exceptions must never be copied to LIVE.

