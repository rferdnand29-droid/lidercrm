(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var repositories = root.repositories = root.repositories || {};
  var config = root.config = root.config || {};

  // ---------- Feature flag ----------
  // Se `config.useWorkerApi === true`, os repositórios preferem a API
  // versionada do Worker (via api.workerClient). Caso contrário caem no
  // acesso legado a `window.db` (compatível com o supabase.js adapter).
  if(typeof config.useWorkerApi === 'undefined') config.useWorkerApi = false;

  function BaseRepository(collectionName, resourceName){
    this.collectionName = collectionName;
    this.resource = resourceName || collectionName; // por padrão o nome bate com a rota REST
  }

  function hasWorkerClient(){
    return !!(config.useWorkerApi && root.api && root.api.workerClient);
  }

  // ---- Modo legado (compatibilidade 100% com o código pré-Fase-2) ----
  BaseRepository.prototype.getCollection = function(){
    if(!global.db || typeof global.db.collection !== 'function')return null;
    return global.db.collection(this.collectionName);
  };
  BaseRepository.prototype.getDocument = function(documentId){
    var collection = this.getCollection();
    if(!collection || !documentId)return Promise.resolve(null);
    return collection.doc(documentId).get();
  };
  BaseRepository.prototype.setDocument = function(documentId, payload, options){
    var collection = this.getCollection();
    if(!collection || !documentId)return Promise.reject(new Error('repository-unavailable'));
    return collection.doc(documentId).set(payload || {}, options || undefined);
  };
  BaseRepository.prototype.updateDocument = function(documentId, payload){
    var collection = this.getCollection();
    if(!collection || !documentId)return Promise.reject(new Error('repository-unavailable'));
    return collection.doc(documentId).update(payload || {});
  };
  BaseRepository.prototype.deleteDocument = function(documentId){
    var collection = this.getCollection();
    if(!collection || !documentId)return Promise.reject(new Error('repository-unavailable'));
    return collection.doc(documentId).delete();
  };

  // ---- Modo Worker (Fase 2) — quando config.useWorkerApi === true ----
  function ok(res){
    if(!res || !res.ok) throw new Error(
      (res && res.data && res.data.error && res.data.error.message) || 'worker-request-failed'
    );
    return res.data && res.data.data !== undefined ? res.data.data : res.data;
  }
  BaseRepository.prototype.apiList = function(query){
    if(!hasWorkerClient()) return Promise.resolve(null);
    return root.api.workerClient.list(this.resource, query).then(ok);
  };
  BaseRepository.prototype.apiCreate = function(payload){
    if(!hasWorkerClient()) return Promise.resolve(null);
    return root.api.workerClient.create(this.resource, payload).then(ok);
  };
  BaseRepository.prototype.apiUpdate = function(id, payload){
    if(!hasWorkerClient()) return Promise.resolve(null);
    return root.api.workerClient.update(this.resource, id, payload).then(ok);
  };
  BaseRepository.prototype.apiDelete = function(id){
    if(!hasWorkerClient()) return Promise.resolve(null);
    return root.api.workerClient.remove(this.resource, id).then(ok);
  };
  BaseRepository.prototype.prefersWorker = function(){
    return hasWorkerClient();
  };

  repositories.BaseRepository = BaseRepository;
})(window);
