import { expect, test, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ serviceWorkers: 'block' });

const root = resolve(__dirname, '../..');
const testOrigin = 'https://testmode.arthur-rai.co.uk';
const testBackend = 'https://test-cloudtms-backend.kier-88a.workers.dev';
const useDeployedAssets = process.env.MYTMS_E2E_USE_DEPLOYED_ASSETS === '1';
const localAssets = ['index.html', 'js/main.js', 'js/mytms-office-v1.js', 'css/modal-modernisation.css'];
const sourceByPath = new Map(localAssets.map((file) => [
  `/${file === 'index.html' ? 'index.html' : file}`,
  readFileSync(resolve(root, file), 'utf8')
]));
const hashes = Object.fromEntries(Array.from(sourceByPath.entries()).map(([path, source]) => [
  path, createHash('sha256').update(source).digest('hex')
]));
const normalizedHashes = Object.fromEntries(Array.from(sourceByPath.entries()).map(([path, source]) => [
  path, createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex')
]));

async function proveDeployedAssets(page: Page) {
  for (const [path, expectedHash] of Object.entries(normalizedHashes)) {
    const response = await page.request.get(`${testOrigin}${path}?mytms-app-ready=${Date.now()}`);
    expect(response.ok()).toBe(true);
    const source = (await response.text()).replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(source).digest('hex')).toBe(expectedHash);
  }
}

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
      contentType: key.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : key.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : 'application/javascript; charset=utf-8',
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

const managerKinds = ['INITIAL', 'REMINDER', 'RENEWAL', 'WITHDRAWAL', 'CANCELLATION'];
const managerTemplateType = Object.fromEntries(managerKinds.map((kind) => [kind, {
  subject: `${kind} manager subject`, body_text: `${kind} manager body.`,
  body_html: `<p>${kind} manager body.</p>`,
  button_text: ['INITIAL', 'REMINDER', 'RENEWAL'].includes(kind) ? 'Review and approve' : null,
  include_link: ['INITIAL', 'REMINDER', 'RENEWAL'].includes(kind)
}]));
const managerSettings = {
  ok: true,
  agency_templates: {
    schema_version: 'CANDIDATE_MANAGER_EMAIL_TEMPLATES_V1',
    TIMESHEET: structuredClone(managerTemplateType),
    EXPENSE_CLAIM: structuredClone(managerTemplateType)
  },
  agency_template_version: 1,
  agency_template_sanitizer_policy_version: 'MANAGER_EMAIL_SAFE_HTML_V1',
  agency_template_semantic_sha256_hex: 'a'.repeat(64),
  agency_template_updated_at_utc: '2026-08-23T01:00:00Z',
  manager_origin: {
    public_origin: 'https://testmode.arthur-rai.co.uk', state: 'TEST_READY',
    settings_version: 8, semantic_sha256_hex: 'b'.repeat(64),
    verified_at_utc: '2026-08-23T01:00:00Z', ownership: 'PLATFORM'
  }
};

