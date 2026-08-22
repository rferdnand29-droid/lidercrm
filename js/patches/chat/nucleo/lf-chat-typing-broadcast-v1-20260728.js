/**
 * lf-chat-typing-broadcast-v1-20260728.js
 *
 * P0-4: Indicador "está digitando…" broadcast real.
 *  - Ao digitar, publica evento `typing` no canal Realtime já aberto pela conversa
 *  - Ao receber evento, mostra bolha "." + "." + "." por 3 s sem novo evento
 *
 * Carregar DEPOIS de js/chat.js + lf-chat-avatar-presence-profile-fix-20260727.js
 * Stackable (guard __LF_CHAT_TYPING_BROADCAST_V1__).
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_TYPING_BROADCAST_V1__) return;
  window.__LF_CHAT_TYPING_BROADCAST_V1__ = true;

  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function meUid(){ return (window.S && window.S.userId) || ''; }

  // Mapa de typing por uid+conv → timestamp do último keepalive
  var _othersTyping = Object.create(null);
  var _currentConvTypingShownAt = 0;
  var _currentConvTypingFromUid = '';

  function sendTypingEvent(convId){
    try{
      var sb = (window.supabase && typeof window.supabase.channel==='function') ? window.supabase : (window._supabaseClient || null);
      if(!sb || !convId) return;
      var key = 'rt-chat-'+convId;
      // Pega canal já subscrito OU cria um leve para envio (sem subscribe duplo)
      var ch = (typeof window._chatRealtimeChannels!=='undefined' && window._chatRealtimeChannels[convId]) || null;
      // Solução robusta: cria canal ad-hoc para broadcast (o server entrega para qualquer subscriber)
      var bch = sb.channel('rt-chat-ty-'+convId, { config:{ broadcast:{ self:false } } });
      bch.subscribe(function(status){
        if(status==='SUBSCRIBED'){
          bch.send({
            type: 'broadcast',
            event: 'typing',
            payload: { uid: meUid(), convId: convId, at: Date.now() }
          }).then(function(){ sb.removeChannel(bch); }).catch(function(){ sb.removeChannel(bch); });
        } else {
          sb.removeChannel(bch);
        }
      });
    }catch(_e){}
  }

  // Hook em chatOnInput: também envia broadcast
  if(typeof window.chatOnInput==='function' && !window.chatOnInput.__lfTypingWrapped){
    var _orig = window.chatOnInput;
    window.chatOnInput = function(){
      var r = _orig.apply(this, arguments);
      try{
        var convId = (typeof _chatCurrentConv!=='undefined') ? _chatCurrentConv : '';
        var t = _lastTypingSentAt[convId] || 0;
        if(Date.now()-t > 1500){ // throttla para não martelar
          _lastTypingSentAt[convId] = Date.now();
          sendTypingEvent(convId);
        }
      }catch(_e){}
      return r;
    };
    window.chatOnInput.__lfTypingWrapped = true;
  }
  var _lastTypingSentAt = Object.create(null);

  // Reage a broadcasts "typing" recebidos
  function listenTyping(){
    try{
      var sb = (window.supabase && typeof window.supabase.channel==='function') ? window.supabase : null;
      if(!sb) return;
      // Canal globalidy OU por conv
      var ch = sb.channel('rt-typing-listener', { config:{ broadcast:{ self:false } } });
      ch.on('broadcast', { event:'typing' }, function(payload){
        try{
          var p = payload && payload.payload;
          if(!p || !p.convId) return;
          if(p.uid === meUid()) return; // ignora broadcast próprio
          _othersTyping[p.convId+':'+p.uid] = Date.now();
          // Se a mensagem está na conv aberta → mostra bolha
          if(typeof _chatCurrentConv!=='undefined' && _chatCurrentConv === p.convId){
            _currentConvTypingShownAt = Date.now();
            _currentConvTypingFromUid = p.uid;
            renderTypingIndicator(p.uid);
          }
        }catch(_e){}
      }).subscribe();
    }catch(_e){}
  }

  function renderTypingIndicator(fromUid){
    var msgs = document.getElementById('chat-msgs');
    if(!msgs) return;
    var nick = '';
    try{ nick = ((typeof getUser==='function') ? getUser(fromUid) : null); nick = (nick && (nick.nome||nick.email)) || ''; }catch(_e){}
    var old = document.getElementById('chat-typing-dot');
    if(old) old.remove();
    if(!fromUid) return;
    var dot = document.createElement('div');
    dot.id = 'chat-typing-dot';
    dot.style.cssText = 'align-self:flex-start;font-size:.7rem;color:var(--mu);padding:6px 12px;display:flex;align-items:center;gap:6px';
    dot.innerHTML = '<span style="display:inline-flex;align-items:center;gap:3px">'+
      '<span style="display:inline-block;width:6px;height:6px;background:var(--amber,#c39a2d);border-radius:50%;animation:lfTyping 1.2s infinite ease-in-out"></span>'+
      '<span style="display:inline-block;width:6px;height:6px;background:var(--amber,#c39a2d);border-radius:50%;animation:lfTyping 1.2s infinite ease-in-out .2s"></span>'+
      '<span style="display:inline-block;width:6px;height:6px;background:var(--amber,#c39a2d);border-radius:50%;animation:lfTyping 1.2s infinite ease-in-out .4s"></span>'+
      '</span> '+ (nick ? '<b>'+nick.replace(/[<>]/g,'')+'</b> está digitando...' : 'Digitando...');
    msgs.appendChild(dot);
    msgs.scrollTop = msgs.scrollHeight;
    // remove indicator quando parar
    setTimeout(function(){
      var d = document.getElementById('chat-typing-dot');
      if(d) d.remove();
    }, 4000);
  }

  // Inject CSS da animação
  (function injectCSS(){
    if(document.getElementById('lf-chat-typing-css')) return;
    var s = document.createElement('style');
    s.id = 'lf-chat-typing-css';
    s.textContent = '@keyframes lfTyping{0%,80%,100%{transform:scale(.7);opacity:.4}40%{transform:scale(1);opacity:1}}';
    document.head.appendChild(s);
  })();

  // Sweep de typing expirado (a cada 2 s)
  setInterval(function(){
    try{
      var now = Date.now();
      Object.keys(_othersTyping).forEach(function(k){
        if(now - _othersTyping[k] > 4000) delete _othersTyping[k];
      });
      // se o remetente atual parou
      if(typeof _chatCurrentConv!=='undefined' && _chatCurrentConv && _currentConvTypingShownAt && (now-_currentConvTypingShownAt > 4000)){
        var dot = document.getElementById('chat-typing-dot');
        if(dot) dot.remove();
        _currentConvTypingShownAt = 0;
        _currentConvTypingFromUid = '';
      }
    }catch(_e){}
  }, 2000);

  // Inicia escuta no carregamento
  function boot(){ listenTyping(); }
  if(document.readyState==='complete'||document.readyState==='interactive'){
    setTimeout(boot, 60);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
