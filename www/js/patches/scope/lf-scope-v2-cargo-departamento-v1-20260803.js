/* lf-scope-v2-cargo-departamento-v1-20260803 | Fase 2 — regra "cargo + departamento"
 * ------------------------------------------------------------------------------
 * Substitui o modelo "cargo alto → vê tudo" por "cargo alto + departamento
 * atribuído → vê tudo do departamento". Sem departamento_id no usuário,
 * qualquer cargo (exceto Hudson) cai no escopo do Consultor.
 *
 * ⚠️ NÃO REMOVE nem sobrescreve nenhuma função original — apenas envelopa
 *    (wrapper) chamadas comuns E expõe um resolvedor central `LF_SCOPE_V2`
 *    que pode ser chamado de novos pontos. É opt-in via flag:
 *
 *      localStorage.setItem('lf_scope_v2_enabled','1')   // liga
 *      localStorage.removeItem('lf_scope_v2_enabled')    // desliga (rollback)
 *
 * Regras (na ordem):
 *   1) Hudson (uid/e-mail fixo)              → vê TUDO, sempre.
 *   2) usuário sem departamento_id           → escopo = próprios registros.
 *   3) cargo alto + departamento_id definido → vê tudo do departamento.
 *   4) demais casos                          → escopo = próprios registros.
 *
 * Orientador (supervisor adjunto) NÃO herda escopo amplo (Fase 2.4 do prompt):
 *   - mapeado explicitamente para o mesmo bloco de Consultor.
 *
 * NÃO altera password.js/verifyLegacyPassword — Fase 2 é isolada da Fase 4.
 * ------------------------------------------------------------------------------
 *
 * CHANGELOG
 *   v1.1-20260803 — fix: resolveScope/filterList/canSeeRecord não
 *     normalizavam um `user` externo passado via opts.user — role/email
 *     em caixa diferente de minúscula escapavam do match de cargo alto
 *     e caíam silenciosamente em escopo SELF. Normalização centralizada
 *     em _normalizeUser, aplicada tanto ao usuário atual quanto a
 *     qualquer override.
 * ------------------------------------------------------------------------------
 */
