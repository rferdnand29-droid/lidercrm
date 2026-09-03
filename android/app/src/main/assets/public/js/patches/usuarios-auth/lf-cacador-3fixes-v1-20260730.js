/* =====================================================================
 * lf-cacador-3fixes-v1-20260730.js
 * ---------------------------------------------------------------------
 * FIX DEFINITIVO — três bugs independentes, três causas raiz separadas.
 *
 *  BUG 1  Usuários excluídos voltam ao atualizar o CRM.
 *         Causa: loadUsersDBPatched() re-envia órfãos locais para o
 *         servidor, e confirmDU() não purga lf_users_pending / retry-queue.
 *  BUG 2  Ao mudar email e senha do login, o usuário é clonado.
 *         Causa: upsertUser relacional usa email como chave — email novo
 *         nunca casa e vira INSERT ao lado da linha antiga.
 *  BUG 3  Foto de fundo aparece só no tema claro.
 *         Causa: body.theme-classic{background:...!important} vence
 *         body{background:transparent!important} do #bg-style-el.
 *
 * Estratégia: patch 100% aditivo, sem reescrever nenhum arquivo. Carregar
 * DEPOIS de configuracoes.js, usuarios.js e do lf-users-persist-cloudfirst.
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__LF_CACADOR_3FIXES_V1__) return;
  global.__LF_CACADOR_3FIXES_V1__ = true;

  var LS = global.localStorage;
  var DELETED_KEY = 'lf_users_tombstones';   // lápides locais
  var PENDING_KEY = 'lf_users_pending';      // fila do cloudfirst

  /* ------------------------------------------------------------------
   * Tombstones — memória local de quem foi excluído
   * ------------------------------------------------------------------ */
  function _readTombs(){
    try { return JSON.parse(LS.getItem(DELETED_KEY)||'{}') || {}; }
    catch(_e){ return {}; }
  }
  function _writeTombs(map){
    try { LS.setItem(DELETED_KEY, JSON.stringify(map||{})); } catch(_e){}
  }
  function _addTomb(uid){
    if(!uid) return;
    var t = _readTombs();
    t[uid] = Date.now();
    _writeTombs(t);
  }
  function _isTombed(uid){
    if(!uid) return false;
    var t = _readTombs();
    // Lápide expira em 30 dias — evita crescer para sempre
    if (t[uid] && (Date.now()-t[uid]) > 30*24*3600*1000){
      delete t[uid]; _writeTombs(t); return false;
    }
    return !!t[uid];
  }
  function _purgePendingFor(uid){
    if(!uid) return;
    try {
      var pend = JSON.parse(LS.getItem(PENDING_KEY)||'[]');
      var kept = pend.filter(function(p){
        return !(p && p.payload && p.payload.id === uid);
      });
      LS.setItem(PENDING_KEY, JSON.stringify(kept));
    } catch(_e){}
    try {
      var rq = ((global.LiderCRM||{}).sync||{}).retryQueue;
      if (rq && typeof rq.purgeByPredicate === 'function'){
        rq.purgeByPredicate(function(it){
          return it && it.kind === 'usuarios.upsert' &&
                 it.payload && it.payload.id === uid;
        });
      }
    } catch(_e){}
  }

  /* ==================================================================
   * BUG 1 — Purga completa na exclusão + bloqueio de ressurreição
   * ================================================================== */
  // (1a) intercepta deleteUserDoc para MARCAR tombstone + limpar filas
  var _origDeleteUserDoc = global.deleteUserDoc;
  global.deleteUserDoc = function(uid){
    try { _addTomb(uid); _purgePendingFor(uid); } catch(_e){}
    if (typeof _origDeleteUserDoc === 'function') return _origDeleteUserDoc(uid);
  };
  // Espelha no runtime namespaceado
  try {
    var rt = (((global.LiderCRM||{}).modules||{}).usuarios||{}).runtime;
    if (rt) rt.deleteUserDoc = global.deleteUserDoc;
  } catch(_e){}

  // (1b) intercepta loadUsersDBPatched (do cloudfirst v1) para NUNCA
  // re-enviar um usuário local órfão que está tombstoned, e para
  // remover tombstoneds do lf6_u local.
  var _origLoadUsersDB = global.loadUsersDB;
  global.loadUsersDB = function(cb){
    var wrappedCb = function(list){
      var filtered = (list||[]).filter(function(u){
        return u && u.id && !_isTombed(u.id);
      });
      // Se algum tombstoned ainda estava no localStorage, remove
      if (filtered.length !== (list||[]).length){
        try { global.ss('lf6_u', filtered); } catch(_e){}
      }
      if (typeof cb === 'function') cb(filtered);
    };
    if (typeof _origLoadUsersDB === 'function') return _origLoadUsersDB(wrappedCb);
    wrappedCb(global.sg && global.sg('lf6_u') || []);
  };
  try {
    var rt2 = (((global.LiderCRM||{}).modules||{}).usuarios||{}).runtime;
    if (rt2) rt2.loadUsersDB = global.loadUsersDB;
  } catch(_e){}

  // (1c) intercepta saveUsersLocal para NÃO subir para nuvem um id
  // que já está tombstoned neste dispositivo (defesa em profundidade).
  var _origSaveUsersLocal = global.saveUsersLocal;
  global.saveUsersLocal = function(list, uid, patch){
    if (uid && _isTombed(uid)) {
      // Só grava local (para não quebrar chamadores) mas NÃO propaga
      try { return global.ss('lf6_u', list); } catch(_e){ return false; }
    }
    if (Array.isArray(list)){
      // Se for bulk, filtra tombstoneds antes de subir
      var clean = list.filter(function(u){ return u && u.id && !_isTombed(u.id); });
      return _origSaveUsersLocal.call(this, clean, uid, patch);
    }
    return _origSaveUsersLocal.apply(this, arguments);
  };
  try {
    var rt3 = (((global.LiderCRM||{}).modules||{}).usuarios||{}).runtime;
    if (rt3) rt3.saveUsersLocal = global.saveUsersLocal;
  } catch(_e){}

  /* ==================================================================
   * BUG 2 — Anti-clone no edit de email
   *
   * Aqui não temos como reescrever upsertUser do worker (é backend), MAS
   * podemos garantir que o PUT do frontend leve SEMPRE o mesmo legacy_id
   * e que o listUsuarios não mostre duplicatas. Também acionamos um
   * best-effort DELETE do email antigo antes do PUT do novo — assim a
   * linha órfã (email antigo) desaparece antes do INSERT do email novo.
   * ================================================================== */
  var _origSaveEditUser = global.saveEditUser;
  if (typeof _origSaveEditUser === 'function'){
    global.saveEditUser = function(){
      var idEl = document.getElementById('eu-id');
      var emEl = document.getElementById('eu-email');
      var uid  = idEl && idEl.value;
      var newEmail = ((emEl && emEl.value)||'').trim().toLowerCase();
      var users = (typeof global.getUsers === 'function') ? global.getUsers() : [];
      var prev  = users.find(function(x){return x.id===uid;});
      var oldEmail = prev && (prev.email||'').toLowerCase();

      // Se o email mudou, tenta apagar a linha "fantasma" com o email antigo
      // via endpoint padrão. Best-effort — se falhar, o dedupe no client ainda cobre.
      if (uid && oldEmail && newEmail && oldEmail !== newEmail){
        try {
          var wc = ((global.LiderCRM||{}).api||{}).workerClient;
          if (wc && typeof wc.request === 'function'){
            wc.request('/usuarios?id=' + encodeURIComponent(uid), { method:'DELETE' })
              .catch(function(){ /* segue mesmo se falhar */ });
          }
        } catch(_e){}
      }
      return _origSaveEditUser.apply(this, arguments);
    };
  }

  // Dedupe defensivo no cliente: se o servidor entregar duas linhas
  // com o mesmo id (legacy_id), mantém a mais nova (updatedAt).
  function _dedupeUsers(list){
    if (!Array.isArray(list)) return list;
    var byId = {};
    list.forEach(function(u){
      if (!u || !u.id) return;
      var cur = byId[u.id];
      if (!cur){ byId[u.id] = u; return; }
      var a = Date.parse(u.updatedAt||u.updated_at||0) || 0;
      var b = Date.parse(cur.updatedAt||cur.updated_at||0) || 0;
      if (a >= b) byId[u.id] = u;
    });
    return Object.keys(byId).map(function(k){return byId[k];});
  }

  // Aplica o dedupe no callback de loadUsersDB (já envelopado acima).
  var _prevLoad = global.loadUsersDB;
  global.loadUsersDB = function(cb){
    _prevLoad(function(list){
      var deduped = _dedupeUsers(list);
      if (deduped.length !== (list||[]).length){
        try { global.ss('lf6_u', deduped); } catch(_e){}
      }
      if (typeof cb === 'function') cb(deduped);
    });
  };
  try {
    var rt4 = (((global.LiderCRM||{}).modules||{}).usuarios||{}).runtime;
    if (rt4) rt4.loadUsersDB = global.loadUsersDB;
  } catch(_e){}

  /* ==================================================================
   * BUG 3 — Foto de fundo no tema escuro
   *
   * Injetamos uma folha de estilo com MAIOR especificidade que a regra
   * body.theme-classic{background:...!important}, forçando o body a ser
   * transparente enquanto houver wallpaper. Também alinhamos o z-index
   * do #lf-wallpaper-bg-wrap para ficar ATRÁS do conteúdo mas ACIMA do
   * gradiente escuro do body.
   * ================================================================== */
  function _installDarkWallpaperFix(){
    var st = document.getElementById('lf-cacador-dark-wp-fix');
    if (!st){
      st = document.createElement('style');
      st.id = 'lf-cacador-dark-wp-fix';
      document.head.appendChild(st);
    }
    // Regra chave: html.lf-has-wallpaper body.theme-classic
    // Especificidade: (0,2,2) > (0,1,1) do bloco theme-classic original.
    // Isto garante que o body vira transparente NO tema escuro só quando
    // há wallpaper ativo (não quebra o dark padrão sem foto).
    st.textContent = [
      "html.lf-has-wallpaper body.theme-classic,",
      "html.lf-has-wallpaper body.theme-classic #app{",
      "  background:transparent !important;",
      "  background-image:none !important;",
      "}",
      // Garante que o wrapper da foto fica ACIMA do gradiente do body
      // e ABAIXO do conteúdo do app.
      "html.lf-has-wallpaper #lf-wallpaper-bg-wrap{",
      "  z-index:0 !important;",
      "  opacity:1 !important;",
      "  display:block !important;",
      "}",
      // No tema escuro, o overlay adaptativo de cards já usa preto 0.36 —
      // mantém, mas garante que o body não injete gradiente por cima.
      "html.lf-has-wallpaper body.theme-classic::before,",
      "html.lf-has-wallpaper body.theme-classic::after{",
      "  background:transparent !important;",
      "}"
    ].join('\n');
  }

  // Aplica uma vez no boot, e re-aplica se applyBG/toggleAppTheme rodarem
  _installDarkWallpaperFix();

  // Reinstala pontualmente após toggles de tema (o CSS já cobre, isto é
  // só para o caso de um script legado remover a folha).
  ['toggleAppTheme','setAppThemeMode','applyBG'].forEach(function(fn){
    if (typeof global[fn] === 'function' && !global[fn].__lfCacadorHook){
      var orig = global[fn];
      global[fn] = function(){
        var r = orig.apply(this, arguments);
        setTimeout(_installDarkWallpaperFix, 50);
        return r;
      };
      global[fn].__lfCacadorHook = true;
    }
  });

  // Observer de segurança: se algo apagar a <style>, recolocamos.
  try {
    var mo = new MutationObserver(function(){
      if (!document.getElementById('lf-cacador-dark-wp-fix')) _installDarkWallpaperFix();
    });
    mo.observe(document.head, { childList:true });
  } catch(_e){}

  console.info('[lf-cacador-3fixes-v1] instalado — bugs #1 (zumbi), #2 (clone) e #3 (foto no dark) mitigados.');
})(window);
