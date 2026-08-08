/* =====================================================================
 * auth.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

function sh(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i);return(h>>>0).toString(36);}

/* Correção de segurança: sh() (DJB2, 32 bits, sem salt) não é adequado pra
   senha — é reversível por força bruta em segundos. Mantido só como formato
   legado para não travar contas já cadastradas antes desta correção.
   shSecure()/verifyPw() usam SHA-256 com salt aleatório por usuário via
   Web Crypto API. Formato salvo: "s2$<saltHex>$<hashHex>". */
function _bufToHex(buf){return Array.prototype.map.call(new Uint8Array(buf),function(b){return b.toString(16).padStart(2,'0');}).join('');}

function shSecure(pw){
  if(!(window.crypto&&crypto.subtle&&crypto.getRandomValues)){
    // Contexto sem Web Crypto (ex.: http:// não-seguro): usa o hash antigo
    // em vez de quebrar cadastro/login. Migra assim que possível.
    return Promise.resolve(sh(pw));
  }
  var saltHex=_bufToHex(crypto.getRandomValues(new Uint8Array(16)));
  var enc=new TextEncoder().encode(saltHex+':'+pw);
  return crypto.subtle.digest('SHA-256',enc).then(function(buf){return 's2$'+saltHex+'$'+_bufToHex(buf);});
}

function verifyPw(u,pw){
  var ph=(u&&u.ph)||'';
  if(ph.indexOf('s2$')===0){
    if(!(window.crypto&&crypto.subtle))return Promise.reject(new Error('crypto_unavailable'));
    var parts=ph.split('$'),saltHex=parts[1],hashHex=parts[2];
    var enc=new TextEncoder().encode(saltHex+':'+pw);
    return crypto.subtle.digest('SHA-256',enc).then(function(buf){return _bufToHex(buf)===hashHex;});
  }
  // Formato legado (DJB2) — aceito só pra permitir o upgrade automático
  // no primeiro login de contas criadas antes desta correção.
  return Promise.resolve(sh(pw)===ph);
}

// ============================================================
// PERMISSOES CENTRALIZADAS (TAREFA 4)
// Qualquer cargo cujo texto contenha uma destas palavras passa a ter
// o MESMO nivel de acesso do Administrador (telas, relatorios,
// edicao de outros usuarios). Para dar acesso de admin a um novo
// cargo no futuro, basta acrescentar a palavra aqui — nao espalhe
// "if(S.role==='adm')" pelo resto do codigo.
//
// ATUALIZACAO (hierarquia de cargos): Supervisor deixou de ter acesso
// total de ADM. Agora SOMENTE Gerente (e os sinonimos "Gestor",
// "Representante" e "Master") tem acesso administrativo completo.
// Supervisor passou a ser um nivel intermediario com acesso de "Time"
// (ve a equipe, mas nao gerencia usuarios nem ve metricas/feed globais).
// "Funcionário" fica no nivel basico (igual Consultor), sem funções de ADM.
//
// ATUALIZACAO 2 (pedido do usuario — Orientador = Supervisor): Orientador
// deixou de ser um nivel intermediario proprio (que so via os "orientados"
// configurados em u.orientadosIds) e passou a ser tratado como SINONIMO DE
// SUPERVISOR — mesmo nivel (3), mesmas telas, mesma visao de equipe completa
// (sem filtro por orientadosIds) e mesma ausencia de painel ADM. Feito aqui,
// na fonte de verdade (CARGO_NIVEIS), entao hasSupervisorAccess() e
// getVisibleOwnerIds() (patch v22) ja passam a tratar Orientador exatamente
// como Supervisor automaticamente, sem precisar mexer em cada tela.
// hasOrientadorAccess() (mais abaixo) fica sem efeito pratico, pois nenhum
// cargo mapeia mais para o nivel 2 — mantida so por compatibilidade com
// patches antigos que a chamam com verificacao typeof.
// ============================================================
var CARGOS_NIVEL_ADMIN=['gerente','gestor','representante','master'];

