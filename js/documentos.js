/* =====================================================================
 * documentos.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// ============================================================
// SISTEMA DE ANEXOS v2 — completo
// ============================================================
var _attView='grid';

 // 'grid' ou 'list'
var _attCtxId=null;

  // id do anexo no ctx menu

/* Ícone por tipo de arquivo */
function attIcon(type,name){
  var n=(name||'').toLowerCase();
  if(type&&type.startsWith('image/'))return{ic:'🖼',cls:'img'};
  if(type&&type.startsWith('audio/'))return{ic:'🎵',cls:'audio'};
  if(type&&type.startsWith('video/'))return{ic:'🎬',cls:'video'};
  if(type==='application/pdf'||n.endsWith('.pdf'))return{ic:'📄',cls:'pdf'};
  if(n.endsWith('.doc')||n.endsWith('.docx'))return{ic:'📝',cls:'doc'};
  if(n.endsWith('.xls')||n.endsWith('.xlsx'))return{ic:'📊',cls:'xls'};
  if(n.endsWith('.csv'))return{ic:'📋',cls:'csv'};
  if(n.endsWith('.txt'))return{ic:'📃',cls:'txt'};
  return{ic:'📁',cls:''};
}

/* Formata bytes */
function fmtBytes(b){
  if(!b)return'';
  if(b<1024)return b+'B';
  if(b<1024*1024)return(b/1024).toFixed(1)+'KB';
  return(b/(1024*1024)).toFixed(1)+'MB';
}

/* Troca aba no modal det */
function switchDetTab(tab,btn){
  document.querySelectorAll('#mo-kb-det .det-tab').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('#mo-kb-det .det-tab-pane').forEach(function(p){p.classList.remove('on');});
  if(btn)btn.classList.add('on');
  var pane=document.getElementById('det-pane-'+tab);if(pane)pane.classList.add('on');
  if(tab==='att')reRenderAtt();
}

/* Histórico do card (Tarefa: "tudo que acontece de movimentos desse lead/negócio fica
   registrado"): criação, mudanças de etapa, conversão Lead<->Negócio e troca de
   responsável — mais recente primeiro. */
function renderDetHistorico(c){
  var el=document.getElementById('det-hist-list');if(!el)return;
  // Sempre relê o card do storage usando o _kbDetId/_kbDetBoard atuais — evita usar um
  // objeto "c" que ficou desatualizado caso o modal tenha sido reaberto com outro card.
  var board=_kbDetBoard,id=_kbDetId;
  if(board&&id){
    var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);
    var fresh=arr.find(function(x){return x.id===id;});
    if(fresh)c=fresh;
  }
  var h=(c&&c.historico)||[];
  if(!h.length){el.innerHTML='<div class="act-empty">Nenhuma movimentação registrada ainda.</div>';return;}
  el.innerHTML=h.map(function(ev){
    var dt=ev.ts?new Date(ev.ts).toLocaleString('pt-BR'):'';
    return '<div class="hist-item"><div class="hist-txt">'+eH(ev.texto)+'</div><div class="hist-meta">'+eH(ev.by||'')+(dt?' · '+dt:'')+'</div></div>';
  }).join('');
}

/* Troca visualização grade/lista */
function setAttView(v,btn){
  _attView=v;
  document.querySelectorAll('.att-vbtn').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');
  reRenderAtt();
}

/* Atualiza badge de anexos na aba */
function updateAttBadge(count){
  var badge=document.getElementById('det-att-badge');
  if(!badge)return;
  if(count>0){badge.style.display='';badge.textContent=count;}
  else{badge.style.display='none';}
}

/* Renderiza a aba de anexos completa */
function renderDetAttachments(c,board,uid){
  updateAttBadge((c.attachments||[]).length);
  reRenderAtt();
}

/* Re-renderiza o container de anexos (chamado ao abrir aba ou após mudanças) */
function reRenderAtt(){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));
  var arr=getKBFor(board,uid);
  var c=arr.find(function(x){return x.id===id;});
  if(!c)return;
  var atts=c.attachments||[];
  var cont=document.getElementById('att-container');if(!cont)return;
  var lbl=document.getElementById('att-count-lbl');
  if(lbl)lbl.textContent=atts.length+' anexo'+(atts.length!==1?'s':'');
  updateAttBadge(atts.length);
  if(!atts.length){
    cont.innerHTML='<div class="att-empty"><div class="att-empty-ic">📂</div><div class="att-empty-lbl">Nenhum anexo ainda</div><div class="att-empty-sub">Arraste arquivos ou clique para adicionar</div></div>';
    return;
  }
  var canDel=hasAdminAccess();
  var pinned=atts.filter(function(a){return a.pinned;});
  var others=atts.filter(function(a){return !a.pinned;});
  var html='';
  // Destaque: anexos fixados sempre aparecem em grade no topo, independente do modo de visualizacao escolhido.
  if(pinned.length)html+='<div class="att-pin-section"><div class="att-pin-lbl">📌 Fixados ('+pinned.length+')</div><div class="att-grid">'+pinned.map(function(a){return _attCardHTML(a,true);}).join('')+'</div></div>';
  if(_attView==='grid'){
    if(others.length)html+='<div class="att-grid">'+others.map(function(a){return _attCardHTML(a,false);}).join('')+'</div>';
  } else {
    if(others.length)html+='<div class="att-list-mode">'+others.map(function(a){return _attRowHTML(a,canDel);}).join('')+'</div>';
  }
  cont.innerHTML=html;
}

