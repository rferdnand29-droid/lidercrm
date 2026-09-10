#!/usr/bin/env bash
# Rollback do fix de scroll-reset (20260804). Restaura tudo do
# backup em: /home/user/projeto/lidercrm/.backups/fix-scroll-reset-20260804_134156
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP="/home/user/projeto/lidercrm/.backups/fix-scroll-reset-20260804_134156"

if [ ! -d "$BACKUP" ]; then
  echo "Backup não encontrado: $BACKUP"; exit 1
fi

# 1) remove o patch novo
rm -f "$ROOT/js/patches/kanban-leads/lf-fix-scroll-reset-lead-move-v1-20260804.js"

# 2) remove tag do HTML
for f in "$ROOT/index.html" "$ROOT/app.html"; do
  [ -f "$f" ] || continue
  if sed --version >/dev/null 2>&1; then
    sed -i '/lf-fix-scroll-reset-lead-move-v1-20260804.js/d' "$f"
  else
    sed -i '' '/lf-fix-scroll-reset-lead-move-v1-20260804.js/d' "$f"
  fi
done

# 3) opcional — restaura arquivos originais completos
[ -f "$BACKUP/index.html" ] && cp "$BACKUP/index.html" "$ROOT/index.html"
[ -f "$BACKUP/app.html"   ] && cp "$BACKUP/app.html"   "$ROOT/app.html"

echo "Rollback concluído."
