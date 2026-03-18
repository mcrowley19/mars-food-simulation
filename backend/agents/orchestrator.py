from strands import Agent, tool
from agents.crop_planner import create_crop_planner
from agents.env_monitor import create_env_monitor
from agents.resource_manager import create_resource_manager

_orchestrator_agent = None
_crop_planner = None
_env_monitor = None
_resource_manager = None


def _fallback_agent(role: str, reason: str) -> Agent:
    return Agent(
        system_prompt=f"""You are the {role} for a Martian greenhouse mission.
External knowledge tools are currently unavailable ({reason}).
Provide a conservative, best-effort recommendation using general agronomy principles.
Always return concise JSON-like structured output.""",
    )


def _safe_create(factory, role: str) -> Agent:
    try:
        return factory()
    except Exception as exc:  # noqa: BLE001
        return _fallback_agent(role, str(exc))


def _ensure_agents_initialized():
    global _orchestrator_agent, _crop_planner, _env_monitor, _resource_manager
    if _orchestrator_agent is not None:
        return

    _crop_planner = _safe_create(create_crop_planner, "Crop Planner")
    _env_monitor = _safe_create(create_env_monitor, "Environment Monitor")
    _resource_manager = _safe_create(create_resource_manager, "Resource Manager")

    @tool
    def delegate_to_crop_planner(task: str) -> str:
        """Delegate a crop planning or scheduling task."""
        return str(_crop_planner(task))

    @tool
    def delegate_to_env_monitor(task: str) -> str:
        """Delegate an environment monitoring or adjustment task."""
        return str(_env_monitor(task))

    @tool
    def delegate_to_resource_manager(task: str) -> str:
        """Delegate a water or nutrient management task."""
        return str(_resource_manager(task))

    _orchestrator_agent = Agent(
        system_prompt="""You are the Mission Orchestrator for a Martian greenhouse.
Coordinate specialist agents to manage a 450-day crop mission for 4 astronauts.
Delegate tasks to the right specialist and synthesize their outputs into
clear mission reports.""",
        tools=[
            delegate_to_crop_planner,
            delegate_to_env_monitor,
            delegate_to_resource_manager,
        ],
    )


def run_orchestrator(task: str) -> str:
    _ensure_agents_initialized()
    return str(_orchestrator_agent(task))