/* Card de anexo (modo grade). isPinned controla o estilo de destaque e o icone de fixado. */
function _attCardHTML(a,isPinned){
  var ico=attIcon(a.type,a.name);
  var isImg=a.type&&a.type.startsWith('image/');
  var mediaSrc=_attMediaSrc(a);
  var thumb=isImg&&mediaSrc?'<img src="'+_htmlAttr(mediaSrc)+'" alt="'+eH(a.name)+'">':'<span class="att-card-ic '+ico.cls+'">'+ico.ic+'</span>';
  var dt=a.uploadedAt?new Date(a.uploadedAt).toLocaleDateString('pt-BR'):'';
  var attIdJs=_jsSq(a.id);
  return '<div class="att-card'+(isPinned?' pinned':'')+'" onclick="viewAttachment(\''+attIdJs+'\')" oncontextmenu="attCtxOpen(event,\''+attIdJs+'\')" tabindex="0" role="button">'
    +'<div class="att-card-thumb">'+(isPinned?'<span class="att-pin-flag">📌</span>':'')+thumb
    +'<button class="att-card-pinbtn" onclick="event.stopPropagation();togglePinAttachment(\''+attIdJs+'\')" title="'+(isPinned?'Desafixar':'Fixar')+'">📌</button>'
    +'<button class="att-card-menu" onclick="event.stopPropagation();attCtxOpen(event,\''+attIdJs+'\')" title="Opções">⋮</button></div>'
    +'<div class="att-card-body"><div class="att-card-name" title="'+eH(a.name)+'">'+eH(a.name)+'</div>'
    +'<div class="att-card-meta">'+fmtBytes(a.size)+(dt?' · '+dt:'')+'</div></div></div>';
}

/* Linha de anexo (modo lista). */
function _attRowHTML(a,canDel){
  var ico=attIcon(a.type,a.name);
  var dt=a.uploadedAt?new Date(a.uploadedAt).toLocaleString('pt-BR'):'';
  var by=a.uploadedBy?eH(a.uploadedBy):'';
  var attIdJs=_jsSq(a.id);
  return '<div class="att-row'+(a.pinned?' pinned':'')+'" onclick="viewAttachment(\''+attIdJs+'\')" tabindex="0" role="button">'
    +'<div class="att-row-ic">'+ico.ic+'</div>'
    +'<div class="att-row-body"><div class="att-row-name">'+eH(a.name)+'</div>'
    +'<div class="att-row-meta">'+fmtBytes(a.size)+(by?' · '+by:'')+(dt?' · '+dt:'')+'</div></div>'
    +'<div class="att-row-actions" onclick="event.stopPropagation()">'
    +'<button class="att-row-btn" onclick="togglePinAttachment(\''+attIdJs+'\')" title="'+(a.pinned?'Desafixar':'Fixar')+'">📌</button>'
    +'<button class="att-row-btn" onclick="viewAttachment(\''+attIdJs+'\')" title="Visualizar">👁</button>'
    +'<button class="att-row-btn" onclick="downloadAttachment(\''+attIdJs+'\')" title="Baixar">⬇</button>'
    +'<button class="att-row-btn" onclick="renameAttachment(\''+attIdJs+'\')" title="Renomear">✏️</button>'
    +(canDel?'<button class="att-row-btn danger" onclick="delAttachment(\''+attIdJs+'\')" title="Excluir">🗑</button>':'')
    +'</div></div>';
}

/* Fixa/desafixa um anexo no topo do registro (Tarefa 5). Qualquer consultor pode fixar/desafixar. */
function togglePinAttachment(attId){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  if(!c.attachments)c.attachments=[];
  var a=c.attachments.find(function(x){return x.id===attId;});if(!a)return;
  a.pinned=!a.pinned;a.pinnedAt=a.pinned?new Date().toISOString():null;
  saveKBFor(board,uid,arr);
  logAttEvent(a.pinned?'pin':'unpin',c.name,a.name,board);
  reRenderAtt();toast(a.pinned?'📌 Anexo fixado':'Anexo desafixado');
}

/* Upload de arquivos (botão e drop) */
function handleAttFiles(inp){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  if(!c.attachments)c.attachments=[];
  var files=Array.from(inp.files);if(!files.length)return;
  processAttFiles(files,c,arr,board,uid);
  inp.value='';
}

var ATT_ALLOWED_EXT=['pdf','doc','docx','xls','xlsx','csv','txt','jpg','jpeg','png','webp','mp3','wav','m4a','ogg','mp4','mov','webm'];

/* Valida tipo de arquivo. O atributo accept= do input so vale para quem usa o seletor de
   arquivos — quem arrasta e solta (drag&drop) passava direto sem checagem, por isso a
   validacao precisa acontecer aqui tambem (corrigido). */
function _attTypeAllowed(f){
  if(f.type&&f.type.indexOf('image/')===0)return true;
  if(f.type&&f.type.indexOf('audio/')===0)return true;
  if(f.type&&f.type.indexOf('video/')===0)return true;
  var ext=(f.name||'').split('.').pop().toLowerCase();
  return ATT_ALLOWED_EXT.indexOf(ext)>=0;
}

/* Upload de um arquivo bruto para o Firebase Storage (sem limite prático de
   tamanho — ao contrário de guardar base64 dentro do documento do Firestore,
   que tem teto de ~1MB). Retorna {url, path} pelo callback. */
function _uploadFileToStorage(file,path,cb){
  if(!fbStorage){cb('sem-storage');return;}
  try{
    var ref=fbStorage.ref().child(path);
    ref.put(file).then(function(snap){return snap.ref.getDownloadURL();})
      .then(function(url){cb(null,{url:url,path:path});})
      .catch(function(err){cb(err);});
  }catch(e){cb(e);}
}

function _deleteFromStorage(path){
  if(!fbStorage||!path)return;
  fbStorage.ref().child(path).delete().catch(function(){});
}

/* Nome de arquivo seguro para usar como parte do caminho no Storage. */
function _safeStorageName(name){
  return (name||'arquivo').replace(/[^a-zA-Z0-9._-]/g,'_');
}

/* Fonte utilizável em src="" de <img>/<audio>/<video>: tanto a URL do Firebase
   Storage (https) quanto a data URL local (base64) funcionam direto. */
