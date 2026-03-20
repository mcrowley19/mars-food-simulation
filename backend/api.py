from contextlib import asynccontextmanager
from contextlib import contextmanager
import threading
import re
import json
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import traceback

from state import (
    get_state, update_state, normalize_session_key,
    set_request_session, reset_request_session,
)
from agents.simulator import run_simulation_tick, clear_kb_params_cache

_lock_registry = {}
_lock_registry_guard = threading.Lock()
_ai_setup_registry = {}
_ai_setup_registry_guard = threading.Lock()
_orchestrator_call_lock = threading.Lock()
# Orchestrator = Bedrock + optional sub-agents. Simulation still advances every tick; this only throttles LLM runs.
_ORCHESTRATOR_MISSION_DAY_INTERVAL = 1  # every sol; increase to throttle LLM / agent log volume
_MAX_PARSED_LOG_ENTRIES_PER_AGENT = 48
_MAX_PARSED_LINES_PER_TASK = 3
_MAX_PARSED_LINES_PER_RESPONSE = 18
_MAX_LINE_LENGTH = 280

_AGENT_PRIORITY_KEYS = {
    "resource_manager": [
        "resource_type",
        "current_level",
        "unit",
        "consumption_rate",
        "days_remaining",
        "status",
        "recommended_action",
    ],
    "env_monitor": [
        "parameter",
        "current_value",
        "safe_range",
        "severity",
        "recommended_action",
    ],
    "crop_planner": [
        "crop_name",
        "planting_date",
        "harvest_date",
        "expected_yield_kg",
        "key_nutrients",
    ],
    "harvest_optimizer": [
        "crop_name",
        "harvest_date",
        "expected_yield_kg",
        "replant_date",
        "priority",
        "rationale",
    ],
    "fault_handler": [
        "fault_type",
        "severity",
        "affected_systems",
        "affected_crops",
        "immediate_actions",
        "estimated_repair_time_hours",
        "escalate",
        "rationale",
    ],
}


def _get_invoke_lock(session_key: str) -> threading.Lock:
    with _lock_registry_guard:
        lock = _lock_registry.get(session_key)
        if lock is None:
            lock = threading.Lock()
            _lock_registry[session_key] = lock
        return lock


def _get_ai_setup_lock(session_key: str) -> threading.Lock:
    with _ai_setup_registry_guard:
        lock = _ai_setup_registry.get(session_key)
        if lock is None:
            lock = threading.Lock()
            _ai_setup_registry[session_key] = lock
        return lock


def _append_state_agent_log(session_key: str, agent_name: str, task: str, response: str):
    state = get_state(session_key=session_key)
    logs = state.setdefault("agent_logs", {})
    entries = logs.setdefault(agent_name, [])
    entries.append({
        "day": state.get("mission_day"),
        "task": str(task or ""),
        "response": str(response or ""),
    })
    if len(entries) > 80:
        logs[agent_name] = entries[-80:]
    state.setdefault("agent_last_actions", {})
    state["agent_last_actions"][agent_name] = str(response or "")
    update_state(state, session_key=session_key)


def _parse_text_lines(raw: str) -> list[str]:
    text = str(raw or "").replace("\r", "\n")
    # Remove agent meta tags that are not user-facing content.
    text = re.sub(r"<thinking>[\s\S]*?</thinking>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"</?mission_report>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"</?[a-z_]+>", "", text, flags=re.IGNORECASE)
    lines = [ln.strip() for ln in text.split("\n")]
    out = []
    for ln in lines:
        if not ln:
            continue
        cleaned = re.sub(r"^\s*[-*#>\d\.\)\(]+\s*", "", ln).strip()
        # Drop noisy partial JSON structural lines.
        if cleaned in {"[", "]", "{", "}", ",", "[]", "{}"}:
            continue
        if re.fullmatch(r'["\']?[a-zA-Z0-9_]+["\']?\s*:\s*', cleaned):
            continue
        cleaned = cleaned.strip(",")
        cleaned = re.sub(r'^"([^"]+)"\s*:\s*"([^"]*)"$', r"\1: \2", cleaned)
        cleaned = re.sub(r'^"([^"]+)"\s*:\s*([0-9]+(?:\.[0-9]+)?)$', r"\1: \2", cleaned)
        if cleaned:
            out.append(cleaned)
    if not out and text.strip():
        out = [text.strip()]
    return out


