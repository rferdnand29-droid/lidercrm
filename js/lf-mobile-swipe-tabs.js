/* ============================================================
   FIX 2026-07-29 — Swipe horizontal para trocar de aba no mobile
   ------------------------------------------------------------
   - Arrastar dedo pra ESQUERDA => próxima aba
   - Arrastar dedo pra DIREITA  => aba anterior
   - Ordem base: dash -> leads -> negocios -> agenda -> chat
   - Em leads/negocios, primeiro alterna entre as duas abas internas
     do CRM; só "sai" pra dash/agenda quando já está na borda.
   - Ignora gestos iniciados em elementos que já rolam horizontal
     (kanban, chat, drawers, modais, inputs, botões).

   CALIBRAÇÃO 2026-08-05 — pedido do usuário: "às vezes não vai e
   às vezes vai quando não é pra ir". Duas causas raiz diferentes,
   corrigidas separadamente:

   1) "Não vai" (falso negativo) — o gesto só era avaliado no
      touchend, com distância mínima fixa de 60px. Um "flick" rápido
      e curto (comum quando a pessoa já pegou o jeito) não cobria os
      60px e nunca contava. Agora: gesto rápido (<220ms) precisa de
      só 60% da distância mínima. Também afrouxei o ângulo máximo
      (25°->30°) porque um arrasto de polegar natural tem uma leve
      curva — isso sozinho já rejeitava gestos horizontais válidos.

   2) "Vai quando não é pra ir" (falso positivo) — dois motivos:
      a) o gesto só era filtrado no FINAL. Durante uma rolagem
         vertical longa, se a mão desviasse um pouco no meio do
         caminho, às vezes o vetor final (início->fim) ainda passava
         no teste de ângulo. Agora tem "trava de eixo": nos primeiros
         12px já decide se o gesto é vertical ou horizontal; se for
         vertical, solta o rastreio na hora (não espera o gesto
         inteiro), então rolagens não têm chance de virar navegação.
      b) trocar de aba duas vezes seguidas sem querer (o dedo encosta
         de novo enquanto a animação de troca ainda está rolando).
         Agora tem um cooldown de 380ms depois de qualquer troca.

   THRESHOLD_X e MAX_ANGLE_DEG deixaram de ser fixos: agora vêm de
   window.LF_SWIPE_TABS (salvos por aparelho), pra quem quiser ajustar
   ainda mais fino tem a ferramenta "↔️ Ajustar arrastar de aba" em
   Configurações (ver js/patches/lf-swipe-tabs-calibration-v1-20260805.js).
   ============================================================ */
