/* Agency owner display authority. One bounded read per open; never a money owner. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CloudTMSBpayNextOwner = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const STALE = Object.freeze(['BPAY_NEXT_COMMAND_MODULE_NOT_ACTIVE', 'BPAY_NEXT_PREPARATION_MODULE_NOT_ACTIVE']);
  const OWNER = '"active_owner"\\s*:\\s*"(?:LEGACY|NEXT|DISABLED)"';
  const EPOCH = '"owner_epoch"\\s*:\\s*"[1-9]\\d{0,18}"';
  const RAW = new RegExp('^\\s*\\{\\s*(?:'+OWNER+'\\s*,\\s*'+EPOCH+'|'+EPOCH+'\\s*,\\s*'+OWNER+')\\s*\\}\\s*$');
  function validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== 2 || !Object.hasOwn(value,'active_owner') || !Object.hasOwn(value,'owner_epoch')
        || !['LEGACY','NEXT','DISABLED'].includes(value.active_owner)
        || typeof value.owner_epoch !== 'string' || !/^[1-9]\d{0,18}$/.test(value.owner_epoch)
        || BigInt(value.owner_epoch) > 9223372036854775807n) throw new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE');
    return Object.freeze({active_owner:value.active_owner,owner_epoch:value.owner_epoch});
  }
  function create(options) {
    if (typeof options?.api !== 'function' || typeof options.authFetch !== 'function'
        || typeof options.currentActorId !== 'function' || typeof options.actorId !== 'string') throw new TypeError('BPAY_NEXT_OWNER_DEPENDENCY_UNAVAILABLE');
    let scope=null, generation=0, status=null, pending=null, controller=null, closed=false;
    const changed=()=>options.onChange?.(snapshot());
    const snapshot=()=>Object.freeze({scope,status,pending:pending!==null,available:status!==null});
    function current() {return !closed && options.currentActorId()===options.actorId;}
    function reset(nextScope) {generation++;controller?.abort();controller=null;status=null;pending=null;scope=nextScope;changed();}
    async function read() {
      if (!current() || scope===null) throw new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE');
      if (status) return status;
      if (pending) return pending;
      const ownGeneration=generation, ownScope=scope;
      controller=new AbortController();const ownController=controller;let timer,reader,response,abandoned=false;
      const cancel=()=>{try{const p=reader?reader.cancel():response?.body?.cancel();if(p)void p.catch(()=>{});}catch{}};
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{abandoned=true;ownController.abort();cancel();reject(new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE'));},8000);});
      const invoke=async()=>{
        response=await options.authFetch(options.api('/api/banking/pay/next/owner-status'),{
          method:'GET',headers:{accept:'application/json'},signal:ownController.signal,redirect:'error',auth401Mode:'return'
        });
        if (abandoned || !current() || ownGeneration!==generation) {cancel();throw new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE');}
        if (!(response instanceof Response) || response.status!==200 || !response.body
            || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'')) throw new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE');
        const length=response.headers.get('content-length');
        if(length!==null && (!/^\d+$/.test(length)||Number(length)>1024))throw new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE');
        reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
        while(true){const part=await Promise.race([reader.read(),deadline]);if(ownController.signal.aborted)throw new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE');if(part.done)break;bytes+=part.value.byteLength;if(bytes>1024)throw new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE');text+=decoder.decode(part.value,{stream:true});}
        text+=decoder.decode();if(!RAW.test(text))throw new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE');return validate(JSON.parse(text));
      };
      const task=Promise.race([invoke(),deadline]).then(value=>{
        if(!current()||ownGeneration!==generation||ownScope!==scope)throw new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE');
        status=value;return value;
      }).catch(()=>{throw new Error('BPAY_NEXT_OWNER_STATUS_UNAVAILABLE');}).finally(()=>{
        clearTimeout(timer);abandoned=true;ownController.abort();cancel();try{reader?.releaseLock();}catch{}
        if(ownGeneration===generation){pending=null;controller=null;changed();}
      });
      pending=task;changed();return task;
    }
    function begin(nextScope){if(typeof nextScope!=='string'||!nextScope.length||nextScope.length>256)throw new TypeError('BPAY_NEXT_OWNER_SCOPE_INVALID');reset(nextScope);return read();}
    function qualify(nextScope){if(scope!==null && (scope.startsWith('banking:')||scope===nextScope))return read();return begin(nextScope);}
    function invalidate(code){if(!STALE.includes(code))return Promise.resolve(status);reset(scope);return read();}
    function close(){closed=true;reset(null);}
    return Object.freeze({begin,qualify,read,peek:()=>current()?status:null,snapshot,invalidate,close});
  }
  function message(status, legacyDestination=false) {
    if(!status)return 'Banking ownership is unavailable. Money controls are disabled.';
    if(status.active_owner==='DISABLED')return 'Banking Pay is paused.';
    if(status.active_owner==='LEGACY')return 'Banking Pay NEXT is inactive for this agency.';
    return legacyDestination?'This destination is unavailable under Banking Pay NEXT. Open Banking Pay NEXT.':'Banking Pay NEXT is active.';
  }
  return Object.freeze({create,validate,message,staleCodes:STALE});
});
