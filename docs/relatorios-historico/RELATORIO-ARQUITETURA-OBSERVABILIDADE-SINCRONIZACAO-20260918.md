# RELATORIO-ARQUITETURA-OBSERVABILIDADE-SINCRONIZACAO-20260918

## Pedido

Continuar as separações de arquitetura pelas menos difíceis.

## Contexto

Do plano de estabilidade original, o item 4 ("consolidar os 4
mecanismos de sincronização") foi classificado como arriscado demais
pra fazer como reescrita numa sessão só — cada um dos 4 já foi
ajustado várias vezes pra corrigir bugs sutis. A recomendação era
começar por DAR VISIBILIDADE unificada, sem mudar comportamento
nenhum — esta entrega é esse primeiro passo.

## O que foi implementado

`js/lf-sync-status.js` — novo módulo, isolado, que só observa os 4
mecanismos já documentados em `docs/architecture.md`:

1. **Sondagem periódica (15s)** — encapsula `_lfListsEqualById`
   (função já chamada a cada ciclo pra decidir se algo mudou) só pra
   registrar quando foi chamada e o resultado — sem alterar o que ela
   retorna.
2. **BroadcastChannel entre abas** — adiciona um SEGUNDO listener no
   mesmo canal já usado pelo Kanban (`lf_kb_v1`) — BroadcastChannel
   aceita múltiplos listeners sem interferir entre si.
3. **Fila de retentativas** — só lê o tamanho
   (`window.LiderCRM.offline.retryQueue.list().length`), API que já
   era pública.
4. **Proteção contra exclusão fantasma** — só lê o registro direto do
   localStorage, sem encapsular nada.

Função pública `window.lfSyncStatus()` retorna um retrato dos 4 num
objeto só. Adicionado também um botão "🔄 Ver status de
sincronização" em Configurações > Manutenção (mesmo lugar do painel
de erros já existente), pra não precisar abrir o console.

## Erro cometido e corrigido durante a implementação

Ao adicionar a nova função `openSyncStatusPanel` em `js/utils.js`, uma
edição por texto acabou removendo acidentalmente a linha de abertura
de `openClientErrorsPanel` (função vizinha, já existente). **A suíte
de testes automatizados pegou isso na hora** — `node --check` já
teria detectado o erro de sintaxe de qualquer forma, mas rodar os 88
testes logo em seguida confirmou que absolutamente mais nada quebrou
além do que eu já sabia ter mexido. Corrigido antes de prosseguir.

## Fluxos cobertos

- Qualquer pessoa pode abrir Configurações > Manutenção > Ver status
  de sincronização e ver, num retrato só: quando a sondagem rodou
  pela última vez e se achou mudança, se o BroadcastChannel está
  ativo, quantos itens estão pendentes de reenvio, e quantos IDs
  estão protegidos contra ressurreição agora.
- Nenhum dos 4 mecanismos teve comportamento alterado — só
  observação.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/lf-sync-status.js` | novo — camada de observabilidade |
| `js/utils.js` | `openSyncStatusPanel()` novo |
| `index.html`, `app.html` | botão + modal de status; registro do novo script |
| `tests/lf-sync-status.test.js` | novo — 6 testes |

## Verificação

```
node --check js/lf-sync-status.js js/utils.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 88/88 testes (82 + 6 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

Testado visualmente (renderização com o CSS real) — painel legível,
os 4 mecanismos separados visualmente.

## Próximo passo, se quiser continuar nessa frente

Com a visibilidade em vigor por algum tempo, dá pra observar os
números reais (quantas vezes a sondagem realmente detecta mudança,
quão cheia a fila de retentativas costuma ficar) antes de decidir se
vale a pena consolidar de verdade os 4 mecanismos — decisão
melhor informada do que "arriscar uma reescrita às cegas".

## Reversão

Reversível — remover os arquivos novos e as 2 linhas de registro no
HTML, sem afetar nenhum dos 4 mecanismos observados.
