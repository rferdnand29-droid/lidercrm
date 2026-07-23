(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var agenda = modules.agenda = modules.agenda || {};

  // Camada de apresentação das "atividades vinculadas" a um card (lead/negócio).
  // Extraída de js/agenda.js na rodada 2026-07-17 (parte 2). Depende de globais
  // já carregados antes deste arquivo: ACT_TYPES, eH, S, _jsSq, _formatScheduledAt,
  // _isScheduledExpired (js/utils.js) e getActivitiesLocalFor (activities-store.js).

  function _linkedActsForCard(board,cardId,ownerUid){
    if(!cardId)return [];
    var uid=ownerUid||global.S.userId;
    return global.getActivitiesLocalFor(uid).filter(function(a){
      if(a.clientId!==cardId)return false;
      if(board&&a.board&&a.board!==board)return false;
      return true;
    });
  }

  function _linkedActsSortOpen(a,b){
    var aa=a.scheduledAt||a.createdAt||'';
    var bb=b.scheduledAt||b.createdAt||'';
    return aa.localeCompare(bb);
  }

  function _linkedActsSortDone(a,b){
    var aa=a.doneAt||a.createdAt||'';
    var bb=b.doneAt||b.createdAt||'';
    return bb.localeCompare(aa);
  }

  function _linkedActCardHTML(a,done,opts){
    var meta=global.ACT_TYPES[a.type]||{ic:'📋',lbl:a.type||'Atividade'};
    var when='';
    if(done){
      when=a.doneAt?('Concluída em '+new Date(a.doneAt).toLocaleString('pt-BR')):(a.createdAt?new Date(a.createdAt).toLocaleString('pt-BR'):'');
    }else{
      when=a.scheduledAt?('Agendado: '+global._formatScheduledAt(a.scheduledAt)):(a.createdAt?new Date(a.createdAt).toLocaleString('pt-BR'):'Sem data');
    }
    var late=(!done&&a.scheduledAt&&global._isScheduledExpired(a.scheduledAt))?'<span style="color:var(--rl);font-size:.63rem;font-weight:700">Atrasada</span>':'';
    var actions='';
    if(opts&&opts.canEdit&&!done){
      actions='<div class="qa-act-actions" style="display:flex;gap:6px;margin-top:8px">'
        +'<button class="bc" type="button" style="padding:6px 10px;font-size:.68rem;min-height:auto;width:auto" onclick="openLinkedActivityEditor(\''+global._jsSq(a.id)+'\',\''+global._jsSq(opts.ownerUid||global.S.userId)+'\',\''+global._jsSq(opts.board||'')+'\',\''+global._jsSq(opts.cardId||'')+'\')">✏️ Editar atividade</button>'
        +'</div>';
    }
    return '<div class="qa-act-card'+(done?' done':'')+'">'
      +'<div class="qa-act-card-top"><span class="qa-act-ic">'+meta.ic+'</span><span class="qa-act-type">'+global.eH(meta.lbl||'Atividade')+'</span>'+late+'</div>'
      +'<div class="qa-act-desc">'+global.eH(a.desc||'')+'</div>'
      +'<div class="qa-act-date">'+global.eH(when)+'</div>'
      +actions
      +'</div>';
  }

  function _linkedActsSummaryHTML(board,cardId,ownerUid,canEdit){
    var acts=_linkedActsForCard(board,cardId,ownerUid);
    var openActs=acts.filter(function(a){return !a.done;}).sort(_linkedActsSortOpen);
    var doneActs=acts.filter(function(a){return !!a.done;}).sort(_linkedActsSortDone);
    var html='';
    html+='<div class="qa-act-group"><div class="qa-act-group-title">Atividade atual</div>';
    if(openActs.length){
      html+=_linkedActCardHTML(openActs[0],false,{canEdit:!!canEdit,ownerUid:ownerUid,board:board,cardId:cardId});
      if(openActs.length>1){
        html+='<div class="qa-act-more">+'+(openActs.length-1)+' lembrete(s) pendente(s)</div>';
      }
    }else{
      html+='<div class="qa-act-empty">Nenhuma atividade atual.</div>';
    }
    html+='</div>';
    html+='<div class="qa-act-group" style="margin-top:10px"><div class="qa-act-group-title">Anteriores feitas</div>';
    if(doneActs.length){
      html+=doneActs.slice(0,4).map(function(a){return _linkedActCardHTML(a,true,{canEdit:false,ownerUid:ownerUid,board:board,cardId:cardId});}).join('');
      if(doneActs.length>4){
        html+='<div class="qa-act-more">+'+(doneActs.length-4)+' concluída(s) anterior(es)</div>';
      }
    }else{
      html+='<div class="qa-act-empty">Nenhuma atividade concluída ainda.</div>';
    }
    html+='</div>';
    return html;
  }

  agenda.runtime = agenda.runtime || {};
  agenda.runtime._linkedActsForCard = _linkedActsForCard;
  agenda.runtime._linkedActsSortOpen = _linkedActsSortOpen;
  agenda.runtime._linkedActsSortDone = _linkedActsSortDone;
  agenda.runtime._linkedActCardHTML = _linkedActCardHTML;
  agenda.runtime._linkedActsSummaryHTML = _linkedActsSummaryHTML;
  /* R14-11b: expor funções ao escopo global */
  global._linkedActsForCard = _linkedActsForCard;
  global._linkedActsSortOpen = _linkedActsSortOpen;
  global._linkedActsSortDone = _linkedActsSortDone;
  global._linkedActCardHTML = _linkedActCardHTML;
  global._linkedActsSummaryHTML = _linkedActsSummaryHTML;

})(window);