def _try_parse_json_payload(raw: str):
    text = str(raw or "").strip()
    if not text:
        return None

    candidates = [text]

    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fenced_match:
        candidates.append(fenced_match.group(1).strip())

    obj_start = text.find("{")
    obj_end = text.rfind("}")
    if obj_start != -1 and obj_end > obj_start:
        candidates.append(text[obj_start:obj_end + 1].strip())

    arr_start = text.find("[")
    arr_end = text.rfind("]")
    if arr_start != -1 and arr_end > arr_start:
        candidates.append(text[arr_start:arr_end + 1].strip())

    for candidate in candidates:
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except Exception:
            continue
    return None


def _render_json_lines(value, indent: int = 0) -> list[str]:
    pad = " " * indent
    if isinstance(value, dict):
        lines = []
        for key, val in value.items():
            if isinstance(val, (dict, list)):
                lines.append(f"{pad}{key}:")
                lines.extend(_render_json_lines(val, indent + 2))
            else:
                lines.append(f"{pad}{key}: {val}")
        return lines
    if isinstance(value, list):
        lines = []
        for item in value:
            if isinstance(item, (dict, list)):
                lines.append(f"{pad}-")
                lines.extend(_render_json_lines(item, indent + 2))
            else:
                lines.append(f"{pad}- {item}")
        return lines
    return [f"{pad}{value}"]


def _truncate_line(text: str, max_len: int = _MAX_LINE_LENGTH) -> str:
    line = str(text or "").strip()
    if len(line) <= max_len:
        return line
    return f"{line[: max_len - 1].rstrip()}…"


def _clip_lines(lines: list[str], max_lines: int) -> list[str]:
    clean = [_truncate_line(ln) for ln in lines if str(ln).strip()]
    if len(clean) <= max_lines:
        return clean
    clipped = clean[:max_lines]
    clipped[-1] = f"{clipped[-1]} (+{len(clean) - max_lines} more)"
    return clipped


def _line_importance_score(line: str, agent_name: str = "") -> int:
    text = str(line or "").strip().lower()
    if not text:
        return -999

    score = 0
    if ":" in text:
        score += 2
    if len(text) >= 24:
        score += 1

    high_signal_keywords = (
        "status",
        "severity",
        "recommended_action",
        "immediate_actions",
        "fault",
        "alert",
        "warning",
        "critical",
        "days_remaining",
        "current_level",
        "consumption_rate",
        "parameter",
        "current_value",
        "safe_range",
        "yield",
        "harvest",
        "water",
        "nutrient",
        "co2",
        "humidity",
        "temp",
        "light",
        "priority",
        "rationale",
    )
    for key in high_signal_keywords:
        if key in text:
            score += 3

    if agent_name and agent_name in _AGENT_PRIORITY_KEYS:
        for key in _AGENT_PRIORITY_KEYS[agent_name]:
            if key in text:
                score += 2

    if text.startswith(("note:", "info:", "summary:")):
        score -= 1

    return score


def _select_important_lines(lines: list[str], max_lines: int, agent_name: str = "") -> list[str]:
    clean = [_truncate_line(ln) for ln in lines if str(ln).strip()]
    if len(clean) <= max_lines:
        return clean

    ranked = sorted(
        enumerate(clean),
        key=lambda item: (_line_importance_score(item[1], agent_name), -item[0]),
        reverse=True,
    )
    selected_idx = sorted(idx for idx, _ in ranked[:max_lines])
    selected = [clean[i] for i in selected_idx]
    if len(clean) > max_lines:
        selected[-1] = f"{selected[-1]} (+{len(clean) - max_lines} more)"
    return selected


