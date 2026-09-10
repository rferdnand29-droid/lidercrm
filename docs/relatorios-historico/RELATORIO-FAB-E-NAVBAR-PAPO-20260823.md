# RELATÓRIO — Remoção do botão "+" flutuante + barra de navegação persistente no Papo

**Data:** 23/08/2026

---

## 1. Botão "+" vermelho removido

**O que era:** `#leads-fab`/`#negocios-fab` — botões flutuantes que
faziam exatamente a mesma coisa que "+ Criar Lead"/"+ Criar Negócio",
já sempre visíveis na barra de filtros desde a reorganização da lista
(sessão anterior). Ficavam sobrepondo cards ao rolar a tela, como na
sua foto.

**Achado no caminho:** existia uma tentativa anterior, incompleta, de
já remover isso — um comentário no CSS dizia que `#leads-fab`
"ficava fora de propósito" numa regra específica, mas **outra regra,
em outro arquivo, forçava ele visível de novo** (`display:flex
!important`), vencendo a tentativa de esconder. Isso explica a
inconsistência.

**Correção:** removidos os dois botões do HTML por completo (não só
escondidos) — e limpas todas as regras de CSS que existiam só pra
controlar a visibilidade deles, incluindo a que estava forçando o
reaparecimento. Nada mais tenta reviver esses botões.

---

## 2. Barra de navegação não desaparece mais ao entrar no Papo

**O que era:** a barra com os ícones Início/CRM/Agenda/Papo/Menu
(`#mobile-bottom-nav` — apesar do nome, ela fica no topo da tela, logo
abaixo da barra "Papo da Empresa"/CRM) tinha uma regra específica que
a escondia toda vez que uma conversa era aberta.

**Correção:** removida essa regra específica — a barra agora continua
visível dentro do Papo, igual nas outras telas. Mantive intacta a
outra regra que já existia (esconder quando o **teclado** abre, pra
dar mais espaço pra digitar) — essa é uma preocupação diferente e
ainda faz sentido.

**Ajuste necessário junto:** como essa barra ocupa ~60px de altura e
agora fica visível o tempo todo dentro do Papo, o cálculo de altura
do painel do Papo (que antes só reservava espaço pra barra de cima)
precisou passar a reservar espaço pra essa barra também — senão o
conteúdo do Papo ficaria parcialmente escondido atrás dela. Ajustado
junto, inclusive com a mesma exceção pro estado de teclado aberto
(onde a barra volta a sumir, então não precisa reservar espaço ali).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `index.html`, `app.html` | botões `#leads-fab`/`#negocios-fab` removidos |
| `css/style.css` | limpeza das regras de visibilidade do FAB removido |
| `css/lf-consolidated-mobile.css` | limpeza do FAB; barra de navegação não esconde mais no Papo; altura do painel do Papo ajustada |
| `css/lf-mobile-leads-list-fix.css` | limpeza das regras que forçavam o FAB visível |

## Verificação

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Na lista de Leads/Negócios, rolar a tela — não deve mais aparecer
   nenhum botão "+" vermelho flutuante sobre os cards.
2. Entrar no Papo (lista e dentro de uma conversa) — a barra
   Início/CRM/Agenda/Papo/Menu deve continuar visível no topo.
3. Tocar no campo de digitar mensagem (abrir o teclado) — aí sim essa
   barra deve sumir temporariamente, voltando quando o teclado fechar.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