(function(global){
  'use strict';
  if(global.__LF_SCOPE_V2_CARGO_DEPT_V1__)return;
  global.__LF_SCOPE_V2_CARGO_DEPT_V1__=true;

  var TAG='[lf-scope-v2]';
  function _log(){try{console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  /* -------- configuração fixa do ADM raiz -------- */
  var HUDSON = {
    /* preencher via LF_SCOPE_V2.setHudson({uid, email}) ou no bootstrap do app */
    uid:   (global.LF_HUDSON_UID   || null),
    email: (global.LF_HUDSON_EMAIL || null)
  };

  function _flagOn(){
    try{ return localStorage.getItem('lf_scope_v2_enabled')==='1'; }catch(_e){ return false; }
  }
  /* FIX v1.2-20260803: antes lia s.departamento_id/s.departmentId, que
     nunca existiram na sessão de verdade (S) — o campo real, hidratado
     no login desde a correção de hoje em js/auth.js, é S.departamentoId
     (camelCase, resolvido no backend via team_id -> teams.departamento_id).
     Mantido fallback pros nomes antigos por segurança/compat. */
  function _currentUser(){
    var s=global.S||{};
    return _normalizeUser({
      uid:  s.userId || s.uid || null,
      email:s.email,
      role: s.role || s.cargo,
      departamento_id: s.departamentoId || s.departamento_id || s.departmentId || null
    });
  }
  /* FIX v1.2-20260803: resolveScope/filterList/canSeeRecord aceitam um
     `user` externo via opts.user (documentado na API pública). Só
     _currentUser() normalizava role/email para minúsculo; um override
     passado com role em outra caixa (ex. 'ADM') não batia com
     HIGH_ROLES e o usuário caía silenciosamente em escopo SELF em vez
     de DEPARTMENT. Agora todo `user` que entra em resolveScope passa
     por aqui. */
  function _normalizeUser(u){
    if(!u) return u;
    return {
      uid: u.uid || null,
      email: String(u.email||'').toLowerCase(),
      role: String(u.role||u.cargo||'').toLowerCase(),
      departamento_id: u.departamento_id || u.departamentoId || u.departmentId || null
    };
  }

  /* FIX v1.2-20260803: "cargo alto" deixou de ser decidido comparando
     texto livre (users.cargo, populado em quase ninguém de verdade —
     confirmado no diagnóstico: 1 de 7 usuários reais). Agora consulta
     getCargoCaps(uid).supervisorUI (js/auth.js), a MESMA fonte que já
     controla a aba "Time"/dashboard/relatórios em todo o resto do
     app — inclui a correção de orientador (rebaixado, ver
     migration_orientador_demotion_20260803.sql). HIGH_ROLES vira só
     fallback defensivo pra quando getCargoCaps ainda não carregou
     (auth.js não subiu a tempo) ou o override não tem uid. */
  var HIGH_ROLES = ['supervisor','gerente','gestor','coordenador','diretor',
                    'admin','administrador','adm'];
  /* Orientador foi INTENCIONALMENTE removido desta lista (rebaixado). */

  function _isHudson(u){
    if(!u)return false;
    if(HUDSON.uid   && u.uid   && u.uid  ===HUDSON.uid)   return true;
    if(HUDSON.email && u.email && u.email===HUDSON.email.toLowerCase()) return true;
    return false;
  }
  function _isHighRole(u){
    if(typeof global.getCargoCaps==='function' && u.uid){
      try{
        var caps=global.getCargoCaps(u.uid);
        if(caps) return !!caps.supervisorUI;
      }catch(_e){ _warn('getCargoCaps falhou, caindo pro fallback textual', _e); }
    }
    return HIGH_ROLES.indexOf(u.role)>=0;
  }

  /* -------- API pública: resolver escopo -------- */
  /**
   * @returns {Object} scope
   *   scope.mode     'ALL' | 'DEPARTMENT' | 'SELF'
   *   scope.uid       uid do usuário
   *   scope.dept      departamento (quando mode='DEPARTMENT')
   *   scope.reason    string explicando a decisão (para audit)
   */
  function resolveScope(userOverride){
    var u=userOverride?_normalizeUser(userOverride):_currentUser();
    if(!_flagOn()){
      /* comportamento antigo — não interfere */
      return { mode:'LEGACY', uid:u.uid, dept:u.departamento_id,
               reason:'flag lf_scope_v2_enabled desligada' };
    }
    if(_isHudson(u)){
      return { mode:'ALL', uid:u.uid, dept:null,
               reason:'ADM raiz (Hudson) — regra especial isolada' };
    }
    if(!u.departamento_id){
      return { mode:'SELF', uid:u.uid, dept:null,
               reason:'sem departamento_id — cai para escopo Consultor' };
    }
    if(_isHighRole(u)){
      return { mode:'DEPARTMENT', uid:u.uid, dept:u.departamento_id,
               reason:'cargo alto + departamento_id → vê o departamento' };
    }
    return { mode:'SELF', uid:u.uid, dept:u.departamento_id,
             reason:'cargo padrão — só próprios registros' };
  }

  /* FIX v1.2-20260803: leads/business/clients NÃO carregam
     departamento_id diretamente (o desenho novo deriva via
     team_id -> teams.departamento_id — ver sql/10-schema-departamentos.sql
     v2). filterList/canSeeRecord comparavam record.departamento_id, um
     campo que nunca existe nesses registros — o modo DEPARTMENT nunca
     encontrava nada. Mantém um cache local (team_id -> departamento_id)
     atualizado em background via workerClient.listDepartamentoTeams(),
     pra resolver isso sem tornar filterList/canSeeRecord assíncronos
     (usados como filtro síncrono em wrappers existentes). Enquanto o
     cache não carrega, resolve pra "sem departamento" (nega no modo
     DEPARTMENT) — erra pro lado seguro, nunca pro lado de mostrar
     demais. */
  var _teamDeptCache={};
  function _departamentoOfTeam(teamId){
    if(!teamId) return null;
    return Object.prototype.hasOwnProperty.call(_teamDeptCache,teamId) ? _teamDeptCache[teamId] : null;
  }
  function _refreshTeamDeptCache(){
    var wc=(global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.workerClient) || global.workerClient || null;
    if(!wc || typeof wc.listDepartamentoTeams!=='function') return;
    Promise.resolve(wc.listDepartamentoTeams()).then(function(teams){
      var next={};
      (teams||[]).forEach(function(t){ if(t && t.id) next[t.id]=t.departamento_id||null; });
      _teamDeptCache=next;
      _log('cache team->departamento atualizado:', Object.keys(next).length, 'time(s)');
    }).catch(function(err){ _warn('falha ao atualizar cache team->departamento', err); });
  }
  /* FIX 2026-08-04 (hotfix 401): a 1ª chamada ao worker só acontece DEPOIS
     do JWT ter sido espelhado (evento lf:worker-token-synced), evitando o
     bloco de 401 na subida do app. Gate em js/patches/lf-when-worker-auth. */
  (function _bootTeamDeptCache(retries){
    var wc=(global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.workerClient) || global.workerClient || null;
    if(wc && typeof wc.listDepartamentoTeams==='function'){
      if(typeof global.LF_WHEN_WORKER_AUTH==='function'){ global.LF_WHEN_WORKER_AUTH(_refreshTeamDeptCache); }
      else{ _refreshTeamDeptCache(); }
      return;
    }
    if(retries<=0) return;
    setTimeout(function(){ _bootTeamDeptCache(retries-1); }, 500);
  })(20);

  /* Resolve o departamento de um registro: aceita tanto o campo
     antigo (departamento_id direto, se algum dia existir) quanto o
     caminho real (team_id -> cache). */
  function _departamentoDoRegistro(r){
    if(!r) return null;
    var direct=r.departamento_id||r.departmentId||r.department_id;
    if(direct) return direct;
    var teamId=r.team_id||r.teamId;
    return teamId ? _departamentoOfTeam(teamId) : null;
  }

  /**
   * Filtra uma lista de registros (leads/negócios/clientes) segundo o escopo
   * atual. Nunca joga exceção — em erro/flag off retorna a lista original.
   */
  function filterList(items, opts){
    if(!Array.isArray(items))return items;
    if(!_flagOn())return items;
    opts=opts||{};
    var scope=resolveScope(opts.user);
    if(scope.mode==='ALL' || scope.mode==='LEGACY') return items;
    if(scope.mode==='DEPARTMENT'){
      /* FIX v1.2-20260803: um registro PRÓPRIO do usuário (é o
         owner/responsável) sempre deveria ser visível, mesmo que não
         resolva pro departamento via team_id (ex.: lead criado antes
         da atribuição de time). Sem isso, virar DEPARTMENT scope
         paradoxalmente ESCONDIA os próprios registros do usuário
         quando eles não tinham team_id resolvido. */
      return items.filter(function(r){
        if(!r) return false;
        var d = _departamentoDoRegistro(r);
        if(d && d===scope.dept) return true;
        var owner = r.responsavel_id || r.responsavelId ||
                    r.owner_id || r.ownerId || r.user_id || null;
        return !!(owner && owner===scope.uid);
      });
    }
    /* SELF */
    return items.filter(function(r){
      if(!r)return false;
      var owner = r.responsavel_id || r.responsavelId ||
                  r.owner_id || r.ownerId || r.user_id || null;
      return owner && owner===scope.uid;
    });
  }

  /**
   * Verifica se o usuário pode ver um registro específico.
   */
  function canSeeRecord(record, opts){
    if(!record)return false;
    if(!_flagOn())return true;
    var scope=resolveScope((opts||{}).user);
    if(scope.mode==='ALL' || scope.mode==='LEGACY')return true;
    if(scope.mode==='DEPARTMENT'){
      var d = _departamentoDoRegistro(record);
      if(d && d===scope.dept) return true;
      var ownerD = record.responsavel_id || record.responsavelId ||
                   record.owner_id || record.ownerId || record.user_id || null;
      return !!(ownerD && ownerD===scope.uid);
    }
    var owner = record.responsavel_id || record.responsavelId ||
                record.owner_id || record.ownerId || record.user_id || null;
    return !!(owner && owner===scope.uid);
  }

  /* -------- wrappers em funções conhecidas (opcional, só se existirem) -------- */
  /* Alvos: as ~20 funções da view "Todos" do ADM já mexidas na auditoria de
     ownership. NÃO reintroduzir `activeUID(board)` como fallback — sempre ler
     o dono real do record. */
  var WRAP_TARGETS = [
    'visibleLeads','visibleNegocios','visibleClientes',
    'listVisibleLeads','listVisibleNegocios','listVisibleClientes',
    'getAllLeadsVisible','getAllNegociosVisible','getAllClientesVisible',
    'filterLeadsByPermission','filterNegociosByPermission','filterClientesByPermission'
  ];
  var _wrappedList=[];
  function _wrapReturnList(){
    WRAP_TARGETS.forEach(function(fname){
      if(typeof global[fname]!=='function')return;
      if(global[fname].__lfScopeV2Wrapped)return;
      var orig=global[fname];
      var wrapped=function(){
        var out=orig.apply(this,arguments);
        try{
          if(Array.isArray(out))return filterList(out);
          if(out && typeof out.then==='function'){
            return out.then(function(v){
              return Array.isArray(v) ? filterList(v) : v;
            });
          }
        }catch(err){ _warn('wrapper',fname,'erro:',err); }
        return out;
      };
      wrapped.__lfScopeV2Wrapped=true;
      global[fname]=wrapped;
      _wrappedList.push(fname);
      _log('wrapper instalado em', fname);
    });
  }

  /* -------- bootstrap -------- */
  function _install(){
    _wrapReturnList();
    if(_wrappedList.length===0){
      _install._retries=(_install._retries||0)+1;
      if(_install._retries<40){ setTimeout(_install,250); return; }
      _log('nenhum alvo local encontrado; API continua disponível para chamadas explícitas');
    }
    _log('v1-20260803 ativo. flag on?',_flagOn(),
         '| Hudson:',HUDSON.uid||HUDSON.email||'(não configurado)');
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{ _install(); }

  global.LF_SCOPE_V2 = {
    version:'v1.2-20260803',
    resolveScope:resolveScope,
    filterList:filterList,
    canSeeRecord:canSeeRecord,
    isEnabled:_flagOn,
    refreshTeamDeptCache:_refreshTeamDeptCache,
    /* Resolve o departamento de QUALQUER usuário (não só o logado),
       via team_id -> cache team->departamento. Usado por
       getDepartmentVisibleUsers() (js/usuarios.js) pra decidir quem
       aparece na aba Time pra um supervisor. Depende de getUser(uid)
       já ter o team_id em cache local (populado pelo fetch normal de
       /api/v1/usuarios, que já inclui team_id desde a correção de
       hoje em relationalToLegacy). */
    departamentoOfUser:function(uid){
      if(!uid) return null;
      var u=(typeof global.getUser==='function') ? global.getUser(uid) : null;
      var teamId=u && (u.team_id || u.teamId);
      return teamId ? _departamentoOfTeam(teamId) : null;
    },
    enable:function(){ localStorage.setItem('lf_scope_v2_enabled','1'); _log('flag ligada'); },
    disable:function(){ localStorage.removeItem('lf_scope_v2_enabled'); _log('flag desligada'); },
    setHudson:function(cfg){
      cfg=cfg||{};
      if(cfg.uid)   HUDSON.uid=cfg.uid;
      if(cfg.email) HUDSON.email=String(cfg.email).toLowerCase();
      _log('Hudson configurado:',HUDSON);
    },
    diag:function(){
      var u=_currentUser();
      return {
        flagOn:_flagOn(),
        user:u,
        isHudson:_isHudson(u),
        isHighRole:_isHighRole(u),
        scope:resolveScope(u),
        wrapped:_wrappedList.slice(),
        hudson:HUDSON
      };
    }
  };
})(window);
