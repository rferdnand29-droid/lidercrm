/* =====================================================================
 * lf-fix-supervisor-bingo-aggregate-v1-20260818.js
 * ---------------------------------------------------------------------
 * patch-id: fix-supervisor-bingo-aggregate-v1-20260818
 *
 * CORRIGE: Bingo/tabela de clientes do Dashboard não agrega clientes dos
 * subordinados quando o usuário logado é supervisor/ADM.
 *
 * CAUSA RAIZ:
 *   1) js/dashboard.js:19 — renderDash() chama loadCli(S.userId, ...) que
 *      só retorna a lista da chave lf6_c_<S.userId>, ou seja, apenas os
 *      clientes lançados pelo próprio supervisor. A tabela/bingo NUNCA
 *      contém os clientes dos subordinados. O índice de Negócios já era
 *      montado com getDepartmentVisibleUsers() (o filtro "conhece" os
 *      cartões dos subordinados), mas a lista exibida não os agrega.
 *
 *   2) js/clientes.js — toggleStep(), openDelCli() e confirmDC() usam
 *      getCliLocal(S.userId) hardcoded, o que quebraria a marcação de
 *      bolinhas / exclusão em cliente de subordinado mesmo que a lista
 *      agregada fosse renderizada. As outras operações (setCliStatus,
 *      autoSaveObs, changeResponsible, openTimeline) já usam
 *      _tlOwnerUid || S.userId corretamente.
 *
 * CORREÇÃO (surgical wrapping, sem tocar em js/dashboard.js nem
 * js/clientes.js):
 *   - Wrap renderTable(): quando supervisor, injeta lista agregada.
 *   - Wrap toggleStep(): resolve o dono real do cid antes de salvar.
 *   - Wrap openDelCli()/openTimeline(): define _tlOwnerUid apontando
 *     para o dono real do cid.
 *   - Reimplementa confirmDC(): resolve dono real do _dcId; mantém
 *     compatibilidade com o Bingo (_bingoRecordDismissal) e com o
 *     índice de negócios via getDepartmentVisibleUsers().
 *
 * GARANTIAS:
 *   - Idempotente: guard __LF_SUPERVISOR_BINGO_AGG_V1__ + flags
 *     __lfAggWrapped por função.
 *   - Não regride consultor comum: se _visibleUids() só retorna o
 *     próprio uid (nenhum subordinado), o comportamento é idêntico ao
 *     anterior.
 *   - Cache curto (700ms) para evitar N leituras de localStorage a cada
 *     tecla digitada em onSearch()/setDashTab().
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__lfFixSupervisorBingoAggregateV1) return;
  global.__lfFixSupervisorBingoAggregateV1 = true;
  if(global.__LF_SUPERVISOR_BINGO_AGG_V1__)return;
  // hardened v2 (2026-08-19): renderTable original NUNCA recebe undefined
  var __LF_BINGO_AGG_HARDENED_V2_20260819__=true;
  global.__LF_SUPERVISOR_BINGO_AGG_V1__=true;

  var _aggCache=null;
  function _me(){return (global.S&&global.S.userId)||'';}

  function _visibleUids(){
    var me=_me();var out=[me];
    if(typeof global.getDepartmentVisibleUsers==='function'){
      (global.getDepartmentVisibleUsers(me)||[]).forEach(function(u){
        if(u&&u.id&&out.indexOf(u.id)<0)out.push(u.id);
      });
    }
    return out;
  }

  function _isSupervisor(){
    try{
      if(typeof global.hasAdminAccess==='function'&&global.hasAdminAccess())return true;
      var S=global.S;
      if(S&&(S.nivel==='supervisor'||S.nivel==='admin'||S.papel==='supervisor'||S.papel==='admin'||S.role==='supervisor'||S.role==='admin'))return true;
    }catch(e){}
    return _visibleUids().length>1;
  }

  function _aggregated(){
    var uids=_visibleUids();
    if(uids.length<=1)return global.getCliLocal(uids[0]||'')||[];
    var now=Date.now();
    if(_aggCache&&_aggCache.uid===_me()&&(now-_aggCache.at)<700)return _aggCache.list;
    var out=[];
    uids.forEach(function(uid){
      (global.getCliLocal(uid)||[]).forEach(function(c){
        if(!c)return;
        var copy={};for(var k in c)if(Object.prototype.hasOwnProperty.call(c,k))copy[k]=c[k];
        if(copy.__ownerUid===undefined)copy.__ownerUid=uid;
        out.push(copy);
      });
    });
    _aggCache={uid:_me(),at:now,list:out};
    return out;
  }
  function _bust(){_aggCache=null;}

  // resolve cliente + dono + lista por id (varre todos os visíveis)
  function _find(cid){
    var uids=_visibleUids();
    for(var i=0;i<uids.length;i++){
      var l=global.getCliLocal(uids[i])||[];
      for(var j=0;j<l.length;j++){
        if(l[j]&&l[j].id===cid)return{c:l[j],uid:uids[i],list:l};
      }
    }
    return null;
  }

  function _install(){
    if(!_me()){setTimeout(_install,300);return;}

    if(typeof global.renderTable==='function'&&!global.renderTable.__lfAggWrapped){
      var o=global.renderTable;
      // FIX (lf-fix-renderdash-undefined-v1-20260819): para nao-supervisores o wrapper chamava o
      // renderTable original com `undefined`, e clientes.js:223 fazia
      // `list.filter(...)` -> TypeError no renderDash. Agora o argumento
      // original e sempre repassado; supervisor recebe a lista agregada,
      // e nada nunca chega undefined ao renderTable.
      global.renderTable=function(list){
        // FIX v2 (2026-08-19): defesa-em-profundidade contra list=undefined.
        var _safe=Array.isArray(list)?list:[];
        if(_isSupervisor()){
          var agg=_aggregated();
          return o(Array.isArray(agg)?agg:_safe);
        }
        return o(_safe);
      };
      global.renderTable.__lfAggWrapped=true;
    }

    if(typeof global.toggleStep==='function'&&!global.toggleStep.__lfAggWrapped){
      global.toggleStep=function(cid,idx){
        var f=_find(cid);if(!f)return;
        var c=f.c,uid=f.uid,list=f.list;
        if(!c.steps)c.steps=Array(7).fill(false);
        if(!c.stepDates)c.stepDates=Array(7).fill(null);
        c.steps[idx]=!c.steps[idx];
        c.stepDates[idx]=c.steps[idx]?new Date().toISOString():null;
        c.updatedAt=new Date().toISOString();
        global.saveCli(uid,list);_bust();global.renderDash();
      };
      global.toggleStep.__lfAggWrapped=true;
    }

    if(typeof global.openDelCli==='function'&&!global.openDelCli.__lfAggWrapped){
      var od=global.openDelCli;
      global.openDelCli=function(id){var f=_find(id);if(f)global._tlOwnerUid=f.uid;else delete global._tlOwnerUid;return od(id);};
      global.openDelCli.__lfAggWrapped=true;
    }

    if(typeof global.openTimeline==='function'&&!global.openTimeline.__lfAggWrapped){
      var ot=global.openTimeline;
      global.openTimeline=function(cid){var f=_find(cid);if(f&&!global._tlOwnerUid)global._tlOwnerUid=f.uid;return ot(cid);};
      global.openTimeline.__lfAggWrapped=true;
    }

    // confirmDC: reimplementado com resolução de dono real
    global.confirmDC=function(){
      if(!global._dcId||!global.S||!global.S.userId)return;
      var f=_find(global._dcId);
      var own=f?f.uid:global.S.userId;
      var full=global.getCliLocal(own);
      var _delC=full.find(function(x){return x.id===global._dcId;});
      if(_delC&&(_delC.sourceCardId||_delC.sourceOriginalLeadId)&&typeof global.getKBFor==='function'){
        var _ownerUids=(typeof global.getDepartmentVisibleUsers==='function')
          ?global.getDepartmentVisibleUsers(own).map(function(u){return u.id;})
          :[own];
        if(_ownerUids.indexOf(own)<0)_ownerUids.push(own);
        var _linked=null,_linkedOwner=own;
        for(var i=0;i<_ownerUids.length&&!_linked;i++){
          var _negs=global.getKBFor('negocios',_ownerUids[i])||[];
          var _hit=(_delC.sourceCardId&&_negs.find(function(n){return n&&n.id===_delC.sourceCardId;}))||
                    (_delC.sourceOriginalLeadId&&_negs.find(function(n){return n&&n.originalLeadId===_delC.sourceOriginalLeadId;}))||null;
          if(_hit){_linked=_hit;_linkedOwner=_ownerUids[i];}
        }
        if(typeof global._bingoRecordDismissal==='function'){
          global._bingoRecordDismissal(own,_delC,_linked);
          if(_linked&&_linkedOwner!==own)global._bingoRecordDismissal(_linkedOwner,_delC,_linked);
        }
      }
      var l=full.filter(function(x){return x.id!==global._dcId;});
      if(typeof global._lfMarkRecentlyDeleted==='function')global._lfMarkRecentlyDeleted(global._dcId);
      global.saveCli(own,l);_bust();
      global.closeDC&&global.closeDC();
      global.renderDash();
      global.toast&&global.toast('Removido');
    };
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',_install);
  else _install();
})(window);
