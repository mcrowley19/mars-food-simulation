from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import traceback

from state import get_state, update_state
from simulation import apply_mars_rules
from infrastructure.dynamo_setup import INITIAL_STATE

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PromptRequest(BaseModel):
    prompt: str

<<<<<<< HEAD

@app.post("/invoke")
def invoke_agent(req: PromptRequest):
    client = boto3.client("bedrock-agentcore-runtime", region_name="us-west-2")
    response = client.invoke_agent_runtime(
        agentRuntimeArn="<your-arn>",
        payload=json.dumps({"prompt": req.prompt})
    )
    return {"response": response["body"]}


@app.get("/state")
def read_state():
    return get_state()


@app.post("/simulate-tick")
def simulate_tick():
    state = get_state()
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

    # Call orchestrator
    from agents.orchestrator import orchestrator
    result = orchestrator(context)
    state["agent_last_actions"]["orchestrator"] = str(result)

    update_state(state)
    return state


@app.post("/reset")
def reset_state():
    import copy
    fresh = copy.deepcopy(INITIAL_STATE)
    update_state(fresh)
    return fresh
=======
@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/invoke")
def invoke_agent(req: PromptRequest):
    try:
        from agents.orchestrator import run_orchestrator
        result = run_orchestrator(req.prompt)
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
>>>>>>> bfce8f0a282bdb54838a3630e78813159e9317fb
