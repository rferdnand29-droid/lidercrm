# FIX 20260824 — App Capacitor não acompanhava a versão do PC

## Problema
O app exibia dados/estágios antigos porque:
1. `capacitor.config.json` tinha `server.url = https://lidercrm.pages.dev` → o app ignorava o bundle local e abria o site ao vivo (que estava 4 dias atrasado).
2. O patch do dia (transferência em massa + ADM 403) nunca tinha sido publicado no Pages.
3. O `lf-build-id` estava congelado em `20260820-sinofix` → o app-update-checker não detectava nada.

## Correções aplicadas neste ZIP
1. **Removido `server.url`** dos 3 capacitor.config.json (raiz, android, ios). O `allowNavigation` foi mantido (necessário para Supabase/Backblaze funcionarem dentro do WebView). O app agora usa o **bundle local embutido no APK** (modelo A2 recomendado) — funciona offline e a versão do app = versão do APK.
2. **Bump do `lf-build-id` → `20260824-bundlefix`** em todos os HTMLs (index/app × raiz/www/android/ios — 8 arquivos).
3. **Novo script `scripts/release-and-sync.mjs`** que automatiza tudo: gera build-id por data/hora, atualiza os HTMLs, remove server.url se reaparecer, roda build-capacitor-www + verify-mirror e mostra o comando de deploy.

## Como usar daqui pra frente
```bash
node scripts/release-and-sync.mjs   # bump + build + verify
npx cap sync                        # joga o bundle novo nos projetos nativos
# compilar APK/AAB no Android Studio e publicar na Play Store
```

## Importante
- Sem `server.url`, o app SÓ atualiza via novo APK na loja. Se preferir voltar ao modelo "site ao vivo", basta readicionar o bloco `server.url` — mas aí aceite que app = site, e o deploy no Pages passa a ser crítico.
- Faça o deploy do site também (opcional agora, pois o app não depende mais dele):
  `npx wrangler pages deploy . --project-name=lidercrm`
