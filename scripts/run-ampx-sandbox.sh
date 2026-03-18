#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required but not installed."
  exit 1
fi

if [[ ! -d "$BACKEND_DIR/amplify" ]]; then
  echo "Amplify backend folder not found at $BACKEND_DIR/amplify."
  echo "If your Amplify app lives elsewhere, run ampx from that backend root."
  exit 1
fi

if [[ -f "$BACKEND_DIR/.env" ]]; then
  # Load AWS_* vars for this shell only.
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_DIR/.env"
  set +a
fi

export PATH="$HOME/.local/bin:$PATH"

echo "Starting Amplify sandbox..."
cd "$BACKEND_DIR"
npx ampx sandbox --outputs-out-dir "$ROOT_DIR/frontend" --outputs-format json