function _attMediaSrc(a){
  var raw=String((a&&(a.url||a.data))||'').trim();
  if(!raw)return '';
  if(/^blob:/i.test(raw))return raw;
  if(/^data:(image|audio|video|application\/pdf)(;|,)/i.test(raw))return raw;
  if(/^https?:\/\//i.test(raw))return raw;
  if(raw.charAt(0)==='/')return raw;
  return '';
}

/* Resolve um href pronto para forçar o download com o nome certo do arquivo.
   Para anexos locais (base64) é imediato; para anexos no Firebase Storage,
   busca o arquivo e converte pra blob: (evita problemas de CORS/nome ao usar
   a URL remota direto no atributo download). */
function _attDownloadHref(a,cb){
  if(a.data){cb(a.data);return;}
  if(a.url){
    fetch(a.url).then(function(r){return r.blob();}).then(function(blob){cb(URL.createObjectURL(blob));})
      .catch(function(){cb(a.url);});
    return;
  }
  cb(null);
}

/* Preview de PDF: converte pro blob: (exigido pelo CSP, que só libera blob:
   em frame-src) — de base64 local (síncrono) ou buscando a URL do Storage
   (assíncrono). ab = elemento onde o iframe entra; downloadFn = nome da função
   de download a chamar no botão de fallback. */
function _attPreviewPdf(a,ab,attId,downloadFn){
  if(a.data){
    var bUrl=_dataUrlToBlobUrl(a.data),attIdJs=_jsSq(attId);
    ab.innerHTML=bUrl?'<iframe src="'+bUrl+'" style="width:100%;height:65vh;border:none;border-radius:8px"></iframe>':'<div style="padding:30px;color:var(--mu);font-size:.82rem">Não foi possível pré-visualizar este PDF. <button class="bp" style="margin-top:12px" onclick="'+downloadFn+'(\''+attIdJs+'\')">⬇ Baixar arquivo</button></div>';
    _attViewBlobUrl=bUrl;
    return;
  }
  if(a.url){
    ab.innerHTML='<div style="padding:40px;text-align:center;color:var(--mu);font-size:.8rem"><div class="spinner-sm" style="margin:0 auto 10px"></div>Carregando pré-visualização...</div>';
    fetch(a.url).then(function(r){return r.blob();}).then(function(blob){
      var bUrl=URL.createObjectURL(blob);
      _attViewBlobUrl=bUrl;
      ab.innerHTML='<iframe src="'+bUrl+'" style="width:100%;height:65vh;border:none;border-radius:8px"></iframe>';
    }).catch(function(){
      var attIdJs=_jsSq(attId);
      ab.innerHTML='<div style="padding:30px;color:var(--mu);font-size:.82rem">Não foi possível pré-visualizar este PDF. <button class="bp" style="margin-top:12px" onclick="'+downloadFn+'(\''+attIdJs+'\')">⬇ Baixar arquivo</button></div>';
    });
    return;
  }
  ab.innerHTML='<div style="padding:30px;color:var(--mu);font-size:.82rem">Não foi possível pré-visualizar este PDF.</div>';
}

function processAttFiles(files,c,arr,board,uid){
  // Limite de tamanho removido a pedido do usuário. No modo Firebase os arquivos
  // vão para o Firebase Storage (sem teto de ~1MB, que só existe para dados
  // guardados direto dentro de um documento do Firestore); no modo local
  // continuam salvos como base64 no navegador.
  var valid=files.filter(function(f){
    if(!_attTypeAllowed(f)){toast('❌ '+f.name+': tipo de arquivo nao permitido');return false;}
    return true;
  });
  if(!valid.length)return;
  var prog=document.getElementById('att-progress');
  var progLbl=document.getElementById('att-progress-lbl');
  var progFill=document.getElementById('att-progress-fill');
  if(prog)prog.classList.add('show');
  var done=0,ok=0,total=valid.length;
  function finishOne(){
    done++;
    if(progFill)progFill.style.width=Math.round(done/total*100)+'%';
    if(progLbl)progLbl.textContent='Processando '+done+'/'+total+'...';
    if(done===total){
      var savedOk=saveKBFor(board,uid,arr);
      if(prog)prog.classList.remove('show');
      if(progFill)progFill.style.width='0%';
      if(ok)logAttEvent('upload',c.name,ok+' arquivo(s)',board);
      reRenderAtt();
      // Mesma correcao: so afirma sucesso se o localStorage realmente gravou.
      if(ok&&savedOk)toast('✅ '+ok+' arquivo(s) anexado(s)!');
      else if(ok&&!savedOk)toast('⚠️ Anexo pode não ter sido salvo — armazenamento local cheio.',4000);
    }
  }
  valid.forEach(function(file){
    var attId='att_'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
    if(DB_MODE==='firebase'&&fbStorage){
      var path='attachments/'+board+'/'+uid+'/'+c.id+'/'+attId+'_'+_safeStorageName(file.name);
      _uploadFileToStorage(file,path,function(err,res){
        if(err){
          toast('❌ Falha ao enviar '+file.name+' para a nuvem.');
          finishOne();return;
        }
        c.attachments.push({
          id:attId,name:file.name,type:file.type,
          url:res.url,storagePath:res.path,
          size:file.size,
          uploadedAt:new Date().toISOString(),
          uploadedBy:S.nome,uploadedById:S.userId
        });
        ok++;finishOne();
      });
    } else {
      var reader=new FileReader();
      reader.onload=function(e){
        c.attachments.push({
          id:attId,name:file.name,type:file.type,
          data:e.target.result,
          size:file.size,
          uploadedAt:new Date().toISOString(),
          uploadedBy:S.nome,uploadedById:S.userId
        });
        ok++;finishOne();
      };
      reader.onerror=function(){toast('❌ Erro ao ler o arquivo: '+file.name);finishOne();};
      reader.readAsDataURL(file);
    }
  });
}

/* Drag and Drop */
function attDragOver(e){e.preventDefault();e.stopPropagation();var dz=document.getElementById('att-dropzone');if(dz)dz.classList.add('drag-over');}

function attDragLeave(e){var dz=document.getElementById('att-dropzone');if(dz)dz.classList.remove('drag-over');}

// Dropzones sao <div onclick>, entao sem isso ficavam invisiveis pra teclado/leitor de tela
// (Enter/Espaco nao faziam nada). role="button"+tabindex ja foram adicionados no HTML;
// isso aqui cobre o Enter/Espaco dos dois dropzones (anexos e documentos ADM).
function dzKeyOpen(e,inputId){if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){e.preventDefault();var inp=document.getElementById(inputId);if(inp)inp.click();}}

