/* lf-fix-lead-refresh-retornar-v1-20260803 | auto-refresh da lista de leads ao Retornar */
(function(global){
  'use strict';
  if(global.__LF_FIX_LEAD_REFRESH_RETORNAR_V1__)return;
  global.__LF_FIX_LEAD_REFRESH_RETORNAR_V1__=true;

  var TAG='[lf-fix-lead-refresh]';
  var LS_STALE_KEY='lf_leads_cache_stale_v1';
  var _fetchTimer=null;
  var _lastFetchAt=0;
  var MIN_FETCH_INTERVAL=300; /* ms debounce */

  function _log(){try{if(global.console&&console.debug)console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{if(global.console&&console.warn)console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _uid(){ return (global.S && global.S.userId) || null; }

  function _wc(){
    var root=global.LiderCRM;
    return (root && root.api && root.api.workerClient) || global.workerClient || null;
  }

  function _setStale(v){
    try{ localStorage.setItem(LS_STALE_KEY, v?'1':'0'); }catch(_e){}
  }
  function _isStale(){
    try{ return localStorage.getItem(LS_STALE_KEY)==='1'; }catch(_e){ return true; }
  }

  function _tryRefreshLeads(){
    var fn=null;
    /* FIX 2026-08-04: inclui os nomes REAIS do build atual — o refactor
       encapsulou as funções em módulos, então 'fetchLeads' etc. não existem
       em window. O alias global window.fetchLeads agora é criado por
       js/patches/lf-bootstrap-fn-aliases-v1-20260804.js (aponta para
       _syncKBRemoteBG+renderKB), e os nomes reais internos entram na lista
       como fallback direto. */
    var names=['fetchLeads','loadLeads','_loadLeads','refreshLeads',
               '_fetchLeads','pullLeads','_pullLeads','syncLeads',
               '_syncLeads','loadLeadList','_loadLeadList',
               'renderLeads','_renderLeads','renderLeadList',
               'renderKB','renderKBLocal','_syncKBRemoteBG',
               'refreshKBAffected','loadCli'];
    for(var i=0;i<names.length;i++){
      if(typeof global[names[i]]==='function'){
        fn=global[names[i]];
        break;
      }
    }
    if(!fn){
      _warn('nenhuma função de fetch/render de leads encontrada no window');
      return false;
    }
    _log('disparando refresh via', names[i]);
    try{
      var ret=fn.call(global);
      if(ret && typeof ret.then==='function'){
        ret.then(function(){
          _setStale(false);
          _lastFetchAt=Date.now();
          _log('refresh de leads concluído (async)');
        }).catch(function(err){
          _warn('refresh de leads falhou (async)', err);
        });
      }else{
        _setStale(false);
        _lastFetchAt=Date.now();
      }
    }catch(err){
      _warn('refresh de leads throw', err);
      return false;
    }
    setTimeout(function(){
      var rf=['renderLeads','_renderLeads','renderLeadList','_renderLeadList',
              'renderLeadsList','_renderLeadsList'];
      for(var j=0;j<rf.length;j++){
        if(typeof global[rf[j]]==='function'){
          try{ global[rf[j]].call(global); }catch(_e){}
          break;
        }
      }
    },50);
    return true;
  }

  function _debouncedRefresh(){
    var now=Date.now();
    if(now-_lastFetchAt < MIN_FETCH_INTERVAL){
      _log('debounce: refresh ignorado (muito cedo)');
      return;
    }
    if(_fetchTimer){ clearTimeout(_fetchTimer); }
    _fetchTimer=setTimeout(function(){
      _fetchTimer=null;
      _tryRefreshLeads();
    },MIN_FETCH_INTERVAL);
  }

  function _isLeadsViewActive(){
    var el=document.querySelector(
      '[data-view="leads"], [data-page="leads"], .view-leads, '+
      '#leads-view, #view-leads, [data-route="leads"], '+
      '[data-screen="leads"], .page-leads, #page-leads'
    );
    if(!el) return false;
    var style=window.getComputedStyle(el);
    return style.display!=='none' && style.visibility!=='hidden';
  }

  function _wrapNavFunction(fname){
    if(typeof global[fname]!=='function')return false;
    if(global[fname].__lfLeadRefreshWrapped)return true;
    var orig=global[fname];
    var wrapped=function(){
      var ret=orig.apply(this,arguments);
      setTimeout(function(){
        if(_isLeadsViewActive()){
          _log('navegação retornou para view de leads');
          if(_isStale()){
            _log('cache stale detectado — forçando refresh');
            _debouncedRefresh();
          }else{
            _debouncedRefresh();
          }
        }
      },80); /* pequeno delay para a view terminar de renderizar */
      return ret;
    };
    try{
      var keys=Object.keys(orig);
      for(var k=0;k<keys.length;k++){
        if(keys[k].indexOf('__lf')===0) wrapped[keys[k]]=orig[keys[k]];
      }
    }catch(_e){}
    wrapped.__lfLeadRefreshWrapped=true;
    global[fname]=wrapped;
    _log('wrapper instalado em', fname);
    return true;
  }

  function _wrapShowView(){
    ['showView','navigateTo','switchView','_showView','_navigateTo',
     'navigate','_navigate','setView','_setView','goTo','_goTo',
     'changeView','_changeView','openView','_openView'].forEach(function(fn){
      if(typeof global[fn]!=='function')return;
      if(global[fn].__lfLeadRefreshWrapped)return;
      var orig=global[fn];
      var wrapped=function(){
        if(_isLeadsViewActive()){
          _setStale(true);
          _log('saindo da view de leads — cache marcado stale');
        }
        var ret=orig.apply(this,arguments);
        setTimeout(function(){
          if(_isLeadsViewActive()){
            _log('entrou na view de leads via', fn);
            _debouncedRefresh();
          }
        },80);
        return ret;
      };
      try{
        var keys=Object.keys(orig);
        for(var k=0;k<keys.length;k++){
          if(keys[k].indexOf('__lf')===0) wrapped[keys[k]]=orig[keys[k]];
        }
      }catch(_e){}
      wrapped.__lfLeadRefreshWrapped=true;
      global[fn]=wrapped;
      _log('wrapper showView instalado em', fn);
    });
  }

  function _wrapReturnButtons(){
    document.addEventListener('click',function(e){
      var el=e.target;
      var depth=0;
      while(el && depth<5){
        if(el.tagName==='BUTTON' || el.tagName==='A' || el.getAttribute('role')==='button'){
          var txt=(el.textContent||'').trim().toLowerCase();
          var dataAction=el.getAttribute('data-action')||'';
          var dataRoute=el.getAttribute('data-route')||'';
          if(txt.indexOf('retornar')>=0 || txt.indexOf('voltar')>=0 ||
             txt.indexOf('back')>=0 || txt.indexOf('return')>=0 ||
             dataAction.indexOf('back')>=0 || dataAction.indexOf('return')>=0 ||
             dataAction.indexOf('retornar')>=0 || dataAction.indexOf('voltar')>=0 ||
             dataRoute.indexOf('leads')>=0){
            _log('botão retornar clicado:', txt||dataAction);
            _setStale(true);
            setTimeout(function(){
              if(_isLeadsViewActive()){
                _debouncedRefresh();
              }
            },120);
            break;
          }
        }
        el=el.parentElement;
        depth++;
      }
    },{passive:true,capture:true});
    _log('listener de botões retornar instalado');
  }

  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){
      _setStale(true);
      if(_isLeadsViewActive()){
        _log('visibilitychange → visible, view de leads ativa — refresh');
        _debouncedRefresh();
      }
    }
  },{passive:true});
  document.addEventListener('resume',function(){
    _setStale(true);
    if(_isLeadsViewActive()){
      _log('resume event — refresh leads');
      _debouncedRefresh();
    }
  },{passive:true});

  function _install(){
    var wrapped=0;
    ['goBack','_goBack','navigateBack','_navigateBack','back','_back',
     'retornar','_retornar','voltar','_voltar','closeDetail','_closeDetail',
     'closeLeadDetail','_closeLeadDetail','backToList','_backToList',
     'backToLeads','_backToLeads','returnToLeads','_returnToLeads',
     'closeLead','_closeLead','hideLeadDetail','_hideLeadDetail',
     'showLeads','_showLeads','showLeadList','_showLeadList',
     'renderLeadsView','_renderLeadsView']
      .forEach(function(fn){
        if(_wrapNavFunction(fn)) wrapped++;
      });

    _wrapShowView();
    _wrapReturnButtons();

    if(wrapped===0){
      _install._retries=(_install._retries||0)+1;
      if(_install._retries<40){
        setTimeout(_install,250);
        return;
      }
      _warn('nenhuma função de navegação encontrada após 40 tentativas — '+
            'o listener de botões ainda está ativo como fallback');
    }

    _log('v1-20260803 ativo:',{navWrappers:wrapped,
          stale:_isStale()});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{
    _install();
  }

  global.LF_FIX_LEAD_REFRESH = {
    version:'v1-20260803',
    isStale:_isStale,
    setStale:_setStale,
    refresh:_debouncedRefresh,
    forceRefresh:_tryRefreshLeads,
    isLeadsViewActive:_isLeadsViewActive,
    diag:function(){
      return {
        stale:_isStale(),
        leadsViewActive:_isLeadsViewActive(),
        lastFetchAt:_lastFetchAt?new Date(_lastFetchAt).toISOString():null,
        hasWorker:!!_wc(),
        uid:_uid()
      };
    }
  };
})(window);
