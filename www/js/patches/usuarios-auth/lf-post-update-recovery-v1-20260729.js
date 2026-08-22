/* =====================================================================
 * lf-post-update-recovery-v1-20260729.js
 * ---------------------------------------------------------------------
 * Objetivos deste patch aditivo:
 *
 * 1) Pós-update limpo para usuários antigos, SEM recriar contas
 *    - invalida caches locais derivados quando a versão do bundle muda;
 *    - preserva sessão, preferências pessoais e filas pendentes;
 *    - força reidratação a partir da nuvem/Worker no primeiro boot pós-update.
 *
 * 2) Fluxo híbrido para hash PBKDF2 acima do cap do workerd (100k)
 *    - login normal continua sendo a primeira tentativa;
 *    - se o Worker responder hash_iter_cap_exceeded, abre modal com:
 *         a) "Trocar agora"   -> auto-recuperação NO MESMO DISPOSITIVO
 *                                (exige credencial local + senha atual correta)
 *         b) "Pedir para o ADM" -> instruções prontas para reset via ADM.
 *
 * Segurança do "Trocar agora":
 *    - só funciona quando este aparelho já possui a credencial local do
 *      usuário (ph) e a senha digitada é validada localmente;
 *    - após essa prova local, o patch usa a legacy-bridge existente para
 *      obter JWT do próprio usuário e chama o endpoint server-side já
 *      existente /usuarios/admin-reset-password, liberado no backend
 *      APENAS para self-reset originado por auth_source=legacy-bridge.
 * ===================================================================== */
