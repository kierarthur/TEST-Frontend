// Local-only browser fixture: real Office/modal scripts, synthetic persistence,
// no session/credentials and no external fetch or invitation delivery.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const port = 4179;
const prelude = `<script>
window.BROKER_BASE_URL = 'http://127.0.0.1:${port}';
window.fetch = async () => new Response('{}', {status:401});
</script>`;
const fixture = `<style>.auth-overlay{display:none!important}#fixture-controls{position:fixed;top:0;left:0;z-index:20000;background:#11253c;color:white;padding:8px}#fixture-controls button{margin:4px}</style>
<div id="fixture-controls">LOCAL fixture — no database writes or emails.
<button id="fixture-top">New Contract</button><button id="fixture-nested">Import → New Contract</button>
<button id="fixture-failure">Failed settings save</button><span id="fixture-state">Ready</span></div>
<script>
window.__LOG_MODAL = window.__LOG_CONTRACTS = false;
window.authFetch = async (url, init = {}) => {
  if (init.method && init.method !== 'GET') throw Error('No writes allowed in local fixture');
  return new Response(JSON.stringify({state:'NOT_INVITED',candidate_id:'local-candidate',candidate_display_name:'Local Test Candidate',candidate_email:'fixture@example.test',settings_version:1,action:{code:'INVITE_TO_MYTMS',enabled:true}}),{status:200});
};
// Validation is outside this modal-lifecycle fixture. The production validator
// remains covered separately; only the synthetic save is admitted here.
computeContractSaveEligibility = () => ({ok:true});
function fixtureOpen(nested, fail) {
  discardAllModalsAndState();
  if (nested) {
    window.modalCtx = {entity:'weekly-source-workspace',data:{}};
    showModal('Local import chooser',[{key:'main',label:'Choose contract'}],()=>'<p>Explicit Choose contract remains required.</p>',null,true,null,{kind:'weekly-source-workspace',noParentGate:true,showSave:false});
  }
  const ctx = {entity:'contracts',openToken:'local-new',data:{candidate_id:'local-candidate',client_id:'local-client',role:'Local test',is_ad_hoc:true},formState:{__forId:'local-new',main:{},pay:{}}};
  window.modalCtx = ctx;
  showModal('Create Contract',[{key:'main',label:'Main'},{key:'rates',label:'Rates'}],(key)=>key==='main'?'<div id="contractForm"><h2>Local Test Candidate · Local Test Client</h2><label>Display site<input name="display_site" value=""></label><p>Synthetic save only; no TEST business data is created.</p></div>':'<p>Local rate tab</p>',async()=>{
    if (fail) return false;
    return {ok:true,saved:{...ctx.data,id:'local-saved-contract'}};
  },false,null,{kind:'contracts',noParentGate:true});
}
document.getElementById('fixture-top').onclick=()=>fixtureOpen(false,false);
document.getElementById('fixture-nested').onclick=()=>fixtureOpen(true,false);
document.getElementById('fixture-failure').onclick=()=>fixtureOpen(false,true);
setInterval(()=>{
  const f=window.__getModalFrame?.();
  document.getElementById('fixture-state').textContent=f ? [f.entity,f.mode,'dirty='+f.isDirty,'saved='+!!f._ctxRef?.data?.id].join(' · ') : 'Closed';
},100);
</script>`;
http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname==='/') {
    const html = fs.readFileSync(path.join(root,'index.html'),'utf8')
      .replace('<head>','<head>'+prelude).replace('</body>',fixture+'</body>');
    res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':"connect-src 'none'; form-action 'none'"}); res.end(html); return;
  }
  const target = path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!target.startsWith(root+path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type': target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'application/octet-stream'});
  fs.createReadStream(target).pipe(res);
}).listen(port,'127.0.0.1',()=>process.stdout.write('Local invitation/save fixture: http://127.0.0.1:'+port+'\n'));
