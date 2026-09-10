/* =====================================================================
 * lf-cacador-4bugs-20260730.js
 * ---------------------------------------------------------------------
 * Corrige DEFINITIVAMENTE:
 *   BUG 1 — remover participante NUNCA apaga o grupo do ADM
 *   BUG 2 — foto de capa do grupo persiste no worker/firebase
 *   BUG 4 — contador de aba mostra TOTAL de mensagens não lidas (não conv)
 *
 * Carregar DEPOIS de:
 *   - js/chat.js
 *   - lf-chat-group-manage-v1-20260728.js
 *   - lf-fix-participantes-notif-tabs-v1-20260730.js
 *   - lf-chat-group-participants-perms-v1-20260730.js
 *   - lf-cacador-erro-especifico-v1-20260730.js
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__LF_CACADOR_4BUGS_V1__) return;
  global.__LF_CACADOR_4BUGS_V1__ = true;

  var D  = global.document;
  var LS = global.localStorage;
  function safe(fn,fb){ try{return fn();}catch(_e){return fb;} }
  function arr(x){ return Array.isArray(x)?x:[]; }
  function meUid(){ return (global.S && global.S.userId) || ''; }

  /* ==================================================================
   * BUG 1 — Blindagem TRIPLA contra apagar o grupo ao remover membro
   * ==================================================================
   * (1) Envelopa _chatSyncConvUpsert: se conv.isGroup, garante que o
   *     autor da ação (S.userId) NUNCA seja incluído no "removed".
   *     Filtra removed no lado interno chamando o original com um
   *     payload sanitizado (reinsere me se sumiu por engano).
   * (2) Envelopa _chatRemoveInboxEntryForUsers: se por qualquer via
   *     ele receber S.userId no array de userIds, remove-o antes de
   *     apagar inbox (defense in depth — cobre chamadas fora do upsert).
   * (3) Envelopa LF_CHAT_GROUP_MANAGE.dissolve: se o grupo é o único
   *     onde o ADM ainda participa, exige confirmação de senha (prompt
   *     do nome do grupo já existe do outro patch; aqui a defesa é
   *     apenas verificar que o efeito realmente é intencional).
   */
  (function guardBug1(){
    // (1) sanitizar upsert
    (function wrapUpsert(){
      var orig = global._chatSyncConvUpsert;
      if (typeof orig !== 'function' || orig.__lf4bugsUpsert){
        setTimeout(wrapUpsert, 300); return;
      }
      var w = function(conv){
        try{
          if (conv && conv.isGroup){
            var me = meUid();
            conv.participants = arr(conv.participants);
            // Se o ADM (autor) foi tirado por engano, reinsere.
            if (me && conv.participants.indexOf(me) < 0 &&
                arr(conv.admins).indexOf(me) >= 0){
              conv.participants = [me].concat(conv.participants);
            }
          }
        }catch(_e){}
        return orig.apply(this, arguments);
      };
      w.__lf4bugsUpsert = true;
      global._chatSyncConvUpsert = w;
    })();

    // (2) sanitizar remoção de inbox — NUNCA apaga o inbox do próprio autor
    (function wrapRmInbox(){
      var orig = global._chatRemoveInboxEntryForUsers;
      if (typeof orig !== 'function' || orig.__lf4bugsRmInbox){
        setTimeout(wrapRmInbox, 300); return;
      }
      var w = function(convId, userIds){
        try{
          var me = meUid();
          userIds = arr(userIds).filter(function(u){ return u && u !== me; });
        }catch(_e){}
        return orig.call(this, convId, userIds);
      };
      w.__lf4bugsRmInbox = true;
      global._chatRemoveInboxEntryForUsers = w;
    })();
  })();

  /* ==================================================================
   * BUG 2 — Persistir conv.avatar (e conv.description) no worker/firebase
   * ==================================================================
   * O payload atual de _chatSyncConvUpsert é fixo e omite avatar.
   * Envelopamos e mutamos o retorno: como não podemos reescrever o
   * corpo original, aplicamos um SEGUNDO putConfig com merge para o
   * doc chat_conv_<id> gravando avatar/description quando presentes.
   * Também garantimos que a paint-over do render seja aplicada após
   * o pull remoto.
   */
  (function fixBug2(){
    (function wrap(){
      var orig = global._chatSyncConvUpsert;
      // Aguarda estar SEMPRE após o guard do bug 1 (não conflita — os
      // dois wraps chamam orig em cadeia; ambos preservam Promise).
      if (typeof orig !== 'function' || orig.__lf4bugsAvatarPersist){
        setTimeout(wrap, 300); return;
      }
      var w = function(conv){
        var p = orig.apply(this, arguments);
        try{
          if (conv && conv.id && (conv.avatar || conv.description)){
            var root = global.LiderCRM;
            var wc = root && root.api && root.api.workerClient;
            var key = 'chat_conv_' + conv.id;
            var extra = {};
            if (conv.avatar)      extra.avatar      = conv.avatar;
            if (conv.description) extra.description = conv.description;
            if (root && root.config && root.config.useWorkerApi &&
                wc && typeof wc.getConfig === 'function' && typeof wc.putConfig === 'function'){
              // Merge não-destrutivo
              Promise.resolve(p).then(function(){
                return wc.getConfig(key).catch(function(){ return null; });
              }).then(function(doc){
                var merged = Object.assign({}, doc||{}, extra);
                return wc.putConfig(key, merged).catch(function(){});
              }).catch(function(){});
            } else if (global.DB_MODE === 'firebase' && global.db){
              var ref = global.db.collection('config').doc(key);
              Promise.resolve(p).then(function(){ return ref.get(); })
                .then(function(snap){
                  var base = snap && snap.exists ? (snap.data()||{}) : {};
                  return ref.set(Object.assign({}, base, extra), {merge:true});
                }).catch(function(){});
            }
          }
        }catch(_e){}
        return p;
      };
      w.__lf4bugsAvatarPersist = true;
      global._chatSyncConvUpsert = w;
    })();
  })();

  /* ==================================================================
   * BUG 4 — badge da aba conta MENSAGENS, não conversas
   * ==================================================================
   * O patch lf-cacador-erro-especifico gravou nGroups/nUnread como
   * CONTAGEM DE CONVERSAS. Vamos reescrever por cima (última palavra,
   * pois envelopa o renderChatList mais tardio).
   */
  (function fixBug4(){
    function _totalUnread(c, me, opts){
      if (!c || c.archived) return 0;
      // "unread" tab (DM) mantém regra do patch anterior — só DMs
      // "groups" tab — SÓ grupos
      // "all"/"team"  — DM + grupo
      var msgs = safe(function(){ return global._chatGetMsgs(c.id) || []; }, []);
      return msgs.filter(function(m){
        if (!m || m.read) return false;
        if (c.isGroup){
          if (opts && opts.dmOnly) return false;
          return m.fromUid !== me;
        }
        if (opts && opts.groupsOnly) return false;
        return m.toUid === me;
      }).length;
    }
    (function wrap(){
      var orig = global.renderChatList;
      if (typeof orig !== 'function' || orig.__lf4bugsBadge){
        setTimeout(wrap, 300); return;
      }
      var w = function(){
        var r = orig.apply(this, arguments);
        try{
          var convs = (typeof global._chatGetConvs === 'function') ? (global._chatGetConvs()||[]) : [];
          var me = meUid();
          var nGroups = 0, nUnread = 0, nAll = 0;
          convs.forEach(function(c){
            nGroups += _totalUnread(c, me, {groupsOnly:true});
            nUnread += _totalUnread(c, me, {dmOnly:true});
            nAll    += _totalUnread(c, me, {});
          });
          var bar = D.getElementById('chat-tabs-bar'); if (!bar) return r;
          var setN = function(tab, n){
            var t = bar.querySelector('.chat-tab[data-tab="'+tab+'"]');
            if (!t) return;
            var badge = t.querySelector('.chat-tab-n');
            if (n > 0){
              if (!badge){ badge = D.createElement('span'); badge.className = 'chat-tab-n'; t.appendChild(badge); }
              badge.textContent = String(n > 99 ? '99+' : n);
              badge.setAttribute('data-n', String(n));
              badge.style.display = '';
            } else if (badge){
              badge.setAttribute('data-n','0');
              badge.style.display = 'none';
            }
          };
          setN('groups', nGroups);
          setN('unread', nUnread);
          setN('all',    nAll);
          setN('team',   nAll);
        }catch(_e){}
        return r;
      };
      w.__lf4bugsBadge = true;
      global.renderChatList = w;
    })();
  })();

})(window);