function attDrop(e){
  e.preventDefault();e.stopPropagation();
  var dz=document.getElementById('att-dropzone');if(dz)dz.classList.remove('drag-over');
  var files=Array.from(e.dataTransfer.files);if(!files.length)return;
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  if(!c.attachments)c.attachments=[];
  processAttFiles(files,c,arr,board,uid);
  // Muda automaticamente para a aba de anexos se não estiver nela
  var pane=document.getElementById('det-pane-att');
  if(pane&&!pane.classList.contains('on')){
    switchDetTab('att',document.getElementById('det-tab-att'));
  }
}

/* Visualizar anexo */
var _attViewId=null,_attViewSource='card';

/* Bug corrigido: o preview de PDF usava <iframe src="data:application/pdf;base64,...">,
   mas o CSP do próprio arquivo declara "frame-src blob:" (sem "data:") — como frame-src
   está explicitamente definido, ele NÃO herda o "data:" do default-src, então o navegador
   bloqueava silenciosamente o carregamento do iframe (preview de PDF sempre em branco,
   sem nenhum erro visível pro usuário, só no console). Convertendo a data URL pra um
   blob: URL (permitido pelo CSP) o preview volta a funcionar. _attViewBlobUrl guarda a
   última URL criada pra poder revogar (URL.revokeObjectURL) e não vazar memória. */
var _attViewBlobUrl=null;

function _dataUrlToBlobUrl(dataUrl){
  try{
    var parts=dataUrl.split(',');
    var mimeMatch=parts[0].match(/:(.*?);/);
    var mime=mimeMatch?mimeMatch[1]:'application/pdf';
    var bstr=atob(parts[1]);
    var n=bstr.length,u8=new Uint8Array(n);
    while(n--)u8[n]=bstr.charCodeAt(n);
    return URL.createObjectURL(new Blob([u8],{type:mime}));
  }catch(e){return null;}
}

function _releaseAttViewBlobUrl(){
  if(_attViewBlobUrl){try{URL.revokeObjectURL(_attViewBlobUrl);}catch(e){}_attViewBlobUrl=null;}
}

function viewAttachment(attId){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  var a=(c.attachments||[]).find(function(x){return x.id===attId;});if(!a)return;
  _attViewId=attId;_attViewSource='card';
  var an=document.getElementById('att-view-name');if(an)an.textContent=a.name;
  var am=document.getElementById('att-view-meta');
  if(am){var by=a.uploadedBy?'Anexado por '+a.uploadedBy:'';var dt=a.uploadedAt?' em '+new Date(a.uploadedAt).toLocaleString('pt-BR'):'';var sz=a.size?' · '+fmtBytes(a.size):'';am.textContent=by+dt+sz;}
  var ab=document.getElementById('att-view-body');
  var isImg=a.type&&a.type.startsWith('image/');
  var isPdf=a.type==='application/pdf'||a.name.toLowerCase().endsWith('.pdf');
  var isAudio=a.type&&a.type.startsWith('audio/');
  var isVideo=a.type&&a.type.startsWith('video/');
  if(ab){
    _releaseAttViewBlobUrl();
    var mediaSrc=_attMediaSrc(a),attIdJs=_jsSq(attId);
    if(isImg&&mediaSrc)ab.innerHTML='<img src="'+_htmlAttr(mediaSrc)+'" alt="Anexo enviado" style="max-width:100%;border-radius:8px">';
    else if(isPdf){
      _attPreviewPdf(a,ab,attId,'downloadAttachment');
    }
    else if(isAudio&&mediaSrc)ab.innerHTML='<audio controls style="width:100%;margin-top:12px" src="'+_htmlAttr(mediaSrc)+'"></audio>';
    else if(isVideo&&mediaSrc)ab.innerHTML='<video controls playsinline style="max-width:100%;border-radius:8px;margin-top:8px" src="'+_htmlAttr(mediaSrc)+'"></video>';
    else ab.innerHTML='<div style="padding:30px;color:var(--mu);font-size:.82rem"><div style="font-size:2rem;margin-bottom:8px">📁</div><div>Pré-visualização não disponível para este formato.</div><button class="bp" style="margin-top:12px" onclick="downloadAttachment(\''+attIdJs+'\')">⬇ Baixar arquivo</button></div>';
  }
  openM('mo-att-view');
}

/* Download */
function downloadAttachment(attId){
  if(!attId)return;
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  var a=(c.attachments||[]).find(function(x){return x.id===attId;});if(!a)return;
  _attDownloadHref(a,function(href){
    if(!href){toast('❌ Não foi possível baixar este arquivo.');return;}
    var link=document.createElement('a');link.href=href;link.download=a.name;
    document.body.appendChild(link);link.click();document.body.removeChild(link);
    toast('⬇ Baixando: '+a.name);
  });
}

var _renameAttId=null;

function renameAttachment(attId){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  var a=(c.attachments||[]).find(function(x){return x.id===attId;});if(!a)return;
  _renameAttId=attId;
  _renameDocId=null;
  var inp=document.getElementById('rename-doc-inp');
  if(inp){inp.value=a.name;setTimeout(function(){inp.focus();inp.select();},200);}
  // Reutiliza o modal de rename de documento (mesmo campo), mas fixa explicitamente o modo
  // para evitar vazamento de estado entre "renomear anexo" e "renomear documento".
  _setRenameDocModalMode('attachment');
  openM('mo-rename-doc');
}

