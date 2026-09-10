(function(){
  // patch-id: lf-supervisor-self-default-v1-20260722b
  // objetivo: supervisor abre por padrão no PRÓPRIO pipeline (editável),
  // e não no consolidado "Todos" (que cai em read-only pelo patch teamview).
  //
  // Estratégia: só ajusta o default na PRIMEIRA renderização de cada board.
  // Depois disso, respeita totalmente a escolha do usuário (clicar em "Todos"
  // ou em outro membro do time continua funcionando).
  //
  // Precisa ser carregado DEPOIS de lf-supervisor-teamview-readonly-v1-20260722.js
  // (que é quem define renderTeamBoard/renderKBConsBar para supervisor).

  if (window.LF_SUP_SELF_DEFAULT_V1) return;
  window.LF_SUP_SELF_DEFAULT_V1 = true;

  function isSupervisor(){
    try{
      return (typeof window.hasSupervisorAccess === 'function' && window.hasSupervisorAccess()) &&
             !(typeof window.hasAdminAccess === 'function' && window.hasAdminAccess());
    }catch(_e){
      return false;
    }
  }

  var booted = window.LF_SUP_SELF_DEFAULT_BOOT = window.LF_SUP_SELF_DEFAULT_BOOT || {
    leads: false,
    negocios: false
  };

  function ensureOwnViewOnFirstRender(board){
    try{
      if (!isSupervisor()) return;
      if (!window.S || !S.userId) return;
      if (board !== 'leads' && board !== 'negocios') return;
      if (booted[board]) return;

      window._kbViewUid = window._kbViewUid || { leads: null, negocios: null };

      // Só força na primeira renderização.
      // Depois disso, se o usuário clicar em "Todos" ou em outro membro,
      // respeita a escolha (a marcação de booted acontece via setKBView).
      if (window._kbViewUid[board] == null) {
        window._kbViewUid[board] = S.userId;

        // Repinta a barra "Ver:" para o chip do próprio supervisor
        // aparecer ativo em vez de "Todos".
        try{
          if (typeof window.renderKBConsBar === 'function') {
            window.renderKBConsBar(board);
          }
        }catch(_e){}
      }

      booted[board] = true;
    } catch(_e){}
  }

  if (typeof window.renderKBLocal === 'function') {
    var _origRenderKBLocal = window.renderKBLocal;
    window.renderKBLocal = function(board){
      ensureOwnViewOnFirstRender(board);
      return _origRenderKBLocal.apply(this, arguments);
    };
  }

  if (typeof window.setKBView === 'function') {
    var _origSetKBView = window.setKBView;
    window.setKBView = function(board, uid, btn){
      // Se o supervisor clicou em qualquer chip (inclusive "Todos" com uid=null),
      // consideramos que ele tomou uma decisão consciente — não sobrescrever mais.
      if (isSupervisor() && board && (board === 'leads' || board === 'negocios')) {
        booted[board] = true;
      }
      return _origSetKBView.apply(this, arguments);
    };
  }

  try {
    console.log('[lf-supervisor-self-default] aplicado');
  } catch(_e){}
})();
