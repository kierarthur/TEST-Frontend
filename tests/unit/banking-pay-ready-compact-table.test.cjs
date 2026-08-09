const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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
  assert.match(body, /Tick all eligible Ready to Pay lines across every page/);
  assert.doesNotMatch(body, />Tick<\/th>/);
  assert.ok(body.indexOf('>Channel</th>') < body.indexOf('>Amount</th>'));
  assert.match(body, /stickyReadySelectHeaderCellStyle/);
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
  assert.match(applyBody, /payload\.selection_intent_mode/);
  assert.match(requestBody, /serverSelectedRowsProvided/);
  assert.match(requestBody, /selectionIntentMode === 'IMPLICIT_ALL'/);
  assert.match(requestBody, /selected_preview_row_mode: selectedPreviewRowMode/);
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
