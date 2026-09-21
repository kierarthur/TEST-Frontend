const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'js', 'weekly-source', 'office-notifications.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('Office receives the three approved Weekly Source alert kinds through the authenticated route', () => {
  assert.match(source, /\/api\/weekly-source\/v1\/notifications/);
  for (const kind of [
    'WEEKLY_CANDIDATE_SOURCE_DISPUTED',
    'WEEKLY_MANAGER_SYSTEM_CONFIRMED',
    'WEEKLY_MANAGER_SOURCE_CORRECTED'
  ]) assert.match(source, new RegExp(kind));
  assert.match(html, /js\/weekly-source\/office-notifications\.js/);
});

test('manager responses expose the supplied hours without financial wording', () => {
  for (const key of ['manager_intended_start', 'manager_intended_end', 'manager_intended_break_minutes']) {
    assert.match(source, new RegExp(key));
  }
  assert.match(source, /I have corrected|hours have been corrected|Manager says/);
  assert.doesNotMatch(source, /remittance|gross pay|net pay|invoice value|banking pay/i);
});

test('alerts open the shared Queries workspace and acknowledgement is only mark-read', () => {
  assert.match(source, /WeeklySourceImportWorkspace\?\.open\?\.\('queries'\)/);
  assert.match(source, /ACKNOWLEDGE_NOTICE/);
  assert.match(source, />Mark read</);
  assert.doesNotMatch(source, />Clear</);
});
