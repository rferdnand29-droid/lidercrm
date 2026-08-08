/* =====================================================================
 * lf-swipe-tabs-calibration-v1-20260805.js
 * -----------------------------------------------------------------------
 * Ferramenta de calibração do "arrastar pro lado pra trocar de aba" —
 * a pedido do usuário ("às vezes não vai, às vezes vai quando não é
 * pra ir"), seguindo o MESMO padrão já usado em Configurações pra
 * "🖥️ Ajustar visualização" e "💬 Ajustar posição do Papo": sheet com
 * sliders, salva por aparelho em localStorage.
 *
 * Diferença aqui: como o gesto é global (a página inteira), não dá
 * pra mostrar uma "pré-visualização ao vivo" da interface por trás.
 * Em vez disso, a sheet tem uma FAIXA DE TESTE onde a pessoa arrasta
 * o dedo de verdade e vê na hora se aquele gesto teria contado como
 * troca de aba ou não — usando exatamente a mesma lógica de
 * js/lf-mobile-swipe-tabs.js (via window.LF_SWIPE_TABS.testGesture),
 * pra não ter risco de a prévia mentir sobre o comportamento real.
 *
 * Não mexe em nenhuma outra função do app — só lê/escreve a config
 * de window.LF_SWIPE_TABS. Ver docs/coding-standards.md.
 * ===================================================================== */
