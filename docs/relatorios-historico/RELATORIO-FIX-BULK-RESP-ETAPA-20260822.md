# RELATÓRIO — FIX transferência em massa: responsável + etapa numa única confirmação

**Data:** 22/08/2026
**Relatado:** mudar responsável de mais de 10 leads de uma vez estava
exigindo confirmar responsável e etapa um por um; leads "Livres"
movidos primeiro pro novo dono, depois exigindo confirmação individual
pra ir pra etapa escolhida, e a notificação de "recebeu os leads" não
batia com o que realmente aparecia pro novo responsável.

## Causa raiz

Trocar responsável (`bulkResp`) e trocar etapa (`bulkMove`) sempre
foram **duas ações separadas**, cada uma com sua própria janela. E o
detalhe que causava o problema: **`bulkResp` limpava a seleção
inteira assim que terminava** (`clearBulk()`). Ou seja, pra também
mudar a etapa dos mesmos leads logo depois de trocar o responsável, a
única opção era **marcar tudo de novo, um por um** — exatamente o
"obrigatório confirmar... um por um" relatado. Com 10, 20 leads
selecionados, isso é bem tedioso.

O cenário dos "Livres" era exatamente essa mesma causa, só que mais
visível: o responsável é trocado primeiro (ação 1, seleção some) → daí
sim aparece a necessidade de selecionar tudo de novo pra mudar a etapa
(ação 2) → e como são duas operações completamente separadas no
tempo, dava pra parecer que "moveu primeiro pro novo dono" e só depois
"precisa confirmar pra ir pra etapa" — não é bem isso que acontecia
por trás, mas a EXPERIÊNCIA batia com essa descrição.

## Correção

Troquei o fluxo de "trocar responsável" pra um fluxo combinado, **numa
única janela, sem fechar nada no meio**:

1. Escolhe o novo responsável (como já era).
2. **Sem fechar a janela nem perder a seleção**, a mesma janela mostra
   as opções de etapa — com "↷ Manter etapa atual" bem em destaque
   pra quem só quer trocar o responsável (comportamento idêntico ao de
   antes, se for essa a escolha).
3. Escolhida a etapa (ou "manter"), os dois — responsável e etapa —
   são aplicados juntos, pra todos os cards selecionados, numa única
   operação. Só ao final é que a seleção é limpa.

Isso vale tanto no desktop quanto no botão "👤 Dono" do celular — os
dois já usavam a mesma função por baixo, então o fluxo novo funciona
nos dois automaticamente, sem precisar mexer em mais nada.

## Achado extra — leads "Livres" de outro dono não conseguiam ser selecionados

Ao investigar, achei outro problema real: o botão "Assumir Lead" já é
liberado pra qualquer pessoa logada quando o lead está na etapa Livre
(faz sentido — é um pool compartilhado). Mas o **checkbox de seleção
em massa não tinha essa mesma liberação** — ficava escondido pra quem
não tinha permissão de editar o dono original daquele lead
especificamente. Corrigido: agora, leads na etapa Livre podem ser
selecionados em massa por qualquer um, igual já acontecia com o botão
de assumir individual.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | fluxo combinado responsável+etapa; correção do checkbox em leads Livres |
| `index.html`, `app.html` | título do modal agora dinâmico (2 passos) |

## Verificação

```
node --check js/kanban.js       → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

Atualizei também o parâmetro de cache dos arquivos alterados (seguindo
o combinado da correção anterior), pra garantir que essa mudança
apareça direto, sem precisar limpar cache manualmente.

## Como validar manualmente

1. Selecionar 10+ leads (desktop ou celular).
2. Tocar em "Transferir"/"Responsável" → escolher o novo responsável.
3. Confirmar que a MESMA janela já mostra as opções de etapa, sem
   precisar selecionar nada de novo.
4. Escolher uma etapa (ou "Manter etapa atual") → conferir que todos
   os cards aparecem pro novo responsável, na etapa certa, de uma vez.
5. Repetir com uma seleção que inclua leads na etapa Livre de outros
   donos — devem aparecer selecionáveis normalmente.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
