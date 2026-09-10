# RELATÓRIO — Notificação de Lead adicionado com você como responsável

**Data:** 22/08/2026
**Pedido:** notificar quando um Lead for adicionado com a pessoa como
responsável, e o clique na notificação levar direto pra ele.

## O que já existia

O clique em notificação **já funciona** — `notifItemClick()` já abre o
card certo quando a notificação tem `cardId`+`board` preenchidos
(mesmo mecanismo já usado pela notificação de "transferido para
você"). Não precisei construir essa parte.

## O que faltava — e onde

Rastreei todo lugar do sistema onde um Lead/Negócio é criado, pra
achar onde alguém pode ser adicionado JÁ com outra pessoa como
responsável:

- **Criação manual individual** (o formulário "+ Criar Lead"): sempre
  salva pro próprio usuário logado — não dá pra escolher outra pessoa
  ali. Não precisa de notificação (quem cria já é o próprio
  responsável).
- **Importação em lote**: **aqui sim** — tem um seletor de "responsável"
  que pode ser qualquer pessoa da equipe, diferente de quem está
  importando. Esse era o único ponto do sistema onde alguém podia
  virar responsável por um Lead novo sem ter feito nada — e não
  existia nenhuma notificação disparada.
- Confirmei também que não existe nenhum webhook/formulário externo de
  captação de lead neste CRM — a importação em lote é realmente o
  único caminho.

## Correção

Adicionada a notificação na importação em lote:

- **1 lead importado:** notificação aponta direto pro card — clicar
  abre ele, igual já acontece com "transferido para você".
- **Vários leads de uma vez:** notificação aponta pro board (Leads ou
  Negócios) — clicar leva pra lista, já que não tem como apontar pra
  vários cards ao mesmo tempo. Aproveitei pra ensinar o clique de
  notificação a fazer essa navegação por board também (antes, uma
  notificação sem card específico não fazia nada ao clicar).
- Só notifica se o responsável escolhido for **outra pessoa** — quem
  faz a própria importação pra si mesmo não recebe notificação (já
  sabe, óbvio).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | notificação na importação em lote |
| `js/notificacoes.js` | clique em notificação sem card específico agora navega pro board |

## Verificação

```
node --check js/kanban.js js/notificacoes.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Como ADM/supervisor, importar em lote 1 lead, escolhendo outra
   pessoa como responsável.
2. Logar como essa pessoa (ou conferir o sininho dela) — deve aparecer
   a notificação "🆕 [nome] foi adicionado como seu novo lead".
3. Clicar na notificação — deve abrir o card direto.
4. Repetir importando vários de uma vez — a notificação deve resumir
   a quantidade, e o clique deve levar pro board de Leads.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
