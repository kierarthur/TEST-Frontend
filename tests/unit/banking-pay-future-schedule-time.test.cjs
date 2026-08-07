const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'js', 'main.js'), 'utf8');

test('future Banking Pay schedules default to a native 02:00 hour/minute control', () => {
  assert.match(source, /schedule_kind: 'IMMEDIATE',[\s\S]{0,120}time_uk: '02:00'/);
  assert.match(source, /id="payExecTimeUk"[\s\S]{0,220}type="time"[\s\S]{0,220}value="\$\{enc\(state\.time_uk \|\| '02:00'\)\}"[\s\S]{0,220}step="60"/);
  assert.match(source, /Time \(UK, 24-hour\)/);
  assert.match(source, /Seconds are always 00\./);
  assert.doesNotMatch(source, /id="payExecTimeUk"[^>]*type="text"/);
});

test('future schedule parsing accepts colon-delimited 24-hour time without seconds', () => {
  assert.match(source, /const m = s\.match\(\/\^\(\\d\{2\}\):\?\(\\d\{2\}\)\$\//);
  assert.match(source, /if \(hh < 0 \|\| hh > 23 \|\| mm < 0 \|\| mm > 59\) return null/);
  assert.match(source, /Scheduled time is required in 24-hour HH:MM format \(e\.g\. 02:00, 23:11\)\./);
  assert.doesNotMatch(source, /sanitizeTimeDigits/);
});

test('switching to scheduled execution restores the 02:00 default if time is empty', () => {
  assert.match(source, /state\.schedule_kind === 'SCHEDULED' && !parseTimeHm\(state\.time_uk\)\) state\.time_uk = '02:00'/);
});
