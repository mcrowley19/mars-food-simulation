from strands import Agent, tool
from agents.crop_planner import create_crop_planner
from agents.env_monitor import create_env_monitor
from agents.resource_manager import create_resource_manager

crop_planner = create_crop_planner()
env_monitor = create_env_monitor()
resource_manager = create_resource_manager()

@tool
def delegate_to_crop_planner(task: str) -> str:
    """Delegate a crop planning or scheduling task."""
    return str(crop_planner(task))

@tool
def delegate_to_env_monitor(task: str) -> str:
    """Delegate an environment monitoring or adjustment task."""
    return str(env_monitor(task))

@tool
def delegate_to_resource_manager(task: str) -> str:
    """Delegate a water or nutrient management task."""
    return str(resource_manager(task))

orchestrator = Agent(
    system_prompt="""You are the Mission Orchestrator for a Martian greenhouse.
    Coordinate specialist agents to manage a 450-day crop mission for 4 astronauts.
    Delegate tasks to the right specialist and synthesize their outputs into
    clear mission reports.""",
    tools=[delegate_to_crop_planner, delegate_to_env_monitor, delegate_to_resource_manager]
)