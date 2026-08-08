#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
PATCH_SRC="js/patches/chat/lf-fix-dm-delete-isolation-v1-20260804.js"
PATCH_TAG='<script src="js/patches/chat/lf-fix-dm-delete-isolation-v1-20260804.js?v=20260804dmdel1"></script>'
ANCHOR='<script src="js/patches/lf-fix-adm-sair-apagar-grupo-v1-20260801.js?v=20260801admexit1"></script>'

if [[ ! -f "$ROOT/$PATCH_SRC" ]]; then
  echo "[erro] Patch não encontrado em $ROOT/$PATCH_SRC" >&2
  exit 1
fi

python3 - "$ROOT" "$PATCH_TAG" "$ANCHOR" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
tag = sys.argv[2]
anchor = sys.argv[3]
for name in ['index.html','app.html']:
    p = root / name
    if not p.exists():
        continue
    txt = p.read_text(encoding='utf-8', errors='ignore')
    if tag in txt:
        print(f'[ok] {name}: tag já presente')
        continue
    if anchor not in txt:
        print(f'[warn] {name}: âncora não encontrada; inserir manualmente após o patch adm-exit')
        continue
    txt = txt.replace(anchor, anchor + '\n<!-- FIX DM DELETE ISOLATION v1 (2026-08-04) — garante que excluir DM remove só do inbox do usuário atual. -->\n' + tag, 1)
    p.write_text(txt, encoding='utf-8')
    print(f'[ok] {name}: tag inserida')
PY

echo "Patch aplicado. Faça deploy/refresh e limpe cache do app se necessário."
