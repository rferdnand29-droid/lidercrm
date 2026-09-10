#!/usr/bin/env bash
# =====================================================================
# rollback-leads-visual-final-20260907.sh
# ---------------------------------------------------------------------
# Reverte o re-skin definitivo da página Leads (desktop, tema escuro),
# voltando ao visual anterior (lf-kanban-desktop-redesign-v1-20260901.css).
# Idempotente: pode ser rodado várias vezes sem quebrar nada.
#
# O que faz:
#  1) Remove o <link> do novo CSS (lf-leads-visual-final-v1-20260907.css)
#     de index.html e app.html.
#  2) Re-ativa o <link> do redesign anterior
#     (lf-kanban-desktop-redesign-v1-20260901.css), removendo o comentário
#     de desativação.
#  3) Espelha em www/index.html e www/app.html.
#  4) NÃO deleta o CSS novo do disco (fica disponível para reaplicar
#     rapidamente com apply-leads-visual-final-20260907.sh).
#
# Uso: bash _patch-meta/rollback-leads-visual-final-20260907.sh
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

for HTML in index.html app.html; do
  python3 - "$HTML" <<'PY'
import sys, re
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f: src = f.read()

# 1) Remover bloco de comentário de desativação + reativar o <link> antigo
desativado_re = re.compile(
  r'<!-- \[DESATIVADO 20260907[\s\S]*?<link rel="stylesheet" href="css/lf-kanban-desktop-redesign-v1-20260901\.css\?v=20260907kanban409fix5">\s*\n-->',
  re.MULTILINE
)
src, n1 = desativado_re.subn(
  '<link rel="stylesheet" href="css/lf-kanban-desktop-redesign-v1-20260901.css?v=20260907kanban409fix5">',
  src, count=1
)

# 2) Remover o <link> novo (com ou sem comentário LF-LEADS-VISUAL-FINAL-V1 acima)
novo_re = re.compile(
  r'(?:<!-- LF-LEADS-VISUAL-FINAL-V1-20260907:[\s\S]*?-->\s*\n)?'
  r'<link rel="stylesheet" href="css/lf-leads-visual-final-v1-20260907\.css\?v=20260907leadsvisualfinal1">\s*\n?',
  re.MULTILINE
)
src, n2 = novo_re.subn('', src)

with open(path, "w", encoding="utf-8") as f: f.write(src)
print(f"[{path}] reativou={n1} removeu-novo={n2}")
PY
done

# Espelhamento
mkdir -p www
cp -f index.html www/index.html
cp -f app.html   www/app.html
echo "[ok] espelhos www/ atualizados."

# Verificações (opcionais no rollback)
node scripts/check-load-order.mjs
node scripts/verify-mirror.mjs || true

echo "[done] rollback-leads-visual-final-20260907"
