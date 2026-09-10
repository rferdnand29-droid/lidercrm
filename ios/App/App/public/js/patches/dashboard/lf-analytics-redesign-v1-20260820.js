/* =====================================================================
 * lf-analytics-redesign-v1-20260820.js
 * ---------------------------------------------------------------------
 * PEDIDO: dar uma textura mais "premium"/inovadora aos cards da página
 * Analytics (selo de ícone colorido + sparkline decorativa nos KPIs,
 * rosca vazada na Distribuição) — SEM criar nenhuma métrica nova, só
 * reestilizar o que já existe.
 *
 * COMO FUNCIONA (decorador, não recalculador):
 *   Envelopa drawAnal()/drawNegKPIs() (js/dashboard.js) — deixa a
 *   função ORIGINAL rodar exatamente como sempre rodou (mesmos
 *   números, mesma lógica de negócio, zero alteração), e SÓ DEPOIS lê
 *   de volta o que ela já escreveu no DOM (o texto de cada .kv/.kl, a
 *   legenda .pli já montada) pra decorar visualmente em cima. Nunca
 *   duplica cálculo de métrica — se o texto já renderizado mudar
 *   amanhã (ex.: alguém ajustar um rótulo), o pior caso é o ícone
 *   genérico (gráfico de barras/dourado) aparecer em vez do
 *   específico; os NÚMEROS continuam sempre corretos, vêm sempre da
 *   função original.
 *
 * Cobre as 3 telas que já reusam drawAnal/drawNegKPIs (mesmo padrão
 * "NADA de métrica nova aqui" documentado em js/relatorios.js):
 *   - Analytics (krow/krow2/psvg/pleg)
 *   - Time > consultor selecionado (time-krow/time-krow2/time-psvg/time-pleg)
 *
 * Idempotente: guard global.__lfFixAnalyticsRedesignV1.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__lfFixAnalyticsRedesignV1) return;
  global.__lfFixAnalyticsRedesignV1 = true;

  /* Ícone (nome) + cor por rótulo já renderizado em .kl — cobre as 8
     métricas existentes (4 de drawAnal + 4 de drawNegKPIs). Rótulo
     desconhecido cai no ícone genérico 'bar'/dourado — nunca quebra. */
  var META_BY_LABEL = {
    'Total':                    { icon: 'bar',       color: 'gold'   },
    'Registros no Período':     { icon: 'bar',       color: 'gold'   },
    'Leads Adicionados':        { icon: 'bar',       color: 'gold'   },
    'Agendamentos':             { icon: 'calendar',  color: 'blue'   },
    'Leads Agendados':          { icon: 'calendar',  color: 'blue'   },
    'Fechamentos':              { icon: 'check',     color: 'green'  },
    'Taxa':                     { icon: 'percent',   color: 'violet' },
    'Taxa Conversão':           { icon: 'percent',   color: 'violet' },
    'Taxa Vídeo/Loja → Ficha':  { icon: 'target',    color: 'violet' },
    'Negocios Ativos':          { icon: 'briefcase', color: 'blue'   },
    'Negócios Ativos':          { icon: 'briefcase', color: 'blue'   },
    'Negocios Fechados':        { icon: 'target',    color: 'green'  },
    'Négocios Fechados':        { icon: 'target',    color: 'green'  },
    'Negócios Fechados':        { icon: 'target',    color: 'green'  },
    'Valor Fechado':            { icon: 'dollar',    color: 'gold'   },
    'No-Show/Desistencia':      { icon: 'userx',     color: 'red'    },
    'No-Show/Desistência':      { icon: 'userx',     color: 'red'    }
  };
  var COLOR_HEX = { gold: '#DDB84A', blue: '#3A9FE0', green: '#20A46F', violet: '#A47BC9', red: '#E8676B' };
  var DEFAULT_META = { icon: 'bar', color: 'gold' };

  function _svg(inner, size) {
    size = size || 24;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      inner + '</svg>';
  }

  var ICON_PATHS = {
    bar: '<line x1="5" y1="20" x2="5" y2="14"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="19" y1="20" x2="19" y2="11"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6L16 9.3"/>',
    percent: '<line x1="6" y1="18" x2="18" y2="6"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>',
    briefcase: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.3"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    dollar: '<line x1="12" y1="2.5" x2="12" y2="21.5"/><path d="M17 6.8c0-1.9-2.2-3.3-5-3.3s-5 1.4-5 3.2c0 3.8 10 1.9 10 5.8 0 1.9-2.2 3.3-5 3.3s-5-1.4-5-3.2"/>',
    userx: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a7 7 0 0 1 12-4.9"/><line x1="17" y1="9" x2="22" y2="14"/><line x1="22" y1="9" x2="17" y2="14"/>'
  };

  function _iconSvg(name) { return _svg(ICON_PATHS[name] || ICON_PATHS.bar, 17); }

  /* Sparkline decorativa (não representa série histórica real — a
     página não guarda histórico por métrica; é só textura visual,
     igual a maioria dos dashboards "premium" usa nesse tipo de card).
     3 variações fixas por posição, pra não ficar todo card idêntico. */
  var SPARK_PATHS = [
    'M2 17c4-1 6 3 10-1s8-9 12-6',
    'M2 12c3 4 6-6 10 1s7 6 12-2',
    'M2 15c4 3 6-8 10-2s8 5 12-4'
  ];
  function _sparkSvg(seed, colorHex) {
    var d = SPARK_PATHS[seed % SPARK_PATHS.length];
    return '<svg viewBox="0 0 26 20" width="52" height="30">' +
      '<path d="' + d + '" fill="none" stroke="' + colorHex + '" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" opacity=".8"/></svg>';
  }

  /* ---- KPI cards: acrescenta selo de ícone + sparkline no topo de
     cada .kc, decidido pelo texto já renderizado em .kl ---- */
  function _decorateKpiRow(container) {
    if (!container) return;
    var cards = container.querySelectorAll('.kc');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var klEl = card.querySelector('.kl');
      var kvEl = card.querySelector('.kv');
      if (!klEl || !kvEl) continue;
      var label = (klEl.textContent || '').trim();
      var meta = META_BY_LABEL[label] || DEFAULT_META;
      card.className = card.className.replace(/\blf-anal-\w+\b/g, '').trim();
      card.classList.add('lf-anal-' + meta.color);
      // Idempotente: se essa fileira já foi decorada numa chamada anterior
      // (drawAnal e drawNegKPIs decoram TODAS as fileiras a cada chamada,
      // não só a que cada uma preenche), remove o topo velho antes de
      // inserir de novo — sem isso, o selo+sparkline duplicava a cada
      // segunda função chamada em sequência.
      var oldTop = card.querySelector('.lf-anal-top');
      if (oldTop) oldTop.parentNode.removeChild(oldTop);
      var top = document.createElement('div');
      top.className = 'lf-anal-top';
      var badge = document.createElement('div');
      badge.className = 'lf-anal-badge';
      badge.innerHTML = _iconSvg(meta.icon);
      var spark = document.createElement('div');
      spark.className = 'lf-anal-spark';
      spark.innerHTML = _sparkSvg(i, COLOR_HEX[meta.color] || COLOR_HEX.gold);
      top.appendChild(badge);
      top.appendChild(spark);
      card.insertBefore(top, card.firstChild);
    }
  }

  /* ---- Funil: só passa a cor de cada barra pra uma CSS var, pra o
     brilho (box-shadow) do CSS acompanhar a cor certa de cada uma ---- */
  function _decorateFunnel(container) {
    if (!container) return;
    var bars = container.querySelectorAll('.fib');
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var bg = bar.style.background || bar.style.backgroundColor;
      if (bg) bar.style.setProperty('--fib-glow', bg);
    }
  }

  /* ---- Distribuição: relê a legenda .pli já montada (cor + rótulo +
     valor — nada recalculado) e desenha uma ROSCA (donut) no lugar da
     pizza cheia original, com o mesmo total/proporções. Também
     acrescenta o "%" que a legenda original não mostrava, calculado
     em cima dos MESMOS valores já exibidos (não é dado novo — é só a
     mesma legenda expressa também em porcentagem, textura pedida). ---- */
  function _decorateDonut(svgEl, legendEl) {
    if (!svgEl || !legendEl) return;
    var items = [];
    var lis = legendEl.querySelectorAll('.pli');
    for (var i = 0; i < lis.length; i++) {
      var li = lis[i];
      var sw = li.querySelector('.psc');
      var valEl = li.querySelector('.plv');
      var spans = li.querySelectorAll('span');
      var labelEl = null;
      for (var j = 0; j < spans.length; j++) {
        if (!spans[j].classList.contains('psc') && !spans[j].classList.contains('plv')) { labelEl = spans[j]; break; }
      }
      var value = valEl ? (parseFloat((valEl.textContent || '').replace(/[^\d.-]/g, '')) || 0) : 0;
      items.push({
        color: sw ? (sw.style.background || sw.style.backgroundColor || '#C39A2D') : '#C39A2D',
        value: value,
        valEl: valEl
      });
    }
    var total = 0;
    for (var k = 0; k < items.length; k++) total += items[k].value;
    if (!total) total = 1;

    // porcentagem ao lado do valor na legenda (mesma info, novo formato)
    for (var p = 0; p < items.length; p++) {
      if (!items[p].valEl) continue;
      var pct = Math.round(items[p].value / total * 100);
      var existing = items[p].valEl.parentNode.querySelector('.lf-anal-pct');
      if (!existing) {
        existing = document.createElement('span');
        existing.className = 'lf-anal-pct';
        items[p].valEl.parentNode.appendChild(existing);
      }
      existing.textContent = pct + '%';
    }

    // rosca via círculos com stroke-dasharray (mesmas cores/valores)
    var r = 40, cx = 52, cy = 52, circ = 2 * Math.PI * r, offset = 0;
    var svg = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
      '" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="13"/>';
    for (var s = 0; s < items.length; s++) {
      if (items[s].value <= 0) continue;
      var frac = items[s].value / total;
      var dash = frac * circ;
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
        '" fill="none" stroke="' + items[s].color + '" stroke-width="13" ' +
        'stroke-dasharray="' + dash.toFixed(2) + ' ' + (circ - dash).toFixed(2) + '" ' +
        'stroke-dashoffset="' + (-offset).toFixed(2) + '" stroke-linecap="round" ' +
        'transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      offset += dash;
    }
    svgEl.setAttribute('viewBox', '0 0 104 104');
    svgEl.innerHTML = svg;
  }

  function _runDecorations() {
    ['krow', 'krow2', 'time-krow', 'time-krow2'].forEach(function (id) {
      _decorateKpiRow(document.getElementById(id));
    });
    ['funil', 'time-funil'].forEach(function (id) {
      _decorateFunnel(document.getElementById(id));
    });
    _decorateDonut(document.getElementById('psvg'), document.getElementById('pleg'));
    _decorateDonut(document.getElementById('time-psvg'), document.getElementById('time-pleg'));
  }

  function _wrap(name) {
    var orig = global[name];
    if (typeof orig !== 'function' || orig.__lfAnalRedesignWrapped) return false;
    var wrapped = function () {
      var ret = orig.apply(this, arguments);
      try { _runDecorations(); } catch (_e) { /* decoração nunca derruba o app */ }
      return ret;
    };
    wrapped.__lfAnalRedesignWrapped = true;
    global[name] = wrapped;
    return true;
  }

  function _install() {
    var ok = true;
    ok = _wrap('drawAnal') && ok;
    ok = _wrap('drawNegKPIs') && ok;
    return ok;
  }

  var _tries = 0;
  function _boot() {
    if (_install()) return;
    _tries++;
    if (_tries < 40) setTimeout(_boot, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

})(window);
