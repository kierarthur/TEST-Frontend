const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'main.js'), 'utf8');
const section = (start, end) => {
  const from = main.indexOf(start);
  const to = main.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing section ${start}`);
  return main.slice(from, to);
};

test('Import summary uses candidate submission evidence without changing payable hours', () => {
  const candidate = section('function mountTimesheetCandidateSummary(', 'function ');
  assert.match(candidate, /candidate_hours_received === true/);
  assert.match(candidate, /badge\.textContent = 'Hours Submitted'/);
  assert.match(main, /office_submission_mode_label === 'Import'[\s\S]*?td\.textContent = 'Import'/);
  const status = section('function paintTimesheetProcessingStatusCell(', 'function summaryUpdateRowDom(');
  assert.match(status, /office_pre_source_candidate_hours !== true/);
});

test('source candidate hours are evidence in Lines and never a pre-source finance preview', () => {
  const finance = section('function renderTimesheetFinanceTab(', 'function ');
  assert.match(finance, /isUnfundedSourceAuthoritativeRootFinance\(row, details\)/);
  assert.match(finance, /Final source hours not yet available/);
  const overview = section('function renderTimesheetOverviewTab(', 'function renderTimesheetFinanceTab(');
  assert.match(overview, /Candidate Hours Received/);
  assert.match(overview, /stageRaw !== 'UNPROCESSED'/);
});

test('signed candidate-hours PDF uses its Timesheet-scoped authenticated download', () => {
  const viewer = section('async function openTimesheetEvidenceViewerExisting(', 'function ');
  assert.match(viewer, /previewMode === 'CANDIDATE_HOURS_SUBMISSION'/);
  assert.match(viewer, /authFetch\(API\([\s\S]*?candidate-hours-evidence/);
  assert.match(viewer, /link\.href = signedUrl \|\| previewObjectUrl/);
  const evidence = main.slice(main.lastIndexOf('function renderTimesheetEvidenceTab('));
  assert.match(evidence, /CANDIDATE_HOURS_SUBMISSION'\) return 'Manager approval not required'/);
  assert.match(evidence, /CANDIDATE_HOURS: 'Candidate hours'/);
  const audit = section('function renderTimesheetAuditTab(', 'function ');
  assert.match(audit, /CANDIDATE_HOURS_RECEIVED'\) return 'Candidate Hours Received'/);
});