function _confirmRenameAttachment(){
  if(!_renameAttId)return;
  var inp=document.getElementById('rename-doc-inp');
  var novo=(inp?inp.value:'').trim();
  if(!novo){toast('Digite um nome para o arquivo');return;}
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id){closeM('mo-rename-doc');return;}
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c){closeM('mo-rename-doc');return;}
  var a=(c.attachments||[]).find(function(x){return x.id===_renameAttId;});
  if(!a){_renameAttId=null;closeM('mo-rename-doc');return;}
  if(novo===a.name){closeM('mo-rename-doc');_renameAttId=null;return;}
  var nomeAntigo=a.name;
  a.name=novo;a.renamedAt=new Date().toISOString();a.renamedBy=S.nome;
  saveKBFor(board,uid,arr);
  logAttEvent('rename',c.name,nomeAntigo+' → '+novo,board);
  reRenderAtt();closeM('mo-rename-doc');_renameAttId=null;_setRenameDocModalMode('document');toast('✏️ Renomeado!');
}

/* Context menu de anexo */
var _attCtxOutsideH=null;

function attCtxOpen(e,attId){
  e.preventDefault();e.stopPropagation();
  _attCtxId=attId;
  var canDel=hasAdminAccess();
  var delBtn=document.getElementById('att-ctx-del');
  if(delBtn)delBtn.style.display=canDel?'':'none';
  var pinBtn=document.getElementById('att-ctx-pin');
  if(pinBtn){
    var board=_kbDetBoard,id=_kbDetId;var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);
    var c=arr.find(function(x){return x.id===id;});var a=c?(c.attachments||[]).find(function(x){return x.id===attId;}):null;
    pinBtn.textContent=(a&&a.pinned)?'📌 Desafixar':'📌 Fixar';
  }
  var ctx=document.getElementById('att-ctx');if(!ctx)return;
  ctx.classList.add('open');
  var x=Math.min(e.clientX,window.innerWidth-170),y=Math.min(e.clientY,window.innerHeight-200);
  ctx.style.left=x+'px';ctx.style.top=y+'px';ctx.style.position='fixed';
  if(_attCtxOutsideH)document.removeEventListener('click',_attCtxOutsideH);
  setTimeout(function(){
    _attCtxOutsideH=function h(){ctx.classList.remove('open');document.removeEventListener('click',_attCtxOutsideH);_attCtxOutsideH=null;};
    document.addEventListener('click',_attCtxOutsideH);
  },10);
}

function attCtxView(){if(_attCtxId)viewAttachment(_attCtxId);_attCtxId=null;}

function attCtxDownload(){if(_attCtxId)downloadAttachment(_attCtxId);_attCtxId=null;}

function attCtxRename(){if(_attCtxId)renameAttachment(_attCtxId);_attCtxId=null;}

function attCtxTogglePin(){if(_attCtxId)togglePinAttachment(_attCtxId);_attCtxId=null;}

function attCtxDelete(){if(_attCtxId)delAttachment(_attCtxId);_attCtxId=null;}

// ============================================================
// ADM DOCUMENTOS — repositório compartilhado de PDFs/imagens visível
// a todos os Gerentes e ADM. Reaproveita o mesmo padrão visual dos
// Anexos de card (mesmas classes .att-card/.att-row/.att-grid etc),
// mas guarda os arquivos numa chave própria (lf13_adm_docs), já que
// não pertencem a nenhum lead/negócio específico.
// ============================================================
var ADM_DOCS_KEY='lf13_adm_docs';

var _admDocsView='grid',_admDocCtxId=null;

function getAdmDocs(){return sg(ADM_DOCS_KEY)||[];}

function saveAdmDocs(list){var localOk=ss(ADM_DOCS_KEY,list);if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('adm_docs').set({list:list,ts:Date.now()}).then(syncOk).catch(syncErr);}return localOk;}

/* Local-first: desenha na hora com o cache local e só then atualiza em segundo plano. */
function loadAdmDocs(cb){
  cb(getAdmDocs());
  if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('adm_docs').get().then(function(d){
      var list=(d.exists&&d.data().list)?d.data().list:getAdmDocs();
      ss(ADM_DOCS_KEY,list);cb(list);
    }).catch(function(){});
  }
}

/* Página de Documentos para TODOS os usuários (somente leitura). Reutiliza
   getAdmDocs() e as funções de render existentes com canManage=false.
   A seção "Fixados" aparece sempre expandida no topo, conforme pedido. */
function renderUserDocsPage(){
  loadAdmDocs(function(){_renderUserDocsPageInner();});
}

function _renderUserDocsPageInner(){
  var docs=getAdmDocs();
  var cont=document.getElementById('user-docs-container');if(!cont)return;
  if(!docs.length){
    cont.innerHTML='<div class="att-empty"><div class="att-empty-ic">📂</div><div class="att-empty-lbl">Nenhum documento disponível ainda</div><div class="att-empty-sub">O administrador ainda não adicionou documentos.</div></div>';
    return;
  }
  var pinned=docs.filter(function(a){return a.pinned;});
  var others=docs.filter(function(a){return !a.pinned;});
  var html='';
  if(pinned.length){
    html+='<div class="att-pin-section" style="margin-bottom:18px"><div class="att-pin-lbl" style="font-size:.85rem;font-weight:600;color:var(--al);margin-bottom:8px">📌 Fixados pelo Admin ('+pinned.length+')</div>'
      +'<div class="att-grid">'+pinned.map(function(a){return _admDocCardHTML(a,true,false);}).join('')+'</div></div>';
  }
  if(others.length){
    html+='<div class="att-pin-lbl" style="font-size:.8rem;color:var(--mu);margin-bottom:8px">Todos os documentos</div>';
    html+='<div class="att-grid">'+others.map(function(a){return _admDocCardHTML(a,false,false);}).join('')+'</div>';
  }
  cont.innerHTML=html;
}

function setAdmDocsView(v,btn){
  _admDocsView=v;
  document.querySelectorAll('.att-vbtn').forEach(function(b){if(b.id==='adm-docs-vbtn-grid'||b.id==='adm-docs-vbtn-list')b.classList.remove('on');});
  if(btn)btn.classList.add('on');
  reRenderAdmDocs();
}

