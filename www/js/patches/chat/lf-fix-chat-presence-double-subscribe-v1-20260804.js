/* lf-fix-chat-presence-double-subscribe-v1-20260804
 * -----------------------------------------------------------------
 * SINTOMA
 *   [chat] Presence erro ao iniciar:
 *     "cannot add `presence` callbacks for realtime:chat-presence
 *      after `subscribe()`."
 *
 * CAUSA RAIZ
 *   _chatStartPresence() é chamada mais de uma vez na mesma sessão
 *   (o retry de 3s quando supabaseClient ainda não estava pronto, a
 *   reabertura do chat, o resume mobile, etc.). O guard interno
 *   `if(_chatPresenceChannel) return;` só protege contra a MESMA
 *   variável, mas o cliente Realtime do Supabase mantém uma tabela
 *   global de canais por topic ('realtime:chat-presence'). Quando
 *   o segundo channel() reaproveita esse topic já com subscribe(),
 *   o .on('presence', …) subsequente é rejeitado com aquela mensagem
 *   e o canal fica SEM os handlers sync/join/leave — a bolinha de
 *   "online" nunca aparece.
 *
 * FIX (aditivo, sem tocar em chat.js)
 *   Antes de _chatStartPresence rodar, sanitiza o Realtime:
 *     1) remove qualquer canal preexistente com topic
 *        'realtime:chat-presence' (via getChannels/removeChannel).
 *     2) instala um lock (_lfPresenceStarting) para reentradas
 *        síncronas do retry de heartbeat/visibilitychange.
 *     3) monkey-patch em window._chatStartPresence: só a versão
 *        original roda depois da limpeza.
 *   NÃO altera comportamento quando não há canal duplicado.
 * -----------------------------------------------------------------
 */
(function(global){
  'use strict';
  if(global.__LF_FIX_CHAT_PRESENCE_DOUBLE_V1__) return;
  global.__LF_FIX_CHAT_PRESENCE_DOUBLE_V1__ = true;

  var TAG = '[lf-fix-chat-presence]';
  var TOPIC = 'realtime:chat-presence';
  var _lock = false;

  function _log(){ try{ console.debug.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_){} }
  function _warn(){ try{ console.warn.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_){} }

  function _sbClient(){
    if(global.supabaseClient && typeof global.supabaseClient.channel==='function') return global.supabaseClient;
    if(global.supabase       && typeof global.supabase.channel      ==='function') return global.supabase;
    return null;
  }

  /* Remove todo channel Realtime cujo topic seja 'realtime:chat-presence'.
     É seguro chamar em qualquer momento — se não houver canal, é no-op. */
  function _purgeExistingPresenceChannels(){
    var sb = _sbClient();
    if(!sb || typeof sb.getChannels!=='function' || typeof sb.removeChannel!=='function') return 0;
    var removed = 0;
    try{
      var chans = sb.getChannels() || [];
      for(var i=0;i<chans.length;i++){
        var c = chans[i];
        if(!c) continue;
        var topic = c.topic || (c._topic) || '';
        if(topic === TOPIC){
          try{ sb.removeChannel(c); removed++; }catch(_e){}
        }
      }
    }catch(_e){}
    if(removed) _log('removidos', removed, 'canais duplicados de', TOPIC);
    /* Também limpa a variável interna do chat.js, caso exista. */
    try{ if('_chatPresenceChannel' in global) global._chatPresenceChannel = null; }catch(_e){}
    return removed;
  }

  function _wrap(){
    if(typeof global._chatStartPresence !== 'function'){
      /* chat.js ainda não carregou — tenta de novo em breve */
      _wrap._n = (_wrap._n||0)+1;
      if(_wrap._n < 60){ setTimeout(_wrap, 250); return; }
      _warn('_chatStartPresence não apareceu no window após 15s — patch não aplicado');
      return;
    }
    if(global._chatStartPresence.__lfPresenceWrapped) return;

    var orig = global._chatStartPresence;
    var wrapped = function(){
      if(_lock){
        _log('reentrada bloqueada (lock ativo)');
        return;
      }
      _lock = true;
      try{
        _purgeExistingPresenceChannels();
        return orig.apply(this, arguments);
      }catch(err){
        _warn('erro ao iniciar presence (após purge):', err && err.message || err);
      }finally{
        /* libera o lock rapidamente — o subscribe() é assíncrono e não
           deve segurar chamadas legítimas subsequentes por muito tempo. */
        setTimeout(function(){ _lock = false; }, 500);
      }
    };
    wrapped.__lfPresenceWrapped = true;
    global._chatStartPresence = wrapped;
    _log('wrapper instalado em _chatStartPresence');
  }

  /* Também intercepta _chatStopPresence pra garantir que ao parar
     nós purguemos QUALQUER duplicata que tenha sobrado. */
  function _wrapStop(){
    if(typeof global._chatStopPresence !== 'function') return;
    if(global._chatStopPresence.__lfPresenceWrapped) return;
    var orig = global._chatStopPresence;
    var wrapped = function(){
      try{ return orig.apply(this, arguments); }
      finally{
        try{ _purgeExistingPresenceChannels(); }catch(_e){}
      }
    };
    wrapped.__lfPresenceWrapped = true;
    global._chatStopPresence = wrapped;
    _log('wrapper instalado em _chatStopPresence');
  }

  function _install(){
    _wrap();
    _wrapStop();
    /* API pública para debug / uso pelo próximo patch */
    global.LF_FIX_CHAT_PRESENCE = {
      version: 'v1-20260804',
      purge:   _purgeExistingPresenceChannels,
      isLocked: function(){ return _lock; }
    };
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', _install);
  }else{
    _install();
  }
})(window);
