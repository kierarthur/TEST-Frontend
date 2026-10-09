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

Duplication publication and deployed browser acceptance remain pending at this preparation checkpoint.
