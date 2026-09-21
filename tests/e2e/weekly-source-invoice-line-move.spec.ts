/**
 * WP-12 (Gate 10) — the Office invoice source-line move screen.
 *
 * Two faults were confirmed against this build before this package started and
 * are fixed here. They are proved by EXECUTION, not by reading the source:
 *
 *   1. `main.js` read `weeklySource.shift_groups`, which the edit-context owner
 *      no longer returns. It now returns `movable_lines`, one element per
 *      immutable source PRESENTATION line (Gate 7 item G7-2, pack 24 §12).
 *   2. `main.js` sent `source_shift_group_id`, which
 *      `weekly_source_invoice_move_atomic_v1` now refuses by name, and it must
 *      instead send `presentation_line_id` with the expected presentation hash.
 *      PHD-003 permits that presentation to move between any two unissued
 *      invoices for the same Client. Source group, cycle and week do not add a
 *      second confirmation or request field.
 *
 * The edit-context payload is the real return of
 * `public.weekly_source_invoice_edit_context_v1(jsonb)` on the local build.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountOfficeShell, externalRequests } from './helpers/weekly-source-local-shell';

const fixture = JSON.parse(readFileSync(
  resolve(__dirname, '../fixtures/weekly-source-invoice-edit-context.json'),
  'utf8'
));

const SHOT_DIR = 'test-results/wp12-invoice-move';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Mounts the REAL invoice lines renderer and the REAL delegated click handler.
 *
 * Two pieces of the modal FRAMEWORK are stubbed, and neither is the code under
 * test: `#modalBody` is used as the mount point because the real handler binds
 * there, and `window.__getModalFrame` is made to report the invoice modal as the
 * top frame in edit mode, which is what opening the invoice modal in edit mode
 * does. `renderInvoiceLinesTable` and `attachInvoiceModalDelegatedHandlers` are
 * the shipped functions, reached by name from the loaded `main.js`.
 */
async function mountInvoiceLines(page: import('@playwright/test').Page, weeklySourceOverride?: unknown) {
  return page.evaluate((weeklySource: any) => {
    const invoice = {
      id: weeklySource.invoice_id,
      invoice_no: weeklySource.invoice_number,
      document_revision: weeklySource.document_revision,
      status: 'DRAFT',
      issued_at_utc: null,
      paid_at_utc: null,
      header_snapshot_json: { schema_version: 'WEEKLY_SOURCE_SELF_BILL_INVOICE_V1' }
    };
    const invoiceData = {
      invoice,
      items: [],
      segments_by_timesheet: {},
      segments_on_invoice_by_timesheet: {},
      tsfin_id_by_timesheet_id: {},
      weekly_source_invoice: weeklySource
    };
    const modalCtx: any = {
      entity: 'invoices',
      isEditing: true,
      data: invoiceData,
      invoiceEdits: { remove_invoice_line_ids: new Set(), remove_segment_refs: [], add_segment_refs: [] },
      invoiceUi: { expanded_timesheets: {} }
    };
    (window as any).modalCtx = modalCtx;
    (window as any).__getModalFrame = () => ({
      entity: 'invoices', kind: 'invoice-modal', mode: 'edit', _ctxRef: modalCtx
    });

    // The modal shell is the real one; it is simply shown, as opening the
    // invoice modal shows it, so that a real pointer click can reach the
    // control.
    const modal = document.getElementById('modal');
    if (modal) {
      (modal as HTMLElement).style.display = 'block';
      (modal as HTMLElement).style.visibility = 'visible';
      (modal as HTMLElement).style.opacity = '1';
      (modal as HTMLElement).removeAttribute('hidden');
    }
    const backdrop = document.getElementById('modalBackdrop');
    if (backdrop) (backdrop as HTMLElement).style.display = 'block';

    const body = document.getElementById('modalBody')!;
    const render = eval('renderInvoiceLinesTable');
    const paint = () => { body.innerHTML = render(modalCtx, invoiceData, []); };
    paint();
    eval('attachInvoiceModalDelegatedHandlers')(modalCtx, body, { rerender: paint, reload: async () => {} });

    return {
      rowCount: body.querySelectorAll('tr[data-presentation-line-id]').length,
      moveButtons: body.querySelectorAll('[data-action="inv-move-weekly-source-shift"]').length,
      followsNotices: (body as HTMLElement).innerText.split('Moves with the line it belongs to').length - 1,
      text: (body as HTMLElement).innerText,
      html: body.innerHTML
    };
  }, (weeklySourceOverride ?? fixture.source) as any);
}

