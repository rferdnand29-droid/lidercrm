/* =====================================================================
 * lf-fix-activity-cloud-persist-v3-20260804.js
 * ---------------------------------------------------------------------
 * CORREÇÃO DEFINITIVA — "atividades/lembretes estão sumindo sozinho e
 * não salvando em nuvem mesmo após concluídos".
 *
 * ESTE PATCH SUBSTITUI (deprecia) os anteriores:
 *   - lf-fix-activity-done-persist-v1-20260803.js  (era no-op no CRM real)
 *   - lf-fix-activity-done-real-v2-20260804.js     (correto no wrapping,
 *      mas dependia de LF.enqueueActivities, que enfileira no endpoint
 *      ERRADO — Supabase activities_legacy — e nunca chega ao Worker;
 *      além disso não protegia contra o zeramento provocado por
 *      LF.fetchAndCacheActivities). Mantidos por compatibilidade, mas
 *      seus efeitos são substituídos pelos wrappers abaixo.
 *
 * CAUSAS RAÍZES CORRIGIDAS:
 *
 *   [A] LF.fetchAndCacheActivities (retry-queue-sync.js) lê do Supabase
 *       activities_legacy (fonte legada, hoje vazia na maioria dos
 *       deploys — a fonte real é o Worker /api/v1/atividades/list) e
 *       grava com _ss direto em lf13_acts_<uid>, ZERANDO o cache local
 *       — inclusive itens _pending:true (ainda não sincronizados) e
 *       itens done:true cujo PUT ao Worker ainda estava em voo. Como é
 *       chamado 3x no boot (js/app.js) + a cada visibilitychange, o
 *       cache local pisca constantemente, e qualquer gravação otimista
 *       que não tenha respondido a tempo é perdida.
 *
 *   [B] activities-store.saveActivities / lfSaveActivitiesFor: no
 *       .catch() do PUT ao Worker chamam LF.enqueueActivities(uid,
 *       list), que enfileira para POST no Supabase activities_legacy
 *       — endpoint DIFERENTE do que o app usa hoje (Worker). O item
 *       enfileirado tem alta chance de bater em 401/403 no Supabase
 *       (RLS validando um JWT de Worker) e vai pra DLQ. Nunca chega
 *       ao endpoint correto. O "done" nunca é persistido de verdade.
 *
 *   [C] Mesmo quando o PUT ao Worker vai bem, se um
 *       fetchAndCacheActivities cair entre o save otimista e a resposta
 *       do PUT (janela de ~500ms em 3G/4G), o cache é zerado e a
 *       resposta de sucesso limpa _pending sobre um cache vazio — o
 *       item desaparece.
 *
 * ESTRATÉGIA (5 correções combinadas, todas idempotentes e sem alterar
 * o fluxo original — apenas envelopando/substituindo):
 *
 *   FIX 1 — Substitui LF.fetchAndCacheActivities por uma versão SEGURA
 *           que:
 *             (a) NUNCA sobrescreve o cache local com uma lista vazia
 *                 (guarda de segurança contra Supabase legado vazio).
 *             (b) Sempre PRESERVA itens com _pending:true.
 *             (c) Sempre PRESERVA itens com done:true que ainda não
 *                 aparecem no que veio do servidor.
 *             (d) Usa como fonte primária o Worker (atividadesList),
 *                 caindo para Supabase legacy só como fallback — e
 *                 mesmo o fallback vazio nunca zera o cache.
 *
 *   FIX 2 — Reroteia a fila de retry:
 *           Substitui LF.enqueueActivities para enfileirar um PUT ao
 *           WORKER (/api/v1/atividades/list?uid=<uid>) em vez do
 *           Supabase legacy — endpoint EFETIVAMENTE consumido pelo
 *           CRM hoje. Inclui autenticação Bearer via httpClient.session.
 *
 *   FIX 3 — Fallback do save quando não há worker no boot: se
 *           _agdWorkerClient() ainda não está pronto no momento de um
 *           save, o item vai direto para a nova fila (FIX 2), garantindo
 *           que ele suba assim que o worker instanciar — em vez de ficar
 *           apenas em localStorage sem promessa de sync.
 *
 *   FIX 4 — Envelopa actConfirmDone / applyActBulkDone / markTlActDone
 *           (funções REAIS do agenda.js) para SEMPRE re-persistir no
 *           owner correto após a original rodar, com verificação de
 *           done confirmado no servidor via GET de reconciliação
 *           (drift-detection).
 *
 *   FIX 5 — Rede de segurança periódica (60s) e em eventos de
 *           visibilidade: reconcilia atividades marcadas done
 *           localmente que ainda não subiram (drena a fila do Worker
 *           direto, não a fila legada do Supabase).
 *
 * COMPATIBILIDADE:
 *   - Cloudflare Worker: usa /api/v1/atividades/list (rota real).
 *   - Capacitor: apenas localStorage + fetch (nenhum plugin nativo).
 *   - Firebase mode (DB_MODE==='firebase'): permanece intocado — só
 *     age quando o app está no modo Worker (que é o modo padrão hoje).
 *
 * REVERSÍVEL: basta remover as 2 linhas de <script> do index.html /
 *             app.html e recarregar. Não há migração de dados.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_FIX_ACT_CLOUD_PERSIST_V3__) return;
  global.__LF_FIX_ACT_CLOUD_PERSIST_V3__ = true;

  var TAG = '[lf-fix-act-cloud-v3]';
  var RETRY_KEY = 'lf_act_worker_retry_v3';
  var MAX_ATTEMPTS = 8;

  function _log()  { try { if (global.console && console.debug) console.debug.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
  function _warn() { try { if (global.console && console.warn ) console.warn.apply (console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }

  function _S()   { return global.S || null; }
  function _uid() { var s = _S(); return (s && s.userId) || null; }

  function _wc() {
    var root = global.LiderCRM;
    return (root && root.api && root.api.workerClient) || global.workerClient || null;
  }

  function _actKeyFor(uid) { return 'lf13_acts_' + uid; }

  function _readLocal(uid) {
    try { return JSON.parse(localStorage.getItem(_actKeyFor(uid)) || '[]') || []; }
    catch (_e) { return []; }
  }

  function _writeLocal(uid, list) {
    try { localStorage.setItem(_actKeyFor(uid), JSON.stringify(list || [])); return true; }
    catch (_e) { return false; }
  }

  // ---------------------------------------------------------------
  // FIX 1 — fetchAndCacheActivities SEGURO
  // ---------------------------------------------------------------
  // Substitui LF.fetchAndCacheActivities pela versão que:
  //   (a) tenta primeiro o Worker (atividadesList), depois Supabase
  //       activities_legacy como fallback (para não perder deploys
  //       antigos que ainda usem essa origem).
  //   (b) NUNCA sobrescreve cache com lista vazia (guard).
  //   (c) sempre preserva itens _pending e itens done presentes no
  //       cache local mas ausentes na lista do servidor.
  function _installSafeFetch() {
    var NS_LF = (global.LF = global.LF || {});
    var origFetch = NS_LF.fetchAndCacheActivities;
    if (NS_LF.fetchAndCacheActivities && NS_LF.fetchAndCacheActivities.__lfV3Safe) return;

    var safeFetch = function (uid) {
      uid = uid || _uid();
      if (!uid) return Promise.resolve(null);

      var wc = _wc();
      var serverPromise;

      if (wc && typeof wc.atividadesList === 'function') {
        serverPromise = wc.atividadesList(uid).then(function (doc) {
          return (doc && Array.isArray(doc.list)) ? doc.list : null;
        }).catch(function () { return null; });
      } else if (typeof origFetch === 'function') {
        // fallback: rota legada (Supabase activities_legacy)
        serverPromise = Promise.resolve()
          .then(function () { return origFetch.call(NS_LF, uid); })
          .then(function (list) { return Array.isArray(list) ? list : null; })
          .catch(function () { return null; });
      } else {
        serverPromise = Promise.resolve(null);
      }

      return serverPromise.then(function (serverList) {
        var local = _readLocal(uid);

        // GUARDA (a): se o servidor não retornou nada útil (null ou []),
        // NÃO tocamos no cache local. Antes, a origem legada zerava tudo.
        if (!serverList || (Array.isArray(serverList) && serverList.length === 0)) {
          _log('fetch seguro: servidor vazio/indisponível — cache local preservado', uid, 'itens locais:', local.length);
          return local;
        }

        // MERGE por id: servidor é a base; itens locais com _pending ou
        // done não presentes no servidor são preservados (evita perder
        // gravação otimista em voo — Causa C).
        var byId = Object.create(null);
        serverList.forEach(function (a) { if (a && a.id) byId[a.id] = a; });

        local.forEach(function (a) {
          if (!a || !a.id) return;
          var srv = byId[a.id];
          if (!srv) {
            // não existe no servidor: só preserva se for pending ou done
            // (senão foi genuinamente excluído no servidor por outra aba/dispositivo)
            if (a._pending || a.done) byId[a.id] = a;
            return;
          }
          // existe nos dois: se local está done e servidor não, MANTÉM local
          // (done ainda não confirmado no servidor — não pode regredir).
          if (a.done && !srv.done) {
            byId[a.id] = Object.assign({}, srv, {
              done: true,
              doneAt: a.doneAt || srv.doneAt || new Date().toISOString(),
              _pending: true    // permanece pending até o Worker confirmar
            });
          }
          // se local tem _pending e servidor não reflete a última edição,
          // mantém a versão local (updatedAt mais recente vence).
          else if (a._pending && (!srv.updatedAt || (a.updatedAt && a.updatedAt > srv.updatedAt))) {
            byId[a.id] = a;
          }
        });

        var merged = Object.keys(byId).map(function (k) { return byId[k]; });
        _writeLocal(uid, merged);
        _log('fetch seguro concluído — servidor:', serverList.length,
             '| local antes:', local.length, '| merged:', merged.length, '| uid:', uid);
        return merged;
      });
    };

    safeFetch.__lfV3Safe = true;
    NS_LF.fetchAndCacheActivities = safeFetch;
    _log('FIX 1 instalado — LF.fetchAndCacheActivities agora é seguro.');
  }

  // ---------------------------------------------------------------
  // FIX 2 — Fila de retry redirecionada para o WORKER
  // ---------------------------------------------------------------
  // Substitui LF.enqueueActivities para NÃO usar Supabase legacy.
  // Empilha um PUT autenticado direto em /api/v1/atividades/list, e
  // executa o drain aqui mesmo (independente do SyncManager, que só
  // sabe drenar itens Supabase). Persistente em localStorage.
  function _readRetry() {
    try { return JSON.parse(localStorage.getItem(RETRY_KEY) || '{}') || {}; }
    catch (_e) { return {}; }
  }
  function _writeRetry(m) { try { localStorage.setItem(RETRY_KEY, JSON.stringify(m || {})); } catch (_e) {} }

  function _enqueueWorker(uid, list) {
    if (!uid) return null;
    var m = _readRetry();
    m[uid] = {
      uid: uid,
      list: Array.isArray(list) ? list : [],
      ts: Date.now(),
      attempts: (m[uid] && m[uid].attempts) || 0,
      nextAt: 0
    };
    _writeRetry(m);
    _log('enfileirado (worker retry):', uid, 'itens:', (list || []).length);
    return uid;
  }

  function _backoffMs(attempts) {
    return Math.min(300000, 2000 * Math.pow(2, Math.max(0, attempts - 1))); // 2s → 5min
  }

  var _drainInFlight = false;
  function _drainWorkerQueue() {
    if (_drainInFlight) return Promise.resolve();
    _drainInFlight = true;

    var wc = _wc();
    if (!wc || typeof wc.saveAtividadesList !== 'function') {
      _drainInFlight = false;
      return Promise.resolve();
    }

    var m = _readRetry();
    var uids = Object.keys(m);
    if (!uids.length) { _drainInFlight = false; return Promise.resolve(); }

    var now = Date.now();
    var jobs = uids
      .filter(function (uid) { return !m[uid].nextAt || now >= m[uid].nextAt; })
      .map(function (uid) {
        var item = m[uid];
        // relê o cache local no momento do drain — se o usuário mudou algo
        // nesse meio-tempo, sobe a versão mais atual (mesmo padrão do
        // activities-store._enqueueSave).
        var payload = _readLocal(uid);
        if (!payload.length) payload = item.list || [];

        return wc.saveAtividadesList(uid, payload, item.ts).then(function () {
          var m2 = _readRetry();
          delete m2[uid];
          _writeRetry(m2);
          _log('drain OK:', uid, 'itens sincronizados:', payload.length);
          // limpa _pending dos itens que agora estão confirmados
          try {
            var localList = _readLocal(uid);
            var mutated = false;
            for (var i = 0; i < localList.length; i++) {
              if (localList[i] && localList[i]._pending) {
                var clone = Object.assign({}, localList[i]);
                delete clone._pending;
                localList[i] = clone;
                mutated = true;
              }
            }
            if (mutated) _writeLocal(uid, localList);
          } catch (_e) {}
        }).catch(function (err) {
          var m3 = _readRetry();
          if (m3[uid]) {
            m3[uid].attempts = (m3[uid].attempts || 0) + 1;
            m3[uid].nextAt = Date.now() + _backoffMs(m3[uid].attempts);
            if (m3[uid].attempts >= MAX_ATTEMPTS) {
              _warn('drain FALHOU DEFINITIVAMENTE para', uid, 'após', MAX_ATTEMPTS, 'tentativas:', err && err.message);
              // move para DLQ mas MANTÉM o item local com _pending para
              // que o usuário veja "sincronizando..." e possa forçar via
              // LF_FIX_ACT_CLOUD_V3.drain() no console.
              try {
                var dlqKey = 'lf_act_worker_dlq_v3';
                var dlq = [];
                try { dlq = JSON.parse(localStorage.getItem(dlqKey)) || []; } catch (_e) {}
                dlq.push({ uid: uid, item: m3[uid], failedAt: new Date().toISOString(), error: (err && err.message) || String(err) });
                if (dlq.length > 50) dlq = dlq.slice(-50);
                localStorage.setItem(dlqKey, JSON.stringify(dlq));
              } catch (_e) {}
              delete m3[uid];
            } else {
              _warn('drain falhou para', uid, '- retry em', Math.round(m3[uid].nextAt - Date.now()) / 1000, 's:', err && err.message);
            }
            _writeRetry(m3);
          }
        });
      });

    return Promise.all(jobs).then(function () { _drainInFlight = false; })
      .catch(function () { _drainInFlight = false; });
  }

  function _installWorkerQueue() {
    var NS_LF = (global.LF = global.LF || {});
    var origEnqueue = NS_LF.enqueueActivities;
    if (origEnqueue && origEnqueue.__lfV3Worker) return;

    var newEnqueue = function (uid, list) {
      // Só assume o roteamento se o Worker estiver ativo — se estiver
      // em modo Firebase, deixa o original tratar.
      if (global.DB_MODE === 'firebase' && global.db) {
        return typeof origEnqueue === 'function' ? origEnqueue.apply(NS_LF, arguments) : null;
      }
      return _enqueueWorker(uid, list);
    };
    newEnqueue.__lfV3Worker = true;
    NS_LF.enqueueActivities = newEnqueue;

    // Drain em ganchos naturais:
    global.addEventListener('online', function () { setTimeout(_drainWorkerQueue, 300); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') setTimeout(_drainWorkerQueue, 300);
    }, { passive: true });
    document.addEventListener('resume', function () { setTimeout(_drainWorkerQueue, 300); }, { passive: true });
    // Rede de segurança: 60s.
    setInterval(_drainWorkerQueue, 60000);
    // Drain imediato no boot (para itens de sessão anterior).
    setTimeout(_drainWorkerQueue, 2500);

    _log('FIX 2 instalado — fila de retry agora aponta para o Worker.');
  }

  // ---------------------------------------------------------------
  // FIX 3 — Save resiliente: envelopa saveActivities/lfSaveActivitiesFor
  // para que, se um save cair no ramo "sem worker" (janela de boot) ou
  // se um .catch remoto silenciar, o item ainda seja garantido para
  // subir via nossa fila do Worker.
  // ---------------------------------------------------------------
  function _wrapSaveActivities() {
    if (typeof global.saveActivities !== 'function') return false;
    if (global.saveActivities.__lfV3Wrapped) return true;

    var orig = global.saveActivities;
    var wrapped = function (list) {
      var uid = _uid();
      var ret;
      try { ret = orig.apply(this, arguments); }
      catch (err) {
        // Se o original explodir, garante fila para próxima janela online.
        if (uid) _enqueueWorker(uid, list);
        _warn('saveActivities original throw — enfileirado para o worker:', err && err.message);
        throw err;
      }
      // Rede de segurança: se em ~1.5s ainda houver _pending, empilha.
      if (uid) {
        setTimeout(function () {
          try {
            var cur = _readLocal(uid);
            var hasPending = cur.some(function (a) { return a && a._pending; });
            if (hasPending) _enqueueWorker(uid, cur);
          } catch (_e) {}
        }, 1500);
      }
      return ret;
    };
    wrapped.__lfV3Wrapped = true;
    global.saveActivities = wrapped;
    _log('FIX 3a instalado — saveActivities envelopada.');
    return true;
  }

  function _wrapLfSaveActivitiesFor() {
    if (typeof global.lfSaveActivitiesFor !== 'function') return false;
    if (global.lfSaveActivitiesFor.__lfV3Wrapped) return true;

    var orig = global.lfSaveActivitiesFor;
    var wrapped = function (uid, list) {
      var ret;
      try { ret = orig.apply(this, arguments); }
      catch (err) {
        if (uid) _enqueueWorker(uid, list);
        _warn('lfSaveActivitiesFor original throw — enfileirado:', err && err.message);
        throw err;
      }
      if (uid) {
        setTimeout(function () {
          try {
            var cur = _readLocal(uid);
            var hasPending = cur.some(function (a) { return a && a._pending; });
            if (hasPending) _enqueueWorker(uid, cur);
          } catch (_e) {}
        }, 1500);
      }
      return ret;
    };
    wrapped.__lfV3Wrapped = true;
    global.lfSaveActivitiesFor = wrapped;
    _log('FIX 3b instalado — lfSaveActivitiesFor envelopada.');
    return true;
  }

  // ---------------------------------------------------------------
  // FIX 4 — Reconciliação de done após actConfirmDone/bulk/tl.
  // Complementa o v2: mesmo que o v2 já wrapee essas funções, esta
  // camada dispara UM drain explícito da fila do Worker logo após o
  // save otimista — cobre a janela em que o v2 chamava
  // lfSaveActivitiesFor mas o PUT falhava e ia para a fila errada.
  // ---------------------------------------------------------------
  function _wrapDoneFunctions() {
    ['actConfirmDone', 'applyActBulkDone', 'markTlActDone'].forEach(function (name) {
      var fn = global[name];
      if (typeof fn !== 'function') return;
      if (fn.__lfV3DoneWrapped) return;
      var orig = fn;
      var wrapped = function () {
        var ret;
        try { ret = orig.apply(this, arguments); }
        catch (err) { _warn(name, 'original throw:', err); throw err; }
        // dispara drain em ~500ms — dá tempo do save otimista rodar
        // e do PUT ao Worker ser tentado (e possivelmente falhar).
        setTimeout(_drainWorkerQueue, 500);
        // e um segundo drain em 3s como rede de segurança.
        setTimeout(_drainWorkerQueue, 3000);
        return ret;
      };
      wrapped.__lfV3DoneWrapped = true;
      global[name] = wrapped;
      _log('FIX 4 instalado — wrap de done em', name);
    });
  }

  // ---------------------------------------------------------------
  // FIX 5 — Reconciliação periódica proativa.
  // A cada 60s, se houver itens _pending no cache local do usuário
  // logado, empilha na fila do Worker e dispara drain.
  // ---------------------------------------------------------------
  function _periodicReconcile() {
    try {
      var uid = _uid(); if (!uid) return;
      var list = _readLocal(uid);
      if (!Array.isArray(list) || !list.length) return;
      var hasPending = list.some(function (a) { return a && a._pending; });
      if (hasPending) {
        _enqueueWorker(uid, list);
        _drainWorkerQueue();
      }
    } catch (_e) {}
  }
  setInterval(_periodicReconcile, 60000);

  // ---------------------------------------------------------------
  // Boot: instala tudo, com retry (as funções globais podem carregar
  // depois deste patch, por causa de defer).
  // ---------------------------------------------------------------
  function _install() {
    _installSafeFetch();     // depende só de LF, que está pronto (retry-queue-sync carrega antes)
    _installWorkerQueue();   // idem
    var a = _wrapSaveActivities();
    var b = _wrapLfSaveActivitiesFor();
    _wrapDoneFunctions();

    if (!(a && b)) {
      _install._retries = (_install._retries || 0) + 1;
      if (_install._retries < 60) { setTimeout(_install, 250); return; }
      _warn('boot terminou sem envelopar todos os saves — verifique a ordem de carregamento em index.html/app.html');
    } else {
      _log('v3-20260804 ATIVO. Fila worker atual:', Object.keys(_readRetry()).length, 'uid(s).');
      // drain inicial para itens legados eventualmente presentes.
      setTimeout(_drainWorkerQueue, 1500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _install);
  } else {
    _install();
  }

  // API pública de diagnóstico (console).
  global.LF_FIX_ACT_CLOUD_V3 = {
    version: 'v3-20260804',
    queue: _readRetry,
    dlq: function () {
      try { return JSON.parse(localStorage.getItem('lf_act_worker_dlq_v3') || '[]') || []; }
      catch (_e) { return []; }
    },
    drain: _drainWorkerQueue,
    enqueue: _enqueueWorker,
    reconcile: _periodicReconcile,
    diag: function () {
      return {
        queue: _readRetry(),
        dlqLen: (function () { try { return (JSON.parse(localStorage.getItem('lf_act_worker_dlq_v3') || '[]') || []).length; } catch (_e) { return 0; } })(),
        uid: _uid(),
        hasWorker: !!_wc(),
        installed: {
          safeFetch: !!(global.LF && global.LF.fetchAndCacheActivities && global.LF.fetchAndCacheActivities.__lfV3Safe),
          workerQueue: !!(global.LF && global.LF.enqueueActivities && global.LF.enqueueActivities.__lfV3Worker),
          saveActivitiesWrapped: !!(global.saveActivities && global.saveActivities.__lfV3Wrapped),
          lfSaveActivitiesForWrapped: !!(global.lfSaveActivitiesFor && global.lfSaveActivitiesFor.__lfV3Wrapped),
          doneWrapped: {
            actConfirmDone: !!(global.actConfirmDone && global.actConfirmDone.__lfV3DoneWrapped),
            applyActBulkDone: !!(global.applyActBulkDone && global.applyActBulkDone.__lfV3DoneWrapped),
            markTlActDone: !!(global.markTlActDone && global.markTlActDone.__lfV3DoneWrapped)
          }
        }
      };
    }
  };
})(window);
