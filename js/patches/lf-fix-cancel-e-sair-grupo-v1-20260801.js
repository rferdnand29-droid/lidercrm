/* =====================================================================
 * lf-fix-cancel-e-sair-grupo-v1-20260801.js
 * ---------------------------------------------------------------------
 * FIX DEFINITIVO — trata 2 bugs críticos em produção:
 *
 *   BUG A — Botão "Cancelar" do modal "Nova Conversa / Novo Grupo"
 *           (#mo-chat-new) não fecha o modal. Todos os cliques na tela
 *           ficam capturados pelo overlay.
 *
 *           CAUSA-RAIZ: js/patches/lf-fix-definitivo-4bugs-r1-20260801.js
 *           injeta <style id="lf-fix-definitivo-4bugs-r1-style"> com a
 *           regra "#mo-chat-new.mo { display:flex !important; ... }" SEM
 *           exigir .open. Como o elemento SEMPRE tem a classe "mo" no
 *           HTML, o modal fica visível para sempre e closeM() (que só
 *           tira .open) não tem efeito.
 *
 *   BUG B — Nenhuma via de "Sair do grupo", "Desfazer" ou "Apagar
 *           grupo" faz o grupo sumir da lista.
 *
 *           CAUSAS-RAIZ (em cadeia):
 *           1) Cinco patches sobrescrevem chatDeleteConv. O último
 *              vencedor (lf-fix-raiz-definitivo-v1, R3) exige que o
 *              usuário digite "APAGAR" num prompt() do browser. Em PWA
 *              standalone e em WebViews do Capacitor, prompt() retorna
 *              null → toast("Cancelado") → nada acontece.
 *           2) roleEfetivo() rejeita usuários que não são createdBy
 *              nem ADM único → toast("Sem permissão").
 *           3) Um handler CAPTURE em document (novaconv-e-ctxgrupo)
 *              preempta clicks nos itens do ctx-menu, chamando SEU
 *              próprio strictDissolveGroup que também usa prompt().
 *
 * PRINCÍPIO: aditivo, idempotente, reversível. Não edita nada do zip.
 * Só instala CSS de guarda e envolve funções em runtime.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_FIX_CANCEL_SAIR_GRUPO_V1__) return;
  global.__LF_FIX_CANCEL_SAIR_GRUPO_V1__ = true;

  var D   = global.document;
  var LS  = global.localStorage;
  var TAG = '[lf-fix-cancel-sair-grupo v1-20260801]';

  function log(){ try{ console.log.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_){} }
  function warn(){ try{ console.warn.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_){} }
  function safe(fn,fb){ try{ return fn(); }catch(_){ return fb; } }
  function arr(x){ return Array.isArray(x)?x:[]; }
  function toast(m){ if (typeof global.toast==='function') global.toast(m); }
  function meUid(){ return (global.S && global.S.userId) || ''; }
  function normUid(x){
    if (x == null) return '';
    if (typeof x === 'object') return String(x.uid||x.id||x.userId||'').trim();
    return String(x).trim();
  }
  function sameUid(a,b){ a=normUid(a); b=normUid(b); return !!a && a===b; }
  function getConvs(){
    return safe(function(){
      if (typeof global._chatGetConvs==='function') return arr(global._chatGetConvs());
      if (typeof global.sg==='function') return arr(global.sg('lf13_chat_convs'));
      var raw = LS.getItem('lf13_chat_convs');
      return raw ? arr(JSON.parse(raw)) : [];
    },[]);
  }
  function findConv(id){
    id = String(id||'');
    return getConvs().find(function(c){ return c && String(c.id)===id; }) || null;
  }
  function saveConvs(list){
    if (typeof global._chatSaveConvs==='function') global._chatSaveConvs(list);
    else if (typeof global.ss==='function') global.ss('lf13_chat_convs', list);
  }
  function saveConvsMerge(conv){
    var list = getConvs();
    var i = list.findIndex(function(c){ return c && c.id===conv.id; });
    if (i<0) list.push(conv); else list[i] = Object.assign({}, list[i], conv);
    saveConvs(list);
  }

  /* =====================================================================
   * PARTE 1 — CSS DE GUARDA HARD-KILL
   * ---------------------------------------------------------------------
   * Injeta um <style> com id "lf-fix-cancel-sair-guard-style" que:
   *   • Anula a regra "#mo-chat-new.mo { display:flex !important }" do
   *     4bugs-r1 exigindo .open OU .on.
   *   • Aplica a mesma proteção genérica para QUALQUER .mo. Se um patch
   *     futuro repetir o mesmo padrão, já fica coberto.
   *
   * Especificidade + !important + ordem de carga (é o último <style>
   * do documento) garantem que este vence.
   * ===================================================================== */
  function injectGuardCSS(){
    if (D.getElementById('lf-fix-cancel-sair-guard-style')) return;
    var css = [
      '/* lf-fix-cancel-sair-grupo v1 — guarda global */',
      /* Anula QUALQUER regra que force um .mo visível sem estado aberto. */
      'html body div.mo:not(.open):not(.on):not(.force-on){',
      '  display:none !important;',
      '  pointer-events:none !important;',
      '  opacity:0 !important;',
      '  visibility:hidden !important;',
      '}',
      /* Estado aberto — reforça pointer-events para clique passar. */
      'html body div.mo.open, html body div.mo.on{',
      '  pointer-events:auto !important;',
      '  visibility:visible !important;',
      '}',
      /* Botão Cancelar do modal Nova Conversa sempre clicável. */
      'html body #mo-chat-new .mbtns .bc,',
      'html body #mo-chat-new .mbtns .bp{',
      '  pointer-events:auto !important;',
      '  position:relative !important;',
      '  z-index:2147483647 !important;',
      '}'
    ].join('\n');
    var st = D.createElement('style');
    st.id = 'lf-fix-cancel-sair-guard-style';
    st.textContent = css;
    (D.head||D.documentElement).appendChild(st);
    log('CSS de guarda instalado (última especificidade).');
  }

  /* =====================================================================
   * PARTE 2 — SANITIZAR O <style> OFENSOR EM RUNTIME
   * ---------------------------------------------------------------------
   * O <style id="lf-fix-definitivo-4bugs-r1-style"> tem uma regra sem
   * .open. Reescrevemos APENAS esse <style> (não removemos — outras
   * partes dele são legítimas). Idempotente via atributo data-*.
   * ===================================================================== */
  var SANITIZED_4BUGS_CSS = [
    '#mo-chat-new.mo.open, #mo-chat-new.mo.on{',
    '  position:fixed !important; inset:0 !important; display:flex !important;',
    '  align-items:center !important; justify-content:center !important;',
    '  z-index:2147483000 !important; pointer-events:auto !important;',
    '}',
    '#mo-chat-new.mo:not(.open):not(.on){',
    '  display:none !important; pointer-events:none !important;',
    '}',
    '#mo-chat-new .mb{',
    '  position:relative !important; z-index:2147483000 !important;',
    '  max-height:92vh !important; overflow:auto !important;',
    '}',
    '#mo-chat-new.on .mb{ transform:none !important; }'
  ].join('\n');

  function sanitize4BugsStyle(){
    var st = D.getElementById('lf-fix-definitivo-4bugs-r1-style');
    if (!st) return false;
    if (st.getAttribute('data-lf-cancel-sanitized') === '1') return false;
    var t = st.textContent || '';
    if (/#mo-chat-new\.mo\s*\{[^}]*display\s*:\s*flex/i.test(t)){
      st.textContent = SANITIZED_4BUGS_CSS;
      st.setAttribute('data-lf-cancel-sanitized', '1');
      log('style 4bugs-r1 sanitizado (regra ofensora reescrita).');
      return true;
    }
    st.setAttribute('data-lf-cancel-sanitized', '1');
    return false;
  }

  /* Observer: se o style for reinjetado por algum outro patch, sanitiza de novo. */
  function armStyleObserver(){
    if (!global.MutationObserver) return;
    var mo = new global.MutationObserver(function(muts){
      for (var i=0;i<muts.length;i++){
        var added = muts[i].addedNodes || [];
        for (var j=0;j<added.length;j++){
          var n = added[j];
          if (n && n.nodeType===1 && n.tagName==='STYLE'){
            if (n.id === 'lf-fix-definitivo-4bugs-r1-style') {
              n.removeAttribute('data-lf-cancel-sanitized');
              sanitize4BugsStyle();
            } else if (/#mo-[a-z0-9-]+\.mo\s*\{[^}]*display\s*:\s*flex/i.test(n.textContent||'')){
              warn('outro <style> força .mo aberto sem .open:', n.id||'(sem id)');
            }
          }
        }
      }
    });
    mo.observe(D.documentElement, { childList:true, subtree:true });
    global.__lfFixCancelStyleObserver = mo;
  }

  /* =====================================================================
   * PARTE 3 — FORTALECER closeM PARA "mo-chat-new"
   * ---------------------------------------------------------------------
   * Se closeM for chamado mas o modal ainda ficar visível (regra CSS
   * legada residual), aplicamos inline style de destruição. Não altera
   * o comportamento normal.
   * ===================================================================== */
  function hardenCloseM(){
    if (typeof global.closeM !== 'function' || global.closeM.__lfCancelHard) return;
    var orig = global.closeM;
    var wrapped = function(id){
      var r = orig.apply(this, arguments);
      try{
        var el = D.getElementById(id);
        if (!el) return r;
        el.classList.remove('open');
        el.classList.remove('on');
        el.classList.remove('force-on');
        /* Force-kill inline (vence !important legado no computed style). */
        el.style.setProperty('display','none','important');
        el.style.setProperty('pointer-events','none','important');
        el.style.setProperty('opacity','0','important');
        el.style.setProperty('visibility','hidden','important');
        /* Restaura body-lock se nenhum modal ficou aberto. */
        if (!D.querySelector('.mo.open, .mo.on')){
          if (D.body){
            var sy = D.body._scrollY || 0;
            D.body.style.overflow = '';
            D.body.style.position = '';
            D.body.style.width = '';
            D.body.style.top = '';
            requestAnimationFrame(function(){ try{ global.scrollTo(0, sy); }catch(_){} });
          }
        }
      }catch(_e){}
      return r;
    };
    wrapped.__lfCancelHard = true;
    global.closeM = wrapped;
    log('closeM fortalecido (inline force-kill + body-lock reset).');
  }

  /* Fortalecer openM: sempre limpar inline styles de force-kill de closeM anterior. */
  function hardenOpenM(){
    if (typeof global.openM !== 'function' || global.openM.__lfCancelHard) return;
    var orig = global.openM;
    var wrapped = function(id){
      try{
        var el = D.getElementById(id);
        if (el){
          el.style.removeProperty('display');
          el.style.removeProperty('pointer-events');
          el.style.removeProperty('opacity');
          el.style.removeProperty('visibility');
        }
      }catch(_e){}
      return orig.apply(this, arguments);
    };
    wrapped.__lfCancelHard = true;
    global.openM = wrapped;
    log('openM fortalecido (limpa force-kill anterior).');
  }

  /* =====================================================================
   * PARTE 4 — HANDLER DE ESCAPE / ESC / CLICK-OUTSIDE
   * ---------------------------------------------------------------------
   * Garantia final: se todo o resto falhar, ESC ou clique no backdrop
   * sempre fecham o mo-chat-new via força bruta.
   * ===================================================================== */
  function armEscapeHatch(){
    D.addEventListener('keydown', function(ev){
      if (ev.key === 'Escape' || ev.keyCode === 27){
        var visible = D.querySelectorAll('.mo.open, .mo.on');
        if (visible && visible.length){
          var last = visible[visible.length-1];
          try{ global.closeM(last.id); }catch(_e){}
        } else {
          /* Nenhum aberto oficialmente mas ainda pintando? Força kill. */
          var novaConv = D.getElementById('mo-chat-new');
          if (novaConv){
            var cs = safe(function(){ return global.getComputedStyle(novaConv); }, null);
            if (cs && cs.display !== 'none'){
              try{ global.closeM('mo-chat-new'); }catch(_e){}
            }
          }
        }
      }
    }, true);

    /* Backdrop click no #mo-chat-new: já existe inline onclick, mas
       reforçamos em capture pra vencer patches que fizeram stopPropagation. */
    D.addEventListener('click', function(ev){
      var el = ev.target;
      if (!el) return;
      /* Clique DIRETAMENTE no wrapper .mo (backdrop) fecha. */
      if (el.classList && el.classList.contains('mo') && el.id && (el.classList.contains('open')||el.classList.contains('on'))){
        try{ global.closeM(el.id); }catch(_e){}
      }
    }, true);

    /* Botão .bc dentro do mo-chat-new: força fechamento mesmo se algum
       listener em captura fez stopPropagation antes. */
    D.addEventListener('click', function(ev){
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('#mo-chat-new .mbtns .bc');
      if (!btn) return;
      /* Deixa o onclick inline rodar primeiro (closeM), depois força se sobrar. */
      setTimeout(function(){
        var m = D.getElementById('mo-chat-new');
        if (m && (m.classList.contains('open')||m.classList.contains('on'))){
          try{ global.closeM('mo-chat-new'); }catch(_e){}
        }
      }, 0);
    }, false);

    log('escape hatch armado (ESC + backdrop + botão Cancelar reforçados).');
  }

  /* =====================================================================
   * PARTE 5 — SAIR/DESFAZER/APAGAR GRUPO — FLUXO CANÔNICO SEM prompt()
   * ---------------------------------------------------------------------
   * Substitui a última versão de chatDeleteConv por uma que:
   *   • Usa APENAS _confirmModal (que abre #mo-confirm-del, garantido
   *     visível pelo CSS de guarda).
   *   • Não depende de window.prompt() (bloqueado em PWA/WebView).
   *   • Confirmação dupla é feita por DOIS _confirmModal em cascata,
   *     não por prompt().
   *   • Permissão é permissiva: qualquer participante pode SAIR;
   *     ADM (hasAdminAccess) OU createdBy pode APAGAR PARA TODOS.
   *   • Após ação: remove do inbox local, força sync remoto,
   *     re-renderiza a lista imediatamente.
   * ===================================================================== */
  function isAdmSys(){
    return typeof global.hasAdminAccess === 'function' && !!global.hasAdminAccess();
  }
  function canDissolveConv(conv){
    if (!conv || !conv.isGroup) return false;
    var me = meUid();
    if (conv.createdBy && sameUid(conv.createdBy, me)) return true;
    if (isAdmSys()) return true;
    var admins = arr(conv.admins).map(normUid).filter(Boolean);
    if (admins.length === 1 && admins.some(function(u){ return sameUid(u,me); })) return true;
    return false;
  }

  function doLeaveGroup(convId){
    var conv = findConv(convId);
    if (!conv || !conv.isGroup) return;
    var me = meUid();
    var next = Object.assign({}, conv);
    next.participants = arr(next.participants).filter(function(u){ return !sameUid(u,me); });
    next.admins       = arr(next.admins).filter(function(u){ return !sameUid(u,me); });
    next.updatedAt    = new Date().toISOString();
    saveConvsMerge(next);
    safe(function(){ if (typeof global._chatSyncConvUpsert==='function') global._chatSyncConvUpsert(next); });
    safe(function(){
      if (typeof global._chatRemoveInboxEntryForUsers==='function')
        global._chatRemoveInboxEntryForUsers(convId, [me]);
    });
    /* Higieniza MEU inbox local. */
    var mine = getConvs().filter(function(c){ return !(c && c.id===convId); });
    saveConvs(mine);
    try{ LS.removeItem('lf13_chat_msgs_'+convId); }catch(_){}
    if (global._chatCurrentConv === convId && typeof global.closeChatConv==='function'){
      safe(function(){ global.closeChatConv(); });
    }
    safe(function(){ if (typeof global.renderChatList==='function') global.renderChatList(); });
    toast('🚪 Você saiu do grupo');
  }

  function doDissolveGroup(convId){
    var conv = findConv(convId);
    if (!conv || !conv.isGroup) return;
    if (!canDissolveConv(conv)){
      toast('Sem permissão para apagar este grupo. Você pode SAIR dele.');
      return;
    }
    var participants = arr(conv.participants).slice();
    var next = Object.assign({}, conv);
    next.dissolved   = true;
    next.dissolvedAt = new Date().toISOString();
    next.dissolvedBy = meUid();
    next.updatedAt   = next.dissolvedAt;
    next.participants = [];
    next.admins       = [];
    saveConvsMerge(next);

    var syncP = safe(function(){
      if (typeof global._chatSyncConvUpsert==='function') return global._chatSyncConvUpsert(next);
      return Promise.resolve();
    }) || Promise.resolve();

    Promise.resolve(syncP).then(function(){
      return safe(function(){
        if (typeof global._chatRemoveInboxEntryForUsers==='function' && participants.length)
          return global._chatRemoveInboxEntryForUsers(convId, participants);
      });
    }).then(function(){
      var mine = getConvs().filter(function(c){ return !(c && c.id===convId); });
      saveConvs(mine);
      try{ LS.removeItem('lf13_chat_msgs_'+convId); }catch(_){}
      if (global._chatCurrentConv === convId && typeof global.closeChatConv==='function'){
        safe(function(){ global.closeChatConv(); });
      }
      safe(function(){ if (typeof global.renderChatList==='function') global.renderChatList(); });
      toast('🗑 Grupo apagado para todos');
    }).catch(function(e){
      warn('dissolveGroup falhou no sync remoto', e && e.message);
      /* Local já salvo — não trava a UI. */
      safe(function(){ if (typeof global.renderChatList==='function') global.renderChatList(); });
      toast('⚠ Grupo apagado localmente; a sincronização remota falhou.');
    });
  }

  /* Confirmação dupla SEM prompt() — dois _confirmModal em cascata. */
  function askDissolveViaModal(convId){
    if (typeof global._confirmModal !== 'function'){
      /* Fallback conservador: confirm nativo. */
      if (global.confirm('⚠️ Apagar grupo para TODOS os participantes? Ação irreversível.')){
        if (global.confirm('Tem CERTEZA? Isso remove o grupo de todos.')){
          doDissolveGroup(convId);
        }
      }
      return;
    }
    global._confirmModal({
      title: '🗑 Apagar grupo para TODOS?',
      msg:   'Remove o grupo para <b>todos</b> os participantes.<br>Esta ação é <b>irreversível</b>.',
      okLabel: 'Continuar',
      okClass: 'bd',
      onOk: function(){
        /* Segunda confirmação — sem prompt. */
        global._confirmModal({
          title: '⚠️ CONFIRMAÇÃO FINAL',
          msg:   'Tem certeza que quer apagar este grupo para todos? Não é possível desfazer.',
          okLabel: 'SIM, apagar',
          okClass: 'bd',
          onOk: function(){ doDissolveGroup(convId); }
        });
      }
    });
  }

  function askLeaveViaModal(convId){
    if (typeof global._confirmModal !== 'function'){
      if (global.confirm('Sair do grupo? (O grupo continua para os demais.)')) doLeaveGroup(convId);
      return;
    }
    global._confirmModal({
      title: 'Sair do grupo?',
      msg:   'Você não receberá mais mensagens deste grupo.<br>O grupo continua para os demais participantes.',
      okLabel: 'Sair',
      okClass: 'bd',
      onOk: function(){ doLeaveGroup(convId); }
    });
  }

  /* Nova chatDeleteConv canônica — vence todos os wrappers anteriores. */
  function installFinalChatDeleteConv(){
    var w = function(convId){
      var conv = findConv(convId);
      if (!conv){ warn('chatDeleteConv: conv não encontrada', convId); return; }
      /* DM: preserva comportamento original se ainda existir uma referência. */
      if (!conv.isGroup){
        var orig = global.__origChatDeleteConv_lfCancel;
        if (typeof orig === 'function') return orig.apply(this, arguments);
        /* Fallback DM simples: só remove local + inbox. */
        var list = getConvs().filter(function(c){ return !(c && c.id===convId); });
        saveConvs(list);
        try{ LS.removeItem('lf13_chat_msgs_'+convId); }catch(_){}
        safe(function(){ if (typeof global.renderChatList==='function') global.renderChatList(); });
        toast('Conversa removida');
        return;
      }
      /* GRUPO: owner efetivo → escolhe; outros → só sair. */
      if (canDissolveConv(conv)){
        if (typeof global._confirmModal === 'function'){
          global._confirmModal({
            title: 'Excluir conversa (grupo)',
            msg:   'Você é ADM/criador deste grupo.<br><br>'
                 + '• <b>Sair apenas eu</b>: o grupo continua para os demais.<br>'
                 + '• <b>Apagar p/ todos</b>: remove o grupo para todos.',
            okLabel: 'Apagar p/ todos',
            okClass: 'bd',
            cancelLabel: 'Sair apenas eu',
            onOk:     function(){ askDissolveViaModal(convId); },
            onCancel: function(){ askLeaveViaModal(convId); }
          });
        } else {
          if (global.confirm('OK = apagar p/ TODOS. Cancelar = só sair.')) askDissolveViaModal(convId);
          else askLeaveViaModal(convId);
        }
      } else {
        askLeaveViaModal(convId);
      }
    };
    w.__lfCancelFinal = true;

    /* Guarda referência ao encadeamento original para DM. */
    if (typeof global.chatDeleteConv === 'function' && !global.chatDeleteConv.__lfCancelFinal){
      /* Só guarda uma vez, ignorando wrappers de grupo. */
      if (!global.__origChatDeleteConv_lfCancel){
        global.__origChatDeleteConv_lfCancel = global.chatDeleteConv;
      }
    }
    global.chatDeleteConv = w;

    /* Reinstala se outro patch tardio sobrescrever.
     * ARMISTÍCIO 20260804: se o patch lf-fix-dm-delete-isolation embrulhou
     * por cima (ele DELEGA grupo para esta canônica via prev), não brigar —
     * antes os dois watchdogs se sobrescreviam a cada 2,5s em loop infinito. */
    setInterval(function(){
      var curDel = global.chatDeleteConv;
      if (curDel !== w && !(curDel && curDel.__lfDmDeleteIsolation)) {
        global.chatDeleteConv = w;
        warn('chatDeleteConv sobrescrito por patch tardio — reinstalado.');
      }
    }, 2500);

    log('chatDeleteConv canônico instalado (sem prompt, dupla confirmação por modal).');
  }

  /* Também expõe helpers no LF_CHAT_GROUP_MANAGE para o menu de gestão. */
  function upgradeGroupManage(){
    var prev = global.LF_CHAT_GROUP_MANAGE || {};
    prev.leave    = function(convId){ askLeaveViaModal(convId || global._chatCurrentConv); };
    prev.dissolve = function(convId){ askDissolveViaModal(convId || global._chatCurrentConv); };
    global.LF_CHAT_GROUP_MANAGE = prev;
    log('LF_CHAT_GROUP_MANAGE.leave/dissolve substituídos.');
  }

  /* =====================================================================
   * PARTE 6 — NEUTRALIZAR HANDLER CAPTURE DO CTX-MENU QUE USA prompt()
   * ---------------------------------------------------------------------
   * lf-fix-novaconv-e-ctxgrupo-v1 instala um listener capture=true em
   * document que chama seu próprio strictDissolveGroup (prompt).
   * Interceptamos ANTES (mesmo capture, mas registrado depois — porém
   * ambos rodam; usamos stopImmediatePropagation apenas para ações
   * 'dissolve'/'leave'/'delete-conv' de grupo).
   * ===================================================================== */
  function interceptCtxMenu(){
    D.addEventListener('click', function(ev){
      var btn = ev.target && ev.target.closest && ev.target.closest('.chat-ctx-btn');
      if (!btn) return;
      var menu = btn.closest('#chat-ctx-menu');
      if (!menu) return;
      var act = btn.getAttribute('data-act');
      if (act !== 'leave' && act !== 'dissolve' && act !== 'delete-conv') return;

      var convEl = D.querySelector('.chat-conv-item.ctx-target[data-conv-id]');
      var convId = (convEl && convEl.getAttribute('data-conv-id')) || global._chatCurrentConv || '';
      var conv = findConv(convId);
      if (!conv) return;

      /* Bloqueia handlers concorrentes e usa nosso fluxo canônico. */
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      ev.preventDefault();

      /* Fecha o ctx-menu imediatamente. */
      safe(function(){ if (typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu(); });
      safe(function(){
        var m = D.getElementById('chat-ctx-menu');       if (m && m.parentNode) m.parentNode.removeChild(m);
        var b = D.getElementById('chat-ctx-backdrop');    if (b && b.parentNode) b.parentNode.removeChild(b);
      });

      if (!conv.isGroup){
        /* DM: comportamento original de exclusão via ref preservada. */
        setTimeout(function(){
          if (typeof global.__origChatDeleteConv_lfCancel === 'function')
            global.__origChatDeleteConv_lfCancel(convId);
          else if (typeof global.chatDeleteConv === 'function')
            global.chatDeleteConv(convId);
        }, 10);
        return;
      }

      if (act === 'leave'){
        askLeaveViaModal(convId);
      } else if (act === 'dissolve' || act === 'delete-conv'){
        if (canDissolveConv(conv)){
          /* Consistente com chatDeleteConv canônica: pergunta antes. */
          if (typeof global._confirmModal === 'function'){
            global._confirmModal({
              title: 'Excluir conversa (grupo)',
              msg:   'Você é ADM/criador deste grupo.<br><br>'
                   + '• <b>Sair apenas eu</b>: o grupo continua para os demais.<br>'
                   + '• <b>Apagar p/ todos</b>: remove o grupo para todos.',
              okLabel: 'Apagar p/ todos',
              okClass: 'bd',
              cancelLabel: 'Sair apenas eu',
              onOk:     function(){ askDissolveViaModal(convId); },
              onCancel: function(){ askLeaveViaModal(convId); }
            });
          } else {
            askLeaveViaModal(convId);
          }
        } else {
          askLeaveViaModal(convId);
        }
      }
    }, true /* capture — precisa ser TRUE para preemptar os handlers concorrentes */);
    log('ctx-menu interceptado (leave/dissolve/delete-conv → fluxo canônico).');
  }

  /* =====================================================================
   * PARTE 7 — WATCHDOG SUAVE (destravar modal fantasma se sobrar)
   * ===================================================================== */
  function unstickOnce(){
    try{
      var mos = D.querySelectorAll('.mo');
      for (var i=0;i<mos.length;i++){
        var el = mos[i];
        if (el.classList.contains('open') || el.classList.contains('on')) continue;
        var cs = safe(function(){ return global.getComputedStyle(el); }, null);
        if (!cs) continue;
        if (cs.display !== 'none' && cs.visibility !== 'hidden'){
          el.style.setProperty('display','none','important');
          el.style.setProperty('pointer-events','none','important');
          el.style.setProperty('opacity','0','important');
          el.style.setProperty('visibility','hidden','important');
          warn('modal fantasma destravado:', '#'+(el.id||'?'));
        }
      }
      /* Body preso? */
      if (!D.querySelector('.mo.open, .mo.on') && D.body && D.body.style.top){
        D.body.style.top = '';
        D.body.style.position = '';
        D.body.style.width = '';
        D.body.style.overflow = '';
      }
    }catch(_e){}
  }

  global.lfDestravarModal = function(){
    injectGuardCSS();
    sanitize4BugsStyle();
    unstickOnce();
    log('lfDestravarModal() executado.');
    return true;
  };

  /* =====================================================================
   * BOOT
   * ===================================================================== */
  function boot(){
    injectGuardCSS();          /* [1] primeiro — efeito imediato no paint */
    sanitize4BugsStyle();      /* [2] limpa o style do 4bugs se já existir */
    armStyleObserver();        /* [3] re-sanitiza se algum patch reinjetar */
    hardenOpenM();             /* [4] wrappers openM/closeM (ordem importa) */
    hardenCloseM();
    armEscapeHatch();          /* [5] ESC + backdrop + Cancelar reforçados */
    upgradeGroupManage();      /* [6] leave/dissolve sem prompt */
    installFinalChatDeleteConv(); /* [7] chatDeleteConv canônica */
    interceptCtxMenu();        /* [8] ctx-menu → fluxo canônico */
    unstickOnce();             /* [9] destrava se já estava travado */

    /* Watchdog: 1 tick/segundo por 60s, depois 1 tick a cada 5s. */
    var ticks = 0;
    var iv = setInterval(function(){
      ticks++;
      sanitize4BugsStyle();
      unstickOnce();
      if (ticks === 60){
        clearInterval(iv);
        setInterval(function(){ sanitize4BugsStyle(); unstickOnce(); }, 5000);
      }
    }, 1000);

    log('boot completo — Cancelar do #mo-chat-new e Sair/Apagar de grupo protegidos.');
    log('Diagnóstico manual: window.lfDestravarModal()');
  }

  if (D.readyState === 'loading'){
    D.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})(window);
