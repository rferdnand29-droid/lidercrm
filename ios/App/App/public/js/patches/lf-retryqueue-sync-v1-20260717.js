/* =====================================================================
 * lf-retryqueue-sync-v1-20260717.js
 * ---------------------------------------------------------------------
 * FASE 2 — Corrige o bug em que saveActivities / getActivitiesLocalFor
 *          não sobrevivem a offline nem fazem o segundo aparelho
 *          enxergar os agendamentos do primeiro.
 *
 * Rodada 8: a lógica funcional (RetryQueue, SyncManager, storage/rede
 * helpers e LF.fetchAndCacheActivities) foi extraída para
 * src/modules/sync/runtime/retry-queue-sync.js — carrega ANTES deste
 * arquivo e expõe os MESMOS globais (window.RetryQueue, window.SyncManager,
 * window.LF.fetchAndCacheActivities, window.LF.enqueueActivities/
 * enqueueLigacoes), então este patch continua funcionando sem mudar
 * comportamento. Ver ARQUITETURA_RELATORIO.md rodada 8.
 *
 * O que continua aqui (não é lógica pura — depende do carregamento por
 * <script> global e de funções/objetos que só existem depois que
 * agenda.js / etc. rodam):
 *   - Wrap em window.saveActivities / window.saveLigToday (e qualquer
 *     outra que apareca depois) - via polling de 50ms ate a funcao
 *     existir, e so troca 1 vez.
 *   - Hook em window.syncErr: quando o POST original falha, o syncErr
 *     enfileira o estado atual em RetryQueue. Isso captura o caminho
 *     offline / POST falho sem alterar agenda.js.
 *   - Boot: inicia SyncManager, pinta o HUD, hookeia syncErr, cacheia
 *     atividades do usuário logado.
 *
 * Nao mexe em: agenda.js, clientes.js, kanban.js, documentos.js,
 *              notificacoes.js. Carrega ANTES deles e expoe globais.
 * ===================================================================== */
