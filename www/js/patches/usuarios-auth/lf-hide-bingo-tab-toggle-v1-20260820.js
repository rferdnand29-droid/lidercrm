/* =====================================================================
 * lf-hide-bingo-tab-toggle-v1-20260820.js
 * ---------------------------------------------------------------------
 * Pedido (2026-08-20): deve existir nas Configurações do usuário uma
 * opção para OCULTAR a aba BINGO (página 'dash'). Ao ativar, a escolha
 * é SALVA NO SISTEMA (servidor, por usuário — mesma trilha
 * getConfig/putConfig da logo/wallpaper/auto-mover) e a aba só volta a
 * aparecer se a opção for desmarcada.
 *
 * O que este patch faz:
 *  1) Lê/grava a preferência por usuário:
 *       - localStorage 'lf_hide_bingo_tab_<uid>' (cache síncrono);
 *       - servidor: config 'prefs_<uid>' campo bingoTabHidden (merge,
 *         preserva livreAutoMoveOn e qualquer outra chave futura);
 *       - S.prefs.bingoTabHidden espelhado na hidratação.
 *  2) Aplica o estado na UI, sem editar js/app.js:
 *       - envolve buildNav() e, logo após montar a barra (#ntabs),
 *         remove o item "Bingo" quando oculto;
 *       - esconde o item "Início" (#mbn-inicio-btn) da nav inferior
 *         mobile (data-page="dash");
 *       - envolve goPage()/mobileGoPage() redirecionando 'dash' para
 *         a primeira aba visível (negocios -> leads -> chat -> config);
 *       - trata boot/URL direta (#/dash ou /dash) trocando o hash para
 *         a página de fallback ANTES do app renderizar, e re-aplica
 *         após a hidratação do servidor.
 *  3) Toggle em Configurações: nova seção "🏠 Aba Bingo (Início)"
 *     (id cfg-bingo-tab-section, checkbox cfg-hide-bingo-tab) chamando
 *       setHideBingoTab(this.checked).
 *
 * Decisões registradas:
 *  - CARGOS: a opção vale para qualquer usuário. O patch
 *    lf-administrativo-hide-tabs-v1-20260820 (cargo ADMINISTRATIVO)
 *    continua mandando: mesmo que este toggle esteja desligado, a aba
 *    fica oculta para administrativo.
 *  - A preferência é por usuário e sincroniza entre dispositivos.
 *  - Nunca joga exceção; qualquer falha mantém a aba visível.
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__lfFixHideBingoTabToggleV1) return;
  global.__lfFixHideBingoTabToggleV1 = true;
  if(window.__LF_HIDE_BINGO_TAB_V1__) return;
  window.__LF_HIDE_BINGO_TAB_V1__ = true;

  var LS_PREFIX = 'lf_hide_bingo_tab_';

  function _uid(){
    try{ return (window.S && S.userId) ? String(S.userId) : ''; }catch(_e){ return ''; }
  }

  function _wc(){
    try{
      var wc = window.LiderCRM && window.LiderCRM.api && window.LiderCRM.api.workerClient;
      if(wc && typeof wc.getConfig==='function' && typeof wc.putConfig==='function') return wc;
    }catch(_e){}
    try{
      if(typeof window._lfPrefsWorkerClient==='function'){ var w2=window._lfPrefsWorkerClient(); if(w2) return w2; }
    }catch(_e){}
    return null;
  }

  function _prefsKey(uid){ return 'prefs_'+String(uid||''); }

  function _lsGet(uid){
    try{ var v=localStorage.getItem(LS_PREFIX+String(uid||'')); return (v==='1'||v==='true'); }catch(_e){ return false; }
  }
  function _lsSet(uid,v){
    try{ localStorage.setItem(LS_PREFIX+String(uid||''), v?'1':'0'); }catch(_e){}
  }

  /* Estado atual: 1º) S.prefs hidratado do servidor; 2º) cache local. */
  function isBingoTabHidden(){
    try{
      if(window.S && S.prefs && typeof S.prefs.bingoTabHidden!=='undefined') return !!S.prefs.bingoTabHidden;
    }catch(_e){}
    var u=_uid();
    return u ? _lsGet(u) : false;
  }

  /* Primeira página visível para redirecionar quando 'dash' está oculta. */
  function _fallbackPage(){
    try{
      if(document.getElementById('pg-negocios')) return 'negocios';
      if(document.getElementById('pg-leads')) return 'leads';
      if(document.getElementById('pg-chat')) return 'chat';
      if(document.getElementById('pg-config')) return 'config';
    }catch(_e){}
    return 'negocios';
  }

  /* Remove/restaura a aba Bingo da barra superior logo após buildNav(). */
  function _applyTopNav(){
    try{
      var t=document.getElementById('ntabs'); if(!t) return;
      var hidden=isBingoTabHidden();
      var links=t.querySelectorAll('a.nt');
      for(var i=0;i<links.length;i++){
        var a=links[i];
        if(a.textContent.trim()==='Bingo'){
          a.style.display = hidden ? 'none' : '';
        }
      }
    }catch(_e){}
  }

  /* Esconde/mostra o botão "Início" (dash) da nav inferior mobile. */
  function _applyMobileNav(){
    try{
      var b=document.getElementById('mbn-inicio-btn');
      if(!b){ b=document.querySelector('#mobile-bottom-nav .mbn-item[data-page="dash"]'); }
      if(b) b.style.display = isBingoTabHidden() ? 'none' : '';
    }catch(_e){}
  }

  /* Se a página atual é 'dash' com a aba oculta, sai dela. */
  function _bounceOffDash(){
    try{
      if(!isBingoTabHidden()) return;
      var cur=document.getElementById('pg-dash');
      if(cur && cur.classList.contains('on')){
        var fb=_fallbackPage();
        if(typeof window.goPage==='function'){ window.goPage(fb); }
      }
    }catch(_e){}
  }

  function _applyAll(){ _applyTopNav(); _applyMobileNav(); }

  /* --------- persistência + UI do toggle --------- */

  function setHideBingoTab(on){
    on = !!on;
    var u=_uid();
    if(u) _lsSet(u,on);
    try{ if(window.S && S.userId){ S.prefs=S.prefs||{}; S.prefs.bingoTabHidden=on; } }catch(_e){}
    _applyAll();
    if(on) _bounceOffDash();
    /* sobe ao servidor (merge com demais prefs do usuário) */
    try{
      var wc=_wc();
      if(wc && u){
        wc.getConfig(_prefsKey(u)).catch(function(){ return {}; })
          .then(function(doc){
            var merged=(doc && typeof doc==='object') ? doc : {};
            merged.bingoTabHidden=on;
            return wc.putConfig(_prefsKey(u),merged);
          })
          .then(function(){ try{ if(typeof syncOk==='function') syncOk(); }catch(_e){} })
          .catch(function(e){
            console.warn('[bingo-tab] setHideBingoTab sync falhou',e);
            try{ if(typeof toast==='function') toast('⚠️ Preferência salva neste aparelho, mas falhou ao sincronizar com a nuvem.',4000); }catch(_e){}
          });
      }
    }catch(_e){}
    try{ if(typeof window._lfLogSettingsChangeToFeed==='function') window._lfLogSettingsChangeToFeed('Ocultar aba Bingo (Início)',on); }catch(_e){}
    try{
      if(typeof toast==='function'){
        toast(on ? 'Aba Bingo ocultada. Ela só volta se você desmarcar esta opção.'
                 : 'Aba Bingo (Início) visível novamente.');
      }
    }catch(_e){}
  }

  /* Hidratação: baixa prefs_<uid> do servidor e espelha em S.prefs/localStorage.
     Chamada no boot (wrap de startApp) — idempotente. */
  function hidrataBingoTabPref(uid){
    uid = uid || _uid();
    if(!uid){ return; }
    var wc=_wc();
    if(!wc){ return; }
    wc.getConfig(_prefsKey(uid)).then(function(doc){
      if(doc && typeof doc.bingoTabHidden!=='undefined'){
        var val=!!doc.bingoTabHidden;
        try{ if(window.S){ S.prefs=S.prefs||{}; S.prefs.bingoTabHidden=val; } }catch(_e){}
        _lsSet(uid,val);
        _applyAll();
        _syncCheckbox();
        if(val) _bounceOffDash();
      }
    }).catch(function(e){ console.warn('[bingo-tab] hidrataBingoTabPref falhou',e); });
  }

  function _syncCheckbox(){
    try{
      var cb=document.getElementById('cfg-hide-bingo-tab');
      if(cb) cb.checked=isBingoTabHidden();
    }catch(_e){}
  }

  /* --------- wraps (buildNav / goPage / mobileGoPage / startApp) --------- */

  function _wrapBuildNav(){
    if(typeof window.buildNav!=='function') return false;
    var orig=window.buildNav;
    if(orig.__lfBingoWrapped) return true;
    var wrapped=function(){
      var r=orig.apply(this,arguments);
      _applyTopNav();
      return r;
    };
    wrapped.__lfBingoWrapped=true;
    wrapped.__lfOrig=orig;
    window.buildNav=wrapped;
    return true;
  }

  function _wrapGoPage(){
    if(typeof window.goPage!=='function') return false;
    var orig=window.goPage;
    if(orig.__lfBingoWrapped) return true;
    var wrapped=function(p){
      try{
        if(p==='dash' && isBingoTabHidden()){ p=_fallbackPage(); }
      }catch(_e){}
      return orig.apply(this,[p]);
    };
    wrapped.__lfBingoWrapped=true;
    wrapped.__lfOrig=orig;
    window.goPage=wrapped;
    return true;
  }

  function _wrapMobileGoPage(){
    if(typeof window.mobileGoPage!=='function') return false;
    var orig=window.mobileGoPage;
    if(orig.__lfBingoWrapped) return true;
    var wrapped=function(p){
      var args=[].slice.call(arguments);
      try{
        if(args[0]==='dash' && isBingoTabHidden()){ args[0]=_fallbackPage(); }
      }catch(_e){}
      return orig.apply(this,args);
    };
    wrapped.__lfBingoWrapped=true;
    wrapped.__lfOrig=orig;
    window.mobileGoPage=wrapped;
    return true;
  }

  function _wrapStartApp(){
    if(typeof window.startApp!=='function') return false;
    var orig=window.startApp;
    if(orig.__lfBingoHydrateWrapped) return true;
    var wrapped=function(){
      var r=orig.apply(this,arguments);
      try{ hidrataBingoTabPref(window.S && window.S.userId); }catch(_e){}
      try{ _applyAll(); _syncCheckbox(); }catch(_e){}
      return r;
    };
    wrapped.__lfBingoHydrateWrapped=true;
    wrapped.__lfWrapped=true;
    wrapped.__lfOrig=orig;
    window.startApp=wrapped;
    return true;
  }

  /* Boot/URL direta: se a página inicial resolve para 'dash' e a aba
     está oculta (cache local), troca o hash antes do render inicial. */
  function _guardBootUrl(){
    try{
      if(!isBingoTabHidden()) return;
      var fb=_fallbackPage();
      var h=String(window.location.hash||'').replace(/^#\/?/,'');
      var path=String(window.location.pathname||'').replace(/^\/+|\/+$/g,'');
      if(h==='dash' || path==='dash'){
        try{ window.location.hash='/'+fb; }catch(_e){}
      }
    }catch(_e){}
  }

  /* --------- instalação com retry (scripts podem carregar em outra ordem) --------- */

  function _installAll(){
    var ok=true;
    if(!_wrapBuildNav()) ok=false;
    if(!_wrapGoPage()) ok=false;
    if(!_wrapMobileGoPage()) ok=false;
    if(!_wrapStartApp()) ok=false;
    return ok;
  }

  _guardBootUrl();
  _applyAll();
  if(!_installAll()){
    var tries=0;
    var iv=setInterval(function(){
      tries++;
      if(_installAll() || tries>60){ clearInterval(iv); }
      _applyAll();
    },250);
    document.addEventListener('DOMContentLoaded',function(){ _installAll(); _applyAll(); _syncCheckbox(); },{once:true});
  }
  document.addEventListener('DOMContentLoaded',function(){ _applyAll(); _syncCheckbox(); _guardBootUrl(); });

  /* Re-sincroniza o checkbox sempre que a página Config for aberta. */
  try{
    var _origGP=window.goPage;
    document.addEventListener('click',function(ev){
      try{
        var el=ev.target && ev.target.closest ? ev.target.closest('a.nt,button.mbn-item,button.mmd-link') : null;
        if(el && /Config/.test(el.textContent||'')) setTimeout(_syncCheckbox,120);
      }catch(_e){}
    },true);
  }catch(_e){}

  /* API global (o checkbox chama setHideBingoTab). */
  window.setHideBingoTab = setHideBingoTab;
  window.isBingoTabHidden = isBingoTabHidden;
  window.hidrataBingoTabPref = hidrataBingoTabPref;

  try{ console.info('[lf-hide-bingo-tab-v1] instalado — toggle em Configurações, persistência prefs_<uid>.bingoTabHidden'); }catch(_e){}
})(typeof window !== 'undefined' ? window : globalThis);
