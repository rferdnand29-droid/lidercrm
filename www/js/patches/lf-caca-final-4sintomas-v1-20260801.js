/* =============================================================================
 * lf-caca-final-4sintomas-v1-20260801.js
 *
 * CORREÇÃO DEFINITIVA — 4 sintomas com causa raiz compartilhada:
 *   [S1] Overlay fantasma do #mo-chat-new bloqueia cliques na tela inteira
 *        (impede editar/movimentar leads, trava nova conversa)
 *   [S2] Grupos com dissolved=true não somem da lista (renderChatList
 *        em chat.js:343 filtra só !archived; nunca filtra dissolved)
 *   [S3] Console em loop infinito com "[lf-splash-unstuck] Splash saiu
 *        normalmente em Xms" — sem singleton no _log
 *   [S4] Body preso em position:fixed pelo openM sem modal aberto
 *
 * CARREGAR POR ÚLTIMO. Idempotente. Reverter = remover a <script> tag.
 * ============================================================================= */
(function (global) {
  'use strict';
  if (global.__LF_CACA_FINAL_4S__) return;
  global.__LF_CACA_FINAL_4S__ = true;

  var D = global.document;
  var TAG = '[lf-caca-final-4sintomas v1-20260801]';
  function log(){ try{ console.log.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function warn(){ try{ console.warn.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_e){} }

  /* ═══════════════════════════════════════════════════════════════════════════
   * [S1] Mata o overlay fantasma do #mo-chat-new (e qualquer .mo travada).
   *      Estratégia dupla:
   *        (a) CSS de guarda de altíssima especificidade (carrega por último);
   *        (b) Reverter body/html se ficaram presos por openM() sem modal aberto.
   * ═════════════════════════════════════════════════════════════════════════ */
  try {
    var GUARD_ID = 'lf-caca-final-4s-guard';
    if (!D.getElementById(GUARD_ID)) {
      var css = [
        '/* lf-caca-final-4sintomas v1 — guarda global de .mo */',
        'html body .mo:not(.open):not(.on):not(.force-on){',
        '  display:none !important;',
        '  pointer-events:none !important;',
        '  opacity:0 !important;',
        '  visibility:hidden !important;',
        '}',
        'html body .mo.open, html body .mo.on{',
        '  pointer-events:auto !important;',
        '  visibility:visible !important;',
        '  opacity:1 !important;',
        '}'
      ].join('\n');
      var st = D.createElement('style');
      st.id = GUARD_ID;
      st.appendChild(D.createTextNode(css));
      (D.head || D.documentElement).appendChild(st);
      log('CSS de guarda de .mo injetado.');
    }

    function unstickOnce(reason){
      var agiu = false;
      try {
        var mos = D.querySelectorAll('.mo');
        for (var i=0; i<mos.length; i++){
          var el = mos[i];
          if (el.classList.contains('open') || el.classList.contains('on')) continue;
          var cs = global.getComputedStyle(el);
          if (cs && cs.display !== 'none' && cs.visibility !== 'hidden'){
            el.style.setProperty('display','none','important');
            el.style.setProperty('pointer-events','none','important');
            warn('modal fantasma destravado:', '#'+(el.id||'?'), '| motivo:', reason);
            agiu = true;
          }
        }
      } catch(_e){}
      try {
        if (!D.querySelector('.mo.open, .mo.on') && D.body){
          if (D.body.style.position === 'fixed' || D.body.style.top){
            D.body.style.top = '';
            D.body.style.position = '';
            D.body.style.width = '';
            D.body.style.overflow = '';
            agiu = true;
          }
        }
      } catch(_e){}
      return agiu;
    }
    global.lfDestravarTelaFinal = unstickOnce;
    setInterval(function(){ unstickOnce('watchdog-1s'); }, 1000);
    D.addEventListener('keydown', function(e){
      if (e.key === 'Escape') unstickOnce('escape');
    }, true);
  } catch(e){ warn('[S1] falhou', e && e.message); }

  /* ═══════════════════════════════════════════════════════════════════════════
   * [S2] Grupos dissolvidos não somem — renderChatList não filtra.
   * ═════════════════════════════════════════════════════════════════════════ */
  try {
    var origRender = global.renderChatList;
    if (typeof origRender === 'function' && !origRender.__lfCacaFinal){
      var wrapped = function(){
        try {
          if (typeof global._chatGetConvs === 'function' &&
              typeof global._chatSaveConvs === 'function'){
            var convs = global._chatGetConvs() || [];
            var kept  = [];
            var purged = 0;
            for (var i=0; i<convs.length; i++){
              var c = convs[i];
              if (c && c.isGroup && c.dissolved === true){
                purged++;
                try {
                  if (typeof global._chatPurgeLocalConv === 'function'){
                    global._chatPurgeLocalConv(c.id, 'dissolved-cleanup');
                    continue;
                  }
                } catch(_e){}
                continue;
              }
              kept.push(c);
            }
            if (purged > 0){
              global._chatSaveConvs(kept);
              log('purgados', purged, 'grupo(s) dissolvido(s) da lista local.');
            }
          }
        } catch(_e){ warn('[S2] pré-purga falhou', _e && _e.message); }
        return origRender.apply(this, arguments);
      };
      wrapped.__lfCacaFinal = true;
      global.renderChatList = wrapped;
      log('renderChatList envelopado — filtro de dissolved instalado.');
    }
  } catch(e){ warn('[S2] falhou', e && e.message); }

  /* ═══════════════════════════════════════════════════════════════════════════
   * [S3] Splash-unstuck em loop infinito.
   * ═════════════════════════════════════════════════════════════════════════ */
  try {
    if (global.__lfUnstuckIv){
      try { clearInterval(global.__lfUnstuckIv); } catch(_e){}
      global.__lfUnstuckIv = null;
      log('interval do lf-splash-unstuck derrubado (era o loop do console).');
    }
    if (global.__lfUnstuckTo){
      try { clearTimeout(global.__lfUnstuckTo); } catch(_e){}
      global.__lfUnstuckTo = null;
    }
    global.__lfUnstuckSilenced = true;
  } catch(e){ warn('[S3] falhou', e && e.message); }

  /* ═══════════════════════════════════════════════════════════════════════════
   * Diagnóstico: window.lfCacaFinalStatus()
   * ═════════════════════════════════════════════════════════════════════════ */
  global.lfCacaFinalStatus = function(){
    var status = {
      guardCSS: !!D.getElementById('lf-caca-final-4s-guard'),
      modaisFantasmas: (function(){
        var n=0, ms=D.querySelectorAll('.mo');
        for (var i=0;i<ms.length;i++){
          var el=ms[i]; if (el.classList.contains('open')||el.classList.contains('on')) continue;
          var cs=global.getComputedStyle(el);
          if (cs && cs.display!=='none') n++;
        }
        return n;
      })(),
      bodyPreso: !!(D.body && D.body.style.position === 'fixed'),
      renderChatListEnvelopado: !!(global.renderChatList && global.renderChatList.__lfCacaFinal),
      splashUnstuckSilenciado: !!global.__lfUnstuckSilenced,
      gruposDissolvidosLocais: (function(){
        try {
          if (typeof global._chatGetConvs !== 'function') return 'n/a';
          return (global._chatGetConvs()||[]).filter(function(c){ return c && c.dissolved===true; }).length;
        } catch(_e){ return 'n/a'; }
      })()
    };
    try { console.table(status); } catch(_e){ console.log(status); }
    return status;
  };

  log('4 sintomas cobertos (overlay .mo + grupos dissolvidos + splash loop + body preso). Use window.lfCacaFinalStatus() para diagnóstico.');
})(typeof window !== 'undefined' ? window : this);
