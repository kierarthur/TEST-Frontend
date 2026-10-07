# Candidate header and protected-pay acceptance — 4 October 2026

## Local Office change

Candidate agency status is a single green Active / red Inactive header badge,
following Currently Working when that badge exists. The separate Additional
details section and added activation guidance have been removed. MyTMS access
remains a separate status and authority.

View and saving modes disable the control. Edit/Create toggle only the staged
Candidate model, dirty the modal, and update its hidden form value. Candidate
Save owns the database write, including when saving from another tab. Discard
restores the saved status. No badge click makes a network request.

Local browser fixture verification passed: placement with and without Currently
Working; actual green/red styling; View disabled; Edit enabled; toggle without
any write; retention across tabs; Save from Payment details persisted exactly one
Candidate update; Discard restored the saved value. Fixtures use example.invalid
identities and do not write to hosted TEST or LIVE. Focused Candidate / Weekly
Source unit tests: 191 passed, zero failed. Existing browser regression title
expectations were updated for the new header badge; this does not claim a new
full-suite browser run.

## Hosted protected-pay gate remains unsatisfied

The exact Kier Arthur manually queried 8 September imported shift was exercised
in the hosted browser: imported 01:00–04:00, 30-minute break; protected finish
05:00 (3h30m). The reviewed empty-family repair lets the request reach its staged
C1 publication state, but the save still does not complete.

Cloudflare request telemetry shows the publication command returning 404.
Arthur's account-specific rollback lab inspected pg_proc on cloudtms_test_clone:
weekly_source_start_c1 and weekly_source_status_c1 are absent from every schema.
The producer's request-reader function exists and the exact request reads READY.
Thus this is not a successful save and not a Cloudflare connector outage.

Protected database workflow 37170110988 completed successfully at 02:36 UTC for
backend commit 23aa32eef75ea219afffbbb9b2fe2faa7fba38c8. The desktop coordinator
recorded VERIFIED_OR_EXACT_UNCHANGED for the database and UNCHANGED for the four
Workers (runtime commit 44aa2056e32da3a7e7d11a13b0c5ca5bda6d85f3); no Office
publication was requested. A fresh account-specific read-only catalogue check
at 02:39 UTC still found zero start/status functions on cloudtms_test_clone,
including on the tool's separate fresh verification connection. Successful
repository database verification is not proof of this missing upstream runtime
integration or a successful protected-pay save.

The repository's C1 compatibility specification assigns that publication
authority to separately owned Banking Pay / Workbench. The HANDOVER 2 chat is
actively replacing that subsystem and its protected-source integration is not
yet marked complete. Do not invent a replacement finance pathway, discard the
staged request, create a duplicate shift, or import another chat's unreviewed
work. Coordination permission has been requested from the user.

The user then explicitly authorised coordination, warning that HANDOVER 2's
replacement is still unfinished. The exact dependency evidence was sent to that
chat, requesting a compatibility/readiness verdict and a safe independently
releasable boundary if one exists, not permission to rush or deploy its draft
replacement. HANDOVER 2 acknowledged the dependency and is investigating.
No changes were made to its worktree and no unreviewed code was imported.

Additional local browser checks passed for Create mode: the Active control is
enabled, Inactive is staged, and the POST on Save preserves active=false. New
executable browser cases cover cross-tab staging, Discard restoration and both
existing/new Candidate Save paths. Those new cases are recorded as added, not
as an executed full automated browser suite.

At that checkpoint, the user required Kier's save to pass in the browser before
publication. The header change remained local and unpublished, Android version
26 was built but unreleased, and the USB phone retained version 24. This is
historical evidence, not the current release status below.

Independent checks continued after coordination: the USB package remains
versionCode 24, installed by com.android.vending; the completed local Candidate
fixture server was stopped. The disposable, task-owned Docker container and
volume codex-protected-empty-family-pg17-20261004 were removed after their tests
completed. Docker volume usage fell from 2.357 GB to 1.728 GB (about 629 MB
reclaimed inside Docker); no shared image, other task's container/volume, or
Windows Docker virtual disk was removed or compacted.

