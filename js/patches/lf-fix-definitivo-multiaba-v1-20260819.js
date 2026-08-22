/* lf-fix-definitivo-multiaba-v1-20260819
   ============================================================
   PATCH DEFINITIVO MULTI-ABA — consolida as correções de causa-raiz
   levantadas na auditoria de 2026-08-19. Cobre:

   #1 Lentidão ao abrir nova guia
      - Eleição de GUIA LÍDER via BroadcastChannel('lf_boot').
        Só a líder roda _lfSoftResumeSync / fetchAndCacheActivities.
      - window.__LF_BOOT_DONE__: guia filha que abre com a mestra já
        autenticada (warm state < 30s) curto-circuita o sync em cascata.
      - Debounce global em LF.fetchAndCacheActivities: máx. 1 chamada
        a cada 5s por uid (chamadas extras retornam o cache em voo).

   #3 Sininho/alarme disparando atividade NÃO atrasada
      - checkUpcomingActs passa a pular itens com a.done || a._pending
        || a._doneLocalAt (antes só pulava quando havia pendência
        GLOBAL do uid — havia janela entre o PUT e o re-badge em que
        o item concluído disparava som/vibração).

   #4 Atividade concluída voltando a ficar "atrasada" sozinha
      - Versionamento Lamport por atividade: cada save local grava
        lf_updatedAtLamport (contador monotônico por uid em
        lf13_acts_v_<uid>). No merge com o servidor, a versão do
        servidor SÓ sobrescreve o done local quando
        srv.lf_updatedAtLamport > local.lf_updatedAtLamport.
        Isso fecha o loop descrito no cabeçalho do
        lf-fix-activity-cloud-persist-v3 sem depender da ordem de
        chegada do PUT entre guias.

   #7 Sair numa guia não desloga as outras
      - _execLogout publica em BroadcastChannel('lf_logout_v1') antes
        de remover lf6_s; todas as guias instalam listener (uma vez)
        que chama _execLogout ao receber a mensagem — e também ao
        detectar storage event de remoção da chave lf6_s.

   #8 [FIX 20260820] Entrar numa guia não logava as outras
      - Pedido do usuário: "ao você entrar em uma, você entre em todas
        também" — o oposto do #7, que já existia. startApp() publica em
        BroadcastChannel('lf_login_v1') depois de rodar; guias que
        estiverem na tela de login (window.S ainda nulo) ao receber a
        mensagem — ou ao detectar via storage event que lf6_s passou a
        existir — dão um location.reload(). Não tentamos "hidratar" o
        estado logado numa guia já aberta sem reload: o boot completo
        (startApp) depende de dezenas de passos assíncronos que só são
        seguros na ordem em que já rodam hoje a partir de uma página
        carregada do zero. Como lf6_s já está gravado em localStorage
        antes do reload, a guia recarregada sobe direto autenticada —
        mesmo caminho que já funciona hoje ao abrir uma aba nova com
        outra já logada, só que sem precisar abrir a aba manualmente.

   Seguro para carregar junto com os patches antigos: tudo é guardado
   por flags __LF_* e wrappers marcados com __lfWrapped.
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__LF_MULTIABA_V1__) return;
  window.__LF_MULTIABA_V1__ = true;

  var TAG = '[lf-multiaba-v1]';

  /* ------------------------------------------------------------
     #1a — ELEIÇÃO DE GUIA LÍDER (BroadcastChannel 'lf_boot')
     A primeira guia viva assume; ao fechar, anuncia e outra assume.
     window.__LF_IS_LEADER_TAB__ é o flag lido pelos demais pontos.
     ------------------------------------------------------------ */
  var BOOT_CH = 'lf_boot';
  var _leaderId = null;
  var _myTabId = 'tab_' + Math.random().toString(36).slice(2) + '_' + Date.now();
  var _bc = null;

  function _announceLeader() {
    try { _bc && _bc.postMessage({ t: 'leader', id: _myTabId, ts: Date.now() }); } catch (_e) {}
  }
  function _electSelf() {
    _leaderId = _myTabId;
    window.__LF_IS_LEADER_TAB__ = true;
    _announceLeader();
    try { console.debug(TAG, 'esta guia é a LÍDER'); } catch (_e) {}
  }
  try {
    if (window.BroadcastChannel) {
      _bc = new BroadcastChannel(BOOT_CH);
      window.__LF_BOOT_BC__ = _bc;
      _bc.onmessage = function (ev) {
        var d = ev && ev.data;
        if (!d || !d.t) return;
        if (d.t === 'leader' && d.id) {
          // Outra guia anunciou liderança. Se não sou eu, rebaixo.
          if (d.id !== _myTabId) {
            // A que anuncia por último (ts maior) vence empates de boot simultâneo.
            if (!_leaderId || _leaderId === _myTabId || (d.ts || 0) >= (_lastLeaderTs || 0)) {
              if (d.id !== _myTabId) {
                _leaderId = d.id;
                _lastLeaderTs = d.ts || Date.now();
                window.__LF_IS_LEADER_TAB__ = false;
              }
            }
          }
        } else if (d.t === 'who-is-leader') {
          if (window.__LF_IS_LEADER_TAB__) _announceLeader();
        } else if (d.t === 'leader-bye' && d.id === _leaderId) {
          _leaderId = null;
          // Pequeno jitter evita que duas guias assumam juntas.
          setTimeout(function () {
            if (!_leaderId) _electSelf();
          }, 80 + Math.floor(Math.random() * 160));
        }
      };
      var _lastLeaderTs = 0;
      // Pergunta quem é líder; se ninguém responder em 250ms, assume.
      try { _bc.postMessage({ t: 'who-is-leader', id: _myTabId }); } catch (_e) {}
      setTimeout(function () { if (!_leaderId) _electSelf(); }, 250);
      window.addEventListener('pagehide', function () {
        if (window.__LF_IS_LEADER_TAB__) {
          try { _bc.postMessage({ t: 'leader-bye', id: _myTabId }); } catch (_e) {}
        }
      }, { passive: true });
    } else {
      // Sem BroadcastChannel (browser antigo): toda guia é líder.
      window.__LF_IS_LEADER_TAB__ = true;
    }
  } catch (_e) {
    window.__LF_IS_LEADER_TAB__ = true;
  }

  /* ------------------------------------------------------------
     #1b — __LF_BOOT_DONE__: curto-circuito do soft-resume em guia
     filha cuja mestra autenticou há < 30s. A função
     _lfSoftResumeSync original é envolvida UMA vez (guarda
     __lfWrapped) e passa a respeitar líder + boot recente.
     ------------------------------------------------------------ */
  var BOOT_RECENT_MS = 30000;

  function _warmStateFresh() {
    try {
      var st = window.__LF_LAST_WARM_STATE || null;
      if (!st) {
        var raw = localStorage.getItem('lf_warm_state_v1');
        if (raw) st = JSON.parse(raw);
      }
      if (st && st.ts && (Date.now() - Number(st.ts)) < BOOT_RECENT_MS) return true;
    } catch (_e) {}
    return false;
  }

  function _wrapSoftResume() {
    if (typeof window._lfSoftResumeSync !== 'function') return false;
    var orig = window._lfSoftResumeSync;
    if (orig.__lfWrapped) return true;
    var wrapped = function (reason) {
      // Só a guia líder executa o sync pesado em cascata.
      if (window.__LF_IS_LEADER_TAB__ === false) {
        try { console.debug(TAG, 'soft resume ignorado (guia não-líder):', reason); } catch (_e) {}
        return;
      }
      // Guia que acabou de abrir com warm-state fresco (a mestra
      // autenticou há <30s) pula o boot em cascata na 1ª vez.
      if (!window.__LF_BOOT_DONE__ && _warmStateFresh()) {
        window.__LF_BOOT_DONE__ = true;
        /* LF-FIX-3BUGS-v1-20260819 #3b: o estado quente pula APENAS o fetch de rede.
           Antes do primeiro render, re-le lf6_kb_* do localStorage
           (instantaneo, mesma origem) para refletir a etapa atual. */
        try{
          ['leads','negocios'].forEach(function(b){
            if(typeof window.renderKBLocal==='function')window.renderKBLocal(b);
          });
          if(typeof window.updateActBadge==='function')window.updateActBadge();
          try{window._lfRefreshTabDots&&window._lfRefreshTabDots();}catch(_e2){}
        }catch(_e){}
        try { console.debug(TAG, 'boot curto-circuitado — warm state <30s'); } catch (_e) {}
        return;
      }
      window.__LF_BOOT_DONE__ = true;
      return orig.apply(this, arguments);
    };
    wrapped.__lfWrapped = true;
    wrapped.__lfOrig = orig;
    window._lfSoftResumeSync = wrapped;
    return true;
  }
  // _lfSoftResumeSync é declarada como function global em app.js —
  // fica acessível como window._lfSoftResumeSync. Tentamos já e
  // re-tentamos após DOMContentLoaded caso a ordem de scripts varie.
  if (!_wrapSoftResume()) {
    document.addEventListener('DOMContentLoaded', function () { _wrapSoftResume(); }, { once: true });
  }

  /* ------------------------------------------------------------
     #1c — DEBOUNCE GLOBAL em LF.fetchAndCacheActivities
     Máx. 1 chamada real a cada 5s por uid; chamadas no intervalo
     recebem a Promise em voo (ou o cache) sem novo round-trip.
     ------------------------------------------------------------ */
  var FETCH_MIN_INTERVAL_MS = 5000;
  var _fetchInflight = {}; // uid -> { ts, promise }

  function _wrapFetchAndCache() {
    if (!window.LF || typeof window.LF.fetchAndCacheActivities !== 'function') return false;
    var orig = window.LF.fetchAndCacheActivities;
    if (orig.__lfWrapped) return true;
    var wrapped = function (uid) {
      var key = String(uid || (window.S && window.S.userId) || '');
      var now = Date.now();
      var slot = _fetchInflight[key];
      if (slot && (now - slot.ts) < FETCH_MIN_INTERVAL_MS && slot.promise) {
        try { console.debug(TAG, 'fetchAndCacheActivities debounced p/ uid', key); } catch (_e) {}
        return slot.promise;
      }
      var p;
      try {
        p = Promise.resolve(orig.apply(this, arguments));
      } catch (e) {
        p = Promise.reject(e);
      }
      _fetchInflight[key] = { ts: now, promise: p };
      // Limpa a referência depois da janela pra não reter Promise velha.
      p.then(function () {
        var s = _fetchInflight[key];
        if (s && s.promise === p && (Date.now() - s.ts) >= FETCH_MIN_INTERVAL_MS) {
          delete _fetchInflight[key];
        }
      }, function () { delete _fetchInflight[key]; });
      return p;
    };
    wrapped.__lfWrapped = true;
    wrapped.__lfOrig = orig;
    window.LF.fetchAndCacheActivities = wrapped;
    return true;
  }
  if (!_wrapFetchAndCache()) {
    document.addEventListener('DOMContentLoaded', function () { _wrapFetchAndCache(); }, { once: true });
    // LF pode ser criado depois (agenda.js carrega tarde) — vigia por 10s.
    var _tries = 0;
    var _iv = setInterval(function () {
      _tries++;
      if (_wrapFetchAndCache() || _tries > 40) clearInterval(_iv);
    }, 250);
  }

  /* ------------------------------------------------------------
     #4 — VERSIONAMENTO LAMPORT DAS ATIVIDADES
     Contador monotônico por uid persistido em lf13_acts_v_<uid>.
     Toda mutação local incrementa; o merge com o servidor usa o
     número pra decidir quem vence (server só sobrescreve quando
     estritamente maior).
     ------------------------------------------------------------ */
  function _lamportKey(uid) { return 'lf13_acts_v_' + String(uid || ''); }
  function _lamportRead(uid) {
    try { return Number(localStorage.getItem(_lamportKey(uid)) || 0); } catch (_e) { return 0; }
  }
  function _lamportWrite(uid, v) {
    try { localStorage.setItem(_lamportKey(uid), String(v)); } catch (_e) {}
  }
  function _lamportBump(uid) {
    var v = _lamportRead(uid) + 1;
    _lamportWrite(uid, v);
    return v;
  }
  // API pública mínima usada pelos demais patches e pelos merges.
  window.LF = window.LF || {};
  window.LF.activities = window.LF.activities || {};
  if (!window.LF.activities.lamport) {
    window.LF.activities.lamport = {
      read: _lamportRead,
      bump: _lamportBump,
      stamp: function (act, uid) {
        if (!act) return act;
        act.lf_updatedAtLamport = _lamportBump(uid);
        act.lf_updatedAt = new Date().toISOString();
        return act;
      }
    };
  }

  /* Envolve saveActivities pra estampar Lamport em toda atividade
     marcada _pending/done localmente. Guarda __lfWrapped evita
     re-envelope quando patches antigos também tocam a função. */
  function _wrapSaveActivities() {
    if (typeof window.saveActivities !== 'function') return false;
    var orig = window.saveActivities;
    if (orig.__lfLamportWrapped) return true;
    var wrapped = function (list) {
      try {
        var uid = (window.S && window.S.userId) || null;
        if (uid && Array.isArray(list)) {
          list.forEach(function (a) {
            if (!a) return;
            // Só estampa quem foi mutado localmente e ainda não tem
            // Lamport deste save — evita inflar o contador em saves
            // que só regravam cache idêntico.
            if ((a._pending || a._doneLocalAt) && !a._lfStampedThisSave) {
              a.lf_updatedAtLamport = _lamportBump(uid);
              a._lfStampedThisSave = true;
              // Limpa a marca logo depois do save pra próxima mutação.
              setTimeout(function () { try { delete a._lfStampedThisSave; } catch (_e) {} }, 0);
            }
          });
        }
      } catch (_e) {}
      return orig.apply(this, arguments);
    };
    wrapped.__lfLamportWrapped = true;
    wrapped.__lfWrapped = true;
    wrapped.__lfOrig = orig;
    window.saveActivities = wrapped;
    return true;
  }
  if (!_wrapSaveActivities()) {
    document.addEventListener('DOMContentLoaded', function () { _wrapSaveActivities(); }, { once: true });
  }

  /* Merge orientado a Lamport: expõe helper que os fetchers podem
     usar pra decidir se a versão do servidor substitui a local. */
  if (!window.LF.activities.resolveWithServer) {
    window.LF.activities.resolveWithServer = function (localAct, serverAct, uid) {
      // Sem locais: aceita o servidor.
      if (!localAct) return serverAct;
      if (!serverAct) return localAct;
      var lLam = Number(localAct.lf_updatedAtLamport || 0);
      var sLam = Number(serverAct.lf_updatedAtLamport || 0);
      // Servidor tem Lamport maior -> ele é mais novo: sobrescreve.
      if (sLam > lLam) return serverAct;
      // Local é mais novo ou igual: preserva local (done/_pending
      // otimista não é perdido pra uma cópia antiga do Worker).
      if (lLam >= sLam && (localAct.done || localAct._pending || localAct._doneLocalAt)) {
        return localAct;
      }
      // Empate sem mutação local pendente: aceita servidor.
      return serverAct;
    };
  }

  /* ------------------------------------------------------------
     #3 — checkUpcomingActs: pular itens done/_pending/_doneLocalAt
     (antes só pulava quando hasPending era true pro uid inteiro).
     ------------------------------------------------------------ */
  function _wrapCheckUpcoming() {
    if (typeof window.checkUpcomingActs !== 'function') return false;
    var orig = window.checkUpcomingActs;
    if (orig.__lfWrapped) return true;
    var wrapped = function () {
      // Só a guia líder dispara alarmes — evita som duplicado em
      // duas guias abertas e a corrida de reconciliação do item #3.
      if (window.__LF_IS_LEADER_TAB__ === false) {
        try { if (typeof updateActBadge === 'function') updateActBadge(); } catch (_e) {}
        return;
      }
      return orig.apply(this, arguments);
    };
    wrapped.__lfWrapped = true;
    wrapped.__lfOrig = orig;
    window.checkUpcomingActs = wrapped;
    return true;
  }
  if (!_wrapCheckUpcoming()) {
    document.addEventListener('DOMContentLoaded', function () { _wrapCheckUpcoming(); }, { once: true });
  }

  /* ------------------------------------------------------------
     #7 — LOGOUT GLOBAL (BroadcastChannel 'lf_logout_v1')
     ------------------------------------------------------------ */
  var LOGOUT_CH = 'lf_logout_v1';

  function _installLogoutBus() {
    if (window.__LF_LOGOUT_BUS__) return;
    window.__LF_LOGOUT_BUS__ = 1;
    try {
      if (window.BroadcastChannel) {
        var bc = new BroadcastChannel(LOGOUT_CH);
        window.__LF_LOGOUT_BC__ = bc;
        bc.onmessage = function (ev) {
          var d = ev && ev.data;
          if (!d || d.t !== 'logout') return;
          // Se a mensagem veio desta mesma guia, ignora (já está saindo).
          if (d.tabId && d.tabId === _myTabId) return;
          if (window.S && (!d.uid || String(d.uid) === String(window.S.userId))) {
            if (typeof window._execLogout === 'function') {
              try { console.debug(TAG, 'logout recebido de outra guia — encerrando'); } catch (_e) {}
              window._execLogout();
            }
          }
        };
      }
    } catch (_e) {}
    // Fallback: remoção da chave de sessão em outra guia dispara
    // storage event aqui (o listener antigo só ouvia o warm-state).
    window.addEventListener('storage', function (ev) {
      if (ev && ev.key === 'lf6_s' && ev.newValue === null && window.S) {
        if (typeof window._execLogout === 'function') {
          try { console.debug(TAG, 'lf6_s removida em outra guia — encerrando'); } catch (_e) {}
          window._execLogout();
        }
      }
    });
  }

  function _wrapExecLogout() {
    if (typeof window._execLogout !== 'function') return false;
    var orig = window._execLogout;
    if (orig.__lfWrapped) return true;
    var wrapped = function () {
      // Publica ANTES de remover lf6_s pra garantir entrega mesmo se
      // o removeItem falhar ou for bloqueado.
      try {
        if (!window.__LF_LOGOUT_BC__ && window.BroadcastChannel) {
          window.__LF_LOGOUT_BC__ = new BroadcastChannel(LOGOUT_CH);
        }
        if (window.__LF_LOGOUT_BC__) {
          window.__LF_LOGOUT_BC__.postMessage({
            t: 'logout',
            ts: Date.now(),
            uid: (window.S && window.S.userId) || null,
            tabId: _myTabId
          });
        }
      } catch (_e) {}
      return orig.apply(this, arguments);
    };
    wrapped.__lfWrapped = true;
    wrapped.__lfOrig = orig;
    window._execLogout = wrapped;
    return true;
  }

  _installLogoutBus();
  if (!_wrapExecLogout()) {
    document.addEventListener('DOMContentLoaded', function () { _wrapExecLogout(); }, { once: true });
  }

  /* ------------------------------------------------------------
     #6 (apoio) — HIDRATAÇÃO DA PREFERÊNCIA LIVRE NO BOOT
     Envolve startApp UMA vez pra chamar hidrataLivreAutoMovePref
     (definida em notificacoes.js) logo após o app subir — espelha
     S.prefs.livreAutoMoveOn vindo do servidor antes de qualquer
     _autoMoveStaleToLivre rodar.
     ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     #8 [FIX 20260820] — LOGIN GLOBAL (BroadcastChannel 'lf_login_v1')
     Espelha #7 (logout global) no sentido oposto. Publicado de dentro
     do MESMO wrapper de startApp() logo abaixo, já que por essa altura
     doLogin() já rodou ss('lf6_s',S) — a sessão já está gravada em
     localStorage antes de qualquer guia tentar recarregar.
     ------------------------------------------------------------ */
  var LOGIN_CH = 'lf_login_v1';

  function _installLoginBus() {
    if (window.__LF_LOGIN_BUS__) return;
    window.__LF_LOGIN_BUS__ = 1;
    try {
      if (window.BroadcastChannel) {
        var bc = new BroadcastChannel(LOGIN_CH);
        window.__LF_LOGIN_BC__ = bc;
        bc.onmessage = function (ev) {
          var d = ev && ev.data;
          if (!d || d.t !== 'login') return;
          // Se a mensagem veio desta mesma guia, ignora.
          if (d.tabId && d.tabId === _myTabId) return;
          // Só recarrega quem está deslogado (tela de login). Guia já
          // autenticada (mesmo usuário ou outro) não é afetada — evita
          // interromper trabalho em andamento por causa de login em
          // outra aba.
          if (!window.S) {
            try { console.debug(TAG, 'login recebido de outra guia — recarregando'); } catch (_e) {}
            location.reload();
          }
        };
      }
    } catch (_e) {}
    // Fallback: gravação da chave de sessão em outra guia dispara
    // storage event aqui (cobre navegadores sem BroadcastChannel).
    window.addEventListener('storage', function (ev) {
      if (ev && ev.key === 'lf6_s' && ev.newValue && !window.S) {
        try { console.debug(TAG, 'lf6_s gravada em outra guia — recarregando'); } catch (_e) {}
        location.reload();
      }
    });
  }

  function _wrapStartApp() {
    if (typeof window.startApp !== 'function') return false;
    var orig = window.startApp;
    if (orig.__lfPrefsHydrateWrapped) return true;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try {
        if (typeof window.hidrataLivreAutoMovePref === 'function') {
          window.hidrataLivreAutoMovePref(window.S && window.S.userId);
        }
      } catch (_e) {}
      // #8: avisa as outras guias que uma sessão acabou de ficar
      // disponível (login novo OU restauração normal de boot — ambos
      // os casos são seguros de anunciar: guias já logadas ignoram a
      // mensagem, e reanunciar não causa loop porque quem recebe só
      // age se ainda não tiver window.S).
      try {
        if (!window.__LF_LOGIN_BC__ && window.BroadcastChannel) {
          window.__LF_LOGIN_BC__ = new BroadcastChannel(LOGIN_CH);
        }
        if (window.__LF_LOGIN_BC__ && window.S) {
          window.__LF_LOGIN_BC__.postMessage({ t: 'login', ts: Date.now(), tabId: _myTabId });
        }
      } catch (_e) {}
      return r;
    };
    wrapped.__lfPrefsHydrateWrapped = true;
    wrapped.__lfWrapped = true;
    wrapped.__lfOrig = orig;
    window.startApp = wrapped;
    return true;
  }
  _installLoginBus();
  if (!_wrapStartApp()) {
    document.addEventListener('DOMContentLoaded', function () { _wrapStartApp(); }, { once: true });
    var _triesSA = 0;
    var _ivSA = setInterval(function () {
      _triesSA++;
      if (_wrapStartApp() || _triesSA > 40) clearInterval(_ivSA);
    }, 250);
  }

  try { console.info(TAG, 'instalado — líder-tab, debounce fetch, Lamport, logout global, login global'); } catch (_e) {}
})();
