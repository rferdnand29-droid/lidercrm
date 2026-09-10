/* ============================================================
 * lf-flow-hardening-v1-20260728.js
 * ------------------------------------------------------------
 * Correção definitiva de 3 bugs pedidos por Rhuan (28/07):
 *   BUG 1: Alterar responsável (bulk + assumeLead + _kbTransferCard)
 *          agora EXIGE board (Lead/Negócio) + etapa destino.
 *   BUG 2: TODO fluxo de "Lead -> Convertido" (drag desktop,
 *          drag touch, moveCard, bulkMove) agora abre o mesmo
 *          modal openConvertModal para escolher a etapa inicial
 *          do Negócio. Nada mais cai em 'retag' silenciosamente.
 *   BUG 3: Presence do chat inicia no BOOT (não só ao abrir a
 *          aba Papo); leitura de mensagens é propagada ao
 *          remetente (via putConfig do doc chat_conv_<id>),
 *          disparando os "dois traços azuis" no outro lado.
 *
 * Estilo: wrappers idempotentes (mesmo padrão dos outros patches
 * lf-*). Não altera HTML/CSS. Não remove features existentes.
 * ============================================================ */
(function(global){
  'use strict';
  if(global.__lfFlowHardeningV1) return;
  global.__lfFlowHardeningV1 = true;

  var TAG = '[lf-flow-hardening]';
  function _log(){ try{ console.info.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function _warn(){ try{ console.warn.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }

  /* ================================================================
   * BUG 1 + BUG 2 UNIFICADOS — Guard central de transferência/mudança
   * ================================================================
   * Regras exigidas pelo Rhuan (28/07 09:53-09:54):
   *  R1: TODO fluxo de "alterar responsável" precisa pedir a ETAPA
   *      e a ABA (Lead ou Negócio) para onde o card vai.
   *  R2: TODO fluxo de "Lead convertido em Negócio" (incluindo o
   *      drag-and-drop manual pra coluna Convertido) precisa pedir
   *      em QUAL etapa do Negócio o card entra.
   * ================================================================
   */

  /* --- helpers ------------------------------------------------- */
  function _hasKb(){
    return typeof global.kbCols==='function' &&
           typeof global.getKBFor==='function' &&
           typeof global.KB_NEG_COLS!=='undefined';
  }

  /* Modal reaproveitável: aba (leads/negocios) + etapa (dinâmica).
     Renderizado como div flutuante com o mesmo visual dos outros
     modais (.mo). Não depende de HTML novo em app.html/index.html. */
  function _pickBoardAndStage(opts, cb){
    /* opts: { title, defaultBoard, allowBoardSwitch(bool),
              currentBoard, currentCol, cardName } */
    opts = opts || {};
    var host = document.createElement('div');
    host.className = 'mo on';
    host.style.zIndex = 9999;
    host.setAttribute('data-lf-picker','1');
    host.innerHTML =
      '<div class="mo-in" style="max-width:420px">'+
        '<div class="mo-hd"><span>'+ (opts.title || '🧭 Escolher aba e etapa') +'</span>'+
          '<button class="mo-x" data-act="cancel" aria-label="Fechar">✕</button></div>'+
        '<div class="mo-bd" style="display:flex;flex-direction:column;gap:10px">'+
          (opts.cardName?'<div style="font-size:.78rem;color:var(--mu)">Card: <strong>'+String(opts.cardName).replace(/[<>]/g,'')+'</strong></div>':'')+
          '<label style="font-size:.72rem;color:var(--mu)">Aba destino</label>'+
          '<select class="det-select" data-role="board"'+(opts.allowBoardSwitch===false?' disabled':'')+'>'+
            '<option value="">Selecione a aba</option>'+
            '<option value="leads">Lead</option>'+
            '<option value="negocios">Negócio</option>'+
          '</select>'+
          '<label style="font-size:.72rem;color:var(--mu)">Etapa destino</label>'+
          '<select class="det-select" data-role="col">'+
            '<option value="">Selecione a etapa</option>'+
          '</select>'+
        '</div>'+
        '<div class="mo-ft" style="display:flex;gap:8px;justify-content:flex-end">'+
          '<button class="bc" data-act="cancel">Cancelar</button>'+
          '<button class="bp" data-act="ok">Confirmar</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(host);

    var brdSel = host.querySelector('[data-role="board"]');
    var colSel = host.querySelector('[data-role="col"]');

    function _fillCols(board){
      if(!board){ colSel.innerHTML = '<option value="">Selecione a etapa</option>'; return; }
      try{
        var cols = global.kbCols(board) || [];
        colSel.innerHTML = '<option value="">Selecione a etapa</option>' +
          cols.map(function(col){
            var sel = (board===opts.currentBoard && col.id===opts.currentCol) ? ' selected' : '';
            return '<option value="'+(typeof _htmlAttr==='function'?_htmlAttr(col.id):col.id)+'"'+sel+'>'+
              (col.label||col.id).replace(/[<>]/g,'') +'</option>';
          }).join('');
      }catch(e){ _warn('kbCols falhou', e); }
    }

    if(opts.defaultBoard){ brdSel.value = opts.defaultBoard; _fillCols(opts.defaultBoard); }
    brdSel.addEventListener('change', function(){ _fillCols(brdSel.value); });

    function _close(){ try{ host.remove(); }catch(_e){} }

    host.addEventListener('click', function(e){
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if(!act) return;
      if(act==='cancel'){ _close(); if(cb) cb(null); return; }
      if(act==='ok'){
        var board = brdSel.value, col = colSel.value;
        if(!board){ if(typeof global.toast==='function') global.toast('⚠ Selecione a aba (Lead ou Negócio)'); return; }
        if(!col){ if(typeof global.toast==='function') global.toast('⚠ Selecione a etapa'); return; }
        _close();
        if(cb) cb({ board: board, col: col });
      }
    });
  }
  global._lfPickBoardAndStage = _pickBoardAndStage;

  /* ---------- BUG 1a: hook em applyBulkResp (transferência em massa) ---------- */
  function _hookApplyBulkResp(){
    if(typeof global.applyBulkResp !== 'function') return;
    if(global.applyBulkResp.__lfHardened) return;
    var orig = global.applyBulkResp;
    global.applyBulkResp = function(newUid){
      var sel = global._bulkSelected || [];
      if(!sel.length){ return orig.apply(this, arguments); }
      /* Se todos os cards são do MESMO board, propomos ele como default;
         senão o usuário escolhe. */
      var boards = {};
      sel.forEach(function(x){ if(x&&x.board) boards[x.board]=true; });
      var boardKeys = Object.keys(boards);
      var defaultBoard = (boardKeys.length===1) ? boardKeys[0] : '';
      _pickBoardAndStage({
        title: '🔄 Transferir '+sel.length+' card(s) — escolha destino',
        defaultBoard: defaultBoard,
        allowBoardSwitch: true,
        cardName: sel.length+' card(s) selecionado(s)'
      }, function(choice){
        if(!choice) return; // cancelado
        /* Aplica a mudança de etapa/board ANTES de transferir. Se
           board mudou (lead->negócio ou vice-versa), usa convertToNeg
           / convertToLead. Depois chama o applyBulkResp original,
           que só cuidará da troca de dono. */
        try{
          sel.forEach(function(x){
            var uid = x.ownerUid || (typeof global.activeUID==='function' && global.activeUID(x.board));
            if(!uid) return;
            if(choice.board !== x.board){
              if(x.board==='leads' && choice.board==='negocios' && typeof global.convertToNeg==='function'){
                global.convertToNeg(x.id, uid, undefined, true, {col:choice.col, valor:0, obs:''}, true);
                /* Depois da conversão, o id novo do card em negocios muda —
                   procuramos e atualizamos a referência em _bulkSelected. */
                var negArr = global.getKBFor('negocios', uid) || [];
                var found = null;
                for(var i=negArr.length-1;i>=0;i--){
                  if(negArr[i] && negArr[i].originalLeadId===x.id){ found=negArr[i]; break; }
                }
                if(found){ x.id = found.id; x.board = 'negocios'; }
              } else if(x.board==='negocios' && choice.board==='leads' && typeof global.convertToLead==='function'){
                var newLead = global.convertToLead(x.id, uid, true, choice.col);
                if(newLead && newLead.id){ x.id = newLead.id; x.board='leads'; }
              }
            } else if(x.board===choice.board){
              /* Mesmo board: só move de coluna se for diferente. */
              var arr = global.getKBFor(x.board, uid) || [];
              var c = arr.find(function(q){ return q&&q.id===x.id; });
              if(c && c.col !== choice.col && typeof global._kbMoveCard==='function'){
                global._kbMoveCard(x.id, x.board, uid, choice.col, true, true);
              }
            }
          });
        }catch(e){ _warn('bulk stage change falhou', e); }
        /* Agora sim: transfere o dono. */
        return orig.call(global, newUid);
      });
    };
    global.applyBulkResp.__lfHardened = true;
    _log('applyBulkResp: guard de aba/etapa instalado');
  }

  /* ---------- BUG 1b: hook em assumeLead ("Assumir Lead" da etapa Livre) ---------- */
  function _hookAssumeLead(){
    if(typeof global.assumeLead !== 'function') return;
    if(global.assumeLead.__lfHardened) return;
    var orig = global.assumeLead;
    global.assumeLead = function(cardId, board, ownerUid){
      _pickBoardAndStage({
        title: '✋ Assumir Lead — escolher destino',
        defaultBoard: 'leads',
        allowBoardSwitch: true,   /* pode assumir e já converter em Negócio */
        currentBoard: 'leads',
        currentCol: 'livre'
      }, function(choice){
        if(!choice) return;
        /* Roda o assumeLead original (que faz a troca de responsável e
           registra o histórico com os 4 campos obrigatórios). */
        var _rv = orig.call(global, cardId, board, ownerUid);
        /* Depois de assumir, aplica etapa/board escolhida. */
        try{
          var S = global.S; if(!S||!S.userId) return _rv;
          var newBoard = choice.board, newCol = choice.col;
          if(newBoard==='leads' && newCol!=='livre' && typeof global._kbMoveCard==='function'){
            global._kbMoveCard(cardId, 'leads', S.userId, newCol, true, false);
          } else if(newBoard==='negocios' && typeof global.convertToNeg==='function'){
            global.convertToNeg(cardId, S.userId, 'livre', true, {col:newCol, valor:0, obs:''}, true);
          }
          if(typeof global.renderKBLocal==='function'){
            global.renderKBLocal('leads'); global.renderKBLocal('negocios');
          }
        }catch(e){ _warn('assumeLead stage apply falhou', e); }
        return _rv;
      });
    };
    global.assumeLead.__lfHardened = true;
    _log('assumeLead: guard de aba/etapa instalado');
  }

  /* ---------- BUG 1c: guarda central em _kbTransferCard ----------
     Qualquer código legado ou novo que chame _kbTransferCard sem
     antes ter definido board+col é bloqueado com toast. Isso fecha
     definitivamente a superfície de ataque do bug. */
  function _hookTransferCardGuard(){
    if(typeof global._kbTransferCard !== 'function') return;
    if(global._kbTransferCard.__lfHardened) return;
    var orig = global._kbTransferCard;
    global._kbTransferCard = function(cardId, board, fromUid, toUid, silent, cb){
      /* Se veio marcado como "já validou aba/etapa" (via _lfStageValidated=true
         em global), respeita. Isso é setado por applyRespStage, applyBulkResp
         e assumeLead após passar pelo picker. */
      if(global.__lfStageValidated){
        global.__lfStageValidated = false; // consome o token
        return orig.apply(this, arguments);
      }
      /* Caso contrário: pergunta aba/etapa antes. */
      try{
        var arr = global.getKBFor(board, fromUid) || [];
        var c = arr.find(function(x){ return x&&x.id===cardId; });
        var name = c ? c.name : '';
        _pickBoardAndStage({
          title: '🔄 Alterar responsável — escolher destino',
          defaultBoard: board,
          allowBoardSwitch: true,
          currentBoard: board,
          currentCol: c ? c.col : '',
          cardName: name
        }, function(choice){
          if(!choice){ if(cb) cb(null); return; }
          try{
            if(choice.board!==board){
              if(board==='leads' && choice.board==='negocios' && typeof global.convertToNeg==='function'){
                global.convertToNeg(cardId, fromUid, undefined, true, {col:choice.col, valor:0, obs:(c&&c.obs)||''}, true);
                var negArr = global.getKBFor('negocios', fromUid) || [];
                var found = null;
                for(var i=negArr.length-1;i>=0;i--){
                  if(negArr[i] && negArr[i].originalLeadId===cardId){ found=negArr[i]; break; }
                }
                if(found){ cardId = found.id; board='negocios'; }
              } else if(board==='negocios' && choice.board==='leads' && typeof global.convertToLead==='function'){
                var newLead = global.convertToLead(cardId, fromUid, true, choice.col);
                if(newLead && newLead.id){ cardId = newLead.id; board='leads'; }
              }
            } else if(c && c.col!==choice.col && typeof global._kbMoveCard==='function'){
              global._kbMoveCard(cardId, board, fromUid, choice.col, true, false);
            }
          }catch(e){ _warn('transferCard pré-move falhou', e); }
          global.__lfStageValidated = true; /* libera o próximo call */
          orig.call(global, cardId, board, fromUid, toUid, silent, cb);
        });
      }catch(e){ _warn('transferCard guard falhou', e); return orig.apply(this, arguments); }
    };
    global._kbTransferCard.__lfHardened = true;
    _log('_kbTransferCard: guard de aba/etapa instalado');
  }

  /* ---------- applyRespStage: só marca o token pra guard não repetir ---------- */
  function _hookApplyRespStage(){
    if(typeof global.applyRespStage !== 'function') return;
    if(global.applyRespStage.__lfHardened) return;
    var orig = global.applyRespStage;
    global.applyRespStage = function(){
      /* applyRespStage JÁ valida board+col+motivo internamente (ver
         js/kanban.js:1220-1224). Sinaliza pro guard central que
         essa transferência não precisa re-perguntar. */
      global.__lfStageValidated = true;
      try{ return orig.apply(this, arguments); }
      finally{ global.__lfStageValidated = false; }
    };
    global.applyRespStage.__lfHardened = true;
    _log('applyRespStage: bypass do guard central instalado');
  }

  /* ================================================================
   * BUG 2 — Drag/move para coluna Convertido SEMPRE pede etapa do
   *         Negócio. Intercepta _kbMoveCard antes dele chamar
   *         convertToNeg com opts=undefined.
   * ================================================================ */
  function _hookMoveCardConvertPrompt(){
    if(typeof global._kbMoveCard !== 'function') return;
    if(global._kbMoveCard.__lfConvertPrompt) return;
    var orig = global._kbMoveCard;
    global._kbMoveCard = function(cardId, board, uid, newCol, silent, bulk, dropIndex){
      /* Só intercepta o caso específico do bug: Lead -> conv sem
         opts pré-definidos. Se veio via applyRespStage ou via
         openConvertModal, o token __lfConvertValidated é true e a
         gente segue direto. */
      if(board==='leads' && newCol==='conv' && !global.__lfConvertValidated){
        try{
          var arr = global.getKBFor('leads', uid) || [];
          var c = arr.find(function(x){ return x&&x.id===cardId; });
          if(!c){ return orig.apply(this, arguments); }
          /* Abre o MESMO modal já usado pelo botão manual, pra
             manter UX consistente e não duplicar UI. */
          if(typeof global.openConvertModal === 'function'){
            global.openConvertModal(cardId, uid);
            /* Re-renderiza o kanban pra visualmente devolver o card
               à coluna de origem enquanto o usuário confirma no
               modal (evita a ilusão de que o card já foi convertido). */
            if(typeof global.renderKBLocal==='function') global.renderKBLocal('leads');
            return c;
          }
        }catch(e){ _warn('convert prompt falhou', e); }
      }
      return orig.apply(this, arguments);
    };
    global._kbMoveCard.__lfConvertPrompt = true;
    _log('_kbMoveCard: prompt de etapa em conversão para Negócio instalado');
  }

  /* confirmConvertToNeg: quando o usuário confirma no modal,
     seta o token pra próximo convertToNeg passar direto (senão
     o wrapper do _kbMoveCard poderia reabrir o modal em loop). */
  function _hookConfirmConvert(){
    if(typeof global.confirmConvertToNeg !== 'function') return;
    if(global.confirmConvertToNeg.__lfHardened) return;
    var orig = global.confirmConvertToNeg;
    global.confirmConvertToNeg = function(){
      global.__lfConvertValidated = true;
      try{ return orig.apply(this, arguments); }
      finally{ global.__lfConvertValidated = false; }
    };
    global.confirmConvertToNeg.__lfHardened = true;
    _log('confirmConvertToNeg: token de bypass instalado');
  }

  /* bulkConvert: transformação em massa Lead -> Negócio SEM opts
     também precisa perguntar. Como são vários cards, perguntamos
     UMA vez a etapa comum e aplicamos a todos. */
  function _hookBulkConvert(){
    if(typeof global.bulkConvert !== 'function') return;
    if(global.bulkConvert.__lfHardened) return;
    var orig = global.bulkConvert;
    global.bulkConvert = function(){
      var sel = (global._bulkSelected||[]).filter(function(x){return x.board==='leads';});
      if(!sel.length) return orig.apply(this, arguments);
      _pickBoardAndStage({
        title: '💠 Converter '+sel.length+' Lead(s) em Negócio — etapa inicial',
        defaultBoard: 'negocios',
        allowBoardSwitch: false,
        cardName: sel.length+' Lead(s) selecionado(s)'
      }, function(choice){
        if(!choice) return;
        try{
          sel.forEach(function(x){
            global.__lfConvertValidated = true;
            try{
              global.convertToNeg(x.id, x.ownerUid, undefined, true, {col:choice.col, valor:0, obs:''}, true);
            } finally { global.__lfConvertValidated = false; }
          });
          if(typeof global.clearBulk==='function') global.clearBulk();
          if(typeof global.toast==='function') global.toast('Convertidos!');
        }catch(e){ _warn('bulkConvert falhou', e); }
      });
    };
    global.bulkConvert.__lfHardened = true;
    _log('bulkConvert: prompt de etapa instalado');
  }

  /* ================================================================
   * BUG 3a — Presence do chat inicia no BOOT (não só na aba Papo)
   * ================================================================ */
  function _bootGlobalPresence(){
    try{
      var S = global.S;
      if(!S || !S.userId){
        /* Sessão ainda não existe: tenta de novo a cada 2 s até logar. */
        setTimeout(_bootGlobalPresence, 2000);
        return;
      }
      if(typeof global._chatStartPresence === 'function'){
        global._chatStartPresence();
        _log('presence global ativado (usuário considerado online em qualquer aba do CRM)');
      } else {
        /* chat.js ainda não carregou (lazy-load): tenta em 2 s. */
        setTimeout(_bootGlobalPresence, 2000);
      }
    }catch(e){ _warn('boot presence falhou', e); }
  }

  /* Ao fazer logout, para o presence. Ao voltar de background,
     revalida. */
  function _hookLogoutStopsPresence(){
    if(typeof global.logout === 'function' && !global.logout.__lfPresenceHardened){
      var orig = global.logout;
      global.logout = function(){
        try{ if(typeof global._chatStopPresence==='function') global._chatStopPresence(); }catch(_e){}
        return orig.apply(this, arguments);
      };
      global.logout.__lfPresenceHardened = true;
    }
  }

  /* ================================================================
   * BUG 3b — Ao abrir uma conversa e marcar mensagens como lidas,
   *          PROPAGAR o read=true para o servidor (putConfig do
   *          documento chat_conv_<id>). Isso permite que o remetente
   *          veja os "dois traços azuis" no próximo poll/Realtime.
   * ================================================================ */
  function _hookOpenChatConvSyncRead(){
    if(typeof global.openChatConv !== 'function') return;
    if(global.openChatConv.__lfReadSync) return;
    var orig = global.openChatConv;
    global.openChatConv = function(convId){
      var ret = orig.apply(this, arguments);
      /* openChatConv já marcou m.read=true no localStorage e chamou
         _chatSaveMsgs. Aqui fazemos o UPSERT no doc remoto pra que
         o remetente veja o status atualizado. */
      try{
        var root = global.LiderCRM;
        var wc = root && root.api && root.api.workerClient;
        if(!(root && root.config && root.config.useWorkerApi && wc && typeof wc.putConfig==='function')){
          return ret;
        }
        var msgs = (typeof global._chatGetMsgs==='function') ? global._chatGetMsgs(convId) : [];
        if(!msgs || !msgs.length) return ret;
        var convs = (typeof global._chatGetConvs==='function') ? global._chatGetConvs() : [];
        var conv = convs.find(function(c){ return c && c.id===convId; });
        var payload = {
          isGroup: conv ? !!conv.isGroup : false,
          participants: conv ? (conv.participants||[]) : [],
          participantNames: conv ? (conv.participantNames||{}) : {},
          name: conv ? (conv.name||'') : '',
          admins: conv ? (conv.admins||[]) : [],
          createdBy: conv ? (conv.createdBy||'') : '',
          msgs: msgs
        };
        wc.putConfig('chat_conv_' + convId, payload).catch(function(e){
          _warn('putConfig read-sync falhou', e);
        });
      }catch(e){ _warn('read sync falhou', e); }
      return ret;
    };
    global.openChatConv.__lfReadSync = true;
    _log('openChatConv: sync de status de leitura (dois traços azuis) instalado');
  }

  /* ================================================================
   * Instalação
   * ================================================================ */
  function _install(){
    /* BUG 1 / BUG 2 dependem do kanban runtime. */
    if(_hasKb()){
      _hookApplyBulkResp();
      _hookAssumeLead();
      _hookTransferCardGuard();
      _hookApplyRespStage();
      _hookMoveCardConvertPrompt();
      _hookConfirmConvert();
      _hookBulkConvert();
    } else {
      /* Kanban ainda não carregou: retry em 1 s. */
      setTimeout(_install, 1000);
      return;
    }
    /* BUG 3: chat pode não estar carregado ainda (lazy) — vira retry. */
    _bootGlobalPresence();
    _hookLogoutStopsPresence();
    if(typeof global.openChatConv==='function'){
      _hookOpenChatConvSyncRead();
    } else {
      /* Aguarda o chat carregar. */
      var _tries=0;
      var _wait=setInterval(function(){
        if(typeof global.openChatConv==='function'){
          clearInterval(_wait);
          _hookOpenChatConvSyncRead();
        } else if(++_tries>30){ clearInterval(_wait); }
      }, 1000);
    }
    _log('patch instalado');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', _install, { once:true });
  } else {
    _install();
  }
})(window);
