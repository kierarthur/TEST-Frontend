from pathlib import Path
import subprocess,re,json,hashlib
here=Path(__file__).resolve().parent;repo=here.parents[3]
backend=repo.parent/'healthroster-v2-money-build-13102026'
pin='9c791fa971c97a198c09c4e3579c01b589486c14'
source='docs/healthroster-build/proposals/same-separate-health-current-successor-20261017/payload/broker/src/weekly-source/same-separate-command.mjs'
def get(c,p):return subprocess.check_output(['git','-c','gc.auto=0','-c','maintenance.auto=false','show',c+':'+p],cwd=backend)
raw=get(pin,source);assert hashlib.sha256(raw).hexdigest()=='b2a67e74a311f3ae43f1f25053a2f5754f68b91df7ac7671b7693187afedd20e'
parent='ef3d20f4513a6f9fd1aa5e4cf6a69d258f6cd87c';dependency='broker/src/weekly-source/push-timing-office.mjs';parser=get(parent,dependency)
m=re.search(r'export function parsePushTimingJson\(text\) \{[\s\S]*?\n\}(?=\nexport async function readPushTimingRequest)',parser.decode('utf-8'));assert m
header="import{parsePushTimingJson}from'./push-timing-office.mjs';\n";s=raw.decode('utf-8');assert s.startswith(header)
s="(function(root){'use strict';\n"+m.group(0).replace('export ','')+'\n'+s[len(header):].replace('export ','')+"\nconst api=Object.freeze({positivePaidCounter,isPaidMatchCommand,validatePaidMatchCommand,parsePaidMatchCommand,decodePaidMatchQuestion,parseJson:parsePushTimingJson});if(typeof module==='object'&&module.exports)module.exports=api;root.CloudTMSPaidMatchContractV1=api;\n})(typeof window==='object'?window:globalThis);\n"
(repo/'js/weekly-source/paid-match-contract.js').write_bytes(s.encode('utf-8'))
meta=dict(backendCommit=pin,backendPath=source,backendSha256=hashlib.sha256(raw).hexdigest(),parserParent=parent,parserPath=dependency,parserPhysicalSha256=hashlib.sha256(parser).hexdigest(),completeParserSha256=hashlib.sha256(m.group(0).encode()).hexdigest(),output='js/weekly-source/paid-match-contract.js',outputSha256=hashlib.sha256(s.encode()).hexdigest(),transforms=['Replace the exact parser import with its genuine complete current pure parser declaration.','Remove ES export keywords only; retain every closed question/choice/request/counter/calendar/clock/identity check.','Add isolated classic export wrapper and expose the same duplicate-key/depth parser at the HTTP boundary.'],OfficeInput='0840c9b0cf53d4f0152c83f0a34bca96ad3345da',correctedBackend='a7e4522cb87ae6961cb40efcb83e4e69b12fbd6c',native='NOT_RUN',API='NOT_RUN')
(here/'CONTRACT_DERIVATION.json').write_bytes((json.dumps(meta,indent=2)+'\n').encode())
print(json.dumps(dict(derived='EXACT_CLOSED_BACKEND_PROTOCOL_AND_COMPLETE_PURE_PARSER',sha256=meta['outputSha256'])))
