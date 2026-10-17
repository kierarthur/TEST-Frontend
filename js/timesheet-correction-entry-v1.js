// Exact Health advisory decoder/host derivation; no CM17 body.
(function(root){
'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEYS=['current_timesheet_id','disabled_reason','may_open_review','placement_revision','purpose','requested_timesheet_id','version'];
function decodeCorrectionEntry(value,timesheetId){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==KEYS.join('|')
  ||value.version!=='TIMESHEET_CORRECTION_ENTRY_V1'||value.requested_timesheet_id!==timesheetId
  ||!UUID.test(timesheetId)||value.purpose!=='CONTRACT_CORRECTION'
  ||typeof value.placement_revision!=='string'||value.placement_revision.length>19||!/^(0|[1-9][0-9]*)$/.test(value.placement_revision)
  ||BigInt(value.placement_revision)>9223372036854775807n||value.may_open_review!==false
  ||!['REVIEW_UNAVAILABLE','CURRENT_ALLOCATION_PENDING'].includes(value.disabled_reason)
  ||(value.current_timesheet_id===null?value.disabled_reason!=='CURRENT_ALLOCATION_PENDING'
    :typeof value.current_timesheet_id!=='string'||!UUID.test(value.current_timesheet_id)||value.disabled_reason!=='REVIEW_UNAVAILABLE')){
  throw new Error('CORRECTION_ENTRY_INVALID_RESPONSE');
 }
 return Object.freeze({...value});
}
async function readCorrectionEntryForHost({binding,timesheetId,authFetch,api}){
 if(!binding?.current?.()||binding.initialTimesheetId!==timesheetId
  ||binding.context?.timesheetDetails?.timesheet?.sheet_scope==='DAILY')throw new Error('CORRECTION_CURRENT_PARENT_REQUIRED');
 if(typeof api!=='function')throw new Error('CORRECTION_ENTRY_UNAVAILABLE');
 const response=await authFetch(api(`/api/timesheets/${encodeURIComponent(timesheetId)}/correction-entry`),{method:'GET',cache:'no-store'});
 if(!binding.current())throw new Error('CORRECTION_CURRENT_PARENT_REQUIRED');
 if(!response.ok)throw new Error(response.status===403?'TIMESHEET_CORRECTION_ENTRY_NOT_ALLOWED':'CORRECTION_ENTRY_UNAVAILABLE');
 const entry=decodeCorrectionEntry(await response.json(),timesheetId);
 if(!binding.current())throw new Error('CORRECTION_CURRENT_PARENT_REQUIRED');
 // The producer is deliberately closed until root seals complete Preview and
 // CM17. Its false value is neither a transaction capability nor a Ready state.
 return entry;
}

root.CloudTMSCorrectionEntryV1=Object.freeze({decodeCorrectionEntry,readCorrectionEntryForHost});
})(globalThis);
