(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var offline = root.offline = root.offline || {};
  var STORAGE_KEY = 'lidercrm_retry_queue_v1';

  function loadFromStorage(){
    try{
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    }catch(_e){ return []; }
  }
  function saveToStorage(items){
    try{ global.localStorage.setItem(STORAGE_KEY, JSON.stringify(items || [])); }catch(_e){}
  }

  // Fila persistente de operações a re-tentar quando offline.
  // Item = { id, method, path, body, attempts, nextAt, meta }
  function RetryQueue(){
    this.items = loadFromStorage();
    this.listeners = [];
  }
  RetryQueue.prototype._flush = function(){ saveToStorage(this.items); this._notify(); };
  RetryQueue.prototype._notify = function(){
    var self = this;
    this.listeners.forEach(function(fn){ try{ fn(self.items); }catch(_e){} });
  };
  RetryQueue.prototype.subscribe = function(fn){
    if(typeof fn !== 'function') return function(){};
    this.listeners.push(fn);
    var self = this;
    return function(){
      self.listeners = self.listeners.filter(function(x){ return x !== fn; });
    };
  };
  RetryQueue.prototype.enqueue = function(op){
    var item = Object.assign({
      id: 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7),
      attempts: 0,
      enqueuedAt: Date.now(),
      nextAt: Date.now()
    }, op || {});
    this.items.push(item);
    this._flush();
    return item;
  };
  RetryQueue.prototype.list = function(){ return this.items.slice(); };
  RetryQueue.prototype.size = function(){ return this.items.length; };
  RetryQueue.prototype.clear = function(){ this.items = []; this._flush(); };
  RetryQueue.prototype.remove = function(id){
    this.items = this.items.filter(function(i){ return i.id !== id; });
    this._flush();
  };
  RetryQueue.prototype.markFailed = function(id, backoff){
    var self = this;
    this.items = this.items.map(function(i){
      if(i.id !== id) return i;
      i.attempts = (i.attempts || 0) + 1;
      i.nextAt = Date.now() + (backoff ? backoff.delay(i.attempts) : 5000);
      return i;
    });
    this._flush();
  };
  RetryQueue.prototype.due = function(){
    var now = Date.now();
    return this.items.filter(function(i){ return (i.nextAt || 0) <= now; });
  };

  offline.RetryQueue = RetryQueue;
  offline.retryQueue = new RetryQueue();
})(window);