(function(){
  if (window.__lfRetryInstalled) return;
  window.__lfRetryInstalled = true;

  var NS_LF = (window.LF = window.LF || {});

  // RetryQueue / SyncManager / LF.fetchAndCacheActivities / LF.enqueueActivities
  // / LF.enqueueLigacoes já foram inicializados por
  // src/modules/sync/runtime/retry-queue-sync.js (carrega antes deste script).
  var RetryQueue = window.RetryQueue;
  var SyncManager = window.SyncManager;
  var fetchAndCacheActivities = NS_LF.fetchAndCacheActivities;
  var _enqueueActivities = NS_LF.enqueueActivities;
  var _enqueueLigacoes = NS_LF.enqueueLigacoes;

  function _sg(k){ try{ return JSON.parse(localStorage.getItem(k)); } catch(_e){ return null; } }
  function _realOnline(){
    if (typeof navigator === 'undefined') return true;
    if (navigator.onLine === false) return false;        // navegador diz offline
    if (window.__LF_HEALTH_OK === false) return false;    // ping recente do Worker falhou
    return true;
  }

  // -----------------------------------------------------------------
  // Wrap em saveActivities / saveLigToday (polling 50ms ate existirem)
  // -----------------------------------------------------------------
  function _wrapOnce(name, marker){
    if (window[marker]) return;
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window['__orig_' + name] = orig;
    window[name] = function(){
      var ret;
      try { ret = orig.apply(this, arguments); } catch(_e){ ret = undefined; }
      try {
        // online: original ja tentou o POST; so precisamos drenar a fila
        // offline (ou sem cliente real): enfileira intent
        var offline = !_realOnline() ||
                      (typeof DB_MODE !== 'undefined' && DB_MODE === 'local') ||
                      !(window.db || window._sbClient);
        var uid = (window.S && window.S.userId) || (arguments[1] && arguments[1].uid) || (arguments[0] && arguments[0].uid);
        if (name === 'saveActivities'){
          if (offline && uid){ _enqueueActivities(uid, arguments[0]); }
          else if (window.SyncManager && RetryQueue.pending()){ SyncManager.start && SyncManager.start(); setTimeout(function(){ try{ SyncManager.drain(); } catch(_e){} }, 50); }
        } else if (name === 'saveLigToday'){
          var u = uid || (window.S && window.S.userId);
          if (offline && u){ _enqueueLigacoes(u, arguments[0]); }
        }
      } catch(_e){}
      return ret;
    };
    window[marker] = true;
    console.info('[retry] wrapped window.' + name);
  }

  function _startWatching(){
    var tries = 0;
    var t = setInterval(function(){
      tries++;
      if (typeof window.saveActivities === 'function') _wrapOnce('saveActivities', '__lfWrap_sa');
      if (typeof window.saveLigToday  === 'function') _wrapOnce('saveLigToday',  '__lfWrap_lt');
      try {
        if (window.saveActivities && window.saveLigToday && tries > 1){
          clearInterval(t);
        }
        if (tries > 2000){ // FIX (2026-07-22): aumentado de 200 para 2000 (100s) — mobile lento pode demorar mais
          clearInterval(t);
          console.warn('[retry] polling terminou sem wrap completo');
        }
      } catch(_e){}
    }, 50);
  }

  // -----------------------------------------------------------------
  // Hook em syncErr: se o POST original falhou, enfileira o estado atual
  // -----------------------------------------------------------------
  function _hookSyncErr(){
    if (typeof window.syncErr !== 'function' || window.__lfSyncErrWrapped) return;
    var origSE = window.syncErr;
    window.__lfOrigSyncErr = origSE;
    // expose no-top-level pra nao chamar a si mesmo
    var _syncErrBusy = false;
    window.syncErr = function(e){
      // FIX (2026-07-22): guarda de reentrância — evita recursão infinita se
      // origSE ou _enqueueActivities/_enqueueLigacoes dispararem outro syncErr
      if (_syncErrBusy) return origSE.apply(this, arguments);
      _syncErrBusy = true;
      try{
        // tenta enfileirar o estado atual dos agendamentos
        if (typeof S !== 'undefined' && S && S.userId &&
            typeof getActivitiesLocalFor === 'function'){
          var uid = S.userId;
          var list = (function(){
            try { return getActivitiesLocalFor(uid); } catch(_e2){ return []; }
          })();
          if (Array.isArray(list) && list.length){
            _enqueueActivities(uid, list);
          }
        }
        // ligacoes do dia
        if (typeof S !== 'undefined' && S && S.userId &&
            typeof ligKey === 'function'){
          try{
            var t = new Date().toISOString().slice(0,10);
            var k = ligKey(S.userId);
            if (k){ var lt = _sg(k); if (Array.isArray(lt) && lt.length) _enqueueLigacoes(S.userId, lt); }
          } catch(_e2){}
        }
      } catch(_e2){}
      finally { _syncErrBusy = false; }
      return origSE.apply(this, arguments);
    };
    window.__lfSyncErrWrapped = true;
    console.info('[retry] hooked syncErr');
  }

  // -----------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------
  // Inicia wrap + hook imediatamente - as funcoes alvo vao surgir
  // quando agenda.js / etc. carregarem
  _startWatching();

  // Tenta hookar syncErr agora (pode falhar se nao estiver pronto)
  var hookSE_tries = 0;
  var hookSE_intv = setInterval(function(){
    hookSE_tries++;
    _hookSyncErr();
    if (window.__lfSyncErrWrapped || hookSE_tries > 2000){ clearInterval(hookSE_intv); } // FIX (2026-07-22): 200→2000
  }, 80);

  if (typeof window !== 'undefined'){
    if (document.readyState === 'loading'){
      window.addEventListener('DOMContentLoaded', function(){
        try{ SyncManager.start(); } catch(_e){}
        try{ RetryQueue._paint(); } catch(_e){}
        try{ _hookSyncErr(); } catch(_e){}
        try{ fetchAndCacheActivities(); } catch(_e){}   // cacheia local no boot
      });
    } else {
      try{ SyncManager.start(); } catch(_e){}
      try{ RetryQueue._paint(); } catch(_e){}
      try{ _hookSyncErr(); } catch(_e){}
    }
  }
  window.__lfRetryReady = true;
  console.info('[retry] RetryQueue + SyncManager prontos');
})();
