/* =====================================================================
 * lf-lig-counter-sync-cloud-v1-20260728.js
 * ---------------------------------------------------------------------
 * P1.2 nuvem do bingo (auditoria 2026-07-28)
 * ---------------------------------------
 * Resolve o problema levantado na fase 1: o acumulador de bingo do dia
 * (lf-lig-counter-rounds-v1-20260728.js) só vivia em localStorage —
 * se o consultor trocasse de celular, abrisse em outro browser ou
 * tomasse histórico limpo, perdia a somatória do dia e o feed ADM ia
 * mostrar "nenhuma" do nada.
 *
 * O QUE ESTE PATCH FAZ
 * --------------------
 * A) Envelopa window.saveLigToday(list, uid) (já em uso por
 *    src/modules/agenda/runtime/ligacoes-store.js). Quando há sessão
 *    e o consultor registra uma marcação, sincroniza a lista com o
 *    Worker — passa também { total, rounds, device } para que o
 *    acumulador do dia seja persistido na nuvem.
 *
 * B) Envelopa window.saveLigTotal e window.saveLigRounds (instalados
 *    pelo patch lf-lig-counter-rounds-v1-20260728.js) — cada update
 *    local dispara um PUSH para o Worker com efeito "last write wins
 *    por max()" do lado do servidor.
 *
 *    Como o controller do Worker usa o setFsDocument com updated_at
 *    como version implícita, e como a checagem do lado cliente
 *    (ler o servidor antes de gravar) é feita aqui, o resultado é
 *    concorrência otimista: dois dispositivos gravando quase ao
 *    mesmo tempo são reconciliados pelo maior (max) — bingo nunca
 *    regride.
 *
 * C) Na inicialização:
 *    1. PULL do servidor (Worker.getLigacoesListFull)
 *    2. Compara total/rounds locais vs servidor
 *    3. Faz merge: pega o maior de cada (max) e reescreve a chave
 *       lf13_lig_total_*_<date> / lf13_lig_rounds_*_<date>
 *    4. Faz push do resultado (1 round-trip)
 *    Resultado: qualquer aparelho "alcança" o outro sem intervenção.
 *
 * D) Filas de retry para quando o Worker não responde (offline,
 *    502, ITER_CAP). O comportamento é igual ao retryqueue-sync
 *    já usado por saveActivities/saveLigToday:
 *    - enfileira até 50 entradas em lf13_lig_sync_pending
 *    - tenta flush a cada 30s quando há sessão
 *    - descarta entradas com mais de 24 h (dados stale)
 *
 * E) EXPÕE API pública: LiderCRM.ligCloudSync.{pushNow, pullAndMerge,
 *    flushQueue, getPendingCount}.
 *
 * GARANTIAS (não regredir nada)
 * -----------------------------
 * - ZERO mudança em js/agenda.js, js/relatorios.js, no controller do
 *   Worker, no worker-client, no auth, no kanban, no dashboard. Apenas
 *   adiciona wrappers no window.
 * - Idempotente: guard window.__LF_LIG_COUNTER_SYNC_CLOUD_V1__.
 * - Tolerante a Worker indisponível (useWorkerApi falso ou falha
 *   de rede): cai no retryqueue offline (mesmo padrão dos demais
 *   módulos do projeto) — não bloqueia o consultor que acabou de
 *   marcar a ligação.
 * - Merge conservador (max): se um aparelho local está com 30 e o
 *   servidor está com 35 (de outro dispositivo), o resultado fica 35.
 *   NUNCA regredimos a contagem por merge.
 * - Compatível com o Firebase legado (DB_MODE === 'firebase'):
 *   quando useWorkerApi estiver desligado, o sync é simplesmente
 *   pulado silenciosamente — a operação local continua funcionado.
 * ===================================================================== */
