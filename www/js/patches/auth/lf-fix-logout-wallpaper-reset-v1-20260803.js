/* lf-fix-logout-wallpaper-reset-v1-20260803 | limpa wallpaper/tema do usuario ao sair */
(function(global){
  'use strict';
  if(global.__LF_FIX_LOGOUT_WALLPAPER_V1__)return;
  global.__LF_FIX_LOGOUT_WALLPAPER_V1__=true;

  var TAG='[lf-fix-logout-wallpaper]';
  function _log(){try{console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _resetBodyTheme(){
    try{
      ['body','html','#app','#root','.app-shell','.crm-shell'].forEach(function(sel){
        var el;
        if(sel==='body') el=document.body;
        else if(sel==='html') el=document.documentElement;
        else el=document.querySelector(sel);
        if(!el || !el.style) return;
        el.style.backgroundImage='';
        el.style.background='';
        el.style.backgroundColor='';
      });

      var classesToStrip=/(^|\s)(user-theme-[\w-]+|wallpaper-[\w-]+|theme-user-[\w-]+|lf-user-bg[\w-]*)/g;
      [document.body, document.documentElement].forEach(function(el){
        if(el && el.className && typeof el.className==='string'){
          el.className=el.className.replace(classesToStrip,'').trim();
        }
      });

      ['--user-bg','--user-wallpaper','--lf-wallpaper','--user-theme-bg',
       '--profile-bg','--crm-bg-image'].forEach(function(v){
        try{ document.documentElement.style.removeProperty(v); }catch(_e){}
        try{ document.body.style.removeProperty(v); }catch(_e){}
      });

      ['user_wallpaper','lf_wallpaper','crm_wallpaper','profile_bg',
       'user_theme','lf_user_theme'].forEach(function(k){
        try{ localStorage.removeItem(k); }catch(_e){}
        try{ sessionStorage.removeItem(k); }catch(_e){}
      });

      document.body.setAttribute('data-view','login');
      document.body.classList.add('view-login','lf-clean-bg');
      _log('wallpaper/tema do usuario removidos');
    }catch(err){
      try{ console.warn(TAG,'reset falhou',err); }catch(_e){}
    }
  }

  function _wrapLogoutFns(){
    var fns=['logout','_logout','doLogout','_doLogout','signOut','_signOut',
             'clearSession','_clearSession','resetSession','_resetSession'];
    fns.forEach(function(fname){
      if(typeof global[fname]!=='function') return;
      if(global[fname].__lfWallpaperResetWrapped) return;
      var orig=global[fname];
      var wrapped=function(){
        _resetBodyTheme();
        var ret=orig.apply(this,arguments);
        setTimeout(_resetBodyTheme, 50);
        setTimeout(_resetBodyTheme, 400);
        return ret;
      };
      wrapped.__lfWallpaperResetWrapped=true;
      global[fname]=wrapped;
      _log('wrapper wallpaper-reset em', fname);
    });
  }

  function _hookForceLogout(){
    if(global.LF_FIX_ADM_PW_RESET && global.LF_FIX_ADM_PW_RESET.forceLogout
       && !global.LF_FIX_ADM_PW_RESET.__lfWallpaperHooked){
      var origFL=global.LF_FIX_ADM_PW_RESET.forceLogout;
      global.LF_FIX_ADM_PW_RESET.forceLogout=function(reason){
        _resetBodyTheme();
        return origFL(reason);
      };
      global.LF_FIX_ADM_PW_RESET.__lfWallpaperHooked=true;
    }
  }

  global.addEventListener('hashchange',function(){
    if(/login|auth/i.test(location.hash||'')) _resetBodyTheme();
  });

  function _install(){
    _wrapLogoutFns();
    _hookForceLogout();
    _install._retries=(_install._retries||0)+1;
    if(_install._retries<40) setTimeout(_install,300);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{ _install(); }

  global.LF_FIX_LOGOUT_WALLPAPER={ version:'v1-20260803', reset:_resetBodyTheme };
})(window);
