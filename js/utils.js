/* =====================================================================
 * utils.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// Reaproveita o mesmo base64 do favicon acima em vez de repeti-lo mais 5 vezes no arquivo
// (economiza ~115KB no download inicial) — ver relatório de auditoria (performance).
var LF_LOGO_B64=document.querySelector('link[rel="icon"]').href;

// Helper global mínimo de DOM: applyThemeUI() e outros pontos de bootstrap podem rodar
// antes dos patches mais abaixo que declaram helpers locais com o mesmo nome dentro de IIFEs.
// Sem esta versão global, o DOMContentLoaded disparava ReferenceError: el is not defined.
function el(id){return document.getElementById(id);}

/* Debounce leve pros campos de busca/filtro: evita reconstruir a lista/quadro a cada
   tecla digitada quando a pessoa digita rápido — só redesenha ~120ms depois da última
   tecla. Como a leitura em si já é local-first (instantânea), isso só evita trabalho
   de tela desnecessário, sem atrasar percepção nenhuma pra quem está digitando. */
var _dbTimers={}

function debounce(key,fn,wait){clearTimeout(_dbTimers[key]);_dbTimers[key]=setTimeout(fn,wait||120);}

function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

/* Bug corrigido (fuso horário): new Date("YYYY-MM-DD") o JS interpreta como meia-noite
   UTC, mas toDateString()/comparações com "new Date()" (sem args) usam hora LOCAL. No
   Brasil (UTC-3), um registro salvo com data de hoje virava "ontem" ao ser reinterpretado
   — os filtros "Hoje"/"Semana" do Analytics (drawAnal) e o texto "Cadastrado em" da
   timeline (openTimeline) ficavam errados perto da meia-noite/madrugada. Isso monta a
   data direto em hora local (mesmo esquema que today() já usa pra gerar a string),
   sem passar pelo parser UTC do construtor Date(string). */
function _parseLocalDate(v){
  if(typeof v==='string'){
    var m=v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  }
  return new Date(v);
}

function eH(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function _htmlAttr(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function _jsSq(s){s=String(s==null?'':s);return s.split('\\').join('\\\\').split("'").join("\\'").replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/</g,'\\x3C').replace(/>/g,'\\x3E');}

function _safeLiteHTML(raw){
  var tpl=document.createElement('template');
  tpl.innerHTML=String(raw==null?'':raw);
  var ok={BR:1,STRONG:1,B:1,EM:1,I:1,U:1,SMALL:1,SPAN:1};
  (function walk(node){
    Array.from(node.childNodes).forEach(function(ch){
      if(ch.nodeType===1){
        if(!ok[ch.tagName]){
          ch.replaceWith(document.createTextNode(ch.textContent||''));
          return;
        }
        Array.from(ch.attributes).forEach(function(a){ch.removeAttribute(a.name);});
        walk(ch);
      }else if(ch.nodeType!==3){
        ch.remove();
      }
    });
  })(tpl.content);
  return tpl.innerHTML;
}

function fmtBRL(v){v=parseFloat(v)||0;return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0});}

function _fallbackCopy(text,msg){
  try{
    var ta=document.createElement('textarea');
    ta.value=String(text);
    ta.style.position='fixed';ta.style.left='-9999px';ta.style.top='0';
    document.body.appendChild(ta);
    ta.focus();ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast(msg||'Copiado!');
  }catch(e){
    toast('Não foi possível copiar');
  }
}

var ETP=['Agendado','Audio 30s','Conf. 24h','Conf. 2h','Compareceu','Virou Ficha','Fechou'];

var SLB=['Ag','30s','24h','2h','Reu','Fic','F'];

var STATUS_NORMAL='normal',STATUS_ATENDIDO='atendido',STATUS_REMARCAR='remarcar',STATUS_NOSHOW='noshow';

var AVB=['linear-gradient(135deg,#8A6A18,#DDB84A)','linear-gradient(135deg,#094F7A,#3A9FE0)','linear-gradient(135deg,#41285A,#A070CC)','linear-gradient(135deg,#644200,#F4A030)','linear-gradient(135deg,#0B5040,#1B8A5E)'];

