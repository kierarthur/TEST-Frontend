"""Offline audit of the complete frozen Health writer and actual Worker mapping.

Reads exact committed Health owners only. No database or connector use.
"""
from pathlib import Path
import hashlib,json,re,subprocess
HERE=Path(__file__).resolve().parent
OFFICE=HERE.parents[3]
BACKEND=OFFICE.parent/'healthroster-install2-14102026'
PIN='ef64f43909db9811efaf1021d19f2fddc4bd44e6'
assert str(OFFICE).lower().startswith('d:\\development\\github\\')
assert str(BACKEND.resolve()).lower().startswith('d:\\development\\github\\')
FILES=['supabase/repeatable/17102026_0113_weekly_source_kept_pay_rekey/07_keep_as_paid_decide.sqlinc',
 'supabase/repeatable/17102026_0113_weekly_source_kept_pay_rekey/04_kept_read_admission.sqlinc',
 'broker/src/weekly-source/kept-pay-command.mjs','broker/src/weekly-source/routes.js']
sha=lambda b:hashlib.sha256(b).hexdigest()
sources=[];values=[]
for file in FILES:
 b=subprocess.check_output(['git','-C',str(BACKEND),'show',PIN+':'+file])
 saved=(BACKEND/file).read_bytes()
 assert saved.replace(b'\r\n',b'\n')==b.replace(b'\r\n',b'\n'),(file,'actual root owner differs from frozen source')
 sources.append({'commit':PIN,'file':file,'gitSha256':sha(b),'savedSha256':sha(saved)})
 values.append(b.decode())
sql,admit,worker,routes=values
lookups=[m.start() for m in re.finditer('select audit.\\* into v_audit',sql)]
replays=[m.start() for m in re.finditer("return v_audit.after_json->'result'",sql)]
assert len(lookups)==len(replays)==2
assert sql.index('private.weekly_source_pay_actor_allowed_v1')<lookups[0]
assert sql.index('private.weekly_source_kept_as_paid_read_admit_v1')<lookups[0]
for token in ["weekly-source-kept-as-paid-request:","weekly-source-kept-as-paid-event:"]:
 assert lookups[0]<sql.index(token)<lookups[1]
assert replays[1]<sql.index('insert into public.weekly_source_kept_as_paid_decisions')
native_map=dict((code,(state,int(status))) for code,state,status in
 re.findall(r"(WEEKLY_SOURCE_[A-Z_]+):\['([0-9A-Z]+)',([0-9]+)\]",worker))
assert len(native_map)==9
post={name for name in native_map if name in {
 'WEEKLY_SOURCE_KEEP_AS_PAID_FACTS_CHANGED','WEEKLY_SOURCE_KEEP_AS_PAID_SCOPE_CHANGED',
 'WEEKLY_SOURCE_KEEP_AS_PAID_NOT_ELIGIBLE'}}
assert len(post)==3
rows=[]
for code,(state,status) in native_map.items():
 positions=[m.start() for m in re.finditer("raise exception '"+code+"'",sql)]
 if code in post:
  assert len(positions)==1 and replays[1]<positions[0]<sql.index('insert into public.weekly_source_kept_as_paid_decisions')
  assert status==409
  stage='AFTER_BOTH_EXACT_REPLAY_LOOKUPS_UNDER_REQUEST_EVENT_LOCKS'
  disposition='CLEAR_ONLY_MATCHING_JOURNAL_REQUIRE_FRESH_FACTS'
 else:
  stage='PRE_REPLAY_OR_COLLISION_NO_PRIOR_NONCOMMIT_PROOF'
  disposition='RETAIN_EXACT_ORIGINAL_JOURNAL_UNRESOLVED'
  if code in {'WEEKLY_SOURCE_PAYMENT_AUTHORISER_REQUIRED','WEEKLY_SOURCE_KEEP_AS_PAID_REQUEST_INVALID'}:
   assert positions and max(positions)<lookups[0]
 rows.append({'code':code,'sqlstate':state,'httpStatus':status,'stage':stage,'disposition':disposition})
assert "error?.fn==='weekly_source_keep_as_paid_decide_atomic_v1'" in worker
assert 'row[0]===error.json.code' in worker
assert "keptPayFailure(error);fail(refusal.code" in routes
assert routes.index('const user = await requireOfficeUser')<routes.index("if (req.method === 'POST' && path === `${officePrefix}/commands`)")
assert "fail('PAYMENT_PERMISSION_REQUIRED'" in routes and "fail('WEEKLY_SOURCE_AUTHENTICATION_REQUIRED'" in routes
assert "private.weekly_source_office_authority_v1(p_actor_user_id,'VIEW_PAY_WORK'" in admit
controller=(OFFICE/'js/weekly-source/kept-as-paid-controls.js').read_bytes()
clear_block=controller.decode().split('const postReplayRefusals={',1)[1].split('};',1)[0]
assert set(re.findall(r'(WEEKLY_SOURCE_[A-Z_]+):409',clear_block))==post
result={'scope':'COMPLETE_FROZEN_HEALTH_NATIVE_WRITER_AND_ACTUAL_WORKER_OFFLINE_SOURCE_ONLY',
 'sources':sources,'controllerSha256':sha(controller),'nativeRefusals':rows,
 'outerWorkerCurrentAuth':['WEEKLY_SOURCE_AUTHENTICATION_REQUIRED','PAYMENT_PERMISSION_REQUIRED','WEEKLY_SOURCE_OFFICE_ADMIN_REQUIRED'],
 'otherResponses':'Retain exact original journal, including 401/403, dependency/transport/decoder errors, malformed replies and unknown codes/status pairs.',
 'priorCommitRule':'Current-attempt refusal or rollback alone does not prove an earlier attempt did not commit. Only matching exact ACK or the three source-proved post-replay noncommit refusals permit clearing.',
 'checksPassed':True,'nativeApiJoin':'NOT_RUN'}
(HERE/'REFUSAL_AUDIT.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())
print('Complete native/Worker refusal-order audit PASS; 9 finite mappings, 3 post-replay clearable, all other outcomes retain original journal.')
