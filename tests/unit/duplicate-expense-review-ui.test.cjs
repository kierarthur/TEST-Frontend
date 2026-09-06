const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');
const index = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

test('individual authorisation requires explicit duplicate-expense review confirmation', () => {
  assert.match(main, /authoriseErrorCode === 'DUPLICATE_EXPENSE_REVIEW_REQUIRED'/);
  assert.match(main, /title: 'Review possible duplicate expenses'/);
  assert.match(main, /confirm_label: 'Proceed with authorisation'/);
  assert.match(main, /duplicate_expense_confirmation: confirmedDuplicateExpenseReview/);
  assert.match(main, /confirmedDuplicateExpenseReview = true/);
});

test('bulk authorisation explains that possible duplicates are excluded', () => {
  assert.match(main, /visible_review_required_rows: visibleReviewRequiredRows/);
  assert.match(main, /must be reviewed individually/);
  assert.match(main, /confirm_label: 'Authorise eligible timesheets'/);
  assert.doesNotMatch(main, /bulk[\s\S]{0,200}duplicate_expense_confirmation: true/i);
});

test('bulk authorisation visibly separates claims that must be reviewed individually', () => {
  assert.match(main, /renderSection\('processed_review_required', 'Review Individually', reviewRequiredRows\)/);
  assert.match(main, /Possible duplicate expenses — open and review this claim individually\./);
  assert.match(main, /isReviewRequired \? 'Review required'/);
  assert.match(main, /for \(const sectionKey of \['processed_eligible', 'authorised_eligible', 'processed_review_required'\]\)/);
});

test('Office summary and Issues surfaces use friendly duplicate-expense wording', () => {
  assert.match(main, /DUPLICATE_EXPENSE_REVIEW: 'Possible duplicate expenses'/);
  assert.match(main, /another claim for this Candidate, Client and week ending contains the same expense category/);
  assert.match(index, /duplicate-expense-review=20260831-r2/);
});
