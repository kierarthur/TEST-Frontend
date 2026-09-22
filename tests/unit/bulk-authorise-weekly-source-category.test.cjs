const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '../../js/main.js'), 'utf8');
const extract = (name) => {
  const source = main.match(new RegExp('function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}'))?.[0];
  assert.ok(source, `missing ${name}`);
  return source;
};

const derive = vm.runInNewContext(
  `${extract('normaliseBulkAuthoriseWeeklySourceCategory')}\n${extract('deriveBulkAuthoriseWeeklySourceCategory')}\nderiveBulkAuthoriseWeeklySourceCategory`,
  { String, Array, Object }
);

test('real Bulk DTOs derive the four user-facing queues without a presentation-only category field', () => {
  assert.equal(derive({ bulk_authorise_classification: 'NHSP', route_subfamily: 'NHSP' }), 'NHSP');
  assert.equal(
    derive({ bulk_authorise_classification: 'HR', route_subfamily: 'HEALTHROSTER_NO_TIMESHEET' }),
    'CLIENT_PROVIDED_HOURS'
  );
  assert.equal(
    derive({ bulk_authorise_classification: 'TIMESHEETS', route_subfamily: 'HEALTHROSTER_TIMESHEET_REQUIRED' }),
    'TIMESHEETS_CHECKED_WITH_CLIENT'
  );
  assert.equal(
    derive({ bulk_authorise_classification: 'TIMESHEETS', route_subfamily: 'ELECTRONIC' }),
    'STANDARD_TIMESHEETS'
  );
});

test('an explicit valid presentation category remains authoritative', () => {
  assert.equal(
    derive({
      weekly_source_category: 'CLIENT_PROVIDED_HOURS',
      bulk_authorise_classification: 'NHSP',
      route_subfamily: 'NHSP'
    }),
    'CLIENT_PROVIDED_HOURS'
  );
});
