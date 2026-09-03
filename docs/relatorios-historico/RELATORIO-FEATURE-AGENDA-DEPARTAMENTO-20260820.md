# RELATÓRIO — Agenda por departamento (ADM vê todos + filtro salvo)

**Data:** 2026-08-20
**Pedido:** quem está num departamento só pode ver, na Agenda, os
agendamentos daquele departamento. Quem tem TODAS as funções de ADM vê
todos os departamentos de uma vez e pode filtrar por um — com a última
escolha salva (sobrevive a sair da aba/CRM e voltar).

## Estado anterior

`js/agenda.js` sempre carregava e mostrava os agendamentos de **toda a
equipe** pra qualquer usuário logado — não tinha bug nenhum aí, foi
construído assim de propósito (rótulo original: "Agendamentos de toda
a equipe, em tempo real"). Este patch adiciona a regra de departamento
por cima, sem alterar `agenda.js`.

## Implementação

**Novo arquivo:** `js/patches/agenda/lf-agenda-department-scope-v1-20260820.js`

`js/agenda.js` é um script global concatenado (sem IIFE/módulo) —
`_agdCache` é literalmente `window._agdCache`. O patch aproveita isso:
envelopa as 4 funções de renderização (`agdRenderStrip`, `agdRenderKPIs`,
`agdRenderList`, `agdRenderFreeSlots`) trocando `window._agdCache` pela
versão filtrada por departamento só durante a chamada, e restaurando o
valor completo logo depois (`try/finally`). Como JS é single-thread e
essas funções são síncronas, não existe janela de corrida — a troca
nunca vaza pra fora da própria chamada. Os dados usados por
salvar/editar/checar conflito de horário continuam vendo tudo — só a
**exibição** é filtrada.

Os dois `<select>` de consultor (`agdFillConsultorFilter`,
`agdFillConsultorSelect`) recebem o mesmo tratamento em cima de
`getUsers()`, pra nunca oferecer, nos dropdowns, um consultor de fora
do departamento visível.

**Departamento de um usuário:** mesma prioridade já usada em
`getDepartmentVisibleUsers()` (`js/usuarios.js`) — `LF_SCOPE_V2.
departamentoOfUser()` (fonte nova, via `team_id`, a mesma que protege
dados de verdade no banco) primeiro; Estrutura manual
(`getDepartments()`/`_deptUserBelongs`) como fallback. Não duplica
lógica nova, só reaproveita a que já existe.

**ADM (hasAdminAccess):** vê todos os departamentos por padrão. Novo
`<select id="agd-filter-dept">` (adicionado em `index.html`/`app.html`,
escondido por padrão) aparece só pra ADM, populado via `LF_DEPARTMENTS.
list()`. A escolha é salva em `localStorage` por uid
(`lf_agd_dept_filter_<uid>`) — sai da Agenda, sai do CRM, volta depois,
o filtro continua no departamento escolhido por último.

**Não-ADM:** o `<select>` de departamento fica escondido — não tem
escolha, o escopo é travado automaticamente no próprio departamento.

**Caso sem departamento atribuído (não-ADM):** em vez de cair pra "sem
filtro = vê tudo" (que seria vazamento de dado), cai pro mínimo seguro
— só os próprios agendamentos. Mesmo princípio de "least privilege" que
`getDepartmentVisibleUsers()` já usa no resto do app.

**Texto informativo:** o aviso abaixo do título da Agenda (que sempre
dizia "toda a equipe", mesmo já filtrado) foi ajustado — mostra o nome
do departamento pra quem está restrito, "todos os departamentos" pro
ADM sem filtro, ou o nome do departamento escolhido pro ADM filtrado.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/patches/agenda/lf-agenda-department-scope-v1-20260820.js` | novo |
| `index.html`, `app.html` | novo `<select id="agd-filter-dept">` |
| `www/**` | espelho, regenerado via `npm run cap:www` |
| `android/`, `ios/` | sincronizados via `npx cap sync` |

## Validação manual

1. Login como consultor/supervisor de um departamento → Agenda mostra
   só agendamentos desse departamento; filtro de departamento não
   aparece.
2. Login como ADM → Agenda mostra todos os departamentos; filtro
   aparece, populado com a lista real de departamentos.
3. Escolher um departamento no filtro → lista/KPIs/dias com dot
   atualizam pra só aquele departamento.
4. Sair da Agenda (trocar de aba) e voltar → filtro continua no
   departamento escolhido.
5. Deslogar e logar de novo (mesmo uid) → filtro ainda está lá
   (persistido em localStorage, não só em memória).

## Verificação

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Reversão

Remover a tag `<script>` de `lf-agenda-department-scope-v1-20260820.js`
dos 4 HTMLs e apagar o arquivo; remover o `<select id="agd-filter-dept">`
dos 2 HTMLs raiz (opcional, inofensivo mesmo sem o patch — só fica
escondido/sem uso).
