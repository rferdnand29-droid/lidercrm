/* ============================================================
   js/lf-auth-bg-controller.js
   ------------------------------------------------------------
   TERRENO para os fundos animados das telas de LOGIN e SPLASH.
   Este script NÃO desenha animação nenhuma — ele só:
     1. Detecta desktop vs. mobile (viewport, com override por
        ?lf-bg=desktop|mobile para testes).
     2. Marca <body> com .lf-bg-device-desktop ou .lf-bg-device-mobile.
     3. Liga .lf-auth-bg-on enquanto #splash OU #login-screen
        estiverem visíveis, e troca para .lf-auth-bg-off assim
        que #app entra em .vis.
     4. Reavalia device em resize (rotação, redimensionamento).

   Regras:
   - NÃO altera o comportamento do CRM (não mexe em initDB,
     doLogin, bootApp, cap.handleError, etc.).
   - Só lê o DOM via MutationObserver / classList — nada
     invasivo. Se algo falhar, o CRM continua funcionando
     100% (o container simplesmente não aparece).
   - Fica pronto para receber a animação: assim que você
     injetar conteúdo em #lf-auth-bg-desktop ou #lf-auth-bg-mobile
     (via innerHTML, <img>, <canvas>, lottie-player, <video>, etc.),
     ela já entra no lugar certo.
   ============================================================ */
(function(){
  'use strict';
  if (window.__lfAuthBgControllerLoaded) return;
  window.__lfAuthBgControllerLoaded = true;

  var MOBILE_MAX = 768;               // <=768px = mobile
  var body = document.body || document.documentElement;

  // ---- 1. Injeta o wrapper + slots (uma vez só). ----------
  function ensureNodes(){
    if (document.getElementById('lf-auth-bg-anim')) return;
    var wrap = document.createElement('div');
    wrap.id = 'lf-auth-bg-anim';
    wrap.setAttribute('aria-hidden', 'true');

    var dk = document.createElement('div');
    dk.id = 'lf-auth-bg-desktop';
    dk.className = 'lf-auth-bg-slot';

    var mb = document.createElement('div');
    mb.id = 'lf-auth-bg-mobile';
    mb.className = 'lf-auth-bg-slot';

    wrap.appendChild(dk);
    wrap.appendChild(mb);

    // Insere como PRIMEIRO filho de <body> para ficar atrás de tudo do CRM
    // (o CSS controla o empilhamento via z-index, mas manter no início
    // ajuda navegadores antigos e evita repaint desnecessário).
    if (document.body){
      document.body.insertBefore(wrap, document.body.firstChild);
    } else {
      document.addEventListener('DOMContentLoaded', function(){
        document.body.insertBefore(wrap, document.body.firstChild);
      });
    }
  }

  // ---- 2. Detecção de device (com override). --------------
  function detectDevice(){
    try{
      var qs = (location.search || '').toLowerCase();
      if (qs.indexOf('lf-bg=desktop') !== -1) return 'desktop';
      if (qs.indexOf('lf-bg=mobile')  !== -1) return 'mobile';
    }catch(_e){}

    // Capacitor nativo => sempre mobile.
    try{
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()){
        return 'mobile';
      }
    }catch(_e){}

    // Body pode ter recebido .lf-mobile pelo bootstrap mobile do CRM.
    if (document.body && document.body.classList.contains('lf-mobile')) return 'mobile';

    var w = Math.min(window.innerWidth || 9999, document.documentElement.clientWidth || 9999);
    return (w <= MOBILE_MAX) ? 'mobile' : 'desktop';
  }

  function applyDevice(){
    var dev = detectDevice();
    var b = document.body;
    if (!b) return;
    b.classList.toggle('lf-bg-device-desktop', dev === 'desktop');
    b.classList.toggle('lf-bg-device-mobile',  dev === 'mobile');
  }

  // ---- 3. Estado: auth (splash/login) visível? ------------
  function isSplashVisible(){
    var el = document.getElementById('splash');
    if (!el) return false;
    if (el.classList.contains('hide')) return false;
    var st = el.style;
    if (st && (st.display === 'none' || st.visibility === 'hidden')) return false;
    return true;
  }
  function isLoginVisible(){
    var el = document.getElementById('login-screen');
    if (!el) return false;
    return el.classList.contains('vis');
  }
  function isAppVisible(){
    var el = document.getElementById('app');
    if (!el) return false;
    return el.classList.contains('vis');
  }

  function applyAuthState(){
    var b = document.body;
    if (!b) return;
    var authOn = (isSplashVisible() || isLoginVisible()) && !isAppVisible();
    b.classList.toggle('lf-auth-bg-on',  authOn);
    b.classList.toggle('lf-auth-bg-off', !authOn);
  }

  // ---- 4. Observers + eventos. ----------------------------
  function watchTargets(){
    var targets = ['splash', 'login-screen', 'app']
      .map(function(id){ return document.getElementById(id); })
      .filter(Boolean);

    if (!('MutationObserver' in window) || !targets.length) return;

    var mo = new MutationObserver(function(){ applyAuthState(); });
    targets.forEach(function(t){
      mo.observe(t, { attributes: true, attributeFilter: ['class', 'style'] });
    });

    // Também observa o <body> caso o CRM adicione .lf-mobile depois do boot.
    if (document.body){
      var bmo = new MutationObserver(function(){ applyDevice(); });
      bmo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }

  var _rzT;
  function onResize(){
    clearTimeout(_rzT);
    _rzT = setTimeout(applyDevice, 120);
  }

  // ---- 5. Boot. -------------------------------------------
  function boot(){
    ensureNodes();
    applyDevice();
    applyAuthState();
    watchTargets();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // API pública mínima — útil quando você for injetar a animação real.
  // Ex.: window.LfAuthBg.setDesktop('<canvas id="...">...</canvas>')
  window.LfAuthBg = {
    refresh: function(){ applyDevice(); applyAuthState(); },
    setDesktop: function(html){
      ensureNodes();
      var slot = document.getElementById('lf-auth-bg-desktop');
      if (slot) slot.innerHTML = html || '';
    },
    setMobile: function(html){
      ensureNodes();
      var slot = document.getElementById('lf-auth-bg-mobile');
      if (slot) slot.innerHTML = html || '';
    },
    clear: function(){
      var d = document.getElementById('lf-auth-bg-desktop');
      var m = document.getElementById('lf-auth-bg-mobile');
      if (d) d.innerHTML = '';
      if (m) m.innerHTML = '';
    }
  };
})();
