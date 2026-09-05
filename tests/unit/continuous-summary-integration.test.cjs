const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const source = readFileSync(path.join(root, 'js/main.js'), 'utf8');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const css = readFileSync(path.join(root, 'css/summary-modernisation.css'), 'utf8');

test('all approved summaries use continuous loading while Banking Pay remains paged', () => {
  assert.match(source, /continuousSummary\.isEnabled\(sectionKey\)/);
  assert.match(source, /Continuous view · loads ahead as you scroll/);
  assert.match(source, /continuousGrid\.applySpacers\(currentSection, tb, cols\.length \+ 1\)/);
  assert.match(source, /continuousGrid\.applySpacers\('outbox', tb, outboxColumnDefs\.length\)/);
  assert.doesNotMatch(source, /CloudTMSCandidateOfficeBridge\.sortSummaryRowsByCandidateStatus\(uniqueRows/);
  assert.match(html, /summary-continuous-grid-v1\.js\?v=20260905-r2/);
});

test('Outbox Select All uses query-wide membership and bounded delete batches', () => {
  assert.match(source, /selection\.mode = wantOn \? 'all_filtered' : 'explicit'/);
  assert.match(source, /primeSummaryMembership\('outbox', fp, \{ explicitFullMembership: true \}\)/);
  assert.match(source, /const deleteChunkSize = 100/);
  assert.match(source, /getSummaryMembership\(sectionKey, snapshot\.dataset_key\)/);
  assert.match(source, /tr\.dataset\.id = String\(r\.outbox_key \|\| ''\)/);
});

test('continuous sheets retain keyboard, sort and heartbeat reconciliation contracts', () => {
  assert.match(source, /\['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'\]/);
  assert.match(source, /runContinuousSummaryJump\(continuousController, ordinalIndex/);
  assert.match(source, /window\.CloudTMSSummaryContinuousGrid\?\.invalidate\?\.\(s, \{ refresh: false \}\)/);
  assert.match(source, /outboxHeaderSortKeys/);
});

test('related summary views fetch once and expose bounded virtual pages', () => {
  assert.match(source, /let relatedListPromise = null/);
  assert.match(source, /items\.slice\(start, start \+ ps\)/);
  assert.match(source, /stSec\.hasMore = \(start \+ pageItems\.length\) < total/);
});

test('background prefetch stays silent and never paints a loading indicator', () => {
  assert.doesNotMatch(source, /ctms-continuous-status__activity/);
  assert.doesNotMatch(source, /LOADING AHEAD/);
});

test('explicit long keyboard jumps refresh their destination under the loading overlay', () => {
  assert.match(source, /async function runContinuousSummaryJump/);
  assert.match(source, /function mountContinuousSummaryAlphabetRail/);
  assert.match(source, /pointermove/);
  assert.match(source, /mountContinuousSummaryAlphabetRail\('outbox'/);
  assert.match(source, /mountContinuousSummaryAlphabetRail\(currentSection/);
  assert.match(css, /\.ctms-continuous-alpha-rail/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(source, /force: isLongJump/);
  assert.match(source, /label: 'Moving to matching records…'/);
});
