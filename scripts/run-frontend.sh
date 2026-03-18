#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Starting frontend dev server..."
npm run dev --prefix "$ROOT_DIR/frontend"
