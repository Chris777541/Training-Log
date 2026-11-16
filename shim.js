/* On-device storage that stands in for the Claude artifact database, so the same app runs standalone on the iPhone. */
(function(){
  "use strict";
  const KEY="tlog-db-v1";let store={};
  try{store=JSON.parse(localStorage.getItem(KEY)||"{}")||{}}catch(_){store={}}
  try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(_){}
  const clone=v=>JSON.parse(JSON.stringify(v));
  function save(){try{localStorage.setItem(KEY,JSON.stringify(store));return true}catch(e){return false}}
  const docL=new Map(),colL=new Map();
  const parent=p=>p.split("/").slice(0,-1).join("/");
  const snapDoc=p=>({id:p.split("/").pop(),exists:p in store,data:()=>p in store?clone(store[p]):undefined,metadata:{fromCache:false,hasPendingWrites:false}});
  function snapCol(c){const docs=Object.keys(store).filter(k=>parent(k)===c).sort().map(snapDoc);return{docs,size:docs.length,empty:!docs.length,docChanges:()=>[],metadata:{fromCache:false,hasPendingWrites:false}}}
  function notify(p){const c=parent(p);setTimeout(()=>{(docL.get(p)||[]).forEach(f=>f(snapDoc(p)));(colL.get(c)||[]).forEach(f=>f(snapCol(c)))},0)}
  function on(map,k,fn){if(!map.has(k))map.set(k,new Set());map.get(k).add(fn);return()=>map.get(k).delete(fn)}
  function doc(p){return{id:p.split("/").pop(),path:p,
    get:async()=>snapDoc(p),
    set:async d=>{const prev=store[p];store[p]=clone(d);if(!save()){if(prev===undefined)delete store[p];else store[p]=prev;throw{code:"quota_exceeded",message:"Phone storage is full"}}notify(p)},
    update:async d=>{if(!(p in store))throw{code:"invalid_argument",message:"missing"};store[p]=Object.assign(store[p],clone(d));save();notify(p)},
    delete:async()=>{delete store[p];save();notify(p)},
    onSnapshot:(next)=>{setTimeout(()=>next(snapDoc(p)),0);return on(docL,p,next)},
    collection:c=>col(p+"/"+c)}}
  function col(c){let n=0;return{path:c,doc:id=>doc(c+"/"+(id||Date.now().toString(36)+(n++))),
    add:async d=>{const r=doc(c+"/"+Date.now().toString(36)+(n++));await r.set(d);return r},
    get:async()=>snapCol(c),onSnapshot:(next)=>{setTimeout(()=>next(snapCol(c)),0);return on(colL,c,next)}}}
  const db={doc,collection:col};
  const user={id:async()=>"me",me:async()=>({id:"me"}),isOwner:()=>true,canEdit:()=>true,can:async()=>true,profiles:async()=>({})};
  const MIME={pdf:"application/pdf",csv:"text/csv",json:"application/json"};
  function sheet(filename,blob){return new Promise((res,rej)=>{
    const wrap=document.createElement("div");wrap.className="savesheet";
    wrap.innerHTML=`<div class="savecard" role="dialog" aria-modal="true" aria-label="Save file"><b>Your file is ready</b><span></span><div class="row"><button class="primary" data-a="save">Save or share</button><button data-a="cancel">Cancel</button></div></div>`;
    wrap.querySelector("span").textContent=filename;document.body.appendChild(wrap);
    wrap.addEventListener("click",async ev=>{const a=ev.target.closest("[data-a]");if(!a)return;
      if(a.dataset.a==="cancel"){wrap.remove();return rej({code:"declined",message:"cancelled"})}
      const file=new File([blob],filename,{type:blob.type});
      try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file]});wrap.remove();return res({status:"saved"})}}
      catch(e){if(e&&e.name==="AbortError"){wrap.remove();return rej({code:"declined",message:"cancelled"})}}
      const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);wrap.remove();res({status:"saved"})});
  })}
  const downloads={save:async({filename,data})=>{const ext=(filename.split(".").pop()||"").toLowerCase();
    const blob=data instanceof Blob?data:new Blob([data],{type:MIME[ext]||"application/octet-stream"});return sheet(filename,new Blob([blob],{type:MIME[ext]||blob.type}))}};
  const caps={db,user,downloads};
  window.claude={use:async n=>caps[n]||null};
  if("serviceWorker" in navigator&&location.protocol!=="file:")window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
