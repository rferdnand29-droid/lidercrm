# RELATORIO-FIX-TREMOR-ANEXOS-BINGO-DUPLICADOS-SYNC-20260828

## Bug

Pacote de 6 problemas relatados juntos:
1. Leads (principalmente novos) "tremendo"/se mexendo sozinhos, sem
   interação nenhuma.
2. Rolagem do quadro Kanban subindo/descendo sozinha, sem o usuário
   rolar.
3. Anexos de um lead não podiam ser excluídos depois de adicionados.
4. Bingo não tinha como trocar o status (Agendado/Remarcar/No-Show)
   sem entrar nos detalhes do lead.
5. Duplicados só visíveis para ADM/gestor — usuários comuns não viam
   nem os próprios.
6. Regra de duplicado permitia nome igual sozinho contar como
   duplicado, mesmo com telefone diferente.
7. Suspeita de dessincronia entre a versão PC e o app Capacitor
   (mesmos leads/negócios deveriam aparecer nos dois).

## Causa raiz

**1+2 (tremor + scroll sozinho):** a sincronização em segundo plano do
Kanban (`_syncKBRemoteBG`, que roda a cada 15s — intervalo reduzido
numa sessão anterior justamente para acelerar o sync PC↔Capacitor)
decidia "repintar ou não" comparando `JSON.stringify` do array INTEIRO
antes/depois do merge servidor+local. Essa comparação é sensível à
**ordem** dos itens no array — e o merge reconstrói a lista na ordem
do **servidor**, que diverge naturalmente da ordem acumulada
localmente (um lead novo entra no fim do array local, mas o servidor
pode devolvê-lo em outra posição). Resultado: falso positivo de
"mudou" a cada ciclo, mesmo sem nenhuma mudança real de conteúdo —
disparando `renderKBLocal` repetidamente, que destrói e recria todos
os cards do DOM. Isso é percebido como tremor visual, e cada
recriação é uma nova chance de a restauração de scroll escapar por
alguma borda de tempo. A mesma exata falha existia na função que
alimenta o Bingo (`loadCli`, `js/auth.js`) — usando uma função de
assinatura (`window.__LF_PERF_R4`) que nunca chegou a ser definida em
lugar nenhum do código, caindo sempre no `JSON.stringify` problemático.

**3 (anexos):** três pontos distintos (`_attRowHTML`, `attCtxOpen`,
`delAttachment`) exigiam `hasAdminAccess()` para mostrar/permitir a
exclusão — mesmo o próprio usuário que subiu o anexo não conseguia
apagá-lo. Fixar e renomear já usavam uma permissão mais aberta
(`canEdit` — quem edita o lead).

**4 (status no Bingo):** `setCliStatus`/`openNoShowModal` já existiam
e funcionavam, mas só eram acionadas de dentro do modal de Timeline
(que abre ao clicar no nome) — não havia nenhum controle na própria
linha da lista.

**5 (duplicados só pra ADM):** três travas independentes: o botão
"🔍 Duplicatas" ficava com `display:none` para quem não é ADM; a
função que abre o scanner (`openDuplicateScanner`) não tinha
restrição própria, mas `_collectAllCardsForDup()` sempre varria
**todos os usuários ativos da empresa** (motivo original da
restrição a ADM — evitar vazamento entre consultores); e os botões
"Verificar agora"/"Lixeira" (ligados à mesclagem) dependiam de ADM
internamente sem esconder o botão, dando erro de permissão ao clicar.

**6 (regra de duplicado):** `_dupFieldsMatch` usava lógica OU — nome
igual OU telefone igual já bastava. A mesclagem automática
(`_dupAllConfiguredFieldsIdentical`) tinha o problema oposto: exigia
nome E telefone (quando ambos configurados), rejeitando o caso
"nome diferente mas telefone igual" que também deveria contar.

**7 (PC↔Capacitor):** dois achados. Primeiro, a MESMA causa raiz do
item 1 — o falso positivo de "mudou" tornava o sync de 15s pouco
confiável (embora não fosse causa de dados "sumirem", só de
re-pinturas desnecessárias). Segundo, um achado à parte: o fix
crítico `LF-FIX-CAPACITOR-APIBASE-20260824` (garante que chamadas de
API do app nativo batam no backend real, e não em
`https://localhost`, onde o WebView do Capacitor roda por padrão) só
tinha sido aplicado em `index.html` — `app.html`, que o próprio
projeto exige manter sincronizado com `index.html` em todo patch,
ficou de fora. A documentação confirma que o Capacitor carrega
`index.html` por padrão (então a lacuna em `app.html` não é a causa
direta deste sintoma específico), mas é uma inconsistência real que
valia a pena fechar por precaução.

