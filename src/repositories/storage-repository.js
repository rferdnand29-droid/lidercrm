(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var repositories = root.repositories = root.repositories || {};
  var config = root.config = root.config || {};

  // ---------------------------------------------------------------------
  // PERFORMANCE (2026-07-24)
  // - Cache de _sbConfig (evita localStorage.getItem + JSON.parse por upload)
  // - Cache de _extFromMime (MIMEs repetem muito)
  // - Sanitização de path feita 1x (helper _cleanPath)
  // - Timers de fetch sempre limpos em finally (sem vazamento)
  // - Fallback de remove sem chamada dupla (Supabase 404/409 não dispara legacy)
  // - [+] _sbConfig zero-read em hot path (TTL basta; renova manual via _invalidateSbConfig)
  // - [+] encodeURI/cleanPath cached em supabaseStorageUpload (era 2x no caminho feliz)
  //
  // SECURITY (Fase 6) #A #F #G #J — 2026-07-24
  // - #A  TTL do cache de sessão 5s→2s + flag 'source'/'warn-once' em fallback anon.
  // - #F  Bloqueio de MIME perigoso antes do upload (text/html, svg+xml, xhtml, js).
  // - #G  _cleanPath rejeita controles (<0x20, \x7F), '\\', '?', '#', '..' e len>1024.
  // - #J  Mesmo bloqueio na entrada pública upload() (defense em profundidade).
  // Sem alteração de interface, regras ou banco.
  // ---------------------------------------------------------------------

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
      var fr;
      try{
        fr = new FileReader();
        fr.onload = function(ev){
          var r = ev.target.result;
          // libera refs cedo para o GC
          fr.onload = fr.onerror = null;
          fr = null;
          resolve(r);
        };
        fr.onerror = function(err){
          fr.onload = fr.onerror = null;
          fr = null;
          reject(err);
        };
        fr.readAsDataURL(file);
      }catch(err){
        if(fr){ fr.onload = fr.onerror = null; fr = null; }
        reject(err);
      }
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

  // ---------------------------------------------------------------------
  // Cache de configuração Supabase
  // Evita: localStorage.getItem + JSON.parse a cada upload/remove.
  // Invalidação: TTL curto (5s); troca de sessão chama _invalidateSbConfig().
  // ---------------------------------------------------------------------
  var _cfgCache = null;
  var _cfgCacheAt = 0;
  var _anonWarnEmitted = false;  // SECURITY #A: dedupe do warning de fallback anon.
  var _CFG_TTL_MS = 2000;  // SECURITY #A: reduz janela de stale-token (5s → 2s).

  function _readTokenRaw(url){
    if(!url) return '';
    try{
      var tokenKey = 'sb-' + url.replace(/^https?:\/\//, '') + '-auth-token';
      return localStorage.getItem(tokenKey) || '';
    }catch(e){ return ''; }
  }

  function _sbConfig(){
    var now = Date.now();
    // Fast path: cache válido DENTRO do TTL — zero-read de localStorage na hot path.
    // Troca de sessão dentro da TTL deve chamar _invalidateSbConfig().
    // (Era probe do token em cada chamada — removido por ser dominante no tempo.)
    if (_cfgCache && (now - _cfgCacheAt) < _CFG_TTL_MS) {
      return _cfgCache;
    }

    var storageRuntime = root.modules && root.modules.storage && root.modules.storage.runtime;
    var url = '';
    var key = '';
    var bucket = 'lidercrm-files';

    if (storageRuntime) {
      url = storageRuntime.SUPABASE_URL || '';
      key = storageRuntime.SUPABASE_KEY || '';
      bucket = storageRuntime.SUPABASE_BUCKET || bucket;
    }

    if (!url) { try { url = global.SUPABASE_URL || ''; } catch(e) {} }
    if (!key) { try { key = global.SUPABASE_KEY || global.SUPABASE_ANON_KEY || ''; } catch(e) {} }

    if (!url) {
      try { if (global._sbClient && global._sbClient.supabaseUrl) url = global._sbClient.supabaseUrl; } catch(e) {}
    }

    var accessToken = '';
    var raw = _readTokenRaw(url);
    if (raw) {
      try {
        var p = JSON.parse(raw);
        accessToken = (p && p.access_token) ||
                      (p && p.currentSession && p.currentSession.access_token) ||
                      (p && p.data && p.data.access_token) || '';
      } catch(e) {}
    }

    // SECURITY (#A): marca proveniência do token + warns once por janela quando caímos no anon.
    var source = accessToken ? 'session' : (key ? 'anon' : 'none');
    if (!accessToken && key && !_anonWarnEmitted){
      _anonWarnEmitted = true;
      if (typeof console !== 'undefined' && console.warn){
        console.warn('[storage] #A: sem JWT de sessão — usando SUPABASE_KEY (anon). ' +
                     'Defesa definitiva: mover token para cookie HttpOnly server-side.');
      }
    }
    _cfgCache = {
      url: url,
      key: accessToken || key,
      bucket: bucket,
      hasAuth: !!(accessToken || key),
      source: source
    };
    _cfgCacheAt = now;
    return _cfgCache;
  }

  // Invalidação manual (opcional) — exposta caso outro módulo troque de sessão.
  function _invalidateSbConfig(){
    _cfgCache = null;
    _cfgCacheAt = 0;
    _anonWarnEmitted = false;  // SECURITY #A: re-arm do warning em troca de sessão.
  }

  // ---------------------------------------------------------------------
  // Cache de extensões por MIME
  // ---------------------------------------------------------------------
  var _extCache = Object.create(null);
  function _extFromMime(mime){
    if(!mime) return '.bin';
    var cached = _extCache[mime];
    if (cached) return cached;
    var parts = mime.split('/');
    var ext;
    if(parts.length < 2){
      ext = '.bin';
    } else {
      var sub = parts[1];
      var semi = sub.indexOf(';');
      if (semi !== -1) sub = sub.substring(0, semi);
      // trim inline (evita alocar função)
      var s = 0, e = sub.length;
      while (s < e && sub.charCodeAt(s) <= 32) s++;
      while (e > s && sub.charCodeAt(e - 1) <= 32) e--;
      ext = '.' + sub.substring(s, e);
    }
    _extCache[mime] = ext;
    return ext;
  }

  // SECURITY (#G): sanitiza path com validação forte de caracteres e segmentos.
  // Rejeita: controles (<0x20, \x7F), '\\' (92), '?' (63), '#' (35) e segmentos '.'/'..'.
  // Mantém pontos válidos em nomes de arquivo (ex.: relatorio.v2.pdf) sem permitir traversal.
  // Limita comprimento total a 1024 chars (defense-in-depth contra deep paths).
  var _MAX_PATH_LEN = 1024;
  function _cleanPath(path, bucket){
    var raw = String(path == null ? '' : path);
    var n = raw.length;
    if (n === 0 || n > _MAX_PATH_LEN) return '';

    var start = 0, end = n;
    while (start < end && raw.charCodeAt(start) === 47) start++;
    while (end > start && raw.charCodeAt(end - 1) === 47) end--;
    if (start >= end) return '';

    var parts = [];
    var segment = '';
    for (var i = start; i < end; i++){
      var c = raw.charCodeAt(i);
      if (c < 0x20 || c === 0x7F || c === 92 || c === 63 || c === 35) return '';
      if (c === 47){
        if (!segment) continue;
        if (segment === '.' || segment === '..') return '';
        parts.push(segment);
        segment = '';
        continue;
      }
      segment += String.fromCharCode(c);
    }
    if (segment){
      if (segment === '.' || segment === '..') return '';
      parts.push(segment);
    }
    if (!parts.length) return '';

    if (bucket && parts[0] === bucket) parts.shift();
    if (!parts.length) return '';
    return parts.join('/');
  }

  function _validatePublicPath(path, bucket){
    if (!path) return '';
    var clean = _cleanPath(path, bucket);
    if (!clean) throw new Error('invalid-path-rejected');
    return clean;
  }

  function _isBinaryFile(file){
    if(!file || !file.type) return true;
    var ct = file.type;
    if(ct.indexOf('text/') === 0) return false;
    if(ct.indexOf('application/json') === 0) return false;
    if(ct.indexOf('application/javascript') === 0) return false;
    if(ct.indexOf('application/x-www-form-urlencoded') === 0) return false;
    return true;
  }

  // SECURITY (#F, #J): MIMEs perigosos que o browser interpreta como executável.
  // Bloqueamos outright no cliente (defense em profundidade — bucket público
  // não conseguia servir stored-XSS).
  var _UNSAFE_MIME_PREFIXES = [
    'text/html',
    'text/xhtml',
    'text/javascript',
    'image/svg+xml',
    'application/xhtml+xml',
    'application/javascript',
    'application/x-javascript',
    'application/ecmascript'
  ];
  function _isUnsafeMime(type){
    if(!type) return false;
    var t = String(type).toLowerCase();
    var semi = t.indexOf(';');
    if (semi !== -1) t = t.substring(0, semi);
    var s = 0, e = t.length;
    while (s < e && t.charCodeAt(s) <= 32) s++;
    while (e > s && t.charCodeAt(e - 1) <= 32) e--;
    if (s > 0 || e < t.length) t = t.substring(s, e);
    for (var i = 0; i < _UNSAFE_MIME_PREFIXES.length; i++){
      if (t === _UNSAFE_MIME_PREFIXES[i]) return true;
    }
    return false;
  }

  function supabaseStorageUpload(file, path){
    // SECURITY (#F): rejeita MIME perigoso antes de qualquer I/O.
    if (_isUnsafeMime(file && file.type)) {
      return Promise.reject(new Error('unsafe-mime-rejected'));
    }
    var cfg = _sbConfig();
    if (!cfg.url || !cfg.hasAuth) {
      return Promise.reject(new Error('supabase-config-unavailable'));
    }

    var cleanPath = _cleanPath(path, cfg.bucket);
    // SECURITY (#G): se caller passou path mas ele foi rejeitado, não tente auto-gerar.
    if (!cleanPath && path) {
      return Promise.reject(new Error('invalid-path-rejected'));
    }
    if (!cleanPath) {
      var ext = _extFromMime(file && file.type);
      var prefix = 'audio';
      if (file && file.type) {
        if (file.type.indexOf('video/') === 0) prefix = 'video';
        else if (file.type.indexOf('image/') === 0) prefix = 'img';
        else if (file.type.indexOf('audio/') === 0) prefix = 'audio';
      }
      cleanPath = prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext;
    }

    // Cache de strings derivadas (eram recalculadas 2x no caminho feliz):
    //  - encodedPath: encodeURI roda 1x (era 2x: uploadUrl + publicUrl)
    //  - bucketPath:  concatenação bucket + '/' + path roda 1x (era usada 3x)
    var bucket = cfg.bucket;
    var encodedPath = encodeURI(cleanPath);
    var bucketPath = bucket + '/' + cleanPath;
    var uploadUrl = cfg.url + '/storage/v1/object/' + bucket + '/' + encodedPath;
    var contentType = (file && file.type) || 'application/octet-stream';

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function() { try { controller.abort(); } catch(e) {} }, 120000);
    }
    var clearTimer = function(){ if (timer){ clearTimeout(timer); timer = null; } };

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
      if (!res.ok) {
        return res.text().then(function(txt){
          clearTimer();
          throw new Error('supabase-storage-upload-failed: ' + res.status + ' ' + (txt || '').slice(0, 200));
        }, function(){
          clearTimer();
          throw new Error('supabase-storage-upload-failed: ' + res.status);
        });
      }
      // parse json best-effort
      return res.json().then(function(j){ return j; }, function(){ return {}; });
    }).then(function(result){
      clearTimer();
      var publicUrl = cfg.url + '/storage/v1/object/public/' + bucket + '/' + encodedPath;
      return {
        url: publicUrl,
        path: bucketPath,
        key: (result && result.Key) || bucketPath,
        provider: 'supabase-storage'
      };
    }, function(err){
      clearTimer();
      throw err;
    });
  }

  function supabaseStorageRemove(path){
    var cfg = _sbConfig();
    if (!cfg.url || !cfg.hasAuth || !path) {
      return Promise.reject(new Error('supabase-config-unavailable'));
    }
    var cleanPath = _cleanPath(path, cfg.bucket);
    // SECURITY (#G): path inválido → não emita DELETE contra bucket root.
    if (!cleanPath) {
      return Promise.reject(new Error('invalid-path-rejected'));
    }
    var deleteUrl = cfg.url + '/storage/v1/object/' + cfg.bucket + '/' + encodeURI(cleanPath);

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function() { try { controller.abort(); } catch(e) {} }, 30000);
    }
    var clearTimer = function(){ if (timer){ clearTimeout(timer); timer = null; } };

    return fetch(deleteUrl, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + cfg.key },
      signal: controller ? controller.signal : undefined
    }).then(function(res){
      clearTimer();
      // 404 = já removido; tratamos como sucesso silencioso para não disparar fallback duplicado
      if (res.status === 404) return { ok: true, provider: 'supabase-storage', alreadyGone: true };
      if (!res.ok) throw new Error('supabase-storage-delete-failed: ' + res.status);
      return { ok: true, provider: 'supabase-storage' };
    }, function(err){
      clearTimer();
      throw err;
    });
  }

  function StorageRepository(){}
  StorageRepository.prototype.canUpload = function(){
    var cfg = _sbConfig();
    return !!(cfg.url && cfg.hasAuth) || !!(hasWorkerUpload() || legacyStorage());
  };

  // Helper interno para o fallback do Worker — extraído para não recriar
  // a closure inteira dentro de cada chamada de upload().
  function _workerUploadFallback(file, path, callback, timeoutMs){
    // SECURITY (#G): falha cedo se caller passou path malicioso.
    var cfProbe = _cleanPath(path);
    if (!cfProbe && path){
      var err = new Error('invalid-path-rejected');
      if (typeof callback === 'function') callback(err);
      return Promise.reject(err);
    }
    return fileToDataUrl(file).then(function(dataUrl){
      var cleanPath = cfProbe;
      var parts = cleanPath ? cleanPath.split('/') : [];
      var filename = parts.pop() || (file && file.name) || 'upload.bin';
      var folder = parts.join('/') || 'uploads';
      return workerRequest('/upload', {
        method: 'POST',
        timeoutMs: timeoutMs,
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
    });
  }

  StorageRepository.prototype.upload = function(file, path, callback){
    if(!file){
      var noFileErr = new Error('no-file');
      if(typeof callback === 'function') callback(noFileErr);
      return Promise.reject(noFileErr);
    }
    // SECURITY (#J): MIME perigoso → bloqueia em toda entrada (defense em profundidade).
    if (_isUnsafeMime(file && file.type)) {
      var unsErr = new Error('unsafe-mime-rejected');
      if (typeof callback === 'function') callback(unsErr);
      return Promise.reject(unsErr);
    }

    var cfg = _sbConfig();
    var safePath;
    try{
      safePath = _validatePublicPath(path, cfg.bucket);
    }catch(pathErr){
      if(typeof callback === 'function') callback(pathErr);
      return Promise.reject(pathErr);
    }

    if (_isBinaryFile(file)) {
      return supabaseStorageUpload(file, safePath || path).then(function(payload){
        if(typeof callback === 'function') callback(null, payload);
        return payload;
      }, function(sbErr){
        console.warn('[storage] Supabase Storage upload falhou, tentando Worker:', sbErr && sbErr.message);
        if(hasWorkerUpload() && workerSessionReady()){
          return _workerUploadFallback(file, safePath || path, callback, 120000).catch(function(wErr){
            console.warn('[storage] Worker upload falhou, tentando legacy:', wErr && wErr.message);
            return legacyUpload(file, safePath || path, callback).catch(function(){
              var finalErr = wErr || sbErr || new Error('storage-upload-failed');
              if(typeof callback === 'function') callback(finalErr);
              throw finalErr;
            });
          });
        }
        return legacyUpload(file, safePath || path, callback).catch(function(){
          var finalErr = sbErr || new Error('storage-upload-failed');
          if(typeof callback === 'function') callback(finalErr);
          throw finalErr;
        });
      });
    }

    // Arquivos de texto/pequenos: caminho original (Worker base64)
    if(hasWorkerUpload() && workerSessionReady()){
      return _workerUploadFallback(file, safePath || path, callback, 60000).catch(function(err){
        return legacyUpload(file, safePath || path, callback).catch(function(){
          if(typeof callback === 'function') callback(err || new Error('storage-upload-failed'));
          throw (err || new Error('storage-upload-failed'));
        });
      });
    }
    return legacyUpload(file, safePath || path, callback);
  };

  StorageRepository.prototype.remove = function(path, callback){
    var cfg = _sbConfig();
    var safePath;
    try{
      safePath = _validatePublicPath(path, cfg.bucket);
    }catch(pathErr){
      if(typeof callback === 'function') callback(pathErr);
      return Promise.reject(pathErr);
    }

    if (cfg.url && cfg.hasAuth && safePath) {
      return supabaseStorageRemove(safePath).then(function(payload){
        if(typeof callback === 'function') callback(null, payload);
        return payload;
      }, function(sbErr){
        // Só cai para fallback se for erro real de rede/permissão — 404 já foi tratado como sucesso.
        if(hasWorkerUpload() && workerSessionReady() && safePath){
          return workerRequest('/upload?path=' + encodeURIComponent(safePath), { method: 'DELETE' })
            .then(function(payload){ if(typeof callback === 'function') callback(null, payload); return payload; })
            .catch(function(){ return legacyRemove(safePath, callback); });
        }
        return legacyRemove(safePath, callback);
      });
    }
    if(hasWorkerUpload() && workerSessionReady() && safePath){
      return workerRequest('/upload?path=' + encodeURIComponent(safePath), { method: 'DELETE' })
        .then(function(payload){ if(typeof callback === 'function') callback(null, payload); return payload; })
        .catch(function(){ return legacyRemove(safePath, callback); });
    }
    return legacyRemove(safePath, callback);
  };

  // Métodos expostos para uso direto (audio-helper.js etc.)
  StorageRepository.prototype.supabaseStorageUpload = supabaseStorageUpload;
  StorageRepository.prototype.supabaseStorageRemove = supabaseStorageRemove;
  StorageRepository.prototype._invalidateConfig = _invalidateSbConfig;

  repositories.StorageRepository = StorageRepository;
  repositories.storage = new StorageRepository();
})(window);
