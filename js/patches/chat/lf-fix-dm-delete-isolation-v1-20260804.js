/* =====================================================================
 * lf-fix-dm-delete-isolation-v1-20260804.js
 * ---------------------------------------------------------------------
 * FIX ESPECÍFICO — DM "excluir só pra mim" NÃO pode sumir para o outro.
 *
 * Problema atacado:
 *   • o fluxo de DM herdava uma cadeia de wrappers globais em chatDeleteConv
 *     e podia depender de comportamento acidental de patches de grupo;
 *   • a semântica de exclusão de DM não tinha uma camada canônica isolada;
 *   • reidratação/poll podiam reintroduzir ou purgar conversas sem um
 *     tombstone explícito por usuário.
 *
 * Estratégia deste patch:
 *   1) instala uma implementação CANÔNICA para DM (não delega para a
 *      cadeia antiga quando a conversa não é grupo);
 *   2) ao excluir uma DM, remove SOMENTE a entrada do inbox do usuário
 *      atual (chat_inbox_<me>) — nunca toca no inbox do outro participante;
 *   3) grava tombstone local por convId para a exclusão ser estável neste
 *      dispositivo/usuário;
 *   4) filtra tombstones em _chatSaveConvs; se a conversa voltar com
 *      updatedAt mais novo que o tombstone, trata como atividade nova e
 *      derruba a lápide automaticamente.
 *
 * Aditivo, idempotente e reversível.
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__LF_FIX_DM_DELETE_ISOLATION_V1__) return;
  global.__LF_FIX_DM_DELETE_ISOLATION_V1__ = true;

  var D  = global.document;
  var LS = global.localStorage;
  var TAG = '[lf-fix-dm-delete-isolation v1-20260804]';
  var TOMB_KEY = 'lf_chat_dm_deleted_tombstones_v1';
  var TOMB_TTL = 30 * 24 * 60 * 60 * 1000; /* 30 dias */

  function log(){ try{ console.log.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function warn(){ try{ console.warn.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function arr(x){ return Array.isArray(x) ? x : []; }
  function me(){ return (global.S && global.S.userId) || ''; }
  function nowIso(){ return new Date().toISOString(); }

  function getConvs(){
    return safe(function(){
      if (typeof global._chatGetConvs === 'function') return arr(global._chatGetConvs());
      return arr(JSON.parse(LS.getItem('lf13_chat_convs') || '[]'));
    }, []);
  }
  function findConv(convId){
    convId = String(convId || '');
    return getConvs().find(function(c){ return c && String(c.id) === convId; }) || null;
  }
  function saveConvs(list){
    if (typeof global._chatSaveConvs === 'function') return global._chatSaveConvs(list);
    try { LS.setItem('lf13_chat_convs', JSON.stringify(arr(list))); } catch(_e){}
  }
  function removeMsgBucket(convId){
    try { LS.removeItem('lf13_chat_msgs_' + convId); } catch(_e){}
  }

  function readTombs(){
    var out = safe(function(){ return JSON.parse(LS.getItem(TOMB_KEY) || '{}'); }, {});
    if (!out || typeof out !== 'object') out = {};
    var now = Date.now(), dirty = false;
    Object.keys(out).forEach(function(k){
      var t = out[k];
      if (!t || typeof t.ts !== 'number' || (now - t.ts) > TOMB_TTL) {
        delete out[k];
        dirty = true;
      }
    });
    if (dirty) safe(function(){ LS.setItem(TOMB_KEY, JSON.stringify(out)); });
    return out;
  }
  function writeTombs(map){ safe(function(){ LS.setItem(TOMB_KEY, JSON.stringify(map || {})); }); }
  function getTomb(convId){ return readTombs()[String(convId || '')] || null; }
  function addTomb(convId){
    convId = String(convId || '');
    if (!convId) return;
    var map = readTombs();
    map[convId] = { ts: Date.now(), by: me() };
    writeTombs(map);
  }
  function dropTomb(convId){
    var map = readTombs();
    if (map[String(convId || '')]) {
      delete map[String(convId || '')];
      writeTombs(map);
    }
  }

  function shouldKeepConv(conv){
    if (!conv || !conv.id || conv.isGroup) return true;
    var tomb = getTomb(conv.id);
    if (!tomb) return true;
    var updatedAt = Date.parse(conv.updatedAt || '') || 0;
    if (updatedAt > tomb.ts) {
      dropTomb(conv.id); /* nova atividade reabre a DM */
      return true;
    }
    return false;
  }

  function backend(){
    var root = global.LiderCRM;
    var wc = root && root.api && root.api.workerClient;
    if (root && root.config && root.config.useWorkerApi && wc && typeof wc.getConfig === 'function' && typeof wc.putConfig === 'function') {
      return {
        kind: 'worker',
        get: function(name){ return Promise.resolve(wc.getConfig(name)).catch(function(){ return null; }); },
        put: function(name, payload){ return Promise.resolve(wc.putConfig(name, payload)).catch(function(){}); }
      };
    }
    if (global.DB_MODE === 'firebase' && global.db) {
      var db = global.db;
      return {
        kind: 'firebase',
        get: function(name){
          return db.collection('config').doc(name).get()
            .then(function(snap){ return (snap && snap.exists) ? (snap.data() || {}) : null; })
            .catch(function(){ return null; });
        },
        put: function(name, payload){
          return db.collection('config').doc(name).set(payload).catch(function(){});
        }
      };
    }
    return null;
  }

  function inboxDocName(uid){
    if (typeof global._chatInboxDocName === 'function') return global._chatInboxDocName(uid);
    return 'chat_inbox_' + String(uid || '');
  }

  function removeOnlyMyInboxEntry(convId){
    convId = String(convId || '').trim();
    var uid = me();
    if (!convId || !uid) return Promise.resolve();
    var be = backend();
    if (!be) return Promise.resolve();
    var name = inboxDocName(uid);
    return be.get(name).then(function(doc){
      var payload = (doc && typeof doc === 'object') ? doc : {};
      var list = arr(payload.list);
      var next = list.filter(function(item){ return !(item && String(item.id) === convId); });
      if (next.length === list.length) return null;
      payload.list = next;
      payload.ts = Date.now();
      return be.put(name, payload);
    }).catch(function(e){ warn('removeOnlyMyInboxEntry falhou', e && e.message); });
  }

  function purgeLocalDm(convId){
    var list = getConvs().filter(function(c){ return !(c && String(c.id) === String(convId)); });
    saveConvs(list);
    removeMsgBucket(convId);
    try { if (global._chatLastMsgTs) delete global._chatLastMsgTs[convId]; } catch(_e){}
    if (global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') {
      safe(function(){ global.closeChatConv(); });
    }
    safe(function(){ if (typeof global.renderChatList === 'function') global.renderChatList(); });
    safe(function(){ if (typeof global._chatUpdateUnreadBadge === 'function') global._chatUpdateUnreadBadge(); });
  }

  function confirmDeleteDm(convId){
    var run = function(){
      addTomb(convId);
      purgeLocalDm(convId);
      removeOnlyMyInboxEntry(convId);
      if (typeof global.toast === 'function') global.toast('🗑 Conversa excluída só para você');
      if (typeof global._chatCloseCtxMenu === 'function') safe(function(){ global._chatCloseCtxMenu(); });
    };

    if (typeof global._confirmModal === 'function') {
      return global._confirmModal({
        title: '🗑 Excluir conversa?',
        msg: 'Esta ação remove a DM apenas para você neste dispositivo/conta. O outro participante continua vendo a conversa normalmente.',
        okLabel: 'Excluir',
        okClass: 'bd',
        onOk: run
      });
    }
    if (global.confirm && global.confirm('Excluir esta conversa só para você?')) run();
  }

  function installSaveGuard(){
    var cur = global._chatSaveConvs;
    if (typeof cur !== 'function') { setTimeout(installSaveGuard, 250); return; }
    if (cur.__lfDmDeleteIsolationSave) return;

    var w = function(list){
      var filtered = arr(list).filter(shouldKeepConv);
      return cur.call(this, filtered);
    };
    w.__lfDmDeleteIsolationSave = true;
    /* ARMISTÍCIO 20260804: propaga o selo do guard do patch ADM (P4a) para o
     * wrapper mais externo. Sem isso, o watchdog do ADM via seu selo ausente
     * e re-embrulhava, e este watchdog fazia o mesmo — ping-pong infinito e
     * pilha de wrappers crescendo sem parar. */
    if (cur && cur.__lfAdmExitSave) w.__lfAdmExitSave = true;
    global._chatSaveConvs = w;
    log('saveGuard instalado');
  }

  function installDeleteCanon(){
    var prev = global.chatDeleteConv;
    if (typeof prev !== 'function') { setTimeout(installDeleteCanon, 250); return; }
    if (prev.__lfDmDeleteIsolation) return;

    var w = function(convId){
      var conv = findConv(convId);
      if (!conv) {
        if (typeof global._chatCloseCtxMenu === 'function') safe(function(){ global._chatCloseCtxMenu(); });
        return;
      }
      if (conv.isGroup) return prev.apply(this, arguments);
      return confirmDeleteDm(convId);
    };
    w.__lfDmDeleteIsolation = true;
    if (prev && prev.__lfCancelFinal) w.__lfCancelFinal = true; /* armistício: sinaliza que a canônica de grupo está na cadeia */
    w.__lfPrevDelete = prev;
    global.chatDeleteConv = w;
    log('chatDeleteConv canônico para DM instalado');
  }

  function installWatchdog(){
    setInterval(function(){
      var fn = global.chatDeleteConv;
      if (!fn || !fn.__lfDmDeleteIsolation) {
        installDeleteCanon();
        warn('chatDeleteConv sobrescrito — reinstalado');
      }
      var save = global._chatSaveConvs;
      if (typeof save === 'function' && !save.__lfDmDeleteIsolationSave) {
        installSaveGuard();
        warn('_chatSaveConvs sobrescrito — reinstalado');
      }
    }, 2500);
  }

  function boot(){
    installSaveGuard();
    installDeleteCanon();
    installWatchdog();
    log('ativo');
  }

  if (D && D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})(window);
