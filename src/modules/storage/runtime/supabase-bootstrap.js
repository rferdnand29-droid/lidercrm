(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var storage = modules.storage = modules.storage || {};

  var SUPABASE_URL = 'https://xwajiwjpecanxaqlxzkt.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_z1rKnhaLJcr1Bdfy1gLQBw_LHUcSzp0';
  var SUPABASE_BUCKET = 'lidercrm-files';

  var _LF_CAPACITOR = (function(){
    try {
      var cap = global.Capacitor;
      if (!cap || typeof cap.isNativePlatform !== 'function') return { native:false, platform:'web' };
      return {
        native: !!cap.isNativePlatform(),
        platform: (cap.getPlatform && cap.getPlatform()) || 'web',
        isAndroid: cap.getPlatform && cap.getPlatform() === 'android',
        isIOS: cap.getPlatform && cap.getPlatform() === 'ios'
      };
    } catch(_e) { return { native:false, platform:'web' }; }
  })();
  global.LF_CAPACITOR = _LF_CAPACITOR;

  var _LF_SB_CACHE_KEY = 'lf_sb_anon_cache_v2';
  var _LF_SB_CACHE_TTL_MS = 30 * 60 * 1000;
  function _lfReadAnonCache(){
    try {
      var raw = localStorage.getItem(_LF_SB_CACHE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.expiresAt || data.expiresAt < Date.now()) {
        localStorage.removeItem(_LF_SB_CACHE_KEY);
        return null;
      }
      return data;
    } catch(_e) { return null; }
  }
  function _lfWriteAnonCache(data){
    try { localStorage.setItem(_LF_SB_CACHE_KEY, JSON.stringify({ ts:Date.now(), expiresAt:Date.now()+_LF_SB_CACHE_TTL_MS, data:!!data })); } catch(_e){}
  }
  var _lfWriteAnonSession = _lfWriteAnonCache;
  var _lfReadAnonSession = _lfReadAnonCache;
  var _lfSignInAnonSession = (typeof global._lfSignInAnonSession === 'function') ? global._lfSignInAnonSession : function(){ try { return Promise.resolve({ data:null, error:null }); } catch(_e){} };
  var _lfClearAnonSession = (typeof global._lfClearAnonSession === 'function') ? global._lfClearAnonSession : function(){
    try { localStorage.removeItem(_LF_SB_CACHE_KEY); } catch(_e){}
    try { localStorage.removeItem('lf_sb_anon_cache'); } catch(_e){}
  };
  try {
    global._lfWriteAnonCache = _lfWriteAnonCache;
    global._lfReadAnonCache = _lfReadAnonCache;
    global._lfWriteAnonSession = _lfWriteAnonSession;
    global._lfReadAnonSession = _lfReadAnonSession;
    global._lfSignInAnonSession = _lfSignInAnonSession;
    global._lfClearAnonSession = _lfClearAnonSession;
  } catch(_e){}

  function _confirmModal(opts){
    opts = opts || {};
    var title = document.getElementById('confirm-del-title');
    var msg = document.getElementById('confirm-del-msg');
    var ok = document.getElementById('confirm-del-ok');
    if (title) title.textContent = opts.title || '⚠️ Confirmar ação';
    if (msg) msg.innerHTML = global._safeLiteHTML(opts.msg || '');
    if (ok) { ok.textContent = opts.okLabel || 'Confirmar'; ok.className = opts.okClass || 'bd'; }
    global._confirmDelCb = opts.onOk || null;
    global.openM('mo-confirm-del');
  }
  function syncOk(){ var el = document.getElementById('nav-sync'); if (el) { el.className = 'nav-sync'; el.title = 'Sincronizado'; } }
  function syncBusy(){ var el = document.getElementById('nav-sync'); if (el) { el.className = 'nav-sync syncing'; el.title = 'Sincronizando...'; } }
  function syncErr(){ var el = document.getElementById('nav-sync'); if (el) { el.className = 'nav-sync err'; el.title = 'Erro de sincronização — dados salvos localmente'; } global.toast('⚠️ Falha ao sincronizar com a nuvem. Dados salvos localmente.', 4000); }
  function _uuid(){
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){ var r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8); return v.toString(16); });
  }

  global.firebase = global.firebase || {};
  var _firebaseCompatFieldValue = {
    arrayUnion: function(){ return { __fsOp:'arrayUnion', values:Array.prototype.slice.call(arguments) }; },
    arrayRemove: function(){ return { __fsOp:'arrayRemove', values:Array.prototype.slice.call(arguments) }; },
    increment: function(n){ return { __fsOp:'increment', value:Number(n)||0 }; },
    delete: function(){ return { __fsOp:'delete' }; },
    deleteField: function(){ return { __fsOp:'delete' }; }
  };
  function _firebaseCompatFirestore(){ return { enablePersistence: function(){ return Promise.resolve(); } }; }
  _firebaseCompatFirestore.FieldValue = _firebaseCompatFieldValue;
  global.firebase.firestore = _firebaseCompatFirestore;
  global.firebase.auth = function(){
    return {
      get currentUser(){ return (global.DB_MODE === 'firebase' && global._sbClient) ? { uid:'supabase-anon' } : null; },
      signInAnonymously: function(){
        if (global._sbClient && global._sbClient.auth && typeof global._sbClient.auth.signInAnonymously === 'function') {
          return global._sbClient.auth.signInAnonymously();
        }
        return Promise.reject(new Error('supabase-auth-unavailable'));
      }
    };
  };

  
  /* R14-16: expor funções ao escopo global */
  if(typeof _lfReadAnonCache === 'function') global._lfReadAnonCache = _lfReadAnonCache;
  if(typeof _lfWriteAnonCache === 'function') global._lfWriteAnonCache = _lfWriteAnonCache;
  if(typeof _confirmModal === 'function') global._confirmModal = _confirmModal;
  if(typeof syncOk === 'function') global.syncOk = syncOk;
  if(typeof syncBusy === 'function') global.syncBusy = syncBusy;
  if(typeof syncErr === 'function') global.syncErr = syncErr;
  if(typeof _uuid === 'function') global._uuid = _uuid;
  if(typeof _firebaseCompatFirestore === 'function') global._firebaseCompatFirestore = _firebaseCompatFirestore;

storage.runtime = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_KEY: SUPABASE_KEY,
    SUPABASE_BUCKET: SUPABASE_BUCKET,
    _LF_CAPACITOR: _LF_CAPACITOR,
    _LF_SB_CACHE_KEY: _LF_SB_CACHE_KEY,
    _LF_SB_CACHE_TTL_MS: _LF_SB_CACHE_TTL_MS,
    _lfReadAnonCache: _lfReadAnonCache,
    _lfWriteAnonCache: _lfWriteAnonCache,
    _lfWriteAnonSession: _lfWriteAnonSession,
    _lfReadAnonSession: _lfReadAnonSession,
    _lfSignInAnonSession: _lfSignInAnonSession,
    _lfClearAnonSession: _lfClearAnonSession,
    _confirmModal: _confirmModal,
    syncOk: syncOk,
    syncBusy: syncBusy,
    syncErr: syncErr,
    _uuid: _uuid,
    _firebaseCompatFieldValue: _firebaseCompatFieldValue,
    _firebaseCompatFirestore: _firebaseCompatFirestore
  };
})(window);
