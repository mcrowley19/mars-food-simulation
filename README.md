# Sol-450

A full-stack, multi-agent greenhouse simulator for long-duration Mars missions. Configure a colony, launch AI-managed agricultural systems, and watch your crew survive — or not.

---

## Stack

| Layer          | Technology                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Frontend       | React 19 + Three.js — 3D colony visualization, real-time HUD, day/night cycle, per-plant tooltips   |
| Backend        | FastAPI — simulation engine, session management, API orchestration                                  |
| AI agents      | Strands agents on Amazon Bedrock (Nova Micro) — autonomous crop management each sol                 |
| Knowledge base | MCP server (Bedrock AgentCore) — Mars agricultural data for crop biology and environment parameters |
| State storage  | DynamoDB — per-session mission state                                                                |

---

## Live Demo

**[sol450.xyz](https://sol450.xyz)** — fully deployed instance, no setup required.

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
# Fill in AWS region and DynamoDB table name in backend/.env
./start.sh
```

| Service     | URL                          |
| ----------- | ---------------------------- |
| Frontend    | `http://localhost:5173`      |
| Backend API | `http://localhost:8000`      |
| API docs    | `http://localhost:8000/docs` |

---

## How It Works

### Session Setup

Two modes are available from the setup screen:

**Manual** — configure astronaut count, mission duration, floor space, water, nutrients, soil, seed types, food supplies (kcal), and fuel (kg). The backend validates minimum requirements and plants 2/3 of seeds immediately, holding the rest in a seed reserve for staggered replanting.

**AI-Optimised** — provide max cargo weight, astronaut count, and mission duration. An AI agent calculates the optimal allocation of water, fuel, food, seeds, and floor space within the cargo limit, then shows a reasoning summary before launch.

### Simulation Loop

Each sol (Martian day), the following steps run in order:

1. **Resource consumption** — crew consumes water and calories; crops consume water and nutrients; grow lights and life support burn fuel
2. **Crop ageing** — each plant ages one day; water/nutrient/light/environment stress scores are recalculated and folded into a cumulative health score that scales final yield
3. **Auto-harvest** — mature crops are harvested; yield is proportional to cumulative health; seeds are partially returned to the reserve
4. **Food rot** — harvested food has a crop-specific shelf life; expired batches are removed and calories deducted
5. **Auto-planting** — when a crop type has no seedlings and seeds exist in reserve, a batch is planted automatically
6. **AI agents** — the orchestrator runs in a background thread, coordinating specialist agents via Strands and the MCP knowledge base

### AI Agent Architecture

The orchestrator agent (Bedrock Nova Micro) coordinates five specialist agents, all lazy-loaded:

| Agent               | Responsibility                                                                     |
| ------------------- | ---------------------------------------------------------------------------------- |
| `orchestrator`      | Reads full sim state each tick; issues instructions; delegates to specialists      |
| `crop_planner`      | Selects which crops to plant and when, considering seed reserve and shelf life     |
| `harvest_optimizer` | Identifies ready-to-harvest crops; balances freshness vs calorie need              |
| `resource_manager`  | Monitors water, nutrients, fuel, and calories; flags shortages                     |
| `env_monitor`       | Watches temperature, CO₂, humidity, and light; recommends adjustments              |
| `fault_handler`     | Responds to simulation events — low water, fuel depletion, crop death, dust storms |

Agents can call simulation tools directly (harvest, replant, adjust water/nutrients, set environment params, add alerts) and query the Mars knowledge base via MCP.

### Knowledge Base Integration

On first use per session, `agents/simulator.py` queries the MCP KB for:

- Crew calorie and water requirements
- Optimal temperature and CO₂ ranges
- Per-crop maturity days, water consumption, caloric value, and shelf life

Values are sampled from KB-documented ranges, giving realistic mission-to-mission variance. Hardcoded fallback tables are used if the KB is unreachable.

### Energy Model

| Component    | Rate                                    |
| ------------ | --------------------------------------- |
| Grow lights  | 0.3 kW per m² of floor space, ~12 h/day |
| Life support | 3.0 kW constant (24 h/day)              |
| Fuel yield   | 3.5 kWh per kg of fuel                  |

Fuel depletion triggers a `fuel_depleted` event that reduces light intensity to 10%.

### Calorie Model

A running balance is maintained — not recalculated from scratch each tick. Harvests add calories (yield × kcal/kg), crew consumption subtracts daily (2,500 kcal/astronaut/day by default, KB-informed), and food rot subtracts when batches expire.

### Crop Reference

| Crop    | Maturity | Water/day | kcal/kg | Shelf life |
| ------- | -------- | --------- | ------- | ---------- |
| Radish  | 25 d     | 0.15 L    | 160     | 14 d       |
| Lettuce | 30 d     | 0.20 L    | 150     | 7 d        |
| Spinach | 40 d     | 0.22 L    | 230     | 7 d        |
| Kale    | 55 d     | 0.25 L    | 490     | 10 d       |
| Pea     | 60 d     | 0.30 L    | 810     | 5 d        |
| Carrot  | 75 d     | 0.30 L    | 410     | 30 d       |
| Soybean | 80 d     | 0.40 L    | 1470    | 120 d      |
| Potato  | 90 d     | 0.50 L    | 770     | 60 d       |
| Tomato  | 70 d     | 0.60 L    | 180     | 14 d       |
| Wheat   | 120 d    | 0.30 L    | 3390    | 180 d      |

These values are fallbacks — the KB lookup may return slightly different values for each session.

---

## API Endpoints

All endpoints accept an `x-session-id` header for session isolation.

| Method | Path                  | Description                                                                  |
| ------ | --------------------- | ---------------------------------------------------------------------------- |
| `GET`  | `/health`             | Service health check                                                         |
| `GET`  | `/setup-status`       | Setup completion status for current session                                  |
| `POST` | `/setup/manual`       | Initialise state with user-provided mission config                           |
| `POST` | `/setup/ai-optimised` | Start async AI-generated mission config                                      |
| `POST` | `/invoke`             | Fire-and-forget orchestrator prompt (marks `agents_initialised` immediately) |
| `POST` | `/simulate-tick`      | Advance sim by one sol and trigger background agent run                      |
| `POST` | `/simulate-jump`      | Fast-forward to a target sol (capped at 500 ticks)                           |
| `GET`  | `/state`              | Full session state + parsed agent logs                                       |
| `POST` | `/reset`              | Reset session state to blank                                                 |

---

## State Shape

Key top-level fields returned by `/state`:

| Field                | Description                                                 |
| -------------------- | ----------------------------------------------------------- |
| `mission_day`        | Current sol number                                          |
| `crops[]`            | Active crop objects with age, health, status                |
| `seed_reserve`       | Unplanted seeds by crop type                                |
| `harvested[]`        | Harvested batches with timestamps for rot calculation       |
| `environment`        | temp_c, co2_ppm, humidity_pct, light_hours, light_intensity |
| `resources`          | water_l, nutrients_kg, fuel_kg                              |
| `calories_available` | Running calorie balance                                     |
| `active_events[]`    | Current events (dust_storm, co2_spike, fuel_depleted, etc.) |
| `alerts[]`           | Agent-generated crew alerts                                 |
| `agent_logs`         | Full per-agent log history                                  |
| `agent_logs_parsed`  | Cleaned, truncated logs ready for frontend display          |
| `agents_initialised` | True once the first agent run has started                   |

---

## Project Structure

```
mars-food-simulation/
├── backend/                  # FastAPI server, simulation engine, AI agents
│   ├── api.py                # HTTP endpoints, session management, log parsing
│   ├── main.py               # Bedrock AgentCore entrypoint
│   ├── state.py              # DynamoDB session state
│   ├── setup_modes.py        # Manual/AI setup, crop constants, KB enrichment
│   ├── agents/               # Orchestrator + 5 specialist agents + simulator
│   ├── tools/                # Agent-callable tools + MCP KB client
│   ├── infrastructure/       # DynamoDB setup, Lambda deployment
│   └── tests/                # Unit tests (setup, simulator, orchestrator schedule)
├── frontend/                 # React + Three.js UI
│   └── src/
│       ├── App.jsx           # Screen router (landing → dashboard → greenhouse)
│       ├── components/
│       │   ├── InitialiseSession.jsx  # Setup screen
│       │   └── greenhouse/            # 3D colony renderer
│       ├── hooks/            # useGreenhouseState polling hook
│       └── utils/            # API client, session ID management
├── scripts/                  # Dev setup and helper scripts
├── start.sh                  # One-command local startup
└── amplify.yml               # Amplify build config for frontend deployment
```

---

## Testing

```bash
chmod +x scripts/run_all_tests.sh
./scripts/run_all_tests.sh
```

Runs the frontend production build and `python -m unittest discover` in `backend/tests/` covering simulator tick invariants, `manual_setup` validation, JSON extraction, and orchestrator scheduling.

---

## Further Docs

| Doc                  | Location                                       |
| -------------------- | ---------------------------------------------- |
| Backend deep-dive    | `backend/README.md`                            |
| Agent catalog        | `backend/agents/README.md`                     |
| Tool catalog         | `backend/tools/README.md`                      |
| Frontend deep-dive   | `frontend/README.md`                           |
| 3D greenhouse module | `frontend/src/components/greenhouse/README.md` |
| Dev scripts          | `scripts/README.md`                            |
