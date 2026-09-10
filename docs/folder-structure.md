# Estrutura de pastas — mapa completo

> Índice rápido em uma tela. Para o histórico de COMO se chegou nessa
> estrutura, ver `ESTRUTURA-DO-PROJETO.md` (raiz). Para o modelo mental
> de como isso tudo *carrega* no navegador, ver `docs/architecture.md`.

```
lidercrm/
├── index.html            # fonte oficial do entry point (SPA completo)
├── app.html               # espelho gerado de index.html
├── 404.html                 # página de erro estática do Cloudflare Pages
├── capacitor.config.json      # empacotamento do app nativo (Android/iOS)
├── package.json                 # nenhuma dependência de runtime — só scripts wrangler
├── _headers / _redirects          # config Cloudflare Pages (headers HTTP / rotas)
│
├── js/                    # módulos "principais" do client, um por tela/domínio
│   ├── *.js                     # ~40 arquivos: auth.js, kanban.js, leads.js, chat.js, etc.
│   ├── shared/                    # utilitários client compartilhados (inclui data-worker.js)
│   └── patches/                     # ~100 patches incrementais, carregados DEPOIS dos módulos principais
│       ├── chat/                        # tudo exclusivo da aba Papo (ver README próprio)
│       ├── kanban-leads/                  # quadro, contador de ligações, drag
│       ├── notificacoes/                    # serviço global de notificação
│       ├── usuarios-auth/                     # ponte de auth legado, permissões, usuários
│       └── (raiz de patches/)                   # o que toca >1 área ou é infra geral (boot, splash, PWA)
│
├── src/                   # segunda geração de organização (namespaces + camadas), TAMBÉM carregada via <script>
│   ├── core/                     # bridge com legado, contratos de API, subsistema offline
│   ├── modules/                    # modularização parcial por domínio (window.LiderCRM.modules.<área>)
│   ├── repositories/                  # acesso a dados do client, por entidade (clientes, leads, financeiro...)
│   ├── services/                        # regras de orquestração do client, por entidade
│   └── shared/                            # config runtime, http clients, state store, utils (parte nova/aditiva)
│
├── css/                    # todo o CSS, mesmo padrão de patches/ do js/
│   ├── style.css, lf-consolidated-mobile.css, lf-mobile-leads-*.css   # CSS geral (afeta o app inteiro)
│   ├── chat/                     # CSS exclusivo da aba Papo
│   └── login/                      # CSS exclusivo da tela de login (parte só existe em index.html — ver nota)
│
├── assets/                   # mídia estática (sons, vídeos de fundo do login)
│
├── functions/                  # convenção Cloudflare Pages Functions
│   └── [[path]].js                # catch-all — TODO /api/* passa por aqui primeiro
│
├── _worker_src/worker/           # o backend de verdade (importado por functions/[[path]].js)
│   ├── controllers/                 # um por recurso REST (leads, kanban, usuarios, branding...)
│   ├── middlewares/                   # cors, rate-limit, auth (autenticação), authz (autorização)
│   ├── services/                        # regras de negócio server-side (inclui services/auth/, subpasta)
│   ├── repositories/                      # acesso a Supabase/Postgres via supabase-rest
│   ├── routes/                              # router.js — tabela de rotas → controller
│   ├── schemas/ validators/                   # validação de payload por rota
│   ├── errors/                                  # hierarquia de erros HTTP
│   ├── lib/                                       # clientes de baixo nível (supabase-rest, fs-documents)
│   └── utils/                                       # crypto, env, etag, logger, response
│
├── sql/
│   ├── migrations/              # schema, ordem cronológica, roda uma vez cada (manual, sem ferramenta tipo Prisma)
│   └── manutencao/                 # scripts operacionais (rodar quando precisar, não fazem parte da evolução do schema)
├── migrations/                       # 1 arquivo solto (fase1_push_devices.sql) — ver docs/database.md
│
├── tools/                    # scripts de linha de comando, separados por TIPO de ação
│   ├── apply/                   # aplica um patch/fix
│   ├── rollback/                  # reverte um patch específico
│   ├── verificacao/                 # confere se um patch está corretamente instalado
│   └── diagnostico/                   # ferramentas de diagnóstico avulsas (inclui uma .html)
│
├── diagnostics/               # crash-reporter carregado no boot
│
└── docs/                    # você está aqui
    ├── patches/                 # relatórios pontuais de patches específicos (não reorganizado, só 5-6 arquivos)
    └── *.md                        # documentação transversal (este arquivo é um deles)
```

## Convite: "onde eu mexo para resolver X?"

| Preciso... | Vou em... |
|---|---|
| Corrigir um bug visual numa tela específica | `js/<tela>.js` primeiro, depois `js/patches/**` (o bug pode já estar envelopado por um patch) |
| Adicionar um novo endpoint de API | `_worker_src/worker/routes/router.js` + `controllers/` + `schemas/` — ver `docs/worker.md` |
| Entender por que um dado vem diferente do esperado | `_worker_src/worker/repositories/` (tradução de nomes) — ver `docs/database.md` |
| Mudar quem pode ver/editar o quê | `js/auth.js` (CARGO_CAPS, client) **e** `_worker_src/worker/middlewares/authz.js` (espelho, server) — ver `docs/permissions.md` |
| Adicionar um novo patch client-side | `js/patches/<categoria>/` — seguir `docs/coding-standards.md` |
| Rodar/reverter algo manualmente | `tools/apply/` · `tools/rollback/` · `tools/verificacao/` |
| Aplicar uma mudança de schema | `sql/migrations/` — ver `docs/database.md` |

## Duas pastas com propósito "achatado" (não por assunto)

- `tools/` é organizado por **tipo de ação** (aplicar/reverter/verificar/diagnosticar), não por assunto — intencional, ver `ESTRUTURA-DO-PROJETO.md`.
- `js/patches/` (raiz, fora das 4 subpastas por assunto) junta tudo que **não tem um dono único** — toca mais de uma tela, ou é infraestrutura (boot, splash, manifest PWA, branding). Forçar isso numa categoria única seria enganoso.

## O que NÃO existe neste projeto (e por quê importa saber)

- **Não existe bundler.** Nenhum `import`/`export` em `js/`/`src/` (client). Tudo roda em escopo global via `<script>` em ordem manual fixa.
- **Não existe framework de componentes.** UI é construída via `innerHTML` de string.
- **Não existe pasta `node_modules/` versionada nem dependência de runtime** — ver `docs/dependencies.md`.

Se uma tarefa pedir para "criar `modules/<área>/components/Button.jsx`" ou similar, pare: isso pressupõe uma arquitetura que este projeto não tem, e criar esse arquivo sozinho não conecta a nada. Ver `docs/ai-guide.md`.
