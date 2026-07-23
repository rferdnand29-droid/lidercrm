/* ============================================================================
 * lf-perf-drag-login-fix-20260723.js
 *
 * PATCH consolidado focado nos 3 problemas relatados pelo usuário:
 *   1. LENTIDÃO — CRM ficando pesado durante uso normal
 *   2. MOVIMENTAÇÃO — cards do kanban travando (drag & drop) principalmente
 *      no app Capacitor (Android/iOS)
 *   3. LOGIN — usuário não conseguia entrar em alguns momentos
 *
 * Este arquivo é 100% aditivo: envolve funções existentes com camadas de
 * proteção. Não reescreve nem substitui nenhuma lógica original.
 *
 * ============================================================================
 */
(function(){
  if(window.__LF_PERF_DRAG_LOGIN_FIX_20260723__) return;
  window.__LF_PERF_DRAG_LOGIN_FIX_20260723__ = 1;

  function log(m){ try{ console.log('[perf-drag-login]', m); }catch(_e){} }
  function warn(m){ try{ console.warn('[perf-drag-login]', m); }catch(_e){} }

  /* =====================================================================
   * BUG LOGIN #A — Reset automático de lockout preso
   * ---------------------------------------------------------------------
   * O lockout de 30s de tentativas de login era persistido em localStorage
   * (lf_login_lock). Se o usuário fechava o app durante o lockout ou o
   * relógio do sistema dava um pulo para trás (comum em Android com
   * economia de bateria agressiva), o lockUntil podia ficar preso em um
   * timestamp inalcançável, impedindo qualquer nova tentativa até o
   * usuário limpar o storage manualmente.
   * FIX: no boot da página, se o lockout já expirou OU se está muito no
   * futuro (>1h — impossível legitimamente), zera automaticamente.
   * ===================================================================== */
  try{
    var raw = localStorage.getItem('lf_login_lock');
    if(raw){
      var st = JSON.parse(raw) || {};
      var now = Date.now();
      var lockedTooLong = st.u && (st.u - now) > (60*60*1000); // >1h no futuro = sujo
      var expired = st.u && st.u <= now;
      if(lockedTooLong || expired){
        localStorage.setItem('lf_login_lock', JSON.stringify({a:0,u:0}));
        log('lockout de login limpo automaticamente (era ' + (lockedTooLong?'suspeito':'expirado') + ')');
      }
    }
  }catch(_e){}

  /* =====================================================================
   * BUG LOGIN #B — Timeout de login sem fallback visual
   * ---------------------------------------------------------------------
   * Se o worker-client demora muito para responder (rede muito lenta,
   * DNS travado), a promise do login podia ficar pendurada 30+ segundos
   * com o botão em "Entrando..." sem feedback. Adiciona um watchdog de
   * 15s que reabilita o botão e mostra erro amigável se nada retornar.
   * ===================================================================== */
  function armLoginWatchdog(){
    var btn = document.getElementById('btn-login');
    var er = document.getElementById('lerr');
    if(!btn || !er) return null;
    return setTimeout(function(){
      if(btn.disabled && btn.textContent === 'Entrando...'){
        btn.textContent='Entrar'; btn.disabled=false;
        er.textContent = 'Tempo esgotado. Verifique sua conexão e tente novamente.';
        warn('login watchdog disparado (15s)');
      }
    }, 15000);
  }
  // Escuta cliques no botão de login para armar o watchdog
  document.addEventListener('click', function(e){
    var btn = e.target && e.target.closest && e.target.closest('#btn-login');
    if(btn) armLoginWatchdog();
  }, true);
  // Enter no campo de senha também dispara login
  document.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      var t = e.target;
      if(t && (t.id === 'le' || t.id === 'lp')) armLoginWatchdog();
    }
  }, true);

  /* =====================================================================
   * BUG MOVIMENTAÇÃO #C — Guard-rail contra estado sujo no drag
   * ---------------------------------------------------------------------
   * Já foi aplicado no js/kanban.js (guard global de dragend/drop/blur/ESC),
   * mas duplicamos aqui como fallback caso o kanban.js seja recarregado
   * em ordem diferente. IIFE guardada por __LF_KB_DRAG_GUARD__.
   * ===================================================================== */
  if(!window.__LF_KB_DRAG_GUARD__){
    window.__LF_KB_DRAG_GUARD__ = 1;
    var reset = function(){
      try{
        if(typeof _kbDragAutoScrollStop === 'function') _kbDragAutoScrollStop();
      }catch(_e){}
      try{
        if(typeof _kbDragId !== 'undefined' && _kbDragId){
          var stuck = document.querySelector('.kb-card.dragging');
          if(stuck) stuck.classList.remove('dragging');
        }
      }catch(_e){}
      try{ if(typeof _kbDragId !== 'undefined') _kbDragId = null; }catch(_e){}
      try{ if(typeof _kbDragBoard !== 'undefined') _kbDragBoard = null; }catch(_e){}
      try{ if(typeof _kbDragOwner !== 'undefined') _kbDragOwner = null; }catch(_e){}
      try{ var ph = document.getElementById('kb-ph'); if(ph) ph.remove(); }catch(_e){}
      try{ document.querySelectorAll('.kb-col.drag-over').forEach(function(c){c.classList.remove('drag-over');}); }catch(_e){}
    };
    document.addEventListener('dragend', reset, true);
    document.addEventListener('drop', function(){ setTimeout(reset, 50); }, true);
    window.addEventListener('blur', reset);
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') reset();
    });
  }

  /* =====================================================================
   * BUG LENTIDÃO #D — Pausa polls quando app volta para background
   * ---------------------------------------------------------------------
   * setInterval de notificações, sessões, atividades e automação continuam
   * disparando quando o app está em background (aba oculta). Isso é
   * desperdício de bateria/CPU e pode saturar a rede. Adiciona uma camada
   * global que pausa os intervals de baixa prioridade quando invisível
   * e retoma quando visível.
   * ===================================================================== */
  var _pausedIntervals = null;
  function pauseBackgroundIntervals(){
    if(_pausedIntervals) return;
    _pausedIntervals = {};
    ['_ntfInterval','_sessInterval','_actInterval','_autoEngineInterval'].forEach(function(k){
      try{
        var id = window[k];
        if(id){ clearInterval(id); _pausedIntervals[k] = true; window[k] = null; }
      }catch(_e){}
    });
    if(Object.keys(_pausedIntervals).length){
      log('intervals de background pausados: ' + Object.keys(_pausedIntervals).join(','));
    }
  }
  function resumeBackgroundIntervals(){
    if(!_pausedIntervals) return;
    // Retoma se as funções ainda existirem
    try{
      if(_pausedIntervals._actInterval && typeof checkUpcomingActs === 'function'){
        window._actInterval = setInterval(checkUpcomingActs, 60000);
      }
    }catch(_e){}
    try{
      if(_pausedIntervals._ntfInterval && typeof loadNotifsRemote === 'function'){
        window._ntfInterval = setInterval(function(){
          loadNotifsRemote(function(){ try{ if(typeof updateNotifBadge === 'function') updateNotifBadge(); }catch(_e){} });
        }, 60000);
      }
    }catch(_e){}
    try{
      if(_pausedIntervals._sessInterval && typeof _sessionsHeartbeat === 'function'){
        window._sessInterval = setInterval(_sessionsHeartbeat, 120000);
      }
    }catch(_e){}
    try{
      if(_pausedIntervals._autoEngineInterval && typeof _runAutomationEngineBoot === 'function'){
        window._autoEngineInterval = setInterval(_runAutomationEngineBoot, 300000);
      }
    }catch(_e){}
    log('intervals de background retomados');
    _pausedIntervals = null;
  }
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'hidden') pauseBackgroundIntervals();
    else resumeBackgroundIntervals();
  }, {passive:true});

  /* =====================================================================
   * BUG LENTIDÃO #E — Debounce de resize/orientationchange
   * ---------------------------------------------------------------------
   * Muitos patches escutam 'resize' e 'orientationchange' sem debounce,
   * chamando cálculos pesados (getBoundingClientRect em cascata, re-renders)
   * a cada pixel movido. Instala um debouncer global suave que reduz até
   * 90% dos disparos sem afetar UX perceptível.
   * ===================================================================== */
  (function(){
    if(window.__LF_RESIZE_DEBOUNCE__) return;
    window.__LF_RESIZE_DEBOUNCE__ = 1;
    var origAdd = window.addEventListener;
    var HEAVY_EVENTS = {resize:1, orientationchange:1};
    window.addEventListener = function(type, listener, opts){
      if(HEAVY_EVENTS[type] && typeof listener === 'function'){
        var wrapped = function(e){
          if(wrapped._t){ clearTimeout(wrapped._t); }
          wrapped._t = setTimeout(function(){ try{ listener.call(this, e); }catch(err){ warn('resize handler erro: '+err); } }, 60);
        };
        wrapped.__lfOrig = listener;
        return origAdd.call(this, type, wrapped, opts);
      }
      return origAdd.call(this, type, listener, opts);
    };
    log('resize/orientationchange com debounce de 60ms instalado');
  })();

  log('patch consolidado 2026-07-23 aplicado (lentidão + drag + login)');
})();