def _format_priority_json(agent_name: str, parsed: dict) -> list[str]:
    keys = _AGENT_PRIORITY_KEYS.get(agent_name, [])
    if not keys:
        return []
    out = []
    for key in keys:
        if key not in parsed:
            continue
        val = parsed.get(key)
        if isinstance(val, list):
            compact = ", ".join(str(v) for v in val[:4])
            if len(val) > 4:
                compact = f"{compact}, +{len(val) - 4} more"
            out.append(f"{key}: {compact}")
        elif isinstance(val, dict):
            compact = ", ".join(f"{k}={v}" for k, v in list(val.items())[:4])
            if len(val) > 4:
                compact = f"{compact}, +{len(val) - 4} more"
            out.append(f"{key}: {compact}")
        else:
            out.append(f"{key}: {val}")
    return out


def _parse_readable_lines(raw: str, agent_name: str = "") -> list[str]:
    parsed = _try_parse_json_payload(raw)
    if parsed is not None:
        if isinstance(parsed, dict):
            priority_lines = _format_priority_json(agent_name, parsed)
            if priority_lines:
                return priority_lines
        lines = _render_json_lines(parsed)
        return [ln for ln in lines if ln.strip()]
    return _parse_text_lines(raw)


def _compact_key_value_lines(raw: str) -> list[str]:
    """
    Recover readable key/value pairs from partial JSON-like text fragments.
    Example input:
      [
      {
      "parameter": "light",
    Output:
      ['parameter: light']
    """
    out = []
    text = str(raw or "")
    for match in re.finditer(r'"?([a-zA-Z0-9_]+)"?\s*:\s*"([^"]*)"', text):
        key = match.group(1)
        val = match.group(2).strip()
        if key and val:
            out.append(f"{key}: {val}")
    for match in re.finditer(r'"?([a-zA-Z0-9_]+)"?\s*:\s*([0-9]+(?:\.[0-9]+)?)', text):
        key = match.group(1)
        val = match.group(2)
        line = f"{key}: {val}"
        if line not in out:
            out.append(line)
    return out


def _hide_log_from_frontend(agent_name: str, response: str) -> bool:
    if agent_name != "orchestrator":
        return False
    text = str(response or "").lower()
    hidden_markers = (
        "invocation error:",
        "agent is already processing a request. concurrent invocations are not supported.",
        "agent is already running — skipping duplicate invocation.",
        "background run error:",
    )
    return any(marker in text for marker in hidden_markers)


def _build_parsed_agent_logs(state: dict) -> dict:
    raw_logs = state.get("agent_logs") if isinstance(state.get("agent_logs"), dict) else {}
    parsed = {}
    for agent_name, entries in raw_logs.items():
        if not isinstance(entries, list):
            continue
        parsed_entries = []
        for entry in entries[-_MAX_PARSED_LOG_ENTRIES_PER_AGENT:]:
            if not isinstance(entry, dict):
                continue
            response = entry.get("response", "")
            if _hide_log_from_frontend(agent_name, response):
                continue
            task_lines = _clip_lines(
                _parse_readable_lines(entry.get("task", ""), agent_name),
                _MAX_PARSED_LINES_PER_TASK,
            )
            parsed_response_lines = _parse_readable_lines(response, agent_name)
            response_lines = _select_important_lines(
                parsed_response_lines,
                _MAX_PARSED_LINES_PER_RESPONSE,
                agent_name,
            )
            if not response_lines:
                response_lines = _select_important_lines(
                    _compact_key_value_lines(response),
                    _MAX_PARSED_LINES_PER_RESPONSE,
                    agent_name,
                )
            parsed_entries.append({
                "day": entry.get("day"),
                "task_lines": task_lines,
                "response_lines": response_lines,
            })
        if parsed_entries:
            parsed[agent_name] = parsed_entries

    if not parsed:
        last_actions = state.get("agent_last_actions", {})
        if isinstance(last_actions, dict):
            for agent_name, action in last_actions.items():
                if not action:
                    continue
                if _hide_log_from_frontend(agent_name, action):
                    continue
                parsed[agent_name] = [{
                    "day": state.get("mission_day"),
                    "task_lines": [],
                    "response_lines": _clip_lines(
                        _parse_readable_lines(action, agent_name),
                        _MAX_PARSED_LINES_PER_RESPONSE,
                    ),
                }]
    return parsed


