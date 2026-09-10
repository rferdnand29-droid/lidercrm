# RELATORIO-CORRECAO-DIAGNOSTICO-20260901-COMPLETO-20261012

## Pedido

Corrigir todos os 7 problemas do diagnóstico enviado (erros de
console e dois bugs funcionais), verificando cada afirmação contra o
código real antes de agir.

## Resultado por problema

### Problema 1 — Botão de lembrete ausente no mobile ✅ confirmado e corrigido

O template do card **desktop** já tinha sido corrigido numa entrega
anterior (2026-10-09). Mas existe um template **completamente
separado**, só usado no mobile (`.mb-card`), que nunca teve esse
botão desde o redesenho de 2026-08-05 — não foi removido, nunca
existiu ali.

Adicionado, reaproveitando exatamente a mesma lógica (`_kbHasOverdueLinkedActivity`,
`openQuickActivity`). **Achado extra durante o teste visual**: minha
primeira tentativa de estilo não aparecia corretamente — uma regra
`!important` genérica em `css/lf-mobile-leads-compact-v1.css` estava
sobrescrevendo minhas cores. Corrigido adicionando a variante no
mesmo arquivo, com a mesma especificidade das regras `.call`/
`.whatsapp` que já funcionavam. Confirmado visualmente nos dois
estados (normal e atrasado) com o CSS de produção real.

### Problema 2 — Filtro "atrasados" com dado desatualizado ✅ confirmado e corrigido (3 partes)

Todas as três causas do diagnóstico se confirmaram:

1. `_kbHasOverdueLinkedActivity` não consultava o registro
   `_lfIsRecentlyDone` (existente desde 2026-10-08, mas nunca usado
   aqui) — corrigido nas duas fontes (store central e espelho legado).
2. Adicionado também: `doneAt` preenchido conta como sinal extra de
   conclusão no espelho legado (defesa em profundidade).
3. `actConfirmDone` só atualizava o resumo dentro de um modal aberto,
   nunca redesenhava o quadro do Kanban em si — o card continuava
   "atrasado" visualmente até o próximo ciclo de sincronização (até
   15s depois). Corrigido: redesenha na hora, só se a página do board
   estiver visível.

### Problema 3 — 404 do vídeo de login ✅ já corrigido, reforçado

A correção de fundo (checar o manifesto antes do vídeo) já existia de
uma entrega anterior. Achado real aqui: o arquivo `js/lf-login-video.js`
tem sua própria string de versão, separada do padrão compartilhado
usado no resto do projeto — passou batido das minhas atualizações de
cache anteriores. Corrigido, versão renovada.

### Problema 4 — 503 do Supabase (signup/refresh) ✅ robustez do cliente adicionada, com cautela

O 503 em si é do lado do servidor (fora do meu controle). Confirmei a
causa do diagnóstico: o retry de `signInAnonymously` só existia no
fluxo Capacitor — na web, uma falha ia direto pro modo offline, sem
tentar de novo. Dado que esta é a lógica mais crítica e mais
historicamente corrigida do projeto (muitos comentários de fix
acumulados), fiz a **menor mudança possível**: estendi a mesma lógica
já comprovada (não criei mecanismo novo) pra também valer na web, com
atraso progressivo simples.

### Problema 5 — Múltiplas instâncias do Supabase ❌ causa apontada estava incorreta

Investiguei o arquivo específico que o diagnóstico citou
(`supabase-bootstrap.js`) — **ele não cria nenhum cliente Supabase**.
Busquei em todo o projeto: existe só UMA chamada real a
`createClient()`, já bem protegida contra dupla execução
(`startBoot`/`__bootStarted`/`runOnce`). Conclusão: o aviso é
provavelmente comportamento normal do SDK quando o mesmo app roda em
várias abas (este CRM suporta isso explicitamente — vi patches
"multiaba" ao longo do projeto), não um bug. Adicionei uma proteção
defensiva extra mesmo assim (barata, sem risco): `_connectSupabase`
agora reaproveita o cliente já criado em vez de criar outro, caso
algum caminho não previsto chegue a chamá-la de novo.

### Problema 6 — SSE caindo (ERR_CONNECTION_RESET) ✅ parte já existia, parte corrigida

O heartbeat do lado do servidor **já existia** de uma entrega
anterior (a cada 20s, mais frequente que os 25-30s sugeridos) — nada
a fazer aí. Implementei a parte do cliente que faltava: backoff
exponencial na reconexão (10s → 20s → 40s → teto de 60s, resetando ao
conectar com sucesso), em vez do intervalo fixo de 10s de sempre.

**Dois bugs reais encontrados e corrigidos durante os próprios
testes**: minha primeira implementação aumentava o atraso mas não
reagendava o temporizador já pendente (criado com o valor antigo) —
o backoff só valeria a partir do ciclo seguinte, não imediatamente.
Só descobri isso porque escrevi o teste antes de confiar no código.

### Problema 7 — Avisos de preload ✅ confirmado e corrigido

Confirmado: 5 CSS eram carregados como preload E como stylesheet
normal poucas linhas abaixo, tornando o preload redundante. Removidos
nos dois HTMLs, mantendo o preload da fonte e das imagens de login
(sem duplicação equivalente).

## Erros cometidos e corrigidos durante esta entrega

Além dos dois bugs de backoff já mencionados: três dos meus próprios
testes tinham fatias de texto curtas demais pra alcançar o código que
eu queria verificar (cortavam ainda dentro do comentário que eu
mesmo escrevi). Pegos rodando os testes, corrigidos antes de seguir
adiante — mesma disciplina documentada na seção 2.5 do
`AI_CONTRACT.md`.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | botão de lembrete no card mobile; proteção `_lfIsRecentlyDone`/`doneAt` em `_kbHasOverdueLinkedActivity` |
| `css/lf-mobile-leads-compact-v1.css` | variante `.reminder`/`.reminder.late` |
| `js/agenda.js` | `actConfirmDone` redesenha o Kanban na hora |
| `js/supabase.js` | guarda de idempotência em `_connectSupabase`; retry estendido pra web |
| `js/lf-realtime-kanban.js` | backoff exponencial na reconexão SSE |
| `index.html`, `app.html` | cache-buster do vídeo renovado; preloads redundantes removidos |
| `tests/kb-mb-card-reminder-btn.test.js` | novo — 8 testes |
| `tests/kb-has-overdue-linked-activity.test.js` | novo — 8 testes |
| `tests/diagnostico-20260901-demais-correcoes.test.js` | novo — 12 testes |
| `tests/lf-realtime-kanban.test.js` | +3 testes (backoff) |

## Verificação

```
node --check (todos os arquivos .js tocados) → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 268/268 testes (237 + 31 novos)
npx cap sync                     → android/ios sincronizados, 8 arquivos confirmados byte a byte
Renderização visual              → confirmado os dois estados do botão mobile com CSS de produção real
```

## Balanço honesto

De 7 problemas apontados: **5 confirmados exatamente como descritos e
corrigidos**, **1 parcialmente já resolvido** (heartbeat do servidor,
Problema 6), **1 com causa incorreta** (Problema 5) mas endereçado
com proteção defensiva mesmo assim. Nenhum problema foi corrigido às
cegas — cada um foi verificado contra o código real primeiro.

## Reversão

Reversível arquivo por arquivo. Todas as mudanças são aditivas ou
extensões de lógica já existente e comprovada — nenhuma reescreve
comportamento em uso.
