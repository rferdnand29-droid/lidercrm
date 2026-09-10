/* =====================================================================
 * lf-fix-lig-feed-retry-queue-v1-20260820.js
 * ---------------------------------------------------------------------
 * PEDIDO: "garantir que as métricas de ligações e movimentações de cada
 * usuário estão gravadas e salvas, sem dúvida, permanentemente."
 *
 * CAUSA RAIZ ENCONTRADA: `saveLigToday()` (ligações) e `logFeedEvent()`
 * (movimentações/feed) sempre gravam local primeiro (rápido, nunca
 * falha), mas a gravação REMOTA (Worker/Firebase) não tinha nenhuma
 * rede de segurança:
 *   - Se a chamada ao Worker rejeitasse (rede caindo, sessão expirando
 *     no meio, timeout), o erro só ia pro console — nada tentava de
 *     novo depois.
 *   - Se o Worker simplesmente não estivesse pronto ainda no momento da
 *     chamada (ex.: token ainda sincronizando logo após o login), a
 *     gravação remota nem era tentada — silêncio total.
 * Nos dois casos, o dado ficava só no localStorage DAQUELE aparelho —
 * se o cache for limpo, ou a pessoa usar outro dispositivo, o dado
 * remoto nunca existiu de verdade. Isso é exatamente o tipo de bug que
 * o sistema de Atividades já tinha resolvido antes (ver
 * lf-fix-activity-cloud-persist-v3-20260804.js) — este patch aplica a
 * MESMA estratégia, já comprovada, pra Ligações e Feed.
 *
 * ESTRATÉGIA (idêntica à de Atividades):
 *   1) js/patches/... (este arquivo) expõe global._lfEnqueueLigRetry() e
 *      global._lfEnqueueFeedRetry() — funções que os arquivos-fonte
 *      (ligacoes-store.js, feed-runtime.js) já chamam, defensivamente,
 *      sempre que uma gravação remota falha OU nem pode ser tentada.
 *      Isso é o ÚNICO ponto de contato — o resto da lógica de
 *      persistência local/remota nesses dois arquivos não muda em
 *      nada.
 *   2) Cada item enfileirado fica em localStorage
 *      (lf_lig_retry_queue_v1 / lf_feed_retry_queue_v1), com backoff
 *      exponencial (2s → 5min) e um teto de 8 tentativas — depois disso
 *      vai pra uma fila "morta" (DLQ) só de registro, mas o dado
 *      continua local (nunca é apagado).
 *   3) Reenvia sozinho: a cada 60s, quando a internet volta (evento
 *      'online'), quando o app volta a ficar visível, e uma vez no
 *      boot (pra pegar o que ficou pendente de uma sessão anterior).
 *
 * Idempotente: guard global.__lfFixLigFeedRetryQueueV1.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__lfFixLigFeedRetryQueueV1) return;
  global.__lfFixLigFeedRetryQueueV1 = true;

  var TAG = '[lf-lig-feed-retry-v1]';
  var LIG_KEY = 'lf_lig_retry_queue_v1';
  var FEED_KEY = 'lf_feed_retry_queue_v1';
  var LIG_DLQ_KEY = 'lf_lig_retry_dlq_v1';
  var FEED_DLQ_KEY = 'lf_feed_retry_dlq_v1';
  var MAX_ATTEMPTS = 8;

  function _log() { try { if (console && console.debug) console.debug.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
  function _warn() { try { if (console && console.warn) console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }

  function _wc() {
    var root = global.LiderCRM;
    return (root && root.api && root.api.workerClient) || null;
  }

  function _readQ(key) { try { return JSON.parse(localStorage.getItem(key) || '[]') || []; } catch (_e) { return []; } }
  function _writeQ(key, list) { try { localStorage.setItem(key, JSON.stringify(list || [])); } catch (_e) {} }
  function _backoffMs(attempts) { return Math.min(300000, 2000 * Math.pow(2, Math.max(0, attempts - 1))); } // 2s → 5min

  function _pushToDlq(dlqKey, item, err) {
    try {
      var dlq = _readQ(dlqKey);
      dlq.push({ item: item, failedAt: new Date().toISOString(), error: (err && err.message) || String(err) });
      if (dlq.length > 50) dlq = dlq.slice(-50);
      _writeQ(dlqKey, dlq);
    } catch (_e) {}
  }

  // ---------------------------------------------------------------
  // LIGAÇÕES — enfileira {uid, date, list, total, rounds}
  // ---------------------------------------------------------------
  global._lfEnqueueLigRetry = function (uid, date, list, total, rounds) {
    if (!uid || !date) return;
    var q = _readQ(LIG_KEY);
    // Upsert por uid+date — se já tem um item pendente pro mesmo dia,
    // substitui pelo mais recente (não empilha gravações redundantes do
    // mesmo dia; sempre sobe o estado mais atual quando o drain rodar).
    var key = uid + '|' + date;
    var idx = q.findIndex(function (x) { return (x.uid + '|' + x.date) === key; });
    var entry = { uid: uid, date: date, list: list || [], total: total || 0, rounds: rounds || 0, attempts: (idx >= 0 ? q[idx].attempts : 0) || 0, nextAt: 0, ts: Date.now() };
    if (idx >= 0) q[idx] = entry; else q.push(entry);
    _writeQ(LIG_KEY, q);
    _log('ligação enfileirada pra retry:', key);
  };

  var _ligDrainInFlight = false;
  function _drainLigQueue() {
    if (_ligDrainInFlight) return Promise.resolve();
    var wc = _wc();
    if (!wc || (typeof wc.saveLigacoesListFull !== 'function' && typeof wc.saveLigacoesList !== 'function')) return Promise.resolve();
    var q = _readQ(LIG_KEY);
    if (!q.length) return Promise.resolve();
    _ligDrainInFlight = true;
    var now = Date.now();
    var jobs = q.filter(function (item) { return !item.nextAt || now >= item.nextAt; }).map(function (item) {
      var savePromise = (typeof wc.saveLigacoesListFull === 'function')
        ? wc.saveLigacoesListFull(item.uid, item.date, { list: item.list, total: item.total, rounds: item.rounds })
        : wc.saveLigacoesList(item.uid, item.date, item.list);
      return savePromise.then(function () {
        var q2 = _readQ(LIG_KEY);
        q2 = q2.filter(function (x) { return !(x.uid === item.uid && x.date === item.date); });
        _writeQ(LIG_KEY, q2);
        _log('drain OK (ligação):', item.uid, item.date);
      }).catch(function (err) {
        var q3 = _readQ(LIG_KEY);
        var it3 = q3.find(function (x) { return x.uid === item.uid && x.date === item.date; });
        if (it3) {
          it3.attempts = (it3.attempts || 0) + 1;
          it3.nextAt = Date.now() + _backoffMs(it3.attempts);
          if (it3.attempts >= MAX_ATTEMPTS) {
            _warn('ligação falhou definitivamente após', MAX_ATTEMPTS, 'tentativas:', item.uid, item.date, err && err.message);
            _pushToDlq(LIG_DLQ_KEY, it3, err);
            q3 = q3.filter(function (x) { return !(x.uid === item.uid && x.date === item.date); });
          }
          _writeQ(LIG_KEY, q3);
        }
      });
    });
    return Promise.all(jobs).then(function () { _ligDrainInFlight = false; }).catch(function () { _ligDrainInFlight = false; });
  }

  // ---------------------------------------------------------------
  // FEED (movimentações) — enfileira o evento inteiro (já tem id
  // próprio gerado em logFeedEvent, então o Worker trata como insert
  // idempotente — reenviar o mesmo id não duplica).
  // ---------------------------------------------------------------
  global._lfEnqueueFeedRetry = function (entry) {
    if (!entry || !entry.id) return;
    var q = _readQ(FEED_KEY);
    if (q.some(function (x) { return x.id === entry.id; })) return; // já enfileirado
    q.push(Object.assign({ attempts: 0, nextAt: 0 }, entry));
    _writeQ(FEED_KEY, q);
    _log('evento de feed enfileirado pra retry:', entry.id, entry.type);
  };

  var _feedDrainInFlight = false;
  function _drainFeedQueue() {
    if (_feedDrainInFlight) return Promise.resolve();
    var wc = _wc();
    if (!wc || typeof wc.logFeedEventRemote !== 'function') return Promise.resolve();
    var q = _readQ(FEED_KEY);
    if (!q.length) return Promise.resolve();
    _feedDrainInFlight = true;
    var now = Date.now();
    var jobs = q.filter(function (item) { return !item.nextAt || now >= item.nextAt; }).map(function (item) {
      return wc.logFeedEventRemote(item).then(function () {
        var q2 = _readQ(FEED_KEY);
        q2 = q2.filter(function (x) { return x.id !== item.id; });
        _writeQ(FEED_KEY, q2);
        _log('drain OK (feed):', item.id, item.type);
      }).catch(function (err) {
        var q3 = _readQ(FEED_KEY);
        var it3 = q3.find(function (x) { return x.id === item.id; });
        if (it3) {
          it3.attempts = (it3.attempts || 0) + 1;
          it3.nextAt = Date.now() + _backoffMs(it3.attempts);
          if (it3.attempts >= MAX_ATTEMPTS) {
            _warn('evento de feed falhou definitivamente após', MAX_ATTEMPTS, 'tentativas:', item.id, err && err.message);
            _pushToDlq(FEED_DLQ_KEY, it3, err);
            q3 = q3.filter(function (x) { return x.id !== item.id; });
          }
          _writeQ(FEED_KEY, q3);
        }
      });
    });
    return Promise.all(jobs).then(function () { _feedDrainInFlight = false; }).catch(function () { _feedDrainInFlight = false; });
  }

  function _drainAll() {
    try { _drainLigQueue(); } catch (_e) {}
    try { _drainFeedQueue(); } catch (_e) {}
  }

  // Ganchos de reenvio — mesmo padrão já comprovado em
  // lf-fix-activity-cloud-persist-v3-20260804.js.
  global.addEventListener('online', function () { setTimeout(_drainAll, 300); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') setTimeout(_drainAll, 300);
  }, { passive: true });
  document.addEventListener('resume', function () { setTimeout(_drainAll, 300); }, { passive: true });
  setInterval(_drainAll, 60000); // rede de segurança: 60s
  setTimeout(_drainAll, 2500); // drain imediato no boot (itens de sessão anterior)

  _log('instalado — fila de retry pra ligações e movimentações ativa.');
})(window);