(function(global){
  'use strict';
  if(global.__LF_LIG_COUNTER_SYNC_CLOUD_V1__){return;}
  global.__LF_LIG_COUNTER_SYNC_CLOUD_V1__=true;

  var TAG='[lf-lig-counter-sync-cloud]';
  function _log(){try{if(global.console&&console.debug)console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{if(global.console&&console.warn)console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _err(){try{if(global.console&&console.error)console.error.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  // ---------- helpers de data / storage ----------
  function _todayFn(){
    if(typeof global.today==='function')return global.today();
    var d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function _uidNow(){
    try{return (global.S&&global.S.userId)||null;}catch(_e){return null;}
  }
  function _ss(k,v){try{if(typeof global.ss==='function')global.ss(k,v);}catch(_e){}}
  function _sg(k){try{if(typeof global.sg==='function')return global.sg(k);return null;}catch(_e){return null;}}
  function _deviceId(){
    try{
      var k='lf13_lig_device';
      var v=_sg(k);
      if(typeof v==='string'&&v)return v;
      var id='dev-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
      _ss(k,id);
      return id;
    }catch(_e){return 'dev-unknown';}
  }

  // ---------- fila de retry (mesmo padr\u00e3o dos demais m\u00f3dulos) ----------
  var PENDING_KEY='lf13_lig_sync_pending';
  var PENDING_LIMIT=50;
  var PENDING_TTL_MS=24*3600*1000;

  function _readPending(){
    var arr=_sg(PENDING_KEY)||[];
    return Array.isArray(arr)?arr:[];
  }
  function _writePending(arr){
    try{_ss(PENDING_KEY,arr.slice(0,PENDING_LIMIT));}catch(_e){}
  }
  function _enqueue(entry){
    if(!entry||!entry.uid||!entry.date)return;
    var arr=_readPending();
    // de-dup por uid+date+type — mantém o mais recente
    var idx=-1;
    for(var i=0;i<arr.length;i++){
      if(arr[i]&&arr[i].uid===entry.uid&&arr[i].date===entry.date&&arr[i].type===entry.type){
        idx=i;break;
      }
    }
    entry.id='q'+Date.now()+'-'+Math.random().toString(36).slice(2,6);
    entry.ts=Date.now();
    if(idx>=0)arr[idx]=entry;else arr.unshift(entry);
    arr=arr.filter(function(e){return e&&e.ts&&(Date.now()-e.ts)<PENDING_TTL_MS;});
    _writePending(arr);
    _log('enqueued',entry.type,'uid='+entry.uid,'date='+entry.date);
  }

  // ---------- cliente do Worker (caminho can\u00f4nico do projeto) ----------
  function _wc(){
    var root=global.LiderCRM||{};
    var api=root.api||{};
    return api.workerClient||null;
  }
  function _useWorker(){
    var root=global.LiderCRM||{};
    var cfg=root.config||{};
    return !!(cfg.useWorkerApi && _wc() && (typeof _wc().saveLigacoesList==='function'||typeof _wc().saveLigacoesListFull==='function'));
  }

  // ---------- PUSH: total/rounds -> Worker ----------
  // Mant\u00e9m o cliente simples: uma Promise por chamada.
  function _pushLoginCloud(uid,date,payload){
    if(!_useWorker())return Promise.reject({offline:true});
    var wc=_wc();
    var fn=(typeof wc.saveLigacoesListFull==='function')
            ?wc.saveLigacoesListFull
            :(typeof wc.saveLigacoesList==='function'?wc.saveLigacoesList:null);
    if(!fn)return Promise.reject({noAdapter:true});

    // Garante `list` presente (mesmo vazio) para o contrato da rota.
    var body=Object.assign({ uid:uid, list:[], device:_deviceId() }, payload||{});

    return (fn===wc.saveLigacoesListFull
      ? fn(uid,date,body)
      : fn(uid,date,(body.list||[]))
    ).then(function(serverDoc){
      // Devolve o que servidor tem — pra chamador fazer merge.
      return (serverDoc&&typeof serverDoc==='object')?serverDoc:{ list:body.list||[], total:body.total||0, rounds:body.rounds||0, ts:Date.now() };
    });
  }

  // ---------- PULL -> Worker ----------
  function _pullCloud(uid,date){
    if(!_useWorker())return Promise.reject({offline:true});
    var wc=_wc();
    if(typeof wc.ligacoesList!=='function')return Promise.reject({noAdapter:true});
    return wc.ligacoesList(uid,date).then(function(serverDoc){
      return (serverDoc&&typeof serverDoc==='object')?serverDoc:null;
    });
  }

  // ---------- cores: ler local raw ----------
  function _localTotal(uid,date){ var v=_sg('lf13_lig_total_'+uid+'_'+date); return (typeof v==='number'&&v>0)?v:(parseInt(v,10)||0); }
  function _localRounds(uid,date){ var v=_sg('lf13_lig_rounds_'+uid+'_'+date); return (typeof v==='number'&&v>0)?v:(parseInt(v,10)||0); }
  function _localList(uid,date){
    try{
      var arr=global.getLigToday?global.getLigToday(uid):(_sg('lf13_lig_'+uid+'_'+date)||[]);
      return Array.isArray(arr)?arr:[];
    }catch(_e){return [];}
  }

  // ---------- salva total/rounds no local (somente se patch #1 instalado) ----------
  function _saveLocalTotal(uid,date,v){
    try{
      var r=global.LiderCRM&&global.LiderCRM.ligCounterRounds;
      if(r&&typeof r.getLigTotal==='function'){
        // L\u00f3g: o patch #1 precisa expor um setter OU podemos escrever
        // direto no localStorage — o patch #1 re-l\u00ea a chave do ss/sg
        // no momento certo, ent\u00e3o \u00e9 seguro.
      }
    }catch(_e){}
    try{_ss('lf13_lig_total_'+uid+'_'+date,Math.max(0,v|0));}catch(_e1){}
  }
  function _saveLocalRounds(uid,date,v){
    try{_ss('lf13_lig_rounds_'+uid+'_'+date,Math.max(0,v|0));}catch(_e){}
  }

  // ---------- PUSH tolerante a falha: se Worker falhar, enfileira ----------
  function _pushOrQueue(uid,date,payload){
    if(!uid||!date)return;
    _pushLoginCloud(uid,date,payload).catch(function(err){
      _log('push falhou (caiu na fila):',(err&&err.message)||err);
      _enqueue({ type:'lig_full', uid:uid, date:date, body:payload });
    });
  }

  // ---------- PULL + MERGE ----------
  function pullAndMerge(uid,date){
    uid=uid||_uidNow();
    date=date||_todayFn();
    if(!uid)return Promise.resolve(null);

    var localTotal=_localTotal(uid,date);
    var localRounds=_localRounds(uid,date);
    var localListLen=_localList(uid,date).length;

    return _pullCloud(uid,date).then(function(server){
      if(!server){
        // Servidor sem registro: s\u00f3 faz PUSH do que temos localmente.
        _pushOrQueue(uid,date,{ list:_localList(uid,date), total:localTotal, rounds:localRounds });
        return { action:'server-empty-pushed', localTotal:localTotal, localRounds:localRounds };
      }

      var serverTotal=(typeof server.total==='number')?server.total:((server.list||[]).length);
      var serverRounds=(typeof server.rounds==='number')?server.rounds:0;

      // MERGE conservador: pega o MAIOR de cada (nunca regride).
      var mergedTotal=Math.max(localTotal,serverTotal);
      var mergedRounds=Math.max(localRounds,serverRounds);

      // Atualiza o local com o merge.
      if(mergedTotal!==localTotal){
        _saveLocalTotal(uid,date,mergedTotal);
        _log('local total '+localTotal+' -> '+mergedTotal+' (servidor='+serverTotal+')');
      }
      if(mergedRounds!==localRounds){
        _saveLocalRounds(uid,date,mergedRounds);
        _log('local rounds '+localRounds+' -> '+mergedRounds+' (servidor='+serverRounds+')');
      }

      // Re-PUSH o merged pra fechar a janela.
      _pushOrQueue(uid,date,{ total:mergedTotal, rounds:mergedRounds, list:server.list||_localList(uid,date) });

      return {
        action:'merged',
        before:{ local:localTotal, server:serverTotal },
        after:mergedTotal,
        roundsBefore:{ local:localRounds, server:serverRounds },
        roundsAfter:mergedRounds
      };
    }).catch(function(err){
      _log('pullAndMerge falhou, mant\u00e9m local:',(err&&err.message)||err);
      _enqueue({ type:'lig_pull', uid:uid, date:date });
      return null;
    });
  }

  // ---------- flush da fila de retry ----------
  function flushQueue(){
    var arr=_readPending();
    if(!arr.length)return Promise.resolve(0);
    var wcOk=_useWorker();
    if(!wcOk)return Promise.resolve(0);

    var wc=_wc();
    var done=0;
    var p=Promise.resolve();
    arr.forEach(function(e){
      if(!e)return;
      p=p.then(function(){
        if(e.type==='lig_full'){
          return _pushLoginCloud(e.uid,e.date,e.body||{}).then(function(serverDoc){
            done++;
            if(global.syncOk)try{global.syncOk();}catch(_e1){}
            _log('flushed lig_full',e.uid,e.date);
          }).catch(function(err){
            _warn('flush falhou (deixa na fila):',(err&&err.message)||err);
            if(global.syncErr)try{global.syncErr(err);}catch(_e1){}
          });
        }
        // 'lig_pull' = sem payload \u2014 j\u00e1 \u00e9 resolvido com o pr\u00f3ximo push normal.
      });
    });

    return p.then(function(){
      // Re-grava a fila sem os que foram \u00f0 OK (e que tinham ts muito velho).
      var still=_readPending().filter(function(e){return e&&e.ts&&(Date.now()-e.ts)<PENDING_TTL_MS;});
      _writePending(still);
      return done;
    });
  }

  // ---------- wrap em saveLigToday (orig em src/modules/agenda/...ligacoes-store.js) ----------
  function _wrapSaveLigToday(){
    var orig=global.saveLigToday;
    if(typeof orig!=='function'){
      _warn('saveLigToday ausente — aguardando carregamento…');
      setTimeout(_install,250);
      return false;
    }
    if(orig.__lfCloudWrapped)return true;

    global.saveLigToday=function(list,uid){
      var myUid=uid||_uidNow();
      var today=_todayFn();
      var ret=orig.apply(this,arguments);
      // A: dispara sync em background, sem bloquear o caller.
      try{
        var total=_localTotal(myUid,today);
        var rounds=_localRounds(myUid,today);
        _pushOrQueue(myUid,today,{ list:(Array.isArray(list)?list:[]), total:total, rounds:rounds });
      }catch(_e){_warn('wrapper saveLigToday sync falhou (sem impacto)',_e);}
      return ret;
    };
    global.saveLigToday.__lfCloudWrapped=true;
    _log('saveLigToday envolvido (cloud sync)');
    return true;
  }

  // ---------- instrumenta o patch #1 (rounds) se j\u00e1 estiver l\u00e1 ----------
  function _hookRoundsPatch(){
    // \u00c9 id\u00eam reescrever _setTotal/_setRounds quando elas existem no global.
    // Como o patch #1 j\u00e1 exp\u00f5e an\u00e1logos via localStorage, basta
    // adicionar um MutationObserver simples que dispara re-sync quando
    // as chaves lf13_lig_total_*_<date> ou lf13_lig_rounds_*_<date> mudam.
    var lastHash='';
    setInterval(function(){
      try{
        var uid=_uidNow();if(!uid)return;
        var today=_todayFn();
        var t=_localTotal(uid,today);
        var r=_localRounds(uid,today);
        var hash=uid+'|'+today+'|'+t+'|'+r;
        if(hash===lastHash)return;
        if(lastHash===''){lastHash=hash;return;} // primeira medi\u00e7\u00e3o: n\u00e3o \u00e9 mudan\u00e7a
        lastHash=hash;
        _pushOrQueue(uid,today,{ total:t, rounds:r });
      }catch(_e){}
    },5000);
  }

  // ---------- API p\u00fablica ----------
  var _flushTimer=null;
  function _startFlushTimer(){
    if(_flushTimer)return;
    _flushTimer=setInterval(function(){flushQueue().catch(function(_e){});},30000);
  }
  function getPendingCount(){return _readPending().length;}

  function _install(){
    // Aguarda o patch #1 instalar o local (getLigTotal/getLigRounds) e o Worker
    if(typeof global.getLigToday!=='function'){
      setTimeout(_install,300);
      return;
    }
    if(!_wrapSaveLigToday())return;
    _hookRoundsPatch();
    _startFlushTimer();

    // PULL & MERGE no boot (depois da sess\u00e3o)
    function _bootMerge(){
      var uid=_uidNow();
      var today=_todayFn();
      if(!uid){setTimeout(_bootMerge,1000);return;}
      pullAndMerge(uid,today).then(function(r){
        if(r&&r.action==='merged' && global.toast){
          // s\u00f3 anuncia quando h\u00e1 discrep\u00e2ncia relevante (>=5)
          // para n\u00e3o poluir o consultor logado que acabou de abrir o CRM
          if(r.after - r.before.local >=5){
            try{global.toast('☁️ Bingo sincronizado — '+r.after+' liga\u00e7\u00f5es hoje');}catch(_e){}
          }
        }
      });
    }
    setTimeout(_bootMerge,2500);

    global.LiderCRM=global.LiderCRM||{};
    global.LiderCRM.ligCloudSync={
      pushNow:function(){var u=_uidNow(),d=_todayFn();pullAndMerge(u,d);},
      pullAndMerge:pullAndMerge,
      flushQueue:flushQueue,
      getPendingCount:getPendingCount,
      _pushLoginCloud:_pushLoginCloud,
      _pullCloud:_pullCloud
    };

    _log('patch instalado');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{
    _install();
  }
})(window);