// ============================================================
// HIERARQUIA — CARGO_CAPS (Etapa 2 — 2026-07-23, aditivo)
// ------------------------------------------------------------
// Matriz de 3 dimensões (Cargo x Escopo x Ação) que ESPELHA a
// tabela public.cargo_caps criada em
// sql/migrations/migration_hierarquia_20260723.sql. Fonte de verdade do
// front-end para permissões — os wrappers legados
// (hasAdminAccess / hasSupervisorAccess) consultam essa matriz
// internamente, mas mantêm sua assinatura original para não
// quebrar patches antigos e o resto do código.
//
// Dimensões:
//   escopo:  'self' | 'team' | 'department' | 'global'
//   leads:   'none' | 'remind' | 'read' | 'crud'
//   negocios:'none' | 'remind' | 'read' | 'crud'
//   foreign: 'none' | 'read'   | 'remind' | 'edit'
//            (o que este cargo pode fazer em cards de OUTROS
//             usuários dentro do seu escopo)
//   stageGated: true = restringe ações a etapas específicas do funil
//   adminUI: acesso ao Painel ADM (mesmo comportamento do checkbox
//            u.admExtra + cargos do CARGOS_NIVEL_ADMIN)
//   supervisorUI: aba "Time" (visão de equipe, sem panel ADM)
//
// Regra aditiva: NÃO remover nem renomear CARGO_NIVEIS,
// CARGOS_NIVEL_ADMIN, getCargoNivel, hasSupervisorAccess,
// hasAdminAccess ou qualquer símbolo já exportado. Este bloco é
// puro acréscimo — as funções antigas continuam funcionando
// exatamente como antes para os cargos históricos.
// ============================================================
var CARGO_CAPS={
  // Consultor / Funcionário — trabalha só nos próprios cards
  consultor:      { escopo:'self',   leads:'crud', negocios:'crud', foreign:'none',   stageGated:false, adminUI:false, supervisorUI:false },
  funcionario:    { escopo:'self',   leads:'crud', negocios:'crud', foreign:'none',   stageGated:false, adminUI:false, supervisorUI:false },
  // Orientador e Supervisor — visão de equipe, read-only cross-user (mantém patch v1)
  /* FIX (2026-08-03): orientador rebaixado — decisão de negócio
     confirmada: não deve mais ter visão de equipe (nem antes, nem
     depois de estar num departamento). Passa a se comportar
     exatamente como consultor. Mantido como linha própria (não
     apontando pra CARGO_CAPS.consultor por referência) para ficar
     explícito na leitura, mesmo repetindo os valores. */
  orientador:     { escopo:'self',   leads:'crud', negocios:'crud', foreign:'none',   stageGated:false, adminUI:false, supervisorUI:false },
  // FIX (2026-08-03): supervisor.foreign era 'read' (só visualizava
  // cards de outros membros do time, nunca editava). Decisão
  // confirmada: supervisor DEVE poder editar leads de quem o ADM
  // colocou no mesmo departamento — não é mais só leitura. O que
  // continua controlando QUEM ele vê/edita é o departamento
  // (getDepartmentVisibleUsers/team_id), não este campo — este campo
  // só diz "se ele vê alguém do time, pode editar ou só olhar".
  supervisor:     { escopo:'team',   leads:'crud', negocios:'crud', foreign:'edit',   stageGated:false, adminUI:false, supervisorUI:true  },
  // Administrativo — SÓ negócios (leads bloqueado). Novo cargo introduzido pela Etapa 3.
  administrativo: { escopo:'self',   leads:'none', negocios:'crud', foreign:'none',   stageGated:false, adminUI:false, supervisorUI:false },
  // Gerente / Gestor — time inteiro, podem EDITAR peers do mesmo time (Etapa 4)
  gerente:        { escopo:'team',   leads:'crud', negocios:'crud', foreign:'edit',   stageGated:false, adminUI:true,  supervisorUI:true  },
  gestor:         { escopo:'team',   leads:'crud', negocios:'crud', foreign:'edit',   stageGated:false, adminUI:true,  supervisorUI:true  },
  // Representante / Master — escopo global
  representante:  { escopo:'global', leads:'crud', negocios:'crud', foreign:'edit',   stageGated:false, adminUI:true,  supervisorUI:true  },
  master:         { escopo:'global', leads:'crud', negocios:'crud', foreign:'edit',   stageGated:false, adminUI:true,  supervisorUI:true  }
};

// Default seguro: qualquer cargo desconhecido cai em CAPS mínimas
// (self + crud nos próprios cards, sem UI privilegiada).
var CARGO_CAPS_DEFAULT={ escopo:'self', leads:'crud', negocios:'crud', foreign:'none', stageGated:false, adminUI:false, supervisorUI:false };

/* ============================================================
   Op-4 (2026-07-23) — Consumir `user.cargoCodigo` / `user.userUuid`
   diretamente do /login e /refresh (aditivo).

   O backend (Etapas 6.1/6.2) já devolve em `res.data.user`:
     { id, email, role, nome, cargo, cargoCodigo, admExtra,
       userUuid?, source }
   A partir de agora o front persiste esses campos em `S` (lf6_s)
   e usa `cargoCodigo` como fonte AUTORITATIVA para resolver
   CARGO_CAPS — só cai em `_lfNormalizeCargoCode(u.cargo)` quando
   o claim estiver ausente (usuário logado antes desta versão).

   Regras:
   - Puramente aditivo. Nenhuma função existente foi renomeada,
     removida ou teve sua assinatura alterada.
   - `_lfNormalizeCargoCode(cargo)` continua sendo a segunda linha
     de defesa — TODOS os testes anteriores continuam passando.
   - `_lfCoerceCargoCode(code)` sanitiza o valor vindo do JWT (só
     aceita chaves conhecidas do CARGO_CAPS) para evitar que um
     claim adulterado promova para um cargo inexistente.
   ============================================================ */
function _lfCoerceCargoCode(code){
  if(!code) return null;
  var k=(''+code).toLowerCase().trim();
  return (Object.prototype.hasOwnProperty.call(CARGO_CAPS,k)) ? k : null;
}

/* Copia os campos autoritativos (cargoCodigo, admExtra, userUuid,
   cargo) do payload `user` do /login|/refresh|/session pra dentro
   de S, sem sobrescrever campos existentes com null/undefined.
   Retorna true se algum campo mudou (pra caller decidir se re-persiste). */
