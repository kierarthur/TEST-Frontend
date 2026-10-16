(function(root){'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 function create({timesheetId,actorUserId,request,runAction,pendingStorage,current,onResult,onClose}){
  const dto=root.CloudTMSCorrectionContractV3;
  if(!dto||!UUID.test(timesheetId||'')||!UUID.test(actorUserId||'')||typeof request!=='function'||typeof runAction!=='function'||typeof current!=='function'||typeof onResult!=='function')throw new TypeError('DAILY_RATE_NATIVE_ADAPTER_REQUIRED');
  function uniqueJson(text){
   const stack=[];for(let i=0;i<text.length;i++){
    if(text[i]==='{'||text[i]==='['){stack.push(text[i]==='{'?new Set():null);if(stack.length>32)throw new TypeError('DAILY_RATE_RESPONSE_INVALID');}
    else if(text[i]==='}'||text[i]===']')stack.pop();
    else if(text[i]==='"'){const start=i++;for(;i<text.length;i++){if(text[i]==='\\')i++;else if(text[i]==='"')break;}const token=JSON.parse(text.slice(start,i+1));let next=i+1;while(next<text.length&&/\s/.test(text[next]))next++;if(text[next]===':'){const keys=stack.at(-1);if(!(keys instanceof Set)||keys.has(token))throw new TypeError('DAILY_RATE_RESPONSE_INVALID');keys.add(token);}}
   }return JSON.parse(text);
  }
  async function call(path,body,method='POST'){
   if(!current())throw new TypeError('DAILY_RATE_PARENT_CHANGED');
   const controller=new root.AbortController(),timer=root.setTimeout(()=>controller.abort(),45000);
   try{
   const response=await request(path,{method,signal:controller.signal,headers:{'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
   if(!current())throw new TypeError('DAILY_RATE_PARENT_CHANGED');
   if(!(response instanceof root.Response))throw new TypeError('DAILY_RATE_RESPONSE_INVALID');
   const reader=response.body?.getReader();if(!reader)throw new TypeError('DAILY_RATE_RESPONSE_INVALID');
   const chunks=[];let size=0;
   try{while(true){if(controller.signal.aborted||!current())throw new TypeError('DAILY_RATE_PARENT_CHANGED');const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>131072){await reader.cancel();throw new TypeError('DAILY_RATE_RESPONSE_TOO_LARGE');}chunks.push(part.value);}}
   finally{reader.releaseLock();}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   let value;try{value=uniqueJson(new root.TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new TypeError('DAILY_RATE_RESPONSE_INVALID');}
   if(!current())throw new TypeError('DAILY_RATE_PARENT_CHANGED');
   if(!response.ok){const error=new Error('Daily correction request failed');error.status=response.status;
    error.error_code=typeof value?.error_code==='string'&&/^[A-Z0-9_]+$/.test(value.error_code)?value.error_code:'DAILY_RATE_RESULT_UNCERTAIN';throw error;}
   return value;
   }finally{root.clearTimeout(timer);controller.abort();}
  }
  const result=value=>{dto.validateResult(value);if(value.version!==dto.VERSIONS.DAILY||value.placement.original_timesheet_id!==timesheetId)throw new TypeError('DAILY_RATE_RESULT_BINDING_INVALID');return value;};
  return Object.freeze({actorUserId,pendingStorage,runAction,current,onResult,onClose,
   async preview(body){dto.validatePreviewRequest(body,{daily:true});if(body.timesheet_id!==timesheetId)throw new TypeError('DAILY_RATE_REQUEST_BINDING_INVALID');
    const value=await call('/api/timesheets/'+timesheetId+'/daily-rate-correction/preview',body);dto.validatePreview(value,{daily:true});if(value.current_timesheet_id!==timesheetId)throw new TypeError('DAILY_RATE_RESULT_BINDING_INVALID');return value;},
   async accept(body){dto.validateAcceptRequest(body,{daily:true});const value=result(await call('/api/timesheets/'+timesheetId+'/daily-rate-correction/accept',body));if(value.operation_id!==body.operation_id)throw new TypeError('DAILY_RATE_RESULT_BINDING_INVALID');return value;},
   async get(operationId){if(!UUID.test(operationId||''))throw new TypeError('DAILY_RATE_REQUEST_BINDING_INVALID');const value=result(await call('/api/timesheets/daily-rate-correction/operations/'+operationId,null,'GET'));if(value.operation_id!==operationId)throw new TypeError('DAILY_RATE_RESULT_BINDING_INVALID');return value;}
  });
 }
 root.CloudTMSDailyRateCorrectionHttpV1=Object.freeze({create});
})(typeof window!=='undefined'?window:globalThis);
