/* lf-fix-activity-done-real-v2-20260804
 * =====================================================================
 * CORREÇÃO DEFINITIVA — atividades marcadas como "concluída" que
 * (a) não aparecem no histórico do lead ("Anteriores feitas") e
 * (b) somem/voltam para "atividade atual" após reload.
 *
 * CAUSA RAIZ (após rastreamento no código real, ago/2026):
 *   O patch anterior (lf-fix-activity-done-persist-v1-20260803.js)
 *   tentava wrappar funções que NÃO EXISTEM no projeto
 *   (completeActivity, markActivityDone, encerrarAtividade, ...).
 *   A função real é actConfirmDone (js/agenda.js:395) e o bulk
 *   applyActBulkDone (js/agenda.js:683). Como nenhum wrapper era
 *   instalado, nada acontecia.
 *
 *   Além disso, o CRM guarda atividades como UM documento por
 *   consultor (atividades/list/<uid>), não dentro do doc do lead —
 *   e a view "Atividade atual / Anteriores feitas" do lead
 *   (_linkedActsSummaryHTML) filtra getActivitiesLocalFor(ownerUid)
 *   pelo clientId. Isso combinado com 3 bugs finos causava o sintoma:
 *
 *   BUG A — actConfirmDone escreve na chave errada quando o
 *           usuário logado é ADM/gerente e visualiza a agenda de
 *           OUTRO consultor: se isSelf===true (porque ownerId caiu
 *           para S.userId no default), a lista salva vai para
 *           lf13_acts_<S.userId>, mas a view do lead lê
 *           lf13_acts_<ownerUidDoCard>.
 *
 *   BUG B — refreshLinkedActivitySummaries() só re-renderiza se
 *           _kbDetBoard && _kbDetId estiverem setados. Se o usuário
 *           marcou "feita" pelo painel do sino (ou por notificação),
 *           esses globais estão vazios e o lead nunca é redesenhado.
 *
 *   BUG C — Se o PUT /atividades/list falha em silêncio, o item
 *           fica com _pending:true no cache. No próximo fetch do
 *           servidor, um cache stale sobrescreve o item e o "done"
 *           some. Precisamos garantir retry + reconciliação.
 *
 * O QUE ESTE PATCH FAZ (envelopa as funções que REALMENTE existem):
 *   1. wrappa actConfirmDone (self + assignedToOther), applyActBulkDone
 *      e markTlActDone: garante que o done é gravado na chave do
 *      OWNER do card (não do usuário logado), e sempre via
 *      lfSaveActivitiesFor(ownerUid, list) — que já serializa e faz
 *      merge por id (activities-store.js:273).
 *   2. Após save bem sucedido, força re-render em qualquer view
 *      aberta (painel de atividades, modal kanban, detalhe kanban,
 *      timeline do cliente), independente de _kbDetBoard/_kbDetId.
 *   3. Mantém uma fila local de retry (localStorage) para itens
 *      cujo PUT falhou; drena em visibilitychange/online.
 *   4. NÃO cria activityHistory dentro do doc do lead (isso não
 *      existe no modelo deste CRM) — a "história" do lead é a
 *      própria lista de atividades filtrada por clientId.
 *
 * COMPATIBILIDADE
 *   - Substitui e desativa o patch antigo v1 (que era no-op na prática).
 *   - Compatível com Capacitor (só usa localStorage + Worker/Firestore).
 *   - Compatível com Cloudflare Worker (usa root.api.workerClient).
 * =====================================================================
 */
