# RELATORIO-VERIFICACAO-SYNC-CAPACITOR-20260830

## Pedido

Verificar se tudo está sincronizado corretamente com o Capacitor.

## O que foi verificado (teste de verdade, não só conferência de config)

Como uma limpeza de uma sessão anterior tinha removido `android/` e
`ios/` do zip pra reduzir peso (eram 100% regeneráveis, o que ainda é
verdade), recriei os dois do zero e rodei todo o processo de sync de
verdade, em vez de só olhar arquivos de configuração:

1. `npm run cap:www` — montou a pasta `www/` a partir da raiz.
2. `npx cap add android` + `npx cap add ios` — recriou os projetos
   nativos do zero.
3. `npx cap sync` — sincronizou os arquivos web pros dois projetos.
4. Comparei byte a byte o `index.html`/`app.html` copiados pra dentro
   de `android/app/src/main/assets/public/` e
   `ios/App/App/public/` contra a fonte em `www/` — **idênticos**.
5. Conferi que os fixes críticos específicos de Capacitor (base da
   API, atributos de teclado no login) chegaram corretamente nos
   arquivos que o app nativo carrega de verdade — presentes nos dois.
6. Conferi que a versão de cache-busting (`?v=...`) e o `lf-build-id`
   batem exatamente nos 6 pontos (raiz + www + as duas cópias
   nativas) — sem nenhuma divergência.
7. Conferi `MainActivity.java` — `extends BridgeActivity`, a ponte
   nativa do Capacitor 8 é injetada automaticamente pelo próprio
   Android/iOS, não precisa de `<script>` no HTML (isso é esperado,
   não um problema).
8. Conferi `AndroidManifest.xml` — permissão de internet presente.

## Achado — e corrigido

O ícone e a tela de splash gerados pelo `npx cap add` eram o
**placeholder genérico do Capacitor** (um ícone azul de "plugue"), não
a marca da Líder CRM. Existe um `resources/logo.png` no
projeto — a origem certa — mas `cap add` sozinho **não aplica isso
automaticamente**, precisa rodar um comando separado.

Achei a documentação do próprio projeto confirmando isso
(`docs/CAPACITOR-BUILD-SETUP-20260804.md`) — existe um script
dedicado, `npm run cap:assets`, que já estava configurado
corretamente (cores certas: fundo do ícone `#3A0E17`, fundo do splash
`#0A0C10`), só não tinha sido executado depois que os projetos nativos
foram recriados. Rodei — 74 arquivos gerados pro Android, 7 pro iOS,
todos com o logo "LF" correto.

## Conclusão

Sincronização com Capacitor está correta. O único gap encontrado
(ícone/splash com o logo certo) foi corrigido nesta mesma verificação.

## Arquivos entregues nesta rodada

Diferente das últimas entregas (que tinham removido `android/`/`ios/`
pra reduzir peso), esta inclui os dois **regenerados e já com a marca
aplicada**, já que o pedido era especificamente verificar a
sincronização — mais útil entregar já testado e funcionando do que
só o código-fonte.

| Item | Situação |
|---|---|
| `www/` → `android/`/`ios/` | Idêntico, confirmado byte a byte |
| Fixes de API/login específicos de Capacitor | Presentes nos dois nativos |
| Versão de cache/build-id | Idêntica nos 6 pontos |
| Ícone/splash | Corrigido — agora com o logo LF, não mais o placeholder |
| Permissão de internet (Android) | Presente |

## Verificação

```
npx cap add android/ios  → sem erros
npx cap sync              → sem erros
npm run cap:assets        → 74 (android) + 7 (ios) arquivos gerados
node scripts/ai-guard.mjs → 0 violações bloqueantes
node scripts/verify-mirror.mjs → www/ e raiz idênticos
npm run lint               → 0 erros
npm test                   → 46/46 testes
```

## Como validar manualmente

1. Abrir o projeto Android (`npx cap open android`) ou iOS
   (`npx cap open ios`) e conferir visualmente o ícone do app — deve
   mostrar "LF", não mais o ícone azul genérico.
2. Buildar e instalar num aparelho/emulador real — fazer login (o
   teste mais real pro fix de teclado) e conferir que os dados batem
   com o que aparece no PC.

## Nota sobre entregas futuras

Se quiser que eu volte a **não** incluir `android/`/`ios/` nas
próximas entregas (pra manter o zip mais leve, já que são
regeneráveis com `npm run cap:sync` a qualquer momento), me avisa —
essa foi uma exceção pontual porque o pedido desta vez era
especificamente sobre verificar a sincronização nativa.

## Reversão

Não há o que reverter — nenhuma lógica foi alterada, só gerados
arquivos de branding (ícone/splash) que faltavam.
