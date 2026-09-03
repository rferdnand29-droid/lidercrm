/* =====================================================================
 * lf-tab-dots-notif-fix-20260729.js
 * ---------------------------------------------------------------------
 * BUG HUNT — BLOCO 2 (2026-07-29)
 *
 * Corrige DOIS defeitos correlatos:
 *
 * 1) Nas abas do topo (Bingo, Leads, Negócios, Agenda, Papo, Analytics,
 *    Dicionário, Config, Time, ADM) não havia NENHUM indicador visual
 *    de que existe pendência (mensagem não lida em Papo, atividade
 *    atrasada em Agenda, etc). O bug pedido era o de "Papo", mas o
 *    mesmo mecanismo foi generalizado (custa quase nada) e já permite
 *    ligar futuras bolinhas em outras abas só apontando o provider.
 *
 * 2) Uma nova mensagem de chat entregue pelo Realtime/poll atualizava
 *    o badge INTERNO do chat (chat-badge / .mbn-dot da aba mobile) e
 *    disparava a notificação nativa do SO, mas NUNCA escrevia em
 *    lf_notif_<destinatario>. Como o sino do topo (#ntf-bell / #ntf-badge)
 *    lê getNotifs(S.userId), ele permanecia zerado — exatamente o
 *    sintoma da imagem 2 ("mensagem de ontem não notificada").
 *
 * Causa raiz do sino silencioso:
 *   - chat.js:_chatPushMsg chama pushNotif(uid,'chat',…) ANTES do
 *     sync, mas roda no navegador do REMETENTE. pushNotif grava em
 *     saveNotifsFor(toUid,…) que é sempre localStorage local -> gera
 *     notificação no navegador de A para o próprio A, não em B.
 *   - No RECEPTOR (chat.js:2076-2115 poll / :2200-2220 realtime) só
 *     rodam _chatUpdateUnreadBadge + fireNativeNotification. Não há
 *     pushNotif local, nem updateNotifBadge().
 *
 * Estratégia (mínima e sem tocar em back):
 *   - Monkey-patch em _chatUpdateUnreadBadge, updateActBadge,
 *     updateNotifBadge e openChatConv (chamados via window.*).
 *   - Ao contar mensagens não lidas do próprio usuário, criar/atualizar
 *     no feed lf_notif_<meuId> UMA notif por conversa (id determinístico
 *     'ntf_chat_'+convId) refletindo a última mensagem não lida.
 *   - Chamar updateNotifBadge() em seguida para refrescar o sino.
 *   - Ao abrir a conversa, marcar a notif chat dessa conv como lida.
 *   - Renderizar bolinha vermelha nos títulos de topo via .nt-dot,
 *     e re-avaliar a cada tick do badge (que já é chamado tanto pelo
 *     poll do chat quanto pelo intervalo de 60 s de atividades/notifs).
 *
 * Idempotente: pode ser incluído múltiplas vezes sem duplicar handlers
 * (usa flag global). Só efetua trabalho após S.userId existir.
 * ===================================================================== */
