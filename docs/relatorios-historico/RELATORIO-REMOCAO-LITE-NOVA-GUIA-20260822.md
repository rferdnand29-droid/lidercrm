# RELATÓRIO — Removido modo "lite" do botão direito → nova guia

**Data:** 22/08/2026
**Pedido:** remover a versão "lite" que abria ao clicar com botão
direito numa aba e escolher "Abrir em nova guia" — deve abrir o
sistema padrão completo, direto na página certa, o mais rápido
possível.

## O que encontrei

O botão direito nas abas de navegação (implementado em
`js/patches/chat/nucleo/lf-attachments-newtab-v1-20260721.js`) chama
`openInNewTab()` → `openPageWindow()` (em `js/app.js`), que montava
essa URL:

```
app.html?page=<página>&lite=1&popup=1&handoff=<token>
```

**`lite=1` não removia nenhuma funcionalidade** — investigando o
código de inicialização, o modo lite chama exatamente as mesmas
funções do modo normal (carregar filtros salvos, departamentos,
atividades, notificações, motor de automação, logo, nome do CRM,
permissão de notificação, push) — só que **de propósito atrasadas**,
em cascata, de 250ms até 2500ms depois do carregamento. Isso é
exatamente o que causava a sensação de "não muito sincronizada": por
alguns segundos depois de abrir, a aba nova mostrava dado
desatualizado (notificações, atividades) enquanto o modo normal já
tinha tudo carregado na hora.

**`popup=1` nunca era lido em lugar nenhum do código** — parâmetro
morto, sem nenhum efeito.

**Abria `app.html`, não `index.html`** — que é o que
`https://lidercrm.pages.dev/` serve de verdade na raiz.

## Correção

A URL agora é:

```
index.html?page=<página>&handoff=<token>
```

- **`index.html`** em vez de `app.html` — exatamente o arquivo que o
  domínio raiz serve, batendo com "como se tivesse aberto
  https://lidercrm.pages.dev/".
- **Sem `lite=1`** — a nova guia agora roda a mesma inicialização
  completa e imediata da aba principal, sem atraso artificial.
- **Sem `popup=1`** — removido por não ter efeito nenhum (limpeza).
- **`handoff=` mantido** — não afeta a velocidade de entrar logado (a
  sessão já vem do `localStorage`, compartilhado entre abas da mesma
  origem, então isso já era instantâneo) — só transfere qual
  filtro/conversa estava aberta na aba de origem, pra você não cair
  numa visão em branco.
- **`?page=` mantido** — continua abrindo direto na aba/página
  específica que você clicou, não na tela inicial.

## Sobre "ser rápido já que já terá um aberto"

A sessão de login já vinha do `localStorage` (instantâneo, não muda).
O que mudou é que os dados FRESCOS do servidor (notificações,
atividades etc.) agora chegam **imediatamente**, em vez de atrasados
de propósito — ou seja, a nova guia fica mais rápida pra ficar
sincronizada, não mais lenta pra abrir.

## Arquivo

| Arquivo | Mudança |
|---|---|
| `js/app.js` | `openPageWindow()` — URL sem `lite`/`popup`, aponta pra `index.html` |

## Verificação

```
node --check js/app.js           → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Clicar com o botão direito numa aba de navegação (CRM, Agenda,
   Papo etc.) → "Abrir em nova guia".
2. Conferir que a URL não tem mais `lite=1`/`popup=1`.
3. Conferir que a nova guia abre direto na página certa, com
   notificações/badge/atividades já atualizados, sem esperar alguns
   segundos.

## Reversão

Reversível — é uma única linha em `js/app.js`, sem migração de dado.
