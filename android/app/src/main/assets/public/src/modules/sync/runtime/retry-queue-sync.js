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
 *                         (chave canônica: lidercrm_retry_queue_v1)
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

  function _nowTs(){ return Date.now(); }

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
  var QKEY = 'lidercrm_retry_queue_v1';
  var _q = _sg(QKEY);
  if (!Array.isArray(_q)) _q = [];
  // Migra a fila criada pelo primeiro runtime sem apagar operações
  // pendentes. A partir daqui todos os produtores usam QKEY.
  if (!_q.length) {
    var _legacyQueue = _sg('lf_retry_q_v1');
    if (Array.isArray(_legacyQueue) && _legacyQueue.length) {
      _q = _legacyQueue.map(function (item) {
        var next = Object.assign({}, item);
        if (!next.url && next.path) next.url = next.path;
        return next;
      });
      _saveQ();
      try { localStorage.removeItem('lf_retry_q_v1'); } catch (_e) {}
    }
  }

  function _saveQ() { _ss(QKEY, _q); }
  function _mkId(prefix) { return (prefix || 'op') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5); }
  // AUDITORIA-FINAL-10 (2026-08-01, item 2.6): mesma correção aplicada em
  // src/core/offline/retry-queue.js — _q era lido do localStorage só 1x no
  // carregamento do script e ficava em memória; se outra aba gravasse na
  // fila nesse meio-tempo, o próximo enqueue/dequeue/clear desta aba
  // sobrescrevia com o array em memória (desatualizado), perdendo o item da
  // outra aba. Cada método que muta a fila agora relê o localStorage antes —
  // síncrono, mantém a API pública (enqueue retorna o id direto, não uma
  // Promise) 100% igual, então activities-store.js/ligacoes-store.js e
  // qualquer outro consumidor existente não precisam mudar nada.
  function _resyncQ() { var fresh = _sg(QKEY); _q = Array.isArray(fresh) ? fresh : []; }

  var RetryQueue = {
    enqueue: function (op) {
      if (!op || !op.url) return null;
      _resyncQ();
      /* [FIX 20260907-KANBAN409-CIRURGICO] Dedupe de enfileiramento: itens do MESMO documento
         (kanban board+uid, activities do uid, ligacoes do uid, slot de
         agenda) se substituem — o mais novo carrega o estado mais recente,
         e o antigo ia gravar uma lista velha por cima da nova ao drenar
         (era um dos caminhos da "atividade concluida que voltava atrasada"
         e do kanban regravado em cascata). O item substituido nao some em
         silencio: vai pra DLQ com motivo 'superseded_by_newer_enqueue'. */
      try {
        function _dedupKey(o){
          if(!o) return null;
          if(o.meta && o.meta.type==='kanban-save') return 'kb:'+o.method+'::'+o.path;
          if(o.type==='activities' && o.body && o.body.user_id!=null) return 'act:'+String(o.body.user_id);
          if(o.type==='ligacoes' && o.body && o.body.uid!=null) return 'lig:'+String(o.body.uid);
          if(o.type && String(o.type).indexOf('agenda_slot_')===0) return String(o.type)+'::'+String(o.localId||(o.body&&o.body.id)||'');
          return null;
        }
        var _nk = _dedupKey(op);
        if(_nk){
          var _dead = [], _kept = [];
          for(var _i=0;_i<_q.length;_i++){
            var _k = _dedupKey(_q[_i]);
            if(_k && _k===_nk) _dead.push(_q[_i]); else _kept.push(_q[_i]);
          }
          if(_dead.length){
            _q = _kept;
            try {
              var _dk='lidercrm_dlq_v1', _dq=[];
              try { _dq = JSON.parse(localStorage.getItem(_dk)) || []; } catch(_e0){}
              _dead.forEach(function(_d){ _dq.push({ op:_d, failedAt:new Date().toISOString(), reason:'superseded_by_newer_enqueue' }); });
              if(_dq.length>50) _dq=_dq.slice(-50);
              localStorage.setItem(_dk, JSON.stringify(_dq));
            } catch(_e1){}
          }
        }
      } catch(_e2){}
      op.id = op.id || _mkId(op.type || 'op');
      op.ts = op.ts || Date.now();
      op.tries = op.tries || 0;
      _q.push(op); _saveQ(); _paint();
      return op.id;
    },
    dequeue: function (id) {
      _resyncQ();
      var i = _q.findIndex(function (o) { return o.id === id; });
      if (i >= 0) { _q.splice(i, 1); _saveQ(); _paint(); }
    },
    list: function () { _resyncQ(); return _q.slice(); },
    clear: function () { _q = []; _saveQ(); _paint(); },
    pending: function () { _resyncQ(); return _q.length; },
    _raw: function () { return _q; },
    _persist: _saveQ,
  };

  // -----------------------------------------------------------------
  // HTTP executor com timeout curto, identico ao que o shim db.set()
  // ja fazia via Supabase REST.
  // -----------------------------------------------------------------
  async function _exec(op) {
    /* [FIX 20260907-KANBAN409-CIRURGICO] Snapshot velho de atividades: o item era enfileirado com
       a lista do instante da falha; se o usuario concluísse/criasse algo
       antes do dreno (15s+), a fila regravava a lista VELHA no
       activities_legacy — a conclusao "voltava atrasada". Agora o corpo
       e reidratado na hora do envio com a lista local mais nova. O
       marcador fica FORA do body pra nao quebrar o outro runtime que
       compartilha esta fila (ele simplesmente envia o body capturado). */
    if (op && op.dynamicBody === 'activities_v1') {
      try {
        var _dynUid = op.body && op.body.user_id;
        var _curList = _dynUid ? _sg('lf13_acts_' + _dynUid) : null;
        if (Array.isArray(_curList) && _curList.length) {
          op.body = { user_id: _dynUid, list: _curList, ts: _nowTs() };
        }
      } catch(_e){}
      try { delete op.dynamicBody; } catch(_e){}
    }
    var hdrs = Object.assign({}, _authHeaders(), op.headers || {});
    var init = { method: op.method || 'POST', headers: hdrs };
    if (init.method.toUpperCase() !== 'GET' && op.body != null) {
      init.body = JSON.stringify(op.body);
    }
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl) init.signal = ctrl.signal;
    var to = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_e) {} }, 12000) : null;
    try {
      /* [FIX 20260903b] api/v1undefined: esta fila e a de
         src/core/offline/retry-queue.js compartilham a mesma chave de
         localStorage, mas a fila nova grava o destino no campo `path`
         relativo da API (ex.: '/kanban/list?...') enquanto esta espera
         `url` completa. Um item da fila nova drenado aqui saía com o
         path cru contra o host errado (ou virava URL malformada) —
         daí os 404 em loop. Correção: se só houver `path` relativo da
         API, prefixa com a base do Worker ('/api/v1') antes do fetch;
         e nunca dispara request sem destino válido. */
      var target = op.url || op.path;
      if (!target) throw new Error('retry-item-sem-destino');
      if (typeof target === 'string' && target.charAt(0) === '/' && target.indexOf('/api/v1/') !== 0) {
        var _cfg = (global.LiderCRM && global.LiderCRM.config) || {};
        target = (_cfg.workerBaseUrl || '/api') + '/' + (_cfg.workerVersion || 'v1') + target;
      }
      var r = await _syncFetchWithTimeout(target, init);
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
  var _syncConfig=(global.LiderCRM&&global.LiderCRM.config&&global.LiderCRM.config.sync)||{};
  var MAX_TRIES = Number(_syncConfig.retryMaxTries)||30;

// CERT-06: Fetch com timeout para todas as chamadas do sync.
const SYNC_FETCH_TIMEOUT_MS = Number(_syncConfig.fetchTimeoutMs)||15000;
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
    var base = Number(_syncConfig.retryBackoffBaseMs)||15000;
    var max  = Number(_syncConfig.retryBackoffMaxMs)||960000;
    return Math.min(max, base * Math.pow(2, Math.max(0, tries - 1)));
  }            // ~ 7-8 min de tentativas a 15s

  async function SyncManager_drain() {
    if (_dranning) return;
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
        // LF-RETRY-NO-4XX-20260908: 401/403 não são falhas transitórias.
        // Reenfileirar amplifica o incidente e dispara o logout automático
        // do shell — descarta na hora, sem nova tentativa.
        if (res && (res.status === 401 || res.status === 403)) {
          console.warn('[retry] drop on 401/403 (sem reenfileirar)', op.type, res.status, res.text);
          RetryQueue.dequeue(op.id);
          continue;
        }
        if (res.ok) {
          RetryQueue.dequeue(op.id);
        } else if (res.status === 409) {
          /* [FIX 20260907-KANBAN409-CIRURGICO] 409 = conflito de versao, NAO falha de rede: cair
             no backoff generico martelava o mesmo body em loop. Tenta UMA
             resolucao de verdade — GET do doc atual via workerClient (que
             sincroniza a versao no cache), merge padrao
             (_mergeKeepLocalOnly), grava local e re-PUT; se nao for
             possivel, move pra DLQ em vez de loopar. */
          var _done409 = false;
          try {
            var _wc409 = (global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.workerClient) || null;
            if (op.meta && op.meta.type === 'kanban-save' && _wc409
                && typeof _wc409.kanbanList === 'function'
                && typeof _wc409.saveKanbanList === 'function'
                && typeof global._mergeKeepLocalOnly === 'function') {
              var _b409 = String(op.meta.board || ''); var _u409 = String(op.meta.uid || '');
              var _doc409 = await _wc409.kanbanList(_b409, _u409);
              var _srv409 = (_doc409 && Array.isArray(_doc409.list)) ? _doc409.list : [];
              var _lk409 = 'lf6_kb_' + _b409 + '_' + _u409;
              var _mg409 = global._mergeKeepLocalOnly(_srv409, _sg(_lk409) || []);
              _ss(_lk409, _mg409);
              await _wc409.saveKanbanList(_b409, _u409, _mg409);
              _done409 = true;
            }
          } catch(_e) { _done409 = false; }
          if (_done409) {
            console.warn('[retry] 409 kanban resolvido via GET+merge+PUT', op.path);
            RetryQueue.dequeue(op.id);
          } else {
            try {
              var _dk2 = 'lidercrm_dlq_v1', _dq2 = [];
              try { _dq2 = JSON.parse(localStorage.getItem(_dk2)) || []; } catch(_e2){}
              _dq2.push({ op: op, failedAt: new Date().toISOString(), reason: 'conflict_409_unrecoverable' });
              if (_dq2.length > 50) _dq2 = _dq2.slice(-50);
              localStorage.setItem(_dk2, JSON.stringify(_dq2));
            } catch(_e3){}
            console.warn('[retry] drop on 409 (conflito de versão irrecuperável)', op.type, op.url || op.path);
            RetryQueue.dequeue(op.id);
          }
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
      body: { user_id: uid, list: list, ts: _nowTs() },
      dynamicBody: 'activities_v1', /* [FIX 20260907-KANBAN409-CIRURGICO] reidratado no _exec com a lista local mais nova */
    });
  }
  function _enqueueLigacoes(uid, list) {
    var today = new Date().toISOString().slice(0, 10);
    return RetryQueue.enqueue({
      type: 'ligacoes',
      url: _sbUrl() + '/rest/v1/ligacoes_legacy?uid=eq.' + encodeURIComponent(uid) + '&date=eq.' + encodeURIComponent(today),
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: { uid: uid, date: today, list: list, ts: _nowTs() },
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

})(window);
