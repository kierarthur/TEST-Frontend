const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../js/weekly-source/agency-invoice-credit-ui.js'),'utf8'),{window});const ui=window.CloudTmsAutomaticCreditNotes;
const u=n=>'f7300000-0000-4000-8000-'+String(n).padStart(12,'0'),item=(n,blocked=false)=>({original_invoice_id:u(n),reversal_timesheet_id:u(n+100),selection_key:'healthroster-credit:'+u(n)+':'+u(n+100),selectable:false,automatic:true,invoice_number:'FIXTURE '+n,candidate_name:'Synthetic fixture',week_ending_date:'2026-10-18',blocker_code:blocked?'CREDIT_SCOPE_AUTHORITY_UNPROVED':null});
const envelope=rows=>({contract_version:'TIMESHEET_CORRECTION_CREDIT_CANDIDATES_V1',rows}),esc=x=>String(x).replaceAll('<','&lt;');
test('blocked-only automatic credits stay visible and cannot count as a confirmable command',()=>{
 const e=envelope([item(1,true)]);assert.equal(ui.rows(e).length,1);assert.equal(ui.readyRows(e).length,0);const html=ui.render(e,esc);assert.match(html,/18\/10\/2026/);assert.doesNotMatch(html,/2026-10-18|checkbox|Credit note will be raised automatically/);assert.match(html,/Could not be raised/);
});
test('mixed native states preserve every row but only the actual ready row is confirmable',()=>{
 const e=envelope([item(1,true),item(2)]);assert.equal(ui.rows(e).length,2);assert.equal(ui.readyRows(e).length,1);assert.equal(ui.readyRows(e)[0].original_invoice_id,u(2));assert.match(ui.render(e,esc),/Credit note will be raised automatically/);
});
test('producer-blocked result without a registered operation points to its original authority',()=>{
 const html=ui.renderResults([{blocked:true,accepted:false,operation_id:null,code:'CREDIT_SCOPE_AUTHORITY_UNPROVED'}],esc);assert.match(html,/Check the original invoice or correction/);assert.doesNotMatch(html,/Check the invoice Outbox for details/);let calls=0;ui.register([{operation_receipt:null}],()=>{calls++;},{});assert.equal(calls,0);
});

