/* =====================================================================
 * src/modules/agenda/runtime/ligacoes-store.js
 * -----------------------------------------------------------------------
 * Extraído nesta rodada (7) de js/agenda.js (bloco "LIGAÇÕES COUNTER").
 * Mesmo padrão já usado em activities-store.js: chave de storage + leitura +
 * gravação (local + sync remoto), sem nenhuma leitura/escrita de DOM.
 * Comportamento idêntico ao original — só mudou o arquivo onde mora.
 * ===================================================================== */
(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var agenda = modules.agenda = modules.agenda || {};

  function ligKey(uid){ return 'lf13_lig_' + (uid || global.S.userId) + '_' + global.today(); }
  function getLigToday(uid){ return global.sg(ligKey(uid)) || []; }
  function saveLigToday(list, uid){
    var k = ligKey(uid);
    global.ss(k, list);
    var finalUid = uid || global.S.userId;
    var wc = root && root.api && root.api.workerClient;
    var useWorker = root && root.config && root.config.useWorkerApi && wc && typeof wc.saveLigacoesList === 'function';
    if (useWorker) {
      global.syncBusy();
      wc.saveLigacoesList(finalUid, global.today(), list).then(global.syncOk).catch(global.syncErr);
    } else if (global.DB_MODE === 'firebase' && global.db) {
      global.syncBusy();
      global.db.collection('ligacoes').doc(finalUid + '_' + global.today())
        .set({ list:list, uid:finalUid, date:global.today(), ts:Date.now() })
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
