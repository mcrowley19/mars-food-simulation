#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required but not installed."
  exit 1
fi

if [[ ! -f "$ROOT_DIR/amplify.yml" ]] && [[ ! -d "$ROOT_DIR/amplify" ]]; then
  echo "This repository does not look like an Amplify project yet."
  echo "If you are using a separate Amplify app, run this script from that app's root."
  exit 1
fi

echo "Starting Amplify sandbox..."
npx ampx sandbox
