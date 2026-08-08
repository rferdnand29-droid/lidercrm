/* lf-fix-activity-done-persist-v1-20260803 | persiste atividade 'feita' no historico do lead
 *
 * CHANGELOG
 *   v1.2-20260803 — fix: conclusão marcada/persistida como "done" mesmo
 *     quando a função original rejeitava (exceção engolida sem
 *     relançar). Agora só persiste após confirmação de sucesso da
 *     função original. Também corrigida race condition no histórico do
 *     lead (leitura-modificação-escrita não serializada podia perder
 *     entradas quando duas atividades do mesmo lead eram concluídas
 *     quase ao mesmo tempo) — updates agora serializados por leadId.
 */
(function(global){
  'use strict';
  if(global.__LF_FIX_ACTIVITY_DONE_PERSIST_V1__)return;
  global.__LF_FIX_ACTIVITY_DONE_PERSIST_V1__=true;

  var TAG='[lf-fix-activity-done]';
  var PENDING_KEY='lf_activity_pending_v1';
  var DONE_KEY='lf_activity_done_local_v1';

  function _log(){try{if(global.console&&console.debug)console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{if(global.console&&console.warn)console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _uid(){ return (global.S && global.S.userId) || null; }

  function _wc(){
    var root=global.LiderCRM;
    return (root && root.api && root.api.workerClient) || global.workerClient || null;
  }

  function _loadDone(){
    try{ return JSON.parse(localStorage.getItem(DONE_KEY)||'{}')||{}; }catch(_e){ return {}; }
  }
  function _saveDone(map){
    try{ localStorage.setItem(DONE_KEY,JSON.stringify(map||{})); }catch(_e){}
  }
  function _markDoneLocal(actId, leadId, extra){
    if(!actId)return;
    var m=_loadDone();
    m[actId]={
      leadId:leadId||null,
      doneAt:new Date().toISOString(),
      doneBy:_uid(),
      status:'done',
      extra:extra||{}
    };
    _saveDone(m);
    _log('atividade marcada done local:', actId, leadId);
  }

  function _pending(){
    try{ return JSON.parse(localStorage.getItem(PENDING_KEY)||'{}')||{}; }catch(_e){ return {}; }
  }
  function _pendingSet(map){ try{ localStorage.setItem(PENDING_KEY,JSON.stringify(map||{})); }catch(_e){} }
  function _pendingAdd(actId, info){
    var q=_pending();
    q[actId]=info||{ leadId:null, doneAt:new Date().toISOString(), retries:0 };
    _pendingSet(q);
  }
  function _pendingRemove(actId){
    var q=_pending(); delete q[actId]; _pendingSet(q);
  }

  /* FIX v1.2-20260803: _updateLeadHistory faz leitura-modificação-escrita
     do documento inteiro do lead (lê activityHistory, adiciona, regrava
     tudo). Duas conclusões do MESMO lead quase simultâneas podiam ler o
     mesmo estado inicial e a segunda gravação sobrescrevia a primeira —
     uma das duas atividades sumia do histórico (confirmado com teste
     determinístico). _queueLeadHistoryUpdate serializa as atualizações
     por leadId: a próxima só começa a ler depois que a anterior terminou
     de escrever, então sempre lê o estado mais recente. Isso resolve o
     caso mais comum (múltiplas conclusões na mesma aba/sessão); ainda
     depende do backend para o caso de duas abas/dispositivos diferentes
     gravando ao mesmo tempo — sem suporte a escrita condicional
     (compare-and-swap) do lado do worker, não dá para eliminar esse
     caso por completo apenas no cliente. */
  var _leadHistoryQueue={};
  function _queueLeadHistoryUpdate(wc, leadId, actId, doneAt, uid){
    var key=leadId||'__sem_lead__';
    var prev=_leadHistoryQueue[key]||Promise.resolve();
    var next=prev.catch(function(){}).then(function(){
      return _updateLeadHistory(wc, leadId, actId, doneAt, uid);
    });
    _leadHistoryQueue[key]=next;
    return next;
  }

  function _saveActivityDone(actId, leadId, attempt){
    attempt=attempt||1;
    var wc=_wc();
    if(!wc||typeof wc.saveDocument!=='function'){
      _pendingAdd(actId,{ leadId:leadId, doneAt:new Date().toISOString(), retries:0 });
      _warn('sem worker — atividade na fila pendente:', actId);
      return;
    }
    var doneAt=new Date().toISOString();
    var uid=_uid();

    var actPayload={
      id:actId,
      status:'done',
      completedAt:doneAt,
      completedBy:uid,
      doneAt:doneAt
    };

    var actPath='activities/'+actId;

    Promise.resolve()
      .then(function(){
        return wc.saveDocument(actPath, actPayload);
      })
      .then(function(){
        _log('atividade salva no backend:', actId);
        return _queueLeadHistoryUpdate(wc, leadId, actId, doneAt, uid);
      })
      .then(function(){
        _pendingRemove(actId);
        _log('histórico do lead atualizado:', leadId, actId);
        _reRenderLeadActivities(leadId);
      })
      .catch(function(err){
        if(attempt>=4){
          _warn('save de atividade falhou 4x, mantém na fila:', actId, err);
          _pendingAdd(actId,{ leadId:leadId, doneAt:doneAt, retries:attempt });
          return;
        }
        var back=[400,1200,3000,8000][attempt-1]||8000;
        _log('retry save atividade em', back+'ms (tentativa', attempt+1+')');
        setTimeout(function(){ _saveActivityDone(actId, leadId, attempt+1); }, back);
      });
  }

  function _updateLeadHistory(wc, leadId, actId, doneAt, uid){
    if(!leadId){ return Promise.resolve(); }
    var leadPaths=[
      'leads/'+leadId,
      'lead_'+leadId,
      'lead/'+leadId
    ];

    var currentLead=null;
    var usedPath=null;

    function _tryRead(idx){
      if(idx>=leadPaths.length) return Promise.resolve(null);
      usedPath=leadPaths[idx];
      return Promise.resolve()
        .then(function(){
          if(typeof wc.getDocument==='function'){
            return wc.getDocument(usedPath);
          }else if(typeof wc.loadDocument==='function'){
            return wc.loadDocument(usedPath);
          }else if(typeof wc.get==='function'){
            return wc.get(usedPath);
          }
          return null;
        })
        .then(function(doc){
          if(doc) return doc;
          return _tryRead(idx+1);
        })
        .catch(function(){ return _tryRead(idx+1); });
    }

    return _tryRead(0)
      .then(function(doc){
        currentLead=doc||{};
        var history=currentLead.activityHistory || currentLead.activitiesDone || currentLead.completedActivities || [];
        if(!Array.isArray(history)) history=[];

        var exists=history.some(function(h){
          return h && (h.id===actId || h.activityId===actId);
        });
        if(!exists){
          history.push({
            id:actId,
            activityId:actId,
            completedAt:doneAt,
            completedBy:uid,
            status:'done'
          });
        }

        currentLead.activityHistory=history;
        currentLead.activitiesDone=history;
        currentLead.completedActivities=history;

        if(typeof currentLead.activitiesCount==='number'){
          currentLead.activitiesDoneCount=(currentLead.activitiesDoneCount||0)+1;
        }

        return wc.saveDocument(usedPath, currentLead);
      });
  }

  function _reRenderLeadActivities(leadId){
    if(!leadId)return;
    var fns=['renderLeadActivities','_renderLeadActivities',
             'renderActivityHistory','_renderActivityHistory',
             'renderLeadDetail','_renderLeadDetail',
             'loadLeadDetail','_loadLeadDetail',
             'renderLeadActivitiesTab','_renderLeadActivitiesTab',
             'refreshLeadActivities','_refreshLeadActivities',
             'loadActivities','_loadActivities'];
    fns.forEach(function(fn){
      if(typeof global[fn]==='function'){
        try{
          global[fn].call(global, leadId);
          _log('re-render disparado via', fn);
        }catch(err){
          _warn('re-render via', fn, 'falhou', err);
        }
      }
    });
  }

  function _wrapCompleteActivity(){
    var fnNames=['completeActivity','_completeActivity',
                 'markActivityDone','_markActivityDone',
                 'encerrarAtividade','_encerrarAtividade',
                 'finishActivity','_finishActivity',
                 'setActivityDone','_setActivityDone',
                 'closeActivity','_closeActivity',
                 'doneActivity','_doneActivity',
                 'completeTask','_completeTask',
                 'markTaskDone','_markTaskDone',
                 'updateActivityStatus','_updateActivityStatus',
                 'setActivityStatus','_setActivityStatus',
                 /* FIX 2026-08-04: funções reais do build atual */
                 'actConfirmDone','_actConfirmDone',
                 'markTlActDone','_markTlActDone',
                 'applyActBulkDone','_applyActBulkDone'];

    /* FIX 2026-08-04: nomes REAIS do build atual — actConfirmDone/markTlActDone
       (agenda.js) são as funções verdadeiras de conclusão; completeActivity
       agora também existe como alias global (lf-bootstrap-fn-aliases). */
    fnNames.forEach(function(fname){
      if(typeof global[fname]!=='function')return;
      if(global[fname].__lfActDoneWrapped)return;

      var orig=global[fname];
      var wrapped=function(activity, newStatus){
        var actId=null, leadId=null, statusArg=newStatus;
        var extra={};

        if(typeof activity==='string'){
          actId=activity;
        }else if(activity && typeof activity==='object'){
          actId=activity.id || activity.activityId || activity.actId || activity._id || null;
          leadId=activity.leadId || activity.lead_id || activity.lead || null;
          extra=activity;
        }

        if(!leadId && typeof arguments[1]==='string' && arguments[1].indexOf('lead')!==0){
          if(typeof arguments[2]==='string') leadId=arguments[2];
        }else if(!leadId && typeof arguments[1]==='string' && arguments[1].indexOf('lead')===0){
          leadId=arguments[1];
        }

        var st=(typeof statusArg==='string'?statusArg:'').toLowerCase();
        var isDone = st==='done' || st==='feita' || st==='completed' ||
                     st==='concluida' || st==='concluido' || st==='finalizada' ||
                     st==='finished' || st==='closed' || st==='fechada' ||
                     (!statusArg && /^(complete|mark.*done|encerrar|finish|done|close)/i.test(fname));

        if(isDone && actId){
          /* FIX v1.2-20260803: antes, _markDoneLocal + _saveActivityDone
             rodavam incondicionalmente, mesmo se orig.apply lançasse uma
             exceção (capturada só para log, nunca relançada) — ou seja,
             uma conclusão REJEITADA pela regra de negócio original era
             gravada como concluída mesmo assim, local e no backend, sem
             o chamador nunca saber. Agora só persistimos depois que a
             função original confirmar sucesso (retorno síncrono sem
             lançar, ou Promise resolvida); em caso de erro, não
             persistimos e relançamos/propagamos a falha normalmente. */
          _log('atividade sendo concluída (aguardando confirmação da função original):', actId, 'lead:', leadId);

          var ret;
          try{
            ret=orig.apply(this,arguments);
          }catch(err){
            _warn(fname,'original throw — NÃO marcando como concluída:',err);
            throw err;
          }

          function _persistDoneNow(){
            _markDoneLocal(actId, leadId, extra);
            _saveActivityDone(actId, leadId, 1);
            if(leadId){
              setTimeout(function(){ _reRenderLeadActivities(leadId); },100);
            }
          }

          if(ret && typeof ret.then==='function'){
            ret.then(_persistDoneNow).catch(function(err){
              _warn(fname,'original rejeitou — NÃO marcando como concluída:',err);
            });
          }else{
            _persistDoneNow();
          }

          return ret;
        }

        return orig.apply(this,arguments);
      };

      try{
        var keys=Object.keys(orig);
        for(var k=0;k<keys.length;k++){
          if(keys[k].indexOf('__lf')===0) wrapped[keys[k]]=orig[keys[k]];
        }
      }catch(_e){}
      wrapped.__lfActDoneWrapped=true;
      global[fname]=wrapped;
      _log('wrapper instalado em', fname);
    });
  }

  function _wrapRenderHistory(){
    var fns=['renderLeadActivities','_renderLeadActivities',
             'renderActivityHistory','_renderActivityHistory',
             'renderLeadActivitiesTab','_renderLeadActivitiesTab'];

    fns.forEach(function(fname){
      if(typeof global[fname]!=='function')return;
      if(global[fname].__lfActDoneMergeWrapped)return;

      var orig=global[fname];
      var wrapped=function(){
        var ret=orig.apply(this,arguments);
        try{
          var leadId=arguments[0] || (global.S && global.S.currentLeadId) || null;
          if(leadId){
            _mergeLocalDoneIntoHistory(leadId);
          }
        }catch(err){ _warn('merge local done falhou',err); }
        return ret;
      };
      try{
        var keys=Object.keys(orig);
        for(var k=0;k<keys.length;k++){
          if(keys[k].indexOf('__lf')===0) wrapped[keys[k]]=orig[keys[k]];
        }
      }catch(_e){}
      wrapped.__lfActDoneMergeWrapped=true;
      wrapped.__lfActDoneWrapped=true; /* não duplicar com o wrapper de complete */
      global[fname]=wrapped;
      _log('wrapper merge-done instalado em', fname);
    });
  }

  function _mergeLocalDoneIntoHistory(leadId){
    var done=_loadDone();
    var ids=Object.keys(done);
    if(!ids.length)return;

    var containers=document.querySelectorAll(
      '[data-lead-id="'+leadId+'"] .activities-done, '+
      '[data-lead-id="'+leadId+'"] .activity-history, '+
      '[data-lead-id="'+leadId+'"] .completed-activities, '+
      '[data-leadid="'+leadId+'"] .activities-done, '+
      '[data-leadid="'+leadId+'"] .activity-history, '+
      '#lead-'+leadId+' .activities-done, '+
      '#lead-'+leadId+' .activity-history, '+
      '.activities-done-list, .activity-history-list'
    );

    if(!containers.length)return;

    ids.forEach(function(actId){
      var info=done[actId];
      if(info.leadId && info.leadId!==leadId)return;

      var existing=document.querySelector(
        '[data-activity-id="'+actId+'"], [data-actid="'+actId+'"], '+
        '[data-id="'+actId+'"].activity-item, [data-id="'+actId+'"].activity-done'
      );
      if(existing)return; /* já está no DOM */

      containers.forEach(function(container){
        var item=document.createElement('div');
        item.className='activity-item activity-done lf-local-done';
        item.setAttribute('data-activity-id', actId);
        item.setAttribute('data-lf-local', '1');
        item.style.cssText='opacity:0.85;border-left:3px solid #22c55e;padding:6px 10px;margin:4px 0;font-size:13px;';
        var dateStr=new Date(info.doneAt).toLocaleString('pt-BR');
        item.innerHTML='<span style="color:#22c55e;">✓</span> '+
          'Atividade '+actId.substring(0,8)+
          ' — concluída em '+dateStr+
          ' <span style="color:#888;font-size:11px;">(sincronizando…)</span>';
        container.insertBefore(item, container.firstChild);
      });
      _log('atividade done local injetada no histórico:', actId);
    });
  }

  function _flushPending(){
    var q=_pending();
    var ids=Object.keys(q);
    if(!ids.length)return;
    _log('reprocessando', ids.length, 'atividades pendentes');
    ids.forEach(function(actId){
      var info=q[actId];
      _saveActivityDone(actId, info.leadId, 1);
    });
  }

  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible') _flushPending();
  },{passive:true});
  document.addEventListener('resume',_flushPending,{passive:true});
  global.addEventListener('online',_flushPending);

  function _install(){
    _wrapCompleteActivity();
    _wrapRenderHistory();

    var found=false;
    ['completeActivity','_completeActivity','markActivityDone',
     '_markActivityDone','encerrarAtividade','_encerrarAtividade',
     'finishActivity','_finishActivity','setActivityDone',
     '_setActivityDone','closeActivity','_closeActivity',
     'doneActivity','_doneActivity','completeTask','_completeTask',
     'markTaskDone','_markTaskDone','updateActivityStatus',
     '_updateActivityStatus','setActivityStatus','_setActivityStatus']
      .forEach(function(fn){
        if(typeof global[fn]==='function' && global[fn].__lfActDoneWrapped) found=true;
      });

    if(!found){
      _install._retries=(_install._retries||0)+1;
      if(_install._retries<40){ setTimeout(_install,250); return; }
      /* FIX 2026-08-04: com os aliases do bootstrap + nomes reais na lista,
         não chegar aqui é o esperado. Se chegar, loga como debug (não warn)
         para não poluir o console — o listener de pending continua ativo. */
      _log('nenhuma função de completeActivity encontrada após 40 tentativas — listener pending segue ativo');
    }

    _flushPending();
    _log('v1-20260803 ativo:',{pending:Object.keys(_pending()).length,
          localDone:Object.keys(_loadDone()).length});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{
    _install();
  }

  global.LF_FIX_ACTIVITY_DONE = {
    version:'v1.2-20260803',
    pending:_pending,
    localDone:_loadDone,
    markDone:_markDoneLocal,
    flushPending:_flushPending,
    forceSync:function(actId, leadId){ _saveActivityDone(actId, leadId, 1); },
    diag:function(){
      return {
        pending:_pending(),
        localDone:_loadDone(),
        uid:_uid(),
        hasWorker:!!_wc()
      };
    }
  };
})(window);
