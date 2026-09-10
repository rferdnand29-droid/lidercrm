/* =====================================================================
 * lf-fix-zombie-users-v2-20260804.js
 * ---------------------------------------------------------------------
 * FIX DEFINITIVO — Usuários excluídos voltam depois do reload.
 *
 * CAUSA RAIZ (evidência no código):
 *   1) src/modules/usuarios/runtime/users-store.js:26 (deleteUserDoc)
 *      chama repo.deleteUser(uid); se der 5xx/rede/permissão, o .catch
 *      engole silenciosamente (global.syncErr).
 *   2) O patch anterior lf-cacador-3fixes-v1-20260730.js resolve com
 *      tombstone LOCAL (lf_users_tombstones), mas:
 *        - a lápide expira em 30 dias (linha 48);
 *        - some ao reinstalar app / trocar aparelho / limpar dados;
 *        - o tombstone não é replicado servidor-side.
 *   3) O patch anterior lf-fix-user-delete-persist-v1-20260803.js dispara
 *      wc.saveDocument em vários caminhos candidatos por tentativa e erro,
 *      sem coordenar com o repo.deleteUser real; o "sucesso" de saveDocument
 *      não garante que listUsers() do próximo boot não devolva o usuário.
 *
 * ESTRATÉGIA (aditiva, idempotente):
 *   A) Cloud-tombstone: grava a exclusão no doc de config do próprio
 *      workerClient (chave 'users_tombstones' via putConfig), que já é
 *      lido em todos os dispositivos ao logar. Sem rota nova no worker.
 *   B) Envelopa loadUsersDB — filtra usuários cujo id está no tombstone
 *      REMOTO (lido no boot) e no LOCAL (offline).
 *   C) Envelopa deleteUserDoc — grava tombstone LOCAL SÍNCRONO + remoto
 *      assíncrono; só executa a exclusão real depois da confirmação de
 *      tombstone local (não trava a UX se a rede cair).
 *   D) Torna a instalação idempotente e substitui o patch 3fixes na parte
 *      de usuários (o CSS wallpaper e o anti-clone daquele patch NÃO são
 *      tocados por este arquivo).
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__LF_FIX_ZOMBIE_USERS_V2__) return;
  global.__LF_FIX_ZOMBIE_USERS_V2__ = true;

  var TAG = '[lf-fix-zombie-users v2-20260804]';
  var LS  = global.localStorage;
  var LOCAL_KEY  = 'lf_users_tombstones_v2';
  var CLOUD_KEY  = 'users_tombstones';       // usa putConfig/getConfig do workerClient
  var TTL_MS     = 365 * 24 * 60 * 60 * 1000; // 1 ano — sobrevive a reinstalar app
  var _cloudSynced = false;

  function log(){ try{ console.debug.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function warn(){ try{ console.warn.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_e){} }

  function _wc(){
    var root = global.LiderCRM;
    return (root && root.api && root.api.workerClient) || global.workerClient || null;
  }

  /* --------------------- Tombstones locais --------------------- */
  function _readLocal(){
    try { return JSON.parse(LS.getItem(LOCAL_KEY) || '{}') || {}; }
    catch(_e){ return {}; }
  }
  function _writeLocal(m){
    try { LS.setItem(LOCAL_KEY, JSON.stringify(m || {})); } catch(_e){}
  }
  function _cleanExpired(m){
    var now = Date.now(), changed = false;
    Object.keys(m).forEach(function(uid){
      var ts = (m[uid] && m[uid].ts) || m[uid];
      if (!ts || (now - ts) > TTL_MS){ delete m[uid]; changed = true; }
    });
    return { map: m, changed: changed };
  }
  function _addLocal(uid){
    if (!uid) return;
    var m = _readLocal();
    m[uid] = { ts: Date.now(), deletedBy: (global.S && global.S.userId) || null };
    _writeLocal(m);
  }
  function _mergeRemoteIntoLocal(remoteMap){
    var local = _readLocal();
    var now = Date.now();
    Object.keys(remoteMap || {}).forEach(function(uid){
      var r = remoteMap[uid];
      var ts = (r && r.ts) || r || now;
      var cur = local[uid];
      if (!cur || (cur.ts || cur) < ts){
        local[uid] = { ts: ts, deletedBy: (r && r.deletedBy) || null };
      }
    });
    var cleaned = _cleanExpired(local);
    _writeLocal(cleaned.map);
    return cleaned.map;
  }
  function _isTombed(uid){
    if (!uid) return false;
    return !!_readLocal()[uid];
  }

  /* --------------------- Sync com a nuvem --------------------- */
  function _hasWorkerAuth(){
    try{
      var s = global.S || {};
      if (s._workerToken || s.token) return true;
      if (global.__LF_WORKER_JWT) return true;
      var hc = global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.httpClient;
      var sess = hc && hc.session;
      if (sess && typeof sess.get === 'function'){
        var cur = sess.get();
        if (cur && cur.token) return true;
      }
    }catch(_e){}
    return false;
  }
  function _fetchCloudTombs(){
    var wc = _wc();
    if (!wc || typeof wc.getConfig !== 'function') return Promise.resolve({});
    return Promise.resolve()
      .then(function(){ return wc.getConfig(CLOUD_KEY); })
      .then(function(doc){
        var map = (doc && doc.map) || (doc && doc.value) || doc || {};
        return (map && typeof map === 'object') ? map : {};
      })
      .catch(function(err){ warn('getConfig(users_tombstones) falhou', err); return {}; });
  }
  function _pushCloudTombs(){
    var wc = _wc();
    if (!wc || typeof wc.putConfig !== 'function') return Promise.resolve(false);
    var map = _readLocal();
    return Promise.resolve()
      .then(function(){ return wc.putConfig(CLOUD_KEY, { map: map, ts: Date.now() }); })
      .then(function(){ log('tombstones enviados para nuvem:', Object.keys(map).length); return true; })
      .catch(function(err){ warn('putConfig(users_tombstones) falhou', err); return false; });
  }
  function _syncCloud(){
    if (_cloudSynced) return Promise.resolve();
    /* FIX 2026-08-04 (hotfix 401): sem JWT ainda sincronizado, adia o sync
       em vez de tomar 401 no getConfig inicial (gate lf-when-worker-auth). */
    if (!_hasWorkerAuth()){
      setTimeout(_syncCloud, 500);
      return Promise.resolve(false);
    }
    _cloudSynced = true;
    return _fetchCloudTombs().then(function(remote){
      _mergeRemoteIntoLocal(remote || {});
      // Se o local tem entradas que o remoto não tem, empurra pra nuvem
      return _pushCloudTombs();
    });
  }

  /* --------------------- Wrappers --------------------- */
  function _install_loadUsersDBWrap(){
    if (typeof global.loadUsersDB !== 'function'){
      setTimeout(_install_loadUsersDBWrap, 200);
      return;
    }
    if (global.loadUsersDB.__lfZombieUsersWrapped) return;
    var _orig = global.loadUsersDB;

    global.loadUsersDB = function(cb){
      // Dispara sync com nuvem em paralelo (não bloqueia UI)
      _syncCloud();
      var wrapped = function(list){
        var filtered = (list || []).filter(function(u){
          if (!u || !u.id) return false;
          if (_isTombed(u.id)){ log('filtrado (tomb):', u.id); return false; }
          if (u.deleted === true || u.ativo === false || u.active === false) return u; // deixa passar visualmente; a tela é quem decide
          return true;
        });
        if (filtered.length !== (list || []).length){
          try { global.ss('lf6_u', filtered); } catch(_e){}
        }
        if (typeof cb === 'function') cb(filtered);
      };
      return _orig.call(this, wrapped);
    };
    global.loadUsersDB.__lfZombieUsersWrapped = true;

    try {
      var rt = (((global.LiderCRM||{}).modules||{}).usuarios||{}).runtime;
      if (rt) rt.loadUsersDB = global.loadUsersDB;
    } catch(_e){}
    log('loadUsersDB envelopado');
  }

  function _install_deleteUserDocWrap(){
    if (typeof global.deleteUserDoc !== 'function'){
      setTimeout(_install_deleteUserDocWrap, 200);
      return;
    }
    if (global.deleteUserDoc.__lfZombieUsersWrapped) return;
    var _orig = global.deleteUserDoc;

    global.deleteUserDoc = function(uid){
      if (uid){
        _addLocal(uid);
        // remove o usuário do cache local imediatamente
        try {
          var users = (typeof global.getUsers === 'function') ? global.getUsers() : (global.sg && global.sg('lf6_u')) || [];
          var next = users.filter(function(u){ return u && u.id && u.id !== uid; });
          if (next.length !== users.length) global.ss('lf6_u', next);
        } catch(_e){}
        // agenda o push para a nuvem (não bloqueia)
        setTimeout(_pushCloudTombs, 0);
      }
      return _orig.apply(this, arguments);
    };
    global.deleteUserDoc.__lfZombieUsersWrapped = true;

    try {
      var rt = (((global.LiderCRM||{}).modules||{}).usuarios||{}).runtime;
      if (rt) rt.deleteUserDoc = global.deleteUserDoc;
    } catch(_e){}
    log('deleteUserDoc envelopado');
  }

  function _install_getUsersWrap(){
    // defesa em profundidade: se algum caminho ler direto de lf6_u
    // sem passar por loadUsersDB, ainda filtramos tombstones.
    if (typeof global.getUsers !== 'function'){
      setTimeout(_install_getUsersWrap, 200);
      return;
    }
    if (global.getUsers.__lfZombieUsersWrapped) return;
    var _orig = global.getUsers;
    global.getUsers = function(){
      var list = _orig.apply(this, arguments) || [];
      return list.filter(function(u){ return u && u.id && !_isTombed(u.id); });
    };
    global.getUsers.__lfZombieUsersWrapped = true;
    try {
      var rt = (((global.LiderCRM||{}).modules||{}).usuarios||{}).runtime;
      if (rt) rt.getUsers = global.getUsers;
    } catch(_e){}
    log('getUsers envelopado (defesa em profundidade)');
  }

  /* --------------------- Boot --------------------- */
  function _installAll(){
    _install_loadUsersDBWrap();
    _install_deleteUserDocWrap();
    _install_getUsersWrap();
    // Boot-time cloud sync — sem esperar (internamente aguarda o JWT
    // via _hasWorkerAuth antes da 1ª chamada — hotfix 401 2026-08-04)
    setTimeout(_syncCloud, 300);
  }
  _installAll();
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _installAll);
  }

  /* --------------------- API pública --------------------- */
  global.LF_FIX_ZOMBIE_USERS = {
    version: 'v2-20260804',
    tombstones: _readLocal,
    isTombed: _isTombed,
    addTombstone: _addLocal,
    forgetTombstone: function(uid){
      var m = _readLocal(); delete m[uid]; _writeLocal(m);
      _pushCloudTombs();
    },
    forceSync: _syncCloud,
    reinstall: _installAll
  };

  console.info(TAG, 'instalado — usuários excluídos não voltam mais após reload.');
})(window);