(function(){
  'use strict';

  if (window.__LF_TAB_DOTS_NOTIF_FIX_20260729) return;
  window.__LF_TAB_DOTS_NOTIF_FIX_20260729 = true;

  /* ----------------------------------------------------------------- *
   * 1) CSS da bolinha vermelha nas abas do topo (.nt)                *
   * ----------------------------------------------------------------- */
  try {
    var css = ''
      + '.nt{position:relative;}'
      + '.nt .nt-dot{position:absolute;top:2px;right:2px;width:8px;height:8px;'
      +   'border-radius:50%;background:#e83b3b;box-shadow:0 0 0 2px var(--bg,#12141a);'
      +   'display:none;pointer-events:none;}'
      + '.nt.has-alert .nt-dot{display:block;animation:lfNtDotPulse 1.6s ease-in-out infinite;}'
      + '@keyframes lfNtDotPulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.25);opacity:.75;}}'
      + 'body.theme-classic .nt .nt-dot{background:#C22026;box-shadow:0 0 0 2px #fff;}';
    var st = document.createElement('style');
    st.setAttribute('data-lf-patch', 'tab-dots-notif-20260729');
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  } catch (_e) {}

  /* ----------------------------------------------------------------- *
   * 2) Provider central: existe pendência para esta aba?             *
   *    - 'chat'    : mensagens não lidas de outros usuários          *
   *    - 'agenda'  : atividade atrasada NÃO CONCLUÍDA do usuário    *
   *    (demais abas retornam false — plugáveis no futuro)            *
   * ----------------------------------------------------------------- */
  function _lfChatUnreadTotal() {
    try {
      if (!window.S || !window.S.userId) return 0;
      if (typeof window._chatGetConvs !== 'function' ||
          typeof window._chatGetMsgs  !== 'function') return 0;
      var me = window.S.userId;
      var total = 0;
      var convs = window._chatGetConvs() || [];
      convs.forEach(function (c) {
        if (!c) return;
        var msgs = window._chatGetMsgs(c.id) || [];
        msgs.forEach(function (m) {
          if (!m || m.read) return;
          var forMe = c.isGroup ? (m.fromUid !== me) : (m.toUid === me);
          if (forMe) total++;
        });
      });
      return total;
    } catch (_e) { return 0; }
  }

  function _lfAgendaOverdueCount() {
    try {
      if (!window.S || !window.S.userId) return 0;
      if (typeof window.getActivitiesLocalFor !== 'function') return 0;
      var list = window.getActivitiesLocalFor(window.S.userId) || [];
      var overdue = 0;
      // Filtro de dono (2026-08-12): ADM/supervisor pode ter, no MESMO
      // aparelho, atividades de outros consultores cacheadas por outras
      // telas (ex.: painel de atividades da equipe) — se algo escrever
      // nessa mesma chave local, contar tudo sem checar o dono gera
      // pontinho vermelho na Agenda por atividade atrasada de TERCEIRO,
      // não da própria pessoa. Registros antigos sem userId (de antes
      // desse campo existir) continuam contando — só exclui quando o
      // dono está preenchido E é de outra pessoa.
      list.forEach(function (a) {
        if (!a || a.done || !a.scheduledAt) return;
        if (a.userId && a.userId !== window.S.userId) return;
        var expired = (typeof window._isScheduledExpired === 'function')
          ? window._isScheduledExpired(a.scheduledAt, Date.now())
          : (isFinite(new Date(a.scheduledAt).getTime()) && new Date(a.scheduledAt).getTime() < Date.now());
        if (expired) overdue++;
      });
      return overdue;
    } catch (_e) { return 0; }
  }

  /* Pontinho da aba Leads/Negócios (2026-08-16): true se existir, AGORA,
     atividade não concluída e vencida vinculada a um card daquele board.
     Mesmo filtro de dono do helper acima, mesma fonte (store central de
     atividades) — só que agrupado por board em vez de contado por si só. */
  function _lfBoardHasOverdue(board) {
    try {
      if (!window.S || !window.S.userId) return false;
      if (typeof window.getActivitiesLocalFor !== 'function') return false;
      var list = window.getActivitiesLocalFor(window.S.userId) || [];
      var now = Date.now();
      return list.some(function (a) {
        if (!a || a.done || !a.scheduledAt) return false;
        if (a.board !== board) return false;
        if (a.userId && a.userId !== window.S.userId) return false;
        /* LF-FIX-3BUGS-v1-20260819 #1: atividade vinculada a card em etapa terminal
           (desc/noshow/conv/desist/fechado) nao acende a bolinha. */
        try{
          if(a.clientId && typeof window.getKBFor==='function'){
            var _cards=window.getKBFor(board,a.userId||window.S.userId)||[];
            for(var _i=0;_i<_cards.length;_i++){
              if(String(_cards[_i]&&_cards[_i].id)===String(a.clientId)){
                if(['desc','noshow','conv','desist','fechado'].indexOf(String(_cards[_i].col||''))>=0)return false;
                break;
              }
            }
          }
        }catch(_e2){}
        return (typeof window._isScheduledExpired === 'function')
          ? window._isScheduledExpired(a.scheduledAt, now)
          : (isFinite(new Date(a.scheduledAt).getTime()) && new Date(a.scheduledAt).getTime() < now);
      });
    } catch (_e) { return false; }
  }

  window._lfTabHasAlerts = function (page) {
    switch (page) {
      case 'chat':     return _lfChatUnreadTotal()      > 0;
      case 'leads':    return _lfBoardHasOverdue('leads');
      case 'negocios': return _lfBoardHasOverdue('negocios');
      // Pontinho da Agenda removido a pedido (2026-08-16): a Agenda não
      // deve mais notificar reunião/atividade atrasada por aqui. O aviso
      // fica só no botão "Lembrete" vermelho de cada card (ver kanban.js).
      default:         return false;
    }
  };

  /* ----------------------------------------------------------------- *
   * 3) Casar cada .nt do topo ao seu "page" e desenhar a bolinha     *
   * ----------------------------------------------------------------- */
  function _lfPageOfTab(btn) {
    // A forma mais confiável é olhar o onclick — buildNav gera:
    //   onclick="goPage('chat')" etc.
    try {
      var oc = btn.getAttribute('onclick') || '';
      var m  = oc.match(/goPage\(['"]([^'"]+)['"]\)/);
      if (m) return m[1];
      // Fallback por texto (defensivo, caso buildNav mude no futuro)
      var txt = (btn.textContent || '').trim();
      if (/Papo/.test(txt))       return 'chat';
      if (/Agenda/.test(txt))     return 'agenda';
      if (/Bingo/.test(txt))      return 'dash';
      if (/Leads/.test(txt))      return 'leads';
      if (/gócio/.test(txt))      return 'negocios';
      if (/Analytics/.test(txt))  return 'anal';
      if (/icion/.test(txt))      return 'dic';
      if (/Config|⚙/.test(txt))   return 'config';
      if (/Time/.test(txt))       return 'time';
      if (/^ADM$/.test(txt))      return 'adm';
    } catch (_e) {}
    return null;
  }

  function _lfEnsureTabDots() {
    try {
      var tabs = document.querySelectorAll('#ntabs .nt');
      tabs.forEach(function (btn) {
        if (!btn.querySelector('.nt-dot')) {
          var d = document.createElement('span');
          d.className = 'nt-dot';
          btn.appendChild(d);
        }
      });
    } catch (_e) {}
  }

  function _lfRefreshTabDots() {
    try {
      _lfEnsureTabDots();
      var tabs = document.querySelectorAll('#ntabs .nt');
      tabs.forEach(function (btn) {
        var page   = _lfPageOfTab(btn);
        var active = !!(page && window._lfTabHasAlerts && window._lfTabHasAlerts(page));
        btn.classList.toggle('has-alert', active);
      });
    } catch (_e) {}
  }
  window._lfRefreshTabDots = _lfRefreshTabDots;

  // Observa mutações em #ntabs (buildNav é chamado no boot / após login /
  // ao trocar de permissão), para plugar automaticamente as .nt-dot novas.
  function _lfWatchNtabs() {
    try {
      var t = document.getElementById('ntabs');
      if (!t || t.__lfDotObs) return;
      var mo = new MutationObserver(function () { _lfRefreshTabDots(); });
      mo.observe(t, { childList: true, subtree: false });
      t.__lfDotObs = mo;
      _lfRefreshTabDots();
    } catch (_e) {}
  }

  /* ----------------------------------------------------------------- *
   * 4) Sincroniza "chat -> sino": para CADA conv, cria/atualiza UMA  *
   *    notificação chat no feed lf_notif_<meuId> quando houver msg  *
   *    não lida; remove/marca como lida caso contrário.             *
   * ----------------------------------------------------------------- */
  var _syncing = false;
  function _lfSyncChatIntoNotifFeed() {
    if (_syncing) return; // evita recursão via updateNotifBadge -> re-render
    if (!window.S || !window.S.userId) return;
    if (typeof window.getNotifs      !== 'function' ||
        typeof window.saveNotifsFor  !== 'function' ||
        typeof window._chatGetConvs  !== 'function' ||
        typeof window._chatGetMsgs   !== 'function') return;

    _syncing = true;
    try {
      var me    = window.S.userId;
      var convs = window._chatGetConvs() || [];
      var list  = window.getNotifs(me) || [];
      var byKey = {};
      list.forEach(function (n) { if (n && n.id) byKey[n.id] = n; });

      var changed = false;

      convs.forEach(function (c) {
        if (!c) return;
        var key  = 'ntf_chat_' + c.id;
        var msgs = window._chatGetMsgs(c.id) || [];

        // Última msg não lida direcionada a mim
        var last = null;
        for (var i = msgs.length - 1; i >= 0; i--) {
          var m = msgs[i];
          if (!m || m.read) continue;
          var forMe = c.isGroup ? (m.fromUid !== me) : (m.toUid === me);
          if (forMe) { last = m; break; }
        }

        var existing = byKey[key];

        if (last) {
          var preview = last.text
            || (last.attachmentKind === 'audio' ? '🎤 Áudio'
                : (last.attachmentName ? '📎 ' + last.attachmentName : 'Nova mensagem'));
          var text = '💬 ' + (last.fromName || '?') + ': ' + String(preview).slice(0, 80);

          if (!existing) {
            list.unshift({
              id:      key,
              type:    'chat',
              text:    text,
              ts:      last.ts || new Date().toISOString(),
              lida:    false,
              convId:  c.id,
              cardId:  null,
              board:   null
            });
            changed = true;
          } else if (existing.lida || existing.text !== text || existing.ts !== last.ts) {
            existing.text = text;
            existing.ts   = last.ts || existing.ts;
            existing.lida = false;
            existing.convId = c.id;
            changed = true;
          }
        } else if (existing && !existing.lida) {
          existing.lida = true;
          changed = true;
        }
      });

      if (changed) {
        if (list.length > 200) list = list.slice(0, 200);
        window.saveNotifsFor(me, list);
        if (typeof window.updateNotifBadge === 'function') window.updateNotifBadge();
      }
    } catch (_e) { /* nunca deixa quebrar o fluxo original */ }
    _syncing = false;
  }

  function _lfMarkChatConvNotifRead(convId) {
    if (!convId || !window.S || !window.S.userId) return;
    if (typeof window.getNotifs     !== 'function' ||
        typeof window.saveNotifsFor !== 'function') return;
    try {
      var me   = window.S.userId;
      var list = window.getNotifs(me) || [];
      var key  = 'ntf_chat_' + convId;
      var hit  = list.find(function (n) { return n && n.id === key; });
      if (hit && !hit.lida) {
        hit.lida = true;
        window.saveNotifsFor(me, list);
        if (typeof window.updateNotifBadge === 'function') window.updateNotifBadge();
      }
    } catch (_e) {}
  }

  /* ----------------------------------------------------------------- *
   * 5) Monkey-patch: aproveitar todos os pontos onde o sistema já    *
   *    recalcula badge para (a) alimentar o sino e (b) atualizar    *
   *    as bolinhas do topo.                                          *
   * ----------------------------------------------------------------- */
  function _lfWrap(name, after) {
    var orig = window[name];
    if (typeof orig !== 'function') return false;
    if (orig.__lfWrapped_tabDots_20260729) return true;
    var wrapped = function () {
      var r;
      try { r = orig.apply(this, arguments); }
      finally { try { after.apply(this, arguments); } catch (_e) {} }
      return r;
    };
    wrapped.__lfWrapped_tabDots_20260729 = true;
    window[name] = wrapped;
    return true;
  }

  function _installWrappers() {
    _lfWrap('_chatUpdateUnreadBadge', function () {
      _lfSyncChatIntoNotifFeed();
      _lfRefreshTabDots();
    });
    _lfWrap('updateActBadge', function () {
      _lfRefreshTabDots();
    });
    _lfWrap('updateNotifBadge', function () {
      _lfRefreshTabDots();
    });
    _lfWrap('openChatConv', function (convId) {
      _lfMarkChatConvNotifRead(convId);
      _lfRefreshTabDots();
    });
    // Se _chatUpdateUnreadBadge ainda não existir no momento do carregamento
    // (chat.js pode ser lazy-loaded), tenta de novo daqui a pouco.
    if (typeof window._chatUpdateUnreadBadge !== 'function') {
      setTimeout(_installWrappers, 400);
    }
  }

  /* ----------------------------------------------------------------- *
   * 6) Boot                                                          *
   * ----------------------------------------------------------------- */
  function _boot() {
    _lfWatchNtabs();
    _installWrappers();

    // Primeira passada assim que houver sessão
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (window.S && window.S.userId) {
        _lfSyncChatIntoNotifFeed();
        _lfRefreshTabDots();
        clearInterval(iv);
      } else if (tries > 40) {
        clearInterval(iv);
      }
    }, 500);

    // Rede de segurança: também refresca em eventos de foco/visibilidade,
    // porque quando o usuário volta ao CRM o poll pode ter rodado em
    // background sem o wrapper ver.
    try {
      window.addEventListener('focus', function () {
        _lfSyncChatIntoNotifFeed();
        _lfRefreshTabDots();
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          _lfSyncChatIntoNotifFeed();
          _lfRefreshTabDots();
        }
      });
    } catch (_e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }
})();