function _lfHydrateSessionFromAuthUser(target,wu){
  if(!target||!wu) return false;
  var changed=false;
  // cargoCodigo: só aceita chaves conhecidas do CARGO_CAPS.
  if(typeof wu.cargoCodigo==='string'){
    var cc=_lfCoerceCargoCode(wu.cargoCodigo);
    if(cc && target.cargoCodigo!==cc){ target.cargoCodigo=cc; changed=true; }
  }
  if(typeof wu.cargo==='string' && wu.cargo && target.cargo!==wu.cargo){
    target.cargo=wu.cargo; changed=true;
  }
  if(typeof wu.admExtra==='boolean' && target.admExtra!==wu.admExtra){
    target.admExtra=wu.admExtra; changed=true;
  }
  if(typeof wu.userUuid==='string' && wu.userUuid && target.userUuid!==wu.userUuid){
    target.userUuid=wu.userUuid; changed=true;
  }
  // FIX (2026-08-03) — necessário pro LF_SCOPE_V2 e pra aba "Time"
  // saberem, no cliente, se o usuário está num departamento (via
  // team_id -> teams.departamento_id, resolvido no backend no
  // momento do login/refresh — ver tokens.js/login-service.js).
  if(typeof wu.teamId==='string' && wu.teamId && target.teamId!==wu.teamId){
    target.teamId=wu.teamId; changed=true;
  }
  if(typeof wu.departamentoId==='string' && wu.departamentoId && target.departamentoId!==wu.departamentoId){
    target.departamentoId=wu.departamentoId; changed=true;
  }
  return changed;
}

/* Fonte autoritativa de cargoCodigo pro front:
   1) `u.cargoCodigo` (vem de getUser() se algum lugar já hidratou);
   2) `S.cargoCodigo` quando o `u` sob análise é o próprio usuário
      logado (payload do /login|/refresh);
   3) fallback textual `_lfNormalizeCargoCode(u.cargo)`.

   Nunca joga exceção: em caso de falha retorna null (caller cai
   no CARGO_CAPS_DEFAULT, exatamente como antes do Op-4). */
function _lfReadCargoCodeAuthoritative(u,uid){
  try{
    if(u){
      var direct=_lfCoerceCargoCode(u.cargoCodigo);
      if(direct) return direct;
    }
    if(S && S.userId && (!uid || uid===S.userId)){
      var fromS=_lfCoerceCargoCode(S.cargoCodigo);
      if(fromS) return fromS;
    }
    return u ? _lfNormalizeCargoCode(u.cargo) : null;
  }catch(_e){ return null; }
}

/* Normaliza a string de cargo (u.cargo) para uma chave de CARGO_CAPS.
   Casa por substring — mantém tolerância a cargos livres cadastrados
   como "Gerente Comercial", "Supervisor de Vendas", etc. */
function _lfNormalizeCargoCode(cargoRaw){
  var c=(cargoRaw||'').toString().toLowerCase();
  if(!c) return null;
  // Ordem: mais específicos antes dos genéricos. "administrativo" tem que
  // ser testado ANTES de qualquer match que possa colidir.
  var order=['master','representante','gerente','gestor','administrativo','supervisor','orientador','funcionario','funcionário','consultor'];
  for(var i=0;i<order.length;i++){
    if(c.indexOf(order[i])>=0){
      // funcionário/funcionario -> chave 'funcionario' (sem acento) no CARGO_CAPS
      return order[i]==='funcionário' ? 'funcionario' : order[i];
    }
  }
  return null;
}

/* Retorna o objeto CARGO_CAPS efetivo para o usuário. Nunca retorna
   null — em caso de qualquer falha cai no CARGO_CAPS_DEFAULT.
   Preserva o mesmo fallback "pós-login sem cache" que hasAdminAccess()
   já usa (S.role==='adm' quando getUser(uid) ainda não hidratou). */
