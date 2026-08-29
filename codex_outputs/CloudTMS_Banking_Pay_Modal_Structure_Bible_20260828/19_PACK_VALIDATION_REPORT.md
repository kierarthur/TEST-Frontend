# Pack validation report

## Scope

This report validates the Banking Pay Modal Structure Bible source set before final archive sealing.

## Canonical counts

| Control | Expected | Actual | Result |
| --- | ---: | ---: | --- |
| Unique functionality requirements | 136 | 136 | PASS |
| Functionality execution-ledger rows | 136 | 136 | PASS |
| Unique approved message changes | 89 | 89 | PASS |
| Message execution-ledger rows | 89 | 89 | PASS |
| Visible main pre-Draft actions | 30 | 30 | PASS |
| Additional current compatibility handlers | 15 | 15 | PASS |
| Unique action/handler ledger rows | 45 | 45 | PASS |

## Decision checks

- Exactly four main columns: PASS.
- Dedicated Include column: PASS.
- One non-wrapping main row per candidate: PASS.
- No main expansion: PASS.
- No View breakdown button: PASS.
- No added keyboard-opening product requirement: PASS.
- No Timesheets column: PASS.
- Main Timesheets selected-only: PASS.
- Exact disabled Timesheets tooltip: PASS.
- No new main candidate search: PASS.
- 100 candidates per page: PASS.
- Full-result server sorting before paging: PASS.
- Candidate Ready-only filtering before paging: PASS.
- Action Required/Updating/Blocked separation: PASS.
- Indefinite snoozes only in Snoozes: PASS.
- Headline exact full-scope sum of candidate selected display amounts: PASS.
- PAYE net excluded pre-Draft: PASS.
- Browser financial arithmetic prohibited: PASS.
- Policy X, Draft and post-Draft authority preserved: PASS.

## Control-document coverage

- Authority/read-first guide: present.
- Complete controlling implementation plan: present.
- Full canonical functionality/message audit: present.
- Existing upstream Banking Pay Bible: present.
- Settled decision register: present.
- Machine-readable BP/MSG/action ledgers: present.
- State transition/economic-identity ownership: present.
- Comprehensive fixture catalogue: present.
- Performance measurement and budgets: present.
- Phase-by-phase stop gates: present.
- Release/activation/rollback rehearsal: present.
- Evidence and deviation templates: present.
- Per-patch verification template: present.
- Current read-only evidence: present.
- Exact planned API/RPC matrix: present.
- Continuous zero-deviation protocol: present.
- Applicable instruction snapshots: present.

## Archive pre-seal validation

The initial archive was opened and inspected through the ZIP library:

- entries before adding this report and manifest: 22;
- unsafe absolute/parent-traversal paths: 0;
- duplicate paths: 0;
- initial uncompressed bytes: 411,762;
- initial archive bytes: 145,616.

The final sealing step must add this report and `MANIFEST_SHA256.txt`, then repeat:

- entry inventory;
- unsafe/duplicate path check;
- per-entry SHA-256 comparison with the manifest;
- canonical CSV count checks from inside the archive;
- archive SHA-256 calculation.

Final archive verification results are reported to the user with the delivered ZIP and must be rerun by any later recipient before treating the pack as controlling.

## Final seal result

The completed archive was reopened and validated after both final files were added:

| Check | Result |
| --- | ---: |
| Final ZIP entries | 24 |
| Manifested entries | 23 |
| Permitted unmanifested entry (`MANIFEST_SHA256.txt` itself) | 1 |
| Unsafe absolute/parent-traversal paths | 0 |
| Duplicate archive paths | 0 |
| Missing manifest entries | 0 |
| Unexpected unmanifested content entries | 0 |
| Entry hash/size mismatches | 0 |
| Functionality ledger rows/unique IDs | 136 / 136 |
| Message ledger rows/unique IDs | 89 / 89 |
| Visible actions | 30 |
| Additional compatibility handlers | 15 |
| Total unique action/handler rows | 45 |
| Accidental shell/parser error text | 0 |
| Private-key/Bearer/credential-URL markers | 0 |

The final external ZIP hash is intentionally reported outside the archive so the archive does not contain a self-referential checksum.

## Working-pack status during implementation

The seal above describes the originally delivered planning archive, not the current amended working directory. Implementation evidence and step records were subsequently added. The original archive hash must not be presented as a checksum for these later files.

## Final working-pack validation — 29 August 2026

The final seal validates the amended working pack rather than relying on the original planning ZIP checksum. Required closing checks are:

- 136 unique functionality requirements, all with final status and evidence;
- 89 unique approved messages, all with final status and evidence;
- 45 unique visible/compatibility action rows, all with final status and evidence;
- every recorded deviation closed, rejected or explicitly retained by design—none awaiting user decision;
- no absolute path, credential, cookie, token, database URL or secret value in the pack;
- every manifest path present exactly once with matching byte count and SHA-256;
- no unmanifested content except the manifest itself;
- current implementation, release, performance, real-browser, restoration and Create Draft evidence present.

Machine-checked result before the documentation seal:

| Check | Result |
| --- | ---: |
| Manifested content files | 30 |
| Missing/unexpected/duplicate/unsafe paths | 0 |
| Hash or byte-count mismatches | 0 |
| Functionality rows / unique IDs / final | 136 / 136 / 136 |
| Message rows / unique IDs / final | 89 / 89 / 89 |
| Action rows / unique composite keys / final | 45 / 45 / 45 |
| Deviation rows / closed | 22 / 22 |
| Evidence rows / unique IDs | 98 / 98 |
| Credential/private-key/credential-URL markers | 0 |

The manifest is regenerated once more after this result is inserted, then the archive is built and reopened for an identical entry/hash/size comparison. The external archive SHA-256 is reported outside the archive to avoid a self-referential checksum. The application commit remains separately identifiable so documentation-only changes cannot be confused with the deployed application asset.
