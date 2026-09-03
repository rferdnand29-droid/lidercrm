# RELATÓRIO — Grandfathering do `ai-guard` para patches legados

**Data:** 2026-08-18
**Escopo:** desbloquear o CI que ia rejeitar o próximo push por causa de
patches escritos ANTES do `AI_CONTRACT.md` existir, sem tocar em nenhum
arquivo legado.

## 1. Diagnóstico

Rodando `node scripts/ai-guard.mjs` em modo full-scan (o que o
`.github/workflows/ai-guard.yml` executa no CI antes do deploy da
Cloudflare Pages), o guard reportava:

| Regra           | Ocorrências | Bloqueia CI? |
| --------------- | ----------- | ------------ |
| `R1.IDEMP`      | 72          | sim          |
| `R1.IIFE`       | 12          | sim          |
| `R3.HTML_SYNC`  | 16          | sim          |
| `R1.HEADER`     | 60          | não (warn)   |
| `R6.TODO_LOG`   | 1           | não (warn)   |
| **Total bloqueante** | **100** | **sim**   |

73 arquivos únicos afetados — **todos** dentro de `js/patches/**` ou
`www/js/patches/**`, escritos entre 2026-07-13 e 2026-08-04, ou seja,
ANTES do `AI_CONTRACT.md` (2026-08-18). O modo `--staged` do pre-commit
local não era afetado (só olha o diff staged), então a trava local
continuava funcionando; o problema era exclusivamente o CI em push.

## 2. Decisão

Aplicar **grandfathering** (opção 1 do relatório anterior) — reescrever
os patches antigos violaria o próprio contrato (§0 "cirurgia, não
reforma" + §3 "sobrescrever patch antigo sem versionar"). Todo o pacote
original permanece byte-idêntico (verificado: 212 arquivos, 0 alterados,
0 faltando).

## 3. O que mudou

Três arquivos novos + uma edição cirúrgica no `ai-guard.mjs`:

### 3.1. NOVO — `scripts/ai-guard-legacy-allowlist.json`

Baseline congelada com **100 entradas** `{rule, file, sha256}`, cobrindo
exatamente as violações R1.IIFE / R1.IDEMP / R3.HTML_SYNC dos legados
listados no §1. Gerada a partir do estado atual do repo.

### 3.2. EDIÇÃO — `scripts/ai-guard.mjs`

Bloco §0 novo (carrega a allowlist) + `fail()` reescrita: se
`{rule, file, sha256(file)}` bate com a allowlist, a violação vira
`softWarn` com sufixo `.LEGACY`. Qualquer outra alteração fica
intacta (as regras R2, R4, R5, R6, R7 continuam idênticas). O helper
`sha256(p)` duplicado foi consolidado em `sha256File(p)` — sem impacto
funcional. Um resumo `(N violação(ões) legada(s) toleradas…)` foi
adicionado ao final da saída.

**Propriedade crítica:** o hash do arquivo em disco é comparado com o
hash gravado na allowlist. Se um humano (ou uma IA) alterar um patch
legado — mesmo 1 byte — a violação sai da anistia e o guard volta a
bloquear. Não é anistia perpétua, é **"byte-idêntico ou conserta"**.

### 3.3. NOVO — `scripts/ai-guard-refresh-baseline.mjs`

Ferramenta manual (não roda no CI, não está no pre-commit) para
regenerar a allowlist em revisão humana. Padrão dry-run; grava só com
`--write`.

## 4. Arquivos que **NÃO** foram tocados

- Nenhum arquivo em `js/patches/**` — os 100 patches legados
  permanecem exatamente como no ZIP original (SHA-256 verificado).
- Nenhum arquivo em `www/js/patches/**` — o espelho continua íntegro
  (`verify-mirror.mjs` verde).
- `index.html`, `app.html`, `www/index.html`, `www/app.html` —
  intactos; as 16 tags `<script>` com querystring divergente
  permanecem exatamente como estavam.
- `AI_CONTRACT.md`, `.githooks/pre-commit`, `.github/workflows/ai-guard.yml`,
  `package.json`, `scripts/verify-mirror.mjs` — nenhum toque.

## 5. Validação executada

```
[T1] node scripts/ai-guard.mjs --staged (sem staged)      → exit 0 ✅
[T2] patch NOVO bem-formado staged                        → exit 0 ✅
[T3] patch NOVO mal-formado staged                        → exit 1 ✅ (R1.IIFE + R1.IDEMP)
[T4] legado alterado (hash muda)                          → exit 1 ✅ (R1.IDEMP + R2.MIRROR)
[T5] node scripts/ai-guard.mjs (full-scan CI)             → exit 0 ✅ (100 legados tolerados)
[T6] node scripts/verify-mirror.mjs                       → exit 0 ✅
[T7] byte-identidade dos 212 arquivos legados vs. ZIP orig → 0 alterados, 0 faltando ✅
```

- **T2** garante: fluxo normal (novo patch conforme o contrato) segue
  passando no CI.
- **T3** garante: a trava semântica continua ativa para código NOVO —
  nenhuma IA consegue subir patch fora do padrão, exatamente como
  antes.
- **T4** garante: a anistia é presa ao conteúdo — não é blanket bypass.

## 6. Reversão

Um comando desfaz tudo (a trava volta ao modo estrito original):

```bash
git rm scripts/ai-guard-legacy-allowlist.json \
       scripts/ai-guard-refresh-baseline.mjs \
       RELATORIO-GUARDRAILS-GRANDFATHERING-20260818.md
git checkout HEAD~ -- scripts/ai-guard.mjs
```

O `ai-guard.mjs` sem a allowlist ao lado dele já cai automaticamente
no modo estrito (o `try/catch` do carregamento devolve `Map` vazio).

## 7. Roteiro futuro (opcional, não urgente)

À medida que qualquer patch legado for legitimamente refatorado para
IIFE + idempotência, a violação dele sai da allowlist automaticamente
(o hash muda; então `isGrandfathered()` retorna `false`; mas como o
patch agora está correto, o `fail()` nunca é chamado). Nenhuma
manutenção manual da allowlist é necessária nesse caminho.

O único caso em que se regenera a allowlist é quando um novo patch
comprovadamente legado precisa ser tolerado — o que exige rodar
`node scripts/ai-guard-refresh-baseline.mjs --write` e revisão humana
explícita antes do commit.
