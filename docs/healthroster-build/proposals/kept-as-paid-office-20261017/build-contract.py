"""Generate the classic Office adapter from exact genuine Health decoders."""
from pathlib import Path
import hashlib,json,re,subprocess
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
MONEY=ROOT.parent/'healthroster-v2-money-build-13102026'
def frozen(commit,file):return subprocess.check_output(['git','-C',str(MONEY),'show',commit+':'+file])
def sha(b):return hashlib.sha256(b).hexdigest()
cp='docs/healthroster-build/proposals/keep-public-read-utc-calendar-forward-20261017/payload/broker/src/weekly-source/kept-pay-context.mjs'
wp='docs/healthroster-build/proposals/kept-pay-rekey-current-root-successor-20261016/runtime/kept-pay-command.mjs'
context=frozen('4224f7aa21aacf103d5e15fc180d88de2046e22a',cp)
writer=frozen('a34cd60f2c75580a9e37aabfaf26f7dab680cb37',wp)
assert sha(context)=='2c7afe36e931e556624fdd2fba2c2b8379c903941dbd03b88475b255bcbd73dd'
assert sha(writer)=='0460915380ef38aeff9437164ae93562b924712af996d89c8d880456c4d8c273'
def body(data,parser):
 s=data.decode();s=re.sub(r'^import[^\n]*\n','',s)
 s=re.sub(r'^export function '+parser+r'\([^\n]*\n','',s,flags=re.M)
 return re.sub(r'\bexport (?=function )','',s)
c=body(context,'parseKeptPayContextCommand')
w=body(writer.decode().split('export function keptPayFailure')[0].encode(),'parseKeptPayCommand')
output=("// Derived from genuine Health context "+sha(context)+" and writer "+sha(writer)+".\n"
 "(function(root){'use strict';\nconst context=(()=>{\n"+c+"\nreturn {decodeKeptPayContext,validateKeptPayContextCommand};})();\n"
 "const writer=(()=>{\n"+w+"\nreturn {validateKeptPayCommand,decodeKeptPayAcknowledgement};})();\n"
 "const api=Object.freeze({...context,...writer});\nif(typeof module==='object'&&module.exports)module.exports=api;\n"
 "root.CloudTMSKeptAsPaidContractV1=api;\n})(typeof window==='object'?window:globalThis);\n").encode()
(ROOT/'js/weekly-source/kept-as-paid-contract.js').write_bytes(output)
base='docs/healthroster-build/proposals/kept-current-public-read-successor-20261017/'
pins=[]
for name in ['PUBLIC_CONTEXT.schema.json','PUBLIC_CONTEXT_CONTRACT.json']:
 b=frozen('eb0aa9633fa284c088da6e7c12196974619cd48b',base+name);(HERE/name).write_bytes(b)
 pins.append({'commit':'eb0aa9633fa284c088da6e7c12196974619cd48b','file':base+name,'sha256':sha(b)})
pins.extend([{'commit':'4224f7aa21aacf103d5e15fc180d88de2046e22a','file':cp,'sha256':sha(context)},
 {'commit':'a34cd60f2c75580a9e37aabfaf26f7dab680cb37','file':wp,'sha256':sha(writer)}])
(HERE/'CONTRACT_DERIVATION.json').write_text(json.dumps({'inputs':pins,'output':'js/weekly-source/kept-as-paid-contract.js','outputSha256':sha(output),
 'transforms':['Remove sole backend JSON-parser import and its one-line command parser','Writer: retain complete validator/ack decoder and their unchanged helpers; omit unrelated failure/HTTP helpers','Remove ES export keywords and wrap two unchanged decoder scopes in classic namespace'],
 'native':'NOT_RUN'},indent=2)+'\n',encoding='utf-8')
print('Generated exact Health decoders',sha(output))
