import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

test('opens a repositioned timesheet breakdown without flashing the Ready list back to the top', async ({ page }) => {
  test.setTimeout(120_000);

  const localMainPath = resolve(__dirname, '../../js/main.js');
  let interceptedMainUrl = '';
  const unexpectedProductionBackendRequests: string[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('https://cloudtms.kier-88a.workers.dev/')) unexpectedProductionBackendRequests.push(url);
  });

  await page.route('**/js/main.js', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'testmode.arthur-rai.co.uk' || url.pathname !== '/js/main.js') {
      await route.continue();
      return;
    }
    interceptedMainUrl = url.href;
    await route.fulfill({
      path: localMainPath,
      contentType: 'application/javascript; charset=utf-8',
      headers: {
        'cache-control': 'no-store',
        'x-codex-local-asset': 'banking-pay-timesheet-breakdown-scroll'
      }
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  expect(new URL(page.url()).hostname).toBe('testmode.arthur-rai.co.uk');
  expect(interceptedMainUrl).toBe('https://testmode.arthur-rai.co.uk/js/main.js');

  await page.getByRole('button', { name: 'Banking' }).click();
  await page.getByRole('button', { name: 'Pay', exact: true }).click();

  const readyHost = page.locator('#bankingPayReadyScrollHost');
  const targetRow = readyHost
    .locator('tr[data-timesheet-group-key][data-candidate-id]')
    .filter({ hasText: 'CCR-00835' })
    .filter({ hasText: 'Kier Arthur' })
    .filter({ hasText: 'Arthur Rai Medical Services' })
    .filter({ hasText: '08/02/2026' });
  const toggle = targetRow.getByRole('button', { name: /Show timesheet breakdown/ });

  await expect(targetRow).toBeVisible({ timeout: 60_000 });
  await expect(toggle).toBeVisible();

  await targetRow.evaluate((row) => {
    const host = row.closest('#bankingPayReadyScrollHost');
    if (!(host instanceof HTMLElement)) throw new Error('Ready scroll host not found');
    const hostRect = host.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    host.scrollTop += (rowRect.top - hostRect.top) - 75;
  });

  const initial = await targetRow.evaluate((row) => {
    const host = row.closest('#bankingPayReadyScrollHost');
    if (!(host instanceof HTMLElement)) throw new Error('Ready scroll host not found');
    return {
      scrollTop: Math.round(host.scrollTop),
      rowTop: Math.round(row.getBoundingClientRect().top)
    };
  });
  expect(initial.scrollTop).toBeGreaterThan(0);

  const tracePromise = page.evaluate(async () => {
    const findRow = () => Array.from(document.querySelectorAll<HTMLElement>('#bankingPayReadyScrollHost tr[data-timesheet-group-key][data-candidate-id]'))
      .find((row) => {
        const text = String(row.innerText || '');
        return text.includes('CCR-00835') && text.includes('Kier Arthur') && text.includes('Arthur Rai Medical Services') && text.includes('08/02/2026');
      });
    const samples: Array<{ scrollTop: number | null; rowTop: number | null; expanded: string | null }> = [];
    return await new Promise<typeof samples>((resolveTrace) => {
      const sample = () => {
        const host = document.querySelector<HTMLElement>('#bankingPayReadyScrollHost');
        const row = findRow();
        const button = row?.querySelector<HTMLElement>('[data-action="banking:pay:toggleTimesheetBreakdown"]');
        samples.push({
          scrollTop: host ? Math.round(host.scrollTop) : null,
          rowTop: row ? Math.round(row.getBoundingClientRect().top) : null,
          expanded: button?.getAttribute('aria-expanded') || null
        });
        if (samples.length >= 160) {
          resolveTrace(samples);
          return;
        }
        setTimeout(sample, 5);
      };
      setTimeout(sample, 0);
    });
  });

  await toggle.click();
  const trace = await tracePromise;
  await expect(targetRow.getByRole('button', { name: /Hide timesheet breakdown/ })).toBeVisible();

  const expandedSamples = trace.filter((sample) => sample.expanded === 'true');
  expect(expandedSamples.length).toBeGreaterThan(0);
  expect(expandedSamples.every((sample) => sample.scrollTop === initial.scrollTop)).toBe(true);
  expect(expandedSamples.every((sample) => sample.rowTop === initial.rowTop)).toBe(true);
  expect(unexpectedProductionBackendRequests).toEqual([]);
});
