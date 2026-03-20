#!/usr/bin/env bash
# Run from repo root. Uses backend/.venv if present; otherwise system python3 (needs deps).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Frontend: production build ==="
(cd frontend && npm run build)

echo "=== Backend: unit tests ==="
PY="$ROOT/backend/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "No backend/.venv — using python3 (install: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)"
  PY="python3"
fi
(cd backend && "$PY" -m unittest discover -s tests -v)

echo "=== Optional: cd frontend && npm run lint (some legacy rules still fail) ==="
echo "=== All checks passed ==="
