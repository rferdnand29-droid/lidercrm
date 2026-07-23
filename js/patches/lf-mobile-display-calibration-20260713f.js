/* =====================================================================
 * lf-mobile-display-calibration-20260713f.js
 *
 * Ajuste de visualização salvo por aparelho.
 *
 * Mudanças desta rodada:
 * - o botão flutuante foi removido da tela
 * - a abertura do painel agora pode ser feita pela tela Configurações
 * - adicionados controles para afastar a interface do topo e do rodapé
 *   (útil quando a status bar / barra do Android sobrepõe o app)
 * ===================================================================== */
(function(){
  if(window.__LF_MOBILE_DISPLAY_CALIBRATION_20260713F__) return;
  window.__LF_MOBILE_DISPLAY_CALIBRATION_20260713F__ = 1;

  var STORE_KEY='lf_display_calibration_v2';
  var LEGACY_STORE_KEY='lf_display_calibration_v1';
  var DEFAULTS={zoom:100, density:'normal', topOffset:0, bottomOffset:0};

  function _clamp(n,min,max){ n=parseInt(n,10); if(!isFinite(n)) n=0; return Math.max(min,Math.min(max,n)); }

  function _normalize(cfg){
    cfg=cfg||{};
    var density=cfg.density;
    if(['compact','normal','comfortable'].indexOf(density)<0) density='normal';
    return {
      zoom:_clamp(cfg.zoom==null?DEFAULTS.zoom:cfg.zoom,70,130),
      density:density,
      topOffset:_clamp(cfg.topOffset==null?DEFAULTS.topOffset:cfg.topOffset,0,64),
      bottomOffset:_clamp(cfg.bottomOffset==null?DEFAULTS.bottomOffset:cfg.bottomOffset,0,64)
    };
  }

  function _load(){
    try{
      var raw=localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_STORE_KEY);
      if(!raw) return _normalize(DEFAULTS);
      return _normalize(JSON.parse(raw)||{});
    }catch(e){ return _normalize(DEFAULTS); }
  }

  function _save(cfg){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(_normalize(cfg))); }catch(e){}
  }

  var _cfg=_load();
  var _pendingDensity=_cfg.density;

  function _densityGapPx(density){
    if(density==='compact') return -3;
    if(density==='comfortable') return 3;
    return 0;
  }

  function _draftFromUI(){
    var zoomInput=document.getElementById('lf-calib-zoom');
    var topInput=document.getElementById('lf-calib-top');
    var bottomInput=document.getElementById('lf-calib-bottom');
    return _normalize({
      zoom:zoomInput?zoomInput.value:_cfg.zoom,
      density:_pendingDensity||_cfg.density,
      topOffset:topInput?topInput.value:_cfg.topOffset,
      bottomOffset:bottomInput?bottomInput.value:_cfg.bottomOffset
    });
  }

  function _paintLiveValues(cfg){
    cfg=_normalize(cfg||_cfg);
    var zoomVal=document.getElementById('lf-calib-zoom-val');
    var topVal=document.getElementById('lf-calib-top-val');
    var bottomVal=document.getElementById('lf-calib-bottom-val');
    if(zoomVal) zoomVal.textContent=cfg.zoom+'%';
    if(topVal) topVal.textContent=cfg.topOffset+'px';
    if(bottomVal) bottomVal.textContent=cfg.bottomOffset+'px';
  }

  function _paintSheetValues(cfg){
    cfg=_normalize(cfg||_cfg);
    _pendingDensity=cfg.density;
    var zoomInput=document.getElementById('lf-calib-zoom');
    var topInput=document.getElementById('lf-calib-top');
    var bottomInput=document.getElementById('lf-calib-bottom');
    if(zoomInput) zoomInput.value=cfg.zoom;
    if(topInput) topInput.value=cfg.topOffset;
    if(bottomInput) bottomInput.value=cfg.bottomOffset;
    _paintLiveValues(cfg);
    document.querySelectorAll('#lf-calib-density button').forEach(function(x){
      x.classList.toggle('on', x.getAttribute('data-d')===cfg.density);
    });
  }

  function _applyCalibration(cfg){
    cfg=_normalize(cfg||_cfg);
    var id='lf-display-calibration-style';
    var st=document.getElementById(id);
    if(!st){ st=document.createElement('style'); st.id=id; document.head.appendChild(st); }

    var zoom=cfg.zoom/100;
    var gap=_densityGapPx(cfg.density);
    var topExtra=cfg.topOffset;
    var bottomExtra=cfg.bottomOffset;

    st.textContent=''
      + ':root{--lf-sat-extra:'+topExtra+'px;--lf-sab-extra:'+bottomExtra+'px;}'
      + '@media (max-width:768px){'
      +   'html{zoom:'+zoom+';}'
      +   '.pg{padding-left:calc(10px + '+gap+'px)!important;padding-right:calc(10px + '+gap+'px)!important;}'
      +   '.mbn-item{padding-top:calc(4px + '+(gap>0?gap:0)+'px)!important;padding-bottom:calc(4px + '+(gap>0?gap:0)+'px)!important;}'
      +   '.chat-room,.kb-card,.act-list .act-row{margin-bottom:calc(8px + '+gap+'px)!important;}'
      +   'body{padding-top:calc(52px + var(--lf-sat,0px) + var(--lf-sat-extra,0px))!important;padding-bottom:calc(60px + var(--lf-sab,0px) + var(--lf-sab-extra,0px))!important;}'
      +   '#mobile-top-bar{height:calc(52px + var(--lf-sat,0px) + var(--lf-sat-extra,0px))!important;padding-top:calc(var(--lf-sat,0px) + var(--lf-sat-extra,0px))!important;}'
      +   '#mobile-bottom-nav{height:calc(60px + var(--lf-sab,0px) + var(--lf-sab-extra,0px))!important;padding-bottom:calc(var(--lf-sab,0px) + var(--lf-sab-extra,0px))!important;}'
      +   '#mdash-fab,#leads-fab,#negocios-fab{bottom:calc(74px + var(--lf-sab,0px) + var(--lf-sab-extra,0px))!important;}'
      +   '.agd-fab{bottom:calc(86px + var(--lf-sab,0px) + var(--lf-sab-extra,0px))!important;}'
      +   '.act-panel,#ntf-panel{top:calc(60px + var(--lf-sat,0px) + var(--lf-sat-extra,0px))!important;max-height:calc(var(--vvh,100vh) - 76px - var(--lf-sat,0px) - var(--lf-sat-extra,0px) - var(--lf-sab,0px) - var(--lf-sab-extra,0px))!important;}'
      +   '#mobile-menu-drawer{padding-top:calc(var(--lf-sat,0px) + var(--lf-sat-extra,0px))!important;padding-bottom:calc(var(--lf-sab,0px) + var(--lf-sab-extra,0px))!important;}'
      + '}';

    document.documentElement.setAttribute('data-lf-density', cfg.density||'normal');
  }

  function _hasOverflow(){
    try{
      var doc=document.documentElement;
      var horiz = doc.scrollWidth > window.innerWidth + 2;
      var nav=document.getElementById('mobile-bottom-nav');
      var top=document.getElementById('mobile-top-bar');
      var vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      var navCut = nav && nav.getBoundingClientRect().bottom > vh + 2;
      var topCut = top && top.getBoundingClientRect().top < -2;
      return horiz || navCut || topCut;
    }catch(e){ return false; }
  }

  function _autoDetect(onDone){
    var trial=_normalize({zoom:100, density:_pendingDensity||_cfg.density, topOffset:_cfg.topOffset, bottomOffset:_cfg.bottomOffset});
    var step=0, maxSteps=10;
    function tryStep(){
      _applyCalibration(trial);
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          if(!_hasOverflow() || step>=maxSteps || trial.zoom<=70){
            onDone(_normalize(trial));
            return;
          }
          step++; trial.zoom-=5;
          tryStep();
        });
      });
    }
    tryStep();
  }

  function _ensureStyles(){
    if(document.getElementById('lf-calib-ui-style')) return;
    var st=document.createElement('style');
    st.id='lf-calib-ui-style';
    st.textContent=''
      + '#lf-calib-sheet{position:fixed;inset:0;z-index:600;display:none;}'
      + '#lf-calib-sheet.open{display:block;}'
      + '#lf-calib-sheet .lf-calib-ov{position:absolute;inset:0;background:rgba(0,0,0,.45);}'
      + '#lf-calib-sheet .lf-calib-box{position:absolute;left:0;right:0;bottom:0;background:#1b1e24;color:#fff;'
      +   'border-radius:18px 18px 0 0;padding:18px 18px calc(20px + env(safe-area-inset-bottom,0px) + var(--lf-sab,0px) + var(--lf-sab-extra,0px));'
      +   'font-family:Outfit,sans-serif;max-height:80vh;overflow:auto;}'
      + '#lf-calib-sheet h3{margin:0 0 4px;font-size:1.05rem;}'
      + '#lf-calib-sheet .lf-calib-sub{font-size:.78rem;color:#aab0bb;margin-bottom:16px;line-height:1.4;}'
      + '#lf-calib-sheet .lf-calib-row{margin-bottom:16px;}'
      + '#lf-calib-sheet label{display:block;font-size:.75rem;color:#c7ccd4;margin-bottom:6px;font-weight:600;}'
      + '#lf-calib-zoom-val,#lf-calib-top-val,#lf-calib-bottom-val{color:#7db8ff;font-weight:700;}'
      + '#lf-calib-sheet input[type=range]{width:100%;}'
      + '#lf-calib-density{display:flex;gap:8px;}'
      + '#lf-calib-density button{flex:1;padding:9px 6px;border-radius:10px;border:1px solid rgba(255,255,255,.14);'
      +   'background:rgba(255,255,255,.04);color:#fff;font-size:.72rem;cursor:pointer;}'
      + '#lf-calib-density button.on{border-color:#4da3ff;background:rgba(77,163,255,.18);color:#7db8ff;}'
      + '#lf-calib-actions{display:flex;gap:10px;margin-top:6px;}'
      + '#lf-calib-actions button{flex:1;padding:11px 8px;border-radius:12px;border:none;font-weight:700;font-size:.82rem;cursor:pointer;}'
      + '#lf-calib-auto{background:linear-gradient(180deg,#4da3ff,#1977f3);color:#fff;grid-column:1/-1;width:100%;margin-bottom:12px;}'
      + '#lf-calib-save{background:#1b8a5e;color:#fff;}'
      + '#lf-calib-reset{background:rgba(255,255,255,.08);color:#fff;}'
      + '#lf-calib-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#aab0bb;font-size:1.1rem;cursor:pointer;}'
      + '#lf-calib-status{font-size:.72rem;color:#7dd18a;min-height:16px;margin-top:8px;}';
    document.head.appendChild(st);
  }

  function _ensureSheet(){
    if(document.getElementById('lf-calib-sheet')) return;
    var wrap=document.createElement('div');
    wrap.id='lf-calib-sheet';
    wrap.innerHTML=''
      + '<div class="lf-calib-ov"></div>'
      + '<div class="lf-calib-box">'
      +   '<button id="lf-calib-close" aria-label="Fechar">✕</button>'
      +   '<h3>🖥️ Ajustar visualização</h3>'
      +   '<div class="lf-calib-sub">Ajuste o zoom, o espaçamento e a distância do topo/rodapé para o app caber melhor neste aparelho. Fica salvo só neste celular.</div>'
      +   '<button id="lf-calib-auto">🔎 Detectar automaticamente</button>'
      +   '<div class="lf-calib-row">'
      +     '<label>Zoom geral: <span id="lf-calib-zoom-val">100%</span></label>'
      +     '<input type="range" id="lf-calib-zoom" min="70" max="130" step="1" value="100">'
      +   '</div>'
      +   '<div class="lf-calib-row">'
      +     '<label>Espaçamento</label>'
      +     '<div id="lf-calib-density">'
      +       '<button data-d="compact">Compacto</button>'
      +       '<button data-d="normal">Normal</button>'
      +       '<button data-d="comfortable">Confortável</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="lf-calib-row">'
      +     '<label>Empurrar conteúdo para baixo: <span id="lf-calib-top-val">0px</span></label>'
      +     '<input type="range" id="lf-calib-top" min="0" max="64" step="1" value="0">'
      +   '</div>'
      +   '<div class="lf-calib-row">'
      +     '<label>Afastar do rodapé / barra do celular: <span id="lf-calib-bottom-val">0px</span></label>'
      +     '<input type="range" id="lf-calib-bottom" min="0" max="64" step="1" value="0">'
      +   '</div>'
      +   '<div id="lf-calib-actions">'
      +     '<button id="lf-calib-reset">Restaurar padrão</button>'
      +     '<button id="lf-calib-save">Salvar</button>'
      +   '</div>'
      +   '<div id="lf-calib-status"></div>'
      + '</div>';
    document.body.appendChild(wrap);

    wrap.querySelector('.lf-calib-ov').addEventListener('click', _closeSheet);
    document.getElementById('lf-calib-close').addEventListener('click', _closeSheet);

    function previewDraft(){
      var draft=_draftFromUI();
      _paintLiveValues(draft);
      _applyCalibration(draft);
    }

    ['lf-calib-zoom','lf-calib-top','lf-calib-bottom'].forEach(function(id){
      var input=document.getElementById(id);
      if(input) input.addEventListener('input', previewDraft);
    });

    document.querySelectorAll('#lf-calib-density button').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('#lf-calib-density button').forEach(function(x){x.classList.remove('on');});
        btn.classList.add('on');
        _pendingDensity=btn.getAttribute('data-d')||'normal';
        previewDraft();
      });
    });

    document.getElementById('lf-calib-auto').addEventListener('click', function(){
      var statusEl=document.getElementById('lf-calib-status');
      statusEl.textContent='Detectando…';
      _autoDetect(function(result){
        var current=_draftFromUI();
        result.topOffset=current.topOffset;
        result.bottomOffset=current.bottomOffset;
        _paintSheetValues(result);
        _applyCalibration(result);
        statusEl.textContent='Ajustado automaticamente para '+result.zoom+'% de zoom.';
      });
    });

    document.getElementById('lf-calib-save').addEventListener('click', function(){
      _cfg=_draftFromUI();
      _pendingDensity=_cfg.density;
      _save(_cfg);
      _applyCalibration(_cfg);
      document.getElementById('lf-calib-status').textContent='✅ Salvo! Vai continuar assim toda vez que abrir o app neste celular.';
    });

    document.getElementById('lf-calib-reset').addEventListener('click', function(){
      _cfg=_normalize(DEFAULTS);
      _pendingDensity=_cfg.density;
      _save(_cfg);
      _applyCalibration(_cfg);
      _paintSheetValues(_cfg);
      document.getElementById('lf-calib-status').textContent='Restaurado ao padrão.';
    });
  }

  function _openSheet(){
    _ensureSheet();
    _paintSheetValues(_cfg);
    document.getElementById('lf-calib-status').textContent='';
    document.getElementById('lf-calib-sheet').classList.add('open');
  }

  function _closeSheet(){
    var sheet=document.getElementById('lf-calib-sheet');
    if(sheet) sheet.classList.remove('open');
    _pendingDensity=_cfg.density;
    _applyCalibration(_cfg);
  }

  function _summary(){
    return 'Zoom '+_cfg.zoom+'% · '+(_cfg.density==='compact'?'compacto':_cfg.density==='comfortable'?'confortável':'normal')+' · topo +'+_cfg.topOffset+'px · rodapé +'+_cfg.bottomOffset+'px';
  }

  function _boot(){
    _applyCalibration(_cfg);
    _ensureStyles();
    window.openDisplayCalibrationSettings=_openSheet;
    window.getDisplayCalibrationSummary=_summary;
  }

  if(document.body) _boot();
  else document.addEventListener('DOMContentLoaded', _boot);

  console.info('[lf-display-calibration] ajuste de visualização disponível na tela Configurações.');
})();
