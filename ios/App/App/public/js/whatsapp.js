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
    (function(){var _ctrl=typeof AbortController!=='undefined'?new AbortController():null;var _tid=_ctrl?setTimeout(function(){_ctrl.abort();},15000):null;return fetch('https://api.cloudinary.com/v1_1/'+CLOUDINARY_CLOUD_NAME+'/auto/upload',{method:'POST',body:fd,signal:_ctrl?_ctrl.signal:undefined}).finally(function(){if(_tid)clearTimeout(_tid);});})()
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
// EVOLUTION API — envio de WhatsApp direto pelo CRM (sem abrir o app)
// ============================================================
// Servidor Evolution API rodando no Railway (Docker: Evolution + Postgres + Redis).
// SEGURANÇA: chave da Evolution API não deve ficar hardcoded no bundle.
// Configure via meta tag <meta name="lf-evo-key" content="SUA_CHAVE"> no app.html,
// ou via window.__EVO_API_KEY antes do carregamento deste script.
// O fallback hardcoded abaixo é mantido apenas para retrocompatibilidade;
// REMOVA-O em produção e configure via variável de ambiente/meta tag.
var EVOLUTION_BASE_URL = (function(){
  var m=document.querySelector('meta[name="lf-evo-url"]');
  return (m&&m.content)||window.__EVO_BASE_URL||"https://evolution-api-production-5835.up.railway.app";
})();
var EVOLUTION_API_KEY = (function(){
  var m=document.querySelector('meta[name="lf-evo-key"]');
  return (m&&m.content)||window.__EVO_API_KEY||""  /* REMOVA o valor hardcoded — configure via <meta name="lf-evo-key"> ou window.__EVO_API_KEY */;
})();
// Nome da instância — precisa ser criada no Manager da Evolution ANTES de usar
// (visite EVOLUTION_BASE_URL no navegador, crie uma instância com este mesmo
// nome e escaneie o QR Code com o WhatsApp que vai enviar as mensagens).
var EVOLUTION_INSTANCE = "lidercrm";

function evoInstanceReady(){return !!(EVOLUTION_BASE_URL&&EVOLUTION_INSTANCE&&EVOLUTION_API_KEY);}

/* Formata o número no padrão que a Evolution API espera: DDI+DDD+numero, só dígitos. */
function _evoFormatNumber(tel){
  var digits=String(tel||'').replace(/\D/g,'');
  if(!digits)return null;
  return digits.indexOf('55')===0?digits:'55'+digits;
}

/* Envia uma mensagem de texto via Evolution API. cb(err,data) no mesmo padrão
   usado no resto do CRM (ex: _uploadFileToStorage). */
function evoSendText(tel,text,cb){
  cb=cb||function(){};
  if(!evoInstanceReady()){cb('evolution-nao-configurado');return;}
  var number=_evoFormatNumber(tel);
  if(!number){cb('numero-invalido');return;}
  fetch(EVOLUTION_BASE_URL+'/message/sendText/'+EVOLUTION_INSTANCE,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':EVOLUTION_API_KEY},
    body:JSON.stringify({number:number,text:text})
  }).then(function(r){
    if(!r.ok)return r.text().then(function(t){throw new Error('Evolution '+r.status+': '+t);});
    return r.json();
  }).then(function(data){cb(null,data);}).catch(function(e){console.error('evoSendText',e);cb(e);});
}

/* Checa se a instância está conectada (WhatsApp escaneado e online).
   data.instance.state costuma vir 'open' (conectado), 'connecting' ou 'close'. */
function evoCheckConnection(cb){
  cb=cb||function(){};
  if(!evoInstanceReady()){cb('evolution-nao-configurado');return;}
  fetch(EVOLUTION_BASE_URL+'/instance/connectionState/'+EVOLUTION_INSTANCE,{
    headers:{'apikey':EVOLUTION_API_KEY}
  }).then(function(r){return r.json();}).then(function(data){cb(null,data);}).catch(function(e){cb(e);});
}

/* Ação de "enviar mensagem sem sair do CRM": usa Evolution API se a instância
   estiver pronta; se não, cai pro comportamento antigo (abre wa.me). Assim
   nada quebra enquanto a instância ainda não foi conectada. */
function sendWhatsAppCRM(tel,nome,text){
  if(!text||!text.trim()){toast('Digite uma mensagem');return;}
  if(!evoInstanceReady()){openWhatsApp(tel,nome);return;}
  toast('Enviando mensagem...');
  evoSendText(tel,text,function(err){
    if(err){toast('⚠️ Falha ao enviar pela Evolution API. Abrindo WhatsApp normal...',3500);openWhatsApp(tel,nome);}
    else toast('✅ Mensagem enviada!');
  });
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
   numéricos e garante o código do país 55 na frente (sem duplicar).

   ADENDO CAPACITOR (2026-07-16): `window.open('...', '_blank')` NÃO abre
   o navegador externo dentro do Android WebView do Capacitor — a URL é
   simplesmente descartada. Portanto, quando estamos rodando como app
   nativo (Capacitor.isNativePlatform()), preferimos:
     1) plugin @capacitor/browser (se instalado) → abre in-app browser
        seguro (Chrome Custom Tabs no Android).
     2) fallback: um Intent implícito via location.href, que o WebView
        delega para o app do WhatsApp (com o esquema whatsapp:// via
        wa.me → Android já resolve o Intent).
   Em navegador web comum mantemos o comportamento antigo (window.open). */
function _lfIsCapacitorNative(){
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch(_e){ return false; }
}
function _lfOpenExternal(url){
  // 1) Plugin oficial (preferido em Capacitor)
  try {
    var Plugins = (window.Capacitor && window.Capacitor.Plugins) || null;
    if (_lfIsCapacitorNative() && Plugins && Plugins.Browser && typeof Plugins.Browser.open === 'function') {
      Plugins.Browser.open({ url: url, presentationStyle: 'popover' });
      return;
    }
  } catch(_e){console.warn("whatsapp: Browser.open fallback failed",_e);}
  // 2) Web / fallback (WebView + intent implícito)
  try {
    var w = window.open(url, '_blank', 'noopener,noreferrer');
    // Em WebView `window.open` pode retornar null silenciosamente.
    if (!w && _lfIsCapacitorNative()) { window.location.href = url; }
  } catch(_e){
    try { window.location.href = url; } catch(_e2){console.warn("whatsapp: location.href fallback failed",_e2);}
  }
}
function openWhatsApp(tel,nome){
  if(!tel||!String(tel).trim()){toast('Número não cadastrado');return;}
  var digits=String(tel).replace(/\D/g,'');
  if(!digits){toast('Número não cadastrado');return;}
  var withCountry=digits.indexOf('55')===0?digits:'55'+digits;
  _lfOpenExternal('https://wa.me/'+withCountry);
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