HANDOVER 2's acknowledgement was not a compatibility approval, completed
implementation, or deployment receipt. Its unfinished work was not imported.

## Latest verified position — 13:01 UTC, 4 October 2026

The user ruled that Source Save must not wait on unfinished Banking Pay C1
start/status RPCs. The candidate fix completes the existing staged decision
locally through E25 before first Authorise, or the unchanged common-head
publisher after first Authorise. It never authorises automatically, calculates
a Banking Pay residual, executes payment, or changes an existing Draft amount.

Arthur's always-rollback TEST lab proved the exact Kier staged Save: 3.5 approved
hours, one unauthorised financial snapshot, exact idempotent replay, manual query
resolved as PROTECTED_PAY, and subsequent amendment preparation. Candidate
submitted evidence was preserved. Rollback and fresh-connection absence passed.

The user then explicitly prohibited any change to policy or the information
provided to Banking Pay. All uncommitted approval-anchor publication-format
extensions and their helpers were removed. Existing canonical request,
proposal builder/recorder and common publication core are byte-unchanged from
the reviewed backend predecessor. HANDOVER 2 was asked to clarify the existing
after-authorisation route where no final backing report exists. No answer to
that exact edge is yet recorded here; do not claim that scenario accepted.

With a rollback-only final-source fixture, unchanged-contract tests proved:
authorised Timesheet and every TSFIN row remain unchanged; a frozen GBP100 Draft
stays GBP100/unvoided; Save returns SAVED_PENDING_FREEZE; existing pending release
publishes exactly one common head and refresh job; exact replay returns that
receipt. Removing only the disposable Draft fixture proved the existing release
owner, not the real Banking Pay cancellation journey. Forced dirty-job failure
rolled back the entire save/head/receipt and left the staged request READY.
The artificial final-source fixture is not proof of real report finalisation.

Backend focused regression: 24/24; Weekly Source unit harness passed; Candidate
staged-status control: 5/5. A canonical disposable NEW run passed its portable
verifiers but stopped on the expected unrefreshed schema contract. Its earlier
approval-anchor variant is not the release candidate. A fresh canonical rebuild
of the unchanged-interface candidate is running; no ledger was repaired.

MyTMS TEST internal release 26 (0.1.0) was published at 13:01 UTC and Play Console
explicitly shows Available to internal testers. Code 25 could not be reused.
The existing Testers list (3 users) remains selected; the separate closed tester
list (16 users) remains unselected. No LIVE/production/closed track was changed.
Bundle SHA256: 73b8bac4dc5829163eefc8890c2ff1778507eb6f5c1b3df49f2eaa051c9df59a.
Share link: https://play.google.com/apps/internaltest/4701240900391936141.
Evidence: C:/tmp/mytms-test-internal-26-published-20261004.jpg.

This mobile publication occurred before hosted protected-Save acceptance; it
must not be described as completion of the requested deployment gate or of the
whole task. No new protected-pay database/runtime release or Office header
publication has occurred. USB still reports Play-installed code24 and currently
shows Open, not Update, while Google Play propagates the release. Do not
uninstall or overwrite its Play-signed installation with a sideload.

## Source-absent authorisation and display regression — 4 October 2026

HANDOVER 2 confirmed that authorised protected pay must not wait for an invoice
final report. Its unfinished NEXT producer accepts the existing approval as
source_event_id and permits a null current_final_revision_id, but is not a
deployed compatibility route. The existing LEGACY/common-head producer still
requires genuine final-revision provenance. The after-first-authorisation,
no-final-report producer gap is therefore real and remains unaccepted. Do not
invent a report, change the common request wire, install NEXT draft files or
make approved pay wait for an invoice import to hide this gap.

A fresh Arthur rollback test used the proposed local Save followed by the real
weekly_source_first_authorise_v1, without the artificial final-revision fixture.
Save/replay succeeded; first Authorise returned ok=true and READY_FOR_INVOICE.
The root was authorised, I-7 returned initial TSFIN entitlement of 3.5 hours and
GBP70, and no committed head existed. The candidate approval reader incorrectly
returned NOT_PROCESSED. This is an open presentation regression, not a passing
display acceptance test. The corrected fresh verification proved rollback, the
temporary local receipt table absent and the original root still unauthorised.