def _state_with_parsed_logs(state: dict) -> dict:
    payload = dict(state)
    payload["agent_logs_parsed"] = _build_parsed_agent_logs(state)
    return payload


@contextmanager
def _session_context(session_key: str):
    token = set_request_session(session_key)
    try:
        yield
    finally:
        reset_request_session(token)


@asynccontextmanager
async def lifespan(app):
    # Sessions are isolated per user; no shared state to reset on startup.
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PromptRequest(BaseModel):
    prompt: str


class ManualSetupRequest(BaseModel):
    water_l: float
    fertilizer_kg: float
    soil_kg: float
    floor_space_m2: float
    mission_days: int
    astronaut_count: int
    seed_amounts: dict
    food_supplies_kcal: float = 0
    fuel_kg: float = 0


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/setup-status")
def setup_status(x_session_id: str | None = Header(default=None, alias="x-session-id")):
    session_key = normalize_session_key(x_session_id)
    try:
        state = get_state(session_key=session_key)
        return {
            "setup_complete": state.get("setup_complete", False),
            "setup_mode": state.get("setup_mode"),
            "mission_day": state.get("mission_day", 1),
            "ai_setup_in_progress": state.get("ai_setup_in_progress", False),
            "ai_setup_error": state.get("ai_setup_error"),
        }
    except Exception:
        return {
            "setup_complete": False,
            "setup_mode": None,
            "mission_day": 1,
            "ai_setup_in_progress": False,
            "ai_setup_error": None,
        }


@app.post("/invoke")
def invoke_agent(req: PromptRequest, x_session_id: str | None = Header(default=None, alias="x-session-id")):
    session_key = normalize_session_key(x_session_id)
    lock = _get_invoke_lock(session_key)
    if not lock.acquire(blocking=False):
        return {"response": "Agent is already running — skipping duplicate invocation."}

    def _run():
        try:
            with _session_context(session_key):
                from agents.orchestrator import get_orchestrator
                orchestrator = get_orchestrator()
                with _orchestrator_call_lock:
                    result = orchestrator(req.prompt)
                _append_state_agent_log(session_key, "orchestrator", req.prompt, str(result))
        except Exception as e:
            message = str(e)
            if "AccessDeniedException" in message or "explicit deny" in message:
                message = "Agent invocation blocked by AWS IAM policy."
            _append_state_agent_log(session_key, "orchestrator", req.prompt, f"Invocation error: {message}")
            traceback.print_exc()
        finally:
            lock.release()

    threading.Thread(target=_run, daemon=True).start()
    # Mark agents as initialised immediately so the loading screen clears
    # while the agent works in the background.
    try:
        s = get_state(session_key=session_key)
        s["agents_initialised"] = True
        update_state(s, session_key=session_key)
    except Exception:
        pass
    return {"response": "Agent invocation started."}


@app.get("/state")
def read_state(x_session_id: str | None = Header(default=None, alias="x-session-id")):
    session_key = normalize_session_key(x_session_id)
    state = get_state(session_key=session_key)
    return _state_with_parsed_logs(state)


@app.post("/setup/manual")
def setup_manual(req: ManualSetupRequest, x_session_id: str | None = Header(default=None, alias="x-session-id")):
    session_key = normalize_session_key(x_session_id)
    try:
        from setup_modes import manual_setup
        state = manual_setup(req.model_dump())
        state["setup_mode"] = "manual"
        state["setup_complete"] = True
        update_state(state, session_key=session_key)
        return state
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class AISetupRequest(BaseModel):
    astronaut_count: int = 4
    mission_days: int = 450
    max_cargo_kg: float = 50000


