/* Shared NEXT presentation only. Wire date buckets and frozen facts stay intact. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CloudTMSBpayNextDates=api;
})(typeof globalThis==='object'?globalThis:this,function(root){
  'use strict';
  const absent='Not recorded';
  const day=/^(\d{4})-(\d{2})-(\d{2})$/;
  const london=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  function formatDate(value){
    if(typeof value!=='string'||!day.test(value))return absent;
    // Use the established Office date-only helper when main.js is loaded.
    if(typeof root.formatUkDate==='function')return root.formatUkDate(value);
    const [,year,month,date]=day.exec(value);return date+'/'+month+'/'+year;
  }
  function formatTimestamp(value){
    if(typeof value!=='string')return absent;
    // Both ISO service fields and PostgreSQL history text include an explicit
    // zone. Never interpret an unzoned clock in the computer's local timezone.
    const match=/^(\d{4}-\d{2}-\d{2})[T ]((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.\d{1,6})?(Z|[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?)$/.exec(value);
    if(!match)return absent;
    const date=new Date(match[1]+'T00:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==match[1])return absent;
    let zone=match[3];if(zone!=='Z')zone=zone.length===3?zone+':00':zone.length===5?zone.slice(0,3)+':'+zone.slice(3):zone;
    const instant=new Date(match[1]+'T'+match[2]+zone);
    if(!Number.isFinite(instant.getTime()))return absent;
    const parts=Object.fromEntries(london.formatToParts(instant).map(part=>[part.type,part.value]));
    return parts.day+'/'+parts.month+'/'+parts.year+' '+parts.hour+':'+parts.minute+':'+parts.second;
  }
  function formatAdvice(document){
    const dates=new Set(['Pay date','Week ending','Work date']);
    const stamps=new Map([['Issued at (recorded timezone)','Issued at (London time)'],
      ['Recorded start (timezone retained)','Recorded start (London time)'],
      ['Recorded end (timezone retained)','Recorded end (London time)']]);
    for(const term of document.querySelectorAll('dl > dt')){
      const value=term.nextElementSibling;if(value?.tagName!=='DD')continue;
      const label=term.textContent;
      if(dates.has(label))value.textContent=formatDate(value.textContent);
      else if(stamps.has(label)){value.textContent=formatTimestamp(value.textContent);term.textContent=stamps.get(label);}
    }
    for(const table of document.querySelectorAll('table')){
      const headings=Array.from(table.querySelectorAll('thead th'));
      const indexes=headings.flatMap((heading,index)=>['Break start (recorded)','Break end (recorded)'].includes(heading.textContent)?[index]:[]);
      if(!indexes.length)continue;
      for(const index of indexes)headings[index].textContent=headings[index].textContent.replace('(recorded)','(London time)');
      for(const row of table.querySelectorAll('tbody tr')){
        const cells=row.children;if(cells.length!==headings.length)continue; // retained duration-only explanatory row
        for(const index of indexes)cells[index].textContent=formatTimestamp(cells[index].textContent);
      }
    }
  }
  return Object.freeze({formatDate,formatTimestamp,formatAdvice});
});