async function installReadOnlyApi(page: Page) {
  const observed = { settingsReads: 0, managerReads: 0, previews: 0, managerPreviews: 0, writes: 0 };
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
    if (path === '/api/mytms/manager-email-settings' && request.method() === 'GET') {
      observed.managerReads += 1;
      return reply(managerSettings);
    }
    if (path === '/api/mytms/manager-email-settings/preview' && request.method() === 'POST') {
      observed.managerPreviews += 1;
      return reply({
        ok: true, preview_html: '<p>Safe manager preview.</p><p>Review and approve</p>',
        sanitizer_policy_version: 'MANAGER_EMAIL_SAFE_HTML_V1'
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
    const assets = useDeployedAssets ? null : await installLocalAssets(page);
    const observed = await installReadOnlyApi(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });

    expect(new URL(page.url()).origin).toBe(testOrigin);
    expect(await page.evaluate(() => (window as any).BROKER_BASE_URL)).toBe(testBackend);
    if (useDeployedAssets) {
      await proveDeployedAssets(page);
    } else {
      expect(await page.evaluate(() => (window as any).__MYTMS_OFFICE_LOCAL_PROOF)).toEqual(hashes);
      expect(assets?.['/index.html']).toBeGreaterThan(0);
      expect(assets?.['/js/main.js']).toBeGreaterThan(0);
      expect(assets?.['/js/mytms-office-v1.js']).toBeGreaterThan(0);
      expect(assets?.['/css/modal-modernisation.css']).toBeGreaterThan(0);
    }

    await page.locator('[data-section-key="settings"]').click();
    const menu = page.locator('#__settingsMenu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: /MyTMS App Settings/ })).toBeVisible();
    await menu.getByRole('button', { name: /MyTMS App Settings/ }).click();

    const modal = page.locator('#modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('MyTMS App Settings', { exact: true })).toBeVisible();
    await expect(modal.getByText('Agency invitation policy', { exact: true })).toBeVisible();
    await expect(modal.getByLabel('Android store URL')).toBeDisabled();
    await expect(modal.getByLabel('TEST recipient allowlist')).toBeDisabled();
    await expect(modal.getByLabel('Invitation expiry (seconds)')).toHaveAttribute('min', '86400');
    await expect(modal.getByLabel('Invitation expiry (seconds)')).toHaveAttribute('max', '604800');
    await expect(modal.getByLabel('Minimum resend interval (seconds)')).toHaveAttribute('min', '900');
    await expect(modal.getByLabel('Minimum resend interval (seconds)')).toHaveAttribute('max', '86400');
    await expect(modal.getByLabel('Maximum resends (0–5; total sends 1–6)')).toHaveAttribute('min', '0');
    await expect(modal.getByLabel('Maximum resends (0–5; total sends 1–6)')).toHaveAttribute('max', '5');

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

    await modal.getByRole('button', { name: 'Manager approval by email', exact: true }).click();
    await expect(modal.getByRole('heading', { name: 'Manager approval by email', exact: true })).toBeVisible();
    await expect(modal.getByLabel('Secure manager review address')).toBeDisabled();
    await expect(modal.getByLabel('Secure manager review address')).toHaveValue('https://testmode.arthur-rai.co.uk');
    await expect(modal.getByLabel('Button text')).toHaveValue('Review and approve');
    await modal.getByRole('button', { name: 'Preview sanitized email', exact: true }).click();
    const managerPreview = modal.locator('[data-manager-preview-frame]');
    await expect(managerPreview).toBeVisible();
    await expect(managerPreview).toHaveAttribute('sandbox', '');
    await modal.getByLabel('Message').selectOption('WITHDRAWAL');
    await expect(modal.getByLabel('Button text')).toBeDisabled();

    expect(observed.settingsReads).toBe(1);
    expect(observed.managerReads).toBe(1);
    expect(observed.previews).toBe(1);
    expect(observed.managerPreviews).toBe(1);
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

test('Candidate MyTMS status is compact, human-readable and truthful', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const assets = await installLocalAssets(page);
  const candidateId = '10000000-0000-4000-8000-000000000001';
  let statusReads = 0;
  let invitationPosts = 0;

  await page.route(`${testBackend}/api/mytms/candidates/${candidateId}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/status')) {
      statusReads += 1;
      return route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true,
          agency_display_name: 'Arthur Rai Medical Services Limited',
          candidate_id: candidateId,
          candidate_display_name: 'Test Candidate',
          candidate_email: 'candidate@example.test',
          state: statusReads === 1 ? 'NOT_INVITED' : 'PENDING',
          delivery_state: statusReads === 1 ? null : 'OUTBOX_ACCEPTED',
          settings_version: 3,
          action: statusReads === 1
            ? { code: 'INVITE_TO_MYTMS', label: 'Invite to MyTMS', enabled: true, disabled_reason_code: null }
            : { code: 'RESEND_INVITATION', label: 'Resend App Invitation', enabled: true, disabled_reason_code: null }
        })
      });
    }
    if (request.method() === 'POST' && path.endsWith('/invitations')) {
      invitationPosts += 1;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, status: 'OUTBOX_ACCEPTED', invitation_generation: 1 })
      });
    }
    return route.abort();
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  await page.evaluate((id) => {
    const modal = document.getElementById('modal');
    const backdrop = document.getElementById('modalBack');
    const body = document.getElementById('modalBody');
    if (!modal || !backdrop || !body) throw new Error('modal shell unavailable');
    backdrop.style.display = 'flex';
    backdrop.setAttribute('aria-hidden', 'false');
    modal.classList.add('ctms-modern-modal', 'record-modal');
    body.innerHTML = '<div class="ctms-tab-intro"><div><h2>Candidate profile</h2></div></div><div class="form ctms-proposal-form" id="tab-main"></div>';
    (window as any).modalCtx = { entity: 'candidates', data: { id } };
    return (window as any).CloudTMSMyTmsOffice.mountCandidateAction({ id });
  }, candidateId);

  const host = page.locator('[data-mytms-candidate-host]');
  await expect(host).toBeVisible();
  await expect(host.getByText('Candidate app access', { exact: true })).toBeVisible();
  await expect(host.getByText('Not invited', { exact: true })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Send invitation', exact: true })).toBeVisible();
  await expect(host).not.toContainText('NOT_INVITED');
  const layout = await host.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement?.getBoundingClientRect();
    return { width: rect.width, height: rect.height, parentWidth: parent?.width || 0 };
  });
  expect(layout.width).toBeGreaterThan(layout.parentWidth * 0.9);
  expect(layout.height).toBeLessThan(190);

  await host.getByRole('button', { name: 'Send invitation', exact: true }).click();
  const confirmModal = page.locator('#modal[data-uicf-kind="mytms-candidate-invitation-confirm"]');
  await expect(confirmModal).toBeVisible();
  await expect(confirmModal).toContainText('Test Candidate');
  await expect(confirmModal).toContainText('candidate@example.test');
  await expect(confirmModal.locator('dt', { hasText: /^Agency$/ })).toHaveCount(0);
  await expect(confirmModal).not.toContainText('Arthur Rai Medical Services Limited');
  await expect(confirmModal).not.toContainText('CloudTMS TEST');
  await confirmModal.getByRole('button', { name: 'Send invitation', exact: true }).click();

  const resultModal = page.locator('#modal[data-uicf-kind="mytms-invitation-result"]');
  await expect(resultModal).toBeVisible();
  await expect(resultModal.locator('#modalTitle')).toHaveText('Invitation queued');
  await expect(resultModal).toContainText('Test Candidate’s email invitation has been queued for sending.');
  await expect(resultModal).not.toContainText('OUTBOX_ACCEPTED');
  const resultWidth = await resultModal.evaluate((element) => element.getBoundingClientRect().width);
  expect(resultWidth).toBeLessThanOrEqual(650);
  expect(invitationPosts).toBe(1);
  expect(assets['/css/modal-modernisation.css']).toBeGreaterThan(0);
});