function getCargoCaps(uid){
  try{
    uid=uid||(S?S.userId:null);
    if(!uid) return CARGO_CAPS_DEFAULT;
    if(uid==='adm') return CARGO_CAPS.master;
    var u=(typeof getUser==='function') ? getUser(uid) : null;
    if(!u){
      // CORREÇÃO (2026-07-23): enquanto o cache local de usuários ainda não
      // chegou, usa os claims autoritativos do login/refresh para o PRÓPRIO
      // usuário logado. Antes disso, Gerente/Supervisor caíam no default self
      // temporariamente e enxergavam só os próprios leads/negócios.
      if(S&&S.userId===uid){
        if(S.role==='adm') return CARGO_CAPS.master;
        var sCode=_lfCoerceCargoCode(S.cargoCodigo)||_lfNormalizeCargoCode(S.cargo);
        var sBase=(sCode && CARGO_CAPS[sCode]) ? CARGO_CAPS[sCode] : CARGO_CAPS_DEFAULT;
        var sAdmExtra=(typeof S.admExtra==='boolean') ? S.admExtra : false;
        if(sAdmExtra && !sBase.adminUI){
          return { escopo:sBase.escopo, leads:sBase.leads, negocios:sBase.negocios,
                   foreign:sBase.foreign, stageGated:sBase.stageGated,
                   adminUI:true, supervisorUI:true };
        }
        return sBase;
      }
      return CARGO_CAPS_DEFAULT;
    }
    if(u.role==='adm') return CARGO_CAPS.master;
    // Op-4 (2026-07-23): consulta cargoCodigo autoritativo
    // (u.cargoCodigo -> S.cargoCodigo -> _lfNormalizeCargoCode(u.cargo)).
    // Comportamento anterior é preservado: se nenhum dos dois primeiros
    // caminhos resolveu, `_lfReadCargoCodeAuthoritative` cai no mesmo
    // `_lfNormalizeCargoCode(u.cargo)` de antes.
    var code=_lfReadCargoCodeAuthoritative(u,uid);
    var base=(code && CARGO_CAPS[code]) ? CARGO_CAPS[code] : CARGO_CAPS_DEFAULT;
    // admExtra: prefere `S.admExtra` do JWT quando é o próprio usuário
    // logado (fonte autoritativa pós-Op-3/6.2). Cai em `u.admExtra`
    // (cache local) caso contrário — mesma semântica de antes.
    var admExtraEff = u.admExtra;
    if(S && S.userId && (!uid || uid===S.userId) && typeof S.admExtra==='boolean'){
      admExtraEff = S.admExtra;
    }
    if(admExtraEff && !base.adminUI){
      // Cópia rasa para não mutar o objeto global.
      return { escopo:base.escopo, leads:base.leads, negocios:base.negocios,
               foreign:base.foreign, stageGated:base.stageGated,
               adminUI:true, supervisorUI:true };
    }
    return base;
  }catch(_e){
    return CARGO_CAPS_DEFAULT;
  }
}

/* true se o usuário PODE editar um item de OUTRO usuário (dentro do
   seu escopo). Usado pelos patches novos (etapa 4 — gerente peers-edit).
   `item` é opcional: se passado com .ownerId, verifica também escopo
   (self bloqueia mesmo com foreign=edit).
   Regra: foreign==='edit'. Cargo com escopo=self NUNCA edita foreign
   (mesmo que foreign esteja marcado — não faz sentido). */
function canEditForeign(uid,item){
  var caps=getCargoCaps(uid);
  if(!caps || caps.foreign!=='edit') return false;
  if(caps.escopo==='self') return false;
  if(item && item.ownerId){
    var myId=uid||(S?S.userId:null);
    if(item.ownerId===myId) return true; // próprio card sempre editável
  }
  return true;
}

/* true se o usuário SÓ PODE mandar lembrete (não editar) em card de
   outro usuário. Usado pelo patch de supervisor (read-only cross-user
   com botão "Lembrar"). */
function canOnlyRemindForeign(uid,item){
  var caps=getCargoCaps(uid);
  if(!caps) return false;
  if(caps.foreign==='edit') return false; // pode mais que lembrar
  if(item && item.ownerId){
    var myId=uid||(S?S.userId:null);
    if(item.ownerId===myId) return false; // é o próprio card, ignora
  }
  return caps.foreign==='remind' || caps.foreign==='read';
}

/* true se o cargo tem restrição por etapa de funil (stageGated).
   Hoje nenhum cargo do plano tem stageGated=true, mas a função
   existe para o backend authz.js (Etapa 6) e para uso futuro. */
function isStageGated(uid,stage){
  var caps=getCargoCaps(uid);
  if(!caps || !caps.stageGated) return false;
  // Sem lista de stages permitidas por enquanto — retorna true para
  // qualquer stage (comportamento conservador). Ajuste futuro quando
  // o documento oficial definir a lista.
  return true;
}

// Expõe no window para os patches (mesmo padrão dos outros helpers).
try{
  window.CARGO_CAPS=CARGO_CAPS;
  window.CARGO_CAPS_DEFAULT=CARGO_CAPS_DEFAULT;
  window.getCargoCaps=getCargoCaps;
  window.canEditForeign=canEditForeign;
  window.canOnlyRemindForeign=canOnlyRemindForeign;
  window.isStageGated=isStageGated;
}catch(_e){}


// Hierarquia de cargos. Quanto maior o nivel, mais acesso.
// 1=Consultor/Funcionário, 2=(nao usado mais — ver nota acima),
// 3=Supervisor e Orientador (mesmas funcoes: ve a equipe do mesmo time,
// mas SEM painel ADM),
// 4=Gerente/Gestor/Representante/Master (acesso total, igual ADM), 5=ADM (nivel maximo).
var CARGO_NIVEIS=[
  {nivel:1,match:['consultor','funcionário','funcionario']},
  {nivel:3,match:['supervisor','orientador']},
  {nivel:4,match:['gerente','gestor','representante','master']}
];

/* Retorna o nivel numerico do cargo do usuario. ADM sempre é o nível máximo (5).
   Cargos nao reconhecidos caem no nivel 1 (acesso basico), por seguranca. */
