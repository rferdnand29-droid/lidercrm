# RELATORIO-FIX-LIMPEZA-CODIGO-MORTO-PESO-20260908

## Pedido

Remover lixo, arquivos que só pesam e código que pode causar bugs —
só o que tem certeza que não quebra nada após o deploy.

## O que foi verificado e removido

### 1. Código morto criado na tarefa anterior
A substituição do card do consultor (estatísticas → "últimas vezes
online") deixou órfãs 2 telas inteiras que nada mais abria:
- Modal "Lançar Cliente" (`#mo-l`) + funções `openLancar()`/`saveC()`.
- Modal "Ver Clientes" (`#mo-c`) + função `openMyModal()`.

Confirmei que **nenhum outro lugar do código** chamava essas funções
antes de remover — eram inalcançáveis desde a última mudança.

### 2. Procura por bugs "silenciosos" (implementações duplicadas)
Depois de ter encontrado e corrigido um bug real de duas
implementações concorrentes da mesma função com valores diferentes
(TTL de 5 minutos vs 7 dias, numa correção anterior), procurei
sistematicamente por qualquer OUTRO caso parecido — função ou
constante global definida duas vezes em arquivos diferentes, que
poderia estar silenciosamente sobrescrevendo uma à outra.

**Nenhum outro caso encontrado.** Achei 2 nomes de função repetidos
(`finishOne`, `onOutside`), mas confirmei que são funções internas,
definidas dentro de escopos diferentes (uma para anexos, outra para
lista administrativa) — não colidem entre si, é o jeito normal e
seguro de organizar código em JavaScript.

### 3. Peso — pastas nativas regeneráveis
`android/` e `ios/` (quase 20MB juntas) removidas desta entrega —
são saída de build 100% regenerável a partir do mesmo código-fonte
(`npx cap sync`), mesma decisão já tomada em limpezas anteriores.

## O que foi verificado e **não** mexido, por segurança

- Nenhum patch JS órfão encontrado (todos os arquivos em
  `js/patches/` continuam referenciados no HTML).
- Nenhum CSS órfão encontrado.
- O scaffold React/TanStack (~600KB, achado numa limpeza anterior)
  continua intocado — é provavelmente usado pela própria plataforma
  Lovable (que este projeto está conectado), não pelo CRM, e o risco
  de atrapalhar sua conta lá não compensa o pouco espaço.

## Tamanho

| | Antes | Depois |
|---|---|---|
| Total do projeto | 40MB | 21MB |

## Arquivos

| Arquivo | Mudança |
|---|---|
| `index.html`, `app.html`, `www/*` | 2 modais órfãos removidos |
| `js/clientes.js` | 3 funções órfãs removidas (`openLancar`, `saveC`, `openMyModal`) |
| `android/`, `ios/` | removidos desta entrega (regeneráveis) |

## Verificação

```
node --check js/clientes.js     → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
```

## Reversão

Reversível — `android/`/`ios/`:
`npx cap add android && npx cap add ios && npx cap sync`. Modais/
funções removidos: reverter os 3 arquivos tocados, sem migração de
dado.
