# RELATORIO-FIX-LOGIN-CAPACITOR-SENHA-TRIM-20260904

## Bug

Login continuava falhando no app Capacitor ("E-mail ou senha
inválidos"), mesmo depois da correção anterior (atributos
`autocapitalize`/`autocorrect` no campo de senha).

## Investigação — descartando e refinando hipóteses

A mensagem de erro aparece **dentro do `.then()`** da chamada de
login — ou seja, a requisição chegou ao servidor e teve resposta (a
Promise resolveu, não caiu no `.catch()`, que mostraria uma mensagem
diferente: "Não foi possível entrar..."). Isso descarta problema de
rede/CORS/base da API — todos já confirmados corretos em verificações
anteriores.

Com a causa de rede descartada, sobrava: o servidor recebeu algo
diferente do que a pessoa realmente digitou.

## Causa raiz — achado novo

O campo de e-mail já usa `.trim()` há tempos. **O campo de senha,
no login, nunca usava.** Comparando com os outros lugares do app que
lidam com senha, achei uma inconsistência reveladora:

- Criar senha pra um usuário novo (`#np`): já usa `.trim()`.
- Redefinir senha por um ADM (`#k-reset-senha`): já usa `.trim()`.
- Trocar a própria senha — campo da senha **nova**: já usa `.trim()`
  (com comentário explícito: "sem espaços nas bordas").
- Trocar a própria senha — campo da senha **atual** (usado pra
  confirmar identidade, igual ao login): **não** usava `.trim()`.
- Login — campo de senha: **não** usava `.trim()`.

Ou seja: alguém já tinha identificado esse risco antes (teclado
mobile — principalmente em aparelhos com input method mais agressivo,
como MIUI/Xiaomi, que aparece na sua captura de tela — inserindo um
espaço indesejado no início ou fim ao digitar ou aceitar uma
sugestão) e corrigiu em **três** lugares, mas os dois pontos que
**verificam** uma senha existente (login e confirmação da senha
atual) ficaram de fora. Como os pontos deixados de fora são
exatamente os dois que comparam a senha digitada contra o que já
está salvo, e a senha aparece só como pontos na tela (••••••••), a
pessoa não tem como perceber esse espaço a mais.

## Correção

`js/auth.js` (login) e `js/configuracoes.js` (confirmação da senha
atual ao trocar a senha): ambos agora aparam espaços nas pontas antes
de enviar — igual já acontecia nos outros três pontos.

## Nota de honestidade

Continuo sem acesso a um aparelho físico pra confirmar 100%. Esta é
a explicação mais forte e concreta que encontrei — uma
inconsistência real e comprovável no próprio código (alguém já tinha
corrigido em 3 de 5 lugares, exatamente os que definem senha nova;
faltavam os 2 que verificam senha existente). Se ainda assim
persistir, o próximo passo seria capturar o corpo exato da resposta
de erro do servidor (sem expor a senha) pra descartar de vez
qualquer outra causa.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/auth.js` | senha do login aparada |
| `js/configuracoes.js` | senha atual (troca de senha) aparada |

## Verificação

```
node --check js/auth.js js/configuracoes.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ios sincronizados
```

## Como validar manualmente

1. No app Capacitor, tentar login com credenciais que já falhavam.
2. Trocar a própria senha, digitando a senha atual normalmente.

## Reversão

Reversível — duas linhas, sem migração de dado nem mudança de lógica
de autenticação.
