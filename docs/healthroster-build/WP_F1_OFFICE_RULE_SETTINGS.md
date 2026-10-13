# Office rule settings implementation

13 October 2026. Integrator-owned source in the isolated HealthRoster Office worktree; no Office publication or hosted mutation occurred.

The existing Global settings screen mounts Source rules beside its existing Source groups. It reads the new purpose-bound rule catalogue, saves immutable rule versions and assigns exact versions from future week endings. A NULL version clears the later assignment. NHSP groups are excluded. The agency-invoice preset exposes only its attachment option; other rules remain fixed. The server repeats dated scope, group CAS, settings and eligibility validation under locks.

The screen has no activation control or activation endpoint. Saved assignments show the actual server activation status. Failed requests retain the same UUID for unchanged retry input; edits produce a different request identity. Group assignment CAS receipts live in the rule editor state and do not mutate the existing Global settings draft/baseline. Rule-service unavailability leaves a visible retry while existing Global settings remain available. View mode disables mutation controls. Values and names are escaped, dates use DD/MM/YYYY and existing responsive setting-row styles are reused.

Files: `js/weekly-source/rule-set-validation.js` (generated syntax-only snapshot of the reviewed backend validator), `js/weekly-source/rule-settings.js`, the narrow mount in `settings.js`, index script ordering/cache versions and the existing weekly-source stylesheet. Root output `generate_office_rule_validator.mjs` records generation. This client supplies no actor, deployment, membership, financial or activation facts.

Validation: 29 combined unit cases passed across new rule settings and existing settings/Train0. Four actual saved-shell Chromium cases passed across the new editor and Train0, including retry identity, immutable version/save/assignment payloads, exact group CAS, closed mutation requests, unknown dependency/view mode and narrow-screen presentation. Every browser request was served locally; zero external requests or hosted mutations occurred. These mocked API cases qualify source/UI behavior, not actual installed PostgREST, financial, feature activation, document, app or phone acceptance.

The complete Office source remains uncommitted pending the reviewed release composition and required ordering. Backend source/security/configuration rollback proofs and the publication hold are recorded in the backend PROGRESS.md.
