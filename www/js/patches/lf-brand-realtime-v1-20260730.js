/* =====================================================================
 * lf-brand-realtime-v1-20260730.js
 * ---------------------------------------------------------------------
 * PATCH FORENSE — corrige, de uma vez só, todos os pontos onde a "capa"
 * (logo + nome + fonte + cor + favicon) do CRM aparecia. Antes:
 *
 *   • applyCustomLogo() / applyCRMBranding() só pintavam .nmo/.lmon/etc.
 *     — NÃO tocavam em <title>, favicon, apple-touch-icon,
 *       apple-mobile-web-app-title, theme-color, manifest PWA nem no
 *       nome do app Capacitor. Efeito: aba do Google, atalho da tela
 *       inicial e ícone do celular ficavam com a marca antiga.
 *
 *   • loadLogoRemote/loadCRMNameRemote rodavam UMA VEZ no boot. Depois
 *     disso o consultor logado nunca mais via a nova capa até dar F5
 *     ou re-logar — não havia canal de tempo-real.
 *
 *   • wc.putConfig('logo', …) escrevia em /api/v1/usuarios/config
 *     (fs_documents, por-usuário) — a "logo global" na verdade era
 *     salva SÓ na conta do ADM, então ninguém mais via.
 *
 * Este patch resolve os 3 problemas:
 *   1. Passa a usar UMA ÚNICA rota global: /api/v1/branding (settings).
 *   2. Faz polling barato (20 s) com If-None-Match + BroadcastChannel
 *      entre abas — sem WebSocket, funciona no Capacitor Android/iOS
 *      e em qualquer navegador. Assim que o ADM salva, o Worker devolve
 *      novo ETag e todos os dispositivos recebem no próximo tick.
 *   3. applyBrand() é reescrito para pintar TUDO: DOM interno, title,
 *      favicon, apple-touch-icon, apple-mobile-web-app-title,
 *      theme-color, manifest PWA (blob dinâmico) e o nome do WebView
 *      Capacitor (via App.setName quando disponível).
 *
 * Ordem de carregamento: precisa vir DEPOIS de configuracoes.js (ele
 * define applyCustomLogo/applyCRMBranding, que este patch envolve).
 * ===================================================================== */
