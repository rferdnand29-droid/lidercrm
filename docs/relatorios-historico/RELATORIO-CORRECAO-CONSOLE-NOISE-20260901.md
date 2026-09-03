# RELATÓRIO — Correção de ruído de console e watchdogs duplicados
**Data:** 2026-09-01 · **Patch:** FIX-20260901

## Sintomas relatados (console de produção)

| # | Log | Causa raiz |
|---|-----|-----------|
| 1 | `Uncaught TypeError: Cannot read properties of undefined (reading 'startTime') at et.reportAllChanges` | **Extensão do navegador** injetando `web-vitals` do Google (assinatura `VM211`, sem URL de arquivo). Zero ocorrências no código-fonte. Confirmado por relatório anterior (`RELATORIO-CORRECAO-ERROS-CONSOLE-404-VIDEO-20261010.md`). |
| 2 | `[safety-net] forçando saída da splash após 12s` + diagnóstico do boot | Boot lento (`initDB`/`bootApp` > 12s). Efeito, não causa. Duplicava com o watchdog de 10s. |
| 3 | `[lf-notif-sound-stuck-fix] supressão travada >800ms` (repetido) + `[lf-hotfix-notif-ativ-v1] supressão travada > 1s` (repetido) | **Dois watchdogs** vigiando a mesma flag `_soundSuppressed` (2s e 1s): um destravava, o outro ainda via `true` por 1 tick e logava de novo → loop de warns. Agravante: wrap de `_chatPollNewMsgs` engolia exceção e **não devolvia a Promise**, quebrando o encadeamento assíncrono. |
| 4 | `watchdog: forçando saída da splash após 10s` | Mesma causa do #2 (boot lento) — redundância com o safety-net de 12s. |
| 5 | `[kb] livre pool fetch falhou` (`kanban.js:191`) | Falha de rede/sessão no endpoint `kanbanLivrePool()`. Cache local mantém a UI funcional — era ruído sem contexto e sem backoff (spamma retry com backend fora). |

## Correções aplicadas

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `js/kanban.js` | `.catch` enriquecido: log com mensagem real + nº da tentativa; **backoff exponencial** 30s→60s→120s (cap); **silêncio em 401** (deslogado — safetynet-diag já cobre); dedup de warn 30s. `_lfLivrePoolServerCache`/`lf6_livre_pool_cache` e o `then` de sucesso **intocados**. |
| 2 | `js/patches/notificacoes/lf-fix-notif-sound-stuck-v1-20260804.js` | Wrap de `_chatPollNewMsgs` agora **sempre retorna Promise** (sintetiza `Promise.resolve` se o wrap antigo não devolver; `Promise.reject` capturável em erro). **Watchdog local (Parte 3) desativado** — vira no-op; fica apenas o do hotfix v1. |
| 3 | `js/patches/lf-hotfix-notif-som-e-atividades-v1-20260804.js` | Watchdog único mantido (1s) com **dedup de log de 10s** — só avisa 1x a cada 10s enquanto continuar travando. |
| 4 | `js/patches/lf-fix-safety-net-diag-v1-20260804.js` | `window.onerror` agora **filtra scripts `VM*`/`chrome-extension:`/`moz-extension:`** (registra breadcrumb, não propaga como `lastErr`, suprime do console). Warn do safety-net de 12s tem **dedup 1x/sessão** e é suprimido se o splash-unstuck de 10s já agiu. |
| 5 | `js/patches/lf-splash-unstuck-v1-20260801.js` | `_forceExit` agora marca `window.__LF_SPLASH_UNSTUCK_FIRED__` — sinaliza ao safety-net de 12s que a saída já foi forçada (sem warn duplo). |
| 6 | **NOVO** `js/patches/lf-fix-console-noise-v2-20260901.js` | Camada externa de filtro: suprime erros `web-vitals`/`reportAllChanges` de origem `VM*`/extensão no `console.error`; 2ª camada de dedup (30s) para warns de supressão; suprime warn do safety-net quando redundante. API de debug: `LF_CONSOLE_NOISE_V2.stats()`. Registrado em `app.html`/`index.html` **depois** do hotfix-notif. |

## Arquivos sincronizados (byte a byte)

Todos os 8 arquivos foram replicados para os 3 mirrors:
- `www/`
- `android/app/src/main/assets/public/`
- `ios/App/App/public/`

Verificação com `cmp`: **24/24 OK**.

## O que NÃO foi corrigido (e por quê)

- **Sintoma 1 (web-vitals):** impossível corrigir pelo código do CRM — o script é injetado pela extensão do navegador do usuário. O fix 4/6 apenas **esconde o ruído** do console. Para eliminar de vez: testar em aba anônima ou desativar a extensão de SEO/performance responsável.
- **Boot lento > 10s (sintomas 2/4):** o safety-net é sintoma; a causa raiz (latência do Supabase/`initDB` no arranque) exige investigação separada dos breadcrumbs que o safetynet-diag loga no objeto `diagnóstico do boot`. Se o último breadcrumb for `initDB:start` sem `initDB:ok`, é a nuvem; se for `bootApp:start`, é renderização local.

## Verificação

```
node --check em todos os 6 arquivos JS → OK
cmp em 24 pares (raiz × 3 mirrors)     → 24/24 idênticos
tags <script> do novo patch             → presentes em app.html e index.html (raiz + 3 mirrors)
```

## Reversão

Reversível arquivo por arquivo. Para reverter tudo: restaurar os 7 arquivos alterados e remover `js/patches/lf-fix-console-noise-v2-20260901.js` + as 2 linhas de `<script>`/`<!-- -->` em `app.html` e `index.html` (e nos 3 mirrors).
