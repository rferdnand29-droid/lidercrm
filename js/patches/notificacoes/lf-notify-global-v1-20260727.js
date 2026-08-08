/**
 * lf-notify-global-v1-20260727.js
 *
 * Correção da auditoria: notificações do "Papo da Empresa" e da inbox
 * interna só disparavam quando o usuário estava DENTRO da página do chat.
 *
 * O que este patch faz (todos os pontos são não-invasivos):
 *   A) Sobe um "serviço global de notificações" no boot da sessão:
 *      - reaproveita _chatPollNewMsgs a cada 5s enquanto o app estiver
 *        visível, mesmo fora de #pg-chat;
 *      - assina Supabase Realtime de fs_documents para chat_conv_* e
 *        para notifications/<uid> — dispara pull imediato.
 *   B) Reduz o intervalo da inbox de 60s -> 15s (fallback para quando
 *      Realtime não está disponível).
 *   C) Pede Notification.permission de forma ancorada no primeiro clique
 *      real do usuário (respeita a policy do Chrome/Safari).
 *   D) "Desbloqueia" o AudioContext no primeiro gesto, para o beep tocar
 *      mesmo se a página do Papo nunca foi aberta na sessão.
 *
 * Sem backend novo. Sem migration. Sem SW ainda (esse é P1).
 */
