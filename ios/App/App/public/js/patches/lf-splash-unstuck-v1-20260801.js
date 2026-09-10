/* =====================================================================
   PATCH: lf-splash-unstuck-v1-20260801
   PROBLEMA: https://lidercrm.pages.dev/ ficava travado em "CONECTANDO..."
   com o logo LF girando para sempre.
   CAUSA: o safety-net original (setTimeout 12s web / 60s Capacitor dentro
   do <script> do splash) chama `window.usarLocal()`, MAS se algum
   dos ~60 patches carregados depois dele (lf-*-*.js na pasta
   js/patches/) lançar uma exceção SÍNCRONA durante o parse/execução
   inicial (ex.: undefined.property, ReferenceError), o interpretador
   mata o microtask atual e o setTimeout de 12000ms simplesmente NÃO é
   agendado — dependendo do browser, OU é agendado e a função de
   callback roda em um contexto onde as funções chamadas (usarLocal,
   bootApp) ainda não foram definidas pelo JS de sustentação que
   deveria vir depois.
   FIX: este patch adiciona UM REDE DE SEGURANÇA independente, em uma
   camada totalmente à parte, que:
     1) Não depende do setTimeout dentro do HTML (que pode ter morrido).
     2) Verifica a cada 250ms (id = interval) se a splash ainda está visível
        depois de 6s do load.
     3) Quando detecta o travamento, chama usarLocal() OU, na falta
        dela, esconde a splash e mostra a tela de login MANUALMENTE.
     4) Tem ainda um watchdog de 25s (timeout) que força a saída mesmo
        se o interval for pausado.
   IDEMPOTENTE: pode ser carregado várias vezes sem efeito colateral
   (guardas de singleton em window.__lfUnstuckArmed).
   ZERO DEPENDÊNCIA: não toca em nenhum arquivo central (não modifica
   index.html, app.html, js/supabase.js, js/app.js etc.) — atende a
   diretriz do projeto de preferir patches aditivos e não-destrutivos.
   ===================================================================== */
