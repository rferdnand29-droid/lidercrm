/* =====================================================================
 * js/backblaze.js — Cliente Backblaze B2 para upload de anexos
 * -----------------------------------------------------------------------
 * Integração com Backblaze B2 Cloud Storage.
 * Bucket: lidercrm-anexos (db7517517f50753a9eff0e1f)
 *
 * Funcionamento:
 * 1. Autentica com keyID + applicationKey via b2_authorize_account
 * 2. Obtém uploadUrl + authorizationToken via b2_get_upload_url
 * 3. Faz upload do arquivo via b2_upload_file
 * 4. Retorna URL pública do arquivo
 *
 * O token de autorização é cacheado por 24h (validade do B2).
 * ===================================================================== */

var B2_CONFIG = {
  bucketId: 'db7517517f50753a9eff0e1f',
  bucketName: 'lidercrm-anexos',
  keyId: '005b571f05aefef0000000001',
  applicationKey: 'K005mkGLYaLAImIb7BBeRM9oVwnfQKQ',
  apiBaseUrl: 'https://api.backblazeb2.com/b2api/v2/',
  downloadUrl: null, // preenchido após authorize
  apiUrl: null, // preenchido após authorize
  authorizationToken: null, // preenchido após authorize
  uploadUrl: null, // preenchido após get_upload_url
  uploadToken: null, // preenchido após get_upload_url
  tokenExpires: 0, // timestamp de expiração do cache
  uploadUrlExpires: 0
};

var B2_TOKEN_CACHE_KEY = 'lf13_b2_token';
var B2_UPLOAD_CACHE_KEY = 'lf13_b2_upload';

/* ─── Autenticação ─── */
function _b2LoadCachedToken(){
  try{
    var cached = sg(B2_TOKEN_CACHE_KEY);
    if(cached && cached.expires > Date.now()){
      B2_CONFIG.authorizationToken = cached.authorizationToken;
      B2_CONFIG.apiUrl = cached.apiUrl;
      B2_CONFIG.downloadUrl = cached.downloadUrl;
      B2_CONFIG.tokenExpires = cached.expires;
      return true;
    }
  }catch(e){ }
  return false;
}

function _b2SaveCachedToken(){
  try{
    ss(B2_TOKEN_CACHE_KEY, {
      authorizationToken: B2_CONFIG.authorizationToken,
      apiUrl: B2_CONFIG.apiUrl,
      downloadUrl: B2_CONFIG.downloadUrl,
      expires: B2_CONFIG.tokenExpires
    });
  }catch(e){ }
}

function _b2Authorize(){
  if(B2_CONFIG.authorizationToken && Date.now() < B2_CONFIG.tokenExpires){
    return Promise.resolve(B2_CONFIG);
  }
  if(_b2LoadCachedToken()){
    return Promise.resolve(B2_CONFIG);
  }

  var credentials = B2_CONFIG.keyId + ':' + B2_CONFIG.applicationKey;
  var basicAuth = btoa(credentials);

  return fetch(B2_CONFIG.apiBaseUrl + 'b2_authorize_account', {
    method: 'GET',
    headers: {
      'Authorization': 'Basic ' + basicAuth
    }
  }).then(function(res){
    if(!res.ok) throw new Error('B2 authorize failed: ' + res.status);
    return res.json();
  }).then(function(data){
    B2_CONFIG.authorizationToken = data.authorizationToken;
    B2_CONFIG.apiUrl = data.apiUrl;
    B2_CONFIG.downloadUrl = data.downloadUrl;
    B2_CONFIG.tokenExpires = Date.now() + 23 * 60 * 60 * 1000; // 23h cache
    _b2SaveCachedToken();
    return B2_CONFIG;
  }).catch(function(err){
    console.error('[B2] authorize error', err);
    throw err;
  });
}

/* ─── Obter upload URL ─── */
function _b2GetUploadUrl(){
  // Cache upload URL por 23h
  if(B2_CONFIG.uploadUrl && Date.now() < B2_CONFIG.uploadUrlExpires){
    return Promise.resolve(B2_CONFIG);
  }

  // Try cached
  try{
    var cached = sg(B2_UPLOAD_CACHE_KEY);
    if(cached && cached.expires > Date.now()){
      B2_CONFIG.uploadUrl = cached.uploadUrl;
      B2_CONFIG.uploadToken = cached.uploadToken;
      B2_CONFIG.uploadUrlExpires = cached.expires;
      return Promise.resolve(B2_CONFIG);
    }
  }catch(e){ }

  return _b2Authorize().then(function(){
    return fetch(B2_CONFIG.apiUrl + '/b2api/v2/b2_get_upload_url', {
      method: 'POST',
      headers: {
        'Authorization': B2_CONFIG.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bucketId: B2_CONFIG.bucketId })
    }).then(function(res){
      if(!res.ok) throw new Error('B2 get_upload_url failed: ' + res.status);
      return res.json();
    }).then(function(data){
      B2_CONFIG.uploadUrl = data.uploadUrl;
      B2_CONFIG.uploadToken = data.authorizationToken;
      B2_CONFIG.uploadUrlExpires = Date.now() + 23 * 60 * 60 * 1000;
      try{
        ss(B2_UPLOAD_CACHE_KEY, {
          uploadUrl: B2_CONFIG.uploadUrl,
          uploadToken: B2_CONFIG.uploadToken,
          expires: B2_CONFIG.uploadUrlExpires
        });
      }catch(e){ }
      return B2_CONFIG;
    });
  });
}

