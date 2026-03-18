from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import traceback

from state import get_state, update_state
from simulation import apply_mars_rules


@asynccontextmanager
async def lifespan(app):
    # On startup: reset any leftover state so user always starts fresh
    try:
        state = get_state()
        if state.get("setup_complete"):
            from setup_modes import _blank_state
            update_state(_blank_state())
    except Exception:
        pass  # Table may not exist yet
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
def setup_status():
    try:
        state = get_state()
        return {
            "setup_complete": state.get("setup_complete", False),
            "setup_mode": state.get("setup_mode"),
            "mission_day": state.get("mission_day", 1),
        }
    except Exception:
        return {"setup_complete": False, "setup_mode": None, "mission_day": 1}


@app.post("/invoke")
def invoke_agent(req: PromptRequest):
    try:
        from agents.orchestrator import get_orchestrator
        orchestrator = get_orchestrator()
        result = orchestrator(req.prompt)
        return {"response": str(result)}
    except Exception as e:
        message = str(e)
        if "AccessDeniedException" in message or "explicit deny" in message:
            return {
                "response": (
                    "Agent invocation is currently blocked by AWS IAM policy "
                    "(explicit deny on Bedrock model invocation)."
                )
            }
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=message)


@app.get("/state")
def read_state():
    return get_state()


@app.post("/setup/manual")
def setup_manual(req: ManualSetupRequest):
    try:
        from setup_modes import manual_setup
        state = manual_setup(req.model_dump())
        state["setup_mode"] = "manual"
        state["setup_complete"] = True
        update_state(state)
        return state
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/setup/ai-optimised")
def setup_ai_optimised():
    try:
        from setup_modes import ai_optimised_setup
        state = ai_optimised_setup()
        state["setup_complete"] = True
        update_state(state)
        return state
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/simulate-tick")
def simulate_tick():
    state = get_state()

    if not state.get("setup_complete"):
        raise HTTPException(status_code=400, detail="Setup not complete")

    state = apply_mars_rules(state)

    # Build context summary for the orchestrator
    env = state["environment"]
    res = state["resources"]
    events = state["active_events"]
    crop_summary = ", ".join(
        f"{c['name']} (day {c.get('age_days', '?')}/{c.get('maturity_days', '?')}, {c.get('status', 'growing')})"
        for c in state["crops"]
    ) or "No crops planted"

    context = (
        f"Mission day {state['mission_day']}. "
        f"Environment: {env['temp_c']}°C, {env['co2_ppm']}ppm CO2, "
        f"{env['humidity_pct']}% humidity, {env['light_hours']}h light at {env['light_intensity']}x intensity. "
        f"Resources: {res['water_l']:.1f}L water, {res['nutrients_kg']:.1f}kg nutrients. "
        f"Crops: {crop_summary}. "
        f"Active events: {', '.join(events) if events else 'none'}. "
        f"Alerts: {len(state['alerts'])} total. "
        "Assess the situation. Take any necessary actions."
    )

    from agents.orchestrator import get_orchestrator
    orchestrator = get_orchestrator()
    result = orchestrator(context)
    state["agent_last_actions"]["orchestrator"] = str(result)

    update_state(state)
    return state


@app.post("/reset")
def reset_state():
    from setup_modes import _blank_state
    fresh = _blank_state()
    update_state(fresh)
    return fresh
