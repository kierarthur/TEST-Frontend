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
  assert.match(source, /continuousLabel\.textContent = 'Continuous view'/);
  assert.doesNotMatch(source, /loads ahead as you scroll/);
  assert.match(source, /continuousGrid\.applySpacers\(currentSection, tb, cols\.length \+ 1\)/);
  assert.match(source, /continuousGrid\.applySpacers\('outbox', tb, outboxColumnDefs\.length\)/);
  assert.doesNotMatch(source, /CloudTMSCandidateOfficeBridge\.sortSummaryRowsByCandidateStatus\(uniqueRows/);
  assert.match(html, /summary-continuous-grid-v1\.js\?v=20260905-r8/);
  assert.match(html, /summary-modernisation\.css\?v=20260905-continuous-grid-r4/);
  const loadSectionSource = source.slice(
    source.indexOf('async function loadSection()'),
    source.indexOf('function renderSummary(')
  );
  assert.ok(
    loadSectionSource.indexOf("sectionKey === 'umbrellas'") < loadSectionSource.indexOf('const datasetKey ='),
    'the default Umbrellas filter must be applied before the continuous-grid dataset is configured'
  );
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
  assert.match(source, /hostEl\.__summaryTypeAheadController = state\.controller/);
  assert.match(source, /liveSummaryHost\?\.isConnected[\s\S]*liveSummaryHost\.__summaryTypeAheadController/);
  assert.equal((source.match(/keyboardFocusLeaseActive = Number\((?:liveState|state)\.focus_restore_until \|\| 0\) > Date\.now\(\)/g) || []).length, 2);
  assert.match(source, /outgoingSummaryHost\.dataset\.summaryReplacing = 'true'/);
  assert.match(source, /liveState\.focus_restore_until = Date\.now\(\) \+ 5000/);
  assert.match(source, /typeAheadState\.has_focus === true \|\| keyboardFocusLeaseActive/);
  assert.match(source, /resetSummaryTypeAheadState\(sec, 'grid-replaced',[\s\S]*preserveFocus: true/);
  assert.match(source, /resetSummaryTypeAheadUiState\('grid-replaced',[\s\S]*preserveFocus: true/);
  assert.match(source, /const renderedActiveId = String\(/);
  assert.match(source, /landedState\.active_row_id = String\(result\.rowId \|\| ''\)\.trim\(\)/);
  const activeUiSource = source.slice(
    source.indexOf('const syncSummaryActiveRowUi ='),
    source.indexOf('const setSummaryActiveRow =')
  );
  assert.ok(
    activeUiSource.indexOf('bodyWrap.focus') < activeUiSource.indexOf("targetRow.classList.add('active-summary-row')"),
    'focus must transfer before the active-row repaint so a following key cannot land on a detached grid'
  );
  assert.match(source, /runContinuousSummaryJump\(continuousController, ordinalIndex/);
  assert.match(source, /window\.CloudTMSSummaryContinuousGrid\?\.invalidate\?\.\(s, \{ refresh: false \}\)/);
  assert.match(source, /outboxHeaderSortKeys/);
  assert.match(source, /rowObj\.display_route_label \|\| rowObj\.route_display/);
  assert.match(source, /normaliseText\(row\?\.display_route_label \|\| row\?\.route_display\)/);
  assert.match(source, /header visibly checked while its authoritative count is resolving/);
  assert.match(source, /hdrCbEl\.checked = resolvedSelectionState\.selectionActive;[\s\S]*hdrCbEl\.indeterminate = false/);
  assert.equal(
    (source.match(/const membershipTotalRaw = membershipTotalValue == null/g) || []).length,
    2,
    'both the membership ranker and state reader must preserve an unknown total as unknown'
  );
  assert.match(source, /const membershipTotalRaw = membershipTotalValue == null[\s\S]*\? Number\.NaN/);
  assert.match(source, /resolverSelectedCount !== 0 \|\| resolverSelectedCountSource === 'authoritative'/);
  assert.match(source, /The backend may normalise equivalent filter defaults differently/);
  assert.match(source, /const nextDatasetKey = cacheKey/);
  assert.match(source, /const shouldRestoreFocusedGrid =/);
  assert.match(source, /shouldRestoreFocusedGrid \|\| shouldAutoFocusStartupGrid/);
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
  assert.match(css, /#content \.ctms-continuous-alpha-rail \.ctms-continuous-alpha-letter/);
  assert.match(css, /min-height:0!important/);
  assert.match(css, /input\.row-select/);
  assert.match(css, /min-height:18px!important/);
  assert.match(css, /max-width:1024px.*hover:none.*pointer:coarse/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(source, /force: isLongJump/);
  assert.match(source, /label: 'Moving to matching records…'/);
});
