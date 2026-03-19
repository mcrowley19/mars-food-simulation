# Scripts README

Developer helper scripts for setup and local execution.

## Important Files

| File | Purpose |
|---|---|
| `check-prereqs.sh` | verifies local toolchain (git/node/npm/python/pip, optional aws-cli) |
| `setup-no-kiro.sh` | one-time setup (frontend deps + Python venv + core Python packages) |
| `run-frontend.sh` | starts only the frontend Vite dev server |
| `run-ampx-sandbox.sh` | runs Amplify sandbox and writes outputs to frontend |
| `../start.sh` | top-level launcher for both backend + frontend |

## Typical Use

```bash
./scripts/check-prereqs.sh
./scripts/setup-no-kiro.sh
./start.sh
```

For frontend-only development:

```bash
./scripts/run-frontend.sh
```
