/* ============================================================
 * lf-livre-reason-required-v2-20260730.js
 * ------------------------------------------------------------
 * SUBSTITUI:  lf-livre-reason-required-v1-20260730.js
 *
 * Correções desta v2 em cima da v1 (diagnóstico forense
 * documentado em RELATORIO_LIVRE_v2.md):
 *
 *  FIX A) A v1 chamava `_origMoveCardCore` (a função capturada
 *         ANTES dos wrappers de bingo-sync / bugs-4fixes /
 *         bugs-5fixes). Consequência: quando o usuário confirmava
 *         o motivo, a movimentação real do card acontecia sem
 *         preservação de scroll (bugs-4fixes/5fixes) e sem sync
 *         com Bingo (bingo-sync). Agora o afterConfirm chama a
 *         cadeia ATUAL de `_kbMoveCard`, mas com o token
 *         `__lfLivreValidated` ativo — assim os wrappers de
 *         scroll/bingo continuam rodando e o guard de Livre não
 *         entra em loop.
 *
 *  FIX B) A v1 disparava `renderKBLocal(board)` quando abria o
 *         modal (para "cancelar visualmente" o drop). Isso rodava
 *         em cima do `renderKBLocal` que o drop desktop/touch já
 *         chama LOGO DEPOIS de `_kbMoveCard`. Resultado: duplo
 *         redraw a cada arrastar, com "pulinho" no kanban. Agora
 *         o patch NÃO re-renderiza ao abrir o modal — o card já
 *         não foi movido, o kanban já está no estado correto.
 *
 *  FIX C) A v1 fazia `global._kbMoveCard.__lfLivreReasonRequired
 *         = true` sem carregar as flags dos wrappers anteriores.
 *         Qualquer patch idempotente futuro reinstalaria por cima
 *         (double-wrap). Agora preservamos
 *         `__lfBingoSyncWrapped`, `__lf4xScrollWrapped`,
 *         `__lf5xWrapped`, `__lfConvertPrompt` no wrapper novo.
 *
 *  FIX D) `applyBulkMove` da v1 devolvia sem tocar em toasts —
 *         mas o chamador do bulkMove UI (`bulkMove()`, kanban.js
 *         1742) esperava o modal fechar. Agora fechamos
 *         `mo-bulk-move` ANTES de abrir `mo-discard` (já estava
 *         na v1) e, no cancelamento (modal fechado sem confirmar),
 *         limpamos `_bulkSelected` só se o usuário confirmou.
 *         Se cancelar, os cards seguem selecionados para o
 *         usuário tentar de novo, sem UI ambígua.
 *
 *  FIX E) Movimentação individual pelo botão de etapa
 *         (`moveCard`, kanban.js:1121) e por drop
 *         (`kanban.js:569` / `:1592`) chamavam `_kbMoveCard` e
 *         seguiam com renderização/toast como se tivesse movido.
 *         A v1 já bloqueia o move (retorna sem mover), mas o
 *         chamador ainda pinta feedback falso. Agora, quando o
 *         guard está pendente, marcamos `card.__lfPendingLivre`
 *         temporariamente para o kanban NÃO exibir toast
 *         individual (o modal já é o feedback).
 *
 *  FIX F) Micro-fluidez: adicionamos `contain: layout style` +
 *         `content-visibility: auto` de forma NÃO destrutiva nas
 *         colunas .kb-cards em tempo de execução, se ainda não
 *         estiver setado. Isso melhora perceptivelmente o
 *         arrastar em quadros grandes. Zero impacto quando o CSS
 *         já foi ajustado.
 *
 * Estilo: wrapper idempotente. Não altera HTML/CSS estáticos.
 * Não remove nenhuma feature existente da v1. Reaproveita o
 * modal `mo-discard`, exatamente como pedido.
 * ============================================================ */
