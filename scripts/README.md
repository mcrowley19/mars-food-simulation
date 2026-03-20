# Scripts

Developer helper scripts for setup, local execution, and CI.

---

## File Map

| File | Purpose |
|---|---|
| `check-prereqs.sh` | Verifies local toolchain — git, node, npm, python, pip, and optionally aws-cli |
| `setup-no-kiro.sh` | One-time dependency install — frontend `npm install` + Python venv + pip packages |
| `run-frontend.sh` | Starts only the frontend Vite dev server on port 5173 |
| `run-ampx-sandbox.sh` | Runs Amplify sandbox environment and writes outputs to the frontend |
| `run_all_tests.sh` | Runs the full test suite: frontend production build + backend unit tests |
| `ci-workflow.example.yml` | GitHub Actions CI template — copy to `.github/workflows/ci.yml` to enable |

---

## Typical Setup

```bash
# 1. Check you have the right tools
./scripts/check-prereqs.sh

# 2. Install all dependencies (frontend npm + backend Python venv)
./scripts/setup-no-kiro.sh

# 3. Configure AWS credentials
cp backend/.env.example backend/.env
# Edit backend/.env with your AWS_DEFAULT_REGION, DynamoDB table name, etc.

# 4. Start everything
./start.sh
```

`start.sh` at the repo root launches both the backend (uvicorn on port 8000) and frontend (Vite on port 5173) in parallel.

---

## Frontend Only

If you are only working on the UI and don't need the backend running locally:

```bash
./scripts/run-frontend.sh
```

Point `API_BASE_URL` in `frontend/src/utils/api.js` at your deployed backend URL if needed.

---

## Running Tests

```bash
chmod +x scripts/run_all_tests.sh
./scripts/run_all_tests.sh
```

This runs:
1. `npm run build` in `frontend/` — catches JSX/import errors
2. `python -m unittest discover backend/tests/` — covers:
   - `test_setup_modes.py` — `manual_setup` validation, JSON extraction, minimum food/fuel checks
   - `test_simulator_tick.py` — simulator tick invariants (day counter, resource keys, crop health fields)
   - `test_api_orchestrator_schedule.py` — orchestrator scheduling logic matches `api.py`

Tests use stub KB params so they never hit Bedrock or DynamoDB.

---

## CI

Copy `scripts/ci-workflow.example.yml` to `.github/workflows/ci.yml` to run the same build and test suite on every push and pull request. Requires a GitHub PAT with the `workflow` scope to push the workflow file.