(function(){
  'use strict';
  if (window.__LF_NOTIFY_GLOBAL_V1__) return;
  window.__LF_NOTIFY_GLOBAL_V1__ = true;

  var GLOBAL_CHAT_POLL_MS   = 5000;   // fora do Papo, ainda puxa a cada 5s
  var GLOBAL_INBOX_POLL_MS  = 15000;  // era 60s
  var _globalChatTimer  = null;
  var _globalInboxTimer = null;
  var _globalRTChan     = {};         // convId -> channel
  var _globalNtfChan    = null;

  function _hasSession(){ return !!(window.S && window.S.userId); }
  function _visible(){ return document.visibilityState === 'visible'; }

  /* ─────────── A1) Poll global do chat, independe de #pg-chat ─────────── */
  function startGlobalChatPoll(){
    if (_globalChatTimer) return;
    if (!_hasSession()) return;
    _globalChatTimer = setInterval(function(){
      if (!_visible()) return;
      try {
        if (typeof _chatPollNewMsgs === 'function') _chatPollNewMsgs();
      } catch(_e){}
    }, GLOBAL_CHAT_POLL_MS);
  }
  function stopGlobalChatPoll(){
    if (_globalChatTimer){ clearInterval(_globalChatTimer); _globalChatTimer = null; }
  }

  /* ─────────── A2) Realtime global para todas as convs em cache ─────────── */
  function _sb(){
    return (window.supabase && typeof window.supabase.channel === 'function')
           ? window.supabase
           : (window._supabaseClient || null);
  }
  function subscribeAllConvs(){
    var sb = _sb(); if (!sb) return;
    if (typeof _chatGetConvs !== 'function') return;
    var convs = _chatGetConvs() || [];
    convs.forEach(function(c){
      if (!c || !c.id || _globalRTChan[c.id]) return;
      try {
        var docKey = 'chat_conv_' + c.id;
        var ch = sb.channel('lf-global-chat-'+c.id)
          .on('postgres_changes',
              { event:'*', schema:'public', table:'fs_documents', filter:'path=eq.'+docKey },
              function(){ try{ _chatPollNewMsgs(); }catch(_e){} })
          .subscribe();
        _globalRTChan[c.id] = ch;
      } catch(_e){}
    });
  }
  function unsubscribeAllConvs(){
    var sb = _sb();
    Object.keys(_globalRTChan).forEach(function(id){
      try { if (sb && sb.removeChannel) sb.removeChannel(_globalRTChan[id]); } catch(_e){}
      delete _globalRTChan[id];
    });
  }

  /* ─────────── B) Inbox interna: 60s -> 15s + Realtime ─────────── */
  function startInboxPoll(){
    if (_globalInboxTimer) return;
    if (typeof loadNotifsRemote !== 'function') return;
    // Cancela o timer legado de 60s se existir
    try { if (window._ntfInterval) { clearInterval(window._ntfInterval); window._ntfInterval = null; } } catch(_e){}
    _globalInboxTimer = setInterval(function(){
      if (!_visible() || !_hasSession()) return;
      loadNotifsRemote(function(){
        try { if (typeof updateNotifBadge === 'function') updateNotifBadge(); } catch(_e){}
        try {
          var pnl = document.getElementById('ntf-panel');
          if (pnl && pnl.classList.contains('open') && typeof renderNotifPanel === 'function') {
            renderNotifPanel(getNotifs(S.userId));
          }
        } catch(_e){}
      });
    }, GLOBAL_INBOX_POLL_MS);
  }
  function stopInboxPoll(){
    if (_globalInboxTimer){ clearInterval(_globalInboxTimer); _globalInboxTimer = null; }
  }
  function subscribeInboxRT(){
    var sb = _sb(); if (!sb || _globalNtfChan || !_hasSession()) return;
    try {
      var docKey = 'notifications/' + S.userId;
      _globalNtfChan = sb.channel('lf-global-ntf-'+S.userId)
        .on('postgres_changes',
            { event:'*', schema:'public', table:'fs_documents', filter:'path=eq.'+docKey },
            function(){ try { loadNotifsRemote(function(){ updateNotifBadge && updateNotifBadge(); }); } catch(_e){} })
        .subscribe();
    } catch(_e){}
  }
  function unsubscribeInboxRT(){
    var sb = _sb();
    if (_globalNtfChan){
      try { if (sb && sb.removeChannel) sb.removeChannel(_globalNtfChan); } catch(_e){}
      _globalNtfChan = null;
    }
  }

  /* ─────────── C) Notification.permission ancorada em gesto ─────────── */
  function askPermissionOnce(){
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'default') return; // já granted OU denied
      var handler = function(){
        document.removeEventListener('click', handler, true);
        try { Notification.requestPermission(); } catch(_e){}
      };
      document.addEventListener('click', handler, true);
    } catch(_e){}
  }

  /* ─────────── D) Unlock do AudioContext no primeiro gesto ─────────── */
  function unlockAudioOnce(){
    var once = function(){
      document.removeEventListener('click', once, true);
      document.removeEventListener('touchstart', once, true);
      try {
        // força a criação/resume do contexto usado por _playNotifSound
        if (typeof _playNotifSound === 'function') {
          var wasSuppressed = window.LF_CHAT_CTX_SOUND_FIX
                            && window.LF_CHAT_CTX_SOUND_FIX.isSuppressed
                            && window.LF_CHAT_CTX_SOUND_FIX.isSuppressed();
          if (!wasSuppressed) {
            // toca em volume zero só pra destravar
            var ctx = window._notifAudioCtx;
            if (ctx && ctx.state === 'suspended') ctx.resume();
          }
        }
      } catch(_e){}
    };
    document.addEventListener('click', once, true);
    document.addEventListener('touchstart', once, true);
  }

  /* ─────────── Ciclo de vida ─────────── */
  function bootWhenReady(){
    if (!_hasSession()) return setTimeout(bootWhenReady, 500);
    startGlobalChatPoll();
    startInboxPoll();
    subscribeAllConvs();
    subscribeInboxRT();
    askPermissionOnce();
    unlockAudioOnce();
  }

  document.addEventListener('visibilitychange', function(){
    if (_visible()){
      startGlobalChatPoll();
      startInboxPoll();
      subscribeAllConvs();
      subscribeInboxRT();
    } else {
      // mantém RT (WS é preservado pelo browser em background),
      // mas para os polls pra não queimar bateria
      stopGlobalChatPoll();
      stopInboxPoll();
    }
  }, { passive:true });

  window.addEventListener('beforeunload', function(){
    stopGlobalChatPoll();
    stopInboxPoll();
    unsubscribeAllConvs();
    unsubscribeInboxRT();
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(bootWhenReady, 0);
  } else {
    document.addEventListener('DOMContentLoaded', bootWhenReady);
  }

  window.LF_NOTIFY_GLOBAL = {
    version: 'v1-20260727',
    forcePoll: function(){ try { _chatPollNewMsgs(); loadNotifsRemote(function(){ updateNotifBadge && updateNotifBadge(); }); } catch(_e){} },
    channels: function(){ return { chat: Object.keys(_globalRTChan).length, ntf: !!_globalNtfChan }; }
  };
})();
