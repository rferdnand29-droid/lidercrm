#!/usr/bin/env bash
set -euo pipefail

# =====================================================================
# apply-fix-crm-edit-leads-20260804.sh
# ---------------------------------------------------------------------
# Objetivo:
#   Corrigir a causa raiz do travamento/403 ao editar leads, SEM depender
#   dos patches tardios que apenas mascaram o sintoma.
#
# O script altera somente 2 arquivos canônicos:
#   1) js/kanban.js
#   2) _worker_src/worker/controllers/kanban-controller.js
#
# O que ele corrige:
#   A) para de varrer TODOS os usuários ativos no kanban de leads quando o
#      perfil não é ADM global; passa a respeitar o escopo real.
#   B) troca gates baseados em hasAdminAccess() por canEditForeign() no
#      fluxo de abrir/editar lead alheio.
#   C) alinha o Worker com o contrato já usado pelo front: quem tem
#      foreign='edit' + escopo!='self' pode ler/gravar kanban alheio.
#
# Uso:
#   ./apply-fix-crm-edit-leads-20260804.sh /caminho/do/projeto
# =====================================================================

ROOT="${1:-.}"
KANBAN="$ROOT/js/kanban.js"
CTRL="$ROOT/_worker_src/worker/controllers/kanban-controller.js"

for f in "$KANBAN" "$CTRL"; do
  if [[ ! -f "$f" ]]; then
    echo "[erro] arquivo não encontrado: $f" >&2
    exit 1
  fi
  cp -n "$f" "$f.bak-20260804" || true
done

node - "$KANBAN" "$CTRL" <<'NODE'
const fs = require('fs');
const [kanbanPath, ctrlPath] = process.argv.slice(2);

function patchFile(path, edits){
  let src = fs.readFileSync(path, 'utf8');
  for (const edit of edits){
    if (src.includes(edit.marker)) continue;
    if (!src.includes(edit.find)) {
      throw new Error(`Trecho não encontrado em ${path}: ${edit.name}`);
    }
    src = src.replace(edit.find, edit.replace);
  }
  fs.writeFileSync(path, src, 'utf8');
}

