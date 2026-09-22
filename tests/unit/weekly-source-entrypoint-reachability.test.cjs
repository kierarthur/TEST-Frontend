const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const root = resolve(__dirname, '../..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');

const html = read('index.html');
const main = read('js/main.js');
const legacyReview = read('js/import-review-v1.js');
const workspace = read('js/weekly-source/import-workspace.js');
const workspaceActions = read('js/weekly-source/workspace-actions.js');
const settings = read('js/weekly-source/settings.js');
const notifications = read('js/weekly-source/office-notifications.js');

test('the public Imports route reaches Weekly Source and the legacy review cannot replace it', () => {
  assert.match(main, /async function openImportsModal\(\) \{\s*if \(window\.CloudTMSWeeklySourceImportWorkspaceV1\?\.open\) \{\s*return window\.CloudTMSWeeklySourceImportWorkspaceV1\.open\(\)/);
  assert.doesNotMatch(legacyReview, /global\.openImportsModal\s*=\s*openImportsModalV1/);
  assert.match(legacyReview, /global\.CloudTmsImportReviewV1\s*=\s*Object\.freeze\([\s\S]*openImportsModal:\s*openImportsModalV1/);
  assert.match(workspaceActions, /root\.CloudTmsImportReviewV1\?\.openImportsModal[\s\S]*root\.CloudTmsImportReviewV1\.openImportsModal\(\)/);
});

test('all Weekly Source modules receive the canonical backend API route after load', () => {
  assert.match(main, /const API = \(path\) => `\$\{BROKER_BASE_URL\}\$\{path\}`;\s*\/\/[\s\S]*window\.API = API;/);
  assert.match(main, /window\.authFetch\s*=\s*authFetch/);
  for (const source of [workspace, settings, notifications]) {
    assert.match(source, /(?:root|global)\.API/);
  }
  assert.match(workspace, /ENDPOINTS\.workspace/);
  assert.match(workspace, /ENDPOINTS\.preview/);
  assert.match(workspace, /ENDPOINTS\.accept/);
  assert.match(workspace, /ENDPOINTS\.command/);
});

test('load order and bridges keep new and established import journeys reachable', () => {
  const workspaceIndex = html.indexOf('./js/weekly-source/import-workspace.js');
  const notificationIndex = html.indexOf('./js/weekly-source/office-notifications.js');
  const actionIndex = html.indexOf('./js/weekly-source/workspace-actions.js');
  const settingsIndex = html.indexOf('./js/weekly-source/settings.js');
  const mainIndex = html.indexOf('./js/main.js');
  const legacyIndex = html.indexOf('./js/import-review-v1.js');
  assert.ok(workspaceIndex > 0);
  assert.ok(notificationIndex > workspaceIndex);
  assert.ok(actionIndex > notificationIndex);
  assert.ok(settingsIndex > actionIndex);
  assert.ok(mainIndex > settingsIndex);
  assert.ok(legacyIndex > mainIndex);
  assert.match(workspace, /data-ws-upload/);
  assert.match(workspace, /data-ws-daily/);
  assert.match(workspace, /root\.handleHrRotaFileDrop/);
  assert.match(html, /main\.js[^"']*weekly-source-entry=20260922-r2/);
  assert.match(html, /import-review-v1\.js[^"']*weekly-source-entry=20260922-r1/);
});

test('NHSP Office guidance preserves candidate check-hour submission', () => {
  assert.doesNotMatch(main, /workers do not submit them/);
  assert.match(main, /Candidates may submit their hours for checking\. Finalised NHSP hours remain authoritative\./);
});
