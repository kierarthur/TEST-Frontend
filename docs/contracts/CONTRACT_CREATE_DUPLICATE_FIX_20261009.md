# Office Contract creation and duplication — 9 October 2026

## Owner-approved scope

Create Contract from source Office checks must show the resolved Candidate and Client, leave the new draft editable, and allow both start and end dates to be amended. PAYE duplication offers only PAYE Candidates; Umbrella duplication offers only Umbrella Candidates. Creating an unassigned copy remains available, followed by changing its pay method and assigning a compatible Candidate. Existing user-created Baljit contracts are not changed by this release.

## Create Contract: deployed and browser-checked

Frontend `3b5c88ca64a42f6d76833db41c9ee22ee3e9a09b` was promoted to TEST main and published by Pages build `1271753908`. Managed coordinator database run `37932538042` verified the exact unchanged database release; all four TEST Workers were unchanged.

The lifecycle helper previously treated an unsaved backdated start as an existing started Contract. The chooser also passed resolved IDs/date without adapting the separately returned Candidate/Client display labels into its new-draft seed. The fix retains IDs and date, fills only the known labels, and applies lifecycle history/date locks only to persisted records.

The deployed signed-in browser opened Baljit/Berkshire through Imports → Queries → Office checks → Choose contract → Create contract. Both names were populated, candidate/client/role/band and both date inputs were editable, and no new-record lock appeared. Start was changed to 20 September 2026 and end to 27 September 2026 without saving a real Contract. Screenshot: `contract-create-fixed-20261009.png` in this task's visualizations directory. No rates were invented and no Contract was saved.

The original focused suite passed 40/40. Full unit baseline comparison found the same 13 unrelated failures on the deployed baseline (1,618/1,631 passing) and the Create fix (1,620/1,633 passing); no new failure was introduced. This is not a claim that the full suite was green.

## Duplication implementation and safety

- Studio candidate searches now pass the source Contract's pay method into the existing server-owned search filter before pagination. Missing/unsupported source pay method does not issue an unfiltered search.
- The Worker reads current selected Candidate pay methods and validates every assignment before inserting the first copy. A stale/forged cross-channel or unknown-channel selection fails with a conflict and zero copies written.
- Null assignments retain the existing unassigned-vacancy payload and copied pay method. An entirely unassigned copy does not need a Candidate read or overlap query.
- Browser inspection also reproduced a disabled creation button on the initial vacant Studio intent. That independent creation action now bypasses record-edit dirtiness and the assigned-record eligibility gate, and does not inherit its source's protected-title badge. No existing-record save gate is relaxed.
- A persisted vacancy with no worked history is not date-locked solely because its copied start is in the past. This permits its pay method/placement to be edited. Assigned started Contracts keep their date lock; any worked history still locks protected fields, including an unassigned record.
- Source freshness, admin authorisation, Candidate existence, week generation, incomplete-copy cleanup and existing progression protection are unchanged.

Executable focused proof: frontend Contract/source-action suite 42/42; backend duplication/progression suite 16/16. The complete backend suite passed 1,481/1,481 after installing the lockfile dependencies in the isolated worktree (the initial run lacked dependencies and is not a business regression). Both actual duplicate handlers are executed in isolated test fixtures, not merely checked by regex. The server cases prove matching PAYE and Umbrella copies, cross-channel/blank/unknown rejection before any copy, multiple vacant copies, stale source, missing Candidate and admin rejection. No durable fixture, financial data, payment, provider, settlement or email action is performed.

Policy X: unchanged. This is new-placement eligibility and UI reachability only, with no financial amount, rate, headroom, selection/Draft, frozen artifact, provider, payment, settlement or remittance changes. No SQL definition, migration, trigger, token, Google script, old webapp or mobile build changes.

## Duplication: deployed and browser-checked

Managed TEST release completed on 9 October 2026: backend `20f9c8a29ab5375bc3beccc1c3d80d7ada8318b3`, Office `87b385c849f400c73e711e21fb6b41cb65f77357`, protected database run `37935132374`, Office Pages build `1271803961`. The database route verified the unchanged contract without reinstalling SQL. Fresh Cloudflare read-back resolved each active version to a successful build of that exact backend commit:

| TEST Worker | Active version |
| --- | --- |
| Normal backend | `757b2412-752b-4a9b-be90-e589acf4befa` |
| Candidate private | `f0d66b71-3641-4c0d-9be1-d747f17e7484` |
| Candidate synthetic private | `18cf734e-3867-4d29-8c55-2d4e658da576` |
| Candidate public broker | `1e7e5609-2e2b-4fce-8e3e-48cf9c95bb45` |

Deployed browser acceptance: Kier's Berkshire PAYE source offers PAYE-only candidates, searching Baljit returns no matching candidates, and Kier remains selectable. An existing Baljit Umbrella source offers Umbrella-only candidates, excludes Kier, and includes Baljit. The initial unassigned slot has an enabled Create contracts button and no inherited source lock badge. An existing unassigned, unworked July Contract opens Edit with enabled pay method and start/end dates. No final copy creation, existing-contract save, booking or financial action was performed in the browser; actual insertion/rejection behavior is proved by the isolated executable handler tests above, not a durable end-to-end fixture.

