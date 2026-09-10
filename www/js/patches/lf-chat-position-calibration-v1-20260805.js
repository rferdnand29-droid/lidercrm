/* =====================================================================
 * lf-chat-position-calibration-v1-20260805.js
 * -----------------------------------------------------------------------
 * Ajuste de posição do cabeçalho da conversa (nome de quem você está
 * falando) e da barra de digitar, dentro da aba Papo — a pedido do
 * usuário, seguindo o MESMO padrão da ferramenta que já existe em
 * Configurações ("🖥️ Ajustar visualização",
 * lf-mobile-display-calibration-20260713f.js): sheet com sliders,
 * pré-visualização ao vivo, salva por aparelho em localStorage.
 *
 * Por que uma ferramenta separada em vez de só eu ajustar CSS: o
 * comportamento de "sticky" no WebView varia por aparelho/versão de
 * Android, e a maneira mais confiável de garantir que fique bom em
 * QUALQUER celular é deixar a pessoa empurrar pra cima/baixo até ficar
 * do jeito dela — igual a ferramenta de zoom já faz pro resto do app.
 *
 * Não mexe em nenhuma função/lógica do chat — só aplica um
 * `transform:translateY()` no cabeçalho e na barra de digitar (não
 * afeta o cálculo de "sticky", só desloca visualmente).
 * ===================================================================== */
