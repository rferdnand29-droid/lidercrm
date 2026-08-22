/* =====================================================================
 * PATCH: lf-fix-modal-novaconv-travado-v1-20260801.js
 * ---------------------------------------------------------------------
 * SINTOMA
 *   Aba "Papos" (e qualquer outra tela) fica TRAVADA sob um overlay
 *   escuro/desfocado, com um quadradinho arredondado (~64px) contendo
 *   um "círculo" no centro da tela. Nenhum clique passa. Não há botão
 *   de fechar. F5 não resolve (volta igual).
 *
 * CAUSA RAIZ (confirmada)
 *   js/patches/lf-fix-definitivo-4bugs-r1-20260801.js, linhas 184-186,
 *   injeta o <style id="lf-fix-definitivo-4bugs-r1-style"> com a regra:
 *
 *     #mo-chat-new.mo { position:fixed !important; inset:0 !important;
 *                       display:flex !important; ...
 *                       z-index:2147483000 !important;
 *                       pointer-events:auto !important; }
 *
 *   O seletor NÃO exige o estado aberto (.open, que é o que openM()
 *   aplica em js/utils.js:172). Como a classe "mo" é estática no HTML
 *   (index.html:1876 -> <div class="mo" id="mo-chat-new">), a regra
 *   casa SEMPRE e sobrescreve, com !important:
 *     - css/style.css:182  .mo{display:none; pointer-events:none}
 *   Resultado: o modal "Nova conversa" fica PERMANENTEMENTE aberto,
 *   em tela cheia, no topo absoluto do z-index, capturando todos os
 *   cliques. Como está vazio (o .mb só é preenchido por chatNewConv()),
 *   o que se vê é:
 *     .mc  -> 0 + padding 11px + borda 1px  = ~64px, border-radius 10px
 *     .mb  -> 0 + padding 20px              = ~40px, border-radius 20px
 *   ou seja: o "quadradinho com uma bolinha dentro" do print.
 *   E closeM('mo-chat-new') (utils.js:188) só remove a classe .open —
 *   contra um display:flex !important isso não tem efeito nenhum:
 *   o modal é IMPOSSÍVEL de fechar pela UI.
 *
 * O QUE ESTE PATCH FAZ (aditivo, idempotente, não destrutivo)
 *   [1] Sanitiza o <style> ofensor: reescreve APENAS a regra quebrada,
 *       passando a exigir o estado aberto (.open/.on) e removendo o
 *       display:flex incondicional. O restante do 4bugs-r1 (BUG1/3/4 e
 *       o wrapper de openM) continua funcionando igual.
 *   [2] Injeta um CSS de guarda de altíssima especificidade que garante
 *       que qualquer .mo SEM .open/.on fique display:none e
 *       pointer-events:none — vale para #mo-chat-new e para qualquer
 *       outro modal que um patch futuro force do mesmo jeito.
 *   [3] MutationObserver: se o style ofensor for reinjetado (ou outro
 *       patch repetir o padrão), re-sanitiza na hora.
 *   [4] Watchdog leve (1x/s): detecta .mo visível e sem estado aberto,
 *       destrava e loga. Também remove backdrop de ctx-menu órfão.
 *   [5] Expõe window.lfDestravarTela() para destravar na hora pelo
 *       DevTools, sem depender de deploy.
 *
 * ORDEM: carregar DEPOIS de lf-fix-definitivo-4bugs-r1-20260801.js
 *        (idealmente como último <script> de patches).
 * REVERTER: remover a tag <script> (ver rollback-*.sh).
 * ===================================================================== */
