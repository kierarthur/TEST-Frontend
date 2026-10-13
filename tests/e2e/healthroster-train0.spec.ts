import { expect, test } from '@playwright/test';
import { externalRequests, mountOfficeShell } from './helpers/weekly-source-local-shell';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

test('the saved Office shell binds keyed tabs and keeps unavailable correction commands inert', async ({ page }) => {
  let mutations = 0;
  const model = { profile: { id: 'HEALTHROSTER_TIMESHEET_ACTUAL_LAYOUT_A_V1' },
    queries: { rows: [{ group_key: 'synthetic', candidate: 'Synthetic worker', actions: [
      { label: 'Correct this Timesheet', enabled: true, command: 'UNINSTALLED_COMMAND' },
      { label: 'Send reminder', enabled: true, command: 'UNINSTALLED_COMMAND' }
    ] }] }, imports: { rows: [] }, finalise: {}, history: { rows: [] } };
  await mountOfficeShell(page, { broker(path, method) {
    if (path.startsWith('/api/weekly-source/v1/workspace')) return model;
    if (path.startsWith('/api/weekly-source/v1/commands') && method !== 'GET') mutations++;
    return undefined;
  } });
  await page.waitForFunction(() => typeof (window as any).CloudTMSWeeklySourceImportWorkspaceV1?.open === 'function');
  await page.evaluate(async () => { await (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open('queries'); });
  await expect(page.locator('.ws-workspace[data-ws-tab="queries"]')).toBeVisible();
  expect(await page.locator('#modalTabs > button').evaluateAll(buttons => buttons.map(button => (button as HTMLElement).dataset.tabKey)))
    .toEqual(['imports', 'queries', 'finalise', 'history']);
  for (const width of [1700, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole('button', { name: 'Correct this Timesheet', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send reminder', exact: true })).toBeDisabled();
    await expect(page.locator('.ws-context-bar')).toContainText('To check');
  }
  // A synthetic event cannot bypass the same disabled state.
  await page.locator('[data-ws-action="Correct this Timesheet"]').dispatchEvent('click');
  await expect(page.locator('.ws-workspace[data-ws-tab="queries"]')).toBeVisible();
  await page.locator('#modalTabs > button[data-tab-key="history"]').click();
  await expect(page.locator('.ws-workspace[data-ws-tab="history"]')).toBeVisible();
  await expect(page.locator('#modalTabs > button[data-tab-key="history"]')).toHaveAttribute('aria-selected', 'true');
  expect(mutations).toBe(0);
  expect(externalRequests(page)).toEqual([]);
});

test('permission discovery precedes a forbidden deep link and opens the reduced pay Queries view', async ({ page }) => {
  const requests: string[] = [];
  const permissions = { contract: 'WEEKLY_SOURCE_PAYMENT_VIEW_V1', view: 'PAY', allowed_tabs: ['queries'],
    allowed_sections: ['questions', 'checks', 'protected'], landing_tab: 'queries',
    can_upload: false, can_finalise: false, can_manage_settings: false,
    checklist: { available: false, read_only: true, pay_only: true, action_links: false } };
  await mountOfficeShell(page, { broker(path) {
    if (path.startsWith('/api/weekly-source/v1/workspace')) {
      requests.push(path);
      return { permissions, queries: { rows: [] }, context: { controls: [] } };
    }
    return undefined;
  } });
  await page.waitForFunction(() => typeof (window as any).CloudTMSWeeklySourceImportWorkspaceV1?.open === 'function');
  await page.evaluate(async () => { await (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open('finalise'); });
  await expect(page.locator('.ws-workspace[data-ws-tab="queries"]')).toBeVisible();
  expect(requests[0]).toBe('/api/weekly-source/v1/workspace');
  expect(requests.some(path => /tab=(imports|finalise|history|checklist)/.test(path))).toBe(false);
  expect(await page.locator('#modalTabs > button').allTextContents()).toEqual(['Queries']);
  for (const label of ['Upload source file', 'Recheck', 'Ask selected candidates', 'Send selected to manager now']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  await page.locator('.ws-query-filter-menu > summary').click();
  await expect(page.getByRole('button', { name: 'Refresh list', exact: true })).toBeVisible();
  expect(externalRequests(page)).toEqual([]);
});
