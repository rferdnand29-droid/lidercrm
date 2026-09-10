/* =====================================================================
 * js/patches/lf-force-clean-refresh-v1-20260820.js
 * -----------------------------------------------------------------------
 * Pedido 2026-08-20: o botão 🔄 (nav-update-btn) hoje só recarrega
 * quando o <meta name="lf-build-id"> local difere do servidor. Se o
 * build-id for igual, ele apenas exibe "✅ Você já está na versão mais
 * recente" e não faz mais nada — o que não resolve bugs residuais de
 * sessões longas (memória inchada, caches técnicos podres, mapas em
 * memória dessincronizados, sessionStorage acumulado, workbox órfão).
 *
 * Este patch faz MONKEY-PATCH de window.lfCheckForUpdateNow, sem
 * alterar js/app-update-checker.js (política: núcleo somente leitura).
 * Quando o usuário clica manualmente no botão (manual===true), força
 * uma limpeza profunda de lixo/cache técnico e recarrega, mesmo que
 * o build-id seja idêntico ao do servidor. Ciclo AUTOMÁTICO permanece
 * leve (não força limpeza pesada — só recarrega quando build muda).
 *
 * O QUE É LIMPO (clique manual)
 * -----------------------------
 * 1) Cache Storage API — caches.delete() em todas as chaves
 * 2) Service Workers — unregister() em todos (defensivo; hoje o CRM
 *    não usa SW, mas se algum dia usar isso garante limpeza)
 * 3) IndexedDB órfão — só bancos de cache técnico (workbox-*,
 *    lf-cache-*, firebase-messaging-database sem push registrado).
 *    NÃO toca bancos de aplicação (rascunhos, offline queue, etc.)
 * 4) sessionStorage — limpa TOTALMENTE (escopo de aba, volátil)
 * 5) localStorage — SELETIVO:
 *    • PRESERVA: sb-*  (Supabase auth), lf-user-pref-*, lf-wallpaper-*,
 *      lf-theme-*, lf-scope-*
 *    • REMOVE: lf-cache-*, lf-tmp-*, _cache_*, lf-feed-cache-*,
 *      lf-kanban-cache-*
 * 6) Buffers em memória — reseta window.__LF_CACHE__ e mapas técnicos
 *    conhecidos (se existirem), sem quebrar refs
 * 7) Hard reload — location.replace com ?_upd=<ts>&_hardclean=1
 *
 * COMPORTAMENTO
 * -------------
 * - Clique manual (manual===true)  → SEMPRE aciona limpeza profunda +
 *   reload, mesmo build-id igual. Toast: "🧹 Limpeza profunda —
 *   recarregando…"
 * - Ciclo automático (manual===false/undefined) → delega ao checker
 *   original; só recarrega quando o build-id muda de verdade.
 *
 * IDEMPOTÊNCIA: window.__LF_FORCE_CLEAN_REFRESH_V1__
 * ROLLBACK: comentar as 4 tags <script> nos HTMLs — nada no núcleo
 * é tocado.
 * ===================================================================== */
