#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/bin:$PATH"
BACKEND_PORT=8000
FRONTEND_PORT=5173

cleanup() {
  echo ""
  echo "Shutting down..."
  kill "${BACKEND_PID:-}" 2>/dev/null || true
  kill "${FRONTEND_PID:-}" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

kill_port() {
  local port="$1"
  local pids=""

  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    return
  fi

  pids="$(ss -ltnp 2>/dev/null | awk -v port=":$port" '
    $4 ~ port {
      while (match($0, /pid=[0-9]+/)) {
        pid = substr($0, RSTART + 4, RLENGTH - 4)
        print pid
        $0 = substr($0, RSTART + RLENGTH)
      }
    }'
  )"

  if [[ -n "$pids" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      kill "$pid" 2>/dev/null || true
    done <<<"$(printf "%s\n" "$pids" | awk '!seen[$0]++')"
  fi
}

port_in_use() {
  local port="$1"
  ss -ltnH | awk -v port=":$port" '$4 ~ port { found=1 } END { exit !found }'
}

echo "==> Freeing required ports ($BACKEND_PORT, $FRONTEND_PORT)..."
kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"
sleep 0.4

if port_in_use "$BACKEND_PORT" || port_in_use "$FRONTEND_PORT"; then
  echo "Error: unable to free one or more required ports."
  echo "Please stop conflicting processes manually and run ./start.sh again."
  exit 1
fi

# ── Load AWS credentials ──
if [[ -f "$ROOT_DIR/backend/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/backend/.env"
  set +a
fi

# ── Activate Python venv (create if missing) ──
if [[ ! -d "$ROOT_DIR/.venv" ]]; then
  echo "==> Creating Python virtual environment..."
  python3 -m venv "$ROOT_DIR/.venv"
fi
# shellcheck disable=SC1091
source "$ROOT_DIR/.venv/bin/activate"

# ── Install Python deps if needed ──
if ! python -c "import fastapi" 2>/dev/null; then
  echo "==> Installing Python dependencies..."
  pip install -q fastapi uvicorn strands-agents strands-agents-tools
fi

# ── Install frontend deps if needed ──
if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "==> Installing frontend dependencies..."
  npm install --prefix "$ROOT_DIR/frontend"
fi

# ── Generate Amplify outputs into frontend ──
if [[ -d "$ROOT_DIR/backend/amplify" ]]; then
  echo "==> Generating Amplify outputs..."
  cd "$ROOT_DIR/backend"
  npx ampx generate outputs --format json --out-dir "$ROOT_DIR/frontend" 2>/dev/null || true
  cd "$ROOT_DIR"
fi

# ── Start backend API (FastAPI) ──
echo "==> Starting backend API on http://localhost:$BACKEND_PORT"
cd "$ROOT_DIR/backend"
uvicorn api:app --reload --port "$BACKEND_PORT" &
BACKEND_PID=$!
cd "$ROOT_DIR"
sleep 0.7
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Error: backend failed to start on port $BACKEND_PORT."
  exit 1
fi

# ── Build and start frontend (Vite preview) ──
echo "==> Starting frontend on http://localhost:$FRONTEND_PORT"
cd "$ROOT_DIR/frontend"
npm run build
npm run preview -- --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort &
FRONTEND_PID=$!
cd "$ROOT_DIR"
sleep 0.7
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo "Error: frontend preview failed to start on port $FRONTEND_PORT."
  kill "$BACKEND_PID" 2>/dev/null || true
  exit 1
fi

echo ""
echo "  Mars Food Simulation is running!"
echo ""
echo "  Frontend:  http://localhost:$FRONTEND_PORT"
echo "  Backend:   http://localhost:$BACKEND_PORT"
echo "  API docs:  http://localhost:$BACKEND_PORT/docs"
echo ""
echo "  Press Ctrl+C to stop everything."
echo ""

wait
