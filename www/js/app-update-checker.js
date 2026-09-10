/* =====================================================================
 * js/app-update-checker.js
 * -----------------------------------------------------------------------
 * Pedido 2026-08-17: sempre que sobe um deploy novo, o CRM deve detectar
 * isso sozinho na próxima vez que alguém entrar (ou continuar usando) e
 * aplicar a atualização de verdade — não bastava um F5 simples, porque
 * js/*, css/* e src/* têm Cache-Control: public, max-age=31536000,
 * immutable no Cloudflare Pages (ver _headers): uma vez que o navegador
 * cacheia um desses arquivos, ele NUNCA revalida com o servidor de novo
 * dentro de 1 ano — nem um F5 força isso, porque "immutable" é
 * literalmente uma promessa de que aquele arquivo nunca muda.
 *
 * O que torna o cache-busting funcionar é a query string ?v=... na tag
 * <script>/<link> — trocar o valor troca a URL, e uma URL nova nunca
 * está em cache. index.html/app.html em si têm Cache-Control: no-store
 * (sempre frescos), então o HTML SEMPRE reflete o deploy mais recente —
 * o problema é só garantir que, quando esse HTML novo chega com uma
 * versão de arquivo diferente, o navegador da pessoa REAGE a isso, em
 * vez de continuar rodando o JS antigo já carregado na aba aberta.
 *
 * COMO FUNCIONA
 * -------------
 * 1) js/lf-config.js é carregado primeiro e expõe a versão desta aba.
 * 2) Ao abrir o CRM, guardamos a versão ATUAL (a desta aba).
 * 3) Periodicamente (e ao focar a aba / voltar de segundo plano),
 *    buscamos novamente js/lf-config.js com cache:'no-store' e extraímos
 *    o marcador LF_CONFIG_VERSION sem executar o conteúdo remoto.
 * 4) Diferente = deploy novo aconteceu depois que esta aba abriu.
 *    Mostra um aviso, espera não atrapalhar nada que esteja aberto na
 *    tela, e recarrega a página de verdade (não localStorage/sessão —
 *    login e dados salvos continuam intactos, só o CÓDIGO é atualizado).
 * 5) Botão manual (🔄, ao lado do sino/Atividades) faz a mesma checagem
 *    na hora, por precaução — útil se alguém quiser forçar sem esperar
 *    o próximo ciclo automático.
 *
 * IMPORTANTE PARA QUEM PREPARA CADA DEPLOY: atualize LF_CONFIG_VERSION em
 * js/lf-config.js. O script scripts/release-and-sync.mjs também atualiza
 * o querystring da tag desse arquivo para quebrar o cache dos bundles.
 * ===================================================================== */
