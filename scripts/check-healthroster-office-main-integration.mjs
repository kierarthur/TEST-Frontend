// Source-only check of a current Office merge and its exact incoming archive.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const [baseline, backend] = process.argv.slice(2);
if (!baseline || !backend || !path.isAbsolute(baseline) || !path.isAbsolute(backend)) {
  throw Error('EXPLICIT_BASELINE_AND_BACKEND_PATHS_REQUIRED');
}
const root = process.cwd(), env = {};
for (const name of ['SystemRoot','WINDIR','TEMP','TMP','PATH','PATHEXT','COMSPEC']) {
  if (process.env[name]) env[name] = process.env[name];
}
env.CLOUDTMS_TEST_BACKEND_SOURCE_ROOT = fs.realpathSync(backend);
const backendCommit = execFileSync('git',['-c','maintenance.auto=false','-c','gc.auto=0','rev-parse','HEAD'],{cwd:backend,encoding:'utf8'}).trim();
const selector = /^(weekly-source-|healthroster-|bpay-next-office|bpay-next-payment-history|modal-modernisation-policy).*\.test\.cjs$/;
function check(cwd) {
  const files = fs.readdirSync(path.join(cwd,'tests/unit')).filter(name=>selector.test(name)).sort().map(name=>'tests/unit/'+name);
  const result = spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{cwd,env,encoding:'utf8',maxBuffer:20_000_000});
  const output = (result.stdout??'')+(result.stderr??'');
  const lines = output.split(/\r?\n/);
  return {files, exitCode:result.status, outputSha256:createHash('sha256').update(output).digest('hex'),
    summary:lines.filter(line=>/^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line)),
    failures:lines.filter(line=>/^not ok \d+ - /.test(line)).map(line=>line.replace(/^not ok \d+ - /,''))};
}
const prior = JSON.parse(fs.readFileSync('docs/healthroster-build/OFFICE_MAIN_INTEGRATION_14102026.json','utf8'));
const incoming = check(baseline), composed = check(root);
const incomingFailures = new Set(incoming.failures);
const introducedFailures = composed.failures.filter(name=>!incomingFailures.has(name));
const receipt = {sourceOnly:true,featureInputCommit:'1b7dff8c6312f711cceac628bb195a61a5e5f8b7',
  incomingMainCommit:'413cea9b35975c6ccac0b084327ef109b05c1c48',backendSourcePath:env.CLOUDTMS_TEST_BACKEND_SOURCE_ROOT,
  backendSourceCommit:backendCommit,baselineArchivePath:baseline,testOnlyBaselineBindingChanges:2,
  initialHeldCheck:prior.initialHeldCheck??prior,incoming,composed,introducedFailures,
  status:composed.exitCode===0?'SOURCE_CHECKS_PASS':introducedFailures.length?'MERGE_CHECKS_HELD':'BASELINE_FAILURES_RETAINED_NO_NEW_FAILURES',
  noOtherBuildSourceRead:true,noHostedCallOrPublication:true};
fs.writeFileSync('docs/healthroster-build/OFFICE_MAIN_INTEGRATION_14102026.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,incoming:incoming.summary,composed:composed.summary,
  baselineFailures:incoming.failures,introducedFailures},null,2));
process.exitCode = introducedFailures.length?1:0;
