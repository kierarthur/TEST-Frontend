# CloudTMS Banking Pay Modal Structure Bible

## Read this first

This pack is the controlling specification and verification system for the Banking Pay candidate-structure redesign.

Its purpose is not merely to describe the intended screens. It prevents functionality, authority, wording, performance, error handling and safety behaviour from being silently lost while the presentation is simplified.

### Authority order

Apply the documents in this order:

1. Current user instruction for the exact task, where it narrows work without weakening the settled product contract or safety boundaries.
2. Current applicable workspace and repository `AGENTS.md` instructions.
3. `01_BANKING_PAY_MODAL_STRUCTURE_BIBLE.md` — the controlling implementation plan and product contract.
4. `02_CANONICAL_FUNCTIONALITY_AND_MESSAGE_AUDIT.md` — the exact 136-functionality and 89-message audit.
5. `03_UPSTREAM_BANKING_PAY_BIBLE.md` — existing financial, Workbench and lifecycle authority.
6. The execution ledgers, matrices and verification protocols in this pack.

Where two historical planning responses disagree, this pack wins. Superseded proposals are not evidence.

### Non-negotiable rule

No implementation phase, database release, Worker activation or frontend activation may proceed merely because the code appears to work.

It may proceed only when:

- every applicable gate is complete;
- every affected `BP-*`, `MSG-*` and current action entry has evidence;
- the exact accepted authority tuple and economic identity rules remain intact;
- failures are visible and fail closed;
- the result meets the performance and rollback contract;
- no unapproved deviation is open.

### Pack contents

| File | Purpose |
| --- | --- |
| `01_BANKING_PAY_MODAL_STRUCTURE_BIBLE.md` | Complete settled decisions, architecture, contracts, phases, tests and acceptance. |
| `02_CANONICAL_FUNCTIONALITY_AND_MESSAGE_AUDIT.md` | Original detailed 136-functionality audit and 89 approved message changes. |
| `03_UPSTREAM_BANKING_PAY_BIBLE.md` | Existing Banking Pay economic and lifecycle authority. |
| `04_SETTLED_DECISION_REGISTER.md` | One definitive list of accepted and rejected product choices. |
| `05_ZERO_LOSS_EXECUTION_LEDGER.csv` | One row for every canonical `BP-*` requirement, ready for implementation evidence. |
| `06_MESSAGE_EXECUTION_LEDGER.csv` | One row for every approved `MSG-*` change. |
| `07_ACTION_HANDLER_EXECUTION_LEDGER.csv` | The corrected 30-action deletion guard. |
| `08_STATE_TRANSITION_AND_OWNERSHIP_MATRIX.md` | Legal section movement, mutation settlement and identity ownership. |
| `09_TEST_FIXTURE_CATALOGUE.md` | Required economic, UX, error and concurrency fixtures. |
| `10_PERFORMANCE_BASELINE_AND_ACCEPTANCE.md` | Measurement method, request/payload budgets and pass/fail rules. |
| `11_IMPLEMENTATION_STEP_GATE_CHECKLIST.md` | Mandatory stop gates for every implementation phase. |
| `12_RELEASE_AND_ROLLBACK_REHEARSAL.md` | TEST release order, activation, fallback and incident rollback. |
| `13_EVIDENCE_REGISTER_TEMPLATE.csv` | Evidence record used for source, test, database, Worker and browser proof. |
| `14_DEVIATION_REGISTER_TEMPLATE.csv` | Formal deviation control; product/authority deviations stop work. |
| `15_STEP_VERIFICATION_RECORD_TEMPLATE.md` | Per-change verification and review record. |
| `16_CURRENT_READ_ONLY_EVIDENCE.md` | Repository, Miget and audit observations used to prepare the pack. |
| `17_API_AND_RPC_CONTRACT_MATRIX.md` | Exact planned RPCs/routes and ownership boundaries. |
| `18_ZERO_DEVIATION_PROTOCOL.md` | How implementation is compared with this Bible continuously. |
| `19_PACK_VALIDATION_REPORT.md` | Original seal and subsequent working-pack validation boundaries. |
| `20_WORKING_CHANGE_RECORD.md` | Dated implementation findings and changes; no silent policy drift. |
| `21_IMPLEMENTATION_STEP_RECORDS.md` | Per-step evidence and still-open gates. |
| `22_TABLE_COMPONENT_BROWSER_EVIDENCE.md` | Isolated component browser checks, not deployed acceptance. |
| `23_CREATE_DRAFT_COMPATIBILITY_CONTRACT.md` | Exact unchanged Draft handoff, executed old/new parity tests and mandatory remaining integration gates. |
| `authority_snapshots/*` | Applicable root/frontend/backend instructions as captured for provenance. |
| `MANIFEST_SHA256.txt` | Cryptographic inventory for every archived file. |

### Status terms

Use only:

- `NOT_STARTED`
- `IN_PROGRESS`
- `PASS`
- `FAIL`
- `BLOCKED`
- `NOT_APPLICABLE` with a written reason and reviewer

`ASSUMED`, `LOOKS_OK`, `PROBABLY` and blank evidence are not acceptable completion states.

### What this pack does not authorise

It does not authorise implementation, TEST data mutation, database release, deployment, feature activation, payment execution or any LIVE access.