var METAS={ag:100,comp:70,c24:80,c2h:80,fic:60,fec:20}

var ADM_EMAIL='adm@liderfinanceira.com';

var NICHO_LABELS={imovel:'Imovel',caminhao:'Caminhao',carro:'Carro/Moto',pesados:'Pesados',outro:'Outro'}

var MONTH_NAMES=['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

var DAY_NAMES=['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];

var AG_HOURS=['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00'];

var ACT_TYPES={call:{ic:'📞',lbl:'Ligacao'},meet:{ic:'📅',lbl:'Reuniao'},task:{ic:'✅',lbl:'Tarefa'},note:{ic:'📋',lbl:'Nota'}}

var _moLastFocus=null;

var _moZTop=200;

function openM(id){
  var e=document.getElementById(id);if(!e)return;
  // Bug de sobreposicao: os paineis de Atividades/Notificacoes tem z-index maior que os
  // modais (.mo) e nao fechavam quando um modal era aberto via codigo (ex: openKBNew),
  // apenas ao clicar fora. Resultado: o painel flutuava por cima do modal recem-aberto.
  var ap=document.getElementById('act-panel');if(ap)ap.classList.remove('open');
  var np=document.getElementById('ntf-panel');if(np)np.classList.remove('open');
  if(!document.querySelector('.mo.open')){
    document.body._scrollY=window.scrollY||window.pageYOffset;
    document.body.style.top='-'+document.body._scrollY+'px';
  }
  // Bug de empilhamento: alguns modais (#mo-kb-det, #mo-confirm-del) tem z-index fixo
  // no CSS, maior que o z-index base (200) de todos os outros .mo. Isso fazia um modal
  // aberto "por cima" de outro (ex: "Adicionar Lembrete" aberto de dentro do detalhe do
  // card) ficar escondido/inacessivel atras do modal ja aberto — parecia abrir (a classe
  // "open" era aplicada) mas nao aparecia nem respondia a toque. Corrigido dando a CADA
  // modal, no momento em que e aberto, um z-index maior que o de todos os que ja estavam
  // abertos — o mais recente sempre fica visivel e clicavel por cima.
  _moZTop+=1;e.style.zIndex=String(_moZTop);
  _moLastFocus=document.activeElement;
  e.classList.add('open');
  e.setAttribute('role','dialog');
  e.setAttribute('aria-modal','true');
  document.body.style.overflow='hidden';
  document.body.style.position='fixed';
  document.body.style.width='100%';
  // Move focus to first focusable element inside modal
  requestAnimationFrame(function(){
    var focusable=e.querySelector('input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])');
    if(focusable)focusable.focus();
  });
}

function closeM(id){
  var e=document.getElementById(id);if(!e)return;
  e.classList.remove('open');
  if(id==='mo-tl'){_tlOwnerUid=null;_tlCid=null;}
  if(id==='mo-kb-det'){_kbDetId=null;_kbDetBoard=null;_kbDetOwnerUid=null;}
  if(id==='mo-kb'){_kbEditId=null;_kbEditBoard=null;_kbEditOwnerUid=null;}
  if(id==='mo-att-view'&&typeof _releaseAttViewBlobUrl==='function')_releaseAttViewBlobUrl();
  var anyOpen=document.querySelector('.mo.open');
  if(!anyOpen){
    var sy=document.body._scrollY||0;
    document.body.style.overflow='';
    document.body.style.position='';
    document.body.style.width='';
    document.body.style.top='';
    requestAnimationFrame(function(){window.scrollTo(0,sy);});
    // Restore focus to element that triggered the modal
    if(_moLastFocus&&_moLastFocus.focus){try{_moLastFocus.focus();}catch(ex){}}
    _moLastFocus=null;
  }
}

function toggleEye(id,btn){var i=document.getElementById(id);if(!i)return;i.type=i.type==='password'?'text':'password';btn.textContent=i.type==='password'?'\uD83D\uDC41':'\uD83D\uDE48';}

function toast(msg,dur){var t=document.getElementById('toast'),tm=document.getElementById('tmsg');if(!t||!tm)return;tm.textContent=msg;t.classList.add('show');clearTimeout(t._tm);t._tm=setTimeout(function(){t.classList.remove('show');},dur||2400);}

function _syncViewportMetrics(){
  if(_syncViewportMetrics._raf)return;
  _syncViewportMetrics._raf=requestAnimationFrame(function(){
    _syncViewportMetrics._raf=0;
    var vv=window.visualViewport;
    var h=Math.max(320,Math.round((vv&&vv.height)||window.innerHeight||document.documentElement.clientHeight||0));
    if(_syncViewportMetrics._lastH===h)return;
    _syncViewportMetrics._lastH=h;
    document.documentElement.style.setProperty('--vvh',h+'px');
  });
}

function _keepFocusedFieldVisible(target){
  if(!target||!target.closest)return;
  var modalBody=target.closest('.mo.open .mb');
  if(!modalBody)return;
  if(window.innerWidth>768)return;
  setTimeout(function(){
    try{target.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});}catch(e){}
  },180);
}

