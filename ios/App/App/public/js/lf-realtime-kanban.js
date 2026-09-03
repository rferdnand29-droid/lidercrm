/* =====================================================================
 * js/lf-realtime-kanban.js
 * -----------------------------------------------------------------------
 * Tempo real, Fase 1 (2026-09-26) — implementa o lado cliente da Rota A
 * descrita em PLANO-TECNICO-TEMPO-REAL-LIDERCRM.md: conecta a
 * GET /api/v1/kanban/stream (Server-Sent Events) e, ao receber aviso de
 * mudança, dispara IMEDIATAMENTE a MESMA função de sincronização que já
 * existe (_syncKBRemoteBG) — sem duplicar nenhuma lógica de merge.
 *
 * PURAMENTE ADITIVO: a sondagem de 15s em js/app.js (window.
 * __lfKanbanPollInstalled) continua exatamente como está, sem nenhuma
 * mudança — funciona como reserva se o streaming falhar, reconectar
 * lento, ou não estiver disponível (WebView antiga, rede restritiva).
 * Se este arquivo falhar ao carregar ou EventSource não existir no
 * navegador, o app continua funcionando exatamente como hoje.
 *
 * ESCOPO DESTA FASE 1 (limitação conhecida, documentada no plano
 * técnico): o servidor só observa os boards do PRÓPRIO usuário
 * conectado — não é regressão pra quem depende de ver board de outra
 * pessoa (ex.: admin auditando), que continua com a sondagem de 15s
 * de sempre.
 * =====================================================================*/
(function(global){
  'use strict';
  if(global.__LF_REALTIME_KANBAN_INSTALLED__)return;
  global.__LF_REALTIME_KANBAN_INSTALLED__=true;

  if(typeof global.EventSource!=='function')return; // navegador sem suporte — sondagem de 15s cobre

  var TOKEN_KEY='lidercrm_worker_jwt_v1';
  var _es=null;
  var _currentToken=null;

  function _readToken(){
    try{
      var raw=localStorage.getItem(TOKEN_KEY);
      if(!raw)return null;
      var parsed=JSON.parse(raw);
      return (parsed&&parsed.token)||null;
    }catch(_e){return null;}
  }

  function _apiBase(){
    // Mesma resolução de URL usada pelo resto da API (ver js/api.js,
    // _lfNativeApiBase, agora exposta globalmente) — relativa na web
    // normal (funciona em qualquer ambiente, inclusive teste/preview),
    // absoluta só no Capacitor (onde é realmente necessário).
    try{
      if(typeof global._lfNativeApiBase==='function')return global._lfNativeApiBase();
    }catch(_e){}
    return '';
  }

  function _disconnect(){
    if(_es){try{_es.close();}catch(_e){} _es=null;}
  }

  function _handleChanged(ev){
    try{
      var data=JSON.parse(ev.data||'{}');
      var boards=Array.isArray(data.boards)?data.boards:[];
      boards.forEach(function(board){
        var pg=document.getElementById('pg-'+board);
        if(pg&&pg.classList.contains('on')&&typeof global._syncKBRemoteBG==='function'){
          global._syncKBRemoteBG(board);
        }
      });
    }catch(_e){}
  }

  function _handleActivitiesChanged(){
    try{
      if(window.S&&window.S.userId&&window.LF&&typeof window.LF.fetchAndCacheActivities==='function'){
        window.LF.fetchAndCacheActivities(window.S.userId).catch(function(_e){});
      }
    }catch(_e){}
  }

  function _handleNotificationsChanged(){
    try{
      if(typeof global.loadNotifsRemote==='function'){
        global.loadNotifsRemote(function(){
          try{if(typeof global.updateNotifBadge==='function')global.updateNotifBadge();}catch(_e){}
        });
      }
    }catch(_e){}
  }

  var _syncConfig=(global.LiderCRM&&global.LiderCRM.config&&global.LiderCRM.config.sync)||{};
  var _RETRY_DELAY_MIN_MS=Number(_syncConfig.realtimeRetryMinMs)||10000;
  var _RETRY_DELAY_MAX_MS=Number(_syncConfig.realtimeRetryMaxMs)||60000;
  var _retryDelayMs=_RETRY_DELAY_MIN_MS; // [FIX 20261012] backoff exponencial
  var _retryTimer=null;

  function _scheduleReconnect(){
    if(_retryTimer)clearTimeout(_retryTimer);
    _retryTimer=setTimeout(function(){ _connect(); _scheduleReconnect(); },_retryDelayMs);
  }

  function _connect(){
    if(document.hidden)return; // mesma regra da sondagem de 15s — não gasta recurso com aba oculta
    var token=_readToken();
    if(!token)return; // não logado ainda
    if(_es&&_currentToken===token)return; // já conectado com o mesmo token, nada a fazer
    _disconnect();
    _currentToken=token;
    try{
      var url=_apiBase()+'/api/v1/kanban/stream?token='+encodeURIComponent(token);
      _es=new EventSource(url);
      _es.addEventListener('changed',_handleChanged);
      _es.addEventListener('activities-changed',_handleActivitiesChanged);
      _es.addEventListener('notifications-changed',_handleNotificationsChanged);
      // [FIX 20261012] conexão abriu com sucesso — reseta o backoff pro
      // valor mínimo E reagenda na hora (mesmo raciocínio do onerror
      // abaixo — sem isso, o temporizador pendente, criado com o atraso
      // ainda alto de antes do reset, continuaria valendo até o ciclo
      // seguinte).
      _es.onopen=function(){ _retryDelayMs=_RETRY_DELAY_MIN_MS; _scheduleReconnect(); };
      _es.onerror=function(){
        // EventSource já reconecta sozinho por padrão — só limpa a
        // referência se o navegador desistir de vez (readyState CLOSED).
        if(_es&&_es.readyState===2){
          _disconnect();
          // [FIX 20261012] backoff exponencial — dobra o atraso da
          // próxima tentativa (até o teto de 60s), evitando reconectar
          // repetidamente em intervalo curto quando a rede está
          // genuinamente instável por um tempo. Reagenda NA HORA — sem
          // isso, o temporizador já pendente (criado com o atraso
          // ANTERIOR, menor) dispararia de qualquer forma no horário
          // antigo, e o backoff só valeria a partir do ciclo seguinte.
          _retryDelayMs=Math.min(_retryDelayMs*2,_RETRY_DELAY_MAX_MS);
          _scheduleReconnect();
        }
      };
    }catch(_e){
      // Qualquer falha ao conectar — silenciosa, a sondagem de 15s
      // continua cobrindo normalmente.
    }
  }

  document.addEventListener('visibilitychange',function(){
    if(document.hidden)_disconnect();
    else _connect();
  });

  // Tenta conectar já no boot, e de novo periodicamente com backoff
  // (ver _scheduleReconnect) — cobre o caso de login acontecer depois
  // deste arquivo já ter carregado, ou o token mudar por refresh.
  _scheduleReconnect();
  setTimeout(_connect,2000);

})(window);
