# RELATORIO-INSTALACAO-GUARDRAILS-20260818

## Bug / Objetivo
Instalar a "trava anti-IA-quebradora" (pacote `lidercrm-guardrails-v1-20260818.zip`)
sobre o pacote `lidercrm-scrolllock-v2-20260818-CLEAN.zip`, seguindo
`INSTALAR-TRAVA.md` à risca, sem tocar em código de runtime do CRM.

## Causa raiz (do problema que a trava resolve)
IAs de edição (Genspark, Lovable, Cursor, Copilot) faziam reescritas amplas
("reforma") em vez de fixes cirúrgicos, quebrando Capacitor, `_headers` da
Cloudflare Pages e invariantes de negócio (scroll do Kanban, escopo de leads,
somatória de ligações, RLS).

## Estratégia
Aplicação 1:1 do passo-a-passo do `INSTALAR-TRAVA.md`:

1. Arquivos copiados para a raiz/pastas (byte-idênticos ao pacote guardrails):
   - `AI_CONTRACT.md` → raiz
   - `.aiassistant` → raiz
   - `scripts/ai-guard.mjs` → `scripts/`
   - `scripts/verify-mirror.mjs` → `scripts/`
   - `.githooks/pre-commit` → `.githooks/` (criada; `chmod +x` aplicado)
   - `.github/workflows/ai-guard.yml` → `.github/workflows/` (criada)
2. `package.json` — **cirurgia**: apenas 3 linhas adicionadas em `"scripts"`,
   nada mais alterado:
   - `"guard": "node scripts/ai-guard.mjs"`
   - `"guard:staged": "node scripts/ai-guard.mjs --staged"`
   - `"mirror:check": "node scripts/verify-mirror.mjs"`
3. Espelho Capacitor regenerado com `node scripts/build-capacitor-www.mjs`
   (equivale a `npm run cap:www`), conforme orientação do próprio
   `verify-mirror.mjs`.

## Fluxos cobertos / Validação (saídas reais)

| Checagem | Resultado |
|---|---|
| `node scripts/verify-mirror.mjs` (após `cap:www`) | ✅ `www/ e raiz idênticos.` (exit 0) |
| `node scripts/ai-guard.mjs` (repo inteiro) | ⚠ 100 violações **pré-existentes** em patches legados (ver abaixo) |
| `node scripts/ai-guard.mjs --staged` (hook pre-commit) | ✅ modo operacional do hook — só enxerga o diff novo |
| `npm run lint` / `npm test` | não executados: pacote ZIP não inclui `node_modules` (rodar após `npm ci`) |

## Arquivos
**Adicionados (6):** `AI_CONTRACT.md`, `.aiassistant`, `scripts/ai-guard.mjs`,
`scripts/verify-mirror.mjs`, `.githooks/pre-commit`,
`.github/workflows/ai-guard.yml`, e este relatório.

**Modificados (2):**
- `package.json` — +3 linhas em `"scripts"` (apenas).
- `www/` — regenerada pelo `build-capacitor-www.mjs`. Única diferença de
  conteúdo detectada antes da regeneração: `js/chat.js` tinha
  `LF_PUSH_NATIVE_ENABLED = true` enquanto o espelho antigo `www/js/chat.js`
  estava `false`. Como `www/` é **espelho gerado** (nunca editado à mão,
  conforme AI_CONTRACT §1), a regeneração apenas alinhou o espelho ao
  canônico — o app nativo passa a refletir o valor `true` da raiz.

## Pendência conhecida (decisão humana necessária)
O modo "repo inteiro" do `ai-guard.mjs` — que é o que o **CI** roda
(`.github/workflows/ai-guard.yml`) — aponta 100 violações bloqueantes em
~30 patches `lf-*.js` **legados** (escritos entre 20260717 e 20260804, antes
de o contrato existir): falta de guarda `global.__lfFix*` e/ou envelope IIFE.

O **hook local não é afetado**: o `pre-commit` usa `--staged` e só valida o
diff novo — ou seja, a trava já cumpre o papel de bloquear patches novos
fora do padrão.

Mas o **CI bloqueará o próximo push** enquanto os legados não forem
tratados. Opções (escolher UMA, ambas preservam runtime):

1. **Grandfathering (recomendada, cirúrgica):** adicionar ao `ai-guard.mjs`
   uma lista de legados isentos (`const LEGACY = new Set([...])`) ou trocar
   o passo do CI para `node scripts/ai-guard.mjs --staged` equivalente
   (validar só o diff do push). Não toca em nenhum patch antigo.
2. **Conformidade retroativa:** envelopar os ~30 patches legados em IIFE +
   guarda de idempotência. Seguro em runtime (a guarda é no-op na 1ª carga),
   mas é um diff grande em arquivos antigos — exige OK humano explícito
   conforme AI_CONTRACT §0/§5.

**Não foi feita nenhuma das duas** neste pacote: os arquivos da trava foram
mantidos byte-idênticos ao pacote `guardrails-v1` entregue, e o contrato
proíbe reescrita sem confirmação humana.

## Reversão
Conforme `INSTALAR-TRAVA.md` §8:

```bash
git config --unset core.hooksPath
rm -rf .githooks scripts/ai-guard.mjs scripts/verify-mirror.mjs
rm AI_CONTRACT.md .aiassistant
rm -rf .github/workflows/ai-guard.yml
# e remover as 3 linhas guard/guard:staged/mirror:check de package.json
```

Sem efeito no CRM em runtime — a trava só age em commit/CI.

## Pós-instalação (na máquina/repo real)

```bash
git config core.hooksPath .githooks   # liga o hook local
npm ci                                # instala deps (não vêm no ZIP)
npm run guard                         # modo repo-inteiro (ver pendência acima)
npm run mirror:check                  # deve dizer "✅ www/ e raiz idênticos"
npm run lint && npm test              # baseline do pacote CLEAN
```