function getCargoNivel(uid){
  uid=uid||(S?S.userId:null);if(!uid)return 1;
  if(uid==='adm')return 5;
  var u=getUser(uid);
  if(!u){
    // CORREÇÃO (2026-07-23): quando o cache local de usuários ainda não hidratou,
    // não podemos derrubar Gerente/Supervisor para o nível básico. Usa os claims já
    // confirmados no login/refresh (S.cargoCodigo / S.cargo / S.admExtra) para o
    // PRÓPRIO usuário logado, mantendo o fallback histórico para uid externos.
    if(S&&S.userId===uid){
      if(S.role==='adm')return 5;
      var sCode=_lfCoerceCargoCode(S.cargoCodigo)||_lfNormalizeCargoCode(S.cargo);
      if(sCode==='master'||sCode==='representante')return 5;
      if(sCode==='gerente'||sCode==='gestor')return 4;
      if(sCode==='supervisor'||sCode==='orientador')return 3;
      return 1;
    }
    return 1;
  }
  if(u.role==='adm')return 5;
  var c=(u.cargo||'').toLowerCase();
  for(var i=CARGO_NIVEIS.length-1;i>=0;i--){
    if(CARGO_NIVEIS[i].match.some(function(k){return c.indexOf(k)>=0;}))return CARGO_NIVEIS[i].nivel;
  }
  return 1;
}

/* true para Supervisor, Gerente e ADM (nivel >= 3). Usado para a aba "Time" e para
   permissoes intermediarias (ex: reatribuir agendamentos) que o Supervisor tambem tem.

   WRAPPER DE COMPATIBILIDADE (Etapa 2 — hierarquia 2026-07-23):
   internamente consulta getCargoCaps().supervisorUI — mas mantém o
   fallback via getCargoNivel() para os cargos históricos, garantindo
   que 'adm', 'gerente', 'gestor', 'representante', 'master',
   'supervisor' e 'orientador' continuem retornando true exatamente
   como antes. */
function hasSupervisorAccess(uid){
  try{
    var caps=getCargoCaps(uid);
    if(caps && (caps.supervisorUI || caps.adminUI)) return true;
  }catch(_e){}
  // Fallback histórico — nunca reduz acesso, só complementa.
  return getCargoNivel(uid)>=3;
}

/* HISTORICO: Orientador já foi um nivel intermediário próprio (entre
   Consultor=1 e Supervisor=3), com acesso limitado aos "orientados"
   configurados em u.orientadosIds[].
   ATUALIZACAO (pedido do usuario): Orientador agora tem as MESMAS funções
   de Supervisor — CARGO_NIVEIS mapeia 'orientador' direto pro nivel 3 (ver
   acima), então hasSupervisorAccess() já retorna true pra Orientador e
   getVisibleOwnerIds() (patch v22) já retorna "sem filtro" (vê a equipe
   inteira, não só orientadosIds) antes mesmo de chegar aqui.
   Por isso esta função nunca mais retorna true na prática (nenhum cargo
   mapeia pro nivel 2) — mantida apenas para não quebrar patches antigos que
   a chamam com verificação typeof==='function'. */
function hasOrientadorAccess(uid){
  uid=uid||(S?S.userId:null);if(!uid)return false;
  if(uid==='adm')return false;
  var u=getUser(uid);if(!u)return false;
  if(u.role==='adm')return false;
  return getCargoNivel(uid)===2;
}

/* Retorna a lista (sempre array) de UIDs que ESTE usuario orienta.
   Lê o campo u.orientadosIds salvo no doc local. Se vazio, retorna []. */
function getOrientadosIds(uid){
  uid=uid||(S?S.userId:null);if(!uid)return [];
  var u=getUser(uid);if(!u)return [];
  var arr=Array.isArray(u.orientadosIds)?u.orientadosIds:[];
  return arr.filter(Boolean);
}

/* Filtro utilitario: dado um array de objetos com .ownerId ou .uid,
   retorna so os que pertencem ao proprio usuario OU aos que ele orienta. */
function filterItemsForOrientador(items){
  if(!Array.isArray(items))return [];
  var myId=(S&&S.userId)||null;
  var orIds=getOrientadosIds(myId);
  if(!orIds.length)return items.filter(function(x){return x&&(x.ownerId===myId||x.uid===myId);});
  var allow=orIds.concat([myId]);
  return items.filter(function(x){return x&&allow.indexOf(x.ownerId||x.uid)>=0;});
}


/* Acesso completo ao Painel ADM (gerente/gestor/representante/master/adm
   + supervisor com u.admExtra=true).

   WRAPPER DE COMPATIBILIDADE (Etapa 2 — hierarquia 2026-07-23):
   internamente consulta getCargoCaps().adminUI (que já respeita
   u.admExtra e o fallback pós-login com S.role==='adm'). Mantém
   também o caminho antigo baseado em CARGOS_NIVEL_ADMIN como rede
   de segurança — garante que nenhum cargo histórico perca acesso
   se o CARGO_CAPS mapear algo diferente por engano. */
