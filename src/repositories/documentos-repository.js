(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var repositories = root.repositories = root.repositories || {};
  var BaseRepository = repositories.BaseRepository;

  function docData(snapshot){
    if(!snapshot) return null;
    return typeof snapshot.data === 'function' ? snapshot.data() : snapshot;
  }

  function workerReady(){
    var api = root.api || {};
    return !!(root.config && root.config.useWorkerApi && api.workerClient && api.httpClient && api.httpClient.session && api.httpClient.session.isValid && api.httpClient.session.isValid());
  }

  function workerRequest(path, options){
    var wc = root.api && root.api.workerClient;
    if(!wc || typeof wc.request !== 'function') return Promise.resolve(null);
    return wc.request(path, options || {}).then(function(res){
      if(!res || !res.ok) throw new Error((res && res.data && res.data.error && res.data.error.message) || 'worker-request-failed');
      return (res.data && res.data.data !== undefined) ? res.data.data : res.data;
    });
  }

  function DocumentosRepository(){ BaseRepository.call(this, 'config', 'documentos'); }
  DocumentosRepository.prototype = Object.create(BaseRepository.prototype);
  DocumentosRepository.prototype.constructor = DocumentosRepository;

  DocumentosRepository.prototype.getAdmDocs = function(){
    if(workerReady()){
      return workerRequest('/documentos/adm', { method: 'GET' }).then(function(list){
        return Array.isArray(list) ? list : [];
      }).catch(function(){
        return null;
      }).then(function(workerList){
        if(workerList) return workerList;
        return this.getDocument('adm_docs').then(function(snapshot){
          var data = docData(snapshot);
          return data && Array.isArray(data.list) ? data.list : [];
        }).catch(function(){ return typeof global.getAdmDocs === 'function' ? global.getAdmDocs() : []; });
      }.bind(this));
    }
    return this.getDocument('adm_docs').then(function(snapshot){
      var data = docData(snapshot);
      return data && Array.isArray(data.list) ? data.list : [];
    }).catch(function(){
      return typeof global.getAdmDocs === 'function' ? global.getAdmDocs() : [];
    });
  };

  DocumentosRepository.prototype.saveAdmDocs = function(list){
    var payload = { list: Array.isArray(list) ? list : [], ts: Date.now() };
    if(workerReady()){
      return workerRequest('/documentos/adm', { method: 'PUT', body: payload }).catch(function(){ return null; }).then(function(workerList){
        if(workerList) return workerList;
        return this.setDocument('adm_docs', payload, { merge: true }).then(function(){
          return payload.list;
        }).catch(function(err){
          if(typeof global.saveAdmDocs === 'function'){
            global.saveAdmDocs(payload.list);
            return payload.list;
          }
          throw err;
        });
      }.bind(this));
    }
    return this.setDocument('adm_docs', payload, { merge: true }).then(function(){
      return payload.list;
    }).catch(function(err){
      if(typeof global.saveAdmDocs === 'function'){
        global.saveAdmDocs(payload.list);
        return payload.list;
      }
      throw err;
    });
  };

  repositories.DocumentosRepository = DocumentosRepository;
  repositories.documentos = new DocumentosRepository();
})(window);
