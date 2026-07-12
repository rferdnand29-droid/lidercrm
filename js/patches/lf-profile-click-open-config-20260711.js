(function(){
  if(window.__LF_PROFILE_CLICK_OPEN_CONFIG__) return;
  window.__LF_PROFILE_CLICK_OPEN_CONFIG__ = 1;

  function el(id){ return document.getElementById(id); }

  function openMyConfig(){
    if(typeof goPage === 'function') goPage('config');
    setTimeout(function(){
      try{
        if(typeof syncProfileFields === 'function') syncProfileFields();
      }catch(_e){}
      try{ if(el('cfg-nome')) el('cfg-nome').focus(); }catch(_e){}
    }, 60);
    try{ if(typeof closeMobileMenu === 'function') closeMobileMenu(); }catch(_e){}
  }

  function ensureStyle(){
    if(el('lf-profile-click-style')) return;
    var st = document.createElement('style');
    st.id = 'lf-profile-click-style';
    st.textContent = '#nav-av,#nav-un{cursor:pointer}#mobile-menu-drawer .mmd-header{cursor:pointer}';
    document.head.appendChild(st);
  }

  function bind(){
    if(window.__LF_PROFILE_CLICK_BIND__) return;
    window.__LF_PROFILE_CLICK_BIND__ = 1;
    document.addEventListener('click', function(e){
      var t = e.target;
      if(t.closest('#nav-av') || t.closest('#nav-un')){
        e.preventDefault();
        openMyConfig();
        return;
      }
      var mmdHeader = t.closest('#mobile-menu-drawer .mmd-header');
      if(mmdHeader){
        e.preventDefault();
        openMyConfig();
        return;
      }
    }, true);
  }

  function boot(){
    ensureStyle();
    bind();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
