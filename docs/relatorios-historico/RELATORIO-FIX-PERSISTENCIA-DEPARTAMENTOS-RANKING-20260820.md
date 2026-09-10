# RELATÓRIO — Persistência de ligações/movimentações, bug de departamento e remoção do ranking

**Data:** 20/08/2026

---

## 1. Garantia de gravação permanente (ligações + movimentações) — ✅ corrigido

**Causa raiz:** tanto `saveLigToday()` (ligações) quanto `logFeedEvent()`
(movimentações/feed) sempre gravavam local primeiro — isso nunca
falhava — mas a gravação **remota** (Worker/servidor) não tinha
nenhuma rede de segurança:

- Se a chamada ao servidor **falhasse** (rede caindo, sessão expirando
  no meio, timeout), o erro só ia pro console do navegador — nada
  tentava de novo depois.
- Se o Worker **nem estivesse pronto ainda** no momento (ex.: logo
  após o login, token ainda sincronizando), a gravação remota **nem
  era tentada** — silêncio total.

Nos dois casos, o dado ficava só no aparelho de quem gravou. Se o
cache do navegador fosse limpo, ou a pessoa usasse outro dispositivo,
o dado remoto **nunca chegou a existir de verdade**, mesmo aparecendo
normal na tela de quem gravou.

**Correção:** implementei uma fila de reenvio automático — mesmo
padrão já comprovado no sistema de Atividades. Quando a gravação
remota falha (ou nem pode ser tentada), o item entra numa fila
persistida em `localStorage`, com tentativas automáticas crescentes
(2s → 5min de intervalo) e até 8 tentativas antes de registrar como
"não resolvido" — mas **sem nunca apagar o dado local**. A fila
reenvia sozinha: quando a internet volta, quando o app volta a ficar
em primeiro plano, e a cada 60 segundos como rede de segurança geral.

**Arquivos:** `src/modules/agenda/runtime/ligacoes-store.js`,
`src/modules/relatorios/runtime/feed-runtime.js`,
`js/patches/agenda/lf-fix-lig-feed-retry-queue-v1-20260820.js` (novo).

---

## 2. Bug na aba Time — "aparecendo pela metade" / departamentos que não existem — ✅ corrigido

**Causa raiz:** a função que decide quem cada supervisor pode ver
(`getDepartmentVisibleUsers`) tinha uma cadeia de fallback: tenta
achar o departamento da pessoa (sistema novo, por `team_id`) → tenta
achar via Estrutura manual (departamentos antigos) → tenta uma lista
antiga de "orientados" → **se nada disso resolver, mostra só a própria
pessoa**.

Esse último passo foi pensado como proteção de segurança — faz sentido
se departamentos EXISTEM e essa pessoa especificamente não está
atribuída a nenhum. Mas quando a empresa **não usa departamentos
nenhum no momento** (seu caso — confirmei, `getDepartments()` estava
vazio e ninguém tinha `team_id` mapeado), todo supervisor caía nesse
mesmo fallback — resultado: cada supervisor só via a si mesmo, e
qualquer tela que dependesse dessa função (a lista de consultores da
aba Time, e o painel "Ligações do Departamento") ficava com dado pela
metade ou vazio, dependendo de quem estava logado.

**Correção:** agora a função primeiro verifica se **algum**
departamento existe no sistema inteiro (por qualquer das duas fontes).
Se não existir nenhum — a funcionalidade de Departamentos simplesmente
não está em uso — mostra todos os usuários pra qualquer supervisor,
igual era antes dessa funcionalidade existir. Se departamentos
existirem de verdade (empresa já usa) mas uma pessoa específica não
estiver atribuída a nenhum, mantém a proteção original (só ela mesma).

Essa única correção resolve os dois sintomas relatados — a lista de
consultores da aba Time e o painel de Ligações do Departamento usam
exatamente essa mesma função por baixo.

**Arquivo:** `js/usuarios.js`.

---

## 3. Removida a "competição" de 1º/2º lugar — ✅ corrigido

A lista de consultores da aba Time ordenava por desempenho
(fechamentos → taxa → valor) e mostrava medalha 🥇🥈🥉 pros 3
primeiros, e "4º", "5º" etc. pros demais — uma disputa que não era
essa a intenção.

**Correção:** removidas as medalhas e a numeração de posição por
completo. A lista agora aparece em ordem alfabética simples — é só a
equipe, sem ranking.

**Arquivo:** `js/relatorios.js`.

---

## Verificação

```
node --check <cada arquivo editado>  → OK
node scripts/ai-guard.mjs            → 0 violações bloqueantes
node scripts/verify-mirror.mjs       → www/ e raiz idênticos
npm run lint                         → 0 erros
npm test                             → 43/43 testes
npx cap sync                         → android/ e ios/ sincronizados
```

## Como validar manualmente

1. **Persistência:** desligue o wi-fi/dados, marque uma ligação ou
   faça uma movimentação (mover card), religue a conexão — em até 60s
   (ou ao voltar pra tela) o dado deve subir sozinho pro servidor, sem
   precisar repetir a ação.
2. **Time/departamentos:** logar como um supervisor → aba Time → deve
   ver todos os consultores (não só ele mesmo), tanto na lista quanto
   no painel de Ligações.
3. **Sem ranking:** a lista de consultores da aba Time deve aparecer em
   ordem alfabética, sem medalha ou número de posição.

## Reversão

Tudo reversível arquivo por arquivo, sem migração de dado. Itens já
enfileirados na fila de retry continuam tentando normalmente mesmo se
reverter (só param de ser criados novos itens).
