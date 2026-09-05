import path from 'node:path';
import { expect, test } from '@playwright/test';

const bootstrapPath = path.resolve(__dirname, '../../js/candidate-office-bootstrap-v1.js');

test('Candidate Submission stays visible through same-user renewal and clears for a different user', async ({ page }) => {
  await page.setContent('<!doctype html><html><body><div id="candidate-status"></div></body></html>');
  await page.evaluate(() => {
    const testWindow = window as any;
    testWindow.__capabilityResolvers = [];
    testWindow.__bridgeEvents = [];
    testWindow.CloudTMSCandidateOfficeApi = {
      fetchOfficeCandidateCapabilities: () => new Promise(resolve => {
        testWindow.__capabilityResolvers.push(resolve);
      })
    };
    testWindow.CloudTMSCandidateOfficeBridge = {
      initialize: (_capabilities: unknown, options: unknown) => {
        testWindow.__bridgeEvents.push({ type: 'initialize', options });
        document.getElementById('candidate-status')!.textContent = 'Candidate Submitted';
      },
      deactivate: () => {
        testWindow.__bridgeEvents.push({ type: 'deactivate' });
        document.getElementById('candidate-status')!.textContent = '';
      }
    };
    testWindow.CloudTMSCandidateOfficeContract = {
      normalizeCandidateOfficeError: (error: any) => ({
        code: error?.code || 'ERROR',
        status: Number(error?.status || 0),
        auth: false
      })
    };
  });
  await page.addScriptTag({ path: bootstrapPath });

  const resolveCapabilities = async (index: number, allowed = true) => page.evaluate(({ index, allowed }) => {
    const testWindow = window as any;
    testWindow.__capabilityResolvers[index]({
      authority_applies: allowed,
      permissions: { view_candidate_state: allowed },
      surfaces: { timesheet_summary: allowed },
      contract_version: `contract-${index}`
    });
  }, { index, allowed });

  await expect.poll(() => page.evaluate(() => (window as any).__capabilityResolvers.length)).toBe(1);
  await resolveCapabilities(0);
  await expect(page.locator('#candidate-status')).toHaveText('Candidate Submitted');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cloudtms:office-session-ready', {
    detail: { same_principal: true }
  })));
  await expect.poll(() => page.evaluate(() => (window as any).__capabilityResolvers.length)).toBe(2);
  await expect(page.locator('#candidate-status')).toHaveText('Candidate Submitted');
  await resolveCapabilities(1);
  await expect(page.locator('#candidate-status')).toHaveText('Candidate Submitted');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cloudtms:office-session-ready', {
    detail: { same_principal: false }
  })));
  await expect.poll(() => page.evaluate(() => (window as any).__capabilityResolvers.length)).toBe(3);
  await expect(page.locator('#candidate-status')).toBeEmpty();
});
