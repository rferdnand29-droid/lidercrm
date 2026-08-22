# FIX — Bolinha vermelha na aba Negócios sem atividade atrasada (supervisor) — 2026-08-20

## Sintoma
A aba **Negócios** (e potencialmente **Leads**) mostra a bolinha vermelha de alerta
mesmo quando o usuário — tipicamente **supervisor/ADM** — não possui nenhuma
atividade atrasada visível. A bolinha não some, não há card clicável associado, e o
usuário não consegue "resolver" a pendência.

## Causa raiz (3 frases)
1. `js/patches/notificacoes/lf-tab-dots-notif-fix-20260729.js` → `_lfBoardHasOverdue(board)`
   lê o cache local `getActivitiesLocalFor(S.userId)` (chave `lf6_act_<uid>`) e filtra apenas
   por `a.userId === S.userId` (tolerando campo ausente). Não verifica se o card da atividade
   existe no board do próprio usuário.
2. Supervisor/ADM que cria lembrete **na visão Time** (olhando o quadro de um consultor)
   grava a atividade com `userId` do SUPERVISOR (quem criou), mas `clientId` apontando para
   um card que está no board do CONSULTOR (`lf6_kb_negocios_<uid_consultor>`), não no dele.
   Outras telas (painel de atividades, agenda de equipe) também escrevem no cache
   `lf6_act_<uid_sup>` com registros de terceiros quando `userId` vem ausente em registros antigos.
3. A guarda anti-etapa-terminal do fix `LF-FIX-3BUGS-v1-20260819` só neutralizava a atividade
   quando o card era **encontrado**; quando o card NÃO existe no board do usuário (caso do
   supervisor), o loop fazia `break` silencioso e a atividade continuava contando → bolinha
   acesa para sempre, sem atividade visível. Exatamente o sintoma relatado.

## Correção — 1 patch novo + bump de cache

### A) Novo patch: `js/patches/notificacoes/lf-fix-tab-dot-negocios-ownership-v1-20260820.js`
Wrap idempotente em `window._lfTabHasAlerts` (definida pelo patch original de 2026-07-29).
Para as abas `leads`/`negocios`, a bolinha só acende se a atividade atrasada passar por
TRÊS checagens:
   1. **dono** — `a.userId` ausente ou igual a `S.userId` (mesma tolerância do código original);
   2. **card existe** — `a.clientId` precisa existir em `getKBFor(board, S.userId)`. Se o card
      não está no board do usuário, é atividade de outro dono/órfã → **não acende**;
   3. **etapa não-terminal** — card não pode estar em `desc/noshow/conv/desist/fechado`
      (idêntico ao critério do fix de 2026-08-19 e do `_kbHasOverdueLinkedActivity` do kanban.js).

Para as demais páginas (`chat` etc.), delega 100% ao provider original — nada muda.
A ordenação no HTML garante que este patch carrega DEPOIS do `lf-tab-dots-notif-fix`, fazendo
wrap por cima da função final. Se o patch original não estiver presente, o wrap falha
silenciosamente e nada quebra.

### B) Bump de cache/deploy
| Ponto | Antes | Agora |
|---|---|---|
| `<meta name="lf-build-id">` nos 4 HTMLs | `20260819-leadchat-r1` | `20260820-negdot-r1` |
| `js/lf-build-info.js` → `builtAt` | `2026-08-18 12:40 UTC` | `2026-08-20 00:45 UTC` |
| `?v=` em `lf-tab-dots-notif-fix-20260729.js` | `20260819leadchat1` | `20260820negdot` |
| nova tag `<script>` nos 4 HTMLs | — | `lf-fix-tab-dot-negocios-ownership-v1-20260820.js?v=20260820negdot` (logo após o tab-dots) |
| espelho `www/js/patches/notificacoes/` | — | novo arquivo copiado |

O `app-update-checker` detecta o `lf-build-id` novo e força `_doCleanReload()` nas abas abertas;
o `?v=` novo ignora o `Cache-Control: immutable` do Cloudflare Pages.

## Fluxo esperado pós-deploy
1. Supervisor abre o app → novo patch ativo → bolinha de Negócios só acende se existir
   atividade vencida, não concluída, vinculada a card **do próprio board dele** e em etapa ativa.
2. Atividades criadas por engano na visão Time (userId do supervisor + card de consultor)
   deixam de acender a bolinha — o card não está no board dele, logo não é acionável por ele.
3. Consultor comum não regride: atividade própria em card próprio ativo continua acendendo.
4. Abas antigas recarregam sozinhas em ≤ 4 min (ou no foco) pelo app-update-checker.

## Reversibilidade
Basta remover a tag `<script>` do patch nos 4 HTMLs (ou renomear o arquivo) e fazer novo bump
de `?v=`/build-id. Nenhum dado é apagado; nenhum backend, SW ou migration foi tocado.

## Arquivos alterados
- `js/patches/notificacoes/lf-fix-tab-dot-negocios-ownership-v1-20260820.js` (novo)
- `www/js/patches/notificacoes/lf-fix-tab-dot-negocios-ownership-v1-20260820.js` (espelho)
- `index.html`, `app.html`, `www/index.html`, `www/app.html` (tag script + build-id + ?v=)
- `js/lf-build-info.js`, `www/js/lf-build-info.js` (builtAt)
