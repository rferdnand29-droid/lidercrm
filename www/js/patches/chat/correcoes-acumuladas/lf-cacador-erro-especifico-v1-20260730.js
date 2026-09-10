/* =====================================================================
 * lf-cacador-erro-especifico-v1-20260730.js
 * ---------------------------------------------------------------------
 * CAÇADOR DE ERRO ESPECÍFICO — 7 fixes cirúrgicos, 1 arquivo.
 * 100% aditivo. Carregar DEPOIS de:
 *   - js/chat.js
 *   - lf-chat-group-manage-v1-20260728.js
 *   - lf-chat-msgsearch-and-tabs-v1-20260728.js
 *   - lf-tab-dots-notif-fix-20260729.js
 *   - lf-fix-participantes-notif-tabs-v1-20260730.js
 *   - lf-chat-group-participants-perms-v1-20260730.js
 *
 * FIX 1: logo/brand do login (CSS acompanha este JS — força reflow).
 * FIX 2: clique no botão "⋯" do header do grupo abre gestão de
 *        participantes em vez do menu antigo (pin/mute/archive).
 * FIX 3: remover membro NÃO pode apagar o grupo. Sanitiza tombstone,
 *        confina dissolve() atrás de confirmação dupla e desliga o
 *        efeito colateral de _chatRemoveInboxEntryForUsers para o
 *        REMETENTE.
 * FIX 4: aba "Grupos" só grupos REAIS (isGroup===true E name presente).
 * FIX 5: aba "Não lidas" — SÓ DMs (grupo nunca entra) E só o que
 *        realmente tem msg não lida direcionada ao usuário atual.
 * FIX 6: bolinha do contador de aba desaparece quando n===0.
 * FIX 7: foto de capa do grupo — grava conv.avatar E aplica no render
 *        (envelopa renderChatList e o header).
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__LF_CACADOR_ERRO_ESPECIFICO_V1__) return;
  global.__LF_CACADOR_ERRO_ESPECIFICO_V1__ = true;

  var D = global.document;
  var LS = global.localStorage;
  function safe(fn,fb){ try{return fn();}catch(_e){return fb;} }
  function arr(x){ return Array.isArray(x)?x:[]; }
  function meUid(){ return (global.S && global.S.userId) || ''; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* FIX 1 removido em 2026-10-07 (consolidação do fundo da tela de
     login — a ocultação ativa do logo/marca via MutationObserver fazia
     parte do sistema de vídeo de fundo antigo, já desativado). */

  /* ==================================================================
   * FIX 2 — o "⋯" no header de grupo abre a gestão de participantes
   *          (antes chamava chatConvMenu = pin/mute/archive)
   * ==================================================================
   * Causa raiz: chat.js:441 renderiza para grupo
   *   <button class="chat-conv-hd-menu" onclick="chatConvMenu(...)">⋯</button>
   * O FIX A anterior usava delegação e IGNORAVA cliques em <button>.
   * Aqui damos delegação inversa: se for grupo E for o botão "⋯" com
   * onclick chatConvMenu, sequestra e abre LF_CHAT_GROUP_MANAGE.open.
   */
  D.addEventListener('click', function(ev){
    try{
      var btn = ev.target && ev.target.closest && ev.target.closest('#chat-conv-header button.chat-conv-hd-menu');
      if (!btn) return;
      var hdr = btn.closest('#chat-conv-header');
      if (!hdr) return;
      var oc = btn.getAttribute('onclick') || '';
      // Só sequestra o botão ⋯ (chatConvMenu). O ✕ (closeChatConv) passa.
      if (oc.indexOf('chatConvMenu') < 0) return;
      // É grupo?
      var isGroup = false;
      if (typeof global._chatGetConvs === 'function' && global._chatCurrentConv){
        var c = (global._chatGetConvs()||[]).find(function(x){ return x && x.id === global._chatCurrentConv; });
        isGroup = !!(c && c.isGroup);
      }
      if (!isGroup) return;
      ev.preventDefault(); ev.stopPropagation();
      if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function'){
        global.LF_CHAT_GROUP_MANAGE.open();
      }
    }catch(_e){}
  }, true);

  /* ==================================================================
   * FIX 3 — remover membro NUNCA deve apagar o grupo
   * ==================================================================
   * Cadeia observada:
   *   - applyRemove chama _chatSyncConvUpsert(conv)
   *   - _chatSyncConvUpsert (chat.js:1487-1489) chama
   *     _chatRemoveInboxEntryForUsers(conv.id, removed)
   *   - Se por qualquer motivo removed contiver o próprio usuário atual,
   *     o inbox do ADM some -> conv "desaparece" para ele.
   *   - O modal exibia "Desfazer grupo" colado a "Sair do grupo",
   *     causando toque acidental que zera participants=[] e admins=[].
   *
   * Correção:
   *   (a) Envelopa LF_CHAT_GROUP_MANAGE.removeMember para NUNCA permitir
   *       remover a si mesmo por engano (use "Sair").
   *   (b) Envelopa dissolve() com CONFIRMAÇÃO DUPLA (nome do grupo).
   *   (c) Envelopa _chatSyncConvUpsert para EXCLUIR meUid() do array
   *       "removed" — protege o inbox do próprio administrador.
   */
  (function guardRemoveAndDissolve(){
    // (a) blindar removeMember
    (function wrap(){
      var api = global.LF_CHAT_GROUP_MANAGE;
      if (!api || typeof api.removeMember !== 'function' || api.__lfSelfGuard){
        setTimeout(wrap, 300); return;
      }
      var orig = api.removeMember;
      api.removeMember = function(idx){
        try{
          var mo = D.getElementById('mo-chat-manage');
          var m  = mo && mo._members && mo._members[idx];
          if (m && m.uid === meUid()){
            if (typeof global.toast === 'function')
              global.toast('');
            return;
          }
        }catch(_e){}
        return orig.apply(this, arguments);
      };
      api.__lfSelfGuard = true;
    })();

    // (b) confirmação dupla no dissolve
    (function wrapDissolve(){
      var api = global.LF_CHAT_GROUP_MANAGE;
      if (!api || typeof api.dissolve !== 'function' || api.__lfDblConfirm){
        setTimeout(wrapDissolve, 300); return;
      }
      var origDissolve = api.dissolve;
      api.dissolve = function(){
        try{
          var mo = D.getElementById('mo-chat-manage');
          var conv = null;
          if (mo && mo._convId && typeof global._chatGetConvs === 'function'){
            conv = (global._chatGetConvs()||[]).find(function(c){ return c && c.id === mo._convId; });
          }
          var name = (conv && conv.name) || 'este grupo';
          var typed = global.prompt(
            'Ação IRREVERSÍVEL.\n\nPara desfazer "'+name+'", digite exatamente o nome do grupo:'
          );
          if (typed == null) return;
          if (String(typed).trim() !== String(name).trim()){
            if (typeof global.toast === 'function') global.toast('Nome não confere — grupo NÃO foi desfeito.');
            return;
          }
        }catch(_e){ return; }
        return origDissolve.apply(this, arguments);
      };
      api.__lfDblConfirm = true;
    })();

    // (c) proteger o inbox do próprio ADM ao remover outros
    (function wrapSync(){
      var orig = global._chatSyncConvUpsert;
      if (typeof orig !== 'function' || orig.__lfSelfInboxGuard){
        setTimeout(wrapSync, 300); return;
      }
      var w = function(conv){
        try{
          if (conv && Array.isArray(conv.participants)){
            var me = meUid();
            // Nunca deixa o próprio ADM sair da lista sem clicar em "Sair".
            // Se por algum motivo ele saiu do array (bug futuro), reinsere.
            if (conv.isGroup && me && conv.participants.indexOf(me) < 0 &&
                arr(conv.admins).indexOf(me) >= 0){
              conv.participants = [me].concat(conv.participants);
            }
          }
        }catch(_e){}
        return orig.apply(this, arguments);
      };
      w.__lfSelfInboxGuard = true;
      global._chatSyncConvUpsert = w;
    })();
  })();

  /* ==================================================================
   * FIX 4 + 5 — Aba "Grupos" só grupos, aba "Não lidas" só DMs não lidas
   * ==================================================================
   * Substitui o pós-filtro do FIX C anterior por uma regra ESTRITA e
   * roda no MESMO tick de renderChatList (não deixa piscar).
   */
  (function strictTabs(){
    function _currentTab(){
      try{
        return (typeof global.sg==='function') ? global.sg('lf_chat_active_tab')
             : (LS.getItem('lf_chat_active_tab') || 'all');
      }catch(_e){ return 'all'; }
    }
    function _isRealGroup(c){
      return !!(c && c.isGroup === true && c.name && arr(c.participants).length >= 2);
    }
    function _unreadForMe(c, me){
      if (!c || c.isGroup) return 0;              // FIX 5: grupo NÃO conta
      var msgs = safe(function(){ return global._chatGetMsgs(c.id) || []; }, []);
      return msgs.filter(function(m){
        return m && !m.read && m.toUid === me;
      }).length;
    }
    function apply(){
      try{
        var tab = _currentTab();
        if (tab !== 'groups' && tab !== 'unread') return;
        var items = D.querySelectorAll('#chat-conv-list .chat-conv-item');
        if (!items || !items.length) return;
        var convs = (typeof global._chatGetConvs === 'function') ? (global._chatGetConvs()||[]) : [];
        var byId = {}; convs.forEach(function(c){ if (c && c.id) byId[c.id]=c; });
        var me = meUid();
        items.forEach(function(el){
          var cid = el.getAttribute('data-conv-id');
          var c = byId[cid]; if (!c) return;
          var hide = false;
          if (tab === 'groups' && !_isRealGroup(c)) hide = true;
          if (tab === 'unread' && _unreadForMe(c, me) <= 0) hide = true;
          el.style.display = hide ? 'none' : '';
        });
      }catch(_e){}
    }
    // Envelopa renderChatList por CIMA de tudo (última palavra).
    (function wrap(){
      var orig = global.renderChatList;
      if (typeof orig !== 'function' || orig.__lfStrictFinal){
        setTimeout(wrap, 300); return;
      }
      var w = function(){
        var r = orig.apply(this, arguments);
        apply();
        // FIX 6: rescreve n das abas (sem grupos em "unread", só reais em "groups")
        try{
          var convs = (typeof global._chatGetConvs === 'function') ? (global._chatGetConvs()||[]) : [];
          var visible = convs.filter(function(c){ return c && !c.archived; });
          var me = meUid();
          var nGroups = visible.filter(_isRealGroup).length;
          var nUnread = visible.filter(function(c){ return _unreadForMe(c, me) > 0; }).length;
          var bar = D.getElementById('chat-tabs-bar'); if (!bar) return r;
          var setN = function(tab, n){
            var t = bar.querySelector('.chat-tab[data-tab="'+tab+'"]');
            if (!t) return;
            var badge = t.querySelector('.chat-tab-n');
            if (n > 0){
              if (!badge){ badge = D.createElement('span'); badge.className = 'chat-tab-n'; t.appendChild(badge); }
              badge.textContent = String(n);
              badge.setAttribute('data-n', String(n));
              badge.style.display = '';
            } else if (badge){
              badge.setAttribute('data-n','0');
              badge.style.display = 'none';
            }
          };
          setN('groups', nGroups);
          setN('unread', nUnread);
          // 'all' e 'team' o usuário pediu para só aparecer quando houver
          // pendência não respondida. Aplicamos a mesma regra:
          setN('all',  nUnread);
          setN('team', nUnread);
        }catch(_e){}
        return r;
      };
      w.__lfStrictFinal = true;
      global.renderChatList = w;
    })();
  })();

  /* ==================================================================
   * FIX 7 — foto de capa do grupo aparece de verdade
   * ==================================================================
   * Causa raiz: LF_CHAT_GROUP_MANAGE.setPhoto grava conv.avatar (data URL),
   * mas o render usa emoji fixo 👥 para grupo (chat.js:322 e :433).
   *
   * Correção: pós-processa o DOM. Após cada renderChatList e cada
   * openChatConv, se a conv for grupo E tiver conv.avatar, substitui o
   * conteúdo dos .chat-conv-avatar (lista) e .chat-conv-hd-avatar
   * (header) por <img src=conv.avatar>.
   */
  (function groupAvatarRender(){
    function paint(){
      try{
        var convs = (typeof global._chatGetConvs === 'function') ? (global._chatGetConvs()||[]) : [];
        var byId = {}; convs.forEach(function(c){ if (c && c.id) byId[c.id]=c; });
        // Lista
        D.querySelectorAll('#chat-conv-list .chat-conv-item').forEach(function(el){
          var c = byId[el.getAttribute('data-conv-id')];
          if (!c || !c.isGroup || !c.avatar) return;
          var av = el.querySelector('.chat-conv-avatar');
          if (!av || av.__lfPainted === c.avatar) return;
          av.innerHTML = '<img src="'+String(c.avatar).replace(/"/g,'&quot;')+
            '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
          av.__lfPainted = c.avatar;
        });
        // Header
        if (global._chatCurrentConv){
          var c2 = byId[global._chatCurrentConv];
          if (c2 && c2.isGroup && c2.avatar){
            var hav = D.querySelector('#chat-conv-header .chat-conv-hd-avatar');
            if (hav && hav.__lfPainted !== c2.avatar){
              hav.innerHTML = '<img src="'+String(c2.avatar).replace(/"/g,'&quot;')+
                '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
              hav.__lfPainted = c2.avatar;
            }
          }
        }
      }catch(_e){}
    }
    // Envelopa renderChatList + openChatConv
    (function wrap(){
      var o1 = global.renderChatList;
      if (typeof o1 === 'function' && !o1.__lfAvatarPaint){
        var w1 = function(){ var r = o1.apply(this, arguments); setTimeout(paint, 20); return r; };
        w1.__lfAvatarPaint = true; global.renderChatList = w1;
      }
      var o2 = global.openChatConv;
      if (typeof o2 === 'function' && !o2.__lfAvatarPaint){
        var w2 = function(){ var r = o2.apply(this, arguments); setTimeout(paint, 30); return r; };
        w2.__lfAvatarPaint = true; global.openChatConv = w2;
      }
      if (typeof global.renderChatList !== 'function' || typeof global.openChatConv !== 'function'){
        setTimeout(wrap, 400);
      }
    })();
    // Se o modal de gestão gravar foto, força repaint
    try{
      var mo = D.getElementById('mo-chat-manage');
      if (mo){
        new MutationObserver(function(){ setTimeout(paint, 60); })
          .observe(mo, {childList:true, subtree:true});
      }
    }catch(_e){}
  })();

})(window);