function toastUndo(msg,undoFn,delayMs){
  delayMs=delayMs||5000;
  var stack=document.getElementById('toast-stack');if(!stack)return;
  var t=document.createElement('div');t.className='toast2';
  var ic=document.createElement('span');ic.className='toast2-ic';ic.textContent='🗑';
  var tx=document.createElement('span');tx.textContent=msg;
  var ub=document.createElement('button');ub.className='toast2-undo';ub.textContent='Desfazer';
  var _undone=false;
  var _timer=setTimeout(function(){t.classList.remove('show');setTimeout(function(){t.remove();},300);},delayMs);
  ub.onclick=function(){
    if(_undone)return;_undone=true;clearTimeout(_timer);
    t.classList.remove('show');setTimeout(function(){t.remove();},300);
    if(undoFn)undoFn();toast('Ação desfeita!');
  };
  t.appendChild(ic);t.appendChild(tx);t.appendChild(ub);
  stack.appendChild(t);requestAnimationFrame(function(){t.classList.add('show');});
}

function switchMoTab(paneId,btn){var mo=btn.closest('.mb');if(!mo)return;mo.querySelectorAll('.mo-tab').forEach(function(b){b.classList.remove('on');});mo.querySelectorAll('.mo-tab-pane').forEach(function(p){p.classList.remove('on');});btn.classList.add('on');var p=document.getElementById(paneId);if(p)p.classList.add('on');}

// ============================================================
// INTERFACE MOBILE (estilo Bitrix24) — TAREFA 10
// Esta camada só assume comportamento visível quando a tela tem até 768px
// (controlado via CSS). Em telas maiores estas funções continuam existindo mas
// os elementos que elas populam ficam com display:none, então não têm efeito.
// ============================================================
var MOBILE_BREAKPOINT=768;

function isMobileView(){return window.innerWidth<=MOBILE_BREAKPOINT;}

/* Mapa de página -> título exibido no header mobile e -> item ativo da nav inferior. */
var MOBILE_PAGE_TITLES={dash:'Início',leads:'CRM',negocios:'CRM',agenda:'Agenda',anal:'Analytics',dic:'Dicionário',config:'Configurações',adm:'ADM',time:'Time',docs:'Documentos',estrutura:'Estrutura'}

function mobileGoPage(p){
  closeMobileMenu();
  goPage(p);
  if(isMobileView())requestAnimationFrame(function(){window.scrollTo(0,0);});
}

/* Atualiza o título do header mobile e qual item da nav inferior fica "on", sem
   duplicar a lógica de roteamento que já existe em goPage(). Chamado tanto pela
   nav inferior quanto sempre que goPage() roda (ver hook abaixo). */
var _crmLastTab='leads';

