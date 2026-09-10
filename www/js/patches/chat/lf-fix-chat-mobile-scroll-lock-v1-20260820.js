/* =====================================================================
 * lf-fix-chat-mobile-scroll-lock-v1-20260820.js
 * ---------------------------------------------------------------------
 * BUGS (relatados em Capacitor/mobile, não reproduzem no PC):
 *   1) Ao entrar na aba Papo e rolar a lista de conversas, a TELA
 *      INTEIRA rola junto (em vez de só a lista de conversas ter
 *      rolagem própria).
 *   2) Dentro de uma conversa, mesma coisa: cabeçalho e barra de
 *      digitar não ficam fixos — a tela toda sobe/desce junto com as
 *      mensagens, e a barra de digitar (que é position:absolute
 *      ancorada em #chat-conv-panel) acaba sobrepondo mensagens no
 *      meio da tela, em vez de ficar grudada no rodapé visível.
 *
 * CAUSA RAIZ (rastreada em css/style.css + css/chat/chat.css):
 *   `body` (css/style.css) só tem `overflow-x:hidden` — NUNCA trava
 *   `overflow-y`, e usa `min-height:100dvh` (não `height` fixa).
 *   `#pg-chat` (css/chat/chat.css) é a ÚNICA página do CRM pensada
 *   pra ter altura travada com rolagem interna (cabeçalho fixo +
 *   mensagens rolando + input fixo) — todo o resto do app é uma
 *   página comprida normal, onde o body PRECISA rolar.
 *   Como o body nunca trava overflow-y, qualquer imprecisão de
 *   cálculo de altura (comum em WebView do Android/Capacitor com
 *   `100dvh`, teclado abrindo/fechando, safe-area) faz o conteúdo do
 *   Papo "vazar" além da viewport — e o navegador, em vez de conter a
 *   rolagem dentro de #chat-msgs/#chat-conv-list (que já têm
 *   `overflow-y:auto` certinho), rola o DOCUMENTO inteiro. Como
 *   #chat-input-area e #chat-conv-header são `position:absolute`
 *   ancorados em #chat-conv-panel (não em viewport), se o documento
 *   rolar por baixo, os dois "viajam junto" com #chat-conv-panel —
 *   o cabeçalho some atrás da barra fixa do app (#mobile-top-bar,
 *   essa sim ancorada no viewport de verdade) e a barra de digitar
 *   aparece flutuando no meio das mensagens.
 *
 * CORREÇÃO (cirúrgica, reaproveitando técnica já testada no projeto):
 *   O mesmo travamento de scroll do body já usado com sucesso pro menu
 *   mobile (toggleMobileMenu, js/utils.js) — position:fixed + top:
 *   -scrollY + overflow:hidden + width:100% — é aplicado enquanto
 *   #pg-chat estiver aberto no mobile, via wrapper em initChatPage/
 *   destroyChatPage (js/chat.js). Com o body travado, #pg-chat (que já
 *   calcula sua própria altura via calc(100dvh - Npx)) passa a ser o
 *   único "dono" da rolagem — e como #chat-msgs/#chat-conv-list já têm
 *   overflow-y:auto, a rolagem fica corretamente contida neles.
 *
 * [FIX 20260821] Relatado de novo (vídeo em anexo) mesmo com a correção
 * acima já instalada — reproduzido especificamente no navegador mobile
 * (Chrome/Android via crm.pages.dev, não só Capacitor). Travar só
 * `<body>` nem sempre é suficiente: alguns navegadores/versões tratam
 * `<html>` (document.documentElement) como o elemento de rolagem de
 * verdade (document.scrollingElement), e position:fixed só no body
 * pode não bastar pra impedir isso 100% das vezes. Duas camadas a
 * mais, reforçando sem substituir a original:
 *   1) `<html>` também trava overflow, junto com `<body>`.
 *   2) Um listener de `touchmove` em fase de CAPTURA no documento
 *      bloqueia (preventDefault) qualquer gesto de arrastar que NÃO
 *      esteja começando dentro de um elemento com rolagem própria já
 *      prevista (#chat-msgs, #chat-conv-list, textarea de digitar,
 *      etc.) — impede o gesto de "vazar" pro documento mesmo se, por
 *      algum motivo de navegador específico, o travamento por CSS
 *      sozinho não segurar.
 *
 * O que NÃO faz:
 *   - Não mexe em desktop (>768px) — o layout de 3 colunas ali já
 *     funciona (usuário só relatou o bug no mobile).
 *   - Não mexe no CSS do chat, no cálculo de altura de #pg-chat, nem
 *     na posição absolute de #chat-input-area/#chat-conv-header — só
 *     impede que o documento role por baixo, que era a causa raiz.
 *   - Não interfere com o travamento do menu mobile (toggleMobileMenu)
 *     nem com o de modais (openM) — usa flags próprias e só destrava o
 *     que ele mesmo travou.
 *
 * Idempotente: guard global.__lfFixChatMobileScrollLockV1.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__lfFixChatMobileScrollLockV1) return;
  global.__lfFixChatMobileScrollLockV1 = true;

  var _locked = false;
  var _savedScrollY = 0;
  var _htmlOverflowLockedByUs = false;

  // Seletores dos containers que JÁ têm rolagem própria prevista dentro
  // do Papo — um touchmove começando dentro de qualquer um destes segue
  // normal (não é bloqueado); começando fora, é bloqueado.
  var _ALLOWED_SCROLL_SELECTOR = '#chat-msgs, #chat-conv-list, #chat-input, textarea, input, .chat-ctx-menu, .mo, .mc, .mb';

  function _isMobile() {
    try {
      return typeof global.isMobileView === 'function' ? global.isMobileView() : (global.innerWidth || 9999) <= 768;
    } catch (_e) { return false; }
  }

  function _touchmoveGuard(e) {
    try {
      if (!_locked) return;
      var t = e.target;
      if (t && t.closest && t.closest(_ALLOWED_SCROLL_SELECTOR)) return; // dentro de área com rolagem própria — deixa passar
      e.preventDefault(); // fora de qualquer área rolável prevista — bloqueia o gesto de vazar pro documento
    } catch (_e2) { /* nunca derruba o app por causa disso */ }
  }

  function _lockBodyScroll() {
    try {
      if (_locked) return; // já travado por nós — idempotente
      var body = document.body;
      var html = document.documentElement;
      if (!body) return;
      // Se algo mais já colocou o body em position:fixed (ex.: menu
      // mobile aberto ao mesmo tempo — improvável, mas defensivo),
      // não sobrescreve: evita perder o estado de quem já travou.
      if (body.style.position === 'fixed') return;
      _savedScrollY = global.scrollY || global.pageYOffset || 0;
      body.style.top = '-' + _savedScrollY + 'px';
      body.style.position = 'fixed';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      body.classList.add('lf-chat-scroll-lock');
      // [FIX 20260821] reforço: trava <html> também, sem sobrescrever se
      // outra coisa já tiver definido um overflow customizado nele.
      if (html && !html.style.overflow) {
        html.style.overflow = 'hidden';
        _htmlOverflowLockedByUs = true;
      }
      document.addEventListener('touchmove', _touchmoveGuard, { passive: false, capture: true });
      _locked = true;
    } catch (_e) { /* nunca derruba o app por causa disso */ }
  }

  function _unlockBodyScroll() {
    try {
      if (!_locked) return; // não fomos nós quem travou — não mexe
      var body = document.body;
      var html = document.documentElement;
      if (body) {
        body.style.overflow = '';
        body.style.position = '';
        body.style.width = '';
        body.style.top = '';
        body.classList.remove('lf-chat-scroll-lock');
      }
      if (html && _htmlOverflowLockedByUs) {
        html.style.overflow = '';
        _htmlOverflowLockedByUs = false;
      }
      document.removeEventListener('touchmove', _touchmoveGuard, { capture: true });
      _locked = false;
      try {
        if (typeof global._safeWindowScrollTo === 'function') global._safeWindowScrollTo(0, _savedScrollY);
        else global.scrollTo(0, _savedScrollY);
      } catch (_e2) { /* restaurar a posição é best-effort */ }
    } catch (_e) { /* nunca derruba o app por causa disso */ }
  }

  function _wrap(fnName, after) {
    var orig = global[fnName];
    if (typeof orig !== 'function') return false;
    if (orig.__lfChatScrollLockWrapped) return true;
    var wrapped = function () {
      var ret = orig.apply(this, arguments);
      try { after(); } catch (_e) { /* wrapper nunca quebra o original */ }
      return ret;
    };
    wrapped.__lfChatScrollLockWrapped = true;
    global[fnName] = wrapped;
    return true;
  }

  function _install() {
    var okInit = _wrap('initChatPage', function () { if (_isMobile()) _lockBodyScroll(); });
    var okDestroy = _wrap('destroyChatPage', function () { _unlockBodyScroll(); });
    // [FIX 20260821] abrir uma conversa específica (openChatConv) troca
    // o conteúdo visível dentro do MESMO #pg-chat — o lock de
    // initChatPage já deveria continuar valendo, mas reforça aqui
    // também: se por algum motivo (ex.: notificação abrindo direto
    // numa conversa, sem passar por initChatPage antes) o lock ainda
    // não estiver ativo neste ponto, ativa agora.
    var okConv = _wrap('openChatConv', function () { if (_isMobile()) _lockBodyScroll(); });
    return okInit && okDestroy && okConv;
  }

  // auth.js/chat.js são defer — retry curto até existirem, igual ao
  // padrão já usado por outros patches deste diretório.
  var _tries = 0;
  function _boot() {
    if (_install()) return;
    _tries++;
    if (_tries < 40) setTimeout(_boot, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

})(window);
