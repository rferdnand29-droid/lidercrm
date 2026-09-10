# RELATORIO-FIX-CAPACITOR-LOGIN-ALLOWNAVIGATION-20260914

## Pedido

Urgente: login com e-mail/senha não funcionando no app instalado
(Capacitor). Achar TODAS as causas.

## Investigação — o que foi verificado, na ordem

1. **Senha sem espaço em branco** (`js/auth.js`, `doLogin`) — já
   corrigida numa sessão anterior, confirmado que continua correta.
2. **Resolução da URL da API pra plataforma nativa**
   (`_lfNativeApiBase`, `js/api.js`) — lógica correta, valor injetado
   (`https://liderfinanceira.com`) confirmado certo nos dois HTMLs.
3. **CORS e preflight no backend** (`_worker_src/worker/middlewares/
   cors.js`) — confirmado que já libera corretamente a origem do
   Capacitor (`https://localhost`), incluindo o cabeçalho de
   credenciais necessário. Sem problema aqui.
4. **Manifest do Android** — limpo, sem restrição de rede extra além
   da permissão de internet (já presente).

## Causa raiz encontrada — `allowNavigation` no `capacitor.config.json`

O arquivo tinha `server.allowNavigation` listando
`*.liderfinanceira.com`, `supabase.co` e `backblazeb2.com` — pensado
(numa sessão de 2026-08-24, documentado em `docs/relatorios-historico/
README-FIX-BUNDLE-LOCAL-20260824.md`) como "necessário pra essas APIs
funcionarem dentro do WebView".

**Isso é um entendimento errado do que essa configuração faz.**
Segundo a documentação oficial do Capacitor, `allowNavigation`
controla apenas **navegação de página inteira** dentro da WebView
(por exemplo, clicar num link que abriria outro domínio) — e é
explicitamente marcada como "não destinada para uso em produção".
Chamadas de API via `fetch`/XHR (como o login) **não precisam
disso** — já funcionam normalmente via CORS, que o backend já
configura corretamente.

Pior: existe um issue confirmado oficialmente pelo próprio time do
Capacitor (`ionic-team/capacitor#1573`) relatando que ter o domínio
da própria API dentro de `allowNavigation` **quebra** as chamadas
`fetch`/XHR pra esse domínio no Android — o Capacitor intercepta
essas chamadas como se fossem navegação de página, retornando
conteúdo errado ou falhando. Isso bate exatamente com o sintoma
relatado: login falha (é uma chamada POST pra essa API), mas o resto
do app carrega normalmente (o HTML/JS/CSS vem embutido no APK, não
depende de rede).

Confirmei também que **nenhum lugar do código depende dessa
configuração** — Supabase e Backblaze são acessados só via chamada de
API (fetch), nunca por navegação de página inteira (nenhum
`window.open`/`location.href`/link pra esses domínios encontrado).

## Correção

Removido `server.allowNavigation` do `capacitor.config.json` por
completo. Rodei `npx cap sync` pra propagar a mudança pros arquivos
de configuração já compilados dentro do Android e do iOS (editar só
o arquivo da raiz não bastaria — confirmei que o arquivo dentro do
`android/` ainda tinha a config antiga até rodar o sync).

Corrigida também a documentação (`docs/mobile.md`) que ensinava o
conceito errado — sem isso, uma sessão futura poderia reintroduzir o
mesmo bug tentando "seguir a doc" ao adicionar um novo domínio de
API.

## Fluxos cobertos

- Login com e-mail e senha no app instalado (Android/iOS): deve
  funcionar normalmente agora.
- Qualquer outra chamada de API que já funcionava no PC/navegador
  mas talvez falhasse silenciosamente no app: também deve melhorar,
  já que a mesma interceptação afetava qualquer chamada pra
  `liderfinanceira.com`, não só o login.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `capacitor.config.json` | `allowNavigation` removido |
| `android/`, `ios/` | config compilada atualizada via `cap sync` |
| `docs/mobile.md` | documentação corrigida, aviso pra não reintroduzir |

## Verificação

```
JSON válido                      → confirmado
Config compilada (android/ios)   → allowNavigation confirmado ausente nos 3 pontos
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 71/71 testes
npx cap sync                     → android/ios sincronizados
```

## Como validar de verdade

Esta é uma mudança de **configuração nativa compilada** — só terá
efeito depois de gerar um **novo APK/IPA** com este projeto e
reinstalar no aparelho (não é possível testar isso pelo navegador ou
com o app já instalado antes desta correção).

1. Gerar um novo build (Android Studio/Xcode) a partir deste projeto.
2. Instalar no aparelho, substituindo a versão anterior.
3. Tentar logar com e-mail e senha válidos — deve funcionar.

## Reversão

Reversível — reintroduzir `allowNavigation` no `capacitor.config.
json` e rodar `cap sync` de novo. Não recomendado, pelos motivos
explicados acima.
