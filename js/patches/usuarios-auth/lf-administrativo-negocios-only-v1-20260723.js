/* =====================================================================
 * lf-administrativo-negocios-only-v1-20260723.js
 * ---------------------------------------------------------------------
 * Etapa 3 do plano de hierarquia (2026-07-23).
 *
 * Cargo "administrativo": escopo=self, leads=NONE, negocios=CRUD.
 * Este patch esconde/bloqueia toda a UI de LEADS quando o usuário
 * logado é administrativo, mantendo NEGÓCIOS totalmente funcional.
 *
 * Padrão idêntico ao lf-supervisor-teamview-readonly-v1-20260722.js:
 *  - IIFE + guarda de idempotência (window.__LF_ADM_NEG_ONLY_V1__)
 *  - Consulta CARGO_CAPS via getCargoCaps() (adicionado em auth.js
 *    na Etapa 2). Nunca depende de código antigo (CARGO_NIVEIS).
 *  - Aditivo: não toca nos patches antigos nem em app.js/leads.js.
 *
 * Estratégia:
 *  1) Esconde o botão "Leads" da top-nav em buildNav (via observação
 *     do DOM depois que buildNav rodar).
 *  2) Intercepta goPage('leads') e redireciona para 'negocios'
 *     (que é o único board acessível). Fallback: 'dash'.
 *  3) Bloqueia mutações que criem/movam leads: openKBNew,
 *     saveKBCard, moveCard, _kbMoveCard, convertToNeg (invertido:
 *     converter para negócio ainda é OK — o alvo final é negócios),
 *     ctxEdit e afins, quando o board alvo é 'leads'.
 *
 * SUPOSIÇÃO REGISTRADA: cargo "administrativo" ainda pode ver
 * negócios criados no board de negocios normalmente — só a UI/os
 * dados de LEADS ficam bloqueados. Se no futuro o mapeamento
 * oficial exigir mais restrições (ex.: administrativo só vê negócios
 * fechados), isso vira Etapa 3.1 sem tocar neste patch.
 * ===================================================================== */
(function(){
  if(window.__LF_ADM_NEG_ONLY_V1__) return;
  window.__LF_ADM_NEG_ONLY_V1__ = true;

  function isAdministrativo(){
    try{
      // Preferir CARGO_CAPS (Etapa 2). Fallback: leitura direta do
      // cargo em u.cargo — para o caso (raro) do auth.js novo ainda
      // não ter carregado.
      if(typeof window.getCargoCaps === 'function'){
        var caps = window.getCargoCaps();
        if(caps && caps.leads === 'none' && caps.negocios === 'crud'){
          return true;
        }
      }
      var me = (window.S && S.userId) || null;
      if(!me) return false;
      var u = (typeof window.getUser === 'function') ? window.getUser(me) : null;
      if(!u) return false;
      var c = (u.cargo || '').toString().toLowerCase();
      return c.indexOf('administrativo') >= 0
          && c.indexOf('gerente') < 0
          && c.indexOf('representante') < 0
          && c.indexOf('master') < 0;
    }catch(_e){ return false; }
  }

  function toastBlocked(){
    try{
      if(typeof window.toast === 'function'){
        window.toast('Administrativo: acesso restrito a Negócios.');
      }
    }catch(_e){}
  }

  // ---------------------------------------------------------------
  // 1) Esconde o botão "Leads" da top-nav depois que buildNav rodar.
  // ---------------------------------------------------------------
  function hideLeadsTab(){
    if(!isAdministrativo()) return;
    try{
      var t = document.getElementById('ntabs');
      if(!t) return;
      var btns = t.querySelectorAll('button.nt');
      for(var i=0;i<btns.length;i++){
        var txt = (btns[i].textContent || '').trim();
        if(txt === 'Leads'){
          btns[i].style.display = 'none';
        }
      }
    }catch(_e){}
  }

  if(typeof window.buildNav === 'function'){
    var _origBuildNav = window.buildNav;
    window.buildNav = function(){
      var r = _origBuildNav.apply(this, arguments);
      try{ hideLeadsTab(); }catch(_e){}
      return r;
    };
  }

  // ---------------------------------------------------------------
  // 2) Intercepta goPage — redireciona 'leads' para 'negocios'.
  // ---------------------------------------------------------------
  if(typeof window.goPage === 'function'){
    var _origGoPage = window.goPage;
    window.goPage = function(p){
      if(p === 'leads' && isAdministrativo()){
        toastBlocked();
        return _origGoPage.call(this, 'negocios');
      }
      return _origGoPage.apply(this, arguments);
    };
  }

  // ---------------------------------------------------------------
  // 3) Bloqueia mutações cujo alvo (board) seja 'leads'.
  // ---------------------------------------------------------------
  function argsTargetLeads(args){
    try{
      for(var i=0;i<args.length;i++){
        var a = args[i];
        if(a === 'leads') return true;
        if(a && typeof a === 'object'){
          if(a.board === 'leads') return true;
          if(a.kind  === 'leads') return true;
          if(a.tipo  === 'leads') return true;
        }
      }
    }catch(_e){}
    return false;
  }

  function guardIfLeadsBoard(fnName, blockedReturn){
    if(typeof window[fnName] !== 'function') return;
    var original = window[fnName];
    window[fnName] = function(){
      if(isAdministrativo() && argsTargetLeads(arguments)){
        toastBlocked();
        return blockedReturn;
      }
      return original.apply(this, arguments);
    };
  }

  [
    'openKBNew',
    'saveKBCard',
    'moveCard', '_kbMoveCard',
    'editKBFromDet', 'ctxEdit',
    'promptDeleteKB', 'confirmDeleteKBReason',
    'openTransferKB', 'confirmTransferAndMaybeMove',
    'discardKB', 'discardKBFromDet', 'ctxDiscard', 'confirmDiscard',
    'renderKBLocal', 'renderKB', 'renderKBConsBar'
  ].forEach(function(name){ guardIfLeadsBoard(name, null); });

  // ---------------------------------------------------------------
  // 4) Aplica na primeira renderização (o DOM já pode estar montado
  //    quando este patch carrega — buildNav pode ter rodado antes).
  // ---------------------------------------------------------------
  setTimeout(function(){
    try{ hideLeadsTab(); }catch(_e){}
    // Se o usuário estiver justamente na aba Leads no momento do
    // login (via URL antiga), joga para negócios.
    try{
      if(isAdministrativo()){
        var leadsPg = document.getElementById('pg-leads');
        if(leadsPg && leadsPg.classList.contains('on')){
          if(typeof window.goPage === 'function') window.goPage('negocios');
        }
      }
    }catch(_e){}
  }, 0);
})();
