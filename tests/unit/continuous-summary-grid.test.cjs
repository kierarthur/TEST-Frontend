const assert = require('node:assert/strict');
const test = require('node:test');

const grid = require('../../js/summary-continuous-grid-v1.js');

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

test('continuous summary grid covers the seven approved sheets but not Banking Pay', () => {
  assert.deepEqual(grid.ENABLED_SECTIONS, [
    'candidates',
    'clients',
    'timesheets',
    'contracts',
    'invoices',
    'umbrellas',
    'outbox'
  ]);
  assert.equal(grid.isEnabled('outbox'), true);
  assert.equal(grid.isEnabled('banking-pay'), false);
  assert.equal(grid.DEFAULT_PAGE_SIZE, 50);
  assert.equal(grid.PREFETCH_AHEAD, 3);
});

test('continuous summary grid renders a bounded window and prefetches three pages ahead', async () => {
  grid.reset('clients');
  const fetched = [];
  const rows = Array.from({ length: 600 }, (_, index) => ({ id: `client-${index}` }));
  const controller = grid.configure({
    section: 'clients',
    datasetKey: 'clients:test',
    pageSize: 50,
    total: rows.length,
    initialPage: 1,
    fetchPage: async (page, pageSize) => {
      fetched.push(page);
      const start = (page - 1) * pageSize;
      return { rows: rows.slice(start, start + pageSize), total: rows.length };
    }
  });

  const initial = await controller.load(1);
  assert.deepEqual(initial.loadedPages, [1]);
  assert.equal(initial.rows.length, 50);

  await settle();
  const prefetched = controller.getView();
  assert.deepEqual(fetched.slice(0, 4), [1, 2, 3, 4]);
  assert.deepEqual(prefetched.loadedPages, [1, 2]);
  assert.equal(prefetched.rows.length, 100);

  const landing = await controller.jumpToIndex(420);
  assert.equal(landing.page, 9);
  assert.equal(landing.rowId, 'client-420');

  const pageNineLoadsBeforeRefresh = fetched.filter((page) => page === 9).length;
  await controller.jumpToIndex(420, { force: true });
  assert.equal(
    fetched.filter((page) => page === 9).length,
    pageNineLoadsBeforeRefresh + 1,
    'an explicit keyboard jump must refresh its destination block'
  );

  await settle();
  const deepView = controller.getView();
  assert.ok(deepView.rows.length <= 150, 'DOM window must stay within three 50-row pages');
  assert.ok(deepView.cachedPages.length <= grid.MAX_CACHED_PAGES, 'cache must remain bounded');
  assert.equal(deepView.startIndex, 350);
  assert.equal(deepView.endIndex, 500);
});

test('Outbox identities remain channel-qualified', () => {
  assert.equal(
    grid.rowIdentity({ channel: 'email', outbox_id: 'abc' }, 'outbox'),
    'EMAIL::abc'
  );
  assert.equal(grid.rowIdentity({ outbox_id: 'abc' }, 'outbox'), '');
});

test('a changed total from a background page is rendered back into the live grid', async () => {
  grid.reset('umbrellas');
  const renders = [];
  const host = {
    dataset: {},
    isConnected: true,
    scrollTop: 0,
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() { return []; }
  };
  const controller = grid.configure({
    section: 'umbrellas',
    datasetKey: 'umbrellas:count-change',
    pageSize: 50,
    total: 332,
    initialPage: 1,
    fetchPage: async (page, pageSize) => ({
      rows: Array.from({ length: pageSize }, (_, index) => ({ id: `${page}-${index}` })),
      total: page === 1 ? 332 : 331
    }),
    onRender: (view) => renders.push(view.total)
  });

  await controller.load(1);
  grid.mount('umbrellas', host);
  await settle();

  assert.equal(controller.getView().total, 331);
  assert.ok(renders.includes(331), 'the mounted grid must reconcile an updated background total');
});