patchFile(kanbanPath, [
  {
    name: 'pool visível escopado',
    marker: 'LF-KB-SCOPED-POOL-20260804',
    find: `function _kbAllVisibleUserPool(){\n  var users=getUsers().filter(function(u){return u&&u.ativo;});\n  if(S&&S.userId&&!users.find(function(u){return u.id===S.userId;})){\n    users.push({id:S.userId,nome:(S.nome||S.userId),ativo:true});\n  }\n  return users;\n}`,
    replace: `/* LF-KB-SCOPED-POOL-20260804\n   Corrige a causa raiz do fan-out indevido: antes qualquer usuário não-ADM\n   percorria TODOS os usuários ativos, o que disparava GET /kanban/list para\n   owners fora do escopo e gerava cascata de 403/travamento. Agora o pool é\n   derivado da função já autoritativa de escopo (getDepartmentVisibleUsers). */\nfunction _kbAllVisibleUserPool(){\n  var me=(S&&S.userId)||'';\n  var users=[];\n  try{\n    if(typeof getDepartmentVisibleUsers==='function'){\n      users=getDepartmentVisibleUsers(me)||[];\n    }\n  }catch(_e){ users=[]; }\n  if(!Array.isArray(users)||!users.length){\n    var self=(typeof getUser==='function'&&me)?getUser(me):null;\n    users=self?[self]:[];\n  }\n  if(S&&S.userId&&!users.find(function(u){return u&&u.id===S.userId;})){\n    users.unshift({id:S.userId,nome:(S.nome||S.userId),ativo:true});\n  }\n  var seen={};\n  return users.filter(function(u){\n    if(!u||!u.id||u.ativo===false) return false;\n    if(seen[u.id]) return false;\n    seen[u.id]=1;\n    return true;\n  });\n}`
  },
  {
    name: 'helper de permissão canEditForeign',
    marker: 'LF-KB-FOREIGN-EDIT-GATE-20260804',
    find: `function saveActive(b,list){var u=activeUID(b);if(u===(S&&S.userId))return saveKB(b,list);return saveKBFor(b,u,list);}\n`,
    replace: `function saveActive(b,list){var u=activeUID(b);if(u===(S&&S.userId))return saveKB(b,list);return saveKBFor(b,u,list);}\n\n/* LF-KB-FOREIGN-EDIT-GATE-20260804\n   Fonte única para decidir se o usuário logado pode abrir/editar um card de\n   outro owner no Kanban canônico. Evita depender de hasAdminAccess(), que\n   deixou de significar \"pode editar foreign\" depois da regra cargo+departamento. */\nfunction _kbCanEditOwner(board,ownerUid){\n  var me=(S&&S.userId)||'';\n  if(!me) return false;\n  if(!ownerUid||ownerUid===me) return true;\n  try{\n    if(typeof hasAdminAccess==='function'&&hasAdminAccess(me)) return true;\n  }catch(_e){}\n  try{\n    if(typeof canEditForeign==='function') return !!canEditForeign(me,{ownerId:ownerUid,board:board});\n  }catch(_e){}\n  return false;\n}\n`
  },
  {
    name: 'sync de livre pool sem fan-out 403',
    marker: 'LF-KB-SYNC-SCOPED-20260804',
    find: `    if(board==='leads'&&!hasAdminAccess()){\n      var _pool=_kbAllVisibleUserPool();\n      var _pendingUserSync=_pool.length;\n      if(!_pendingUserSync)return;\n      _pool.forEach(function(u){\n        fetchDoc(u.id).then(function(server){\n          var merged=_mergeKeepLocalOnly(server,getKBFor(board,u.id));\n          ss(kbKeyFor(board,u.id),merged);\n          if(merged.length!==server.length)saveKBFor(board,u.id,merged);\n          if(S&&u.id===S.userId){runAutomationEngine(board,getKBFor(board,u.id),u.id);_autoMoveStaleToLivre(board,getKBFor(board,u.id),u.id);}\n        }).catch(function(e){console.warn("[kb] sync livre pool falhou",e);syncErr&&syncErr(e);}).then(function(){\n          _pendingUserSync--;\n          if(_pendingUserSync<=0)renderKBLocal(board);\n        });\n      });\n    } else {`,
    replace: `    if(board==='leads'&&!hasAdminAccess()){\n      /* LF-KB-SYNC-SCOPED-20260804\n         Antes este ramo sincronizava TODOS os usuários ativos. Com a regra\n         cargo/departamento isso virou tempestade de 403. Agora sincroniza\n         apenas o pool já escopado e só faz PUT remoto quando o owner é\n         realmente editável pelo usuário atual. */\n      var _pool=_kbAllVisibleUserPool();\n      var _pendingUserSync=_pool.length;\n      if(!_pendingUserSync)return;\n      _pool.forEach(function(u){\n        fetchDoc(u.id).then(function(server){\n          var merged=_mergeKeepLocalOnly(server,getKBFor(board,u.id));\n          ss(kbKeyFor(board,u.id),merged);\n          if(merged.length!==server.length&&_kbCanEditOwner(board,u.id))saveKBFor(board,u.id,merged);\n          if(S&&u.id===S.userId){runAutomationEngine(board,getKBFor(board,u.id),u.id);_autoMoveStaleToLivre(board,getKBFor(board,u.id),u.id);}\n        }).catch(function(e){console.warn("[kb] sync livre pool falhou",e);syncErr&&syncErr(e);}).then(function(){\n          _pendingUserSync--;\n          if(_pendingUserSync<=0)renderKBLocal(board);\n        });\n      });\n    } else {`
  },
  {
    name: 'card readonly usa canEditForeign',
    marker: 'LF-KB-CARD-RO-20260804',
    find: `  var _foreignVisibleLead=(board==='leads'&&effOwnerUid&&S&&effOwnerUid!==S.userId&&!hasAdminAccess());\n`,
    replace: `  /* LF-KB-CARD-RO-20260804 */\n  var _foreignVisibleLead=(board==='leads'&&effOwnerUid&&S&&effOwnerUid!==S.userId&&!_kbCanEditOwner(board,effOwnerUid));\n`
  },
  {
    name: 'detalhe readonly usa canEditForeign',
    marker: 'LF-KB-DET-RO-20260804',
    find: `  var limitedForeignAccess=(!readOnly&&!hasAdminAccess()&&uid&&S&&uid!==S.userId);\n`,
    replace: `  /* LF-KB-DET-RO-20260804 */\n  var limitedForeignAccess=(!readOnly&&uid&&S&&uid!==S.userId&&!_kbCanEditOwner(board,uid));\n`
  }
]);

