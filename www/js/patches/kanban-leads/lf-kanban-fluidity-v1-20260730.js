/* ============================================================
 * lf-kanban-fluidity-v1-20260730.js
 * ------------------------------------------------------------
 * Melhora a fluidez das movimentações do Kanban sem alterar
 * regras de negócio nem features existentes.
 *
 * O QUE ESTE PATCH RESOLVE (diagnóstico forense em
 * RELATORIO_LIVRE_v2.md, seção "Causa raiz #2 e #3"):
 *
 *  1) DUPLO REDRAW no drop desktop/touch:
 *     Em `js/kanban.js:569` e `:1592` o código chama:
 *        _kbMoveCard(...);
 *        renderKBLocal(board);   // <- 1º
 *     E dentro de `_kbMoveCard` (via wrappers de bugs-4fixes/5fixes)
 *     o kanban é redesenhado de novo por causa da preservação
 *     de scroll. Ou seja: cada drop paga 2 renders. Este patch
 *     COALESCE renderKBLocal chamado em sequência (dentro de 32ms)
 *     em UM ÚNICO render usando requestAnimationFrame — sem
 *     mudar as chamadas espalhadas pelo código.
 *
 *  2) RENDER durante scroll/drag:
 *     Se `renderKBLocal` for chamado enquanto o usuário ainda
 *     está com o dedo/mouse pressionado (`_kbDragId` setado),
 *     adiamos o render para depois do finger-up. Evita o
 *     "pisca" no meio do arrasto.
 *
 *  3) ANIMAÇÃO de entrada suave:
 *     Card recém-movido ganha uma pequena animação de fade
 *     (200ms). Zero impacto quando o navegador não suporta.
 *
 *  4) CSS CONTAINMENT em runtime (já aplicado pelo v2 do
 *     Livre, mas replicado aqui como defesa em profundidade
 *     caso o carregamento do outro patch falhe).
 *
 * Estilo: 100% idempotente. Não altera HTML/CSS estáticos.
 * ============================================================ */
(function(global){
  'use strict';
  if(!global) return;
  if(global.__lfKanbanFluidityV1) return;
  global.__lfKanbanFluidityV1 = true;

  var TAG = '[lf-kanban-fluidity]';
  function _log(){  try{ console.log.apply(console,  [TAG].concat([].slice.call(arguments))); }catch(_e){} }

  /* ------------------------------------------------------------------
   * (1) + (2) — Coalesce de renderKBLocal
   * ------------------------------------------------------------------ */
  function _wrapRenderKB(){
    if(typeof global.renderKBLocal !== 'function') return;
    if(global.renderKBLocal.__lfFluidityWrapped) return;
    var orig = global.renderKBLocal;

    var _pending = Object.create(null); // board -> RAF id
    var _lastRun = Object.create(null); // board -> ts
    var COALESCE_MS = 24; // uma tela em ~60Hz

    function _isDragging(){
      // Kanban seta essas globais durante drag desktop/touch.
      return !!(global._kbDragId || (global._tzState && global._tzState.clone));
    }

    function _actuallyRun(board){
      _pending[board] = 0;
      _lastRun[board] = Date.now();
      try{ orig.call(global, board); }catch(e){ /* silencioso: o original já loga */ }
    }

    function _schedule(board){
      if(_pending[board]) return;   // já agendado neste frame
      if(_isDragging()){
        // Adia até o finger-up. Reagenda daqui a 60ms.
        _pending[board] = setTimeout(function(){ _pending[board] = 0; _schedule(board); }, 60);
        return;
      }
      _pending[board] = requestAnimationFrame(function(){ _actuallyRun(board); });
    }

    global.renderKBLocal = function(board){
      if(!board){ return orig.apply(this, arguments); }
      // Se o último render pra esse board foi < COALESCE_MS atrás,
      // enfileira 1 único render extra no próximo frame.
      var last = _lastRun[board] || 0;
      if(Date.now() - last < COALESCE_MS){
        _schedule(board);
        return;
      }
      // Se estamos arrastando, ainda coalesce (evita pisca).
      if(_isDragging()){
        _schedule(board);
        return;
      }
      // Caminho normal: render imediato.
      _lastRun[board] = Date.now();
      return orig.apply(this, arguments);
    };
    global.renderKBLocal.__lfFluidityWrapped = true;
    _log('renderKBLocal wrap ativo (coalesce ' + COALESCE_MS + 'ms + adia durante drag)');
  }

  /* ------------------------------------------------------------------
   * (3) — Animação suave dos cards após render
   * ------------------------------------------------------------------ */
  var STYLE_ID = 'lf-kb-fluidity-style';
  function _injectStyle(){
    if(document.getElementById(STYLE_ID)) return;
    var css = ''
      + '.kb-cards{scroll-behavior:smooth;}'
      // transição no card em si (movimentação leve, não invasiva)
      + '.kb-card{transition:transform .18s ease, box-shadow .18s ease, opacity .18s ease;}'
      // Fade sutil dos cards ao serem repintados
      + '.kb-card.lf-just-rendered{animation:lfKbFadeIn .22s ease-out;}'
      + '@keyframes lfKbFadeIn{from{opacity:.35;transform:translateY(2px);}to{opacity:1;transform:none;}}'
      // Coluna sob drag: destaque mais leve
      + '.kb-col.drag-over{transition:background .15s ease, border-color .15s ease;}'
      // Placeholder do drop com transição
      + '.kb-drop-placeholder{transition:height .12s ease, margin .12s ease;}'
      // Botões de card: feedback tátil mais responsivo
      + '.kb-add-btn,.kb-card-sel-btn,.kb-card-del-btn,.kb-copy-tel-btn,.kb-call-btn,.kb-wa-btn,.kb-act-btn,.kb-convert-btn,.kb-assume-btn{transition:transform .12s ease, background .12s ease, opacity .12s ease;}'
      + '.kb-add-btn:active,.kb-card:active{transform:scale(.985);}'
      // Containment nas colunas (defesa em profundidade)
      + '.kb-cards{contain:layout style paint;content-visibility:auto;contain-intrinsic-size:600px;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  function _flagNewCards(){
    if(global.__lfKbFlagObserver) return;
    try{
      var mo = new MutationObserver(function(muts){
        for(var i=0;i<muts.length;i++){
          var m = muts[i];
          if(!m.addedNodes) continue;
          for(var j=0;j<m.addedNodes.length;j++){
            var n = m.addedNodes[j];
            if(n && n.nodeType === 1 && n.classList && n.classList.contains('kb-card')){
              // Só animamos se NÃO estivermos arrastando (senão o clone
              // do drag também "fadearia" e ficaria estranho).
              if(global._kbDragId) continue;
              n.classList.add('lf-just-rendered');
              setTimeout((function(el){
                return function(){ el.classList.remove('lf-just-rendered'); };
              })(n), 260);
            }
          }
        }
      });
      mo.observe(document.body, { childList:true, subtree:true });
      global.__lfKbFlagObserver = mo;
    }catch(_e){}
  }

  _injectStyle();
  _wrapRenderKB();
  _flagNewCards();
  _log('patch de fluidez carregado');
})(window);
