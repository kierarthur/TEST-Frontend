# Office HealthRoster consumer implementation

13 October 2026. Worktree: `.codex-worktrees/healthroster-v2-office-13102026`; branch `codex/healthroster-v2-office-13102026`. Starting HEAD `7a92afaf85f75839395f4ed4dc0cfc6eda68eff0`, containing reviewed Office main `887e7af7cd15d9f4034ad73806b44344f3eb0791`. Initial worktree was clean. No saved default checkout or Banking worktree was edited.

Authority is the owner’s SEND_5 build-stage instruction (D9/D10) and the integrator’s package/contract allocation. Catalogue preparation was declared closed by the integrator before consumer changes. Runtime, database, feature activation, promotion and app publication remain the integrator’s lane.

## Implemented compatibility and WP-PP consumer

- Shared modal tab buttons carry `data-tab-key`; workspace selection resolves descriptor keys, including programmatic navigation.
- Missing cycle information says `To check`; it does not invent a cutoff or finalisation state.
- New reminder/correction/daily-review labels can be rendered during an ordered rollout. Their unsupported commands are removed and buttons remain disabled with an explanation. Disabled buttons cannot dispatch a synthetic click.
- `permissions.contract=WEEKLY_SOURCE_PAYMENT_VIEW_V1` with `view=PAY` controls the reduced view. No browser role flags are inferred. It lands on Queries, keeps its server-provided pay actions and payloads, and omits Upload, Finalise, History, administrative recheck/outreach and unavailable Checklist. Combined Queries respects the declared sections and omits administrative attention/contact controls.
- The first GET omits `tab` so the server discovers the permission view. Forbidden restored tabs/deep links resolve to the permitted landing tab. An administrative-permission rejection during refresh invokes that same read-only discovery.
- Existing admin rendering and signed Journey panels remain. The replacement Queries/mail producer must be installed and qualified before the new signed heading, automatic-email copy, Finalise omission and retirement of legacy checks are enabled. `TIMESHEET_AUTHORITY` alone is insufficient readiness evidence.

## Verification

Focused unit suites: 101 passing cases across Train0, workspace, existing actions and combined review. Syntax checks passed for edited JavaScript. Two Chromium cases passed against the saved actual Office shell served by the existing synthetic-origin interception helper: keyed tabs/disabled commands at desktop and narrow widths, and permission discovery before a forbidden deep link. External requests and Weekly Source mutation commands: zero. No credentials or auth state were loaded.

These are source/local/browser fixture proofs. They do not prove an installed backend permission owner, real TEST API, mail delivery, documents, financial acceptance or feature activation.

## Exact remaining consumer gates

| Consumer | Required server/proof gate | Status |
|---|---|---|
| WP-PP publication | Integrator’s exact helper commit, protected database/ACL/API proof and ordered runtime installation before Office | Pending integration |
| Signed Imports/Queries | Versioned installed presentation capability from the actual check-only Queries owner and lawful mail admission | Pending producer |
| Upload routing/Daily history | Frozen pre-staging detection/current client/Timesheet/date contract and durable daily list/return contract | Pending producer |
| Checklist | Frozen canonical submitted/correction selector, total order, scoped cursors/change policy and independent expansion/return contracts | Pending producer |
| Correct/Cancel/Authorise both | Request-aware exact contracts, full A0/weekly/Daily/credit/NEXT/permission proofs | Pending producer and joined acceptance |
| Settings/profiles/finalisation | Exact installed catalogue/preset/profile response contracts; reuse current settings/parser surfaces | Pending producer |

No unsupported command is presented as usable. No current signed check is hidden before its replacement exists. UI changes are uncommitted pending integrator scope review; no push, promotion, deployment, database call, TEST fixture mutation, email, payment, provider or LIVE action occurred in this lane. No secret was read or printed.
