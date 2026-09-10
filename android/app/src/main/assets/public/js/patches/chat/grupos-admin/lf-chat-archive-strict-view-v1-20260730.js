/* =====================================================================
 * lf-chat-archive-strict-view-v1-20260730.js
 * ---------------------------------------------------------------------
 * Causa raiz: aba "Arquivadas" mostra convs que NÃO foram arquivadas
 * porque o filtro atual aceita qualquer archived truthy. Docs antigos
 * do sync carregam archived=0/""/false ou mantêm archivedAt após um
 * unarchive incompleto — passam no filtro e poluem a aba.
 *
 * Fix (100% aditivo, carregar por último):
 *   1) _isConvArchived(c): true SOMENTE se
 *        c.archived === true
 *        E (!c.unarchivedAt OU unarchivedAt < archivedAt)
 *        E c.archivedAt existe (evita restos legados)
 *   2) Envelopa renderChatList: quando aba != 'archived', esconde
 *      convs arquivadas; quando aba == 'archived', esconde as NÃO
 *      arquivadas. Filtro sobrepõe o do patch anterior.
 *   3) Envelopa chatArchiveToggle/chatUnarchive (se existirem) para
 *      SEMPRE setar/limpar os dois campos coerentemente e disparar
 *      _chatSyncConvUpsert.
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__LF_CHAT_ARCHIVE_STRICT_V1__) return;
  global.__LF_CHAT_ARCHIVE_STRICT_V1__ = true;

  var D = global.document, LS = global.localStorage;
  function arr(x){ return Array.isArray(x)?x:[]; }
  function safe(fn,fb){ try{return fn();}catch(_e){return fb;} }

  function _tsOf(v){
    if (!v) return 0;
    var n = (typeof v === 'number') ? v : Date.parse(v);
    return isFinite(n) ? n : 0;
  }

  function _isConvArchived(c){
    if (!c) return false;
    if (c.archived !== true) return false;                 // estrito
    var a = _tsOf(c.archivedAt);
    if (!a) return false;                                  // sem carimbo = restos
    var u = _tsOf(c.unarchivedAt);
    if (u && u >= a) return false;                         // desarquivada depois
    return true;
  }
  global._isConvArchived = _isConvArchived;

  function _currentTab(){
    try{
      return (typeof global.sg==='function')
        ? global.sg('lf_chat_active_tab')
        : (LS.getItem('lf_chat_active_tab')||'all');
    }catch(_e){ return 'all'; }
  }

  // ----- Filtro pós-render -----
  (function wrapRender(){
    var orig = global.renderChatList;
    if (typeof orig !== 'function' || orig.__lfArchiveStrict){
      setTimeout(wrapRender, 300); return;
    }
    var w = function(){
      var r = orig.apply(this, arguments);
      try{
        var tab = _currentTab();
        var items = D.querySelectorAll('#chat-conv-list .chat-conv-item');
        if (!items || !items.length) return r;
        var convs = (typeof global._chatGetConvs === 'function')
          ? (global._chatGetConvs() || []) : [];
        var byId = {}; convs.forEach(function(c){ if (c && c.id) byId[c.id] = c; });

        items.forEach(function(el){
          var cid = el.getAttribute('data-conv-id');
          var c = byId[cid]; if (!c) return;
          var arch = _isConvArchived(c);
          var hide = false;
          if (tab === 'archived' && !arch) hide = true;   // aba arquivadas: só arquivadas
          if (tab !== 'archived' && arch)  hide = true;   // outras abas: esconde arquivadas
          el.style.display = hide ? 'none' : '';
        });
      }catch(_e){}
      return r;
    };
    w.__lfArchiveStrict = true;
    global.renderChatList = w;
  })();

  // ----- Toggle coerente: sempre grava par (archived + archivedAt)
  //       ou (archived=false + unarchivedAt), nunca só um lado. -----
  function _saveConv(conv){
    try{
      var list = (typeof global.sg==='function') ? global.sg('lf13_chat_convs') : [];
      list = arr(list);
      var i = list.findIndex(function(c){ return c && c.id===conv.id; });
      if (i<0) list.push(conv); else list[i] = Object.assign({}, list[i], conv);
      if (typeof global.ss==='function') global.ss('lf13_chat_convs', list);
    }catch(_e){}
  }

  global.chatArchiveConv = function(convId){
    var convs = (typeof global._chatGetConvs==='function') ? (global._chatGetConvs()||[]) : [];
    var c = convs.find(function(x){ return x && x.id===convId; });
    if (!c) return;
    c.archived    = true;
    c.archivedAt  = new Date().toISOString();
    c.unarchivedAt = null;
    c.updatedAt   = c.archivedAt;
    _saveConv(c);
    if (typeof global._chatSyncConvUpsert==='function')
      safe(function(){ global._chatSyncConvUpsert(c); });
    if (typeof global.renderChatList==='function') global.renderChatList();
  };

  global.chatUnarchiveConv = function(convId){
    var convs = (typeof global._chatGetConvs==='function') ? (global._chatGetConvs()||[]) : [];
    var c = convs.find(function(x){ return x && x.id===convId; });
    if (!c) return;
    c.archived     = false;
    c.unarchivedAt = new Date().toISOString();
    c.updatedAt    = c.unarchivedAt;
    _saveConv(c);
    if (typeof global._chatSyncConvUpsert==='function')
      safe(function(){ global._chatSyncConvUpsert(c); });
    if (typeof global.renderChatList==='function') global.renderChatList();
  };

  // Se existir toggle antigo, redireciona para as funções coerentes
  (function wrapLegacyToggle(){
    var orig = global.chatToggleArchive || global.toggleArchiveConv;
    if (typeof orig !== 'function') return;
    var w = function(convId){
      var convs = (typeof global._chatGetConvs==='function') ? (global._chatGetConvs()||[]) : [];
      var c = convs.find(function(x){ return x && x.id===convId; });
      if (!c) return orig.apply(this, arguments);
      return _isConvArchived(c) ? global.chatUnarchiveConv(convId)
                                : global.chatArchiveConv(convId);
    };
    global.chatToggleArchive = w;
    if (global.toggleArchiveConv) global.toggleArchiveConv = w;
  })();

})(window);
