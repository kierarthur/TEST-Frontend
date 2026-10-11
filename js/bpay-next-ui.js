/* Shared keyboard/focus behavior for the two existing NEXT dialogs only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudTMSBpayNextUi=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const selector='button,input,select,textarea,a[href],summary,[tabindex]';
  let questionSequence=0;
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
  // Retain the existing Office stack, geometry, Close and Escape lifecycle.
  function createStandardWindowAdapter({document,window,showModal,closeModal}){
    if(typeof showModal!=='function'||typeof closeModal!=='function')throw new Error('Modal unavailable');
    return function({title,content,footer,headerDetail,small=false,confirmation=false,onDismiss,onMount,beforeClose,canFocus=()=>true}){
      let frame=null,closed=false,initialFocus=false,closeWait=null,settleClose=null;
      const settled=value=>{settleClose?.(value);settleClose=null;closeWait=null;};
      const active=()=>!closed&&frame!==null&&window.__modalStack?.at(-1)===frame;
      const mount=()=>{
        if(closed)return;
        const top=window.__modalStack?.at(-1);
        if(!frame){if(top?.kind!=='bpay-next-read')return;frame=top;}
        if(top!==frame)return;
        const panel=document.getElementById('modal');
        panel.classList.add('ctms-modern-modal','ctms-kind-bpay-next-read');
        panel.classList.toggle('bpay-next-small-window',small);
        panel.classList.toggle('bpay-next-wide-window',!small);
        panel.classList.toggle('bpay-next-confirmation',confirmation);
        const question=confirmation?content.querySelector('h2'):null;
        if(question&&!question.id)question.id='bpay-next-question-'+(++questionSequence);
        panel.setAttribute('role',confirmation?'alertdialog':'dialog');
        panel.setAttribute('aria-labelledby',question?.id??'modalTitle');
        document.getElementById('modalTabs').hidden=true;
        document.getElementById('modalTabs').style.display='none';
        const titleHost=document.getElementById('modalTitle');
        titleHost.parentElement.querySelectorAll('[data-next-window-header-detail]').forEach(node=>{if(node!==headerDetail)node.remove();});
        if(headerDetail){headerDetail.dataset.nextWindowHeaderDetail='';titleHost.insertAdjacentElement('afterend',headerDetail);}
        const body=document.getElementById('modalBody');
        if(body.childNodes.length!==1||body.firstChild!==content)body.replaceChildren(content);
        const actions=document.getElementById('modalActions');
        actions.querySelectorAll('[data-next-window-footer]').forEach(node=>{if(node!==footer)node.remove();});
        if(footer){footer.setAttribute('data-next-window-footer','');if(footer.parentElement!==actions)actions.append(footer);}
        window.queueMicrotask(()=>{if(!active())return;onMount?.();if(!initialFocus&&active()&&canFocus()){initialFocus=true;((confirmation&&footer?controls(footer)[0]:controls(content)[0])??document.getElementById('btnCloseModal')).focus();}});
      };
      const dismissed=()=>{if(closed)return;closed=true;footer?.remove();headerDetail?.remove();const tabs=document.getElementById('modalTabs');tabs.hidden=false;tabs.style.display='';const panel=document.getElementById('modal');panel.classList.remove('bpay-next-small-window','bpay-next-wide-window','bpay-next-confirmation');panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','modalTitle');onDismiss?.();settled(true);};
      showModal(title,[{key:'form',label:''}],()=>'',null,true,mount,{
        kind:'bpay-next-read',frameEntity:'banking',showSave:false,showApply:false,
        noParentGate:true,dirtyClosePolicy:'close',runOnRender:true,runAfterMount:true,onDismiss:dismissed,
        beforeClose:typeof beforeClose==='function'?async()=>{let permitted=false;const prefix=window.__modalStack?.slice()??[];try{if(active())permitted=(await beforeClose())===true&&active()&&prefix.length===window.__modalStack?.length&&prefix.every((value,index)=>window.__modalStack[index]===value);}finally{if(!permitted)settled(false);}return permitted;}:null
      });
      frame=window.__modalStack?.at(-1)??frame;
      return Object.freeze({active,alive:()=>!closed&&window.__modalStack?.includes(frame),
        close(){if(!active())return Promise.resolve(false);if(closeWait)return closeWait;const button=document.getElementById('btnCloseModal');if(!button)return Promise.resolve(false);const pending=new Promise(resolve=>{settleClose=resolve;});closeWait=pending;button.click();return pending;},focus(){if(active())document.getElementById('modal').focus();}});
    };
  }
  return Object.freeze({available,controls,trap,capture,restore,continuity,createStandardWindowAdapter});
});
