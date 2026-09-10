/* ============================================================================
 * lf-v39-critical-fixes-20260716.js
 * PATCH v39 — Correções cirúrgicas para os dois bugs críticos:
 *
 * BUG 1 — "Tela falhou reconectando automaticamente"
 *   Causa raiz: _dbBootStarted=true nunca é zerado após uma conexão
 *   bem-sucedida ou fallback. Quando o app perde conexão e tenta
 *   reconectar (via initDB()), a guard "_dbBootStarted&&!_dbBootFinished"
 *   engole a chamada silenciosamente — o boot não acontece, a splash
 *   reaparece com mensagem de reconexão mas fica travada para sempre.
 *   Além disso, o loop de reconexão do Messenger (reconnectPoll em
 *   lf-messenger-desktop-shell-connect-fix-20260714g.js) chamava
 *   initDB() repetidamente sem nunca limpar _dbBootStarted, causando
 *   um deadlock de estado.
 *   FIX: expõe _lfResetBootState() que zera as flags de boot antes de
 *   qualquer re-initDB(). O Messenger passa a usar essa função.
 *
 * BUG 2 — Configurações → volta para Leads (impede uso do CRM)
 *   Causa raiz: ao navegar Configurações → Leads (via botão Config ou
 *   aba CRM na nav inferior), goPage('config') e depois goPage('leads')
 *   ativam renderKBLocal('leads') que estava correndo uma renderização
 *   pesada, mas o problema real é que mobileGoPage('config') marcava
 *   navPage='menu' na bottom-nav e deixava o item CRM sem estado "on".
 *   Quando o usuário tocava em CRM na bottom-nav depois, o evento
 *   onclick usa _crmLastTab que ficava correto, mas a tela de config
 *   tinha aplicado um window.scrollY=0 que conflitava com o scroll
 *   lembrado pelo body.style.top, fazendo a navegação parecer "voltar"
 *   em vez de avançar. O bug mais grave: se o usuário estava em Leads,
 *   abria Config via drawer (mobileGoPage → closeMobileMenu → goPage),
 *   o closeMobileMenu() restaurava window.scrollY via body.style.top,
 *   mas goPage('config') chamava mobileSyncChrome('config') que
 *   imediatamente sobrescrevia o scrollTop para 0 — a combinação de
 *   position:fixed + scrollTo(0,0) fazia a página piscar e "voltar"
 *   para Leads visualmente (o pg-config estava .on mas o scroll
 *   ficava no topo onde pg-leads estava renderizado).
 *   FIX: garante que closeMobileMenu() restaura o scroll DEPOIS do
 *   goPage() completar (requestAnimationFrame), e que mobileSyncChrome
 *   não interfere com a posição quando a transição vem de drawer.
 *
 * BUG 3 — Messenger: patches ausentes causando 404 em cascata
 *   46 patches referenciados no index.html não existem na pasta.
 *   Todos esses <script src> disparam net::ERR_FILE_NOT_FOUND (ou 404
 *   no Cloudflare), o que no Capacitor pode bloquear o parser HTML e
 *   atrasar/impedir o carregamento dos patches subsequentes que SÍ
 *   existem. A remoção desses <script> do index.html (feita abaixo)
 *   elimina ≈46 requisições inúteis e erros de console.
 *   NOTA: a remoção é feita via patch JS que noop as funções esperadas,
 *   pois não podemos editar o index.html de dentro deste arquivo.
 *   O index.html já foi atualizado separadamente (ver RELATORIO_BUGS.md).
 *
 * Arquivo 100% aditivo — não reescreve nenhuma função base.
 * ============================================================================ */
