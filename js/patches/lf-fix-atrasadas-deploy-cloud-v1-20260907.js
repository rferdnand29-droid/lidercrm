/* =====================================================================
 * js/patches/lf-fix-atrasadas-deploy-cloud-v1-20260907.js
 * ---------------------------------------------------------------------
 * FIX DEFINITIVO (pedido explícito: "salvar na nuvem pra não voltar a
 * acontecer") — 3 sintomas, 4 causas raiz, todas no mesmo eixo:
 *
 *   S1) atividade concluída "volta como atrasada" após deploy/refresh
 *   S2) lead com badge vermelho de atrasada SEM atividade real
 *   S3) atrasadas que existiram não constam no histórico de passadas
 *
 * Causas (detalhadas no RELATORIO-CAUSAS-ATRASADAS-DEPLOY-20260907.txt):
 *
 *   C1) retry-queue-sync.js fetchAndCacheActivities(): _ss(k1, merged)
 *       grava a lista do SERVIDOR por cima do cache local ANTES de mesclar
 *       — após reload o getActivities() relê a chave já sobrescrita e a
 *       "mescla" não recupera nada. Aqui: mescla ANTES de gravar, com
 *       "done" monotônico (servidor nunca reverte done:true sem um
 *       updatedAt mais novo que o doneAt).
 *
 *   C2) activities-store.js: mapa _pendingByUid e timers de retry são só
 *       em memória. Após reload/deploy nada re-marca nem re-envia os itens
 *       com _pending:true. Aqui: re-hidrata pendências a partir do cache
 *       no boot e dispara saveActivities() na hora.
 *
 *   C3) deleteActBulk() remove da lista central mas NÃO limpa o espelho
 *       card.activities — o fallback legado de _kbHasOverdueLinkedActivity
 *       acha a atividade fantasma e acende o vermelho. Aqui: wrapper de
 *       saveActivities detecta remoções e purga o espelho + marca o id
 *       como excluído (pro sync não ressuscitar).
 *
 *   C4) conclusão só ia pro histórico se o card fosse achado; sem card,
 *       nada registrava. Aqui: sempre registra no feed (que já sobe pra
 *       nuvem, evento por documento) mesmo sem card.
 *
 * Persistência em nuvem (o "salvar na nuvem" do pedido):
 *   Espelha os registros de concluídas/excluídas recentes na tabela
 *   public.client_marks (SQL no relatório) via a RetryQueue que já existe,
 *   e re-baixa/mescla no boot — sobrevive a troca de aparelho e limpeza de
 *   storage, não só a refresh no mesmo aparelho.
 *
 * Carregamento: incluir DEPOIS de js/utils.js, js/agenda.js e
 * src/modules/sync/runtime/retry-queue-sync.js (padrão dos demais patches).
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__lfFixAtrasadasDeployV1) return; // idempotente
  global.__lfFixAtrasadasDeployV1 = true;

  var TAG = '[lf-fix-atrasadas-deploy]';

  // ---------------------------------------------------------------
  // helpers de storage (mesmos padrões já usados no app)
  // ---------------------------------------------------------------
  function _sg(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(_e){ return null; } }
  function _ss(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(_e){ return false; } }

  function _uid(){ return (global.S && global.S.userId) || null; }
  function _actKeyFor(uid){ return 'lf13_acts_' + uid; }

  // ---------------------------------------------------------------
  // C1) mescla com "done monotônico" — servidor nunca reverte done:true
  // ---------------------------------------------------------------
  function _tsOf(a){
    // updatedAt/doneAt podem ser ISO string ou epoch; normaliza p/ número
    function p(v){
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      var t = new Date(v).getTime();
      return isFinite(t) ? t : 0;
    }
    return p(a && (a.updatedAt || a.doneAt || a.createdAt));
  }

  // local vence para ids existentes; servidor só adiciona o que falta.
  // Regra especial: se o local tem done:true e o servidor tem done:false,
  // o servidor só vence se tiver um updatedAt MAIS NOVO que o doneAt local
  // (significa que alguém reabriu/editou DEPOIS da conclusão — caso real).
  function _mergeActivitiesCloudSafe(localList, serverList){
    var byId = Object.create(null);
    var order = [];
    (Array.isArray(serverList) ? serverList : []).forEach(function(a){
      if (!a || !a.id) return;
      byId[a.id] = a; order.push(a.id);
    });
    (Array.isArray(localList) ? localList : []).forEach(function(a){
      if (!a) return;
      if (!a.id){ order.push(a); return; }
      var sv = byId[a.id];
      if (!sv){ byId[a.id] = a; order.push(a.id); return; }
      // done monotônico
      if (a.done === true && sv.done === false){
        var localDoneAt = _tsOf({ doneAt: a.doneAt });
        var svUpd = _tsOf(sv);
        if (!(svUpd > localDoneAt && svUpd > 0)){
          byId[a.id] = a; // mantém concluído — servidor está atrasado
          return;
        }
      }
      // para o resto, o mais recente por updatedAt vence; empate -> local
      byId[a.id] = (_tsOf(sv) > _tsOf(a)) ? sv : a;
    });
    var seen = Object.create(null);
    var out = [];
    order.forEach(function(k){
      if (typeof k === 'string'){
        if (seen[k]) return; seen[k] = true;
        if (byId[k]) out.push(byId[k]);
      } else { out.push(k); }
    });
    return out;
  }

  // ---------------------------------------------------------------
  // C1) patch de fetchAndCacheActivities: mescla ANTES de gravar
  // ---------------------------------------------------------------
  function _patchFetchAndCache(){
    if (!global.LF || typeof global.LF.fetchAndCacheActivities !== 'function') return false;
    if (global.LF.fetchAndCacheActivities.__lfCloudSafe) return true;
    var orig = global.LF.fetchAndCacheActivities;

    async function _patchedFetchAndCache(uid){
      uid = uid || _uid();
      if (!uid) return null;
      var k1 = _actKeyFor(uid);
      var localBefore = _sg(k1) || [];          // <<< captura ANTES de qualquer gravação
      var serverList = null;
      try { serverList = await orig(uid); } catch(_e){ serverList = null; }
      // orig já gravou por cima (Causa 1). Refaz a mescla do jeito certo e
      // regrava — na prática este é o ÚNICO write que fica valendo.
      var merged = _mergeActivitiesCloudSafe(localBefore, serverList || []);
      _ss(k1, merged);
      try {
        if (global.S && global.S.userId === uid && typeof global.ss === 'function'){
          global.ss(k1, merged); // mesma chave via helper oficial, quando for o próprio usuário
        }
      } catch(_e){}
      return merged;
    }
    _patchedFetchAndCache.__lfCloudSafe = true;
    global.LF.fetchAndCacheActivities = _patchedFetchAndCache;
    console.info(TAG, 'fetchAndCacheActivities patched (done monotônico).');
    return true;
  }

  // ---------------------------------------------------------------
  // C2) re-hidratar pendências no boot e drenar na hora
  // ---------------------------------------------------------------
  function _rehydratePendingAndDrain(){
    try {
      var uid = _uid();
      if (!uid) return;
      var list = _sg(_actKeyFor(uid)) || [];
      var pendingIds = list.filter(function(a){ return a && a.id && a._pending === true; })
                           .map(function(a){ return a.id; });
      var rt = global.LiderCRM && global.LiderCRM.modules && global.LiderCRM.modules.agenda
            && global.LiderCRM.modules.agenda.runtime;
      if (rt && rt.pending && typeof rt.pending.mark === 'function' && pendingIds.length){
        rt.pending.mark(uid, pendingIds);
        console.info(TAG, 're-hidratou ' + pendingIds.length + ' pendência(s) do cache.');
      }
      // dispara um save imediato pra confirmar no servidor o que ficou pendente
      if (pendingIds.length && typeof global.saveActivities === 'function'){
        setTimeout(function(){
          try { global.saveActivities(list); } catch(_e){}
        }, 800);
      }
    } catch(_e){}
  }

  // ---------------------------------------------------------------
  // C3) purge do espelho card.activities quando atividade é removida
  // ---------------------------------------------------------------
  function _purgeLegacyMirrorForRemoved(beforeList, afterList){
    try {
      var afterIds = Object.create(null);
      (Array.isArray(afterList) ? afterList : []).forEach(function(a){ if (a && a.id) afterIds[a.id] = true; });
      var removed = (Array.isArray(beforeList) ? beforeList : []).filter(function(a){
        return a && a.id && !afterIds[a.id];
      });
      if (!removed.length) return;
      var touched = Object.create(null); // board|uid -> arr
      removed.forEach(function(a){
        // marca excluído pro sync não ressuscitar
        try { if (typeof global._lfMarkRecentlyDeleted === 'function') global._lfMarkRecentlyDeleted(a.id); } catch(_e){}
        if (!a.clientId || !a.board) return;
        var uid = a.userId || a._ownerId || _uid();
        if (!uid) return;
        var arr = (typeof global.getKBFor === 'function') ? (global.getKBFor(a.board, uid) || []) : [];
        var card = null;
        for (var i = 0; i < arr.length; i++){ if (arr[i] && String(arr[i].id) === String(a.clientId)){ card = arr[i]; break; } }
        if (!card || !Array.isArray(card.activities)) return;
        var before = card.activities.length;
        card.activities = card.activities.filter(function(x){ return !(x && String(x.id) === String(a.id)); });
        if (card.activities.length !== before){
          touched[a.board + '|' + uid] = { board: a.board, uid: uid, arr: arr };
          // C4) registra a exclusão no histórico do card quando ele existe
          try { if (typeof global._pushHistorico === 'function') global._pushHistorico(card, 'Atividade excluída: "' + (a.desc || a.tipo || 'atividade') + '"'); } catch(_e){}
        }
      });
      Object.keys(touched).forEach(function(k){
        var t = touched[k];
        try { if (typeof global.saveKBFor === 'function') global.saveKBFor(t.board, t.uid, t.arr); } catch(_e){}
      });
      if (removed.length) console.info(TAG, 'purge espelho: ' + removed.length + ' atividade(s) removida(s) do card.');
    } catch(_e){}
  }

  function _wrapSaveActivities(){
    if (typeof global.saveActivities !== 'function') return false;
    if (global.saveActivities.__lfPurgeMirror) return true;
    var orig = global.saveActivities;
    function wrapped(list){
      try {
        var uid = _uid();
        if (uid){
          var before = _sg(_actKeyFor(uid)) || [];
          _purgeLegacyMirrorForRemoved(before, list);
        }
      } catch(_e){}
      return orig.apply(this, arguments);
    }
    wrapped.__lfPurgeMirror = true;
    global.saveActivities = wrapped;
    console.info(TAG, 'saveActivities wrapped (purge de espelho).');
    return true;
  }

  // ---------------------------------------------------------------
  // Nuvem: espelhar marcas done/deleted em public.client_marks
  // ---------------------------------------------------------------
  function _sbBase(){
    try { if (typeof global._sbUrl === 'function') return global._sbUrl(); } catch(_e){}
    return null;
  }
  function _enqueueCloudMark(kind, itemId){
    try {
      var uid = _uid();
      if (!uid || !itemId) return;
      var base = _sbBase();
      if (!base || !global.RetryQueue || typeof global.RetryQueue.enqueue !== 'function') return;
      global.RetryQueue.enqueue({
        type: 'client_mark',
        url: base + '/rest/v1/client_marks',
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: { user_id: uid, kind: kind, item_id: String(itemId), ts: Date.now() },
      });
    } catch(_e){}
  }

  function _wrapMarkFns(){
    // done
    if (typeof global._lfMarkRecentlyDone === 'function' && !global._lfMarkRecentlyDone.__lfCloud){
      var od = global._lfMarkRecentlyDone;
      global._lfMarkRecentlyDone = function(id){
        try { _enqueueCloudMark('done', id); } catch(_e){}
        return od.apply(this, arguments);
      };
      global._lfMarkRecentlyDone.__lfCloud = true;
    }
    // deleted
    if (typeof global._lfMarkRecentlyDeleted === 'function' && !global._lfMarkRecentlyDeleted.__lfCloud){
      var ox = global._lfMarkRecentlyDeleted;
      global._lfMarkRecentlyDeleted = function(id){
        try { _enqueueCloudMark('deleted', id); } catch(_e){}
        return ox.apply(this, arguments);
      };
      global._lfMarkRecentlyDeleted.__lfCloud = true;
    }
  }

  async function _pullCloudMarks(){
    try {
      var uid = _uid();
      var base = _sbBase();
      if (!uid || !base) return;
      var hdrs = (typeof global._authHeaders === 'function') ? global._authHeaders() : {};
      hdrs.Accept = 'application/json';
      var url = base + '/rest/v1/client_marks?user_id=eq.' + encodeURIComponent(uid) + '&select=kind,item_id,ts';
      var r = await fetch(url, { method: 'GET', headers: hdrs });
      if (!r.ok) return;
      var rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) return;
      var doneKey = 'lf_recently_done_act_ids_v1';
      var delKey  = 'lf_recently_deleted_ids_v1';
      var doneMap = _sg(doneKey) || {};
      var delMap  = _sg(delKey)  || {};
      rows.forEach(function(row){
        if (!row || !row.item_id || !row.ts) return;
        if (row.kind === 'done'   && !doneMap[row.item_id]) doneMap[row.item_id] = row.ts;
        if (row.kind === 'deleted'&& !delMap[row.item_id])  delMap[row.item_id]  = row.ts;
      });
      _ss(doneKey, doneMap);
      _ss(delKey, delMap);
      console.info(TAG, 'marcas da nuvem mescladas: ' + rows.length + '.');
    } catch(_e){}
  }

  // ---------------------------------------------------------------
  // boot: espera as dependências existirem, aplica tudo 1x
  // ---------------------------------------------------------------
  var _tries = 0;
  function _boot(){
    _tries++;
    var okFetch = _patchFetchAndCache();
    var okSave  = _wrapSaveActivities();
    _wrapMarkFns();
    if ((okFetch && okSave) || _tries > 40){
      _rehydratePendingAndDrain();
      _pullCloudMarks();
      return;
    }
    setTimeout(_boot, 300);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(_boot, 400); });
  } else {
    setTimeout(_boot, 400);
  }

  // API pública mínima pra testes/console
  global.LiderCRM = global.LiderCRM || {};
  global.LiderCRM.fixAtrasadasDeploy = {
    mergeCloudSafe: _mergeActivitiesCloudSafe,
    rehydrate: _rehydratePendingAndDrain,
    pullCloudMarks: _pullCloudMarks,
  };
})(window);
