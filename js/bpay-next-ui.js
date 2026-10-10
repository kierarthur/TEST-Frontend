/* Shared keyboard/focus behavior for the two existing NEXT dialogs only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextUi=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const selector='button,input,select,textarea,a[href],summary,[tabindex]';
  function available(node){return Boolean(node && node.isConnected && !node.disabled && !node.matches?.(':disabled') && node.tabIndex>=0 && node.getAttribute('aria-disabled')!=='true' && !node.closest('[hidden],[inert],[aria-hidden="true"]') && !['hidden','collapse'].includes(node.ownerDocument?.defaultView?.getComputedStyle(node).visibility) && node.getClientRects().length);}
  function controls(host){return Array.from(host.querySelectorAll(selector)).filter(available);}
  function trap(event,host,document){
    if(event.key!=='Tab')return;
    const nodes=controls(host),index=nodes.indexOf(document.activeElement);
    if(!nodes.length){event.preventDefault();host.focus();}
    else if(index<0 || (event.shiftKey?index===0:index===nodes.length-1)){event.preventDefault();nodes[event.shiftKey?nodes.length-1:0].focus();}
    event.stopPropagation();
  }
  function key(node){return node?.getAttribute?.('data-next-focus-key')||null;}
  function capture(host,document){const node=document.activeElement;if(!host.contains(node))return null;return {key:key(node),start:typeof node.selectionStart==='number'?node.selectionStart:null,end:typeof node.selectionEnd==='number'?node.selectionEnd:null};}
  function restore(host,token,fallback){
    const target=token?.key?Array.from(host.querySelectorAll('[data-next-focus-key]')).find(node=>key(node)===token.key&&available(node)):null;
    const node=target||(available(fallback)?fallback:host);node.focus();
    if(target&&token.start!==null&&typeof target.setSelectionRange==='function'){try{target.setSelectionRange(token.start,token.end);}catch{}}
    return target||null;
  }
  function continuity(host,document,fallback){
    let pending=null,temporary=null;
    return Object.freeze({
      before(){const active=document.activeElement;if(active!==temporary)pending=capture(host,document);return pending;},
      after(token){if(!token)return;const target=restore(host,token,fallback());temporary=target?null:document.activeElement;pending=target?null:token;},
      select(token){pending=token;temporary=document.activeElement;}
    });
  }
  return Object.freeze({available,controls,trap,capture,restore,continuity});
});
