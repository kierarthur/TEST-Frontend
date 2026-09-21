import { expect, test } from '@playwright/test';
import { externalRequests, mountOfficeShell } from './helpers/weekly-source-local-shell';

const CLIENT_ID = 'cc000000-0000-4000-8000-000000000001';

const capabilities = {
  eligible: true,
  source_family: 'ROSTER',
  authority_mode: 'SOURCE_AUTHORITY',
  document_mode: 'CHECK_ONLY',
  self_bill_enabled: true,
  show_query_settings: true,
  show_completed_pack: true,
  show_rate_settings: true,
  show_source_expenses: true,
  show_self_bill_correction: true
};

const settings = {
  source_group_id: 'sg-roster',
  weekly_rate_classification_method: 'SPLIT_RATE_WINDOWS',
  duration_break_tie_rule: 'EARLIEST_LONGEST_PORTION',
  candidate_queries_enabled: true,
  manager_queries_enabled: true,
  manager_query_recipient: 'manager@example.test',
  completed_pack_copy_enabled: true,
  completed_pack_recipient: 'timesheets@example.test',
  self_bill_correction_presentation: 'FULL_REVERSAL_REPLACEMENT',
  source_fixed_expenses_enabled: true,
  source_expense_vat_enabled: false
};

test('Stage 11: relevant Client and Contract Weekly Source settings use the real settings owner', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mountOfficeShell(page);
  await page.waitForFunction(() => Boolean((window as any).CloudTMSWeeklySourceSettings));

  await page.evaluate(({ clientId, capabilityPolicy, currentSettings }) => {
    const api = (window as any).CloudTMSWeeklySourceSettings;
    const host = document.createElement('main');
    host.id = 'stage11-settings-host';
    host.className = 'ctms-modal-content';
    host.innerHTML = `
      <header class="ctms-modal-intro"><h2>Client settings</h2><p>Only settings relevant to this Client are shown.</p></header>
      <section data-record-panel="timesheets"><section class="record-settings-card"><h3>Timesheets</h3><p>Weekly timesheet settings</p></section></section>
      <section data-record-panel="shifts"><section class="record-settings-card"><h3>Shift times</h3><p>Existing Client rate windows remain here.</p></section></section>
      <section data-record-panel="invoicing"><section class="record-settings-card"><h3>Invoice consolidation</h3><p>Existing invoice settings remain here.</p></section></section>`;
    document.body.replaceChildren(host);
    const ctx: any = { data: { id: clientId }, clientSettingsState: { weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'CREATE' } };
    ctx[api.stateKeys.CLIENT_STATE] = api.normaliseClientPayload({
      eligible: true, client_id: clientId, settings_version: 1,
      capabilities: capabilityPolicy, settings: currentSettings,
      source_groups: [{ id: 'sg-roster', code: 'ROSTER', display_name: 'Roster clients', source_family: 'ROSTER' }]
    }, ctx);
    api.mountClient(host, ctx);
  }, { clientId: CLIENT_ID, capabilityPolicy: capabilities, currentSettings: settings });

  const host = page.locator('#stage11-settings-host');
  await expect(host.getByRole('heading', { name: 'Weekly source queries' })).toBeVisible();
  await expect(host.getByText('Email the completed Timesheet')).toBeVisible();
  await expect(host.getByRole('heading', { name: 'Weekly rate calculation' })).toBeVisible();
  await expect(host.getByRole('heading', { name: 'Weekly self-bill corrections' })).toBeVisible();
  await expect(host.getByRole('heading', { name: 'Expenses from weekly source' })).toBeVisible();
  await host.screenshot({ path: testInfo.outputPath('client-settings.png') });

  await page.evaluate(({ clientId, capabilityPolicy, currentSettings }) => {
    const api = (window as any).CloudTMSWeeklySourceSettings;
    const host = document.createElement('main');
    host.id = 'stage11-contract-settings-host';
    host.className = 'ctms-modal-content';
    host.innerHTML = `<header class="ctms-modal-intro"><h2>Contract settings</h2><p>Use the Client setting or choose a Contract override.</p></header><section class="ctms-contract-settings-card"><h3 id="contractSpecificSettingsHeading">Contract-specific settings</h3><div class="ctms-contract-query-email"></div></section>`;
    document.body.replaceChildren(host);
    const ctx: any = { data: { id: clientId }, clientSettingsState: { weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'CREATE' } };
    const clientPayload = {
      eligible: true, client_id: clientId, settings_version: 1,
      capabilities: capabilityPolicy, settings: currentSettings, source_groups: []
    };
    ctx[api.stateKeys.CLIENT_STATE] = api.normaliseClientPayload(clientPayload, ctx);
    ctx[api.stateKeys.CONTRACT_STATE] = api.normaliseContractPayload({
      eligible: true, contract_id: 'ct-1', settings_version: 1,
      capabilities: capabilityPolicy,
      settings: {
        effective: currentSettings,
        candidate_queries_enabled_override: null,
        manager_queries_enabled_override: null,
        completed_pack_copy_enabled_override: true,
        completed_pack_recipient_override: 'ward@example.test'
      }
    }, ctx[api.stateKeys.CLIENT_STATE]);
    return api.mountContract(host, ctx, 'ct-1', clientId, false, 'stage11');
  }, { clientId: CLIENT_ID, capabilityPolicy: capabilities, currentSettings: settings });

  const contract = page.locator('#stage11-contract-settings-host');
  await expect(contract.getByRole('heading', { name: 'Weekly source messages' })).toBeVisible();
  await expect(contract.getByText('Use Client setting - On')).toHaveCount(4);
  await expect(contract.getByText('Email the completed Timesheet')).toBeVisible();
  await contract.screenshot({ path: testInfo.outputPath('contract-settings.png') });
  expect(externalRequests(page)).toEqual([]);
});