The Office protected list already displays Protected pay — awaiting source (or
Ready to reconcile when genuine source is observed). That is reconciliation
status, not a candidate-pay hold. Generic Timesheet status can say Authorised
for Invoicing, but invoice admission still reads only immutable final-source
movements; a protected-only shift must create no source invoice line. These
policy/code checks are not a hosted end-to-end Banking Pay execution proof.

## Current local checkpoint — 5 October 2026

The historical open findings above are not current acceptance claims. The later
Source native proof (`SOURCE_NEXT_PROPOSAL_OFFICE_NATIVE_20261005.json` in the
shared fresh-requirements evidence directory) passed genuine local Save,
first Authorise, amendment/replay, manual-query continuity and Final-source
reconciliation against the compatible Banking owner. The compiled Worker and
actual Office presentation rendered the bound proposal and prepared the existing
decision commands. All fixture facts were rolled back. This does not prove a
hosted Save or execution of those decisions against TEST.

The current Candidate badge remains in the modal header: green Active or red
Inactive, staged only in Edit mode and committed only by the parent Save.
Browser testing found a separate Discard → Edit → toggle → Save failure: the
generic JSON snapshot turned the Candidate rate-deletion Set into an object.
Candidate-only snapshot/restore now copies that Set, rejects malformed deletion
containers, and leaves other entity clones and Save/API semantics unchanged.
The independent Sol6.1 Extra High critic accepted this finite correction.

Owner-executed current local results:

- Candidate staged-control unit tests: 6/6 passed.
- Focused Candidate browser checks: 8/8 passed.
- Full record-modal browser regression: 116/116 passed across desktop, phone,
  large phone and iPad viewports (terminal session 46009, exit 0).
- Weekly Source browser fixture checks: 7/7 passed, including actual pickers,
  retry/close, fixed imported identity and overlap/discard navigation.
- Backend full test suite: 1,447/1,447 passed.
- MyTMS full test suite: 58 suites, 522 tests passed; typecheck and app guards
  passed. Its canonical message audit passed all 1,219 messages after updating
  three generated source-line references only.
- The real protected component calculator proved 09:00–17:00 with a 30-minute
  break is 7.5 hours/GBP75 and the overnight equivalent is 11.5 hours. No
  production calculator or pay policy was changed to obtain this result.

The completed local fixture server was stopped after the browser regression.
The wider Office unit suite still has 14 failures reproduced against its saved
HEAD baseline; it must not be described as fully green. No current DB/runtime,
Office, USB or new Play release is certified by these local results. Joined
installation/security-contract verification and hosted/device acceptance remain
release gates.

## Later same-day release preparation

The mapped database include omission was corrected and independently accepted;
actual PostgreSQL nested-include execution and generated ownership passed with
rollback/fresh-census equality. General release-system tests passed 33/33.
The separate Local completion contact hook now skips PENDING_FREEZE; its
structural negative tests and immediate native journey pass, and the finite
correction is critic-accepted. Actual deferred producer/release and complete
joined non-admin installation remain HANDOVER 2 gates, not proof from mocks.

The Candidate app's complete clean snapshot verification passed (81354, exit 0).
The six reviewed app/config/generated-audit changes are locally committed as
`89b57b72c456ae1d21ce082287ddebbbb0249f48`. A genuine signed Android release
bundle built successfully in 5m50s (32669 / 3d014e, 910 tasks):

`C:/tmp/MyTMS-TEST-internal-0.1.0-27-final-89b57b7.aab`

SHA256: `54AC6F3D0C770EC498784230DAAE8CBAEC1663C580A6E84286BEF4E444E6FF92`.
Independent bundletool manifest reads prove `net.cloudtms.mytms.test`, version
code 27 and version name 0.1.0; independent certificate inspection matches the
accepted TEST upload fingerprint. This is build verification, not publication.

