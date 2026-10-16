import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..'),base='045c95cecf2dcbb632c0a5827f19c38548ee3a11';
const hash=x=>createHash('sha256').update(x).digest('hex'),read=f=>fs.readFileSync(path.join(root,f)),git=f=>execFileSync('git',['show',base+':'+f],{cwd:root,maxBuffer:64*1024*1024});
const receipts=[],prior=fs.existsSync(path.join(here,'PARENT_EDITS.json'))?JSON.parse(fs.readFileSync(path.join(here,'PARENT_EDITS.json'))):null;
function amend(file,edits){
 const raw=git(file),saved=read(file);
 if(!raw.equals(saved)){
  const owned=prior?.edits.find(x=>x.file===file);if(!process.argv.includes('--refresh')||!owned||hash(saved)!==owned.afterSha256)throw Error('PARENT_BASELINE_CHANGED '+file);
  let reverse=saved.toString('utf8');for(const edit of [...owned.edits].reverse()){if(reverse.split(edit.after).length!==2)throw Error('PRIOR_REVERSE_MULTIPLICITY');reverse=reverse.replace(edit.after,edit.before);}
  if(!Buffer.from(reverse).equals(raw))throw Error('PRIOR_FULL_REVERSE_FAILED');
 }
 let source=raw.toString('utf8');const newline=source.includes('\r\n')?'\r\n':'\n';
 const mapped=edits.map(([before,after])=>{
  const pattern=before.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replaceAll('\n','\\r?\\n');
  const matches=[...source.matchAll(new RegExp(pattern,'g'))];if(matches.length!==1)throw Error('RAW_ANCHOR_MULTIPLICITY '+file+' '+edits.findIndex(e=>e[0]===before));
  return {before:matches[0][0],after:after.replaceAll('\n',newline)};
 });
 for(const [index,edit] of mapped.entries()){if(source.split(edit.before).length!==2)throw Error('PARENT_ANCHOR_MULTIPLICITY '+file+' '+index+' '+(source.split(edit.before).length-1));source=source.replace(edit.before,edit.after);}
 let reverse=source;for(const edit of [...mapped].reverse()){if(reverse.split(edit.after).length!==2)throw Error('PARENT_REVERSE_MULTIPLICITY');reverse=reverse.replace(edit.after,edit.before);}
 if(!Buffer.from(reverse).equals(raw))throw Error('PARENT_FULL_REVERSE_FAILED');
 fs.writeFileSync(path.join(root,file),source);receipts.push({file,beforeSha256:hash(raw),afterSha256:hash(Buffer.from(source)),edits:mapped,fullRawReverseEqual:true});
}
const helpers=fs.readFileSync(path.join(here,'host-functions.jsinc'),'utf8').trimEnd();
const originalMain=git('js/main.js').toString('utf8'),refreshStart=originalMain.indexOf('async function refreshTimesheetModalAfterLifecycleAction('),refreshEnd=originalMain.indexOf('function resolveContractWeekScheduleForModal(',refreshStart);
if(refreshStart<0||refreshEnd<refreshStart)throw Error('NATIVE_REFRESH_BOUNDARY');
const refreshBefore=originalMain.slice(refreshStart,refreshEnd).replaceAll('\r\n','\n');
const tokenCheck='if (!isActiveTimesheetModalToken(openToken)) return false;';
if(refreshBefore.split(tokenCheck).length!==9)throw Error('NATIVE_REFRESH_CHECKPOINT_COUNT');
const refreshAfter=refreshBefore.replace('async function refreshTimesheetModalAfterLifecycleAction(openToken, opts = {}) {',`async function refreshTimesheetModalAfterLifecycleAction(openToken, opts = {}) {\n  const isCurrentCaller = () => {\n    try { return isActiveTimesheetModalToken(openToken) && (typeof opts?.callerCurrent !== 'function' || opts.callerCurrent() === true); }\n    catch { return false; }\n  };`).replaceAll(tokenCheck,'if (!isCurrentCaller()) return false;');
amend('js/main.js',[
 ['async function openTimesheet(row) {',helpers+'\n\nasync function openTimesheet(row) {'],
 ["  const routeActionsRowHtml = (suppressActionButtons || openingDetailsPending || (!actionsHtml && !candidateActionsHtml))", "  const healthCorrectionMoreHtml = (typeof renderHealthTimesheetCorrectionMore === 'function') ? renderHealthTimesheetCorrectionMore() : '';\n  const routeActionsRowHtml = (suppressActionButtons || openingDetailsPending || (!actionsHtml && !candidateActionsHtml && !healthCorrectionMoreHtml))"],
 ['          ${actionsHtml}\n          ${candidateActionsHtml}', '          ${actionsHtml}\n          ${candidateActionsHtml}\n          ${healthCorrectionMoreHtml}'],
 ['    if (top._confirmingDiscard || top._closing) return;\n\n    if (top.kind === \'bpay-next-read\'', "    if (top._confirmingDiscard || top._closing) return;\n    if (window.CloudTMSHealthCorrectionHostV3?.requestOverlayClose(top, 'parent-close')) return;\n\n    if (top.kind === 'bpay-next-read'"],
 ["      if (currentFrame() !== top) return;\n      if (e.key === 'Escape') {", "      if (currentFrame() !== top) return;\n      if (['Escape','Tab'].includes(e.key) && window.CloudTMSHealthCorrectionHostV3?.activeOverlay(top)) return;\n      if (e.key === 'Escape') {"],
 ['function closeModal(){\n',"function closeModal(){\n  if (window.CloudTMSHealthCorrectionHostV3?.requestOverlayClose(window.__modalStack?.at(-1), 'direct-close')) return;\n"],
 ["if (timesheetTabLifecycleGuard && typeof timesheetTabLifecycleGuard.enforceCurrentPermissionState === 'function') timesheetTabLifecycleGuard.enforceCurrentPermissionState();", "if (timesheetTabLifecycleGuard && typeof timesheetTabLifecycleGuard.enforceCurrentPermissionState === 'function') timesheetTabLifecycleGuard.enforceCurrentPermissionState();\nif (typeof wireHealthTimesheetCorrectionHost === 'function') wireHealthTimesheetCorrectionHost(this);"],
 [refreshBefore,refreshAfter]
]);
const modules=['js/correction-contract-v3.js','js/timesheet-correction-host-v3.js','js/daily-rate-correction-http-adapter.js','js/daily-rate-correction.js'];
const loaders=modules.map(file=>`<script src="./${file}?v=${hash(read(file))}"></script>`).join('\n');
amend('index.html',[
 ['  <link rel="stylesheet" href="./css/timesheet-nhsp-lines.css"/>',`  <link rel="stylesheet" href="./css/timesheet-nhsp-lines.css"/>\n  <link rel="stylesheet" href="./css/daily-rate-correction.css?v=${hash(read('css/daily-rate-correction.css'))}"/>`],
 ['<script src="./js/main.js?v=20261012-sp10-r1&healthroster=20261014-checklist-r4"></script>',loaders+'\n<script src="./js/main.js?v=20261012-sp10-r1&healthroster=20261014-checklist-r4&correction-host='+hash(read('js/main.js'))+'"></script>']
]);
fs.writeFileSync(path.join(here,'PARENT_EDITS.json'),JSON.stringify({version:'HEALTH_B051_OFFICE_PARENT_EDITS_V1',base,edits:receipts,bankModuleLoader:'WITHHELD_NO_REVIEWED_COMPONENT_BYTES',nativeMoveCapability:'WITHHELD_NO_DECLARED_PUBLIC_PROJECTION',native:'NOT_RUN'},null,2)+'\n');
console.log(JSON.stringify(receipts.map(({file,beforeSha256,afterSha256,edits})=>({file,beforeSha256,afterSha256,edits:edits.length,reverse:true}))));
