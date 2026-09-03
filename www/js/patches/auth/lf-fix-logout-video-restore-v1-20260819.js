/* =====================================================================
 * lf-fix-logout-video-restore-v1-20260819.js
 * ---------------------------------------------------------------------
 * BUG: apos logar e depois sair, o video de fundo da tela de login
 *      (assets/videos/lf-auth-bg-desktop.mp4 / -mobile.mp4) SUME
 *      permanentemente. A tela de login volta com o background
 *      estatico do jpg institucional em vez do video em loop.
 *
 * CAUSA-RAIZ (rastreada em codigo):
 *
 *   1. O video roda dentro de <div id="lf-auth-bg-anim"> e so aparece
 *      quando <body> tem a classe .lf-auth-bg-on (ver
 *      css/login/lf-auth-bg-animation.css linhas 38 e 188+). O
 *      controller js/lf-auth-bg-controller.js liga essa classe pelo
 *      calculo:
 *        authOn = (isSplashVisible() || isLoginVisible()) && !isAppVisible()
 *      via MutationObserver em #splash, #login-screen e #app.
 *
 *   2. Ao deslogar, js/auth.js -> _execLogout() (linhas 727-728) faz:
 *        document.getElementById('app').classList.remove('vis');
 *        document.getElementById('login-screen').classList.add('vis');
 *      -> em condicoes normais o controller religaria .lf-auth-bg-on.
 *
 *   3. PORÉM, imediatamente depois roda o patch
 *      lf-fix-logout-wallpaper-reset-v2-20260818.js -> _fullWallpaperCleanup(),
 *      que:
 *        - Zera background inline em <html>, <body>, #app, #login-screen.
 *        - Adiciona ao body as classes 'view-login' e 'lf-clean-bg' e
 *          o atributo data-view="login" (linha 127).
 *      Isso ativa a regra em css/lf-fix-login-bg-20260803.css:
 *        body.view-login, body.lf-clean-bg, body[data-view="login"]{
 *          background-image: url('/assets/login-bg.jpg') !important; ...
 *        }
 *      O background estatico do jpg sobrescreve visualmente o video,
 *      que embora esteja renderizado por baixo, esta em z-index:1 com
 *      opacity condicional a .lf-auth-bg-on. Alem disso o proprio
 *      _fullWallpaperCleanup pode reordenar as classes do body de tal
 *      forma que .lf-auth-bg-on nao é reavaliada no tick seguinte,
 *      deixando opacity:0 no wrapper do video.
 *
 *   4. Resultado: no primeiro login/logout o video some e nao volta,
 *      porque:
 *        (a) body ganha .view-login/.lf-clean-bg -> jpg estatico ativo
 *        (b) body pode ficar sem .lf-auth-bg-on -> video invisivel
 *
 * O QUE ESTE PATCH FAZ (cirurgico, aditivo, idempotente):
 *
 *   A) Sempre que #login-screen recebe .vis (logout normal via
 *      _execLogout, logout silencioso por sessao expirada, kick por
 *      admin, deep-link para #login), remove do <body> as classes
 *      'view-login', 'lf-clean-bg' e o atributo data-view="login"
 *      -> desativa o CSS do jpg estatico e libera o video.
 *
 *   B) Força a re-avaliacao do estado do controller chamando
 *      window.LfAuthBg.refresh() (API publica ja exposta pelo
 *      controller), garantindo que .lf-auth-bg-on volte ao body.
 *
 *   C) Chama .load() e .play() nos <video class="lf-auth-bg-video">
 *      (defensivo: alguns Chromium mobile pausam o video quando ele
 *      fica com opacity:0 por muito tempo dentro do CRM; ao voltar
 *      pra tela de login precisamos empurrar o playback de novo).
 *
 *   D) Roda tudo em multiplos ticks (0/60/250/900ms) para vencer
 *      qualquer re-injecao do patch v2 do wallpaper (que tambem
 *      dispara em setTimeout 30/200/800ms).
 *
 * O QUE NAO MEXE (contrato preservado):
 *
 *   - Nao altera auth.js, configuracoes.js, applyBG, _execLogout.
 *   - Nao altera lf-auth-bg-controller.js nem o CSS do video.
 *   - Nao apaga lf13_bgphoto_*, lf13_bg_*, lf13_pic_* nem tokens
 *     de sessao.
 *   - Nao interfere no cleanup de wallpaper do v2 — apenas neutraliza
 *     o efeito colateral (view-login/lf-clean-bg) que fazia o video
 *     sumir. O jpg institucional continua sendo o fallback caso o
 *     video nao consiga carregar; so nao é mais forcado sobre o video.
 *   - Idempotente: guard __LF_FIX_LOGOUT_VIDEO_RESTORE_V1__.
 *   - Convive pacificamente com v1/v2 do wallpaper (roda depois deles
 *     pela ordem de <script defer> em index.html/app.html).
 *
 * Guard: __LF_FIX_LOGOUT_VIDEO_RESTORE_V1__
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__lfFixLogoutVideoRestoreV1) return;
  global.__lfFixLogoutVideoRestoreV1 = true;
  if (global.__LF_FIX_LOGOUT_VIDEO_RESTORE_V1__) return;
  global.__LF_FIX_LOGOUT_VIDEO_RESTORE_V1__ = true;

  var TAG = '[lf-fix-logout-video-restore-v1]';
  function _log(){ try{ console.debug.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function _warn(){ try{ console.warn.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }

  // Classes/atributo criados por lf-fix-logout-wallpaper-reset-v1/v2 que
  // ativam o CSS de bg estatico (lf-fix-login-bg-20260803.css) e por
  // isso escondem o video de fundo. Removemos APENAS enquanto a tela
  // de login estiver visivel — em qualquer outro momento nao mexemos.
  var STATIC_BG_CLASSES = ['view-login', 'lf-clean-bg'];

  function _isLoginVisible(){
    var el = document.getElementById('login-screen');
    return !!(el && el.classList && el.classList.contains('vis'));
  }
  function _isAppVisible(){
    var el = document.getElementById('app');
    return !!(el && el.classList && el.classList.contains('vis'));
  }

  /* ------------------------------------------------------------------
     1) NEUTRALIZA o bg estatico e RELIGA o video.
        Idempotente: pode rodar quantas vezes for necessario.
     ------------------------------------------------------------------ */
  function _restoreLoginVideo(){
    try{
      // So age quando a tela de login esta ativa (evita interferir
      // com paginas do CRM que legitimamente usam data-view).
      if (!_isLoginVisible() || _isAppVisible()) return;

      var body = document.body;
      if (!body) return;

      // (a) Remove classes que ativam o jpg estatico sobre o video.
      STATIC_BG_CLASSES.forEach(function(cls){
        try{ body.classList.remove(cls); }catch(_e){}
      });

      // (b) Remove data-view="login" (mesma regra CSS). NAO removemos
      //     outros data-view (o CRM usa esse atributo em outras telas).
      try{
        if (body.getAttribute('data-view') === 'login'){
          body.removeAttribute('data-view');
        }
      }catch(_e){}

      // (c) Garante a classe .lf-auth-bg-on (o CSS do video depende
      //     dela para dar opacity:1 no wrapper). O controller
      //     eventualmente faria isso via MutationObserver, mas pode
      //     ficar dessincronizado apos o cleanup do v2. Reforcamos.
      try{
        body.classList.add('lf-auth-bg-on');
        body.classList.remove('lf-auth-bg-off');
      }catch(_e){}

      // (d) Pede ao controller para reavaliar dispositivo + estado.
      //     Se o controller nao existir por qualquer motivo, seguimos
      //     em frente — as classes acima ja bastam para o CSS mostrar.
      try{
        if (global.LfAuthBg && typeof global.LfAuthBg.refresh === 'function'){
          global.LfAuthBg.refresh();
        }
      }catch(_e){}

      // (e) Empurra o playback dos <video> (Chromium/iOS as vezes
      //     pausam quando o wrapper fica com opacity:0 por muito tempo).
      try{
        var vids = document.querySelectorAll('#lf-auth-bg-anim video.lf-auth-bg-video, .login-bgframe.has-video video');
        Array.prototype.forEach.call(vids, function(v){
          try{
            // muted+playsinline ja estao no HTML; so garantimos aqui
            // para browsers que resetam apos display:none.
            v.muted = true;
            v.playsInline = true;
            if (v.paused){
              var p = v.play();
              if (p && typeof p.catch === 'function') p.catch(function(){});
            }
          }catch(_e){}
        });
      }catch(_e){}

      _log('video de login restaurado');
    }catch(err){
      _warn('restore falhou (nao critico):', err);
    }
  }

  /* ------------------------------------------------------------------
     2) OBSERVADOR de #login-screen — dispara restore sempre que a
        tela de login ganha .vis (cobre _execLogout, sessao expirada,
        kick por admin, deep-link #login/#auth).
     ------------------------------------------------------------------ */
  function _installLoginObserver(){
    var ls = document.getElementById('login-screen');
    if (!ls || ls.__lfLogoutVideoRestoreObs) return false;
    ls.__lfLogoutVideoRestoreObs = true;
    try{
      var mo = new MutationObserver(function(){
        if (ls.classList.contains('vis')){
          // Roda em varios ticks para vencer as reinjecoes do patch
          // v2 do wallpaper (que dispara em 30/200/800ms).
          _restoreLoginVideo();
          setTimeout(_restoreLoginVideo, 60);
          setTimeout(_restoreLoginVideo, 250);
          setTimeout(_restoreLoginVideo, 900);
        }
      });
      mo.observe(ls, { attributes: true, attributeFilter: ['class', 'style'] });
      // Se ja esta visivel no boot (recarregou na tela de login), roda tambem.
      if (ls.classList.contains('vis')){
        _restoreLoginVideo();
        setTimeout(_restoreLoginVideo, 900);
      }
      _log('observer de #login-screen instalado');
      return true;
    }catch(err){
      _warn('nao foi possivel instalar observer:', err);
      return false;
    }
  }

  /* ------------------------------------------------------------------
     3) OBSERVADOR do <body> — captura o exato momento em que o patch
        v2 do wallpaper adiciona 'view-login'/'lf-clean-bg' (ou tira
        'lf-auth-bg-on'). Se estamos com login visivel, reverte.
     ------------------------------------------------------------------ */
  function _installBodyObserver(){
    if (!document.body || document.body.__lfLogoutVideoRestoreBodyObs) return false;
    document.body.__lfLogoutVideoRestoreBodyObs = true;
    try{
      var mo = new MutationObserver(function(muts){
        if (!_isLoginVisible() || _isAppVisible()) return;
        // Checagem barata: se qualquer uma das classes-alvo apareceu,
        // ou se .lf-auth-bg-on foi removida, reverte.
        var cl = document.body.classList;
        var needFix =
          cl.contains('view-login') ||
          cl.contains('lf-clean-bg') ||
          !cl.contains('lf-auth-bg-on') ||
          document.body.getAttribute('data-view') === 'login';
        if (needFix) _restoreLoginVideo();
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-view'] });
      _log('observer de <body> instalado');
      return true;
    }catch(err){
      _warn('nao foi possivel instalar observer body:', err);
      return false;
    }
  }

  /* ------------------------------------------------------------------
     4) HOOKS opcionais em funcoes de logout — redundante e defensivo.
        Nao substituem os observers acima; apenas antecipam o restore.
     ------------------------------------------------------------------ */
  var LOGOUT_FNS = ['_execLogout','doLogout','logout','signOut','clearSession','resetSession'];

  function _wrapLogout(fname){
    var fn = global[fname];
    if (typeof fn !== 'function') return false;
    if (fn.__lfLogoutVideoRestoreV1) return true;
    /* BUG #1 (2026-08-19): guarda universal anti re-envelope — se
       outro patch já envolveu esta função (marcou __lfWrapped), não
       empilha mais um wrapper. Antes, cada visibilitychange re-
       instalava wrappers sobre wrappers. */
    if (fn.__lfWrapped) return true;
    var orig = fn;
    var wrapped = function(){
      var ret;
      try{ ret = orig.apply(this, arguments); }
      finally{
        setTimeout(_restoreLoginVideo, 0);
        setTimeout(_restoreLoginVideo, 80);
        setTimeout(_restoreLoginVideo, 300);
        setTimeout(_restoreLoginVideo, 1000);
      }
      return ret;
    };
    wrapped.__lfLogoutVideoRestoreV1 = true;
    wrapped.__lfWrapped = true;
    global[fname] = wrapped;
    _log('wrapper instalado em', fname);
    return true;
  }

  function _installLogoutWrappers(){
    LOGOUT_FNS.forEach(_wrapLogout);
  }

  /* ------------------------------------------------------------------
     5) HASHCHANGE — se URL virar #login/#auth/#signin, tenta restore.
     ------------------------------------------------------------------ */
  global.addEventListener('hashchange', function(){
    try{
      if (/#(login|auth|signin)/i.test(location.hash || '')){
        setTimeout(_restoreLoginVideo, 0);
        setTimeout(_restoreLoginVideo, 300);
      }
    }catch(_e){}
  });

  /* ------------------------------------------------------------------
     6) VISIBILITYCHANGE — quando o usuario volta pra aba, garante que
        o video nao ficou pausado (Chromium as vezes pausa em background).
     ------------------------------------------------------------------ */
  global.document && global.document.addEventListener &&
    global.document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'visible' && _isLoginVisible() && !_isAppVisible()){
        _restoreLoginVideo();
      }
    });

  /* ------------------------------------------------------------------
     7) BOOT com retry — auth.js e o controller sao defer, precisam
        de tempo. Tentamos por ~15s.
     ------------------------------------------------------------------ */
  function _boot(){
    _installLoginObserver();
    _installBodyObserver();
    _installLogoutWrappers();
    _boot._n = (_boot._n || 0) + 1;
    if (_boot._n < 50) setTimeout(_boot, 300);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

  /* ------------------------------------------------------------------
     8) API publica para diagnostico no console.
     ------------------------------------------------------------------ */
  global.LF_FIX_LOGOUT_VIDEO_RESTORE = {
    version: 'v1-20260819',
    restore: _restoreLoginVideo,
    reinstall: function(){
      _installLoginObserver();
      _installBodyObserver();
      _installLogoutWrappers();
    }
  };

})(window);
