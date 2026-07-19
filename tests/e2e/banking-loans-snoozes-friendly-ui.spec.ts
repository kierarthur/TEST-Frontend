import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 1000 },
  { label: 'mobile', width: 412, height: 915 }
];

for (const viewport of VIEWPORTS) {
  test(`keeps the Loans / Snoozes modal user-friendly on ${viewport.label}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const localMainPath = resolve(__dirname, '../../js/main.js');
    const localMainSha256 = createHash('sha256').update(readFileSync(localMainPath)).digest('hex');
    const productionBackendRequests: string[] = [];
    const financeMutationRequests: string[] = [];
    let interceptedMainUrl = '';
    let servedMainSha256 = '';
    let mockedLoansRequestCount = 0;

    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('https://cloudtms.kier-88a.workers.dev/')) {
        productionBackendRequests.push(url);
      }
      if (
        url.startsWith('https://test-cloudtms-backend.kier-88a.workers.dev/api/banking/finance/')
        && !['GET', 'HEAD'].includes(request.method())
      ) {
        financeMutationRequests.push(`${request.method()} ${new URL(url).pathname}`);
      }
    });

    await page.route('**/js/main.js', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'testmode.arthur-rai.co.uk' || url.pathname !== '/js/main.js') {
        await route.continue();
        return;
      }
      interceptedMainUrl = url.href;
      servedMainSha256 = localMainSha256;
      await route.fulfill({
        path: localMainPath,
        contentType: 'application/javascript; charset=utf-8',
        headers: {
          'cache-control': 'no-store',
          'x-codex-local-asset': 'banking-loans-snoozes-friendly-ui'
        }
      });
    });

    await page.route('**/api/banking/finance/loans-snoozes**', async (route) => {
      mockedLoansRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          summary: {},
          finance_cases: [
            {
              finance_case_id: 'codex-friendly-ui-case',
              case_type: 'OVERPAYMENT',
              admin_label: 'Overpayment',
              candidate_display_name: 'Test Candidate',
              client_name: 'Test Client',
              status: 'ACTIVE',
              blocked_state: '',
              blocked_reason: '',
              original_amount: 125,
              outstanding_amount: 75,
              weekly_due: 25,
              start_week_start: '2026-07-13',
              next_due_week_start: '2026-07-20',
              open_taxable_count: 5,
              open_reimbursement_count: 0,
              unresolved_taxable_count: 0,
              stale_count: 0,
              is_mixed_case: false,
              component_resolution_summary_json: {
                stale_count: 0,
                is_mixed_case: false,
                open_taxable_count: 5,
                open_reimbursement_count: 0,
                unresolved_taxable_count: 0
              },
              adjustment_comment: '',
              snooze: null,
              action_flags: {}
            }
          ],
          timesheet_snoozes: []
        })
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('#globalLoadingOverlay')).toBeHidden({ timeout: 60_000 });
    expect(new URL(page.url()).hostname).toBe('testmode.arthur-rai.co.uk');
    expect(interceptedMainUrl).toBe('https://testmode.arthur-rai.co.uk/js/main.js');
    expect(servedMainSha256).toBe(localMainSha256);
    const browserMainSha256 = await page.evaluate(async () => {
      const response = await fetch('/js/main.js', { cache: 'no-store' });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
    });
    expect(browserMainSha256).toBe(localMainSha256);

    await page.getByRole('button', { name: 'Banking', exact: true }).click();
    const bankingModal = page.locator('#modal');
    await expect(bankingModal).toBeVisible({ timeout: 60_000 });
    await bankingModal.getByRole('button', { name: 'Loans / Snoozes', exact: true }).click();

    const financeCasesTable = bankingModal
      .locator('table.grid')
      .filter({ hasText: 'Recovery / Snooze / Comment' });
    await expect(financeCasesTable).toHaveCount(1);
    await expect(financeCasesTable).toBeVisible({ timeout: 60_000 });
    await expect(financeCasesTable.locator('tbody tr')).toHaveCount(1);
    await expect(financeCasesTable).toContainText('Recovery: 5 taxable recovery items');
    await expect(financeCasesTable).toContainText('Comment: No comment');
    await expect(financeCasesTable).toContainText('Active');

    const visibleModalText = await bankingModal.innerText();
    expect(visibleModalText).not.toMatch(/\b(?:stale_count|is_mixed_case|open_taxable_count|open_reimbursement_count|unresolved_taxable_count)\b/i);
    expect(visibleModalText).not.toContain('No component summary');
    expect(visibleModalText).not.toContain('Open taxable:');
    expect(visibleModalText).not.toContain('Source fingerprint:');
    expect(visibleModalText).not.toContain('Stable key:');
    expect(visibleModalText).not.toContain('Exact source:');
    expect(visibleModalText).not.toMatch(/\b(?:NOT_SNOOZED|INDEFINITE_SNOOZE|DATED_SNOOZE|SOURCE_REPLACED|SOURCE_CHANGED|SOURCE_UNAVAILABLE)\b/);

    expect(productionBackendRequests).toEqual([]);
    expect(financeMutationRequests).toEqual([]);
    expect(mockedLoansRequestCount).toBeGreaterThan(0);
  });
}
