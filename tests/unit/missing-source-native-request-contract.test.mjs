import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { missingAcceptContextRequest, missingAcceptPrepareRequest } from '../../docs/healthroster-build/proposals/missing-source-office-current-consumer-20261017/reference/health-missing-accept.mjs';
const require = createRequire(import.meta.url), presentation = require('../../js/weekly-source-presentation-v1.js');
const id = n => '10000000-0000-0000-0000-' + String(n).padStart(12, '0'), hash = 'a'.repeat(64);
const context = { schema_version:'WEEKLY_SOURCE_MISSING_ACCEPT_CONTEXT_V1',work_event_id:id(1),root_timesheet_id:id(2),projection_publication_id:id(3) };
const prepare = { schema_version:'WEEKLY_SOURCE_MISSING_ACCEPT_PREPARE_V1',work_event_id:id(1),root_timesheet_id:id(2),projection_publication_id:id(3),expected_root_version:'9223372036854775807',expected_facts_fingerprint:hash,expected_inventory_digest:hash,idempotency_key:id(4) };
test('complete captured current Worker request owner accepts exact browser fields and injects only its real actor', () => {
  const root = { module:{exports:{}} }; vm.runInNewContext(fs.readFileSync('js/weekly-source/missing-source-review.js','utf8'),root);
  assert.equal(JSON.stringify(root.CloudTMSMissingSourceReviewV1.validatePrepare(prepare)),JSON.stringify(prepare));
  assert.deepEqual(missingAcceptPrepareRequest(prepare,id(5)),{...prepare,actor_user_id:id(5)});
  assert.deepEqual(missingAcceptContextRequest(context,id(5)),{...context,actor_user_id:id(5)});
  for (const extra of ['actor_user_id','before_components','after_components','decision_bundle_id','publish_permission']) {
    assert.throws(()=>missingAcceptPrepareRequest({...prepare,[extra]:id(99)},id(5)));
    assert.throws(()=>root.CloudTMSMissingSourceReviewV1.validatePrepare({...prepare,[extra]:id(99)}));
  }
  for(const value of [9007199254740992,'01','0','9223372036854775808'])assert.throws(()=>missingAcceptPrepareRequest({...prepare,expected_root_version:value},id(5)));
});
test('safe historical numeric Later replies compare losslessly while original retained request bytes remain their own type', () => {
  const p={decision:'APPROVE_UPDATED_HOURS',decision_bundle_id:id(1),bundle_revision:3};
  const bytes=JSON.stringify({action:'LATER_CHANGE_DECISION',payload:p}),old=JSON.parse(bytes);
  const reply={ok:true,idempotent_replay:true,decision:p.decision,decision_bundle_id:p.decision_bundle_id,retained:false,published:true,reviewed_bundle_revision:3,bundle_revision:4};
  assert(presentation.isLaterChangeDecisionResult(reply,old.payload));
  assert(presentation.isLaterChangeDecisionResult({...reply,reviewed_bundle_revision:'3',bundle_revision:'4'},old.payload));
  assert.equal(JSON.stringify(old),bytes);assert.equal(typeof old.payload.bundle_revision,'number');
  assert.notEqual(JSON.stringify({...old,payload:{...old.payload,bundle_revision:'3'}}),bytes);
  for(const v of [3,'3',5,'5',9007199254740992])assert(!presentation.isLaterChangeDecisionResult({...reply,bundle_revision:v},old.payload));
});
