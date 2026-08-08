/* lf-cargo-only-via-departamento-v1-20260804
 * =====================================================================
 * CORREÇÃO DEFINITIVA — "Gerente/Representante só ganha função extra
 * se o ADM Hudson colocar num departamento".
 *
 * PROBLEMA (diagnóstico forense):
 *   Existiam 4 pontos que promoviam gerente/gestor/representante/master
 *   automaticamente a "quase ADM", sem depender de departamento:
 *     [A] js/auth.js:70   -> CARGOS_NIVEL_ADMIN inclui esses 4 cargos
 *                            (consultado por hasAdminAccess legado).
 *     [B] js/auth.js:124  -> CARGO_CAPS.gerente/gestor/representante/master
 *                            nascem com adminUI:true, supervisorUI:true,
 *                            foreign:'edit', escopo:'team'/'global'.
 *     [C] js/auth.js:350  -> CARGO_NIVEIS mapeia esses cargos direto
 *                            no nível 4/5 (getCargoNivel).
 *     [D] _worker_src/.../authz.js:47 -> Espelho backend faz o mesmo.
 *
 *   Efeito colateral: hasAdminAccess()=true, hasSupervisorAccess()=true
 *   e getDepartmentVisibleUsers() caía no ramo "vê todos os usuários"
 *   ANTES de consultar se o Hudson colocou a pessoa num departamento.
 *
 * REGRA NOVA (pedido do usuário):
 *   1) Hudson (ADM raiz) — vê/altera TUDO. Sempre. Sem mudanças.
 *   2) Qualquer outro cargo (gerente, representante, gestor, master,
 *      supervisor, orientador, consultor, funcionário, administrativo)
 *      SEM team_id/departamento_id atribuído pelo ADM  ->  funções
 *      BÁSICAS de consultor: só vê e mexe nos PRÓPRIOS leads, só vê
 *      suas PRÓPRIAS métricas, sem aba Time, sem Painel ADM.
 *   3) Cargo "alto" (gerente, gestor, representante, master, supervisor)
 *      COM departamento atribuído pelo Hudson  ->  ganha o escopo do
 *      departamento (vê/edita leads/negócios de quem estiver no MESMO
 *      departamento). NUNCA ganha adminUI automaticamente — Painel ADM
 *      continua exclusivo do Hudson e de quem tiver u.admExtra=true
 *      marcado manualmente pelo Hudson.
 *
 * COMO O PATCH FUNCIONA:
 *   • Envolve (wrap) getCargoCaps() — as caps de gerente/gestor/
 *     representante/master/supervisor são rebaixadas para valores de
 *     consultor quando o usuário NÃO tem departamento resolvido.
 *   • Se tem departamento, mantém os campos operacionais (escopo=team,
 *     leads/negocios=crud, foreign=edit, supervisorUI=true) MAS zera
 *     adminUI (que era o único caminho automático pra Painel ADM).
 *   • Envolve hasAdminAccess() e hasSupervisorAccess() para respeitar
 *     a nova regra, mantendo o caminho especial de Hudson (S.role==='adm'
 *     e u.role==='adm') e de u.admExtra=true (marcação manual).
 *   • ADITIVO: não remove nem renomeia nenhuma função existente. Todos
 *     os patches antigos que chamam getCargoCaps/hasAdminAccess/
 *     hasSupervisorAccess continuam funcionando — só passam a ver o
 *     resultado corrigido.
 *   • Opt-out via localStorage.setItem('lf_cargo_only_dept_disabled','1')
 *     (rollback rápido em caso de emergência).
 * =====================================================================
 */
