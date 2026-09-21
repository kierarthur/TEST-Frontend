import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const scriptPath = resolve(__dirname, '../../js/invoice-batch-modal.js');
const stylePath = resolve(__dirname, '../../css/invoice-batch-modal.css');

test.use({ storageState: { cookies: [], origins: [] } });

test('finalised self-bill stays in the existing batch table with one sticky header checkbox', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.setContent(`<!doctype html><html><head></head><body>
    <main id="modal" class="invbatch-modal">
      <div id="fixture" class="invbatch-list-scroll"></div>
    </main>
  </body></html>`);
  await page.addStyleTag({ content: `
    :root{--panel:#0f172a;--bg:#020617;--line:#334155;--muted:#94a3b8;--accent:#3b82f6;color-scheme:dark}
    *{box-sizing:border-box} body{margin:0;padding:12px;background:var(--bg);color:#f8fafc;font:14px/1.4 Arial,sans-serif}
    button,input{font:inherit}.btn{padding:6px 9px}.mini{color:var(--muted)}
    #fixture{height:360px;overflow:auto}
  ` });
  await page.addStyleTag({ path: stylePath });
  await page.addScriptTag({ path: scriptPath });

  await page.evaluate(() => {
    const win = window as any;
    const state = win.createInvoiceBatchModalState('GENERATE');
    state.candidate_page = { rows: [] };
    state.weekly_source_rows = [{
      selection_key: 'weekly-source-manifest:11111111-1111-4111-8111-111111111111',
      source_revision: 'a'.repeat(64),
      source_kind: 'WEEKLY_FINAL_SOURCE',
      invoice_stream: 'WEEKLY_FINAL_SOURCE',
      selectable: true,
      row_status: 'READY',
      generation_state: 'NOT_GENERATED',
      week_ending_date: '2026-09-13',
      client_id: '22222222-2222-4222-8222-222222222222',
      client_name: 'Royal Berkshire NHS Trust',
      candidate_ids: ['33333333-3333-4333-8333-333333333333'],
      candidate_names: ['Alex Reed'],
      report_number: 'BR-2026-0913',
      movement_count: 8,
      total_ex_vat: 1200,
      vat_amount: 240,
      total_inc_vat: 1440,
      currency: 'GBP',
      action_blocker_codes: [],
      informational_codes: ['RELEASED_AFTER_DISPUTE'],
      released_after_dispute: true,
      client_manifest_id: '11111111-1111-4111-8111-111111111111',
      source_cycle_id: '44444444-4444-4444-8444-444444444444'
    }];
    document.getElementById('fixture')!.innerHTML = win.renderInvoiceBatchGroups(state);
    document.querySelectorAll<HTMLInputElement>('[data-indeterminate="true"]')
      .forEach(input => { input.indeterminate = true; });
  });

  await expect(page.getByRole('heading', { name: 'Finalised self-bill' })).toBeVisible();
  await expect(page.getByText('Royal Berkshire NHS Trust')).toBeVisible();
  await expect(page.getByText('BR-2026-0913')).toBeVisible();
  await expect(page.getByText('Released after dispute')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate and view' })).toBeVisible();
  await expect(page.getByRole('button', { name: /select all|unselect all/i })).toHaveCount(0);

  const headerCheckbox = page.getByRole('checkbox', {
    name: 'Select or unselect all finalised self-bill rows shown'
  });
  await expect(headerCheckbox).toBeChecked();
  const placement = await headerCheckbox.evaluate((input) => {
    const cell = input.closest('th');
    const row = input.closest('tr');
    return {
      firstColumn: cell?.cellIndex,
      rowPosition: row ? getComputedStyle(row).position : '',
      rowTop: row ? getComputedStyle(row).top : ''
    };
  });
  expect(placement).toEqual({ firstColumn: 0, rowPosition: 'sticky', rowTop: '0px' });
});
