import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/import-review-v1.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/import-review-v1.css', import.meta.url), 'utf8');

test('the isolated import-review asset is loaded after the legacy application asset', () => {
  const legacy = html.indexOf('./js/main.js');
  const review = html.indexOf('./js/import-review-v1.js');
  assert.ok(legacy > 0);
  assert.ok(review > legacy);
  assert.match(html, /css\/import-review-v1\.css/);
});

test('the frontend fails closed on the full approved DB and Worker contract', () => {
  for (const marker of [
    'IMPORT_REVIEW_DB_V1', 'IMPORT_REVIEW_APPLY_V1', 'IMPORT_APPLY_OPERATION_V2',
    'IMPORT_CORRECTION_OPERATION_V2', 'IMPORT_REVIEW_FOLLOW_UP_COMPONENT_V1',
    'IMPORT_REVIEW_UI_V2', 'TIMESHEET_QUERY_RECIPIENT_EMAIL_V1'
  ]) assert.match(source, new RegExp(marker));
  assert.match(source, /legacy_contracts_supported === false/);
});

test('review pagination uses only the approved page sizes and saves before navigation', () => {
  assert.match(source, /PAGE_SIZES = Object\.freeze\(\[25, 50, 75, 100\]\)/);
  assert.match(source, /await flushSelections\(\{ quiet: true \}\)/);
  assert.match(source, /sort_by/);
  assert.match(source, /data-ir-action="sort"/);
});

test('review lifecycle supports resume, recheck, abandon, apply status and follow-up retry', () => {
  for (const route of [
    '/refresh', '/abandon', '/apply', '/apply-status', '/follow-up/retry',
    '/apply-recover', '/daily-timesheet-resolution'
  ]) assert.ok(source.includes(route), `${route} must be wired`);
  assert.match(source, /Save & close/);
  assert.match(source, /Abandon import/);
});

test('browser sends intent through the Worker and never direct-calls Supabase', () => {
  assert.doesNotMatch(source, /supabase\.co|rest\/v1|createClient\(/i);
  assert.match(source, /authFetch/);
  assert.match(source, /api\/import-reviews/);
  assert.doesNotMatch(source, /validation_rows|alternative_email|financial_values/);
});

test('email confirmation states and renders one message per shared recipient with contract sections', () => {
  assert.match(source, /One email to/);
  assert.match(source, /combined into one tidy message/);
  assert.match(source, /contract_label/);
  assert.match(source, /recipient_email/);
  assert.match(source, /Client → Contract → Shift/);
});

test('coverage and overlap choices are explicit and review editing is server-authoritative', () => {
  assert.match(source, /mode: null/);
  assert.match(source, /overlapping_unfinished_reviews/);
  assert.match(source, /START_SEPARATE/);
  assert.match(source, /SUPERSEDE/);
  assert.match(source, /editability\?\.allowed_commands/);
  assert.match(source, /createOperationKey/);
});

test('save, close, conflict and apply recovery state are durable', () => {
  assert.match(source, /saveChain/);
  assert.match(source, /conflictBuffer/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /FAILED_BEFORE_COMMIT/);
  assert.match(source, /btnCloseModal/);
});

test('global, eligible-client and independent contract query settings are wired', () => {
  assert.match(source, /data-ir-global-policy/);
  assert.match(source, /data-ir-client-policy/);
  assert.match(source, /data-ir-contract-query-enabled/);
  assert.match(main, /send_ts_queries_to_different_email/);
  assert.match(main, /ts_queries_alt_email_address/);
  assert.doesNotMatch(source, /settingsValue\(source, 'reversal_complete_financials_date', 'NOW'\)/);
});

test('HealthRoster eligibility is always reloaded without browser cache and invalidated after a client save', () => {
  assert.match(source, /request\('\/api\/healthroster\/autoprocess\/clients', \{ method: 'GET', cache: 'no-store' \}\)/);
  assert.match(source, /function invalidateClientEligibility\(\) \{[\s\S]*state\.home\.clients = \[\]/);
  assert.match(source, /addEventListener\('cloudtms:client-saved', invalidateClientEligibility\)/);
  assert.match(source, /async function openImportsModalV1\(\) \{[\s\S]*await loadHome\(\)/);
  assert.match(source, /if \(action === 'reload-home'\) \{[\s\S]*await loadHome\(\{ resetPaging: false \}\)/);
  assert.match(main, /dispatchEvent\(new CustomEvent\('cloudtms:client-saved'/);
});

test('styles provide professional tiles, nested expandables, paging and responsive layouts', () => {
  for (const selector of ['.irv1-tiles', '.irv1-tile', '.irv1-group', '.irv1-pager', '.irv1-email-group']) {
    assert.ok(css.includes(selector), `${selector} must be styled`);
  }
  assert.match(css, /@media\(max-width:640px\)/);
});
