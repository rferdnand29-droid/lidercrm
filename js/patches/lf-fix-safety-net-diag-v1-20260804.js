/* lf-fix-safety-net-diag-v1-20260804
 * -----------------------------------------------------------------
 * OBJETIVO
 *   Enriquecer o warn "[safety-net] forçando saída da splash após 12s"
 *   com um snapshot do estado do boot no MOMENTO em que ele dispara.
 *   O warn atual só diz "forçou saída" — sem diagnóstico é impossível
 *   saber POR QUE o initDB() não terminou dentro do prazo.
 *
 * O QUE ADICIONA
 *   Grava um breadcrumb a cada marco do boot (initDB start, initDB
 *   ok, signIn ok, bootApp start, bootApp ok, splash escondida).
 *   Se o safety-net disparar, este patch loga:
 *     - último marco atingido
 *     - se supabaseClient existe
 *     - se S está preenchido
 *     - último erro capturado por window.onerror
 *     - estado de rede (navigator.onLine)
 *
 *   NÃO altera o safety-net original. Apenas observa.
 * -----------------------------------------------------------------
 */
(function(global){
  'use strict';
  if(global.__LF_FIX_SAFETYNET_DIAG_V1__) return;
  global.__LF_FIX_SAFETYNET_DIAG_V1__ = true;

  var TAG = '[lf-safetynet-diag]';
  var _t0 = Date.now();
  var _breadcrumbs = [];
  var _lastErr = null;

  function _mark(step, extra){
    _breadcrumbs.push({ step: step, dt: Date.now()-_t0, extra: extra||null });
    if(_breadcrumbs.length > 40) _breadcrumbs.shift();
  }
  _mark('patch-loaded');

  /* Captura erros de janela para saber se algo explodiu no boot. */
  var _prevErr = global.onerror;
  global.onerror = function(msg, src, line, col, err){
    /* FIX-20260901: erros de scripts injetados por extensão do navegador
       (assinatura "VM..." sem URL de arquivo — ex.: web-vitals/reportAllChanges)
       não são do CRM: registra em breadcrumb mas NÃO propaga como lastErr,
       mantendo o diagnóstico limpo de ruído externo. */
    var _src = String(src||'');
    if(/^(VM|chrome-extension:|moz-extension:|safari-web-extension:)/.test(_src) || _src===''){
      _mark('external-script-error', String(msg||'').slice(0,120));
      if(typeof _prevErr==='function'){
        try{ return _prevErr.apply(this, arguments); }catch(_e){}
      }
      return true; // suprime do console — não é nosso código
    }
    _lastErr = { msg: String(msg||''), src: _src, line: line, col: col };
    _mark('window.onerror', _lastErr.msg.slice(0,120));
    if(typeof _prevErr==='function'){
      try{ return _prevErr.apply(this, arguments); }catch(_e){}
    }
    return false;
  };
  var _prevRej = global.onunhandledrejection;
  global.onunhandledrejection = function(ev){
    try{
      var reason = ev && (ev.reason || ev.detail || ev);
      _mark('unhandled-rejection', (reason && reason.message) ? reason.message.slice(0,120) : String(reason).slice(0,120));
    }catch(_e){}
    if(typeof _prevRej==='function'){
      try{ return _prevRej.apply(this, arguments); }catch(_e){}
    }
  };

  /* Marcadores do boot. Cada wrap é leve e reversível. */
  function _wrapBoot(name, tag){
    var cur = global[name];
    if(typeof cur !== 'function') return false;
    if(cur.__lfDiagWrapped) return true;
    var wrapped = function(){
      _mark(tag+':start');
      try{
        var ret = cur.apply(this, arguments);
        if(ret && typeof ret.then==='function'){
          ret.then(function(v){ _mark(tag+':ok'); return v; },
                   function(e){ _mark(tag+':fail', e && e.message); throw e; });
        }else{
          _mark(tag+':ok');
        }
        return ret;
      }catch(err){
        _mark(tag+':throw', err && err.message);
        throw err;
      }
    };
    wrapped.__lfDiagWrapped = true;
    global[name] = wrapped;
    return true;
  }

  function _installWraps(){
    _wrapBoot('initDB','initDB');
    _wrapBoot('_lfSafeInitDB','safeInitDB');
    _wrapBoot('bootApp','bootApp');
    _wrapBoot('doLogin','doLogin');
    _wrapBoot('usarLocal','usarLocal');

    /* Se ainda não estão presentes, tenta de novo em breve. */
    var haveAny = ['initDB','_lfSafeInitDB','bootApp','doLogin','usarLocal']
                    .some(function(n){ return typeof global[n]==='function'; });
    if(!haveAny){
      _installWraps._n = (_installWraps._n||0)+1;
      if(_installWraps._n < 40){ setTimeout(_installWraps, 200); }
    }
  }

  /* Escuta a saída da splash: quando #splash sumir, marca. */
  function _watchSplash(){
    var sp = document.getElementById('splash');
    if(!sp){ setTimeout(_watchSplash, 100); return; }
    try{
      var mo = new MutationObserver(function(){
        if(sp.style.display==='none' || sp.classList.contains('hide')){
          _mark('splash-hidden');
          mo.disconnect();
        }
      });
      mo.observe(sp,{attributes:true,attributeFilter:['style','class']});
    }catch(_e){}
  }

  /* Instala um "backup" do console.warn pra detectar o warn do
     safety-net original e imprimir o diagnóstico logo em seguida. */
  var _origWarn = console.warn.bind(console);
  var _warnSeen = {};  // dedup/throttle: msgs repetidas (ex.: "autenticação pendente") não inundam o console
  console.warn = function(){
    try{
      // [FIX 20260826] Erros sintéticos do auth-gate v2 são comportamento
      // esperado (request adiada p/ manter dados locais) — não são falhas.
      // Suprimir totalmente, sem throttle, para um console limpo.
      var _s0 = String(arguments[0]);
      if(/Autenticação da nuvem ainda pendente|Sem sessão na nuvem \(deslogado\)|request adiada, mantidos dados locais|request não enviada, mantidos dados locais/.test(_s0)) return;
      var _k = String(arguments[0]);
      _warnSeen[_k] = (_warnSeen[_k]||0)+1;
      var _n = _warnSeen[_k];
      if(_n>3){
        if((_n % 50)!==0) return; // primeiras 3 + resumo a cada 50 ocorrências
        return _origWarn.apply(console, ['[throttle] (ocorrência #'+_n+')'].concat([].slice.call(arguments)));
      }
    }catch(_e){}
    try{
      var a0 = arguments[0];
      if(typeof a0==='string' && a0.indexOf('[safety-net] forçando saída da splash') === 0){
        /* FIX-20260901: se o watchdog de 10s (lf-splash-unstuck) já disparou,
           este safety-net de 12s é redundante — não loga nem diagnostica de novo. */
        if(global.__lfUnstuckFired){ return; }
        if(global.__LF_SAFETYNET_WARNED__){ return; } // dedup: 1x por sessão
        global.__LF_SAFETYNET_WARNED__ = true;
        _origWarn.apply(console, arguments);
        _origWarn(TAG, 'diagnóstico do boot:', {
          uptimeMs:       Date.now()-_t0,
          hasSupabaseSdk: !!global.supabase,
          hasSupabaseCli: !!(global.supabaseClient && typeof global.supabaseClient.channel==='function'),
          hasSession:     !!(global.S && global.S.userId),
          onLine:         (typeof navigator!=='undefined' && navigator.onLine),
          lastErr:        _lastErr,
          breadcrumbs:    _breadcrumbs.slice()
        });
        return;
      }
    }catch(_e){}
    return _origWarn.apply(console, arguments);
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){
      _installWraps();
      _watchSplash();
    });
  }else{
    _installWraps();
    _watchSplash();
  }

  global.LF_SAFETYNET_DIAG = {
    version: 'v1-20260804',
    breadcrumbs: function(){ return _breadcrumbs.slice(); },
    lastErr: function(){ return _lastErr; }
  };
})(window);
