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
    'IMPORT_REVIEW_UI_V3', 'TIMESHEET_QUERY_RECIPIENT_EMAIL_V1'
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

test('V3 grade resolution is server-option-only and route specific', () => {
  assert.match(source, /resolution_options/);
  assert.match(source, /WEEKLY_ASSIGNMENT_CONTRACT/);
  assert.match(source, /DAILY_GRADE_ROLE/);
  assert.match(source, /apiCreateAssignmentBandMapping/);
  assert.match(source, /postHrRotaResolveMappings/);
  assert.match(source, /freshItem\.evidence_fingerprint !== item\.evidence_fingerprint/);
  assert.doesNotMatch(source, /irv2GradeRole|irv2GradeBand|Role code is required/);
});

test('V3 renders imported and current evidence with safe operator wording', () => {
  for (const token of ['imported_evidence', 'current_evidence', 'difference_codes', 'evidence_rows', 'outcome_label']) {
    assert.match(source, new RegExp(token));
  }
  for (const code of [
    'ACTUAL_HOURS_MISMATCH', 'START_END_MISMATCH', 'BREAK_MINUTES_MISMATCH',
    'MISSING_FROM_IMPORT', 'REFERENCE_ON_SHIFT_MISSING_FROM_COMPLETE_IMPORT',
    'CONTRACT_OUT_OF_SCOPE', 'CONTRACT_RATES_INCOMPLETE'
  ]) assert.match(source, new RegExp(code));
  assert.match(source, /This item needs review/);
  assert.match(source, /function evidenceCell/);
  assert.match(source, /Timesheet shift is missing from the import/);
  assert.doesNotMatch(source, /replaceAll\('_', ' '\)\.toLowerCase/);
});

test('final confirmation loads every selected action in bounded pages and rechecks before apply', () => {
  assert.match(source, /page_size: '100'/);
  assert.match(source, /if \(page > 5\)/);
  assert.match(source, /Final confirmation could not load every selected action/);
  assert.match(source, /selectedSetFingerprint/);
  assert.match(source, /confirmationStillCurrent/);
  assert.match(source, /DB-owned correction units/);
  assert.match(source, /Explicit reference decisions/);
  assert.match(source, /Outgoing client query emails/);
  assert.match(source, /expected_request_hash: review\.header\.state\.apply_contract\.request_hash/);
});

test('coverage and overlap choices are explicit and review editing is server-authoritative', () => {
  assert.match(source, /mode: null/);
  assert.match(source, /overlapping_unfinished_reviews/);
  assert.match(source, /START_SEPARATE/);
  assert.match(source, /SUPERSEDE/);
  assert.match(source, /editability\?\.allowed_commands/);
  assert.match(source, /createOperationKey/);
});

test('coverage sends only the Worker-approved scope fields and shows mapping status in every mode', () => {
  assert.match(source, /function clientScopeRequest/);
  assert.match(source, /function candidateScopeRequest/);
  assert.match(source, /scope_clients: \(allScope\.scope_clients \|\| \[\]\)\.map\(clientScopeRequest\)/);
  assert.match(source, /candidates\.map\(candidateScopeRequest\)/);
  assert.match(source, /if \(!coverage \|\| !coverage\.mode\) return ''/);
  assert.match(source, /Candidates covered by all shifts for this period/);
  assert.match(source, /Candidates found in this partial file/);
  assert.match(source, /data-mapping-status/);
  assert.match(css, /\.irv1-scope-chip\.is-matched/);
  assert.match(css, /\.irv1-scope-chip\.is-unmatched/);
  assert.match(css, /\.irv1-candidate-row\.is-matched/);
  assert.match(css, /\.irv1-candidate-row\.is-unmatched/);
});

