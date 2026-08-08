/* =====================================================================
 * lf-overdue-activity-notif-fix-20260729.js
 * ---------------------------------------------------------------------
 * BUG HUNT — Correção definitiva: "atividades atrasadas não notificam
 * no sino (#ntf-bell / #ntf-badge), apenas na bolinha da aba Agenda".
 *
 * CAUSA RAIZ (rastreada em toda a base):
 *   O pipeline de vencimento (showActAlert / checkUpcomingActs em
 *   js/agenda.js) NUNCA escreve em lf_notif_<uid>. Só toca som,
 *   mostra barra visual, marca read=true e dispara Notification nativa
 *   (que depende de permissão). Como updateNotifBadge lê apenas
 *   getNotifs(S.userId), o sino fica permanentemente zerado para
 *   atividades atrasadas — inclusive quando o usuário criou a atividade
 *   pra si mesmo (isSelf) e quando venceu há > 24h (o "vencida ontem"
 *   nem chega a agendar setTimeout em scheduleActAlert).
 *
 * ESTRATÉGIA (mínima, não invasiva):
 *   1) Wrapper em showActAlert  → após rodar, upsert de notificação
 *      'activity' no feed do próprio usuário (id determinístico
 *      'ntf_act_<actId>'), preservando o comportamento original.
 *   2) Wrapper em checkUpcomingActs → varredura de segurança
 *      cobrindo atividades vencidas há >24h e o ramo hasPending
 *      (que hoje adia showActAlert e some com o registro).
 *   3) Wrapper em updateActBadge → se a atividade virou done, marca
 *      a notif 'ntf_act_<id>' como lida (limpa o sino).
 *   4) Passada inicial no boot (após S.userId existir) — resolve o
 *      caso do usuário abrir o CRM já com atrasadas do dia anterior.
 *   5) Reobservação em foco/visibilidade — igual ao patch de tab dots.
 *
 * Idempotente. Só age quando window.S.userId existe.
 *
 * Dependências (todas verificadas presentes no bundle):
 *   window.S, window.getNotifs, window.saveNotifsFor, window.updateNotifBadge,
 *   window.getActivities, window._scheduledAtTs, window.showActAlert,
 *   window.checkUpcomingActs, window.updateActBadge.
 *
 * Sem migration. Sem back-end. Sem SW. Reversível — basta remover o
 * <script> no index.html/app.html.
 * ===================================================================== */
