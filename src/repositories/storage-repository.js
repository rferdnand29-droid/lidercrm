(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var repositories = root.repositories = root.repositories || {};
  var config = root.config = root.config || {};

  function hasWorkerUpload(){
    return !!(config.useWorkerUpload && root.api && root.api.workerClient);
  }

  function workerSessionReady(){
    return !!(root.api && root.api.httpClient && root.api.httpClient.session && root.api.httpClient.session.isValid && root.api.httpClient.session.isValid());
  }

  function workerRequest(path, options){
    var wc = root.api && root.api.workerClient;
    if(!wc || typeof wc.request !== 'function') return Promise.resolve(null);
    return wc.request(path, options || {}).then(function(res){
      if(!res || !res.ok) throw new Error((res && res.data && res.data.error && res.data.error.message) || 'worker-request-failed');
      return (res.data && res.data.data !== undefined) ? res.data.data : res.data;
    });
  }

  function fileToDataUrl(file){
    return new Promise(function(resolve, reject){
      try{
        var fr = new FileReader();
        fr.onload = function(ev){ resolve(ev.target.result); };
        fr.onerror = function(err){ reject(err); };
        fr.readAsDataURL(file);
      }catch(err){ reject(err); }
    });
  }

  function legacyStorage(){
    return global.fbStorage || null;
  }

  function legacyUpload(file, path, callback){
    var storage = legacyStorage();
    if(!storage){
      var missing = new Error('storage-unavailable');
      if(typeof callback === 'function') callback(missing);
      return Promise.reject(missing);
    }
    return new Promise(function(resolve, reject){
      try{
        var ref = storage.ref().child(path);
        ref.put(file)
          .then(function(snap){ return snap.ref.getDownloadURL(); })
          .then(function(url){
            var payload = { url: url, path: path };
            if(typeof callback === 'function') callback(null, payload);
            resolve(payload);
          })
          .catch(function(err){
            if(typeof callback === 'function') callback(err);
            reject(err);
          });
      }catch(err){
        if(typeof callback === 'function') callback(err);
        reject(err);
      }
    });
  }

  function legacyRemove(path, callback){
    var storage = legacyStorage();
    if(!storage || !path){
      if(typeof callback === 'function') callback(new Error('storage-unavailable'));
      return Promise.resolve();
    }
    return storage.ref().child(path).delete()
      .then(function(){ if(typeof callback === 'function') callback(null); })
      .catch(function(err){ if(typeof callback === 'function') callback(err); throw err; });
  }

  // =====================================================================
  // CORREÇÃO ÁUDIO (2026-07-20): Upload direto ao Supabase Storage
  // -----------------------------------------------------------------------
  // O pipeline anterior sempre convertia arquivos para base64 (data URL)
  // e enviava como JSON ao Worker. Para áudio (que pode ter vários MB),
  // isso causa: (1) payload gigante, (2) timeout de 15s estoura, (3) Worker
  // rejeita por limite de body. Agora, arquivos binários (audio/*, video/*,
  // image/*) são enviados diretamente ao Supabase Storage via REST API,
  // sem conversão para base64 — o blob vai cru no body do fetch.
  // Fallbacks: Worker (base64) → Firebase legado.
  // =====================================================================

  function _sbConfig(){
    var storageRuntime = root.modules && root.modules.storage && root.modules.storage.runtime;
    var url = '';
    var key = '';
    var bucket = 'lidercrm-files';

    // Tenta pegar do módulo storage runtime primeiro
    if (storageRuntime) {
      url = storageRuntime.SUPABASE_URL || '';
      key = storageRuntime.SUPABASE_KEY || '';
      bucket = storageRuntime.SUPABASE_BUCKET || bucket;
    }

    // Fallback para globais (setados pelo supabase-bootstrap ou legacy)
    if (!url) { try { url = global.SUPABASE_URL || ''; } catch(e) {} }
    if (!key) { try { key = global.SUPABASE_KEY || global.SUPABASE_ANON_KEY || ''; } catch(e) {} }

    // Tenta pegar a URL do _sbClient se disponível
    if (!url) {
      try { if (global._sbClient && global._sbClient.supabaseUrl) url = global._sbClient.supabaseUrl; } catch(e) {}
    }

    // Tenta pegar o access_token da sessão anônima do Supabase (mais permissões que a anon key)
    var accessToken = '';
    try {
      if (url) {
        var tokenKey = 'sb-' + url.replace(/^https?:\/\//, '') + '-auth-token';
        var raw = localStorage.getItem(tokenKey);
        if (raw) {
          var p = JSON.parse(raw);
          accessToken = (p && p.access_token) ||
                        (p && p.currentSession && p.currentSession.access_token) ||
                        (p && p.data && p.data.access_token) || '';
        }
      }
    } catch(e) {}

    return {
      url: url,
      key: accessToken || key,
      bucket: bucket,
      hasAuth: !!(accessToken || key)
    };
  }

  function _extFromMime(mime){
    if(!mime) return '.bin';
    var parts = mime.split('/');
    if(parts.length < 2) return '.bin';
    var sub = parts[1].split(';')[0].trim();
    // Normaliza codecs (ex: audio/webm;codecs=opus -> webm)
    return '.' + sub;
  }

  function supabaseStorageUpload(file, path){
    var cfg = _sbConfig();
    if (!cfg.url || !cfg.hasAuth) {
      return Promise.reject(new Error('supabase-config-unavailable'));
    }

    var cleanPath = String(path || '').replace(/^\/+|\/+$/g, '');
    if (!cleanPath) {
      // Gera um nome automático se path não foi fornecido
      var ext = _extFromMime(file && file.type);
      var prefix = 'audio';
      if (file && file.type) {
        if (file.type.indexOf('video/') === 0) prefix = 'video';
        else if (file.type.indexOf('image/') === 0) prefix = 'img';
        else if (file.type.indexOf('audio/') === 0) prefix = 'audio';
      }
      cleanPath = prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext;
    }

    // Se o path já inclui o bucket, remove (a API REST já recebe o bucket separadamente)
    if (cleanPath.indexOf(cfg.bucket + '/') === 0) {
      cleanPath = cleanPath.substring(cfg.bucket.length + 1);
    }

    var uploadUrl = cfg.url + '/storage/v1/object/' + cfg.bucket + '/' + encodeURI(cleanPath);
    var contentType = (file && file.type) || 'application/octet-stream';

    // AbortController com timeout de 2 minutos para arquivos grandes
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function() {
        try { controller.abort(); } catch(e) {}
      }, 120000);
    }

    return fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cfg.key,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: file,
      signal: controller ? controller.signal : undefined
    }).then(function(res){
      if (timer) { clearTimeout(timer); timer = null; }
      if (!res.ok) {
        return res.text().then(function(txt){
          throw new Error('supabase-storage-upload-failed: ' + res.status + ' ' + (txt || '').slice(0, 200));
        });
      }
      return res.json().catch(function() { return {}; });
    }).then(function(result){
      if (timer) { clearTimeout(timer); timer = null; }
      var publicUrl = cfg.url + '/storage/v1/object/public/' + cfg.bucket + '/' + encodeURI(cleanPath);
      return {
        url: publicUrl,
        path: cfg.bucket + '/' + cleanPath,
        key: (result && result.Key) || (cfg.bucket + '/' + cleanPath),
        provider: 'supabase-storage'
      };
    }).catch(function(err){
      if (timer) { clearTimeout(timer); timer = null; }
      throw err;
    });
  }

  function supabaseStorageRemove(path){
    var cfg = _sbConfig();
    if (!cfg.url || !cfg.hasAuth || !path) {
      return Promise.reject(new Error('supabase-config-unavailable'));
    }
    var cleanPath = String(path).replace(/^\/+|\/+$/g, '');
    if (cleanPath.indexOf(cfg.bucket + '/') === 0) {
      cleanPath = cleanPath.substring(cfg.bucket.length + 1);
    }
    var deleteUrl = cfg.url + '/storage/v1/object/' + cfg.bucket + '/' + encodeURI(cleanPath);

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function() { try { controller.abort(); } catch(e) {} }, 30000);
    }

    return fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + cfg.key
      },
      signal: controller ? controller.signal : undefined
    }).then(function(res){
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('supabase-storage-delete-failed: ' + res.status);
      return { ok: true, provider: 'supabase-storage' };
    }).catch(function(err){
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function _isBinaryFile(file){
    if(!file || !file.type) return true; // sem type = tratar como binário
    var ct = file.type;
    // Texto e JSON não precisam de upload binário — base64 é suficiente
    if(ct.indexOf('text/') === 0) return false;
    if(ct.indexOf('application/json') === 0) return false;
    if(ct.indexOf('application/javascript') === 0) return false;
    if(ct.indexOf('application/x-www-form-urlencoded') === 0) return false;
    return true;
  }

  function StorageRepository(){}
  StorageRepository.prototype.canUpload = function(){
    var cfg = _sbConfig();
    return !!(cfg.url && cfg.hasAuth) || !!(hasWorkerUpload() || legacyStorage());
  };
  StorageRepository.prototype.upload = function(file, path, callback){
    if(!file){
      var noFileErr = new Error('no-file');
      if(typeof callback === 'function') callback(noFileErr);
      return Promise.reject(noFileErr);
    }

    // Arquivos binários (audio, video, imagens): tentam Supabase Storage primeiro
    // — muito mais eficiente que base64 via Worker (sem overhead de encoding).
    if (_isBinaryFile(file)) {
      return supabaseStorageUpload(file, path).then(function(payload){
        if(typeof callback === 'function') callback(null, payload);
        return payload;
      }).catch(function(sbErr){
        console.warn('[storage] Supabase Storage upload falhou, tentando Worker:', sbErr && sbErr.message);
        // Fallback 1: Worker (base64)
        if(hasWorkerUpload() && workerSessionReady()){
          return fileToDataUrl(file).then(function(dataUrl){
            var cleanPath = String(path || '').replace(/^\/+|\/+$/g, '');
            var parts = cleanPath ? cleanPath.split('/') : [];
            var filename = parts.pop() || (file && file.name) || 'upload.bin';
            var folder = parts.join('/') || 'uploads';
            return workerRequest('/upload', {
              method: 'POST',
              timeoutMs: 120000,
              body: {
                filename: filename,
                folder: folder,
                contentType: file.type || 'application/octet-stream',
                data: dataUrl
              }
            });
          }).then(function(payload){
            if(typeof callback === 'function') callback(null, payload);
            return payload;
          }).catch(function(wErr){
            console.warn('[storage] Worker upload falhou, tentando legacy:', wErr && wErr.message);
            // Fallback 2: Firebase legado
            return legacyUpload(file, path, callback).catch(function(){
              var finalErr = wErr || sbErr || new Error('storage-upload-failed');
              if(typeof callback === 'function') callback(finalErr);
              throw finalErr;
            });
          });
        }
        // Sem Worker: vai direto pro legacy
        return legacyUpload(file, path, callback).catch(function(){
          var finalErr = sbErr || new Error('storage-upload-failed');
          if(typeof callback === 'function') callback(finalErr);
          throw finalErr;
        });
      });
    }

    // Arquivos de texto/pequenos: caminho original (Worker base64)
    if(hasWorkerUpload() && workerSessionReady() && file){
      return fileToDataUrl(file).then(function(dataUrl){
        var cleanPath = String(path || '').replace(/^\/+|\/+$/g, '');
        var parts = cleanPath ? cleanPath.split('/') : [];
        var filename = parts.pop() || (file && file.name) || 'upload.bin';
        var folder = parts.join('/') || 'uploads';
        return workerRequest('/upload', {
          method: 'POST',
          timeoutMs: 60000,
          body: {
            filename: filename,
            folder: folder,
            contentType: file.type || 'application/octet-stream',
            data: dataUrl
          }
        });
      }).then(function(payload){
        if(typeof callback === 'function') callback(null, payload);
        return payload;
      }).catch(function(err){
        return legacyUpload(file, path, callback).catch(function(){
          if(typeof callback === 'function') callback(err || new Error('storage-upload-failed'));
          throw (err || new Error('storage-upload-failed'));
        });
      });
    }
    return legacyUpload(file, path, callback);
  };
  StorageRepository.prototype.remove = function(path, callback){
    // Tenta Supabase Storage primeiro
    var cfg = _sbConfig();
    if (cfg.url && cfg.hasAuth && path) {
      return supabaseStorageRemove(path).then(function(payload){
        if(typeof callback === 'function') callback(null, payload);
        return payload;
      }).catch(function(){
        // Fallback: Worker
        if(hasWorkerUpload() && workerSessionReady() && path){
          return workerRequest('/upload?path=' + encodeURIComponent(path), { method: 'DELETE' })
            .then(function(payload){ if(typeof callback === 'function') callback(null, payload); return payload; })
            .catch(function(){ return legacyRemove(path, callback); });
        }
        return legacyRemove(path, callback);
      });
    }
    if(hasWorkerUpload() && workerSessionReady() && path){
      return workerRequest('/upload?path=' + encodeURIComponent(path), { method: 'DELETE' })
        .then(function(payload){ if(typeof callback === 'function') callback(null, payload); return payload; })
        .catch(function(){ return legacyRemove(path, callback); });
    }
    return legacyRemove(path, callback);
  };

  // Métodos expostos para uso direto (audio-helper.js etc.)
  StorageRepository.prototype.supabaseStorageUpload = supabaseStorageUpload;
  StorageRepository.prototype.supabaseStorageRemove = supabaseStorageRemove;

  repositories.StorageRepository = StorageRepository;
  repositories.storage = new StorageRepository();
})(window);
