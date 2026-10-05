const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'summary-modernisation.css'), 'utf8');

test('every canonical processing summary stage has an explicit badge tone', () => {
  for (const stage of [
    'UNPROCESSED',
    'PROCESSING_DELAYED',
    'PROCESSED',
    'AUTHORISED_FOR_INVOICING',
    'INVOICED',
    'PARTIALLY_INVOICED',
    'ARCHIVED'
  ]) {
    assert.match(main, new RegExp(`\\b${stage}: '(?:unprocessed|processed|authorised|invoiced|delayed|archived)'`));
  }
});

test('raw workflow and exception statuses cannot fall back to plain text', () => {
  for (const status of [
    'PENDING_AUTH',
    'READY_FOR_INVOICE',
    'READY_FOR_HR',
    'AWAITING_MANUAL_SIGNATURE',
    'UNASSIGNED',
    'CLIENT_UNRESOLVED',
    'RATE_MISSING',
    'PAY_CHANNEL_MISSING',
    'VALIDATION_FAILED',
    'FAILED',
    'ERROR',
    'BLOCKED'
  ]) {
    assert.match(main, new RegExp(`\\b${status}: '(?:processed|authorised|delayed|attention)'`));
  }
  assert.match(main, /return 'neutral';/);
  assert.match(main, /ctms-processing-status-badge ctms-processing-status-\$\{tone\}/);
});

test('existing friendly wording is preserved and raw tokens receive friendly labels', () => {
  assert.match(main, /if \(existing && !looksLikeRawToken\) return existing;/);
  for (const [token, label] of [
    ['PENDING_AUTH', 'Processed'],
    ['READY_FOR_INVOICE', 'Authorised for Invoicing'],
    ['READY_FOR_HR', 'Processing Delayed'],
    ['UNASSIGNED', 'Candidate Required'],
    ['CLIENT_UNRESOLVED', 'Client Required'],
    ['RATE_MISSING', 'Rate Required'],
    ['PAY_CHANNEL_MISSING', 'Pay Channel Required']
  ]) {
    assert.match(main, new RegExp(`\\b${token}: '${label}'`));
  }
  assert.match(main, /PARTIALLY_INVOICED: 'Partially Invoiced'/);
  assert.match(main, /fallbackToken[\s\S]*?\.split\('_'\)[\s\S]*?\.join\(' '\)/);
});

test('all three timesheet summary rendering paths use the shared badge painter', () => {
  const calls = main.match(/paintTimesheetProcessingStatusCell\(td, (?:row|r), txt\);/g) || [];
  assert.equal(calls.length, 3);
  assert.match(main, /wrap\.appendChild\(badge\);[\s\S]*?wrap\.appendChild\(coin\);/);
});

test('badge palette includes every tone and remains readable on compact cards', () => {
  for (const tone of [
    'unprocessed',
    'processed',
    'authorised',
    'invoiced',
    'delayed',
    'attention',
    'archived',
    'neutral'
  ]) {
    assert.match(css, new RegExp(`ctms-processing-status-${tone}`));
  }
  assert.match(css, /\.ctms-processing-status-badge\{[\s\S]*?white-space:normal/);
});

test('weekly source validation delay is secondary, filterable and never duplicates Processing Delayed', () => {
  const reason = 'Candidate payment is waiting for final weekly source validation.';
  assert.match(main, new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(main, /weeklySourceDelayed[\s\S]*?ctms-weekly-source-delay-badge/);
  assert.match(main, /mainAlreadySaysDelayed[\s\S]*?if \(!mainAlreadySaysDelayed\)/);
  assert.match(main, /WEEKLY_SOURCE_PAY_WAITING/);
  assert.match(css, /\.ctms-weekly-source-delay-badge\{/);
});

function actualFunction(name) {
  const start=main.indexOf('function '+name+'(');
  assert.notEqual(start,-1);
  const end=main.indexOf('\nfunction ',start+20);
  const asyncEnd=main.indexOf('\nasync function ',start+20);
  const candidates=[end,asyncEnd].filter(value=>value>start);
  return main.slice(start,Math.min(...candidates));
}

test('actual status painter shows one invoice-delay badge and clears stale hints on refresh', () => {
  function element() {
    return { children:[],attributes:{},textContent:'',title:'',
      appendChild(child){this.children.push(child);},
      setAttribute(key,value){this.attributes[key]=value;},
      removeAttribute(key){delete this.attributes[key];if(key==='title')this.title='';} };
  }
  const sandbox={document:{createElement:element},
    buildTimesheetProcessingStatusBadge:()=>({...element(),textContent:'Processing Delayed'}),
    normaliseTimesheetProcessingStatusToken:value=>String(value).toUpperCase().replaceAll(' ','_')};
  vm.createContext(sandbox);
  vm.runInContext(actualFunction('paintTimesheetProcessingStatusCell'),sandbox);
  const td=element();
  sandbox.paintTimesheetProcessingStatusCell(td,{tools_stage:'PROCESSING_DELAYED',
    weekly_source_pay_delayed:true,weekly_source_operational_category:{
      presentation_category:'PROCESSING_DELAYED',processing_reason:'Awaiting a valid import for invoicing'}},
    'Processing Delayed');
  assert.equal(td.children.length,1);
  assert.equal(td.title,'Awaiting a valid import for invoicing');
  assert.doesNotMatch(td.attributes['aria-label'],/Candidate payment/);
  td.children=[];
  sandbox.paintTimesheetProcessingStatusCell(td,{tools_stage:'PROCESSED'},'Processed');
  assert.equal(td.title,'');
  assert.equal(td.attributes['aria-label'],undefined);
});

test('actual saved-search form maps historical Archived tools_stage to Withdrawn', () => {
  const select={tagName:'SELECT',value:''};
  const sandbox={document:{querySelector:()=>({querySelector:selector=>
    selector==='[name="tools_stage"]'?select:null})}};
  vm.createContext(sandbox);
  vm.runInContext(actualFunction('populateSearchFormFromFilters'),sandbox);
  sandbox.populateSearchFormFromFilters({tools_stage:'ARCHIVED'});
  assert.equal(select.value,'WITHDRAWN');
});
