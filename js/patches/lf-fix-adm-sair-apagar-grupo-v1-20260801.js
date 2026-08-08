/* =====================================================================
 * lf-fix-adm-sair-apagar-grupo-v1-20260801.js
 * ---------------------------------------------------------------------
 * FIX RAIZ — "ADM (Hudson) apaga / exclui / desfaz grupo para TODOS,
 *             mas o grupo NÃO some para ele".
 *
 * CAUSAS-RAIZ CONFIRMADAS NO CÓDIGO
 * ---------------------------------------------------------------------
 * R1) js/patches/chat/visual/lf-chat-hotfix-20260731.js:82
 *     wrapRmInbox() envolve _chatRemoveInboxEntryForUsers e FILTRA o
 *     próprio usuário da lista de alvos:
 *         userIds = arr(userIds).filter(uid => uid && uid !== me)
 *     Consequência: a entrada REMOTA em chat_inbox_<hudson> nunca é
 *     apagada. _chatPullInboxConvs() lê esse doc a cada poll e
 *     re-injeta o grupo em lf13_chat_convs → ressurreição infinita.
 *
 * R2) js/patches/chat/visual/lf-chat-hotfix-20260731.js:100-102
 *     wrapUpsert() reinjeta o usuário em conv.participants sempre que
 *     ele estiver em conv.admins:
 *         if (me && participants.indexOf(me)<0 && admins.indexOf(me)>=0)
 *             conv.participants.unshift(me)
 *     Como Hudson é ADM sistêmico (hasAdminAccess()===true) e consta em
 *     admins de praticamente todo grupo, TODA saída/dissolução volta
 *     para a nuvem já com ele dentro. Pior: o doc remoto chat_conv_<id>
 *     continua listando-o, então o _chatSyncConvIndex() de QUALQUER
 *     outro participante recria a entrada de inbox dele.
 *
 * R3) prompt("APAGAR") — lf-fix-raiz-definitivo-v1:233 e
 *     lf-cacador-erro-definitivo-v4:580. Em PWA standalone / WebView
 *     (Capacitor, Android WebView, iOS standalone) prompt() é bloqueado
 *     e retorna null instantaneamente → toast("Cancelado") → o fluxo
 *     legítimo morre antes de começar.
 *
 * O QUE ESTE PATCH FAZ (tudo aditivo, idempotente e reversível)
 * ---------------------------------------------------------------------
 * P1) Reimplanta _chatRemoveInboxEntryForUsers com guarda PRECISA:
 *     a auto-remoção passa a ser permitida quando ela é legítima
 *     (conv dissolvida, eu já não sou participante, ticket de saída
 *     ativo ou conv inexistente localmente). Fora disso a proteção
 *     original contra remoção acidental continua valendo.
 * P2) Envolve _chatSyncConvUpsert por FORA: em contexto de saída/
 *     dissolução remove o uid do array admins ANTES de o wrapper do
 *     hotfix rodar — sem o gatilho, a reinjeção de R2 não acontece.
 * P3) enforceRemoteExit(): relê chat_conv_<id> e reescreve o doc sem o
 *     uid (ou zerado, se dissolve) com retries. Mata a re-entrada de
 *     inbox provocada por _chatSyncConvIndex() de terceiros.
 * P4) Lápides (tombstones) locais + wrapper em _chatSaveConvs e
 *     _chatPullInboxConvs: mesmo que algum doc atrasado traga o grupo
 *     de volta, ele não é persistido e a remoção remota é reemitida.
 *     Auto-cura: se o grupo voltar com updatedAt MAIOR que a lápide e
 *     comigo em participants (re-convite legítimo), a lápide cai.
 * P5) prompt() à prova de PWA/WebView: se o prompt nativo retornar
 *     null em menos de 30ms (= bloqueado, sem interação humana), cai
 *     para confirm() — que funciona em WebView — em vez de abortar.
 * P6) Watchdogs de reinstalação + API de diagnóstico window.LF_ADM_EXIT_FIX
 *
 * REVERTER: remover a tag <script> deste arquivo do index.html/app.html
 *           (ou rodar tools/rollback/rollback-adm-sair-apagar-grupo-20260801.sh).
 *           Nenhum arquivo existente é editado por este patch.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_FIX_ADM_SAIR_APAGAR_GRUPO_V1__) return;
  global.__LF_FIX_ADM_SAIR_APAGAR_GRUPO_V1__ = true;

  var D    = global.document;
  var LS   = global.localStorage;
  var TAG  = '[lf-fix-adm-sair-apagar-grupo v1-20260801]';
  var TOMB_KEY  = 'lf_chat_group_tombstones_v1';
  var TOMB_TTL  = 30 * 24 * 60 * 60 * 1000;  /* 30 dias */
  var TICKET_MS = 60 * 1000;                 /* janela de saída       */

  function log(){  try{ console.log.apply(console,   [TAG].concat([].slice.call(arguments))); }catch(_){} }
  function warn(){ try{ console.warn.apply(console,  [TAG].concat([].slice.call(arguments))); }catch(_){} }
  function safe(fn, fb){ try{ return fn(); }catch(_){ return fb; } }
  function arr(x){ return Array.isArray(x) ? x : []; }
  function meUid(){ return (global.S && global.S.userId) || ''; }

  function normUid(x){
    if (x == null) return '';
    if (typeof x === 'object') return String(x.uid || x.id || x.userId || '').trim();
    return String(x).trim();
  }
  function canon(x){
    if (typeof global._chatCanonicalUid === 'function') return safe(function(){ return global._chatCanonicalUid(x); }, normUid(x));
    return normUid(x).toLowerCase();
  }
  function sameUid(a, b){ a = canon(a); b = canon(b); return !!a && a === b; }
  function includesUid(list, uid){ return arr(list).some(function(u){ return sameUid(u, uid); }); }
  function withoutUid(list, uid){ return arr(list).filter(function(u){ return !sameUid(u, uid); }); }

  function getConvs(){
    return safe(function(){
      if (typeof global._chatGetConvs === 'function') return arr(global._chatGetConvs());
      var raw = LS.getItem('lf13_chat_convs');
      return raw ? arr(JSON.parse(raw)) : [];
    }, []);
  }
  function findConv(id){
    id = String(id || '');
    return getConvs().find(function(c){ return c && String(c.id) === id; }) || null;
  }
  function inboxDoc(uid){
    if (typeof global._chatInboxDocName === 'function') return global._chatInboxDocName(uid);
    return 'chat_inbox_' + String(uid || '');
  }

  /* ── Backend abstrato: worker API (padrão) ou firebase (legado) ────── */
  function backend(){
    var root = global.LiderCRM;
    var wc   = root && root.api && root.api.workerClient;
    if (root && root.config && root.config.useWorkerApi && wc &&
        typeof wc.getConfig === 'function' && typeof wc.putConfig === 'function'){
      return {
        kind: 'worker',
        get:  function(name){ return Promise.resolve(wc.getConfig(name)).catch(function(){ return null; }); },
        put:  function(name, payload){ return Promise.resolve(wc.putConfig(name, payload)).catch(function(){}); }
      };
    }
    if (global.DB_MODE === 'firebase' && global.db){
      var db = global.db;
      return {
        kind: 'firebase',
        get:  function(name){
          return db.collection('config').doc(name).get()
            .then(function(s){ return (s && s.exists) ? (s.data() || {}) : null; })
            .catch(function(){ return null; });
        },
        put:  function(name, payload){
          return db.collection('config').doc(name).set(payload).catch(function(){});
        }
      };
    }
    return null;
  }

  /* =====================================================================
   * P0 — LÁPIDES (tombstones) + TICKETS DE SAÍDA
   * ===================================================================== */
  var TICKETS = Object.create(null);

  function ticket(convId, kind){
    convId = String(convId || '');
    if (!convId) return;
    TICKETS[convId] = { ts: Date.now(), kind: kind || 'exit' };
  }
  function hasTicket(convId){
    var t = TICKETS[String(convId || '')];
    return !!(t && (Date.now() - t.ts) < TICKET_MS);
  }

  function readTombs(){
    var o = safe(function(){ return JSON.parse(LS.getItem(TOMB_KEY) || '{}'); }, {});
    if (!o || typeof o !== 'object') o = {};
    var now = Date.now(), dirty = false;
    Object.keys(o).forEach(function(k){
      var t = o[k];
      if (!t || typeof t.ts !== 'number' || (now - t.ts) > TOMB_TTL){ delete o[k]; dirty = true; }
    });
    if (dirty) safe(function(){ LS.setItem(TOMB_KEY, JSON.stringify(o)); });
    return o;
  }
  function writeTombs(o){ safe(function(){ LS.setItem(TOMB_KEY, JSON.stringify(o || {})); }); }
  function tombOf(convId){ return readTombs()[String(convId || '')] || null; }
  function isTombed(convId){ return !!tombOf(convId); }
  function addTomb(convId, reason){
    convId = String(convId || '');
    if (!convId) return;
    var o = readTombs();
    if (o[convId]) return;
    o[convId] = { ts: Date.now(), reason: reason || 'exit', by: meUid() };
    writeTombs(o);
    log('lápide criada para', convId, '(' + (reason || 'exit') + ')');
  }
  function dropTomb(convId){
    var o = readTombs();
    if (o[String(convId || '')]){ delete o[String(convId)]; writeTombs(o); log('lápide removida:', convId); }
  }

  /* Re-convite legítimo? conv voltou com updatedAt > lápide e comigo dentro. */
  function isLegitReinvite(conv){
    if (!conv || !conv.id) return false;
    var t = tombOf(conv.id);
    if (!t) return false;
    if (conv.dissolved) return false;
    if (!includesUid(conv.participants, meUid())) return false;
    var up = Date.parse(conv.updatedAt || '') || 0;
    return up > (t.ts + 1000);
  }

  /* =====================================================================
   * P1 — _chatRemoveInboxEntryForUsers COM GUARDA PRECISA
   * ---------------------------------------------------------------------
   * Substitui o filtro cego de R1. A auto-remoção é permitida quando o
   * estado prova que a saída é legítima; caso contrário, mantém a
   * proteção original (não apagar o próprio inbox por acidente).
   * ===================================================================== */
  function selfRemovalAllowed(convId){
    if (hasTicket(convId)) return true;
    if (isTombed(convId))  return true;
    var c = findConv(convId);
    if (!c) return true;                 /* já não existe local → saída consumada */
    if (c.dissolved) return true;        /* grupo desfeito                        */
    if (!includesUid(c.participants, meUid())) return true; /* já removido        */
    return false;
  }

  function rawRemoveInbox(convId, userIds){
    convId = String(convId || '').trim();
    var targets = [];
    arr(userIds).forEach(function(u){
      var uid = normUid(u);
      if (uid && targets.indexOf(uid) < 0) targets.push(uid);
    });
    if (!convId || !targets.length) return Promise.resolve();
    var be = backend();
    if (!be) return Promise.resolve();
    return Promise.all(targets.map(function(uid){
      var name = inboxDoc(uid);
      return be.get(name).then(function(doc){
        var payload = (doc && typeof doc === 'object') ? doc : {};
        var list = arr(payload.list);
        var next = list.filter(function(item){ return !(item && String(item.id) === convId); });
        if (next.length === list.length) return null;
        payload.list = next;
        payload.ts   = Date.now();
        return be.put(name, payload);
      });
    })).catch(function(e){ warn('rawRemoveInbox falhou', e && e.message); });
  }

  function installInboxRemover(){
    var fn = function(convId, userIds){
      var me = meUid();
      var targets = arr(userIds).map(normUid).filter(Boolean);
      var wantsSelf = targets.some(function(u){ return sameUid(u, me); });

      if (wantsSelf){
        if (selfRemovalAllowed(convId)){
          /* Saída legítima → registra lápide e deixa passar (correção de R1). */
          var c = findConv(convId);
          addTomb(convId, (c && c.dissolved) ? 'dissolve' : 'leave');
          ticket(convId, 'exit');
        } else {
          /* Proteção original preservada: não apaga meu inbox sem motivo. */
          targets = withoutUid(targets, me);
          warn('auto-remoção de inbox bloqueada (ainda sou participante ativo):', convId);
        }
      }
      if (!targets.length) return Promise.resolve();
      return rawRemoveInbox(convId, targets);
    };
    /* Carimbos: impedem que wrapRmInbox() do hotfix reembrulhe esta versão. */
    fn.__lfHotfixRmInbox = true;
    fn.__lfAdmExitFix    = true;
    global._chatRemoveInboxEntryForUsers = fn;
    log('P1 instalado — _chatRemoveInboxEntryForUsers com guarda precisa.');
    return fn;
  }

  /* =====================================================================
   * P2 — NEUTRALIZA A REINJEÇÃO admins→participants (R2)
   * ---------------------------------------------------------------------
   * Envolvemos por FORA a cadeia atual. Em contexto de saída, o uid é
   * retirado de admins ANTES de o wrapper do hotfix inspecionar o objeto:
   * sem gatilho, não há reinjeção — e nada do hotfix precisa ser editado.
   * ===================================================================== */
  function isExitContext(conv){
    if (!conv || !conv.isGroup) return false;
    var me = meUid();
    if (conv.dissolved) return true;
    if (hasTicket(conv.id)) return true;
    if (isTombed(conv.id)) return true;
    if (!includesUid(conv.participants, me)) return true;
    return false;
  }

  function installUpsertGuard(){
    var cur = global._chatSyncConvUpsert;
    if (typeof cur !== 'function'){ setTimeout(installUpsertGuard, 250); return; }
    if (cur.__lfAdmExitUpsert) return;

    var w = function(conv){
      var exiting = false, sanitized = conv;
      try{
        if (conv && conv.isGroup && isExitContext(conv)){
          exiting   = true;
          var me    = meUid();
          sanitized = Object.assign({}, conv);
          sanitized.participants = withoutUid(sanitized.participants, me);
          sanitized.admins       = withoutUid(sanitized.admins, me);   /* <<< mata R2 */
          if (sanitized.dissolved){
            sanitized.participants = [];
            sanitized.admins       = [];
          }
          if (sameUid(sanitized.createdBy, me) && sanitized.dissolved) sanitized.createdBy = '';
          ticket(conv.id, 'exit');
        }
      }catch(e){ warn('sanitize upsert falhou', e && e.message); }

      var out = cur.call(this, sanitized);
      if (exiting){
        var cid = (conv && conv.id) || (sanitized && sanitized.id);
        Promise.resolve(out).catch(function(){}).then(function(){
          enforceRemoteExit(cid, !!(conv && conv.dissolved));
        });
      }
      return out;
    };
    w.__lfAdmExitUpsert = true;
    w.__lfHotfixUpsert  = true;   /* impede reembrulho pelo hotfix */
    global._chatSyncConvUpsert = w;
    log('P2 instalado — reinjeção admins→participants neutralizada em saída.');
  }

  /* =====================================================================
   * P3 — enforceRemoteExit(): garante que o DOC REMOTO não me liste mais
   * ---------------------------------------------------------------------
   * Sem isto, o _chatSyncConvIndex() de qualquer outro participante
   * recria minha entrada de inbox na próxima mensagem do grupo.
   * ===================================================================== */
  var ENFORCE_DELAYS = [0, 2000, 8000];

  function enforceRemoteExit(convId, dissolve){
    convId = String(convId || '').trim();
    if (!convId) return Promise.resolve();
    var be = backend();
    if (!be) return Promise.resolve();
    var me = meUid();

    function once(){
      var name = 'chat_conv_' + convId;
      return be.get(name).then(function(doc){
        if (!doc || typeof doc !== 'object') return rawRemoveInbox(convId, [me]);
        var parts  = arr(doc.participants);
        var admins = arr(doc.admins);
        var needs  = dissolve
          ? (parts.length > 0 || admins.length > 0 || !doc.dissolved)
          : (includesUid(parts, me) || includesUid(admins, me));
        if (!needs) return rawRemoveInbox(convId, [me]);

        var victims = dissolve ? parts.slice() : [me];
        if (dissolve){
          doc.participants = [];
          doc.admins       = [];
          doc.dissolved    = true;
          doc.dissolvedAt  = doc.dissolvedAt || new Date().toISOString();
          doc.dissolvedBy  = doc.dissolvedBy || me;
        } else {
          doc.participants = withoutUid(parts, me);
          doc.admins       = withoutUid(admins, me);
        }
        doc.updatedAt = new Date().toISOString();
        return be.put(name, doc).then(function(){
          return rawRemoveInbox(convId, victims.length ? victims : [me]);
        });
      }).catch(function(e){ warn('enforceRemoteExit falhou', convId, e && e.message); });
    }

    ENFORCE_DELAYS.forEach(function(ms, i){
      if (i === 0) return;
      setTimeout(function(){ once(); }, ms);
    });
    return once();
  }

  /* =====================================================================
   * P4 — ANTI-RESSURREIÇÃO LOCAL
   *   a) _chatSaveConvs  → nunca persiste conv com lápide ativa
   *   b) _chatPullInboxConvs → após o pull, expurga e reemite a remoção
   * ===================================================================== */
  function installSaveGuard(){
    var cur = global._chatSaveConvs;
    if (typeof cur !== 'function'){ setTimeout(installSaveGuard, 250); return; }
    if (cur.__lfAdmExitSave) return;

    var w = function(list){
      var out = list;
      try{
        var tombs = readTombs();
        if (Object.keys(tombs).length){
          out = arr(list).filter(function(c){
            if (!c || !c.id) return true;
            if (!tombs[c.id]) return true;
            if (isLegitReinvite(c)){ dropTomb(c.id); return true; }  /* auto-cura */
            return false;
          });
          if (out.length !== arr(list).length){
            Object.keys(tombs).forEach(function(id){
              if (arr(list).some(function(c){ return c && c.id === id; })) reassertExit(id, tombs[id]);
            });
          }
        }
      }catch(e){ warn('saveGuard falhou', e && e.message); }
      return cur.call(this, out);
    };
    w.__lfAdmExitSave = true;
    /* ARMISTÍCIO 20260804: propaga o selo do guard do patch DM-delete-isolation
     * para o wrapper mais externo — encerra o ping-pong infinito entre os dois
     * watchdogs de _chatSaveConvs. */
    if (cur && cur.__lfDmDeleteIsolationSave) w.__lfDmDeleteIsolationSave = true;
    global._chatSaveConvs = w;
    log('P4a instalado — _chatSaveConvs não persiste conv com lápide.');
  }

  var REASSERT_LAST = Object.create(null);
  function reassertExit(convId, tomb){
    var now = Date.now();
    if (REASSERT_LAST[convId] && (now - REASSERT_LAST[convId]) < 15000) return;
    REASSERT_LAST[convId] = now;
    ticket(convId, 'exit');
    warn('grupo tentou ressuscitar — reemitindo saída remota:', convId);
    enforceRemoteExit(convId, !!(tomb && tomb.reason === 'dissolve'));
  }

  function installPullGuard(){
    var cur = global._chatPullInboxConvs;
    if (typeof cur !== 'function'){ setTimeout(installPullGuard, 250); return; }
    if (cur.__lfAdmExitPull) return;

    var w = function(){
      var out = cur.apply(this, arguments);
      return Promise.resolve(out).catch(function(){}).then(function(r){
        try{
          var tombs = readTombs();
          var ids   = Object.keys(tombs);
          if (!ids.length) return r;
          var convs = getConvs();
          var left  = convs.filter(function(c){
            if (!c || !c.id || !tombs[c.id]) return true;
            if (isLegitReinvite(c)){ dropTomb(c.id); return true; }
            reassertExit(c.id, tombs[c.id]);
            return false;
          });
          if (left.length !== convs.length){
            if (typeof global._chatSaveConvs === 'function') global._chatSaveConvs(left);
            if (typeof global.renderChatList === 'function') global.renderChatList();
          }
        }catch(e){ warn('pullGuard falhou', e && e.message); }
        return r;
      });
    };
    w.__lfAdmExitPull = true;
    global._chatPullInboxConvs = w;
    log('P4b instalado — pull não ressuscita grupo com lápide.');
  }

  /* =====================================================================
   * P5 — prompt() À PROVA DE PWA / WEBVIEW  (R3)
   * ---------------------------------------------------------------------
   * Em PWA standalone / WebView, prompt() é bloqueado: retorna null em
   * ~0ms sem exibir nada. Heurística: retorno null em menos de 30ms ⇒
   * bloqueado (não houve interação humana) ⇒ cai para confirm(), que é
   * suportado. Continua exigindo consentimento explícito do usuário.
   * ===================================================================== */
  function installPromptFallback(){
    var nativePrompt = global.prompt;
    if (typeof nativePrompt !== 'function') nativePrompt = null;
    if (nativePrompt && nativePrompt.__lfAdmExitPrompt) return;

    function expectedWord(msg){
      var m = String(msg || '').match(/\b(APAGAR|EXCLUIR|CONFIRMAR|DELETE)\b/i);
      return m ? m[1].toUpperCase() : '';
    }

    var shim = function(msg, def){
      var t0 = Date.now(), res = null, threw = false;
      if (nativePrompt){
        try{ res = nativePrompt.call(global, msg, def); }
        catch(_e){ threw = true; }
      } else { threw = true; }
      var fast = (Date.now() - t0) < 30;

      if (!threw && res !== null) return res;              /* prompt funcionou   */
      if (!threw && res === null && !fast) return null;    /* usuário cancelou   */

      /* Bloqueado pelo ambiente → fallback com consentimento real. */
      var word = expectedWord(msg);
      warn('prompt() bloqueado no ambiente — usando confirm() como fallback.');
      var ok = safe(function(){
        return global.confirm(String(msg || 'Confirmar ação?') +
          (word ? '\n\n[OK = ' + word + ' / Cancelar = abortar]' : ''));
      }, false);
      if (!ok) return null;
      return word || (def != null ? def : 'OK');
    };
    shim.__lfAdmExitPrompt = true;
    global.prompt = shim;
    log('P5 instalado — prompt() com fallback para confirm() em PWA/WebView.');
  }

  /* =====================================================================
   * P6 — API PÚBLICA + WATCHDOGS
   * ===================================================================== */
  function forceLeave(convId){
    convId = String(convId || global._chatCurrentConv || '');
    if (!convId) return warn('forceLeave: sem convId');
    var conv = findConv(convId);
    ticket(convId, 'exit');
    addTomb(convId, 'leave');
    if (conv){
      var next = Object.assign({}, conv);
      next.participants = withoutUid(next.participants, meUid());
      next.admins       = withoutUid(next.admins, meUid());
      next.updatedAt    = new Date().toISOString();
      safe(function(){ global._chatSyncConvUpsert(next); });
    }
    enforceRemoteExit(convId, false);
    purgeLocal(convId);
    log('forceLeave executado:', convId);
  }

  function forceDissolve(convId){
    convId = String(convId || global._chatCurrentConv || '');
    if (!convId) return warn('forceDissolve: sem convId');
    var conv = findConv(convId);
    ticket(convId, 'exit');
    addTomb(convId, 'dissolve');
    if (conv){
      var next = Object.assign({}, conv);
      next.dissolved    = true;
      next.dissolvedAt  = new Date().toISOString();
      next.dissolvedBy  = meUid();
      next.updatedAt    = next.dissolvedAt;
      var everyone      = arr(conv.participants).slice();
      next.participants = [];
      next.admins       = [];
      safe(function(){ global._chatSyncConvUpsert(next); });
      safe(function(){ if (everyone.length) rawRemoveInbox(convId, everyone); });
    }
    enforceRemoteExit(convId, true);
    purgeLocal(convId);
    log('forceDissolve executado:', convId);
  }

  function purgeLocal(convId){
    var list = getConvs().filter(function(c){ return !(c && c.id === convId); });
    safe(function(){ global._chatSaveConvs(list); });
    safe(function(){ LS.removeItem('lf13_chat_msgs_' + convId); });
    if (global._chatCurrentConv === convId && typeof global.closeChatConv === 'function'){
      safe(function(){ global.closeChatConv(); });
    }
    safe(function(){ if (typeof global.renderChatList === 'function') global.renderChatList(); });
  }

  function diag(){
    var f = global._chatRemoveInboxEntryForUsers;
    var u = global._chatSyncConvUpsert;
    var s = global._chatSaveConvs;
    var p = global._chatPullInboxConvs;
    var out = {
      versao: 'lf-fix-adm-sair-apagar-grupo v1-20260801',
      uid: meUid(),
      admSistemico: safe(function(){ return typeof global.hasAdminAccess === 'function' && !!global.hasAdminAccess(); }, null),
      backend: safe(function(){ var b = backend(); return b ? b.kind : 'nenhum'; }, 'erro'),
      P1_inboxRemoverFixado: !!(f && f.__lfAdmExitFix),
      P2_upsertGuardAtivo:   !!(u && u.__lfAdmExitUpsert),
      P4a_saveGuardAtivo:    !!(s && s.__lfAdmExitSave),
      P4b_pullGuardAtivo:    !!(p && p.__lfAdmExitPull),
      P5_promptShimAtivo:    !!(global.prompt && global.prompt.__lfAdmExitPrompt),
      lapides: readTombs(),
      tickets: Object.keys(TICKETS)
    };
    try{ console.table([out]); }catch(_){}
    return out;
  }

  function installWatchdogs(){
    setInterval(function(){
      var f = global._chatRemoveInboxEntryForUsers;
      if (!f || !f.__lfAdmExitFix){ installInboxRemover(); warn('P1 sobrescrito — reinstalado.'); }
      var u = global._chatSyncConvUpsert;
      if (typeof u === 'function' && !u.__lfAdmExitUpsert) installUpsertGuard();
      var s = global._chatSaveConvs;
      if (typeof s === 'function' && !s.__lfAdmExitSave) installSaveGuard();
      var p = global._chatPullInboxConvs;
      if (typeof p === 'function' && !p.__lfAdmExitPull) installPullGuard();
      if (global.prompt && !global.prompt.__lfAdmExitPrompt) installPromptFallback();
    }, 3000);
  }

  function boot(){
    installInboxRemover();
    installUpsertGuard();
    installSaveGuard();
    installPullGuard();
    installPromptFallback();
    installWatchdogs();

    global.LF_ADM_EXIT_FIX = {
      diag:          diag,
      forceLeave:    forceLeave,
      forceDissolve: forceDissolve,
      tombstones:    readTombs,
      untomb:        function(id){ dropTomb(id); if (typeof global.renderChatList === 'function') global.renderChatList(); },
      untombAll:     function(){ writeTombs({}); if (typeof global.renderChatList === 'function') global.renderChatList(); },
      enforce:       enforceRemoteExit
    };
    log('ativo. Diagnóstico: LF_ADM_EXIT_FIX.diag()');
  }

  if (D && D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})(window);
