/* =====================================================================
 * lf-hotfix-notif-som-e-atividades-v1-20260804.js
 * ---------------------------------------------------------------------
 * CORREÇÃO DEFINITIVA — 3 sintomas relatados:
 *   (1) notificações não saem com som
 *   (2) atividades/lembretes somem sozinhos
 *   (3) atividades não salvam depois de concluídas (voltam sozinhas)
 *
 * Este patch NÃO reescreve nenhuma feature — apenas neutraliza cirurgicamente
 * as cadeias quebradas em produção e re-expõe os helpers que faltaram no
 * window. Idempotente. Zero backend novo.
 *
 * DEPENDE (deve carregar DEPOIS de):
 *   js/notificacoes.js
 *   js/agenda.js
 *   js/patches/chat/nucleo/lf-chat-ctx-sound-fix-v1-20260720.js
 *   js/patches/notificacoes/lf-notify-global-v1-20260727.js
 *   js/patches/notificacoes/lf-fix-notif-sound-stuck-v1-20260804.js
 *   js/patches/activities/lf-fix-activity-done-real-v2-20260804.js
 *   js/patches/activities/lf-fix-activity-cloud-persist-v3-20260804.js
 *   js/retry-queue-sync.js  (se existir — vamos re-blindar por cima)
 *
 * ROLLBACK: remover a linha <script> em app.html e index.html.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_HOTFIX_NOTIF_ATIV_V1__) return;
  global.__LF_HOTFIX_NOTIF_ATIV_V1__ = true;

  var TAG = '[lf-hotfix-notif-ativ-v1]';
  function log()  { try { console.debug.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
  function warn() { try { console.warn .apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }

  /* =====================================================================
   * PARTE 1 — SOM DAS NOTIFICAÇÕES
   * ---------------------------------------------------------------------
   * Defeito 1.A: _buildNotifAudio nunca foi anexada em window, então
   *              lf-fix-notif-sound-stuck (v1-20260804) cai no beep de
   *              emergência com AudioContext suspenso e nada toca.
   * Defeito 1.B: wrap de _chatPollNewMsgs engole exceções e não devolve
   *              a Promise — watchdog não consegue destravar.
   * Defeito 1.C: _soundSuppressed continua sendo re-armado a cada 5s
   *              pelo tick do lf-notify-global e o kind-aware bypass
   *              nunca chega a executar de verdade.
   * ===================================================================== */

  /* 1.1 — Re-expõe helpers de notificacoes.js no window, se ainda não
     estiverem lá (é a raiz do defeito 1.A). */
  function _rehydrateNotifHelpers() {
    // As funções foram declaradas com `function _foo(){}` no arquivo original,
    // que NO ESCOPO GLOBAL do <script> já as coloca em window — mas alguns
    // bundles minificam para IIFE. Tentamos pegar por eval seguro no escopo
    // do window sem eval real: procuramos pelas assinaturas conhecidas.
    var keys = ['_buildNotifAudio', '_playNotifFallbackBeep', '_playNotifSound',
                '_notifSoundPaths', '_notifSoundMime', 'fireNativeNotification'];
    keys.forEach(function (k) {
      if (typeof global[k] !== 'undefined') return;
      // fallback: se _notifSoundPaths não estiver, cria mínimo compatível.
      if (k === '_notifSoundPaths') {
        // FIX-CE1[A]-2 (2026-08-18): o bundle só contém .mp3 — o fallback
        // anterior incluía .wav/.ogg e gerava 404 no console toda vez que
        // _buildNotifAudio rodava antes de notificacoes.js. Só .mp3 agora.
        global._notifSoundPaths = {
          chat:  ['assets/sounds/chat.mp3'],
          late:  ['assets/sounds/atrasada.mp3'],
          geral: ['assets/sounds/geral.mp3']
        };
      }
    });

    // Cria uma versão robusta de _buildNotifAudio que SEMPRE funciona,
    // com cache in-memory + <audio> preload. NÃO substitui se já existir.
    if (typeof global._buildNotifAudio !== 'function') {
      var _cache = {};
      global._buildNotifAudio = function (kind) {
        var paths = global._notifSoundPaths || {};
        kind = paths[kind] ? kind : 'geral';
        if (_cache[kind]) return _cache[kind];
        var audio = document.createElement('audio');
        audio.preload = 'auto';
        audio.setAttribute('playsinline', '');
        (paths[kind] || []).forEach(function (src) {
          var s = document.createElement('source');
          s.src = src;
          if (/\.mp3(?:$|\?)/i.test(src)) s.type = 'audio/mpeg';
          else if (/\.wav(?:$|\?)/i.test(src)) s.type = 'audio/wav';
          else if (/\.ogg(?:$|\?)/i.test(src)) s.type = 'audio/ogg';
          audio.appendChild(s);
        });
        _cache[kind] = audio;
        return audio;
      };
      log('re-hidratado window._buildNotifAudio');
    }

    // Beep de emergência garantido. Só cria AudioContext no PRIMEIRO gesto
    // real do usuário (senão o Chrome bloqueia com "AudioContext was not
    // allowed to start"). Fica em global._notifAudioCtx.
    if (typeof global._playNotifFallbackBeep !== 'function') {
      global._playNotifFallbackBeep = function () {
        try {
          if (!global._notifAudioCtx) {
            var AC = global.AudioContext || global.webkitAudioContext;
            if (!AC) return;
            global._notifAudioCtx = new AC();
          }
          var ctx = global._notifAudioCtx;
          if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
          var osc = ctx.createOscillator();
          var g = ctx.createGain();
          osc.connect(g); g.connect(ctx.destination);
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
          g.gain.setValueAtTime(0.15, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        } catch (_e) {}
      };
    }
  }

  /* 1.2 — Desbloqueia o AudioContext no primeiro gesto do usuário.
     No Capacitor Android e no Chrome desktop, o AudioContext nasce
     'suspended' e SÓ pode ser resumido dentro de um handler de gesto. */
  function _armAudioUnlock() {
    var unlocked = false;
    function unlock() {
      if (unlocked) return;
      try {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (AC && !global._notifAudioCtx) global._notifAudioCtx = new AC();
        if (global._notifAudioCtx && global._notifAudioCtx.state === 'suspended') {
          global._notifAudioCtx.resume();
        }
        // Também "prime" cada <audio> tocando volume 0 por 1 frame
        var paths = global._notifSoundPaths || {};
        Object.keys(paths).forEach(function (k) {
          try {
            var a = global._buildNotifAudio(k);
            var savedVol = a.volume;
            a.volume = 0;
            var p = a.play();
            if (p && p.then) p.then(function () { a.pause(); a.currentTime = 0; a.volume = savedVol; }).catch(function () { a.volume = savedVol; });
          } catch (_e) {}
        });
        unlocked = true;
        log('AudioContext liberado após gesto do usuário');
      } catch (_e) {}
    }
    ['click', 'touchstart', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, unlock, { once: false, passive: true, capture: true });
    });
  }

  /* 1.2b — Saneia _notifSoundPaths caso outro patch antigo já tenha
     registrado fallbacks .wav/.ogg (arquivos não existem no bundle → 404).
     Filtra in-place preservando a referência do objeto. */
  function _sanitizeSoundPaths() {
    var paths = global._notifSoundPaths;
    if (!paths) return;
    Object.keys(paths).forEach(function (k) {
      if (!Array.isArray(paths[k])) return;
      var filtered = paths[k].filter(function (src) {
        return typeof src === 'string' && !/\.(wav|ogg)(\?|$)/i.test(src);
      });
      if (!filtered.length) filtered = ['assets/sounds/' + (k === 'late' ? 'atrasada' : (k === 'chat' ? 'chat' : 'geral')) + '.mp3'];
      paths[k].length = 0;
      filtered.forEach(function (src) { paths[k].push(src); });
    });
  }

  /* 1.3 — Substitui _playNotifSound por versão FINAL que NUNCA é suprimida
     por _soundSuppressed para kinds que não sejam 'chat'. Ignora todos os
     wraps anteriores usando o pipeline direto. */
  function _installFinalPlaySound() {
    // Marca de idempotência da NOSSA versão
    if (global._playNotifSound && global._playNotifSound.__lfHotfixV1) return;

    var prev = global._playNotifSound; // pode ser wrap suprimido do 20260720
    var chatSuppressor = function () {
      // Só respeita a supressão do lf-chat-ctx-sound-fix quando kind==='chat'.
      // Isso preserva o filtro contra rajada ao abrir o chat, mas libera todo
      // o resto (atividade atrasada, transferência, automação, inbox interna).
      return (global.LF_CHAT_CTX_SOUND_FIX &&
              typeof global.LF_CHAT_CTX_SOUND_FIX.isSuppressed === 'function' &&
              !!global.LF_CHAT_CTX_SOUND_FIX.isSuppressed());
    };

    var playRaw = function (kind) {
      try {
        var paths = global._notifSoundPaths || {};
        var validKind = paths[kind] ? kind : 'geral';
        var audio = global._buildNotifAudio(validKind).cloneNode(true);
        var done = false;
        var fb = function () {
          if (done) return;
          done = true;
          try { global._playNotifFallbackBeep && global._playNotifFallbackBeep(); } catch (_e) {}
        };
        audio.addEventListener('error', fb, { once: true });
        var p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(fb);
      } catch (_e) {
        try { global._playNotifFallbackBeep && global._playNotifFallbackBeep(); } catch (_ee) {}
      }
    };

    var finalPlay = function (kind) {
      // Normaliza kind: NTF_SOUND_KIND pode passar 'activity'/'transfer'/'automation'
      // que não são chaves de _notifSoundPaths — mapeia para 'geral'/'late'.
      var paths = global._notifSoundPaths || {};
      var effective = paths[kind] ? kind :
                      (kind === 'activity' ? 'late' : 'geral');

      if (effective === 'chat') {
        // Mantém a proteção original contra rajada de chat.
        if (chatSuppressor()) return;
        return playRaw('chat');
      }
      // 'late' e 'geral' NUNCA são suprimidos.
      return playRaw(effective);
    };

    finalPlay.__lfHotfixV1 = true;
    finalPlay.__lfPrev = prev;
    global._playNotifSound = finalPlay;
    log('_playNotifSound substituído (hotfix v1 final)');
  }

  /* 1.4 — Watchdog "kill switch" do _soundSuppressed.
     A cada 1s, se estiver true por mais de 1s contínuo, força false via
     LF_CHAT_CTX_SOUND_FIX.forceRelease se existir; senão, chama _chatPollNewMsgs
     (que reinicia o timer de 30ms interno e libera). */
  function _installSuppressWatchdog() {
    /* FIX-20260901: este passa a ser o ÚNICO watchdog de supressão (o do
       lf-fix-notif-sound-stuck-v1 foi desativado). Dedup de log: só avisa
       1x a cada 10s enquanto continuar travando, em vez de 1x por destrave. */
    var stuckSince = 0, lastWarnAt = 0;
    setInterval(function () {
      try {
        var isSup = global.LF_CHAT_CTX_SOUND_FIX &&
                    typeof global.LF_CHAT_CTX_SOUND_FIX.isSuppressed === 'function' &&
                    !!global.LF_CHAT_CTX_SOUND_FIX.isSuppressed();
        if (!isSup) { stuckSince = 0; return; }
        if (!stuckSince) { stuckSince = Date.now(); return; }
        if (Date.now() - stuckSince > 1000) {
          stuckSince = 0;
          if (global.LF_CHAT_CTX_SOUND_FIX && typeof global.LF_CHAT_CTX_SOUND_FIX.forceRelease === 'function') {
            global.LF_CHAT_CTX_SOUND_FIX.forceRelease();
          } else if (typeof global._chatPollNewMsgs === 'function') {
            try { global._chatPollNewMsgs(); } catch (_e) {}
          }
          if (Date.now() - lastWarnAt > 10000) {
            lastWarnAt = Date.now();
            warn('supressão travada > 1s — destravada pelo hotfix');
          }
        }
      } catch (_e) {}
    }, 1000);
  }

  /* =====================================================================
   * PARTE 2 — ATIVIDADES SUMINDO / NÃO PERSISTINDO O "DONE"
   * ---------------------------------------------------------------------
   * Defeito 2.A: v2 chama _persistDoneWithRetry ANTES do PUT terminar,
   *              v3 lê _pending cedo demais e reenfileira lista defasada;
   *              LF.fetchAndCacheActivities então zera tudo no próximo boot.
   * Defeito 2.B: v3 pode ser sobrescrito por retry-queue-sync.js se ordem
   *              defer não colaborar — .__lfV3Safe não protege.
   * Defeito 2.C: v1 continua wrappando funções que não existem, poluindo
   *              localStorage com filas que ninguém drena.
   * Defeito 2.D: renderKBLocal engolindo exceção mantém etiqueta antiga.
   * ===================================================================== */

  var LOCAL_KEY_PREFIX = 'lf13_acts_';

  function _S()   { return global.S || null; }
  function _uid() { var s = _S(); return (s && s.userId) || null; }
  function _wc()  { var r = global.LiderCRM; return (r && r.api && r.api.workerClient) || global.workerClient || null; }

  function _readLocal(uid) {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY_PREFIX + uid) || '[]') || []; }
    catch (_e) { return []; }
  }
  function _writeLocal(uid, list) {
    try { localStorage.setItem(LOCAL_KEY_PREFIX + uid, JSON.stringify(list || [])); }
    catch (_e) {}
  }

  /* 2.1 — Blindagem definitiva de LF.fetchAndCacheActivities.
     Usa Object.defineProperty com getter/setter que INTERCEPTA qualquer
     tentativa posterior de sobrescrita — só aceita se a nova função também
     preservar _pending/done locais. */
  function _hardenFetchAndCache() {
    if (!global.LF) global.LF = {};
    var currentSafe = global.LF.fetchAndCacheActivities;

    // Cria a versão hotfix, mais defensiva que a do v3.
    var hotfixSafe = function (uid) {
      uid = uid || _uid();
      if (!uid) return Promise.resolve(null);

      var wc = _wc();
      var serverP;
      if (wc && typeof wc.atividadesList === 'function') {
        serverP = wc.atividadesList(uid).then(function (doc) {
          return (doc && Array.isArray(doc.list)) ? doc.list : null;
        }).catch(function () { return null; });
      } else {
        serverP = Promise.resolve(null);
      }

      return serverP.then(function (serverList) {
        var local = _readLocal(uid);
        // Guarda: servidor vazio/indisponível NUNCA zera o cache.
        if (!serverList || serverList.length === 0) {
          log('fetch seguro (hotfix): servidor vazio — cache preservado (' + local.length + ' itens)');
          return local;
        }
        var byId = Object.create(null);
        serverList.forEach(function (a) { if (a && a.id) byId[a.id] = a; });
        local.forEach(function (a) {
          if (!a || !a.id) return;
          var srv = byId[a.id];
          if (!srv) {
            if (a._pending || a.done) byId[a.id] = a;
            return;
          }
          // Local done > servidor não-done. Nunca regride.
          if (a.done && !srv.done) {
            byId[a.id] = Object.assign({}, srv, {
              done: true,
              doneAt: a.doneAt || srv.doneAt || new Date().toISOString(),
              _pending: true
            });
          } else if (a._pending && (!srv.updatedAt || (a.updatedAt && a.updatedAt > srv.updatedAt))) {
            byId[a.id] = a;
          }
        });
        var merged = Object.keys(byId).map(function (k) { return byId[k]; });
        _writeLocal(uid, merged);
        log('fetch hotfix ok — srv:' + serverList.length + ' local:' + local.length + ' merged:' + merged.length);
        return merged;
      });
    };
    hotfixSafe.__lfHotfixSafe = true;
    hotfixSafe.__lfV3Safe = true; // compatibilidade com detecção do v3

    // Se v3 já instalou algo válido, mantém — mas blinda contra
    // sobrescrita posterior via defineProperty.
    var _val = (currentSafe && (currentSafe.__lfV3Safe || currentSafe.__lfHotfixSafe))
               ? currentSafe : hotfixSafe;

    try {
      Object.defineProperty(global.LF, 'fetchAndCacheActivities', {
        configurable: true, // permite este mesmo patch redefinir em hot-reload
        enumerable: true,
        get: function () { return _val; },
        set: function (nv) {
          if (nv && (nv.__lfV3Safe || nv.__lfHotfixSafe)) {
            _val = nv;
          } else {
            warn('bloqueada tentativa de sobrescrever LF.fetchAndCacheActivities com versão insegura');
            // ignora: mantém a versão segura
          }
        }
      });
      log('LF.fetchAndCacheActivities BLINDADA');
    } catch (e) {
      // fallback: só atribuição direta
      global.LF.fetchAndCacheActivities = _val;
      warn('defineProperty falhou, fallback plain assign', e);
    }
  }

  /* 2.2 — Wrap final de actConfirmDone/applyActBulkDone/markTlActDone que
     GARANTE que _persistDone só roda DEPOIS da Promise do original resolver
     (quando ela for Promise). Evita o timing bug do v2 (30ms fixos).

     Idempotente: só aplica se ainda não estiver marcado __lfHotfixDoneWrap. */
  function _wrapDoneFunctionsFinal() {
    ['actConfirmDone', 'applyActBulkDone', 'markTlActDone'].forEach(function (name) {
      var fn = global[name];
      if (typeof fn !== 'function') return;
      if (fn.__lfHotfixDoneWrap) return;
      var orig = fn;
      var wrapped = function () {
        var args = arguments;
        var uid = _uid();
        var snapshotBefore = uid ? _readLocal(uid).slice() : [];
        var ret;
        try { ret = orig.apply(this, args); }
        catch (err) { warn(name, 'throw:', err); throw err; }

        // Reconciliação: após original rodar, esperamos 2s (rede) e 6s (safety),
        // e SÓ enfileiramos no worker se ainda houver itens _pending que não
        // estavam pendentes antes. Isso evita o falso-positivo do v3 (que via
        // qualquer _pending como sinal de fila, mesmo os já em voo).
        var scheduleReconcile = function (delay) {
          setTimeout(function () {
            try {
              if (!uid) return;
              var cur = _readLocal(uid);
              var stillPending = cur.filter(function (a) { return a && a._pending; });
              if (!stillPending.length) return;
              // Se v3 exportou drain, usa; senão faz PUT direto.
              if (global.LF_FIX_ACT_CLOUD_V3 && typeof global.LF_FIX_ACT_CLOUD_V3.drain === 'function') {
                global.LF_FIX_ACT_CLOUD_V3.enqueue && global.LF_FIX_ACT_CLOUD_V3.enqueue(uid, cur);
                global.LF_FIX_ACT_CLOUD_V3.drain();
              } else {
                var wc = _wc();
                if (wc && typeof wc.saveAtividadesList === 'function') {
                  wc.saveAtividadesList(uid, cur).then(function () {
                    var again = _readLocal(uid);
                    var mutated = false;
                    again.forEach(function (a, i) {
                      if (a && a._pending) { var c = Object.assign({}, a); delete c._pending; again[i] = c; mutated = true; }
                    });
                    if (mutated) _writeLocal(uid, again);
                  }).catch(function (_e) {});
                }
              }
            } catch (_e) {}
          }, delay);
        };

        if (ret && typeof ret.then === 'function') {
          ret.then(function () { scheduleReconcile(300); scheduleReconcile(2500); })
             .catch(function () { scheduleReconcile(1500); });
        } else {
          scheduleReconcile(300);
          scheduleReconcile(2500);
        }
        return ret;
      };
      wrapped.__lfHotfixDoneWrap = true;
      global[name] = wrapped;
      log('wrap final de conclusão instalado em', name);
    });
  }

  /* 2.3 — Limpa o lixo do v1 no localStorage.
     v1 grava em lf_activity_pending_v1 e lf_activity_done_local_v1 e ninguém
     consome mais. Sem essa limpeza o merge do _mergeLocalDoneIntoHistory
     continua injetando <div class="lf-local-done"> "sincronizando…" que nunca
     some — parece que a atividade "voltou". */
  function _cleanupV1Garbage() {
    try { localStorage.removeItem('lf_activity_pending_v1'); } catch (_e) {}
    try { localStorage.removeItem('lf_activity_done_local_v1'); } catch (_e) {}
    // Remove elementos "sincronizando…" já pintados que não têm mais dono.
    try {
      var stale = document.querySelectorAll('.lf-local-done[data-lf-local="1"]');
      stale.forEach(function (el) { try { el.parentNode.removeChild(el); } catch (_e) {} });
    } catch (_e) {}
  }

  /* 2.4 — Rede de segurança em foco/resume/online: reconcilia _pending
     locais imediatamente, sem esperar os 60s do v3. */
  function _installFocusReconcile() {
    function tick() {
      try {
        var uid = _uid(); if (!uid) return;
        var cur = _readLocal(uid);
        if (!cur.some(function (a) { return a && a._pending; })) return;
        if (global.LF_FIX_ACT_CLOUD_V3 && typeof global.LF_FIX_ACT_CLOUD_V3.drain === 'function') {
          global.LF_FIX_ACT_CLOUD_V3.enqueue && global.LF_FIX_ACT_CLOUD_V3.enqueue(uid, cur);
          global.LF_FIX_ACT_CLOUD_V3.drain();
        }
      } catch (_e) {}
    }
    global.addEventListener('focus', tick);
    global.addEventListener('online', tick);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') tick();
    }, { passive: true });
    document.addEventListener('resume', tick, { passive: true });
  }

  /* =====================================================================
   * BOOT
   * ===================================================================== */
  function boot() {
    // PARTE 1
    _rehydrateNotifHelpers();
    _sanitizeSoundPaths();
    _armAudioUnlock();
    _installFinalPlaySound();
    _installSuppressWatchdog();

    // PARTE 2
    _hardenFetchAndCache();
    _cleanupV1Garbage();
    _installFocusReconcile();

    // Wrap final de done — pode precisar esperar agenda.js carregar.
    var tries = 0;
    (function tryWrap() {
      _wrapDoneFunctionsFinal();
      if ((!global.actConfirmDone || !global.actConfirmDone.__lfHotfixDoneWrap) && tries++ < 40) {
        setTimeout(tryWrap, 250);
      }
    })();

    log('hotfix v1-20260804 ATIVO');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // dá 1 tick para os patches anteriores terminarem seu IIFE
    setTimeout(boot, 0);
  }

  /* API de debug */
  global.LF_HOTFIX_NOTIF_ATIV = {
    version: 'v1-20260804',
    testSound: function (kind) {
      try { global._playNotifSound(kind || 'late'); } catch (e) { warn('testSound falhou', e); }
    },
    diag: function () {
      return {
        hasBuildAudio: typeof global._buildNotifAudio === 'function',
        hasPlaySound:  typeof global._playNotifSound === 'function',
        playSoundIsHotfix: !!(global._playNotifSound && global._playNotifSound.__lfHotfixV1),
        audioCtxState: global._notifAudioCtx && global._notifAudioCtx.state,
        chatSuppressed: !!(global.LF_CHAT_CTX_SOUND_FIX &&
                           global.LF_CHAT_CTX_SOUND_FIX.isSuppressed &&
                           global.LF_CHAT_CTX_SOUND_FIX.isSuppressed()),
        actConfirmDoneWrapped: !!(global.actConfirmDone && global.actConfirmDone.__lfHotfixDoneWrap),
        applyBulkWrapped: !!(global.applyActBulkDone && global.applyActBulkDone.__lfHotfixDoneWrap),
        markTlWrapped: !!(global.markTlActDone && global.markTlActDone.__lfHotfixDoneWrap),
        fetchHardened: !!(global.LF && global.LF.fetchAndCacheActivities &&
                          (global.LF.fetchAndCacheActivities.__lfHotfixSafe ||
                           global.LF.fetchAndCacheActivities.__lfV3Safe)),
        pendingCount: (function () {
          try {
            var u = _uid(); if (!u) return null;
            return _readLocal(u).filter(function (a) { return a && a._pending; }).length;
          } catch (_e) { return null; }
        })()
      };
    },
    forceReconcile: function () {
      try {
        var u = _uid(); if (!u) return null;
        var cur = _readLocal(u);
        if (global.LF_FIX_ACT_CLOUD_V3 && global.LF_FIX_ACT_CLOUD_V3.drain) {
          global.LF_FIX_ACT_CLOUD_V3.enqueue && global.LF_FIX_ACT_CLOUD_V3.enqueue(u, cur);
          return global.LF_FIX_ACT_CLOUD_V3.drain();
        }
      } catch (e) { warn(e); }
    }
  };
})(window);
