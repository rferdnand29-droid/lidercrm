(function(global){
  'use strict';
  if(!global || !global.document) return;
  var root=global.LiderCRM=global.LiderCRM||{};
  if(root.__lf_popup_sync_v1__) return;
  root.__lf_popup_sync_v1__=true;

  var CHANNEL_NAME='lf_data_sync_v1';
  var WORKER_URL='js/shared/data-worker.js?v=20260728popup1';
  var senderId='lfds_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  var bc=null;
  var workerPort=null;
  var seen=Object.create(null);
  var memCache=Object.create(null);
  var pendingRequests=Object.create(null);
  var refreshTimer=null;

  function now(){ return Date.now(); }
  function clone(v){ try{return JSON.parse(JSON.stringify(v));}catch(_e){ return null; } }
  function randomId(prefix){ return String(prefix||'lf')+'_'+now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
  function safeDispatch(name,detail){ try{ global.dispatchEvent(new CustomEvent(name,{detail:detail||{}})); }catch(_e){} }
  function isNativeCapacitor(){
    try{ return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform()); }catch(_e){ return false; }
  }
  function remember(id){
    if(!id) return false;
    if(seen[id]) return true;
    seen[id]=now();
    if(Object.keys(seen).length>600){
      var limit=now()-120000;
      Object.keys(seen).forEach(function(k){ if((seen[k]||0)<limit) delete seen[k]; });
    }
    return false;
  }
  function cacheStoreLocal(key,value,ttlMs,ts){
    memCache[key]={ value: clone(value), ts: ts||now(), expiresAt: now()+Math.max(1000, Number(ttlMs)||15000) };
    return memCache[key];
  }
  function cacheReadLocal(key){
    var entry=memCache[key];
    if(!entry) return null;
    if(entry.expiresAt && entry.expiresAt<now()){
      delete memCache[key];
      return null;
    }
    return { value: clone(entry.value), ts: entry.ts, expiresAt: entry.expiresAt };
  }
  function cacheInvalidateLocal(prefix){
    Object.keys(memCache).forEach(function(key){ if(!prefix || key.indexOf(prefix)===0) delete memCache[key]; });
  }
  function ensureBC(){
    if(bc || !global.BroadcastChannel) return bc;
    try{
      bc=new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage=function(ev){ handleMessage(ev&&ev.data||null,'bc'); };
    }catch(_e){ bc=null; }
    return bc;
  }
  function ensureWorker(){
    if(workerPort || isNativeCapacitor() || !global.SharedWorker) return workerPort;
    try{
      var worker=new SharedWorker(WORKER_URL);
      workerPort=worker.port;
      workerPort.start();
      workerPort.onmessage=function(ev){ handleMessage(ev&&ev.data||null,'worker'); };
      workerPort.postMessage({ id: randomId('hello'), type:'hello', senderId:senderId, ts:now() });
    }catch(_e){ workerPort=null; }
    return workerPort;
  }
  function postEverywhere(msg){
    if(!msg) return;
    if(!msg.id) msg.id=randomId('msg');
    msg.senderId=msg.senderId||senderId;
    remember(msg.id);
    try{ var chan=ensureBC(); if(chan) chan.postMessage(msg); }catch(_e){}
    try{ var port=ensureWorker(); if(port) port.postMessage(msg); }catch(_e){}
  }
  function requestWorker(type,payload,timeoutMs){
    return new Promise(function(resolve){
      var port=ensureWorker();
      if(!port){ resolve(null); return; }
      var requestId=randomId('req');
      var timer=setTimeout(function(){ delete pendingRequests[requestId]; resolve(null); }, Math.max(20, timeoutMs||60));
      pendingRequests[requestId]=function(msg){ clearTimeout(timer); delete pendingRequests[requestId]; resolve(msg||null); };
      try{ port.postMessage(Object.assign({ id: randomId('ask'), type:type, requestId:requestId, senderId:senderId, ts:now() }, payload||{})); }
      catch(_e){ clearTimeout(timer); delete pendingRequests[requestId]; resolve(null); }
    });
  }
  function applyRemoteStorage(key,value,ts){
    if(!key) return;
    try{
      var raw=JSON.stringify(value);
      if(global.localStorage.getItem(key)!==raw){
        global.localStorage.setItem(key, raw);
      }
    }catch(_e){}
    safeDispatch('lf:data-sync',{ key:key, value:clone(value), ts:ts||now() });
    scheduleRefresh(key);
  }
  function scheduleRefresh(key){
    if(!key) return;
    if(refreshTimer) clearTimeout(refreshTimer);
    refreshTimer=setTimeout(function(){ refreshTimer=null; refreshFromKey(key); }, 50);
  }
  function visiblePage(){
    try{
      var on=document.querySelector('.pg.on');
      return on&&on.id?String(on.id).replace(/^pg-/,''):null;
    }catch(_e){ return null; }
  }
  function refreshFromKey(key){
    var page=visiblePage();
    try{
      if(/^lf6_kb_leads_/.test(key)){
        if(typeof global.renderKBLocal==='function' && (page==='leads'||page==='adm'||page==='time')) global.renderKBLocal('leads');
        return;
      }
      if(/^lf6_kb_negocios_/.test(key)){
        if(typeof global.renderKBLocal==='function' && (page==='negocios'||page==='adm'||page==='time')) global.renderKBLocal('negocios');
        return;
      }
      if(/^lf6_c_/.test(key)){
        if(page==='dash' && typeof global.renderDash==='function') global.renderDash();
        if(page==='anal' && typeof global.loadCli==='function' && global.S && global.S.userId && typeof global.drawAnal==='function'){
          global.loadCli(global.S.userId,function(list){
            try{ global.drawAnal(list,'krow','funil','psvg','pleg','metas'); }catch(_e){}
            try{ if(typeof global.drawNegKPIs==='function') global.drawNegKPIs(global.S.userId); }catch(_e){}
          });
        }
        return;
      }
      if(key==='lf6_u'){
        try{ if(typeof global.renderUsers==='function') global.renderUsers(); }catch(_e){}
        try{ if(typeof global.buildNav==='function') global.buildNav(); }catch(_e){}
        return;
      }
      if(key==='lf_departments'){
        safeDispatch('lf:departments-updated',{ reason:'cross-window-sync' });
        return;
      }
      if(/^lf_notif_/.test(key)){
        try{ if(typeof global.updateNotifBadge==='function') global.updateNotifBadge(); }catch(_e){}
        try{
          var panel=document.getElementById('ntf-panel');
          if(panel && panel.classList.contains('open') && typeof global.renderNotifPanel==='function' && typeof global.getNotifs==='function' && global.S){
            global.renderNotifPanel(global.getNotifs(global.S.userId));
          }
        }catch(_e){}
        return;
      }
      if(/^lf13_acts_/.test(key)){
        try{ if(typeof global.updateActBadge==='function') global.updateActBadge(); }catch(_e){}
        try{
          var actPanel=document.getElementById('act-panel');
          if(actPanel && actPanel.classList.contains('open') && typeof global.renderActPanel==='function') global.renderActPanel();
        }catch(_e){}
        try{ if(typeof global.refreshLinkedActivitySummaries==='function') global.refreshLinkedActivitySummaries(); }catch(_e){}
        return;
      }
      if(key==='lf13_chat_convs' || /^lf13_chat_msgs_/.test(key) || key==='lf_chat_last_conv'){
        try{ if(typeof global.renderChatList==='function') global.renderChatList(); }catch(_e){}
        if(page==='chat'){
          var convId=null;
          if(/^lf13_chat_msgs_/.test(key)) convId=key.replace(/^lf13_chat_msgs_/, '');
          else convId=global._chatCurrentConv || null;
          if(!convId){
            try{ convId=global.localStorage.getItem('lf_chat_last_conv')||null; }catch(_e){}
          }
          if(convId && typeof global.openChatConv==='function'){
            try{ global.openChatConv(convId); }catch(_e){}
          }
        }
      }
    }catch(_e){}
  }
  function handleMessage(msg, source){
    if(!msg || (msg.senderId && msg.senderId===senderId) || remember(msg.id)) return;
    if(msg.requestId && pendingRequests[msg.requestId]){
      pendingRequests[msg.requestId](msg);
      return;
    }
    if(msg.type==='storage-set'){
      applyRemoteStorage(msg.key, msg.value, msg.ts);
      return;
    }
    if(msg.type==='http-cache-put'){
      cacheStoreLocal(msg.key, msg.value, msg.ttlMs, msg.ts);
      return;
    }
    if(msg.type==='http-cache-invalidate-prefix'){
      cacheInvalidateLocal(msg.prefix||'');
      return;
    }
    if(msg.type==='mutation'){
      safeDispatch('lf:mutation-sync', Object.assign({ source:source||'bus' }, msg));
      if(msg.key) scheduleRefresh(msg.key);
    }
  }

  var sharedData={
    senderId: senderId,
    onStorageSet: function(key,value){
      postEverywhere({ type:'storage-set', key:key, value:clone(value), ts:now() });
    },
    publishMutation: function(kind,payload){
      var body=Object.assign({ type:'mutation', kind:kind||'generic', ts:now() }, payload||{});
      postEverywhere(body);
    },
    httpCacheKey: function(method,path,query){
      method=String(method||'GET').toUpperCase();
      var suffix='';
      if(query && typeof query==='object'){
        try{
          var keys=Object.keys(query).filter(function(k){ return query[k]!==undefined && query[k]!==null; }).sort();
          suffix=keys.map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(String(query[k])); }).join('&');
        }catch(_e){ suffix=''; }
      }
      return method+'::'+String(path||'')+(suffix?('?'+suffix):'');
    },
    httpCacheGet: function(key){
      var local=cacheReadLocal(key);
      if(local && typeof local.value!=='undefined' && local.value!==null) return Promise.resolve(clone(local.value));
      return requestWorker('http-cache-get', { key:key }, 70).then(function(msg){
        var entry=msg&&msg.entry;
        if(!entry || typeof entry.value==='undefined' || entry.value===null) return null;
        cacheStoreLocal(key, entry.value, Math.max(1000,(entry.expiresAt||now())-now()), entry.ts);
        return clone(entry.value);
      });
    },
    httpCachePut: function(key,value,ttlMs){
      cacheStoreLocal(key, value, ttlMs, now());
      postEverywhere({ type:'http-cache-put', key:key, value:clone(value), ttlMs:Math.max(1000, Number(ttlMs)||15000), ts:now() });
    },
    httpCacheInvalidatePrefix: function(prefix){
      cacheInvalidateLocal(prefix||'');
      postEverywhere({ type:'http-cache-invalidate-prefix', prefix:prefix||'', ts:now() });
    }
  };

  root.sharedData=sharedData;
  ensureBC();
  ensureWorker();

  global.__lfFocusPage=function(page,handoffId){
    try{
      if(typeof global._lfWriteWarmState==='function') global._lfWriteWarmState(page,{ reason:'reuse-popup-window', handoffId:handoffId||null });
    }catch(_e){}
    try{
      if(global.S && typeof global.goPage==='function'){
        global.goPage(page);
        if(global.focus) global.focus();
        return true;
      }
    }catch(_e){}
    return false;
  };

  global.addEventListener('storage', function(ev){
    try{
      if(ev && ev.key && ev.newValue!=null) scheduleRefresh(ev.key);
    }catch(_e){}
  });
})(window);