(function(global){
  'use strict';
  if(global.__LF_FORCE_CLEAN_REFRESH_V1__) return;
  global.__LF_FORCE_CLEAN_REFRESH_V1__ = true;

  var TAG = '[lf-force-clean-refresh-v1]';

  function _toast(msg, dur){
    try{ if(typeof global.toast === 'function') global.toast(msg, dur||3000); }catch(_e){}
  }

  // --------------------------------------------------------------------
  // Limpezas individuais — cada uma protegida por try/catch para nunca
  // impedir o reload. Falha silenciosa é preferível a bloquear o botão.
  // --------------------------------------------------------------------

  function _clearCacheStorage(){
    try{
      if(global.caches && typeof caches.keys === 'function'){
        return caches.keys().then(function(keys){
          return Promise.all(keys.map(function(k){
            try{ return caches.delete(k); }catch(_e){ return null; }
          }));
        }).catch(function(){ /* ignore */ });
      }
    }catch(_e){}
    return Promise.resolve();
  }

  function _unregisterServiceWorkers(){
    try{
      if(global.navigator && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function'){
        return navigator.serviceWorker.getRegistrations().then(function(regs){
          return Promise.all((regs||[]).map(function(r){
            try{ return r.unregister(); }catch(_e){ return null; }
          }));
        }).catch(function(){ /* ignore */ });
      }
    }catch(_e){}
    return Promise.resolve();
  }

  // IndexedDB: só bancos de CACHE TÉCNICO. Bancos de aplicação (mensageiro
  // offline, rascunhos de leads, filas pendentes) NUNCA são tocados aqui,
  // pra não perder trabalho do usuário.
  var IDB_TECHNICAL_CACHE_PATTERNS = [
    /^workbox-/i,
    /^lf-cache-/i,
    /^lf-tmp-/i,
    /^_cache_/i,
    /^lf-feed-cache/i,
    /^lf-kanban-cache/i
  ];

  function _isTechnicalCacheDb(name){
    if(!name) return false;
    for(var i=0;i<IDB_TECHNICAL_CACHE_PATTERNS.length;i++){
      if(IDB_TECHNICAL_CACHE_PATTERNS[i].test(name)) return true;
    }
    return false;
  }

  function _clearOrphanIndexedDb(){
    try{
      if(!global.indexedDB || typeof indexedDB.databases !== 'function'){
        // Safari/Firefox antigos não expõem .databases() — sem lista,
        // não dá pra saber quais existem; então é seguro NÃO deletar
        // nada (preservar > vazar), e prosseguir.
        return Promise.resolve();
      }
      return indexedDB.databases().then(function(dbs){
        return Promise.all((dbs||[]).map(function(info){
          try{
            var name = info && info.name;
            if(!_isTechnicalCacheDb(name)) return null;
            return new Promise(function(resolve){
              try{
                var req = indexedDB.deleteDatabase(name);
                req.onsuccess = req.onerror = req.onblocked = function(){ resolve(); };
              }catch(_e){ resolve(); }
            });
          }catch(_e){ return null; }
        }));
      }).catch(function(){ /* ignore */ });
    }catch(_e){}
    return Promise.resolve();
  }

  // localStorage seletivo: preservar sessão/preferências, remover só
  // caches técnicos. Padrões definidos junto com o dono do produto.
  var LS_PRESERVE_PATTERNS = [
    /^sb-/,                 // Supabase (auth tokens)
    /^lf-user-pref-/,
    /^lf-wallpaper-/,
    /^lf-theme-/,
    /^lf-scope-/
  ];
  var LS_REMOVE_PATTERNS = [
    /^lf-cache-/,
    /^lf-tmp-/,
    /^_cache_/,
    /^lf-feed-cache-/,
    /^lf-kanban-cache-/
  ];

  function _shouldRemoveLocalStorageKey(k){
    if(!k) return false;
    // Preserve list tem prioridade absoluta — em conflito, mantém.
    for(var i=0;i<LS_PRESERVE_PATTERNS.length;i++){
      if(LS_PRESERVE_PATTERNS[i].test(k)) return false;
    }
    for(var j=0;j<LS_REMOVE_PATTERNS.length;j++){
      if(LS_REMOVE_PATTERNS[j].test(k)) return true;
    }
    return false;
  }

  function _clearLocalStorageSelective(){
    try{
      if(!global.localStorage) return;
      // Coleta primeiro pra não mexer no length durante o loop.
      var toRemove = [];
      for(var i=0; i<localStorage.length; i++){
        var k = localStorage.key(i);
        if(_shouldRemoveLocalStorageKey(k)) toRemove.push(k);
      }
      toRemove.forEach(function(k){
        try{ localStorage.removeItem(k); }catch(_e){}
      });
    }catch(_e){}
  }

  function _clearSessionStorage(){
    try{
      if(global.sessionStorage) sessionStorage.clear();
    }catch(_e){}
  }

  // Buffers em memória: só reseta o que EXISTE — não cria containers
  // novos, pra não confundir consumidores que checam presença de chave.
  function _resetInMemoryCaches(){
    try{
      if(global.__LF_CACHE__ && typeof global.__LF_CACHE__ === 'object'){
        try{
          if(typeof global.__LF_CACHE__.clear === 'function'){
            global.__LF_CACHE__.clear();
          }else{
            Object.keys(global.__LF_CACHE__).forEach(function(k){
              try{ delete global.__LF_CACHE__[k]; }catch(_e){}
            });
          }
        }catch(_e){}
      }
      // Mapas conhecidos usados por módulos internos — tudo defensivo.
      var candidates = [
        '__LF_LEADS_CACHE__',
        '__LF_CHAT_CACHE__',
        '__LF_NOTIF_CACHE__',
        '__LF_FEED_CACHE__',
        '__LF_KANBAN_CACHE__'
      ];
      candidates.forEach(function(name){
        try{
          var ref = global[name];
          if(!ref) return;
          if(ref instanceof Map || ref instanceof Set){
            ref.clear();
          }else if(typeof ref === 'object'){
            Object.keys(ref).forEach(function(k){
              try{ delete ref[k]; }catch(_e){}
            });
          }
        }catch(_e){}
      });
    }catch(_e){}
  }

  function _hardReload(){
    try{
      var url = new URL(global.location.href);
      url.searchParams.set('_upd', String(Date.now()));
      url.searchParams.set('_hardclean', '1');
      global.location.replace(url.toString());
    }catch(_e){
      try{ global.location.reload(); }catch(__e){}
    }
  }

  function _runDeepClean(){
    // Toast informativo primeiro — mesmo que uma das etapas trave,
    // usuário já entende que uma ação começou.
    _toast('🧹 Limpeza profunda — recarregando…', 4000);

    // Etapas síncronas de memória / storage: rodam já.
    try{ _clearLocalStorageSelective(); }catch(_e){}
    try{ _clearSessionStorage(); }catch(_e){}
    try{ _resetInMemoryCaches(); }catch(_e){}

    // Etapas assíncronas: cache storage, SWs, IndexedDB. Espera todas
    // (com timeout defensivo) antes de recarregar — mas nunca segura
    // o reload por mais que 3s.
    var done = false;
    function finish(){
      if(done) return;
      done = true;
      _hardReload();
    }
    try{
      Promise.all([
        _clearCacheStorage(),
        _unregisterServiceWorkers(),
        _clearOrphanIndexedDb()
      ]).then(finish).catch(finish);
    }catch(_e){ finish(); return; }
    // Fail-safe: se algum handler nunca resolver, recarrega mesmo assim.
    setTimeout(finish, 3000);
  }

  // --------------------------------------------------------------------
  // Monkey-patch de window.lfCheckForUpdateNow. Preserva a ref original
  // e a chama pro ciclo automático. Só o clique manual dispara a
  // rotina pesada.
  // --------------------------------------------------------------------

  function _installPatch(){
    var original = global.lfCheckForUpdateNow;
    if(typeof original !== 'function'){
      // app-update-checker.js ainda não carregou — tenta de novo.
      return false;
    }
    if(original.__LF_FORCE_CLEAN_WRAPPED__) return true;

    var wrapped = function(manual){
      if(manual === true){
        // Clique manual: SEMPRE limpeza profunda + reload. Não delega
        // ao original, porque o original bloquearia com "já está na
        // versão mais recente" quando o build-id é igual.
        try{ _runDeepClean(); }catch(e){
          try{ console.warn(TAG, 'deep clean failed, falling back', e); }catch(_e){}
          try{ return original.call(this, true); }catch(_e){}
        }
        return;
      }
      // Automático: comportamento original intacto.
      return original.call(this, manual);
    };
    wrapped.__LF_FORCE_CLEAN_WRAPPED__ = true;
    try{ global.lfCheckForUpdateNow = wrapped; }catch(_e){ return false; }
    try{ console.info(TAG, 'wrapper instalado — clique manual dispara limpeza profunda'); }catch(_e){}
    return true;
  }

  // O checker original define window.lfCheckForUpdateNow no fim de sua
  // IIFE — que roda inline no HTML. Como este patch é carregado com uma
  // tag <script> DEPOIS de app-update-checker.js, na prática já está
  // disponível. Ainda assim, tenta com pequeno backoff pra cobrir corridas.
  function _boot(){
    if(_installPatch()) return;
    var attempts = 0;
    var iv = setInterval(function(){
      attempts++;
      if(_installPatch() || attempts >= 20){
        clearInterval(iv);
      }
    }, 250);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _boot);
  }else{
    _boot();
  }

})(window);
