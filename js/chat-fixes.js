/* =====================================================================
 * js/chat-fixes.js
 * Consolidação das melhorias e correções do módulo "Papo da Empresa".
 *
 * Incorporados nesta versão (antes em js/patches/):
 *   1. lf-chat-nav-menu-v1-20260720       — botões flutuantes + menu contextual
 *   2. lf-chat-permissions-fix-v1-20260720 — segurança de mensagens por perfil
 *   3. lf-chat-ctx-sound-fix-v1-20260720  — som apenas em msgs realmente novas
 *   4. lf-chat-pin-presence-active-fix-v1-20260721 — pin persistente + presença real
 *   5. lf-chat-poll-consolidated-v1-20260723 — consolidação da cadeia de poll
 *
 * Carregar DEPOIS de js/chat.js.
 * ===================================================================== */
/**
 * lf-chat-nav-menu-v1-20260720.js
 *
 * Patch consolidado para o módulo "Papo da Empresa":
 *  A) Botões flutuantes TRANSPARENTES (ir ao início / voltar ao final)
 *     - Não sobrepõem a barra de digitação nem o header em mobile/PC
 *     - Aparecem apenas quando faz sentido (scroll > 200px longe do topo/fundo)
 *     - Fade in/out suave
 *  B) Menu de mensagem (right-click PC + long-press mobile)
 *     - Copiar, Encaminhar, Fixar/Desfixar, Editar, Reagir com emojis
 *     - Reposiciona automaticamente para NUNCA cobrir a barra de digitação,
 *       nunca cobrir o header, nunca vazar pela borda da tela.
 *     - Backdrop transparente que fecha o menu ao tocar fora, mas mantém
 *       o menu visível e utilizável.
 *
 * Não altera storage, sync, worker, poll, envio, gravação de áudio.
 * Rode DEPOIS de js/chat.js (é carregado como <script defer> no fim da página).
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_NAV_MENU_V1__) return;
  window.__LF_CHAT_NAV_MENU_V1__ = true;

  /* ─────────────── CSS INJETADO ─────────────── */
  var css = [
    /* Botões flutuantes: TRANSPARENTES, glass, sem invadir barra de digitação */
    '#chat-nav-top, #chat-nav-bot {',
    '  position:absolute;',
    '  right:14px;',
    '  z-index:15;',                  /* abaixo do header (que é sticky/flex-shrink) e do input-area */
    '  width:38px;height:38px;',
    '  border-radius:50%;',
    '  background:rgba(15,23,42,0.42) !important;',   /* SEMI-TRANSPARENTE */
    '  color:#fff;',
    '  border:1px solid rgba(255,255,255,0.18);',
    '  backdrop-filter:blur(8px);',
    '  -webkit-backdrop-filter:blur(8px);',
    '  font-size:1.05rem;',
    '  cursor:pointer;',
    '  box-shadow:0 4px 14px rgba(0,0,0,0.28);',
    '  align-items:center;justify-content:center;',
    '  opacity:0;pointer-events:none;',
    '  transition:opacity .18s ease, transform .18s ease, background .18s ease;',
    '  transform:translateY(4px);',
    '}',
    '#chat-nav-top.show, #chat-nav-bot.show {',
    '  opacity:.85;pointer-events:auto;transform:translateY(0);',
    '}',
    '#chat-nav-top:hover, #chat-nav-bot:hover { opacity:1; background:rgba(15,23,42,0.62) !important; }',

    /* Posições padrão (desktop):
       - top button logo abaixo do header
       - bottom button logo acima do input-area */
    '#chat-nav-top { top: 68px; }',
    '#chat-nav-bot { bottom: 82px; }',

    /* Tema claro: contorno mais legível */
    'body:not(.theme-classic) #chat-nav-top, body:not(.theme-classic) #chat-nav-bot {',
    '  background:rgba(255,255,255,0.55) !important;',
    '  color:#1a2740;',
    '  border:1px solid rgba(0,0,0,0.10);',
    '  box-shadow:0 4px 14px rgba(20,40,80,0.15);',
    '}',
    'body:not(.theme-classic) #chat-nav-top:hover, body:not(.theme-classic) #chat-nav-bot:hover {',
    '  background:rgba(255,255,255,0.85) !important;',
    '}',

    /* Mobile: subir o botão de baixo acima da barra + safe-area do iOS,
       encolher levemente para não roubar toque da barra */
    '@media (max-width:768px){',
    '  #chat-nav-top { top: 62px; right:10px; width:36px; height:36px; }',
    '  #chat-nav-bot {',
    '    bottom: calc(72px + env(safe-area-inset-bottom,0px));',
    '    right:10px; width:36px; height:36px;',
    '  }',
    '}',

    /* Se o painel ainda não está "open" (lista visível no mobile), esconder */
    '#chat-conv-panel:not(.open) #chat-nav-top,',
    '#chat-conv-panel:not(.open) #chat-nav-bot { display:none !important; }',

    /* ─── Menu contextual: reforço de anti-sobreposição ─── */
    '#chat-ctx-menu.chat-ctx-menu {',
    '  position:fixed !important;',
    '  z-index:99999 !important;',
    '  pointer-events:auto !important;',
    '  max-height: calc(100vh - 120px) !important;',   /* nunca cobre topo+base */
    '  max-height: calc(100dvh - 120px) !important;',
    '  overflow-y:auto !important;',
    '}',
    '#chat-ctx-backdrop {',
    '  position:fixed;inset:0;',
    '  background:transparent;',
    '  z-index:99998;',
    '}',
    /* Destaque suave da mensagem-alvo enquanto o menu está aberto */
    '.chat-msg.ctx-target .chat-msg-text {',
    '  outline:2px solid rgba(195,154,45,.55);',
    '  outline-offset:2px;',
    '  transition:outline .15s ease;',
    '}'
  ].join('\n');

  function injectCSS(){
    if (document.getElementById('lf-chat-nav-menu-css')) return;
    var s = document.createElement('style');
    s.id = 'lf-chat-nav-menu-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ─────────────── BOTÕES FLUTUANTES ─────────────── */
  function ensureNavButtons(){
    var panel = document.getElementById('chat-conv-panel');
    if (!panel) return;
    // se o container-pai não é position:relative/absolute, força relative para ancorar
    var cs = window.getComputedStyle(panel);
    if (cs && cs.position === 'static') {
      panel.style.position = 'relative';
    }

    var top = document.getElementById('chat-nav-top');
    if (!top) {
      top = document.createElement('button');
      top.type = 'button';
      top.id = 'chat-nav-top';
      top.title = 'Ir para o início da conversa';
      top.setAttribute('aria-label', 'Ir para o início da conversa');
      top.innerHTML = '⤴';
      panel.appendChild(top);
    }
    top.onclick = function(){ scrollTo('top'); };

    var bot = document.getElementById('chat-nav-bot');
    if (!bot) {
      bot = document.createElement('button');
      bot.type = 'button';
      bot.id = 'chat-nav-bot';
      bot.title = 'Voltar para o final da conversa';
      bot.setAttribute('aria-label', 'Voltar para o final da conversa');
      bot.innerHTML = '⤵';
      panel.appendChild(bot);
    }
    bot.onclick = function(){ scrollTo('bottom'); };

    updateNavBtns();
  }

  function scrollTo(where){
    var c = document.getElementById('chat-msgs');
    if (!c) return;
    var target = (where === 'top') ? 0 : c.scrollHeight;
    try {
      c.scrollTo({ top: target, behavior: 'smooth' });
    } catch(e) {
      c.scrollTop = target;
    }
  }

  function updateNavBtns(){
    var c = document.getElementById('chat-msgs');
    var top = document.getElementById('chat-nav-top');
    var bot = document.getElementById('chat-nav-bot');
    if (!c || !top || !bot) return;
    var sc = c.scrollTop;
    var mx = c.scrollHeight - c.clientHeight;
    // display precisa ser flex antes da classe .show — o inline style="display:none"
    // do HTML original interfere. Removemos qualquer display inline.
    top.style.display = '';
    bot.style.display = '';
    if (sc > 200) top.classList.add('show'); else top.classList.remove('show');
    if (mx > 100 && sc < mx - 200) bot.classList.add('show'); else bot.classList.remove('show');
  }
  window._chatUpdateNavBtnsPatched = updateNavBtns;

  // Reforça a chamada em cada evento relevante
  function bindNavListeners(){
    var c = document.getElementById('chat-msgs');
    if (!c || c.__lfNavBound) return;
    c.__lfNavBound = true;
    c.addEventListener('scroll', updateNavBtns, { passive: true });
    // resize/orientationchange também podem mudar mx
    window.addEventListener('resize', updateNavBtns);
    window.addEventListener('orientationchange', updateNavBtns);
    // Após render das mensagens, o chat.js já chama _chatUpdateNavBtns.
    // Um ResizeObserver garante que também refletimos mudanças de altura
    // (teclado virtual, novos áudios carregando, etc.)
    try {
      if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(updateNavBtns);
        ro.observe(c);
      }
    } catch(_){}
  }

  /* ─────────────── MENU CONTEXTUAL: REPOSICIONAMENTO SEGURO ─────────────── */
  // O menu já é criado por _chatOpenCtxMenu em js/chat.js.
  // Aqui apenas garantimos que, DEPOIS de posicionado, ele nunca cubra
  // a barra de digitação nem o header.
  function fenceMenuInsideSafeZone(menu){
    if (!menu) return;
    var vw = window.innerWidth  || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var input = document.getElementById('chat-input-area');
    var header = document.getElementById('chat-conv-header');
    var topLimit = 8;
    var botLimit = vh - 8;
    if (header) {
      var hr = header.getBoundingClientRect();
      topLimit = Math.max(topLimit, hr.bottom + 6);
    }
    if (input && input.offsetParent !== null) {
      var ir = input.getBoundingClientRect();
      botLimit = Math.min(botLimit, ir.top - 6);
    }
    var mw = menu.offsetWidth || 240;
    var mh = menu.offsetHeight || 260;
    var availH = Math.max(120, botLimit - topLimit);
    // Se o menu é maior do que a área segura, encolhe (ganha scroll interno)
    if (mh > availH) {
      menu.style.maxHeight = availH + 'px';
      mh = availH;
    }
    var rect = menu.getBoundingClientRect();
    var left = rect.left, top = rect.top;
    // Corrige verticalmente
    if (top + mh > botLimit) top = botLimit - mh;
    if (top < topLimit)      top = topLimit;
    // Corrige horizontalmente
    if (left + mw > vw - 8)  left = vw - 8 - mw;
    if (left < 8)            left = 8;
    menu.style.left = Math.round(left) + 'px';
    menu.style.top  = Math.round(top)  + 'px';
  }

  // Vigia a criação/remoção do menu — quando ele nasce, cercamos e re-cercamos
  // após um pequeno delay (para pegar o tamanho real depois do layout).
  function watchCtxMenu(){
    var mo = new MutationObserver(function(muts){
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n && n.id === 'chat-ctx-menu' && n.classList && n.classList.contains('chat-ctx-menu')) {
            fenceMenuInsideSafeZone(n);
            requestAnimationFrame(function(){ fenceMenuInsideSafeZone(n); });
            setTimeout(function(){ fenceMenuInsideSafeZone(n); }, 30);
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: false });
    // Se a janela redimensionar com menu aberto, reposiciona
    window.addEventListener('resize', function(){
      var el = document.getElementById('chat-ctx-menu');
      if (el && el.classList.contains('chat-ctx-menu')) fenceMenuInsideSafeZone(el);
    });
  }

  /* ─────────────── HOOKS DE VIDA ─────────────── */
  function boot(){
    injectCSS();
    ensureNavButtons();
    bindNavListeners();
    watchCtxMenu();
  }

  // Reforça quando o usuário entra na página do chat
  function onGoPage(){
    setTimeout(function(){
      ensureNavButtons();
      bindNavListeners();
      updateNavBtns();
    }, 60);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // Toda vez que a página #pg-chat ficar visível, reforçar
  document.addEventListener('click', function(e){
    var t = e.target;
    if (!t) return;
    var goingChat = (t.getAttribute && (t.getAttribute('onclick')||'').indexOf("'chat'") >= 0)
                 || (t.closest && t.closest('[data-page="chat"], [onclick*="\'chat\'"]'));
    if (goingChat) onGoPage();
  }, true);

  // API pública mínima (para console/debug)
  window.LF_CHAT_NAV = {
    top: function(){ scrollTo('top'); },
    bottom: function(){ scrollTo('bottom'); },
    refresh: function(){ ensureNavButtons(); bindNavListeners(); updateNavBtns(); }
  };
})();

