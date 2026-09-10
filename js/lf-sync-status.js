/* =====================================================================
 * js/lf-sync-status.js
 * -----------------------------------------------------------------------
 * Melhoria de arquitetura (2026-09-18, item 4 do plano de estabilidade
 * — "consolidar os 4 mecanismos de sincronização"). Consolidar por
 * REESCRITA foi decidido como arriscado demais numa sessão só (cada um
 * dos 4 já foi ajustado várias vezes pra corrigir bugs sutis — ver
 * docs/architecture.md, seção "Sincronização de dados"). Este arquivo
 * é o primeiro passo seguro: dá VISIBILIDADE unificada aos 4 mecanismos
 * SEM mudar o comportamento de nenhum deles — é só observação.
 *
 * Os 4 mecanismos observados:
 *   1. Sondagem periódica (15s)      — js/kanban.js, _syncKBRemoteBG
 *   2. BroadcastChannel entre abas   — js/kanban.js + js/app.js
 *   3. Fila de retentativas          — src/core/offline/retry-queue.js
 *   4. Merge com proteção de corrida — kanban-helpers.js, js/utils.js
 *
 * COMO OBSERVA CADA UM (sem alterar nenhum):
 *   1. Encapsula _lfListsEqualById (já chamada pela sondagem a cada
 *      ciclo, pra decidir se algo mudou) — só registra quando foi
 *      chamada e o resultado, sem alterar o que ela retorna.
 *   2. Adiciona um SEGUNDO listener no mesmo BroadcastChannel já usado
 *      pelo Kanban — BroadcastChannel aceita múltiplos listeners no
 *      mesmo nome de canal sem interferir entre si.
 *   3. Só LÊ o tamanho da fila (window.LiderCRM.offline.retryQueue),
 *      que já é pública — nenhuma escrita, nenhum wrap.
 *   4. Só LÊ o registro de "recém-excluído" direto do localStorage.
 *
 * USO: window.lfSyncStatus() no console, ou chamado por uma tela de
 * diagnóstico futura (admin) — retorna um objeto plano, serializável.
 * ===================================================================== */
(function(global){
  'use strict';
  if(global.__LF_SYNC_STATUS_INSTALLED__)return;
  global.__LF_SYNC_STATUS_INSTALLED__=true;

  var _telemetry={
    poll:{lastRunAt:null,lastChanged:null,totalRuns:0,totalChanged:0},
    broadcastChannel:{lastReceivedAt:null,totalReceived:0,available:('BroadcastChannel' in global)}
  };

  // ---- 1. Sondagem periódica — encapsula _lfListsEqualById -----------
  function _wrapListsEqual(){
    if(typeof global._lfListsEqualById!=='function')return false;
    var orig=global._lfListsEqualById;
    if(orig.__lfSyncStatusWrapped)return true;
    var wrapped=function(a,b){
      var result=orig(a,b);
      try{
        _telemetry.poll.lastRunAt=Date.now();
        _telemetry.poll.totalRuns+=1;
        _telemetry.poll.lastChanged=!result;
        if(!result)_telemetry.poll.totalChanged+=1;
      }catch(_e){}
      return result;
    };
    wrapped.__lfSyncStatusWrapped=true;
    global._lfListsEqualById=wrapped;
    return true;
  }
  if(!_wrapListsEqual()){
    // _lfListsEqualById ainda não existe quando este arquivo carrega
    // (depende da ordem de <script>) — tenta de novo depois do boot.
    document.addEventListener('DOMContentLoaded',function(){_wrapListsEqual();},{once:true});
  }

  // ---- 2. BroadcastChannel — segundo listener, sem interferir --------
  try{
    if('BroadcastChannel' in global){
      var _bcObserver=new BroadcastChannel('lf_kb_v1');
      _bcObserver.addEventListener('message',function(){
        _telemetry.broadcastChannel.lastReceivedAt=Date.now();
        _telemetry.broadcastChannel.totalReceived+=1;
      });
    }
  }catch(_e){}

  // ---- Função pública: junta os 4 mecanismos num retrato só ----------
  function lfSyncStatus(){
    var now=Date.now();
    function agoLabel(ts){
      if(!ts)return 'nunca';
      var s=Math.round((now-ts)/1000);
      if(s<60)return s+'s atrás';
      return Math.round(s/60)+'min atrás';
    }

    // 3. Fila de retentativas — só leitura, API já pública.
    var retryQueueLen=null;
    try{
      var rq=global.LiderCRM&&global.LiderCRM.offline&&global.LiderCRM.offline.retryQueue;
      if(rq&&typeof rq.list==='function')retryQueueLen=rq.list().length;
    }catch(_e){}

    // 4. Registro de "recém-excluído" — só leitura direta do storage.
    var recentlyDeletedCount=null;
    try{
      var raw=localStorage.getItem('lf_recently_deleted_ids_v1');
      if(raw)recentlyDeletedCount=Object.keys(JSON.parse(raw)||{}).length;
    }catch(_e){}

    return {
      sondagemPeriodica:{
        ultimaExecucao:agoLabel(_telemetry.poll.lastRunAt),
        ultimaExecucaoTs:_telemetry.poll.lastRunAt,
        detectouMudancaUltimaVez:_telemetry.poll.lastChanged,
        totalExecucoes:_telemetry.poll.totalRuns,
        totalComMudanca:_telemetry.poll.totalChanged
      },
      broadcastChannel:{
        disponivel:_telemetry.broadcastChannel.available,
        ultimaMensagemRecebida:agoLabel(_telemetry.broadcastChannel.lastReceivedAt),
        totalMensagensRecebidas:_telemetry.broadcastChannel.totalReceived
      },
      filaDeRetentativas:{
        itensPendentes:retryQueueLen
      },
      protecaoContraExclusaoFantasma:{
        idsProtegidosAgora:recentlyDeletedCount
      }
    };
  }

  global.lfSyncStatus=lfSyncStatus;
})(window);