Current authenticated Play Console shows MyTMS Test Internal testing release26,
with its three-person Testers list selected and the sixteen-person closed list
unselected. No tester membership was changed. USB serial RFCRB0RS08T still has
installed version24. Google has now accepted the exact version27 bundle above:
the Internal testing draft lists 27 (0.1.0), API24+, target36, arm64-v8a.
Save as draft returned the visible confirmation "Changes saved. You can now
preview your release before publishing it." This is an unpublished draft;
version27 has not been published or installed on the phone. Screenshot proof:
`C:/tmp/MyTMS-TEST-27-saved-internal-draft-20261005.jpg`.

Arthur's server-owned rollback lab read the existing hosted Kier Sep8 work:
one OPEN manual review with reason TESTING and one resolved prior review. It
proved the exact physical TEST database and fresh rollback connection; no
Save, authorisation, outreach or finance mutation was executed. That existing
OPEN work remains the actual browser Save target after the compatible release.

## Later 5 October verification and Play publication hold

The current focused Office units passed 77/77. The complete Weekly Source browser
run passed 56/56 (session 84272, exit 0): 55 controlled local browser journeys and
the existing hosted TEST read-only layout case. These prove current UI handling,
including confirmed Save closing the modal, picker inheritance, identity locking,
overlap/discard routing, attention filtering, colours and final-charge presentation.
They do not prove a genuine hosted protected Save, Banking payment execution or
the new runtime's deployment. The first browser run exposed one stale assertion
for the finalisation explanation; only that assertion was aligned with the actual
correct wording, "It does not block report finalisation", before the passing run.

The actual approval-duty native test passed with unconditional rollback and an
independently fresh empty connection (30672). The invoice native test also passed
after its runner resolved the reviewed recursive include closure (33105). The
Windows-safe runner is SHA256
`7FDA840CD4008315E18D2B83C712A9010954836E714CFB934F800C83C30C3D02`;
the independent Sol6.1 Extra High critic accepted this finite correction. This
flattened local SQL proof is not managed include execution or full NEW acceptance.

The user's Play preview exposed a build mistake in the unpublished version27:
its signing helper restricted Gradle to arm64-v8a, and Google reported 5,505
previously supported devices lost. The user was explicitly told not to publish.
The corrected source commit is `8c0b3320dc94f2a7cd2a3e50022b48a1d66b2e7b`,
versionCode28, preserving all four architectures. A new read-only final-AAB guard
checks complete native runtimes, TEST package, exact version code and version name;
its four tests pass and it rejects the actual restricted version27 bundle.
Upload-certificate verification remains separately required. Full Candidate
verification passed in the sole canonical snapshot (51591, exit 0), including
the native and web exports. The protected four-architecture version28 build is
running (59327); no successful bundle, upload, publication or USB update is yet
claimed. The phone still has Play-installed version24 at the last actual check.

HANDOVER 2's finite shared installation installed all 293 migrations and 787
repeatables, then stopped at the saved obsolete general security seal. Its current
read-only comparison adds exactly two intended service-only Office readers, with
zero browser-role execution and no removed/changed existing entries. Review of
the seal and remaining native verification are still in progress. There is no
reviewed joined release commit or complete managed deployment receipt yet.

## Later 5 October: corrected Play bundle completed, saved and previewed

The protected version28 build completed successfully (59327, exit0), including
the actual final archive/manifest and upload-certificate guards. The independent
final archive check confirms TEST package `net.cloudtms.mytms.test`, version28,
name0.1.0 and all four complete native runtimes: armeabi-v7a, arm64-v8a, x86 and
x86_64. The final AAB is `C:/tmp/MyTMS-TEST-internal-0.1.0-28-final-8c0b332.aab`,
90,436,061 bytes, SHA256
`11DEB620920E479DCE3F41FA345C9A4E389940694199ACCBA216270CC6C64CED`.
Its accepted TEST upload-certificate SHA256 is
`A0:8D:21:FE:08:8C:15:CB:6C:43:E4:5C:E7:9C:6F:52:B5:C3:4B:87:EE:E8:E0:E5:39:9D:90:BB:AC:9B:E2:72`.