**Limitação arquitetural, não um bug:** o Capacitor está configurado
com `webDir` local (sem `server.url`) — o app roda uma cópia dos
arquivos JS/CSS/HTML empacotada dentro do APK/IPA no momento da
build. Isso significa que **atualizações de código** (não de dados)
só chegam ao celular reinstalando um APK novo — é assim que apps
Capacitor funcionam por padrão, e mudar isso (apontar pra um servidor
ao vivo) tornaria o app dependente de internet o tempo todo, uma
troca que não fiz sem confirmação, por ser uma mudança de arquitetura
com esse porte de consequência. Já a sincronização de **dados**
(leads, negócios) passa pelo backend normalmente e é o que os fixes
1/2/7 acima melhoram de verdade.

## Estratégia

1. Criado helper compartilhado `_lfListsEqualById` (`js/utils.js`) —
   compara duas listas por conteúdo via mapa de ID, ignorando ordem.
   Aplicado em `js/kanban.js` (`_syncKBRemoteBG`) e `js/auth.js`
   (`loadCli`), substituindo as comparações `JSON.stringify` diretas.
2. `js/documentos.js`/`js/relatorios.js`: trocado `hasAdminAccess()`
   por `canEdit` nos 3 pontos de exclusão de anexo.
3. `js/clientes.js`: `setCliStatus`/`openNoShowModal`/`confirmNoShow`
   estendidos com parâmetro opcional (`ownerUid` explícito, `skipNav`)
   sem quebrar nenhum chamador existente. Novo botão "🔄" na linha do
   Bingo + popup `#mo-bps` com as 3 opções.
4. `js/kanban.js`: removida a restrição de admin no botão/varredura de
   duplicados; `_collectAllCardsForDup` ganhou parâmetro opcional de
   escopo (usado só quando quem chama não é ADM, via
   `getDepartmentVisibleUsers`); botões de mesclagem escondidos (não
   removidos) para não-ADM.
5. `_dupFieldsMatch`/`_dupAllConfiguredFieldsIdentical`: reescritas
   para exigir telefone igual como única condição — nome não entra
   mais na decisão. Tela de configuração (`openDupConfig`) atualizada
   para refletir isso (checkbox de nome removido).
6. `app.html`: aplicado o mesmo bloco de `apiBase` que já existia em
   `index.html`.

## Fluxos cobertos

- Kanban aberto, sem interação: não deve mais re-pintar/tremer a cada
  15s sem mudança real.
- Bingo: idem, sem re-render espúrio.
- Qualquer usuário (não só ADM) consegue excluir anexo de um lead que
  pode editar.
- Bingo: trocar status direto na lista, sem abrir detalhes.
- Qualquer usuário vê os próprios duplicados (e do time, se
  supervisor/gerente); mesclar continua exclusivo de ADM.
- "João" com telefone A e "João" com telefone B: não mais marcados
  como duplicado. "João" e "J. Silva" com o mesmo telefone: continuam
  marcados.
- App nativo (Capacitor): `app.html` agora também tem a base de API
  correta, para consistência com `index.html`.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/utils.js` | novo helper `_lfListsEqualById` |
| `js/kanban.js` | comparação de sync corrigida; duplicados desbloqueados; regra de telefone; botão de status no Bingo (função) |
| `js/auth.js` | `loadCli` usa o novo helper |
| `js/clientes.js` | `setCliStatus`/`openNoShowModal`/`confirmNoShow` estendidos; `openBingoStatusPicker`/`_bpsPick` novos |
| `js/documentos.js`, `js/relatorios.js` | permissão de excluir anexo |
| `index.html`, `app.html`, `www/*` | modal `#mo-bps`; bloco de apiBase em app.html; bump de versão/build-id |
| `css/style.css` | estilo do botão de status e do popup |

## Verificação

```
node --check (todos os arquivos tocados) → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Deixar o Kanban de Leads aberto e parado por 1-2 minutos — não deve
   mais tremer ou rolar sozinho.
2. Abrir um lead, adicionar um anexo, depois excluí-lo — deve funcionar
   sem ser ADM.
3. No Bingo, clicar no "🔄" ao lado de um nome — deve abrir o popup e
   trocar o status sem sair da lista.
4. Logar como consultor comum → "🔍 Duplicatas" deve estar visível e
   mostrar só os próprios registros.
5. Criar 2 leads "Marcos" com telefones diferentes → não devem
   aparecer como duplicados. Criar 2 com o mesmo telefone (nomes
   diferentes) → devem aparecer.

## Reversão

Todas as mudanças são reversíveis revertendo os arquivos tocados —
nenhuma migração de dado, nenhum backend/SQL alterado.

## Nota sobre a limitação arquitetural (item 7)

Não decidi por conta própria mudar o Capacitor para carregar direto de
um servidor ao vivo (isso resolveria "código sempre atualizado", mas
tornaria o app dependente de internet permanentemente) — é uma troca
de arquitetura com esse porte de consequência, e o `AI_CONTRACT.md`
deste projeto pede para eu parar e perguntar antes de decisões assim.
Se quiser seguir esse caminho, me avisa que a gente discute os
prós/contras antes de implementar.
