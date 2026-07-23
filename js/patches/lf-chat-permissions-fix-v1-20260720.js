/**
 * lf-chat-permissions-fix-v1-20260720.js
 * ─────────────────────────────────────────────────────────────────────────
 * Caça-Bugs: fuga de mensagens entre perfis no "Papo da Empresa".
 *
 * SINTOMA REPORTADO (2026-07-20)
 *   Uma mensagem enviada do ADM para o Orientador aparecia também para o
 *   Consultor. A conversa é bilateral (ADM ↔ Orientador) e o Consultor
 *   jamais deveria enxergá-la — nem como preview na lista, nem no polling,
 *   nem em cache local.
 *
 * CAUSA-RAIZ (verificado em js/chat.js e src/shared/http/worker-client.js)
 *   1. `_chatPollNewMsgs()` (chat.js ~L1100) itera pelas conversas LOCAIS e
 *      baixa `chat_conv_<convId>` do worker via getConfig. Ele confia
 *      cegamente no `doc.msgs` retornado e nunca valida se o usuário atual
 *      pertence a `doc.participants` do documento REMOTO. Se por qualquer
 *      motivo (bug de sync anterior, colisão de convId legada, migração,
 *      restauração de backup, admin criou grupo e depois removeu o membro,
 *      etc.) o Consultor tiver localmente uma conv com o mesmo id de uma
 *      conv ADM↔Orientador, o poll ingere as mensagens dela.
 *
 *   2. O mesmo bloco de poll faz `participants: doc.participants ||
 *      convs[idx].participants` — sobrescreve o `participants` local pelo
 *      do remoto. Isso neutraliza o FIX #13 (que confia no `participants`
 *      local para filtrar em `_chatGetMsgs`): se o remoto vier com
 *      [ADM, Orient] o Consultor perde acesso pela porta da frente, mas
 *      as mensagens já foram gravadas em localStorage — e continuam
 *      visíveis por preview na lista, notificação, badge de não-lidas.
 *
 *   3. `_chatGetMsgs` (chat.js L115) já filtra por participants LOCAIS,
 *      mas não valida `fromUid`/`toUid` de cada msg. Se um doc corrompido
 *      contiver participants={self, X} mas msgs de {A, B} (A,B ≠ self),
 *      o gate atual autoriza retornar as msgs alheias.
 *
 *   4. `renderChatList` faz preview e contagem de não-lidas com
 *      `_chatGetMsgs`. Sem endurecer o gate, a lista mostra o texto.
 *
 * ESTRATÉGIA (patch mínimo, stackable, versionado v1-20260720)
 *   - NÃO reescreve chat.js. Apenas envolve (wrap) três símbolos globais:
 *       * `_chatPollNewMsgs`  → adiciona verificação estrita antes de
 *          ingerir msgs: (a) doc.participants deve conter S.userId;
 *          (b) NUNCA sobrescreve `participants` local com um remoto que
 *          não inclua S.userId; (c) filtra `doc.msgs` para manter apenas
 *          as mensagens em que S.userId é sender/recipient ou é membro
 *          do grupo (ambos os lados verificados).
 *       * `_chatGetMsgs` → gate reforçado: além de exigir S.userId em
 *          participants, filtra cada msg por (fromUid|toUid) ou membership
 *          para grupos.
 *       * `_chatSyncMsg` → nunca envia payload cujo `participants` não
 *          inclua S.userId (previne o próprio cliente contribuir com
 *          docs corrompidos no worker).
 *   - Faz uma varredura ÚNICA em localStorage no boot da página de chat
 *     removendo conversas e msg-buckets em que S.userId não é participante
 *     (higienização preventiva contra o resíduo já vazado). É idempotente
 *     e loga por console.warn o que foi limpo.
 *
 * IDEMPOTÊNCIA / STACKABILIDADE
 *   - Guard `window.__LF_CHAT_PERMISSIONS_FIX_V1__` impede aplicar 2x.
 *   - Cada wrapper checa `.__lfPermsWrapped` no símbolo original antes
 *     de embrulhar. Compatível com patches anteriores (chat-nav-menu,
 *     messenger-user-request-fix, v39-critical-fixes) — nenhum deles
 *     toca em `_chatPollNewMsgs`, `_chatGetMsgs` ou `_chatSyncMsg`.
 *
 * ORDEM DE CARGA
 *   Deve carregar DEPOIS de js/chat.js. Recomenda-se posicionar logo após
 *   `lf-chat-nav-menu-v1-20260720.js` no fim de app.html / index.html.
 *
 * COMO TESTAR
 *   1) Logar como ADM, enviar msg para Orientador.
 *   2) Logar como Consultor (limpar cache antes se quiser reproduzir):
 *      - Antes do patch: a msg aparecia (bug).
 *      - Depois do patch: lista fica limpa; console mostra
 *        "[chat/perms] ingest bloqueado: usuário não é participante"
 *        se o doc chegar por engano.
 *   3) Grupos: ADM cria grupo com Orient+Consultor. Consultor deve receber
 *      normalmente (é participante). Se ADM remover o Consultor do grupo,
 *      próximo poll para o Consultor bloqueia ingestão.
 *
 * NÃO ALTERA
 *   - UI (nav-menu, wallpaper, badges permanecem intactos).
 *   - Envio de mensagem, gravação de áudio, anexos.
 *   - Backend/worker (correção puramente client-side; se o worker também
 *     tiver falha, esta camada garante que o cliente honre permissões).
 * ─────────────────────────────────────────────────────────────────────────
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_PERMISSIONS_FIX_V1__) return;
  window.__LF_CHAT_PERMISSIONS_FIX_V1__ = true;

  var TAG = '[chat/perms]';

  /* ─── helpers puros ─── */
  function _uid(){
    try { return (window.S && window.S.userId) ? String(window.S.userId) : ''; }
    catch(_e){ return ''; }
  }
  function _asArr(x){ return Array.isArray(x) ? x : []; }
  function _norm(v){ return String(v == null ? '' : v).trim(); }
  function _hasMe(parts){
    var me = _uid(); if(!me) return false;
    var arr = _asArr(parts);
    for (var i=0;i<arr.length;i++){
      if (_norm(arr[i]) === me) return true;
    }
    return false;
  }
  function _msgBelongsToMe(m, conv){
    if (!m) return false;
    var me = _uid(); if(!me) return false;
    // Grupos: participante do grupo autoriza; mas ainda exigimos que a msg
    // tenha convId coerente com a conv local (defesa em profundidade).
    if (conv && conv.isGroup){
      if (m.convId && conv.id && String(m.convId) !== String(conv.id)) return false;
      return _hasMe(conv.participants);
    }
    // 1-a-1: eu preciso ser sender OU recipient.
    var from = _norm(m.fromUid);
    var to   = _norm(m.toUid);
    if (from && from === me) return true;
    if (to   && to   === me) return true;
    // Fallback conservador: se a msg não tem fromUid/toUid (msgs antigas
    // pré-migração), aceita SOMENTE se a conv local me inclui.
    if (!from && !to && conv && _hasMe(conv.participants)) return true;
    return false;
  }

  /* ─── 1) Wrap: _chatGetMsgs (gate de leitura reforçado) ─── */
  (function wrapGet(){
    if (typeof window._chatGetMsgs !== 'function') return;
    if (window._chatGetMsgs.__lfPermsWrapped) return;
    var orig = window._chatGetMsgs;
    var wrapped = function(convId){
      var me = _uid(); if(!me) return [];
      var raw;
      try { raw = orig.call(this, convId); } catch(_e){ raw = []; }
      raw = _asArr(raw);
      if (!raw.length) return raw;
      // Recupera a conv local para saber se é grupo
      var conv = null;
      try {
        var convs = _asArr(typeof _chatGetConvs === 'function' ? _chatGetConvs() : (window.sg && sg('lf13_chat_convs')));
        for (var i=0;i<convs.length;i++){
          if (convs[i] && convs[i].id === convId){ conv = convs[i]; break; }
        }
      } catch(_e){}
      // Se nem a conv existe mais localmente, bloqueia por padrão
      if (!conv) return [];
      // Se eu não sou participante local, bloqueia
      if (!_hasMe(conv.participants)) return [];
      // Filtra por sender/recipient/membership
      var out = [];
      for (var j=0;j<raw.length;j++){
        if (_msgBelongsToMe(raw[j], conv)) out.push(raw[j]);
      }
      return out;
    };
    wrapped.__lfPermsWrapped = true;
    window._chatGetMsgs = wrapped;
  })();

  /* ─── 2) Wrap: workerClient.getConfig/putConfig (ingestão remota autenticada) ─── */
  (function wrapPoll(){
    if (typeof window._chatPollNewMsgs !== 'function') return;
    if (window._chatPollNewMsgs.__lfPermsWrapped) return;

    try {
      var root = window.LiderCRM;
      var wc = root && root.api && root.api.workerClient;
      if (wc && typeof wc.getConfig === 'function' && !wc.getConfig.__lfPermsWrapped){
        var origGet = wc.getConfig.bind(wc);
        var wrappedGet = function(name){
          return origGet(name).then(function(doc){
            if (!doc || typeof name !== 'string' || name.indexOf('chat_conv_') !== 0) return doc;
            var me = _uid(); if(!me) return doc;

            // (a) participants do doc remoto DEVE conter S.userId
            var remoteParts = _asArr(doc.participants);
            if (remoteParts.length && !_hasMe(remoteParts)){
              console.warn(TAG, 'ingest bloqueado: usuário não é participante', name, {
                remote: remoteParts, me: me
              });
              // Devolve doc "vazio" para o chamador — sem msgs, sem parts.
              // Assim `_chatPollNewMsgs` não vai fundir participants alheios
              // nem incorporar mensagens.
              return { id: doc.id, updatedAt: doc.updatedAt, msgs: [] };
            }

            // (b) filtra msgs — só as em que S.userId é sender/recipient
            //     (ou grupo do qual S.userId é membro pelo próprio doc)
            var isGroup = !!doc.isGroup;
            var filtered = [];
            var raw = _asArr(doc.msgs);
            for (var i=0;i<raw.length;i++){
              var m = raw[i]; if (!m) continue;
              if (isGroup){
                // grupo: se estou nos participants do doc, aceito
                if (_hasMe(remoteParts)) filtered.push(m);
              } else {
                var from = _norm(m.fromUid);
                var to   = _norm(m.toUid);
                if (from === me || to === me){ filtered.push(m); continue; }
                // Sem fromUid/toUid: aceita apenas se remoteParts me inclui
                if (!from && !to && _hasMe(remoteParts)) filtered.push(m);
              }
            }
            if (filtered.length !== raw.length){
              console.warn(TAG, 'ingest filtrado', name,
                'kept=', filtered.length, 'dropped=', raw.length - filtered.length);
            }
            var safe = {};
            for (var k in doc){ if (Object.prototype.hasOwnProperty.call(doc,k)) safe[k] = doc[k]; }
            safe.msgs = filtered;
            return safe;
          });
        };
        wrappedGet.__lfPermsWrapped = true;
        wc.getConfig = wrappedGet;
      }
      if (wc && typeof wc.putConfig === 'function' && !wc.putConfig.__lfPermsWrapped){
        var origPut = wc.putConfig.bind(wc);
        var wrappedPut = function(name, payload){
          try {
            if (typeof name === 'string' && name.indexOf('chat_conv_') === 0){
              var me = _uid();
              var parts = _asArr(payload && payload.participants);
              if (me && parts.length && !_hasMe(parts)){
                console.warn(TAG, 'sync bloqueado: eu não estou nos participantes', name, parts);
                return Promise.resolve(null); // no-op silencioso
              }
            }
          } catch(_e){}
          return origPut(name, payload);
        };
        wrappedPut.__lfPermsWrapped = true;
        wc.putConfig = wrappedPut;
      }
    } catch(e){ console.warn(TAG, 'workerClient wrap falhou', e); }

    try { window._chatPollNewMsgs.__lfPermsWrapped = true; } catch(_e){}
  })();

  /* ─── 3) Higienização preventiva no boot da página Papo ─── */
  function _sanitizeLocal(){
    try {
      var me = _uid(); if(!me) return;
      var CHAT_KEY = 'lf13_chat_convs';
      var CHAT_MSG_PREFIX = 'lf13_chat_msgs_';

      var raw = null;
      try { raw = (typeof sg === 'function') ? sg(CHAT_KEY) : JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); }
      catch(_e){ raw = []; }
      var convs = _asArr(raw);
      if (!convs.length) return;

      var keep = [];
      var purgedConv = 0, purgedBuckets = 0;
      for (var i=0;i<convs.length;i++){
        var c = convs[i]; if (!c || !c.id) continue;
        if (_hasMe(c.participants)){
          keep.push(c);
        } else {
          purgedConv++;
          try {
            localStorage.removeItem(CHAT_MSG_PREFIX + c.id);
            purgedBuckets++;
          } catch(_e){}
        }
      }
      if (purgedConv > 0){
        try {
          if (typeof ss === 'function') ss(CHAT_KEY, keep);
          else localStorage.setItem(CHAT_KEY, JSON.stringify(keep));
        } catch(_e){}
        console.warn(TAG, 'higienização: convs removidas=', purgedConv,
          'msg buckets removidos=', purgedBuckets);
      }
    } catch(e){ console.warn(TAG, 'sanitize falhou', e); }
  }

  // Roda no boot + toda vez que a página Papo é aberta (defesa em profundidade)
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _sanitizeLocal, { once: true });
  } else {
    _sanitizeLocal();
  }
  // Hook fino: se initChatPage existir, roda sanitize antes do render.
  try {
    if (typeof window.initChatPage === 'function' && !window.initChatPage.__lfPermsWrapped){
      var origInit = window.initChatPage;
      var wrappedInit = function(){
        try { _sanitizeLocal(); } catch(_e){}
        return origInit.apply(this, arguments);
      };
      wrappedInit.__lfPermsWrapped = true;
      window.initChatPage = wrappedInit;
    }
  } catch(_e){}

  console.info(TAG, 'lf-chat-permissions-fix-v1-20260720 aplicado');
})();
