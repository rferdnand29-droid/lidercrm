# Lider CRM

CRM legado em JavaScript global, servido como site estático pelo Cloudflare
Pages, com API em Cloudflare Pages Functions/Workers, Supabase REST e
Capacitor para Android/iOS.

## Desenvolvimento

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run mirror:check
```

O runtime principal não é o scaffold React/TanStack que permanece em `src/`.
A entrada oficial do CRM é `index.html`; `app.html` e `www/` são artefatos
gerados. Não edite os espelhos manualmente.

## Configuração de produção

Configure no ambiente do Worker, nunca no frontend:

- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ALLOWED_ORIGINS`
- `SUPABASE_SERVICE_ROLE`, quando o backend precisar operar com service role
- `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE`, se o
  envio de WhatsApp estiver habilitado

Com `ENV=production`, o Worker bloqueia as rotas quando os checks obrigatórios
de segurança estiverem incompletos. A rota pública `/api/v1/health` mostra
somente os nomes dos checks pendentes.

## Capacitor

```sh
npm run cap:sync
```

Esse comando recria `www/` a partir da raiz antes de sincronizar os projetos
nativos.

## Continuação

Consulte `CONTINUACAO_ETAPA1.md` para retomar o trabalho em outra conta sem
repetir a auditoria.