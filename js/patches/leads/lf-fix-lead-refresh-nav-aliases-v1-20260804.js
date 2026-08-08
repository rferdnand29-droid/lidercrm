/* lf-fix-lead-refresh-nav-aliases-v1-20260804
 * -----------------------------------------------------------------
 * SINTOMA
 *   [lf-fix-lead-refresh] nenhuma função de navegação encontrada
 *   após 40 tentativas — o listener de botões ainda está ativo
 *   como fallback
 *
 * CAUSA
 *   O patch lf-fix-lead-refresh-retornar-v1-20260803.js procura
 *   por nomes como goBack/voltar/showLeads/renderLeadsView em
 *   window. No build atual a navegação real é feita por
 *   goPage(p) (definida em js/app.js), e detalhe/close por
 *   openKBDet/closeM. Nenhum dos nomes procurados existe em
 *   window, então o patch cai no fallback e loga o warn.
 *
 * FIX (aditivo)
 *   Registra ALIASES globais mapeando os nomes esperados pelo
 *   patch antigo para as funções reais do build:
 *     - showLeads / showLeadList / backToLeads / returnToLeads
 *       → goPage('leads')
 *     - renderLeadsView / renderLeads / _renderLeads
 *       → renderKB('leads') (renderiza o kanban de leads)
 *     - closeLeadDetail / closeDetail / hideLeadDetail / closeLead
 *       → closeM('mo-kb-det')
 *     - goBack / navigateBack / back / voltar
 *       → goPage(page-atual) (força re-render da página ativa)
 *   Todos os aliases são no-op quando as funções-alvo não estão
 *   disponíveis, e são idempotentes (não sobrescrevem função
 *   real do mesmo nome caso ela apareça no futuro).
 *
 * IMPORTANTE
 *   Este patch deve carregar ANTES de
 *   lf-fix-lead-refresh-retornar-v1-20260803.js para que
 *   _wrapNavFunction() encontre os aliases já registrados.
 * -----------------------------------------------------------------
 */
(function(global){
  'use strict';
  if(global.__LF_FIX_LEAD_REFRESH_NAV_ALIASES_V1__) return;
  global.__LF_FIX_LEAD_REFRESH_NAV_ALIASES_V1__ = true;

  var TAG = '[lf-fix-lead-refresh-nav-aliases]';
  function _log(){ try{ console.debug.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_){} }

  /* Cria um alias global — só se o nome ainda não existir OU se
     a função existente for um alias nosso (marcado com __lfAlias). */
  function _alias(name, fn){
    if(typeof fn !== 'function') return false;
    var cur = global[name];
    if(typeof cur === 'function' && !cur.__lfAlias) return false; /* respeita função real */
    fn.__lfAlias = true;
    global[name] = fn;
    return true;
  }

  function _install(){
    var installed = 0;

    /* --- aliases de navegação para a view de leads --- */
    var toLeads = function(){
      if(typeof global.goPage === 'function'){
        return global.goPage('leads');
      }
    };
    ['showLeads','_showLeads','showLeadList','_showLeadList',
     'backToLeads','_backToLeads','returnToLeads','_returnToLeads']
      .forEach(function(n){ if(_alias(n,toLeads)) installed++; });

    /* --- aliases de render da lista --- */
    var renderLeads = function(){
      if(typeof global.renderKB === 'function'){
        try{ return global.renderKB('leads'); }catch(_e){}
      }
      if(typeof global.renderKBLocal === 'function'){
        try{ return global.renderKBLocal('leads'); }catch(_e){}
      }
    };
    ['renderLeads','_renderLeads','renderLeadList','_renderLeadList',
     'renderLeadsList','_renderLeadsList','renderLeadsView','_renderLeadsView',
     'loadLeads','_loadLeads','fetchLeads','_fetchLeads',
     'refreshLeads','pullLeads','_pullLeads','syncLeads','_syncLeads']
      .forEach(function(n){ if(_alias(n,renderLeads)) installed++; });

    /* --- aliases de fechar detalhe de lead --- */
    var closeLeadDet = function(){
      if(typeof global.closeM === 'function'){
        try{ global.closeM('mo-kb-det'); }catch(_e){}
      }
    };
    ['closeLeadDetail','_closeLeadDetail','closeDetail','_closeDetail',
     'hideLeadDetail','_hideLeadDetail','closeLead','_closeLead']
      .forEach(function(n){ if(_alias(n,closeLeadDet)) installed++; });

    /* --- aliases de "voltar" genérico --- */
    var goBack = function(){
      /* Detecta a página ativa via .pg.on e re-navega para ela.
         Isso força o refresh e o wrapper do patch antigo detecta
         a entrada na view de leads. */
      var active = document.querySelector('.pg.on');
      var page = 'leads';
      if(active && active.id && active.id.indexOf('pg-')===0){
        page = active.id.substring(3);
      }
      if(typeof global.goPage === 'function'){
        return global.goPage(page);
      }
    };
    ['goBack','_goBack','navigateBack','_navigateBack','back','_back',
     'retornar','_retornar','voltar','_voltar',
     'backToList','_backToList']
      .forEach(function(n){ if(_alias(n,goBack)) installed++; });

    /* --- aliases de showView / navigate genéricos --- */
    var showView = function(name){
      if(typeof name!=='string') return;
      if(typeof global.goPage === 'function'){
        return global.goPage(name);
      }
    };
    ['showView','_showView','switchView','_switchView','navigateTo','_navigateTo',
     'navigate','_navigate','setView','_setView','goTo','_goTo',
     'changeView','_changeView','openView','_openView']
      .forEach(function(n){ if(_alias(n,showView)) installed++; });

    _log('aliases registrados:', installed,
         '(goPage disponível:', typeof global.goPage==='function', ')');

    global.LF_FIX_LEAD_REFRESH_NAV_ALIASES = {
      version: 'v1-20260804',
      installed: installed
    };
  }

  /* Executa cedo — mas espera goPage aparecer para que os aliases
     tenham a que apontar. Se goPage ainda não estiver pronto,
     ainda assim registra os aliases: eles resolvem a referência
     em runtime (não no momento do bind), então é seguro. */
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', _install);
  }else{
    _install();
  }
})(window);