@app.post("/setup/ai-optimised")
def setup_ai_optimised(
    body: AISetupRequest = AISetupRequest(),
    x_session_id: str | None = Header(default=None, alias="x-session-id"),
):
    session_key = normalize_session_key(x_session_id)
    current = get_state(session_key=session_key)

    if current.get("setup_complete") and current.get("setup_mode") == "ai_optimised":
        return {"status": "ready"}

    if current.get("ai_setup_in_progress"):
        # If stuck for over 4 minutes, reset so user can retry
        import time
        started_at = current.get("ai_setup_started_at", 0)
        if time.time() - started_at > 240:
            current["ai_setup_in_progress"] = False
            current["ai_setup_error"] = "Previous AI setup timed out."
            update_state(current, session_key=session_key)
        else:
            return {"status": "in_progress"}

    lock = _get_ai_setup_lock(session_key)
    if not lock.acquire(blocking=False):
        return {"status": "in_progress"}

    import time as _time
    current["ai_setup_in_progress"] = True
    current["ai_setup_error"] = None
    current["ai_setup_started_at"] = _time.time()
    update_state(current, session_key=session_key)

    ai_params = {
        "astronaut_count": body.astronaut_count,
        "mission_days": body.mission_days,
        "max_cargo_kg": body.max_cargo_kg,
    }

    def _run_ai_setup():
        try:
            with _session_context(session_key):
                from setup_modes import ai_optimised_setup
                state = ai_optimised_setup(**ai_params)
                state["setup_complete"] = True
                state["setup_mode"] = "ai_optimised"
                state["ai_setup_in_progress"] = False
                state["ai_setup_error"] = None
                update_state(state, session_key=session_key)
        except Exception as e:
            s = get_state(session_key=session_key)
            s["ai_setup_in_progress"] = False
            s["ai_setup_error"] = str(e)
            update_state(s, session_key=session_key)
        finally:
            lock.release()

    threading.Thread(target=_run_ai_setup, daemon=True).start()
    return {"status": "started"}