(function(global){
  'use strict';
  if(global.__LF_CARGO_ONLY_VIA_DEPT_V1__)return;
  global.__LF_CARGO_ONLY_VIA_DEPT_V1__=true;

  var TAG='[lf-cargo-only-dept]';
  function _log(){try{console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _disabled(){
    try{ return localStorage.getItem('lf_cargo_only_dept_disabled')==='1'; }catch(_e){ return false; }
  }

  /* Cargos considerados "altos" — só estes ganham escopo de departamento
     quando o Hudson os coloca num. Fora daqui, permanece como consultor. */
  var HIGH_ROLES = { gerente:1, gestor:1, representante:1, master:1, supervisor:1 };

  /* Caps de "cargo básico" — usadas quando um cargo alto está SEM
     departamento. Espelha CARGO_CAPS.consultor no js/auth.js. */
  var BASIC_CAPS = {
    escopo:'self', leads:'crud', negocios:'crud', foreign:'none',
    stageGated:false, adminUI:false, supervisorUI:false
  };

  /* Resolve o cargo_codigo efetivo do usuário (mesma lógica do auth.js,
     mas defensiva — nunca lança). */
  function _resolveCargoCode(uid,u){
    try{
      if(u && u.cargoCodigo && global.CARGO_CAPS &&
         Object.prototype.hasOwnProperty.call(global.CARGO_CAPS,String(u.cargoCodigo).toLowerCase())){
        return String(u.cargoCodigo).toLowerCase();
      }
      var S=global.S;
      if(S && S.userId && (!uid||uid===S.userId)){
        if(S.cargoCodigo && global.CARGO_CAPS &&
           Object.prototype.hasOwnProperty.call(global.CARGO_CAPS,String(S.cargoCodigo).toLowerCase())){
          return String(S.cargoCodigo).toLowerCase();
        }
      }
      var raw=(u&&u.cargo)||(S&&(!uid||uid===S.userId)?S.cargo:'')||'';
      var c=String(raw).toLowerCase();
      if(!c) return null;
      var order=['master','representante','gerente','gestor','administrativo',
                 'supervisor','orientador','funcionario','funcionário','consultor'];
      for(var i=0;i<order.length;i++){
        if(c.indexOf(order[i])>=0) return order[i]==='funcionário'?'funcionario':order[i];
      }
      return null;
    }catch(_e){ return null; }
  }

  /* Retorna true se o usuário tem departamento resolvido.
     Fontes (nesta ordem, primeira que responder vale):
       1) LF_SCOPE_V2.departamentoOfUser(uid)  (mais autoritativo — usa
          o cache team_id -> teams.departamento_id atualizado do backend)
       2) S.departamentoId / S.teamId          (JWT hidratado no login)
       3) u.departamentoId / u.teamId / u.departmentId (cache local) */
  function _hasDepartamento(uid,u){
    try{
      if(global.LF_SCOPE_V2 && typeof global.LF_SCOPE_V2.departamentoOfUser==='function'){
        var dep=global.LF_SCOPE_V2.departamentoOfUser(uid);
        if(dep) return true;
      }
    }catch(_e){}
    try{
      var S=global.S;
      if(S && S.userId && (!uid||uid===S.userId)){
        if(S.departamentoId || S.teamId) return true;
      }
    }catch(_e){}
    try{
      if(u && (u.departamentoId||u.departamento_id||u.departmentId||u.teamId||u.team_id)){
        return true;
      }
    }catch(_e){}
    /* Fallback histórico (Estrutura/Departamentos manual) — se o usuário
       está listado em algum departamento cadastrado à mão, também vale. */
    try{
      if(typeof global.getDepartments==='function' && typeof global._deptUserBelongs==='function'){
        var deps=global.getDepartments()||[];
        for(var i=0;i<deps.length;i++){
          if(global._deptUserBelongs(deps[i],uid)) return true;
        }
      }
    }catch(_e){}
    return false;
  }

  /* Detecta se o uid é o próprio ADM raiz (Hudson). Reusa o mesmo
     critério do resto do app: S.role==='adm', u.role==='adm', uid==='adm'
     ou match de admExtra=true (marcação manual do Hudson). */
  function _isRootAdm(uid){
    try{
      if(uid==='adm') return true;
      var S=global.S;
      if(S && S.userId===uid && S.role==='adm') return true;
      var u=(typeof global.getUser==='function') ? global.getUser(uid) : null;
      if(u && u.role==='adm') return true;
    }catch(_e){}
    return false;
  }
  function _hasAdmExtraManual(uid){
    try{
      var S=global.S;
      if(S && S.userId===uid && typeof S.admExtra==='boolean') return S.admExtra===true;
      var u=(typeof global.getUser==='function') ? global.getUser(uid) : null;
      return !!(u && u.admExtra===true);
    }catch(_e){ return false; }
  }

  /* ============================================================
     WRAPPER 1 — getCargoCaps
     ============================================================ */
  var _origGetCargoCaps = (typeof global.getCargoCaps==='function') ? global.getCargoCaps : null;
  if(!_origGetCargoCaps){
    _warn('getCargoCaps não encontrado no window — patch ficará inativo até auth.js subir.');
  }

  function _patchedGetCargoCaps(uid){
    var CAPS_DEFAULT = global.CARGO_CAPS_DEFAULT || BASIC_CAPS;
    if(_disabled()) return _origGetCargoCaps ? _origGetCargoCaps(uid) : CAPS_DEFAULT;
    var S=global.S;
    uid = uid || (S ? S.userId : null);

    /* Hudson (ADM raiz) — mantém comportamento original. */
    if(_isRootAdm(uid)){
      return _origGetCargoCaps ? _origGetCargoCaps(uid) : (global.CARGO_CAPS && global.CARGO_CAPS.master) || CAPS_DEFAULT;
    }

    /* Base: o resultado que o auth.js original devolveria. */
    var base = _origGetCargoCaps ? _origGetCargoCaps(uid) : CAPS_DEFAULT;
    if(!base) base = CAPS_DEFAULT;

    /* Descobre o cargo efetivo. */
    var u = (typeof global.getUser==='function') ? global.getUser(uid) : null;
    var code = _resolveCargoCode(uid,u);

    /* Se não é cargo alto, deixa passar como o auth.js decidiu — a
       correção só toca gerente/gestor/representante/master/supervisor. */
    if(!code || !HIGH_ROLES[code]){
      return base;
    }

    var temDept = _hasDepartamento(uid,u);
    var admExtraManual = _hasAdmExtraManual(uid);

    if(temDept){
      /* Cargo alto COM departamento -> mantém escopo operacional
         (team/crud/edit/supervisorUI) mas ZERA adminUI automático.
         adminUI só permanece true se o Hudson marcou u.admExtra
         manualmente. */
      var withDept = {
        escopo:       (base.escopo && base.escopo!=='self') ? base.escopo : 'team',
        leads:        base.leads    || 'crud',
        negocios:     base.negocios || 'crud',
        foreign:      base.foreign  || 'edit',
        stageGated:   !!base.stageGated,
        adminUI:      admExtraManual===true, // NUNCA mais por cargo — só manual
        supervisorUI: true
      };
      return withDept;
    }

    /* Cargo alto SEM departamento -> rebaixa para "básico de consultor".
       Único jeito de ainda ter adminUI é o Hudson ter marcado admExtra
       manualmente no cadastro. */
    if(admExtraManual){
      return {
        escopo:'self', leads:'crud', negocios:'crud', foreign:'none',
        stageGated:false, adminUI:true, supervisorUI:true
      };
    }
    return {
      escopo:'self', leads:'crud', negocios:'crud', foreign:'none',
      stageGated:false, adminUI:false, supervisorUI:false
    };
  }

  /* ============================================================
     WRAPPER 2 — hasAdminAccess
     ============================================================ */
  var _origHasAdmin = (typeof global.hasAdminAccess==='function') ? global.hasAdminAccess : null;
  function _patchedHasAdminAccess(uid){
    if(_disabled()) return _origHasAdmin ? _origHasAdmin(uid) : false;
    var S=global.S;
    uid = uid || (S ? S.userId : null);
    if(!uid) return false;
    if(_isRootAdm(uid)) return true;
    if(_hasAdmExtraManual(uid)) return true;
    /* Sem departamento OU sem admExtra manual = SEM Painel ADM,
       independentemente do cargo. */
    var caps = _patchedGetCargoCaps(uid);
    return !!(caps && caps.adminUI);
  }

  /* ============================================================
     WRAPPER 3 — hasSupervisorAccess
     ============================================================ */
  var _origHasSup = (typeof global.hasSupervisorAccess==='function') ? global.hasSupervisorAccess : null;
  function _patchedHasSupervisorAccess(uid){
    if(_disabled()) return _origHasSup ? _origHasSup(uid) : false;
    var S=global.S;
    uid = uid || (S ? S.userId : null);
    if(!uid) return false;
    if(_isRootAdm(uid)) return true;
    var caps = _patchedGetCargoCaps(uid);
    return !!(caps && (caps.supervisorUI || caps.adminUI));
  }

  /* ============================================================
     WRAPPER 4 — canEditForeign
     Cargo alto sem departamento NÃO edita cards de outros. */
  var _origCanEditForeign = (typeof global.canEditForeign==='function') ? global.canEditForeign : null;
  function _patchedCanEditForeign(uid,item){
    if(_disabled()) return _origCanEditForeign ? _origCanEditForeign(uid,item) : false;
    var caps=_patchedGetCargoCaps(uid);
    if(!caps || caps.foreign!=='edit') return false;
    if(caps.escopo==='self') return false;
    if(item && item.ownerId){
      var S=global.S;
      var myId = uid || (S?S.userId:null);
      if(item.ownerId===myId) return true;
    }
    return true;
  }

  /* ============================================================
     WRAPPER 5 — getCargoNivel
     Rebaixa cargo alto sem departamento para nível 1 (consultor). */
  var _origGetCargoNivel = (typeof global.getCargoNivel==='function') ? global.getCargoNivel : null;
  function _patchedGetCargoNivel(uid){
    if(_disabled()) return _origGetCargoNivel ? _origGetCargoNivel(uid) : 1;
    var S=global.S;
    uid = uid || (S ? S.userId : null);
    if(!uid) return 1;
    if(_isRootAdm(uid)) return 5;
    var base = _origGetCargoNivel ? _origGetCargoNivel(uid) : 1;
    /* Se o cargo original resolveu pra nível alto (>=3) mas não tem
       departamento nem admExtra manual, rebaixa para 1. */
    if(base>=3){
      var u=(typeof global.getUser==='function') ? global.getUser(uid) : null;
      var code=_resolveCargoCode(uid,u);
      if(code && HIGH_ROLES[code]){
        if(!_hasDepartamento(uid,u) && !_hasAdmExtraManual(uid)) return 1;
      }
    }
    return base;
  }

  /* ============================================================
     Aplica os wrappers. Guarda os originais em __lfOrig* pra permitir
     inspeção/rollback via console.
     ============================================================ */
  function _apply(){
    try{
      if(_origGetCargoCaps){
        global.__lfOrigGetCargoCaps=_origGetCargoCaps;
        global.getCargoCaps=_patchedGetCargoCaps;
      }
      if(_origHasAdmin){
        global.__lfOrigHasAdminAccess=_origHasAdmin;
        global.hasAdminAccess=_patchedHasAdminAccess;
      }
      if(_origHasSup){
        global.__lfOrigHasSupervisorAccess=_origHasSup;
        global.hasSupervisorAccess=_patchedHasSupervisorAccess;
      }
      if(_origCanEditForeign){
        global.__lfOrigCanEditForeign=_origCanEditForeign;
        global.canEditForeign=_patchedCanEditForeign;
      }
      if(_origGetCargoNivel){
        global.__lfOrigGetCargoNivel=_origGetCargoNivel;
        global.getCargoNivel=_patchedGetCargoNivel;
      }
      _log('wrappers aplicados: getCargoCaps, hasAdminAccess, hasSupervisorAccess, canEditForeign, getCargoNivel');
    }catch(e){ _warn('falha ao aplicar wrappers', e); }
  }

  /* Se auth.js ainda não subiu, espera até 5s pelas funções aparecerem. */
  (function _waitAndApply(retries){
    if(typeof global.getCargoCaps==='function' &&
       typeof global.hasAdminAccess==='function' &&
       typeof global.hasSupervisorAccess==='function'){
      _origGetCargoCaps = global.getCargoCaps;
      _origHasAdmin     = global.hasAdminAccess;
      _origHasSup       = global.hasSupervisorAccess;
      _origCanEditForeign = global.canEditForeign;
      _origGetCargoNivel  = global.getCargoNivel;
      _apply();
      return;
    }
    if(retries<=0){ _warn('auth.js não subiu a tempo — patch inativo'); return; }
    setTimeout(function(){ _waitAndApply(retries-1); },100);
  })(50);

  /* Rollback manual pelo console:
       window.__lfRollbackCargoOnlyDept()
     Também: localStorage.setItem('lf_cargo_only_dept_disabled','1') + reload. */
  global.__lfRollbackCargoOnlyDept = function(){
    try{
      if(global.__lfOrigGetCargoCaps)      global.getCargoCaps=global.__lfOrigGetCargoCaps;
      if(global.__lfOrigHasAdminAccess)    global.hasAdminAccess=global.__lfOrigHasAdminAccess;
      if(global.__lfOrigHasSupervisorAccess) global.hasSupervisorAccess=global.__lfOrigHasSupervisorAccess;
      if(global.__lfOrigCanEditForeign)    global.canEditForeign=global.__lfOrigCanEditForeign;
      if(global.__lfOrigGetCargoNivel)     global.getCargoNivel=global.__lfOrigGetCargoNivel;
      _log('rollback concluído — funções originais restauradas');
      return true;
    }catch(e){ _warn('falha no rollback', e); return false; }
  };
})(window);
