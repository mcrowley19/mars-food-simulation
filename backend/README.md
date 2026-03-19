# Backend README

This backend provides simulation state management, mission setup logic, AI orchestration, and REST APIs consumed by the frontend.

## Runtime Stack

- FastAPI (`api.py`)
- DynamoDB state storage (`state.py`)
- Strands agents with Bedrock model execution (`agents/`)
- Domain rules engine (`simulation.py`)

## Important Files (and when to edit)

| File | Responsibility | Edit this when... |
|---|---|---|
| `api.py` | HTTP API surface, session scoping, orchestration triggers, parsed log output | adding/changing endpoints or response payloads |
| `state.py` | DynamoDB read/write + session-key normalization + Decimal conversion | changing persistence, state keying, or serialization |
| `simulation.py` | one-tick Mars greenhouse rules | adjusting biology/environment/resource dynamics |
| `setup_modes.py` | manual and AI-driven initial mission configuration | changing defaults, validation, or setup schemas |
| `main.py` | Bedrock AgentCore entrypoint | deploying/running as AgentCore runtime |
| `requirements.txt` | Python runtime dependencies | adding/removing backend Python packages |
| `test_setup_modes.py` | setup-mode smoke tests | validating setup schema/constraint changes |

## API Flow

1. Frontend calls setup endpoint (`/setup/manual` or `/setup/ai-optimised`).
2. State is initialized and persisted.
3. Frontend polls `/state` on interval.
4. Frontend (or ticker) triggers `/simulate-tick`.
5. `simulation.py` mutates state by one sol.
6. Orchestrator runs (if lock available), delegates to specialists, writes logs/actions.
7. `/state` returns full state + `agent_logs_parsed` for UI tabs.

## State Shape (high-level)

Important top-level keys in state:

- `mission_day`
- `crops[]`
- `environment`
- `resources`
- `alerts[]`
- `active_events[]`
- `agent_last_actions`
- `agent_logs`
- `setup_complete`, `setup_mode`

`/state` also returns derived `agent_logs_parsed`:

- grouped by agent name
- includes normalized `task_lines` and `response_lines`
- intentionally frontend-friendly and display-ready

## Agents + Tools

- Agent implementations: `agents/README.md`
- Tool implementations: `tools/README.md`

## Local Commands

Run API locally (from repo root):

```bash
uvicorn backend.api:app --reload --port 8000
```

Run setup smoke test:

```bash
python backend/test_setup_modes.py
```
