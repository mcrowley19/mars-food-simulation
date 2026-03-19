# Agents README

The `agents/` package defines the multi-agent decision layer for the Mars greenhouse mission.

## Agent Topology

- `orchestrator.py` is the entrypoint agent.
- Specialist agents are lazy-loaded and invoked through orchestrator delegation tools.
- Each specialist can query:
  - simulation state (`get_current_state`)
  - Mars KB (`search_mars_kb`)

## Important Files

| File | Role |
|---|---|
| `orchestrator.py` | central coordinator; delegates work and now records per-agent logs |
| `crop_planner.py` | crop selection + scheduling strategy |
| `env_monitor.py` | environment health checks + recommended parameter changes |
| `resource_manager.py` | water/nutrient consumption optimization |
| `harvest_optimizer.py` | harvest timing and replant cadence decisions |
| `fault_handler.py` | degraded-mode and failure response triage |

## Orchestrator Responsibilities

`orchestrator.py` does the heavy lifting:

- lazy-loads specialist agent instances
- exposes delegation tools (`delegate_to_*`) for the model
- exposes direct simulation mutation tools (harvest/replant/environment controls)
- records each delegated interaction in state under `agent_logs[agent_name]`
- updates `agent_last_actions` for latest per-agent status

## Editing Guide

- Add a new specialist:
  1. create `agents/<new_agent>.py`
  2. register it in `_get_agent(...)`
  3. add a new `delegate_to_<new_agent>(task: str)` tool
  4. include that tool in `get_orchestrator()` tool list
- Keep outputs structured (JSON-like) to reduce parsing ambiguity downstream.
- Avoid tool side effects in specialists; state mutation should remain explicit through simulation tools.
