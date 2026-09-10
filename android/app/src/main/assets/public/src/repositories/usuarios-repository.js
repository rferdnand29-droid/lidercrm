(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var repositories = root.repositories = root.repositories || {};
  var BaseRepository = repositories.BaseRepository;

  function dataOf(snapshot){
    if(!snapshot) return null;
    return typeof snapshot.data === 'function' ? snapshot.data() : snapshot;
  }

  function itemsCollection(){
    if(!(global.DB_MODE === 'firebase' && global.db)) return null;
    return global.db.collection('config').doc('users').collection('items');
  }

  function configDoc(name){
    if(!(global.DB_MODE === 'firebase' && global.db) || !name) return null;
    return global.db.collection('config').doc(String(name));
  }

  function runTx(work){
    if(!(global.DB_MODE === 'firebase' && global.db)) return Promise.reject(new Error('repository-unavailable'));
    return global.db.runTransaction(function(tx){ return work(tx); });
  }

  function workerReady(){
    return !!(root.config && root.config.useWorkerApi && root.api && root.api.workerClient && root.api.httpClient && root.api.httpClient.session && root.api.httpClient.session.isValid && root.api.httpClient.session.isValid());
  }

  function workerRequest(path, options){
    var wc = root.api && root.api.workerClient;
    if(!wc || typeof wc.request !== 'function') return Promise.resolve(null);
    return wc.request(path, options || {}).then(function(res){
      if(!res || !res.ok) throw new Error((res && res.data && res.data.error && res.data.error.message) || 'worker-request-failed');
      return (res.data && res.data.data !== undefined) ? res.data.data : res.data;
    });
  }

  function UsuariosRepository(){ BaseRepository.call(this, 'usuarios', 'usuarios'); }
  UsuariosRepository.prototype = Object.create(BaseRepository.prototype);
  UsuariosRepository.prototype.constructor = UsuariosRepository;

  UsuariosRepository.prototype.listUsers = function(){
    if(workerReady()){
      return workerRequest('/usuarios?mode=legacy-fs', { method: 'GET' }).then(function(list){
        return Array.isArray(list) ? list : [];
      }).catch(function(){ return []; });
    }
    if(this.prefersWorker() && root.api && root.api.workerClient && typeof root.api.workerClient.usuarios === 'function'){
      return root.api.workerClient.usuarios().then(function(res){
        return (res && res.data && res.data.data) || [];
      }).catch(function(){
        return [];
      });
    }
    var col = itemsCollection();
    if(!col) return Promise.resolve(typeof global.getUsers === 'function' ? global.getUsers() : []);
    return col.get().then(function(snapshot){
      var list = [];
      if(snapshot && typeof snapshot.forEach === 'function') snapshot.forEach(function(doc){ list.push(dataOf(doc)); });
      return list;
    });
  };

  UsuariosRepository.prototype.saveUserPatch = function(uid, patch){
    if(workerReady()){
      return workerRequest('/usuarios', {
        method: 'PUT',
        body: Object.assign({}, patch || {}, { id: uid })
      });
    }
    if(!(global.DB_MODE === 'firebase' && global.db) || !uid || !patch) return Promise.resolve(null);
    var ref = itemsCollection().doc(uid);
    return runTx(function(tx){
      return tx.get(ref).then(function(snapshot){
        var current = snapshot && snapshot.exists ? dataOf(snapshot) : {};
        var merged = Object.assign({}, current || {}, patch || {}, { id: uid });
        tx.set(ref, merged);
        return merged;
      });
    });
  };

  UsuariosRepository.prototype.deleteUser = function(uid){
    if(workerReady()) return workerRequest('/usuarios?id=' + encodeURIComponent(uid), { method: 'DELETE' });
    var col = itemsCollection();
    if(!col || !uid) return Promise.resolve(null);
    return col.doc(uid).delete();
  };

  UsuariosRepository.prototype.batchUpsertUsers = function(list){
    if(workerReady()) return workerRequest('/usuarios/bulk', { method: 'POST', body: { list: list || [] } });
    if(!(global.DB_MODE === 'firebase' && global.db)) return Promise.resolve(list || []);
    var arr = (list || []).filter(function(u){ return u && u.id; });
    if(!arr.length) return Promise.resolve(arr);
    var batch = global.db.batch();
    arr.forEach(function(u){ batch.set(itemsCollection().doc(u.id), u, { merge: true }); });
    return batch.commit().then(function(){ return arr; });
  };

  UsuariosRepository.prototype.getLegacyUsersDoc = function(){
    if(workerReady()) return workerRequest('/usuarios/legacy', { method: 'GET' });
    var ref = configDoc('users');
    if(!ref) return Promise.resolve(null);
    return ref.get().then(function(snapshot){ return dataOf(snapshot); });
  };

  UsuariosRepository.prototype.getConfigDoc = function(name){
    if(workerReady()) return workerRequest('/usuarios/config?name=' + encodeURIComponent(name), { method: 'GET' });
    var ref = configDoc(name);
    if(!ref) return Promise.resolve(null);
    return ref.get().then(function(snapshot){ return dataOf(snapshot); });
  };

  UsuariosRepository.prototype.setConfigDoc = function(name, payload, options){
    if(workerReady()) return workerRequest('/usuarios/config?name=' + encodeURIComponent(name), { method: 'PUT', body: Object.assign({}, payload || {}) }).then(function(){ return payload || null; });
    var ref = configDoc(name);
    if(!ref) return Promise.resolve(payload || null);
    return ref.set(payload || {}, options || undefined).then(function(){ return payload || null; });
  };

  UsuariosRepository.prototype.runConfigDocTransaction = function(name, mutator){
    if(workerReady()){
      return this.getConfigDoc(name).then(function(current){
        var next = typeof mutator === 'function' ? mutator(current || {}) : (current || {});
        return this.setConfigDoc(name, next || {}).then(function(){ return next || {}; });
      }.bind(this));
    }
    var ref = configDoc(name);
    if(!ref || typeof mutator !== 'function') return Promise.resolve(null);
    return runTx(function(tx){
      return tx.get(ref).then(function(snapshot){
        var current = snapshot && snapshot.exists ? dataOf(snapshot) : {};
        var next = mutator(current || {});
        tx.set(ref, next || {});
        return next || {};
      });
    });
  };

  repositories.UsuariosRepository = UsuariosRepository;
  repositories.usuarios = new UsuariosRepository();
})(window);
