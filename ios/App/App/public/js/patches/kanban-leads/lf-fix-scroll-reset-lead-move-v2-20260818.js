/* ============================================================
 * lf-fix-scroll-reset-lead-move-v2-20260818.js
 * ------------------------------------------------------------
 * FIX DEFINITIVO (v2): "rolantes de etapa/lead voltam ao início
 * sozinhos após qualquer movimentação".
 *
 * A v1 (20260804) só cobria ~48ms (3 rAFs). Quando renderKBLocal
 * era chamado DE NOVO depois pelo _syncKBRemoteBG (ida à nuvem,
 * 200-1500ms), o wrap.innerHTML= recriava os cards e o scroll
 * caía a 0 sozinho.
 *
 * Estratégia v2 — regra invariante:
 *   "O SCROLL SÓ VOLTA A 0 SE O USUÁRIO ROLOU ATÉ 0 COM O DEDO
 *    OU MOUSE. Qualquer reset provocado por render/sync é
 *    revertido automaticamente."
 *
 * Como:
 *   1) Sentinela de intenção do usuário — escuta wheel,
 *      touchstart, touchmove, pointerdown, mousedown e scroll
 *      com isTrusted em todos os containers roláveis do Kanban.
 *      A "posição confirmada do usuário" só é atualizada por
 *      gesto real. Reset sem gesto é desfeito.
 *   2) MutationObserver por container — quando o DOM interno é
 *      recriado (innerHTML=), reaplica a última posição
 *      confirmada no microtask e em rAFs subsequentes.
 *   3) Trava por 3s após qualquer chamada de movimentação
 *      (_kbMoveCard, moveCard, mbReorderTap, setCardSub,
 *      applyBulkMove, assumeLead). Cobre o retorno do
 *      _syncKBRemoteBG.
 *   4) Suprime scroll com isTrusted=false dentro da janela de
 *      trava (revertido no mesmo frame).
 *   5) Neutraliza os wrappers legados quebrados.
 *
 * Escopo: leads, negocios, time-leads, time-negocios, mobile.
 * 100% client-side, idempotente, sem alterar features/regras.
 * ============================================================ */
