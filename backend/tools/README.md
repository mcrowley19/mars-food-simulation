# Tools README

The `tools/` package contains agent-callable tools used by orchestrator and specialists.

## Important Files

| File | Responsibility |
|---|---|
| `simulation_tools.py` | state read/write tools for crop, environment, resource, and alert operations |
| `greenhouse_tools.py` | Mars knowledge-base search tool wrapper |
| `mcp_client.py` | MCP HTTP client factory pointing to Mars KB gateway |

## `simulation_tools.py` at a glance

Primary callable tools:

- `get_current_state()`
- `harvest_crop(crop_index)`
- `replant_crop(crop_index, new_crop_name)`
- `adjust_water_allocation(crop_index, new_water_per_day_l)`
- `adjust_nutrient_allocation(crop_index, new_nutrient_per_day_kg)`
- `set_environment_param(param, value)`
- `add_alert(severity, message)`

Design notes:

- tools return readable status strings to the calling agent
- crop index validation is centralized in helper functions
- session identity is derived from request context (`_SESSION_KEY_CTX`)

## `greenhouse_tools.py` + `mcp_client.py`

- `search_mars_kb(query, max_results)` performs synchronous MCP tool calls.
- `get_mars_kb_client()` encapsulates connection details to the Bedrock AgentCore gateway endpoint.

## Editing Guidance

- Add new simulation tool in `simulation_tools.py` and include it in orchestrator tool list.
- Keep tool contracts deterministic; avoid hidden state transitions outside `state.py`.
- If KB endpoint changes, update only `MARS_KB_URL` in `mcp_client.py`.
