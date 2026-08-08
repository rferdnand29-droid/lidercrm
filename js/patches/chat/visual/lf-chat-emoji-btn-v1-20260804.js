/* ================================================================
 * lf-chat-emoji-btn-v1-20260804.js
 * --------------------------------------------------------------
 * Injeta o botão 😊 no #chat-input-area (aba "Papo da Empresa").
 *
 * Comportamento:
 *  • PC (>768px)   → alterna um picker leve de emojis acima do
 *                    input; clicar em um emoji o insere na posição
 *                    do cursor do #chat-input e dispara o mesmo
 *                    evento 'input' que o textarea já escuta
 *                    (chatOnInput), preservando auto-resize/typing.
 *  • Mobile(≤768) → apenas foca o #chat-input; isso já abre o
 *                    teclado nativo do celular (que traz a aba
 *                    de emojis do próprio sistema operacional).
 *
 * Aditivo e idempotente: se já existir #chat-emoji-btn, não faz
 * nada. Não altera IDs nem funções existentes. Reverter = remover
 * este arquivo + seu <script> em app.html/index.html.
 * ================================================================ */
(function(){
  'use strict';

  var TAG = '[lf-chat-emoji-btn-v1]';
  var MQ_MOBILE = '(max-width: 768px)';

  /* Conjunto compacto e usável (sem depender de libs externas). */
  var EMOJIS = [
    '😀','😁','😂','🤣','😊','😍','😘','😉',
    '😎','🤩','🥳','😜','🤗','🤔','🙃','😴',
    '😇','🥰','😅','😆','😋','😌','🤤','🤠',
    '😢','😭','😤','😡','🥺','😳','😱','🤯',
    '👍','👎','👏','🙏','💪','🤝','✌️','👌',
    '🙌','👋','🤞','🫶','❤️','🧡','💛','💚',
    '💙','💜','🤍','🖤','💔','💯','🔥','✨',
    '🎉','🎊','🎁','⭐','⚡','☀️','🌙','☕',
    '🍕','🍔','🍟','🍰','🍩','🍎','🍺','🍻',
    '⚽','🏀','🎯','🎮','🎵','📞','📱','💻',
    '💰','💸','💳','📈','📉','📊','✅','❌'
  ];

  function isMobile(){
    /* CORREÇÃO 2026-08-05: no app nativo (Capacitor), é sempre "mobile"
       de fato — não faz sentido depender só da largura da tela via
       matchMedia (que em teoria já deveria bater, mas essa checagem
       extra garante que roda em qualquer contexto do WebView nativo,
       mesmo que a largura reporte algo inesperado). */
    try{
      if(window.Capacitor && typeof window.Capacitor.isNativePlatform==='function' && window.Capacitor.isNativePlatform()) return true;
    }catch(_e){}
    try{ return window.matchMedia && window.matchMedia(MQ_MOBILE).matches; }
    catch(_e2){ return (window.innerWidth||1024) <= 768; }
  }

  function ensurePicker(){
    var p = document.getElementById('lf-emoji-picker');
    if(p) return p;
    p = document.createElement('div');
    p.id = 'lf-emoji-picker';
    p.setAttribute('role','dialog');
    p.setAttribute('aria-label','Selecionar emoji');
    EMOJIS.forEach(function(em){
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = em;
      b.setAttribute('aria-label', em);
      b.addEventListener('mousedown', function(e){ e.preventDefault(); }); // preserva foco do textarea
      b.addEventListener('click', function(){ insertEmoji(em); });
      p.appendChild(b);
    });
    document.body.appendChild(p);
    return p;
  }

  function insertEmoji(em){
    var ta = document.getElementById('chat-input');
    if(!ta) return;
    var start = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
    var end   = ta.selectionEnd   != null ? ta.selectionEnd   : ta.value.length;
    var v = ta.value || '';
    ta.value = v.slice(0, start) + em + v.slice(end);
    var pos = start + em.length;
    try{ ta.setSelectionRange(pos, pos); }catch(_e){}
    ta.focus();
    /* Dispara o mesmo pipeline do textarea (auto-resize + typing). */
    try{ ta.dispatchEvent(new Event('input', {bubbles:true})); }
    catch(_e){ if(typeof window.chatOnInput==='function') window.chatOnInput(); }
  }

  function positionPicker(picker, btn){
    var r = btn.getBoundingClientRect();
    var pw = 300; // largura definida no CSS
    var ph = 260; // altura definida no CSS
    var left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.right - pw));
    var top  = r.top - ph - 8;
    if(top < 8) top = r.bottom + 8; // se não couber acima, mostra abaixo
    /* CORREÇÃO 2026-08-07 (relatado: "botão emoji não ativa ao clicar no
       PC"): testei bastante antes e nunca reproduzi — meu teste sempre
       usava uma janela grande, com o botão bem no meio da tela. Achei
       o caso que faltava: se a janela for mais baixa (notebook, navegador
       não maximizado), ESSE cálculo podia colocar o painel abaixo do
       fim da tela visível — ele "abria" de verdade (a classe is-open
       era aplicada certinha), só que fora da área visível, parecendo
       pra quem usa que o clique não fez nada. Trava aqui garante que o
       painel sempre fica dentro da tela, não importa onde o botão
       esteja. */
    top = Math.max(8, Math.min(window.innerHeight - ph - 8, top));
    picker.style.left = left + 'px';
    picker.style.top  = top + 'px';
  }

  function togglePicker(btn){
    var picker = ensurePicker();
    var open = picker.classList.contains('is-open');
    if(open){
      picker.classList.remove('is-open');
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded','false');
    }else{
      positionPicker(picker, btn);
      picker.classList.add('is-open');
      btn.classList.add('is-open');
      btn.setAttribute('aria-expanded','true');
    }
  }

  function closePicker(){
    var picker = document.getElementById('lf-emoji-picker');
    var btn    = document.getElementById('chat-emoji-btn');
    if(picker) picker.classList.remove('is-open');
    if(btn){ btn.classList.remove('is-open'); btn.setAttribute('aria-expanded','false'); }
  }

  function onEmojiClick(ev){
    ev.preventDefault();
    var btn = document.getElementById('chat-emoji-btn');
    if(!btn) return;

    if(isMobile()){
      /* Mobile/Capacitor: só foca o textarea — o teclado nativo do
         celular já traz o botão de emoji do próprio sistema. Focar é o
         único gatilho padrão da web pra abrir o teclado nativo; não
         existe API pra forçar a aba de emoji especificamente (decisão
         de cada teclado/SO, fora do alcance de uma página web).
         CORREÇÃO 2026-08-05: removido o .click() redundante depois do
         .focus() — em alguns WebViews, disparar os dois em sequência
         pode fechar e reabrir o teclado, ou não abrir de jeito nenhum. */
      var ta = document.getElementById('chat-input');
      if(ta){ try{ ta.focus(); }catch(_e){} }
      return;
    }
    togglePicker(btn);
  }

  function injectButton(){
    /* CORREÇÃO 2026-08-05: a pedido do usuário, o botão de emoji sai
       do celular/app nativo de vez — fica só no PC. No mobile ele só
       conseguia (na melhor das hipóteses) focar o campo de texto pra
       abrir o teclado nativo, que já tem emoji embutido de qualquer
       jeito — o botão extra não agregava e ainda gerava dúvida quando
       não abria a aba de emoji específica (isso não é controlável via
       web, é decisão de cada teclado/SO). Se algum dia quiserem de
       volta, é só remover este early return. */
    if(isMobile()) return false;
    if(document.getElementById('chat-emoji-btn')) return true; // idempotente
    var area = document.getElementById('chat-input-area');
    if(!area) return false;
    var sendBtn = area.querySelector('.chat-send-btn');
    if(!sendBtn) return false;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'chat-emoji-btn';
    btn.className = 'chat-input-btn';
    btn.title = 'Emoji';
    btn.setAttribute('aria-label','Inserir emoji');
    btn.setAttribute('aria-expanded','false');
    btn.textContent = '😊';
    btn.addEventListener('click', onEmojiClick);

    area.insertBefore(btn, sendBtn);
    return true;
  }

  /* Fecha o picker ao clicar fora / ESC / redimensionar. */
  function bindGlobalHandlers(){
    if(bindGlobalHandlers._done) return;
    bindGlobalHandlers._done = true;

    document.addEventListener('click', function(e){
      var picker = document.getElementById('lf-emoji-picker');
      var btn    = document.getElementById('chat-emoji-btn');
      if(!picker || !btn) return;
      if(!picker.classList.contains('is-open')) return;
      if(picker.contains(e.target) || btn.contains(e.target)) return;
      closePicker();
    }, true);

    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') closePicker();
    });

    window.addEventListener('resize', closePicker);
    /* FIX (2026-08-04): scroll em captura disparava para QUALQUER
       scroll — inclusive o do próprio picker (overflow-y:auto),
       fechando-o ao rolar a lista. Agora ignora scroll interno. */
    window.addEventListener('scroll', function(e){
      var picker = document.getElementById('lf-emoji-picker');
      if(!picker || !picker.classList.contains('is-open')) return;
      if(e.target && (e.target === picker || picker.contains(e.target))) return;
      closePicker();
    }, true);
  }

  function boot(){
    bindGlobalHandlers();
    injectButton();

    /* FIX (2026-08-03): antes o observer se desconectava (mo.disconnect())
       assim que o botão era injetado com sucesso pela primeira vez. Como
       o botão não faz parte do HTML original (só existe se este script
       o inserir), qualquer re-render de #chat-input-area depois disso
       (troca de conversa, etc.) apagava o botão e ele nunca mais
       voltava sozinho — só com F5. injectButton() já é idempotente
       (checa se #chat-emoji-btn já existe antes de criar de novo), então
       manter o observer rodando pra sempre é seguro e barato — ele só
       reage a mutações reais do DOM, não fica em polling. */
    var mo = new MutationObserver(function(){ injectButton(); });
    try{ mo.observe(document.body, {childList:true, subtree:true}); }catch(_e){}
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }else{
    boot();
  }

  try{ console.info(TAG, 'carregado'); }catch(_e){}
})();
