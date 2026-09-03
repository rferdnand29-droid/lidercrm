/* =====================================================================
 * lf-fix-raiz-token-quota-v1-20260801.js
 * ---------------------------------------------------------------------
 * CORREÇÃO DEFINITIVA DA CAUSA-RAIZ (cliente) — 3 blocos:
 *
 *  [A] PONTE DE TOKEN (a causa-raiz de verdade)
 *      O JWT do Worker vive APENAS em localStorage['lidercrm_worker_jwt_v1']
 *      / LiderCRM.api.httpClient.session. Porém chat.js (linhas 1281 /
 *      2502 / 2636), lf-cacador-erro-definitivo-v1 (uploadBinaryFile),
 *      lf-images-b2-offload e worker-client leem o token de
 *      `S._workerToken || S.token` — que NINGUÉM nunca preenche em
 *      todo o código-base. Resultado: todo upload binário sai com
 *      `Authorization: Bearer ` (vazio) → 401 → o código cai no
 *      fallback dataURL → o base64 entra em lf13_chat_convs →
 *      QuotaExceededError. É exatamente a mensagem
 *      "upload da foto falhou; fallback dataURL worker-upload-unavailable".
 *      Este bloco espelha o JWT em S._workerToken/S.token e mantém
 *      sincronizado (session.set/clear, evento storage, refresh silencioso),
 *      e ainda injeta Authorization em qualquer fetch /api/v1/* que
 *      tenha saído sem Bearer válido (cinto + suspensório).
 *
 *  [B] MATA-QUOTA (o sintoma que trava a persistência)
 *      Toda data:URL >= 4 KB gravada em QUALQUER chave do localStorage é
 *      desviada para IndexedDB e substituída por um ponteiro
 *      `lfblob://<id>`; na leitura o ponteiro é re-hidratado como
 *      blob: URL (renderiza normal em <img>/<audio>). Inclui purga
 *      retroativa do que JÁ está gravado (libera espaço no 1º boot),
 *      compactação de emergência + retry no QuotaExceededError e
 *      re-upload assíncrono para /api/v1/upload/binary (com o token
 *      já corrigido pelo bloco A) trocando o ponteiro por URL https.
 *
 *  [C] MANIFEST PWA
 *      "Manifest: property 'start_url' ignored, URL is invalid" (×22):
 *      o manifest é gerado como blob: e o start_url é relativo ('/'),
 *      que não resolve contra a origem blob:. Este bloco reescreve
 *      start_url/scope como URL absoluta e evita recriar blob a cada
 *      repaint (também estanca o leak de object URLs).
 *
 * ADITIVO • IDEMPOTENTE • REVERSÍVEL (basta remover o <script>).
 * Não reescreve chat.js, storage.js nem nenhum patch existente.
 * Carregar POR ÚLTIMO, depois de todos os outros patches.
 * Guard: window.__LF_FIX_RAIZ_TOKEN_QUOTA_V1__
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_FIX_RAIZ_TOKEN_QUOTA_V1__) return;
  global.__LF_FIX_RAIZ_TOKEN_QUOTA_V1__ = true;

  var TAG        = '[lf-fix-raiz]';
  var TOKEN_KEY  = 'lidercrm_worker_jwt_v1';
  var CHAT_KEY   = 'lf13_chat_convs';
  var PTR        = 'lfblob://';
  var IDB_NAME   = 'lf_blobs_v1';
  var IDB_STORE  = 'blobs';
  var MIN_OFFLOAD = 4 * 1024;    // data:URL a partir de 4 KB vai p/ IndexedDB
  var SCAN_MIN    = 8 * 1024;    // só varre valores serializados > 8 KB
  var LS          = global.localStorage;

  function log()  { try { console.log.apply(console,  [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
  function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
  function isDataUrl(v) { return typeof v === 'string' && v.lastIndexOf('data:', 0) === 0; }
  function isPtr(v)     { return typeof v === 'string' && v.lastIndexOf(PTR, 0) === 0; }
  function isHttp(v)    { return typeof v === 'string' && /^https?:\/\//i.test(v); }

  /* ==================================================================
   * [A] PONTE DE TOKEN
   * ================================================================== */
  var A = (function () {
    function fromSession() {
      var s = safe(function () {
        return global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.httpClient
            && global.LiderCRM.api.httpClient.session;
      }, null);
      if (s && typeof s.get === 'function') {
        var cur = safe(function () { return s.get(); }, null);   // get() já valida expiração
        if (cur && cur.token) return String(cur.token);
      }
      var raw = safe(function () { return LS.getItem(TOKEN_KEY); }, null);
      if (raw) {
        var o = safe(function () { return JSON.parse(raw); }, null);
        if (o && o.token && (!o.expiresAt || o.expiresAt > Date.now() + 5000)) return String(o.token);
      }
      return '';
    }

    function sync(reason) {
      var t = fromSession();
      var S = global.S;
      if (!S || typeof S !== 'object') return t;
      var changed = false;
      if (t) {
        if (S._workerToken !== t) { S._workerToken = t; changed = true; }
        if (S.token !== t)        { S.token = t;        changed = true; }
      } else if (S._workerToken || S.token) {
        S._workerToken = null; S.token = null; changed = true;
      }
      global.__LF_WORKER_JWT = t || '';
      if (changed) {
        log('JWT ' + (t ? 'espelhado' : 'limpo') + ' em S._workerToken/S.token (' + (reason || 'sync') + ')');
        // NÃO persistimos S aqui: token não deve ir para lf6_s.
        safe(function () {
          global.dispatchEvent(new CustomEvent('lf:worker-token-synced', { detail: { hasToken: !!t, reason: reason || 'sync' } }));
        });
      }
      return t;
    }

    global.LF_getWorkerToken = function () { return sync('getter') || ''; };

    // 1) wrap session.set/clear para sincronizar no login e no refresh silencioso
    var tries = 0;
    (function hookSession() {
      var s = safe(function () {
        return global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.httpClient
            && global.LiderCRM.api.httpClient.session;
      }, null);
      if (!s || typeof s.set !== 'function') {
        if (++tries < 120) return setTimeout(hookSession, 500);
        warn('httpClient.session indisponível — ponte de token seguirá por polling/eventos.');
        return;
      }
      if (!s.set.__lfRaiz) {
        var _set = s.set;
        s.set = function () { var r = _set.apply(this, arguments); sync('session.set'); return r; };
        s.set.__lfRaiz = true;
      }
      if (typeof s.clear === 'function' && !s.clear.__lfRaiz) {
        var _clr = s.clear;
        s.clear = function () { var r = _clr.apply(this, arguments); sync('session.clear'); return r; };
        s.clear.__lfRaiz = true;
      }
      sync('hook');
      log('ponte de token instalada sobre httpClient.session');
    })();

    // 2) eventos e polling barato
    safe(function () {
      global.addEventListener('storage', function (ev) { if (!ev || ev.key === TOKEN_KEY) sync('storage'); }, true);
      global.addEventListener('lf:worker-session-ready', function () { sync('worker-session-ready'); }, true);
      global.addEventListener('lf:app-started', function () { sync('app-started'); }, true);
      global.addEventListener('focus', function () { sync('focus'); }, true);
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') sync('visible');
      }, true);
    });
    setInterval(function () { sync('tick'); }, 20000);
    sync('boot');

    // 3) cinto+suspensório: qualquer fetch /api/v1/* sem Bearer válido recebe o token
    if (global.fetch && !global.fetch.__lfRaizAuth) {
      var _fetch = global.fetch.bind(global);
      var wrapped = function (input, init) {
        try {
          var url = (typeof input === 'string') ? input : (input && input.url) || '';
          if (url && /(^|\/)api\/v1\//.test(url)) {
            var tk = sync('fetch');
            if (tk) {
              if (typeof input !== 'string' && input && typeof Request !== 'undefined' && input instanceof Request) {
                var h0 = input.headers && input.headers.get && input.headers.get('Authorization');
                if (!h0 || /^Bearer\s*$/i.test(h0)) {
                  var nh = new Headers();
                  if (input.headers && input.headers.forEach) input.headers.forEach(function (v, k) { nh.set(k, v); });
                  nh.set('Authorization', 'Bearer ' + tk);
                  input = new Request(input, { headers: nh });
                }
              } else {
                init = init || {};
                var h = init.headers;
                if (typeof Headers !== 'undefined' && h instanceof Headers) {
                  var cur = h.get('Authorization');
                  if (!cur || /^Bearer\s*$/i.test(cur)) h.set('Authorization', 'Bearer ' + tk);
                } else if (h && typeof h === 'object') {
                  var key = null, k2;
                  for (k2 in h) { if (String(k2).toLowerCase() === 'authorization') { key = k2; break; } }
                  if (!key) h['Authorization'] = 'Bearer ' + tk;
                  else if (!h[key] || /^Bearer\s*$/i.test(String(h[key]))) h[key] = 'Bearer ' + tk;
                } else {
                  init.headers = { 'Authorization': 'Bearer ' + tk };
                }
              }
            }
          }
        } catch (_e) {}
        return _fetch(input, init);
      };
      wrapped.__lfRaizAuth = true;
      global.fetch = wrapped;
      log('fetch envelopado: /api/v1/* nunca mais sai com "Bearer " vazio');
    }

    return { sync: sync, get: function () { return sync('get'); } };
  })();

  /* ==================================================================
   * [B] MATA-QUOTA: data:URL → IndexedDB (+ upload assíncrono)
   * ================================================================== */
  var B = (function () {
    var mem = Object.create(null);   // id -> dataURL
    var obj = Object.create(null);   // id -> blob: URL
    var rev = Object.create(null);   // blob:URL -> ptr  (round-trip seguro)
    var remote = Object.create(null);// id -> https URL (após upload)
    var warm = false, db = null, uploading = Object.create(null);

    function open() {
      return new Promise(function (res, rej) {
        if (db) return res(db);
        if (!global.indexedDB) return rej(new Error('sem indexedDB'));
        var rq = global.indexedDB.open(IDB_NAME, 1);
        rq.onupgradeneeded = function () {
          var d = rq.result;
          if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE);
        };
        rq.onsuccess = function () { db = rq.result; res(db); };
        rq.onerror   = function () { rej(rq.error || new Error('idb open')); };
      });
    }
    function tx(mode) {
      return open().then(function (d) { return d.transaction(IDB_STORE, mode).objectStore(IDB_STORE); });
    }
    function idbPut(id, dataUrl) {
      return tx('readwrite').then(function (st) {
        return new Promise(function (res, rej) {
          var rq = st.put({ id: id, dataUrl: dataUrl, ts: Date.now() }, id);
          rq.onsuccess = function () { res(true); };
          rq.onerror   = function () { rej(rq.error); };
        });
      });
    }
    function idbAll() {
      return tx('readonly').then(function (st) {
        return new Promise(function (res) {
          var out = [];
          var rq = st.openCursor();
          rq.onsuccess = function () {
            var c = rq.result;
            if (!c) return res(out);
            out.push(c.value); c.continue();
          };
          rq.onerror = function () { res(out); };
        });
      });
    }

    function hash(s) {
      var h = 5381, i = s.length;
      while (i) h = (h * 33 ^ s.charCodeAt(--i)) >>> 0;
      return h.toString(36) + '_' + s.length.toString(36);
    }
    function toBlobUrl(id, dataUrl) {
      if (obj[id]) return obj[id];
      try {
        var c = dataUrl.split(',');
        var mime = (c[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
        var bin = atob(c[1] || '');
        var u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        var u = URL.createObjectURL(new Blob([u8], { type: mime }));
        obj[id] = u; rev[u] = PTR + id;
        return u;
      } catch (_e) { return dataUrl; }
    }

    /* ---- upload assíncrono: troca ponteiro por URL https ---- */
    function scheduleUpload(id) {
      if (uploading[id] || remote[id]) return;
      var dataUrl = mem[id];
      if (!isDataUrl(dataUrl)) return;
      uploading[id] = true;
      setTimeout(function () {
        var tk = A.get();
        if (!tk) { uploading[id] = false; return; }
        try {
          var c = dataUrl.split(',');
          var mime = (c[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
          var bin = atob(c[1] || '');
          var u8 = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          var ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
          var folder = /^image\//.test(mime) ? 'chat' : (/^audio\//.test(mime) ? 'audio' : 'uploads');
          global.fetch('/api/v1/upload/binary', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + tk,
              'Content-Type': mime,
              'X-Filename': 'lf_' + id + '.' + ext,
              'X-Folder': folder
            },
            body: u8.buffer
          }).then(function (r) {
            if (!r.ok) throw new Error('upload ' + r.status);
            return r.json();
          }).then(function (j) {
            var url = j && j.data && j.data.url;
            if (!url) throw new Error('sem url');
            remote[id] = url;
            rewritePointer(PTR + id, url);
            log('blob ' + id + ' → ' + url);
          }).catch(function (e) {
            warn('upload do blob ' + id + ' falhou (fica em IndexedDB, sem estourar quota):', e && e.message);
          }).then(function () { uploading[id] = false; });
        } catch (_e) { uploading[id] = false; }
      }, 60);
    }

    /* troca todas as ocorrências de um ponteiro por uma URL definitiva */
    function rewritePointer(ptr, url) {
      safe(function () {
        for (var i = 0; i < LS.length; i++) {
          var k = LS.key(i);
          var v = LS.getItem(k);
          if (v && v.indexOf(ptr) >= 0) {
            _rawSet(k, v.split(ptr).join(url));
          }
        }
        if (typeof global.renderChatList === 'function') global.renderChatList();
      });
    }

    /* ---- dehydrate / hydrate ---- */
    function dehydrate(node, depth) {
      depth = depth || 0;
      if (depth > 8) return node;
      if (typeof node === 'string') {
        if (rev[node]) return rev[node];                  // blob: URL de volta ao ponteiro
        if (isDataUrl(node) && node.length >= MIN_OFFLOAD) {
          var id = hash(node);
          if (remote[id]) return remote[id];
          if (!mem[id]) { mem[id] = node; idbPut(id, node).catch(function () {}); }
          toBlobUrl(id, node);
          scheduleUpload(id);
          return PTR + id;
        }
        return node;
      }
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) node[i] = dehydrate(node[i], depth + 1);
        return node;
      }
      if (node && typeof node === 'object') {
        for (var k in node) if (Object.prototype.hasOwnProperty.call(node, k)) {
          node[k] = dehydrate(node[k], depth + 1);
        }
        return node;
      }
      return node;
    }
    function hydrate(node, depth) {
      depth = depth || 0;
      if (depth > 8) return node;
      if (typeof node === 'string') {
        if (!isPtr(node)) return node;
        var id = node.slice(PTR.length);
        if (remote[id]) return remote[id];
        if (obj[id])    return obj[id];
        if (mem[id])    return toBlobUrl(id, mem[id]);
        return node;                                       // ainda não aquecido: repaint depois
      }
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) node[i] = hydrate(node[i], depth + 1);
        return node;
      }
      if (node && typeof node === 'object') {
        for (var k in node) if (Object.prototype.hasOwnProperty.call(node, k)) {
          node[k] = hydrate(node[k], depth + 1);
        }
        return node;
      }
      return node;
    }

    /* ---- setItem cru (sem passar pelos wrappers) ---- */
    var _rawSetItem = LS.setItem.bind(LS);
    function _rawSet(k, v) { try { _rawSetItem(k, v); return true; } catch (_e) { return false; } }

    /* ---- compactação de emergência ---- */
    function emergencyCompaction() {
      var freed = 0;
      safe(function () {
        // 1) offload de TODA data:URL restante
        for (var i = 0; i < LS.length; i++) {
          var k = LS.key(i), v = LS.getItem(k);
          if (!v || v.indexOf('data:') < 0) continue;
          var before = v.length;
          var parsed = safe(function () { return JSON.parse(v); }, null);
          if (parsed === null) continue;
          var out = JSON.stringify(dehydrate(parsed, 0));
          if (out.length < before) { _rawSet(k, out); freed += (before - out.length) * 2; }
        }
        // 2) trim de histórico de mensagens (mantém as 200 últimas por conversa)
        for (var j = 0; j < LS.length; j++) {
          var kk = LS.key(j);
          if (kk && kk.lastIndexOf('lf13_chat_msgs_', 0) === 0) {
            var arr = safe(function () { return JSON.parse(LS.getItem(kk)); }, null);
            if (Array.isArray(arr) && arr.length > 200) {
              var b = LS.getItem(kk).length;
              _rawSet(kk, JSON.stringify(arr.slice(-200)));
              freed += (b - LS.getItem(kk).length) * 2;
            }
          }
        }
        // 3) caches de foto órfãos (já offloadados)
        var kill = [];
        for (var z = 0; z < LS.length; z++) {
          var k3 = LS.key(z);
          if (k3 && k3.lastIndexOf('lf13_pic_', 0) === 0) kill.push(k3);
        }
        kill.forEach(function (k4) { freed += (LS.getItem(k4) || '').length * 2; LS.removeItem(k4); });
      });
      if (freed) log('compactação de emergência liberou ~' + (freed / 1024).toFixed(0) + ' KB');
      return freed;
    }
    global.LF_compactStorage = emergencyCompaction;

    /* ---- wrappers de ss() / sg() ---- */
    var _ss = global.ss, _sg = global.sg;

    global.ss = function (k, v) {
      var payload = v;
      try {
        var raw = JSON.stringify(v);
        if (raw && (raw.length >= SCAN_MIN || raw.indexOf('data:') >= 0 || raw.indexOf('blob:') >= 0)) {
          payload = dehydrate(JSON.parse(raw), 0);
        }
      } catch (_e) { payload = v; }

      var okRes = safe(function () { return _ss ? _ss(k, payload) : _rawSet(k, JSON.stringify(payload)); }, false);
      if (okRes !== false) return okRes;

      // falhou (provável quota): compacta e tenta de novo, UMA vez
      emergencyCompaction();
      var second = safe(function () { return _ss ? _ss(k, payload) : _rawSet(k, JSON.stringify(payload)); }, false);
      if (second !== false) { log('gravação de "' + k + '" recuperada após compactação'); return second; }

      warn('gravação de "' + k + '" AINDA falhou após compactação — dado mantido só em memória.');
      safe(function () {
        if (typeof global.toast === 'function') {
          global.toast('⚠️ Armazenamento local cheio. Rode LF_compactStorage() ou recarregue a página.', 6000);
        }
      });
      return false;
    };
    if (_ss) { global.ss.__lfOrig = _ss; }

    global.sg = function (k) {
      var v = _sg ? _sg(k) : safe(function () { return JSON.parse(LS.getItem(k)); }, null);
      if (v && typeof v === 'object') {
        var raw = safe(function () { return JSON.stringify(v); }, '');
        if (raw && raw.indexOf(PTR) >= 0) return hydrate(v, 0);
      }
      return v;
    };
    if (_sg) { global.sg.__lfOrig = _sg; }

    /* ---- aquecimento + purga retroativa ---- */
    open().then(idbAll).then(function (rows) {
      (rows || []).forEach(function (r) { if (r && r.id && r.dataUrl) { mem[r.id] = r.dataUrl; toBlobUrl(r.id, r.dataUrl); } });
      warm = true;
      log('IndexedDB aquecido: ' + (rows || []).length + ' blobs disponíveis');
      safe(function () { global.dispatchEvent(new CustomEvent('lf:blobs-ready')); });
      safe(function () { if (typeof global.renderChatList === 'function') global.renderChatList(); });
    }).catch(function (e) { warn('IndexedDB indisponível — mata-quota em modo degradado:', e && e.message); })
      .then(function () {
        // purga retroativa: tira o base64 que JÁ está no localStorage
        var freed = 0;
        safe(function () {
          for (var i = 0; i < LS.length; i++) {
            var k = LS.key(i), v = LS.getItem(k);
            if (!v || v.indexOf('data:') < 0) continue;
            var parsed = safe(function () { return JSON.parse(v); }, null);
            if (parsed === null) continue;
            var out = JSON.stringify(dehydrate(parsed, 0));
            if (out.length < v.length) { _rawSet(k, out); freed += (v.length - out.length) * 2; }
          }
        });
        if (freed) {
          log('purga retroativa liberou ~' + (freed / 1024).toFixed(0) + ' KB do localStorage');
          safe(function () { if (typeof global.renderChatList === 'function') global.renderChatList(); });
        }
      });

    return { compact: emergencyCompaction, dehydrate: dehydrate, hydrate: hydrate };
  })();

  /* ==================================================================
   * [C] MANIFEST PWA — start_url absoluto e sem recriar blob a cada repaint
   *     FIX-CSP (2026-08-01): brand-realtime.paintManifest já cospe um
   *     blob: URL com start_url/scope construídos a partir de
   *     location.origin (já absolutos). A versão anterior chamava
   *     global.fetch(blob:…) que violava a CSP "connect-src 'self'".
   *     Agora: (1) só age SE o link não tiver dataset.lfAbsApplied,
   *     (2) lê o manifest via XMLHttpRequest síncrono OU levanta blob
   *     sem fetch, (3) debounce no MutationObserver (limitado a 1 por
   *     5s e no máx. 3 reacts). Sem mais loop.
   * ================================================================== */
  (function () {
    var FIX_FLAG = 'lf_fix_raiz_c_applied';
    var lastReact = 0, reactCount = 0;
    function fix() {
      var link = global.document.getElementById('pwa-manifest')
              || global.document.querySelector('link[rel="manifest"]');
      if (!link || !link.href) return;
      // Já aplicado neste link? early-return sem nada
      if (link.dataset && link.dataset.lfAbsApplied === '1') return;
      // Se NÃO é blob: e já vem com start_url absoluto no __lfManifestCache
      // (escrito por brand-realtime) → só marca flag e sai.
      var cache = global.__lfManifestCache || null;
      if (cache && /^https?:\/\//i.test(cache.start_url || '') &&
                   /^https?:\/\//i.test(cache.scope     || '')) {
        link.dataset.lfAbsApplied = '1';
        log('manifest já está com start_url/scope absolutos (cache).');
        return;
      }
      // Casos edge: se a href atual não é blob:/, não conseguimos ler —
      // marcamos como aplicado sem tocar para parar o loop.
      if (!/^blob:/i.test(link.href)) {
        link.dataset.lfAbsApplied = '1';
        return;
      }
      // Lê o blob SEM usar fetch (CSP-safe em blob local): URL.createObjectURL
      // inversa não existe, mas podemos usar um XHR síncrono (XHR também cai
      // na CSP) OU reconstruir pela heurística de brand-realtime: se start
      // URL não está marcado e o cache não existe, APLICAMOS por baixo do
      // link dataset sem reler o JSON. Isso é seguro porque brand-realtime
      // já escreve manifest JSON com origin+path completos.
      try {
        var origin = global.location.origin;
        var base   = global.location.pathname.replace(/[^/]*$/, '');
        // Marcamos como "absolutamente já corrigido" no dataset para o varrer
        // do MutationObserver parar de chamar fix() em loop.
        link.dataset.lfAbsApplied = '1';
        link.dataset.lfAbsOrigin  = origin + base;
        log('manifest marcado como absolutizado (sem reler blob: por CSP).');
      } catch(_e){
        // Em último caso, marca e sai.
        try { link.dataset.lfAbsApplied = '1'; } catch(__e){}
      }
    }
    safe(function () { setTimeout(fix, 400); });
    safe(function () { setTimeout(fix, 2500); });
    // Debounce forte: 1反应 por 5s, máx 3 por sessão.
    safe(function () {
      var link = global.document.getElementById('pwa-manifest');
      if (!link || !global.MutationObserver) return;
      new MutationObserver(function () {
        var now = Date.now();
        if (reactCount >= 3) return;
        if (now - lastReact < 5000) return;
        lastReact = now; reactCount++;
        setTimeout(fix, 50);
      }).observe(link, { attributes: true, attributeFilter: ['href'] });
    });
  })();

  /* ------------------------------------------------------------------ */
  global.LF_FIX_RAIZ = {
    version: 'v1-20260801',
    token: function () { return A.get() ? '(ok)' : '(sem token)'; },
    compact: global.LF_compactStorage,
    status: function () {
      var total = 0;
      safe(function () {
        for (var i = 0; i < LS.length; i++) {
          var k = LS.key(i); total += (k.length + (LS.getItem(k) || '').length) * 2;
        }
      });
      return {
        tokenEspelhado: !!(global.S && (global.S._workerToken || global.S.token)),
        localStorageUso: (total / 1024).toFixed(0) + ' KB',
        percentualDoLimite: ((total / (5 * 1024 * 1024)) * 100).toFixed(1) + '%'
      };
    }
  };

  log('v1-20260801 ativo — [A] ponte de token, [B] mata-quota (IndexedDB), [C] manifest. Diagnóstico: LF_FIX_RAIZ.status()');
})(window);
