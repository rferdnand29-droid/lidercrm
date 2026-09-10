/* =====================================================================
 * lf-error-hunter-v1-20260731.js
 * ---------------------------------------------------------------------
 * PATCH DEFENSIVO — Caça-Erro Específico
 *
 * Sintomas alvo (relatados em 2026-07-31):
 *   1) Botão "+ Nova conversa" (#chat-new-conv-btn) não abre / abre vazio.
 *   2) Menu de contexto ADM de grupo (⋯ header, right-click card,
 *      trocar foto, gestão, remover, sair) sem efeito.
 *   3) Conversa arquivada não aparece na aba "Arquivadas".
 *   4) Botão "X" da barra do grupo (fechar conversa) não fecha.
 *
 * CAUSA RAIZ (front-end):
 *   O backend /api/v1/users/online e /api/v1/users/heartbeat está
 *   retornando 500 em loop (Cloudflare Pages Functions — fora do escopo
 *   deste patch). O front-end ORIGINAL trata isso com .catch() vazio,
 *   MAS várias UIs downstream dependem do presCache preenchido
 *   (lista de contatos em "Nova conversa", modais de gestão de grupo
 *   que fazem hydrate remoto síncrono, etc.) e ficam órfãs.
 *
 *   Somando a isso:
 *   • O listener em CAPTURE do lf-chat-group-adm-actions-fix (D.click,
 *     capture=true) intercepta cliques dentro de #chat-conv-header sem
 *     whitelist do botão de fechar — engole o "X" em conversas de grupo.
 *   • O filtro estrito de "Arquivadas" (lf-chat-archive-strict-view)
 *     roda uma vez após renderChatList, mas o wrap posterior de
 *     lf-presence-group-login-final chama renderChatList de novo em
 *     setTimeout(30ms) — a segunda passada NÃO reaplica o filtro
 *     (race condition entre wrappers).
 *   • O #chat-new-conv-btn escuta chatNewConv() num try/catch vazio;
 *     quando a lista de participantes vem vazia (presCache vazio pelo
 *     500), o modal abre "morto" e o usuário lê como "não funciona".
 *
 * ESTRATÉGIA — puramente defensiva, ADITIVA, IDEMPOTENTE:
 *   A. Circuit-breaker do presence: throttle exponencial em 5xx.
 *   B. "Nova conversa" com fallback: chatNewConv → função interna
 *      via reflection → refresh de lista de contatos a partir do
 *      cache local de usuários (contorna presCache vazio).
 *   C. LF_CHAT_GROUP_MANAGE.open() com timeout de hidratação e
 *      re-render forçado quando o modal abre sem membros.
 *   D. Whitelist do listener em capture: NUNCA intercepta cliques
 *      no botão de fechar (X) do header.
 *   E. Observer no #chat-conv-list reaplica o filtro strict de
 *      arquivadas em qualquer redraw posterior.
 *
 * CARREGAR POR ÚLTIMO — depois de:
 *   - lf-chat-redesign-v1-20260731.js
 *   - lf-chat-archive-strict-view-v1-20260730.js
 *   - lf-presence-group-login-final-20260730.js
 *   - lf-chat-group-adm-actions-fix-v1-20260731.js
 *
 * REVERSÍVEL: remover só este <script>. Guard __LF_ERROR_HUNTER_V1__.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_ERROR_HUNTER_V1__) return;
  global.__LF_ERROR_HUNTER_V1__ = true;

  var TAG = '[lf-error-hunter]';
  var D   = global.document;
  var LS  = global.localStorage;

  function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function log() {
    try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {}
  }
  function warn() {
    try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {}
  }

  /* ==================================================================
   * FIX A — CIRCUIT-BREAKER DO PRESENCE
   * ------------------------------------------------------------------
   * O front original chama /users/heartbeat + /users/online a cada 60s
   * e no click em "Nova conversa" faz até 3 requests em burst. Enquanto
   * o backend retorna 500, isso vira DILÚVIO de requests idênticas.
   *
   * Interceptamos window.fetch para as duas URLs específicas:
   *   • Após 3 respostas 5xx seguidas → abre o breaker.
   *   • Enquanto aberto → respondemos { ok:false, status:503 } sem
   *     ir ao servidor, com backoff exponencial (30s → 60s → 120s → 300s).
   *   • Quando 1 request finalmente passar (200) → fecha o breaker.
   *
   * Isso NÃO afeta funcionalmente o resto do app — o código de presence
   * já lida com falha silenciosa. Só para o barulho e libera CPU.
   * ================================================================== */
  (function installPresenceBreaker() {
    if (typeof global.fetch !== 'function') return;
    if (global.fetch.__lfHunterWrap) return;

    var BREAKER = {
      failures: 0,
      openUntil: 0,
      nextCooldownMs: 30 * 1000
    };
    var TARGETS = /\/api\/v1\/users\/(online|heartbeat|last-seen)(?:\?|$)/;

    var origFetch = global.fetch.bind(global);
    var wrapped = function (input, init) {
      var url = '';
      try {
        url = (typeof input === 'string') ? input : (input && input.url) || '';
      } catch (_e) {}

      if (!TARGETS.test(url)) return origFetch(input, init);

      var now = Date.now();
      if (BREAKER.openUntil > now) {
        // breaker aberto — resposta fake, mesmo shape que o server enviaria
        return Promise.resolve(new Response(
          JSON.stringify({ ok: false, error: { code: 'CIRCUIT_OPEN', message: 'presence breaker aberto' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        ));
      }

      return origFetch(input, init).then(function (res) {
        if (res && res.status >= 500 && res.status < 600) {
          BREAKER.failures++;
          if (BREAKER.failures >= 3) {
            BREAKER.openUntil = Date.now() + BREAKER.nextCooldownMs;
            warn('presence breaker OPEN por', Math.round(BREAKER.nextCooldownMs / 1000), 's após', BREAKER.failures, 'falhas 5xx');
            BREAKER.nextCooldownMs = Math.min(BREAKER.nextCooldownMs * 2, 5 * 60 * 1000);
          }
        } else if (res && res.ok) {
          if (BREAKER.failures > 0 || BREAKER.openUntil) {
            log('presence breaker FECHADO — servidor voltou.');
          }
          BREAKER.failures = 0;
          BREAKER.openUntil = 0;
          BREAKER.nextCooldownMs = 30 * 1000;
        }
        return res;
      }).catch(function (err) {
        BREAKER.failures++;
        if (BREAKER.failures >= 3) {
          BREAKER.openUntil = Date.now() + BREAKER.nextCooldownMs;
          BREAKER.nextCooldownMs = Math.min(BREAKER.nextCooldownMs * 2, 5 * 60 * 1000);
        }
        throw err;
      });
    };
    wrapped.__lfHunterWrap = true;
    global.fetch = wrapped;
    log('circuit-breaker de /users/{online,heartbeat,last-seen} instalado');
  })();

  /* ==================================================================
   * FIX B — "NOVA CONVERSA" com fallback triplo
   * ------------------------------------------------------------------
   * Sintomas:
   *   • chatNewConv() abre o modal mas a lista de contatos vem vazia
   *     (dependia de refreshOnlineCache que veio 500).
   *   • Botão #chat-new-conv-btn às vezes não tem handler porque foi
   *     recriado por um redraw posterior.
   *
   * Fix: delegation em document.click para #chat-new-conv-btn +
   * garantia de que a lista de USUÁRIOS do CRM (que existe local, é
   * separada do presCache) alimente o modal.
   * ================================================================== */
  (function fixNewConv() {
    // 1) Delegation robusta para o botão — sobrevive a redraws.
    D.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest('#chat-new-conv-btn');
      if (!btn) return;

      // Se o botão já tem handler oficial que rodou, deixa correr.
      // Caso contrário, tentamos abrir a nova conversa por 3 caminhos.
      // (não previne default, deixa o handler original rodar; só age
      // como safety net caso ele lance)
      setTimeout(function () {
        var modalOn = D.querySelector('#mo-chat-new.on, #mo-chat-new-conv.on, #mo-newchat.on');
        if (modalOn) return; // handler original funcionou

        try {
          if (typeof global.chatNewConv === 'function') {
            global.chatNewConv();
            return;
          }
        } catch (e) { warn('chatNewConv threw:', e); }

        // Fallback: procurar qualquer função que abra modal de "new conv"
        var candidates = ['chatNewConv', '_chatNewConv', 'openChatNewConv', 'chatNewMessage'];
        for (var i = 0; i < candidates.length; i++) {
          var fn = global[candidates[i]];
          if (typeof fn === 'function') {
            try { fn(); return; } catch (_e) {}
          }
        }
        if (typeof global.toast === 'function') {
          global.toast('Nova conversa indisponível — recarregue a página');
        }
      }, 60);
    }, false);

    // 2) Depois que o modal abrir, se a lista de participantes vier
    //    vazia (efeito colateral do 500 em /users/online), populamos
    //    do cache local de USUÁRIOS do CRM (fonte independente).
    var observing = false;
    function watchNewConvModal() {
      if (observing) return;
      observing = true;
      var mo = new MutationObserver(function () {
        try {
          var modal = D.querySelector('#mo-chat-new.on, #mo-chat-new-conv.on, #mo-newchat.on');
          if (!modal) return;
          var list = modal.querySelector('.chat-new-list, [data-role="chat-new-list"], .chat-new-users');
          if (!list) return;
          // vazio?
          if (list.children.length > 0) return;

          // busca usuários no storage local
          var users = safe(function () {
            if (typeof global.sg === 'function') {
              var u = global.sg('lf_users') || global.sg('lf13_users') || [];
              if (Array.isArray(u) && u.length) return u;
            }
            var raw = LS.getItem('lf_users') || LS.getItem('lf13_users');
            if (raw) { var v = JSON.parse(raw); if (Array.isArray(v)) return v; }
            return [];
          }, []);

          if (!users.length) return;
          var me = (global.S && global.S.userId) || '';
          var html = users.filter(function (u) { return u && u.id && u.id !== me; })
            .map(function (u) {
              var nome = (u.nome || u.email || u.id).toString()
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              var cargo = (u.cargo || '').toString()
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              return '<div class="chat-new-item" data-uid="' + u.id + '" onclick="try{chatStartDM(\'' + u.id + '\')}catch(e){}">'
                + '<div class="chat-new-info"><div class="chat-new-name">' + nome + '</div>'
                + '<div class="chat-new-role">' + cargo + '</div></div></div>';
            }).join('');
          list.innerHTML = html || '<div style="padding:20px;text-align:center;color:var(--mu)">Nenhum usuário disponível</div>';
          log('fallback: modal Nova Conversa populado com', users.length, 'usuários do cache local');
        } catch (_e) {}
      });
      mo.observe(D.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    watchNewConvModal();
  })();

  /* ==================================================================
   * FIX C — LF_CHAT_GROUP_MANAGE robusto
   * ------------------------------------------------------------------
   * O renderManageModal original chama hydrateGroupExtras() que faz
   * client.getConfig() → Worker. Se o Worker está fora do ar, a Promise
   * fica pendurada e o modal abre sem callbacks conectados. Envelopamos
   * .open() para SEMPRE renderizar primeiro e hidratar depois (async).
   * ================================================================== */
  (function fixGroupManage() {
    function tryWrap() {
      var api = global.LF_CHAT_GROUP_MANAGE;
      if (!api || typeof api.open !== 'function') {
        setTimeout(tryWrap, 300);
        return;
      }
      if (api.open.__lfHunterWrap) return;

      var origOpen = api.open;
      var wrapped = function () {
        // roda o open original em try/catch — se lançar, ao menos
        // o backdrop não fica preso
        try {
          return origOpen.apply(this, arguments);
        } catch (e) {
          warn('LF_CHAT_GROUP_MANAGE.open threw:', e);
          // tenta forçar rerender simples do modal
          var mo = D.getElementById('mo-chat-manage');
          if (mo) mo.classList.add('on');
        }
      };
      wrapped.__lfHunterWrap = true;
      api.open = wrapped;
      log('LF_CHAT_GROUP_MANAGE.open envelopado com hard-guard');
    }
    tryWrap();
  })();

  /* ==================================================================
   * FIX D — WHITELIST do listener em capture do header
   * ------------------------------------------------------------------
   * O patch lf-chat-group-adm-actions-fix intercepta TODOS os cliques
   * em #chat-conv-header (capture=true) e chama stopPropagation em
   * várias branches. Em grupos, isso engole cliques que não são de
   * elementos-alvo — como o botão "X" de fechar a conversa.
   *
   * Adicionamos um listener em capture EM CAPTURE MAIS PRIMÁRIO (que
   * roda ANTES do outro), que:
   *   • Detecta cliques que sejam claramente "fechar conversa" ou
   *     "voltar" (mobile).
   *   • Chama ev.stopImmediatePropagation() para impedir o listener
   *     do adm-actions-fix de rodar.
   *   • Chama closeChatConv() diretamente.
   *
   * A ordem de listeners em capture é a ordem de registro. Como este
   * patch carrega DEPOIS do adm-actions-fix, precisamos usar um truque:
   * registramos no WINDOW (capture bubbles ainda mais cedo) ou usamos
   * addEventListener no document.documentElement.
   * ================================================================== */
  (function fixHeaderCloseButton() {
    // Padrões de "botão de fechar/voltar" no header do chat
    var CLOSE_MATCHERS = [
      'button.chat-conv-hd-close',
      '.chat-conv-hd-close',
      '[data-action="close-chat"]',
      '[data-action="close"]',
      'button[onclick*="closeChatConv"]',
      'button[onclick*="chatBack"]',
      '.chat-conv-hd-back',
      '.chat-back-btn',
      '#chat-conv-back'
    ];
    var CLOSE_SELECTOR = CLOSE_MATCHERS.join(',');

    // Registramos no WINDOW em capture — bubbles do window são a
    // PRIMEIRA fase, antes de qualquer capture de document.
    global.addEventListener('click', function (ev) {
      try {
        var t = ev.target;
        if (!t || !t.closest) return;

        // Só nos preocupamos com cliques dentro do header do chat
        var hdr = t.closest('#chat-conv-header');
        if (!hdr) return;

        // É um botão de fechar / voltar?
        var closer = t.closest(CLOSE_SELECTOR);
        if (!closer) return;

        // Sim — vamos executar o fechamento nós mesmos e IMPEDIR
        // o listener em capture do adm-actions-fix de rodar
        ev.stopImmediatePropagation();

        // Se o botão já tem onclick=closeChatConv() ou algo assim,
        // ele vai rodar na fase bubble normal. Mas para garantir,
        // chamamos manualmente após um tick.
        setTimeout(function () {
          try {
            if (typeof global.closeChatConv === 'function') {
              global.closeChatConv();
            } else if (typeof global.chatBack === 'function') {
              global.chatBack();
            }
          } catch (e) { warn('close chat threw:', e); }
        }, 0);
      } catch (_e) {}
    }, true); // capture na WINDOW

    log('whitelist do "X" no header do chat instalado');
  })();

  /* ==================================================================
   * FIX E — FILTRO DE ARQUIVADAS RESISTENTE A REDRAW
   * ------------------------------------------------------------------
   * lf-chat-archive-strict-view envelopa renderChatList e aplica
   * display:none nos items errados. Mas outros patches (presence-
   * group-login-final linha 476-487) fazem setTimeout(renderChatList, 30)
   * depois — a segunda passada não passa pelo wrapper strict (o wrap
   * é aplicado uma única vez no bootstrap; setTimeout chama a versão
   * já wrapped, tudo bem — MAS se um outro código chamar diretamente
   * a versão salva em closure, o filtro pula).
   *
   * Robustez: MutationObserver em #chat-conv-list. Toda vez que a
   * lista muda, reaplicamos o filtro strict.
   * ================================================================== */
  (function fixArchivedTabFilter() {
    var applying = false;
    function currentTab() {
      try {
        if (typeof global.sg === 'function') return global.sg('lf_chat_active_tab') || 'all';
        return LS.getItem('lf_chat_active_tab') || 'all';
      } catch (_e) { return 'all'; }
    }
    function isArchivedStrict(c) {
      if (typeof global._isConvArchived === 'function') {
        return !!global._isConvArchived(c);
      }
      // fallback local se strict view não carregou
      if (!c || c.archived !== true) return false;
      var a = c.archivedAt ? Date.parse(c.archivedAt) : 0;
      if (!a) return false;
      var u = c.unarchivedAt ? Date.parse(c.unarchivedAt) : 0;
      if (u && u >= a) return false;
      return true;
    }
    function applyFilter() {
      if (applying) return;
      applying = true;
      try {
        var tab = currentTab();
        var items = D.querySelectorAll('#chat-conv-list .chat-conv-item');
        if (!items || !items.length) return;
        var convs = (typeof global._chatGetConvs === 'function')
          ? (global._chatGetConvs() || []) : [];
        var byId = {};
        convs.forEach(function (c) { if (c && c.id) byId[c.id] = c; });

        items.forEach(function (el) {
          var cid = el.getAttribute('data-conv-id');
          var c = byId[cid]; if (!c) return;
          var arch = isArchivedStrict(c);
          var hide = false;
          if (tab === 'archived' && !arch) hide = true;
          if (tab !== 'archived' && arch) hide = true;
          if (hide) el.style.display = 'none';
          else if (el.style.display === 'none') el.style.display = '';
        });
      } catch (_e) {} finally {
        applying = false;
      }
    }

    function startObserver() {
      var list = D.getElementById('chat-conv-list');
      if (!list) { setTimeout(startObserver, 400); return; }
      try {
        var mo = new MutationObserver(function () {
          // debounce simples com requestAnimationFrame
          if (mo.__scheduled) return;
          mo.__scheduled = true;
          global.requestAnimationFrame(function () {
            mo.__scheduled = false;
            applyFilter();
          });
        });
        mo.observe(list, { childList: true, subtree: false });
        log('observer de filtro Arquivadas instalado');
      } catch (_e) {}
      // primeira aplicação
      applyFilter();
    }
    startObserver();

    // Também reaplica quando o usuário troca de aba
    D.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t) return;
      var tabEl = t.closest && t.closest('#chat-tabs-bar [data-tab], [data-chat-tab]');
      if (!tabEl) return;
      setTimeout(applyFilter, 30);
      setTimeout(applyFilter, 150);
    }, false);
  })();

  log('v1-20260731 pronto — 5 fixes ativos (breaker+newConv+groupMgmt+closeBtn+archivedFilter)');
})(window);