function renderAdmDocs(){
  loadAdmDocs(function(){reRenderAdmDocs();});
}

function reRenderAdmDocs(){
  var docs=getAdmDocs();
  var cont=document.getElementById('adm-docs-container');if(!cont)return;
  var lbl=document.getElementById('adm-docs-count-lbl');
  if(lbl)lbl.textContent=docs.length+' documento'+(docs.length!==1?'s':'');
  if(!docs.length){
    cont.innerHTML='<div class="att-empty"><div class="att-empty-ic">📂</div><div class="att-empty-lbl">Nenhum documento ainda</div><div class="att-empty-sub">Arraste arquivos ou clique para adicionar</div></div>';
    // Atualiza também a página de usuários se estiver aberta
    var ucont=document.getElementById('user-docs-container');if(ucont&&document.getElementById('pg-docs').classList.contains('on'))_renderUserDocsPageInner();
    return;
  }
  var canManage=hasAdminAccess(); // somente ADM ou Gerente podem renomear/excluir/pin
  var pinned=docs.filter(function(a){return a.pinned;});
  var others=docs.filter(function(a){return !a.pinned;});
  var html='';
  if(pinned.length)html+='<div class="att-pin-section"><div class="att-pin-lbl">📌 Fixados ('+pinned.length+')</div><div class="att-grid">'+pinned.map(function(a){return _admDocCardHTML(a,true,canManage);}).join('')+'</div></div>';
  if(_admDocsView==='grid'){
    if(others.length)html+='<div class="att-grid">'+others.map(function(a){return _admDocCardHTML(a,false,canManage);}).join('')+'</div>';
  }else{
    if(others.length)html+='<div class="att-list-mode">'+others.map(function(a){return _admDocRowHTML(a,canManage);}).join('')+'</div>';
  }
  cont.innerHTML=html;
  // Atualiza também a página de usuários se estiver aberta
  var pgDocs=document.getElementById('pg-docs');
  if(pgDocs&&pgDocs.classList.contains('on'))_renderUserDocsPageInner();
}

function _admDocCardHTML(a,isPinned,canManage){
  var ico=attIcon(a.type,a.name);
  var isImg=a.type&&a.type.startsWith('image/');
  var mediaSrc=_attMediaSrc(a);
  var thumb=isImg&&mediaSrc?'<img src="'+_htmlAttr(mediaSrc)+'" alt="'+eH(a.name)+'">':'<span class="att-card-ic '+ico.cls+'">'+ico.ic+'</span>';
  var dt=a.uploadedAt?new Date(a.uploadedAt).toLocaleDateString('pt-BR'):'';
  var docIdJs=_jsSq(a.id);
  return '<div class="att-card'+(isPinned?' pinned':'')+'" onclick="viewAdmDoc(\''+docIdJs+'\')" oncontextmenu="admDocCtxOpen(event,\''+docIdJs+'\')" tabindex="0" role="button">'
    +'<div class="att-card-thumb">'+(isPinned?'<span class="att-pin-flag">📌</span>':'')+thumb
    +(canManage?'<button class="att-card-pinbtn" onclick="event.stopPropagation();toggleAdmDocPin(\''+docIdJs+'\')" title="'+(isPinned?'Desafixar':'Fixar')+'">📌</button>':'')
    +'<button class="att-card-menu" onclick="event.stopPropagation();admDocCtxOpen(event,\''+docIdJs+'\')" title="Opções">⋮</button></div>'
    +'<div class="att-card-body"><div class="att-card-name" title="'+eH(a.name)+'">'+eH(a.name)+'</div>'
    +'<div class="att-card-meta">'+fmtBytes(a.size)+(dt?' · '+dt:'')+'</div></div></div>';
}

function _admDocRowHTML(a,canManage){
  var ico=attIcon(a.type,a.name);
  var dt=a.uploadedAt?new Date(a.uploadedAt).toLocaleString('pt-BR'):'';
  var by=a.uploadedBy?eH(a.uploadedBy):'';
  var docIdJs=_jsSq(a.id);
  return '<div class="att-row'+(a.pinned?' pinned':'')+'" onclick="viewAdmDoc(\''+docIdJs+'\')" tabindex="0" role="button">'
    +'<div class="att-row-ic">'+ico.ic+'</div>'
    +'<div class="att-row-body"><div class="att-row-name">'+eH(a.name)+'</div>'
    +'<div class="att-row-meta">'+fmtBytes(a.size)+(by?' · '+by:'')+(dt?' · '+dt:'')+'</div></div>'
    +'<div class="att-row-actions" onclick="event.stopPropagation()">'
    +(canManage?'<button class="att-row-btn" onclick="toggleAdmDocPin(\''+docIdJs+'\')" title="'+(a.pinned?'Desafixar':'Fixar')+'">📌</button>':'')
    +'<button class="att-row-btn" onclick="viewAdmDoc(\''+docIdJs+'\')" title="Visualizar">👁</button>'
    +'<button class="att-row-btn" onclick="downloadAdmDoc(\''+docIdJs+'\')" title="Baixar">⬇</button>'
    +(canManage?'<button class="att-row-btn" onclick="renameAdmDoc(\''+docIdJs+'\')" title="Renomear">✏️</button>':'')
    +(canManage?'<button class="att-row-btn danger" onclick="deleteAdmDoc(\''+docIdJs+'\')" title="Excluir">🗑</button>':'')
    +'</div></div>';
}

function toggleAdmDocPin(docId){
  if(!hasAdminAccess()){toast('Sem permissão');return;}
  var docs=getAdmDocs();var a=docs.find(function(x){return x.id===docId;});if(!a)return;
  a.pinned=!a.pinned;saveAdmDocs(docs);reRenderAdmDocs();toast(a.pinned?'📌 Documento fixado':'Documento desafixado');
}

function handleAdmDocFiles(inp){
  var files=Array.from(inp.files);if(!files.length)return;
  processAdmDocFiles(files);
  inp.value='';
}

