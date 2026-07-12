/* =====================================================================
 * whatsapp.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// Cloudinary (upload gratuito de anexos do chat, sem precisar do plano pago
// do Firebase Storage/Blaze). Crie uma conta gratis em cloudinary.com,
// pegue o "Cloud name" no Dashboard e crie um "Upload preset" com
// Signing Mode = Unsigned em Settings > Upload > Upload presets.
// Cole os dois valores abaixo entre aspas:
var CLOUDINARY_CLOUD_NAME="e8kjxu7h";

var CLOUDINARY_UPLOAD_PRESET="chat_uploads";

function cloudinaryReady(){return CLOUDINARY_CLOUD_NAME&&CLOUDINARY_CLOUD_NAME.indexOf('COLE_AQUI')!==0&&CLOUDINARY_UPLOAD_PRESET&&CLOUDINARY_UPLOAD_PRESET.indexOf('COLE_AQUI')!==0;}

/* Envia um arquivo pro Cloudinary (upload unsigned, direto do navegador,
   sem expor nenhuma chave secreta). cb(err, {url, path}) igual ao padrao
   usado pelo _uploadFileToStorage do Firebase, pra nao precisar mudar
   mais nada no resto do chat. */
function _uploadFileToCloudinary(file,cb){
  /* PATCH 2025: agora faz fallback para data: URL inline se o
     Cloudinary recusar (ex.: conta expirada, sem internet).
     Tudo continua funcionando — o anexo fica salvo junto ao lead/msg
     em localStorage, só que dentro do próprio objeto. */
  if(!cloudinaryReady()){
    _uploadFileAsDataURL(file,cb);return;
  }
  try{
    var fd=new FormData();
    fd.append('file',file);
    fd.append('upload_preset',CLOUDINARY_UPLOAD_PRESET);
    fetch('https://api.cloudinary.com/v1_1/'+CLOUDINARY_CLOUD_NAME+'/auto/upload',{method:'POST',body:fd})
      .then(function(r){
        if(!r.ok){
          // Conta expirada/quarentena/bloqueada -> cai pro data: URL
          return _uploadFileAsDataURL(file,cb);
        }
        return r.json();
      })
      .then(function(data){
        if(data&&data.secure_url){cb(null,{url:data.secure_url,path:'cloudinary:'+(data.public_id||'')});return;}
        _uploadFileAsDataURL(file,cb);
      })
      .catch(function(){_uploadFileAsDataURL(file,cb);});
  }catch(e){_uploadFileAsDataURL(file,cb);}
}

function _uploadFileAsDataURL(file,cb){
  try{
    var r=new FileReader();
    r.onload=function(){cb(null,{url:r.result,path:'local:'+file.name});};
    r.onerror=function(){cb(new Error('local_read_fail'));};
    r.readAsDataURL(file);
  }catch(e){cb(e);}
}

// ============================================================
// AÇÕES DE CONTATO (Ligar / WhatsApp / Copiar número)
// Funções globais usadas pelos cards do Kanban, pelo modal de detalhe e pela lista mobile.
// ============================================================
/* Abre o discador do celular com o prefixo 021 + número do cliente (remove tudo que não
   for dígito antes; se o número já vier com 021 ou 21 na frente, não duplica o prefixo).
   Também contabiliza a ligação no contador existente (registerLigacao). */
function callClient(tel,nome){
  if(!tel||!String(tel).trim()){toast('Número não cadastrado');return;}
  var digits=String(tel).replace(/\D/g,'');
  if(!digits){toast('Número não cadastrado');return;}
  var withPrefix;
  if(digits.indexOf('021')===0)withPrefix=digits;
  else if(digits.indexOf('21')===0)withPrefix='0'+digits;
  else withPrefix='021'+digits;
  window.location.href='tel:'+withPrefix;
  if(typeof registerLigacao==='function')registerLigacao();
}

/* Abre o WhatsApp Web/App do cliente em nova aba via wa.me. Remove caracteres não
   numéricos e garante o código do país 55 na frente (sem duplicar). */
function openWhatsApp(tel,nome){
  if(!tel||!String(tel).trim()){toast('Número não cadastrado');return;}
  var digits=String(tel).replace(/\D/g,'');
  if(!digits){toast('Número não cadastrado');return;}
  var withCountry=digits.indexOf('55')===0?digits:'55'+digits;
  window.open('https://wa.me/'+withCountry,'_blank','noopener,noreferrer');
}

/* Copia texto para a área de transferência. Usa a Clipboard API moderna quando disponível
   e cai para _fallbackCopy (textarea temporário + execCommand) em navegadores/contextos
   sem suporte (ex: HTTP sem TLS, alguns webviews). */
function copyToClipboard(text,msg){
  if(!text){toast('Número não cadastrado');return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(String(text)).then(function(){toast(msg||'Copiado!');}).catch(function(){_fallbackCopy(text,msg);});
  }else{
    _fallbackCopy(text,msg);
  }
}
