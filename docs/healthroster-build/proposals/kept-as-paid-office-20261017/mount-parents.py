"""One-time finite Health parent mount; refuses every pre-existing drift."""
from pathlib import Path
import hashlib,json,subprocess
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3];BASE='6d3d7210ac02fa2d1741f20e52461eaa75158350'
def sha(b):return hashlib.sha256(b).hexdigest()
def frozen(file):return subprocess.check_output(['git','-C',str(ROOT),'show',BASE+':'+file])
changes={};values={};saved={}
def edit(file,before,after):
 if file not in values:
  raw=(ROOT/file).read_bytes();assert raw.replace(b'\r\n',b'\n')==frozen(file).replace(b'\r\n',b'\n'),file;saved[file]=raw;values[file]=raw.decode();changes[file]={'target':file,'inputSha256':sha(raw),'inputCanonicalSha256':sha(raw.replace(b'\r\n',b'\n')),'gitInputSha256':sha(frozen(file)),'hunks':[]}
 # Preserve the actual file's established line endings and every other byte.
 value=values[file];ending='\r\n' if '\r\n' in value else '\n';before=before.replace('\n',ending);after=after.replace('\n',ending)
 assert value.count(before)==1,(file,before[:100]);values[file]=value.replace(before,after);changes[file]['hunks'].append({'before':before,'after':after})
actions='js/weekly-source/workspace-actions.js';workspace='js/weekly-source/import-workspace.js';presentation='js/weekly-source-presentation-v1.js'
edit(actions,'  const contactControllersByParent=new WeakMap();',(HERE/'keep-host.jsinc').read_text()+'\n  const contactControllersByParent=new WeakMap();')
edit(actions,'openPreview, openBatchPreview, openContactControls,','openPreview, openBatchPreview, openKeepAsPaid, openContactControls,')
edit(workspace,'      combined_source_workspace: source.combined_source_workspace === true,','      kept_as_paid_contexts: Array.isArray(source.kept_as_paid_contexts) ? source.kept_as_paid_contexts : [],\n      combined_source_workspace: source.combined_source_workspace === true,')
edit(workspace,'    const notices = workspace.notices.map',"    const kept = ['queries','finalise'].includes(tab) ? root.CloudTMSKeptAsPaidV1?.renderRows(workspace.kept_as_paid_contexts,'SOURCE_WORKSPACE') || '' : '';\n    const notices = workspace.notices.map")
edit(workspace,"${returnLink}${nextPayNotice}${error}${tab==='imports'?renderImports", "${returnLink}${nextPayNotice}${error}${kept}${tab==='imports'?renderImports")
edit(workspace,'${nextPayNotice}${notices}${error}${body}</div>`;','${nextPayNotice}${notices}${error}${kept}${body}</div>`;')
edit(workspace,'    captureContactContext: () => {',"""    keepAsPaidRequest: options => {
      if(typeof root.authFetch!=='function')throw new Error('Current authenticated Office access is required.');
      return root.authFetch(endpoint(ENDPOINTS.command),options);
    },
    captureKeepContext: () => {
      const frame=currentFrame(),generation=session.openGeneration,current=session.openCurrent,tab=session.activeTab;
      const scope=()=>JSON.stringify({tab:session.activeTab,selected:session.workspace?.selected,
        filters:Object.entries(session.sourceFilters).sort(([a],[b])=>a.localeCompare(b))});
      const captured=scope();
      return {key:'SOURCE:'+captured,current:()=>!!frame&&(root.__modalStack||[]).includes(frame)
        &&generation===session.openGeneration&&tab===session.activeTab&&session.openCurrent===current&&scope()===captured&&current?.()===true};
    },
    captureContactContext: () => {""")
edit(presentation,'      record_version: recordVersion,','      kept_as_paid_contexts: Array.isArray(presentation.kept_as_paid_contexts) ? presentation.kept_as_paid_contexts : [],\n      record_version: recordVersion,')
edit(presentation,"if (vm.lifecycle_ok !== true) return renderNextInformation(vm, { surface: 'SIMPLE_TIMESHEET' }) || renderLifecycleError(vm);","if (vm.lifecycle_ok !== true) return (globalThis.CloudTMSKeptAsPaidV1?.renderRows(vm.kept_as_paid_contexts,'SIMPLE_TIMESHEET') || '') + (renderNextInformation(vm, { surface: 'SIMPLE_TIMESHEET' }) || renderLifecycleError(vm));")
edit(presentation,'        ${protectedMarkup}\n        ${renderPrimaryLifecycleBlock',"        ${globalThis.CloudTMSKeptAsPaidV1?.renderRows(vm.kept_as_paid_contexts,'SIMPLE_TIMESHEET') || ''}\n        ${protectedMarkup}\n        ${renderPrimaryLifecycleBlock")
index='index.html';original=frozen(index).decode()
css=next(line for line in original.splitlines() if 'href="./css/weekly-source.css?' in line)
edit(index,css,css+'\n  <link rel="stylesheet" href="./css/kept-as-paid.css?v='+sha((ROOT/'css/kept-as-paid.css').read_bytes())+'"/>')
for file in [presentation,workspace,actions]:
 old=next(line for line in original.splitlines() if './'+file+'?v=' in line)
 new=old.replace('"></script>','&kept-as-paid='+sha(values[file].encode())+'"></script>')
 if file==presentation:
  new='\n'.join('<script src="./'+f+'?v='+sha((ROOT/f).read_bytes())+'"></script>'for f in ['js/weekly-source/kept-as-paid-contract.js','js/weekly-source/kept-as-paid-controls.js'])+'\n'+new
 edit(index,old,new)
for file,value in values.items():
 result=value
 for h in reversed(changes[file]['hunks']):assert result.count(h['after'])==1;result=result.replace(h['after'],h['before'])
 assert result.encode()==saved[file];changes[file]['outputSha256']=sha(value.encode());changes[file]['outputCanonicalSha256']=sha(value.replace('\r\n','\n').encode())
for file,value in values.items():(ROOT/file).write_bytes(value.encode())
receipt={'version':'HEALTH_KEEP_OFFICE_FINITE_PARENTS_V1','base':BASE,'edits':list(changes.values()),'mainUnchangedSha256':sha((ROOT/'js/main.js').read_bytes()),'native':'NOT_RUN'}
(HERE/'PARENT_EDITS.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print('Mounted',len(changes),'complete parents; all reverse byte-for-byte')
