import { expect, test } from '@playwright/test';
import { externalRequests, mountOfficeShell } from './helpers/weekly-source-local-shell';

test.use({ storageState: { cookies: [], origins: [] } });

const candidateNotice = {
  id: '11111111-1111-4111-8111-111111111111',
  event_kind: 'WEEKLY_CANDIDATE_SOURCE_DISPUTED',
  issue_id: '21111111-1111-4111-8111-111111111111', issue_generation: 1,
  payload_json: { candidate_name: 'Jane Smith', client_name: "St Mary's NHS Trust", work_date: '2026-09-14', issue_summary: 'Shift missing or not yet authorised' },
  operational_state: 'OPEN', read_at_utc: null, created_at_utc: '2026-09-20T08:00:00Z'
};
const managerNotices = [
  {
    id: '31111111-1111-4111-8111-111111111111', event_kind: 'WEEKLY_MANAGER_SYSTEM_CONFIRMED',
    issue_id: '41111111-1111-4111-8111-111111111111', issue_generation: 1,
    payload_json: { candidate_name: 'Alex Reed', client_name: 'Royal Berkshire NHS Trust', work_date: '2026-09-15', issue_summary: 'System hours reviewed' },
    operational_state: 'RESOLVED', read_at_utc: null, created_at_utc: '2026-09-20T09:00:00Z'
  },
  {
    id: '51111111-1111-4111-8111-111111111111', event_kind: 'WEEKLY_MANAGER_SOURCE_CORRECTED',
    issue_id: '61111111-1111-4111-8111-111111111111', issue_generation: 1,
    payload_json: { candidate_name: 'Amara Patel', client_name: 'Whittington Health NHS Trust', work_date: '2026-09-16', issue_summary: 'System hours reviewed', manager_intended_start: '2026-09-16 09:00', manager_intended_end: '2026-09-16 18:00', manager_intended_break_minutes: 30 },
    operational_state: 'OPEN', read_at_utc: null, created_at_utc: '2026-09-20T10:00:00Z'
  }
];

async function openNotifications(page: import('@playwright/test').Page, notices: unknown[]) {
  await mountOfficeShell(page, { broker(pathname) {
    if (pathname.startsWith('/api/weekly-source/v1/notifications')) return { ok: true, notifications: notices };
    return undefined;
  } });
  await page.waitForFunction(() => !!document.querySelector('[data-ws-office-toggle]'));
  await page.getByRole('button', { name: /Weekly source queries/ }).click();
  await expect(page.locator('[data-ws-office-panel]')).toBeVisible();
}

test('Stage 11: candidate dispute is a concise real Office alert', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openNotifications(page, [candidateNotice]);
  await expect(page.getByText('Candidate reports incorrect system hours')).toBeVisible();
  await expect(page.getByText('Ask the manager to add and/or authorise this shift.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open query' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark read' })).toBeVisible();
  await page.locator('[data-ws-office-panel]').screenshot({ path: testInfo.outputPath('office-alert.png') });
  await page.getByRole('button', { name: 'Open query' }).click();
  await expect(page.getByRole('dialog', { name: 'Weekly source imports' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).CloudTMSWeeklySourceImportWorkspaceV1?._session?.activeTab)).toBe('queries');
  expect(externalRequests(page)).toEqual([]);
});

test('Stage 11: manager responses are clear and include corrected hours', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openNotifications(page, managerNotices);
  await expect(page.getByText('Manager says system hours are correct')).toBeVisible();
  await expect(page.getByText('Manager says the hours have been corrected')).toBeVisible();
  await expect(page.getByText(/Manager hours 16 Sep 2026 · 09:00-18:00 \(30 min break\)/)).toBeVisible();
  await expect(page.getByText('Waiting for a later source upload to show the corrected hours.')).toBeVisible();
  await page.locator('[data-ws-office-panel]').screenshot({ path: testInfo.outputPath('manager-response-alerts.png') });
  expect(externalRequests(page)).toEqual([]);
});

test('Stage 11: Timesheet Summary shows one secondary Weekly Source delay', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mountOfficeShell(page);
  await page.evaluate(() => {
    const host = document.createElement('section');
    host.id = 'weekly-source-summary-proof';
    host.style.cssText = 'width:940px;margin:90px auto;padding:22px;background:#0b152a;border:1px solid #334155;border-radius:12px';
    host.innerHTML = '<h2>Timesheets</h2><label style="display:block;margin:14px 0">Issues <select aria-label="Issues"><option>Any</option><option selected>Weekly source validation</option></select></label><table class="grid"><thead><tr><th>Candidate</th><th>Week ending</th><th>Processing Status</th></tr></thead><tbody><tr><td>Jane Smith</td><td>20 Sep 2026</td><td id="weekly-source-delay-cell"></td></tr></tbody></table>';
    document.body.appendChild(host);
    const reason = 'Candidate payment is waiting for final weekly source validation.';
    (window as any).paintTimesheetProcessingStatusCell(document.getElementById('weekly-source-delay-cell'), { issue_codes: [reason] }, 'Processed');
  });
  await expect(page.getByText('Processed', { exact: true })).toBeVisible();
  await expect(page.getByText('Delayed', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Issues')).toHaveValue('Weekly source validation');
  await expect(page.locator('#weekly-source-delay-cell')).toHaveAttribute('title', 'Candidate payment is waiting for final weekly source validation.');
  await page.locator('#weekly-source-summary-proof').screenshot({ path: testInfo.outputPath('timesheet-summary-status.png') });
  expect(externalRequests(page)).toEqual([]);
});
