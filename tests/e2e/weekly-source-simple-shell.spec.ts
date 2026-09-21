/**
 * Stage 11 — the REAL simple Timesheet modal.
 *
 * This proof opens the production Office shell and the production Timesheet
 * modal. Only its broker is deterministic and local. It exists specifically
 * to prevent a fragment-only screenshot from being mistaken for proof of the
 * integrated modal, tabs, preserved actions and responsive layout.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { externalRequests, mountOfficeShell } from './helpers/weekly-source-local-shell';

const presentationFixture = JSON.parse(readFileSync(
  resolve(__dirname, '../fixtures/weekly-source-presentation-v1.json'),
  'utf8'
));

const TIMESHEET_ID = 'fa000000-0000-4000-8000-000000000003';

function detailsPayload() {
  return {
    timesheet: {
      timesheet_id: TIMESHEET_ID,
      current_timesheet_id: TIMESHEET_ID,
      booking_id: 'G9-T03',
      version: 1,
      sheet_scope: 'WEEKLY',
      submission_mode: 'ELECTRONIC',
      candidate_id: 'f3000000-0000-4000-8000-000000000001',
      candidate_name: 'Jane Smith',
      client_id: 'f2000000-0000-4000-8000-000000000001',
      client_name: "St Mary's NHS Trust",
      week_ending_date: '2026-09-20',
      authorised_at_server: null,
      is_authorised: false,
      is_invoiced: false
    },
    tsfin: {
      timesheet_id: TIMESHEET_ID,
      processing_status: 'PROCESSED',
      total_hours: '19.00',
      total_pay_ex_vat: '300.00',
      total_pay_inc_vat: '300.00',
      total_charge_ex_vat: '510.00',
      total_charge_inc_vat: '612.00',
      locked_by_invoice_id: null,
      paid_at_utc: null,
      invoice_breakdown_json: { mode: 'SEGMENTS', segments: [] }
    },
    validations: [],
    shifts: [],
    weekly_source_presentation: presentationFixture.clientSourceMismatch.weekly_source_presentation,
    action_flags: {
      can_authorise: false,
      can_unauthorise: false,
      can_manage_evidence: true,
      can_edit_timesheet_data: false,
      is_archived: false,
      read_only: false
    },
    booking_id: 'G9-T03',
    requested_timesheet_id: TIMESHEET_ID,
    current_timesheet_id: TIMESHEET_ID,
    current_version: 1,
    was_stale: false,
    sheet_scope: 'WEEKLY',
    ready_to_pay: false
  };
}

function broker(pathname: string) {
  if (pathname === `/api/timesheets/${TIMESHEET_ID}/details`) return detailsPayload();
  if (pathname.includes(`/api/timesheets/${TIMESHEET_ID}/`)) {
    return { ok: true, rows: [], items: [], evidence: [], data: [] };
  }
  return undefined;
}

async function openSimpleTimesheet(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => typeof (window as any).openTimesheet === 'function', null, { timeout: 30_000 });
  await page.evaluate(async (timesheetId) => {
    await (window as any).openTimesheet({
      id: timesheetId,
      timesheet_id: timesheetId,
      current_timesheet_id: timesheetId,
      candidate_name: 'Jane Smith',
      client_name: "St Mary's NHS Trust",
      week_ending_date: '2026-09-20',
      sheet_scope: 'WEEKLY',
      submission_mode: 'ELECTRONIC',
      weekly_source_category: 'CLIENT_PROVIDED_HOURS'
    });
  }, TIMESHEET_ID);
  await expect(page.locator('#modal.ctms-modal-timesheet')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Lines', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hours to authorise' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Submitted hours needing attention' })).toBeVisible();
}

test('Stage 11: real simple Timesheet modal integrates Weekly Source without losing its existing tabs', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mountOfficeShell(page, { broker });

  for (const [label, width, height] of [
    ['desktop', 1440, 900],
    ['tablet', 1024, 768],
    ['phone', 390, 844],
    ['fold', 280, 653]
  ] as const) {
    await page.setViewportSize({ width, height });
    await openSimpleTimesheet(page);
    await expect(page.locator('#modalTitle')).toContainText('Timesheet · Jane Smith');
    await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lines', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Expenses', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Evidence', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Audit', exact: true })).toBeVisible();
    await expect(page.locator('#modalBody')).not.toContainText('Invoice movements');
    await page.getByRole('button', { name: 'Audit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Invoice movements' })).toBeVisible();
    if (label === 'desktop') {
      await page.locator('#modal').screenshot({ path: testInfo.outputPath('office-timesheet-pay-history.png') });
    }
    await page.getByRole('button', { name: 'Lines', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Hours to authorise' })).toBeVisible();
    const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(size.scroll, `${label} has no page-level horizontal panning`).toBeLessThanOrEqual(size.client);
    await page.locator('#modal').screenshot({ path: testInfo.outputPath(`UI-067-simple-source-mismatch-${label}.png`) });
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(page.locator('#modal.ctms-modal-timesheet')).toBeHidden();
  }

  expect(errors).toEqual([]);
  expect(externalRequests(page)).toEqual([]);
});