/* ─── Upload de arquivo ─── */
function b2UploadFile(file, path, cb){
  if(!file){ if(cb) cb(new Error('no-file')); return Promise.reject(new Error('no-file')); }

  // Gerar path único se não fornecido
  if(!path){
    var ext = (file.name || 'file').split('.').pop();
    path = 'anexos/' + Date.now() + '-' + Math.random().toString(36).slice(2,8) + '.' + ext;
  }

  // Limitar a 100MB
  if(file.size > 100 * 1024 * 1024){
    var err = new Error('Arquivo muito grande (máx 100MB)');
    if(cb) cb(err);
    return Promise.reject(err);
  }

  return _b2GetUploadUrl().then(function(){
    var fileName = path;
    var contentType = file.type || 'application/octet-stream';

    // Ler o arquivo como ArrayBuffer
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(e){ resolve(e.target.result); };
      reader.onerror = function(e){ reject(e); };
      reader.readAsArrayBuffer(file);
    }).then(function(arrayBuffer){
      // Calcular SHA1 do conteúdo (B2 exige)
      // Como não temos crypto.subtle em todos os ambientes, usar hash simples
      // B2 aceita sem SHA1 se enviar X-Bz-Content-Sha1 vazio
      return fetch(B2_CONFIG.uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': B2_CONFIG.uploadToken,
          'X-Bz-File-Name': encodeURIComponent(fileName),
          'Content-Type': contentType,
          'X-Bz-Content-Sha1': 'do_not_verify',
          'X-Bz-Info-src_last_modified_millis': String(file.lastModified || Date.now())
        },
        body: arrayBuffer
      });
    }).then(function(res){
      if(!res.ok){
        return res.text().then(function(txt){
          throw new Error('B2 upload failed: ' + res.status + ' ' + txt);
        });
      }
      return res.json();
    }).then(function(data){
      // Construir URL pública
      var publicUrl = B2_CONFIG.downloadUrl + '/file/' + B2_CONFIG.bucketName + '/' + encodeURIComponent(fileName);
      var result = {
        url: publicUrl,
        path: fileName,
        fileId: data.fileId,
        size: data.contentLength || file.size,
        contentType: contentType
      };
      if(cb) cb(null, result);
      return result;
    }).catch(function(err){
      console.error('[B2] upload error', err);
      if(cb) cb(err);
      throw err;
    });
  });
}

/* ─── Upload de base64 (para chat) ─── */
function b2UploadBase64(base64Data, fileName, contentType, cb){
  if(!base64Data){ if(cb) cb(new Error('no-data')); return Promise.reject(new Error('no-data')); }

  // Converter base64 para Blob
  var arr = base64Data.split(',');
  var mime = arr[0].match(/:(.*?);/);
  var ct = contentType || (mime ? mime[1] : 'application/octet-stream');
  var bstr = atob(arr[1] || arr[0]);
  var bytes = new Uint8Array(bstr.length);
  for(var i = 0; i < bstr.length; i++) bytes[i] = bstr.charCodeAt(i);
  var blob = new Blob([bytes], { type: ct });

  var file = new File([blob], fileName || 'chat-file', { type: ct });
  var path = 'chat/' + Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + fileName;

  return b2UploadFile(file, path, cb);
}

/* ─── Deletar arquivo ─── */
function b2DeleteFile(filePath, fileId, cb){
  if(!filePath){ if(cb) cb(new Error('no-path')); return Promise.resolve(); }

  return _b2Authorize().then(function(){
    // Se não temos fileId, precisamos hide_file (soft delete) ou listar
    // Para simplicidade, usar hide_file se tiver fileId, senão apenas logar
    if(!fileId){
      console.warn('[B2] delete: fileId não fornecido, pulando delete remoto de', filePath);
      if(cb) cb(null);
      return;
    }

    return fetch(B2_CONFIG.apiUrl + '/b2api/v2/b2_delete_file_version', {
      method: 'POST',
      headers: {
        'Authorization': B2_CONFIG.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId: fileId,
        fileName: filePath
      })
    }).then(function(res){
      if(!res.ok) throw new Error('B2 delete failed: ' + res.status);
      return res.json();
    }).then(function(){
      if(cb) cb(null);
    }).catch(function(err){
      console.warn('[B2] delete error (non-fatal)', err);
      if(cb) cb(err);
    });
  });
}

/* ─── Inicialização — expor ao escopo global ─── */
window.b2UploadFile = b2UploadFile;
window.b2UploadBase64 = b2UploadBase64;
window.b2DeleteFile = b2DeleteFile;
window.B2_CONFIG = B2_CONFIG;

/* ─── Verificar se B2 está disponível ─── */
function b2IsAvailable(){
  return !!(B2_CONFIG.keyId && B2_CONFIG.applicationKey && B2_CONFIG.bucketId);
}
window.b2IsAvailable = b2IsAvailable;
