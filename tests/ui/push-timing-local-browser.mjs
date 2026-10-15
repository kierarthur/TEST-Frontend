import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import path from 'node:path';

// Local saved-module/real-DOM proof only. No auth file, application server,
// business mutation or external network is used; full TEST acceptance is separate.
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const requests = [];
    await page.route('**/*', async route => {
      if (route.request().isNavigationRequest() && route.request().url() === 'https://local-fixture.invalid/') {
        await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main id="modal"></main></body></html>' });
        return;
      }
      requests.push(route.request().url());
      await route.abort();
    });
    // Use a locally fulfilled secure origin so the real browser UUID API is
    // available, as it is on HTTPS TEST. No network request leaves Playwright.
    await page.goto('https://local-fixture.invalid/');
    await page.evaluate(() => {
      const policy = { version: 'PUSH_TIMING_POLICY_V1', enabled: true, timezone: 'Europe/London',
        normal_quiet_start: '00:00', normal_quiet_end: '07:00',
        day_rules: Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { mode: 'INHERIT' }])),
        bank_holiday_rule: { mode: 'INHERIT' } };
      window.requests = [];
      window.API = path => 'https://local-fixture.invalid' + path;
      window.authFetch = async (url, options = {}) => {
        const method = options.method || 'GET';
        window.requests.push({ url, method, body: options.body ? JSON.parse(options.body) : null });
        if (url.endsWith('/push-timing')) {
          const body = options.body ? JSON.parse(options.body) : null;
          return new Response(JSON.stringify({ ok: true,
            version: body ? 'PUSH_TIMING_SAVED_V1' : 'PUSH_TIMING_STATE_V1',
            ...(body ? { request_id: body.request_id } : { can_edit: true }),
            revision: body ? '9007199254740994' : '9007199254740993', policy: body?.policy || policy,
            policy_sha256: 'a'.repeat(64), updated_at_utc: '2026-10-16T00:00:00.000000Z'
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ version: 1 }), { status: 200 });
      };
      window.showModal = (_title, tabs, render, save) => {
        if (!tabs.some(tab => tab.key === 'push-timing')) throw new Error('QT_TAB_NOT_MOUNTED');
        window.renderTab = key => { document.querySelector('#modal').innerHTML = render(key); };
        window.saveModal = save;
        window.renderTab('push-timing');
      };
      window.showModalHint = () => {};
    });
    await page.addScriptTag({ path: path.resolve('js/push-timing-settings.js') });
    await page.addScriptTag({ path: path.resolve('js/mytms-office-v1.js') });
    await page.evaluate(() => window.CloudTMSMyTmsOffice.openSettings());
    await page.locator('[data-push-start]').waitFor();
    assert.equal(await page.locator('[data-push-start]').inputValue(), '00:00');
    assert.equal(await page.locator('[data-push-end]').inputValue(), '07:00');
    assert.equal(await page.locator('details').getAttribute('open'), null);
    await page.locator('summary').click();
    await page.locator('[data-push-mode="saturday"]').selectOption('ALLOW_WINDOW');
    await page.locator('[data-push-from="saturday"]').fill('09:00');
    await page.locator('[data-push-until="saturday"]').fill('13:00');
    await page.locator('[data-push-mode="sunday"]').selectOption('NO_PUSH_DAY');
    await page.locator('[data-push-mode="bank_holiday_rule"]').selectOption('NO_PUSH_DAY');
    // Real current host tab navigation retains the unfinished local policy.
    await page.evaluate(() => { window.renderTab('general'); window.renderTab('push-timing'); });
    await page.locator('[data-push-start]').waitFor();
    assert.equal(await page.locator('[data-push-mode="saturday"]').inputValue(), 'ALLOW_WINDOW');
    await page.locator('[data-push-save]').click();
    await page.getByText('Push timing saved.', { exact: true }).waitFor();
    const calls = await page.evaluate(() => window.requests);
    const puts = calls.filter(call => call.method === 'PUT');
    assert.equal(puts.length, 1);
    assert.ok(puts[0].url.endsWith('/api/mytms/push-timing'));
    assert.equal(puts[0].body.expected_revision, '9007199254740993');
    assert.deepEqual(puts[0].body.policy.day_rules.saturday, { mode: 'ALLOW_WINDOW', start: '09:00', end: '13:00' });
    assert.equal(puts[0].body.policy.bank_holiday_rule.mode, 'NO_PUSH_DAY');
    assert.equal(requests.length, 0);
    results.push({ viewport, saved_policy: true, existing_settings_payload_unchanged: true, external_requests: 0 });
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ scope: 'LOCAL_MODULE_REAL_DOM_FIXTURE_NOT_TEST_ACCEPTANCE', results }, null, 2));
