/* =====================================================================
 * js/lf-login-video.js
 * -----------------------------------------------------------------------
 * Vídeo opcional no fundo da tela de login (pedido explícito,
 * 2026-10-06) — pra você trocar sozinho, sem precisar pedir ajuste
 * toda vez. Funciona por detecção automática: se existir um arquivo de
 * vídeo com o nome certo em assets/login/, ele é usado; se não
 * existir, a tela continua EXATAMENTE como está hoje (foto + vapor
 * animado em CSS) — nada quebra, nada precisa ser configurado.
 *
 * [FIX 20261010] Antes, a detecção fazia uma sondagem HTTP (HEAD)
 * DIRETO no arquivo .mp4 — isso gerava um 404 visível no console
 * sempre que nenhum vídeo tinha sido adicionado ainda (o caso mais
 * comum). Funcionalmente inofensivo (a foto aparecia normal), mas
 * poluía o console com um erro que parecia mais grave do que era.
 * Corrigido: agora checa primeiro um manifesto leve
 * (assets/login/manifest.json), que SEMPRE existe — só tenta buscar o
 * .mp4 de verdade se o manifesto confirmar que ele foi adicionado.
 * scripts/trocar-fundo-login.mjs atualiza esse manifesto sozinho ao
 * adicionar/remover um vídeo — não precisa editar esse arquivo na mão.
 *
 * COMO TROCAR — ver o guia completo em assets/login/README.md.
 * Resumo rápido: coloque um arquivo chamado exatamente
 *   assets/login/login-video-desktop.mp4  (PC — paisagem)
 *   assets/login/login-video-mobile.mp4   (celular E Capacitor — retrato)
 * Sem precisar mexer em nenhum código — na próxima vez que a tela de
 * login carregar, o vídeo aparece sozinho. Pra voltar a usar só a
 * foto, basta apagar o(s) arquivo(s) de vídeo — a foto continua lá,
 * intacta, como reserva.
 *
 * Por que só detecta e não obriga: assim você decide se quer foto ou
 * vídeo em cada formato, independente um do outro (pode ter vídeo só
 * no PC e foto no celular, por exemplo — cada um é checado por conta
 * própria).
 * =====================================================================*/
(function(global){
  'use strict';
  if(global.__LF_LOGIN_VIDEO_INSTALLED__)return;
  global.__LF_LOGIN_VIDEO_INSTALLED__=true;

  function _insertVideo(frame, path){
    try{
      var video=document.createElement('video');
      video.muted=true;
      video.loop=true;
      video.playsInline=true;
      video.autoplay=true;
      video.setAttribute('muted','');
      video.setAttribute('playsinline','');
      video.setAttribute('aria-hidden','true');
      video.src=path;
      frame.insertBefore(video,frame.firstChild);
      frame.classList.add('has-video');
      var playPromise=video.play();
      if(playPromise&&typeof playPromise.catch==='function')playPromise.catch(function(){});
      // Se o vídeo falhar DEPOIS de já inserido (arquivo corrompido,
      // codec não suportado nesse navegador específico) — remove e
      // volta pra foto, que continua por baixo o tempo todo.
      video.addEventListener('error',function(){
        try{frame.classList.remove('has-video');video.remove();}catch(_e){}
      },{once:true});
    }catch(_e){}
  }

  function _init(){
    try{
      var frame=document.querySelector('.login-bgframe');
      if(!frame)return;
      // [FIX 2026-09-01] Antes usava so innerWidth<=760 — no Capacitor o
      // WebView pode reportar largura maior (escala/zoom) e ainda assim
      // estar em RETRATO, fazendo o celular carregar o video DESKTOP 16:9
      // e estica-lo na tela. Agora: retrato = mobile, cobre celular e
      // Capacitor nativo (Android/iOS) de forma confiavel.
      var isCapacitor=!!(global.Capacitor&&global.Capacitor.isNativePlatform&&global.Capacitor.isNativePlatform());
      var isPortrait=global.matchMedia&&global.matchMedia('(orientation: portrait)').matches;
      var isMobile=isCapacitor||isPortrait||window.innerWidth<=760;
      var path=isMobile
        ?'assets/login/login-video-mobile.mp4'
        :'assets/login/login-video-desktop.mp4';
      var manifestKey=isMobile?'hasVideoMobile':'hasVideoDesktop';
      // [FIX 20261010] Manifesto sempre presente — evita 404 no console
      // pra quem ainda não adicionou nenhum vídeo (o caso mais comum).
      // Se o próprio manifesto falhar por qualquer motivo (rede, cache
      // agressivo, etc.), fica quieto e mantém a foto — nunca tenta o
      // .mp4 direto sem essa confirmação prévia.
      fetch('assets/login/manifest.json',{cache:'no-store'}).then(function(res){
        return res&&res.ok?res.json():null;
      }).then(function(manifest){
        if(manifest&&manifest[manifestKey]===true)_insertVideo(frame,path);
      }).catch(function(){});
    }catch(_e){}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_init,{once:true});
  }else{
    _init();
  }
})(window);
