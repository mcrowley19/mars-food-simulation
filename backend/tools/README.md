# Tools

Agent-callable tools used by the orchestrator and specialist agents. All tools are decorated with `@tool` from the Strands framework and return readable strings to the calling LLM.

---

## File Map

| File | Responsibility |
|---|---|
| `simulation_tools.py` | State read/write tools for crops, environment, resources, and alerts |
| `greenhouse_tools.py` | Mars knowledge-base search tool |
| `mcp_client.py` | MCP HTTP client factory for the Bedrock AgentCore KB gateway |

---

## `simulation_tools.py`

Direct simulation mutation tools available to the orchestrator. All tools derive the current session from the request context (`_SESSION_KEY_CTX`) so they are automatically session-scoped.

| Tool | Signature | Description |
|---|---|---|
| `get_current_state` | `() → str` | Returns full simulation state as formatted text |
| `harvest_crop` | `(crop_index: int) → str` | Harvests a mature crop; returns yield and seed gain |
| `replant_crop` | `(crop_index: int, new_crop_name: str) → str` | Replaces a crop slot with a new seedling |
| `plant_from_reserve` | `(crop_name: str, count: int) → str` | Plants seeds from the reserve into available slots |
| `adjust_water_allocation` | `(crop_index: int, new_water_per_day_l: float) → str` | Changes daily water use for one crop |
| `adjust_nutrient_allocation` | `(crop_index: int, new_nutrient_per_day_kg: float) → str` | Changes daily nutrient use for one crop |
| `set_environment_param` | `(param: str, value: float) → str` | Sets temp_c, co2_ppm, humidity_pct, light_hours, or light_intensity |
| `add_alert` | `(severity: str, message: str) → str` | Appends a crew alert to the state |

### Design Notes

- Tools validate crop indices before use and return descriptive error strings if the index is out of range — the agent can read the error and retry with a corrected index
- `get_current_state` is the only read tool; all others mutate state and persist to DynamoDB immediately
- `plant_from_reserve` checks floor space and seed availability, and enforces a stagger rule (will not plant a new batch if seedlings of that type were planted within the last 3 days)

---

## `greenhouse_tools.py`

```python
@tool
def search_mars_kb(query: str, max_results: int = 5) -> str
```

Queries the Mars agricultural knowledge base via the MCP server. The KB contains crop biology data, optimal growing conditions, nutritional information, astronaut requirements, and mission protocols.

Used by:
- `agents/simulator.py` — to fetch KB-informed simulation parameters once per session
- `setup_modes.py` — to enrich crop tables at first use
- All specialist agents — to answer specific crop/environment questions mid-mission

Returns the KB response text, which is then parsed by the caller for specific values.

---

## `mcp_client.py`

```python
MARS_KB_URL = "https://kb-start-hack-gateway-buyjtibfpg.gateway.bedrock-agentcore.us-east-2.amazonaws.com/mcp"

def get_mars_kb_client() -> MCPClient
```

Thin factory returning a Strands `MCPClient` connected to the Bedrock AgentCore MCP gateway. The client uses `streamablehttp_client` for HTTP-based MCP transport.

To change the KB endpoint, update `MARS_KB_URL` here — nothing else needs to change.

---

## Adding a New Tool

1. Define the function in `simulation_tools.py` (or a new file) with `@tool` decorator
2. Add it to the `tools=[...]` list in `agents/orchestrator.py` → `get_orchestrator()`
3. If it mutates state, use `get_state()` / `update_state()` and let `_SESSION_KEY_CTX` handle session scoping automatically
4. Keep the return value a human-readable string — the LLM reads it to decide next steps
