# RELATORIO-VERIFICACAO-PRE-DEPLOY-SYNC-PC-CAPACITOR-20260902

## Pedido

Verificar e corrigir a sincronização Capacitor ↔ PC (e vice-versa)
antes do próximo deploy.

## Resultado

**Nenhum problema novo encontrado** — todos os mecanismos já
corrigidos em sessões anteriores foram reconferidos e continuam
corretos. Não foi necessário mudar nenhum arquivo nesta rodada; o que
segue é o registro de tudo que foi checado.

## Checagens feitas

### 1. Código — mesma versão nos dois lados
- `index.html`/`app.html`: todas as strings de cache-busting (`?v=`)
  idênticas entre os dois arquivos.
- `lf-build-id` idêntico nos dois.
- **Teste real**: reconstruí `www/` do zero e sincronizei os projetos
  nativos (`npx cap sync`) — comparei **byte a byte**: `index.html`,
  `app.html` e todo arquivo `.js` que toquei em sessões recentes
  (`kanban.js`, `agenda.js`, `utils.js`, `relatorios.js`,
  `clientes.js`, `app.js`, `kanban-helpers.js`) são **idênticos** nos
  4 lugares: raiz, `www/`, Android, iOS.

### 2. Conexão com o backend
- Base da API (`LiderCRM.apiBase`) presente em `index.html` e
  `app.html`.
- Detecção de plataforma nativa (`_lfNativeApiBase`) intacta em
  `js/api.js`.
- CORS do backend permite as origens do Capacitor
  (`capacitor://localhost`, `ionic://localhost`, `https://localhost`).

### 3. Sincronização de dados entre PC e app
- Sync periódico em segundo plano: intervalo de 15s presente e
  correto (`js/app.js`).
- Comparação "mudou de verdade?" independente de ordem (raiz do bug
  do "tremor" corrigido antes): presente em `js/kanban.js` e
  `js/auth.js`.
- Aviso entre abas do mesmo navegador (`BroadcastChannel`): emissor
  E receptor presentes (`js/kanban.js` envia, `js/app.js` escuta).
- Proteção contra item excluído "ressuscitar": TTL de 7 dias
  **consistente** nos dois lugares que implementam essa proteção
  (`js/utils.js` e `kanban-helpers.js` — bug de divergência corrigido
  numa sessão anterior).
- Fila de retentativas persistente conectada a `saveKBFor`
  (leads/negócios) e `saveCli` (Bingo/Clientes), ativada no boot do
  app.

### 4. Achado — como o deploy realmente funciona (bom saber antes de
subir)
`functions/[[path]].js` importa diretamente de
`_worker_src/worker/api-handler.js` — ou seja, **o backend e o site
estático publicam juntos, no mesmo `git push`**. Não existe um deploy
separado de "Worker" — todos os fixes de CORS/API já estão no lugar
certo pra irem ao ar no mesmo deploy que você está prestes a fazer.

### 5. Marca do app nativo
Conferido visualmente — o ícone gerado continua com o logo "LF" da
Líder CRM, não voltou ao placeholder genérico do Capacitor.

## Limitação arquitetural — repetindo por importância

O Capacitor empacota uma **cópia fixa** do código dentro do
APK/IPA no momento da build (`webDir` local, sem servidor ao vivo
configurado). Isso significa:

- **PC/navegador**: pega o código novo assim que o deploy termina
  (ou depois de limpar o cache do navegador — ver abaixo).
- **App Capacitor já instalado no celular**: só vai pegar o código
  novo depois de gerar um **APK/IPA novo** (`npx cap sync` +
  build no Android Studio/Xcode) **e reinstalar** no aparelho. Isso
  não é um bug — é como qualquer app Capacitor funciona por padrão.

**Dados** (leads, negócios, atividades) são diferentes — esses
sincronizam pela rede normalmente, pelos mecanismos verificados acima,
sem precisar de app novo.

## Passos recomendados depois do deploy (do próprio manual do projeto)

1. Confirmar no painel do Cloudflare Pages que o deploy terminou sem
   erro.
2. No navegador (PC): `DevTools > Application > Storage > Clear site
   data` e recarregar — o app tem cache agressivo de PWA.
3. Se for atualizar o app do celular: gerar um build novo
   (`npx cap sync` + Android Studio/Xcode) e reinstalar.

## Verificação

```
npx cap sync                     → sem erros
diff (raiz vs www vs Android vs iOS) → idênticos em todos os arquivos checados
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
```

## Conclusão

Pode seguir com o deploy — não há pendência de sincronização
identificada. A única coisa fora do seu controle imediato é a
limitação arquitetural do Capacitor (app instalado só atualiza o
código com rebuild + reinstalação), que não é algo pra "corrigir",
é como o Capacitor funciona.