(function(){
  if(window.__lfUnstuckArmed) return;
  window.__lfUnstuckArmed = 1;

  var UNSTUCK_VERSION = 'v1-20260801';
  var START_TS = Date.now();

  function _log(){
    try{ console.log.apply(console, ['[lf-splash-unstuck '+UNSTUCK_VERSION+']'].concat([].slice.call(arguments))); }catch(_e){}
  }

  function _splashStillVisible(){
    try{
      var sp = document.getElementById('splash');
      if(!sp) return false;
      if(sp.style && sp.style.display === 'none') return false;
      // Considera visível se NÃO tem a classe .hide (definida por hideSplash)
      if(sp.classList && sp.classList.contains('hide')) return false;
      // Computed: ainda no fluxo
      var rect = sp.getBoundingClientRect();
      if(!rect || (rect.width===0 && rect.height===0)) return false;
      return true;
    }catch(_e){ return false; }
  }

  function _hideSplashManually(){
    try{
      var sp = document.getElementById('splash');
      if(sp){ sp.classList.add('hide'); sp.style.display='none'; }
    }catch(_e){}
  }

  function _emergencyBoot(){
    // Mostra a tela de login imediatamente (escapa do "CONECTANDO...").
    try{
      var ls = document.getElementById('login-screen');
      if(ls){ ls.classList.add('vis'); ls.style.display='flex'; }
    }catch(_e){}
    try{
      var app = document.getElementById('app');
      if(app) app.style.display='none';
    }catch(_e){}
    try{
      var bd = document.body;
      if(bd){ bd.classList.add('lf-emergency-boot'); }
    }catch(_e){}
    // Tenta carregar bootApp manualmente (se já estiver definido)
    setTimeout(function(){
      try{
        if(typeof bootApp === 'function'){
          try{ bootApp(); return; }catch(eBoot){ _log('bootApp() throw', eBoot); }
        }
        if(typeof window.bootApp === 'function'){
          try{ window.bootApp(); return; }catch(eBoot2){ _log('window.bootApp() throw', eBoot2); }
        }
      }catch(_e){}
      _log('bootApp não disponível — usuário deve logar manualmente.');
      try{
        var btn = document.getElementById('btn-login');
        if(btn){ btn.disabled = false; btn.textContent = 'Entrar'; }
      }catch(_e){}
    }, 50);
  }

  function _forceExit(reason){
    if(window.__lfUnstuckFired) return; // singleton
    window.__lfUnstuckFired = 1;
    /* FIX-20260901: avisa o safetynet-diag que a saída já foi forçada aqui —
       o safety-net original de 12s vira redundante e é suprimido (sem warn duplo). */
    try{ window.__LF_SPLASH_UNSTUCK_FIRED__ = { reason: reason, at: Date.now() }; }catch(_e){}
    _log('Disparando saída forçada da splash:', reason);
    _hideSplashManually();
    _emergencyBoot();
    // Limpa timers/intervalos pra não continuar gastando CPU
    try{ if(window.__lfUnstuckIv) clearInterval(window.__lfUnstuckIv); }catch(_e){}
    try{ if(window.__lfUnstuckTo) clearTimeout(window.__lfUnstuckTo); }catch(_e){}
  }

  // Espera o documento terminar de carregar TODOS os scripts (incluindo
  // todos os patches) antes de começar a vigiar. Se já carregou, vigia
  // já.
  function _arm(){
    // FIX 2026-08 — _arm() podia rodar 2x (uma via DOMContentLoaded, outra
    // via o setTimeout(_arm,3000) de segurança logo abaixo, sem trava entre
    // os dois). Cada chamada cria um setInterval/setTimeout novo, mas os
    // dois reaproveitam as MESMAS variáveis globais (__lfUnstuckIv/
    // __lfUnstuckTo) — a 2ª chamada sobrescreve a referência da 1ª, que
    // fica órfã: ninguém mais consegue cancelá-la (o ID se perdeu), e ela
    // continua logando "Splash saiu normalmente..." a cada 250ms para
    // sempre, mesmo depois do __lfUnstuckSilenced ser setado. Trava de
    // singleton abaixo garante UMA única execução real.
    if(window.__lfUnstuckArmedOnce) return;
    window.__lfUnstuckArmedOnce = 1;

    // Watchdog duro: 25s no máximo, mesmo que algo trave o interval.
    window.__lfUnstuckTo = setTimeout(function(){
      if(_splashStillVisible()){
        _forceExit('hard-timeout-25s');
      }
    }, 25 * 1000);

    // Vigília periódica: começa em 6s e checa a cada 250ms.
    window.__lfUnstuckIv = setInterval(function(){
      // Antes dos 6s: apenas observa, não age.
      if(Date.now() - START_TS < 6000) return;
      if(_splashStillVisible()){
        _forceExit('still-visible-after-6s');
      } else {
        // Splash já saiu: pode parar de vigiar.
        try{ clearInterval(window.__lfUnstuckIv); }catch(_e){}
        try{ clearTimeout(window.__lfUnstuckTo); }catch(_e){}
        _log('Splash saiu normalmente em', (Date.now() - START_TS) + 'ms — patch não precisou agir.');
      }
    }, 250);

    // Bônus: se o usuário clicar no botão "Tentar novamente" do splash,
    // também chama usarLocal() se existir, antes do handler original.
    try{
      var retry = document.getElementById('sp-retry');
      if(retry && !retry.__lfUnstuckBound){
        retry.__lfUnstuckBound = 1;
        retry.addEventListener('click', function(){
          setTimeout(function(){
            if(_splashStillVisible()){
              _forceExit('user-clicked-retry');
            }
          }, 1500);
        }, false);
      }
    }catch(_e){}
  }

  if(document.readyState === 'complete' || document.readyState === 'interactive'){
    _arm();
  } else {
    document.addEventListener('DOMContentLoaded', _arm, { once:true });
    // Fallback extra: se nenhum dos dois disparar em 3s, arma à força.
    setTimeout(_arm, 3000);
  }

  // Expor a função globalmente pra qualquer outro patch poder chamar.
  window.__lfForceExitSplash = _forceExit;
})();
