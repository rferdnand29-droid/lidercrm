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
 * 1) index.html/app.html têm uma <meta name="lf-build-id" content="..."/>
 *    inline no <head> — não é um arquivo .js externo (esses ficam em
 *    cache), então esse valor está SEMPRE atualizado a cada carregamento
 *    real de página (o HTML nunca é servido do cache do navegador).
 * 2) Ao abrir o CRM, guardamos o build-id ATUAL (o desta aba).
 * 3) Periodicamente (e ao focar a aba / voltar de segundo plano),
 *    buscamos de novo o HTML da própria página com cache:'no-store' —
 *    dupla garantia de nunca ler do cache — e comparamos o build-id de
 *    lá com o que esta aba tem guardado.
 * 4) Diferente = deploy novo aconteceu depois que esta aba abriu.
 *    Mostra um aviso, espera não atrapalhar nada que esteja aberto na
 *    tela, e recarrega a página de verdade (não localStorage/sessão —
 *    login e dados salvos continuam intactos, só o CÓDIGO é atualizado).
 * 5) Botão manual (🔄, ao lado do sino/Atividades) faz a mesma checagem
 *    na hora, por precaução — útil se alguém quiser forçar sem esperar
 *    o próximo ciclo automático.
 *
 * IMPORTANTE PARA QUEM PREPARA CADA DEPLOY: pra esse mecanismo detectar
 * a mudança, o valor de <meta name="lf-build-id"> em index.html E
 * app.html precisa mudar a cada entrega — mesma disciplina que já existe
 * pra js/lf-build-info.js (BUILT_AT). Se esquecer de atualizar o
 * build-id, o checker não vai perceber que há uma versão nova (ele
 * confia nesse valor como fonte da verdade) — por isso o ideal é os
 * dois serem atualizados juntos, sempre.
 * ===================================================================== */
(function(){
  'use strict';
  if(window.__LF_UPDATE_CHECKER_INSTALLED__)return;
  window.__LF_UPDATE_CHECKER_INSTALLED__=true;

  var CHECK_INTERVAL_MS=4*60*1000; // 4 minutos
  var MAX_WAIT_FOR_IDLE_MS=2*60*1000; // não segura o reload pra sempre
  var _myBuildId=null;
  var _checking=false;
  var _updatePending=false;
  var _pendingSince=0;

  function _readMetaBuildId(doc){
    try{
      var el=doc.querySelector('meta[name="lf-build-id"]');
      return el?(el.getAttribute('content')||'').trim():null;
    }catch(_e){return null;}
  }

  _myBuildId=_readMetaBuildId(document);

  function _anyModalOpen(){
    try{
      return !!document.querySelector('.mo.show, .mo[style*="display: flex"], .mo[style*="display:flex"]');
    }catch(_e){return false;}
  }

  function _doCleanReload(){
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
    // Busca sempre /index.html diretamente (não location.pathname) — as
    // rotas bonitas (/agenda, /leads etc., ver navegação por URL) não
    // têm regra própria em _headers, só o fallback de SPA do
    // Cloudflare Pages reescreve pra servir index.html; não dá pra
    // garantir que a REGRA de cache de /index.html (no-store) se aplica
    // igual quando o caminho pedido é outro. /index.html e /app.html
    // têm a regra explícita — e como os dois são sempre publicados com
    // o MESMO build-id a cada deploy (disciplina documentada no topo
    // deste arquivo), buscar qualquer um dos dois responde certo.
    fetch('/index.html',{cache:'no-store',credentials:'same-origin'}).then(function(res){
      return res.text();
    }).then(function(html){
      var doc=(new DOMParser()).parseFromString(html,'text/html');
      var serverBuildId=_readMetaBuildId(doc);
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