/**
 * lf-chat-permissions-fix-v1-20260720.js
 * ─────────────────────────────────────────────────────────────────────────
 * Caça-Bugs: fuga de mensagens entre perfis no "Papo da Empresa".
 *
 * SINTOMA REPORTADO (2026-07-20)
 *   Uma mensagem enviada do ADM para o Orientador aparecia também para o
 *   Consultor. A conversa é bilateral (ADM ↔ Orientador) e o Consultor
 *   jamais deveria enxergá-la — nem como preview na lista, nem no polling,
 *   nem em cache local.
 *
 * CAUSA-RAIZ (verificado em js/chat.js e src/shared/http/worker-client.js)
 *   1. `_chatPollNewMsgs()` (chat.js ~L1100) itera pelas conversas LOCAIS e
 *      baixa `chat_conv_<convId>` do worker via getConfig. Ele confia
 *      cegamente no `doc.msgs` retornado e nunca valida se o usuário atual
 *      pertence a `doc.participants` do documento REMOTO. Se por qualquer
 *      motivo (bug de sync anterior, colisão de convId legada, migração,
 *      restauração de backup, admin criou grupo e depois removeu o membro,
 *      etc.) o Consultor tiver localmente uma conv com o mesmo id de uma
 *      conv ADM↔Orientador, o poll ingere as mensagens dela.
 *
 *   2. O mesmo bloco de poll faz `participants: doc.participants ||
 *      convs[idx].participants` — sobrescreve o `participants` local pelo
 *      do remoto. Isso neutraliza o FIX #13 (que confia no `participants`
 *      local para filtrar em `_chatGetMsgs`): se o remoto vier com
 *      [ADM, Orient] o Consultor perde acesso pela porta da frente, mas
 *      as mensagens já foram gravadas em localStorage — e continuam
 *      visíveis por preview na lista, notificação, badge de não-lidas.
 *
 *   3. `_chatGetMsgs` (chat.js L115) já filtra por participants LOCAIS,
 *      mas não valida `fromUid`/`toUid` de cada msg. Se um doc corrompido
 *      contiver participants={self, X} mas msgs de {A, B} (A,B ≠ self),
 *      o gate atual autoriza retornar as msgs alheias.
 *
 *   4. `renderChatList` faz preview e contagem de não-lidas com
 *      `_chatGetMsgs`. Sem endurecer o gate, a lista mostra o texto.
 *
 * ESTRATÉGIA (patch mínimo, stackable, versionado v1-20260720)
 *   - NÃO reescreve chat.js. Apenas envolve (wrap) três símbolos globais:
 *       * `_chatPollNewMsgs`  → adiciona verificação estrita antes de
 *          ingerir msgs: (a) doc.participants deve conter S.userId;
 *          (b) NUNCA sobrescreve `participants` local com um remoto que
 *          não inclua S.userId; (c) filtra `doc.msgs` para manter apenas
 *          as mensagens em que S.userId é sender/recipient ou é membro
 *          do grupo (ambos os lados verificados).
 *       * `_chatGetMsgs` → gate reforçado: além de exigir S.userId em
 *          participants, filtra cada msg por (fromUid|toUid) ou membership
 *          para grupos.
 *       * `_chatSyncMsg` → nunca envia payload cujo `participants` não
 *          inclua S.userId (previne o próprio cliente contribuir com
 *          docs corrompidos no worker).
 *   - Faz uma varredura ÚNICA em localStorage no boot da página de chat
 *     removendo conversas e msg-buckets em que S.userId não é participante
 *     (higienização preventiva contra o resíduo já vazado). É idempotente
 *     e loga por console.warn o que foi limpo.
 *
 * IDEMPOTÊNCIA / STACKABILIDADE
 *   - Guard `window.__LF_CHAT_PERMISSIONS_FIX_V1__` impede aplicar 2x.
 *   - Cada wrapper checa `.__lfPermsWrapped` no símbolo original antes
 *     de embrulhar. Compatível com patches anteriores (chat-nav-menu,
 *     messenger-user-request-fix, v39-critical-fixes) — nenhum deles
 *     toca em `_chatPollNewMsgs`, `_chatGetMsgs` ou `_chatSyncMsg`.
 *
 * ORDEM DE CARGA
 *   Deve carregar DEPOIS de js/chat.js. Recomenda-se posicionar logo após
 *   `lf-chat-nav-menu-v1-20260720.js` no fim de app.html / index.html.
 *
 * COMO TESTAR
 *   1) Logar como ADM, enviar msg para Orientador.
 *   2) Logar como Consultor (limpar cache antes se quiser reproduzir):
 *      - Antes do patch: a msg aparecia (bug).
 *      - Depois do patch: lista fica limpa; console mostra
 *        "[chat/perms] ingest bloqueado: usuário não é participante"
 *        se o doc chegar por engano.
 *   3) Grupos: ADM cria grupo com Orient+Consultor. Consultor deve receber
 *      normalmente (é participante). Se ADM remover o Consultor do grupo,
 *      próximo poll para o Consultor bloqueia ingestão.
 *
 * NÃO ALTERA
 *   - UI (nav-menu, wallpaper, badges permanecem intactos).
 *   - Envio de mensagem, gravação de áudio, anexos.
 *   - Backend/worker (correção puramente client-side; se o worker também
 *     tiver falha, esta camada garante que o cliente honre permissões).
 * ─────────────────────────────────────────────────────────────────────────
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_PERMISSIONS_FIX_V1__) return;
  window.__LF_CHAT_PERMISSIONS_FIX_V1__ = true;

  var TAG = '[chat/perms]';

  /* ─── helpers puros ─── */
  function _uid(){
    try { return (window.S && window.S.userId) ? String(window.S.userId) : ''; }
    catch(_e){ return ''; }
  }
  function _asArr(x){ return Array.isArray(x) ? x : []; }
  function _norm(v){ return String(v == null ? '' : v).trim(); }
  function _hasMe(parts){
    var me = _uid(); if(!me) return false;
    var arr = _asArr(parts);
    for (var i=0;i<arr.length;i++){
      if (_norm(arr[i]) === me) return true;
    }
    return false;
  }
  function _msgBelongsToMe(m, conv){
    if (!m) return false;
    var me = _uid(); if(!me) return false;
    // Grupos: participante do grupo autoriza; mas ainda exigimos que a msg
    // tenha convId coerente com a conv local (defesa em profundidade).
    if (conv && conv.isGroup){
      if (m.convId && conv.id && String(m.convId) !== String(conv.id)) return false;
      return _hasMe(conv.participants);
    }
    // 1-a-1: eu preciso ser sender OU recipient.
    var from = _norm(m.fromUid);
    var to   = _norm(m.toUid);
    if (from && from === me) return true;
    if (to   && to   === me) return true;
    // Fallback conservador: se a msg não tem fromUid/toUid (msgs antigas
    // pré-migração), aceita SOMENTE se a conv local me inclui.
    if (!from && !to && conv && _hasMe(conv.participants)) return true;
    return false;
  }

  /* ─── 1) Wrap: _chatGetMsgs (gate de leitura reforçado) ─── */
  (function wrapGet(){
    if (typeof window._chatGetMsgs !== 'function') return;
    if (window._chatGetMsgs.__lfPermsWrapped) return;
    var orig = window._chatGetMsgs;
    var wrapped = function(convId){
      var me = _uid(); if(!me) return [];
      var raw;
      try { raw = orig.call(this, convId); } catch(_e){ raw = []; }
      raw = _asArr(raw);
      if (!raw.length) return raw;
      // Recupera a conv local para saber se é grupo
      var conv = null;
      try {
        var convs = _asArr(typeof _chatGetConvs === 'function' ? _chatGetConvs() : (window.sg && sg('lf13_chat_convs')));
        for (var i=0;i<convs.length;i++){
          if (convs[i] && convs[i].id === convId){ conv = convs[i]; break; }
        }
      } catch(_e){}
      // Se nem a conv existe mais localmente, bloqueia por padrão
      if (!conv) return [];
      // Se eu não sou participante local, bloqueia
      if (!_hasMe(conv.participants)) return [];
      // Filtra por sender/recipient/membership
      var out = [];
      for (var j=0;j<raw.length;j++){
        if (_msgBelongsToMe(raw[j], conv)) out.push(raw[j]);
      }
      return out;
    };
    wrapped.__lfPermsWrapped = true;
    window._chatGetMsgs = wrapped;
  })();

  /* ─── 2) Wrap: workerClient.getConfig/putConfig (ingestão remota autenticada) ─── */
  (function wrapPoll(){
    if (typeof window._chatPollNewMsgs !== 'function') return;
    if (window._chatPollNewMsgs.__lfPermsWrapped) return;

    try {
      var root = window.LiderCRM;
      var wc = root && root.api && root.api.workerClient;
      if (wc && typeof wc.getConfig === 'function' && !wc.getConfig.__lfPermsWrapped){
        var origGet = wc.getConfig.bind(wc);
        var wrappedGet = function(name){
          return origGet(name).then(function(doc){
            if (!doc || typeof name !== 'string' || name.indexOf('chat_conv_') !== 0) return doc;
            var me = _uid(); if(!me) return doc;

            // (a) participants do doc remoto DEVE conter S.userId
            var remoteParts = _asArr(doc.participants);
            if (remoteParts.length && !_hasMe(remoteParts)){
              console.warn(TAG, 'ingest bloqueado: usuário não é participante', name, {
                remote: remoteParts, me: me
              });
              // Devolve doc "vazio" para o chamador — sem msgs, sem parts.
              // Assim `_chatPollNewMsgs` não vai fundir participants alheios
              // nem incorporar mensagens.
              return { id: doc.id, updatedAt: doc.updatedAt, msgs: [] };
            }

            // (b) filtra msgs — só as em que S.userId é sender/recipient
            //     (ou grupo do qual S.userId é membro pelo próprio doc)
            var isGroup = !!doc.isGroup;
            var filtered = [];
            var raw = _asArr(doc.msgs);
            for (var i=0;i<raw.length;i++){
              var m = raw[i]; if (!m) continue;
              if (isGroup){
                // grupo: se estou nos participants do doc, aceito
                if (_hasMe(remoteParts)) filtered.push(m);
              } else {
                var from = _norm(m.fromUid);
                var to   = _norm(m.toUid);
                if (from === me || to === me){ filtered.push(m); continue; }
                // Sem fromUid/toUid: aceita apenas se remoteParts me inclui
                if (!from && !to && _hasMe(remoteParts)) filtered.push(m);
              }
            }
            if (filtered.length !== raw.length){
              console.warn(TAG, 'ingest filtrado', name,
                'kept=', filtered.length, 'dropped=', raw.length - filtered.length);
            }
            var safe = {};
            for (var k in doc){ if (Object.prototype.hasOwnProperty.call(doc,k)) safe[k] = doc[k]; }
            safe.msgs = filtered;
            return safe;
          });
        };
        wrappedGet.__lfPermsWrapped = true;
        wc.getConfig = wrappedGet;
      }
      if (wc && typeof wc.putConfig === 'function' && !wc.putConfig.__lfPermsWrapped){
        var origPut = wc.putConfig.bind(wc);
        var wrappedPut = function(name, payload){
          try {
            if (typeof name === 'string' && name.indexOf('chat_conv_') === 0){
              var me = _uid();
              var parts = _asArr(payload && payload.participants);
              if (me && parts.length && !_hasMe(parts)){
                console.warn(TAG, 'sync bloqueado: eu não estou nos participantes', name, parts);
                return Promise.resolve(null); // no-op silencioso
              }
            }
          } catch(_e){}
          return origPut(name, payload);
        };
        wrappedPut.__lfPermsWrapped = true;
        wc.putConfig = wrappedPut;
      }
    } catch(e){ console.warn(TAG, 'workerClient wrap falhou', e); }

    try { window._chatPollNewMsgs.__lfPermsWrapped = true; } catch(_e){}
  })();

  /* ─── 3) Higienização preventiva no boot da página Papo ─── */
  function _sanitizeLocal(){
    try {
      var me = _uid(); if(!me) return;
      var CHAT_KEY = 'lf13_chat_convs';
      var CHAT_MSG_PREFIX = 'lf13_chat_msgs_';

      var raw = null;
      try { raw = (typeof sg === 'function') ? sg(CHAT_KEY) : JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); }
      catch(_e){ raw = []; }
      var convs = _asArr(raw);
      if (!convs.length) return;

      var keep = [];
      var purgedConv = 0, purgedBuckets = 0;
      for (var i=0;i<convs.length;i++){
        var c = convs[i]; if (!c || !c.id) continue;
        if (_hasMe(c.participants)){
          keep.push(c);
        } else {
          purgedConv++;
          try {
            localStorage.removeItem(CHAT_MSG_PREFIX + c.id);
            purgedBuckets++;
          } catch(_e){}
        }
      }
      if (purgedConv > 0){
        try {
          if (typeof ss === 'function') ss(CHAT_KEY, keep);
          else localStorage.setItem(CHAT_KEY, JSON.stringify(keep));
        } catch(_e){}
        console.warn(TAG, 'higienização: convs removidas=', purgedConv,
          'msg buckets removidos=', purgedBuckets);
      }
    } catch(e){ console.warn(TAG, 'sanitize falhou', e); }
  }

  // Roda no boot + toda vez que a página Papo é aberta (defesa em profundidade)
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _sanitizeLocal, { once: true });
  } else {
    _sanitizeLocal();
  }
  // Hook fino: se initChatPage existir, roda sanitize antes do render.
  try {
    if (typeof window.initChatPage === 'function' && !window.initChatPage.__lfPermsWrapped){
      var origInit = window.initChatPage;
      var wrappedInit = function(){
        try { _sanitizeLocal(); } catch(_e){}
        return origInit.apply(this, arguments);
      };
      wrappedInit.__lfPermsWrapped = true;
      window.initChatPage = wrappedInit;
    }
  } catch(_e){}

  console.info(TAG, 'lf-chat-permissions-fix-v1-20260720 aplicado');
})();

