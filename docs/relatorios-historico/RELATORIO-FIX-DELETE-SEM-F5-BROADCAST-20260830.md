# RELATORIO-FIX-DELETE-SEM-F5-BROADCAST-20260830

## Bug

Excluir um lead exigia F5 pra ele efetivamente sumir da tela —
esperado que fosse instantâneo.

## Investigação — o que foi verificado e descartado

Segui a cadeia completa do fluxo de exclusão
(`deleteKBCard` → `confirmDeleteKBReason`) e confirmei que, **na
mesma aba/sessão onde a exclusão é feita**, tudo funciona
corretamente e na hora:
- `getKBFor` lê sempre direto do armazenamento local, sem cache.
- `renderKBLocal`/`renderKBMobile` são chamados sincronamente logo
  depois de excluir, e reconstroem a tela do zero com dados frescos.
- A proteção contra "ressurreição" de um item excluído
  (`_lfIsRecentlyDeleted`) tem validade de 7 dias — não é o problema.
- `_buildKB` sempre reconstrói o board inteiro (`wrap.innerHTML=''`),
  sem nenhuma lógica de atualização parcial que pudesse "esquecer"
  de remover um card específico.

## Causa raiz

Achei o problema numa direção diferente: **sincronização entre
abas/sessões do mesmo navegador**. O projeto já tinha uma
`BroadcastChannel` para isso — toda vez que algo é salvo/excluído
(`saveKBFor`), uma mensagem é publicada avisando "o board X do
usuário Y mudou". O comentário no próprio código já dizia a intenção:
*"a guia nova só precisa reler a chave e re-renderizar, sem rede"*.

Só que **nenhum lugar do código tinha o lado de escutar** essa
mensagem. A aba que faz a exclusão avisa corretamente; nenhuma outra
aba (ou sessão) ouvia o aviso. Nesse cenário, a exclusão só aparecia
pra quem não fez a ação diretamente quando o ciclo periódico de
sincronização em segundo plano (a cada 15s) rodasse por conta
própria — ou com F5, que força uma checagem imediata, pulando a
espera. Esse é o mesmo mecanismo já documentado num relatório
anterior do projeto (`RELATORIO-SUBETAPA-SYNC-SPEEDUP-20260821.md`),
que descreve exatamente esse padrão pra criação de leads.

## Estratégia

`js/app.js` (`bootApp`): adicionado o lado que faltava da
`BroadcastChannel` — qualquer aba aberta, ao receber o aviso de
outra aba da mesma origem, re-renderiza o board afetado na hora, sem
rede nenhuma (o armazenamento local já está atualizado por quem
publicou o aviso — só faltava mandar reler e repintar).

## Fluxos cobertos

- Excluir um lead na MESMA aba/sessão: já funcionava, continua
  funcionando.
- Excluir um lead com o CRM aberto em **duas abas do mesmo
  navegador**: agora a outra aba reflete a exclusão instantaneamente,
  sem precisar de F5 nem esperar o ciclo de 15s.

## Limitação, dita com honestidade

Isso resolve o caso de **abas do mesmo navegador** (BroadcastChannel
é limitado à mesma origem/navegador por natureza). Não resolve, por
si só, o caso de **dispositivos diferentes** (ex.: excluir no PC e
esperar o app Capacitor do celular perceber) — esse caso continua
dependendo do ciclo de sincronização de 15 segundos, que já foi
reduzido de 45s numa sessão anterior. Reduzir esse intervalo geral
ainda mais aumentaria o consumo de rede/servidor de forma constante,
então não fiz essa mudança sem confirmar com você se vale a pena —
me avisa se esse for especificamente o cenário que você está vendo
(PC e celular, não duas abas do PC) que a gente decide esse
trade-off junto.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/app.js` | listener da `BroadcastChannel` adicionado no boot |

## Verificação

```
node --check js/app.js           → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
```

## Como validar manualmente

1. Abrir o CRM em 2 abas do mesmo navegador, logado com o mesmo
   usuário, ambas na tela de Leads.
2. Excluir um lead numa aba.
3. Olhar a outra aba, sem tocar em nada — o lead deve sumir sozinho,
   na hora.

## Reversão

Reversível — é uma adição pontual de um listener, sem migração de
dado nem mudança em nenhum outro comportamento.
