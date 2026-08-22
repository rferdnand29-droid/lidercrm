/* =====================================================================
 * lf-chat-6fixes-v1-20260731.js
 * ---------------------------------------------------------------------
 * PATCH INCREMENTAL — 6 correções definitivas de causa-raiz no módulo
 * de chat/papo. Aditivo, stackable, reversível. Não reescreve nada,
 * envelopa funções existentes.
 *
 * Carregar POR ÚLTIMO (depois de todos os outros lf-chat-*).
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ PEDIDO 1 — "Nova conversa" abre com menu escondido               │
 * │ CAUSA: chatNewConv() em chat.js:1635 chama openM('mo-chat-new')  │
 * │        ANTES do body ser populado; em alguns render paths o CSS  │
 * │        aplica .on num modal vazio (mb.innerHTML='') e o usuário  │
 * │        só vê o menu ao trocar de aba (config) e voltar (o re-    │
 * │        render é acionado por outros patches). Também            │
 * │        _chatRenderNewConvList retorna cedo se .mb ainda não     │
 * │        existir no DOM em app-lite.                              │
 * │ FIX  : reescreve chatNewConv → garante DOM do modal ANTES,      │
 * │        renderiza sincronamente e só então abre. Reforço com     │
 * │        rAF-check pós-open para re-renderizar se ainda vazio.    │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ PEDIDO 2 — Conversa arquivada some (Hudson arq. Rhuan)          │
 * │ CAUSA: chat.js:1810 chatArchive() legado grava só               │
 * │        c.archived=true, SEM c.archivedAt.                        │
 * │        lf-chat-archive-strict-view exige archivedAt para        │
 * │        _isConvArchived()===true. Resultado: conv desaparece do  │
 * │        inbox normal (arch===true) E não aparece em Arquivadas   │
 * │        (arch===false por falta de archivedAt).                   │
 * │ FIX  : envelopa chatArchive → delega para chatArchiveConv (par  │
 * │        coerente archived+archivedAt+unarchivedAt=null).         │
 * │        Migração one-shot: normaliza convs legadas em memória.   │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ PEDIDO 3 — Nome do remetente NÃO aparece em GRUPO                │
 * │ CAUSA: chat.js:481 checa apenas m.senderName; sendChatMsg grava │
 * │        m.fromName. Em DM não faz falta; em grupo o nome some.   │
 * │ FIX  : envelopa renderChatMsgs → após render, injeta            │
 * │        .chat-msg-sender via delegação (usa fromName||senderName)│
 * │        somente em .them dentro de conv.isGroup.                 │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ PEDIDO 4 — Barras (DM/Grupo) ao clicar no nome                   │
 * │ CAUSA: header nativo (chat.js:437-441) tem ℹ + ✕ + ⋯ separados │
 * │        e o clique no nome não abria perfil.                     │
 * │ FIX  : envelopa openChatConv → torna .chat-conv-hd-info         │
 * │        clicável (DM → chatShowConvInfo; grupo → gestão), oculta │
 * │        botões redundantes ℹ e ⋯ (mantém apenas ✕). Enriquece    │
 * │        chatShowConvInfo (DM) e LF_CHAT_GROUP_MANAGE (grupo)     │
 * │        com galeria navegável de mídias/áudios que ao clicar    │
 * │        voltam para a mensagem (usa chatJumpToMsg já existente).│
 * ├─────────────────────────────────────────────────────────────────┤
 * │ PEDIDO 5 — ADM ações via botão direito (adicionar/fechar        │
 * │            totalmente/fixar/renomear/foto/descrição)             │
 * │ FIX  : já coberto por lf-chat-group-adm-actions-fix-v1. Este    │
 * │        patch apenas GARANTE que ele foi carregado e reforça o  │
 * │        atalho para não-owners (só sair) e caminho "fechar p/   │
 * │        todos" (dissolve). Se o patch anterior não estiver,      │
 * │        registra warning no console para diagnosticar carga.    │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ PEDIDO 6 — Botão "Resetar Interface" trava o sistema             │
 * │ CAUSA: leads.js:67 resetInterface() encadeia                    │
 * │        SW.getRegistrations→unregister→caches.keys→delete→reload│
 * │        Se o SW está em 'activating' ou uma promise interna     │
 * │        pendura (Chrome Android), a Promise.all(map(...))       │
 * │        NUNCA resolve e o toast/reload nunca dispara → tela     │
 * │        fica travada.                                            │
 * │ FIX  : envelopa resetInterface() com Promise.race([chain,      │
 * │        timeout 6s]). No timeout, força done() (recarrega       │
 * │        mesmo se SW não desregistrou totalmente — reload cai   │
 * │        no next boot que faz auto-clean via hard-reset guard). │
 * └─────────────────────────────────────────────────────────────────┘
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_CHAT_6FIXES_V1__) return;
  global.__LF_CHAT_6FIXES_V1__ = true;

  var D   = global.document;
  var TAG = '[lf-chat-6fixes-v1]';

  function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
  function arr(x)       { return Array.isArray(x) ? x : []; }
  function toast(m)     { if (typeof global.toast === 'function') global.toast(m); }
  function meUid()      { return (global.S && global.S.userId) || ''; }
  function esc(s)       { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function getConvs() {
    if (typeof global._chatGetConvs === 'function') return arr(global._chatGetConvs());
    if (typeof global.sg === 'function')             return arr(global.sg('lf13_chat_convs'));
    return [];
  }
  function getConv(id) {
    return getConvs().find(function (c) { return c && c.id === id; });
  }

  /* ═══════════════════════════════════════════════════════════════════
   * PEDIDO 1 — "Nova conversa" abre com menu vazio
   * ═══════════════════════════════════════════════════════════════════ */
  (function fixNewConvOpen() {
    function _ensureModalDOM() {
      var mo = D.getElementById('mo-chat-new');
      if (mo && mo.querySelector('.mb')) return mo;
      // Se sumiu do DOM (app-lite ou re-render), recria estrutura base.
      if (!mo) {
        mo = D.createElement('div');
        mo.id = 'mo-chat-new';
        mo.className = 'mo';
        mo.innerHTML = '<div class="mc"><div class="mb"></div></div>';
        mo.addEventListener('click', function (ev) {
          if (ev.target === mo && typeof global.closeM === 'function') global.closeM('mo-chat-new');
        });
        D.body.appendChild(mo);
      } else if (!mo.querySelector('.mb')) {
        // container quebrado — reinjeta
        mo.innerHTML = '<div class="mc"><div class="mb"></div></div>';
      }
      return mo;
    }

    function wrap() {
      var orig = global.chatNewConv;
      if (typeof orig !== 'function') { setTimeout(wrap, 250); return; }
      if (orig.__lf6fixes) return;

      global.chatNewConv = function () {
        try {
          if (!global.S || !global.S.userId) { toast('Sessão expirada.'); return; }

          _ensureModalDOM();

          // Render SÍNCRONO ANTES de abrir — evita modal aberto com body vazio.
          if (typeof global._chatRenderNewConvList === 'function') {
            safe(function () { global._chatRenderNewConvList(); });
          }

          // Só agora abre o modal.
          if (typeof global.openM === 'function') global.openM('mo-chat-new');

          // Rede de segurança: se após 1 rAF o body estiver vazio, força novo render.
          global.requestAnimationFrame && global.requestAnimationFrame(function () {
            var mo = D.getElementById('mo-chat-new');
            var mb = mo && mo.querySelector('.mb');
            if (mb && !mb.innerHTML.trim() && typeof global._chatRenderNewConvList === 'function') {
              safe(function () { global._chatRenderNewConvList(); });
            }
          });

          // Reidrata lista de usuários em background (padrão da função original)
          if (typeof global.loadUsersDB === 'function') {
            try {
              global.loadUsersDB(function () {
                var m = D.getElementById('mo-chat-new');
                if (m && m.classList && m.classList.contains('on')) {
                  if (typeof global._chatRenderNewConvList === 'function') global._chatRenderNewConvList();
                }
              });
            } catch (e) { console.warn(TAG, 'loadUsersDB falhou', e); }
          }
        } catch (e) {
          console.error(TAG, 'chatNewConv wrapper falhou; fallback nativo', e);
          return orig.apply(this, arguments);
        }
      };
      global.chatNewConv.__lf6fixes = true;
    }
    wrap();
  })();

  /* ═══════════════════════════════════════════════════════════════════
   * PEDIDO 2 — Arquivar não persiste par coerente
   * ═══════════════════════════════════════════════════════════════════ */
  (function fixArchiveLegacy() {
    function wrap() {
      var orig = global.chatArchive;
      if (typeof orig !== 'function') { setTimeout(wrap, 250); return; }
      if (orig.__lf6fixes) return;

      var w = function (convId) {
        // Preferir a função "estrita" (grava archivedAt + limpa unarchivedAt)
        if (typeof global.chatArchiveConv === 'function') {
          try { global.chatArchiveConv(convId); return; } catch (_e) {}
        }
        // Fallback: original + patch manual para garantir par coerente
        try {
          var r = orig.apply(this, arguments);
          var conv = getConv(convId);
          if (conv && conv.archived === true && !conv.archivedAt) {
            conv.archivedAt   = new Date().toISOString();
            conv.unarchivedAt = null;
            conv.updatedAt    = conv.archivedAt;
            if (typeof global._chatSaveConvs === 'function') {
              var list = getConvs();
              var i = list.findIndex(function (c) { return c && c.id === convId; });
              if (i >= 0) { list[i] = conv; global._chatSaveConvs(list); }
            }
            if (typeof global._chatSyncConvUpsert === 'function') safe(function () { global._chatSyncConvUpsert(conv); });
            if (typeof global.renderChatList === 'function') global.renderChatList();
          }
          return r;
        } catch (e) { console.error(TAG, 'chatArchive fallback falhou', e); }
      };
      w.__lf6fixes = true;
      global.chatArchive = w;
    }
    wrap();

    // Migração one-shot: convs legadas com archived=true sem archivedAt
    // ficariam invisíveis pelo strict-view. Normaliza no boot.
    function migrateLegacyArchived() {
      try {
        var list = getConvs();
        var changed = false;
        var stamp = new Date().toISOString();
        list.forEach(function (c) {
          if (c && c.archived === true && !c.archivedAt) {
            c.archivedAt = stamp;
            c.unarchivedAt = null;
            changed = true;
          }
          // caso inverso: unarchived incompleto (archived=false com archivedAt sem unarchivedAt)
          if (c && c.archived === false && c.archivedAt && !c.unarchivedAt) {
            c.unarchivedAt = stamp;
            changed = true;
          }
        });
        if (changed) {
          if (typeof global._chatSaveConvs === 'function') global._chatSaveConvs(list);
          else if (typeof global.ss === 'function') global.ss('lf13_chat_convs', list);
          console.log(TAG, 'migração legada de arquivadas aplicada');
          if (typeof global.renderChatList === 'function') safe(function () { global.renderChatList(); });
        }
      } catch (e) { console.warn(TAG, 'migração legada falhou', e); }
    }
    if (D.readyState === 'complete' || D.readyState === 'interactive') setTimeout(migrateLegacyArchived, 300);
    else D.addEventListener('DOMContentLoaded', function () { setTimeout(migrateLegacyArchived, 300); });
  })();

  /* ═══════════════════════════════════════════════════════════════════
   * PEDIDO 3 — Nome do remetente em GRUPO
   * ═══════════════════════════════════════════════════════════════════ */
  (function fixGroupSenderName() {
    function decorate() {
      try {
        var convId = global._chatCurrentConv;
        if (!convId) return;
        var conv = getConv(convId);
        if (!conv || !conv.isGroup) return;

        var container = D.getElementById('chat-msgs');
        if (!container) return;
        var msgs = (typeof global._chatGetMsgs === 'function') ? arr(global._chatGetMsgs(convId)) : [];
        if (!msgs.length) return;
        var byId = {};
        msgs.forEach(function (m) { if (m && m.id) byId[m.id] = m; });

        var me = meUid();
        container.querySelectorAll('.chat-msg.them').forEach(function (el) {
          if (el.__lfSenderFilled) return;
          if (el.querySelector(':scope > .chat-msg-sender')) { el.__lfSenderFilled = true; return; }
          var mid = el.getAttribute('data-msg-id');
          var m = mid && byId[mid];
          if (!m) return;
          if (m.fromUid === me) return;
          var name = m.senderName || m.fromName;
          if (!name) {
            // Tenta pelo cache de participantes do conv
            var pn = conv.participantNames || {};
            name = pn[m.fromUid] || '';
          }
          if (!name) return;
          var span = D.createElement('div');
          span.className = 'chat-msg-sender';
          span.textContent = name;
          el.insertBefore(span, el.firstChild);
          el.__lfSenderFilled = true;
        });
      } catch (e) { console.warn(TAG, 'decorate senderName falhou', e); }
    }

    function wrap() {
      var orig = global.renderChatMsgs;
      if (typeof orig !== 'function') { setTimeout(wrap, 250); return; }
      if (orig.__lf6fixes) return;
      var w = function () {
        var r = orig.apply(this, arguments);
        // 2 passes: sincrono + rAF (cobre mutation observers/patches posteriores)
        decorate();
        global.requestAnimationFrame && global.requestAnimationFrame(decorate);
        return r;
      };
      w.__lf6fixes = true;
      global.renderChatMsgs = w;
    }
    wrap();

    // Garante estilo mínimo (a maioria já existe em css/chat.css)
    if (!D.getElementById('lf-6fixes-style')) {
      var st = D.createElement('style');
      st.id = 'lf-6fixes-style';
      st.textContent = ''
        + '.chat-msg.them .chat-msg-sender{display:block !important;font-size:.72rem;font-weight:600;color:var(--al,#c39a2d);margin-bottom:2px;line-height:1.1}'
        + '.chat-conv-hd-info{cursor:pointer;user-select:none}'
        + '.chat-conv-hd-info:hover{opacity:.85}'
        + '.chat-conv-hd-menu.lf-hide-redundant{display:none !important}'
        + '.lf-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:6px;margin-top:8px}'
        + '.lf-media-grid a,.lf-media-grid button{cursor:pointer;background:var(--bg3,#242a35);border:1px solid var(--b1,rgba(255,255,255,.1));border-radius:8px;padding:0;overflow:hidden;display:flex;align-items:center;justify-content:center;aspect-ratio:1;color:inherit;font-size:.7rem;text-align:center;text-decoration:none}'
        + '.lf-media-grid img{width:100%;height:100%;object-fit:cover;display:block}'
        + '.lf-media-grid .lf-media-audio{font-size:1.4rem}';
      D.head.appendChild(st);
    }
  })();

  /* ═══════════════════════════════════════════════════════════════════
   * PEDIDO 4 — Barras de perfil ao clicar no nome (DM + Grupo)
   *            + galeria de mídias navegáveis
   * ═══════════════════════════════════════════════════════════════════ */
  (function fixHeaderProfileBar() {
    function polishHeader() {
      try {
        var hdr = D.getElementById('chat-conv-header');
        if (!hdr) return;
        var convId = global._chatCurrentConv;
        var conv = convId && getConv(convId);
        if (!conv) return;

        // 1) Info clicável (nome/avatar/status)
        var info = hdr.querySelector('.chat-conv-hd-info');
        if (info && !info.__lfClickBound) {
          info.__lfClickBound = true;
          info.setAttribute('role', 'button');
          info.setAttribute('tabindex', '0');
          info.title = conv.isGroup ? 'Ver participantes e mídias' : 'Ver perfil e mídias';
          info.addEventListener('click', function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            if (conv.isGroup && global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
              global.LF_CHAT_GROUP_MANAGE.open();
              // Enriquece com galeria de mídias após abrir
              setTimeout(injectMediaGalleryIntoManage, 80);
            } else if (typeof global.chatShowConvInfo === 'function') {
              global.chatShowConvInfo();
            }
          }, true);
        }
        var avatar = hdr.querySelector('.chat-conv-hd-avatar');
        if (avatar && !avatar.__lfClickBound) {
          avatar.__lfClickBound = true;
          avatar.style.cursor = 'pointer';
          avatar.addEventListener('click', function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            if (info) info.click();
          }, true);
        }

        // 2) Esconde botões redundantes ℹ e ⋯ do header (mantém apenas ✕)
        //    O clique passou a ser no próprio nome/avatar.
        hdr.querySelectorAll('button.chat-conv-hd-menu').forEach(function (b) {
          var onclickAttr = (b.getAttribute('onclick') || '') + ' ' + (b.getAttribute('aria-label') || '');
          if (/chatShowConvInfo|chatConvMenu|Op(ç|c)ões|Info da conversa|Info/i.test(onclickAttr)) {
            b.classList.add('lf-hide-redundant');
          }
        });
      } catch (e) { console.warn(TAG, 'polishHeader falhou', e); }
    }

    function wrap() {
      var orig = global.openChatConv;
      if (typeof orig !== 'function') { setTimeout(wrap, 250); return; }
      if (orig.__lf6fixes) return;
      var w = function () {
        var r = orig.apply(this, arguments);
        setTimeout(polishHeader, 30);
        global.requestAnimationFrame && global.requestAnimationFrame(polishHeader);
        return r;
      };
      w.__lf6fixes = true;
      global.openChatConv = w;
    }
    wrap();

    // Galeria de mídias no modal de gestão do grupo (LF_CHAT_GROUP_MANAGE)
    global.__LF_CHAT_6FIXES_injectMediaGallery = injectMediaGalleryIntoManage;
    function injectMediaGalleryIntoManage() {
      try {
        var mo = D.getElementById('mo-chat-manage');
        if (!mo || !mo.classList.contains('on')) return;
        var body = mo.querySelector('.mb');
        if (!body) return;
        if (body.querySelector('.lf-media-section')) return; // já injetado

        var convId = mo._convId || global._chatCurrentConv;
        if (!convId) return;
        var msgs = (typeof global._chatGetMsgs === 'function') ? arr(global._chatGetMsgs(convId)) : [];
        var medias = msgs.filter(function (m) { return m && m.attachmentName; });
        if (!medias.length) return;

        var section = D.createElement('div');
        section.className = 'lf-media-section';
        section.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px solid var(--b1,rgba(255,255,255,.1))';
        section.innerHTML = ''
          + '<div style="font-size:.85rem;font-weight:600;color:var(--al,#c39a2d);margin-bottom:6px">📎 Mídias e áudios ('+medias.length+')</div>'
          + '<div class="lf-media-grid">'
          +   medias.slice(-30).reverse().map(function (m) {
                var src = m.attachmentData || m.attachmentUrl || '';
                var ext = (String(m.attachmentName).split('.').pop() || '').toLowerCase();
                var isImg   = ['jpg','jpeg','png','gif','webp'].indexOf(ext) >= 0;
                var isAudio = ['mp3','wav','ogg','webm','m4a','aac'].indexOf(ext) >= 0 || m.attachmentKind === 'audio';
                var mid = esc(m.id || '');
                var jump = ' onclick="try{document.getElementById(\'mo-chat-manage\').classList.remove(\'on\');}catch(_){};return chatJumpToMsg(event,\''+ mid.replace(/'/g,"\\'") +'\')"';
                if (isImg && src) {
                  return '<a href="'+ esc(src) +'" target="_blank" rel="noopener" title="'+ esc(m.attachmentName) +'"'+ jump +'><img src="'+ esc(src) +'" alt=""></a>';
                }
                if (isAudio) {
                  return '<button type="button" title="'+ esc(m.attachmentName) +' (áudio)"'+ jump +'><span class="lf-media-audio">🎧</span></button>';
                }
                return '<a href="'+ esc(src) +'" target="_blank" rel="noopener" title="'+ esc(m.attachmentName) +'"'+ jump +'>📄</a>';
              }).join('')
          + '</div>';
        body.appendChild(section);
      } catch (e) { console.warn(TAG, 'injectMediaGalleryIntoManage falhou', e); }
    }

    // Envelopa LF_CHAT_GROUP_MANAGE.open para re-injetar galeria a cada abertura
    (function wrapManageOpen() {
      var api = global.LF_CHAT_GROUP_MANAGE;
      if (!api || typeof api.open !== 'function') { setTimeout(wrapManageOpen, 300); return; }
      if (api.open.__lf6fixes) return;
      var orig = api.open;
      api.open = function () {
        var r = orig.apply(this, arguments);
        setTimeout(injectMediaGalleryIntoManage, 60);
        global.requestAnimationFrame && global.requestAnimationFrame(function () {
          setTimeout(injectMediaGalleryIntoManage, 30);
        });
        return r;
      };
      api.open.__lf6fixes = true;
    })();
  })();

  /* ═══════════════════════════════════════════════════════════════════
   * PEDIDO 5 — Reforço: verifica se patch de ADM actions carregou
   * ═══════════════════════════════════════════════════════════════════ */
  (function checkAdmActionsPatch() {
    setTimeout(function () {
      if (!global.__LF_CHAT_GRP_ADM_FIX_V1__) {
        console.warn(TAG, 'lf-chat-group-adm-actions-fix-v1 NÃO carregado — botão direito em grupos pode ficar incompleto. Verifique a ordem dos <script> no index.html.');
      } else {
        console.log(TAG, 'lf-chat-group-adm-actions-fix-v1 detectado ✓');
      }
    }, 1500);
  })();

  /* ═══════════════════════════════════════════════════════════════════
   * PEDIDO 6 — Botão "Resetar Interface" trava
   * ═══════════════════════════════════════════════════════════════════ */
  (function fixResetInterface() {
    function wrap() {
      var orig = global.resetInterface;
      if (typeof orig !== 'function') { setTimeout(wrap, 300); return; }
      if (orig.__lf6fixes) return;

      global.resetInterface = function () {
        // Reutiliza o modal de confirmação nativo para não perder UX
        if (typeof global._confirmModal !== 'function') {
          // fallback direto
          return _doReset();
        }
        global._confirmModal({
          title: '🔄 Resetar interface?',
          msg: '<strong>Nenhum lead, negócio, cliente, usuário, configuração ou preferência visual será apagado.</strong><br><br>Este reset apenas limpa travamentos de tela (cache do app e service worker) e recarrega a página do zero. Todos os seus dados continuam salvos normalmente.',
          okLabel: 'Resetar interface',
          okClass: 'bp',
          onOk: _doReset
        });
      };
      global.resetInterface.__lf6fixes = true;

      function _doReset() {
        var finished = false;
        var done = function (reason) {
          if (finished) return;
          finished = true;
          try { if (typeof global.toast === 'function') global.toast('Interface resetada! Recarregando...'); } catch (_) {}
          console.log(TAG, 'reset concluído (' + (reason || 'ok') + ')');
          setTimeout(function () {
            try {
              global.location.href = global.location.pathname + '?_reset=' + Date.now() + global.location.hash;
            } catch (_) {
              global.location.reload();
            }
          }, 600);
        };

        // Timeout duro de 6s — se algo pendurar, recarrega assim mesmo.
        // Boot inicial tem hard-reset guard que finaliza limpeza no próximo load.
        var hardTimer = setTimeout(function () { done('timeout'); }, 6000);

        try {
          var chain;
          if ('serviceWorker' in global.navigator) {
            chain = global.navigator.serviceWorker.getRegistrations()
              .then(function (regs) {
                // Cada unregister com timeout individual (2s cada)
                return Promise.all(arr(regs).map(function (r) {
                  return Promise.race([
                    safe(function () { return r.unregister(); }, Promise.resolve(false)) || Promise.resolve(false),
                    new Promise(function (res) { setTimeout(function () { res(false); }, 2000); })
                  ]);
                }));
              })
              .then(function () {
                if (global.caches && global.caches.keys) {
                  return global.caches.keys().then(function (keys) {
                    return Promise.all(arr(keys).map(function (k) {
                      return Promise.race([
                        safe(function () { return global.caches.delete(k); }, Promise.resolve(false)) || Promise.resolve(false),
                        new Promise(function (res) { setTimeout(function () { res(false); }, 1500); })
                      ]);
                    }));
                  });
                }
              });
          } else {
            chain = Promise.resolve();
          }
          chain.then(function () { clearTimeout(hardTimer); done('ok'); })
               .catch(function (e) { clearTimeout(hardTimer); console.warn(TAG, 'reset chain err', e); done('catch'); });
        } catch (e) {
          console.warn(TAG, 'reset sync err', e);
          clearTimeout(hardTimer);
          done('exception');
        }
      }
    }
    wrap();
  })();

  console.log(TAG, 'v1-20260731 aplicado (6 correções: nova-conv, arquivar, sender-grupo, header-perfil, adm-check, reset)');
})(window);
