(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CloudTMSSummaryContinuousGrid = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const ENABLED_SECTIONS = Object.freeze([
    'candidates',
    'clients',
    'timesheets',
    'contracts',
    'invoices',
    'umbrellas',
    'outbox'
  ]);
  const ENABLED_SET = new Set(ENABLED_SECTIONS);
  const DEFAULT_PAGE_SIZE = 50;
  const DEFAULT_ROW_HEIGHT = 46;
  const RENDER_RADIUS = 1;
  const PREFETCH_AHEAD = 3;
  const MAX_CACHED_PAGES = 7;
  const states = new Map();

  const cleanSection = (value) => String(value == null ? '' : value).trim().toLowerCase();
  const positiveInt = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 ? Math.trunc(number) : fallback;
  };
  const finiteTotal = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
  };
  const rowIdentity = (row, section) => {
    const source = row && typeof row === 'object' ? row : {};
    if (section === 'outbox') {
      const channel = String(source.channel || '').trim().toUpperCase();
      const id = String(source.outbox_id || source.id || '').trim();
      return channel && id ? `${channel}::${id}` : '';
    }
    return String(source.id || source.timesheet_id || source.contract_week_id || '').trim();
  };
  const maxPage = (state) => state.total == null
    ? Number.MAX_SAFE_INTEGER
    : Math.max(1, Math.ceil(state.total / state.pageSize));
  const clampPage = (state, page) => Math.min(maxPage(state), Math.max(1, positiveInt(page, 1)));

  function createState(config) {
    return {
      section: config.section,
      viewKey: config.viewKey,
      datasetKey: config.datasetKey,
      sortKey: config.sortKey,
      sortDir: config.sortDir,
      pageSize: config.pageSize,
      total: finiteTotal(config.total),
      targetPage: positiveInt(config.initialPage, 1),
      pages: new Map(),
      pending: new Map(),
      generation: 1,
      fetchChain: Promise.resolve(),
      fetchPage: config.fetchPage,
      getTotal: config.getTotal,
      onRender: config.onRender,
      onTargetPage: config.onTargetPage,
      rowHeight: DEFAULT_ROW_HEIGHT,
      scrollTop: 0,
      desiredIndex: null,
      mountedHost: null,
      mountedCleanup: null,
      scrollGestureActive: false,
      renderDeferred: false,
      renderQueued: false,
      loadQueued: false,
      loadingPages: new Set(),
      lastError: null
    };
  }

  function normaliseConfig(raw) {
    const config = raw && typeof raw === 'object' ? raw : {};
    const section = cleanSection(config.section);
    const datasetKey = String(config.datasetKey || '').trim();
    const sortKey = config.sortKey == null ? '' : String(config.sortKey).trim();
    const sortDir = String(config.sortDir || 'asc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
    const pageSize = positiveInt(config.pageSize, DEFAULT_PAGE_SIZE);
    return {
      section,
      datasetKey,
      sortKey,
      sortDir,
      pageSize,
      initialPage: positiveInt(config.initialPage, 1),
      total: finiteTotal(config.total),
      fetchPage: typeof config.fetchPage === 'function' ? config.fetchPage : null,
      getTotal: typeof config.getTotal === 'function' ? config.getTotal : null,
      onRender: typeof config.onRender === 'function' ? config.onRender : null,
      onTargetPage: typeof config.onTargetPage === 'function' ? config.onTargetPage : null,
      viewKey: JSON.stringify({ section, datasetKey, sortKey, sortDir, pageSize })
    };
  }

  function requestRender(state) {
    if (state && state.scrollGestureActive) {
      state.renderDeferred = true;
      return;
    }
    if (!state || state.renderQueued || !state.mountedHost || typeof state.onRender !== 'function') return;
    state.renderQueued = true;
    Promise.resolve().then(() => {
      state.renderQueued = false;
      if (!state.mountedHost || typeof state.onRender !== 'function') return;
      state.onRender(getView(state.section));
    });
  }

  function evictDistantPages(state) {
    if (state.pages.size <= MAX_CACHED_PAGES) return;
    const ordered = Array.from(state.pages.keys()).sort((left, right) => {
      const distance = Math.abs(right - state.targetPage) - Math.abs(left - state.targetPage);
      return distance || (right - left);
    });
    while (state.pages.size > MAX_CACHED_PAGES && ordered.length) {
      state.pages.delete(ordered.shift());
    }
  }

  function ensurePage(state, requestedPage, options = {}) {
    const page = clampPage(state, requestedPage);
    if (state.pages.has(page) && options.force !== true) return Promise.resolve(state.pages.get(page));
    if (state.pending.has(page)) return state.pending.get(page);
    if (typeof state.fetchPage !== 'function') return Promise.reject(new Error('Continuous summary data source is unavailable.'));

    const generation = state.generation;
    state.loadingPages.add(page);
    state.lastError = null;
    const task = state.fetchChain
      .catch(() => null)
      .then(async () => {
        const raw = await state.fetchPage(page, state.pageSize);
        if (generation !== state.generation) return [];
        const previousTotal = state.total;
        const rows = Array.isArray(raw)
          ? raw
          : (Array.isArray(raw && raw.rows) ? raw.rows : []);
        const rawTotal = Array.isArray(raw) ? null : finiteTotal(raw && raw.total);
        const callbackTotal = state.getTotal ? finiteTotal(state.getTotal()) : null;
        if (rawTotal != null) state.total = rawTotal;
        else if (callbackTotal != null) state.total = callbackTotal;
        else if (rows.length < state.pageSize) state.total = ((page - 1) * state.pageSize) + rows.length;
        state.pages.set(page, rows.slice());
        evictDistantPages(state);
        if (state.total !== previousTotal) requestRender(state);
        return rows;
      })
      .catch((error) => {
        if (generation === state.generation) state.lastError = error;
        throw error;
      })
      .finally(() => {
        if (generation === state.generation) {
          state.pending.delete(page);
          state.loadingPages.delete(page);
        }
      });
    state.fetchChain = task.catch(() => null);
    state.pending.set(page, task);
    return task;
  }

  function renderedPages(state) {
    if (!state.pages.has(state.targetPage)) {
      if (!state.pages.size) return [];
      return [Array.from(state.pages.keys())
        .sort((a, b) => Math.abs(a - state.targetPage) - Math.abs(b - state.targetPage))[0]];
    }

    const pages = [state.targetPage];
    for (let distance = 1; distance <= RENDER_RADIUS; distance += 1) {
      const before = state.targetPage - distance;
      const after = state.targetPage + distance;
      if (before >= 1 && state.pages.has(before)) pages.unshift(before);
      if (after <= maxPage(state) && state.pages.has(after)) pages.push(after);
    }
    return pages;
  }

  function getView(sectionValue) {
    const section = cleanSection(sectionValue);
    const state = states.get(section);
    if (!state) return null;
    const pages = renderedPages(state);
    const firstPage = pages.length ? pages[0] : state.targetPage;
    const rows = [];
    pages.forEach((page) => rows.push(...(state.pages.get(page) || [])));
    const startIndex = Math.max(0, (firstPage - 1) * state.pageSize);
    const endIndex = startIndex + rows.length;
    const total = state.total;
    return {
      section,
      rows,
      pageSize: state.pageSize,
      targetPage: state.targetPage,
      loadedPages: pages,
      cachedPages: Array.from(state.pages.keys()).sort((a, b) => a - b),
      startIndex,
      endIndex,
      total,
      rowHeight: state.rowHeight,
      topSpacerPx: Math.max(0, Math.round(startIndex * state.rowHeight)),
      bottomSpacerPx: total == null ? 0 : Math.max(0, Math.round((total - endIndex) * state.rowHeight)),
      loading: state.loadingPages.size > 0,
      lastError: state.lastError || null
    };
  }

  function scheduleWindow(state) {
    if (state.loadQueued) return;
    state.loadQueued = true;
    Promise.resolve().then(async () => {
      state.loadQueued = false;
      const generation = state.generation;
      const target = clampPage(state, state.targetPage);
      const wanted = [target];
      if (target > 1) wanted.push(target - 1);
      for (let distance = 1; distance <= PREFETCH_AHEAD; distance += 1) {
        const page = target + distance;
        if (page <= maxPage(state)) wanted.push(page);
      }
      for (const page of wanted) {
        if (generation !== state.generation) return;
        const before = getView(state.section);
        const wasVisible = before && before.loadedPages.includes(page);
        const beforeTotal = before ? before.total : null;
        try {
          await ensurePage(state, page);
          const after = getView(state.section);
          const nowVisible = after && after.loadedPages.includes(page);
          const totalChanged = !!after && after.total !== beforeTotal;
          if ((!wasVisible && nowVisible) || totalChanged) requestRender(state);
        } catch {
          requestRender(state);
          return;
        }
      }
    });
  }

  function configure(rawConfig) {
    const config = normaliseConfig(rawConfig);
    if (!ENABLED_SET.has(config.section)) return null;
    if (!config.fetchPage) throw new Error(`Continuous summary data source is missing for ${config.section}.`);

    let state = states.get(config.section);
    if (!state || state.viewKey !== config.viewKey) {
      if (state && typeof state.mountedCleanup === 'function') state.mountedCleanup();
      state = createState(config);
      states.set(config.section, state);
    } else {
      state.fetchPage = config.fetchPage;
      state.getTotal = config.getTotal;
      state.onRender = config.onRender;
      state.onTargetPage = config.onTargetPage;
      if (config.total != null && state.total !== config.total) {
        state.total = config.total;
        requestRender(state);
      }
      state.targetPage = clampPage(state, config.initialPage || state.targetPage);
    }
    return controllerFor(state);
  }

  async function load(sectionValue, pageValue) {
    const section = cleanSection(sectionValue);
    const state = states.get(section);
    if (!state) throw new Error(`Continuous summary is not configured for ${section}.`);
    state.targetPage = clampPage(state, pageValue || state.targetPage);
    await ensurePage(state, state.targetPage);
    scheduleWindow(state);
    return getView(section);
  }

  function findCachedIndex(state, identity) {
    const cleanIdentity = String(identity || '').trim();
    if (!cleanIdentity) return null;
    for (const [page, rows] of state.pages.entries()) {
      const offset = rows.findIndex((row) => rowIdentity(row, state.section) === cleanIdentity);
      if (offset >= 0) return ((page - 1) * state.pageSize) + offset;
    }
    return null;
  }

  async function jumpToIndex(state, rawIndex, options = {}) {
    const upper = state.total == null ? Number.MAX_SAFE_INTEGER : Math.max(0, state.total - 1);
    const index = Math.max(0, Math.min(upper, Math.trunc(Number(rawIndex) || 0)));
    const page = Math.floor(index / state.pageSize) + 1;
    const previousTargetPage = state.targetPage;
    state.targetPage = clampPage(state, page);
    state.desiredIndex = index;
    state.scrollTop = index * state.rowHeight;
    if (typeof state.onTargetPage === 'function') state.onTargetPage(state.targetPage);
    const rows = await ensurePage(state, state.targetPage, { force: options.force === true });
    const row = rows[index % state.pageSize] || rows[0] || null;
    if (
      typeof state.onRender === 'function' &&
      (options.force === true || state.targetPage !== previousTargetPage)
    ) {
      state.onRender(getView(state.section));
    }
    scheduleWindow(state);
    return {
      index,
      page: state.targetPage,
      row,
      rowId: rowIdentity(row, state.section)
    };
  }

  function controllerFor(state) {
    return Object.freeze({
      section: state.section,
      load: (page) => load(state.section, page),
      getView: () => getView(state.section),
      getRowIndex: (identity) => findCachedIndex(state, identity),
      jumpToIndex: (index, options) => jumpToIndex(state, index, options),
      moveFrom: (identity, delta, options) => {
        const current = findCachedIndex(state, identity);
        const fallback = Math.max(0, ((state.targetPage - 1) * state.pageSize));
        return jumpToIndex(state, (current == null ? fallback : current) + Number(delta || 0), options);
      },
      refreshVisible: async () => {
        const visiblePages = renderedPages(state);
        for (const page of visiblePages) await ensurePage(state, page, { force: true });
        if (typeof state.onRender === 'function') state.onRender(getView(state.section));
        scheduleWindow(state);
        return getView(state.section);
      },
      invalidate: (options = {}) => {
        state.generation += 1;
        state.pages.clear();
        state.pending.clear();
        state.loadingPages.clear();
        state.fetchChain = Promise.resolve();
        state.lastError = null;
        if (options.refresh === true) {
          void ensurePage(state, state.targetPage).then(() => {
            if (typeof state.onRender === 'function') state.onRender(getView(state.section));
            scheduleWindow(state);
          }).catch(() => requestRender(state));
        }
      }
    });
  }

  function addSpacerRow(tbody, position, height, colspan) {
    if (!tbody || height <= 0) return null;
    const row = tbody.ownerDocument.createElement('tr');
    row.className = `ctms-continuous-spacer ctms-continuous-spacer--${position}`;
    row.setAttribute('aria-hidden', 'true');
    const cell = tbody.ownerDocument.createElement('td');
    cell.colSpan = Math.max(1, positiveInt(colspan, 1));
    cell.style.height = `${Math.max(0, Math.round(height))}px`;
    cell.style.padding = '0';
    cell.style.border = '0';
    row.appendChild(cell);
    if (position === 'top') tbody.insertBefore(row, tbody.firstChild);
    else tbody.appendChild(row);
    return row;
  }

  function applySpacers(sectionValue, tbody, colspan) {
    const view = getView(sectionValue);
    if (!view || !tbody) return view;
    tbody.querySelectorAll('tr.ctms-continuous-spacer').forEach((row) => row.remove());
    addSpacerRow(tbody, 'top', view.topSpacerPx, colspan);
    addSpacerRow(tbody, 'bottom', view.bottomSpacerPx, colspan);
    return view;
  }

  function mount(sectionValue, host) {
    const section = cleanSection(sectionValue);
    const state = states.get(section);
    if (!state || !host) return null;
    if (typeof state.mountedCleanup === 'function') state.mountedCleanup();
    state.mountedHost = host;
    host.dataset.continuousSummary = 'true';
    const view = getView(section);
    if (view && view.total != null) host.setAttribute('aria-rowcount', String(view.total));

    let timer = null;
    let gestureTimer = null;
    let pointerDown = false;
    let ignoreScroll = true;
    const eventRoot = host.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
    const finishScrollGesture = () => {
      if (pointerDown) return;
      state.scrollGestureActive = false;
      if (state.renderDeferred) {
        state.renderDeferred = false;
        requestRender(state);
      }
    };
    const scheduleGestureFinish = (delay = 180) => {
      if (gestureTimer) clearTimeout(gestureTimer);
      gestureTimer = setTimeout(finishScrollGesture, Math.max(0, Number(delay) || 0));
    };
    const onPointerDown = () => {
      pointerDown = true;
      state.scrollGestureActive = true;
      if (gestureTimer) clearTimeout(gestureTimer);
    };
    const onPointerUp = (event) => {
      pointerDown = false;
      scheduleGestureFinish(String(event?.pointerType || '').toLowerCase() === 'touch' ? 180 : 0);
    };
    const onScroll = () => {
      if (ignoreScroll) return;
      state.scrollGestureActive = true;
      state.scrollTop = Math.max(0, Number(host.scrollTop || 0));
      scheduleGestureFinish(180);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!host.isConnected) return;
        const estimatedIndex = Math.max(0, Math.floor(state.scrollTop / Math.max(1, state.rowHeight)));
        const page = clampPage(state, Math.floor(estimatedIndex / state.pageSize) + 1);
        if (page === state.targetPage) return;
        state.targetPage = page;
        if (typeof state.onTargetPage === 'function') state.onTargetPage(page);
        scheduleWindow(state);
        requestRender(state);
      }, 70);
    };
    host.addEventListener('pointerdown', onPointerDown, { passive: true });
    host.addEventListener('scroll', onScroll, { passive: true });
    try { eventRoot?.addEventListener?.('pointerup', onPointerUp, true); } catch {}
    try { eventRoot?.addEventListener?.('pointercancel', onPointerUp, true); } catch {}

    const dataRows = Array.from(host.querySelectorAll('tbody tr:not(.ctms-continuous-spacer)'))
      .filter((row) => row.hasAttribute('data-id') || row.hasAttribute('data-outbox-key'));
    const measured = dataRows
      .slice(0, 20)
      .map((row) => Number(row.getBoundingClientRect && row.getBoundingClientRect().height || 0))
      .filter((height) => Number.isFinite(height) && height >= 20 && height <= 600)
      .sort((a, b) => a - b);
    if (measured.length) {
      const observedAverage = measured.reduce((sum, height) => sum + height, 0) / measured.length;
      const nextRowHeight = (state.rowHeight * 0.35) + (observedAverage * 0.65);
      if (Math.abs(nextRowHeight - state.rowHeight) >= 4) {
        state.rowHeight = nextRowHeight;
        requestRender(state);
      }
    }

    const restoreTop = state.desiredIndex == null
      ? state.scrollTop
      : state.desiredIndex * state.rowHeight;
    state.desiredIndex = null;
    try { host.scrollTop = Math.max(0, restoreTop); } catch {}
    state.scrollTop = Math.max(0, Number(host.scrollTop || restoreTop || 0));
    Promise.resolve().then(() => { ignoreScroll = false; });

    state.mountedCleanup = () => {
      if (timer) clearTimeout(timer);
      if (gestureTimer) clearTimeout(gestureTimer);
      pointerDown = false;
      state.scrollGestureActive = false;
      try { host.removeEventListener('scroll', onScroll); } catch {}
      try { host.removeEventListener('pointerdown', onPointerDown); } catch {}
      try { eventRoot?.removeEventListener?.('pointerup', onPointerUp, true); } catch {}
      try { eventRoot?.removeEventListener?.('pointercancel', onPointerUp, true); } catch {}
      if (state.mountedHost === host) state.mountedHost = null;
    };
    return controllerFor(state);
  }

  function getController(sectionValue) {
    const state = states.get(cleanSection(sectionValue));
    return state ? controllerFor(state) : null;
  }

  function invalidate(sectionValue, options = {}) {
    const controller = getController(sectionValue);
    if (controller) controller.invalidate(options);
  }

  function reset(sectionValue) {
    const section = cleanSection(sectionValue);
    const state = states.get(section);
    if (state && typeof state.mountedCleanup === 'function') state.mountedCleanup();
    states.delete(section);
  }

  return Object.freeze({
    ENABLED_SECTIONS,
    DEFAULT_PAGE_SIZE,
    PREFETCH_AHEAD,
    RENDER_RADIUS,
    MAX_CACHED_PAGES,
    isEnabled: (section) => ENABLED_SET.has(cleanSection(section)),
    configure,
    load,
    getView,
    getController,
    applySpacers,
    mount,
    invalidate,
    reset,
    rowIdentity
  });
});
