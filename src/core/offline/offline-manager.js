(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var offline = root.offline = root.offline || {};

  // Observa navigator.onLine + eventos online/offline e emite estado.
  // Fornece um cache local simples de leituras GET para respostas do
  // Worker (chave = path + query serializada).
  var CACHE_KEY_PREFIX = 'lidercrm_cache_v1:';

  function OfflineManager(){
    this.online = typeof navigator !== 'undefined' ? !!navigator.onLine : true;
    this.listeners = [];
    var self = this;
    if(typeof global.addEventListener === 'function'){
      global.addEventListener('online',  function(){ self._setOnline(true);  });
      global.addEventListener('offline', function(){ self._setOnline(false); });
    }
  }
  OfflineManager.prototype._setOnline = function(v){
    if(this.online === v) return;
    this.online = v;
    var self = this;
    this.listeners.forEach(function(fn){ try{ fn(self.online); }catch(_e){} });
  };
  OfflineManager.prototype.isOnline = function(){ return this.online; };
  OfflineManager.prototype.subscribe = function(fn){
    if(typeof fn !== 'function') return function(){};
    this.listeners.push(fn);
    var self = this;
    return function(){ self.listeners = self.listeners.filter(function(x){ return x !== fn; }); };
  };
  OfflineManager.prototype.cacheGet = function(key){
    try{
      var raw = global.localStorage.getItem(CACHE_KEY_PREFIX + key);
      if(!raw) return null;
      var payload = JSON.parse(raw);
      return payload && payload.data ? payload : null;
    }catch(_e){ return null; }
  };
  OfflineManager.prototype.cacheSet = function(key, data, ttlSeconds){
    try{
      var payload = { at: Date.now(), ttl: (ttlSeconds || 300) * 1000, data: data };
      global.localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(payload));
    }catch(_e){}
  };
  OfflineManager.prototype.cacheDrop = function(key){
    try{ global.localStorage.removeItem(CACHE_KEY_PREFIX + key); }catch(_e){}
  };

  offline.OfflineManager = OfflineManager;
  offline.manager = new OfflineManager();
})(window);