patchFile(ctrlPath, [
  {
    name: 'helper cross-owner kanban permission',
    marker: 'LF-KANBAN-CROSS-OWNER-20260804',
    find: `// ------- helpers de ownership (espelha clientes-controller r3) ---------\nfunction assertKanbanReadOwner(uid, user, caps) {\n`,
    replace: `// ------- helpers de ownership (espelha clientes-controller r3) ---------\n/* LF-KANBAN-CROSS-OWNER-20260804\n   Alinha o Worker ao contrato já usado pelo front canônico após a regra\n   cargo+departamento: quem tem foreign='edit' e escopo != 'self' pode atuar\n   em kanban de owner alheio. Observação: isso mantém a semântica já vigente\n   no cliente; um hardening futuro pode restringir ainda mais por departamento\n   no servidor, caso o projeto exponha essa relação de forma autoritativa aqui. */\nfunction canCrossOwnerKanban(caps) {\n  return !!(caps && caps.foreign === 'edit' && caps.escopo && caps.escopo !== 'self');\n}\n\nfunction assertKanbanReadOwner(uid, user, caps) {\n`
  },
  {
    name: 'read owner gate alinhado',
    marker: 'LF-KANBAN-READ-GATE-20260804',
    find: `  // Gerente/gestor/master (escopo=global) pode LER kanban de outrem\n  // para auditoria (mesma justificativa que _syncKBRemoteBG usa).\n  if (caps && caps.escopo === 'global') return true;\n`,
    replace: `  // LF-KANBAN-READ-GATE-20260804\n  // Leitura cross-owner: global OU foreign-edit fora de self.\n  if (caps && caps.escopo === 'global') return true;\n  if (canCrossOwnerKanban(caps)) return true;\n`
  },
  {
    name: 'write owner gate alinhado',
    marker: 'LF-KANBAN-WRITE-GATE-20260804',
    find: `function assertKanbanWriteOwner(uid, user) {\n  const sub = user && user.sub;\n  if (!sub) throw new UnauthorizedSelfError();\n  // WRITE é SEMPRE self-only — não abrimos pra escopo=global sem\n  // endpoint dedicado de transferência.\n  if (String(uid) !== String(sub)) {\n`,
    replace: `function assertKanbanWriteOwner(uid, user, caps) {\n  const sub = user && user.sub;\n  if (!sub) throw new UnauthorizedSelfError();\n  // LF-KANBAN-WRITE-GATE-20260804\n  // O front canônico já salva foreign leads quando o usuário tem\n  // foreign='edit' + escopo != self. Sem alinhar o controller, o app\n  // entra em falso-sucesso local + 403 remoto.\n  if (String(uid) !== String(sub) && !canCrossOwnerKanban(caps)) {\n`
  },
  {
    name: 'put passa caps para write owner',
    marker: 'LF-KANBAN-PUT-CAPS-20260804',
    find: `  assertKanbanWriteOwner(uid, ctx && ctx.user);\n`,
    replace: `  /* LF-KANBAN-PUT-CAPS-20260804 */\n  assertKanbanWriteOwner(uid, ctx && ctx.user, ctx && ctx.caps);\n`
  }
]);

console.log('OK: patches aplicados em', kanbanPath, 'e', ctrlPath);
NODE

echo "[ok] backups:"
echo "  - $KANBAN.bak-20260804"
echo "  - $CTRL.bak-20260804"
echo "[ok] correção aplicada nos arquivos canônicos."
