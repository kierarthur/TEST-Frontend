const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const main = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');

test('Timesheet bulk tool buttons publish immediate opening feedback and suppress repeat clicks', () => {
  const toolsStart = main.indexOf('function renderTools(');
  const bulkAuthoriseStart = main.indexOf('async function openBulkAuthoriseWorkbench()', toolsStart);
  assert.ok(toolsStart >= 0 && bulkAuthoriseStart > toolsStart, 'Timesheet tools block must be present');
  const tools = main.slice(toolsStart, bulkAuthoriseStart);

  assert.match(tools, /const runOpeningToolAction = async \(ev, label, action\) =>/);
  assert.match(tools, /openingToolAction === '1'/);
  assert.match(tools, /button\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(tools, /runOpeningToolAction\(ev, 'Bulk Process'/);
  assert.match(tools, /runOpeningToolAction\(ev, 'Bulk Authorise'/);
});

test('Bulk Authorise paints its modal before loading the saved sort preference', () => {
  const start = main.indexOf('async function openBulkAuthoriseWorkbench()');
  const end = main.indexOf('\nfunction buildBulkAuthoriseDatasetRequestFilters', start);
  assert.ok(start >= 0 && end > start, 'Bulk Authorise opener must be present');
  const opener = main.slice(start, end);
  const modalOpen = opener.search(/showModal\(\r?\n\s*'Bulk Authorise'/);
  const preferenceLoad = opener.indexOf('.then(() => loadBulkAuthoriseSortPreference())');

  assert.ok(modalOpen >= 0, 'Bulk Authorise modal call must be present');
  assert.ok(preferenceLoad > modalOpen, 'saved preference loading must start only after the modal shell is visible');
  assert.doesNotMatch(opener.slice(0, modalOpen), /await loadBulkAuthoriseSortPreference\(/);
});
