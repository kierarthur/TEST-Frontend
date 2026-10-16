import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from 'playwright';

// Full saved modal enhancer in a real browser DOM. No app/network/data action.
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});
  const external=[];
  await page.route('**/*',route=>{external.push(route.request().url());return route.abort();});
  await page.setContent(`<!doctype html><html><body><div id="modalBack" style="display:block"><section id="modal">
   <header><h2 id="modalTitle">Timesheet</h2></header><main id="modalBody"><form id="referenceFixture">
    <label for="reference">Reference</label><input class="mini" id="reference" name="reference" value="HR_0007">
    <label for="note">Note</label><textarea class="hint" id="note"></textarea>
    <label for="choice">Choice</label><select class="mini" id="choice"><option value="UNPROCESSED">Unprocessed</option></select>
    <span class="mini" id="emptyHint"></span><span class="hint" id="controlWrapper"><input id="nestedControl"></span>
   </form></main></section></div></body></html>`);
  await page.evaluate(()=>{
   window.__getModalFrame=()=>({kind:'record',entity:'timesheets',currentTabKey:'main',mode:'edit'});
   window.originalReference=document.getElementById('reference');
   window.originalNote=document.getElementById('note');
   window.originalChoice=document.getElementById('choice');
   window.referenceChanges=0;
   window.originalReference.addEventListener('input',()=>window.referenceChanges++);
  });
  await page.addScriptTag({path:path.resolve('js/modal-modernisation.js')});
  await page.evaluate(()=>window.__applyCloudTmsModalModernisation());
  assert.equal(await page.locator('#reference').count(),1);
  assert.equal(await page.locator('#note').count(),1);
  assert.equal(await page.locator('#choice option').count(),1);
  assert.equal(await page.locator('#controlWrapper #nestedControl').count(),1);
  assert.equal(await page.locator('#emptyHint').count(),0);
  await page.locator('#reference').fill('HR_0007_CORRECTED');
  await page.locator('#note').fill('Original editable controls retained.');
  await page.evaluate(()=>window.__applyCloudTmsModalModernisation());
  const proof=await page.evaluate(()=>({sameReference:window.originalReference===document.getElementById('reference'),
   sameNote:window.originalNote===document.getElementById('note'),sameChoice:window.originalChoice===document.getElementById('choice'),
   reference:document.getElementById('reference').value,note:document.getElementById('note').value,
   choice:document.getElementById('choice').value,listenerRetained:window.referenceChanges>0}));
  assert.deepEqual(proof,{sameReference:true,sameNote:true,sameChoice:true,reference:'HR_0007_CORRECTED',
   note:'Original editable controls retained.',choice:'UNPROCESSED',listenerRetained:true});
  assert.equal(external.length,0);
  results.push({viewport,...proof,external_requests:external.length});
  await page.close();
 }
}finally{await browser.close();}
console.log(JSON.stringify({scope:'LOCAL_SAVED_ENHANCER_REAL_DOM_ONLY_NOT_INSTALLED_ACCEPTANCE',results},null,2));
