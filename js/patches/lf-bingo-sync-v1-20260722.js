/* =====================================================================
 * lf-bingo-sync-v1-20260722.js
 * ---------------------------------------------------------------------
 * Camada de sincronização Negócios (kanban) → Bingo (Dashboard/Clientes).
 *
 * PROBLEMA QUE RESOLVE
 * --------------------
 * Antes deste patch, os dois mundos eram totalmente separados:
 *   - Negócios vivem em kb_negocios_<uid>       (kanban)
 *   - Bingo   vive  em lf6_c_<uid>              (clientes)
 * A única "automação" existente ao mover card em Negócios era abrir o
 * modal de lembrete (_autoOpenReminderFor em js/notificacoes.js).
 * Nenhum ponto do código criava/atualizava o registro correspondente no
 * Bingo, então:
 *   • ao entrar em AG Vídeo/Presencial, o cliente NÃO aparecia no Bingo
 *   • ao ir para Vídeo/Loja, o Bingo continuava com o cliente em Agendados
 *   • Reagendar/No-Show do kanban não refletia no Bingo
 *
 * O QUE ESTE PATCH FAZ
 * --------------------
 * 1) Instala um hook em _kbMoveCard (js/relatorios.js): sempre que um card
 *    de "negocios" mudar de coluna, sincroniza o Bingo do dono do card.
 * 2) Instala um hook em convertToNeg (js/relatorios.js): quando um Lead
 *    vira Negócio já entrando em agvid/presencial, cria o registro no
 *    Bingo direto (sem precisar mover o card outra vez).
 * 3) Instala um hook em confirmDiscard (js/kanban.js): descartar um card
 *    de Negócios (motivo → col=noshow) manda o registro do Bingo para
 *    STATUS_NOSHOW.
 * 4) Reconciliação no boot: varre uma vez todos os cards de Negócios do
 *    usuário logado e reprocessa o Bingo — garante que cards que já
 *    existiam antes do patch e cards vindos de outro aparelho fiquem em
 *    dia sem depender de eventos futuros.
 * 5) Ajusta o filtro da aba "normal" do Bingo (renderTable em
 *    js/clientes.js) para NÃO listar mais clientes com STATUS_ATENDIDO —
 *    é isso que faz o cliente "sumir de Agendados" ao virar Atendimento
 *    quando o card de Negócios entra em Vídeo/Loja.
 *
 * MAPEAMENTO
 * ----------
 * Coluna do card em Negócios  →  Efeito no registro do Bingo
 *   agvid                        cria/atualiza · status=normal · steps[0]=true
 *   presencial                   cria/atualiza · status=normal · steps[0]=true
 *   vidp        (Video/Loja)     status=STATUS_ATENDIDO
 *   reag        (Reagendar)      status=STATUS_REMARCAR
 *   noshow      (descartado)     status=STATUS_NOSHOW
 * Demais etapas do funil (retag, cart, fich, aprov, fecham, fechado):
 *   não mexem no Bingo — o Bingo é uma trilha operacional (atendimento
 *   presencial/vídeo), não o funil comercial completo. Preserva a lógica
 *   já existente.
 *
 * VÍNCULO NEGÓCIO ↔ CLIENTE DO BINGO
 * ----------------------------------
 * Nunca por nome (colide em homônimos). Chave preferida (na ordem):
 *   1) sourceCardId          (id do card de Negócios)
 *   2) sourceOriginalLeadId  (originalLeadId do Negócio, se vier de Lead)
 *   3) telefone normalizado (só dígitos, >=8)
 *   4) último recurso: nome (case/acento normalizado)
 * Sempre que criar, marcamos sourceBoard='negocios' + sourceCardId +
 * sourceOriginalLeadId + sourceOwnerUid pra facilitar futura reconciliação.
 *
 * NÃO SOBRESCREVE TRABALHO MANUAL
 * -------------------------------
 * - Ao entrar em agvid/presencial: garante steps[0]=true e stepDates[0],
 *   mas nunca zera as outras bolinhas nem observações/histórico.
 * - Ao ir para vidp: só muda status pra atendido (não mexe em steps).
 * - Ao ir para reag/noshow: reaproveita exatamente a mesma lógica que o
 *   próprio Bingo já usa (setCliStatus/confirmNoShow) — inclusive
 *   empilha remarkHistory como faria uma alteração manual.
 *
 * ORDEM DE CARREGAMENTO
 * ---------------------
 * Este arquivo é incluído em index.html e app.html DEPOIS de:
 *   - js/utils.js         (constantes STATUS_*, ETP)
 *   - js/clientes.js      (getCliLocal / saveCli / renderTable)
 *   - js/kanban.js        (KB_NEG_COLS / discardKBFromDet)
 *   - js/relatorios.js    (_kbMoveCard / convertToNeg)
 *   - js/notificacoes.js  (_autoOpenReminderFor)
 * Como todos os hooks são feitos DEPOIS que essas funções globais existem,
 * este patch nunca corre risco de ser silenciosamente ignorado por hoist
 * ou reordenação de scripts.
 * ===================================================================== */