test('Stage 11: Roster validation keeps Reference required before pay visible and off by default', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mountOfficeShell(page, {
    broker(pathname) {
      if (pathname === `/api/clients/${CLIENT_ID}/delete-eligibility`) return { can_delete: false, reason: 'Fixture record' };
      if (pathname === `/api/clients/${CLIENT_ID}`) return {
        client: { id: CLIENT_ID, name: 'West London NHS Foundation Trust', vat_chargeable: true, payment_terms_days: 30 },
        client_settings: {
          timezone_id: 'Europe/London', day_start: '07:00', day_end: '19:00', night_start: '19:00', night_end: '07:00',
          sat_start: '00:00', sat_end: '00:00', sun_start: '00:00', sun_end: '00:00', bh_start: '00:00', bh_end: '00:00',
          week_ending_weekday: 0, weekly_mode: 'HEALTHROSTER', hr_weekly_behaviour: 'VERIFY', require_reference_to_pay: false,
          requires_hr: true, no_timesheet_required: false, self_bill_no_invoices_sent: false
        }, has_e_history: false
      };
      if (pathname === `/api/weekly-source/v1/settings/clients/${CLIENT_ID}`) return {
        eligible: true, client_id: CLIENT_ID, settings_version: 1,
        capabilities: { eligible: true, source_family: 'ROSTER', authority_mode: 'TIMESHEET_AUTHORITY', document_mode: 'INVOICE_EVIDENCE_REQUIRED', self_bill_enabled: false, show_query_settings: false, show_completed_pack: true, show_rate_settings: false, show_source_expenses: false, show_self_bill_correction: false },
        settings: { completed_pack_copy_enabled: false }, source_groups: []
      };
      return undefined;
    }
  });
  await page.waitForFunction(() => typeof (window as any).openClient === 'function');
  await page.evaluate((id) => (window as any).openClient({ id }), CLIENT_ID);
  await expect(page.locator('#modalTitle')).toHaveText('View Client');
  await page.locator('#btnEditModal').click();
  await page.getByRole('tab', { name: 'Client settings' }).click();
  await page.getByRole('tab', { name: 'Invoicing', exact: true }).click();
  const reference = page.locator('#clientSettingsForm input[name="pay_reference_required"]');
  await expect(reference).not.toBeChecked();
  const referenceChoice = reference.locator('xpath=ancestor::label');
  await expect(referenceChoice).toBeVisible();
  await expect(referenceChoice).toContainText('Reference required before pay');
  await page.locator('#modal').screenshot({ path: testInfo.outputPath('weekly-reference-setting.png') });
  expect(externalRequests(page)).toEqual([]);
});
