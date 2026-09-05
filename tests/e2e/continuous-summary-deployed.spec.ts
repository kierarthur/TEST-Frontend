import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const testOrigin = 'https://testmode.arthur-rai.co.uk';
const storageState = process.env.E2E_STORAGE_STATE_PATH || 'tests/e2e/.auth/user.json';
const artifactDir = resolve(__dirname, '../../.codex-tmp/continuous-summary-deployed');

type SectionKey = 'clients' | 'candidates' | 'timesheets' | 'contracts' | 'invoices' | 'umbrellas' | 'outbox';

const sections: SectionKey[] = [
  'clients',
  'candidates',
  'timesheets',
  'contracts',
  'invoices',
  'umbrellas',
  'outbox'
];

test.use({ storageState });

async function openApplication(page: Page) {
  await page.goto(`${testOrigin}/?continuous-grid-proof=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
  await expect.poll(
    () => page.evaluate(() => !!(window as any).CloudTMSSummaryContinuousGrid),
    { timeout: 30_000 }
  ).toBe(true);
}

async function sectionButton(page: Page, section: SectionKey) {
  if (section === 'invoices') {
    return page.locator('#nav > div').filter({ hasText: 'Invoices' }).locator('button').first();
  }
  return page.locator(`[data-nav="${section}"], [data-section-key="${section}"]`).first();
}

async function openSection(page: Page, section: SectionKey) {
  const existingBody = page.locator(`.summary-body[data-summary-section="${section}"]`);
  if (await existingBody.isVisible().catch(() => false)) {
    await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
    await expect(existingBody).toHaveAttribute('data-continuous-summary', 'true');
    await expect(existingBody).toHaveAttribute('aria-rowcount', /^\d+$/);
    return existingBody;
  }
  const button = await sectionButton(page, section);
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click();
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
  await expect(page.locator('body')).toHaveAttribute('data-summary-proposal-section', section, { timeout: 30_000 });

  const body = page.locator(`.summary-body[data-summary-section="${section}"]`);
  await expect(body).toBeVisible({ timeout: 30_000 });
  await expect(body).toHaveAttribute('data-continuous-summary', 'true');
  await expect(body).toHaveAttribute('aria-rowcount', /^\d+$/);
  return body;
}

async function controllerView(page: Page, section: SectionKey) {
  return page.evaluate((sectionName) => {
    const grid = (window as any).CloudTMSSummaryContinuousGrid;
    const view = grid?.getView?.(sectionName);
    return view ? {
      pageSize: Number(view.pageSize),
      targetPage: Number(view.targetPage),
      cachedPages: Array.isArray(view.cachedPages) ? view.cachedPages.map(Number) : [],
      loadedPages: Array.isArray(view.loadedPages) ? view.loadedPages.map(Number) : [],
      startIndex: Number(view.startIndex),
      endIndex: Number(view.endIndex),
      total: view.total == null ? null : Number(view.total)
    } : null;
  }, section);
}

async function startOverlayObservation(page: Page) {
  await page.evaluate(() => {
    const root = window as any;
    root.__continuousGridOverlayEvents = [];
    root.__continuousGridOverlayObserver?.disconnect?.();
    const overlay = document.getElementById('globalLoadingOverlay');
    if (!overlay) return;
    const record = () => {
      if (overlay.getAttribute('data-show') === '1') {
        root.__continuousGridOverlayEvents.push(performance.now());
      }
    };
    const observer = new MutationObserver(record);
    observer.observe(overlay, { attributes: true, attributeFilter: ['data-show', 'style', 'class'] });
    root.__continuousGridOverlayObserver = observer;
  });
}

async function overlayEventCount(page: Page) {
  return page.evaluate(() => ((window as any).__continuousGridOverlayEvents || []).length);
}

function summaryRows(body: ReturnType<Page['locator']>) {
  return body.locator(
    'tbody tr:not(.ctms-continuous-spacer)[data-id], tbody tr:not(.ctms-continuous-spacer)[data-outbox-key]'
  );
}

async function waitForSummaryTotal(page: Page, section: SectionKey) {
  await expect.poll(async () => {
    const body = page.locator(`.summary-body[data-summary-section="${section}"]`);
    const domTotal = Number(await body.getAttribute('aria-rowcount'));
    const view = await controllerView(page, section);
    return Number.isFinite(domTotal) && view?.total === domTotal ? domTotal : -1;
  }, { timeout: 60_000 }).toBeGreaterThanOrEqual(0);
  return Number(await page.locator(`.summary-body[data-summary-section="${section}"]`).getAttribute('aria-rowcount'));
}

async function selectionProof(page: Page, section: SectionKey) {
  return page.evaluate((sectionName) => {
    const snapshot = typeof (window as any).getSelectionSnapshot === 'function'
      ? (window as any).getSelectionSnapshot(sectionName)
      : null;
    return {
      mode: String(snapshot?.mode || ''),
      membershipTotal: Number(snapshot?.membership_total ?? snapshot?.membership_fallback_total ?? -1),
      authoritative: snapshot?.membership_authoritative === true,
      excludedCount: Array.isArray(snapshot?.excluded_ids) ? snapshot.excluded_ids.length : 0
    };
  }, section);
}

async function firstSearchTerm(body: ReturnType<Page['locator']>, section: SectionKey) {
  const row = summaryRows(body).first();
  if (section === 'outbox') {
    return String(await row.locator('td').nth(2).locator('[title]').first().getAttribute('title') || '').trim();
  }
  const keys: Record<Exclude<SectionKey, 'outbox'>, string[]> = {
    candidates: ['last_name', 'first_name', 'tms_ref', 'email'],
    clients: ['name', 'primary_invoice_email'],
    timesheets: ['candidate_name', 'client_name', 'booking_id', 'occupant_key_norm'],
    contracts: ['candidate_display', 'client_name', 'role'],
    invoices: ['invoice_no', 'client_name'],
    umbrellas: ['name']
  };
  return row.evaluate((element, candidateKeys) => {
    for (const key of candidateKeys) {
      const cell = element.querySelector(`td[data-col-key="${CSS.escape(key)}"]`);
      const value = String(cell?.textContent || '').replace(/\s+/g, ' ').trim();
      if (value && value !== '—') return value;
    }
    return '';
  }, keys[section]);
}

async function newPhoneContext(
  browser: Browser,
  viewport: { width: number; height: number } = { width: 390, height: 844 }
): Promise<BrowserContext> {
  return browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    storageState
  });
}

test('all seven deployed Office summaries are bounded continuous grids', async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  const badResponses: string[] = [];
  const requestStarts = new WeakMap<object, number>();
  const boundedListRequests: Array<{ path: string; milliseconds: number; status: number }> = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requestStarts.set(request, Date.now()));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname.endsWith('workers.dev') && response.status() >= 500) {
      badResponses.push(`${response.status()} ${url.pathname}`);
    }
    const pageSize = url.searchParams.get('page_size');
    const limit = url.searchParams.get('limit');
    if (url.hostname.endsWith('workers.dev') && (pageSize === '50' || limit === '50')) {
      const started = requestStarts.get(response.request()) || Date.now();
      boundedListRequests.push({
        path: url.pathname,
        milliseconds: Math.max(0, Date.now() - started),
        status: response.status()
      });
    }
  });

  await openApplication(page);
  const results: Array<{ section: SectionKey; total: number; renderedRows: number; firstPageMs: number | null }> = [];

  for (const section of sections) {
    const beforeRequestCount = boundedListRequests.length;
    const started = Date.now();
    const body = await openSection(page, section);
    const firstPageMs = Date.now() - started;
    const view = await controllerView(page, section);
    expect(view).not.toBeNull();
    expect(view!.pageSize).toBe(50);
    expect(view!.targetPage).toBeGreaterThanOrEqual(1);
    expect(view!.total).not.toBeNull();

    await expect.poll(async () => {
      const liveView = await controllerView(page, section);
      return `${await body.getAttribute('aria-rowcount')}:${liveView?.total}`;
    }, { timeout: 15_000 }).toMatch(/^(\d+):\1$/);
    const total = Number(await body.getAttribute('aria-rowcount'));
    const dataRows = body.locator('tbody tr:not(.ctms-continuous-spacer)[data-id], tbody tr:not(.ctms-continuous-spacer)[data-outbox-key]');
    const renderedRows = await dataRows.count();
    expect(renderedRows).toBeLessThanOrEqual(150);
    if (total > 0) expect(renderedRows).toBeGreaterThan(0);

    const footer = page.locator('#content > .pager.ctms-continuous-status').last();
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(new RegExp(`of ${total}(?:\\D|$)`));
    await expect(footer).not.toContainText('loading ahead', { ignoreCase: true });
    await expect(footer.locator('button')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^jump to$/i })).toHaveCount(0);
    await expect(page.locator('.ctms-continuous-alpha-rail')).toBeHidden();

    if (section === 'outbox' && renderedRows > 0) {
      const keys = await dataRows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-outbox-key') || ''));
      expect(keys.every((key) => /^[A-Z]+::.+/.test(key))).toBe(true);
    }

    const firstBoundedRequest = boundedListRequests.slice(beforeRequestCount)[0] || null;
    results.push({
      section,
      total,
      renderedRows,
      firstPageMs: firstBoundedRequest ? firstBoundedRequest.milliseconds : firstPageMs
    });
  }

  expect(pageErrors).toEqual([]);
  expect(badResponses).toEqual([]);
  expect(boundedListRequests.length).toBeGreaterThanOrEqual(sections.length);
  console.log(`CONTINUOUS_SUMMARY_DEPLOYED_RESULTS=${JSON.stringify(results)}`);
});

test('every deployed summary preserves search, sorting, scrolling, keyboard, selection and read-only opening', async ({ page }) => {
  test.setTimeout(900_000);
  const requestedSections = String(process.env.CONTINUOUS_SUMMARY_SECTIONS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is SectionKey => sections.includes(value as SectionKey));
  const matrixSections = requestedSections.length ? requestedSections : sections;
  let pageErrorCount = 0;
  const consoleErrors: string[] = [];
  const badResponses: string[] = [];
  const httpErrors: string[] = [];
  page.on('pageerror', () => { pageErrorCount += 1; });
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400) {
      httpErrors.push(`${response.status()} ${url.hostname}${url.pathname}`);
    }
    if (url.hostname.endsWith('workers.dev') && response.status() >= 500) {
      badResponses.push(`${response.status()} ${url.pathname}`);
    }
  });

  await openApplication(page);
  pageErrorCount = 0;
  consoleErrors.length = 0;
  httpErrors.length = 0;
  badResponses.length = 0;

  for (const section of matrixSections) {
    await test.step(section, async () => {
      let body = await openSection(page, section);
      const total = await waitForSummaryTotal(page, section);
      let rows = summaryRows(body);
      if (total > 0) await expect(rows.first()).toBeVisible();

      const geometry = await body.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflowX: style.overflowX,
          overflowY: style.overflowY
        };
      });
      expect(geometry.overflowY).toMatch(/auto|scroll/);
      expect(geometry.overflowX).toMatch(/auto|scroll/);
      if (total > 50) expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
      if (geometry.scrollHeight > geometry.clientHeight) {
        await body.evaluate((element) => { element.scrollTop = Math.min(320, element.scrollHeight - element.clientHeight); });
        await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        await body.evaluate((element) => { element.scrollTop = 0; });
      }
      if (geometry.scrollWidth > geometry.clientWidth) {
        await body.evaluate((element) => { element.scrollLeft = element.scrollWidth - element.clientWidth; });
        await expect.poll(() => body.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
        await body.evaluate((element) => { element.scrollLeft = 0; });
      }

      rows = summaryRows(body);
      if (await rows.count() > 1) {
        const firstId = String(await rows.first().getAttribute('data-id') || await rows.first().getAttribute('data-outbox-key') || '');
        await rows.first().click({ position: { x: 60, y: 12 } });
        await body.focus();
        await page.keyboard.press('ArrowDown');
        await expect.poll(async () => {
          const active = body.locator('tbody tr.active-summary-row').first();
          return String(await active.getAttribute('data-id') || await active.getAttribute('data-outbox-key') || '');
        }, { timeout: 30_000 }).not.toBe(firstId);
        await page.keyboard.press('ArrowUp');
        await expect.poll(async () => {
          const active = body.locator('tbody tr.active-summary-row').first();
          return String(await active.getAttribute('data-id') || await active.getAttribute('data-outbox-key') || '');
        }, { timeout: 30_000 }).toBe(firstId);
      }

      const sortableHeader = section === 'outbox'
        ? body.locator('thead th[data-sort-key]').first()
        : body.locator('thead th[data-col-key]:not([data-col-key="attachment_state"])').first();
      await expect(sortableHeader).toBeVisible();
      const sortKey = String(await sortableHeader.getAttribute(section === 'outbox' ? 'data-sort-key' : 'data-col-key') || '');
      const beforeSort = await page.evaluate((sectionName) => ({
        key: String((window as any).__listState?.[sectionName]?.sort?.key || ''),
        dir: String((window as any).__listState?.[sectionName]?.sort?.dir || 'asc')
      }), section);
      await startOverlayObservation(page);
      await sortableHeader.click({ position: { x: 12, y: 12 } });
      await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
      await expect.poll(() => page.evaluate((sectionName) => String((window as any).__listState?.[sectionName]?.sort?.key || ''), section), { timeout: 60_000 })
        .toBe(sortKey);
      const afterSort = await page.evaluate((sectionName) => ({
        key: String((window as any).__listState?.[sectionName]?.sort?.key || ''),
        dir: String((window as any).__listState?.[sectionName]?.sort?.dir || 'asc')
      }), section);
      expect(afterSort.key).toBe(sortKey);
      if (beforeSort.key === sortKey) expect(afterSort.dir).not.toBe(beforeSort.dir);
      expect(await overlayEventCount(page)).toBeGreaterThan(0);

      body = page.locator(`.summary-body[data-summary-section="${section}"]`);
      const selectAll = body.locator('thead input[type="checkbox"]').first();
      await expect(selectAll).toBeVisible();
      await selectAll.check();
      await expect.poll(async () => (await selectionProof(page, section)).mode, { timeout: 60_000 }).toBe('all_filtered');
      await expect.poll(async () => (await selectionProof(page, section)).membershipTotal, { timeout: 60_000 }).toBe(await waitForSummaryTotal(page, section));
      const visibleChecks = section === 'outbox'
        ? body.locator('tbody tr:not(.ctms-continuous-spacer) input.outbox-row-select[type="checkbox"]')
        : body.locator('tbody tr:not(.ctms-continuous-spacer) input.row-select[type="checkbox"]');
      if (await visibleChecks.count()) {
        expect(await visibleChecks.evaluateAll((inputs) => inputs.every((input) => (input as HTMLInputElement).checked))).toBe(true);
        await visibleChecks.first().uncheck();
        await expect.poll(async () => (await selectionProof(page, section)).excludedCount, { timeout: 30_000 }).toBe(1);
        expect((await selectionProof(page, section)).mode).toBe('all_filtered');
      }
      const clearSelection = page.locator('#content button').filter({ hasText: /^Clear selection$/i }).last();
      await expect(clearSelection).toBeVisible();
      await clearSelection.click();
      await expect.poll(async () => (await selectionProof(page, section)).mode).toBe('explicit');

      body = page.locator(`.summary-body[data-summary-section="${section}"]`);
      const term = await firstSearchTerm(body, section);
      expect(term.length).toBeGreaterThan(0);
      const search = page.locator('#quickSearch');
      await search.fill(term);
      await search.press('Enter');
      await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
      await expect.poll(() => page.evaluate((sectionName) => String((window as any).__listState?.[sectionName]?.filters?.q || ''), section), { timeout: 60_000 })
        .toBe(term);
      body = page.locator(`.summary-body[data-summary-section="${section}"]`);
      await waitForSummaryTotal(page, section);
      await expect(summaryRows(body).first()).toBeVisible({ timeout: 60_000 });
      await search.fill('');
      await search.press('Enter');
      await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
      await expect.poll(() => page.evaluate((sectionName) => String((window as any).__listState?.[sectionName]?.filters?.q || ''), section), { timeout: 60_000 })
        .toBe('');

      body = page.locator(`.summary-body[data-summary-section="${section}"]`);
      rows = summaryRows(body);
      if (await rows.count()) {
        const openCell = rows.first().locator('td:not(:first-child)').first();
        await openCell.dblclick();
        await expect(page.locator('#modalBack')).toBeVisible({ timeout: 60_000 });
        await expect(page.locator('#modal')).toHaveAttribute('role', 'dialog');
        await page.locator('#btnCloseModal').click();
        await expect(page.locator('#modalBack')).toBeHidden({ timeout: 30_000 });
      }
    });
  }

  expect(pageErrorCount).toBe(0);
  const allowedReadiness401 = /^401 test-cloudtms-backend\.kier-88a\.workers\.dev\/api\/(?:me|candidate-app\/office-capabilities|invoice-async\/capabilities)$/;
  const readiness401s = httpErrors.filter((entry) => allowedReadiness401.test(entry));
  const unexpectedHttpErrors = httpErrors.filter((entry) => !allowedReadiness401.test(entry));
  const resource401Errors = consoleErrors.filter((entry) => /^Failed to load resource: the server responded with a status of 401/.test(entry));
  const unexpectedConsoleErrors = consoleErrors.filter((entry) => !/^Failed to load resource: the server responded with a status of 401/.test(entry));
  expect(unexpectedHttpErrors).toEqual([]);
  expect(unexpectedConsoleErrors).toEqual([]);
  expect(resource401Errors.length).toBeLessThanOrEqual(readiness401s.length);
  expect(badResponses).toEqual([]);
});

test('scroll prefetch stays silent while sort, End, Home and query-wide selection remain functional', async ({ page }) => {
  test.setTimeout(180_000);
  await openApplication(page);
  let body = await openSection(page, 'timesheets');
  let view = await controllerView(page, 'timesheets');

  if ((view?.total || 0) > 50) {
    await startOverlayObservation(page);
    await body.evaluate((element) => {
      const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.min(maximum, Math.max(2400, element.clientHeight * 2));
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect.poll(async () => (await controllerView(page, 'timesheets'))?.targetPage || 1, { timeout: 60_000 })
      .toBeGreaterThan(1);
    await expect(page.locator('#globalLoadingOverlay')).toBeHidden();
    expect(await overlayEventCount(page)).toBe(0);
  }

  body = page.locator('.summary-body[data-summary-section="timesheets"]');
  const sortableHeader = body.locator('thead th[data-col-key]').first();
  await expect(sortableHeader).toBeVisible();
  await startOverlayObservation(page);
  await sortableHeader.click();
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
  expect(await overlayEventCount(page)).toBeGreaterThan(0);

  body = page.locator('.summary-body[data-summary-section="timesheets"]');
  view = await controllerView(page, 'timesheets');
  if ((view?.total || 0) > 50) {
    await startOverlayObservation(page);
    await body.focus();
    await page.keyboard.press('End');
    await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
    const expectedLastPage = Math.ceil(Number(view!.total) / 50);
    await expect.poll(async () => (await controllerView(page, 'timesheets'))?.targetPage || 0, { timeout: 60_000 })
      .toBe(expectedLastPage);
    expect(await overlayEventCount(page)).toBeGreaterThan(0);
    await page.waitForTimeout(800);

    body = page.locator('.summary-body[data-summary-section="timesheets"]');
    await body.focus();
    await expect(body).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
    await expect.poll(async () => (await controllerView(page, 'timesheets'))?.targetPage || 0, { timeout: 60_000 })
      .toBe(1);
  }

  body = page.locator('.summary-body[data-summary-section="timesheets"]');
  const selectAll = body.locator('thead input[type="checkbox"]').first();
  await expect(selectAll).toBeVisible();
  await selectAll.check();
  await expect(selectAll).toBeChecked();
  const visibleChecks = body.locator('tbody tr:not(.ctms-continuous-spacer) input.row-select[type="checkbox"]');
  if (await visibleChecks.count()) {
    expect(await visibleChecks.evaluateAll((inputs) => inputs.every((input) => (input as HTMLInputElement).checked))).toBe(true);
  }
  const selectionMode = await page.evaluate(() => {
    const snapshot = typeof (window as any).getSelectionSnapshot === 'function'
      ? (window as any).getSelectionSnapshot('timesheets')
      : null;
    return String(snapshot?.mode || snapshot?.selection_mode || '').toLowerCase();
  });
  expect(selectionMode).toBe('all_filtered');
  await selectAll.uncheck();
  await expect(selectAll).not.toBeChecked();

  await startOverlayObservation(page);
  await page.waitForTimeout(47_000);
  await expect(page.locator('.summary-body[data-summary-section="timesheets"]')).toBeVisible();
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden();
  expect(await overlayEventCount(page)).toBe(0);
});

test('desktop scrollbar drag keeps its scroll host when the pointer leaves the track', async ({ page }) => {
  test.setTimeout(120_000);
  await openApplication(page);
  const body = await openSection(page, 'candidates');
  await expect.poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(200);
  const bounds = await body.boundingBox();
  expect(bounds).not.toBeNull();
  await body.evaluate((element) => {
    element.scrollTop = 0;
    (window as any).__scrollbarDragHost = element;
  });

  const trackX = bounds!.x + bounds!.width - 12;
  const thumbY = bounds!.y + 80;
  await page.mouse.move(trackX, thumbY);
  await page.mouse.down();
  await body.evaluate((element) => {
    element.scrollTop = 900;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.mouse.move(bounds!.x - 40, thumbY + 100, { steps: 10 });
  await page.waitForTimeout(220);

  expect(await page.evaluate(() => (window as any).__scrollbarDragHost === document.querySelector('.summary-body[data-summary-section="candidates"]'))).toBe(true);
  const firstScrollTop = await body.evaluate((element) => element.scrollTop);
  expect(firstScrollTop).toBeGreaterThan(0);

  await body.evaluate((element) => {
    element.scrollTop += 900;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.mouse.move(bounds!.x - 70, thumbY + 220, { steps: 8 });
  const secondScrollTop = await body.evaluate((element) => element.scrollTop);
  expect(secondScrollTop).toBeGreaterThan(firstScrollTop);
  await page.mouse.up();
  await expect(page.locator('#globalLoadingOverlay')).toBeHidden();
});

test('phone uses a compact A-Z edge rail while desktop-only jump UI remains absent', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await newPhoneContext(browser);
  const page = await context.newPage();
  const networkFailures: string[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname.endsWith('workers.dev') && response.status() >= 400) {
      networkFailures.push(`${response.status()} ${url.pathname}`);
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.hostname.endsWith('workers.dev')) networkFailures.push(`FAILED ${url.pathname}`);
  });
  try {
    await openApplication(page);
    const body = await openSection(page, 'candidates').catch((error) => {
      throw new Error(`${error instanceof Error ? error.message : String(error)}; network=${networkFailures.join(',') || 'none'}`);
    });
    const rail = page.locator('.ctms-continuous-alpha-rail');
    await expect(rail).toBeVisible();
    await expect(rail.locator('.ctms-continuous-alpha-letter')).toHaveCount(26);
    await expect(rail.locator('input, select, textarea')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^jump to$/i })).toHaveCount(0);

    const bounds = await rail.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThan(350);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.height).toBeLessThan(820);
    const letterGeometry = await rail.locator('.ctms-continuous-alpha-letter').evaluateAll((letters) =>
      letters.map((letter) => {
        const rect = letter.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      })
    );
    expect(letterGeometry[0].top).toBeGreaterThanOrEqual(bounds!.y);
    expect(letterGeometry.at(-1)!.bottom).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
    expect(Math.max(...letterGeometry.map((letter) => letter.height))).toBeLessThan(25);
    expect(Math.min(...letterGeometry.map((letter) => letter.height))).toBeGreaterThan(8);

    const availableLetter = await page.evaluate(async () => {
      const resolveTarget = (window as any).resolveSummaryTypeAheadTarget;
      if (typeof resolveTarget !== 'function') return '';
      for (const letter of ['K', 'A']) {
        const target = await resolveTarget('candidates', letter, 'last_name', 'asc');
        if (target?.row_id) return letter;
      }
      return '';
    });
    expect(availableLetter).toMatch(/^[A-Z]$/);
    await rail.locator(`[data-letter="${availableLetter}"]`).click();
    await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
    await expect(body).toBeVisible();
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName || '');
    expect(focusedTag).not.toBe('INPUT');
    expect(focusedTag).not.toBe('TEXTAREA');

    mkdirSync(artifactDir, { recursive: true });
    await page.locator('#content').screenshot({ path: resolve(artifactDir, 'candidates-phone.png') });

    await openSection(page, 'invoices');
    await expect(page.locator('.ctms-continuous-alpha-rail')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).CloudTMSSummaryContinuousGrid.isEnabled('banking'))).toBe(false);
  } finally {
    await context.close();
  }

  const unfoldedContext = await newPhoneContext(browser, { width: 768, height: 900 });
  const unfoldedPage = await unfoldedContext.newPage();
  try {
    await openApplication(unfoldedPage);
    await openSection(unfoldedPage, 'candidates');
    const unfoldedRail = unfoldedPage.locator('.ctms-continuous-alpha-rail');
    await expect(unfoldedRail).toBeVisible();
    await expect(unfoldedRail.locator('.ctms-continuous-alpha-letter')).toHaveCount(26);
    const bounds = await unfoldedRail.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThan(728);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(768);
    await unfoldedRail.locator('[data-letter="K"]').click();
    await expect(unfoldedPage.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
    mkdirSync(artifactDir, { recursive: true });
    await unfoldedPage.locator('#content').screenshot({ path: resolve(artifactDir, 'candidates-fold-unfolded.png') });
  } finally {
    await unfoldedContext.close();
  }
});

test('phone selection controls stay visually stable through a rapid flick', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await newPhoneContext(browser);
  const page = await context.newPage();
  try {
    await openApplication(page);
    await openSection(page, 'candidates');
    await page.evaluate(() => {
      const samples: any[] = [];
      const started = performance.now();
      const sample = () => {
        const body = document.querySelector('.summary-body[data-summary-section="candidates"]');
        const checks = Array.from(body?.querySelectorAll('tbody input.row-select') || []);
        const first = checks[0] as HTMLElement | undefined;
        const style = first ? getComputedStyle(first) : null;
        samples.push({
          bodyCount: document.querySelectorAll('.summary-body[data-summary-section="candidates"]').length,
          rowCount: body?.querySelectorAll('tbody tr[data-id]').length || 0,
          checkCount: checks.length,
          opacity: style?.opacity || '',
          width: style?.width || '',
          height: style?.height || '',
          minHeight: style?.minHeight || '',
          borderRadius: style?.borderRadius || '',
          visibility: style?.visibility || '',
          scrollTop: (body as HTMLElement | null)?.scrollTop || 0
        });
        if (performance.now() - started < 2400) requestAnimationFrame(sample);
        else (window as any).__phoneFlickSamples = samples;
      };
      requestAnimationFrame(sample);
    });
    const session = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y?: number) => session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: 45, y: Number(y), radiusX: 8, radiusY: 8, force: 0.8 }]
    });
    await touch('touchStart', 690);
    for (const y of [620, 540, 455, 365, 270, 175]) {
      await touch('touchMove', y);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd');
    await page.waitForTimeout(2600);
    const samples = await page.evaluate(() => (window as any).__phoneFlickSamples || []);
    expect(samples.length).toBeGreaterThan(30);
    expect(Math.max(...samples.map((sample: any) => Number(sample.scrollTop || 0)))).toBeGreaterThan(0);
    expect(Array.from(new Set(samples.map((sample: any) => sample.bodyCount)))).toEqual([1]);
    expect(samples.every((sample: any) => sample.rowCount >= 50 && sample.checkCount === sample.rowCount)).toBe(true);
    expect(Array.from(new Set(samples.map((sample: any) => sample.width)))).toEqual(['18px']);
    expect(Array.from(new Set(samples.map((sample: any) => sample.height)))).toEqual(['18px']);
    expect(Array.from(new Set(samples.map((sample: any) => sample.minHeight)))).toEqual(['18px']);
    expect(Array.from(new Set(samples.map((sample: any) => sample.borderRadius)))).toEqual(['5px']);
    expect(Array.from(new Set(samples.map((sample: any) => sample.opacity)))).toEqual(['1']);
    expect(Array.from(new Set(samples.map((sample: any) => sample.visibility)))).toEqual(['visible']);
  } finally {
    await context.close();
  }
});