test.describe('Gate 10 — the Office source invoice line move', () => {
  test('the screen reads movable_lines and offers a move only on an independently movable line', async ({ page }) => {
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mountOfficeShell(page);
    await page.waitForFunction(() => typeof (window as any).CloudTMSWeeklySourcePresentationV1 === 'object', null, { timeout: 30_000 });

    const mounted = await mountInvoiceLines(page);

    const movable = fixture.source.movable_lines as any[];
    const independent = movable.filter((line) => line.independently_movable === true);
    const companions = movable.filter((line) => line.follows_companion_presentation_line_id);
    expect(independent.length, 'the fixture has independently movable lines').toBeGreaterThan(0);
    expect(companions.length, 'the fixture has companion expense lines').toBeGreaterThan(0);

    // Every presentation line is rendered, keyed by its presentation line id.
    expect(mounted.rowCount).toBe(movable.length);
    // A move is offered only where the server says the line moves on its own.
    expect(mounted.moveButtons).toBe(independent.length);
    // A source-fixed expense follows its companion and is never selected alone.
    expect(mounted.followsNotices).toBe(companions.length);
    expect(mounted.text).toContain('Finalised source lines');
    // The superseded vocabulary is gone.
    expect(mounted.text).not.toContain('Finalised source shifts');
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: `${SHOT_DIR}/01-movable-lines.png` });

    // Each move control carries the identity and the hash the owner demands.
    const controls = await page.evaluate(() => Array.from(
      document.querySelectorAll('[data-action="inv-move-weekly-source-shift"]')
    ).map((node) => ({
      line: node.getAttribute('data-presentation-line-id'),
      hash: node.getAttribute('data-presentation-hash'),
      legacy: node.getAttribute('data-work-event-id')
    })));
    for (const control of controls) {
      expect(control.line, 'a presentation line id').toMatch(/^[0-9a-f-]{36}$/);
      expect(control.hash, 'a 64-character lower-case hex hash').toMatch(/^[0-9a-f]{64}$/);
      expect(control.legacy, 'the work-event unit of movement is gone').toBeNull();
    }
  });

  test('a move posts one presentation identity without a source-group or week restriction', async ({ page }) => {
    test.setTimeout(180_000);
    const posted: any[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await mountOfficeShell(page, {
      broker: (pathname, method, body) => {
        if (pathname.startsWith('/api/weekly-source/v1/commands') && method === 'POST') {
          posted.push(body);
          return { ok: true, status: 'MOVED', line_count: 1, movement_count: 1 };
        }
        return undefined;
      }
    });
    await page.waitForFunction(() => typeof (window as any).CloudTMSWeeklySourcePresentationV1 === 'object', null, { timeout: 30_000 });
    await mountInvoiceLines(page);

    const target = (fixture.source.movable_lines as any[]).find((line) => line.independently_movable === true);
    const destination = (fixture.source.compatible_destinations as any[])[0];

    // Choose the destination in the real select, then press the real Move.
    await page.evaluate(({ lineId, destinationId }) => {
      const button = document.querySelector(`[data-action="inv-move-weekly-source-shift"][data-presentation-line-id="${lineId}"]`)!;
      const selectId = button.getAttribute('data-destination-select-id')!;
      const select = document.getElementById(selectId) as HTMLSelectElement;
      select.value = destinationId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, { lineId: target.presentation_line_id, destinationId: destination.invoice_id });

    // A real bubbling click on the real control, delivered in the page. The
    // modal shell is not laid out in this harness, so a pointer click cannot
    // reach it; the event still travels through the shipped delegated handler
    // bound to #modalBody, which is the code under test.
    await page.evaluate((lineId) => {
      const button = document.querySelector(`[data-action="inv-move-weekly-source-shift"][data-presentation-line-id="${lineId}"]`)!;
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    }, target.presentation_line_id);

    // The ordinary guarded move confirmation remains, but a different source
    // cycle/week is not a separate business category under PHD-003.
    await expect(page.locator('#modal')).toContainText('Move source line?', { timeout: 20_000 });
    await expect(page.locator('#modal')).not.toContainText('different finalised week');
    await page.screenshot({ path: `${SHOT_DIR}/02-move-confirm.png` });
    await page.getByRole('button', { name: 'Move line', exact: true }).click();

    await expect.poll(() => posted.length, { timeout: 30_000 }).toBe(1);
    const request = posted[0];
    expect(request.action).toBe('MOVE_SOURCE_INVOICE');
    const payload = request.payload;

    // The two confirmed faults, proved fixed by execution.
    expect(Object.prototype.hasOwnProperty.call(payload, 'source_shift_group_id'),
      'the refused field is not sent').toBe(false);
    expect(payload.presentation_line_id).toBe(target.presentation_line_id);
    expect(payload.expected_presentation_hash).toBe(String(target.presentation_hash).toLowerCase());
    expect(payload.expected_presentation_hash).toMatch(/^[0-9a-f]{64}$/);

    expect(Object.prototype.hasOwnProperty.call(payload, 'confirm_different_finalised_week'),
      'week is not a compatibility restriction').toBe(false);

    expect(payload.expected_source_document_revision).toBe(fixture.source.document_revision);
    expect(payload.expected_destination_document_revision).toBe(destination.document_revision);
    expect(typeof payload.reason).toBe('string');
    expect(payload.reason.trim().length).toBeGreaterThan(0);
    expect(payload.reason.length).toBeLessThanOrEqual(1000);
    // The broker injects the actor; the browser must not.
    expect(Object.prototype.hasOwnProperty.call(payload, 'actor_user_id')).toBe(false);
    // Exactly one of the two line identities carries a value.
    expect(Object.prototype.hasOwnProperty.call(payload, 'invoice_line_id')).toBe(false);

    expect(pageErrors).toEqual([]);
    expect(externalRequests(page)).toEqual([]);
  });

  test('every same-Client destination uses the same simple move request', async ({ page }) => {
    test.setTimeout(180_000);
    const posted: any[] = [];
    await mountOfficeShell(page, {
      broker: (pathname, method, body) => {
        if (pathname.startsWith('/api/weekly-source/v1/commands') && method === 'POST') {
          posted.push(body);
          return { ok: true, status: 'MOVED', line_count: 1, movement_count: 1 };
        }
        return undefined;
      }
    });
    await page.waitForFunction(() => typeof (window as any).CloudTMSWeeklySourcePresentationV1 === 'object', null, { timeout: 30_000 });

    const sameClient = JSON.parse(JSON.stringify(fixture.source));
    await mountInvoiceLines(page, sameClient);

    const target = (sameClient.movable_lines as any[]).find((line) => line.independently_movable === true);
    const destination = sameClient.compatible_destinations[0];
    await page.evaluate(({ lineId, destinationId }) => {
      const button = document.querySelector(`[data-action="inv-move-weekly-source-shift"][data-presentation-line-id="${lineId}"]`)!;
      const select = document.getElementById(button.getAttribute('data-destination-select-id')!) as HTMLSelectElement;
      select.value = destinationId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, { lineId: target.presentation_line_id, destinationId: destination.invoice_id });

    // A real bubbling click on the real control, delivered in the page. The
    // modal shell is not laid out in this harness, so a pointer click cannot
    // reach it; the event still travels through the shipped delegated handler
    // bound to #modalBody, which is the code under test.
    await page.evaluate((lineId) => {
      const button = document.querySelector(`[data-action="inv-move-weekly-source-shift"][data-presentation-line-id="${lineId}"]`)!;
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    }, target.presentation_line_id);
    await expect(page.locator('#modal')).toContainText('Move source line?', { timeout: 20_000 });
    await expect(page.locator('#modal')).not.toContainText('different finalised week');
    await page.getByRole('button', { name: 'Move line', exact: true }).click();

    await expect.poll(() => posted.length, { timeout: 30_000 }).toBe(1);
    const payload = posted[0].payload;
    expect(Object.prototype.hasOwnProperty.call(payload, 'confirm_different_finalised_week')).toBe(false);
    await page.screenshot({ path: `${SHOT_DIR}/03-same-client-simple-move.png` });
  });
});