(function(){
  if(window.__LF_CHAT_POSITION_CALIBRATION_V1__) return;
  window.__LF_CHAT_POSITION_CALIBRATION_V1__ = 1;

  var STORE_KEY='lf_chat_position_calibration_v2';
  var DEFAULTS={headerOffset:0, inputOffset:0};
  var RANGE_MIN=-40, RANGE_MAX=40;

  function _clamp(n){ n=parseInt(n,10); if(!isFinite(n)) n=0; return Math.max(RANGE_MIN,Math.min(RANGE_MAX,n)); }

  function _normalize(cfg){
    cfg=cfg||{};
    return {
      headerOffset:_clamp(cfg.headerOffset==null?DEFAULTS.headerOffset:cfg.headerOffset),
      inputOffset:_clamp(cfg.inputOffset==null?DEFAULTS.inputOffset:cfg.inputOffset)
    };
  }

  function _load(){
    try{
      var raw=localStorage.getItem(STORE_KEY);
      if(!raw) return _normalize(DEFAULTS);
      return _normalize(JSON.parse(raw)||{});
    }catch(e){ return _normalize(DEFAULTS); }
  }

  function _save(cfg){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(_normalize(cfg))); }catch(e){}
  }

  var _cfg=_load();

  function _draftFromUI(){
    var h=document.getElementById('lf-chatpos-header');
    var i=document.getElementById('lf-chatpos-input');
    return _normalize({
      headerOffset:h?h.value:_cfg.headerOffset,
      inputOffset:i?i.value:_cfg.inputOffset
    });
  }

  function _paintValues(cfg){
    cfg=_normalize(cfg||_cfg);
    var hv=document.getElementById('lf-chatpos-header-val');
    var iv=document.getElementById('lf-chatpos-input-val');
    if(hv) hv.textContent=(cfg.headerOffset>0?'+':'')+cfg.headerOffset+'px';
    if(iv) iv.textContent=(cfg.inputOffset>0?'+':'')+cfg.inputOffset+'px';
  }

  function _paintSheet(cfg){
    cfg=_normalize(cfg||_cfg);
    var h=document.getElementById('lf-chatpos-header');
    var i=document.getElementById('lf-chatpos-input');
    if(h) h.value=cfg.headerOffset;
    if(i) i.value=cfg.inputOffset;
    _paintValues(cfg);
  }

  /* Positivo empurra pra BAIXO, negativo pra CIMA — mesma convenção
     intuitiva de "afastar do topo/rodapé" da ferramenta de zoom. */
  function _apply(cfg){
    cfg=_normalize(cfg||_cfg);
    var id='lf-chat-position-style';
    var st=document.getElementById(id);
    if(!st){ st=document.createElement('style'); st.id=id; document.head.appendChild(st); }
    st.textContent=''
      + '@media (max-width:768px){'
      +   '#chat-conv-header{transform:translateY('+cfg.headerOffset+'px)!important;}'
      +   '#chat-input-area{transform:translateY('+cfg.inputOffset+'px)!important;}'
      + '}';
  }

  function _ensureStyles(){
    if(document.getElementById('lf-chatpos-ui-style')) return;
    var st=document.createElement('style');
    st.id='lf-chatpos-ui-style';
    st.textContent=''
      + '#lf-chatpos-sheet{position:fixed;inset:0;z-index:600;display:none;}'
      + '#lf-chatpos-sheet.open{display:block;}'
      + '#lf-chatpos-sheet .lf-chatpos-ov{position:absolute;inset:0;background:rgba(0,0,0,.45);}'
      + '#lf-chatpos-sheet .lf-chatpos-box{position:absolute;left:0;right:0;bottom:0;background:#1b1e24;color:#fff;'
      +   'border-radius:18px 18px 0 0;padding:18px 18px calc(20px + env(safe-area-inset-bottom,0px));'
      +   'font-family:Outfit,sans-serif;max-height:80vh;overflow:auto;}'
      + '#lf-chatpos-sheet h3{margin:0 0 4px;font-size:1.05rem;}'
      + '#lf-chatpos-sheet .lf-chatpos-sub{font-size:.78rem;color:#aab0bb;margin-bottom:16px;line-height:1.4;}'
      + '#lf-chatpos-sheet .lf-chatpos-row{margin-bottom:16px;}'
      + '#lf-chatpos-sheet label{display:block;font-size:.75rem;color:#c7ccd4;margin-bottom:6px;font-weight:600;}'
      + '#lf-chatpos-header-val,#lf-chatpos-input-val{color:#7db8ff;font-weight:700;}'
      + '#lf-chatpos-sheet input[type=range]{width:100%;}'
      + '#lf-chatpos-actions{display:flex;gap:10px;margin-top:6px;}'
      + '#lf-chatpos-actions button{flex:1;padding:11px 8px;border-radius:12px;border:none;font-weight:700;font-size:.82rem;cursor:pointer;}'
      + '#lf-chatpos-save{background:#1b8a5e;color:#fff;}'
      + '#lf-chatpos-reset{background:rgba(255,255,255,.08);color:#fff;}'
      + '#lf-chatpos-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#aab0bb;font-size:1.1rem;cursor:pointer;}'
      + '#lf-chatpos-status{font-size:.72rem;color:#7dd18a;min-height:16px;margin-top:8px;}'
      + '#lf-chatpos-preview-hint{font-size:.7rem;color:#e0b25c;background:rgba(224,178,92,.1);border:1px solid rgba(224,178,92,.25);border-radius:8px;padding:8px 10px;margin-bottom:14px;}';
    document.head.appendChild(st);
  }

  function _ensureSheet(){
    if(document.getElementById('lf-chatpos-sheet')) return;
    var wrap=document.createElement('div');
    wrap.id='lf-chatpos-sheet';
    wrap.innerHTML=''
      + '<div class="lf-chatpos-ov"></div>'
      + '<div class="lf-chatpos-box">'
      +   '<button id="lf-chatpos-close" aria-label="Fechar">✕</button>'
      +   '<h3>💬 Ajustar posição do Papo</h3>'
      +   '<div class="lf-chatpos-sub">Empurre o nome de quem você está conversando e a barra de digitar pra cima ou pra baixo, até ficar do jeito que funciona melhor neste celular. Fica salvo só neste aparelho.</div>'
      +   '<div id="lf-chatpos-preview-hint">💡 Abra uma conversa no Papo atrás desta janela pra ver o efeito ao vivo enquanto mexe nos controles.</div>'
      +   '<div class="lf-chatpos-row">'
      +     '<label>Nome de quem está conversando: <span id="lf-chatpos-header-val">0px</span></label>'
      +     '<input type="range" id="lf-chatpos-header" min="'+RANGE_MIN+'" max="'+RANGE_MAX+'" step="1" value="0">'
      +   '</div>'
      +   '<div class="lf-chatpos-row">'
      +     '<label>Barra de digitar: <span id="lf-chatpos-input-val">0px</span></label>'
      +     '<input type="range" id="lf-chatpos-input" min="'+RANGE_MIN+'" max="'+RANGE_MAX+'" step="1" value="0">'
      +   '</div>'
      +   '<div id="lf-chatpos-actions">'
      +     '<button id="lf-chatpos-reset">Restaurar padrão</button>'
      +     '<button id="lf-chatpos-save">Salvar</button>'
      +   '</div>'
      +   '<div id="lf-chatpos-status"></div>'
      + '</div>';
    document.body.appendChild(wrap);

    wrap.querySelector('.lf-chatpos-ov').addEventListener('click', _closeSheet);
    document.getElementById('lf-chatpos-close').addEventListener('click', _closeSheet);

    function previewDraft(){
      var draft=_draftFromUI();
      _paintValues(draft);
      _apply(draft);
    }

    ['lf-chatpos-header','lf-chatpos-input'].forEach(function(id){
      var input=document.getElementById(id);
      if(input) input.addEventListener('input', previewDraft);
    });

    document.getElementById('lf-chatpos-save').addEventListener('click', function(){
      _cfg=_draftFromUI();
      _save(_cfg);
      _apply(_cfg);
      document.getElementById('lf-chatpos-status').textContent='✅ Salvo! Vai continuar assim toda vez que abrir o Papo neste celular.';
    });

    document.getElementById('lf-chatpos-reset').addEventListener('click', function(){
      _cfg=_normalize(DEFAULTS);
      _save(_cfg);
      _apply(_cfg);
      _paintSheet(_cfg);
      document.getElementById('lf-chatpos-status').textContent='Restaurado ao padrão.';
    });
  }

  function _openSheet(){
    _ensureStyles();
    _ensureSheet();
    _paintSheet(_cfg);
    document.getElementById('lf-chatpos-status').textContent='';
    document.getElementById('lf-chatpos-sheet').classList.add('open');
  }

  function _closeSheet(){
    var sheet=document.getElementById('lf-chatpos-sheet');
    if(sheet) sheet.classList.remove('open');
    _apply(_cfg); // descarta qualquer preview não salvo
  }

  function _summary(){
    return 'Cabeçalho '+(_cfg.headerOffset>0?'+':'')+_cfg.headerOffset+'px · Barra de digitar '+(_cfg.inputOffset>0?'+':'')+_cfg.inputOffset+'px';
  }

  function _boot(){
    _apply(_cfg);
    window.openChatPositionSettings=_openSheet;
    window.getChatPositionSummary=_summary;
  }

  if(document.body) _boot();
  else document.addEventListener('DOMContentLoaded', _boot);

  console.info('[lf-chat-position] ajuste de posição do Papo disponível na tela Configurações.');
})();