@app.post("/simulate-tick")
def simulate_tick(x_session_id: str | None = Header(default=None, alias="x-session-id")):
    session_key = normalize_session_key(x_session_id)
    state = get_state(session_key=session_key)

    if not state.get("setup_complete"):
        raise HTTPException(status_code=400, detail="Setup not complete")

    state = run_simulation_tick(state)
    update_state(state, session_key=session_key)

    lock = _get_invoke_lock(session_key)

    # Invoke agent in background if not already running
    def _run_agent():
        context = ""
        try:
            with _session_context(session_key):
                s = get_state(session_key=session_key)
                env = s["environment"]
                res = s["resources"]
                events = s["active_events"]
                crop_summary = ", ".join(
                    f"{c['name']} (day {c.get('age_days', '?')}/{c.get('maturity_days', '?')}, {c.get('status', 'growing')})"
                    for c in s["crops"]
                ) or "No crops planted"

                reserve = s.get("seed_reserve", {})
                reserve_summary = ", ".join(f"{k}: {v}" for k, v in reserve.items()) if reserve else "empty"
                cal_avail = s.get("calories_available", 0)
                cal_need = s.get("calories_needed_per_day", 0)
                cal_days = round(cal_avail / cal_need, 1) if cal_need > 0 else 0
                mission_days = s.get("mission_days", 450)
                days_left = max(0, mission_days - s["mission_day"])
                fuel_kg = res.get("fuel_kg", 0)
                fuel_per_day = s.get("fuel_used_today", 0)
                fuel_days = round(fuel_kg / fuel_per_day, 1) if fuel_per_day > 0 else 999

                # Compute daily water consumption for urgency signals
                crop_water_day = sum(c.get("water_per_day_l", 0) for c in s["crops"])
                net_crew_water = 10 * (1 - 0.85)  # 10L crew use, 85% recycled
                total_water_day = crop_water_day + net_crew_water
                water_days = round(res["water_l"] / total_water_day, 1) if total_water_day > 0 else 999

                # Build urgency warnings
                warnings = []
                if water_days < days_left * 0.5:
                    warnings.append(
                        f"WATER CRITICAL: Only {water_days} days of water remain but {days_left} days left in mission. "
                        f"Current draw: {total_water_day:.1f}L/day ({crop_water_day:.1f}L crops + {net_crew_water:.1f}L crew). "
                        "REDUCE CROP COUNT IMMEDIATELY — remove water-hungry crops or stop planting new ones."
                    )
                elif water_days < days_left:
                    warnings.append(
                        f"WATER WARNING: {water_days} days of water for {days_left} remaining mission days. "
                        "Conserve water — avoid planting water-heavy crops, prefer low-water options."
                    )
                if fuel_days < days_left:
                    warnings.append(
                        f"FUEL WARNING: {fuel_days} days of fuel for {days_left} remaining mission days. "
                        "Reduce light hours if possible via set_environment_param."
                    )
                if cal_days < 10:
                    warnings.append(
                        f"CALORIE EMERGENCY: Only {cal_days} days of food! Plant fast-growing crops urgently."
                    )

                warning_block = " ".join(warnings) if warnings else ""

                context = (
                    f"Mission day {s['mission_day']} of {mission_days} ({days_left} days remaining). "
                    f"Environment: {env['temp_c']}°C, {env['co2_ppm']}ppm CO2, "
                    f"{env['humidity_pct']}% humidity, {env['light_hours']}h light at {env['light_intensity']}x intensity. "
                    f"Resources: {res['water_l']:.1f}L water ({water_days} days remaining at {total_water_day:.1f}L/day), "
                    f"{res['nutrients_kg']:.1f}kg nutrients, {fuel_kg:.0f}kg fuel ({fuel_days} days remaining). "
                    f"Crops: {crop_summary}. "
                    f"Seed reserve: {reserve_summary}. "
                    f"Calories: {cal_avail:.0f} kcal available ({cal_days} days of food remaining at {cal_need} kcal/day). "
                    f"Active events: {', '.join(events) if events else 'none'}. "
                    f"Alerts: {len(s['alerts'])} total. "
                    f"{warning_block} "
                    "PRIORITY: Ensure water, fuel and calories last the entire mission. "
                    "If any resource will run out before mission end, take corrective action NOW — "
                    "reduce crop count, lower light hours, or stop planting. "
                    "If resources are healthy and seed reserve is available, plant in staggered batches "
                    "for continuous harvests. Remember food rots — spread plantings over time."
                )

                from agents.orchestrator import get_orchestrator
                orchestrator = get_orchestrator()
                with _orchestrator_call_lock:
                    result = orchestrator(context)
                _append_state_agent_log(session_key, "orchestrator", context, str(result))
        except Exception as e:
            err_text = str(e)
            if "AccessDeniedException" in err_text or "explicit deny" in err_text:
                err_text = (
                    "Background orchestrator run blocked by AWS IAM policy "
                    "(explicit deny on Bedrock model invocation)."
                )
            _append_state_agent_log(
                session_key,
                "orchestrator",
                context,
                f"Background run error: {err_text}",
            )
            traceback.print_exc()
        finally:
            lock.release()

    mission_day = state.get("mission_day", 0)
    run_orchestrator = (
        _ORCHESTRATOR_MISSION_DAY_INTERVAL <= 1
        or mission_day % _ORCHESTRATOR_MISSION_DAY_INTERVAL == 0
    )
    if run_orchestrator and lock.acquire(blocking=False):
        threading.Thread(target=_run_agent, daemon=True).start()

    return _state_with_parsed_logs(state)



@app.post("/reset")
def reset_state(x_session_id: str | None = Header(default=None, alias="x-session-id")):
    session_key = normalize_session_key(x_session_id)
    clear_kb_params_cache(session_key)
    from setup_modes import _blank_state
    fresh = _blank_state()
    update_state(fresh, session_key=session_key)
    return fresh


# Lambda handler for API Gateway deployment
try:
    from mangum import Mangum
    lambda_handler = Mangum(app)
except ImportError:
    # Local dev does not require Mangum; keep API importable for uvicorn.
    lambda_handler = None
