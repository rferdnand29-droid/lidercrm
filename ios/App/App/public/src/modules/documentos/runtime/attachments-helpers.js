(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var documentos = modules.documentos = modules.documentos || {};

  function attIcon(type, name){
    var n = (name || '').toLowerCase();
    if (type && type.startsWith('image/')) return { ic:'🖼', cls:'img' };
    if (type && type.startsWith('audio/')) return { ic:'🎵', cls:'audio' };
    if (type && type.startsWith('video/')) return { ic:'🎬', cls:'video' };
    if (type === 'application/pdf' || n.endsWith('.pdf')) return { ic:'📄', cls:'pdf' };
    if (n.endsWith('.doc') || n.endsWith('.docx')) return { ic:'📝', cls:'doc' };
    if (n.endsWith('.xls') || n.endsWith('.xlsx')) return { ic:'📊', cls:'xls' };
    if (n.endsWith('.csv')) return { ic:'📋', cls:'csv' };
    if (n.endsWith('.txt')) return { ic:'📃', cls:'txt' };
    return { ic:'📁', cls:'' };
  }
  function fmtBytes(bytes){
    if (!bytes) return '';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }
  function switchDetTab(tab, btn){
    document.querySelectorAll('#mo-kb-det .det-tab').forEach(function(node){ node.classList.remove('on'); });
    document.querySelectorAll('#mo-kb-det .det-tab-pane').forEach(function(node){ node.classList.remove('on'); });
    if (btn) btn.classList.add('on');
    var pane = document.getElementById('det-pane-' + tab);
    if (pane) pane.classList.add('on');
    if (tab === 'att') global.reRenderAtt();
  }
  /* [FIX 20260822] REDESIGN: cartões recolhíveis (Anotações/Lembretes/
     Comentários) — fechados por padrão, expandem ao tocar no cabeçalho.
     Genérica pros 3 (mesmo padrão do mockup de referência). Não mexe em
     nenhum dado/estado da aplicação — só alterna uma classe CSS. */
  function toggleDetCard(id){
    var card = document.getElementById(id);
    if (card) card.classList.toggle('open');
  }
  /* [FIX 20260822] REDESIGN: ícone por tipo de evento na linha do tempo —
     inferido por palavra-chave no texto que já existe (ev.texto), sem
     precisar de nenhum campo novo no dado (o histórico sempre foi só
     texto livre + autor + data). */
  function _histIconFor(texto){
    var t=(texto||'').toLowerCase();
    if(t.indexOf('criado')>=0||t.indexOf('criou')>=0)return '＋';
    if(t.indexOf('movido')>=0||t.indexOf('etapa')>=0)return '↗';
    if(t.indexOf('exclu')>=0)return '🗑';
    if(t.indexOf('anexo')>=0)return '📎';
    if(t.indexOf('responsável')>=0||t.indexOf('transferi')>=0)return '👤';
    if(t.indexOf('convert')>=0)return '✨';
    if(t.indexOf('agend')>=0||t.indexOf('lembrete')>=0)return '🔔';
    if(t.indexOf('conclu')>=0)return '✓';
    if(t.indexOf('editou')>=0||t.indexOf('objeção')>=0)return '✏';
    if(t.indexOf('descart')>=0)return '⊘';
    return '•';
  }
  function renderDetHistorico(card){
    var board = global._kbDetBoard;
    var id = global._kbDetId;
    if (board && id) {
      var uid = (global._kbDetOwnerUid || global.activeUID(board));
      var arr = global.getKBFor(board, uid);
      var fresh = arr.find(function(item){ return item.id === id; });
      if (fresh) card = fresh;
    }
    var history = (card && card.historico) || [];
    var html = !history.length
      ? '<div class="act-empty">Nenhuma movimentação registrada ainda.</div>'
      : '<div class="det-timeline">' + history.map(function(ev){
          var dt = ev.ts ? new Date(ev.ts).toLocaleString('pt-BR') : '';
          var mergedTag = ev.fromMerged ? ' <span class="det-tl-merged-tag">· de "'+global.eH(ev.mergedFromName||'?')+'" (mesclado)</span>' : '';
          return '<div class="det-tl-item'+(ev.fromMerged?' det-tl-merged':'')+'"><div class="det-tl-dot">' + _histIconFor(ev.texto) + '</div>'
            + '<div class="det-tl-title">' + global.eH(ev.texto) + '</div>'
            + '<div class="det-tl-meta">' + global.eH(ev.by || '') + (dt ? ' · ' + dt : '') + mergedTag + '</div></div>';
        }).join('') + '</div>';
    // [FIX 20260820] renderiza nos dois lugares que mostram histórico:
    // a aba "Histórico" à direita (det-hist-list, já existia) e o painel
    // sempre visível à esquerda (det-hist-list-left, novo — substitui o
    // antigo widget de trocar responsável). Os dois ficam em sincronia
    // automática, em qualquer fluxo que já chamava renderDetHistorico()
    // (abrir o detalhe, mover de etapa).
    ['det-hist-list', 'det-hist-list-left'].forEach(function(elId){
      var el = document.getElementById(elId);
      if (el) el.innerHTML = html;
    });
  }

  // Lista de extensões de anexo permitidas — antes duplicada em ATT_ALLOWED_EXT
  // (js/documentos.js, anexos de card) e ADM_DOC_ALLOWED_EXT (documentos admin).
  // Consolidada aqui na rodada 2026-07-17 (parte 3).
  var DOC_ALLOWED_EXT = ['pdf','doc','docx','xls','xlsx','csv','txt','jpg','jpeg','png','webp','mp3','wav','m4a','ogg','mp4','mov','webm'];

  function _docFileTypeAllowed(f, allowedExt){
    if(f.type&&f.type.indexOf('image/')===0)return true;
    if(f.type&&f.type.indexOf('audio/')===0)return true;
    if(f.type&&f.type.indexOf('video/')===0)return true;
    var ext=(f.name||'').split('.').pop().toLowerCase();
    return (allowedExt||DOC_ALLOWED_EXT).indexOf(ext)>=0;
  }

  function _safeStorageName(name){
    return (name||'arquivo').replace(/[^a-zA-Z0-9._-]/g,'_');
  }

  function _attMediaSrc(a){
    var raw=String((a&&(a.url||a.data))||'').trim();
    if(!raw)return '';
    if(/^blob:/i.test(raw))return raw;
    if(/^data:(image|audio|video|application\/pdf)(;|,)/i.test(raw))return raw;
    if(/^https?:\/\//i.test(raw))return raw;
    if(raw.charAt(0)==='/')return raw;
    return '';
  }

  // CORREÇÃO ÁUDIO (2026-07-20): renderiza um player de áudio inline para anexos.
  // Usado quando um anexo é do tipo audio/* — exibe <audio controls> em vez de
  // apenas um ícone + link, permitindo ouvir o áudio direto no card.
  function renderAttAudio(url, name){
    if(!url)return '';
    var safeUrl=String(url).replace(/"/g,'&quot;');
    var label=name?global.eH(name):'Áudio';
    return '<div class="att-audio-wrap" style="margin:6px 0;padding:8px;background:rgba(255,255,255,.06);border-radius:8px">'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
      +'<span style="font-size:1rem">🎵</span>'
      +'<span style="font-size:.72rem;color:var(--mu);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">'+label+'</span>'
      +'</div>'
      +'<audio controls preload="metadata" src="'+safeUrl+'" style="width:100%;height:32px"></audio>'
      +'</div>';
  }

  
  /* R14-13: expor funções ao escopo global */
  if(typeof attIcon === 'function') global.attIcon = attIcon;
  if(typeof fmtBytes === 'function') global.fmtBytes = fmtBytes;
  if(typeof switchDetTab === 'function') global.switchDetTab = switchDetTab;
  if(typeof toggleDetCard === 'function') global.toggleDetCard = toggleDetCard;
  if(typeof renderDetHistorico === 'function') global.renderDetHistorico = renderDetHistorico;
  if(typeof _docFileTypeAllowed === 'function') global._docFileTypeAllowed = _docFileTypeAllowed;
  if(typeof _safeStorageName === 'function') global._safeStorageName = _safeStorageName;
  if(typeof _attMediaSrc === 'function') global._attMediaSrc = _attMediaSrc;
  if(typeof renderAttAudio === 'function') global.renderAttAudio = renderAttAudio;

documentos.runtime = {
    attIcon: attIcon,
    fmtBytes: fmtBytes,
    switchDetTab: switchDetTab,
    toggleDetCard: toggleDetCard,
    renderDetHistorico: renderDetHistorico,
    DOC_ALLOWED_EXT: DOC_ALLOWED_EXT,
    _docFileTypeAllowed: _docFileTypeAllowed,
    _safeStorageName: _safeStorageName,
    _attMediaSrc: _attMediaSrc,
    renderAttAudio: renderAttAudio
  };
})(window);
