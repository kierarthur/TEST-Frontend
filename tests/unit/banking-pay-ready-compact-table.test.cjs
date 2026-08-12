const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../js/main.js'),
  'utf8'
);

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} must exist`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return source.slice(start, end);
}

test('Ready to Pay header uses an all-pages checkbox and a dedicated Channel column', () => {
  const body = sliceBetween(
    'const renderReadyPreviewTableHeaderHtml =',
    'const renderPayChannelBadge ='
  );

  assert.match(body, /data-action="banking:pay:toggleAllReadyPreviewRows"/);
  assert.match(body, /authoritativeAllPagesSelectionMode === 'IMPLICIT_ALL'/);
  assert.match(body, /selectionMutationAuthority\.selected_preview_row_mode/);
  assert.match(body, /allLoadedSelectableRowsSelected/);
  assert.match(body, /loadedSelectablePreviewRowIds\.every/);
  assert.match(body, /Tick all eligible Ready to Pay lines across every page/);
  assert.doesNotMatch(body, />Tick<\/th>/);
  assert.ok(body.indexOf('>Channel</th>') < body.indexOf('>Amount</th>'));
  assert.match(body, /stickyReadySelectHeaderCellStyle/);
});

test('Ready partial-selection state is restored after background modal descendant replacement', () => {
  assert.match(source, /previewSelectionSyncObserver = new MutationObserver/);
  assert.match(source, /previewSelectionSyncObserver\.observe\(targetEl, \{ childList: true, subtree: true \}\)/);
  assert.match(source, /syncTimesheetGroupCheckboxes\(targetEl\)/);
  assert.match(source, /previewSelectionSyncObserver\?\.disconnect\(\)/);
});

test('Ready to Pay rows are compact and expose breakdowns with a small plus or minus control', () => {
  const groupedBody = sliceBetween(
    'const renderReadyTimesheetGroupedRows =',
    'const renderTimesheetParentRows ='
  );
  const parentBody = sliceBetween(
    'const renderTimesheetParentRows =',
    'const renderSimplePreviewRows ='
  );
  const simpleBody = sliceBetween(
    'const renderSimplePreviewRows =',
    'const normalisePreviewRowArray ='
  );

  assert.match(groupedBody, /data-action="banking:pay:toggleTimesheetBreakdown"/);
  assert.match(groupedBody, /\$\{isBreakdownOpen \? '−' : '\+'\}/);
  assert.doesNotMatch(groupedBody, />Show timesheet breakdown/);
  assert.doesNotMatch(groupedBody, /breakdown row\(s\)/);
  assert.match(groupedBody, /renderPayChannelBadge\(payChannel\)/);
  assert.match(groupedBody, /stickyReadySelectBodyCellStyle/);

  assert.match(parentBody, /const compactReady =/);
  assert.match(parentBody, /renderTimesheetSegmentRows\(line, compactReady \? \{ expandedBodyOnly: true \} : \{\}\)/);
  assert.match(parentBody, /data-breakdown-key=/);
  assert.match(parentBody, /colspan="\$\{compactReady \? '9' : '8'\}"/);
  assert.match(parentBody, /stickyReadySelectBodyCellStyle/);

  assert.match(simpleBody, /const compactReady =/);
  assert.match(simpleBody, /renderPayChannelBadge\(payChannel\)/);
  assert.match(simpleBody, /renderCompactReadyAmountHtml\(line\)/);
  assert.match(simpleBody, /stickyReadySelectBodyCellStyle/);
});

test('Ready selection response adopts the server-owned complete selected ID set', () => {
  const applyBody = sliceBetween(
    'const applySelectionPayloadSummaryToWizard =',
    'const reloadCanonicalPreviewAfterSelectionMutation ='
  );
  const requestBody = sliceBetween(
    'async function bankingPayWorkbenchSessionSetSelectedRows',
    'async function bankingPayWorkbenchSessionDiscard'
  );

  assert.match(applyBody, /serverSelectedIdsProvided/);
  assert.match(applyBody, /payload\.server_selected_preview_row_ids/);
  assert.match(applyBody, /Object\.prototype\.hasOwnProperty\.call\(payload, 'server_selected_preview_row_ids_provided'\)/);
  assert.match(applyBody, /payload\.selection_intent_mode/);
  assert.match(applyBody, /selectionMembershipSnapshotProvided/);
  assert.match(applyBody, /payload\.selected_preview_row_ids_snapshot_provided === true/);
  assert.match(requestBody, /serverSelectedRowsProvided/);
  assert.match(requestBody, /const selectedPreviewRowIdsSnapshotProvided = Array\.isArray\(payloadObj\.selected_preview_row_ids\)/);
  assert.match(requestBody, /Object\.prototype\.hasOwnProperty\.call\(payloadObj, 'server_selected_preview_row_ids_provided'\)/);
  assert.match(requestBody, /selectionIntentMode === 'IMPLICIT_ALL'/);
  assert.match(requestBody, /selected_preview_row_mode: selectedPreviewRowMode/);
  assert.match(requestBody, /selected_preview_row_ids_snapshot_provided: selectedPreviewRowIdsSnapshotProvided/);
});

test('Ready header selection delegates to the server-owned all-pages selection action', () => {
  const selectionBody = sliceBetween(
    'const setPreviewRowsGlobalSelection =',
    'const normalisePayPreviewPageUiSection ='
  );
  const handlerBody = sliceBetween(
    "if (a === 'banking:pay:toggleAllReadyPreviewRows')",
    "if (a === 'banking:pay:toggleWorkbenchSection')"
  );

  assert.match(selectionBody, /selection_action: wantChecked \? 'SELECT_ALL_SECTION' : 'CLEAR_SECTION'/);
  assert.match(selectionBody, /reloadCanonicalPreviewAfterSelectionMutation\(\{ includeBlocked: true \}\)/);
  assert.match(handlerBody, /if \(kind !== 'change'\) return/);
  assert.match(handlerBody, /await setPreviewRowsGlobalSelection\(checked\)/);
});

test('Ready table keeps its checkbox column fixed during horizontal scrolling', () => {
  assert.match(source, /const stickyReadySelectHeaderCellStyle = 'position:sticky;top:0;left:0;/);
  assert.match(source, /const stickyReadySelectBodyCellStyle = 'position:sticky;left:0;/);
  assert.match(source, /renderReadyPreviewTableHeaderHtml[\s\S]*stickyReadySelectHeaderCellStyle/);
  assert.match(source, /renderReadyTimesheetGroupedRows[\s\S]*stickyReadySelectBodyCellStyle/);
  assert.match(source, /renderSimplePreviewRows[\s\S]*stickyReadySelectBodyCellStyle/);
});

test('Ready export walks every server page and flattens complete line breakdowns with Included state', () => {
  const exportBody = sliceBetween(
    'async function bankingPayWorkbenchExportReadyToPayCsv',
    '/* CloudTMS Retention Marker / Unprocess handover'
  );
  const renderBody = sliceBetween(
    'const renderReadyToPayExportControl =',
    'const renderPayChannelBadge ='
  );

  assert.match(renderBody, /data-action="banking:pay:exportReadyToPayCsv"/);
  assert.match(renderBody, />⇩ CSV<\/button>/);
  assert.match(exportBody, /bankingPayWorkbenchSessionGetPreviewPage\(sessionId, 'canonical_preview_lines'/);
  assert.match(exportBody, /limit: 100/);
  assert.match(exportBody, /store_cursor: false/);
  assert.match(exportBody, /page\.next_cursor \?\? page\.nextCursor/);
  assert.match(exportBody, /page\.has_more === true \|\| page\.hasMore === true/);
  assert.match(exportBody, /expectedSessionVersion[\s\S]*pageSessionVersion/);
  assert.match(exportBody, /detailType: 'Timesheet segment'/);
  assert.match(exportBody, /detailType: 'Recovery component'/);
  assert.match(exportBody, /keyType === 'EXPENSE_CODE' \? 'Expense component' : 'Payment line'/);
  assert.match(exportBody, /const headers = \['Included'/);
  assert.match(exportBody, /included \? 'Yes' : 'No'/);
  assert.match(exportBody, /banking_pay_ready_to_pay_/);
});

test('Ready export executes against two server pages without changing the visible page cursor', async () => {
  const exportBody = sliceBetween(
    'async function bankingPayWorkbenchExportReadyToPayCsv',
    'function bindBulkProcessEvidencePane'
  );
  const pageCalls = [];
  let downloadedBlob = null;
  const pages = [
    {
      ok: true,
      session_id: '11111111-1111-4111-8111-111111111111',
      session_version: 7,
      has_more: true,
      next_cursor: { after: 100 },
      rows: [{
        id: 'ready-1',
        selected: true,
        selection_state: 'SELECTED',
        line_type: 'TIMESHEET_PAYMENT',
        display_name: 'Candidate One',
        pay_channel: 'PAYE',
        section_segment_rows: [
          { segment_id: 'seg-1', date: '2026-08-01', pay_amount_ex_vat: 12.34 },
          { segment_id: 'seg-2', date: '2026-08-02', pay_amount_ex_vat: 23.45 }
        ]
      }]
    },
    {
      ok: true,
      session_id: '11111111-1111-4111-8111-111111111111',
      session_version: 7,
      has_more: false,
      next_cursor: null,
      rows: [{
        id: 'ready-2',
        selected: false,
        selection_state: 'UNSELECTED',
        line_type: 'OVERPAYMENT_RECOVERY',
        display_name: 'Candidate One',
        pay_channel: 'PAYE',
        case_components: [{ component_label: 'Recovery A', preview_due_amount_ex_vat: 5.67 }]
      }]
    }
  ];
  const anchor = { clickCalled: false, click() { this.clickCalled = true; }, remove() {} };
  const context = vm.createContext({
    Blob,
    Date,
    JSON,
    Math,
    Number,
    String,
    Set,
    Array,
    Object,
    Promise,
    setTimeout,
    bankingGetState: () => ({ pay: { draftWizard: { workbench: { session_id: '11111111-1111-4111-8111-111111111111' } } } }),
    bankingPayWorkbenchSessionGetPreviewPage: async (_sessionId, _section, options) => {
      pageCalls.push(options);
      return pages[pageCalls.length - 1];
    },
    URL: {
      createObjectURL(blob) { downloadedBlob = blob; return 'blob:test'; },
      revokeObjectURL() {}
    },
    document: {
      body: { appendChild() {} },
      createElement() { return anchor; }
    }
  });
  vm.runInContext(`${exportBody}\nglobalThis.__exportReady = bankingPayWorkbenchExportReadyToPayCsv;`, context);

  const result = await context.__exportReady();
  const csv = await downloadedBlob.text();

  assert.equal(result.page_count, 2);
  assert.equal(result.canonical_row_count, 2);
  assert.equal(result.exported_breakdown_row_count, 3);
  assert.equal(anchor.clickCalled, true);
  assert.equal(pageCalls.length, 2);
  assert.ok(pageCalls.every((call) => call.store_cursor === false));
  assert.match(csv, /"Yes","TIMESHEET PAYMENT","Timesheet segment"/);
  assert.match(csv, /"No","OVERPAYMENT RECOVERY","Recovery component"/);
  assert.match(csv, /"-5\.67"/);
});
