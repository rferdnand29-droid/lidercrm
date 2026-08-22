# RELATÓRIO — Etapas próprias do Administrativo + Agenda como "departamento"

**Data:** 20/08/2026

---

## 1. Pipeline de Negócios exclusivo do cargo Administrativo — ✅ implementado

O cargo Administrativo agora enxerga 9 etapas próprias no board de
Negócios, completamente separadas do funil de vendas padrão (que
continua igual pra Consultor/Supervisor/Gerente/etc.):

1. Ficha/Cadastro
2. Pendências Cadastrais
3. Confirmação de Dados
4. Aprovados
5. Fechamentos
6. Clientes Enrolados
7. Venda Concluída
8. Cancelados
9. Setor de Pós-Venda

### Como foi feito

`kbCols(board)` — a função central que decide quais colunas mostrar —
agora resolve **de quem é o board sendo visto** (o dono do card aberto
no detalhe, ou o dono do board em foco) e devolve o pipeline certo:
padrão pra qualquer cargo, ou o novo pipeline de 9 etapas se aquele
dono específico for Administrativo. Um ADM/supervisor olhando o board
de um Administrativo também vê as etapas dele — o pipeline segue o
**dono do card**, não quem está logado.

Os IDs das 9 etapas novas são todos inéditos (prefixo `adm_`) — nunca
reaproveitei os IDs do pipeline padrão (Ficha/Aprovado/Fechado/etc já
tinham significado próprio no Analytics, na sincronia do Bingo e nas
etapas terminais; usar os mesmos IDs aqui misturaria dado de dois
processos diferentes).

### Decisão de escopo — registrada por transparência

**As 9 etapas novas não entram nas métricas do Analytics, na
sincronia do Bingo, nem no fluxo de "motivo obrigatório" que existe
pra Descartar/No-Show.** O pedido foi especificamente sobre as etapas
existirem — não especificou como cada uma delas deveria contar nas
métricas de vendas (que são conceitos de funil comercial: Agendado,
Compareceu, Fechamento — não mapeiam obviamente pra "Pendências
Cadastrais" ou "Setor de Pós-Venda"). Prefiro não supor esse
mapeamento sozinho. Se quiser que alguma dessas etapas conte em algum
KPI específico (ex.: "Venda Concluída" contar como Fechamento), me diz
qual e eu conecto.

**Arquivos:** `src/modules/kanban/runtime/kanban-helpers.js`,
`js/kanban.js`, `css/style.css`.

---

## 2. Agenda de volta pro Administrativo, escopada como departamento — ✅ implementado

A aba Agenda, que tinha sido escondida por completo pro cargo
Administrativo (Bingo e Leads continuam escondidos, sem mudança),
volta a aparecer — mas usando o **mesmo sistema de departamento** que
já existia pra Agenda (construído numa sessão anterior): um
Administrativo só vê agendamentos de **outros Administrativos**,
nunca de departamentos/cargos normais.

Reaproveitei 100% do mecanismo já existente — só ensinei ele a
reconhecer "Administrativo" como mais um "departamento", só que por
cargo em vez de vínculo formal de Estrutura. Na prática:

- **Administrativo comum:** abre a Agenda, já vem travado só nos
  agendamentos de outros Administrativos — automático, sem filtro
  nenhum pra mexer (mesma trava que qualquer departamento real já
  tinha pra quem não é ADM total).
- **ADM total (hasAdminAccess):** o seletor de departamento da Agenda
  ganha uma opção nova, "🗂️ Administrativo", ao lado dos
  departamentos de verdade — escolhendo ela, vê só os agendamentos dos
  Administrativos, exatamente como filtrar por qualquer outro
  departamento. A escolha continua salva por usuário, sobrevive a
  trocar de aba/deslogar, igual já funcionava.

**Arquivos:**
`js/patches/agenda/lf-agenda-department-scope-v1-20260820.js`,
`js/patches/usuarios-auth/lf-administrativo-hide-tabs-v1-20260820.js`.

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

1. Logar como Administrativo → abrir Negócios → conferir as 9 etapas
   novas no lugar do funil padrão.
2. Mesmo usuário → Agenda deve aparecer na navegação de novo, mostrando
   só agendamentos de outros Administrativos.
3. Logar como ADM total → Agenda → seletor de departamento deve ter a
   opção "🗂️ Administrativo" além dos departamentos reais → escolher
   ela e conferir que só aparece agendamento de Administrativo.

## Reversão

Nenhuma migração de dado — tudo reversível arquivo por arquivo. Cards
de Negócios já criados por um Administrativo ficam com os IDs de etapa
novos salvos; se reverter o patch, essas etapas passam a não ter
correspondência no pipeline padrão (o card fica "numa etapa que não
existe mais" até ser movido manualmente) — avise se for reverter, pra eu
te ajudar a migrar esses cards de volta antes.
