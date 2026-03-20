# Agents

The multi-agent decision layer for the Mars greenhouse mission. Built with the Strands framework running Amazon Bedrock Nova Micro.

---

## Agent Topology

```
orchestrator
    ├── delegate_to_crop_planner      → crop_planner
    ├── delegate_to_env_monitor       → env_monitor
    ├── delegate_to_resource_manager  → resource_manager
    ├── delegate_to_harvest_optimizer → harvest_optimizer
    └── delegate_to_fault_handler     → fault_handler
```

All specialist agents are **lazy-loaded** on first delegation — they are not instantiated until the orchestrator needs them. The orchestrator is itself a singleton, created once per process via `get_orchestrator()`.

---

## File Map

| File | Role |
|---|---|
| `orchestrator.py` | Central coordinator; reads state, delegates to specialists, mutates simulation directly |
| `simulator.py` | Deterministic per-tick simulation engine; queries MCP KB for parameter ranges |
| `crop_planner.py` | Crop selection and planting schedule strategy |
| `env_monitor.py` | Environment health checks and parameter recommendations |
| `resource_manager.py` | Water, nutrient, fuel, and calorie consumption optimisation |
| `harvest_optimizer.py` | Harvest timing and replant cadence decisions |
| `fault_handler.py` | Degraded-mode response and failure triage |

---

## Orchestrator (`orchestrator.py`)

The orchestrator is invoked two ways:

1. **On launch** — via `POST /invoke` with the initial mission briefing prompt. Returns immediately (fire-and-forget); `agents_initialised` is set to `True` right away so the loading screen clears while the agent works in the background.
2. **Each tick** — via `POST /simulate-tick`, which runs the orchestrator in a background thread if the per-session lock is free.

### System Prompt Priorities

The orchestrator's system prompt enforces survival rules in priority order:

1. **Water** — if `water_days_remaining < mission_days_remaining`, remove water-hungry crops immediately
2. **Fuel** — if fuel is low, reduce `light_hours` via `set_environment_param`
3. **Calories** — if `food_days < 10`, plant fast-growing crops (radish 25d, lettuce 30d)
4. **Stagger plantings** — do not plant all seeds at once; spread harvests to avoid simultaneous rot

### Direct Tools (orchestrator can call without delegation)

| Tool | Action |
|---|---|
| `get_current_state` | Read full simulation state |
| `harvest_crop(index)` | Harvest a mature crop by slot index |
| `replant_crop(index, name)` | Plant a new seedling in a slot |
| `plant_from_reserve(name, count)` | Plant seeds from the reserve |
| `adjust_water_allocation(index, l_per_day)` | Change a crop's daily water use |
| `adjust_nutrient_allocation(index, kg_per_day)` | Change a crop's daily nutrient use |
| `set_environment_param(param, value)` | Adjust temp, CO₂, humidity, or light |
| `add_alert(severity, message)` | Record a crew alert |

---

## Simulator (`simulator.py`)

The simulator is **not an LLM agent** — it is deterministic Python arithmetic. It is called once per tick by `api.py` via `run_simulation_tick(state)`.

### KB Parameter Cache

On first call for a session, `_get_kb_params(session_key)` queries the MCP knowledge base:

```
search_mars_kb("astronaut daily calorie water requirements mission")
search_mars_kb("optimal temperature CO2 humidity light crop growing conditions")
search_mars_kb("{crop} maturity days water requirements calories per kg shelf life")
  → for each of: potato, wheat, lettuce, tomato, soybean, spinach, radish, pea, kale, carrot
```

Parsed values are cached for the session lifetime. Fallbacks from `setup_modes.py` are used if the KB is unreachable or parsing fails.

### Cached Parameters

| Parameter | Source |
|---|---|
| `crew_kcal_per_day` | KB text, range sampled |
| `crew_water_l_per_day` | KB text, range sampled |
| `urine_recovery` | Sampled 0.82–0.92 |
| `opt_temp`, `opt_co2` | KB text, range sampled |
| `opt_humidity`, `opt_light_hours` | Hardcoded fallback (50–70%, 12–16h) |
| `dust_storm_prob` | Sampled 0.03–0.07 |
| `water_fault_prob` | Sampled 0.01–0.03 |
| `co2_spike_prob` | Sampled 0.02–0.05 |
| `crop_defaults` | KB per-crop maturity + water rates |
| `kcal_per_kg` | KB per-crop caloric values |
| `shelf_life_days` | KB per-crop shelf lives |

### Crop Health Scoring

Health is a weighted combination of four stress factors (each 0.0–1.0):

```
health = water_stress×0.35 + nutrient_stress×0.20 + light_stress×0.25 + env_stress×0.20
```

Each stress factor uses `_stress_factor(value, optimal_low, optimal_high)` which returns 1.0 inside the optimal band and degrades linearly toward hard limits.

Cumulative health is a running average: `(prev_cumulative × (age-1) + daily_health) / age`

---

## Specialist Agents

All specialists follow the same pattern:
- Created via a `create_<name>()` factory function
- Use Bedrock Nova Micro
- Have access to `get_current_state` and `search_mars_kb`
- Return structured (JSON-like) text to reduce parsing ambiguity
- Do not mutate state directly — they report recommendations; the orchestrator acts on them

### Extending: Adding a New Specialist

1. Create `agents/<new_agent>.py` with a `create_<new_agent>()` factory
2. Register it in `_get_agent(name)` in `orchestrator.py`
3. Add a `@tool` function `delegate_to_<new_agent>(task: str) -> str`
4. Include the new tool in the `get_orchestrator()` tool list
5. Keep outputs structured so the orchestrator can parse them reliably

---

## Agent Log Flow

Each delegation writes to state immediately:

```python
result = str(_lazy("crop_planner")(task))
_append_agent_log("crop_planner", task, result)  # writes to DynamoDB mid-run
```

This means the frontend sees sub-agent results as they complete (within the next 400 ms poll), not only after the full orchestrator run finishes.