Using the existing MyTMS Test Internal testing draft only, the unpublished
restricted version27 artifact was removed from that draft through Google's
recoverable artifact-library action. It remains in the artifact library and
its local archive is retained. Version28 was uploaded, Google completed its
processing, and Save as draft visibly confirmed that the changes were saved.
The Preview and confirm page now reports zero previously supported devices
lost in every form factor: phones12,251, tablets6,455, TV4, Chromebook10 and
AndroidXR1 remain supported. The only warning is the existing missing
deobfuscation-file warning. No tester membership or closed-testing track changed.
Screenshot: `C:/tmp/MyTMS-TEST-v28-internal-draft-zero-device-loss.jpg`.
Save and publish was not selected. This is not Play publication or USB update.

Fresh read-only Cloudflare checks returned HTTP200 for all four exact TEST
Worker triggers, active deployments and corresponding successful Git builds.
The normal backend trigger remains `5e1207d4-e550-4a74-8135-15d68b2060fa`,
branch `deploy/cloudflare/test-cloudtms-backend`, repository
`kierarthur/cloudtms-backend`, root `/`, command
`npx wrangler deploy --env test`, and the existing managed build-token name.
Both private Workers and the broker retain their separate ordered deployment
branches. All four currently serve commit
`44aa2056e32da3a7e7d11a13b0c5ca5bda6d85f3` at100percent; this verifies current
connections, not a deployment of the pending joined release. Final commit-bound
connection evidence must be refreshed when that reviewed commit exists.

HANDOVER 2 identified a finite feature-activation distinction: a genuinely frozen
Local protected decision may park before the canonical producer, but effective
publication/release through the winning0556 Local-origin branch requires the
compatible NEXT module and capture helpers and refuses the legacy financial
owner. Source explicitly confirmed no retired G01/V8 revival, second financial
protocol or partial NEXT activation. Immediate native contact/frozen-Draft proof
is retained separately; genuine deferred-release acceptance remains outstanding.
The exact minimum approved activation prerequisites have been requested directly
from HANDOVER 2. No unsupported financial path or hosted feature is claimed.

## Later 5 October: closed census regression and exact Source attribution

The inherited Source writer-census test still asserted the hosted physical database
name, although the committed verifier also permits the audited provider-mapped
definition in a qualified local TEST release. The independent Sol6.1 Extra High
critic reproduced the two hashes: removing only the literal provider-specific
`plpgsql_check.mode` setting from the frozen `49fb...` definition yields exactly
`0449...`. The financial body is unchanged. The managed expected-database,
connected-database and target/local-preflight checks retain physical target
authority; this is not permission to use an arbitrary TEST-labelled database.

Only the static test was changed in the Source worktree. Its replacement compares
the complete unique exception condition, preserves every exact conjunct and closing
guard, rejects fifteen mutations (including internal AND-to-OR and missing
TEST/signature/hash/configuration guards), and checks the independent managed-target
preflight. The critic accepted the exact test SHA256
`24FA1CF788BBE0A283FD3F22C07E4720AD010930D9EE51EE791A44DA82DABCB6`.
The seventeen census tests and thirty-three existing release-system tests passed
50/50 (2326c1, exit0). No SQL or financial function body changed in this correction.

The broader Source rerun with the actual MyTMS companion root reports 369 tests:
356 passed, zero failed and thirteen skipped (43f092, exit0). The skips require
explicit local runtime/database settings; they are not runtime passes. Source
integrity also passed with 262 migrations and 714 repeatables (9e8348).

HANDOVER 2 then genuinely executed the census on its existing original-owner NEW8
installation. All thirty-one classified routine pins matched, but the separate
dynamic-SQL inventory check found new helpers and changed legacy projections not
yet explicitly acknowledged in that inventory. Source independently compared and
acknowledged only its four exact helpers: candidate HEAD hours, inventory approval
basis, NEXT owner discrimination and the bounded Office paid-evidence wrapper.
The three containing SQL files are byte-identical between Source and Banking, and
the four exported definition hashes agree with HANDOVER 2's original-owner catalogue.
Their dynamic operations are fixed SELECT statements with bound identities and
the fixed Banking paid-evidence reader delegation, not caller-supplied SQL or
financial mutation. This attribution is not a prefix waiver or full census PASS.
The exact inventory successor and complete managed release remain H2-owned gates.

