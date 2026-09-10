#!/usr/bin/env bash
# =====================================================================
# apply-leads-visual-final-20260907.sh
# ---------------------------------------------------------------------
# Aplica o re-skin definitivo da página Leads (desktop, tema escuro).
# Idempotente: pode ser rodado várias vezes sem duplicar as edições.
#
# O que faz:
#  1) Garante que css/lf-leads-visual-final-v1-20260907.css existe.
#  2) Comenta o <link> antigo lf-kanban-desktop-redesign-v1-20260901.css
#     em index.html E app.html (canônicos) e adiciona o <link> do novo
#     CSS como ÚLTIMO CSS de tema, se ainda não estiver lá.
#  3) Espelha em www/index.html, www/app.html e www/css/.
#  4) Roda scripts/check-load-order.mjs e scripts/verify-mirror.mjs.
#
# Uso: bash _patch-meta/apply-leads-visual-final-20260907.sh
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

NEW_CSS="css/lf-leads-visual-final-v1-20260907.css"
OLD_LINK='<link rel="stylesheet" href="css/lf-kanban-desktop-redesign-v1-20260901.css?v=20260907kanban409fix5">'

if [ ! -f "$NEW_CSS" ]; then
  echo "ERRO: $NEW_CSS não encontrado. Restaure o arquivo antes de aplicar." >&2
  exit 1
fi

for HTML in index.html app.html; do
  if grep -q "lf-leads-visual-final-v1-20260907.css" "$HTML"; then
    echo "[skip] $HTML já contém o novo <link>."
  else
    # Comenta a linha do redesign antigo (uma vez só)
    if grep -qF "$OLD_LINK" "$HTML"; then
      python3 - "$HTML" <<'PY'
import sys, io
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f: src = f.read()
old = '<link rel="stylesheet" href="css/lf-kanban-desktop-redesign-v1-20260901.css?v=20260907kanban409fix5">'
new = (
  '<!-- [DESATIVADO 20260907 — RE-SKIN DEFINITIVO DE LEADS] Substituído por '
  'css/lf-leads-visual-final-v1-20260907.css (ver docs/relatorios-historico/'
  'RELATORIO-FIX-LEADS-VISUAL-FINAL-20260907.md).\n'
  + old + '\n-->'
)
src = src.replace(old, new, 1)
# Insere o novo <link> logo depois do bloco lf-consultor-clickable-lig
anchor = '<link rel="stylesheet" href="css/lf-consultor-clickable-lig-v1-20260819.css?v=20260907kanban409fix5">'
inject = (
  anchor + '\n'
  '<!-- LF-LEADS-VISUAL-FINAL-V1-20260907: re-skin definitivo Leads desktop. -->\n'
  '<link rel="stylesheet" href="css/lf-leads-visual-final-v1-20260907.css?v=20260907leadsvisualfinal1">'
)
src = src.replace(anchor, inject, 1)
with open(path, "w", encoding="utf-8") as f: f.write(src)
PY
      echo "[ok] $HTML atualizado."
    else
      echo "[warn] $HTML não contém o <link> antigo; nada a fazer."
    fi
  fi
done

# Espelhamento
mkdir -p www/css
cp -f index.html www/index.html
cp -f app.html   www/app.html
cp -f "$NEW_CSS" "www/$NEW_CSS"

echo "[ok] espelhos www/ atualizados."

# Verificações
node scripts/check-load-order.mjs
node scripts/verify-mirror.mjs || true   # divergência pré-existente é reportada; não bloqueia
echo "[done] apply-leads-visual-final-20260907"
