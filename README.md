# Mars Food Simulation

Mars Food Simulation is a full-stack, multi-agent greenhouse simulator for long-duration Mars missions.  
It combines:

- a React + Three.js frontend for visualizing colony state
- a FastAPI backend for simulation + API orchestration
- Strands agents on Amazon Bedrock for decision support
- DynamoDB-backed session state

## Quick Start

### Prerequisites

- Node.js `>=18`
- Python `>=3.12`
- Git
- AWS credentials (for Bedrock + DynamoDB-backed flows)

### Setup

```bash
chmod +x start.sh scripts/*.sh
./scripts/setup-no-kiro.sh
cp backend/.env.example backend/.env
```

Fill in `backend/.env`, then run:

```bash
./start.sh
```

Services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

## Project Map

| Path | What it owns |
|---|---|
| `frontend/` | UI, 3D scenes, session setup UX, greenhouse HUD |
| `backend/` | API endpoints, simulation rules, session state, AI orchestration |
| `scripts/` | setup + dev helper scripts |
| `start.sh` | one-command local startup for backend + frontend |
| `amplify.yml` | Amplify build config for frontend deployment |

## Important Docs

- Backend deep-dive: `backend/README.md`
- Agent catalog: `backend/agents/README.md`
- Tool catalog: `backend/tools/README.md`
- Frontend deep-dive: `frontend/README.md`
- 3D greenhouse module map: `frontend/src/components/greenhouse/README.md`
- Dev scripts reference: `scripts/README.md`

## Core API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `GET` | `/setup-status` | Whether setup has completed for current session |
| `POST` | `/setup/manual` | Initializes state with user-provided mission config |
| `POST` | `/setup/ai-optimised` | Initializes state with AI-generated mission config |
| `POST` | `/invoke` | Directly invokes orchestrator with prompt context |
| `POST` | `/simulate-tick` | Advances sim by one sol and triggers background orchestration |
| `GET` | `/state` | Returns full state + parsed agent logs for frontend rendering |
| `POST` | `/reset` | Resets session state to blank defaults |

## State + Session Notes

- Each request can carry `x-session-id`; backend sanitizes it and isolates state per session.
- State lives in DynamoDB and includes crop/environment/resources/history.
- Agent actions are stored in both:
  - `agent_last_actions` (latest by agent)
  - `agent_logs` (history by agent)
- Backend also returns `agent_logs_parsed` to keep frontend display clean/readable.
