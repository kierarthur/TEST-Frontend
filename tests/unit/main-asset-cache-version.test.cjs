const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const main = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

test('loads the current main frontend asset through an explicit cache version', () => {
  const scriptBuildVersion = '20260803-invoice-reference-policy-r2';
  const stylesheetBuildVersion = '20260729-invoice-v8-flat-table-r5';
  const currentMainAsset = 'main.js?v=20261012-sp10-r1&healthroster=20261014-r1';
  const diagnosticAsset = 'invoice-diagnostic-catalog.js?v=20260803-invoice-reference-policy-r2';
  const batchAsset = `invoice-batch-modal.js?v=${scriptBuildVersion}`;
  const asyncAsset = 'invoice-async-ui.js?v=20260730-invoice-refs-ward-r13&invoice-ui-notices=20260822-r1';
  const stylesheetAsset = `invoice-batch-modal.css?v=${stylesheetBuildVersion}`;
  assert.equal((html.match(/\.\/js\/main\.js\?/g)||[]).length, 1);
  assert.ok(html.includes(`<script src="./js/${currentMainAsset}"></script>`));
  assert.match(html, /invoice-batch-modal\.css\?v=20260729-invoice-v8-flat-table-r5/);
  assert.match(html, /invoice-diagnostic-catalog\.js\?v=20260803-invoice-reference-policy-r2/);
  assert.match(html, /invoice-batch-modal\.js\?v=20260803-invoice-reference-policy-r2/);
  assert.doesNotMatch(html, /invoice-batch-modal\.(?:js|css)\?v=20260728-invoice-v8-presentation-r[123]["']/);
  assert.match(html, /invoice-async-ui\.js\?v=20260730-invoice-refs-ward-r13&invoice-ui-notices=20260822-r1/);
  assert.match(html, /candidate-office-reminder-workspace-v1\.js\?v=20260814-r2/);
  assert.match(html, /candidate-office-contract-v1\.js\?v=20260910-paid-history-r1/);
  assert.match(html, /candidate-office-presenter-v1\.js\?v=20260907-timesheet-layout-r1/);
  assert.match(html, /candidate-office-modal-v1\.js\?v=20260910-paid-history-r1/);
  assert.match(html, /candidate-office-api-v1\.js\?v=20260906-advanced-expense-r2/);
  assert.match(html, /candidate-office-controller-v1\.js\?v=20260906-advanced-expense-r2/);
  assert.match(html, /candidate-office-surface-v1\.js\?v=20260907-timesheet-layout-r2/);
  assert.match(html, /candidate-office-bridge-v1\.js\?v=20260910-simple-expense-refresh-r2/);
  assert.match(html, /candidate-office-bootstrap-v1\.js\?v=20260905-summary-trust-r1/);
  assert.match(html, /candidate-office-v1\.css\?v=20261005-candidate-header-r2/);
  assert.match(html, /modal-modernisation\.css\?v=20261010-next-ready-cards-r1/);
  assert.match(html, /summary-modernisation\.css\?v=20260905-continuous-grid-r4/);
  assert.match(html, /summary-continuous-grid-v1\.js\?v=20260905-r8/);
  assert.match(html, /summary-modernisation\.js\?v=20260822-r2/);
  assert.match(html, /modal-modernisation\.js\?v=20261013-wb32-r1/);
  assert.match(html, /record-modal-layout\.css\?v=20260829-rate-picker-r1/);
  assert.match(html, /banking-pay-modal-v2\.css\?v=20260901-r13/);
  assert.match(html, /banking-pay-modal-v2-issue-detail\.js\?v=20260901-r13/);
  assert.match(html, /banking-pay-modal-v2-mutation\.js\?v=20260901-r13/);
  assert.match(html, /banking-pay-modal-v2-settlement\.js\?v=20260901-r13/);
  assert.match(html, /banking-pay-modal-v2-candidate\.js\?v=20260901-r13/);
  assert.match(html, /banking-pay-modal-v2\.js\?v=20260901-r13/);
  assert.match(html, /banking-pay-modal-v2-integration\.js\?v=20260901-r13/);
  const bankingPayReleaseMarker = '20260901-r13';
  for (const asset of [
    'css/banking-pay-modal-v2.css',
    'js/banking-pay-modal-v2-copy.js',
    'js/banking-pay-modal-v2-details-legacy.js',
    'js/banking-pay-modal-v2-table.js',
    'js/banking-pay-modal-v2-draft-review.js',
    'js/banking-pay-modal-v2-issues.js',
    'js/banking-pay-modal-v2-issue-detail.js',
    'js/banking-pay-modal-v2-mutation.js',
    'js/banking-pay-modal-v2-settlement.js',
    'js/banking-pay-modal-v2-candidate.js',
    'js/banking-pay-modal-v2.js',
    'js/banking-pay-modal-v2-integration.js'
  ]) {
    assert.ok(
      html.includes(`./${asset}?v=${bankingPayReleaseMarker}`),
      `${asset} must publish with the complete Banking Pay release marker`
    );
  }
  assert.match(html, /record-modal-layout\.js\?v=20260828-r2/);
  assert.match(html, /mytms-office-v1\.js\?v=20261009-contract-invitation-save-r1/);
  assert.doesNotMatch(
    html,
    /invoice-batch-modal\.js\?v=20260728-invoice-async-v8(?:-correction-r5)?["']/
  );
  assert.ok(html.includes(stylesheetAsset));
  assert.ok(html.indexOf(currentMainAsset) < html.indexOf(diagnosticAsset));
  assert.ok(html.indexOf(diagnosticAsset) < html.indexOf(batchAsset));
  assert.ok(html.indexOf(batchAsset) < html.indexOf(asyncAsset));
  assert.match(main, /asset_version:\s*'20260821-mytms-office-r1'/);
  assert.match(main, /document\.documentElement\.dataset\.cloudtmsMainAssetContract/);
  assert.match(main, /document\.documentElement\.dataset\.bankingPayBatchOrphanCloseGuard = 'installed'/);
  assert.doesNotMatch(main, /loading ahead as you scroll/);
  assert.ok(
    main.indexOf('ensureBankingPayBatchChildOrphanCloseGuardV1();')
      < main.indexOf('function _defaultBrokerBaseUrl()'),
    'the orphan Close guard must be installed before normal application initialisation'
  );
});
