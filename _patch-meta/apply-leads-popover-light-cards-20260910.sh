#!/usr/bin/env bash
# =====================================================================
# apply-leads-popover-light-cards-20260910.sh
# ---------------------------------------------------------------------
# Aplica o patch de 2026-09-10 (duas correções):
#   1) Botão "Selecionar por etapa" (▾) da aba LEADS — popover não abria
#      (toggle duplo onclick+listener + overflow:hidden cortando).
#   2) Tema claro do kanban Leads/Negócios — cards e cabeçalhos de
#      coluna com cor SÓLIDA e fonte SÓLIDA; transparência somente na
#      parte de fora (página/wrappers/casca da coluna), igual ao tema
#      escuro.
#
# Idempotente: pode rodar várias vezes sem duplicar as edições.
#
# O que faz:
#  1) Garante os arquivos novos:
#       css/lf-fix-leads-popover-light-cards-v1-20260910.css
#       js/patches/lf-fix-leads-bulk-stage-popover-v1-20260910.js
#  2) Insere o <link> do CSS (logo após lf-negocios-transparent-bg, como
#     último CSS de tema) e o <script> do patch JS (logo após
#     lf-fix-bulk-stage-popover-definitivo-v2) em index.html e app.html.
#  3) Espelha tudo em www/, ios/App/App/public/ e
#     android/app/src/main/assets/public/.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

CSS_FILE="css/lf-fix-leads-popover-light-cards-v1-20260910.css"
JS_FILE="js/patches/lf-fix-leads-bulk-stage-popover-v1-20260910.js"

CSS_LINK="<link rel=\"stylesheet\" href=\"${CSS_FILE}?v=20260910leadspoplight1\">"
CSS_AFTER='<link rel="stylesheet" href="css/lf-negocios-transparent-bg-v1-20260907.css?v=20260907negociostransp1">'
JS_TAG="<script src=\"${JS_FILE}?v=20260910leadspopfix1\" defer></script>"
JS_AFTER='<script src="js/patches/lf-fix-bulk-stage-popover-definitivo-v2-20260908.js?v=20260908bulkstagefix2" defer></script>'

[ -f "$CSS_FILE" ] || { echo "ERRO: $CSS_FILE ausente." >&2; exit 1; }
[ -f "$JS_FILE" ]  || { echo "ERRO: $JS_FILE ausente." >&2; exit 1; }

for HTML in index.html app.html; do
  # --- CSS ---
  if grep -q "lf-fix-leads-popover-light-cards-v1-20260910.css" "$HTML"; then
    echo "[skip] $HTML já contém o <link> do CSS."
  elif grep -qF "$CSS_AFTER" "$HTML"; then
    python3 - "$HTML" "$CSS_AFTER" "$CSS_LINK" <<'PY'
import sys
path, after, link = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path, encoding="utf-8").read()
src = src.replace(after, after + "\n" + link, 1)
open(path, "w", encoding="utf-8").write(src)
PY
    echo "[ok] $HTML: <link> do CSS inserido."
  else
    echo "ERRO: âncora CSS não encontrada em $HTML" >&2; exit 1
  fi
  # --- JS ---
  if grep -q "lf-fix-leads-bulk-stage-popover-v1-20260910.js" "$HTML"; then
    echo "[skip] $HTML já contém o <script> do patch JS."
  elif grep -qF "$JS_AFTER" "$HTML"; then
    python3 - "$HTML" "$JS_AFTER" "$JS_TAG" <<'PY'
import sys
path, after, tag = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path, encoding="utf-8").read()
src = src.replace(after, after + "\n" + tag, 1)
open(path, "w", encoding="utf-8").write(src)
PY
    echo "[ok] $HTML: <script> do patch JS inserido."
  else
    echo "ERRO: âncora JS não encontrada em $HTML" >&2; exit 1
  fi
done

# --- Espelhamento (www, ios, android) ---
for DIR in www ios/App/App/public android/app/src/main/assets/public; do
  mkdir -p "$DIR/css" "$DIR/js/patches"
  cp -f "$CSS_FILE" "$DIR/$CSS_FILE"
  cp -f "$JS_FILE"  "$DIR/$JS_FILE"
  for HTML in index.html app.html; do
    cp -f "$HTML" "$DIR/$HTML"
  done
  echo "[ok] espelhado em $DIR/"
done

echo "PATCH 20260910 aplicado com sucesso."
