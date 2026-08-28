import { expect, test, type Page, type TestInfo } from '@playwright/test';

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const field = (page: Page, name: string) => page.locator(`#modal [name="${name}"]`);
async function result(page: Page) {
  return JSON.parse(await page.locator('#fixture-results').textContent() || '{}');
}
async function open(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('#modal')).toBeVisible();
}
async function screenshotAndFit(page: Page, info: TestInfo, name: string) {
  const metrics = await page.locator('#modal').evaluate(modal => {
    const r = modal.getBoundingClientRect();
    const b = document.getElementById('modalBody')!;
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth,
      height: innerHeight, overflow: b.scrollWidth - b.clientWidth };
  });
  expect(metrics.x).toBeGreaterThanOrEqual(-2);
  expect(metrics.y).toBeGreaterThanOrEqual(-2);
  expect(metrics.right).toBeLessThanOrEqual(metrics.width + 2);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.height + 2);
  expect(metrics.overflow).toBeLessThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

test.beforeEach(async ({ page }) => {
  // Never allow this regression suite to send a request to TEST or LIVE.
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    return u.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  page.on('dialog', dialog => {
    void dialog.dismiss();
    throw new Error(`Unexpected native dialog: ${dialog.type()}`);
  });
});

test('all seven redesigned sections fit and read-only navigation remains available', async ({ page }, info) => {
  await open(page, 'Existing candidate');
  for (const name of ['Main Details', 'Work & compliance', 'Payment details']) {
    await tab(page, name).click();
    const heading = name === 'Main Details' ? 'Candidate profile' : name === 'Payment details' ? 'Payment details' : name;
    await expect(page.locator('#modalBody h2')).toHaveText(heading);
    await screenshotAndFit(page, info, `Candidate - ${name}`);
  }
  await open(page, 'Existing client');
  await screenshotAndFit(page, info, 'Client - Main');
  await tab(page, 'Client settings').click();
  for (const name of ['Timesheets', 'Shift times', 'Invoicing']) {
    await tab(page, name).click();
    await screenshotAndFit(page, info, `Client - ${name}`);
    if (name === 'Shift times') {
      const widths = await page.locator('#modal input[type="time"]').evaluateAll(inputs =>
        inputs.map(input => input.getBoundingClientRect().width));
      expect(widths).toHaveLength(10);
      for (const width of widths) expect(width).toBeGreaterThanOrEqual(125);
    }
  }
  expect((await result(page)).writes).toEqual([]);
});

test('delayed Umbrella details cannot use the previous Candidate tab layout', async ({ page }, info) => {
  await open(page, 'Existing umbrella candidate');
  for (const previous of ['Work & compliance', 'Main Details']) {
    await tab(page, previous).click();
    await tab(page, 'Payment details').click();
    await expect(field(page, 'bank_name')).toHaveValue('Fixture bank');
    await expect(page.locator('#modalBody h2')).toHaveText('Payment details');
    await expect(page.locator('#tab-pay .ctms-section-title')).toHaveText([
      'Payment destination', 'Remittance preferences', 'Candidate finance'
    ]);
    await expect(field(page, 'pay_method')).toHaveValue('UMBRELLA');
    await expect(field(page, 'bank_name')).toBeDisabled();
    await screenshotAndFit(page, info, `Umbrella payment from ${previous}`);
  }
  await tab(page, 'Work & compliance').click();
  await expect(page.locator('#modalBody h2')).toHaveText('Work & compliance');
  await expect(field(page, 'band')).toHaveValue('6');
  await tab(page, 'Main Details').click();
  await expect(page.locator('#modalBody h2')).toHaveText('Candidate profile');
  await expect(field(page, 'address_line1')).toHaveValue('14 Example Street');
  expect((await result(page)).writes).toEqual([]);
});