(function (global) {
  'use strict';

  var D = global.document;
  if (!D) return;
  if (global.__lfFixModalTravadoArmed) return;
  global.__lfFixModalTravadoArmed = 1;

  var TAG = '[lf-fix-modal-novaconv-travado v1-20260801]';
  var OFFENDER_STYLE_ID = 'lf-fix-definitivo-4bugs-r1-style';
  var GUARD_STYLE_ID = 'lf-fix-modal-novaconv-travado-style';

  function log() {
    try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {}
  }
  function warn() {
    try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {}
  }

  /* -------------------------------------------------------------------
   * [1] Sanitiza a regra ofensora dentro do <style> do 4bugs-r1.
   *     Estratégia cirúrgica: em vez de apagar o style inteiro (o que
   *     mataria o reforço legítimo de z-index/scroll do modal quando ele
   *     REALMENTE abre), reescrevemos só o seletor e tiramos o
   *     display:flex incondicional.
   * ----------------------------------------------------------------- */
  var SANITIZED_CSS = [
    /* Regra corrigida: só vale quando o modal está de fato aberto.     */
    '#mo-chat-new.mo.open, #mo-chat-new.mo.on {',
    '  position:fixed !important; inset:0 !important; display:flex !important;',
    '  align-items:center !important; justify-content:center !important;',
    '  z-index:2147483000 !important; pointer-events:auto !important;',
    '}',
    /* Fechado = escondido e transparente a cliques (restaura style.css) */
    '#mo-chat-new.mo:not(.open):not(.on) {',
    '  display:none !important; pointer-events:none !important;',
    '}',
    '#mo-chat-new .mb {',
    '  position:relative !important; z-index:2147483000 !important;',
    '  max-height:92vh !important; overflow:auto !important;',
    '}',
    '#mo-chat-new.on .mb { transform:none !important; }'
  ].join('\n');

  function sanitizeOffender() {
    try {
      var st = D.getElementById(OFFENDER_STYLE_ID);
      if (!st) return false;
      var txt = st.textContent || '';
      // Já sanitizado? (marcador) -> não mexe de novo.
      if (st.getAttribute('data-lf-sanitized') === '1') return false;
      // Só age se a regra quebrada estiver mesmo lá.
      var quebrada = /#mo-chat-new\.mo\s*\{[^}]*display\s*:\s*flex/i.test(txt);
      if (!quebrada) {
        st.setAttribute('data-lf-sanitized', '1');
        return false;
      }
      st.textContent = SANITIZED_CSS;
      st.setAttribute('data-lf-sanitized', '1');
      log('style "' + OFFENDER_STYLE_ID + '" sanitizado: #mo-chat-new.mo agora exige .open/.on.');
      return true;
    } catch (e) {
      warn('falha ao sanitizar o style ofensor:', e && e.message);
      return false;
    }
  }

  /* -------------------------------------------------------------------
   * [2] CSS de guarda genérico: rede de segurança para QUALQUER .mo.
   *     Especificidade alta + !important + carregado por último.
   *     Obs.: não usamos "*" nem tocamos em modais abertos.
   * ----------------------------------------------------------------- */
  function injectGuardCSS() {
    try {
      if (D.getElementById(GUARD_STYLE_ID)) return;
      var css = [
        '/* lf-fix-modal-novaconv-travado v1-20260801 — guarda global */',
        'body .mo:not(.open):not(.on):not(.force-on) {',
        '  display:none !important;',
        '  pointer-events:none !important;',
        '  opacity:0 !important;',
        '}',
        /* Se algum modal abrir de fato mas vier vazio, ao menos não     */
        /* deixa o usuário preso: o clique no backdrop fecha (o handler  */
        /* inline do index.html:1876 depende de pointer-events auto).    */
        'body .mo.open, body .mo.on { pointer-events:auto !important; }'
      ].join('\n');
      var st = D.createElement('style');
      st.id = GUARD_STYLE_ID;
      st.appendChild(D.createTextNode(css));
      (D.head || D.documentElement).appendChild(st);
      log('CSS de guarda injetado.');
    } catch (e) {
      warn('falha ao injetar CSS de guarda:', e && e.message);
    }
  }

  /* -------------------------------------------------------------------
   * [3] Observer: se o style ofensor voltar (reinjeção, hot reload,
   *     outro patch clonando o padrão), sanitiza de novo.
   * ----------------------------------------------------------------- */
  function armObserver() {
    try {
      if (!global.MutationObserver) return;
      var mo = new global.MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes || [];
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n && n.nodeType === 1 && n.tagName === 'STYLE') {
              if (n.id === OFFENDER_STYLE_ID) { sanitizeOffender(); }
              else if (/#mo-[a-z0-9-]+\.mo\s*\{[^}]*display\s*:\s*flex/i.test(n.textContent || '')) {
                warn('outro <style> força um .mo aberto incondicionalmente:', n.id || '(sem id)');
              }
            }
          }
        }
      });
      mo.observe(D.documentElement, { childList: true, subtree: true });
      global.__lfFixModalTravadoObserver = mo;
    } catch (e) {
      warn('observer não armado:', e && e.message);
    }
  }

  /* -------------------------------------------------------------------
   * [4] Watchdog: detecta tela travada por overlay e destrava.
   *     Barato: 1x por segundo, só olha os .mo e o backdrop do ctx-menu.
   * ----------------------------------------------------------------- */
  function unstickOnce(reason) {
    var agiu = false;
    try {
      var mos = D.querySelectorAll('.mo');
      for (var i = 0; i < mos.length; i++) {
        var el = mos[i];
        var aberto = el.classList.contains('open') || el.classList.contains('on');
        if (aberto) continue;
        var cs = null;
        try { cs = global.getComputedStyle(el); } catch (_e) {}
        if (!cs) continue;
        if (cs.display !== 'none' && cs.visibility !== 'hidden') {
          // Modal fechado, porém visível => é o travamento.
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
          warn('modal fantasma destravado:', '#' + (el.id || '?'), '| motivo:', reason);
          agiu = true;
        }
      }
    } catch (_e) {}
    // Backdrop de ctx-menu órfão (mesma família de travamento).
    try {
      var b = D.getElementById('chat-ctx-backdrop');
      var m = D.getElementById('chat-ctx-menu');
      var menuVazio = !m || !m.parentNode || !(m.innerHTML || '').trim();
      if (b && menuVazio) {
        b.parentNode && b.parentNode.removeChild(b);
        warn('backdrop de ctx-menu órfão removido | motivo:', reason);
        agiu = true;
      }
    } catch (_e) {}
    // Body preso em position:fixed pelo openM() sem nenhum modal aberto.
    try {
      if (!D.querySelector('.mo.open, .mo.on') && D.body && D.body.style.top && D.body.style.top !== '') {
        D.body.style.top = '';
        D.body.style.position = '';
        D.body.style.width = '';
        D.body.style.overflow = '';
        agiu = true;
      }
    } catch (_e) {}
    return agiu;
  }

  global.lfDestravarTela = function () {
    sanitizeOffender();
    injectGuardCSS();
    var r = unstickOnce('manual');
    log('lfDestravarTela() executado.', r ? 'Algo foi destravado.' : 'Nada estava travado.');
    return r;
  };

  /* -------------------------------------------------------------------
   * Bootstrap
   * ----------------------------------------------------------------- */
  function boot() {
    injectGuardCSS();     // primeiro a guarda (efeito imediato no paint)
    sanitizeOffender();   // depois a correção cirúrgica no style ofensor
    unstickOnce('boot');
    armObserver();
    var ticks = 0;
    var iv = setInterval(function () {
      ticks++;
      unstickOnce('watchdog');
      // Depois de 120s sem incidentes, reduz para 1x a cada 5s.
      if (ticks === 120) {
        clearInterval(iv);
        setInterval(function () { unstickOnce('watchdog-lento'); }, 5000);
      }
    }, 1000);
    // ESC sempre destrava (último recurso do usuário).
    D.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) unstickOnce('escape');
    }, true);
    log('armado. Use window.lfDestravarTela() se algo travar.');
  }

  if (D.readyState === 'loading') {
    D.addEventListener('DOMContentLoaded', boot, { once: true });
    setTimeout(boot, 2500); // fallback: boot() é idempotente
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