(function(){
  'use strict';
  if(window.__LF_UPDATE_CHECKER_INSTALLED__)return;
  window.__LF_UPDATE_CHECKER_INSTALLED__=true;

  var _cfg=window.LiderCRM&&window.LiderCRM.config||{};
  var _updateCfg=_cfg.update||{};
  var CHECK_INTERVAL_MS=Number(_updateCfg.checkIntervalMs)||4*60*1000;
  var MAX_WAIT_FOR_IDLE_MS=Number(_updateCfg.maxWaitForIdleMs)||2*60*1000;
  var _myBuildId=String(_cfg.appVersion||window.LF_CONFIG_VERSION||'');
  var _checking=false;
  var _updatePending=false;
  var _pendingSince=0;

  function _readMetaBuildId(doc){
    try{
      var el=doc.querySelector('meta[name="lf-build-id"]');
      return el?(el.getAttribute('content')||'').trim():null;
    }catch(_e){return null;}
  }

  if(!_myBuildId)_myBuildId=_readMetaBuildId(document);

  function _readConfigVersion(text){
    try{
      var match=String(text||'').match(/LF_CONFIG_VERSION\s*=\s*['"]([^'"]+)['"]/);
      return match&&match[1]?match[1].trim():null;
    }catch(_e){return null;}
  }

  function _anyModalOpen(){
    try{
      // [FIX 20260917] O sistema de modais real (openM() em js/utils.js)
      // usa classList.add('open') — nunca ".show", nunca display inline.
      // O seletor antigo nunca reconhecia corretamente um modal aberto,
      // incluindo o de detalhe do lead (onde fica a anotação) — o
      // recarregamento forçado nunca esperava de verdade.
      if(document.querySelector('.mo.open'))return true;
      // Camada extra: pessoa com o cursor ativo em qualquer campo de
      // texto/anotação (mesmo fora de modal) — não interrompe.
      var ae=document.activeElement;
      if(ae&&(ae.tagName==='TEXTAREA'||(ae.tagName==='INPUT'&&/text|email|tel|number|search/i.test(ae.type||'text'))))return true;
      return false;
    }catch(_e){return false;}
  }

  function _flushPendingEdits(){
    // [FIX 20260917] Última garantia antes de recarregar: se o campo de
    // anotação ou valor do lead estiver focado (edição em andamento),
    // força o salvamento síncrono agora — não espera o próximo
    // 'oninput' que talvez nunca chegue a disparar antes da troca de
    // página.
    try{
      var ae=document.activeElement;
      if(ae&&ae.id==='det-obs'&&typeof autoSaveKBObs==='function')autoSaveKBObs();
      if(ae&&ae.id==='det-valor'&&typeof autoSaveKBValor==='function')autoSaveKBValor();
    }catch(_e){}
  }

  function _doCleanReload(){
    _flushPendingEdits();
    // Limpeza defensiva de Cache Storage (API distinta do cache HTTP —
    // hoje o CRM não usa Service Worker/Cache API, mas se algum dia
    // passar a usar, isso garante que nada fique preso de uma versão
    // antiga). NUNCA toca localStorage/sessionStorage — sessão e dados
    // salvos do usuário continuam intactos.
    try{
      if(window.caches&&typeof caches.keys==='function'){
        caches.keys().then(function(keys){
          keys.forEach(function(k){try{caches.delete(k);}catch(_e){}});
        }).catch(function(){});
      }
    }catch(_e){}
    try{
      var url=new URL(window.location.href);
      url.searchParams.set('_upd',String(Date.now()));
      window.location.replace(url.toString());
    }catch(_e){
      window.location.reload();
    }
  }

  function _scheduleReloadWhenIdle(){
    if(_updatePending)return; // já agendado
    _updatePending=true;
    _pendingSince=Date.now();
    try{toast('🔄 Nova versão do CRM disponível — atualizando em instantes...',5000);}catch(_e){}
    var poll=setInterval(function(){
      var waitedTooLong=(Date.now()-_pendingSince)>MAX_WAIT_FOR_IDLE_MS;
      if(!_anyModalOpen()||waitedTooLong){
        clearInterval(poll);
        _doCleanReload();
      }
    },1500);
  }

  function lfCheckForUpdateNow(manual){
    if(_checking)return;
    if(_updatePending){ if(manual)try{toast('🔄 Atualização já a caminho...',2500);}catch(_e){} return; }
    _checking=true;
    // A versão remota vem da fonte única de configuração. O querystring
    // impede que o próprio arquivo de configuração seja lido do cache.
    fetch('/js/lf-config.js?lf-check=' + Date.now(),{cache:'no-store',credentials:'same-origin'}).then(function(res){
      return res.text();
    }).then(function(text){
      var serverBuildId=_readConfigVersion(text);
      _checking=false;
      if(!serverBuildId||!_myBuildId){
        if(manual)try{toast('Não foi possível verificar agora — tente de novo em instantes.',3000);}catch(_e){}
        return;
      }
      if(serverBuildId!==_myBuildId){
        _scheduleReloadWhenIdle();
      }else if(manual){
        try{toast('✅ Você já está na versão mais recente.',2500);}catch(_e){}
      }
    }).catch(function(e){
      _checking=false;
      console.warn('[app-update-checker] verificação falhou',e);
      if(manual)try{toast('⚠️ Não foi possível verificar — sem conexão?',3000);}catch(_e){}
    });
  }

  function _boot(){
    // Primeira checagem automática só depois de um tempo (não compete
    // com o boot inicial da tela) — e depois, a cada CHECK_INTERVAL_MS.
    setTimeout(function(){ lfCheckForUpdateNow(false); },30000);
    setInterval(function(){ if(!document.hidden) lfCheckForUpdateNow(false); },CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange',function(){
      if(document.visibilityState==='visible') lfCheckForUpdateNow(false);
    },{passive:true});
    window.addEventListener('focus',function(){ lfCheckForUpdateNow(false); },{passive:true});
  }

  window.lfCheckForUpdateNow=lfCheckForUpdateNow;

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',_boot);
  else _boot();
})();
