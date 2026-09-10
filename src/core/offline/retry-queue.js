(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var offline = root.offline = root.offline || {};
  // Chave canônica compartilhada com os dois runtimes de sync. Manter uma
  // única fila evita que uma operação fique presa em um dreno diferente.
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
  // AUDITORIA-FINAL-10 (2026-08-01, item 2.6): antes, this.items era lido do
  // localStorage só no construtor e ficava em memória — se OUTRA aba
  // escrevesse na fila nesse meio-tempo, o próximo _flush() desta aba
  // sobrescrevia o localStorage com o array em memória (desatualizado),
  // perdendo o item que a outra aba tinha acabado de gravar. Cada método que
  // muta a fila agora relê o localStorage primeiro (síncrono, sem custo de
  // rede/IO real) e aplica sua mudança em cima do estado mais recente —
  // fecha a janela de perda sem precisar de navigator.locks (que exigiria
  // tornar enqueue/remove/markFailed assíncronos, quebrando a API pública
  // síncrona que sync-manager.js já depende).
  RetryQueue.prototype._resync = function(){ this.items = loadFromStorage(); };
  RetryQueue.prototype.enqueue = function(op){
    this._resync();
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
    this._resync();
    this.items = this.items.filter(function(i){ return i.id !== id; });
    this._flush();
  };
  RetryQueue.prototype.markFailed = function(id, backoff){
    this._resync();
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
    this._resync();
    var now = Date.now();
    return this.items.filter(function(i){ return (i.nextAt || 0) <= now; });
  };

  offline.RetryQueue = RetryQueue;
  offline.retryQueue = new RetryQueue();
})(window);
