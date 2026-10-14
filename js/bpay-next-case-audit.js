/* FC14: the two native read-only finance windows share one bounded reader UI. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextCaseAudit=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const AUDIT=[['WHEN','When','occurred_at_utc','time'],['EVENT','Event','event_label'],['WHO','Who','actor_name'],['SOURCE','Source','source_label'],['AMOUNT','Amount','display_amount','money'],['REASON','Reason','reason'],['DETAILS','Details','details','embeddedMoney']];
const REPORT=[['ITEM','Item','item'],['CLIENT','Client','client'],['ORIGINAL','Original','original','money'],['OUTSTANDING','Outstanding','outstanding','money'],['WEEKLY_AMOUNT','Weekly amount','weekly_amount','money'],['NEXT_DATE','Next date','next_date','date'],['SNOOZED_UNTIL','Snoozed until','snoozed_until','date'],['STATUS','Status','status'],['NOTES','Notes','notes']];
const SECTIONS=['','Payment Advances','Overpayments','Underpayments','Manual Debts','Manual Credits','Other Cases','Snoozed items'];
function money(v){if(v===null||v===undefined)return '—';const negative=v.startsWith('-'),p=(negative?v.slice(1):v).split('.');return(negative?'−':'')+'£'+p[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(p[1]??'').padEnd(2,'0');}
function date(v){return v==null?'—':v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4);}
function time(v){if(v==null)return '—';const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(v));const n=k=>p.find(x=>x.type===k)?.value;return n('day')+'/'+n('month')+'/'+n('year')+' '+n('hour')+':'+n('minute')+':'+n('second');}
function open(options,seed={},kind='CASE_AUDIT'){
 const doc=options.document,win=options.window,Office=win.CloudTMSBpayNextOffice,contract=win.CloudTMSBpayNextCaseAuditContract;
 const candidateId=String(seed.candidate_id??'').toLowerCase(),caseId=String(seed.case_id??seed.finance_case_id??seed.id??'').toLowerCase(),audit=kind==='CASE_AUDIT';
 if(!Office||!contract||!UUID.test(candidateId)||audit&&!UUID.test(caseId)||!UUID.test(options.actorId)||!['CASE_AUDIT','CANDIDATE_CASE_REPORT'].includes(kind)||options.ownerReady?.()!==true||typeof options.showReadWindow!=='function')throw Error('Window unavailable');
 const transport=options.transport??Office.createTransport(options),columns=audit?AUDIT:REPORT;
 let frame,closed=false,busy=false,failed=false,generation=0,rows=[],after=null,complete=false,count=null,summary=null,header=null,context=null,sort=audit?'WHEN':'NEXT_DATE',direction='ASC',activeOnly=true,highlight=null,failedAppend=false;
 const current=()=>!closed&&options.current?.()===true&&options.currentActorId?.()===options.actorId&&options.ownerReady?.()===true;
 const active=()=>current()&&frame?.active()===true;
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const content=el('section',undefined,'bpay-next-case-finance'),headerDetail=el('p','', 'bpay-next-case-finance-subtitle'),footer=el('div','', 'bpay-next-case-finance-foot'),strip=el('dl',undefined,'bpay-next-case-finance-summary');
 headerDetail.dataset.nextLiveCopy='';footer.dataset.nextLiveCopy='';
 const controls=el('div',undefined,'bpay-next-case-finance-controls'),filterLabel=el('label','Active only'),filter=el('input');filter.type='checkbox';filter.checked=true;filterLabel.prepend(filter);filterLabel.hidden=audit;controls.append(filterLabel);
 const phone=el('label','Sort by','bpay-next-case-finance-phone-sort'),select=el('select');for(const [key,label] of columns){for(const dir of ['ASC','DESC']){const o=el('option',label+' · '+(dir==='ASC'?'ascending':'descending'));o.value=key+':'+dir;select.append(o);}}phone.append(select);controls.append(phone);
 const notice=el('div',undefined,'bpay-next-case-finance-notice');notice.setAttribute('aria-live','polite');
 const region=el('div',undefined,'bpay-next-case-finance-scroll');region.setAttribute('role','region');region.setAttribute('aria-label',audit?'Case events':'Candidate finance');region.tabIndex=0;
 const table=el('table'),thead=el('thead'),tbody=el('tbody'),sentinel=el('div','', 'bpay-next-case-finance-sentinel');sentinel.setAttribute('role','status');table.append(thead,tbody);region.append(table,sentinel);content.append(strip,controls,notice,region);
 table.className='bpay-next-case-finance-table ctms-universal-table ctms-universal-card-table';sentinel.dataset.nextLiveCopy='';
 let resolve;const completion=new Promise(r=>{resolve=r;});
 function button(label,handler){const b=el('button',label,'btn');b.type='button';b.dataset.nextSecondary='';b.onclick=e=>{e.stopPropagation();void handler();};return b;}
 function rowOpen(row){if(!active())return;if(row.source==='CASE'&&typeof options.openAudit==='function')void options.openAudit({case_id:row.case_id,candidate_id:candidateId});else if(row.source==='TIMESHEET_SNOOZE'&&typeof options.openTimesheet==='function')void options.openTimesheet(row.physical_timesheet_id);}
 function readable(v,type){if(type==='money')return money(v);if(type==='date')return date(v);if(type==='time')return time(v);if(type==='embeddedMoney'&&v!=null)return v.replace(/£(-?(?:0|[1-9]\d*)(?:\.\d{1,2})?)(?![\d.,])/g,(_,amount)=>money(amount));return v==null||v===''?'—':v;}
 function sortLabel(){const name=columns.find(c=>c[0]===sort)[1];const order=sort==='WHEN'?(direction==='ASC'?'oldest first':'newest first'):sort==='NEXT_DATE'||sort==='SNOOZED_UNTIL'?(direction==='ASC'?'soonest first':'latest first'):(direction==='ASC'?'ascending':'descending');return 'Sorted by '+name+', '+order;}
 function paint(){if(!current())return;
  if(header)headerDetail.textContent=[audit?header.case_label:null,header.candidate_name,header.candidate_reference?'TMS '+header.candidate_reference:null].filter(Boolean).join(' · ');
  strip.hidden=audit;strip.replaceChildren();if(!audit){for(const [label,key,type] of [['Payment Advances outstanding','payment_advances_outstanding','money'],['Overpayments outstanding','overpayments_outstanding','money'],['Snoozed items','snoozed_items']]){const fact=el('div'),dd=el('dd',readable(summary?.[key],type));if(type==='money')dd.dataset.nextFormattedMoney='';fact.append(el('dt',label),dd);strip.append(fact);}}
  filter.disabled=busy;select.value=sort+':'+direction;select.disabled=busy;
  notice.replaceChildren();notice.hidden=!failed&&!busy&&rows.length!==0;notice.setAttribute('role',failed?'alert':'status');
  const initialFailure=failed&&rows.length===0;content.classList.toggle('is-initial-failure',initialFailure);controls.hidden=initialFailure;region.hidden=initialFailure||(!busy&&!failed&&complete&&rows.length===0);
  if(failed){const icon=el('span','!','bpay-next-case-finance-error-icon');icon.setAttribute('aria-hidden','true');notice.append(icon,el('p',audit?'Could not load the Case audit; try again.':'Could not load the report; try again.'));if(!initialFailure)notice.append(button('Retry',()=>read(failedAppend)));}
  else if(busy&&!rows.length)notice.append(el('p','Loading…'));
  else if(!rows.length)notice.append(el('p',audit?'No Case events.':'No finance items.'));
  thead.replaceChildren();const hr=el('tr');for(const [key,label,,type] of columns){const th=el('th');th.scope='col';th.className=type==='money'?'is-money':'';th.setAttribute('aria-sort',sort===key?(direction==='ASC'?'ascending':'descending'):'none');const b=button(label+(sort===key?(direction==='ASC'?' ▲':' ▼'):''),()=>changeSort(key,sort===key&&direction==='ASC'?'DESC':'ASC'));b.dataset.wsSort=key;b.disabled=busy;th.append(b);hr.append(th);}thead.append(hr);
  tbody.replaceChildren();let priorSection=null;for(const row of rows){if(!audit&&row.section!==priorSection){const sr=el('tr',undefined,'bpay-next-case-finance-section'),td=el('td',SECTIONS[row.section]);td.colSpan=columns.length;sr.append(td);tbody.append(sr);priorSection=row.section;}
   const tr=el('tr');tr.dataset.financeIdentity=(row.source_id??row.row_id)+':'+(row.event_ordinal??'1');tr.tabIndex=0;tr.classList.toggle('is-highlighted',highlight===tr.dataset.financeIdentity);
   tr.onclick=e=>{if(e.target.closest('button,a,input,select'))return;highlight=tr.dataset.financeIdentity;tbody.querySelectorAll('tr[data-finance-identity]').forEach(n=>n.classList.toggle('is-highlighted',n===tr));};tr.ondblclick=e=>{if(!e.target.closest('button,a'))rowOpen(row);};tr.onkeydown=e=>{if(e.key==='Enter'&&e.target===tr){e.preventDefault();rowOpen(row);}};
   for(const [key,label,field,type] of columns){const td=el('td',undefined,type==='money'?'is-money':'');td.dataset.label=label;const value=key==='SNOOZED_UNTIL'&&row.indefinite_snooze===true?'No end date':readable(row[field],type),text=el(key==='EVENT'||key==='ITEM'?'strong':'span',value);if(type==='money'||type==='embeddedMoney')text.dataset.nextFormattedMoney='';if(key==='STATUS')text.className='candidate-office-badge candidate-office-badge--'+(row.status==='Active'?'success':'neutral');td.append(text);
    if(key==='ITEM'){if(row.created_at_utc)td.append(el('small',(row.source==='TIMESHEET_SNOOZE'?'Snoozed ':'Created ')+date(timeISO(row.created_at_utc))));if(row.source==='CASE'){const b=button('Audit',()=>rowOpen(row));b.classList.add('bpay-next-case-finance-audit');td.append(b);}const p=button('Open',()=>rowOpen(row));p.classList.add('bpay-next-case-finance-phone-open');if(row.source==='CASE'||typeof options.openTimesheet==='function')td.append(p);}
    if(key==='NOTES'&&row.source==='CASE'){const facts=el('dl',undefined,'bpay-next-case-finance-balances');for(const [label,key] of [['Funded','funded'],['Recovered','recovered'],['Written off','written_off'],['Reserved','reserved']]){const pair=el('div'),dd=el('dd',money(row[key]));dd.dataset.nextFormattedMoney='';pair.append(el('dt',label),dd);facts.append(pair);}td.append(facts);}if(key==='DETAILS'&&(row.source_amount_ex_vat!==null||row.target_amount_inc_vat!==null)){const amounts=el('small','Source ex VAT '+money(row.source_amount_ex_vat)+' · Target inc VAT '+money(row.target_amount_inc_vat));amounts.dataset.nextFormattedMoney='';td.append(amounts);}tr.append(td);
   }tbody.append(tr);
  }
  region.setAttribute('aria-busy',String(busy));sentinel.textContent=busy&&rows.length?'Loading more…':'';
  footer.replaceChildren();if(initialFailure){const retry=button('Retry',()=>read(failedAppend));retry.classList.add('primary');delete retry.dataset.nextSecondary;footer.append(retry);}else footer.textContent=(count===null?'—':count)+' '+(audit?'events':'items')+' · '+sortLabel();
 }
 function timeISO(value){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)),get=k=>parts.find(p=>p.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');}
 async function read(append=false){if(!active()||busy||append&&(complete||after===null))return;const token=++generation;busy=true;failed=false;failedAppend=append;paint();
  const args={candidate_id:candidateId,...(audit?{case_id:caseId}:{active_only:activeOnly}),sort,direction,limit:100,after:append?after:null,include_count:!append};
  try{const raw=await transport.page(kind,args);if(!active()||token!==generation)return;const {ok,...payload}=raw;if(ok!==true)throw Error();contract.caseFinanceResult(payload,kind,args,options.actorId.toLowerCase());if(context!==null&&append&&JSON.stringify(payload.context)!==JSON.stringify(context))throw Error();
   const ids=new Set((append?rows:[]).map(r=>(r.source??'')+':'+(r.source_id??r.row_id)+':'+(r.event_ordinal??'1')));if(payload.rows.some(r=>{const key=r.source+':'+(r.source_id??r.row_id)+':'+(r.event_ordinal??'1');if(ids.has(key))return true;ids.add(key);return false;}))throw Error();
   rows=append?rows.concat(payload.rows):payload.rows;context=payload.context;header=payload.header;after=payload.next_cursor;complete=payload.complete;if(!append){count=payload.total_count;summary=payload.summary;}failed=false;
  }catch(error){if(!active()||token!==generation)return;failed=true;if(error?.serverCode==='BPAY_NEXT_CASE_FINANCE_CONTEXT_CHANGED')failedAppend=false;if(!append){rows=[];after=null;context=null;count=null;summary=null;}}
  finally{if(current()&&token===generation){busy=false;if(active()){paint();if(!failed&&!complete)win.requestAnimationFrame(()=>{if(active()&&!busy&&region.scrollHeight<=region.clientHeight+160)void read(true);});}}}
 }
 function changeSort(key,dir){if(!active()||busy)return;sort=key;direction=dir;reset();}
 function reset(){rows=[];after=null;complete=false;context=null;count=null;summary=null;highlight=null;region.scrollTop=0;void read();}
 filter.onchange=()=>{if(active()&&!busy){activeOnly=filter.checked;reset();}};select.onchange=()=>{const [key,dir]=select.value.split(':');changeSort(key,dir);};
 region.onscroll=()=>{if(!failed&&region.scrollHeight-region.scrollTop-region.clientHeight<160)void read(true);};
 region.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||e.target.closest('button,input,select,a'))return;const list=[...tbody.querySelectorAll('tr[data-finance-identity]')];if(!list.length)return;const at=list.indexOf(e.target.closest('tr')),index=e.key==='Home'?0:e.key==='End'?list.length-1:e.key==='ArrowDown'?Math.min(list.length-1,at+1):Math.max(0,at-1);e.preventDefault();const row=list[index];highlight=row.dataset.financeIdentity;list.forEach(n=>n.classList.toggle('is-highlighted',n===row));row.focus();row.scrollIntoView({block:'nearest'});});
 frame=options.showReadWindow({title:audit?'Case audit':'Candidate Finance Report',content,footer,headerDetail,onDismiss(){closed=true;generation++;resolve(null);},onMount(){if(current()){paint();if(!busy&&context===null&&!failed)void read();}},canFocus:()=>current()});
 paint();if(active())void read();return completion;
}
return Object.freeze({open,money,date,time});
});
