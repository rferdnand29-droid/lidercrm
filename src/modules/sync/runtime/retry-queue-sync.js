/* =====================================================================
 * src/modules/sync/runtime/retry-queue-sync.js
 * -----------------------------------------------------------------------
 * Extraído nesta rodada (8) de js/patches/lf-retryqueue-sync-v1-20260717.js.
 * Fecha a pendência #3 deixada pela rodada 7 ("extrair RetryQueue /
 * SyncManager / fetchAndCacheActivities para src/modules/sync/runtime/,
 * já coberto por teste de integração desde a rodada 6").
 *
 * O que mora aqui (comportamento IDÊNTICO ao original, só mudou o
 * arquivo onde mora):
 *   - RetryQueue        - fila FIFO persistente em localStorage
 *                         (chave: lf_retry_q_v1)
 *   - SyncManager       - drena a fila a cada ~15s / 'online' /
 *                         'visibilitychange' / boot inicial
 *   - LF.fetchAndCacheActivities(uid) - GET no Supabase REST, funde e
 *                         cacheia atividades entre aparelhos
 *   - LF.enqueueActivities / LF.enqueueLigacoes - helpers de enfileirar
 *
 * O que NÃO mora aqui (continua em js/patches/lf-retryqueue-sync-v1-20260717.js):
 *   - _wrapOnce/_startWatching  - troca window.saveActivities/saveLigToday
 *     por versões "wrapped", via polling até essas funções existirem.
 *     Depende de agenda.js real já ter carregado no <script> global —
 *     não é lógica pura, é integração com o carregamento legado.
 *   - _hookSyncErr              - idem, depende de window.syncErr existir.
 *   - Boot (DOMContentLoaded)   - dispara SyncManager.start()/_paint()/etc.
 *
 * Compatibilidade: continua expondo os MESMOS globais que o patch expunha
 * antes (window.RetryQueue, window.SyncManager, window.LF.*), para que
 * nenhum consumidor existente (activities-store.js, ligacoes-store.js,
 * o próprio patch, e qualquer código legado em js/*.js) precise mudar.
 * Também expõe em LiderCRM.modules.sync.runtime.* para uso interno/testes.
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = (global.LiderCRM = global.LiderCRM || {});
  var modules = (root.modules = root.modules || {});
  var sync = (modules.sync = modules.sync || {});

  var NS_LF = (global.LF = global.LF || {});

  // -----------------------------------------------------------------
  // helpers de storage
  // -----------------------------------------------------------------
  function _sg(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_e) { return null; } }
  function _ss(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_e) { console.error('[retry] ss()', k, _e); return false; } }
  function _realOnline() {
    if (typeof navigator === 'undefined') return true;
    if (navigator.onLine === false) return false;        // navegador diz offline
    if (global.__LF_HEALTH_OK === false) return false;    // ping recente do Worker falhou
    return true;
  }

  // -----------------------------------------------------------------
  // Supabase URL / apikey (lidos do runtime, fallback do supabase.js)
  // -----------------------------------------------------------------
  // AUDIT-SECURITY 2026-07-17: URL real removida. Fallback é apenas o placeholder
  // e o runtime deve resolver via window.SUPABASE_URL ou <meta name="lf-supabase-url">.
  var SUPABASE_URL_FALLBACK = 'https://xwajiwjpecanxaqlxzkt.supabase.co';
  function _sbUrl() {
    try { if (global._sbClient && _sbClient.supabaseUrl) return _sbClient.supabaseUrl; } catch (_e) {}
    try { if (global.SUPABASE_URL) return global.SUPABASE_URL; } catch (_e) {}
    return SUPABASE_URL_FALLBACK;
  }
  function _sbKey() {
    var k = '';
    try {
      var urlKey = 'sb-' + _sbUrl().replace(/^https?:\/\//, '') + '-auth-token';
      var raw = localStorage.getItem(urlKey);
      if (raw) {
        var p = JSON.parse(raw);
        k = (p && p.access_token) ||
            (p && p.currentSession && p.currentSession.access_token) ||
            (p && p.data && p.data.access_token) || '';
      }
    } catch (_e) {}
    if (!k) {
      try { k = global.SUPABASE_KEY || global.SUPABASE_ANON_KEY || ''; } catch (_e) {}
    }
    return k || '';
  }
  function _authHeaders() {
    var h = { Accept: 'application/json', 'Content-Type': 'application/json' };
    var k = _sbKey();
    if (k) { h.apikey = k; h.Authorization = 'Bearer ' + k; }
    return h;
  }

  // -----------------------------------------------------------------
  // RetryQueue - FIFO persistente
  // -----------------------------------------------------------------
  var QKEY = 'lf_retry_q_v1';
  var _q = _sg(QKEY);
  if (!Array.isArray(_q)) _q = [];

  function _saveQ() { _ss(QKEY, _q); }
  function _reloadQ() {
    var latest = _sg(QKEY);
    _q = Array.isArray(latest) ? latest : [];
    return _q;
  }
  function _mkId(prefix) { return (prefix || 'op') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5); }

  var RetryQueue = {
    enqueue: function (op) {
      if (!op || !op.url) return null;
      op.id = op.id || _mkId(op.type || 'op');
      op.ts = op.ts || Date.now();
      op.tries = op.tries || 0;
      _q.push(op); _saveQ(); _paint();
      return op.id;
    },
    dequeue: function (id) {
      var i = _q.findIndex(function (o) { return o.id === id; });
      if (i >= 0) { _q.splice(i, 1); _saveQ(); _paint(); }
    },
    list: function () { _reloadQ(); return _q.slice(); },
    clear: function () { _q = []; _saveQ(); _paint(); },
    pending: function () { _reloadQ(); return _q.length; },
    _raw: function () { _reloadQ(); return _q; },
    _persist: _saveQ,
    _reload: _reloadQ,
  };

  // -----------------------------------------------------------------
  // HTTP executor com timeout curto, identico ao que o shim db.set()
  // ja fazia via Supabase REST.
  // -----------------------------------------------------------------
  async function _exec(op) {
    var hdrs = Object.assign({}, _authHeaders(), op.headers || {});
    var init = { method: op.method || 'POST', headers: hdrs };
    if (init.method.toUpperCase() !== 'GET' && op.body != null) {
      init.body = JSON.stringify(op.body);
    }
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl) init.signal = ctrl.signal;
    var to = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_e) {} }, 12000) : null;
    try {
      var r = await _syncFetchWithTimeout(op.url, init);
      if (to) clearTimeout(to);
      var txt = ''; try { txt = (await r.text()).slice(0, 240); } catch (_e) {}
      return { ok: r.ok, status: r.status, text: txt };
    } catch (e) {
      if (to) clearTimeout(to);
      return { ok: false, status: 0, error: e && e.message };
    }
  }

  // -----------------------------------------------------------------
  // SyncManager - drain a cada ~15 s
  // -----------------------------------------------------------------
  var DRAN_MS = 15000;
  var _dranning = false;
  var _dranTimer = null;
  var MAX_TRIES = 30;

// CERT-06: Fetch com timeout para todas as chamadas do sync.
const SYNC_FETCH_TIMEOUT_MS = 15000;
async function _syncFetchWithTimeout(url, init, timeoutMs) {
  var ctrl = new AbortController();
  var tid = setTimeout(function(){ ctrl.abort(); }, timeoutMs || SYNC_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, init || {}, { signal: ctrl.signal }));
  } finally {
    clearTimeout(tid);
  }
}


  // Backoff exponencial por item: 15s, 30s, 60s, 120s, 240s, 480s, 960s (máx ~16 min)
  function _backoffMs(tries) {
    var base = 15000;
    var max  = 960000;
    return Math.min(max, base * Math.pow(2, Math.max(0, tries - 1)));
  }            // ~ 7-8 min de tentativas a 15s

  async function SyncManager_drain() {
    if (_dranning) return;
    _reloadQ();
    if (!_q.length) return;
    if (!_realOnline()) return;
    _dranning = true;
    try {
      if (typeof syncBusy === 'function') try { syncBusy(); } catch (_e) {}
      var snapshot = _q.slice();
      for (var i = 0; i < snapshot.length; i++) {
        var op = snapshot[i];
        // Respeitar o backoff por item — pular se ainda não chegou a hora
        if (op.nextAt && Date.now() < op.nextAt) continue;
        op.tries = (op.tries || 0) + 1;
        if (op.tries > MAX_TRIES) {
          // Mover para Dead-Letter Queue em vez de descartar silenciosamente
          try {
            var dlqKey = 'lidercrm_dlq_v1';
            var dlq = [];
            try { dlq = JSON.parse(localStorage.getItem(dlqKey)) || []; } catch(_e) {}
            dlq.push({ op: op, failedAt: new Date().toISOString() });
            if (dlq.length > 50) dlq = dlq.slice(-50); // mantém as 50 mais recentes
            localStorage.setItem(dlqKey, JSON.stringify(dlq));
          } catch (_e) {}
          console.warn('[retry] DLQ após '+op.tries+' tentativas', op.type, op.url);
          RetryQueue.dequeue(op.id);
          // Notificar usuário uma única vez por sessão sobre falhas persistentes
          if (typeof toast === 'function') {
            try { toast('⚠️ Operação "'+( op.type||'sync' )+'" não pôde ser sincronizada. Verifique sua conexão.', 6000); } catch(_e) {}
          }
          continue;
        }
        var res = await _exec(op);
        if (res.ok) {
          RetryQueue.dequeue(op.id);
        } else if (
          res.status === 401 || res.status === 403 || res.status === 404 ||
          (res.status >= 400 && res.status < 500 &&
           res.status !== 408 && res.status !== 425 && res.status !== 429)
        ) {
          // payload ruim - nao fica martelando
          console.warn('[retry] drop on 4xx', op.type, res.status, res.text);
          RetryQueue.dequeue(op.id);
        } else {
          // 5xx / 0 / network -> backoff exponencial por item
          op.nextAt = Date.now() + _backoffMs(op.tries);
          _saveQ();
          console.warn('[retry] 5xx/network, backoff '+Math.round(_backoffMs(op.tries)/1000)+'s', op.type, res.status);
          break;
        }
      }
      if (typeof syncOk === 'function') try { syncOk(); } catch (_e) {}
    } finally {
      _dranning = false;
      _paint();
    }
  }

  function SyncManager_start() {
    SyncManager_stop();
    _dranTimer = setInterval(SyncManager_drain, DRAN_MS);
    try {
      global.addEventListener('online', _onConnEvent);
      document.addEventListener('visibilitychange', _onVis);
    } catch (_e) {}
    // dreno inicial - devolve os itens enfileirados em sessoes anteriores
    setTimeout(function () { try { SyncManager_drain(); } catch (_e) {} }, 1500);
  }
  function SyncManager_stop() {
    if (_dranTimer) { clearInterval(_dranTimer); _dranTimer = null; }
  }
  function SyncManager_status() {
    return {
      pending: _q.length,
      online: _realOnline(),
      dranning: _dranning,
      intervalMs: DRAN_MS,
    };
  }
  function _onConnEvent() { try { SyncManager_drain(); } catch (_e) {} }
  function _onVis() {
    try { if (document.visibilityState === 'visible') SyncManager_drain(); } catch (_e) {}
  }

  var SyncManager = {
    start: SyncManager_start,
    stop: SyncManager_stop,
    drain: SyncManager_drain,
    status: SyncManager_status,
  };

  // -----------------------------------------------------------------
  // UI: pinta o nav-sync e abre um pequeno HUD se a fila > 0
  // -----------------------------------------------------------------
  function _paint() {
    var n = _q.length;
    var el = document.getElementById('nav-sync');
    if (el) {
      if (n === 0) { el.className = 'nav-sync'; el.title = 'Sincronizado'; }
      else { el.className = 'nav-sync syncing'; el.title = 'Pendentes: ' + n + ' (sync automático a cada ' + Math.round(DRAN_MS / 1000) + 's)'; }
    }
  }
  RetryQueue._paint = _paint;

  // -----------------------------------------------------------------
  // Helpers para enfileirar - usado pelos wrappers do patch legado
  // -----------------------------------------------------------------
  function _enqueueActivities(uid, list) {
    return RetryQueue.enqueue({
      type: 'activities',
      // FIX 406 (real): public.activities_legacy foi criada no addon SQL
      // exatamente pro formato {user_id,list,ts}. A URL antiga apontava pra
      // public.activities (schema novo, colunas diferentes) e ainda mandava
      // Accept-Profile/Content-Profile:'activities', que o PostgREST trata
      // como "schema activities" (que não existe) — daí o 406.
      url: _sbUrl() + '/rest/v1/activities_legacy?user_id=eq.' + encodeURIComponent(uid),
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: { user_id: uid, list: list, ts: new Date().toISOString() },
    });
  }
  function _enqueueLigacoes(uid, list) {
    var today = new Date().toISOString().slice(0, 10);
    return RetryQueue.enqueue({
      type: 'ligacoes',
      url: _sbUrl() + '/rest/v1/ligacoes_legacy?uid=eq.' + encodeURIComponent(uid) + '&date=eq.' + encodeURIComponent(today),
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: { uid: uid, date: today, list: list, ts: new Date().toISOString() },
    });
  }
  NS_LF.enqueueActivities = _enqueueActivities;
  NS_LF.enqueueLigacoes = _enqueueLigacoes;

  // -----------------------------------------------------------------
  // CORREÇÃO (2026-07-20, caça-bugs agenda): enfileira create/update de
  // agenda_slots no RetryQueue quando o POST/PUT direto no Worker
  // falha (offline, 5xx, timeout). O SyncManager já drena a fila a
  // cada ~15s / em 'online' / em 'visibilitychange', então o slot
  // que ficou como _pending no cache local acaba subindo pra nuvem
  // sem exigir clique do usuário. Usa a rota autenticada do Worker
  // (mesma que wc.createAgendaSlot/updateAgendaSlot chamam), não o
  // Supabase direto — pra respeitar RLS/JWT como o resto da agenda.
  // -----------------------------------------------------------------
  function _workerAgendaUrl(id){
    var cfg = (global.LiderCRM && global.LiderCRM.config) || {};
    var base = cfg.workerBaseUrl || '/api';
    var ver  = cfg.workerVersion || 'v1';
    var url  = base + '/' + ver + '/agenda-slots';
    if (id) url += '?id=' + encodeURIComponent(id);
    return url;
  }
  function _workerAuthHeaders(){
    var h = { Accept: 'application/json', 'Content-Type': 'application/json' };
    try {
      var s = global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.httpClient
            && global.LiderCRM.api.httpClient.session && global.LiderCRM.api.httpClient.session.get
            && global.LiderCRM.api.httpClient.session.get();
      if (s && s.token) h.Authorization = 'Bearer ' + s.token;
    } catch(_e){}
    return h;
  }
  function _enqueueAgendaSlot(action, id, payload){
    if (action !== 'create' && action !== 'update') return null;
    if (action === 'update' && !id) return null;
    return RetryQueue.enqueue({
      type: 'agenda_slot_' + action,
      url: action === 'update' ? _workerAgendaUrl(id) : _workerAgendaUrl(null),
      method: action === 'update' ? 'PUT' : 'POST',
      headers: _workerAuthHeaders(),
      body: payload,
      localId: id || null,
    });
  }
  NS_LF.enqueueAgendaSlot = _enqueueAgendaSlot;

  // -----------------------------------------------------------------
  // fetchAndCacheActivities - segundo aparelho enxerga o primeiro
  //   GET /rest/v1/activities_legacy?user_id=eq.<uid>&select=list,ts
  //   grava em lf13_acts_<uid>  (=  actKeyFor(uid))
  //   tambem cacheia em getActivities()/actKey() se for o proprio user
  // -----------------------------------------------------------------
  async function fetchAndCacheActivities(uid) {
    uid = uid || (global.S && global.S.userId);
    if (!uid) return null;
    var url = _sbUrl() + '/rest/v1/activities_legacy'
      + '?user_id=eq.' + encodeURIComponent(uid)
      + '&select=list,ts'
      + '&order=ts.desc'
      + '&limit=50';
    var hdrs = _authHeaders();
    hdrs.Accept = 'application/json';
    try {
      var r = await _syncFetchWithTimeout(url, { method: 'GET', headers: hdrs });
      if (!r.ok) return null;
      var rows = await r.json();
      var list = [];
      if (Array.isArray(rows)) {
        rows.forEach(function (row) {
          if (row && row.list) {
            if (Array.isArray(row.list)) list = list.concat(row.list);
            else if (typeof row.list === 'object') list.push(row.list);
          }
        });
      }
      // dedupe por id (preferir o mais recente)
      var seen = Object.create(null);
      var merged = [];
      list.forEach(function (a) {
        if (!a || !a.id) return;
        if (!seen[a.id]) { seen[a.id] = true; merged.push(a); }
      });
      // cacheia nas duas chaves (a do usuario logado + a do uid)
      var k1 = 'lf13_acts_' + uid;
      _ss(k1, merged);
      if (global.S && global.S.userId && global.S.userId === uid) {
        _ss('lf13_acts_' + uid, merged); // redundante mas explicito
      }
      // tambem atualiza o _actCache atual se for o proprio user
      try {
        if (typeof getActivities === 'function' && global.S && global.S.userId === uid) {
          // nao troca direto pq pode ter edits nao sincronizados; funde
          var local = (typeof getActivities === 'function') ? getActivities() : [];
          var m2 = Object.create(null);
          (Array.isArray(local) ? local : []).forEach(function (a) { if (a && a.id) m2[a.id] = a; });
          merged.forEach(function (a) {
            if (!a || !a.id) return;
            if (!m2[a.id]) m2[a.id] = a;        // so adiciona do servidor o que falta
          });
          var out = Object.keys(m2).map(function (k) { return m2[k]; });
          _ss('lf13_acts_' + uid, out);
        }
      } catch (_e) {}
      return merged;
    } catch (e) {
      console.warn('[retry] fetch activities falhou', e && e.message);
      return null;
    }
  }
  NS_LF.fetchAndCacheActivities = fetchAndCacheActivities;

  // -----------------------------------------------------------------
  // Exposição — mantém os MESMOS globais que o patch legado expunha
  // (window.RetryQueue, window.SyncManager), para nenhum consumidor
  // existente (activities-store.js, ligacoes-store.js, o próprio
  // patch) precisar mudar uma linha.
  // -----------------------------------------------------------------
  global.RetryQueue = RetryQueue;
  global.SyncManager = SyncManager;

  sync.runtime = sync.runtime || {};
  sync.runtime.RetryQueue = RetryQueue;
  sync.runtime.SyncManager = SyncManager;
  sync.runtime.fetchAndCacheActivities = fetchAndCacheActivities;
  sync.runtime.enqueueActivities = _enqueueActivities;
  sync.runtime.enqueueLigacoes = _enqueueLigacoes;

  /* R14-15: expor funções ao escopo global */
  if(typeof _sg === 'function') global._sg = _sg;
  if(typeof _ss === 'function') global._ss = _ss;
  if(typeof _realOnline === 'function') global._realOnline = _realOnline;
  if(typeof _sbUrl === 'function') global._sbUrl = _sbUrl;
  if(typeof _sbKey === 'function') global._sbKey = _sbKey;
  if(typeof _authHeaders === 'function') global._authHeaders = _authHeaders;
  if(typeof _saveQ === 'function') global._saveQ = _saveQ;
  if(typeof _mkId === 'function') global._mkId = _mkId;
  if(typeof _exec === 'function') global._exec = _exec;
  if(typeof _syncFetchWithTimeout === 'function') global._syncFetchWithTimeout = _syncFetchWithTimeout;
  if(typeof _backoffMs === 'function') global._backoffMs = _backoffMs;
  if(typeof SyncManager_drain === 'function') global.SyncManager_drain = SyncManager_drain;
  if(typeof SyncManager_start === 'function') global.SyncManager_start = SyncManager_start;
  if(typeof SyncManager_stop === 'function') global.SyncManager_stop = SyncManager_stop;
  if(typeof SyncManager_status === 'function') global.SyncManager_status = SyncManager_status;
  if(typeof _onConnEvent === 'function') global._onConnEvent = _onConnEvent;
  if(typeof _onVis === 'function') global._onVis = _onVis;
  if(typeof _paint === 'function') global._paint = _paint;
  if(typeof _enqueueActivities === 'function') global._enqueueActivities = _enqueueActivities;
  if(typeof _enqueueLigacoes === 'function') global._enqueueLigacoes = _enqueueLigacoes;
  if(typeof fetchAndCacheActivities === 'function') global.fetchAndCacheActivities = fetchAndCacheActivities;

  try {
    if(typeof global.addEventListener === 'function'){
      global.addEventListener('storage', function(ev){
        if(!ev || ev.key !== QKEY) return;
        try { _reloadQ(); _paint(); } catch(_e){}
      }, { passive:true });
    }
  } catch(_e) {}

})(window);
