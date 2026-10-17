"""Freeze finite complete0840 parent reversals; no native or external operation."""
from pathlib import Path
import json,hashlib,difflib,subprocess,re
here=Path(__file__).resolve().parent
repo=here.parents[3]
assert str(repo).replace('\\','/').startswith('D:/Development/GitHub/')
sha=lambda b:hashlib.sha256(b).hexdigest()
base='0840c9b0cf53d4f0152c83f0a34bca96ad3345da'
assets=['css/paid-match.css','js/weekly-source/paid-match-contract.js','js/weekly-source/paid-match-controls.js']
parents=['js/weekly-source/workspace-actions.js','js/weekly-source/import-workspace.js','index.html','tests/helpers/kept-office-parent-reverse.mjs']
index=(repo/'index.html').read_bytes().decode('utf-8')
for f in assets:
    index,n=re.subn(r'(\./'+re.escape(f)+r'\?v=)[0-9a-f]{64}',lambda m:m[1]+sha((repo/f).read_bytes()),index)
    assert n==1,f
for f in parents[:2]:
    index,n=re.subn(r'(<script src="\./'+re.escape(f)+r'\?[^"\n]*&kept-as-paid=)[0-9a-f]{64}',lambda m:m[1]+sha((repo/f).read_bytes()),index)
    assert n==1,f
(repo/'index.html').write_bytes(index.encode('utf-8'))
edits=[]
for f in parents:
    before=(here/'inputs'/f.replace('/','__')).read_bytes()
    git=subprocess.check_output(['git','-c','gc.auto=0','-c','maintenance.auto=false','show',base+':'+f],cwd=repo)
    assert before.replace(b'\r\n',b'\n')==git.replace(b'\r\n',b'\n'),f
    after=(repo/f).read_bytes()
    a=before.decode('utf-8').splitlines(keepends=True);b=after.decode('utf-8').splitlines(keepends=True)
    hunks=[]
    for group in difflib.SequenceMatcher(a=a,b=b,autojunk=False).get_grouped_opcodes(3):
        i,j=group[0][1],group[0][3];i2,j2=group[-1][2],group[-1][4]
        hunks.append(dict(oldStartLine=i+1,newStartLine=j+1,oldLineCount=i2-i,newLineCount=j2-j,before=''.join(a[i:i2]),after=''.join(b[j:j2])))
    assert hunks
    reverse=b[:]
    for h in reversed(hunks):
        i=h['newStartLine']-1
        assert ''.join(reverse[i:i+h['newLineCount']])==h['after']
        reverse[i:i+h['newLineCount']]=h['before'].splitlines(keepends=True)
    assert ''.join(reverse).encode('utf-8')==before
    edits.append(dict(target=f,inputSha256=sha(before),inputGitSha256=sha(git),inputCanonicalSha256=sha(before.replace(b'\r\n',b'\n')),outputSha256=sha(after),outputCanonicalSha256=sha(after.replace(b'\r\n',b'\n')),canonicalGitAllowed=before!=git or (f=='index.html' and b'\r\n' in before),hunks=hunks))
    out=here/'payload'/f;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(after)
protected=['js/main.js','BANKING_PAY_BIBLE.md','js/weekly-source/kept-as-paid-controls.js','js/weekly-source/kept-as-paid-contract.js','js/weekly-source-presentation-v1.js','js/timesheet-correction-entry-v1.js','js/timesheet-correction-host-v3.js','js/weekly-source/contact-pause-controls.js','js/weekly-source/contact-manual-enquiry-controls.mjs']
protected_hashes={}
for f in protected:
    actual=(repo/f).read_bytes();old=subprocess.check_output(['git','-c','gc.auto=0','-c','maintenance.auto=false','show',base+':'+f],cwd=repo)
    assert actual.replace(b'\r\n',b'\n')==old.replace(b'\r\n',b'\n'),f
    protected_hashes[f]={'savedSha256':sha(actual),'gitSha256':sha(old),'onlyCompleteCRLFLFTranslation':actual!=old}
manifest=dict(base=base,alternateCompleteCheckoutForms=['LF','COMPLETE_CRLF'],edits=edits,protectedUnchanged=protected_hashes,mainAndBibleUnchanged=True,sourceOnly=True,native='NOT_RUN',API='NOT_RUN')
raw=(json.dumps(manifest,indent=2)+'\n').encode('utf-8');(here/'PARENT_EDITS.json').write_bytes(raw)
helper="""import fs from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex');
const bytes=fs.readFileSync('docs/healthroster-build/proposals/paid-overlap-office-20261017/PARENT_EDITS.json');
assert.equal(hash(bytes.toString().replaceAll('\\r\\n','\\n')),'MANIFEST_HASH');
export const paidMatchParents=JSON.parse(bytes);
export function reversePaidMatchParent(file,value){
 const edit=paidMatchParents.edits.find(e=>e.target===file);if(!edit)return value;
 const raw=hash(value)===edit.outputSha256;
 if(!raw){const lf=value.replaceAll('\\r\\n','\\n');assert(value===lf||value===lf.replaceAll('\\n','\\r\\n'),'Only exact complete LF/CRLF checkout forms are permitted');value=lf;assert.equal(hash(value),edit.outputCanonicalSha256);}
 const lines=value.match(/[^\\n]*\\n|[^\\n]+$/g)||[];
 for(const h of [...edit.hunks].reverse()){
  const at=h.newStartLine-1,after=raw?h.after:h.after.replaceAll('\\r\\n','\\n'),before=raw?h.before:h.before.replaceAll('\\r\\n','\\n');
  assert.equal(lines.slice(at,at+h.newLineCount).join(''),after);lines.splice(at,h.newLineCount,...(before.match(/[^\\n]*\\n|[^\\n]+$/g)||[]));
 }
 value=lines.join('');assert.equal(hash(value),raw?edit.inputSha256:edit.inputCanonicalSha256);return value;
}
""".replace('MANIFEST_HASH',sha(raw))
(repo/'tests/helpers/paid-match-office-parent-reverse.mjs').write_bytes(helper.encode('utf-8'))
for f in assets:
    out=here/'payload'/f;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes((repo/f).read_bytes())
print(json.dumps(dict(parents=len(edits),hunks=sum(len(e['hunks'])for e in edits),manifestSha256=sha(raw),protected=len(protected_hashes),native='NOT_RUN')))
