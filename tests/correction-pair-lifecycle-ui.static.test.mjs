import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const importReview = readFileSync(new URL('../js/import-review-v1.js', import.meta.url), 'utf8');

test('simple and bulk lifecycle actions use the friendly pair confirmation', () => {
  assert.ok((main.match(/CORRECTION_PAIR_CONFIRMATION_REQUIRED/g) || []).length >= 4);
  assert.match(main, /openUiConfirmModal[\s\S]*linked correction pair/i);
  assert.match(main, /confirm_pair_lifecycle:\s*true/i);
});

test('delete and archive confirmations explicitly describe the joint pair action', () => {
  assert.match(main, /both linked correction-pair Timesheets/i);
  assert.match(main, /reversal and corrected-hours Timesheets must be archived together/i);
  assert.match(main, /reversal and corrected-hours timesheets must be deleted together/i);
});

test('the incomplete invoice placement issue has the exact user guidance', () => {
  const exact = 'This paired timesheet needs invoicing. The other timesheet is attached to an invoice, this timesheet needs attaching as soon as possible';
  assert.ok((main.match(new RegExp(exact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 3);
});

test('document preparation polls automatically without asking for Recheck', () => {
  assert.match(importReview, /scheduleDocumentPreparationPoll/i);
  assert.match(importReview, /openReview\(importId, \{ preserveLocal: true, documentPoll: true \}\)/i);
  assert.match(importReview, /queued the current timesheet PDF for immediate asynchronous generation/i);
  assert.doesNotMatch(
    importReview,
    /TIMESHEET_EVIDENCE_PREPARING:\s*'[^']*choose Recheck/i
  );
});

test('a deduplicated validation blocker still displays preserved delivery history', () => {
  assert.match(importReview, /\['EMAIL_ISSUE','EMAIL_REMINDER'\]\.includes\(item\.action_kind\)[\s\S]*Number\(summary\.sent_count \|\| 0\) > 0/);
  assert.match(importReview, /Previously sent \$\{Number\(summary\.sent_count\)\}/);
});

test('the incomplete placement blocker has a friendly Import Review explanation', () => {
  assert.match(importReview, /IMPORT_REVIEW_CORRECTION_PAIR_PLACEMENT_INCOMPLETE/i);
  assert.match(importReview, /temporarily split while one member is being moved between invoices/i);
});