Fresh read-only TEST evidence confirms the exact Kier acceptance Timesheet exists,
is current and is neither first-authorised nor archived. This permits consideration
of genuine pre-first-authorisation Save acceptance after verified compatible
installation; it does not qualify later financial activation. Play still shows
version28 as an unpublished Internal testing draft and version26 as published.
The USB phone was checked again and still has Play-installed version24. No hosted
Save, publication, phone update or complete deployment is claimed here.

## 5 October: definite Local publisher refusal and same-request retry

The independently reviewed existing Local admission guard refuses a new
already-authorised change before completion when its real publisher is not
ready. The Office client must not confuse that known refusal with a lost
network response. Only that exact structured code or its exact HTTP400 Local
completion RPC refusal now stops automatic unknown-outcome recovery and says
the pay change was not saved, existing approved pay is unchanged and the
request is retained for retry. Earlier preparation/key/payload are preserved;
the next click retries the same original request, never creates another stage
or a new financial decision. Unknown transport outcomes retain their original
recovery path. No SQL, financial writer, Banking policy or activation changed.

Unit/render checks pass31/31 (`9d0bcf` unit portion). Four focused browser
cases pass (`c3d8c1` -> `73fa31`, exit0): existing transient-response recovery,
existing first-prepare refusal, structured Local refusal and exact raw RPC
Local refusal. Both new cases verify no automatic recovery or duplicate
PREPARE, identical request/key on retry, no visible result-check button and
modal closure on accepted success. These use controlled local Office/HTTP
fixtures, not the actual hosted Kier Save. The initial CLI attempt could not
load this worktree's missing Playwright package; the successful retry used the
existing normal frontend package via process-local NODE_PATH, with no new
dependency installation, auth setup or hosted mutation.

Current targeted Weekly Source/staged Candidate/withdrawn history/Bulk Source
units pass212/212, zero skips (`1ebc36`, exit0). Diff check passes. Live Play
Internal28 remains unpublished with zero devices lost and one deobfuscation
warning. The latest USB check reports no connected phone, not an update.

## 6 October: actual Kier Save acceptance passed before Office publication

Backend commit `76e10e544a38edb48a1fd235569df0c0122976a9` passed all149
required SQL verifiers and the complete protected TEST contract in GitHub run
37516170631. Its three changed routine definitions are installed. The coordinator
correctly retained allfour existing27f Worker builds because their application
inputs are byte-unchanged; fresh Cloudflare version/build inspection proved each
active version's successful27f source, and normal TEST `/healthz` returned200.

The actual isolated development browser used reviewed local Office assets and
the real normal TEST API. It opened exactly Kier Arthur's manually queried
8September2026 shift, displayed the original immutable pending first-approval
request (01:00–05:00,30-minute break, WORKED AN EXTRA HOUR), and clicked Save
once. PREPARE_PROTECTED_EDITOR and APPROVE_PROTECTED_HOURS both returned200/ok.
The modal closed, the manual query disappeared, and exactly one green protected
shift appeared with the requested hours and Protected pay—awaiting source.
There was no AMEND request and no Check saved result button. Screenshot
`C:/tmp/protected-resume-accepted-20261006.png` was visually inspected.

A separate SELECT-only Arthur transaction-lab read proved the correct physical
database: family WAITING_SOURCE, current generation present, original generation
PUBLISHED, original run COMPLETE, original publication RETIRED, one completed
local receipt and zero open manual queries. The before/after counts remained
exactly one family event and six historical orchestration runs. No new run or
event was created. This diagnostic itself rolled back and verified a fresh
read-only connection; the durable change came only from the authorized browser
Save, not diagnostic SQL.

Real read-only Candidate header acceptance also passed: View disables the badge;
Edit permits Active/Inactive rotation beside Currently Working, stages the hidden
active value and enables Save. Rotating back restores the original staged value.
Baljit's saved record was already Active. No Candidate Save or persistence attempt
occurred, and all non-read diagnostic API traffic was blocked. Both red/green
header screenshots were inspected. No extra status section is present.

