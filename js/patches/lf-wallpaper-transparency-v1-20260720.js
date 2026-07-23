/* =====================================================================
 * lf-wallpaper-transparency-v1-20260720.js
 * FEATURE: Transparência inteligente de papel de parede
 *
 * PROBLEMA DETECTADO (2026-07-20):
 *   As funções _lfApplyWallpaperTransparency, _lfClearWallpaperTransparency,
 *   _lfIsThemeDark e o MutationObserver de tema existem APENAS em
 *   js/configuracoes.js (wrapper runtime), mas NÃO no módulo fonte
 *   src/modules/configuracoes/runtime/preferences-runtime.js.
 *   Além disso, applyBG() em preferences-runtime.js não chama
 *   _lfApplyWallpaperTransparency — quebrando a feature em produção.
 *
 * SOLUÇÃO: Este patch auto-suficiente:
 *   1. Define (ou redefine com fix) todas as funções de transparência
 *   2. Intercepta applyBG() via wrapper idempotente
 *   3. Intercepta setAppThemeMode() / toggleAppTheme() para re-aplicar ao
 *      trocar de tema
 *   4. Roda o boot check (aplica transparência se já há wallpaper ativo)
 *   5. Guarda flag de idempotência: nunca instala duas vezes
 * ===================================================================== */
