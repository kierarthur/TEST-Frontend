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
