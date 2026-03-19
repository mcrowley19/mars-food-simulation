#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Running prerequisite checks"
"$ROOT_DIR/scripts/check-prereqs.sh"

echo
echo "==> Installing frontend dependencies"
npm install --prefix "$ROOT_DIR/frontend"

echo
echo "==> Preparing Python virtual environment"
if [[ ! -d "$ROOT_DIR/.venv" ]]; then
  python3 -m venv "$ROOT_DIR/.venv"
fi

# shellcheck disable=SC1091
source "$ROOT_DIR/.venv/bin/activate"

python -m pip install --upgrade pip
python -m pip install strands-agents strands-agents-tools

echo
echo "==> Setup complete"
echo "Next steps:"
echo "  1) Copy env template: cp \"$ROOT_DIR/backend/.env.example\" \"$ROOT_DIR/backend/.env\""
echo "  2) Fill in AWS vars in backend/.env"
echo "  3) Start frontend: \"$ROOT_DIR/scripts/run-frontend.sh\""
echo "  4) (Amplify projects only) Start backend sandbox: \"$ROOT_DIR/scripts/run-ampx-sandbox.sh\""
