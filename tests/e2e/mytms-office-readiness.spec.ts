import { expect, test, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

const root = resolve(__dirname, '../..');
const testOrigin = 'https://testmode.arthur-rai.co.uk';
const testBackend = 'https://test-cloudtms-backend.kier-88a.workers.dev';
const localAssets = ['index.html', 'js/main.js', 'js/mytms-office-v1.js'];
const sourceByPath = new Map(localAssets.map((file) => [
  `/${file === 'index.html' ? 'index.html' : file}`,
  readFileSync(resolve(root, file), 'utf8')
]));
const hashes = Object.fromEntries(Array.from(sourceByPath.entries()).map(([path, source]) => [
  path, createHash('sha256').update(source).digest('hex')
]));

async function installLocalAssets(page: Page) {
  const counts: Record<string, number> = {};
  await page.route(`${testOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const key = url.pathname === '/' ? '/index.html' : url.pathname;
    const source = sourceByPath.get(key);
    if (!source) return route.continue();
    counts[key] = (counts[key] || 0) + 1;
    const body = key === '/index.html'
      ? source.replace('</head>', `<script>window.BROKER_BASE_URL=${JSON.stringify(testBackend)};window.__MYTMS_OFFICE_LOCAL_PROOF=${JSON.stringify(hashes)};</script></head>`)
      : source;
    await route.fulfill({
      body,
      contentType: key.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8',
      headers: { 'cache-control': 'no-store', 'x-codex-local-asset': 'mytms-office-readiness' }
    });
  });
  return counts;
}

const settings = {
  ok: true,
  version: 1,
  sanitizer_policy_version: 'MYTMS_EMAIL_HTML_V1_SANITIZE_HTML_2_17_7',
  invitation_email_enabled: false,
  access_reminder_enabled: false,
  provisioning_enabled: false,
  membership_admin_enabled: false,
  google_target_switch_enabled: false,
  push_delivery_enabled: false,
  invitation_subject: 'Your secure MyTMS invitation',
  invitation_html_sanitized: '<p>Hello {{candidate_name}}</p>',
  invitation_text: 'Hello {{candidate_name}}',
  access_reminder_subject: 'Your MyTMS access',
  access_reminder_html_sanitized: '<p>Access reminder</p>',
  access_reminder_text: 'Access reminder',
  invitation_expiry_seconds: 86400,
  resend_minimum_seconds: 900,
  maximum_resends: 3,
  test_recipient_allowlist: [],
  planned_test_web_origin: null,
  planned_future_web_origin: null,
  web_host_state: 'UNDECIDED',
  support_url: null,
  android_store_url: null,
  ios_store_url: null,
  logo_asset_key: null
};

async function installReadOnlyApi(page: Page) {
  const observed = { settingsReads: 0, previews: 0, writes: 0 };
  await page.route(`${testBackend}/api/mytms/**`, async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = (body: unknown, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body)
    });
    if (path === '/api/mytms/settings' && request.method() === 'GET') {
      observed.settingsReads += 1;
      return reply(settings);
    }
    if (path === '/api/mytms/settings/preview' && request.method() === 'POST') {
      observed.previews += 1;
      return reply({
        ok: true,
        sanitizer_policy_version: settings.sanitizer_policy_version,
        sanitized_html: '<p>Hello Candidate</p>'
      });
    }
    observed.writes += 1;
    return reply({ ok: false, error_code: 'READ_ONLY_BROWSER_PROOF' }, 409);
  });
  return observed;
}

for (const viewport of [
  { label: 'desktop', width: 1440, height: 960 },
  { label: 'narrow', width: 412, height: 915 }
]) {
  test(`MyTMS App Settings is separate, disabled-first and sanitizer-pinned on ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const assets = await installLocalAssets(page);
    const observed = await installReadOnlyApi(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });

    expect(new URL(page.url()).origin).toBe(testOrigin);
    expect(await page.evaluate(() => (window as any).BROKER_BASE_URL)).toBe(testBackend);
    expect(await page.evaluate(() => (window as any).__MYTMS_OFFICE_LOCAL_PROOF)).toEqual(hashes);
    expect(assets['/index.html']).toBeGreaterThan(0);
    expect(assets['/js/main.js']).toBeGreaterThan(0);
    expect(assets['/js/mytms-office-v1.js']).toBeGreaterThan(0);

    await page.locator('[data-section-key="settings"]').click();
    const menu = page.locator('#__settingsMenu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: /MyTMS App Settings/ })).toBeVisible();
    await menu.getByRole('button', { name: /MyTMS App Settings/ }).click();

    const modal = page.locator('#modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('MyTMS App Settings', { exact: true })).toBeVisible();
    await expect(modal.getByText('Version 1.', { exact: false })).toBeVisible();

    await modal.getByRole('button', { name: 'Activation state', exact: true }).click();
    await expect(modal.locator('[data-mytms-setting][type="checkbox"]')).toHaveCount(6);
    for (const checkbox of await modal.locator('[data-mytms-setting][type="checkbox"]').all()) {
      await expect(checkbox).toBeDisabled();
      await expect(checkbox).not.toBeChecked();
    }

    await modal.getByRole('button', { name: 'Invitation email', exact: true }).click();
    await expect(modal.getByText(settings.sanitizer_policy_version, { exact: false })).toBeVisible();
    await modal.getByRole('button', { name: 'Preview sanitized email', exact: true }).click();
    const preview = modal.locator('[data-mytms-preview-frame="invitation"]');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('sandbox', '');
    await expect(preview).toHaveAttribute('srcdoc', '<p>Hello Candidate</p>');

    expect(observed.settingsReads).toBe(1);
    expect(observed.previews).toBe(1);
    expect(observed.writes).toBe(0);
    const bounds = await modal.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, width: innerWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
  });
}
