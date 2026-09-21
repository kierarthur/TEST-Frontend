const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relativePath => fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8')
  .replaceAll('\r\n', '\n');

const batch = read('js/invoice-batch-modal.js');
const main = read('js/main.js');
const css = read('css/invoice-batch-modal.css');

test('finalised source rows stay inside the existing batch modal and remain one report/week/client row', () => {
  assert.match(batch, /aria-label="Finalised self-bill invoices"/);
  assert.match(batch, /Each row creates one client invoice for one finalised week and backing report\./);
  assert.match(batch, /row\.report_number/);
  assert.match(batch, /row\.movement_count/);
  assert.match(batch, /Released after dispute/);
  assert.match(batch, /data-batch-action="generate-view"/);
  assert.match(css, /\.invbatch-candidate-section/);
  assert.match(css, /\.invbatch-source-results/);
});

test('header checkboxes replace separate select-all buttons for both displayed row sets', () => {
  assert.match(batch, /data-batch-field="source-selection-all"/);
  assert.match(batch, /data-batch-field="ordinary-selection-all"/);
  assert.match(batch, /weeklySourceHeaderSelectionState/);
  assert.match(batch, /rowHeaderSelectionState/);
  assert.doesNotMatch(batch, />Select all shifts</);
  assert.doesNotMatch(batch, />Unselect all shifts</);
});

test('source confirmation is an optional additive contract and ordinary confirmation remains present', () => {
  assert.match(batch, /weekly_source_selection_contract/);
  assert.match(batch, /WEEKLY_SOURCE_INVOICE_BATCH_SELECTION_V1/);
  assert.match(batch, /weekly_source_snapshot_hash/);
  assert.match(batch, /requestBody\.weekly_source_snapshot_hash = state\.weekly_source_snapshot_hash \|\| null/);
  assert.match(batch, /weekly_source_per_row_results/);
  assert.match(batch, /partial/);
  assert.match(batch, /selection_contract/);
  assert.match(batch, /\/api\/invoices\/batch-generate\/confirm/);
});

test('a source generate-and-view response opens the exact admitted invoice through the existing viewer', () => {
  const start = batch.indexOf('async function generateAndViewInvoiceCandidate(');
  const end = batch.indexOf('\n  function focusTrap(', start);
  assert.ok(start > 0 && end > start);
  const source = batch.slice(start, end);
  assert.match(source, /row\.source_kind === 'WEEKLY_FINAL_SOURCE'/);
  assert.match(source, /payload\.invoice_id/);
  assert.match(source, /prepareGeneratedInvoiceForBatchViewer/);
  assert.match(source, /weekly_source_per_row_results/);
});

test('source invoice detail shows frozen shift rows and only the guarded move control', () => {
  const start = main.indexOf('function renderInvoiceLinesTable(');
  const end = main.indexOf('\nfunction ', start + 40);
  assert.ok(start > 0 && end > start);
  const source = main.slice(start, end);
  assert.match(source, /weekly_source_invoice/);
  // Gate 7 item G7-2 (pack 24 §12; 25 §8 "Removed"). The unit of movement is
  // ONE immutable source PRESENTATION line, never a work event, so the edit
  // context returns `movable_lines` and the caption follows it. The superseded
  // `shift_groups` reader and its "Finalised source shifts" caption are gone.
  assert.match(source, /weeklySource\.movable_lines/);
  assert.match(source, /Finalised source lines/);
  assert.doesNotMatch(source, /weeklySource\.shift_groups/,
    'the edit context no longer returns shift_groups');
  assert.match(source, /data-presentation-line-id=/);
  assert.match(source, /data-presentation-hash=/);
  assert.match(source, /weeklySource\.report_numbers/);
  assert.match(source, /Released after dispute/);
  assert.match(source, /data-action="inv-move-weekly-source-shift"/);
  assert.match(source, /weeklySource\.editable === true/);
  assert.doesNotMatch(source, /data-action="inv-line-remove"/,
    'the source branch must return before ordinary generic line mutation controls');
});

test('source shift movement carries both invoice revisions without adding a week restriction', () => {
  const start = main.indexOf("case 'inv-move-weekly-source-shift':");
  const end = main.indexOf('\n        case ', start + 20);
  assert.ok(start > 0 && end > start);
  const source = main.slice(start, end);
  assert.match(source, /MOVE_SOURCE_INVOICE/);
  assert.match(source, /expected_source_document_revision/);
  assert.match(source, /expected_destination_document_revision/);
  // PHD-003. `source_shift_group_id` is refused by name and the request is a
  // VALUE contract over one presentation line and its expected hash. Source
  // group, cycle and week are immutable lineage, not destination restrictions.
  //
  // NOTE: this assertion is STATIC — it reads the source text. The EXECUTED
  // proof is `tests/e2e/weekly-source-invoice-line-move.spec.ts`, which drives
  // the shipped handler in a browser and inspects the posted body.
  assert.match(source, /presentation_line_id: presentationLineId/);
  assert.match(source, /expected_presentation_hash: presentationHash/);
  assert.doesNotMatch(source, /confirm_different_finalised_week|crossCycle|data-cross-cycle/);
  assert.doesNotMatch(source, /source_shift_group_id:/,
    'the refused field must not be sent as a payload key');
  assert.match(source, /\/api\/weekly-source\/v1\/commands/);
});

test('generic add controls are not offered on final-source invoices and report identity is visible', () => {
  const start = main.indexOf('function renderInvoiceModalContent(');
  const end = main.indexOf('\nfunction ', start + 40);
  assert.ok(start > 0 && end > start);
  const source = main.slice(start, end);
  assert.match(source, /weekly_source_invoice\?\.is_weekly_source_invoice === true/);
  assert.match(source, /weekly_source_invoice\?\.is_weekly_source_invoice !== true[\s\S]*Add timesheet/);
  assert.match(source, /weekly_source_invoice\?\.is_weekly_source_invoice !== true[\s\S]*Add adjustment/);
  assert.match(source, /report_numbers/);
  assert.match(source, /Backing report/);
});
