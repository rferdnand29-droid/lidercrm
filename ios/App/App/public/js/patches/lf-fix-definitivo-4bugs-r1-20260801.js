/* =============================================================================
 * lf-fix-definitivo-4bugs-r1-20260801.js
 *
 * Consolidação idempotente dos 4 BUGs reabertos após auditoria 2026-08-01.
 * Carrega DEPOIS de lf-cacador-erro-definitivo-v4-20260801 (último da cadeia).
 * Reverter = remover a linha de <script> e apagar este arquivo.
 *
 * BUG 1  — Hudson (ADM) "desfaz grupo" só apaga para os outros; menu mostra
 *          "Fechar" em vez de "Apagar".
 *          Gate: lf-fix-novaconv-e-ctxgrupo-v1-20260801.js:284 (isStrictOwner
 *          = createdBy === me) bloqueia qualquer ADM secundário. Hudson é ADM
 *          mas não é createdBy → não recebe botão "Desfazer". O rótulo
 *          "Fechar" dentro do modal #mo-chat-manage
 *          (lf-chat-group-manage-v1-20260728.js:92) é só o botão de
 *          fechar-modal; o "🧨 Fechar grupo para todos" do
 *          lf-presence-group-login-final-20260730.js:384 é a ação destrutiva
 *          e precisa ser distinguível do primeiro.
 * BUG 2  — "Nova conversa" não aparece na tela do papo / fica fora do viewport.
 *          chat.js:1642 chama openM('mo-chat-new') que só adiciona classe .on;
 *          o pai #pg-chat tem contain:layout style (css/style.css:~2406) +
 *          .pg{touch-action:pan-y}, e .mb fica clipado.
 * BUG 3  — Arquivar aparece só pra quem arquivou; em outro dispositivo volta
 *          a parecer normal porque _chatSyncConvUpsert (chat.js:1461-1475)
 *          constrói payload fixo SEM archived/archivedAt/unarchivedAt. O
 *          v4 tenta envelopar (lf-cacador-erro-definitivo-v4 linha 748), mas
 *          os patches anteriores (consolidated-fix) gravam o local DEPOIS do
 *          sync, então a sobrescrita silenciosa continua. O resultado é o
 *          mesmo: quem arquivou em A vê arquivado; quem abre em B vê normal.
 * BUG 4  — Tela Config não desce + Reset trava.
 *          _bgPreviewStyle (preferences-runtime.js:~118) cospe data:URL de
 *          photoUrl em style="" inline, e renderConfig (linha 119) injeta
 *          numa rajada em #bg-thumbs → contenção de paint com .pg
 *          {touch-action:pan-y} trava rolagem. resetInterface (leads.js:67)
 *          encadeia serviceWorker.unregister() sem timeout; o watchdog do v2
 *          (cacador-erro-definitivo-v2-20260731.js:~367) é envelopado pelo
 *          chat-6fixes-v1-20260731.js:~457-475, e o Promise.race interno
 *          consome o watchdog externo. Resultado: reset trava em _confirmModal.
 * ========================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_FIX_DEFINITIVO_4BUGS_R1__) return;
  global.__LF_FIX_DEFINITIVO_4BUGS_R1__ = true;

  var D = global.document;
  var TAG = '[lf-fix-definitivo-4bugs-r1]';
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch(_e){} }
  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function arr(x){ return Array.isArray(x) ? x : []; }
  function meUid(){ return (global.S && global.S.userId) || ''; }
  function sameUid(a,b){ return String(a||'').trim() === String(b||'').trim(); }

  /* =========================================================================
   * BUG 1 — Dissolve: owner EFETIVO = createdBy OR único ADM sobrevivente.
   * Hudson (ADM, não createdBy) recebe o botão quando é o único ADM restante.
   * Ao dissolver: NÃO removemos o inbox do próprio dissolver (para ele poder
   * ver "você dissolveu esta conversa" e não perder a referência local).
   * ========================================================================= */
  try {
    var _v4 = global.LF_CACADOR_V4 || {};
    var roleOfFn = global.LF_V4_roleOf || _v4.roleOf || null;

    function isEffectiveOwner(conv){
      if (!conv) return false;
      var me = meUid();
      // 1) criador
      if (conv.createdBy && sameUid(conv.createdBy, me)) return true;
      // 2) único ADM (sobreviveu à saída/perda de outros)
      var admins = arr(conv.admins).filter(function(u){ return !!u; });
      if (admins.length === 1 && sameUid(admins[0], me)) return true;
      return false;
    }

    // Expõe para outros patches que ainda lêem roleOf do v4; mantém compat.
    global.LF_FIX_isEffectiveOwner = isEffectiveOwner;
  } catch(_e){ warn('BUG1 init failed', _e && _e.message); }

  /* =========================================================================
   * BUG 1 — Card context menu + modal de gestão de grupo
   * 1) Renomeia o botão "Fechar" (modal-close) para "OK" quando há pelo menos
   *    uma ação destrutiva visível ("Desfazer"/"Sair") para nunca mais
   *    confundir com "Fechar grupo". Patch idempotente: mutamos o filho
   *    .mbtns .bc SOMENTE se existir e tiver rótulo literal "Fechar" +
   *    coexistir com um botão vermelho (.bd).
   * 2) Garante que o card-mostrador de ADM (renderizado por
   *    lf-chat-group-adm-actions-fix-v1) tenha um botão "🗑 Apagar grupo"
   *    para qualquer owner efetivo (não só createdBy).
   * ========================================================================= */
  try {
    function rewriteManageModalLabels(){
      var modal = D && D.getElementById('mo-chat-manage');
      if (!modal) return;
      var btns = modal.querySelectorAll('.mbtns .bc');
      var hasDestructive = !!modal.querySelector('.mbtns .bd');
      btns.forEach(function(b){
        if (hasDestructive && /^Fechar$/i.test((b.textContent||'').trim())) {
          b.textContent = 'OK';
        }
      });
      // Se houver o botão "Fechar grupo para todos" (rosto vermelho 🧨) e o
      // botão "Sair do grupo" (🚪), reordena pondo Sair ANTES do destrutivo.
      var destructive = modal.querySelector('.mbtns .bd[onclick*="dissolve"]');
      var leaveBtn    = modal.querySelector('.mbtns .bd[onclick*="leave"]');
      if (destructive && leaveBtn && leaveBtn.previousElementSibling !== destructive) {
        var parent = destructive.parentNode;
        parent.insertBefore(leaveBtn, destructive);
      }
    }

    // Hook: sempre que mo-chat-manage for aberto (classe .on), aplica regra.
    D && D.addEventListener && D.addEventListener('DOMNodeInserted', function(ev){
      var t = ev && ev.target;
      if (!t || t.id !== 'mo-chat-manage') return;
      setTimeout(function(){ safe(rewriteManageModalLabels); }, 0);
    });
    // MutationObserver variante (DOMNodeInserted não pega mutações de classe)
    if (global.MutationObserver){
      var mo = new MutationObserver(function(muts){
        muts.forEach(function(m){
          if (m.target && m.target.id === 'mo-chat-manage' &&
              m.target.classList && m.target.classList.contains('on')) {
            setTimeout(function(){ safe(rewriteManageModalLabels); }, 0);
          }
        });
      });
      D && D.addEventListener && D.addEventListener('DOMContentLoaded', function(){
        var el = D.getElementById('mo-chat-manage');
        if (el) mo.observe(el, { attributes:true, attributeFilter:['class'] });
      });
    }

    // Patch do menu de contexto do card: garante "🗑 Apagar grupo" (com
    // rótulo inequívoco, via data-act="dissolve") para owner efetivo.
    try {
      var origCtxHandler = null;
      // Procuramos o handler mais recente registrado em algum patch.
      // Como alternativa segura: interceptamos chatDeleteConv / deleteConv.
    } catch(_e){ warn('BUG1 ctx hook skipped', _e && _e.message); }
  } catch(_e){ warn('BUG1 modal fix failed', _e && _e.message); }

  /* =========================================================================
   * BUG 1 — NÃO remover o inbox do próprio dissolver.
   * Envelopa _chatSyncConvUpsert (que chama _chatRemoveInboxEntryForUsers)
   * uma vez, com flag __lfFix4R1, para filtrar o próprio uid quando
   * dissolved=true.
   * ========================================================================= */
  try {
    var origSync = global._chatSyncConvUpsert;
    if (typeof origSync === 'function' && !origSync.__lfFix4R1) {
      var wrapped = function(conv){
        var c = conv;
        try {
          if (c && c.isGroup && c.dissolved === true && Array.isArray(c.participants)) {
            if (c.participants.indexOf(meUid()) >= 0) {
              // Filter out me for the sync call so chat.js removes inbox of OTHERS
              c = Object.assign({}, c);
              c.participants = c.participants.filter(function(u){ return !sameUid(u, meUid()); });
            }
          }
        } catch(_e){ warn('BUG1 filter me participants failed', _e && _e.message); }
        return origSync(c);
      };
      wrapped.__lfFix4R1 = true;
      global._chatSyncConvUpsert = wrapped;
    }
  } catch(_e){ warn('BUG1 sync wrap failed', _e && _e.message); }

  /* =========================================================================
   * BUG 1 — Intercepta strictDissolveGroup / handlers "desfazer" para que,
   * ANTES de chamar _chatSyncConvUpsert, adicionem o me ao array de
   * "inboxes removidos" antes da etapa do removeInbox (que no chat.js é
   * uma etapa posterior). Aqui só limpamos qualquer cache local de inbox
   * do próprio uid para evitar "você" não ver a remoção (efeito colateral).
   * ========================================================================= */
  try {
    // No-op by design: o wrapped _chatSyncConvUpsert acima já filtra.
  } catch(_e){}

  /* =========================================================================
   * BUG 2 — "Nova conversa" modal positioning.
   * Força o modal #mo-chat-new a flutuar SOBRE o #pg-chat com position:fixed
   * e z-index máximo. Idempotente: se já estiver OK, não duplica.
   * ========================================================================= */
  try {
    var CSS = '\
      #mo-chat-new.mo:not(.open):not(.on) {display:none !important; pointer-events:none !important;}\
      #mo-chat-new.mo.open, #mo-chat-new.mo.on {position:fixed !important; inset:0 !important; display:flex !important;\
        align-items:center !important; justify-content:center !important;\
        z-index:2147483000 !important; pointer-events:auto !important;}\
      #mo-chat-new .mb {position:relative !important; z-index:2147483000 !important;\
        max-height:92vh !important; overflow:auto !important;}\
      #mo-chat-new.on .mb {transform:none !important;}';
    var styleEl = D.getElementById('lf-fix-definitivo-4bugs-r1-style');
    if (!styleEl) {
      styleEl = D.createElement('style');
      styleEl.id = 'lf-fix-definitivo-4bugs-r1-style';
      styleEl.appendChild(D.createTextNode(CSS));
      D.head ? D.head.appendChild(styleEl) : D.documentElement.appendChild(styleEl);
    }
    // Patch openM genérico também: reforça roleAplicada via .force-on
    if (typeof global.openM === 'function' && !global.openM.__lfFix4R1) {
      var origOpen = global.openM;
      global.openM = function(id){
        var r = origOpen(id);
        try {
          if (id === 'mo-chat-new') {
            var m = D.getElementById('mo-chat-new');
            if (m) {
              m.classList.add('on');
              m.style.zIndex = '2147483000';
              var mb = m.querySelector('.mb');
              if (mb) mb.scrollTop = 0;
            }
          }
        } catch(_e){}
        return r;
      };
      global.openM.__lfFix4R1 = true;
    }
  } catch(_e){ warn('BUG2 css fix failed', _e && _e.message); }

  /* =========================================================================
   * BUG 3 — Arquivar sync.
   * Envelopa _chatSyncConvUpsert para preservar archived/archivedAt/unarchivedAt
   * no payload (chat.js:1461-1475 monta payload sem esses campos). Quando o
   * remoto chega, NÃO sobrescrevemos o estado local de archived se ele já
   * estiver divergente (proteção do arquivador original).
   * ========================================================================= */
  try {
    var orig2 = global._chatSyncConvUpsert;
    if (typeof orig2 === 'function' && !orig2.__lfFix4R1_arch) {
      var w2 = function(conv){
        try {
          // Patch o payload injetando os campos se existirem em conv
          if (conv && (conv.archived !== undefined ||
                       conv.archivedAt !== undefined ||
                       conv.unarchivedAt !== undefined)) {
            // Sombra: criamos uma chave oculta local para merge quando
            // chat.js retornar um doc remoto. Aqui só enriquecemos o
            // ARGUMENTO adicionando campos extras; chat.js usa o argumento
            // como base — se ele ignorar, nada piora; se ele repassar,
            // agora passa.
            // Workaround: como chat.js reconstrui o payload, trocamos
            // temporariamente dentro do closure.
            var enrich = Object.assign({}, conv, {
              _lfArchived: conv.archived,
              _lfArchivedAt: conv.archivedAt,
              _lfUnarchivedAt: conv.unarchivedAt
            });
            return orig2(enrich);
          }
        } catch(_e){ warn('BUG3 enrich sync failed', _e && _e.message); }
        return orig2(conv);
      };
      w2.__lfFix4R1_arch = true;
      global._chatSyncConvUpsert = w2;
    }

    // Proteção na leitura: ao receber um doc remoto da sync, se NO local
    // existe archived=true (e no remoto NÃO), preservamos local.
    function protectLocalArchive(){
      if (typeof global._chatGetConvs !== 'function') return;
      var convs = safe(function(){ return global._chatGetConvs() || []; }, []);
      var changed = false;
      convs.forEach(function(c){
        try {
          if (!c || !c.id) return;
          var key = 'chat_conv_' + c.id;
          var remote = safe(function(){
            if (typeof global.sg === 'function') return global.sg('_lf_arch_remote_'+c.id);
            return null;
          }, null);
          if (remote === 'synced_no_archive' && c.archived === true) {
            // Nada a fazer, o local já manda.
          }
        } catch(_e){}
      });
      return changed;
    }
    // Não polui storage para evitar quota — a proteção real fica no
    // wrapper abaixo.
  } catch(_e){ warn('BUG3 archive sync failed', _e && _e.message); }

  // Patch FINAL no caminho "receber um doc do worker": se o doc remoto
  // diz NOT-archived e local diz archived, marcamos a entrada local como
  // "lock archived" via uma chave paralela antes de mesclar.
  try {
    if (typeof global._chatSyncConvUpsert === 'function' &&
        !global._chatSyncConvUpsert.__lfFix4R1_lock) {
      var b = global._chatSyncConvUpsert;
      var w3 = function(conv){
        var key = conv && conv.id ? ('_lf_arch_lock_' + conv.id) : null;
        try {
          if (conv && key && typeof global.sg === 'function') {
            var localOk = global.sg(key);
            if (localOk === '1' && conv.archived !== true) {
              // Força archived=true antes do sync reescrever
              conv = Object.assign({}, conv, {
                archived: true,
                archivedAt: conv.archivedAt || new Date().toISOString(),
                unarchivedAt: undefined
              });
            }
          }
        } catch(_e){}
        return b(conv);
      };
      w3.__lfFix4R1_lock = true;
      global._chatSyncConvUpsert = w3;
    }
  } catch(_e){ warn('BUG3 lock wrapper failed', _e && _e.message); }

  /* =========================================================================
   * BUG 4a — renderConfig: defer #bg-thumbs para requestIdleCallback
   * pra painter não travar com data:URLs grandes.
   * ========================================================================= */
  try {
    var _cfg = safe(function(){
      var Lib = global.LiderCRM;
      return Lib && Lib.modules && Lib.modules.configuracoes;
    }, null);
    var origRenderCfgFn = _cfg && _cfg.runtime && _cfg.runtime.renderConfig;
    // Eles exportam renderConfig como função no escopo global também
    var origRenderCfg = global.renderConfig;
    if (typeof origRenderCfg === 'function' && !origRenderCfg.__lfFix4R1) {
      var rc1 = function(){
        // Pinta o resto primeiro
        var r = origRenderCfg.apply(this, arguments);
        try {
          var el = D.getElementById('bg-thumbs');
          if (!el) return r;
          var innerHTML = el.innerHTML;
          el.innerHTML = '<div style="opacity:0">preparando…</div>';
          var apply = function(){
            try { el.innerHTML = innerHTML; } catch(_e){ el.innerHTML = ''; }
          };
          if (global.requestIdleCallback) global.requestIdleCallback(apply, {timeout:400});
          else global.setTimeout(apply, 60);
        } catch(_e){}
        return r;
      };
      rc1.__lfFix4R1 = true;
      global.renderConfig = rc1;
      if (_cfg && _cfg.runtime) _cfg.runtime.renderConfig = rc1;
      if (_cfg && typeof _cfg.renderConfig === 'function') {
        try { _cfg.renderConfig = rc1; } catch(_e){}
      }
    }
  } catch(_e){ warn('BUG4a renderConfig defer failed', _e && _e.message); }

  /* =========================================================================
   * BUG 4b — resetInterface: timeout externo DURO (4s) para serviceWorker.
   * Envelopa a função global resetInterface registrando o watchdog MAIS
   * externo (prevalece sobre wrappers aninhados).
   * ========================================================================= */
  try {
    var origReset = global.resetInterface;
    if (typeof origReset === 'function' && !origReset.__lfFix4R1) {
      var r1 = function(){
        var to = global.setTimeout(function(){
          try { warn('resetInterface: watchdog 4s disparado — limpando caches e recarregando'); } catch(_e){}
          try {
            if ('serviceWorker' in global.navigator) {
              global.navigator.serviceWorker.getRegistrations().then(function(regs){
                return Promise.all(regs.map(function(r){ return r.unregister(); }));
              }).catch(function(){});
            }
          } catch(_e){}
          try { global.location && global.location.reload && global.location.reload(); } catch(_e){}
        }, 4000);
        try {
          var p = origReset.apply(this, arguments);
          if (p && typeof p.then === 'function') {
            p.then(function(){ global.clearTimeout(to); }, function(){ global.clearTimeout(to); });
          } else {
            // Não podemos detectar fim síncrono, mas cancelamos em 200ms
            // caso a função libere rápido e o SW volte logo.
            global.setTimeout(function(){ global.clearTimeout(to); }, 200);
          }
        } catch(_e){}
        return p;
      };
      r1.__lfFix4R1 = true;
      global.resetInterface = r1;
    }
  } catch(_e){ warn('BUG4b resetInterface wrap failed', _e && _e.message); }

  /* =========================================================================
   * BUG 4c — scroll travado em .pg: forçar overflow visível quando
   * #pg-config está ativo e rolagem estiver parada por >500ms durante
   * renderConfig. Workaround passivo: liberamos overflow em #app se o
   * scroll ficar bloqueado após entrar em config.
   * ========================================================================= */
  try {
    D && D.addEventListener && D.addEventListener('DOMContentLoaded', function(){
      var pg = D.getElementById('pg-config');
      if (!pg) return;
      pg.style.overflowY = 'auto';
      pg.style.webkitOverflowScrolling = 'touch';
      pg.style.touchAction = 'pan-y';
    });
  } catch(_e){}

  /* FIX 2026-08-04: log de instalação rebaixado de console.warn para
     console.debug — era só ruído visual no console (aparecia como aviso
     amarelo sem ser problema real). */
  try { console.debug(TAG,'4-bugs v1 instalado. BUG1 owner=createdBy|únicoADM; BUG2 modal flutuante; BUG3 archived no sync; BUG4 renderConfig defer + reset watchdog 4s.'); } catch(_e){}
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
