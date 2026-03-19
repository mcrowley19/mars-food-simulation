from strands import Agent, tool
from strands.models.bedrock import BedrockModel
from state import get_state, update_state
from tools.simulation_tools import (
    get_current_state,
    harvest_crop,
    replant_crop,
    plant_from_reserve,
    adjust_water_allocation,
    adjust_nutrient_allocation,
    set_environment_param,
    add_alert,
)

_orchestrator = None
_MAX_AGENT_LOGS = 80


def _get_agent(name):
    """Lazy-load a sub-agent only when first needed."""
    if name == "crop_planner":
        from agents.crop_planner import create_crop_planner
        return create_crop_planner()
    elif name == "env_monitor":
        from agents.env_monitor import create_env_monitor
        return create_env_monitor()
    elif name == "resource_manager":
        from agents.resource_manager import create_resource_manager
        return create_resource_manager()
    elif name == "harvest_optimizer":
        from agents.harvest_optimizer import create_harvest_optimizer
        return create_harvest_optimizer()
    elif name == "fault_handler":
        from agents.fault_handler import create_fault_handler
        return create_fault_handler()


_agents = {}


def _lazy(name):
    if name not in _agents:
        _agents[name] = _get_agent(name)
    return _agents[name]


def _append_agent_log(agent_name: str, task: str, response: str):
    """Persist per-agent logs in state for frontend tab rendering."""
    try:
        state = get_state()
        logs = state.setdefault("agent_logs", {})
        entries = logs.setdefault(agent_name, [])
        entries.append({
            "day": state.get("mission_day"),
            "task": str(task or ""),
            "response": str(response or ""),
        })
        if len(entries) > _MAX_AGENT_LOGS:
            logs[agent_name] = entries[-_MAX_AGENT_LOGS:]
        state.setdefault("agent_last_actions", {})
        state["agent_last_actions"][agent_name] = str(response or "")
        update_state(state)
    except Exception:
        # Logging should never block orchestration flow.
        return


@tool
def delegate_to_crop_planner(task: str) -> str:
    """Delegate a crop planning or scheduling task."""
    result = str(_lazy("crop_planner")(task))
    _append_agent_log("crop_planner", task, result)
    return result


@tool
def delegate_to_env_monitor(task: str) -> str:
    """Delegate an environment monitoring or adjustment task."""
    result = str(_lazy("env_monitor")(task))
    _append_agent_log("env_monitor", task, result)
    return result


@tool
def delegate_to_resource_manager(task: str) -> str:
    """Delegate a water or nutrient management task."""
    result = str(_lazy("resource_manager")(task))
    _append_agent_log("resource_manager", task, result)
    return result


@tool
def delegate_to_harvest_optimizer(task: str) -> str:
    """Delegate a harvest timing or scheduling optimization task."""
    result = str(_lazy("harvest_optimizer")(task))
    _append_agent_log("harvest_optimizer", task, result)
    return result


@tool
def delegate_to_fault_handler(task: str) -> str:
    """Delegate a system failure, equipment issue, or emergency response task."""
    result = str(_lazy("fault_handler")(task))
    _append_agent_log("fault_handler", task, result)
    return result


def get_orchestrator():
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = Agent(
            model=BedrockModel(model_id="us.anthropic.claude-3-7-sonnet-20250219-v1:0", region_name="us-east-1"),
            system_prompt="""You are the Mission Orchestrator for a Martian greenhouse.
    Coordinate specialist agents to manage a 450-day crop mission for 4 astronauts.
    Delegate tasks to the right specialist and synthesize their outputs into
    clear mission reports.

    Available specialists:
    - Crop Planner: crop selection, planting schedules, nutritional coverage
    - Environment Monitor: temperature, CO2, humidity, lighting adjustments
    - Resource Manager: water and nutrient optimization, consumption tracking
    - Harvest Optimizer: harvest timing, replanting schedules, yield planning
    - Fault Handler: equipment failures, dust storms, emergency triage

    You also have direct tools to inspect and modify the greenhouse state:
    - get_current_state: read the full simulation state before making decisions
    - harvest_crop: harvest a mature crop by index
    - replant_crop: plant a new seedling in a crop slot
    - plant_from_reserve: plant seeds from the seed reserve (stagger plantings over time)
    - adjust_water_allocation / adjust_nutrient_allocation: tune per-crop resource usage
    - set_environment_param: adjust temp, CO2, humidity, or light hours
    - add_alert: record alerts for the crew

    CRITICAL RULES — SURVIVAL DEPENDS ON THESE:
    1. Always call get_current_state first to see exact crop indices and values
       before calling harvest_crop, replant_crop, or adjustment tools.
    2. RESOURCE CONSERVATION IS TOP PRIORITY. Water, fuel, and calories must
       last the ENTIRE mission. Every tick, check if resources will last:
       - Water: each crop uses water daily. If water days remaining < mission days remaining,
         you MUST reduce crop count. Remove the most water-hungry crops first.
         Prefer low-water crops (radish 0.15L/day, lettuce 0.2L/day) over
         high-water crops (tomato 0.6L/day, potato 0.5L/day).
       - Fuel: powers grow lights and life support. If fuel is running low,
         reduce light_hours via set_environment_param to conserve.
       - Calories: if food days < 10, plant fast-growing crops (radish 25d, lettuce 30d).
    3. FOOD ROTS: Each harvested crop has a shelf life. Do NOT plant all seeds
       at once — spread plantings so harvests are continuous.
       Shelf lives: lettuce 7d, pea 5d, kale 10d, tomato 14d, radish 14d,
       carrot 30d, potato 60d, soybean 120d, wheat 180d.
    4. Use plant_from_reserve ONLY when resources can support more crops.
       Before planting, calculate: will adding N crops cause water to run out
       before the mission ends? If yes, do NOT plant.
    5. When you see WARNING or CRITICAL messages about resources, act immediately.
       Reducing crop count saves water. Lowering light hours saves fuel.""",
            tools=[
                delegate_to_crop_planner,
                delegate_to_env_monitor,
                delegate_to_resource_manager,
                delegate_to_harvest_optimizer,
                delegate_to_fault_handler,
                get_current_state,
                harvest_crop,
                replant_crop,
                plant_from_reserve,
                adjust_water_allocation,
                adjust_nutrient_allocation,
                set_environment_param,
                add_alert,
            ]
        )
    return _orchestrator