function mobileSyncChrome(p){
  var title=document.getElementById('mtb-title');if(title)title.textContent=MOBILE_PAGE_TITLES[p]||'';
  // Leads e Negócios agora vivem dentro de uma única tela "CRM" (abas internas,
  // estilo Bitrix24) — então na nav inferior o item que acende é sempre "crm"
  // pra qualquer uma das duas, e guardamos qual das duas foi a última visitada
  // pra reabrir na mesma aba da próxima vez que o usuário tocar em "CRM".
  var navPage=(p==='leads'||p==='negocios')?'crm':p;
  if(p==='leads'||p==='negocios')_crmLastTab=p;
  if(['anal','dic','config','adm','time','docs','estrutura'].indexOf(navPage)>=0)navPage='menu';
  document.querySelectorAll('#mobile-bottom-nav .mbn-item').forEach(function(b){b.classList.toggle('on',b.dataset.page===navPage);});
  document.querySelectorAll('.crm-toptabs .ctt-btn').forEach(function(b){b.classList.toggle('on',b.dataset.board===p);});
}

function toggleMobileMenu(){
  var d=document.getElementById('mobile-menu-drawer'),o=document.getElementById('mobile-menu-overlay');
  if(!d)return;
  var opening=!d.classList.contains('open');
  if(opening){
    // Fechar modais abertos antes de abrir o menu
    document.querySelectorAll('.mo.open').forEach(function(m){m.classList.remove('open');});
    renderMobileMenu();
    d.style.display='flex';
    if(o)o.style.display='block';
    // Trava o scroll do body enquanto drawer está aberto (iOS Safari scrollava por baixo).
    // Bug corrigido: faltava o "top:-scrollY" que openM() já usa pra travar modais —
    // sem ele, position:fixed sozinho fazia a página de fundo pular visualmente pro
    // topo assim que o drawer abria (mesmo rolando de volta certinho ao fechar).
    document.body._drawerScrollY=window.scrollY;
    document.body.style.top='-'+document.body._drawerScrollY+'px';
    document.body.style.overflow='hidden';
    document.body.style.position='fixed';
    document.body.style.width='100%';
    document.body.classList.add('mobile-menu-open');
    requestAnimationFrame(function(){
      d.classList.add('open');
      if(o)o.classList.add('open');
    });
  }else{
    d.classList.remove('open');
    if(o)o.classList.remove('open');
    // Restaura scroll do body
    document.body.style.overflow='';document.body.style.position='';document.body.style.width='';document.body.style.top='';
    document.body.classList.remove('mobile-menu-open');
    window.scrollTo(0,document.body._drawerScrollY||0);
    setTimeout(function(){
      if(!d.classList.contains('open')){d.style.display='';}
      if(o&&!o.classList.contains('open')){o.style.display='';}
    },300);
  }
}

function closeMobileMenu(){
  var d=document.getElementById('mobile-menu-drawer'),o=document.getElementById('mobile-menu-overlay');
  if(d){d.classList.remove('open');setTimeout(function(){if(!d.classList.contains('open'))d.style.display='';},300);}
  if(o){o.classList.remove('open');setTimeout(function(){if(!o.classList.contains('open'))o.style.display='';},300);}
  // Restaura scroll do body travado pelo toggleMobileMenu
  document.body.style.overflow='';document.body.style.position='';document.body.style.width='';document.body.style.top='';
  document.body.classList.remove('mobile-menu-open');
  window.scrollTo(0,document.body._drawerScrollY||0);
}

_syncViewportMetrics();

window.addEventListener('resize',_syncViewportMetrics,{passive:true});

if(window.visualViewport){window.visualViewport.addEventListener('resize',_syncViewportMetrics,{passive:true});window.visualViewport.addEventListener('scroll',_syncViewportMetrics,{passive:true});}

document.addEventListener('focusin',function(e){_keepFocusedFieldVisible(e.target);},{passive:true});

/* Preenche todos os logos (.lf-logo-img) com o mesmo base64 do favicon.
   Antes isso era feito com <script> inline logo após cada <img> no index.html
   (via document.currentScript.previousElementSibling). Centralizado aqui para
   tirar todo JS solto do HTML — roda no DOMContentLoaded pois os elementos
   .lf-logo-img só existem depois do <body> ser parseado. */
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('.lf-logo-img').forEach(function(img){img.src=LF_LOGO_B64;});
});