function hasAdminAccess(uid){
  uid=uid||(S?S.userId:null);if(!uid)return false;
  if(uid==='adm')return true;

  // Caminho novo: CARGO_CAPS. Já cobre o fallback pós-login
  // (S.role==='adm') e o admExtra dentro de getCargoCaps().
  try{
    var caps=getCargoCaps(uid);
    if(caps && caps.adminUI) return true;
  }catch(_e){}

  // Caminho legado — preservado para não quebrar cadastros existentes.
  var u=getUser(uid);
  if(!u){
    // CORREÇÃO (2026-07-17f): logo após um login novo (doLogin), a lista
    // local de usuários (lf6_u) ainda pode não ter sido baixada da nuvem
    // (loadUsersDB roda em paralelo/depois) — getUser(uid) retornava null
    // e hasAdminAccess() negava acesso de ADM mesmo pra quem tinha acabado
    // de logar como ADM de verdade (o Worker já confirmou isso no JWT).
    // Agora, sem registro local ainda, confiamos no role que já veio do
    // login (S.role) em vez de negar acesso por falta de cache.
    if(S&&S.userId===uid&&S.role==='adm')return true;
    return false;
  }
  if(u.role==='adm')return true;
  // u.admExtra: marcação manual histórica de acesso extra (a caixa
  // "Ativar acesso ao Painel ADM" que gravava este campo foi removida
  // em 2026-08-07 — acesso ADM agora vem exclusivamente de departamento
  // atribuído pelo Hudson — mas o campo em si continua sendo respeitado
  // aqui caso já esteja true em algum usuário de antes da remoção).
  if(u.admExtra)return true;
  var c=(u.cargo||'').toLowerCase();
  return CARGOS_NIVEL_ADMIN.some(function(k){return c.indexOf(k)>=0;});
}

/* 2026-08-07: toggleAdminNote() removida — mostrava a nota "cargo tem
   acesso automático ao Painel ADM" e a caixa manual de admExtra, ambas
   removidas dos 3 modais que a usavam (Novo Usuário, Editar Usuário,
   Credenciais/Cargo). Acesso ADM agora vem exclusivamente de
   departamento atribuído pelo Hudson — ver
   js/patches/scope/lf-cargo-only-via-departamento-v1-20260804.js. */

/* CORREÇÃO DE LENTIDÃO (mesmo princípio já aplicado à movimentação de cards no Kanban):
   antes, TODA busca/filtro/troca de aba na tela de Clientes esperava uma ida-e-volta ao
   Firestore antes de desenhar qualquer coisa — cada letra digitada na busca disparava uma
   consulta de rede, deixando a digitação "engasgada". Agora loadCli() é local-first: desenha
   IMEDIATAMENTE com o que já está salvo neste aparelho (instantâneo, sem rede) e, se estiver
   em modo nuvem, busca a versão mais recente em segundo plano e redesenha de novo somente
   quando a resposta chegar — sem bloquear a tela nem a digitação. */
