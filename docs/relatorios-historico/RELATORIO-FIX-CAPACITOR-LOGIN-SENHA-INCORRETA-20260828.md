# RELATORIO-FIX-CAPACITOR-LOGIN-SENHA-INCORRETA-20260828

## Bug

E-mail e senha corretos funcionam no PC, mas o mesmo login dá "senha
incorreta" dentro do app Capacitor.

## Investigação — o que foi descartado

Antes de chegar na causa, verifiquei (e descartei) as suspeitas mais
óbvias, todas confirmadas corretas:

- **Base da API** (`LiderCRM.apiBase`): já corrigida em `index.html`
  (fix `LF-FIX-CAPACITOR-APIBASE-20260824`) — Capacitor carrega
  `index.html` por padrão, confirmado em `docs/mobile.md`.
- **Cache de requisições** (`js/api.js`): a função `_canCache` só
  permite cache para `GET` — login é `POST`, nunca passa por ali.
- **CORS do Worker**: `https://localhost`, `capacitor://localhost` e
  `ionic://localhost` continuam liberados explicitamente
  (`_worker_src/worker/middlewares/cors.js`), sem regressão.
- **Lógica de verificação de senha no servidor**
  (`login-service.js`): processa o e-mail/senha que recebe, não tem
  nenhum comportamento diferente por plataforma de origem.

## Causa raiz

O campo de senha (`#lp`) não tinha `autocapitalize`/`autocorrect`
desligados explicitamente. Um navegador de PC não tem teclado
virtual — a diferença nem existe ali. Mas dentro do WebView do
Capacitor, o teclado do celular (a captura de tela de uma sessão
anterior mostrava o SwiftKey, conhecido por ter esse comportamento)
pode capitalizar a primeira letra ou aplicar autocorreção mesmo em
campos `type="password"`, dependendo da versão do WebView/teclado —
o navegador não garante universalmente que isso fique desligado
sozinho nesse tipo de campo.

Como senha é sensível a maiúsculas/minúsculas e o código nunca
"corrige" esse valor (corretamente — não dá pra normalizar uma senha
sem quebrar senhas legítimas), qualquer letra alterada silenciosamente
pelo teclado vira uma senha efetivamente diferente da real, tanto do
ponto de vista de quem digitou quanto do servidor, que recebe uma
senha diferente da cadastrada — daí o "incorreta".

Achado revelador: o campo de e-mail já tem essa proteção, mas por
outro caminho — o JS aplica `.trim().toLowerCase()` nele antes de
enviar (`js/auth.js`), o que por acaso também corrige qualquer
capitalização automática do teclado. A senha nunca teve proteção
equivalente porque não pode ter — dela dependia só o comportamento
correto do campo em si.

## Correção

Adicionados `autocapitalize="off"`, `autocorrect="off"` e
`spellcheck="false"` explicitamente nos campos de e-mail (reforço,
defesa em profundidade) e senha (correção principal), em `index.html`
e `app.html`.

## Fluxos cobertos

- Login no PC/navegador: nenhuma mudança de comportamento (esses
  atributos não têm efeito sem teclado virtual).
- Login no app Capacitor: o teclado não deve mais alterar
  automaticamente o que a pessoa digitou no campo de senha.

## Nota de honestidade

Não tenho como testar isso num aparelho Android real a partir daqui —
esta é a causa mais provável e concreta que encontrei depois de
descartar sistematicamente as outras (API, cache, CORS, servidor), e
é um padrão de bug bem conhecido e documentado para campos sensíveis
a maiúsculas/minúsculas dentro de WebView. Se o problema persistir
depois desta correção, o próximo passo seria capturar o payload real
enviado pelo app (ex.: log temporário do comprimento/hash da senha
antes de enviar, nunca a senha em si) para confirmar se ainda chega
alterada.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `index.html`, `app.html`, `www/*` | atributos `autocapitalize`/`autocorrect`/`spellcheck` nos campos de login |

## Verificação

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. No app Capacitor, digitar uma senha que comece com letra minúscula
   — conferir que o campo não capitaliza a primeira letra sozinho.
2. Fazer login com credenciais reais que já falhavam — deve entrar
   normalmente agora.

## Reversão

Reversível — só atributos HTML, sem migração de dado nem mudança de
lógica de autenticação.