(function(global){
  'use strict';

  var TAG='[lf-bingo-sync]';
  var _installed=false;

  /* ---------- utilidades ---------- */

  function _log(){try{if(global.console&&console.debug)console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{if(global.console&&console.warn)console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _hasDeps(){
    return typeof global.getCliLocal==='function'
        && typeof global.saveCli==='function'
        && typeof global.STATUS_NORMAL!=='undefined'
        && typeof global.STATUS_ATENDIDO!=='undefined'
        && typeof global.STATUS_REMARCAR!=='undefined'
        && typeof global.STATUS_NOSHOW!=='undefined'
        && Array.isArray(global.ETP);
  }

  function _normPhone(t){return String(t||'').replace(/\D/g,'');}
  function _normName(n){
    return String(n||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().trim().replace(/\s+/g,' ');
  }
  function _nowIso(){return new Date().toISOString();}

  /* Localiza o cliente do Bingo correspondente a um card de Negócios,
     na lista do usuário dono. Chave em cascata: sourceCardId →
     sourceOriginalLeadId → telefone → nome (último recurso). */
  function _findCliForCard(list,card){
    if(!list||!list.length||!card)return null;
    var cid=card.id;
    var oid=card.originalLeadId;
    var tel=_normPhone(card.tel);
    var nm =_normName(card.name);
    var hit=null;
    for(var i=0;i<list.length;i++){
      var c=list[i];if(!c)continue;
      if(cid&&c.sourceCardId===cid)return c;
      if(oid&&c.sourceOriginalLeadId===oid){hit=hit||c;}
    }
    if(hit)return hit;
    if(tel&&tel.length>=8){
      for(var j=0;j<list.length;j++){
        var c2=list[j];if(!c2)continue;
        if(_normPhone(c2.tel)===tel)return c2;
      }
    }
    if(nm){
      for(var k=0;k<list.length;k++){
        var c3=list[k];if(!c3)continue;
        if(_normName(c3.nome)===nm)return c3;
      }
    }
    return null;
  }

  function _newCliId(){
    return 'c'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
  }

  function _blankSteps(){return [false,false,false,false,false,false,false];}
  function _blankStepDates(){return [null,null,null,null,null,null,null];}

  /* Garante que um registro de Bingo existe para o card. Se não existir,
     cria com status=normal + steps[0]=true + stepDates[0]=agora, e devolve.
     Se existir, apenas retorna. NÃO mexe em steps existentes aqui — a
     mutação das bolinhas é feita depois, condicionalmente. */
  function _ensureCliForCard(uid,card){
    var list=global.getCliLocal(uid)||[];
    var c=_findCliForCard(list,card);
    var created=false;
    if(!c){
      c={
        id:_newCliId(),
        nome:card.name||'(sem nome)',
        tel:card.tel||'',
        nicho:card.nicho||'',
        steps:_blankSteps(),
        stepDates:_blankStepDates(),
        data:_nowIso(),
        status:global.STATUS_NORMAL,
        statusDates:{},
        obs:'',
        obsHistory:[],
        remarkHistory:[],
        // Metadados de origem (chave forte pra sync futuro):
        sourceBoard:'negocios',
        sourceCardId:card.id||null,
        sourceOriginalLeadId:card.originalLeadId||null,
        sourceOwnerUid:uid
      };
      list.push(c);
      created=true;
    }else{
      // Reforça metadados de origem sem apagar nada que já exista
      if(!c.sourceBoard)c.sourceBoard='negocios';
      if(!c.sourceCardId&&card.id)c.sourceCardId=card.id;
      if(!c.sourceOriginalLeadId&&card.originalLeadId)c.sourceOriginalLeadId=card.originalLeadId;
      if(!c.sourceOwnerUid)c.sourceOwnerUid=uid;
      if(!c.tel&&card.tel)c.tel=card.tel;
      if(!c.nicho&&card.nicho)c.nicho=card.nicho;
    }
    return {list:list,cli:c,created:created};
  }

  /* Marca a bolinha "AG" (steps[0]) se ainda não estiver marcada, sem
     tocar nas demais — o resto continua sendo preenchido manualmente
     pela equipe no Bingo. */
  function _ensureAgStep(c){
    if(!Array.isArray(c.steps)||c.steps.length<7)c.steps=_blankSteps();
    if(!Array.isArray(c.stepDates)||c.stepDates.length<7)c.stepDates=_blankStepDates();
    if(!c.steps[0]){
      c.steps[0]=true;
      c.stepDates[0]=_nowIso();
    }
  }

  /* Aplica o mapeamento de coluna do card → status/etapa do Bingo.
     Retorna true se mexeu em algo (pra decidir gravar). */
  function _applyMapping(cli,newCol){
    var changed=false;
    var STATUS_NORMAL=global.STATUS_NORMAL;
    var STATUS_ATENDIDO=global.STATUS_ATENDIDO;
    var STATUS_REMARCAR=global.STATUS_REMARCAR;
    var STATUS_NOSHOW=global.STATUS_NOSHOW;
    if(!cli.statusDates)cli.statusDates={};

    function setStatus(next){
      if(cli.status===next)return false;
      // Empilha remarkHistory quando saindo de um status "vivo" pra outro
      // diferente de normal — mesma regra que setCliStatus() já usa em
      // js/clientes.js, pra que o histórico do Bingo continue coerente.
      if(cli.status&&cli.status!==STATUS_NORMAL&&next!==STATUS_NORMAL){
        if(!cli.remarkHistory)cli.remarkHistory=[];
        cli.remarkHistory.push({
          n:(cli.remarkHistory.length+1),
          steps:(cli.steps||_blankSteps()).slice(),
          stepDates:(cli.stepDates||_blankStepDates()).slice(),
          motivo:next,
          virou:_nowIso(),
          origem:'sync-negocios'
        });
      }
      cli.status=next;
      cli.statusDates[next]=_nowIso();
      return true;
    }

    if(newCol==='agvid'||newCol==='presencial'){
      // Volta pra "vivo" no Bingo (caso estivesse marcado como atendido/
      // remarcar/no-show e o card voltou pro agendamento) e marca AG.
      if(cli.status&&cli.status!==STATUS_NORMAL){
        if(setStatus(STATUS_NORMAL))changed=true;
      }
      var stepsBefore=(cli.steps||[]).slice();
      _ensureAgStep(cli);
      if(!stepsBefore[0])changed=true;
    }else if(newCol==='vidp'){
      if(setStatus(STATUS_ATENDIDO))changed=true;
    }else if(newCol==='reag'){
      if(setStatus(STATUS_REMARCAR))changed=true;
    }else if(newCol==='noshow'){
      if(setStatus(STATUS_NOSHOW))changed=true;
    }
    // Qualquer outra coluna: sem efeito no Bingo (retag, cart, fich,
    // aprov, fecham, fechado). Preserva comportamento do CRM.
    return changed;
  }

  /* Só cria registro NOVO no Bingo se a coluna é uma etapa
     operacional (agvid/presencial) — pra não poluir o Bingo com cards
     de Retornar/Cartela/etc. que ainda não viraram atendimento. */
  function _shouldCreateBingoFor(col){
    return col==='agvid'||col==='presencial';
  }

  /* Ponto central de sincronização — pode ser chamado por qualquer
     hook (move, convert, discard, boot). Se already-exists, atualiza;
     senão só cria pra colunas operacionais. */
  function syncNegocioToBingo(card,ownerUid,newCol){
    if(!card)return;
    var uid=ownerUid||card.userId||(global.S&&global.S.userId);
    if(!uid)return;
    var col=newCol||card.col;
    if(!col)return;

    try{
      var list=global.getCliLocal(uid)||[];
      var cli=_findCliForCard(list,card);
      var mutated=false;

      if(!cli){
        if(!_shouldCreateBingoFor(col))return; // sem interesse: nada a fazer
        var made=_ensureCliForCard(uid,card);
        list=made.list;
        cli=made.cli;
        mutated=!!made.created;
      }else{
        // Reforça metadados frouxos que já ficaram pra trás, sem depender
        // de saveCli() idempotente quando nada realmente mudou.
        if(!cli.sourceBoard){cli.sourceBoard='negocios';mutated=true;}
        if(!cli.sourceCardId&&card.id){cli.sourceCardId=card.id;mutated=true;}
        if(!cli.sourceOriginalLeadId&&card.originalLeadId){cli.sourceOriginalLeadId=card.originalLeadId;mutated=true;}
        if(!cli.sourceOwnerUid){cli.sourceOwnerUid=uid;mutated=true;}
        if(!cli.tel&&card.tel){cli.tel=card.tel;mutated=true;}
        if(!cli.nicho&&card.nicho){cli.nicho=card.nicho;mutated=true;}
      }

      if(_applyMapping(cli,col))mutated=true;
      if(!mutated)return;
      global.saveCli(uid,list);

      // Se o Dashboard está aberto no próprio usuário, redesenha
      if(global.S&&global.S.userId===uid&&typeof global.renderDash==='function'){
        var pg=document.getElementById('pg-dash');
        if(pg&&pg.classList.contains('on')){
          try{global.renderDash();}catch(_e){}
        }
      }
    }catch(e){
      _warn('syncNegocioToBingo falhou',e);
    }
  }

  /* Reconciliação no boot — corrige registros antigos e o que veio de
     outros aparelhos. Roda uma vez por sessão. */
  function reconcileBingoFromNegocios(){
    if(!global.S||!global.S.userId)return;
    if(typeof global.getKB!=='function')return;
    try{
      var uid=global.S.userId;
      var negs=global.getKB('negocios')||[];
      if(!negs.length)return;
      var list=global.getCliLocal(uid)||[];
      var mutated=false;

      negs.forEach(function(card){
        if(!card||!card.col)return;
        var relevant=(card.col==='agvid'||card.col==='presencial'||
                      card.col==='vidp' ||card.col==='reag'      ||
                      card.col==='noshow');
        if(!relevant)return;

        var cli=_findCliForCard(list,card);
        if(!cli){
          if(!_shouldCreateBingoFor(card.col))return;
          var made=_ensureCliForCard(uid,card);
          list=made.list;cli=made.cli;mutated=true;
        }else{
          if(!cli.sourceBoard){cli.sourceBoard='negocios';mutated=true;}
          if(!cli.sourceCardId&&card.id){cli.sourceCardId=card.id;mutated=true;}
          if(!cli.sourceOriginalLeadId&&card.originalLeadId){cli.sourceOriginalLeadId=card.originalLeadId;mutated=true;}
          if(!cli.sourceOwnerUid){cli.sourceOwnerUid=uid;mutated=true;}
        }
        if(_applyMapping(cli,card.col))mutated=true;
      });

      if(mutated){
        global.saveCli(uid,list);
        _log('reconcile: Bingo atualizado a partir de',negs.length,'cards');
        if(typeof global.renderDash==='function'){
          var pg=document.getElementById('pg-dash');
          if(pg&&pg.classList.contains('on')){
            try{global.renderDash();}catch(_e){}
          }
        }
      }
    }catch(e){
      _warn('reconcileBingoFromNegocios falhou',e);
    }
  }

  /* ---------- HOOKS ---------- */

  /* Hook 1: _kbMoveCard — todo movimento de coluna do kanban passa por aqui
     (drag desktop, drag touch, botões de etapa, movimentação em massa,
     ver comentários originais em js/relatorios.js). */
  function _hookMoveCard(){
    if(typeof global._kbMoveCard!=='function'){
      _warn('_kbMoveCard não encontrado — hook de movimento ignorado');
      return;
    }
    if(global._kbMoveCard.__lfBingoSyncWrapped)return;
    var orig=global._kbMoveCard;
    global._kbMoveCard=function(cardId,board,uid,newCol,silent,bulk,dropIndex){
      var card=orig.apply(this,arguments);
      try{
        if(card&&board==='negocios'){
          syncNegocioToBingo(card,uid,card.col);
        }
        // Caso "leads → conv" — orig chama convertToNeg por baixo, que
        // já é hookado abaixo (convertToNeg tem seu próprio wrapper).
      }catch(e){_warn('hook _kbMoveCard',e);}
      return card;
    };
    global._kbMoveCard.__lfBingoSyncWrapped=true;
    _log('hook _kbMoveCard instalado');
  }

  /* Hook 2: convertToNeg — quando Lead vira Negócio direto em agvid/
     presencial, precisamos criar o registro no Bingo mesmo sem um
     movimento subsequente. */
  function _hookConvertToNeg(){
    if(typeof global.convertToNeg!=='function'){
      _warn('convertToNeg não encontrado — hook de conversão ignorado');
      return;
    }
    if(global.convertToNeg.__lfBingoSyncWrapped)return;
    var orig=global.convertToNeg;
    global.convertToNeg=function(cardId,ownerUid,prevCol,silent,opts,noAuto){
      var ret=orig.apply(this,arguments);
      try{
        var uid=ownerUid||(global.activeUID&&global.activeUID('leads'))||(global.S&&global.S.userId);
        if(uid&&typeof global.getKBFor==='function'){
          // FIX (2026-07-22): se o Lead foi transferido, o Negócio pode ter sido criado
          // no uid do usuário logado e não no ownerUid original. Tenta uid primeiro;
          // se não achar, tenta S.userId como fallback.
          var _searchUids=[uid];
          var _sUid=global.S&&global.S.userId;
          if(_sUid&&_sUid!==uid)_searchUids.push(_sUid);
          var newCard=null,newCardOwner=uid;
          for(var _si=0;_si<_searchUids.length&&!newCard;_si++){
            var negArr=global.getKBFor('negocios',_searchUids[_si])||[];
            for(var i=negArr.length-1;i>=0;i--){
              if(negArr[i]&&negArr[i].originalLeadId===cardId){newCard=negArr[i];newCardOwner=_searchUids[_si];break;}
            }
          }
          if(newCard){
            syncNegocioToBingo(newCard,newCardOwner,newCard.col);
          }
        }
      }catch(e){_warn('hook convertToNeg',e);}
      return ret;
    };
    global.convertToNeg.__lfBingoSyncWrapped=true;
    _log('hook convertToNeg instalado');
  }

  /* Hook 3: confirmDiscard — descarte de Negócios em massa/individual
     move o card pra col='noshow'. Como _kbMoveCard NÃO é usado no fluxo
     de descarte (o código altera c.col direto e chama saveKBFor), o
     hook 1 não pega esse caso — precisamos de um wrapper próprio aqui. */
  function _hookConfirmDiscard(){
    if(typeof global.confirmDiscard!=='function'){
      _warn('confirmDiscard não encontrado — hook de descarte ignorado');
      return;
    }
    if(global.confirmDiscard.__lfBingoSyncWrapped)return;
    var orig=global.confirmDiscard;
    global.confirmDiscard=function(){
      // Snapshot ANTES de descartar (o próprio orig zera _discardId/etc.)
      var snap={
        id:global._discardId,
        board:global._discardBoard,
        owner:global._discardOwner
      };
      var ret=orig.apply(this,arguments);
      try{
        if(snap.board==='negocios'&&snap.id&&snap.owner&&typeof global.getKBFor==='function'){
          var arr=global.getKBFor('negocios',snap.owner)||[];
          var card=null;
          for(var i=0;i<arr.length;i++){if(arr[i]&&arr[i].id===snap.id){card=arr[i];break;}}
          if(card)syncNegocioToBingo(card,snap.owner,'noshow');
        }
        // Descarte de Lead com Negócio vinculado: o orig percorre negArr
        // e marca os vinculados como noshow. Reprocessa todos os cards
        // vinculados desse dono.
        if(snap.board==='leads'&&snap.id&&snap.owner&&typeof global.getKBFor==='function'){
          var negs=global.getKBFor('negocios',snap.owner)||[];
          negs.forEach(function(n){
            if(n&&n.originalLeadId===snap.id&&n.col==='noshow'){
              syncNegocioToBingo(n,snap.owner,'noshow');
            }
          });
        }
      }catch(e){_warn('hook confirmDiscard',e);}
      return ret;
    };
    global.confirmDiscard.__lfBingoSyncWrapped=true;
    _log('hook confirmDiscard instalado');
  }

  /* ---------- INSTALAÇÃO ---------- */

  function _install(){
    if(_installed)return;
    if(!_hasDeps()){
      // As dependências carregam antes por ordem de <script>. Se por algum
      // motivo (patch reordenado) chegarmos aqui sem elas, tentamos de novo.
      return setTimeout(_install,200);
    }
    _installed=true;
    _hookMoveCard();
    _hookConvertToNeg();
    _hookConfirmDiscard();

    // Reconciliação: um pouco depois do boot pra dar tempo do login
    // (S.userId) estabilizar e do worker devolver o kb_negocios local.
    var _rec=function(){reconcileBingoFromNegocios();};
    if(global.S&&global.S.userId){
      setTimeout(_rec,1500);
    }else{
      // Aguarda sessão iniciar
      var tries=0;
      var iv=setInterval(function(){
        tries++;
        if(global.S&&global.S.userId){clearInterval(iv);setTimeout(_rec,600);}
        else if(tries>60){clearInterval(iv);} // desiste após ~60s
      },1000);
    }

    // Expõe utilitário público (útil pra debug/console e futuros patches):
    global.LiderCRM=global.LiderCRM||{};
    global.LiderCRM.bingoSync={
      syncNegocioToBingo:syncNegocioToBingo,
      reconcileBingoFromNegocios:reconcileBingoFromNegocios,
      _findCliForCard:_findCliForCard
    };

    _log('patch instalado');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{
    _install();
  }
})(window);