(function(global){
  'use strict';
  if (!global || !global.document) return;
  if (global.__LF_POST_UPDATE_RECOVERY_V1_20260729) return;
  global.__LF_POST_UPDATE_RECOVERY_V1_20260729 = true;

  var PATCH_APP_VERSION = 'lf_v14_post_update_recovery_20260729';
  var APP_VERSION_KEY   = 'lf_app_ver';
  var CLEANUP_META_KEY  = 'lf_post_update_cleanup_meta';
  var LOGIN_MODAL_ID    = 'lf-iter-cap-modal-20260729';
  var LOGIN_HELP_ID     = 'lf-iter-cap-help-20260729';
  var LOGIN_STATE_ID    = 'lf-iter-cap-state-20260729';
  var NEW_PW_ID         = 'lf-iter-cap-newpw-20260729';
  var NEW_PW2_ID        = 'lf-iter-cap-newpw2-20260729';
  var BTN_SELF_ID       = 'lf-iter-cap-self-20260729';
  var BTN_ADMIN_ID      = 'lf-iter-cap-admin-20260729';
  var BTN_CLOSE_ID      = 'lf-iter-cap-close-20260729';
  var BTN_CONFIRM_ID    = 'lf-iter-cap-confirm-20260729';

  function _safeJsonParse(raw){
    try { return JSON.parse(raw); } catch(_e){ return null; }
  }
  function _sg(key){
    try { return _safeJsonParse(localStorage.getItem(key)); } catch(_e){ return null; }
  }
  function _ss(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch(_e){ return false; }
  }
  function _html(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function _root(){ return global.LiderCRM || {}; }
  function _api(){ return (_root().api || {}); }
  function _wc(){ return _api().workerClient || null; }
  function _toast(msg, ms){ try { if (typeof global.toast === 'function') global.toast(msg, ms); } catch(_e){} }
  function _setLoginError(msg){
    try {
      var er = document.getElementById('lerr');
      if (er) er.textContent = msg || '';
    } catch(_e){}
  }
  function _listUsers(){
    try {
      if (typeof global.getUsers === 'function') {
        var arr = global.getUsers();
        if (Array.isArray(arr)) return arr;
      }
    } catch(_e){}
    return _sg('lf6_u') || [];
  }
  function _findLocalUserByEmail(email){
    var target = String(email || '').trim().toLowerCase();
    if (!target) return null;
    var list = _listUsers();
    for (var i = 0; i < list.length; i++) {
      var u = list[i];
      if (!u || u.ativo === false) continue;
      if (String(u.email || '').trim().toLowerCase() === target) return u;
    }
    return null;
  }

  function _shouldDropDerivedCache(key){
    if (!key) return false;
    if (key === 'lf6_u') return true;
    if (key === 'lf_departments') return true;
    if (key === 'lf13_feed') return true;
    if (key === 'lf13_chat_convs') return true;
    if (key === 'lf_chat_last_conv') return true;
    if (/^lf6_kb_/.test(key)) return true;
    if (/^lf6_c_/.test(key)) return true;
    if (/^lf13_acts_/.test(key)) return true;
    if (/^lf13_chat_msgs_/.test(key)) return true;
    if (/^lf13_lig_(?!sync_pending$)/.test(key)) return true;
    return false;
  }

  function _runPostUpdateCleanup(){
    var prev = '';
    try { prev = localStorage.getItem(APP_VERSION_KEY) || ''; } catch(_e){}
    if (prev === PATCH_APP_VERSION) return { changed:false, removed:[] };

    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k) keys.push(k);
      }
    } catch(_e){}

    var removed = [];
    keys.forEach(function(k){
      if (!_shouldDropDerivedCache(k)) return;
      try { localStorage.removeItem(k); removed.push(k); } catch(_e){}
    });

    try { localStorage.setItem(APP_VERSION_KEY, PATCH_APP_VERSION); } catch(_e){}
    _ss(CLEANUP_META_KEY, {
      previousVersion: prev || null,
      currentVersion: PATCH_APP_VERSION,
      removedKeys: removed,
      at: new Date().toISOString()
    });
    return { changed:true, removed:removed, previous:prev || null };
  }

  function _forceRemoteRehydrate(){
    try {
      if (typeof global.loadUsersDB === 'function') {
        global.loadUsersDB(function(){
          try { if (typeof global.renderUsers === 'function') global.renderUsers(); } catch(_e){}
          try { if (typeof global.buildNav === 'function') global.buildNav(); } catch(_e){}
        });
      }
    } catch(_e){}
    try {
      if (typeof global._lfLoadDepartmentsRemoteSafe === 'function') {
        global._lfLoadDepartmentsRemoteSafe(function(){});
      } else if (typeof global.loadDepartmentsRemote === 'function') {
        global.loadDepartmentsRemote(function(){});
      }
    } catch(_e){}
    try {
      if (global.window && global.window.LF && typeof global.window.LF.fetchAndCacheActivities === 'function' && global.S && global.S.userId) {
        global.window.LF.fetchAndCacheActivities(global.S.userId).catch(function(){});
      }
    } catch(_e){}
    try {
      if (typeof global.loadNotifsRemote === 'function' && global.S && global.S.userId) {
        global.loadNotifsRemote(function(){
          try { if (typeof global.updateNotifBadge === 'function') global.updateNotifBadge(); } catch(_e){}
        });
      }
    } catch(_e){}
  }

  function _installBootWrapper(){
    if (typeof global.bootApp !== 'function' || global.bootApp.__lfPostUpdateWrapped) return;
    var original = global.bootApp;
    global.bootApp = function(){
      var cleanup = _runPostUpdateCleanup();
      var result = original.apply(this, arguments);
      if (cleanup && cleanup.changed) {
        setTimeout(function(){
          _forceRemoteRehydrate();
          if (global.S && global.S.userId) {
            _toast('Atualização aplicada. O cache local foi renovado e os dados estão sendo reidratados.', 4200);
          }
        }, 350);
      }
      return result;
    };
    global.bootApp.__lfPostUpdateWrapped = true;
  }

  function _bufToHex(buf){
    var arr = new Uint8Array(buf); var hex = '';
    for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2,'0');
    return hex;
  }
  function _hexToBytes(hex){
    var clean = String(hex || '');
    if (!clean || (clean.length % 2) !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error('invalid_hex');
    var arr = new Uint8Array(clean.length / 2);
    for (var i = 0; i < arr.length; i++) arr[i] = parseInt(clean.substr(i * 2, 2), 16);
    return arr;
  }
  function _b64ToBytes(b64){
    var clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
    var bin = atob(clean);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function _equalBytes(a, b){
    if (!a || !b || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= (a[i] ^ b[i]);
    return diff === 0;
  }
  function _hmacSha256Hex(keyStr, msgStr){
    if (!(global.crypto && global.crypto.subtle)) return Promise.reject(new Error('crypto_subtle_unavailable'));
    var enc = new TextEncoder();
    return crypto.subtle.importKey(
      'raw', enc.encode(String(keyStr || '')),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    ).then(function(key){
      return crypto.subtle.sign('HMAC', key, enc.encode(String(msgStr || '')));
    }).then(_bufToHex);
  }
  function _verifyPasswordLocal(ph, password){
    ph = String(ph || '');
    password = String(password || '');
    if (!ph || !password) return Promise.resolve(false);
    if (!(global.crypto && global.crypto.subtle)) return Promise.reject(new Error('crypto_subtle_unavailable'));

    if (ph.indexOf('s2$') === 0) {
      var partsS2 = ph.split('$');
      if (partsS2.length !== 3) return Promise.resolve(false);
      var encS2 = new TextEncoder();
      return crypto.subtle.digest('SHA-256', encS2.encode(partsS2[1] + ':' + password))
        .then(function(buf){ return _bufToHex(buf) === partsS2[2]; });
    }

    if (ph.indexOf('pbkdf2$') === 0) {
      var parts = ph.split('$');
      if (parts.length !== 4) return Promise.resolve(false);
      var iters = parseInt(parts[1], 10);
      if (!Number.isFinite(iters) || iters < 1000) return Promise.resolve(false);
      var saltPart = parts[2];
      var wantPart = parts[3];
      var salt;
      var want;
      try {
        if (/^[0-9a-fA-F]+$/.test(saltPart) && (saltPart.length % 2) === 0 && /^[0-9a-fA-F]+$/.test(wantPart) && (wantPart.length % 2) === 0) {
          salt = _hexToBytes(saltPart);
          want = _hexToBytes(wantPart);
        } else {
          salt = _b64ToBytes(saltPart);
          want = _b64ToBytes(wantPart);
        }
      } catch(_e){
        return Promise.resolve(false);
      }
      var enc = new TextEncoder();
      return crypto.subtle.importKey(
        'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
      ).then(function(key){
        return crypto.subtle.deriveBits({
          name: 'PBKDF2',
          salt: salt,
          iterations: iters,
          hash: 'SHA-256'
        }, key, want.length * 8);
      }).then(function(bits){
        return _equalBytes(new Uint8Array(bits), want);
      });
    }

    try {
      if (typeof global.sh === 'function') return Promise.resolve(global.sh(password) === ph);
    } catch(_e){}
    return Promise.resolve(false);
  }

  function _ensureModal(){
    var existing = document.getElementById(LOGIN_MODAL_ID);
    if (existing) return existing;
    var host = document.createElement('div');
    host.id = LOGIN_MODAL_ID;
    host.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);z-index:9999;padding:16px;';
    host.innerHTML = ''
      + '<div role="dialog" aria-modal="true" style="width:min(560px,96vw);background:#111827;color:#F9FAFB;border:1px solid rgba(255,255,255,.08);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.45);overflow:hidden">'
      + '  <div style="padding:18px 18px 10px;border-bottom:1px solid rgba(255,255,255,.08)">'
      + '    <div style="font:700 1.05rem Outfit,system-ui,sans-serif">🔐 Atualização de credencial necessária</div>'
      + '    <div style="margin-top:6px;font:400 .9rem Outfit,system-ui,sans-serif;color:#CBD5E1">Seu login foi reconhecido, mas a senha armazenada desta conta usa uma configuração antiga incompatível com o runtime atual.</div>'
      + '  </div>'
      + '  <div style="padding:16px 18px 6px">'
      + '    <div id="' + LOGIN_HELP_ID + '" style="font:400 .9rem Outfit,system-ui,sans-serif;line-height:1.5;color:#E5E7EB"></div>'
      + '    <div id="' + LOGIN_STATE_ID + '" style="margin-top:10px;min-height:18px;font:600 .84rem Outfit,system-ui,sans-serif;color:#FBBF24"></div>'
      + '    <div style="margin-top:14px;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.03)">'
      + '      <div style="font:600 .9rem Outfit,system-ui,sans-serif;margin-bottom:8px">Trocar agora neste aparelho</div>'
      + '      <div style="display:grid;gap:8px">'
      + '        <input id="' + NEW_PW_ID + '" type="password" placeholder="Nova senha (mínimo 8 caracteres)" style="width:100%;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0B1220;color:#F9FAFB">'
      + '        <input id="' + NEW_PW2_ID + '" type="password" placeholder="Confirmar nova senha" style="width:100%;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0B1220;color:#F9FAFB">'
      + '      </div>'
      + '      <div style="margin-top:8px;font:400 .8rem Outfit,system-ui,sans-serif;color:#94A3B8">Disponível apenas se este dispositivo já tiver a credencial local desta conta e a senha atual digitada estiver correta.</div>'
      + '    </div>'
      + '  </div>'
      + '  <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding:14px 18px 18px">'
      + '    <button id="' + BTN_CLOSE_ID + '" type="button" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#E5E7EB;cursor:pointer">Fechar</button>'
      + '    <button id="' + BTN_ADMIN_ID + '" type="button" style="padding:10px 14px;border-radius:10px;border:none;background:#334155;color:#fff;cursor:pointer">Pedir para o ADM</button>'
      + '    <button id="' + BTN_CONFIRM_ID + '" type="button" style="padding:10px 14px;border-radius:10px;border:none;background:#16A34A;color:#fff;cursor:pointer">Trocar agora</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(host);
    document.getElementById(BTN_CLOSE_ID).onclick = function(){ host.style.display = 'none'; };
    host.addEventListener('click', function(ev){ if (ev.target === host) host.style.display = 'none'; });
    return host;
  }

  function _buildAdminMessage(ctx){
    var extra = ctx && ctx.errDetail ? ctx.errDetail : {};
    return [
      'Olá! Meu acesso precisa de reset pós-update no Lider CRM.',
      'Conta: ' + (ctx.email || '(sem e-mail)'),
      'Motivo técnico: hash_iter_cap_exceeded',
      'storedIters=' + (extra.storedIters || '?') + ' | cap=' + (extra.cap || 100000),
      'Ação pedida: abrir Credenciais do usuário e usar “Redefinir senha”.'
    ].join('\n');
  }

  function _copyText(txt){
    txt = String(txt || '');
    if (!txt) return Promise.reject(new Error('empty_text'));
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
    var ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    return Promise.resolve();
  }

  function _openIterCapModal(ctx){
    var host = _ensureModal();
    host.__ctx = ctx || {};
    var help = document.getElementById(LOGIN_HELP_ID);
    var state = document.getElementById(LOGIN_STATE_ID);
    if (help) {
      help.innerHTML = ''
        + 'Conta: <b>' + _html((ctx && ctx.email) || '') + '</b><br>'
        + 'Iterações armazenadas: <b>' + _html((ctx && ctx.errDetail && ctx.errDetail.storedIters) || '?') + '</b> · '
        + 'Cap atual: <b>' + _html((ctx && ctx.errDetail && ctx.errDetail.cap) || 100000) + '</b><br>'
        + 'Você pode tentar a auto-recuperação agora neste mesmo aparelho ou copiar um pedido pronto para o administrador.';
    }
    if (state) state.textContent = '';
    var n1 = document.getElementById(NEW_PW_ID); if (n1) n1.value = '';
    var n2 = document.getElementById(NEW_PW2_ID); if (n2) n2.value = '';

    var btnAdmin = document.getElementById(BTN_ADMIN_ID);
    if (btnAdmin) {
      btnAdmin.onclick = function(){
        var msg = _buildAdminMessage(host.__ctx || {});
        _copyText(msg).then(function(){
          _toast('Mensagem para o ADM copiada.', 3200);
          var st = document.getElementById(LOGIN_STATE_ID);
          if (st) st.textContent = 'Mensagem copiada. Envie ao administrador.';
        }).catch(function(){
          var st = document.getElementById(LOGIN_STATE_ID);
          if (st) st.textContent = 'Copie manualmente: ' + msg;
        });
      };
    }

    var btnConfirm = document.getElementById(BTN_CONFIRM_ID);
    if (btnConfirm) {
      btnConfirm.onclick = function(){ _runSelfRecovery(host.__ctx || {}); };
    }

    host.style.display = 'flex';
  }

  function _runSelfRecovery(ctx){
    var state = document.getElementById(LOGIN_STATE_ID);
    var btn = document.getElementById(BTN_CONFIRM_ID);
    var wc = _wc();
    if (!wc || typeof wc.legacyNonce !== 'function' || typeof wc.legacyBridge !== 'function' || typeof wc.adminResetPassword !== 'function' || typeof wc.login !== 'function') {
      if (state) state.textContent = 'API de recuperação indisponível neste build.';
      return;
    }

    var nextPw = String((document.getElementById(NEW_PW_ID) || {}).value || '').trim();
    var nextPw2 = String((document.getElementById(NEW_PW2_ID) || {}).value || '').trim();
    if (!nextPw || nextPw.length < 8) { if (state) state.textContent = 'A nova senha precisa ter pelo menos 8 caracteres.'; return; }
    if (nextPw !== nextPw2) { if (state) state.textContent = 'A confirmação da nova senha não confere.'; return; }
    if (nextPw === String(ctx.password || '')) { if (state) state.textContent = 'A nova senha não pode ser igual à atual.'; return; }

    var localUser = _findLocalUserByEmail(ctx.email);
    if (!localUser || !localUser.id || !localUser.ph) {
      if (state) state.textContent = 'Este aparelho não tem a credencial local necessária para auto-recuperação. Use “Pedir para o ADM”.';
      return;
    }

    if (btn) { btn.disabled = true; btn.style.opacity = '.7'; }
    if (state) state.textContent = 'Validando credencial local deste aparelho…';

    _verifyPasswordLocal(localUser.ph, String(ctx.password || ''))
      .then(function(ok){
        if (!ok) throw new Error('local_password_mismatch');
        if (state) state.textContent = 'Credencial validada. Abrindo sessão de recuperação…';
        return wc.legacyNonce(localUser.id, ctx.email).then(function(nonce){
          if (!nonce || typeof nonce.ts !== 'number') throw new Error('legacy_nonce_invalid');
          var material = String(localUser.id) + '|' + String(ctx.email).trim().toLowerCase() + '|' + String(nonce.ts) + '|' + String(localUser.ph);
          return _hmacSha256Hex(localUser.ph, material).then(function(sig){
            return wc.legacyBridge({ uid: localUser.id, email: ctx.email, ts: nonce.ts, sig: sig });
          });
        });
      })
      .then(function(){
        if (state) state.textContent = 'Sessão de recuperação aberta. Gravando nova senha…';
        return wc.adminResetPassword({ targetUserId: localUser.id, newPassword: nextPw });
      })
      .then(function(){
        if (state) state.textContent = 'Senha atualizada. Entrando com a nova credencial…';
        var lp = document.getElementById('lp');
        if (lp) lp.value = nextPw;
        return wc.login(ctx.email, nextPw);
      })
      .then(function(res){
        var modal = document.getElementById(LOGIN_MODAL_ID);
        if (modal) modal.style.display = 'none';
        _toast('Senha atualizada com sucesso. Entrando…', 2800);

        var wu = res && res.ok && res.data && res.data.data && res.data.data.user;
        if (!wu) throw new Error('login_after_recovery_failed');

        try {
          global._loginAttempts = 0;
          global._loginLockUntil = 0;
          if (typeof global._persistLoginLock === 'function') global._persistLoginLock();
        } catch(_e){}

        var lu = (typeof global._lfAuthGetUserSafe === 'function') ? global._lfAuthGetUserSafe(wu.id) : null;
        global.S = { userId:wu.id, role:wu.role || (lu && lu.role) || 'user', nome:wu.nome || (lu && lu.nome) || '', email:wu.email || ctx.email, cor:(lu && lu.cor) || 0 };
        try {
          if (typeof global._lfHydrateSessionFromAuthUser === 'function') global._lfHydrateSessionFromAuthUser(global.S, wu);
          if (typeof global.ss === 'function') global.ss('lf6_s', global.S);
          else _ss('lf6_s', global.S);
        } catch(_e){}
        if (typeof global.startApp === 'function') global.startApp();
        setTimeout(function(){ _forceRemoteRehydrate(); }, 250);
      })
      .catch(function(err){
        var msg = (err && err.message) || String(err);
        if (msg === 'local_password_mismatch') {
          msg = 'A senha atual digitada não confere com a credencial local deste aparelho.';
        } else if (/legacy_nonce_invalid/.test(msg)) {
          msg = 'Não foi possível abrir a sessão de recuperação.';
        } else if (/HTTP 401|Apenas ADM|Acesso negado|FORBIDDEN/i.test(msg)) {
          msg = 'O backend ainda não está com o patch de self-recovery. Use “Pedir para o ADM” até aplicar o patch.';
        }
        if (state) state.textContent = msg;
      })
      .finally(function(){
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      });
  }

  function _extractIterCap(err){
    var payload = (err && err.details) || (err && err.response && err.response.data && err.response.data.error) || null;
    var inner = payload && payload.details;
    if (!payload || !inner) return null;
    if (String(inner.code || '') !== 'hash_iter_cap_exceeded') return null;
    return {
      code: inner.code,
      storedIters: inner.storedIters,
      cap: inner.cap,
      message: payload.message || 'Sua senha precisa ser redefinida.'
    };
  }

  function _installLoginWrapper(){
    if (typeof global.doLogin !== 'function' || global.doLogin.__lfPostUpdateWrapped) return;

    global.doLogin = function(){
      var now = Date.now();
      try {
        if (global._loginLockUntil > now) {
          var secs = Math.ceil((global._loginLockUntil - now) / 1000);
          _setLoginError('Muitas tentativas. Aguarde ' + secs + 's.');
          return;
        }
      } catch(_e){}

      var em = String((document.getElementById('le') || {}).value || '').trim().toLowerCase();
      var pw = String((document.getElementById('lp') || {}).value || '');
      var btn = document.getElementById('btn-login');
      if (!em || !pw) { _setLoginError('Preencha e-mail e senha.'); return; }
      _setLoginError('');
      if (btn) { btn.textContent = 'Entrando...'; btn.disabled = true; }

      var waitFn = (typeof global._lfAuthWaitForWorkerClient === 'function')
        ? global._lfAuthWaitForWorkerClient
        : function(){ return Promise.resolve(_wc()); };

      waitFn(1500).then(function(wc){
        if (!wc || typeof wc.login !== 'function') {
          throw new Error('worker_client_unavailable');
        }
        return wc.login(em, pw);
      }).then(function(res){
        if (btn) { btn.textContent = 'Entrar'; btn.disabled = false; }
        var wu = res && res.ok && res.data && res.data.data && res.data.data.user;
        if (!wu) {
          try {
            global._loginAttempts = (global._loginAttempts || 0) + 1;
            if (global._loginAttempts >= 5) {
              global._loginLockUntil = Date.now() + 30000;
              global._loginAttempts = 0;
              if (typeof global._persistLoginLock === 'function') global._persistLoginLock();
              _setLoginError('Muitas tentativas. Aguarde 30s.');
              return;
            }
            if (typeof global._persistLoginLock === 'function') global._persistLoginLock();
          } catch(_e){}
          _setLoginError((res && res.data && res.data.error && res.data.error.message) || 'E-mail ou senha inválidos.');
          return;
        }

        try {
          global._loginAttempts = 0;
          global._loginLockUntil = 0;
          if (typeof global._persistLoginLock === 'function') global._persistLoginLock();
        } catch(_e){}

        var lu = (typeof global._lfAuthGetUserSafe === 'function') ? global._lfAuthGetUserSafe(wu.id) : null;
        global.S = { userId:wu.id, role:wu.role || (lu && lu.role) || 'user', nome:wu.nome || (lu && lu.nome) || '', email:wu.email || em, cor:(lu && lu.cor) || 0 };
        try {
          if (typeof global._lfHydrateSessionFromAuthUser === 'function') global._lfHydrateSessionFromAuthUser(global.S, wu);
          if (typeof global.ss === 'function') global.ss('lf6_s', global.S);
          else _ss('lf6_s', global.S);
        } catch(_e){}
        if (typeof global.startApp === 'function') global.startApp();
        setTimeout(function(){ _forceRemoteRehydrate(); }, 250);
      }).catch(function(err){
        if (btn) { btn.textContent = 'Entrar'; btn.disabled = false; }

        var iterCap = _extractIterCap(err);
        if (iterCap) {
          _setLoginError(iterCap.message);
          _openIterCapModal({ email: em, password: pw, errDetail: iterCap });
          return;
        }

        var payload = (err && err.details) || (err && err.response && err.response.data && err.response.data.error) || null;
        var msg = (payload && payload.message) || (err && err.message) || 'Não foi possível entrar. Verifique sua conexão e tente novamente.';
        var status = err && err.status;

        if (status === 401 || (payload && String(payload.code || '') === 'UNAUTHORIZED')) {
          try {
            global._loginAttempts = (global._loginAttempts || 0) + 1;
            if (global._loginAttempts >= 5) {
              global._loginLockUntil = Date.now() + 30000;
              global._loginAttempts = 0;
              if (typeof global._persistLoginLock === 'function') global._persistLoginLock();
              _setLoginError('Muitas tentativas. Aguarde 30s.');
              return;
            }
            if (typeof global._persistLoginLock === 'function') global._persistLoginLock();
          } catch(_e){}
          _setLoginError(msg || 'E-mail ou senha inválidos.');
          return;
        }

        if (String(msg || '').indexOf('worker_client_unavailable') >= 0) {
          _setLoginError('Serviço de autenticação indisponível. Tente novamente em instantes.');
          return;
        }
        _setLoginError(msg || 'Não foi possível entrar. Verifique sua conexão e tente novamente.');
      });
    };

    global.doLogin.__lfPostUpdateWrapped = true;
  }

  function _boot(){
    _installBootWrapper();
    _installLoginWrapper();
    // Se o app já tiver limpado o cache antes deste script entrar em cena,
    // ao menos garante que a versão final fique gravada.
    try {
      if ((localStorage.getItem(APP_VERSION_KEY) || '') !== PATCH_APP_VERSION && document.getElementById('login-screen')) {
        localStorage.setItem(APP_VERSION_KEY, PATCH_APP_VERSION);
      }
    } catch(_e){}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot, { once:true });
  else _boot();
})(window);
