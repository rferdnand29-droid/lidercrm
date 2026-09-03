/**
 * lf-chat-dnd-file-v1-20260728.js
 *
 * P0-5: Drag-and-drop arquivo no painel do chat (PC + WebView Capacitor).
 *  - Overlay com ícone de upload aparece enquanto drag
 *  - Drop → roteia para _chatSendAttachment() que já existe
 *  - Apenas se nenhuma janela modal está aberta (conflict-safe)
 *
 * Carregar DEPOIS de js/chat.js.
 * Stackable (guard __LF_CHAT_DND_V1__).
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_DND_V1__) return;
  window.__LF_CHAT_DND_V1__ = true;

  function ensureOverlay(){
    if(document.getElementById('chat-dnd-overlay')) return document.getElementById('chat-dnd-overlay');
    var d = document.createElement('div');
    d.id = 'chat-dnd-overlay';
    d.style.cssText = 'position:fixed;inset:0;z-index:100030;background:rgba(15,23,42,.65);display:none;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);pointer-events:none';
    d.innerHTML = '<div style="background:var(--bg2,#1a1e26);padding:30px 40px;border-radius:18px;border:2px dashed var(--amber,#c39a2d);text-align:center;font-family:Outfit,sans-serif;color:var(--tx,#eee)">'+
      '<div style="font-size:3rem;margin-bottom:8px">📎</div>'+
      '<div style="font-size:1rem;font-weight:600;margin-bottom:4px">Solte o arquivo aqui</div>'+
      '<div style="font-size:.8rem;color:var(--mu)">Será enviado na conversa aberta</div>'+
    '</div>';
    document.body.appendChild(d);
    return d;
  }

  function hasModalOpen(){
    return !!document.querySelector('.mo.on');
  }
  function isChatOpen(){
    var p = document.getElementById('pg-chat');
    return !!(p && p.classList.contains('on'));
  }
  function getDraggedFiles(e){
    if(!e.dataTransfer) return [];
    if(e.dataTransfer.files && e.dataTransfer.files.length) return Array.from(e.dataTransfer.files);
    // iOS / alguns webviews expõem via items
    if(e.dataTransfer.items && e.dataTransfer.items.length){
      var files=[];
      for(var i=0;i<e.dataTransfer.items.length;i++){
        var it = e.dataTransfer.items[i];
        if(it.kind==='file'){
          var f = it.getAsFile && it.getAsFile();
          if(f) files.push(f);
        }
      }
      return files;
    }
    return [];
  }

  document.addEventListener('dragenter', function(e){
    if(!isChatOpen() || hasModalOpen()) return;
    if(!getDraggedFiles(e).length) return;
    ensureOverlay().style.display='flex';
    e.preventDefault();
  }, true);
  document.addEventListener('dragover', function(e){
    if(!isChatOpen() || hasModalOpen()) return;
    e.preventDefault(); // necessário para `drop`
    if(e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, true);
  document.addEventListener('dragleave', function(e){
    // sai da janela
    if(e.clientX<=0 || e.clientY<=0 || e.clientX>=window.innerWidth || e.clientY>=window.innerHeight){
      ensureOverlay().style.display='none';
    }
  }, true);
  document.addEventListener('drop', function(e){
    var ov = ensureOverlay();
    if(ov.style.display==='none') return; // não estávamos em modo drag válido
    ov.style.display='none';
    if(!isChatOpen()) return;
    if(typeof _chatCurrentConv==='undefined' || !_chatCurrentConv){
      if(typeof toast==='function') toast('Abra uma conversa para anexar');
      return;
    }
    var files = getDraggedFiles(e);
    if(!files.length) return;
    e.preventDefault();
    files.slice(0, 5).forEach(function(file){
      if(file.size > 5*1024*1024){
        if(typeof toast==='function') toast('⚠️ '+file.name+' excede 5MB');
        return;
      }
      var reader = new FileReader();
      reader.onload = function(ev){
        var mime = file.type || 'application/octet-stream';
        var kind = mime.indexOf('image/')===0 ? 'image' : (mime.indexOf('audio/')===0 ? 'audio' : 'file');
        try{
          if(typeof _chatSendAttachment==='function'){
            _chatSendAttachment(file.name, ev.target.result, {kind:kind, mimeType:mime});
            if(typeof toast==='function') toast('📎 '+file.name);
          }
        }catch(err){
          if(typeof toast==='function') toast('⚠️ Falha ao anexar '+file.name);
        }
      };
      reader.readAsDataURL(file);
    });
  }, true);
})();
