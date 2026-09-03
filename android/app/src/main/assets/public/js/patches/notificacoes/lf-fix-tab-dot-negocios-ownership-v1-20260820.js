/* =====================================================================
 * lf-fix-tab-dot-negocios-ownership-v1-20260820.js
 * ---------------------------------------------------------------------
 * CORRIGE: Bolinha vermelha na aba Negócios (e Leads) acendendo para
 * SUPERVISOR/ADM sem que exista atividade atrasada visível para ele.
 *
 * CAUSA RAIZ (js/patches/notificacoes/lf-tab-dots-notif-fix-20260729.js):
 *   _lfBoardHasOverdue() lia o cache local
 *   getActivitiesLocalFor(S.userId) (chave lf6_act_<uid>) e filtrava por
 *   a.userId. Acontece que atividades criadas na visão Time (supervisor
 *   olhando o quadro de um consultor) são gravadas com userId do
 *   SUPERVISOR (quem criou o lembrete), mas vinculadas a clientId de um
 *   card que NÃO está no board do supervisor (lf6_kb_negocios_<uid_sup>).
 *   O supervisor não vê o card, não consegue concluir/reagendar, e a
 *   bolinha fica acesa para sempre — falso positivo.
 *   A guarda anti-etapa-terminal só checava o card SE encontrasse o
 *   clientId; se o card não existia no board do usuário, a atividade
 *   continuava contando (fallback silencioso para "acende").
 *
 * CORREÇÃO (wrap cirúrgico e idempotente):
 *   Envolve window._lfTabHasAlerts (criada pelo patch original) e, para
 *   as abas 'leads'/'negocios', reconta as atividades atrasadas exigindo:
 *     1) dono/destinatário = usuário logado (tolera campo ausente, como
 *        já fazia);
 *     2) a.clientId EXISTE no board daquele usuário (getKBFor) — senão é
 *        atividade órfã de outro board/dono e não acende a bolinha;
 *     3) o card NÃO está em etapa terminal (desc/noshow/conv/desist/
 *        fechado) — mesmo comportamento do fix LF-FIX-3BUGS-v1-20260819.
 *   Somente se TUDO passar, a bolinha acende. Outras páginas (chat etc.)
 *   delegam 100% ao provider original.
 *
 * GARANTIAS:
 *   - Idempotente: guard __LF_TABDOT_NEG_OWN_V1__.
 *   - Não regride consultor comum: a regra só é mais restritiva; quem
 *     via bolinha corretamente (atividade própria em card próprio ativo)
 *     continua vendo.
 *   - Não toca em back, SW, migrations, Firestore. Apenas leitura local.
 *   - Carregar DEPOIS de lf-tab-dots-notif-fix-20260729.js (wrap por cima).
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__lfFixTabDotNegociosOwnershipV1) return;
  global.__lfFixTabDotNegociosOwnershipV1 = true;
  if (window.__LF_TABDOT_NEG_OWN_V1__) return;
  window.__LF_TABDOT_NEG_OWN_V1__ = true;

  function _overdueVisible(board) {
    try {
      if (!window.S || !window.S.userId) return false;
      if (typeof window.getActivitiesLocalFor !== 'function') return false;
      var me   = window.S.userId;
      var list = window.getActivitiesLocalFor(me) || [];
      var now  = Date.now();
      var cards = (typeof window.getKBFor === 'function') ? (window.getKBFor(board, me) || []) : [];
      var byId = {};
      cards.forEach(function (c) { if (c && c.id != null) byId[String(c.id)] = c; });
      var TERMINAL = ['desc','noshow','conv','desist','fechado'];
      return list.some(function (a) {
        if (!a || a.done || !a.scheduledAt) return false;
        if (a.board !== board) return false;
        if (a.userId && a.userId !== me) return false;
        /* card precisa existir no board do usuário — senão é atividade de
           outro dono/órfã e não deve acender a bolinha dele. */
        var card = a.clientId != null ? byId[String(a.clientId)] : null;
        if (a.clientId != null && !card) return false;
        if (card && TERMINAL.indexOf(String(card.col || '')) >= 0) return false;
        return (typeof window._isScheduledExpired === 'function')
          ? window._isScheduledExpired(a.scheduledAt, now)
          : (isFinite(new Date(a.scheduledAt).getTime()) && new Date(a.scheduledAt).getTime() < now);
      });
    } catch (_e) { return false; }
  }

  function _wrap() {
    if (typeof window._lfTabHasAlerts !== 'function') return false;
    if (window._lfTabHasAlerts.__lfOwnV1) return true;
    var orig = window._lfTabHasAlerts;
    var wrapped = function (page) {
      if (page === 'leads' || page === 'negocios') return _overdueVisible(page);
      return orig.apply(this, arguments);
    };
    wrapped.__lfOwnV1 = true;
    wrapped.__lfOrig = orig;
    window._lfTabHasAlerts = wrapped;
    try { window._lfRefreshTabDots && window._lfRefreshTabDots(); } catch (_e) {}
    return true;
  }

  if (!_wrap()) {
    document.addEventListener('DOMContentLoaded', function () { _wrap(); }, { once: true });
    setTimeout(_wrap, 1200);
  }
})(typeof window !== 'undefined' ? window : globalThis);