(function(){
  'use strict';

  var PAGES = ['dash','leads','negocios','agenda','chat'];

  // Elementos onde o swipe NÃO deve disparar (rolagem horizontal própria,
  // interação de toque específica, formulários, modais etc.)
  var IGNORE_SELECTOR = [
    'input','textarea','select','button','a',
    '.kb-scroll-wrap','.kb-wrap','.kb-col','.kb-card',
    /* 2026-08-07 (relatado: "arrastar ativa mesmo em cima de leads"):
       .mb-card (card de lead no mobile) é uma <div>, não um <button> —
       não estava coberta pela exclusão genérica de botões, só as
       ações DENTRO dela (.mb-card-actions) estavam. Card é uma área
       grande e é onde a pessoa mais toca — fazia bastante sentido ser
       justamente onde o gesto disparava sem querer. */
    '.mb-card',
    '#pg-chat','#chat-msgs','#chat-conv-list','#chat-input',
    '.mo.open','.mo-body',
    '#mobile-menu-drawer','#mobile-menu-overlay',
    '.act-alert-bar',
    '[data-no-swipe]','.no-swipe',
    '.mb-card-actions','.mb-card-actions *',
    // Tiras horizontais próprias (chips de etapa/consultor, abas internas
    // do CRM, tira da agenda) — sem isso, rolar essas tiras com o dedo
    // era lido como "trocar de aba" em vez de rolar a tira.
    '.mb-chip-bar','.mb-chip',
    '.crm-toptabs','.ctt-btn',
    '.kb-cons-chip','.kb-view-bar',
    '.agd-strip',
    // 2026-08-07: contador de Ligações (widget flutuante) — mesma
    // razão do .mb-card, área tocada com frequência.
    '.lig-widget'
  ].join(',');

  var STORE_KEY = 'lf_swipe_tabs_calibration_v1';

  var DEFAULT_THRESHOLD = 50;    // px mínimos horizontais (era 60 fixo)
  var DEFAULT_ANGLE     = 24;    // ângulo máximo em graus — CORREÇÃO 2026-08-07 (relatado "ativa fácil demais"): era 30, afrouxado demais numa calibração anterior focada no problema oposto ("não vai"). 24° ainda aceita a curva natural de um arrasto de polegar, mas rejeita mais rolagem vertical com deriva.
  var RANGE_THRESHOLD   = [30, 100];
  var RANGE_ANGLE       = [12, 40];

  var MAX_TIME_MS   = 700;   // gesto precisa ser rápido (evita "arrastar e pensar")
  var FLICK_TIME_MS = 220;   // abaixo disso conta como "flick" rápido
  var FLICK_FACTOR  = 0.6;   // flick só precisa desta fração da distância mínima
  var AXIS_LOCK_PX  = 15;    // px pra decidir cedo se o gesto é horizontal ou vertical — CORREÇÃO 2026-08-07: era 12, um pouco baixo demais (um tremor pequeno da mão já bastava pra travar a decisão sem intenção real de direção ainda)
  var EDGE_IGNORE   = 20;    // ignora gestos iniciados nas bordas (voltar do sistema)
  var COOLDOWN_MS   = 380;   // pausa depois de trocar de aba, evita disparo duplo

  function clampNum(n, min, max, fallback){
    n = parseFloat(n);
    if(!isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function loadConfig(){
    var cfg = { threshold: DEFAULT_THRESHOLD, angle: DEFAULT_ANGLE };
    try{
      var raw = localStorage.getItem(STORE_KEY);
      if(raw){
        var parsed = JSON.parse(raw) || {};
        cfg.threshold = clampNum(parsed.threshold, RANGE_THRESHOLD[0], RANGE_THRESHOLD[1], DEFAULT_THRESHOLD);
        cfg.angle     = clampNum(parsed.angle,     RANGE_ANGLE[0],     RANGE_ANGLE[1],     DEFAULT_ANGLE);
      }
    }catch(e){}
    return cfg;
  }

  function saveConfig(cfg){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); }catch(e){}
  }

  var CFG = loadConfig();

  var startX=0, startY=0, startT=0, tracking=false, targetOk=true, axisDecided=false, lastNavAt=0;

  function isMobile(){
    try{
      if(typeof window.isMobileView === 'function') return !!window.isMobileView();
    }catch(e){}
    return window.matchMedia && window.matchMedia('(max-width:768px)').matches;
  }

  function currentPage(){
    // Descobre a página ativa pelo .pg visível
    var pgs = document.querySelectorAll('.pg');
    for(var i=0;i<pgs.length;i++){
      var el = pgs[i];
      // considera "ativo" quando tem display != none
      var st = window.getComputedStyle(el);
      if(st && st.display !== 'none'){
        var id = el.id || '';
        if(id.indexOf('pg-') === 0) return id.slice(3);
      }
    }
    return null;
  }

  function go(page){
    try{
      if(typeof window.mobileGoPage === 'function'){
        window.mobileGoPage(page);
      }else if(typeof window.goPage === 'function'){
        window.goPage(page);
      }
    }catch(e){ console.warn('[swipe] falha ao navegar', page, e); }
  }

  function neighbor(dir){
    // dir = +1 (próxima) ou -1 (anterior)
    var cur = currentPage();
    if(!cur) return null;
    var idx = PAGES.indexOf(cur);
    if(idx < 0){
      // página fora da lista principal (config, anal, etc.) — não navega
      return null;
    }
    var nxt = idx + dir;
    if(nxt < 0 || nxt >= PAGES.length) return null;
    return PAGES[nxt];
  }

  function shouldIgnoreTarget(el){
    if(!el || !el.closest) return false;
    return !!el.closest(IGNORE_SELECTOR);
  }

  // Avalia um gesto (dx,dy,dt) contra a config atual (ou uma config de
  // teste, se passada) — usado tanto no touchend real quanto pela área
  // de teste da ferramenta de calibração, pra garantir que o "teste"
  // reflita exatamente o que vai acontecer de verdade.
  function evalGesture(dx, dy, dt, cfgOverride){
    var cfg = cfgOverride || CFG;
    var adx = Math.abs(dx), ady = Math.abs(dy);
    if(dt > MAX_TIME_MS) return { ok:false, reason:'tempo', adx:adx, ady:ady };
    var angle = Math.atan2(ady, adx) * 180 / Math.PI;
    if(angle > cfg.angle) return { ok:false, reason:'angulo', angle:angle, adx:adx, ady:ady };
    var minDist = cfg.threshold;
    var isFlick = dt <= FLICK_TIME_MS;
    if(isFlick) minDist = cfg.threshold * FLICK_FACTOR;
    if(adx < minDist) return { ok:false, reason:'distancia', angle:angle, adx:adx, ady:ady, minDist:minDist, isFlick:isFlick };
    return { ok:true, angle:angle, adx:adx, ady:ady, minDist:minDist, isFlick:isFlick, dir: dx < 0 ? +1 : -1 };
  }

  function onStart(e){
    if(!isMobile()) return;
    if(Date.now() - lastNavAt < COOLDOWN_MS){ tracking=false; return; } // cooldown pós-troca
    if(e.touches && e.touches.length !== 1) { tracking=false; return; }
    var t = e.touches ? e.touches[0] : e;
    // ignora gestos que começam nas bordas laterais (gesto de voltar do SO)
    var vw = window.innerWidth || document.documentElement.clientWidth;
    if(t.clientX <= EDGE_IGNORE || t.clientX >= (vw - EDGE_IGNORE)){
      tracking=false; return;
    }
    targetOk = !shouldIgnoreTarget(e.target);
    if(!targetOk){ tracking=false; return; }
    startX = t.clientX;
    startY = t.clientY;
    startT = Date.now();
    tracking = true;
    axisDecided = false;
  }

  function onMove(e){
    if(!tracking || axisDecided) return;
    var t = e.touches ? e.touches[0] : e;
    if(!t) return;
    var dx = t.clientX - startX, dy = t.clientY - startY;
    var adx = Math.abs(dx), ady = Math.abs(dy);
    if((adx + ady) < AXIS_LOCK_PX) return; // ainda cedo demais pra decidir
    axisDecided = true;
    if(ady > adx){
      // gesto claramente vertical — solta na hora, deixa a rolagem
      // nativa acontecer sem risco de virar navegação lá na frente
      tracking = false;
    }
  }

  function onEnd(e){
    if(!tracking) return;
    tracking = false;
    var t = (e.changedTouches && e.changedTouches[0]) || e;
    if(!t) return;
    var dx = t.clientX - startX;
    var dy = t.clientY - startY;
    var dt = Date.now() - startT;
    var res = evalGesture(dx, dy, dt);
    if(!res.ok) return;
    var target = neighbor(res.dir);
    if(target){ go(target); lastNavAt = Date.now(); }
  }

  function onCancel(){ tracking = false; }

  // usa passive:true — não precisamos de preventDefault; só observamos o gesto
  document.addEventListener('touchstart', onStart, {passive:true});
  document.addEventListener('touchmove',  onMove,  {passive:true});
  document.addEventListener('touchend',   onEnd,   {passive:true});
  document.addEventListener('touchcancel',onCancel,{passive:true});

  // Expõe a lista de páginas e a config de calibração pra ferramenta de
  // ajuste em Configurações (e pra qualquer outro script que precise).
  window.LF_SWIPE_TABS = {
    pages: PAGES,
    DEFAULTS: { threshold: DEFAULT_THRESHOLD, angle: DEFAULT_ANGLE },
    RANGES: { threshold: RANGE_THRESHOLD, angle: RANGE_ANGLE },
    getConfig: function(){ return { threshold: CFG.threshold, angle: CFG.angle }; },
    setConfig: function(next){
      next = next || {};
      CFG = {
        threshold: clampNum(next.threshold, RANGE_THRESHOLD[0], RANGE_THRESHOLD[1], CFG.threshold),
        angle:     clampNum(next.angle,     RANGE_ANGLE[0],     RANGE_ANGLE[1],     CFG.angle)
      };
      saveConfig(CFG);
      return { threshold: CFG.threshold, angle: CFG.angle };
    },
    resetConfig: function(){
      CFG = { threshold: DEFAULT_THRESHOLD, angle: DEFAULT_ANGLE };
      saveConfig(CFG);
      return { threshold: CFG.threshold, angle: CFG.angle };
    },
    // pra área de teste da tela de calibração (não navega, só avalia)
    testGesture: function(dx, dy, dt, cfgOverride){ return evalGesture(dx, dy, dt, cfgOverride); }
  };
})();