test('coverage wording is explicit for validation-only, authoritative and mixed files', () => {
  for (const text of [
    'Complete validation file – all candidates',
    'Complete validation file – selected candidates',
    'Partial validation file',
    'No timesheet hours or financial values will be changed',
    'Complete authoritative file – all candidates',
    'Complete authoritative file – selected candidates',
    'Their imported shifts may be added or amended in CloudTMS',
    'Partial authoritative file',
    'Complete mixed file – all candidates',
    'Complete mixed file – selected candidates',
    'Partial mixed file'
  ]) assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /scope\?\.authority_mode/);
  assert.match(source, /data-authority-mode/);
  assert.match(source, /No browser choice can grant financial authority/);
});

test('import screens reuse one modal frame and use only the CloudTMS confirmation modal', () => {
  assert.match(source, /function repaintImportFrame/);
  assert.match(source, /if \(repaintImportFrame\(title, render, kind\)\) return/);
  assert.match(source, /openUiConfirmModal/);
  assert.match(source, /Discard staged import\?/);
  assert.match(source, /Discard unsaved review changes\?/);
  assert.doesNotMatch(source, /\b(?:global|window)\.(?:confirm|alert|prompt)\s*\(/);
});

test('all import, mapping and timesheet-resolution flows avoid native browser dialogs', () => {
  const topLevelFunction = (name) => {
    const signature = new RegExp(`^(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm');
    const match = signature.exec(main);
    assert.ok(match, `${name} must exist`);
    const start = match.index;
    const remainder = main.slice(start + match[0].length);
    const next = /\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/.exec(remainder);
    return main.slice(start, next ? start + match[0].length + next.index : main.length);
  };

  const auditedFunctions = [
    'postWeeklyResolveMappings', 'refreshHrRotaSummary', 'openHrRotaAssignRoleModal',
    'openHrRotaAssignCandidateModal', 'openHrRotaResolveGradeRoleModal', 'openHrRotaAssignClientModal',
    'openCandidatePicker', 'openClientPicker', 'openImportColumnAliasesModal',
    'openTimesheetsResolveModal', 'openResolveCandidatePicker', 'openResolveClientPicker',
    'openImportsModal', 'wireImportDropzones', 'handleHrWeeklyFileDrop',
    'openHrWeeklyBandResolveModal', 'openHrWeeklyClientPicker', 'openClientHospitalModal',
    'openWeeklyClientResolveModal', 'openWeeklyCandidateResolveModal', 'openAssignmentBandMappingsModal',
    'openWeeklyImportOptionsModal', 'handleNhspFileDrop', 'refreshWeeklyImportSummary',
    'renderWeeklyImportSummary', 'applyWeeklyImportTransactional', 'handleHrRotaFileDrop',
    'postHrRotaResolveMappings'
  ];
  const nativeDialog = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
  for (const name of auditedFunctions) {
    assert.doesNotMatch(topLevelFunction(name), nativeDialog, `${name} must use the CloudTMS modal system`);
  }

  const topLevelMatches = [...main.matchAll(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)];
  for (let index = 0; index < topLevelMatches.length; index += 1) {
    const name = topLevelMatches[index][1];
    if (!/(?:import|resolve|mapping|alias|hrrota|healthroster|nhsp|hrweekly|weeklyvalidation)/i.test(name)) continue;
    const body = main.slice(topLevelMatches[index].index, topLevelMatches[index + 1]?.index ?? main.length);
    assert.doesNotMatch(body, nativeDialog, `${name} must not expose a native browser dialog`);
  }

  assert.match(main, /async function showImportFlowNotice/);
  assert.match(main, /hide_cancel: true/);
  assert.match(main, /kind: 'import-flow-notice'/);
  assert.match(main, /async function showImportFlowConfirm/);
  assert.match(main, /kind: 'import-flow-confirm'/);
});

test('save, close, conflict and apply recovery state are durable', () => {
  assert.match(source, /saveChain/);
  assert.match(source, /conflictBuffer/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /FAILED_BEFORE_COMMIT/);
  assert.match(source, /btnCloseModal/);
  assert.match(source, /let reviewCreated = false/);
  assert.match(source, /The review was created, but its next screen could not be loaded safely/);
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
