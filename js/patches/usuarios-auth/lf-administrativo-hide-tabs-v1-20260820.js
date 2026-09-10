/* =====================================================================
 * lf-administrativo-hide-tabs-v1-20260820.js
 * ---------------------------------------------------------------------
 * Pedido (2026-08-20): usuário com cargo ADMINISTRATIVO não deve ver
 * as abas específicas BINGO e LEADS. As demais abas (Negócios, Agenda,
 * Papo, Analytics, Config etc.) continuam visíveis e funcionais.
 *
 * [FIX 20260820b] "Agenda" saiu da lista de abas bloqueadas — pedido
 * novo: Administrativo volta a ter Agenda, mas escopada como se o
 * cargo fosse um departamento próprio (só vê agendamentos de outros
 * Administrativos, nunca dos demais departamentos/cargos) — ver
 * js/patches/agenda/lf-agenda-department-scope-v1-20260820.js, que já
 * trava não-ADM no próprio departamento e agora reconhece
 * "Administrativo" como mais um departamento (virtual, por cargo em
 * vez de vínculo formal). Continua tudo escondido/bloqueado como antes
 * pra Bingo e Leads.
 *
 * Este patch é ADITIVO e complementa o patch anterior
 * (lf-administrativo-negocios-only-v1-20260723.js), que já escondia
 * "Leads" e redirecionava goPage('leads') -> 'negocios'. Aqui:
 *
 *  1) Esconde as abas "Bingo" e "Leads" da barra superior
 *     (desktop, #ntabs) logo após buildNav() rodar.
 *  2) Esconde o item "Início"/Bingo da navegação inferior do mobile
 *     (#mobile-bottom-nav).
 *  3) Bloqueia acesso direto às páginas proibidas por URL/boot
 *     (ex.: /leads, /dash) e por goPage()/mobileGoPage():
 *       - 'dash'   (Bingo)    -> 'negocios'
 *       - 'leads'             -> 'negocios'
 *  4) Se o usuário estiver em uma página proibida no momento do
 *     login/carregamento, ele é movido para 'negocios'.
 *
 * Detecção do cargo: mesma regra do patch v1 (getCargoCaps com
 * leads:'none' + negocios:'crud', ou fallback textual no u.cargo).
 * Nunca joga exceção e não altera nada para outros cargos.
 *
 * SUPOSIÇÃO REGISTRADA: o redirecionamento padrão é para 'negocios'
 * (único board liberado para o cargo). Se 'negocios' não existir no
 * DOM por algum motivo, cai para 'chat' (Papo) e por último 'config'.
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__lfFixAdministrativoHideTabsV1) return;
  global.__lfFixAdministrativoHideTabsV1 = true;
  if(window.__LF_ADM_HIDE_TABS_V1__) return;
  window.__LF_ADM_HIDE_TABS_V1__ = true;

  var BLOCKED_TABS = ['Bingo','Leads'];   // rótulos exatos da top-nav
  var BLOCKED_PAGES = { dash:true, leads:true };

  function isAdministrativo(){
    try{
      if(typeof window.getCargoCaps === 'function'){
        var caps = window.getCargoCaps();
        if(caps && caps.leads === 'none' && caps.negocios === 'crud'){
          return true;
        }
      }
      var me = (window.S && S.userId) || null;
      if(!me) return false;
      var u = (typeof window.getUser === 'function') ? window.getUser(me) : null;
      if(u && u.cargo){
        var c = (''+u.cargo).toLowerCase();
        return c.indexOf('administrativo') >= 0
            && c.indexOf('gerente') < 0
            && c.indexOf('representante') < 0
            && c.indexOf('master') < 0;
      }
      // Fallback final: claims do login/refresh ainda não hidrataram o cache
      if(window.S && S.cargo){
        var sc = (''+S.cargo).toLowerCase();
        return sc.indexOf('administrativo') >= 0;
      }
      if(window.S && S.cargoCodigo === 'administrativo') return true;
    }catch(_e){}
    return false;
  }

  function toastBlocked(){
    try{
      if(typeof window.toast === 'function'){
        window.toast('Administrativo: esta aba não está disponível para o seu cargo.');
      }
    }catch(_e){}
  }

  function fallbackPage(){
    try{
      if(document.getElementById('pg-negocios')) return 'negocios';
      if(document.getElementById('pg-chat')) return 'chat';
    }catch(_e){}
    return 'config';
  }

  // ---------------------------------------------------------------
  // 1) Esconde as abas da barra superior (desktop)
  // ---------------------------------------------------------------
  function hideTopNavTabs(){
    if(!isAdministrativo()) return;
    try{
      var t = document.getElementById('ntabs');
      if(!t) return;
      var links = t.querySelectorAll('a.nt, button.nt');
      for(var i=0;i<links.length;i++){
        var txt = (links[i].textContent || '').trim();
        var hit = BLOCKED_TABS.indexOf(txt) >= 0;
        if(hit){ links[i].style.display = 'none'; }
      }
    }catch(_e){}
  }

  // ---------------------------------------------------------------
  // 2) Esconde "Início"/Bingo da nav inferior do mobile.
  //    data-page="dash" renderiza o Bingo como tela inicial — também
  //    oculto, já que o conteúdo é a aba Bingo.
  // ---------------------------------------------------------------
  function hideMobileNavItems(){
    if(!isAdministrativo()) return;
    try{
      var nav = document.getElementById('mobile-bottom-nav');
      if(!nav) return;
      var items = nav.querySelectorAll('.mbn-item');
      for(var i=0;i<items.length;i++){
        var dp = items[i].getAttribute('data-page');
        if(dp === 'dash'){
          items[i].style.display = 'none';
        }
      }
    }catch(_e){}
  }

  function applyHides(){
    hideTopNavTabs();
    hideMobileNavItems();
  }

  // Reaplica depois de buildNav() (as abas são recriadas a cada chamada)
  if(typeof window.buildNav === 'function'){
    var _origBuildNav = window.buildNav;
    window.buildNav = function(){
      var r = _origBuildNav.apply(this, arguments);
      try{ applyHides(); }catch(_e){}
      return r;
    };
  }

  // ---------------------------------------------------------------
  // 3) Intercepta navegação: goPage e mobileGoPage
  // ---------------------------------------------------------------
  if(typeof window.goPage === 'function'){
    var _origGoPage = window.goPage;
    window.goPage = function(p){
      if(p && BLOCKED_PAGES[p] && isAdministrativo()){
        toastBlocked();
        return _origGoPage.call(this, fallbackPage());
      }
      return _origGoPage.apply(this, arguments);
    };
  }

  if(typeof window.mobileGoPage === 'function'){
    var _origMobileGoPage = window.mobileGoPage;
    window.mobileGoPage = function(p){
      if(p && BLOCKED_PAGES[p] && isAdministrativo()){
        toastBlocked();
        return _origMobileGoPage.call(this, fallbackPage());
      }
      return _origMobileGoPage.apply(this, arguments);
    };
  }

  // URL bonita (/agenda, /leads, /dash) também respeita o bloqueio no boot
  if(typeof window._lfNormalizeBootPage === 'function'){
    var _origNormalize = window._lfNormalizeBootPage;
    window._lfNormalizeBootPage = function(p){
      var r = _origNormalize.apply(this, arguments);
      if(r && BLOCKED_PAGES[r] && isAdministrativo()){
        return fallbackPage();
      }
      return r;
    };
  }

  // ---------------------------------------------------------------
  // 4) Aplica na carga: esconde abas já renderizadas e, se o usuário
  //    estiver numa página proibida (URL antiga, refresh), move ele
  //    para o fallback.
  // ---------------------------------------------------------------
  function enforceOnLoad(){
    try{ applyHides(); }catch(_e){}
    try{
      if(!isAdministrativo()) return;
      var active = document.querySelector('.pg.on');
      if(active && active.id){
        var page = active.id.replace(/^pg-/, '');
        if(BLOCKED_PAGES[page] && typeof window.goPage === 'function'){
          window.goPage(fallbackPage());
        }
      }
    }catch(_e){}
  }

  // Em vários pontos do ciclo de vida, pois a ordem de carregamento dos
  // módulos pode variar entre web/app nativo.
  setTimeout(enforceOnLoad, 0);
  setTimeout(enforceOnLoad, 800);
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(enforceOnLoad, 0); });
  }
  window.addEventListener('lf:app-started', function(){ setTimeout(enforceOnLoad, 0); });
})(typeof window !== 'undefined' ? window : globalThis);