(function(){
  if(window.__LF_SWIPE_TABS_CALIBRATION_V1__) return;
  window.__LF_SWIPE_TABS_CALIBRATION_V1__ = 1;

  function core(){ return window.LF_SWIPE_TABS; }

  function _draftFromUI(){
    var c = core();
    var th = document.getElementById('lf-swipecal-threshold');
    var an = document.getElementById('lf-swipecal-angle');
    var cfg = c ? c.getConfig() : { threshold:50, angle:30 };
    return {
      threshold: th ? parseInt(th.value,10) : cfg.threshold,
      angle: an ? parseInt(an.value,10) : cfg.angle
    };
  }

  function _paintValues(cfg){
    var tv = document.getElementById('lf-swipecal-threshold-val');
    var av = document.getElementById('lf-swipecal-angle-val');
    if(tv) tv.textContent = cfg.threshold+'px';
    if(av) av.textContent = cfg.angle+'°';
  }

  function _paintSheet(cfg){
    var th = document.getElementById('lf-swipecal-threshold');
    var an = document.getElementById('lf-swipecal-angle');
    if(th) th.value = cfg.threshold;
    if(an) an.value = cfg.angle;
    _paintValues(cfg);
  }

  function _resultText(res, cfg){
    if(!res) return '';
    if(res.ok){
      return '✅ Contou! Arrasto de '+Math.round(res.adx)+'px'+(res.isFlick?' (flick rápido)':'')+', ângulo '+Math.round(res.angle)+'°.';
    }
    if(res.reason === 'distancia'){
      return '❌ Não contou — só '+Math.round(res.adx)+'px (precisava de '+Math.round(res.minDist)+'px'+(res.isFlick?' porque foi rápido':'')+').';
    }
    if(res.reason === 'angulo'){
      return '❌ Não contou — arrasto muito torto (ângulo '+Math.round(res.angle)+'°, máximo é '+cfg.angle+'°).';
    }
    if(res.reason === 'tempo'){
      return '❌ Não contou — muito devagar (arraste mais rápido, num só movimento).';
    }
    return '❌ Não contou.';
  }

  function _ensureStyles(){
    if(document.getElementById('lf-swipecal-ui-style')) return;
    var st = document.createElement('style');
    st.id = 'lf-swipecal-ui-style';
    st.textContent = ''
      + '#lf-swipecal-sheet{position:fixed;inset:0;z-index:600;display:none;}'
      + '#lf-swipecal-sheet.open{display:block;}'
      + '#lf-swipecal-sheet .lf-swipecal-ov{position:absolute;inset:0;background:rgba(0,0,0,.45);}'
      + '#lf-swipecal-sheet .lf-swipecal-box{position:absolute;left:0;right:0;bottom:0;background:#1b1e24;color:#fff;'
      +   'border-radius:18px 18px 0 0;padding:18px 18px calc(20px + env(safe-area-inset-bottom,0px));'
      +   'font-family:Outfit,sans-serif;max-height:85vh;overflow:auto;}'
      + '#lf-swipecal-sheet h3{margin:0 0 4px;font-size:1.05rem;}'
      + '#lf-swipecal-sheet .lf-swipecal-sub{font-size:.78rem;color:#aab0bb;margin-bottom:16px;line-height:1.4;}'
      + '#lf-swipecal-sheet .lf-swipecal-row{margin-bottom:16px;}'
      + '#lf-swipecal-sheet label{display:block;font-size:.75rem;color:#c7ccd4;margin-bottom:4px;font-weight:600;}'
      + '#lf-swipecal-sheet .lf-swipecal-hint{font-size:.68rem;color:#8b919c;margin-bottom:6px;line-height:1.35;}'
      + '#lf-swipecal-threshold-val,#lf-swipecal-angle-val{color:#7db8ff;font-weight:700;}'
      + '#lf-swipecal-sheet input[type=range]{width:100%;}'
      + '#lf-swipecal-testzone{margin:4px 0 16px;height:64px;border-radius:12px;border:2px dashed rgba(255,255,255,.25);'
      +   'display:flex;align-items:center;justify-content:center;text-align:center;padding:0 10px;'
      +   'font-size:.78rem;color:#c7ccd4;user-select:none;-webkit-user-select:none;touch-action:pan-y;background:rgba(255,255,255,.03);}'
      + '#lf-swipecal-testzone.ok{border-color:#1b8a5e;background:rgba(27,138,94,.12);color:#7dd18a;}'
      + '#lf-swipecal-testzone.fail{border-color:#c0553f;background:rgba(192,85,63,.10);color:#e0937f;}'
      + '#lf-swipecal-actions{display:flex;gap:10px;margin-top:6px;}'
      + '#lf-swipecal-actions button{flex:1;padding:11px 8px;border-radius:12px;border:none;font-weight:700;font-size:.82rem;cursor:pointer;}'
      + '#lf-swipecal-save{background:#1b8a5e;color:#fff;}'
      + '#lf-swipecal-reset{background:rgba(255,255,255,.08);color:#fff;}'
      + '#lf-swipecal-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#aab0bb;font-size:1.1rem;cursor:pointer;}'
      + '#lf-swipecal-status{font-size:.72rem;color:#7dd18a;min-height:16px;margin-top:8px;}';
    document.head.appendChild(st);
  }

  function _wireTestZone(){
    var zone = document.getElementById('lf-swipecal-testzone');
    if(!zone || zone.__wired) return;
    zone.__wired = true;
    var sx=0, sy=0, st=0, on=false;
    var DEFAULT_LABEL = '👉 Arraste o dedo pra esquerda ou direita aqui pra testar 👈';

    function reset(){
      zone.classList.remove('ok','fail');
      zone.textContent = DEFAULT_LABEL;
    }
    reset();

    zone.addEventListener('touchstart', function(e){
      var t = e.touches[0];
      sx = t.clientX; sy = t.clientY; st = Date.now(); on = true;
      zone.classList.remove('ok','fail');
    }, {passive:true});

    zone.addEventListener('touchend', function(e){
      if(!on) return;
      on = false;
      var c = core();
      if(!c) return;
      var t = (e.changedTouches && e.changedTouches[0]);
      if(!t) return;
      var dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - st;
      var draft = _draftFromUI();
      var res = c.testGesture(dx, dy, dt, draft);
      zone.textContent = _resultText(res, draft);
      zone.classList.toggle('ok', !!res.ok);
      zone.classList.toggle('fail', !res.ok);
    }, {passive:true});

    zone.addEventListener('touchcancel', function(){ on=false; reset(); }, {passive:true});
  }

  function _ensureSheet(){
    if(document.getElementById('lf-swipecal-sheet')) return;
    var wrap = document.createElement('div');
    wrap.id = 'lf-swipecal-sheet';
    // data-no-swipe: garante que arrastar dentro desta sheet (inclusive
    // na faixa de teste) nunca é lido pelo detector real como troca de
    // aba de verdade — só o script local desta ferramenta escuta ali.
    wrap.setAttribute('data-no-swipe','');
    wrap.innerHTML = ''
      + '<div class="lf-swipecal-ov"></div>'
      + '<div class="lf-swipecal-box">'
      +   '<button id="lf-swipecal-close" aria-label="Fechar">✕</button>'
      +   '<h3>↔️ Ajustar arrastar de aba</h3>'
      +   '<div class="lf-swipecal-sub">Ajuste até o arrastar pro lado ficar do jeito que funciona melhor no seu dedo neste celular. Fica salvo só neste aparelho.</div>'

      +   '<div class="lf-swipecal-row">'
      +     '<label>Distância mínima do arrasto: <span id="lf-swipecal-threshold-val">50px</span></label>'
      +     '<div class="lf-swipecal-hint">Menor = mais fácil de disparar (mas mais chance de trocar sem querer). Maior = precisa arrastar mais pra valer.</div>'
      +     '<input type="range" id="lf-swipecal-threshold" min="30" max="100" step="5" value="50">'
      +   '</div>'

      +   '<div class="lf-swipecal-row">'
      +     '<label>Tolerância ao ângulo do dedo: <span id="lf-swipecal-angle-val">30°</span></label>'
      +     '<div class="lf-swipecal-hint">Maior = ainda conta mesmo arrastando meio torto. Menor = só conta se for bem na horizontal (evita confundir com rolar a tela).</div>'
      +     '<input type="range" id="lf-swipecal-angle" min="12" max="40" step="1" value="30">'
      +   '</div>'

      +   '<div class="lf-swipecal-row">'
      +     '<label>Teste ao vivo</label>'
      +     '<div id="lf-swipecal-testzone"></div>'
      +   '</div>'

      +   '<div id="lf-swipecal-actions">'
      +     '<button id="lf-swipecal-reset">Restaurar padrão</button>'
      +     '<button id="lf-swipecal-save">Salvar</button>'
      +   '</div>'
      +   '<div id="lf-swipecal-status"></div>'
      + '</div>';
    document.body.appendChild(wrap);

    wrap.querySelector('.lf-swipecal-ov').addEventListener('click', _closeSheet);
    document.getElementById('lf-swipecal-close').addEventListener('click', _closeSheet);

    ['lf-swipecal-threshold','lf-swipecal-angle'].forEach(function(id){
      var input = document.getElementById(id);
      if(input) input.addEventListener('input', function(){ _paintValues(_draftFromUI()); });
    });

    document.getElementById('lf-swipecal-save').addEventListener('click', function(){
      var c = core();
      if(!c) return;
      var applied = c.setConfig(_draftFromUI());
      _paintSheet(applied);
      document.getElementById('lf-swipecal-status').textContent = '✅ Salvo! Vai usar esse ajuste toda vez que abrir o app neste celular.';
    });

    document.getElementById('lf-swipecal-reset').addEventListener('click', function(){
      var c = core();
      if(!c) return;
      var applied = c.resetConfig();
      _paintSheet(applied);
      document.getElementById('lf-swipecal-status').textContent = 'Restaurado ao padrão.';
    });

    _wireTestZone();
  }

  function _openSheet(){
    var c = core();
    if(!c){
      if(typeof window.toast === 'function') window.toast('Ajuste de arrastar indisponível agora.');
      return;
    }
    _ensureStyles();
    _ensureSheet();
    _paintSheet(c.getConfig());
    var zone = document.getElementById('lf-swipecal-testzone');
    if(zone){ zone.classList.remove('ok','fail'); zone.textContent = '👉 Arraste o dedo pra esquerda ou direita aqui pra testar 👈'; }
    document.getElementById('lf-swipecal-status').textContent = '';
    document.getElementById('lf-swipecal-sheet').classList.add('open');
  }

  function _closeSheet(){
    var sheet = document.getElementById('lf-swipecal-sheet');
    if(sheet) sheet.classList.remove('open');
  }

  function _boot(){
    window.openSwipeTabsCalibrationSettings = _openSheet;
  }

  if(document.body) _boot();
  else document.addEventListener('DOMContentLoaded', _boot);

  console.info('[lf-swipe-tabs-calibration] ajuste de arrastar de aba disponível na tela Configurações.');
})();