The complete relevant Office test selection passed218 tests with zero skips.
The separately recorded full-suite baseline failures remain unchanged; no test
or Banking policy was weakened. This proves the actual pre-first-authorisation
Kier case, not a blanket claim about already-authorised financial activation,
unpublished native builds, or the other chat's unfinished Banking implementation.

## 7 October: protected-pay reasons and useful review actions

Office-only amendment based on main `21e83df4a25d426e35b0230ab7a7e2763648075a`.
Both Change protected shift and Review protected pay now visibly display the
existing immutable, work-event-scoped Office history: full reason, recorded actor,
UK date/time, status and before/after schedule. Entries are newest first, escaped,
multiline-preserving and bounded to a keyboard-scrollable panel. Changing the
selected identity clears stale history before the next read.

Both combined and single-scope protected lists suppress review until the server
marks the shift as requiring reconciliation. Change protected shift remains
available while waiting. A direct/stale review with no final source offers Close
only; a retained uncertain decision remains exactly retryable. A finalised source
recording zero worked hours remains a valid comparison and is not hidden. Source
hash/version checks, mutation owners, payment policy and invoices are unchanged.
There is no database definition change or native Android/iOS rebuild.

Verification: all 210 Weekly Source unit checks pass. All 59 real Office-shell
import-workspace browser checks pass; desktop and 390px screenshots were visually
inspected. Timestamp contrast was corrected after visual inspection and the exact
history browser test rerun successfully. The broad suite is 1612/1626 passing;
the same 14 unrelated Banking Pay/cache/evidence failures were independently
reproduced against the unchanged pre-amendment source. No tests were weakened.

Publication uses the managed TEST coordinator with fresh four-Worker connection
evidence and backend `2c28ded3db4088f57f456af6c04d7aa1897188cc` (unchanged).
The exact deployment receipt and served-asset acceptance are recorded in the
existing backend worktree's ignored `.codex-tmp` evidence after publication.

## 7 October: green protected-review readiness

Office-only presentation amendment on `948a9a5`: enabled protected review actions
are green only for server-confirmed reconciliation readiness. Both Review protected
pay and Review and reconcile are covered in combined and single-scope lists.
Waiting-source reviews stay hidden; disabled/stale reviews and other actions do
not acquire the readiness colour. Busy combined views do not advertise readiness.
Exact action indexes, payloads, eligibility and financial guards are unchanged.
Green/white text has accessible contrast and keyboard focus has a visible outline.
Single-scope protected actions stack within their cell rather than clipping.

Verification: 212 Weekly Source units and all 60 import-workspace browser tests
passed. The two readiness browser cases were rerun after the final cell-sizing
amendment and passed; their desktop/390px screenshots were visually inspected.
Browser fixtures exercise ready/disabled/waiting rows without changing hosted
source or pay data. No backend, database definition or native app changes.
Publication follows the managed TEST coordinator, with fresh four-Worker proof;
its receipt and served-asset acceptance are retained in the backend worktree's
ignored `.codex-tmp/protected-ready-green-acceptance-20261007.json` after release.

## Saved source recheck recovery — 7 October

Queries now shows an explicit incomplete-recheck advisory and a direct Office
checks button instead of claiming no decisions remain while a replacement
comparison is unfinished. Previous checks remain visible, with only the exact
saved recheck offered for retry. A saved linking choice followed by a comparison
failure is explained truthfully and refreshes the parent workspace. Successful
retry keeps Queries open and does not create another candidate selection.

All 61 import-workspace browser tests and 215 Weekly Source unit tests pass.
The integrated two-row browser case proves both candidates remain visible,
the exact saved command is submitted once, and the recovered row progresses to
its remaining client check while the other charge warning stays visible.
Desktop and 390px advisory/recovery screenshots were visually inspected.
Hosted publication and the original saved-request recovery remain pending on
the managed TEST database/runtime release. This Office-only change needs no
Android or Apple rebuild.
