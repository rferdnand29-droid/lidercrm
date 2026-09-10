# RELATORIO-FIX-CARGO-ATIVIDADES-RESSURREICAO-DEFINITIVO-20260909

## Pedido

1. Rótulo "Consultor" no card do painel deve mudar conforme o cargo
   real do usuário (ex.: Rhuan é Supervisor).
2. Achar a causa e corrigir de vez atividades concluídas voltando
   como atrasadas após atualizar o CRM.
3. A mesma correção, igualmente, para leads excluídos voltando.

## 1. Cargo dinâmico

O card já lia `getUser(S.userId)` — só faltava usar o campo `cargo`
que já existe de verdade no cadastro (usado em outras telas do
sistema, como o formulário de criar usuário, com opções Consultor/
Administrativo/Orientador/Supervisor/Gerente/Representante).
Corrigido: o rótulo agora mostra `u.cargo`, com "Consultor" como
reserva caso o campo esteja vazio.

## 2. Atividades concluídas voltando como atrasadas — causa raiz

Achei o motivo exato: a função usada pelo **painel de notificações
(sino)** — acionada por qualquer usuário toda vez que abre o painel —
buscava as atividades de todos os usuários visíveis no servidor e
**sobrescrevia o cache local direto**, sem nenhum tipo de proteção
ou comparação. Como concluir uma atividade é uma ação "local primeiro,
servidor depois" (grava local na hora, envia pro servidor em
seguida), se o servidor ainda não tivesse processado essa gravação
no momento em que o painel buscava os dados de novo, a sobrescrita
**desfazia a conclusão visualmente** — exatamente o "voltou como
atrasada" que você descreveu.

**Correção**: criada uma função de merge central
(`_mergeActivitiesServerFetch`) que, antes de aceitar qualquer
resposta do servidor, compara cada atividade contra a versão local —
se a versão local está marcada como concluída e a do servidor não,
mantém a local. Aplicada nos dois pontos que faziam essa busca
(painel de notificações e visualização de atividades de outro
usuário).

## 3. Leads excluídos voltando — investigação mais profunda desta vez

Fiz uma varredura muito mais extensa que da correção anterior,
verificando **todo ponto do sistema** que escreve dados de leads/
negócios no armazenamento local: sincronização automática em segundo
plano, transferência de card entre donos, botão manual de
"Ressincronizar leads" — todos já passam corretamente pela proteção
contra ressurreição.

**Achado, mesmo sem uma segunda "sobrescrita direta" como a das
atividades**: a proteção contra item excluído "ressuscitando" ainda
tinha **duas implementações completamente separadas** rodando ao
mesmo tempo, com chaves de armazenamento diferentes
(`lf_recently_deleted_ids_v1` vs `lf6_recently_deleted_ids`). Numa
correção anterior eu tinha só igualado o tempo de validade das duas
(7 dias) — mas a duplicação em si continuava sendo um risco real de
nova divergência no futuro, bastando uma delas ser editada sem
lembrar da outra.

**Correção definitiva**: eliminada a duplicação por completo. Agora
existe uma única implementação (a de `js/utils.js`, que carrega
primeiro) — o outro módulo não redefine mais nada, só usa a mesma
via referência direta. Impossível divergir de novo, porque não existe
mais "a outra versão" pra divergir.

## Nota de honestidade

Não encontrei, para leads especificamente, uma segunda função com o
mesmo padrão de "sobrescrita direta sem proteção" que achei nas
atividades. É possível que o caso relatado já tivesse sido coberto
pela correção de TTL de uma sessão anterior, ou aconteça por um
caminho ainda não identificado. A eliminação da duplicação é uma
correção real e definitiva de um risco confirmado — mas se o problema
persistir, o próximo passo seria capturar em qual tela/ação exata
isso aconteceu, pra eu conseguir reproduzir e rastrear com mais
precisão.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `index.html`, `app.html`, `www/*` | rótulo do cargo dinâmico |
| `js/dashboard.js` | preenche o rótulo com `u.cargo` |
| `js/agenda.js` | nova função de merge protetivo; conectada nos 2 pontos que buscavam atividades do servidor |
| `src/modules/kanban/runtime/kanban-helpers.js` | duplicação da proteção "recém-excluído" eliminada |

## Verificação

```
node --check (todos os arquivos .js tocados) → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

## Como validar manualmente

1. Logar como um usuário com cargo "Supervisor" — o card deve mostrar
   "Supervisor", não "Consultor".
2. Concluir uma atividade, abrir o painel de notificações (sino)
   logo em seguida — a atividade deve continuar concluída.
3. Excluir um lead e atualizar a página várias vezes ao longo do dia
   — não deve voltar.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
