/* =====================================================================
 * lf-fix-logout-wallpaper-reset-v2-20260818.js
 * ---------------------------------------------------------------------
 * CORREÇÃO DEFINITIVA — bug: "ao sair do CRM a tela de login aparece
 * com a foto de capa do usuário atrás, distorcendo o formulário".
 *
 * CAUSA-RAIZ (rastreada em código-fonte deste build):
 *   1. js/configuracoes.js -> applyBG('photo') cria/atualiza:
 *        - <div id="lf-wallpaper-bg-wrap"> (position:fixed, z-index:0)
 *          com background:url(...) center/cover no-repeat  [a FOTO]
 *        - <style id="bg-style-el"> com regras:
 *              body,#app{background:transparent!important}
 *              #app,.topbar,#mobile-top-bar,#mobile-bottom-nav,
 *              .pg,.mo,header{position:relative;z-index:1}
 *        - <style id="lf-wallpaper-transp-el"> (blur + alpha em modais,
 *          headers, cards, etc.)
 *        - classes .lf-has-wallpaper / .lf-theme-dark|light em <html>
 *   2. js/auth.js -> _execLogout() zera S, remove lf6_s, esconde #app
 *      e mostra #login-screen — MAS não desmonta NADA do que applyBG
 *      construiu. O #login-screen fica então com background transparente
 *      (por causa do bg-style-el que continua ativo) e por cima dele
 *      continua flutuando o <div id="lf-wallpaper-bg-wrap"> com a foto
 *      do usuário anterior — visualmente exatamente o print do usuário.
 *   3. O patch v1 (lf-fix-logout-wallpaper-reset-v1-20260803.js) tenta
 *      wrapar 'logout'/'doLogout'/'signOut'/'clearSession' — mas
 *      (a) o CRM real chama _execLogout(), que NÃO está na lista;
 *      (b) mesmo pegando doLogout, o reset roda ANTES da confirmação
 *          no toast, momento em que #app ainda está visível;
 *      (c) e ele NÃO remove os elementos culpados
 *          (#lf-wallpaper-bg-wrap, #bg-style-el, #lf-wallpaper-transp-el).
 *
 * O QUE ESTE PATCH FAZ (idempotente, aditivo, não quebra logins válidos):
 *   A) Wrapa também _execLogout (chamado pelo toast "Sair") — que é a
 *      função REAL do logout — e adiciona um cleanup COMPLETO do
 *      wallpaper depois que #login-screen já está visível.
 *   B) Mantém compatibilidade wrapando doLogout / logout / signOut /
 *      clearSession / resetSession também (caso outros patches chamem).
 *   C) Faz um cleanup DE VERDADE:
 *        - remove <div id="lf-wallpaper-bg-wrap">
 *        - limpa <style id="bg-style-el">
 *        - limpa <style id="lf-wallpaper-transp-el">
 *        - remove classes .lf-has-wallpaper/.lf-theme-dark/.lf-theme-light
 *          e as vars --lf-has-wallpaper/--lf-wallpaper-alpha/--lf-wallpaper-blur
 *          do <html>
 *        - limpa background/backgroundImage inline em <html>, <body>, #app,
 *          #login-screen (mas NUNCA toca em lf13_bgphoto_* nem lf13_bg_*
 *          — a foto continua salva pra próxima sessão do MESMO usuário).
 *   D) Observador de tela: se #login-screen ganhar .vis a qualquer
 *      momento (login expirado, sessão inválida, reset forçado por
 *      admin), o cleanup também roda — cobre logout "silencioso".
 *   E) Marca <body data-view="login"> pra CSS futura poder segmentar.
 *
 * NÃO REMOVE / NÃO MEXE:
 *   - lf13_bgphoto_{uid}  (foto salva, cross-device)
 *   - lf13_bg_{uid}       (id do fundo escolhido)
 *   - lf13_pic_{uid}      (foto de perfil do avatar)
 *   - Nenhuma função original (só wrapper aditivo).
 *
 * Guarda de idempotência: __LF_FIX_LOGOUT_WALLPAPER_V2__.
 * Convive com v1 (que fica inofensivo — só faz coisa extra em body.style,
 * cobertura duplicada não incomoda).
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__lfFixLogoutWallpaperResetV2) return;
  global.__lfFixLogoutWallpaperResetV2 = true;
  if (global.__LF_FIX_LOGOUT_WALLPAPER_V2__) return;
  global.__LF_FIX_LOGOUT_WALLPAPER_V2__ = true;

  var TAG = '[lf-fix-logout-wallpaper-v2]';
  function _log(){ try{ console.debug.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function _warn(){ try{ console.warn.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }

  /* ------------------------------------------------------------------
     1) CLEANUP REAL — desmonta tudo que applyBG('photo') montou.
        Idempotente: pode rodar quantas vezes quiser.
     ------------------------------------------------------------------ */
  function _fullWallpaperCleanup(){
    try{
      // 1a) remove o <div> fixo com a foto (esse é o culpado principal
      //     do "print" — ele fica em z-index:0 cobrindo o fundo do
      //     #login-screen mesmo depois do logout).
      var wrap = document.getElementById('lf-wallpaper-bg-wrap');
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);

      // 1b) limpa o <style> que força background:transparent no body/#app
      //     e reposiciona painéis com z-index:1. Sem isso, o #login-screen
      //     herda o body transparente e vaza a foto de capa.
      var st1 = document.getElementById('bg-style-el');
      if (st1) st1.textContent = '';

      // 1c) limpa o <style> da transparência adaptativa (blur + alpha
      //     em .mo, header, .topbar, cards...). Se ficar, o formulário
      //     de login fica "com efeito de vidro" sobre a foto anterior.
      var st2 = document.getElementById('lf-wallpaper-transp-el');
      if (st2) st2.textContent = '';

      // 1d) tira flags globais do <html>
      var d = document.documentElement;
      if (d){
        d.classList.remove('lf-has-wallpaper','lf-theme-dark','lf-theme-light');
        ['--lf-has-wallpaper','--lf-wallpaper-alpha','--lf-wallpaper-blur',
         '--user-bg','--user-wallpaper','--lf-wallpaper','--user-theme-bg',
         '--profile-bg','--crm-bg-image'].forEach(function(v){
          try{ d.style.removeProperty(v); }catch(_e){}
        });
      }

      // 1e) zera qualquer background inline que tenha vazado no
      //     <html>/<body>/#app/#login-screen (defensivo — não deveria
      //     ter, mas alguns patches antigos setavam direto no body).
      ['html','body','#app','#login-screen'].forEach(function(sel){
        var el;
        if (sel==='html') el=document.documentElement;
        else if (sel==='body') el=document.body;
        else el=document.querySelector(sel);
        if (!el || !el.style) return;
        el.style.backgroundImage = '';
        el.style.background = '';
        // NUNCA mexemos em backgroundColor do body: o tema (theme-classic
        // vs theme-light) controla isso via classe, e o CSS de #login-screen
        // já usa var(--bg). Se apagássemos, ficaria branco puro sobre alguns
        // temas.
      });

      // 1f) marcador de estado (útil pra CSS futura / testes)
      if (document.body){
        document.body.setAttribute('data-view','login');
        document.body.classList.add('view-login','lf-clean-bg');
        // Remove classes de user-theme deixadas por outros patches.
        var strip = /(^|\s)(user-theme-[\w-]+|wallpaper-[\w-]+|theme-user-[\w-]+|lf-user-bg[\w-]*)/g;
        if (typeof document.body.className === 'string'){
          document.body.className = document.body.className.replace(strip,'').trim();
        }
      }

      _log('cleanup concluído — wallpaper/foto de capa removidos da tela de login');
    }catch(err){
      _warn('cleanup falhou (não crítico):', err);
    }
  }

  /* ------------------------------------------------------------------
     2) WRAPPER GENÉRICO — aplica cleanup DEPOIS que a função original
        rodou (garantindo que #login-screen já esteja com .vis, senão
        um MutationObserver do wallpaper-transparency-v1 pode reinjetar).
     ------------------------------------------------------------------ */
  function _wrapWithCleanup(fname){
    var fn = global[fname];
    if (typeof fn !== 'function') return false;
    if (fn.__lfLogoutCleanupV2) return true;
    /* BUG #1 (2026-08-19): guarda universal anti re-envelope — não
       empilha wrapper sobre wrapper de outro patch (marca __lfWrapped).
       Antes, wrappers eram re-instalados a cada retorno de visibilidade. */
    if (fn.__lfWrapped) return true;
    var orig = fn;
    var wrapped = function(){
      var ret;
      try{ ret = orig.apply(this, arguments); }
      finally{
        // Roda várias vezes: alguns patches reinjetam wallpaper no
        // próximo tick (loadBGRemote assíncrono, MutationObservers).
        _fullWallpaperCleanup();
        setTimeout(_fullWallpaperCleanup, 30);
        setTimeout(_fullWallpaperCleanup, 200);
        setTimeout(_fullWallpaperCleanup, 800);
      }
      return ret;
    };
    wrapped.__lfLogoutCleanupV2 = true;
    wrapped.__lfWrapped = true;
    global[fname] = wrapped;
    _log('wrapper instalado em', fname);
    return true;
  }

  /* ------------------------------------------------------------------
     3) INSTALAÇÃO DOS HOOKS — inclui _execLogout (o REAL logout,
        chamado pelo botão "Sair" do toast em auth.js linha 739).
     ------------------------------------------------------------------ */
  var LOGOUT_FNS = [
    '_execLogout',   // <-- CRÍTICO: é ESTE que o CRM chama de verdade
    'doLogout',
    'logout', '_logout', '_doLogout',
    'signOut', '_signOut',
    'clearSession', '_clearSession',
    'resetSession', '_resetSession'
  ];

  function _installAll(){
    var installed = 0;
    LOGOUT_FNS.forEach(function(fname){
      if (_wrapWithCleanup(fname)) installed++;
    });

    // Hook adicional: se lf-fix-adm-password-reset-logout-v1 estiver
    // presente e expôs forceLogout, também limpa antes dele.
    try{
      var FR = global.LF_FIX_ADM_PW_RESET;
      if (FR && typeof FR.forceLogout === 'function' && !FR.__lfLogoutCleanupV2){
        var _orig = FR.forceLogout;
        FR.forceLogout = function(reason){
          _fullWallpaperCleanup();
          var r = _orig.apply(this, arguments);
          setTimeout(_fullWallpaperCleanup, 50);
          setTimeout(_fullWallpaperCleanup, 400);
          return r;
        };
        FR.__lfLogoutCleanupV2 = true;
        _log('wrapper instalado em LF_FIX_ADM_PW_RESET.forceLogout');
      }
    }catch(_e){}

    return installed;
  }

  /* ------------------------------------------------------------------
     4) OBSERVADOR DE TELA — cobre logout "silencioso" (sessão
        expirada, kick por admin, checkSes retorna false, etc.).
        Sempre que #login-screen recebe .vis, roda o cleanup.
     ------------------------------------------------------------------ */
  function _installLoginScreenObserver(){
    var ls = document.getElementById('login-screen');
    if (!ls || ls.__lfLogoutCleanupObs) return;
    ls.__lfLogoutCleanupObs = true;
    try{
      var mo = new MutationObserver(function(){
        if (ls.classList.contains('vis')){
          _fullWallpaperCleanup();
        }
      });
      mo.observe(ls, { attributes:true, attributeFilter:['class','style'] });
      // Se já está visível no boot com wallpaper resíduo, limpa também.
      if (ls.classList.contains('vis')) _fullWallpaperCleanup();
      _log('observer de #login-screen instalado');
    }catch(_e){
      _warn('não foi possível instalar observer:', _e);
    }
  }

  /* ------------------------------------------------------------------
     5) HASHCHANGE — se a URL virar #login/#auth, limpa também.
     ------------------------------------------------------------------ */
  global.addEventListener('hashchange', function(){
    try{
      if (/#(login|auth|signin)/i.test(location.hash || '')){
        _fullWallpaperCleanup();
      }
    }catch(_e){}
  });

  /* ------------------------------------------------------------------
     6) BOOT — retry até conseguir hookar. As funções de logout são
        definidas em js/auth.js que carrega via <script defer>, então
        podem não estar disponíveis no primeiro tick.
     ------------------------------------------------------------------ */
  function _boot(){
    _installAll();
    _installLoginScreenObserver();
    _boot._n = (_boot._n||0) + 1;
    // Continua tentando por ~15s (algumas telas iOS PWA sobem devagar).
    if (_boot._n < 50) setTimeout(_boot, 300);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _boot, { once:true });
  } else {
    _boot();
  }

  /* ------------------------------------------------------------------
     7) API pública — útil pra diagnosticar no console (window.LF_FIX_LOGOUT_WP_V2.reset())
     ------------------------------------------------------------------ */
  global.LF_FIX_LOGOUT_WP_V2 = {
    version: 'v2-20260818',
    reset: _fullWallpaperCleanup,
    reinstall: _installAll
  };

})(window);
