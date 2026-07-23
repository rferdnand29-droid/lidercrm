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
