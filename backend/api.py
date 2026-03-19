from contextlib import asynccontextmanager
from contextlib import contextmanager
import threading
import re
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import traceback

from state import (
    get_state, update_state, normalize_session_key,
    set_request_session, reset_request_session,
)
from simulation import apply_mars_rules

_lock_registry = {}
_lock_registry_guard = threading.Lock()


def _get_invoke_lock(session_key: str) -> threading.Lock:
    with _lock_registry_guard:
        lock = _lock_registry.get(session_key)
        if lock is None:
            lock = threading.Lock()
            _lock_registry[session_key] = lock
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
    lines = [ln.strip() for ln in text.split("\n")]
    out = []
    for ln in lines:
        if not ln:
            continue
        cleaned = re.sub(r"^\s*[-*#>\d\.\)\(]+\s*", "", ln).strip()
        if cleaned:
            out.append(cleaned)
    if not out and text.strip():
        out = [text.strip()]
    return out


def _build_parsed_agent_logs(state: dict) -> dict:
    raw_logs = state.get("agent_logs") if isinstance(state.get("agent_logs"), dict) else {}
    parsed = {}
    for agent_name, entries in raw_logs.items():
        if not isinstance(entries, list):
            continue
        parsed_entries = []
        for entry in entries[-30:]:
            if not isinstance(entry, dict):
                continue
            parsed_entries.append({
                "day": entry.get("day"),
                "task_lines": _parse_text_lines(entry.get("task", "")),
                "response_lines": _parse_text_lines(entry.get("response", "")),
            })
        if parsed_entries:
            parsed[agent_name] = parsed_entries

    if not parsed:
        last_actions = state.get("agent_last_actions", {})
        if isinstance(last_actions, dict):
            for agent_name, action in last_actions.items():
                if not action:
                    continue
                parsed[agent_name] = [{
                    "day": state.get("mission_day"),
                    "task_lines": [],
                    "response_lines": _parse_text_lines(action),
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
        }
    except Exception:
        return {"setup_complete": False, "setup_mode": None, "mission_day": 1}


@app.post("/invoke")
def invoke_agent(req: PromptRequest, x_session_id: str | None = Header(default=None, alias="x-session-id")):
    session_key = normalize_session_key(x_session_id)
    lock = _get_invoke_lock(session_key)
    if not lock.acquire(blocking=False):
        msg = "Agent is already running — skipping duplicate invocation."
        _append_state_agent_log(session_key, "orchestrator", req.prompt, msg)
        return {"response": msg}
    try:
        with _session_context(session_key):
            from agents.orchestrator import get_orchestrator
            orchestrator = get_orchestrator()
            result = orchestrator(req.prompt)
            _append_state_agent_log(session_key, "orchestrator", req.prompt, str(result))
            return {"response": str(result)}
    except Exception as e:
        message = str(e)
        if "AccessDeniedException" in message or "explicit deny" in message:
            blocked_msg = (
                "Agent invocation is currently blocked by AWS IAM policy "
                "(explicit deny on Bedrock model invocation)."
            )
            _append_state_agent_log(session_key, "orchestrator", req.prompt, blocked_msg)
            return {"response": blocked_msg}
        _append_state_agent_log(session_key, "orchestrator", req.prompt, f"Invocation error: {message}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=message)
    finally:
        lock.release()


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


@app.post("/setup/ai-optimised")
def setup_ai_optimised(x_session_id: str | None = Header(default=None, alias="x-session-id")):
    session_key = normalize_session_key(x_session_id)
    try:
        from setup_modes import ai_optimised_setup
        state = ai_optimised_setup()
        state["setup_complete"] = True
        update_state(state, session_key=session_key)
        return state
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/simulate-tick")
def simulate_tick(x_session_id: str | None = Header(default=None, alias="x-session-id")):
    session_key = normalize_session_key(x_session_id)
    state = get_state(session_key=session_key)

    if not state.get("setup_complete"):
        raise HTTPException(status_code=400, detail="Setup not complete")

    state = apply_mars_rules(state)
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

                context = (
                    f"Mission day {s['mission_day']}. "
                    f"Environment: {env['temp_c']}°C, {env['co2_ppm']}ppm CO2, "
                    f"{env['humidity_pct']}% humidity, {env['light_hours']}h light at {env['light_intensity']}x intensity. "
                    f"Resources: {res['water_l']:.1f}L water, {res['nutrients_kg']:.1f}kg nutrients. "
                    f"Crops: {crop_summary}. "
                    f"Active events: {', '.join(events) if events else 'none'}. "
                    f"Alerts: {len(s['alerts'])} total. "
                    "Assess the situation. Take any necessary actions."
                )

                from agents.orchestrator import get_orchestrator
                orchestrator = get_orchestrator()
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

    if lock.acquire(blocking=False):
        threading.Thread(target=_run_agent, daemon=True).start()

    return _state_with_parsed_logs(state)


@app.post("/reset")
def reset_state(x_session_id: str | None = Header(default=None, alias="x-session-id")):
    session_key = normalize_session_key(x_session_id)
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
