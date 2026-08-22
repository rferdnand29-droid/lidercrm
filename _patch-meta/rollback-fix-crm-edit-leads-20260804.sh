#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
for rel in "js/kanban.js" "_worker_src/worker/controllers/kanban-controller.js"; do
  src="$ROOT/$rel"
  bak="$src.bak-20260804"
  if [[ -f "$bak" ]]; then
    cp "$bak" "$src"
    echo "[ok] restaurado: $src"
  else
    echo "[skip] backup não encontrado: $bak"
  fi
done
