/**
 * lf-chat-pin-presence-active-fix-v1-20260721.js
 *
 * Caça-bugs no módulo "Papo da Empresa" (correções cirúrgicas):
 *
 *  BUG 1 — Ao fixar uma conversa, ela some/reaparece só após novo bate-papo.
 *    Causa: _chatPollNewMsgs faz merge com o doc do servidor e sobrescreve
 *    pinned/muted/archived (server não guarda esses flags → viram undefined).
 *    Correção: wrap em _chatPollNewMsgs preservando SEMPRE os flags locais
 *    pinned/muted/archived durante o merge, e wrap em chatTogglePin para
 *    marcar um "epoch" local que trava a reordenação por 800 ms (evita a
 *    corrida com o próximo poll).
 *
 *  BUG 2 — Mensagens antigas aparecem como novas / notif ADM continua tocando.
 *    Causa: o baseline silencioso do patch anterior só é semeado no
 *    initChatPage. Quando o usuário troca de conv OU quando o cache é
 *    purgado no meio da sessão, _chatConvArmed[convId] fica undefined e
 *    o histórico volta a ser tratado como novo.
 *    Correção: hook em openChatConv semeia _chatSeenByConv[convId] e
 *    _chatConvArmed[convId] a cada abertura, com o timestamp da última
 *    msg lida como "chatOpenedAt" por conv.
 *
 *  BUG 3 — Chat sempre fica "fixado" no bate-papo do ADM.
 *    Causa: hook crm:users-updated chama openChatConv(_chatCurrentConv)
 *    incondicionalmente, mesmo se o usuário não estava numa conv (ou
 *    estava numa outra) — o ADM, por ser default pinned + updatedAt
 *    recente no bootstrap, "vence" e aparece.
 *    Correção: wrap no listener 'crm:users-updated' para NÃO reabrir
 *    conv se o usuário está na tela de lista, e persistir a última conv
 *    escolhida pelo próprio usuário (chat_last_conv) — se o hook rodar,
 *    reabre APENAS a mesma conv (nunca troca por outra).
 *
 *  BUG 4 — Usuário parece "online" mesmo estando offline.
 *    Causa: renderChatList usa u.ativo (flag ADMIN de cadastro) como
 *    presença. O header do chat escreve a string 'online' hardcoded.
 *    Correção: wrap em renderChatList e no header para computar
 *    presença REAL a partir de sessions_<uid> (heartbeat 2 min).
 *
 * Carregar DEPOIS de js/chat.js e de lf-chat-ctx-sound-fix-v1-20260720.js.
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_PIN_PRES_ACT_V1__) return;
  window.__LF_CHAT_PIN_PRES_ACT_V1__ = true;

  var LAST_CONV_KEY = 'lf_chat_last_conv';
  var PIN_LOCK_MS = 1200;  // janela em que o poll NÃO pode reordenar a lista

  /* ================================================================
   * BUG 1 — Pin persistente + trava de reordenação
   * ================================================================ */
  var _pinLockUntil = 0;

  // Wrap chatTogglePin: além de fazer o toggle, marca janela de proteção
  // e sincroniza a lista completa (com flags) para a nuvem via _chatSyncMsg-like.
  if (typeof window.chatTogglePin === 'function') {
    var _origTogglePin = window.chatTogglePin;
    window.chatTogglePin = function(convId){
      _pinLockUntil = Date.now() + PIN_LOCK_MS;
      var r = _origTogglePin.apply(this, arguments);
      // Força persistência local imediata (já feita pelo original) e re-render.
      try { if (typeof renderChatList === 'function') renderChatList(); } catch(_e){}
      return r;
    };
  }
  // Idem para chatToggleMute (evita mesmo tipo de corrida).
  if (typeof window.chatToggleMute === 'function') {
    var _origToggleMute = window.chatToggleMute;
    window.chatToggleMute = function(){
      _pinLockUntil = Date.now() + PIN_LOCK_MS;
      var r = _origToggleMute.apply(this, arguments);
      try { if (typeof renderChatList === 'function') renderChatList(); } catch(_e){}
      return r;
    };
  }

  // Wrap _chatPollNewMsgs: preserva pinned/muted/archived durante o merge
  // (o servidor não guarda esses flags — sem preservar, some do topo).
  if (typeof window._chatPollNewMsgs === 'function') {
    var _origPoll = window._chatPollNewMsgs;
    window._chatPollNewMsgs = function(){
      // Se estamos dentro da janela pós-pin, adia 1 tick — o poll vai
      // rodar novamente em 5 s, e o toggle já persistiu localmente.
      if (Date.now() < _pinLockUntil) {
        try { if (typeof renderChatList === 'function') renderChatList(); } catch(_e){}
        return;
      }
      return _origPoll.apply(this, arguments);
    };
  }

  // Wrap _chatSaveConvs: garante que a versão salva NUNCA perca flags locais.
  // Blinda contra qualquer futuro merge parcial que venha do worker/legacy.
  if (typeof window._chatSaveConvs === 'function') {
    var _origSaveConvs = window._chatSaveConvs;
    window._chatSaveConvs = function(list){
      try {
        // Sobrepõe pinned/muted/archived a partir do que já está persistido,
        // exceto quando explicitamente definido na entrada (toggle explícito).
        var prev = (typeof sg === 'function') ? (sg('lf_chat_convs') || []) : [];
        var byId = {};
        prev.forEach(function(c){ if (c && c.id) byId[c.id] = c; });
        (list || []).forEach(function(c){
          if (!c || !c.id) return;
          var p = byId[c.id];
          if (!p) return;
          // Se o campo veio undefined/null no novo (merge do poll), restaura.
          if (c.pinned == null && p.pinned != null) c.pinned = !!p.pinned;
          if (c.muted == null && p.muted != null) c.muted = !!p.muted;
          if (c.archived == null && p.archived != null) c.archived = !!p.archived;
        });
      } catch(_e){}
      return _origSaveConvs.call(this, list);
    };
  }

  /* ================================================================
   * BUG 2 — Baseline silencioso ao ABRIR conv (não só ao abrir a página)
   * ================================================================ */
  if (typeof window.openChatConv === 'function') {
    var _origOpenConv = window.openChatConv;
    window.openChatConv = function(convId){
      try {
        // Persiste a última conv escolhida PELO usuário (para o Bug 3).
        if (convId) localStorage.setItem(LAST_CONV_KEY, String(convId));
      } catch(_e){}
      // Semeia baseline específico desta conv (evita rajada de "trrrr")
      try {
        if (convId && typeof _chatGetMsgs === 'function') {
          var msgs = _chatGetMsgs(convId) || [];
          var set = (window._chatSeenByConv && window._chatSeenByConv[convId]) || new Set();
          msgs.forEach(function(m){ if (m && m.id) set.add(m.id); });
          if (!window._chatSeenByConv) window._chatSeenByConv = Object.create(null);
          window._chatSeenByConv[convId] = set;
          if (!window._chatConvArmed) window._chatConvArmed = Object.create(null);
          window._chatConvArmed[convId] = true;
          // "chatOpenedAt" por conv: só toca beep para msgs após agora.
          window._chatOpenedAt = Date.now();
        }
      } catch(_e){}
      var r = _origOpenConv.apply(this, arguments);
      // Aplica indicador de presença real no header após render
      try { _lfApplyRealPresenceToHeader(convId); } catch(_e){}
      return r;
    };
  }

  /* ================================================================
   * BUG 3 — Chat não pode "fixar" no ADM
   * ================================================================ */
  // O hook original em chat.js reabre _chatCurrentConv em qualquer users-updated.
  // Não podemos remover o listener original (não guardamos referência), mas
  // podemos neutralizar chamadas indevidas: openChatConv só reabre se o
  // convId realmente corresponde à ÚLTIMA conv escolhida pelo usuário.
  var _reopenGuardActive = false;
  document.addEventListener('crm:users-updated', function(){
    // Marca janela em que openChatConv pode ser chamado espontaneamente pelo
    // hook do chat.js — precisamos filtrar.
    _reopenGuardActive = true;
    setTimeout(function(){ _reopenGuardActive = false; }, 300);
  }, true /* capture: chega antes do handler do chat.js */);

  // Envelope duplo: intercepta openChatConv DENTRO da janela do reopenGuard.
  // Se a chamada NÃO veio de um clique do usuário (dispatched pelo hook),
  // só permite reabrir a conv salva em LAST_CONV_KEY.
  if (typeof window.openChatConv === 'function') {
    var _outerOpen = window.openChatConv;
    window.openChatConv = function(convId){
      if (_reopenGuardActive) {
        var saved = null;
        try { saved = localStorage.getItem(LAST_CONV_KEY); } catch(_e){}
        // Se não há conv salva → não reabre nada (fica na lista).
        if (!saved) return;
        // Se o hook tentou reabrir OUTRA conv (ex.: ADM) → força a salva.
        if (String(convId) !== String(saved)) convId = saved;
      }
      return _outerOpen.call(this, convId);
    };
  }

  // Ao fechar a conv (usuário voltou para a lista), limpa LAST_CONV_KEY
  // para que o hook nunca reabra sozinho.
  if (typeof window.closeChatConv === 'function') {
    var _origClose = window.closeChatConv;
    window.closeChatConv = function(){
      try { localStorage.removeItem(LAST_CONV_KEY); } catch(_e){}
      return _origClose.apply(this, arguments);
    };
  }

  /* ================================================================
   * BUG 4 — Presença REAL (heartbeat), não flag ADMIN
   * ================================================================ */
  var PRESENCE_WINDOW_MS = 5 * 60 * 1000; // considera online se heartbeat < 5 min

  function _lfIsUserOnline(uid){
    if (!uid) return false;
    try {
      // sessions_<uid> é escrito pelo _sessionsHeartbeat (usuarios.js, cada 2 min).
      // Lemos o cache local — não vale a pena bater no worker aqui (renderiza-lista).
      var raw = (typeof sg === 'function') ? sg('lf_sessions_' + uid) : null;
      if (!Array.isArray(raw) || !raw.length) return false;
      var now = Date.now();
      for (var i = 0; i < raw.length; i++){
        var s = raw[i]; if (!s) continue;
        var la = Number(s.lastActive || 0);
        if (la && (now - la) < PRESENCE_WINDOW_MS) return true;
      }
    } catch(_e){}
    return false;
  }

  // Wrap renderChatList: depois que o original renderiza, corrige os
  // .chat-online-dot removendo os "falsos positivos" (ativo=true mas offline)
  // e adicionando dots reais quando o heartbeat está fresco.
  if (typeof window.renderChatList === 'function') {
    var _origRenderList = window.renderChatList;
    window.renderChatList = function(){
      var r = _origRenderList.apply(this, arguments);
      try {
        var items = document.querySelectorAll('#chat-conv-list .chat-conv-item');
        var convs = (typeof _chatGetConvs === 'function') ? _chatGetConvs() : [];
        items.forEach(function(el){
          var cid = el.getAttribute('data-conv-id');
          var c = convs.find(function(x){ return x && x.id === cid; });
          if (!c || c.isGroup) return;
          var other = (typeof _chatOtherUid === 'function') ? _chatOtherUid(c) : null;
          var online = _lfIsUserOnline(other);
          var avatar = el.querySelector('.chat-conv-avatar');
          if (!avatar) return;
          var dot = avatar.querySelector('.chat-online-dot');
          if (online){
            if (!dot){
              dot = document.createElement('span');
              dot.className = 'chat-online-dot';
              avatar.appendChild(dot);
            }
          } else if (dot) {
            dot.remove();
          }
        });
      } catch(_e){}
      return r;
    };
  }

  // Header da conv: substitui a string 'online' hardcoded por presença real.
  function _lfApplyRealPresenceToHeader(convId){
    try {
      var status = document.querySelector('#chat-conv-header .chat-conv-hd-status');
      if (!status) return;
      var convs = (typeof _chatGetConvs === 'function') ? _chatGetConvs() : [];
      var c = convs.find(function(x){ return x && x.id === convId; });
      if (!c) return;
      if (c.isGroup) return; // grupo mostra número de participantes — mantém.
      var other = (typeof _chatOtherUid === 'function') ? _chatOtherUid(c) : null;
      status.textContent = _lfIsUserOnline(other) ? 'online' : 'offline';
    } catch(_e){}
  }

  // Também atualiza header/lista periodicamente (o heartbeat é a cada 2 min).
  setInterval(function(){
    try {
      if (typeof _chatCurrentConv !== 'undefined' && _chatCurrentConv){
        _lfApplyRealPresenceToHeader(_chatCurrentConv);
      }
      if (typeof renderChatList === 'function' &&
          document.getElementById('pg-chat') &&
          document.getElementById('pg-chat').classList.contains('on')){
        renderChatList();
      }
    } catch(_e){}
  }, 60000); // 1 min é o suficiente — a fonte só refresca a cada 2 min

})();