var ADM_DOC_ALLOWED_EXT=['pdf','doc','docx','xls','xlsx','csv','txt','jpg','jpeg','png','webp','mp3','wav','m4a','ogg','mp4','mov','webm'];

function _admDocTypeAllowed(f){
  if(f.type&&f.type.indexOf('image/')===0)return true;
  if(f.type&&f.type.indexOf('audio/')===0)return true;
  if(f.type&&f.type.indexOf('video/')===0)return true;
  var ext=(f.name||'').split('.').pop().toLowerCase();
  return ADM_DOC_ALLOWED_EXT.indexOf(ext)>=0;
}

function processAdmDocFiles(files){
  // Limite de tamanho removido a pedido do usuário. No modo Firebase os arquivos
  // vão para o Firebase Storage (sem teto de ~1MB, que só existe para dados
  // guardados direto dentro de um documento do Firestore); no modo local
  // continuam salvos como base64 no navegador.
  var valid=files.filter(function(f){
    if(!_admDocTypeAllowed(f)){toast('❌ '+f.name+': tipo de arquivo não permitido');return false;}
    return true;
  });
  if(!valid.length)return;
  var docs=getAdmDocs();
  var prog=document.getElementById('adm-docs-progress');
  var progLbl=document.getElementById('adm-docs-progress-lbl');
  var progFill=document.getElementById('adm-docs-progress-fill');
  if(prog)prog.classList.add('show');
  var done=0,ok=0,total=valid.length;
  function finishOne(){
    done++;
    if(progFill)progFill.style.width=Math.round(done/total*100)+'%';
    if(progLbl)progLbl.textContent='Processando '+done+'/'+total+'...';
    if(done===total){
      var savedOk=saveAdmDocs(docs);
      if(prog)prog.classList.remove('show');
      if(progFill)progFill.style.width='0%';
      reRenderAdmDocs();
      // Tarefa: nao mostrar "sucesso" se o localStorage estourou a cota — ss() ja
      // disparou o toast de aviso; mostrar "sucesso" por cima dele mentia pro usuario.
      if(ok&&savedOk)toast('✅ '+ok+' documento(s) adicionado(s)!');
    }
  }
  valid.forEach(function(file){
    var docId='admdoc_'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
    if(DB_MODE==='firebase'&&fbStorage){
      var path='adm_docs/'+docId+'_'+_safeStorageName(file.name);
      _uploadFileToStorage(file,path,function(err,res){
        if(err){toast('❌ Falha ao enviar '+file.name+' para a nuvem.');finishOne();return;}
        docs.push({
          id:docId,name:file.name,type:file.type,
          url:res.url,storagePath:res.path,size:file.size,
          uploadedAt:new Date().toISOString(),uploadedBy:S.nome,pinned:false
        });
        ok++;finishOne();
      });
    } else {
      var reader=new FileReader();
      reader.onload=function(e){
        docs.push({
          id:docId,name:file.name,type:file.type,data:e.target.result,size:file.size,
          uploadedAt:new Date().toISOString(),uploadedBy:S.nome,pinned:false
        });
        ok++;finishOne();
      };
      reader.onerror=function(){toast('❌ Erro ao ler o arquivo: '+file.name);finishOne();};
      reader.readAsDataURL(file);
    }
  });
}

function admDocsDragOver(e){e.preventDefault();e.stopPropagation();var dz=document.getElementById('adm-docs-dropzone');if(dz)dz.classList.add('drag-over');}

function admDocsDragLeave(e){var dz=document.getElementById('adm-docs-dropzone');if(dz)dz.classList.remove('drag-over');}

function admDocsDrop(e){
  e.preventDefault();e.stopPropagation();
  var dz=document.getElementById('adm-docs-dropzone');if(dz)dz.classList.remove('drag-over');
  var files=Array.from(e.dataTransfer.files);if(!files.length)return;
  processAdmDocFiles(files);
}

function viewAdmDoc(docId){
  var docs=getAdmDocs();var a=docs.find(function(x){return x.id===docId;});if(!a)return;
  _attViewId=docId;_attViewSource='admdoc';
  var an=document.getElementById('att-view-name');if(an)an.textContent=a.name;
  var am=document.getElementById('att-view-meta');
  if(am){var by=a.uploadedBy?'Adicionado por '+a.uploadedBy:'';var dt=a.uploadedAt?' em '+new Date(a.uploadedAt).toLocaleString('pt-BR'):'';var sz=a.size?' · '+fmtBytes(a.size):'';am.textContent=by+dt+sz;}
  var ab=document.getElementById('att-view-body');
  var isImg=a.type&&a.type.startsWith('image/');
  var isPdf=a.type==='application/pdf'||a.name.toLowerCase().endsWith('.pdf');
  var isAudio=a.type&&a.type.startsWith('audio/');
  var isVideo=a.type&&a.type.startsWith('video/');
  if(ab){
    _releaseAttViewBlobUrl();
    var mediaSrc=_attMediaSrc(a),docIdJs=_jsSq(docId);
    if(isImg&&mediaSrc)ab.innerHTML='<img src="'+_htmlAttr(mediaSrc)+'" alt="Anexo enviado" style="max-width:100%;border-radius:8px">';
    else if(isPdf){
      _attPreviewPdf(a,ab,docId,'downloadAdmDoc');
    }
    else if(isAudio&&mediaSrc)ab.innerHTML='<audio controls style="width:100%;margin-top:12px" src="'+_htmlAttr(mediaSrc)+'"></audio>';
    else if(isVideo&&mediaSrc)ab.innerHTML='<video controls playsinline style="max-width:100%;border-radius:8px;margin-top:8px" src="'+_htmlAttr(mediaSrc)+'"></video>';
    else ab.innerHTML='<div style="padding:30px;color:var(--mu);font-size:.82rem"><div style="font-size:2rem;margin-bottom:8px">📁</div><div>Pré-visualização não disponível para este formato.</div><button class="bp" style="margin-top:12px" onclick="downloadAdmDoc(\''+docIdJs+'\')">⬇ Baixar arquivo</button></div>';
  }
  openM('mo-att-view');
}