(function(global){
  'use strict';
  if(global.__LF_FIX_ACTIVITY_DONE_REAL_V2__)return;
  global.__LF_FIX_ACTIVITY_DONE_REAL_V2__=true;

  /* desativa explicitamente o patch antigo (evita wrappers duplos
     em globals que porventura tenham sido criados por bibliotecas
     de terceiros carregadas depois) */
  global.__LF_FIX_ACTIVITY_DONE_PERSIST_V1__=true;

  var TAG='[lf-fix-act-done-real]';
  var PENDING_KEY='lf_act_done_retry_v2';
  var MAX_ATTEMPTS=6;

  function _log(){try{if(global.console&&console.debug)console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{if(global.console&&console.warn)console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _S(){ return global.S || null; }
  function _uid(){ var s=_S(); return (s && s.userId) || null; }

  function _wc(){
    var root=global.LiderCRM;
    return (root && root.api && root.api.workerClient) || global.workerClient || null;
  }

  /* helpers para acessar os stores reais das atividades */
  function _getForUid(uid){
    if(typeof global.getActivitiesLocalFor==='function') return global.getActivitiesLocalFor(uid)||[];
    try{ return JSON.parse(localStorage.getItem('lf13_acts_'+uid)||'[]')||[]; }catch(_e){ return []; }
  }
  function _saveFor(uid, list){
    if(typeof global.lfSaveActivitiesFor==='function') return global.lfSaveActivitiesFor(uid, list);
    /* fallback: grava só local — activities-store não carregado */
    try{ localStorage.setItem('lf13_acts_'+uid, JSON.stringify(list||[])); }catch(_e){}
    return false;
  }

  /* ---------------- Retry queue (BUG C) ---------------- */
  function _q(){ try{ return JSON.parse(localStorage.getItem(PENDING_KEY)||'{}')||{}; }catch(_e){ return {}; } }
  function _qw(m){ try{ localStorage.setItem(PENDING_KEY, JSON.stringify(m||{})); }catch(_e){} }
  function _qAdd(actId, ownerUid){
    var m=_q();
    m[actId]={ actId:actId, ownerUid:ownerUid, doneAt:new Date().toISOString(), attempts:(m[actId]&&m[actId].attempts||0) };
    _qw(m);
  }
  function _qRemove(actId){ var m=_q(); delete m[actId]; _qw(m); }
  function _qBump(actId){
    var m=_q();
    if(m[actId]){ m[actId].attempts=(m[actId].attempts||0)+1; _qw(m); return m[actId].attempts; }
    return 0;
  }

  /* ---------------- FIX 20260804b: retry com backoff antes de desistir ----------------
     A função original (actConfirmDone/applyActBulkDone/markTlActDone) pode ainda
     estar esperando o fetch de _loadActivitiesForOwner (rede) quando tentamos
     confirmar o "done". Em vez de checar uma única vez aos 30ms e já jogar pra
     fila de retry silenciosa, tentamos várias vezes com backoff curto — cobre
     o caso comum (rede um pouco lenta) sem depender de o usuário trocar de
     aba/app pra disparar o _flush(). Só cai na fila de retry (que meche em
     visibilitychange/resume/online) se TODAS as tentativas falharem. */
  var RETRY_DELAYS_MS = [150, 350, 700, 1200, 2000, 3000];
  function _persistDoneWithRetry(actId, ownerUid, extra, attempt){
    attempt = attempt || 0;
    var list = _getForUid(ownerUid);
    var already = list.some(function(x){ return x && x.id===actId && x.done===true; });
    if(already){
      /* já está marcado done localmente — persiste (grava e sincroniza) normalmente */
      _persistDone(actId, ownerUid, extra);
      return;
    }
    if(attempt < RETRY_DELAYS_MS.length){
      setTimeout(function(){
        _persistDoneWithRetry(actId, ownerUid, extra, attempt+1);
      }, RETRY_DELAYS_MS[attempt]);
      return;
    }
    /* esgotou as tentativas rápidas — segue o fluxo antigo (enfileira e
       tenta de novo via _flush) */
    _persistDone(actId, ownerUid, extra);
  }

  /* ---------------- núcleo: persistir "done" ---------------- */
  /* Grava done=true na lista do OWNER correto (BUG A) e chama
     lfSaveActivitiesFor(ownerUid, list) — que já:
       - faz MERGE por id (não sobrescreve pendentes),
       - SERIALIZA (mutex por uid),
       - dá PUT /atividades/list com o uid certo,
       - retry via LF.enqueueActivities em caso de erro.
     Depois, força re-render de TODAS as views abertas (BUG B). */
  function _persistDone(actId, ownerUid, extra){
    if(!actId) return Promise.resolve(false);
    ownerUid = ownerUid || _uid();
    if(!ownerUid){ _qAdd(actId, null); return Promise.resolve(false); }

    var list = _getForUid(ownerUid).slice();
    var found = false;
    var doneAt = new Date().toISOString();
    for(var i=0;i<list.length;i++){
      if(list[i] && list[i].id===actId){
        list[i] = Object.assign({}, list[i], {
          done:true,
          doneAt: list[i].doneAt || doneAt,
          _lfDonePersistedBy: _uid()
        });
        found = true;
        break;
      }
    }
    if(!found){
      /* item ainda não sincronizou na lista local do owner —
         enfileira e sai. O drain vai tentar de novo quando a
         lista chegar (visibilitychange/online). */
      _qAdd(actId, ownerUid);
      _warn('atividade não encontrada na lista do owner, na fila:', actId, ownerUid);
      _reRenderAll(ownerUid, extra);
      return Promise.resolve(false);
    }

    /* propaga também no espelho legado card.activities do kanban
       (mesma lógica já presente no actConfirmDone original), pra
       que _kbHasOverdueLinkedActivity enxergue done sem reload */
    try{
      var a = list[i];
      if(a && a.clientId && a.board && typeof global.getKBFor==='function' && typeof global.saveKBFor==='function'){
        var arr = global.getKBFor(a.board, ownerUid) || [];
        var card = arr.find(function(x){ return String(x.id)===String(a.clientId); });
        if(card && Array.isArray(card.activities)){
          var legacy = card.activities.find(function(x){ return String(x.id)===String(a.id); });
          if(legacy && !legacy.done){
            legacy.done = true; legacy.doneAt = a.doneAt;
            global.saveKBFor(a.board, ownerUid, arr);
          }
        }
      }
    }catch(_e){}

    /* dispara o save (fila serial + PUT remoto). lfSaveActivitiesFor
       retorna Promise só quando há worker/firebase; senão retorna
       true/false e o retry é feito pelo LF/SyncManager. */
    var ret;
    try{ ret = _saveFor(ownerUid, list); }
    catch(err){ _warn('save throw:', err); _qAdd(actId, ownerUid); _reRenderAll(ownerUid, extra); return Promise.resolve(false); }

    var isPromise = ret && typeof ret.then==='function';
    if(!isPromise){
      /* só local (sem worker/firebase): considera sucesso local,
         mas guarda na fila pra tentar o PUT depois. */
      if(!_wc() && !(global.DB_MODE==='firebase' && global.db)){
        _qAdd(actId, ownerUid);
      }
      _reRenderAll(ownerUid, extra);
      _log('done persistido (local):', actId, ownerUid);
      return Promise.resolve(true);
    }

    return ret.then(function(ok){
      if(ok!==false){
        _qRemove(actId);
        _log('done persistido no servidor:', actId, ownerUid);
      }else{
        var n = _qBump(actId);
        _warn('PUT /atividades/list falhou, tentativa', n, 'para', actId);
        if(n<MAX_ATTEMPTS){
          setTimeout(function(){ _persistDone(actId, ownerUid, extra); }, [500,1500,4000,10000,20000,45000][Math.min(n-1,5)]);
        }
      }
      _reRenderAll(ownerUid, extra);
      return ok!==false;
    }).catch(function(err){
      _warn('save rejeitado:', err);
      _qAdd(actId, ownerUid);
      _reRenderAll(ownerUid, extra);
      return false;
    });
  }

  /* ---------------- BUG B: forçar re-render em qualquer view ---------------- */
  function _reRenderAll(ownerUid, extra){
    /* 1) painel do sino (agenda geral) */
    try{ if(typeof global.renderActPanel==='function') global.renderActPanel(); }catch(_e){}
    try{ if(typeof global.updateActBadge==='function') global.updateActBadge(); }catch(_e){}

    /* 2) card kanban aberto — usa refreshLinkedActivitySummaries
          se _kbDetBoard/_kbDetId existem, senão tenta os renders
          diretos que sabem o cardId a partir do item */
    try{ if(typeof global.refreshLinkedActivitySummaries==='function') global.refreshLinkedActivitySummaries(); }catch(_e){}

    /* 3) fallback: se sabemos o cardId/board pelo próprio item,
          chama _linkedActsSummaryHTML direto no DOM do lead visível. */
    try{
      var board = (extra && extra.board) || null;
      var cardId = (extra && extra.cardId) || null;
      if(board && cardId && typeof global._linkedActsSummaryHTML==='function'){
        /* re-desenha o resumo do card ativo mesmo sem _kbDetBoard */
        var el1 = document.getElementById('qa-activity-summary');
        var el2 = document.getElementById('det-activity-summary');
        var el3 = document.getElementById('kb-edit-activity-summary');
        var html = global._linkedActsSummaryHTML(board, cardId, ownerUid, false);
        if(el1) el1.innerHTML = html;
        if(el2) el2.innerHTML = html;
        if(el3) el3.innerHTML = html;
      }
    }catch(_e){}

    /* 4) timeline do cliente (renderTlActivities) — se aberta */
    try{
      if(typeof global.renderTlActivities==='function' && global._tlCid && typeof global.getCliLocal==='function'){
        var u = ownerUid || (global._tlOwnerUid || _uid());
        var arr = global.getCliLocal(u) || [];
        var c = arr.find(function(x){ return x.id===global._tlCid; });
        if(c) global.renderTlActivities(c);
      }
    }catch(_e){}

    /* 5) render kanban local (etiquetas de "tem atividade aberta") */
    try{ if(typeof global.renderKBLocal==='function' && global._kbDetBoard) global.renderKBLocal(global._kbDetBoard); }catch(_e){}
  }

  /* ---------------- wrappers das funções REAIS ---------------- */
  function _wrapActConfirmDone(){
    if(typeof global.actConfirmDone!=='function'){ return false; }
    if(global.actConfirmDone.__lfV2Wrapped) return true;
    var orig = global.actConfirmDone;
    var wrapped = function(id, ownerId){
      /* determina o owner correto ANTES de chamar o original
         (BUG A: o default do original é S.userId, o que joga o
         save na chave errada quando o card é de outro consultor). */
      var resolvedOwner = ownerId ||
        (global._kbDetOwnerUid) ||
        (global._actEditOwnerUid) ||
        (global._tlOwnerUid) ||
        null;
      /* tenta descobrir pelo próprio item na _actPanelLastList */
      if(!resolvedOwner){
        try{
          var lastList = global._actPanelLastList || [];
          var it = lastList.find(function(x){ return x && x.id===id; });
          if(it) resolvedOwner = it._ownerId || it.userId || null;
        }catch(_e){}
      }
      if(!resolvedOwner) resolvedOwner = _uid();

      var ctx = { board:null, cardId:null };
      try{
        var srcList = _getForUid(resolvedOwner);
        var srcAct = srcList.find(function(x){ return x && x.id===id; });
        if(srcAct){ ctx.board = srcAct.board || null; ctx.cardId = srcAct.clientId || null; }
      }catch(_e){}

      /* deixa o fluxo original rodar (marca a.done=true localmente,
         faz saveActivities/lfSaveActivitiesFor, renderActPanel...) */
      var ret;
      try{ ret = orig.call(this, id, resolvedOwner); }
      catch(err){ _warn('orig actConfirmDone throw:', err); throw err; }

      /* logo depois, RE-persistimos com o ownerUid CORRETO, cobrindo
         o cenário em que o original caiu para S.userId. lfSaveActivitiesFor
         faz merge por id, então re-gravar é idempotente.
         FIX 20260804b: actConfirmDone original é ASSÍNCRONO quando o owner
         não é o próprio usuário (_loadActivitiesForOwner faz fetch de rede
         via wc.atividadesList ANTES de marcar done=true e salvar). 30ms fixos
         não bastam pra essa ida-e-volta em rede móvel — o _persistDone rodava
         cedo demais, não achava o item concluído e caía direto na fila de
         retry, que só é drenada em visibilitychange/resume/online. Agora
         tentamos várias vezes com backoff antes de desistir e enfileirar. */
      _persistDoneWithRetry(id, resolvedOwner, ctx);
      return ret;
    };
    wrapped.__lfV2Wrapped = true;
    global.actConfirmDone = wrapped;
    _log('wrapper instalado em actConfirmDone');
    return true;
  }

  function _wrapApplyActBulkDone(){
    if(typeof global.applyActBulkDone!=='function') return false;
    if(global.applyActBulkDone.__lfV2Wrapped) return true;
    var orig = global.applyActBulkDone;
    var wrapped = function(){
      var selected = (global._actBulkSel||[]).slice();
      var ret;
      try{ ret = orig.apply(this, arguments); }
      catch(err){ _warn('orig applyActBulkDone throw:', err); throw err; }
      /* re-persiste cada item na chave do próprio owner (com retry — mesmo
         motivo do FIX 20260804b acima) */
      selected.forEach(function(id){
        try{
          /* descobre o owner pelo item na lista global mesclada */
          var owner = _uid();
          var ctx = { board:null, cardId:null };
          var lastList = global._actPanelLastList || [];
          var it = lastList.find(function(x){ return x && x.id===id; });
          if(it){
            owner = it._ownerId || it.userId || owner;
            ctx.board = it.board || null;
            ctx.cardId = it.clientId || null;
          }
          _persistDoneWithRetry(id, owner, ctx);
        }catch(_e){}
      });
      return ret;
    };
    wrapped.__lfV2Wrapped = true;
    global.applyActBulkDone = wrapped;
    _log('wrapper instalado em applyActBulkDone');
    return true;
  }

  function _wrapMarkTlActDone(){
    if(typeof global.markTlActDone!=='function') return false;
    if(global.markTlActDone.__lfV2Wrapped) return true;
    var orig = global.markTlActDone;
    var wrapped = function(cid, actId){
      var ret;
      try{ ret = orig.apply(this, arguments); }
      catch(err){ _warn('orig markTlActDone throw:', err); throw err; }
      var owner = (global._tlOwnerUid || _uid());
      _persistDoneWithRetry(actId, owner, { board:null, cardId:cid });
      return ret;
    };
    wrapped.__lfV2Wrapped = true;
    global.markTlActDone = wrapped;
    _log('wrapper instalado em markTlActDone');
    return true;
  }

  /* ---------------- drain da fila de retry ---------------- */
  function _flush(){
    var m = _q(); var ids = Object.keys(m);
    if(!ids.length) return;
    _log('drenando fila:', ids.length, 'itens');
    ids.forEach(function(actId){
      var info = m[actId];
      _persistDone(actId, info.ownerUid, {});
    });
  }

  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState==='visible') _flush();
  }, { passive:true });
  document.addEventListener('resume', _flush, { passive:true });
  global.addEventListener('online', _flush);
  /* FIX 20260804b: rede de segurança — antes só drenava em troca de aba/app
     ou reconexão; se o usuário ficasse minutos na mesma tela, item preso na
     fila nunca sincronizava sozinho. */
  setInterval(_flush, 60000);

  /* ---------------- instalação com retry (o script pode carregar
       antes das funções globais estarem prontas) ---------------- */
  function _install(){
    var a = _wrapActConfirmDone();
    var b = _wrapApplyActBulkDone();
    var c = _wrapMarkTlActDone();
    if(!(a||b||c)){
      _install._retries = (_install._retries||0)+1;
      if(_install._retries<40){ setTimeout(_install, 250); return; }
      _warn('nenhuma função de conclusão encontrada após 40 tentativas — verifique se agenda.js foi carregado');
      return;
    }
    /* mesmo com só uma wrapped, continua tentando os demais por mais 20 ciclos */
    if(!(a && b && c)){
      _install._retries = (_install._retries||0)+1;
      if(_install._retries<40) setTimeout(_install, 250);
    }
    _flush();
    _log('v2-20260804 ativo:', { retryQueue:Object.keys(_q()).length });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', _install);
  }else{
    _install();
  }

  /* API de diagnóstico manual (console) */
  global.LF_FIX_ACT_DONE_V2 = {
    version:'v2-20260804',
    queue:_q,
    flush:_flush,
    forceDone:function(actId, ownerUid, board, cardId){
      return _persistDone(actId, ownerUid, { board:board, cardId:cardId });
    },
    diag:function(){
      return {
        queue:_q(),
        wrapped:{
          actConfirmDone: !!(global.actConfirmDone && global.actConfirmDone.__lfV2Wrapped),
          applyActBulkDone: !!(global.applyActBulkDone && global.applyActBulkDone.__lfV2Wrapped),
          markTlActDone: !!(global.markTlActDone && global.markTlActDone.__lfV2Wrapped)
        },
        hasWorker: !!_wc(),
        uid: _uid()
      };
    }
  };
})(window);
