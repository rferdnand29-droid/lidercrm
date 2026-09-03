# RELATORIO-FIX-ANOTACOES-LEADS-NUNCA-PERDIDAS-20260917

## Pedido

Corrigir as anotações dos leads pra elas absolutamente nunca serem
perdidas, nem pós novo deploy.

## Investigação — duas causas raiz distintas, as duas confirmadas e corrigidas

### Causa 1 — a mais grave: `updatedAt` nunca era atualizado ao salvar a anotação

`autoSaveKBObs()` (chamada a cada tecla digitada no campo de
anotações do lead) salvava o texto, mas **nunca atualizava
`card.updatedAt`** — diferente de outros pontos do sistema que editam
o mesmo card e corretamente atualizam esse campo. O mesmo bug existia
em `autoSaveKBValor()` (campo de valor do negócio).

**Por que isso perde a anotação, com ou sem deploy**: o mecanismo que
decide "qual versão vence" quando o servidor e o local têm dados
diferentes (`_mergeKeepLocalOnly`) usa `updatedAt` como critério —
quem tem a data mais recente, vence. Se a anotação foi editada mas
`updatedAt` não mudou, o card local continua "parecendo antigo" pro
sistema de merge. Daí, em **qualquer sincronização em segundo plano**
(o ciclo normal de 15 segundos, sem precisar de deploy nenhum!) que
trouxesse uma versão do servidor "mais nova" por qualquer OUTRO
motivo — por exemplo, o mesmo lead sendo movido de etapa em outro
dispositivo — o merge preferia essa versão do servidor, e a anotação
recém-digitada era descartada silenciosamente.

**Esta é provavelmente a causa mais frequente na prática** — pode
acontecer a qualquer momento, não só em deploy.

### Causa 2 — específica de "pós deploy": o detector de nova versão nunca esperava de verdade

O CRM tem um mecanismo que detecta quando um deploy novo foi
publicado e recarrega a página sozinho, pra garantir que todo mundo
sempre rode a versão mais recente. Esse mecanismo tem uma proteção
pra **não recarregar no meio de alguém usando um modal** — espera
até 2 minutos, checando periodicamente se ainda tem algo aberto.

**O problema**: essa checagem procurava a classe `.mo.show` e um
estilo `display:flex` escrito diretamente no elemento — mas o sistema
de modais de verdade usa a classe `.mo.open` (nunca escreve `display`
direto no elemento). Resultado: **a checagem nunca reconhecia
corretamente um modal aberto — nem o de detalhe do lead, onde fica o
campo de anotações**. Na prática, a proteção "espera terminar" nunca
funcionava — o recarregamento acontecia quase imediatamente depois de
detectar o deploy, mesmo com alguém digitando uma anotação na hora.

## Correções aplicadas

1. `autoSaveKBObs()` e `autoSaveKBValor()` agora atualizam
   `card.updatedAt` a cada salvamento — igual a qualquer outra edição
   do card. **Esta é a correção mais importante.**
2. O detector de modal aberto corrigido pra usar a classe certa
   (`.mo.open`) — agora reconhece de verdade quando o modal de
   detalhe do lead está aberto.
3. **Camada extra de proteção** (pedido explícito de "absolutamente
   nunca"): o detector também passa a considerar "está editando" se a
   pessoa tiver o cursor ativo num campo de texto, mesmo fora de um
   modal.
4. **Última garantia antes de qualquer recarregamento forçado**: se o
   campo de anotação/valor estiver com o cursor ativo no momento exato
   do recarregamento, força o salvamento imediato antes de navegar.
5. **Proteção geral pra qualquer forma de sair da página** (fechar
   aba, navegar pra outro site — não só o recarregamento do deploy):
   mesma garantia de salvamento imediato se a pessoa estiver editando
   no momento.

Travadas com **6 testes automatizados** novos, incluindo um teste que
documenta explicitamente o mecanismo do bug original (prova que, sem
o fix de `updatedAt`, a anotação seria mesmo perdida num merge) e um
teste que prova o fix funciona (a mesma anotação sobrevive ao merge
quando `updatedAt` é atualizado corretamente).

## Fluxos cobertos

- Editar a anotação de um lead, sincronização em segundo plano
  acontece logo depois (com ou sem deploy): anotação preservada.
- Um deploy novo é publicado enquanto alguém está com o modal de
  detalhe do lead aberto, editando a anotação: o recarregamento
  espera de verdade agora, e ainda salva antes de recarregar se
  pegar o campo em edição.
- Fechar a aba/navegar pra outro lugar com uma anotação sendo
  digitada: salva antes de sair.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | `updatedAt` atualizado em `autoSaveKBObs`/`autoSaveKBValor`; proteção `beforeunload` |
| `js/app-update-checker.js` | seletor de modal corrigido; camada extra de "está digitando"; flush antes de recarregar |
| `tests/lf-kb-obs-updatedat.test.js` | novo — 2 testes |
| `tests/lf-app-update-checker-modal-detection.test.js` | novo — 4 testes |

## Verificação

```
node --check (todos os arquivos .js tocados) → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 82/82 testes (76 + 6 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

## Como validar manualmente

1. Editar a anotação de um lead, esperar ~20 segundos (um ciclo de
   sincronização), voltar ao card — anotação deve continuar lá.
2. Abrir o detalhe de um lead, começar a digitar uma anotação, e (se
   possível testar) publicar um deploy novo enquanto isso — a página
   não deve recarregar até você terminar/fechar o modal, e mesmo que
   feche, a última anotação digitada deve estar salva.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