function downloadAdmDoc(docId){
  if(!docId)return;
  var docs=getAdmDocs();var a=docs.find(function(x){return x.id===docId;});if(!a)return;
  _attDownloadHref(a,function(href){
    if(!href){toast('❌ Não foi possível baixar este arquivo.');return;}
    var link=document.createElement('a');link.href=href;link.download=a.name;
    document.body.appendChild(link);link.click();document.body.removeChild(link);
    toast('⬇ Baixando: '+a.name);
  });
}

var _renameDocId=null;

function renameAdmDoc(docId){
  if(!hasAdminAccess()){toast('Sem permissão para renomear');return;}
  var docs=getAdmDocs();var a=docs.find(function(x){return x.id===docId;});if(!a)return;
  _renameDocId=docId;
  _renameAttId=null;
  var inp=document.getElementById('rename-doc-inp');if(inp){inp.value=a.name;setTimeout(function(){inp.focus();inp.select();},200);}
  _setRenameDocModalMode('document');
  openM('mo-rename-doc');
}

function _confirmRenameAdmDoc(){
  if(!_renameDocId)return;
  var inp=document.getElementById('rename-doc-inp');
  var novo=(inp?inp.value:'').trim();
  if(!novo){toast('Digite um nome para o arquivo');return;}
  var docs=getAdmDocs();var a=docs.find(function(x){return x.id===_renameDocId;});
  if(!a){_renameDocId=null;closeM('mo-rename-doc');_setRenameDocModalMode('document');return;}
  if(novo===a.name){closeM('mo-rename-doc');_renameDocId=null;_setRenameDocModalMode('document');return;}
  a.name=novo;saveAdmDocs(docs);reRenderAdmDocs();closeM('mo-rename-doc');_renameDocId=null;_setRenameDocModalMode('document');toast('✏️ Renomeado!');
}

function deleteAdmDoc(docId){
  if(!hasAdminAccess()){toast('Sem permissão para excluir');return;}
  var docs=getAdmDocs();var a=docs.find(function(x){return x.id===docId;});if(!a)return;
  // Evita confirm() bloqueante (falha em iOS Safari/PWA standalone)
  var t=document.getElementById('toast'),tm=document.getElementById('tmsg');
  if(t&&tm){
    clearTimeout(t._tm);clearTimeout(t._confirmTm);
    tm.innerHTML='Excluir "'+eH(a.name.slice(0,24))+(a.name.length>24?'\u2026':'')+'"? <button id="toast-confirm-btn" style="margin-left:8px;padding:2px 9px;border-radius:6px;border:none;background:var(--red);color:#fff;font-size:.75rem;cursor:pointer;font-family:Outfit,sans-serif">Excluir</button>';
    var btn=document.getElementById('toast-confirm-btn');
    if(btn){btn.dataset.docId=docId;btn.addEventListener('click',function(){_confirmDelAdmDoc(this.dataset.docId);},{once:true});}
    t.classList.add('show');
    t._confirmTm=setTimeout(function(){t.classList.remove('show');tm.textContent='';},4000);

  }
}

function _confirmDelAdmDoc(docId){
  var t=document.getElementById('toast');if(t){clearTimeout(t._confirmTm);t.classList.remove('show');}
  if(!hasAdminAccess())return;
  var all=getAdmDocs();var a=all.find(function(x){return x.id===docId;});
  if(a)_deleteFromStorage(a.storagePath);
  var docs=all.filter(function(x){return x.id!==docId;});
  saveAdmDocs(docs);reRenderAdmDocs();toast('🗑 Documento removido');
}

var _admDocCtxOutsideH=null;

function admDocCtxOpen(e,docId){
  e.preventDefault();e.stopPropagation();
  _admDocCtxId=docId;
  var canManage=hasAdminAccess();
  var pinBtn=document.getElementById('adm-doc-ctx-pin');if(pinBtn)pinBtn.style.display=canManage?'':'none';
  var renBtn=document.getElementById('adm-doc-ctx-rename');if(renBtn)renBtn.style.display=canManage?'':'none';
  var delBtn=document.getElementById('adm-doc-ctx-del');if(delBtn)delBtn.style.display=canManage?'':'none';
  if(pinBtn){var docs=getAdmDocs();var a=docs.find(function(x){return x.id===docId;});pinBtn.textContent=(a&&a.pinned)?'📌 Desafixar':'📌 Fixar';}
  var ctx=document.getElementById('adm-doc-ctx');if(!ctx)return;
  ctx.classList.add('open');
  var x=Math.min(e.clientX,window.innerWidth-170),y=Math.min(e.clientY,window.innerHeight-200);
  ctx.style.left=x+'px';ctx.style.top=y+'px';ctx.style.position='fixed';
  if(_admDocCtxOutsideH)document.removeEventListener('click',_admDocCtxOutsideH);
  setTimeout(function(){
    _admDocCtxOutsideH=function h(){ctx.classList.remove('open');document.removeEventListener('click',_admDocCtxOutsideH);_admDocCtxOutsideH=null;};
    document.addEventListener('click',_admDocCtxOutsideH);
  },10);
}

function admDocCtxView(){if(_admDocCtxId)viewAdmDoc(_admDocCtxId);_admDocCtxId=null;}

function admDocCtxDownload(){if(_admDocCtxId)downloadAdmDoc(_admDocCtxId);_admDocCtxId=null;}

function admDocCtxRename(){if(_admDocCtxId)renameAdmDoc(_admDocCtxId);_admDocCtxId=null;}

function admDocCtxTogglePin(){if(_admDocCtxId)toggleAdmDocPin(_admDocCtxId);_admDocCtxId=null;}

function admDocCtxDelete(){if(_admDocCtxId)deleteAdmDoc(_admDocCtxId);_admDocCtxId=null;}
