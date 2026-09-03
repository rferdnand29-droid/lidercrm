/* =====================================================================
 * lf-notif-visibility-fix-v1-20260729.js
 * ---------------------------------------------------------------------
 * Complementa lf-notify-global-v1-20260727.js:
 *   - Em Capacitor Android, `visibilitychange` às vezes NÃO dispara ao
 *     voltar do background. O timer da inbox (`_globalInboxTimer`)
 *     existe mas retorna cedo por `!_visible()`.
 *   - Solução: força um `loadNotifsRemote` em `pageshow`, `focus` (win),
 *     `resume` (capacitor), e em qualquer clique se passou >30s do
 *     último poll bem-sucedido.
 *   - Também dispara `_lfRefreshTabDots` para atualizar bolinhas topo.
 * Sem backend novo. Idempotente.
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__LF_NOTIF_VISIBILITY_FIX_20260729) return;
  window.__LF_NOTIF_VISIBILITY_FIX_20260729 = true;

  var LAST_POLL_KEY = '__lfLastNotifPollTs';
  var MIN_INTERVAL  = 30 * 1000;

  function _forcePoll(reason) {
    try {
      if (!window.S || !window.S.userId) return;
      var now = Date.now();
      if (window[LAST_POLL_KEY] && (now - window[LAST_POLL_KEY]) < MIN_INTERVAL) return;
      window[LAST_POLL_KEY] = now;
      if (typeof window.loadNotifsRemote === 'function') {
        window.loadNotifsRemote(function () {
          try { window.updateNotifBadge && window.updateNotifBadge(); } catch (_e) {}
          try { window._lfRefreshTabDots && window._lfRefreshTabDots(); } catch (_e) {}
        });
      }
      try { window._chatPollNewMsgs && window._chatPollNewMsgs(); } catch (_e) {}
    } catch (_e) {}
  }

  window.addEventListener('pageshow',  function () { _forcePoll('pageshow');  });
  window.addEventListener('focus',     function () { _forcePoll('focus');     });
  document.addEventListener('resume',  function () { _forcePoll('resume');    });
  document.addEventListener('click',   function () { _forcePoll('click');     }, { passive: true, capture: true });
})();
