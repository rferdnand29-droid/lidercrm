# RELATÓRIO — FIX CRÍTICO: usuário travado após deploy, reset de senha pelo ADM não resolvia

**Data:** 22/08/2026
**Severidade:** Crítica (login permanentemente bloqueado, sem saída
exceto excluir e recriar o usuário)

---

## O que acontecia

1. Criou um usuário teste (cargo Administrativo).
2. Atualizou o CRM e fez um novo deploy.
3. A senha passou a dar "incorreta" — mesmo sendo a senha certa.
4. Tentou trocar a senha pelo ADM (Hudson) — **não resolveu**.
5. Só resolveu excluindo o usuário e criando outro.

---

## Causa raiz — encontrada e confirmada no código

O sistema guarda a senha de cada usuário em **dois lugares ao mesmo
tempo**: um banco de dados relacional (novo, prioritário) e um sistema
de arquivos legado (antigo, mantido por compatibilidade). Toda troca
de senha grava nos dois; todo login verifica os dois — o relacional
primeiro, o legado como reserva.

Existe uma proteção contra um bug histórico documentado no próprio
código (identificado em jul/2026, apelidado internamente de "Hudson
não consegue logar"): hashes de senha criados com um número de
"iterações" de segurança acima do que o servidor (Cloudflare Workers)
permite processar travam na hora de verificar. Isso pode acontecer
quando um deploy muda essa configuração — uma senha criada **antes**
do deploy, com a configuração antiga, deixa de "bater" com o código
**depois** do deploy, mesmo sendo a senha certa.

**O bug que encontrei:** quando essa trava disparava no lado do banco
relacional, o código **desistia na hora** — encerrava a tentativa de
login inteira, **sem nunca chegar a checar o sistema de arquivos
legado**. Isso significa: mesmo que o reset de senha do ADM tivesse
gravado a senha nova corretamente no lado legado, o login nunca
chegava lá pra conferir — travava antes, no lado relacional, toda vez.

Some a isso outra falha encontrada: a gravação da senha no banco
relacional podia falhar silenciosamente (erro de rede, por exemplo) —
sem avisar o ADM. O reset "dava certo" na tela, mas só tinha
realmente atualizado um dos dois lugares.

**Essas duas falhas juntas** explicam exatamente o relatado: o
usuário ficava travado no lado relacional, e nenhuma tentativa de
resetar a senha — mesmo funcionando "por trás" no lado legado —
conseguia destravar o login, porque o código nunca dava a chance do
lado legado ser conferido.

---

## Correção

1. **`login-service.js`** — quando a trava de iterações dispara no
   lado relacional, o login agora **tenta o sistema legado antes de
   desistir** — exatamente a mesma chance que já existia pro caso
   comum de "senha simplesmente errada". Só recusa o login (e pede
   pra um ADM redefinir) se **nenhum dos dois** conseguir validar a
   senha.
2. **`change-password-service.js`** (reset pelo ADM) — agora confere
   de verdade se a gravação da senha nova funcionou em pelo menos um
   dos dois lugares, em vez de assumir sucesso. Se as duas gravações
   falharem, avisa com um erro claro, em vez de dizer "OK" sem ter
   mudado nada.

## Teste de regressão adicionado

Escrevi 3 testes automatizados especificamente pra esse cenário —
incluindo o exato caso relatado (hash relacional travado + reset do
ADM só pegando no lado legado) — pra garantir que esse bug específico
não volte a acontecer sem que os testes acusem. Rodam junto com
`npm test` a partir de agora.

## Verificação

```
node --check (ambos arquivos alterados) → OK
npx vitest run tests/login-iter-cap-fallback.test.js → 3/3 testes passando
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes (43 anteriores + 3 novos)
npx cap sync                     → android/ e ios/ sincronizados
```

## Arquivos

| Arquivo | Mudança |
|---|---|
| `_worker_src/worker/services/auth/login-service.js` | fallback pro fs_documents antes de desistir num hash relacional travado |
| `_worker_src/worker/services/auth/change-password-service.js` | confere de verdade se a gravação funcionou, antes de reportar sucesso pro ADM |
| `tests/login-iter-cap-fallback.test.js` | novo — 3 testes de regressão pra esse cenário exato |

## O que isso NÃO cobre

Se um usuário ficar com o hash travado nos **dois** lugares ao mesmo
tempo (bem mais raro), ainda vai precisar de um reset de senha pelo
ADM — só que agora esse reset **realmente** vai destravar, porque
tanto a gravação quanto a verificação foram corrigidas.

## Reversão

Reversível arquivo por arquivo, sem migração de dado — são ajustes de
lógica de verificação/gravação, não mudam nenhum registro existente.
