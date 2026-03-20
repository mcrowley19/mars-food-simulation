# Mars Food Simulation

A full-stack, multi-agent greenhouse simulator for long-duration Mars missions. Configure a colony, launch AI-managed agricultural systems, and watch your crew survive — or not.

The stack:

- **React + Three.js** — 3D greenhouse visualization with real-time HUD, day/night cycle, per-plant health tooltips, and resource trend charts
- **FastAPI** — simulation engine, session management, and API orchestration
- **Strands agents on Amazon Bedrock (Nova Lite)** — autonomous AI agents that plant, harvest, and manage resources each sol
- **DynamoDB** — per-session state storage

---

## Quick Start

### Prerequisites

- Node.js `>=18`
- Python `>=3.12`
- AWS credentials with access to Bedrock and DynamoDB

### Setup

```bash
chmod +x start.sh scripts/*.sh
./scripts/setup-no-kiro.sh
cp backend/.env.example backend/.env
```

Fill in `backend/.env` with your AWS region and DynamoDB table name, then:

```bash
./start.sh
```

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:8000` |
| API docs | `http://localhost:8000/docs` |

---

## How It Works

### Session Initialisation

Two modes are available from the setup screen:

**Manual** — user configures astronaut count, mission duration, floor space, water, nutrients, soil, seed types, food supplies (kcal), and fuel (kg). The backend validates minimums and plants 2/3 of seeds immediately, holding the rest in a seed reserve for staggered replanting.

**AI-Optimised** — user provides max cargo weight, astronaut count, and mission duration. An AI agent calculates the optimal allocation of water, fuel, food, seeds, and floor space within the cargo limit, then explains its reasoning in a summary card before launch.

### Simulation Loop

Each sol (Martian day):

1. **Resources consumed** — crew uses water and calories; crops consume water and nutrients; grow lights and life support burn fuel
2. **Crop ageing** — each plant ages by one day; health scores (water stress, nutrient stress, light stress, environmental stress) are recalculated and accumulated into a cumulative health score that scales final yield
3. **Auto-harvest** — mature crops are harvested automatically; yield is proportional to cumulative health; seeds are partially returned to the reserve
4. **Food rot** — harvested food has a crop-specific shelf life; expired food is removed and calories deducted
5. **Auto-planting** — when a crop type has no seedlings and seeds exist in reserve, a batch is planted automatically
6. **AI agents** — the orchestrator runs every N ticks, coordinating specialist agents (crop planner, harvest optimizer, resource manager, environment monitor, fault handler) via the Strands framework and an MCP knowledge base

### Energy Model

Grow lights consume **0.3 kW per m²** of floor space, running ~12 hours/day. Life support consumes **3 kW** continuously. All electricity is generated from fuel at **3.5 kWh/kg**. Fuel depletion triggers a `fuel_depleted` event.

### Calorie Model

A running balance is maintained — not recalculated from scratch each tick. Harvests add calories, crew consumption subtracts daily (2,500 kcal/astronaut/day), and food rot subtracts when batches expire.

### Food Rot

Each crop type has a shelf life after harvest:

| Crop | Shelf life |
|---|---|
| Lettuce | 7 days |
| Radish | 14 days |
| Kale | 10 days |
| Tomato | 10 days |
| Carrot | 30 days |
| Pea | 7 days |
| Potato | 60 days |
| Soybean | 90 days |
| Wheat | 180 days |

---

## Project Map

| Path | What it owns |
|---|---|
| `frontend/` | UI, 3D scenes, session setup UX, greenhouse HUD |
| `backend/` | API endpoints, simulation rules, session state, AI orchestration |
| `backend/agents/` | Strands agent definitions (orchestrator + 5 specialists) |
| `backend/tools/` | Agent tools — planting, harvesting, environment, MCP client |
| `backend/setup_modes.py` | Manual and AI setup logic, constants, cargo weight validation |
| `backend/simulation.py` | Per-tick simulation: resource consumption, crop ageing, health scoring, harvest, rot, auto-plant, energy |
| `scripts/` | Setup and dev helper scripts |
| `start.sh` | One-command local startup |
| `amplify.yml` | Amplify build config for frontend deployment |

---

## AI Agents

| Agent | Role |
|---|---|
| `orchestrator` | Coordinates all specialist agents each tick; reads full sim state; issues instructions |
| `crop_planner` | Decides which crops to plant and when; uses seed reserve and shelf life data |
| `harvest_optimizer` | Identifies ready-to-harvest crops; balances freshness vs calorie need |
| `resource_manager` | Monitors water, nutrients, fuel, and calories; flags shortages |
| `env_monitor` | Watches temperature, CO₂, humidity, and light; recommends adjustments |
| `fault_handler` | Responds to simulation events (low water, fuel depleted, crop death) |

All agents access a Mars agricultural knowledge base via an MCP server.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `GET` | `/setup-status` | Setup completion status for current session |
| `POST` | `/setup/manual` | Initialise state with user-provided mission config |
| `POST` | `/setup/ai-optimised` | Start async AI-generated mission config |
| `POST` | `/invoke` | Invoke orchestrator with a prompt (fire-and-forget) |
| `POST` | `/simulate-tick` | Advance sim by one sol and trigger background agent run |
| `POST` | `/simulate-jump` | Fast-forward to a target sol (capped at 500 ticks) |
| `GET` | `/state` | Full session state + parsed agent logs |
| `POST` | `/reset` | Reset session state to blank |

All endpoints accept an `x-session-id` header for session isolation.

---

## State + Session Notes

- State lives in DynamoDB, keyed by session ID
- Agent actions are stored in `agent_last_actions` (latest per agent) and `agent_logs` (full history)
- The backend returns `agent_logs_parsed` — cleaned, truncated log lines ready for the frontend HUD
- Seed reserve (`seed_reserve`) tracks unplanted seeds by crop type
- Harvested food is stored with a timestamp so rot can be calculated per batch

---

## Testing

From the repo root (uses `backend/.venv` if you created it; otherwise install `backend/requirements.txt` first):

```bash
chmod +x scripts/run_all_tests.sh
./scripts/run_all_tests.sh
```

That runs the **frontend production build** and **`python -m unittest discover`** in `backend/tests/` (simulator ticks, `manual_setup` validation, JSON extraction, orchestrator schedule vs `api.py`).

**Legacy script** (prints full manual state; includes `ai_optimised_setup` which needs Bedrock):

```bash
cd backend && .venv/bin/python test_setup_modes.py
```

Optional CI: add `.github/workflows/ci.yml` (see template in `scripts/ci-workflow.example.yml`) to run the same build + tests on push/PR. Pushing workflow files requires a Git PAT with the **workflow** scope.

---

## Further Docs

- Backend deep-dive: `backend/README.md`
- Agent catalog: `backend/agents/README.md`
- Tool catalog: `backend/tools/README.md`
- Frontend deep-dive: `frontend/README.md`
- 3D greenhouse module: `frontend/src/components/greenhouse/README.md`
- Dev scripts: `scripts/README.md`