(function () {
  'use strict';

  if (window.__LF_OVERDUE_NOTIF_FIX_20260729) return;
  window.__LF_OVERDUE_NOTIF_FIX_20260729 = true;

  var NOTIF_TYPE   = 'activity';
  var NOTIF_PREFIX = 'ntf_act_';
  var MAX_FEED     = 200;

  function _hasSession() { return !!(window.S && window.S.userId); }

  function _actKey(actId) { return NOTIF_PREFIX + String(actId); }

  function _activityText(a) {
    try {
      var ic = '⏰';
      try {
        if (window.ACT_TYPES && window.ACT_TYPES[a.type] && window.ACT_TYPES[a.type].ic) {
          ic = window.ACT_TYPES[a.type].ic;
        }
      } catch (_e) {}
      var body = (a.clientNome ? (a.clientNome + ': ') : '') + (a.desc || 'Atividade');
      return ic + ' Atrasada — ' + String(body).slice(0, 120);
    } catch (_e) {
      return '⏰ Atividade atrasada';
    }
  }

  /* -----------------------------------------------------------------
   * Upsert de UMA notificação de atividade atrasada no feed do usuário
   * ----------------------------------------------------------------- */
  function _upsertOverdueNotif(a) {
    if (!a || !a.id || !_hasSession()) return false;
    if (typeof window.getNotifs !== 'function' ||
        typeof window.saveNotifsFor !== 'function') return false;
    if (a.done) return false;
    if (!a.scheduledAt) return false;

    var ts = (typeof window._scheduledAtTs === 'function') ? window._scheduledAtTs(a.scheduledAt) : NaN;
    if (!isFinite(ts) || ts >= Date.now()) return false; // ainda não venceu

    var me    = window.S.userId;
    var list  = window.getNotifs(me) || [];
    var key   = _actKey(a.id);
    var text  = _activityText(a);
    var nowIso = new Date().toISOString();

    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === key) { idx = i; break; }
    }

    var changed = false;
    if (idx === -1) {
      list.unshift({
        id:      key,
        type:    NOTIF_TYPE,
        text:    text,
        ts:      nowIso,
        lida:    false,
        actId:   a.id,
        cardId:  a.clientId || null,
        board:   a.board || null
      });
      if (list.length > MAX_FEED) list = list.slice(0, MAX_FEED);
      changed = true;
    } else {
      var n = list[idx];
      // Se a atividade voltou a estar atrasada (reagendada para o passado),
      // reabrimos a notificação como não lida.
      if (n.lida || n.text !== text) {
        n.text   = text;
        n.lida   = false;
        n.ts     = nowIso;
        n.cardId = a.clientId || n.cardId || null;
        n.board  = a.board    || n.board  || null;
        n.actId  = a.id;
        changed  = true;
      }
    }

    if (changed) {
      try { window.saveNotifsFor(me, list); } catch (_e) {}
      try { if (typeof window.updateNotifBadge === 'function') window.updateNotifBadge(); } catch (_e) {}
    }
    return changed;
  }

  /* -----------------------------------------------------------------
   * Marca a notificação da atividade como lida quando ela vira done
   * ----------------------------------------------------------------- */
  function _markDoneActNotifRead(actId) {
    if (!actId || !_hasSession()) return;
    if (typeof window.getNotifs !== 'function' ||
        typeof window.saveNotifsFor !== 'function') return;
    var me   = window.S.userId;
    var list = window.getNotifs(me) || [];
    var key  = _actKey(actId);
    var hit  = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === key) { hit = list[i]; break; }
    }
    if (hit && !hit.lida) {
      hit.lida = true;
      try { window.saveNotifsFor(me, list); } catch (_e) {}
      try { if (typeof window.updateNotifBadge === 'function') window.updateNotifBadge(); } catch (_e) {}
    }
  }

  /* -----------------------------------------------------------------
   * Varredura de segurança — cobre:
   *  - atrasadas > 24h (scheduleActAlert nunca cria timer)
   *  - hasPending adiando showActAlert
   *  - usuário abriu o CRM já com atrasadas do dia anterior
   *  - atividades marcadas como done desde o último tick
   * ----------------------------------------------------------------- */
  function _sweepOverdueOwn() {
    if (!_hasSession()) return;
    if (typeof window.getActivities !== 'function') return;

    var acts = window.getActivities() || [];
    var me   = window.S.userId;

    // 1) Insere/atualiza notifs para todas as atrasadas ativas
    acts.forEach(function (a) {
      if (!a || a.done || !a.scheduledAt) return;
      var ts = (typeof window._scheduledAtTs === 'function') ? window._scheduledAtTs(a.scheduledAt) : NaN;
      if (isFinite(ts) && ts < Date.now()) {
        try { _upsertOverdueNotif(a); } catch (_e) {}
      }
    });

    // 2) Limpa notifs de atividades que viraram done
    acts.forEach(function (a) {
      if (a && a.done && a.id) {
        try { _markDoneActNotifRead(a.id); } catch (_e) {}
      }
    });
  }

  /* -----------------------------------------------------------------
   * Monkey-patch idempotente: envelopa fn global preservando retorno
   * ----------------------------------------------------------------- */
  function _lfWrap(fnName, after) {
    var orig = window[fnName];
    if (typeof orig !== 'function') return false;
    if (orig.__lfOverdueWrapped) return true;
    var wrapped = function () {
      var ret;
      try { ret = orig.apply(this, arguments); } catch (e) { throw e; }
      finally {
        try { after.apply(null, arguments); } catch (_e) {}
      }
      return ret;
    };
    wrapped.__lfOverdueWrapped = true;
    try { window[fnName] = wrapped; } catch (_e) { return false; }
    return true;
  }

  function _installWrappers() {
    var allDone = true;

    // Após showActAlert(a): upserta notif da própria atividade
    if (!_lfWrap('showActAlert', function (a) {
      try { if (a) _upsertOverdueNotif(a); } catch (_e) {}
    })) allDone = false;

    // Após checkUpcomingActs(): varredura de segurança (atrasadas >24h)
    if (!_lfWrap('checkUpcomingActs', function () {
      try { _sweepOverdueOwn(); } catch (_e) {}
    })) allDone = false;

    // Depois de updateActBadge(): se alguma virou done, marca notif como lida
    if (!_lfWrap('updateActBadge', function () {
      try {
        if (typeof window.getActivities !== 'function') return;
        var acts = window.getActivities() || [];
        acts.forEach(function (a) {
          if (a && a.done && a.id) _markDoneActNotifRead(a.id);
        });
      } catch (_e) {}
    })) allDone = false;

    // Se alguma função ainda não existir no boot (lazy load), tenta de novo
    if (!allDone) setTimeout(_installWrappers, 400);
  }

  /* -----------------------------------------------------------------
   * Boot
   * ----------------------------------------------------------------- */
  function _boot() {
    _installWrappers();

    // Primeira passada assim que houver sessão
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (_hasSession()) {
        _sweepOverdueOwn();
        clearInterval(iv);
      } else if (tries > 40) {
        clearInterval(iv);
      }
    }, 500);

    // Rede de segurança: volta/foco da aba re-sweepa
    try {
      window.addEventListener('focus', function () { try { _sweepOverdueOwn(); } catch (_e) {} });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          try { _sweepOverdueOwn(); } catch (_e) {}
        }
      });
    } catch (_e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

  // API para debug/CLI (equivalente ao LF_NOTIFY_GLOBAL do outro patch)
  window.LF_OVERDUE_NOTIF_FIX = {
    version: 'v1-20260729',
    sweep:   _sweepOverdueOwn,
    upsertFor: function (actId) {
      try {
        var acts = (typeof window.getActivities === 'function') ? window.getActivities() : [];
        var a = acts.find(function (x) { return x && x.id === actId; });
        if (a) _upsertOverdueNotif(a);
      } catch (_e) {}
    }
  };
})();
