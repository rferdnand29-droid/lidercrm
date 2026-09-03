# Guia para IA — leia isto antes de tocar em qualquer arquivo

Este documento existe porque a Regra nº 17 da missão de arquitetura
pede explicitamente um projeto "IA friendly". Ele é o ponto de entrada
— os outros documentos em `docs/` são referência profunda, este é o
resumo executivo + os erros mais fáceis de cometer especificamente
neste projeto.

## Os 5 fatos que mudam como você deve abordar qualquer tarefa aqui

1. **Não existe bundler.** Zero `import`/`export` em `js/`/`src/`
   client-side. Tudo é `<script>` solto, em ordem manual fixa, definida
   uma vez em `index.html`; `app.html` é gerado a partir dele. Se sua tarefa pressupõe
   resolução automática de módulo, ela não se aplica aqui sem antes
   virar uma decisão consciente de introduzir um bundler — o que é uma
   reescrita, não uma reorganização.
2. **`index.html` é a única fonte HTML.** `app.html` é gerado por
   `npm run html:sync` (e também pelo build do Capacitor), portanto não
   edite os dois manualmente. Ao mudar a ordem de scripts ou links,
   edite apenas `index.html` e rode `npm run html:sync`.
3. **Ordem de carregamento = ordem de comportamento.** A maioria dos
   ~100 arquivos em `js/patches/` envelopa (wrap) uma função global já
   existente. Trocar a ordem de dois `<script>` pode mudar
   silenciosamente qual patch roda primeiro. `<script defer>` roda
   depois de TODO script não-defer, não importa a posição no HTML. Ver
   `docs/architecture.md`.
4. **Nomes usados no app ≠ nomes reais de coluna no Postgres.**
   `nome`→`full_name`, `telefone`→`phone`, `ativo`→`active`. Ver
   `docs/database.md` antes de escrever qualquer SQL novo.
5. **Autenticação/autorização vivem em DOIS arquivos que não se
   sincronizam automaticamente**: `js/auth.js` (client) e
   `_worker_src/worker/middlewares/authz.js` (servidor, fonte de
   verdade real). Ver `docs/permissions.md`.

## O que está EXPLICITAMENTE fora dos limites (sem autorização separada e explícita)

Banco, Supabase, Cloudflare Worker/Pages config, Capacitor, SQL,
migrações, autenticação, login, sessões, tokens, cookies, permissões,
rotas, sincronização, offline, cache, notificações, integrações,
endpoints, APIs, regras de negócio, algoritmos, fluxo, bibliotecas,
versões de dependência, CI/CD. Esta lista é literal — vem da missão de
arquitetura original que gerou esta reorganização. Se uma tarefa nova
pedir para mexer em algo desta lista, isso não é mais "reorganização/
documentação" e precisa de instrução explícita e específica pra isso.

**Permitido sem pedir**: mover arquivo (com imports/refs corrigidos),
padronizar nome de arquivo/pasta, separar componente/service/helper,
eliminar duplicação ÓBVIA e morta (não "parecida"), criar/atualizar
documentação, componentizar interface SEM mudar HTML/CSS/JS/eventos
renderizados.

## As três (e meia) gerações de código coexistindo

Ver `docs/modules.md` para o catálogo completo. Resumo pra reconhecer
rápido qual geração você está olhando:

| Se o arquivo... | É da geração... |
|---|---|
| Fica direto em `js/*.js`, define função global sem namespace | 1 — original |
| Fica em `js/patches/**`, nome com `lf-*-vN-AAAAMMDD` | 1.5 — patch incremental |
| Fica em `src/modules/<área>/runtime/`, usa `window.LiderCRM.modules.*` | 2 — modularização parcial |
| Fica em `src/{core,repositories,services,shared}/` | 2.5 — camadas transversais |
| Fica em `src/shared/utils/namespace.js` | Base transversal ativa do namespace `LiderCRM.utils` |
| Fica em `diagnostics/crash-reporter.js` | Observabilidade carregada no boot |
| Fica em `_worker_src/worker/**` | Backend — import/export ES module de verdade, runtime Workers, nada a ver com o client |

## Checklist de verificação antes de dizer "pronto"

