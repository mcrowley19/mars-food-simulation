# Backend

FastAPI server providing the simulation engine, session state, AI orchestration, and REST API for the Mars Food Simulation.

---

## File Map

| File | Responsibility |
|---|---|
| `api.py` | All HTTP endpoints, session scoping, background agent threading, log parsing |
| `main.py` | Bedrock AgentCore entrypoint — used when deploying as an AgentCore runtime |
| `state.py` | DynamoDB read/write, session-key normalisation, Decimal serialisation |
| `setup_modes.py` | Manual and AI setup logic, crop constants, KB-enriched crop tables, cargo validation |
| `agents/` | Orchestrator + 5 specialist agents + per-tick simulator |
| `tools/` | Agent-callable simulation tools and MCP KB client |
| `infrastructure/` | DynamoDB table setup and Lambda deployment utilities |
| `tests/` | Unit tests for setup validation, simulator ticks, and orchestrator scheduling |
| `Dockerfile` | Python 3.11 slim image; exposes port 8080; runs `python main.py` |
| `requirements.txt` | Python runtime dependencies |

---

## API Flow

```
Frontend                          Backend
   |                                  |
   |-- POST /setup/manual ----------->|  Validate config, plant initial crops, write state to DynamoDB
   |                                  |
   |-- POST /invoke ----------------->|  Start orchestrator in background thread, mark agents_initialised immediately
   |                                  |
   |-- GET /state (polling) --------->|  Return full state + agent_logs_parsed
   |                                  |
   |-- POST /simulate-tick ---------->|  Advance one sol: resource consumption, crop ageing, harvest, rot, replant
   |                                  |  If agent lock free: spawn background thread to run orchestrator
   |                                  |
   |<- Full state + parsed logs ------|
```

---

## Session Management

Every request carries an `x-session-id` header. `normalize_session_key()` in `state.py` maps it to a DynamoDB key. State is loaded per request via a `ContextVar` so concurrent sessions never bleed into each other.

Two thread locks per session prevent races:
- **invoke lock** — ensures only one orchestrator invocation runs at a time per session
- **orchestrator call lock** — global lock preventing concurrent Bedrock calls across all sessions

---

## Simulation Engine (`agents/simulator.py`)

The per-tick simulation runs entirely in Python arithmetic — no LLM involvement. Each call to `run_simulation_tick(state)`:

1. Loads KB-informed parameters from the session cache (queried once per session from the MCP KB)
2. Consumes resources: water and nutrients per crop, water per crew member (net of recycling), fuel for lights and life support
3. Ages crops and recomputes health scores (water stress × 0.35, nutrient stress × 0.20, light stress × 0.25, env stress × 0.20)
4. Auto-harvests mature crops; yield = `base_yield_kg × health × progress`; seeds partially returned
5. Removes rotted food batches; deducts calories
6. Auto-plants from seed reserve when slots are available
7. Applies random events (dust storm, water recycler fault, CO₂ spike) using KB-sampled probabilities

### KB Parameter Cache

On the first tick for a session, `_get_kb_params()` queries the MCP knowledge base for:
- Crew calorie and water requirements
- Optimal temperature and CO₂ ranges
- Per-crop maturity days, water consumption, kcal/kg, and shelf life

Results are cached in `_kb_params_cache[session_key]` for the rest of the session, providing mission-to-mission variance while keeping simulation arithmetic consistent within a run. Hardcoded fallback tables in `setup_modes.py` are used if the KB is unreachable.

---

## Setup Modes (`setup_modes.py`)

### Manual Setup

`manual_setup(params)` validates:
- No negative resource values
- All seed types are from the valid list
- Floor space is sufficient for the requested plant count
- Food supplies cover the gap until the first harvest
- Fuel covers the entire mission's energy needs

Then plants 2/3 of seeds immediately and holds the rest in `seed_reserve` for staggered replanting.

### AI-Optimised Setup

`ai_optimised_setup(astronaut_count, mission_days, max_cargo_kg)`:
1. Calls a Bedrock Nova Micro agent (no tools — all crop data embedded in prompt) with the cargo constraint
2. Parses the JSON response
3. Auto-corrects water, fuel, floor space, and food kcal to guaranteed minimums
4. Runs through `manual_setup` for final validation

### KB-Enriched Crop Tables

`_get_kb_crop_tables()` is called lazily at first use and cached in-process. It queries the MCP KB for each of the 10 crop types and parses maturity days, water rate, kcal/kg, and shelf life from the response. Falls back to hardcoded constants per crop if parsing fails.

---

## State Shape

```python
{
    "mission_day": int,
    "crops": [
        {
            "name": str,
            "age_days": int,
            "maturity_days": int,
            "water_per_day_l": float,
            "nutrient_per_day_kg": float,
            "status": "growing" | "ready_to_harvest" | "dead",
            "health": float,          # 0.0–1.0
            "cumulative_health": float,
        }
    ],
    "seed_reserve": { "lettuce": int, ... },
    "harvested": [
        {
            "name": str,
            "yield_kg": float,
            "harvested_on_day": int,
            "seeds_gained": int,
        }
    ],
    "environment": {
        "temp_c": float,
        "co2_ppm": int,
        "humidity_pct": float,
        "light_hours": float,
        "light_intensity": float,
    },
    "resources": {
        "water_l": float,
        "nutrients_kg": float,
        "fuel_kg": float,
    },
    "calories_available": float,
    "calories_needed_per_day": float,
    "active_events": ["dust_storm", "co2_spike", ...],
    "alerts": [{ "severity": str, "message": str, "day": int }],
    "agent_logs": { "orchestrator": [...], "crop_planner": [...], ... },
    "agent_last_actions": { "orchestrator": str, ... },
    "agents_initialised": bool,
    "setup_complete": bool,
    "setup_mode": "manual" | "ai_optimised",
}
```

`/state` also returns `agent_logs_parsed` — per-agent lists of `{ task_lines, response_lines, day }` cleaned and truncated for frontend display.

---

## Agent Log Pipeline

1. Orchestrator and sub-agents write raw logs to `state["agent_logs"][agent_name]` via `_append_agent_log()` / `_append_state_agent_log()` — these persist to DynamoDB mid-run, so the frontend sees incremental updates at each poll
2. `_build_parsed_agent_logs()` in `api.py` processes logs before each `/state` response: strips XML tags, parses JSON payloads, scores lines by importance, and truncates to display limits
3. Frontend polls `/state` every 400 ms (sidebar open) or 900 ms (sidebar closed)

---

## Local Development

```bash
# From repo root
uvicorn backend.api:app --reload --port 8000

# Run all backend tests
cd backend && python -m unittest discover tests/
```

---

## Deployment

The `Dockerfile` builds a portable Python 3.11 image. `infrastructure/lambda_deploy.py` and `infrastructure/dynamo_setup.py` handle AWS resource setup. The `main.py` entrypoint wraps the FastAPI app in the Bedrock AgentCore runtime for managed deployment.
