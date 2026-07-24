(function(global){
  'use strict';

  var root = global.LiderCRM = global.LiderCRM || {};
  var shared = root.shared = root.shared || {};
  var navigation = shared.navigation = shared.navigation || {};

  var NAV_TABS = [
    { id: 'dash', label: 'Bingo', access: 'all' },
    { id: 'leads', label: 'Leads', access: 'all' },
    { id: 'negocios', label: 'Negócios', access: 'all' },
    { id: 'agenda', label: '📅 Agenda', access: 'all' },
    { id: 'chat', label: '💬 Papo', access: 'all' },
    { id: 'time', label: '👥 Time', access: 'supervisor' },
    { id: 'anal', label: 'Analytics', access: 'all' },
    { id: 'dic', label: 'Dicionário', access: 'all' },
    { id: 'config', label: '⚙️ Config', access: 'all' },
    { id: 'adm', label: 'ADM', access: 'admin', extraClass: 'at' }
  ];

  var DEEP_LINK_PAGES = ['dash','anal','adm','leads','negocios','agenda','time','config','docs','estrutura','chat','dic'];

  function canAccess(tab, context){
    context = context || {};
    if(!tab || !tab.access || tab.access === 'all') return true;
    if(tab.access === 'admin') return !!context.isAdmin;
    if(tab.access === 'supervisor') return !!context.isSupervisor;
    return true;
  }

  function getNavTabs(context){
    return NAV_TABS.filter(function(tab){ return canAccess(tab, context); }).map(function(tab){
      return {
        id: tab.id,
        label: tab.label,
        access: tab.access,
        extraClass: tab.extraClass || ''
      };
    });
  }

  navigation.NAV_TABS = NAV_TABS;
  navigation.DEEP_LINK_PAGES = DEEP_LINK_PAGES;
  navigation.canAccess = canAccess;
  navigation.getNavTabs = getNavTabs;
})(window);
