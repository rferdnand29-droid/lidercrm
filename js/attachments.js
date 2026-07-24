/**
 * lf-attachments-newtab-v1-20260721.js
 *
 * Duas melhorias em um patch:
 *   1. Visualizador inline de anexos (imagens, vídeos, PDFs) no chat e
 *      em qualquer lugar do sistema onde apareçam links de arquivo.
 *   2. Menu de botão-direito "Abrir em nova guia" nos itens de navegação
 *      (.nt, .mbn-item) e nos links/imagens de mídia — instantâneo,
 *      sem recarregar o sistema do zero (usa ?page= já existente).
 *
 * Não modifica nenhum outro arquivo — wraps e MutationObserver apenas.
 */
(function () {
  'use strict';
  if (window.__LF_ATTACHMENTS_NEWTAB_V1__) return;
  window.__LF_ATTACHMENTS_NEWTAB_V1__ = true;

  /* ═══════════════════════════════════════════
     0. CSS — injetado uma única vez
  ═══════════════════════════════════════════ */
  var _style = document.createElement('style');
  _style.textContent = [
    /* ── Lightbox overlay ── */
    '#lf-ov{position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,.93);',
    'display:flex;align-items:center;justify-content:center;',
    'animation:lfFadeIn .16s ease;cursor:zoom-out}',
    '@keyframes lfFadeIn{from{opacity:0}to{opacity:1}}',
    '#lf-ov img{max-width:96vw;max-height:90vh;border-radius:8px;',
    'object-fit:contain;cursor:default;display:block;box-shadow:0 8px 48px rgba(0,0,0,.6)}',
    '#lf-ov video{max-width:96vw;max-height:90vh;border-radius:8px;',
    'background:#000;box-shadow:0 8px 48px rgba(0,0,0,.6)}',
    '#lf-ov iframe{width:min(920px,96vw);height:90vh;border:none;border-radius:8px;',
    'background:#fff;box-shadow:0 8px 48px rgba(0,0,0,.6)}',
    '#lf-ov-close{position:fixed;top:14px;right:18px;z-index:999999;',
    'width:38px;height:38px;border-radius:50%;border:none;',
    'background:rgba(255,255,255,.14);color:#fff;font-size:1.1rem;',
    'cursor:pointer;display:flex;align-items:center;justify-content:center;',
    'transition:background .15s}',
    '#lf-ov-close:hover{background:rgba(255,255,255,.28)}',
    '#lf-ov-bar{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);',
    'display:flex;gap:8px;z-index:999999}',
    '.lf-ov-btn{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);',
    'color:#fff;font-size:.75rem;padding:6px 14px;border-radius:20px;cursor:pointer;',
    'display:flex;align-items:center;gap:5px;white-space:nowrap;transition:background .15s}',
    '.lf-ov-btn:hover{background:rgba(255,255,255,.24)}',

    /* ── Botão direito — menu de nova guia ── */
    '#lf-ctx{position:fixed;z-index:999999;',
    'background:var(--bg2,#1a1e26);border:1px solid rgba(255,255,255,.1);',
    'border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.55);',
    'min-width:196px;overflow:hidden;animation:lfFadeIn .1s ease;',
    'font-family:Outfit,sans-serif}',
    '.lf-ctx-item{padding:9px 14px;cursor:pointer;font-size:.8rem;',
    'color:var(--tx,#eee);display:flex;align-items:center;gap:9px;',
    'white-space:nowrap;border:none;background:none;width:100%;text-align:left}',
    '.lf-ctx-item:hover{background:rgba(195,154,45,.14);color:var(--al,#c39a2d)}',
    '.lf-ctx-sep{height:1px;background:rgba(255,255,255,.07);margin:3px 0}',
    '.lf-ctx-hdr{padding:7px 14px 4px;font-size:.66rem;color:var(--mu,#888);',
    'text-transform:uppercase;letter-spacing:.05em;user-select:none}',

    /* ── Chat: melhorar aparência de vídeo/PDF ── */
    'a.chat-msg-file.lf-video-link::before{content:"▶ ";opacity:.7}',
    'a.chat-msg-file.lf-pdf-link::before{content:"📄 ";opacity:.9}',
    'img.chat-msg-img{cursor:zoom-in!important;transition:opacity .15s}',
    'img.chat-msg-img:hover{opacity:.88}'
  ].join('');
  document.head.appendChild(_style);

  /* ═══════════════════════════════════════════
     1. MEDIA OVERLAY — lightbox / player inline
  ═══════════════════════════════════════════ */
  var _ov = null;

  function _openMedia(src, type, name) {
    _closeMedia();
    var ov = document.createElement('div');
    ov.id = 'lf-ov';
    ov.addEventListener('click', function (e) { if (e.target === ov) _closeMedia(); });

    /* Botão fechar */
    var closeBtn = document.createElement('button');
    closeBtn.id = 'lf-ov-close';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'Fechar  (Esc)';
    closeBtn.addEventListener('click', _closeMedia);
    ov.appendChild(closeBtn);

    /* Conteúdo */
    var content;
    if (type === 'img') {
      content = document.createElement('img');
      content.src = src;
      content.alt = name || '';
    } else if (type === 'video') {
      content = document.createElement('video');
      content.src = src;
      content.controls = true;
      content.setAttribute('playsinline', '');
      content.setAttribute('preload', 'metadata');
    } else if (type === 'pdf') {
      content = document.createElement('iframe');
      content.src = src + '#toolbar=1&view=FitH';
      content.title = name || 'PDF';
    }
    if (content) ov.appendChild(content);

    /* Barra inferior */
    var bar = document.createElement('div');
    bar.id = 'lf-ov-bar';

    if (src && !src.startsWith('data:')) {
      var btnNova = document.createElement('button');
      btnNova.className = 'lf-ov-btn';
      btnNova.innerHTML = '🗗 Abrir em nova guia';
      btnNova.addEventListener('click', function (e) {
        e.stopPropagation();
        window.open(src, '_blank');
      });
      bar.appendChild(btnNova);
    }

    if (name) {
      var btnDl = document.createElement('button');
      btnDl.className = 'lf-ov-btn';
      btnDl.innerHTML = '⬇ Baixar';
      btnDl.title = name;
      btnDl.addEventListener('click', function (e) {
        e.stopPropagation();
        var a = document.createElement('a');
        a.href = src; a.download = name;
        if (!src.startsWith('data:')) a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
      bar.appendChild(btnDl);
    }

    ov.appendChild(bar);
    document.body.appendChild(ov);
    _ov = ov;
    document.addEventListener('keydown', _ovKey);
  }

  function _closeMedia() {
    if (_ov) { _ov.remove(); _ov = null; }
    document.removeEventListener('keydown', _ovKey);
  }

  function _ovKey(e) { if (e.key === 'Escape') _closeMedia(); }

  /* ═══════════════════════════════════════════
     2. CHAT — melhorar mídia nas bolhas
  ═══════════════════════════════════════════ */
  var VID_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv', '3gp'];
  var PDF_EXTS = ['pdf'];

  function _fileExt(s) { return ((s || '').split('.').pop() || '').toLowerCase().split('?')[0]; }

  function _enhanceImgs(root) {
    root.querySelectorAll('img.chat-msg-img:not([data-lf-ok])').forEach(function (img) {
      img.dataset.lfOk = '1';
      img.addEventListener('click', function (e) {
        e.stopPropagation();
        _openMedia(img.src, 'img', img.alt || 'imagem');
      });
    });
  }

  function _enhanceFiles(root) {
    root.querySelectorAll('a.chat-msg-file:not([data-lf-ok])').forEach(function (link) {
      link.dataset.lfOk = '1';
      var href = link.href || '';
      var rawName = (link.textContent || '').replace(/^[📎▶📄]\s*/u, '').replace(/\s*[↗👁]$/, '').trim();
      /* tenta extrair extensão pelo nome do arquivo ou pela URL */
      var ext = _fileExt(rawName) || _fileExt(href);

      if (VID_EXTS.indexOf(ext) >= 0 && href && !href.startsWith('data:')) {
        link.classList.add('lf-video-link');
        link.title = '▶ Clique para reproduzir';
        link.addEventListener('click', function (e) {
          e.preventDefault();
          _openMedia(href, 'video', rawName || 'vídeo');
        });
      } else if (PDF_EXTS.indexOf(ext) >= 0 && href && !href.startsWith('data:')) {
        link.classList.add('lf-pdf-link');
        link.title = '📄 Clique para visualizar';
        link.addEventListener('click', function (e) {
          e.preventDefault();
          _openMedia(href, 'pdf', rawName || 'documento.pdf');
        });
      }
    });
  }

  function _enhanceChatContainer(container) {
    if (!container) return;
    _enhanceImgs(container);
    _enhanceFiles(container);
  }

  /* Observer no container de mensagens */
  var _msgObs = null;
  function _startMsgObserver() {
    var el = document.getElementById('chat-msgs');
    if (!el) return;
    if (_msgObs) { _msgObs.disconnect(); }
    _enhanceChatContainer(el);
    _msgObs = new MutationObserver(function () { _enhanceChatContainer(el); });
    _msgObs.observe(el, { childList: true, subtree: true });
  }

  /* Ativa o observer quando a página de chat fica visível */
  var pgChat = document.getElementById('pg-chat');
  if (pgChat) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'attributes' && m.target.classList.contains('on')) {
          setTimeout(_startMsgObserver, 350);
        }
      });
    }).observe(pgChat, { attributes: true, attributeFilter: ['class'] });
    if (pgChat.classList.contains('on')) setTimeout(_startMsgObserver, 350);
  }

  /* Wrap de initChatPage para garantir o observer após cada abertura */
  if (typeof window.initChatPage === 'function' && !window.__LF_CHAT_MEDIA_WRAP__) {
    window.__LF_CHAT_MEDIA_WRAP__ = true;
    var _origInitChat = window.initChatPage;
    window.initChatPage = function () {
      var r = _origInitChat.apply(this, arguments);
      setTimeout(_startMsgObserver, 400);
      return r;
    };
  }

  /* ═══════════════════════════════════════════
     3. MENU BOTÃO DIREITO — "Abrir em nova guia"
  ═══════════════════════════════════════════ */

  /* Mapa de texto → chave de página (goPage / openInNewTab) */
  var _PAGE_TEXT = {
    'bingo': 'dash', 'dashboard': 'dash',
    'analytics': 'anal',
    'adm': 'adm',
    'leads': 'leads',
    'neg': 'negocios',         /* "Negócios" e variações */
    'agenda': 'agenda',
    'dicion': 'dic',
    'config': 'config',
    'time': 'time',
    'papo': 'chat', 'chat': 'chat',
    'documentos': 'docs', 'docs': 'docs',
    'estrutura': 'estrutura',
    'anal': 'anal'
  };

  var _PAGE_DATA = {          /* data-page → chave real */
    'dash': 'dash', 'crm': 'leads',
    'agenda': 'agenda', 'chat': 'chat',
    'docs': 'docs', 'leads': 'leads',
    'negocios': 'negocios', 'anal': 'anal',
    'adm': 'adm', 'time': 'time',
    'config': 'config', 'estrutura': 'estrutura', 'dic': 'dic'
  };

  function _pageFromEl(el) {
    /* 1. data-page (mobile nav) */
    var dp = el.getAttribute('data-page');
    if (dp && _PAGE_DATA[dp]) return _PAGE_DATA[dp];
    /* 2. onclick="goPage('...')" */
    var oc = el.getAttribute('onclick') || '';
    var m = oc.match(/goPage\s*\(\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
    /* 3. texto do botão */
    var txt = (el.textContent || '').trim().toLowerCase().replace(/[^a-záéíóúãõâêôçü]/gi, '');
    for (var k in _PAGE_TEXT) {
      if (txt.indexOf(k) === 0 || txt.indexOf(k) >= 0) return _PAGE_TEXT[k];
    }
    return null;
  }

  function _doOpenNewTab(page) {
    if (typeof openInNewTab === 'function') {
      openInNewTab(page);
    } else {
      window.open(
        window.location.origin + window.location.pathname + '?page=' + page,
        '_blank'
      );
    }
  }

  /* ── menu flutuante ── */
  var _ctx = null;

  function _closeCtx() {
    if (_ctx) { _ctx.remove(); _ctx = null; }
  }

  function _showCtx(x, y, items) {
    _closeCtx();
    var menu = document.createElement('div');
    menu.id = 'lf-ctx';

    items.forEach(function (item) {
      if (item === '-') {
        var sep = document.createElement('div');
        sep.className = 'lf-ctx-sep';
        menu.appendChild(sep);
      } else if (item.label === undefined) {
        /* cabeçalho */
        var hdr = document.createElement('div');
        hdr.className = 'lf-ctx-hdr';
        hdr.textContent = item.header;
        menu.appendChild(hdr);
      } else {
        var btn = document.createElement('button');
        btn.className = 'lf-ctx-item';
        btn.innerHTML = '<span style="font-size:.9em;width:18px;text-align:center">' + item.icon + '</span> ' + item.label;
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          _closeCtx();
          item.fn();
        });
        menu.appendChild(btn);
      }
    });

    document.body.appendChild(menu);
    _ctx = menu;

    /* posicionar dentro da viewport */
    var mw = menu.offsetWidth || 210, mh = menu.offsetHeight || 100;
    var px = Math.min(x, window.innerWidth - mw - 6);
    var py = Math.min(y, window.innerHeight - mh - 6);
    menu.style.left = Math.max(4, px) + 'px';
    menu.style.top  = Math.max(4, py) + 'px';

    /* fechar ao clicar fora ou pressionar Esc */
    setTimeout(function () {
      document.addEventListener('click', _closeCtx, { once: true });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') _closeCtx();
      }, { once: true });
    }, 20);
  }

  /* ── listener principal (capture) ── */
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;

    /* ── Nav tab desktop (.nt) ── */
    var navEl = t.closest('.nt');
    if (navEl && !navEl.closest('#lf-ctx') && !navEl.closest('#kb-ctx')) {
      var page = _pageFromEl(navEl);
      if (page) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var lbl = (navEl.textContent || '').trim().slice(0, 22);
        _showCtx(e.clientX, e.clientY, [
          { header: lbl },
          { icon: '▶', label: 'Ir para esta página', fn: function () { if (typeof goPage === 'function') goPage(page); } },
          '-',
          { icon: '🗗', label: 'Abrir em nova guia (mais lento)', fn: function () { _doOpenNewTab(page); } }
        ]);
        return;
      }
    }

    /* ── Nav mobile (.mbn-item) ── */
    var mbnEl = t.closest('.mbn-item');
    if (mbnEl) {
      var dp = mbnEl.getAttribute('data-page');
      if (dp && dp !== 'menu') {
        var page2 = _PAGE_DATA[dp] || dp;
        e.preventDefault();
        e.stopImmediatePropagation();
        _showCtx(e.clientX, e.clientY, [
          { icon: '▶', label: 'Ir para esta página', fn: function () { if (typeof goPage === 'function') goPage(page2); } },
          '-',
          { icon: '🗗', label: 'Abrir em nova guia (mais lento)', fn: function () { _doOpenNewTab(page2); } }
        ]);
        return;
      }
    }

    /* ── Imagem do chat ── */
    var imgEl = t.tagName === 'IMG' && t.classList.contains('chat-msg-img') ? t : null;
    if (imgEl) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var imgSrc = imgEl.src;
      var imgName = imgEl.alt || 'imagem';
      _showCtx(e.clientX, e.clientY, [
        { icon: '🔍', label: 'Ampliar imagem',      fn: function () { _openMedia(imgSrc, 'img', imgName); } },
        { icon: '🗗', label: 'Abrir em nova guia',  fn: function () { window.open(imgSrc, '_blank'); } },
        { icon: '⬇', label: 'Salvar imagem',        fn: function () {
          var a = document.createElement('a'); a.href = imgSrc; a.download = imgName;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }}
      ]);
      return;
    }

    /* ── Link de arquivo do chat (.chat-msg-file) ── */
    var fileLink = t.closest('a.chat-msg-file');
    if (fileLink) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var fhref = fileLink.href;
      var fname = (fileLink.textContent || '').replace(/^[📎▶📄]\s*/u, '').replace(/\s*[↗👁]$/, '').trim();
      var fext  = _fileExt(fname) || _fileExt(fhref);
      var isVid = VID_EXTS.indexOf(fext) >= 0;
      var isPdf = PDF_EXTS.indexOf(fext) >= 0;
      var items2 = [];
      if (isVid) items2.push({ icon: '▶', label: 'Reproduzir vídeo', fn: function () { _openMedia(fhref, 'video', fname); } });
      if (isPdf) items2.push({ icon: '📄', label: 'Visualizar PDF',   fn: function () { _openMedia(fhref, 'pdf',   fname); } });
      items2.push({ icon: '🗗', label: 'Abrir em nova guia', fn: function () { window.open(fhref, '_blank'); } });
      items2.push({ icon: '⬇', label: 'Baixar arquivo',      fn: function () {
        var a = document.createElement('a'); a.href = fhref; a.download = fname || 'arquivo';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }});
      _showCtx(e.clientX, e.clientY, items2);
      return;
    }

    /* ── Kanban card — adiciona "nova guia" sem cancelar comportamento existente ──
       Não usamos e.preventDefault() aqui para que o handler original do card
       (editKBFromDet / openKBDet) continue funcionando normalmente.
       Apenas registramos qual board está ativo para sugerir nova guia. */
    var kbCard = t.closest('.kb-card') || t.closest('.mb-card');
    if (kbCard) {
      var kbBoard = kbCard.dataset.board;
      if (!kbBoard) {
        /* tenta inferir pelo id da página ativa */
        var pgLeads = document.getElementById('pg-leads');
        var pgNeg   = document.getElementById('pg-negocios');
        if (pgLeads && pgLeads.classList.contains('on'))   kbBoard = 'leads';
        else if (pgNeg && pgNeg.classList.contains('on'))  kbBoard = 'negocios';
      }
      if (kbBoard) {
        /* Não chamamos preventDefault — deixamos o handler nativo do kanban.js agir.
           Em vez disso, injetamos um botão "Nova guia" no menu contextual nativo #kb-ctx
           após ele aparecer (250 ms é suficiente pois o handler é síncrono). */
        setTimeout(function () {
          var kbCtx = document.getElementById('kb-ctx');
          if (!kbCtx || kbCtx.style.display === 'none') return;
          if (kbCtx.querySelector('.lf-kb-newtab')) return; /* já adicionado */
          var sep = document.createElement('div');
          sep.style.cssText = 'height:1px;background:rgba(255,255,255,.08);margin:4px 0';
          var btn = document.createElement('button');
          btn.className = 'lf-kb-newtab';
          /* Reutiliza o estilo dos outros botões do menu nativo */
          btn.style.cssText = 'display:block;width:100%;padding:9px 14px;border:none;background:none;' +
            'color:var(--tx,#eee);font-size:.8rem;cursor:pointer;text-align:left;font-family:inherit';
          btn.innerHTML = '🗗 Abrir aba em nova guia';
          btn.addEventListener('mouseover', function () { btn.style.background = 'rgba(195,154,45,.13)'; btn.style.color = 'var(--al,#c39a2d)'; });
          btn.addEventListener('mouseout',  function () { btn.style.background = 'none'; btn.style.color = 'var(--tx,#eee)'; });
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            kbCtx.style.display = 'none';
            _doOpenNewTab(kbBoard);
          });
          kbCtx.appendChild(sep);
          kbCtx.appendChild(btn);
        }, 60);
      }
    }

  }, true /* capture phase */);

})();