test('new-client defaults, workflow relevance and explicit consolidation choice', async ({ page }) => {
  await open(page, 'New client');
  await field(page, 'name').fill('Example new client');
  await tab(page, 'Client settings').click();
  await expect(field(page, 'default_submission_mode')).toHaveValue('ELECTRONIC');
  await expect(field(page, 'candidate_paper_submission_enabled')).toBeChecked();
  await expect(field(page, 'ts_queries_email')).toHaveCount(0);
  await tab(page, 'Shift times').click();
  await expect(page.getByRole('switch', { name: 'Use custom shift times' })).toHaveAttribute('aria-checked', 'false');
  await expect(field(page, 'day_start')).toBeHidden();
  await tab(page, 'Invoicing').click();
  await expect(field(page, 'payment_terms_days')).toHaveValue('30');
  await expect(field(page, 'vat_chargeable')).toHaveValue('Yes');
  await expect(field(page, 'daily_calc_of_invoices')).toBeChecked();
  await expect(page.getByRole('radio', { name: 'None', exact: true })).toBeChecked();
  await tab(page, 'Timesheets').click();
  await page.getByRole('radio', { name: 'Dedicated NHSP Weekly', exact: true }).check();
  await expect(field(page, 'default_submission_mode')).toBeHidden();
  await expect(field(page, 'candidate_paper_submission_enabled')).toBeHidden();
  await tab(page, 'Invoicing').click();
  const all = page.getByRole('radio', { name: 'All weeks (for client)', exact: true });
  await expect(all).toBeChecked();
  await expect(all).toBeDisabled();
  await page.getByRole('switch', { name: 'Edit consolidation' }).click();
  await expect(all).toBeEnabled();
  await page.getByRole('radio', { name: 'By week (per client)', exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#modalTitle')).toHaveText('View Client');
  const data = await result(page);
  expect(data.client.name).toBe('Example new client');
  const settingsWrite = data.writes.find((w: any) => w.body.client_settings)?.body.client_settings;
  expect(settingsWrite.is_nhsp).toBe(true);
  expect(settingsWrite.requires_hr).toBe(false);
  expect(settingsWrite).not.toHaveProperty('weekly_mode');
  expect(data.settings.invoice_consolidation_mode).toBe('BY_WEEK');
  expect(data.settings.daily_calc_of_invoices).toBe(true);
});

test('existing billing, zero terms, custom shifts and roster drafts survive tab changes and save', async ({ page }) => {
  await open(page, 'Existing client');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await tab(page, 'Client settings').click();
  await field(page, 'ts_queries_email').fill('changed@example.invalid');
  await page.getByRole('radio', { name: /^Import-authoritative roster/ }).check();
  await expect(field(page, 'ts_queries_email')).toHaveCount(0);
  await page.getByRole('radio', { name: /^Roster validation timesheets/ }).check();
  await expect(field(page, 'ts_queries_email')).toHaveValue('changed@example.invalid');
  await tab(page, 'Shift times').click();
  const custom = page.getByRole('switch', { name: 'Use custom shift times' });
  await custom.click();
  await expect(field(page, 'day_start')).toBeHidden();
  await custom.click();
  await expect(field(page, 'day_start')).toHaveValue('07:00');
  await tab(page, 'Invoicing').click();
  await expect(field(page, 'payment_terms_days')).toHaveValue('0');
  await expect(field(page, 'daily_calc_of_invoices')).not.toBeChecked();
  await expect(page.getByRole('radio', { name: 'By week (per client)', exact: true })).toBeChecked();
  await field(page, 'invoice_address').fill('');
  await field(page, 'ap_phone').fill('');
  await field(page, 'primary_invoice_email').fill('invoices@example.invalid');
  await tab(page, 'Main').click();
  await tab(page, 'Client settings').click();
  await tab(page, 'Invoicing').click();
  await expect(field(page, 'invoice_address')).toHaveValue('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#modalTitle')).toHaveText('View Client');
  const data = await result(page);
  expect(data.client.primary_invoice_email).toBe('invoices@example.invalid');
  expect(data.client.invoice_address).toBeNull();
  expect(data.client.ap_phone).toBeNull();
  expect(data.client.payment_terms_days).toBe(0);
  expect(data.client.ts_queries_email).toBe('changed@example.invalid');
  expect(data.settings.invoice_consolidation_mode).toBe('BY_WEEK');
  expect(data.settings.daily_calc_of_invoices).toBe(false);
  expect(data.settings.candidate_paper_submission_enabled).toBe(false);
  expect(data.settings.day_start).toBe('07:00');
});

test('a partial shift draft is preserved but cannot be saved', async ({ page }) => {
  await open(page, 'New client');
  await field(page, 'name').fill('Incomplete shift fixture');
  await tab(page, 'Client settings').click();
  await tab(page, 'Shift times').click();
  await page.getByRole('switch', { name: 'Use custom shift times' }).click();
  await field(page, 'day_start').fill('08:00');
  await tab(page, 'Main').click();
  await tab(page, 'Client settings').click();
  await tab(page, 'Shift times').click();
  await expect(field(page, 'day_start')).toHaveValue('08:00');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#modalTitle')).toHaveText('Complete the shift pattern');
  expect((await result(page)).writes).toEqual([]);
});

test('moved Candidate work and payment fields and intentional address clears survive Save', async ({ page }) => {
  await open(page, 'Existing candidate');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await field(page, 'address_line2').fill('');
  await tab(page, 'Work & compliance').click();
  await field(page, 'band').fill('7');
  await tab(page, 'Payment details').click();
  await field(page, 'bank_name').fill('Updated example bank');
  await tab(page, 'Main Details').click();
  await expect(field(page, 'address_line2')).toHaveValue('');
  await tab(page, 'Payment details').click();
  await expect(field(page, 'bank_name')).toHaveValue('Updated example bank');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#modalTitle')).toHaveText('View Candidate');
  const data = await result(page);
  expect(data.candidate.address_line2).toBe('');
  expect(data.candidate.band).toBe(7);
  expect(data.candidate.bank_name).toBe('Updated example bank');
  expect(data.candidate.pay_method).toBe('PAYE');
});

test('new Candidate keeps the existing defaults and can save from Payment details', async ({ page }) => {
  await open(page, 'New candidate');
  await field(page, 'first_name').fill('Taylor');
  await field(page, 'last_name').fill('Example');
  await field(page, 'email').fill('taylor@example.invalid');
  await field(page, 'phone').fill('07700000000');
  await field(page, 'gender').selectOption('Female');
  await tab(page, 'Payment details').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#modalTitle')).toHaveText('View Candidate');
  const write = (await result(page)).writes.find((w: any) => w.path === '/api/candidates');
  expect(write.method).toBe('POST');
  expect(write.body.first_name).toBe('Taylor');
  expect(write.body.pay_method).toBeNull(); // Existing API representation of Unknown.
  expect(write.body.opt_in_email).toBe(true);
  expect(write.body.remittance_overrides_enabled).toBe(false);
});