The import Create Contract journey was retested after this deployment: Baljit/Berkshire names remain populated and both dates were changed to `20/09/2026` and `27/09/2026`, remained editable after blur, then the unsaved draft was closed. Screenshots `contract-duplicate-fixed-20261009.png` and `contract-create-dates-fixed-20261009.png` are saved in this task's visualizations directory. The focused frontend suite was rerun and passed 42/42. Existing worked-history protection remains covered by executable regression tests; no LIVE, Google, old-webapp or mobile deployment was performed.

The coordinator receipt retains its generic `DEPLOYED_ACCEPTANCE_PENDING` status; the later bounded browser acceptance and its limits are recorded here rather than rewriting protected deployment evidence. This evidence-only report update is pushed on the task branch; the installed Office source identity remains the release commit above.

## Choose contract: clearable single-selection tick boxes

Owner scope: use checkboxes, permit at most one selected Contract and allow unticking; Create contract is available only with no selection. Keep explicit selection/submission and server eligibility checks unchanged.

Changed `js/weekly-source/workspace-actions.js`, its versioned include in `index.html`, and `tests/unit/weekly-source-workspace-actions.test.cjs`. Choice changes update the checkboxes and both action buttons in place, without changing the layout. Creation also rejects selected/busy state in its handler; submission rejects empty/busy state, retaining the existing exact server payload and eligibility owner.

Focused executable regression: 95/95 pass across source-workspace actions, import workspace, Contract workflow safety and saved-authority tests. The actual chooser handlers execute in an isolated three-choice fixture proving switching clears the previous tick, unticking restores no selection, Create/Use button gates, empty submission rejection, exact selected-contract command and double-submit blocking. Renderer cases cover initial, selected, busy and no-choice states. Syntax and whitespace checks pass. No real Contract/link save, SQL, financial operation or external communication was used in these fixtures. Full financial recovery verification is not required for this presentation-only delta; deployed acceptance and release identities will be recorded after publication.

## Authoritative-import authorisers and saved-modal follow-up

Owner scope: hide the irrelevant hours-authoriser panel for import-authoritative Contracts; after a successful save, Close must not warn about a saved draft. Keep the explicit Choose contract step after creation. The owner withdrew the proposed automatic link/refresh expansion.

Implementation: resolve Client inheritance using the existing canonical settings normalizer, unless a current Contract override applies. Delay the panel until that Client identity is known; rescan after hydration and Contract rendering. Capture the opening context so a late Client read cannot write into another modal. This is presentation only: stored policies, server approval enforcement and separate expense approval are unchanged. NHSP and HealthRoster CREATE hide the hours-authoriser panel; ordinary weekly and HealthRoster VERIFY retain it.

On fully successful Contract save, advance a frame-local save revision and clear its dirty markers. Contract tab rendering cannot restore a pre-save dirty flag after that revision advances. Failed/throwing saves stay dirty, new genuine edits stay dirty, and non-Contract behavior is unchanged. No chooser action auto-selects the saved record.

Focused executable proof: 47/47 tests pass, including the actual nested `saveForFrame` with successful, rejected and throwing saves, stale-render completion, subsequent genuine edits, Client/Contract route precedence, stale identity rejection and authoriser-panel lifecycle. Both scripts pass syntax checks and the diff passes whitespace validation. No real Contract save, hours/rates change, financial action or SQL change was performed for these tests. Browser acceptance and deployment identities follow after publication; this section alone does not claim deployment.

Publication completed: Office source `99243cdcab3f77a6fb0b7753727e1bf157bc41b7` is on remote main and its task branch; Pages build `1272009792` is built. Protected database run `37948592246` verified the exact unchanged contract. All four Workers remain on the previously recorded `20f9c8a` versions; fresh postflight Cloudflare inspection proves they were not republished. The protected receipt completed all stages in 3 minutes 23 seconds.

Deployed browser acceptance: the served main script includes `contract-saved-authority=20261009-r1`, and manager-authorisers is `20261009-r2`. Baljit's saved Berkshire Contract has no Timesheet authorisers panel after Client settings hydration succeeds; Sarah's ordinary Whittington Contract retains the panel. Both clean view modals close without prompting. Screenshot `contract-authority-saved-20261009.jpg` is saved in this task's visualizations directory. The successful/failed save race is executable-fixture proof, not a new durable Contract save in the browser. No user Contract, hours, rate, stored authoriser policy or expense approval was mutated. No backend source patch, Codex Worker deployment, SQL installation, destructive SQL, secret change, LIVE, Google, old-webapp or phone publication occurred. Browser reads used the deployed normal TEST backend; no patch-worker routing was needed for this frontend-only release. This evidence-only addition does not change the installed source identity.