(function(root){
  'use strict';

  var appShortName = (root.config && root.config.appShortName) || 'LIDER CRM';
  var LOG = function(){ try{ console.log.apply(console, ['[brand]'].concat([].slice.call(arguments))); }catch(_e){} };
  var WARN= function(){ try{ console.warn.apply(console,['[brand]'].concat([].slice.call(arguments))); }catch(_e){} };

  // -------------------------------------------------------------------
  // 0. Constantes e estado
  // -------------------------------------------------------------------
  var API_BASE  = (root.LiderCRM && root.LiderCRM.apiBase) || '';
  var ENDPOINT  = API_BASE.replace(/\/+$/,'') + '/api/v1/branding';
  var LS_KEY    = 'lf_brand_v1';           // cache local persistente
  var LS_ETAG   = 'lf_brand_etag_v1';
  var CH_NAME   = 'lf-brand-channel-v1';   // BroadcastChannel entre abas
  var _syncCfg = root.config && root.config.sync || {};
  var POLL_MS   = Number(_syncCfg.brandingPollMs) || 20000;
  var FAST_MS   = Number(_syncCfg.brandingFastMs) || 1500;
  var GFONT_ID  = 'lf-brand-gfont';        // <link> Google Fonts dinâmico

  var _current = null;    // estado renderizado atualmente
  var _fails   = 0;       // falhas consecutivas do poll (circuit breaker anti-flood)
  var _warned  = false;   // já avisei sobre a falha atual (loga 1x por sequência)
  var _timer   = null;    // timer do polling adaptativo
  var _channel = null;    // BroadcastChannel

  // -------------------------------------------------------------------
  // 1. Fetch com ETag (polling barato + 304)
  // -------------------------------------------------------------------
  function _readCache(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(_e){ return null; }
  }
  function _writeCache(brand, etag){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(brand||{})); }catch(_e){}
    try{ if(etag) localStorage.setItem(LS_ETAG, etag); }catch(_e){}
  }
  function _readEtag(){ try{ return localStorage.getItem(LS_ETAG)||''; }catch(_e){ return ''; } }

  // Tenta obter o token da sessão pelos caminhos já existentes no app.
  // Antes o fetch ia "cru" (sem Bearer), burlando o auth-gate — em sessões
  // protegidas o servidor respondia redirect/erro e o Chrome logava
  // net::ERR_FAILED em loop.
  function _getToken(){
    try{
      if(root.LF_AUTH && root.LF_AUTH.token) return root.LF_AUTH.token;
      if(root.LF_AUTH_GATE_V2){
        if(typeof root.LF_AUTH_GATE_V2.token==='function') return root.LF_AUTH_GATE_V2.token();
        if(root.LF_AUTH_GATE_V2.token) return root.LF_AUTH_GATE_V2.token;
      }
      if(root.httpClient && root.httpClient.token) return root.httpClient.token;
      var ks=['lf_token','lf_access_token','lf_session_token','token','authToken','access_token'];
      for(var i=0;i<ks.length;i++){ var v=localStorage.getItem(ks[i]); if(v) return v; }
    }catch(_e){}
    return '';
  }

  function fetchBrand(opts){
    opts = opts||{};
    var headers = {};
    var _tk = _getToken();
    if(_tk) headers['Authorization'] = 'Bearer '+_tk;
    // 304 barato — só mando If-None-Match se o servidor já me devolveu ETag antes.
    var etag = _readEtag();
    if(etag && !opts.force) headers['If-None-Match'] = etag;

    // [FIX 20260826] Sessão ainda pendente (auth-gate v2 sem token)?
    // Não dispara fetch cru — resolve com o cache local e deixa o
    // _tick reagendar. Evita o flood de net::ERR_FAILED no boot.
    if(!_tk && root.LF_AUTH_GATE_V2){ return Promise.resolve({ changed:false, brand:_readCache(), deferred:true }); }
    return fetch(ENDPOINT, {
      method:'GET',
      credentials:'include',
      headers: headers,
      cache:'no-store',
    }).then(function(resp){
      if(resp.status === 304) return { changed:false, brand:_readCache() };
      if(!resp.ok) throw new Error('branding GET falhou: '+resp.status);
      var newEtag = resp.headers.get('ETag') || '';
      return resp.json().then(function(json){
        var brand = (json && (json.data || json)) || null;
        if(brand){
          _writeCache(brand, newEtag);
          return { changed:true, brand:brand };
        }
        return { changed:false, brand:_readCache() };
      });
    });
  }

  // -------------------------------------------------------------------
  // 2. Renderização — pinta EM TODO LUGAR onde a capa aparece
  // -------------------------------------------------------------------
  function _htmlAttr(v){ return String(v||'').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function _txt(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // 2.1 Logo em elementos internos (mantém compat com o código antigo)
  function paintLogo(logoData){
    var src = logoData || (root.LF_OFFICIAL_LOGO || '');
    var appName=(root.config&&root.config.appName)||'Líder CRM';
    var alt = logoData ? 'Logo do CRM' : appName;
    // BUG CORRIGIDO: .mtb-logo estava fora da lista antiga — mantido aqui.
    document.querySelectorAll('.nmo,.splash-mon,.lmon,.mtb-logo').forEach(function(el){
      el.innerHTML = '<img src="'+_htmlAttr(src)+'" alt="'+_htmlAttr(alt)+'" '
                   + 'style="width:100%;height:100%;object-fit:contain;border-radius:inherit">';
    });
    // Todos os <img class="lf-logo-img"> (índex.html hard-coded)
    document.querySelectorAll('img.lf-logo-img').forEach(function(img){
      img.src = src;
    });
    // Preview do painel ADM
    var prev = document.getElementById('adm-logo-preview');
    if(prev) prev.innerHTML = '<img src="'+_htmlAttr(src)+'" alt="Logo atual" '
                            + 'style="width:100%;height:100%;object-fit:contain">';
  }

  // 2.2 Nome do CRM (texto OU imagem)
  function paintName(nameText, nameImg){
    var html = nameImg
      ? '<img src="'+_htmlAttr(nameImg)+'" alt="Nome do CRM" '
        + 'style="max-height:1.15em;max-width:170px;vertical-align:middle;object-fit:contain">'
      : _txt(nameText || appShortName);
    document.querySelectorAll('.crm-brand-name').forEach(function(el){ el.innerHTML = html; });
    var prev = document.getElementById('adm-crm-name-preview');
    if(prev) prev.innerHTML = html;
  }

  // 2.3 <title> — a "aba do Google"
  function paintTitle(nameText){
    var t = (nameText||appShortName).replace(/\s+/g,' ').trim();
    if(document.title !== t) document.title = t;
    // meta apple-mobile-web-app-title (atalho da tela inicial iOS)
    var m = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(m) m.setAttribute('content', t);
    // og:title / application-name (compartilhamento e Windows)
    var og = document.querySelector('meta[property="og:title"]');
    if(og) og.setAttribute('content', t);
    var an = document.querySelector('meta[name="application-name"]');
    if(an) an.setAttribute('content', t);
  }

  // 2.4 Favicon + apple-touch-icon (aba do Google, home-screen iOS/Android)
  function paintFavicon(iconOrLogo){
    if(!iconOrLogo) return;
    // Substituir favicon principal
    var icon = document.querySelector('link[rel="icon"]');
    if(!icon){
      icon = document.createElement('link');
      icon.setAttribute('rel','icon');
      document.head.appendChild(icon);
    }
    icon.setAttribute('href', iconOrLogo);
    // Best-effort de tipo — funciona com data-url image/png|jpeg|webp
    var m = /^data:(image\/[a-z+.-]+);/i.exec(iconOrLogo);
    if(m) icon.setAttribute('type', m[1]);

    // apple-touch-icon (ícone na tela inicial do iOS)
    var apple = document.querySelector('link[rel="apple-touch-icon"]');
    if(!apple){
      apple = document.createElement('link');
      apple.setAttribute('rel','apple-touch-icon');
      document.head.appendChild(apple);
    }
    apple.setAttribute('href', iconOrLogo);

    // og:image
    var og = document.querySelector('meta[property="og:image"]');
    if(og) og.setAttribute('content', iconOrLogo);
  }

  // 2.5 theme-color (barra colorida do Chrome/Android)
  function paintThemeColor(color){
    if(!color) return;
    var m = document.querySelector('meta[name="theme-color"]');
    if(!m){
      m = document.createElement('meta');
      m.setAttribute('name','theme-color');
      document.head.appendChild(m);
    }
    m.setAttribute('content', color);
  }

  // 2.6 Manifest PWA — o <link rel="manifest" id="pwa-manifest"> existe mas
  //     estava com href VAZIO no HTML original. Aqui geramos o manifest em
  //     runtime a partir do brand atual e apontamos via blob: URL.
  var _lastManifestUrl = null;
  var _lastManifestJSON = null;
  function paintManifest(brand){
    try{
      var link = document.getElementById('pwa-manifest') || document.querySelector('link[rel="manifest"]');
      if(!link){
        link = document.createElement('link');
        link.setAttribute('rel','manifest');
        link.id = 'pwa-manifest';
        document.head.appendChild(link);
      }
      var icon = brand.icon || brand.logo || null;
      // FIX 2026-08-01: start_url/scope precisam ser ABSOLUTOS. Como o link
      // aponta pra um blob:, um valor relativo ('/') não resolve contra a
      // base blob: — é exatamente isso que o Chrome reporta como
      // "Manifest: property 'start_url' ignored, URL is invalid.".
      var origin = location.origin + '/';
      var manifest = {
        name:       brand.name || appShortName,
        short_name: (brand.name || appShortName).slice(0,12),
        start_url:  origin,
        scope:      origin,
        display:    'standalone',
        background_color: brand.color || '#0A0C10',
        theme_color:      brand.color || '#0A0C10',
        icons: icon ? [
          { src: icon, sizes: '192x192', type: (/^data:(image\/[a-z+.-]+);/i.exec(icon)||[])[1] || 'image/png' },
          { src: icon, sizes: '512x512', type: (/^data:(image\/[a-z+.-]+);/i.exec(icon)||[])[1] || 'image/png' },
        ] : [],
      };
      var manifestJSON = JSON.stringify(manifest);
      // Não recria o blob (nem o link muda) se o conteúdo é idêntico ao
      // já aplicado — era isso que causava dezenas de blob: novos por
      // sessão (um por tick do polling/realtime), cada um relogando o aviso
      // de manifest inválido no console.
      if(manifestJSON === _lastManifestJSON){
        root.__lfManifestCache = manifest;
        return;
      }
      _lastManifestJSON = manifestJSON;
      root.__lfManifestCache = manifest;
      var blob = new Blob([manifestJSON], { type:'application/manifest+json' });
      var url  = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      // Libera a URL anterior pra não vazar memória
      if(_lastManifestUrl) try{ URL.revokeObjectURL(_lastManifestUrl); }catch(_e){}
      _lastManifestUrl = url;
    }catch(e){ WARN('manifest paint falhou', e); }
  }

  // 2.7 Fonte customizada (Google Fonts ou família CSS livre)
  function paintFont(font){
    // Remove qualquer <link> antigo de Google Fonts que a gente tenha injetado.
    var old = document.getElementById(GFONT_ID);
    if(old) old.remove();
    // Remove regra CSS anterior
    var oldStyle = document.getElementById('lf-brand-font-style');
    if(oldStyle) oldStyle.remove();

    if(!font) return;

    // Heurística: se contém espaço + primeira letra maiúscula, provavelmente
    // é nome de família (ex: "Poppins"). Tenta carregar do Google Fonts.
    var family = String(font||'').trim();
    if(!family) return;

    // Google Fonts (fallback silencioso se offline)
    var link = document.createElement('link');
    link.id = GFONT_ID;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family='
              + encodeURIComponent(family).replace(/%20/g,'+')
              + ':wght@400;500;600;700&display=swap';
    document.head.appendChild(link);

    // Aplica via CSS var — cobre body, títulos e a marca .crm-brand-name.
    var style = document.createElement('style');
    style.id = 'lf-brand-font-style';
    style.textContent =
      ':root{--lf-brand-font:"'+family.replace(/"/g,'\\"')+'",system-ui,sans-serif}'+
      'body,.crm-brand-name,.nmn,.splash-txt,.lbr,h1,h2,h3{font-family:var(--lf-brand-font)!important}';
    document.head.appendChild(style);
  }

  // 2.8 Capacitor — nome do app nativo (Android/iOS)
  function paintCapacitorName(nameText){
    try{
      var Cap = root.Capacitor;
      if(!(Cap && Cap.isNativePlatform && Cap.isNativePlatform())) return;
      // Capacitor App plugin — se não estiver disponível, ignora silenciosamente.
      var App = Cap.Plugins && Cap.Plugins.App;
      if(App && typeof App.setName === 'function'){
        App.setName({ name: nameText || appShortName }).catch(function(){});
      }
    }catch(_e){}
  }

  // 2.9 Orquestra tudo
  function applyBrand(brand){
    if(!brand) return;
    _current = brand;
    // O favicon default é o próprio logo, a não ser que exista um icon dedicado.
    paintLogo(brand.logo);
    paintName(brand.name, brand.nameImg);
    paintTitle(brand.name);
    paintFavicon(brand.icon || brand.logo);
    paintThemeColor(brand.color);
    paintManifest(brand);
    paintFont(brand.font);
    paintCapacitorName(brand.name);

    // Espelha em localStorage as chaves antigas — quem ainda ler pelo caminho
    // legado (loadLogoRemote/loadCRMNameRemote) segue funcionando.
    try{ if(brand.logo) localStorage.setItem('lf_custom_logo', brand.logo);
         else          localStorage.removeItem('lf_custom_logo'); }catch(_e){}
    try{ localStorage.setItem('lf_custom_crm_name', JSON.stringify({ name:brand.name, img:brand.nameImg })); }catch(_e){}
  }

  // -------------------------------------------------------------------
  // 3. Ciclo de vida — boot, polling e sync entre abas
  // -------------------------------------------------------------------
  function _nextDelay(){
    // 20s -> 40s -> 80s -> 160s -> 300s (teto 5 min)
    var d = POLL_MS * Math.pow(2, Math.min(_fails, 4));
    return Math.min(d, 300000);
  }
  function _schedule(){ try{ clearTimeout(_timer); }catch(_e){} _timer = setTimeout(_tick, _nextDelay()); }
  function _tick(){
    // Offline? Não faz fetch, não loga nada — só reagenda.
    if(typeof navigator!=='undefined' && navigator.onLine===false){ _schedule(); return; }
    fetchBrand({}).then(function(r){
      if(_fails>0) LOG('conexão com /branding restabelecida após '+_fails+' falha(s)');
      _fails = 0; _warned = false;
      if(r && r.changed && r.brand){
        applyBrand(r.brand);
        _broadcast(r.brand);
      }
      _schedule();
    }).catch(function(e){
      _fails++;
      // [FIX 20260826] ERR_FAILED de rede oscilante / auth pendente não
      // é erro de aplicação — reagenda em silêncio. Só avisa falhas HTTP reais.
      var _m = (e && e.message) || '';
      var _isNet = /Failed to fetch|NetworkError|ERR_FAILED|deferred|fetch/i.test(_m);
      if(!_warned && !_isNet){ WARN('poll falhou — backoff ativo ('+Math.round(_nextDelay()/1000)+'s)', _m); _warned = true; }
      _schedule();
    });
  }

  function _broadcast(brand){
    try{ if(_channel) _channel.postMessage({ type:'brand', brand:brand, ts:Date.now() }); }catch(_e){}
  }

  function _setupChannel(){
    try{
      if(typeof BroadcastChannel === 'undefined') return;
      _channel = new BroadcastChannel(CH_NAME);
      _channel.onmessage = function(ev){
        var msg = ev && ev.data;
        if(msg && msg.type==='brand' && msg.brand) applyBrand(msg.brand);
      };
    }catch(_e){}
  }

  function bootBrand(){
    // 1) Pinta imediato com o cache local (evita flash de branding antigo)
    var cached = _readCache();
    if(cached) applyBrand(cached);

    // 2) Puxa da nuvem em seguida (força — ignora ETag no primeiro tick).
    //    Offline? usa só o cache local (já pintado acima) e deixa o poll cuidar.
    if(typeof navigator==='undefined' || navigator.onLine!==false){
      fetchBrand({ force:true }).then(function(r){
        if(r && r.brand) applyBrand(r.brand);
      }).catch(function(e){ WARN('boot fetch falhou (cache local mantido)', e && e.message); });
    }

    // 3) Setup canal + polling contínuo COM BACKOFF (sem setInterval fixo)
    _setupChannel();
    _schedule();

    // 4) Também repinta quando a aba volta ao foco (ADM pode ter salvo em outro dispositivo)
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState==='visible') _tick();
    });
    window.addEventListener('online', function(){ _fails=0; _warned=false; _tick(); });
  }

  // -------------------------------------------------------------------
  // 4. Hooks — envolve as funções antigas de configuracoes.js
  //    Assim, admChangeLogo/admChangeCRMNameText/etc. continuam
  //    funcionando com os mesmos formulários da tela de configurações.
  // -------------------------------------------------------------------
  function _saveRemote(patch){
    return fetch(ENDPOINT, {
      method:'PUT',
      credentials:'include',
      headers:(function(){ var h={ 'Content-Type':'application/json' }; var _t=_getToken(); if(_t) h['Authorization']='Bearer '+_t; return h; })(),
      body: JSON.stringify(patch||{}),
    }).then(function(resp){
      if(!resp.ok) throw new Error('PUT /api/v1/branding falhou: '+resp.status);
      return resp.json();
    }).then(function(json){
      var brand = (json && (json.data||json)) || null;
      if(brand){
        _writeCache(brand);
        applyBrand(brand);
        _broadcast(brand);
        // Reforço rápido — força os outros dispositivos a repintarem em 1.5 s
        setTimeout(_tick, FAST_MS);
      }
      return brand;
    });
  }

  // Substitui applyCustomLogo — mantém a assinatura antiga.
  var _origApplyCustomLogo = root.applyCustomLogo;
  root.applyCustomLogo = function(dataUrl){
    paintLogo(dataUrl);
    paintFavicon(dataUrl || (_current && _current.icon) || null);
    // Reflete no manifest (o ícone da PWA muda também)
    if(_current) paintManifest(Object.assign({}, _current, { logo: dataUrl }));
  };

  // Substitui applyCRMBranding — mantém a assinatura (nameText, imageData).
  var _origApplyCRMBranding = root.applyCRMBranding;
  root.applyCRMBranding = function(nameText, imageData){
    paintName(nameText, imageData);
    if(nameText) paintTitle(nameText);
    paintCapacitorName(nameText);
  };

  // Intercepta admChangeLogo — depois de comprimir a imagem, publica no /branding.
  var _origAdmChangeLogo = root.admChangeLogo;
  if(typeof _origAdmChangeLogo === 'function'){
    root.admChangeLogo = function(input){
      if(typeof root.hasAdminAccess==='function' && !root.hasAdminAccess()){
        if(typeof root.toast==='function') root.toast('Apenas ADM/Gestor pode trocar a logo.');
        return;
      }
      var file = input && input.files && input.files[0];
      if(!file) return;
      if(!file.type || !file.type.startsWith('image/')){
        if(typeof root.toast==='function') root.toast('⚠️ Selecione uma imagem válida');
        input.value=''; return;
      }
      if(file.size > 20*1024*1024){
        if(typeof root.toast==='function') root.toast('⚠️ Imagem muito grande (máx. 20MB)', 4000);
        input.value=''; return;
      }
      if(typeof root.toast==='function') root.toast('Otimizando logo...', 1500);
      var doCompressed = function(data){
        if(!data){
          if(typeof root.toast==='function') root.toast('⚠️ Não foi possível processar a imagem.');
          input.value=''; return;
        }
        _saveRemote({ logo:data }).then(function(){
          if(typeof root.toast==='function') root.toast('✅ Logo atualizada em todos os dispositivos!');
        }).catch(function(e){
          WARN('saveRemote logo falhou', e);
          if(typeof root.toast==='function') root.toast('⚠️ Logo salva localmente, mas falhou ao sincronizar.', 4500);
        });
        input.value='';
      };
      if(typeof root.compressImageFile === 'function'){
        root.compressImageFile(file, 900000, doCompressed);
      }else{
        var rd = new FileReader();
        rd.onload = function(e){ doCompressed(e.target.result); };
        rd.onerror = function(){ doCompressed(null); };
        rd.readAsDataURL(file);
      }
    };
  }

  // Reset da logo — DELETE global.
  var _origAdmResetLogo = root.admResetLogo;
  if(typeof _origAdmResetLogo === 'function'){
    root.admResetLogo = function(){
      if(typeof root.hasAdminAccess==='function' && !root.hasAdminAccess()){
        if(typeof root.toast==='function') root.toast('Apenas ADM/Gestor pode resetar a logo.');
        return;
      }
      _saveRemote({ logo:null, icon:null }).then(function(){
        if(typeof root.toast==='function') root.toast('✅ Logo resetada em todos os dispositivos.');
      }).catch(function(e){
        WARN('reset logo falhou', e);
        if(typeof root.toast==='function') root.toast('⚠️ Falha ao resetar na nuvem.', 4500);
      });
    };
  }

  // Nome do CRM (texto)
  var _origAdmChangeCRMNameText = root.admChangeCRMNameText;
  if(typeof _origAdmChangeCRMNameText === 'function'){
    root.admChangeCRMNameText = function(){
      if(typeof root.hasAdminAccess==='function' && !root.hasAdminAccess()){
        if(typeof root.toast==='function') root.toast('Apenas ADM/Gestor pode alterar o nome.');
        return;
      }
      var inp = document.getElementById('cfg-crm-name-input');
      var name = (inp && inp.value || '').trim();
      if(!name){ if(typeof root.toast==='function') root.toast('Digite um nome para o CRM'); return; }
      _saveRemote({ name:name, nameImg:null }).then(function(){
        if(typeof root.toast==='function') root.toast('✅ Nome atualizado em todos os dispositivos!');
      }).catch(function(e){
        WARN('save name falhou', e);
        if(typeof root.toast==='function') root.toast('⚠️ Nome salvo localmente, mas falhou ao sincronizar.', 4500);
      });
    };
  }

  // Nome do CRM (imagem PNG do nome)
  var _origAdmChangeCRMNameImage = root.admChangeCRMNameImage;
  if(typeof _origAdmChangeCRMNameImage === 'function'){
    root.admChangeCRMNameImage = function(input){
      if(typeof root.hasAdminAccess==='function' && !root.hasAdminAccess()){
        if(typeof root.toast==='function') root.toast('Apenas ADM/Gestor pode alterar o nome.');
        return;
      }
      var file = input && input.files && input.files[0]; if(!file) return;
      if(!file.type || !file.type.startsWith('image/')){
        if(typeof root.toast==='function') root.toast('⚠️ Selecione uma imagem válida');
        input.value=''; return;
      }
      if(typeof root.toast==='function') root.toast('Enviando imagem do nome...', 1500);
      var rd = new FileReader();
      rd.onload = function(e){
        _saveRemote({ nameImg:e.target.result, name:null }).then(function(){
          if(typeof root.toast==='function') root.toast('✅ Nome atualizado em todos os dispositivos!');
        }).catch(function(err){
          WARN('save nameImg falhou', err);
          if(typeof root.toast==='function') root.toast('⚠️ Nome salvo localmente, mas falhou ao sincronizar.', 4500);
        });
        input.value='';
      };
      rd.onerror = function(){
        if(typeof root.toast==='function') root.toast('⚠️ Não foi possível ler essa imagem.');
        input.value='';
      };
      rd.readAsDataURL(file);
    };
  }

  // Reset do nome
  var _origAdmResetCRMName = root.admResetCRMName;
  if(typeof _origAdmResetCRMName === 'function'){
    root.admResetCRMName = function(){
      if(typeof root.hasAdminAccess==='function' && !root.hasAdminAccess()){
        if(typeof root.toast==='function') root.toast('Apenas ADM/Gestor pode resetar o nome.');
        return;
      }
      _saveRemote({ name:appShortName, nameImg:null }).then(function(){
        if(typeof root.toast==='function') root.toast('✅ Nome resetado em todos os dispositivos.');
      });
      var inp = document.getElementById('cfg-crm-name-input'); if(inp) inp.value='';
    };
  }

  // NOVOS setters (fonte e cor) — para o painel ADM ganhar 2 campos a mais.
  root.admChangeCRMFont = function(fontName){
    if(typeof root.hasAdminAccess==='function' && !root.hasAdminAccess()){
      if(typeof root.toast==='function') root.toast('Apenas ADM/Gestor pode alterar a fonte.');
      return;
    }
    _saveRemote({ font: fontName || null }).then(function(){
      if(typeof root.toast==='function') root.toast('✅ Fonte atualizada em todos os dispositivos!');
    });
  };
  root.admChangeCRMColor = function(hex){
    if(typeof root.hasAdminAccess==='function' && !root.hasAdminAccess()){
      if(typeof root.toast==='function') root.toast('Apenas ADM/Gestor pode alterar a cor.');
      return;
    }
    _saveRemote({ color: hex || '#0A0C10' }).then(function(){
      if(typeof root.toast==='function') root.toast('✅ Cor atualizada em todos os dispositivos!');
    });
  };

  // Também neutraliza loadLogoRemote/loadCRMNameRemote (que rodam no boot em
  // startApp) — se este patch já subiu, eles viram no-ops porque bootBrand()
  // faz o trabalho completo.
  root.loadLogoRemote     = function(cb){ try{ cb && cb(_current && _current.logo || null); }catch(_e){} };
  root.loadCRMNameRemote  = function(cb){ try{ cb && cb(_current ? { name:_current.name, img:_current.nameImg } : null); }catch(_e){} };

  // -------------------------------------------------------------------
  // 5. Boot
  // -------------------------------------------------------------------
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootBrand, { once:true });
  }else{
    bootBrand();
  }

  // Marca de sanidade — útil pra debug ('lf-brand: v1 loaded' no console).
  try{ root.__lfBrandRealtime = { version:'v1-20260730', apply:applyBrand, tick:_tick }; }catch(_e){}
  LOG('v1 loaded — endpoint:', ENDPOINT);

})(typeof window !== 'undefined' ? window : this);