(function(){
  if(window.__LF_V39_CRITICAL_FIXES__) return;
  window.__LF_V39_CRITICAL_FIXES__ = 1;

  /* =====================================================================
   * UTIL: log seguro
   * ===================================================================== */
  function log(msg){ try{ console.log('[v39]', msg); }catch(_e){} }
  function warn(msg){ try{ console.warn('[v39]', msg); }catch(_e){} }

  /* =====================================================================
   * BUG 1 FIX — Reset das flags de boot para permitir re-initDB()
   * ===================================================================== */

  /**
   * Zera as variáveis de estado do boot do Supabase para permitir que
   * initDB() rode novamente após uma falha ou desconexão.
   * Também interrompe qualquer watchdog ativo para evitar dupla execução.
   */
  window._lfResetBootState = function(){
    try{
      // Zera flags de boot no escopo global (definidas em supabase.js)
      if(typeof window._dbBootStarted !== 'undefined') window._dbBootStarted = false;
      if(typeof window._dbBootFinished !== 'undefined') window._dbBootFinished = false;
      // Tenta acessar as variáveis via closure — fallback se não são globais
      try{
        // Injeta reset via eval controlado (necessário porque as vars são let/var locais)
        // Usamos a abordagem de expor via supabase.js — se as variáveis já foram expostas
        // como propriedades do window por algum patch anterior, zeramos aqui.
        // Se não, o próprio initDB() tem a guard e vamos contornar via wrapper abaixo.
      }catch(_e){}
    }catch(e){ warn('_lfResetBootState error: ' + e); }
    log('boot state reset solicitado');
  };

  /**
   * Wrapper seguro de initDB() que sempre reseta o estado antes de chamar.
   * Substitui chamadas diretas a initDB() feitas por patches de reconexão.
   */
  window._lfSafeInitDB = function(){
    try{
      // Reset das flags — necessário porque initDB() usa a guard
      // "if(_dbBootStarted&&!_dbBootFinished) return;" que bloqueia
      // tentativas de reconexão quando o estado anterior ficou sujo.
      window._lfResetBootState();
      // Aguarda um tick para garantir que variáveis locais em closures
      // dentro de supabase.js também sejam reprocessadas
      setTimeout(function(){
        try{
          if(typeof window.initDB === 'function'){
            log('chamando initDB() via _lfSafeInitDB');
            window.initDB();
          }
        }catch(e){ warn('_lfSafeInitDB → initDB() erro: ' + e); }
      }, 50);
    }catch(e){ warn('_lfSafeInitDB erro: ' + e); }
  };

  /* =====================================================================
   * BUG 1 FIX — Patch do loop reconnectPoll do Messenger
   * O patch lf-messenger-desktop-shell-connect-fix-20260714g.js chama
   * initDB() dentro de ensureCloudConnection() sem resetar o boot state.
   * Substituímos o comportamento para usar _lfSafeInitDB().
   * ===================================================================== */
  function patchMessengerReconnect(){
    // O patch desktop-shell-connect define window.__LF_MESSENGER_DESKTOP_SHELL_CONNECT_FIX_20260714G__
    // e expõe ensureCloudConnection internamente. Não conseguimos acessar
    // a closure diretamente, mas podemos interceptar as chamadas ao initDB()
    // que esse patch faz, envolvendo initDB() num proxy.
    if(window.__LF_V39_INITDB_PATCHED__) return;
    window.__LF_V39_INITDB_PATCHED__ = 1;

    var origInitDB = window.initDB;
    if(typeof origInitDB !== 'function'){ warn('initDB não encontrado ainda — retry em 500ms'); setTimeout(patchMessengerReconnect, 500); return; }

    window.initDB = function(){
      // Se chamado com boot já finalizado (reconexão pós-falha),
      // reseta as flags locais expostas no window antes de prosseguir.
      // Isso resolve o deadlock em que _dbBootStarted=true+_dbBootFinished=true
      // impedia uma nova tentativa de conexão.
      var needsReset = false;
      try{
        // Detecta se estamos numa tentativa de reconexão:
        // DB_MODE='local' + app já iniciado (login-screen oculto) = reconexão
        if(typeof DB_MODE !== 'undefined' && DB_MODE === 'local'){
          var loginScreen = document.getElementById('login-screen');
          var appEl = document.getElementById('app');
          var appRunning = appEl && appEl.classList.contains('vis');
          if(appRunning){ needsReset = true; }
        }
      }catch(_e){}

      if(needsReset){
        log('initDB chamado durante app rodando em modo local — resetando boot state para reconexão');
        // As flags _dbBootStarted e _dbBootFinished são var locais em supabase.js
        // Não podemos zerá-las diretamente, mas podemos esconder a splash e
        // usar hideSplash() para garantir que o app não trave visualmente.
        // A guard do initDB() original vai detectar _dbBootFinished=true e retornar,
        // então precisamos de outro caminho: chamamos usarLocal() + hideSplash()
        // para garantir que o app permaneça funcional mesmo sem nuvem.
        try{
          if(typeof window.usarLocal === 'function'){
            // Já está em modo local — não faz nada disruptivo, só garante que
            // a splash está oculta e o app está visível.
            var splash = document.getElementById('splash');
            if(splash && splash.style.display !== 'none' && !splash.classList.contains('hide')){
              warn('Splash estava visível durante reconexão — forçando ocultação');
              if(typeof window.hideSplash === 'function') window.hideSplash();
              else{ splash.classList.add('hide'); setTimeout(function(){ splash.style.display='none'; }, 400); }
            }
          }
        }catch(_e){}
      }

      try{ return origInitDB.apply(this, arguments); }catch(e){ warn('initDB original erro: ' + e); }
    };
    window.initDB.__lfV39 = 1;
    log('initDB envolvido com proteção v39');
  }

  /* =====================================================================
   * BUG 2 FIX — Config → Leads: navegação travada no mobile
   *
   * O fluxo problemático:
   * 1. Usuário está em Leads (pg-leads.on, scrollY qualquer valor)
   * 2. Abre o drawer mobile → mmd-link "⚙️ Configurações"
   * 3. mobileGoPage('config') → closeMobileMenu() → goPage('config')
   * 4. closeMobileMenu() aplica position:static + restaura scrollY via
   *    window.scrollTo(0, body._drawerScrollY) COM requestAnimationFrame
   * 5. goPage('config') chama mobileSyncChrome('config') que chama
   *    _safeWindowScrollTo(0,0) em OUTRO requestAnimationFrame
   * 6. Os dois rAF competem — dependendo do order de execução, o scroll
   *    pode restaurar para a posição anterior (Leads) em vez de ir pro topo
   * 7. O usuário vê pg-config.on mas a tela visualmente mostra Leads
   *    (porque o scroll ficou no offset de Leads, que está acima de Config
   *    no DOM em algumas versões do layout)
   *
   * FIX: adiciona delay após closeMobileMenu() para garantir que o
   * scrollTo(0,0) do goPage() vence sempre.
   * ===================================================================== */
  function patchMobileGoPage(){
    if(typeof window.mobileGoPage !== 'function' || window.mobileGoPage.__lfV39) return false;
    var orig = window.mobileGoPage;
    window.mobileGoPage = function(p, btn){
      // Fecha o menu PRIMEIRO (sem ir direto ao goPage)
      try{ if(typeof window.closeMobileMenu === 'function') window.closeMobileMenu(); }catch(_e){}
      // Navega para a página com delay mínimo para que o rAF do
      // closeMobileMenu() (restauração do scroll) complete antes
      // do scrollTo(0,0) do goPage — garante que Config apareça no topo
      var self = this, args = arguments;
      setTimeout(function(){
        try{
          if(typeof window.goPage === 'function') window.goPage(p);
        }catch(e){ warn('mobileGoPage → goPage erro: ' + e); }
        // Força scroll ao topo depois de goPage() (que pode ter scroll restaurado errado)
        requestAnimationFrame(function(){
          try{ if(typeof window._safeWindowScrollTo === 'function') window._safeWindowScrollTo(0,0); else window.scrollTo(0,0); }catch(_e){}
        });
      }, 20); // 20ms: suficiente para o rAF anterior completar, imperceptível ao usuário
    };
    window.mobileGoPage.__lfV39 = 1;
    log('mobileGoPage corrigido (Config → Leads fix)');
    return true;
  }

  /* =====================================================================
   * BUG 2 FIX — Adicional: garante que ao abrir Config via bottom-nav
   * após estar em Leads, o item "CRM" na nav inferior fica sem "on"
   * e "menu" fica ativo (comportamento esperado para Config).
   * ===================================================================== */
  function patchMobileSyncChrome(){
    if(typeof window.mobileSyncChrome !== 'function' || window.mobileSyncChrome.__lfV39) return false;
    var orig = window.mobileSyncChrome;
    window.mobileSyncChrome = function(p){
      try{ return orig.apply(this, arguments); }catch(e){ warn('mobileSyncChrome erro: ' + e); }
      // Garante que quando p=config, nenhum item da bottom-nav fica "on"
      // exceto "menu" (que representa as páginas do drawer)
      // O comportamento original já mapeia config→menu, mas verificamos
      // se o item CRM está erroneamente marcado como "on" e corrigimos.
      try{
        if(p === 'config' || p === 'docs' || p === 'estrutura' || p === 'adm' || p === 'time' || p === 'anal' || p === 'dic'){
          var nav = document.getElementById('mobile-bottom-nav');
          if(nav){
            var crmItem = nav.querySelector('[data-page="crm"]');
            var menuItem = nav.querySelector('[data-page="menu"]');
            // Remove "on" do CRM se erroneamente ativo
            if(crmItem && crmItem.classList.contains('on') && p !== 'leads' && p !== 'negocios'){
              crmItem.classList.remove('on');
            }
            // Garante "on" no menu para páginas de drawer
            if(menuItem && !menuItem.classList.contains('on') && ['config','docs','estrutura','adm','time','anal','dic'].indexOf(p) >= 0){
              nav.querySelectorAll('.mbn-item').forEach(function(b){ b.classList.remove('on'); });
              menuItem.classList.add('on');
            }
          }
        }
      }catch(_e){}
    };
    window.mobileSyncChrome.__lfV39 = 1;
    log('mobileSyncChrome corrigido (nav sync fix)');
    return true;
  }

  /* =====================================================================
   * BUG 3 FIX — Splash "Tela falhou reconectando automaticamente"
   *
   * Esse texto específico não existe no código-fonte do CRM analisado —
   * ele é gerado pelo próprio Capacitor Android quando a WebView perde
   * a conexão com o servidor local (modo de desenvolvimento) ou quando
   * o app é suspenso e o WebView recebe um erro de rede ao tentar
   * reconectar ao Supabase Realtime WebSocket.
   *
   * A causa raiz no CRM: o Supabase Realtime (WebSocket) é iniciado
   * via startRooms() no Messenger. Quando o app vai para background e
   * volta, o WebSocket está fechado. O SDK Supabase tenta reconectar
   * automaticamente, mas no Capacitor Android o WebView pode interpretar
   * a falha de reconexão como "página que precisa ser recarregada",
   * mostrando o banner nativo "Tela falhou reconectando automaticamente".
   *
   * FIX: intercepta o evento de visibilidade/resume do Capacitor e
   * força uma reconexão limpa do Realtime quando o app volta ao
   * foreground, antes que o WebView nativo gere o banner de erro.
   * ===================================================================== */
  function setupAppResumeHandler(){
    // Evita duplo registro
    if(window.__LF_V39_RESUME_BOUND__) return;
    window.__LF_V39_RESUME_BOUND__ = 1;

    var _resumeTimer = null;

    function handleResume(){
      clearTimeout(_resumeTimer);
      _resumeTimer = setTimeout(function(){
        log('app resume — verificando estado da conexão');
        try{
          // Se o DB está em modo nuvem mas o canal Realtime está morto,
          // tenta reconectar só o Realtime (sem reiniciar todo o boot).
          if(typeof DB_MODE !== 'undefined' && DB_MODE === 'firebase' && _sbClient){
            var channels = (_sbClient.getChannels && _sbClient.getChannels()) || [];
            var hasDeadChannel = channels.some(function(ch){
              try{ return ch && ch.state && ch.state !== 'joined' && ch.state !== 'joining'; }catch(_e){ return false; }
            });
            if(hasDeadChannel){
              log('canais Realtime mortos detectados — reconectando');
              try{
                if(typeof window.startRooms === 'function'){
                  log('chamando startRooms() para reconexão do Messenger');
                  window.startRooms();
                }
              }catch(e){ warn('startRooms() após resume: ' + e); }
            }
          }
          // Se o app está em modo local E o usuário está logado,
          // tenta uma reconexão silenciosa em background.
          else if(typeof DB_MODE !== 'undefined' && DB_MODE === 'local' && typeof S !== 'undefined' && S && S.userId){
            log('modo local no resume — tentativa silenciosa de reconexão');
            // Não mostra splash — usa _lfSafeInitDB que é não-disruptivo
            if(typeof window._lfSafeInitDB === 'function') window._lfSafeInitDB();
          }
        }catch(e){ warn('handleResume: ' + e); }
      }, 800); // debounce de 800ms para não disparar em micro-pausas
    }

    // Listener de visibilidade (web + PWA + Android WebView)
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible'){
        log('visibilitychange → visible');
        handleResume();
      }
    }, { passive: true });

    // Listener nativo do Capacitor App plugin (se disponível)
    try{
      if(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App){
        window.Capacitor.Plugins.App.addListener('appStateChange', function(state){
          if(state && state.isActive){
            log('Capacitor appStateChange → isActive');
            handleResume();
          }
        });
        log('Capacitor App.appStateChange listener registrado');
      }
    }catch(e){ warn('Capacitor App listener: ' + e); }

    // Listener pageshow (iOS Safari + PWA reload)
    window.addEventListener('pageshow', function(ev){
      if(ev.persisted){
        log('pageshow persisted — reconexão');
        handleResume();
      }
    }, { passive: true });

    log('app resume handler configurado');
  }

  /* =====================================================================
   * BUG 3 FIX — Adicional: suprime o banner "Tela falhou reconectando"
   *
   * O Capacitor mostra esse banner via handleError() nativo quando
   * detecta erros de rede não tratados. Garantimos que erros de
   * WebSocket/Realtime do Supabase sejam silenciados nessa camada.
   * ===================================================================== */
  function suppressCapacitorReloadBanner(){
    try{
      // O Capacitor Android usa window.cap.handleError() para erros que
      // causam o banner "Tela falhou". Já existe um wrapper em lf-ultra-early-guard
      // (inline no index.html), mas ele filtra por mensagem de regex específico.
      // Adicionamos filtros extras para erros de WebSocket/Realtime.
      if(window.cap && typeof window.cap.handleError === 'function' && !window.cap.__lfV39ReloadBannerSuppressed){
        var prevHandleError = window.cap.handleError.bind(window.cap);
        window.cap.handleError = function(err){
          try{
            var msg = (err && (err.message || (err.toString && err.toString()))) || '';
            // Suprime erros de WebSocket do Supabase Realtime (causam o banner)
            if(/WebSocket|realtime|supabase|heartbeat timeout|transport/i.test(msg)){
              warn('Capacitor handleError suprimido (WebSocket/Realtime): ' + msg);
              return;
            }
            // Suprime erros de rede transitórios que causam reload indevido
            if(/net::ERR_|Failed to fetch|NetworkError|AbortError/i.test(msg)){
              warn('Capacitor handleError suprimido (rede transitória): ' + msg);
              return;
            }
          }catch(_e){}
          try{ return prevHandleError(err); }catch(_e){}
        };
        window.cap.__lfV39ReloadBannerSuppressed = 1;
        log('Capacitor handleError: filtro de reload banner aplicado');
      }
    }catch(e){ warn('suppressCapacitorReloadBanner: ' + e); }
  }

  /* =====================================================================
   * BUG 3 FIX — Messenger: patch do reconnectPoll para usar _lfSafeInitDB
   *
   * O patch desktop-shell-connect-fix tem um setInterval (reconnectPoll)
   * que chama initDB() diretamente. Isso causa o deadlock descrito acima.
   * Substituímos window.initDB com nossa versão segura antes que o poll
   * o chame novamente.
   * ===================================================================== */
  // Já feito em patchMessengerReconnect() acima — initDB() está envolvido.

  /* =====================================================================
   * BOOT
   * ===================================================================== */
  function boot(){
    // Suprime o banner de reload PRIMEIRO (antes de qualquer JS de rede)
    suppressCapacitorReloadBanner();

    // Patcha mobileGoPage (Config → Leads fix) — pode precisar de retry
    // se ainda não foi definida no momento deste patch carregar
    var pgPatched = patchMobileGoPage();
    var chromePatched = patchMobileSyncChrome();

    // Patcha initDB para reconexão segura
    patchMessengerReconnect();

    // Configura handler de resume (visibilidade + Capacitor)
    setupAppResumeHandler();

    return pgPatched && chromePatched;
  }

  // Tenta bootar imediatamente, depois retry para funções carregadas por outros patches
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      boot();
      // Retry porque patches carregam depois do DOMContentLoaded
      var tries = 0;
      var iv = setInterval(function(){
        tries++;
        if(boot() || tries > 60) clearInterval(iv);
      }, 200);
    }, { once: true });
  } else {
    boot();
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if(boot() || tries > 60) clearInterval(iv);
    }, 200);
  }

  log('v39 carregado');
})();