(function(global){
  'use strict';
  if(!global) return;
  if(global.__lfFixScrollResetV2) return;
  global.__lfFixScrollResetV2 = true;

  var TAG='[lf-scroll-lock-v2]';
  function log(){ try{ console.log.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_e){} }

  var LOCK_MS = 3000; // trava por 3s após movimentação (cobre sync remoto)
  var CONFIRM_FRAMES = 6; // rAFs de reafirmação após mutação
  var _boards = ['leads','negocios','time-leads','time-negocios'];

  // Última posição confirmada por gesto do usuário
  var _userPos = {
    wraps: Object.create(null),      // '<board>' -> scrollLeft
    cols:  Object.create(null),      // '<board>::<colId>' -> scrollTop
    mobs:  Object.create(null),      // '<board>' -> scrollTop
    doc:   0
  };

  // Janela de trava (ms). Enquanto lockUntil > now, todo scroll não-confiável é revertido.
  var _lockUntil = 0;
  function _armLock(ms){ _lockUntil = Math.max(_lockUntil, Date.now() + (ms||LOCK_MS)); }
  function _isLocked(){ return Date.now() < _lockUntil; }

  /* ------------------------------------------------------------
   * Enumera containers roláveis
   * ------------------------------------------------------------ */
  function _wrapEl(b){ return document.getElementById(b+'-kanban'); }
  function _shellEl(b){
    var w = _wrapEl(b);
    return (w && w.closest) ? w.closest('.kb-scroll-wrap') : null;
  }
  function _mobEl(b){ return document.getElementById(b+'-mobile-list'); }
  function _colsOf(b){
    var w = _wrapEl(b);
    if(!w) return [];
    var out = [];
    w.querySelectorAll('.kb-col').forEach(function(colEl){
      var colId = colEl && colEl.dataset ? colEl.dataset.col : '';
      var cards = colEl.querySelector('.kb-cards');
      if(colId && cards) out.push({ id: colId, el: cards });
    });
    return out;
  }
  function _docEl(){
    return document.scrollingElement || document.documentElement || document.body;
  }

  /* ------------------------------------------------------------
   * Update "posição confirmada" a partir de gesto real
   * ------------------------------------------------------------ */
  function _confirmFromGesture(){
    try{
      _boards.forEach(function(b){
        var sh = _shellEl(b); if(sh) _userPos.wraps[b] = sh.scrollLeft || 0;
        _colsOf(b).forEach(function(c){
          _userPos.cols[b+'::'+c.id] = c.el.scrollTop || 0;
        });
        var mb = _mobEl(b); if(mb) _userPos.mobs[b] = mb.scrollTop || 0;
      });
      var d = _docEl(); if(d) _userPos.doc = d.scrollTop || 0;
    }catch(_e){}
  }

  /* ------------------------------------------------------------
   * Aplica a posição confirmada de volta a todos os containers
   * ------------------------------------------------------------ */
  function _restore(){
    try{
      _boards.forEach(function(b){
        var sh = _shellEl(b);
        if(sh && _userPos.wraps[b] != null){
          var maxL = Math.max(0, sh.scrollWidth - sh.clientWidth);
          var wanted = Math.max(0, Math.min(_userPos.wraps[b], maxL));
          if(sh.scrollLeft !== wanted) sh.scrollLeft = wanted;
        }
        _colsOf(b).forEach(function(c){
          var key = b+'::'+c.id;
          if(!(key in _userPos.cols)) return;
          var maxT = Math.max(0, c.el.scrollHeight - c.el.clientHeight);
          var wanted = Math.max(0, Math.min(_userPos.cols[key], maxT));
          if(c.el.scrollTop !== wanted) c.el.scrollTop = wanted;
        });
        var mb = _mobEl(b);
        if(mb && _userPos.mobs[b] != null){
          var maxM = Math.max(0, mb.scrollHeight - mb.clientHeight);
          var wanted2 = Math.max(0, Math.min(_userPos.mobs[b], maxM));
          if(mb.scrollTop !== wanted2) mb.scrollTop = wanted2;
        }
      });
      if(_userPos.doc > 0){
        var d = _docEl();
        if(d){
          var maxD = Math.max(0, d.scrollHeight - d.clientHeight);
          var wantedD = Math.max(0, Math.min(_userPos.doc, maxD));
          if(d.scrollTop !== wantedD) d.scrollTop = wantedD;
        }
      }
    }catch(_e){}
  }

  function _reaffirm(){
    // microtask + 6 rAFs (cobre coalesce 24ms + latência de repintura).
    Promise.resolve().then(_restore);
    var n = 0;
    function tick(){
      _restore();
      if(++n < CONFIRM_FRAMES) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------
   * Sentinelas de gesto
   * ------------------------------------------------------------ */
  var _gestureActive = false;
  var _gestureEndTimer = null;

  function _markGesture(){
    _gestureActive = true;
    if(_gestureEndTimer) clearTimeout(_gestureEndTimer);
    // considera gesto "vivo" por 200ms após o último evento
    _gestureEndTimer = setTimeout(function(){
      _gestureActive = false;
      _confirmFromGesture();
    }, 200);
    // atualização imediata também
    _confirmFromGesture();
  }

  function _installGestureSentinels(){
    if(document.__lfScrollGestureBound) return;
    document.__lfScrollGestureBound = true;

    var GESTURE_EVTS = ['wheel','touchstart','touchmove','touchend',
                        'pointerdown','pointerup','mousedown','mouseup',
                        'keydown']; // PgUp/PgDn/Space contam
    GESTURE_EVTS.forEach(function(evt){
      document.addEventListener(evt, function(ev){
        if(!ev || ev.isTrusted === false) return;
        _markGesture();
      }, { capture:true, passive:true });
    });

    // scroll capture: se scroll dispara em container do kanban e NÃO
    // veio de gesto do usuário E estamos em lock, reverte.
    document.addEventListener('scroll', function(ev){
      var t = ev && ev.target;
      if(!t) return;
      var isKBContainer = false;
      try{
        // scroll no document
        if(t === document || t === document.body || t === document.documentElement){
          isKBContainer = true;
        } else if(t.classList){
          if(t.classList.contains('kb-cards') ||
             t.classList.contains('kb-scroll-wrap') ||
             (t.id && /-(kanban|mobile-list)$/.test(t.id))){
            isKBContainer = true;
          }
        }
      }catch(_e){}
      if(!isKBContainer) return;
      if(_gestureActive){
        // scroll durante gesto real → atualiza posição confirmada
        _confirmFromGesture();
      } else if(_isLocked()){
        // scroll sem gesto durante lock → programado (render, sync). Reverte.
        _reaffirm();
      }
    }, { capture:true, passive:true });

    log('sentinelas de gesto instaladas');
  }

  /* ------------------------------------------------------------
   * MutationObservers — recriação de DOM interno = re-aplica scroll
   * ------------------------------------------------------------ */
  var _mo = null;
  var _observed = new WeakSet();

  function _attachObserverTo(el){
    if(!el || _observed.has(el)) return;
    _observed.add(el);
    try{
      var localMO = new MutationObserver(function(){
        // Se não é gesto do usuário, a mutação foi programada → reafirma.
        if(!_gestureActive) _reaffirm();
      });
      localMO.observe(el, { childList:true, subtree:false });
    }catch(_e){}
  }

  function _rescanObservers(){
    _boards.forEach(function(b){
      var w = _wrapEl(b);
      if(w){
        w.querySelectorAll('.kb-cards').forEach(_attachObserverTo);
      }
      var mb = _mobEl(b);
      if(mb) _attachObserverTo(mb);
    });
  }

  function _installGlobalObserver(){
    if(_mo) return;
    try{
      _mo = new MutationObserver(function(muts){
        // Novos .kb-cards podem ter surgido — reanexa observers e reafirma.
        var needsRescan = false;
        for(var i=0;i<muts.length;i++){
          var m = muts[i];
          if(m.addedNodes && m.addedNodes.length){
            for(var j=0;j<m.addedNodes.length;j++){
              var n = m.addedNodes[j];
              if(n && n.nodeType === 1){ needsRescan = true; break; }
            }
          }
          if(needsRescan) break;
        }
        if(needsRescan){
          _rescanObservers();
          if(!_gestureActive) _reaffirm();
        }
      });
      _mo.observe(document.body || document.documentElement, {
        childList:true, subtree:true
      });
    }catch(_e){}
    _rescanObservers();
  }

  /* ------------------------------------------------------------
   * Wrappers de movimentação — armam a trava por LOCK_MS
   * ------------------------------------------------------------ */
  function _wrapMoveFns(){
    var names = ['_kbMoveCard','moveCard','mbReorderTap','setCardSub',
                 'applyBulkMove','assumeLead','_spSelect'];
    names.forEach(function(name){
      var orig = global[name];
      if(typeof orig !== 'function') return;
      if(orig.__lfScrollLockV2) return;
      var wrapped = function(){
        _confirmFromGesture(); // congela posição ANTES do move
        _armLock(LOCK_MS);
        var ret;
        try{ ret = orig.apply(this, arguments); }
        finally{ _reaffirm(); }
        return ret;
      };
      // preserva flags idempotentes de wrappers anteriores
      Object.keys(orig).forEach(function(k){
        try{ wrapped[k] = orig[k]; }catch(_e){}
      });
      wrapped.__lfScrollLockV2 = true;
      global[name] = wrapped;
      if(global.KB){ try{ global.KB[name] = wrapped; }catch(_e){} }
    });

    // renderKBLocal / renderKBMobile / refreshKBAffected —
    // se chamados fora de gesto, também reafirmam posição.
    ['renderKBLocal','renderKBMobile','refreshKBAffected'].forEach(function(name){
      var orig = global[name];
      if(typeof orig !== 'function') return;
      if(orig.__lfScrollLockV2) return;
      var wrapped = function(){
        var wasGesture = _gestureActive;
        var ret;
        try{ ret = orig.apply(this, arguments); }
        finally{
          if(!wasGesture) _reaffirm();
        }
        return ret;
      };
      Object.keys(orig).forEach(function(k){
        try{ wrapped[k] = orig[k]; }catch(_e){}
      });
      wrapped.__lfScrollLockV2 = true;
      global[name] = wrapped;
    });
  }

  /* ------------------------------------------------------------
   * Bootstrap com retry — as funções chegam via <script> assíncronos
   * ------------------------------------------------------------ */
  var _tries = 0;
  function _install(){
    _tries++;
    _installGestureSentinels();
    _installGlobalObserver();
    _wrapMoveFns();
    // Reagenda pra pegar funções que aparecerem depois.
    if(_tries < 60) setTimeout(_install, 200);
  }

  // Neutraliza flags dos wrappers legados quebrados (defensivo)
  try{
    global.__lf4xScrollNeutralized = true;
    global.__lf5xScrollNeutralized = true;
  }catch(_e){}

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _install);
  } else {
    _install();
  }

  // Confirma posição inicial após carga
  setTimeout(_confirmFromGesture, 800);

  log('patch v2 carregado — trava de scroll durante '+LOCK_MS+'ms após movimentação');
})(window);
