(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var offline = root.offline = root.offline || {};

  // Faz o drain da RetryQueue quando o navegador volta online.
  // Cada item roda contra api.workerClient (ou api.httpClient).
  function SyncManager(options){
    options = options || {};
    this.queue = options.queue || offline.retryQueue;
    this.backoff = options.backoff || new offline.Backoff({ baseMs: 1500, maxMs: 60000 });
    this.manager = options.manager || offline.manager;
    this.intervalMs = options.intervalMs || 15000;
    this._timer = null;
    this._running = false;
    var self = this;
    if(this.manager && typeof this.manager.subscribe === 'function'){
      this.manager.subscribe(function(online){
        if(online) self.drain();
      });
    }
  }
  SyncManager.prototype.start = function(){
    if(this._timer) return;
    var self = this;
    this._timer = setInterval(function(){ self.drain(); }, this.intervalMs);
  };
  SyncManager.prototype.stop = function(){
    if(this._timer) clearInterval(this._timer);
    this._timer = null;
  };
  SyncManager.prototype.drain = function(){
    if(this._running) return Promise.resolve({ processed: 0 });
    if(this.manager && !this.manager.isOnline()) return Promise.resolve({ processed: 0, offline: true });
    var self = this;
    this._running = true;
    var due = this.queue.due();
    var processed = 0;
    return due.reduce(function(chain, item){
      return chain.then(function(){
        return self._execute(item).then(function(){
          self.queue.remove(item.id);
          processed++;
        }).catch(function(){
          self.queue.markFailed(item.id, self.backoff);
        });
      });
    }, Promise.resolve()).then(function(){
      self._running = false;
      return { processed: processed };
    }).catch(function(err){
      self._running = false;
      throw err;
    });
  };
  SyncManager.prototype._execute = function(item){
    var wc = root.api && root.api.workerClient;
    if(!wc) return Promise.reject(new Error('workerClient-indisponivel'));
    var body = item.body || null;
    var q = item.query || null;
    /* [FIX 20260903b] api/v1undefined: as DUAS filas de retentativas do
       projeto (esta e src/modules/sync/runtime/retry-queue-sync.js)
       compartilham a mesma chave de localStorage, mas a legada grava o
       destino no campo `url` e esta lê `path`. Um item legado drenado
       aqui chegava com path undefined e o worker-client montava a URL
       '/api/v1undefined' — daí os 404 em loop no console. Correção:
       normaliza o destino antes de executar — aceita `url` no formato
       relativo da API ('/api/v1/...') extraindo o path; item com destino
       fora da API do Worker (ex.: URL absoluta do Supabase, que só a
       fila legada sabe executar) é recusado sem request quebrada. */
    if(typeof item.path !== 'string' || !item.path){
      var alt = item && item.url;
      if(typeof alt === 'string' && alt.indexOf('/api/v1/') >= 0){
        item.path = alt.slice(alt.indexOf('/api/v1/') + '/api/v1'.length);
      } else {
        return Promise.reject(new Error('retry-item-sem-path-da-api:' + String(alt || '')));
      }
    }
    if(item.method === 'GET')    return wc.request(item.path, { method: 'GET' });
    if(item.method === 'POST')   return wc.request(item.path, { method: 'POST', body: body });
    if(item.method === 'PUT')    return wc.request(item.path, { method: 'PUT', body: body });
    if(item.method === 'PATCH')  return wc.request(item.path, { method: 'PATCH', body: body });
    if(item.method === 'DELETE') return wc.request(item.path, { method: 'DELETE' });
    return Promise.reject(new Error('metodo-desconhecido:' + item.method));
  };

  offline.SyncManager = SyncManager;
  offline.sync = new SyncManager();
})(window);