```bash
# 1) sintaxe — 100% dos .js do projeto
find . -name "*.js" -not -path "*/node_modules/*" \
  -exec node --check {} \; 2>&1 | grep -v "^$"

# 2) todo src/href local em index.html e app.html
#    aponta pra um arquivo que existe (adaptar o script abaixo)
grep -oE '(src|href)="[^"]*"' index.html app.html \
  | sed -E 's/^[^:]*:(src|href)="//; s/"$//' \
  | grep -vE '^(https?:)?//|^data:|^mailto:|^tel:|^#'
# → conferir cada um contra o disco

# 3) nenhum arquivo .bak / backup solto esquecido
find . -iname "*.bak*" -o -iname "*~"

# 4) se moveu algo dentro de _worker_src/worker/: os imports relativos
#    (import ... from '../x/y.js') foram atualizados? Esse código usa
#    ES modules de verdade — um import quebrado aqui derruba a API
#    inteira, não só uma tela.

# 5) (desde 2026-08-01, Rodada 3) suíte de testes automatizados —
#    ainda pequena (13 testes), mas cobre a paridade CARGO_CAPS
#    client×worker, que é exatamente o tipo de divergência que
#    revisão manual não pega:
npm test

# 6) (desde 2026-08-01, Rodada 3) lint — informativo, não bloqueia CI
#    ainda (baseline de ~35 achados pré-existentes documentado em
#    docs/AUDITORIA-FINAL-10-20260801-RODADA3.md, não corrigido):
npm run lint
```
Isso é literalmente o que validou esta reorganização — reaplicar antes
de qualquer entrega nova.

## Achados desta auditoria (2026-08-01, complemento à sessão de reorganização)

Itens abaixo foram descobertos ao validar de forma independente o
trabalho já feito. Os itens de arquitetura continuam apenas
documentados; os arquivos comprovadamente sem consumidores foram
removidos nesta etapa.

1. **Fila única de retry com compatibilidade legada** —
   `src/core/offline/retry-queue.js` e
   `src/modules/sync/runtime/retry-queue-sync.js` compartilham
   `localStorage['lidercrm_retry_queue_v1']`. A chave antiga
   `lf_retry_q_v1` é migrada na inicialização; não crie uma segunda fila.
2. **Paridade dos entrypoints HTML** — `app.html` e os arquivos HTML
   dentro de `www/` devem ser cópias byte-a-byte de `index.html`.
   `scripts/verify-mirror.mjs` e o `ai-guard` detectam divergências.
3. **`js/shared/data-worker.js` não aparece em nenhum HTML — mas não é
   código morto.** É um Worker/SharedWorker instanciado dinamicamente
   por `js/shared/popup-state.js` via `new Worker(WORKER_URL)`. Fica
   registrado aqui só pra você não repetir o mesmo susto que essa
   auditoria teve antes de confirmar.

## Índice de toda a documentação

| Documento | Cobre |
|---|---|
| `ESTRUTURA-DO-PROJETO.md` (raiz) | Índice histórico da reorganização de pastas |
| `docs/folder-structure.md` | Mapa completo de pastas |
| `docs/architecture.md` | Como o carregamento funciona e por quê |
| `docs/modules.md` | Catálogo de todos os módulos client |
| `docs/worker.md` | Catálogo completo do backend + todas as rotas |
| `docs/data-flow.md` | Como os dados fluem, ponta a ponta |
| `docs/permissions.md` | Modelo de permissão completo |
| `docs/dependencies.md` | O que este projeto depende (pouco) |
| `docs/database.md` | Armadilhas de nome de coluna, migrações, RPCs |
| `docs/supabase.md` | Specífico de Supabase (auth, ETag, RPCs) |
| `docs/cloudflare.md` | Specífico de Cloudflare Pages/Functions |
| `docs/mobile.md` | Capacitor (Android/iOS) |
| `docs/deployment.md` | Processo de deploy passo a passo |
| `docs/maintenance.md` | Processo do dia a dia (patch, rollback, migração) |
| `docs/coding-standards.md` | Como escrever um patch sem quebrar o resto |
| `docs/troubleshooting.md` | Bugs reais já investigados, com causa raiz |
| `docs/AUDITORIA-TECNICA-20260801*.md` | Auditoria de segurança/qualidade (separada desta reorganização) |
| `docs/AUDITORIA-INDEPENDENTE-20260801-RODADA2.md` | Verificação independente desta rodada de documentação + checklist da Regra nº 19 |

Cada pasta de módulo relevante (`src/modules/*`, `_worker_src/worker/*`,
`js/patches/*`, `tools/*`, etc.) também tem seu próprio `README.md`
local — comece pelo README da pasta que você vai mexer, suba pra estes
documentos transversais só quando precisar de contexto mais amplo.
