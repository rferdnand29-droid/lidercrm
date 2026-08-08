/* =====================================================================
 * src/modules/agenda/runtime/ligacoes-store.js
 * -----------------------------------------------------------------------
 * Extraído nesta rodada (7) de js/agenda.js (bloco "LIGAÇÕES COUNTER").
 * Mesmo padrão já usado em activities-store.js: chave de storage + leitura +
 * gravação (local + sync remoto), sem nenhuma leitura/escrita de DOM.
 *
 * CORREÇÃO (2026-08-04, "métricas somem após atualizações" — ver
 * RELATORIO-FIX-LIGACOES-SOMATORIA-RACE-20260804.md):
 * Duas causas raiz combinadas apagavam o acumulado do dia (a
 * "Somatória Hoje" do painel ADM) mesmo com o servidor corrigido:
 *
 *   1) Esta função só mandava `{ list }` pro backend — sem `total`/
 *      `rounds`. Quando essa gravação "incompleta" corria concorrente
 *      com o push do patch de cloud-sync (que manda total/rounds) e
 *      chegava DEPOIS no servidor, o total acumulado regredia pra
 *      list.length (0..10, só a rodada atual).
 *   2) Cada clique disparava um POST/PUT solto, sem fila — várias
 *      gravações do MESMO uid+data podiam correr em paralelo e
 *      terminar fora de ordem, então "quem responde por último"
 *      decidia o estado final, não "quem foi clicado por último".
 *
 * Fix (mesmo espírito do padrão já usado em activities-store.js:
 * serializar por chave + nunca perder uma escrita otimista):
 *   A) saveLigToday agora sempre inclui o total/rounds acumulados
 *      atuais (lidos de LiderCRM.ligCounterRounds quando o patch de
 *      rounds já estiver instalado) no payload — nunca manda mais um
 *      PUT "incompleto" que possa fazer o servidor recalcular
 *      total=list.length.
 *   B) As gravações remotas do mesmo uid+data são SERIALIZADAS (fila
 *      por chave) — nunca duas em voo ao mesmo tempo — e cada job da
 *      fila relê o total/rounds mais recentes no momento de rodar,
 *      não um valor "congelado" de quando foi enfileirado.
 * O servidor (ligacoes-controller.js) também foi corrigido para nunca
 * regredir total/rounds — isto aqui reduz a frequência da corrida na
 * origem e cobre clientes que ainda não atualizaram o JS.
 * ===================================================================== */
(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var agenda = modules.agenda = modules.agenda || {};

  function ligKey(uid){ return 'lf13_lig_' + (uid || global.S.userId) + '_' + global.today(); }
  function getLigToday(uid){ return global.sg(ligKey(uid)) || []; }

  // ---------- (A) leitura do acumulado atual (total/rounds) ----------
  // Lido diretamente do localStorage (mesmas chaves que
  // lf-lig-counter-rounds-v1-20260728.js usa) em vez de depender da
  // API pública do patch, pra funcionar mesmo se este módulo carregar
  // antes dele. Se as chaves ainda não existirem (patch não rodou
  // nesta sessão / primeira ligação do dia), cai em list.length/0 —
  // idêntico ao fallback que o servidor já aplica.
  function _totalKey(uid, date){ return 'lf13_lig_total_' + (uid || '') + '_' + (date || global.today()); }
  function _roundsKey(uid, date){ return 'lf13_lig_rounds_' + (uid || '') + '_' + (date || global.today()); }
  function _accumulatedTotal(uid, date, fallbackListLen){
    var v = global.sg(_totalKey(uid, date));
    var n = (typeof v === 'number') ? v : parseInt(v, 10);
    return (Number.isFinite(n) && n >= 0) ? Math.max(n, fallbackListLen) : fallbackListLen;
  }
  function _accumulatedRounds(uid, date){
    var v = global.sg(_roundsKey(uid, date));
    var n = (typeof v === 'number') ? v : parseInt(v, 10);
    return (Number.isFinite(n) && n >= 0) ? n : 0;
  }

  // ---------- (B) fila de gravação serial por uid+data ----------
  // Mesmo padrão de _enqueueSave em activities-store.js: garante que
  // duas chamadas a saveLigToday para o MESMO uid+data nunca disparem
  // requisições concorrentes que possam terminar fora de ordem.
  var _saveQueues = Object.create(null); // "uid|data" -> Promise em cadeia
  function _enqueueSave(qkey, job){
    var prev = _saveQueues[qkey] || Promise.resolve();
    var next = prev.then(function(){
      try { return job(); } catch(e){ return Promise.reject(e); }
    }, function(){
      try { return job(); } catch(e){ return Promise.reject(e); }
    });
    _saveQueues[qkey] = next.then(function(){}, function(){});
    return next;
  }

  function saveLigToday(list, uid){
    var k = ligKey(uid);
    global.ss(k, list);
    var finalUid = uid || global.S.userId;
    var today = global.today();
    var wc = root && root.api && root.api.workerClient;
    var useWorker = root && root.config && root.config.useWorkerApi && wc &&
      (typeof wc.saveLigacoesListFull === 'function' || typeof wc.saveLigacoesList === 'function');

    if (useWorker) {
      global.syncBusy();
      var qkey = finalUid + '|' + today;
      return _enqueueSave(qkey, function(){
        // Relê o total/rounds NO MOMENTO da gravação real (podem ter
        // avançado enquanto este job esperava na fila) e SEMPRE manda
        // um payload completo — nunca um PUT "incompleto" que deixe o
        // servidor recalcular total como list.length.
        var freshList = (typeof list !== 'undefined') ? list : getLigToday(finalUid);
        var total = _accumulatedTotal(finalUid, today, (freshList || []).length);
        var rounds = _accumulatedRounds(finalUid, today);
        var savePromise = (typeof wc.saveLigacoesListFull === 'function')
          ? wc.saveLigacoesListFull(finalUid, today, { list: freshList, total: total, rounds: rounds })
          : wc.saveLigacoesList(finalUid, today, freshList);
        return savePromise.then(global.syncOk).catch(global.syncErr);
      });
    } else if (global.DB_MODE === 'firebase' && global.db) {
      global.syncBusy();
      var total2 = _accumulatedTotal(finalUid, today, (list || []).length);
      var rounds2 = _accumulatedRounds(finalUid, today);
      return global.db.collection('ligacoes').doc(finalUid + '_' + today)
        .set({ list:list, total:total2, rounds:rounds2, uid:finalUid, date:today, ts:Date.now() })
        .then(global.syncOk).catch(global.syncErr);
    }
  }

  agenda.runtime = agenda.runtime || {};
  agenda.runtime.ligKey = ligKey;
  agenda.runtime.getLigToday = getLigToday;
  agenda.runtime.saveLigToday = saveLigToday;
  /* R14-10b: expor funções ao escopo global */
  global.ligKey = ligKey;
  global.getLigToday = getLigToday;
  global.saveLigToday = saveLigToday;

})(window);