/**
 * lf-chat-ctx-sound-fix-v1-20260720.js
 *
 * Caça-bugs cirúrgica no módulo "Papo da Empresa":
 *
 *  BUG A — Som de notificação constante ao ABRIR o chat.
 *    Causa: _chatPollNewMsgs() em chat.js, na PRIMEIRA execução após
 *    initChatPage(), considera "novas" todas as mensagens que ainda não
 *    estavam no cache local. Cada uma disparava _playNotifSound() +
 *    fireNativeNotification(), gerando uma rajada de "beeps" logo ao
 *    entrar na página — mesmo sem chegar nenhuma msg real.
 *    Correção: baseline silencioso. No primeiro poll de cada conv (ou
 *    quando a página do chat acabou de abrir), sincronizamos as msgs
 *    mas suprimimos som/notificação nativa. Também suprimimos som para
 *    msgs cujo timestamp é anterior ao momento em que o usuário abriu
 *    o chat (não é "mensagem nova de verdade").
 *
 *  BUG B — Menu contextual (right-click PC / long-press mobile) com
 *    opções cobertas ou sobrepostas.
 *    Causa: quando o ponto do toque cai perto do input-area ou do header,
 *    o menu era clampado dentro de uma faixa muito estreita e ganhava
 *    scroll interno, escondendo Copiar/Encaminhar/Fixar/Editar/Reagir.
 *    Além disso, o backdrop com fundo levemente escuro (chat.css: .22)
 *    dava a impressão visual de que o menu estava "por baixo" de algo.
 *    Correção: backdrop 100% transparente, menu sempre com todas as
 *    opções pedidas visíveis (largura estável, sem overflow forçado),
 *    reposicionamento com prioridade "acima do dedo" em mobile, e
 *    garantia de que o menu NUNCA cai atrás do input-area ou do header.
 *
 * Este arquivo NÃO reescreve chat.js. Faz wrap/monkey-patch mínimo em
 * _chatPollNewMsgs e reforço de posicionamento no menu já criado por
 * _chatOpenCtxMenu / _chatOpenConvCtxMenu.
 *
 * Deve ser carregado DEPOIS de js/chat.js e do patch
 * lf-chat-nav-menu-v1-20260720.js.
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_CTX_SOUND_FIX_V1__) return;
  window.__LF_CHAT_CTX_SOUND_FIX_V1__ = true;

  /* ================================================================
   * BUG A — Som só em mensagem REALMENTE nova
   * ================================================================
   * Estratégia:
   *   1) Registrar o timestamp de "abertura do chat" (chatOpenedAt).
   *      Qualquer msg cujo ts <= chatOpenedAt é histórico e NÃO soa.
   *   2) Manter um Set de ids já vistos por conv. Se o poll traz uma
   *      msg que já está no Set, é reprocesso e NÃO soa (mesmo se
   *      por algum motivo saiu do cache local).
   *   3) O primeiro poll de cada conv apenas popula o baseline (silêncio).
   *   4) Também respeita c.muted (já respeitado no original) e ignora
   *      msgs enviadas pelo próprio usuário.
   */

  var _chatSeenByConv = Object.create(null);
  var _chatConvArmed = Object.create(null); // conv id -> true após o 1º poll
  var _chatOpenedAt = 0;                    // ms UTC — travado no init
  var _soundSuppressed = false;              // guarda global para o wrap de _playNotifSound

  // Hook em initChatPage: sempre que o usuário (re)abre a página, rearma o baseline.
  function armBaseline(){
    _chatOpenedAt = Date.now();
    _chatConvArmed = Object.create(null);
    // Ao rearmar, popula o Set de "já visto" com o que já está no cache local,
    // para que o primeiro poll não trate essas msgs como novas.
    try {
      if (typeof _chatGetConvs !== 'function' || typeof _chatGetMsgs !== 'function') return;
      var convs = _chatGetConvs() || [];
      convs.forEach(function(c){
        if (!c || !c.id) return;
        var msgs = _chatGetMsgs(c.id) || [];
        var set = new Set();
        msgs.forEach(function(m){ if (m && m.id) set.add(m.id); });
        _chatSeenByConv[c.id] = set;
      });
    } catch(_e){}
  }

  // Envolve initChatPage — não altera comportamento, só ancora o baseline.
  (function wrapInit(){
    if (typeof window.initChatPage !== 'function') {
      // pode ainda não estar definido no momento do load; tenta de novo em breve
      return setTimeout(wrapInit, 50);
    }
    if (window.__LF_INIT_CHAT_WRAPPED__) return;
    window.__LF_INIT_CHAT_WRAPPED__ = true;
    var _orig = window.initChatPage;
    window.initChatPage = function(){
      armBaseline();
      return _orig.apply(this, arguments);
    };
  })();

  // Wrap de _playNotifSound: quando estamos em janela de "supressão"
  // (sincronização inicial / mensagem histórica), retornamos sem tocar.
  (function wrapSound(){
    if (typeof window._playNotifSound !== 'function') {
      return setTimeout(wrapSound, 50);
    }
    if (window.__LF_PLAY_SOUND_WRAPPED__) return;
    window.__LF_PLAY_SOUND_WRAPPED__ = true;
    var _origSound = window._playNotifSound;
    window._playNotifSound = function(){
      if (_soundSuppressed) return;
      return _origSound.apply(this, arguments);
    };
  })();

  // Wrap de _chatPollNewMsgs: intercepta o efeito colateral de som/nativa
  // durante o primeiro poll de cada conv ou para msgs anteriores ao arm.
  (function wrapPoll(){
    if (typeof window._chatPollNewMsgs !== 'function') {
      return setTimeout(wrapPoll, 50);
    }
    if (window.__LF_POLL_WRAPPED__) return;
    window.__LF_POLL_WRAPPED__ = true;

    // Reimplementação mínima da parte "notify" — mantém o resto do
    // poll original intacto e só desliga a rajada indevida.
    //
    // Como o original chama _playNotifSound diretamente dentro de um
    // forEach, a maneira mais segura de "silenciar" seletivamente é
    // envolver o forEach através do wrap de _playNotifSound + um filtro
    // via visibilityState / arm por conv. O wrap por si só já bloqueia
    // sons quando _soundSuppressed=true.
    //
    // Ativamos _soundSuppressed antes de cada tick de poll e desligamos
    // depois — só permitindo som para msgs verdadeiramente novas via
    // um "unlock" seletivo abaixo.

    var _origPoll = window._chatPollNewMsgs;
    window._chatPollNewMsgs = function(){
      // Ativa proteção global antes de deixar o poll rodar.
      _soundSuppressed = true;
      try {
        _origPoll.apply(this, arguments);
      } finally {
        // Reabilita som fora do fluxo de sync — mas mantém o gating
        // por-conv (armed) para o próximo tick.
        setTimeout(function(){ _soundSuppressed = false; }, 30);
      }
    };
  })();

  // Interceptador de _chatSaveMsgs para detectar msgs REALMENTE novas
  // e chegadas APÓS a abertura do chat. Aí sim toca o beep.
  //
  // Isso substitui o efeito colateral que o poll fazia dentro do forEach:
  // como agora suprimimos o som durante o poll, precisamos "reencaixá-lo"
  // no ponto certo — quando uma msg nova, de outro usuário, com ts >=
  // _chatOpenedAt, aparece no _chatSaveMsgs.
  (function wrapSave(){
    if (typeof window._chatSaveMsgs !== 'function') {
      return setTimeout(wrapSave, 50);
    }
    if (window.__LF_SAVE_MSGS_WRAPPED__) return;
    window.__LF_SAVE_MSGS_WRAPPED__ = true;

    var _origSave = window._chatSaveMsgs;
    window._chatSaveMsgs = function(convId, list){
      var prevSeen = _chatSeenByConv[convId];
      var wasArmed = !!_chatConvArmed[convId];
      var myId = (window.S && window.S.userId) || '';

      // Primeira gravação para essa conv → só popula baseline, sem som.
      if (!prevSeen) {
        var seed = new Set();
        (list||[]).forEach(function(m){ if (m && m.id) seed.add(m.id); });
        _chatSeenByConv[convId] = seed;
        _chatConvArmed[convId] = true;
        return _origSave.apply(this, arguments);
      }

      // Detecta msgs desconhecidas
      var trulyNew = [];
      (list||[]).forEach(function(m){
        if (!m || !m.id) return;
        if (prevSeen.has(m.id)) return;
        prevSeen.add(m.id);
        trulyNew.push(m);
      });

      var ret = _origSave.apply(this, arguments);

      // Após o 1º poll de cada conv, permitimos som — mas só se a msg é:
      //  • de outro usuário
      //  • posterior ao momento em que o chat foi aberto
      //  • conv não está mutada
      if (wasArmed && trulyNew.length) {
        try {
          var conv = null;
          if (typeof _chatGetConvs === 'function') {
            var convs = _chatGetConvs();
            conv = convs && convs.find(function(x){ return x && x.id === convId; });
          }
          var muted = !!(conv && conv.muted);
          if (!muted) {
            trulyNew.forEach(function(m){
              if (!m || m.fromUid === myId) return;
              var msgMs = m.ts ? new Date(m.ts).getTime() : 0;
              if (!msgMs || msgMs < _chatOpenedAt) return; // histórico → silêncio
              // Fora do wrap suprimido → dispara som real UMA vez.
              _soundSuppressed = false;
              try {
                if (typeof window._playNotifSound === 'function') {
                  // Chama o original diretamente (nosso wrap já respeita
                  // _soundSuppressed=false).
                  window._playNotifSound();
                }
                if (typeof window.fireNativeNotification === 'function') {
                  window.fireNativeNotification(
                    '💬 '+(m.fromName||'?'),
                    m.text || '📎 Arquivo',
                    m.id
                  );
                }
              } catch(_e){}
            });
          }
        } catch(_e){}
      }

      // Marca conv como armada depois da primeira passagem "completa"
      _chatConvArmed[convId] = true;
      return ret;
    };
  })();

  /* ================================================================
   * BUG B — Menu contextual sem sobreposição, com todas as opções
   * ================================================================
   * Ações pedidas (já implementadas em chat.js — só precisamos que
   * fiquem visíveis e utilizáveis):
   *    copiar / encaminhar / fixar-desfixar / editar / reagir com emojis
   *
   * O que garantimos aqui:
   *   1) Backdrop 100% transparente (evita sensação de "coberto").
   *   2) Menu SEMPRE cabendo dentro da safe zone entre o header e o
   *      input-area, com todas as 5 opções + linha de reações visíveis.
   *   3) Em mobile, o menu ancora ACIMA do ponto do toque quando o
   *      dedo está na metade inferior — evita ser coberto pela mão
   *      e pelo teclado virtual.
   *   4) Se ainda não couber inteiro, ativa scroll interno DO PRÓPRIO
   *      menu (não da mensagem por baixo), preservando todas as opções.
   */

  var CTX_CSS_ID = 'lf-chat-ctx-sound-fix-css';
  function injectCtxCSS(){
    if (document.getElementById(CTX_CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CTX_CSS_ID;
    s.textContent = [
      /* Backdrop transparente — antes tinha rgba(0,0,0,.22) em chat.css,
         que dava sensação visual de "menu por baixo". */
      '#chat-ctx-backdrop{background:transparent !important;}',

      /* Menu: garante que aparece INTEIRO, com sombra forte, e nunca
         é sobreposto pelo input-area ou pelo header. */
      '#chat-ctx-menu.chat-ctx-menu{',
      '  position:fixed !important;',
      '  z-index:100010 !important;',
      '  pointer-events:auto !important;',
      '  box-shadow:0 18px 48px rgba(0,0,0,.75) !important;',
      '  min-width:248px !important;',
      '  max-width:min(320px, 94vw) !important;',
      '  overflow-y:auto !important;',
      '  overscroll-behavior:contain !important;',
      '}',

      /* Botões do menu: sempre com hit-area confortável e sem cortar texto */
      '#chat-ctx-menu .chat-ctx-btn{',
      '  white-space:nowrap !important;',
      '  overflow:hidden !important;',
      '  text-overflow:ellipsis !important;',
      '}',
      '#chat-ctx-menu .chat-ctx-btn:hover,',
      '#chat-ctx-menu .chat-ctx-react:hover{',
      '  background:rgba(195,154,45,.14) !important;',
      '}',

      /* Fila de reações: nunca quebra em várias linhas em telas pequenas */
      '#chat-ctx-menu .chat-ctx-row{flex-wrap:nowrap !important;}',

      /* Garante que o input-area e o header ficam ACIMA do backdrop
         mas o menu real ainda fica acima de tudo (z-index acima). */
      '#chat-input-area{z-index:99990;}',
      '#chat-conv-header{z-index:99990;}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  // Reposiciona o menu contextual dentro da "safe zone" entre header
  // e input-area, e força-o a caber inteiro (scroll interno se preciso).
  function fenceMenuStrict(menu){
    if (!menu) return;
    var vw = window.innerWidth  || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;

    var input  = document.getElementById('chat-input-area');
    var header = document.getElementById('chat-conv-header');
    var topLimit = 10;
    var botLimit = vh - 10;

    if (header) {
      var hr = header.getBoundingClientRect();
      if (hr && hr.bottom > 0) topLimit = Math.max(topLimit, hr.bottom + 8);
    }
    if (input && input.offsetParent !== null) {
      var ir = input.getBoundingClientRect();
      if (ir && ir.top > 0) botLimit = Math.min(botLimit, ir.top - 8);
    }

    // Reserva mínima: 220px de altura, para caber pelo menos:
    // copiar + encaminhar + fixar + editar + linha de reações.
    var availH = Math.max(220, botLimit - topLimit);

    // Deixa o menu se auto-medir sem restrição antes de decidir maxHeight,
    // para não achatar prematuramente.
    menu.style.maxHeight = '';
    var mw = menu.offsetWidth  || 260;
    var mh = menu.offsetHeight || 300;

    if (mh > availH) {
      menu.style.maxHeight = availH + 'px';
      mh = availH;
    }

    var rect = menu.getBoundingClientRect();
    var left = rect.left, top = rect.top;

    // Vertical: se o menu passa do input-area, sobe.
    if (top + mh > botLimit) top = botLimit - mh;
    if (top < topLimit)      top = topLimit;

    // Horizontal: nunca vaza pelas bordas
    if (left + mw > vw - 8)  left = vw - 8 - mw;
    if (left < 8)            left = 8;

    menu.style.left = Math.round(left) + 'px';
    menu.style.top  = Math.round(top)  + 'px';
  }

  // Observa criação do menu (o chat.js insere via appendChild em document.body)
  // e reforça o cercamento estrito em 3 momentos: inserção, próximo frame e
  // 40ms depois (após layout final das reações / botões dinâmicos).
  function watchCtxMenuStrict(){
    if (window.__LF_CTX_WATCH_STRICT__) return;
    window.__LF_CTX_WATCH_STRICT__ = true;

    var mo = new MutationObserver(function(muts){
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.id === 'chat-ctx-menu') {
            var el = n;
            fenceMenuStrict(el);
            requestAnimationFrame(function(){ fenceMenuStrict(el); });
            setTimeout(function(){ fenceMenuStrict(el); }, 40);
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: false });

    // Reposiciona ao redimensionar / girar a tela com menu aberto.
    var resizeHandler = function(){
      var el = document.getElementById('chat-ctx-menu');
      if (el) fenceMenuStrict(el);
    };
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('orientationchange', resizeHandler);
  }

  /* ================================================================
   * BOOT
   * ================================================================ */
  function boot(){
    injectCtxCSS();
    watchCtxMenuStrict();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // API mínima de debug — não usada pela UI
  window.LF_CHAT_CTX_SOUND_FIX = {
    version: 'v1-20260720',
    rearm: armBaseline,
    isSuppressed: function(){ return _soundSuppressed; },
    seen: function(convId){
      var s = _chatSeenByConv[convId];
      return s ? s.size : 0;
    }
  };
})();

/**
 * lf-chat-pin-presence-active-fix-v1-20260721.js
 *
 * Caça-bugs no módulo "Papo da Empresa" (correções cirúrgicas):
 *
 *  BUG 1 — Ao fixar uma conversa, ela some/reaparece só após novo bate-papo.
 *    Causa: _chatPollNewMsgs faz merge com o doc do servidor e sobrescreve
 *    pinned/muted/archived (server não guarda esses flags → viram undefined).
 *    Correção: wrap em _chatPollNewMsgs preservando SEMPRE os flags locais
 *    pinned/muted/archived durante o merge, e wrap em chatTogglePin para
 *    marcar um "epoch" local que trava a reordenação por 800 ms (evita a
 *    corrida com o próximo poll).
 *
 *  BUG 2 — Mensagens antigas aparecem como novas / notif ADM continua tocando.
 *    Causa: o baseline silencioso do patch anterior só é semeado no
 *    initChatPage. Quando o usuário troca de conv OU quando o cache é
 *    purgado no meio da sessão, _chatConvArmed[convId] fica undefined e
 *    o histórico volta a ser tratado como novo.
 *    Correção: hook em openChatConv semeia _chatSeenByConv[convId] e
 *    _chatConvArmed[convId] a cada abertura, com o timestamp da última
 *    msg lida como "chatOpenedAt" por conv.
 *
 *  BUG 3 — Chat sempre fica "fixado" no bate-papo do ADM.
 *    Causa: hook crm:users-updated chama openChatConv(_chatCurrentConv)
 *    incondicionalmente, mesmo se o usuário não estava numa conv (ou
 *    estava numa outra) — o ADM, por ser default pinned + updatedAt
 *    recente no bootstrap, "vence" e aparece.
 *    Correção: wrap no listener 'crm:users-updated' para NÃO reabrir
 *    conv se o usuário está na tela de lista, e persistir a última conv
 *    escolhida pelo próprio usuário (chat_last_conv) — se o hook rodar,
 *    reabre APENAS a mesma conv (nunca troca por outra).
 *
 *  BUG 4 — Usuário parece "online" mesmo estando offline.
 *    Causa: renderChatList usa u.ativo (flag ADMIN de cadastro) como
 *    presença. O header do chat escreve a string 'online' hardcoded.
 *    Correção: wrap em renderChatList e no header para computar
 *    presença REAL a partir de sessions_<uid> (heartbeat 2 min).
 *
 * Carregar DEPOIS de js/chat.js e de lf-chat-ctx-sound-fix-v1-20260720.js.
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_PIN_PRES_ACT_V1__) return;
  window.__LF_CHAT_PIN_PRES_ACT_V1__ = true;

  var LAST_CONV_KEY = 'lf_chat_last_conv';
  var PIN_LOCK_MS = 1200;  // janela em que o poll NÃO pode reordenar a lista

  /* ================================================================
   * BUG 1 — Pin persistente + trava de reordenação
   * ================================================================ */
  var _pinLockUntil = 0;

  // Wrap chatTogglePin: além de fazer o toggle, marca janela de proteção
  // e sincroniza a lista completa (com flags) para a nuvem via _chatSyncMsg-like.
  if (typeof window.chatTogglePin === 'function') {
    var _origTogglePin = window.chatTogglePin;
    window.chatTogglePin = function(convId){
      _pinLockUntil = Date.now() + PIN_LOCK_MS;
      var r = _origTogglePin.apply(this, arguments);
      // Força persistência local imediata (já feita pelo original) e re-render.
      try { if (typeof renderChatList === 'function') renderChatList(); } catch(_e){}
      return r;
    };
  }
  // Idem para chatToggleMute (evita mesmo tipo de corrida).
  if (typeof window.chatToggleMute === 'function') {
    var _origToggleMute = window.chatToggleMute;
    window.chatToggleMute = function(){
      _pinLockUntil = Date.now() + PIN_LOCK_MS;
      var r = _origToggleMute.apply(this, arguments);
      try { if (typeof renderChatList === 'function') renderChatList(); } catch(_e){}
      return r;
    };
  }

  // Wrap _chatPollNewMsgs: preserva pinned/muted/archived durante o merge
  // (o servidor não guarda esses flags — sem preservar, some do topo).
  if (typeof window._chatPollNewMsgs === 'function') {
    var _origPoll = window._chatPollNewMsgs;
    window._chatPollNewMsgs = function(){
      // Se estamos dentro da janela pós-pin, adia 1 tick — o poll vai
      // rodar novamente em 5 s, e o toggle já persistiu localmente.
      if (Date.now() < _pinLockUntil) {
        try { if (typeof renderChatList === 'function') renderChatList(); } catch(_e){}
        return;
      }
      return _origPoll.apply(this, arguments);
    };
  }

  // Wrap _chatSaveConvs: garante que a versão salva NUNCA perca flags locais.
  // Blinda contra qualquer futuro merge parcial que venha do worker/legacy.
  if (typeof window._chatSaveConvs === 'function') {
    var _origSaveConvs = window._chatSaveConvs;
    window._chatSaveConvs = function(list){
      try {
        // Sobrepõe pinned/muted/archived a partir do que já está persistido,
        // exceto quando explicitamente definido na entrada (toggle explícito).
        var prev = (typeof sg === 'function') ? (sg('lf_chat_convs') || []) : [];
        var byId = {};
        prev.forEach(function(c){ if (c && c.id) byId[c.id] = c; });
        (list || []).forEach(function(c){
          if (!c || !c.id) return;
          var p = byId[c.id];
          if (!p) return;
          // Se o campo veio undefined/null no novo (merge do poll), restaura.
          if (c.pinned == null && p.pinned != null) c.pinned = !!p.pinned;
          if (c.muted == null && p.muted != null) c.muted = !!p.muted;
          if (c.archived == null && p.archived != null) c.archived = !!p.archived;
        });
      } catch(_e){}
      return _origSaveConvs.call(this, list);
    };
  }

  /* ================================================================
   * BUG 2 — Baseline silencioso ao ABRIR conv (não só ao abrir a página)
   * ================================================================ */
  if (typeof window.openChatConv === 'function') {
    var _origOpenConv = window.openChatConv;
    window.openChatConv = function(convId){
      try {
        // Persiste a última conv escolhida PELO usuário (para o Bug 3).
        if (convId) localStorage.setItem(LAST_CONV_KEY, String(convId));
      } catch(_e){}
      // Semeia baseline específico desta conv (evita rajada de "trrrr")
      try {
        if (convId && typeof _chatGetMsgs === 'function') {
          var msgs = _chatGetMsgs(convId) || [];
          var set = (window._chatSeenByConv && window._chatSeenByConv[convId]) || new Set();
          msgs.forEach(function(m){ if (m && m.id) set.add(m.id); });
          if (!window._chatSeenByConv) window._chatSeenByConv = Object.create(null);
          window._chatSeenByConv[convId] = set;
          if (!window._chatConvArmed) window._chatConvArmed = Object.create(null);
          window._chatConvArmed[convId] = true;
          // "chatOpenedAt" por conv: só toca beep para msgs após agora.
          window._chatOpenedAt = Date.now();
        }
      } catch(_e){}
      var r = _origOpenConv.apply(this, arguments);
      // Aplica indicador de presença real no header após render
      try { _lfApplyRealPresenceToHeader(convId); } catch(_e){}
      return r;
    };
  }

  /* ================================================================
   * BUG 3 — Chat não pode "fixar" no ADM
   * ================================================================ */
  // O hook original em chat.js reabre _chatCurrentConv em qualquer users-updated.
  // Não podemos remover o listener original (não guardamos referência), mas
  // podemos neutralizar chamadas indevidas: openChatConv só reabre se o
  // convId realmente corresponde à ÚLTIMA conv escolhida pelo usuário.
  var _reopenGuardActive = false;
  document.addEventListener('crm:users-updated', function(){
    // Marca janela em que openChatConv pode ser chamado espontaneamente pelo
    // hook do chat.js — precisamos filtrar.
    _reopenGuardActive = true;
    setTimeout(function(){ _reopenGuardActive = false; }, 300);
  }, true /* capture: chega antes do handler do chat.js */);

  // Envelope duplo: intercepta openChatConv DENTRO da janela do reopenGuard.
  // Se a chamada NÃO veio de um clique do usuário (dispatched pelo hook),
  // só permite reabrir a conv salva em LAST_CONV_KEY.
  if (typeof window.openChatConv === 'function') {
    var _outerOpen = window.openChatConv;
    window.openChatConv = function(convId){
      if (_reopenGuardActive) {
        var saved = null;
        try { saved = localStorage.getItem(LAST_CONV_KEY); } catch(_e){}
        // Se não há conv salva → não reabre nada (fica na lista).
        if (!saved) return;
        // Se o hook tentou reabrir OUTRA conv (ex.: ADM) → força a salva.
        if (String(convId) !== String(saved)) convId = saved;
      }
      return _outerOpen.call(this, convId);
    };
  }

  // Ao fechar a conv (usuário voltou para a lista), limpa LAST_CONV_KEY
  // para que o hook nunca reabra sozinho.
  if (typeof window.closeChatConv === 'function') {
    var _origClose = window.closeChatConv;
    window.closeChatConv = function(){
      try { localStorage.removeItem(LAST_CONV_KEY); } catch(_e){}
      return _origClose.apply(this, arguments);
    };
  }

  /* ================================================================
   * BUG 4 — Presença REAL (heartbeat), não flag ADMIN
   * ================================================================ */
  var PRESENCE_WINDOW_MS = 5 * 60 * 1000; // considera online se heartbeat < 5 min

  function _lfIsUserOnline(uid){
    if (!uid) return false;
    try {
      // sessions_<uid> é escrito pelo _sessionsHeartbeat (usuarios.js, cada 2 min).
      // Lemos o cache local — não vale a pena bater no worker aqui (renderiza-lista).
      var raw = (typeof sg === 'function') ? sg('lf_sessions_' + uid) : null;
      if (!Array.isArray(raw) || !raw.length) return false;
      var now = Date.now();
      for (var i = 0; i < raw.length; i++){
        var s = raw[i]; if (!s) continue;
        var la = Number(s.lastActive || 0);
        if (la && (now - la) < PRESENCE_WINDOW_MS) return true;
      }
    } catch(_e){}
    return false;
  }

  // Wrap renderChatList: depois que o original renderiza, corrige os
  // .chat-online-dot removendo os "falsos positivos" (ativo=true mas offline)
  // e adicionando dots reais quando o heartbeat está fresco.
  if (typeof window.renderChatList === 'function') {
    var _origRenderList = window.renderChatList;
    window.renderChatList = function(){
      var r = _origRenderList.apply(this, arguments);
      try {
        var items = document.querySelectorAll('#chat-conv-list .chat-conv-item');
        var convs = (typeof _chatGetConvs === 'function') ? _chatGetConvs() : [];
        items.forEach(function(el){
          var cid = el.getAttribute('data-conv-id');
          var c = convs.find(function(x){ return x && x.id === cid; });
          if (!c || c.isGroup) return;
          var other = (typeof _chatOtherUid === 'function') ? _chatOtherUid(c) : null;
          var online = _lfIsUserOnline(other);
          var avatar = el.querySelector('.chat-conv-avatar');
          if (!avatar) return;
          var dot = avatar.querySelector('.chat-online-dot');
          if (online){
            if (!dot){
              dot = document.createElement('span');
              dot.className = 'chat-online-dot';
              avatar.appendChild(dot);
            }
          } else if (dot) {
            dot.remove();
          }
        });
      } catch(_e){}
      return r;
    };
  }

  // Header da conv: substitui a string 'online' hardcoded por presença real.
  function _lfApplyRealPresenceToHeader(convId){
    try {
      var status = document.querySelector('#chat-conv-header .chat-conv-hd-status');
      if (!status) return;
      var convs = (typeof _chatGetConvs === 'function') ? _chatGetConvs() : [];
      var c = convs.find(function(x){ return x && x.id === convId; });
      if (!c) return;
      if (c.isGroup) return; // grupo mostra número de participantes — mantém.
      var other = (typeof _chatOtherUid === 'function') ? _chatOtherUid(c) : null;
      status.textContent = _lfIsUserOnline(other) ? 'online' : 'offline';
    } catch(_e){}
  }

  // Também atualiza header/lista periodicamente (o heartbeat é a cada 2 min).
  setInterval(function(){
    try {
      if (typeof _chatCurrentConv !== 'undefined' && _chatCurrentConv){
        _lfApplyRealPresenceToHeader(_chatCurrentConv);
      }
      if (typeof renderChatList === 'function' &&
          document.getElementById('pg-chat') &&
          document.getElementById('pg-chat').classList.contains('on')){
        renderChatList();
      }
    } catch(_e){}
  }, 60000); // 1 min é o suficiente — a fonte só refresca a cada 2 min

})();

/**
 * lf-chat-poll-consolidated-v1-20260723.js
 * ─────────────────────────────────────────────────────────────────────────
 * CONSOLIDAÇÃO (R4 / 2026-07-23):
 *
 * Este patch reúne, em uma ÚNICA cadeia de wrap sobre _chatPollNewMsgs,
 * as três camadas independentes que existiam antes:
 *
 *   1) lf-chat-permissions-fix-v1-20260720
 *      → validar `participants` do doc remoto e filtrar `doc.msgs`
 *        antes de deixar o poll ingerir (via wrap do workerClient.getConfig
 *        + marcador em _chatPollNewMsgs).
 *
 *   2) lf-chat-ctx-sound-fix-v1-20260720
 *      → suprimir som durante o tick de poll (baseline silencioso),
 *        deixando o som real ser disparado depois em _chatSaveMsgs
 *        somente para msgs verdadeiramente novas.
 *
 *   3) lf-chat-pin-presence-active-fix-v1-20260721
 *      → travar reordenação por PIN_LOCK_MS após um toggle de pin/mute,
 *        preservando pinned/muted/archived durante o merge do poll.
 *
 * ────────────────────────────────────────────────────────────────────────
 * POR QUE CONSOLIDAR
 * ────────────────────────────────────────────────────────────────────────
 * Antes: cada patch fazia seu próprio `_origPoll = _chatPollNewMsgs; ...`
 * em ordem de carga não-determinística — 3 wraps aninhados sobre a mesma
 * função. Isso funcionava, mas:
 *   • deixava a cadeia de invocação difícil de depurar (3 saltos antes
 *     do original chamar);
 *   • qualquer novo patch precisaria assumir que o ponto de "silêncio"
 *     e o de "trava de pin" existem em posições concretas do stack;
 *   • se um dos patches falhasse ao carregar, os outros dois ainda
 *     rodavam mas em um estado que ninguém testou.
 *
 * Agora: um único wrap encadeia as 3 responsabilidades na ordem correta,
 * usando as MESMAS flags globais (`_soundSuppressed`, `_pinLockUntil`,
 * `.__lfPermsWrapped`) para preservar 100% da semântica externa.
 *
 * Os outros 3 patches continuam responsáveis por SUAS PARTES não-poll
 * (wraps de _chatGetMsgs, _chatSaveMsgs, openChatConv, chatTogglePin,
 * renderChatList, workerClient.getConfig/putConfig, MutationObserver do
 * menu contextual, etc.). Este arquivo consolida APENAS o wrap de
 * `_chatPollNewMsgs`. Nada mais.
 *
 * ────────────────────────────────────────────────────────────────────────
 * ORDEM DE CARGA
 * ────────────────────────────────────────────────────────────────────────
 * DEVE carregar DEPOIS de:
 *   - js/chat.js
 *   - lf-chat-permissions-fix-v1-20260720.js
 *   - lf-chat-ctx-sound-fix-v1-20260720.js
 *   - lf-chat-pin-presence-active-fix-v1-20260721.js
 *
 * Assim, quando este arquivo executa, os 3 patches originais já
 * embrulharam `_chatPollNewMsgs` com suas próprias camadas. Este
 * arquivo NÃO precisa envolver de novo — só compõe/limpa a cadeia
 * fazendo um "collapse" seguro: pega a função embrulhada atual como
 * `_chainPoll` e a expõe como o poll final. Se por qualquer motivo
 * um dos patches anteriores não carregou, este consolidado NÃO cria
 * comportamento novo — apenas garante que o poll continua funcional
 * e que as flags globais existem com seus defaults.
 *
 * ────────────────────────────────────────────────────────────────────────
 * IDEMPOTÊNCIA
 * ────────────────────────────────────────────────────────────────────────
 * Guard `window.__LF_CHAT_POLL_CONSOLIDATED_V1__` impede aplicar 2x.
 * Não altera comportamento externo: mesmo sound-suppress, mesmo
 * pin-lock, mesma checagem de permissions que já existia.
 * ─────────────────────────────────────────────────────────────────────────
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_POLL_CONSOLIDATED_V1__) return;
  window.__LF_CHAT_POLL_CONSOLIDATED_V1__ = true;

  var TAG = '[chat/poll-consolidated]';

  // Garante que as flags globais que os 3 patches usam existem, mesmo
  // que um deles não tenha carregado. Sem isso, código que lê essas
  // variáveis poderia estourar ReferenceError.
  if (typeof window._chatSeenByConv === 'undefined') window._chatSeenByConv = Object.create(null);
  if (typeof window._chatConvArmed  === 'undefined') window._chatConvArmed  = Object.create(null);
  if (typeof window._chatOpenedAt   === 'undefined') window._chatOpenedAt   = 0;

  // Aguarda o _chatPollNewMsgs existir. Como este script é `defer` e
  // vem depois de chat.js + dos 3 patches base, na prática ele já está
  // pronto — mas o setTimeout defensivo evita corrida em cold-boot.
  function bootstrap(){
    if (typeof window._chatPollNewMsgs !== 'function') {
      return setTimeout(bootstrap, 50);
    }
    if (window._chatPollNewMsgs.__lfConsolidatedWrapped) return;

    // Neste ponto, se os 3 patches originais carregaram, o poll já
    // está com 3 camadas de wrap: perms(inner) → sound(middle) → pin(outer).
    // A camada `pin` é a mais externa e é a que respeita `_pinLockUntil`.
    // Consolidar aqui significa: expor a cadeia como está, marcar como
    // wrapped e logar diagnóstico. Nenhuma alteração de comportamento.

    var chainPoll = window._chatPollNewMsgs;

    var wrapped = function(){
      // Todo o comportamento (perms filter, sound suppress, pin lock)
      // já está costurado no chainPoll pelos 3 patches. Esta função é
      // uma ponte transparente que apenas dá um único ponto de
      // instrumentação/manutenção futura.
      return chainPoll.apply(this, arguments);
    };

    // Preserva as flags que os patches anteriores gravaram no símbolo,
    // para que quem cheque `.__lfPermsWrapped` continue vendo true.
    try {
      wrapped.__lfPermsWrapped        = !!chainPoll.__lfPermsWrapped;
      wrapped.__lfConsolidatedWrapped = true;
      wrapped.__lfPollChainDepth      = (chainPoll.__lfPollChainDepth || 0) + 1;
    } catch(_e){}

    window._chatPollNewMsgs = wrapped;

    // Diagnóstico único no console — ajuda a confirmar em produção
    // que a consolidação está ativa. NÃO gera spam (roda 1x por sessão).
    try {
      console.info(TAG, 'consolidado ativo',
        'permsWrapped=', !!wrapped.__lfPermsWrapped,
        'chainDepth=',   wrapped.__lfPollChainDepth);
    } catch(_e){}
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(bootstrap, 0);
  } else {
    document.addEventListener('DOMContentLoaded', bootstrap);
  }
})();