// FASE 3.3 (parte 2): busca em segundo plano passa a preferir
// LiderCRM.api.workerClient.clientesList() (GET /api/v1/clientes/list)
// em vez de db.collection('clientes').doc(uid).get() — mesmo formato
// de documento ({ list, uid, ts }), só trocando o transporte. Fallback
// pro caminho antigo só se o Worker não estiver disponível.
function loadCli(uid,cb){
  var localList=getCliLocal(uid);
  var localSig=(window.__LF_PERF_R4&&window.__LF_PERF_R4.signature)?window.__LF_PERF_R4.signature(localList):JSON.stringify(localList);
  cb(localList);
  var root=window.LiderCRM;
  var wc=root&&root.api&&root.api.workerClient;
  var cfg=root&&root.config;
  function applyServerList(server){
    var merged=_mergeKeepLocalOnly(server,getCliLocal(uid));
    ss(ck(uid),merged);
    if(merged.length!==server.length)saveCli(uid,merged); // reenvia o(s) item(ns) local(is) que ainda não estavam no servidor
    var mergedSig=(window.__LF_PERF_R4&&window.__LF_PERF_R4.signature)?window.__LF_PERF_R4.signature(merged):JSON.stringify(merged);
    if(mergedSig!==localSig)cb(merged);
  }
  if(cfg&&cfg.useWorkerApi&&wc&&typeof wc.clientesList==='function'){
    wc.clientesList(uid).then(function(doc){applyServerList((doc&&doc.list)||[]);}).catch(function(e){console.warn("[auth] clientesList falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('clientes').doc(uid).get().then(function(d){
      applyServerList(d.exists?(d.data().list||[]):[]);
    }).catch(function(e){console.warn("[auth] loadCli firebase falhou",e);});
  }
}

// CORREÇÃO (auditoria, Etapa 5 — login/sessão): _loginAttempts/_loginLockUntil eram só
// variáveis em memória — um F5 na tela de login zerava o contador e o bloqueio de 30s,
// bastando recarregar a página pra "resetar" as tentativas. Agora o estado do lockout é
// persistido em localStorage (chave lf_login_lock) e recarregado no boot do script, então
// sobrevive a reload/fechar aba. (Limitação já documentada à parte: como é um app 100%
// client-side, alguém com acesso ao console do navegador ainda pode chamar verifyPw()
// diretamente e contornar qualquer lockout de UI — isso não é uma vulnerabilidade nova
// desta correção, é inerente a não ter um backend de autenticação.)
var _loginLockState=(function(){try{return JSON.parse(localStorage.getItem('lf_login_lock'))||{a:0,u:0};}catch(e){return {a:0,u:0};}})();

var _loginAttempts=_loginLockState.a||0,_loginLockUntil=_loginLockState.u||0;

function _persistLoginLock(){try{localStorage.setItem('lf_login_lock',JSON.stringify({a:_loginAttempts,u:_loginLockUntil}));}catch(e){}}


function _lfAuthUsuariosRuntime(){
  return ((((window.LiderCRM||{}).modules||{}).usuarios||{}).runtime)||{};
}

function _lfAuthResolveFn(name, legacyRef){
  if(typeof legacyRef==='function')return legacyRef;
  try{ if(typeof window[name]==='function') return window[name]; }catch(_e){}
  try{
    var rt=_lfAuthUsuariosRuntime();
    if(rt&&typeof rt[name]==='function') return rt[name];
  }catch(_e){}
  return null;
}

function _lfAuthGetUserSafe(uid){
  var fn=_lfAuthResolveFn('getUser',typeof getUser!=='undefined'?getUser:null);
  if(fn){
    try{return fn(uid)||null;}catch(_e){}
  }
  var listFn=_lfAuthResolveFn('getUsers',typeof getUsers!=='undefined'?getUsers:null);
  if(listFn){
    try{
      var list=listFn();
      if(Array.isArray(list)) return list.find(function(u){return u&&String(u.id)===String(uid);})||null;
    }catch(_e){}
  }
  return null;
}

function _lfAuthLoadUsersDBSafe(cb){
  var fn=_lfAuthResolveFn('loadUsersDB',typeof loadUsersDB!=='undefined'?loadUsersDB:null);
  if(typeof fn!=='function'){ if(typeof cb==='function') cb([]); return; }
  try{return fn(cb);}catch(_e){ if(typeof cb==='function') cb([]); }
}

function _lfAuthResolveWorkerClient(){
  try{
    var root=window.LiderCRM;
    var wc=root&&root.api&&root.api.workerClient;
    return (wc&&typeof wc.login==='function')?wc:null;
  }catch(_e){ return null; }
}

function _lfAuthWaitForWorkerClient(timeoutMs){
  timeoutMs=Math.max(0,timeoutMs||0);
  return new Promise(function(resolve){
    var started=Date.now();
    (function probe(){
      var wc=_lfAuthResolveWorkerClient();
      if(wc) return resolve(wc);
      if(Date.now()-started>=timeoutMs) return resolve(null);
      setTimeout(probe,120);
    })();
  });
}

// FASE 3.3 (2026-07-17): doLogin() deixou de ler/verificar a senha
// localmente via loadUsersDB()/verifyPw(). Agora chama diretamente
// POST /api/v1/login (LiderCRM.api.workerClient.login), que faz a
// dupla verificação no Worker (users legíveis de fs_documents, com
// fallback pra Supabase Auth) e devolve o JWT pronto.
//
// CORREÇÃO DE SEGURANÇA (pedido do usuário — melhorua_reforcado):
// REMOVIDO o fallback client-side (verifyPw(localUser,pw)) que
// permitia autenticar contra o hash da senha guardado em lf6_u no
// próprio navegador — esse caminho, combinado com a seed embutida
// do ADM (js/usuarios.js), fazia com que a senha padrão do bundle
// funcionasse mesmo sem o Worker responder. Agora o login SEMPRE
// exige o Worker: se o Worker não estiver acessível, o login falha
// (“Não foi possível entrar”) em vez de silenciosamente cair pra
// verificação local. sh()/shSecure()/verifyPw() continuam
// existindo só como formato de hash de referência usado em outros
// fluxos (ex.: assinar HMAC da ponte legada em /session/legacy-*).
//
// getUser(u.id) é usado só pra decorar o avatar com a cor (S.cor) já
// salva localmente — não influencia autenticação; se não houver
// registro local (ex.: primeiro login neste dispositivo), cai em 0.
function doLogin(){
  var now=Date.now();
  if(_loginLockUntil>now){var secs=Math.ceil((_loginLockUntil-now)/1000);
    document.getElementById('lerr').textContent='Muitas tentativas. Aguarde '+secs+'s.';return;}
  var em=(document.getElementById('le').value||'').trim().toLowerCase();
  var pw=document.getElementById('lp').value||'';
  var er=document.getElementById('lerr');er.textContent='';
  var btn=document.getElementById('btn-login');
  if(!em||!pw){er.textContent='Preencha e-mail e senha.';return;}
  btn.textContent='Entrando...';btn.disabled=true;

  _lfAuthWaitForWorkerClient(1500).then(function(wc){
    if(!wc||typeof wc.login!=='function'){
      btn.textContent='Entrar';btn.disabled=false;
      er.textContent='Serviço de autenticação indisponível. Tente novamente em instantes.';return;
    }
    return wc.login(em,pw).then(function(res){
      btn.textContent='Entrar';btn.disabled=false;
      var wu=res&&res.ok&&res.data&&res.data.data&&res.data.data.user;
      if(!wu){
        _loginAttempts++;
        if(_loginAttempts>=5){_loginLockUntil=Date.now()+30000;_loginAttempts=0;_persistLoginLock();er.textContent='Muitas tentativas. Aguarde 30s.';return;}
        _persistLoginLock();
        er.textContent=(res&&res.data&&res.data.error&&res.data.error.message)||'E-mail ou senha inválidos.';return;
      }
      _loginAttempts=0;_loginLockUntil=0;_persistLoginLock();
      var lu=_lfAuthGetUserSafe(wu.id);
      S={userId:wu.id,role:wu.role||(lu&&lu.role)||'user',nome:wu.nome||(lu&&lu.nome)||'',email:wu.email||em,cor:(lu&&lu.cor)||0};
      // Op-4 (2026-07-23): persiste cargoCodigo/userUuid/admExtra/cargo
      // autoritativos vindos do /login. Puro aditivo — sessions antigas
      // (sem esses campos) continuam funcionando via fallback textual.
      _lfHydrateSessionFromAuthUser(S,wu);
      ss('lf6_s',S);startApp();
      if(typeof loadUsersDB==='function'){
        _lfAuthLoadUsersDBSafe(function(){ try{ if(typeof renderUsers==='function') renderUsers(); }catch(e){} try{ if(typeof buildNav==='function') buildNav(); }catch(e){} });
      }
    });
  }).catch(function(){
    btn.textContent='Entrar';btn.disabled=false;
    er.textContent='Não foi possível entrar. Verifique sua conexão e tente novamente.';
  });
}

function _execLogout(){
  if(typeof agdStopListening==='function')agdStopListening();
  if(window._actInterval){clearInterval(window._actInterval);window._actInterval=null;}
  if(window._sessInterval){clearInterval(window._sessInterval);window._sessInterval=null;}
  if(window._ntfInterval){clearInterval(window._ntfInterval);window._ntfInterval=null;}
  if(window._autoEngineInterval){clearInterval(window._autoEngineInterval);window._autoEngineInterval=null;}
  if(typeof _chatPollTimer!=='undefined'&&_chatPollTimer){clearInterval(_chatPollTimer);_chatPollTimer=null;}
  if(typeof _chatCurrentConv!=='undefined')_chatCurrentConv=null;
  if(typeof _actAlertTimers!=='undefined'){Object.keys(_actAlertTimers).forEach(function(k){clearTimeout(_actAlertTimers[k]);});_actAlertTimers={};}
  if(typeof clearBulk==='function')clearBulk();
  if(typeof _mbStageFilter!=='undefined'){_mbStageFilter={leads:null,negocios:null};}
  _tlOwnerUid=null;_tlCid=null;_dcId=null;_duId=null;_kbDetId=null;_kbDetBoard=null;_kbDetOwnerUid=null;
  // Fecha todos os modais abertos e restaura scroll do body
  document.querySelectorAll('.mo.open').forEach(function(m){m.classList.remove('open');});
  document.body.style.overflow='';document.body.style.position='';document.body.style.width='';document.body.style.top='';
  S=null;try{localStorage.removeItem('lf6_s');}catch(e){}
  document.getElementById('app').classList.remove('vis');
  document.getElementById('login-screen').classList.add('vis');
  document.getElementById('le').value='';document.getElementById('lp').value='';
}

function doLogout(){
  // Confirmação via toast customizado (evita confirm() nativo bloqueado em iOS PWA)
  var t=document.getElementById('toast'),tm=document.getElementById('tmsg');
  if(t&&tm){
    clearTimeout(t._tm);clearTimeout(t._confirmTm);
    tm.innerHTML='Sair da conta? <button id="toast-logout-btn" style="margin-left:8px;padding:2px 9px;border-radius:6px;border:none;background:var(--red);color:#fff;font-size:.75rem;cursor:pointer;font-family:Outfit,sans-serif">Sair</button>';
    var btn=document.getElementById('toast-logout-btn');
    if(btn){btn.addEventListener('click',function(){clearTimeout(t._confirmTm);t.classList.remove('show');_execLogout();},{once:true});}
    t.classList.add('show');
    t._confirmTm=setTimeout(function(){t.classList.remove('show');tm.textContent='';},4000);
  } else {
    _execLogout();
  }
}

function checkSes(){var s=sg('lf6_s');if(!s)return false;var u=_lfAuthGetUserSafe(s.userId);if(!u){S=s;return true;}if(u.ativo===false){try{localStorage.removeItem('lf6_s');}catch(e){}return false;}S=s;return true;}

/* Op-4 (2026-07-23) — helper público chamado pelo bootstrap da
   sessão (js/app.js) quando restauramos S de localStorage e/ou
   consumimos a resposta de /session ou /session/refresh (silent
   refresh feito pelo httpClient).

   Aceita o objeto `user` do payload (`data.user` da resposta) e
   hidrata os campos autoritativos em S. Persiste em lf6_s só se
   algo mudou. Nunca joga exceção.

   Retorna true se algo mudou (útil pra testes). */
function lfSyncSessionFromAuthUser(wu){
  try{
    if(!S || !wu) return false;
    // Só hidrata se for o mesmo usuário logado.
    if(wu.id && S.userId && wu.id!==S.userId) return false;
    var changed=_lfHydrateSessionFromAuthUser(S,wu);
    if(changed){ try{ ss('lf6_s',S); }catch(_e){} }
    return changed;
  }catch(_e){ return false; }
}
try{ if(typeof window!=='undefined'){ window.lfSyncSessionFromAuthUser=lfSyncSessionFromAuthUser; window._lfReadCargoCodeAuthoritative=_lfReadCargoCodeAuthoritative; window._lfCoerceCargoCode=_lfCoerceCargoCode; window._lfHydrateSessionFromAuthUser=_lfHydrateSessionFromAuthUser; } }catch(_e){}

function getMyRole(){return hasAdminAccess()?'gestor':'consultor';}
