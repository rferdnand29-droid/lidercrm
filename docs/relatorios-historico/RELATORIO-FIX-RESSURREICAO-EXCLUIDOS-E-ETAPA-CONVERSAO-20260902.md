# RELATORIO-FIX-RESSURREICAO-EXCLUIDOS-E-ETAPA-CONVERSAO-20260902

## Bug

Dois pedidos:
1. Etapa específica deve aparecer sempre entre parênteses onde
   aparece "Convertido em Negócio" — não só no histórico.
2. **Erro grave**: leads e negócios descartados ou excluídos voltam
   ao atualizar o CRM — inclusive as atividades deles.

## Causa raiz

**1 (etapa nem sempre aparecia):** o histórico do Lead (aba
Histórico) já mostrava a etapa desde uma correção anterior. Mas
existe um **segundo lugar** — o selo "✓ Convertido em Negócio" que
aparece na aba Detalhes — que nunca tinha a etapa. Como esse selo
aparece na tela que abre por padrão (Detalhes, não Histórico), fazia
sentido a etapa não estar aparecendo "sempre" pra você.

**2 (erro grave — causa raiz confirmada):** encontradas **duas
implementações concorrentes** da mesma proteção contra "item
excluído ressuscitando" (`_lfMarkRecentlyDeleted`/
`_lfIsRecentlyDeleted`) — uma em `js/utils.js`, corretamente
configurada pra durar **7 dias**; outra, idêntica em propósito, em
`src/modules/kanban/runtime/kanban-helpers.js`, configurada pra durar
apenas **5 minutos**. Como o segundo arquivo carrega depois, sua
versão (a de 5 minutos) **sobrescrevia globalmente** a de 7 dias —
ou seja, a proteção de verdade em uso por todo o app era a curta,
não a longa.

Na prática: qualquer sincronização que rodasse mais de 5 minutos
depois de uma exclusão — e "atualizar o CRM" quase sempre é bem mais
tarde que isso — ficava **sem nenhuma proteção**. Se o servidor, por
qualquer motivo (rede lenta, retry pendente), ainda não tivesse
processado a exclusão, o próximo merge trazia o item de volta — e,
pior, regravava essa versão "ressuscitada" no servidor, tornando a
volta permanente até excluir de novo.

**Atividades tinham uma lacuna própria, mais direta:** a função que
busca atividades de **outro usuário** (usada quando um
supervisor/gestor olha as atividades de um consultor) simplesmente
substituía o cache local pela resposta do servidor, sem nenhum
filtro — nem essa proteção de 5 minutos/7 dias, nem nenhum outro
merge. Além disso, quando uma atividade era removida (por excluir o
lead/negócio dono dela), ela nunca era marcada como "recém-excluída"
em lugar nenhum — então mesmo com a proteção corrigida, não teria
efeito nenhum nelas até esse segundo ajuste.

## Estratégia

1. `js/kanban.js`: o selo "✓ Convertido em Negócio" (2 pontos: ao
   abrir o detalhe, e depois de mover a etapa) agora busca a etapa
   **atual** do negócio vinculado e mostra entre parênteses — dá uma
   visão rápida de onde o negócio está agora, não só onde entrou.
2. `src/modules/kanban/runtime/kanban-helpers.js`: TTL da proteção
   alinhado com os 7 dias de `js/utils.js` — eliminada a janela de 5
   minutos. Comentários cruzados adicionados nos dois arquivos
   avisando sobre a duplicação, pra não divergir de novo no futuro.
3. `js/relatorios.js`: cada atividade removida ao excluir um card
   agora é marcada individualmente como "recém-excluída".
4. `js/agenda.js`: a busca de atividades de outro usuário agora
   filtra itens recém-excluídos antes de usar a resposta do
   servidor — mesma proteção que o resto do app já tinha.

## Fluxos cobertos

- Excluir um lead/negócio e atualizar o CRM horas depois: não volta
  mais.
- Atividades vinculadas a um card excluído: não voltam mais, nem
  quando vistas por um supervisor olhando as atividades de outro
  consultor.
- Ver o selo "Convertido em Negócio" na aba Detalhes: mostra a etapa
  atual entre parênteses, sempre.

## Nota sobre "descartados"

Descarte é diferente de exclusão — o card não é removido, só muda de
etapa (mantendo o histórico). Esse fluxo já usa um mecanismo próprio
(carimbo de tempo Lamport) especificamente pra vencer merges tardios
do servidor, de uma correção anterior — não precisou da mesma
correção desta rodada.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | selo "Convertido em Negócio" com etapa atual |
| `src/modules/kanban/runtime/kanban-helpers.js` | TTL alinhado (7 dias) |
| `js/utils.js` | comentário de alerta cruzado |
| `js/relatorios.js` | atividades removidas marcadas como recém-excluídas |
| `js/agenda.js` | busca de atividades de outro usuário filtra recém-excluídos |

## Verificação

```
node --check (todos os arquivos tocados) → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ios sincronizados
```

## Como validar manualmente

1. Excluir um lead/negócio de teste, esperar mais de 5 minutos,
   atualizar a página — não deve voltar.
2. Excluir um lead com atividade pendente vinculada — a atividade não
   deve reaparecer em nenhuma lista depois.
3. Converter um lead escolhendo uma etapa → abrir o lead de novo →
   aba Detalhes deve mostrar "✓ Convertido em Negócio (etapa: ...)".

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
