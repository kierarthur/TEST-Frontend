import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(repoRoot, 'js', 'main.js'), 'utf8');

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing ${startMarker}`);
  assert.ok(end > start, `missing ${endMarker}`);
  return source.slice(start, end);
}

test('progress modal is read-only, closeable and reopenable from durable request state', () => {
  const modal = slice('const bankingPayCancellationProgressState', 'function getBankingPaymentIssueActionLabel');
  assert.match(modal, /function closeBankingPayCancellationProgressModal/);
  assert.match(modal, /async function openLatestBankingPayCancellationProgress/);
  assert.match(modal, /bankingPayPaymentCorrectionStatus/);
  assert.doesNotMatch(modal, /\/process[`'"?]/);
  assert.doesNotMatch(modal, /localStorage|sessionStorage/);
});

test('financial completion and Workbench freshness are displayed independently', () => {
  const modal = slice('function renderBankingPayCancellationProgressModal', 'async function refreshBankingPayCancellationFinancialViews');
  assert.match(modal, /Payment availability/);
  assert.match(modal, /NOT_STAGED/);
  assert.match(modal, /STAGED|PENDING|CURRENT|FAILED/);
  assert.match(modal, /financial cancellation stage is complete/i);
});

test('financial completion refreshes Overview, Current Payment Status and PAYE authority without candidate fan-out', () => {
  const refresh = slice('async function refreshBankingPayCancellationFinancialViews', 'function scheduleBankingPayCancellationProgressPoll');
  assert.match(refresh, /bankingPayBatchGet/);
  assert.match(refresh, /bankingPayBatchesList/);
  assert.match(refresh, /bankingRerender/);
  assert.doesNotMatch(refresh, /for\s*\([^)]*candidate|Promise\.all/);
});

test('historical browser process helper reads status and never advances cancellation work', () => {
  const compatibility = slice('async function bankingPayPaymentCorrectionProcess', 'async function bankingPayPaymentStatusPage');
  assert.match(compatibility, /return bankingPayPaymentCorrectionStatus\(id\)/);
  assert.doesNotMatch(compatibility, /authFetch|method:\s*'POST'/);
});