(function(global){
  'use strict';
  if(global.__LF_WALLPAPER_TRANSP_PATCH_V1__) return;
  global.__LF_WALLPAPER_TRANSP_PATCH_V1__ = true;

  /* ── 1. Detecção de tema ─────────────────────────────────────────── */
  function _lfIsThemeDark(){
    if(document.body && document.body.classList.contains('theme-classic')) return true;
    if(document.documentElement && document.documentElement.getAttribute('data-theme')==='dark') return true;
    try{
      var bg=getComputedStyle(document.body).backgroundColor||'';
      var m=bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
      if(m){var lum=(parseInt(m[1])+parseInt(m[2])+parseInt(m[3]))/3;return lum<128;}
    }catch(_e){}
    return false;
  }

  /* ── 2. Aplicar transparência ────────────────────────────────────── */
  function _lfApplyWallpaperTransparency(hasWallpaper){
    var st=document.getElementById('lf-wallpaper-transp-el');
    if(!st){
      st=document.createElement('style');
      st.id='lf-wallpaper-transp-el';
      document.head.appendChild(st);
    }
    if(!hasWallpaper){st.textContent='';return;}
    var isDark=_lfIsThemeDark();
    /* Escuro: overlay preto translúcido; claro: overlay branco translúcido. */
    var alpha   = isDark ? 0.36 : 0.24;
    var bgRgb   = isDark ? '0, 0, 0' : '255, 255, 255';
    var blur    = isDark ? 2 : 1;
    st.textContent =
      /* Todos os painéis principais recebem backdrop translúcido */
      '.kb-col, .kanban-column, .card, .kb-card, .lead-card,' +
      '.chat-conv-item, .chat-msgs, .chat-shell, .chat-side, .chat-main,' +
      '.topbar, header, .mo, .modal-content, [class*="modal-content"],' +
      '.adm-kpi, .adm-mini-k, .act-item, .act-panel, .cli-card,' +
      '.dash-card, .relat-panel, #pg-chat .chat-hd, #pg-chat .chat-compose {' +
      '  background-color: rgba('+bgRgb+', '+alpha+') !important;' +
      '  backdrop-filter: blur('+blur+'px) saturate(1.03);' +
      '  -webkit-backdrop-filter: blur('+blur+'px) saturate(1.03);' +
      '}' +
      /* Variáveis CSS: features adicionais podem ler --lf-has-wallpaper */
      ':root { --lf-has-wallpaper: 1; --lf-wallpaper-alpha: '+alpha+
      '; --lf-wallpaper-blur: '+blur+'px; }';
    document.documentElement.classList.add('lf-has-wallpaper');
    document.documentElement.classList.toggle('lf-theme-dark',  isDark);
    document.documentElement.classList.toggle('lf-theme-light', !isDark);
  }

  /* ── 3. Limpar transparência ─────────────────────────────────────── */
  function _lfClearWallpaperTransparency(){
    var st=document.getElementById('lf-wallpaper-transp-el');
    if(st) st.textContent='';
    document.documentElement.classList.remove('lf-has-wallpaper','lf-theme-dark','lf-theme-light');
    document.documentElement.style.removeProperty('--lf-has-wallpaper');
  }

  /* ── 4. Helper: checar se há wallpaper ativo no localStorage ─────── */
  function _lfHasActiveWallpaper(){
    try{
      var S=global.S;
      var uid=(S&&S.userId)||'';
      if(!uid) return false;
      var bgId=localStorage.getItem('lf13_bg_'+uid)||'default';
      if(bgId!=='photo') return false;
      return !!localStorage.getItem('lf13_bgphoto_'+uid);
    }catch(_e){return false;}
  }

  /* ── 5. Interceptar applyBG() ────────────────────────────────────── */
  function _installApplyBGHook(){
    if(typeof global.applyBG !== 'function') return false;
    if(global.applyBG.__lfWallpaperTranspHook) return true; // já instalado
    var _origApplyBG = global.applyBG;
    global.applyBG = function(id){
      _origApplyBG.apply(this, arguments);
      try{
        if(id==='photo'){
          var S=global.S;
          var photoUrl=(S&&S.userId)?localStorage.getItem('lf13_bgphoto_'+S.userId):null;
          _lfApplyWallpaperTransparency(!!photoUrl);
        }else{
          _lfClearWallpaperTransparency();
        }
      }catch(_e){}
    };
    global.applyBG.__lfWallpaperTranspHook = true;
    /* Exporta também no módulo, se existir */
    try{
      var rt=(((global.LiderCRM||{}).modules||{}).configuracoes||{}).runtime;
      if(rt && typeof rt.applyBG === 'function' && !rt.applyBG.__lfWallpaperTranspHook){
        rt.applyBG = global.applyBG;
      }
    }catch(_e){}
    return true;
  }

  /* ── 6. Interceptar setAppThemeMode() / toggleAppTheme() ──────────── */
  function _installThemeHook(){
    /* setAppThemeMode */
    if(typeof global.setAppThemeMode === 'function' && !global.setAppThemeMode.__lfWallpaperTranspHook){
      var _origSetMode = global.setAppThemeMode;
      global.setAppThemeMode = function(mode, silent){
        _origSetMode.apply(this, arguments);
        try{
          if(_lfHasActiveWallpaper()) _lfApplyWallpaperTransparency(true);
        }catch(_e){}
      };
      global.setAppThemeMode.__lfWallpaperTranspHook = true;
    }
    /* toggleAppTheme */
    if(typeof global.toggleAppTheme === 'function' && !global.toggleAppTheme.__lfWallpaperTranspHook){
      var _origToggle = global.toggleAppTheme;
      global.toggleAppTheme = function(){
        _origToggle.apply(this, arguments);
        /* Aguarda o classList do body ser atualizado antes de recalcular */
        try{
          setTimeout(function(){
            if(_lfHasActiveWallpaper()) _lfApplyWallpaperTransparency(true);
          }, 60);
        }catch(_e){}
      };
      global.toggleAppTheme.__lfWallpaperTranspHook = true;
    }
  }

  /* ── 7. MutationObserver de segurança (fallback para outros toggles) */
  function _installThemeObserver(){
    if(global.__LF_WALLPAPER_THEME_HOOK__) return; // já existe no configuracoes.js legado
    global.__LF_WALLPAPER_THEME_HOOK__ = true;
    var _themeObs = new MutationObserver(function(){
      if(!document.documentElement.classList.contains('lf-has-wallpaper')) return;
      if(_lfHasActiveWallpaper()) _lfApplyWallpaperTransparency(true);
    });
    try{ _themeObs.observe(document.body,{attributes:true,attributeFilter:['class']}); }catch(_e){}
  }

  /* ── 8. Boot check: aplica se já há wallpaper salvo ─────────────── */
  function _bootCheck(){
    try{
      if(_lfHasActiveWallpaper()) _lfApplyWallpaperTransparency(true);
    }catch(_e){}
  }

  /* ── 9. Inicialização robusta (tenta agora + após DOMContentLoaded) */
  function _init(){
    _installApplyBGHook();
    _installThemeHook();
    _installThemeObserver();
    _bootCheck();
  }

  /* Tenta imediatamente; re-tenta com delay para garantir que applyBG
     já foi definido pelo configuracoes.js e pelo preferences-runtime.js */
  _init();
  setTimeout(_init, 300);
  setTimeout(_init, 800);

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', _init);
  }

  /* ── 10. Expor no namespace global (uso interno / debug) ─────────── */
  global._lfIsThemeDark              = _lfIsThemeDark;
  global._lfApplyWallpaperTransparency = _lfApplyWallpaperTransparency;
  global._lfClearWallpaperTransparency = _lfClearWallpaperTransparency;
  global._lfHasActiveWallpaper       = _lfHasActiveWallpaper;

})(window);
