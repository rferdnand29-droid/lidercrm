(function(){
  'use strict';
  var ports=[];
  var storageMap=Object.create(null);
  var cacheMap=Object.create(null);
  var seen=Object.create(null);

  function now(){ return Date.now(); }
  function clone(v){ try{return JSON.parse(JSON.stringify(v));}catch(_e){ return null; } }
  function remember(id){
    if(!id) return false;
    if(seen[id]) return true;
    seen[id]=now();
    if(Object.keys(seen).length>500){
      var limit=now()-120000;
      Object.keys(seen).forEach(function(k){ if((seen[k]||0)<limit) delete seen[k]; });
    }
    return false;
  }
  function post(port,msg){ try{ port.postMessage(msg); }catch(_e){} }
  function broadcast(msg,excludePort){
    ports.slice().forEach(function(port){
      if(port===excludePort) return;
      post(port,msg);
    });
  }
  function cacheGet(key){
    var entry=cacheMap[key];
    if(!entry) return null;
    if(entry.expiresAt && entry.expiresAt<now()){
      delete cacheMap[key];
      return null;
    }
    return { value: clone(entry.value), ts: entry.ts, expiresAt: entry.expiresAt };
  }
  function cachePut(key,value,ttlMs){
    cacheMap[key]={
      value: clone(value),
      ts: now(),
      expiresAt: now()+Math.max(1000, Number(ttlMs)||15000)
    };
  }
  function cacheInvalidatePrefix(prefix){
    Object.keys(cacheMap).forEach(function(key){
      if(!prefix || key.indexOf(prefix)===0) delete cacheMap[key];
    });
  }

  onconnect=function(ev){
    var port=ev.ports&&ev.ports[0];
    if(!port) return;
    ports.push(port);
    port.start();
    port.onmessage=function(evt){
      var msg=evt&&evt.data||{};
      if(!msg || remember(msg.id)) return;
      if(msg.type==='hello'){
        post(port,{ type:'hello-ack', id:msg.id, senderId:'shared-worker', ts:now() });
        return;
      }
      if(msg.type==='storage-set'){
        storageMap[msg.key]={ value: clone(msg.value), ts: msg.ts||now() };
        broadcast(msg, port);
        return;
      }
      if(msg.type==='storage-get'){
        var stored=storageMap[msg.key]||null;
        post(port,{ type:'storage-get-result', requestId:msg.requestId, key:msg.key, entry:stored?{ value: clone(stored.value), ts:stored.ts }:null });
        return;
      }
      if(msg.type==='http-cache-put'){
        cachePut(msg.key, msg.value, msg.ttlMs);
        broadcast(msg, port);
        return;
      }
      if(msg.type==='http-cache-get'){
        post(port,{ type:'http-cache-get-result', requestId:msg.requestId, key:msg.key, entry:cacheGet(msg.key) });
        return;
      }
      if(msg.type==='http-cache-invalidate-prefix'){
        cacheInvalidatePrefix(msg.prefix||'');
        broadcast(msg, port);
        return;
      }
      if(msg.type==='mutation'){
        broadcast(msg, port);
      }
    };
    port.onmessageerror=function(){};
  };
})();
