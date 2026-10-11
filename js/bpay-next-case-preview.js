/* FC-03 shared Preview / Apply component; server owns every amount. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextCasePreview=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
  const CASE_INPUT_SCHEMA=Object.freeze({candidate_id:'uuid',case_kind:'family',case_subtype:'subtype',tax_treatment:'tax',principal:'positiveMoney',due_date:'date?',start_monday:'date?',weekly_due:'positiveMoney?',week_count:'positive?',minimum_earnings_threshold:'money?',take_home_floor_override:'money?',reason:'reason',note:'note?',original_liability_reference:'reference?'});
  const enc=new TextEncoder(),uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const equal=(a,b)=>object(a)&&object(b)?Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k])):Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((x,i)=>equal(x,b[i])):a===b;
  const numeric=v=>typeof v==='string'&&/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(v)&&enc.encode(v).byteLength<=1024;
  const whole=v=>typeof v==='string'&&/^(?:0|[1-9]\d{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n;
  const date=v=>typeof v==='string'&&/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  function value(v,t){if(t.endsWith('?'))return v===null||value(v,t.slice(0,-1));
    if(t==='uuid')return typeof v==='string'&&uuid.test(v);
    if(t==='money')return numeric(v);if(t==='positiveMoney')return numeric(v)&&/[1-9]/.test(v);
    if(t==='positive')return whole(v)&&v!=='0';if(t==='integer')return whole(v);
    if(t==='date')return date(v);
    if(t==='reason'||t==='note'||t==='reference')return typeof v==='string'&&!v.includes('\0')&&enc.encode(v).byteLength<=2048&&(t==='note'||v.trim()!=='');
    if(t==='family')return ['LOAN','ADVANCE','MANUAL_DEBT','CREDIT'].includes(v);
    if(t==='subtype')return ['LOAN','PAYMENT_ADVANCE','MANUAL_DEBT','MANUAL_CREDIT'].includes(v);
    if(t==='tax')return ['NOT_APPLICABLE','TAXABLE','NON_TAXABLE'].includes(v);
    if(t==='channel')return ['PAYE','UMBRELLA'].includes(v);return false;}
  const shape=(v,s)=>object(v)&&Object.keys(v).length===Object.keys(s).length&&Object.entries(s).every(([k,t])=>Object.hasOwn(v,k)&&value(v[k],t));
  function caseInput(v){return shape(v,CASE_INPUT_SCHEMA)&&enc.encode(JSON.stringify(v)).byteLength<=12288
    &&(v.original_liability_reference===null||v.case_kind==='MANUAL_DEBT')
    &&({LOAN:'LOAN',ADVANCE:'PAYMENT_ADVANCE',MANUAL_DEBT:'MANUAL_DEBT',CREDIT:'MANUAL_CREDIT'})[v.case_kind]===v.case_subtype
    &&(['LOAN','ADVANCE'].includes(v.case_kind)?v.tax_treatment==='NOT_APPLICABLE':['TAXABLE','NON_TAXABLE'].includes(v.tax_treatment))
    &&(v.case_kind==='CREDIT'?['start_monday','weekly_due','week_count','minimum_earnings_threshold','take_home_floor_override'].every(k=>v[k]===null)
      :v.start_monday!==null&&new Date(v.start_monday+'T00:00:00Z').getUTCDay()===1&&(v.weekly_due!==null||v.week_count!==null));}
  const CONTEXT_SCHEMA={actor_user_id:'uuid',owner_epoch:'positive',financial_view_revision:'integer',pay_channel:'channel',candidate_default_floor:'money?',valuation_policy_id:'uuid'};
  function caseToken(v){return object(v)&&Object.keys(v).sort().join() === 'context,input'&&caseInput(v.input)&&shape(v.context,CONTEXT_SCHEMA)&&enc.encode(JSON.stringify(v)).byteLength<=24576;}
  function casePreview(v,input){const s={candidate_id:'uuid',weekly_due:'positiveMoney?',week_count:'positive?',first_due_monday:'date?',last_due_monday:'date?',total:'positiveMoney',minimum_earnings_threshold:'money?',take_home_floor_override:'money?',effective_take_home_floor:'money?'};
    if(!object(v)||Object.keys(v).length!==11||!shape(Object.fromEntries(Object.keys(s).map(k=>[k,v[k]])),s)||!caseToken(v.preview_token)
      ||!equal(v.preview_token.input,input)||v.candidate_id.toLowerCase()!==input.candidate_id.toLowerCase()
      ||!Array.isArray(v.warnings)||v.warnings.length>1||v.warnings.some(x=>x!=='EXISTING_REPAYMENTS'))return false;
    const pennies=v=>v===null?null:BigInt(v.split('.')[0])*100n+BigInt((v.split('.')[1]??'').padEnd(2,'0'));
    if(pennies(v.total)!==pennies(input.principal)||pennies(v.minimum_earnings_threshold)!==pennies(input.minimum_earnings_threshold)
      ||pennies(v.take_home_floor_override)!==pennies(input.take_home_floor_override)
      ||pennies(v.effective_take_home_floor)!==pennies(input.take_home_floor_override??v.preview_token.context.candidate_default_floor)
      ||(input.weekly_due!==null&&pennies(v.weekly_due)!==pennies(input.weekly_due))
      ||(input.week_count!==null&&v.week_count!==input.week_count))return false;
    if(input.case_kind==='CREDIT')return ['weekly_due','week_count','first_due_monday','last_due_monday'].every(k=>v[k]===null);
    return [v.weekly_due,v.week_count,v.first_due_monday,v.last_due_monday].every(x=>x!==null)
      &&v.first_due_monday===input.start_monday&&new Date(v.first_due_monday+'T00:00:00Z').getUTCDay()===1
      &&new Date(v.last_due_monday+'T00:00:00Z').getUTCDay()===1
      &&BigInt((Date.parse(v.last_due_monday+'T00:00:00Z')-Date.parse(v.first_due_monday+'T00:00:00Z'))/604800000)===BigInt(v.week_count)-1n;}

function mount(options){
  const {document:doc,host,footer,getInput,current=()=>true,preview,submit,retry,snapshot,readCase,onApplied}=options;
  if(!doc||!host||!footer||[getInput,current,preview,submit,retry,snapshot,readCase].some(f=>typeof f!=='function'))throw Error('Case window unavailable');
  footer.classList.add('bpay-next-case-actions');
  const validInput=options.validInput??caseInput,validPreview=options.validPreview??casePreview;
  let shown=null,shownInput=null,busy=false,accepted=options.acceptedCase?.()??null,ended=false,line='Preview first.';
  if(accepted)line='This Case is being added.';
  else if(snapshot()?.pending)line='Could not confirm the result; try again.';
  const panel=doc.createElement('section');panel.className='bpay-next-case-preview';panel.setAttribute('aria-label','Preview');
  const result=doc.createElement('p');result.className='bpay-next-case-result';result.setAttribute('role','status');result.setAttribute('aria-live','polite');
  const previewButton=doc.createElement('button');previewButton.type='button';previewButton.className='btn';previewButton.textContent='Preview';
  const applyButton=doc.createElement('button');applyButton.type='button';applyButton.className='btn primary';applyButton.textContent='Apply';
  previewButton.dataset.nextFocusKey='case-preview';applyButton.dataset.nextFocusKey='case-apply';
  const active=()=>!ended&&current()===true;
  const money=v=>v===null?'—':'£'+v.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(v.split('.')[1]??'').padEnd(2,'0');
  const due=v=>'Mon '+v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4);
  const currentInput=()=>{try{const v=getInput();return validInput(v)?JSON.parse(JSON.stringify(v)):null;}catch{return null;}};
  function paint(){
    if(!active())return;
    const input=currentInput(),pending=snapshot()?.pending;
    if(shown&&(!input||!equal(input,shownInput))){shown=null;shownInput=null;line='Details changed; preview again.';}
    result.textContent=line==='Preview first.'&&!input?(options.inputHint?.()||line):line;
    result.setAttribute('role',/Could not|Set a pay channel|Sign in|Details have changed/.test(result.textContent)?'alert':'status');
    panel.replaceChildren();panel.hidden=shown===null;
    const empty=doc.createElement('dl');empty.className='bpay-next-case-empty';empty.hidden=shown!==null||!options.showEmptySchedule||Boolean(pending)||accepted!==null;
    for(const title of ['Weekly repayment','Last due']){const term=doc.createElement('dt'),value=doc.createElement('dd');term.textContent=title;value.textContent='—';empty.append(term,value);}
    if(shown){
      const label=doc.createElement('span');label.className='bpay-next-case-eyebrow';label.textContent='Preview';
      const credit=options.creditPresentation===true&&shownInput.case_kind==='CREDIT';
      const heading=doc.createElement('h3');heading.textContent=credit?money(shown.total)+' credit':shown.weekly_due===null?money(shown.total)+' to pay':(options.weeklyLimitLabel?'Up to ':'')+money(shown.weekly_due)+' a week for '+shown.week_count+' weeks';
      const details=doc.createElement('dl');
      const rows=shown.weekly_due===null?[]:[['First due',due(shown.first_due_monday)],['Last due',due(shown.last_due_monday)]];
      rows.push(['Total',money(shown.total)]);
      if(credit)rows.push(['Tax',shownInput.tax_treatment==='TAXABLE'?'Taxable':'Not taxable']);
      else rows.push(['Minimum earnings threshold',shown.minimum_earnings_threshold===null?'None':money(shown.minimum_earnings_threshold)],
        ['Take-home floor',shown.take_home_floor_override===null?'Candidate default':money(shown.effective_take_home_floor)]);
      for(const [title,text]of rows){const term=doc.createElement('dt'),value=doc.createElement('dd');term.textContent=title;value.textContent=text;details.append(term,value);}
      panel.append(label,heading,details);
      for(const warning of shown.warnings){const message=doc.createElement('p');message.className='bpay-next-case-warning';message.textContent=warning==='EXISTING_REPAYMENTS'?'This Candidate already has repayments.':warning;panel.append(message);}
    }
    previewButton.disabled=busy||Boolean(pending)||accepted!==null||!input;
    previewButton.hidden=Boolean(pending)||accepted!==null;
    applyButton.textContent=pending?'Try again':accepted?'Refresh':'Apply';
    applyButton.disabled=busy||(!pending&&!accepted&&!(shown&&input&&equal(input,shownInput)));
    host.replaceChildren(panel,empty,result);
    if(footer.childNodes.length!==2||footer.firstChild!==previewButton||footer.lastChild!==applyButton)footer.replaceChildren(previewButton,applyButton);
    options.onState?.({busy,pending:Boolean(pending),accepted:accepted!==null,preview:shown===null?null:JSON.parse(JSON.stringify(shown))});
  }
  function message(error,unknown){
    if(unknown)return 'Could not confirm the result; try again.';
    if(error?.serverCode==='BPAY_NEXT_CASE_PREVIEW_CHANGED'||error?.code==='BPAY_NEXT_CASE_PREVIEW_CHANGED')return 'Details have changed; preview again.';
    if(error?.code==='AUTH_REQUIRED')return 'Sign in again to continue.';
    if(error?.serverCode==='BPAY_NEXT_CASE_CREATE_SOURCE_CHANNEL_UNBOUND'||error?.code==='BPAY_NEXT_CASE_CREATE_SOURCE_CHANNEL_UNBOUND')return 'Set a pay channel on the Candidate, then preview again.';
    return 'Could not save this Case; preview again.';
  }
  async function refreshCase(){
    const page=await readCase(accepted.case_id);
    if(!active())return;
    if(!page||!Array.isArray(page.rows))throw Error('Case unavailable');
    if(page.rows.length===0){line='This Case is being added.';return;}
    if(page.rows.some(row=>row.case_id?.toLowerCase()!==accepted.case_id.toLowerCase()))throw Error('Case unavailable');
    line='Case added.';if(onApplied){await onApplied(accepted,page);ended=true;}if(active())paint();
  }
  previewButton.onclick=async()=>{
    const input=currentInput();if(busy||!active()||!input||snapshot()?.pending||accepted)return;
    busy=true;shown=null;shownInput=null;line='Checking…';paint();
    try{const value=await preview(input);if(!active())return;if(!equal(input,currentInput())){line='Details changed; preview again.';return;}
      if(!validPreview(value,input))throw Error('Preview unavailable');shown=value;shownInput=input;line='';
    }catch(error){if(active()){shown=null;shownInput=null;line=error?.serverCode==='BPAY_NEXT_CASE_CREATE_SOURCE_CHANNEL_UNBOUND'||error?.code==='BPAY_NEXT_CASE_CREATE_SOURCE_CHANNEL_UNBOUND'?'Set a pay channel on the Candidate, then preview again.':error?.code==='AUTH_REQUIRED'?'Sign in again to continue.':'Could not prepare the preview; try again.';}}
    finally{busy=false;paint();}
  };
  applyButton.onclick=async()=>{
    if(busy||!active())return;
    const pending=snapshot()?.pending,input=currentInput();
    if(!pending&&!accepted&&(!shown||!input||!equal(input,shownInput)))return;
    busy=true;line=accepted?'Checking…':'Saving…';paint();
    try{
      if(!accepted)accepted=pending?await retry():await submit(input,shown.preview_token);
      if(!active())return;
      if(!accepted||typeof accepted.case_id!=='string'||!uuid.test(accepted.case_id))throw Error('Receipt unavailable');
      await refreshCase();
    }catch(error){if(active()){const unknown=Boolean(snapshot()?.pending);line=accepted?'Could not refresh this Case; try again.':message(error,unknown);if(!unknown&&!accepted){shown=null;shownInput=null;}}}
    finally{busy=false;paint();}
  };
  paint();return Object.freeze({changed:paint,refresh:paint,destroy(){ended=true;previewButton.onclick=null;applyButton.onclick=null;}});
}
return Object.freeze({CASE_INPUT_SCHEMA,caseInput,caseToken,casePreview,equal,mount});
});
