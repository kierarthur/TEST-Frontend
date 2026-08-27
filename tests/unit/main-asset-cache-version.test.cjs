const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const main = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

test('loads the current main frontend asset through an explicit cache version', () => {
  const scriptBuildVersion = '20260803-invoice-reference-policy-r2';
  const stylesheetBuildVersion = '20260729-invoice-v8-flat-table-r5';
  const mainAsset = 'main.js?v=20260730-invoice-refs-ward-r10&banking-owner-recovery=20260730-r1&planned-week-authority=20260801-r3&invoice-email-policy=20260801-r2&summary-money=20260803-r1&outbox-cursor-pagination=20260803-r1&banking-paye-net-schedule=20260807-r1&banking-pre-provider-retry=20260808-r1&banking-cancellation-progress=20260812-r21&banking-responsive-layout=20260807-r1&banking-test-reauth=20260809-r3&banking-semantic-cancellation=20260810-r5&banking-ready-compact=20260809-r4&banking-wave1=20260811-r12&banking-batch-child-open=20260812-r2&banking-create-draft-selection-fence=20260812-r1&banking-ready-select-all-authority=20260812-r4&candidate-office=20260814-r6&banking-fast-route-modal=20260813-r1&banking-james-post-resolution=20260816-r2&banking-james-cancel-postcommit=20260817-r1&banking-james-modal-performance=20260817-r1&banking-james-recovery-section-refresh=20260817-r2&banking-james-resolution-adoption=20260817-r13&banking-finance-cancel=20260818-r9&banking-cancel-lifecycle-trace=20260819-r1&banking-selection-result-refresh=20260821-r2&banking-create-draft-selection-pending=20260822-r1&modal-summary-final=20260824-r2&mytms-office=20260823-manager-email-r1&invoice-unissue-ui=20260822-r1&contract-typeahead=20260822-r2&timesheet-status-badges=20260822-r1&banking-mobile-ready-selection=20260822-r3&daily-roster-compat=20260822-r1&candidate-bookings-table=20260825-r3&candidate-bookings-contract-edit=20260827-r2&office-auth-refresh=20260826-r1&evidence-viewer=20260826-r1&printed-timesheet-office-policy=20260826-r1';
  const diagnosticAsset = 'invoice-diagnostic-catalog.js?v=20260803-invoice-reference-policy-r2';
  const batchAsset = `invoice-batch-modal.js?v=${scriptBuildVersion}`;
  const asyncAsset = 'invoice-async-ui.js?v=20260730-invoice-refs-ward-r13&invoice-ui-notices=20260822-r1';
  const stylesheetAsset = `invoice-batch-modal.css?v=${stylesheetBuildVersion}`;
  assert.ok(html.includes(`<script src="./js/${mainAsset}"></script>`));
  assert.match(html, /invoice-batch-modal\.css\?v=20260729-invoice-v8-flat-table-r5/);
  assert.match(html, /invoice-diagnostic-catalog\.js\?v=20260803-invoice-reference-policy-r2/);
  assert.match(html, /invoice-batch-modal\.js\?v=20260803-invoice-reference-policy-r2/);
  assert.doesNotMatch(html, /invoice-batch-modal\.(?:js|css)\?v=20260728-invoice-v8-presentation-r[123]["']/);
  assert.match(html, /invoice-async-ui\.js\?v=20260730-invoice-refs-ward-r13&invoice-ui-notices=20260822-r1/);
  assert.match(html, /candidate-office-reminder-workspace-v1\.js\?v=20260814-r2/);
  assert.match(html, /candidate-office-presenter-v1\.js\?v=20260814-r4/);
  assert.match(html, /candidate-office-bridge-v1\.js\?v=20260814-r6/);
  assert.match(html, /modal-modernisation\.css\?v=20260826-r15/);
  assert.match(html, /summary-modernisation\.css\?v=20260824-r7/);
  assert.match(html, /summary-modernisation\.js\?v=20260822-r2/);
  assert.match(html, /modal-modernisation\.js\?v=20260822-r3/);
  assert.match(html, /mytms-office-v1\.js\?v=20260824-candidate-status-r4/);
  assert.match(html, /modal-summary-final=20260824-r2/);
  assert.doesNotMatch(
    html,
    /invoice-batch-modal\.js\?v=20260728-invoice-async-v8(?:-correction-r5)?["']/
  );
  assert.ok(html.includes(stylesheetAsset));
  assert.ok(html.indexOf(mainAsset) < html.indexOf(diagnosticAsset));
  assert.ok(html.indexOf(diagnosticAsset) < html.indexOf(batchAsset));
  assert.ok(html.indexOf(batchAsset) < html.indexOf(asyncAsset));
  assert.match(main, /asset_version:\s*'20260821-mytms-office-r1'/);
  assert.match(main, /document\.documentElement\.dataset\.cloudtmsMainAssetContract/);
  assert.match(main, /document\.documentElement\.dataset\.bankingPayBatchOrphanCloseGuard = 'installed'/);
  assert.ok(
    main.indexOf('ensureBankingPayBatchChildOrphanCloseGuardV1();')
      < main.indexOf('function _defaultBrokerBaseUrl()'),
    'the orphan Close guard must be installed before normal application initialisation'
  );
});