(function(global){
  'use strict';

  if(!global) return;
  if(global.__lfFixLivreReasonRequiredV2) return;
  global.__lfFixLivreReasonRequiredV2 = true;
  if(global.__lfLivreReasonRequiredPatchV2) return;
  global.__lfLivreReasonRequiredPatchV2 = true;

  // v1 flag também é setada para a v1 NÃO reinstalar caso os dois
  // scripts fiquem carregados no cache do usuário durante a
  // transição. Como o include da v1 sai do HTML, isso é apenas
  // uma cinta de segurança.
  global.__lfLivreReasonRequiredPatch = true;

  var PATCH_TAG = '[lf-livre-reason-required-v2-20260730]';
  var LIVRE_REASONS = [
    { id:'nao_consegui_contato', label:'Não consegui contato', sub:'Tentativas feitas, mas o cliente não respondeu.' },
    { id:'cliente_dificil',      label:'Cliente difícil',      sub:'O atendimento não conseguiu avançar de forma viável.' },
    { id:'outro',                label:'Outro motivo',         sub:'Digite abaixo um motivo diferente para salvar.' }
  ];

  function _log(){  try{ console.log.apply(console,  [PATCH_TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function _warn(){ try{ console.warn.apply(console, [PATCH_TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function _esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function _state(){
    var st = global._discardState;
    if(!st || typeof st !== 'object'){
      st = {items:[],reason:null,targetCol:null,afterConfirm:null};
      global._discardState = st;
    }
    return st;
  }
  function _byId(id){ return document.getElementById(id); }
  function _trim(v){ return String(v||'').trim(); }
  function _isLivreTarget(board,col){ return board === 'leads' && col === 'livre'; }
  function _labelForReason(reason){
    var found = LIVRE_REASONS.find(function(x){ return x.id === reason; });
    return found ? found.label : reason;
  }
  function _setConfirmEnabled(enabled){
    var btn = _byId('discard-confirm-btn');
    if(!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '' : '.45';
    btn.style.cursor  = enabled ? '' : 'not-allowed';
  }
  function _getLivreDetail(){
    return _trim((_byId('discard-outro-txt')||{}).value || '');
  }
  function _syncLivreConfirmState(){
    var st = _state();
    if(st.mode !== 'livre') return;
    var reason = _trim(st.reason||'');
    var detail = _getLivreDetail();
    var ok = false;
    if(reason === 'outro') ok = !!detail;
    else if(reason)        ok = true;
    else if(detail)        ok = true;
    _setConfirmEnabled(ok);
  }
  function _bindLivreInputWatcher(){
    var txt = _byId('discard-outro-txt');
    if(!txt || txt.__lfLivreBound) return;
    txt.__lfLivreBound = true;
    txt.addEventListener('input', function(){
      if(_state().mode === 'livre') _syncLivreConfirmState();
    });
  }
  function _modalEls(){
    var modal = _byId('mo-discard');
    if(!modal) return {};
    var title = modal.querySelector('h2');
    var introStrong = _byId('discard-nome');
    var intro = introStrong && introStrong.parentNode;
    var opts  = _byId('discard-opts');
    var wrap  = _byId('discard-outro-wrap');
    var wrapLabel = wrap ? wrap.querySelector('div') : null;
    var txt   = _byId('discard-outro-txt');
    var confirmBtn = _byId('discard-confirm-btn');
    return { modal:modal, title:title, intro:intro, introStrong:introStrong, opts:opts, wrap:wrap, wrapLabel:wrapLabel, txt:txt, confirmBtn:confirmBtn };
  }
  function _renderReasonButtons(items){
    return items.map(function(item){
      return ''
        + '<button class="discard-opt" onclick="selDiscardOpt(\'' + _esc(item.id) + '\',this)">'
        +   '<span class="do-label">' + _esc(item.label) + '</span>'
        +   '<span class="do-sub">'   + _esc(item.sub)   + '</span>'
        + '</button>';
    }).join('');
  }
  function _configureDiscardModal(){
    var els = _modalEls();
    if(!els.modal) return;
    if(els.title) els.title.innerHTML = '🗑 Descartar Lead/Negócio';
    if(els.intro) els.intro.innerHTML = 'Selecione o motivo para <strong id="discard-nome"></strong>. O motivo é obrigatório para descartar.';
    if(els.opts) els.opts.innerHTML = _renderReasonButtons([
      { id:'ja_comprou',    label:'✅ Já comprou',    sub:'O lead já fechou por outro caminho' },
      { id:'sem_interesse', label:'🙅 Sem interesse', sub:'Não quer seguir com o processo' },
      { id:'em_tratativa',  label:'📝 Em tratativa',  sub:'Será tratado fora deste card' }
    ]);
    if(els.wrap) els.wrap.style.display = 'block';
    if(els.wrapLabel) els.wrapLabel.textContent = 'Motivo específico (opcional)';
    if(els.txt) els.txt.placeholder = 'Descreva o motivo específico deste descarte...';
    if(els.confirmBtn) els.confirmBtn.textContent = 'Confirmar Descarte';
  }
  function _configureLivreModal(cardLabel){
    var els = _modalEls();
    if(!els.modal) return;
    if(els.title) els.title.innerHTML = '🟦 Motivo obrigatório — Lead Livre';
    if(els.intro) els.intro.innerHTML = 'Selecione ou digite o motivo para mover <strong id="discard-nome"></strong> para a etapa <strong>Lead Livre</strong>.';
    var strong = _byId('discard-nome');
    if(strong) strong.textContent = cardLabel || '';
    if(els.opts) els.opts.innerHTML = _renderReasonButtons(LIVRE_REASONS);
    if(els.wrap) els.wrap.style.display = 'block';
    if(els.wrapLabel) els.wrapLabel.textContent = 'Outro motivo';
    if(els.txt){
      els.txt.value = '';
      els.txt.placeholder = 'Digite um motivo diferente para salvar esta ida ao Lead Livre...';
    }
    if(els.confirmBtn) els.confirmBtn.textContent = 'Salvar motivo e mover';
  }

  /* ------------------------------------------------------------------
   * FIX A + C: Captura da CADEIA ATUAL (não da função base).
   * ------------------------------------------------------------------ */
  var _origOpenDiscardReasonModal = (typeof global._kbOpenDiscardReasonModal === 'function') ? global._kbOpenDiscardReasonModal : null;
  var _origConfirmDiscard         = (typeof global.confirmDiscard         === 'function') ? global.confirmDiscard         : null;
  var _origSelDiscardOpt          = (typeof global.selDiscardOpt          === 'function') ? global.selDiscardOpt          : null;
  var _origMoveCardChain          = (typeof global._kbMoveCard             === 'function') ? global._kbMoveCard             : null;
  var _origApplyBulkMove          = (typeof global.applyBulkMove           === 'function') ? global.applyBulkMove           : null;

  function _stampLivreReason(board, uid, cardId, oldCol, payload){
    var arr = (typeof global.getKBFor === 'function') ? (global.getKBFor(board, uid) || []) : [];
    var card = arr.find(function(x){ return x && x.id === cardId; });
    if(!card) return null;
    var ts = new Date().toISOString();
    card.livreReason        = payload.reason;
    card.livreReasonLabel   = payload.reasonText;
    card.livreReasonAt      = ts;
    card.livreReasonFromCol = oldCol || card.livreReasonFromCol || null;
    card.updatedAt          = ts;
    if(typeof global._pushHistorico === 'function'){
      var fromLbl = (oldCol && typeof global._colLabel === 'function') ? global._colLabel(board, oldCol) : oldCol;
      global._pushHistorico(card, 'Motivo da entrada em "Lead Livre": ' + payload.reasonText + (fromLbl ? ' · origem: "' + fromLbl + '"' : ''));
    }
    if(typeof global.saveKBFor === 'function') global.saveKBFor(board, uid, arr);
    return card;
  }

  function _afterLivreMoveCommon(payload, count){
    // FIX B: um único render local no fim de todo o fluxo — já
    // depois de todos os saves e do stamp de motivo.
    if(typeof global.renderKBLocal === 'function') global.renderKBLocal('leads');
    if(typeof global.isMobileView === 'function' && global.isMobileView() && typeof global.renderKBMobile === 'function'){
      global.renderKBMobile('leads');
    }
    if(typeof global.toast === 'function'){
      global.toast('Lead Livre: motivo salvo — ' + payload.reasonText + (count > 1 ? ' (' + count + ' cards)' : ''));
    }
  }

  function _openLivreReasonModal(opts){
    opts = opts || {};
    var items = Array.isArray(opts.items) ? opts.items.filter(function(x){ return x && x.id && x.board; }) : [];
    if(!items.length) return false;
    var first = items[0];
    var uid = first.ownerUid || (typeof global.activeUID === 'function' ? global.activeUID(first.board) : '');
    var arr = (typeof global.getKBFor === 'function') ? (global.getKBFor(first.board, uid) || []) : [];
    var c   = arr.find(function(x){ return x && x.id === first.id; });
    var cardLabel = (items.length === 1 && c && c.name)
      ? c.name
      : (items.length + ' card' + (items.length > 1 ? 's' : '') + ' selecionado' + (items.length > 1 ? 's' : ''));

    global._discardState = {
      items: items,
      reason: null,
      targetCol: 'livre',
      afterConfirm: (typeof opts.afterConfirm === 'function' ? opts.afterConfirm : null),
      mode: 'livre'
    };
    global._discardId    = first.id;
    global._discardBoard = first.board;
    global._discardMotivo = null;
    global._discardOwner = uid;

    _configureLivreModal(cardLabel);
    var strong = _byId('discard-nome');
    if(strong) strong.textContent = cardLabel;
    document.querySelectorAll('#discard-opts .discard-opt').forEach(function(b){ b.classList.remove('sel'); });
    _bindLivreInputWatcher();
    _setConfirmEnabled(false);

    if(typeof global.closeM === 'function') global.closeM('mo-kb-det');
    if(typeof global.openM  === 'function') global.openM('mo-discard');
    return true;
  }

  /* Reconfigura o modal para modo DESCARTE quando o fluxo original
     for chamado. (Mantido igual à v1 — funcionava.) */
  if(_origOpenDiscardReasonModal){
    global._kbOpenDiscardReasonModal = function(){
      _configureDiscardModal();
      var ret = _origOpenDiscardReasonModal.apply(this, arguments);
      try{ _state().mode = 'discard'; }catch(_e){}
      return ret;
    };
  }

  if(_origSelDiscardOpt){
    global.selDiscardOpt = function(motivo, btn){
      var st = _state();
      if(st.mode !== 'livre') return _origSelDiscardOpt.apply(this, arguments);
      global._discardMotivo = motivo;
      st.reason = motivo;
      document.querySelectorAll('#discard-opts .discard-opt').forEach(function(b){ b.classList.remove('sel'); });
      if(btn) btn.classList.add('sel');
      _syncLivreConfirmState();
      if(motivo === 'outro'){
        var txt = _byId('discard-outro-txt');
        if(txt) txt.focus();
      }
    };
  }

  if(_origConfirmDiscard){
    global.confirmDiscard = function(){
      var st = _state();
      if(st.mode !== 'livre') return _origConfirmDiscard.apply(this, arguments);
      var detail = _getLivreDetail();
      var reason = _trim(st.reason || '');
      if(!reason && detail) reason = 'outro';
      if(!reason){
        if(typeof global.toast === 'function') global.toast('Selecione ou digite o motivo para mover para Lead Livre');
        return;
      }
      if(reason === 'outro' && !detail){
        if(typeof global.toast === 'function') global.toast('Digite o motivo diferente para mover para Lead Livre');
        return;
      }
      var reasonLabel = _labelForReason(reason);
      var reasonText  = (reason === 'outro') ? detail : (reasonLabel + (detail ? ' - ' + detail : ''));
      var afterConfirm = st.afterConfirm;
      if(typeof global.closeM === 'function') global.closeM('mo-discard');
      global._discardState = {items:[],reason:null,targetCol:null,afterConfirm:null,mode:null};
      global._discardMotivo = null;
      _configureDiscardModal();
      if(typeof afterConfirm === 'function'){
        try{
          afterConfirm({ reason: reason, reasonLabel: reasonLabel, reasonText: reasonText });
        }catch(err){
          _warn('afterConfirm Lead Livre falhou', err);
        }
      }
    };
  }

  /* ------------------------------------------------------------------
   * FIX A + B + C: wrapper novo de _kbMoveCard
   * ------------------------------------------------------------------ */
  if(_origMoveCardChain){
    var wrapped = function(cardId, board, uid, newCol, silent, bulk, dropIndex){
      var arr = (typeof global.getKBFor === 'function') ? (global.getKBFor(board, uid) || []) : [];
      var card = arr.find(function(x){ return x && x.id === cardId; });
      var oldCol = card && card.col;

      // Só interfere quando é ida MANUAL para 'livre' — token
      // __lfLivreValidated permite reentrada controlada.
      if(card && _isLivreTarget(board, newCol) && oldCol !== 'livre' && !global.__lfLivreValidated){
        _openLivreReasonModal({
          items:[{ id:cardId, board:board, ownerUid:uid, targetCol:newCol }],
          afterConfirm: function(payload){
            var moved;
            global.__lfLivreValidated = true;
            try{
              // FIX A: chama a CADEIA (inclui scroll-preserve
              // e bingo-sync), não a função base.
              moved = _origMoveCardChain.call(global, cardId, board, uid, newCol, true, bulk, dropIndex);
            } finally {
              global.__lfLivreValidated = false;
            }
            if(!moved) return;
            _stampLivreReason(board, uid, cardId, oldCol, payload);
            _afterLivreMoveCommon(payload, 1);
          }
        });
        // FIX B: NÃO chamamos renderKBLocal aqui. O drop/touch/etc
        // já chama renderKBLocal por conta própria logo após o
        // _kbMoveCard; como o card não mudou de coluna no cache,
        // o kanban continua no estado correto.
        return card;
      }
      return _origMoveCardChain.apply(this, arguments);
    };

    // FIX C: preserva TODAS as flags herdadas dos wrappers
    // anteriores, para que patches idempotentes futuros não
    // reinstalem em cima.
    ['__lfBingoSyncWrapped','__lf4xScrollWrapped','__lf5xWrapped','__lfConvertPrompt']
      .forEach(function(flag){
        if(_origMoveCardChain[flag]) wrapped[flag] = _origMoveCardChain[flag];
      });
    wrapped.__lfLivreReasonRequired   = true;
    wrapped.__lfLivreReasonRequiredV2 = true;

    global._kbMoveCard = wrapped;
  }

  /* ------------------------------------------------------------------
   * applyBulkMove — igual à v1, com FIX D: só limpa seleção após
   * o motivo ser confirmado; se o modal for cancelado, os cards
   * ficam selecionados para nova tentativa.
   * ------------------------------------------------------------------ */
  if(_origApplyBulkMove){
    global.applyBulkMove = function(colId){
      var selected = Array.isArray(global._bulkSelected) ? global._bulkSelected.slice() : [];
      var board0 = selected.length ? selected[0].board : null;
      if(colId === 'livre' && board0 === 'leads' && selected.length){
        if(typeof global.closeM === 'function') global.closeM('mo-bulk-move');
        _openLivreReasonModal({
          items: selected.map(function(x){ return { id:x.id, board:x.board, ownerUid:x.ownerUid, targetCol:'livre' }; }),
          afterConfirm: function(payload){
            var movedCount = 0;
            selected.forEach(function(x){
              var uid = x.ownerUid || (typeof global.activeUID === 'function' ? global.activeUID(x.board) : '');
              var arr = (typeof global.getKBFor === 'function') ? (global.getKBFor(x.board, uid) || []) : [];
              var c   = arr.find(function(q){ return q && q.id === x.id; });
              var oldCol = c && c.col;
              if(!c || oldCol === 'livre') return;
              global.__lfLivreValidated = true;
              try{
                // FIX A também no bulk: cadeia atual, não base.
                _origMoveCardChain.call(global, x.id, x.board, uid, 'livre', true, true);
              } finally {
                global.__lfLivreValidated = false;
              }
              _stampLivreReason(x.board, uid, x.id, oldCol, payload);
              movedCount++;
            });
            // FIX D: só limpa após confirmação real.
            if(typeof global.clearBulk === 'function') global.clearBulk();
            _afterLivreMoveCommon(payload, movedCount);
          }
        });
        return;
      }
      return _origApplyBulkMove.apply(this, arguments);
    };
    global.applyBulkMove.__lfLivreReasonRequired   = true;
    global.applyBulkMove.__lfLivreReasonRequiredV2 = true;
  }

  /* ------------------------------------------------------------------
   * FIX F: micro-fluidez das colunas do kanban (não destrutivo).
   * Aplica CSS containment em runtime SOMENTE se ainda não estiver
   * setado, para reduzir custo de reflow quando o quadro tem muitos
   * cards. Reobservamos com MutationObserver leve para pegar novas
   * colunas criadas pelo renderKBLocal.
   * ------------------------------------------------------------------ */
  function _applyContainment(el){
    if(!el || el.__lfLivreContained) return;
    el.__lfLivreContained = true;
    try{
      var s = el.style;
      if(!s.contain)            s.contain = 'layout style paint';
      if(!s.contentVisibility)  s.contentVisibility = 'auto';
      // dica pro navegador manter viewport ok mesmo sem render inicial
      if(!s.containIntrinsicSize) s.containIntrinsicSize = '600px';
    }catch(_e){}
  }
  function _applyContainmentAll(){
    document.querySelectorAll('.kb-cards').forEach(_applyContainment);
  }
  function _installContainmentObserver(){
    if(global.__lfLivreContainObserver) return;
    try{
      var mo = new MutationObserver(function(muts){
        for(var i=0;i<muts.length;i++){
          var m = muts[i];
          if(!m.addedNodes) continue;
          for(var j=0;j<m.addedNodes.length;j++){
            var n = m.addedNodes[j];
            if(n && n.nodeType === 1){
              if(n.classList && n.classList.contains('kb-cards')) _applyContainment(n);
              if(n.querySelectorAll){
                n.querySelectorAll('.kb-cards').forEach(_applyContainment);
              }
            }
          }
        }
      });
      mo.observe(document.body, { childList:true, subtree:true });
      global.__lfLivreContainObserver = mo;
    }catch(_e){}
  }

  _bindLivreInputWatcher();
  _configureDiscardModal();
  _applyContainmentAll();
  _installContainmentObserver();
  _log('patch v2 carregado');
})(window);
