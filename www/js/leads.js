/* =====================================================================
 * leads.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// ============================================================
// DICIONARIO
// ============================================================

// ============================================================
// BANCO DE OBJEÇÕES (Tarefa 1)
// Cada objecao tem 3 niveis de resposta (iniciante/intermediario/
// experiente) e um campo "canal" que define se a resposta pode ir
// por escrito no WhatsApp ou se exige ligacao (respaldo juridico):
//   zap_ou_ligacao  -> pode ir os dois jeitos
//   preferir_ligacao -> melhor por ligacao, mas nao e proibido no zap
//   somente_ligacao -> NUNCA detalhar por escrito no WhatsApp
// As 17 objecoes da base de negocio + 4 adicionais comuns no nicho
// de credito imobiliario (FGTS, nome negativado, prazo, risco de
// inadimplencia), seguindo o mesmo padrao.
// ============================================================
var __leadsRuntime=(((window.LiderCRM||{}).modules||{}).leads||{}).runtime||{};
var dicionarioObjecoes=__leadsRuntime.dicionarioObjecoes||[];
var CUSTOM_OBJ_KEY=__leadsRuntime.CUSTOM_OBJ_KEY;
var getCustomObjecoes=__leadsRuntime.getCustomObjecoes;
var _cfgWorkerClient=__leadsRuntime._cfgWorkerClient;
var saveCustomObjecoes=__leadsRuntime.saveCustomObjecoes;
var loadCustomObjecoes=__leadsRuntime.loadCustomObjecoes;
var admAddObjecao=__leadsRuntime.admAddObjecao;
var OBJ_EDITS_KEY=__leadsRuntime.OBJ_EDITS_KEY;
var OBJ_DELETED_KEY=__leadsRuntime.OBJ_DELETED_KEY;
var getObjEdits=__leadsRuntime.getObjEdits;
var saveObjEdits=__leadsRuntime.saveObjEdits;
var loadObjEdits=__leadsRuntime.loadObjEdits;
var getObjDeletedIds=__leadsRuntime.getObjDeletedIds;
var saveObjDeletedIds=__leadsRuntime.saveObjDeletedIds;
var loadObjDeletedIds=__leadsRuntime.loadObjDeletedIds;
var _objBancoResolved=__leadsRuntime._objBancoResolved;
var admOpenEditObjecao=__leadsRuntime.admOpenEditObjecao;
var admSaveEditObjecao=__leadsRuntime.admSaveEditObjecao;
var admDeleteBancoObjecao=__leadsRuntime.admDeleteBancoObjecao;
var USER_OBJ_KEY=__leadsRuntime.USER_OBJ_KEY;
var getUserObjecoes=__leadsRuntime.getUserObjecoes;
var saveUserObjecoes=__leadsRuntime.saveUserObjecoes;
var loadUserObjecoes=__leadsRuntime.loadUserObjecoes;
var userObjFilterCanal=__leadsRuntime.userObjFilterCanal;
var userObjFilterAutor=__leadsRuntime.userObjFilterAutor;
var userAddObjecao=__leadsRuntime.userAddObjecao;
var _podeEditarUserObj=__leadsRuntime._podeEditarUserObj;
var userOpenEditObjecao=__leadsRuntime.userOpenEditObjecao;
var userSaveEditObjecao=__leadsRuntime.userSaveEditObjecao;
var userDeleteObjecao=__leadsRuntime.userDeleteObjecao;
var copyObjecaoEquipe=__leadsRuntime.copyObjecaoEquipe;
var renderUserObjBank=__leadsRuntime.renderUserObjBank;


var _objBankCanal=null;

// FIX 10: objeções customizadas salvas pelo ADM (visíveis para toda equipe)


// FIX 9: reset de interface sem perder dados
function resetInterface(){
  _confirmModal({
    title:'🔄 Resetar interface?',
    msg:'<strong>Nenhum lead, negócio, cliente, usuário, configuração ou preferência visual será apagado.</strong><br><br>Este reset apenas limpa travamentos de tela (cache do app e service worker) e recarrega a página do zero. Todos os seus dados continuam salvos normalmente.',
    okLabel:'Resetar interface',
    okClass:'bp',
    onOk:function(){
      // IMPORTANTE: este reset NUNCA apaga localStorage — leads, negócios, clientes,
      // configurações (incl. lf_automation_rules) e preferências visuais (logo, foto de
      // fundo, foto de perfil) permanecem 100% intactos. Apenas se limpa o que pode
      // causar travamento visual: o service worker (que pode servir versão antiga em
      // cache) e o cache do navegador, forçando recarregar tudo "fresco" do servidor.
      var done=function(){
        toast('Interface resetada! Recarregando...');
        setTimeout(function(){
          location.href=location.pathname+'?_reset='+Date.now()+location.hash;
        },900);
      };
      try{
        if('serviceWorker' in navigator){
          navigator.serviceWorker.getRegistrations().then(function(regs){
            return Promise.all(regs.map(function(r){return r.unregister();}));
          }).then(function(){
            if(window.caches&&caches.keys){
              return caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));});
            }
          }).then(done).catch(done);
        }else{
          done();
        }
      }catch(e){done();}
    }
  });
}

function objBankFilterCanal(canal,btn){
  _objBankCanal=canal;
  document.querySelectorAll('.canal-filter').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');
  renderObjBank();
}

function renderObjBank(){
  var el=document.getElementById('obj-bank-list');if(!el)return;
  var q=(document.getElementById('obj-bank-search')||{}).value||'';
  q=String(q||"").toLowerCase().trim();
  // Mescla objeções fixas + customizadas pelo ADM, aplica edições e remove excluídas
  var edits=getObjEdits();
  var deletedIds=getObjDeletedIds().map(String);
  var todosObjs=dicionarioObjecoes.concat(getCustomObjecoes())
    .filter(function(o){return deletedIds.indexOf(String(o.id))<0;})
    .map(function(o){
      var patch=edits[o.id]||edits[String(o.id)];
      if(!patch)return o;
      return Object.assign({},o,patch,{respostas:Object.assign({},o.respostas,patch.respostas||{})});
    });
  var list=todosObjs.filter(function(o){
    if(!o)return false;
    if(_objBankCanal&&o.canal!==_objBankCanal)return false;
    if(!q)return true;
    return (o.objecao||'').toLowerCase().indexOf(q)>=0||(o.categoria||'').toLowerCase().indexOf(q)>=0;
  });
  if(!list.length){el.innerHTML='<div class="obj-empty">Nenhuma objeção encontrada.</div>';return;}
  var canalLbl={zap_ou_ligacao:'&#128241; Zap e ligação',preferir_ligacao:'&#9742;&#65039; Prefere ligação',somente_ligacao:'&#128274; Somente ligação'};
  var isAdm=hasAdminAccess();
  function card(o){
    var isCustom=String(o.id).startsWith('custom_');
    var actions='<div class="obj-card-actions">'
      +'<button class="obj-act-btn copy" onclick="event.stopPropagation();copyObjecaoBanco(\''+o.id+'\')" title="Copiar">📋</button>'
      +(isAdm?'<button class="obj-act-btn edit" onclick="event.stopPropagation();admOpenEditObjecao(\''+o.id+'\')" title="Editar">✏️</button><button class="obj-act-btn del" onclick="event.stopPropagation();admDeleteBancoObjecao(\''+o.id+'\')" title="Excluir">✕</button>':'')
      +'</div>';
    return '<div class="obj-card"><div class="obj-card-hd"><div class="obj-card-q">'+eH(o.objecao)+(isCustom?'<span style="font-size:.6rem;color:var(--ok);margin-left:6px;background:rgba(27,138,94,.12);padding:1px 5px;border-radius:10px">✦ ADM</span>':'')+'</div><span class="canal-badge '+o.canal+'">'+canalLbl[o.canal]+'</span>'+actions+'</div>'
      +'<div class="obj-cat">'+eH(o.categoria)+'</div>'
      +'<div class="obj-levels">'
      +['iniciante','intermediario','experiente'].map(function(lv){
        var lbl={iniciante:'Iniciante',intermediario:'Intermediário',experiente:'Experiente'}[lv];
        return '<div class="obj-level"><div class="obj-level-lbl '+lv+'">'+lbl+'</div><div class="obj-level-txt">'+eH((o.respostas&&o.respostas[lv])||'')+'</div></div>';
      }).join('')
      +'</div></div>';
  }
  if(_objBankCanal){
    // Filtro de um canal especifico: lista direta, sem precisar repetir o cabecalho
    el.innerHTML=list.map(card).join('');
  }else{
    // "Todas": divide visualmente em 3 grupos por canal de preferencia (Tarefa 9)
    var order=['preferir_ligacao','somente_ligacao','zap_ou_ligacao'];
    el.innerHTML=order.map(function(canal){
      var items=list.filter(function(o){return o.canal===canal;});
      if(!items.length)return '';
      return '<div class="obj-group-hd">'+canalLbl[canal]+' <span class="obj-group-cnt">('+items.length+')</span></div>'+items.map(card).join('');
    }).join('');
  }
}

// Copia uma objeção do Banco (fixa ou custom) + suas respostas para a área de transferência.
function copyObjecaoBanco(id){
  var o=_objBancoResolved(id);if(!o)return;
  var lbl={iniciante:'Iniciante',intermediario:'Intermediário',experiente:'Experiente'};
  var txt='Objeção: '+o.objecao+'\n\n'+['iniciante','intermediario','experiente'].filter(function(lv){return o.respostas&&o.respostas[lv];}).map(function(lv){return lbl[lv]+': '+o.respostas[lv];}).join('\n\n');
  copyToClipboard(txt,'📋 Objeção copiada!');
}

// ============================================================
// OBJEÇÕES DA EQUIPE (adicionadas por qualquer usuário, sem ser ADM)
// Diferente do Banco de Objeções do ADM (que entra como se sempre tivesse
// existido, misturado à lista oficial), toda objeção lançada aqui por um
// usuário fica visível numa área SEPARADA, sempre mostrando quem lançou,
// a data e se a resposta serve pra WhatsApp, ligação ou ambos. Qualquer
// usuário pode editar/excluir as que ELE MESMO lançou; o ADM pode editar
// ou excluir qualquer uma. Sincroniza com Firestore, igual às demais.
// ============================================================


function dicInit(){
  loadCustomObjecoes(function(){renderObjBank();});
  loadObjEdits(function(){renderObjBank();});
  loadObjDeletedIds(function(){renderObjBank();});
  loadUserObjecoes(function(){renderUserObjBank();});
  // Mostra seção de adicionar objeção oficial apenas para ADM
  var admSec=document.getElementById('adm-add-obj-section');
  if(admSec)admSec.style.display=hasAdminAccess()?'block':'none';
}

function dicGoTab(tab,btn){document.querySelectorAll('.dic-tab').forEach(function(b){b.classList.remove('on');});document.querySelectorAll('.dic-pane').forEach(function(p){p.classList.remove('on');});if(btn)btn.classList.add('on');var p=document.getElementById('dic-pane-'+tab);if(p)p.classList.add('on');}
