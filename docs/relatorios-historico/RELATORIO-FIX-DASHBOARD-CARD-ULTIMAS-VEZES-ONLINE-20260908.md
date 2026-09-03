# RELATORIO-FIX-DASHBOARD-CARD-ULTIMAS-VEZES-ONLINE-20260908

## Pedido

Remover, na versão de PC, o card do consultor com estatísticas
(Clientes/Fechados/Conversão) e o botão "+ Lançar Cliente", colocando
no lugar as últimas vezes que o usuário específico esteve online.

## Onde ficava

O card é exclusivo de desktop — já tinha uma regra de CSS escondendo
ele (junto com a busca e os filtros) na versão mobile, que usa um
dashboard totalmente diferente (`#mobile-dash`, com outros KPIs).
Confirmado que a captura de tela era exatamente esse card.

## Estratégia

Mantido o cabeçalho "Consultor: [nome]" (identifica de quem é a
lista, que é justamente o que "usuário específico" pede). Substituído
o miolo (estatísticas + botão) por uma lista das últimas 5 vezes que
o consultor logado esteve online — reaproveita o feed de eventos de
login que já existe no sistema (`logFeedEvent('login',...)`, disparado
a cada login), sem precisar de nenhum dado novo no backend. A sessão
atual (login nos últimos 5 minutos) aparece destacada em verde como
"Agora (sessão atual)".

O botão "+ Lançar Cliente" foi removido sem perda de funcionalidade —
já existe um botão equivalente (o "+" flutuante do canto, que também
abre a tela de criar lead) presente na mesma página.

## Fluxos cobertos

- PC: card mostra o nome do consultor + últimas 5 vezes online.
- Mobile: sem nenhuma mudança (já usa um dashboard diferente).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `index.html`, `app.html`, `www/*` | card substituído |
| `js/dashboard.js` | nova função `_renderMyLastSeenList`; removido preenchimento das estatísticas antigas |

## Verificação

```
node --check js/dashboard.js     → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ios sincronizados
```

Testado visualmente (renderização com o CSS real) — card aparecendo
corretamente, com destaque verde na sessão atual.

## Como validar manualmente

1. Abrir o Bingo/Dashboard no PC — o card do consultor deve mostrar
   "Últimas vezes online" em vez das estatísticas antigas.
2. Fazer login de novo (ou olhar logo após logar) — a entrada mais
   recente deve aparecer como "Agora (sessão atual)", em verde.

## Reversão

Reversível — reverter os 2 arquivos HTML e o `js/dashboard.js`, sem
migração de dado.
